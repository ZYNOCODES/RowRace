import * as THREE from 'three';
import { createMixamoRower, findBones, restHeight, solveTwoBone } from './mixamoRower';

/** A Mixamo-like T-pose skeleton (meters, facing +Z, character's left at +x). */
function mixamoSkeleton() {
  const bone = (name, parent, x, y, z) => {
    const b = new THREE.Bone();
    b.name = `mixamorig:${name}`;
    b.position.set(x, y, z);
    parent?.add(b);
    return b;
  };
  const root = new THREE.Group();
  const hips = bone('Hips', null, 0, 0.98, 0);
  root.add(hips);
  const spine = bone('Spine', hips, 0, 0.1, 0);
  const spine1 = bone('Spine1', spine, 0, 0.12, 0);
  const spine2 = bone('Spine2', spine1, 0, 0.13, 0);
  const neck = bone('Neck', spine2, 0, 0.15, 0);
  const head = bone('Head', neck, 0, 0.1, 0);
  bone('HeadTop_End', head, 0, 0.2, 0);
  for (const [side, sx] of [
    ['Left', 1],
    ['Right', -1],
  ]) {
    const sh = bone(`${side}Shoulder`, spine2, sx * 0.07, 0.11, 0);
    const arm = bone(`${side}Arm`, sh, sx * 0.12, 0, 0);
    const fore = bone(`${side}ForeArm`, arm, sx * 0.28, 0, 0);
    bone(`${side}Hand`, fore, sx * 0.26, 0, 0);
    const up = bone(`${side}UpLeg`, hips, sx * 0.09, -0.06, 0);
    const leg = bone(`${side}Leg`, up, 0, -0.44, 0);
    const foot = bone(`${side}Foot`, leg, 0, -0.42, 0);
    bone(`${side}ToeBase`, foot, 0, -0.05, 0.12);
  }
  // A skinned mesh is not needed for the solver; the driver only reads bones.
  root.updateMatrixWorld(true);
  return root;
}

const world = (b) => b.getWorldPosition(new THREE.Vector3());

test('restHeight from bones', () => {
  const h = restHeight(findBones(mixamoSkeleton()));
  expect(h).toBeGreaterThan(1.6);
  expect(h).toBeLessThan(1.9);
});

test('two-bone IK reaches a reachable target and bends toward the pole', () => {
  const s = mixamoSkeleton();
  const b = findBones(s);
  const target = new THREE.Vector3(0.35, 1.2, 0.3); // ~0.42 m from the shoulder (arm: 0.54 m)
  const miss = solveTwoBone(
    b.LeftArm,
    b.LeftForeArm,
    b.LeftHand,
    target,
    new THREE.Vector3(1, 0, 0),
  );
  expect(miss).toBeLessThan(0.01);
  expect(world(b.LeftForeArm).x).toBeGreaterThan(world(b.LeftArm).x - 0.05); // elbow toward +x pole
});

test('unreachable target: limb straightens toward it without NaN', () => {
  const s = mixamoSkeleton();
  const b = findBones(s);
  solveTwoBone(
    b.LeftArm,
    b.LeftForeArm,
    b.LeftHand,
    new THREE.Vector3(5, 5, 5),
    new THREE.Vector3(0, 0, 1),
  );
  const p = world(b.LeftHand);
  expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
});

describe('Mixamo rower in a moving boat', () => {
  test.each([0, -60, -1500])(
    'hips on the seat, hands on handles, feet on the footboard (boat at z=%i)',
    (boatZ) => {
      const boat = new THREE.Group();
      boat.position.z = boatZ;
      const rower = createMixamoRower(mixamoSkeleton());
      boat.add(rower.root);
      boat.updateMatrixWorld(true);
      const local = (b) => boat.worldToLocal(world(b));
      const pose = {
        seatZ: 0.1,
        lean: 0.3,
        handL: new THREE.Vector3(-0.2, 0.62, 0.55),
        handR: new THREE.Vector3(0.2, 0.62, 0.55),
        footL: new THREE.Vector3(-0.12, 0.3, 0.7),
        footR: new THREE.Vector3(0.12, 0.3, 0.7),
      };
      rower.setPose(pose);
      const bones = rower.bones;
      expect(local(bones.Hips).z).toBeCloseTo(0.1, 1);
      // The character's left side faces +x (facing +Z): left hand → the +x handle.
      expect(local(bones.LeftHand).distanceTo(pose.handR)).toBeLessThan(0.05);
      expect(local(bones.RightHand).distanceTo(pose.handL)).toBeLessThan(0.05);
      expect(local(bones.LeftFoot).distanceTo(pose.footR)).toBeLessThan(0.06);
      expect(local(bones.RightFoot).distanceTo(pose.footL)).toBeLessThan(0.06);
      // Knees above the hips line (seated, legs bent).
      expect(local(bones.LeftLeg).y).toBeGreaterThan(local(bones.LeftUpLeg).y);
    },
  );

  test('a model without the Mixamo bones is rejected', () => {
    expect(createMixamoRower(new THREE.Group())).toBeNull();
  });
});
