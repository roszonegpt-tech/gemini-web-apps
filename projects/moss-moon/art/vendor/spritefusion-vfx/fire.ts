// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Actor { feet?(): [number, number]; silhouette?(): { x: number; y: number; w: number; h: number; data: Uint32Array } | null }
export interface Options {
  actor?: Actor;
  box?: [number, number, number, number];
  size?: number;
  ramp?: readonly number[];
  wind?: number;
  duration?: number;
  seed?: number;
}
type Tongue = [number, number, number, number];
export default function fire(o: Options = {}) {
  const RAMP = o.ramp ?? FIRE, R = new Rng(o.seed ?? 1), S = o.size ?? 1, sS = Math.sqrt(S), WIND = o.wind ?? 0;
  const HEAT = [...RAMP.slice(0, 8), mix(RAMP[8]!, SOOT, 0.35), mix(RAMP[8]!, SOOT, 0.65)];
  const GLOW = o.ramp ? mix(RAMP[3]!, RAMP[4]!, 0.5) : WARM, SMOKE = mix(SMOKE1, RAMP[6]!, 0.25), SEED = 37, GL = 0.9;
  const ps = new Particles(R, RAMP);
  const bx: number[] = [], by: number[] = [], top: number[] = [], licks: Lick[] = [];
  let tongues: Tongue[] = [], t = 0, stopAt = o.duration ?? 2.6, lv = 0, ax = 0, ay = 0, x = 0, y = 0, vx = 0, vy = 0, lean = 0, stretch = 0, placed = false;
  const lit = () => smooth(0, 0.3, t) * clamp(1 - (t - stopAt) / 1.2);
  function read() {
    bx.length = by.length = 0;
    const s = o.actor?.silhouette?.();
    if (s) {
      for (let py = 0; py < s.h; py++) for (let px = 0; px < s.w; px++) if (s.data[py * s.w + px]! >>> 24 > 127) bx.push(s.x + px), by.push(s.y + py);
      [ax, ay] = o.actor?.feet?.() ?? [(s.x + s.w / 2) * PX, (s.y + s.h) * PX];
    } else {
      const [X, Y, W, H] = o.box ?? [744, 568, 32, 32];
      for (let py = Math.floor(Y / PX); py < (Y + H) / PX; py++) for (let px = Math.floor(X / PX); px < (X + W) / PX; px++) bx.push(px), by.push(py);
      [ax, ay] = [X + W / 2, Y + H];
    }
  }
  function place() {
    let x0 = Infinity;
    for (const v of bx) x0 = Math.min(x0, v);
    top.length = 0;
    for (let i = 0; i < bx.length; i++) { const j = bx[i]! - x0; if (top[j] === undefined || by[i]! < top[j]!) top[j] = by[i]!; }
    const fx = ax / PX, fy = ay / PX;
    tongues = [];
    for (let j = 0; j < top.length; j += 2) if (top[j] !== undefined) tongues.push([x0 + j - fx, 5 + 5 * hash(j, 2), 1.5 + 0.6 * hash(j, 3), top[j]! - fy + 1]);
    for (let k = 0; k < 4 && bx.length; k++) {
      const i = Math.floor(hash(k, 9) * bx.length);
      tongues.push([bx[i]! - fx, 4 + 3 * hash(k, 4), 1.3, by[i]! - fy + 1]);
    }
  }
  function height(i: number) {
    const h = tongues[i]![1], n = SEED + i;
    const leap = Math.max(0, noise(t * 2.6 + n * 3.1, n + 70) - 0.55) * 1.6;
    return (h + 0.25 * h * noise(t * 3.3 + n * 1.7, n) + h * leap) * (0.9 + 0.1 * flick(t)) * S * lv * (1 + stretch);
  }
  function tip(i: number): [number, number] {
    const [dx, , , dy] = tongues[i]!, h = height(i);
    return [x + (dx + lean * h * 0.9) * PX, y + (dy - h * 0.88 + 4) * PX];
  }
  function move(dt: number) {
    if (!placed) (x = ax), (y = ay), (placed = true);
    if (dt <= 0) return;
    const k = 1 - Math.exp(-dt * 10), kl = 1 - Math.exp(-dt * 7);
    vx += ((ax - x) / dt - vx) * k;
    vy += ((ay - y) / dt - vy) * k;
    x = ax;
    y = ay;
    lean += (clamp((-vx + WIND) / 520, -1.3, 1.3) - lean) * kl;
    stretch += (clamp(vy / 900, -0.3, 0.45) - stretch) * kl;
  }
  function shed(dt: number) {
    const speed = Math.hypot(vx, vy), L = lv * 0.7;
    for (let i = 0; i < tongues.length; i++) {
      if (L <= 0.02) continue;
      if (R.chance(0.18 * L)) {
        const [tx, ty] = tip(i);
        ps.spawn(FLAME, tx + R.range(-2, 2), ty + R.range(0, 8), R.range(-8, 8) + WIND * 0.3, R.range(-60, -30), R.range(0.14, 0.3), 0, R.range(0.8, 1.6) * sS, R.chance(0.45));
      }
      if (R.chance((0.075 + speed / 2700) * L)) {
        const [tx, ty] = tip(i);
        licks.push({ x: tx / PX, y: ty / PX, vx: R.range(-6, 6) + WIND * 0.15, vy: R.range(-40, -24), s: R.range(0.9, 1.7) * sS, life: 0.26, max: 0.26 });
      }
      if (R.chance(0.024 * L * S)) ps.spawn(EMBER, x + (tongues[i]![0] + R.range(-3, 3)) * PX, y - R.range(10, 24) * S, R.range(-30, 30) + WIND * 0.4, R.range(-120, -50), R.range(0.9, 2.2));
      if (R.chance(0.017 * L)) {
        const [tx, ty] = tip(i);
        ps.spawn(SMOKE_K, tx, ty - 6, R.range(-5, 5) + WIND * 0.5, R.range(-34, -20), R.range(1.6, 2.6), SMOKE, R.range(1.6, 2.8) * sS);
      }
    }
    for (let i = licks.length - 1; i >= 0; i--) {
      const l = licks[i]!;
      if ((l.life -= dt) <= 0) { licks.splice(i, 1); continue; }
      l.x += l.vx * dt + noise(t * 8 + i, 3) * 0.15;
      l.y += l.vy * dt;
    }
  }
  function flames(buf: Px, light: Px) {
    for (let i = 0; i < bx.length; i++) {
      const h = hash(bx[i]! * 73 + by[i]! * 151, 5);
      if (h > 0.2) continue;
      const T = clamp(0.4 + 0.6 * noise(t * (5 + h * 20), bx[i]! * 7 + by[i]!)) * lv;
      if (T > 0.45) buf.set(bx[i]!, by[i]!, HEAT[Math.min(9, 2 + Math.floor((1 - T) * 7))]!);
    }
    const fx = x / PX, fy = y / PX, n = tongues.length;
    const order = tongues.map((_, i) => i).sort((a, b) => Math.abs(tongues[b]![0]) - Math.abs(tongues[a]![0]));
    for (const i of order) {
      const [dx, , w, dy] = tongues[i]!, h = height(i), m = SEED + i;
      if (h < 1) continue;
      tongue(buf, fx + dx, fy + dy + 1, h, w * sS * (1 - 0.25 * Math.abs(lean)), noise(t * 2.2 + m, m + 40) * 2 * S + lean * h * 0.9 - clamp(dx * 0.25, -2, 2), t, m * 13, RAMP);
    }
    for (const l of licks) {
      const k = l.life / l.max, r = l.s * (0.4 + 0.6 * k);
      buf.disc(l.x, l.y, r + 0.6, k > 0.5 ? RAMP[5]! : RAMP[6]!);
      if (k > 0.35) buf.disc(l.x, l.y - 0.3, r * 0.6, k > 0.7 ? RAMP[2]! : RAMP[4]!);
    }
    const fl = flick(t), br = 0.92 + 0.08 * Math.sin(t * 2.1);
    if (n <= 7) {
      const k = fl * Math.max(0.15, n ? lv : 0) * Math.min(1, (n ? lv : 0) * 4), g = GL * sS;
      light.glow(fx + lean * 4, fy - 8 * S, 70 * g * br * (0.9 + 0.1 * fl), GLOW, 0.4 * k);
      light.glow(fx, fy - 6 * S, 22 * g, RAMP[2]!, 0.32 * k);
      light.glow(fx, fy - 2, 9 * GL, RAMP[0]!, 0.18 * k);
    } else
      for (let i = 2; i < n; i += 5) {
        const [dx, , , dy] = tongues[i]!;
        light.glow(fx + dx, fy + dy - 10 * S, 50 * GL * sS * br, GLOW, 0.36 * fl * lv);
        light.glow(fx + dx, fy + dy - 3, 16 * GL * sS, RAMP[2]!, 0.26 * fl * lv);
      }
  }
  return {
    update(dt: number) {
      t += dt;
      read();
      place();
      lv = lit();
      move(dt);
      shed(dt);
      if (bx.length && R.chance(0.7 * lv)) {
        const i = Math.floor(R.next() * bx.length);
        ps.spawn(FLAME, bx[i]! * PX, by[i]! * PX, R.range(-10, 10) - vx * 0.2, R.range(-80, -40), R.range(0.16, 0.3), 0, R.range(1, 1.8) * sS);
      }
      if (bx.length && R.chance(0.16 * lv)) ps.spawn(SMOKE_K, bx[0]! * PX, by[0]! * PX - 8, R.range(-6, 6) - vx * 0.3, R.range(-40, -20), R.range(1.2, 2), SMOKE, R.range(2, 3.2));
      ps.update(dt, t);
    },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      if (layer !== "front") ps.draw(buf, light, true, t);
      if (layer !== "back") { flames(buf, light); ps.draw(buf, light, false, t); }
    },
    stop() { if (stopAt > t) stopAt = t; },
    done: () => t > stopAt + 1.2 && ps.list.length === 0,
  };
}
interface Lick { x: number; y: number; vx: number; vy: number; s: number; life: number; max: number }
function flick(t: number) { return 0.74 + 0.16 * noise(t * 7.3, 1) + 0.1 * noise(t * 19, 2); }
function tongue(buf: Px, x: number, y: number, h: number, w: number, sx: number, t: number, n: number, ramp9: readonly number[]) {
  if (h < 1) return;
  for (const [lw, lh, ri] of LAYERS) {
    const H = h * lh, col = ramp9[ri]!;
    for (let r = 0; r <= H; r++) {
      const u = r / Math.max(1, H);
      const half = w * lw * Math.pow(1 - u, 0.85) * Math.min(1, (r + 1.5) / 3.5) + noise(t * 9 + r * 0.45, n) * 0.5;
      const cx = x + sx * u * u * lh + noise(t * 4 + r * 0.2, n + 7) * u * 1.1;
      if (half < 0.3) continue;
      for (let px = Math.round(cx - half); px <= Math.round(cx + half); px++) buf.set(px, Math.round(y - r), col);
    }
  }
}
const LAYERS: [number, number, number][] = [[1, 1, 6], [0.76, 0.86, 4], [0.54, 0.68, 2], [0.3, 0.42, 0]];
const PX = 2;
class Px {
  w: number; h: number; ox: number; oy: number; data: Uint32Array;
  constructor(f: Frame, data: Uint32Array) { this.w = f.w; this.h = f.h; this.ox = f.ox; this.oy = f.oy; this.data = data; }
  at(x: number, y: number) { x = (x - this.ox) | 0; y = (y - this.oy) | 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x; }
  set(x: number, y: number, c: number) { const i = this.at(x, y); if (i >= 0) this.data[i] = c; }
  blend(x: number, y: number, c: number, a: number) {
    x = (x - this.ox) | 0;
    y = (y - this.oy) | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x, d = this.data[i]!, oa = a + ((d >>> 24) / 255) * (1 - a);
    if (oa <= 0) return;
    const k = a / oa;
    const r = (c & 255) * k + (d & 255) * (1 - k), g = ((c >>> 8) & 255) * k + ((d >>> 8) & 255) * (1 - k), b = ((c >>> 16) & 255) * k + ((d >>> 16) & 255) * (1 - k);
    this.data[i] = ((oa * 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }
  add(x: number, y: number, c: number, k: number) {
    const i = (y - this.oy) * this.w + (x - this.ox), d = this.data[i]!;
    const r = Math.min(255, (d & 255) + (c & 255) * k), g = Math.min(255, ((d >>> 8) & 255) + ((c >>> 8) & 255) * k), b = Math.min(255, ((d >>> 16) & 255) + ((c >>> 16) & 255) * k);
    this.data[i] = (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }
  disc(cx: number, cy: number, r: number, c: number, a = 1) {
    if (a <= 0.01) return;
    if (r <= 0.5 && a >= 1) return this.set(Math.round(cx), Math.round(cy), c);
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const dy = y + 0.5 - cy;
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy <= r2) a >= 1 ? this.set(x, y, c) : this.blend(x, y, c, a);
      }
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
function rgb(r: number, g: number, b: number, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }
function hex(h: string) { const v = parseInt(h.slice(1), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); }
function mix(c1: number, c2: number, t: number) {
  const u = 1 - t, ch = (c: number, s: number) => (c >>> s) & 255;
  return rgb(ch(c1, 0) * u + ch(c2, 0) * t, ch(c1, 8) * u + ch(c2, 8) * t, ch(c1, 16) * u + ch(c2, 16) * t, ch(c1, 24) * u + ch(c2, 24) * t);
}
function ramp(stops: readonly number[], t: number) {
  const u = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1), i = Math.floor(u);
  return mix(stops[i]!, stops[i + 1]!, u - i);
}
const FIRE = ["#ffffff", "#fff3a6", "#ffe26b", "#ffc23d", "#ff8a2a", "#f2561d", "#c9281f", "#8a1f17", "#4a1712"].map(hex);
const SMOKE_RAMP = ["#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e"].map(hex);
const SMOKE1 = hex("#5b5566"), SOOT = hex("#0d0a12"), WARM = rgb(255, 176, 96);
class Rng {
  s: number;
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
function clamp(v: number, a = 0, b = 1) { return v < a ? a : v > b ? b : v; }
function smooth(a: number, b: number, x: number) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
function noise(x: number, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = hash(i, seed) * 2 - 1;
  return a + (hash(i + 1, seed) * 2 - 1 - a) * u;
}
const FLAME = 0, SMOKE_K = 1, EMBER = 2;
interface P { k: number; x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; size: number; seed: number; smokes: boolean }
class Particles {
  list: P[] = [];
  R: Rng;
  ramp: readonly number[];
  constructor(R: Rng, ramp9: readonly number[]) { this.R = R; this.ramp = ramp9; }
  spawn(k: number, x: number, y: number, vx: number, vy: number, life: number, col = 0, size = 1, smokes = false) {
    this.list.push({ k, x, y, vx, vy, life, max: life, col, size, seed: this.R.next() * 100, smokes });
  }
  update(dt: number, t: number) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]!;
      if ((p.life -= dt) <= 0) {
        if (p.smokes) this.spawn(SMOKE_K, p.x, p.y, p.vx * 0.6, p.vy * 0.6 - 12, this.R.range(0.8, 1.4), 0, p.size * 0.7);
        L.splice(i, 1);
        continue;
      }
      if (p.k === FLAME) {
        p.vy -= 190 * dt;
        p.vx += Math.sin(t * 17 + p.seed) * 60 * dt;
        p.vx -= p.vx * 5 * dt;
        p.vy -= p.vy * 3.2 * dt;
      } else if (p.k === SMOKE_K) { p.vy -= 32 * dt; p.vx += Math.sin(t * 1.3 + p.seed) * 16 * dt; p.vx -= p.vx * 1.6 * dt; p.vy -= p.vy * 1.2 * dt; } else {
        p.vy += (-60 + Math.sin(t * 3 + p.seed) * 40) * dt;
        p.vx += Math.cos(t * 2.3 + p.seed) * 90 * dt;
        p.vx -= p.vx * 1.6 * dt;
        p.vy -= p.vy * 1.6 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  draw(buf: Px, light: Px, smoke: boolean, t: number) {
    const r9 = this.ramp;
    for (const p of this.list) {
      if ((p.k === SMOKE_K) !== smoke) continue;
      const k = p.life / p.max, age = 1 - k, ax = p.x / PX, ay = p.y / PX;
      if (p.k === SMOKE_K) {
        const r = p.size * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * 0.4), a = Math.min(1, age * 12) * Math.min(1, k * 2.4) * 0.55;
        const c = p.col ? mix(p.col, ramp(SMOKE_RAMP, age), age) : ramp(SMOKE_RAMP, age * 1.05);
        buf.disc(ax, ay, r, c, a * 0.45);
        buf.disc(ax + r * 0.05, ay + r * 0.06, r * 0.74, c, a * 0.62);
        if (age < 0.5) buf.disc(ax - r * 0.22, ay - r * 0.3, r * 0.5, mix(c, r9[0]!, 0.12), a * 0.4 * (1 - age * 2));
      } else if (p.k === FLAME) {
        const heat = Math.min(0.999, Math.pow(age, 0.62) + (p.seed % 1) * 0.1), idx = Math.min(7, Math.floor(heat * 8));
        const r = p.size * (0.55 + 0.45 * Math.min(1, age * 7)) * (1 - age * 0.55), c = r9[idx]!;
        if (idx >= 7) buf.disc(ax, ay, r, c, Math.min(1, k * 3) * 0.85);
        else {
          buf.disc(ax, ay, r, r9[Math.min(8, idx + 2)]!);
          buf.disc(ax - r * 0.16, ay - r * 0.22, r * 0.78, c);
          if (r > 1.6) buf.disc(ax, ay - r * 0.9, r * 0.42, c);
          if (idx <= 3 && r > 1.8) buf.disc(ax - r * 0.28, ay - r * 0.34, r * 0.36, r9[Math.max(0, idx - 1)]!);
          if (idx < 6) light.glow(ax, ay, r * 2.4 + 2, c, 0.18 * k);
        }
      } else {
        const c = k > 0.5 ? (Math.sin(t * 22 + p.seed * 3) > -0.2 ? r9[2]! : r9[4]!) : k > 0.2 ? r9[4]! : r9[6]!;
        buf.set(Math.floor(ax), Math.floor(ay), c);
        light.glow(ax, ay, 3, c, 0.3 * k);
      }
    }
  }
}
