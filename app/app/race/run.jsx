import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { format } from '@rowrace/shared';
import { Button, GlassPanel, Icon, Text } from '../../src/components/ui';
import { CourseBar } from '../../src/components/hud/CourseBar';
import { StatsPanel } from '../../src/components/hud/StatsPanel';
import { PaceGauge } from '../../src/components/hud/PaceGauge';
import { StrokePanel } from '../../src/components/hud/StrokePanel';
import { MiniMap } from '../../src/components/hud/MiniMap';
import { GapPanel } from '../../src/components/hud/GapPanel';
import { HoldButton } from '../../src/components/hud/HoldButton';
import { CountdownOverlay, PausedOverlay } from '../../src/components/hud/Overlays';
import { RaceScene } from '../../src/scene/RaceScene';
import { CAMERA_MODES } from '../../src/scene/cameraRig';
import { BOAT_COLORS } from '../../src/scene/maps';
import { useRaceSession } from '../../src/race/useRaceSession';
import { buildRaceConfig } from '../../src/race/records';
import { announcer } from '../../src/race/announcer';
import { bundledModule, CLASSIC_ID, defaultCharacterId } from '../../src/characters/catalog';
import { downloadedUri } from '../../src/characters/characterCache';
import { useRaceSetup } from '../../src/state/raceSetup';
import { useHistory } from '../../src/state/history';
import { useSettings } from '../../src/state/settings';
import { logger } from '../../src/services';
import { useT } from '../../src/i18n';
import { colors, space } from '../../src/theme/tokens';

const CAM_ICON_KEYS = {
  chase: 'race.camChase',
  side: 'race.camSide',
  overhead: 'race.camOverhead',
};
const FINISH_CAMERA_MS = 3500;

