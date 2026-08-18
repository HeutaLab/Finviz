/**
 * Market map edge API (Cloudflare Worker).
 *
 * This exists for two reasons that the client cannot handle on its own:
 *
 *   1. The data vendor key stays here. A key shipped inside a mobile binary
 *      gets extracted and drained, and the bill lands on us.
 *   2. The free/Pro split is decided here. The client's entitlement flag is
 *      a UI hint; this is where real-time data is actually withheld, after
 *      verifying the subscription against RevenueCat.
 *
 * One shared upstream fetch serves every user, so vendor request volume is
 * a function of universes × timeframes, not of user count.
 */

export interface Env {
  FMP_API_KEY: string;
  REVENUECAT_SECRET_KEY?: string;
  /** KV namespace used for both the snapshot cache and entitlement cache. */
  MAP_CACHE: KVNamespace;
}

const FMP_BASE = 'https://financialmodelingprep.com/api';
const PRO_ENTITLEMENT = 'pro';

/** Free users read a snapshot at least this old. */
const DELAY_MINUTES = 15;
/** How long a live snapshot is reused before refetching upstream. */
const LIVE_TTL_SECONDS = 20;
/** Entitlement lookups are cached so RevenueCat is not hit per request. */
const ENTITLEMENT_TTL_SECONDS = 300;

const FREE_UNIVERSES = new Set(['sp500']);
const FREE_TIMEFRAMES = new Set(['1D']);

const CONSTITUENT_PATH: Record<string, string> = {
  sp500: '/v3/sp500_constituent',
  nasdaq100: '/v3/nasdaq_constituent',
  dowjones: '/v3/dowjones_constituent',
};

const CHANGE_FIELD: Record<string, string> = {
  '1D': '1D',
  '1W': '5D',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  YTD: 'ytd',
  '1Y': '1Y',
};

interface Quote {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  price: number;
  changePct: number;
  volume?: number;
}

interface Snapshot {
  universe: string;
  timeframe: string;
  quotes: Quote[];
  asOf: number;
  delayMinutes: number;
}

