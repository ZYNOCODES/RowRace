const { RowerModel } = require('../sim/rowerModel');
const { createScenario, SCENARIO_NAMES } = require('../sim/scenarios');
const P = require('../sim/packets');
const D = require('../pm5/decode');
const { StrokeState, RowingState } = require('../pm5/enums');

/** Runs the model for `seconds` at 50 ms steps; returns stroke count and the strokeState trace. */
function run(model, seconds, onTick) {
  let strokes = 0;
  const states = new Set();
  for (let i = 0; i < seconds * 20; i++) {
    if (onTick) onTick(i * 0.05);
    if (model.step(0.05).stroke) strokes++;
    states.add(model.snapshot().generalStatus.strokeState);
  }
  return { strokes, states };
}

describe('RowerModel', () => {
  test('mean pace and stroke rate match the targets', () => {
    const m = new RowerModel({ pace: 120, spm: 30 });
    m.setRowing(true);
    const { strokes, states } = run(m, 120);
    expect(strokes).toBeGreaterThanOrEqual(59);
    expect(strokes).toBeLessThanOrEqual(61);
    expect(m.snapshot().additionalStatus1.averagePace).toBeGreaterThan(117);
    expect(m.snapshot().additionalStatus1.averagePace).toBeLessThan(123);
    expect(states).toEqual(
      new Set([StrokeState.DRIVING, StrokeState.DWELLING_AFTER_DRIVE, StrokeState.RECOVERY]),
    );
  });

  test('stroke data is plausible', () => {
    const m = new RowerModel({ pace: 125, spm: 24 });
    m.setRowing(true);
    run(m, 30);
    const s = m.snapshot().strokeData;
    expect(s.driveTime).toBeCloseTo(0.875, 2);
    expect(s.recoveryTime).toBeGreaterThan(1.4);
    expect(s.strokeDistance).toBeGreaterThan(8);
    expect(s.strokeDistance).toBeLessThan(12);
    expect(m.snapshot().additionalStrokeData.strokePower).toBeGreaterThan(150);
  });

  test('stopping spins the flywheel down to zero speed, null pace', () => {
    const m = new RowerModel();
    m.setRowing(true);
    run(m, 10);
    m.setRowing(false);
    run(m, 30);
    const snap = m.snapshot();
    expect(snap.additionalStatus1.speed).toBe(0);
    expect(snap.additionalStatus1.currentPace).toBeNull();
    expect(snap.generalStatus.rowingState).toBe(RowingState.INACTIVE);
  });

  test('reset zeroes distance, time and strokes', () => {
    const m = new RowerModel();
    m.setRowing(true);
    run(m, 20);
    m.reset();
    const snap = m.snapshot();
    expect(snap.generalStatus.distance).toBeLessThan(1);
    expect(snap.generalStatus.elapsed).toBe(0);
    expect(snap.strokeData).toBeNull();
  });

  test('deterministic for a given seed', () => {
    const a = new RowerModel({ seed: 7 });
    const b = new RowerModel({ seed: 7 });
    a.setRowing(true);
    b.setRowing(true);
    run(a, 15);
    run(b, 15);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  test('splits every 500 m', () => {
    const m = new RowerModel({ pace: 100, spm: 32 });
    m.setRowing(true);
    run(m, 110);
    const s = m.snapshot().additionalStatus2;
    expect(s.lastSplitDistance).toBeGreaterThanOrEqual(500);
    expect(s.lastSplitTime).toBeGreaterThan(95);
    expect(s.lastSplitTime).toBeLessThan(105);
  });

  test('no heart-rate belt → null heart rate', () => {
    expect(
      new RowerModel({ heartRateBelt: false }).snapshot().additionalStatus1.heartRate,
    ).toBeNull();
  });
});

describe('scenarios', () => {
  const opts = { pace: 125, spm: 24 };
  const fakeModel = () => {
    const calls = [];
    return {
      calls,
      setRowing: (v) => calls.push(['rowing', v]),
      setPace: (v) => calls.push(['pace', v]),
      setSpm: (v) => calls.push(['spm', v]),
      reset: () => calls.push(['reset']),
    };
  };

  test.each(SCENARIO_NAMES)('%s runs for 3 minutes without throwing', (name) => {
    const s = createScenario(name, opts);
    const m = fakeModel();
    for (let t = 0; t < 180; t += 0.05) s.update(t, m);
  });

  test('reset-mid-race resets exactly once', () => {
    const s = createScenario('reset-mid-race', opts);
    const m = fakeModel();
    for (let t = 0; t < 120; t += 0.05) s.update(t, m);
    expect(m.calls.filter((c) => c[0] === 'reset')).toHaveLength(1);
  });

  test('dropouts alternate stall and disconnect', () => {
    const s = createScenario('dropouts', opts);
    const m = fakeModel();
    const actions = [];
    for (let t = 0; t < 125; t += 0.05) actions.push(...s.update(t, m));
    expect(actions.map((a) => a.type)).toEqual(['stall', 'disconnect', 'stall', 'disconnect']);
  });

  test('stop-go stops rowing 5 s out of 25', () => {
    const s = createScenario('stop-and-go', opts);
    const m = fakeModel();
    s.update(10, m);
    s.update(22, m);
    expect(m.calls).toEqual([
      ['rowing', true],
      ['rowing', false],
    ]);
  });

  test('noisy has a 1% malformed rate; unknown names throw', () => {
    expect(createScenario('noisy-packets', opts).malformedRate).toBe(0.01);
    expect(() => createScenario('nope', opts)).toThrow(/Unknown scenario/);
  });
});

describe('packets', () => {
  const m = new RowerModel();
  m.setRowing(true);
  run(m, 10);
  const snap = m.snapshot();

  test('every built packet decodes back to the snapshot', () => {
    for (const id of [...P.STATUS_CHARS, ...P.STROKE_CHARS]) {
      const d = D.decodeCharacteristic(id, P.buildPacket(id, snap));
      expect(d.ok).toBe(true);
      expect(d.elapsed).toBeCloseTo(snap[P.SNAPSHOT_KEY[id]].elapsed, 1);
    }
  });

  test('multiplexed packets decode with the right id', () => {
    for (const id of [...P.STATUS_CHARS, ...P.STROKE_CHARS]) {
      const d = D.decodeMultiplexed(P.buildMuxPacket(id, snap));
      expect(d.ok).toBe(true);
      expect(d.muxId).toBe(id & 0xff);
    }
  });

  test('malformed packets fail decoding cleanly', () => {
    const bad = P.malform(P.buildPacket(0x0031, snap), () => 0.5);
    expect(bad.length).toBeLessThan(19);
    expect(D.decodeGeneralStatus(bad).ok).toBe(false);
  });

  test('no stroke packets before the first stroke', () => {
    expect(P.buildPacket(0x0035, new RowerModel().snapshot())).toBeNull();
  });
});
