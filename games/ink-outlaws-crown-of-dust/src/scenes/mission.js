/* Crown of Dust - mission scene (src/scenes/mission.js).
   The real-time layer: hero control, posse orders, building at stakes, objectives per mission type, camera and drawing. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, S = CD.Sprites, A = CD.Art, E = CD.Ent, C = CD.Combat, W = CD.World, AI = CD.AI, F = CD.Fx, I = CD.Input, INK = window.INK, YS = U.YS;
const MS = CD.Mission = {};
D.builds = [['barricade', 'Barricade', 8, 'Blocks the way'], ['guntower', 'Gun nest', 20, 'Shoots on its own'], ['campfire', 'Campfire', 12, 'Heals the posse'], ['keg', 'Powder keg', 6, 'Blows when they step close']];
D.missionNames = {raid: 'Raid', rescue: 'Rescue', heist: 'Heist', defend: 'Defend', boss: 'Stronghold'};

/* ================= setup ================= */
MS.start = function (spec, onEnd) {
  spec.perk = spec.perk || {};
  const M = CD.M = {spec: spec, onEnd: onEnd, t: 0, cam: {x: 0, y: 0}, view: {w: 320, h: 200, S: 3}, shake: 0, kills: 0, scrip: 6 + 4 * (spec.perk.powder || 0), loot: 0, perk: spec.perk, order: 'follow', orderPt: null, focus: null, over: null,
    state: 'load', revives: spec.perk.doc || 0, boxN: 0, god: false, bannerTxt: '', bannerT: 0, paused: false, buildOpen: false, near: null, posse: [], stage: 0, lost: []};
  M.banner = (txt, T) => { M.bannerTxt = txt; M.bannerT = T || 2; M.bannerT0 = T || 2; };
  M.enemyCount = () => { let n = 0; for (const u of M.units) if (u.team === 1 && !u.dead) n++; return n; };
  W.build(M, spec);
  const hs = spec.hero, def = D.units[hs.id], h = E.spawn(M, hs.id, 0, M.start[0], M.start[1]);
  h.hero = true; h.baseLook = def.look; h.weapons = (hs.weapons && hs.weapons.length ? hs.weapons : [def.weapon]).slice(0, 2); h.wi = 0; h.mount = hs.mount || null;
  h.maxHp = h.hp = Math.round(def.hp * (1 + 0.15 * (spec.perk.doc || 0)) * 1.15); h.dmg = 1 + 0.12 * (spec.perk.smithy || 0); h.spd = h.mount ? 58 : 46; h.r = h.mount ? 9 : 6;
  h.rollCd = 0; h.spCd = 2; h.chain = 0; h.chainT = -9; h.dir = spec.type === 'defend' ? 'S' : 'E'; h.aim = E.ang(h.dir); M.hero = h; heroLook(h);
  (spec.posse || []).forEach((id, i) => { const a = i / Math.max(1, spec.posse.length) * 6.283, p = E.spawn(M, id, 0, h.x - 18 + Math.cos(a) * 22, h.y + Math.sin(a) * 18); p.slot = i; p.dmg = 0.8 + 0.1 * (spec.perk.smithy || 0); p.maxHp = p.hp = Math.round(p.maxHp * 1.5 * (1 + 0.1 * (spec.perk.doc || 0))); p.dir = h.dir; M.posse.push(p); });
  M.onKill = (t) => { if (t.team === 0 && !t.hero && !t.prisoner && M.posse.indexOf(t) >= 0) { M.lost.push(t.def.id); M.banner(t.name + ' is down!', 1.6); } if (t.prisoner) end(M, false, t.name + ' did not make it.'); };
  M.onStruct = (s) => { if (s === M.cage && M.prisoner) { const p = M.prisoner; p.caged = false; CD.Sfx.play('horn');
      if (spec.type === 'rescue') { M.stage = 1; M.alarm = true; M.banner(p.name + ' is free! Get back to the trail.', 3); reinforce(M, 2 + M.tier); }
      else { p.prisoner = false; p.slot = M.posse.length; p.hp = p.maxHp; M.banner(p.name + ' is free and fighting!', 2.4); } }
    if (s === M.hall) end(M, false, 'The town hall has fallen.'); };
  if (spec.type === 'defend') M.waves = {i: 0, n: 3 + Math.ceil(M.tier / 2), t: 7, live: false};
  /* paint ahead: the hero completely, everyone else standing and moving */
  const mv = u => u.spd >= 33 ? 'run' : 'walk', seen = new Set();
  S.warm(h.look, ['idle', 'run', 'jump'].concat(h.w.kind === 'gun' || h.w.thrust ? ['shoot'] : ['combo1', 'combo2', 'combo3']), 1);
  for (const u of M.units) { if (u.hero || seen.has(u.look)) continue; seen.add(u.look); S.warm(u.look, ['idle', mv(u)], u.mult, ['S', 'SE', 'E', 'W', 'SW']); }
  S.queue.reverse(); M.loadN = S.queue.length; M.loadT0 = performance.now();
  layout(M); M.cam.x = h.x; M.cam.y = h.y * YS; clampCam(M);
  return M;
};
function heroLook(h) { let v = E.lookWith(h.baseLook, h.weapons[h.wi]); if (h.mount) v = D.mounted(v, h.mount); h.look = v; h.weapon = h.weapons[h.wi]; h.w = D.weapons[h.weapon]; h.spec = D.specialOf(h.weapon); h.one = null; }
function layout(M) {
  const V = CD.View, s = U.clamp(Math.min(V.w / 500, V.h / 300), 1.15, 3.4); M.view.S = s; M.view.w = V.w / s; M.view.h = V.h / s; S.configure(s * V.dpr);
}
MS.layout = () => { if (CD.M) layout(CD.M); };
function clampCam(M) {
  const v = M.view, Hs = M.H * YS;
  M.cam.x = M.W <= v.w ? M.W / 2 : U.clamp(M.cam.x, v.w / 2, M.W - v.w / 2); M.cam.y = Hs <= v.h ? Hs / 2 : U.clamp(M.cam.y, v.h / 2 - 16, Hs - v.h / 2 + 10);
}
function reinforce(M, n, from) {
  const p = from || [M.W - 30, M.H / 2 + (M.rng() - 0.5) * 300]; const g = W.group(M, p[0], p[1], n, {set: {}}); for (const u of g) { u.ai.march = true; u.ai.alert = true; u.ai.hate = M.hero; } return g;
}
function end(M, win, why) {
  if (M.over) return; M.over = {win: win, t: 0, why: why || ''}; CD.Sfx.play(win ? 'win' : 'lose'); M.banner(win ? 'VICTORY' : 'DEFEATED', 3);
  if (win) for (const u of M.units) if (u.team === 0 && !u.dead && u.def.ai !== 'pet') { u.one = null; u.dance = 1 + (u.id % 3); u.t = 0; }
}
MS.end = (win, why) => { if (CD.M) end(CD.M, win, why); };

