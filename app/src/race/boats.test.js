import { Emitter } from '../lib/emitter';
import { createFakeClock } from '../lib/clock';
import { createGhost, createPaceBoat, rankBoats, userStanding } from './paceBoats';
import { RenderSmoother } from './renderSmoother';
import { RaceEngine } from './engine';
import { bindEngine } from './bindEngine';
import { setupRace } from './testRower';

const boats = [
  { id: 'fast', name: '2:00', pace: 120 },
  { id: 'same', name: '2:05', pace: 125 },
  { id: 'slow', name: '2:10', pace: 130 },
];

describe('pace boats and ghost', () => {
  test('pace boat distance and finish time', () => {
    const b = createPaceBoat({ id: 'a', name: 'a', pace: 125 });
    expect(b.distanceAt(125)).toBeCloseTo(500);
    expect(b.finishTimeFor(2000)).toBeCloseTo(500);
  });

  test('ghost interpolates its saved trace and stops at its finish', () => {
    const g = createGhost({
      name: 'PB',
      points: [
        { t: 10, d: 50 },
        { t: 100, d: 500 },
      ],
    });
    expect(g.distanceAt(5)).toBeCloseTo(25);
    expect(g.distanceAt(55)).toBeCloseTo(275);
    expect(g.distanceAt(500)).toBe(500);
    expect(g.finishTimeFor(500)).toBeCloseTo(100);
    expect(g.finishTimeFor(1000)).toBeNull();
    expect(g.speedAt(200)).toBe(0);
  });

  test('ranking: finished boats first by time, then by distance', () => {
    const ranked = rankBoats([
      { id: 'a', distance: 400, finishTime: null },
      { id: 'b', distance: 500, finishTime: 130 },
      { id: 'c', distance: 500, finishTime: 120 },
      { id: 'd', distance: 450, finishTime: null },
    ]);
    expect(ranked.map((b) => b.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  test('standing: rank and gaps (meters and seconds) to the boats ahead and behind', () => {
    const s = userStanding(
      rankBoats([
        { id: 'x', name: 'x', distance: 110, speed: 4, finishTime: null },
        { id: 'you', name: 'you', isUser: true, distance: 100, speed: 4, finishTime: null },
        { id: 'y', name: 'y', distance: 92, speed: 4, finishTime: null },
      ]),
    );
    expect(s.rank).toBe(2);
    expect(s.total).toBe(3);
    expect(s.ahead).toMatchObject({ id: 'x', meters: 10, seconds: 2.5 });
    expect(s.behind).toMatchObject({ id: 'y', meters: 8, seconds: 2 });
  });
});

describe('live ranking in a race', () => {
  test('user at 2:05 vs 2:00 / 2:05 / 2:10 / PB ghost: live rank, gaps, final by finish time', () => {
    const ghost = {
      name: 'PB',
      points: [
        { t: 60, d: 270 },
        { t: 118, d: 500 },
      ],
    };
    const r = setupRace({ mode: 'distance', target: 500, paceBoats: boats, ghost });
    r.start();
    r.row(1, 6); // strong start
    r.row(30, 4);
    let s = r.engine.snapshot();
    expect(s.total).toBe(5);
    expect(s.boats.map((b) => b.id)).toContain('ghost');
    r.row(60, 4);
    s = r.engine.snapshot();
    expect(s.rank).toBeGreaterThan(1);
    expect(s.ahead.meters).toBeGreaterThan(0);
    expect(s.ahead.seconds).toBeGreaterThan(0);
    r.row(40, 4);
    const res = r.of('finish')[0];
    expect(res.boats.map((b) => b.id)).toEqual(['ghost', 'fast', 'you', 'same', 'slow']);
    expect(res.rank).toBe(3);
    expect(res.total).toBe(5);
  });

  test('at most 3 pace boats', () => {
    const r = setupRace({
      mode: 'free',
      paceBoats: [...boats, { id: 'extra', name: 'x', pace: 100 }],
    });
    expect(r.engine.opponents).toHaveLength(3);
  });

  test('time race: opponents ranked by distance at the end', () => {
    const r = setupRace({ mode: 'time', target: 120, paceBoats: boats });
    r.start();
    r.row(125, 4.05); // a touch faster than the 2:05 boat (no exact tie)
    const res = r.of('finish')[0];
    expect(res.boats.map((b) => b.id)).toEqual(['fast', 'you', 'same', 'slow']);
  });
});

describe('render distance', () => {
  test('smooth at 60 fps, close to the true position, never backwards', () => {
    const r = setupRace({ mode: 'free' });
    r.start();
    const truth = [];
    const out = [];
    let start = null;
    for (let i = 0; i < 60 * 30; i++) {
      r.row(1 / 60, 4, { rateMs: 250 });
      const now = r.clock.now();
      start ??= now;
      out.push(r.engine.getRenderDistance(now));
      truth.push(r.pm5.distance);
    }
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
    const late = out.slice(120).map((d, i) => Math.abs(d - truth[i + 120]));
    expect(Math.max(...late)).toBeLessThan(1.5);
  });

  test('no backward motion through a PM5 reset or a pause', () => {
    const r = setupRace({ mode: 'free' });
    r.start();
    const out = [];
    const frame = () => out.push(r.engine.getRenderDistance(r.clock.now()));
    for (let i = 0; i < 300; i++) (r.row(0.05, 4), frame());
    r.pm5.distance = 0;
    for (let i = 0; i < 100; i++) (r.row(0.05, 4), frame());
    for (let i = 0; i < 100; i++) (r.row(0.05, 4, { send: false }), frame());
    for (let i = 0; i < 200; i++) (r.row(0.05, 4), frame());
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
  });

  test('smoother never overshoots the extrapolated target', () => {
    const s = new RenderSmoother();
    s.onSample(10, 4, 0);
    let v = 0;
    for (let now = 0; now <= 3000; now += 16) v = s.at(now);
    expect(v).toBeLessThanOrEqual(14 + 1e-9); // extrapolation capped at 1 s
  });
});

describe('bindEngine', () => {
  test('feeds samples and link status, logs race events, unbinds cleanly', () => {
    const clock = createFakeClock();
    const engine = new RaceEngine({ clock });
    const source = new Emitter();
    const lines = [];
    const logger = { race: (e, f) => lines.push([e, f]) };
    const unbind = bindEngine(engine, source, { logger, clock });
    engine.configure({ mode: 'distance', target: 10 });
    engine.go();
    let d = 100;
    for (let i = 0; i < 100; i++) {
      clock.advance(100);
      d += 0.4;
      source.emit('sample', { distance: d, elapsed: i / 10, speed: 4 });
    }
    source.emit('status', { status: 'reconnecting' });
    expect(lines.map(([e]) => e)).toEqual(expect.arrayContaining(['state', 'countdown', 'finish']));
    const start = lines.find(([e, f]) => e === 'state' && f.state === 'racing')[1];
    expect(start.baseline).toBeGreaterThan(100);
    unbind();
    expect(source.listeners.get('sample').size).toBe(0);
  });
});
