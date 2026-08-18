import type { ExpoConfig } from 'expo/config';

/**
 * Secrets come from the environment, never from a committed file.
 *
 * `fmpApiKey` is a development convenience only — anything in `extra` ends
 * up readable inside the shipped bundle. For release builds set
 * `API_PROXY_URL` and leave the vendor key on the server.
 */
const config: ExpoConfig = {
  name: 'Market Map',
  slug: 'finviz-map',
  version: '0.1.0',
  orientation: 'default',
  scheme: 'marketmap',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,

  splash: {
    backgroundColor: '#0b0d12',
    resizeMode: 'contain',
  },

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.example.marketmap',
    infoPlist: {
      // The map is legible in both orientations and landscape is genuinely
      // better for scanning a treemap on a phone.
      UISupportedInterfaceOrientations: [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
    },
  },

  android: {
    package: 'com.example.marketmap',
    adaptiveIcon: { backgroundColor: '#0b0d12' },
  },

  web: {
    bundler: 'metro',
    output: 'single',
  },

  plugins: ['expo-router'],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    apiProxyUrl: process.env.API_PROXY_URL,
    fmpApiKey: process.env.FMP_API_KEY,
    revenueCatIosKey: process.env.REVENUECAT_IOS_KEY,
    revenueCatAndroidKey: process.env.REVENUECAT_ANDROID_KEY,
  },
};

export default config;
