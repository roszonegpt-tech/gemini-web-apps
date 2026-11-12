/* Crown of Dust - "Story and How to Play" guide (trailer/guide.js). Engine: trailer/director.js.
   Narrated: each beat names a line from guide_script.json; its length comes from build/guide/vo/durations.json, made by
   build/make_vo.py. The real HUD and menus are on screen; a DOM layer (#film) adds captions, keycaps, pointer rings and
   chapter tags. #yt = YouTube (filmed at 1280x720 CSS px x1.5), #tt = TikTok (540x960 x2, touch layout). */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, E = CD.Ent, C = CD.Combat, W = CD.World, MS = CD.Mission, I = CD.Input, YS = U.YS, K = CD.Camp;
const F = window.FILM, TR = F.TR, shot = F.shot, stage = F.stage, clearAt = F.clearAt, foe = F.foe, pal = F.pal, ring = F.ring, face = F.face, duel = F.duel, hold = F.hold, stick = F.stick, AX = F.AX, AY = F.AY, DT = F.DT;
const TT = TR.fmt === 'tt', $ = id => document.getElementById(id);
TR.film = 'guide'; TR.letterbox = false;
if (TT) document.body.classList.add('touchsim');

/* ---------------- the campaign the menus show ---------------- */
function campaign() {
  try { localStorage.setItem('chunklab_outlaws_look_v1', JSON.stringify(Object.assign({}, D.looks.wrapped, {weapon: 'katana'}))); } catch (e) { /* the Stranger card is optional */ }
  K.fresh('harrow'); const G = CD.G; G.tut = 1; G.gold = 260; G.day = 6; ['ford', 'toll'].forEach(id => { G.own[id] = 'outlaw'; });
  G.roster = ['kit', 'pike', 'wade']; G.posse = ['kit', 'wade']; G.armory.saber = 1; G.armory.rifle = 1; G.bld.saloon = 1; G.bld.stable = 1; G.mount = null;
  G.log = ['Day 5. Tollgate Bridge taken from The Gilded Crown. +80 gold.', 'Colonel Wade joins the gang.', 'Day 4. Croak Hollow taken from Greenskin Corsairs. +63 gold.'];
  CD.Map.invalidate();
}
campaign();

/* ---------------- overlay: captions, keycaps, pointer ring, chapter tag ---------------- */
const film = document.createElement('div'); film.id = 'film';
film.innerHTML = '<div id="fChap"></div><div id="fKeys"></div><div id="fRing"><b></b></div><div id="fCap"><span></span></div>'; document.body.appendChild(film);
const VO = [], CAPS = [], CHAPS = [];
let DUR = {};
function chunks(text, max) {                                  // caption chunks: split at sentence and clause ends, then by length
  const parts = text.match(/[^.!?:]+[.!?:]?\s*/g).map(s => s.trim()).filter(Boolean), out = [];
  for (const p of parts) { if (p.length <= max) { out.push(p); continue; }
    const words = p.split(' '); let line = ''; for (const w of words) { if ((line + ' ' + w).trim().length > max && line) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); }
  const merged = []; for (const c of out) { const last = merged[merged.length - 1]; if (last && (last + ' ' + c).length <= max && last.length < max * 0.45) merged[merged.length - 1] = last + ' ' + c; else merged.push(c); }
  return merged;
}
function keycaps(list) { const el = $('fKeys'); const k = (list || []).join('|'); if (el.dataset.k === k) return; el.dataset.k = k; el.innerHTML = (list || []).map(x => x === '/' ? '<i>or</i>' : '<kbd>' + x + '</kbd>').join(''); el.style.display = list && list.length ? '' : 'none'; }
function pointAt(sel, label, t) {
  const r = $('fRing'), el = sel ? document.querySelector(sel) : null;
  if (!el || !el.getBoundingClientRect().width) { r.style.display = 'none'; return; }
  const b = el.getBoundingClientRect(), pad = 6 + 3 * Math.sin(t * 7);
  r.style.display = ''; r.style.left = (b.left - pad) + 'px'; r.style.top = (b.top - pad) + 'px'; r.style.width = (b.width + pad * 2) + 'px'; r.style.height = (b.height + pad * 2) + 'px';
  const lab = r.querySelector('b'); lab.textContent = label || ''; lab.style.display = label ? '' : 'none';
  lab.className = b.top > CD.View.h * 0.55 ? 'up' : '';
}
TR.onDraw = function (s, lt) {
  const t = TR.frame / TR.fps, cap = CAPS.find(c => t >= c.t0 && t < c.t1), el = $('fCap');
  el.style.display = cap ? '' : 'none'; if (cap && el.firstChild.textContent !== cap.text) el.firstChild.textContent = cap.text;
  const ch = CHAPS.filter(c => t >= c.t && t < c.t + 3.2).pop(), ce = $('fChap'); ce.style.display = ch && !s.noChap ? '' : 'none'; if (ch) ce.textContent = ch.title;
  keycaps(s.keys ? s.keys(lt) : null);
  const p = s.point ? s.point(lt) : null; pointAt(p && p[0], p && p[1], lt);
  document.body.classList.toggle('touchsim', TT || !!(s.touch && s.touch(lt)));
  document.body.classList.toggle('noobj', !!(CD.M && CD.M._arena && CD.M === (TR.cur && TR.cur.M)));
};
TR.onLeave = function (cur) { I.mouse.seen = false; I.lastWasMouse = false; if (!cur) return; CD.HUD.hide(); CD.UI.hide(); document.querySelectorAll('.modal').forEach(m => m.remove()); };

