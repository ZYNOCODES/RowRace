import { encodeCharacteristic, sim } from '@rowrace/shared';
import { createFakeClock } from '../lib/clock';
import { PM5Source, reconnectDelay } from './pm5';
import { PM5Scanner, pm5Name, serialFromName } from './scanner';
import { createFakeBle, flush } from './fakeBle';

function setup(bleOpts) {
  const ble = createFakeBle(bleOpts);
  const clock = createFakeClock();
  const src = new PM5Source({
    manager: ble,
    deviceId: 'AA:BB',
    deviceName: 'PM5 430000001',
    clock,
  });
  const statuses = [];
  const samples = [];
  const errors = [];
  src.on('status', (s) => statuses.push(s.status));
  src.on('sample', (s) => samples.push(s));
  src.on('error', (e) => errors.push(e));
  return { ble, clock, src, statuses, samples, errors };
}

/** Feeds one tick of real PM5-shaped packets from the shared rower model. */
function rowerPackets() {
  const m = new sim.RowerModel();
  m.setRowing(true);
  for (let i = 0; i < 100; i++) m.step(0.05);
  const snap = m.snapshot();
  return {
    0x31: encodeCharacteristic(0x31, snap.generalStatus),
    0x32: encodeCharacteristic(0x32, snap.additionalStatus1),
    0x33: encodeCharacteristic(0x33, snap.additionalStatus2),
  };
}

