/**
 * Scripted stand-in for react-native-ble-plx's BleManager, used by the data-layer tests.
 * It behaves like a PM5: device info reads, sample-rate write/read, notifications.
 */
import { UUID, SHORT, bytes as B, encodeDeviceInfo, shortIdFromUuid } from '@rowrace/shared';

export function createFakeBle(opts = {}) {
  const f = {
    connectResults: [], // queue of 'ok' | error objects; empty → 'ok'
    sampleRateWrite: opts.sampleRateWrite ?? 'ok',
    sampleRate: 1,
    ergType: opts.ergType ?? 0,
    deviceInfoFails: new Set(opts.deviceInfoFails || []),
    connects: 0,
    cancels: 0,
    monitors: new Map(), // shortId → listener
    removed: 0,
    disconnectListeners: [],
    stateListeners: [],
    scanListener: null,
    scanStops: 0,
    rssi: -60,

    onStateChange(cb) {
      f.stateListeners.push(cb);
      return { remove: () => (f.stateListeners = f.stateListeners.filter((x) => x !== cb)) };
    },
    async connectToDevice(id) {
      f.connects += 1;
      const r = f.connectResults.shift() ?? 'ok';
      if (r !== 'ok') throw r;
      return { id, name: 'PM5 430000001', mtu: 185 };
    },
    async cancelDeviceConnection(id) {
      f.cancels += 1;
      return { id };
    },
    onDeviceDisconnected(_id, cb) {
      f.disconnectListeners.push(cb);
      return {
        remove: () => {
          f.removed += 1;
          f.disconnectListeners = f.disconnectListeners.filter((x) => x !== cb);
        },
      };
    },
    async discoverAllServicesAndCharacteristicsForDevice() {},
    async readCharacteristicForDevice(_id, _svc, uuid) {
      const shortId = shortIdFromUuid(uuid);
      if (shortId === SHORT.SAMPLE_RATE) return { value: B.bytesToBase64([f.sampleRate]) };
      if (f.deviceInfoFails.has(shortId))
        throw Object.assign(new Error('read failed'), { errorCode: 402 });
      const values = {
        [SHORT.MODEL_NUMBER]: 'PM5',
        [SHORT.SERIAL_NUMBER]: '430000001',
        [SHORT.HARDWARE_REVISION]: '634',
        [SHORT.FIRMWARE_REVISION]: '210.000',
        [SHORT.MANUFACTURER_NAME]: 'Concept2',
        [SHORT.ERG_MACHINE_TYPE]: f.ergType,
      };
      return { value: B.bytesToBase64(encodeDeviceInfo(shortId, values[shortId])) };
    },
    async writeCharacteristicWithResponseForDevice(_id, _svc, uuid, b64) {
      if (uuid !== UUID.SAMPLE_RATE) return {};
      if (f.sampleRateWrite !== 'ok')
        throw Object.assign(new Error('write not permitted'), { errorCode: 401 });
      f.sampleRate = B.base64ToBytes(b64)[0];
      return {};
    },
    monitorCharacteristicForDevice(_id, _svc, uuid, cb) {
      const shortId = shortIdFromUuid(uuid);
      f.monitors.set(shortId, cb);
      return {
        remove: () => {
          f.removed += 1;
          if (f.monitors.get(shortId) === cb) f.monitors.delete(shortId);
        },
      };
    },
    async readRSSIForDevice(id) {
      return { id, rssi: f.rssi };
    },
    startDeviceScan(_uuids, _opts, cb) {
      f.scanListener = cb;
    },
    stopDeviceScan() {
      f.scanStops += 1;
      f.scanListener = null;
    },

    // ---- test helpers ----
    notify(shortId, bytes) {
      f.monitors.get(shortId)?.(null, { value: B.bytesToBase64(bytes) });
    },
    dropLink() {
      const err = Object.assign(new Error('Device disconnected'), { errorCode: 201 });
      for (const cb of [...f.disconnectListeners]) cb(err, { id: 'x' });
      for (const cb of [...f.monitors.values()]) cb(err, null);
    },
    setAdapter(state) {
      for (const cb of [...f.stateListeners]) cb(state);
    },
  };
  return f;
}

/** Lets pending promise callbacks run (connect flow awaits several calls). */
export const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
