const { APP_NAME } = require('@rowrace/shared/constants');

/** Expo config. Android tablet first, landscape-locked. */
module.exports = () => ({
  name: APP_NAME,
  slug: 'rowrace-3d',
  scheme: 'rowrace',
  version: '0.1.0',
  orientation: 'landscape',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0A0F1C',
  android: {
    package: 'com.zynocodes.rowrace3d',
    versionCode: 1,
    permissions: [
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.WAKE_LOCK',
    ],
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
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
    'expo-audio',
    'expo-font',
    'expo-sharing',
    ['expo-splash-screen', { backgroundColor: '#0A0F1C' }],
    'expo-localization',
    ['expo-screen-orientation', { initialOrientation: 'LANDSCAPE' }],
  ],
  experiments: { typedRoutes: false },
  extra: { buildNumber: 1 },
});
