/**
 * Procedural scenery per map. Everything follows the camera so the course feels endless:
 * - backdrop: a jagged ring around the camera (mountains, dunes) or a ring of towers (skyline)
 * - shores: two strips beside the course
 * - trees / neon posts: instanced on a "treadmill" that recycles them around the camera
 * Draw calls: shore 1, backdrop 1–3, trees 1, neon 1.
 */
import * as THREE from 'three';
import { mergePainted, paint, rng } from './geometry';

const TREADMILL_SPAN = 700;
const TREADMILL_AHEAD = 600;

/** Ring strip with heights h(angle): base row, mid row (layer color), top row (cap color). */
function ridgeRing({
  radius,
  segments,
  height,
  color,
  cap,
  capFrom = 0.72,
  snowLine = 0.8,
  seed,
  peaky = true,
}) {
  const rand = rng(seed);
  const phases = [rand(), rand(), rand(), rand(), rand()].map((p) => p * Math.PI * 2);
  const h = (a) => {
    let n =
      0.45 * Math.sin(a * 3 + phases[0]) +
      0.3 * Math.sin(a * 7 + phases[1]) +
      0.12 * Math.sin(a * 29 + phases[3]);
    // Sharp peaks for mountains, rolling crests for dunes.
    n += peaky
      ? 0.55 * Math.pow(Math.abs(Math.sin(a * 11 + phases[2])), 6)
      : 0.15 * Math.sin(a * 13 + phases[4]);
    return Math.max(0.08, 0.5 + 0.45 * n) * height;
  };
  const c = new THREE.Color(color);
  const snow = new THREE.Color(cap || color);
  // Only the highest summits get snow.
  const topColor = (a) => (cap && h(a) > snowLine * height ? snow : c);
  const pos = [];
  const col = [];
  const push = (x, y, z, k) => (pos.push(x, y, z), col.push(k.r, k.g, k.b));
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p = (a, y) => [Math.cos(a) * radius, y, Math.sin(a) * radius];
    const rows = [
      [p(a0, -10), p(a1, -10), c, c],
      [p(a0, h(a0) * capFrom), p(a1, h(a1) * capFrom), c, c],
      [p(a0, h(a0)), p(a1, h(a1)), topColor(a0), topColor(a1)],
    ];
    for (let r = 0; r < 2; r++) {
      const [b0, b1, cb0, cb1] = rows[r];
      const [t0, t1, ct0, ct1] = rows[r + 1];
      (push(...b0, cb0), push(...t0, ct0), push(...b1, cb1));
      (push(...b1, cb1), push(...t0, ct0), push(...t1, ct1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

function windowsTexture(lit) {
  const w = 16;
  const h = 32;
  const data = new Uint8Array(w * h * 4);
  const rand = rng(9);
  const on = new THREE.Color(lit);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isWindow = x % 2 === 1 && y % 2 === 1 && rand() > 0.45;
      const k = isWindow ? [on.r * 255, on.g * 255, on.b * 255] : [18, 26, 43];
      data.set([...k, 255], (y * w + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function backdrop(map) {
  const group = new THREE.Group();
  group.name = 'backdrop';
  // Ridges carry their own aerial-perspective colors; scene fog would wash them out.
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  if (map.backdrop === 'mountains' || map.backdrop === 'dunes') {
    const dunes = map.backdrop === 'dunes';
    map.backdropColors.forEach((color, i) => {
      const geo = ridgeRing({
        radius: 1250 - i * 180,
        segments: 96,
        height: dunes ? 55 + i * 10 : 260 - i * 55,
        color,
        cap: dunes ? null : map.snow,
        capFrom: dunes ? 1 : 0.72,
        snowLine: map.snowLine ?? 0.8,
        peaky: !dunes,
        seed: 11 + i * 7,
      });
      group.add(new THREE.Mesh(geo, mat));
    });
  } else {
    const count = 170;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const towers = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ map: windowsTexture(map.windows), fog: true }),
      count,
    );
    const rand = rng(5);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.02;
      const r = 650 + rand() * 300;
      const tall = 25 + Math.pow(rand(), 2) * 150;
      const wide = 18 + rand() * 30;
      m.compose(
        new THREE.Vector3(Math.cos(a) * r, -2, Math.sin(a) * r),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
        new THREE.Vector3(wide, tall, wide),
      );
      towers.setMatrixAt(i, m);
    }
    towers.frustumCulled = false;
    group.add(towers);
  }
  group.traverse((o) => (o.frustumCulled = false));
  return group;
}

function treeGeometry(map) {
  const c = map.treeColors;
  if (map.trees === 'pines') {
    return mergePainted([
      paint(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 5).translate(0, 1.1, 0), c.trunk),
      paint(new THREE.ConeGeometry(2.4, 5.5, 7).translate(0, 4.6, 0), c.leaves),
      paint(new THREE.ConeGeometry(1.7, 4.2, 7).translate(0, 7.4, 0), c.leavesAlt),
    ]);
  }
  const parts = [
    paint(new THREE.CylinderGeometry(0.22, 0.32, 4.5, 5).translate(0, 2.25, 0), c.trunk),
    paint(
      new THREE.CylinderGeometry(0.16, 0.22, 3.5, 5).rotateZ(0.18).translate(-0.3, 6.2, 0),
      c.trunk,
    ),
  ];
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.ConeGeometry(0.55, 3.6, 4).rotateZ(-Math.PI / 2 + 0.45);
    leaf
      .translate(1.6, 0, 0)
      .rotateY((i / 6) * Math.PI * 2)
      .translate(-0.6, 7.9, 0);
    parts.push(paint(leaf, i % 2 ? c.leaves : c.leavesAlt));
  }
  return mergePainted(parts);
}

/** Instances spread along both banks; positions recycled around the camera. */
function treadmill(
  geo,
  mat,
  { count, minX, spreadX, seed, scaleMin = 0.8, scaleMax = 1.4, y = 0 },
) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const rand = rng(seed);
  const items = Array.from({ length: count }, (_, i) => ({
    x: (i % 2 ? 1 : -1) * (minX + rand() * spreadX),
    z: rand() * TREADMILL_SPAN,
    s: scaleMin + rand() * (scaleMax - scaleMin),
    r: rand() * Math.PI * 2,
  }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let lastZ = null;
  mesh.userData.update = (camZ) => {
    if (lastZ != null && Math.abs(camZ - lastZ) < 2) return;
    lastZ = camZ;
    const far = camZ - TREADMILL_AHEAD;
    items.forEach((it, i) => {
      const z = far + ((((it.z - far) % TREADMILL_SPAN) + TREADMILL_SPAN) % TREADMILL_SPAN);
      m.compose(p.set(it.x, y, z), q.setFromAxisAngle(up, it.r), sc.setScalar(it.s));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return mesh;
}

/**
 * @param {import('./maps').MapDef} map
 * @param {{ left: number, right: number }} layout course edges (x)
 */
export function createScenery(map, layout) {
  const root = new THREE.Group();
  root.name = 'scenery';
  const edge = Math.max(-layout.left, layout.right);
  const bank = edge + 30;

  const shoreParts = [-1, 1].map((s) =>
    paint(
      new THREE.PlaneGeometry(900, 3200)
        .rotateX(-Math.PI / 2)
        .translate(s * (bank + 450), 0.05, -1400),
      map.shore,
    ),
  );
  const shore = new THREE.Mesh(
    mergePainted(shoreParts),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  shore.frustumCulled = false;
  root.add(shore);

  const back = backdrop(map);
  root.add(back);

  const movers = [];
  if (map.trees !== 'none') {
    const trees = treadmill(
      treeGeometry(map),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      {
        count: map.trees === 'pines' ? 260 : 120,
        minX: bank + 4,
        spreadX: map.trees === 'pines' ? 160 : 70,
        seed: 21,
      },
    );
    root.add(trees);
    movers.push(trees);
  }
  if (map.neon) {
    const posts = treadmill(
      new THREE.BoxGeometry(0.25, 3.2, 0.25).translate(0, 1.6, 0),
      new THREE.MeshBasicMaterial({ color: '#FFFFFF' }),
      { count: 70, minX: bank, spreadX: 0.1, seed: 4, scaleMin: 1, scaleMax: 1 },
    );
    const col = map.neon.map((h) => new THREE.Color(h));
    for (let i = 0; i < 70; i++) posts.setColorAt(i, col[i % col.length]);
    root.add(posts);
    movers.push(posts);
  }

  /** @param {THREE.Vector3} cam */
  root.userData.update = (cam) => {
    back.position.set(cam.x, 0, cam.z);
    shore.position.z = cam.z;
    for (const mv of movers) mv.userData.update(cam.z);
  };
  return root;
}
