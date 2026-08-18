import { Linking, Platform, Share } from 'react-native';

import {
  DESTINATIONS,
  destinationById,
  destinationsFor,
  toYahooSymbol,
  type Destination,
  type DestinationId,
} from './destinations';

export * from './destinations';

/** Destinations that can work on the platform this build is running on. */
export function availableDestinations(): Destination[] {
  return destinationsFor(Platform.OS as 'ios' | 'android' | 'web');
}

export type OpenResult =
  | { status: 'opened'; via: 'scheme' | 'web'; url: string }
  | { status: 'failed'; reason: string };

/**
 * Opens `symbol` in the chosen destination.
 *
 * Tries custom schemes first (they land deeper and skip a browser bounce),
 * then the https URL, then the first destination that can build one. The
 * last step is what stops a missing exchange or an uninstalled app from
 * turning a tap into nothing happening.
 */
export async function openTicker(
  symbol: string,
  destination: DestinationId,
  exchange?: string
): Promise<OpenResult> {
  const target = destinationById(destination);

  for (const url of target.schemeUrls?.(symbol, exchange) ?? []) {
    try {
      // canOpenURL needs the scheme declared in LSApplicationQueriesSchemes
      // on iOS; an undeclared scheme reads as "not installed".
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return { status: 'opened', via: 'scheme', url };
      }
    } catch {
      // Probe failure is not fatal — fall through to the web URL.
    }
  }

  const candidates = [
    target.webUrl(symbol, exchange),
    ...DESTINATIONS.map((d) => d.webUrl(symbol, exchange)),
  ].filter((url): url is string => Boolean(url));

  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return { status: 'opened', via: 'web', url };
    } catch {
      // Try the next candidate.
    }
  }

  return { status: 'failed', reason: 'No app could open this symbol.' };
}

/**
 * The universal escape hatch: hand the symbol to the OS share sheet so it
 * can go to any app the user has, including ones we do not know about.
 */
export async function shareTicker(
  symbol: string,
  name: string,
  changePct: number
): Promise<void> {
  const sign = changePct >= 0 ? '+' : '';
  const url = `https://finance.yahoo.com/quote/${toYahooSymbol(symbol)}`;

  await Share.share(
    Platform.OS === 'ios'
      ? { message: `${symbol} · ${name} ${sign}${changePct.toFixed(2)}%`, url }
      : { message: `${symbol} · ${name} ${sign}${changePct.toFixed(2)}%\n${url}` }
  );
}
