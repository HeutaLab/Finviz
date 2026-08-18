import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Quote, UniverseId } from '../data/types';
import { UNIVERSES, universeById } from '../data/universes';
import { theme } from '../theme';

interface Props {
  universe: UniverseId;
  isPro: boolean;
  quotes: Quote[];
  delayMinutes: number;
  stale: boolean;
  onUniverseChange: (universe: UniverseId) => void;
  onLocked: () => void;
  onSearchSelect: (symbol: string) => void;
}

/**
 * Universe picker, freshness badge and ticker search.
 *
 * Search is the other thing the desktop map cannot do on a phone: finding
 * one name in 500 tiles by eye is hopeless, so typing a symbol flies the
 * viewport to it.
 */
export function MapHeader({
  universe,
  isPro,
  quotes,
  delayMinutes,
  stale,
  onUniverseChange,
  onLocked,
  onSearchSelect,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const current = universeById(universe);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return quotes
      .filter(
        (quote) =>
          quote.symbol.includes(q) || quote.name.toUpperCase().includes(q)
      )
      .slice(0, 12);
  }, [query, quotes]);

  return (
    <View style={styles.bar}>
      <Pressable
        style={styles.universe}
        accessibilityRole="button"
        accessibilityLabel={`Map: ${current.label}. Change map.`}
        onPress={() => setPickerOpen(true)}
      >
        <Text style={styles.universeLabel}>{current.label}</Text>
        <Ionicons name="chevron-down" size={14} color={theme.textMuted} />
      </Pressable>

      <View style={styles.spacer} />

      <FreshnessBadge delayMinutes={delayMinutes} stale={stale} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search tickers"
        hitSlop={10}
        onPress={() => setSearchOpen(true)}
        style={styles.iconButton}
      >
        <Ionicons name="search" size={18} color={theme.text} />
      </Pressable>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} />
        <View style={styles.picker}>
          <Text style={styles.pickerTitle}>Choose a map</Text>
          <ScrollView>
            {UNIVERSES.map((option) => {
              const locked = option.pro && !isPro;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: option.id === universe }}
                  onPress={() => {
                    setPickerOpen(false);
                    if (locked) onLocked();
                    else onUniverseChange(option.id);
                  }}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    pressed && { backgroundColor: theme.surfaceRaised },
                  ]}
                >
                  <View style={styles.pickerText}>
                    <Text style={styles.pickerLabel}>{option.label}</Text>
                    <Text style={styles.pickerDescription}>{option.description}</Text>
                  </View>
                  {locked ? (
                    <View style={styles.proTag}>
                      <Text style={styles.proTagText}>PRO</Text>
                    </View>
                  ) : option.id === universe ? (
                    <Ionicons name="checkmark" size={18} color={theme.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={searchOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSearchOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSearchOpen(false)} />
        <View style={styles.search}>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Symbol or company"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={() => {
              const first = matches[0];
              if (!first) return;
              setSearchOpen(false);
              setQuery('');
              onSearchSelect(first.symbol);
            }}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {matches.map((quote) => (
              <Pressable
                key={quote.symbol}
                accessibilityRole="button"
                onPress={() => {
                  setSearchOpen(false);
                  setQuery('');
                  onSearchSelect(quote.symbol);
                }}
                style={({ pressed }) => [
                  styles.matchRow,
                  pressed && { backgroundColor: theme.surfaceRaised },
                ]}
              >
                <Text style={styles.matchSymbol}>{quote.symbol}</Text>
                <Text style={styles.matchName} numberOfLines={1}>
                  {quote.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function FreshnessBadge({
  delayMinutes,
  stale,
}: {
  delayMinutes: number;
  stale: boolean;
}) {
  if (stale) {
    return (
      <View style={[styles.badge, { borderColor: '#7a5330' }]}>
        <Text style={[styles.badgeText, { color: '#f5871f' }]}>OFFLINE</Text>
      </View>
    );
  }

  const live = delayMinutes === 0;
  return (
    <View
      style={[styles.badge, { borderColor: live ? '#2f6b46' : theme.border }]}
      accessibilityLabel={live ? 'Real-time data' : `Data delayed ${delayMinutes} minutes`}
    >
      {live ? <View style={styles.liveDot} /> : null}
      <Text style={[styles.badgeText, live && { color: theme.success }]}>
        {live ? 'LIVE' : `${delayMinutes}M DELAY`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
  },
  universe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: theme.space(1),
    paddingRight: theme.space(1),
  },
  universeLabel: { color: theme.text, fontSize: 17, fontWeight: '700' },
  spacer: { flex: 1 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.space(2),
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.success,
  },
  badgeText: {
    color: theme.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  picker: {
    position: 'absolute',
    left: theme.space(4),
    right: theme.space(4),
    top: '18%',
    maxHeight: '64%',
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: theme.space(3),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  pickerTitle: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: theme.space(2),
    paddingHorizontal: theme.space(2),
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(2),
    borderRadius: 8,
  },
  pickerText: { flex: 1 },
  pickerLabel: { color: theme.text, fontSize: 15, fontWeight: '600' },
  pickerDescription: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  proTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: theme.accent,
  },
  proTagText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  search: {
    position: 'absolute',
    left: theme.space(4),
    right: theme.space(4),
    top: '12%',
    maxHeight: '60%',
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: theme.space(2),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  searchInput: {
    height: 46,
    borderRadius: 8,
    paddingHorizontal: theme.space(3),
    backgroundColor: theme.surfaceRaised,
    color: theme.text,
    fontSize: 16,
    marginBottom: theme.space(2),
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(3),
    borderRadius: 8,
  },
  matchSymbol: {
    color: theme.text,
    fontWeight: '700',
    fontSize: 14,
    width: 64,
  },
  matchName: { color: theme.textMuted, fontSize: 13, flex: 1 },
});
