/**
 * Opponents in solo mode: constant-pace boats and an optional "personal best" ghost replayed
 * from a saved race trace. Plus the live ranking and gaps shown in the HUD.
 * Pure functions of race time (seconds since GO, pauses excluded).
 */

/**
 * @typedef {Object} Opponent
 * @property {string} id
 * @property {string} name
 * @property {'pace'|'ghost'} kind
 * @property {(t: number) => number} distanceAt meters at race time t
 * @property {(t: number) => number} speedAt m/s at race time t
 * @property {(target: number) => number|null} finishTimeFor seconds to cover `target` meters
 */

/**
 * @param {{ id: string, name: string, pace: number }} o pace in s/500 m
 * @returns {Opponent}
 */
export function createPaceBoat({ id, name, pace }) {
  const speed = pace > 0 ? 500 / pace : 0;
  return {
    id,
    name,
    kind: 'pace',
    pace,
    distanceAt: (t) => speed * Math.max(0, t),
    speedAt: () => speed,
    finishTimeFor: (target) => (speed > 0 ? target / speed : null),
  };
}

/**
 * Ghost of a saved race. `points` is the saved trace: [{ t, d }] with t in race seconds.
 * Before the first point it starts from 0; after the last point it stays where it finished.
 * @param {{ id?: string, name: string, points: { t: number, d: number }[] }} o
 * @returns {Opponent}
 */
export function createGhost({ id = 'ghost', name, points }) {
  const pts = [{ t: 0, d: 0 }, ...points.filter((p) => p.t > 0)].sort((a, b) => a.t - b.t);
  const last = pts[pts.length - 1];

  const distanceAt = (t) => {
    if (t <= 0) return 0;
    if (t >= last.t) return last.d;
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = pts[lo];
    const b = pts[hi];
    return a.d + ((b.d - a.d) * (t - a.t)) / (b.t - a.t || 1);
  };

  return {
    id,
    name,
    kind: 'ghost',
    distanceAt,
    speedAt: (t) => (t >= last.t ? 0 : Math.max(0, distanceAt(t + 1) - distanceAt(t))),
    finishTimeFor: (target) => {
      if (last.d < target) return null;
      // Time at which the ghost reached `target` (inverse interpolation).
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].d >= target) {
          const a = pts[i - 1];
          const b = pts[i];
          return a.t + ((b.t - a.t) * (target - a.d)) / (b.d - a.d || 1);
        }
      }
      return null;
    },
  };
}

/**
 * @typedef {{ id: string, name: string, distance: number, speed: number, finishTime: number|null,
 *   isUser: boolean }} BoatState
 */

/**
 * Sorts boats: finished boats first (fastest time first), then by distance covered.
 * @param {BoatState[]} boats
 * @returns {BoatState[]}
 */
export function rankBoats(boats) {
  return [...boats].sort((a, b) => {
    const af = a.finishTime != null;
    const bf = b.finishTime != null;
    if (af && bf) return a.finishTime - b.finishTime;
    if (af !== bf) return af ? -1 : 1;
    return b.distance - a.distance;
  });
}

/**
 * Rank of the user and the gap to the boats just ahead and behind.
 * Gap in seconds = meters between the two boats / speed of the boat that still has to cover
 * them (the one behind), so it reads "how long until they catch up". Null when not moving.
 * @param {BoatState[]} ranked output of rankBoats
 */
export function userStanding(ranked) {
  const i = ranked.findIndex((b) => b.isUser);
  const me = ranked[i];
  const gap = (front, back) => {
    if (!front || !back) return null;
    const meters = Math.max(0, front.distance - back.distance);
    const seconds = back.speed > 0.1 ? meters / back.speed : null;
    return { meters, seconds };
  };
  const ahead = ranked[i - 1] || null;
  const behind = ranked[i + 1] || null;
  return {
    rank: i + 1,
    total: ranked.length,
    ahead: ahead && { id: ahead.id, name: ahead.name, ...gap(ahead, me) },
    behind: behind && { id: behind.id, name: behind.name, ...gap(me, behind) },
  };
}
