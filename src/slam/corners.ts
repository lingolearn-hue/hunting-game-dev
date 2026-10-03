/** Shi-Tomasi corners, spread over a grid (one per cell), avoiding existing points. */
export function detectCorners(img: Uint8Array, w: number, h: number, existing: Array<[number, number]>, maxNew: number, cell = 14, minDist = 9): Array<[number, number]> {
  const n = w * h, ixx = new Float32Array(n), ixy = new Float32Array(n), iyy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, gx = (img[i + 1] - img[i - 1]) * 0.5, gy = (img[i + w] - img[i - w]) * 0.5;
    ixx[i] = gx * gx; ixy[i] = gx * gy; iyy[i] = gy * gy;
  }
  const sum = (src: Float32Array): Float32Array => { // 5x5 box sum, separable
    const tmp = new Float32Array(n), out = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 2; x < w - 2; x++) { const i = y * w + x; tmp[i] = src[i - 2] + src[i - 1] + src[i] + src[i + 1] + src[i + 2]; }
    for (let y = 2; y < h - 2; y++) for (let x = 0; x < w; x++) { const i = y * w + x; out[i] = tmp[i - 2 * w] + tmp[i - w] + tmp[i] + tmp[i + w] + tmp[i + 2 * w]; }
    return out;
  };
  const a = sum(ixx), b = sum(ixy), c = sum(iyy), score = new Float32Array(n);
  let maxS = 0;
  for (let y = 7; y < h - 7; y++) for (let x = 7; x < w - 7; x++) {
    const i = y * w + x, m = (a[i] + c[i]) / 2, d = Math.sqrt(((a[i] - c[i]) / 2) ** 2 + b[i] * b[i]);
    score[i] = (m - d) / 25;
    if (score[i] > maxS) maxS = score[i];
  }
  const thr = Math.max(3, maxS * 0.02);
  const cands: Array<[number, number, number]> = [];
  for (let cy = 0; cy < h; cy += cell) for (let cx = 0; cx < w; cx += cell) {
    let best = 0, bx = -1, by = -1;
    for (let y = cy; y < Math.min(h - 7, cy + cell); y++) for (let x = cx; x < Math.min(w - 7, cx + cell); x++) {
      if (y < 7 || x < 7) continue;
      const s = score[y * w + x];
      if (s > best) { best = s; bx = x; by = y; }
    }
    if (best > thr) cands.push([bx, by, best]);
  }
  cands.sort((p, q) => q[2] - p[2]);
  const out: Array<[number, number]> = [], md2 = minDist * minDist;
  for (const [x, y] of cands) {
    if (out.length >= maxNew) break;
    if (existing.some((e) => (e[0] - x) ** 2 + (e[1] - y) ** 2 < md2)) continue;
    out.push([x, y]);
  }
  return out;
}
