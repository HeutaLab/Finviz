import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { legendSwatches, type Palette } from '../treemap/color';
import { theme } from '../theme';

interface Props {
  palette: Palette;
  cap: number;
}

/** Compact colour key. Only the two ends and the midpoint are labelled. */
export function Legend({ palette, cap }: Props) {
  const swatches = legendSwatches({ palette, cap });

  return (
    <View style={styles.container} accessibilityLabel={`Colour scale, minus ${cap}% to plus ${cap}%`}>
      <Text style={styles.edge}>-{cap}%</Text>
      <View style={styles.bar}>
        {swatches.map((swatch) => (
          <View
            key={swatch.label + swatch.color}
            style={[styles.swatch, { backgroundColor: swatch.color }]}
          />
        ))}
      </View>
      <Text style={styles.edge}>+{cap}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    paddingHorizontal: theme.space(3),
  },
  bar: {
    flexDirection: 'row',
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  swatch: { flex: 1 },
  edge: {
    color: theme.textMuted,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});
