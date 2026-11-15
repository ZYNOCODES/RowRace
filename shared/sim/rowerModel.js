/**
 * Deterministic model of a person rowing on a PM5. Shared by the PC simulator and the
 * in-app mock so both produce the same data. No timers inside: the host calls
 * `step(dt)` and reads `snapshot()`.
 *
 * Stroke cycle (fraction of 60/spm): drive 35%, dwell 5%, recovery 60%.
 * Boat speed oscillates around the mean speed for the target pace (peak mid-drive,
 * slowest late recovery); the cosine averages to zero, so the mean pace matches the target.
 */
const physics = require('../physics');
const {
  StrokeState,
  RowingState,
  WorkoutState,
  WorkoutType,
  IntervalType,
} = require('../pm5/enums');
const { WorkoutDurationType, ErgMachineType } = require('../pm5/enums');

const DRIVE_FRACTION = 0.35;
const DWELL_FRACTION = 0.05;
const SPEED_SWING = 0.18; // ± fraction of mean speed over a stroke
const FLYWHEEL_TAU = 2.5; // s, spin-down time constant when the rower stops
const SPLIT_METERS = 500;
const LBF_PER_NEWTON = 1 / 4.44822;

/** Small seeded PRNG (mulberry32) so runs are reproducible. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {Object} RowerOptions
 * @property {number} [pace] target pace, s/500 m (default 125 = 2:05)
 * @property {number} [spm] stroke rate (default 24)
 * @property {number} [seed]
 * @property {boolean} [heartRateBelt] false → heart rate reported as invalid (null)
 * @property {number} [dragFactor]
 * @property {number} [ergMachineType]
 */

class RowerModel {
  /** @param {RowerOptions} [opts] */
  constructor(opts = {}) {
    this.targetPace = opts.pace ?? 125;
    this.spm = opts.spm ?? 24;
    this.heartRateBelt = opts.heartRateBelt ?? true;
    this.dragFactor = opts.dragFactor ?? 115;
    this.ergMachineType = opts.ergMachineType ?? ErgMachineType.STATIC_D;
    this.rand = prng(opts.seed ?? 42);
    // Two slow sinusoids give a "human" pace drift of about ±2 s without randomness per tick.
    this.drift = [0, 1].map(() => ({
      amp: 0.6 + this.rand() * 0.9,
      period: 25 + this.rand() * 40,
      phase: this.rand() * Math.PI * 2,
    }));
    this.rowing = false;
    this.clock = 0; // model time, s (never reset; drives the drift)
    this.reset();
    this.heartRate = 78;
  }

  /** PM5 "reset": everything the monitor shows goes back to zero. */
  reset() {
    this.elapsed = 0;
    this.distance = 0;
    this.speed = this.rowing ? physics.speedFromPace(this.targetPace) : 0;
    this.phase = 0;
    this.strokeCount = 0;
    this.calories = 0;
    this.workJoules = 0;
    this.lastStroke = null;
    this.lastStrokeAdditional = null;
    this.strokeStartDistance = 0;
    this.lastRecoveryTime = 0;
    this.recoveryStartedAt = null;
    this.splits = [];
    this.splitStart = { elapsed: 0, distance: 0, work: 0, calories: 0 };
    this.started = false;
  }

  setRowing(on) {
    this.rowing = !!on;
  }

  setPace(pace) {
    this.targetPace = Math.min(400, Math.max(60, pace));
  }

  setSpm(spm) {
    this.spm = Math.min(50, Math.max(10, spm));
  }

  /** Current mean pace including the slow drift. */
  currentMeanPace() {
    const d = this.drift.reduce(
      (s, w) => s + w.amp * Math.sin((2 * Math.PI * this.clock) / w.period + w.phase),
      0,
    );
    return Math.max(60, this.targetPace + d);
  }

  strokeState() {
    if (!this.rowing)
      return this.speed > 0.2 ? StrokeState.RECOVERY : StrokeState.WAITING_FOR_MIN_SPEED;
    if (this.phase < DRIVE_FRACTION) return StrokeState.DRIVING;
    if (this.phase < DRIVE_FRACTION + DWELL_FRACTION) return StrokeState.DWELLING_AFTER_DRIVE;
    return StrokeState.RECOVERY;
  }

  /**
   * Advances the model. Returns the events that happened during this step.
   * @param {number} dt seconds (keep ≤ 0.1 for a smooth stroke shape)
   * @returns {{ stroke: boolean }}
   */
  step(dt) {
    const events = { stroke: false };
    if (!(dt > 0)) return events;
    this.clock += dt;

    const meanSpeed = physics.speedFromPace(this.currentMeanPace());
    if (this.rowing) {
      const cycle = 60 / this.spm;
      const prevPhase = this.phase;
      this.phase = (this.phase + dt / cycle) % 1;
      const wrapped = this.phase < prevPhase;
      const crossedDriveEnd = prevPhase < DRIVE_FRACTION && this.phase >= DRIVE_FRACTION;
      if (wrapped && this.recoveryStartedAt != null) {
        this.lastRecoveryTime = this.elapsed - this.recoveryStartedAt;
      }
      // Peak speed mid-drive.
      const swing = Math.cos(2 * Math.PI * (this.phase - DRIVE_FRACTION / 2));
      this.speed = meanSpeed * (1 + SPEED_SWING * swing);
      this.started = true;
      if (crossedDriveEnd || (wrapped && this.phase >= DRIVE_FRACTION)) {
        this.completeStroke(cycle, meanSpeed);
        events.stroke = true;
      }
    } else {
      this.speed *= Math.exp(-dt / FLYWHEEL_TAU);
      if (this.speed < 0.2) this.speed = 0;
    }

    if (this.started && this.speed > 0) this.elapsed += dt;
    this.distance += this.speed * dt;

    const watts = physics.wattsFromSpeed(this.rowing ? meanSpeed : this.speed);
    this.calories +=
      (physics.caloriesPerHourFromWatts(watts) / 3600) * dt * (this.speed > 0 ? 1 : 0);
    this.workJoules += watts * dt;
    this.updateHeartRate(dt, this.rowing ? watts : 0);
    this.updateSplits();
    return events;
  }

