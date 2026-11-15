/**
 * Owns the active data source. The rest of the app subscribes here (`sourceManager.on`) and
 * keeps its listeners when the source is swapped (Real PM5 ↔ Simulator ↔ Replay).
 * Also pushes throttled connection/diagnostic state into the zustand connection store.
 *
 * Factories are injected so this module stays free of native imports (testable).
 */
import { Emitter } from '../lib/emitter';
import { realClock } from '../lib/clock';
import { nullLogger } from './PacketSource';

const RECENT_PACKETS = 40;
const UI_PUSH_EVERY_MS = 250;
const RATE_WINDOW_MS = 2000;

/**
 * @typedef {Object} SourceFactories
 * @property {(o: { deviceId: string, deviceName?: string }) => object} ble
 * @property {(o: { scenario?: string }) => object} mock
 * @property {(o: { text: string, name?: string, speed?: number }) => object} replay
 */

export class SourceManager extends Emitter {
  /**
   * @param {{ factories: SourceFactories, store?: { setState: Function }, logger?: object,
   *   clock?: import('../lib/clock').Clock }} opts
   */
  constructor({ factories, store, logger, clock }) {
    super();
    this.factories = factories;
    this.store = store || { setState() {} };
    this.logger = logger || nullLogger;
    this.clock = clock || realClock;
    this.source = null;
    this.unsubs = [];
    this.recent = [];
    this.arrivals = []; // [t, char] within RATE_WINDOW_MS
    this.dirty = false;
    this.uiTimer = null;
  }

  /** @returns {object|null} the active source */
  get current() {
    return this.source;
  }

  /**
   * Replaces the active source and connects it.
   * @param {'ble'|'mock'|'replay'} kind
   * @param {object} opts factory options
   */
  async use(kind, opts = {}) {
    await this.stop();
    const src = this.factories[kind](opts);
    this.source = src;
    this.recent = [];
    this.arrivals = [];
    this.logger.ble('source.use', { kind, ...summarize(opts) });
    this.store.setState({
      kind,
      status: 'connecting',
      statusDetail: {},
      deviceInfo: src.deviceInfo || {},
      lastSample: null,
      recentPackets: [],
      rates: {},
      warning: null,
      error: null,
    });
    this.wire(src);
    if (this.uiTimer == null)
      this.uiTimer = this.clock.setInterval(() => this.pushUi(), UI_PUSH_EVERY_MS);
    await src.connect();
    return src;
  }

  /** Disconnects and forgets the active source. */
  async stop() {
    for (const u of this.unsubs.splice(0)) u();
    const src = this.source;
    this.source = null;
    if (src) {
      try {
        await (src.destroy ? src.destroy() : src.disconnect());
      } catch (e) {
        this.logger.error(e, { where: 'source.stop' });
      }
    }
    if (this.uiTimer != null) this.clock.clearInterval(this.uiTimer);
    this.uiTimer = null;
    this.store.setState({ status: 'idle', statusDetail: {} });
  }

  wire(src) {
    const on = (event, fn) => this.unsubs.push(src.on(event, fn));
    on('sample', (s) => {
      this.lastSample = s;
      this.dirty = true;
      this.emit('sample', s);
    });
    on('stroke', (s) => this.emit('stroke', s));
    on('status', (s) => {
      const { status, ...detail } = s;
      this.store.setState({ status, statusDetail: detail });
      this.emit('status', s);
    });
    on('deviceInfo', (info) => {
      this.store.setState({ deviceInfo: { ...info } });
      this.emit('deviceInfo', info);
    });
    on('error', (e) => {
      this.store.setState(e.warning ? { warning: e } : { error: e });
      this.emit('error', e);
    });
    on('packet', (p) => {
      this.recent.push(p);
      if (this.recent.length > RECENT_PACKETS) this.recent.shift();
      this.arrivals.push([p.t, p.char]);
      this.dirty = true;
    });
  }

  /** Throttled push of fast-changing values (packets, rates, last sample) to the UI store. */
  pushUi() {
    const now = this.clock.now();
    while (this.arrivals.length && now - this.arrivals[0][0] > RATE_WINDOW_MS)
      this.arrivals.shift();
    const counts = {};
    for (const [, char] of this.arrivals) counts[char] = (counts[char] || 0) + 1;
    const rates = Object.fromEntries(
      Object.entries(counts).map(([c, n]) => [
        c,
        Math.round((n / (RATE_WINDOW_MS / 1000)) * 10) / 10,
      ]),
    );
    if (!this.dirty && Object.keys(rates).length === 0) return;
    this.dirty = false;
    this.store.setState({
      recentPackets: this.recent.slice().reverse(),
      rates,
      lastSample: this.lastSample || null,
      stats: this.source ? { ...this.source.stats } : null,
    });
  }
}

/** Keeps big replay texts out of the log line. */
function summarize(opts) {
  const { text, ...rest } = opts;
  return text ? { ...rest, bytes: text.length } : rest;
}
