/* Crown of Dust - unit brains (src/systems/ai.js).
   Enemies: chasers, kiters, casters with telegraphed blasts, chargers, mimics, bosses.
   Posse: the same fighters under the hero's standing order (follow / hold / charge) and focus target. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, E = CD.Ent, C = CD.Combat, W = CD.World;
const AI = CD.AI = {};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* walk toward a ground point, around walls. returns distance moved */
function seek(M, u, tx, ty, speed, dt) {
  const a = u.ai; a.lt = (a.lt || 0) - dt; a.pt -= dt;
  if (a.lt <= 0) { a.lt = 0.18 + Math.random() * 0.1; a.los = W.los(M, u.x, u.y, tx, ty); }
  let gx = tx, gy = ty;
  if (!a.los) {
    if (!a.path || a.pt <= 0 || Math.hypot(a.pgx - tx, a.pgy - ty) > 36) { a.path = W.path(M, u.x, u.y, tx, ty); a.pi = 0; a.pt = 0.8 + Math.random() * 0.6; a.pgx = tx; a.pgy = ty; }
    if (a.path && a.path.length) {
      while (a.pi < a.path.length - 1 && Math.hypot(a.path[a.pi][0] - u.x, a.path[a.pi][1] - u.y) < 9) a.pi++;
      gx = a.path[a.pi][0]; gy = a.path[a.pi][1]; a.stuck = 0;
    } else a.stuck = (a.stuck || 0) + dt;
  } else { a.path = null; a.stuck = 0; }
  let dx = gx - u.x, dy = gy - u.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  if (a.side) { a.sideT -= dt; const c = 0.34, s = 0.94 * a.side, x = dx * c - dy * s; dy = dx * s + dy * c; dx = x; if (a.sideT <= 0) a.side = 0; }   // jammed on a rock or a friend: step round it
  const moved = E.move(M, u, dx, dy, speed, dt);
  if (moved < speed * dt * 0.3) { a.jam = (a.jam || 0) + dt; if (a.jam > 0.25 && !a.side) { a.side = Math.random() < 0.5 ? 1 : -1; a.sideT = 0.45; a.jam = 0; } } else a.jam = 0;
  return moved;
}
AI.seek = seek;
function reachOf(u) { return u.def.bite != null ? u.r + 13 * u.mult : (u.def.reach || u.w.reach) * (u.mult > 1 ? u.mult : 1); }
function ranged(u) { return u.def.bite == null && u.w.kind === 'gun'; }

