/**
 * Dev-only web preview of the 3D race world (same builders as the app, rendered with three's
 * WebGLRenderer instead of expo-gl). Not shipped in the app.
 *   ?map=alpine|desert|night  ?cam=chase|side|overhead|finish  ?d=<start meters>  ?target=500
 * Keys: 1/2/3 map · c camera · space pause
 */
import * as THREE from 'three';
import { buildWorld, measure } from '../../app/src/scene/world';
import { MAP_IDS } from '../../app/src/scene/maps';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepareCharacter } from '../../app/src/scene/characters/prepare';
import { renderThumb } from './thumb';

const q = new URLSearchParams(location.search);
const CAMS = ['chase', 'side', 'overhead', 'finish'];
const state = {
  mapId: q.get('map') || 'alpine',
  cam: q.get('cam') || 'chase',
  start: Number(q.get('d') || 40),
  target: Number(q.get('target') || 500),
  paused: false,
  char: q.get('char') || null,
  phase: q.get('phase') != null ? Number(q.get('phase')) : null,
};
let character = null;
const PACES = [118, 125, 131];
const GHOST_SPEED = 4.15;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2600);
let scene;
let world;

function build() {
  world?.dispose();
  const model = character ? prepareCharacter(character) : null;
  scene = new THREE.Scene();
  world = buildWorld(scene, camera, {
    mapId: state.mapId,
    mode: 'distance',
    target: state.target,
    opponents:
      q.get('opp') === '0' ? [] : [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }, { id: 'ghost' }],
    character: model,
  });
  world.rig.snapNext();
}
async function start() {
  if (q.get('thumb')) {
    document.getElementById('hud').remove();
    document.body.style.background = 'transparent';
    renderer.domElement.remove();
    await renderThumb(q.get('thumb'));
    return;
  }
  if (state.char) {
    const gltf = await new GLTFLoader().loadAsync(`./characters/${state.char}.glb`);
    character = gltf.scene;
  }
  build();
  if (q.get('debug') && character) {
    const rower = world.root.getObjectByName('mixamoRower');
    world.update({
      dt: 0.016,
      time: 0,
      user: { distance: 60, speed: 4, rowing: true },
      opponents: [],
      cameraMode: 'chase',
    });
    const box = new THREE.Box3().setFromObject(rower, true);
    const hips = rower.getObjectByName('mixamorig:Hips') || rower.getObjectByName('mixamorigHips');
    const meshes = [];
    rower.traverse(
      (o) =>
        o.isSkinnedMesh &&
        meshes.push([
          o.name,
          o.geometry.attributes.position.array.constructor.name,
          o.geometry.attributes.position.normalized,
          o.position.toArray().map((x) => +x.toFixed(3)),
          o.scale.toArray().map((x) => +x.toFixed(4)),
          o.bindMode,
        ]),
    );
    console.log(
      'DEBUG ' +
        JSON.stringify({
          found: !!rower,
          box: [box.min.toArray(), box.max.toArray()],
          hips: hips && hips.getWorldPosition(new THREE.Vector3()).toArray(),
          meshes,
        }),
    );
    const model = rower.children[0];
    setTimeout(() => {
      const b2 = new THREE.Box3().setFromObject(rower, true);
      console.log(
        'DEBUG2 ' +
          JSON.stringify({
            modelScale: model.scale.toArray(),
            modelPos: model.position.toArray(),
            box: [b2.min.toArray(), b2.max.toArray()],
          }),
      );
    }, 1500);
  }
  requestAnimationFrame(frame);
}
start();

// Simulated rower: 24 spm, drive 0.85 s, 4 m/s.
let t = 0;
let last = performance.now();
let frames = 0;
let fpsT = 0;
let fps = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!state.paused) t += dt;
  const cycle = 2.5;
  const inDrive = (state.phase != null ? state.phase * cycle : t % cycle) < 0.85;
  const distance = Math.min(state.target, state.start + 4 * t);
  world.update({
    dt: state.paused ? 0 : dt,
    time: t,
    user: {
      distance,
      speed: distance < state.target ? 4 : 0,
      rowing: distance < state.target,
      strokeState: inDrive ? 2 : 4,
      driveTime: 0.85,
      recoveryTime: cycle - 0.85,
    },
    opponents: [
      ...PACES.map((p, i) => ({
        id: `p${i}`,
        distance: Math.min(state.target, state.start + (500 / p) * t),
        speed: 4,
      })),
      {
        id: 'ghost',
        distance: Math.min(state.target, state.start - 6 + GHOST_SPEED * t),
        speed: 4,
      },
    ],
    cameraMode: state.cam,
  });
  renderer.render(scene, camera);
  frames++;
  fpsT += dt;
  if (fpsT > 0.5) {
    fps = Math.round(frames / fpsT);
    frames = 0;
    fpsT = 0;
    const m = measure(world.root);
    document.getElementById('hud').textContent =
      `map ${state.mapId} · cam ${state.cam} · ${distance.toFixed(0)} m\n` +
      `fps ${fps} · draw calls ${m.drawCalls} (renderer ${renderer.info.render.calls})\n` +
      `triangles ${m.triangles} (renderer ${renderer.info.render.triangles}) · max tex ${m.maxTexture}px`;
  }
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
addEventListener('keydown', (e) => {
  if (['1', '2', '3'].includes(e.key)) {
    state.mapId = MAP_IDS[Number(e.key) - 1];
    build();
  } else if (e.key === 'c') {
    state.cam = CAMS[(CAMS.indexOf(state.cam) + 1) % CAMS.length];
  } else if (e.key === ' ') {
    state.paused = !state.paused;
  }
});
