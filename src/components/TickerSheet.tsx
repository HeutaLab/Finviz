import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Quote, Timeframe } from '../data/types';
import {
  destinationById,
  openTicker,
  shareTicker,
} from '../links/openTicker';
import { usePreferences } from '../state/store';
import { performanceColor } from '../treemap/color';
import { theme } from '../theme';

interface Props {
  quote?: Quote;
  timeframe: Timeframe;
  onClose: () => void;
}

function formatCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

function formatVolume(value?: number): string {
  if (!value) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return `${value}`;
}

/**
 * Detail sheet for a tapped tile.
 *
 * Deliberately a sheet and not a screen: the whole point of the map is
 * scanning, and pushing a route breaks that flow. Dismiss returns you to
 * the exact zoom and pan you were at.
 */
export function TickerSheet({ quote, timeframe, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const {
    palette,
    colorCap,
    snapColors,
    watchlist,
    toggleWatch,
    tickerDestination,
  } = usePreferences();

  const onOpenExternal = useCallback(async () => {
    if (!quote) return;
    const result = await openTicker(
      quote.symbol,
      tickerDestination,
      quote.exchange
    );
    if (result.status === 'failed') {
      Alert.alert('Could not open', result.reason);
    }
  }, [quote, tickerDestination]);

  const onShare = useCallback(async () => {
    if (!quote) return;
    try {
      await shareTicker(quote.symbol, quote.name, quote.changePct);
    } catch {
      // A dismissed share sheet rejects on some platforms; nothing to report.
    }
  }, [quote]);

  if (!quote) return null;

  const destination = destinationById(tickerDestination);

  const watched = watchlist.includes(quote.symbol);
  const color = performanceColor(quote.changePct, {
    palette,
    cap: colorCap,
    snap: snapColors,
  });
  const sign = quote.changePct >= 0 ? '+' : '';

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

      <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.space(4) }]}>
        <View style={styles.grabber} />

        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeText}>{quote.symbol}</Text>
          </View>

          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>
              {quote.name}
            </Text>
            <Text style={styles.sector} numberOfLines={1}>
              {quote.sector} · {quote.industry}
            </Text>
          </View>

          <Pressable
            onPress={() => toggleWatch(quote.symbol)}
            accessibilityRole="button"
            accessibilityLabel={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            hitSlop={12}
          >
            <Ionicons
              name={watched ? 'star' : 'star-outline'}
              size={22}
              color={watched ? '#f5c542' : theme.textMuted}
            />
          </Pressable>
        </View>

        <View style={styles.stats}>
          <Stat label="Price" value={`$${quote.price.toFixed(2)}`} />
          <Stat
            label={`Change ${timeframe}`}
            value={`${sign}${quote.changePct.toFixed(2)}%`}
            color={color}
          />
          <Stat label="Market cap" value={formatCap(quote.marketCap)} />
          <Stat label="Volume" value={formatVolume(quote.volume)} />
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={onOpenExternal}
            accessibilityRole="link"
            accessibilityLabel={`Open ${quote.symbol} in ${destination.label}`}
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="open-outline" size={16} color="#fff" />
            <Text style={styles.primaryText}>Open in {destination.label}</Text>
          </Pressable>

          <Pressable
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel={`Share ${quote.symbol}`}
            style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="share-outline" size={18} color={theme.text} />
          </Pressable>
        </View>

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

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
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
    marginBottom: theme.space(4),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
  },
  badge: {
    paddingHorizontal: theme.space(2),
    height: 34,
    minWidth: 62,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#0b0d12',
    fontWeight: '800',
    fontSize: 14,
  },
  headerText: { flex: 1 },
  name: { color: theme.text, fontSize: 16, fontWeight: '700' },
  sector: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.space(5),
  },
  stat: { width: '50%', paddingVertical: theme.space(2) },
  statLabel: { color: theme.textMuted, fontSize: 11 },
  statValue: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: theme.space(2),
    marginTop: theme.space(5),
  },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    height: 48,
    borderRadius: theme.radius,
    backgroundColor: theme.accent,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: {
    width: 48,
    height: 48,
    borderRadius: theme.radius,
    backgroundColor: theme.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
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
