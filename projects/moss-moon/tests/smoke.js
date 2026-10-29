// Usage: node tests/smoke.js [path-to-html]  — loads page headless, reports console errors and runs a few frames.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = path.resolve(process.argv[2] || 'index.html');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + file); await p.waitForTimeout(1500);
  await p.keyboard.down('d'); await p.waitForTimeout(600); await p.keyboard.up('d');
  const st = await p.evaluate(() => window.__witchDemo && window.__witchDemo.getState && Object.keys(window.__witchDemo.getState()).length);
  await p.screenshot({ path: process.argv[3] || 'tests/smoke.png' });
  console.log(JSON.stringify({ file, stateKeys: st, errors: errs }));
  await b.close(); process.exit(errs.length ? 1 : 0);
})();