/* ---------------- builders ---------------- */
const hud = o => Object.assign({noHud: false}, o);
function scene(o) { const M = stage(o); if (o.noHud === false) { M.order = 'follow'; } return M; }
function campScene(fac, seed, boss, extra) {
  const M = stage({type: 'boss', faction: fac, tier: 4, seed: seed}); const b = M.boss; M.units = M.units.filter(u => u.hero || Math.hypot(u.x - b.x, u.y - b.y) < 190); M.hero.x = 40; M.hero.y = 60;
  for (const x of M.bosses) x.ai.asleep = true; if (extra) extra(M); return M;
}
function bossScene(o) {
  const M = stage(Object.assign({type: 'boss', tier: 4}, o)), b = M.boss; M.units = M.units.filter(u => u.hero || u.boss || u.elite || Math.hypot(u.x - b.x, u.y - b.y) < 140);
  for (const x of M.bosses) { x.ai.asleep = false; x.ai.alert = true; x.ai.hate = M.hero; }
  const h = M.hero; h.x = b.x - 70; h.y = b.y + 20; face(h, 0); (o.gang || []).forEach((id, i) => pal(M, id, h.x - 10 - (i % 2) * 16, h.y - 26 + i * 16)); return M;
}
function arena(o) { const M = duel(Object.assign({tier: 2, noHud: false}, o)); M.noPointer = true; M._arena = true; (o.gang || []).forEach((id, i) => pal(M, id, AX - 22 - (i % 2) * 14, AY - 20 + i * 14)); return M; }
const cam = (fw, up, dx, dy) => M => ({x: M.hero.x + (dx || 0), y: M.hero.y + (dy || 0), fw: fw * (TT ? 0.8 : 1), up: up});
function toScreen(M, x, y) { const V = CD.View, s = M.view.S; return [(x - M.cam.x) * s + V.w / 2, (y * YS - M.cam.y) * s + V.h / 2]; }
function aimAt(M, t) { I.mouse.seen = true; I.lastWasMouse = true; const p = toScreen(M, t.x, t.y - 14); I.mouse.x = p[0]; I.mouse.y = p[1]; }
const nearestFoe = M => { let b = null, bd = 1e9; for (const u of M.units) if (u.team === 1 && !u.dead && !u.dormant) { const d = Math.hypot(u.x - M.hero.x, u.y - M.hero.y); if (d < bd) { bd = d; b = u; } } return b; };
function ui(fn) { return {enter: () => { CD.UI.hide(); fn(); }}; }
function mapChrome(sel, after) { CD.UI.mapChrome(); CD.scenes.map.resize(); CD.Map.invalidate(); if (sel) CD.Map.select(sel); if (after) after(); }
const paintMap = () => { CD.Map.t = TR.frame / 30; CD.scenes.map.draw(); };
function clickCard(i) { const cs = document.querySelectorAll('#ui .card'); if (cs[i]) cs[i].click(); }

/* ---------------- beats ----------------
   vo: line id. span: how many shots (this one and the next) the line runs over; the last of them stretches to fit the line. */
const beat = o => shot(Object.assign({d: 2}, o));
const B = [];
const b = o => { B.push(beat(o)); return o; };

