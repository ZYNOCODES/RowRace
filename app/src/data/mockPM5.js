/**
 * In-app PM5 simulator: no Bluetooth at all. Runs the shared rower model and scenarios
 * (shared/sim, same as the PC simulator), *encodes* the packets with shared/encode.js and
 * feeds the bytes to the normal decode path, so the UI sees exactly what a PM5 would send.
 */
import { SAMPLE_RATE_MS, sim } from '@rowrace/shared';
import { PacketSource } from './PacketSource';

const TICK_MS = 50;
/** The app writes 250 ms to a real PM5; the mock behaves as if that write succeeded. */
const APP_SAMPLE_RATE = 2;

export const MOCK_DEVICE_INFO = Object.freeze({
  name: 'PM5 SIMULATOR',
  serialNumber: '000000000',
  firmwareRevision: 'IN-APP',
  hardwareRevision: '-',
  modelNumber: 'PM5',
  manufacturerName: 'Concept2',
  ergMachineType: 0,
});

export class MockPM5 extends PacketSource {
  /**
   * @param {{ scenario?: string, pace?: number, spm?: number, seed?: number, logger?: object,
   *   clock?: import('../lib/clock').Clock }} [opts]
   */
  constructor(opts = {}) {
    super({ kind: 'mock', logger: opts.logger, clock: opts.clock });
    const given = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
    this.opts = { scenario: 'steady', pace: 125, spm: 24, seed: Date.now() & 0xffff, ...given };
    this.timer = null;
    this.rand = sim.prng(this.opts.seed + 1);
  }

  async connect() {
    if (this.timer) return;
    this.setStatus('connecting');
    this.model = new sim.RowerModel({
      pace: this.opts.pace,
      spm: this.opts.spm,
      seed: this.opts.seed,
    });
    this.scenario = sim.createScenario(this.opts.scenario, this.opts);
    this.t = 0;
    this.statusTimer = 0;
    this.sampleRate = APP_SAMPLE_RATE;
    this.silentUntil = 0;
    this.offlineUntil = 0;
    this.malformedQueue = 0;
    this.setDeviceInfo(MOCK_DEVICE_INFO);
    this.logger.ble('mock.start', {
      scenario: this.scenario.name,
      pace: this.opts.pace,
      spm: this.opts.spm,
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

  /** Dev menu: switch scenario on the fly (restarts its timeline). */
  setScenario(name) {
    this.opts.scenario = name;
    if (!this.model) return;
    this.scenario = sim.createScenario(name, this.opts);
    this.scenarioStart = this.t;
    this.sampleRate = APP_SAMPLE_RATE;
    this.logger.ble('mock.scenario', { scenario: this.scenario.name });
  }

  tick(dtMs) {
    this.t += dtMs / 1000;
    const actions = this.scenario.update(this.t - (this.scenarioStart || 0), this.model);
    for (const a of actions) this.apply(a);

    const { stroke } = this.model.step(dtMs / 1000);
    if (this.t < this.offlineUntil) return;
    if (this.status === 'reconnecting') {
      this.setStatus('connected');
      this.startWatchdog();
    }
    if (this.t < this.silentUntil) return;

    const snap = this.model.snapshot();
    if (stroke) for (const id of sim.packets.STROKE_CHARS) this.send(id, snap);
    this.statusTimer += dtMs;
    const interval = SAMPLE_RATE_MS[this.sampleRate];
    if (this.statusTimer >= interval) {
      this.statusTimer %= interval;
      for (const id of sim.packets.STATUS_CHARS) this.send(id, snap);
    }
  }

  apply(a) {
    if (a.type === 'stall') this.silentUntil = this.t + a.seconds;
    else if (a.type === 'malformed') this.malformedQueue += a.count;
    else if (a.type === 'sampleRate') this.sampleRate = a.value;
    else if (a.type === 'disconnect') {
      // Looks like a dropped link followed by a successful auto-reconnect.
      this.offlineUntil = this.t + a.seconds;
      this.stopWatchdog();
      this.setStatus('reconnecting', { attempt: 1, reason: 'mock-disconnect' });
    }
  }

  send(shortId, snap) {
    let bytes = sim.packets.buildPacket(shortId, snap);
    if (!bytes) return;
    if (this.malformedQueue > 0 || this.rand() < this.scenario.malformedRate) {
      if (this.malformedQueue > 0) this.malformedQueue -= 1;
      bytes = sim.packets.malform(bytes, this.rand);
    }
    this.handlePacket(shortId, bytes);
  }
}

export const MOCK_SCENARIOS = sim.SCENARIO_NAMES.filter((n) => n !== 'manual');
