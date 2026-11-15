/**
 * Simulator core: runs the rower model + scenario and decides what to notify and when.
 * It knows nothing about Bluetooth. A transport (bleno peripheral, or a fake in tests)
 * implements:
 *   isSubscribed(shortId) → boolean
 *   notify(shortId, bytes) → void
 *   disconnect(blockSeconds) → void   drop the link, stay hidden for `blockSeconds`
 */
const { EventEmitter } = require('events');
const { SHORT, SAMPLE_RATE_MS, decodeCharacteristic, shortIdLabel } = require('@rowrace/shared');
const { RowerModel, createScenario } = require('@rowrace/shared').sim;
const { STATUS_CHARS, STROKE_CHARS, buildPacket, buildMuxPacket, malform } =
  require('@rowrace/shared').sim.packets;
const { prng } = require('@rowrace/shared').sim;

const DEFAULT_SAMPLE_RATE = 1; // 500 ms, PM5 default when the app does not set it

class SimulatorCore extends EventEmitter {
  /**
   * @param {{ pace: number, spm: number, scenario?: string, sampleRate?: number,
   *   heartRateBelt?: boolean, seed?: number, logger?: { packet: Function, event: Function } }} opts
   */
  constructor(opts) {
    super();
    this.opts = opts;
    this.basePace = opts.pace;
    this.baseSpm = opts.spm;
    this.paceOffset = 0;
    this.spmOffset = 0;
    this.userRowing = true;
    this.model = new RowerModel({
      pace: opts.pace,
      spm: opts.spm,
      seed: opts.seed,
      heartRateBelt: opts.heartRateBelt,
    });
    this.rand = prng((opts.seed ?? 42) + 1);
    this.logger = opts.logger || { packet() {}, event() {} };
    this.transport = null;
    this.sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.sampleRateLocked = false;
    this.statusTimer = 0;
    this.t = 0;
    this.stalledUntil = 0;
    this.malformedQueue = 0;
    this.sent = 0;
    this.setScenario(opts.scenario || 'steady');
  }

  /** @param {{ isSubscribed: Function, notify: Function, disconnect: Function }} transport */
  attach(transport) {
    this.transport = transport;
  }

  setScenario(name) {
    this.scenario = createScenario(name, { pace: this.basePace, spm: this.baseSpm });
    this.scenarioStart = this.t;
    this.logger.event('scenario', { name: this.scenario.name });
  }

  /** Model wrapper handed to scenarios so keyboard offsets and "stop" still apply. */
  controlled() {
    const m = this.model;
    return {
      setRowing: (on) => m.setRowing(on && this.userRowing),
      setPace: (p) => m.setPace(p + this.paceOffset),
      setSpm: (s) => m.setSpm(s + this.spmOffset),
      reset: () => this.resetPM5('scenario'),
    };
  }

  /** Advances simulated time. Call every ~50 ms. @param {number} dtMs */
  tick(dtMs) {
    const dt = dtMs / 1000;
    this.t += dt;
    const actions = this.scenario.update(this.t - this.scenarioStart, this.controlled());
    for (const a of actions) this.apply(a);

    const { stroke } = this.model.step(dt);
    const snap = this.model.snapshot();
    if (stroke) for (const id of STROKE_CHARS) this.send(id, snap);

    this.statusTimer += dtMs;
    const interval = SAMPLE_RATE_MS[this.sampleRate];
    if (this.statusTimer >= interval) {
      this.statusTimer %= interval;
      for (const id of STATUS_CHARS) this.send(id, snap);
    }
  }

  /** @param {{ type: string, [k: string]: any }} a */
  apply(a) {
    if (a.type === 'stall') this.stall(a.seconds);
    else if (a.type === 'disconnect') this.forceDisconnect(a.seconds);
    else if (a.type === 'malformed') this.malformedQueue += a.count;
    else if (a.type === 'sampleRate') {
      this.setSampleRate(a.value, 'scenario');
      if (a.locked) this.sampleRateLocked = true;
    }
  }

  isStalled() {
    return this.t < this.stalledUntil;
  }

  /** Builds and sends one characteristic, individually or multiplexed. */
  send(shortId, snap) {
    if (!this.transport || this.isStalled()) return;
    let target = null;
    let bytes = null;
    if (this.transport.isSubscribed(shortId)) {
      target = shortId;
      bytes = buildPacket(shortId, snap);
    } else if (this.transport.isSubscribed(SHORT.MULTIPLEXED)) {
      target = SHORT.MULTIPLEXED;
      bytes = buildMuxPacket(shortId, snap);
    }
    if (!bytes) return;

    let malformed = false;
    if (this.malformedQueue > 0 || this.rand() < this.scenario.malformedRate) {
      if (this.malformedQueue > 0) this.malformedQueue -= 1;
      bytes = malform(bytes, this.rand);
      malformed = true;
    }
    this.transport.notify(target, bytes);
    this.sent += 1;
    const decoded = decodeCharacteristic(target, bytes);
    this.logger.packet('notify', shortIdLabel(target), bytes, decoded, malformed);
    this.emit('packet', { shortId: target, bytes, malformed });
  }

  // ---- controls (keyboard, scenarios, GATT writes) ----

  /**
   * @param {number} value 0..3 @param {'app'|'keyboard'|'scenario'} source
   * @returns {boolean} false when refused (bad value, or old-firmware scenario)
   */
  setSampleRate(value, source) {
    if (!(value in SAMPLE_RATE_MS)) return false;
    if (this.sampleRateLocked && source === 'app') {
      this.logger.event('sampleRate.refused', { value, source });
      return false;
    }
    this.sampleRate = value;
    this.logger.event('sampleRate', { value, ms: SAMPLE_RATE_MS[value], source });
    this.emit('change');
    return true;
  }

  toggleRowing() {
    this.userRowing = !this.userRowing;
    if (!this.userRowing) this.model.setRowing(false);
    this.logger.event('rowing', { on: this.userRowing });
  }

  adjustPace(delta) {
    this.paceOffset += delta;
    this.model.setPace(this.basePace + this.paceOffset);
    this.logger.event('pace', { pace: this.model.targetPace });
  }

  adjustSpm(delta) {
    this.spmOffset += delta;
    this.model.setSpm(this.baseSpm + this.spmOffset);
    this.logger.event('spm', { spm: this.model.spm });
  }

  resetPM5(source = 'keyboard') {
    this.model.reset();
    this.logger.event('pm5.reset', { source });
  }

  stall(seconds = 5) {
    this.stalledUntil = this.t + seconds;
    this.logger.event('stall', { seconds });
  }

  queueMalformed(count = 3) {
    this.malformedQueue += count;
    this.logger.event('malformed', { count });
  }

  forceDisconnect(blockSeconds = 0) {
    this.logger.event('disconnect.forced', { blockSeconds });
    if (this.transport) this.transport.disconnect(blockSeconds);
  }

  /** Values for the live status line. */
  status() {
    const s = this.model.snapshot();
    return {
      distance: s.generalStatus.distance,
      elapsed: s.generalStatus.elapsed,
      pace: s.additionalStatus1.currentPace,
      spm: this.model.rowing ? this.model.spm : 0,
      watts: s.additionalStrokeData ? s.additionalStrokeData.strokePower : 0,
      rowing: this.model.rowing,
      sampleRate: this.sampleRate,
      stalled: this.isStalled(),
      scenario: this.scenario.name,
      sent: this.sent,
    };
  }
}

module.exports = { SimulatorCore, DEFAULT_SAMPLE_RATE };