/* ================= hero ================= */
function mouseWorld(M) { const V = CD.View, s = M.view.S; return [M.cam.x + (I.mouse.x - V.w / 2) / s, (M.cam.y + (I.mouse.y - V.h / 2) / s) / YS]; }
function autoAim(M, h, ang, range, cone) {
  let best = null, bs = 1e9;
  C.each(M, 0, t => { if (t.isStruct && t.team === 3) return; if (t.dormant) return; if (t.isStruct && t.lock && t.lock(M)) return; const dx = t.x - h.x, dy = t.y - h.y, d = Math.hypot(dx, dy) - t.r; if (d > range) return; const da = Math.abs(U.angDiff(Math.atan2(dy, dx), ang)); if (da > cone && d > 14) return; const sc = d + da * 60 + (t.isStruct ? 40 : 0); if (sc < bs) { bs = sc; best = t; } });
  if (!best && cone < 3) return autoAim(M, h, ang, Math.min(range, 80), 3.2);     // nothing ahead: turn on whoever is closest
  return best;
}
function heroAttack(M, h, ax) {
  const w = h.w, gun = w.kind === 'gun';
  let ang;
  if (I.lastWasMouse && I.mouse.seen) { const m = mouseWorld(M); ang = Math.atan2(m[1] - h.y, m[0] - h.x); }
  else { const base = ax[2] > 0 ? Math.atan2(ax[1], ax[0]) : h.aim, t = autoAim(M, h, base, gun ? w.range : w.reach + 34, gun ? 0.9 : 1.3); ang = t ? Math.atan2(t.y - h.y, t.x - h.x) : base; }
  if (gun || w.thrust) { C.attack(M, h, ang, {mul: 1}); return; }
  const n = (M.t - h.chainT < 0.5 ? h.chain % 3 : 0) + 1; h.chain = n;
  C.attack(M, h, ang, {act: 'combo' + n, mul: n === 3 ? 1.7 : n === 2 ? 0.9 : 0.8, reach: w.reach * (n === 3 ? 1.2 : 1), aoe: n === 3, stun: n === 3 ? Math.max(0.35, w.stun || 0) : 0, rate: w.rate * 1.15, onEnd: u => { u.chainT = M.t; }});
}
function special(M, h) {
  const k = h.spec, sp = D.specials[k], w = h.w; let ang = h.aim;
  if (I.lastWasMouse && I.mouse.seen) { const m = mouseWorld(M); ang = Math.atan2(m[1] - h.y, m[0] - h.x); } else { const t = autoAim(M, h, h.aim, 260, 1.0); if (t) ang = Math.atan2(t.y - h.y, t.x - h.x); }
  h.one = null; h.spCd = sp[1]; C.num(M, h.x, h.y, 56, sp[0], true, U.MUST);
  if (k === 'fan') { E.face(h, ang); h.burst = {n: 6, t: 0, ang: ang}; }
  else if (k === 'deadeye') C.attack(M, h, ang, {mul: 3.2, pierce: 99, range: 420, rate: 0.9});
  else if (k === 'blast') C.attack(M, h, ang, {pellets: 12, spread: 0.085, mul: 1.4, rate: 1});
  else if (k === 'volley') C.attack(M, h, ang, {pellets: 7, spread: 0.13, mul: 1.1, rate: 1.2});
  else if (k === 'whirl') { CD.Sfx.play('swing'); E.startOne(h, 'dance2', {rate: 2.4, fire: false, onFrame: (u, o, i) => { if (i === 1 || i === 4 || i === 7) { o.done = null; C.strike(M, u, {mul: 1.25, reach: w.reach * 1.35, arc: 360, aoe: true, push: 120}, null); CD.Sfx.play('swing'); } }}); h.inv = Math.max(h.inv, 0.5); }
  else if (k === 'slam') C.attack(M, h, ang, {act: 'combo3', aoe: true, reach: 56, arc: 360, mul: 2.4, stun: 1.3, push: 200});
  else if (k === 'nova') { E.startOne(h, 'dance2', {rate: 2, fire: false}); for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; M.shots.push({x: h.x, y: h.y, h: 18, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, life: 0.9, dmg: w.dmg * 1.6 * h.dmg, team: 0, src: h, orb: w.orb, splash: 20, push: 90}); } CD.Sfx.play('magic'); }
  else if (k === 'mend') { E.startOne(h, 'shoot', {fire: false, rate: 0.8}); for (const u of M.units) if (u.team === 0 && !u.dead && Math.hypot(u.x - h.x, u.y - h.y) < 150) C.heal(M, u, u.maxHp * 0.4); M.fx.push({k: 'ring', x: h.x, y: h.y, t: 0, T: 0.5, r: 150, col: '#9fe07a'}); CD.Sfx.play('heal'); }
}
function nearThing(M, h) {
  let best = null, bd = 30;
  for (const s of M.structs) if (!s.gone && s.kind === 'chest' && s.v !== 1) { const d = Math.hypot(s.x - h.x, s.y - h.y); if (d < bd) { bd = d; best = {k: 'chest', s: s, txt: 'Open chest'}; } }
  for (const st of M.stakes) if (!st.built) { const d = Math.hypot(st.x - h.x, st.y - h.y); if (d < bd) { bd = d; best = {k: 'stake', st: st, txt: 'Build here'}; } }
  return best;
}
MS.build = function (i) {
  const M = CD.M, n = M && M.near; if (!n || n.k !== 'stake') return false; const b = D.builds[i]; if (!b) return false;
  if (M.scrip < b[2]) { C.num(M, M.hero.x, M.hero.y, 56, 'Need ' + b[2] + ' scrip', true, '#ff8a7a'); return false; }
  M.scrip -= b[2]; const st = n.st; st.built = W.addStruct(M, b[0], st.x, st.y, {team: 0, pal: 'outlaw', armed: true}); M.buildOpen = false; CD.Sfx.play('build');
  for (let k = 0; k < 4; k++) M.fx.push({k: 'puff', x: st.x + (k - 1.5) * 8, y: st.y + 1, h: 6, t: -k * 0.05, T: 0.35, r: 7});
  for (const u of M.units) W.resolve(M, u); return true;
};
MS.order = function (o) {
  const M = CD.M; if (!M || M.state !== 'play') return; const h = M.hero;
  if (o === 'focus') { const t = autoAim(M, h, h.aim, 300, 3.2); M.focus = t && t !== M.focus ? t : null; C.num(M, h.x, h.y, 56, M.focus ? 'Focus!' : 'Focus off', true, U.MUST); }
  else { M.order = o; M.focus = null; if (o === 'charge') { let m; if (I.lastWasMouse && I.mouse.seen) m = mouseWorld(M); else m = [h.x + Math.cos(h.aim) * 180, h.y + Math.sin(h.aim) * 180]; M.orderPt = [U.clamp(m[0], 20, M.W - 20), U.clamp(m[1], 20, M.H - 20)]; M.fx.push({k: 'ring', x: M.orderPt[0], y: M.orderPt[1], t: 0, T: 0.6, r: 26, col: U.MUST}); }
    if (o === 'hold') for (const u of M.posse) { u.ai.hx = null; }
    C.num(M, h.x, h.y, 56, {follow: 'Follow me!', hold: 'Hold here!', charge: 'Charge!'}[o], true, U.MUST); }
  CD.Sfx.play('click');
};
function heroControl(M, dt) {
  const h = M.hero; if (h.dead) return;
  h.rollCd -= dt; if (h.spCd > 0) h.spCd -= dt;
  if (M.over) return;
  const ax = I.axis();
  if (I.hit('swap') && h.weapons.length > 1) { h.wi = (h.wi + 1) % h.weapons.length; heroLook(h); CD.Sfx.play('click'); S.warm(h.look, ['idle', 'run'], 1, [h.dir]); }
  for (let i = 1; i <= 4; i++) if (I.hit('order' + i)) { if (M.buildOpen) MS.build(i - 1); else MS.order(['follow', 'hold', 'charge', 'focus'][i - 1]); }
  M.near = nearThing(M, h); if (!M.near || M.near.k !== 'stake') M.buildOpen = false;
  if (I.hit('use') && M.near) { if (M.near.k === 'chest') W.openChest(M, M.near.s); else M.buildOpen = !M.buildOpen; }
  if (h.stun > 0) return;
  if (h.burst) { const b = h.burst; b.t -= dt; if (b.t <= 0) { b.t = 0.075; b.n--; h.one = null; C.attack(M, h, b.ang + (Math.random() - 0.5) * 0.22, {rate: 4, mul: 1.1}); if (b.n <= 0) h.burst = null; } return; }
  if (I.hit('roll') && !h.roll && h.rollCd <= 0) {
    const a = ax[2] > 0 ? Math.atan2(ax[1], ax[0]) : h.aim; h.one = null; E.face(h, a); h.roll = {t: 0, T: 0.4, dx: Math.cos(a), dy: Math.sin(a), sp: h.mount ? 190 : 165}; h.inv = Math.max(h.inv, 0.36); h.rollCd = 0.75; CD.Sfx.play('roll'); M.fx.push({k: 'dust', x: h.x, y: h.y, t: 0, T: 0.3, r: 6});
  }
  if (h.roll) return;
  if (I.hit('special') && h.spCd <= 0) { special(M, h); return; }
  const atk = I.held('attack') || I.hit('attack');
  if (atk && !h.one) heroAttack(M, h, ax);
  if (ax[2] > 0) {
    if (!h.one) E.move(M, h, ax[0], ax[1], h.spd * (ax[2] > 0.75 ? 1 : 0.5), dt);
    else if (h.one.act === 'shoot' && h.w.kind === 'gun') { E.move(M, h, ax[0], ax[1], h.spd * 0.42, dt, true); h.moving = false; }   // shuffle while shooting
  }
}

