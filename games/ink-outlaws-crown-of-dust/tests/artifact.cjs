/* Artifact page test: wraps build/artifact/ink-outlaws-crown-of-dust.html in the publish skeleton's reset (doctype, charset, viewport,
   light color-scheme, safe-area :root padding, margin-free 14px body) and plays it.
   Cases: desktop, phone landscape, and desktop with localStorage forced to throw (a private window). Each one runs title -> new game ->
   map -> mission -> win, then the Controls card and a save-code round trip. Fails on any page error or console error.
   Run `python3 build/build.py --artifact` first.   node tests/artifact.cjs [--shots <dir>] */
const { chromium, devices } = require('playwright'), path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..'), frag = fs.readFileSync(path.join(root, 'build', 'artifact', 'ink-outlaws-crown-of-dust.html'), 'utf8');
const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + frag + '</body></html>';
const si = process.argv.indexOf('--shots'), shots = si >= 0 ? process.argv[si + 1] : null;
(async () => {
  const b = await chromium.launch(); let bad = 0;
  const cases = [['desktop', {viewport: {width: 1180, height: 760}}, false], ['phone', devices['iPhone 13 landscape'], false], ['no-storage', {viewport: {width: 1180, height: 760}}, true]];
  for (const [name, ctxOpts, blocked] of cases) {
    const ctx = await b.newContext(ctxOpts), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    if (blocked) await pg.addInitScript(() => { Object.defineProperty(window, 'localStorage', {get() { throw new Error('storage blocked'); }}); });
    await pg.setContent(page, {waitUntil: 'load'}); await pg.waitForTimeout(500);
    if (shots) await pg.screenshot({path: path.join(shots, 'artifact_' + name + '_title.png')});
    const r = await pg.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {}; CD.Save.settings.sound = false;
      out.single = !!CD.SINGLE; out.labLinkHidden = [...document.querySelectorAll('#ui a')].every(a => a.style.display === 'none');
      out.titleButtons = [...document.querySelectorAll('#ui .title button')].map(b => b.textContent);
      document.querySelectorAll('#ui .title button').forEach(b => { if (b.textContent === 'Controls') b.click(); }); await wait(100); out.controlsRows = document.querySelectorAll('.modal table.keys tr').length;
      document.querySelector('.modal .b').click(); CD.UI.newGame(); await wait(200); out.noLabTip = ![...document.querySelectorAll('#ui .note')].some(n => /Chunk Lab/.test(n.textContent));
      CD.Camp.fresh('wren'); CD.G.tut = 1; CD.G.gold = 222; CD.go('map'); await wait(300);
      out.code = CD.Camp.exportCode(); CD.UI.pauseMenu(); await wait(50); out.menuButtons = [...document.querySelectorAll('.modal button')].map(b => b.textContent); document.querySelectorAll('.modal').forEach(m => m.remove());
      const bad = CD.Camp.importCode('CODSAVE1.%%%'), junk = CD.Camp.importCode('hello'); out.badRejected = !bad.ok && !junk.ok;
      CD.Save.wipe(); CD.G = null; const imp = CD.Camp.importCode(out.code); out.imported = imp.ok && !!CD.Camp.load() && CD.G.gold === 222 && CD.G.hero === 'wren';
      let done = null; CD.Mission.start(CD.Camp.specFor(CD.Data.terrById.ford), r => { done = r; }); CD.go('mission');
      for (let i = 0; i < 80 && CD.M && CD.M.state !== 'play'; i++) await wait(100);
      CD.Input.hold('right', true); CD.Input.hold('attack', true); await wait(1200); CD.Input.reset(); out.hud = !!document.querySelector('#hud.on');
      CD.Mission.debug.win(); for (let i = 0; i < 60 && !done; i++) await wait(100); out.won = !!(done && done.win);
      CD.go('title'); await wait(100); out.continueWorks = CD.Save.load() !== null;
      return out; });
    if (shots) { await pg.evaluate(() => { CD.Camp.fresh('goro'); CD.G.tut = 1; CD.go('map'); }); await pg.waitForTimeout(500); await pg.screenshot({path: path.join(shots, 'artifact_' + name + '_map.png')}); }
    const ok = !errs.length && r.single && r.labLinkHidden && r.controlsRows === 8 && r.noLabTip && r.badRejected && r.imported && r.won && r.hud && r.continueWorks && /Copy save code/.test(r.menuButtons.join('|')) && /Load save code/.test(r.titleButtons.join('|'));
    if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(Object.assign({}, r, {code: r.code.length + ' chars'})), errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
