/** Minimal event emitter: `on` returns an unsubscribe function. Listener errors are isolated. */
export class Emitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /** @param {string} event @param {Function} cb @returns {() => void} */
  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  emit(event, ...args) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(...args);
      } catch (e) {
        // A broken listener must never stop the BLE pipeline.
        if (event !== 'listenerError') this.emit('listenerError', e, event);
      }
    }
  }

  removeAll() {
    this.listeners.clear();
  }
}
