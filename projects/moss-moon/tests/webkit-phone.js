// WebKit (iPhone emulation) check: full-screen UI layers must be viewport-anchored (not confined to the 8:5 stage).
// node tests/webkit-phone.js [html] [out.png]
const { webkit, devices } = require('playwright'); const path = require('path');
(async () => {
  const file = path.resolve(process.argv[2] || 'index.html');
  const b = await webkit.launch(); const c = await b.newContext({ ...devices['iPhone 13'] }); const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + file); await p.waitForFunction(() => window.MM && MM.state && MM.state.current !== 'boot', null, { timeout: 20000 }); await p.waitForTimeout(1500);
  await p.evaluate(() => MM.state.go('title')); await p.waitForTimeout(1200);
  const r = await p.evaluate(() => { const s = document.querySelector('.mm-layer-screens'), b = s.getBoundingClientRect(), st = document.getElementById('scene').getBoundingClientRect(); return { vp: [innerWidth, innerHeight], screensLayer: [Math.round(b.width), Math.round(b.height)], stage: [Math.round(st.width), Math.round(st.height)], cls: document.getElementById('mm-ui').className }; });
  console.log(JSON.stringify(r), errs.slice(0, 3));
  await p.screenshot({ path: path.resolve(process.argv[3] || path.join(__dirname, 'out/webkit-title.png')) });
  const ok = Math.abs(r.screensLayer[0] - r.vp[0]) < 2 && Math.abs(r.screensLayer[1] - r.vp[1]) < 2 && !errs.length;
  console.log(ok ? 'PASS viewport-anchored layers' : 'FAIL layers confined to stage'); await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error('CRASH', e.message.slice(0, 300)); process.exit(2); });
