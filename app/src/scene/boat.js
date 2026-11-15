/**
 * Low-poly single scull + rower, built from code (no external models).
 * Boat-local axes: the boat travels toward −Z (bow at −Z). The sculler faces the stern (+Z),
 * so the chase camera behind the boat sees the rower from the front.
 *
 * - createUserBoat: detailed rig. Sliding seat, 2-bone legs, leaning torso, arms that follow
 *   the oar handles, oars with catch / drive / extraction / feathering. ~16 draw calls.
 * - createOpponentBoat: merged hull + seated rower and two rigid oars. 4 draw calls.
 */
import * as THREE from 'three';
import { createBlobShadow, mergePainted, paint, placeSegment } from './geometry';
import { poseAt } from './strokeAnimator';
import { createMixamoRower } from './characters/mixamoRower';

const PIVOT = { x: 0.82, y: 0.45, z: 0.3 };
const INBOARD = 0.85;
const OUTBOARD = 2.0;
const BLADE_Y_IN = -0.02;
const BLADE_Y_OUT = 0.3;
const HIP_Y = 0.4;
const SEAT_Z0 = -0.2;
const FOOT = { y: 0.3, z: 0.7 };
const THIGH = 0.46;
const SHIN = 0.46;
const TORSO = 0.55;
const SKIN = '#D9A27A';
const SHIRT_DARK = '#1A2438';

/** Hull (lathe), deck, riggers and footboard as one painted geometry. */
function hullGeometry(color) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const y = -4 + (8 * i) / 12;
    const r = 0.17 * Math.pow(Math.max(0, 1 - (y / 4) ** 2), 0.6);
    pts.push(new THREE.Vector2(r, y));
  }
  const hull = new THREE.LatheGeometry(pts, 8);
  hull.rotateX(Math.PI / 2);
  hull.scale(1, 0.55, 1);
  hull.translate(0, 0.08, -0.5);
  const parts = [paint(hull, color)];
  for (const side of [-1, 1]) {
    const rig = new THREE.BoxGeometry(0.72, 0.03, 0.05);
    rig.translate(side * 0.46, PIVOT.y - 0.05, PIVOT.z);
    parts.push(paint(rig, '#C9D1DB'));
    const pin = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 5);
    pin.translate(side * PIVOT.x, PIVOT.y, PIVOT.z);
    parts.push(paint(pin, '#8A94A3'));
  }
  const foot = new THREE.BoxGeometry(0.34, 0.2, 0.04);
  foot.translate(0, FOOT.y - 0.05, FOOT.z + 0.05);
  parts.push(paint(foot, '#3A4558'));
  const track = new THREE.BoxGeometry(0.28, 0.03, 1.0);
  track.translate(0, 0.22, SEAT_Z0 + 0.3);
  parts.push(paint(track, '#8A94A3'));
  return mergePainted(parts);
}

function oarGeometryAlongX(color) {
  const shaft = new THREE.CylinderGeometry(0.018, 0.018, INBOARD + OUTBOARD, 5);
  shaft.rotateZ(Math.PI / 2);
  shaft.translate((OUTBOARD - INBOARD) / 2, 0, 0);
  const blade = new THREE.BoxGeometry(0.46, 0.2, 0.02);
  blade.translate(OUTBOARD - 0.23, 0, 0);
  return mergePainted([paint(shaft, '#E8ECF2'), paint(blade, color)]);
}

const lambert = (opts) => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });

/** Pure: oar line for one side at a pose. side = +1 (starboard, +x) or −1. */
export function oarLine(side, pose) {
  const dir = new THREE.Vector3(side * Math.cos(pose.sweep), 0, -Math.sin(pose.sweep));
  const bladeY = BLADE_Y_OUT + (BLADE_Y_IN - BLADE_Y_OUT) * pose.bladeIn;
  const pivot = new THREE.Vector3(side * PIVOT.x, PIVOT.y, PIVOT.z);
  const tip = pivot.clone().addScaledVector(dir, OUTBOARD).setY(bladeY);
  const handle = pivot.clone().addScaledVector(tip.clone().sub(pivot), -INBOARD / OUTBOARD);
  return { pivot, tip, handle, dir: tip.clone().sub(handle).normalize() };
}

/** Knee of a 2-bone leg between hip and foot (bends upward). */
function knee(hip, foot) {
  const mid = hip.clone().add(foot).multiplyScalar(0.5);
  const half = hip.distanceTo(foot) / 2;
  const h = Math.sqrt(Math.max(0, THIGH * SHIN - half * half));
  return mid.setY(mid.y + h);
}

/**
 * @param {{ color: string, shirt?: string, character?: THREE.Object3D | null }} o
 *   character: a prepared Mixamo model (characters/prepare.js); replaces the box rower
 */
