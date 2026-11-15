import { RaceState } from './engine';
import { setupRace } from './testRower';

describe('normal distance race', () => {
  test('countdown 5…1, GO, finish with sub-sample precision', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.row(3, 0); // PM5 idle before GO
    r.start();
    expect(r.of('countdown')).toEqual([5, 4, 3, 2, 1, 0]);
    expect(r.engine.state).toBe(RaceState.RACING);
    r.row(130, 4); // 4 m/s → 500 m in 125 s
    expect(r.engine.state).toBe(RaceState.FINISHED);
    const res = r.of('finish')[0];
    expect(res.reason).toBe('finished');
    expect(res.distance).toBe(500);
    expect(res.time).toBeGreaterThan(124.7);
    expect(res.time).toBeLessThan(125.3);
    expect(res.avgPace).toBeCloseTo(125, 0);
    expect(res.splits).toHaveLength(1);
    expect(res.splits[0].time).toBeCloseTo(res.time, 1);
    expect(res.avgWatts).toBeCloseTo(180, 0);
    expect(res.avgSpm).toBeCloseTo(24, 0);
    expect(r.states()).toEqual(['ready', 'countdown', 'racing', 'finished']);
  });

  test('baseline: PM5 distance before GO (and rowing during the countdown) is not counted', () => {
    const r = setupRace({ mode: 'distance', target: 100 });
    r.send({ distance: 1234.5, elapsed: 300 });
    r.engine.go();
    r.row(5, 4); // rowing through the countdown
    expect(r.engine.snapshot().distance).toBe(0);
    r.row(10, 4);
    expect(r.engine.snapshot().distance).toBeCloseTo(40, 0);
  });

  test('GO before any PM5 data: the first sample becomes the baseline', () => {
    const r = setupRace({ mode: 'distance', target: 100 });
    r.engine.go();
    r.wait(5000);
    expect(r.engine.state).toBe(RaceState.RACING);
    r.pm5.distance = 777;
    r.row(5, 4);
    expect(r.engine.snapshot().distance).toBeCloseTo(19, 0);
    expect(r.engine.state).toBe(RaceState.RACING);
  });

  test('splits every 500 m in a 2 km race', () => {
    const r = setupRace({ mode: 'distance', target: 2000 });
    r.start();
    r.row(510, 4);
    const splits = r.of('split');
    expect(splits.map((s) => s.distance)).toEqual([500, 1000, 1500, 2000]);
    for (const s of splits) expect(s.pace).toBeCloseTo(125, 0);
  });

  test('race time comes from the app clock, not PM5 elapsed', () => {
    const r = setupRace({ mode: 'distance', target: 1000 });
    r.start();
    r.row(10, 4);
    r.send({ elapsed: 99999 }); // nonsense PM5 time (it's not used for the clock)
    expect(r.engine.snapshot().raceTime).toBeCloseTo(10, 1);
  });
});

describe('PM5 reset mid-race', () => {
  test('distance continues smoothly, no backward jump, logged as rebase', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.start();
    r.row(50, 4); // ~200 m
    const before = r.engine.snapshot().distance;
    r.pm5.distance = 0; // reset pressed
    r.pm5.elapsed = 0;
    r.row(1, 4);
    const after = r.engine.snapshot().distance;
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after - before).toBeLessThan(6);
    expect(r.of('rebase')[0].reason).toBe('pm5-reset');
    r.row(80, 4);
    const res = r.of('finish')[0];
    expect(res.time).toBeCloseTo(125, 0);
  });

  test('calories keep adding up across the reset', () => {
    const r = setupRace({ mode: 'time', target: 60 });
    r.start();
    r.row(30, 4);
    r.pm5.calories = 0;
    r.pm5.distance = 0;
    r.row(31, 4);
    const res = r.of('finish')[0];
    expect(res.calories).toBeCloseTo((900 / 3600) * 60, 0);
  });
});

