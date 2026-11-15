/**
 * Accumulates what the Results screen needs while racing: time-weighted averages of watts and
 * stroke rate, calories burned (robust to PM5 resets), a thinned distance trace (pace chart and
 * future ghost), and splits every SPLIT_METERS with interpolated times.
 */

export const SPLIT_METERS = 500;
const TRACE_MIN_DT = 0.5; // s between trace points
const MAX_WEIGHT_DT = 2; // a sample never weighs more than this many seconds (dropouts)

export class RaceStats {
  constructor({ splitMeters = SPLIT_METERS } = {}) {
    this.splitMeters = splitMeters;
    this.prev = null; // { t, d } last accepted race point
    this.weight = 0;
    this.wattsSum = 0;
    this.spmSum = 0;
    this.calories = 0;
    this.lastPm5Calories = null;
    this.trace = [{ t: 0, d: 0 }];
    this.splits = [];
  }

  /**
   * @param {number} t race time (s)
   * @param {number} d race distance (m)
   * @param {{ watts?: number, strokeRate?: number, calories?: number }} sample
   * @returns {object[]} splits completed by this point
   */
  add(t, d, sample) {
    const done = [];
    if (this.prev) {
      const dt = Math.min(MAX_WEIGHT_DT, Math.max(0, t - this.prev.t));
      this.weight += dt;
      this.wattsSum += (sample.watts || 0) * dt;
      this.spmSum += (sample.strokeRate || 0) * dt;
      done.push(...this.collectSplits(this.prev, { t, d }));
    }
    this.addCalories(sample.calories);
    if (t - this.trace[this.trace.length - 1].t >= TRACE_MIN_DT) this.trace.push({ t, d });
    this.prev = { t, d };
    return done;
  }

  /** PM5 total calories only grows; a drop means a PM5 reset, so restart the delta from there. */
  addCalories(total) {
    if (!Number.isFinite(total)) return;
    if (this.lastPm5Calories != null && total >= this.lastPm5Calories) {
      this.calories += total - this.lastPm5Calories;
    }
    this.lastPm5Calories = total;
  }

  /** Splits whose boundary lies between two race points, time interpolated linearly. */
  collectSplits(a, b) {
    const out = [];
    let next = (this.splits.length + 1) * this.splitMeters;
    while (b.d >= next && b.d > a.d) {
      const time = a.t + ((b.t - a.t) * (next - a.d)) / (b.d - a.d);
      const prevTime = this.splits.length ? this.splits[this.splits.length - 1].time : 0;
      const split = {
        index: this.splits.length + 1,
        distance: next,
        time,
        splitTime: time - prevTime,
        pace: ((time - prevTime) / this.splitMeters) * 500,
      };
      this.splits.push(split);
      out.push(split);
      next += this.splitMeters;
    }
    return out;
  }

  /** Adds the exact finish point (distance races end between samples). */
  finishAt(t, d) {
    const last = this.trace[this.trace.length - 1];
    if (t > last.t) this.trace.push({ t, d });
  }

  summary(time, distance) {
    return {
      time,
      distance,
      avgPace: distance > 0 ? (time / distance) * 500 : null,
      avgWatts: this.weight > 0 ? this.wattsSum / this.weight : 0,
      avgSpm: this.weight > 0 ? this.spmSum / this.weight : 0,
      calories: this.calories,
      splits: this.splits.slice(),
      trace: this.trace.slice(),
    };
  }
}
