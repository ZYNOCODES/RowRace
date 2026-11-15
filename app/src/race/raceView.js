/**
 * Read-only views of a RaceEngine: boats and standings at a race time, the HUD snapshot and
 * the final result. Kept apart from the state machine in engine.js.
 */
import { rankBoats, userStanding } from './paceBoats';

/** Average speed over the last ~5 s of the trace (steadier than the per-stroke speed). */
export function recentSpeed(engine) {
  const tr = engine.stats?.trace;
  if (!tr || tr.length < 2) return engine.speed ?? 0;
  const last = tr[tr.length - 1];
  let i = tr.length - 2;
  while (i > 0 && last.t - tr[i].t < 5) i--;
  const a = tr[i];
  return last.t > a.t ? (last.d - a.d) / (last.t - a.t) : (engine.speed ?? 0);
}

/**
 * Every boat at race time t, ranked. For the final standing, distance-race opponents are
 * ranked by their finish time even if they cross the line after the user.
 */
export function boatsAt(engine, t, final = false) {
  const target = engine.cfg.mode === 'distance' ? engine.cfg.target : null;
  const distance = engine.distance ?? 0;
  const me = {
    id: 'you',
    name: 'you',
    kind: 'user',
    isUser: true,
    distance,
    speed: recentSpeed(engine),
    finishTime: target != null && final && distance >= target ? engine.accum : null,
  };
  const others = engine.opponents.map((o) => {
    const ft = target != null ? o.finishTimeFor(target) : null;
    return {
      id: o.id,
      name: o.name,
      kind: o.kind,
      isUser: false,
      distance: target != null ? Math.min(target, o.distanceAt(t)) : o.distanceAt(t),
      speed: o.speedAt(t),
      finishTime: ft != null && (final || t >= ft) ? ft : null,
    };
  });
  return rankBoats([me, ...others]);
}

export function buildResult(engine, time, distance, reason) {
  const summary = engine.stats ? engine.stats.summary(time, distance) : { time, distance };
  const boats = boatsAt(engine, time, true);
  return {
    mode: engine.cfg.mode,
    target: engine.cfg.target,
    reason,
    ...summary,
    boats,
    ...userStanding(boats),
  };
}

export function buildSnapshot(engine, now) {
  const cfg = engine.cfg;
  const t = engine.raceTime(now);
  const distance = engine.distance ?? 0;
  const boats = cfg ? boatsAt(engine, t) : [];
  const s = engine.state;
  const counting = s === 'countdown' || s === 'resuming';
  let remaining = null;
  let progress = null;
  if (cfg?.mode === 'distance') {
    remaining = Math.max(0, cfg.target - distance);
    progress = Math.min(1, distance / cfg.target);
  } else if (cfg?.mode === 'time') {
    remaining = Math.max(0, cfg.target - t);
    progress = Math.min(1, t / cfg.target);
  }
  return {
    state: s,
    mode: cfg?.mode ?? null,
    target: cfg?.target ?? null,
    raceTime: t,
    distance,
    remaining,
    progress,
    sample: engine.latest,
    speed: engine.speed ?? 0,
    countdown: counting ? engine.lastCount : null,
    pauseReason: s === 'paused' ? engine.pauseReason : null,
    pausedForMs: s === 'paused' ? now - engine.pausedAt : 0,
    offerEnd: !!engine.offerEnd,
    boats,
    ...(boats.length ? userStanding(boats) : {}),
    splits: engine.stats ? engine.stats.splits.length : 0,
    result: engine.result,
  };
}
