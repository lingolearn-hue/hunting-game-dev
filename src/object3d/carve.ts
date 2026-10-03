import { Layout, SheetBitmap, sampleSheet } from './sheet';
import { Pose, Intrinsics } from './pose';

/**
 * Object model by silhouette carving. The sheet is known exactly, so each camera image is compared with the EXPECTED
 * image of the sheet (normalized cross-correlation, immune to exposure, white balance and shadows). Pixels that match
 * are known background; every voxel that projects onto known background cannot belong to the object and is removed.
 * Pixels that do not match (the object, glare, anything unknown) never remove anything: errors only keep too much volume.
 */
export interface Keyframe {
  R: number[]; t: number[]; K: Intrinsics; w: number; h: number;
  bg: Uint8Array;                         // 1 = known background (after erosion)
  color: Uint8ClampedArray; cw: number; ch: number;   // RGBA, for texturing (any resolution)
  center: [number, number, number];       // camera position, board mm
  /** Gray image (w x h) and its exposure gain relative to the sheet, for photo-consistency. */
  gray?: Uint8Array; gain?: number;
}

/** Known-background mask of one image: NCC between the image and the expected sheet in 7x7 windows. */
export function backgroundMask(gray: Uint8Array, w: number, h: number, pose: Pose, K: Intrinsics, L: Layout, B: SheetBitmap, opt: { nccMin?: number; erode?: number; win?: number } = {}): Uint8Array {
  const nccMin = opt.nccMin ?? 0.7, er = opt.erode ?? 1, R = pose.R, t = pose.t;
  // bounding box of the paper in the image
  let x0 = w, y0 = h, x1 = 0, y1 = 0, any = false;
  for (const [bx, by] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const X = bx * L.w / 2, Y = by * L.h / 2, xc = R[0] * X + R[1] * Y + t[0], yc = R[3] * X + R[4] * Y + t[1], zc = R[6] * X + R[7] * Y + t[2];
    if (zc <= 20) return new Uint8Array(w * h);
    const u = K.f * xc / zc + K.cx, v = K.f * yc / zc + K.cy;
    x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); any = true;
  }
  if (!any) return new Uint8Array(w * h);
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w - 1, Math.ceil(x1)); y1 = Math.min(h - 1, Math.ceil(y1));
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bw < 20 || bh < 20) return new Uint8Array(w * h);
  // expected image (E) and its validity
  const E = new Float32Array(bw * bh), valid = new Uint8Array(bw * bh);
  const r0 = [R[0], R[3], R[6]], r1 = [R[1], R[4], R[7]], r2 = [R[2], R[5], R[8]];   // columns of R: R^T rows
  const bz = r2[0] * t[0] + r2[1] * t[1] + r2[2] * t[2], bxx = r0[0] * t[0] + r0[1] * t[1] + r0[2] * t[2], byy = r1[0] * t[0] + r1[1] * t[1] + r1[2] * t[2];
  const mx = L.w / 2 - 6, my = L.h / 2 - 6;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const dx = (x0 + x + 0.5 - K.cx) / K.f, dy = (y0 + y + 0.5 - K.cy) / K.f;
    const ax = r0[0] * dx + r0[1] * dy + r0[2], ay = r1[0] * dx + r1[1] * dy + r1[2], az = r2[0] * dx + r2[1] * dy + r2[2];
    if (Math.abs(az) < 1e-9) continue;
    const lam = bz / az, px = lam * ax - bxx, py = lam * ay - byy;
    if (Math.abs(px) > mx || Math.abs(py) > my) continue;
    E[y * bw + x] = sampleSheet(B, L, px, py); valid[y * bw + x] = 1;
  }
  // integral images over the box
  const iw = bw + 1, n = iw * (bh + 1);
  const sI = new Float64Array(n), sE = new Float64Array(n), sII = new Float64Array(n), sEE = new Float64Array(n), sIE = new Float64Array(n), sV = new Float64Array(n);
  for (let y = 0; y < bh; y++) {
    let rI = 0, rE = 0, rII = 0, rEE = 0, rIE = 0, rV = 0;
    for (let x = 0; x < bw; x++) {
      const i = gray[(y0 + y) * w + x0 + x], e = E[y * bw + x];
      rI += i; rE += e; rII += i * i; rEE += e * e; rIE += i * e; rV += valid[y * bw + x];
      const k = (y + 1) * iw + x + 1, up = y * iw + x + 1;
      sI[k] = sI[up] + rI; sE[k] = sE[up] + rE; sII[k] = sII[up] + rII; sEE[k] = sEE[up] + rEE; sIE[k] = sIE[up] + rIE; sV[k] = sV[up] + rV;
    }
  }
  const win = opt.win ?? 5, area = (2 * win + 1) ** 2;      // 11x11 window: about two speckle features
  const match = new Uint8Array(w * h), known = new Uint8Array(w * h);   // known: window fully on the sheet and the expected pattern has structure
  const rect = (S: Float64Array, x: number, y: number) => S[(y + win + 1) * iw + x + win + 1] - S[(y - win) * iw + x + win + 1] - S[(y + win + 1) * iw + x - win] + S[(y - win) * iw + x - win];
  for (let y = win; y < bh - win; y++) for (let x = win; x < bw - win; x++) {
    if (rect(sV, x, y) < area) continue;
    const vE = rect(sEE, x, y) - rect(sE, x, y) ** 2 / area;
    if (vE < area * 120) continue;                                   // flat expected pattern: nothing to compare
    known[(y0 + y) * w + x0 + x] = 1;
    const vI = rect(sII, x, y) - rect(sI, x, y) ** 2 / area, cov = rect(sIE, x, y) - rect(sI, x, y) * rect(sE, x, y) / area;
    if (vI > area * 6 && cov / Math.sqrt(vI * vE) > nccMin) match[(y0 + y) * w + x0 + x] = 1;
  }
  // erosion: a pixel is trusted background only if all its neighbours (radius er) are matches
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = er; x < w - er; x++) { let ok = 1; for (let d = -er; d <= er && ok; d++) if (!match[y * w + x + d]) ok = 0; tmp[y * w + x] = ok; }
  for (let y = er; y < h - er; y++) for (let x = 0; x < w; x++) { let ok = 1; for (let d = -er; d <= er && ok; d++) if (!tmp[(y + d) * w + x]) ok = 0; out[y * w + x] = ok; }
  return out;
}

