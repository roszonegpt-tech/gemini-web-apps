// Usage: node tests/art-gallery.js [outDir=tests] [scale=3] [views=all sheets + patches + scene]
// Renders tests/art-gallery.html headless and saves one PNG per view (tests/art-gallery-<view>.png).
// Fails (exit 1) on page errors, a missing atlas, or a sprite count of zero.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.resolve(process.argv[2] || 'tests'), scale = process.argv[3] || '3';
  const file = 'file://' + path.resolve(__dirname, 'art-gallery.html');
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1520, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(file + '?view=all'); await p.waitForFunction(() => window.__galleryDone, null, { timeout: 15000 });
  const info = await p.evaluate(() => ({ done: window.__galleryDone, sheets: Object.keys(window.MM_ART ? MM_ART.sheets : {}), names: MM.art.names().length }));
  const views = process.argv[4] ? process.argv[4].split(',') : [...info.sheets, 'patches', 'scene'];
  const shots = [];
  for (const v of views) {
    await p.goto(`${file}?view=${v}&scale=${scale}`);
    await p.waitForFunction(() => window.__galleryDone, null, { timeout: 15000 });
    const f = path.join(out, `art-gallery-${v}.png`);
    await p.locator('#g').screenshot({ path: f });
    shots.push(f);
  }
  console.log(JSON.stringify({ sprites: info.names, sheets: info.sheets, error: info.done.error, shots, errors: errs }, null, 1));
  await b.close();
  process.exit(errs.length || info.done.error || !info.names ? 1 : 0);
})();