/* close with a target and attack it. leash = [x, y, r] keeps the unit near a point (posse on hold) */
function fight(M, u, t, dt, leash) {
  const a = u.ai, dx = t.x - u.x, dy = t.y - u.y, dd = Math.hypot(dx, dy), d = dd - t.r, ang = Math.atan2(dy, dx);
  if (ranged(u)) {
    const range = u.w.range * 0.82; a.st2 = (a.st2 || 0) - dt;
    if (a.st2 <= 0) { a.st2 = 0.25; a.clear = !W.shotBlocked(M, u.x + dx * 0.5, u.y + dy * 0.5) && !W.shotBlocked(M, u.x + dx * 0.25, u.y + dy * 0.25) && !W.shotBlocked(M, u.x + dx * 0.75, u.y + dy * 0.75); }
    if (d > range || !a.clear) { if (leash && Math.hypot(leash[0] - u.x, leash[1] - u.y) > leash[2]) return E.face(u, ang); return seek(M, u, t.x, t.y, u.spd, dt); }
    if (d < Math.min(55, range * 0.38) && !t.isStruct && u.cd > 0.4 && !u.boss && !leash) { const k = dd || 1; if (E.move(M, u, -dx / k, -dy / k, u.spd * 0.85, dt) > u.spd * dt * 0.3) return; }
    if (u.cd <= 0) {
      if (u.def.ai === 'caster' && u.team === 1 && !t.isStruct && (a.n = (a.n || 0) + 1) % 3 === 0) {       // every third cast is a marked blast on the ground
        E.face(u, ang); E.startOne(u, 'shoot', {fire: false, rate: 0.7}); u.cd = u.w.cd * 1.3;
        M.zones.push({x: t.x, y: t.y, r: 26 + (u.boss ? 10 : 0), t: 0, T: 0.95, dmg: 15 * u.dmg, team: 1, src: u, col: u.w.orb}); return;
      }
      C.attack(M, u, ang);
    } else E.face(u, ang);
    return;
  }
  const reach = reachOf(u) * 0.8;
  if (d > reach) { if (leash && Math.hypot(leash[0] - t.x, leash[1] - t.y) > leash[2] + 30) return; seek(M, u, t.x, t.y, u.spd, dt); }
  else if (u.cd <= 0) C.attack(M, u, ang, u.def.stomp && Math.random() < 0.4 ? {act: 'combo3', aoe: true, reach: 58, arc: 360, mul: 1.2, stun: 0.7} : null);
  else E.face(u, ang);
}
function nearest(M, u, team, maxD, from, fromR, structs) {
  let best = null, bd = maxD;
  for (const t of M.units) { if (t.team !== team || t.dead || t.caged || t.dormant || t.def.ai === 'pet') continue; const d = dist(u, t) * (t.prisoner ? 2.2 : 1); if (d < bd && (!from || Math.hypot(t.x - from[0], t.y - from[1]) < fromR)) { bd = d; best = t; } }
  if (!best && structs) for (const s of M.structs) { if (s.team !== team || s.gone || s.hp == null || (s.lock && s.lock(M))) continue; const d = dist(u, s); if (d < bd && (!from || Math.hypot(s.x - from[0], s.y - from[1]) < fromR)) { bd = d; best = s; } }
  return best;
}
const valid = t => t && !t.dead && !t.gone && !t.caged;

