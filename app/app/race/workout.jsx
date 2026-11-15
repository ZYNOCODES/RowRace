import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { format } from '@rowrace/shared';
import { Button, Card, Chip, Icon, Screen, SegmentedControl, Text } from '../../src/components/ui';
import {
  DISTANCE_PRESETS,
  PACE_BOAT_OFFSETS,
  TIME_PRESETS,
  personalBest,
} from '../../src/race/records';
import { useRaceSetup } from '../../src/state/raceSetup';
import { useHistory } from '../../src/state/history';
import { useSettings } from '../../src/state/settings';
import { LANGUAGES, useT } from '../../src/i18n';
import { colors, radius, space, touch } from '../../src/theme/tokens';

const LANG_NAMES = { en: 'English', fr: 'Français', ar: 'العربية' };

/** Workout setup: distance / time / free, presets or custom, pace boats, PB ghost, voice. */
export default function ChooseWorkout() {
  const { t, lang } = useT();
  const s = useRaceSetup();
  const voiceLanguage = useSettings((st) => st.voiceLanguage) ?? lang;
  const entries = useHistory((h) => h.entries);
  const [custom, setCustom] = useState('');
  const target = s.mode === 'distance' ? s.distance : s.minutes * 60;
  const pb = s.mode === 'free' ? null : personalBest(entries, s.mode, target);

  const applyCustom = () => {
    const n = Number(custom);
    if (!(n > 0)) return;
    if (s.mode === 'distance' && n >= 50 && n <= 42195) s.set({ distance: Math.round(n) });
    if (s.mode === 'time' && n >= 1 && n <= 180) s.set({ minutes: Math.round(n) });
    setCustom('');
  };
  const presets = s.mode === 'distance' ? DISTANCE_PRESETS : TIME_PRESETS;
  const selectedPreset = s.mode === 'distance' ? s.distance : s.minutes;

  return (
    <Screen>
      <View style={styles.header}>
        <Button label={t('common.back')} variant="ghost" size="md" onPress={() => router.back()} />
        <Text variant="title" style={styles.flex}>
          {t('nav.chooseWorkout')}
        </Text>
        <Button
          label={t('common.continue')}
          icon={<Icon name="chevronRight" color={colors.onFill} />}
          onPress={() => router.push('/race/ready')}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <SegmentedControl
          value={s.mode}
          onChange={(mode) => s.set({ mode })}
          options={[
            { value: 'distance', label: t('workout.distance') },
            { value: 'time', label: t('workout.time') },
            { value: 'free', label: t('workout.free') },
          ]}
        />
        {s.mode !== 'free' ? (
          <Card style={styles.card}>
            <Text variant="label">
              {s.mode === 'distance' ? t('workout.distance') : t('workout.time')}
            </Text>
            <View style={styles.wrap}>
              {presets.map((p) => (
                <Chip
                  key={p}
                  label={
                    s.mode === 'distance' ? (p >= 1000 ? `${p / 1000} km` : `${p} m`) : `${p} min`
                  }
                  selected={p === selectedPreset}
                  onPress={() => s.set(s.mode === 'distance' ? { distance: p } : { minutes: p })}
                />
              ))}
              <TextInput
                value={custom}
                onChangeText={setCustom}
                onSubmitEditing={applyCustom}
                onBlur={applyCustom}
                keyboardType="number-pad"
                placeholder={
                  s.mode === 'distance' ? t('workout.customMeters') : t('workout.customMinutes')
                }
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
              />
            </View>
            {!presets.includes(selectedPreset) && (
              <Text variant="body">
                {t('workout.custom', {
                  value: s.mode === 'distance' ? `${s.distance} m` : `${s.minutes} min`,
                })}
              </Text>
            )}
          </Card>
        ) : (
          <Card>
            <Text variant="body" color={colors.textSecondary}>
              {t('workout.freeHint')}
            </Text>
          </Card>
        )}

        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <Text variant="heading">{t('workout.paceBoats')}</Text>
            <Chip
              label={s.paceBoatsOn ? t('common.on') : t('common.off')}
              selected={s.paceBoatsOn}
              onPress={() => s.set({ paceBoatsOn: !s.paceBoatsOn })}
            />
          </View>
          {s.paceBoatsOn && (
            <View style={styles.wrap}>
              <Text variant="label">{t('workout.targetPace')}</Text>
              <Button
                label="−1 s"
                variant="secondary"
                size="md"
                onPress={() => s.set({ targetPace: Math.max(80, s.targetPace - 1) })}
              />
              <Text variant="stat">{format.formatPace(s.targetPace)}</Text>
              <Button
                label="+1 s"
                variant="secondary"
                size="md"
                onPress={() => s.set({ targetPace: Math.min(240, s.targetPace + 1) })}
              />
              <Text variant="bodySecondary">
                {t('workout.boats', {
                  list: PACE_BOAT_OFFSETS.map((o) => format.formatPace(s.targetPace + o)).join(
                    ' · ',
                  ),
                })}
              </Text>
            </View>
          )}
          {s.mode !== 'free' && (
            <View style={styles.rowBetween}>
              <Text variant="body">
                {pb
                  ? t('workout.ghostPb', {
                      time:
                        s.mode === 'distance'
                          ? format.formatTime(pb.time, { tenths: true })
                          : `${Math.round(pb.distance)} m`,
                    })
                  : t('workout.noPb')}
              </Text>
              {pb && (
                <Chip
                  label={s.ghostOn ? t('common.on') : t('common.off')}
                  selected={s.ghostOn}
                  onPress={() => s.set({ ghostOn: !s.ghostOn })}
                />
              )}
            </View>
          )}
        </Card>

        <Card style={styles.card}>
          <Text variant="label">{t('workout.voice')}</Text>
          <View style={styles.wrap}>
            {LANGUAGES.map((l) => (
              <Chip
                key={l}
                label={LANG_NAMES[l]}
                selected={voiceLanguage === l}
                onPress={() => useSettings.getState().set({ voiceLanguage: l, voiceOn: true })}
              />
            ))}
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.md },
  flex: { flex: 1 },
  content: { gap: space.lg, paddingBottom: space.xl, maxWidth: 1000 },
  card: { gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  input: {
    minHeight: touch.min,
    minWidth: 180,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.divider,
    color: colors.text,
    fontSize: 20,
  },
});