/* ================= world ticking ================= */
function pickups(M, dt) {
  const h = M.hero;
  for (const p of M.pickups) {
    p.t += dt; if (p.z > 0 || p.vz > 0) { p.z += p.vz * dt; p.vz -= 220 * dt; if (p.z <= 0) { p.z = 0; p.vz = p.vz < -40 ? -p.vz * 0.4 : 0; } }
    if (h.dead || p.t < 0.3) continue; const dx = h.x - p.x, dy = h.y - p.y, d = Math.hypot(dx, dy);
    if (!p.fixed && d < 40 && d > 0.1) { const s = (150 - d * 2) * dt; p.x += dx / d * s; p.y += dy / d * s; }
    if (d < (p.fixed ? 14 : 9)) { p.got = true;
      if (p.k === 'coin') { M.scrip += p.v; CD.Sfx.play('coin'); } else if (p.k === 'bag') { M.loot += p.v; CD.Sfx.play('coin'); C.num(M, h.x, h.y, 50, '+' + p.v + ' gold', true, U.MUST); }
      else if (p.k === 'heart') { C.heal(M, h, p.v); CD.Sfx.play('heal'); } else if (p.k === 'box') { M.boxN++; CD.Sfx.play('coin'); C.num(M, h.x, h.y, 50, 'Strongbox ' + M.boxN + '/3', true, U.MUST); if (M.boxN === 1) { M.alarm = true; M.banner('The alarm is up!', 2); CD.Sfx.play('horn'); } reinforce(M, 2 + Math.ceil(M.tier / 2)); } }
  }
  M.pickups = M.pickups.filter(p => !p.got);
}
function waves(M, dt) {
  const w = M.waves; if (!w || M.over) return;
  const alive = M.enemyCount();
  if (w.live && w.i >= w.n && alive > 0 && alive <= 3 && w.t2 <= 0) {          // the last stragglers break and run instead of hiding behind a rock forever
    for (const u of M.units) if (u.team === 1 && !u.dead) { u.dead = true; u.deadT = 0.5; u.fall = 1; } M.banner('The stragglers run for the hills!', 2); return end(M, true); }
  if (w.live && alive <= 0) { w.live = false; w.t = 6; if (w.i >= w.n) return end(M, true); M.banner('Wave ' + w.i + ' beaten', 1.6); M.scrip += 6; }
  if (!w.live || (w.t2 -= dt) <= 0) { w.t -= dt; if (w.t <= 0 && w.i < w.n) {
    w.i++; w.live = true; w.t2 = 45; w.t = 0; const last = w.i === w.n, n = 3 + M.tier + w.i, ed = U.shuffle(M.edges.slice(), M.rng);
    for (let k = 0; k < (w.i > 2 ? 3 : 2); k++) reinforce(M, Math.ceil(n / (w.i > 2 ? 3 : 2)), ed[k]);
    if (last) { const e2 = E.spawn(M, W.roster(M, M.tier >= 2 ? 'elite' : 'heavy'), 1, ed[0][0], ed[0][1]); e2.ai.march = true; e2.ai.alert = true; e2.elite = true; }
    M.banner(last ? 'Final wave!' : 'Wave ' + w.i + ' of ' + w.n, 2); CD.Sfx.play('horn'); } }
}
MS.objective = function (M) {
  const T = M.spec.type, h = M.hero;
  if (T === 'raid') { const n = M.tents.filter(t => !t.gone && t.inCamp).length; if (n) return {txt: 'Burn the camp tents: ' + n + ' left', at: M.tents.find(t => !t.gone && t.inCamp)}; return {txt: 'Topple the standard', at: M.totem}; }
  if (T === 'rescue') return M.stage === 0 ? {txt: 'Break the cage and free ' + M.prisoner.name, at: M.cage} : {txt: 'Bring ' + M.prisoner.name + ' back down the trail', at: {x: M.start[0], y: M.start[1]}, zone: 60};
  if (T === 'heist') return M.boxN < 3 ? {txt: 'Grab the strongboxes: ' + M.boxN + ' of 3', at: M.boxes.find(b => !b.got)} : {txt: 'Back to the wagon!', at: M.wagon, zone: 50};
  if (T === 'defend') return {txt: M.waves.i === 0 ? 'Riders coming. Build at the stakes!' : 'Hold the town: wave ' + M.waves.i + ' of ' + M.waves.n, at: null};
  const b = (M.bosses || []).find(x => !x.dead); return {txt: 'Bring down ' + (b ? b.name : 'the boss'), at: b};
};
function objective(M, dt) {
  if (M.over) { M.over.t += dt; if (M.over.t > (M.over.win ? 3 : 2.4) && !M.over.sent) { M.over.sent = true; finish(M); } return; }
  const T = M.spec.type, h = M.hero;
  if (T === 'raid' && M.totem.gone) end(M, true);
  else if (T === 'rescue' && M.stage === 1 && !M.prisoner.dead && Math.hypot(M.prisoner.x - M.start[0], M.prisoner.y - M.start[1]) < 60 && Math.hypot(h.x - M.start[0], h.y - M.start[1]) < 110) end(M, true);
  else if (T === 'heist' && M.boxN >= 3 && Math.hypot(h.x - M.wagon.x, h.y - M.wagon.y) < 56) end(M, true);
  else if (T === 'boss' && M.bosses.every(b => b.dead)) end(M, true);
  if (h.dead) { h.downT = (h.downT || 0) + dt;
    if (M.revives > 0) { if (h.downT > 2.2) { M.revives--; h.dead = false; h.deadT = 0; h.downT = 0; h.hp = Math.round(h.maxHp * 0.5); h.inv = 2.5; M.banner('Patched up! ' + M.revives + ' left', 1.6); CD.Sfx.play('heal'); M.fx.push({k: 'ring', x: h.x, y: h.y, t: 0, T: 0.5, r: 40, col: '#9fe07a'}); } }
    else if (h.downT > 1.2) end(M, false, 'You went down.'); }
}
function finish(M) {
  const win = M.over.win, sp = M.spec, gold = win ? (sp.reward || 0) + M.loot + Math.min(25, Math.floor(M.scrip / 3)) : Math.floor(M.loot / 2);
  const res = {win: win, why: M.over.why, gold: gold, loot: M.loot, scrip: M.scrip, kills: M.kills, time: M.t, lost: M.lost, freed: win && M.prisoner && !M.prisoner.dead && !M.prisoner.caged ? sp.prisoner : null};
  CD.M = null; I.reset(); M.onEnd(res);
}
function camera(M, dt) {
  const h = M.hero, tx = h.x + Math.cos(h.aim) * 22, ty = (h.y + Math.sin(h.aim) * 16) * YS - 14, k = 1 - Math.pow(0.004, dt);
  M.cam.x += (tx - M.cam.x) * k; M.cam.y += (ty - M.cam.y) * k; clampCam(M); if (M.shake > 0) M.shake = Math.max(0, M.shake - dt * 22);
}