/* ---------- enemies ---------- */
function enemy(M, u, dt) {
  const a = u.ai, hero = M.hero, d = u.def;
  if (u.dormant) { if (hero && !hero.dead && dist(u, hero) < 34) { u.dormant = false; a.hate = hero; u.cd = 0.5; M.fx.push({k: 'ring', x: u.x, y: u.y, t: 0, T: 0.3, r: 24}); CD.Sfx.play('roar'); C.num(M, u.x, u.y, 30, 'MIMIC!', true, '#ff8a7a'); } return; }
  if (a.asleep) { if (hero && dist(u, hero) < 190 || u.hp < u.maxHp) { for (const b of M.bosses || [u]) b.ai.asleep = false; M.banner(u.name, 2.4); CD.Sfx.play('roar'); M.alarm = true; } return; }
  a.tk -= dt;
  if (a.tk <= 0) {
    a.tk = 0.3 + Math.random() * 0.2;
    let t = valid(a.hate) && dist(u, a.hate) < 330 ? a.hate : null;
    const sight = a.alert || a.march || M.alarm ? 420 : (d.sight || 150);
    const n = nearest(M, u, 0, sight); if (n && (!t || dist(u, n) < dist(u, t) * 0.7)) t = n;
    if (!t && a.march) t = M.hall && !M.hall.gone ? M.hall : nearest(M, u, 0, 2000, null, 0, true);
    if (a.stuck > 0.7 || (!t && a.march)) { const s = nearest(M, u, 0, 120, null, 0, true); if (s && s.isStruct) t = s; }
    if (t && !a.tg && !a.alert) { a.alert = true; for (const o of M.units) if (o.team === 1 && !o.dead && o !== u && dist(o, u) < 110) o.ai.alert = true; }   // one shout wakes the camp nearby
    a.tg = t;
  }
  if (!valid(a.tg)) a.tg = null;
  const t = a.tg;
  /* specials on timers */
  if (t) {
    a.sp = (a.sp == null ? 4 + Math.random() * 4 : a.sp) - dt;
    if (a.sp <= 0) {
      a.sp = u.boss ? 7 : 10;
      if (d.summon && M.enemyCount() < 40 && (a.sumN = (a.sumN || 0) + 1) <= (u.boss ? 5 : 3)) { E.startOne(u, 'dance3', {rate: 1.6}); for (let i = 0; i < (u.boss ? 3 : 2); i++) { const n = E.spawn(M, d.summon, 1, u.x + (Math.random() - 0.5) * 50, u.y + (Math.random() - 0.5) * 40); n.ai.hate = t; n.ai.alert = true; M.fx.push({k: 'ring', x: n.x, y: n.y, t: 0, T: 0.35, r: 14, col: '#6fd08a'}); } CD.Sfx.play('magic'); return; }
      if (d.nova && dist(u, t) < 170) { E.startOne(u, 'dance2', {rate: 1.4}); for (let i = 0; i < 12; i++) { const an = i / 12 * 6.283; M.shots.push({x: u.x, y: u.y, h: 18, vx: Math.cos(an) * 120, vy: Math.sin(an) * 120, life: 1.5, dmg: 12 * u.dmg, team: 1, src: u, orb: '#e0435a', splash: 14, push: 60}); } CD.Sfx.play('magic'); return; }
      if (d.heals) { let low = null; for (const o of M.units) if (o.team === 1 && !o.dead && o.hp < o.maxHp * 0.8 && dist(o, u) < 140 && (!low || o.hp / o.maxHp < low.hp / low.maxHp)) low = o; if (low) { E.startOne(u, 'shoot', {fire: false}); C.heal(M, low, Math.min(45, low.maxHp * 0.3)); CD.Sfx.play('heal'); return; } a.sp = 3; }
    }
  }
  if (d.ai === 'charger' && charger(M, u, t, dt)) return;
  if (t) return fight(M, u, t, dt);
  /* nothing to fight: drift back home */
  const h = a.home; if (h && Math.hypot(h[0] - u.x, h[1] - u.y) > 26) seek(M, u, h[0], h[1], u.spd * 0.6, dt);
  else { a.wt = (a.wt || 2 + Math.random() * 4) - dt; if (a.wt <= 0) { a.wt = 3 + Math.random() * 5; a.home = h || [u.x, u.y]; a.wx = a.home[0] + (Math.random() - 0.5) * 40; a.wy = a.home[1] + (Math.random() - 0.5) * 30; a.wn = 1.2; } if (a.wn > 0) { a.wn -= dt; seek(M, u, a.wx, a.wy, u.spd * 0.45, dt); } }
}
function charger(M, u, t, dt) {
  const a = u.ai; a.ct = (a.ct || 0) - dt;
  if (a.st === 'wind') { a.t -= dt; E.face(u, a.ca); if (a.t <= 0) { a.st = 'dash'; a.t = 0.8; a.hit = new Set(); CD.Sfx.play('roll'); } return true; }
  if (a.st === 'dash') {
    a.t -= dt; const moved = E.move(M, u, Math.cos(a.ca), Math.sin(a.ca), 150, dt);
    C.each(M, u.team, o => { if (a.hit.has(o.id) || Math.hypot(o.x - u.x, o.y - u.y) > u.r + o.r + 3) return; a.hit.add(o.id); C.hurt(M, o, (u.def.bite || u.w.dmg) * 1.5 * u.dmg, u, a.ca, 220); });
    if (Math.random() < 0.5) M.fx.push({k: 'dust', x: u.x, y: u.y, t: 0, T: 0.3, r: 5});
    if (a.t <= 0 || moved < 150 * dt * 0.3) { a.st = 'rest'; a.t = 0.9; a.ct = 3.5 + Math.random() * 2; }
    return true;
  }
  if (a.st === 'rest') { a.t -= dt; if (a.t <= 0) a.st = 'idle'; return true; }
  if (t && !t.isStruct && a.ct <= 0) { const d = dist(u, t); if (d > 50 && d < 170 && W.los(M, u.x, u.y, t.x, t.y)) { a.st = 'wind'; a.t = 0.6; a.ca = Math.atan2(t.y - u.y, t.x - u.x); M.fx.push({k: 'tele', x: u.x, y: u.y, a: a.ca, t: 0, T: 0.6, r: 170}); return true; } }
  return false;
}

