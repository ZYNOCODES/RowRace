const { SimulatorCore } = require('./core');
const { ReplayCore } = require('./replay');
const { JsonlLogger } = require('./logger');
const { decodeCharacteristic, log } = require('@rowrace/shared');

/** Transport double: records notifications; `subs` decides what the "app" subscribed to. */
function fakeTransport(subs = [0x31, 0x32, 0x33, 0x35, 0x36]) {
  const t = {
    subs: new Set(subs),
    sent: [],
    disconnects: [],
    isSubscribed: (id) => t.subs.has(id),
    notify: (id, bytes) => t.sent.push({ id, bytes }),
    disconnect: (s) => t.disconnects.push(s),
  };
  return t;
}

function makeCore(extra = {}) {
  const core = new SimulatorCore({ pace: 125, spm: 24, ...extra });
  const tr = fakeTransport(extra.subs);
  core.attach(tr);
  return { core, tr };
}

const runFor = (core, seconds) => {
  for (let i = 0; i < seconds * 20; i++) core.tick(50);
};
const count = (tr, id) => tr.sent.filter((p) => p.id === id).length;

describe('SimulatorCore timing', () => {
  test.each([
    [0, 1000],
    [1, 500],
    [2, 250],
    [3, 100],
  ])('sample rate %i sends status every %i ms', (rate, ms) => {
    const { core, tr } = makeCore({ sampleRate: rate });
    runFor(core, 10);
    const expected = 10000 / ms;
    expect(count(tr, 0x31)).toBeGreaterThanOrEqual(expected - 1);
    expect(count(tr, 0x31)).toBeLessThanOrEqual(expected);
    expect(count(tr, 0x32)).toBe(count(tr, 0x31));
  });

  test('stroke packets once per stroke', () => {
    const { core, tr } = makeCore();
    runFor(core, 30);
    expect(count(tr, 0x35)).toBeGreaterThanOrEqual(11);
    expect(count(tr, 0x35)).toBeLessThanOrEqual(12);
    expect(count(tr, 0x36)).toBe(count(tr, 0x35));
  });

  test('every packet decodes', () => {
    const { core, tr } = makeCore({ sampleRate: 3 });
    runFor(core, 5);
    for (const p of tr.sent) expect(decodeCharacteristic(p.id, p.bytes).ok).toBe(true);
  });

  test('nothing is sent when nothing is subscribed', () => {
    const { core, tr } = makeCore({ subs: [] });
    runFor(core, 5);
    expect(tr.sent).toHaveLength(0);
  });

  test('falls back to multiplexed 0x0080 when only it is subscribed', () => {
    const { core, tr } = makeCore({ subs: [0x80] });
    runFor(core, 5);
    expect(tr.sent.length).toBeGreaterThan(0);
    expect(new Set(tr.sent.map((p) => p.id))).toEqual(new Set([0x80]));
    const ids = new Set(tr.sent.map((p) => decodeCharacteristic(0x80, p.bytes).muxId));
    expect(ids).toEqual(new Set([0x31, 0x32, 0x33, 0x35, 0x36]));
  });
});

