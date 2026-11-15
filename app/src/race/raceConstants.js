/** Race engine states and tunables (see engine.js). */

export const RaceState = Object.freeze({
  IDLE: 'idle',
  READY: 'ready',
  COUNTDOWN: 'countdown',
  RACING: 'racing',
  PAUSED: 'paused',
  RESUMING: 'resuming',
  FINISHED: 'finished',
});

export const DEFAULTS = Object.freeze({
  countdownSec: 5,
  resumeCountdownSec: 3,
  lostAfterMs: 3000,
  offerEndAfterMs: 60000,
  resetDropMeters: 2,
  resetDropSeconds: 2,
  maxSpeed: 8, // m/s
  jumpAllowance: 15, // m allowed on top of maxSpeed × Δt
  jumpConfirmSamples: 3,
  maxPaceBoats: 3,
});

export const LINK_DOWN = new Set(['reconnecting', 'disconnected', 'failed']);
