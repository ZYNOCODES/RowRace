import { useEffect } from 'react';
import { FlatList, Image, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Icon, PressableScale, Screen, Text } from '../../src/components/ui';
import { MAPS, MAP_IDS } from '../../src/scene/maps';
import { useRaceSetup } from '../../src/state/raceSetup';
import { useT } from '../../src/i18n';
import { colors, radius, space } from '../../src/theme/tokens';

const PREVIEWS = {
  alpine: require('../../assets/maps/alpine.jpg'),
  desert: require('../../assets/maps/desert.jpg'),
  night: require('../../assets/maps/night.jpg'),
};
const CARD_W = 520;

/** Map carousel: large preview cards with name, mood and difficulty. */
export default function ChooseMap() {
  const { t } = useT();
  const { mode } = useLocalSearchParams();
  const mapId = useRaceSetup((s) => s.mapId);
  useEffect(() => {
    if (mode === 'free') useRaceSetup.getState().set({ mode: 'free' });
    else if (mode === 'race' && useRaceSetup.getState().mode === 'free')
      useRaceSetup.getState().set({ mode: 'distance' });
  }, [mode]);

  return (
    <Screen>
      <View style={styles.header}>
        <Button label={t('common.back')} variant="ghost" size="md" onPress={() => router.back()} />
        <Text variant="title" style={styles.flex}>
          {t('nav.chooseMap')}
        </Text>
        <Button
          label={t('common.continue')}
          icon={<Icon name="chevronRight" color={colors.onFill} />}
          onPress={() => router.push('/race/workout')}
        />
      </View>
      <FlatList
        horizontal
        data={MAP_IDS}
        keyExtractor={(id) => id}
        snapToInterval={CARD_W + space.lg}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item: id }) => {
          const m = MAPS[id];
          const selected = id === mapId;
          return (
            <PressableScale
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t(m.nameKey)}, ${t(m.moodKey)}, ${t('maps.difficulty', { n: m.difficulty })}`}
              onPress={() => useRaceSetup.getState().set({ mapId: id })}
              scaleTo={0.98}
              style={[styles.card, selected && styles.selected]}
            >
              <Image source={PREVIEWS[id]} style={styles.image} resizeMode="cover" />
              <View style={styles.info}>
                <View style={styles.titleRow}>
                  <Text variant="title" style={styles.flex}>
                    {t(m.nameKey)}
                  </Text>
                  {selected && (
                    <Icon name="check" size={32} color={colors.success} strokeWidth={3} />
                  )}
                </View>
                <Text variant="bodySecondary">{t(m.moodKey)}</Text>
                <View style={styles.diff}>
                  {[1, 2, 3].map((n) => (
                    <View
                      key={n}
                      style={[styles.pip, n <= m.difficulty && { backgroundColor: colors.accent }]}
                    />
                  ))}
                  <Text variant="label">{t('maps.difficulty', { n: m.difficulty })}</Text>
                </View>
              </View>
            </PressableScale>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.md },
  flex: { flex: 1 },
  list: { gap: space.lg, paddingVertical: space.sm },
  card: {
    width: CARD_W,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
  },
  selected: { borderColor: colors.success },
  image: { width: '100%', aspectRatio: 640 / 350 },
  info: { padding: space.lg, gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  diff: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  pip: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.divider },
});
