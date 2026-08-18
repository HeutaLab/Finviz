/** Shared market-data shapes. Providers normalise into these. */

export type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y';

export const TIMEFRAMES: Timeframe[] = [
  '1D',
  '1W',
  '1M',
  '3M',
  '6M',
  'YTD',
  '1Y',
];

/** Timeframes a free account can see. The rest sit behind Pro. */
export const FREE_TIMEFRAMES: Timeframe[] = ['1D'];

export type UniverseId =
  | 'sp500'
  | 'nasdaq100'
  | 'dowjones'
  | 'full'
  | 'etf'
  | 'crypto'
  | 'world';

export interface Universe {
  id: UniverseId;
  label: string;
  /** Short blurb shown in the universe picker. */
  description: string;
  pro: boolean;
}

/** One instrument, already joined against its classification. */
export interface Quote {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  /** Used as the tile's area weight. */
  marketCap: number;
  price: number;
  /** Percent change over the requested timeframe. 2.5 means +2.5%. */
  changePct: number;
  volume?: number;
  /** Listing venue, e.g. "NASDAQ". Used to build exchange-qualified links. */
  exchange?: string;
}

export interface MarketSnapshot {
  universe: UniverseId;
  timeframe: Timeframe;
  quotes: Quote[];
  /** When the underlying prices were sampled. */
  asOf: number;
  /** Minutes the data is behind live. 0 for real-time. */
  delayMinutes: number;
}

export interface FetchOptions {
  universe: UniverseId;
  timeframe: Timeframe;
  /** Entitled accounts get live data; everyone else gets the delayed cache. */
  realtime: boolean;
  signal?: AbortSignal;
}

export interface MarketDataProvider {
  readonly id: string;
  fetchSnapshot(options: FetchOptions): Promise<MarketSnapshot>;
}

export class MarketDataError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'network'
      | 'rate_limit'
      | 'auth'
      | 'unsupported'
      | 'unknown' = 'unknown'
  ) {
    super(message);
    this.name = 'MarketDataError';
  }
}
