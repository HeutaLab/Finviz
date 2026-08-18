import { labelColor, legendSwatches, performanceColor } from '../src/treemap/color';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('performanceColor', () => {
  it('returns the neutral slate at zero', () => {
    expect(performanceColor(0)).toBe('#414554');
  });

  it('hits the exact Finviz endpoints at the cap', () => {
    expect(performanceColor(3)).toBe('#30cc5a');
    expect(performanceColor(-3)).toBe('#f63538');
  });

  it('clamps beyond the cap rather than wrapping', () => {
    expect(performanceColor(50)).toBe(performanceColor(3));
    expect(performanceColor(-50)).toBe(performanceColor(-3));
  });

  it('respects a custom cap', () => {
    expect(performanceColor(5, { cap: 5 })).toBe(performanceColor(3, { cap: 3 }));
  });

  it('varies continuously by default and discretely when snapped', () => {
    const a = performanceColor(1.1);
    const b = performanceColor(1.2);
    expect(a).not.toBe(b);

    expect(performanceColor(1.1, { snap: true })).toBe(
      performanceColor(1.2, { snap: true })
    );
  });

  it('grows brighter as magnitude grows, in both directions', () => {
    expect(luminance(performanceColor(3))).toBeGreaterThan(
      luminance(performanceColor(1))
    );
    expect(luminance(performanceColor(-3))).toBeGreaterThan(
      luminance(performanceColor(-1))
    );
  });

  it('keeps the blue/orange palette on the same luminance profile', () => {
    // The colourblind-safe option has to encode magnitude the same way, or
    // it stops being an equivalent view of the data.
    for (const change of [-3, -2, -1, 1, 2, 3]) {
      const rg = luminance(performanceColor(change));
      const bo = luminance(performanceColor(change, { palette: 'blueOrange' }));
      expect(Math.abs(rg - bo)).toBeLessThan(0.2);
    }
  });

  it('falls back to neutral for non-finite input', () => {
    expect(performanceColor(NaN)).toBe('#414554');
    expect(performanceColor(Infinity)).toBe('#414554');
  });
});

describe('labelColor', () => {
  it('uses dark text only on the brightest tiles', () => {
    expect(labelColor(0)).toBe('#ffffff');
    expect(labelColor(1.5)).toBe('#ffffff');
    expect(labelColor(3)).toBe('#0b0d12');
    expect(labelColor(-3)).toBe('#0b0d12');
  });
});

describe('legendSwatches', () => {
  it('returns seven stops labelled across the range', () => {
    const swatches = legendSwatches({ cap: 3 });
    expect(swatches).toHaveLength(7);
    expect(swatches[0].label).toBe('-3%');
    expect(swatches[3].label).toBe('0%');
    expect(swatches[6].label).toBe('+3%');
  });
});