MS.update = function (dt) {
  const M = CD.M; if (!M) return;
  if (M.state === 'load') { const left = S.step(14); M.loadLeft = left; if (!left || performance.now() - M.loadT0 > 9000) { S.queue.length = 0; M.state = 'play'; CD.HUD.show(M); M.banner(M.spec.name, 2.6); I.flush(); } return; }
  if (I.hit('pause')) { M.paused = !M.paused; CD.HUD.pause(M.paused); }
  if (M.paused) { I.flush(); return; }
  M.t += dt; if (M.bannerT > 0) M.bannerT -= dt;
  for (const u of M.units) u.moving = false;
  heroControl(M, dt); AI.update(M, dt); AI.separate(M, dt);
  for (const u of M.units) E.update(M, u, dt);
  for (const u of M.units) if (u.dead && u.deadT > 0.9 && !u.hero && !u.stained) { u.stained = true; W.stain(M, u.x, u.y, u.r * 1.3); }
  M.units = M.units.filter(u => !(u.stained && u.deadT > 0.95));
  W.updateStructs(M, dt); C.update(M, dt); pickups(M, dt); waves(M, dt); objective(M, dt);
  if (CD.M !== M) return;
  camera(M, dt); CD.HUD.update(M); I.flush();
};

/* ================= drawing ================= */
function drawStruct(c, M, s) {
  const x = s.x + (s.hot > 0 ? Math.sin(s.hot * 90) * 1.2 : 0), y = s.y * YS;
  if (s.kind === 'cage') return;                              // drawn in two halves around the prisoner
  A.draw(c, s.art, x, y, s.v, s.pal);
  if (s.kind === 'campfire') F.flame(c, x, y - 1, M.t + s.id);
  if (s.lock && s.lock(M)) { U.text(c, 'LOCKED', x, y - s.top - 4, 5, U.PAPER3, {stroke: 1.4}); }
  if (s.hp != null && s.hp < s.maxHp && s.team !== 3) { const w = Math.min(30, 12 + s.maxHp / 14), f = Math.max(0, s.hp / s.maxHp), yy = y - s.top - 4; c.fillStyle = U.INKC; c.fillRect(x - w / 2 - 0.6, yy - 0.6, w + 1.2, 3.2); c.fillStyle = s.team === 0 ? '#7fae5a' : U.RED; c.fillRect(x - w / 2, yy, w * f, 2); }
  if (s.spawn && s.team === 1) { const sp = s.spawn; if (sp.kids.length < sp.cap && sp.t < 1.2 && sp.t > 0) { c.globalAlpha = 0.8; U.text(c, '!', x, y - s.top - 8, 9, '#ff8a7a', {stroke: 2}); c.globalAlpha = 1; } }
}
MS.draw = function () {
  const M = CD.M; if (!M) return; const V = CD.View, c = V.ctx;
  if (M.state === 'load') { c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); c.fillStyle = U.INKC; c.fillRect(0, 0, V.w, V.h); const p = 1 - (M.loadLeft || 0) / Math.max(1, M.loadN);
    U.text(c, M.spec.name, V.w / 2, V.h / 2 - 34, 26, U.PAPER, {stroke: 0, font: 'Rockwell,Georgia,serif'}); U.text(c, 'Inking the posse...', V.w / 2, V.h / 2 - 6, 14, U.MUST, {stroke: 0, w: 400});
    c.fillStyle = '#3a3230'; c.fillRect(V.w / 2 - 120, V.h / 2 + 10, 240, 10); c.fillStyle = U.MUST; c.fillRect(V.w / 2 - 120, V.h / 2 + 10, 240 * p, 10); return; }
  S.beginFrame();
  const v = M.view, s = v.S, k = s * V.dpr, shx = M.shake > 0 && CD.Save.settings.shake ? (Math.random() - 0.5) * M.shake * 0.5 : 0, shy = M.shake > 0 && CD.Save.settings.shake ? (Math.random() - 0.5) * M.shake * 0.5 : 0;
  const L = M.cam.x - v.w / 2 + shx, T = M.cam.y - v.h / 2 + shy, R = L + v.w, Bt = T + v.h;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = M.B.patch; c.fillRect(0, 0, V.cv.width, V.cv.height);
  c.setTransform(k, 0, 0, k, -L * k, -T * k); c.imageSmoothingEnabled = true;
  const bs = M.bgS, sx = Math.max(0, L), sy = Math.max(0, T), sw = Math.min(M.W, R) - sx, sh = Math.min(M.H * YS, Bt) - sy;
  if (sw > 0 && sh > 0) c.drawImage(M.bg, sx * bs, sy * bs, sw * bs, sh * bs, sx, sy, sw, sh);
  /* ground marks */
  const ob = MS.objective(M);
  if (ob.zone && ob.at) { c.setLineDash([5, 4]); U.ell(c, ob.at.x, ob.at.y * YS, ob.zone, ob.zone * YS, null, 1.4, U.MUST); c.setLineDash([]); }
  for (const st of M.stakes) if (!st.built) { const near = M.near && M.near.st === st; if (near) { c.globalAlpha = 0.5 + 0.3 * Math.sin(M.t * 6); U.ell(c, st.x, st.y * YS, 16, 16 * YS, null, 1.2, U.MUST); c.globalAlpha = 1; } }
  if (M.order === 'charge' && M.orderPt) { c.globalAlpha = 0.7; U.ell(c, M.orderPt[0], M.orderPt[1] * YS, 10, 10 * YS, null, 1, U.MUST); U.seg(c, M.orderPt[0], M.orderPt[1] * YS, M.orderPt[0], M.orderPt[1] * YS - 12, 1); U.poly(c, [[M.orderPt[0], M.orderPt[1] * YS - 12], [M.orderPt[0] + 7, M.orderPt[1] * YS - 10], [M.orderPt[0], M.orderPt[1] * YS - 7]], U.MUST, 0.5); c.globalAlpha = 1; }
  if (M.focus && !M.focus.dead && !M.focus.gone) { const f = M.focus, r = f.r * 2 + 3 + Math.sin(M.t * 8); U.ell(c, f.x, f.y * YS, r, r * 0.4, null, 1.4, U.MUST); }
  for (const z of M.zones) F.zone(c, z);
  for (const e of M.fx) if (e.k === 'tele' || (e.k === 'ring')) F.draw(c, e);
  /* everything that stands up, back to front */
  const list = [], pad = 70, vis = (x, y) => x > L - pad && x < R + pad && y * YS > T - 20 && y * YS < Bt + 130;
  for (const p of M.props) if (vis(p.x, p.y)) list.push({y: p.y, p: p});
  for (const st of M.stakes) if (!st.built && vis(st.x, st.y)) list.push({y: st.y, st: st});
  for (const s2 of M.structs) if (!s2.gone && vis(s2.x, s2.y)) { if (s2.kind === 'cage') { list.push({y: s2.y - 9, cage: s2, v: 0}); list.push({y: s2.y + 9, cage: s2, v: 1}); } else list.push({y: s2.y + (s2.kind === 'campfire' ? -2 : 0), s: s2}); }
  for (const u of M.units) if (vis(u.x, u.y)) list.push({y: u.y, u: u});
  for (const p of M.pickups) if (vis(p.x, p.y)) list.push({y: p.y, pk: p});
  for (const b of M.shots) list.push({y: b.y + (b.vy < 0 ? -0.6 : 0.6), b: b});
  for (const e of M.fx) if (e.k !== 'tele' && e.k !== 'ring') list.push({y: e.y + 0.1, e: e});
  list.sort((a, b) => a.y - b.y);
  for (const o of list) {
    if (o.p) A.draw(c, o.p.kind, o.p.x, o.p.y * YS, o.p.v, o.p.pal);
    else if (o.u) E.draw(c, M, o.u);
    else if (o.s) drawStruct(c, M, o.s);
    else if (o.cage) { A.draw(c, 'cage', o.cage.x + (o.cage.hot > 0 ? Math.sin(o.cage.hot * 90) : 0), o.cage.y * YS, o.v); if (o.v && o.cage.hp < o.cage.maxHp) { const f = o.cage.hp / o.cage.maxHp; c.fillStyle = U.INKC; c.fillRect(o.cage.x - 12.6, o.cage.y * YS - 44.6, 25.2, 3.2); c.fillStyle = U.RED; c.fillRect(o.cage.x - 12, o.cage.y * YS - 44, 24 * f, 2); } }
    else if (o.st) A.draw(c, 'stake', o.st.x, o.st.y * YS, 0);
    else if (o.b) F.shot(c, o.b);
    else if (o.pk) { const p = o.pk, bob = p.z > 0 ? 0 : Math.sin(M.t * 5 + p.x) * 0.8; U.ell(c, p.x, p.y * YS, 3.5, 1.1, 'rgba(22,18,20,.25)');
      if (p.k === 'box') { A.draw(c, 'chest', p.x, p.y * YS - bob, 0); c.globalAlpha = 0.6 + 0.4 * Math.sin(M.t * 6); U.ell(c, p.x, p.y * YS, 13, 13 * YS, null, 1, U.MUST); c.globalAlpha = 1; } else A.draw(c, p.k, p.x, p.y * YS - p.z - bob, 0); }
    else if (o.e) F.draw(c, o.e);
  }
  for (const n of M.nums) F.num(c, n);
  /* objective pointer */
  if (ob.at && !M.over) { const ox = ob.at.x, oy = ob.at.y * YS - (ob.at.top || 30), m = 14;
    if (ox > L + m && ox < R - m && oy > T + m + 16 && oy < Bt - m) { const b = Math.sin(M.t * 5) * 2; U.poly(c, [[ox - 4, oy - 14 + b], [ox + 4, oy - 14 + b], [ox, oy - 7 + b]], U.MUST, 0.9); }
    else { const cx = U.clamp(ox, L + m, R - m), cy = U.clamp(oy, T + m + 18, Bt - m), a = Math.atan2(oy - cy, ox - cx); c.save(); c.translate(cx, cy); c.rotate(a); U.poly(c, [[7, 0], [-4, -5], [-1.5, 0], [-4, 5]], U.MUST, 1); c.restore(); } }
  if (I.mouse.seen && I.lastWasMouse && !U.COARSE && !M.over) { const m = mouseWorld(M), x = m[0], y = m[1] * YS; U.seg(c, x - 4, y, x - 1.5, y, 1, U.INKC); U.seg(c, x + 1.5, y, x + 4, y, 1, U.INKC); U.seg(c, x, y - 4, x, y - 1.5, 1, U.INKC); U.seg(c, x, y + 1.5, x, y + 4, 1, U.INKC); }
};
/* test and debug hooks */
MS.debug = {
  god: v => { if (CD.M) CD.M.god = v !== false; },
  win: () => MS.end(true), lose: () => MS.end(false, 'debug'),
  killAll: () => { const M = CD.M; if (M) for (const u of M.units.slice()) if (u.team === 1 && !u.dead) C.kill(M, u, M.hero, 0); },
  tp: (x, y) => { const M = CD.M; M.hero.x = x; M.hero.y = y; }
};
})();
