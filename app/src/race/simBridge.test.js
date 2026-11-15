/**
 * End-to-end reconnection/robustness tests: the real PC simulator core (simulator/src/core.js)
 * plays the PM5 behind a fake BLE manager, the app's real PM5Source connects to it, and the
 * real race engine runs on top, all on one fake clock. Each test is one simulator key (§5).
 */
import { SHORT, UUID, bytes as B, encodeDeviceInfo, shortIdFromUuid } from '@rowrace/shared';
import { SimulatorCore } from '../../../simulator/src/core';
import { createFakeClock } from '../lib/clock';
import { PM5Source } from '../data/pm5';
import { RaceEngine } from './engine';
import { bindEngine } from './bindEngine';

const DEVICE_INFO = { 0x11: 'PM5', 0x12: '430000001', 0x13: '634', 0x14: 'SIM-1.0', 0x15: 'Concept2', 0x16: 0 };

/** Links a SimulatorCore (peripheral side) to a BleManager-shaped object (app side). */
function createSimLink(clock, coreOpts) {
  const core = new SimulatorCore({ pace: 125, spm: 24, sampleRate: 1, seed: 5, ...coreOpts });
  const link = { connected: false, hiddenUntil: 0, monitors: new Map(), onDrop: [], connects: 0 };
  const drop = () => {
    if (!link.connected) return;
    link.connected = false;
    link.monitors.clear();
    const err = Object.assign(new Error('Device disconnected'), { errorCode: 201 });
    for (const cb of [...link.onDrop]) cb(err);
  };
  core.attach({
    isSubscribed: (id) => link.connected && link.monitors.has(id),
    notify: (id, bytes) => link.monitors.get(id)?.(null, { value: B.bytesToBase64(bytes) }),
    disconnect: (blockSeconds) => {
      link.hiddenUntil = clock.now() + blockSeconds * 1000;
      drop();
    },
  });
  const manager = {
    onStateChange: () => ({ remove() {} }),
    async connectToDevice(id) {
      link.connects += 1;
      if (clock.now() < link.hiddenUntil) throw Object.assign(new Error('Device not found'), { errorCode: 203 });
      link.connected = true;
      return { id, mtu: 185 };
    },
    async cancelDeviceConnection() {
      link.connected = false;
      link.monitors.clear();
    },
    onDeviceDisconnected(_id, cb) {
      link.onDrop.push(cb);
      return { remove: () => (link.onDrop = link.onDrop.filter((x) => x !== cb)) };
    },
    async discoverAllServicesAndCharacteristicsForDevice() {},
    async readCharacteristicForDevice(_id, _svc, uuid) {
      const s = shortIdFromUuid(uuid);
      if (s === SHORT.SAMPLE_RATE) return { value: B.bytesToBase64([core.sampleRate]) };
      return { value: B.bytesToBase64(encodeDeviceInfo(s, DEVICE_INFO[s])) };
    },
    async writeCharacteristicWithResponseForDevice(_id, _svc, uuid, b64) {
      if (uuid === UUID.SAMPLE_RATE && !core.setSampleRate(B.base64ToBytes(b64)[0], 'app')) {
        throw Object.assign(new Error('Write refused'), { errorCode: 401 });
      }
      return {};
    },
    monitorCharacteristicForDevice(_id, _svc, uuid, cb) {
      const s = shortIdFromUuid(uuid);
      link.monitors.set(s, cb);
      return { remove: () => link.monitors.get(s) === cb && link.monitors.delete(s) };
    },
    async readRSSIForDevice(id) {
      return { id, rssi: -60 };
    },
  };
  return { core, manager, link };
}

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

async function session(coreOpts = {}, raceCfg = { mode: 'distance', target: 3000 }) {
  const clock = createFakeClock(Date.UTC(2026, 0, 1));
  const { core, manager, link } = createSimLink(clock, coreOpts);
  const source = new PM5Source({ manager, deviceId: 'sim', clock });
  const engine = new RaceEngine({ clock });
  const log = [];
  bindEngine(engine, source, { clock, logger: { race: (e, f) => log.push([e, f]) } });
  for (let i = 0; i < 20; i++) core.tick(50); // the PC simulator is running before the app connects
  const statuses = [];
  const samples = [];
  source.on('status', (s) => statuses.push(s.status));
  source.on('sample', (s) => samples.push({ ...s, at: clock.now() }));
  await source.connect();
  /** Advances the shared clock; the simulator ticks every 50 ms like on the PC. */
  const run = async (seconds) => {
    for (let i = 0; i < seconds * 20; i++) {
      clock.advance(50);
      core.tick(50);
      if (i % 5 === 0) await flush();
    }
    await flush();
  };
  engine.configure(raceCfg);
  engine.go();
  await run(6);
  const states = () => log.filter(([e]) => e === 'state').map(([, f]) => f.state);
  return { clock, core, link, source, engine, log, statuses, samples, run, states };
}

