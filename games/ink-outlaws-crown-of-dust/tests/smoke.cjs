/* Smoke test: loads the game over http, over file://, and the single-file build; runs title -> new game -> map -> a mission for a
   few seconds -> camp tabs -> codex. Fails (exit 1) on any page error or console error.   node tests/smoke.cjs */
const { chromium } = require('playwright'), serve = require('./serve.cjs'), path = require('path'), fs = require('fs');
(async () => {
  const s = await serve(0), b = await chromium.launch(), root = path.resolve(__dirname, '..');
  const built = fs.readdirSync(path.join(root, 'build')).filter(f => f.endsWith('.html')).sort().pop();
  const targets = [['http', 'http://localhost:' + s.address().port + '/index.html'], ['file', 'file://' + path.join(root, 'index.html')]];
  if (built) targets.push(['single', 'file://' + path.join(root, 'build', built)]);
  let bad = 0;
  for (const [name, url] of targets) {
    const pg = await b.newPage({viewport: {width: 1180, height: 760}}); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(url); await pg.waitForTimeout(500);
    const r = await pg.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)); CD.Save.wipe(); CD.Save.settings.sound = false;
      CD.UI.newGame(); await wait(200); CD.Camp.fresh('wren'); CD.G.tut = 1; CD.go('map'); await wait(300);
      ['posse', 'hero', 'town'].forEach(t => CD.UI.camp(t)); CD.UI.codex(() => {}); await wait(300); CD.go('map');
      let done = null; CD.Mission.start(CD.Camp.specFor(CD.Data.terrById.ford), r => { done = r; }); CD.go('mission');
      for (let i = 0; i < 60 && CD.M && CD.M.state !== 'play'; i++) await wait(100);
      CD.Input.hold('right', true); CD.Input.hold('attack', true); await wait(1500); CD.Input.reset();
      CD.Mission.debug.win(); for (let i = 0; i < 50 && !done; i++) await wait(100);
      return {state: CD.M ? CD.M.state : 'ended', done: !!done, win: done && done.win};
    });
    const ok = !errs.length && r.done && r.win; if (!ok) bad++;
    console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(r), errs.slice(0, 3).join(' | '));
    await pg.close();
  }
  await b.close(); s.close(); process.exit(bad ? 1 : 0);
})();