export interface HullStats { count: number; volumeMm3: number; min: [number, number, number]; max: [number, number, number]; }

/** Voxel cube above the sheet: X, Y in [-size/2, size/2], Z in [0, size]. */
export class Hull {
  readonly occ: Uint8Array;
  /** Number of views that saw each voxel on known background. A voxel is removed after `votesNeeded` of them. */
  readonly votes: Uint8Array;
  votesNeeded = 2;
  readonly vox: number;
  version = 0;
  constructor(readonly n = 64, readonly size = 150) {
    this.occ = new Uint8Array(n * n * n).fill(1);
    this.votes = new Uint8Array(n * n * n);
    this.vox = size / n;
  }

  center(i: number, j: number, k: number): [number, number, number] {
    return [-this.size / 2 + (i + 0.5) * this.vox, -this.size / 2 + (j + 0.5) * this.vox, (k + 0.5) * this.vox];
  }
  idx(i: number, j: number, k: number): number { return (k * this.n + j) * this.n + i; }

  /** Removes all voxels that project onto known background. Returns the number removed. */
  carve(kf: Keyframe): number {
    const { n, occ, vox, size } = this, { R, t, K, w, h, bg } = kf;
    let removed = 0;
    const margin = 4;
    for (let k = 0; k < n; k++) {
      const z = (k + 0.5) * vox;
      for (let j = 0; j < n; j++) {
        const y = -size / 2 + (j + 0.5) * vox;
        const bx = R[1] * y + R[2] * z + t[0], by = R[4] * y + R[5] * z + t[1], bzz = R[7] * y + R[8] * z + t[2];
        for (let i = 0; i < n; i++) {
          const id = (k * n + j) * n + i;
          if (!occ[id]) continue;
          const x = -size / 2 + (i + 0.5) * vox;
          const zc = R[6] * x + bzz;
          if (zc < 30) continue;
          const u = Math.round(K.f * (R[0] * x + bx) / zc + K.cx - 0.5), v = Math.round(K.f * (R[3] * x + by) / zc + K.cy - 0.5);
          if (u < margin || v < margin || u >= w - margin || v >= h - margin) continue;
          if (bg[v * w + u] && ++this.votes[id] >= this.votesNeeded) { occ[id] = 0; removed++; }
        }
      }
    }
    if (removed) this.version++;
    return removed;
  }

