# Market Map

A market heatmap built for a phone. Same information density as a desktop
treemap, but pinch-to-zoom, tap-for-detail, search-to-fly, and labels that
appear as you zoom in rather than being rendered at 4px and hoped for.

Free tier is the S&P 500 on 15-minute delayed data. Pro is $2/month for
real-time prices, every map, and every timeframe.

> **Not affiliated with Finviz.** This is an independent app. It does not
> scrape finviz.com and does not use their data or branding — see
> [Data and licensing](#data-and-licensing).

## Why this exists

The desktop treemap is a genuinely great visualisation that degrades badly
on a 390pt-wide screen. Five things are fixed here:

| Problem on mobile web | What this does |
| --- | --- |
| The whole map is scaled to fit; tickers become unreadable specks | Layout is computed once into a fixed world space; pinch/pan is a transform, so zooming reveals real text at real size |
| Zooming the page zooms the chrome too, and pans fight the browser | Native gesture handling — pinch about the focal point, clamped pan, double-tap to zoom and again to reset |
| Hover tooltips do not exist on touch | Tap a tile for a detail sheet that keeps your zoom and pan on dismiss |
| Finding one name in 500 tiles is hopeless | Search by symbol or company; the viewport flies to it |
| Everything is encoded in red vs green | Optional blue/orange palette on the same luminance ramp |

Plus: an adjustable colour cap (a ±3% scale is useless on a quiet day),
watchlists, and a map that stays usable offline from cache.

## Architecture

```
app/                     expo-router screens
  (tabs)/index.tsx       the map
  (tabs)/watchlist.tsx   saved symbols
  (tabs)/settings.tsx    palette, colour cap, haptics, restore
  paywall.tsx            subscription modal

src/treemap/             pure, tested, no React
  squarify.ts            squarified treemap layout
  buildTree.ts           sector → industry → ticker nesting, hit testing
  color.ts               performance → colour, both palettes

src/data/
  types.ts               shared shapes
  provider.ts            picks proxy | FMP | mock from config
  providers/fmp.ts       Financial Modeling Prep adapter
  providers/proxy.ts     our own API (production path)
  providers/mock.ts      deterministic offline dataset
  cache.ts               TTL cache over AsyncStorage
  useMarketMap.ts        fetch, cache tiers, Pro polling, stale fallback

src/components/
  TreemapCanvas.tsx      Skia rendering + gestures
  MapHeader.tsx          universe picker, freshness badge, search
  TimeframeBar.tsx       timeframe pills with Pro locks
  TickerSheet.tsx        tap-a-tile detail sheet
  Legend.tsx             colour key

src/links/
  destinations.ts        where a ticker can open, and URL rules (pure)
  openTicker.ts          Linking/Share side

src/billing/entitlement.ts   RevenueCat wrapper

server/                  Cloudflare Worker: vendor key + real paywall
```

### The one thing that makes it fast

`layoutMap()` runs once per data change into a fixed world rectangle.
Gestures only mutate a transform on the Skia group, so squarify never runs
during a pinch. Labels are culled by their **on-screen** size, so a tile
that is 8px wide draws no text at 1× and draws its symbol and change at 4×.
That is both the performance strategy and the core UX affordance.

### Opening a ticker elsewhere

Tapping a tile opens the detail sheet; its Open button hands the symbol to
whichever app the user picked in Settings. Two mechanisms, and the
difference decides how reliable each destination is:

- **Universal / App Links (https)** — the dependable path. The OS routes
  the URL to the destination app when it is installed and claims the
  domain, and to the browser when it is not. Nothing to declare, and it
  never dead-ends. Yahoo Finance, TradingView, Robinhood, MarketWatch and
  Google Finance all work this way.
- **Custom schemes (`app://`)** — only where the target publishes one, and
  on iOS every scheme passed to `canOpenURL` must also appear in
  `LSApplicationQueriesSchemes` or the probe reports "not installed" even
  when it is.

**Apple Stocks is the awkward one.** Apple publishes no URL scheme for it —
it is absent from Apple's own documentation, and the `stocks://` forms that
circulate are unverified. The app tries them and falls through to a web
destination, so the button always does something, but do not promise
"opens in Apple Stocks" in store copy. The share sheet is the honest
universal escape hatch, and it reaches apps this list has never heard of.

Symbol normalisation is not cosmetic: our data uses `BRK.B`, Yahoo wants
`BRK-B`, and Google needs `BRK.B:NYSE`. Getting it wrong opens a different
company's page, so `destinations.ts` is pure and directly unit-tested,
including the several spellings vendors use for one exchange.

### The paywall is server-side

`src/billing/entitlement.ts` gives the UI a boolean. That boolean decides
what looks locked — nothing more. The actual gate is in `server/src/index.ts`,
which verifies the RevenueCat entitlement before it will serve a Pro
universe, a Pro timeframe, or live (rather than delayed) data. A client-side
flag is not a paywall; anyone can flip it.

The delayed tier is real data on a real lag, not a degraded feed: a cron
promotes the previous live snapshot into the delayed slot every 15 minutes,
and the API reports the snapshot's true age so the badge never overstates
freshness.

## Running it

```bash
npm install
npm start          # boots with the deterministic mock dataset
```

The map needs Skia, which is a native module, so the canvas requires a
development build rather than Expo Go:

```bash
npx expo run:ios      # or run:android
```

Everything else — navigation, settings, watchlist, paywall UI — runs in
Expo Go, and the map shows a clear message instead of white-screening.

### Tests

```bash
npm test           # 55 tests over the layout, colour and link logic
```

The treemap and colour modules are pure TypeScript with no React or native
imports, which is why they are directly testable. Coverage includes area
proportionality, non-overlap, containment, aspect-ratio quality,
cap-weighted sector aggregation, hit testing, palette luminance parity, and
per-destination symbol and exchange normalisation.

### Connecting real data

```bash
cp .env.example .env
```

For local development, set `FMP_API_KEY` and the app talks to Financial
Modeling Prep directly. **Do not ship a build that way** — anything in
Expo's `extra` is readable inside the bundle, and an extracted key gets
drained at your expense. `getProvider()` warns loudly if you try.

For production, deploy the worker and set `API_PROXY_URL`:

```bash
cd server
npm install
wrangler kv namespace create MAP_CACHE   # put the id in wrangler.toml
wrangler secret put FMP_API_KEY
wrangler secret put REVENUECAT_SECRET_KEY
npm run deploy
```

### Billing setup

1. Create the subscription product `finviz_map_pro_monthly` at $1.99 in
   App Store Connect and Play Console.
2. Create a `pro` entitlement in RevenueCat and attach both products.
3. Set `REVENUECAT_IOS_KEY` / `REVENUECAT_ANDROID_KEY` (public SDK keys,
   safe to ship) and `REVENUECAT_SECRET_KEY` on the worker (not safe to
   ship — server only).

Apply for the **App Store Small Business Program** and Play's equivalent
before launch. Both drop the platform cut from 30% to 15% under $1M/year,
which on a $2 subscription is the difference between $1.40 and $1.70.

## Unit economics at $2/month

| Line | Per subscriber |
| --- | --- |
| Gross | $2.00 |
| Store cut at 15% (Small Business Program) | −$0.30 |
| RevenueCat (free under $2.5k/mo tracked revenue, then 1%) | $0.00 |
| **Net** | **$1.70** |

Fixed monthly costs are roughly $29 for an FMP starter plan plus $5 for
Cloudflare Workers with KV — call it $35. Because the worker fetches once
per universe/timeframe and fans that out to every user, data cost is
essentially flat as you grow rather than per-user.

**Break-even is about 21 subscribers.** That is the number worth designing
around: it is small enough to be realistic, and it means the free tier can
stay genuinely useful instead of being crippled to force conversion.

On donations: implement tips as **consumable in-app purchases**, not an
external payment link. Apple permits tipping a developer through IAP, but
routing digital-goods payments outside IAP is what gets apps rejected.
Donations to a registered nonprofit are the opposite case and must use an
external method — that is not what this is.

## Data and licensing

Finviz has no public API, and their terms prohibit scraping and
redistribution. Building a paid product on scraped Finviz data would be a
legal problem, not just a technical one, so this app does not do it. The
treemap is a well-known visualisation (squarified treemaps are published
academic work); the implementation here is original, and the data comes
from a licensed vendor through a swappable adapter.

Two things still worth doing before you launch:

- **Check your data vendor's redistribution terms.** Most retail-tier
  market data plans permit display in your own app but restrict
  redistribution or bulk export. FMP's terms differ by plan tier.
- **Rename and rebrand.** The current package identifiers are placeholders
  (`com.example.marketmap`), and the repository name should not suggest an
  affiliation that does not exist. "Market Map" is already neutral; keep it
  that way in store listings too.

## Roadmap

Not built yet, roughly in value order:

- ETF, crypto and world universes — the adapter and picker already model
  them; each needs a constituent source wired into the worker
- Price alerts (push via Expo Notifications, evaluated in the worker cron)
- Broker deep links beyond the read-only destinations, which is also where
  affiliate revenue would sit — note that referral links need disclosure
- Long-press a sector to zoom it full-screen
- Sparklines in the detail sheet
- Home-screen widget showing your watchlist heat
- Landscape-optimised layout weighting (the layout already adapts, but the
  header/footer chrome could collapse)

## Licence

No licence file yet — add one before making the repository public.
