/* node tests/shot.cjs <page path> <out.png> [width] [height] [waitMs] [js to evaluate first] */
const { chromium } = require('playwright'), serve = require('./serve.cjs');
(async () => {
  const [page, out, w, h, wait, js] = process.argv.slice(2); const s = await serve(0), b = await chromium.launch();
  const pg = await b.newPage({viewport: {width: +w || 1280, height: +h || 800}, deviceScaleFactor: 1});
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text()); }); pg.on('pageerror', e => console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')));
  await pg.goto('http://localhost:' + s.address().port + '/' + page); if (js) console.log('eval:', JSON.stringify(await pg.evaluate(js)));
  await pg.waitForTimeout(+wait || 500); await pg.screenshot({path: out, fullPage: !h}); await b.close(); s.close();
})();
