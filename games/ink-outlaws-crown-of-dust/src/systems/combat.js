/* Crown of Dust - combat (src/systems/combat.js). Generalises the lab arena's fire()/melee() from one player to every unit. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, S = CD.Sprites, E = CD.Ent;
const C = CD.Combat = {};
const SND = {revolver: 'shot', twin: 'shot', flintlock: 'rifle', rifle: 'rifle', shotgun: 'shotgun', sawedoff: 'shotgun', bow: 'bow', magic: 'magic', tome: 'magic'};
const sfx = n => CD.Sfx.play(n);

/* begin an attack toward a ground angle. o: act (override), mul (damage multiplier), plus anything stepOne understands */
C.attack = function (M, u, ang, o) {
  if (u.one || u.stun > 0 || u.dead) return false;
  o = o || {}; E.face(u, ang);
  const w = u.w, beast = u.def.bite != null;
  const act = o.act || (beast ? 'attack' : (w.kind === 'gun' || w.thrust) ? 'shoot' : 'attack');
  if (w.kind === 'melee' || beast) { if (C.onScreen(M, u)) sfx(beast ? 'roar' === o.snd ? 'roar' : 'swing' : 'swing'); }
  E.startOne(u, act, Object.assign({rate: beast ? 1 : w.rate, aimAng: ang}, o, {act: act}));
  u.cd = (beast ? 1.1 : w.cd) * (0.85 + Math.random() * 0.3);
  return true;
};
C.onScreen = (M, u) => Math.abs(u.x - M.cam.x) < M.view.w * 0.6 && Math.abs(u.y * U.YS - M.cam.y) < M.view.h * 0.6;

C.fire = function (M, u, o, an) {
  const w = u.w; if (w.kind !== 'gun') return;
  let mz = an.muzzle; if (u.weapon === 'twin' && an.muzzle2) { u.alt = !u.alt; if (u.alt) mz = an.muzzle2; }
  const off = mz ? S.off(mz, u.mult) : an.handA ? S.off(an.handA, u.mult) : [0, -24 * u.mult];
  const ang = o.aimAng != null ? o.aimAng : u.aim, n = o.pellets || w.pellets, spread = o.spread != null ? o.spread : w.spread, mul = (o.mul || 1) * u.dmg;
  for (let i = 0; i < n; i++) {
    const a = ang + (n > 1 ? (i - (n - 1) / 2) * spread + (Math.random() - 0.5) * 0.04 : (Math.random() - 0.5) * (u.hero ? 0.02 : 0.09));
    M.shots.push({x: u.x + off[0] * 0.6, y: u.y + Math.sin(a) * 3, h: Math.max(6, -off[1]), vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, life: (o.range || w.range) / w.speed, dmg: w.dmg * mul, team: u.team, src: u,
      arrow: w.arrow, orb: w.orb, splash: w.splash, pierce: o.pierce != null ? o.pierce : (w.pierce || 0), push: w.push, hitIds: null});
  }
  if (!w.arrow && !w.orb) M.fx.push({k: 'flash', x: u.x + off[0], y: u.y + (an.back ? -0.5 : 0.5), h: -off[1], a: ang, t: 0, T: 0.09, r: n > 1 || u.weapon === 'rifle' ? 7.5 : 5.5});
  if (C.onScreen(M, u)) sfx(SND[u.weapon] || 'shot');
};

C.strike = function (M, u, o, an) {
  const w = u.w, beast = u.def.bite != null; if (!beast && w.kind !== 'melee') return;
  const dmg = (beast ? u.def.bite : w.dmg) * u.dmg * (o.mul || 1), reach = o.reach || (beast ? u.r + 15 * u.mult : (u.def.reach || w.reach) * (u.mult > 1 ? u.mult : 1));
  const arc = (o.arc || (beast ? 110 : w.arc)) * Math.PI / 360, ang = o.aimAng != null ? o.aimAng : u.aim, push = o.push || (beast ? 70 : w.push);
  if (!o.done) { o.done = new Set(); M.fx.push({k: 'slash', x: u.x, y: u.y, h: 16 * u.mult, a: ang, r: reach, arc: arc, t: 0, T: 0.16}); }
  let any = false;
  C.each(M, u.team, t => {
    if (o.done.has(t.id)) return; const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) - t.r;
    if (d > reach) return; if (d > 5 && Math.abs(U.angDiff(Math.atan2(dy, dx), ang)) > arc) return;
    o.done.add(t.id); if (C.hurt(M, t, dmg, u, Math.atan2(dy, dx), push, {stun: o.stun || w.stun})) any = true;
  });
  if (o.aoe) { M.fx.push({k: 'ring', x: u.x, y: u.y, t: 0, T: 0.3, r: reach}); M.shake = Math.max(M.shake, 3); }
  if (any && C.onScreen(M, u)) sfx('hit');
};

