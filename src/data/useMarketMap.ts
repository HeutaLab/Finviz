import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getProvider } from './provider';
import { readCache, readStale, writeCache } from './cache';
import {
  MarketDataError,
  type MarketSnapshot,
  type Timeframe,
  type UniverseId,
} from './types';

/**
 * Freshness tiers.
 *
 * Free accounts read a 15-minute cache, which is the delayed tier and also
 * happens to keep vendor request volume low. Pro refetches on a short TTL
 * and auto-refreshes while the map is open during market hours.
 */
const FREE_TTL_MS = 15 * 60 * 1000;
const PRO_TTL_MS = 20 * 1000;
const PRO_POLL_MS = 30 * 1000;

interface Params {
  universe: UniverseId;
  timeframe: Timeframe;
  isPro: boolean;
}

export interface MarketMapState {
  snapshot?: MarketSnapshot;
  loading: boolean;
  refreshing: boolean;
  error?: MarketDataError;
  /** True when we are showing cached data because the network failed. */
  stale: boolean;
  refresh: () => void;
}

function cacheKey(universe: UniverseId, timeframe: Timeframe): string {
  return `${universe}:${timeframe}`;
}

export function useMarketMap({ universe, timeframe, isPro }: Params): MarketMapState {
  const [snapshot, setSnapshot] = useState<MarketSnapshot>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<MarketDataError>();
  const [stale, setStale] = useState(false);

  const abortRef = useRef<AbortController>();
  const key = cacheKey(universe, timeframe);
  const ttl = isPro ? PRO_TTL_MS : FREE_TTL_MS;

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      try {
        // A fresh-enough cache short-circuits the network entirely. This is
        // what makes tab switches and timeframe toggles feel instant.
        const cached = await readCache<MarketSnapshot>(key, ttl);
        if (cached && mode === 'initial') {
          setSnapshot(cached);
          setError(undefined);
          setStale(false);
          setLoading(false);
          return;
        }

        const fresh = await getProvider().fetchSnapshot({
          universe,
          timeframe,
          realtime: isPro,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        // Free accounts are told plainly how far behind they are.
        const delayMinutes = isPro ? fresh.delayMinutes : Math.max(fresh.delayMinutes, 15);

        const resolved: MarketSnapshot = { ...fresh, delayMinutes };
        setSnapshot(resolved);
        setError(undefined);
        setStale(false);
        await writeCache(key, resolved);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;

        const marketError =
          err instanceof MarketDataError
            ? err
            : new MarketDataError((err as Error)?.message ?? 'Something went wrong');

        // Prefer a stale map over an empty error screen — a 20-minute-old
        // heatmap is still useful, a blank page never is.
        const fallback = await readStale<MarketSnapshot>(key);
        if (fallback) {
          setSnapshot(fallback.value);
          setStale(true);
        }
        setError(marketError);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [key, ttl, universe, timeframe, isPro]
  );

  useEffect(() => {
    void load('initial');
    return () => abortRef.current?.abort();
  }, [load]);

  // Pro gets a live map; polling stops when the app is backgrounded so we
  // are not burning the user's battery or our request quota off-screen.
  useEffect(() => {
    if (!isPro) return undefined;

    let timer: ReturnType<typeof setInterval> | undefined;

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(() => void load('refresh'), PRO_POLL_MS);
    };
    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    if (AppState.currentState === 'active') startPolling();

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void load('refresh');
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [isPro, load]);

  const refresh = useCallback(() => {
    void load('refresh');
  }, [load]);

  return { snapshot, loading, refreshing, error, stale, refresh };
}
