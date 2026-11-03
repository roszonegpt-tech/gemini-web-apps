// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Options {
  area?: { x: number; y: number; w: number; h: number };
  ground?: number | ((x: number) => number);
  density?: number;
  close?: number;
  grass?: boolean;
  seed?: number;
}
export default function fireflies(o: Options = {}) {
  const A = o.area ?? { x: 300, y: 230, w: 680, h: 370 }, X0 = A.x, X1 = A.x + A.w;
  const groundAt = (x: number) => (o.ground === undefined ? A.y + A.h : typeof o.ground === "number" ? o.ground : o.ground(x));
  const R = new Rng(o.seed ?? 1), D = o.density ?? 1, NC = o.close ?? 6;
  const far: Fly[] = [];
  const close = Array.from({ length: NC }, (_, i) => {
    const cx = X0 + 40 + i * ((A.w - 80) / Math.max(1, NC - 1)) + R.range(-30, 30);
    return { cx, cy: groundAt(cx) - R.range(40, 180), seed: i * 17 + 3, per: R.range(1.6, 2.6), ph: R.range(0, 1) };
  });
  const blades = (o.grass ?? true) ? Array.from({ length: Math.round((A.w / PX + 76) / 1.6) }, (_, i) => ({ x: X0 / PX - 30 + i * 1.6 + hash(i, 1) * 1.5, h: 2 + Math.floor(hash(i, 2) * 6) + (hash(i, 3) < 0.15 ? 4 : 0), c: Math.floor(hash(i, 4) * 3), front: hash(i, 5) < 0.25 })) : [];
  let t = 0, stopped = -1;
  const grass = (buf: Px, front: boolean) => {
    for (const b of blades) {
      if (b.front !== front) continue;
      const sway = noise(t * 0.7 + b.x * 0.04, 9) * 1.6, fy = groundAt(b.x * PX) / PX;
      for (let r = 0; r < b.h; r++) { const u = r / b.h; dot(buf, b.x + sway * u * u, fy - 1 - r, r === b.h - 1 ? GRASS[Math.min(3, b.c + 1)]! : GRASS[b.c]!); }
    }
  };
  return {
    update(dt: number) {
      t += dt;
      if (stopped < 0 && R.chance(0.12 * D)) {
        const x = R.range(X0, X1), y = groundAt(x) - R.range(12, 230), vx = R.range(-20, 20), vy = R.range(-15, 15), life = R.range(4, 8);
        far.push({ x, y, vx, vy, life, max: life, seed: R.next() * 100 });
      }
      for (let i = far.length - 1; i >= 0; i--) {
        const p = far[i]!;
        if ((p.life -= dt) <= 0) { far.splice(i, 1); continue; }
        const a = p.seed * 0.63 + t * (0.7 + (p.seed % 1) * 0.9), k = Math.min(1, dt * 1.5);
        p.vx += (Math.cos(a) * 55 - p.vx) * k;
        p.vy += (Math.sin(a * 1.3) * 38 - 8 - p.vy) * k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      if (layer !== "front") grass(buf, false);
      if (layer === "back") return;
      for (const p of far) {
        const k = p.life / p.max, blink = Math.max(0, Math.sin(t * (2.2 + (p.seed % 3) * 0.7) + p.seed));
        const a = Math.min(1, (1 - k) * 6) * Math.min(1, k * 4) * blink;
        if (a < 0.08) continue;
        const ax = p.x / PX, ay = p.y / PX;
        buf.set(Math.floor(ax), Math.floor(ay), a > 0.5 ? FLY.core : FLY.glow);
        light.glow(ax, ay, 7, FLY.glow, 0.55 * a);
      }
      grass(buf, true);
      const out = stopped < 0 ? 1 : Math.max(0, 1 - (t - stopped));
      for (const fl of close) {
        const x = (fl.cx + noise(t * 0.32, fl.seed) * 140) / PX, y = (fl.cy + noise(t * 0.27, fl.seed + 9) * 60) / PX;
        const u = (t / fl.per + fl.ph) % 1, pulse = (u < 0.6 ? Math.pow(Math.sin((u / 0.6) * Math.PI), 0.7) : 0) * out;
        const px = Math.round(x), py = Math.round(y), dir = noise(t * 0.32 + 0.05, fl.seed) > noise(t * 0.32, fl.seed) ? 1 : -1;
        const wy = py - (Math.sin(t * 50 + fl.seed) > 0 ? 2 : 1);
        dot(buf, px - dir, wy, FLY.wing, 0.6 * out);
        dot(buf, px, wy, FLY.wing, 0.6 * out);
        dot(buf, px + dir, py, FLY.body, out);
        dot(buf, px + dir * 2, py, FLY.body, out);
        dot(buf, px, py, pulse > 0.25 ? FLY.core : FLY.dim, out);
        dot(buf, px - dir, py, pulse > 0.5 ? FLY.core : pulse > 0.15 ? FLY.glow : FLY.dim, out);
        if (pulse > 0.6) buf.set(px - dir, py + 1, FLY.glow);
        light.glow(x, y, 26, FLY.glow, 0.5 * pulse);
        light.glow(x, y, 8, FLY.core, 0.6 * pulse);
        if (pulse > 0.4) {
          const a = (pulse - 0.4) * 1.2;
          dot(buf, px - dir, py - 2, FLY.glow, a);
          dot(buf, px - dir, py + 2, FLY.glow, a);
          dot(buf, px - dir - 2, py, FLY.glow, a);
          dot(buf, px - dir + 2, py, FLY.glow, a);
        }
      }
    },
    stop() { if (stopped < 0) stopped = t; },
    done: () => stopped >= 0 && t - stopped > 1 && far.length === 0,
  };
}
interface Fly { x: number; y: number; vx: number; vy: number; life: number; max: number; seed: number }
const FLY = { core: hex("#faffbe"), glow: hex("#c8ff5a"), dim: hex("#6f8f2a"), body: hex("#2a2418"), wing: hex("#8a96a8") };
const GRASS = ["#0d1a12", "#15281a", "#1f3a22", "#2e5230"].map(hex);
const PX = 2;
class Px {
  w: number; h: number; ox: number; oy: number; data: Uint32Array;
  constructor(f: Frame, data: Uint32Array) { this.w = f.w; this.h = f.h; this.ox = f.ox; this.oy = f.oy; this.data = data; }
  at(x: number, y: number) { x = (x - this.ox) | 0; y = (y - this.oy) | 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  set(x: number, y: number, c: number) { const i = this.at(x, y); if (i >= 0) this.data[i] = c; }
  add(x: number, y: number, c: number, k: number) {
    const i = this.at(x, y);
    if (i < 0) return;
    const d = this.data[i]!, r = Math.min(255, (d & 255) + (c & 255) * k), g = Math.min(255, ((d >>> 8) & 255) + ((c >>> 8) & 255) * k), b = Math.min(255, ((d >>> 16) & 255) + ((c >>> 16) & 255) * k);
    this.data[i] = (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
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
function dot(buf: Px, x: number, y: number, c: number, a = 1) {
  const px = Math.floor(x), py = Math.floor(y);
  if (a >= 1 || a > (BAYER[((py & 3) << 2) | (px & 3)]! + 0.5) / 16) buf.set(px, py, c);
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
  chance(p: number) { return this.next() < p; }
}
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
function noise(x: number, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i, seed) * 2 - 1 + (hash(i + 1, seed) - hash(i, seed)) * 2 * u;
}
