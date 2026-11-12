/* Crown of Dust - trailer director (trailer/trailer.js).
   Films the real game: every shot builds a seeded mission with CD.Mission.start, places the cast, drives the hero through the
   game's own input and special moves, and cuts on a 120 BPM grid. Two formats from one shot list:
     #yt  1920x1080 (16:9, letterboxed to 2:1)     #tt  1080x1920 (9:16, framed tight, text inside TikTok's safe zone)
   Add "render" to the hash for offline rendering: tests/render_trailer.cjs then calls TR.render(frame) / TR.grab() per frame
   and TR.audioWav() once for the soundtrack. Without "render" the page plays live after a tap. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, E = CD.Ent, C = CD.Combat, W = CD.World, MS = CD.Mission, S = CD.Sprites, A = CD.Art, I = CD.Input, YS = U.YS;
const hash = location.hash.toLowerCase();
const TR = window.TR = {fps: 30, fmt: hash.indexOf('tt') >= 0 ? 'tt' : 'yt', render: hash.indexOf('render') >= 0, frame: -1, idx: -1, log: [], quiet: false, last: {}};
const FPS = TR.fps, DT = 1 / FPS, INKC = U.INKC, MUST = U.MUST, RED = U.RED, PAPER = U.PAPER;
const FONT = '"DejaVu Serif","Rockwell","Roboto Slab",Georgia,serif';

/* ---------------- sprite resolution and sound logging ---------------- */
S.lockScale = true; S.scale = 5; S.budget = TR.render ? 700e6 : 260e6; S.frameBudget = TR.render ? 1e9 : 12; S.flush();
CD.Sfx.onPlay = function (name) {
  if (TR.quiet || TR.frame < 0) return; const t = TR.frame / FPS;
  if (TR.last[name] != null && t - TR.last[name] < 0.06) return; TR.last[name] = t;
  if (TR.log.length && TR.log.filter(e => e[0] === t).length >= 5) return; TR.log.push([t, name]);
};

/* ---------------- staging helpers ---------------- */
function stage(o) {
  const hero = o.hero || 'harrow', spec = Object.assign({type: 'raid', faction: 'corsair', tier: 3, seed: 7, name: '', reward: 0, prisoner: null, posse: [], perk: {}, noHud: true, skipWarm: true, noEnd: true, bgS: 4}, o);
  spec.biome = o.biome || D.factions[spec.faction].biome; spec.hero = {id: hero, weapons: o.weapons || [D.units[hero].weapon], mount: o.mount || null};
  const M = MS.start(spec, () => {}); M.god = true; M.camLock = true; M.waves = o.keepWaves ? M.waves : null; if (o.scrip) M.scrip = o.scrip;
  return M;
}
function clearAt(M, x, y, r) {                               // an open patch of ground for a staged fight
  const far = o => Math.hypot(o.x - x, o.y - y) > r;
  M.props = M.props.filter(far); M.structs = M.structs.filter(s => far(s) || s.keep); M.stakes = M.stakes.filter(far); M.pickups = M.pickups.filter(far);
  M.cols = M.cols.filter(c => c.s ? M.structs.indexOf(c.s) >= 0 : c.wall || far(c)); M.tents = M.tents.filter(t => M.structs.indexOf(t) >= 0);
  M.units = M.units.filter(u => u.hero || far(u)); W.rebuild(M);
}
function foe(M, id, x, y, o) { const u = E.spawn(M, id, 1, x, y, o); u.ai.alert = true; u.ai.hate = M.hero; u.ai.home = [x, y]; E.face(u, Math.atan2(M.hero.y - y, M.hero.x - x)); u.cd = 0.2 + Math.random() * 0.4; return u; }
function pal(M, id, x, y) { const u = E.spawn(M, id, 0, x, y); u.slot = M.posse.length; M.posse.push(u); u.maxHp = u.hp = 900; u.dir = M.hero.dir; return u; }
function ring(M, ids, cx, cy, r, a0) { return ids.map((id, i) => { const a = (a0 || 0) + i / ids.length * 6.283; return foe(M, id, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8); }); }
function face(u, ang) { E.face(u, ang); }
/* a cleared arena with the hero at (hx, hy) facing east */
const AX = 260, AY = 320;
function duel(o) {
  const M = stage(Object.assign({type: 'raid', tier: 2}, o)); clearAt(M, AX + 40, AY, o.clear || 170);
  M.units = M.units.filter(u => u.hero); M.posse = []; const h = M.hero; h.x = AX; h.y = AY; face(h, o.face == null ? 0 : o.face); W.resolve(M, h);
  return M;
}
const hold = v => { I.keys.attack = !!v; };
const stick = (x, y) => { I.stick.x = x; I.stick.y = y || 0; };

/* ---------------- shots ----------------
   d: seconds on screen, skip: seconds simulated before the first visible frame, set(): build the scene (returns M or null),
   act(M, t, st): inputs before each step, post(M, t, st): scripted moves after each step, cam(M, t, st) -> {x, y, fw, up},
   card / plate / flash: overlays. t is shot-local time including skip. */
const SH = [];
const shot = o => { SH.push(o); return o; };
const follow = (fw, up, dx) => (M, t) => ({x: M.hero.x + (dx || 0), y: M.hero.y, fw: fw, up: up});

