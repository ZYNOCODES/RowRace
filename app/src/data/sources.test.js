import { encodeCharacteristic, log, bytes as B } from '@rowrace/shared';
import { createFakeClock } from '../lib/clock';
import { MockPM5 } from './mockPM5';
import { ReplaySource } from './replaySource';
import { SampleMerger } from './sampleMerger';

function collect(src) {
  const out = { samples: [], strokes: [], statuses: [], packets: [] };
  src.on('sample', (s) => out.samples.push(s));
  src.on('stroke', (s) => out.strokes.push(s));
  src.on('status', (s) => out.statuses.push(s.status));
  src.on('packet', (p) => out.packets.push(p));
  return out;
}

describe('SampleMerger', () => {
  const gs = {
    ok: true,
    hex: '',
    elapsed: 10,
    distance: 40,
    rowingState: 1,
    strokeState: 2,
    workoutState: 1,
    dragFactor: 110,
  };
  const s1 = {
    ok: true,
    hex: '',
    speed: 4,
    strokeRate: 24,
    heartRate: null,
    currentPace: 125,
    averagePace: 126,
  };

  test('sample merges status packets; watts from stroke power', () => {
    const m = new SampleMerger();
    m.push(0x32, s1, 1000, '0x0032');
    m.push(0x35, { ok: true, hex: '', strokeCount: 4, driveTime: 0.8 }, 1001, '0x0035');
    const r = m.push(0x36, { ok: true, hex: '', strokeCount: 4, strokePower: 190 }, 1002, '0x0036');
    expect(r.strokes[0]).toMatchObject({ strokeCount: 4, driveTime: 0.8, strokePower: 190 });
    const { sample } = m.push(0x31, gs, 1003, '0x0031');
    expect(sample).toMatchObject({ distance: 40, speed: 4, speedKmh: 14.4, pace: 125, watts: 190 });
  });

  test('not rowing → watts 0, null pace; speed clamped to 8 m/s', () => {
    const m = new SampleMerger();
    m.push(0x32, { ...s1, speed: 0, currentPace: null }, 0, '0x0032');
    expect(m.push(0x31, { ...gs, rowingState: 0 }, 1, '0x0031').sample).toMatchObject({
      watts: 0,
      pace: null,
    });
    m.push(0x32, { ...s1, speed: 30 }, 2, '0x0032');
    expect(m.push(0x31, gs, 3, '0x0031').sample.speed).toBe(8);
  });

  test('0x36 missing: stroke still emitted on a later tick, without power', () => {
    const m = new SampleMerger();
    expect(m.push(0x35, { ok: true, hex: '', strokeCount: 1 }, 0, '0x0035').strokes).toHaveLength(
      0,
    );
    expect(m.push(0x31, gs, 100, '0x0031').strokes).toHaveLength(0);
    const later = m.push(0x31, gs, 500, '0x0031');
    expect(later.strokes[0]).toMatchObject({ strokeCount: 1, strokePower: null });
  });
});

describe('MockPM5', () => {
  test('rows at 250 ms through the real decode path', async () => {
    const clock = createFakeClock();
    const src = new MockPM5({ clock, seed: 1 });
    const out = collect(src);
    await src.connect();
    clock.advance(30000);
    expect(out.statuses).toEqual(['connecting', 'connected']);
    expect(out.samples.length).toBeGreaterThanOrEqual(118);
    expect(out.samples.length).toBeLessThanOrEqual(120);
    expect(out.strokes.length).toBeGreaterThanOrEqual(11);
    expect(out.strokes[3].strokePower).toBeGreaterThan(100);
    expect(out.samples.at(-1).distance).toBeGreaterThan(100);
    expect(out.packets.every((p) => p.ok)).toBe(true);
    await src.disconnect();
  });

  test('stall (dropouts scenario) → stale, then connected', async () => {
    const clock = createFakeClock();
    const src = new MockPM5({ clock, scenario: 'dropouts' });
    const out = collect(src);
    await src.connect();
    clock.advance(36000);
    expect(out.statuses).toContain('stale');
    expect(out.statuses.at(-1)).toBe('connected');
  });

  test('disconnect scenario → reconnecting for 5 s → connected', async () => {
    const clock = createFakeClock();
    const src = new MockPM5({ clock, scenario: 'disconnect-5s' });
    const out = collect(src);
    await src.connect();
    clock.advance(22000);
    expect(src.status).toBe('reconnecting');
    clock.advance(5000);
    expect(src.status).toBe('connected');
    expect(out.statuses).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
  });

  test('noisy packets are counted as errors and skipped', async () => {
    const clock = createFakeClock();
    const src = new MockPM5({ clock, scenario: 'noisy-packets', seed: 3 });
    await src.connect();
    clock.advance(120000);
    expect(src.stats.errors).toBeGreaterThan(0);
    expect(src.stats.errors / src.stats.packets).toBeLessThan(0.03);
  });

  test('PM5 reset scenario: distance goes back near 0', async () => {
    const clock = createFakeClock();
    const src = new MockPM5({ clock, scenario: 'pm5-reset' });
    const out = collect(src);
    await src.connect();
    clock.advance(29000);
    const before = out.samples.at(-1).distance;
    clock.advance(2000);
    expect(before).toBeGreaterThan(100);
    expect(out.samples.at(-1).distance).toBeLessThan(15);
  });

  test('slow sample rate: one sample per second', async () => {
    const clock = createFakeClock();
    const src = new MockPM5({ clock, scenario: 'slow-sample-rate' });
    const out = collect(src);
    await src.connect();
    clock.advance(10000);
    expect(out.samples.length).toBeGreaterThanOrEqual(9);
    expect(out.samples.length).toBeLessThanOrEqual(11);
  });
});

describe('ReplaySource', () => {
  /** A 10 s capture with status every 500 ms. */
  function capture() {
    const lines = [log.makeLine('meta', { app: 'test' }, 0)];
    for (let i = 0; i <= 20; i++) {
      const t = 1000 + i * 500;
      const hex = B.toHex(
        encodeCharacteristic(0x31, { elapsed: i / 2, distance: i * 2, rowingState: 1 }),
      );
      lines.push(log.makeLine('packet', { dir: 'notify', char: '0x0031', hex }, t));
      lines.push(log.makeLine('packet', { dir: 'write', char: '0x0034', hex: '02' }, t));
    }
    return lines.join('\n');
  }

  test('original timing at ×1, ignores app writes', async () => {
    const clock = createFakeClock();
    const src = new ReplaySource({ text: capture(), clock });
    const out = collect(src);
    await src.connect();
    clock.advance(5000);
    expect(out.samples).toHaveLength(11);
    clock.advance(6000);
    expect(out.samples).toHaveLength(21);
    expect(out.samples.at(-1).distance).toBe(40);
    expect(src.status).toBe('disconnected');
  });

  test('×4 is four times faster', async () => {
    const clock = createFakeClock();
    const src = new ReplaySource({ text: capture(), speed: 4, clock });
    const out = collect(src);
    await src.connect();
    clock.advance(2600);
    expect(out.samples).toHaveLength(21);
  });

  test('empty log fails with a clear error', async () => {
    const src = new ReplaySource({ text: 'garbage', clock: createFakeClock() });
    const errors = [];
    src.on('error', (e) => errors.push(e));
    await src.connect();
    expect(src.status).toBe('failed');
    expect(errors[0].code).toBe('replay-empty');
  });
});
