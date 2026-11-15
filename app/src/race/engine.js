/**
 * Race engine: pure JS, no React, deterministic. Driven by normalized samples
 * (data/sampleMerger.js), link status changes, and an injected clock (`tick()`).
 *
 * States: idle → ready → countdown → racing ⇄ paused → resuming → racing … → finished
 *
 * - Race time is the app's clock from GO with pauses removed (the PM5 elapsed time starts on
 *   the first stroke and arrives in bursts, so it is never used as the race clock).
 * - Race distance = PM5 distance − baseline + offset. A PM5 reset, a resume after signal loss,
 *   or a confirmed jump "rebases": offset = current race distance, baseline = new PM5 value,
 *   so the race continues without a backward or forward jump.
 */
import { Emitter } from '../lib/emitter';
import { realClock } from '../lib/clock';
import { RaceStats } from './stats';
import { createGhost, createPaceBoat } from './paceBoats';
import { buildResult, buildSnapshot } from './raceView';
import { RenderSmoother } from './renderSmoother';
import { DEFAULTS, LINK_DOWN, RaceState } from './raceConstants';

export { DEFAULTS, RaceState };

const clampSpeed = (v, max) => Math.min(max, Math.max(0, Number.isFinite(v) ? v : 0));

export class RaceEngine extends Emitter {
  /** @param {{ clock?: import('../lib/clock').Clock } & Partial<typeof DEFAULTS>} [opts] */
  constructor({ clock, ...opts } = {}) {
    super();
    this.clock = clock || realClock;
    this.o = { ...DEFAULTS, ...opts };
    this.state = RaceState.IDLE;
    this.latest = null;
    this.lastSampleAt = 0;
    this.smoother = new RenderSmoother({ maxSpeed: this.o.maxSpeed });
  }

  /**
   * @param {{ mode: 'distance'|'time'|'free', target?: number,
   *   paceBoats?: { id: string, name: string, pace: number }[],
   *   ghost?: { name: string, points: { t: number, d: number }[] } | null }} cfg
   *   target: meters (distance) or seconds (time)
   */
  configure(cfg) {
    if (!['distance', 'time', 'free'].includes(cfg.mode)) throw new Error(`bad mode ${cfg.mode}`);
    if (cfg.mode !== 'free' && !(cfg.target > 0)) throw new Error('target must be > 0');
    const boats = (cfg.paceBoats || []).slice(0, this.o.maxPaceBoats).map(createPaceBoat);
    if (cfg.ghost?.points?.length) boats.push(createGhost(cfg.ghost));
    this.cfg = { mode: cfg.mode, target: cfg.mode === 'free' ? null : cfg.target };
    this.opponents = boats;
    this.result = null;
    this.setState(RaceState.READY, 'configured');
  }

  /** GO pressed: starts the countdown. */
  go() {
    if (this.state !== RaceState.READY) return;
    this.countdownEndsAt = this.clock.now() + this.o.countdownSec * 1000;
    this.lastCount = null;
    this.setState(RaceState.COUNTDOWN, 'go');
    this.tick();
  }

  // ---- inputs ----

  /** @param {import('../data/sampleMerger').Sample} s */
  pushSample(s) {
    if (!s || !Number.isFinite(s.distance)) return;
    const now = this.clock.now();
    this.latest = s;
    this.lastSampleAt = now;
    if (this.state === RaceState.RACING) {
      if (this.timeIsUp(now)) return this.finishTimeRace();
      this.ingest(s, now);
    } else if (this.state === RaceState.PAUSED && !LINK_DOWN.has(this.link)) {
      this.beginResume(now);
    }
  }

  /** Source status (connected / stale / reconnecting / disconnected / failed). */
  setLinkStatus(status) {
    this.link = status;
    if (LINK_DOWN.has(status)) {
      if (this.state === RaceState.RACING) this.pause(`link-${status}`);
      else if (this.state === RaceState.RESUMING) this.backToPaused(`link-${status}`);
    }
  }

