/**
 * Assembles a full race world into a three.js scene (no React): sky, water, scenery, course,
 * the user's boat and opponent boats, lights, camera rig. `update(frame)` is called once per
 * rendered frame. Used by the native R3F component and by the web preview harness.
 */
import * as THREE from 'three';
import { getMap, BOAT_COLORS } from './maps';
import { createSky, createStars, createWater } from './skyWater';
import { createCourse } from './course';
import { createScenery } from './scenery';
import { createOpponentBoat, createUserBoat } from './boat';
import { StrokeAnimator } from './strokeAnimator';
import { CameraRig } from './cameraRig';

/**
 * @typedef {Object} Frame
 * @property {number} dt seconds since the previous frame
 * @property {number} time seconds since the scene started
 * @property {{ distance: number, speed: number, rowing: boolean, strokeState?: number,
 *   driveTime?: number, recoveryTime?: number, strokeRate?: number }} user
 * @property {{ id: string, distance: number, speed?: number }[]} opponents
 * @property {'chase'|'side'|'overhead'|'finish'} cameraMode
 */

/**
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ mapId: string, mode: 'distance'|'time'|'free', target: number|null,
 *   opponents: { id: string, color?: string }[], character?: THREE.Object3D | null }} opts
 *   character: prepared Mixamo model for the user's rower (characters/prepare.js)
 */
export function buildWorld(scene, camera, opts) {
  const map = getMap(opts.mapId);
  const root = new THREE.Group();
  root.name = `world:${map.id}`;

  scene.fog = new THREE.Fog(map.fog.color, map.fog.near, map.fog.far);
  scene.background = new THREE.Color(map.sky.horizon);
  camera.far = 2600;
  camera.near = 0.1;
  camera.updateProjectionMatrix();

  const hemi = new THREE.HemisphereLight(
    map.light.hemiSky,
    map.light.hemiGround,
    map.light.hemiIntensity,
  );
  const sun = new THREE.DirectionalLight(map.light.color, map.light.intensity);
  sun.position.set(...map.light.dir).multiplyScalar(100);
  root.add(hemi, sun);

  const sky = createSky(map);
  const water = createWater(map);
  root.add(sky, water);
  const stars = map.stars ? createStars() : null;
  if (stars) root.add(stars);

  const course = createCourse(map, {
    mode: opts.mode,
    target: opts.target,
    opponents: opts.opponents.length,
  });
  root.add(course.root);
  const scenery = createScenery(map, course.layout);
  root.add(scenery);

  const user = createUserBoat({ color: BOAT_COLORS.user, character: opts.character ?? null });
  root.add(user.root);
  const animator = new StrokeAnimator();

  const opponents = opts.opponents.map((o, i) => {
    const boat = createOpponentBoat({ color: o.color || BOAT_COLORS.opponents[i % 4] });
    boat.root.position.x = course.layout.opponentX[i];
    root.add(boat.root);
    return { id: o.id, boat, phase: (i * 0.37) % 1 };
  });

  const rig = new CameraRig(camera);
  scene.add(root);

  /** @param {Frame} f */
  function update(f) {
    const dt = Math.min(0.1, Math.max(0, f.dt));
    const userZ = -f.user.distance;
    const phase = animator.update(dt, f.user);
    const frac = animator.driveFrac;
    user.setStroke(phase, frac);
    user.root.position.set(0, Math.sin(f.time * 1.7) * 0.012, userZ);
    // Small pitch: the boat checks at the catch and runs during the drive.
    user.root.rotation.x = Math.sin(2 * Math.PI * phase) * 0.006 * Math.min(1, f.user.speed / 3);

    for (const o of opponents) {
      const state = f.opponents.find((x) => x.id === o.id);
      if (!state) continue;
      const rate = (state.speed > 0.5 ? 26 : 0) / 60; // strokes per second
      o.phase = (o.phase + rate * dt) % 1;
      o.boat.setStroke(o.phase, 0.35);
      o.boat.root.position.z = -state.distance;
    }

    course.root.userData.update(userZ);
    rig.update(dt, f.cameraMode || 'chase', {
      boatX: 0,
      boatZ: userZ,
      phase,
      speed: f.user.speed,
      finishZ: course.finishZ,
      courseRight: course.layout.right,
    });
    scenery.userData.update(camera.position);
    water.userData.update({ time: f.time, camera, boatX: 0, boatZ: userZ, speed: f.user.speed });
    sky.position.copy(camera.position);
    if (stars) stars.position.copy(camera.position);
  }

  function dispose() {
    scene.remove(root);
    scene.fog = null;
    root.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        m.map?.dispose();
        m.dispose();
      }
    });
  }

  return { root, map, layout: course.layout, finishZ: course.finishZ, update, dispose, rig };
}

/**
 * Rough render cost of a world (for budget tests and the dev FPS overlay):
 * draw calls = visible meshes/points, triangles = geometry triangles × instances.
 */
export function measure(root) {
  let drawCalls = 0;
  let triangles = 0;
  let maxTexture = 0;
  root.traverse((o) => {
    if (!o.visible || !(o.isMesh || o.isPoints)) return;
    const g = o.geometry;
    const verts = g.index ? g.index.count : g.attributes.position?.count || 0;
    if (verts === 0) return;
    drawCalls += 1;
    if (o.isMesh) triangles += (verts / 3) * (o.isInstancedMesh ? o.count : 1);
    const img = o.material?.map?.image;
    if (img) maxTexture = Math.max(maxTexture, img.width, img.height);
  });
  return { drawCalls, triangles: Math.round(triangles), maxTexture };
}
