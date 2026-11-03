// Screenshots the fill-screen layout on phone viewports: node tests/fill-shot.js [html] [outPrefix]
const { chromium, devices } = require('playwright'); const path = require('path');
(async () => {
  const file = path.resolve(process.argv[2] || 'index.html'), pre = process.argv[3] || path.join(__dirname, 'out/fill');
  const b = await chromium.launch(); const errs = [];
  for (const [name, dev] of [['portrait', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['landscape', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
    const c = await b.newContext(dev), p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + file); await p.waitForFunction(() => window.MM && MM.state && MM.state.current === 'logo', null, { timeout: 15000 }); await p.waitForTimeout(3500);
    await p.screenshot({ path: pre + '-' + name + '-logo.png' });
    await p.evaluate(() => MM.state.go('title')); await p.waitForTimeout(1500); await p.screenshot({ path: pre + '-' + name + '-title.png' });
    await p.evaluate(() => { MM.flow.resetFlags && MM.flow.resetFlags(); MM.game.newGame({ name: 'Hazel', startCampaign: true }); }); await p.waitForTimeout(2500); await p.screenshot({ path: pre + '-' + name + '-play.png' });
    const info = await p.evaluate(() => { const s = document.getElementById('scene').getBoundingClientRect(), st = document.getElementById('mm-stage').getBoundingClientRect(); return { vp: [innerWidth, innerHeight], stage: [Math.round(st.width), Math.round(st.height)], canvas: [Math.round(s.width), Math.round(s.height)], fill: document.documentElement.classList.contains('mm-fill') }; });
    console.log(name, JSON.stringify(info)); await c.close();
  }
  console.log(errs.length ? 'ERRORS ' + errs.slice(0, 3) : 'no page errors'); await b.close();
})();
