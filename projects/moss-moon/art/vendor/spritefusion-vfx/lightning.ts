// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Actor {
  hand?(): { x: number; y: number; a: number };
  silhouette?(): { x: number; y: number; w: number; h: number; data: Uint32Array } | null;
}
export interface Options {
  kind?: "strike" | "impact" | "arc" | "crackle";
  x?: number;
  y?: number;
  ground?: number | ((x: number) => number);
  colors?: number[];
  seed?: number;
  top?: number;
  strokes?: number;
  clouds?: boolean;
  size?: number;
  sparks?: number;
  actor?: Actor;
  from?: [number, number];
  to?: [number, number][];
  duration?: number;
  radius?: number;
  shake?(trauma: number): void;
  flash?(k: number, rgb: string): void;
  ripple?(x: number, y: number, r0: number, r1: number, dur: number, amp: number, w: number): void;
  darken?(k: number): void;
  cue?(name: string, data?: Record<string, number>): void;
}
interface Ctx { o: Options; R: Rng; V: number[]; ps: Particles; lights: Light[]; groundAt: (x: number) => number }
interface Run { update(dt: number): void; back?(buf: Px, light: Px): void; front(buf: Px, light: Px): void; over(): boolean; stop?(): void }
export default function lightning(o: Options = {}) {
  const R = new Rng(o.seed ?? 1), V = o.colors ?? VOLT, kind = o.kind ?? "strike";
  const groundAt = (x: number) => (o.ground === undefined ? (kind === "strike" ? 600 : Infinity) : typeof o.ground === "number" ? o.ground : o.ground(x));
  const ps = new Particles(R, groundAt, o.colors ? [V[0]!, V[2]!, V[4]!] : PLASMA), lights: Light[] = [];
  const c: Ctx = { o, R, V, ps, lights, groundAt };
  const run = kind === "impact" ? impact(c) : kind === "arc" ? arc(c) : kind === "crackle" ? crackle(c) : strike(c);
  return {
    update(dt: number) { run.update(dt); ps.update(dt); stepLights(lights, dt); },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      if (layer !== "front") { run.back?.(buf, light); ps.draw(buf, light, "back"); }
      if (layer !== "back") { run.front(buf, light); ps.draw(buf, light, "front"); drawLights(light, lights); }
    },
    stop: () => run.stop?.(),
    done: () => run.over() && ps.list.length === 0 && lights.length === 0,
  };
}
function strike({ o, R, V, ps, lights, groundAt }: Ctx): Run {
  const X = o.x ?? 790, G = groundAt(X), cx = X / PX, cy = G / PX, TOP = (o.top ?? G - 408) / PX;
  const strokes = [
    { t: 0.62, k: 1, b: bolt(R, cx + 18, TOP, cx, cy, 0.2, 0.75) },
    { t: 1.02, k: 0.85, b: bolt(R, cx - 14, TOP, cx + 1, cy, 0.2, 0.6) },
    { t: 1.36, k: 0.55, b: bolt(R, cx + 6, TOP, cx, cy, 0.24, 0.4) },
  ].slice(0, Math.max(1, Math.min(3, o.strokes ?? 3)));
  const LEAD = 0.42;
  const clouds = Array.from({ length: 24 }, (_, i) => ({ x: (X - 490) / PX + i * 15 + hash(i, 1) * 8, y: TOP + 22 + hash(i, 2) * 10, r: 12 + hash(i, 3) * 10 }));
  const crawls: { b: Bolt; t: number }[] = [];
  let t = 0, struck = -1, flash = 0;
  const now = () => {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i]!, a = t - s.t;
      if (a < 0) continue;
      const f = a < 0.03 ? 1 : a < 0.06 ? 0.55 : a < 0.1 ? 0.95 : a < 0.14 ? 0.4 : a < 0.17 ? 0.7 : 0;
      return { s, a, k: f * s.k };
    }
    return null;
  };
  return {
    update(dt) {
      t += dt;
      o.darken?.(0.55 * smooth(-0.3, 0.35, t) * (1 - smooth(2.1, 2.9, t)) * (1 - 0.7 * flash));
      flash = Math.max(0, flash - dt * 6);
      for (const [i, s] of strokes.entries()) {
        if (struck >= i || t < s.t) continue;
        struck = i;
        flash = s.k;
        o.flash?.(s.k, "225,236,255");
        o.shake?.(0.5 * s.k);
        o.ripple?.(X, G - 4, 20, 260 * s.k, 0.5, 0.18 * s.k, 22);
        const n = Math.round(60 * s.k);
        for (let j = 0; j < n; j++) {
          const a = -Math.PI / 2 + R.range(-1.4, 1.4), sp = R.range(240, 980) * s.k;
          ps.spawn(j % 3 ? K.PLASMA : K.SPARK, X, G - 3, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.2, 0.7));
        }
        for (let j = 0; j < 5; j++) ps.spawn(K.SMOKE, X + R.range(-12, 12), G - 6, R.range(-20, 20), R.range(-50, -20), R.range(1.4, 2.4), mix(SMOKE_TINT, V[5]!, 0.3), R.range(3, 6), R.range(0.1, 0.5));
        dust(ps, R, X, G, 8, 1.6);
        lights.push({ x: X, y: G - 60, r: 320, color: V[4]!, k: 0.7 * s.k, life: 0.3, max: 0.3 });
      }
      if (struck >= 0 && R.chance(0.6 * clamp(1 - (t - strokes[struck]!.t) / 0.4))) {
        const side = R.sign(), l = R.range(10, 28);
        crawls.push({ b: bolt(R, cx + side * R.range(1, 4), cy - 0.5, cx + side * l, cy - R.range(0, 2), 0.35, 0.2, 0.6), t });
      }
      for (let i = crawls.length - 1; i >= 0; i--) if (t - crawls[i]!.t > 0.08) crawls.splice(i, 1);
      if (t > strokes[0]!.t && t < 2.6 && R.chance(0.12)) ps.spawn(K.SMOKE, X + R.range(-10, 10), G - 2, R.range(-8, 8), R.range(-34, -18), R.range(1.4, 2.2), 0, R.range(2, 3.5));
    },
    back(buf, light) {
      const first = strokes[0]!, s = now();
      if (struck >= 0) scorch(buf, light, cx, cy, 20, Math.pow(clamp(1 - (t - first.t) / 2.2), 1.3));
      if (o.clouds !== false) {
        const lead = t > first.t - LEAD && t < first.t ? 0.35 + 0.35 * Math.sin(t * 50) : 0;
        const lit = Math.max(s?.k ?? 0, lead * 0.5, Math.max(0, Math.sin(t * 9 + 1)) * 0.2 * smooth(0, 0.3, t) * (t < 0.5 ? 1 : 0));
        storm(buf, light, clouds, cx, lit, t, V);
      }
    },
    front(buf, light) {
      const first = strokes[0]!, s = now();
      if (t > first.t - LEAD && t < first.t) {
        const reach = TOP + (cy - TOP) * Math.pow(Math.floor(((t - first.t + LEAD) / LEAD) * 9) / 9, 1.3);
        for (const p of first.b.paths)
          for (let i = 0; i < p.pts.length - 1; i++) {
            const [ax, ay] = p.pts[i]!, [bx, by] = p.pts[i + 1]!;
            if (by > reach) break;
            buf.line(ax, ay, bx, by, p.w >= 1 ? V[3]! : V[5]!);
            if (i % 4 === 0) light.glow(ax, ay, 6, V[4]!, 0.25);
          }
      }
      if (s && s.k > 0) {
        stroke(buf, light, s.s.b, s.k, V, 1);
        buf.disc(cx, cy - 1, 4 * s.k + 1.5, V[5]!);
        buf.disc(cx, cy - 1, 4 * s.k + 0.5, V[2]!);
        buf.disc(cx, cy - 1, 2.6 * s.k, V[0]!);
        light.glow(cx, cy - 10, 110, V[4]!, 0.55 * s.k);
        light.glow(cx, cy - 4, 26, V[2]!, 0.45 * s.k);
      } else if (s && s.a < 0.45) {
        const k = 1 - (s.a - 0.17) / 0.28;
        for (const p of s.s.b.paths) if (p.w >= 1) for (const [x, y] of p.pts) dot(buf, x, y, V[5]!, k * 0.8);
      }
      for (const c of crawls) drawBolt(buf, light, c.b, V, 1 - (t - c.t) / 0.1, 0.4);
      if (struck >= 0) light.glow(cx, cy - 2, 20, V[3]!, 0.35 * clamp(1 - (t - first.t) / 1.5));
    },
    over: () => t > 3,
  };
}
function impact({ o, R, V, ps }: Ctx): Run {
  const X = o.x ?? 780, Y = o.y ?? 524, S = o.size ?? 1, ax = X / PX, ay = Y / PX;
  let star: Bolt[] = [], starAt = -1, t = 0;
  const arcs: { b: Bolt; t: number }[] = [];
  o.flash?.(0.7, "200,226,255");
  o.shake?.(0.4 * Math.min(1.5, S));
  for (let i = 0; i < (o.sparks ?? 64); i++) {
    const a = R.range(0, TAU), sp = R.range(240, 900) * Math.sqrt(S);
    ps.spawn(K.PLASMA, X, Y, Math.cos(a) * sp, Math.sin(a) * sp - 100, R.range(0.2, 0.75));
  }
  for (let i = 0; i < 5; i++) ps.spawn(K.SMOKE, X + R.range(-14, 14) * S, Y + R.range(-10, 10) * S, R.range(-10, 10), R.range(-30, -12), R.range(1.2, 2), mix(SMOKE_TINT, V[4]!, 0.35), R.range(3, 5) * S, R.range(0.08, 0.25));
  return {
    update(dt) {
      t += dt;
      const f = Math.floor(t * 30);
      if (t < 0.3 && f !== starAt) {
        starAt = f;
        const len = t < 0.07 ? outBack(t / 0.07, 2.2) : 1 - (t - 0.07) / 0.3;
        star = [];
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU + hash(i, 3) * 0.6 + R.range(-0.12, 0.12), L = (18 + 18 * hash(i, 5)) * Math.max(0.15, len) * S;
          star.push(bolt(R, ax, ay, ax + Math.cos(a) * L, ay + Math.sin(a) * L, 0.28, 0.5));
        }
      }
      if (t > 0.04 && t < 0.9 && R.chance(0.5 * (1 - t / 0.9))) {
        const a = R.range(0, TAU), d = R.range(6, 26) * S, a2 = a + R.range(-1.4, 1.4), l = R.range(6, 14) * S;
        const x0 = ax + Math.cos(a) * d, y0 = ay + Math.sin(a) * d;
        arcs.push({ b: bolt(R, x0, y0, x0 + Math.cos(a2) * l, y0 + Math.sin(a2) * l, 0.4, 0.2, 0.6), t });
        if (R.chance(0.4)) ps.spawn(K.PLASMA, x0 * PX, y0 * PX, R.range(-200, 200), R.range(-260, 40), R.range(0.12, 0.3));
      }
      for (let i = arcs.length - 1; i >= 0; i--) if (t - arcs[i]!.t > 0.07) arcs.splice(i, 1);
    },
    front(buf, light) {
      if (t < 0.05) { buf.disc(ax, ay, (10 - t * 60) * S, V[3]!); buf.disc(ax, ay, (8 - t * 60) * S, V[1]!); buf.disc(ax, ay, (6 - t * 50) * S, V[0]!); }
      if (t < 0.32) {
        const k = t / 0.32, r = (4 + 34 * (1 - Math.pow(1 - k, 3))) * S;
        buf.ring(ax, ay, r, Math.max(1, 3 * (1 - k)), k < 0.4 ? V[1]! : V[3]!, 1.2 - k);
      }
      if (t < 0.3) for (const b of star) drawBolt(buf, light, b, V, 1 - t / 0.36, 0.6);
      for (const a of arcs) drawBolt(buf, light, a.b, V, 1 - (t - a.t) / 0.1, 0.35);
      if (t > 0.15 && t < 1.5)
        for (let i = 0; i < 10 * (1 - t / 1.5); i++) {
          const s = Math.floor(t * 40) * 13 + i, a = hash(s, 1) * TAU, d = (4 + hash(s, 2) * 30) * S;
          const x = ax + Math.cos(a) * d, y = ay + Math.sin(a) * d;
          dot(buf, x, y, hash(s, 3) < 0.3 ? V[0]! : V[2]!);
          if (hash(s, 4) < 0.4) dot(buf, x + (hash(s, 5) < 0.5 ? 1 : -1), y + 1, V[3]!);
        }
      const strobe = t < 0.3 ? (Math.floor(t * 60) % 2 ? 0.7 : 1) : 0.5 + 0.5 * Math.sin(t * 70);
      light.glow(ax, ay, 70 * S * Math.max(0, 1 - t / 1.7), V[3]!, 0.9 * Math.exp(-t * 4) * strobe);
      light.glow(ax, ay, 26 * S, V[0]!, 0.9 * Math.exp(-t * 9));
    },
    over: () => t > 1.6,
  };
}
function arc({ o, R, V, ps, lights, groundAt }: Ctx): Run {
  const hops = o.to ?? [[640, 600], [760, 600], [880, 600]];
  const D = o.duration ?? 0.9, LINK = 0.05;
  const src = (): [number, number] => { const h = o.actor?.hand?.(); return h ? [h.x, h.y] : (o.from ?? [o.x ?? 520, o.y ?? 520]); };
  const links = hops.map((_, i) => ({ on: i * LINK, hit: false, b: null as Bolt | null }));
  const crawls: { b: Bolt; t: number }[] = [], marks: { x: number; y: number; t: number }[] = [];
  let t = 0, at = -1, stopAt = D;
  const level = () => {
    const flick = t < 0.12 ? (Math.floor(t * 60) % 3 === 1 ? 0.6 : 1) : 0.8 + 0.2 * Math.sin(t * 61) * Math.sin(t * 23);
    return t < stopAt ? flick : flick * clamp(1 - (t - stopAt) / 0.18);
  };
  const pointsNow = () => [src(), ...hops] as [number, number][];
  return {
    update(dt) {
      t += dt;
      const P = pointsNow(), k = level(), f = Math.floor(t * 30);
      for (const [i, l] of links.entries()) {
        if (l.hit || t < l.on) continue;
        l.hit = true;
        const [x, y] = P[i + 1]!, g = groundAt(x), onGround = Math.abs(g - y) < 8;
        for (let j = 0; j < 14; j++) {
          const a = (onGround ? -Math.PI / 2 : 0) + R.range(-1.4, 1.4) + (onGround ? 0 : R.range(0, TAU)), sp = R.range(200, 620);
          ps.spawn(K.PLASMA, x, y - 2, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.15, 0.45));
        }
        if (onGround) { dust(ps, R, x, g, 4, 0.9); marks.push({ x, y: g, t }); }
        lights.push({ x, y, r: 120, color: V[3]!, k: 0.8, life: 0.2, max: 0.2 });
        if (i === 0) { o.flash?.(0.35, "215,232,255"); o.shake?.(0.2); } else o.shake?.(0.08);
      }
      if (f !== at && k > 0) {
        at = f;
        for (const [i, l] of links.entries()) {
          if (!l.hit) continue;
          const [x0, y0] = P[i]!, [x1, y1] = P[i + 1]!, g0 = Math.abs(groundAt(x0) - y0) < 8, g1 = Math.abs(groundAt(x1) - y1) < 8;
          l.b = g0 && g1 ? hop(R, x0 / PX, y0 / PX, x1 / PX, y1 / PX) : bolt(R, x0 / PX, y0 / PX, x1 / PX, y1 / PX, 0.22, 0.45);
        }
      }
      if (k > 0.3) {
        for (const [i, l] of links.entries()) {
          if (!l.hit || !R.chance(0.3)) continue;
          const [x, y] = P[i + 1]!, a = R.range(0, TAU), d = R.range(4, 14);
          crawls.push({ b: bolt(R, x / PX, y / PX, x / PX + Math.cos(a) * d, y / PX + Math.sin(a) * d * (Math.abs(groundAt(x) - y) < 8 ? 0.3 : 1), 0.4, 0.2, 0.6), t });
        }
        if (R.chance(0.5)) {
          const i = R.int(0, links.length - 1), u = R.next(), [x0, y0] = P[i]!, [x1, y1] = P[i + 1]!;
          if (links[i]!.hit) ps.spawn(K.PLASMA, lerp(x0, x1, u), lerp(y0, y1, u), R.range(-120, 120), R.range(-160, 40), R.range(0.1, 0.25));
        }
      }
      for (let i = crawls.length - 1; i >= 0; i--) if (t - crawls[i]!.t > 0.07) crawls.splice(i, 1);
    },
    back(buf, light) { for (const m of marks) scorch(buf, light, m.x / PX, m.y / PX, 6, Math.pow(clamp(1 - (t - m.t) / 1.6), 1.3)); },
    front(buf, light) {
      const P = pointsNow(), k = level();
      if (k > 0) {
        for (const l of links) if (l.hit && l.b) stroke(buf, light, l.b, k, V, 0.7);
        for (const [i, l] of links.entries()) {
          if (!l.hit) continue;
          const [x, y] = P[i + 1]!, ax = x / PX, ay = y / PX, r = (2.2 + Math.sin(t * 47 + i) * 0.6) * k;
          buf.disc(ax, ay, r + 1.4, V[5]!);
          buf.disc(ax, ay, r + 0.6, V[2]!);
          buf.disc(ax, ay, r * 0.6, V[0]!);
          light.glow(ax, ay, 20, V[3]!, 0.5 * k);
        }
        const [hx, hy] = P[0]!, hr = (2 + Math.sin(t * 53) * 0.5) * k;
        buf.disc(hx / PX, hy / PX, hr + 1, V[3]!);
        buf.disc(hx / PX, hy / PX, hr, V[0]!);
        light.glow(hx / PX, hy / PX, 16, V[2]!, 0.6 * k);
      } else if (t - stopAt < 0.45) {
        const g = 1 - (t - stopAt - 0.18) / 0.27;
        for (const l of links) if (l.b) for (const p of l.b.paths) if (p.w >= 1) for (const [x, y] of p.pts) dot(buf, x, y, V[5]!, g * 0.7);
      }
      for (const c of crawls) drawBolt(buf, light, c.b, V, 1 - (t - c.t) / 0.09, 0.3);
    },
    over: () => t > stopAt + 1.7,
    stop() { stopAt = Math.min(stopAt, t); },
  };
}
function hop(R: Rng, x0: number, y0: number, x1: number, y1: number): Bolt {
  const mx = (x0 + x1) / 2 + R.range(-4, 4), my = Math.min(y0, y1) - Math.hypot(x1 - x0, y1 - y0) * R.range(0.16, 0.28);
  const a = bolt(R, x0, y0, mx, my, 0.2, 0.4), b = bolt(R, mx, my, x1, y1, 0.2, 0.4);
  return { paths: [{ pts: [...a.paths[0]!.pts, ...b.paths[0]!.pts.slice(1)], w: 1 }, ...a.paths.slice(1), ...b.paths.slice(1)] };
}
function crackle({ o, R, V, ps, groundAt }: Ctx): Run {
  const D = o.duration ?? 1.8, RAD = (o.radius ?? 36) / PX;
  const arcs: { b: Bolt; t: number; life: number }[] = [];
  let t = 0, at = -1, stopAt = D, shock = 0, nextShock = 0.12, edge: [number, number][] = [], centre: [number, number] = [0, 0];
  const level = () => smooth(0, 0.08, t) * (t < stopAt ? 1 : clamp(1 - (t - stopAt) / 0.3));
  const outline = () => {
    const s = o.actor?.silhouette?.();
    edge = [];
    if (s) {
      const on = (x: number, y: number) => x >= 0 && y >= 0 && x < s.w && y < s.h && s.data[y * s.w + x]! >>> 24 > 0;
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (on(x, y) && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1))) edge.push([s.x + x + 0.5, s.y + y + 0.5]);
    }
    if (!edge.length) {
      const cx = (o.x ?? 640) / PX, cy = (o.y ?? 540) / PX;
      for (let i = 0; i < 48; i++) { const a = R.range(0, TAU), d = RAD * Math.sqrt(R.next()); edge.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]); }
    }
    let sx = 0, sy = 0;
    for (const [x, y] of edge) (sx += x), (sy += y);
    centre = [sx / edge.length, sy / edge.length];
  };
  return {
    update(dt) {
      t += dt;
      shock = Math.max(0, shock - dt);
      const f = Math.floor(t * 30), k = level();
      if (f !== at && f % 2 === 0 && k > 0.05 && t < stopAt) {
        at = f;
        outline();
        for (let n = 0; n < 2 + R.int(0, 1); n++) {
          const a = R.pick(edge), ux = a[0] - centre[0], uy = a[1] - centre[1], l = Math.hypot(ux, uy) || 1;
          const ang = Math.atan2(uy / l, ux / l) + R.range(-1.2, 1.2), d = R.range(6, 15);
          let b: [number, number] = [a[0] + Math.cos(ang) * d, a[1] + Math.sin(ang) * d];
          for (let tries = 0; tries < 10; tries++) {
            const c = R.pick(edge);
            if (Math.hypot(c[0] - b[0], c[1] - b[1]) < 4 && Math.hypot(c[0] - a[0], c[1] - a[1]) > 4) b = c;
          }
          arcs.push({ b: bolt(R, a[0], a[1], b[0], b[1], 0.42, 0.35), t, life: R.range(0.05, 0.09) });
          if (R.chance(0.4)) ps.spawn(K.PLASMA, b[0] * PX, b[1] * PX, R.range(-140, 140), R.range(-200, 20), R.range(0.1, 0.25));
        }
        const low = edge.reduce((m, p) => (p[1] > m[1] ? p : m), edge[0]!), g = groundAt(low[0] * PX) / PX;
        if (R.chance(0.25) && g - low[1] < 14) arcs.push({ b: bolt(R, low[0], low[1], low[0] + R.range(-9, 9), g - 0.5, 0.45, 0.3), t, life: 0.07 });
      }
      if (t >= nextShock && t < stopAt) {
        nextShock = t + R.range(0.5, 0.8);
        shock = 0.05;
        o.cue?.("hurt", { t: 0.04 });
        o.shake?.(0.05);
        for (let i = 0; i < 6; i++) {
          const a = R.range(0, TAU), sp = R.range(150, 400), [x, y] = R.pick(edge);
          ps.spawn(K.PLASMA, x * PX, y * PX, Math.cos(a) * sp, Math.sin(a) * sp - 60, R.range(0.1, 0.3));
        }
      }
      for (let i = arcs.length - 1; i >= 0; i--) if (t - arcs[i]!.t > arcs[i]!.life) arcs.splice(i, 1);
    },
    front(buf, light) {
      const k = level();
      for (const a of arcs) stroke(buf, light, a.b, Math.max(0.35, (1 - (t - a.t) / (a.life + 0.04)) * k), V, 0.45);
      if (k > 0.02) light.glow(centre[0], centre[1], 34, V[3]!, (0.18 + 0.12 * Math.sin(t * 57) + (shock > 0 ? 0.35 : 0)) * k);
    },
    over: () => t > stopAt + 0.4 && arcs.length === 0,
    stop() { stopAt = Math.min(stopAt, t); },
  };
}
function stroke(buf: Px, light: Px, b: Bolt, k: number, V: number[], s: number) {
  for (const pass of [0, 1, 2])
    for (const p of b.paths) {
      const trunk = p.w >= 1;
      if (!trunk && (k < 0.5 || (pass === 2 && p.w < 0.5))) continue;
      for (let i = 0; i < p.pts.length - 1; i++) {
        const [ax, ay] = p.pts[i]!, [bx, by] = p.pts[i + 1]!, l = Math.max(1, Math.hypot(bx - ax, by - ay));
        for (let d = 0; d <= l; d += 0.5) {
          const x = ax + ((bx - ax) * d) / l, y = ay + ((by - ay) * d) / l;
          if (pass === 0) buf.disc(x, y, (trunk ? (k > 0.6 ? 2.1 : 1.6) : 1.1) * s, V[5]!);
          else if (pass === 1) buf.disc(x, y, (trunk ? (k > 0.6 ? 1.3 : 0.8) : 0.5) * s, trunk ? V[2]! : V[3]!);
          else if (trunk && k > 0.3) buf.set(Math.floor(x), Math.floor(y), V[0]!);
        }
        if (pass === 0 && i % 3 === 0) light.glow(ax, ay, (trunk ? 14 : 7) * s, V[3]!, 0.5 * k * p.w);
      }
    }
}
function storm(buf: Px, light: Px, clouds: { x: number; y: number; r: number }[], cx: number, lit: number, t: number, V: number[]) {
  const body = hex("#0f0c1d"), under = hex("#1b1631"), rim = hex("#29224a");
  for (let x = buf.ox; x < buf.ox + buf.w; x++) {
    let yb = -1e9, yb2 = -1e9;
    for (const [i, c] of clouds.entries()) {
      const dx = x + 0.5 - (c.x + noise(t * 0.4 + c.x, 9) * 2);
      if (Math.abs(dx) >= c.r) continue;
      const y = c.y + Math.sqrt(c.r * c.r - dx * dx);
      if (y > yb) yb = y;
      const y2 = c.y - 9 + (i % 3) * 2 + Math.sqrt(c.r * c.r - dx * dx) * 0.7;
      if (i % 2 && y2 > yb2) yb2 = y2;
    }
    if (yb < -1e8) continue;
    const l = lit * Math.max(0, 1 - Math.abs(x - cx) / 120);
    for (let y = buf.oy; y < yb; y++) buf.set(x, y, body);
    dot(buf, x, yb, body, 0.5);
    dot(buf, x, yb + 1, body, 0.25);
    dot(buf, x, yb - 1, l > 0.55 ? V[3]! : l > 0.2 ? V[5]! : rim);
    dot(buf, x, yb - 2, l > 0.55 ? V[5]! : under, 0.85);
    dot(buf, x, yb - 3, under, 0.45);
    if (yb2 > -1e8 && yb2 < yb - 4) { dot(buf, x, yb2, l > 0.4 ? V[5]! : under, 0.9); dot(buf, x, yb2 - 1, under, 0.4); }
    if ((x & 7) === 0 && l > 0.05) light.glow(x, yb - 2, 22, V[4]!, 0.3 * l);
  }
}
function scorch(buf: Px, light: Px, cx: number, cy: number, rx: number, T0: number) {
  const ry = Math.max(2.5, rx * 0.09);
  for (let y = Math.floor(cy); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      const k = hash(x * 31 + y * 7);
      const T = T0 * (1.25 - d) - k * 0.35;
      if (T > 0.06) {
        const c = HEAT_RAMP[Math.min(HEAT_RAMP.length - 1, Math.floor((1 - Math.min(1, T)) * (HEAT_RAMP.length - 1)))]!;
        buf.set(x, y, c);
        if ((x & 3) === 0) light.glow(x + 0.5, y, 6, c, 0.18 * T);
      } else if (d < 0.95 - k * 0.3 || bayer(x, y) < 1 - d) buf.set(x, y, d < 0.5 ? SOOT : SOOT2);
    }
}
const SOOT = hex("#0d0a12"), SOOT2 = hex("#17121d");
function dust(ps: Particles, R: Rng, x: number, y: number, n: number, spread: number) {
  for (let i = 0; i < n; i++) ps.spawn(K.DUST, x + R.range(-3, 3), y - 1, R.sign() * R.range(20, 110) * spread, -R.range(5, 45), R.range(0.3, 0.65), DUST, R.range(1.3, 2.8));
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
  ring(cx: number, cy: number, r: number, thick: number, c: number, alpha = 1) {
    const ro = r + thick * 0.5, ri = Math.max(0, r - thick * 0.5), ro2 = ro * ro, ri2 = ri * ri;
    for (let y = Math.floor(cy - ro); y <= Math.ceil(cy + ro); y++) {
      const dy = y + 0.5 - cy;
      for (let x = Math.floor(cx - ro); x <= Math.ceil(cx + ro); x++) {
        const dx = x + 0.5 - cx, d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 >= ri2 && (alpha >= 1 || alpha > bayer(x, y))) this.set(x, y, c);
      }
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
const VOLT = ["#ffffff", "#e9f8ff", "#a3dcff", "#5eb0ff", "#5b6cff", "#4733c4", "#2a1b78"].map(hex);
const PLASMA = ["#ffffff", "#7ff3ff", "#1ab8e6"].map(hex);
const SPARKS = ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"].map(hex);
const HEAT_RAMP = ["#ffffff", "#fff3a6", "#ffe26b", "#ffc23d", "#ff8a2a", "#f2561d", "#c9281f", "#8a1f17", "#4f1a13", "#2a120e"].map(hex);
const SMOKE_RAMP = ["#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e"].map(hex);
const SMOKE_TINT = hex("#5b5566");
const DUST = hex("#7a6e8e");
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
function outBack(t: number, s = 1.7) { const u = clamp(t) - 1; return 1 + (s + 1) * u * u * u + s * u * u; }
function hash(n: number, k = 0) { return ((Math.imul(n + 1 + k * 7919, 2654435761) >>> 0) % 100000) / 100000; }
function noise(x: number, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed) * 2 - 1, hash(i + 1, seed) * 2 - 1, u);
}
const GRAVITY = 1900;
const K = { SPARK: 0, PLASMA: 1, SMOKE: 2, DUST: 3 } as const;
type K = (typeof K)[keyof typeof K];
interface P { k: K; x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; size: number; seed: number; delay: number }
class Particles {
  list: P[] = [];
  t = 0;
  R: Rng;
  ground: (x: number) => number;
  plasma: number[];
  constructor(R: Rng, ground: (x: number) => number, plasma: number[]) { this.R = R; this.ground = ground; this.plasma = plasma; }
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
    for (const p of this.list) if (p.delay <= 0 && (p.k === K.SMOKE || p.k === K.DUST) === back) this.drawOne(p, buf, light);
  }
  private drawOne(p: P, buf: Px, light: Px) {
    const k = p.life / p.max, ax = p.x / PX, ay = p.y / PX;
    switch (p.k) {
      case K.SMOKE: {
        const age = 1 - k, r = p.size * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * 0.4);
        const a = Math.min(1, age * 12) * Math.min(1, k * 2.4) * 0.58;
        const c = p.col ? mix(p.col, ramp(SMOKE_RAMP, age), age) : ramp(SMOKE_RAMP, age * 1.05);
        buf.alphaDisc(ax, ay, r, c, a * 0.45);
        buf.alphaDisc(ax + r * 0.05, ay + r * 0.06, r * 0.74, c, a * 0.62);
        if (age < 0.5) buf.alphaDisc(ax - r * 0.22, ay - r * 0.3, r * 0.5, mix(c, VOLT[0]!, 0.12), a * 0.4 * (1 - age * 2));
        break;
      }
      case K.DUST:
        buf.alphaDisc(ax, ay, p.size * (0.6 + (1 - k) * 0.9), p.col, Math.pow(k, 1.3) * 0.7);
        break;
      case K.SPARK:
      case K.PLASMA: {
        const C = p.k === K.PLASMA ? this.plasma : SPARKS, hot = p.k === K.PLASMA ? (k > 0.5 ? C[0]! : k > 0.25 ? C[1]! : C[2]!) : k > 0.6 ? C[0]! : k > 0.3 ? C[1]! : C[2]!;
        const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = Math.min(9, 1 + sp * 0.011);
        buf.line(ax - ux * len, ay - uy * len, ax - ux * len * 0.4, ay - uy * len * 0.4, k > 0.5 ? hot : C[C.length - 1]!);
        buf.line(ax - ux * len * 0.45, ay - uy * len * 0.45, ax, ay, hot);
        light.glow(ax, ay, 3, hot, 0.45 * k);
        break;
      }
    }
  }
}
interface Light { x: number; y: number; r: number; color: number; k: number; life: number; max: number }
function stepLights(lights: Light[], dt: number) { for (let i = lights.length - 1; i >= 0; i--) if ((lights[i]!.life -= dt) <= 0) lights.splice(i, 1); }
function drawLights(light: Px, lights: Light[]) {
  for (const l of lights) { const k = l.life / l.max; light.glow(l.x / PX, l.y / PX, (l.r / PX) * (0.55 + 0.45 * k), l.color, l.k * k * k); }
}
interface Bolt { paths: { pts: [number, number][]; w: number }[] }
function bolt(R: Rng, x0: number, y0: number, x1: number, y1: number, jag = 0.32, forks = 0.35, w = 1, depth = 0): Bolt {
  const out: Bolt = { paths: [] }, L = Math.hypot(x1 - x0, y1 - y0);
  let pts: [number, number][] = [[x0, y0], [x1, y1]], off = L * jag;
  while (pts.length < 2 + L / 3) {
    const nxt: [number, number][] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!, l = Math.hypot(bx - ax, by - ay) || 1, o = R.range(-off, off);
      nxt.push([(ax + bx) / 2 + (-(by - ay) / l) * o, (ay + by) / 2 + ((bx - ax) / l) * o], [bx, by]);
    }
    pts = nxt;
    off *= 0.52;
  }
  out.paths.push({ pts, w });
  if (depth < 2)
    for (let i = 2; i < pts.length - 3; i++)
      if (R.chance(forks / (1 + depth) / Math.max(4, pts.length / 6))) {
        const [ax, ay] = pts[i]!, [bx, by] = pts[Math.min(pts.length - 1, i + 3)]!;
        const a = Math.atan2(by - ay, bx - ax) + R.sign() * R.range(0.35, 0.9), l = (L - (i / pts.length) * L) * R.range(0.25, 0.55);
        out.paths.push(...bolt(R, ax, ay, ax + Math.cos(a) * l, ay + Math.sin(a) * l, jag * 1.1, forks, w * 0.55, depth + 1).paths);
      }
  return out;
}
function drawBolt(buf: Px, light: Px, b: Bolt, V: number[], k = 1, glowK = 0.5) {
  for (const p of b.paths) {
    const thick = p.w >= 1;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, ay] = p.pts[i]!, [bx, by] = p.pts[i + 1]!, l = Math.max(1, Math.hypot(bx - ax, by - ay));
      for (let d = 0; d <= l; d += 0.5) {
        const x = ax + ((bx - ax) * d) / l, y = ay + ((by - ay) * d) / l;
        if (k > 0.45 && thick) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(buf, x + dx! * 1.5, y + dy! * 1.5, V[4]!, (k - 0.45) * 1.6);
        if (k > 0.25 && (thick || p.w > 0.4)) for (const [dx, dy] of [[1, 0], [0, 1]]) dot(buf, x + dx!, y + dy!, V[2]!);
        buf.set(Math.floor(x), Math.floor(y), thick && k > 0.3 ? V[0]! : V[2]!);
      }
      if (i % 3 === 0) light.glow(ax, ay, (thick ? 9 : 5) * (0.5 + k * 0.5), V[3]!, glowK * k * p.w);
    }
  }
}