/* 1. cold open: one shot straight down the barrel */
shot({d: 0.5, flash: false, set: () => duel({hero: 'harrow', faction: 'corsair', biome: 'desert', seed: 3, face: Math.PI / 2}),
  act: (M, t) => { if (t >= 0.03 && t < 0.07) C.attack(M, M.hero, Math.PI / 2); }, cam: (M) => ({x: M.hero.x, y: M.hero.y, fw: 120, up: 28, ttk: 0.62})});
shot({d: 2, card: {title: 'The Tally Basin', sub: 'Dust. Debts. Very bad men.'}});
/* 2. the posse rides into Dry Gulch */
shot({d: 2.5, skip: 0.6, set: () => { const M = stage({type: 'defend', faction: 'crown', biome: 'desert', seed: 21, hero: 'harrow'}); M.units = M.units.filter(u => u.hero || u.def.ai === 'pet');
    const h = M.hero; h.x = 140; h.y = M.hall.y + 170; face(h, 0); ['wren', 'goro', 'abel', 'maren', 'kit'].forEach((id, i) => pal(M, id, 110 - (i % 3) * 18, h.y - 14 + i * 9)); return M; },
  act: () => stick(0.62, 0), cam: (M, t) => ({x: M.hero.x + (TR.fmt === 'tt' ? 10 : 60), y: M.hero.y - (TR.fmt === 'tt' ? 6 : 30), fw: 380, up: 26})});
/* 3. the map */
shot({d: 2, map: true});
shot({d: 2, card: {title: 'Three powers carved it up', totems: true}});
/* 4. the three powers at home */
function campShot(fac, seed, name, extra) {
  return shot({d: 2, skip: 1.2, plate: {name: name, sub: D.factions[fac].name === name ? '' : D.factions[fac].name}, set: () => { const M = stage({type: 'raid', faction: fac, tier: 4, seed: seed}); if (extra) extra(M); return M; },
    cam: (M, t) => ({x: M.campAt[0] - 40 + t * 14, y: M.campAt[1] - 10, fw: 360, up: 30})});
}
campShot('corsair', 11, 'Greenskin Corsairs', M => { const c = M.campAt; foe(M, 'gobbrute', c[0] - 70, c[1] + 10).ai.alert = false; foe(M, 'gila', c[0] + 10, c[1] + 40).ai.alert = false; M.units.forEach(u => { if (u.team === 1) { u.ai.alert = false; u.ai.hate = null; } }); });
campShot('hollow', 12, 'The Hollow Court', M => { const c = M.campAt; ['wisp', 'wisp', 'reaper', 'crow'].forEach((id, i) => { const u = foe(M, id, c[0] - 80 + i * 40, c[1] + 20 - (i % 2) * 30); u.ai.alert = false; u.ai.hate = null; }); M.units.forEach(u => { if (u.team === 1) { u.ai.alert = false; u.ai.hate = null; } }); });
shot({d: 2, plate: {name: 'The Gilded Crown', sub: ''}, set: () => { const M = stage({type: 'raid', faction: 'crown', tier: 4, seed: 13}); const y = 320; clearAt(M, 400, y, 190); M.units = M.units.filter(u => u.hero); M.hero.x = 40; M.hero.y = 80;
    const col = ['lancer', 'footman', 'footman', 'halberd', 'footman', 'footman', 'musketeer', 'musketeer', 'crossbow', 'cleric']; col.forEach((id, i) => { const u = foe(M, id, 470 + Math.floor(i / 2) * 26 + (i % 2) * 8, y - 16 + (i % 2) * 30); u.scripted = true; u.ai.hate = null; }); return M; },
  post: (M) => { for (const u of M.units) if (u.scripted && !u.dead) E.move(M, u, -1, 0, u.def.ai === 'charger' ? 26 : 22, DT); },
  cam: (M, t) => ({x: 470 - t * 22, y: 320, fw: 330, up: 30})});
shot({d: 1, card: {title: 'One posse'}});

/* 5. the captains, one second each */
const quick = (o) => shot(Object.assign({d: 1, skip: 0.15}, o));
quick({set: () => { const M = duel({hero: 'harrow', faction: 'corsair', biome: 'desert', seed: 31}); for (let i = 0; i < 6; i++) foe(M, 'grub', AX + 70 + (i % 2) * 14, AY - 45 + i * 18); return M; },
  act: (M, t) => { if (t > 0.2 && t < 0.25) MS.special(); }, cam: follow(250, 26, 50)});
quick({set: () => { const M = duel({hero: 'goro', faction: 'corsair', seed: 32}); ring(M, ['grub', 'gobslinger', 'grub', 'grub'], AX + 22, AY, 18, 2); return M; },
  act: () => hold(1), cam: follow(170, 26, 12)});
quick({set: () => { const M = duel({hero: 'wren', faction: 'crown', seed: 33}); for (let i = 0; i < 5; i++) foe(M, 'footman', AX + 70 + i * 26, AY + (i % 2) * 4); return M; },
  act: (M, t) => { if (t > 0.2 && t < 0.25) MS.special(); }, cam: follow(300, 26, 80)});
quick({set: () => { const M = duel({hero: 'abel', faction: 'corsair', seed: 34}); ring(M, ['grub', 'grub', 'gobslinger', 'grub', 'snap', 'grub'], AX, AY, 26); return M; },
  act: (M, t) => { if (t > 0.3 && t < 0.35) MS.special(); }, cam: follow(190, 30)});
