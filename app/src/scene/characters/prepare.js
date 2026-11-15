/**
 * Turns a loaded character glTF into something cheap to draw on a tablet: an independent
 * skinned clone (the loader caches one scene per file) with Lambert materials using only the
 * base color map. Hair/eyelash cards keep their alpha via alpha-test (no sorting cost).
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/** @param {THREE.Object3D} gltfScene @returns {THREE.Object3D} */
export function prepareCharacter(gltfScene) {
  const model = cloneSkinned(gltfScene);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const old = Array.isArray(o.material) ? o.material[0] : o.material;
    const map = old?.map ?? null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    const alpha = old?.transparent || old?.alphaTest > 0;
    o.material = new THREE.MeshLambertMaterial({
      map,
      color: map ? '#FFFFFF' : (old?.color ?? '#CCCCCC'),
      alphaTest: alpha ? 0.5 : 0,
      side: alpha ? THREE.DoubleSide : THREE.FrontSide,
    });
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return model;
}
