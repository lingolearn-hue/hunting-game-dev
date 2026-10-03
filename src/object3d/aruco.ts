/**
 * ArUco marker detection in plain JS (no OpenCV).
 * Dictionary: OpenCV DICT_4X4_50 (first 50 codes, taken from the OpenCV source), so markers from any online
 * ArUco generator ("4x4 (50, 100, 250, 1000)") are read. 6x6 cells with a black border, 4x4 inner bits.
 * Steps: adaptive threshold -> connected dark components -> convex hull of 16 extreme points -> 4 corners
 * -> sample the 6x6 grid through a homography -> dictionary match (4 rotations, 1 bit error corrected)
 * -> sub-pixel corners by fitting lines to the strongest gradients along each side.
 */
export const DICT_4X4_50 = [46386, 3994, 13101, 39238, 21662, 31181, 40494, 50418, 65242, 53078, 63889, 4519, 3767, 10767, 9393, 9790, 18021, 26112, 27742, 30383, 34443, 45099, 52437, 56706, 65095, 38001, 44260, 42324, 8483, 13423, 17429, 22450, 40655, 61643, 2222, 2345, 6261, 1279, 3574, 7258, 5912, 10792, 12940, 14514, 9448, 12011, 11583, 19300, 20526, 20499];

export type Pt = [number, number];
export interface Marker { id: number; corners: Pt[]; /** printed TL, TR, BR, BL */ bitErrors: number; }

/** 4x4 inner bits of a code (row-major, MSB first, 1 = white). */
export const codeBits = (code: number): number[][] => Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => (code >> (15 - (r * 4 + c))) & 1));
const bitsCode = (b: number[][]): number => { let v = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) v = (v << 1) | b[r][c]; return v; };
/** One anticlockwise 90 degree rotation (as OpenCV stores the rotations). */
const rot1 = (b: number[][]): number[][] => b.map((row, r) => row.map((_, c) => b[c][3 - r]));

export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

/** Homography (3x3 row-major, h33 = 1) mapping 4 source points to 4 destination points. */
export function homography4(src: Pt[], dst: Pt[]): number[] | null {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}
export const applyH = (H: number[], x: number, y: number): Pt => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };

function bilinear(g: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + w] * (1 - fx) + g[i + w + 1] * fx) * fy;
}

const DIRS: Pt[] = Array.from({ length: 16 }, (_, k) => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);

interface Quad { pts: Pt[]; area: number; }

export class ArucoDetector {
  private lookup = new Map<number, { id: number; rot: number; err: number }>();

  /** `ids`: marker ids that may appear (the board's ids); restricting them removes false detections. */
  constructor(ids: number[] = DICT_4X4_50.map((_, i) => i)) {
    for (const id of ids) {
      let b = codeBits(DICT_4X4_50[id]);
      for (let rot = 0; rot < 4; rot++) {
        const code = bitsCode(b);
        this.lookup.set(code, { id, rot, err: 0 });
        for (let k = 0; k < 16; k++) if (!this.lookup.has(code ^ (1 << k))) this.lookup.set(code ^ (1 << k), { id, rot, err: 1 });
        b = rot1(b);
      }
    }
  }

  detect(gray: Uint8Array, w: number, h: number): Marker[] {
    const out: Marker[] = [];
    const seen = new Set<number>();
    for (const q of this.findQuads(gray, w, h)) {
      const m = this.decode(gray, w, h, q);
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      m.corners = this.refine(gray, w, h, m.corners);
      out.push(m);
    }
    return out;
  }

  // ---- quad candidates ----

