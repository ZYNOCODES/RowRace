/**
 * Bluetooth runtime permissions.
 * Android 12+ (API 31): BLUETOOTH_SCAN (declared neverForLocation) + BLUETOOTH_CONNECT.
 * Android ≤ 11: ACCESS_FINE_LOCATION (the system requires it for BLE scans).
 * iOS: the system asks on first Bluetooth use; ble-plx then reports "Unauthorized".
 */
import { Linking, PermissionsAndroid, Platform } from 'react-native';

/** @typedef {'granted'|'denied'|'blocked'} PermissionStatus */

export const isLegacyAndroid = () => Platform.OS === 'android' && Number(Platform.Version) < 31;

function wanted() {
  const P = PermissionsAndroid.PERMISSIONS;
  return isLegacyAndroid() ? [P.ACCESS_FINE_LOCATION] : [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT];
}

/** @returns {Promise<PermissionStatus>} without showing any dialog */
export async function checkBlePermissions() {
  if (Platform.OS !== 'android') return 'granted';
  const results = await Promise.all(wanted().map((p) => PermissionsAndroid.check(p)));
  return results.every(Boolean) ? 'granted' : 'denied';
}

/** Shows the system dialog(s). @returns {Promise<PermissionStatus>} */
export async function requestBlePermissions() {
  if (Platform.OS !== 'android') return 'granted';
  const res = await PermissionsAndroid.requestMultiple(wanted());
  const values = Object.values(res);
  if (values.every((v) => v === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
  if (values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
  return 'denied';
}

export function openAppSettings() {
  return Linking.openSettings();
}

/** Android Bluetooth settings page; falls back to the app settings. */
export async function openBluetoothSettings() {
  if (Platform.OS === 'android') {
    try {
      await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
      return;
    } catch {
      // some OEM builds don't export it
    }
  }
  await Linking.openSettings();
}
