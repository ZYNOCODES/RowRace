/**
 * Starts the session log with device/app metadata, flushes it when the app goes to the
 * background, captures uncaught JS errors, and tears down Bluetooth on app close.
 */
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getBleSupport } from '../data/bleSupport';
import { constants } from '@rowrace/shared';
import { useSettings } from '../state/settings';
import { logger, sourceManager } from './index';

let started = false;

export async function bootstrap() {
  if (started) return;
  started = true;
  const s = useSettings.getState();
  await logger.start({
    app: constants.APP_NAME,
    // Our app version from app.config.js; the native version is the host app's
    // (in Expo Go it is Expo Go's own version, not RowRace's).
    version: Constants.expoConfig?.version,
    nativeVersion: Application.nativeApplicationVersion,
    appId: Application.applicationId,
    build: Application.nativeBuildVersion,
    runtime: Constants.executionEnvironment, // 'storeClient' = Expo Go, 'bare' = dev/release build
    ble: getBleSupport(),
    device: `${Device.manufacturer ?? ''} ${Device.modelName ?? ''}`.trim(),
    os: `${Platform.OS} ${Device.osVersion ?? Platform.Version}`,
    androidApi: Platform.OS === 'android' ? Platform.Version : undefined,
    source: s.dataSource,
    language: s.language,
    logFormat: constants.LOG_FORMAT_VERSION,
  });

  AppState.addEventListener('change', (state) => {
    logger.ui('appState', { state });
    if (state !== 'active') logger.flush();
  });

  const prev = globalThis.ErrorUtils?.getGlobalHandler?.();
  globalThis.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    logger.error(error, { fatal: !!isFatal });
    logger.flush();
    prev?.(error, isFatal);
  });
}

/** Called when the root layout unmounts (app closing). */
export async function shutdown() {
  await sourceManager.stop();
  await logger.stop();
}