/* ---------- the posse ---------- */
function ally(M, u, dt) {
  const a = u.ai, hero = M.hero, heroOk = hero && !hero.dead;
  if (u.def.ai === 'pet') { if (heroOk) { const d = dist(u, hero); if (d > 46) seek(M, u, hero.x - 20, hero.y + 14, d > 120 ? u.spd * 1.4 : u.spd * 0.8, dt); } return; }
  const order = u.militia ? 'hold' : u.prisoner ? 'follow' : M.order;
  let ax, ay, R;
  if (order === 'hold') { if (a.hx == null) { a.hx = u.x; a.hy = u.y; } ax = a.hx; ay = a.hy; R = u.militia ? 150 : 110; }
  else if (order === 'charge' && M.orderPt) { ax = M.orderPt[0]; ay = M.orderPt[1]; R = 200; }
  else if (heroOk) { const b = hero.aim + Math.PI + ((u.slot % 2) ? 1 : -1) * (0.5 + 0.45 * Math.floor(u.slot / 2)), rr = 24 + 9 * Math.floor(u.slot / 2); ax = hero.x + Math.cos(b) * rr; ay = hero.y + Math.sin(b) * rr; R = 150; }
  else { ax = u.x; ay = u.y; R = 150; }
  if (order !== 'hold') { a.hx = null; }
  a.tk -= dt;
  if (a.tk <= 0) {
    a.tk = 0.3 + Math.random() * 0.2; let t = null;
    if (!u.prisoner) {
      if (valid(M.focus) && dist(u, M.focus) < 320) t = M.focus;
      if (!t && valid(a.hate) && dist(u, a.hate) < 150) t = a.hate;
      if (!t) t = nearest(M, u, 1, 170, [ax, ay], R, order !== 'follow' || true);
    }
    a.tg = t;
  }
  if (!valid(a.tg)) a.tg = null;
  if (order === 'follow' && heroOk && dist(u, hero) > 300) a.tg = null;          // do not get strung out across the map
  if (a.tg) return fight(M, u, a.tg, dt, order === 'hold' ? [ax, ay, 70] : null);
  const d = Math.hypot(ax - u.x, ay - u.y);
  if (d > (order === 'follow' ? 12 : 8)) seek(M, u, ax, ay, d > 70 ? u.spd * 1.5 : d > 26 ? u.spd * 1.1 : u.spd * 0.7, dt);
  else if (heroOk && order === 'follow' && !hero.moving) u.dir = hero.dir;
}

AI.update = function (M, dt) {
  for (const u of M.units) {
    if (u.hero || u.dead || u.caged) continue;
    if (u.stun > 0 || u.one || u.roll) continue;
    if (M.over) { continue; }
    if (u.team === 1) enemy(M, u, dt); else ally(M, u, dt);
  }
};
/* soft push so bodies do not stack */
AI.separate = function (M, dt) {
  const us = M.units, n = us.length;
  for (let i = 0; i < n; i++) { const a = us[i]; if (a.dead || a.caged) continue;
    for (let j = i + 1; j < n; j++) { const b = us[j]; if (b.dead || b.caged) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = (a.r + b.r) * 0.85; if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      const d = Math.hypot(dx, dy); if (d >= rr) continue; const k = (rr - d) * Math.min(1, dt * 9), nx = d > 0.01 ? dx / d : 1, ny = d > 0.01 ? dy / d : 0;
      const both = a.boss && b.boss, wa = a.dormant || (a.boss && !both) ? 0 : a.hero ? 0.3 : b.r / (a.r + b.r), wb = b.dormant || (b.boss && !both) ? 0 : b.hero ? 0.3 : a.r / (a.r + b.r);   // two bosses still push each other apart
      a.x -= nx * k * wa; a.y -= ny * k * wa; b.x += nx * k * wb; b.y += ny * k * wb; } }
};
})();
