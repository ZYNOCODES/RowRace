/**
 * Scans for PM5 monitors. Filters on the advertised name prefix "PM5" (not on a service UUID:
 * the name is what every PM5 firmware advertises), keeps one entry per device with its latest
 * RSSI, and reports a list sorted by signal strength.
 */
import { DEVICE_NAME_PREFIX } from '@rowrace/shared';
import { realClock } from '../lib/clock';
import { nullLogger } from './PacketSource';

export const SCAN_TIMEOUT_MS = 15000;
/** How many non-filtered advertisers to list in the scan.stop log line. */
const SEEN_IN_LOG = 15;
const UPDATE_EVERY_MS = 500;

/**
 * PM5 name of a scanned device, or null. Checks the advertised local name first: Android's
 * `device.name` is the *cached* system name for that address, which can be stale (e.g. a PC
 * running the simulator was earlier seen under its hostname).
 */
export function pm5Name(device) {
  for (const n of [device?.localName, device?.name]) {
    if (typeof n === 'string' && n.startsWith(DEVICE_NAME_PREFIX)) return n;
  }
  return null;
}

/** "PM5 430000001" → "430000001" */
export function serialFromName(name) {
  const m = String(name || '').match(/(\d{6,})/);
  return m ? m[1] : null;
}

/**
 * @typedef {{ id: string, name: string, serial: string|null, rssi: number|null, lastSeen: number }} FoundDevice
 */

export class PM5Scanner {
  /** @param {{ manager: object, logger?: object, clock?: import('../lib/clock').Clock }} opts */
  constructor({ manager, logger, clock }) {
    this.manager = manager;
    this.logger = logger || nullLogger;
    this.clock = clock || realClock;
    /** @type {Map<string, FoundDevice>} */
    this.found = new Map();
    this.scanning = false;
  }

  /**
   * @param {{ onUpdate: (list: FoundDevice[]) => void, onTimeout?: (list: FoundDevice[]) => void,
   *   onError?: (e: { code: number|null, message: string }) => void, timeoutMs?: number }} cb
   */
  start({ onUpdate, onTimeout, onError, timeoutMs = SCAN_TIMEOUT_MS }) {
    this.stop();
    this.found.clear();
    this.seen = new Map();
    this.scanning = true;
    this.dirty = false;
    this.logger.ble('scan.start', { timeoutMs });
    this.manager.startDeviceScan(null, { allowDuplicates: true, scanMode: 2 }, (error, device) => {
      if (!this.scanning) return;
      if (error) {
        this.logger.ble('scan.error', { code: error.errorCode, message: String(error.message) });
        this.stop();
        onError?.({ code: error.errorCode ?? null, message: String(error.message) });
        return;
      }
      this.recordSeen(device);
      const name = pm5Name(device);
      if (!name) return;
      const isNew = !this.found.has(device.id);
      this.found.set(device.id, {
        id: device.id,
        name,
        serial: serialFromName(name),
        rssi: device.rssi ?? null,
        lastSeen: this.clock.now(),
      });
      if (isNew) {
        this.logger.ble('scan.found', {
          id: device.id,
          name,
          localName: device.localName ?? null,
          cachedName: device.name ?? null,
          rssi: device.rssi,
          serviceUUIDs: device.serviceUUIDs ?? null,
        });
      }
      this.dirty = true;
    });
    this.updateTimer = this.clock.setInterval(() => {
      if (!this.dirty) return;
      this.dirty = false;
      onUpdate(this.list());
    }, UPDATE_EVERY_MS);
    this.timeoutTimer = this.clock.setTimeout(() => {
      const list = this.list();
      this.logger.ble('scan.timeout', { found: list.length });
      this.stop();
      onTimeout?.(list);
    }, timeoutMs);
  }

  /** @returns {FoundDevice[]} strongest signal first */
  list() {
    return [...this.found.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
  }

  stop() {
    if (this.updateTimer != null) this.clock.clearInterval(this.updateTimer);
    if (this.timeoutTimer != null) this.clock.clearTimeout(this.timeoutTimer);
    this.updateTimer = null;
    this.timeoutTimer = null;
    if (!this.scanning) return;
    this.scanning = false;
    try {
      this.manager.stopDeviceScan();
    } catch {
      // manager already destroyed
    }
    this.logger.ble('scan.stop', { found: this.found.size, ...this.seenSummary() });
  }

  /** Every advertiser seen, PM5 or not: tells "radio sees nothing" from "PM5 not among them". */
  recordSeen(device) {
    if (!device?.id) return;
    const prev = this.seen.get(device.id);
    this.seen.set(device.id, {
      id: device.id,
      localName: device.localName ?? prev?.localName ?? null,
      cachedName: device.name ?? prev?.cachedName ?? null,
      rssi: device.rssi ?? prev?.rssi ?? null,
      packets: (prev?.packets ?? 0) + 1,
    });
  }

  seenSummary() {
    const all = [...this.seen.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
    return { seenDevices: all.length, strongest: all.slice(0, SEEN_IN_LOG) };
  }
}