function json(body: unknown, status = 200, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheSeconds
        ? `public, max-age=${cacheSeconds}`
        : 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Asks RevenueCat whether this app user id holds the Pro entitlement.
 *
 * Fails closed: if RevenueCat is unreachable we treat the caller as free.
 * A paying user briefly seeing delayed data is a much smaller problem than
 * handing out real-time data to everyone during an outage.
 */
async function isPro(appUserId: string | null, env: Env): Promise<boolean> {
  if (!appUserId || !env.REVENUECAT_SECRET_KEY) return false;

  const cacheKey = `entitlement:${appUserId}`;
  const cached = await env.MAP_CACHE.get(cacheKey);
  if (cached !== null) return cached === '1';

  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}` } }
    );
    if (!response.ok) return false;

    const body = (await response.json()) as {
      subscriber?: {
        entitlements?: Record<string, { expires_date?: string | null }>;
      };
    };

    const entitlement = body.subscriber?.entitlements?.[PRO_ENTITLEMENT];
    const active = Boolean(
      entitlement &&
        (entitlement.expires_date === null ||
          (entitlement.expires_date &&
            Date.parse(entitlement.expires_date) > Date.now()))
    );

    await env.MAP_CACHE.put(cacheKey, active ? '1' : '0', {
      expirationTtl: ENTITLEMENT_TTL_SECONDS,
    });
    return active;
  } catch {
    return false;
  }
}

async function fmp<T>(path: string, env: Env): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(
    `${FMP_BASE}${path}${separator}apikey=${env.FMP_API_KEY}`,
    { cf: { cacheTtl: 30, cacheEverything: true } }
  );
  if (!response.ok) {
    throw new Error(`upstream ${response.status}`);
  }
  return (await response.json()) as T;
}

async function buildSnapshot(
  universe: string,
  timeframe: string,
  env: Env
): Promise<Snapshot> {
  const path = CONSTITUENT_PATH[universe];
  if (!path) throw new Error('unsupported universe');

  const members = await fmp<
    { symbol: string; name: string; sector: string; subSector?: string }[]
  >(path, env);

  const symbols = members.map((m) => m.symbol);
  const needsChange = timeframe !== '1D';

  const quoteBatches = await Promise.all(
    chunk(symbols, 100).map((batch) =>
      fmp<
        {
          symbol: string;
          price?: number;
          changesPercentage?: number;
          marketCap?: number;
          volume?: number;
        }[]
      >(`/v3/quote/${batch.join(',')}`, env)
    )
  );

  const changeBatches = needsChange
    ? await Promise.all(
        chunk(symbols, 100).map((batch) =>
          fmp<Record<string, number | string>[]>(
            `/v3/stock-price-change/${batch.join(',')}`,
            env
          )
        )
      )
    : [];

  const quoteMap = new Map(quoteBatches.flat().map((q) => [q.symbol, q]));
  const changeMap = new Map(
    changeBatches.flat().map((c) => [String(c.symbol), c])
  );
  const field = CHANGE_FIELD[timeframe] ?? '1D';

  const quotes: Quote[] = [];
  for (const member of members) {
    const quote = quoteMap.get(member.symbol);
    if (!quote?.marketCap || quote.marketCap <= 0) continue;

    const changePct = needsChange
      ? Number(changeMap.get(member.symbol)?.[field])
      : quote.changesPercentage;

    if (typeof changePct !== 'number' || !Number.isFinite(changePct)) continue;

    quotes.push({
      symbol: member.symbol,
      name: member.name,
      sector: member.sector || 'Other',
      industry: member.subSector || member.sector || 'Other',
      marketCap: quote.marketCap,
      price: quote.price ?? 0,
      changePct,
      volume: quote.volume,
    });
  }

  return { universe, timeframe, quotes, asOf: Date.now(), delayMinutes: 0 };
}

function liveKey(universe: string, timeframe: string): string {
  return `snapshot:live:${universe}:${timeframe}`;
}

function delayedKey(universe: string, timeframe: string): string {
  return `snapshot:delayed:${universe}:${timeframe}`;
}

/** Fetches the live snapshot, reusing the cached one inside its short TTL. */
async function readLive(
  universe: string,
  timeframe: string,
  env: Env
): Promise<Snapshot> {
  const key = liveKey(universe, timeframe);
  const cached = await env.MAP_CACHE.get<Snapshot>(key, 'json');

  if (cached && Date.now() - cached.asOf < LIVE_TTL_SECONDS * 1000) {
    return cached;
  }

  const fresh = await buildSnapshot(universe, timeframe, env);
  await env.MAP_CACHE.put(key, JSON.stringify(fresh), { expirationTtl: 3600 });
  return fresh;
}

/**
 * Free tier reads the delayed slot; Pro reads live.
 *
 * The delayed slot is only ever written by the scheduled handler below, so
 * it ages naturally between promotions. A request must never refresh it —
 * doing so would hand every free user live data, which is the whole thing
 * being sold. The one exception is a cold slot, which is seeded once and
 * then reported at its true age rather than a claimed one.
 */
async function readSnapshot(
  universe: string,
  timeframe: string,
  pro: boolean,
  env: Env
): Promise<Snapshot> {
  if (pro) return readLive(universe, timeframe, env);

  const key = delayedKey(universe, timeframe);
  let delayed = await env.MAP_CACHE.get<Snapshot>(key, 'json');

  if (!delayed) {
    // Cold start before the first cron promotion.
    delayed = await readLive(universe, timeframe, env);
    await env.MAP_CACHE.put(key, JSON.stringify(delayed), {
      expirationTtl: 3600,
    });
  }

  return {
    ...delayed,
    // Reported from the real sample time, so the badge never overstates
    // freshness even if a promotion was missed.
    delayMinutes: Math.max(0, Math.round((Date.now() - delayed.asOf) / 60000)),
  };
}

/** Universe/timeframe pairs the cron keeps warm. */
const SCHEDULED_PAIRS: [string, string][] = [
  ['sp500', '1D'],
  ['nasdaq100', '1D'],
  ['dowjones', '1D'],
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'x-app-user-id, accept',
        },
      });
    }

    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname !== '/v1/map') return json({ error: 'not found' }, 404);

    const universe = url.searchParams.get('universe') ?? 'sp500';
    const timeframe = url.searchParams.get('timeframe') ?? '1D';

    if (!CONSTITUENT_PATH[universe]) {
      return json({ error: 'unsupported universe' }, 400);
    }
    if (!CHANGE_FIELD[timeframe]) {
      return json({ error: 'unsupported timeframe' }, 400);
    }

    const pro = await isPro(request.headers.get('x-app-user-id'), env);

    // The real paywall. Not a client-side flag.
    if (!pro && (!FREE_UNIVERSES.has(universe) || !FREE_TIMEFRAMES.has(timeframe))) {
      return json({ error: 'pro_required' }, 402);
    }

    try {
      const snapshot = await readSnapshot(universe, timeframe, pro, env);
      return json(snapshot, 200, pro ? 0 : 60);
    } catch (error) {
      return json({ error: (error as Error).message }, 502);
    }
  },

  /**
   * Runs on the cron in wrangler.toml (every 15 minutes). Promotes the
   * current live snapshot into the delayed slot, which is what gives free
   * users real data on a real lag.
   */
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    for (const [universe, timeframe] of SCHEDULED_PAIRS) {
      try {
        // Promote the *previous* live snapshot, then replace it. Copying the
        // new one into both slots would leave free users a few seconds
        // behind rather than the tier they signed up for.
        const previous = await env.MAP_CACHE.get<Snapshot>(
          liveKey(universe, timeframe),
          'json'
        );
        const snapshot = await buildSnapshot(universe, timeframe, env);

        await env.MAP_CACHE.put(
          liveKey(universe, timeframe),
          JSON.stringify(snapshot),
          { expirationTtl: 3600 }
        );
        await env.MAP_CACHE.put(
          delayedKey(universe, timeframe),
          JSON.stringify(previous ?? snapshot),
          { expirationTtl: 3600 }
        );
      } catch {
        // One bad universe must not stop the others being refreshed.
      }
    }
  },
};
