/**
 * Race course: lane layout, buoy lines (every 10 m, instanced, only a window around the boat
 * is ever drawn), distance boards every 100 m (seven-segment digits built from boxes, no text
 * rendering needed on native), start gate and a checkered finish gate.
 * World axes: start line at z = 0, the race goes toward −z, lanes along x.
 */
import * as THREE from 'three';
import { checkerTexture, mergePainted, paint } from './geometry';

export const LANE_WIDTH = 6;
const BUOY_EVERY = 10;
const BUOYS_BEHIND = 60;
const BUOYS_AHEAD = 320;
const MARKER_EVERY = 100;
const MARKERS = 5;
const FINAL_STRETCH = 250;

/**
 * Lane centers with the user in the middle lane at x = 0; opponents alternate right/left.
 * @param {number} opponents 0..4
 */
export function laneLayout(opponents) {
  const lanes = opponents + 1;
  const userIdx = Math.floor((lanes - 1) / 2);
  const center = (i) => (i - userIdx) * LANE_WIDTH;
  const order = [];
  for (let k = 1; order.length < opponents; k++) {
    if (userIdx + k < lanes) order.push(userIdx + k);
    if (order.length < opponents && userIdx - k >= 0) order.push(userIdx - k);
  }
  const lines = [];
  for (let i = 0; i <= lanes; i++) lines.push(center(i) - LANE_WIDTH / 2);
  return {
    lanes,
    userX: 0,
    opponentX: order.map(center),
    lines,
    left: lines[0],
    right: lines[lines.length - 1],
  };
}

// Seven-segment digits: segments a b c d e f g.
const SEGMENTS = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
  4: 'bcfg',
  5: 'acdfg',
  6: 'acdefg',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
};
const SEG_BOX = {
  a: [0, 1, 1, 0],
  b: [1, 0.5, 0, 1],
  c: [1, -0.5, 0, 1],
  d: [0, -1, 1, 0],
  e: [-1, -0.5, 0, 1],
  f: [-1, 0.5, 0, 1],
  g: [0, 0, 1, 0],
};

/** Board + digits for one distance marker, as a single painted geometry facing +z. */
export function markerGeometry(text, boardColor, digitColor) {
  const dw = 0.9;
  const width = text.length * dw + 0.6;
  const parts = [paint(new THREE.BoxGeometry(width, 2.0, 0.12).translate(0, 0, -0.07), boardColor)];
  [...text].forEach((ch, i) => {
    const cx = -width / 2 + 0.6 + i * dw;
    for (const s of SEGMENTS[ch] || '') {
      const [sx, sy, horiz, vert] = SEG_BOX[s];
      const seg = new THREE.BoxGeometry(horiz ? 0.5 : 0.12, vert ? 0.62 : 0.12, 0.06);
      seg.translate(cx + sx * 0.28, sy * 0.68, 0.02);
      parts.push(paint(seg, digitColor));
    }
  });
  const post = new THREE.BoxGeometry(0.15, 3, 0.15).translate(0, -2.4, -0.07);
  parts.push(paint(post, boardColor));
  return mergePainted(parts);
}

/**
 * @param {import('./maps').MapDef} map
 * @param {{ mode: 'distance'|'time'|'free', target: number|null, opponents: number }} race
 */
