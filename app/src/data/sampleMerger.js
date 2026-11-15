/**
 * Merges decoded PM5 packets into the app's normalized events.
 *
 * - `sample` is emitted on every General Status (0x31, individual or multiplexed), the
 *   PM5's canonical tick. It carries the latest values from 0x32/0x33/0x36 too.
 * - `stroke` is emitted once per stroke, pairing Stroke Data (0x35) with Additional Stroke
 *   Data (0x36) by stroke count, whichever arrives last. If 0x36 never comes (or arrives
 *   with another count), the stroke is emitted on the next status tick without power.
 */
import { physics } from '@rowrace/shared';

/** Stroke power older than this is stale (rower stopped mid-cycle). */
const STROKE_POWER_MAX_AGE_MS = 6000;
/** How long a 0x35 waits for its matching 0x36. */
const STROKE_PAIR_WAIT_MS = 400;
const NONE = Object.freeze({ strokes: Object.freeze([]) });

/**
 * @typedef {Object} Sample
 * @property {number} t           receive time, epoch ms
 * @property {number} elapsed     PM5 elapsed time, s
 * @property {number} distance    PM5 distance, m
 * @property {number} speed       m/s
 * @property {number} speedKmh
 * @property {number|null} pace   s/500 m, null when not moving
 * @property {number|null} avgPace
 * @property {number} strokeRate  spm
 * @property {number|null} heartRate
 * @property {number} watts
 * @property {number} calories    total kcal
 * @property {number} strokeState
 * @property {number} rowingState
 * @property {number} workoutState
 * @property {number} dragFactor
 * @property {Record<string, string>} raw latest hex per characteristic
 */

export class SampleMerger {
  constructor() {
    this.reset();
  }

  reset() {
    this.gs = null;
    this.s1 = null;
    this.s2 = null;
    this.stroke2 = null;
    this.stroke2At = 0;
    this.pendingStroke = null;
    this.pendingAt = 0;
    this.raw = {};
  }

  /**
   * @param {number} shortId individual characteristic id (0x31..0x36); for multiplexed
   *   packets pass the mux id (same low byte)
   * @param {object} d decoded packet (ok: true)
   * @param {number} t receive time
   * @param {string} charLabel e.g. "0x0031"
   * @returns {{ sample?: Sample, strokes: object[] }}
   */
  push(shortId, d, t, charLabel) {
    this.raw[charLabel] = d.hex;
    switch (shortId & 0xff) {
      case 0x31: {
        this.gs = d;
        const out = { sample: this.sample(t), strokes: [] };
        if (this.pendingStroke && t - this.pendingAt > STROKE_PAIR_WAIT_MS) {
          out.strokes.push(this.stroke(this.pendingStroke, this.pendingAt, null));
          this.pendingStroke = null;
        }
        return out;
      }
      case 0x32:
        this.s1 = d;
        return NONE;
      case 0x33:
        this.s2 = d;
        return NONE;
      case 0x36: {
        this.stroke2 = d;
        this.stroke2At = t;
        const p = this.pendingStroke;
        if (p && p.strokeCount === d.strokeCount) {
          this.pendingStroke = null;
          return { strokes: [this.stroke(p, this.pendingAt, d)] };
        }
        return NONE;
      }
      case 0x35: {
        const strokes = [];
        if (this.pendingStroke) strokes.push(this.stroke(this.pendingStroke, this.pendingAt, null));
        const s2 = this.stroke2;
        if (s2 && s2.strokeCount === d.strokeCount && t - this.stroke2At < STROKE_PAIR_WAIT_MS) {
          this.pendingStroke = null;
          strokes.push(this.stroke(d, t, s2));
        } else {
          this.pendingStroke = d;
          this.pendingAt = t;
        }
        return { strokes };
      }
      default:
        return NONE;
    }
  }

  /** @returns {Sample} */
  sample(t) {
    const gs = this.gs;
    const s1 = this.s1 || {};
    const s2 = this.s2 || {};
    const speed = clamp(s1.speed ?? 0, 0, 8);
    const active = gs.rowingState === 1 && speed > 0;
    const freshPower = this.stroke2 && t - this.stroke2At <= STROKE_POWER_MAX_AGE_MS;
    const watts = active
      ? freshPower
        ? this.stroke2.strokePower
        : physics.wattsFromSpeed(speed)
      : 0;
    return {
      t,
      elapsed: gs.elapsed,
      distance: gs.distance,
      speed,
      speedKmh: speed * 3.6,
      pace: speed > 0 ? (s1.currentPace ?? physics.paceFromSpeed(speed)) : null,
      avgPace: s1.averagePace ?? null,
      strokeRate: s1.strokeRate ?? 0,
      heartRate: s1.heartRate ?? null,
      watts,
      calories: s2.totalCalories ?? 0,
      strokeState: gs.strokeState,
      rowingState: gs.rowingState,
      workoutState: gs.workoutState,
      dragFactor: gs.dragFactor,
      raw: { ...this.raw },
    };
  }

  /** @param {object} d 0x35 @param {number} t @param {object|null} extra matching 0x36 */
  stroke(d, t, extra) {
    return {
      t,
      elapsed: d.elapsed,
      distance: d.distance,
      strokeCount: d.strokeCount,
      driveLength: d.driveLength,
      driveTime: d.driveTime,
      recoveryTime: d.recoveryTime,
      strokeDistance: d.strokeDistance,
      peakDriveForce: d.peakDriveForce,
      averageDriveForce: d.averageDriveForce,
      workPerStroke: d.workPerStroke ?? extra?.workPerStroke ?? null,
      strokePower: extra ? extra.strokePower : null,
    };
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));
