import { MockProvider } from '../src/data/providers/mock';
import type { Quote } from '../src/data/types';
import {
  findTicker,
  layoutMap,
  tickerTiles,
  tileAt,
} from '../src/treemap/buildTree';

const WIDTH = 390;
const HEIGHT = 700;

function quote(partial: Partial<Quote> & Pick<Quote, 'symbol'>): Quote {
  return {
    name: partial.symbol,
    sector: 'Technology',
    industry: 'Software',
    marketCap: 100e9,
    price: 100,
    changePct: 0,
    ...partial,
  };
}

async function realisticQuotes(): Promise<Quote[]> {
  const snapshot = await new MockProvider().fetchSnapshot({
    universe: 'sp500',
    timeframe: '1D',
    realtime: false,
  });
  return snapshot.quotes;
}

describe('layoutMap', () => {
  it('groups into sector → industry → ticker', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });

    expect(tiles.length).toBeGreaterThan(1);
    for (const sector of tiles) {
      expect(sector.kind).toBe('sector');
      for (const industry of sector.children ?? []) {
        expect(industry.kind).toBe('industry');
        for (const ticker of industry.children ?? []) {
          expect(ticker.kind).toBe('ticker');
          expect(ticker.quote).toBeDefined();
        }
      }
    }
  });

  it('places every quote exactly once', async () => {
    const quotes = await realisticQuotes();
    const tiles = layoutMap(quotes, { width: WIDTH, height: HEIGHT });

    const symbols = [...tickerTiles(tiles)].map((t) => t.key);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols.sort()).toEqual(quotes.map((q) => q.symbol).sort());
  });

  it('keeps every tile inside the canvas', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });

    for (const tile of tickerTiles(tiles)) {
      expect(tile.rect.x).toBeGreaterThanOrEqual(-0.001);
      expect(tile.rect.y).toBeGreaterThanOrEqual(-0.001);
      expect(tile.rect.x + tile.rect.w).toBeLessThanOrEqual(WIDTH + 0.001);
      expect(tile.rect.y + tile.rect.h).toBeLessThanOrEqual(HEIGHT + 0.001);
    }
  });

  it('weights a sector change by market cap, not by count', () => {
    const tiles = layoutMap(
      [
        quote({ symbol: 'BIG', marketCap: 900e9, changePct: 1 }),
        quote({ symbol: 'SMALL', marketCap: 100e9, changePct: -9 }),
      ],
      { width: WIDTH, height: HEIGHT }
    );

    // (900*1 + 100*-9) / 1000 = 0
    expect(tiles[0].changePct).toBeCloseTo(0, 6);
  });

  it('gives a large sector a header and a tiny one none', () => {
    const tiles = layoutMap(
      [
        quote({ symbol: 'HUGE', sector: 'Technology', marketCap: 5000e9 }),
        quote({ symbol: 'TINY', sector: 'Utilities', marketCap: 1e9 }),
      ],
      { width: WIDTH, height: HEIGHT }
    );

    const tech = tiles.find((t) => t.label === 'Technology');
    const utilities = tiles.find((t) => t.label === 'Utilities');

    expect(tech?.header).toBeDefined();
    expect(utilities?.header).toBeUndefined();
  });

  it('returns nothing for empty or zero-cap input', () => {
    expect(layoutMap([], { width: WIDTH, height: HEIGHT })).toEqual([]);
    expect(
      layoutMap([quote({ symbol: 'X', marketCap: 0 })], {
        width: WIDTH,
        height: HEIGHT,
      })
    ).toEqual([]);
  });

  it('handles a canvas with no area', () => {
    expect(layoutMap([quote({ symbol: 'X' })], { width: 0, height: 0 })).toEqual([]);
  });
});

describe('tileAt', () => {
  it('returns the ticker under a point, not its sector', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });

    const target = [...tickerTiles(tiles)][3];
    const hit = tileAt(
      tiles,
      target.rect.x + target.rect.w / 2,
      target.rect.y + target.rect.h / 2
    );

    expect(hit?.kind).toBe('ticker');
    expect(hit?.key).toBe(target.key);
  });

  it('returns undefined outside the canvas', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });
    expect(tileAt(tiles, -10, -10)).toBeUndefined();
    expect(tileAt(tiles, WIDTH + 50, HEIGHT + 50)).toBeUndefined();
  });
});

describe('findTicker', () => {
  it('finds a symbol case-insensitively', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });

    expect(findTicker(tiles, 'aapl')?.key).toBe('AAPL');
    expect(findTicker(tiles, ' MSFT ')?.key).toBe('MSFT');
    expect(findTicker(tiles, 'NOPE')).toBeUndefined();
  });
});

describe('MockProvider', () => {
  it('is deterministic for a given timeframe', async () => {
    const provider = new MockProvider();
    const a = await provider.fetchSnapshot({
      universe: 'sp500',
      timeframe: '1D',
      realtime: false,
    });
    const b = await provider.fetchSnapshot({
      universe: 'sp500',
      timeframe: '1D',
      realtime: false,
    });

    expect(a.quotes.map((q) => q.changePct)).toEqual(
      b.quotes.map((q) => q.changePct)
    );
  });

  it('spreads wider over longer timeframes', async () => {
    const provider = new MockProvider();
    const spread = async (timeframe: '1D' | '1Y') => {
      const snapshot = await provider.fetchSnapshot({
        universe: 'sp500',
        timeframe,
        realtime: false,
      });
      const values = snapshot.quotes.map((q) => q.changePct);
      return Math.max(...values) - Math.min(...values);
    };

    expect(await spread('1Y')).toBeGreaterThan(await spread('1D'));
  });
});
