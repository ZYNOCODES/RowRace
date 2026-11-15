/**
 * End to end through the real data path: shared rower model → PM5 encoder → decoder →
 * sample merger (MockPM5) → bindEngine → RaceEngine, on a fake clock.
 */
import { createFakeClock } from '../lib/clock';
import { MockPM5 } from '../data/mockPM5';
import { RaceEngine, RaceState } from './engine';
import { bindEngine } from './bindEngine';

async function race(scenario, cfg, seconds) {
  const clock = createFakeClock(Date.UTC(2026, 0, 1));
  const source = new MockPM5({ clock, scenario, seed: 11 });
  const engine = new RaceEngine({ clock });
  const log = [];
  bindEngine(engine, source, { clock, logger: { race: (e, f) => log.push([e, f]) } });
  await source.connect();
  clock.advance(2000); // rowing before GO: must not count
  engine.configure(cfg);
  engine.go();
  const render = [];
  for (let i = 0; i < seconds * 20; i++) {
    clock.advance(50);
    render.push(engine.getRenderDistance(clock.now()));
  }
  await source.disconnect();
  return { engine, log, render, result: engine.result };
}

const monotonic = (arr) => arr.every((v, i) => i === 0 || v >= arr[i - 1]);

test('steady 2:05 rower, 500 m: finishes near 125 s', async () => {
  const { result, render } = await race('steady', { mode: 'distance', target: 500 }, 150);
  expect(result.reason).toBe('finished');
  expect(result.time).toBeGreaterThan(118);
  expect(result.time).toBeLessThan(132);
  expect(result.avgWatts).toBeGreaterThan(140);
  expect(result.calories).toBeGreaterThan(5);
  expect(monotonic(render)).toBe(true);
});

test('PM5 reset at 30 s: race continues, same finish time as steady, rebase logged', async () => {
  const steady = await race('steady', { mode: 'distance', target: 500 }, 150);
  const reset = await race('reset-mid-race', { mode: 'distance', target: 500 }, 150);
  expect(reset.log.some(([e, f]) => e === 'rebase' && f.reason === 'pm5-reset')).toBe(true);
  expect(reset.result.reason).toBe('finished');
  expect(Math.abs(reset.result.time - steady.result.time)).toBeLessThan(1.5);
  expect(monotonic(reset.render)).toBe(true);
});

test('dropouts (stalls + disconnects): pauses, resumes, still finishes; race clock excludes outages', async () => {
  const { engine, log, result, render } = await race(
    'dropouts',
    { mode: 'distance', target: 1000 },
    400,
  );
  const states = log.filter(([e]) => e === 'state').map(([, f]) => f.state);
  expect(states).toContain('paused');
  expect(states).toContain('resuming');
  expect(engine.state).toBe(RaceState.FINISHED);
  expect(result.time).toBeGreaterThan(235);
  expect(result.time).toBeLessThan(265);
  expect(monotonic(render)).toBe(true);
});

test('noisy packets: malformed ones never move the boat', async () => {
  const { result, render } = await race('noisy-packets', { mode: 'time', target: 120 }, 130);
  expect(result.reason).toBe('time-up');
  expect(result.distance).toBeGreaterThan(440);
  expect(result.distance).toBeLessThan(520);
  expect(monotonic(render)).toBe(true);
});
