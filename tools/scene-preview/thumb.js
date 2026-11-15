/**
 * Thumbnail mode of the preview (?thumb=<id>): one character, arms lowered from the T-pose,
 * on a transparent background. Used by tools/characters/thumbs.mjs.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { prepareCharacter } from '../../app/src/scene/characters/prepare';
import { findBones, restHeight, rotateWorld } from '../../app/src/scene/characters/mixamoRower';

export async function renderThumb(id, size = 256) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#445566', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(1, 2, 3);
  scene.add(sun);

  const gltf = await new GLTFLoader().loadAsync(`./characters/${id}.glb`);
  const model = prepareCharacter(gltf.scene);
  scene.add(model);
  model.updateMatrixWorld(true);
  const bones = findBones(model);
  const h = restHeight(bones) || 1.8;
  const q = new THREE.Quaternion();
  const z = new THREE.Vector3(0, 0, 1);
  // Arms down (facing +Z, the character's left arm is on +x).
  for (const [name, dir] of [
    ['LeftArm', -1],
    ['RightArm', 1],
  ]) {
    const b = bones[name];
    if (!b) continue;
    const sign = b.getWorldPosition(new THREE.Vector3()).x > 0 ? -1 : 1;
    rotateWorld(b, q.setFromAxisAngle(z, sign * 1.2 * Math.abs(dir)));
  }
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, h * 0.62, h * 1.9);
  camera.lookAt(0, h * 0.55, 0);
  renderer.render(scene, camera);
  renderer.render(scene, camera); // second frame: skinning matrices are up to date
  window.__thumbDone = true;
}
