/* Scripted run for debugging: node tests/drive.cjs <out dir> <width> <height> then steps as "js:<code>" | "wait:<ms>" | "shot:<name>" | "key:<Key>" | "hold:<Key>:<ms>".
   Example: node tests/drive.cjs /tmp/out 1280 760 "js:CD.UI.newGame()" wait:300 shot:pick */
const { chromium } = require('playwright'), serve = require('./serve.cjs');
(async () => {
  const [out, w, h, ...steps] = process.argv.slice(2); const s = await serve(0), b = await chromium.launch();
  const pg = await b.newPage({viewport: {width: +w, height: +h}, deviceScaleFactor: 1, hasTouch: process.env.TOUCH === '1'});
  let errs = 0; pg.on('console', m => { if (m.type() === 'error') { errs++; console.log('[console.error]', m.text().slice(0, 600)); } }); pg.on('pageerror', e => { errs++; console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(1, 5).join(' | ')); });
  await pg.goto('http://localhost:' + s.address().port + '/' + (process.env.PAGE || 'index.html')); await pg.waitForTimeout(400);
  for (const st of steps) { const i = st.indexOf(':'), k = st.slice(0, i), v = st.slice(i + 1);
    if (k === 'js') { const r = await pg.evaluate(v).catch(e => 'EVAL ERROR ' + e.message); if (r !== undefined && r !== null) console.log('=>', typeof r === 'string' ? r : JSON.stringify(r)); }
    else if (k === 'wait') await pg.waitForTimeout(+v);
    else if (k === 'shot') await pg.screenshot({path: out + '/' + v + '.png'});
    else if (k === 'key') await pg.keyboard.press(v);
    else if (k === 'hold') { const [key, ms] = v.split(':'); await pg.keyboard.down(key); await pg.waitForTimeout(+ms); await pg.keyboard.up(key); }
    else if (k === 'click') { const [x, y] = v.split(','); await pg.mouse.click(+x, +y); } }
  console.log('errors:', errs); await b.close(); s.close();
})();
