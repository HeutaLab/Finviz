import { inset, intersects, squarify, type Rect } from '../src/treemap/squarify';

const ROOT: Rect = { x: 0, y: 0, w: 400, h: 300 };

function area(rect: Rect): number {
  return rect.w * rect.h;
}

function aspect(rect: Rect): number {
  return Math.max(rect.w / rect.h, rect.h / rect.w);
}

describe('squarify', () => {
  it('fills the container', () => {
    const items = [{ value: 6 }, { value: 6 }, { value: 4 }, { value: 3 }, { value: 2 }, { value: 1 }];
    const placed = squarify(items, ROOT);

    const total = placed.reduce((sum, p) => sum + area(p.rect), 0);
    expect(total).toBeCloseTo(area(ROOT), 4);
  });

  it('allocates area proportional to value', () => {
    const items = [{ value: 50 }, { value: 25 }, { value: 25 }];
    const placed = squarify(items, ROOT);

    const byValue = new Map(placed.map((p) => [p.item.value, area(p.rect)]));
    // The 50 should get twice the area of each 25.
    expect(byValue.get(50)! / byValue.get(25)!).toBeCloseTo(2, 4);
  });

  it('keeps tiles close to square', () => {
    // The whole reason for squarify over a naive slice-and-dice: this same
    // input produces 100:1 slivers under slice-and-dice.
    const items = Array.from({ length: 40 }, (_, i) => ({ value: 40 - i }));
    const placed = squarify(items, ROOT);

    const worst = Math.max(...placed.map((p) => aspect(p.rect)));
    expect(worst).toBeLessThan(6);
  });

  it('emits tiles largest first', () => {
    const items = [{ value: 1 }, { value: 9 }, { value: 4 }];
    const placed = squarify(items, ROOT);
    expect(placed.map((p) => p.item.value)).toEqual([9, 4, 1]);
  });

  it('produces non-overlapping rectangles', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ value: (i % 7) + 1 }));
    const placed = squarify(items, ROOT);

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = inset(placed[i].rect, 0.01);
        const b = inset(placed[j].rect, 0.01);
        expect(intersects(a, b)).toBe(false);
      }
    }
  });

  it('stays inside the container', () => {
    const placed = squarify(
      Array.from({ length: 17 }, (_, i) => ({ value: i + 1 })),
      ROOT
    );

    for (const { rect } of placed) {
      expect(rect.x).toBeGreaterThanOrEqual(-1e-6);
      expect(rect.y).toBeGreaterThanOrEqual(-1e-6);
      expect(rect.x + rect.w).toBeLessThanOrEqual(ROOT.w + 1e-6);
      expect(rect.y + rect.h).toBeLessThanOrEqual(ROOT.h + 1e-6);
    }
  });

  it('drops non-positive values instead of emitting zero-size tiles', () => {
    const placed = squarify([{ value: 10 }, { value: 0 }, { value: -5 }], ROOT);
    expect(placed).toHaveLength(1);
    expect(area(placed[0].rect)).toBeCloseTo(area(ROOT), 4);
  });

  it('returns nothing for a degenerate container', () => {
    expect(squarify([{ value: 1 }], { x: 0, y: 0, w: 0, h: 100 })).toEqual([]);
    expect(squarify([], ROOT)).toEqual([]);
  });
});

describe('inset', () => {
  it('shrinks symmetrically', () => {
    expect(inset({ x: 10, y: 10, w: 100, h: 50 }, 2)).toEqual({
      x: 12,
      y: 12,
      w: 96,
      h: 46,
    });
  });

  it('never goes negative', () => {
    const result = inset({ x: 0, y: 0, w: 1, h: 1 }, 5);
    expect(result.w).toBe(0);
    expect(result.h).toBe(0);
  });
});
