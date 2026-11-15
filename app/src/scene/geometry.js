/** Small three.js helpers shared by the scene builders. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();

/**
 * Places a unit-height, Y-aligned mesh (e.g. CylinderGeometry(r, r, 1)) between points a and b.
 * @param {THREE.Object3D} mesh @param {THREE.Vector3} a @param {THREE.Vector3} b
 */
export function placeSegment(mesh, a, b) {
  tmpDir.subVectors(b, a);
  const len = tmpDir.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, tmpDir.divideScalar(len));
  mesh.scale.set(1, len, 1);
}

/** Paints every vertex of a geometry with one color (for merged, vertex-colored meshes). */
export function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Non-indexed merge of painted geometries (all must have position, normal, color). */
export function mergePainted(parts) {
  const prepared = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    return ng;
  });
  return mergeGeometries(prepared, false);
}

/** Deterministic PRNG so procedural scenery is the same on every run. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Soft round shadow texture (64×64), shared by every blob shadow. */
let blobTexture = null;
export function getBlobTexture() {
  if (blobTexture) return blobTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.round(255 * Math.pow(1 - r, 1.6));
      data.set([0, 0, 0, a], (y * size + x) * 4);
    }
  }
  blobTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  blobTexture.needsUpdate = true;
  return blobTexture;
}

/** Flat blob shadow lying on the water (fake shadow, no shadow maps). */
export function createBlobShadow(width, length, opacity = 0.35) {
  const geo = new THREE.PlaneGeometry(width, length);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: getBlobTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}

/** Checkered texture (finish line banners and flags), NearestFilter, tiny. */
export function checkerTexture(cols = 8, rows = 2, px = 8) {
  const w = cols * px;
  const h = rows * px;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = (Math.floor(x / px) + Math.floor(y / px)) % 2 === 0;
      const v = on ? 20 : 245;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
