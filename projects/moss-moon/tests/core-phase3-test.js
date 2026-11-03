// CORE phase-3 tests (PHASE3_CONTRACT "CORE additions"). Usage: node tests/core-phase3-test.js [--unit-only]
// Part A (Node vm): MM.screens lifecycle order (exit -> cleanup -> release -> policy -> enter), listen/timeout/interval/mount release,
//   deferred go() during exit, ordered 'state' events with a redirect inside enter, isPaused per sim policy, register() merging,
//   audio policy + gameplay-loop stop, new settings, MM.input axis/glyph/method/touchControls.
// Part B (Playwright): single rAF (rafs===1) across 50 state round trips, no listener/timer/mount/canvas leaks, no baseline sim or draw in
//   logo/intro/title/creation (#scene hidden; game.elapsed, world.time and enemies frozen), sim:'player' (controller+camera only),
//   frozen draw, joystick axis drives the witch with deadzone, gamepad stick -> axis, #mm-screens mounts, full page rafs===1.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const MM_SRC = fs.readFileSync(path.join(ROOT, 'src/core/mm.js'), 'utf8');
const results = [];
function ok(name, cond, info) { results.push({ name, ok: !!cond }); if (!cond) console.log('FAIL ' + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); }

function loadMM(extra) {
  const m = new Map();
  const sb = { console: { log() {}, warn() {}, error() {} }, performance: { now: () => Date.now() }, Date, JSON, Math, Number, String, Object, Array, Map, Set, WeakMap, Error, Promise,
    setTimeout, clearTimeout, setInterval, clearInterval, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) } };
  sb.window = sb; Object.assign(sb, extra || {});
  vm.createContext(sb); vm.runInContext(MM_SRC, sb, { filename: 'mm.js' });
  return { MM: sb.MM, sb };
}
function fakeTarget() { const L = []; return { L, addEventListener(t, f) { L.push([t, f]); }, removeEventListener(t, f) { const i = L.findIndex((x) => x[0] === t && x[1] === f); if (i >= 0) L.splice(i, 1); } }; }