  stats(): HullStats {
    const { n, occ, vox } = this;
    let count = 0; const mn: [number, number, number] = [n, n, n], mxv: [number, number, number] = [-1, -1, -1];
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (occ[(k * n + j) * n + i]) {
      count++;
      if (i < mn[0]) mn[0] = i; if (j < mn[1]) mn[1] = j; if (k < mn[2]) mn[2] = k;
      if (i > mxv[0]) mxv[0] = i; if (j > mxv[1]) mxv[1] = j; if (k > mxv[2]) mxv[2] = k;
    }
    const lo = count ? this.center(mn[0], mn[1], mn[2]) : [0, 0, 0], hi = count ? this.center(mxv[0], mxv[1], mxv[2]) : [0, 0, 0];
    return {
      count, volumeMm3: count * vox ** 3,
      min: [lo[0] - vox / 2, lo[1] - vox / 2, lo[2] - vox / 2], max: [hi[0] + vox / 2, hi[1] + vox / 2, hi[2] + vox / 2],
    };
  }

  /** Cuts everything above a height (mm): the user's TOP trim, since the sheet cannot show background behind tall objects. */
  trimTop(zMm: number): number {
    const { n, occ, vox } = this;
    let removed = 0;
    for (let k = Math.max(0, Math.ceil(zMm / vox)); k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const id = (k * n + j) * n + i; if (occ[id]) { occ[id] = 0; removed++; } }
    if (removed) this.version++;
    return removed;
  }

  /** Resets to a full cube (for a new scan). */
  reset(): void { this.occ.fill(1); this.votes.fill(0); this.version++; }