describe('SimulatorCore controls', () => {
  test('stall silences notifications for 5 s, then resumes', () => {
    const { core, tr } = makeCore();
    runFor(core, 2);
    core.stall(5);
    const before = tr.sent.length;
    runFor(core, 4.9);
    expect(tr.sent.length).toBe(before);
    runFor(core, 1.2);
    expect(tr.sent.length).toBeGreaterThan(before);
  });

  test('3 malformed packets, then clean ones', () => {
    const { core, tr } = makeCore();
    core.queueMalformed(3);
    runFor(core, 3);
    const bad = tr.sent.filter((p) => !decodeCharacteristic(p.id, p.bytes).ok);
    expect(bad).toHaveLength(3);
  });

  test('PM5 reset sends distance back to ~0', () => {
    const { core, tr } = makeCore();
    runFor(core, 20);
    core.resetPM5();
    runFor(core, 0.6);
    const last = tr.sent.filter((p) => p.id === 0x31).pop();
    expect(decodeCharacteristic(0x31, last.bytes).distance).toBeLessThan(5);
  });

  test('space stops rowing even while a scenario wants to row', () => {
    const { core } = makeCore();
    runFor(core, 2);
    core.toggleRowing();
    runFor(core, 1);
    expect(core.model.rowing).toBe(false);
    core.toggleRowing();
    runFor(core, 1);
    expect(core.model.rowing).toBe(true);
  });

  test('pace keys change the target pace', () => {
    const { core } = makeCore();
    core.adjustPace(-2);
    core.adjustPace(-2);
    expect(core.model.targetPace).toBe(121);
    core.adjustSpm(1);
    expect(core.model.spm).toBe(25);
  });

  test('app sample-rate writes: valid accepted, invalid refused', () => {
    const { core } = makeCore();
    expect(core.setSampleRate(2, 'app')).toBe(true);
    expect(core.sampleRate).toBe(2);
    expect(core.setSampleRate(7, 'app')).toBe(false);
  });

  test('slow-rate scenario locks 1 s and refuses app writes (old firmware)', () => {
    const { core } = makeCore({ scenario: 'slow-rate' });
    runFor(core, 0.1);
    expect(core.sampleRate).toBe(0);
    expect(core.setSampleRate(2, 'app')).toBe(false);
    expect(core.sampleRate).toBe(0);
  });

  test('disconnect scenario asks the transport to drop the link for 5 s', () => {
    const { core, tr } = makeCore({ scenario: 'disconnect' });
    runFor(core, 21);
    expect(tr.disconnects).toEqual([5]);
  });
});

describe('logging and replay', () => {
  test('a simulator log replays the same packets in order', () => {
    const lines = [];
    let now = 1_700_000_000_000;
    const logger = new JsonlLogger({ enabled: false, now: () => now });
    logger.write = (type, fields) => lines.push(log.makeLine(type, fields, now));

    const core = new SimulatorCore({ pace: 125, spm: 24, logger });
    const tr = fakeTransport();
    core.attach(tr);
    for (let i = 0; i < 200; i++) {
      core.tick(50);
      now += 50;
    }

    const replay = new ReplayCore(lines.join('\n'));
    const rt = fakeTransport();
    replay.attach(rt);
    for (let i = 0; i < 220; i++) replay.tick(50);

    expect(rt.sent.map((p) => Buffer.from(p.bytes).toString('hex'))).toEqual(
      tr.sent.map((p) => Buffer.from(p.bytes).toString('hex')),
    );
  });

  test('replay re-encodes individual packets when the app only subscribed to 0x0080', () => {
    const lines = [];
    const logger = { packet: () => {}, event: () => {} };
    const core = new SimulatorCore({ pace: 125, spm: 24, logger });
    const tr = fakeTransport();
    core.attach(tr);
    let t = 0;
    core.on('packet', ({ shortId, bytes }) =>
      lines.push(
        log.makeLine(
          'packet',
          {
            dir: 'notify',
            char: `0x00${shortId.toString(16)}`,
            hex: Buffer.from(bytes).toString('hex'),
          },
          t,
        ),
      ),
    );
    for (let i = 0; i < 100; i++, t += 50) core.tick(50);

    const replay = new ReplayCore(lines.join('\n'));
    const rt = fakeTransport([0x80]);
    replay.attach(rt);
    for (let i = 0; i < 120; i++) replay.tick(50);
    expect(rt.sent.length).toBe(tr.sent.length);
    for (const p of rt.sent) expect(decodeCharacteristic(0x80, p.bytes).ok).toBe(true);
  });

  test('replay waits for a subscriber before starting the clock', () => {
    const text = log.makeLine(
      'packet',
      { dir: 'notify', char: '0x0031', hex: '00'.repeat(19) },
      1000,
    );
    const replay = new ReplayCore(text);
    const rt = fakeTransport([]);
    replay.attach(rt);
    for (let i = 0; i < 50; i++) replay.tick(50);
    expect(replay.status().waiting).toBe(true);
    rt.subs.add(0x31);
    replay.tick(50);
    expect(rt.sent).toHaveLength(1);
  });

  test('a log with no packets is rejected with a clear message', () => {
    expect(() => new ReplayCore('{"type":"meta","t":1}\nnot json')).toThrow(
      /No PM5 notify packets/,
    );
  });
});
