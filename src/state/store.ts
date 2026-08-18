import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_UNIVERSE } from '../data/universes';
import type { Timeframe, UniverseId } from '../data/types';
import type { Palette } from '../treemap/color';

interface Preferences {
  universe: UniverseId;
  timeframe: Timeframe;
  palette: Palette;
  /** Quantise colours to Finviz's seven buckets. */
  snapColors: boolean;
  /** Percent change at which the colour scale saturates. */
  colorCap: number;
  /** Haptic feedback on tile selection. */
  haptics: boolean;
  watchlist: string[];
}

interface Store extends Preferences {
  setUniverse: (universe: UniverseId) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setPalette: (palette: Palette) => void;
  setSnapColors: (snap: boolean) => void;
  setColorCap: (cap: number) => void;
  setHaptics: (enabled: boolean) => void;
  toggleWatch: (symbol: string) => void;
  isWatched: (symbol: string) => boolean;
}

export const usePreferences = create<Store>()(
  persist(
    (set, get) => ({
      universe: DEFAULT_UNIVERSE,
      timeframe: '1D',
      palette: 'redGreen',
      snapColors: false,
      colorCap: 3,
      haptics: true,
      watchlist: [],

      setUniverse: (universe) => set({ universe }),
      setTimeframe: (timeframe) => set({ timeframe }),
      setPalette: (palette) => set({ palette }),
      setSnapColors: (snapColors) => set({ snapColors }),
      setColorCap: (colorCap) => set({ colorCap }),
      setHaptics: (haptics) => set({ haptics }),

      toggleWatch: (symbol) => {
        const list = get().watchlist;
        set({
          watchlist: list.includes(symbol)
            ? list.filter((s) => s !== symbol)
            : [...list, symbol],
        });
      },

      isWatched: (symbol) => get().watchlist.includes(symbol),
    }),
    {
      name: 'finviz-map:preferences',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
