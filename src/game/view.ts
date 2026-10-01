import { Quat, rotateVec } from '../util/quat';

export const BASE_FOV_DEG = 70; // default vertical FOV at 1x zoom (synthetic views)
let baseFov = BASE_FOV_DEG;

/** AR: set to the vertical FOV of the displayed camera image so virtual objects line up with the real view. */
export function setBaseFov(deg: number): void { baseFov = deg; }
export function getBaseFov(): number { return baseFov; }

export function vFovRad(zoom: number): number {
  return 2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) / zoom);
}

/** Projects a world point to NDC ([-1,1] in frame). Returns null if behind the camera. */
export function project(
  camPos: { x: number; y: number; z: number }, q: Quat, zoom: number, aspect: number,
  p: [number, number, number],
): { x: number; y: number } | null {
  const inv: Quat = [-q[0], -q[1], -q[2], q[3]];
  const c = rotateVec(inv, [p[0] - camPos.x, p[1] - camPos.y, p[2] - camPos.z]);
  const depth = -c[2];
  if (depth < 0.1) return null;
  const t = Math.tan(vFovRad(zoom) / 2);
  return { x: c[0] / depth / (t * aspect), y: c[1] / depth / t };
}
