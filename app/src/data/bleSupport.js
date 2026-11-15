/**
 * Can this build talk to Bluetooth at all? Expo Go ships without react-native-ble-plx's native
 * code (and doesn't declare our Bluetooth permissions), so BLE only works in the dev client or
 * a release build. Checked once; the answer can't change while the app runs.
 */
import { NativeModules } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Application from 'expo-application';

/** Expo Go's Android/iOS app IDs. In SDK 58 Expo Go reports executionEnvironment 'bare'. */
const EXPO_GO_IDS = new Set(['host.exp.exponent', 'host.exp.Exponent']);

/** @typedef {{ ok: true } | { ok: false, reason: 'expo-go' | 'no-native-module' }} BleSupport */

let cached = null;

/** @returns {BleSupport} */
export function getBleSupport() {
  if (cached) return cached;
  const expoGo =
    EXPO_GO_IDS.has(Application.applicationId) ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo';
  if (expoGo) {
    cached = { ok: false, reason: 'expo-go' };
  } else if (!NativeModules.BlePlx) {
    cached = { ok: false, reason: 'no-native-module' };
  } else {
    cached = { ok: true };
  }
  return cached;
}