  private findQuads(gray: Uint8Array, w: number, h: number): Quad[] {
    const win = Math.max(9, Math.round(Math.max(w, h) / 30)) | 1, half = win >> 1, C = 6;
    const iw = w + 1, integ = new Uint32Array(iw * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; integ[(y + 1) * iw + x + 1] = integ[y * iw + x + 1] + row; } }
    const dark = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
        const sum = integ[(y1 + 1) * iw + x1 + 1] - integ[y0 * iw + x1 + 1] - integ[(y1 + 1) * iw + x0] + integ[y0 * iw + x0];
        if (gray[y * w + x] * (x1 - x0 + 1) * (y1 - y0 + 1) < sum - C * (x1 - x0 + 1) * (y1 - y0 + 1)) dark[y * w + x] = 1;
      }
    }
    // connected components (4-neighbourhood) with extreme points along 16 directions
    const stack = new Int32Array(w * h), quads: Quad[] = [];
    const ext = new Float64Array(32), extPt = new Int32Array(32);
    for (let s = 0; s < w * h; s++) {
      if (dark[s] !== 1) continue;
      let sp = 0, area = 0, minx = w, maxx = 0, miny = h, maxy = 0;
      ext.fill(-1e9); dark[s] = 2; stack[sp++] = s;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p / w) | 0;
        area++;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        for (let k = 0; k < 16; k++) { const d = x * DIRS[k][0] + y * DIRS[k][1]; if (d > ext[k]) { ext[k] = d; extPt[k] = p; } }
        if (x > 0 && dark[p - 1] === 1) { dark[p - 1] = 2; stack[sp++] = p - 1; }
        if (x < w - 1 && dark[p + 1] === 1) { dark[p + 1] = 2; stack[sp++] = p + 1; }
        if (y > 0 && dark[p - w] === 1) { dark[p - w] = 2; stack[sp++] = p - w; }
        if (y < h - 1 && dark[p + w] === 1) { dark[p + w] = 2; stack[sp++] = p + w; }
      }
      const bw = maxx - minx + 1, bh = maxy - miny + 1;
      if (area < 120 || bw < 14 || bh < 14 || bw > w * 0.95 || bh > h * 0.95 || bw > 4 * bh || bh > 4 * bw) continue;
      const pts: Pt[] = [];
      for (let k = 0; k < 16; k++) { const p: Pt = [extPt[k] % w, (extPt[k] / w) | 0]; if (!pts.some((q) => q[0] === p[0] && q[1] === p[1])) pts.push(p); }
      const quad = this.toQuad(pts);
      if (quad && area / quad.area > 0.3 && area / quad.area <= 1.05) quads.push(quad);
    }
    return quads;
  }

  private toQuad(pts: Pt[]): Quad | null {
    if (pts.length < 4) return null;
    let hull = convexHull(pts);
    while (hull.length > 4) { // drop the vertex that contributes least area
      let bi = 0, ba = Infinity;
      for (let i = 0; i < hull.length; i++) {
        const a = hull[(i + hull.length - 1) % hull.length], b = hull[i], c = hull[(i + 1) % hull.length];
        const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
        if (ar < ba) { ba = ar; bi = i; }
      }
      hull = hull.filter((_, i) => i !== bi);
    }
    if (hull.length !== 4) return null;
    // clockwise in image coordinates (y down): positive signed area
    let a2 = 0;
    for (let i = 0; i < 4; i++) { const p = hull[i], q = hull[(i + 1) % 4]; a2 += p[0] * q[1] - q[0] * p[1]; }
    if (a2 < 0) hull.reverse();
    const area = Math.abs(a2) / 2;
    const sides = hull.map((p, i) => Math.hypot(hull[(i + 1) % 4][0] - p[0], hull[(i + 1) % 4][1] - p[1]));
    if (Math.min(...sides) < 10 || Math.min(...sides) / Math.max(...sides) < 0.2) return null;
    return { pts: hull, area };
  }

  // ---- decoding ----

  private decode(gray: Uint8Array, w: number, h: number, q: Quad): Marker | null {
    const H = homography4([[0, 0], [6, 0], [6, 6], [0, 6]], q.pts);
    if (!H) return null;
    const vals: number[] = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      let s = 0;
      for (const [dx, dy] of [[0, 0], [-0.2, 0], [0.2, 0], [0, -0.2], [0, 0.2]]) { const [x, y] = applyH(H, c + 0.5 + dx, r + 0.5 + dy); s += bilinear(gray, w, h, x, y); }
      vals.push(s / 5);
    }
    const thr = otsu(vals);
    const bit = (r: number, c: number) => (vals[r * 6 + c] > thr ? 1 : 0);
    let borderErr = 0;
    for (let i = 0; i < 6; i++) borderErr += bit(0, i) + bit(5, i) + (i > 0 && i < 5 ? bit(i, 0) + bit(i, 5) : 0);
    if (borderErr > 1) return null;
    let code = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) code = (code << 1) | bit(r + 1, c + 1);
    const hit = this.lookup.get(code);
    if (!hit) return null;
    // the printed marker appears rotated anticlockwise by hit.rot: printed corner j is our corner (j - rot) mod 4
    const corners: Pt[] = [0, 1, 2, 3].map((j) => q.pts[(j + 4 - hit.rot) % 4]);
    return { id: hit.id, corners, bitErrors: hit.err };
  }

  // ---- sub-pixel corners ----

  private refine(gray: Uint8Array, w: number, h: number, c: Pt[]): Pt[] {
    const lines: Array<{ p: Pt; d: Pt } | null> = [];
    for (let s = 0; s < 4; s++) {
      const a = c[s], b = c[(s + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 18) return c;
      const dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L, nx = -dy, ny = dx;
      const pts: Pt[] = [];
      for (let k = 0; k < 9; k++) {
        const t = 0.15 + (0.7 * k) / 8, cx = a[0] + dx * L * t, cy = a[1] + dy * L * t;
        const prof: number[] = [];
        for (let o = -4; o <= 4.01; o += 0.5) prof.push(bilinear(gray, w, h, cx + nx * o, cy + ny * o));
        let best = 0, bi = -1;
        for (let i = 1; i < prof.length - 1; i++) { const g = Math.abs(prof[i + 1] - prof[i - 1]); if (g > best) { best = g; bi = i; } }
        if (bi < 1 || best < 20) continue;
        const gm = Math.abs(prof[bi] - prof[bi - 2 < 0 ? 0 : bi - 2]), gp = Math.abs(prof[bi + 2 > prof.length - 1 ? prof.length - 1 : bi + 2] - prof[bi]);
        const den = gm - 2 * best + gp, sub = den !== 0 ? 0.5 * (gm - gp) / den * 0.5 : 0; // parabola on the gradient magnitude
        const off = -4 + bi * 0.5 + Math.max(-0.5, Math.min(0.5, sub));
        pts.push([cx + nx * off, cy + ny * off]);
      }
      lines.push(pts.length >= 5 ? fitLine(pts) : null);
    }
    if (lines.some((l) => !l)) return c;
    const out: Pt[] = [];
    for (let i = 0; i < 4; i++) {
      const l1 = lines[(i + 3) % 4]!, l2 = lines[i]!;
      const det = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
      if (Math.abs(det) < 0.2) return c;
      const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / det;
      const p: Pt = [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t];
      if (Math.hypot(p[0] - c[i][0], p[1] - c[i][1]) > 3.5) return c;
      out.push(p);
    }
    return out;
  }
}

