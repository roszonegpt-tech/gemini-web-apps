// Smoke test: loads the diorama in headless Chromium, checks for console errors,
// lets the duel run for a while and saves screenshots.
// Usage: serve the project root (e.g. `python3 -m http.server 8765`), then
//   node tests/smoke.mjs [url] [outDir] [seconds]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:8765/index.html';
const out = process.argv[3] || '.';
const secs = +(process.argv[4] || 8);
const setup = process.argv[5] || ''; // JS run in the page after load, e.g. "__duel.setCloseup(true)"

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
if (setup) await page.evaluate(setup);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/shot-start.png` });
for (let i = 1; i <= Math.ceil(secs / 4); i++) {
  await page.evaluate(() => { if (window.__duel) window.__duel.settings.fast = true; });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/shot-${i}.png` });
  const st = await page.evaluate(() => window.__duel && ({ bout: window.__duel.D.bout, phase: window.__duel.D.phase, log: window.__duel.D.log[0], exch: window.__duel.D.exch }));
  console.log('t+' + i * 4, JSON.stringify(st));
}
console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