/* ===== shared scenes ===== */
const S = {
  storyMap: () => ({enter: () => { TR.mapReady = false; }, map: true}),
  totems: () => ({card: {title: 'Three powers carved it up', totems: true}}),
  snig: () => ({set: () => campScene('corsair', 61, 'snig', M => { const c = M.boss; foe(M, 'gila', c.x + 40, c.y + 30).ai.alert = false; M.units.forEach(u => { if (u.team === 1) { u.ai.alert = false; u.ai.hate = null; } }); }),
    plate: {name: 'Captain Snig', sub: 'Greenskin Corsairs', at: 0.3, top: true}, cam: M => ({x: M.boss.x, y: M.boss.y, fw: 300, up: 36})}),
  vex: () => ({set: () => campScene('hollow', 62, 'vex', M => { const c = M.boss; ['wisp', 'wisp', 'reaper'].forEach((id, i) => { const u = foe(M, id, c.x - 60 + i * 50, c.y + 40); u.ai.alert = false; u.ai.hate = null; }); M.units.forEach(u => { if (u.team === 1) { u.ai.alert = false; u.ai.hate = null; } }); }),
    plate: {name: 'Queen Vex', sub: 'The Hollow Court', at: 0.3, top: true}, cam: M => ({x: M.boss.x, y: M.boss.y + 10, fw: 320, up: 36})}),
  odo: () => ({set: () => campScene('crown', 63, 'odo', M => { const ty = M.bosses[1]; ty.x = M.boss.x - 70; ty.y = M.boss.y + 30; }),
    plate: {name: 'King Odo the Gilded', sub: 'and the Tyrant', at: 0.3, top: true}, cam: M => ({x: M.boss.x - 40, y: M.boss.y + 10, fw: 340, up: 40})}),
  town: () => ({skip: 0.5, set: () => { const M = stage({type: 'defend', faction: 'crown', biome: 'desert', seed: 21, hero: 'harrow'}); M.units = M.units.filter(u => u.hero || u.def.ai === 'pet');
      const h = M.hero; h.x = M.hall.x - 120; h.y = M.hall.y + 150; face(h, 0); ['wren', 'goro', 'kit'].forEach((id, i) => pal(M, id, h.x - 30 - i * 14, h.y - 12 + i * 10)); return M; },
    act: () => stick(0.5, 0), cam: M => ({x: M.hall.x - 20, y: M.hall.y + 90, fw: 380, up: 40})}),
  combo: () => ({set: () => { const M = arena({hero: 'goro', faction: 'corsair', seed: 32}); ring(M, ['grub', 'gobslinger', 'grub', 'grub'], AX + 24, AY, 18, 2); return M; }, act: () => hold(1), cam: cam(200, 30, 12)}),
  roll: () => ({set: () => { const M = arena({hero: 'wren', faction: 'crown', seed: 44}); const l = foe(M, 'lancer', AX + 150, AY); l.ai.ct = 0; M._l = l; return M; },
    act: (M, t) => { const l = M._l; if (l.ai.st === 'dash' && Math.hypot(l.x - M.hero.x, l.y - M.hero.y) < 60 && !M._r) { M._r = 1; stick(0, 1); I.press('roll'); } else if (t > 1.6 && M._r) hold(1); }, cam: cam(300, 30, 60)}),
  special: (hero, fac, foes, r, seed) => ({set: () => { const M = arena({hero: hero, faction: fac, seed: seed}); ring(M, foes, AX + (r > 40 ? 0 : 0), AY, r); return M; }, act: (M, t) => { if (t > 0.35 && t < 0.4) MS.special(); }, cam: cam(240, 30)}),
  raidCamp: () => ({set: () => { const M = stage({type: 'raid', faction: 'corsair', tier: 3, seed: 71, hero: 'jory', noHud: false}); const c = M.campAt; M.hero.x = c[0] - 90; M.hero.y = c[1] + 30; return M; },
    cam: M => ({x: M.campAt[0], y: M.campAt[1], fw: 420, up: 30})}),
  tent: () => ({set: () => { const M = stage({type: 'raid', faction: 'corsair', tier: 2, seed: 72, hero: 'abel', noHud: false}); const tents = M.tents.filter(t => t.inCamp).sort((a, b2) => a.y - b2.y); tents.slice(1).forEach(t => { t.hp = 6; });
      const t0 = tents[0]; M._t = t0; M.units = M.units.filter(u => u.hero || Math.hypot(u.x - t0.x, u.y - t0.y) > 120); M.hero.x = t0.x - 10; M.hero.y = t0.y + t0.hh + 12; face(M.hero, -Math.PI / 2); return M; },
    act: () => hold(1), cam: M => ({x: M._t.x + 40, y: M._t.y, fw: 280, up: 40})}),
  standard: () => ({set: () => { const M = stage({type: 'raid', faction: 'hollow', tier: 3, seed: 56, hero: 'wren', noHud: false}); M.tents.forEach(t => { if (t.inCamp) { t.gone = true; if (t.col) t.col.gone = true; } }); W.rebuild(M); const T = M.totem; T.hp = 30;
      M.units = M.units.filter(u => u.hero || Math.hypot(u.x - T.x, u.y - T.y) > 110); M.hero.x = T.x - 90; M.hero.y = T.y + 16; face(M.hero, Math.atan2(T.y - M.hero.y, T.x - M.hero.x)); return M; },
    act: () => hold(1), cam: M => ({x: M.totem.x - 30, y: M.totem.y, fw: 260, up: 44})}),
  cage: () => ({set: () => { const M = stage({type: 'rescue', faction: 'corsair', tier: 2, seed: 54, hero: 'goro', prisoner: 'wade', noHud: false}); const c = M.cage; M.units = M.units.filter(u => u.hero || u.prisoner || Math.hypot(u.x - c.x, u.y - c.y) > 90);
      M.hero.x = c.x - 24; M.hero.y = c.y + 14; face(M.hero, -0.4); c.hp = 26; return M; },
    act: (M, t) => { if (M.prisoner && !M.prisoner.caged) stick(-1, 0.1); else hold(1); }, cam: M => ({x: M.hero.x + 20, y: M.hero.y - 10, fw: 240, up: 32})}),
  heist: () => ({set: () => { const M = stage({type: 'heist', faction: 'crown', seed: 53, hero: 'vesper', noHud: false}); const b = M.boxes[1]; M.units = M.units.filter(u => u.hero || Math.hypot(u.x - b.x, u.y - b.y) > 120); M.hero.x = b.x - 46; M.hero.y = b.y + 4; face(M.hero, 0); M._b = b; return M; },
    act: (M, t) => { if (M.boxN === 0) stick(0.7, 0); else stick(-1, 0); }, cam: M => ({x: M._b.x - 20, y: M._b.y, fw: 280, up: 30})}),
  defend: () => ({skip: 0.6, set: () => { const M = stage({type: 'defend', faction: 'crown', biome: 'desert', seed: 55, hero: 'holloway', noHud: false}); const hx = M.hall.x, hy = M.hall.y; M.hero.x = hx - 40; M.hero.y = hy + 70; M.waves = {i: 2, n: 4, t: 99, live: true, t2: 99};
      for (let i = 0; i < 3; i++) { const u = foe(M, 'lancer', hx + 210, hy + 30 + i * 30); u.ai.march = true; } for (let i = 0; i < 5; i++) { const u = foe(M, 'footman', hx + 240 + (i % 2) * 20, hy - 20 + i * 22); u.ai.march = true; } return M; },
    act: () => hold(1), cam: M => ({x: M.hall.x + 70, y: M.hall.y + 50, fw: 400, up: 30})}),
  gunNest: () => ({set: () => { const M = stage({type: 'defend', faction: 'crown', biome: 'desert', seed: 51, hero: 'kit', scrip: 40, noHud: false}); const st = M.stakes.reduce((a, b2) => b2.x > a.x && b2.y > a.y - 20 ? b2 : a); M.units = M.units.filter(u => u.hero || u.militia);
      M.hero.x = st.x - 14; M.hero.y = st.y + 10; face(M.hero, 0); M._st = st; for (let i = 0; i < 6; i++) { const u = foe(M, i % 3 ? 'footman' : 'musketeer', st.x + 170 + (i % 2) * 22, st.y - 40 + i * 14); u.ai.march = true; } return M; },
    act: (M, t) => { if (t > 0.6 && t < 2.2) M.buildOpen = true; if (t > 2.2 && !M._built) { M._built = MS.build(1) || true; } }, keys: t => t > 0.4 && t < 3 ? ['E', '2'] : null,
    cam: M => ({x: M._st.x + 60, y: M._st.y, fw: 300, up: 30})}),
  kegs: () => ({set: () => { const M = arena({hero: 'vega', faction: 'corsair', biome: 'swamp', seed: 52}); const kx = AX + 90; M._kegs = [0, 1, 2].map(i => W.addStruct(M, 'keg', kx + i * 22, AY - 14 + i * 14, {}));
      for (let i = 0; i < 9; i++) foe(M, i % 3 ? 'grub' : 'snap', kx + 10 + (i % 3) * 18, AY - 40 + Math.floor(i / 3) * 36); return M; },
    act: (M, t) => { if (t > 0.6 && t < 0.65) C.attack(M, M.hero, 0); if (t > 0.8 && !M._k) { M._k = 1; W.destroy(M, M._kegs[0], M.hero); } }, cam: cam(320, 30, 90)}),
  snigUp: () => ({skip: 0.6, set: () => bossScene({faction: 'corsair', seed: 61, hero: 'harrow', gang: ['abel', 'goro'], noHud: false}),
    act: (M, t) => { hold(1); const b2 = M.boss; if (t > 1.6 && !b2.phased) { b2.hp = 1; b2.inv = 0; C.hurt(M, b2, 9, M.hero, 0, 0); } }, cam: M => ({x: (M.boss.x + M.hero.x) / 2, y: M.boss.y, fw: 300, up: 36})}),
  odoUp: () => ({skip: 0.4, set: () => { const M = bossScene({faction: 'crown', seed: 63, hero: 'wren', gang: ['tobias', 'holloway'], noHud: false}); const ty = M.bosses[1]; ty.x = M.hero.x + 120; ty.y = M.hero.y + 40; M.boss.x = M.hero.x + 60; M.boss.y = M.hero.y - 10; return M; },
    act: (M, t) => { hold(1); const b2 = M.boss; if (t > 1.0 && !b2.phased) { b2.hp = 1; b2.inv = 0; C.hurt(M, b2, 9, M.hero, 0, 0); } }, cam: M => ({x: M.boss.x - 20, y: M.boss.y, fw: 300, up: 40})}),
  vexNova: () => ({skip: 0.6, set: () => { const M = bossScene({faction: 'hollow', seed: 62, hero: 'maren', gang: ['hazel', 'nori'], noHud: false}); M.boss.ai.sumN = 99; M.boss.ai.sp = 1.4; return M; },
    act: () => hold(1), cam: M => ({x: (M.boss.x + M.hero.x) / 2 + 10, y: M.boss.y, fw: 300, up: 36})}),
  end: () => ({logo: true, skip: 0.3, set: () => { const M = stage({type: 'defend', faction: 'crown', biome: 'desert', seed: 21, hero: 'harrow'}); M.units = M.units.filter(u => u.hero || u.def.ai === 'pet');
      const h = M.hero, y = M.hall.y + 150; h.x = M.hall.x; h.y = y; h.dir = 'S';
      ['wren', 'goro', 'abel', 'maren', 'trueno', 'jory', 'hob', 'vega'].forEach((id, i) => { const u = pal(M, id, M.hall.x + (i % 2 ? 1 : -1) * (26 + Math.floor(i / 2) * 26), y + 10 - Math.floor(i / 2) * 9); u.scripted = true; u.dir = 'S'; }); return M; },
    post: (M, t) => { M.units.forEach((u, i) => { if (u.team === 0 && u.def.ai !== 'pet') { u.dance = 1 + (i + Math.floor(t * 2)) % 3; u.dir = 'S'; } }); }, cam: M => ({x: M.hall.x, y: M.hall.y + 150, fw: 330, up: 52})})
};
/* scenes that read the HUD need it on: the story scenes keep it off */
const withHud = o => { const set = o.set; return Object.assign({}, o, {set: set ? () => { const M = set(); if (M.spec.noHud) { M.spec.noHud = false; CD.HUD.show(M); } return M; } : set}); };

