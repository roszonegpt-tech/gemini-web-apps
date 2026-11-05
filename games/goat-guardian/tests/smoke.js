// Headless smoke test for Get em Billy v0.12: node tests/smoke.js (needs Playwright + Chromium).
// Title -> Mode -> Players (2 keyboard players) -> escort, forces a ram and a bark, pens the herd,
// advances a mission, runs 4-player defend, triggers game over, checks 6-direction facing and
// adaptive resolution, starts and exits the attract-mode demo, and reports page errors.
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 480, height: 864 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const fail = (msg) => { console.log('FAIL', msg); process.exitCode = 1; };
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.waitForTimeout(800);
  let st = await p.evaluate(() => ({ state, W, H, PIX }));
  if (st.state !== 'TITLE') fail('not on title');
  await p.keyboard.press('Space');                 // PLAY -> story intro the first time
  st = await p.evaluate(() => state); if (st !== 'STORY') fail('story ' + st);
  await p.keyboard.press('Space');
  await p.keyboard.press('Backspace');             // skip
  st = await p.evaluate(() => ({ state, seen: settings.storySeen })); if (st.state !== 'MODE' || !st.seen) fail('story skip ' + JSON.stringify(st));
  await p.keyboard.press('Space');                 // ESCORT -> map select
  st = await p.evaluate(() => ({ state, n: screenItems().length })); if (st.state !== 'MAPS' || st.n !== 11) fail('maps ' + JSON.stringify(st));
  await p.keyboard.press('Space');                 // map 1 (joins P1 = kbL)
  st = await p.evaluate(() => ({ state, n: players.length })); if (st.state !== 'PLAYERS' || st.n !== 1) fail('players ' + JSON.stringify(st));
  await p.keyboard.press('h');                     // add a CPU helper
  st = await p.evaluate(() => players.filter(q => q.cpu).length); if (st !== 1) fail('cpu add ' + st);
  await p.keyboard.press('n');                     // remove it
  st = await p.evaluate(() => players.filter(q => q.cpu).length); if (st !== 0) fail('cpu remove ' + st);
  await p.keyboard.press('Enter');                 // P2 joins
  await p.keyboard.press('ArrowRight');            // P2 swaps character
  await p.keyboard.press('Space'); await p.keyboard.press('Enter'); // both ready
  await p.waitForTimeout(2000);
  st = await p.evaluate(() => ({ state, mode, kinds: players.map(q => q.kind) }));
  if (st.state !== 'PLAYING' || st.mode !== 'escort' || st.kinds.join() !== 'goat,goat') fail('start ' + JSON.stringify(st));
  const dirs = await p.evaluate(() => [[0, -1], [0, 1], [1, -0.6], [1, 0.6], [-1, -0.6], [-1, 0.6]].map(v => faceDir(v[0], v[1]) + (v[0] < 0 ? 'L' : '')));
  if (new Set(dirs).size !== 6) fail('6 directions ' + dirs);
  const combat = await p.evaluate(async () => {
    const g = players[0]; players[1].kind = 'dog'; const d = players[1];
    const mk = (x, y) => ({ type: 'wolf', x, y, vx: 0, vy: 0, fx: -1, fy: 0, state: 'hunt', t: 0, hp: 1, fear: 0, speed: 0, accel: 0, anim: 0, alt: 0, hits: {}, carry: null, flash: 0, phase: 0, alpha: false });
    const s0 = score;
    const w1 = mk(g.x + 18, g.y); enemies.push(w1);
    g.fx = 1; g.fy = 0; g.cd = 0; tryRam(g);
    const w2 = mk(d.x + 10, d.y); enemies.push(w2);
    d.cd = 0; tryBark(d);
    await new Promise(r => setTimeout(r, 900));
    return { gained: score - s0, rammed: !enemies.includes(w1) || w1.state === 'launched', scared: w2.state === 'flee' || w2.thenFlee === true };
  });
  if (combat.gained < 2 || !combat.rammed || !combat.scared) fail('combat ' + JSON.stringify(combat));
  await p.keyboard.press('p');
  st = await p.evaluate(() => paused); if (!st) fail('pause');
  await p.keyboard.press('Space');
  st = await p.evaluate(() => paused); if (st) fail('resume');
  // pause menu: options sub-view, controls, exit confirmation (NO), restart confirmation (NO)
  const box = await p.evaluate(() => { const r = view.getBoundingClientRect(); return { x: r.left + (W - 7) / W * r.width, y: r.top + 7 / H * r.height }; });
  await p.mouse.click(box.x, box.y);               // on-screen pause button
  st = await p.evaluate(() => ({ paused, pauseView })); if (!st.paused || st.pauseView !== 'main') fail('pause button ' + JSON.stringify(st));
  await p.keyboard.press('s'); await p.keyboard.press('s'); await p.keyboard.press('Space');
  st = await p.evaluate(() => ({ pauseView, n: screenItems().length })); if (st.pauseView !== 'options' || st.n !== 11) fail('pause options ' + JSON.stringify(st));
  const music0 = await p.evaluate(() => settings.music);
  await p.keyboard.press('s'); await p.keyboard.press('d');
  st = await p.evaluate(() => settings.music); if (st === music0) fail('options toggle');
  await p.keyboard.press('a');
  await p.keyboard.press('Escape');
  st = await p.evaluate(() => ({ paused, pauseView, c: ui.cursor })); if (!st.paused || st.pauseView !== 'main' || st.c !== 2) fail('options back ' + JSON.stringify(st));
  await p.keyboard.press('s'); await p.keyboard.press('Space');
  st = await p.evaluate(() => pauseView); if (st !== 'controls') fail('controls ' + st);
  await p.keyboard.press('Escape');
  await p.keyboard.press('s'); await p.keyboard.press('s'); await p.keyboard.press('Space');   // EXIT TO TITLE -> confirm
  st = await p.evaluate(() => ({ pauseView, c: ui.cursor })); if (st.pauseView !== 'exit' || st.c !== 1) fail('exit confirm ' + JSON.stringify(st));
  await p.keyboard.press('Space');                                 // NO
  st = await p.evaluate(() => ({ state, paused, pauseView })); if (st.state !== 'PLAYING' || st.pauseView !== 'main') fail('exit cancel ' + JSON.stringify(st));
  await p.keyboard.press('Escape');                                // resume
  st = await p.evaluate(() => paused); if (st) fail('esc resume');
  await p.evaluate(() => { for (const s of sheep) { s.x = world.goal.x; s.y = world.goal.y; } enemies.length = 0; });
  await p.waitForTimeout(2600);                    // includes the slow-motion finish
  st = await p.evaluate(() => state); if (st !== 'RESULTS') fail('results ' + st);
  await p.keyboard.press('Space');                 // NEXT MISSION (loads map 2)
  await p.waitForTimeout(1200);
  st = await p.evaluate(() => ({ state, m: mission.n, map: mission.map, h: world.h })); if (st.state !== 'PLAYING' || st.m !== 2 || st.map !== 1 || st.h !== 1400) fail('next mission ' + JSON.stringify(st));
  await p.evaluate(() => { mode = 'defend'; selMap.defend = 4; enterPlayers('kbL'); joinPlayer('pad0'); joinCPU(); players.forEach(q => q.ready = true); });
  await p.waitForTimeout(1800);
  st = await p.evaluate(() => ({ state, mode, n: players.length, cpu: players.filter(q => q.cpu).length, map: wave.map, pillars: world.pillars.length }));
  if (st.state !== 'PLAYING' || st.mode !== 'defend' || st.n !== 4 || st.cpu !== 1 || st.map !== 4) fail('defend 4p + cpu ' + JSON.stringify(st));
  await p.waitForTimeout(2000);
  st = await p.evaluate(() => { const c = players.find(q => q.cpu); return len(c.vx, c.vy); });
  if (!(st > 1)) fail('cpu helper not moving ' + st);
  await p.evaluate(() => { sheep.length = 0; enemies.forEach(e => e.carry = null); });
  await p.waitForTimeout(2300);
  st = await p.evaluate(() => state); if (st !== 'GAMEOVER') fail('game over ' + st);
  await p.keyboard.press('s'); await p.keyboard.press('s'); await p.keyboard.press('s'); await p.keyboard.press('Space'); // TITLE
  st = await p.evaluate(() => state); if (st !== 'TITLE') fail('back to title ' + st);
  await p.evaluate(() => { ui.cursor = 5; });
  await p.keyboard.press('Space');                 // EXIT
  st = await p.evaluate(() => state); if (st !== 'BYE') fail('exit screen ' + st);
  await p.keyboard.press('Space');
  st = await p.evaluate(() => state); if (st !== 'TITLE') fail('bye -> title ' + st);
  // attract-mode demo: plays itself with AI shepherds, any key returns to the title
  await p.evaluate(() => { ui.cursor = 1; });
  await p.keyboard.press('Space');                 // WATCH DEMO
  await p.waitForTimeout(3000);
  st = await p.evaluate(() => ({ on: showcase.on, state, n: players.length, ai: players.every(q => q.dev.startsWith('ai')) }));
  if (!st.on || st.state !== 'PLAYING' || !st.ai) fail('demo ' + JSON.stringify(st));
  await p.keyboard.press('Space');
  st = await p.evaluate(() => ({ on: showcase.on, state, real: players.every(q => q.cpu || !q.dev.startsWith('ai')) }));
  if (st.on || st.state !== 'TITLE' || !st.real) fail('demo exit ' + JSON.stringify(st));
  // v0.7 features: abilities, upgrades, medals, every mode, editor, accessibility
  const feat = await p.evaluate(async () => {
    const out = {};
    const go = async (m, extra) => { mode = m; if (extra) extra(); enterPlayers('kbL'); players.forEach(q => q.ready = true); await new Promise(r => setTimeout(r, 2600)); return state; };
    out.versus = await go('versus', () => { selMap.versus = 1; });
    out.versusSides = players.some(q => q.kind === 'wolf') && players.some(q => q.kind !== 'wolf');
    versus.t = 0.05; await new Promise(r => setTimeout(r, 400));
    out.versusOver = state + ':' + versus.winner;
    toTitle();
    out.daily = await go('daily'); out.dailyName = mission.name;
    const g = players.find(q => q.kind === 'goat') || players[0];
    g.kind = 'goat'; g.cd2 = 0; spawnEnemy(4, { type: 'fox' }); const fx = enemies[enemies.length - 1]; fx.state = 'hunt'; fx.x = g.x + 10; fx.y = g.y;
    stomp(g); out.stomp = fx.state;
    const d = players.find(q => q !== g); if (d) { d.kind = 'dog'; d.cd2 = 0; whistle(d); out.whistle = sheep.some(sh => sh.call); }
    bells = 20; const before = upg.ram; shopItems(() => {})[0].select(); out.upgrade = upg.ram - before; out.bellsLeft = bells;
    toTitle();
    out.endless = await go('endless'); out.stage = endless.stage;
    toTitle();
    out.medal = awardMedals('escort', 0, 7); out.total = totalMedals();
    out.unlocked = skinUnlocked('goat', 1);
    openEditor(); out.editor = state; out.route = !!edRoute();
    const code = edEncode(); out.codeOk = edDecode(code); out.codeLen = code.length;
    toTitle();
    settings.cb = true; buildRemap(0); out.cbRemap = !!remapTable; settings.cb = false; remapQ = -1;
    return out;
  });
  if (feat.versus !== 'PLAYING' || !feat.versusSides || feat.versusOver !== 'GAMEOVER:SHEPHERDS') fail('versus ' + JSON.stringify(feat));
  if (feat.daily !== 'PLAYING' || feat.endless !== 'PLAYING' || feat.stage !== 1) fail('daily/endless ' + JSON.stringify(feat));
  if (feat.stomp !== 'stun' || feat.whistle === false || feat.upgrade !== 1 || feat.bellsLeft !== 14) fail('abilities/shop ' + JSON.stringify(feat));
  if (!feat.medal || feat.total < 3 || !feat.unlocked) fail('medals ' + JSON.stringify(feat));
  if (feat.editor !== 'EDITOR' || !feat.route || !feat.codeOk || !feat.cbRemap) fail('editor/cb ' + JSON.stringify(feat));
  // v0.8: birds and the trailer
  const v8 = await p.evaluate(async () => {
    spawnFlock(false); spawnFlock(true);
    const n = birds.length;
    startTrailer();
    await new Promise(r => setTimeout(r, 4500));
    const mid = { on: showcase.on, trailer: showcase.trailer, i: showcase.i, W: W };
    endShowcase();
    return { n, mid, after: state, W2: W };
  });
  if (v8.n < 4 || !v8.mid.on || !v8.mid.trailer || v8.mid.i < 1 || v8.after !== 'TITLE') fail('birds/trailer ' + JSON.stringify(v8));
  // v0.9: goat + farm dog breeds, 8-direction gallop sprites, dog skills
  const v9 = await p.evaluate(async () => {
    const out = { goats: GOAT_BREEDS.length, dogs: DOG_BREEDS.length };
    const D = ['E', 'SE', 'NE', 'S', 'N'];
    const full = (st) => D.every(d => st[d].length === 4 && st.run[d].length === 4 && st.idle[d].length >= 2 && st.attack[d].length === 4 && st.jump[d].length === 3);
    out.sets = DOG_BREEDS.every(b => { const st = labSet(b.unit, {}); return full(st) && st.pose.sit.E && st.pose.lie.E && st.pose.bite.E && st.pose.sniff.E.length === 4; })
      && GOAT_BREEDS.every((b, i) => full(goatSetCached(i))) && full(SP.wolf) && full(SP.fox) && full(SP.boss) && full(SP.bat) && full(SP.hawk);
    out.leftArt = SP.dog.E[0].l !== SP.dog.E[0].r;     // the lab draws W, it is not a mirror
    const px = (sp) => { const d = sp.r.getContext('2d').getImageData(0, 0, sp.w, sp.h).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3]) >>> 0; return h; };
    out.items = ['hat', 'hair', 'outfit'].every(k => px(labSet('bcollie', { [k]: 1 }).E[0]) !== px(SP.dog.E[0])) && px(labSet('bcollie', { acc: [2] }).S[0]) !== px(SP.dog.S[0])
      && px(labSet('bcollie', { coat: 1 }).E[0]) !== px(SP.dog.E[0]);
    out.sanitize = JSON.stringify(normLabLook({ hat: 99, acc: [7, 'x', 1, 1], col: { hat: -2 }, coat: 'z' })) === JSON.stringify(normLabLook({ acc: [1] }));
    remapQ = -1; buildRemap(0.8); out.remap = LAB_EXTRA.size > 20 && [...LAB_EXTRA.keys()].every(k => remapTable.has(k)); remapQ = -1; buildRemap(dayProgress);
    const vis = (sp) => sprBox(sp).h;
    out.taller = Math.min(...GOAT_BREEDS.map((b, i) => vis(goatSetCached(i).E[0]))) > Math.max(...DOG_BREEDS.map(b => vis(labSet(b.unit, {}).E[0])));
    // v0.12: Billy's ram frames, stomp as an upgrade, screen-crack smash, his theme
    out.ram = D.slice(0, 3).every(d => SP.goat.ram[d].length === 4) && SP.goat.ram.S.length === 4;
    out.billyTheme = !!THEMES.billy && BILLY_TRAILER.length >= 10;
    out.locked = skinUnlocked('dog', 9);
    out.boss = SP.boss.E[0].h >= 18 && SP.boss.run.S.length === 4 && SP.boss.N.length === 4;
    progress.medals.escort = progress.medals.escort.map(() => 7); progress.medals.defend = progress.medals.defend.map(() => 7);
    mode = 'defend'; enterPlayers('kbL'); players[0].kind = 'dog'; players.forEach(q => q.ready = true);
    await new Promise(r => setTimeout(r, 2600));
    wave.toSpawn = 0; enemies = [];
    const d = players[0];
    const mk = (x, y, o) => Object.assign({ type: 'wolf', x, y, vx: 0, vy: 0, fx: -1, fy: 0, state: 'hunt', t: 0, hp: 1, fear: 0, speed: 0, accel: 0, anim: 0, alt: 0, hits: {}, carry: null, flash: 0, phase: 0, alpha: false }, o || {});
    const trial = async (skin, setup) => { enemies = []; d.skin = skin; d.cd2 = 0; d.fx = 1; d.fy = 0; d.dashT = 0; const r = setup(); playerAbility(d); await new Promise(z => setTimeout(z, 500)); return r(); };
    out.corgi = await trial(1, () => { const w = mk(d.x + 20, d.y); enemies.push(w); return () => w.state; });
    out.pyrenees = await trial(9, () => { const w = mk(d.x + 60, d.y); enemies.push(w); return () => w.state; });
    out.carry = await trial(7, () => { const s0 = sheep[0]; s0.x = d.x + 5; s0.y = d.y; return () => !!d.carry && !sheep.includes(s0); });
    d.cd2 = 0; playerAbility(d); out.drop = !d.carry;
    out.ratter = (() => { d.skin = 6; d.cd = 0; enemies = [mk(d.x + 12, d.y, { type: 'fox' })]; tryBark(d); return enemies[0].state; })();
    d.skin = 0; d.vx = 0; d.vy = 0; d.actT = 0; d.dashT = 0; d.idleT = 3; out.sit = actorSprite(d).spr === skinSet('dog', 0).pose.sit[faceDir8(d.fx, d.fy)];
    // stomp is locked until bought; buying it in the shop unlocks it
    { const g = players[0]; g.kind = 'goat'; enemies = [mk(g.x + 10, g.y)]; g.cd2 = 0; resetUpgrades(); playerAbility(g); out.stompLocked = enemies[0].state === 'hunt';
      bells = 20; shopItems(() => {}).find(i => i.label.startsWith('STOMP')).select(); g.cd2 = 0; playerAbility(g); out.stompBought = upg.stomp === 1 && enemies[0].state === 'stun';
      // forced smash: the rammed wolf leaves the field and sticks to the screen
      enemies = []; splats = []; showcase.on = true; showcase.forceCrack = true;
      const w = mk(g.x + 14, g.y); enemies.push(w); g.fx = 1; g.fy = 0; g.cd = 0; g.ramT = 0; tryRam(g);
      await new Promise(z => setTimeout(z, 200)); showcase.on = false; showcase.forceCrack = false;
      out.splat = splats.length === 1 && !enemies.includes(w);
      await new Promise(z => setTimeout(z, 600)); out.cracked = splats.length === 1 && splats[0].hit && splats[0].lines.length > 10; }
    toTitle();
    // v0.10 style screen: open from player select, change the hat, saved per animal kind
    mode = 'defend'; enterPlayers('kbL'); players[0].kind = 'dog'; players[0].look = rememberedLook('dog');
    openStyle(players[0]); out.styleState = state;
    const its = screenItems(); const hatRow = its.findIndex(i => i.label === 'HAT'); its[hatRow].change(1);
    out.styleSaved = settings.looks.dog && settings.looks.dog.hat === 1 && players[0].look.hat === 1;
    out.styleRows = screenItems().length;
    screenBack(); out.styleBack = state;
    settings.looks = {}; saveSettings();
    toTitle();
    return out;
  });
  if (!v9.ram || !v9.billyTheme || !v9.stompLocked || !v9.stompBought || !v9.splat || !v9.cracked) fail('billy ' + JSON.stringify(v9));
  if (v9.styleState !== 'STYLE' || !v9.styleSaved || v9.styleRows < 12 || v9.styleBack !== 'PLAYERS') fail('style ' + JSON.stringify(v9));
  if (v9.goats !== 12 || v9.dogs !== 10 || !v9.sets || !v9.leftArt || !v9.items || !v9.sanitize || !v9.remap || v9.locked || !v9.taller || !v9.boss || v9.gaitFlips) fail('breeds ' + JSON.stringify(v9));
  if (v9.corgi !== 'stun' || v9.pyrenees !== 'flee' || !v9.carry || !v9.drop || v9.ratter !== 'launched' || !v9.sit) fail('dog skills ' + JSON.stringify(v9));
  const wasFs = await p.evaluate(() => isFs());
  await p.evaluate(() => exitFs());
  await p.waitForTimeout(300);
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.waitForTimeout(300);
  st = await p.evaluate(() => ({ W, H, PIX, vw: view.width, vh: view.height }));
  if (st.W < 300 || st.vw < 1200) fail('landscape fill ' + JSON.stringify(st));
  if (errs.length) fail('page errors: ' + errs.join(' | '));
  console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE OK', JSON.stringify(st), 'fullscreenOnPlay=' + wasFs);
  await b.close();
})();
