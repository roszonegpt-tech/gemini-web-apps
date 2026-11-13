/* node tests/crop.cjs in.png out.png x y w h  - crop a screenshot (debug helper) */
const { chromium } = require('playwright'), fs = require('fs');
(async () => { const [i, o, x, y, w, h] = process.argv.slice(2); const b = await chromium.launch(), pg = await b.newPage({viewport: {width: +w, height: +h}});
  await pg.setContent('<body style="margin:0;overflow:hidden"><img style="position:absolute;left:-' + x + 'px;top:-' + y + 'px" src="data:image/png;base64,' + fs.readFileSync(i).toString('base64') + '">'); await pg.screenshot({path: o}); await b.close(); })();
