// WORLD visuals screenshot + perf test.
// Usage: node tests/world-shots.js [outDir=tests/out] [flags e.g. fx=1,noart=1] [only=grove0,village,...]
// Teleports into every region and every homestead restoration level 0..4 (+ dungeons, night, interact checks),
// saves tests/out/world-<name>.png at 2x and prints per-layer ms/frame from MM.world.perf().
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = path.resolve(process.argv[2] || 'tests/out');
  const flags = (process.argv[3] || '').split(',').filter(Boolean).join('&');
  const only = process.argv[4] ? process.argv[4].split(',') : null;
  const tag = flags ? '-' + flags.replace(/=1/g, '').replace(/&/g, '-') : '';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 640 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + path.resolve(__dirname, 'world-harness.html') + (flags ? '?' + flags : ''));
  await p.waitForFunction(() => window.__harnessReady && (!window.MM_ART || (window.MM.art && window.MM.art.ready)), null, { timeout: 15000 });
  await p.waitForTimeout(400);
  const shot = async (name, setup, wait = 700) => {
    if (only && !only.includes(name)) return;
    await p.evaluate(setup);
    await p.waitForTimeout(wait);
    await p.evaluate(() => MM.world.perf(true));
    await p.waitForTimeout(500);
    const perf = await p.evaluate(() => MM.world.perf());
    await p.locator('#scene').screenshot({ path: path.join(out, 'world-' + name + tag + '.png') });
    console.log(name.padEnd(14), 'ms/frame', perf.totalMs.toFixed(3), JSON.stringify({ g: +perf.groundMs.toFixed(3), i: +perf.itemsMs.toFixed(3), p: +perf.postMs.toFixed(3), e: +perf.emissiveMs.toFixed(3), build: +perf.lastBuildMs.toFixed(1), terrain: +perf.lastTerrainMs.toFixed(1), parts: perf.particles, frames: perf.frames }));
  };
  const at = (region, x, y, extra) => `(() => { world.time = .3; goRegion('${region}'); enemies = []; game.x = ${x}; game.y = ${y}; const q = project(game.x, game.y); game.camX = q.x; game.camY = q.y; ${extra || ''} })()`;
  for (let L = 0; L <= 4; L++) await shot('grove' + L, at('grove', 9.7, 9, `MM.world.setRestoration(${L});`));
  await shot('village', at('village', 9.7, 10, 'MM.world.setRestoration(2);'));
  await shot('forest', at('forest', 10, 9));
  await shot('swamp', at('swamp', 10, 9));
  await shot('mountain', at('mountain', 10, 9));
  await shot('crypt', at('crypt', 10, 9));
  await shot('sky', at('sky', 10, 10));
  for (const r of ['forest', 'swamp', 'mountain', 'crypt']) await shot('dungeon-' + r, at(r, 10, 9, "enterDungeon(false); enemies = enemies.slice(0, 2);"));
  await shot('grove4-night', at('grove', 11, 7, 'MM.world.setRestoration(4); world.time = .8;'), 900);
  await shot('village-night', at('village', 9.7, 10, 'world.time = .8;'), 900);
  await shot('grove0-edge', at('grove', 17.5, 16.5, 'MM.world.setRestoration(0);'));
  // behaviour checks
  const info = await p.evaluate(() => {
    const r = {};
    goRegion('village'); enemies = []; game.x = 9.0; game.y = 8.0;
    r.prompt = MM.world.currentPrompt(); r.nearest = MM.world.nearestInteractable(9.0, 8.0)?.id;
    let got = null; const off = MM.world.register('marrow', (it) => { got = it.id; });
    r.interact = MM.world.interact(); off(); r.handled = got;
    r.lights = MM.world.getLights().length; r.npcs = MM.world.npcs().map((n) => n.id).join(',');
    r.layoutForest = MM.world.layout('forest').interactables.map((i) => i.id).join(',');
    // collision: walk into the well from the plaza
    game.x = 11.4; game.y = 7.8; for (let i = 0; i < 60; i++) moveActor(game, 0.03, 0); r.wellBlockedX = +game.x.toFixed(2);
    goRegion('grove'); MM.world.setRestoration(2); game.x = 9.7; game.y = 10; for (let i = 0; i < 40; i++) moveActor(game, 0, 0); r.spawnFree = game.x === 9.7 && game.y === 10;
    return r;
  });
  console.log('checks', JSON.stringify(info));
  console.log(JSON.stringify({ errors: errs }));
  await b.close(); process.exit(errs.length ? 1 : 0);
})();
