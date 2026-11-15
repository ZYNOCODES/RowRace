/**
 * Camera rig: smooth spring follow of the user's boat.
 *   chase    behind and above, slight sway with each stroke (default)
 *   side     beside the boat, broadcast style
 *   overhead high above, sees the whole field
 *   finish   fixed beside the finish line looking at the boat (results slow-motion)
 * Pure apart from writing camera.position / lookAt; frame-rate independent smoothing.
 */
import * as THREE from 'three';

export const CAMERA_MODES = ['chase', 'side', 'overhead'];

const STIFFNESS = { pos: 3.5, look: 6 };

/**
 * Target position and look-at point for a mode.
 * @param {'chase'|'side'|'overhead'|'finish'} mode
 * @param {{ boatX: number, boatZ: number, phase: number, speed: number, finishZ?: number|null,
 *   courseRight?: number }} s
 */
export function cameraTarget(mode, s) {
  const sway = Math.min(1, s.speed / 4);
  const a = 2 * Math.PI * s.phase;
  switch (mode) {
    case 'side':
      // Outside the course and raised, like a broadcast camera: other lanes don't block it.
      return {
        pos: new THREE.Vector3((s.courseRight ?? 10) + 5, 5.5, s.boatZ + 3),
        look: new THREE.Vector3(s.boatX, 0.5, s.boatZ - 2),
      };
    case 'overhead':
      return {
        pos: new THREE.Vector3(s.boatX, 26, s.boatZ + 12),
        look: new THREE.Vector3(s.boatX, 0, s.boatZ - 14),
      };
    case 'finish': {
      const fz = s.finishZ ?? s.boatZ;
      return {
        pos: new THREE.Vector3((s.courseRight ?? 10) + 7, 2.2, fz + 3),
        look: new THREE.Vector3(s.boatX, 0.8, s.boatZ),
      };
    }
    default:
      return {
        pos: new THREE.Vector3(
          s.boatX + Math.sin(a) * 0.12 * sway,
          3 + Math.cos(a) * 0.05 * sway,
          s.boatZ + 8.5,
        ),
        look: new THREE.Vector3(s.boatX, 0.6, s.boatZ - 10),
      };
  }
}

export class CameraRig {
  /** @param {THREE.PerspectiveCamera} camera */
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.ready = false;
  }

  /** Jump straight to the target (first frame, after a camera toggle when `snap`). */
  snapNext() {
    this.ready = false;
  }

  /**
   * @param {number} dt seconds
   * @param {'chase'|'side'|'overhead'|'finish'} mode
   * @param {Parameters<typeof cameraTarget>[1]} s
   */
  update(dt, mode, s) {
    const t = cameraTarget(mode, s);
    if (!this.ready) {
      this.pos.copy(t.pos);
      this.look.copy(t.look);
      this.ready = true;
    } else {
      // Exact spring-like smoothing toward the target, independent of frame rate.
      this.pos.lerp(t.pos, 1 - Math.exp(-dt * STIFFNESS.pos));
      this.look.lerp(t.look, 1 - Math.exp(-dt * STIFFNESS.look));
      // Never fall behind the boat by more than 3 m along z (fast sprints, low frame rate).
      const lagZ = this.pos.z - t.pos.z;
      if (lagZ < -3) this.pos.z = t.pos.z - 3;
      if (lagZ > 3) this.pos.z = t.pos.z + 3;
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
