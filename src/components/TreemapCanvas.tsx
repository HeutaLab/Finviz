import {
  Canvas,
  Group,
  Rect as SkRect,
  Text as SkText,
  matchFont,
  type SkFont,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import type { Quote } from '../data/types';
import { layoutMap, tileAt, type Tile } from '../treemap/buildTree';
import { performanceColor, labelColor, type Palette } from '../treemap/color';
import { intersects, type Rect } from '../treemap/squarify';
import { theme } from '../theme';

/**
 * The map itself.
 *
 * The core trick that makes this usable on a phone: the treemap is laid out
 * once into a fixed "world" rectangle, and pinch/pan only change a transform.
 * Squarify never re-runs during a gesture, so panning stays at 60fps even
 * with the full US market loaded.
 *
 * Labels are culled by their *on-screen* size, not their layout size, so
 * zooming in progressively reveals tickers that were too small to draw —
 * which is exactly the affordance the desktop site lacks on mobile.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 14;

/** A tile narrower than this on screen gets no ticker label. */
const MIN_LABEL_PX = 26;
/** Above this, the label gets a second line with the percent change. */
const MIN_DETAIL_PX = 54;

export interface TreemapCanvasProps {
  quotes: Quote[];
  width: number;
  height: number;
  palette: Palette;
  colorCap: number;
  snapColors: boolean;
  haptics: boolean;
  onSelect: (quote: Quote) => void;
  /** Symbol to fly to, e.g. from search. */
  focusSymbol?: string;
}

interface DrawTile {
  key: string;
  rect: Rect;
  color: string;
  labelColor: string;
  label: string;
  detail: string;
  kind: Tile['kind'];
}

function flattenForDraw(
  tiles: Tile[],
  palette: Palette,
  colorCap: number,
  snapColors: boolean
): { tickers: DrawTile[]; groups: Tile[] } {
  const tickers: DrawTile[] = [];
  const groups: Tile[] = [];

  const walk = (nodes: Tile[]) => {
    for (const node of nodes) {
      if (node.kind === 'ticker') {
        const options = { cap: colorCap, palette, snap: snapColors };
        tickers.push({
          key: node.key,
          rect: node.rect,
          color: performanceColor(node.changePct, options),
          labelColor: labelColor(node.changePct, options),
          label: node.label,
          detail: `${node.changePct >= 0 ? '+' : ''}${node.changePct.toFixed(2)}%`,
          kind: node.kind,
        });
      } else {
        groups.push(node);
        if (node.children) walk(node.children);
      }
    }
  };

  walk(tiles);
  return { tickers, groups };
}

export function TreemapCanvas({
  quotes,
  width,
  height,
  palette,
  colorCap,
  snapColors,
  haptics,
  onSelect,
  focusSymbol,
}: TreemapCanvasProps) {
  // Layout is memoised on the inputs that actually change its geometry.
  const tiles = useMemo(
    () => layoutMap(quotes, { width, height }),
    [quotes, width, height]
  );

  const { tickers, groups } = useMemo(
    () => flattenForDraw(tiles, palette, colorCap, snapColors),
    [tiles, palette, colorCap, snapColors]
  );

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Gesture bookkeeping.
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Mirrors of the shared values for the JS-side render pass. Skia reads the
  // shared values directly for the transform; these drive label culling,
  // which only needs to update when a gesture settles.
  const [viewScale, setViewScale] = React.useState(1);
  const [viewport, setViewport] = React.useState<Rect>({ x: 0, y: 0, w: width, h: height });

  const syncView = useCallback((s: number, tx: number, ty: number) => {
    setViewScale(s);
    setViewport({ x: -tx / s, y: -ty / s, w: width / s, h: height / s });
  }, [width, height]);

  /** Keeps the map from being dragged off-screen entirely. */
  const clamp = useCallback(() => {
    'worklet';
    const s = scale.value;
    const maxX = 0;
    const minX = Math.min(0, width - width * s);
    const maxY = 0;
    const minY = Math.min(0, height - height * s);

    translateX.value = Math.min(maxX, Math.max(minX, translateX.value));
    translateY.value = Math.min(maxY, Math.max(minY, translateY.value));
  }, [width, height, scale, translateX, translateY]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          startX.value = translateX.value;
          startY.value = translateY.value;
        })
        .onUpdate((event) => {
          translateX.value = startX.value + event.translationX;
          translateY.value = startY.value + event.translationY;
          clamp();
        })
        .onEnd(() => {
          runOnJS(syncView)(scale.value, translateX.value, translateY.value);
        }),
    [clamp, syncView, scale, startX, startY, translateX, translateY]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          startScale.value = scale.value;
          startX.value = translateX.value;
          startY.value = translateY.value;
        })
        .onUpdate((event) => {
          const next = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, startScale.value * event.scale)
          );
          // Zoom about the pinch focal point rather than the origin, so the
          // thing under your fingers stays under your fingers.
          const ratio = next / startScale.value;
          translateX.value = event.focalX - (event.focalX - startX.value) * ratio;
          translateY.value = event.focalY - (event.focalY - startY.value) * ratio;
          scale.value = next;
          clamp();
        })
        .onEnd(() => {
          runOnJS(syncView)(scale.value, translateX.value, translateY.value);
        }),
    [clamp, syncView, scale, startScale, startX, startY, translateX, translateY]
  );

  const handleTap = useCallback(
    (x: number, y: number, s: number, tx: number, ty: number) => {
      // Screen → layout space.
      const worldX = (x - tx) / s;
      const worldY = (y - ty) / s;

      const hit = tileAt(tiles, worldX, worldY);
      if (!hit?.quote) return;

      if (haptics) void Haptics.selectionAsync();
      onSelect(hit.quote);
    },
    [tiles, haptics, onSelect]
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(300)
        .onEnd((event) => {
          runOnJS(handleTap)(
            event.x,
            event.y,
            scale.value,
            translateX.value,
            translateY.value
          );
        }),
    [handleTap, scale, translateX, translateY]
  );

  /** Double-tap zooms toward the tap; a second double-tap at max resets. */
  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((event) => {
          const target = scale.value > 2.5 ? 1 : 3.5;
          const ratio = target / scale.value;

          scale.value = withTiming(target, { duration: 220 });
          translateX.value = withTiming(
            target === 1 ? 0 : event.x - (event.x - translateX.value) * ratio,
            { duration: 220 }
          );
          translateY.value = withTiming(
            target === 1 ? 0 : event.y - (event.y - translateY.value) * ratio,
            { duration: 220 }
          );

          runOnJS(syncView)(target, translateX.value, translateY.value);
        }),
    [syncView, scale, translateX, translateY]
  );

  const gesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Exclusive(doubleTap, tap),
        Gesture.Simultaneous(pan, pinch)
      ),
    [doubleTap, tap, pan, pinch]
  );

  // Fly to a searched ticker.
  React.useEffect(() => {
    if (!focusSymbol) return;

    const target = tickers.find((t) => t.key === focusSymbol.toUpperCase());
    if (!target) return;

    const { rect } = target;
    // Fit the tile to about a third of the screen so context stays visible.
    const desired = Math.min(
      MAX_SCALE,
      Math.max(2, Math.min(width / (rect.w * 3), height / (rect.h * 3)))
    );
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;

    scale.value = withTiming(desired, { duration: 320 });
    translateX.value = withTiming(width / 2 - cx * desired, { duration: 320 });
    translateY.value = withTiming(height / 2 - cy * desired, { duration: 320 });

    syncView(desired, width / 2 - cx * desired, height / 2 - cy * desired);
  }, [focusSymbol, tickers, width, height, scale, translateX, translateY, syncView]);

  const transform = useDerivedValue(() => [
    { translateX: translateX.value },
    { translateY: translateY.value },
    { scale: scale.value },
  ]);

  const tileFont = useMemo(
    () => matchFont({ fontFamily: 'System', fontSize: 11, fontWeight: '700' }),
    []
  );
  const detailFont = useMemo(
    () => matchFont({ fontFamily: 'System', fontSize: 9, fontWeight: '500' }),
    []
  );
  const sectorFont = useMemo(
    () => matchFont({ fontFamily: 'System', fontSize: 10, fontWeight: '700' }),
    []
  );
  const industryFont = useMemo(
    () => matchFont({ fontFamily: 'System', fontSize: 8, fontWeight: '600' }),
    []
  );

  // Only draw what is on screen, and only label what is big enough to read.
  const visible = useMemo(
    () => tickers.filter((t) => intersects(t.rect, viewport)),
    [tickers, viewport]
  );

  const visibleGroups = useMemo(
    () => groups.filter((g) => g.header && intersects(g.rect, viewport)),
    [groups, viewport]
  );

  return (
    <View style={[styles.container, { width, height }]}>
      <GestureDetector gesture={gesture}>
        <Canvas style={{ width, height }}>
          <Group transform={transform}>
            {visible.map((tile) => (
              <SkRect
                key={tile.key}
                x={tile.rect.x}
                y={tile.rect.y}
                width={tile.rect.w}
                height={tile.rect.h}
                color={tile.color}
              />
            ))}

            {visibleGroups.map((group) => (
              <GroupHeader
                key={group.key}
                tile={group}
                font={group.kind === 'sector' ? sectorFont : industryFont}
                scale={viewScale}
              />
            ))}

            {visible.map((tile) => (
              <TileLabel
                key={`label-${tile.key}`}
                tile={tile}
                scale={viewScale}
                labelFont={tileFont}
                detailFont={detailFont}
              />
            ))}
          </Group>
        </Canvas>
      </GestureDetector>
    </View>
  );
}

