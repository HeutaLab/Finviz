import {
  DESTINATIONS,
  DEFAULT_DESTINATION,
  destinationById,
  toTradingViewSymbol,
  toYahooSymbol,
} from '../src/links/destinations';

/**
 * These cover URL construction only. `openTicker` needs react-native's
 * Linking, which is exercised on-device rather than here — the part worth
 * pinning down in a unit test is symbol normalisation, because getting a
 * share class wrong silently opens the wrong company's page.
 */

function urlFor(id: string, symbol: string, exchange?: string) {
  return destinationById(id as never).webUrl(symbol, exchange);
}

describe('symbol normalisation', () => {
  it('converts dotted share classes to Yahoo dashes', () => {
    expect(toYahooSymbol('BRK.B')).toBe('BRK-B');
    expect(toYahooSymbol('BF.B')).toBe('BF-B');
  });

  it('leaves ordinary symbols alone', () => {
    expect(toYahooSymbol('AAPL')).toBe('AAPL');
  });

  it('prefixes the exchange for TradingView when known', () => {
    expect(toTradingViewSymbol('AAPL', 'NASDAQ Global Select')).toBe('NASDAQ-AAPL');
    expect(toTradingViewSymbol('JPM', 'New York Stock Exchange')).toBe('NYSE-JPM');
  });

  it('falls back to the bare symbol when the exchange is unknown', () => {
    expect(toTradingViewSymbol('AAPL')).toBe('AAPL');
    expect(toTradingViewSymbol('AAPL', 'Some Regional Venue')).toBe('AAPL');
  });
});

describe('destination URLs', () => {
  it('builds a Yahoo quote URL with the dashed symbol', () => {
    expect(urlFor('yahoo', 'BRK.B')).toBe('https://finance.yahoo.com/quote/BRK-B');
  });

  it('builds a TradingView URL with the exchange when available', () => {
    expect(urlFor('tradingView', 'AAPL', 'NASDAQ')).toBe(
      'https://www.tradingview.com/symbols/NASDAQ-AAPL/'
    );
  });

  it('qualifies Google Finance with the exchange', () => {
    expect(urlFor('googleFinance', 'AAPL', 'NASDAQ')).toBe(
      'https://www.google.com/finance/quote/AAPL:NASDAQ'
    );
  });

  it('returns undefined for Google Finance without an exchange', () => {
    // Google has no un-qualified quote page, so the caller must fall back
    // rather than open a 404.
    expect(urlFor('googleFinance', 'AAPL')).toBeUndefined();
  });

  it('lowercases for MarketWatch', () => {
    expect(urlFor('marketWatch', 'AAPL')).toBe(
      'https://www.marketwatch.com/investing/stock/aapl'
    );
  });

  it('percent-encodes symbols that need it', () => {
    // Defensive: a symbol containing a slash or space must not break out of
    // the path segment.
    expect(urlFor('yahoo', 'A B')).toBe('https://finance.yahoo.com/quote/A%20B');
    expect(urlFor('robinhood', 'A/B')).toBe('https://robinhood.com/stocks/A%2FB');
  });

  it('gives every destination a usable URL for a plain symbol', () => {
    for (const destination of DESTINATIONS) {
      if (destination.id === 'googleFinance') continue; // needs an exchange
      expect(destination.webUrl('AAPL', 'NASDAQ')).toMatch(/^https:\/\//);
    }
  });

  it('always has a web fallback, including for scheme-based destinations', () => {
    // Apple Stocks has no documented deep link, so the web URL is what makes
    // the button safe to show at all.
    const apple = destinationById('appleStocks');
    expect(apple.schemeUrls?.('AAPL').length).toBeGreaterThan(0);
    expect(apple.webUrl('AAPL')).toMatch(/^https:\/\//);
  });
});

describe('defaults', () => {
  it('defaults to a destination that needs no exchange and no install', () => {
    const fallback = destinationById(DEFAULT_DESTINATION);
    expect(fallback.webUrl('AAPL')).toBeDefined();
    expect(fallback.platforms).toBeUndefined();
  });

  it('resolves an unknown id rather than throwing', () => {
    expect(destinationById('nope' as never)).toBe(DESTINATIONS[0]);
  });
});

describe('exchange name variants', () => {
  // Vendors are inconsistent about this field; all of these arrive from FMP.
  const cases: [string, string][] = [
    ['NASDAQ', 'NASDAQ-AAPL'],
    ['NasdaqGS', 'NASDAQ-AAPL'],
    ['NASDAQ Global Select', 'NASDAQ-AAPL'],
    ['NYSE', 'NYSE-AAPL'],
    ['New York Stock Exchange', 'NYSE-AAPL'],
    ['NYSE Arca', 'AMEX-AAPL'],
    ['AMEX', 'AMEX-AAPL'],
    ['American Stock Exchange', 'AMEX-AAPL'],
    ['CBOE', 'CBOE-AAPL'],
  ];

  it.each(cases)('maps %s', (exchange, expected) => {
    expect(toTradingViewSymbol('AAPL', exchange)).toBe(expected);
  });
});