function fitLine(pts: Pt[]): { p: Pt; d: Pt } {
  let use = pts;
  for (let pass = 0; pass < 2; pass++) {
    const mx = use.reduce((a, p) => a + p[0], 0) / use.length, my = use.reduce((a, p) => a + p[1], 0) / use.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of use) { sxx += (p[0] - mx) ** 2; sxy += (p[0] - mx) * (p[1] - my); syy += (p[1] - my) ** 2; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), d: Pt = [Math.cos(th), Math.sin(th)];
    if (pass === 1) return { p: [mx, my], d };
    const inl = pts.filter((p) => Math.abs(-(p[0] - mx) * d[1] + (p[1] - my) * d[0]) < 0.8);
    if (inl.length < 5) return { p: [mx, my], d };
    use = inl;
  }
  return { p: [0, 0], d: [1, 0] };
}

function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function otsu(vals: number[]): number {
  const hist = new Array(256).fill(0);
  for (const v of vals) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  const total = vals.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wb = 0, sb = 0, best = -1, thr = 128;
  for (let t = 0; t < 256; t++) {
    wb += hist[t]; if (!wb) continue;
    const wf = total - wb; if (!wf) break;
    sb += t * hist[t];
    const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2;
    if (v > best) { best = v; thr = t + 0.5; }
  }
  return thr;
}
