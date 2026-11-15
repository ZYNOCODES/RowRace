import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Application from 'expo-application';
import {
  Button,
  Card,
  Icon,
  PressableScale,
  SegmentedControl,
  Screen,
  Text,
} from '../src/components/ui';
import { useSettings } from '../src/state/settings';
import { logger } from '../src/services';
import { LANGUAGES, useT } from '../src/i18n';
import { colors, space, touch } from '../src/theme/tokens';

const TAPS_TO_UNLOCK = 7;
const LANGUAGE_NAMES = { en: 'English', fr: 'Français', ar: 'العربية' };

/**
 * Settings. Phase 3 covers language, data source (developer options), Diagnostics and About;
 * phase 6 adds units, voice, sounds and haptics.
 */
export default function Settings() {
  const { t } = useT();
  const s = useSettings();
  const [hint, setHint] = useState(null);
  const taps = useRef(0);

  const onVersionTap = () => {
    taps.current += 1;
    const left = TAPS_TO_UNLOCK - taps.current;
    if (left <= 0) {
      taps.current = 0;
      const devMode = !s.devMode;
      s.set({ devMode });
      logger.ui('devMode', { on: devMode });
      setHint(t(devMode ? 'settings.devOn' : 'settings.devOff'));
    } else if (left <= 3) {
      setHint(t('settings.devTapsLeft', { count: left }));
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Button label={t('common.back')} variant="ghost" size="md" onPress={() => router.back()} />
        <Text variant="title">{t('nav.settings')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text variant="label">{t('settings.language')}</Text>
          <SegmentedControl
            value={s.language}
            onChange={(language) => s.set({ language })}
            options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
          />
        </Card>

        {s.devMode && (
          <Card style={styles.card}>
            <Text variant="label">{t('settings.dataSource')}</Text>
            <SegmentedControl
              value={s.dataSource}
              onChange={(dataSource) => s.set({ dataSource })}
              options={[
                { value: 'ble', label: t('diagnostics.sourceBle') },
                { value: 'mock', label: t('diagnostics.sourceMock') },
                { value: 'replay', label: t('diagnostics.sourceReplay') },
              ]}
            />
          </Card>
        )}

        <Card
          onPress={() => router.push('/diagnostics')}
          style={styles.linkRow}
          accessibilityLabel={t('nav.diagnostics')}
        >
          <Icon name="wave" color={colors.primary} />
          <Text variant="heading" style={styles.flex}>
            {t('nav.diagnostics')}
          </Text>
          <Icon name="chevronRight" color={colors.textSecondary} />
        </Card>

        <Card style={styles.card}>
          <Text variant="label">{t('settings.about')}</Text>
          <PressableScale
            onPress={onVersionTap}
            scaleTo={0.99}
            style={styles.version}
            accessibilityRole="text"
          >
            <Text variant="body">
              {t('settings.version', {
                version: Application.nativeApplicationVersion ?? '0.1.0',
                build: Application.nativeBuildVersion ?? '1',
              })}
            </Text>
          </PressableScale>
          {hint && <Text variant="bodySecondary">{hint}</Text>}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.md },
  content: { gap: space.lg, paddingBottom: space.xl, maxWidth: 900 },
  card: { gap: space.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.min },
  flex: { flex: 1 },
  version: { minHeight: touch.min, justifyContent: 'center' },
});