/* every thing hostile to `team`: live units, then structures that can be damaged */
C.each = function (M, team, fn) {
  for (const t of M.units) if (t.team !== team && !t.dead && !t.caged && t.team !== 2) fn(t);
  for (const s of M.structs) if (s.hp != null && s.team !== team && s.team !== 2 && !s.gone) fn(s);
};

C.hurt = function (M, t, dmg, src, ang, push, o) {
  if (t.dead || t.gone || t.inv > 0 || t.caged) return false;
  dmg = Math.max(1, Math.round(dmg * (0.88 + Math.random() * 0.24)));
  if (t.isStruct) {
    if (t.hp == null) return false; if (t.lock && t.lock(M)) { C.num(M, t.x, t.y, 30, 'LOCKED', false, U.PAPER3); return false; }
    t.hp -= dmg; t.hot = 0.12; C.num(M, t.x, t.y, (t.top || 30), String(dmg), false);
    M.fx.push({k: 'puff', x: t.x + (Math.random() - 0.5) * 10, y: t.y + 1, h: 10 + Math.random() * 14, t: 0, T: 0.25, r: 5});
    if (t.hp <= 0) CD.World.destroy(M, t, src); return true;
  }
  if (t.hero && M.god) return false;
  if (t.def.armor) dmg = Math.max(1, Math.round(dmg * (1 - t.def.armor)));
  t.hp -= dmg; t.flash = 0.14;
  const k = (t.boss ? 0.15 : t.r > 9 ? 0.4 : 1) * (push || 0); t.kx += Math.cos(ang) * k; t.ky += Math.sin(ang) * k;
  if (o && o.stun && !t.boss) t.stun = Math.max(t.stun, o.stun);
  C.num(M, t.x, t.y, 42 * t.mult, String(dmg), dmg >= 18 || t.hero, t.hero ? '#ff8a7a' : null);
  M.fx.push({k: 'puff', x: t.x, y: t.y + 0.5, h: 20 * t.mult, t: 0, T: 0.26, r: dmg >= 18 ? 7 : 4.5});
  if (t.dormant) { t.dormant = false; t.ai.st = 'idle'; }
  if (src && src.team !== t.team && !src.isStruct && !src.dead) t.ai.hate = src;
  if (t.hero) { sfx('hurt'); M.shake = Math.max(M.shake, 4); t.inv = Math.max(t.inv, 0.35); }
  if (t.hp <= 0) C.kill(M, t, src, ang);
  return true;
};
C.kill = function (M, t, src, ang) {
  if (t.def.phase2 && !t.phased) {                           // the boss changes shape instead of falling
    const d2 = D.units[t.def.phase2]; t.phased = true; t.def = d2; t.look = d2.look; t.maxHp = Math.round(d2.hp * M.hpScale); t.hp = t.maxHp; t.r = d2.r; t.spd = d2.spd; t.mult = d2.mult; t.weapon = d2.weapon; t.w = D.weapons[d2.weapon]; t.one = null; t.inv = 1.2; t.ai.st = 'idle';
    M.fx.push({k: 'ring', x: t.x, y: t.y, t: 0, T: 0.5, r: 60}); M.banner(t.name + ' mounts up!', 2); sfx('horn'); return;
  }
  t.hp = 0; t.dead = true; t.deadT = 0; t.one = null; t.roll = null; t.z = 0; t.fall = Math.cos(ang || 0) >= 0 ? 1 : -1;
  if (C.onScreen(M, t)) sfx('die');
  if (t.team === 1) {
    M.kills++; const b = t.def.bounty || 0;
    for (let i = 0; i < Math.min(8, b); i++) M.pickups.push({k: 'coin', x: t.x + (Math.random() - 0.5) * 16, y: t.y + (Math.random() - 0.5) * 12, v: Math.max(1, Math.round(b / Math.min(8, b))), t: 0, vz: 30 + Math.random() * 30, z: 6});
    if (Math.random() < (t.elite || t.boss ? 1 : 0.07)) M.pickups.push({k: 'heart', x: t.x + 6, y: t.y + 4, v: 30, t: 0, vz: 40, z: 6});
    if (t.def.split) for (let i = 0; i < 2; i++) { const n = E.spawn(M, t.def.split, 1, t.x + (i ? 8 : -8), t.y + (Math.random() - 0.5) * 8); n.kx = (i ? 60 : -60); n.ai.hate = src && !src.isStruct ? src : null; }
  }
  if (M.onKill) M.onKill(t, src);
};
C.num = function (M, x, y, h, txt, big, col) { M.nums.push({x: x + (Math.random() - 0.5) * 6, y: y, h: h, txt: txt, t: 0, big: !!big, col: col}); };

