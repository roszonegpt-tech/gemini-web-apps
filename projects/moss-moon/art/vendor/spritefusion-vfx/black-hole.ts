// Made by Sprite Fusion, to have full context over VFX, connect to the MCP: https://www.spritefusion.com/mcp
// MIT License
// Copyright (c) 2026 Hugo Duprez
export interface Frame { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type Layer = "back" | "front";
export interface Lens { x: number; y: number; rs: number; rE: number; rOut: number; twist: number; gloom: number }
export interface Options {
  x?: number;
  y?: number;
  radius?: number;
  life?: number;
  tilt?: number;
  pull?: number;
  ground?: number | ((x: number) => number);
  groundColor?: number;
  sample?(x: number, y: number): number;
  seed?: number;
  shake?(trauma: number): void;
  flash?(k: number, rgb: string): void;
  darken?(k: number): void;
  ripple?(x: number, y: number, r0: number, r1: number, dur: number, amp: number, w: number): void;
  lens?(l: Lens): void;
}
export default function blackHole(o: Options = {}) {
  const X = o.x ?? 760, Y = o.y ?? 430, RAD = o.radius ?? 34, LIFE = o.life ?? 3.8, PULL = o.pull ?? 1;
  const FORM = 0.4, COLLAPSE = 0.42, END = FORM + LIFE + COLLAPSE, REACH = RAD * 12.4, G = 4.2e7 * Math.pow(RAD / 34, 3) * PULL, SWIRL = 0.55;
  const R = new Rng(o.seed ?? 3);
  const groundAt = (x: number) => (o.ground === undefined ? Infinity : typeof o.ground === "number" ? o.ground : o.ground(x));
  const ps = new Particles(R, groundAt);
  const fx = new Rings();
  const slabs: Slab[] = [];
  const u = R.next();
  const h = { t: 0, tilt: o.tilt ?? (u < 0.5 ? -1 : 1) * (0.14 + (u % 0.5) * 0.5), flare: 0, gulp: 0, grow: 0, jet: 0, jetCd: 0, colors: [] as number[] };
  const bursts: { t: number; dur: number; s: number }[] = [];
  let collapsed = false, ended = 0, slabAcc = 0;
  const beat = () => {
    if (h.t < FORM || implosion() > 0) return 0;
    const p = ((h.t - FORM) % 0.85) / 0.85, b = (x: number) => Math.exp(-Math.pow((p - x) / 0.045, 2));
    return b(0.06) + 0.7 * b(0.26);
  };
  const implosion = () => clamp((h.t - FORM - LIFE) / COLLAPSE);
  const radius = () => {
    const Rr = RAD * (1 + h.grow) * (1 + 0.1 * h.gulp) * (1 + 0.045 * beat());
    if (h.t < FORM) { const k = h.t / FORM; return Rr * (1 + 1.7 * Math.pow(k - 1, 3) + 0.7 * Math.pow(k - 1, 2)) * Math.min(1, k * 3); }
    const breath = 1 + Math.sin(h.t * 3.1) * 0.025 + Math.sin(h.t * 7.3) * 0.01, k = implosion();
    if (k <= 0) return Rr * breath;
    if (k < 0.3) return Rr * breath * (1 + 0.14 * Math.sin((k / 0.3) * (Math.PI / 2)));
    return Rr * breath * 1.14 * (1 - Math.pow((k - 0.3) / 0.7, 2));
  };
  const strength = () => smooth(0, FORM * 0.8, h.t) * (1 + 0.8 * implosion() + 0.45 * beat());
  const twist = () => (0.25 + 0.75 * smooth(0, 2.4, h.t)) * (1 + 1.2 * implosion()) * smooth(0, FORM, h.t);
  const gloom = () => smooth(0, FORM, h.t) * (0.35 + 0.65 * smooth(0, 2.5, h.t) + 0.3 * beat() + 0.6 * implosion());
  function feed(amount: number, col = 0) {
    if (collapsed) return;
    h.flare = Math.min(2.5, h.flare + amount * 0.05);
    h.gulp = Math.min(1, h.gulp + amount * 0.06);
    h.grow = Math.min(0.3, h.grow + amount * 0.0015);
    if (col) { if (h.colors.length < 32) h.colors.push(col); else h.colors[R.int(0, 31)] = col; }
    if (amount >= 3 && h.jetCd <= 0 && implosion() <= 0) {
      h.jet = 1;
      h.jetCd = 1.1;
      const Rr = radius(), nx = -Math.sin(h.tilt), ny = Math.cos(h.tilt);
      for (let side = -1; side <= 1; side += 2) {
        const px = X + nx * Rr * side, py = Y + ny * Rr * side, a0 = Math.atan2(ny * side, nx * side);
        for (let i = 0; i < 18; i++) {
          const a = a0 + R.range(-0.14, 0.14), sp = R.range(500, 1300);
          ps.spawn(K.PLASMA, px, py, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.15, 0.4));
        }
        fx.light(px, py, 110, JET, 1, 0.25);
        fx.ring(px, py, 3, 22, 0.14, 1, JET_CORE);
      }
      o.shake?.(0.12);
    }
  }
  o.ripple?.(X, Y, RAD * 5.5, RAD * 0.8, 0.3, 0.14, RAD * 0.7);
  fx.ring(X, Y, 190, 6, 0.34, 2, VIOLET);
  fx.ring(X, Y, 115, 4, 0.24, 1.2, WHITE);
  bursts.push({ t: 0, dur: 0.18, s: 0.35 });
  fx.light(X, Y, 280, VIOLET, 1.3, 0.4);
  for (let i = 0; i < 70; i++) {
    const a = R.range(0, TAU), r = R.range(70, 230), sp = R.range(60, 160);
    ps.spawn(K.MOTE, X + Math.cos(a) * r, Y + Math.sin(a) * r, Math.sin(a) * sp, -Math.cos(a) * sp, R.range(0.6, 1.2), R.chance(0.45) ? VIOLET : R.pick(DISK_COLORS), R.range(0.8, 1.4));
  }
  o.shake?.(0.35);
  function collapse() {
    collapsed = true;
    o.ripple?.(X, Y, RAD * 0.6, RAD * 7, 0.6, 0.2, RAD * 0.7);
    o.flash?.(0.7, "235,220,255");
    bursts.push({ t: 0, dur: 0.45, s: 1 });
    fx.ring(X, Y, RAD * 1.4, RAD * 7, 0.5, 3, WHITE);
    fx.ring(X, Y, RAD * 0.8, RAD * 4.5, 0.6, 1.8, VIOLET);
    fx.ring(X, Y, RAD * 2.2, RAD * 9.5, 0.32, 1, JET);
    fx.light(X, Y, 420, rgb(255, 232, 210), 1.5, 0.5);
    fx.light(X, Y, 280, VIOLET, 1, 0.8);
    for (let i = 0; i < 150; i++) {
      const a = R.range(0, TAU), sp = R.range(180, 950);
      ps.spawn(K.MOTE, X, Y, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.3, 0.9), R.chance(0.3) ? VIOLET : R.chance(0.3) ? WHITE : R.pick(DISK_COLORS), R.range(1, 1.8));
    }
    for (let i = 0; i < 40; i++) {
      const a = R.range(0, TAU), sp = R.range(400, 1200);
      ps.spawn(K.PLASMA, X, Y, Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.15, 0.45));
    }
    const cols = h.colors.length ? h.colors : [WHITE];
    for (let i = 0; i < 130; i++) {
      const a = R.range(0, TAU), sp = R.range(200, 900);
      ps.spawn(K.INK, X + Math.cos(a) * RAD * 0.3, Y + Math.sin(a) * RAD * 0.3, Math.cos(a) * sp, Math.sin(a) * sp - R.range(0, 200), R.range(1.2, 2.4), R.pick(cols), R.chance(0.4) ? 2 : 1);
    }
    ps.impulse(X, Y, RAD * 9, 950);
    for (const s of slabs) {
      const dx = s.x - X, dy = s.y - Y, d = Math.hypot(dx, dy) || 1, f = 850 * Math.max(0, 1 - d / (RAD * 7));
      s.vx += (dx / d) * f;
      s.vy += (dy / d) * f - 150;
      s.va += R.range(-8, 8);
      s.pull = 0;
    }
    o.shake?.(0.6);
  }
  return {
    feed,
    update(dt: number) {
      const before = implosion(), beat0 = beat();
      h.t += dt;
      for (let i = bursts.length - 1; i >= 0; i--) if ((bursts[i]!.t += dt) >= bursts[i]!.dur) bursts.splice(i, 1);
      if (!collapsed && h.t >= END) collapse();
      if (collapsed) { ended += dt; stepSlabs(dt, false); ps.update(dt); fx.update(dt); return; }
      h.flare -= h.flare * 3 * dt;
      h.gulp -= h.gulp * 5 * dt;
      h.jet = Math.max(0, h.jet - dt / 0.5);
      h.jetCd -= dt;
      const Rr = Math.max(1, radius()), imp = implosion(), k = strength();
      feed(ps.attract(X, Y, G * k, REACH, SWIRL, Rr, dt) * 0.03);
      if (imp <= 0) {
        const b = beat();
        if (beat0 < 0.5 && b >= 0.5) o.shake?.(0.1);
        const n = (R.chance(0.5) ? 1 : 0) + Math.round(3 * b);
        for (let i = 0; i < n; i++) {
          const a = R.range(0, TAU), r = R.range(Rr * 1.8, Rr * 7), px = X + Math.cos(a) * r, py = Y + Math.sin(a) * r;
          const pc0 = o.sample?.(px, py) ?? 0, pc = pc0 && luma(pc0) > 0.22 ? pc0 : R.pick(SHREDS), vin = R.range(220, 520) * (1 + b), vt = R.range(200, 400);
          const vx = Math.sin(a) * vt - Math.cos(a) * vin, vy = -Math.cos(a) * vt - Math.sin(a) * vin;
          if (i % 4 === 3) ps.spawn(K.DUST, px, py, vx * 0.35, vy * 0.35, R.range(0.5, 0.9), mix(pc, VOID, 0.5), R.range(1.6, 3.4));
          else ps.spawn(K.MOTE, px, py, vx, vy, Math.min(1.1, (r / vin) * 1.3), R.chance(0.35) ? pc : mix(pc, VOID, R.range(0.45, 0.8)), R.range(0.8, 1.5));
        }
        if (R.chance(0.5)) {
          const side = R.sign(), r = R.range(Rr * 2.4, Rr * 3.4);
          ps.spawn(K.MOTE, X + Math.cos(h.tilt) * r * side, Y + Math.sin(h.tilt) * r * side, -Math.sin(h.tilt) * side * 120, Math.cos(h.tilt) * side * 120, R.range(0.3, 0.6), R.pick(DISK_COLORS), 1);
        }
        o.shake?.(0.006 * k + h.gulp * 0.01);
        const gy = groundAt(X);
        if (gy - Y < REACH * 0.85 && (slabAcc += dt * (0.7 + 2.2 * b) * smooth(0.3, 1.2, h.t)) > 1) {
          slabAcc -= 1;
          const sx = X + R.range(-1, 1) * Math.sqrt(Math.max(0, (REACH * 0.7) ** 2 - (gy - Y) ** 2)) * 0.6;
          const w = R.int(4, 9), hh = R.int(3, 5);
          slabs.push({ x: sx, y: groundAt(sx) - hh, vx: 0, vy: -R.range(60, 160), a: R.range(-0.2, 0.2), va: R.range(-3, 3), w, h: hh, pull: 0, pullA: 0, c: o.groundColor ?? STONE });
          for (let i = 0; i < 4; i++) ps.spawn(K.DUST, sx + R.range(-6, 6), groundAt(sx) - 2, R.range(-40, 40), -R.range(20, 70), R.range(0.5, 0.9), mix(o.groundColor ?? STONE, rgb(150, 140, 150), 0.35), R.range(1.5, 3));
        }
      } else {
        if (before <= 0) fx.ring(X, Y, Rr * 6, Rr, COLLAPSE, 1.6, VIOLET);
        for (let i = 0; i < 5; i++) {
          const a = R.range(0, TAU), r = R.range(Rr * 2, Rr * 6);
          ps.spawn(K.MOTE, X + Math.cos(a) * r, Y + Math.sin(a) * r, -Math.cos(a) * 500 + Math.sin(a) * 200, -Math.sin(a) * 500 - Math.cos(a) * 200, 0.4, R.chance(0.5) ? WHITE : VIOLET, 1.2);
        }
        o.shake?.(0.02 + 0.03 * imp);
      }
      stepSlabs(dt, true);
      ps.update(dt);
      fx.update(dt);
      o.darken?.(0.3 * smooth(0, FORM, h.t) + 0.15 * imp);
      o.lens?.({ x: X, y: Y, rs: radius(), rE: radius() * 1.4, rOut: radius() * 6, twist: twist(), gloom: gloom() });
      function stepSlabs(dt: number, pulling: boolean) {
        const Rr = Math.max(1, radius()), k = strength();
        for (let i = slabs.length - 1; i >= 0; i--) {
          const s = slabs[i]!;
          const dx = X - s.x, dy = Y - s.y, d = Math.hypot(dx, dy) || 1, size = Math.max(s.w, s.h) * PX;
          if (pulling) {
            if (d < Rr * 0.9 + size * 0.15) { slabs.splice(i, 1); feed(2 + Math.min(6, size / 10), s.c); continue; }
            const a = ((G * k) / (d * d + Rr * Rr)) * Math.min(1, (REACH - d) / (REACH * 0.25)), ux = dx / d, uy = dy / d;
            const lift = GRAVITY * Math.min(1, k) * Math.sqrt(Math.max(0, 1 - d / REACH));
            s.vx += (ux - uy * SWIRL) * a * dt;
            s.vy += ((uy + ux * SWIRL) * a - lift) * dt;
            const drag = Math.min(0.2, (1 - d / REACH) * 2 * dt);
            s.vx -= s.vx * drag;
            s.vy -= s.vy * drag;
            s.pull = Math.max(s.pull * 0.9, Math.min(1, Math.max(0, (Rr * 3.4 - d) / (Rr * 2.6))) * 0.8);
            s.pullA = Math.atan2(dy, dx);
          } else s.pull *= 0.9;
          s.vy += GRAVITY * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.a += s.va * dt;
          if (s.y > groundAt(s.x) + 40) slabs.splice(i, 1);
        }
      }
    },
    draw(f: Frame, layer?: Layer) {
      const buf = new Px(f, f.color), light = new Px(f, f.light);
      if (layer !== "front") ps.draw(buf, light, "back");
      if (layer === "back") return;
      for (const s of slabs) drawSlab(buf, s);
      if (!collapsed) drawHole(buf, light, X, Y, radius(), h, implosion(), smooth(0, FORM, h.t));
      for (const b of bursts) drawBurst(buf, light, X / PX, Y / PX, h.tilt, b.t / b.dur, (RAD / PX) * b.s);
      ps.draw(buf, light, "front");
      fx.draw(buf, light);
    },
    done: () => collapsed && ended > 2.5 && ps.list.length === 0,
  };
}
const RAMP = [hex("#3a0e16"), hex("#701a17"), hex("#ad2f17"), hex("#e2561d"), hex("#ff8a2a"), hex("#ffb24a"), hex("#ffd98c"), hex("#fff2cf"), hex("#ffffff")];
const BLUE_WHITE = hex("#dcecff");
const SHADOW = rgb(2, 1, 5);
const HOLE_LIGHT = rgb(255, 170, 90);
const JET_CORE = hex("#f4fbff");
const JET = hex("#9fd8ff");
const JET_EDGE = hex("#7a5cff");
const VIOLET = hex("#b37bff");
const VOID = rgb(26, 12, 44);
const SHREDS = [hex("#e4ddf4"), hex("#b5abd4"), hex("#8b80b4"), hex("#5d5488")];
const WHITE = hex("#ffffff");
const STONE = hex("#4a3f69");
const DISK_COLORS = [RAMP[4]!, RAMP[5]!, RAMP[6]!, RAMP[7]!];
function tone(I: number, x: number, y: number, blue: number): number {
  if (I < 0.08 && bayer(x, y) > I / 0.08) return 0;
  const n = RAMP.length - 1, f = Math.max(0, Math.min(n, (I / 1.12) * n));
  let idx = Math.floor(f);
  if (f - idx > bayer(x, y)) idx = Math.min(n, idx + 1);
  const c = RAMP[idx]!;
  return blue > 0.05 && idx >= n - 2 ? mix(c, BLUE_WHITE, Math.min(1, blue)) : c;
}
function tex(rho: number, th: number, t: number): number {
  const a = th + 5 * Math.pow(rho, -1.5) * t;
  const streak = 0.66 + 0.2 * Math.sin(a * 6 + rho * 9.5) + 0.14 * Math.sin(a * 13 - rho * 21 + 1.7);
  const lane = 0.78 + 0.22 * Math.cos(rho * 12.5 + Math.sin(a * 2) * 0.6);
  const knot = Math.max(0, Math.sin(a * 3 + rho * 7 + Math.sin(t * 1.3) * 2) * Math.sin(a * 5 - rho * 11 + t * 0.9));
  return streak * lane + knot * knot * knot * 0.55;
}
function drawHole(buf: Px, light: Px, x: number, y: number, Rw: number, h: { t: number; tilt: number; flare: number; gulp: number; jet: number }, imp: number, form: number) {
  if (Rw < 0.6) return;
  const Rs = Rw / PX, t = h.t, shake = h.gulp * 0.9 + imp * 0.8;
  const ax = x / PX + Math.sin(t * 71) * shake, ay = y / PX + Math.cos(t * 63) * shake;
  const bright = form * (1 + 2.2 * imp) * (1 + 0.45 * Math.min(2, h.flare));
  const q = 0.2, rin = 1.4, rout = 3.5;
  const tilt = h.tilt + Math.sin(t * 1.7) * 0.04, ct = Math.cos(tilt), st = Math.sin(tilt);
  const ext = Math.ceil(Rs * rout * 1.05) + 2;
  const flicker = 1 + Math.sin(t * 23) * 0.04 + Math.sin(t * 57) * 0.03 + h.flare * 0.15 * Math.sin(t * 90);
  let blue = 0;
  const dop = (s: number) => { const D = 1 + 0.5 * -s; blue = Math.max(0, D - 1.25) * 1.6; return Math.pow(D, 1.25); };
  for (let py = Math.floor(ay - ext); py <= Math.ceil(ay + ext); py++)
    for (let px = Math.floor(ax - ext); px <= Math.ceil(ax + ext); px++) {
      const dx = (px + 0.5 - ax) / Rs, dy = (py + 0.5 - ay) / Rs;
      const u = dx * ct + dy * st, v = -dx * st + dy * ct, r = Math.hypot(u, v);
      if (r > rout * 1.05) continue;
      let I = 0, lit = false;
      blue = 0;
      if (r >= 1) {
        const s = Math.max(0, -v / r), hh = 0.1 + 0.62 * Math.pow(s, 1.3), e = (r - 1) / hh;
        if (v < 0.25 && e < 1) {
          I = Math.max(I, (1 - Math.pow(e, 1.6)) * (0.72 + 0.28 * tex(rin + e * 1.5, Math.atan2(v, u), t)) * 0.9 * dop(u / r));
          lit = true;
        }
        const s2 = Math.max(0, v / r), h2 = 0.04 + 0.2 * Math.pow(s2, 1.3), e2 = (r - 1) / h2;
        if (v > -0.25 && e2 < 1) { I = Math.max(I, (1 - Math.pow(e2, 1.4)) * 0.5 * dop(u / r)); lit = true; }
        if (r < 1.075 + 0.04 * h.flare) { I = Math.max(I, 1.05 * flicker * (0.75 + 0.25 * dop(u / r))); lit = true; }
      }
      let shadow = r < 1;
      const rho = Math.hypot(u, v / q);
      if (rho >= rin && rho <= rout && (v >= 0 || r >= 1)) {
        const k = (rho - rin) / (rout - rin);
        const Id = 1.25 * Math.pow(1 - k, 1.1) * (0.7 + 0.3 * smooth(0, 0.05, k)) * (1 - smooth(0.72, 1, k)) * tex(rho, Math.atan2(v / q, u), t) * dop(u / rho);
        if (v >= 0) { if (Id > 0.08) { I = Id; shadow = false; lit = true; } } else if (Id > I) { I = Id; lit = true; }
      }
      const c = shadow || !lit ? 0 : tone(I * bright, px, py, blue);
      if (!c) { if (r < 1) buf.set(px, py, SHADOW); continue; }
      buf.set(px, py, c);
      if (I * bright > 0.35 && ((px + py) & 1) === 0) light.add(px, py, c, 0.22 * Math.min(1.3, I * bright));
    }
  const jetL = h.jet > 0.02 ? Rs * (4 + 6 * h.jet) : 0;
  if (jetL > 0) {
    const nx = -st, ny = ct;
    for (let side = -1; side <= 1; side += 2)
      for (let s = Rs * 0.9; s < jetL; s += 0.7) {
        const f = (s - Rs * 0.9) / (jetL - Rs * 0.9), wob = Math.sin(s * 0.45 - t * 40 + side) * 0.35 * f;
        const px = ax + nx * s * side + ct * wob, py = ay + ny * s * side + st * wob;
        const w = (1 + 3.2 * h.jet) * Math.pow(1 - f, 0.6) * (0.8 + 0.2 * Math.sin(t * 70 + s));
        if (w > 1.3) buf.disc(px, py, w + 0.6, JET_EDGE);
        if (w > 0.6) buf.disc(px, py, w, JET);
        buf.disc(px, py, Math.max(0.5, w * 0.6), JET_CORE);
        if (((s * 2) | 0) % 5 === 0) light.glow(px, py, 8 + 12 * h.jet * (1 - f), JET, 0.45 * h.jet);
      }
  }
  light.glow(ax, ay, Rs * 5.5, HOLE_LIGHT, 0.42 * bright);
  light.glow(ax, ay, Rs * 2.2, rgb(255, 225, 190), 0.25 * bright);
}
function drawBurst(buf: Px, light: Px, ax: number, ay: number, tilt: number, k: number, R: number) {
  const e = 1 - Math.pow(1 - k, 3), fade = 1 - k, rc = R * (0.5 + 1.3 * e);
  for (let py = Math.floor(ay - rc); py <= Math.ceil(ay + rc); py++)
    for (let px = Math.floor(ax - rc); px <= Math.ceil(ax + rc); px++) {
      const d = Math.hypot(px + 0.5 - ax, py + 0.5 - ay) / rc;
      if (d > 1) continue;
      const a = fade * (1 - d * d);
      if (a < bayer(px, py)) continue;
      buf.set(px, py, a > 0.55 ? JET_CORE : a > 0.3 ? BLUE_WHITE : VIOLET);
    }
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const spikes: [number, number, number][] = [[ct, st, 1], [-ct, -st, 1], [-st, ct, 0.8], [st, -ct, 0.8], [ct - st, st + ct, 0.45], [-ct + st, -st - ct, 0.45], [ct + st, st - ct, 0.45], [-ct - st, -st + ct, 0.45]];
  for (const [dx, dy, l] of spikes) {
    const n = Math.hypot(dx, dy), L = R * (2 + 6 * fade) * l;
    for (let r = rc * 0.6; r < rc + L; r += 0.8) {
      const f = (r - rc * 0.6) / (rc * 0.4 + L), px = Math.round(ax + (dx / n) * r), py = Math.round(ay + (dy / n) * r);
      if (f > fade * 1.2 || (f > 0.6 && bayer(px, py) < f - 0.4)) continue;
      buf.set(px, py, f < 0.35 ? JET_CORE : JET);
    }
  }
  light.glow(ax, ay, R * (4 + 5 * e), JET_CORE, 0.9 * fade);
  light.glow(ax, ay, R * (6 + 6 * e), VIOLET, 0.5 * fade);
}
interface Slab { x: number; y: number; vx: number; vy: number; a: number; va: number; w: number; h: number; pull: number; pullA: number; c: number }
function drawSlab(buf: Px, s: Slab) {
  const cx = s.x / PX, cy = s.y / PX, sx = 1 + 2.2 * s.pull, sy = 1 - 0.55 * s.pull;
  const cp = Math.cos(s.pullA), sp = Math.sin(s.pullA), ca = Math.cos(s.a), sa = Math.sin(s.a);
  const r = Math.ceil(Math.hypot(s.w, s.h) * 0.5 * sx) + 2, hw = s.w / 2 + 0.5, hh = s.h / 2 + 0.5;
  const lit = mix(s.c, WHITE, 0.25), dark = mix(s.c, SHADOW, 0.45);
  for (let py = Math.floor(cy - r); py <= Math.ceil(cy + r); py++)
    for (let px = Math.floor(cx - r); px <= Math.ceil(cx + r); px++) {
      const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      const along = (dx * cp + dy * sp) / sx, across = (-dx * sp + dy * cp) / sy;
      const wx = along * cp - across * sp, wy = along * sp + across * cp;
      const u = wx * ca + wy * sa, v = -wx * sa + wy * ca;
      const au = Math.abs(u), av = Math.abs(v);
      if (au > hw + 0.7 || av > hh + 0.7) continue;
      buf.set(px, py, au > hw || av > hh ? OUTLINE : v < -hh + 1 ? lit : v > hh - 1 ? dark : s.c);
    }
}
export function drawLens(g: CanvasRenderingContext2D, l: Lens, make: (w: number, h: number) => { getContext(t: "2d"): unknown } = (w, h) => new OffscreenCanvas(w, h)) {
  const { x: cx, y: cy, rs, rE, rOut, twist, gloom } = l;
  if (rs < 1 || rOut < rs + 4) return;
  const sz = Math.ceil(rOut * 2) + 4, half = sz / 2;
  const snap = make(sz, sz), sg = snap.getContext("2d") as CanvasRenderingContext2D;
  sg.drawImage(g.canvas as CanvasImageSource, cx - half, cy - half, sz, sz, 0, 0, sz, sz);
  const jump = (r: number) => { const q = rE / r; return q * q + 1.5 * twist * Math.pow(q, 1.5); };
  const rings: number[] = [];
  for (let tol = 2.5;; tol *= 1.5) {
    rings.length = 0;
    let r = rs * 0.95;
    rings.push(r);
    while (r < rOut) rings.push((r = Math.min(rOut, r + Math.max(0.75, Math.min(32, tol / jump(r))))));
    if (rings.length <= 110) break;
  }
  g.save();
  g.imageSmoothingEnabled = true;
  for (let i = rings.length - 1; i > 0; i--) {
    const r1 = rings[i]!, rm = (rings[i - 1]! + r1) / 2, fade = smooth(rOut * 0.45, rOut, rm);
    let s = ((rm - (rE * rE) / rm) / rm) * (1 - fade) + fade;
    const rot = -twist * Math.min(1.6, Math.pow(rE / rm, 1.5)) * (1 - fade);
    if (Math.abs(s - 1) < 0.003 && Math.abs(rot) < 0.002) continue;
    if (Math.abs(s) < 0.02) s = s < 0 ? -0.02 : 0.02;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    g.arc(cx, cy, r1, 0, TAU);
    g.clip();
    const k = 1 / s, c = Math.cos(rot) * k, sn = Math.sin(rot) * k, a = Math.min(half, r1 * Math.abs(s) + 1);
    g.setTransform(c, sn, -sn, c, cx - (c - sn) * half, cy - (sn + c) * half);
    g.drawImage(snap as CanvasImageSource, half - a, half - a, a * 2, a * 2, half - a, half - a, a * 2, a * 2);
    g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (gloom > 0.01) {
    const gg = g.createRadialGradient(cx, cy, rs, cx, cy, rs * 7.5);
    gg.addColorStop(0, `rgba(12,4,24,${Math.min(0.85, 0.55 * gloom).toFixed(3)})`);
    gg.addColorStop(0.3, `rgba(12,4,24,${Math.min(0.5, 0.26 * gloom).toFixed(3)})`);
    gg.addColorStop(1, "rgba(12,4,24,0)");
    g.fillStyle = gg;
    g.beginPath();
    g.arc(cx, cy, rs * 7.5, 0, TAU);
    g.fill();
  }
  const grad = g.createRadialGradient(cx, cy, rs * 0.9, cx, cy, rs * 1.6);
  grad.addColorStop(0, "rgba(6,2,10,0.5)");
  grad.addColorStop(1, "rgba(6,2,10,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, rs * 1.6, 0, TAU);
  g.fill();
  g.restore();
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
function rgb(r: number, g: number, b: number, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }
function hex(h: string) { const v = parseInt(h.replace("#", ""), 16); return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255); }
function mix(c1: number, c2: number, t: number) {
  const u = 1 - t, ch = (c: number, s: number) => (c >>> s) & 255;
  return rgb(ch(c1, 0) * u + ch(c2, 0) * t, ch(c1, 8) * u + ch(c2, 8) * t, ch(c1, 16) * u + ch(c2, 16) * t, ch(c1, 24) * u + ch(c2, 24) * t);
}
function luma(c: number) { return ((c & 255) * 0.299 + ((c >>> 8) & 255) * 0.587 + ((c >>> 16) & 255) * 0.114) / 255; }
function scale(c: number, k: number) {
  return rgb(Math.min(255, (c & 255) * k), Math.min(255, ((c >>> 8) & 255) * k), Math.min(255, ((c >>> 16) & 255) * k), c >>> 24);
}
const OUTLINE = hex("#1a1422");
const PAL = { white: WHITE, cyan: hex("#7ff3ff"), cyanDeep: hex("#1ab8e6") };
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
const GRAVITY = 1900;
const K = { PLASMA: 0, MOTE: 1, DUST: 2, INK: 3 } as const;
type K = (typeof K)[keyof typeof K];
interface P { k: K; x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; size: number }
class Particles {
  list: P[] = [];
  R: Rng;
  ground: (x: number) => number;
  constructor(R: Rng, ground: (x: number) => number) { this.R = R; this.ground = ground; }
  spawn(k: K, x: number, y: number, vx: number, vy: number, life: number, col = 0, size = 1) {
    this.list.push({ k, x, y, vx, vy, life, max: life, col, size });
  }
  attract(x: number, y: number, G: number, reach: number, swirl: number, eat: number, dt: number) {
    let eaten = 0;
    const soft = eat * eat;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!, dx = x - p.x, dy = y - p.y, d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      const d = Math.sqrt(d2) || 1;
      if (d < eat) { this.list.splice(i, 1); eaten++; continue; }
      const mote = p.k === K.MOTE, w = p.k === K.DUST ? 0.55 : mote ? 1.4 : 1;
      const a = (G / (d2 + soft)) * Math.min(1, (reach - d) / (reach * 0.25)) * w * dt, ux = dx / d, uy = dy / d;
      p.vx += (ux - uy * swirl) * a;
      p.vy += (uy + ux * swirl) * a;
      const drag = Math.min(0.2, (1 - d / reach) * (mote ? 1 : 3.2) * dt);
      p.vx -= p.vx * drag;
      p.vy -= p.vy * drag;
    }
    return eaten;
  }
  impulse(x: number, y: number, r: number, force: number) {
    for (const p of this.list) {
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > r) continue;
      const f = force * (1 - d / r) * (p.k === K.DUST ? 0.35 : 1);
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f - f * 0.3;
    }
  }
  update(dt: number) {
    const L = this.list, R = this.R;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]!;
      if ((p.life -= dt) <= 0) { L.splice(i, 1); continue; }
      const g = this.ground(p.x);
      switch (p.k) {
        case K.PLASMA: {
          p.vy += GRAVITY * 0.45 * dt;
          p.vx -= p.vx * 2.2 * dt;
          p.vy -= p.vy * 2.2 * dt;
          const ny = p.y + p.vy * dt;
          p.x += p.vx * dt;
          if (p.vy > 0 && p.y <= g && ny >= g) { p.vy = -p.vy * 0.45; p.vx *= 0.7; p.y = g - 0.5; } else p.y = ny;
          break;
        }
        case K.MOTE:
          p.vx -= p.vx * 0.6 * dt;
          p.vy -= p.vy * 0.6 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case K.DUST:
          p.vx -= p.vx * 4 * dt;
          p.vy -= p.vy * 4 * dt + 10 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case K.INK: {
          p.vy += GRAVITY * dt;
          p.vx -= p.vx * 0.5 * dt;
          const ny = p.y + p.vy * dt;
          p.x += p.vx * dt;
          if (p.vy > 0 && p.y <= g && ny >= g) {
            p.y = g - 0.5;
            if (p.vy > 260 && R.chance(0.45)) (p.vy = -p.vy * 0.22), (p.vx = p.vx * 0.55 + R.range(-30, 30));
            else (p.vx = p.vy = 0), (p.life = Math.min(p.life, 0.5));
          } else p.y = ny;
          break;
        }
      }
    }
  }
  draw(buf: Px, light: Px, layer: Layer) {
    for (const p of this.list) {
      if ((p.k === K.DUST || p.k === K.INK) !== (layer === "back")) continue;
      const k = p.life / p.max, ax = p.x / PX, ay = p.y / PX, px = Math.floor(ax), py = Math.floor(ay);
      switch (p.k) {
        case K.DUST:
          buf.alphaDisc(ax, ay, p.size * (0.6 + (1 - k) * 0.9), p.col, Math.pow(k, 1.3) * 0.7);
          break;
        case K.INK:
          if (k > 0.25 || bayer(px, py) < k * 4) {
            buf.set(px, py, p.col);
            if (p.size >= 2) { buf.set(px + 1, py, p.col); buf.set(px, py + 1, scale(p.col, 0.85)); buf.set(px + 1, py + 1, scale(p.col, 0.75)); }
          }
          break;
        case K.PLASMA: {
          const hot = k > 0.5 ? PAL.white : k > 0.25 ? PAL.cyan : PAL.cyanDeep;
          const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = Math.min(9, 1 + sp * 0.011);
          buf.line(ax - ux * len, ay - uy * len, ax - ux * len * 0.4, ay - uy * len * 0.4, k > 0.5 ? hot : PAL.cyanDeep);
          buf.line(ax - ux * len * 0.45, ay - uy * len * 0.45, ax, ay, hot);
          light.glow(ax, ay, 3, hot, 0.45 * k);
          break;
        }
        case K.MOTE: {
          const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, len = Math.min(16, 0.5 + sp * 0.013) * p.size;
          if (k < 0.35 && bayer(px, py) > k / 0.35) break;
          buf.line(ax - ux * len, ay - uy * len, ax - ux * len * 0.35, ay - uy * len * 0.35, scale(p.col, 0.55));
          buf.line(ax - ux * len * 0.4, ay - uy * len * 0.4, ax, ay, p.col);
          light.glow(ax, ay, 2.5 + p.size, p.col, 0.4 * k);
          break;
        }
      }
    }
  }
}
interface Timed { x: number; y: number; life: number; max: number }
class Rings {
  rings: (Timed & { r0: number; r1: number; thick: number; color: number })[] = [];
  lights: (Timed & { r: number; color: number; k: number })[] = [];
  ring(x: number, y: number, r0: number, r1: number, life: number, thick: number, color: number) {
    this.rings.push({ x, y, r0, r1, life, max: life, thick, color });
  }
  light(x: number, y: number, r: number, color: number, k: number, life: number) { this.lights.push({ x, y, r, color, k, life, max: life }); }
  update(dt: number) {
    for (const a of [this.rings, this.lights] as Timed[][]) for (let i = a.length - 1; i >= 0; i--) if ((a[i]!.life -= dt) <= 0) a.splice(i, 1);
  }
  draw(buf: Px, light: Px) {
    for (const r of this.rings) {
      const k = r.life / r.max, e = 1 - Math.pow(k, 3);
      buf.ring(r.x / PX, r.y / PX, (r.r0 + (r.r1 - r.r0) * e) / PX, Math.max(1, r.thick * k + 0.4), r.color, Math.min(1, k * 1.6));
    }
    for (const l of this.lights) { const k = l.life / l.max; light.glow(l.x / PX, l.y / PX, (l.r / PX) * (0.55 + 0.45 * k), l.color, l.k * k * k); }
  }
}
