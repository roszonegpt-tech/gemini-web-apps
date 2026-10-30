// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Options {
  area?: { x: number; y: number; w: number; h: number };
  ground?: number | ((x: number) => number);
  leaves?: number;
  colors?: [string, string, string, string][];
  drift?: number;
  litter?: boolean;
  seed?: number;
}
export default function fallingLeaves(o: Options = {}) {
  const A = o.area ?? { x: 300, y: 230, w: 680, h: 370 }, X0 = A.x, X1 = A.x + A.w, TOP = A.y;
  const groundAt = (x: number) => (o.ground === undefined ? A.y + A.h : typeof o.ground === "number" ? o.ground : o.ground(x));
  const R = new Rng(o.seed ?? 1), DRIFT = o.drift ?? 12;
  const pals = (o.colors ?? PALETTES).map((p) => { const [L, B, S, D] = p.map(hex) as [number, number, number, number]; return { L, B, S, D, R: S, T: D } });
  const LEAVES = SHAPES.map((rows) => pals.map((p) => sprite(rows, p)));
  const leaves: Leaf[] = [];
  const reset = (l: Leaf, top: boolean) => {
    l.x0 = R.range(X0 - 40, X1);
    l.y = top ? TOP - R.range(0, 40) : R.range(TOP, groundAt(l.x0) - 20);
    l.vy = R.range(34, 56);
    l.amp = R.range(14, 34);
    l.w = R.range(1.8, 2.8);
    l.ph = R.range(0, TAU);
    l.flip = R.range(0, TAU);
    l.near = R.chance(0.35);
    l.shape = R.int(0, 2);
    l.pal = R.int(0, pals.length - 1);
    l.rest = -1;
    l.ang = 0;
    l.x = l.x0;
  };
  for (let i = 0; i < (o.leaves ?? 80); i++) {
    const l: Leaf = { x0: 0, x: 0, y: 0, vy: 0, amp: 0, w: 0, ph: 0, flip: 0, shape: 0, pal: 0, near: false, rest: -1, ang: 0 };
    reset(l, false);
    leaves.push(l);
  }
  const litter = (o.litter ?? true) ? Array.from({ length: 40 }, (_, i) => ({ x: X0 / PX - 20 + hash(i, 1) * ((X1 - X0) / PX + 40), shape: Math.floor(hash(i, 2) * 3), pal: Math.floor(hash(i, 4) * pals.length), ang: (hash(i, 5) - 0.5) * 0.6 })) : [];
  let stopped = false;
  const again = (i: number) => (stopped ? leaves.splice(i, 1) : reset(leaves[i]!, true));
  const draw = (buf: Px, near: boolean) => {
    for (const l of leaves) {
      if (l.near !== near) continue;
      const s = LEAVES[l.shape]![l.pal]!;
      if (l.rest >= 0) blitRot(buf, s, l.x / PX, groundAt(l.x) / PX - s.h / 2 + 1, l.ang * 0.3, Math.min(1, l.rest));
      else blitRot(buf, s, l.x / PX, l.y / PX, l.ang, 1, 0.35 + 0.65 * Math.abs(Math.cos(l.flip)));
    }
  };
  return {
    update(dt: number) {
      for (let i = leaves.length - 1; i >= 0; i--) {
        const l = leaves[i]!;
        if (l.rest >= 0) { if ((l.rest -= dt) < 0) again(i); continue; }
        l.ph += l.w * dt;
        l.x0 += DRIFT * dt;
        l.x = l.x0 + Math.sin(l.ph) * l.amp;
        l.y += l.vy * (0.45 + 0.9 * Math.abs(Math.cos(l.ph))) * dt;
        l.ang = Math.cos(l.ph) * 0.75 + (l.near ? 0 : 0.3);
        l.flip += (hash(Math.floor(l.ph / Math.PI), Math.floor(l.x0)) < 0.25 ? 6 : 0.4) * dt;
        const g = groundAt(l.x);
        if (l.y >= g - 2) { l.y = g - 2; l.rest = R.range(2.5, 5); }
      }
    },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color);
      if (layer !== "front") { for (const l of litter) blitRot(buf, LEAVES[l.shape]![l.pal]!, l.x, groundAt(l.x * PX) / PX - 1, l.ang); draw(buf, false); }
      if (layer !== "back") draw(buf, true);
    },
    stop() { stopped = true; },
    done: () => stopped && leaves.length === 0,
  };
}
interface Leaf {
  x0: number;
  x: number;
  y: number;
  vy: number;
  amp: number;
  w: number;
  ph: number;
  flip: number;
  shape: number;
  pal: number;
  near: boolean;
  rest: number;
  ang: number;
}
const SHAPES = [
  ["......DDDD..", "...DDDLLLBD.", ".DDLLLRLBBBD", "TRRRRRRRRRRD", ".DDBBBBBRSSD", "...DDDSSSSD.", "......DDDD.."],
  ["...DDD...", "..DLLBD..", ".DLLLBBD.", "DLLRBBBSD", "DLBBRBSSD", ".DBBBRSD.", "..DDSSD..", "....T...."],
  [".....D.....", "....DLD....", ".DD.DLD.DD.", ".DLDDLDDLD.", "..DLLLBBD..", "DDDLLRBBDDD", ".DLLBRBSSD.", "..DDBRSDD..", "....DRD....", ".....T....."],
];
const PALETTES: [string, string, string, string][] = [
  ["#ffc86a", "#f08a2a", "#b8521a", "#5e240e"],
  ["#ff8a66", "#d8382a", "#9a1f22", "#470f15"],
  ["#fff09a", "#f0c83a", "#b88a1c", "#5a3f10"],
  ["#c99a62", "#9a6a3b", "#6b4424", "#33200f"],
];
const PX = 2;
class Px {
  w: number; h: number; ox: number; oy: number; data: Uint32Array;
  constructor(f: Frame, data: Uint32Array) { this.w = f.w; this.h = f.h; this.ox = f.ox; this.oy = f.oy; this.data = data; }
  at(x: number, y: number) { x = (x - this.ox) | 0; y = (y - this.oy) | 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  set(x: number, y: number, c: number) { const i = this.at(x, y); if (i >= 0) this.data[i] = c; }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
interface Sprite { w: number; h: number; data: Uint32Array }
function sprite(rows: string[], pal: Record<string, number>): Sprite {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length)), data = new Uint32Array(w * h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && (data[y * w + x] = pal[ch] ?? 0)));
  return { w, h, data };
}
function blitRot(buf: Px, s: Sprite, cx: number, cy: number, ang: number, a = 1, sx = 1) {
  const c = Math.cos(ang), sn = Math.sin(ang), r = Math.ceil(Math.hypot(s.w * Math.abs(sx), s.h) / 2) + 1, px0 = Math.round(cx), py0 = Math.round(cy);
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const u = (c * x + sn * y) / (sx || 1e-3) + s.w / 2, v = -sn * x + c * y + s.h / 2, iu = Math.floor(u), iv = Math.floor(v);
      if (iu < 0 || iv < 0 || iu >= s.w || iv >= s.h) continue;
      const col = s.data[iv * s.w + iu]!, px = px0 + x, py = py0 + y;
      if (!(col >>> 24) || (a < 1 && a <= (BAYER[((py & 3) << 2) | (px & 3)]! + 0.5) / 16)) continue;
      buf.set(px, py, col);
    }
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
  chance(p: number) { return this.next() < p; }
}
const TAU = Math.PI * 2;
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