if (!TT) {
  /* 1 The Tally Basin */
  b(Object.assign({vo: 'y01', chapter: 'The Tally Basin', noChap: true}, S.storyMap()));
  b(Object.assign({vo: 'y02'}, S.totems()));
  b(Object.assign({vo: 'y03'}, S.snig()));
  b(Object.assign({vo: 'y04'}, S.vex()));
  b(Object.assign({vo: 'y05'}, S.odo()));
  /* 2 The outlaws */
  b(Object.assign({vo: 'y06', chapter: 'The outlaws'}, S.town()));
  b(Object.assign({vo: 'y07', act: (M, t) => {}}, ui(() => { CD.UI.newGame(); }), {tick: t => { const i = t < 2.4 ? 0 : t < 4.6 ? 1 : t < 6.6 ? 2 : 3; if (i !== b.lastCard) { b.lastCard = i; clickCard(i); } }}));
  /* 3 The goal */
  b(Object.assign({vo: 'y08', chapter: 'The goal'}, S.storyMap()));
  /* 4 Riding out */
  b({vo: 'y09', chapter: 'Riding out', enter: () => { CD.UI.hide(); mapChrome('gulch'); }, paint: paintMap, point: () => ['#mapStat', 'Day, gold and land']});
  b({vo: 'y10', enter: () => { CD.UI.hide(); mapChrome('ford'); }, paint: paintMap, tick: (t, cur) => { if (t > 3.1 && !cur.brief) { cur.brief = 1; CD.UI.brief(D.terrById.ford, K.specFor(D.terrById.ford)); } },
    point: t => t < 3.1 ? ['#mapInfo', 'Job, danger and bounty'] : ['.modal .b.alt', 'Ride out']});
  /* 5 Controls */
  b({vo: 'y11', chapter: 'Controls', set: () => arena({hero: 'harrow', faction: 'corsair', biome: 'desert', seed: 81}), act: (M, t) => { const a = t * 1.3; stick(Math.cos(a), Math.sin(a) * 0.8); }, cam: cam(260, 30),
    keys: t => t < 3.6 ? ['W', 'A', 'S', 'D', '/', '↑', '←', '↓', '→'] : null, touch: t => t >= 3.6, point: t => t >= 3.6 ? ['#stick', 'Move stick'] : null});
  b({vo: 'y12', set: () => { const M = arena({hero: 'harrow', faction: 'corsair', biome: 'desert', seed: 82}); for (let i = 0; i < 5; i++) foe(M, 'grub', AX + 90 + (i % 2) * 20, AY - 60 + i * 28); return M; },
    act: (M, t) => { const e = nearestFoe(M); if (e && t < 4) aimAt(M, e); else { I.lastWasMouse = false; I.mouse.seen = false; } hold(1); }, cam: cam(300, 30, 60), keys: t => t < 4 ? ['Click'] : ['J']});
  b(Object.assign({vo: 'y13', keys: () => ['Click', '/', 'J']}, S.combo()));
  b(Object.assign({vo: 'y14', keys: () => ['Space', '/', 'Right click']}, S.roll()));
  b(Object.assign({vo: 'y15', span: 4, keys: () => ['F'], point: () => ['#hHero .bar.sp', 'Special']}, S.special('harrow', 'corsair', ['grub', 'grub', 'gobslinger', 'grub', 'grub'], 60, 83)));
  b(Object.assign({keys: () => ['F']}, S.special('wren', 'crown', ['footman', 'footman', 'footman', 'footman'], 70, 84), {set: () => { const M = arena({hero: 'wren', faction: 'crown', seed: 84}); for (let i = 0; i < 5; i++) foe(M, 'footman', AX + 70 + i * 26, AY); return M; }, cam: cam(300, 26, 80)}));
  b(Object.assign({keys: () => ['F']}, S.special('jory', 'corsair', ['grub', 'gobslinger', 'grub', 'grub', 'gobgun'], 26, 85)));
  b(Object.assign({keys: () => ['F']}, S.special('maren', 'hollow', ['boneman', 'boneman', 'hound', 'boneman', 'wisp', 'boneman'], 46, 86)));
  b({vo: 'y16', set: () => { const M = arena({hero: 'harrow', faction: 'corsair', seed: 87}); M.hero.weapons = ['revolver', 'saber']; MS.heroLook(M.hero); ring(M, ['grub', 'grub', 'grub'], AX + 40, AY, 20); return M; },
    act: (M, t) => { if (t > 1.2 && !M._sw) { M._sw = 1; I.press('swap'); } hold(t > 1.4); }, keys: () => ['Q'], point: () => ['#hWeap', 'Current weapon'], cam: cam(220, 30, 20)});
  /* 6 Your posse */
  b({vo: 'y17', chapter: 'Your posse', set: () => arena({hero: 'harrow', faction: 'corsair', biome: 'desert', seed: 88, gang: ['wren', 'goro', 'abel', 'kit']}), act: (M, t) => stick(0.6, Math.sin(t) * 0.3), cam: cam(300, 30, 20), point: () => ['#hPosse', 'Your posse']});
  b({vo: 'y18', set: () => { const M = arena({hero: 'harrow', faction: 'corsair', seed: 89, gang: ['wren', 'goro', 'abel', 'kit']}); for (let i = 0; i < 5; i++) foe(M, i ? 'grub' : 'gobshaman', AX + 140 + (i % 2) * 20, AY - 40 + i * 20); return M; },
    act: (M, t) => { const o = [[0.8, 'hold'], [3.0, 'charge'], [5.4, 'focus'], [8.0, 'follow']]; for (const x of o) if (t > x[0] && M._o !== x[1] && t < x[0] + 0.1) { M._o = x[1]; if (x[1] === 'focus') face(M.hero, 0); MS.order(x[1]); } },
    keys: t => [t < 3 ? '1 Follow' : '', t < 3.0 ? '2 Hold' : t < 5.4 ? '3 Charge' : t < 8 ? '4 Focus' : '1 Follow'].filter(Boolean).slice(-1), point: () => ['#hOrders', 'Orders'], cam: cam(380, 30, 70)});
  /* 7 Scrip and building */
  b({vo: 'y19', chapter: 'Scrip and building', set: () => { const M = arena({hero: 'abel', faction: 'corsair', seed: 90}); ring(M, ['grub', 'grub', 'snap', 'grub', 'gobslinger'], AX + 20, AY, 24); return M; },
    act: (M, t) => { if (t > 0.3 && t < 0.35) MS.special(); }, point: () => ['#hScrip', 'Scrip'], cam: cam(220, 30)});
  b(Object.assign({vo: 'y20', span: 2, keys: () => ['E']}, S.gunNest(), {point: t => t > 0.6 && t < 2.6 ? ['#hBuild', 'Build menu'] : null}));
  b(Object.assign({}, S.kegs()));
  /* 8 The jobs */
  b(Object.assign({vo: 'y21', chapter: 'The jobs'}, S.raidCamp()));
  b(Object.assign({vo: 'y22', span: 2, point: () => ['#hObj', 'Objective']}, S.tent()));
  b(Object.assign({}, S.standard()));
  b(Object.assign({vo: 'y23'}, S.cage(), {point: () => ['#hObj', 'Objective']}));
  b(Object.assign({vo: 'y24'}, S.heist(), {point: () => ['#hObj', 'Objective']}));
  b(Object.assign({vo: 'y25'}, S.defend(), {point: () => ['#hObj', 'Waves']}));
  /* 9 Loot */
  b({vo: 'y26', chapter: 'Loot', span: 2, set: () => { const M = arena({hero: 'pip', faction: 'corsair', seed: 91}); M._c = W.addStruct(M, 'chest', AX + 44, AY - 4, {}); M.pickups.push({k: 'heart', x: AX + 20, y: AY + 30, v: 30, t: 1, vz: 0, z: 0}); return M; },
    act: (M, t) => { if (t < 1.2) stick(0.6, 0); if (t > 1.3 && t < 1.35) I.press('use'); if (t > 2 && t < 3) stick(-0.4, 0.8); }, keys: t => t > 1 && t < 2.4 ? ['E'] : null, cam: cam(220, 30, 30)});
  b({set: () => { const M = arena({hero: 'goro', faction: 'corsair', seed: 92}); const m = E.spawn(M, 'chomp', 1, AX + 52, AY); m.dormant = true; m.dir = 'W'; return M; },
    act: (M, t) => { stick(t < 0.6 ? 0.6 : 0, 0); hold(t > 0.7); }, cam: cam(200, 26, 30)});
  /* 10 Camp */
  b(Object.assign({vo: 'y27', chapter: 'Camp'}, ui(() => CD.UI.camp('posse'))));
  b(Object.assign({vo: 'y28'}, ui(() => CD.UI.camp('posse')), {point: t => t < 2.6 ? ['#ui .panel:nth-of-type(2) .card .b.alt', 'Hire'] : ['#ui .screen > .note', 'Posse seats']}));
  b(Object.assign({vo: 'y29'}, ui(() => CD.UI.camp('hero')), {point: () => ['#ui .panel:nth-of-type(2) .card .b', 'Buy or equip']}));
  b(Object.assign({vo: 'y30'}, ui(() => CD.UI.camp('town')), {point: t => ['#ui .grid .card:nth-child(' + (1 + Math.min(5, Math.floor(t / 1.4))) + ')', null]}));
  /* 11 Nightfall */
  b({vo: 'y31', chapter: 'Nightfall', enter: () => { CD.UI.hide(); CD.UI.mapChrome({note: {title: 'Day 6', txt: 'The land paid 46 gold overnight. The trails are quiet.'}}); CD.scenes.map.resize(); }, paint: paintMap});
  b({vo: 'y32', enter: () => { CD.UI.hide(); mapChrome('ford', () => CD.UI.raid({t: D.terrById.ford, faction: 'corsair', odds: 0.55}, 46)); }, paint: paintMap,
    point: t => t < 3.4 ? ['.modal .b.alt', 'Defend it yourself'] : ['.modal .b:not(.alt)', 'Or trust the garrison']});
  /* 12 The bosses */
  b(Object.assign({vo: 'y33', chapter: 'The bosses'}, withHud(S.vexNova())));
  b(Object.assign({vo: 'y34', span: 3}, withHud(S.snigUp())));
  b(Object.assign({}, withHud(S.odoUp())));
  b(Object.assign({keys: () => ['Space']}, S.kegs()));
  /* 13 Saddle up */
  b(Object.assign({vo: 'y35', chapter: 'Saddle up', noChap: true, min: 5}, S.end()));
} else {
  b(Object.assign({vo: 't01', span: 4}, S.totems()));
  b(Object.assign({}, S.snig())); b(Object.assign({}, S.vex())); b(Object.assign({}, S.odo()));
  b(Object.assign({vo: 't02'}, S.town()));
  b({vo: 't03', enter: () => { CD.UI.hide(); mapChrome('ford'); }, paint: paintMap, tick: (t, cur) => { if (t > 1.6 && !cur.brief) { cur.brief = 1; CD.UI.brief(D.terrById.ford, K.specFor(D.terrById.ford)); } }});
  b(Object.assign({vo: 't04', span: 4}, S.tent())); b(Object.assign({}, S.cage())); b(Object.assign({}, S.heist())); b(Object.assign({}, S.defend()));
  b(Object.assign({vo: 't05', point: t => t < 2 ? ['#stick', 'Move'] : ['#bAtk', 'Attack']}, S.combo(), {act: (M, t) => { hold(1); stick(Math.sin(t * 2) * 0.3, 0); }}));
  b(Object.assign({vo: 't06', span: 2, point: () => ['#bRoll', 'Roll']}, S.roll()));
  b(Object.assign({point: () => ['#bSpec', 'Special']}, S.special('maren', 'hollow', ['boneman', 'boneman', 'hound', 'boneman', 'wisp', 'boneman'], 46, 86)));
  b(Object.assign({vo: 't07', span: 2}, S.gunNest(), {keys: null}));
  b(Object.assign({}, S.kegs()));
  b(Object.assign({vo: 't08', span: 2}, ui(() => CD.UI.camp('posse'))));
  b(Object.assign({}, ui(() => CD.UI.camp('hero'))));
  b({vo: 't09', enter: () => { CD.UI.hide(); mapChrome('ford', () => CD.UI.raid({t: D.terrById.ford, faction: 'corsair', odds: 0.55}, 46)); }, paint: paintMap});
  b(Object.assign({vo: 't10', span: 2}, withHud(S.snigUp()))); b(Object.assign({}, withHud(S.odoUp())));
  b(Object.assign({vo: 't11', min: 4.5}, S.end()));
}

