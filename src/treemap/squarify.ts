/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, 2000).
 *
 * Lays a set of weighted items into a rectangle, greedily building rows and
 * flushing a row as soon as adding one more item would make its worst
 * aspect ratio worse. Produces tiles close to square, which is what makes a
 * heatmap readable at phone size — long thin slivers are unreadable and
 * untappable.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Weighted {
  /** Relative area weight. Non-positive weights are dropped. */
  value: number;
}

export interface Placed<T> {
  item: T;
  rect: Rect;
}

interface Sized<T> {
  item: T;
  area: number;
}

/**
 * Worst (largest) aspect ratio in a candidate row.
 *
 * `side` is the length of the edge the row is laid along, `rowArea` the sum
 * of the row's areas. Both row extremes are checked because the ratio is
 * bad whether a tile is too wide or too tall.
 */
function worstRatio<T>(row: Sized<T>[], side: number, rowArea: number): number {
  if (rowArea <= 0 || side <= 0) return Infinity;

  let min = Infinity;
  let max = 0;
  for (const node of row) {
    if (node.area < min) min = node.area;
    if (node.area > max) max = node.area;
  }
  if (min <= 0) return Infinity;

  const side2 = side * side;
  const area2 = rowArea * rowArea;
  return Math.max((side2 * max) / area2, area2 / (side2 * min));
}

/**
 * Places a completed row along the short edge of `free` and returns the
 * rectangle that is still unoccupied.
 */
function placeRow<T>(
  row: Sized<T>[],
  rowArea: number,
  free: Rect,
  out: Placed<T>[]
): Rect {
  // Rows run along the shorter edge, which is what keeps tiles square.
  const vertical = free.w >= free.h;
  const side = vertical ? free.h : free.w;
  if (side <= 0) return free;

  // Thickness of the band we are about to consume.
  const thickness = Math.min(rowArea / side, vertical ? free.w : free.h);

  let offset = 0;
  for (const node of row) {
    const extent = thickness > 0 ? node.area / thickness : 0;

    if (vertical) {
      out.push({
        item: node.item,
        rect: { x: free.x, y: free.y + offset, w: thickness, h: extent },
      });
    } else {
      out.push({
        item: node.item,
        rect: { x: free.x + offset, y: free.y, w: extent, h: thickness },
      });
    }
    offset += extent;
  }

  return vertical
    ? { x: free.x + thickness, y: free.y, w: free.w - thickness, h: free.h }
    : { x: free.x, y: free.y + thickness, w: free.w, h: free.h - thickness };
}

/**
 * Lays `items` out to fill `rect`, largest first.
 *
 * Areas are proportional to `value`. Items with a non-positive value are
 * skipped rather than collapsed to zero-size tiles, so a ticker with a
 * missing market cap never eats a tap target.
 */
export function squarify<T extends Weighted>(
  items: T[],
  rect: Rect
): Placed<T>[] {
  const out: Placed<T>[] = [];
  if (rect.w <= 0 || rect.h <= 0) return out;

  const usable = items.filter((i) => i.value > 0);
  const total = usable.reduce((sum, i) => sum + i.value, 0);
  if (total <= 0) return out;

  const scale = (rect.w * rect.h) / total;
  const nodes: Sized<T>[] = usable
    .map((item) => ({ item, area: item.value * scale }))
    .sort((a, b) => b.area - a.area);

  let free = { ...rect };
  let i = 0;

  while (i < nodes.length) {
    // Degenerate leftover strip — dump the remainder and stop.
    if (free.w <= 0 || free.h <= 0) break;

    const side = Math.min(free.w, free.h);
    const row: Sized<T>[] = [nodes[i]];
    let rowArea = nodes[i].area;
    let j = i + 1;

    while (j < nodes.length) {
      const candidateArea = rowArea + nodes[j].area;
      row.push(nodes[j]);
      const withNext = worstRatio(row, side, candidateArea);
      row.pop();
      const without = worstRatio(row, side, rowArea);

      if (withNext > without) break;

      row.push(nodes[j]);
      rowArea = candidateArea;
      j += 1;
    }

    free = placeRow(row, rowArea, free, out);
    i = j;
  }

  return out;
}

/** Shrinks a rect by `pad` on every side, never below zero size. */
export function inset(rect: Rect, pad: number): Rect {
  const w = Math.max(0, rect.w - pad * 2);
  const h = Math.max(0, rect.h - pad * 2);
  return {
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    w,
    h,
  };
}

/** True when the two rects overlap at all. Used for viewport culling. */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