  /** Advances timers. Call often (every frame or every 100 ms). */
  tick() {
    const now = this.clock.now();
    switch (this.state) {
      case RaceState.COUNTDOWN:
        this.countdownStep(now, this.countdownEndsAt, 'countdown', () => this.startRacing(now));
        break;
      case RaceState.RACING:
        if (this.timeIsUp(now)) this.finishTimeRace();
        else if (now - this.lastSampleAt > this.o.lostAfterMs) this.pause('signal-lost');
        break;
      case RaceState.PAUSED:
        if (!this.offerEnd && now - this.pausedAt >= this.o.offerEndAfterMs) {
          this.offerEnd = true;
          this.emit('offerEnd');
        }
        break;
      case RaceState.RESUMING:
        if (now - this.lastSampleAt > this.o.lostAfterMs) this.backToPaused('signal-lost');
        else
          this.countdownStep(now, this.resumeEndsAt, 'resumeCountdown', () =>
            this.resumeRacing(now),
          );
        break;
      default:
    }
  }

  /** "Keep waiting" after the 60 s offer. */
  keepWaiting() {
    if (this.state !== RaceState.PAUSED) return;
    this.pausedAt = this.clock.now();
    this.offerEnd = false;
  }

  /** Ends the race now (Exit in free mode, "End race", long-press quit). */
  end(reason = 'ended') {
    if (
      this.state === RaceState.IDLE ||
      this.state === RaceState.READY ||
      this.state === RaceState.FINISHED
    )
      return;
    if (this.state === RaceState.COUNTDOWN) {
      this.setState(RaceState.READY, 'cancelled');
      return;
    }
    if (this.state === RaceState.RACING) this.freezeClock(this.clock.now());
    this.finish(this.accum, this.distance, reason);
  }

  // ---- state machine internals ----

  countdownStep(now, endsAt, event, onDone) {
    const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
    if (left !== this.lastCount) {
      this.lastCount = left;
      this.emit(event, left);
    }
    if (now >= endsAt) onDone();
  }

  startRacing(now) {
    this.accum = 0;
    this.activeSince = now;
    this.distance = 0;
    this.offset = 0;
    this.baseline = this.latest ? this.latest.distance : null;
    this.lastPm5 = this.latest;
    this.lastAccepted = { t: 0, d: 0, at: now };
    this.speed = 0;
    this.jumpStreak = 0;
    this.stats = new RaceStats();
    this.smoother.reset(0);
    // The PM5 may have been silent during the countdown (idle monitor): give it a full
    // lost-signal window from GO instead of pausing on the first tick.
    this.lastSampleAt = Math.max(this.lastSampleAt, now);
    this.setState(RaceState.RACING, 'start');
  }

  /** Race time in seconds at `now` (pauses excluded). */
  raceTime(now = this.clock.now()) {
    if (this.state !== RaceState.RACING) return this.accum ?? 0;
    return this.accum + Math.max(0, now - this.activeSince) / 1000;
  }

  /** Stops the race clock at the last good sample (not at the moment the loss was noticed). */
  freezeClock(now) {
    const until = Math.max(this.activeSince, Math.min(now, this.lastSampleAt || now));
    this.accum += Math.max(0, until - this.activeSince) / 1000;
  }

  pause(reason) {
    const now = this.clock.now();
    this.freezeClock(now);
    this.pausedAt = now;
    this.offerEnd = false;
    this.pauseReason = reason;
    this.speed = 0;
    this.setState(RaceState.PAUSED, reason);
  }

  beginResume(now) {
    this.resumeEndsAt = now + this.o.resumeCountdownSec * 1000;
    this.lastCount = null;
    this.setState(RaceState.RESUMING, 'data-back');
    this.tick();
  }

  backToPaused(reason) {
    this.pausedAt = this.clock.now();
    this.pauseReason = reason;
    this.setState(RaceState.PAUSED, reason);
  }

  resumeRacing(now) {
    // Distance rowed while the link was down is not counted: the clock was stopped too.
    if (this.latest) this.rebase('resume', this.latest);
    this.activeSince = now;
    this.lastAccepted = { t: this.accum, d: this.distance, at: now };
    this.setState(RaceState.RACING, 'resumed');
  }

