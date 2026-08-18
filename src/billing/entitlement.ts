import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { setAppUserIdResolver } from '../data/provider';

/**
 * RevenueCat wrapper.
 *
 * `react-native-purchases` needs a native module, so it is required lazily
 * and every call degrades to "not entitled" in Expo Go, on web, and when no
 * API key is configured. That keeps the app fully runnable without a
 * billing account while leaving one real code path for production.
 *
 * The client's view of entitlement drives UI only. Anything that actually
 * costs money — real-time prices, the Pro universes — is gated server-side
 * in `server/`, because a boolean on a phone is not a paywall.
 */

export const PRO_ENTITLEMENT = 'pro';
export const MONTHLY_PRODUCT = 'finviz_map_pro_monthly';

export interface EntitlementState {
  loading: boolean;
  isPro: boolean;
  appUserId?: string;
  /** Set when billing is unavailable rather than merely unpurchased. */
  unavailableReason?: string;
}

export interface Offering {
  identifier: string;
  priceString: string;
  title: string;
  period: 'monthly' | 'annual' | 'lifetime' | 'unknown';
}

type PurchasesModule = typeof import('react-native-purchases').default;

let purchases: PurchasesModule | undefined;
let configured = false;
let configureError: string | undefined;

function apiKey(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    revenueCatIosKey?: string;
    revenueCatAndroidKey?: string;
  };
  return Platform.OS === 'ios' ? extra.revenueCatIosKey : extra.revenueCatAndroidKey;
}

async function ensureConfigured(): Promise<PurchasesModule | undefined> {
  if (configured) return purchases;
  configured = true;

  const key = apiKey();
  if (!key) {
    configureError = 'Billing is not configured in this build.';
    return undefined;
  }
  if (Platform.OS === 'web') {
    configureError = 'Subscriptions are managed in the mobile app.';
    return undefined;
  }

  try {
    const module = await import('react-native-purchases');
    purchases = module.default;
    await purchases.configure({ apiKey: key });
    return purchases;
  } catch (error) {
    // Expo Go has no native purchases module; this is expected there.
    configureError = 'Billing is unavailable in this build.';
    purchases = undefined;
    return undefined;
  }
}

const listeners = new Set<(state: EntitlementState) => void>();
let current: EntitlementState = { loading: true, isPro: false };

function publish(next: EntitlementState) {
  current = next;
  for (const listener of listeners) listener(next);
}

// The proxy needs the app user id on every request; wire it once.
setAppUserIdResolver(() => current.appUserId);

async function refresh(): Promise<void> {
  const module = await ensureConfigured();
  if (!module) {
    publish({ loading: false, isPro: false, unavailableReason: configureError });
    return;
  }

  try {
    const info = await module.getCustomerInfo();
    publish({
      loading: false,
      isPro: Boolean(info.entitlements.active[PRO_ENTITLEMENT]),
      appUserId: await module.getAppUserID(),
    });
  } catch {
    publish({ loading: false, isPro: false, unavailableReason: 'Could not reach the store.' });
  }
}

let started = false;

function start() {
  if (started) return;
  started = true;
  void refresh();

  void ensureConfigured().then((module) => {
    // Keeps entitlement live across renewals, restores and family sharing.
    module?.addCustomerInfoUpdateListener((info) => {
      publish({
        ...current,
        loading: false,
        isPro: Boolean(info.entitlements.active[PRO_ENTITLEMENT]),
      });
    });
  });
}

export function useEntitlement(): EntitlementState {
  const [state, setState] = useState(current);

  useEffect(() => {
    start();
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}

export async function listOfferings(): Promise<Offering[]> {
  const module = await ensureConfigured();
  if (!module) return [];

  try {
    const offerings = await module.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    return packages.map((pkg) => ({
      identifier: pkg.identifier,
      priceString: pkg.product.priceString,
      title: pkg.product.title,
      period:
        pkg.packageType === 'MONTHLY'
          ? 'monthly'
          : pkg.packageType === 'ANNUAL'
            ? 'annual'
            : pkg.packageType === 'LIFETIME'
              ? 'lifetime'
              : 'unknown',
    }));
  } catch {
    return [];
  }
}

export type PurchaseResult =
  | { status: 'purchased' }
  | { status: 'cancelled' }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string };

export async function purchasePackage(
  identifier: string
): Promise<PurchaseResult> {
  const module = await ensureConfigured();
  if (!module) {
    return { status: 'unavailable', message: configureError ?? 'Billing unavailable.' };
  }

  try {
    const offerings = await module.getOfferings();
    const pkg = offerings.current?.availablePackages.find(
      (p) => p.identifier === identifier
    );
    if (!pkg) return { status: 'error', message: 'That plan is no longer available.' };

    const { customerInfo } = await module.purchasePackage(pkg);
    const isPro = Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT]);
    publish({ ...current, loading: false, isPro });
    return { status: isPro ? 'purchased' : 'error' };
  } catch (error) {
    const err = error as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled) return { status: 'cancelled' };
    return { status: 'error', message: err?.message ?? 'Purchase failed.' };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  const module = await ensureConfigured();
  if (!module) {
    return { status: 'unavailable', message: configureError ?? 'Billing unavailable.' };
  }

  try {
    const info = await module.restorePurchases();
    const isPro = Boolean(info.entitlements.active[PRO_ENTITLEMENT]);
    publish({ ...current, loading: false, isPro });
    return isPro
      ? { status: 'purchased' }
      : { status: 'error', message: 'No previous purchase found on this account.' };
  } catch (error) {
    return { status: 'error', message: (error as Error)?.message ?? 'Restore failed.' };
  }
}