  completeStroke(cycle, meanSpeed) {
    const watts = physics.wattsFromSpeed(meanSpeed);
    const driveTime = cycle * DRIVE_FRACTION;
    const driveLength = 1.35 + this.rand() * 0.1;
    const work = watts * cycle; // J per stroke
    const avgForceLbf = (work / driveLength) * LBF_PER_NEWTON;
    this.strokeCount += 1;
    this.lastStroke = {
      elapsed: this.elapsed,
      distance: this.distance,
      driveLength,
      driveTime,
      recoveryTime: this.lastRecoveryTime,
      strokeDistance: this.distance - this.strokeStartDistance,
      peakDriveForce: avgForceLbf * 1.65,
      averageDriveForce: avgForceLbf,
      workPerStroke: work,
      strokeCount: this.strokeCount,
    };
    this.lastStrokeAdditional = {
      elapsed: this.elapsed,
      strokePower: watts,
      strokeCalories: physics.caloriesPerHourFromWatts(watts),
      strokeCount: this.strokeCount,
      projectedWorkTime: 0,
      projectedWorkDistance: 0,
      projectedWorkOther: 0,
      workPerStroke: work,
    };
    this.strokeStartDistance = this.distance;
    this.recoveryStartedAt = this.elapsed;
  }

  updateHeartRate(dt, watts) {
    const target = Math.min(192, 72 + (watts / 250) * 95);
    const tau = target > this.heartRate ? 40 : 25;
    this.heartRate += (target - this.heartRate) * (1 - Math.exp(-dt / tau));
  }

  updateSplits() {
    const nextAt = (this.splits.length + 1) * SPLIT_METERS;
    if (this.distance < nextAt) return;
    const time = this.elapsed - this.splitStart.elapsed;
    const meters = this.distance - this.splitStart.distance;
    this.splits.push({
      time,
      distance: meters,
      avgPower: time > 0 ? (this.workJoules - this.splitStart.work) / time : 0,
      calories: this.calories - this.splitStart.calories,
    });
    this.splitStart = {
      elapsed: this.elapsed,
      distance: this.distance,
      work: this.workJoules,
      calories: this.calories,
    };
  }

  /**
   * Everything the PM5 would report, keyed by characteristic, in the decoder's field names.
   */
  snapshot() {
    const pace = physics.paceFromSpeed(this.speed);
    const avgPace = this.distance > 1 ? (this.elapsed / this.distance) * 500 : null;
    const avgPower = this.elapsed > 0 ? this.workJoules / this.elapsed : 0;
    const split = this.splits[this.splits.length - 1];
    const splitTime = this.elapsed - this.splitStart.elapsed;
    const splitDist = this.distance - this.splitStart.distance;
    const splitPower = splitTime > 0 ? (this.workJoules - this.splitStart.work) / splitTime : 0;
    const active = this.rowing && this.speed > 0;

    return {
      generalStatus: {
        elapsed: this.elapsed,
        distance: this.distance,
        workoutType: WorkoutType.JUSTROW_SPLITS,
        intervalType: IntervalType.NONE,
        workoutState: this.started ? WorkoutState.WORKOUTROW : WorkoutState.WAITTOBEGIN,
        rowingState: active ? RowingState.ACTIVE : RowingState.INACTIVE,
        strokeState: this.strokeState(),
        totalWorkDistance: this.distance,
        workoutDuration: 0,
        workoutDurationType: WorkoutDurationType.TIME,
        dragFactor: this.dragFactor,
      },
      additionalStatus1: {
        elapsed: this.elapsed,
        speed: this.speed,
        strokeRate: this.rowing ? this.spm : 0,
        heartRate: this.heartRateBelt ? Math.round(this.heartRate) : null,
        currentPace: pace,
        averagePace: avgPace,
        restDistance: 0,
        restTime: 0,
        averagePower: avgPower,
        ergMachineType: this.ergMachineType,
      },
      additionalStatus2: {
        elapsed: this.elapsed,
        intervalCount: 0,
        averagePower: avgPower,
        totalCalories: this.calories,
        splitAvgPace: splitDist > 1 ? (splitTime / splitDist) * 500 : null,
        splitAvgPower: splitPower,
        splitAvgCalories: physics.caloriesPerHourFromWatts(splitPower),
        lastSplitTime: split ? split.time : 0,
        lastSplitDistance: split ? split.distance : 0,
      },
      strokeData: this.lastStroke,
      additionalStrokeData: this.lastStrokeAdditional,
    };
  }
}

module.exports = { RowerModel, DRIVE_FRACTION, DWELL_FRACTION, prng };