quick({set: () => { const M = duel({hero: 'maren', faction: 'hollow', seed: 35}); ring(M, ['boneman', 'boneman', 'hound', 'boneman', 'wisp', 'boneman', 'hound'], AX, AY, 46); return M; },
  act: (M, t) => { if (t > 0.25 && t < 0.3) MS.special(); }, cam: follow(230, 30)});
quick({set: () => { const M = duel({hero: 'hob', faction: 'hollow', biome: 'crown', seed: 36}); for (let i = 0; i < 6; i++) foe(M, i % 2 ? 'hound' : 'blackcat', AX + 130 + (i % 3) * 16, AY - 40 + i * 16); return M; },
  act: (M, t) => { if (t > 0.3 && t < 0.35) MS.special(); }, cam: follow(290, 26, 70)});
quick({set: () => { const M = duel({hero: 'jory', faction: 'corsair', seed: 37}); ring(M, ['grub', 'gobslinger', 'grub', 'grub', 'gobgun'], AX, AY, 26, 0.5); return M; },
  act: (M, t) => { if (t > 0.2 && t < 0.25) MS.special(); }, cam: follow(200, 30)});
quick({set: () => { const M = duel({hero: 'trueno', faction: 'corsair', biome: 'desert', seed: 38}); foe(M, 'gobbrute', AX + 24, AY + 2); return M; },
  act: () => hold(1), cam: follow(170, 30, 12)});
quick({skip: 0.3, set: () => { const M = duel({hero: 'ezra', faction: 'hollow', biome: 'desert', seed: 39}); M.hero.x = AX - 60; for (let i = 0; i < 4; i++) foe(M, 'boneman', AX + 80 + (i % 2) * 20, AY - 30 + i * 20); return M; },
  act: () => { stick(1, 0); hold(1); }, cam: follow(260, 34, 40)});
quick({set: () => { const M = duel({hero: 'bramble', faction: 'crown', seed: 40}); for (let i = 0; i < 3; i++) foe(M, 'footman', AX + 30 + i * 10, AY - 12 + i * 12); return M; },
  act: () => hold(1), cam: follow(200, 34, 20)});
quick({set: () => { const M = duel({hero: 'nori', faction: 'hollow', seed: 41}); const f = foe(M, 'fang', AX + 26, AY); f.hp = f.maxHp = 2000; return M; },
  act: () => hold(1), cam: follow(160, 30, 12)});
quick({skip: 0.1, set: () => { const M = duel({hero: 'pip', faction: 'corsair', seed: 42}); const m = E.spawn(M, 'chomp', 1, AX + 52, AY); m.dormant = true; m.dir = 'W'; return M; },
  act: (M, t) => { stick(t < 0.55 ? 0.6 : 0, 0); hold(t > 0.6); }, cam: follow(170, 26, 30)});

/* 6. the jobs */
const job = (o) => shot(Object.assign({d: 1.5, skip: 0.2}, o));
job({set: () => { const M = stage({type: 'defend', faction: 'crown', biome: 'desert', seed: 51, hero: 'kit', scrip: 99}); const st = M.stakes.reduce((a, b) => b.x > a.x && b.y > a.y - 20 ? b : a); M.units = M.units.filter(u => u.hero || u.militia);
    M.hero.x = st.x - 14; M.hero.y = st.y + 10; face(M.hero, 0); M._st = st; for (let i = 0; i < 6; i++) { const u = foe(M, i % 3 ? 'footman' : 'musketeer', st.x + 150 + (i % 2) * 22, st.y - 40 + i * 14); u.ai.march = true; } return M; },
  act: (M, t) => { if (t > 0.25 && !M._built) { M._built = MS.build(1) || true; } }, cam: (M) => ({x: M._st.x + 60, y: M._st.y, fw: 300, up: 30})});
job({set: () => { const M = duel({hero: 'vega', faction: 'corsair', biome: 'swamp', seed: 52}); const kx = AX + 90; M._kegs = [0, 1, 2].map(i => W.addStruct(M, 'keg', kx + i * 22, AY - 14 + i * 14, {}));
    for (let i = 0; i < 9; i++) foe(M, i % 3 ? 'grub' : 'snap', kx + 10 + (i % 3) * 18, AY - 40 + Math.floor(i / 3) * 36); return M; },
  hit: 0.5, act: (M, t) => { if (t > 0.35 && t < 0.4) C.attack(M, M.hero, 0); if (t > 0.55 && !M._k) { M._k = 1; W.destroy(M, M._kegs[0], M.hero); } }, cam: follow(320, 30, 90)});
job({set: () => { const M = stage({type: 'heist', faction: 'crown', seed: 53, hero: 'vesper'}); const b = M.boxes[1]; M.units = M.units.filter(u => u.hero || Math.hypot(u.x - b.x, u.y - b.y) > 120); M.hero.x = b.x - 36; M.hero.y = b.y + 4; face(M.hero, 0); M._b = b; return M; },
  act: () => stick(0.8, 0), cam: (M) => ({x: M._b.x, y: M._b.y, fw: 260, up: 30})});
