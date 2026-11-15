/**
 * Base class of every data source (real PM5, in-app mock, replay). Sources only produce raw
 * bytes per characteristic and call `handlePacket`; decoding, logging and merging are here,
 * so all three sources run exactly the same parsing path.
 *
 * Events (subscribe with `on(event, cb)`, which returns an unsubscribe function):
 *   sample     normalized Sample (see sampleMerger.js)
 *   stroke     one per stroke
 *   status     { status, ...detail } — connecting | connected | reconnecting | stale |
 *              disconnected | failed
 *   deviceInfo { name, serialNumber, firmwareRevision, ergMachineType, ... }
 *   packet     { t, char, hex, ok, decoded, error } for the Diagnostics screen
 *   error      { code, message } for user-facing problems
 */
import { decodeCharacteristic, shortIdLabel } from '@rowrace/shared';
import { Emitter } from '../lib/emitter';
import { realClock } from '../lib/clock';
import { SampleMerger } from './sampleMerger';

/** @typedef {'ble'|'mock'|'replay'} SourceKind */
/** @typedef {'idle'|'connecting'|'connected'|'reconnecting'|'stale'|'disconnected'|'failed'} SourceStatus */

/** No packet for this long while connected → status `stale`. */
export const STALE_AFTER_MS = 3000;
const WATCHDOG_EVERY_MS = 250;

/** Logger used when none is injected (tests). */
export const nullLogger = { packet() {}, ble() {}, error() {}, race() {} };

export class PacketSource extends Emitter {
  /**
   * @param {{ kind: SourceKind, logger?: object, clock?: import('../lib/clock').Clock }} opts
   */
  constructor({ kind, logger, clock }) {
    super();
    this.kind = kind;
    this.logger = logger || nullLogger;
    this.clock = clock || realClock;
    this.merger = new SampleMerger();
    /** @type {SourceStatus} */
    this.status = 'idle';
    this.statusDetail = {};
    this.deviceInfo = {};
    this.lastPacketAt = 0;
    this.stats = { packets: 0, errors: 0, byChar: {} };
    this.watchdog = null;
  }

  /** Starts stale-data detection. Call once the link is up; `stopWatchdog` on teardown. */
  startWatchdog() {
    this.stopWatchdog();
    this.lastPacketAt = this.clock.now();
    this.watchdog = this.clock.setInterval(() => {
      if (this.status !== 'connected') return;
      const silentMs = this.clock.now() - this.lastPacketAt;
      if (silentMs > STALE_AFTER_MS) this.setStatus('stale', { silentMs });
    }, WATCHDOG_EVERY_MS);
  }

  stopWatchdog() {
    if (this.watchdog != null) this.clock.clearInterval(this.watchdog);
    this.watchdog = null;
  }

  /** @abstract */
  async connect() {}

  /** @abstract */
  async disconnect() {}

  /**
   * Entry point for raw notifications.
   * @param {number} shortId characteristic it arrived on (0x0031…, or 0x0080)
   * @param {Uint8Array} bytes
   * @param {'notify'|'read'} [dir]
   */
  handlePacket(shortId, bytes, dir = 'notify') {
    const t = this.clock.now();
    const char = shortIdLabel(shortId);
    const decoded = decodeCharacteristic(shortId, bytes);
    this.lastPacketAt = t;
    if (this.status === 'stale') this.setStatus('connected');
    this.stats.packets += 1;
    this.stats.byChar[char] = (this.stats.byChar[char] || 0) + 1;
    this.logger.packet(dir, char, decoded.hex, decoded);

    if (!decoded.ok) {
      this.stats.errors += 1;
      this.emit('packet', { t, char, hex: decoded.hex, ok: false, error: decoded.error });
      return;
    }
    this.emit('packet', { t, char, hex: decoded.hex, ok: true, decoded });
    const id = decoded.muxId ?? shortId;
    const { sample, strokes } = this.merger.push(id, decoded, t, char);
    for (const s of strokes) this.emit('stroke', s);
    if (sample) this.emit('sample', sample);
  }

  /**
   * @param {SourceStatus} status
   * @param {object} [detail] e.g. { attempt, nextRetryMs, reason }
   */
  setStatus(status, detail = {}) {
    const same =
      status === this.status && JSON.stringify(detail) === JSON.stringify(this.statusDetail);
    if (same) return;
    this.status = status;
    this.statusDetail = detail;
    this.logger.ble('status', { status, ...detail });
    this.emit('status', { status, ...detail });
  }

  /** @param {object} patch */
  setDeviceInfo(patch) {
    this.deviceInfo = { ...this.deviceInfo, ...patch };
    this.emit('deviceInfo', this.deviceInfo);
  }

  /** User-facing problem (also logged). @param {string} code @param {string} [message] */
  fail(code, message) {
    this.logger.error(message || code, { code });
    this.emit('error', { code, message });
  }

  /** New session (PM5 reset or new race): forget merged values. */
  resetMerger() {
    this.merger.reset();
  }
}
