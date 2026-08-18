import {
  type FetchOptions,
  type MarketDataProvider,
  type MarketSnapshot,
  type Quote,
} from '../types';

/**
 * Offline provider used by `npm start` when no API key is configured, and
 * by the layout tests.
 *
 * Market caps are real-ish so sector proportions look like the live map;
 * changes are generated from a seeded PRNG so screenshots and snapshot
 * tests are stable. Sector-level drift is applied on top of per-name noise
 * so the map shows the block structure a real session does, rather than
 * uniform confetti.
 */

interface Seed {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  /** Approximate market cap in USD billions. */
  cap: number;
}

const SEEDS: Seed[] = [
  // Technology
  { symbol: 'AAPL', name: 'Apple', sector: 'Technology', industry: 'Consumer Electronics', cap: 3400 },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'Technology', industry: 'Software—Infrastructure', cap: 3100 },
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'Technology', industry: 'Semiconductors', cap: 3000 },
  { symbol: 'AVGO', name: 'Broadcom', sector: 'Technology', industry: 'Semiconductors', cap: 780 },
  { symbol: 'ORCL', name: 'Oracle', sector: 'Technology', industry: 'Software—Infrastructure', cap: 470 },
  { symbol: 'CRM', name: 'Salesforce', sector: 'Technology', industry: 'Software—Application', cap: 260 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology', industry: 'Semiconductors', cap: 250 },
  { symbol: 'ADBE', name: 'Adobe', sector: 'Technology', industry: 'Software—Infrastructure', cap: 230 },
  { symbol: 'ACN', name: 'Accenture', sector: 'Technology', industry: 'Information Technology Services', cap: 220 },
  { symbol: 'CSCO', name: 'Cisco', sector: 'Technology', industry: 'Communication Equipment', cap: 215 },
  { symbol: 'QCOM', name: 'Qualcomm', sector: 'Technology', industry: 'Semiconductors', cap: 190 },
  { symbol: 'TXN', name: 'Texas Instruments', sector: 'Technology', industry: 'Semiconductors', cap: 180 },
  { symbol: 'INTU', name: 'Intuit', sector: 'Technology', industry: 'Software—Application', cap: 175 },
  { symbol: 'IBM', name: 'IBM', sector: 'Technology', industry: 'Information Technology Services', cap: 170 },
  { symbol: 'AMAT', name: 'Applied Materials', sector: 'Technology', industry: 'Semiconductor Equipment', cap: 160 },
  { symbol: 'MU', name: 'Micron', sector: 'Technology', industry: 'Semiconductors', cap: 115 },
  { symbol: 'LRCX', name: 'Lam Research', sector: 'Technology', industry: 'Semiconductor Equipment', cap: 95 },
  { symbol: 'NOW', name: 'ServiceNow', sector: 'Technology', industry: 'Software—Application', cap: 190 },
  { symbol: 'PANW', name: 'Palo Alto Networks', sector: 'Technology', industry: 'Software—Infrastructure', cap: 110 },
  { symbol: 'INTC', name: 'Intel', sector: 'Technology', industry: 'Semiconductors', cap: 90 },

  // Communication Services
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'Communication Services', industry: 'Internet Content & Information', cap: 2100 },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Communication Services', industry: 'Internet Content & Information', cap: 1300 },
  { symbol: 'NFLX', name: 'Netflix', sector: 'Communication Services', industry: 'Entertainment', cap: 300 },
  { symbol: 'DIS', name: 'Walt Disney', sector: 'Communication Services', industry: 'Entertainment', cap: 180 },
  { symbol: 'CMCSA', name: 'Comcast', sector: 'Communication Services', industry: 'Telecom Services', cap: 160 },
  { symbol: 'VZ', name: 'Verizon', sector: 'Communication Services', industry: 'Telecom Services', cap: 175 },
  { symbol: 'T', name: 'AT&T', sector: 'Communication Services', industry: 'Telecom Services', cap: 155 },
  { symbol: 'TMUS', name: 'T-Mobile US', sector: 'Communication Services', industry: 'Telecom Services', cap: 240 },
  { symbol: 'EA', name: 'Electronic Arts', sector: 'Communication Services', industry: 'Electronic Gaming & Multimedia', cap: 38 },

  // Consumer Cyclical
  { symbol: 'AMZN', name: 'Amazon', sector: 'Consumer Cyclical', industry: 'Internet Retail', cap: 2000 },
  { symbol: 'TSLA', name: 'Tesla', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', cap: 800 },
  { symbol: 'HD', name: 'Home Depot', sector: 'Consumer Cyclical', industry: 'Home Improvement Retail', cap: 380 },
  { symbol: 'MCD', name: "McDonald's", sector: 'Consumer Cyclical', industry: 'Restaurants', cap: 210 },
  { symbol: 'BKNG', name: 'Booking Holdings', sector: 'Consumer Cyclical', industry: 'Travel Services', cap: 145 },
  { symbol: 'LOW', name: "Lowe's", sector: 'Consumer Cyclical', industry: 'Home Improvement Retail', cap: 140 },
  { symbol: 'TJX', name: 'TJX Companies', sector: 'Consumer Cyclical', industry: 'Apparel Retail', cap: 135 },
  { symbol: 'NKE', name: 'Nike', sector: 'Consumer Cyclical', industry: 'Footwear & Accessories', cap: 115 },
  { symbol: 'SBUX', name: 'Starbucks', sector: 'Consumer Cyclical', industry: 'Restaurants', cap: 105 },
  { symbol: 'GM', name: 'General Motors', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', cap: 55 },
  { symbol: 'F', name: 'Ford', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', cap: 42 },

  // Financial Services
  { symbol: 'BRK.B', name: 'Berkshire Hathaway', sector: 'Financial Services', industry: 'Insurance—Diversified', cap: 980 },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financial Services', industry: 'Banks—Diversified', cap: 660 },
  { symbol: 'V', name: 'Visa', sector: 'Financial Services', industry: 'Credit Services', cap: 560 },
  { symbol: 'MA', name: 'Mastercard', sector: 'Financial Services', industry: 'Credit Services', cap: 460 },
  { symbol: 'BAC', name: 'Bank of America', sector: 'Financial Services', industry: 'Banks—Diversified', cap: 320 },
  { symbol: 'WFC', name: 'Wells Fargo', sector: 'Financial Services', industry: 'Banks—Diversified', cap: 240 },
  { symbol: 'GS', name: 'Goldman Sachs', sector: 'Financial Services', industry: 'Capital Markets', cap: 165 },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'Financial Services', industry: 'Capital Markets', cap: 165 },
  { symbol: 'AXP', name: 'American Express', sector: 'Financial Services', industry: 'Credit Services', cap: 190 },
  { symbol: 'BLK', name: 'BlackRock', sector: 'Financial Services', industry: 'Asset Management', cap: 150 },
  { symbol: 'SCHW', name: 'Charles Schwab', sector: 'Financial Services', industry: 'Capital Markets', cap: 130 },
  { symbol: 'C', name: 'Citigroup', sector: 'Financial Services', industry: 'Banks—Diversified', cap: 125 },

  // Healthcare
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'Healthcare', industry: 'Drug Manufacturers—General', cap: 800 },
  { symbol: 'UNH', name: 'UnitedHealth', sector: 'Healthcare', industry: 'Healthcare Plans', cap: 520 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', industry: 'Drug Manufacturers—General', cap: 380 },
  { symbol: 'ABBV', name: 'AbbVie', sector: 'Healthcare', industry: 'Drug Manufacturers—General', cap: 330 },
  { symbol: 'MRK', name: 'Merck', sector: 'Healthcare', industry: 'Drug Manufacturers—General', cap: 290 },
  { symbol: 'TMO', name: 'Thermo Fisher', sector: 'Healthcare', industry: 'Diagnostics & Research', cap: 220 },
  { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare', industry: 'Medical Devices', cap: 200 },
  { symbol: 'DHR', name: 'Danaher', sector: 'Healthcare', industry: 'Diagnostics & Research', cap: 190 },
  { symbol: 'PFE', name: 'Pfizer', sector: 'Healthcare', industry: 'Drug Manufacturers—General', cap: 160 },
  { symbol: 'AMGN', name: 'Amgen', sector: 'Healthcare', industry: 'Drug Manufacturers—General', cap: 165 },
  { symbol: 'ISRG', name: 'Intuitive Surgical', sector: 'Healthcare', industry: 'Medical Instruments', cap: 175 },
  { symbol: 'CVS', name: 'CVS Health', sector: 'Healthcare', industry: 'Healthcare Plans', cap: 75 },

  // Consumer Defensive
  { symbol: 'WMT', name: 'Walmart', sector: 'Consumer Defensive', industry: 'Discount Stores', cap: 620 },
  { symbol: 'COST', name: 'Costco', sector: 'Consumer Defensive', industry: 'Discount Stores', cap: 400 },
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'Consumer Defensive', industry: 'Household & Personal Products', cap: 390 },
  { symbol: 'KO', name: 'Coca-Cola', sector: 'Consumer Defensive', industry: 'Beverages—Non-Alcoholic', cap: 280 },
  { symbol: 'PEP', name: 'PepsiCo', sector: 'Consumer Defensive', industry: 'Beverages—Non-Alcoholic', cap: 230 },
  { symbol: 'PM', name: 'Philip Morris', sector: 'Consumer Defensive', industry: 'Tobacco', cap: 190 },
  { symbol: 'MDLZ', name: 'Mondelez', sector: 'Consumer Defensive', industry: 'Confectioners', cap: 90 },
  { symbol: 'TGT', name: 'Target', sector: 'Consumer Defensive', industry: 'Discount Stores', cap: 65 },

  // Energy
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', industry: 'Oil & Gas Integrated', cap: 480 },
  { symbol: 'CVX', name: 'Chevron', sector: 'Energy', industry: 'Oil & Gas Integrated', cap: 280 },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy', industry: 'Oil & Gas E&P', cap: 130 },
  { symbol: 'SLB', name: 'Schlumberger', sector: 'Energy', industry: 'Oil & Gas Equipment', cap: 60 },
  { symbol: 'EOG', name: 'EOG Resources', sector: 'Energy', industry: 'Oil & Gas E&P', cap: 70 },
  { symbol: 'PSX', name: 'Phillips 66', sector: 'Energy', industry: 'Oil & Gas Refining', cap: 55 },

  // Industrials
  { symbol: 'GE', name: 'GE Aerospace', sector: 'Industrials', industry: 'Aerospace & Defense', cap: 200 },
  { symbol: 'CAT', name: 'Caterpillar', sector: 'Industrials', industry: 'Farm & Heavy Construction', cap: 175 },
  { symbol: 'RTX', name: 'RTX Corporation', sector: 'Industrials', industry: 'Aerospace & Defense', cap: 160 },
  { symbol: 'HON', name: 'Honeywell', sector: 'Industrials', industry: 'Conglomerates', cap: 140 },
  { symbol: 'UNP', name: 'Union Pacific', sector: 'Industrials', industry: 'Railroads', cap: 145 },
  { symbol: 'BA', name: 'Boeing', sector: 'Industrials', industry: 'Aerospace & Defense', cap: 110 },
  { symbol: 'DE', name: 'Deere & Company', sector: 'Industrials', industry: 'Farm & Heavy Construction', cap: 115 },
  { symbol: 'UPS', name: 'United Parcel Service', sector: 'Industrials', industry: 'Integrated Freight & Logistics', cap: 105 },
  { symbol: 'LMT', name: 'Lockheed Martin', sector: 'Industrials', industry: 'Aerospace & Defense', cap: 110 },

  // Utilities
  { symbol: 'NEE', name: 'NextEra Energy', sector: 'Utilities', industry: 'Utilities—Regulated Electric', cap: 150 },
  { symbol: 'SO', name: 'Southern Company', sector: 'Utilities', industry: 'Utilities—Regulated Electric', cap: 95 },
  { symbol: 'DUK', name: 'Duke Energy', sector: 'Utilities', industry: 'Utilities—Regulated Electric', cap: 85 },
  { symbol: 'AEP', name: 'American Electric Power', sector: 'Utilities', industry: 'Utilities—Regulated Electric', cap: 55 },

  // Real Estate
  { symbol: 'PLD', name: 'Prologis', sector: 'Real Estate', industry: 'REIT—Industrial', cap: 105 },
  { symbol: 'AMT', name: 'American Tower', sector: 'Real Estate', industry: 'REIT—Specialty', cap: 90 },
  { symbol: 'EQIX', name: 'Equinix', sector: 'Real Estate', industry: 'REIT—Specialty', cap: 80 },
  { symbol: 'SPG', name: 'Simon Property Group', sector: 'Real Estate', industry: 'REIT—Retail', cap: 55 },

  // Basic Materials
  { symbol: 'LIN', name: 'Linde', sector: 'Basic Materials', industry: 'Specialty Chemicals', cap: 210 },
  { symbol: 'SHW', name: 'Sherwin-Williams', sector: 'Basic Materials', industry: 'Specialty Chemicals', cap: 90 },
  { symbol: 'FCX', name: 'Freeport-McMoRan', sector: 'Basic Materials', industry: 'Copper', cap: 65 },
  { symbol: 'NEM', name: 'Newmont', sector: 'Basic Materials', industry: 'Gold', cap: 50 },
];

/** Mulberry32 — small, fast, and deterministic for a given seed. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Box–Muller, so the tails look like a real day rather than a flat band. */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), Number.EPSILON);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Longer windows drift further, so scale the spread with the timeframe. */
const SPREAD: Record<string, number> = {
  '1D': 1.4,
  '1W': 3,
  '1M': 6,
  '3M': 10,
  '6M': 14,
  YTD: 16,
  '1Y': 22,
};

