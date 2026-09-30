import * as THREE from 'three';
import { Player } from '../game/Player';

const BASE_FOV = 70; // vertical degrees at 1x zoom

/** Virtual camera driven by the player state. Separate from CameraEquipment. */
export class ViewCamera {
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 400);

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  update(p: Player): void {
    const c = this.camera;
    c.position.set(p.position.x, p.position.y, p.position.z);
    c.quaternion.set(...p.orientation);
    const fov = 2 * Math.atan(Math.tan((BASE_FOV * Math.PI) / 360) / p.zoom) * (180 / Math.PI);
    if (Math.abs(c.fov - fov) > 0.001) { c.fov = fov; c.updateProjectionMatrix(); }
  }
}