/* ---------------- timing from the narration ---------------- */
const AIR = 0.45, LEAD = 0.2;
function layout() {
  const script = TR.script, text = {}; script.lines.forEach(l => { text[l.id] = l.text; });
  for (let i = 0; i < B.length; i++) {
    const s = B[i]; if (!s.vo) continue; const n = s.span || 1, need = (DUR[s.vo] || 3) + LEAD + AIR, group = B.slice(i, i + n);
    if (n === 1) s.d = Math.max(s.min || 2, need);
    else { const each = Math.max(1.4, need / n); group.forEach(g => { g.d = each; }); }
  }
  /* shot ticks run every frame; tick(t) is for UI clicks */
  B.forEach(s => { if (s.tick) { const post = s.post; s.post = (M, t, cur) => { if (post) post(M, t, cur); }; } });
  F.SH.forEach(s => { s.t0 = 0; });
}
TR.captions = () => CAPS.map(c => ({t0: c.t0, t1: c.t1, text: c.text}));
TR.chapters = () => CHAPS.map(c => ({t: c.t, title: c.title}));
function captionPlan() {
  const text = {}; TR.script.lines.forEach(l => { text[l.id] = l.text; }); let t = 0; const max = TT ? 44 : 64;
  for (const s of B) {
    if (s.chapter) CHAPS.push({t: t, title: s.chapter});
    if (s.vo) { const st = t + LEAD, dur = DUR[s.vo] || 3; VO.push({id: s.vo, t: st, dur: dur}); const cs = chunks(text[s.vo], max), tot = cs.reduce((a, c) => a + c.length + 6, 0); let ct = st;
      cs.forEach(c => { const len = dur * (c.length + 6) / tot; CAPS.push({t0: ct, t1: ct + len, text: c}); ct += len; }); CAPS[CAPS.length - 1].t1 = st + dur + 0.25; }
    t += s.d;
  }
}
/* menu shots have no mission; their tick runs from the director's draw hook */
const baseDraw = TR.onDraw; TR.onDraw = function (s, lt, cur) { if (s.tick) s.tick(lt, cur); baseDraw(s, lt); };