export function createCourse(map, race) {
  const root = new THREE.Group();
  root.name = 'course';
  const layout = laneLayout(race.opponents);
  const finishZ = race.mode === 'distance' ? -race.target : null;
  const emissive = map.course.emissive;

  // ---- buoys (one instanced draw call) ----
  const perLine = Math.ceil((BUOYS_BEHIND + BUOYS_AHEAD) / BUOY_EVERY) + 1;
  const buoyGeo = new THREE.SphereGeometry(0.22, 8, 5).scale(1, 0.75, 1);
  // Buoys are small and must read from far away: unlit-ish (strong emissive), never grey.
  const buoyMat = emissive
    ? new THREE.MeshBasicMaterial({ color: '#FFFFFF' })
    : new THREE.MeshLambertMaterial({ color: '#FFFFFF', emissive: '#6B6B6B' });
  const buoys = new THREE.InstancedMesh(buoyGeo, buoyMat, perLine * layout.lines.length);
  buoys.name = 'buoys';
  buoys.frustumCulled = false;
  const base = new THREE.Color(map.course.buoy);
  const alt = new THREE.Color(map.course.buoyAlt);
  const m = new THREE.Matrix4();
  let buoyWindow = null;

  function updateBuoys(boatZ) {
    const first = Math.floor((-boatZ - BUOYS_BEHIND) / BUOY_EVERY);
    if (first === buoyWindow) return;
    buoyWindow = first;
    let n = 0;
    for (const x of layout.lines) {
      for (let k = 0; k < perLine; k++) {
        const along = (first + k) * BUOY_EVERY; // meters from the start
        const visible = along >= 0 && (finishZ == null || along <= -finishZ + 20);
        m.makeTranslation(x, visible ? 0.08 : -50, -along);
        buoys.setMatrixAt(n, m);
        const special =
          along % MARKER_EVERY === 0 || (finishZ != null && along >= -finishZ - FINAL_STRETCH);
        buoys.setColorAt(n, special ? alt : base);
        n++;
      }
    }
    buoys.instanceMatrix.needsUpdate = true;
    buoys.instanceColor.needsUpdate = true;
  }
  root.add(buoys);

  // ---- distance boards on the left bank ----
  const boardColor = emissive ? '#0E1524' : '#F8FAFC';
  const markerMat = emissive
    ? new THREE.MeshBasicMaterial({ vertexColors: true })
    : new THREE.MeshLambertMaterial({ vertexColors: true });
  const markers = Array.from({ length: MARKERS }, () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), markerMat);
    mesh.position.set(layout.left - 3, 3.2, 0);
    mesh.userData.value = null;
    root.add(mesh);
    return mesh;
  });

  function updateMarkers(boatZ) {
    const firstIdx = Math.max(1, Math.floor(-boatZ / MARKER_EVERY));
    markers.forEach((mesh, i) => {
      const value = (firstIdx + i) * MARKER_EVERY;
      const show = finishZ == null || value < -finishZ;
      mesh.visible = show;
      if (!show || mesh.userData.value === value) return;
      mesh.geometry.dispose();
      mesh.geometry = markerGeometry(String(value), boardColor, map.course.marker);
      mesh.userData.value = value;
      mesh.position.z = -value;
    });
  }

  // ---- gates ----
  const gateMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const span = layout.right - layout.left + 4;
  const gate = (z, color) => {
    const parts = [-1, 1].map((s) =>
      paint(new THREE.BoxGeometry(0.3, 6, 0.3).translate((s * span) / 2, 3, 0), color),
    );
    parts.push(paint(new THREE.BoxGeometry(span, 0.25, 0.25).translate(0, 6, 0), color));
    const mesh = new THREE.Mesh(mergePainted(parts), gateMat);
    mesh.position.z = z;
    return mesh;
  };
  root.add(gate(0, emissive ? '#22D3EE' : '#F8FAFC'));

  if (finishZ != null) {
    root.add(gate(finishZ, emissive ? '#FF7A1A' : '#0A0F1C'));
    const tex = checkerTexture(16, 2);
    const bannerMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: true });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(span, 1.1), bannerMat);
    banner.position.set(0, 5.3, finishZ);
    root.add(banner);
    const flagMat = new THREE.MeshBasicMaterial({
      map: checkerTexture(4, 3),
      side: THREE.DoubleSide,
    });
    const flagGeo = new THREE.PlaneGeometry(1.4, 1.0);
    for (const s of [-1, 1]) {
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set((s * span) / 2 + s * 0.75, 6.6, finishZ);
      root.add(flag);
    }
  }

  root.userData.update = (boatZ) => {
    updateBuoys(boatZ);
    updateMarkers(boatZ);
  };
  root.userData.update(0);
  return { root, layout, finishZ };
}
