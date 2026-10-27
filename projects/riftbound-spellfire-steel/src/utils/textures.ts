// Procedural canvas textures: the pixel-art ground painter (grass, dirt paths, mud
// trenches, asphalt airfields, stone sanctum tiles …), rune glyph decals and small
// material textures. All textures use nearest filtering for the chunky pixel look.
import * as THREE from 'three';
import type { GroundPaint, LevelData } from '../config/types';
import { hashString } from './rng';
import { pointSegDist } from './math';

export const GROUND_PPU = 8; // texels per world unit

interface MatPalette {
  colors: string[];
  detail?: string[];
  detailRate?: number;
  scale?: number;
  pattern?: 'tiles' | 'slabs' | 'none';
}

const MATS: Record<string, MatPalette> = {
  grass: { colors: ['#4f8a34', '#5e9c3b', '#6bab42', '#7ab84b'], detail: ['#8ccf5a', '#3f7a2c', '#9bd866'], detailRate: 0.06, scale: 7 },
  darkgrass: { colors: ['#3b6d2e', '#467a33', '#52883a', '#3a6a2c'], detail: ['#6ea84a', '#2d5524'], detailRate: 0.05, scale: 6 },
  dirt: { colors: ['#8c5f3c', '#9a6b43', '#a8774b', '#7f5535'], detail: ['#6aa246', '#5e9440', '#b98a5a'], detailRate: 0.035, scale: 5 },
  mud: { colors: ['#4e3826', '#5a412c', '#644a32', '#463221'], detail: ['#3a2a1c', '#6e553b', '#33261a'], detailRate: 0.05, scale: 4 },
  asphalt: { colors: ['#393c42', '#40434a', '#363940', '#45484f'], detail: ['#2c2e33', '#55585f'], detailRate: 0.03, scale: 9 },
  concrete: { colors: ['#86847e', '#8f8d86', '#7c7a74', '#96938b'], detail: ['#6a6862', '#a3a097'], detailRate: 0.03, scale: 8, pattern: 'slabs' },
  stone: { colors: ['#8b87a0', '#958fab', '#7f7b95', '#a09ab5'], detail: ['#6d6884', '#b2acc6'], detailRate: 0.02, scale: 6, pattern: 'tiles' },
  sand: { colors: ['#d6bd86', '#cfb47c', '#dcc592', '#c6aa72'], detail: ['#b89a64', '#e6d3a3'], detailRate: 0.03, scale: 6 },
  crystal: { colors: ['#4e3a78', '#57418a', '#5f4892', '#4a3570'], detail: ['#8a63d8', '#a07ae6'], detailRate: 0.012, scale: 9 },
  scorched: { colors: ['#2c2522', '#352c27', '#28211e', '#3d322b'], detail: ['#5a3b24', '#1d1816'], detailRate: 0.04, scale: 4 },
  rift: { colors: ['#2a1640', '#331b4e', '#241238', '#3b2058'], detail: ['#c25cff', '#ff7bf2', '#7a3cc4'], detailRate: 0.05, scale: 4 },
  paintY: { colors: ['#d9bf3f', '#cfb436', '#e0c84f'], scale: 3 },
  paintW: { colors: ['#d8d8d2', '#cfcfc8', '#e2e2dc'], scale: 3 },
  hazard: { colors: ['#d9b23a', '#2a2a2a'], scale: 1 },
  helipad: { colors: ['#4a4d55', '#50535b'], scale: 8 },
};

export const MAT_IDS = Object.keys(MATS);

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const RGB_CACHE = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = RGB_CACHE.get(hex);
  if (!c) {
    c = hexToRgb(hex);
    RGB_CACHE.set(hex, c);
  }
  return c;
}