async function unit() {
  // lifecycle order + resource release
  { const { MM } = loadMM(); const log = []; const tgt = fakeTarget(); let fired = 0;
    MM.screens.register('logo', {
      enter(d, prev) { log.push('logo.enter:' + prev + ':' + (d && d.k)); MM.screens.listen(tgt, 'x', () => {}); MM.screens.timeout(() => { fired++; }, 30); MM.screens.interval(() => { fired++; }, 10); },
      exit(next) { log.push('logo.exit:' + next + ':listeners=' + tgt.L.length); }, cleanup() { log.push('logo.cleanup:listeners=' + tgt.L.length); } });
    MM.screens.register('intro', { enter() { log.push('intro.enter:released=' + tgt.L.length + ':paused=' + MM.isPaused()); } });
    MM.bus.on('state', (e) => log.push('event:' + e.from + '>' + e.to));
    MM.state.go('logo', { k: 1 });
    const st = MM.screens.stats();
    MM.state.go('intro');
    await new Promise((r) => setTimeout(r, 60));
    ok('lifecycle: exit -> cleanup -> release -> enter (+event after enter)', log.join('|') === 'logo.enter:boot:1|event:boot>logo|logo.exit:intro:listeners=1|logo.cleanup:listeners=1|intro.enter:released=0:paused=true|event:logo>intro', log);
    ok('lifecycle: listen/timeout/interval owned then cleared', st.listeners === 1 && st.timers === 2 && fired === 0 && MM.screens.stats().timers === 0 && MM.screens.stats().listeners === 0, st);
    const c = MM.screens.stats(); ok('lifecycle: counters balanced', c.listened === c.released && c.timersMade === c.timersCleared, c); }
  // deferred go during exit + redirect inside enter keeps event order
  { const { MM } = loadMM(); const ev = [];
    MM.screens.register('title', { exit() { MM.state.go('loading'); } });
    MM.screens.register('creation', { enter() { MM.state.go('play'); } });
    MM.bus.on('state', (e) => ev.push(e.from + '>' + e.to + '@' + MM.state.current));
    MM.state.go('title'); MM.state.go('logo');
    ok('state: go() during exit deferred until after the transition', MM.state.current === 'loading' && ev.slice(1).join(',') === 'title>logo@loading,logo>loading@loading', ev);
    ev.length = 0; MM.state.go('creation');
    ok('state: redirect inside enter -> ordered events', MM.state.current === 'play' && ev.join(',') === 'loading>creation@play,creation>play@play', ev); }
  // isPaused + policies + register merge
  { const { MM } = loadMM(); const want = { boot: true, logo: true, intro: true, title: true, creation: true, tutorial: false, play: false, interior: false, menu: true, dialogue: true, cine: true, defeat: true, ending: true, loading: true };
    const got = {}; for (const s of Object.keys(want)) { MM.state.go(s); got[s] = MM.isPaused(); }
    ok('isPaused per state (sim policy)', JSON.stringify(got) === JSON.stringify(want), got);
    ok('state list (phase 3)', MM.state.list.join(' ') === 'boot logo intro title creation tutorial play interior menu dialogue cine defeat ending loading', MM.state.list);
    const d = MM.screens.register('interior', { render() {} }); ok('register merges default policy', d.sim === 'player' && d.draw === 'custom' && typeof d.render === 'function');
    ok('screens.def/current/sim', MM.screens.def('menu').draw === 'frozen' && MM.screens.current === MM.state.current && MM.screens.sim() === MM.screens.def().sim);
    MM.screens.register('play', { sim: 'bogus' }); ok('register validates policy', MM.screens.def('play').sim === 'world'); }
  // audio policy
  { const calls = []; const { MM } = loadMM();
    MM.audio = { music: (id, o) => calls.push('music:' + id), ambience: (id) => calls.push('amb:' + id), loop: (n, on) => calls.push('loop:' + n + ':' + on), list: () => ({ loops: ['broom', 'rain'] }) };
    MM.screens.register('title', { audio: { music: 'title_theme', ambience: null } }); MM.screens.register('menu', { audio: { keep: true, music: 'x' } });
    MM.state.go('play'); calls.length = 0; MM.state.go('title');
    ok('audio policy on enter + gameplay loops stopped for sim none', calls.join(',') === 'loop:broom:false,loop:rain:false,music:title_theme,amb:null', calls);
    MM.state.go('play'); calls.length = 0; MM.state.go('menu'); ok('audio keep:true leaves music', !calls.some((c) => c.startsWith('music')), calls); }
  // settings + input
  { const { MM } = loadMM(); const S = MM.settings;
    ok('settings: new defaults', S.get('joystickSize') === 1 && S.get('joystickSide') === 'left' && S.get('joystickMode') === 'floating' && S.get('haptics') === true && S.get('fxIntensity') === 1);
    ok('settings: fxIntensity enum (numeric coercion)', S.set('fxIntensity', '1.5') && S.get('fxIntensity') === 1.5 && S.set('fxIntensity', 2) === false);
    ok('settings: joystick validation', S.set('joystickSize', 3) && S.get('joystickSize') === 1.4 && S.set('joystickSide', 'up') === false && S.set('joystickMode', 'fixed'));
    ok('touchControls resolution', MM.input.touchControls() === false && (S.set('touchControls', 'on'), MM.input.touchControls() === true) && (S.set('touchControls', 'off'), MM.input.touchControls() === false));
    const ev = []; MM.bus.on('input:method', (d) => ev.push(d.method));
    MM.input.setAxis(3, 4, 'touch'); ok('axis clamped to unit length', Math.abs(Math.hypot(MM.input.axis.x, MM.input.axis.y) - 1) < 1e-9 && MM.input.axisSource === 'touch');
    ok('input method + glyph', MM.input.method === 'touch' && MM.input.glyph('cast') === 'Tap ✦' && ev[0] === 'touch');
    MM.input.setAxis(0.5, 0, 'gamepad'); ok('glyph per method (gamepad)', MM.input.method === 'gamepad' && MM.input.glyph('cast') === 'A button' && MM.input.glyph('interact') === 'X button');
    MM.input.setMethod('keyboard'); ok('glyph keyboard', MM.input.glyph('interact') === 'E');
    MM.state.go('play'); MM.input.setAxis(1, 0, 'touch'); MM.state.go('menu'); ok('axis cleared entering sim none', MM.input.axis.x === 0 && MM.input.axis.y === 0); }
}

