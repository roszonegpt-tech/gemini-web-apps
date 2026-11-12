/* Plays one mission with the autopilot and reports the result.
   node tests/mission.cjs <territory id> [steps=6] [shot dir] [hero] [timeout s]  e.g. node tests/mission.cjs ford 6 /tmp/out */
const { chromium } = require('playwright'), serve = require('./serve.cjs'), fs = require('fs'), path = require('path');
(async () => {
  const [terr, steps, out, hero, to] = process.argv.slice(2); const s = await serve(0), b = await chromium.launch();
  const pg = await b.newPage({viewport: {width: 1280, height: 760}}); let errs = 0;
  pg.on('console', m => { if (m.type() === 'error') { errs++; console.log('[console.error]', m.text().slice(0, 500)); } }); pg.on('pageerror', e => { errs++; console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(1, 4).join(' | ')); });
  await pg.goto('http://localhost:' + s.address().port + '/index.html' + (process.env.STRONG ? '#strong' : '')); await pg.addScriptTag({content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8')});
  await pg.evaluate(([terr, steps, hero]) => { CD.Save.wipe(); CD.Save.settings.sound = false; CD.Camp.fresh(hero || 'harrow'); CD.G.roster = ['kit', 'pike', 'abel']; CD.G.posse = ['kit', 'pike']; CD.G.tut = 1;
    if (location.hash === '#strong') { CD.G.bld = {saloon: 4, smithy: 3, doc: 3, tower: 4, powder: 3, stable: 1}; CD.G.roster = ['abel', 'jory', 'wren', 'tobias', 'holloway', 'maren']; CD.G.posse = CD.G.roster.slice(); CD.G.weapons = ['rifle', 'greatsword']; CD.G.armory.rifle = CD.G.armory.greatsword = 1; }
    const t = terr.indexOf('defend:') === 0 ? null : CD.Data.terrById[terr]; window.RES = null;
    const spec = t ? CD.Camp.specFor(t) : CD.Camp.defendSpec(CD.Data.terrById.gulch, terr.split(':')[1]); if (!t && terr.split(':')[2]) spec.tier = +terr.split(':')[2];
    CD.Mission.start(spec, r => { window.RES = r; CD.go('title'); }); CD.go('mission'); CD.steps = +steps || 6; window.startBot(); }, [terr, steps, hero]);
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < (+to || 150) * 1000) { await pg.waitForTimeout(3000); const r = await pg.evaluate(() => window.RES ? {done: window.RES} : CD.M ? {t: Math.round(CD.M.t), obj: CD.Mission.objective(CD.M).txt, en: CD.M.enemyCount(), hx: Math.round(CD.M.hero.x), hy: Math.round(CD.M.hero.y), ms: +CD.frameMs.toFixed(1), kills: CD.M.kills, state: CD.M.state} : {none: 1});
    if (out && (n++ % 4 === 1)) await pg.screenshot({path: out + '/' + terr.replace(/:/g, '_') + '_' + n + '.png'});
    if (r.done) { console.log(terr, 'RESULT', JSON.stringify(r.done)); break; } console.log(JSON.stringify(r)); }
  console.log('errors:', errs); await b.close(); s.close();
})();
