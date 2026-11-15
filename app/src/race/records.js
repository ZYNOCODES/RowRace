/**
 * Pure helpers for saved results: compact history entries, personal bests, and the race
 * configuration built from the user's setup (pace boats + PB ghost).
 */
import { format } from '@rowrace/shared';

export const MAX_HISTORY = 200;
const MAX_TRACE_POINTS = 400;

export const DISTANCE_PRESETS = [100, 500, 1000, 2000, 5000];
export const TIME_PRESETS = [1, 5, 10, 20, 30]; // minutes
export const PACE_BOAT_OFFSETS = [-5, 0, 5]; // s/500 m around the target pace

/** Same race = same mode and target: what a personal best compares against. */
export const raceKey = (mode, target) => `${mode}:${mode === 'free' ? '-' : Math.round(target)}`;

/**
 * Is `a` better than `b`? Distance: faster time. Time: longer distance. Free: never compared.
 * Abandoned or exited races never count.
 */
export function isBetter(a, b) {
  if (!a || a.mode === 'free' || !['finished', 'time-up'].includes(a.reason)) return false;
  if (!b) return true;
  return a.mode === 'distance' ? a.time < b.time : a.distance > b.distance;
}

/** Keeps the trace small enough for storage and the chart. */
export function thinTrace(trace) {
  if (!trace || trace.length <= MAX_TRACE_POINTS) return trace || [];
  const step = trace.length / MAX_TRACE_POINTS;
  const out = [];
  for (let i = 0; i < MAX_TRACE_POINTS; i++) out.push(trace[Math.floor(i * step)]);
  out.push(trace[trace.length - 1]);
  return out;
}

/**
 * History entry from an engine result.
 * @param {object} result engine.result
 * @param {{ mapId: string, characterId?: string, now?: number }} meta
 */
export function toEntry(result, meta) {
  const now = meta.now ?? Date.now();
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    date: now,
    mapId: meta.mapId,
    characterId: meta.characterId ?? null,
    mode: result.mode,
    target: result.target,
    reason: result.reason,
    time: result.time,
    distance: result.distance,
    avgPace: result.avgPace,
    avgWatts: result.avgWatts,
    avgSpm: result.avgSpm,
    calories: result.calories,
    rank: result.rank,
    total: result.total,
    boats: (result.boats || []).map((b) => ({
      id: b.id,
      name: b.name,
      isUser: !!b.isUser,
      finishTime: b.finishTime,
      distance: b.distance,
    })),
    splits: result.splits || [],
    trace: thinTrace(result.trace),
  };
}

/** Best entry for a race key, or null. */
export function personalBest(entries, mode, target) {
  const key = raceKey(mode, target);
  let best = null;
  for (const e of entries) if (raceKey(e.mode, e.target) === key && isBetter(e, best)) best = e;
  return best;
}

/**
 * Engine configuration from the setup screen.
 * @param {{ mode: 'distance'|'time'|'free', distance: number, minutes: number,
 *   targetPace: number, paceBoatsOn: boolean, ghostOn: boolean }} setup
 * @param {object[]} history entries (for the PB ghost)
 */
export function buildRaceConfig(setup, history = []) {
  const target =
    setup.mode === 'distance'
      ? setup.distance
      : setup.mode === 'time'
        ? setup.minutes * 60
        : undefined;
  const paceBoats = setup.paceBoatsOn
    ? PACE_BOAT_OFFSETS.map((off) => {
        const pace = setup.targetPace + off;
        return { id: `pace${pace}`, name: format.formatPace(pace), pace };
      })
    : [];
  const pb =
    setup.ghostOn && setup.mode !== 'free' ? personalBest(history, setup.mode, target) : null;
  const ghost = pb?.trace?.length > 1 ? { name: 'PB', points: pb.trace } : null;
  return { mode: setup.mode, target, paceBoats, ghost };
}

/** "1st", "2nd"… for EN; other languages use the plain number. */
export function ordinal(n, lang) {
  if (lang !== 'en') return String(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Pace over distance for the results chart: the trace cut into `buckets` equal distance
 * segments, each with its average pace (s/500 m). Segments with no movement are skipped.
 * @param {{ t: number, d: number }[]} trace
 */
export function paceSeries(trace, buckets = 24) {
  if (!trace || trace.length < 2) return [];
  const total = trace[trace.length - 1].d;
  if (!(total > 0)) return [];
  const timeAt = (d) => {
    for (let i = 1; i < trace.length; i++) {
      const a = trace[i - 1];
      const b = trace[i];
      if (b.d >= d) return a.t + ((b.t - a.t) * (d - a.d)) / (b.d - a.d || 1);
    }
    return trace[trace.length - 1].t;
  };
  const out = [];
  const step = total / buckets;
  for (let k = 0; k < buckets; k++) {
    const d0 = k * step;
    const d1 = d0 + step;
    const dt = timeAt(d1) - timeAt(d0);
    if (dt > 0) out.push({ d: (d0 + d1) / 2, pace: (dt / step) * 500 });
  }
  return out;
}
