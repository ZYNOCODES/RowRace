/** Lazily created, app-wide BleManager (native). Kept out of pm5.js so that file stays testable. */
import { BleManager } from 'react-native-ble-plx';
import { getBleSupport } from './bleSupport';

let manager = null;

/** @throws when Bluetooth isn't available in this build (e.g. Expo Go): check getBleSupport() first */
export function getBleManager() {
  const support = getBleSupport();
  if (!support.ok) throw new Error(`Bluetooth unavailable in this build (${support.reason})`);
  if (!manager) manager = new BleManager();
  return manager;
}

export async function destroyBleManager() {
  if (!manager) return;
  const m = manager;
  manager = null;
  await m.destroy();
}
