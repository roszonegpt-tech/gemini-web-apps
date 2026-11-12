/* Crown of Dust - units (src/entities/unit.js).
   One record type covers the hero, the posse and every enemy. Ground positions are isotropic (x, y); the screen shows y * U.YS.
   Attacks are the lab's own one-shot actions: the painter's per-frame anchors say when a gun fires or a swing lands. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, S = CD.Sprites, INK = window.INK;
const E = CD.Ent = {};
let uid = 1;
const ANG = {S: Math.PI / 2, SE: Math.PI / 4, E: 0, NE: -Math.PI / 4, N: -Math.PI / 2, NW: -Math.PI * 0.75, W: Math.PI, SW: Math.PI * 0.75};

E.spawn = function (M, id, team, x, y, o) {
  const d = D.units[id]; if (!d) throw new Error('no unit ' + id);
  const hs = team === 1 ? M.hpScale : 1;
  const u = {id: uid++, def: d, look: d.look, name: d.name, team: team, x: x, y: y, z: 0, kx: 0, ky: 0, dir: team === 1 ? 'W' : 'E', aim: 0, t: Math.random() * 3, one: null, roll: null,
    hp: Math.round(d.hp * hs), maxHp: Math.round(d.hp * hs), r: d.r, spd: d.spd, mult: d.mult, weapon: d.weapon, w: D.weapons[d.weapon], dmg: d.dmg * (team === 1 ? M.dmgScale : 1),
    cd: 0.4 + Math.random() * 0.8, flash: 0, stun: 0, inv: 0, dead: false, deadT: 0, moving: false, run: false, boss: !!d.boss, elite: !!d.elite,
    ai: {st: 'idle', tg: null, t: Math.random() * 0.4, path: null, pi: 0, pt: 0, tk: 0}, dance: 0, slot: 0};
  if (o) Object.assign(u, o);
  M.units.push(u); return u;
};
E.setWeapon = function (u, id) { u.weapon = id; u.w = D.weapons[id]; if (u.look.weapon !== id) { u.look = E.lookWith(u.look, id); } u.one = null; };
/* a look carrying a different weapon, cached on the base look so the sprite cache keeps one identity per variant */
E.lookWith = function (look, weapon) {
  const base = look._base || look; if (base.weapon === weapon) return base;
  const k = '_w' + weapon; if (!base[k]) { const v = Object.assign({}, base, {weapon: weapon}); Object.defineProperty(v, '_base', {value: base, enumerable: false}); Object.defineProperty(base, k, {value: v, enumerable: false}); }
  return base[k];
};
E.face = function (u, ang) { u.aim = ang; u.dir = U.dirOf(Math.cos(ang), Math.sin(ang)); };
E.ang = d => ANG[d];

/* which painter frame to show */
E.anim = function (u) {
  if (u.one) return [u.one.act, Math.max(0, u.one.f)];
  if (u.roll) { const p = u.roll.t / u.roll.T; return ['jump', p < 0.15 ? 0 : p < 0.8 ? 1 : 2]; }
  if (u.moving) { const act = u.run ? 'run' : 'walk', k = U.clamp(u.mspd / (u.run ? 46 : 23), 0.75, 1.5); return [act, Math.floor(u.t * INK.FPS[act] * k) % INK.COUNT[act]]; }
  const act = u.dance ? 'dance' + u.dance : 'idle';
  return [act, Math.floor(u.t * INK.FPS[act]) % INK.COUNT[act]];
};

/* one-shot actions */
E.startOne = function (u, act, o) { u.one = Object.assign({act: act, t: 0, f: -1, rate: 1, done: null, mul: 1}, o || {}); u.dance = 0; E.stepOne(CD.M, u, 0); };
E.stepOne = function (M, u, dt) {
  const o = u.one; o.t += dt * o.rate; const f = Math.floor(o.t * INK.FPS[o.act]);
  if (f >= INK.COUNT[o.act]) { u.one = null; if (o.onEnd) o.onEnd(u, o); return; }
  for (let i = o.f + 1; i <= f; i++) { if (u.one !== o) return; const an = S.anchors(u.look, o.act, i, u.dir); if (!an) continue; if (o.onFrame) o.onFrame(u, o, i, an); if (an.fire && o.fire !== false) CD.Combat.fire(M, u, o, an); if (an.hit) CD.Combat.strike(M, u, o, an); }
  if (u.one === o) o.f = f;
};

