import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  listOfferings,
  purchasePackage,
  restorePurchases,
  type Offering,
} from '../src/billing/entitlement';
import { theme } from '../src/theme';

const BENEFITS = [
  {
    icon: 'flash' as const,
    title: 'Real-time prices',
    body: 'The free map runs 15 minutes behind. Pro updates live while the market is open.',
  },
  {
    icon: 'grid' as const,
    title: 'Every map',
    body: 'Nasdaq 100, Dow 30, the full US market, ETFs, crypto and world equities.',
  },
  {
    icon: 'time' as const,
    title: 'All timeframes',
    body: 'Week, month, quarter, half, year to date and one year — not just today.',
  },
  {
    icon: 'star' as const,
    title: 'Unlimited watchlists',
    body: 'Follow as many names as you like, sorted by performance.',
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listOfferings().then((result) => {
      if (cancelled) return;
      setOfferings(result);
      setSelected(result.find((o) => o.period === 'monthly')?.identifier ?? result[0]?.identifier);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubscribe = async () => {
    if (!selected) {
      Alert.alert(
        'Store unavailable',
        'Subscriptions need a build from the App Store or Play Store.'
      );
      return;
    }

    setBusy(true);
    const result = await purchasePackage(selected);
    setBusy(false);

    if (result.status === 'purchased') {
      router.back();
    } else if (result.status === 'error' || result.status === 'unavailable') {
      Alert.alert('Purchase failed', result.message);
    }
    // A cancelled purchase needs no alert; the user just decided not to.
  };

  const onRestore = async () => {
    setBusy(true);
    const result = await restorePurchases();
    setBusy(false);
    if (result.status === 'purchased') router.back();
    else if (result.status !== 'cancelled') {
      Alert.alert('Nothing to restore', result.message);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + theme.space(2) }]}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={12}
        style={styles.close}
      >
        <Ionicons name="close" size={22} color={theme.textMuted} />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Finviz Map Pro</Text>
        <Text style={styles.subtitle}>
          Two dollars a month. No ads, no upsells, no data sold.
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <View key={benefit.title} style={styles.benefit}>
              <View style={styles.benefitIcon}>
                <Ionicons name={benefit.icon} size={16} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitBody}>{benefit.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: theme.space(6) }} />
        ) : offerings.length === 0 ? (
          <View style={styles.unavailable}>
            <Text style={styles.unavailableText}>
              The store is not reachable in this build. Subscriptions work in
              the App Store and Play Store releases.
            </Text>
          </View>
        ) : (
          <View style={styles.plans}>
            {offerings.map((offering) => {
              const active = offering.identifier === selected;
              return (
                <Pressable
                  key={offering.identifier}
                  onPress={() => setSelected(offering.identifier)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.plan, active && styles.planActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planTitle}>
                      {offering.period === 'annual'
                        ? 'Yearly'
                        : offering.period === 'lifetime'
                          ? 'Lifetime'
                          : 'Monthly'}
                    </Text>
                    <Text style={styles.planPrice}>{offering.priceString}</Text>
                  </View>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? theme.accent : theme.border}
                  />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space(4) }]}>
        <Pressable
          onPress={onSubscribe}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.cta,
            (pressed || busy) && { opacity: 0.75 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>Subscribe</Text>
          )}
        </Pressable>

        <Pressable onPress={onRestore} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.restore}>Restore purchases</Text>
        </Pressable>

        <Text style={styles.legal}>
          Billed through your app store account and renews until cancelled.
          Cancel any time in your account settings.{' '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://example.com/terms')}
          >
            Terms
          </Text>
          {' · '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://example.com/privacy')}
          >
            Privacy
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  close: { alignSelf: 'flex-end', padding: theme.space(4) },
  content: { paddingHorizontal: theme.space(6), paddingBottom: theme.space(6) },
  title: { color: theme.text, fontSize: 30, fontWeight: '800' },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    marginTop: theme.space(2),
    lineHeight: 20,
  },
  benefits: { marginTop: theme.space(7), gap: theme.space(5) },
  benefit: { flexDirection: 'row', gap: theme.space(3) },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  benefitBody: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  plans: { marginTop: theme.space(7), gap: theme.space(2) },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    padding: theme.space(4),
    borderRadius: theme.radius,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  planActive: { borderColor: theme.accent },
  planTitle: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
  planPrice: { color: theme.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  unavailable: {
    marginTop: theme.space(7),
    padding: theme.space(4),
    borderRadius: theme.radius,
    backgroundColor: theme.surface,
  },
  unavailableText: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  footer: {
    paddingHorizontal: theme.space(6),
    gap: theme.space(3),
    alignItems: 'center',
  },
  cta: {
    width: '100%',
    height: 52,
    borderRadius: theme.radius,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  restore: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
  legal: {
    color: theme.textMuted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  link: { color: theme.accent, textDecorationLine: 'underline' },
});
