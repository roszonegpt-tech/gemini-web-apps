// Shared Playwright harness for tests/fx-*.js.
// Loads index.html (real MM core), starts a game, injects FX modules index.html does not load yet (sfvfx.js,
// vfx-bridge.js until CORE adds them), stops MM.loop and exposes a deterministic stepper + cast helper.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'out');

// Test copies of the signature spells (only used when CAMPAIGN's SPELLS entries are missing).
const TEST_SPELLS = [
  { id: 'moonbolt', name: 'Moonbolt', school: 'Moon', kind: 'star', color: '#bcd4ff', core: '#f4f8ff', damage: 30, hit: [0.24], duration: 0.62, description: 'test' },
  { id: 'emberbloom', name: 'Ember Bloom', school: 'Fire', kind: 'fireball', color: '#f47c46', core: '#ffe3a1', damage: 44, hit: [0.5], duration: 1.1, status: 'burn', mmBloom: { r: 1.6, dur: 3 }, description: 'test' },
  { id: 'thornbind', name: 'Thornbind', school: 'Nature', kind: 'vines', color: '#71ad68', core: '#c7e990', damage: 22, hit: [0.4], duration: 1.35, status: 'root', mmZone: { r: 1.5, dur: 4.5 }, description: 'test' },
  { id: 'frostbell', name: 'Frostbell', school: 'Frost', kind: 'nova', color: '#a9e4f5', core: '#f0ffff', damage: 34, hit: [0.36], duration: 1.05, status: 'chill', mmPulse: { r: 2.2 }, description: 'test' },
  { id: 'starfall', name: 'Starfall', school: 'Astral', kind: 'meteor', color: '#f5d58c', core: '#fff9db', damage: 92, hit: [1.05], duration: 1.6, mmStrike: { r: 2.2 }, description: 'test' },
];

async function open(opts = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = opts.browser || await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => { try { return !!(window.MM && MM.game && MM.hooks && typeof game === 'object'); } catch (e) { return false; } });
  const has = await page.evaluate(() => ({ core: !!(window.MM && MM.loop), lighting: !!MM.lighting, fx: !!MM.fx, filter: !!MM.filter, sf: !!MM.sfvfx, vfx: !!MM.vfx }));
  if (!has.core) await page.addScriptTag({ path: path.join(ROOT, 'tests/fx-standin.js') });
  const files = [['lighting', 'src/systems/lighting.js'], ['fx', 'src/systems/fx.js'], ['filter', 'src/systems/filter.js'], ['sf', 'src/systems/sfvfx.js'], ['vfx', 'src/systems/vfx-bridge.js']];
  if (opts.noVfx) files.length = 3;
  for (const [k, f] of files) if (!has[k]) await page.addScriptTag({ path: path.join(ROOT, f) });
  await page.evaluate(async (spells) => {
    if (window.MM.art && MM.art.whenReady) await MM.art.whenReady();
    if (MM.loop) { try { __mm.newGame({ name: 'Tester' }); } catch (e) { console.error(e); } }
    if (MM.loop) MM.loop.stop(); else loop = function () {};
    window.__sfx = [];
    const a = MM.audio;
    if (a && a.sfx) { const o = a.sfx; a.sfx = function (id, opt) { window.__sfx.push(id); return o.call(this, id, opt); }; }
    else MM.audio = Object.assign(MM.audio || {}, { sfx(id) { window.__sfx.push(id); return true; } });
    window.__bus = [];
    ['spell:cast', 'spell:impact', 'spell:fail'].forEach((n) => MM.bus.on(n, (d) => window.__bus.push(n + ':' + (d && (d.sig || d.reason || d.id)))));
    window.__sig = {};
    for (const s of spells) { const w = MM.fx.sigOf(s); let i = SPELLS.findIndex((x) => MM.fx.sigOf(x) === w); if (i < 0) { SPELLS.push(s); i = SPELLS.length - 1; } window.__sig[w] = i; }
    window.__step = function (n, dt, drawEach) { dt = dt || 1 / 60; for (let i = 0; i < n; i++) { update(dt); if (drawEach !== false) draw(); } if (drawEach === false) draw(); };
    // a cast exactly as baseline castSpell records it (bypasses campaign unlock/cooldown gating for tests)
    window.__cast = function (sig, target) {
      const spell = SPELLS[window.__sig[sig]], t = target || (typeof spellTarget === 'function' ? spellTarget(game) : null) || dummy;
      effects.push({ spell, elapsed: 0, from: { x: game.x, y: game.y, height: game.height || 0 }, target: t, caster: game, hitIndex: 0 });
      game.castRemaining = 0.48; MM.bus.emit('cast', { actor: game, spell, target: t }); return true;
    };
  }, TEST_SPELLS);
  await page.waitForTimeout(50);
  return { browser, page, errors, core: has.core };
}

async function shot(page, name, scale = 2) {
  const url = await page.evaluate((s) => MM.filter.snapshot(s), scale);
  const file = path.join(OUT, name);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  return file;
}
// Crop (x,y,w,h in canvas px) of the current scene, nearest-neighbour upscaled.
async function crop(page, name, x, y, w, h, scale = 4) {
  const url = await page.evaluate(([x, y, w, h, s]) => {
    const src = document.getElementById('scene'), c = document.createElement('canvas'); c.width = w * s; c.height = h * s;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, x, y, w, h, 0, 0, w * s, h * s); return c.toDataURL('image/png');
  }, [x, y, w, h, scale]);
  const file = path.join(OUT, name);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  return file;
}
// Standard scene: player near the plaza, dummy in view, deterministic time/weather/palette.
async function scene(page, o = {}) {
  await page.evaluate((o) => {
    if (o.region && o.region !== world.region) goRegion(o.region);
    if (o.dungeon) enterDungeon(false);
    if (!o.keepEnemies) { enemies.length = 0; lootDrops.length = 0; effects.length = 0; world.ward = 0; world.hp = heroMaxHP(); MM.fx.clear(); if (MM.vfx) MM.vfx.clear(true); }
    world.time = o.time == null ? 0.3 : o.time; world.weather = o.weather || 'Clear';
    game.x = o.px == null ? 10.4 : o.px; game.y = o.py == null ? 10.6 : o.py; game.vx = game.vy = 0;
    const p = project(game.x, game.y); game.camX = p.x; game.camY = p.y - 10;
    enemies.forEach((e) => { e.attack = 5; e.special = 4; });
    MM.lighting.setPalette(o.palette || null);
    if (o.settings) MM.settings.set(o.settings);
    __step(o.warm == null ? 40 : o.warm);
  }, o);
}

module.exports = { open, shot, crop, scene, OUT, ROOT, TEST_SPELLS };
