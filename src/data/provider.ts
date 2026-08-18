import Constants from 'expo-constants';

import { FmpProvider } from './providers/fmp';
import { MockProvider } from './providers/mock';
import { ProxyProvider } from './providers/proxy';
import type { MarketDataProvider } from './types';

/**
 * Picks a data provider from config, most-preferred first:
 *
 *   1. `apiProxyUrl` — production. Key stays server-side, entitlement is
 *      checked server-side.
 *   2. `fmpApiKey`   — local development against live data.
 *   3. mock          — no config at all; the app still runs end to end.
 */

interface Extra {
  apiProxyUrl?: string;
  fmpApiKey?: string;
}

function extra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

let cached: MarketDataProvider | undefined;
let appUserIdRef: () => string | undefined = () => undefined;

/**
 * Lets the billing layer hand the proxy the current RevenueCat user id
 * without the data layer importing billing.
 */
export function setAppUserIdResolver(resolver: () => string | undefined) {
  appUserIdRef = resolver;
}

export function getProvider(): MarketDataProvider {
  if (cached) return cached;

  const { apiProxyUrl, fmpApiKey } = extra();

  if (apiProxyUrl) {
    cached = new ProxyProvider(apiProxyUrl, () => appUserIdRef());
  } else if (fmpApiKey) {
    if (!__DEV__) {
      // Loud on purpose: a key in a shipped binary gets extracted.
      console.warn(
        '[finviz-map] Using a device-side FMP key in a production build. ' +
          'Set apiProxyUrl and route through server/ instead.'
      );
    }
    cached = new FmpProvider(fmpApiKey);
  } else {
    cached = new MockProvider();
  }

  return cached;
}

/** Test seam. */
export function __setProvider(provider: MarketDataProvider | undefined) {
  cached = provider;
}

export function isMockData(): boolean {
  return getProvider().id === 'mock';
}