/* explosion: hurts everything hostile to `team` (team -1 hurts everyone) */
C.boom = function (M, x, y, r, dmg, team, src) {
  M.fx.push({k: 'boom', x: x, y: y, t: 0, T: 0.42, r: r}); M.shake = Math.max(M.shake, r > 40 ? 9 : 5); if (CD.World.scorch) CD.World.scorch(M, x, y, r * 0.6); sfx('boom');
  const hit = t => { const d = Math.hypot(t.x - x, t.y - y) - t.r; if (d < r) C.hurt(M, t, dmg * (1 - 0.5 * Math.max(0, d) / r), src, Math.atan2(t.y - y, t.x - x), 160); };
  if (team === -1) { C.each(M, 0, hit); C.each(M, 1, hit); } else C.each(M, team, hit);
};
C.heal = function (M, t, v) { if (t.dead || t.hp >= t.maxHp) return; t.hp = Math.min(t.maxHp, t.hp + v); C.num(M, t.x, t.y, 42 * t.mult, '+' + Math.round(v), false, '#9fe07a'); M.fx.push({k: 'heal', x: t.x, y: t.y, t: 0, T: 0.6, r: 10}); };

C.update = function (M, dt) {
  /* shots */
  for (const b of M.shots) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0) { if (b.splash) C.boomlet(M, b); else M.fx.push({k: 'puff', x: b.x, y: b.y, h: b.h, t: 0, T: 0.2, r: 3}); continue; }
    if (CD.World.shotBlocked(M, b.x, b.y)) { b.life = -1; if (b.splash) C.boomlet(M, b); else M.fx.push({k: 'puff', x: b.x, y: b.y, h: b.h, t: 0, T: 0.2, r: 3.5}); continue; }
    let stop = false;
    C.each(M, b.team, t => {
      if (stop || (b.hitIds && b.hitIds.has(t.id))) return; const rr = t.r + (b.orb ? 4 : 2.5);
      if (Math.abs(t.x - b.x) > rr || Math.abs(t.y - b.y) > rr) return; if (t.isStruct && t.low) return;
      if (b.splash) { stop = true; return; }
      if (!C.hurt(M, t, b.dmg, b.src, Math.atan2(b.vy, b.vx), b.push)) return;
      if (b.pierce > 0) { b.pierce--; (b.hitIds || (b.hitIds = new Set())).add(t.id); } else stop = true;
    });
    if (stop) { b.life = -1; if (b.splash) C.boomlet(M, b); }
  }
  M.shots = M.shots.filter(b => b.life > 0);
  /* telegraphed blasts */
  for (const z of M.zones) { z.t += dt; if (z.t >= z.T && !z.done) { z.done = true; C.boom(M, z.x, z.y, z.r, z.dmg, z.team, z.src); } }
  M.zones = M.zones.filter(z => !z.done);
  for (const e of M.fx) e.t += dt; M.fx = M.fx.filter(e => e.t < e.T);
  for (const n of M.nums) n.t += dt; M.nums = M.nums.filter(n => n.t < 0.8);
};
C.boomlet = function (M, b) {                               // spell orb bursting
  M.fx.push({k: 'ring', x: b.x, y: b.y, t: 0, T: 0.25, r: b.splash, col: b.orb}); if (Math.abs(b.x - M.cam.x) < M.view.w) sfx('hit');
  C.each(M, b.team, t => { if (Math.hypot(t.x - b.x, t.y - b.y) - t.r < b.splash) C.hurt(M, t, b.dmg, b.src, Math.atan2(t.y - b.y, t.x - b.x), 50); });
};
})();
