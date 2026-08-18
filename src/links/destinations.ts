/**
 * Where a tapped ticker can be sent, and how each destination's URL is
 * built.
 *
 * Deliberately free of react-native imports so the URL rules — which is
 * where the real bugs live — are directly testable. The platform side lives
 * in `openTicker.ts`.
 *
 * Two mechanisms, and the difference matters:
 *
 *   - **Universal / App Links (https).** The reliable path. iOS and Android
 *     route the URL to the destination app when it is installed and claims
 *     the domain, and to the browser when it is not. Nothing to declare, no
 *     probe needed, and it never dead-ends.
 *   - **Custom schemes (`app://`).** Only usable when the target publishes
 *     one. On iOS every scheme we probe with `canOpenURL` must also be
 *     listed in `LSApplicationQueriesSchemes`, or the probe returns false
 *     even when the app is installed.
 *
 * Apple's Stocks app is the awkward case: it has no documented URL scheme,
 * so `stocks://` is best-effort only and always falls through to a web
 * destination. See APPLE_STOCKS_CANDIDATES below.
 */

export type DestinationId =
  | 'appleStocks'
  | 'yahoo'
  | 'googleFinance'
  | 'tradingView'
  | 'robinhood'
  | 'marketWatch'
  | 'browser';

export interface Destination {
  id: DestinationId;
  label: string;
  /** Hidden on platforms where it cannot work. */
  platforms?: ('ios' | 'android' | 'web')[];
  /**
   * Web URL for the symbol, or undefined when this destination cannot form
   * a good one (usually because it needs an exchange we do not have).
   */
  webUrl: (symbol: string, exchange?: string) => string | undefined;
  /** Custom scheme URLs to try before the web URL, most specific first. */
  schemeUrls?: (symbol: string, exchange?: string) => string[];
  /** Shown in Settings under the option. */
  note?: string;
}

/**
 * Symbol normalisation, which is not cosmetic — share classes differ per
 * venue and getting it wrong opens the wrong page or a 404.
 *
 * Our data uses the dotted form (BRK.B). Yahoo wants BRK-B, Google wants
 * BRK.B plus an exchange suffix, most others take the dotted form as-is.
 */
export function toYahooSymbol(symbol: string): string {
  return symbol.replace(/\./g, '-');
}

export function toTradingViewSymbol(symbol: string, exchange?: string): string {
  const venue = normaliseExchange(exchange);
  return venue ? `${venue}-${symbol}` : symbol;
}

/**
 * Maps vendor exchange names onto the codes these sites use in URLs.
 *
 * Vendors are inconsistent here: FMP alone returns "NASDAQ", "NasdaqGS",
 * "NASDAQ Global Select", "NYSE" and "New York Stock Exchange" for what are
 * two venues, so both the abbreviations and the spelled-out names have to
 * be recognised. Order matters — Arca and American must be tested before
 * the bare NYSE match, since their full names contain it.
 */
function normaliseExchange(exchange?: string): string | undefined {
  if (!exchange) return undefined;
  const value = exchange.toUpperCase();

  if (value.includes('NASDAQ')) return 'NASDAQ';
  if (value.includes('ARCA')) return 'AMEX';
  if (value.includes('AMEX') || value.includes('AMERICAN STOCK EXCHANGE')) {
    return 'AMEX';
  }
  if (value.includes('CBOE') || value.includes('BATS')) return 'CBOE';
  if (value.includes('NYSE') || value.includes('NEW YORK STOCK EXCHANGE')) {
    return 'NYSE';
  }
  return undefined;
}

/**
 * Apple's Stocks app publishes no documented URL scheme. These are
 * best-effort forms; if none of them resolve we open a web destination
 * instead, so the button always does something.
 *
 * Deliberately not sold as "opens Apple Stocks" in the UI — see the label.
 */
const APPLE_STOCKS_CANDIDATES = (symbol: string): string[] => [
  `stocks://?symbol=${encodeURIComponent(symbol)}`,
  `stocks://quote?symbol=${encodeURIComponent(symbol)}`,
];

export const DESTINATIONS: Destination[] = [
  {
    id: 'yahoo',
    label: 'Yahoo Finance',
    // Universal link: opens the Yahoo Finance app when installed, web when not.
    webUrl: (symbol) => `https://finance.yahoo.com/quote/${encodeURIComponent(toYahooSymbol(symbol))}`,
  },
  {
    id: 'appleStocks',
    label: 'Apple Stocks',
    platforms: ['ios'],
    note: 'Apple publishes no deep link for Stocks. We try, then fall back to Yahoo Finance.',
    schemeUrls: (symbol) => APPLE_STOCKS_CANDIDATES(symbol),
    webUrl: (symbol) => `https://finance.yahoo.com/quote/${encodeURIComponent(toYahooSymbol(symbol))}`,
  },
  {
    id: 'tradingView',
    label: 'TradingView',
    schemeUrls: (symbol, exchange) => [
      `tradingview://chart?symbol=${encodeURIComponent(toTradingViewSymbol(symbol, exchange))}`,
    ],
    webUrl: (symbol, exchange) =>
      `https://www.tradingview.com/symbols/${encodeURIComponent(toTradingViewSymbol(symbol, exchange))}/`,
  },
  {
    id: 'googleFinance',
    label: 'Google Finance',
    note: 'Needs the listing exchange, so it is skipped when that is missing.',
    // Google's URLs are always SYMBOL:EXCHANGE — without the exchange there
    // is no page to open, so this returns undefined and the caller falls back.
    webUrl: (symbol, exchange) => {
      const venue = normaliseExchange(exchange);
      return venue
        ? `https://www.google.com/finance/quote/${encodeURIComponent(symbol)}:${venue}`
        : undefined;
    },
  },
  {
    id: 'robinhood',
    label: 'Robinhood',
    webUrl: (symbol) => `https://robinhood.com/stocks/${encodeURIComponent(symbol)}`,
  },
  {
    id: 'marketWatch',
    label: 'MarketWatch',
    webUrl: (symbol) =>
      `https://www.marketwatch.com/investing/stock/${encodeURIComponent(symbol.toLowerCase())}`,
  },
  {
    id: 'browser',
    label: 'Browser search',
    webUrl: (symbol) =>
      `https://duckduckgo.com/?q=${encodeURIComponent(`${symbol} stock quote`)}`,
  },
];

export const DEFAULT_DESTINATION: DestinationId = 'yahoo';

export function destinationById(id: DestinationId): Destination {
  return DESTINATIONS.find((d) => d.id === id) ?? DESTINATIONS[0];
}

export type PlatformName = 'ios' | 'android' | 'web';

/** Destinations that can work on the given platform. */
export function destinationsFor(platform: PlatformName): Destination[] {
  return DESTINATIONS.filter(
    (d) => !d.platforms || d.platforms.includes(platform)
  );
}