test('reconnect backoff: 1, 2, 4, 8, 10, 10 s', () => {
  expect([0, 1, 2, 3, 4, 5].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
});

describe('connect', () => {
  test('reads device info, sets 250 ms, subscribes to 5 characteristics', async () => {
    const { ble, src, statuses } = setup();
    await src.connect();
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(src.deviceInfo).toMatchObject({
      serialNumber: '430000001',
      firmwareRevision: '210.000',
      ergMachineType: 0,
      sampleRateMs: 250,
    });
    expect(ble.sampleRate).toBe(2);
    expect([...ble.monitors.keys()].sort()).toEqual([0x31, 0x32, 0x33, 0x35, 0x36]);
  });

  test('notifications become samples', async () => {
    const { ble, src, samples } = setup();
    await src.connect();
    const p = rowerPackets();
    ble.notify(0x32, p[0x32]);
    ble.notify(0x33, p[0x33]);
    ble.notify(0x31, p[0x31]);
    expect(samples).toHaveLength(1);
    expect(samples[0].distance).toBeGreaterThan(15);
    expect(samples[0].speed).toBeGreaterThan(3);
    expect(samples[0].pace).toBeGreaterThan(100);
  });

  test('sample-rate write refused (old firmware): continues at 500 ms', async () => {
    const { src, statuses } = setup({ sampleRateWrite: 'fail' });
    await src.connect();
    expect(statuses).toContain('connected');
    expect(src.deviceInfo.sampleRateMs).toBe(500);
  });

  test('missing 0x0016 is tolerated', async () => {
    const { src, statuses } = setup({ deviceInfoFails: [0x16] });
    await src.connect();
    expect(statuses).toContain('connected');
    expect(src.deviceInfo.ergMachineType).toBeUndefined();
  });

  test('SkiErg: warns but connects', async () => {
    const { src, statuses, errors } = setup({ ergType: 128 });
    await src.connect();
    expect(statuses).toContain('connected');
    expect(errors[0]).toMatchObject({ code: 'wrong-erg', warning: true });
  });
});

describe('reconnect', () => {
  test('link loss → reconnecting with backoff → connected again', async () => {
    const { ble, clock, src, statuses } = setup();
    await src.connect();
    ble.connectResults.push(new Error('timeout'), new Error('timeout'));
    ble.dropLink();
    expect(src.status).toBe('reconnecting');
    expect(src.statusDetail).toMatchObject({ attempt: 1, nextRetryMs: 1000 });

    clock.advance(1000); // attempt 2 fails → 2 s
    await flush();
    expect(src.statusDetail).toMatchObject({ nextRetryMs: 2000 });
    clock.advance(2000); // attempt 3 fails → 4 s
    await flush();
    expect(src.statusDetail).toMatchObject({ nextRetryMs: 4000 });
    clock.advance(4000); // succeeds
    await flush();
    expect(src.status).toBe('connected');
    expect(ble.connects).toBe(4);
    expect(statuses.filter((s) => s === 'connected')).toHaveLength(2);
  });

  test('keeps retrying every 10 s until cancelled', async () => {
    const { ble, clock, src } = setup();
    await src.connect();
    for (let i = 0; i < 10; i++) ble.connectResults.push(new Error('no'));
    ble.dropLink();
    clock.advance(1000 + 2000 + 4000 + 8000);
    await flush();
    for (let i = 0; i < 4; i++) {
      clock.advance(10000);
      await flush();
    }
    expect(src.statusDetail.nextRetryMs).toBe(10000);
    const before = ble.connects;
    await src.disconnect();
    clock.advance(60000);
    await flush();
    expect(ble.connects).toBe(before);
    expect(src.status).toBe('disconnected');
  });

  test('old subscriptions are removed before resubscribing', async () => {
    const { ble, clock, src } = setup();
    await src.connect();
    ble.dropLink();
    clock.advance(1000);
    await flush();
    expect(ble.monitors.size).toBe(5);
    expect(ble.disconnectListeners).toHaveLength(1);
  });

  test('Bluetooth turned off then on: failed, then reconnects', async () => {
    const { ble, src } = setup();
    await src.connect();
    ble.setAdapter('PoweredOff');
    expect(src.status).toBe('failed');
    expect(src.statusDetail.reason).toBe('bluetooth-off');
    ble.setAdapter('PoweredOn');
    await flush();
    expect(src.status).toBe('connected');
  });
});

describe('stale data', () => {
  test('no packet for 3 s → stale; next packet → connected', async () => {
    const { ble, clock, src, statuses } = setup();
    await src.connect();
    clock.advance(3300);
    expect(src.status).toBe('stale');
    ble.notify(0x31, rowerPackets()[0x31]);
    expect(src.status).toBe('connected');
    expect(statuses.slice(-2)).toEqual(['stale', 'connected']);
  });

  test('malformed packets are counted, not fatal', async () => {
    const { ble, src, samples } = setup();
    await src.connect();
    ble.notify(0x31, new Uint8Array(5));
    expect(src.stats.errors).toBe(1);
    expect(samples).toHaveLength(0);
    ble.notify(0x31, rowerPackets()[0x31]);
    expect(samples).toHaveLength(1);
  });
});

describe('teardown', () => {
  test('disconnect removes every subscription and cancels the connection', async () => {
    const { ble, src } = setup();
    await src.connect();
    await src.destroy();
    expect(ble.monitors.size).toBe(0);
    expect(ble.disconnectListeners).toHaveLength(0);
    expect(ble.stateListeners).toHaveLength(0);
    expect(ble.cancels).toBe(1);
  });

  test('cancel while connecting: late results are ignored', async () => {
    const { ble, src } = setup();
    const p = src.connect();
    await src.disconnect();
    await p;
    await flush();
    expect(src.status).toBe('disconnected');
    expect(ble.monitors.size).toBe(0);
  });
});

describe('scanner', () => {
  test('filters PM5 names, sorts by RSSI, times out', () => {
    const ble = createFakeBle();
    const clock = createFakeClock();
    const s = new PM5Scanner({ manager: ble, clock });
    const updates = [];
    let timedOut = null;
    s.start({
      onUpdate: (l) => updates.push(l),
      onTimeout: (l) => (timedOut = l),
      timeoutMs: 15000,
    });
    ble.scanListener(null, { id: '1', name: 'PM5 430000001', rssi: -80 });
    ble.scanListener(null, { id: '2', name: 'Headphones', rssi: -40 });
    ble.scanListener(null, { id: '3', localName: 'PM5 430000777', rssi: -50 });
    ble.scanListener(null, { id: '1', name: 'PM5 430000001', rssi: -70 });
    clock.advance(600);
    expect(updates.pop().map((d) => [d.id, d.serial, d.rssi])).toEqual([
      ['3', '430000777', -50],
      ['1', '430000001', -70],
    ]);
    clock.advance(15000);
    expect(timedOut).toHaveLength(2);
    expect(ble.scanStops).toBe(1);
  });

  test('scan error stops and reports', () => {
    const ble = createFakeBle();
    const s = new PM5Scanner({ manager: ble, clock: createFakeClock() });
    let err = null;
    s.start({ onUpdate: () => {}, onError: (e) => (err = e) });
    ble.scanListener({ errorCode: 600, message: 'Scan start failed' }, null);
    expect(err).toEqual({ code: 600, message: 'Scan start failed' });
    expect(s.scanning).toBe(false);
  });

  test('advertised name wins over a stale cached name', () => {
    expect(pm5Name({ name: 'zinou-HP-250', localName: 'PM5 430000001' })).toBe('PM5 430000001');
    expect(pm5Name({ name: 'PM5 430000777', localName: null })).toBe('PM5 430000777');
    expect(pm5Name({ name: 'Headphones', localName: 'Buds' })).toBeNull();
  });

  test('scan.stop logs every advertiser seen', () => {
    const ble = createFakeBle();
    const lines = [];
    const logger = { ble: (e, f) => lines.push([e, f]), packet() {}, error() {} };
    const s = new PM5Scanner({ manager: ble, clock: createFakeClock(), logger });
    s.start({ onUpdate: () => {} });
    ble.scanListener(null, {
      id: 'a',
      name: 'zinou-HP-250',
      localName: 'PM5 430000001',
      rssi: -50,
    });
    ble.scanListener(null, { id: 'b', name: null, localName: null, rssi: -90 });
    s.stop();
    const stop = lines.find(([e]) => e === 'scan.stop')[1];
    expect(stop).toMatchObject({ found: 1, seenDevices: 2 });
    expect(stop.strongest[0]).toMatchObject({ id: 'a', cachedName: 'zinou-HP-250' });
  });

  test('serial from name', () => {
    expect(serialFromName('PM5 430000001')).toBe('430000001');
    expect(serialFromName('PM5')).toBeNull();
  });
});
