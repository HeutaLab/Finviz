import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMarketData } from '../../src/data/MarketDataContext';
import { usePreferences } from '../../src/state/store';
import { performanceColor } from '../../src/treemap/color';
import { theme } from '../../src/theme';

export default function WatchlistScreen() {
  const insets = useSafeAreaInsets();
  const { universe, timeframe, watchlist, palette, colorCap, snapColors, toggleWatch } =
    usePreferences();

  const { snapshot } = useMarketData();

  const rows = useMemo(() => {
    const bySymbol = new Map(snapshot?.quotes.map((q) => [q.symbol, q]) ?? []);
    return watchlist
      .map((symbol) => bySymbol.get(symbol))
      .filter((quote): quote is NonNullable<typeof quote> => Boolean(quote))
      .sort((a, b) => b.changePct - a.changePct);
  }, [watchlist, snapshot]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + theme.space(2) }]}>
      <Text style={styles.title}>Watchlist</Text>

      {watchlist.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="star-outline" size={40} color={theme.border} />
          <Text style={styles.emptyText}>
            Tap a tile on the map, then the star, to follow it here.
          </Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            None of your saved symbols are in the {universe.toUpperCase()} map.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.symbol}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const color = performanceColor(item.changePct, {
              palette,
              cap: colorCap,
              snap: snapColors,
            });
            const sign = item.changePct >= 0 ? '+' : '';

            return (
              <View style={styles.row}>
                <View style={[styles.chip, { backgroundColor: color }]}>
                  <Text style={styles.chipText}>{item.symbol}</Text>
                </View>

                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.sector} numberOfLines={1}>
                    {item.industry}
                  </Text>
                </View>

                <View style={styles.rowRight}>
                  <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                  <Text style={[styles.change, { color }]}>
                    {sign}
                    {item.changePct.toFixed(2)}%
                  </Text>
                </View>

                <Pressable
                  onPress={() => toggleWatch(item.symbol)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.symbol} from watchlist`}
                >
                  <Ionicons name="close" size={18} color={theme.textMuted} />
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  title: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
    paddingHorizontal: theme.space(4),
    paddingBottom: theme.space(3),
  },
  list: { paddingHorizontal: theme.space(3), gap: theme.space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: theme.space(3),
  },
  chip: {
    minWidth: 60,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space(2),
  },
  chipText: { color: '#0b0d12', fontWeight: '800', fontSize: 12 },
  rowText: { flex: 1 },
  name: { color: theme.text, fontSize: 14, fontWeight: '600' },
  sector: { color: theme.textMuted, fontSize: 11, marginTop: 1 },
  rowRight: { alignItems: 'flex-end' },
  price: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  change: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(4),
    paddingHorizontal: theme.space(10),
  },
  emptyText: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
});
