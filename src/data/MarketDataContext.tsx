import React, { createContext, useContext, useMemo } from 'react';

import { useEntitlement } from '../billing/entitlement';
import { usePreferences } from '../state/store';
import { useMarketMap, type MarketMapState } from './useMarketMap';

/**
 * One snapshot, shared by every screen.
 *
 * `useMarketMap` owns a fetch, a cache read and — for Pro — a polling
 * interval. Calling it from both the map and the watchlist ran two of each:
 * doubled request volume against the data plan, two timers draining the
 * battery, and two copies of state that could disagree about what "now"
 * looks like. The hook is instantiated once here instead.
 */

const MarketDataContext = createContext<MarketMapState | undefined>(undefined);

export function MarketDataProvider({ children }: { children: React.ReactNode }) {
  const { isPro } = useEntitlement();
  const universe = usePreferences((state) => state.universe);
  const timeframe = usePreferences((state) => state.timeframe);

  const state = useMarketMap({ universe, timeframe, isPro });

  // Keyed on the fields rather than the object, which the hook rebuilds on
  // every render — memoising on `state` itself would never hit.
  const value = useMemo(
    () => state,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.snapshot,
      state.loading,
      state.refreshing,
      state.error,
      state.stale,
      state.refresh,
    ]
  );

  return (
    <MarketDataContext.Provider value={value}>
      {children}
    </MarketDataContext.Provider>
  );
}

export function useMarketData(): MarketMapState {
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketData must be used inside MarketDataProvider');
  }
  return context;
}
