import type { Universe, UniverseId } from './types';

export const UNIVERSES: Universe[] = [
  {
    id: 'sp500',
    label: 'S&P 500',
    description: 'The 500 largest US companies, grouped by sector.',
    pro: false,
  },
  {
    id: 'nasdaq100',
    label: 'Nasdaq 100',
    description: 'Large-cap non-financial Nasdaq listings.',
    pro: true,
  },
  {
    id: 'dowjones',
    label: 'Dow 30',
    description: 'The Dow Jones Industrial Average.',
    pro: true,
  },
  {
    id: 'full',
    label: 'Full US market',
    description: 'Every US listing above $300M market cap.',
    pro: true,
  },
  {
    id: 'etf',
    label: 'ETFs',
    description: 'Sector, country and thematic funds by AUM.',
    pro: true,
  },
  {
    id: 'crypto',
    label: 'Crypto',
    description: 'Top coins and tokens by market cap.',
    pro: true,
  },
  {
    id: 'world',
    label: 'World',
    description: 'Global equities grouped by country and region.',
    pro: true,
  },
];

export const DEFAULT_UNIVERSE: UniverseId = 'sp500';

export function universeById(id: UniverseId): Universe {
  return UNIVERSES.find((u) => u.id === id) ?? UNIVERSES[0];
}
