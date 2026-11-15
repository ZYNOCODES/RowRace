/**
 * Injectable clock so time-based logic (reconnect backoff, stale detection, mock rowing,
 * replay) runs deterministically in tests.
 * @typedef {{ now: () => number, setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout,
 *   setInterval: typeof setInterval, clearInterval: typeof clearInterval }} Clock
 */

/** @type {Clock} */
export const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

/**
 * Manual clock for tests: time only moves when `advance(ms)` is called.
 * @returns {Clock & { advance: (ms: number) => void }}
 */
export function createFakeClock(start = 1_000_000) {
  let now = start;
  let nextId = 1;
  /** @type {Map<number, { at: number, fn: Function, every?: number }>} */
  const timers = new Map();
  const add = (fn, ms, every) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, ms), fn, every });
    return id;
  };
  return {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => add(fn, ms, Math.max(1, ms)),
    clearInterval: (id) => timers.delete(id),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let nextIdFound = null;
        let next = null;
        for (const [id, t] of timers) {
          if (t.at <= end && (!next || t.at < next.at)) {
            next = t;
            nextIdFound = id;
          }
        }
        if (!next) break;
        now = next.at;
        if (next.every) next.at += next.every;
        else timers.delete(nextIdFound);
        next.fn();
      }
      now = end;
    },
  };
}
