import { Slam } from './Slam';
import { V3 } from './vec';

/**
 * Planar structure from the sparse point cloud (Manhattan-world model, gravity = +Y):
 *  - vertical planes (walls) as line segments in the floor plan with a height range,
 *  - horizontal surfaces (table tops, box tops) as oriented rectangles, extruded to the floor (box) or left open (table),
 *  - all directions are snapped to one common right-angle grid when they agree, corners are intersections of walls.
 * Every update re-fits the model on all accumulated points; items are tracked over time (seen / missed),
 * and each camera frame corroborates them: free-space rays must not pass through a surface, and the projected
 * edges must lie on image edges (compared with a shifted control line).
 */
/**
 * `raw` is the geometry fitted to the points; `adj` are corrections measured from image edges (wall: offset, extension of
 * end a, of end b; box: outward shift of the -u, +u, -v, +v sides). The published geometry is raw + adj.
 */
export interface Wall {
  id: number; ax: number; az: number; bx: number; bz: number; y0: number; y1: number;
  support: number; seen: number; missed: number; violations: number; edgeHits: number; edgeTries: number; confirmed: boolean;
  raw: number[]; adj: number[]; votes: number[][];
}
export interface Box {
  id: number; cx: number; cz: number; theta: number; hx: number; hz: number; y0: number; y1: number; table: boolean;
  support: number; seen: number; missed: number; violations: number; edgeHits: number; edgeTries: number; confirmed: boolean;
  raw: number[]; adj: number[]; votes: number[][];
}
type Meta = 'id' | 'seen' | 'missed' | 'violations' | 'edgeHits' | 'edgeTries' | 'confirmed' | 'raw' | 'adj' | 'votes';
type WallBase = Omit<Wall, Meta>;
type BoxBase = Omit<Box, Meta>;
const STEPS = [-0.2, -0.1, 0, 0.1, 0.2];
const zeroVotes = (n: number) => Array.from({ length: n }, () => STEPS.map(() => 0));
export interface Corner { x: number; z: number; y1: number; }
type Item = Wall | Box;

interface P { x: number; z: number; h: number; s: number; }
const DEG = Math.PI / 180;
const wrapPi = (a: number) => { a = a % Math.PI; return a < 0 ? a + Math.PI : a; };            // angle of an undirected line, [0, pi)
const angDiff = (a: number, b: number) => { const d = Math.abs(wrapPi(a) - wrapPi(b)); return Math.min(d, Math.PI - d); };

interface WallCand { dir: number; rho: number; pts: P[]; }
interface RectCand { pts: P[]; y: number; }

export const confidence = (it: Item): number =>
  Math.min(1, it.support / 20) * (0.6 + 0.4 * (it.edgeTries ? it.edgeHits / it.edgeTries : 0.5));

export class StructureTracker {
  walls: Wall[] = [];
  boxes: Box[] = [];
  corners: Corner[] = [];
  /** Dominant wall direction (rad, [0, pi/2)) when the walls share a right-angle grid. */
  manhattan: number | null = null;
  version = 0;
  private nextId = 1;
  private seed = 12345;
  private rnd = () => { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; };

  reset(): void { this.walls = []; this.boxes = []; this.corners = []; this.manhattan = null; this.version++; }

  // ===================== detection =====================

