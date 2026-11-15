/**
 * Real PM5 over Bluetooth LE (react-native-ble-plx). Also used for the PC simulator, which
 * advertises as a PM5: same code path.
 *
 * The BleManager is injected (see bleManager.js) so this file has no native imports and the
 * whole connect / reconnect / teardown logic is unit-tested with a fake manager.
 */
import {
  UUID,
  NOTIFY_CHARACTERISTICS,
  bytes as B,
  ergFamily,
  ErgMachineType,
  SAMPLE_RATE_MS,
  pm5Uuid,
  shortIdLabel,
} from '@rowrace/shared';
import { readDeviceInfo, writeSampleRate } from './pm5Setup';
import { PacketSource } from './PacketSource';

export { WANTED_SAMPLE_RATE } from './pm5Setup';
const CONNECT_TIMEOUT_MS = 12000;
const REQUESTED_MTU = 185;
const RSSI_EVERY_MS = 5000;

/** Reconnect delay for the n-th retry (0-based): 1 s, 2 s, 4 s, 8 s, then every 10 s. */
export function reconnectDelay(attempt) {
  return Math.min(10000, 1000 * 2 ** attempt);
}

/** ble-plx error codes we treat specially (BleErrorCode). */
const ERR = {
  OperationCancelled: 2,
  BluetoothUnauthorized: 101,
  BluetoothPoweredOff: 102,
  DeviceDisconnected: 201,
};

export class PM5Source extends PacketSource {
  /**
   * @param {{ manager: object, deviceId: string, deviceName?: string, logger?: object,
   *   clock?: import('../lib/clock').Clock }} opts
   */
  constructor({ manager, deviceId, deviceName, logger, clock }) {
    super({ kind: 'ble', logger, clock });
    this.manager = manager;
    this.deviceId = deviceId;
    this.wantConnected = false;
    this.attempt = 0;
    this.session = 0; // bumps on every connect attempt / teardown; stale async results are ignored
    this.subs = [];
    this.retryTimer = null;
    this.rssiTimer = null;
    this.bluetoothOn = true;
    this.sampleRateMs = SAMPLE_RATE_MS[1];
    this.setDeviceInfo({ name: deviceName || deviceId, id: deviceId });
    this.stateSub = manager.onStateChange((state) => this.onBluetoothState(state), false);
  }

  async connect() {
    if (this.wantConnected) return;
    this.wantConnected = true;
    this.attempt = 0;
    await this.tryConnect();
  }

  async disconnect() {
    this.wantConnected = false;
    this.clearRetry();
    this.teardownLink();
    try {
      await this.manager.cancelDeviceConnection(this.deviceId);
    } catch {
      // not connected: fine
    }
    this.setStatus('disconnected');
  }

  /** Full teardown: also stops listening to the Bluetooth adapter state. */
  async destroy() {
    await this.disconnect();
    this.stateSub?.remove();
    this.removeAll();
  }

  onBluetoothState(state) {
    this.logger.ble('adapter', { state });
    if (state === 'PoweredOff' || state === 'Unauthorized') {
      this.bluetoothOn = false;
      if (!this.wantConnected) return;
      this.clearRetry();
      this.teardownLink();
      this.setStatus('failed', {
        reason: state === 'PoweredOff' ? 'bluetooth-off' : 'unauthorized',
      });
    } else if (state === 'PoweredOn' && !this.bluetoothOn) {
      this.bluetoothOn = true;
      if (this.wantConnected) {
        this.attempt = 0;
        this.tryConnect();
      }
    }
  }