/** Paints the level ground into a canvas (also reused by the minimap). */
export function paintGround(level: LevelData): HTMLCanvasElement {
  const [W, H] = level.size;
  const tw = Math.ceil(W * GROUND_PPU), th = Math.ceil(H * GROUND_PPU);
  const seed = hashString(level.id);
  const ids = new Uint8Array(tw * th);
  const base = Math.max(0, MAT_IDS.indexOf(level.theme.ground));
  ids.fill(base);
  for (const p of level.ground) rasterize(p, ids, tw, th, seed);
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(tw, th);
  const data = img.data;
  const pals = MAT_IDS.map((k) => MATS[k]);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const i = y * tw + x;
      const m = ids[i];
      const pal = pals[m];
      const sc = pal.scale || 6;
      const n = valueNoise(x / sc, y / sc, seed + m * 31) * 0.7 + hash2(x, y, seed) * 0.3;
      let col = pal.colors[Math.min(pal.colors.length - 1, Math.floor(n * pal.colors.length))];
      if (pal.detail && hash2(x, y, seed + 7) < (pal.detailRate || 0)) col = pal.detail[Math.floor(hash2(x, y, seed + 9) * pal.detail.length)];
      let [r, g, b] = rgb(col);
      if (pal.pattern === 'tiles') {
        const tx = x % (GROUND_PPU * 2), ty = y % (GROUND_PPU * 2);
        if (tx === 0 || ty === 0) { r *= 0.72; g *= 0.72; b *= 0.75; }
        else if (((Math.floor(x / (GROUND_PPU * 2)) + Math.floor(y / (GROUND_PPU * 2))) & 1) === 0) { r *= 0.94; g *= 0.94; b *= 0.96; }
      } else if (pal.pattern === 'slabs') {
        const tx = x % (GROUND_PPU * 3), ty = y % (GROUND_PPU * 3);
        if (tx === 0 || ty === 0) { r *= 0.8; g *= 0.8; b *= 0.8; }
      } else if (MAT_IDS[m] === 'hazard') {
        const stripe = Math.floor((x + y) / 4) & 1;
        [r, g, b] = rgb(pal.colors[stripe]);
      }
      // soft edge shading where materials meet (fake ambient occlusion)
      if (x > 0 && y > 0 && ids[i - 1] !== m && ids[i - tw] !== m) { r *= 0.85; g *= 0.85; b *= 0.85; }
      const o = i * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function rasterize(p: GroundPaint, ids: Uint8Array, tw: number, th: number, seed: number): void {
  const m = MAT_IDS.indexOf(p.m);
  if (m < 0) return;
  const ppu = GROUND_PPU;
  const edge = (p.edge !== undefined ? p.edge : 0.6) * ppu;
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  let inside: (x: number, y: number) => number; // signed distance in texels (negative = inside)
  if (p.shape === 'rect') {
    const x0 = (p.x || 0) * ppu, y0 = (p.z || 0) * ppu, x1 = x0 + (p.w || 1) * ppu, y1 = y0 + (p.d || 1) * ppu;
    minX = x0 - edge; minY = y0 - edge; maxX = x1 + edge; maxY = y1 + edge;
    inside = (x, y) => Math.max(x0 - x, x - x1, y0 - y, y - y1);
  } else if (p.shape === 'circle' || p.shape === 'ring') {
    const cx = (p.x || 0) * ppu, cy = (p.z || 0) * ppu, r = (p.r || 1) * ppu, r2 = (p.r2 || 0) * ppu;
    minX = cx - r - edge; minY = cy - r - edge; maxX = cx + r + edge; maxY = cy + r + edge;
    inside = p.shape === 'ring'
      ? (x, y) => { const d = Math.hypot(x - cx, y - cy); return Math.max(d - r, r2 - d); }
      : (x, y) => Math.hypot(x - cx, y - cy) - r;
  } else {
    const pts = (p.pts || []).map(([a, b]) => [a * ppu, b * ppu]);
    const half = ((p.width || 2) * ppu) / 2;
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    for (const [a, b] of pts) {
      minX = Math.min(minX, a); minY = Math.min(minY, b); maxX = Math.max(maxX, a); maxY = Math.max(maxY, b);
    }
    minX -= half + edge; minY -= half + edge; maxX += half + edge; maxY += half + edge;
    inside = (x, y) => {
      let best = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = pointSegDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        if (d < best) best = d;
      }
      return best - half;
    };
  }
  const x0 = Math.max(0, Math.floor(minX)), y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(tw - 1, Math.ceil(maxX)), y1 = Math.min(th - 1, Math.ceil(maxY));
  const crisp = p.m === 'paintY' || p.m === 'paintW' || p.m === 'hazard' || p.m === 'helipad';
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = inside(x + 0.5, y + 0.5);
      const jitter = crisp ? 0 : (valueNoise(x / 5, y / 5, seed + 101) - 0.5) * 2 * edge;
      if (d + jitter < 0) ids[y * tw + x] = m;
    }
  }
}

export function canvasTexture(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  return tex;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

const texCache = new Map<string, THREE.Texture>();

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

/** White rune circle on transparent background (tint via material colour). */
export function runeTexture(variant = 0): THREE.Texture {
  return cached(`rune${variant}`, () => {
    const S = 128;
    const [c, g] = makeCanvas(S, S);
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(64, 64, 22, 0, Math.PI * 2); g.stroke();
    const n = variant === 1 ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = 64 + Math.cos(a) * 54, y = 64 + Math.sin(a) * 54;
      g.save();
      g.translate(x, y);
      g.rotate(a + Math.PI / 2);
      g.fillRect(-1, -5, 2, 10);
      g.fillRect(-4, -5 + ((i * 3) % 7), 8, 2);
      g.restore();
    }
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = 64 + Math.cos(a) * 46, y = 64 + Math.sin(a) * 46;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    if (variant !== 1) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        const x = 64 + Math.cos(a) * 46, y = 64 + Math.sin(a) * 46;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  });
}

