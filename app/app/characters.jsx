import { useState } from 'react';
import { FlatList, Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Icon, PressableScale, Screen, Text } from '../src/components/ui';
import { CLASSIC_ID, defaultCharacterId, listCharacters } from '../src/characters/catalog';
import thumbs from '../src/characters/thumbs';
import { downloadCharacter, downloadedUri } from '../src/characters/characterCache';
import { useSettings } from '../src/state/settings';
import { logger } from '../src/services';
import { useT } from '../src/i18n';
import { colors, radius, space, touch } from '../src/theme/tokens';

const kb = (bytes) =>
  bytes > 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

/** Character library: bundled rowers, on-demand downloads, and the classic built-in rower. */
export default function Characters() {
  const { t } = useT();
  const selected = useSettings((s) => s.characterId) ?? defaultCharacterId();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [, refresh] = useState(0);
  const items = [
    { id: CLASSIC_ID, name: t('characters.classic'), bundled: true },
    ...listCharacters(),
  ];

  const choose = async (c) => {
    setError(null);
    const available = c.id === CLASSIC_ID || c.bundled || downloadedUri(c.id);
    if (!available) {
      if (!c.url) return;
      setBusy(c.id);
      try {
        await downloadCharacter(c);
        logger.ui('character.downloaded', { id: c.id, bytes: c.bytes });
        refresh((n) => n + 1);
      } catch (e) {
        logger.error(e, { where: 'character.download', id: c.id });
        setError(t('characters.failed'));
        return;
      } finally {
        setBusy(null);
      }
    }
    useSettings.getState().set({ characterId: c.id });
    logger.ui('character.selected', { id: c.id });
  };

  const status = (c) => {
    if (c.id === CLASSIC_ID || c.bundled) return t('characters.inApp');
    if (busy === c.id) return t('characters.downloading');
    if (downloadedUri(c.id)) return t('characters.downloaded');
    return c.url ? t('characters.download', { size: kb(c.bytes) }) : t('characters.notHosted');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Button label={t('common.back')} variant="ghost" size="md" onPress={() => router.back()} />
        <Text variant="title" style={styles.flex}>
          {t('characters.title')}
        </Text>
        <Text variant="bodySecondary">{t('characters.count', { count: items.length })}</Text>
      </View>
      {error && (
        <Text variant="body" color={colors.danger} style={styles.error}>
          {error}
        </Text>
      )}
      <FlatList
        data={items}
        numColumns={5}
        keyExtractor={(c) => c.id}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item: c }) => {
          const isSelected = c.id === selected;
          const disabled = c.id !== CLASSIC_ID && !c.bundled && !c.url && !downloadedUri(c.id);
          return (
            <PressableScale
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled, busy: busy === c.id }}
              accessibilityLabel={`${c.name}, ${status(c)}`}
              onPress={() => choose(c)}
              disabled={disabled || busy != null}
              scaleTo={0.97}
              style={[styles.card, isSelected && styles.selected, disabled && styles.disabled]}
            >
              <View style={styles.thumb}>
                {thumbs[c.id] ? (
                  <Image source={thumbs[c.id]} style={styles.image} resizeMode="contain" />
                ) : (
                  <Icon name="wave" size={56} color={colors.primary} />
                )}
              </View>
              <Text variant="heading" numberOfLines={1}>
                {c.name}
              </Text>
              <View style={styles.status}>
                {isSelected && (
                  <Icon name="check" size={18} color={colors.success} strokeWidth={3} />
                )}
                <Text variant="bodySecondary" numberOfLines={1}>
                  {isSelected ? t('characters.selected') : status(c)}
                </Text>
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
  error: { marginBottom: space.sm },
  grid: { gap: space.md, paddingBottom: space.xl },
  row: { gap: space.md },
  card: {
    flex: 1,
    maxWidth: '19%',
    minHeight: touch.min * 3,
    padding: space.sm,
    gap: space.xxs,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.glassBorder,
    alignItems: 'center',
  },
  selected: { borderColor: colors.success },
  disabled: { opacity: 0.45 },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
});
