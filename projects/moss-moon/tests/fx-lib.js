// Shared Playwright harness for tests/fx-*.js. Loads index.html, injects the core stand-in and the
// FX modules when index.html does not load them yet, freezes the rAF loop and exposes a stepper.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', 'out');

// Test copies of the five signature spells (used only when CAMPAIGN has not added them to SPELLS).
const TEST_SPELLS = [
  { id: 'moonbolt', name: 'Moonbolt', school: 'Moon', kind: 'bolt', color: '#a9c4ff', core: '#f1f5ff', damage: 28, hit: [0.3], duration: 0.7, description: 'test' },
  { id: 'ember_bloom', name: 'Ember Bloom', school: 'Fire', kind: 'fireball', color: '#f47c46', core: '#ffd36e', damage: 44, hit: [0.42], duration: 1.0, status: 'burn', radius: 26, description: 'test' },
  { id: 'thornbind', name: 'Thornbind', school: 'Nature', kind: 'vines', color: '#6fae5c', core: '#cdeea0', damage: 24, hit: [0.36], duration: 1.1, status: 'root', radius: 22, description: 'test' },
  { id: 'frostbell', name: 'Frostbell', school: 'Frost', kind: 'shard', color: '#9fdcf0', core: '#ffffff', damage: 30, hit: [0.3], duration: 0.9, status: 'chill', radius: 30, description: 'test' },
  { id: 'starfall', name: 'Starfall', school: 'Astral', kind: 'meteor', color: '#ffe39a', core: '#fff6d6', damage: 80, hit: [0.9], duration: 1.5, radius: 34, description: 'test' },
];

async function open(opts = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = opts.browser || await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (opts.clearStorage !== false) await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => { try { return typeof game === 'object' && !!game; } catch (e) { return false; } });
  const has = await page.evaluate(() => ({ core: !!(window.MM && MM.hooks && MM.hooks.on), lighting: !!(window.MM && MM.lighting), fx: !!(window.MM && MM.fx), filter: !!(window.MM && MM.filter), campaign: !!(window.MM && MM.campaign) }));
  if (!has.core) await page.addScriptTag({ path: path.join(ROOT, 'tests/fx-standin.js') });
  for (const [k, f] of [['lighting', 'src/systems/lighting.js'], ['fx', 'src/systems/fx.js'], ['filter', 'src/systems/filter.js']]) if (!has[k]) await page.addScriptTag({ path: path.join(ROOT, f) });
  await page.evaluate((spells) => {
    // sound recorder (wraps the real MM.audio when present)
    window.__sfx = [];
    const a = MM.audio;
    if (a && a.sfx) { const o = a.sfx; a.sfx = function (id, opt) { window.__sfx.push(id); return o.call(this, id, opt); }; }
    else MM.audio = Object.assign(MM.audio || {}, { sfx(id) { window.__sfx.push(id); return true; } });
    window.__bus = [];
    ['spell:cast', 'spell:impact', 'spell:fail'].forEach((n) => MM.bus.on(n, (d) => window.__bus.push(n + ':' + (d && (d.sig || d.reason || d.id)))));
    // signature spells: use CAMPAIGN's when present, else test copies
    const want = ['moonbolt', 'emberbloom', 'thornbind', 'frostbell', 'starfall'];
    window.__sig = {};
    for (const w of want) { const i = SPELLS.findIndex((s) => MM.fx.sigOf(s) === w); if (i >= 0) window.__sig[w] = i; }
    for (const s of spells) { const w = MM.fx.sigOf(s); if (window.__sig[w] === undefined) { SPELLS.push(s); window.__sig[w] = SPELLS.length - 1; } }
    // freeze the real loop; tests step deterministically
    loop = function () {};
    window.__step = function (n, dt, drawEach) { dt = dt || 1 / 60; for (let i = 0; i < n; i++) { update(dt); if (drawEach !== false) draw(); } if (drawEach === false) draw(); };
    window.__cast = function (sig) { castCooldown = 0; world.mana = 100; game.transition = null; chooseSpell(window.__sig[sig]); return castSpell(); };
  }, TEST_SPELLS);
  await page.waitForTimeout(80);
  return { browser, page, errors, core: has.core };
}

async function shot(page, name, scale = 2) {
  const url = await page.evaluate((s) => MM.filter.snapshot(s), scale);
  const file = path.join(OUT, name);
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  return file;
}

// Standard scene: grove, player near the plaza, dummy target in view.
async function scene(page, o = {}) {
  await page.evaluate((o) => {
    if (o.region && o.region !== world.region) goRegion(o.region);
    if (o.dungeon) enterDungeon(false);
    world.time = o.time == null ? 0.3 : o.time; world.weather = o.weather || 'Clear';
    game.x = o.px == null ? 10.4 : o.px; game.y = o.py == null ? 10.6 : o.py; game.vx = game.vy = 0;
    const p = project(game.x, game.y); game.camX = p.x; game.camY = p.y - 10;
    enemies.forEach((e) => { e.attack = 5; e.special = 4; });
    MM.lighting.setPalette(o.palette || null);
    if (o.settings) for (const k in o.settings) MM.settings.set(k, o.settings[k]);
    __step(o.warm == null ? 40 : o.warm);
  }, o);
}

module.exports = { open, shot, scene, OUT, ROOT, TEST_SPELLS };
