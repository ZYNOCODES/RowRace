import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Last race setup (map, workout, opponents), remembered between sessions. */
export const useRaceSetup = create(
  persist(
    (set) => ({
      mapId: 'alpine',
      /** @type {'distance'|'time'|'free'} */
      mode: 'distance',
      distance: 500, // m
      minutes: 5,
      targetPace: 125, // s/500 m
      paceBoatsOn: true,
      ghostOn: true,
      set: (patch) => set(patch),
    }),
    {
      name: 'rowrace.raceSetup.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set: _set, ...rest }) => rest,
    },
  ),
);
