import { DICT_4X4_50, codeBits, Pt } from './aruco';

/**
 * The scan sheet: ArUco markers in a ring around an empty centre, everything else covered with a smooth speckle
 * pattern. Board coordinates (mm): origin = sheet centre, X right, Y up the paper, Z up from the paper.
 * The speckle pattern is known exactly, so every camera image can be compared with the EXPECTED image of the sheet:
 * where they differ, something else (the object) is in front of the paper.
 */
export type Paper = 'A4' | 'Letter';
export const PAPER_MM: Record<Paper, [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4] };

export const MARKER_MM = 28;          // black square side
const QUIET_MM = 5;                   // white margin around each marker
const EDGE_MM = 8;                    // distance of the markers to the paper edge (printers cannot print closer than ~5 mm)

export interface BoardMarker { id: number; cx: number; cy: number; }

export interface Layout {
  paper: Paper; w: number; h: number;
  markers: BoardMarker[];
  /** Zone in the middle that is kept free for the object (half sizes, mm). */
  freeX: number; freeY: number;
}

export function makeLayout(paper: Paper): Layout {
  const [w, h] = PAPER_MM[paper], m = MARKER_MM;
  const xr = w / 2 - EDGE_MM - m / 2, yr = h / 2 - EDGE_MM - m / 2;
  const markers: BoardMarker[] = [];
  let id = 0;
  for (const y of [yr, -yr]) for (let i = 0; i < 4; i++) markers.push({ id: id++, cx: -xr + (2 * xr * i) / 3, cy: y });
  for (const x of [-xr, xr]) for (let i = 1; i <= 3; i++) markers.push({ id: id++, cx: x, cy: -yr + (2 * yr * i) / 4 });
  return { paper, w, h, markers, freeX: xr - m / 2 - QUIET_MM, freeY: yr - m / 2 - QUIET_MM - 26 };
}

/** Marker corners in board mm: printed TL, TR, BR, BL (Y up the paper). */
export function markerCorners(mk: BoardMarker): Pt[] {
  const r = MARKER_MM / 2;
  return [[mk.cx - r, mk.cy + r], [mk.cx + r, mk.cy + r], [mk.cx + r, mk.cy - r], [mk.cx - r, mk.cy - r]];
}

// ---- speckle texture: smooth value noise around 5 mm, deterministic ----
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx) * (1 - sy) + (hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx) * sy;
}
/** Gray value 105..235 at a board position. */
export function speckle(xmm: number, ymm: number): number {
  const n = 0.55 * vnoise(xmm / 5.5 + 100, ymm / 5.5) + 0.3 * vnoise(xmm / 2.8 + 7, ymm / 2.8 + 31) + 0.15 * vnoise(xmm / 11 + 3, ymm / 11 + 9);
  return 105 + 130 * Math.min(1, Math.max(0, (n - 0.2) / 0.6));
}

/** Gray value of the finished sheet at a board position (white outside the paper). */
export function sheetValue(L: Layout, x: number, y: number): number {
  if (Math.abs(x) > L.w / 2 || Math.abs(y) > L.h / 2) return 255;
  const r = MARKER_MM / 2;
  for (const mk of L.markers) {
    const dx = x - mk.cx, dy = y - mk.cy;
    if (Math.abs(dx) < r + QUIET_MM && Math.abs(dy) < r + QUIET_MM) {
      if (Math.abs(dx) >= r || Math.abs(dy) >= r) return 255;           // quiet zone
      const cell = MARKER_MM / 6, col = Math.min(5, Math.floor((dx + r) / cell)), row = Math.min(5, Math.floor((r - dy) / cell));
      if (row === 0 || row === 5 || col === 0 || col === 5) return 18;  // black border
      return codeBits(DICT_4X4_50[mk.id])[row - 1][col - 1] ? 240 : 18;
    }
  }
  // 100 mm scale bar (outside the object zone) to check the print size
  if (Math.abs(y - (L.h / 2 - 52)) < 1.2 && Math.abs(x) < 50) return 18;
  if (Math.abs(y - (L.h / 2 - 52)) < 4 && (Math.abs(Math.abs(x) - 50) < 0.6)) return 18;
  return speckle(x, y);
}

export interface SheetBitmap { data: Uint8Array; w: number; h: number; pxPerMm: number; }

/** Rasterizes the sheet (used for the "expected image" and in tests). */
export function renderSheet(L: Layout, pxPerMm = 3): SheetBitmap {
  const w = Math.round(L.w * pxPerMm), h = Math.round(L.h * pxPerMm), data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[j * w + i] = sheetValue(L, (i + 0.5) / pxPerMm - L.w / 2, L.h / 2 - (j + 0.5) / pxPerMm);
  return { data, w, h, pxPerMm };
}

/** Bilinear lookup in the bitmap at a board position. */
export function sampleSheet(B: SheetBitmap, L: Layout, x: number, y: number): number {
  const fx = (x + L.w / 2) * B.pxPerMm - 0.5, fy = (L.h / 2 - y) * B.pxPerMm - 0.5;
  if (fx < 0 || fy < 0 || fx > B.w - 1.001 || fy > B.h - 1.001) return 255;
  const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, i = y0 * B.w + x0, d = B.data;
  return (d[i] * (1 - ax) + d[i + 1] * ax) * (1 - ay) + (d[i + B.w] * (1 - ax) + d[i + B.w + 1] * ax) * ay;
}

/** Printable PNG at 300 dpi: the speckle is drawn from a small bitmap and smoothed, markers are crisp vectors. */
export function drawPrintable(L: Layout, canvas: HTMLCanvasElement): void {
  const k = 300 / 25.4;                                    // px per mm
  canvas.width = Math.round(L.w * k); canvas.height = Math.round(L.h * k);
  const ctx = canvas.getContext('2d')!;
  const small = renderSheet(L, 3), sc = document.createElement('canvas');
  sc.width = small.w; sc.height = small.h;
  const sctx = sc.getContext('2d')!, img = sctx.createImageData(small.w, small.h);
  for (let i = 0; i < small.data.length; i++) { const v = small.data[i]; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sc, 0, 0, canvas.width, canvas.height);
  const X = (x: number) => (x + L.w / 2) * k, Y = (y: number) => (L.h / 2 - y) * k, r = MARKER_MM / 2, cell = MARKER_MM / 6;
  for (const mk of L.markers) {
    ctx.fillStyle = '#fff'; ctx.fillRect(X(mk.cx - r - QUIET_MM), Y(mk.cy + r + QUIET_MM), (MARKER_MM + 2 * QUIET_MM) * k, (MARKER_MM + 2 * QUIET_MM) * k);
    ctx.fillStyle = '#121212'; ctx.fillRect(X(mk.cx - r), Y(mk.cy + r), MARKER_MM * k, MARKER_MM * k);
    const bits = codeBits(DICT_4X4_50[mk.id]);
    ctx.fillStyle = '#f0f0f0';
    for (let rr = 0; rr < 4; rr++) for (let cc = 0; cc < 4; cc++) if (bits[rr][cc]) ctx.fillRect(X(mk.cx - r + (cc + 1) * cell), Y(mk.cy + r - (rr + 1) * cell), cell * k + 0.5, cell * k + 0.5);
  }
  ctx.fillStyle = '#121212';
  ctx.fillRect(X(-50), Y(L.h / 2 - 52 + 1.2), 100 * k, 2.4 * k);
  ctx.fillRect(X(-50.6), Y(L.h / 2 - 52 + 4), 1.2 * k, 8 * k);
  ctx.fillRect(X(49.4), Y(L.h / 2 - 52 + 4), 1.2 * k, 8 * k);
}