/** Padding either side of a group label, in layout units. */
const HEADER_PAD = 3;

/**
 * Trims a label with an ellipsis until it measures inside `maxWidth`.
 *
 * Measured rather than estimated from a characters-per-em guess: uppercase
 * bold sector names are far wider per character than the average, and an
 * estimate that is even slightly low lets one sector's name paint across
 * its neighbours.
 */
function truncateToWidth(
  label: string,
  font: SkFont,
  maxWidth: number
): string {
  if (maxWidth <= 0) return '';
  if (font.measureText(label).width <= maxWidth) return label;

  let fits = 0;
  let rest = label.length;
  while (fits < rest) {
    const mid = Math.ceil((fits + rest) / 2);
    if (font.measureText(`${label.slice(0, mid)}…`).width <= maxWidth) {
      fits = mid;
    } else {
      rest = mid - 1;
    }
  }

  // A lone ellipsis tells the reader nothing; leave the strip blank instead.
  return fits > 0 ? `${label.slice(0, fits)}…` : '';
}

function GroupHeader({
  tile,
  font,
  scale,
}: {
  tile: Tile;
  font: SkFont | null;
  scale: number;
}) {
  const header = tile.header;
  if (!header || !font) return null;

  // Group labels scale with the map rather than counter-scaling like ticker
  // labels, so whether they fit is zoom-independent — but whether they are
  // readable is not, and below 60px on screen they are not.
  if (header.w * scale < 60) return null;

  const label = tile.kind === 'sector' ? tile.label.toUpperCase() : tile.label;
  const text = truncateToWidth(label, font, header.w - HEADER_PAD * 2);
  if (!text) return null;

  return (
    <SkText
      x={header.x + HEADER_PAD}
      y={header.y + header.h - 3}
      text={text}
      font={font}
      color={tile.kind === 'sector' ? '#c9d2e4' : '#8b93a7'}
    />
  );
}

