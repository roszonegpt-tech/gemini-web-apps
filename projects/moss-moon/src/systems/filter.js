/* Moss Moon — MM.filter (FX agent): soft "storybook" post pass on the SCENE canvas only.
 * Runs at the end of the 'postEffects' hook, i.e. after the world, lighting, spells and world
 * particles, but BEFORE the 'overlay' layer (telegraphs, damage numbers, markers), so combat
 * readability elements are never blurred, bloomed or graded. DOM UI is untouched by design.
 *
 * Passes (Canvas 2D compositing only, all buffers pre-allocated):
 *   bloom      half-res bright-pass (ctx.filter brightness+contrast threshold) -> quarter-res blur
 *              -> composited 'lighter' at low alpha (only near-white / saturated-bright pixels glow)
 *   diffusion  quarter-res blurred copy composited 'screen' at very low alpha (medium only)
 *   grade      cached radial gradient composited 'soft-light' (warm centre/highlights, cool edges)
 *              + 'screen' deep-blue lift (cool shadows); palette-aware (day/dusk/night/storm/dungeon)
 *   vignette   cached radial gradient (light)
 *   haze       cached top gradient, region-tinted, 'screen'
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
  const [half, hx] = mk(256, 160), [quar, qx] = mk(128, 80), [eig, ex] = mk(64, 40), [dif, dx] = mk(128, 80);
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

  // ------------------------------------------------------------------ cached gradients (per palette / region)
  const GRADE = {
    day: ['rgb(152,140,120)', 'rgb(98,104,124)'], dawn: ['rgb(156,138,128)', 'rgb(96,96,124)'], dusk: ['rgb(162,134,112)', 'rgb(90,88,120)'],
    night: ['rgb(136,136,150)', 'rgb(78,86,120)'], storm: ['rgb(134,136,140)', 'rgb(90,98,116)'], dungeon: ['rgb(142,128,116)', 'rgb(70,70,98)'],
  };
  const HAZE = { grove: '238,244,220', village: '246,238,220', forest: '214,220,196', swamp: '212,236,220', mountain: '238,246,255', crypt: '208,200,226', sky: '242,234,255', moonwell: '223,226,255' };
  const gCache = new Map();
  let vig = null, sceneCtx = null;
  function grad(ctx, key) {
    if (ctx !== sceneCtx) { sceneCtx = ctx; gCache.clear(); vig = null; }
    let g = gCache.get(key); if (g) return g;
    if (key.charCodeAt(0) === 104) { // 'h…' haze key: "h|r,g,b"
      g = ctx.createLinearGradient(0, 0, 0, 150); const c = key.slice(2);
      g.addColorStop(0, 'rgba(' + c + ',1)'); g.addColorStop(0.45, 'rgba(' + c + ',.45)'); g.addColorStop(1, 'rgba(' + c + ',0)');
    } else {
      const p = GRADE[key] || GRADE.day;
      g = ctx.createRadialGradient(W / 2, H * 0.47, 40, W / 2, H * 0.5, 330);
      g.addColorStop(0, p[0]); g.addColorStop(0.5, 'rgb(128,128,128)'); g.addColorStop(1, p[1]);
    }
    gCache.set(key, g); return g;
  }
  function vignette(ctx) {
    if (vig && ctx === sceneCtx) return vig;
    vig = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 320);
    vig.addColorStop(0, 'rgba(14,18,30,0)'); vig.addColorStop(0.6, 'rgba(14,18,30,.35)'); vig.addColorStop(1, 'rgba(14,18,30,1)');
    return vig;
  }
  function palette() { try { return (MM.lighting && MM.lighting.paletteName && MM.lighting.paletteName()) || 'day'; } catch (e) { return 'day'; } }
  function region() { try { return world.mode !== 'outside' ? '' : world.region; } catch (e) { return 'grove'; } }
  const hazeKeys = {};
  function hazeKey(reg, night) { const k = (night ? 'n' : '') + reg; let s = hazeKeys[k]; if (!s) s = hazeKeys[k] = 'h|' + (night ? '125,140,192' : HAZE[reg] || HAZE.grove); return s; }

  // ------------------------------------------------------------------ the pass
  const BLOOM_LOW = 'brightness(.53) contrast(10)', BLUR_Q = 'blur(1.5px)', BLUR_E = 'blur(2px)', BLUR_D = 'blur(1px)';
  let frame = 0, last = 0, avg = 0, samples = 0, settingsTick = 0;
  F.apply = function (ctx) {
    if (!F.enabled || !ctx) return;
    if (--settingsTick <= 0) { settingsTick = 30; readSettings(); }
    if (M.soft === 'off' && M.bloom === 'off') { last = 0; return; }
    const t0 = performance.now();
    const src = ctx.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
    const pal = palette(), dark = pal === 'night' || pal === 'dungeon';
    // ---- bloom (bright pass at half res, blur at quarter res)
    if (M.bloom !== 'off') {
      hx.globalCompositeOperation = 'copy';
      if (FILTER_OK) { hx.filter = BLOOM_LOW; hx.drawImage(src, 0, 0, 256, 160); hx.filter = 'none'; }
      else { hx.drawImage(src, 0, 0, 256, 160); hx.globalCompositeOperation = 'multiply'; hx.drawImage(half, 0, 0); hx.drawImage(half, 0, 0); hx.drawImage(half, 0, 0); }
      qx.globalCompositeOperation = 'copy';
      if (FILTER_OK) { qx.filter = BLUR_Q; qx.drawImage(half, 0, 0, 128, 80); qx.filter = 'none'; } else qx.drawImage(half, 0, 0, 128, 80);
      ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = M.bloom === 'high' ? 0.7 : 0.5;
      ctx.drawImage(quar, 0, 0, W, H);
      if (M.bloom === 'high' || !FILTER_OK) {
        ex.globalCompositeOperation = 'copy';
        if (FILTER_OK) { ex.filter = BLUR_E; ex.drawImage(quar, 0, 0, 64, 40); ex.filter = 'none'; } else ex.drawImage(quar, 0, 0, 64, 40);
        ctx.globalAlpha = M.bloom === 'high' ? 0.45 : 0.3; ctx.drawImage(eig, 0, 0, W, H);
      }
    }
    if (M.soft !== 'off') {
      const med = M.soft === 'medium';
      // ---- diffusion: a whisper of blurred scene screened on top (dreamy softness)
      if (M.diffusion) {
        dx.globalCompositeOperation = 'copy';
        if (FILTER_OK) { dx.filter = BLUR_D; dx.drawImage(src, 0, 0, 128, 80); dx.filter = 'none'; } else dx.drawImage(src, 0, 0, 128, 80);
        ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = dark ? 0.1 : 0.08;
        ctx.drawImage(dif, 0, 0, W, H);
      }
      // ---- grade: warm centre / highlights, cool darker edges (soft-light) + cool shadow lift (screen)
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = med ? 0.85 : 0.55;
      ctx.fillStyle = grad(ctx, GRADE[pal] ? pal : 'day'); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = (med ? 0.55 : 0.35) * (dark ? 1.2 : 1);
      ctx.fillStyle = dark ? 'rgb(18,26,56)' : 'rgb(22,30,52)'; ctx.fillRect(0, 0, W, H);
      // ---- atmospheric haze (top of the iso view is "far"), region-tinted
      const reg = region();
      if (reg) {
        ctx.globalAlpha = (med ? 0.15 : 0.1) * (dark ? 0.6 : 1);
        ctx.fillStyle = grad(ctx, hazeKey(reg, dark)); ctx.fillRect(0, 0, W, 150);
      }
      // ---- vignette (light)
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = med ? 0.26 : 0.18;
      ctx.fillStyle = vignette(ctx); ctx.fillRect(0, 0, W, H);
      // ---- very fine film grain, integer offsets only
      if (M.grain) {
        frame++;
        const ox = ((frame * 37) % 96), oy = ((frame * 53) % 96);
        ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.06; ctx.imageSmoothingEnabled = false;
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
      sceneCtx = sceneCtx || ctx; F.apply(ctx);
    }, -100);
    try { if (MM.bus && MM.bus.on) MM.bus.on('settings', readSettings); } catch (e) { /* */ }
    try { if (MM.settings && MM.settings.onChange) MM.settings.onChange(readSettings); } catch (e) { /* */ }
    readSettings();
    return true;
  };
  readSettings();
  if (!F.install()) document.addEventListener('DOMContentLoaded', () => F.install());
})();
