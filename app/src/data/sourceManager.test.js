import { createFakeClock } from '../lib/clock';
import { MockPM5 } from './mockPM5';
import { SourceManager } from './sourceManager';

function setup() {
  const clock = createFakeClock();
  let state = {};
  const store = { setState: (p) => (state = { ...state, ...p }) };
  const mgr = new SourceManager({
    clock,
    store,
    factories: {
      mock: ({ scenario }) => new MockPM5({ scenario, clock, seed: 2 }),
      replay: () => new MockPM5({ clock, seed: 9 }),
      ble: () => {
        throw new Error('not in tests');
      },
    },
  });
  return { clock, mgr, state: () => state };
}

test('listeners survive a source swap', async () => {
  const { clock, mgr } = setup();
  const samples = [];
  mgr.on('sample', (s) => samples.push(s));
  await mgr.use('mock');
  clock.advance(2000);
  const first = samples.length;
  expect(first).toBeGreaterThan(5);
  await mgr.use('replay');
  clock.advance(2000);
  expect(samples.length).toBeGreaterThan(first + 5);
  await mgr.stop();
});

test('old source is disconnected on swap', async () => {
  const { mgr } = setup();
  const a = await mgr.use('mock');
  await mgr.use('mock');
  expect(a.status).toBe('disconnected');
  expect(a.timer).toBeNull();
});

test('store gets status, device info, rates and recent packets', async () => {
  const { clock, mgr, state } = setup();
  await mgr.use('mock');
  clock.advance(3000);
  const s = state();
  expect(s.kind).toBe('mock');
  expect(s.status).toBe('connected');
  expect(s.deviceInfo.firmwareRevision).toBe('IN-APP');
  expect(s.rates['0x0031']).toBeCloseTo(4, 0);
  expect(s.recentPackets.length).toBeGreaterThan(10);
  expect(s.recentPackets[0].t).toBeGreaterThanOrEqual(s.recentPackets[1].t);
  expect(s.lastSample.distance).toBeGreaterThan(5);
  await mgr.stop();
  expect(state().status).toBe('idle');
});