  update(slam: Slam): void {
    const pts: P[] = [];
    for (const m of slam.alivePoints()) {
      const h = m.X[1] - slam.floorY;
      // floor noise must not look like low objects: ignore everything within ~2 sigma of the floor
      if (h > Math.max(0.18, 2 * m.sigma) && h < 3.2 && m.sigma < 0.5) pts.push({ x: m.X[0], z: m.X[2], h, s: m.sigma });
    }
    // 1. horizontal surfaces
    const tops = this.findTops(pts);
    const used = new Set<P>();
    for (const t of tops) for (const p of t.pts) used.add(p);
    // 2. walls from the remaining points (points on box faces are explained by the boxes)
    const rects = tops.map((t) => this.minAreaRect(t.pts, null));
    const rest = pts.filter((p) => !used.has(p) && !rects.some((r, i) => this.insideRect(p, r, 0.18) && p.h <= tops[i].y + 0.12));
    const wallCands = this.findLines(rest);
    // 3. common right-angle grid
    const angles: Array<{ a: number; w: number }> = [];
    for (const w of wallCands) angles.push({ a: w.dir, w: w.pts.length });
    rects.forEach((r, i) => angles.push({ a: r.theta, w: tops[i].pts.length * 0.7 }));
    const strong = angles.filter((a) => a.w >= 12);
    const man = this.dominantAngle(strong);
    if (man !== null) this.manhattan = this.manhattan === null || angDiff(this.manhattan, man) > 10 * DEG ? man : this.blendAngle(this.manhattan, man, 0.35);
    const grid = this.manhattan;

    // 4. final geometry (snapped when the direction fits the grid)
    const newWalls: WallBase[] = [];
    for (const c of wallCands) {
      const dir = grid !== null ? this.snap(c.dir, grid) : c.dir;
      for (const seg of this.wallSegments(c.pts, dir, slam.floorY)) newWalls.push(seg);
    }
    const newBoxes: BoxBase[] = [];
    tops.forEach((t, i) => {
      const r = grid !== null && angDiff(rects[i].theta, grid) % (Math.PI / 2) < 10 * DEG ? this.minAreaRect(t.pts, this.snap(rects[i].theta, grid)) : rects[i];
      const w = r.hx * 2, d = r.hz * 2;
      if (Math.min(w, d) < 0.25 || w * d < 0.12 || Math.max(w, d) > 7) return;
      // table or solid box: points between the floor and the top inside the footprint?
      const below = pts.filter((p) => p.h > 0.15 && p.h < t.y - 0.15 && this.insideRect(p, r, -0.05)).length;
      const table = t.y > 0.4 && below < 0.25 * t.pts.length;
      newBoxes.push({ cx: r.cx, cz: r.cz, theta: r.theta, hx: r.hx, hz: r.hz, y0: slam.floorY, y1: slam.floorY + t.y, table, support: t.pts.length });
    });
    this.mergeWalls(newWalls);
    this.mergeBoxes(newBoxes);
    this.cornersFromWalls();
    this.version++;
  }

  /** Peaks in the height histogram = horizontal surfaces; returned with their points clustered in the floor plan. */
  private findTops(pts: P[]): Array<RectCand> {
    const bin = 0.05, n = 60, counts = new Array(n).fill(0);
    const good = pts.filter((p) => p.s < 0.12 && p.h > 0.3 && p.h < 2.9);   // only well-measured points define a horizontal surface
    for (const p of good) counts[Math.floor(p.h / bin)]++;
    const out: RectCand[] = [];
    for (let it = 0; it < 4; it++) {
      let best = 0, bi = -1;
      for (let i = 1; i < n - 1; i++) { const s = counts[i - 1] + counts[i] + counts[i + 1]; if (s > best) { best = s; bi = i; } }
      if (best < 10) break;
      const centerH = (bi + 0.5) * bin;
      const layer = good.filter((p) => Math.abs(p.h - centerH) < 0.08);
      for (let k = Math.max(0, bi - 3); k <= Math.min(n - 1, bi + 3); k++) counts[k] = 0;
      for (const cl of this.clusters(layer, 0.45)) {
        if (cl.length < 8) continue;
        const y = cl.reduce((a, p) => a + p.h, 0) / cl.length;
        const sd = Math.sqrt(cl.reduce((a, p) => a + (p.h - y) ** 2, 0) / cl.length);
        if (sd > 0.05) continue;                         // not flat
        const r = this.minAreaRect(cl, null), area = 4 * r.hx * r.hz;
        if (area > 8 || cl.length < 14 * area) continue;  // too sparse for its size: scattered noise, not a surface
        const cells = new Set(cl.map((p) => `${Math.floor(p.x / 0.25)},${Math.floor(p.z / 0.25)}`)).size;
        if (cells < 0.3 * area / 0.0625) continue;        // must fill a good part of its rectangle
        out.push({ pts: cl, y });
      }
    }
    return out;
  }

