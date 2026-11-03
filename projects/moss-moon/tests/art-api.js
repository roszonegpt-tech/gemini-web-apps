// Usage: node tests/art-api.js — checks the MM.art contract headless (loads tests/art-gallery.html).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, 'art-gallery.html') + '?view=icons');
  await p.waitForFunction(() => window.__galleryDone, null, { timeout: 15000 });
  const r = await p.evaluate(async () => {
    const A = MM.art, out = {}, ok = (k, v) => (out[k] = !!v);
    await A.whenReady();
    let cbFired = false; A.whenReady(() => { cbFired = true; });
    ok('ready', A.ready); ok('whenReady cb after ready', cbFired);
    ok('names', A.names().length > 200); ok('names(prefix)', A.names('tree_').every((n) => n.startsWith('tree_')));
    ok('has', A.has('tree_oak_0') && !A.has('nope'));
    const g = A.get('cottage_lush'); ok('get anim', g && g.frames === 4 && g.fps > 0);
    ok('tile variant', /^grass_grove_\d$/.test(A.tile('grass_grove', 12)) && A.tile('grass_grove', 12) === A.tile('grass_grove', 12));
    ok('tile spread', new Set([...Array(40)].map((_, i) => A.tile('water', i))).size === 4);
    ok('tile missing', A.tile('nope', 1) === null);
    ok('frameAt loop', A.frameAt('moonwell_restored', 0) === 0 && A.frameAt('moonwell_restored', 1 / 6 + 0.001) === 1);
    ok('frameAt once holds', A.frameAt('bramble_warden_windup_s', 99) === 2);
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const ctx = cv.getContext('2d');
    ok('draw missing is no-op', A.draw(ctx, 'nope', 0, 0) === false && A.draw(null, 'rock_0', 0, 0) === false);
    // anchor: rock_0 bottom-centre pixel must land at (32,40); flip keeps the anchor in place
    const f = A.get('rock_0');
    A.draw(ctx, 'rock_0', 32, 40);
    const px = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
    ok('anchor bottom', px(32, 40) > 0 && px(32, 41) === 0 && px(32, 40 - f.h) === 0);
    ctx.clearRect(0, 0, 64, 64); A.draw(ctx, 'rock_0', 32, 40, { flip: true, alpha: 0.5 });
    ok('flip + alpha', px(32, 40) > 0 && px(32, 40) < 255);
    ctx.clearRect(0, 0, 64, 64); ok('draw t', A.draw(ctx, 'lantern', 20, 30, { t: 0.4, scale: 2 }));
    return out;
  });
  const failed = Object.entries(r).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify({ checks: Object.keys(r).length, failed, errors: errs }));
  await b.close(); process.exit(failed.length || errs.length ? 1 : 0);
})();
