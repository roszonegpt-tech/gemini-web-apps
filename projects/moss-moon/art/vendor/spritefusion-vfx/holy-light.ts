// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Options {
  x?: number;
  y?: number;
  ground?: number | ((x: number) => number);
  hold?: number;
  width?: number;
  colors?: number[];
  seed?: number;
  shake?(trauma: number): void;
  flash?(k: number, rgb: string): void;
  ripple?(x: number, y: number, r0: number, r1: number, dur: number, amp: number, w: number): void;
  darken?(k: number): void;
}
export default function holyLight(o: Options = {}) {
  const R = new Rng(o.seed ?? 1), ps = new Particles(R);
  const X = o.x ?? 790, g = groundAt(o.ground, X), Y = o.y ?? (Number.isFinite(g) ? g : 600), cx = X / PX, cy = Y / PX;
  const H = o.colors ?? HOLY, W = o.width ?? 13, SPARKS = [WHITE, H[1]!, H[2]!, H[3]!];
  const SLAM = 0.42, NARROW = SLAM + (o.hold ?? 2.13), OUT = NARROW + 0.5;
  let t = 0, slammed = false, lastHalo = 0;
  const halos: number[] = [];
  const feathers: { x: number; y: number; vy: number; a: number; life: number; max: number; s: number; seed: number }[] = [];
  const width = (t: number) => (t < SLAM ? 0 : t < NARROW ? W * (1 + 0.35 * Math.exp(-(t - SLAM) * 9)) : lerp(W, 0.6, outCubic((t - NARROW) / 0.4)));
  const strands = Array.from({ length: 11 }, (_, i) => ({ o: (hash(i, 1) - 0.5) * 1.7, w: 0.04 + hash(i, 2) * 0.07, f: 1 + hash(i, 3) * 2 }));
  return {
    update(dt: number) {
      t += dt;
      o.darken?.(0.35 * smooth(0, 0.4, t) * (1 - smooth(NARROW, OUT + 0.2, t)));
      if (t >= SLAM && !slammed) {
        slammed = true;
        o.flash?.(0.85, "255,240,196");
        o.shake?.(0.55);
        o.ripple?.(X, Y - 20, 20, 340, 0.6, 0.18, 40);
        for (let i = 0; i < 50; i++) {
          const s = R.sign(), sp = R.range(120, 520);
          ps.spawn(K.STAR, X + s * R.range(0, 20), Y - 4, s * sp, -R.range(40, 260), R.range(0.4, 1), R.pick(SPARKS), R.range(0.8, 2.2));
        }
        for (let i = 0; i < 8; i++) {
          const life = R.range(2.2, 3);
          feathers.push({ x: X + R.range(-120, 120), y: Y - R.range(260, 420), vy: R.range(28, 50), a: 0, life, max: life, s: R.int(0, 1), seed: R.next() * 10 });
        }
      }
      const w = width(t);
      if (t > SLAM && t < OUT) {
        for (let i = 0; i < 2; i++) if (R.chance(0.7 * clamp(w / W))) ps.spawn(R.chance(0.7) ? K.STAR : K.BOKEH, X + R.range(-w, w) * PX * 1.4, Y - R.range(0, 200), R.range(-10, 10), -R.range(60, 170), R.range(0.6, 1.3), R.pick(SPARKS), R.range(0.7, 2));
        if (t - lastHalo > 0.42 && t < NARROW) { lastHalo = t; halos.push(t); }
      } else if (t < SLAM && R.chance(0.4)) {
        const a = R.range(0, TAU), d = R.range(40, 90);
        ps.spawn(K.STAR, X + Math.cos(a) * d, Y - 6 + Math.sin(a) * d * 0.3, -Math.cos(a) * d * 2.5, -Math.sin(a) * d * 0.6, 0.38, H[2]!, R.range(0.6, 1.2));
      }
      for (let i = feathers.length - 1; i >= 0; i--) {
        const f = feathers[i]!;
        if ((f.life -= dt) <= 0) feathers.splice(i, 1);
        if (f.y > Y - 4) f.vy = 0;
        f.x += Math.sin(t * 2.4 + f.seed) * 34 * dt;
        f.y += f.vy * dt;
        f.a = Math.sin(t * 2.4 + f.seed - 0.6) * 0.5;
      }
      ps.update(dt);
    },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      if (layer !== "front") {
        const gl = t < SLAM ? smooth(0, SLAM, t) * 0.5 : 1 - smooth(NARROW, OUT, t);
        if (gl > 0.01) {
          const rx = 10 + (t < SLAM ? 14 * t : 34 + 4 * Math.sin(t * 5)), ry = 3 + (t < SLAM ? 2 : 5);
          for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
            for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
              const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
              if (d > 1) continue;
              const u = d / Math.max(0.05, gl);
              if (d < 0.7 * gl || bayer(x, y) < gl * (1 - d) * 2.2) buf.set(x, y, u < 0.35 ? H[1]! : u < 0.65 ? H[2]! : u < 0.9 ? H[3]! : H[4]!);
            }
          light.glow(cx, cy, rx * 2.2, H[3]!, 0.5 * gl);
        }
        column(buf, light);
      }
      if (layer !== "back") {
        for (let i = 0; i < 2; i++) {
          const k = (t - SLAM - 0.1 * i) / 0.55, sc = i ? 0.7 : 1;
          if (k < 0 || k > 1) continue;
          const e = outCubic(k);
          ringE(buf, cx, cy, 14 + 90 * e * sc, 3 + 13 * e * sc, 3 * (1 - k) + 0.5, k < 0.25 ? WHITE : H[2]!, 1.15 - k);
        }
        if (t > SLAM && t < SLAM + 0.12) light.glow(cx, cy - 20, 140, H[2]!, 1.2 * (1 - (t - SLAM) / 0.12));
        for (const fe of feathers) {
          const a = Math.min(1, fe.life / 0.6, (fe.max - fe.life) / 0.3), sp = FEATHER[fe.s]!, fx = fe.x / PX, fy = fe.y / PX, ca = Math.cos(fe.a), sa = Math.sin(fe.a);
          for (let r = 0; r < 3; r++)
            for (let k = 0; k < 5; k++) {
              if (sp[r]![k] !== "#") continue;
              const lx = k - 2, ly = r - 1;
              dot(buf, fx + lx * ca - ly * sa, fy + lx * sa + ly * ca, r === 0 ? WHITE : r === 1 ? H[1]! : H[2]!, a);
            }
          light.glow(fx, fy, 5, H[2]!, 0.2 * a);
        }
        ps.draw(buf, light);
      }
    },
    done: () => t > OUT + 0.5 && ps.list.length === 0 && feathers.length === 0,
  };
  function column(buf: Px, light: Px) {
    const w = width(t), top = buf.oy - 2;
    if (t < SLAM) {
      const a = smooth(0, SLAM * 0.8, t) * 0.7;
      for (let y = top; y < cy; y++) dot(buf, cx, y, H[1]!, a * (0.4 + 0.6 * ((y - top) / (cy - top))));
      light.glow(cx, top + 10, 40, H[3]!, a * 0.4);
      return;
    }
    if (w <= 0.05 || t > OUT + 0.2) return;
    const fade = 1 - smooth(OUT - 0.25, OUT + 0.2, t);
    const yEnd = t - SLAM < 0.07 ? lerp(top, cy, inCubic(clamp((t - SLAM) / 0.07) * 0.5 + 0.5)) : cy;
    for (let y = top; y <= yEnd; y++) {
      const pulse = frac((y - top) * 0.02 - t * 1.9) < 0.07 ? 1 : 0;
      for (let x = Math.floor(cx - w * 1.3); x <= Math.ceil(cx + w * 1.3); x++) {
        const q = Math.abs((x + 0.5 - cx) / w);
        let lvl = q < 0.2 ? 0 : q < 0.42 ? 1 : q < 0.66 ? 2 : q < 0.88 ? 3 : 4;
        for (const s of strands) if (Math.abs((x + 0.5 - cx) / w - s.o - 0.05 * Math.sin(t * s.f + s.o * 9)) < s.w) lvl = Math.max(0, lvl - 1);
        lvl = Math.max(0, lvl - pulse);
        const a = (q < 0.88 ? 1 : (1.3 - q) / 0.42) * fade;
        if (a <= bayer(x, y) * (q < 0.66 ? 0.2 : 1)) continue;
        buf.set(x, y, lvl === 0 ? WHITE : H[lvl]!);
      }
      if ((y & 7) === 0) light.glow(cx, y, w * 2.4 + 6, H[2]!, 0.32 * fade);
    }
    light.glow(cx, top + 8, 70, H[3]!, 0.4 * fade);
    for (const h0 of halos) {
      const k = (t - h0) / 0.9;
      if (k < 0 || k > 1) continue;
      ringE(buf, cx, cy - 4 - k * (cy - top) * 0.9, w * 1.35 * (1 + k * 0.3), 2.2, 1, k < 0.3 ? WHITE : H[1]!, (1 - k) * fade);
    }
  }
}
const FEATHER = [[".##..", "#####", "..###"], ["..##.", "#####", "###.."],];
function groundAt(g: number | ((x: number) => number) | undefined, x: number) { return g === undefined ? Infinity : typeof g === "number" ? g : g(x); }
const PX = 2;
class Px {
  w: number; h: number; ox: number; oy: number; data: Uint32Array;
  constructor(f: Frame, data: Uint32Array) { this.w = f.w; this.h = f.h; this.ox = f.ox; this.oy = f.oy; this.data = data; }
  at(x: number, y: number) { x = (x - this.ox) | 0; y = (y - this.oy) | 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  set(x: number, y: number, c: number) { const i = this.at(x, y); if (i >= 0) this.data[i] = c; }
  blend(x: number, y: number, c: number, a: number) {
    const i = this.at(x, y);
    if (i < 0) return;
    const d = this.data[i]!, oa = a + ((d >>> 24) / 255) * (1 - a);
    if (oa <= 0) return;
    const k = a / oa, j = 1 - k, r = (c & 255) * k + (d & 255) * j, g = ((c >>> 8) & 255) * k + ((d >>> 8) & 255) * j, b = ((c >>> 16) & 255) * k + ((d >>> 16) & 255) * j;
    this.data[i] = ((oa * 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }
  add(x: number, y: number, c: number, k: number) {
    const i = this.at(x, y);
    if (i < 0) return;
    const d = this.data[i]!, r = Math.min(255, (d & 255) + (c & 255) * k), g = Math.min(255, ((d >>> 8) & 255) + ((c >>> 8) & 255) * k), b = Math.min(255, ((d >>> 16) & 255) + ((c >>> 16) & 255) * k);
    this.data[i] = (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }
  alphaDisc(cx: number, cy: number, r: number, c: number, a: number) {
    if (a <= 0.01) return;
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const dy = y + 0.5 - cy;
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const dx = x + 0.5 - cx; if (dx * dx + dy * dy <= r2) this.blend(x, y, c, a); }
    }
  }
  glow(cx: number, cy: number, r: number, c: number, k: number) {
    if (r < 1 || k <= 0.01) return;
    const x0 = Math.max(this.ox, Math.floor(cx - r)), x1 = Math.min(this.ox + this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(this.oy, Math.floor(cy - r)), y1 = Math.min(this.oy + this.h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / r;
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / r, d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const f = 1 - Math.sqrt(d);
        this.add(x, y, c, f * f * k);
      }
    }
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bayer(x: number, y: number) { return (BAYER[((y & 3) << 2) | (x & 3)]! + 0.5) / 16; }
function rgb(r: number, g: number, b: number, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }
function hex(h: string) { const v = parseInt(h.replace("#", ""), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); }
function scale(c: number, k: number) {
  return rgb(Math.min(255, (c & 255) * k), Math.min(255, ((c >>> 8) & 255) * k), Math.min(255, ((c >>> 16) & 255) * k), c >>> 24);
}
const WHITE = hex("#ffffff");
const HOLY = ["#ffffff", "#fffbe2", "#fff0a6", "#ffd862", "#f6aa3c", "#cf722b", "#7e3c1f"].map(hex);
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
  sign() { return this.next() < 0.5 ? -1 : 1; }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]!; }
}
const TAU = Math.PI * 2;
function clamp(v: number, a = 0, b = 1) { return v < a ? a : v > b ? b : v; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function smooth(a: number, b: number, x: number) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function outCubic(t: number) { return 1 - Math.pow(1 - clamp(t), 3); }
function inCubic(t: number) { return Math.pow(clamp(t), 3); }
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
function frac(x: number) { return x - Math.floor(x); }
const K = { STAR: 0, BOKEH: 1 } as const;
type K = (typeof K)[keyof typeof K];
interface P { k: K; x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; size: number; seed: number }
class Particles {
  list: P[] = [];
  t = 0;
  R: Rng;
  constructor(R: Rng) { this.R = R; }
  spawn(k: K, x: number, y: number, vx: number, vy: number, life: number, col = 0, size = 1) {
    this.list.push({ k, x, y, vx, vy, life, max: life, col, size, seed: this.R.next() * 100 });
  }
  update(dt: number) {
    this.t += dt;
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]!;
      if ((p.life -= dt) <= 0) { L.splice(i, 1); continue; }
      switch (p.k) {
        case K.STAR:
          p.vx -= p.vx * 1.6 * dt;
          p.vy -= p.vy * 1.6 * dt + 10 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case K.BOKEH:
          p.vx -= p.vx * 0.8 * dt;
          p.vy -= p.vy * 0.8 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
      }
    }
  }
  draw(buf: Px, light: Px) { for (const p of this.list) this.drawOne(p, buf, light); }
  private drawOne(p: P, buf: Px, light: Px) {
    const k = p.life / p.max, ax = p.x / PX, ay = p.y / PX, px = Math.floor(ax), py = Math.floor(ay);
    switch (p.k) {
      case K.STAR: {
        const tw = 0.6 + 0.4 * Math.sin(this.t * (8 + (p.seed % 5)) + p.seed);
        if (p.size < 1) { if (tw * k > 0.25) buf.set(px, py, tw > 0.8 ? WHITE : p.col); light.glow(ax, ay, 3, p.col, 0.4 * k * tw); break; }
        const arm = Math.max(1, Math.round(p.size * tw * Math.min(1, k * 3))), tip = scale(p.col, 0.75);
        for (let d = 1; d <= arm; d++) {
          const cc = d === arm && arm > 1 ? tip : p.col;
          buf.set(px + d, py, cc);
          buf.set(px - d, py, cc);
          buf.set(px, py + d, cc);
          buf.set(px, py - d, cc);
        }
        if (arm >= 3) for (let j = 0; j < 4; j++) buf.set(px + (j & 1 ? -1 : 1), py + (j & 2 ? -1 : 1), tip);
        buf.set(px, py, WHITE);
        light.glow(ax, ay, 3 + arm * 2, p.col, 0.5 * k * tw);
        break;
      }
      case K.BOKEH: {
        const br = 0.7 + 0.3 * Math.sin(this.t * (2 + (p.seed % 3)) + p.seed), a = Math.min(1, (1 - k) * 5) * Math.min(1, k * 3) * br;
        if (a < 0.05) break;
        buf.alphaDisc(ax, ay, p.size, p.col, 0.45 * a);
        buf.alphaDisc(ax, ay, p.size * 0.5, WHITE, 0.5 * a);
        light.glow(ax, ay, 3 + p.size * 3, p.col, 0.35 * a);
        break;
      }
    }
  }
}
function dot(buf: Px, x: number, y: number, c: number, a = 1) {
  const px = Math.floor(x), py = Math.floor(y);
  if (a >= 1 || a > bayer(px, py)) buf.set(px, py, c);
}
function ringE(buf: Px, cx: number, cy: number, rx: number, ry: number, thick: number, c: number, a = 1) {
  const n = Math.ceil(Math.max(rx, ry) * TAU * 1.3);
  for (let j = 0; j < n; j++) {
    const ang = (j / n) * TAU;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let o = -thick / 2; o <= thick / 2; o += 0.5) dot(buf, cx + ca * (rx + o), cy + sa * (ry + o * (ry / Math.max(1, rx))), c, a);
  }
}
