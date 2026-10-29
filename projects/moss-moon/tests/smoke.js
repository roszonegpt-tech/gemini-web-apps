// Moss & Moon smoke test (Playwright/Chromium, file://).
// Usage: node tests/smoke.js [path-to-html=index.html] [screenshot=tests/smoke.png]
// Checks: no console errors/page errors, canvas painted (non-uniform), boot -> title -> new game -> play via window.__mm,
// frames advance, keyboard moves the witch, pause freezes game.elapsed and blocks input, save/load round trip,
// corrupt-save recovery (backup + total corruption), v1 migration, settings persistence across reload.
// Prints one JSON line {file, pass, failed:[...], checks:{...}, errors:[...]}; exit code 1 on any failure.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const file = path.resolve(process.argv[2] || 'index.html');
  const shot = process.argv[3] || 'tests/smoke.png';
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const checks = {}, failed = [];
  const check = (name, ok, info) => { checks[name] = info === undefined ? !!ok : { ok: !!ok, info }; if (!ok) failed.push(name); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const st = () => ev(() => window.__mm.getState());
  const wait = (ms) => page.waitForTimeout(ms);
  async function waitFor(fn, arg, timeout = 5000) {
    try { await page.waitForFunction(fn, arg, { timeout }); return true; } catch (e) { return false; }
  }
  // Campaign/cinematics may take over right after newGame; skip back to play for the mechanical checks.
  async function ensurePlay() {
    for (let i = 0; i < 20; i++) {
      const s = await ev(() => window.MM.state.current);
      if (s === 'play') return true;
      await ev(() => { try { window.MM.cine && window.MM.cine.isPlaying && window.MM.cine.isPlaying() && window.MM.cine.skip(); } catch (e) { /* ignore */ } });
      await wait(150);
      if (i > 4) await ev(() => window.__mm.setState('play'));
    }
    return (await ev(() => window.MM.state.current)) === 'play';
  }

  try {
    await page.goto('file://' + file);
    check('reached title', await waitFor(() => window.__mm && window.MM && window.MM.state.current === 'title'));
    await wait(400);
    const colors = await ev(() => window.__mm.canvasColors());
    check('canvas painted (title)', colors > 30, colors);
    check('legacy shim 59 ids', await ev(() => window.MM.legacyShim && window.MM.legacyShim.ids.length === 59 && window.MM.legacyShim.ids.every((id) => document.getElementById(id))));

    // ---- new game -> play
    check('newGame', await ev(() => window.__mm.newGame({ name: 'Smoke' })));
    check('state play', await ensurePlay());
    const s0 = await st();
    check('game active + saved', s0.active && s0.saveStatus === 'ok', s0.saveStatus);
    await wait(500);
    const s1 = await st();
    check('frames advance', s1.elapsed > s0.elapsed + 0.2, [s0.elapsed, s1.elapsed]);
    await page.locator('#scene').focus();
    await page.keyboard.down('d'); await wait(600); await page.keyboard.up('d');
    const s2 = await st();
    check('keyboard moves witch', s2.x > s1.x + 0.05, [s1.x, s2.x]);
    const playColors = await ev(() => window.__mm.canvasColors());
    check('canvas painted (play)', playColors > 30, playColors);

    // ---- pause freezes sim and input
    await ev(() => window.__mm.setState('menu', { screen: 'pause' }));
    await wait(100);
    const p0 = await st();
    await page.keyboard.down('d'); await wait(400); await page.keyboard.up('d');
    const p1 = await st();
    check('pause freezes elapsed', p0.paused && p1.elapsed === p0.elapsed, [p0.elapsed, p1.elapsed]);
    check('pause blocks input', p1.x === p0.x, [p0.x, p1.x]);
    await ev(() => window.__mm.setState('play'));
    await wait(300);
    check('resume advances', (await st()).elapsed > p1.elapsed);

    // ---- save / load round trip
    const rt = await ev(() => {
      const w = window.__mm.world(); window.__mm.teleport(12.5, 6.5); w.gold = 4321; w.potions = 7;
      const saved = window.__mm.save(true);
      w.gold = 1; w.potions = 0; window.__mm.teleport(3, 3);
      const r = window.__mm.continueGame(); const n = window.__mm.world(), g = window.__mm.game();
      return { saved, r, gold: n.gold, potions: n.potions, x: g.x, y: g.y, state: window.MM.state.current };
    });
    check('save/load round trip', rt.saved && rt.r.ok && rt.gold === 4321 && rt.potions === 7 && Math.abs(rt.x - 12.5) < 0.01 && Math.abs(rt.y - 6.5) < 0.01, rt);
    await ensurePlay();

    // ---- corrupt save: primary damaged -> backup restored; everything damaged -> safe failure, game keeps running
    const cr = await ev(() => {
      window.__mm.world().gold = 999; window.__mm.save(true); // backup now holds gold 4321-or-later save
      localStorage.setItem('moss-moon-save-v2', '{"v":2,"sections":{oops');
      const a = window.MM.save.load();
      localStorage.setItem('moss-moon-save-v2', 'not json'); localStorage.setItem('moss-moon-save-v2-bak', '[]'); localStorage.removeItem('moss-moon-adventure-v1');
      const b = window.MM.save.load();
      return { a, b, hasSave: window.MM.save.hasSave(), status: window.MM.save.status(), corruptKept: !!localStorage.getItem('moss-moon-save-v2-corrupt'), world: !!window.__mm.world() };
    });
    check('corrupt -> backup restored', cr.a.ok && cr.a.restored === 'backup', cr.a);
    check('corrupt -> safe failure', !cr.b.ok && cr.b.reason === 'corrupt' && !cr.hasSave && cr.status === 'corrupt' && cr.corruptKept && cr.world, cr);
    await ev(() => window.__mm.setState('play'));
    const c0 = await st(); await wait(300); const c1 = await st();
    check('runs after corrupt load', c1.elapsed > c0.elapsed);

    // ---- v1 migration
    const mg = await ev(() => {
      window.MM.save.erase();
      const v1 = { cls: 'grove', region: 'forest', mode: 'outside', floor: 0, day: 4, time: 0.3, gold: 777, hp: 80, mana: 50, level: 3, xp: 10, points: 0,
        skillByClass: { grove: [1, 0, 0] }, seed: 'wheat', seeds: { wheat: 9 }, harvest: { wheat: 2 }, potions: 1, bombs: 0, runes: 0,
        gear: [{ name: 'Rare Wand of Focus', rarity: 'Rare', power: 5, affix: 'Focus', sockets: 0, maxSockets: 1 }, { bogus: true }], equipped: 7,
        plots: [], wards: [], familiar: 'raven', broom: 1 };
      localStorage.setItem('moss-moon-adventure-v1', JSON.stringify(v1));
      localStorage.setItem('moss-moon-look', JSON.stringify({ style: 'neutral', skin: 'tan', hair: 'gold', outfit: 'plum' }));
      const status = window.MM.save.status(), sum = window.MM.save.summary();
      const r = window.__mm.continueGame(); const w = window.__mm.world();
      return { status, sum, r, gold: w.gold, level: w.level, region: w.region, familiar: w.familiar, gear: w.gear.length, equipped: w.equipped, plots: w.plots.length,
        enemies: window.__mm.getState().enemies, look: window.__witchDemo.getLook() };
    });
    check('v1 migration', mg.status === 'v1' && mg.sum && mg.sum.level === 3 && mg.r.ok && mg.r.migrated && mg.gold === 777 && mg.level === 3 &&
      mg.region === 'forest' && mg.familiar === 'raven' && mg.gear === 1 && mg.equipped === null && mg.plots === 6 && mg.enemies > 0 && mg.look.style === 'neutral', mg);
    await ensurePlay();

    // ---- settings persistence (across reload)
    const sp = await ev(() => { const S = window.MM.settings; S.set('quality', 'high'); S.set('particles', 'low'); S.set('volMusic', 0.25); S.set('volMusic', 7); S.set('bogus', 1); return S.all(); });
    check('settings validate + presets', sp.quality === 'custom' && sp.softFilter === 'medium' && sp.bloom === 'high' && sp.particles === 'low' && sp.volMusic === 1, sp);
    await page.reload();
    check('title after reload', await waitFor(() => window.__mm && window.MM.state.current === 'title'));
    const sr = await ev(() => ({ all: window.MM.settings.all(), ps: window.MM.settings.particleScale(), hasSave: window.MM.save.hasSave() }));
    check('settings persisted', sr.all.quality === 'custom' && sr.all.particles === 'low' && sr.all.volMusic === 1 && sr.ps === 0.35, sr.all);
    check('save persisted across reload', sr.hasSave);
    await ev(() => window.MM.settings.reset());

    await wait(200);
    await page.screenshot({ path: shot });
  } catch (e) {
    failed.push('exception: ' + e.message);
  }
  check('no console errors', errors.length === 0, errors.slice(0, 10));
  console.log(JSON.stringify({ file, pass: failed.length === 0, failed, checks, errors }));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
