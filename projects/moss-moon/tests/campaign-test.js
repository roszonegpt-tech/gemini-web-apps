// Moss & Moon — campaign end-to-end test (owner: CAMPAIGN).
// Usage: node tests/campaign-test.js [index.html]
// Plays the whole campaign headlessly through real code paths (baseline tendPlot/hitEntity/goRegion/enterDungeon/advanceFloor,
// MM.campaign travel/craft/shop/dialogue, MM.game save/continue/respawn, MM.cine skip). Shortcuts used: teleporting the player,
// giving items, killing enemies with large hitEntity damage, and stepping the baseline simulation synchronously.
// Sections: tutorial → forest dungeon + Bramble Warden → restoration → defeat/retry → swamp (broom gate) + Mire Heart →
// save/reload mid-campaign (no duplicate rewards) → Frostpeak + Frost Wyrm → Moonwell final (Hollow Moon) → ending → free play;
// plus: skipped vs watched cinematic give identical rewards, cine returns to the previous state (interior), sandbox dormancy.
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const results = []; let failed = 0;
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };

async function open(browser, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => window.MM && MM.campaign && MM.state && MM.state.current && MM.state.current !== 'boot', null, { timeout: 15000 });
  if (opts && opts.flowTutorialDone !== undefined) await page.evaluate(v => MM.storage.set('moss-moon-flow-v1', JSON.stringify({ introSeen: true, tutorialDone: v })), opts.flowTutorialDone);
  return { ctx, page, errors };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