job({set: () => { const M = stage({type: 'rescue', faction: 'corsair', tier: 2, seed: 54, hero: 'goro', prisoner: 'wade'}); const c = M.cage; M.units = M.units.filter(u => u.hero || u.prisoner || Math.hypot(u.x - c.x, u.y - c.y) > 90);
    M.hero.x = c.x - 24; M.hero.y = c.y + 14; face(M.hero, -0.4); c.hp = 20; return M; },
  act: () => hold(1), cam: (M) => ({x: M.cage.x, y: M.cage.y, fw: 220, up: 32})});
job({skip: 0.5, set: () => { const M = stage({type: 'defend', faction: 'crown', biome: 'desert', seed: 55, hero: 'holloway'}); const hx = M.hall.x, hy = M.hall.y; M.hero.x = hx - 40; M.hero.y = hy + 70;
    for (let i = 0; i < 3; i++) { const u = foe(M, 'lancer', hx + 210, hy + 30 + i * 30); u.ai.march = true; } for (let i = 0; i < 5; i++) { const u = foe(M, 'footman', hx + 240 + (i % 2) * 20, hy - 20 + i * 22); u.ai.march = true; } return M; },
  act: () => hold(1), cam: (M) => ({x: M.hall.x + 70, y: M.hall.y + 50, fw: 400, up: 30})});
job({set: () => { const M = stage({type: 'raid', faction: 'hollow', tier: 3, seed: 56, hero: 'wren'}); M.tents.forEach(t => { if (t.inCamp) { t.gone = true; if (t.col) t.col.gone = true; } }); W.rebuild(M); const T = M.totem; T.hp = 10;
    M.units = M.units.filter(u => u.hero || Math.hypot(u.x - T.x, u.y - T.y) > 110); M.hero.x = T.x - 90; M.hero.y = T.y + 16; face(M.hero, Math.atan2(T.y - M.hero.y, T.x - M.hero.x)); return M; },
  hit: 0.5, act: (M, t) => { if (t > 0.45 && t < 0.5) C.attack(M, M.hero, Math.atan2(M.totem.y - M.hero.y, M.totem.x - M.hero.x)); }, cam: (M) => ({x: M.totem.x - 30, y: M.totem.y, fw: 260, up: 44})});
shot({d: 1, card: {title: 'They will not go quietly'}});

/* 7. the bosses */
function bossStage(o) {
  const M = stage(Object.assign({type: 'boss', tier: 4}, o)), b = M.boss; M.units = M.units.filter(u => u.hero || u.boss || u.elite || Math.hypot(u.x - b.x, u.y - b.y) < 140);
  for (const x of M.bosses) { x.ai.asleep = false; x.ai.alert = true; x.ai.hate = M.hero; }
  const h = M.hero; h.x = b.x - 70; h.y = b.y + 20; face(h, 0); (o.gang || []).forEach((id, i) => pal(M, id, h.x - 10 - (i % 2) * 16, h.y - 26 + i * 16));
  return M;
}
shot({d: 3.5, skip: 0.6, hit: 1.5, plate: {name: 'Captain Snig', sub: 'Greenskin Corsairs', at: 0.2}, set: () => bossStage({faction: 'corsair', seed: 61, hero: 'harrow', gang: ['abel', 'goro', 'wren']}),
  act: (M, t) => { hold(1); const b = M.boss; if (t > 2.1 && !b.phased) { b.hp = 1; b.inv = 0; C.hurt(M, b, 9, M.hero, 0, 0); } }, cam: (M, t) => ({x: (M.boss.x + M.hero.x) / 2, y: M.boss.y, fw: 280 - t * 10, up: 36})});
shot({d: 3.5, skip: 0.6, hit: 1.25, plate: {name: 'Queen Vex', sub: 'The Hollow Court', at: 0.2}, set: () => { const M = bossStage({faction: 'hollow', seed: 62, hero: 'maren', gang: ['hazel', 'nori', 'jory']}); M.boss.ai.sumN = 99; M.boss.ai.sp = 1.8; return M; },
  act: () => hold(1), cam: (M, t) => ({x: (M.boss.x + M.hero.x) / 2 + 10, y: M.boss.y, fw: 300 - t * 10, up: 36})});
shot({d: 4, skip: 0.4, hit: 0.45, plate: [{name: 'The Tyrant', sub: '', at: 0.1, to: 1.9}, {name: 'King Odo the Gilded', sub: 'The Gilded Crown', at: 2.1}], set: () => {
    const M = bossStage({faction: 'crown', seed: 63, hero: 'wren', gang: ['tobias', 'holloway', 'abel']}); const t = M.bosses[1], h = M.hero; t.x = h.x + 70; t.y = h.y - 6; t.cd = 9; M._t = t; return M; },
  act: (M, t) => { hold(t > 1.2); const ty = M._t, b = M.boss;
    if (t > 0.5 && !M._roar) { M._roar = 1; CD.Sfx.play('roar'); ty.one = null; C.attack(M, ty, Math.atan2(M.hero.y - ty.y, M.hero.x - ty.x), {act: 'combo3', aoe: true, reach: 58, arc: 360, mul: 0.6, stun: 0.5}); M.shake = 9; }
    if (t > 3.0 && !b.phased) { b.hp = 1; b.inv = 0; C.hurt(M, b, 9, M.hero, 0, 0); } },
  cam: (M, t) => t < 2 ? {x: M._t.x - 20, y: M._t.y, fw: 300 - t * 20, up: 46} : {x: M.boss.x - 30, y: M.boss.y, fw: 270, up: 40}});