function TileLabel({
  tile,
  scale,
  labelFont,
  detailFont,
}: {
  tile: DrawTile;
  scale: number;
  labelFont: SkFont | null;
  detailFont: SkFont | null;
}) {
  if (!labelFont) return null;

  const screenW = tile.rect.w * scale;
  const screenH = tile.rect.h * scale;
  if (screenW < MIN_LABEL_PX || screenH < 14) return null;

  const showDetail = screenW >= MIN_DETAIL_PX && screenH >= 30 && detailFont;

  const cx = tile.rect.x + tile.rect.w / 2;
  const cy = tile.rect.y + tile.rect.h / 2;

  // Text is drawn in layout space and scaled with the group, so counter the
  // zoom to keep glyphs at a constant on-screen size. Inside this group the
  // coordinates are therefore screen pixels, not layout pixels.
  const inverse = 1 / scale;

  return (
    <Group transform={[{ translateX: cx }, { translateY: cy }, { scale: inverse }]}>
      <SkText
        x={-labelFont.measureText(tile.label).width / 2}
        y={showDetail ? -1 : 4}
        text={tile.label}
        font={labelFont}
        color={tile.labelColor}
      />
      {showDetail && detailFont ? (
        <SkText
          x={(-detailFont.measureText(tile.detail).width) / 2}
          y={11}
          text={tile.detail}
          font={detailFont}
          color={tile.labelColor}
          opacity={0.85}
        />
      ) : null}
    </Group>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.bg,
    overflow: 'hidden',
  },
});