test('connects through the simulator: 250 ms rate written and honored, race running', async () => {
  const s = await session();
  expect(s.source.deviceInfo).toMatchObject({ serialNumber: '430000001', firmwareRevision: 'SIM-1.0', sampleRateMs: 250 });
  const before = s.samples.length;
  await s.run(10);
  expect(s.samples.length - before).toBeGreaterThanOrEqual(39);
  expect(s.engine.state).toBe('racing');
  expect(s.engine.distance).toBeGreaterThan(30);
});

test('space: stop rowing, then row again (no pause: data keeps flowing)', async () => {
  const s = await session();
  await s.run(10);
  s.core.toggleRowing();
  await s.run(15);
  const stopped = s.samples.at(-1);
  expect(stopped.rowingState).toBe(0);
  expect(stopped.speed).toBe(0);
  expect(s.engine.state).toBe('racing');
  const d = s.engine.distance;
  s.core.toggleRowing();
  await s.run(10);
  expect(s.engine.distance).toBeGreaterThan(d + 25);
});

test('+ / − change pace, [ / ] change stroke rate', async () => {
  const s = await session();
  for (let i = 0; i < 5; i++) s.core.adjustPace(-2); // 10 s faster
  s.core.adjustSpm(4);
  await s.run(20);
  const last = s.samples.at(-1);
  expect(last.strokeRate).toBe(28);
  const recent = s.samples.slice(-40);
  const v = (recent.at(-1).distance - recent[0].distance) / ((recent.at(-1).at - recent[0].at) / 1000);
  expect(500 / v).toBeLessThan(120); // ~1:55 instead of 2:05
});

test('r: PM5 reset mid-race, race distance continues without going back', async () => {
  const s = await session();
  await s.run(30);
  const before = s.engine.distance;
  s.core.resetPM5();
  await s.run(5);
  expect(s.log.some(([e, f]) => e === 'rebase' && f.reason === 'pm5-reset')).toBe(true);
  expect(s.engine.distance).toBeGreaterThan(before);
  expect(s.engine.distance - before).toBeLessThan(25);
});

test('d: forced disconnect, app reconnects by itself, race pauses and resumes', async () => {
  const s = await session();
  await s.run(20);
  s.core.forceDisconnect(0);
  await s.run(15);
  expect(s.statuses).toContain('reconnecting');
  expect(s.statuses.at(-1)).toBe('connected');
  expect(s.states()).toEqual(expect.arrayContaining(['paused', 'resuming']));
  expect(s.engine.state).toBe('racing');
});

test('disconnect with the simulator hidden 5 s: backoff retries until it is visible again', async () => {
  const s = await session();
  await s.run(10);
  s.core.forceDisconnect(5);
  await s.run(25);
  expect(s.link.connects).toBeGreaterThan(2); // retried while hidden
  expect(s.statuses.at(-1)).toBe('connected');
  expect(s.engine.state).toBe('racing');
});

test('s: 5 s stall while connected → stale + paused, then resumes without reconnecting', async () => {
  const s = await session();
  await s.run(10);
  const connects = s.link.connects;
  s.core.stall(5);
  await s.run(12);
  expect(s.statuses).toContain('stale');
  expect(s.states()).toContain('paused');
  expect(s.engine.state).toBe('racing');
  expect(s.link.connects).toBe(connects);
});

test('m: 3 malformed packets are counted and never move the boat', async () => {
  const s = await session();
  await s.run(10);
  s.core.queueMalformed(3);
  await s.run(5);
  expect(s.source.stats.errors).toBe(3);
  expect(s.log.filter(([e]) => e === 'glitch')).toHaveLength(0);
  expect(s.engine.state).toBe('racing');
});

test.each([
  [0, 1000],
  [1, 500],
  [2, 250],
  [3, 100],
])('key %i+1: sample rate changed from the PC side to %i ms', async (rate, ms) => {
  const s = await session();
  s.core.setSampleRate(rate, 'keyboard');
  const before = s.samples.length;
  await s.run(10);
  const n = s.samples.length - before;
  expect(n).toBeGreaterThanOrEqual(10000 / ms - 2);
  expect(n).toBeLessThanOrEqual(10000 / ms + 1);
});

test('old firmware (sample-rate write refused): app reports the real rate it gets', async () => {
  const s = await session({ scenario: 'slow-rate' });
  expect(s.source.deviceInfo.sampleRateMs).toBe(1000);
  await s.run(10);
  expect(s.engine.state).toBe('racing');
});

test('a full 1000 m race through every disruption still finishes, with a sane time', async () => {
  const s = await session({}, { mode: 'distance', target: 1000 });
  await s.run(40);
  s.core.resetPM5();
  await s.run(20);
  s.core.forceDisconnect(3);
  await s.run(20);
  s.core.stall(5);
  await s.run(20);
  s.core.queueMalformed(3);
  await s.run(200);
  expect(s.engine.state).toBe('finished');
  const r = s.engine.result;
  expect(r.distance).toBe(1000);
  // 2:05 pace → 250 s of rowing; outages are not counted, so the time stays close to that.
  expect(r.time).toBeGreaterThan(235);
  expect(r.time).toBeLessThan(270);
});