/* ---------------- soundtrack: a calm bed, ducked under the voice ---------------- */
TR.music = function (ctx, out, dur) {
  const beat = 0.6, nb = Math.ceil(dur / beat), A2 = 110, prog = [[1, 1.189, 1.498], [0.891, 1.122, 1.335], [0.749, 0.944, 1.122], [0.84, 1, 1.26]];
  const env = (g, t, a, d, v) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const note = (t, f, d, v, type, lp) => { const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter(); o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = lp || 1400; env(g, t, 0.01, d, v); o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); };
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const shaker = (t, v) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; fl.type = 'highpass'; fl.frequency.value = 6000; env(g, t, 0.003, 0.05, v); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + 0.1); };
  const kick = t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15); env(g, t, 0.004, 0.25, 0.5); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3); };
  for (let b2 = 0; b2 < nb; b2++) {
    const t = b2 * beat; if (t > dur - 1) break; const ch = prog[Math.floor(b2 / 8) % 4];
    if (b2 % 2 === 0) kick(t); shaker(t + beat / 2, 0.05); shaker(t + beat * 0.75, 0.03);
    note(t, A2 / 2 * ch[0], beat * 0.9, 0.22, 'triangle', 600);                                        // walking bass
    if (b2 % 2 === 0) [0, 1, 2].forEach((k, j) => note(t + j * 0.07, A2 * 2 * ch[k], beat * 1.6, 0.05, 'triangle', 2200));   // strummed chord
  }
};
TR.audioExtra = async function (ctx, dest, mus, dur) {
  mus.gain.setValueAtTime(0.5, 0);
  for (const v of VO) {
    const buf = await fetch('../build/guide/vo/' + v.id + '.wav').then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a));
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = buf; g.gain.value = 1.15; src.connect(g); g.connect(dest); src.start(v.t);
    mus.gain.setTargetAtTime(0.13, Math.max(0, v.t - 0.15), 0.06); mus.gain.setTargetAtTime(0.5, v.t + v.dur + 0.1, 0.25);
  }
};

/* ---------------- start: load the narration timings, then lay out ---------------- */
Promise.all([fetch('guide_script.json').then(r => r.json()), fetch('../build/guide/vo/durations.json').then(r => r.json()).catch(() => ({}))]).then(([script, dur]) => {
  TR.script = script; DUR = dur; layout(); captionPlan(); TR.finalize('Play the guide');
  TR.vo = VO;
});
})();
