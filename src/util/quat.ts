/** Minimal quaternion math. Quat = [x, y, z, w]. Y up, camera looks along -Z. */
export type Quat = [number, number, number, number];

export const QUAT_IDENTITY = (): Quat => [0, 0, 0, 1];

export function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function fromAxisAngle(x: number, y: number, z: number, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}

export const yawQuat = (a: number): Quat => fromAxisAngle(0, 1, 0, a);
export const pitchQuat = (a: number): Quat => fromAxisAngle(1, 0, 0, a);

/** Euler order YXZ (same convention as three.js). */
export function fromEulerYXZ(x: number, y: number, z: number): Quat {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let ka: number, kb: number;
  if (dot > 0.9995) {
    ka = 1 - t; kb = t;
  } else {
    const th = Math.acos(dot), sn = Math.sin(th);
    ka = Math.sin((1 - t) * th) / sn;
    kb = Math.sin(t * th) / sn;
  }
  const r: Quat = [ka * a[0] + kb * bx, ka * a[1] + kb * by, ka * a[2] + kb * bz, ka * a[3] + kb * bw];
  const n = Math.hypot(r[0], r[1], r[2], r[3]) || 1;
  return [r[0] / n, r[1] / n, r[2] / n, r[3] / n];
}

export function rotateVec(q: Quat, v: [number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Heading (rotation about +Y) of the forward (-Z) direction. */
export function yawOf(q: Quat): number {
  const f = rotateVec(q, [0, 0, -1]);
  return Math.atan2(-f[0], -f[2]);
}
