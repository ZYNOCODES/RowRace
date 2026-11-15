import * as THREE from 'three';
import { buildWorld, measure } from './world';
import { MAP_IDS } from './maps';
import { StrokeAnimator, poseAt } from './strokeAnimator';
import { oarLine } from './boat';
import { laneLayout, markerGeometry } from './course';
import { CameraRig, cameraTarget } from './cameraRig';

const opponents = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'ghost' }];

function frame(t, distance, extra = {}) {
  return {
    dt: 1 / 60,
    time: t,
    user: { distance, speed: 4, rowing: true, strokeState: 2, strokeRate: 24, ...extra },
    opponents: opponents.map((o, i) => ({
      id: o.id,
      distance: distance + (i - 1.5) * 8,
      speed: 4,
    })),
    cameraMode: 'chase',
  };
}

describe.each(MAP_IDS)('map %s', (mapId) => {
  test('fits the mobile budget (< 100k triangles, < 60 draw calls, textures ≤ 1024 px)', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 16 / 10, 0.1, 2600);
    const world = buildWorld(scene, camera, { mapId, mode: 'distance', target: 2000, opponents });
    for (let i = 0; i < 120; i++) world.update(frame(i / 60, 1500 + i * 0.07));
    const m = measure(world.root);
    expect(m.triangles).toBeLessThan(100000);
    expect(m.drawCalls).toBeLessThan(60);
    expect(m.maxTexture).toBeLessThanOrEqual(1024);
    world.dispose();
    expect(scene.children).toHaveLength(0);
  });

  test('the world follows the boat over 5 km without errors', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const world = buildWorld(scene, camera, { mapId, mode: 'free', target: null, opponents: [] });
    for (let d = 0; d < 5000; d += 25) world.update(frame(d / 4, d));
    // 25 m per frame is far faster than any boat: the rig trails by its 3 m clamp at most.
    expect(Math.abs(camera.position.z - (-4975 + 8.5))).toBeLessThanOrEqual(3.01);
    world.dispose();
  });
});

describe('stroke animator', () => {
  test('free-running cycle period = drive + recovery', () => {
    const a = new StrokeAnimator();
    let wraps = 0;
    let prev = a.phase;
    for (let i = 0; i < 60 * 25; i++) {
      const p = a.update(1 / 60, { rowing: true, driveTime: 0.8, recoveryTime: 1.7 });
      if (p < prev) wraps++;
      prev = p;
    }
    expect(wraps).toBe(10); // 25 s / 2.5 s
  });

  test('PM5 catch while the animation is in the recovery: catches up within ~0.15 s', () => {
    const a = new StrokeAnimator();
    a.phase = 0.6;
    a.prevState = 4;
    let t = 0;
    while (a.phase >= 0.3 && t < 1) {
      a.update(1 / 60, { rowing: true, strokeState: 2, driveTime: 0.8, recoveryTime: 1.6 });
      t += 1 / 60;
    }
    expect(t).toBeLessThan(0.2);
  });

  test('PM5 finish while still pulling: jumps forward to the finish, never backwards', () => {
    const a = new StrokeAnimator();
    a.phase = 0.05;
    a.prevState = 2;
    const seen = [];
    for (let i = 0; i < 12; i++)
      seen.push(
        a.update(1 / 60, { rowing: true, strokeState: 4, driveTime: 0.8, recoveryTime: 1.6 }),
      );
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen.at(-1)).toBeGreaterThanOrEqual(a.driveFrac - 0.01);
  });

  test('stopping glides to the rest pose', () => {
    const a = new StrokeAnimator();
    a.phase = 0.7;
    for (let i = 0; i < 180; i++) a.update(1 / 60, { rowing: false });
    expect(a.phase).toBeCloseTo(a.driveFrac, 2);
  });

  test('timings from stroke rate when recovery is unknown', () => {
    const a = new StrokeAnimator();
    a.update(0.016, { rowing: true, driveTime: 0.7, strokeRate: 30 });
    expect(a.driveTime + a.recoveryTime).toBeCloseTo(2, 5);
  });
});

describe('rower and oars', () => {
  test('catch: blades toward the bow and in the water; finish: toward the stern', () => {
    const frac = 0.33;
    const atCatch = oarLine(1, poseAt(0, frac));
    const atFinish = oarLine(1, poseAt(frac - 1e-6, frac));
    expect(atCatch.tip.z).toBeLessThan(atCatch.pivot.z); // bow is −z
    expect(atFinish.tip.z).toBeGreaterThan(atFinish.pivot.z);
    expect(atCatch.tip.y).toBeLessThan(0.05);
    const midRecovery = oarLine(1, poseAt(frac + 0.3, frac));
    expect(midRecovery.tip.y).toBeGreaterThan(0.2);
    expect(poseAt(frac + 0.3, frac).feather).toBeCloseTo(1, 1);
  });

  test('handles stay inside the boat; port and starboard are mirrored', () => {
    for (let p = 0; p < 1; p += 0.05) {
      const pose = poseAt(p, 0.33);
      const r = oarLine(1, pose);
      const l = oarLine(-1, pose);
      expect(r.handle.x).toBeCloseTo(-l.handle.x, 6);
      expect(Math.abs(r.handle.x)).toBeLessThan(0.45);
    }
  });
});

describe('course', () => {
  test('user in the middle lane at x = 0, opponents alternate sides', () => {
    expect(laneLayout(0).opponentX).toEqual([]);
    expect(laneLayout(2).opponentX).toEqual([6, -6]);
    expect(laneLayout(4).opponentX).toEqual([6, -6, 12, -12]);
    expect(laneLayout(3).lines).toHaveLength(5);
  });

  test('distance boards: one geometry per number', () => {
    const g = markerGeometry('1500', '#fff', '#000');
    expect(g.attributes.position.count).toBeGreaterThan(100);
    expect(g.attributes.color).toBeDefined();
  });
});

describe('camera rig', () => {
  test('chase camera sits behind (+z) and above the boat, looking ahead', () => {
    const t = cameraTarget('chase', { boatX: 0, boatZ: -100, phase: 0, speed: 4 });
    expect(t.pos.z).toBeGreaterThan(-100);
    expect(t.pos.y).toBeGreaterThan(2);
    expect(t.look.z).toBeLessThan(-100);
  });

  test('never lags more than 3 m behind at a sprint', () => {
    const cam = new THREE.PerspectiveCamera();
    const rig = new CameraRig(cam);
    let z = 0;
    for (let i = 0; i < 600; i++) {
      z -= 8 / 20; // 8 m/s at 20 fps
      rig.update(1 / 20, 'chase', { boatX: 0, boatZ: z, phase: 0, speed: 8 });
    }
    expect(Math.abs(cam.position.z - (z + 8.5))).toBeLessThanOrEqual(3.01);
  });
});