  /**
   * Keeps the race distance continuous across a discontinuity in PM5 distance. After a PM5
   * reset the monitor counts again from 0, so 0 is the right baseline (the meters rowed
   * before the first post-reset sample still count); otherwise use the current value.
   */
  rebase(reason, s) {
    this.offset = this.distance;
    this.baseline = reason === 'pm5-reset' && s.distance <= this.o.jumpAllowance ? 0 : s.distance;
    this.lastPm5 = s;
    this.jumpStreak = 0;
    this.emit('rebase', { reason, raceDistance: this.distance, pm5Distance: s.distance });
  }

  /** Accepts one sample while racing. */
  ingest(s, now) {
    const t = this.raceTime(now);
    if (this.baseline == null) {
      this.baseline = s.distance;
      this.lastPm5 = s;
      return;
    }
    const prev = this.lastPm5;
    const reset =
      s.distance < prev.distance - this.o.resetDropMeters ||
      (Number.isFinite(s.elapsed) && s.elapsed < prev.elapsed - this.o.resetDropSeconds);
    if (reset) this.rebase('pm5-reset', s);

    const raw = s.distance - this.baseline + this.offset;
    const dt = Math.max(0, (now - this.lastAccepted.at) / 1000);
    if (raw - this.distance > this.o.jumpAllowance + this.o.maxSpeed * dt) {
      this.jumpStreak += 1;
      this.emit('glitch', { jump: raw - this.distance, dt, streak: this.jumpStreak });
      if (this.jumpStreak < this.o.jumpConfirmSamples) return;
      this.rebase('confirmed-jump', s); // a persistent shift: keep the race continuous
    } else {
      this.jumpStreak = 0;
    }

    const prevPoint = { t: this.lastAccepted.t, d: this.distance };
    this.distance = Math.max(this.distance, s.distance - this.baseline + this.offset);
    this.lastPm5 = s;
    this.speed = clampSpeed(s.speed, this.o.maxSpeed);
    this.lastAccepted = { t, d: this.distance, at: now };
    this.smoother.onSample(this.distance, this.speed, now);

    for (const split of this.stats.add(t, this.distance, s)) this.emit('split', split);
    if (this.cfg.mode === 'distance' && this.distance >= this.cfg.target) {
      this.finishDistanceRace(prevPoint, { t, d: this.distance });
    }
  }

  timeIsUp(now) {
    return this.cfg.mode === 'time' && this.raceTime(now) >= this.cfg.target;
  }

  /** Distance race: finish time interpolated between the two samples around the line. */
  finishDistanceRace(a, b) {
    const target = this.cfg.target;
    const frac = b.d > a.d ? (target - a.d) / (b.d - a.d) : 1;
    const time = a.t + (b.t - a.t) * Math.min(1, Math.max(0, frac));
    this.accum = time;
    this.finish(time, target, 'finished');
  }

  /** Time race: distance at the exact end time, extrapolated ≤ 1 s from the last sample. */
  finishTimeRace() {
    const target = this.cfg.target;
    const extra = Math.min(1, Math.max(0, target - this.lastAccepted.t));
    const d = this.distance + this.speed * extra;
    this.accum = target;
    this.distance = d;
    this.finish(target, d, 'time-up');
  }

  finish(time, distance, reason) {
    this.stats?.finishAt(time, distance);
    this.distance = distance;
    this.speed = 0;
    this.smoother.finish(distance);
    this.result = buildResult(this, time, distance, reason);
    this.setState(RaceState.FINISHED, reason);
    this.emit('finish', this.result);
  }

  setState(next, reason) {
    const prev = this.state;
    this.state = next;
    this.emit('state', { state: next, prev, reason });
  }

  // ---- outputs ----

  /** Smooth, never-backwards distance for the 3D boat. */
  getRenderDistance(now = this.clock.now()) {
    if (this.state !== RaceState.RACING) return this.smoother.hold(this.distance ?? 0, now);
    return this.smoother.at(now);
  }

  /** Everything the HUD needs, at `now`. */
  snapshot(now = this.clock.now()) {
    return buildSnapshot(this, now);
  }
}
