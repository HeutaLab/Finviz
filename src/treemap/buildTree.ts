import type { Quote } from '../data/types';
import { inset, squarify, type Rect } from './squarify';

/**
 * Turns a flat list of quotes into a nested sector → industry → ticker
 * treemap with every rectangle resolved in layout pixels.
 *
 * The layout is computed once at a fixed "world" size and then transformed
 * by the gesture handler, so pinching and panning never re-run squarify.
 */

export type TileKind = 'sector' | 'industry' | 'ticker' | 'aggregate';

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
  /** For aggregate tiles: the names folded into it, largest first. */
  members?: Quote[];
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
  /**
   * Tickers whose tile would fall below this many square layout pixels are
   * folded into a single "+N" tile. Zero disables folding.
   */
  minTileArea?: number;
}

/**
 * Floor for an individual ticker tile, in square layout pixels.
 *
 * Folding is permanent — a folded name can never be reached by zooming —
 * so this is deliberately conservative: 25 layout px² becomes a 44pt touch
 * target at around 9× zoom, which is inside the range. Anything smaller
 * could never be tapped at any zoom, so it loses nothing to fold it. The
 * zoom-dependent reduction is LOD's job, not this one's.
 */
export const MIN_TILE_AREA = 25;

/**
 * A group dissolves into its children once the *smallest* child would
 * cover this many square screen pixels — about 11×11pt.
 *
 * Measured on the smallest rather than the average deliberately: an average
 * is passed by one giant child sitting beside five specks, which is exactly
 * the case that made a 500-name map unreadable.
 */
export const MIN_CHILD_AREA = 120;

/**
 * A group also refuses to dissolve when its children include a sliver this
 * far from square.
 *
 * Area alone does not constrain shape: a 26×1 tile clears a 25px² floor and
 * is still a hairline nobody can read or hit. This shows up when an
 * industry is itself a thin strip, since its children inherit the strip.
 * Such a group stays a block and opens as a list instead.
 */
export const MAX_CHILD_ASPECT = 8;

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

/**
 * Splits an industry's names into the ones that earn their own tile and the
 * tail that gets folded into one.
 *
 * Areas are proportional to cap over the group total, and folding does not
 * change that total, so the kept tiles keep exactly the geometry they would
 * have had. The aggregate itself has to clear the floor too — otherwise it
 * is just another speck — so neighbours are pulled in until it does.
 */
