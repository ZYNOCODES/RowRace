import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/native';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepareCharacter } from './characters/prepare';
import { buildWorld, measure } from './world';

const FPS_WINDOW_SEC = 2;

/**
 * 3D race view. The world is built imperatively (scene/world.js) and driven every frame by
 * `getFrame(time, dt)`, which the race screen implements from the engine and data source.
 *
 * - App in background: the render loop stops.
 * - Back to foreground: the GL view is remounted. Android may drop the GL context while
 *   backgrounded; a fresh context is the reliable way back.
 *
 * @param {{ mapId: string, race: { mode: string, target: number|null,
 *   opponents: { id: string, color?: string }[] }, getFrame: (time: number, dt: number) =>
 *   import('./world').Frame, onStats?: (s: { fps: number, drawCalls: number, triangles: number }) => void,
 *   characterSource?: number | string | null, onCharacterError?: (e: Error) => void, style?: any }} props
 *   characterSource: bundled asset module or local file URI of a character GLB; null = built-in rower
 */
export function RaceScene({
  mapId,
  race,
  getFrame,
  onStats,
  characterSource = null,
  onCharacterError,
  style,
}) {
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [glKey, setGlKey] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const isActive = state === 'active';
      setActive((was) => {
        if (isActive && !was) setGlKey((k) => k + 1);
        return isActive;
      });
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={[styles.fill, style]} pointerEvents="none">
      {active && (
        <Canvas
          key={glKey}
          style={styles.fill}
          frameloop="always"
          camera={{ fov: 55, near: 0.1, far: 2600, position: [0, 3, 8.5] }}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
        >
          <SceneContent
            world={{ mapId, race, getFrame, onStats }}
            characterSource={characterSource}
            onCharacterError={onCharacterError}
          />
        </Canvas>
      )}
    </View>
  );
}

/**
 * Builds the world right away with the built-in rower, then again with the character once
 * its GLB has loaded. A model that fails to load never breaks the race.
 */
function SceneContent({ world, characterSource, onCharacterError }) {
  const plain = <World {...world} character={null} />;
  if (characterSource == null) return plain;
  return (
    <CharacterBoundary fallback={plain} onError={onCharacterError} resetKey={characterSource}>
      <Suspense fallback={plain}>
        <WithCharacter world={world} source={characterSource} />
      </Suspense>
    </CharacterBoundary>
  );
}

function WithCharacter({ world, source }) {
  const gltf = useLoader(GLTFLoader, source);
  const model = useMemo(() => prepareCharacter(gltf.scene), [gltf]);
  return <World {...world} character={model} />;
}

class CharacterBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function World({ mapId, race, getFrame, onStats, character }) {
  const { scene, camera } = useThree();
  const world = useRef(null);
  const fps = useRef({ frames: 0, time: 0 });

  useEffect(() => {
    world.current = buildWorld(scene, camera, {
      mapId,
      mode: race.mode,
      target: race.target,
      opponents: race.opponents,
      character,
    });
    return () => {
      world.current?.dispose();
      world.current = null;
    };
    // The world is rebuilt only when the map or the race layout changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, camera, mapId, race.mode, race.target, race.opponents.length, character]);

  useFrame((state, dt) => {
    if (!world.current) return;
    world.current.update(getFrame(state.clock.elapsedTime, dt));
    if (!onStats) return;
    const f = fps.current;
    f.frames += 1;
    f.time += dt;
    if (f.time >= FPS_WINDOW_SEC) {
      onStats({ fps: Math.round(f.frames / f.time), ...measure(world.current.root) });
      f.frames = 0;
      f.time = 0;
    }
  });

  return null;
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});
