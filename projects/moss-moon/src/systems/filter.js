/* Moss Moon — MM.filter (FX agent): soft "storybook" post pass on the SCENE canvas only.
 * Runs at the end of the 'postEffects' hook, i.e. after the world, lighting, spells and world
 * particles, but BEFORE the 'overlay' layer (telegraphs, damage numbers, markers), so combat
 * readability elements are never blurred, bloomed or graded. DOM UI is untouched by design.
 *
 * Passes (Canvas 2D compositing only, all buffers pre-allocated):
 *   bloom      half-res bright-pass (ctx.filter brightness+contrast threshold) -> quarter-res blur
 *              -> composited 'lighter' at low alpha (only near-white / saturated-bright pixels glow)
 *   diffusion  quarter-res blurred copy composited 'screen' at very low alpha (medium only)
 *   grade      cached 1:1 multiply layer: warm centre (highlights keep warmth) -> cooler, darker
 *              edges = grade + light vignette in one pass; palette-aware (day/dawn/dusk/night/storm/dungeon)
 *   lift/haze  cached 1:1 screen layer: deep-blue shadow lift + region-tinted haze at the top
 * (soft-light/overlay full-screen blends cost ~0.5 ms each in software raster, so the grade is
 *  baked into multiply/screen layers, ~0.2 ms each; upscales are nearest-neighbour 2x)
 *   grain      pre-generated noise tile moved by integer offsets, 'overlay' (off with reducedMotion)
 * Fallback without ctx.filter: x^8 self-multiply threshold + down/up-scale blur.
 * Settings (live): softFilter off|low|medium, bloom off|low|high, quality low|medium|high|custom,
 * reducedMotion. API: MM.filter.apply(ctx), .snapshot(scale?) -> dataURL, .stats(), .mode(), .enabled
 */
