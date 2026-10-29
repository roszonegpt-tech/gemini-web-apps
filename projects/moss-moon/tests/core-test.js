// CORE tests. Usage: node tests/core-test.js [--unit-only]
// Part A (Node vm, fast): src/core/mm.js in isolation — bus, settings, state, hooks, camera, save envelope/migration/corruption,
//   storage-unavailable fallback, late section registration, import/export.
// Part B (Playwright, file://): baseline seams and fixes in the real page — baseline alone (no MM, no shim), letterboxed pointer
//   mapping, integer scaling, hooks + custom drawables, events, night-raid fix, P2 mana, defeat/respawn, boss-floor reload,
//   shake/particle settings, single-file build loads. Prints a summary; exit 1 on any failure.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const MM_SRC = fs.readFileSync(path.join(ROOT, 'src/core/mm.js'), 'utf8');
const results = [];
function ok(name, cond, info) { results.push({ name, ok: !!cond, info }); if (!cond) console.log('FAIL ' + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); }

// ------------------------------------------------------------------ Part A: unit tests in a vm sandbox
function makeStore(broken) {
  const m = new Map();
  return {
    _m: m,
    getItem(k) { if (broken) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (broken) throw new Error('SecurityError'); m.set(k, String(v)); },
    removeItem(k) { if (broken) throw new Error('SecurityError'); m.delete(k); },
  };
}
function loadMM(opts = {}) {
  const store = opts.store || makeStore(opts.broken);
  const logs = [];
  const sandbox = {
    console: { log() {}, warn: (...a) => logs.push(['warn', a.join(' ')]), error: (...a) => logs.push(['error', a.map(String).join(' ')]) },
    performance: { now: () => (opts.clock ? opts.clock.t : Date.now()) }, Date, JSON, Math, Number, String, Object, Array, Map, Set, WeakMap, Error, Promise,
    localStorage: store, matchMedia: () => ({ matches: !!opts.reduced }),
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  if (opts.baseline) Object.assign(sandbox, opts.baseline(sandbox));
  vm.createContext(sandbox);
  vm.runInContext(MM_SRC, sandbox, { filename: 'mm.js' });
  return { MM: sandbox.MM, store, logs, sb: sandbox };
}
function unit() {
  // bus
  { const { MM, logs } = loadMM(); const got = [];
    MM.bus.on('x', () => { throw new Error('boom'); }); const off = MM.bus.on('x', (d) => got.push(d)); MM.bus.once('x', (d) => got.push('once' + d));
    MM.bus.on('*', (d, n) => got.push('*' + n)); MM.bus.emit('x', 1); MM.bus.emit('x', 2); off(); MM.bus.emit('x', 3);
    ok('bus: errors isolated, once, off, wildcard', JSON.stringify(got) === JSON.stringify([1, 'once1', '*x', 2, '*x', '*x']) && logs.some((l) => l[0] === 'error'), got);
    ok('bus: on returns off fn', typeof off === 'function'); }
  // settings
  { const store = makeStore(); let a = loadMM({ store }); const S = a.MM.settings; const seen = [];
    S.onChange((d) => seen.push(d));
    ok('settings: defaults', S.get('quality') === 'medium' && S.get('particles') === 'medium' && S.get('shake') === 'low' && S.get('volMaster') === 0.8 && S.get('textScale') === 1);
    ok('settings: reject invalid', S.set('quality', 'ultra') === false && S.set('nope', 1) === false && S.get('quality') === 'medium');
    S.set('quality', 'low');
    ok('settings: preset low', S.get('softFilter') === 'off' && S.get('bloom') === 'off' && S.get('particles') === 'low' && S.particleScale() === 0.35);
    S.set('bloom', 'high');
    ok('settings: custom after tweak', S.get('quality') === 'custom');
    S.set({ softFilter: 'medium', bloom: 'high', particles: 'high' });
    ok('settings: batch -> matches high', S.get('quality') === 'high' && S.particleScale() === 1, S.all());
    S.set('shake', 'full'); ok('settings: shakeScale full', S.shakeScale() === 1);
    S.set('reducedMotion', true); ok('settings: reducedMotion caps', S.shakeScale() === 0 && S.particleScale() === 0.35);
    S.set('volMusic', '0.3'); ok('settings: numeric coercion', S.get('volMusic') === 0.3);
    const last = seen[seen.length - 1];
    ok('settings: event payload', last && last.key === 'volMusic' && last.audio && last.audio.music === 0.3 && last.all.volMusic === 0.3, last);
    a = loadMM({ store }); ok('settings: persisted', a.MM.settings.get('quality') === 'high' && a.MM.settings.get('reducedMotion') === true && a.MM.settings.get('volMusic') === 0.3);
    a.MM.settings.reset(); ok('settings: reset', a.MM.settings.get('quality') === 'medium' && a.MM.settings.get('reducedMotion') === false);
    store.setItem('moss-moon-settings-v1', '{garbage'); a = loadMM({ store }); ok('settings: corrupt -> defaults', a.MM.settings.get('quality') === 'medium');
    ok('settings: prefers-reduced-motion default', loadMM({ reduced: true }).MM.settings.get('reducedMotion') === true); }
  // state + input gate
  { let cleared = 0; const game = { target: { x: 1, y: 1 } };
    const { MM } = loadMM({ baseline: () => ({ clearControls: () => { cleared++; }, game }) });
    // `game` is a sandbox global here (stands in for baseline's let binding)
    const evs = []; MM.bus.on('state', (d) => evs.push(d.from + '>' + d.to));
    ok('state: starts boot, paused', MM.state.current === 'boot' && MM.isPaused());
    MM.state.go('title'); MM.state.go('play'); ok('state: play unpaused', !MM.isPaused() && MM.state.prev === 'title');
    game.target = { x: 2, y: 2 }; const c0 = cleared; MM.state.go('menu', { screen: 'pause' });
    ok('state: non-play clears controls + click target', cleared === c0 + 1 && game.target === null && MM.state.data.screen === 'pause');
    ok('state: same/unknown rejected', MM.state.go('menu') === false && MM.state.go('nope') === false);
    ok('state: events', evs.join(',') === 'boot>title,title>play,play>menu', evs);
    MM.state.go('play'); MM.input.block(true); ok('input: block gates input not sim', MM.input.isBlocked() && !MM.isPaused()); MM.input.block(false); ok('input: unblock', !MM.input.isBlocked()); }
  // hooks
  { const { MM, logs } = loadMM(); const order = [];
    MM.hooks.on('overlay', () => order.push('b'), 5); MM.hooks.on('overlay', () => order.push('a'), -5); MM.hooks.on('overlay', () => { throw new Error('x'); }); MM.hooks.on('overlay', () => order.push('c'), 5);
    MM.hooks.overlay({}); ok('hooks: priority order + error isolation', order.join('') === 'abc' && logs.some((l) => l[0] === 'error'), order);
    ok('hooks: light returns handled', MM.hooks.light({}) === undefined && (MM.hooks.on('light', () => true), MM.hooks.light({}) === true));
    const list = []; MM.hooks.on('drawables', (l) => l.push({ type: 'custom' })); MM.hooks.drawables(list, () => ({})); ok('hooks: drawables mutate list', list.length === 1); }
  // camera
  { const clock = { t: 1000 }; const { MM } = loadMM({ clock });
    MM.settings.set('shake', 'off'); ok('camera: shake off -> none', MM.camera.shake(10, 1) === false && MM.camera.offset().x === 0);
    MM.settings.set('shake', 'full'); MM.camera.shake(10, 0.5); clock.t += 50; const o1 = MM.camera.offset(); clock.t += 600; const o2 = MM.camera.offset();
    ok('camera: shake then decays', (Math.abs(o1.x) + Math.abs(o1.y)) > 0.5 && o2.x === 0 && o2.y === 0, [o1, o2]);
    ok('camera: defaults', MM.camera.lookAhead === 0.3 && MM.camera.follow === 4);
    MM.camera.focus({ x: 3, y: 4, hold: 1 }); ok('camera: focus', MM.camera.focused && MM.camera.focused.x === 3);
    MM.camera.focusPoint(0.6); ok('camera: hold counts down', !!MM.camera.focused); MM.camera.focusPoint(0.6); ok('camera: hold expires', MM.camera.focused === null); }
  // save
  { const store = makeStore(); const world = { gold: 5, hp: 100 }, game = { x: 9, y: 9 }; const enemies = [];
    const { MM, sb } = loadMM({ store, baseline: () => ({ world, game, enemies, newAdventure() {} }) });
    const camp = { chapter: 2 }; let applied = null;
    MM.save.registerSection('world', { get: () => ({ ...sb.world }), set: (v) => { sb.world.gold = v.gold; }, reset: () => { sb.world.gold = 85; } });
    MM.save.registerSection('campaign', { get: () => camp, set: (v) => { applied = v; }, reset: () => { applied = 'reset'; } });
    ok('save: refuses without active game', MM.save.save() === false && MM.save.lastResult.reason === 'no-game');
    MM.game.active = true; MM.state.go('play');
    sb.enemies.push({ x: 10, y: 9, hp: 5 }); ok('save: refuses near enemy', MM.save.save() === false && MM.save.whyNot() === 'danger'); sb.enemies.length = 0;
    MM.state.go('cine'); ok('save: refuses in cine', MM.save.save() === false); ok('save: force works', MM.save.save({ force: true }) === true); MM.state.go('play');
    let evs = []; MM.bus.on('save', (d) => evs.push(d));
    sb.world.gold = 42; ok('save: ok', MM.save.save({ silent: true }) === true && evs[0].ok && evs[0].silent && evs[0].persisted === true);
    const env = JSON.parse(store.getItem('moss-moon-save-v2'));
    ok('save: envelope v2', env.v === 2 && env.sections.world.gold === 42 && env.sections.campaign.chapter === 2 && env.sections.meta && typeof env.savedAt === 'number', env);
    sb.world.gold = 0; const r = MM.save.load(); ok('save: load applies', r.ok && sb.world.gold === 42 && applied && applied.chapter === 2, r);
    const sum = MM.save.summary(); ok('save: summary', sum && sum.chapter === 2 && sum.level === 1 && sum.name === 'Witch' && sum.savedAt, sum);
    // late registration
    store.setItem('moss-moon-save-v2', JSON.stringify({ v: 2, savedAt: 1, sections: { world: { gold: 7 }, fx: { a: 1 } } })); MM.save.load(); let late = null;
    MM.save.registerSection('fx', { get: () => ({ a: 2 }), set: (v) => { late = v; }, reset() {} }); ok('save: late registration gets data', late && late.a === 1);
    ok('save: missing section reset', applied === 'reset');
    // unknown section data survives a save
    store.setItem('moss-moon-save-v2', JSON.stringify({ v: 2, savedAt: 1, sections: { world: { gold: 7 }, futureMod: { keep: true } } })); MM.save.load(); MM.save.save({ force: true });
    ok('save: unknown section kept', JSON.parse(store.getItem('moss-moon-save-v2')).sections.futureMod.keep === true);
    // section failure isolated
    MM.save.registerSection('bad', { get: () => 1, set: () => { throw new Error('nope'); }, reset() {} }); MM.save.save({ force: true }); evs = []; MM.bus.on('save:error', (d) => evs.push(d));
    const r2 = MM.save.load(); ok('save: failing section isolated', r2.ok && r2.warnings === 1 && evs.some((e) => e.section === 'bad'), r2);
    // newer version
    store.setItem('moss-moon-save-v2', JSON.stringify({ v: 3, sections: {} })); ok('save: newer refused', MM.save.load().reason === 'newer' && MM.save.status() === 'newer');
    // export / import
    store.setItem('moss-moon-save-v2', JSON.stringify({ v: 2, savedAt: 5, sections: { world: { gold: 11 } } }));
    const ex = MM.save.exportJSON(); MM.save.erase(); ok('save: erase', !MM.save.hasSave() && MM.save.status() === 'none');
    ok('save: import', MM.save.importJSON(ex).ok && MM.save.load().ok && sb.world.gold === 11);
    ok('save: import rejects junk', MM.save.importJSON('{"v":9}').ok === false && MM.save.importJSON('nah').ok === false);
    ok('save: import raw v1 world', MM.save.importJSON(JSON.stringify({ cls: 'grove', gold: 3 })).ok && MM.save.load().ok && sb.world.gold === 3);
    // corruption with no backup -> sections reset
    MM.save.erase(); store.setItem('moss-moon-save-v2', '{{{'); sb.world.gold = 1; const r3 = MM.save.load();
    ok('save: corrupt no backup', !r3.ok && r3.reason === 'corrupt' && sb.world.gold === 85 && store.getItem('moss-moon-save-v2-corrupt') === '{{{', r3); }
  // v1 migration
  { const store = makeStore(); store.setItem('moss-moon-adventure-v1', JSON.stringify({ gold: 123, level: 4, day: 9 })); store.setItem('moss-moon-look', '{"style":"masculine"}');
    const { MM } = loadMM({ store }); let w = null, look = null;
    MM.save.registerSection('world', { get: () => ({}), set: (v) => { w = v; }, reset() {} }); MM.save.registerSection('look', { get: () => ({}), set: (v) => { look = v; }, reset() {} });
    ok('v1: detected', MM.save.hasSave() && MM.save.status() === 'v1' && MM.save.summary().level === 4);
    const r = MM.save.load(); ok('v1: migrated', r.ok && r.migrated && w.gold === 123 && look.style === 'masculine' && store.getItem('moss-moon-adventure-v1'), r); }
  // storage unavailable
  { const { MM } = loadMM({ broken: true }); ok('storage: unavailable flag', MM.save.available === false && MM.storage.available === false);
    MM.settings.set('bloom', 'high'); ok('storage: settings still work in memory', MM.settings.get('bloom') === 'high');
    let got = null; MM.save.registerSection('world', { get: () => ({ gold: 9 }), set: (v) => { got = v; }, reset() {} }); MM.game.active = true; MM.state.go('play');
    const evs = []; MM.bus.on('save', (d) => evs.push(d));
    ok('storage: memory save + load', MM.save.save({ force: true }) && evs[0].persisted === false && MM.save.load().ok && got.gold === 9); }
}

// ------------------------------------------------------------------ Part B: browser
async function browserTests() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const scratch = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mm-core-'));
  async function open(url, viewport = { width: 1280, height: 800 }) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(url); return { page, errors, context };
  }
  const fileUrl = (p) => 'file://' + p;
  try {
    // B1: baseline alone on a bare page (no MM, no shim): S1 null-safety + seams are no-ops.
    const bare = path.join(ROOT, '__core_test_bare.html');
    fs.writeFileSync(bare, '<!doctype html><meta charset="utf-8"><canvas id="scene" width="512" height="320"></canvas>' +
      '<script src="assets/js/atlas-data.js"></script><script src="assets/js/cast-data.js"></script><script src="src/core/baseline.js"></script>');
    try {
      const { page, errors, context } = await open(fileUrl(bare));
      await page.waitForTimeout(300); const e0 = await page.evaluate(() => window.__witchDemo.getState().elapsed);
      await page.waitForTimeout(400); const e1 = await page.evaluate(() => window.__witchDemo.getState().elapsed);
      const saved = await page.evaluate(() => { saveWorld(true); return !!localStorage.getItem('moss-moon-adventure-v1'); }); // eslint-disable-line no-undef
      ok('bare baseline runs without MM/shim', errors.length === 0 && e1 > e0, { errors, e0, e1 });
      ok('bare baseline legacy v1 save path', saved);
      await context.close();
      // with shim only
      fs.writeFileSync(bare, '<!doctype html><meta charset="utf-8"><body><canvas id="scene" width="512" height="320"></canvas>' +
        '<script src="assets/js/atlas-data.js"></script><script src="assets/js/cast-data.js"></script><script src="src/core/legacy-shim.js"></script><script src="src/core/baseline.js"></script>');
      const b2 = await open(fileUrl(bare)); await b2.page.waitForTimeout(500);
      const t = await b2.page.evaluate(() => ({ el: window.__witchDemo.getState().elapsed, txt: document.getElementById('worldHud').textContent }));
      ok('baseline + shim (no MM) runs, legacy UI written', b2.errors.length === 0 && t.el > 0.2 && /Day 1/.test(t.txt), { errors: b2.errors, t });
      await b2.context.close();
    } finally { fs.unlinkSync(bare); }

    // B2: full page — integer scale + letterboxed pointer mapping in several viewports
    for (const vp of [{ width: 1280, height: 800 }, { width: 700, height: 1000 }, { width: 1500, height: 520 }, { width: 390, height: 844 }]) {
      const { page, errors, context } = await open(fileUrl(path.join(ROOT, 'index.html')), vp);
      await page.waitForFunction(() => window.__mm && window.MM.state.current === 'title');
      // isolate core pointer mapping from whatever the UI module overlays
      await page.evaluate(() => { window.__mm.newGame({ name: 'Ptr', startCampaign: false }); window.__mm.setState('play'); document.getElementById('mm-ui').style.display = 'none'; });
      const lay = await page.evaluate(() => window.__mm.layout());
      const box = await page.locator('#scene').boundingBox();
      // click at canvas px (300, 120) and compare with the expected unprojected tile
      const sx = 300, sy = 120;
      await page.mouse.click(box.x + sx * box.width / 512, box.y + sy * box.height / 320);
      const res = await page.evaluate(([sx, sy]) => { const g = window.__mm.game(); const p = unproject(sx - 256 + g.camX, sy - 160 + g.camY); return { t: g.target, exp: { x: p.x, y: p.y } }; }, [sx, sy]); // eslint-disable-line no-undef
      const good = res.t && Math.abs(res.t.x - Math.min(19.4, Math.max(0.6, res.exp.x))) < 0.15 && Math.abs(res.t.y - Math.min(19.4, Math.max(0.6, res.exp.y))) < 0.15;
      const aspect = Math.abs(box.width / box.height - 1.6) < 0.01, inside = box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5;
      ok('layout+pointer ' + vp.width + 'x' + vp.height, good && aspect && inside && errors.length === 0 && (lay.scale * 1 >= 2 ? lay.integer && Number.isInteger(lay.scale) : true), { lay, box, res, errors });
      await context.close();
    }

    // B3: seams, events and fixes on the real page
    {
      const { page, errors, context } = await open(fileUrl(path.join(ROOT, 'index.html')));
      await page.waitForFunction(() => window.__mm && window.MM.state.current === 'title');
      const r = await page.evaluate(() => {
        /* eslint-disable no-undef */
        const out = {}; const M = window.MM, D = window.__mm;
        D.newGame({ name: 'Core', startCampaign: false }); M.state.go('play');
        // hooks + custom drawable
        let custom = 0, light = 0, overlay = 0, ground = 0;
        const offs = [M.hooks.on('drawables', (list) => list.push({ type: 'custom', x: 10, y: 10, draw: (c, pos) => { custom++; out.pos = pos; } })),
          M.hooks.on('light', () => { light++; return false; }), M.hooks.on('overlay', () => { overlay++; }), M.hooks.on('drawGround', () => { ground++; })];
        draw(); draw();
        out.hooks = { custom, light, overlay, ground }; offs.forEach((f) => f());
        // events
        D.clearEvents(); world.mana = 100; world.targetId = 'dummy'; castCooldown = 0; castSpell(); D.step(60, 1 / 60);
        out.cast = D.events('cast').length; out.hit = D.events('hit').length;
        D.region('forest'); out.region = D.events('region').length; out.enemies = enemies.length;
        D.killAll(); out.kill = D.events('kill').length;
        D.region('grove'); out.messageSuppressedOnNew = true;
        // night raid fix: first night raids once (dusk), not again after midnight
        D.clearEvents(); world.day = 1; world.time = 0.679; world.lastRaid = 0; D.step(30, 1 / 30); const r1 = D.events('raid').length;
        enemies = []; world.time = 0.9999; D.step(10, 1 / 30); const dayEv = D.events('day').length; enemies = []; D.step(20, 1 / 30); const r2 = D.events('raid').length;
        enemies = []; world.time = 0.679; D.step(30, 1 / 30); const r3 = D.events('raid').length;
        out.raid = { r1, r2, r3, dayEv, day: world.day };
        enemies = [];
        // P2 mana
        toggleLocalCoop(); const p2 = party[0]; world.mana = 100; p2.mana = 100; p2.cooldown = 0; world.targetId = 'dummy';
        const casted = castSpell(p2); out.p2 = { casted, worldMana: world.mana, p2Mana: p2.mana }; toggleLocalCoop();
        // particles + settings
        M.settings.set('particles', 'low'); for (let i = 0; i < 40; i++) addParticles({ x: 10, y: 10 }, '#fff', '#fff', 16); out.particles = particles.length; M.settings.reset();
        // shake
        M.settings.set('shake', 'full'); M.camera.shake(8, 0.4); const o = M.camera.offset(); out.shake = Math.abs(o.x) + Math.abs(o.y); M.settings.reset();
        // damage numbers gate does not throw
        M.settings.set('damageNumbers', false); draw(); M.settings.reset();
        // defeat -> respawn
        D.teleport(4, 4); world.gold = 100; world.hp = 1; resetPlayer(); out.defeatState = M.state.current; out.hp0 = world.hp;
        resetPlayer(); // second call while defeated is ignored
        out.deaths = D.events('death').length;
        const rs = M.game.respawnHome(); out.respawn = { rs, gold: world.gold, hp: world.hp, state: M.state.current, x: game.x, y: game.y, region: world.region };
        // boss floor reload: cleared boss does not respawn
        world.region = 'crypt'; world.mode = 'dungeon'; world.floor = 3; world.dungeonSeed = 77; restoreAdventure();
        const boss = enemies.find((e) => e.boss); out.bossSpawn = !!boss; enemies.forEach((e) => { hitEntity(e, 99999, '#fff'); });
        out.bossCleared = world.bossCleared; enemies = []; D.save(true); const lr = M.game.continueGame();
        out.bossAfterReload = { ok: lr.ok, boss: enemies.some((e) => e.boss), n: enemies.length, floor: world.floor, mode: world.mode };
        // input gate by preventDefault + MM.input.block
        M.state.go('play'); D.teleport(10, 10); const k0 = keys.size; window.addEventListener('keydown', function claim(e) { if (e.key === 'w') e.preventDefault(); window.removeEventListener('keydown', claim, true); }, true);
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', cancelable: true, bubbles: true })); out.claimed = keys.has('w'); keys.clear();
        M.input.block(true); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true, bubbles: true })); out.blocked = keys.has('a'); M.input.block(false);
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true, bubbles: true })); out.unblocked = keys.has('a'); keys.clear(); out.k0 = k0;
        out.legacyWritesOff = document.getElementById('debug').textContent === '';
        return out;
        /* eslint-enable no-undef */
      });
      ok('hooks dispatched + custom drawable drawn', r.hooks.custom === 2 && r.hooks.light === 2 && r.hooks.overlay === 2 && r.hooks.ground === 2 && r.pos && Number.isFinite(r.pos.x), r.hooks);
      ok('events cast/hit/region/kill', r.cast >= 1 && r.hit >= 1 && r.region === 1 && r.enemies > 0 && r.kill === r.enemies, r);
      ok('night raid keyed by night (§9 #2)', r.raid.r1 === 1 && r.raid.dayEv === 1 && r.raid.r2 === 1 && r.raid.r3 === 2, r.raid);
      ok('P2 spends own mana (§9 #3)', r.p2.casted && r.p2.worldMana === 100 && r.p2.p2Mana < 100, r.p2);
      ok('particle cap from settings', r.particles <= 77 && r.particles > 0, r.particles);
      ok('camera shake offset', r.shake > 0, r.shake);
      ok('death -> defeat state', r.defeatState === 'defeat' && r.hp0 === 0 && r.deaths === 1, r);
      ok('respawnHome: 15% gold, home, play', r.respawn.rs.goldLost === 15 && r.respawn.gold === 85 && r.respawn.hp >= 100 && r.respawn.state === 'play' && r.respawn.region === 'grove' && Math.abs(r.respawn.x - 9.7) < 0.01, r.respawn);
      ok('defeated boss floor does not respawn boss (§9 #14)', r.bossSpawn && r.bossCleared && r.bossAfterReload.ok && !r.bossAfterReload.boss && r.bossAfterReload.floor === 3 && r.bossAfterReload.mode === 'dungeon', r.bossAfterReload);
      ok('keydown claimable via preventDefault', r.claimed === false);
      ok('MM.input.block gates keys', r.blocked === false && r.unblocked === true, r);
      ok('legacy per-frame DOM writes gated', r.legacyWritesOff);
      ok('no console errors (seams page)', errors.length === 0, errors);
      await context.close();
    }

    // B3b: fallbacks without the UI module + autosave + tab-hide pause
    {
      const noui = path.join(ROOT, '__core_test_noui.html');
      fs.writeFileSync(noui, fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script src="src\/ui\/[^"]+"><\/script>\n?/g, '').replace(/<link rel="stylesheet" href="assets\/css\/ui\.css">/g, ''));
      try {
        const { page, errors, context } = await open(fileUrl(noui));
        await page.waitForFunction(() => window.__mm && window.MM.state.current === 'title');
        const t0 = await page.evaluate(() => ({ ui: !!window.MM.ui, overlay: (document.querySelector('.mm-fallback') || {}).dataset }));
        await page.keyboard.press('Enter'); await page.waitForTimeout(200);
        const s1 = await page.evaluate(() => window.MM.state.current);
        await page.keyboard.press('Escape'); await page.waitForTimeout(100);
        const s2 = await page.evaluate(() => [window.MM.state.current, (document.querySelector('.mm-fallback') || {}).dataset && document.querySelector('.mm-fallback').dataset.kind]);
        await page.keyboard.press('Enter'); await page.waitForTimeout(100);
        const s3 = await page.evaluate(() => window.MM.state.current);
        // tab hidden -> pause
        const s4 = await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); const s = window.MM.state.current; delete document.hidden; return s; });
        await page.keyboard.press('Enter');
        // autosave on sim time (30 s of play) — step the sim synchronously
        const au = await page.evaluate(() => { window.__mm.clearEvents(); window.__mm.teleport(9.7, 10); window.__mm.step(60 * 31, 1 / 60); return window.__mm.events('save').length; });
        // death -> fallback defeat overlay -> auto respawn
        await page.evaluate(() => { window.__mm.world().hp = 1; resetPlayer(); }); // eslint-disable-line no-undef
        const d0 = await page.evaluate(() => [window.MM.state.current, document.querySelector('.mm-fallback') && document.querySelector('.mm-fallback').dataset.kind]);
        await page.waitForTimeout(2800);
        const d1 = await page.evaluate(() => [window.MM.state.current, window.__mm.world().hp]);
        // toTitle shows the fallback title again with a Continue line
        const tt = await page.evaluate(() => { window.MM.game.toTitle(); const o = document.querySelector('.mm-fallback'); return [window.MM.state.current, o && o.dataset.kind, o && /continue/i.test(o.textContent)]; });
        ok('fallback title (no MM.ui) -> Enter starts game', !t0.ui && t0.overlay && t0.overlay.kind === 'title' && s1 === 'play', { t0, s1 });
        ok('fallback pause Esc/Enter', s2[0] === 'menu' && s2[1] === 'pause' && s3 === 'play', { s2, s3 });
        ok('tab hidden pauses play', s4 === 'menu', s4);
        ok('autosave after 30 s sim time', au >= 1, au);
        ok('fallback defeat -> auto respawn', d0[0] === 'defeat' && d0[1] === 'defeat' && d1[0] === 'play' && d1[1] >= 100, { d0, d1 });
        ok('toTitle -> fallback title with continue', tt[0] === 'title' && tt[1] === 'title' && tt[2], tt);
        ok('no console errors (no-UI page)', errors.length === 0, errors);
        await context.close();
      } finally { fs.unlinkSync(noui); }
    }

    // B4: single-file build loads and reaches title
    {
      const out = path.join(scratch, 'build-test.html');
      execFileSync(process.execPath, [path.join(ROOT, 'tools/build.js'), '--out', out], { stdio: 'pipe' });
      const html = fs.readFileSync(out, 'utf8');
      ok('build: no external local refs', !/<script[^>]+src=/i.test(html) && !/<link[^>]+stylesheet/i.test(html));
      const { page, errors, context } = await open(fileUrl(out));
      const reached = await page.waitForFunction(() => window.__mm && window.MM.state.current === 'title', null, { timeout: 8000 }).then(() => true, () => false);
      ok('build: single file boots to title', reached && errors.length === 0, errors);
      await context.close();
      let failedLoud = false;
      try { execFileSync(process.execPath, [path.join(ROOT, 'tools/build.js'), '--check'], { stdio: 'pipe' }); } catch (e) { failedLoud = true; }
      ok('build: --check passes on index.html', !failedLoud);
    }
  } finally {
    await browser.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

(async () => {
  unit();
  if (!process.argv.includes('--unit-only')) {
    try { await browserTests(); } catch (e) { ok('browser tests crashed', false, String(e && e.stack || e)); }
  }
  // builds/baseline must stay untouched
  try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'builds/baseline'], { cwd: ROOT }); ok('builds/baseline untouched', true); } catch (e) { ok('builds/baseline untouched', false); }
  const bad = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ pass: bad.length === 0, total: results.length, failed: bad.map((r) => r.name) }));
  process.exit(bad.length ? 1 : 0);
})();
