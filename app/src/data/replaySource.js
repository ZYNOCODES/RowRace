/**
 * Replays a JSONL session log (from the client's real PM5 or from the simulator) through the
 * normal decode path, with the original timing at ×1, ×2 or ×4.
 */
import { bytes as B, log } from '@rowrace/shared';
import { PacketSource } from './PacketSource';

const TICK_MS = 50;

export class ReplaySource extends PacketSource {
  /**
   * @param {{ text: string, name?: string, speed?: 1|2|4, loop?: boolean, logger?: object,
   *   clock?: import('../lib/clock').Clock }} opts
   */
  constructor(opts) {
    super({ kind: 'replay', logger: opts.logger, clock: opts.clock });
    this.packets = log.extractPackets(opts.text).filter((p) => p.dir === 'notify');
    this.name = opts.name || 'log';
    this.speed = opts.speed || 1;
    this.loop = !!opts.loop;
    this.timer = null;
    this.index = 0;
    this.position = 0; // ms of log time played
  }

  /** @returns {number} seconds of log time */
  get duration() {
    if (this.packets.length < 2) return 0;
    return (this.packets[this.packets.length - 1].t - this.packets[0].t) / 1000;
  }

  async connect() {
    if (this.timer) return;
    if (this.packets.length === 0) {
      this.setStatus('failed', { reason: 'empty-log' });
      this.fail('replay-empty', 'This log contains no PM5 packets.');
      return;
    }
    this.setStatus('connecting');
    this.index = 0;
    this.position = 0;
    this.origin = this.packets[0].t;
    this.setDeviceInfo({
      name: `Replay: ${this.name}`,
      serialNumber: '-',
      firmwareRevision: 'REPLAY',
    });
    this.logger.ble('replay.start', {
      name: this.name,
      packets: this.packets.length,
      speed: this.speed,
    });
    this.setStatus('connected');
    this.startWatchdog();
    this.timer = this.clock.setInterval(() => this.tick(TICK_MS), TICK_MS);
  }

  async disconnect() {
    if (this.timer != null) this.clock.clearInterval(this.timer);
    this.timer = null;
    this.stopWatchdog();
    this.setStatus('disconnected');
  }

  /** @param {1|2|4} speed */
  setSpeed(speed) {
    this.speed = speed;
  }

  tick(dtMs) {
    this.position += dtMs * this.speed;
    while (
      this.index < this.packets.length &&
      this.packets[this.index].t - this.origin <= this.position
    ) {
      const p = this.packets[this.index++];
      this.handlePacket(p.shortId, B.fromHex(p.hex));
    }
    if (this.index < this.packets.length) return;
    this.logger.ble('replay.end', { loop: this.loop });
    if (this.loop) {
      this.index = 0;
      this.position = 0;
      this.resetMerger();
    } else {
      this.disconnect();
    }
  }

  progress() {
    return {
      position: this.position / 1000,
      duration: this.duration,
      index: this.index,
      total: this.packets.length,
    };
  }
}
