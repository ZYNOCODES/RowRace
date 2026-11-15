/**
 * Drives any Mixamo-rigged character (shared `mixamorig:*` skeleton) as a sculler, from the
 * same stroke pose as the procedural rower: hips on the sliding seat, two-bone IK legs to the
 * footboard, body swing on the spine, two-bone IK arms to the oar handles.
 *
 * Everything is solved in boat space with world-axis rotations, so it does not depend on each
 * rig's local bone axes. Characters face +Z after import (Mixamo default), which is the
 * stern: a sculler faces backwards, so no turn is needed.
 */
import * as THREE from 'three';

const PREFIX = /^mixamorig\d*[:_]?/;
const TARGET_HEIGHT = 1.78; // m: every character is scaled to the same size (fits the boat)
const SEAT_TOP = 0.28;
const PELVIS_ABOVE_SEAT = 0.1;

const v = () => new THREE.Vector3();
const tmp = {
  a: v(),
  b: v(),
  c: v(),
  t: v(),
  d: v(),
  p: v(),
  q: new THREE.Quaternion(),
  pw: new THREE.Quaternion(),
};

/** Finds Mixamo bones by short name (prefix-insensitive). */
export function findBones(root) {
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name.replace(PREFIX, '')] = o;
  });
  return bones;
}

/** Applies a world-space rotation to a bone (keeps its parent untouched). */
export function rotateWorld(bone, qWorld) {
  bone.parent.getWorldQuaternion(tmp.pw);
  // local' = P⁻¹ · q · P · local
  bone.quaternion.premultiply(tmp.pw).premultiply(qWorld).premultiply(tmp.pw.invert());
  bone.updateMatrixWorld(true);
}

/** Rotates `bone` so that the world direction bone→child points from its position to `to`. */
function aim(bone, child, to) {
  bone.getWorldPosition(tmp.a);
  child.getWorldPosition(tmp.b);
  const from = tmp.d.subVectors(tmp.b, tmp.a).normalize();
  const want = tmp.p.subVectors(to, tmp.a).normalize();
  if (from.lengthSq() < 1e-9 || want.lengthSq() < 1e-9) return;
  rotateWorld(bone, tmp.q.setFromUnitVectors(from, want));
}

/**
 * Two-bone IK in world space: upper→lower→end reaches toward `target`, bending toward `pole`.
 * @returns {number} remaining distance from end to target (0 when reachable)
 */
export function solveTwoBone(upper, lower, end, target, pole) {
  const A = upper.getWorldPosition(v());
  const B = lower.getWorldPosition(v());
  const C = end.getWorldPosition(v());
  const la = A.distanceTo(B);
  const lb = B.distanceTo(C);
  const toT = v().subVectors(target, A);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(la - lb) + 1e-4, la + lb - 1e-4);
  const dir = toT.normalize();
  const bend = v().subVectors(pole, A);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-9) bend.set(0, 1, 0).addScaledVector(dir, -dir.y);
  bend.normalize();
  const cosA = THREE.MathUtils.clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
  const knee = A.clone()
    .addScaledVector(dir, cosA * la)
    .addScaledVector(bend, Math.sqrt(1 - cosA * cosA) * la);
  const reach = A.clone().addScaledVector(dir, d);
  aim(upper, lower, knee);
  aim(lower, end, reach);
  return end.getWorldPosition(v()).distanceTo(target);
}

/** Head top (or head + 12 cm) to the lowest foot/toe bone, in world units. */
export function restHeight(bones) {
  const y = (b) => (b ? b.getWorldPosition(v()).y : null);
  const top = y(bones.HeadTop_End) ?? (y(bones.Head) != null ? y(bones.Head) + 0.12 : null);
  const feet = [
    'LeftToe_End',
    'RightToe_End',
    'LeftToeBase',
    'RightToeBase',
    'LeftFoot',
    'RightFoot',
  ]
    .map((n) => y(bones[n]))
    .filter((n) => n != null);
  if (top == null || feet.length === 0) return 0;
  return top - Math.min(...feet) + 0.03;
}

/**
 * @param {THREE.Object3D} model glTF scene of a Mixamo character (already cloned)
 * @returns {{ root: THREE.Group, bones: object, setPose: (p: RowerPose) => void } | null}
 *   null when the model isn't a usable Mixamo rig
 *
 * @typedef {{ seatZ: number, lean: number, handL: THREE.Vector3, handR: THREE.Vector3,
 *   footL: THREE.Vector3, footR: THREE.Vector3 }} RowerPose  (boat space)
 */
