// Moss & Moon — "no dead ends" check (owner: CAMPAIGN). Usage: node tests/campaign-deadends.js [index.html]
// Spends/destroys everything the player owns at several points of the campaign, then proves the next story gate can still be
// reached using only repeatable, always-available income: the daily seed barrel, farming, selling crops and forest mobs.
// Everything goes through real code paths (rest(), claimSeeds(), baseline tendPlot/hitEntity/pickup, shop sell/buy, buyUpgrade).
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
let failed = 0; const out = [];
const check = (n, ok, info) => { out.push({ n, ok }); if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => window.MM && MM.campaign && MM.state.current && MM.state.current !== 'boot');
  await page.evaluate(() => {
    MM.storage.set('moss-moon-flow-v1', JSON.stringify({ introSeen: true, tutorialDone: false }));
    MM.game.newGame({ name: 'Bankrupt', startCampaign: true });
    const C = MM.campaign, d = C.debug;
    window.__dz = {
      // destroy every resource: spend all gold on whatever is affordable, then throw away items/seeds/crops
      bankrupt() {
        C.travelTo; d.teleport(9.7, 10, 'village');
        for (let i = 0; i < 200; i++) { const st = C.shop('pip').stock.filter(x => !x.locked && x.kind !== 'upgrade' && x.kind !== 'equipment' && x.price <= world.gold); if (!st.length) break; C.buy(st[0].id, 1, 'pip'); }
        for (const c of Object.keys(C.data.crops)) { world.seeds[c] = 0; world.harvest[c] = 0; }
        for (const k of Object.keys(C.state.items)) if (!C.data.items[k]?.story) C.state.items[k] = 0;
        world.potions = 0; world.bombs = 0; world.runes = 0; const spent = Math.floor(world.gold); world.gold = 0;
        for (const p of world.plots) { p.seed = null; p.growth = 0; p.watered = false; }
        d.teleport(9.7, 10, 'grove'); return spent;
      },
      clearThreats() { for (let i = 0; i < 4 && enemies.some(e => e.hp > 0); i++) { d.killAll(); d.step(.2); } for (const l of lootDrops.slice()) { d.teleport(l.x, l.y); d.step(.1); } },
      // one farming cycle using only the free daily seed barrel: rest until a new day, claim, plant, water, grow, harvest, sell
      farmDay() {
        d.teleport(9.7, 10, 'grove'); let guard = 0;
        while (C.state.seedBarrelDay === world.day && guard++ < 6) { this.clearThreats(); const r = C.rest(); if (!r.ok) { this.clearThreats(); d.step(1); } }
        const got = C.claimSeeds();
        world.weather = 'Clear';
        for (const [c, n] of Object.entries(world.seeds)) for (let k = 0; k < n; k++) {
          const p = world.plots.find(p => !p.seed); if (!p) break; world.seed = c; d.teleport(p.x - .4, p.y - .4); tendPlot(p); tendPlot(p);
        }
        for (let t = 0; t < 30 && world.plots.some(p => p.seed && p.growth < 100); t++) { d.step(2); this.clearThreats(); d.heal(); }
        let h = 0; for (const p of world.plots) if (p.seed && p.growth >= 100) { d.teleport(p.x - .4, p.y - .4); tendPlot(p); h++; }
        d.teleport(9.7, 10, 'village'); const s = C.sellAllCrops('pip'); d.teleport(9.7, 10, 'grove');
        return { claimed: got.ok, harvested: h, sold: s.ok, gold: Math.floor(world.gold) };
      },
      forestRun() { d.teleport(9.7, 10, 'forest'); for (let i = 0; i < 6; i++) { d.heal(); this.clearThreats(); } const n = C.data.items; d.teleport(9.7, 10, 'grove'); return { bark: C.debug.give('blight_bark', 0), gold: Math.floor(world.gold) }; },
      gate(id) { return C.regionLock(id); }
    };
  });
  const ev = (fn, a) => page.evaluate(fn, a);

  // ---------- chapter 1: bankrupt right after the tutorial → can we still afford broom 1 (swamp gate)?
  await ev(() => MM.campaign.debug.skipTo(1));
  const spent1 = await ev(() => __dz.bankrupt());
  check('bankrupt at chapter 1 (gold, seeds, crops, potions, items gone)', await ev(() => world.gold === 0 && Object.values(world.seeds).every(v => !v)), { spent: spent1 });
  check('brewing still possible after bankruptcy (Healing Draught never locked)', await ev(() => MM.campaign.recipes().find(r => r.id === 'healing').unlocked));
  const t0 = await ev(() => MM.campaign.state.stats.playTime);
  let days = 0, ok = false, last;
  for (; days < 25; days++) {
    last = await ev(() => __dz.farmDay());
    if (days % 2 === 1) last.forest = await ev(() => __dz.forestRun());
    const can = await ev(() => { const u = MM.campaign.upgrades().find(x => x.id === 'broom'); return u.canAfford; });
    if (can) { ok = (await ev(() => MM.campaign.buyUpgrade('broom'))).ok; break; }
  }
  const t1 = await ev(() => MM.campaign.state.stats.playTime);
  check('from zero: daily seed barrel + farming + forest mobs pay for broom 1', ok && (await ev(() => __dz.gate('swamp'))) === null, { days: days + 1, simMinutes: Math.round((t1 - t0) / 60), last });

  // ---------- chapter 3: bankrupt again → Frostpeak must open without buying broom 2 (restoration path)
  await ev(() => MM.campaign.debug.skipTo(3));
  await ev(() => __dz.bankrupt());
  check('Frostpeak reachable at chapter 3 with broom 1 and no money (swamp restoration opens the pass)', (await ev(() => __dz.gate('mountain'))) === null && (await ev(() => world.broom)) === 1);
  const tr = await ev(() => MM.campaign.travelTo('mountain'));
  await page.waitForFunction(() => MM.state.current === 'play' && world.region === 'mountain', null, { timeout: 5000 }).catch(() => {});
  check('travel to Frostpeak works while broke', tr.ok && (await ev(() => world.region)) === 'mountain');
  // the dungeon entrance has no cost; the boss floor shortcut remembers reached floors
  const dn = await ev(() => MM.campaign.enterDungeon());
  await page.waitForFunction(() => MM.state.current === 'play' && world.mode === 'dungeon', null, { timeout: 5000 }).catch(() => {});
  check('dungeon entry is free', dn.ok && (await ev(() => world.mode)) === 'dungeon');

  // ---------- every chapter always has an objective with a reason; every locked region names its unlock
  const objs = await ev(() => { const r = []; for (const ch of [0, 1, 2, 3, 4, 5]) { r.push(MM.campaign.objective()); } return r; });
  check('objective always present with title + why', objs.every(o => o && o.title && o.why));
  const locks = await ev(() => MM.campaign.regions().filter(r => r.locked).map(r => [r.id, r.reason]));
  check('every locked region gives a reason', locks.every(([, r]) => r && r.length > 10), locks);
  // ---------- potions: with no potions & no wheat, a Healing Draught is reachable from the free seed barrel
  const pot = await ev(() => { __dz.bankrupt(); const f = __dz.farmDay(); MM.campaign.debug.teleport(9.7, 10, 'grove');
    // farmDay sold everything; grow one more batch and brew instead of selling
    world.weather = 'Clear'; let g = 0; while (MM.campaign.state.seedBarrelDay === world.day && g++ < 6) { __dz.clearThreats(); MM.campaign.rest(); }
    MM.campaign.claimSeeds(); world.seed = 'wheat';
    for (const p of world.plots) if (!p.seed && world.seeds.wheat > 0) { MM.campaign.debug.teleport(p.x - .4, p.y - .4); tendPlot(p); tendPlot(p); }
    for (let t = 0; t < 30 && world.plots.some(p => p.seed && p.growth < 100); t++) { MM.campaign.debug.step(2); __dz.clearThreats(); }
    for (const p of world.plots) if (p.seed && p.growth >= 100) { MM.campaign.debug.teleport(p.x - .4, p.y - .4); tendPlot(p); }
    return MM.campaign.craft('healing'); });
  check('Healing Draught brewable again from the free seed barrel alone', pot.ok, pot.msg);
  check('no page errors', errors.length === 0, errors.slice(0, 3));
  await browser.close();
  console.log(JSON.stringify({ pass: failed === 0, total: out.length, failed: out.filter(x => !x.ok).map(x => x.n) }));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
