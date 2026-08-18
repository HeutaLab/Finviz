import {
  MarketDataError,
  type FetchOptions,
  type MarketDataProvider,
  type MarketSnapshot,
} from '../types';

/**
 * Talks to our own edge worker (see `server/`) instead of the data vendor.
 *
 * This is the production path, for two reasons that both matter more than
 * the extra hop:
 *
 *   - the vendor API key stays server-side;
 *   - the free/Pro split is decided by the server after checking the
 *     entitlement, so it cannot be unlocked by patching the client.
 *
 * The client sends its RevenueCat app user id; the worker verifies the
 * entitlement against RevenueCat and picks the cache tier from the answer.
 */
export class ProxyProvider implements MarketDataProvider {
  readonly id = 'proxy';

  constructor(
    private readonly baseUrl: string,
    private readonly getAppUserId: () => string | undefined
  ) {}

  async fetchSnapshot(options: FetchOptions): Promise<MarketSnapshot> {
    const { universe, timeframe, signal } = options;

    const url = new URL('/v1/map', this.baseUrl);
    url.searchParams.set('universe', universe);
    url.searchParams.set('timeframe', timeframe);

    const headers: Record<string, string> = { accept: 'application/json' };
    const appUserId = this.getAppUserId();
    if (appUserId) headers['x-app-user-id'] = appUserId;

    let response: Response;
    try {
      response = await fetch(url.toString(), { headers, signal });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      throw new MarketDataError('Could not reach the market data service', 'network');
    }

    if (response.status === 402) {
      throw new MarketDataError('That map is part of Pro', 'unsupported');
    }
    if (response.status === 429) {
      throw new MarketDataError('Too many requests — try again shortly', 'rate_limit');
    }
    if (!response.ok) {
      throw new MarketDataError(`Market data request failed (${response.status})`);
    }

    const body = (await response.json()) as MarketSnapshot;
    if (!Array.isArray(body?.quotes) || body.quotes.length === 0) {
      throw new MarketDataError('Market data came back empty');
    }

    return body;
  }
}
