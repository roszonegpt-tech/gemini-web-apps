// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Actor { feet(): [number, number]; silhouette?(): { x: number; y: number; w: number; h: number; data: Uint32Array } | null }
export interface Options {
  actor?: Actor;
  x?: number;
  y?: number;
  palette?: string[];
  size?: number;
  seed?: number;
  shake?(trauma: number): void;
  flash?(k: number, rgb: string): void;
}
const BURST = 0.32, HOLD = 1.75, FADE = 2.35, END = 2.95;
const PULSE1 = BURST + 0.55, PULSE2 = BURST + 1.0;
const BW = 64, BH = 76;
export default function powerUp(o: Options = {}) {
  const C = (o.palette ?? ["#ffffff", "#e0fcff", "#8ff0ff", "#3fd0ff", "#2290e6", "#1f4fab", "#172a68"]).map(hex), TOP = [C[0]!, C[1]!, C[2]!];
  const S = o.size ?? 1, R = new Rng(o.seed ?? 1);
  const feet = (): [number, number] => (o.actor ? o.actor.feet() : [o.x ?? 640, o.y ?? 600]);
  const motes: Mote[] = [];
  const mask = new Uint8Array(BW * BH), dist = new Uint8Array(BW * BH);
  let t = 0, burst = false, bx0 = 0, by0 = 0, midY = 0;
  const aura = () => smooth(BURST - 0.04, BURST + 0.12, t) * (1 - smooth(HOLD, FADE, t)) * (0.85 + 0.15 * Math.sin(t * 13));
  const flare = () => Math.max(Math.exp(-(((t - PULSE1) / 0.07) ** 2)), Math.exp(-(((t - PULSE2) / 0.07) ** 2))) + Math.exp(-(((t - BURST) / 0.08) ** 2));
  function body() {
    const [fx, fy] = feet(), cx = Math.round(fx / PX), cy = Math.round(fy / PX);
    bx0 = cx - BW / 2;
    by0 = cy - BH + 6;
    midY = cy - 22;
    mask.fill(0);
    const s = o.actor?.silhouette?.();
    let any = false;
    if (s)
      for (let y = 0; y < BH; y++)
        for (let x = 0; x < BW; x++) {
          const sx = bx0 + x - s.x, sy = by0 + y - s.y;
          if (sx >= 0 && sy >= 0 && sx < s.w && sy < s.h && s.data[sy * s.w + sx]! >>> 24) (mask[y * BW + x] = 1), (any = true);
        }
    if (!any)
      for (let y = 0; y < BH; y++)
        for (let x = 0; x < BW; x++) {
          const px = bx0 + x + 0.5 - cx, py = by0 + y + 0.5 - cy;
          const head = Math.hypot(px, py + 38) < 4.5, trunk = Math.abs(px) < 2.2 && py > -34 && py < -14, legs = py >= -14 && py < 0 && Math.abs(Math.abs(px) - (py + 14) * 0.28) < 1.4;
          if (head || trunk || legs) mask[y * BW + x] = 1;
        }
    for (let i = 0; i < mask.length; i++) dist[i] = mask[i] ? 0 : 255;
    const relax = (i: number, j: number, w: number) => dist[j]! + w < dist[i]! && (dist[i] = dist[j]! + w);
    for (let y = 0; y < BH; y++)
      for (let x = 0; x < BW; x++) {
        const i = y * BW + x;
        if (x > 0) relax(i, i - 1, 3);
        if (y > 0) { relax(i, i - BW, 3); if (x > 0) relax(i, i - BW - 1, 4); if (x < BW - 1) relax(i, i - BW + 1, 4); }
      }
    for (let y = BH - 1; y >= 0; y--)
      for (let x = BW - 1; x >= 0; x--) {
        const i = y * BW + x;
        if (x < BW - 1) relax(i, i + 1, 3);
        if (y < BH - 1) { relax(i, i + BW, 3); if (x < BW - 1) relax(i, i + BW + 1, 4); if (x > 0) relax(i, i + BW - 1, 4); }
      }
  }
  function onBody(): [number, number] {
    for (let n = 0; n < 40; n++) { const x = R.int(0, BW - 1), y = R.int(0, BH - 1); if (mask[y * BW + x]) return [bx0 + x + 0.5, by0 + y + 0.5]; }
    return [bx0 + BW / 2, midY];
  }
  return {
    update(dt: number) {
      t += dt;
      body();
      const [fx, fy] = feet(), ccx = fx / PX, ccy = midY;
      if (t < BURST) {
        for (let i = 0; i < Math.round(3 * S); i++) {
          const a = R.range(0, TAU), r = R.range(34, 64) * Math.sqrt(S), sp = R.range(260, 420);
          motes.push({ k: IN, x: ccx + Math.cos(a) * r, y: ccy + Math.sin(a) * r * 0.8, vx: -Math.cos(a) * sp, vy: -Math.sin(a) * sp * 0.8, life: (r * PX) / sp, max: (r * PX) / sp, c: R.chance(0.3) ? C[1]! : C[2]!, s: 1, front: true });
        }
      }
      if (!burst && t >= BURST) {
        burst = true;
        o.shake?.(0.32 * S);
        o.flash?.(0.22 * S, `${C[3]! & 255},${(C[3]! >>> 8) & 255},${(C[3]! >>> 16) & 255}`);
        for (let i = 0; i < 18 * S; i++) {
          const side = R.sign();
          motes.push({ k: DUST, x: ccx + side * R.range(2, 10), y: fy / PX - R.range(0, 3), vx: side * R.range(60, 170), vy: -R.range(2, 16), life: R.range(0.45, 0.8), max: 0.8, c: mix(DUSTC, C[4]!, 0.25), s: R.range(1.5, 3), front: false });
        }
        for (let i = 0; i < 22 * S; i++) {
          const [x, y] = onBody();
          motes.push({ k: STAR, x, y, vx: R.range(-40, 40), vy: -R.range(30, 110), life: R.range(0.6, 1.3), max: 1.3, c: R.pick(TOP), s: R.chance(0.35) ? 2 : R.chance(0.5) ? 1 : 0, front: R.chance(0.6) });
        }
      }
      const a = aura();
      if (burst && a > 0.05) {
        for (let n = 0; n < (5 + 5 * flare()) * a * S * dt * 10; n++) {
          const [x] = onBody(), side = R.sign();
          motes.push({ k: STREAK, x: x + side * R.range(5, 16) * Math.sqrt(S), y: ccy + R.range(-16, 26), vx: 0, vy: -R.range(220, 420), life: R.range(0.14, 0.3), max: 0.3, c: R.chance(0.5) ? C[2]! : C[1]!, s: R.range(6, 16), front: R.chance(0.5) });
        }
        for (let n = 0; n < 9 * a * S * dt; n++) {
          const [x, y] = onBody(), up = clamp((midY - y) / 16);
          if (R.chance(1 - up * 0.8)) continue;
          motes.push({ k: WISP, x: x + R.range(-4, 4), y: y - R.range(6, 12) * S, vx: R.range(-15, 15), vy: -R.range(70, 130), life: R.range(0.3, 0.55), max: 0.55, c: C[2]!, s: R.range(1.4, 2.4) * Math.sqrt(S), front: false });
        }
        if (R.chance(0.5 * a)) {
          const [x, y] = onBody();
          motes.push({ k: STAR, x: x + R.range(-8, 8), y, vx: R.range(-10, 10), vy: -R.range(25, 70), life: R.range(0.6, 1.1), max: 1.1, c: R.pick(TOP), s: R.chance(0.25) ? 1 : 0, front: R.chance(0.5) });
        }
      }
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i]!;
        if ((m.life -= dt) <= 0) { motes.splice(i, 1); continue; }
        const drag = m.k === DUST ? 3.5 : m.k === STAR ? 1.4 : 0;
        m.vx -= m.vx * drag * dt;
        m.vy -= m.vy * drag * dt;
        if (m.k === STAR) m.vy -= 18 * dt;
        m.x += (m.vx * dt) / PX;
        m.y += (m.vy * dt) / PX;
      }
    },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      const [fx, fy] = feet(), cx = fx / PX, gy = fy / PX, a = aura(), fl = flare();
      if (layer !== "front") {
        for (const m of motes) if (m.k === DUST) buf.alphaDisc(m.x, m.y, m.s * (1.6 - (m.life / m.max) * 0.6), m.c, (m.life / m.max) * 0.6);
        if (a > 0.02)
          for (let y = 0; y < BH; y++)
            for (let x = 0; x < BW; x++) {
              const d = dist[y * BW + x]! / 3;
              if (d === 0 || d > 24) continue;
              const px = bx0 + x, py = by0 + y;
              const n = Math.pow(noise2(px * 0.5, (py + t * 34) * 0.26, 7) * 0.5 + 0.5, 1.4), up = clamp((midY - py) / 16);
              const reach = a * S * (3.4 + 14 * n * (0.3 + 1.15 * up)) * (1 + 0.3 * fl);
              if (d > reach) continue;
              const band = d / reach;
              if (band < 0.22) buf.set(px, py, fl > 0.35 && band < 0.14 ? C[0]! : C[1]!);
              else if (band < 0.45) buf.set(px, py, C[2]!);
              else if (band < 0.7) buf.set(px, py, C[3]!);
              else if (bayer(px, py) < (1 - band) * 2.6) buf.set(px, py, band < 0.86 ? C[4]! : C[5]!);
            }
        for (const m of motes) if (!m.front) drawMote(buf, light, m);
        light.glow(cx, midY, (34 + 20 * fl) * S, C[3]!, (0.35 * a + 0.3 * fl) * Math.min(1.4, S));
        light.glow(cx, gy - 2, 30 * S, C[2]!, 0.25 * a);
      }
      if (layer === "back") return;
      if (burst) shock(buf, light, cx, gy, t - BURST, 0.45 * S, C);
      const e = burst ? Math.max(...[BURST, PULSE1, PULSE2].map((p) => Math.exp(-(((t - p) / 0.07) ** 2)))) : 0;
      if (e > 0.03) {
        const s = o.actor?.silhouette?.();
        let n = 0, sx = 0, top = Infinity, bot = -1;
        const tint = (x: number, y: number, l: number) => {
          (n++, (sx += x), (top = Math.min(top, y)), (bot = y));
          dot(buf, x, y, l > 0.5 ? (e > 0.75 ? C[0]! : C[1]!) : l > 0.22 ? C[2]! : C[4]!, e * 1.5);
        };
        if (s) for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) { const c = s.data[j * s.w + i]!; if (c >>> 24) tint(s.x + i, s.y + j, lum(c)); }
        else for (let i = 0; i < BW * BH; i++) if (mask[i]) tint(bx0 + (i % BW), by0 + Math.floor(i / BW), 0.6);
        if (n) light.glow(sx / n, (top + bot) / 2, 26, C[3]!, 0.45 * e);
      }
      for (const m of motes) if (m.front) drawMote(buf, light, m);
    },
    done: () => t > END && motes.length === 0,
  };
}
const IN = 0, DUST = 1, STREAK = 2, STAR = 3, WISP = 4;
interface Mote { k: number; x: number; y: number; vx: number; vy: number; life: number; max: number; c: number; s: number; front: boolean }
const DUSTC = hex("#6a5e82");
function drawMote(buf: Px, light: Px, m: Mote) {
  const k = m.life / m.max;
  if (m.k === IN) {
    const sp = Math.hypot(m.vx, m.vy) || 1, ux = m.vx / sp, uy = m.vy / sp;
    buf.line(m.x - ux * 7, m.y - uy * 7, m.x - ux * 3, m.y - uy * 3, m.c);
    buf.line(m.x - ux * 2.5, m.y - uy * 2.5, m.x, m.y, WHITE);
  } else if (m.k === STREAK) {
    const l = m.s * (0.5 + 0.5 * k);
    for (let j = 0; j <= l; j++) dot(buf, m.x, m.y + j, j < 1.5 ? WHITE : m.c, j < l * 0.5 ? 1 : (1 - j / (l + 1)) * 1.6);
    light.glow(m.x, m.y + l * 0.3, 4, m.c, 0.3 * k);
  } else if (m.k === WISP) {
    const r = m.s * (0.35 + 0.65 * k);
    buf.disc(m.x, m.y, r + 0.7, k > 0.5 ? m.c : scale(m.c, 0.7));
    if (k > 0.35) buf.disc(m.x - 0.3, m.y - 0.4, r * 0.55, k > 0.7 ? WHITE : m.c);
    light.glow(m.x, m.y, 5 + r * 2, m.c, 0.3 * k);
  } else if (m.k === STAR) {
    const px = Math.floor(m.x), py = Math.floor(m.y), tw = 0.6 + 0.4 * Math.sin(m.life * 26 + m.x);
    if (tw * k < 0.2) return;
    const arm = Math.round(m.s * tw * Math.min(1, k * 2.5));
    for (let d = 1; d <= arm; d++) {
      const c = d === arm && arm > 1 ? scale(m.c, 0.75) : m.c;
      buf.set(px + d, py, c);
      buf.set(px - d, py, c);
      buf.set(px, py + d, c);
      buf.set(px, py - d, c);
    }
    buf.set(px, py, tw > 0.75 ? WHITE : m.c);
    light.glow(m.x, m.y, 3 + arm * 2, m.c, 0.45 * k * tw);
  }
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
  disc(cx: number, cy: number, r: number, c: number) {
    if (r <= 0.5) return this.set(Math.round(cx), Math.round(cy), c);
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const dy = y + 0.5 - cy;
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const dx = x + 0.5 - cx; if (dx * dx + dy * dy <= r2) this.set(x, y, c); }
    }
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
function dot(buf: Px, x: number, y: number, c: number, a = 1) {
  const px = Math.floor(x), py = Math.floor(y);
  if (a >= 1 || a > bayer(px, py)) buf.set(px, py, c);
}
function shock(buf: Px, light: Px, cx: number, fy: number, t: number, z: number, L: number[]) {
  const R = 72 * z, q = t / 0.55;
  if (q < 0 || q >= 1.8) return;
  if (q < 0.5)
    for (let dx = -Math.round(14 * z); dx <= 14 * z; dx++) {
      const u = Math.abs(dx) / (14 * z), a = (1 - q / 0.5) * (1 - u) * 2.2;
      dot(buf, cx + dx, fy, u < 0.3 ? WHITE : u < 0.6 ? L[1]! : L[2]!, a);
      dot(buf, cx + dx, fy - 1, u < 0.4 ? L[1]! : L[2]!, a * 0.7);
      dot(buf, cx + dx, fy + 1, L[2]!, a * 0.5);
    }
  const reach = 4 + R * outExpo(Math.min(1, q)), after = 1 - clamp((q - 0.25) / 1.4), f = Math.floor(t * 20);
  for (let dx = -Math.round(reach); dx <= reach; dx++) {
    const u = Math.abs(dx) / reach, g = hash(Math.round(cx + dx) * 7 + f * 613) < 0.04 * after;
    dot(buf, cx + dx, fy, g ? WHITE : u < 0.5 ? L[2]! : L[3]!, g ? 1 : after * 0.8 * (1 - u * 0.5));
    dot(buf, cx + dx, fy - 1, L[3]!, after * 0.3 * (1 - u));
  }
  if (q < 1) {
    const head = 4 + R * outExpo(q), len = (6 + 22 * (1 - q)) * z, crest = 6 * z * (1 - q) ** 0.7;
    for (const sd of [-1, 1]) {
      for (let j = 0; j < len; j++) {
        const x = cx + sd * (head - j), a = (1 - j / len) * (1 - q) * 2.2, lift = Math.round(crest * Math.max(0, 1 - j / (len * 0.5)));
        dot(buf, x, fy, j < 2 ? WHITE : j < len * 0.35 ? L[1]! : j < len * 0.7 ? L[2]! : L[3]!, a);
        for (let r = 1; r <= lift; r++) dot(buf, x, fy - r, j < 2 && r > lift - 2 ? WHITE : r === lift ? L[1]! : L[2]!, a * (1 - r / (lift + 2)) * 1.4);
      }
      for (let r = 0; r < crest + 3; r++) dot(buf, cx + sd * head, fy - r, WHITE, (1 - q) * 1.6 * (1 - r / (crest + 3)));
      light.glow(cx + sd * head, fy - 3, 12 * z, L[2]!, 0.8 * (1 - q));
    }
    light.glow(cx, fy, reach, L[3]!, 0.25 * (1 - q));
  }
  for (let i = 0; i < Math.round(24 * z); i++) {
    const t0 = hash(i, 1) * 0.32, age = t - t0, life = 0.3 + hash(i, 4) * 0.3;
    if (age < 0 || age > life) continue;
    const sd = i % 2 ? 1 : -1, x = cx + sd * (4 + R * outExpo(t0 / 0.55)) + sd * (15 + hash(i, 2) * 70) * age, y = fy - 1 - ((60 + hash(i, 3) * 90) * age - 110 * age * age), k = 1 - age / life;
    if (y > fy - 1) continue;
    dot(buf, x, y, age < life * 0.3 ? WHITE : L[1]!, 1.4 * k);
    if (hash(i, 5) < 0.4 && k > 0.4) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(buf, x + ox!, y + oy!, L[2]!, k * 1.2);
    light.glow(x, y, 4, L[2]!, 0.45 * k);
  }
}
function lum(c: number) { return ((c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11) / 255; }
function rgb(r: number, g: number, b: number, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }
function hex(h: string) { const v = parseInt(h.replace("#", ""), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); }
function mix(c1: number, c2: number, t: number) {
  const u = 1 - t, ch = (c: number, s: number) => (c >>> s) & 255;
  return rgb(ch(c1, 0) * u + ch(c2, 0) * t, ch(c1, 8) * u + ch(c2, 8) * t, ch(c1, 16) * u + ch(c2, 16) * t, ch(c1, 24) * u + ch(c2, 24) * t);
}
function scale(c: number, k: number) {
  return rgb(Math.min(255, (c & 255) * k), Math.min(255, ((c >>> 8) & 255) * k), Math.min(255, ((c >>> 16) & 255) * k), c >>> 24);
}
const WHITE = hex("#ffffff");
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
function smooth(a: number, b: number, x: number) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function outExpo(t: number) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)); }
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
function noise2(x: number, y: number, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hash(a * 73 + b * 9301, seed) * 2 - 1;
  const top = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * u, bot = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * u;
  return top + (bot - top) * v;
}
