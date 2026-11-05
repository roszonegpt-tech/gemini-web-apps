// Headless smoke test for Goat Guardian v0.6: node tests/smoke.js (needs Playwright + Chromium).
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
  await p.keyboard.press('Space');                 // PLAY
  st = await p.evaluate(() => state); if (st !== 'MODE') fail('mode screen ' + st);
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
  st = await p.evaluate(() => ({ pauseView, n: screenItems().length })); if (st.pauseView !== 'options' || st.n !== 5) fail('pause options ' + JSON.stringify(st));
  const shake0 = await p.evaluate(() => settings.shake);
  await p.keyboard.press('s'); await p.keyboard.press('d');
  st = await p.evaluate(() => settings.shake); if (st === shake0) fail('options toggle');
  await p.keyboard.press('a');
  await p.keyboard.press('Escape');
  st = await p.evaluate(() => ({ paused, pauseView, c: ui.cursor })); if (!st.paused || st.pauseView !== 'main' || st.c !== 2) fail('options back ' + JSON.stringify(st));
  await p.keyboard.press('s'); await p.keyboard.press('Space');
  st = await p.evaluate(() => pauseView); if (st !== 'controls') fail('controls ' + st);
  await p.keyboard.press('Escape');
  await p.keyboard.press('s'); await p.keyboard.press('Space');   // EXIT TO TITLE -> confirm
  st = await p.evaluate(() => ({ pauseView, c: ui.cursor })); if (st.pauseView !== 'exit' || st.c !== 1) fail('exit confirm ' + JSON.stringify(st));
  await p.keyboard.press('Space');                                 // NO
  st = await p.evaluate(() => ({ state, paused, pauseView })); if (st.state !== 'PLAYING' || st.pauseView !== 'main') fail('exit cancel ' + JSON.stringify(st));
  await p.keyboard.press('Escape');                                // resume
  st = await p.evaluate(() => paused); if (st) fail('esc resume');
  await p.evaluate(() => { for (const s of sheep) { s.x = world.goal.x; s.y = world.goal.y; } enemies.length = 0; });
  await p.waitForTimeout(1200);
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
  await p.evaluate(() => { ui.cursor = 4; });
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