export class MockProvider implements MarketDataProvider {
  readonly id = 'mock';

  constructor(private readonly seed = 7) {}

  async fetchSnapshot(options: FetchOptions): Promise<MarketSnapshot> {
    const { universe, timeframe } = options;
    const spread = SPREAD[timeframe] ?? 2;

    // One drift per sector so the map shows blocks, not confetti.
    const sectorDrift = new Map<string, number>();
    for (const seed of SEEDS) {
      if (sectorDrift.has(seed.sector)) continue;
      const rand = makeRandom(hashString(seed.sector + timeframe) ^ this.seed);
      sectorDrift.set(seed.sector, gaussian(rand) * spread * 0.55);
    }

    const quotes: Quote[] = SEEDS.map((seed) => {
      const rand = makeRandom(hashString(seed.symbol + timeframe) ^ this.seed);
      const idiosyncratic = gaussian(rand) * spread * 0.8;
      const changePct =
        (sectorDrift.get(seed.sector) ?? 0) + idiosyncratic;

      // Back out a plausible price from the cap so the detail sheet has
      // something coherent to show.
      const shares = 0.4 + rand() * 6;
      const price = (seed.cap / shares) * (1 + changePct / 100);

      return {
        symbol: seed.symbol,
        name: seed.name,
        sector: seed.sector,
        industry: seed.industry,
        marketCap: seed.cap * 1e9,
        price: Number(price.toFixed(2)),
        changePct: Number(changePct.toFixed(2)),
        volume: Math.round(1e6 + rand() * 4e7),
      };
    });

    return {
      universe,
      timeframe,
      quotes,
      asOf: Date.now(),
      delayMinutes: 0,
    };
  }
}
