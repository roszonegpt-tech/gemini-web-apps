// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Actor { feet(): [number, number]; silhouette?(): { x: number; y: number; w: number; h: number; data: Uint32Array } | null }
export interface Options {
  kind?: "dash" | "blink";
  actor?: Actor;
  x?: number;
  y?: number;
  facing?: number;
  distance?: number;
  time?: number;
  to?: number;
  colors?: readonly number[];
  groundColor?: number;
  ground?: number | ((x: number) => number);
  seed?: number;
  shake?(trauma: number): void;
  flash?(k: number, rgb: string): void;
  ripple?(x: number, y: number, r0: number, r1: number, dur: number, amp: number, w: number): void;
  cue?(name: string, data?: Record<string, number>): void;
}
interface Kit { update(t: number, dt: number): void; draw(buf: Px, light: Px, layer: Layer, t: number): void; done(t: number): boolean }
interface Env { o: Options; C: readonly number[]; R: Rng; ps: Particles; groundAt: (x: number) => number; feet: () => [number, number]; dust: number }
export default function movement(o: Options = {}) {
  const R = new Rng(o.seed ?? 1);
  const [fx0, fy0] = o.actor?.feet() ?? [o.x ?? 500, o.y ?? 600];
  const groundAt = (x: number) => (o.ground === undefined ? fy0 : typeof o.ground === "number" ? o.ground : o.ground(x));
  const env: Env = { o, C: o.colors ?? DASH, R, ps: new Particles(R, groundAt), groundAt, feet: () => o.actor?.feet() ?? [fx0, fy0], dust: mix(scale(o.groundColor ?? STONE, 0.92), rgb(150, 140, 150), 0.35) };
  const k: Kit = o.kind === "blink" ? blink(env) : dash(env);
  let t = 0;
  return {
    update(dt: number) { t += dt; k.update(t, dt); env.ps.update(dt); },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      for (const l of layer ? [layer] : (["back", "front"] as const)) {
        if (l === "back") env.ps.draw(buf, light, "back");
        k.draw(buf, light, l, t);
        if (l === "front") env.ps.draw(buf, light, "front");
      }
    },
    done: () => k.done(t) && env.ps.list.length === 0,
  };
}
function kick(e: Env, x: number, y: number, n: number, spread: number) {
  const R = e.R;
  for (let i = 0; i < n; i++) e.ps.spawn(K.DUST, x + R.range(-3, 3), y - 1, R.sign() * R.range(20, 110) * spread, -R.range(5, 45), R.range(0.3, 0.65), e.dust, R.range(1.3, 2.8));
}
function dash(e: Env): Kit {
  const { o, C, R, ps } = e;
  const DX0 = o.x ?? e.feet()[0], F = o.facing ?? 1, DIST = o.distance ?? 400;
  const D0 = 0.12, D1 = D0 + (o.time ?? 0.2), DX1 = DX0 + F * DIST;
  const G = e.groundAt(DX0), gy = G / PX;
  const dashX = (t: number) => (t < D0 ? DX0 : t < D1 ? DX0 + F * DIST * (1 - (1 - (t - D0) / (D1 - D0)) ** 1.6) : DX1);
  const ghosts: { x0: number; y0: number; w: number; h: number; m: Uint8Array; t: number }[] = [];
  const lines: { x: number; y: number; l: number; t: number }[] = [];
  const capture = (x: number, t: number) => {
    const s = o.actor?.silhouette?.();
    if (s) {
      const m = new Uint8Array(s.w * s.h);
      for (let i = 0; i < m.length; i++) m[i] = shade(s.data[i]!);
      ghosts.push({ x0: s.x, y0: s.y, w: s.w, h: s.h, m, t });
      return;
    }
    const w = 12, h = 30, m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) m[y * w + xx] = Math.abs(xx + 0.5 - w / 2) < 3.2 * Math.sin((Math.PI * (y + 0.5)) / h) ? 2 : 0;
    ghosts.push({ x0: Math.round(x / PX - w / 2), y0: Math.round(gy - h), w, h, m, t });
  };
  let lastX = NaN, started = false, stopped = false, stopX = DX1, skidV = 0, skidX = DX1;
  return {
    done: (t) => t > D1 + 1.2,
    update(t, dt) {
      const fy = o.actor ? e.feet()[1] : G;
      if (t >= D0 && t < D1) {
        const x = dashX(t);
        o.cue?.("move", { x, vx: F * 1600 });
        if (Number.isNaN(lastX) || (Math.abs(x - lastX) > 44 && t > D0 + 0.06)) (lastX = x), capture(x, t);
        for (let k = 0; k < 4; k++) lines.push({ x: x / PX - F * R.range(4, 16), y: fy / PX - R.range(2, 44), l: R.range(16, 64), t });
      }
      if (!started && t >= D0) {
        started = true;
        kick(e, DX0, G, 14, 1.6);
        for (let i = 0; i < 8; i++) ps.spawn(K.SMOKE, DX0 + R.range(-6, 6), G - R.range(2, 12), -F * R.range(80, 260), -R.range(10, 50), R.range(0.6, 1.1), DUST, R.range(3, 6));
        o.ripple?.(DX0, G - 40, 10, 160, 0.3, 0.1, 18);
      }
      if (!stopped && t >= D1) { stopped = true; skidV = 700; o.cue?.("move", { vx: F * skidV }); o.shake?.(0.25); }
      if (stopped && skidV > 60) {
        skidV = Math.max(0, skidV - 4600 * dt);
        skidX += F * skidV * dt;
        const x = o.actor ? e.feet()[0] : skidX;
        stopX = x;
        ps.spawn(K.DUST, x + F * 8, G - 2, F * R.range(60, 260), -R.range(20, 90), R.range(0.4, 0.8), DUST, R.range(1.5, 3));
        if (R.chance(0.6)) ps.spawn(K.SPARK, x + F * 6, G - 1, F * R.range(200, 600), -R.range(40, 200), R.range(0.1, 0.25));
        if (R.chance(0.4)) ps.spawn(K.SMOKE, x, G - 4, F * R.range(40, 140), -R.range(10, 40), R.range(0.6, 1), DUST, R.range(3, 5));
      }
      for (let i = lines.length - 1; i >= 0; i--) if (t - lines[i]!.t > 0.2) lines.splice(i, 1);
      for (let i = ghosts.length - 1; i >= 0; i--) if (t - ghosts[i]!.t > 0.4) ghosts.splice(i, 1);
    },
    draw(buf, light, layer, t) {
      if (layer === "back") {
        if (t >= D1) {
          const a = 0.8 * (1 - smooth(0.6, 1.4, t - D1)), x0 = (DX1 - F * 70) / PX, x1 = stopX / PX;
          for (let x = Math.floor(Math.min(x0, x1)); x <= Math.max(x0, x1); x++) dot(buf, x, gy, SKID, a * Math.min(1, Math.abs(x - x0) / 12));
        }
        for (const gh of ghosts) {
          const k = (t - gh.t) / 0.4, i = Math.min(C.length - 3, 1 + Math.floor(k * (C.length - 3))), a = k < 0.45 ? 1 : (1 - k) / 0.55;
          for (let y = 0; y < gh.h; y++)
            for (let x = 0; x < gh.w; x++) { const v = gh.m[y * gh.w + x]!; if (v) dot(buf, gh.x0 + x, gh.y0 + y, v === 1 ? C[i + 2]! : C[i + 2 - v]!, a); }
        }
        for (const l of lines) {
          const k = (t - l.t) / 0.2;
          for (let d = 0; d < l.l * (1 - k * 0.6); d++) dot(buf, l.x - F * d, l.y, d < 3 ? C[0]! : d < l.l * 0.4 ? C[1]! : C[3]!, (1 - d / l.l) * (1 - k));
        }
        return;
      }
      if (t >= D0 && t < D0 + 0.08) {
        const k = (t - D0) / 0.08;
        ellipse(buf, DX0 / PX, gy, 10 * (0.5 + k), 2.5, C[0]!, 1 - k);
        ringE(buf, DX0 / PX, gy, 6 + 18 * k, 2 + 3 * k, 1.5, C[2]!, 1 - k);
      }
      if (t >= D0 && t < D1 + 0.1) { const [x, y] = o.actor ? e.feet() : [dashX(t), G]; light.glow(x / PX, y / PX - 20, 40, C[3]!, 0.35); }
    },
  };
}
function blink(e: Env): Kit {
  const { o, R, ps } = e;
  const [AX, FY] = e.feet(), BX = o.to ?? AX + 260;
  const [C, A] = o.colors ? [o.colors, o.colors] : [ICE, ARCANE];
  const OUT = 0.3, IN = 0.55, ARRIVE = IN + 0.35;
  const COLS = [WHITE, C[1]!, C[2]!, A[1]!, A[2]!, C[3]!];
  const lights: Light[] = [];
  let sil: Sil | null = null, out = false, unhid = false, arrived = false;
  const bits: { x: number; y: number; vx: number; vy: number; life: number; max: number; c: number; d: number }[] = [];
  const inbound: { tx: number; ty: number; ox: number; oy: number; t0: number; c: number }[] = [];
  const box = { x0: Math.round(AX / PX) - 20, y0: Math.round(FY / PX) - 48, w: 48, h: 50 };
  const cx = box.x0 + 20, my = box.y0 + box.h * 0.55, shift = Math.round((BX - AX) / PX);
  return {
    done: (t) => t > ARRIVE + 0.5 && bits.length === 0,
    update(t, dt) {
      if (t < OUT) sil = grab(o.actor?.silhouette?.() ?? null, box.x0, box.y0, box.w, box.h) ?? sil;
      if (t < OUT && R.chance(0.6)) {
        const a = R.range(0, TAU), d = R.range(40, 80);
        ps.spawn(K.PLASMA, AX + Math.cos(a) * d, FY - 36 + Math.sin(a) * d, -Math.cos(a) * d * 5, -Math.sin(a) * d * 5, R.range(0.14, 0.2));
      }
      if (t >= OUT && !out) {
        out = true;
        o.cue?.("vanish");
        o.flash?.(0.35, "200,240,255");
        lights.push({ x: AX, y: FY - 36, r: 150, color: C[3]!, k: 0.9, life: 0.3, max: 0.3 });
        if (sil)
          for (let y = 0; y < sil.h; y++)
            for (let x = 0; x < sil.w; x++) {
              if (!sil.px[y * sil.w + x] || R.chance(0.15)) continue;
              const px = sil.x0 + x, py = sil.y0 + y;
              bits.push({ x: px, y: py, vx: (px - cx) * R.range(3, 9) + R.range(-14, 14), vy: -R.range(10, 60), life: R.range(0.35, 0.8), max: 0.8, c: R.pick(COLS), d: (y / sil.h) * 0.1 });
            }
      }
      if (t >= IN && !unhid) {
        unhid = true;
        o.cue?.("appear", { x: BX, y: FY });
        if (sil)
          for (let y = 0; y < sil.h; y++)
            for (let x = 0; x < sil.w; x++) {
              if (!sil.px[y * sil.w + x] || R.chance(0.2)) continue;
              const a = R.range(0, TAU), d = R.range(14, 34);
              inbound.push({ tx: sil.x0 + x + shift, ty: sil.y0 + y, ox: Math.cos(a) * d, oy: Math.sin(a) * d - 10, t0: IN + R.range(0, 0.12), c: R.pick(COLS) });
            }
      }
      if (t >= ARRIVE && !arrived) {
        arrived = true;
        o.shake?.(0.2);
        for (let i = 0; i < 30; i++) {
          const a = R.range(0, TAU), sp = R.range(60, 260);
          ps.spawn(K.STAR, BX, FY - 36, Math.cos(a) * sp, Math.sin(a) * sp * 0.7 - 40, R.range(0.4, 0.9), R.pick(COLS), R.range(0.6, 1.6));
        }
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i]!;
        if (b.d > 0) { b.d -= dt; continue; }
        if ((b.life -= dt) <= 0) bits.splice(i, 1);
        b.vy -= 60 * dt;
        b.vx -= b.vx * 2.5 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      for (let i = lights.length - 1; i >= 0; i--) if ((lights[i]!.life -= dt) <= 0) lights.splice(i, 1);
    },
    draw(buf, light, layer, t) {
      if (layer === "back") return;
      for (const [x, t0] of [[AX, OUT], [BX, ARRIVE - 0.02]] as const) {
        const k = (t - t0) / 0.45;
        if (k < 0 || k > 1) continue;
        ringE(buf, x / PX, FY / PX, 4 + 30 * outCubic(k), 1 + 6 * outCubic(k), 2 * (1 - k) + 0.5, k < 0.3 ? WHITE : C[2]!, 1.1 - k);
      }
      if (t > OUT + 0.04 && t < OUT + 0.3) {
        const k = (t - OUT - 0.04) / 0.26, head = lerp(AX, BX, outExpo(k)) / PX, tail = lerp(AX, BX, outExpo(k - 0.25)) / PX, y = (FY - 40) / PX;
        for (let x = Math.min(head, tail); x <= Math.max(head, tail); x += 0.5) {
          const u = (x - tail) / (head - tail || 1);
          dot(buf, x, y, u > 0.8 ? WHITE : C[2]!, u + 0.1);
          dot(buf, x, y + 1, A[2]!, u * 0.6);
        }
        light.glow(head, y, 14, C[2]!, 0.6);
      }
      if (sil) {
        if (t > 0 && t < OUT) {
          const k = t / OUT, S = sil;
          const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < S.w && yy < S.h && S.px[yy * S.w + xx];
          for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (!S.px[y * S.w + x] && (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) && hash(x * 61 + y + Math.floor(t * 30) * 977) < 0.35 + 0.6 * k) buf.set(S.x0 + x, S.y0 + y, k > 0.7 && hash(x + y * 7) < 0.5 ? WHITE : C[2]!);
          light.glow(cx, S.y0 + S.h * 0.6, 30, C[3]!, 0.5 * k);
        }
        if (t >= OUT && t < OUT + 0.18) {
          const k = (t - OUT) / 0.1;
          if (k < 1) drawSil(buf, sil, cx, 1 - k, k < 0.5 ? WHITE : C[1]!, C[2]!, 1);
          else {
            const hh = (sil.h / 2) * (1 - (t - OUT - 0.1) / 0.08);
            for (let y = -hh - 4; y <= hh + 4; y++) dot(buf, cx, my + y, Math.abs(y) < hh ? WHITE : C[2]!);
          }
          light.glow(cx, my, 40, C[2]!, 0.8);
        }
        if (t > OUT + 0.18 && t < OUT + 0.9) drawSil(buf, sil, cx, 1, A[2]!, A[4]!, 0.45 * (1 - (t - OUT - 0.18) / 0.72));
        if (t > IN && t < ARRIVE + 0.02) {
          const k = (t - IN) / (ARRIVE - IN);
          if (k < 0.55) {
            const hh = (sil.h / 2 + 3) * outCubic(k / 0.55);
            for (let y = -hh; y <= hh; y++) dot(buf, cx + shift, my + y, WHITE, 1 - (Math.abs(y) / (hh + 1)) * 0.6);
          } else drawSil(buf, sil, cx, outCubic((k - 0.55) / 0.45), k > 0.85 ? WHITE : C[1]!, k > 0.85 ? C[2]! : C[3]!, 1, shift);
          light.glow(cx + shift, my, 34, C[2]!, 0.7 * k);
        }
      } else if (t > IN && t < ARRIVE + 0.02) {
        const k = (t - IN) / (ARRIVE - IN), hh = 28 * outCubic(k / 0.55) * (1 - smooth(0.8, 1, k));
        for (let y = -hh; y <= hh; y++) dot(buf, cx + shift, my + y, WHITE, 1 - (Math.abs(y) / (hh + 1)) * 0.6);
        light.glow(cx + shift, my, 34, C[2]!, 0.7 * k);
      }
      for (const p of inbound) {
        const k = (t - p.t0) / (ARRIVE - p.t0);
        if (k < 0 || k >= 1) continue;
        const e = outCubic(k);
        dot(buf, p.tx + p.ox * (1 - e), p.ty + p.oy * (1 - e), k > 0.8 ? WHITE : p.c, 0.4 + 0.6 * k);
      }
      for (const b of bits) if (b.d <= 0) dot(buf, b.x, b.y, b.life / b.max > 0.75 ? WHITE : b.c, Math.min(1, (b.life / b.max) * 1.6));
      for (const l of lights) { const k = l.life / l.max; light.glow(l.x / PX, l.y / PX, (l.r / PX) * (0.55 + 0.45 * k), l.color, l.k * k * k); }
    },
  };
}
interface Light { x: number; y: number; r: number; color: number; k: number; life: number; max: number }
function drawSil(buf: Px, s: Sil, cx: number, sx: number, c: number, edge: number, a: number, dx = 0) {
  if (sx <= 0.02) return;
  const half = s.w / 2 + 2;
  for (let y = 0; y < s.h; y++)
    for (let x = Math.floor(cx - half * sx); x <= Math.ceil(cx + half * sx); x++) {
      const i = Math.round(cx + (x + 0.5 - cx) / sx - 0.5) - s.x0, v = i < 0 || i >= s.w ? 0 : s.px[y * s.w + i]!;
      if (v) dot(buf, x + dx, s.y0 + y, v === 1 ? edge : c, a);
    }
}
function shade(c: number) {
  const l = (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;
  return c >>> 24 !== 255 ? 0 : l < 60 ? 1 : l < 170 ? 2 : 3;
}
interface Sil { x0: number; y0: number; w: number; h: number; px: Uint8Array }
function grab(s: { x: number; y: number; w: number; h: number; data: Uint32Array } | null, x0: number, y0: number, w: number, h: number): Sil | null {
  if (!s) return null;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x0 + x - s.x, sy = y0 + y - s.y;
      if (sx >= 0 && sy >= 0 && sx < s.w && sy < s.h) px[y * w + x] = shade(s.data[sy * s.w + sx]!);
    }
  return { x0, y0, w, h, px };
}
function rgb(r: number, g: number, b: number, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }
function hex(h: string) { const v = parseInt(h.replace("#", ""), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); }
function mix(c1: number, c2: number, t: number) {
  const u = 1 - t, ch = (c: number, s: number) => (c >>> s) & 255;
  return rgb(ch(c1, 0) * u + ch(c2, 0) * t, ch(c1, 8) * u + ch(c2, 8) * t, ch(c1, 16) * u + ch(c2, 16) * t, ch(c1, 24) * u + ch(c2, 24) * t);
}
function scale(c: number, k: number) {
  return rgb(Math.min(255, (c & 255) * k), Math.min(255, ((c >>> 8) & 255) * k), Math.min(255, ((c >>> 16) & 255) * k), c >>> 24);
}
function ramp(stops: readonly number[], t: number) {
  const u = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1), i = Math.floor(u);
  return mix(stops[i]!, stops[i + 1]!, u - i);
}
const WHITE = hex("#ffffff");
const DASH = ["#ffffff", "#ccf6ff", "#a3dcff", "#5eb0ff", "#5b6cff", "#773ae4", "#4c25ab"].map(hex);
const ICE = ["#ffffff", "#dcfbff", "#a6ecff", "#62c8f4", "#3a8bd8", "#2c58aa", "#212f6b", "#151a3d"].map(hex);
const ARCANE = ["#ffffff", "#f4ddff", "#d6a0ff", "#a862ff", "#773ae4", "#4c25ab", "#2b1569", "#170b3b"].map(hex);
const STONE = hex("#4a3f69"), DUST = rgb(96, 84, 112), SKID = hex("#221a33");
const SPARKS = { hot: hex("#fff3a6"), yellow: hex("#ffe26b"), orange: hex("#ff8a2a"), tail: hex("#f2561d") };
const PLASMA = { cyan: hex("#7ff3ff"), deep: hex("#1ab8e6") };
const SMOKE_RAMP = ["#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e"].map(hex);
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
function dot(buf: Px, x: number, y: number, c: number, a = 1) {
  const px = Math.floor(x), py = Math.floor(y);
  if (a >= 1 || a > bayer(px, py)) buf.set(px, py, c);
}
function ellipse(buf: Px, cx: number, cy: number, rx: number, ry: number, c: number, a = 1) {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (a >= 1 || a > bayer(x, y))) buf.set(x, y, c);
    }
}
function ringE(buf: Px, cx: number, cy: number, rx: number, ry: number, thick: number, c: number, a = 1) {
  const n = Math.ceil(Math.max(rx, ry) * TAU * 1.3);
  for (let j = 0; j < n; j++) {
    const ang = (j / n) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let off = -thick / 2; off <= thick / 2; off += 0.5) dot(buf, cx + ca * (rx + off), cy + sa * (ry + off * (ry / Math.max(1, rx))), c, a);
  }
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
  sign() { return this.next() < 0.5 ? -1 : 1; }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]!; }
}
const TAU = Math.PI * 2;
function clamp(v: number, a = 0, b = 1) { return v < a ? a : v > b ? b : v; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function smooth(a: number, b: number, x: number) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function outCubic(t: number) { return 1 - Math.pow(1 - clamp(t), 3); }
function outExpo(t: number) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)); }
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
const GRAVITY = 1900;
const K = { SPARK: 0, PLASMA: 1, STAR: 2, SMOKE: 3, DUST: 4 } as const;
type K = (typeof K)[keyof typeof K];
interface P { k: K; x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; size: number; seed: number }
class Particles {
  list: P[] = [];
  t = 0;
  R: Rng;
  ground: (x: number) => number;
  constructor(R: Rng, ground: (x: number) => number) { this.R = R; this.ground = ground; }
  spawn(k: K, x: number, y: number, vx: number, vy: number, life: number, col = 0, size = 1) {
    this.list.push({ k, x, y, vx, vy, life, max: life, col, size, seed: this.R.next() * 100 });
  }
  update(dt: number) {
    this.t += dt;
    const t = this.t, L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]!;
      if ((p.life -= dt) <= 0) { L.splice(i, 1); continue; }
      switch (p.k) {
        case K.SPARK:
        case K.PLASMA: {
          p.vy += GRAVITY * 0.45 * dt;
          p.vx -= p.vx * 2.2 * dt;
          p.vy -= p.vy * 2.2 * dt;
          const g = this.ground(p.x), ny = p.y + p.vy * dt;
          p.x += p.vx * dt;
          if (p.vy > 0 && p.y <= g && ny >= g) { p.vy = -p.vy * 0.45; p.vx *= 0.7; p.y = g - 0.5; } else p.y = ny;
          break;
        }
        case K.STAR:
          p.vx -= p.vx * 1.6 * dt;
          p.vy -= p.vy * 1.6 * dt + 10 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case K.SMOKE:
          p.vy -= 32 * dt;
          p.vx += Math.sin(t * 1.3 + p.seed) * 16 * dt;
          p.vx -= p.vx * 1.6 * dt;
          p.vy -= p.vy * 1.2 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case K.DUST:
          p.vx -= p.vx * 4 * dt;
          p.vy -= p.vy * 4 * dt + 10 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
      }
    }
  }
  draw(buf: Px, light: Px, layer: Layer) {
    const back = layer === "back";
    for (const p of this.list) {
      const behind = p.k === K.SMOKE || p.k === K.DUST;
      if (behind !== back) continue;
      const k = p.life / p.max, ax = p.x / PX, ay = p.y / PX, px = Math.floor(ax), py = Math.floor(ay);
      switch (p.k) {
        case K.SMOKE: {
          const age = 1 - k, r = p.size * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * 0.4);
          const a = Math.min(1, age * 12) * Math.min(1, k * 2.4) * 0.58, c = mix(p.col, ramp(SMOKE_RAMP, age), age);
          buf.alphaDisc(ax, ay, r, c, a * 0.45);
          buf.alphaDisc(ax + r * 0.05, ay + r * 0.06, r * 0.74, c, a * 0.62);
          if (age < 0.5) buf.alphaDisc(ax - r * 0.22, ay - r * 0.3, r * 0.5, mix(c, WHITE, 0.12), a * 0.4 * (1 - age * 2));
          break;
        }
        case K.DUST:
          buf.alphaDisc(ax, ay, p.size * (0.6 + (1 - k) * 0.9), p.col, Math.pow(k, 1.3) * 0.7);
          break;
        case K.SPARK:
        case K.PLASMA: {
          const hot = p.k === K.PLASMA ? (k > 0.5 ? WHITE : k > 0.25 ? PLASMA.cyan : PLASMA.deep) : k > 0.6 ? SPARKS.hot : k > 0.3 ? SPARKS.yellow : SPARKS.orange;
          const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = Math.min(9, 1 + sp * 0.011);
          buf.line(ax - ux * len, ay - uy * len, ax - ux * len * 0.4, ay - uy * len * 0.4, k > 0.5 ? hot : p.k === K.PLASMA ? PLASMA.deep : SPARKS.tail);
          buf.line(ax - ux * len * 0.45, ay - uy * len * 0.45, ax, ay, hot);
          light.glow(ax, ay, 3, hot, 0.45 * k);
          break;
        }
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
          if (arm >= 3) for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) buf.set(px + dx!, py + dy!, tip);
          buf.set(px, py, WHITE);
          light.glow(ax, ay, 3 + arm * 2, p.col, 0.5 * k * tw);
          break;
        }
      }
    }
  }
}
