// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Actor { feet(): [number, number]; silhouette?(): { x: number; y: number; w: number; h: number; data: Uint32Array } | null }
export interface Options { kind?: "heal" | "mana"; x?: number; y?: number; actor?: Actor; palette?: string[]; count?: number; seed?: number }
export default function heal(o: Options = {}) {
  const MANA = o.kind === "mana";
  const L = (o.palette ?? (MANA ? ["#ffffff", "#e4f2ff", "#a9d4ff", "#64a4ff", "#4170f0", "#3449b8", "#26307c", "#171c4a"] : ["#ffffff", "#e6ffdc", "#acff92", "#62e26a", "#30b55b", "#20804c", "#175237", "#0f3125"])).map(hex);
  const R = new Rng(o.seed ?? 1);
  const feet = (): [number, number] => (o.actor ? o.actor.feet() : [o.x ?? 640, o.y ?? 600]);
  const [X0, Y0] = feet();
  const ps = new Particles(R);
  const glyphs = new Bits(), bubbles: Bubble[] = [];
  for (let i = 0; i < (o.count ?? (MANA ? 14 : 18)); i++) glyphs.add({ x: X0 + R.range(-46, 46), y: Y0 - R.range(4, 70), vy: -R.range(50, 90), life: R.range(1, 1.4), delay: 0.06 + i * 0.085 + R.range(0, 0.05), s: R.chance(0.45) ? 1 : 0, seed: R.next() * 1000 });
  const fade = (t: number) => 1 - smooth(1.9, 2.7, t);
  let t = 0;
  const floor = (buf: Px, light: Px, cx: number, fy: number) => {
    const k = fade(t), w = 19.5 * (1 - (1 - clamp(t / 0.45)) ** 3);
    for (let dx = -Math.ceil(w); dx <= w; dx++) {
      const u = Math.abs(dx) / Math.max(1, w), a = k * Math.sqrt(1 - Math.min(1, u)) * 1.04;
      dot(buf, cx + dx, fy, u < 0.3 ? L[1]! : u < 0.65 ? L[2]! : L[3]!, a);
      if (u < 0.75) dot(buf, cx + dx, fy - 1, u < 0.35 ? L[2]! : L[3]!, a * 0.35);
      if (dx % 5 === 0) light.glow(cx + dx, fy, 10, L[3]!, 0.22 * k * (1 - u));
    }
    for (let i = 0; i < 8; i++) {
      const ph = frac(t * (0.9 + hash(i, 1) * 0.6) + hash(i, 2)), x = cx + (hash(i, 3) - 0.5) * 2 * w, a = Math.sin(ph * Math.PI) * k;
      dot(buf, x, fy - 1 - ph * 22, ph < 0.25 ? WHITE : L[1]!, a);
      dot(buf, x, fy - ph * 22, L[2]!, a * 0.6);
    }
  };
  const sweep = (buf: Px, light: Px) => {
    const s = o.actor?.silhouette?.(), k = smooth(0, 0.25, t) * fade(t);
    if (!s || k <= 0) return;
    const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < s.w && j < s.h && s.data[j * s.w + i]! >>> 24 > 0;
    let top = s.h, bot = -1, sx = 0, n = 0;
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) if (inside(i, j)) (top = Math.min(top, j)), (bot = j), (sx += i), n++;
    for (const p of [0.1, 0.65, 1.2]) {
      const q = (t - p) / 0.4;
      if (q < 0 || q > 1.3 || bot < 0) continue;
      const yb = bot + 2 - q * (bot - top + 6);
      for (let j = top - 1; j <= bot + 1; j++) {
        const d = j - yb;
        if (d < -1 || d >= 10) continue;
        for (let i = -1; i <= s.w; i++)
          if (inside(i, j)) dot(buf, s.x + i, s.y + j, d < 1 ? WHITE : d < 4 ? L[1]! : L[2]!, k * (d < 1 ? 1.5 : (1 - d / 10) * 1.4));
          else if (d < 1.5 && (inside(i + 1, j) || inside(i - 1, j) || inside(i, j + 1) || inside(i, j - 1))) dot(buf, s.x + i, s.y + j, L[1]!, k);
      }
      light.glow(s.x + sx / n, s.y + yb, 14, L[2]!, 0.5 * k * (1 - q / 1.3));
    }
  };
  const helix = (buf: Px, light: Px, cx: number, fy: number, front: boolean) => {
    const k = fade(t) * smooth(0, 0.25, t);
    if (k <= 0) return;
    for (let s = 0; s < 2; s++)
      for (let i = 0; i < 4; i++) {
        const ph = frac(t * 0.5 + i / 4 + s * 0.125), a = Math.sin(ph * Math.PI) * k, rx = 17 - ph * 7;
        for (let d = 0; d < 14; d++) {
          const th = ph * TAU * 1.6 + s * Math.PI + t * 2.4 - d * 0.13, z = Math.sin(th);
          if (z >= 0 !== front) continue;
          const px = cx + Math.cos(th) * rx, py = fy - 3 - ph * 70 + d * 0.7, c = z < 0 ? (d < 5 ? L[3]! : L[4]!) : d < 1 ? WHITE : d < 4 ? L[1]! : d < 8 ? L[2]! : L[3]!, ad = a * (1 - d / 15) * (z < 0 ? 0.75 : 1);
          dot(buf, px, py, c, ad);
          if (d < 6 && z >= 0) dot(buf, px, py + 1, d < 3 ? L[2]! : L[3]!, ad);
        }
        if (front) light.glow(cx + Math.cos(ph * TAU * 1.6 + s * Math.PI + t * 2.4) * rx, fy - 3 - ph * 70, 6, L[2]!, 0.4 * a);
      }
  };
  return {
    update(dt: number) {
      t += dt;
      const [x, y] = feet();
      glyphs.step(dt);
      if (MANA && t < 1.9 && R.chance(0.16)) {
        const life = R.range(0.6, 1.1);
        bubbles.push({ x: x + R.range(-30, 30), y: y - R.range(0, 40), vy: -R.range(60, 110), life, max: life, r: R.chance(0.3) ? 2 : 1, seed: R.next() * 10 });
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]!;
        if ((b.life -= dt) <= 0) bubbles.splice(i, 1);
        b.y += b.vy * dt;
        b.x += Math.sin(t * 7 + b.seed) * 22 * dt;
      }
      for (const b of glyphs.list) if (b.delay <= 0) b.x += Math.sin((b.max - b.life) * 4.5 + b.seed) * 16 * dt;
      if (t < 2 && R.chance(0.45)) ps.spawn(x + R.range(-34, 34), y - R.range(0, 76), R.range(-8, 8), -R.range(30, 80), R.range(0.5, 0.95), R.chance(0.5) ? L[1]! : L[2]!, R.chance(0.3) ? R.range(1.6, 2.6) : R.range(0.4, 0.9));
      ps.update(dt);
    },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      const [x, y] = feet(), cx = x / PX, fy = y / PX;
      if (layer !== "front") {
        const k = fade(t) * smooth(0, 0.2, t);
        for (let h = 0; h < 78; h += 6) light.glow(cx, fy - h, 22, L[3]!, 0.13 * k * (1 - h / 90));
        if (MANA) helix(buf, light, cx, fy, false);
        else
          for (let i = 0; i < 22; i++) {
            const ph = (t * (1.1 + hash(i, 3) * 0.8) + hash(i, 1)) % 1, sx = cx + (hash(i, 2) - 0.5) * 34 * (1 - ph * 0.3), sy = fy - 2 - ph * 74;
            const a = Math.sin(ph * Math.PI) * k;
            for (let d = 0; d < 5; d++) dot(buf, sx, sy + d, d === 0 ? L[1]! : d < 3 ? L[2]! : L[4]!, a * (1 - d / 6));
          }
      }
      if (layer !== "back") {
        floor(buf, light, cx, fy);
        sweep(buf, light);
        if (MANA) helix(buf, light, cx, fy, true);
        for (const b of glyphs.list) {
          if (b.delay > 0) continue;
          const age = b.max - b.life, k = b.life / b.max, glint = Math.sin(age * 14 + b.seed) > 0.75;
          if (MANA) drop(buf, b.x / PX, b.y / PX, age < 0.05 ? 1 : b.s ? 0 : 1, L, k < 0.4 ? k / 0.4 : 1, glint || age < 0.1);
          else {
            const big = b.s ? 4 : 2, Lc = age < 0.05 ? big - 1 : age < 0.1 ? big + 1 : big;
            cross(buf, b.x / PX, b.y / PX, Lc, b.s, L, k < 0.4 ? k / 0.4 : 1, glint);
          }
          light.glow(b.x / PX, b.y / PX, 9 + b.s * 3, L[2]!, 0.4 * Math.min(1, k * 2));
        }
        for (const b of bubbles) {
          const bx = b.x / PX, by = b.y / PX;
          if (b.life < 0.07) {
            for (let j = 0; j < 4; j++) buf.set(Math.round(bx + (j & 1 ? -1 : 1) * (b.r + 1)), Math.round(by + (j & 2 ? -1 : 1) * (b.r + 1)), L[1]!);
            continue;
          }
          bubble(buf, bx, by, b.r, L, Math.min(1, b.life / 0.3));
          light.glow(bx, by, 4 + b.r * 2, L[3]!, 0.25);
        }
        ps.draw(buf, light);
      }
    },
    done: () => t > 2.8 && ps.list.length === 0 && bubbles.length === 0,
  };
}
function cross(buf: Px, x: number, y: number, L: number, w: number, r: readonly number[], a = 1, glint = false) {
  const px = Math.round(x), py = Math.round(y);
  const ins = (dx: number, dy: number) => (Math.abs(dx) <= w && Math.abs(dy) <= L) || (Math.abs(dy) <= w && Math.abs(dx) <= L);
  for (let dy = -L - 1; dy <= L + 1; dy++)
    for (let dx = -L - 1; dx <= L + 1; dx++) {
      let c: number;
      if (ins(dx, dy)) {
        const top = !ins(dx, dy - 1), left = !ins(dx - 1, dy), bottom = !ins(dx, dy + 1), right = !ins(dx + 1, dy);
        c = w === 0 ? (dy < 0 || dx < 0 ? r[1]! : r[3]!) : top || left ? r[1]! : bottom || right ? r[4]! : r[2]!;
        if (glint && ((dx === 0 && dy === 0) || (w > 0 && dx === -w && dy === -L))) c = WHITE;
      } else if (ins(dx - 1, dy) || ins(dx + 1, dy) || ins(dx, dy - 1) || ins(dx, dy + 1)) c = OUTLINE;
      else continue;
      dot(buf, px + dx, py + dy, c, a);
    }
}
const DROP = [["..1..", "..2..", ".122.", ".1223", "1W223", "12223", "22234", ".334."], [".1.", ".2.", "1W3", "223", ".3."],];
function drop(buf: Px, x: number, y: number, s: number, r: readonly number[], a = 1, glint = false) {
  const m = DROP[s]!, h = m.length, w = m[0]!.length, x0 = Math.round(x) - (w >> 1), y0 = Math.round(y) - (h >> 1);
  const ins = (i: number, j: number) => j >= 0 && j < h && i >= 0 && i < w && m[j]![i] !== ".";
  for (let j = -1; j <= h; j++)
    for (let i = -1; i <= w; i++) {
      const ch = ins(i, j) ? m[j]![i]! : ins(i - 1, j) || ins(i + 1, j) || ins(i, j - 1) || ins(i, j + 1) ? "o" : "";
      if (!ch) continue;
      dot(buf, x0 + i, y0 + j, ch === "o" ? OUTLINE : ch === "W" || (glint && ch === "1") ? WHITE : r[+ch]!, a);
    }
}
function bubble(buf: Px, x: number, y: number, r: number, c: readonly number[], a = 1) {
  const px = Math.round(x), py = Math.round(y);
  for (let j = -r - 1; j <= r + 1; j++)
    for (let i = -r - 1; i <= r + 1; i++) {
      const d = Math.hypot(i, j);
      if (Math.abs(d - r) < 0.6 || (r === 1 && Math.abs(i) + Math.abs(j) === 1)) dot(buf, px + i, py + j, i < 0 && j < 0 ? c[1]! : j > 0 ? c[4]! : c[2]!, a);
    }
}
interface Bubble { x: number; y: number; vy: number; life: number; max: number; r: number; seed: number }
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
function bayer(x: number, y: number) { return (BAYER[((y & 3) << 2) | (x & 3)]! + 0.5) / 16; }
function dot(buf: Px, x: number, y: number, c: number, a = 1) {
  const px = Math.floor(x), py = Math.floor(y);
  if (a >= 1 || a > bayer(px, py)) buf.set(px, py, c);
}
function rgb(r: number, g: number, b: number, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }
function hex(h: string) { const v = parseInt(h.replace("#", ""), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); }
function scale(c: number, k: number) {
  return rgb(Math.min(255, (c & 255) * k), Math.min(255, ((c >>> 8) & 255) * k), Math.min(255, ((c >>> 16) & 255) * k), c >>> 24);
}
const WHITE = hex("#ffffff");
const OUTLINE = hex("#1a1422");
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
const TAU = Math.PI * 2;
function clamp(v: number, a = 0, b = 1) { return v < a ? a : v > b ? b : v; }
function smooth(a: number, b: number, x: number) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function frac(x: number) { return x - Math.floor(x); }
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; size: number; seed: number }
class Particles {
  list: P[] = [];
  t = 0;
  R: Rng;
  constructor(R: Rng) { this.R = R; }
  spawn(x: number, y: number, vx: number, vy: number, life: number, col: number, size: number) {
    this.list.push({ x, y, vx, vy, life, max: life, col, size, seed: this.R.next() * 100 });
  }
  update(dt: number) {
    this.t += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      if ((p.life -= dt) <= 0) { this.list.splice(i, 1); continue; }
      p.vx -= p.vx * 1.6 * dt;
      p.vy -= p.vy * 1.6 * dt + 10 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  draw(buf: Px, light: Px) {
    for (const p of this.list) {
      const k = p.life / p.max, ax = p.x / PX, ay = p.y / PX, px = Math.floor(ax), py = Math.floor(ay);
      const tw = 0.6 + 0.4 * Math.sin(this.t * (8 + (p.seed % 5)) + p.seed);
      if (p.size < 1) { if (tw * k > 0.25) buf.set(px, py, tw > 0.8 ? WHITE : p.col); light.glow(ax, ay, 3, p.col, 0.4 * k * tw); continue; }
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
    }
  }
}
interface Bit { x: number; y: number; vy: number; life: number; max: number; s: number; seed: number; delay: number }
class Bits {
  list: Bit[] = [];
  add(b: Omit<Bit, "max">) { this.list.push({ ...b, max: b.life }); }
  step(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]!;
      if (b.delay > 0) { b.delay -= dt; continue; }
      if ((b.life -= dt) <= 0) { this.list.splice(i, 1); continue; }
      b.y += b.vy * dt;
    }
  }
}
