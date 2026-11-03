// Moss & Moon — buildings & interiors test (Playwright/Chromium, file://, real code paths).
// Usage: node tests/interior-test.js [index.html] [outDir=tests/out]
// Checks: MM.buildings.validate() == [] (data + live world obstacles per region); for every enterable building: walk from
// its outside spawn to the door with the real controller, press E (real keydown) -> 'interior'; walk out through the
// doorway -> 'play'; x10 with no loop (state stays 'play' after exit), no duplicate instances, never spawning in walls,
// inventory/hp/gold/quests/world fields unchanged; locked buildings show their message and stay outside; pause menu ->
// resume keeps the same visit; furniture handlers run without errors; chest contents survive save -> page reload ->
// continue; exterior enemies don't act while inside; resize keeps 8:5 without distortion. Saves 2x screenshots
// tests/out/interior-<id>-<day|night>.png. Prints one JSON line; exit code 1 on failure.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = path.resolve(process.argv[2] || 'index.html'), out = path.resolve(process.argv[3] || 'tests/out');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1024, height: 640 } });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const checks = {}, failed = [];
  const check = (n, ok, info) => { checks[n] = info === undefined ? !!ok : { ok: !!ok, info }; if (!ok) failed.push(n); };
  const ev = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  async function toPlay() {
    for (let i = 0; i < 30; i++) {
      const s = await ev(() => { try { MM.cine && MM.cine.isPlaying && MM.cine.isPlaying() && MM.cine.skip(); } catch (e) { /* */ } try { MM.ui && MM.ui.closeAll && MM.ui.closeAll({ silent: true }); } catch (e) { /* */ } return MM.state.current; });
      if (s === 'play') return true; await wait(120); if (i > 6) await ev(() => MM.state.go('play'));
    }
    return false;
  }
  // region switch for the harness: campaign region locks gate goRegion() early in the story, so set the region directly
  // (the tutorial sandbox region is defined here when the TUTORIAL module has not landed it yet)
  const goR = (r) => ev((r) => { if (!REGIONS[r]) REGIONS[r] = { name: r, tint: null, mob: 'slime', level: 1 }; world.region = r; world.mode = 'outside'; world.floor = 0; enemies = []; lootDrops = []; dungeonBlocks = []; drawGround(); MM.camera.snap(); }, r);
  const snapshot = () => ev(() => { const inv = MM.campaign && MM.campaign.inventory ? JSON.stringify(MM.campaign.inventory().groups) : ''; const q = MM.campaign && MM.campaign.quests ? JSON.stringify(MM.campaign.quests().map((x) => [x.id, x.status])) : '';
    return { hp: world.hp, gold: world.gold, potions: world.potions, harvest: JSON.stringify(world.harvest), seeds: JSON.stringify(world.seeds), inv, q, level: world.level, xp: world.xp, region: world.region, day: world.day }; });
  try {
    await p.goto('file://' + file + '#mm-new');
    await p.waitForFunction(() => window.MM && MM.interiors && MM.game && MM.game.active && MM.art && MM.art.ready, null, { timeout: 15000 });
    check('reach-play', await toPlay());
    check('validate-data', (await ev(() => MM.buildings.validate())).length === 0, await ev(() => MM.buildings.validate()));
    check('interior-screen-policy', await ev(() => { const d = MM.screens.def('interior'); return d.sim === 'player' && d.draw === 'custom' && typeof d.render === 'function'; }));
    const blds = await ev(() => MM.buildings.list().map((b) => ({ id: b.id, region: b.region, enterable: b.enterable })));
    const regions = [...new Set(blds.map((x) => x.region))];
    for (const r of regions) {
      await goR(r); await wait(300);
      const v = await ev(() => MM.buildings.validate({ world: true }));
      check('validate-world-' + r, v.length === 0, v);
      const ids = await ev(() => (MM.world.interactables() || []).filter((i) => /^enter:/.test(i.id)).map((i) => i.id));
      const want = blds.filter((x) => x.region === r).map((x) => 'enter:' + x.id);
      check('door-interactables-' + r, want.every((w) => ids.includes(w)), { ids, want });
    }
    for (const B of blds) {
      await goR(B.region); await ev(() => { world.time = 0.3; }); await wait(250); await toPlay();
      if (!B.enterable) {
        await ev((id) => { const s = MM.buildings.get(id).spawn; game.x = s.x; game.y = s.y; MM.camera.snap(); window.__lk = 0; if (!window.__lkOn) { window.__lkOn = 1; MM.bus.on('interior:locked', () => window.__lk++); } }, B.id);
        const r = await ev((id) => { const ok = MM.interiors.interact('enter:' + id); return { ok, state: MM.state.current, prompt: MM.buildings.get(id).interact.prompt, reason: MM.buildings.get(id).lockedReason, lk: window.__lk }; }, B.id);
        check('locked-' + B.id, r.state === 'play' && r.lk === 1 && !!r.reason && !!r.prompt, r);
        continue;
      }
      const before = await snapshot();
      let loops = 0, dup = 0, wall = 0, okCycles = 0, info = [];
      for (let k = 0; k < 10; k++) {
        // walk from the validated outside spawn to the door with the real controller (click-to-move target), then real E
        await ev((id) => { const b = MM.buildings.get(id); game.x = b.spawn.x; game.y = b.spawn.y; game.vx = game.vy = 0; MM.camera.snap(); game.target = { x: b.approach.x, y: b.approach.y - (b.door.face === 'L' ? 0.05 : 0) }; if (b.door.face === 'R') game.target = { x: b.approach.x - 0.05, y: b.approach.y }; }, B.id);
        await p.waitForFunction((id) => { const b = MM.buildings.get(id); return Math.hypot(game.x - b.approach.x, game.y - b.approach.y) < 0.35; }, B.id, { timeout: 4000 }).catch(() => {});
        await wait(k === 0 ? 700 : 80); // first visit: let the door cooldown lapse
        await p.keyboard.press('e'); await wait(150);
        const inS = await ev(() => ({ st: MM.state.current, n: MM.interiors.instance && MM.interiors.instance.items.length, def: MM.interiors.instance && MM.interiors.instance.I.items.length, blk: MM.interiors.active ? MM.interiors._debug.blockedLocal(MM.interiors.local(game.x, game.y).x, MM.interiors.local(game.x, game.y).y) : null, cand: MM.interiors.active ? MM.interiors.candidates().length : 0 }));
        if (inS.st !== 'interior') { info.push('enter failed @' + k + ' ' + JSON.stringify(inS)); break; }
        if (inS.n !== inS.def) dup++; if (inS.blk) wall++;
        if (k === 0) { // screenshot (2x canvas) day + night, and the menu-resume check
          await wait(500); await p.locator('#scene').screenshot({ path: path.join(out, 'interior-' + B.id + '-day.png') });
          await ev(() => { world.time = 0.85; }); await wait(250); await p.locator('#scene').screenshot({ path: path.join(out, 'interior-' + B.id + '-night.png') }); await ev(() => { world.time = 0.3; });
          const t0 = await ev(() => MM.interiors.instance.t0);
          await ev(() => MM.state.go('menu')); await wait(120); await ev(() => MM.state.go('interior')); await wait(120);
          const same = await ev((t0) => MM.state.current === 'interior' && MM.interiors.instance && MM.interiors.instance.t0 === t0, t0);
          check('pause-resume-same-visit-' + B.id, same);
          // exterior enemies must not act while inside
          const e0 = await ev(() => { spawnGroup('slime', 2); return { hp: world.hp, pos: enemies.map((e) => [e.x, e.y]) }; });
          await wait(600);
          const e1 = await ev(() => ({ hp: world.hp, pos: enemies.map((e) => [e.x, e.y]) }));
          check('no-exterior-sim-inside-' + B.id, e0.hp === e1.hp && JSON.stringify(e0.pos) === JSON.stringify(e1.pos));
          await ev(() => { enemies = []; });
          // every furniture handler runs (UI opens/closes) without throwing
          const hs = await ev(() => { const r = []; for (const c of MM.interiors.candidates()) { if (c.kind === 'exit' || c.kind === 'rest') continue; let ok = true; try { ok = MM.interiors.interact(c) !== false; } catch (e) { ok = false; } r.push(c.kind + ':' + ok); try { MM.ui && MM.ui.closeAll && MM.ui.closeAll({ silent: true }); } catch (e) { /* */ } if (MM.state.current !== 'interior') MM.state.go('interior'); } return r; });
          check('handlers-' + B.id, hs.every((x) => x.endsWith(':true')), hs);
          await wait(200); await ev(() => { try { MM.ui.closeAll({ silent: true }); } catch (e) { /* */ } if (MM.state.current !== 'interior') MM.state.go('interior'); });
          const pr = await ev(() => { const c = MM.world.currentPrompt(); return c && c.interior ? 'interior' : c ? c.kind : null; });
          check('exterior-prompts-hidden-' + B.id, pr === 'interior' || pr === null, pr);
        }
        // walk out through the doorway (real controller)
        await ev(() => { const I = MM.interiors.instance.I, d = I.door; const t = d.face === 'L' ? MM.interiors.toWorld(d.cx, I.D + 0.45) : MM.interiors.toWorld(I.W + 0.45, d.cy); game.target = t; });
        const outOk = await p.waitForFunction(() => MM.state.current === 'play', null, { timeout: 5000 }).then(() => true).catch(() => false);
        if (!outOk) { info.push('exit failed @' + k); break; }
        await ev(() => { game.target = null; }); await wait(450);
        const after = await ev((id) => { const b = MM.buildings.get(id); return { st: MM.state.current, d: Math.hypot(game.x - b.spawn.x, game.y - b.spawn.y) }; }, B.id);
        if (after.st !== 'play') loops++;
        if (after.d > 0.6) info.push('spawn drift ' + after.d.toFixed(2));
        okCycles++;
      }
      check('enter-exit-x10-' + B.id, okCycles === 10 && !loops && !dup && !wall, { okCycles, loops, dup, wall, info });
      const after = await snapshot();
      check('state-preserved-' + B.id, JSON.stringify(before) === JSON.stringify(after), { before, after });
    }
    // rest at the cottage bed: quarter day + heal
    await goR('grove'); await ev(() => { world.time = 0.3; world.hp = 40; }); await toPlay();
    await ev(() => MM.interiors.enter('home', { force: true }));
    const rest = await ev(() => { const t = world.time, c = MM.interiors.candidates().find((x) => x.kind === 'rest'); MM.interiors.interact(c); return { dt: +(world.time - t).toFixed(3), hp: world.hp, max: heroMaxHP() }; });
    check('rest-quarter-day-heal', Math.abs(rest.dt - 0.25) < 0.01 && rest.hp === rest.max, rest);
    // chest persistence across save -> reload -> continue
    await ev(() => { MM.interiors.transfer('home', 'home_chest', 'potion', 1, true); MM.ui && MM.ui.closeAll && MM.ui.closeAll({ silent: true }); MM.interiors.exit(); });
    await toPlay();
    const chest0 = await ev(() => { MM.save.save({ force: true, silent: true }); return MM.interiors.chest('home', 'home_chest'); });
    await p.goto('file://' + file); await p.waitForFunction(() => window.MM && MM.interiors && MM.game, null, { timeout: 15000 });
    await ev(() => MM.game.continueGame()); await toPlay();
    const chest1 = await ev(() => MM.interiors.chest('home', 'home_chest'));
    check('chest-persists-reload', JSON.stringify(chest0) === JSON.stringify(chest1) && chest1.potion >= 2, { chest0, chest1 });
    // saving while indoors restores outside the door
    await goR('grove'); await toPlay(); await ev(() => MM.interiors.enter('home', { force: true }));
    await ev(() => MM.save.save({ force: true, silent: true }));
    await p.goto('file://' + file); await p.waitForFunction(() => window.MM && MM.interiors && MM.game, null, { timeout: 15000 });
    const ld = await ev(() => { const r = MM.game.continueGame(); const s = MM.buildings.get('home').spawn; return { ok: r.ok, d: Math.hypot(game.x - s.x, game.y - s.y), st: MM.state.current, act: MM.interiors.active }; });
    check('save-inside-loads-outside-door', ld.ok && ld.d < 0.01 && !ld.act, ld);
    // resize: stage stays 8:5, canvas stays 512x320 (no distortion) inside an interior
    await toPlay(); await ev(() => MM.interiors.enter('home', { force: true }));
    const sizes = [];
    for (const [w, h] of [[390, 844], [1500, 520], [1280, 800]]) {
      await p.setViewportSize({ width: w, height: h }); await wait(300);
      sizes.push(await ev(() => { const c = document.getElementById('scene'), r = c.getBoundingClientRect(); return { cw: c.width, ch: c.height, ar: +(r.width / r.height).toFixed(3), st: MM.state.current }; }));
    }
    check('resize-no-distortion', sizes.every((s) => s.cw === 512 && s.ch === 320 && Math.abs(s.ar - 1.6) < 0.01 && s.st === 'interior'), sizes);
    await p.setViewportSize({ width: 1024, height: 640 });
    check('missing-sprites-listed', Array.isArray(await ev(() => MM.buildings.missingSprites())), await ev(() => MM.buildings.missingSprites().length));
  } catch (e) { errors.push('test: ' + (e && e.stack || e)); }
  const real = errors.filter((e) => !/willReadFrequently/.test(e));
  check('no-console-errors', real.length === 0, real.slice(0, 8));
  const res = { pass: failed.length === 0, failed, checks };
  console.log(JSON.stringify(res));
  await b.close();
  process.exit(res.pass ? 0 : 1);
})();
