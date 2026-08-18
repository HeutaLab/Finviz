import React, { useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Quote } from '../data/types';
import { usePreferences } from '../state/store';
import { performanceColor } from '../treemap/color';
import { theme } from '../theme';

interface Props {
  title?: string;
  quotes?: Quote[];
  onClose: () => void;
  onPick: (quote: Quote) => void;
}

/**
 * What is inside a block you tapped.
 *
 * At phone scale the map cannot give every name its own tile, so the
 * smallest are folded into a "+N" and small industries stay whole blocks.
 * This is how those names stay reachable — nothing the map covers is ever
 * unreadable, it is just one tap deeper.
 */
export function GroupSheet({ title, quotes, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const { palette, colorCap, snapColors } = usePreferences();

  const rows = useMemo(
    () => [...(quotes ?? [])].sort((a, b) => b.marketCap - a.marketCap),
    [quotes]
  );

  if (!title || rows.length === 0) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        accessibilityLabel="Dismiss"
        onPress={onClose}
      />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space(3) }]}>
        <View style={styles.grabber} />

        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.count}>{rows.length} names</Text>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(item) => item.symbol}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const color = performanceColor(item.changePct, {
              palette,
              cap: colorCap,
              snap: snapColors,
            });
            const sign = item.changePct >= 0 ? '+' : '';

            return (
              <Pressable
                onPress={() => onPick(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.symbol}, ${item.name}, ${sign}${item.changePct.toFixed(2)} percent`}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              >
                <View style={[styles.swatch, { backgroundColor: color }]} />
                <Text style={styles.symbol}>{item.symbol}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.change, { color }]}>
                  {sign}
                  {item.changePct.toFixed(2)}%
                </Text>
              </Pressable>
            );
          }}
        />

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.closeText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Capped so the map stays partly visible behind it — the list is a
    // detour from scanning, not a destination.
    maxHeight: '72%',
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: theme.space(4),
    paddingTop: theme.space(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border,
    marginBottom: theme.space(3),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.space(2),
    marginBottom: theme.space(2),
  },
  title: { color: theme.text, fontSize: 17, fontWeight: '700', flex: 1 },
  count: { color: theme.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: theme.space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    minHeight: 48,
  },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  symbol: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
    width: 68,
  },
  name: { color: theme.textMuted, fontSize: 13, flex: 1 },
  change: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  close: {
    marginTop: theme.space(2),
    height: 48,
    borderRadius: theme.radius,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: theme.text, fontWeight: '600', fontSize: 15 },
});
