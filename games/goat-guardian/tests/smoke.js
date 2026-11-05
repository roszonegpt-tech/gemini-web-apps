// Headless smoke test: node tests/smoke.js (requires Playwright + Chromium).
// Starts a game, forces ram hits on a wolf, a bat and an alpha wolf, then autoplays and reports errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html'));
  await p.waitForTimeout(500);
  await p.keyboard.press('Space');
  await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      enemies.push({ type: i==1?'bat':'wolf', x: goat.x + 30, y: goat.y, vx: 0, vy: 0, state: 'stun', t: 5, hp: i==2?2:1, speed: 0, accel: 0, side: -1, anim: 0, alt: i==1?14:0, lastRam: -1, rot: 0, spin: 0, carry: null, flash: 0, phase: 0, alpha: i==2 });
      goat.fx = 1; goat.fy = 0; goat.cd = 0;
      tryRam();
      await new Promise(r => setTimeout(r, 900));
      out.push({ score, states: enemies.map(e => e.type + ':' + e.state + ':' + e.hp) });
      goat.x = FIELD_CX - 60; goat.y = FIELD_CY;
    }
    return out;
  });
  console.log(JSON.stringify(r));
  // run a long autoplay to check stability
  await p.evaluate(() => { window.__t0 = performance.now(); });
  for (let i = 0; i < 60; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(250); }
  console.log(JSON.stringify(await p.evaluate(() => ({ state, score, sheep: sheep.length, wave: wave.n, parts: particles.length }))));
  console.log('ERRORS', errs);
  await b.close();
})();