export function createMixamoRower(model) {
  const bones = findBones(model);
  const need = [
    'Hips',
    'Spine',
    'Spine1',
    'Spine2',
    'Head',
    'LeftArm',
    'LeftForeArm',
    'LeftHand',
    'RightArm',
    'RightForeArm',
    'RightHand',
    'LeftUpLeg',
    'LeftLeg',
    'LeftFoot',
    'RightUpLeg',
    'RightLeg',
    'RightFoot',
  ];
  if (need.some((n) => !bones[n])) return null;

  const root = new THREE.Group();
  root.name = 'mixamoRower';
  root.add(model);

  // Scale to a standard height, measured on the rest-pose bones (skinned bounds are only
  // valid after a frame has been rendered).
  model.updateMatrixWorld(true);
  const h = restHeight(bones);
  if (h > 0.5 && h < 3) model.scale.multiplyScalar(TARGET_HEIGHT / h);
  model.updateMatrixWorld(true);

  const rest = new Map();
  for (const b of Object.values(bones))
    rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
  const hipsRestWorld = bones.Hips.getWorldPosition(v());

  model.traverse((o) => {
    if (o.isSkinnedMesh) o.frustumCulled = false; // bind-pose bounds don't match the seated pose
  });

  const spine = [bones.Spine, bones.Spine1, bones.Spine2];
  const xAxis = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const hipTarget = v();

  /** Boat space (= this root's local space) → world, where the IK is solved. */
  const W = (x, y, z) => root.localToWorld(v().set(x, y, z));

  /** @param {RowerPose} p targets in boat space */
  function setPose(p) {
    for (const [b, r] of rest) {
      b.quaternion.copy(r.q);
      b.position.copy(r.p);
    }
    root.updateMatrixWorld(true);

    // Hips onto the seat: shift the whole model (keeps the rig's own hips offset).
    hipTarget.set(0, SEAT_TOP + PELVIS_ABOVE_SEAT, p.seatZ);
    model.position.add(hipTarget.sub(root.worldToLocal(bones.Hips.getWorldPosition(v()))));
    root.updateMatrixWorld(true);

    // Body swing: positive lean = toward the feet (+Z), spread over the spine.
    const boatX = xAxis.set(1, 0, 0).transformDirection(root.matrixWorld);
    for (const s of spine) rotateWorld(s, q.setFromAxisAngle(boatX, p.lean / spine.length));
    rotateWorld(bones.Head, q.setFromAxisAngle(boatX, -p.lean * 0.6));

    // Legs: knees up and slightly out.
    const kneePole = (side) => W(side * 0.25, 1.4, p.seatZ + 0.4);
    const footL = W(p.footL.x, p.footL.y, p.footL.z);
    const footR = W(p.footR.x, p.footR.y, p.footR.z);
    // Mixamo "Left" is the character's left: facing +Z that is boat +x. Pick by position.
    const leftLegPlusX = root.worldToLocal(bones.LeftUpLeg.getWorldPosition(v())).x > 0;
    solveTwoBone(
      bones.LeftUpLeg,
      bones.LeftLeg,
      bones.LeftFoot,
      leftLegPlusX ? footR : footL,
      kneePole(leftLegPlusX ? 1 : -1),
    );
    solveTwoBone(
      bones.RightUpLeg,
      bones.RightLeg,
      bones.RightFoot,
      leftLegPlusX ? footL : footR,
      kneePole(leftLegPlusX ? -1 : 1),
    );

    // Arms: elbows out and down; each hand to the handle on its own side.
    const elbowPole = (side) => W(side * 1.2, 0.2, p.seatZ - 0.2);
    const handL = W(p.handL.x, p.handL.y, p.handL.z);
    const handR = W(p.handR.x, p.handR.y, p.handR.z);
    const leftArmPlusX = root.worldToLocal(bones.LeftArm.getWorldPosition(v())).x > 0;
    solveTwoBone(
      bones.LeftArm,
      bones.LeftForeArm,
      bones.LeftHand,
      leftArmPlusX ? handR : handL,
      elbowPole(leftArmPlusX ? 1 : -1),
    );
    solveTwoBone(
      bones.RightArm,
      bones.RightForeArm,
      bones.RightHand,
      leftArmPlusX ? handL : handR,
      elbowPole(leftArmPlusX ? -1 : 1),
    );
  }

  return { root, bones, setPose, restHips: hipsRestWorld };
}
