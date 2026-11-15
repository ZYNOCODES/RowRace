/**
 * Re-broadcasts a captured session (client app log or simulator log) over BLE with the
 * original timing. Only PM5 → app traffic (`dir: notify`) is replayed; each packet goes to
 * the same characteristic it came from. If the app only subscribed to multiplexed 0x0080,
 * individual packets are decoded and re-encoded in the multiplexed layout.
 */
const { EventEmitter } = require('events');
const {
  SHORT,
  bytes: B,
  log,
  decodeCharacteristic,
  encodeMultiplexed,
  shortIdLabel,
} = require('@rowrace/shared');

class ReplayCore extends EventEmitter {
  /**
   * @param {string} text JSONL file contents
   * @param {{ speed?: number, loop?: boolean, logger?: object }} [opts]
   */
  constructor(text, opts = {}) {
    super();
    this.packets = log.extractPackets(text).filter((p) => p.dir === 'notify');
    if (this.packets.length === 0) throw new Error('No PM5 notify packets found in this log.');
    this.speed = opts.speed || 1;
    this.loop = !!opts.loop;
    this.logger = opts.logger || { packet() {}, event() {} };
    this.index = 0;
    this.t = 0; // ms since replay start (in log time, already scaled by speed)
    this.origin = this.packets[0].t;
    this.transport = null;
    this.sent = 0;
    this.paused = false;
  }

  attach(transport) {
    this.transport = transport;
  }

  get duration() {
    return (this.packets[this.packets.length - 1].t - this.origin) / 1000;
  }

  /** Waits for a subscriber before starting the clock, so nothing is lost before connect. */
  tick(dtMs) {
    if (this.paused || !this.transport || !this.hasSubscriber()) return;
    this.t += dtMs * this.speed;
    while (this.index < this.packets.length && this.packets[this.index].t - this.origin <= this.t) {
      this.send(this.packets[this.index++]);
    }
    if (this.index >= this.packets.length) {
      this.logger.event('replay.end', { loop: this.loop });
      this.emit('end');
      if (this.loop) {
        this.index = 0;
        this.t = 0;
      } else {
        this.paused = true;
      }
    }
  }

  hasSubscriber() {
    return [0x31, 0x32, 0x33, 0x35, 0x36, 0x80].some((id) => this.transport.isSubscribed(id));
  }

  send(p) {
    const bytes = B.fromHex(p.hex);
    let target = p.shortId;
    let payload = bytes;
    if (!this.transport.isSubscribed(target) && target !== SHORT.MULTIPLEXED) {
      if (!this.transport.isSubscribed(SHORT.MULTIPLEXED)) return;
      const decoded = decodeCharacteristic(p.shortId, bytes);
      if (!decoded.ok) return; // a malformed original can't be re-encoded; skip it
      target = SHORT.MULTIPLEXED;
      payload = encodeMultiplexed(p.shortId & 0xff, decoded);
    }
    this.transport.notify(target, payload);
    this.sent += 1;
    this.logger.packet(
      'notify',
      shortIdLabel(target),
      payload,
      decodeCharacteristic(target, payload),
    );
  }

  status() {
    return {
      replay: true,
      progress: this.index / this.packets.length,
      position: this.t / 1000,
      duration: this.duration,
      speed: this.speed,
      sent: this.sent,
      waiting: this.transport ? !this.hasSubscriber() : true,
    };
  }

  togglePause() {
    this.paused = !this.paused;
  }
}

module.exports = { ReplayCore };
