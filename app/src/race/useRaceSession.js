import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RaceEngine } from './engine';
import { bindEngine } from './bindEngine';
import { logger, sourceManager } from '../services';

/**
 * Owns a RaceEngine for the race screen: binds it to the active data source and the logger,
 * starts the countdown, and exposes `getFrame` for the 3D scene (called every rendered
 * frame) plus a low-rate `snapshot` for the HUD.
 *
 * @param {{ mode: 'distance'|'time'|'free', target?: number,
 *   paceBoats?: { id: string, name: string, pace: number }[],
 *   ghost?: { name: string, points: { t: number, d: number }[] } | null }} config
 * @param {{ hudEveryMs?: number }} [opts]
 */
export function useRaceSession(config, { hudEveryMs = 200 } = {}) {
  // Configured at creation so opponents exist on the very first render (the scene needs them).
  const engine = useMemo(() => {
    const e = new RaceEngine();
    e.configure(config);
    return e;
    // One engine per mounted race screen; config is fixed for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stroke = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [cameraMode, setCameraMode] = useState('chase');
  const cameraRef = useRef(cameraMode);
  cameraRef.current = cameraMode;

  useEffect(() => {
    const unbind = bindEngine(engine, sourceManager, { logger });
    const offStroke = sourceManager.on('stroke', (s) => (stroke.current = s));
    logger.race('configure', {
      mode: config.mode,
      target: config.target,
      boats: config.paceBoats?.length ?? 0,
    });
    engine.go();
    const hud = setInterval(() => setSnapshot(engine.snapshot()), hudEveryMs);
    return () => {
      clearInterval(hud);
      if (engine.state !== 'finished') engine.end('left-screen');
      offStroke();
      unbind();
    };
    // One session per mounted race screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  /** @type {(time: number, dt: number) => import('../scene/world').Frame} */
  const getFrame = useCallback(
    (time, dt) => {
      const now = Date.now();
      const snap = engine.snapshot(now);
      const sample = engine.latest;
      const s = stroke.current;
      return {
        dt,
        time,
        user: {
          distance: engine.getRenderDistance(now),
          speed: snap.state === 'racing' ? snap.speed : (sample?.speed ?? 0),
          rowing: sample?.rowingState === 1 && (sample?.speed ?? 0) > 0,
          strokeState: sample?.strokeState,
          strokeRate: sample?.strokeRate,
          driveTime: s?.driveTime,
          recoveryTime: s?.recoveryTime,
        },
        opponents: snap.boats
          .filter((b) => !b.isUser)
          .map((b) => ({ id: b.id, distance: b.distance, speed: b.speed })),
        cameraMode:
          snap.state === 'finished' && config.mode === 'distance' ? 'finish' : cameraRef.current,
      };
    },
    [engine, config.mode],
  );

  const sceneRace = useMemo(
    () => ({
      mode: config.mode,
      target: config.target ?? null,
      opponents: engine.opponents.map((o) => ({ id: o.id })),
    }),
    [engine, config.mode, config.target],
  );

  return { engine, snapshot, getFrame, sceneRace, cameraMode, setCameraMode };
}
