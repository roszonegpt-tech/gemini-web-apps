// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Options {
  area?: { x: number; y: number; w: number; h: number };
  density?: number;
  colors?: [string, string, string];
  wind?: number;
  layers?: number;
  seed?: number;
}
export default function fog(o: Options = {}) {
  const A = o.area ?? { x: 0, y: 470, w: 1280, h: 150 }, D = o.density ?? 1, WIND = o.wind ?? 22, N = Math.max(1, Math.min(4, o.layers ?? 3));
  const TONES = (o.colors ?? ["#3b3f63", "#5a6185", "#8389a8"]).map(hex);
  const field = bake(o.seed ?? 1);
  const X0 = A.x / PX, X1 = (A.x + A.w) / PX, BOT = (A.y + A.h) / PX, H = A.h / PX;
  let t = 0, stopAt = Infinity, edges = new Float32Array(0), breaths = edges;
  const level = () => clamp(1 - (t - stopAt) / 2.5);
  function bank(buf: Px, d: number, i: number) {
    const top = BOT - H * (1 - 0.62 * d), base = top + (BOT - top) * 0.8, bottom = BOT + H * (0.03 + 0.16 * d);
    const sx = 0.3 + 0.25 * d, sy = 1.5 + 0.8 * d;
    const drift = (t * WIND * (0.4 + 0.8 * d)) / PX, curl = t * (0.6 + 0.5 * d);
    const alpha = (0.2 + 0.16 * d) * D * level(), off = i * 97.3;
    const y0 = Math.max(buf.oy, Math.floor(top)), y1 = Math.min(buf.oy + buf.h - 1, Math.ceil(bottom));
    const x0 = Math.max(buf.ox, Math.floor(X0)), x1 = Math.min(buf.ox + buf.w - 1, Math.ceil(X1));
    if (alpha <= 0.01 || y0 > y1 || x0 > x1) return;
    const crest = mix(TONES[2]!, WHITE, 0.14 + 0.12 * d), dense = 0.6 + 0.5 * D;
    const thick = (P: number, n: number) => (P * 0.72 + (clamp((n - 0.5) * 2.6 + 0.5) - 0.5) * 0.95) * dense;
    const prof = (y: number) => smooth(top, base, y) * (1 - smooth(bottom - 3, bottom + 1, y));
    if (edges.length < x1 - x0 + 1) (edges = new Float32Array(x1 - x0 + 1)), (breaths = new Float32Array(x1 - x0 + 1));
    for (let x = x0; x <= x1; x++) {
      edges[x - x0] = smooth(X0, X0 + 40, x) * (1 - smooth(X1 - 40, X1, x));
      breaths[x - x0] = 2.4 * Math.sin(t * 0.35 + x * 0.013 + i * 1.7);
    }
    for (let y = y0; y <= y1; y++) {
      const p = prof(y), pUp = prof(y - 2);
      if (p <= 0.02) continue;
      let wu = 0;
      for (let x = x0; x <= x1; x++) {
        const edge = edges[x - x0]!;
        if (edge <= 0.02) continue;
        if (((x - x0) & 1) === 0) wu = sample(field, x * 0.35 + curl * 9 + off, y * 0.6 - curl * 3) - 0.5;
        const breath = breaths[x - x0]!, u = x * sx - drift + wu * 30 + off;
        const f = thick(p, sample(field, u, (y + breath) * sy + wu * 12)) * edge;
        const b = (BAYER[((y & 3) << 2) | (x & 3)]! + 0.5) / 16;
        let c = -1;
        if (f > T2 + BW || (f > T2 && (f - T2) / BW > b)) c = 2;
        else if (f > T1 + BW || (f > T1 && (f - T1) / BW > b)) c = 1;
        else if (f > T0 + BW || (f > T0 && (f - T0) / BW > b)) c = 0;
        if (c < 0) continue;
        if (c >= 1 && thick(pUp, sample(field, u, (y - 2 + breath) * sy + wu * 12)) * edge < (c === 2 ? T2 : T1) - 0.03) {
          buf.blend(x, y, crest, alpha * (0.95 + 0.15 * c));
          continue;
        }
        buf.blend(x, y, TONES[c]!, alpha * (0.6 + 0.2 * c));
      }
    }
  }
  return {
    update(dt: number) { t += dt; },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color);
      for (let i = 0; i < N; i++) { if (layer === (N > 1 && i === N - 1 ? "back" : "front")) continue; bank(buf, N === 1 ? 0.5 : i / (N - 1), i); }
    },
    stop() { if (stopAt === Infinity) stopAt = t; },
    done: () => level() <= 0,
  };
}
const T0 = 0.3, T1 = 0.52, T2 = 0.74, BW = 0.07;
const FW = 256, FH = 128;
function bake(seed: number): Float32Array {
  const out = new Float32Array(FW * FH);
  let amp = 0.5, total = 0;
  for (const cells of [4, 8, 16, 32]) {
    const cs = FW / cells, rows = FH / cs;
    const h = (a: number, b: number) => hash((((a % cells) + cells) % cells) + (((b % rows) + rows) % rows) * 1000, seed * 31 + cells);
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const gx = x / cs, gy = y / cs, ix = Math.floor(gx), iy = Math.floor(gy), u = gx - ix, v = gy - iy;
        const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
        const top = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * su, bot = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * su;
        out[y * FW + x]! += (top + (bot - top) * sv) * amp;
      }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}
function sample(f: Float32Array, u: number, v: number) {
  const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y;
  const x0 = x & (FW - 1), x1 = (x0 + 1) & (FW - 1), y0 = y & (FH - 1), y1 = (y0 + 1) & (FH - 1);
  const a = f[y0 * FW + x0]!, b = f[y0 * FW + x1]!, c = f[y1 * FW + x0]!, d = f[y1 * FW + x1]!;
  return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
}
const PX = 2;
class Px {
  w: number; h: number; ox: number; oy: number; data: Uint32Array;
  constructor(f: Frame, data: Uint32Array) { this.w = f.w; this.h = f.h; this.ox = f.ox; this.oy = f.oy; this.data = data; }
  at(x: number, y: number) { x = (x - this.ox) | 0; y = (y - this.oy) | 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  blend(x: number, y: number, c: number, a: number) {
    const i = this.at(x, y);
    if (i < 0) return;
    const d = this.data[i]!, oa = a + ((d >>> 24) / 255) * (1 - a);
    if (oa <= 0) return;
    const k = a / oa, j = 1 - k, r = (c & 255) * k + (d & 255) * j, g = ((c >>> 8) & 255) * k + ((d >>> 8) & 255) * j, b = ((c >>> 16) & 255) * k + ((d >>> 16) & 255) * j;
    this.data[i] = ((oa * 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function rgb(r: number, g: number, b: number, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }
function hex(h: string) { const v = parseInt(h.slice(1), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); }
function mix(c1: number, c2: number, t: number) {
  const u = 1 - t, ch = (c: number, s: number) => (c >>> s) & 255;
  return rgb(ch(c1, 0) * u + ch(c2, 0) * t, ch(c1, 8) * u + ch(c2, 8) * t, ch(c1, 16) * u + ch(c2, 16) * t, ch(c1, 24) * u + ch(c2, 24) * t);
}
const WHITE = hex("#ffffff");
function clamp(v: number, a = 0, b = 1) { return v < a ? a : v > b ? b : v; }
function smooth(a: number, b: number, x: number) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
