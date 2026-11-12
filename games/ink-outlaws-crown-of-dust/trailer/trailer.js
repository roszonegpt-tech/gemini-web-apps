/* Crown of Dust - trailer shot list (trailer/trailer.js). Engine: trailer/director.js.
   58 s, 48 shots on a 120 BPM grid; #yt 1920x1080, #tt 1080x1920; render with tests/render_trailer.cjs. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, E = CD.Ent, C = CD.Combat, W = CD.World, MS = CD.Mission, I = CD.Input;
const F = window.FILM, TR = F.TR, SH = F.SH, shot = F.shot, follow = F.follow, stage = F.stage, clearAt = F.clearAt, foe = F.foe, pal = F.pal, ring = F.ring, face = F.face, duel = F.duel,
  hold = F.hold, stick = F.stick, AX = F.AX, AY = F.AY, DT = F.DT;
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

TR.finalize('Play trailer');
})();
