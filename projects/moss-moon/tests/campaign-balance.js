// Moss & Moon — boss balance/fairness probe (owner: CAMPAIGN). Usage: node tests/campaign-balance.js [index.html]
// A simple bot fights each boss at the expected progression point (level/gear from notes/GAMEPLAY.md). It casts the real
// signature spells via castSpell() and dodges by walking (1.15 tiles/s, i.e. baseline walk speed) out of telegraphed danger
// zones / into safe light. Position is moved by the bot instead of keyboard input; everything else is the real simulation.
// Reports time-to-kill, damage taken, potions used. Passes when every boss dies in 30–240 s without the bot being defeated.
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const FIGHTS = [
  { boss: 'bramble_warden', region: 'forest', ch: 1, level: 3, gear: ['wand_rowan'] },
  { boss: 'mire_heart', region: 'swamp', ch: 2, level: 5, gear: ['wand_rowan', 'robe_mossweave'] },
  { boss: 'frost_wyrm', region: 'mountain', ch: 3, level: 7, gear: ['wand_starwood', 'robe_barkweave'] },
  { boss: 'hollow_moon', region: 'grove', ch: 4, level: 8, gear: ['wand_starwood', 'robe_barkweave', 'charm_glow'] }
];
(async () => {
  const browser = await chromium.launch(); const rows = []; let failed = 0;
  for (const F of FIGHTS) {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + FILE);
    await page.waitForFunction(() => window.MM && MM.campaign && MM.state.current && MM.state.current !== 'boot');
    const r = await page.evaluate(async (F) => {
      MM.storage.set('moss-moon-flow-v1', JSON.stringify({ introSeen: true, tutorialDone: true }));
      MM.game.newGame({ name: 'Bot', startCampaign: true });
      const C = MM.campaign, d = C.debug, kit = MM.bosses.kit;
      d.skipTo(F.ch);
      while (world.level < F.level) awardXP(world.level * 45);
      for (let i = 0; i < 3; i++) if (world.points > 0) upgradeSkill(i % 2);
      d.give('gold', 2000); for (const k of ['bog_pearl', 'rime_shard', 'moon_dust', 'blight_bark', 'glowcap']) d.give(k, 6);
      for (const g of F.gear) C.buy('equip:' + g);
      world.gold = 100; world.potions = 4; d.heal();
      // spawn the fight through the real entry points
      if (F.boss === 'hollow_moon') { d.teleport(9.7, 10, 'grove'); C.beginFinal(); }
      else { d.teleport(9.7, 10, F.region); C.data; d.V.quietCines = true; enterDungeon(false); for (let f = 1; f < 3; f++) { d.killAll(); d.step(.2); advanceFloor(); } d.V.quietCines = false; }
      await new Promise(r => setTimeout(r, 50));
      if (MM.state.current === 'cine') { MM.cine.skip(); await new Promise(r => setTimeout(r, 400)); }
      const boss = () => enemies.find(e => e.mmBoss && e.hp > 0);
      if (!boss()) return { error: 'no boss', st: MM.state.current };
      const kinds = {}; MM.bus.on('hurt', h => { kinds[h.kind] = (kinds[h.kind] || 0) + (h.amount || 0); });
      const hp0 = world.hp; let taken = 0, potions = 0, t = 0, lastHp = world.hp, casts = 0;
      const sig = ['starfall', 'frostbell', 'emberbloom', 'thornbind', 'moonbolt'];
      const danger = (x, y) => kit.telegraphs.some(tg => !tg.friendly && tg.kind !== 'safe' && tg.kind !== 'darkness' && kit.inShape(tg, x, y)) || kit.zones.some(z => !z.friendly && Math.hypot(x - z.x, y - z.y) <= z.r);
      const dt = 1 / 20, SPEED = 1.15;
      while (t < 240 && boss() && MM.state.current === 'play') {
        const b = boss(), here = { x: game.x, y: game.y };
        const dark = kit.telegraphs.find(tg => tg.kind === 'darkness');
        let goal = null;
        if (dark) { const safes = kit.telegraphs.filter(tg => tg.kind === 'safe'); goal = safes.sort((a, c) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(c.x - here.x, c.y - here.y))[0]; if (goal && Math.hypot(goal.x - here.x, goal.y - here.y) < goal.r * .6) goal = null; }
        if (!goal && danger(here.x, here.y)) { let best = null; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; for (const rr of [.8, 1.4, 2]) { const x = here.x + Math.cos(a) * rr, y = here.y + Math.sin(a) * rr; if (x < 1 || y < 1 || x > 19 || y > 19 || danger(x, y)) continue; if (!best || rr < best.rr) best = { x, y, rr }; } } goal = best; }
        if (!goal) { const dd = Math.hypot(b.x - here.x, b.y - here.y); if (dd < 2.6) { const a = Math.atan2(here.y - b.y, here.x - b.x); const x = here.x + Math.cos(a), y = here.y + Math.sin(a); if (!danger(x, y) && x > 1 && y > 1 && x < 19 && y < 19) goal = { x, y }; } }
        if (goal) { const a = Math.atan2(goal.y - here.y, goal.x - here.x), step = Math.min(SPEED * dt, Math.hypot(goal.x - here.x, goal.y - here.y)); const nx = here.x + Math.cos(a) * step, ny = here.y + Math.sin(a) * step; if (!blockedAt(nx, ny)) { game.x = nx; game.y = ny; } }
        // cast best ready spell
        for (const id of sig) { if (!C.spells().find(s => s.id === id && s.unlocked && s.remaining <= 0)) continue; if (id === 'frostbell' && !(b.status.chill || b.status.root || b.mmExposed)) continue; C.selectSpell(id); if (castSpell()) { casts++; break; } }
        if (world.hp < heroMaxHP() * .4 && world.potions > 0) { drink(); potions++; }
        d.step(dt); t += dt;
        if (world.hp < lastHp) taken += lastHp - world.hp; lastHp = world.hp;
      }
      return { kinds, ttk: Math.round(t), alive: !!boss(), state: MM.state.current, taken: Math.round(taken), potions, casts, defeats: C.state.stats.defeats, hpLeft: Math.round(world.hp), maxHP: heroMaxHP(), level: world.level };
    }, F);
    const ok = r && !r.error && !r.alive && r.defeats === 0 && ['play', 'cine', 'ending'].includes(r.state) && r.ttk >= 30 && r.ttk <= 240;
    if (!ok) failed++;
    rows.push(Object.assign({ boss: F.boss, ok }, r));
    console.log((ok ? 'PASS ' : 'FAIL ') + F.boss + ' ' + JSON.stringify(r) + (errors.length ? ' errors=' + errors.slice(0, 2).join('|') : ''));
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify({ pass: failed === 0, rows }));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