/* 8. smash montage: the loudest half-second of earlier shots, recut */
/* indices into SH: 9-20 captains, 21-26 jobs, 28-30 bosses */
const BIG = [12, 22, 13, 10, 30, 9, 15, 28, 11, 29, 24, 26, 21, 14, 16, 25];
BIG.forEach((ref, i) => { const r = SH[ref]; if (!r || !r.set) return; shot(Object.assign({}, r, {d: 0.25, skip: (r.skip || 0) + (r.hit != null ? r.hit : 0.3) + (i % 3) * 0.04, plate: null, flash: true, montage: true})); });
/* 9. end card: the posse, dancing */
shot({d: 5, logo: true, skip: 0.3, set: () => { const M = stage({type: 'defend', faction: 'crown', biome: 'desert', seed: 21, hero: 'harrow'}); M.units = M.units.filter(u => u.hero || u.def.ai === 'pet');
    const h = M.hero, y = M.hall.y + 150; h.x = M.hall.x; h.y = y; h.dir = 'S';
    ['wren', 'goro', 'abel', 'maren', 'trueno', 'jory', 'hob', 'vega'].forEach((id, i) => { const u = pal(M, id, M.hall.x + (i % 2 ? 1 : -1) * (26 + Math.floor(i / 2) * 26), y + 10 - Math.floor(i / 2) * 9); u.scripted = true; u.dir = 'S'; }); return M; },
  post: (M, t) => { M.units.forEach((u, i) => { if (u.team === 0 && u.def.ai !== 'pet') { u.dance = 1 + (i + Math.floor(t * 2)) % 3; u.dir = 'S'; } }); },
  cam: (M) => ({x: M.hall.x, y: M.hall.y + 150, fw: 330, up: 52})});

/* timeline */
let acc = 0; SH.forEach(s => { s.t0 = acc; acc += s.d; }); TR.duration = acc; TR.frames = Math.round(acc * FPS); TR.shots = SH;
function shotAt(t) { for (let i = SH.length - 1; i >= 0; i--) if (t >= SH[i].t0 - 1e-6) return i; return 0; }

/* ---------------- stepping ---------------- */
let cur = null;
function enter(i) {
  const s = SH[i]; TR.idx = i; I.reset(); cur = {s: s, M: null, t: 0};
  if (s.set) { cur.M = s.set(); TR.quiet = true; for (let k = 0, n = Math.round((s.skip || 0) * FPS); k < n; k++) simStep(); TR.quiet = false; }
}
function simStep() {
  const s = cur.s, M = cur.M; I.keys.attack = false; I.stick.x = I.stick.y = 0;
  if (s.act) s.act(M, cur.t, cur); CD.M = M; MS.update(DT); if (s.post) s.post(M, cur.t, cur); cur.t += DT;
}
function step() {
  TR.frame++; const t = TR.frame / FPS, i = shotAt(t);
  if (i !== TR.idx) enter(i);
  if (cur.M) simStep(); else cur.t = t - cur.s.t0;
}

