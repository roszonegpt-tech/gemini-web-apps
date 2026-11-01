// Visual review captures for FX / lighting / filter / Sprite Fusion bridge.
// node tests/fx-visual.js  -> tests/out/fx-*.png (2x scene shots) + tests/out/fx-strip-*.png (4x crops over time)
const { open, shot, crop, scene, OUT } = require('./fx-lib');
const fs = require('fs'), path = require('path');
let PNG = null; try { PNG = require('pngjs').PNG; } catch (e) { /* optional */ }

async function strip(page, name, frames, box, scale = 3) {
  const files = []; let prev = 0;
  for (const f of frames) { await page.evaluate((n) => __step(n), f - prev); prev = f; files.push(await crop(page, `fx-tmp-${name}-${f}.png`, box[0], box[1], box[2], box[3], scale)); }
  // stitch with the browser (no native deps)
  const url = await page.evaluate(async (urls) => {
    const ims = await Promise.all(urls.map((u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; })));
    const c = document.createElement('canvas'); c.width = ims.reduce((a, i) => a + i.width + 4, -4); c.height = ims[0].height;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); let x = 0; for (const i of ims) { g.drawImage(i, x, 0); x += i.width + 4; }
    return c.toDataURL('image/png');
  }, files.map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')));
  files.forEach((f) => fs.unlinkSync(f));
  fs.writeFileSync(path.join(OUT, `fx-strip-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
}

(async () => {
  for (const f of fs.readdirSync(OUT)) if (/^(fx-|c-|strip-|q-)/.test(f)) fs.unlinkSync(path.join(OUT, f));
  const { browser, page, errors } = await open();
  const only = process.argv[2] || '';
  const want = (k) => !only || only.split(',').includes(k);
  const BOX = [170, 60, 190, 130];
  // ---------- filter levels
  if (want('filter')) for (const [soft, bloom] of [['off', 'off'], ['low', 'low'], ['medium', 'high']]) {
    await scene(page, { settings: { softFilter: soft, bloom } });
    await shot(page, `fx-filter-${soft}.png`);
  }
  // ---------- palettes
  if (want('palettes')) {
    await scene(page, { settings: { softFilter: 'low', bloom: 'low' } });
    for (const [n, o] of [['day', { time: 0.3 }], ['dusk', { time: 0.66 }], ['night', { time: 0.9 }], ['storm', { time: 0.4, weather: 'Rain' }]]) {
      await scene(page, Object.assign({ warm: 90 }, o)); await shot(page, `fx-palette-${n}.png`);
    }
    await scene(page, { region: 'swamp', time: 0.85, warm: 120 }); await shot(page, `fx-palette-swamp-night.png`);
    await scene(page, { region: 'mountain', time: 0.35, warm: 120 }); await shot(page, `fx-palette-frost.png`);
    await scene(page, { region: 'forest', time: 0.45, warm: 120 }); await shot(page, `fx-palette-forest.png`);
    await page.evaluate(() => goRegion('crypt')); await scene(page, { dungeon: true, warm: 90 }); await shot(page, `fx-palette-dungeon.png`);
    await page.evaluate(() => goRegion('grove')); await scene(page, {});
  }
  // ---------- signature spells (mid-effect 2x shots + strips)
  if (want('spells')) {
    const plan = { moonbolt: [5, 10, 15, 22, 34], emberbloom: [8, 26, 33, 42, 70], thornbind: [8, 20, 28, 60, 200], frostbell: [6, 18, 24, 34, 55], starfall: [20, 45, 58, 66, 80] };
    const mid = { moonbolt: 15, emberbloom: 33, thornbind: 28, frostbell: 24, starfall: 45 };
    for (const s in plan) {
      await scene(page, {});
      await page.evaluate((s) => __cast(s), s);
      await strip(page, s, plan[s], BOX);
      await page.evaluate(() => __step(240));
      await scene(page, {}); await page.evaluate((s) => __cast(s), s); await page.evaluate((n) => __step(n), mid[s]);
      await shot(page, `fx-spell-${s}.png`); await page.evaluate(() => __step(300));
    }
  }
  // ---------- effect classes
  if (want('classes')) {
    const cases = {
      hit: ['chip/normal/heavy hits', () => { const d = dummy; MM.bus.emit('hit', { target: d, amount: 20, color: '#bcd4ff', source: game }); }, [2, 6, 12, 20]],
      heavy: ['heavy hit', () => { MM.bus.emit('hit', { target: dummy, amount: 400, color: '#f47c46', source: game }); }, [2, 6, 12, 20]],
      crit: ['crit', () => { MM.bus.emit('hit', { target: dummy, amount: 90, color: '#ffe39a', source: game, crit: true }); numbers.push({ value: '90', color: '#ffe39a', life: 0.9, offset: 0, crit: true }); }, [2, 8, 16, 30]],
      kill: ['kill', () => { const e = makeEnemy('slime', 12.2, 9.2); enemies.push(e); hitEntity(e, 999, '#bcd4ff', game); }, [2, 8, 16, 30, 50]],
      boss: ['boss phase', () => { const e = makeEnemy('blight', 12.2, 9.2, true); e._mmBossSeen = true; enemies.push(e); MM.bus.emit('boss', { phase: 2, enemy: e }); }, [10, 22, 30, 45, 70]],
      harvest: ['harvest', () => { const p = world.plots[0]; p.seed = 'moon'; p.growth = 100; p.watered = true; MM.bus.emit('harvest', { plot: p, seed: 'moon', amount: 1 }); p.seed = null; p.growth = 0; }, [4, 12, 24, 40, 60]],
      levelup: ['level up', () => { awardXP(world.level * 45); }, [10, 24, 40, 60, 90]],
      potion: ['potion', () => { world.potions = 3; world.hp = 50; drink(); }, [6, 20, 40, 70, 100]],
      pickup: ['pickup', () => { const d = { id: 999, x: game.x + 0.8, y: game.y - 0.4, type: 'gold', amount: 12, life: 90 }; lootDrops.push(d); pickup(d, game); }, [4, 14, 26, 40]],
      restore: ['restoration', () => { MM.fx.restorationWave('grove', { x: 11.5, y: 9 }); }, [20, 45, 70, 100, 150]],
      door: ['door', () => { MM.fx.door(game.x + 1, game.y - 1, 'exit'); }, [4, 12, 24, 40]],
      moonwell: ['moonwell', () => { MM.fx.moonwellPulse && MM.bus.emit('fragment', {}); MM.fx.burst('moonwell', 11.5, 9, { strength: 2.5 }); }, [10, 30, 50, 80]],
      hurt: ['player hurt', () => { const e = makeEnemy('slime', game.x + 0.5, game.y); enemies.push(e); MM.bus.emit('hurt', { amount: 14, from: e }); world.hp -= 14; }, [2, 6, 12, 24]],
      shield: ['shield', () => { world.ward = 30; }, [6, 20, 40, 70]],
      plant: ['plant', () => { const p = world.plots[1]; p.seed = 'wheat'; p.growth = 0; MM.bus.emit('plant', { plot: p, seed: 'wheat' }); }, [4, 10, 20, 34]],
      telegraph: ['boss telegraphs', () => { MM.fx.telegraph({ shape: 'circle', x: 12, y: 9, r: 1.1, dur: 1.5, kind: 'danger' }); MM.fx.telegraph({ shape: 'line', x: 9, y: 8, x2: 13, y2: 8, w: 0.8, dur: 1.5, kind: 'frost' }); MM.fx.telegraph({ shape: 'circle', x: 8.6, y: 11.4, r: 0.85, dur: 1.5, kind: 'poison' }); }, [10, 40, 80]],
    };
    for (const k in cases) {
      if (only && !want(k) && !want('classes')) continue;
      await scene(page, {});
      await page.evaluate((src) => { (0, eval)('(' + src + ')')(); }, cases[k][1].toString());
      await strip(page, k, cases[k][2], k === 'restore' || k === 'boss' ? [96, 20, 320, 220] : BOX, k === 'restore' || k === 'boss' ? 2 : 3);
      await page.evaluate(() => { __step(200); world.ward = 0; world.hp = heroMaxHP(); });
    }
  }
  // ---------- reduced flashes + motion view
  if (want('reduced')) {
    await scene(page, { settings: { reducedFlashes: true, reducedMotion: true } });
    await page.evaluate(() => __cast('starfall')); await page.evaluate(() => __step(66)); await shot(page, 'fx-reduced-starfall.png');
    await page.evaluate(() => { __step(200); MM.settings.set({ reducedFlashes: false, reducedMotion: false }); });
  }
  console.log(JSON.stringify({ errors }));
  await browser.close();
})();