/* move along a unit direction; walls and structures push back. returns how far it actually got (for stuck detection) */
E.move = function (M, u, dx, dy, speed, dt, keepDir) {
  const ox = u.x, oy = u.y; u.x += dx * speed * dt; u.y += dy * speed * dt;
  CD.World.resolve(M, u);
  u.moving = true; u.mspd = speed; u.run = speed >= 33;
  if (!keepDir) { u.dir = U.dirOf(dx, dy); u.aim = Math.atan2(dy, dx); }
  return Math.hypot(u.x - ox, u.y - oy);
};

E.update = function (M, u, dt) {
  u.t += dt; if (u.flash > 0) u.flash -= dt; if (u.inv > 0) u.inv -= dt; if (u.cd > 0) u.cd -= dt; if (u.stun > 0) u.stun -= dt;
  if (u.dead) { u.deadT += dt; return; }
  if (u.kx || u.ky) {                                         // knockback
    u.x += u.kx * dt; u.y += u.ky * dt; const k = Math.pow(0.0009, dt); u.kx *= k; u.ky *= k; if (Math.abs(u.kx) + Math.abs(u.ky) < 4) u.kx = u.ky = 0;
    CD.World.resolve(M, u);
  }
  if (u.roll) { const r = u.roll; r.t += dt; const p = r.t / r.T; u.z = 10 * Math.sin(Math.PI * Math.min(1, p)); const sp = r.sp * (1 - 0.6 * p); u.x += r.dx * sp * dt; u.y += r.dy * sp * dt; CD.World.resolve(M, u); if (p >= 1) { u.roll = null; u.z = 0; } }
  if (u.one) E.stepOne(M, u, dt);
};

/* ---------- drawing ---------- */
const RING = ['#d9a520', '#a8474a'];
E.draw = function (c, M, u) {
  const sx = u.x, sy = u.y * U.YS, m = u.mult;
  if (u.dormant) { S.draw(c, u.look, 'idle', 0, 'S', sx, sy, {mult: m}); return; }
  const an = E.anim(u), sh = 1 - Math.min(0.5, u.z / 40);
  if (!u.dead) {
    U.ell(c, sx, sy, u.r * 1.5 * sh, u.r * 0.42 * sh, 'rgba(22,18,20,.28)');
    if (u.hero || u.boss || u.elite) { c.beginPath(); c.ellipse(sx, sy, u.r * 1.9, u.r * 0.6, 0, 0, 7); c.lineWidth = u.hero ? 1.1 : 0.9; c.strokeStyle = u.hero ? RING[0] : RING[1]; c.stroke(); }
    else if (u.team === 0) { c.beginPath(); c.ellipse(sx, sy, u.r * 1.7, u.r * 0.5, 0, 0, 7); c.lineWidth = 0.6; c.strokeStyle = RING[0]; c.stroke(); }
  }
  const o = {mult: m, last: u.lastSp};
  if (u.flash > 0) o.flash = Math.min(1, u.flash / 0.1) * 0.85;
  if (u.inv > 0 && u.hero && !u.roll && Math.floor(u.inv * 16) % 2) o.alpha = 0.55;
  if (u.dead) { const t = u.deadT; o.rot = (u.fall || 1) * Math.min(1, t / 0.3) * 1.5; o.alpha = 1 - Math.max(0, (t - 0.45) / 0.45); }
  if (u.stun > 0 && !u.dead) o.sy = 0.94;
  u.lastSp = S.draw(c, u.look, an[0], an[1], u.dir, sx, sy - u.z, o);
  if (u.caged) return;
  if (!u.dead && u.hp < u.maxHp && !u.hero && !u.boss && !M.spec.noHud) {       // small ink health bar
    const w = Math.min(26, 10 + u.maxHp / 12), y = sy - (u.lastSp ? -u.lastSp.oy : 50) - 4, f = Math.max(0, u.hp / u.maxHp);
    c.fillStyle = U.INKC; c.fillRect(sx - w / 2 - 0.6, y - 0.6, w + 1.2, 3.2); c.fillStyle = u.team === 0 ? '#7fae5a' : U.RED; c.fillRect(sx - w / 2, y, w * f, 2);
  }
  if (u.stun > 0 && !u.dead) { const y = sy - (u.lastSp ? -u.lastSp.oy : 50) - 6; for (let i = 0; i < 3; i++) { const a = M.t * 6 + i * 2.1; U.poly(c, U.ngon(sx + Math.cos(a) * 6, y + Math.sin(a) * 2, 1.6, 4, a), U.MUST, 0.4); } }
};
})();