/** The race: 3D scene + HUD. Saves the result and goes to Results when it ends. */
export default function RaceRun() {
  useKeepAwake();
  const { t } = useT();
  const setup = useMemo(() => ({ ...useRaceSetup.getState() }), []);
  const config = useMemo(() => buildRaceConfig(setup, useHistory.getState().entries), [setup]);
  const units = useSettings((s) => s.units);
  const devMode = useSettings((s) => s.devMode);
  const characterId = useSettings((s) => s.characterId) ?? defaultCharacterId();
  const characterSource = useMemo(
    () =>
      characterId === CLASSIC_ID
        ? null
        : (bundledModule(characterId) ?? downloadedUri(characterId)),
    [characterId],
  );
  const [stats, setStats] = useState(null);
  const [finished, setFinished] = useState(false);

  const onEngine = useCallback(
    (engine) => {
      const offs = [
        engine.on('countdown', announcer.countdown),
        engine.on('resumeCountdown', announcer.resumeCountdown),
        engine.on('split', announcer.split),
        engine.on('state', ({ state }) => state === 'paused' && announcer.paused()),
        engine.on('finish', (result) => {
          setFinished(true);
          announcer.finish(result);
          const { entry, isPB } = useHistory
            .getState()
            .add(result, { mapId: setup.mapId, characterId });
          logger.race('saved', { id: entry.id, isPB });
          const wait =
            result.mode === 'distance' && result.reason === 'finished' ? FINISH_CAMERA_MS : 600;
          setTimeout(
            () =>
              router.replace({
                pathname: '/race/results',
                params: { id: entry.id, pb: isPB ? '1' : '0', live: '1' },
              }),
            wait,
          );
        }),
      ];
      return () => offs.forEach((off) => off());
    },
    [setup.mapId, characterId],
  );

  const {
    engine,
    snapshot: s,
    getFrame,
    sceneRace,
    cameraMode,
    setCameraMode,
  } = useRaceSession(config, { onEngine });

  const colorOf = useMemo(() => {
    const map = { you: colors.primary };
    engine.opponents.forEach(
      (o, i) => (map[o.id] = BOAT_COLORS.opponents[i % BOAT_COLORS.opponents.length]),
    );
    return map;
  }, [engine]);

  const sample = s?.sample;
  const racing = s && ['racing', 'paused', 'resuming'].includes(s.state);
  const courseLength =
    config.mode === 'distance'
      ? config.target
      : s?.boats?.length
        ? Math.max(50, ...s.boats.map((b) => b.distance)) * 1.1
        : 0;
  const targetPace = config.paceBoats.length ? setup.targetPace : null;
  const exit = () => {
    if (s?.state === 'countdown' || s?.state === 'ready') {
      engine.end();
      router.replace('/home');
    } else engine.end(config.mode === 'free' ? 'exit' : 'ended');
  };
  const nextCamera = () =>
    setCameraMode(CAMERA_MODES[(CAMERA_MODES.indexOf(cameraMode) + 1) % CAMERA_MODES.length]);

  return (
    <View style={styles.root}>
      <RaceScene
        mapId={setup.mapId}
        race={sceneRace}
        getFrame={getFrame}
        onStats={devMode ? setStats : undefined}
        characterSource={characterSource}
        onCharacterError={(e) => logger.error(e, { where: 'character.load', characterId })}
      />

      {!finished && (
        <>
          <View style={styles.top} pointerEvents="box-none">
            {config.mode !== 'free' && (
              <CourseBar
                length={courseLength}
                boats={(s?.boats ?? []).map((b) => ({
                  ...b,
                  color: colorOf[b.id] ?? colors.textSecondary,
                }))}
              />
            )}
            <View style={styles.topRow} pointerEvents="box-none">
              <HoldButton
                label={config.mode === 'free' ? t('race.exitFree') : t('race.exit')}
                onConfirm={exit}
              />
              <StatsPanel
                time={s?.raceTime ?? 0}
                remaining={s?.remaining}
                mode={config.mode}
                distance={s?.distance ?? 0}
                speedKmh={(s?.speed ?? 0) * 3.6}
                calories={engine.stats?.calories ?? 0}
              />
              <Button
                label={t(CAM_ICON_KEYS[cameraMode])}
                variant="secondary"
                icon={<Icon name="camera" />}
                onPress={nextCamera}
                accessibilityHint={t('race.camera')}
              />
            </View>
          </View>

          {racing && (
            <View style={styles.bottom} pointerEvents="box-none">
              <StrokePanel
                spm={sample?.strokeRate ?? 0}
                heartRate={sample?.heartRate}
                targetPace={targetPace}
              />
              <PaceGauge
                pace={sample?.pace ?? null}
                speedKmh={sample?.speedKmh ?? 0}
                watts={sample?.watts ?? 0}
                targetPace={targetPace}
                units={units}
              />
              <View style={styles.right}>
                <GapPanel ahead={s?.ahead} behind={s?.behind} />
                <MiniMap
                  distance={s?.distance ?? 0}
                  length={config.mode === 'distance' ? config.target : null}
                  rank={s?.rank}
                  total={s?.total}
                />
              </View>
            </View>
          )}

          {s && (s.state === 'countdown' || s.state === 'resuming') && (
            <CountdownOverlay value={s.countdown} />
          )}
          {s?.state === 'paused' && (
            <PausedOverlay
              pausedForMs={s.pausedForMs}
              offerEnd={s.offerEnd}
              onEnd={() => engine.end('abandoned')}
              onKeepWaiting={() => engine.keepWaiting()}
            />
          )}
        </>
      )}

      {finished && s?.result && (
        <View style={styles.finishBanner} pointerEvents="none">
          <GlassPanel strong style={styles.finishPanel}>
            <Icon name="flag" size={40} color={colors.success} />
            <Text variant="title">{t('race.finished')}</Text>
            <Text variant="stat">{format.formatTime(s.result.time, { tenths: true })}</Text>
          </GlassPanel>
        </View>
      )}

      {devMode && stats && (
        <View style={styles.stats} pointerEvents="none">
          <Text variant="mono">
            {stats.fps} fps · {stats.drawCalls} draws · {Math.round(stats.triangles / 1000)}k tris
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { position: 'absolute', top: space.md, left: space.xl, right: space.xl, gap: space.sm },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  bottom: {
    position: 'absolute',
    bottom: space.md,
    left: space.xl,
    right: space.xl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  right: { alignItems: 'flex-end', gap: space.sm },
  finishBanner: { position: 'absolute', top: space.xxl, left: 0, right: 0, alignItems: 'center' },
  finishPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.xl,
  },
  stats: { position: 'absolute', bottom: 4, left: 0, right: 0, alignItems: 'center' },
});