/* ---------------- drawing ---------------- */
function frameCam(M, c) {
  const V = CD.View, Wd = V.w, Hd = V.h; let s;
  if (TR.fmt === 'tt') s = Wd / (c.fw * (c.ttk || 0.5)); else s = Math.min(Wd / c.fw, Hd / (c.fw * 0.5));
  M.view.S = s; M.view.w = Wd / s; M.view.h = Hd / s;
  let x = c.x, y = c.y * YS - (c.up == null ? 24 : c.up) * (TR.fmt === 'tt' ? 1.25 : 1);
  const hw = M.view.w / 2, hh = M.view.h / 2, Hs = M.H * YS;
  x = M.W <= 2 * hw ? M.W / 2 : U.clamp(x, hw, M.W - hw); y = Hs <= 2 * hh ? Hs / 2 : U.clamp(y, hh - 8, Hs - hh + 8);
  M.cam.x = x; M.cam.y = y;
}
const px = n => n * Math.min(CD.View.w, CD.View.h) / 1080;   // design pixels at 1080 on the short side
function wrap(c, txt, maxW) { const words = txt.split(' '), out = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); return out; }
function inkText(c, txt, x, y, size, fill, o) {
  o = o || {}; if (o.max) { c.font = (o.w || 700) + ' ' + size + 'px ' + FONT; try { c.letterSpacing = (o.sp == null ? 0.06 : o.sp) * size + 'px'; } catch (e) { /* ignore */ } const mw = c.measureText(txt).width; if (mw > o.max) size *= o.max / mw; }
  c.font = (o.w || 700) + ' ' + size + 'px ' + FONT; c.textAlign = o.align || 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  try { c.letterSpacing = (o.sp == null ? 0.06 : o.sp) * size + 'px'; } catch (e) { /* older canvas: no letter spacing */ }
  if (o.stroke) { c.lineWidth = o.stroke; c.strokeStyle = INKC; c.strokeText(txt, x, y); }
  c.fillStyle = fill; c.fillText(txt, x, y); try { c.letterSpacing = '0px'; } catch (e) { /* ignore */ }
}
function paperBg(c, Wd, Hd, seed) {
  c.fillStyle = PAPER; c.fillRect(0, 0, Wd, Hd); const r = U.rng32(seed);
  for (let i = 0; i < 26; i++) { c.globalAlpha = 0.3; const x = r() * Wd, y = r() * Hd, rr = px(80 + r() * 200); U.poly(c, U.ngon(x, y, rr, 10, r() * 3, 0.6), i % 2 ? U.PAPER2 : '#f1ebdc'); } c.globalAlpha = 1;
  for (let i = 0; i < 260; i++) { const x = r() * Wd, y = r() * Hd, w = px(4 + r() * 10); U.seg(c, x, y, x + w, y + (r() - 0.5) * 2, px(1.2), i % 6 ? '#cfc3a4' : '#8f8676'); }
}
function frameBorder(c, Wd, Hd, t) { const m = px(26); A.k.outline(c, [[m, m], [Wd - m, m], [Wd - m, Hd - m], [m, Hd - m]], px(7), 5); A.k.outline(c, [[m + px(14), m + px(14)], [Wd - m - px(14), m + px(14)], [Wd - m - px(14), Hd - m - px(14)], [m + px(14), Hd - m - px(14)]], px(2.4), 9); }
function drawCard(c, s, t) {
  const V = CD.View, Wd = V.w, Hd = V.h, card = s.card, tt = TR.fmt === 'tt', cy = tt ? Hd * 0.42 : Hd * 0.47;
  paperBg(c, Wd, Hd, s.t0 * 100 | 0); frameBorder(c, Wd, Hd);
  const size = px(tt ? 128 : 150); c.font = '700 ' + size + 'px ' + FONT; const lines = wrap(c, card.title.toUpperCase(), Wd * 0.8), lh = size * 1.12;
  const y0 = cy - (lines.length - 1) * lh / 2 - (card.totems ? px(tt ? 260 : 190) : 0), pop = Math.min(1, t / 0.18), sc = 0.86 + 0.14 * (1 - Math.pow(1 - pop, 3));
  c.save(); c.translate(Wd / 2, y0 + (lines.length - 1) * lh / 2); c.scale(sc, sc); c.translate(-Wd / 2, -(y0 + (lines.length - 1) * lh / 2));
  lines.forEach((l, i) => inkText(c, l, Wd / 2, y0 + i * lh, size, INKC)); c.restore();
  /* an ink brush stroke wipes in under the words */
  const k = Math.min(1, t / 0.45), sw = Math.min(Wd * 0.62, px(900)), sx = Wd / 2 - sw / 2, sy = y0 + (lines.length - 1) * lh + size * 0.78;
  if (k > 0) { c.save(); c.beginPath(); c.rect(sx - px(20), sy - px(30), (sw + px(40)) * k, px(60)); c.clip(); A.k.fillp(c, [[sx, sy - px(9)], [sx + sw * 0.5, sy - px(14)], [sx + sw, sy - px(6)], [sx + sw - px(10), sy + px(8)], [sx + sw * 0.5, sy + px(12)], [sx + px(6), sy + px(6)]], RED); c.restore(); }
  if (card.sub) inkText(c, card.sub, Wd / 2, sy + px(90), px(tt ? 52 : 56), U.DIM, {w: 400, sp: 0.02});
  if (card.totems) { const fs = ['corsair', 'hollow', 'crown'], sz = px(tt ? 4.6 : 4.4), gap = Math.min(Wd * 0.31, px(470));
    fs.forEach((f, i) => { const d = Math.max(0, Math.min(1, (t - 0.15 - i * 0.18) / 0.2)); if (!d) return; c.save(); c.translate(Wd / 2 + (i - 1) * gap, sy + px(tt ? 560 : 470) + (1 - d) * px(60)); c.scale(sz, sz); c.globalAlpha = d; A.draw(c, 'totem', 0, 0, 0, f); c.restore();
      inkText(c, {corsair: 'CORSAIRS', hollow: 'HOLLOW COURT', crown: 'THE CROWN'}[f], Wd / 2 + (i - 1) * gap, sy + px(tt ? 620 : 530), px(tt ? 36 : 40), D.factions[f].color, {sp: 0.06, max: gap * 0.92}); }); }
}
function drawPlate(c, p, t) {
  const V = CD.View, Wd = V.w, Hd = V.h, tt = TR.fmt === 'tt', at = p.at || 0, to = p.to == null ? 1e9 : p.to; if (t < at || t > to) return;
  const k = Math.min(1, (t - at) / 0.22), e = 1 - Math.pow(1 - k, 3), size = px(tt ? 74 : 70), subS = px(tt ? 36 : 34);
  c.font = '700 ' + size + 'px ' + FONT; const w = Math.min(Wd * 0.9, c.measureText(p.name.toUpperCase()).width * 1.12 + px(90)), h = size * 1.5 + (p.sub ? subS * 1.3 : 0);
  const x = tt ? (Wd - w) / 2 : px(110) - (1 - e) * (w + px(140)), y = tt ? Hd * 0.62 : Hd - px(110) - h - px(70);
  c.save(); if (tt) c.globalAlpha = e;
  A.k.fillp(c, [[x + px(10), y + px(14)], [x + w + px(10), y + px(4) + px(14)], [x + w - px(16) + px(10), y + h + px(14)], [x - px(8) + px(10), y + h - px(6) + px(14)]], INKC);
  const slab = [[x, y], [x + w, y + px(4)], [x + w - px(16), y + h], [x - px(8), y + h - px(6)]]; A.k.fillp(c, slab, MUST); A.k.outline(c, slab, px(6), 17);
  inkText(c, p.name.toUpperCase(), x + w / 2 - px(6), y + size * 0.78, size, INKC, {max: w - px(60)});
  if (p.sub) inkText(c, p.sub.toUpperCase(), x + w / 2 - px(6), y + size * 1.5 + subS * 0.3, subS, RED, {sp: 0.12, max: w - px(60)});
  c.restore();
}
function drawLogo(c, t) {
  const V = CD.View, Wd = V.w, Hd = V.h, tt = TR.fmt === 'tt', k = Math.min(1, t / 0.35), e = 1 - Math.pow(1 - k, 3);
  const g = c.createLinearGradient(0, 0, 0, Hd * 0.6); g.addColorStop(0, 'rgba(22,18,20,0.88)'); g.addColorStop(1, 'rgba(22,18,20,0)'); c.fillStyle = g; c.fillRect(0, 0, Wd, Hd * 0.6);
  const cy = tt ? Hd * 0.2 : Hd * 0.2, s1 = px(tt ? 150 : 150), s2 = px(tt ? 78 : 80);
  c.save(); c.translate(Wd / 2, cy); c.scale(0.8 + 0.2 * e, 0.8 + 0.2 * e); c.globalAlpha = e;
  inkText(c, 'INK OUTLAWS', 0, 0, s1, PAPER, {stroke: px(14), max: Wd * 0.86});
  inkText(c, 'CROWN OF DUST', 0, s1 * 0.82, s2, MUST, {stroke: px(10), sp: 0.18, max: Wd * 0.8});
  c.restore();
  const k2 = Math.max(0, Math.min(1, (t - 0.8) / 0.4)); if (k2) { c.globalAlpha = k2; inkText(c, 'Every frame drawn in code.', Wd / 2, cy + s1 * 1.45, px(tt ? 44 : 44), PAPER, {w: 400, stroke: px(6), sp: 0.03, max: Wd * 0.86}); c.globalAlpha = 1; }
}
function drawMap(c, s, t) {
  const V = CD.View; if (!CD.G) { CD.Camp.fresh('harrow'); ['ford', 'toll', 'rise'].forEach(id => { CD.G.own[id] = 'outlaw'; }); CD.Map.sel = 'gulch'; }
  if (!TR.mapReady || TR.mapFmt !== V.w) { CD.scenes.map.resize(); TR.mapReady = true; TR.mapFmt = V.w; }
  CD.Map.t = 3 + t; CD.scenes.map.draw();
  if (!TR.tmp) TR.tmp = document.createElement('canvas'); const tmp = TR.tmp; tmp.width = V.cv.width; tmp.height = V.cv.height; tmp.getContext('2d').drawImage(V.cv, 0, 0);
  const z = 1.04 + 0.16 * (t / s.d), fx = TR.fmt === 'tt' ? 0.5 : 0.5, fy = 0.55; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = INKC; c.fillRect(0, 0, V.cv.width, V.cv.height);
  c.translate(V.cv.width * fx, V.cv.height * fy); c.scale(z, z); c.translate(-V.cv.width * fx, -V.cv.height * fy); c.drawImage(tmp, 0, 0); c.setTransform(1, 0, 0, 1, 0, 0);
}
function draw() {
  const V = CD.View, c = V.ctx, s = cur.s, t = cur.t - (s.skip || 0) * (cur.M ? 1 : 0), lt = cur.M ? cur.t - (s.skip || 0) : cur.t;
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (cur.M) { frameCam(cur.M, s.cam ? s.cam(cur.M, cur.t, cur) : {x: cur.M.hero.x, y: cur.M.hero.y, fw: 300}); CD.M = cur.M; MS.draw(); }
  else if (s.map) drawMap(c, s, lt);
  else if (s.card) drawCard(c, s, lt);
  c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  if (cur.M) {                                               // cinematic vignette
    const g = c.createRadialGradient(V.w / 2, V.h / 2, Math.min(V.w, V.h) * 0.35, V.w / 2, V.h / 2, Math.max(V.w, V.h) * 0.75); g.addColorStop(0, 'rgba(22,18,20,0)'); g.addColorStop(1, 'rgba(22,18,20,0.38)'); c.fillStyle = g; c.fillRect(0, 0, V.w, V.h);
  }
  if (s.plate) (Array.isArray(s.plate) ? s.plate : [s.plate]).forEach(p => drawPlate(c, p, lt));
  if (s.logo) drawLogo(c, lt);
  if (s.flash && lt < 2.5 / FPS) { c.globalAlpha = lt < 1 / FPS ? 0.85 : 0.35; c.fillStyle = '#fff6d8'; c.fillRect(0, 0, V.w, V.h); c.globalAlpha = 1; }
  if (TR.fmt === 'yt') { const bar = Math.max(0, (V.h - V.w / 2) / 2); c.fillStyle = INKC; c.fillRect(0, 0, V.w, bar); c.fillRect(0, V.h - bar, V.w, bar); }
}

