import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FREE_TIMEFRAMES, TIMEFRAMES, type Timeframe } from '../data/types';
import { theme } from '../theme';

interface Props {
  value: Timeframe;
  isPro: boolean;
  onChange: (timeframe: Timeframe) => void;
  onLocked: () => void;
}

/**
 * Horizontal pill row. Locked timeframes stay visible and tappable — the
 * tap opens the paywall rather than doing nothing, which converts far
 * better than hiding them and is less annoying than a disabled control.
 */
export function TimeframeBar({ value, isPro, onChange, onLocked }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {TIMEFRAMES.map((timeframe) => {
        const locked = !isPro && !FREE_TIMEFRAMES.includes(timeframe);
        const active = timeframe === value;

        return (
          <Pressable
            key={timeframe}
            accessibilityRole="button"
            accessibilityLabel={
              locked ? `${timeframe} timeframe, Pro only` : `${timeframe} timeframe`
            }
            accessibilityState={{ selected: active }}
            onPress={() => (locked ? onLocked() : onChange(timeframe))}
            style={({ pressed }) => [
              styles.pill,
              active && styles.pillActive,
              pressed && styles.pillPressed,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {timeframe}
            </Text>
            {locked ? (
              <Ionicons
                name="lock-closed"
                size={10}
                color={theme.textMuted}
                style={styles.lock}
              />
            ) : null}
          </Pressable>
        );
      })}
      <View style={styles.tail} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: theme.space(3),
    gap: theme.space(2),
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.space(3),
    // 34pt tall keeps the row compact while staying inside a comfortable
    // thumb target once the 8pt row padding is counted.
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  pillActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  pillPressed: { opacity: 0.7 },
  label: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  labelActive: { color: '#fff' },
  lock: { marginTop: 1 },
  tail: { width: theme.space(2) },
});