/** Soft radial blob (blob shadows, glows). */
export function blobTexture(): THREE.Texture {
  return cached('blob', () => {
    const [c, g] = makeCanvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    return t;
  });
}

export function hexTexture(): THREE.Texture {
  return cached('hex', () => {
    const [c, g] = makeCanvas(64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    const r = 8;
    for (let row = -1; row < 6; row++) {
      for (let col = -1; col < 6; col++) {
        const x = col * r * 1.5 * 1.15 + 4, y = row * r * 1.732 + (col % 2 ? r * 0.866 : 0) + 4;
        g.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.stroke();
      }
    }
    const t = canvasTexture(c, true);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
}

/** Tiny pixel textures for props. */
export function propTexture(kind: 'wood' | 'crate' | 'sandbag' | 'hazard' | 'metal' | 'camo' | 'cliff' | 'brick' | 'robe'): THREE.Texture {
  return cached(`prop_${kind}`, () => {
    const S = 16;
    const [c, g] = makeCanvas(S, S);
    const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const seed = hashString(kind);
    const fill = (cols: string[]) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, cols[Math.floor(hash2(x, y, seed) * cols.length)]);
    };
    switch (kind) {
      case 'wood':
        fill(['#a0703f', '#94673a', '#a87a48']);
        for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x++) px(x, y, '#6e4a28');
        break;
      case 'crate':
        fill(['#5d6b3a', '#56633a', '#62703f']);
        g.fillStyle = '#3e4826';
        g.fillRect(0, 0, S, 1); g.fillRect(0, S - 1, S, 1); g.fillRect(0, 0, 1, S); g.fillRect(S - 1, 0, 1, S);
        g.fillStyle = '#c9c18a';
        g.fillRect(5, 7, 6, 2);
        break;
      case 'sandbag':
        fill(['#b9a173', '#c4ad7f', '#ad966a']);
        for (let x = 0; x < S; x++) { px(x, 7, '#8a7550'); px(x, 15, '#8a7550'); }
        for (let y = 0; y < 8; y++) px(7, y, '#8a7550');
        for (let y = 8; y < 16; y++) px(3, y, '#8a7550'), px(11, y, '#8a7550');
        break;
      case 'hazard':
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, Math.floor((x + y) / 4) % 2 ? '#e0b83a' : '#2b2b2b');
        break;
      case 'metal':
        fill(['#6b7078', '#737880', '#646970']);
        px(2, 2, '#9aa0a8'); px(13, 2, '#9aa0a8'); px(2, 13, '#9aa0a8'); px(13, 13, '#9aa0a8');
        break;
      case 'camo':
        fill(['#4f5a35', '#5f6a3e', '#3e4729', '#6b6440']);
        break;
      case 'cliff':
        for (let y = 0; y < S; y++) {
          const band = ['#5a3d2b', '#4a3226', '#6b4a35', '#3d2a22', '#4e3a4f'][Math.floor(y / 3) % 5];
          for (let x = 0; x < S; x++) px(x, y, hash2(x, y, seed) < 0.15 ? '#2e2030' : band);
        }
        break;
      case 'brick':
        fill(['#8e8aa2', '#9893ad', '#837f98']);
        for (let x = 0; x < S; x++) { px(x, 0, '#5f5b72'); px(x, 8, '#5f5b72'); }
        for (let y = 0; y < 8; y++) px(4, y, '#5f5b72');
        for (let y = 8; y < 16; y++) px(12, y, '#5f5b72');
        break;
      case 'robe':
        fill(['#2f4fb0', '#3557bd', '#2b48a3']);
        for (let x = 0; x < S; x++) px(x, 14, '#e7c45a');
        break;
    }
    return canvasTexture(c, true);
  });
}

/** Screen-space cosmic rift sky background. */
export function skyTexture(top: string, bottom: string): THREE.Texture {
  const [c, g] = makeCanvas(256, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, top);
  grd.addColorStop(1, bottom);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(hash2(i, 1, 99) * 256), y = Math.floor(hash2(i, 2, 99) * 256);
    g.fillStyle = hash2(i, 3, 99) < 0.2 ? '#ffd6ff' : 'rgba(255,255,255,0.7)';
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