async function waitState(page, s, ms) { try { await page.waitForFunction(x => MM.state.current === x, s, { timeout: ms || 5000 }); return true; } catch (_) { return false; } }
async function settle(page) { // finish loading transitions / skip cines until back in play
  for (let i = 0; i < 40; i++) {
    const st = await ev(page, () => MM.state.current);
    if (st === 'play') return 'play';
    if (st === 'cine') await ev(page, () => MM.cine && MM.cine.skip());
    if (st === 'ending') return 'ending';
    if (st === 'defeat') return 'defeat';
    await page.waitForTimeout(150);
  }
  return ev(page, () => MM.state.current);
}
const snap = page => ev(page, () => MM.campaign.debug.snapshot());
// helpers installed in the page
async function installHelpers(page) {
  await ev(page, () => {
    const C = MM.campaign, d = C.debug;
    window.__t = {
      d, C,
      collectLoot() { let n = 0; for (const l of lootDrops.slice()) { if (l.life <= 0) continue; d.teleport(l.x, l.y); d.step(.1); n++; } return n; },
      clearFloor() { let k = 0; for (let i = 0; i < 6 && enemies.some(e => e.hp > 0); i++) { k += d.killAll(); d.step(.2); } this.collectLoot(); return k; },
      plotAt(i) { const p = world.plots[i]; d.teleport(p.x - .4, p.y - .4); return tendPlot(p); },
      growHarvest() { d.step(32); let n = 0; for (let i = 0; i < 6; i++) { const p = world.plots[i]; if (p.seed && p.growth >= 100) { this.plotAt(i); n++; } } return n; },
      toMoonwell() { const m = C.moonwellPos(); d.teleport(m.x, m.y + .3); d.step(.5); return m; },
      sawTelegraph(sec) { let max = 0, n = 0; const kit = MM.bosses.kit; for (let i = 0; i < sec * 10; i++) { d.heal(); d.step(.1); max = Math.max(max, kit.telegraphs.length); if (kit.telegraphs.length) n++; } return { max, frames: n }; }
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  // =========================================================== main run
  const { page, errors } = await open(browser, { flowTutorialDone: false });
  await installHelpers(page);
  await ev(page, () => MM.game.newGame({ name: 'Tess', startCampaign: true }));
  let st = await settle(page);
  let s = await snap(page);
  check('newGame+start → play, chapter 0, no intro cine played', st === 'play' && s.chapter === 0 && s.tutorial.step === 0, { st, ch: s.chapter });
  check('intro not replayed by campaign.start', await ev(page, () => !MM.cine.isPlaying() && MM.campaign.state.memories.includes('intro')));
  const o0 = await ev(page, () => MM.campaign.objective());
  check('objective has title+why (tutorial plant)', o0.id === 'tut_plant' && o0.title && o0.why, o0.title);
  check('signature spells at 1-5, only Moonbolt learned', await ev(page, () => SPELLS.slice(0, 5).map(s => s.id).join() === 'moonbolt,emberbloom,thornbind,frostbell,starfall' && MM.campaign.spells().filter(s => s.unlocked).length === 1));
  check('village locked before brewing', (await ev(page, () => MM.campaign.travelTo('village'))).ok === false);

  // ---------------- tutorial chain: plant → water → harvest → brew → accept request
  await ev(page, () => { world.weather = 'Clear'; __t.plotAt(0); __t.plotAt(1); });
  s = await snap(page); check('tutorial: plant advanced', s.tutorial.step >= 1, s.tutorial);
  await ev(page, () => { __t.plotAt(0); __t.plotAt(1); });
  s = await snap(page); check('tutorial: water advanced', s.tutorial.step >= 2, s.tutorial);
  const harvested = await ev(page, () => __t.growHarvest());
  s = await snap(page); check('tutorial: harvest advanced', harvested >= 1 && s.tutorial.step >= 3, { harvested, step: s.tutorial.step });
  const brew = await ev(page, () => MM.campaign.craft('healing'));
  s = await snap(page); check('tutorial: brew a Healing Draught via MM.campaign.craft', brew.ok && s.tutorial.step >= 4, brew.msg);
  const tv = await ev(page, () => MM.campaign.travelTo('village')); st = await settle(page);
  check('travel to village (loading → play)', tv.ok && st === 'play' && (await snap(page)).region === 'village', tv);
  const dlg = await ev(page, () => MM.campaign.dialogue('wren'));
  check('Wren dialogue offers the tutorial request', dlg.pages.some(p => (p.choices || []).some(c => c.action === 'offer:wren_seeds')), dlg.pages.length);
  const acc = await ev(page, () => MM.campaign.choose('wren', 'accept:wren_seeds'));
  s = await snap(page);
  check('accept request → tutorial done, chapter 1', acc.ok && s.tutorial.done && s.chapter === 1, { ch: s.chapter });
  check('chapter 1 unlocks Thornbind + Ember Bloom', s.spells.includes('thornbind') && s.spells.includes('emberbloom'), s.spells);
  // turn in Wren's request (needs 2 wheat; grow more)
  await ev(page, () => { __t.d.teleport(9.7, 10, 'grove'); for (let i = 0; i < 4; i++) __t.plotAt(i); for (let i = 0; i < 4; i++) __t.plotAt(i); __t.growHarvest(); });
  const ti = await ev(page, () => { __t.d.teleport(9.7, 10, 'village'); return MM.campaign.turnIn('wren_seeds'); });
  check('turn in Wren\'s request → Mana Tonic recipe', ti.ok && (await snap(page)).recipes.includes('mana'), ti.msg);

  // ---------------- Chapter 1: Blighted Forest
  await ev(page, () => MM.campaign.travelTo('forest')); st = await settle(page);
  const fr = await ev(page, () => ({ region: world.region, n: enemies.length, arch: enemies.map(e => e.mmArch), hz: MM.campaign.hazards().length, obj: MM.campaign.objective().id }));
  check('forest: region roster archetypes + bramble hazards', fr.region === 'forest' && fr.n >= 3 && fr.arch.every(a => ['blightling', 'moss_slime'].includes(a)) && fr.hz >= 3, fr);
  await ev(page, () => __t.clearFloor());
  check('forest: objective = enter dungeon', (await ev(page, () => MM.campaign.objective().id)) === 'enter_dungeon');
  await ev(page, () => MM.campaign.enterDungeon()); st = await settle(page);
  s = await snap(page); check('enter Rootways (dungeon floor 1)', s.mode === 'dungeon' && s.floor === 1, { mode: s.mode, floor: s.floor });
  check('cannot descend with enemies alive', (await ev(page, () => MM.campaign.nextFloor())).ok === false);
  await ev(page, () => __t.clearFloor()); await ev(page, () => MM.campaign.nextFloor()); await settle(page);
  await ev(page, () => __t.clearFloor()); await ev(page, () => MM.campaign.nextFloor());
  const sawCine = await waitState(page, 'cine', 4000);
  check('boss floor plays boss_forest_intro inside state cine', sawCine && (await ev(page, () => MM.cine.current()?.id)) === 'boss_forest_intro');
  await ev(page, () => MM.cine.skip()); st = await settle(page);
  const boss1 = await ev(page, () => MM.bosses.active()[0] || null);
  check('Bramble Warden spawned after cine (returns to play)', st === 'play' && boss1 && boss1.id === 'bramble_warden', boss1 && boss1.name);
  const tg1 = await ev(page, () => __t.sawTelegraph(8));
  check('boss attacks are telegraphed (danger zones before damage)', tg1.max >= 1 && tg1.frames > 3, tg1);
  const gold0 = (await snap(page)).gold;
  const kb1 = await ev(page, () => MM.campaign.debug.killBoss()); await settle(page);
  s = await snap(page);
  check('Bramble Warden defeated → Fragment I, Starfall learned, reward gold', kb1.ok && s.bosses.bramble_warden && s.fragments.includes('forest') && s.spells.includes('starfall') && s.gold >= gold0 + 60, { kb1, gold: [gold0, s.gold] });
  check('objective → bring fragment home', (await ev(page, () => MM.campaign.objective().id)) === 'place_fragment');
  await ev(page, () => MM.campaign.travelTo('grove')); await settle(page);
  await ev(page, () => __t.toMoonwell());
  const sawRest = await waitState(page, 'cine', 3000);
  check('placing Fragment I plays first_restoration (cine state)', sawRest && (await ev(page, () => MM.cine.current()?.id)) === 'first_restoration');
  await ev(page, () => MM.cine.skip()); st = await settle(page);
  s = await snap(page);
  check('forest restored, homestead/moonwell level 1, chapter 2', st === 'play' && s.restored.forest && s.homestead >= 1 && s.moonwell === 1 && s.chapter === 2, { h: s.homestead, mw: s.moonwell, ch: s.chapter });

  // ---------------- defeat → recovery
  await ev(page, () => MM.campaign.travelTo('forest')); await settle(page);
  const before = await snap(page);
  await ev(page, () => MM.campaign.debug.hurt(9999));
  const inDefeat = await waitState(page, 'defeat', 3000);
  const dd = await ev(page, () => MM.campaign.lastDefeat());
  check('defeat → state defeat with explicit penalty text', inDefeat && /gold/.test(dd.penalty) && dd.title === 'Moonlit Recovery', dd.penalty);
  await ev(page, () => MM.game.respawnHome());   // what the defeat screen does
  st = await settle(page); await ev(page, () => MM.cine.isPlaying() && MM.cine.skip()); st = await settle(page);
  const after = await snap(page);
  check('respawn at homestead, ≤25 gold lost, no story loss', st === 'play' && after.region === 'grove' && before.gold - after.gold <= 25 && before.gold - after.gold >= 0 && after.chapter === before.chapter && after.fragments.length === before.fragments.length && !after.downed && after.hp > 50, { lost: before.gold - after.gold, hp: after.hp });

  // ---------------- Chapter 2: swamp (broom gate)
  const lockS = await ev(page, () => MM.campaign.travelTo('swamp'));
  check('swamp locked without broom 1 (with reason)', !lockS.ok && /broom/i.test(lockS.msg), lockS.msg);
  const ob = await ev(page, () => MM.campaign.objective());
  check('objective explains the broom upgrade', ob.id === 'need_broom' && /Pip/.test(ob.hint), ob.title);
  await ev(page, () => { MM.campaign.debug.give('gold', 150); MM.campaign.debug.give('blight_bark', 2); });
  const ub = await ev(page, () => MM.campaign.buyUpgrade('broom'));
  check('buy broom level 1 (gold + bark)', ub.ok && (await snap(page)).broom === 1, ub.msg);
  await ev(page, () => MM.campaign.travelTo('swamp')); await settle(page);
  check('swamp reachable; bog hazards', (await ev(page, () => world.region === 'swamp' && MM.campaign.hazards().some(h => h.kind === 'bog'))));
  await ev(page, () => { __t.clearFloor(); MM.campaign.enterDungeon(); }); await settle(page);
  for (let f = 0; f < 2; f++) { await ev(page, () => { __t.clearFloor(); MM.campaign.nextFloor(); }); await settle(page); }
  const boss2 = await ev(page, () => MM.bosses.active()[0] || null);
  check('Mire Heart spawned on floor 3', boss2 && boss2.id === 'mire_heart', boss2 && boss2.name);
  // drive to the split phase and verify invulnerability + wisps
  const split = await ev(page, () => { const b = enemies.find(e => e.mmBoss); hitEntity(b, b.hp - b.maxHP * .48, '#fff', game); __t.d.step(.3); return { inv: !!b.mmInvuln, wisps: enemies.filter(e => e.mmArch === 'mire_wisp' && e.hp > 0).length, hp: b.hp }; });
  check('Mire Heart phase 2 splits into wisps (boss invulnerable)', split.inv && split.wisps === 3, split);
  const kb2 = await ev(page, () => MM.campaign.debug.killBoss()); await settle(page);
  s = await snap(page);
  check('Mire Heart defeated → Fragment II', kb2.ok && s.fragments.includes('swamp'), kb2);

  // ---------------- save → reload mid-campaign → continue
  const saved = await ev(page, () => MM.save.save({ silent: true, force: true, reason: 'test' }));
  const pre = await snap(page);
  await page.reload();
  await page.waitForFunction(() => window.MM && MM.campaign && MM.state.current && MM.state.current !== 'boot', null, { timeout: 15000 });
  await installHelpers(page);
  const cont = await ev(page, () => MM.game.continueGame()); await settle(page);
  const post = await snap(page);
  const same = ['chapter', 'fragments', 'placed', 'restored', 'bosses', 'gold', 'homestead', 'moonwell', 'memories', 'rewarded', 'spells', 'recipes', 'broom'].filter(k => JSON.stringify(pre[k]) !== JSON.stringify(post[k]));
  check('save/reload keeps campaign progress', saved !== false && cont.ok && same.length === 0, { cont, diff: same });
  const dup = await ev(page, () => { const g = world.gold; MM.campaign.onBossDefeated('mire_heart'); MM.campaign.debug.grantFragment('swamp'); return { dg: world.gold - g, frags: MM.campaign.state.fragments.length }; });
  check('no duplicate boss rewards/fragments after reload', dup.dg === 0 && dup.frags === 2, dup);
  await ev(page, () => MM.campaign.travelTo('grove')); await settle(page);
  await ev(page, () => __t.toMoonwell()); st = await settle(page);
  s = await snap(page);
  check('Fragment II placed → swamp restored, chapter 3, no repeat of first_restoration', s.restored.swamp && s.chapter === 3 && s.memories.filter(m => m === 'first_restoration').length === 1, { ch: s.chapter });

  // ---------------- Chapter 3: Frostpeak
  const tm = await ev(page, () => MM.campaign.travelTo('mountain')); await settle(page);
  check('Frostpeak opens via swamp restoration (broom 1)', tm.ok && (await snap(page)).region === 'mountain', tm.msg);
  const chill = await ev(page, () => { __t.clearFloor(); __t.d.teleport(9.7, 10); for (let i = 0; i < 30; i++) { __t.d.step(.2); __t.d.heal(); } return MM.campaign.hazardStatus(); });
  check('frost hazard builds chill outside warm spots', chill && chill.kind === 'frost' && chill.value > 20, chill);
  const hf = await ev(page, () => { MM.campaign.debug.give('hearthfire', 1); const r = MM.campaign.useItem('hearthfire'); __t.d.step(2); return { r, st: MM.campaign.hazardStatus() }; });
  check('Hearthfire Salve protects from cold', hf.r.ok && hf.st.protected, hf.st);
  await ev(page, () => { MM.campaign.enterDungeon(); }); await settle(page);
  for (let f = 0; f < 2; f++) { await ev(page, () => { __t.clearFloor(); MM.campaign.nextFloor(); }); await settle(page); }
  const boss3 = await ev(page, () => MM.bosses.active()[0] || null);
  check('Frost Wyrm Husk spawned', boss3 && boss3.id === 'frost_wyrm', boss3 && boss3.name);
  const tg3 = await ev(page, () => __t.sawTelegraph(10));
  check('Frost Wyrm telegraphs attacks', tg3.max >= 1, tg3);
  await ev(page, () => MM.campaign.debug.killBoss());
  const ff = await waitState(page, 'cine', 3000);
  check('third fragment plays final_fragment', ff && (await ev(page, () => MM.cine.current()?.id)) === 'final_fragment');
  await settle(page);
  await ev(page, () => MM.campaign.travelTo('grove')); await settle(page);
  await ev(page, () => __t.toMoonwell()); await settle(page);
  s = await snap(page);
  check('all three restored → chapter 4 (Moonwell)', s.restored.mountain && s.chapter === 4 && s.moonwell === 3, { ch: s.chapter });

  // ---------------- Chapter 4: The Hollow Moon
  await ev(page, () => { __t.d.teleport(9.7, 11); __t.d.step(.5); MM.campaign.debug.V.proxCooldown = 0; __t.toMoonwell(); });
  const hm = await ev(page, () => ({ b: MM.bosses.active()[0] || null, fa: MM.campaign.debug.V.finalActive }));
  check('approaching the Moonwell starts The Hollow Moon', hm.fa && hm.b && hm.b.id === 'hollow_moon', hm.b && hm.b.name);
  const ph = await ev(page, () => {
    const b = enemies.find(e => e.mmBoss), out = [];
    __t.d.teleport(b.x, b.y + 3.5);
    hitEntity(b, b.maxHP * .36, '#fff', game); __t.d.step(.3); out.push(b.mmPhase);
    let dark = 0; for (let i = 0; i < 80; i++) { __t.d.heal(); __t.d.step(.1); if (MM.bosses.kit.telegraphs.some(t => t.kind === 'darkness')) dark++; }
    hitEntity(b, b.maxHP * .4, '#fff', game); __t.d.step(.3); out.push(b.mmPhase);
    const well = enemies.find(e => e.mmWell);
    return { phases: out, dark, inv: !!b.mmInvuln, well: !!well, target: well && spellTarget(game) === well };
  });
  check('Hollow Moon phases: darkness pulses with safe light, then collapse → Moonwell target', ph.phases[0] === 1 && ph.dark > 0 && ph.phases[1] === 2 && ph.inv && ph.well && ph.target, ph);
  await ev(page, () => MM.campaign.debug.killBoss());
  const endCine = await waitState(page, 'cine', 3000);
  check('victory plays the ending cinematic', endCine && (await ev(page, () => MM.cine.current()?.id)) === 'ending');
  await ev(page, () => MM.cine.skip());
  const inEnding = await waitState(page, 'ending', 4000);
  check('ending cine → ending state', inEnding);
  await ev(page, () => MM.state.go('play')); st = await settle(page);
  s = await snap(page);
  check('free play continues: chapter 5, homestead 4, crypt open', st === 'play' && s.chapter === 5 && s.homestead === 4 && (await ev(page, () => MM.campaign.regionLock('crypt'))) === null, { ch: s.chapter });
  const crypt = await ev(page, () => MM.campaign.travelTo('crypt')); await settle(page);
  const cd = await ev(page, () => { MM.campaign.enterDungeon(); }); await settle(page);
  check('postgame Old Crypt dungeon playable', crypt.ok && (await snap(page)).mode === 'dungeon', crypt.msg);
  check('postgame spellbook has all baseline spells', (await ev(page, () => MM.campaign.spells().length)) === 30);
  const playMin = await ev(page, () => Math.round(MM.campaign.state.stats.playTime / 60));
  // ---------------- cine returns to previous state (interior)
  const ret = await ev(page, async () => {
    MM.campaign.debug.teleport(9.7, 10, 'grove');
    MM.state.go('interior', { building: 'cottage_home', test: true });
    const p = MM.campaign.playStory('defeat_recover', { replay: true });
    const mid = MM.state.current; setTimeout(() => MM.cine.skip(), 50); await p; return { mid, end: MM.state.current };
  });
  check('cine from interior returns to interior', ret.mid === 'cine' && ret.end === 'interior', ret);
  await ev(page, () => MM.state.go('play'));
  check('no page errors in main run', errors.length === 0, errors.slice(0, 5));
  await page.context().close();

  // =========================================================== skip vs watch identical rewards
  async function restorationRun(watch) {
    const r = await open(browser, { flowTutorialDone: false }); await installHelpers(r.page);
    await ev(r.page, () => { MM.game.newGame({ name: 'A', startCampaign: true }); MM.campaign.debug.skipTo(1); MM.campaign.debug.grantFragment('forest'); });
    await settle(r.page);
    await ev(r.page, () => { world.gold = 100; __t.toMoonwell(); });
    await waitState(r.page, 'cine', 3000);
    const id = await ev(r.page, () => MM.cine.current()?.id);
    if (watch) await ev(r.page, () => MM.cine.setTimeScale(40)); else await ev(r.page, () => MM.cine.skip());
    await waitState(r.page, 'play', 8000);
    const o = await ev(r.page, () => ({ gold: Math.floor(world.gold), items: MM.campaign.state.items, rewarded: Object.keys(MM.campaign.state.rewarded).sort(), mem: MM.campaign.state.memories.slice(), st: MM.state.current }));
    await r.ctx.close(); return Object.assign(o, { id });
  }
  const A = await restorationRun(false), Bw = await restorationRun(true);
  check('skipped vs watched first_restoration: identical rewards', A.id === 'first_restoration' && Bw.id === 'first_restoration' && JSON.stringify([A.gold, A.items, A.rewarded, A.mem]) === JSON.stringify([Bw.gold, Bw.items, Bw.rewarded, Bw.mem]) && A.st === 'play' && Bw.st === 'play', { skip: A.gold, watch: Bw.gold });

  // =========================================================== flow tutorial done → Arrival chain auto-completes
  {
    const r = await open(browser, { flowTutorialDone: true });
    await ev(r.page, () => MM.game.newGame({ name: 'B', startCampaign: true })); await settle(r.page);
    const x = await ev(r.page, () => ({ ch: MM.campaign.state.chapter, done: MM.campaign.state.tutorial.done, village: MM.campaign.regionLock('village'), offered: MM.campaign.quests().some(q => q.id === 'wren_seeds' && q.status === 'offered') }));
    check('MM.flow tutorialDone → Arrival chain auto-completes (chapter 1, village open, request still offered)', x.ch === 1 && x.done && x.village === null && x.offered, x);
    // sandbox dormancy: tutorial state/region makes campaign bookkeeping dormant
    const dz = await ev(r.page, () => { const k = MM.campaign.state.counters.kills.any; MM.state.go('tutorial'); const d1 = MM.campaign.isDormant(); spawnGroup('slime', 1); MM.campaign.debug.killAll(); MM.state.go('play'); return { d1, kills: MM.campaign.state.counters.kills.any - k, d2: MM.campaign.isDormant() }; });
    check('campaign dormant in tutorial state (no quest/kill bookkeeping)', dz.d1 && dz.kills === 0 && !dz.d2, dz);
    check('no page errors (flow run)', r.errors.length === 0, r.errors.slice(0, 3));
    await r.ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify({ pass: failed === 0, total: results.length, failed: results.filter(r => !r.ok).map(r => r.name), simulatedMinutes: playMin }));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