/* ---------------- public: render, grab, soundtrack ---------------- */
TR.reset = function () { TR.frame = -1; TR.idx = -1; TR.log = []; TR.last = {}; cur = null; };
TR.render = function (f) { if (f <= TR.frame) TR.reset(); while (TR.frame < f) step(); draw(); return TR.frame; };
TR.grab = (type, q) => CD.View.cv.toDataURL(type || 'image/jpeg', q || 0.95);
TR.cuts = () => SH.map(s => +s.t0.toFixed(3));

/* music: 120 BPM; drums, bass and a twangy lead, sections following the cut */
function music(ctx, out, dur) {
  const beat = 0.5, nb = Math.ceil(dur / beat), noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const env = (node, t, a, d, v) => { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(v, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const kick = t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); env(g, t, 0.004, 0.32, 0.9); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4); };
  const nz = (t, d, v, f, type) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; fl.type = type || 'highpass'; fl.frequency.value = f; env(g, t, 0.002, d, v); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05); };
  const snare = t => { nz(t, 0.18, 0.5, 1400, 'bandpass'); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1); env(g, t, 0.002, 0.12, 0.35); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2); };
  const hat = (t, v) => nz(t, 0.05, v || 0.12, 7000);
  const note = (t, f, d, v, type, bend) => { const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter(); o.type = type || 'sawtooth'; o.frequency.setValueAtTime(bend ? f * 0.94 : f, t); if (bend) o.frequency.exponentialRampToValueAtTime(f, t + 0.06); fl.type = 'lowpass'; fl.frequency.value = type === 'square' ? 1200 : 2600; env(g, t, 0.006, d, v); o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); };
  const boom = t => { kick(t); nz(t, 1.2, 0.6, 180, 'lowpass'); const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.4); env(g, t, 0.01, 1.4, 0.8); o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.5); };
  const A2 = 110, scale = [1, 1.189, 1.335, 1.498, 1.782, 2];      // A minor pentatonic-ish
  const bassLine = [0, 0, 2, 0, 3, 0, 2, 1], riff = [5, 4, 3, 4, 2, 3, 1, 0];
  const cuts = SH.map(s => s.t0), cardAt = t => SH.some(s => s.card && t >= s.t0 && t < s.t0 + s.d), mont = SH.find(s => s.montage), mt0 = mont ? mont.t0 : 1e9, end = SH[SH.length - 1].t0;
  boom(0); for (const s of SH) if (s.card) boom(s.t0);
  for (let b = 0; b < nb; b++) {
    const t = b * beat; if (t >= dur - 0.2) break; if (cardAt(t) && t > 0.1) { if (b % 2 === 0) note(t, A2 / 2, 0.9, 0.18, 'square'); continue; }
    if (t < 2.5) continue; const full = t >= 16 && t < end, hot = t >= mt0 && t < end;
    if (t >= end) { if (t === Math.ceil(end / beat) * beat) { boom(t); [1, 1.189, 1.498, 2].forEach(k => note(t, A2 * k, 3.4, 0.12, 'sawtooth')); } continue; }
    kick(t); if (full && b % 2 === 1) snare(t); hat(t + beat / 2, 0.1); if (full) hat(t, 0.06);
    if (hot) { snare(t + beat / 2); kick(t + beat / 2); for (let k = 1; k < 4; k++) hat(t + k * beat / 4, 0.08); }
    const bi = bassLine[b % 8]; note(t, A2 / 2 * scale[bi], 0.22, 0.32, 'square'); note(t + beat / 2, A2 / 2 * scale[bi], 0.18, 0.22, 'square');
    if (full && (b % 16) >= 8) note(t, A2 * 2 * scale[riff[b % 8]], 0.3, 0.1, 'sawtooth', true);
  }
  for (const c of cuts) if (c > 2.5 && !SH.find(s => s.t0 === c && (s.card || s.montage))) nz(c, 0.25, 0.2, 3000);   // a whoosh on every scene cut
}
TR.audioWav = async function (dur) {
  dur = dur || TR.duration + 0.5; const sr = 44100, ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15; comp.connect(ctx.destination);
  const mus = ctx.createGain(); mus.gain.value = 0.55; mus.connect(comp); const sfx = ctx.createGain(); sfx.gain.value = 0.85; sfx.connect(comp);
  music(ctx, mus, dur); for (const e of TR.log) CD.Sfx.renderInto(ctx, sfx, e[0] + 0.01, e[1]);
  const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, data = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true); data.setUint32(24, sr, true); data.setUint32(28, sr * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { data.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); data.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  const bytes = new Uint8Array(data.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin);
};

/* ---------------- live playback (no "render" in the hash) ---------------- */
CD.scenes.trailer = {
  enter: () => { CD.UI.hide(); CD.HUD.hide(); },
  update: () => { if (TR.render || !TR.playing) return; const f = Math.min(TR.frames - 1, Math.floor((performance.now() - TR.t0) / 1000 * FPS)); while (TR.frame < f) step(); if (f >= TR.frames - 1) { TR.playing = false; showPlay('Replay'); } },
  draw: () => { if (TR.render) return; if (TR.frame >= 0 && cur) draw(); }
};
function showPlay(label) {
  let b = document.getElementById('trPlay'); if (!b) { b = document.createElement('button'); b.id = 'trPlay'; b.className = 'b alt'; b.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;min-width:180px;min-height:56px;font:700 18px/1 ' + FONT + ';letter-spacing:.08em';
    b.onclick = () => { CD.Sfx.unlock(); b.style.display = 'none'; TR.reset(); TR.playing = true; TR.t0 = performance.now(); }; document.body.appendChild(b); }
  b.textContent = label; b.style.display = '';
}
CD.go('trailer');
if (!TR.render) showPlay('Play trailer');
})();