  async tryConnect() {
    const session = ++this.session;
    const id = this.deviceId;
    const m = this.manager;
    const alive = () => session === this.session && this.wantConnected;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting', { attempt: this.attempt });
    this.logger.ble('connect.start', { id, attempt: this.attempt });
    try {
      const device = await m.connectToDevice(id, {
        requestMTU: REQUESTED_MTU,
        timeout: CONNECT_TIMEOUT_MS,
      });
      if (!alive()) return;
      this.logger.ble('connect.ok', { id, mtu: device?.mtu, name: device?.name });
      this.subs.push(m.onDeviceDisconnected(id, (err) => this.onDrop(session, err)));

      await m.discoverAllServicesAndCharacteristicsForDevice(id);
      if (!alive()) return;
      this.logger.ble('services.discovered', { id });

      await this.readDeviceInfo(alive);
      if (!alive()) return;
      await this.setSampleRate(alive);
      if (!alive()) return;
      this.subscribe(session);

      this.attempt = 0;
      this.resetMerger();
      this.setStatus('connected');
      this.startWatchdog();
      this.startRssi(alive);
    } catch (e) {
      if (!alive()) return;
      this.logger.ble('connect.error', {
        id,
        code: e?.errorCode,
        message: String(e?.message || e),
      });
      this.teardownLink();
      if (e?.errorCode === ERR.BluetoothPoweredOff || e?.errorCode === ERR.BluetoothUnauthorized) {
        this.bluetoothOn = false;
        this.setStatus('failed', {
          reason: e.errorCode === ERR.BluetoothPoweredOff ? 'bluetooth-off' : 'unauthorized',
        });
        return;
      }
      this.scheduleRetry(e?.errorCode === ERR.DeviceDisconnected ? 'link-lost' : 'connect-error');
    }
  }

  onDrop(session, err) {
    if (session !== this.session || !this.wantConnected) return;
    this.logger.ble('disconnected', {
      code: err?.errorCode,
      message: err ? String(err.message) : null,
    });
    this.teardownLink();
    if (this.bluetoothOn) this.scheduleRetry('link-lost');
  }

  scheduleRetry(reason) {
    this.clearRetry();
    const delay = reconnectDelay(this.attempt);
    this.attempt += 1;
    this.setStatus('reconnecting', { attempt: this.attempt, nextRetryMs: delay, reason });
    this.retryTimer = this.clock.setTimeout(() => {
      this.retryTimer = null;
      if (this.wantConnected) this.tryConnect();
    }, delay);
  }

  clearRetry() {
    if (this.retryTimer != null) this.clock.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Removes notification/disconnect subscriptions and timers. Safe to call twice. */
  teardownLink() {
    this.session += 1;
    for (const s of this.subs.splice(0)) {
      try {
        s.remove();
      } catch {
        // already removed by the native side
      }
    }
    if (this.rssiTimer != null) this.clock.clearInterval(this.rssiTimer);
    this.rssiTimer = null;
    this.stopWatchdog();
  }

  async readDeviceInfo(alive) {
    const info = await readDeviceInfo(this.manager, this.deviceId, this.logger, alive);
    if (!info) return;
    this.setDeviceInfo(info);
    if (info.ergMachineType != null && ergFamily(info.ergMachineType) !== 'rower') {
      const label = ErgMachineType.label(info.ergMachineType);
      this.logger.ble('wrong-erg', { ergMachineType: info.ergMachineType, label });
      this.emit('error', { code: 'wrong-erg', message: label, warning: true });
    }
  }

  async setSampleRate(alive) {
    const ms = await writeSampleRate(this.manager, this.deviceId, this.logger, alive);
    if (ms == null) return;
    this.sampleRateMs = ms;
    this.setDeviceInfo({ sampleRateMs: ms });
  }

  subscribe(session) {
    for (const shortId of NOTIFY_CHARACTERISTICS) {
      const sub = this.manager.monitorCharacteristicForDevice(
        this.deviceId,
        UUID.ROWING_SERVICE,
        pm5Uuid(shortId),
        (err, ch) => {
          if (session !== this.session) return;
          if (err) {
            // Cancellations/disconnects are handled by onDeviceDisconnected.
            if (
              err.errorCode !== ERR.OperationCancelled &&
              err.errorCode !== ERR.DeviceDisconnected
            ) {
              this.logger.ble('notify.error', {
                char: shortIdLabel(shortId),
                code: err.errorCode,
                message: String(err.message),
              });
            }
            return;
          }
          this.handlePacket(shortId, B.base64ToBytes(ch?.value));
        },
      );
      this.subs.push(sub);
      this.logger.ble('subscribe', { char: shortIdLabel(shortId) });
    }
  }

  startRssi(alive) {
    const poll = async () => {
      try {
        const d = await this.manager.readRSSIForDevice(this.deviceId);
        if (alive() && d?.rssi != null) this.setDeviceInfo({ rssi: d.rssi });
      } catch {
        // RSSI is best effort
      }
    };
    poll();
    this.rssiTimer = this.clock.setInterval(poll, RSSI_EVERY_MS);
  }
}