export function foldTail(
  quotes: Quote[],
  availableArea: number,
  minArea: number
): { kept: Quote[]; folded: Quote[] } {
  const sorted = [...quotes].sort((a, b) => b.marketCap - a.marketCap);
  if (minArea <= 0 || availableArea <= 0) return { kept: sorted, folded: [] };

  const total = sorted.reduce((sum, q) => sum + Math.max(0, q.marketCap), 0);
  if (total <= 0) return { kept: sorted, folded: [] };

  const areaOf = (cap: number) => (cap / total) * availableArea;

  let cut = sorted.length;
  while (cut > 0 && areaOf(sorted[cut - 1].marketCap) < minArea) cut -= 1;

  const kept = sorted.slice(0, cut);
  const folded = sorted.slice(cut);
  if (folded.length === 0) return { kept, folded };

  let foldedCap = folded.reduce((sum, q) => sum + Math.max(0, q.marketCap), 0);
  while (kept.length > 0 && areaOf(foldedCap) < minArea) {
    const moved = kept.pop() as Quote;
    folded.unshift(moved);
    foldedCap += Math.max(0, moved.marketCap);
  }

  return { kept, folded };
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
    minTileArea = MIN_TILE_AREA,
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

        const bodyArea = split.body.w * split.body.h;
        const { kept, folded } = foldTail(
          industry.members,
          bodyArea,
          minTileArea
        );

        // Everything folded means the industry is too small to break up at
        // all. Leaving it childless lets it draw as one labelled block,
        // which reads better than a lone "+12" tile.
        const leaves: (Quote | { aggregate: Quote[] })[] =
          kept.length === 0
            ? []
            : folded.length > 0
              ? [...kept, { aggregate: folded }]
              : kept;

        const tickerTiles: Tile[] = squarify(
          leaves.map((leaf) =>
            'aggregate' in leaf
              ? {
                  leaf,
                  value: leaf.aggregate.reduce(
                    (sum, q) => sum + Math.max(0, q.marketCap),
                    0
                  ),
                }
              : { leaf, value: leaf.marketCap }
          ),
          split.body
        ).map(({ item, rect }) => {
          const leaf = item.leaf;

          if ('aggregate' in leaf) {
            return {
              kind: 'aggregate' as const,
              key: `${sector.name}/${industry.name}/+${leaf.aggregate.length}`,
              label: `+${leaf.aggregate.length}`,
              value: item.value,
              changePct: weightedChange(leaf.aggregate),
              rect: inset(rect, gap),
              members: leaf.aggregate,
            };
          }

          return {
            kind: 'ticker' as const,
            key: leaf.symbol,
            label: leaf.symbol,
            value: leaf.marketCap,
            changePct: leaf.changePct,
            rect: inset(rect, gap),
            quote: leaf,
          };
        });

        return {
          kind: 'industry' as const,
          key: `${sector.name}/${industry.name}`,
          label: industry.name,
          value: industry.value,
          changePct: weightedChange(industry.members),
          rect: industryRect,
          header: split.header,
          children: tickerTiles,
          // When nothing cleared the floor the industry draws as one block,
          // so it carries its names itself — otherwise they would vanish
          // from the tree entirely rather than merely being undrawn.
          members: tickerTiles.length === 0 ? industry.members : undefined,
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

/** Every quote the tree covers, including ones folded into aggregates. */
export function* coveredQuotes(tiles: Tile[]): Generator<Quote> {
  for (const tile of tiles) {
    if (tile.quote) {
      yield tile.quote;
    } else if (tile.members) {
      for (const quote of tile.members) yield quote;
    } else if (tile.children) {
      yield* coveredQuotes(tile.children);
    }
  }
}

/**
 * Chooses what to draw at a given zoom.
 *
 * A group dissolves into its children once the average child would be big
 * enough on screen to tell apart; below that the group draws as a single
 * block coloured by its cap-weighted change. This is what makes 500 names
 * legible at 1× — you see sectors and industries, and individual tickers
 * resolve as you zoom into them. It is adaptive per node, so a huge
 * industry like Semiconductors still shows its names at 1× while a small
 * one stays a block.
 *
 * The returned tiles are non-overlapping and cover the same area as the
 * full tree, so this list is also what hit testing runs against — you tap
 * exactly what you can see.
 */
export interface ScaleView {
  /** Tiles to paint. Non-overlapping, and together they cover the canvas. */
  drawn: Tile[];
  /** Groups that dissolved, so their header strip is worth labelling. */
  dissolved: Tile[];
}

export function viewAtScale(
  tiles: Tile[],
  scale: number,
  minChildArea = MIN_CHILD_AREA,
  maxChildAspect = MAX_CHILD_ASPECT
): ScaleView {
  const drawn: Tile[] = [];
  const dissolved: Tile[] = [];
  const zoom = Math.max(scale, 0.001);

  const walk = (nodes: Tile[]) => {
    for (const node of nodes) {
      const children = node.children;
      if (!children || children.length === 0) {
        drawn.push(node);
        continue;
      }

      if (canDissolve(children, zoom, minChildArea, maxChildAspect)) {
        dissolved.push(node);
        walk(children);
      } else {
        drawn.push(node);
      }
    }
  };

  walk(tiles);
  return { drawn, dissolved };
}

/** Convenience for tests and measurement: just the painted tiles. */
export function tilesAtScale(
  tiles: Tile[],
  scale: number,
  minChildArea = MIN_CHILD_AREA,
  maxChildAspect = MAX_CHILD_ASPECT
): Tile[] {
  return viewAtScale(tiles, scale, minChildArea, maxChildAspect).drawn;
}

/**
 * Every quote a tile stands for — itself, the names folded into it, or
 * everything beneath it. This is what a tap on a block or a "+N" opens.
 */
export function quotesIn(tile: Tile): Quote[] {
  if (tile.quote) return [tile.quote];
  if (tile.members) return [...tile.members];
  if (tile.children) return [...coveredQuotes(tile.children)];
  return [];
}

function canDissolve(
  children: Tile[],
  zoom: number,
  minChildArea: number,
  maxChildAspect: number
): boolean {
  for (const child of children) {
    const { w, h } = child.rect;
    if (w <= 0 || h <= 0) return false;
    if (w * h * zoom * zoom < minChildArea) return false;
    if (Math.max(w / h, h / w) > maxChildAspect) return false;
  }
  return true;
}

function contains(tile: Tile, x: number, y: number): boolean {
  const { rect } = tile;
  return (
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  );
}

/**
 * Hit test against what is actually drawn at this zoom.
 *
 * Takes the same tile list the renderer uses, so a tap can never resolve to
 * something the user cannot see. Falls back to the nearest tile centre
 * within `tolerance` screen pixels, which is what rescues a tap that lands
 * in a 1px gutter between two small tiles.
 */
export function tileAtPoint(
  drawn: Tile[],
  x: number,
  y: number,
  scale = 1,
  tolerance = 0
): Tile | undefined {
  for (const tile of drawn) {
    if (contains(tile, x, y)) return tile;
  }

  if (tolerance <= 0) return undefined;

  // Tolerance is expressed in screen pixels; the point is in layout space.
  // Measured to the tile's edge rather than its centre — a big tile's centre
  // can be far away while its edge is right under the thumb.
  const reach = tolerance / Math.max(scale, 0.001);
  let best: Tile | undefined;
  let bestDistance = Infinity;

  for (const tile of drawn) {
    const distance = distanceToRect(tile.rect, x, y);
    if (distance < bestDistance && distance <= reach) {
      bestDistance = distance;
      best = tile;
    }
  }

  return best;
}

/** Shortest distance from a point to a rectangle; zero when inside. */
function distanceToRect(rect: Rect, x: number, y: number): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}

/** Finds a ticker's tile by symbol, for search-to-zoom. */
export function findTicker(tiles: Tile[], symbol: string): Tile | undefined {
  const target = symbol.trim().toUpperCase();
  for (const tile of tickerTiles(tiles)) {
    if (tile.key === target) return tile;
  }
  return undefined;
}

/**
 * Zoom at which a symbol becomes its own tile.
 *
 * Search needs this: flying to a name that is currently inside an aggregate
 * or an undissolved industry would land on a block that does not show it.
 */
export function scaleToReveal(
  tiles: Tile[],
  symbol: string,
  minChildArea = MIN_CHILD_AREA
): number {
  const target = symbol.trim().toUpperCase();

  const search = (nodes: Tile[], needed: number): number | undefined => {
    for (const node of nodes) {
      if (node.kind === 'ticker' && node.key === target) return needed;

      if (node.members?.some((q) => q.symbol === target)) {
        // Inside an aggregate — it never resolves further, so surface the
        // zoom that at least brings the aggregate up to full size.
        return needed;
      }

      if (node.children?.length) {
        // Scale at which this node dissolves, mirroring tilesAtScale.
        // A node held back by a sliver never dissolves at any zoom.
        let smallest = Infinity;
        let worstAspect = 0;
        for (const child of node.children) {
          const { w, h } = child.rect;
          if (w <= 0 || h <= 0) {
            worstAspect = Infinity;
            break;
          }
          smallest = Math.min(smallest, w * h);
          worstAspect = Math.max(worstAspect, Math.max(w / h, h / w));
        }
        const dissolveAt =
          worstAspect > MAX_CHILD_ASPECT
            ? Infinity
            : Math.sqrt(minChildArea / Math.max(smallest, 0.001));
        const found = search(node.children, Math.max(needed, dissolveAt));
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };

  return search(tiles, 1) ?? 1;
}
