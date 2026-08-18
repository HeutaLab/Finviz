import type { Quote } from '../data/types';
import { inset, squarify, type Rect } from './squarify';

/**
 * Turns a flat list of quotes into a nested sector → industry → ticker
 * treemap with every rectangle resolved in layout pixels.
 *
 * The layout is computed once at a fixed "world" size and then transformed
 * by the gesture handler, so pinching and panning never re-run squarify.
 */

export type TileKind = 'sector' | 'industry' | 'ticker';

export interface Tile {
  kind: TileKind;
  /** Stable across re-layouts; used as the React key and selection id. */
  key: string;
  label: string;
  /** Market cap, or the sum of children's. Drives tile area. */
  value: number;
  /** Cap-weighted percent change. */
  changePct: number;
  rect: Rect;
  /** Strip along the top of a group reserved for its label, if it fits. */
  header?: Rect;
  children?: Tile[];
  quote?: Quote;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Gap between sibling tiles, in layout pixels. */
  gap?: number;
  /** Height of a sector's label strip. */
  sectorHeaderHeight?: number;
  /** Height of an industry's label strip. */
  industryHeaderHeight?: number;
}

function weightedChange(quotes: Quote[]): number {
  let capSum = 0;
  let weighted = 0;
  for (const q of quotes) {
    if (!Number.isFinite(q.changePct) || q.marketCap <= 0) continue;
    capSum += q.marketCap;
    weighted += q.changePct * q.marketCap;
  }
  return capSum > 0 ? weighted / capSum : 0;
}

function totalCap(quotes: Quote[]): number {
  return quotes.reduce((sum, q) => sum + Math.max(0, q.marketCap), 0);
}

function groupBy(quotes: Quote[], key: (q: Quote) => string) {
  const map = new Map<string, Quote[]>();
  for (const q of quotes) {
    const k = key(q) || 'Other';
    const bucket = map.get(k);
    if (bucket) bucket.push(q);
    else map.set(k, [q]);
  }
  return map;
}

/**
 * Carves a label strip off the top of `rect` when there is room to spare.
 * Below the threshold the group goes unlabelled rather than stealing space
 * the tiles need — at phone width a squeezed sector is worse than an
 * unnamed one, and the sector name is still one tap away.
 */
function splitHeader(
  rect: Rect,
  headerHeight: number
): { header?: Rect; body: Rect } {
  const roomy = rect.h > headerHeight * 3 && rect.w > 44;
  if (!roomy) return { body: rect };

  return {
    header: { x: rect.x, y: rect.y, w: rect.w, h: headerHeight },
    body: {
      x: rect.x,
      y: rect.y + headerHeight,
      w: rect.w,
      h: rect.h - headerHeight,
    },
  };
}

export function layoutMap(quotes: Quote[], options: LayoutOptions): Tile[] {
  const {
    width,
    height,
    gap = 1,
    sectorHeaderHeight = 15,
    industryHeaderHeight = 10,
  } = options;

  if (width <= 0 || height <= 0) return [];

  const usable = quotes.filter((q) => q.marketCap > 0);
  if (usable.length === 0) return [];

  const sectors = [...groupBy(usable, (q) => q.sector)].map(
    ([name, members]) => ({
      name,
      members,
      value: totalCap(members),
    })
  );

  const root: Rect = { x: 0, y: 0, w: width, h: height };

  return squarify(sectors, root).map(({ item: sector, rect: rawRect }) => {
    const sectorRect = inset(rawRect, gap);
    const { header, body } = splitHeader(sectorRect, sectorHeaderHeight);

    const industries = [...groupBy(sector.members, (q) => q.industry)].map(
      ([name, members]) => ({ name, members, value: totalCap(members) })
    );

    const industryTiles: Tile[] = squarify(industries, body).map(
      ({ item: industry, rect: rawIndustryRect }) => {
        const industryRect = inset(rawIndustryRect, gap);
        const split = splitHeader(industryRect, industryHeaderHeight);

        const tickerTiles: Tile[] = squarify(
          industry.members.map((q) => ({ ...q, value: q.marketCap })),
          split.body
        ).map(({ item, rect }) => ({
          kind: 'ticker' as const,
          key: item.symbol,
          label: item.symbol,
          value: item.marketCap,
          changePct: item.changePct,
          rect: inset(rect, gap),
          quote: item,
        }));

        return {
          kind: 'industry' as const,
          key: `${sector.name}/${industry.name}`,
          label: industry.name,
          value: industry.value,
          changePct: weightedChange(industry.members),
          rect: industryRect,
          header: split.header,
          children: tickerTiles,
        };
      }
    );

    return {
      kind: 'sector' as const,
      key: sector.name,
      label: sector.name,
      value: sector.value,
      changePct: weightedChange(sector.members),
      rect: sectorRect,
      header,
      children: industryTiles,
    };
  });
}

/** Depth-first walk yielding every ticker tile in the tree. */
export function* tickerTiles(tiles: Tile[]): Generator<Tile> {
  for (const tile of tiles) {
    if (tile.kind === 'ticker') yield tile;
    else if (tile.children) yield* tickerTiles(tile.children);
  }
}

/**
 * Hit test in layout space. Returns the deepest tile under the point, so a
 * tap on a ticker returns the ticker rather than its sector.
 */
export function tileAt(tiles: Tile[], x: number, y: number): Tile | undefined {
  for (const tile of tiles) {
    const { rect } = tile;
    const inside =
      x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    if (!inside) continue;

    if (tile.children) {
      const deeper = tileAt(tile.children, x, y);
      if (deeper) return deeper;
    }
    return tile;
  }
  return undefined;
}

/** Finds a ticker's tile by symbol, for search-to-zoom. */
export function findTicker(tiles: Tile[], symbol: string): Tile | undefined {
  const target = symbol.trim().toUpperCase();
  for (const tile of tickerTiles(tiles)) {
    if (tile.key === target) return tile;
  }
  return undefined;
}
