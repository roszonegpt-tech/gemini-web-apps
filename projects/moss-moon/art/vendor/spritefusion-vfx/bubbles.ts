// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Options {
  area?: { x: number; y: number; w: number; h: number };
  ground?: number | ((x: number) => number);
  vents?: number[];
  density?: number;
  surface?: boolean;
  caustics?: boolean;
  tint?: boolean;
  specks?: number;
  colors?: [string, string, string, string];
  seed?: number;
}
export default function bubbles(o: Options = {}) {
  const A = o.area ?? { x: 300, y: 260, w: 680, h: 340 }, X0 = A.x, X1 = A.x + A.w, TOP = A.y;
  const groundAt = (x: number) => (o.ground === undefined ? A.y + A.h : typeof o.ground === "number" ? o.ground : o.ground(x));
  const R = new Rng(o.seed ?? 1), D = o.density ?? 1, SURFACE = o.surface ?? true, NS = Math.round(110 * (o.specks ?? 1));
  const [HI, LIT, RIM, SHADE] = (o.colors ?? ["#ffffff", "#c6f3ff", "#68bfe6", "#2f7fb6"]).map(hex) as [number, number, number, number];
  const FILL = mix(RIM, SHADE, 0.5);
  const vents = (o.vents ?? Array.from({ length: 3 }, (_, i) => X0 + ((i + 0.5 + R.range(-0.3, 0.3)) / 3) * A.w)).map((x) => ({ x, acc: R.next(), burst: R.range(0.5, 2.5), seed: R.range(0, 100) }));
  const list: Bubble[] = [], pops: { x: number; y: number; r: number; t: number }[] = [];
  let t = 0, stopped = false;
  const spawn = (v: (typeof vents)[number], y: number, big: number) => {
    const r = big ? R.range(1.5, 3.2) * big : R.chance(0.7) ? R.range(0.5, 1.4) : R.range(1.4, 2.6);
    list.push({ x0: v.x + R.range(-4, 4), x: v.x, y, r, vy: 0, ph: R.range(0, TAU), wob: 0, near: R.chance(0.35) });
  };
  for (const v of vents)
    for (let y = groundAt(v.x) - 4; y > TOP; y -= R.range(18, 46) / D) {
      spawn(v, y, 0);
      const b = list[list.length - 1]!;
      b.r *= 1 + (1 - (y - TOP) / A.h) * 0.4;
      b.vy = -(40 + 26 * b.r);
    }
  const specks = Array.from({ length: NS }, () => ({ x: R.range(X0, X1), y: R.range(TOP, groundAt(X0)), seed: R.range(0, 100), c: R.int(0, 2), near: R.chance(0.3) }));
  function drawBubble(buf: Px, light: Px, b: Bubble) {
    const cx = b.x / PX, cy = b.y / PX, r = b.r;
    if (r < 0.9) { buf.set(Math.floor(cx), Math.floor(cy), r < 0.7 ? RIM : LIT); return; }
    if (r < 1.5) {
      const px = Math.floor(cx), py = Math.floor(cy);
      buf.set(px, py, HI);
      buf.set(px + 1, py, LIT);
      buf.set(px, py + 1, RIM);
      buf.set(px + 1, py + 1, SHADE);
      light.glow(cx + 0.5, cy + 0.5, 3, LIT, 0.12);
      return;
    }
    const sq = 0.1 * Math.sin(b.ph * 2) * Math.min(1, (r - 1.5) / 2) + b.wob * 0.25, rx = r * (1 + sq), ry = r * (1 - sq);
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy) * r;
        if (d > r + 0.5) continue;
        const lit = (-dx - dy) / Math.SQRT2 / Math.max(0.01, d / r);
        if (d > r - 0.6) buf.set(x, y, lit > 0.45 ? LIT : lit < -0.55 ? SHADE : RIM);
        else if (bayer(x, y) < 0.12) buf.set(x, y, FILL);
      }
    const hx = Math.round(cx - rx * 0.45), hy = Math.round(cy - ry * 0.45);
    buf.set(hx, hy, HI);
    if (r >= 2.5) buf.set(hx + 1, hy, LIT), buf.set(hx, hy + 1, LIT);
    if (r >= 2) buf.set(Math.round(cx + rx * 0.5), Math.round(cy + ry * 0.5), LIT);
    light.glow(cx, cy, r * 2.4 + 2, RIM, 0.14);
  }
  function drawSurface(buf: Px, light: Px) {
    const y0 = TOP / PX, x0 = Math.max(buf.ox, Math.floor(X0 / PX)), x1 = Math.min(buf.ox + buf.w - 1, Math.ceil(X1 / PX));
    for (let x = x0; x <= x1; x++) {
      const sy = Math.round(y0 + (Math.sin(x * 0.11 + t * 1.6) * 1.2 + Math.sin(x * 0.043 - t * 0.9) * 1.6));
      const glint = Math.sin(x * 0.37 - t * 2.3) * Math.sin(x * 0.13 + t * 1.1) > 0.55;
      buf.set(x, sy, glint ? HI : LIT);
      buf.set(x, sy + 1, RIM);
      for (let k = 2; k < 7; k++) if (bayer(x, sy + k) < 0.5 - k * 0.07) buf.set(x, sy + k, SHADE);
      if ((x & 3) === 0) light.glow(x, sy + 2, 7, LIT, glint ? 0.2 : 0.09);
    }
  }
  function drawCaustics(light: Px) {
    const gy = Math.round(groundAt((X0 + X1) / 2) / PX), top = Math.floor(TOP / PX);
    const x0 = Math.max(light.ox, Math.floor(X0 / PX)), x1 = Math.min(light.ox + light.w - 1, Math.ceil(X1 / PX));
    const y0 = Math.max(light.oy, top), y1 = Math.min(light.oy + light.h - 1, gy + 6);
    for (let y = y0; y <= y1; y++) {
      const k = y >= gy - 1 ? 1 : 0.18 + 0.32 * (1 - (y - top) / Math.max(1, gy - top));
      for (let x = x0; x <= x1; x++) {
        const u = x * 0.16 + 1.9 * Math.sin(y * 0.12 + t * 0.9), v = y * 0.19 + 1.9 * Math.sin(x * 0.1 - t * 0.7);
        const n1 = Math.sin(u) + Math.sin(v), n2 = Math.sin(x * 0.09 + y * 0.07 + 1.4 * Math.sin(y * 0.15 - t * 0.6)) + Math.sin(y * 0.11 - x * 0.05 + 1.4 * Math.sin(x * 0.13 + t * 0.8));
        const f = (Math.max(0, 1 - Math.abs(n1) * 3) + 0.7 * Math.max(0, 1 - Math.abs(n2) * 3)) * k, d = bayer(x, y);
        if (f > 1.05 || (f > 0.8 && d < (f - 0.8) / 0.25)) light.add(x, y, LIT, 0.3);
        else if (f > 0.45 || (f > 0.3 && d < (f - 0.3) / 0.15)) light.add(x, y, RIM, 0.15);
      }
    }
  }
  function tintWater(buf: Px) {
    const top = Math.floor(TOP / PX), gy = Math.ceil(groundAt((X0 + X1) / 2) / PX) + 1;
    const x0 = Math.max(buf.ox, Math.floor(X0 / PX)), x1 = Math.min(buf.ox + buf.w - 1, Math.ceil(X1 / PX));
    for (let y = Math.max(buf.oy, top); y <= Math.min(buf.oy + buf.h - 1, gy); y++) for (let x = x0; x <= x1; x++) buf.blend(x, y, WATER, 0.2 + 0.12 * ((y - top) / Math.max(1, gy - top)));
  }
  function drawSpeck(buf: Px, s: (typeof specks)[number]) {
    const x = Math.floor(s.x / PX), y = Math.floor(s.y / PX), tw = Math.sin(t * 1.3 + s.seed);
    if (bayer(x, y) > 0.55 + 0.3 * tw) return;
    buf.set(x, y, tw > 0.85 ? LIT : SPECKS[s.c]!);
  }
  function drawPop(buf: Px, p: (typeof pops)[number]) {
    const k = p.t / 0.2, x = p.x / PX, y = p.y / PX, r = p.r + 1 + k * 3;
    for (let a = 0; a < TAU; a += 0.5 / r) if (Math.sin(a) < 0.2) dot(buf, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.5, k < 0.5 ? HI : LIT, 1 - k);
    if (p.r > 1.5) dot(buf, x - 2, y - 2 - k * 4, LIT, 1 - k), dot(buf, x + 2, y - 3 - k * 5, LIT, 1 - k);
  }
  return {
    update(dt: number) {
      t += dt;
      if (!stopped)
        for (const v of vents) {
          v.acc += dt * 5 * D * (0.7 + 0.3 * noise(t * 0.8 + v.seed, 3));
          for (; v.acc > 1; v.acc--) spawn(v, groundAt(v.x) - 3, 0);
          if ((v.burst -= dt) < 0) {
            v.burst = R.range(1.4, 3.2);
            for (let i = 0; i < R.int(5, 10); i++) spawn(v, groundAt(v.x) - 3 - i * 5, R.range(0.6, 1));
            for (let i = 0; i < 5; i++) specks.push({ x: v.x + R.range(-8, 8), y: groundAt(v.x) - R.range(2, 10), seed: R.range(0, 100), c: 0, near: false });
          }
        }
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i]!;
        b.vy += (-(40 + 26 * b.r) - b.vy) * Math.min(1, dt * 3);
        b.y += b.vy * dt;
        b.ph += dt * (4 + 2 / b.r);
        b.x = b.x0 + Math.sin(b.ph) * (1 + b.r * 1.6);
        b.x0 += noise(t * 0.4 + i * 0.13, 5) * 6 * dt;
        b.r = Math.min(5, b.r + dt * 0.12);
        b.wob *= 1 - Math.min(1, dt * 4);
        if (b.y < TOP + 2) { if (SURFACE) pops.push({ x: b.x, y: TOP, r: b.r, t: 0 }); list.splice(i, 1); }
      }
      for (let i = 0; i < list.length; i++) {
        const a = list[i]!;
        if (a.r < 1) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j]!;
          if (b.r < 1 || Math.hypot(a.x - b.x, a.y - b.y) / PX > (a.r + b.r) * 0.75) continue;
          a.r = Math.cbrt(a.r ** 3 + b.r ** 3);
          a.x0 = (a.x0 + b.x0) / 2;
          a.wob = 1;
          list.splice(j--, 1);
        }
      }
      for (let i = pops.length - 1; i >= 0; i--) if ((pops[i]!.t += dt) > 0.2) pops.splice(i, 1);
      for (let i = 0; i < specks.length; i++) {
        const s = specks[i]!;
        s.y += (5 + 3 * Math.sin(s.seed)) * dt;
        s.x += noise(t * 0.3 + s.seed, 9) * 8 * dt;
        if (s.y > groundAt(s.x) - 1) { if (i >= NS) specks.splice(i--, 1); else (s.y = TOP + 2), (s.x = R.range(X0, X1)); }
      }
    },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      if (layer !== "front") {
        if (o.tint ?? true) tintWater(buf);
        if (o.caustics ?? true) drawCaustics(light);
        if (SURFACE) drawSurface(buf, light);
        for (const v of vents) {
          const cx = Math.round(v.x / PX), gy = Math.round(groundAt(v.x) / PX);
          for (const [dx, dy, c] of VENT) buf.set(cx + dx, gy + dy, c);
        }
        for (const s of specks) if (!s.near) drawSpeck(buf, s);
        for (const b of list) if (!b.near) drawBubble(buf, light, b);
        for (const p of pops) drawPop(buf, p);
      }
      if (layer !== "back") { for (const b of list) if (b.near) drawBubble(buf, light, b); for (const s of specks) if (s.near) drawSpeck(buf, s); }
    },
    stop() { stopped = true; },
    done: () => stopped && list.length === 0 && pops.length === 0,
  };
}
interface Bubble { x0: number; x: number; y: number; r: number; vy: number; ph: number; wob: number; near: boolean }
const WATER = hex("#0b3550");
const SPECKS = ["#5f8a9a", "#7fa3a8", "#4c6f86"].map(hex);
const VENT: [number, number, number][] = [];
[".OOO.OOO.", "OLPPMPPLO", "LPPMMMPPL"].forEach((r, y) => [...r].forEach((c, x) => c !== "." && VENT.push([x - 4, y - 3, hex({ O: "#1a1422", L: "#62788a", M: "#0a1018", P: "#3c4a5a" }[c]!)])));
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
function dot(buf: Px, x: number, y: number, c: number, a = 1) {
  const px = Math.floor(x), py = Math.floor(y);
  if (a >= 1 || a > bayer(px, py)) buf.set(px, py, c);
}
function rgb(r: number, g: number, b: number, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }
function hex(h: string) { const v = parseInt(h.slice(1), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); }
function mix(c1: number, c2: number, t: number) {
  const u = 1 - t, ch = (c: number, s: number) => (c >>> s) & 255;
  return rgb(ch(c1, 0) * u + ch(c2, 0) * t, ch(c1, 8) * u + ch(c2, 8) * t, ch(c1, 16) * u + ch(c2, 16) * t, ch(c1, 24) * u + ch(c2, 24) * t);
}
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
function noise(x: number, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i, seed) * 2 - 1 + (hash(i + 1, seed) - hash(i, seed)) * 2 * u;
}
