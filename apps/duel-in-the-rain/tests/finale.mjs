// Forces the final pass with a chosen ending and captures it in close-up.
// Usage: node tests/finale.mjs [sword|hair|neck] [outDir] [url]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const how = process.argv[2] || 'sword';
const out = process.argv[3] || '.';
const url = process.argv[4] || 'http://localhost:8765/index.html';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__duel && window.__duel.D.exch >= 1, null, { timeout: 120000, polling: 250 });
await page.evaluate((h) => { const d = window.__duel; d.D.forceHow = h; d.D.forceFinale = true; d.setCloseup(true); d.view.zoomT = 2.4; }, how);
await page.waitForFunction(() => /Stillness/.test(window.__duel.D.phase), null, { timeout: 60000, polling: 100 });
// real time
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${out}/${how}-${String(i).padStart(2, '0')}.png`, clip: { x: 0, y: 0, width: 740, height: 700 } });
  console.log(i, await page.evaluate(() => window.__duel.D.phase + ' | ' + window.__duel.D.log[0]));
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
