import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_HISTORY, isBetter, personalBest, toEntry } from '../race/records';

/** Saved sessions (newest first), stored locally. */
export const useHistory = create(
  persist(
    (set, get) => ({
      entries: [],
      /**
       * Saves a finished race. @returns {{ entry: object, isPB: boolean }}
       */
      add(result, meta) {
        const entry = toEntry(result, meta);
        const prevBest = personalBest(get().entries, entry.mode, entry.target);
        const isPB = isBetter(entry, prevBest);
        entry.isPB = isPB;
        set({ entries: [entry, ...get().entries].slice(0, MAX_HISTORY) });
        return { entry, isPB };
      },
      get: (id) => get().entries.find((e) => e.id === id) ?? null,
      remove: (id) => set({ entries: get().entries.filter((e) => e.id !== id) }),
    }),
    {
      name: 'rowrace.history.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);
