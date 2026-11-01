// Captures weather presets, the veranda view, Raw 3D, dither and a phone-width layout.
// Usage: node tests/views.mjs [outDir] [url]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const url = process.argv[3] || 'http://localhost:8765/index.html';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2000);
const shots = [
  ['storm', () => { __duel.setWeather('storm'); __duel.callLightning(true); }],
  ['dusk', () => { __duel.setWeather('dusk'); }],
  ['night-veranda', () => { __duel.setWeather('night'); __duel.setVeranda(true); }],
  ['drizzle-dither', () => { __duel.setVeranda(false); __duel.setWeather('drizzle'); document.querySelector('#tDither').click(); }],
  ['raw3d', () => { document.querySelector('#tDither').click(); __duel.setWeather('rain'); document.querySelector('#tRaw').click(); }],
];
for (const [name, fn] of shots) {
  await page.evaluate(fn);
  await page.waitForTimeout(name === 'storm' ? 250 : 5000);
  await page.screenshot({ path: `${out}/view-${name}.png` });
}
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
phone.on('pageerror', (e) => errors.push('phone: ' + e.message));
await phone.goto(url, { waitUntil: 'load' });
await phone.waitForTimeout(4000);
await phone.screenshot({ path: `${out}/view-phone.png` });
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log('phone horizontal overflow px:', overflow);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
