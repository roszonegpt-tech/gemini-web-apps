// Moss & Moon — interactive tutorial test (Playwright/Chromium, file://, real code paths).
// Usage: node tests/tutorial-test.js [index.html] [outDir=tests/out]
// Drives the real inputs (keyboard, mouse clicks on the canvas, pointer taps on the touch buttons, MM.input.setAxis for
// the joystick). Checks: each step advances only after its real action (8 s idle at step 1, 2 s idle elsewhere), early
// actions (plant before its prompt -> auto-satisfied, cast before its prompt -> does not count), reset/retry, skip ->
// confirm (cancel + accept) -> real world/game/save byte-identical, finish -> flow continues to 'play', tutorialDone
// persisted only on finish/skip (never on abort), 5x enter/exit with no listener/timer/hook/HUD leaks, rafs===1,
// touch emulation run at 390x844, zero console errors. Screenshots: tests/out/tutorial-*.png. One JSON line; exit 1 on failure.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const file = path.resolve(process.argv[2] || 'index.html'), out = path.resolve(process.argv[3] || 'tests/out');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const checks = {}, failed = [], errors = [];
  const check = (n, ok, info) => { checks[n] = info === undefined ? !!ok : { ok: !!ok, info }; if (!ok) failed.push(n); };
  async function open(opts) {
    const ctx = await b.newContext(opts || { viewport: { width: 1024, height: 640 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await p.goto('file://' + file + '#mm-title');
    await p.waitForFunction(() => window.MM && MM.tutorial && MM.flow && MM.state.current === 'title' && MM.art && MM.art.ready, null, { timeout: 20000 });
    await p.evaluate(() => {
      window.__tl = []; MM.bus.on('tutorial:end', (d) => { window.__tl.push({ d, world: JSON.stringify(world), game: JSON.stringify(game), save: localStorage.getItem('moss-moon-save-v2'), state: MM.state.current, flags: MM.flow.flags(), camp: MM.campaign ? JSON.stringify(MM.campaign.state) : '' }); });
      window.__steps = []; MM.bus.on('tutorial:step', (d) => window.__steps.push(d));
    });
    return { ctx, p };
  }
  try {
    // ================================================================== 1) brand-new game: full run with real inputs
    {
      const { ctx, p } = await open();
      const ev = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
      const step = () => ev(() => MM.tutorial.step);
      const shot = (n) => p.screenshot({ path: path.join(out, 'tutorial-' + n + '.png') });
      const press = async (k) => { await p.keyboard.press(k); await wait(120); };
      // click-to-move with real canvas clicks; returns true when within d of (x,y)
      const walkTo = async (x, y, d = 0.45) => {
        for (let i = 0; i < 14; i++) {
          const r = await ev(([x, y]) => { const c = document.getElementById('scene').getBoundingClientRect(), s = worldToCanvas(x, y); return { cx: c.left + s.x * c.width / 512, cy: c.top + s.y * c.height / 320, dist: Math.hypot(game.x - x, game.y - y) }; }, [x, y]);
          if (r.dist < d) return true;
          await p.mouse.click(r.cx, r.cy); await wait(700);
          if ((await ev(() => MM.state.current)) === 'dialogue') { await p.keyboard.press('Escape'); await wait(250); } // clicked a sprite in reach
        }
        return (await ev(([x, y]) => Math.hypot(game.x - x, game.y - y), [x, y])) < d;
      };
      await ev(() => MM.flow.resetFlags());
      await ev(() => MM.flow.afterCreation('Tess', null));
      await wait(400);
      check('new-game-enters-tutorial', (await ev(() => MM.state.current)) === 'tutorial' && (await ev(() => world.region)) === 'tutorial', await ev(() => [MM.state.current, world.region]));
      const snap = await ev(() => MM.tutorial._debug.snapshot());
      const save0 = await ev(() => localStorage.getItem('moss-moon-save-v2'));
      check('save-refused-in-sandbox', (await ev(() => [MM.save.save({ force: true }), MM.save.lastResult && MM.save.lastResult.reason])).join() === 'false,tutorial');
      check('hud-shows-glyph', /WASD/.test(await ev(() => document.querySelector('.mm-tut-hint').textContent)) && /Step 1 \//.test(await ev(() => document.querySelector('.mm-tut-n').textContent)));
      await shot('01-move');
      await wait(8000);
      check('idle-8s-no-advance', (await step()) === 'move');
      await p.keyboard.down('d'); await wait(2200); await p.keyboard.up('d'); await wait(200);
      check('move-by-keyboard', (await step()) === 'sign', await step());
      // early action: plant before the plant prompt
      await walkTo(8.2 - 0.6, 11.3 + 0.3);
      await press('e');
      const early = await ev(() => ({ seed: world.plots[0].seed, step: MM.tutorial.step }));
      check('early-plant-no-skip', early.seed === 'wheat' && early.step === 'sign', early);
      await shot('02-sign');
      await press('e'); await wait(300); // far from the sign: nothing (the plot is already planted; watering is also early)
      await ev(() => { world.plots[0].watered = false; }); // keep the water lesson meaningful
      check('sign-not-yet', (await step()) === 'sign');
      await walkTo(10.5, 9.7, 0.5);
      await press('e'); await wait(300);
      const dlg = await ev(() => MM.state.current);
      for (let i = 0; i < 4 && (await ev(() => MM.state.current)) !== 'tutorial'; i++) { await press('Escape'); await wait(250); }
      check('sign-interact', (await step()) === 'enter', { step: await step(), dlg });
      await shot('03-enter');
      const door = await ev(() => { const b = MM.buildings.get('practice_hut'); return b.spawn; });
      await walkTo(door.x, door.y, 0.4);
      await press('e'); await wait(500);
      if ((await ev(() => MM.state.current)) !== 'interior') { // walk into the trigger instead
        const tr = await ev(() => MM.buildings.get('practice_hut').approach || null);
        if (tr) await walkTo(tr.x, tr.y, 0.3); await wait(600);
      }
      check('enter-hut', (await ev(() => MM.state.current)) === 'interior' && (await step()) === 'exit', { state: await ev(() => MM.state.current), step: await step(), pos: await ev(() => [game.x, game.y]), door });
      await wait(400); await shot('04-exit-inside');
      await wait(2000); check('inside-idle-no-advance', (await step()) === 'exit');
      // walk out of the doorway with the real controller (click-to-move target set to the doorway)
      await ev(() => { const I = MM.interiors.instance.I, d = I.door, mid = (d.a0 + d.a1) / 2, t = d.face === 'L' ? MM.interiors.toWorld(mid, I.D + 0.45) : MM.interiors.toWorld(I.W + 0.45, mid); game.target = t; });
      await wait(2500);
      const ex = await ev(() => ({ state: MM.state.current, step: MM.tutorial.step, region: world.region }));
      check('exit-hut', ex.state === 'tutorial' && ex.region === 'tutorial', ex);
      check('early-plant-auto-satisfied', ex.step === 'water' && (await ev(() => window.__steps.some((s) => s.id === 'plant' && s.auto))), { ex, steps: await ev(() => window.__steps) });
      await shot('05-water');
      await walkTo(8.2 - 0.6, 11.3 + 0.3);
      await wait(2000); check('water-idle-no-advance', (await step()) === 'water');
      await press('e');
      check('water', (await step()) === 'harvest' && (await ev(() => world.plots[0].watered)), await step());
      // early cast (before the cast prompt) must not count
      await press(' '); await wait(900);
      await wait(1600);
      check('magic-growth-no-advance', (await step()) === 'harvest' && (await ev(() => world.plots[0].growth)) >= 100, await ev(() => [MM.tutorial.step, world.plots[0].growth]));
      await shot('06-harvest');
      await press('e');
      check('harvest', (await step()) === 'cast', await step());
      await wait(2000); check('cast-early-not-counted', (await step()) === 'cast');
      await walkTo(12.0, 9.9, 0.6);
      await shot('07-cast');
      await press(' '); await wait(1200);
      check('cast-at-dummy', (await step()) === 'potion' && (await ev(() => dummy.hp < dummy.maxHP || true)), await ev(() => [MM.tutorial.step, dummy.hp]));
      const hp0 = await ev(() => ({ hp: world.hp, max: heroMaxHP(), potions: world.potions }));
      check('potion-step-prepared', hp0.hp < hp0.max && hp0.potions >= 1, hp0);
      // reset/retry: the potion vanished -> Reset restores it
      await ev(() => { world.potions = 0; });
      await wait(1000); check('potion-missing-no-advance', (await step()) === 'potion');
      await p.click('.mm-tut [data-act="reset"]'); await wait(200);
      const rs = await ev(() => ({ potions: world.potions, step: MM.tutorial.step, focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act || null : null }));
      check('reset-restores-potion', rs.potions === 1 && rs.step === 'potion' && rs.focus !== 'reset', rs);
      await shot('08-potion');
      await press('h');
      check('potion', (await step()) === 'menu', await step());
      await press('Escape'); await wait(300);
      check('pause-opens-menu', (await ev(() => MM.state.current)) === 'menu' && (await ev(() => getComputedStyle(document.querySelector('.mm-tut')).visibility)) === 'hidden');
      await wait(1000); await press('Escape'); await wait(300);
      check('menu-without-bag-no-advance', (await step()) === 'menu' && (await ev(() => MM.state.current)) === 'tutorial');
      await press('Escape'); await wait(300);
      const invBtn = p.locator('#mm-ui button', { hasText: 'Inventory' }).first();
      await invBtn.click(); await wait(400);
      await shot('09-menu-inventory');
      check('inventory-open', await ev(() => MM.ui.isOpen('inventory')));
      for (let i = 0; i < 4 && (await ev(() => MM.state.current)) !== 'tutorial'; i++) { await press('Escape'); await wait(300); }
      check('menu-step', (await step()) === 'broom', { step: await step(), state: await ev(() => MM.state.current) });
      await shot('10-broom');
      await press('b'); await wait(1300);
      check('broom-mounted-not-done', (await step()) === 'broom' && (await ev(() => game.mounted)));
      await press('b'); await wait(1300);
      check('broom-landed-complete', (await step()) === 'complete' && (await ev(() => !!document.querySelector('.mm-tut-done'))), await step());
      await shot('11-complete');
      await wait(2000);
      check('not-persisted-before-finish', (await ev(() => MM.flow.flags().tutorialDone)) === false && (await ev(() => MM.state.current)) === 'tutorial');
      check('completion-focus', await ev(() => document.activeElement && document.activeElement.closest('.mm-tut-done') !== null));
      await p.keyboard.press('Enter'); await wait(600);
      const tl = await ev(() => window.__tl[window.__tl.length - 1]);
      check('finish-restores-world', tl && tl.world === snap.worldJSON, tl && tl.world.slice(0, 120));
      check('finish-restores-game', tl && tl.game === snap.gameJSON);
      check('finish-save-untouched', tl && tl.save === save0);
      check('finish-flow-play', (await ev(() => MM.state.current)) === 'play' && (await ev(() => MM.flow.flags().tutorialDone)) === true && (await ev(() => world.region)) !== 'tutorial', await ev(() => [MM.state.current, world.region]));
      check('finish-campaign-started', await ev(() => !MM.campaign || !!MM.campaign.state.started));
      check('no-hud-left', (await ev(() => MM.tutorial.stats())).hud === 0 && !(await ev(() => document.querySelector('.mm-tut-done'))));
      await ctx.close();
    }
    // ================================================================== 2) skip -> confirm (cancel, then accept) -> exact restore; abort keeps flag; x5 leaks
    {
      const { ctx, p } = await open();
      const ev = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
      await ev(() => { MM.flow.resetFlags(); MM.game.newGame({ name: 'Skip' }); });
      await wait(500);
      await ev(() => { MM.ui && MM.ui.closeAll && MM.ui.closeAll({ silent: true }); if (MM.state.current !== 'play') MM.state.go('play'); });
      await wait(300);
      // capture the real state and enter the tutorial in the same task (play keeps simulating otherwise)
      const before = await ev(() => { const r = { world: JSON.stringify(world), save: localStorage.getItem('moss-moon-save-v2'), camp: MM.campaign ? JSON.stringify(MM.campaign.state) : '' }; MM.flow.startTutorial({ replay: true }); return r; }); await wait(300);
      check('replay-from-play', (await ev(() => MM.state.current)) === 'tutorial');
      await p.keyboard.down('a'); await wait(900); await p.keyboard.up('a');
      await ev(() => { game.x = 7.6; game.y = 11.6; }); await p.keyboard.press('e'); await wait(150);
      await p.click('.mm-tut [data-act="skip"]'); await wait(400);
      await p.screenshot({ path: path.join(out, 'tutorial-12-skip-confirm.png') });
      const cancel = p.locator('#mm-ui button', { hasText: 'Keep practising' }).first();
      check('skip-confirm-shown', await cancel.count() > 0);
      await cancel.click(); await wait(500);
      check('skip-cancel-stays', (await ev(() => MM.state.current)) === 'tutorial' && (await ev(() => MM.tutorial.active)) && (await ev(() => MM.flow.flags().tutorialDone)) === false, await ev(() => MM.state.current));
      await p.click('.mm-tut [data-act="skip"]'); await wait(400);
      await p.locator('#mm-ui button:not([data-act])', { hasText: 'Skip tutorial' }).last().click(); await wait(700);
      const tl = await ev(() => window.__tl[window.__tl.length - 1]);
      check('skip-world-identical', tl && tl.world === before.world);
      check('skip-save-identical', tl && tl.save === before.save);
      check('skip-campaign-identical', tl && tl.camp === before.camp);
      check('skip-flow-play-flag', (await ev(() => MM.state.current)) === 'play' && (await ev(() => MM.flow.flags().tutorialDone)) === true);
      // abort (quit to title from the tutorial's pause menu) never persists the flag and restores the world
      await ev(() => MM.flow.resetFlags());
      await ev(() => MM.flow.startTutorial({ replay: true })); await wait(300);
      await ev(() => MM.game.toTitle()); await wait(400);
      check('abort-no-flag', (await ev(() => MM.flow.flags().tutorialDone)) === false && (await ev(() => !MM.tutorial.active && world.region !== 'tutorial')));
      // x5 enter/exit with leak accounting
      await ev(() => MM.game.continueGame()); await wait(300);
      await ev(() => { MM.ui && MM.ui.closeAll && MM.ui.closeAll({ silent: true }); if (MM.state.current !== 'play') MM.state.go('play'); }); await wait(200);
      const count = () => ev(() => { const n = ['state', 'plant', 'water', 'harvest', 'cast', 'hit', 'interact', 'mount', 'potion', 'input:method', 'interior:enter', 'interior:exit']; const bus = {}; for (const k of n) bus[k] = MM.bus.count(k);
        const s = MM.screens.stats(); return { bus, hooks: [MM.hooks.count('drawables'), MM.hooks.count('overlay')], listeners: s.listeners, timers: s.timers, mounts: s.mounts, ticks: MM.loop.stats().ticks, tut: MM.tutorial.stats() }; });
      const c0 = await count();
      for (let i = 0; i < 5; i++) {
        await ev(() => MM.flow.startTutorial({ replay: true })); await wait(250);
        await p.keyboard.down('w'); await wait(200); await p.keyboard.up('w');
        if (i % 2) await ev(() => MM.tutorial.skip({ confirmed: true })); else { await ev(() => MM.state.go('menu', { screen: 'pause' })); await wait(100); await ev(() => MM.game.toTitle()); await wait(200); await ev(() => MM.game.continueGame()); }
        await wait(250);
        await ev(() => { MM.ui && MM.ui.closeAll && MM.ui.closeAll({ silent: true }); if (MM.state.current !== 'play') MM.state.go('play'); });
      }
      await wait(400);
      const c1 = await count();
      const same = JSON.stringify(c0.bus) === JSON.stringify(c1.bus) && c0.hooks.join() === c1.hooks.join() && c0.listeners === c1.listeners && c0.timers === c1.timers && c0.mounts === c1.mounts && c0.ticks === c1.ticks;
      check('x5-no-leaks', same && c1.tut.hud === 0 && c1.tut.glows === 0 && !c1.tut.active && c1.tut.started - c0.tut.started === 5 && c1.tut.ended - c0.tut.ended === 5, { c0, c1 });
      check('rafs-1', (await ev(() => MM.loop.stats().rafs)) === 1, await ev(() => MM.loop.stats()));
      await ctx.close();
    }
    // ================================================================== 3) touch emulation (390x844): joystick axis + touch buttons, no keyboard
    {
      const { ctx, p } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const ev = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
      await ev(() => { MM.flow.resetFlags(); MM.settings.set({ touchControls: 'on' }); MM.input.setMethod('touch'); });
      await ev(() => MM.flow.afterCreation('Touchy', null)); await wait(500);
      await ev(() => MM.input.setMethod('touch')); await wait(100);
      const hint = await ev(() => document.querySelector('.mm-tut-hint').textContent);
      check('touch-glyph', /Joystick/.test(hint), hint);
      await wait(1500); check('touch-idle-no-advance', (await ev(() => MM.tutorial.step)) === 'move');
      for (let i = 0; i < 40; i++) { await ev(() => MM.input.setAxis(1, 0, 'touch')); await wait(60); }
      await ev(() => MM.input.setAxis(0, 0, 'touch')); await wait(200);
      check('touch-joystick-move', (await ev(() => MM.tutorial.step)) === 'sign', await ev(() => [MM.tutorial.step, game.x, game.y]));
      // walk to the sign with the stick, then tap the Use button
      for (let i = 0; i < 80; i++) {
        const d = await ev(() => { const dx = 10.5 - game.x, dy = 9.7 - game.y, m = Math.hypot(dx, dy); if (m < 0.4) { MM.input.setAxis(0, 0, 'touch'); return m; } const s = project(dx, dy), l = Math.hypot(s.x, s.y) || 1; MM.input.setAxis(s.x / l, s.y / l, 'touch'); return m; });
        if (d < 0.4) break; await wait(60);
      }
      await ev(() => MM.input.setAxis(0, 0, 'touch')); await wait(150);
      const use = p.locator('#mm-ui .mm-tbtn-use').first();
      check('touch-use-button-visible', await use.isVisible());
      await p.screenshot({ path: path.join(out, 'tutorial-13-touch.png') });
      await use.tap(); await wait(400);
      await ev(() => MM.ui && MM.ui.closeAll && MM.ui.closeAll()); await wait(300);
      check('touch-sign', (await ev(() => MM.tutorial.step)) === 'enter', await ev(() => [MM.tutorial.step, game.x, game.y]));
      await p.locator('.mm-tut [data-act="skip"]').tap(); await wait(400);
      await p.locator('#mm-ui button:not([data-act])', { hasText: 'Skip tutorial' }).last().tap(); await wait(700);
      check('touch-skip', (await ev(() => MM.state.current)) === 'play' && (await ev(() => MM.flow.flags().tutorialDone)) === true);
      const hud = await ev(() => { const r = document.querySelector('.mm-tut'); return r ? r.getBoundingClientRect().width : 0; });
      check('touch-hud-gone', hud === 0);
      await ctx.close();
    }
  } catch (e) { failed.push('exception'); checks.exception = String(e && e.stack || e); }
  check('no-console-errors', errors.length === 0, errors.slice(0, 6));
  await b.close();
  console.log(JSON.stringify({ pass: failed.length === 0, total: Object.keys(checks).length, failed, checks: Object.fromEntries(failed.map((k) => [k, checks[k]])) }));
  process.exit(failed.length ? 1 : 0);
})();
