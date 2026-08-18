import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEntitlement } from '../../src/billing/entitlement';
import { Legend } from '../../src/components/Legend';
import { MapHeader } from '../../src/components/MapHeader';
import { TickerSheet } from '../../src/components/TickerSheet';
import { TimeframeBar } from '../../src/components/TimeframeBar';
import { GroupSheet } from '../../src/components/GroupSheet';
import { useMarketData } from '../../src/data/MarketDataContext';
import { isMockData } from '../../src/data/provider';
import type { Quote } from '../../src/data/types';
import { quotesIn, type Tile } from '../../src/treemap/buildTree';
import { usePreferences } from '../../src/state/store';
import { theme } from '../../src/theme';

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPro } = useEntitlement();

  const {
    universe,
    timeframe,
    palette,
    colorCap,
    snapColors,
    haptics,
    setUniverse,
    setTimeframe,
  } = usePreferences();

  const { snapshot, loading, error, stale, refresh } = useMarketData();

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<Quote>();
  const [group, setGroup] = useState<{ title: string; quotes: Quote[] }>();
  const [focusSymbol, setFocusSymbol] = useState<string>();

  // A tap resolves to whatever the map is currently showing: a single name
  // opens the detail sheet, a "+N" fold or an undissolved block opens the
  // list of what is inside it.
  const onSelectTile = useCallback((tile: Tile) => {
    if (tile.quote) {
      setSelected(tile.quote);
      return;
    }

    const quotes = quotesIn(tile);
    if (quotes.length === 0) return;
    if (quotes.length === 1) {
      setSelected(quotes[0]);
      return;
    }

    setGroup({
      title: tile.kind === 'aggregate' ? 'Smaller names' : tile.label,
      quotes,
    });
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const openPaywall = useCallback(() => router.push('/paywall'), [router]);

  const onSearchSelect = useCallback((symbol: string) => {
    // Re-set through undefined so selecting the same symbol twice still flies.
    setFocusSymbol(undefined);
    requestAnimationFrame(() => setFocusSymbol(symbol));
  }, []);

  const quotes = snapshot?.quotes ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <MapHeader
        universe={universe}
        isPro={isPro}
        quotes={quotes}
        delayMinutes={snapshot?.delayMinutes ?? 15}
        stale={stale}
        onUniverseChange={setUniverse}
        onLocked={openPaywall}
        onSearchSelect={onSearchSelect}
      />

      <TimeframeBar
        value={timeframe}
        isPro={isPro}
        onChange={setTimeframe}
        onLocked={openPaywall}
      />

      <View style={styles.canvasWrap} onLayout={onLayout}>
        {loading && quotes.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.accent} />
            <Text style={styles.muted}>Loading the map…</Text>
          </View>
        ) : error && quotes.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Couldn&apos;t load the map</Text>
            <Text style={styles.muted}>{error.message}</Text>
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : size.width > 0 && size.height > 0 ? (
          <TreemapHost
            quotes={quotes}
            width={size.width}
            height={size.height}
            palette={palette}
            colorCap={colorCap}
            snapColors={snapColors}
            haptics={haptics}
            focusSymbol={focusSymbol}
            onSelect={onSelectTile}
          />
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: theme.space(2) }]}>
        <Legend palette={palette} cap={colorCap} />
        {isMockData() ? (
          <Text style={styles.mock}>
            Demo data — add a data source in app.config.ts
          </Text>
        ) : !isPro ? (
          <Pressable onPress={openPaywall} accessibilityRole="button">
            <Text style={styles.upsell}>
              Go real-time and unlock every map — $2/month
            </Text>
          </Pressable>
        ) : null}
      </View>

      <TickerSheet
        quote={selected}
        timeframe={timeframe}
        onClose={() => setSelected(undefined)}
      />

      <GroupSheet
        title={group?.title}
        quotes={group?.quotes}
        onClose={() => setGroup(undefined)}
        onPick={(quote) => {
          setGroup(undefined);
          setSelected(quote);
        }}
      />
    </View>
  );
}

/**
 * Skia is a native module, so it is loaded lazily. That keeps the app
 * booting (with a clear message) in environments where the canvas is
 * unavailable instead of white-screening.
 */
function TreemapHost(props: React.ComponentProps<typeof import('../../src/components/TreemapCanvas').TreemapCanvas>) {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
  const [failed, setFailed] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    import('../../src/components/TreemapCanvas')
      .then((module) => {
        if (!cancelled) setComponent(() => module.TreemapCanvas);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Graphics unavailable</Text>
        <Text style={styles.muted}>
          The map needs a development build. Run `npx expo run:ios` or
          `npx expo run:android`.
        </Text>
      </View>
    );
  }

  if (!Component) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return <Component {...props} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  canvasWrap: {
    flex: 1,
    marginTop: theme.space(2),
    marginHorizontal: theme.space(1),
    borderRadius: 8,
    overflow: 'hidden',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(3),
    paddingHorizontal: theme.space(8),
  },
  muted: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
  errorTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  retry: {
    paddingHorizontal: theme.space(5),
    height: 42,
    borderRadius: theme.radius,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#fff', fontWeight: '700' },
  footer: { gap: theme.space(2), paddingTop: theme.space(2) },
  upsell: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  mock: { color: theme.textMuted, fontSize: 11, textAlign: 'center' },
});