export function createUserBoat({ color, shirt = color, character = null }) {
  const root = new THREE.Group();
  root.name = 'userBoat';
  root.add(new THREE.Mesh(hullGeometry('#F2F5F8'), lambert()));
  root.add(createBlobShadow(1.1, 8.8));

  const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex });
  const limbGeo = (r) => new THREE.CylinderGeometry(r, r * 0.85, 1, 6);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), mat('#2B3445'));
  const torsoGeo = mergePainted([
    paint(new THREE.BoxGeometry(0.36, TORSO, 0.2).translate(0, TORSO / 2, 0), shirt),
    paint(new THREE.SphereGeometry(0.12, 8, 6).translate(0, TORSO + 0.17, 0.02), SKIN),
  ]);
  const torso = new THREE.Mesh(torsoGeo, lambert());
  const legMat = mat(SHIRT_DARK);
  const armMat = mat(SKIN);
  const thighs = [0, 1].map(() => new THREE.Mesh(limbGeo(0.07), legMat));
  const shins = [0, 1].map(() => new THREE.Mesh(limbGeo(0.055), legMat));
  const arms = [0, 1].map(() => new THREE.Mesh(limbGeo(0.045), armMat));
  const shafts = [0, 1].map(
    () => new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5), mat('#E8ECF2')),
  );
  const bladeGeo = new THREE.BoxGeometry(0.46, 0.2, 0.02);
  const blades = [0, 1].map(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bladeGeo, mat(color)));
    return g;
  });
  const rower = character ? createMixamoRower(character) : null;
  root.add(seat, ...shafts, ...blades);
  if (rower) root.add(rower.root);
  else root.add(torso, ...thighs, ...shins, ...arms);

  const X = new THREE.Vector3(1, 0, 0);
  const hip = new THREE.Vector3();
  const foot = new THREE.Vector3();

  /** @param {number} phase @param {number} frac drive fraction */
  function setStroke(phase, frac) {
    const pose = poseAt(phase, frac);
    const seatZ = SEAT_Z0 + pose.slide;
    seat.position.set(0, 0.25, seatZ);
    if (rower) {
      const handles = [-1, 1].map((side) => oarLine(side, pose).handle);
      rower.setPose({
        seatZ,
        lean: pose.lean,
        handL: handles[0],
        handR: handles[1],
        footL: new THREE.Vector3(-0.12, FOOT.y, FOOT.z),
        footR: new THREE.Vector3(0.12, FOOT.y, FOOT.z),
      });
    }
    hip.set(0, HIP_Y, seatZ);
    torso.position.copy(hip);
    torso.rotation.x = pose.lean;

    [-1, 1].forEach((side, i) => {
      const hipSide = hip.clone().setX(side * 0.1);
      foot.set(side * 0.1, FOOT.y, FOOT.z);
      const oar = oarLine(side, pose);
      placeSegment(shafts[i], oar.handle, oar.tip);
      if (!rower) {
        const k = knee(hipSide, foot);
        placeSegment(thighs[i], hipSide, k);
        placeSegment(shins[i], k, foot);
        const shoulder = new THREE.Vector3(side * 0.17, TORSO - 0.06, 0)
          .applyEuler(torso.rotation)
          .add(hip);
        placeSegment(arms[i], shoulder, oar.handle.clone().setX(oar.handle.x * 0.9));
      }
      const b = blades[i];
      b.position.copy(oar.tip).addScaledVector(oar.dir, -0.23);
      b.quaternion.setFromUnitVectors(X, side > 0 ? oar.dir : oar.dir.clone().negate());
      b.children[0].rotation.x = (pose.feather * Math.PI) / 2;
    });
  }

  setStroke(0.33, 0.33);
  return { root, setStroke, hasCharacter: !!rower };
}

/** @param {{ color: string, opacity?: number }} o */
export function createOpponentBoat({ color, opacity = 0.6 }) {
  const root = new THREE.Group();
  root.name = 'opponentBoat';
  const body = mergePainted([
    hullGeometry(color),
    paint(new THREE.BoxGeometry(0.34, 0.5, 0.2).translate(0, HIP_Y + 0.25, 0.05), color),
    paint(new THREE.SphereGeometry(0.11, 6, 5).translate(0, HIP_Y + 0.66, 0.08), '#F2F5F8'),
  ]);
  const ghostMat = lambert({ transparent: true, opacity, depthWrite: false });
  root.add(new THREE.Mesh(body, ghostMat));
  root.add(createBlobShadow(1.0, 8.6, 0.2));

  const oarGeo = oarGeometryAlongX(color);
  const oars = [-1, 1].map((side) => {
    const g = new THREE.Group();
    g.position.set(side * PIVOT.x, PIVOT.y, PIVOT.z);
    g.rotation.order = 'YZX';
    g.userData.side = side;
    g.add(new THREE.Mesh(oarGeo, ghostMat));
    root.add(g);
    return g;
  });

  function setStroke(phase, frac) {
    const pose = poseAt(phase, frac);
    const bladeY = BLADE_Y_OUT + (BLADE_Y_IN - BLADE_Y_OUT) * pose.bladeIn;
    const roll = Math.atan2(bladeY - PIVOT.y, OUTBOARD);
    for (const g of oars) {
      g.rotation.y = g.userData.side > 0 ? pose.sweep : Math.PI - pose.sweep;
      g.rotation.z = roll;
    }
  }

  setStroke(0.33, 0.33);
  return { root, setStroke };
}