  /** Keeps connected parts (6-neighbourhood) that touch the sheet and hold at least 10% of the largest one; floating leftovers go. */
  keepLargest(): number {
    const { n, occ } = this, label = new Int32Array(n * n * n), stack: number[] = [];
    let best = 0, id = 0;
    const sizes: number[] = [0], touches: boolean[] = [false];
    for (let s = 0; s < occ.length; s++) {
      if (!occ[s] || label[s]) continue;
      id++; let size = 0, touch = false; stack.push(s); label[s] = id;
      while (stack.length) {
        const p = stack.pop()!, i = p % n, j = ((p / n) | 0) % n, k = (p / (n * n)) | 0;
        size++; if (k === 0) touch = true;
        for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const a = i + di, b = j + dj, c = k + dk;
          if (a < 0 || b < 0 || c < 0 || a >= n || b >= n || c >= n) continue;
          const q = (c * n + b) * n + a;
          if (occ[q] && !label[q]) { label[q] = id; stack.push(q); }
        }
      }
      sizes.push(size); touches.push(touch); if (touch && size > best) best = size;
    }
    let removed = 0;
    for (let s = 0; s < occ.length; s++) if (occ[s] && !(touches[label[s]] && sizes[label[s]] >= 0.1 * best)) { occ[s] = 0; removed++; }
    if (removed) this.version++;
    return removed;
  }

  /**
   * Photo-consistency carving of the surface voxels (space carving): a surface voxel that several cameras see
   * unobstructed must look the same in all of them; if the views disagree (they see different things behind it), it is
   * empty space. This trims what the silhouettes cannot (the free space above a flat top). Returns voxels removed.
   */
  refine(kfs: Keyframe[], opt: { std?: number; minViews?: number; passes?: number } = {}): number {
    const std = opt.std ?? 24, minViews = opt.minViews ?? 4, passes = opt.passes ?? 12, { n, occ } = this;
    const usable = kfs.filter((k) => k.gray);
    let total = 0;
    for (let pass = 0; pass < passes; pass++) {
      const kill: number[] = [];
      for (let k = 1; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const id = (k * n + j) * n + i;
        if (!occ[id]) continue;
        const exposed = (i === 0 || !occ[id - 1]) || (i === n - 1 || !occ[id + 1]) || (j === 0 || !occ[id - n]) || (j === n - 1 || !occ[id + n]) || (k === n - 1 || !occ[id + n * n]) || !occ[id - n * n];
        if (!exposed) continue;
        const c = this.center(i, j, k), vals: number[] = [];
        for (const kf of usable) {
          const xc = kf.R[0] * c[0] + kf.R[1] * c[1] + kf.R[2] * c[2] + kf.t[0], yc = kf.R[3] * c[0] + kf.R[4] * c[1] + kf.R[5] * c[2] + kf.t[1], zc = kf.R[6] * c[0] + kf.R[7] * c[1] + kf.R[8] * c[2] + kf.t[2];
          if (zc < 30) continue;
          const u = kf.K.f * xc / zc + kf.K.cx - 0.5, v = kf.K.f * yc / zc + kf.K.cy - 0.5;
          if (u < 3 || v < 3 || u > kf.w - 4 || v > kf.h - 4) continue;
          if (this.occludedFrom(c, kf.center, id)) continue;
          const g = kf.gray!, x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, o = y0 * kf.w + x0;
          const val = (g[o] * (1 - fx) + g[o + 1] * fx) * (1 - fy) + (g[o + kf.w] * (1 - fx) + g[o + kf.w + 1] * fx) * fy;
          vals.push(val / (kf.gain ?? 1));
        }
        if (vals.length < minViews) continue;
        const m = vals.reduce((a, b) => a + b, 0) / vals.length, sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
        if (sd > std) kill.push(id);
      }
      for (const id of kill) occ[id] = 0;
      total += kill.length;
      if (!kill.length) break;
    }
    if (total) this.version++;
    return total;
  }

  /** Is the line from the voxel centre to the camera blocked by another occupied voxel? */
  private occludedFrom(p: [number, number, number], cam: [number, number, number], self: number): boolean {
    const dx = cam[0] - p[0], dy = cam[1] - p[1], dz = cam[2] - p[2], l = Math.hypot(dx, dy, dz), st = this.vox * 0.5, { n, size, vox } = this;
    const steps = Math.min(400, Math.floor(l / st));
    for (let s = 1; s < steps; s++) {
      const x = p[0] + (dx / l) * st * s, y = p[1] + (dy / l) * st * s, z = p[2] + (dz / l) * st * s;
      const i = Math.floor((x + size / 2) / vox), j = Math.floor((y + size / 2) / vox), k = Math.floor(z / vox);
      if (i < 0 || j < 0 || k < 0 || i >= n || j >= n || k >= n) { if (z >= size || Math.abs(x) > size / 2 + vox || Math.abs(y) > size / 2 + vox) return false; continue; }
      const id = (k * n + j) * n + i;
      if (id !== self && this.occ[id] && s > 2) return true;
    }
    return false;
  }

  /** Exposed voxel faces as triangles (board mm). The bottom (z = 0) is not drawn. Colors from the keyframes. */
  mesh(kfs: Keyframe[]): { positions: Float32Array; colors: Float32Array; normals: Float32Array } {
    const { n, occ, vox } = this;
    const pos: number[] = [], col: number[] = [], nor: number[] = [];
    const get = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= n || j >= n || k >= n ? 0 : occ[(k * n + j) * n + i]);
    const dirs: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (!occ[(k * n + j) * n + i]) continue;
      for (const d of dirs) {
        if (get(i + d[0], j + d[1], k + d[2])) continue;
        if (d[2] === -1 && k === 0) continue;
        const c = this.center(i, j, k), h = vox / 2;
        // two tangent axes
        const a: [number, number, number] = d[0] ? [0, 1, 0] : d[1] ? [0, 0, 1] : [1, 0, 0], b: [number, number, number] = d[0] ? [0, 0, 1] : d[1] ? [1, 0, 0] : [0, 1, 0];
        const f: [number, number, number] = [c[0] + d[0] * h, c[1] + d[1] * h, c[2] + d[2] * h];
        const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [f[0] + (a[0] * s + b[0] * t) * h, f[1] + (a[1] * s + b[1] * t) * h, f[2] + (a[2] * s + b[2] * t) * h]);
        const rgb = this.faceColor(f, d, kfs);
        for (const idx of [0, 1, 2, 0, 2, 3]) { pos.push(...q[idx]); col.push(...rgb); nor.push(...d); }
      }
    }
    return { positions: new Float32Array(pos), colors: new Float32Array(col), normals: new Float32Array(nor) };
  }

  /** Color of a face from the keyframe that looks at it most frontally and sees it unobstructed. */
  private faceColor(p: [number, number, number], nrm: [number, number, number], kfs: Keyframe[]): [number, number, number] {
    let best = -1, bi = -1;
    const order = kfs.map((kf, i) => {
      const dx = kf.center[0] - p[0], dy = kf.center[1] - p[1], dz = kf.center[2] - p[2], l = Math.hypot(dx, dy, dz);
      return { i, s: (dx * nrm[0] + dy * nrm[1] + dz * nrm[2]) / l };
    }).filter((o) => o.s > 0.2).sort((a, b) => b.s - a.s).slice(0, 4);
    for (const o of order) {
      const kf = kfs[o.i];
      if (this.occluded(p, nrm, kf.center)) continue;
      if (o.s > best) { best = o.s; bi = o.i; }
      break;
    }
    if (bi < 0) return [0.55, 0.55, 0.55];
    const kf = kfs[bi], R = kf.R, t = kf.t;
    const xc = R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + t[0], yc = R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + t[1], zc = R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + t[2];
    const sx = kf.cw / kf.w, sy = kf.ch / kf.h;
    const u = Math.max(0, Math.min(kf.cw - 1, Math.round((kf.K.f * xc / zc + kf.K.cx) * sx - 0.5))), v = Math.max(0, Math.min(kf.ch - 1, Math.round((kf.K.f * yc / zc + kf.K.cy) * sy - 0.5)));
    const o = (v * kf.cw + u) * 4;
    return [kf.color[o] / 255, kf.color[o + 1] / 255, kf.color[o + 2] / 255];
  }

  private occluded(p: [number, number, number], nrm: [number, number, number], cam: [number, number, number]): boolean {
    const dx = cam[0] - p[0], dy = cam[1] - p[1], dz = cam[2] - p[2], l = Math.hypot(dx, dy, dz), st = this.vox * 0.6, steps = Math.min(200, Math.floor(l / st));
    const { n, size, vox } = this;
    for (let s = 2; s < steps; s++) {
      const x = p[0] + nrm[0] * vox * 0.5 + (dx / l) * st * s, y = p[1] + nrm[1] * vox * 0.5 + (dy / l) * st * s, z = p[2] + nrm[2] * vox * 0.5 + (dz / l) * st * s;
      const i = Math.floor((x + size / 2) / vox), j = Math.floor((y + size / 2) / vox), k = Math.floor(z / vox);
      if (i < 0 || j < 0 || k < 0 || i >= n || j >= n || k >= n) { if (z > size || Math.abs(x) > size / 2 + vox || Math.abs(y) > size / 2 + vox) return false; continue; }
      if (this.occ[(k * n + j) * n + i]) return true;
    }
    return false;
  }

  /** ASCII PLY with vertex colors (triangle soup). */
  toPly(kfs: Keyframe[], comments: string[] = []): string {
    const m = this.mesh(kfs), nv = m.positions.length / 3;
    const lines = ['ply', 'format ascii 1.0', ...comments.map((c) => `comment ${c}`), `element vertex ${nv}`, 'property float x', 'property float y', 'property float z',
      'property uchar red', 'property uchar green', 'property uchar blue', `element face ${nv / 3}`, 'property list uchar int vertex_indices', 'end_header'];
    for (let i = 0; i < nv; i++) lines.push(`${m.positions[i * 3].toFixed(2)} ${m.positions[i * 3 + 1].toFixed(2)} ${m.positions[i * 3 + 2].toFixed(2)} ${Math.round(m.colors[i * 3] * 255)} ${Math.round(m.colors[i * 3 + 1] * 255)} ${Math.round(m.colors[i * 3 + 2] * 255)}`);
    for (let i = 0; i < nv; i += 3) lines.push(`3 ${i} ${i + 1} ${i + 2}`);
    return lines.join('\n');
  }
}
