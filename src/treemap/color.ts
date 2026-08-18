/**
 * Performance → colour mapping for the heatmap.
 *
 * Finviz uses seven discrete buckets. On a phone, tiles are small enough
 * that hard bucket edges read as banding, so the default here interpolates
 * continuously through the same stops. `snap` restores the classic buckets
 * for anyone who prefers them.
 *
 * The whole map encodes its one variable in red vs green, which ~8% of men
 * cannot separate. `blueOrange` is a full-fidelity alternative on the same
 * luminance ramp.
 */

export type Palette = 'redGreen' | 'blueOrange';

export interface ColorOptions {
  /** Percent change that saturates the scale. Default 3. */
  cap?: number;
  palette?: Palette;
  /** Quantise to the seven classic buckets instead of interpolating. */
  snap?: boolean;
}

interface Stop {
  t: number;
  rgb: [number, number, number];
}

function hex(value: string): [number, number, number] {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Finviz's own map colours: brightness grows with magnitude in both
// directions, neutral is a desaturated slate rather than black.
const RED_GREEN: Stop[] = [
  { t: -1, rgb: hex('#f63538') },
  { t: -2 / 3, rgb: hex('#bf4045') },
  { t: -1 / 3, rgb: hex('#8b444e') },
  { t: 0, rgb: hex('#414554') },
  { t: 1 / 3, rgb: hex('#35764e') },
  { t: 2 / 3, rgb: hex('#2f9e4f') },
  { t: 1, rgb: hex('#30cc5a') },
];

// Same luminance profile, hues swapped to a blue/orange axis that survives
// deuteranopia and protanopia.
const BLUE_ORANGE: Stop[] = [
  { t: -1, rgb: hex('#f5871f') },
  { t: -2 / 3, rgb: hex('#c06a21') },
  { t: -1 / 3, rgb: hex('#7a5330') },
  { t: 0, rgb: hex('#414554') },
  { t: 1 / 3, rgb: hex('#2f5f7a') },
  { t: 2 / 3, rgb: hex('#2e86ab') },
  { t: 1, rgb: hex('#34b6e4') },
];

function stopsFor(palette: Palette): Stop[] {
  return palette === 'blueOrange' ? BLUE_ORANGE : RED_GREEN;
}

// Interpolating in sRGB darkens midpoints; going through linear light keeps
// the ramp perceptually even.
function toLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function toSrgb(c: number): number {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, s * 255)));
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  f: number
): [number, number, number] {
  return [0, 1, 2].map((i) => {
    const lin = toLinear(a[i]) + (toLinear(b[i]) - toLinear(a[i])) * f;
    return toSrgb(lin);
  }) as [number, number, number];
}

function css([r, g, b]: [number, number, number]): string {
  const to2 = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * Maps a percent change to a hex colour.
 *
 * `changePct` is in percent (2.5 means +2.5%), not a fraction.
 */
export function performanceColor(
  changePct: number,
  options: ColorOptions = {}
): string {
  const { cap = 3, palette = 'redGreen', snap = false } = options;
  const stops = stopsFor(palette);

  if (!Number.isFinite(changePct)) return css(stops[3].rgb);

  const t = Math.max(-1, Math.min(1, changePct / cap));

  if (snap) {
    // Nearest of the seven stops.
    let best = stops[3];
    let bestDist = Infinity;
    for (const stop of stops) {
      const dist = Math.abs(stop.t - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = stop;
      }
    }
    return css(best.rgb);
  }

  for (let i = 0; i < stops.length - 1; i += 1) {
    const lo = stops[i];
    const hi = stops[i + 1];
    if (t >= lo.t && t <= hi.t) {
      const span = hi.t - lo.t;
      const f = span === 0 ? 0 : (t - lo.t) / span;
      return css(mix(lo.rgb, hi.rgb, f));
    }
  }

  return css(t < 0 ? stops[0].rgb : stops[stops.length - 1].rgb);
}

/**
 * Label colour for a tile. The mid-range slate is dark enough that white
 * always wins, but the brightest green needs near-black to stay legible.
 */
export function labelColor(changePct: number, options: ColorOptions = {}): string {
  const { cap = 3 } = options;
  const t = Math.abs(Math.max(-1, Math.min(1, changePct / cap)));
  return t > 0.85 ? '#0b0d12' : '#ffffff';
}

/** The seven stops as swatches, for the legend. */
export function legendSwatches(options: ColorOptions = {}) {
  const { cap = 3 } = options;
  return stopsFor(options.palette ?? 'redGreen').map((stop) => ({
    color: performanceColor(stop.t * cap, options),
    label:
      stop.t === 0
        ? '0%'
        : `${stop.t > 0 ? '+' : ''}${(stop.t * cap).toFixed(0)}%`,
  }));
}
