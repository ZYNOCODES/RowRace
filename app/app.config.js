const { APP_NAME } = require('@rowrace/shared/constants');

/** Expo config. Android tablet first, landscape-locked. */
module.exports = () => ({
  name: APP_NAME,
  slug: 'rowrace-3d',
  owner: 'increadz',
  scheme: 'rowrace',
  version: '0.1.0',
  orientation: 'landscape',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0A0F1C',
  android: {
    package: 'com.zynocodes.rowrace3d',
    versionCode: 1,
    // Bluetooth + location permissions come from the react-native-ble-plx plugin below:
    // BLUETOOTH_SCAN (neverForLocation) + BLUETOOTH_CONNECT on Android 12+, and
    // ACCESS_FINE_LOCATION limited to Android ≤ 11. Don't list them here: an explicit
    // BLUETOOTH_SCAN would stop the plugin from adding the neverForLocation flag.
    permissions: ['android.permission.WAKE_LOCK', 'android.permission.VIBRATE'],
    blockedPermissions: [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    ],
  },
  ios: {
    bundleIdentifier: 'com.zynocodes.rowrace3d',
    supportsTablet: true,
    requireFullScreen: true,
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    [
      'react-native-ble-plx',
      {
        isBackgroundEnabled: false,
        modes: [],
        neverForLocation: true,
        bluetoothAlwaysPermission: 'Allow $(PRODUCT_NAME) to connect to your Concept2 PM5 monitor.',
      },
    ],
    // Sound effects only: no microphone, no background playback service.
    [
      'expo-audio',
      { recordAudioAndroid: false, enableBackgroundPlayback: false, microphonePermission: false },
    ],
    'expo-font',
    'expo-sharing',
    ['expo-splash-screen', { backgroundColor: '#0A0F1C' }],
    'expo-localization',
    ['expo-screen-orientation', { initialOrientation: 'LANDSCAPE' }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    buildNumber: 1,
    // EAS project @increadz/rowrace-3d (created by `eas build`; dynamic configs must set it by hand).
    eas: { projectId: '18a6a626-0dab-4da7-b4bd-4d0b8a7da7d5' },
  },
});
