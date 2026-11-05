// Records the in-game trailer (startTrailer) at 1920x1080 and logs real scene-cut times.
// Usage: node tools/trailer/record.js [outDir] [main|billy]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || 'build/trailer');
const WHICH = process.argv[3] || 'main';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage();
  const t0 = Date.now();
  const marks = [];
  await p.exposeFunction('__trailerMark', (id) => { marks.push({ id, t: (Date.now() - t0) / 1000 }); });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../index.html'));
  await p.evaluate(() => { settings.fullscreen = false; settings.music = false; settings.storySeen = true; });
  await p.waitForTimeout(2500);
  await p.evaluate((w) => startTrailer(w === 'billy' ? 'billy' : ''), WHICH);
  const fpsSamples = [];
  for (let i = 0; i < 90; i++) {
    await p.waitForTimeout(1000);
    const st = await p.evaluate(() => ({ on: showcase.on, i: showcase.i, fr: performance.now() }));
    if (!st.on) break;
  }
  await p.waitForTimeout(500);
  console.log(JSON.stringify(marks));
  console.log('ERR', errs);
  await ctx.close();
  fs.writeFileSync(path.join(OUT, 'trailer_marks.json'), JSON.stringify(marks));
  const vid = await p.video().path();
  fs.renameSync(vid, path.join(OUT, 'trailer_raw.webm'));
  await b.close();
})();