  private clusters(pts: P[], dist: number): P[][] {
    const cell = dist, grid = new Map<string, P[]>(), key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    for (const p of pts) { const k = key(p.x, p.z); (grid.get(k) ?? grid.set(k, []).get(k)!).push(p); }
    const seen = new Set<string>(), out: P[][] = [];
    for (const k of grid.keys()) {
      if (seen.has(k)) continue;
      const st = [k], comp: P[] = []; seen.add(k);
      while (st.length) {
        const kk = st.pop()!; comp.push(...grid.get(kk)!);
        const [ix, iz] = kk.split(',').map(Number);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const nk = `${ix + dx},${iz + dz}`;
          if (grid.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); }
        }
      }
      out.push(comp);
    }
    return out;
  }

  /** Smallest oriented rectangle (fixed angle if given). Extents are trimmed against outliers. */
  private minAreaRect(pts: P[], fixed: number | null): { cx: number; cz: number; theta: number; hx: number; hz: number } {
    const ext = (th: number) => {
      const c = Math.cos(th), s = Math.sin(th), u = pts.map((p) => p.x * c + p.z * s).sort((a, b) => a - b), v = pts.map((p) => -p.x * s + p.z * c).sort((a, b) => a - b);
      const k = pts.length >= 25 ? Math.floor(pts.length * 0.04) : 0;
      return { u0: u[k], u1: u[u.length - 1 - k], v0: v[k], v1: v[v.length - 1 - k] };
    };
    let bestTh = fixed ?? 0, bestA = Infinity;
    if (fixed === null) {
      for (let a = 0; a < 90; a += 3) { const e = ext(a * DEG), A = (e.u1 - e.u0) * (e.v1 - e.v0); if (A < bestA) { bestA = A; bestTh = a * DEG; } }
      for (let a = -3; a <= 3; a++) { const th = bestTh + a * DEG, e = ext(th), A = (e.u1 - e.u0) * (e.v1 - e.v0); if (A < bestA) { bestA = A; bestTh = th; } }
    }
    const e = ext(bestTh), c = Math.cos(bestTh), s = Math.sin(bestTh), um = (e.u0 + e.u1) / 2, vm = (e.v0 + e.v1) / 2;
    return { cx: um * c - vm * s, cz: um * s + vm * c, theta: wrapPi(bestTh), hx: Math.max(0.05, (e.u1 - e.u0) / 2), hz: Math.max(0.05, (e.v1 - e.v0) / 2) };
  }

  private insideRect(p: P, r: { cx: number; cz: number; theta: number; hx: number; hz: number }, margin: number): boolean {
    const c = Math.cos(r.theta), s = Math.sin(r.theta), dx = p.x - r.cx, dz = p.z - r.cz;
    return Math.abs(dx * c + dz * s) < r.hx + margin && Math.abs(-dx * s + dz * c) < r.hz + margin;
  }

  /**
   * RANSAC lines in the floor plan. A hypothesis is scored by its significance: inliers minus what a strip of the same
   * size would contain by chance, so a small clean wall beats a big cluster of clutter.
   */
  private findLines(all: P[]): WallCand[] {
    let rest = all.slice();
    const out: WallCand[] = [];
    const thr = (p: P) => Math.min(0.25, Math.max(0.07, 1.2 * p.s));
    const xs = all.map((p) => p.x), zs = all.map((p) => p.z);
    const area = Math.max(4, (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)));
    const density = all.length / area;
    for (let line = 0; line < 8 && rest.length >= 10; line++) {
      let best = -Infinity, bn: [number, number] = [0, 1], brho = 0;
      for (let it = 0; it < 220; it++) {
        const a = rest[(this.rnd() * rest.length) | 0], b = rest[(this.rnd() * rest.length) | 0];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
        if (l < 0.5) continue;
        const nx = -dz / l, nz = dx / l, rho = nx * a.x + nz * a.z;
        let cnt = 0, s0 = Infinity, s1 = -Infinity;
        for (const p of rest) {
          if (Math.abs(nx * p.x + nz * p.z - rho) < thr(p)) { cnt++; const s = dx / l * p.x + dz / l * p.z; if (s < s0) s0 = s; if (s > s1) s1 = s; }
        }
        if (cnt < 10) continue;
        const score = cnt - 3 * density * (s1 - s0) * 0.24;
        if (score > best) { best = score; bn = [nx, nz]; brho = rho; }
      }
      if (best < 6) break;
      // refine by total least squares, then re-collect inliers
      const seed = rest.filter((p) => Math.abs(bn[0] * p.x + bn[1] * p.z - brho) < thr(p));
      const fit = this.tls(seed);
      bn = [-Math.sin(fit.dir), Math.cos(fit.dir)]; brho = bn[0] * fit.mx + bn[1] * fit.mz;
      const inl = rest.filter((p) => Math.abs(bn[0] * p.x + bn[1] * p.z - brho) < thr(p));
      if (inl.length < 10) break;
      const hs = inl.map((p) => p.h).sort((a, b) => a - b);
      const spread = hs[Math.floor(hs.length * 0.95)] - hs[Math.floor(hs.length * 0.05)];
      const set = new Set(inl);
      rest = rest.filter((p) => !set.has(p));
      if (spread < 0.4) continue;                       // a horizontal row of points is not a wall
      out.push({ dir: fit.dir, rho: brho, pts: inl });
    }
    return out;
  }

  private tls(pts: P[]): { dir: number; mx: number; mz: number } {
    let mx = 0, mz = 0;
    for (const p of pts) { mx += p.x; mz += p.z; }
    mx /= pts.length; mz /= pts.length;
    let sxx = 0, sxz = 0, szz = 0;
    for (const p of pts) { const dx = p.x - mx, dz = p.z - mz; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
    return { dir: wrapPi(0.5 * Math.atan2(2 * sxz, sxx - szz)), mx, mz };
  }

  /** Right-angle grid: circular mean of 4*theta, accepted when at least two items agree. */
  private dominantAngle(items: Array<{ a: number; w: number }>): number | null {
    if (items.length < 2) return null;
    let sx = 0, sy = 0, sw = 0;
    for (const it of items) { sx += it.w * Math.cos(4 * it.a); sy += it.w * Math.sin(4 * it.a); sw += it.w; }
    if (Math.hypot(sx, sy) / sw < 0.75) return null;
    const a = Math.atan2(sy, sx) / 4;
    return ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  }

  private blendAngle(a: number, b: number, k: number): number {
    let d = b - a; while (d > Math.PI / 4) d -= Math.PI / 2; while (d < -Math.PI / 4) d += Math.PI / 2;
    return ((a + k * d) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2);
  }

  /** Snaps a direction to the grid (grid + k*90 deg) when it is within 10 degrees. */
  private snap(a: number, grid: number): number {
    let d = a - grid; d = ((d % (Math.PI / 2)) + Math.PI * 1.5) % (Math.PI / 2) - Math.PI / 4;
    if (Math.abs(d) > 10 * DEG) return a;
    // nearest grid direction, keeping the quadrant
    const k = Math.round((a - grid) / (Math.PI / 2));
    return wrapPi(grid + k * (Math.PI / 2));
  }

  /** Wall segments along a fixed direction: offset from the points, extent along the line, split at gaps. */
  private wallSegments(pts: P[], dir: number, floorY: number): WallBase[] {
    const dx = Math.cos(dir), dz = Math.sin(dir), nx = -dz, nz = dx;
    let wsum = 0, rho = 0;
    for (const p of pts) { const w = 1 / (p.s * p.s); rho += w * (nx * p.x + nz * p.z); wsum += w; }
    rho /= wsum;
    const items = pts.map((p) => ({ s: dx * p.x + dz * p.z, h: p.h })).sort((a, b) => a.s - b.s);
    const out: WallBase[] = [];
    let start = 0;
    for (let i = 1; i <= items.length; i++) {
      if (i < items.length && items[i].s - items[i - 1].s < 1.0) continue;
      const seg = items.slice(start, i); start = i;
      if (seg.length < 10 || seg[seg.length - 1].s - seg[0].s < 0.8) continue;
      const hs = seg.map((q) => q.h).sort((a, b) => a - b);
      if (hs[Math.floor(hs.length * 0.95)] - hs[Math.floor(hs.length * 0.05)] < 0.4) continue;
      const s0 = seg[0].s, s1 = seg[seg.length - 1].s;
      out.push({
        ax: dx * s0 + nx * rho, az: dz * s0 + nz * rho, bx: dx * s1 + nx * rho, bz: dz * s1 + nz * rho,
        y0: floorY + (hs[0] < 0.5 ? 0 : hs[0]), y1: floorY + hs[Math.floor(hs.length * 0.97)], support: seg.length,
      });
    }
    return out;
  }

  // ===================== tracking over time =====================

  private mergeWalls(cands: WallBase[]): void {
    const matched = new Set<Wall>();
    for (const c of cands) {
      const cd = wrapPi(Math.atan2(c.bz - c.az, c.bx - c.ax));
      let best: Wall | null = null, bd = Infinity;
      for (const w of this.walls) {
        if (matched.has(w)) continue;
        const wd = wrapPi(Math.atan2(w.bz - w.az, w.bx - w.ax));
        if (angDiff(cd, wd) > 10 * DEG) continue;
        const nx = -Math.sin(wd), nz = Math.cos(wd);
        const off = Math.abs(nx * ((c.ax + c.bx) / 2 - w.ax) + nz * ((c.az + c.bz) / 2 - w.az));
        const dx = Math.cos(wd), dz = Math.sin(wd), wl = dx * (w.bx - w.ax) + dz * (w.bz - w.az);
        const s0 = dx * (c.ax - w.ax) + dz * (c.az - w.az), s1 = dx * (c.bx - w.ax) + dz * (c.bz - w.az);
        const gap = Math.max(0, Math.min(s0, s1) - wl, 0 - Math.max(s0, s1));
        if (off < 0.3 && gap < 1.2 && off < bd) { bd = off; best = w; }
      }
      if (best) {
        matched.add(best);
        const w = best, keepExt = w.confirmed && c.support >= 0.6 * w.support;
        const dd = Math.atan2(c.bz - c.az, c.bx - c.ax), dx = Math.cos(dd), dz = Math.sin(dd);
        let a = { x: c.ax, z: c.az }, b = { x: c.bx, z: c.bz };
        if (keepExt) { // the wall does not shrink once confirmed: union of the extents along the new line
          const proj = (x: number, z: number) => dx * (x - c.ax) + dz * (z - c.az);
          const cand = [{ x: w.ax, z: w.az }, { x: w.bx, z: w.bz }, a, b];
          cand.sort((p, q) => proj(p.x, p.z) - proj(q.x, q.z));
          const onLine = (p: { x: number; z: number }) => { const t = proj(p.x, p.z); return { x: c.ax + dx * t, z: c.az + dz * t }; };
          a = onLine(cand[0]); b = onLine(cand[3]);
        }
        w.raw = [a.x, a.z, b.x, b.z]; w.y0 = c.y0; w.y1 = keepExt ? Math.max(w.y1, c.y1) : c.y1;
        this.applyWall(w);
        w.support = c.support; w.seen++; w.missed = 0;
        // Rooms are mostly rectangular: a wall off the right-angle grid needs much more evidence
        const wd = Math.atan2(w.bz - w.az, w.bx - w.ax), off = this.manhattan === null ? 0 : Math.min(angDiff(wd - this.manhattan, 0) % (Math.PI / 2), Math.PI / 2 - (angDiff(wd - this.manhattan, 0) % (Math.PI / 2)));
        const need = off > 12 * DEG ? 35 : 15;
        w.confirmed = w.confirmed || (w.seen >= 4 && w.support >= need && Math.hypot(w.bx - w.ax, w.bz - w.az) >= 1.0);
      } else {
        const w: Wall = { ...c, id: this.nextId++, seen: 1, missed: 0, violations: 0, edgeHits: 0, edgeTries: 0, confirmed: false, raw: [c.ax, c.az, c.bx, c.bz], adj: [0, 0, 0], votes: zeroVotes(3) };
        this.walls.push(w); matched.add(w);
      }
    }
    this.walls = this.walls.filter((w) => { if (!matched.has(w)) w.missed++; return w.missed < (w.confirmed ? 25 : 5) && w.violations <= Math.max(8, w.support * 0.6); });
  }

  private mergeBoxes(cands: BoxBase[]): void {
    const matched = new Set<Box>();
    for (const c of cands) {
      let best: Box | null = null, bd = Infinity;
      for (const b of this.boxes) {
        const d = Math.hypot(b.cx - c.cx, b.cz - c.cz);
        if (!matched.has(b) && d < 0.6 && Math.abs(b.y1 - c.y1) < 0.2 && d < bd) { bd = d; best = b; }
      }
      if (best) {
        matched.add(best);
        Object.assign(best, c, { id: best.id, seen: best.seen + 1, missed: 0, raw: [c.cx, c.cz, c.theta, c.hx, c.hz] });
        this.applyBox(best);
        best.confirmed = best.confirmed || (best.seen >= 4 && best.support >= 12);
      } else {
        const b: Box = { ...c, id: this.nextId++, seen: 1, missed: 0, violations: 0, edgeHits: 0, edgeTries: 0, confirmed: false, raw: [c.cx, c.cz, c.theta, c.hx, c.hz], adj: [0, 0, 0, 0], votes: zeroVotes(4) };
        this.boxes.push(b); matched.add(b);
      }
    }
    this.boxes = this.boxes.filter((b) => { if (!matched.has(b)) b.missed++; return b.missed < (b.confirmed ? 25 : 5) && b.violations <= Math.max(8, b.support * 0.6); });
  }

  /** Corners where two walls meet at a right angle; the wall ends are pulled to the corner. */
  private cornersFromWalls(): void {
    this.corners = [];
    const ws = this.walls.filter((w) => w.seen >= 2);
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i], b = ws[j];
      const da = Math.atan2(a.bz - a.az, a.bx - a.ax), db = Math.atan2(b.bz - b.az, b.bx - b.ax);
      if (Math.abs(angDiff(da, db) - Math.PI / 2) > 12 * DEG) continue;
      const ax = Math.cos(da), az = Math.sin(da), bx = Math.cos(db), bz = Math.sin(db);
      const det = ax * bz - az * bx;
      if (Math.abs(det) < 0.3) continue;
      const rx = b.ax - a.ax, rz = b.az - a.az, ta = (rx * bz - rz * bx) / det, tb = (rx * az - rz * ax) / det;
      const la = ax * (a.bx - a.ax) + az * (a.bz - a.az), lb = bx * (b.bx - b.ax) + bz * (b.bz - b.az);
      const nearA = Math.max(0, -ta, ta - la), nearB = Math.max(0, -tb, tb - lb);   // distance outside the segment
      if (nearA > 0.7 || nearB > 0.7) continue;
      const cx = a.ax + ax * ta, cz = a.az + az * ta;
      this.corners.push({ x: cx, z: cz, y1: Math.max(a.y1, b.y1) });
      for (const [w, t, l] of [[a, ta, la], [b, tb, lb]] as Array<[Wall, number, number]>) { // pull the closer end to the corner
        if (t < l / 2) { w.ax = cx; w.az = cz; } else { w.bx = cx; w.bz = cz; }
      }
    }
  }

  // ===================== corroboration by later measurements =====================

  /** Geometry = raw (from points) + adj (from image edges). */
  private applyWall(w: Wall): void {
    const [ax, az, bx, bz] = w.raw, l = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / l, dz = (bz - az) / l, nx = -dz, nz = dx;
    w.ax = ax + nx * w.adj[0] - dx * w.adj[1]; w.az = az + nz * w.adj[0] - dz * w.adj[1];
    w.bx = bx + nx * w.adj[0] + dx * w.adj[2]; w.bz = bz + nz * w.adj[0] + dz * w.adj[2];
  }
  private applyBox(b: Box): void {
    const [cx, cz, th, hx, hz] = b.raw, [u0, u1, v0, v1] = b.adj, c = Math.cos(th), s = Math.sin(th), du = (u1 - u0) / 2, dv = (v1 - v0) / 2;
    b.hx = hx + (u0 + u1) / 2; b.hz = hz + (v0 + v1) / 2; b.theta = th;
    b.cx = cx + du * c - dv * s; b.cz = cz + du * s + dv * c;
  }

  /**
   * Later camera frames correct the model: each adjustable edge (a box side, the wall line, a wall end) is tested at
   * five positions (-20 .. +20 cm) against the image gradients; the position the image prefers over many frames is applied.
   */
  refine(slam: Slam): void {
    for (const w of this.walls) {
      const [ax, az, bx, bz] = [w.ax, w.az, w.bx, w.bz], l = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / l, dz = (bz - az) / l, nx = -dz, nz = dx;
      const cand: Array<(d: number) => Array<[V3, V3]>> = [
        (d) => [[[ax + nx * d, w.y1, az + nz * d], [bx + nx * d, w.y1, bz + nz * d]], [[ax + nx * d, w.y0, az + nz * d], [bx + nx * d, w.y0, bz + nz * d]]],
        (d) => [[[ax - dx * d, w.y0, az - dz * d], [ax - dx * d, w.y1, az - dz * d]]],
        (d) => [[[bx + dx * d, w.y0, bz + dz * d], [bx + dx * d, w.y1, bz + dz * d]]],
      ];
      if (this.vote(slam, w, cand)) this.applyWall(w);
    }
    for (const b of this.boxes) {
      const c = Math.cos(b.theta), s = Math.sin(b.theta), P = (u: number, v: number, y: number): V3 => [b.cx + u * c - v * s, y, b.cz + u * s + v * c];
      const side = (axis: 0 | 1, sign: number) => (d: number): Array<[V3, V3]> => {
        const out: Array<[V3, V3]> = [], ys = b.table ? [b.y1] : [b.y1, b.y0];
        for (const y of ys) {
          if (axis === 0) { const u = sign * (b.hx + d); out.push([P(u, -b.hz, y), P(u, b.hz, y)]); }
          else { const v = sign * (b.hz + d); out.push([P(-b.hx, v, y), P(b.hx, v, y)]); }
        }
        return out;
      };
      if (this.vote(slam, b, [side(0, -1), side(0, 1), side(1, -1), side(1, 1)])) this.applyBox(b);
    }
  }

  /** Returns true if an adjustment was applied. */
  private vote(slam: Slam, it: Item, cands: Array<(d: number) => Array<[V3, V3]>>): boolean {
    let changed = false;
    cands.forEach((f, k) => {
      const scores = STEPS.map((d) => {
        let sum = 0, wsum = 0;
        for (const [p0, p1] of f(d)) { const r = this.scoreSegment(slam, p0, p1); if (r) { sum += r.score * r.weight; wsum += r.weight; } }
        return wsum ? sum / wsum : null;
      });
      if (scores.some((v) => v === null)) return;
      const v = it.votes[k];
      for (let i = 0; i < STEPS.length; i++) v[i] = v[i] * 0.985 + scores[i]!;
      let bi = 0;
      for (let i = 1; i < STEPS.length; i++) if (v[i] > v[bi]) bi = i;
      if (STEPS[bi] !== 0 && v[bi] - v[2] > 1.2 && v[bi] > 0.8 && Math.abs(it.adj[k] + STEPS[bi]) <= 0.8) {
        it.adj[k] += STEPS[bi];
        it.votes[k] = STEPS.map(() => 0);
        changed = true;
      }
    });
    return changed;
  }

  /** Call every processed frame: free-space check against tracked points, image edge check, edge-based refinement. */
  verify(slam: Slam): void {
    this.freeSpace(slam);
    this.refine(slam);
    for (const w of this.walls) this.edgeCheck(slam, w, this.wallEdges(w));
    for (const b of this.boxes) this.edgeCheck(slam, b, this.boxEdges(b));
  }

  wallEdges(w: Wall): Array<[V3, V3]> {
    return [[[w.ax, w.y1, w.az], [w.bx, w.y1, w.bz]], [[w.ax, w.y0, w.az], [w.bx, w.y0, w.bz]], [[w.ax, w.y0, w.az], [w.ax, w.y1, w.az]], [[w.bx, w.y0, w.bz], [w.bx, w.y1, w.bz]]];
  }

  boxCorners(b: Box): Array<[number, number]> {
    const c = Math.cos(b.theta), s = Math.sin(b.theta);
    return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Array<[number, number]>).map(([u, v]) => [b.cx + u * b.hx * c - v * b.hz * s, b.cz + u * b.hx * s + v * b.hz * c]);
  }

  boxEdges(b: Box): Array<[V3, V3]> {
    const q = this.boxCorners(b), out: Array<[V3, V3]> = [];
    for (let i = 0; i < 4; i++) {
      const p = q[i], n = q[(i + 1) % 4];
      out.push([[p[0], b.y1, p[1]], [n[0], b.y1, n[1]]]);
      if (!b.table) { out.push([[p[0], b.y0, p[1]], [n[0], b.y0, n[1]]]); out.push([[p[0], b.y0, p[1]], [p[0], b.y1, p[1]]]); }
    }
    return out;
  }

  /** A point that was seen THROUGH a surface contradicts it. */
  private freeSpace(slam: Slam): void {
    const tr = slam.tracks.filter((t) => t.map >= 0 && slam.map[t.map].alive);
    if (!tr.length) return;
    const c = slam.c;
    for (const t of tr) {
      const X = slam.map[t.map].X, dx = X[0] - c[0], dz = X[2] - c[2], dy = X[1] - c[1];
      for (const w of this.walls) {
        const ex = w.bx - w.ax, ez = w.bz - w.az, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-6) continue;
        const rx = w.ax - c[0], rz = w.az - c[2], tt = (rx * ez - rz * ex) / den, uu = (rx * dz - rz * dx) / den;
        if (tt <= 0.02 || uu < 0.05 || uu > 0.95) continue;
        const dist = Math.hypot(dx, dz);
        if ((1 - tt) * dist < 0.35) continue;            // the point sits on the wall
        const y = c[1] + tt * dy;
        if (y > w.y0 + 0.1 && y < w.y1 - 0.1) w.violations++;
      }
      for (const b of this.boxes) {
        const cs = Math.cos(b.theta), sn = Math.sin(b.theta);
        const lx = (c[0] - b.cx) * cs + (c[2] - b.cz) * sn, lz = -(c[0] - b.cx) * sn + (c[2] - b.cz) * cs;
        const ldx = dx * cs + dz * sn, ldz = -dx * sn + dz * cs;
        const hx = b.hx - 0.08, hz = b.hz - 0.08;
        let t0 = 0, t1 = 0.85, ok = true;
        for (const [o, d, h] of [[lx, ldx, hx], [lz, ldz, hz]] as number[][]) {
          if (Math.abs(d) < 1e-9) { if (Math.abs(o) > h) ok = false; continue; }
          let a = (-h - o) / d, bb = (h - o) / d; if (a > bb) [a, bb] = [bb, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, bb);
        }
        if (ok && t1 > t0 + 0.02) {
          const ym = c[1] + ((t0 + t1) / 2) * dy;
          if (ym > b.y0 + 0.1 && ym < b.y1 - 0.08 && !b.table) b.violations++;
        }
      }
    }
  }

  /**
   * Image evidence: strong gradient across the projected edge, compared with the same line shifted 9 px
   * sideways (so textured surfaces do not count as edges).
   */
  private edgeCheck(slam: Slam, it: Item, edges: Array<[V3, V3]>): void {
    const r = this.measureEdges(slam, edges);
    // recent window (about 50 frames): the model is judged on how well it fits NOW
    it.edgeTries = it.edgeTries * 0.98 + r.tries; it.edgeHits = it.edgeHits * 0.98 + r.hits;
  }

  /** Image evidence for 3D edges in the current frame: how many are visible (tries) and lie on an image edge (hits). */
  measureEdges(slam: Slam, edges: Array<[V3, V3]>): { tries: number; hits: number } {
    const res = { tries: 0, hits: 0 };
    for (const [p0, p1] of edges) {
      const r = this.scoreSegment(slam, p0, p1);
      if (!r) continue;
      res.tries++;
      if (r.score >= 0.2) res.hits++;
    }
    return res;
  }

  /**
   * How much the image supports a 3D edge: fraction of samples along the projected line with a gradient across it,
   * minus the same measure on lines shifted 9 px to both sides (textured surfaces do not count as edges). Null if not visible.
   */
  scoreSegment(slam: Slam, p0: V3, p1: V3): { score: number; weight: number } | null {
    const g = slam.gray;
    if (!g) return null;
    const { w: W, h: H } = slam.size();
    const seg = slam.projectSegment(p0, p1);
    if (!seg) return null;
    const clip = this.clipToImage(seg, W, H);
    if (!clip) return null;
    const [x0, y0, x1, y1] = clip, L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 24) return null;
    const tx = (x1 - x0) / L, ty = (y1 - y0) / L, nx = -ty, ny = tx;
    const hit = (off: number): number => {
      let hits = 0, n = 0;
      for (let s = 3; s < L - 3; s += 3) {
        const px = x0 + tx * s + nx * off, py = y0 + ty * s + ny * off;
        if (px < 4 || py < 4 || px > W - 5 || py > H - 5) continue;
        n++;
        let best = 0;
        for (let o = -1; o <= 1; o++) {
          const qx = Math.round(px + nx * o), qy = Math.round(py + ny * o);
          const gx = (g[qy * W + qx + 1] - g[qy * W + qx - 1]) * 0.5, gy = (g[(qy + 1) * W + qx] - g[(qy - 1) * W + qx]) * 0.5;
          const gn = Math.abs(gx * nx + gy * ny), gt = Math.abs(gx * tx + gy * ty);
          if (gn > 8 && gn > 1.5 * gt) best = 1;
        }
        hits += best;
      }
      return n >= 6 ? hits / n : -1;
    };
    const a = hit(0), b = hit(9), c = hit(-9);
    if (a < 0 || b < 0 || c < 0) return null;
    return { score: a - Math.max(b, c), weight: L / 60 };
  }

  private clipToImage(s: [number, number, number, number], W: number, H: number): [number, number, number, number] | null {
    let [x0, y0, x1, y1] = s, t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - 4], [dx, W - 5 - x0], [-dy, y0 - 4], [dy, H - 5 - y0]] as number[][]) {
      if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; t0 = Math.max(t0, r); } else { if (r < t0) return null; t1 = Math.min(t1, r); }
    }
    return [x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1];
  }
}

/** For export / the game: boxes and walls as plain data. */
export function describe(t: StructureTracker): string[] {
  const out: string[] = [];
  for (const w of t.walls) out.push(`wall ${w.id} (${w.ax.toFixed(2)},${w.az.toFixed(2)})-(${w.bx.toFixed(2)},${w.bz.toFixed(2)}) y ${w.y0.toFixed(2)}..${w.y1.toFixed(2)} support ${w.support}${w.confirmed ? ' confirmed' : ''}`);
  for (const b of t.boxes) out.push(`${b.table ? 'table' : 'box'} ${b.id} center (${b.cx.toFixed(2)},${b.cz.toFixed(2)}) size ${(b.hx * 2).toFixed(2)}x${(b.hz * 2).toFixed(2)} top ${b.y1.toFixed(2)} angle ${(b.theta / DEG).toFixed(0)}${b.confirmed ? ' confirmed' : ''}`);
  return out;
}
