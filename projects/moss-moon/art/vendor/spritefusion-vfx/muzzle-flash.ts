// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Actor { hand(): { x: number; y: number; a: number } }
export interface Options {
  x?: number;
  y?: number;
  angle?: number;
  size?: number;
  sparks?: number;
  casing?: boolean;
  smoke?: boolean;
  actor?: Actor;
  ground?: number | ((x: number) => number);
  seed?: number;
  kick?(dx: number, dy: number): void;
}
export default function muzzleFlash(o: Options = {}) {
  const h0 = o.actor?.hand();
  const X = o.x ?? h0?.x ?? 620, Y = o.y ?? h0?.y ?? 540, A = o.angle ?? h0?.a ?? 0, S = o.size ?? 1;
  const R = new Rng(o.seed ?? 1);
  const groundAt = (x: number) => (o.ground === undefined ? Infinity : typeof o.ground === "number" ? o.ground : o.ground(x));
  const ps = new Particles(R, groundAt);
  const c = Math.cos(A), s = Math.sin(A);
  const spin = R.range(-0.35, 0.35), jit = Array.from({ length: 9 }, () => R.range(0.8, 1.2));
  const shape = [1, 2].map((f) => lobes(S, f, spin, jit));
  let t = 0, casing: Casing | null = null;
  for (let i = 0, n = o.sparks ?? Math.round(4 + 3 * S); i < n; i++) {
    const a = A + R.range(-1, 1) * 0.32, sp = R.range(300, 760) * (0.7 + 0.3 * S);
    ps.spawn(K.SPARK, X + c * 4, Y + s * 4, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.05, 0.15));
  }
  if (o.smoke !== false) {
    for (let i = 0, n = Math.round(1 + S * 2.5); i < n; i++) {
      const a = A + R.range(-0.5, 0.5), sp = R.range(20, 90) * S;
      ps.spawn(K.SMOKE, X + c * 3, Y + s * 3, Math.cos(a) * sp, Math.sin(a) * sp - 10, R.range(0.45, 0.9), SMOKE, R.range(1.2, 2.2) * Math.sqrt(S));
    }
    for (let i = 0; i < 4; i++) {
      const k = i / 3;
      ps.spawn(K.SMOKE, X + c * 2, Y + s * 2, c * (40 - 30 * k) * S + R.range(-6, 6), s * (40 - 30 * k) * S - (14 + 26 * k), R.range(0.9, 1.4), WISP, R.range(0.9, 1.4) * Math.sqrt(S), 0.04 + i * 0.05);
    }
  }
  if (o.casing !== false) {
    const up = c >= 0 ? 1 : -1, nx = s * up, ny = -c * up;
    casing = { x: X - c * 14 * S, y: Y - s * 14 * S, vx: nx * R.range(170, 260) - c * R.range(50, 130), vy: ny * R.range(170, 260) - s * R.range(50, 130), a: R.range(0, TAU), va: R.range(22, 34) * R.sign(), life: R.range(3.6, 4.6), max: 0, rest: false, glint: 0 };
    casing.max = casing.life;
  }
  if (S >= 1) o.kick?.(-c * 1.6 * S, -s * 1.6 * S);
  return {
    update(dt: number) {
      t += dt;
      if (casing) {
        const k = casing;
        if ((k.life -= dt) <= 0) casing = null;
        else if (!k.rest) {
          k.vy += GRAVITY * 0.9 * dt;
          k.vx -= k.vx * 0.4 * dt;
          const ny = k.y + k.vy * dt, g = groundAt(k.x);
          k.x += k.vx * dt;
          k.a += k.va * dt;
          if (k.vy > 0 && k.y <= g && ny >= g) {
            k.y = g - 0.5;
            k.glint = 0.06;
            if (k.vy > 160) { k.vy = -k.vy * 0.42; k.vx *= 0.55; k.va *= 0.6; } else (k.rest = true), (k.vy = 0);
          } else k.y = ny;
        } else { k.x += k.vx * dt; k.vx -= k.vx * Math.min(1, 6 * dt); }
        if (casing) casing.glint = Math.max(0, casing.glint - dt);
      }
      ps.update(dt);
    },
    draw(fr: Frame, layer?: Layer) {
      const buf = new Px(fr, fr.color), light = new Px(fr, fr.light);
      if (layer !== "front") { ps.draw(buf, light, "back"); if (casing) drawCasing(buf, light, casing); }
      if (layer === "back") return;
      const f = Math.max(1, Math.ceil(t * 60 - 1e-6));
      const m = where(), ax = m.x / PX, ay = m.y / PX;
      if (f <= 2) flash(buf, ax, ay, m.a, f, shape[f - 1]!, t * 1000 + X);
      ps.draw(buf, light, "front");
      const pop = Math.exp(-t / 0.03);
      if (pop > 0.02) {
        light.glow(ax + Math.cos(m.a) * 4 * S, ay + Math.sin(m.a) * 4 * S, 18 * S + 8, WARM, 0.85 * pop);
        light.glow(ax + Math.cos(m.a) * 2, ay + Math.sin(m.a) * 2, 6 * S + 3, PAL.white, 0.6 * pop);
      }
    },
    done: () => t > 0.2 && ps.list.length === 0 && !casing,
  };
  function where() { if (o.actor && t < 0.08 && o.x === undefined) return o.actor.hand(); return { x: X, y: Y, a: A } }
}
interface Lobe { off: number; a: number; len: number; wid: number; core: number }
function lobes(S: number, f: number, spin: number, jit: number[]): Lobe[] {
  const k = f === 1 ? 1 : 0.6, w = f === 1 ? 1 : 0.7;
  const L: Lobe[] = [{ off: 0.5, a: 0, len: 9 * S * k, wid: 2.4 * S * w, core: 0.55 }, { off: 2, a: 0, len: 21 * S * k * jit[0]!, wid: 1.15 * S * w, core: 0.4 }];
  for (const side of [-1, 1]) {
    L.push({ off: 2, a: side * (0.72 + spin * side * 0.4), len: 8.5 * S * k * jit[side + 2]!, wid: 1.35 * S * w, core: 0.3 });
    if (f === 1) L.push({ off: 1, a: side * (2.2 - spin * side * 0.4), len: 4 * S * jit[side + 4]!, wid: 1.1 * S, core: 0 });
  }
  return L;
}
function profile(l: Lobe, u: number) { const k = u / l.len; return l.wid * Math.pow(Math.max(0, 1 - k), 0.8) * Math.min(1, 0.45 + k * 3); }
function flash(buf: Px, ax: number, ay: number, a: number, f: number, L: Lobe[], seed: number) {
  const c = Math.cos(a), s = Math.sin(a);
  let ext = 2;
  for (const l of L) ext = Math.max(ext, l.off + l.len + 2);
  const core = f === 1 ? PAL.white : PAL.hot, body = f === 1 ? PAL.yellow : PAL.orange, inner = f === 1 ? PAL.hot : PAL.yellow, rim = f === 1 ? PAL.deepOrange : PAL.red;
  for (let py = Math.floor(ay - ext); py <= Math.ceil(ay + ext); py++)
    for (let px = Math.floor(ax - ext); px <= Math.ceil(ax + ext); px++) {
      const dx = px + 0.5 - ax, dy = py + 0.5 - ay, along = dx * c + dy * s, across = -dx * s + dy * c;
      let m = -9, hot = false, warm = false;
      for (const l of L) {
        const ca = Math.cos(l.a), sa = Math.sin(l.a), lu = (along - l.off) * ca + across * sa, lv = -(along - l.off) * sa + across * ca;
        if (lu < -1.5 || lu > l.len + 1) continue;
        const r = profile(l, Math.max(0, lu)), mm = r - Math.abs(lv);
        if (mm > m) m = mm;
        if (lu < l.len * l.core && Math.abs(lv) <= r * 0.5) hot = true;
        if (mm > r * 0.4) warm = true;
      }
      const dm = 1.6 - Math.hypot(along - 0.5, across);
      if (dm > m) m = dm;
      if (dm > 0.5) hot = true;
      m += (hash(px * 73 + py * 151, seed) - 0.5) * 0.5 * Math.min(1, ext / 14);
      if (m < -0.85) continue;
      buf.set(px, py, m < 0 ? rim : hot ? core : warm ? inner : body);
    }
}
interface Casing { x: number; y: number; vx: number; vy: number; a: number; va: number; life: number; max: number; rest: boolean; glint: number }
function drawCasing(buf: Px, light: Px, k: Casing) {
  const fade = Math.min(1, k.life / 0.6), px = Math.floor(k.x / PX), py = Math.floor(k.y / PX);
  const a = k.rest ? Math.round(k.a / Math.PI) * Math.PI : k.a, dx = Math.round(Math.cos(a)), dy = Math.round(Math.sin(a));
  const put = (x: number, y: number, c: number) => (fade >= 1 || fade > bayer(x, y)) && buf.set(x, y, c);
  put(px, py, BRASS);
  put(px + dx, py + dy, BRASS_DARK);
  if (k.glint > 0) { buf.set(px, py - 1, PAL.white); light.glow(px + 0.5, py, 4, BRASS, 0.5 * (k.glint / 0.06)); }
}
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
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 4096; n++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) (err += dy), (x0 += sx);
      if (e2 <= dx) (err += dx), (y0 += sy);
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
function mix(c1: number, c2: number, t: number) {
  const u = 1 - t, ch = (c: number, s: number) => (c >>> s) & 255;
  return rgb(ch(c1, 0) * u + ch(c2, 0) * t, ch(c1, 8) * u + ch(c2, 8) * t, ch(c1, 16) * u + ch(c2, 16) * t, ch(c1, 24) * u + ch(c2, 24) * t);
}
function ramp(stops: readonly number[], t: number) {
  const u = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1), i = Math.floor(u);
  return mix(stops[i]!, stops[i + 1]!, u - i);
}
const PAL = { white: hex("#ffffff"), hot: hex("#fff3a6"), yellow: hex("#ffe26b"), orange: hex("#ff8a2a"), deepOrange: hex("#f2561d"), red: hex("#c9281f") };
const WARM = rgb(255, 176, 96);
const SMOKE = hex("#5b5566"), WISP = hex("#7a7186");
const BRASS = hex("#e9b54a"), BRASS_DARK = hex("#9b6a22");
const SMOKE_RAMP = [hex("#7b6f72"), hex("#5d5660"), hex("#433d48"), hex("#2b2630"), hex("#1a171e")];
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
  sign() { return this.next() < 0.5 ? -1 : 1; }
}
const TAU = Math.PI * 2;
function hash(n: number, k = 0) { return ((Math.imul((n | 0) + 1 + Math.floor(k) * 7919, 2654435761) >>> 0) % 100000) / 100000; }
const GRAVITY = 1900;
const K = { SPARK: 0, SMOKE: 1 } as const;
type K = (typeof K)[keyof typeof K];
interface P { k: K; x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; size: number; seed: number; delay: number }
class Particles {
  list: P[] = [];
  t = 0;
  R: Rng;
  ground: (x: number) => number;
  constructor(R: Rng, ground: (x: number) => number) { this.R = R; this.ground = ground; }
  spawn(k: K, x: number, y: number, vx: number, vy: number, life: number, col = 0, size = 1, delay = 0) {
    this.list.push({ k, x, y, vx, vy, life, max: life, col, size, seed: this.R.next() * 100, delay });
  }
  update(dt: number) {
    this.t += dt;
    const t = this.t, L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]!;
      if (p.delay > 0) { p.delay -= dt; continue; }
      if ((p.life -= dt) <= 0) { L.splice(i, 1); continue; }
      switch (p.k) {
        case K.SPARK: {
          p.vy += GRAVITY * 0.45 * dt;
          p.vx -= p.vx * 2.2 * dt;
          p.vy -= p.vy * 2.2 * dt;
          const ny = p.y + p.vy * dt, g = this.ground(p.x);
          p.x += p.vx * dt;
          if (p.vy > 0 && p.y <= g && ny >= g) { p.vy = -p.vy * 0.45; p.vx *= 0.7; p.y = g - 0.5; } else p.y = ny;
          break;
        }
        case K.SMOKE:
          p.vy -= 32 * dt;
          p.vx += Math.sin(t * 1.3 + p.seed) * 16 * dt;
          p.vx -= p.vx * 1.6 * dt;
          p.vy -= p.vy * 1.2 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
      }
    }
  }
  draw(buf: Px, light: Px, layer: Layer) {
    for (const p of this.list) {
      if (p.delay > 0 || (p.k === K.SMOKE) !== (layer === "back")) continue;
      const k = p.life / p.max, ax = p.x / PX, ay = p.y / PX;
      switch (p.k) {
        case K.SMOKE: {
          const age = 1 - k, r = p.size * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * 0.4);
          const a = Math.min(1, age * 12) * Math.min(1, k * 2.4) * 0.58, c = mix(p.col, ramp(SMOKE_RAMP, age), age);
          buf.alphaDisc(ax, ay, r, c, a * 0.45);
          buf.alphaDisc(ax + r * 0.05, ay + r * 0.06, r * 0.74, c, a * 0.62);
          if (age < 0.5) buf.alphaDisc(ax - r * 0.22, ay - r * 0.3, r * 0.5, mix(c, PAL.white, 0.12), a * 0.4 * (1 - age * 2));
          break;
        }
        case K.SPARK: {
          const hot = k > 0.6 ? PAL.hot : k > 0.3 ? PAL.yellow : PAL.orange;
          const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = Math.min(9, 1 + sp * 0.011);
          buf.line(ax - ux * len, ay - uy * len, ax - ux * len * 0.4, ay - uy * len * 0.4, k > 0.5 ? hot : PAL.deepOrange);
          buf.line(ax - ux * len * 0.45, ay - uy * len * 0.45, ax, ay, hot);
          light.glow(ax, ay, 3, hot, 0.45 * k);
          break;
        }
      }
    }
  }
}
