import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  restorePurchases,
  useEntitlement,
} from '../../src/billing/entitlement';
import { clearCache } from '../../src/data/cache';
import { usePreferences } from '../../src/state/store';
import { legendSwatches } from '../../src/treemap/color';
import { theme } from '../../src/theme';

const SUPPORT_URL = 'https://example.com/support';
const PRIVACY_URL = 'https://example.com/privacy';
const TERMS_URL = 'https://example.com/terms';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isPro, unavailableReason } = useEntitlement();
  const [restoring, setRestoring] = useState(false);

  const {
    palette,
    snapColors,
    colorCap,
    haptics,
    setPalette,
    setSnapColors,
    setColorCap,
    setHaptics,
  } = usePreferences();

  const onRestore = async () => {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);

    Alert.alert(
      result.status === 'purchased' ? 'Pro restored' : 'Nothing to restore',
      result.status === 'purchased'
        ? 'Your subscription is active on this device.'
        : result.status === 'unavailable'
          ? result.message
          : 'We could not find a previous purchase on this account.'
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + theme.space(2) },
      ]}
    >
      <Text style={styles.title}>Settings</Text>

      {!isPro ? (
        <Pressable
          onPress={() => router.push('/paywall')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.proCard, pressed && { opacity: 0.85 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.proTitle}>Finviz Map Pro</Text>
            <Text style={styles.proSubtitle}>
              Real-time prices, every map, all timeframes — $2/month
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      ) : (
        <View style={styles.activeCard}>
          <Ionicons name="checkmark-circle" size={20} color={theme.success} />
          <Text style={styles.activeText}>Pro is active. Thank you.</Text>
        </View>
      )}

      <Section title="Colours">
        <Row label="Colour scale">
          <SegmentedControl
            options={[
              { value: 'redGreen', label: 'Red / Green' },
              { value: 'blueOrange', label: 'Blue / Orange' },
            ]}
            value={palette}
            onChange={(value) => setPalette(value as typeof palette)}
          />
        </Row>

        <Text style={styles.hint}>
          Blue / orange keeps every level distinguishable with red-green colour
          blindness.
        </Text>

        <View style={styles.preview}>
          {legendSwatches({ palette, cap: colorCap }).map((swatch, index) => (
            <View
              key={index}
              style={[styles.previewSwatch, { backgroundColor: swatch.color }]}
            />
          ))}
        </View>

        <Row label="Saturate at">
          <SegmentedControl
            options={[
              { value: '2', label: '2%' },
              { value: '3', label: '3%' },
              { value: '5', label: '5%' },
            ]}
            value={String(colorCap)}
            onChange={(value) => setColorCap(Number(value))}
          />
        </Row>
        <Text style={styles.hint}>
          Lower values make quiet days easier to read; higher values keep
          volatile sessions from going fully saturated.
        </Text>

        <ToggleRow
          label="Use Finviz's seven buckets"
          hint="Off blends between them for smoother small tiles."
          value={snapColors}
          onChange={setSnapColors}
        />
      </Section>

      <Section title="Interaction">
        <ToggleRow
          label="Haptic feedback"
          hint="A tick when you select a tile."
          value={haptics}
          onChange={setHaptics}
        />
      </Section>

      <Section title="Account">
        <LinkRow
          label={restoring ? 'Restoring…' : 'Restore purchases'}
          onPress={onRestore}
        />
        {unavailableReason ? (
          <Text style={styles.hint}>{unavailableReason}</Text>
        ) : null}
        <LinkRow
          label="Clear cached data"
          onPress={async () => {
            await clearCache();
            Alert.alert('Cache cleared', 'The next map load will be fresh.');
          }}
        />
      </Section>

      <Section title="About">
        <LinkRow label="Support" onPress={() => Linking.openURL(SUPPORT_URL)} />
        <LinkRow label="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <LinkRow label="Terms of use" onPress={() => Linking.openURL(TERMS_URL)} />
      </Section>

      <Text style={styles.disclaimer}>
        Market data is provided for information only and is not investment
        advice. This app is not affiliated with or endorsed by Finviz.
      </Text>

      <View style={{ height: insets.bottom + theme.space(8) }} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: theme.accent, false: theme.border }}
          thumbColor="#fff"
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
    </Pressable>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: theme.space(4) },
  title: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: theme.space(4),
  },
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    padding: theme.space(4),
  },
  proTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  proSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: theme.space(4),
  },
  activeText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  section: { marginTop: theme.space(6) },
  sectionTitle: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: theme.space(2),
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: theme.space(3),
  },
  rowLabel: { color: theme.text, fontSize: 14, flexShrink: 1 },
  hint: {
    color: theme.textMuted,
    fontSize: 11,
    lineHeight: 15,
    paddingBottom: theme.space(3),
  },
  preview: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: theme.space(3),
  },
  previewSwatch: { flex: 1 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: theme.bg,
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    paddingHorizontal: theme.space(3),
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: theme.surfaceRaised },
  segmentText: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: theme.text },
  disclaimer: {
    color: theme.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: theme.space(8),
  },
});
