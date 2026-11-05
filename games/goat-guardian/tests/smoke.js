// Headless smoke test for Goat Guardian v0.2: node tests/smoke.js (needs Playwright + Chromium).
// Joins two keyboard players, plays an escort mission, forces a ram and a bark, pens the herd,
// advances a mission, runs 4-player defend, triggers game over, and reports page errors.
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 480, height: 864 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.waitForTimeout(800);
  await p.keyboard.press('Space'); await p.keyboard.press('Enter');
  await p.keyboard.press('Space'); await p.keyboard.press('Enter');
  await p.waitForTimeout(1500);
  const fail = (msg) => { console.log('FAIL', msg); process.exitCode = 1; };
  let st = await p.evaluate(() => ({ state, mode, n: players.length }));
  if (st.state !== 'PLAYING' || st.mode !== 'escort' || st.n !== 2) fail('lobby start ' + JSON.stringify(st));
  const combat = await p.evaluate(async () => {
    const g = players[0], d = players[1];
    const mk = (x, y) => ({ type: 'wolf', x, y, vx: 0, vy: 0, state: 'hunt', t: 0, hp: 1, fear: 0, speed: 0, accel: 0, side: -1, anim: 0, alt: 0, hits: {}, carry: null, flash: 0, phase: 0, alpha: false });
    const s0 = score;
    const w1 = mk(g.x + 18, g.y); enemies.push(w1);
    g.fx = 1; g.fy = 0; g.cd = 0; tryRam(g);
    const w2 = mk(d.x + 10, d.y); enemies.push(w2);
    d.cd = 0; tryBark(d);
    await new Promise(r => setTimeout(r, 900));
    return { gained: score - s0, rammed: !enemies.includes(w1) || w1.state === 'launched', scared: w2.state === 'flee' || w2.thenFlee === true };
  });
  if (combat.gained < 2 || !combat.rammed || !combat.scared) fail('combat ' + JSON.stringify(combat));
  await p.evaluate(() => { for (const s of sheep) { s.x = world.goal.x; s.y = world.goal.y; } enemies.length = 0; });
  await p.waitForTimeout(800);
  st = await p.evaluate(() => ({ state }));
  if (st.state !== 'RESULTS') fail('mission did not complete');
  await p.waitForTimeout(1300);
  await p.keyboard.press('Space');
  await p.waitForTimeout(500);
  st = await p.evaluate(() => ({ state, m: mission.n }));
  if (st.state !== 'PLAYING' || st.m !== 2) fail('next mission ' + JSON.stringify(st));
  await p.evaluate(() => { toMenu(); mode = 'defend'; joinPlayer('pad0'); joinPlayer('pad1'); players.forEach(q => q.ready = true); });
  await p.waitForTimeout(4000);
  st = await p.evaluate(() => ({ state, mode, n: players.length }));
  if (st.state !== 'PLAYING' || st.mode !== 'defend' || st.n !== 4) fail('defend 4p ' + JSON.stringify(st));
  await p.evaluate(() => { sheep.length = 0; enemies.forEach(e => e.carry = null); });
  await p.waitForTimeout(1800);
  st = await p.evaluate(() => ({ state }));
  if (st.state !== 'GAMEOVER') fail('game over not reached');
  if (errs.length) fail('page errors: ' + errs.join(' | '));
  console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE OK');
  await b.close();
})();
