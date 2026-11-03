// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Options {
  area?: { x: number; y: number; w: number; h: number };
  ground?: number | ((x: number) => number);
  density?: number;
  wind?: number;
  drift?: boolean;
  seed?: number;
}
export default function snow(o: Options = {}) {
  const A = o.area ?? { x: 300, y: 230, w: 680, h: 370 }, X0 = A.x, X1 = A.x + A.w, TOP = A.y;
  const groundAt = (x: number) => (o.ground === undefined ? A.y + A.h : typeof o.ground === "number" ? o.ground : o.ground(x));
  const R = new Rng(o.seed ?? 1), D = o.density ?? 1, WIND = o.wind ?? 14;
  const flakes: Flake[] = [];
  const reset = (f: Flake, top: boolean) => {
    f.x = R.range(X0 - 60, X1);
    f.y = top ? TOP - R.range(0, 40) : R.range(TOP, groundAt(f.x));
    f.vy = FALL[f.layer]! * R.range(0.75, 1.25);
    f.sway = SWAY[f.layer]! * R.range(0.6, 1.2);
    f.f = R.range(0.8, 1.8);
    f.ph = R.range(0, TAU);
    f.rest = -1;
    f.kind = R.int(0, 2);
  };
  for (const [layer, n] of [[0, 260], [1, 150], [2, 30]] as const)
    for (let i = 0; i < Math.round(n * D); i++) {
      const f: Flake = { x: 0, y: 0, vy: 0, sway: 0, f: 0, ph: 0, layer, rest: -1, kind: 0 };
      reset(f, false);
      flakes.push(f);
    }
  let t = 0, stopped = false;
  const again = (i: number) => (stopped ? flakes.splice(i, 1) : reset(flakes[i]!, true));
  const draw = (buf: Px, layer: number) => {
    for (const f of flakes) {
      if (f.layer !== layer) continue;
      const x = f.x / PX, y = f.y / PX;
      if (f.rest >= 0) {
        const a = Math.min(1, f.rest / 0.8), fy = groundAt(f.x) / PX;
        dot(buf, x, fy - 1, FLAKE.W, a);
        if (layer === 2) { dot(buf, x - 1, fy - 1, FLAKE.w, a); dot(buf, x + 1, fy - 1, FLAKE.b, a); }
        continue;
      }
      if (layer === 0) dot(buf, x, y, hash(Math.floor(f.ph * 100), 1) < 0.5 ? FLAKE.d : FLAKE.b);
      else if (layer === 1) {
        dot(buf, x, y, FLAKE.W);
        dot(buf, x + 1, y, FLAKE.w);
        dot(buf, x, y + 1, FLAKE.w);
        dot(buf, x + 1, y + 1, FLAKE.b);
      } else blitC(buf, CRYSTAL[f.kind === 2 ? 2 : Math.floor(t * 3 + f.ph) & 1]!, x, y);
    }
  };
  return {
    update(dt: number) {
      t += dt;
      const wind = WIND + 16 * noise(t * 0.3, 5);
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i]!;
        if (f.rest >= 0) { if ((f.rest -= dt) < 0) again(i); continue; }
        f.y += f.vy * dt;
        f.x += (wind * (0.5 + f.layer * 0.4) + Math.cos(t * f.f + f.ph) * f.sway) * dt;
        const g = groundAt(f.x);
        if (f.y >= g - 1) { if (f.layer === 0) again(i); else { f.y = g - 1; f.rest = R.range(1, 2.6); } continue; }
        if (f.layer === 0 && f.y > g - 30 && hash(Math.floor(f.ph * 1000)) < 0.4) { again(i); continue; }
        if (f.x > X1 + 40) f.x -= X1 - X0 + 100;
      }
    },
    draw(fr: Frame, layer?: Layer) {
      const buf = new Px(fr, fr.color);
      if (layer !== "front") {
        draw(buf, 0);
        if (o.drift ?? true)
          for (let x = Math.floor(X0 / PX) - 30; x < Math.ceil(X1 / PX) + 30; x++) {
            const fy = Math.round(groundAt(x * PX) / PX), h = 1 + Math.round(1.6 + noise(x * 0.09, 11) * 1.4 + noise(x * 0.31, 12) * 0.6);
            for (let r = 0; r < h; r++) buf.set(x, fy - 1 - r, r === h - 1 ? DRIFT[0]! : DRIFT[1]!);
            buf.set(x, fy, DRIFT[2]!);
            if (hash(x, 13) < 0.3) buf.set(x, fy + 1, DRIFT[2]!);
          }
        draw(buf, 1);
      }
      if (layer !== "back") draw(buf, 2);
    },
    stop() { stopped = true; },
    done: () => stopped && flakes.length === 0,
  };
}
interface Flake { x: number; y: number; vy: number; sway: number; f: number; ph: number; layer: number; rest: number; kind: number }
const FALL = [26, 52, 86], SWAY = [8, 16, 30];
const FLAKE = { W: hex("#ffffff"), w: hex("#e3edff"), b: hex("#9fb1e6"), d: hex("#6c7cb8") };
const CRYSTAL = [
  sprite(["...b...", ".b.w.b.", "..bwb..", "bwwWwwb", "..bwb..", ".b.w.b.", "...b..."], FLAKE),
  sprite(["b..b..b", ".b.w.b.", "..wWw..", "bwWWWwb", "..wWw..", ".b.w.b.", "b..b..b"], FLAKE),
  sprite(["..b..", ".bwb.", "bwWwb", ".bwb.", "..b.."], FLAKE),
];
const DRIFT = [hex("#e9f0ff"), hex("#c3cff0"), hex("#8e9ccc")];
const PX = 2;
class Px {
  w: number; h: number; ox: number; oy: number; data: Uint32Array;
  constructor(f: Frame, data: Uint32Array) { this.w = f.w; this.h = f.h; this.ox = f.ox; this.oy = f.oy; this.data = data; }
  at(x: number, y: number) { x = (x - this.ox) | 0; y = (y - this.oy) | 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  set(x: number, y: number, c: number) { const i = this.at(x, y); if (i >= 0) this.data[i] = c; }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function dot(buf: Px, x: number, y: number, c: number, a = 1) {
  const px = Math.floor(x), py = Math.floor(y);
  if (a >= 1 || a > (BAYER[((py & 3) << 2) | (px & 3)]! + 0.5) / 16) buf.set(px, py, c);
}
interface Sprite { w: number; h: number; data: Uint32Array }
function sprite(rows: string[], pal: Record<string, number>): Sprite {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length)), data = new Uint32Array(w * h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && (data[y * w + x] = pal[ch] ?? 0)));
  return { w, h, data };
}
function blitC(buf: Px, s: Sprite, cx: number, cy: number) {
  const x0 = Math.round(cx - s.w / 2), y0 = Math.round(cy - s.h / 2);
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) { const c = s.data[y * s.w + x]!; if (c >>> 24) buf.set(x0 + x, y0 + y, c); }
}
function hex(h: string) { const v = parseInt(h.slice(1), 16); return (255 << 24) | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255); }
class Rng {
  private s: number;
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
}
const TAU = Math.PI * 2;
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
function noise(x: number, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i, seed) * 2 - 1 + (hash(i + 1, seed) - hash(i, seed)) * 2 * u;
}
