/**
 * Connects a RaceEngine to the data source manager (samples, link status) and the session
 * logger (every race event), and ticks it. Returns an unbind function.
 */
import { realClock } from '../lib/clock';
import { nullLogger } from '../data/PacketSource';

const TICK_MS = 100;

/**
 * @param {import('./engine').RaceEngine} engine
 * @param {{ on: Function, current?: { status?: string } }} source SourceManager (or any emitter)
 * @param {{ logger?: object, clock?: import('../lib/clock').Clock }} [opts]
 */
export function bindEngine(engine, source, { logger = nullLogger, clock = realClock } = {}) {
  const unsubs = [
    source.on('sample', (s) => engine.pushSample(s)),
    source.on('status', ({ status }) => engine.setLinkStatus(status)),
    engine.on('state', ({ state, prev, reason }) =>
      logger.race('state', { state, prev, reason, ...positions(engine) }),
    ),
    engine.on('countdown', (n) => logger.race('countdown', { n })),
    engine.on('resumeCountdown', (n) => logger.race('resumeCountdown', { n })),
    engine.on('rebase', (r) => logger.race('rebase', r)),
    engine.on('glitch', (g) => logger.race('glitch', g)),
    engine.on('split', (s) => logger.race('split', s)),
    engine.on('offerEnd', () => logger.race('offerEnd', positions(engine))),
    engine.on('finish', (r) =>
      logger.race('finish', {
        reason: r.reason,
        time: r.time,
        distance: r.distance,
        avgPace: r.avgPace,
        rank: r.rank,
        total: r.total,
      }),
    ),
  ];
  if (source.current?.status) engine.setLinkStatus(source.current.status);
  const timer = clock.setInterval(() => engine.tick(), TICK_MS);
  return () => {
    clock.clearInterval(timer);
    for (const u of unsubs) u();
  };
}

/** Race and PM5 positions for log lines (baselines are what remote debugging needs). */
function positions(e) {
  return {
    raceTime: round(e.raceTime()),
    raceDistance: round(e.distance),
    pm5Distance: round(e.latest?.distance),
    pm5Elapsed: round(e.latest?.elapsed),
    baseline: round(e.baseline),
    offset: round(e.offset),
  };
}

const round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
