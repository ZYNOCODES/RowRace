/**
 * Stroke phase for the rower/oar animation, synced to the PM5.
 *
 * phase ∈ [0, 1): 0 = catch, [0, driveFrac) = drive, driveFrac = finish, then recovery.
 * The phase advances at 1 / (driveTime + recoveryTime) per second, with timings from the
 * latest Stroke Data (0x35), or derived from the stroke rate. When the PM5's stroke state
 * says a drive started (2) or ended (3/4) and the animation is off, it catches up quickly
 * (never backwards while rowing), so the boat stays in time with the rower's real stroke
 * even though samples arrive only every 250 ms.
 */

const DRIVE = 2;
const DWELL = 3;
const RECOVERY = 4;
const CATCH_UP_SEC = 0.15;
const DEFAULT_DRIVE = 0.8;
const DEFAULT_RECOVERY = 1.6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class StrokeAnimator {
  constructor() {
    this.driveTime = DEFAULT_DRIVE;
    this.recoveryTime = DEFAULT_RECOVERY;
    this.phase = this.driveFrac; // at rest: sitting at the finish
    this.prevState = null;
    this.target = null; // { phase, timeLeft }
  }

  get driveFrac() {
    return this.driveTime / (this.driveTime + this.recoveryTime);
  }

  /**
   * @param {number} dt seconds since the last frame
   * @param {{ rowing: boolean, strokeState?: number, driveTime?: number, recoveryTime?: number,
   *   strokeRate?: number }} input
   * @returns {number} phase
   */
  update(dt, input) {
    this.updateTimings(input);
    const frac = this.driveFrac;
    if (!input.rowing) {
      // Glide to the rest pose (the finish), the shortest way round.
      let diff = frac - this.phase;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      this.phase = wrap(this.phase + diff * Math.min(1, dt * 2.5));
      this.prevState = input.strokeState ?? null;
      this.target = null;
      return this.phase;
    }

    this.onStrokeState(input.strokeState, frac);
    const rate = 1 / (this.driveTime + this.recoveryTime);
    let step = rate * dt;
    if (this.target) {
      const remaining = forwardDistance(this.phase, this.target.phase);
      const needed = remaining / Math.max(dt, this.target.timeLeft);
      step = Math.max(step, needed * dt);
      this.target.timeLeft -= dt;
      if (step >= remaining || this.target.timeLeft <= 0) {
        step = Math.min(step, remaining);
        this.target = null;
      }
    }
    this.phase = wrap(this.phase + step);
    return this.phase;
  }

  updateTimings({ driveTime, recoveryTime, strokeRate }) {
    if (driveTime > 0) this.driveTime = clamp(driveTime, 0.4, 1.6);
    if (recoveryTime > 0) this.recoveryTime = clamp(recoveryTime, 0.4, 4);
    else if (strokeRate > 0) this.recoveryTime = clamp(60 / strokeRate - this.driveTime, 0.4, 4);
  }

  onStrokeState(state, frac) {
    if (state == null || state === this.prevState) return;
    const prev = this.prevState;
    this.prevState = state;
    if (state === DRIVE && prev !== DRIVE) {
      // The PM5 sees a catch: if we're still in the recovery, hurry to the catch.
      if (this.phase >= frac && 1 - this.phase > 0.03)
        this.target = { phase: 0, timeLeft: CATCH_UP_SEC };
    } else if ((state === DWELL || state === RECOVERY) && prev === DRIVE) {
      // Drive ended: if the animation is still pulling, hurry to the finish.
      if (this.phase < frac - 0.03) this.target = { phase: frac, timeLeft: CATCH_UP_SEC };
    }
  }
}

const wrap = (p) => ((p % 1) + 1) % 1;

/** Distance going forward from a to b on the [0, 1) circle. */
const forwardDistance = (a, b) => wrap(b - a);

const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Body and oar pose for a phase. Angles in radians; slide in meters toward the feet.
 * @returns {{ slide: number, lean: number, armPull: number, sweep: number, bladeIn: number,
 *   feather: number }}
 */
export function poseAt(phase, frac) {
  if (phase < frac) {
    const u = phase / frac; // drive: legs, then back, then arms
    return {
      slide: 0.55 * (1 - smooth(0, 0.65, u)),
      lean: 0.45 - 0.8 * smooth(0.3, 0.85, u),
      armPull: smooth(0.6, 1, u),
      sweep: 0.95 - 1.7 * smooth(0, 1, u),
      bladeIn: 1,
      feather: 0,
    };
  }
  const v = (phase - frac) / (1 - frac); // recovery: arms, body over, then slide
  return {
    slide: 0.55 * smooth(0.35, 1, v),
    lean: -0.35 + 0.8 * smooth(0.12, 0.4, v),
    armPull: 1 - smooth(0, 0.22, v),
    sweep: -0.75 + 1.7 * smooth(0.02, 0.97, v),
    bladeIn: 1 - smooth(0, 0.08, v) + smooth(0.93, 1, v),
    feather: smooth(0.04, 0.16, v) * (1 - smooth(0.78, 0.92, v)),
  };
}
