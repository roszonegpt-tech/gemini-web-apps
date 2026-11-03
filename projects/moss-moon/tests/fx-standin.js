/* Test-only stand-in for the MM core (bus, settings, hooks, camera) used by tests/fx-*.js while
 * src/core/mm.js is not loaded by index.html. It reproduces the PHASE2_CONTRACT names and the
 * audit §2.3 seam positions with zero-patch wrappers. It is a no-op when the real core exists. */
(function () {
  if (window.MM && window.MM.hooks && window.MM.hooks.on && !window.MM.__standin) return;
  const MM = window.MM = window.MM || {};
  MM.__standin = true;
  const L = {};
  MM.bus = {
    on(n, f) { (L[n] = L[n] || []).push(f); return () => MM.bus.off(n, f); },
    off(n, f) { const a = L[n]; if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } },
    emit(n, d) { const a = L[n]; if (!a) return; for (const f of a.slice()) { try { f(d); } catch (e) { console.error('[bus]', n, e); } } },
  };
  const DEF = { quality: 'medium', softFilter: 'low', bloom: 'low', particles: 'medium', shake: 'low', reducedFlashes: false, reducedMotion: false, damageNumbers: true, subtitles: true };
  const vals = Object.assign({}, DEF), subs = [];
  MM.settings = {
    get: (k) => vals[k], all: () => Object.assign({}, vals),
    set(k, v) { vals[k] = v; subs.forEach((f) => { try { f(k, v); } catch (e) { console.error(e); } }); MM.bus.emit('settings', { key: k, value: v }); },
    reset() { Object.assign(vals, DEF); MM.bus.emit('settings', {}); },
    onChange(f) { subs.push(f); return () => subs.splice(subs.indexOf(f), 1); },
    particleScale() { if (vals.reducedMotion) return 0.35; return { low: 0.35, medium: 0.7, high: 1 }[vals.particles] || 0.7; },
    shakeScale() { if (vals.reducedMotion) return 0; return { off: 0, low: 0.35, full: 1 }[vals.shake] || 0; },
  };
  const HK = {};
  // priority: higher runs first (stand-in convention; MM.filter/MM.fx do not depend on it)
  MM.hooks = {
    on(n, f, p) { (HK[n] = HK[n] || []).push({ f, p: p || 0 }); HK[n].sort((a, b) => b.p - a.p); return () => MM.hooks.off(n, f); },
    off(n, f) { const a = HK[n]; if (a) { const i = a.findIndex((h) => h.f === f); if (i >= 0) a.splice(i, 1); } },
  };
  const run = (n, ...a) => { let r; const list = HK[n]; if (!list) return r; for (const h of list) { try { if (h.f(...a) === true) r = true; } catch (e) { console.error('[hook]', n, e); } } return r; };
  ['preUpdate', 'postUpdate', 'preDraw', 'drawGround', 'drawables', 'light', 'postEffects', 'overlay', 'postDraw'].forEach((n) => { MM.hooks[n] = (...a) => run(n, ...a); });
  // camera shake (scaled by settings.shakeScale), offset = where the world is drawn (+x,+y)
  const off = { x: 0, y: 0 }; let sh = 0, sd = 1, amp = 0;
  MM.camera = {
    lookAhead: 0.3, follow: 4,
    shake(a, d) { a *= MM.settings.shakeScale(); if (a <= 0) return; amp = Math.max(sh > 0 ? amp * (sh / sd) : 0, a); sh = sd = Math.max(0.05, d || 0.2); },
    offset() { return off; }, focus() {},
    _amp() { return amp; },
  };
  MM.isPaused = () => false;
  // seams (audit §2.3 zero-patch recipes)
  const _u = update;
  update = function (dt) { MM.hooks.preUpdate(dt); const r = _u(dt); MM.hooks.postUpdate(dt); if (sh > 0) sh = Math.max(0, sh - dt); return r; };
  const _l = drawWeatherAndLight;
  drawWeatherAndLight = function () { if (MM.hooks.light(ctx) !== true) _l(); };
  const _m = drawExtraMagic;
  drawExtraMagic = function () { _m(); MM.hooks.postEffects(ctx); };
  const _di = ctx.drawImage;
  ctx.drawImage = function (img) { const r = _di.apply(this, arguments); if (img === ground) MM.hooks.drawGround(ctx); return r; };
  const _d = draw;
  draw = function () {
    if (sh > 0) { const k = sh / sd; off.x = Math.round((Math.random() * 2 - 1) * amp * k); off.y = Math.round((Math.random() * 2 - 1) * amp * k); } else { off.x = 0; off.y = 0; }
    MM.hooks.preDraw(ctx);
    const sx = game.camX, sy = game.camY; game.camX -= off.x; game.camY -= off.y;
    try { _d(); } finally { game.camX = sx; game.camY = sy; }
    MM.hooks.overlay(ctx); MM.hooks.postDraw();
  };
})();
