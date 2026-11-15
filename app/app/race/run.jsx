import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { format } from '@rowrace/shared';
import { Button, GlassPanel, Text } from '../../src/components/ui';
import { RaceScene } from '../../src/scene/RaceScene';
import { CAMERA_MODES } from '../../src/scene/cameraRig';
import { useRaceSession } from '../../src/race/useRaceSession';
import { bundledModule, CLASSIC_ID, defaultCharacterId } from '../../src/characters/catalog';
import { downloadedUri } from '../../src/characters/characterCache';
import { logger } from '../../src/services';
import { useSettings } from '../../src/state/settings';
import { useT } from '../../src/i18n';
import { colors, space } from '../../src/theme/tokens';

const DEFAULT_BOATS = [
  { id: 'p120', name: '2:00', pace: 120 },
  { id: 'p125', name: '2:05', pace: 125 },
  { id: 'p130', name: '2:10', pace: 130 },
];
const CAM_KEYS = { chase: 'race.camChase', side: 'race.camSide', overhead: 'race.camOverhead' };

/**
 * Race screen. Phase 5: the 3D scene with a minimal overlay (countdown, time, distance, rank,
 * FPS) to check rendering on the tablet. Phase 6 replaces the overlay with the full HUD.
 * Params: map=alpine|desert|night, mode=distance|time|free, target=<m or s>
 */
export default function RaceRun() {
  useKeepAwake();
  const { t } = useT();
  const params = useLocalSearchParams();
  const devMode = useSettings((s) => s.devMode);
  const config = useMemo(() => {
    const mode = ['distance', 'time', 'free'].includes(params.mode) ? params.mode : 'distance';
    const target =
      mode === 'free' ? undefined : Number(params.target) || (mode === 'time' ? 300 : 500);
    return { mode, target, paceBoats: DEFAULT_BOATS };
    // Read once: a race keeps its configuration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mapId = typeof params.map === 'string' ? params.map : 'alpine';
  const {
    engine,
    snapshot: s,
    getFrame,
    sceneRace,
    cameraMode,
    setCameraMode,
  } = useRaceSession(config);
  const [stats, setStats] = useState(null);
  const characterId = useSettings((st) => st.characterId) ?? defaultCharacterId();
  const characterSource = useMemo(
    () =>
      characterId === CLASSIC_ID
        ? null
        : (bundledModule(characterId) ?? downloadedUri(characterId)),
    [characterId],
  );

  const nextCamera = () =>
    setCameraMode(CAMERA_MODES[(CAMERA_MODES.indexOf(cameraMode) + 1) % CAMERA_MODES.length]);
  const exit = () => {
    engine.end('exit');
    router.replace('/home');
  };
  const counting = s && (s.state === 'countdown' || s.state === 'resuming');

  return (
    <View style={styles.root}>
      <RaceScene
        mapId={mapId}
        race={sceneRace}
        getFrame={getFrame}
        onStats={setStats}
        characterSource={characterSource}
        onCharacterError={(e) => logger.error(e, { where: 'character.load', characterId })}
      />

      <View style={styles.top} pointerEvents="box-none">
        <GlassPanel strong style={styles.panel}>
          <Text variant="statSm">{format.formatTime(s?.raceTime ?? 0)}</Text>
          <Text variant="statSm">{Math.floor(s?.distance ?? 0)} m</Text>
          {s?.rank ? (
            <Text variant="statSm">{t('race.rank', { rank: s.rank, total: s.total })}</Text>
          ) : null}
          {s?.state === 'paused' && (
            <Text variant="heading" color={colors.warning}>
              {t('race.reconnecting')}
            </Text>
          )}
          {s?.state === 'finished' && (
            <Text variant="heading" color={colors.success}>
              {t('race.finished')}
            </Text>
          )}
        </GlassPanel>
        {(devMode || __DEV__) && stats && (
          <GlassPanel strong style={styles.stats}>
            <Text variant="mono">
              {stats.fps} fps · {stats.drawCalls} draws · {Math.round(stats.triangles / 1000)}k tris
            </Text>
          </GlassPanel>
        )}
      </View>

      {counting && (
        <View style={styles.center} pointerEvents="none">
          <Text variant="statXl" color={colors.text} style={styles.count}>
            {s.countdown > 0 ? s.countdown : t('race.go')}
          </Text>
        </View>
      )}

      <View style={styles.bottom} pointerEvents="box-none">
        <Text variant="bodySecondary" style={styles.note}>
          {t('race.previewNote')}
        </Text>
        <View style={styles.buttons}>
          <Button
            label={`${t('race.camera')}: ${t(CAM_KEYS[cameraMode])}`}
            variant="secondary"
            onPress={nextCamera}
          />
          <Button label={t('race.exit')} variant="danger" onLongPress={exit} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: {
    position: 'absolute',
    top: space.lg,
    left: space.xl,
    right: space.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  panel: { flexDirection: 'row', gap: space.xl, alignItems: 'center' },
  stats: { paddingVertical: space.xs },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 140, lineHeight: 150, textShadowColor: '#000A', textShadowRadius: 12 },
  bottom: {
    position: 'absolute',
    bottom: space.lg,
    left: space.xl,
    right: space.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  note: { maxWidth: 420 },
  buttons: { flexDirection: 'row', gap: space.md },
});
