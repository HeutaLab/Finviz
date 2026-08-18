import { MockProvider } from '../src/data/providers/mock';
import type { Quote } from '../src/data/types';
import {
  MIN_TILE_AREA,
  coveredQuotes,
  findTicker,
  foldTail,
  layoutMap,
  quotesIn,
  scaleToReveal,
  tickerTiles,
  tileAtPoint,
  tilesAtScale,
  viewAtScale,
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

  it('keeps every quote reachable, folded or not', async () => {
    const quotes = await realisticQuotes();
    const tiles = layoutMap(quotes, { width: WIDTH, height: HEIGHT });

    const covered = [...coveredQuotes(tiles)].map((q) => q.symbol);
    expect(new Set(covered).size).toBe(covered.length);
    expect(covered.sort()).toEqual(quotes.map((q) => q.symbol).sort());
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

describe('tileAtPoint', () => {
  it('hits exactly what is drawn at that zoom', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });
    const drawn = tilesAtScale(tiles, 4);
    const target = drawn[3];

    const hit = tileAtPoint(
      drawn,
      target.rect.x + target.rect.w / 2,
      target.rect.y + target.rect.h / 2,
      4
    );

    expect(hit?.key).toBe(target.key);
  });

  it('never resolves to a tile the zoom is hiding', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });
    const drawn = tilesAtScale(tiles, 1);
    const keys = new Set(drawn.map((t) => t.key));

    for (let x = 5; x < WIDTH; x += 37) {
      for (let y = 5; y < HEIGHT; y += 53) {
        const hit = tileAtPoint(drawn, x, y, 1);
        if (hit) expect(keys.has(hit.key)).toBe(true);
      }
    }
  });

  it('returns undefined outside the canvas', async () => {
    const drawn = tilesAtScale(
      layoutMap(await realisticQuotes(), { width: WIDTH, height: HEIGHT }),
      1
    );
    expect(tileAtPoint(drawn, -10, -10, 1)).toBeUndefined();
    expect(tileAtPoint(drawn, WIDTH + 50, HEIGHT + 50, 1)).toBeUndefined();
  });

  it('snaps to the nearest tile within tolerance', async () => {
    const drawn = tilesAtScale(
      layoutMap(await realisticQuotes(), { width: WIDTH, height: HEIGHT }),
      1
    );
    // Just outside the canvas, but within reach of an edge tile.
    expect(tileAtPoint(drawn, -3, HEIGHT / 2, 1, 0)).toBeUndefined();
    expect(tileAtPoint(drawn, -3, HEIGHT / 2, 1, 60)).toBeDefined();
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

/**
 * A realistic index: cap follows a Zipf-like curve, so a handful of names
 * carry most of the weight and the tail is very long. This is the shape
 * that broke the map before folding and level-of-detail existed.
 */
function indexOfSize(n: number): Quote[] {
  const sectors = [
    'Technology', 'Financial Services', 'Healthcare', 'Consumer Cyclical',
    'Communication Services', 'Industrials', 'Consumer Defensive', 'Energy',
    'Utilities', 'Real Estate', 'Basic Materials',
  ];
  return Array.from({ length: n }, (_, i) =>
    quote({
      symbol: `S${i}`,
      sector: sectors[i % sectors.length],
      industry: `Industry ${i % 11}-${i % 7}`,
      marketCap: 3400e9 / Math.pow(i + 1, 1.15),
      changePct: ((i * 37) % 700) / 100 - 3.5,
    })
  );
}

describe('foldTail', () => {
  it('keeps everything when nothing falls below the floor', () => {
    const quotes = [
      quote({ symbol: 'A', marketCap: 100e9 }),
      quote({ symbol: 'B', marketCap: 100e9 }),
    ];
    const { kept, folded } = foldTail(quotes, 10_000, 100);
    expect(kept).toHaveLength(2);
    expect(folded).toHaveLength(0);
  });

  it('folds the tail and leaves the kept tiles their exact area', () => {
    const quotes = [
      quote({ symbol: 'BIG', marketCap: 900e9 }),
      quote({ symbol: 'MID', marketCap: 90e9 }),
      quote({ symbol: 'TINY', marketCap: 5e9 }),
      quote({ symbol: 'MITE', marketCap: 5e9 }),
    ];
    // The two specks together clear a floor of 60, so nothing else is
    // dragged in with them.
    const { kept, folded } = foldTail(quotes, 10_000, 60);

    expect(kept.map((q) => q.symbol)).toEqual(['BIG', 'MID']);
    expect(folded.map((q) => q.symbol)).toEqual(['TINY', 'MITE']);
  });

  it('drags in a neighbour when the tail alone stays below the floor', () => {
    const quotes = [
      quote({ symbol: 'BIG', marketCap: 900e9 }),
      quote({ symbol: 'MID', marketCap: 90e9 }),
      quote({ symbol: 'TINY', marketCap: 5e9 }),
      quote({ symbol: 'MITE', marketCap: 5e9 }),
    ];
    // At 200 the specks sum to only 100, so MID joins them rather than
    // leaving a fold that is itself too small to see.
    const { kept, folded } = foldTail(quotes, 10_000, 200);

    expect(kept.map((q) => q.symbol)).toEqual(['BIG']);
    expect(folded.map((q) => q.symbol)).toEqual(['MID', 'TINY', 'MITE']);
  });

  it('pulls in neighbours until the aggregate clears the floor itself', () => {
    // One lone speck: folding it alone would just make another speck, so a
    // neighbour has to come with it.
    const quotes = [
      quote({ symbol: 'A', marketCap: 500e9 }),
      quote({ symbol: 'B', marketCap: 300e9 }),
      quote({ symbol: 'C', marketCap: 199e9 }),
      quote({ symbol: 'D', marketCap: 1e9 }),
    ];
    const { kept, folded } = foldTail(quotes, 10_000, 2100);

    expect(folded.length).toBeGreaterThan(1);
    const foldedCap = folded.reduce((s, q) => s + q.marketCap, 0);
    const total = quotes.reduce((s, q) => s + q.marketCap, 0);
    expect((foldedCap / total) * 10_000).toBeGreaterThanOrEqual(2100);
    expect(kept.length + folded.length).toBe(4);
  });

  it('folds only what could never be tapped at any zoom', () => {
    // Folding is permanent, so the floor has to sit below what the maximum
    // zoom can rescue: MIN_TILE_AREA must reach a 44pt target within 14×.
    const reachable = MIN_TILE_AREA * 14 * 14;
    expect(reachable).toBeGreaterThanOrEqual(44 * 44);
  });

  it('is a no-op when folding is disabled', () => {
    const quotes = indexOfSize(20);
    const { kept, folded } = foldTail(quotes, 1000, 0);
    expect(kept).toHaveLength(20);
    expect(folded).toHaveLength(0);
  });
});

describe('level of detail at index scale', () => {
  const SIZES = [99, 503, 2000];

  it.each(SIZES)('loses no quote from a %i-name index', (n) => {
    const tiles = layoutMap(indexOfSize(n), { width: WIDTH, height: HEIGHT });
    const covered = new Set([...coveredQuotes(tiles)].map((q) => q.symbol));
    expect(covered.size).toBe(n);
  });

  it.each(SIZES)('draws nothing unreadably small in a %i-name index', (n) => {
    const tiles = layoutMap(indexOfSize(n), { width: WIDTH, height: HEIGHT });

    for (const scale of [1, 2, 4, 8, 14]) {
      for (const tile of tilesAtScale(tiles, scale)) {
        const w = tile.rect.w * scale;
        const h = tile.rect.h * scale;
        // This is the regression that mattered: at 503 names a quarter of
        // the map used to render below 2px.
        expect(Math.min(w, h)).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it.each(SIZES)('keeps drawn tiles close to square in a %i-name index', (n) => {
    const tiles = layoutMap(indexOfSize(n), { width: WIDTH, height: HEIGHT });

    for (const scale of [1, 4, 14]) {
      for (const tile of tilesAtScale(tiles, scale)) {
        const aspect = Math.max(
          tile.rect.w / tile.rect.h,
          tile.rect.h / tile.rect.w
        );
        // Was 103:1 before the shape guard.
        expect(aspect).toBeLessThanOrEqual(10);
      }
    }
  });

  it('shows fewer, larger tiles when zoomed out than when zoomed in', () => {
    const tiles = layoutMap(indexOfSize(503), { width: WIDTH, height: HEIGHT });
    expect(tilesAtScale(tiles, 1).length).toBeLessThan(
      tilesAtScale(tiles, 8).length
    );
  });

  it('covers the canvas exactly once at every zoom', () => {
    const tiles = layoutMap(indexOfSize(503), { width: WIDTH, height: HEIGHT });

    for (const scale of [1, 3, 8]) {
      const drawn = tilesAtScale(tiles, scale);
      for (let i = 0; i < drawn.length; i += 1) {
        for (let j = i + 1; j < drawn.length; j += 1) {
          const a = drawn[i].rect;
          const b = drawn[j].rect;
          const overlaps =
            a.x < b.x + b.w - 0.01 &&
            a.x + a.w - 0.01 > b.x &&
            a.y < b.y + b.h - 0.01 &&
            a.y + a.h - 0.01 > b.y;
          expect(overlaps).toBe(false);
        }
      }
    }
  });

  it('reports dissolved groups separately from drawn tiles', () => {
    const tiles = layoutMap(indexOfSize(503), { width: WIDTH, height: HEIGHT });
    const view = viewAtScale(tiles, 8);

    const drawnKeys = new Set(view.drawn.map((t) => t.key));
    for (const group of view.dissolved) {
      // A dissolved group is represented by its children, never itself.
      expect(drawnKeys.has(group.key)).toBe(false);
    }
  });
});

describe('quotesIn', () => {
  it('returns the single quote for a ticker tile', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });
    const ticker = [...tickerTiles(tiles)][0];
    expect(quotesIn(ticker).map((q) => q.symbol)).toEqual([ticker.key]);
  });

  it('returns everything behind a folded or undissolved tile', () => {
    const quotes = indexOfSize(503);
    const tiles = layoutMap(quotes, { width: WIDTH, height: HEIGHT });

    const drawn = tilesAtScale(tiles, 1);
    const reachable = new Set(drawn.flatMap((t) => quotesIn(t)).map((q) => q.symbol));

    // Whatever the map is showing, a tap on it can reach every name.
    expect(reachable.size).toBe(quotes.length);
  });
});

describe('scaleToReveal', () => {
  it('is 1 for a name already drawn at rest', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });
    expect(scaleToReveal(tiles, 'AAPL')).toBe(1);
  });

  it('reports a zoom that actually draws the name', () => {
    const tiles = layoutMap(indexOfSize(503), { width: WIDTH, height: HEIGHT });
    const target = 'S40';

    const at = scaleToReveal(tiles, target);
    expect(at).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(at)).toBe(true);

    const reachable = tilesAtScale(tiles, at).flatMap((t) => quotesIn(t));
    expect(reachable.some((q) => q.symbol === target)).toBe(true);
  });

  it('falls back to 1 for a symbol that is not in the map', async () => {
    const tiles = layoutMap(await realisticQuotes(), {
      width: WIDTH,
      height: HEIGHT,
    });
    expect(scaleToReveal(tiles, 'NOPE')).toBe(1);
  });
});
