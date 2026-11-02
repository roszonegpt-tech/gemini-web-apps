// FX / lighting / filter / Sprite Fusion bridge assertions + perf.
// node tests/fx-test.js  -> prints JSON {pass, checks, perf}; exit 1 on failure.
const { open, scene } = require('./fx-lib');
(async () => {
  const { browser, page, errors } = await open();
  const checks = [];
  const ok = (name, cond, info) => { checks.push({ name, pass: !!cond, info }); };

  // ---------- 1. stress: 200 casts + kills + hits over 3000 frames, pools capped, no growth
  await scene(page, { time: 0.9, weather: 'Rain' });
  const stress = await page.evaluate(() => {
    const sigs = ['moonbolt', 'emberbloom', 'thornbind', 'frostbell', 'starfall'];
    const snap = () => { const f = MM.fx.stats(), v = MM.vfx ? MM.vfx.stats() : { active: 0 }; return { p: f.particles, d: f.decals, t: f.texts, g: f.telegraphs, q: f.queue, a: f.ambient, v: v.active, bp: f.baselineParticles, ef: f.effects, nu: f.numbers }; };
    const maxs = {}, at1000 = {}, end = {};
    let casts = 0;
    for (let i = 0; i < 3000; i++) {
      if (i % 15 === 0 && casts < 200) { __cast(sigs[casts % 5]); casts++; }
      if (i % 40 === 0) { const e = makeEnemy('slime', 11 + Math.random() * 2, 9 + Math.random() * 2); e.attack = 9; enemies.push(e); hitEntity(e, 999, '#bcd4ff', game); }
      if (i % 9 === 0) MM.bus.emit('hit', { target: dummy, amount: 30 + (i % 50), color: '#f47c46', source: game, crit: i % 90 === 0 });
      if (i % 300 === 0) MM.fx.telegraph({ shape: 'circle', x: 12, y: 9, r: 1, dur: 1, kind: 'danger' });
      if (i % 500 === 0) MM.bus.emit('boss', { phase: 2, enemy: dummy });
      update(1 / 60); if (i % 3 === 0) draw();
      const s = snap(); for (const k in s) maxs[k] = Math.max(maxs[k] || 0, s[k]);
      if (i === 1000) Object.assign(at1000, s);
    }
    Object.assign(end, snap());
    for (let i = 0; i < 600; i++) { update(1 / 60); if (i % 3 === 0) draw(); }
    const settled = snap(), f = MM.fx.stats();
    return { casts, maxs, at1000, end, settled, cap: f.cap, decalCap: f.decalCap, vcap: MM.vfx ? MM.vfx.stats().max : 0, flashes: f.flashes };
  });
  ok('200 casts issued', stress.casts === 200, stress.casts);
  ok('particle pool <= cap', stress.maxs.p <= stress.cap, [stress.maxs.p, stress.cap]);
  ok('decal pool <= cap', stress.maxs.d <= stress.decalCap, stress.maxs.d);
  ok('texts <= 48, telegraphs <= 32, queue <= 48', stress.maxs.t <= 48 && stress.maxs.g <= 32 && stress.maxs.q <= 48, stress.maxs);
  ok('vfx records <= max', stress.maxs.v <= stress.vcap, [stress.maxs.v, stress.vcap]);
  ok('baseline numbers drained by FX', stress.maxs.nu <= 3, stress.maxs.nu);
  ok('no growth after load ends (settled <= at 1000 frames)', stress.settled.p <= Math.max(stress.at1000.p, 40) && stress.settled.d <= Math.max(stress.at1000.d, 4) && stress.settled.v <= stress.at1000.v + 3, { at1000: stress.at1000, settled: stress.settled });

  // ---------- 2. flash limiter (<= 3 per second) + reduced flashes
  const fl = await page.evaluate(() => {
    const f0 = MM.fx.stats().flashes; let acc = 0; for (let i = 0; i < 20; i++) if (MM.fx.flash('#fff', 100, 0.4)) acc++;
    MM.settings.set('reducedFlashes', true); MM.fx.readSettings();
    const t0 = performance.now(); while (performance.now() - t0 < 1100) { /* wait out the 1 s window */ }
    let acc2 = 0; for (let i = 0; i < 20; i++) if (MM.fx.flash('#fff', 100, 0.4)) acc2++;
    const a = MM.fx.settings && MM.fx.settings.rFlash; MM.settings.set('reducedFlashes', false); MM.fx.readSettings();
    return { burst: acc, reduced: acc2, rFlash: a, total: MM.fx.stats().flashes - f0 };
  });
  ok('flash limiter: max 3 per second', fl.burst <= 3, fl);
  ok('reducedFlashes: 1 flash per 0.4 s', fl.reduced <= 1 && fl.rFlash, fl);

  // ---------- 3. reduced motion: no shockwaves, no slow-mo, no shake, pScale <= .35
  const rm = await page.evaluate(() => {
    MM.settings.set('reducedMotion', true); MM.fx.readSettings();
    const sw = MM.fx.shockwave(10, 10, 80, 0.5); MM.fx.slowmo(0.3, 0.2); const st = MM.fx.stats();
    const shk = MM.settings.shakeScale(); MM.settings.set('reducedMotion', false); MM.fx.readSettings();
    return { sw, slow: st.slow, pScale: st.pScale, shake: shk };
  });
  ok('reducedMotion: no shockwave / slow-mo / shake, reduced particles', !rm.sw && !rm.slow && rm.pScale <= 0.35 && rm.shake === 0, rm);

  // ---------- 4. dormant when the state's sim is 'none'
  await scene(page, {});
  const dorm = await page.evaluate(() => {
    __cast('emberbloom'); for (let i = 0; i < 35; i++) { update(1 / 60); draw(); }
    const before = { p: MM.fx.stats().particles, v: MM.vfx ? MM.vfx.stats().active : 0 };
    MM.state.go('menu'); const sim = MM.screens && MM.screens.sim ? MM.screens.sim() : (MM.isPaused() ? 'none' : '?');
    const p0 = MM.fx.stats().particles, a0 = MM.fx.stats().ambient;
    for (let i = 0; i < 60; i++) { MM.hooks.run ? MM.hooks.run('postUpdate', 1 / 60) : 0; }
    MM.vfx && MM.vfx.update(1 / 60);
    const after = { p: MM.fx.stats().particles, a: MM.fx.stats().ambient, v: MM.vfx ? MM.vfx.stats().active : 0 };
    MM.state.go('play');
    return { sim, before, p0, a0, after };
  });
  ok('sim none: FX frozen (no updates) and Sprite Fusion effects released', dorm.sim === 'none' && dorm.after.p === dorm.p0 && dorm.after.v === 0, dorm);

  // ---------- 5. signature spells mapped + sounds + HUD events
  const sig = await page.evaluate(() => {
    __sfx.length = 0; __bus.length = 0;
    for (const s of ['moonbolt', 'emberbloom', 'thornbind', 'frostbell', 'starfall']) { __cast(s); for (let i = 0; i < 80; i++) update(1 / 60); }
    return { sfx: __sfx.slice(), bus: __bus.slice(), made: MM.vfx ? MM.vfx.stats().made : 0 };
  });
  for (const s of ['moonbolt', 'ember', 'thorn', 'frost', 'starfall']) ok('sfx cast/impact ' + s, sig.sfx.includes('cast_' + s) && sig.sfx.includes('impact_' + s), sig.sfx.filter((x) => x.includes(s)));
  ok('HUD bus events spell:cast/impact for all 5', ['moonbolt', 'emberbloom', 'thornbind', 'frostbell', 'starfall'].every((s) => sig.bus.includes('spell:cast:' + s) && sig.bus.includes('spell:impact:' + s)), sig.bus);
  ok('Sprite Fusion effects constructed', sig.made > 5, sig.made);

  // ---------- 6. telegraph API (tile units, bosses.js shapes) + onEnd
  const tg = await page.evaluate(() => {
    let ended = 0; const ids = [MM.fx.telegraph({ shape: 'circle', x: 10, y: 10, r: 1, dur: 0.3, onEnd: () => ended++ }), MM.fx.telegraph({ shape: 'line', x: 9, y: 9, x2: 12, y2: 9, w: 0.6, dur: 0.3, kind: 'frost', onEnd: () => ended++ }), MM.fx.telegraph({ shape: 'ring', x: 10, y: 10, r: 5, dur: 0.3, kind: 'darkness', onEnd: () => ended++ })];
    for (let i = 0; i < 30; i++) { update(1 / 60); draw(); }
    return { ids, ended, left: MM.fx.stats().telegraphs };
  });
  ok('telegraphs (circle/line/ring) draw and fire onEnd', tg.ids.every((x) => x > 0) && tg.ended === 3 && tg.left === 0, tg);

  // ---------- 7. perf per quality preset in an effect-stress scene (ms per frame: update + draw)
  const perf = {};
  for (const q of ['low', 'medium', 'high']) {
    await scene(page, { time: 0.88, settings: { quality: q } });
    perf[q] = await page.evaluate((q) => {
      const sigs = ['moonbolt', 'emberbloom', 'thornbind', 'frostbell', 'starfall'];
      for (let i = 0; i < 60; i++) { update(1 / 60); draw(); }
      const cv = document.getElementById('scene'), cx = cv.getContext('2d'), flush = () => cx.getImageData(0, 0, 1, 1); // raster the frame inside the timing (fair across modes)
      MM.filter.resetStats(); const n = 240; let tot = 0, worst = 0, base = 0, nof = 0;
      for (let i = 0; i < n; i++) {
        if (i % 12 === 0) __cast(sigs[(i / 12) % 5]);
        if (i % 20 === 0) MM.bus.emit('hit', { target: dummy, amount: 60, color: '#f47c46', source: game });
        const t0 = performance.now(); update(1 / 60); draw(); flush(); const dt = performance.now() - t0; tot += dt; worst = Math.max(worst, dt);
      }
      // reference: baseline-only draw cost with every FX module disabled
      MM.filter.enabled = false;
      for (let i = 0; i < 120; i++) { if (i % 12 === 0) __cast(sigs[(i / 12) % 5]); const t0 = performance.now(); update(1 / 60); draw(); flush(); nof += performance.now() - t0; }
      MM.fx.enabled = false; MM.lighting.enabled = false; if (MM.vfx) MM.vfx.enabled = false;
      for (let i = 0; i < 60; i++) { const t0 = performance.now(); update(1 / 60); draw(); flush(); base += performance.now() - t0; }
      MM.fx.enabled = true; MM.lighting.enabled = true; MM.filter.enabled = true; if (MM.vfx) MM.vfx.enabled = true;
      return { quality: q, frameMs: +(tot / n).toFixed(2), worstMs: +worst.toFixed(2), noFilterMs: +(nof / 120).toFixed(2), filterMs: +((tot / n) - (nof / 120)).toFixed(2), baselineMs: +(base / 60).toFixed(2), filterCallMs: MM.filter.stats().avg, vfxMs: MM.vfx ? MM.vfx.stats().avgMs : 0, mode: MM.filter.mode() };
    }, q);
  }
  ok('medium soft filter pass < 2.5 ms', perf.medium.filterMs < 2.5, perf.medium.filterMs);
  await page.evaluate(() => MM.settings.set('quality', 'medium'));
  ok('no page errors', errors.length === 0, errors.slice(0, 5));
  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ pass: !failed.length, total: checks.length, failed, perf }, null, 1));
  await browser.close(); process.exit(failed.length ? 1 : 0);
})();