window.MM = window.MM || {};
(function () {
  'use strict';
  const MM = window.MM;
  const W = 512, H = 320;
  const F = MM.filter = { enabled: true, version: 1 };

  function setting(k, d) { try { const s = MM.settings; if (s && s.get) { const v = s.get(k); return v === undefined || v === null ? d : v; } } catch (e) { /* */ } return d; }
  const M = { soft: 'low', bloom: 'low', quality: 'medium', grain: false, diffusion: false };
  function readSettings() {
    let soft = setting('softFilter', 'low'), bloom = setting('bloom', 'low');
    const q = setting('quality', 'medium'), rm = !!setting('reducedMotion', false);
    if (['off', 'low', 'medium'].indexOf(soft) < 0) soft = 'low';
    if (['off', 'low', 'high'].indexOf(bloom) < 0) bloom = 'low';
    if (q === 'low') { if (soft === 'medium') soft = 'low'; if (bloom === 'high') bloom = 'low'; }
    M.soft = soft; M.bloom = bloom; M.quality = q;
    M.diffusion = soft === 'medium' && q !== 'low';
    M.grain = soft === 'medium' && q !== 'low' && !rm;
  }
  F.mode = function () { return { soft: M.soft, bloom: M.bloom, quality: M.quality, grain: M.grain, diffusion: M.diffusion, filterSupported: FILTER_OK }; };

  // ------------------------------------------------------------------ buffers
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = true; return [c, x]; };
  const [half, hx] = mk(256, 160), [half2, h2x] = mk(256, 160), [quar, qx] = mk(128, 80), [dif, dx] = mk(128, 80);
  const FILTER_OK = (function () { try { const t = document.createElement('canvas').getContext('2d'); t.filter = 'blur(1px)'; return t.filter === 'blur(1px)'; } catch (e) { return false; } })();
  F.filterSupported = FILTER_OK;
  // grain tile
  const [noise, nx] = mk(96, 96);
  (function () {
    const id = nx.createImageData(96, 96), d = id.data;
    let s = 1234567; const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < d.length; i += 4) { const v = 100 + r() * 56; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    nx.putImageData(id, 0, 0);
  })();

  // ------------------------------------------------------------------ cached full-screen layers (per palette / region)
  // GRADE: multiply map = warm centre (highlights keep warmth) -> cooler, darker edges (grade + vignette in one pass)
  const GRADE = {
    day: ['255,251,240', '206,208,226'], dawn: ['255,246,240', '196,192,220'], dusk: ['255,242,226', '186,176,208'],
    night: ['244,244,255', '160,168,210'], storm: ['250,250,252', '192,198,212'], dungeon: ['255,246,232', '132,126,160'],
  };
  // LIFT: screen map = deep-blue shadow lift + region-tinted haze at the top ("far" side of the iso view)
  const HAZE = { grove: '238,244,220', village: '246,238,220', forest: '214,220,196', swamp: '212,236,220', mountain: '238,246,255', crypt: '208,200,226', sky: '242,234,255', moonwell: '223,226,255' };
  const layers = new Map();
  function layer(key, build) {
    let c = layers.get(key);
    if (c) { layers.delete(key); layers.set(key, c); return c; }
    c = build();
    layers.set(key, c);
    if (layers.size > 8) layers.delete(layers.keys().next().value);
    return c;
  }
  function gradeLayer(pal) {
    return layer('g|' + pal, () => {
      const [c, x] = mk(W, H), p = GRADE[pal] || GRADE.day;
      const g = x.createRadialGradient(W / 2, H * 0.46, 60, W / 2, H * 0.5, 330);
      g.addColorStop(0, 'rgb(' + p[0] + ')'); g.addColorStop(0.45, 'rgb(' + p[0] + ')'); g.addColorStop(1, 'rgb(' + p[1] + ')');
      x.fillStyle = g; x.fillRect(0, 0, W, H); return c;
    });
  }
  function liftLayer(pal, reg) {
    return layer('l|' + pal + '|' + reg, () => {
      const [c, x] = mk(W, H), dark = pal === 'night' || pal === 'dungeon';
      x.fillStyle = dark ? 'rgb(14,20,44)' : 'rgb(14,19,34)'; x.fillRect(0, 0, W, H);
      if (reg) {
        const col = dark ? '70,80,120' : (HAZE[reg] || HAZE.grove), g = x.createLinearGradient(0, 0, 0, 160);
        g.addColorStop(0, 'rgba(' + col + ',.5)'); g.addColorStop(0.5, 'rgba(' + col + ',.2)'); g.addColorStop(1, 'rgba(' + col + ',0)');
        x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(0, 0, W, 160);
      }
      return c;
    });
  }
  function palette() { try { return (MM.lighting && MM.lighting.paletteName && MM.lighting.paletteName()) || 'day'; } catch (e) { return 'day'; } }
  function region() { try { return world.mode !== 'outside' ? '' : world.region; } catch (e) { return 'grove'; } }

  // ------------------------------------------------------------------ the pass
  const BLOOM_T = 'brightness(.52) contrast(11)', BLUR_H = 'blur(1.5px)', BLUR_Q = 'blur(2px)', BLUR_D = 'blur(1px)';
  let frame = 0, last = 0, avg = 0, samples = 0, settingsTick = 0, sceneCtx = null;
  F.apply = function (ctx) {
    if (!F.enabled || !ctx) return;
    sceneCtx = ctx;
    if (--settingsTick <= 0) { settingsTick = 30; readSettings(); }
    if (M.soft === 'off' && M.bloom === 'off') { last = 0; return; }
    const t0 = performance.now();
    const src = ctx.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.imageSmoothingEnabled = false;
    const pal = palette();
    // ---- bloom: bright-pass at half res, blurred, added back with nearest 2x upscale (pixel-friendly)
    if (M.bloom !== 'off') {
      hx.globalCompositeOperation = 'copy';
      if (FILTER_OK) { hx.filter = BLOOM_T; hx.drawImage(src, 0, 0, 256, 160); hx.filter = 'none'; }
      else { hx.drawImage(src, 0, 0, 256, 160); hx.globalCompositeOperation = 'multiply'; hx.drawImage(half, 0, 0); hx.drawImage(half, 0, 0); hx.drawImage(half, 0, 0); }
      h2x.globalCompositeOperation = 'copy';
      if (FILTER_OK) { h2x.filter = BLUR_H; h2x.drawImage(half, 0, 0); h2x.filter = 'none'; }
      else { qx.globalCompositeOperation = 'copy'; qx.drawImage(half, 0, 0, 128, 80); h2x.drawImage(quar, 0, 0, 256, 160); }
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = M.bloom === 'high' ? 0.5 : 0.32;
      ctx.drawImage(half2, 0, 0, W, H);
      if (M.bloom === 'high') {
        qx.globalCompositeOperation = 'copy';
        if (FILTER_OK) { qx.filter = BLUR_Q; qx.drawImage(half2, 0, 0, 128, 80); qx.filter = 'none'; } else qx.drawImage(half2, 0, 0, 128, 80);
        ctx.globalAlpha = 0.3; ctx.drawImage(quar, 0, 0, W, H);
      }
    }
    if (M.soft !== 'off') {
      const med = M.soft === 'medium';
      // ---- diffusion: a whisper of blurred scene screened on top
      if (M.diffusion) {
        dx.globalCompositeOperation = 'copy';
        if (FILTER_OK) { dx.filter = BLUR_D; dx.drawImage(src, 0, 0, 128, 80); dx.filter = 'none'; } else dx.drawImage(src, 0, 0, 128, 80);
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.09;
        ctx.drawImage(dif, 0, 0, W, H);
      }
      // ---- grade + vignette (multiply), cool shadows + haze (screen)
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = med ? 1 : 0.7;
      ctx.drawImage(gradeLayer(GRADE[pal] ? pal : 'day'), 0, 0);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = med ? 1 : 0.7;
      ctx.drawImage(liftLayer(GRADE[pal] ? pal : 'day', region()), 0, 0);
      // ---- very fine film grain, integer offsets only
      if (M.grain) {
        frame++;
        const ox = ((frame * 37) % 96), oy = ((frame * 53) % 96);
        ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.05;
        for (let y = -oy; y < H; y += 96) for (let x = -ox; x < W; x += 96) ctx.drawImage(noise, x, y);
      }
    }
    ctx.restore();
    last = performance.now() - t0;
    samples++; avg += (last - avg) / Math.min(samples, 120);
  };

  F.stats = function () { return { last: +last.toFixed(3), avg: +avg.toFixed(3), samples, mode: F.mode() }; };
  F.resetStats = function () { avg = 0; samples = 0; };
  // Scene snapshot (last completed frame, including the overlay). scale = integer upscale (nearest).
  F.snapshot = function (scale) {
    let c = null; try { c = sceneCtx ? sceneCtx.canvas : document.getElementById('scene'); } catch (e) { /* */ }
    if (!c) return null;
    scale = Math.max(1, scale | 0);
    if (scale === 1) return c.toDataURL('image/png');
    const [o, ox] = mk(c.width * scale, c.height * scale); ox.imageSmoothingEnabled = false; ox.drawImage(c, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  };

  // ------------------------------------------------------------------ install
  let installed = false;
  F.install = function () {
    if (installed) return true;
    const h = MM.hooks; if (!h || !h.on) return false;
    installed = true;
    // world FX must land before the filter (so spells / particles bloom); MM.fx.drawWorld is idempotent per frame
    h.on('postEffects', function (ctx) {
      try { if (MM.fx && MM.fx.drawWorld) MM.fx.drawWorld(ctx); } catch (e) { console.error('[MM.filter] fx', e); }
      F.apply(ctx);
    }, -100);
    try { if (MM.bus && MM.bus.on) MM.bus.on('settings', readSettings); } catch (e) { /* */ }
    try { if (MM.settings && MM.settings.onChange) MM.settings.onChange(readSettings); } catch (e) { /* */ }
    readSettings();
    return true;
  };
  readSettings();
  if (!F.install()) document.addEventListener('DOMContentLoaded', () => F.install());
})();
