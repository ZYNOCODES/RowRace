import {
  buildRaceConfig,
  isBetter,
  ordinal,
  personalBest,
  raceKey,
  thinTrace,
  toEntry,
} from './records';

const res = (o) => ({
  mode: 'distance',
  target: 500,
  reason: 'finished',
  time: 120,
  distance: 500,
  trace: [
    { t: 0, d: 0 },
    { t: 120, d: 500 },
  ],
  ...o,
});

test('personal best: faster distance race, longer time race; exits never count', () => {
  const entries = [res({ time: 125 }), res({ time: 118 }), res({ time: 110, reason: 'exit' })].map(
    (r) => toEntry(r, { mapId: 'alpine' }),
  );
  expect(personalBest(entries, 'distance', 500).time).toBe(118);
  expect(
    isBetter(
      res({ mode: 'time', target: 300, distance: 1300 }),
      res({ mode: 'time', target: 300, distance: 1250 }),
    ),
  ).toBe(true);
  expect(isBetter(res({ mode: 'free', reason: 'exit' }), null)).toBe(false);
  expect(raceKey('distance', 500)).not.toBe(raceKey('distance', 1000));
});

test('race config: pace boats around the target, PB ghost from history', () => {
  const history = [toEntry(res({ time: 118 }), { mapId: 'alpine' })];
  const cfg = buildRaceConfig(
    {
      mode: 'distance',
      distance: 500,
      minutes: 5,
      targetPace: 125,
      paceBoatsOn: true,
      ghostOn: true,
    },
    history,
  );
  expect(cfg.target).toBe(500);
  expect(cfg.paceBoats.map((b) => b.pace)).toEqual([120, 125, 130]);
  expect(cfg.paceBoats[1].name).toBe('2:05');
  expect(cfg.ghost.points).toHaveLength(2);
  const none = buildRaceConfig(
    {
      mode: 'time',
      distance: 500,
      minutes: 10,
      targetPace: 125,
      paceBoatsOn: false,
      ghostOn: true,
    },
    history,
  );
  expect(none).toMatchObject({ mode: 'time', target: 600, paceBoats: [], ghost: null });
});

test('trace thinned for storage', () => {
  const t = Array.from({ length: 5000 }, (_, i) => ({ t: i, d: i * 4 }));
  const thin = thinTrace(t);
  expect(thin.length).toBeLessThanOrEqual(401);
  expect(thin.at(-1)).toEqual(t.at(-1));
});

test('ordinals', () => {
  expect([1, 2, 3, 4, 11, 22].map((n) => ordinal(n, 'en'))).toEqual([
    '1st',
    '2nd',
    '3rd',
    '4th',
    '11th',
    '22nd',
  ]);
  expect(ordinal(2, 'fr')).toBe('2');
});

test('pace series over distance', () => {
  // 0–250 m at 4 m/s (2:05), 250–500 m at 5 m/s (1:40)
  const trace = [
    { t: 0, d: 0 },
    { t: 62.5, d: 250 },
    { t: 112.5, d: 500 },
  ];
  const { paceSeries } = require('./records');
  const s = paceSeries(trace, 4);
  expect(s.map((p) => Math.round(p.pace))).toEqual([125, 125, 100, 100]);
  expect(paceSeries([], 4)).toEqual([]);
});
