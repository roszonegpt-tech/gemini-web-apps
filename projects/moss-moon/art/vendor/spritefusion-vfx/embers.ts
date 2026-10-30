// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Options { area?: { x: number; y: number; w: number; h: number }; density?: number; heat?: boolean; seed?: number }
export default function embers(o: Options = {}) {
  const A = o.area ?? { x: 300, y: 230, w: 680, h: 420 }, X0 = A.x, X1 = A.x + A.w, BOTTOM = A.y + A.h;
  const R = new Rng(o.seed ?? 1), D = o.density ?? 1;
  const sparks: Spark[] = [], cinders: Cinder[] = [];
  const spark = (x: number, y: number, vx: number, vy: number, life: number) => sparks.push({ x, y, vx, vy, life, max: life, seed: R.next() * 100 });
  const cinder = (x: number, vx: number, vy: number, life: number, s: number, ash: boolean) => cinders.push({ x, y: BOTTOM + 10, vx, vy, life, max: life, s, seed: R.next() * 100, ash });
  let t = 0, stopped = false;
  return {
    update(dt: number) {
      t += dt;
      if (!stopped) {
        for (let i = 0; i < 2; i++) if (R.chance(0.8 * D)) spark(R.range(X0 - 40, X1 + 40), R.range(BOTTOM - 10, BOTTOM + 40), R.range(-40, 40), -R.range(90, 240), R.range(2.2, 4.2));
        if (R.chance(0.22 * D)) cinder(R.range(X0, X1), R.range(-20, 20), -R.range(50, 110), R.range(3.5, 6), R.chance(0.3) ? 2 : 1, false);
        if (R.chance(0.05 * D)) cinder(R.range(X0, X1), R.range(-20, 20), -R.range(30, 60), R.range(5, 7), 1, true);
      }
      for (let i = cinders.length - 1; i >= 0; i--) {
        const c = cinders[i]!;
        if ((c.life -= dt) <= 0) { cinders.splice(i, 1); continue; }
        c.vx += noise(t * 0.9 + c.seed, 1) * 60 * dt;
        c.vx -= c.vx * 0.8 * dt;
        c.x += c.vx * dt + Math.sin(t * 2 + c.seed) * 10 * dt;
        c.y += c.vy * dt;
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]!;
        if ((p.life -= dt) <= 0) { sparks.splice(i, 1); continue; }
        p.vy += (-60 + Math.sin(t * 3 + p.seed) * 40) * dt;
        p.vx += Math.cos(t * 2.3 + p.seed) * 90 * dt;
        p.vx -= p.vx * 1.6 * dt;
        p.vy -= p.vy * 1.6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      if (layer !== "front" && (o.heat ?? true)) {
        const y1 = BOTTOM / PX, fade = stopped ? Math.min(1, sparks.length / 60) : 1;
        for (let x = Math.floor(X0 / PX) - 30; x < Math.ceil(X1 / PX) + 30; x++) {
          const h = (0.7 + 0.3 * noise(x * 0.02 + t * 0.6, 7)) * fade;
          for (let r = 0; r < 22; r++) dot(buf, x, y1 - 1 - r, DARK[r < 4 ? 0 : r < 10 ? 1 : 2]!, 0.6 * h * (1 - r / 22));
          if (x % 24 === 0) light.glow(x, y1 + 6, 80, HEAT, 0.26 * h);
        }
      }
      if (layer === "back") return;
      for (const c of cinders) {
        const k = c.life / c.max, x = c.x / PX, y = c.y / PX, a = Math.min(1, k * 3) * Math.min(1, (1 - k) * 8);
        if (c.ash) { dot(buf, x, y, ASH[0]!, a); dot(buf, x + (Math.sin(t * 3 + c.seed) > 0 ? 1 : 0), y + 1, ASH[1]!, a); continue; }
        const fl = 0.65 + 0.35 * noise(t * 9 + c.seed, 2), hot = k * fl;
        const core = hot > 0.55 ? HOT : hot > 0.35 ? YELLOW : ORANGE, rim = hot > 0.45 ? ORANGE : DEEP_ORANGE;
        if (c.s === 2) {
          dot(buf, x - 1, y, rim, a);
          dot(buf, x + 1, y, rim, a);
          dot(buf, x, y - 1, rim, a);
          dot(buf, x, y + 1, rim, a);
          dot(buf, x, y, core, a);
          light.glow(x, y, 9, ORANGE, 0.45 * a * fl);
        } else { dot(buf, x, y, core, a); dot(buf, x, y + 1, rim, a * 0.6); light.glow(x, y, 5, ORANGE, 0.35 * a * fl); }
      }
      for (const p of sparks) {
        const k = p.life / p.max, ax = p.x / PX, ay = p.y / PX;
        const c = k > 0.5 ? (Math.sin(t * 22 + p.seed * 3) > -0.2 ? YELLOW : ORANGE) : k > 0.2 ? ORANGE : RED;
        buf.set(Math.floor(ax), Math.floor(ay), c);
        light.glow(ax, ay, 3, c, 0.3 * k);
      }
    },
    stop() { stopped = true; },
    done: () => stopped && sparks.length === 0 && cinders.length === 0,
  };
}
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; seed: number }
interface Cinder extends Spark { s: number; ash: boolean }
const HOT = hex("#fff3a6"), YELLOW = hex("#ffe26b"), ORANGE = hex("#ff8a2a"), DEEP_ORANGE = hex("#f2561d"), RED = hex("#c9281f");
const DARK = [RED, hex("#8a1f17"), hex("#4f1a13")], ASH = [hex("#5a5160"), hex("#3a3442")], HEAT = hex("#ff7832");
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
