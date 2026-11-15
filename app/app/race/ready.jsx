import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { format } from '@rowrace/shared';
import { Button, Card, Icon, Pill, PressableScale, Screen, Text } from '../../src/components/ui';
import { getMap } from '../../src/scene/maps';
import { buildRaceConfig } from '../../src/race/records';
import { getCharacter, CLASSIC_ID, defaultCharacterId } from '../../src/characters/catalog';
import { useRaceSetup } from '../../src/state/raceSetup';
import { useHistory } from '../../src/state/history';
import { useSettings } from '../../src/state/settings';
import { pillFor, useConnection } from '../../src/state/connection';
import { useT } from '../../src/i18n';
import { colors, radius, space } from '../../src/theme/tokens';

const PREVIEWS = {
  alpine: require('../../assets/maps/alpine.jpg'),
  desert: require('../../assets/maps/desert.jpg'),
  night: require('../../assets/maps/night.jpg'),
};

/** Summary + big GO. The countdown starts on the race screen. */
export default function Ready() {
  const { t } = useT();
  const setup = useRaceSetup();
  const entries = useHistory((h) => h.entries);
  const characterId = useSettings((s) => s.characterId) ?? defaultCharacterId();
  const status = useConnection((c) => c.status);
  const pill = pillFor(status);
  const cfg = buildRaceConfig(setup, entries);
  const map = getMap(setup.mapId);
  const workout =
    cfg.mode === 'distance'
      ? `${cfg.target} m`
      : cfg.mode === 'time'
        ? format.formatTime(cfg.target)
        : t('workout.free');
  const opponents = [...cfg.paceBoats.map((b) => b.name), ...(cfg.ghost ? [t('hud.pb')] : [])];
  const rower =
    characterId === CLASSIC_ID
      ? t('characters.classic')
      : (getCharacter(characterId)?.name ?? t('characters.classic'));

  return (
    <Screen>
      <View style={styles.header}>
        <Button label={t('common.back')} variant="ghost" size="md" onPress={() => router.back()} />
        <Text variant="title" style={styles.flex}>
          {t('nav.ready')}
        </Text>
        <Pill tone={pill.tone} icon={pill.icon} label={t(pill.key)} />
      </View>
      <View style={styles.body}>
        <Card style={styles.summary}>
          <Image source={PREVIEWS[map.id]} style={styles.image} resizeMode="cover" />
          <Row icon="flag" label={t('ready.workout')} value={workout} />
          <Row icon="marker" label={t('ready.map')} value={t(map.nameKey)} />
          <Row
            icon="wave"
            label={t('ready.opponents')}
            value={opponents.length ? opponents.join(' · ') : t('ready.none')}
          />
          <Row
            icon="dot"
            label={t('ready.rower')}
            value={rower}
            onPress={() => router.push('/characters')}
          />
        </Card>
        <View style={styles.goCol}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t('ready.go')}
            onPress={() => router.replace('/race/run')}
            style={styles.go}
            scaleTo={0.94}
          >
            <Text variant="statXl" color={colors.onFill}>
              {t('ready.go')}
            </Text>
          </PressableScale>
          {status !== 'connected' && (
            <Text variant="body" color={colors.warning} align="center" style={styles.warn}>
              {t('ready.notConnected')}
            </Text>
          )}
        </View>
      </View>
    </Screen>
  );
}

function Row({ icon, label, value, onPress }) {
  const content = (
    <View style={styles.row}>
      <Icon name={icon} color={colors.primary} />
      <Text variant="label" style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="heading" style={styles.flex} numberOfLines={1}>
        {value}
      </Text>
      {onPress && <Icon name="chevronRight" color={colors.textSecondary} />}
    </View>
  );
  return onPress ? (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      {content}
    </PressableScale>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.md },
  flex: { flex: 1 },
  body: { flex: 1, flexDirection: 'row', gap: space.xl, alignItems: 'center' },
  summary: { flex: 1, gap: space.sm },
  image: { width: '100%', height: 160, borderRadius: radius.md, marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  rowLabel: { width: 120 },
  goCol: { width: 320, alignItems: 'center', gap: space.md },
  go: {
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  warn: { maxWidth: 300 },
});
