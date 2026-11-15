/**
 * Test helper: a scripted PM5 feeding a RaceEngine on a fake clock. Status samples every
 * `rateMs` (default 250 ms), engine ticks every 50 ms like a render loop would.
 */
import { createFakeClock } from '../lib/clock';
import { RaceEngine } from './engine';

export function setupRace(cfg, engineOpts = {}) {
  const clock = createFakeClock(Date.UTC(2026, 0, 1));
  const engine = new RaceEngine({ clock, ...engineOpts });
  const events = [];
  for (const e of [
    'state',
    'countdown',
    'resumeCountdown',
    'split',
    'rebase',
    'glitch',
    'finish',
    'offerEnd',
  ]) {
    engine.on(e, (payload) => events.push([e, payload]));
  }
  engine.configure(cfg);
  const pm5 = { distance: 0, elapsed: 0, calories: 0, speed: 0, strokeRate: 0, watts: 0 };

  /** Advances time by `ms`, ticking the engine every 50 ms without sending samples. */
  const wait = (ms) => {
    for (let t = 0; t < ms; t += 50) {
      clock.advance(50);
      engine.tick();
    }
  };

  /**
   * Rows for `seconds` at `speed` m/s. `send: false` = the PM5 keeps counting but nothing
   * reaches the app (link down).
   */
  const row = (seconds, speed = 4, { rateMs = 250, send = true, watts = 180, spm = 24 } = {}) => {
    const steps = Math.round((seconds * 1000) / 50);
    let sinceSample = 0;
    for (let i = 0; i < steps; i++) {
      clock.advance(50);
      pm5.distance += speed * 0.05;
      pm5.elapsed += 0.05;
      pm5.calories += (speed > 0 ? 900 : 300) / 3600 / 20;
      pm5.speed = speed;
      pm5.strokeRate = speed > 0 ? spm : 0;
      pm5.watts = speed > 0 ? watts : 0;
      sinceSample += 50;
      if (send && sinceSample >= rateMs) {
        sinceSample = 0;
        engine.pushSample({ ...pm5, rowingState: speed > 0 ? 1 : 0 });
      }
      engine.tick();
    }
  };

  /** Sends one sample with explicit values (glitches, resets). */
  const send = (patch) => {
    Object.assign(pm5, patch);
    engine.pushSample({ ...pm5 });
  };

  const of = (type) => events.filter(([e]) => e === type).map(([, p]) => p);
  const states = () => of('state').map((s) => s.state);

  /** GO + full countdown, with the PM5 notifying (idle) like a real monitor does. */
  const start = () => {
    engine.go();
    row(5, 0);
  };

  return { clock, engine, pm5, events, of, states, wait, row, send, start };
}