describe('signal lost', () => {
  test('3 s without data → paused, clock frozen at the last sample; resume 3-2-1; gap not counted', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.start();
    r.row(60, 4); // 240 m
    r.row(10, 4, { send: false }); // link down 10 s, the rower keeps going (+40 m on the PM5)
    expect(r.engine.state).toBe(RaceState.PAUSED);
    const paused = r.engine.snapshot();
    expect(paused.raceTime).toBeCloseTo(60, 0);
    expect(paused.pauseReason).toBe('signal-lost');
    r.row(1, 4); // data back
    expect(r.engine.state).toBe(RaceState.RESUMING);
    r.row(3, 4);
    expect(r.engine.state).toBe(RaceState.RACING);
    expect(r.of('resumeCountdown')).toEqual([3, 2, 1, 0]);
    const resumed = r.engine.snapshot();
    // The 40 m rowed while the link was down are not counted (only ~2 m rowed since resuming).
    expect(resumed.distance - paused.distance).toBeLessThan(5);
    // 60 s before the outage + < 1 s since resuming: the 10 s outage and the 3 s countdown are not counted.
    expect(resumed.raceTime).toBeGreaterThan(60);
    expect(resumed.raceTime).toBeLessThan(61);
    r.row(70, 4);
    expect(r.of('finish')[0].time).toBeCloseTo(125, 0);
  });

  test('link status reconnecting pauses at once; data during reconnecting does not resume', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.start();
    r.row(20, 4);
    r.engine.setLinkStatus('reconnecting');
    expect(r.engine.state).toBe(RaceState.PAUSED);
    expect(r.engine.snapshot().pauseReason).toBe('link-reconnecting');
    r.send({});
    expect(r.engine.state).toBe(RaceState.PAUSED);
    r.engine.setLinkStatus('connected');
    r.row(1, 4);
    expect(r.engine.state).toBe(RaceState.RESUMING);
  });

  test('data stops again during the resume countdown → back to paused', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.start();
    r.row(10, 4);
    r.wait(4000);
    r.row(1, 4);
    expect(r.engine.state).toBe(RaceState.RESUMING);
    r.wait(3500);
    expect(r.engine.state).toBe(RaceState.PAUSED);
  });

  test('link drops again during the 3-2-1 resume → back to paused, then resumes later', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.start();
    r.row(10, 4);
    r.wait(4000);
    r.row(1, 4);
    expect(r.engine.state).toBe(RaceState.RESUMING);
    r.engine.setLinkStatus('reconnecting');
    expect(r.engine.state).toBe(RaceState.PAUSED);
    expect(r.engine.snapshot().pauseReason).toBe('link-reconnecting');
    r.engine.setLinkStatus('connected');
    r.row(4, 4);
    expect(r.engine.state).toBe(RaceState.RACING);
  });

  test('after 60 s: offer End race / Keep waiting', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.start();
    r.row(10, 4);
    r.wait(64000); // paused 3 s after the last sample, offer 60 s later
    expect(r.engine.snapshot().offerEnd).toBe(true);
    expect(r.of('offerEnd')).toHaveLength(1);
    r.engine.keepWaiting();
    expect(r.engine.snapshot().offerEnd).toBe(false);
    r.wait(30000);
    expect(r.engine.snapshot().offerEnd).toBe(false);
    r.engine.end('abandoned');
    const res = r.of('finish')[0];
    expect(res.reason).toBe('abandoned');
    expect(res.distance).toBeCloseTo(40, 0);
    expect(res.time).toBeCloseTo(10, 0);
  });
});

describe('glitches', () => {
  test('one impossible jump is ignored; garbage samples are ignored', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.start();
    r.row(10, 4);
    const d = r.engine.snapshot().distance;
    r.engine.pushSample({ ...r.pm5, distance: r.pm5.distance + 100 });
    r.engine.pushSample({ ...r.pm5, distance: NaN });
    r.engine.pushSample(null);
    expect(r.engine.snapshot().distance).toBeCloseTo(d, 0);
    expect(r.of('glitch')).toHaveLength(1);
    r.row(5, 4);
    expect(r.engine.snapshot().distance).toBeCloseTo(d + 20, 0);
  });

  test('a jump confirmed by 3 samples is absorbed without moving the boat forward', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.start();
    r.row(10, 4);
    const d = r.engine.snapshot().distance;
    r.pm5.distance += 300; // persistent shift
    r.row(1, 4);
    expect(r.of('rebase').map((x) => x.reason)).toEqual(['confirmed-jump']);
    expect(r.engine.snapshot().distance).toBeLessThan(d + 6);
  });

  test('speed clamped to 0–8 m/s', () => {
    const r = setupRace({ mode: 'free' });
    r.start();
    r.send({ distance: 1, speed: 30 });
    r.send({ distance: 1.5, speed: -3 });
    expect(r.engine.snapshot().speed).toBe(0);
    r.send({ distance: 2, speed: 30 });
    expect(r.engine.snapshot().speed).toBe(8);
  });
});

describe('time race and free mode', () => {
  test('time race ends at exactly the target time with the distance covered', () => {
    const r = setupRace({ mode: 'time', target: 60 });
    r.start();
    r.row(65, 4);
    const res = r.of('finish')[0];
    expect(res.reason).toBe('time-up');
    expect(res.time).toBe(60);
    expect(res.distance).toBeCloseTo(240, 0);
    expect(r.engine.snapshot().progress).toBe(1);
  });

  test('time does not run while paused', () => {
    const r = setupRace({ mode: 'time', target: 60 });
    r.start();
    r.row(30, 4);
    r.row(20, 4, { send: false });
    expect(r.engine.state).toBe(RaceState.PAUSED);
    r.row(4, 4);
    r.row(35, 4);
    expect(r.of('finish')[0].time).toBe(60);
  });

  test('free mode never finishes by itself; Exit ends it', () => {
    const r = setupRace({ mode: 'free' });
    r.start();
    r.row(600, 4);
    expect(r.engine.state).toBe(RaceState.RACING);
    const snap = r.engine.snapshot();
    expect(snap.progress).toBeNull();
    expect(snap.remaining).toBeNull();
    r.engine.end('exit');
    const res = r.of('finish')[0];
    expect(res.reason).toBe('exit');
    expect(res.distance).toBeCloseTo(2400, -1);
  });

  test('ending during the countdown cancels back to ready', () => {
    const r = setupRace({ mode: 'distance', target: 500 });
    r.engine.go();
    r.wait(2000);
    r.engine.end();
    expect(r.engine.state).toBe(RaceState.READY);
    expect(r.of('finish')).toHaveLength(0);
  });

  test('configuration is validated', () => {
    const r = setupRace({ mode: 'free' });
    expect(() => r.engine.configure({ mode: 'distance' })).toThrow(/target/);
    expect(() => r.engine.configure({ mode: 'sprint', target: 1 })).toThrow(/mode/);
  });
});
