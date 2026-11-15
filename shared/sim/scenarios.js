/**
 * Test scenarios shared by the PC simulator (`--scenario`) and the in-app mock (Dev menu).
 *
 * A scenario is created with the starting pace/spm and returns `update(t, model)`, called
 * every tick with the time since the scenario started. It changes the model directly
 * (pace, spm, rowing, reset) and returns *transport actions* for the host to carry out:
 *   { type: 'stall', seconds }       stop notifying, stay connected
 *   { type: 'disconnect', seconds }  drop the link (the host reconnects or waits)
 *   { type: 'malformed', count }     send `count` truncated packets
 *   { type: 'sampleRate', value }    force a 0x0034 rate (0..3)
 * Plus `malformedRate` (0..1): chance that any packet is sent truncated.
 */

/** @typedef {{ type: string, [k: string]: any }} TransportAction */
/** @typedef {{ name: string, malformedRate: number, update: (t: number, model: any) => TransportAction[] }} Scenario */

/** Fires `fn` once when `t` crosses `at`. */
function once(at, fn) {
  let done = false;
  return (t, model) => {
    if (done || t < at) return [];
    done = true;
    return fn(model) || [];
  };
}

/** Fires `fn` once per period, first at `first`. */
function every(period, first, fn) {
  let next = first;
  return (t, model) => {
    if (t < next) return [];
    next += period;
    return fn(model) || [];
  };
}

const BUILDERS = {
  /** Constant pace with natural drift. */
  steady: () => ({ update: (_t, m) => (m.setRowing(true), []) }),

  /** Steady, then a sprint (−10 s/500 m, +8 spm) from `sprintAt` seconds. */
  sprint: ({ pace, spm, sprintAt = 60 }) => ({
    update: (t, m) => {
      m.setRowing(true);
      if (t >= sprintAt) {
        m.setPace(pace - 10);
        m.setSpm(spm + 8);
      }
      return [];
    },
  }),

  /** Pace degrades by 0.06 s/500 m every second, stroke rate slowly drops. */
  fatigue: ({ pace, spm }) => ({
    update: (t, m) => {
      m.setRowing(true);
      m.setPace(Math.min(pace + 25, pace + t * 0.06));
      m.setSpm(Math.max(spm - 5, spm - t * 0.02));
      return [];
    },
  }),

  /** 60 s work / 30 s rest (not rowing). */
  intervals: () => ({
    update: (t, m) => (m.setRowing(t % 90 < 60), []),
  }),

  /** Row 20 s, stop 5 s (rowing state inactive), repeat. */
  'stop-go': () => ({
    update: (t, m) => (m.setRowing(t % 25 < 20), []),
  }),

  /** PM5 reset pressed after `resetAt` seconds (distance and time back to 0). */
  'reset-mid-race': ({ resetAt = 30 }) => {
    const fire = once(resetAt, (m) => m.reset());
    return { update: (t, m) => (m.setRowing(true), fire(t, m)) };
  },

  /** Link drops for 5 s every 60 s, starting at 20 s. */
  disconnect: () => {
    const fire = every(60, 20, () => [{ type: 'disconnect', seconds: 5 }]);
    return { update: (t, m) => (m.setRowing(true), fire(t, m)) };
  },

  /** Alternates a 5 s stall (connected, silent) and a 5 s disconnect, every 30 s. */
  dropouts: () => {
    let n = 0;
    const fire = every(30, 30, () => [
      n++ % 2 === 0 ? { type: 'stall', seconds: 5 } : { type: 'disconnect', seconds: 5 },
    ]);
    return { update: (t, m) => (m.setRowing(true), fire(t, m)) };
  },

  /** 1% of packets are sent with a wrong length. */
  noisy: () => ({ malformedRate: 0.01, update: (_t, m) => (m.setRowing(true), []) }),

  /** Old-firmware behavior: status at 1 s whatever the app asks for. */
  'slow-rate': () => {
    const fire = once(0, () => [{ type: 'sampleRate', value: 0, locked: true }]);
    return { update: (t, m) => (m.setRowing(true), fire(t, m)) };
  },

  /** Nothing automatic: start/stop rowing by hand (simulator keyboard). */
  manual: () => ({ update: () => [] }),
};

/** Aliases used by the brief / Dev menu labels. */
const ALIASES = {
  'sprint-finish': 'sprint',
  'stop-and-go': 'stop-go',
  reset: 'reset-mid-race',
  'pm5-reset': 'reset-mid-race',
  'disconnect-5s': 'disconnect',
  'noisy-packets': 'noisy',
  'slow-sample-rate': 'slow-rate',
};

const SCENARIO_NAMES = Object.keys(BUILDERS);

/**
 * @param {string} name
 * @param {{ pace: number, spm: number, [k: string]: any }} opts
 * @returns {Scenario}
 */
function createScenario(name, opts) {
  const key = ALIASES[name] || name;
  const build = BUILDERS[key];
  if (!build)
    throw new Error(`Unknown scenario "${name}". Use one of: ${SCENARIO_NAMES.join(', ')}`);
  const s = build(opts);
  return { name: key, malformedRate: s.malformedRate || 0, update: s.update };
}

module.exports = { createScenario, SCENARIO_NAMES };
