import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { pickLanguage } from '../i18n/translate';

/**
 * User settings, persisted to AsyncStorage.
 * @typedef {'ble'|'mock'|'replay'} DataSourceKind
 */
export const useSettings = create(
  persist(
    (set) => ({
      language: pickLanguage(getLocales()?.[0]?.languageTag),
      /** 'kmh' shows speed in km/h, 'pace' favors /500 m. */
      units: 'pace',
      soundsOn: true,
      voiceOn: true,
      hapticsOn: true,
      /** @type {DataSourceKind} */
      dataSource: 'ble',
      devMode: false,
      onboardingDone: false,
      /** @type {{ id: string, name: string } | null} */
      lastDevice: null,
      autoReconnect: true,
      /** Rower character id from the character library ('classic' = built-in rower). */
      characterId: null,

      set: (patch) => set(patch),
    }),
    {
      name: 'rowrace.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set: _set, ...rest }) => rest,
    },
  ),
);

/** True once AsyncStorage has been read (avoids flashing onboarding to returning users). */
export function useSettingsHydrated() {
  const [hydrated, setHydrated] = useState(() => useSettings.persist.hasHydrated());
  useEffect(() => {
    const unsub = useSettings.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useSettings.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}
