import {
  MarketDataError,
  type FetchOptions,
  type MarketDataProvider,
  type MarketSnapshot,
  type Quote,
  type Timeframe,
  type UniverseId,
} from '../types';

/**
 * Financial Modeling Prep provider.
 *
 * A treemap needs three things per symbol that FMP splits across three
 * endpoints, so a snapshot is assembled as:
 *
 *   1. constituents  → symbol, name, sector, industry
 *   2. /quote        → price, day change, market cap  (batched)
 *   3. /stock-price-change → longer-timeframe returns (batched, 1D excluded)
 *
 * IMPORTANT: this hits FMP directly and therefore needs the API key on the
 * device. Ship it that way only for local development — a key in a mobile
 * binary is a key that gets extracted and burned through. In production use
 * `ProxyProvider`, which keeps the key server-side and is also where the
 * free/Pro delay is actually enforced.
 */

const BASE = 'https://financialmodelingprep.com/api';

/** FMP's quote endpoint tolerates long symbol lists; keep URLs sane anyway. */
const BATCH_SIZE = 100;

interface FmpConstituent {
  symbol: string;
  name: string;
  sector: string;
  subSector?: string;
}

interface FmpQuote {
  symbol: string;
  name?: string;
  price?: number;
  changesPercentage?: number;
  marketCap?: number;
  volume?: number;
}

interface FmpPriceChange {
  symbol: string;
  '1D'?: number;
  '5D'?: number;
  '1M'?: number;
  '3M'?: number;
  '6M'?: number;
  ytd?: number;
  '1Y'?: number;
}

const CONSTITUENT_PATH: Partial<Record<UniverseId, string>> = {
  sp500: '/v3/sp500_constituent',
  nasdaq100: '/v3/nasdaq_constituent',
  dowjones: '/v3/dowjones_constituent',
};

/** Maps our timeframe names onto FMP's price-change field names. */
const CHANGE_FIELD: Record<Timeframe, keyof FmpPriceChange> = {
  '1D': '1D',
  '1W': '5D',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  YTD: 'ytd',
  '1Y': '1Y',
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export class FmpProvider implements MarketDataProvider {
  readonly id = 'fmp';

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new MarketDataError('FMP API key is required', 'auth');
    }
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${BASE}${path}${separator}apikey=${encodeURIComponent(this.apiKey)}`;

    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      throw new MarketDataError('Could not reach the market data service', 'network');
    }

    if (response.status === 401 || response.status === 403) {
      throw new MarketDataError('Market data key was rejected', 'auth');
    }
    if (response.status === 429) {
      throw new MarketDataError('Market data rate limit reached', 'rate_limit');
    }
    if (!response.ok) {
      throw new MarketDataError(`Market data request failed (${response.status})`);
    }

    return (await response.json()) as T;
  }

  private async constituents(
    universe: UniverseId,
    signal?: AbortSignal
  ): Promise<FmpConstituent[]> {
    const path = CONSTITUENT_PATH[universe];
    if (!path) {
      throw new MarketDataError(
        `The ${universe} map is not available from this provider yet`,
        'unsupported'
      );
    }
    return this.get<FmpConstituent[]>(path, signal);
  }

  private async quotes(
    symbols: string[],
    signal?: AbortSignal
  ): Promise<Map<string, FmpQuote>> {
    const batches = await Promise.all(
      chunk(symbols, BATCH_SIZE).map((batch) =>
        this.get<FmpQuote[]>(`/v3/quote/${batch.join(',')}`, signal)
      )
    );

    const bySymbol = new Map<string, FmpQuote>();
    for (const row of batches.flat()) {
      if (row?.symbol) bySymbol.set(row.symbol, row);
    }
    return bySymbol;
  }

  private async priceChanges(
    symbols: string[],
    signal?: AbortSignal
  ): Promise<Map<string, FmpPriceChange>> {
    const batches = await Promise.all(
      chunk(symbols, BATCH_SIZE).map((batch) =>
        this.get<FmpPriceChange[]>(
          `/v3/stock-price-change/${batch.join(',')}`,
          signal
        )
      )
    );

    const bySymbol = new Map<string, FmpPriceChange>();
    for (const row of batches.flat()) {
      if (row?.symbol) bySymbol.set(row.symbol, row);
    }
    return bySymbol;
  }

  async fetchSnapshot(options: FetchOptions): Promise<MarketSnapshot> {
    const { universe, timeframe, signal } = options;

    const members = await this.constituents(universe, signal);
    const symbols = members.map((m) => m.symbol);

    // 1D change already rides along with the quote, so skip the second call.
    const needsPriceChange = timeframe !== '1D';
    const [quoteMap, changeMap] = await Promise.all([
      this.quotes(symbols, signal),
      needsPriceChange
        ? this.priceChanges(symbols, signal)
        : Promise.resolve(new Map<string, FmpPriceChange>()),
    ]);

    const field = CHANGE_FIELD[timeframe];

    const quotes: Quote[] = [];
    for (const member of members) {
      const quote = quoteMap.get(member.symbol);
      // A constituent with no quote (halted, freshly delisted) is dropped
      // rather than rendered as a zero-change grey tile that looks live.
      if (!quote || typeof quote.marketCap !== 'number' || quote.marketCap <= 0) {
        continue;
      }

      const changePct = needsPriceChange
        ? (changeMap.get(member.symbol)?.[field] as number | undefined)
        : quote.changesPercentage;

      if (typeof changePct !== 'number' || !Number.isFinite(changePct)) continue;

      quotes.push({
        symbol: member.symbol,
        name: member.name ?? quote.name ?? member.symbol,
        sector: member.sector || 'Other',
        industry: member.subSector || member.sector || 'Other',
        marketCap: quote.marketCap,
        price: quote.price ?? 0,
        changePct,
        volume: quote.volume,
      });
    }

    if (quotes.length === 0) {
      throw new MarketDataError('Market data came back empty');
    }

    return {
      universe,
      timeframe,
      quotes,
      asOf: Date.now(),
      // Direct FMP access has no delay tier to enforce; the proxy does that.
      delayMinutes: 0,
    };
  }
}