async function browser() {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const CORE_KEEP = ['assets/js/', 'src/core/', 'src/systems/art.js'];
  const corePage = path.join(ROOT, '__core_p3_core.html');
  fs.writeFileSync(corePage, fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script src="([^"]+)"><\/script>\n?/g, (m, src) => (CORE_KEEP.some((k) => src.startsWith(k)) ? m : '')));
  async function open(file) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto('file://' + file); return { page, errors, ctx };
  }
  try {
    const { page, errors, ctx } = await open(corePage);
    await page.waitForFunction(() => window.__mm && window.MM.state.current === 'title');
    const r = await page.evaluate(async () => {
      /* eslint-disable no-undef */
      const M = window.MM, D = window.__mm, out = {}; const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      let draws = 0; M.hooks.on('postDraw', () => { draws++; });
      // sim none at title (fresh boot): baseline neither simulated nor drawn
      const d0 = draws, e0 = game.elapsed; await sleep(250);
      out.titleBoot = { draws: draws - d0, el: game.elapsed - e0, vis: document.getElementById('scene').style.visibility };
      // start a game in a region with enemies, then visit every sim:'none' front-end state
      D.newGame({ name: 'P3' }); goRegion('forest'); await sleep(200);
      out.enemiesPlay = enemies.length;
      out.frozen = {};
      for (const s of ['logo', 'intro', 'title', 'creation']) {
        M.state.go(s); const snap = { el: game.elapsed, t: world.time, en: enemies.map((e) => [e.x, e.y, e.age].join()).join('|'), d: draws };
        keys.add('d'); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' })); M.input.setAxis(1, 0, 'touch');
        await sleep(200);
        out.frozen[s] = { el: game.elapsed === snap.el, t: world.time === snap.t, en: enemies.map((e) => [e.x, e.y, e.age].join()).join('|') === snap.en, drawn: draws - snap.d,
          vis: document.getElementById('scene').style.visibility, paused: M.isPaused(), inputBlocked: M.input.isBlocked() };
        keys.clear(); M.input.setAxis(0, 0);
      }
      // sim:'player' (interior with no registered renderer -> world draw fallback): controller + camera only
      M.state.go('play'); await sleep(50); M.state.go('interior');
      const ip = { el: game.elapsed, t: world.time, en: enemies.map((e) => [e.x, e.y, e.age].join()).join('|'), x: game.x, cam: game.camX };
      M.input.setAxis(1, 0, 'touch'); await sleep(400); M.input.setAxis(0, 0);
      out.interior = { el: game.elapsed > ip.el, t: world.time === ip.t, en: enemies.map((e) => [e.x, e.y, e.age].join()).join('|') === ip.en, moved: game.x - ip.x, cam: game.camX !== ip.cam, paused: M.isPaused() };
      // frozen draw (menu): baseline draw not called, scene still visible
      M.state.go('play'); await sleep(50); M.state.go('menu'); const fd = draws; await sleep(200);
      out.menu = { drawn: draws - fd, vis: document.getElementById('scene').style.visibility };
      // joystick axis deadzone
      M.state.go('play'); enemies = []; D.teleport(10, 10); M.input.setAxis(0.1, 0, 'touch'); await sleep(250); out.deadzone = Math.abs(game.x - 10) + Math.abs(game.y - 10); M.input.setAxis(0, 0);
      // gamepad stick -> axis
      const pad = { axes: [0.9, 0], buttons: [{ pressed: false }], connected: true };
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] }); window.dispatchEvent(new Event('gamepadconnected'));
      await sleep(100); out.gamepad = { ax: M.input.axis.x, method: M.input.method, src: M.input.axisSource }; pad.axes = [0, 0]; await sleep(60); out.gamepadRelease = M.input.axis.x;
      // screens: a registered screen with resources, mounted canvas in #mm-screens
      let enters = 0, exits = 0, renders = 0;
      M.screens.register('logo', { enter() { enters++; const m = M.screens.mount('logo-bg', { w: 'stage' }); m.ctx.fillRect(0, 0, 4, 4); M.screens.listen(window, 'keydown', () => {}); M.screens.listen(document, 'pointerdown', () => {}); M.screens.timeout(() => {}, 5000); M.screens.interval(() => {}, 1000); },
        exit() { exits++; }, render(c) { if (c) renders++; } });
      M.state.go('logo'); await sleep(80);
      out.mount = { inLayer: !!document.querySelector('#mm-screens > canvas.mm-screen-canvas'), stats: M.screens.stats(), renders };
      // 50 round trips through every state
      const busBefore = { state: M.bus.count('state'), settings: M.bus.count('settings'), layout: M.bus.count('layout') };
      const cycle = ['title', 'creation', 'tutorial', 'play', 'menu', 'play', 'interior', 'menu', 'interior', 'play', 'dialogue', 'play', 'cine', 'play', 'loading', 'play', 'ending', 'play', 'defeat', 'title', 'intro', 'logo'];
      M.loop.resetPeak(); const rafSamples = [];
      for (let i = 0; i < 50; i++) { for (const s of cycle) M.state.go(s); await new Promise((res) => requestAnimationFrame(() => res())); rafSamples.push(M.loop.stats().rafs); }
      // the test's own rAF above is a one-shot (counted as foreign); settle, then sample frames with nothing else running
      M.state.go('title'); await sleep(250); M.loop.resetPeak(); await sleep(400);
      const st = M.screens.stats();
      out.leaks = { st, enters, exits, canvases: document.querySelectorAll('.mm-screen-canvas').length, bus: { state: M.bus.count('state'), settings: M.bus.count('settings'), layout: M.bus.count('layout') }, busBefore,
        loop: M.loop.stats(), rafSamplesMax: Math.max(...rafSamples) };
      return out;
      /* eslint-enable no-undef */
    });
    ok('title at boot: no baseline sim/draw, #scene hidden', r.titleBoot.draws === 0 && r.titleBoot.el === 0 && r.titleBoot.vis === 'hidden', r.titleBoot);
    for (const s of ['logo', 'intro', 'title', 'creation']) {
      const f = r.frozen[s];
      ok('no baseline simulation/draw in ' + s, f.el && f.t && f.en && f.drawn === 0 && f.vis === 'hidden' && f.paused && f.inputBlocked, f);
    }
    ok('enemies existed for the freeze check', r.enemiesPlay > 0, r.enemiesPlay);
    ok("sim:'player' (interior): controller+camera only", r.interior.el && r.interior.t && r.interior.en && r.interior.moved > 0.05 && r.interior.cam && !r.interior.paused, r.interior);
    ok("draw:'frozen' (menu): no baseline draw, scene visible", r.menu.drawn === 0 && r.menu.vis === '', r.menu);
    ok('joystick deadzone 0.15', r.deadzone === 0, r.deadzone);
    ok('gamepad left stick -> MM.input.axis', r.gamepad.ax > 0.8 && r.gamepad.method === 'gamepad' && r.gamepad.src === 'gamepad' && r.gamepadRelease === 0, r.gamepad);
    ok('screens.mount canvas in #mm-screens + render(ctx) for draw none', r.mount.inLayer && r.mount.stats.mounts === 1 && r.mount.stats.listeners === 2 && r.mount.stats.timers === 2 && r.mount.renders > 0, r.mount);
    const L = r.leaks;
    ok('50x round trips: enter/exit balanced', L.enters === 51 && L.exits === 51, L);
    ok('50x round trips: no listener/timer/mount/canvas leaks', L.st.listeners === 0 && L.st.timers === 0 && L.st.mounts === 0 && L.canvases === 0 && L.st.listened === L.st.released && L.st.timersMade === L.st.timersCleared && L.st.mounted === L.st.unmounted, L.st);
    ok('50x round trips: bus listener counts unchanged', JSON.stringify(L.bus) === JSON.stringify(L.busBefore), L);
    ok('rafs === 1 after transitions (settled frames)', L.loop.rafs === 1 && L.loop.peak === 1 && L.loop.running, L.loop);
    ok('rafs <= 2 during transitions (1 + the test probe one-shot)', L.rafSamplesMax <= 2, L.rafSamplesMax);
    ok('no console errors (core page)', errors.length === 0, errors);
    await ctx.close();

    // full page: everything loaded — the single-rAF rule holds for every module
    const full = await open(path.join(ROOT, 'index.html'));
    await full.page.waitForFunction(() => window.__mm && window.MM.loop && window.MM.loop.stats().frames > 5);
    await full.page.waitForTimeout(1500);
    const fr = await full.page.evaluate(async () => {
      const M = window.MM, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), samples = [];
      for (const s of ['title', 'play', 'menu', 'play', 'title']) { M.state.go(s); await sleep(300); M.loop.resetPeak(); await sleep(300); samples.push([s, M.loop.stats().peak]); }
      return { samples, state: M.state.current };
    });
    ok('full page: rafs === 1 in title/play/menu (all modules)', fr.samples.every((x) => x[1] === 1), fr);
    await full.ctx.close();
  } finally { fs.unlinkSync(corePage); await b.close(); }
}

(async () => {
  await unit();
  if (!process.argv.includes('--unit-only')) { try { await browser(); } catch (e) { ok('browser tests crashed', false, String(e && e.stack || e)); } }
  const bad = results.filter((x) => !x.ok);
  console.log(JSON.stringify({ pass: bad.length === 0, total: results.length, failed: bad.map((x) => x.name) }));
  process.exit(bad.length ? 1 : 0);
})();
