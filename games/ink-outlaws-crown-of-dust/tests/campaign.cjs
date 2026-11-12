/* Full campaign run: the autopilot (tests/bot.js, god mode) plays day after day through the real menus - briefing, mission,
   results, overnight raids - and spends gold like a sensible player, until Castle Gilt falls or the day limit is reached.
   node tests/campaign.cjs [maxDays=40] [steps=8]     Exit 1 on a page error, a stuck mission or no victory. */
const { chromium } = require('playwright'), serve = require('./serve.cjs'), fs = require('fs'), path = require('path');
(async () => {
  const maxDays = +process.argv[2] || 40, steps = +process.argv[3] || 8, s = await serve(0), b = await chromium.launch();
  const pg = await b.newPage({viewport: {width: 1280, height: 760}}); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('http://localhost:' + s.address().port + '/index.html'); await pg.addScriptTag({content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8')});
  await pg.evaluate(steps => { CD.Save.wipe(); CD.Save.settings.sound = false; CD.Camp.fresh('harrow'); CD.G.tut = 1; CD.go('map'); CD.steps = steps; window.startBot(); }, steps);
  const click = txt => pg.evaluate(t => { const bs = [...document.querySelectorAll('.modal button')].filter(b => b.textContent.indexOf(t) === 0); if (bs.length) { bs[bs.length - 1].click(); return true; } return false; }, txt);
  let fail = '';
  for (let guard = 0; guard < 200; guard++) {
    const st = await pg.evaluate(() => ({day: CD.G.day, gold: CD.G.gold, won: CD.G.won, scene: CD.sceneName, land: CD.Camp.owned().length, modal: !!document.querySelector('.modal')}));
    if (st.won || st.day > maxDays) break;
    if (st.modal) { if (await click('Continue') || await click('Defend it yourself') || await click('Right') || await click('Saddle up') || await click('Make the stand again')) { await pg.waitForTimeout(300); continue; } }
    if (st.scene === 'mission') {
      const t0 = Date.now(); while (Date.now() - t0 < 240000) { await pg.waitForTimeout(1500); if (await pg.evaluate(() => !CD.M)) break; }
      if (await pg.evaluate(() => !!CD.M)) { fail = 'mission stuck: ' + await pg.evaluate(() => CD.Mission.objective(CD.M).txt); break; } continue;
    }
    /* spend: posse seats first, then hire, smithy, doc, towers, the rest */
    await pg.evaluate(() => { const G = CD.G, K = CD.Camp;
      for (const h of K.forHire().filter(h => !h.locked).sort((a, b) => b.cost - a.cost)) if (G.gold >= h.cost && G.roster.length < K.cap()) K.hire(h.id, h.cost);
      for (const k of ['saloon', 'smithy', 'doc', 'tower', 'powder', 'stable']) K.upgrade(k);
      for (const id of G.roster) if (G.posse.length < K.cap() && G.posse.indexOf(id) < 0) G.posse.push(id);
      if (!G.armory.rifle && G.gold > 160) { K.buyWeapon('rifle', 120); K.equip(0, 'rifle'); } });
    const pickT = await pg.evaluate(() => { const D = CD.Data, K = CD.Camp; const c = D.terr.filter(t => K.canAttack(t)).sort((a, b) => (a.tier - b.tier) || (b.income - a.income)); return c.length ? c[0].id : null; });
    if (!pickT) { fail = 'nothing to attack'; break; }
    const d0 = st.day, land0 = st.land;
    await pg.evaluate(id => { const t = CD.Data.terrById[id]; CD.UI.launch(t, CD.Camp.specFor(t)); }, pickT);
    console.log('day', d0, 'gold', st.gold, 'land', land0, '->', pickT);
  }
  const end = await pg.evaluate(() => ({day: CD.G.day, won: CD.G.won, land: CD.Camp.owned().length, gang: CD.G.roster.length, gold: CD.G.gold, kills: CD.G.kills, log: CD.G.log.slice(0, 6), sprites: CD.Sprites.map.size, mb: Math.round(CD.Sprites.bytes / 1e6)}));
  console.log(JSON.stringify(end, null, 1)); if (errs.length) console.log('ERRORS', errs.slice(0, 5));
  await b.close(); s.close(); process.exit(!end.won || errs.length || fail ? (console.log('FAIL', fail || (end.won ? '' : 'not won')), 1) : 0);
})();
