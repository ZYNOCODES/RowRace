/**
 * Smooth, never-backwards distance for rendering at 60 fps from samples that arrive every
 * 250–1000 ms (and in bursts on Android).
 *
 * target(now) = last sample distance + speed × time since that sample (capped at 1 s).
 * Each frame the output moves at the measured speed (feed-forward, so it doesn't lag behind)
 * and then eases the remaining error toward the target. It never decreases; if it overshot,
 * it holds until the real distance catches up.
 */
export class RenderSmoother {
  constructor({ maxSpeed = 8, tau = 0.25, maxExtrapolateSec = 1 } = {}) {
    this.maxSpeed = maxSpeed;
    this.tau = tau;
    this.maxExtrapolateSec = maxExtrapolateSec;
    this.reset(0);
  }

  reset(d) {
    this.base = d;
    this.speed = 0;
    this.sampleAt = null;
    this.out = d;
    this.lastNow = null;
  }

  onSample(d, speed, now) {
    this.base = d;
    this.speed = speed;
    this.sampleAt = now;
  }

  target(now) {
    if (this.sampleAt == null) return this.base;
    const dt = Math.min(this.maxExtrapolateSec, Math.max(0, (now - this.sampleAt) / 1000));
    return this.base + this.speed * dt;
  }

  /** While racing. */
  at(now) {
    return this.step(this.target(now), this.speed, now);
  }

  /** While not racing (paused, finished…): glide to `d` with no extrapolation. */
  hold(d, now) {
    return this.step(d, 0, now);
  }

  finish(d) {
    this.base = d;
    this.speed = 0;
  }

  step(target, speed, now) {
    const dt = this.lastNow == null ? 0 : Math.max(0, (now - this.lastNow) / 1000);
    this.lastNow = now;
    if (dt === 0) return this.out;
    const predicted = this.out + speed * dt;
    const alpha = 1 - Math.exp(-dt / this.tau);
    let next = predicted + (target - predicted) * alpha;
    // Never past the target, never faster than twice the max boat speed (no teleporting),
    // never backwards.
    next = Math.min(next, target, this.out + this.maxSpeed * 2 * dt);
    this.out = Math.max(this.out, next);
    return this.out;
  }
}
