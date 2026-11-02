/* Moss Moon — MM.vfx (FX agent): bridge between the vendored Sprite Fusion pixel-art VFX library
 * (MM.sfvfx, MIT © 2026 Hugo Duprez, src/systems/sfvfx.js — generated, never hand-edited) and the game.
 *
 * One shared Frame (512×320 logical px = game px; option units = 2 × px, as in the library). Each frame:
 *   drawGround (p60): clear -> every active effect draws its 'back' layer -> dirty-rect putImageData into one
 *                     offscreen canvas -> drawImage under the world transform (camera-shake aware) -> light 'lighter'
 *   postEffects (p20): same for the 'front' layer (before MM.filter at p1000, so effects bloom; MM.fx overlay —
 *                     telegraphs, numbers — is drawn later and always stays on top)
 * World effects are camera-anchored by setting frame.ox/oy = camera origin; weather fields are screen-anchored.
 * Budgets: pooled records, per-class caps (burst / spell / attach / ambient), off-screen culling, max lifetimes,
 * cleanup on region / dungeon / state changes; dormant (nothing updated or drawn) while the state's sim is 'none'.
 * Settings: fxIntensity (size/density), particles (density), quality (low: no light layer, fewer fields),
 * reducedMotion (no shake/ripple, calmer ambient), reducedFlashes (light layer dimmed, flash callbacks limited).
 *
 * API (tile coordinates like MM.fx):
 *   MM.vfx.play(name, x, y, opts) -> id      one-shot / timed effect at a world point (opts.z = height px,
 *                                           opts.cls 'burst'|'spell'|'attach'|'ambient', other opts go to the effect)
 *   MM.vfx.attach(name, actor, opts) -> id  follows an entity ({x,y} tiles); opts.until(actor) -> false stops it
 *   MM.vfx.stop(id) (graceful: effect's own stop()) ; MM.vfx.kill(id) ; MM.vfx.clear() ; MM.vfx.stats()
 *   MM.vfx.owns(kind) -> true when the bridge renders that ambient kind ('rain'|'snow'|'fog'|'fireflies'|'leaves')
 *   MM.vfx.hex('#rrggbb') -> packed colour for ramp options ; MM.vfx.PAL (Moss & Moon ramps)
 */
window.MM = window.MM || {};
(function () {
  'use strict';
  const MM = window.MM;
  const W = 512, H = 320;
  const V = MM.vfx = { enabled: true, version: 1 };
  function lib() { return MM.sfvfx || null; }
  function base() { try { return typeof world === 'object' && !!world && typeof game === 'object' && !!game; } catch (e) { return false; } }
  function simOn() { try { const s = MM.screens; if (s && s.def) { const d = s.def(s.current); if (d && d.sim === 'none') return false; } } catch (e) { /* */ } return true; }
  function setting(k, d) { try { const s = MM.settings; if (s && s.get) { const v = s.get(k); return v === undefined || v === null ? d : v; } } catch (e) { /* */ } return d; }
  const S = { fxI: 1, pScale: 0.7, rMotion: false, rFlash: false, quality: 'medium' };
  function readSettings() {
    const fi = +setting('fxIntensity', 1); S.fxI = fi >= 0.25 && fi <= 2 ? fi : 1;
    let ps = 0.7; try { if (MM.settings && MM.settings.particleScale) ps = MM.settings.particleScale(); } catch (e) { /* */ }
    S.pScale = ps > 0 ? ps : 0.35;
    S.rMotion = !!setting('reducedMotion', false); S.rFlash = !!setting('reducedFlashes', false); S.quality = setting('quality', 'medium');
    CAP.burst = S.quality === 'low' ? 4 : 6; CAP.spell = S.quality === 'low' ? 3 : 5; CAP.attach = S.quality === 'low' ? 3 : 6; CAP.ambient = S.quality === 'low' ? 1 : 3;
    ambKey = ''; // re-evaluate weather fields with new densities
  }
  const hex = (h) => { const v = parseInt(String(h).replace('#', ''), 16); return (255 << 24) | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255); };
  V.hex = hex;
  // Moss & Moon palette ramps (light -> dark) for the library's colour options
  const PAL = V.PAL = {
    moon: ['#ffffff', '#eef3ff', '#c8d6ff', '#a9b9f4', '#8a8fd8', '#6a64b0', '#463f80', '#2a2550'],
    ember: ['#ffffff', '#fff2c0', '#ffd36e', '#ffb35c', '#f47c46', '#d8572e', '#9a3424', '#5a1e18', '#2e1210'],
    thorn: ['#f4ffd8', '#cdeea0', '#9fdc7c', '#71ad68', '#4f7a3e', '#3a5a2e', '#26401f', '#162812'],
    frost: ['#ffffff', '#e6fbff', '#bfefff', '#8fd3ec', '#5aa6c8', '#3a7aa0', '#25506e', '#142e42'],
    star: ['#ffffff', '#fffbe8', '#fff0c0', '#ffe39a', '#ffd77a', '#e0a850', '#9a6a30', '#4a3018'],
    heal: ['#ffffff', '#f0ffe6', '#c8f5a6', '#9be07a', '#62b85a', '#3f8a48', '#2a5e34', '#163820'],
    rose: ['#ffffff', '#ffe6ec', '#ffb8c8', '#ff8aa8', '#d8607e', '#a0405a', '#602a3a', '#301820'],
    gold: ['#fffbe8', '#fff0b8', '#ffe08a', '#ffd770', '#e6b04a', '#b07a30', '#6a4420', '#3a2412'],
  };
  const RAMP = {}; for (const k in PAL) RAMP[k] = PAL[k].map(hex);
  V.RAMP = RAMP;

  // ------------------------------------------------------------------ shared frame + offscreen blit
  const img = (typeof ImageData === 'function') ? new ImageData(W, H) : null, limg = img ? new ImageData(W, H) : null;
  const frame = { w: W, h: H, ox: 0, oy: 0, color: img ? new Uint32Array(img.data.buffer) : new Uint32Array(W * H), light: limg ? new Uint32Array(limg.data.buffer) : new Uint32Array(W * H) };
  const off = document.createElement('canvas'); off.width = W; off.height = H; const ox2 = off.getContext('2d');
  const loff = document.createElement('canvas'); loff.width = W; loff.height = H; const lx2 = loff.getContext('2d');

  // ------------------------------------------------------------------ effect records (pooled)
  const MAX = 28, CAP = { burst: 6, spell: 5, attach: 6, ambient: 3 };
  const R = [];
  for (let i = 0; i < MAX; i++) R.push({ on: false, id: 0, name: '', fx: null, cls: 'burst', screen: false, actor: null, until: null, age: 0, maxAge: 6, ux: 0, uy: 0, rx: 60, up: 80, dn: 30, stopping: false, kind: '', delay: 0, make: null, opts: null });
  let nid = 1, active = 0, made = 0, finished = 0, culled = 0;
  const counts = { burst: 0, spell: 0, attach: 0, ambient: 0 };
  // rough extents (units) per effect for the dirty rect / culling: [halfWidth, up, down]
  const EXT = { explosion: [170, 190, 90], impact: [50, 50, 30], slash: [110, 90, 60], sparkle: [90, 80, 80], heal: [80, 170, 20], powerUp: [150, 240, 70], holyLight: [260, 680, 160], ice: [110, 120, 30],
    poison: [110, 110, 40], fire: [50, 90, 20], shield: [80, 110, 30], pickup: [60, 80, 40], movement: [140, 90, 30], energy: [90, 90, 90], lightning: [110, 640, 40], blackHole: [260, 260, 260], muzzleFlash: [60, 40, 40], blood: [60, 40, 30] };
  function slot(cls) {
    let r = null;
    if (counts[cls] >= CAP[cls]) { // evict the oldest record of that class
      let best = null; for (let i = 0; i < MAX; i++) { const q = R[i]; if (q.on && q.cls === cls && (!best || q.age > best.age)) best = q; }
      if (best) release(best); else return null;
    }
    for (let i = 0; i < MAX; i++) if (!R[i].on) { r = R[i]; break; }
    return r;
  }
  function release(r) { if (!r.on) return; r.on = false; r.fx = null; r.actor = null; r.until = null; r.make = null; r.opts = null; counts[r.cls]--; active--; finished++; }
  // library callbacks (stable function objects, no per-call allocation)
  let lastShake = 0;
  const cb = {
    shake(tr) { if (S.rMotion) return; const now = performance.now(); if (now - lastShake < 120) return; lastShake = now; try { MM.camera && MM.camera.shake && MM.camera.shake(Math.min(4, 1 + tr * 6), 0.18); } catch (e) { /* */ } },
    ripple(x, y, r0, r1) { if (S.rMotion || S.quality === 'low') return; try { const wx = x / 2, wy = y / 2; MM.fx && MM.fx.shockwave && MM.fx.shockwave((wx / 16 + wy / 8) / 2, (wy / 8 - wx / 16) / 2, Math.min(160, (r1 || 60) / 2), 0.45, 0.05); } catch (e) { /* */ } },
    flash(k, rgb) { if (k < 0.25) return; try { MM.fx && MM.fx.flash && MM.fx.flash(typeof rgb === 'string' && rgb[0] === '#' ? rgb : '#fff6e0', 90, Math.min(0.18, k * 0.2)); } catch (e) { /* */ } },
    darken() { /* MM.fx owns screen darkening beats */ },
    kick() { }, cue() { },
  };
  function withCallbacks(o) { if (!('shake' in o)) o.shake = cb.shake; if (!('ripple' in o)) o.ripple = cb.ripple; if (!('flash' in o)) o.flash = cb.flash; if (!('darken' in o)) o.darken = cb.darken; return o; }
  function sizeK() { return 0.85 + 0.15 * S.fxI; }
  function start(cls, name, ux, uy, o, actor, delay) {
    const L = lib(); if (!V.enabled || !L || typeof L[name] !== 'function' || !base()) return 0;
    const r = slot(cls); if (!r) return 0;
    r.on = true; r.id = nid++; r.name = name; r.cls = cls; r.screen = !!o.screen; r.actor = actor || null; r.until = typeof o.until === 'function' ? o.until : null;
    r.age = 0; r.maxAge = o.maxAge || (cls === 'ambient' ? 1e9 : cls === 'attach' ? 30 : 7); r.ux = ux; r.uy = uy; r.stopping = false; r.kind = o.kind || '';
    const e = EXT[name] || [120, 120, 60]; const ex = o.ext || 1; r.rx = e[0] * ex; r.up = e[1] * ex; r.dn = e[2] * ex;
    r.delay = delay || 0; r.make = name; r.opts = o; r.fx = null;
    counts[cls]++; active++;
    if (!r.delay) construct(r);
    return r.id;
  }
  function construct(r) {
    try { r.fx = lib()[r.make](withCallbacks(r.opts)); made++; } catch (e) { console.error('[MM.vfx] ' + r.make, e); release(r); }
    r.opts = null; r.make = null;
  }
  const PJX = (x, y) => (x - y) * 16, PJY = (x, y) => (x + y) * 8;
  // effect option helpers (units = 2 × projected world px)
  function U(x, y, z) { return [PJX(x, y) * 2, (PJY(x, y) - (z || 0)) * 2]; }
  V.units = U;
  V.play = function (name, x, y, o) {
    o = o || {}; if (!base() || !simOn()) return 0;
    const p = U(x, y, o.z || 0), g = U(x, y, 0)[1];
    if (o.x == null) o.x = p[0]; if (o.y == null) o.y = p[1]; if (o.ground === undefined && !o.noGround) o.ground = g;
    if (o.size != null) o.size *= sizeK();
    return start(o.cls || 'burst', name, o.x, o.y, o, null, o.delay || 0);
  };
  V.attach = function (name, actor, o) {
    o = o || {}; if (!actor || !base() || !simOn()) return 0;
    const z = o.z || 0;
    if (!o.actor) o.actor = { feet: () => [PJX(actor.x, actor.y) * 2, (PJY(actor.x, actor.y) - z) * 2], hand: () => ({ x: PJX(actor.x, actor.y) * 2 + 14, y: (PJY(actor.x, actor.y) - 20) * 2, a: 0 }) };
    if (o.size != null) o.size *= sizeK();
    const p = U(actor.x, actor.y, z);
    return start(o.cls || 'attach', name, p[0], p[1], o, actor, o.delay || 0);
  };
  function find(id) { for (let i = 0; i < MAX; i++) if (R[i].on && R[i].id === id) return R[i]; return null; }
  V.stop = function (id) { const r = find(id); if (!r) return false; if (r.fx && typeof r.fx.stop === 'function') { r.stopping = true; try { r.fx.stop(); } catch (e) { release(r); } } else release(r); return true; };
  V.kill = function (id) { const r = find(id); if (r) release(r); return !!r; };
  V.clear = function (keepAmbient) { for (let i = 0; i < MAX; i++) if (R[i].on && !(keepAmbient && R[i].cls === 'ambient')) release(R[i]); if (!keepAmbient) { ambKey = ''; for (const k in amb) amb[k] = 0; } };
  V.isActive = function (id) { return !!find(id); };

  // ------------------------------------------------------------------ ambient fields (weather / region life)
  const amb = { rain: 0, snow: 0, fog: 0, fireflies: 0, leaves: 0, embers: 0, bubbles: 0 };
  let ambKey = '', ambT = 0;
  V.owns = function (kind) { return !!(V.enabled && lib() && amb[kind] && find(amb[kind])); };
  function hashGround(x) { const n = Math.floor(x / 6); let h = (n * 374761393) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return ((h >>> 0) / 4294967296); }
  // side-view "ground" lines become scattered contact depths in the iso view (screen-anchored fields)
  const groundScreen = (x) => 120 + hashGround(x) * 520;
  const groundWorld = (x) => 60 + hashGround(x + 977) * 600;
  function nightK() { try { return MM.lighting && MM.lighting.darkness ? MM.lighting.darkness() : (isNight() ? 1 : 0); } catch (e) { return 0; } }
  function restoration() {
    try {
      const c = MM.campaign && MM.campaign.state;
      if (world.region === 'grove') { if (c && c.homestead && Number.isFinite(c.homestead.level)) return c.homestead.level / 4; return 0.5; }
      if (c && c.restored && c.restored[world.region]) return 1;
    } catch (e) { /* */ }
    return 0;
  }
  function want() {
    const out = world.mode === 'outside', reg = world.region, wth = world.weather, nk = nightK() > 0.45 ? 1 : 0, rs = restoration();
    let winter = false; try { winter = season() === 'Winter'; } catch (e) { /* */ }
    const d = S.pScale * Math.min(1.3, S.fxI) * (S.rMotion ? 0.6 : 1);
    const wv = { rain: 0, snow: 0, fog: 0, fireflies: 0, leaves: 0, embers: 0, bubbles: 0, d, rs, nk, reg };
    if (!out) return wv;
    if (wth === 'Rain' || wth === 'Storm') wv.rain = wth === 'Storm' ? 1.2 : 0.8;
    if (reg === 'mountain') wv.snow = wth === 'Storm' ? 1.3 : 0.9; else if (winter && reg !== 'swamp' && !wv.rain) wv.snow = 0.5;
    if (reg === 'swamp') wv.fog = 1 - 0.6 * rs; else if (reg === 'forest' && rs < 0.5) wv.fog = 0.6; else if (reg === 'crypt') wv.fog = 0.5;
    if (nk && !wv.rain && (reg === 'grove' || reg === 'village' || reg === 'swamp' || reg === 'forest' || reg === 'tutorial')) wv.fireflies = reg === 'swamp' ? 0.9 : 0.35 + 0.65 * (reg === 'forest' ? rs * 0.6 : rs);
    if (reg === 'forest' || ((reg === 'grove' || reg === 'village') && wth === 'Wind')) wv.leaves = reg === 'forest' ? 0.8 : 0.6;
    if (reg === 'crypt') wv.embers = 0.25;
    if (S.quality === 'low') { wv.fog *= 0.6; wv.leaves *= 0.6; wv.fireflies *= 0.7; }
    return wv;
  }
  function fieldStop(kind) { const id = amb[kind]; if (id) V.stop(id); amb[kind] = 0; }
  function fieldStart(kind, k, wv) {
    const d = Math.max(0.15, k * wv.d), SCR = { x: -80, y: -60, w: (W + 80) * 2, h: (H + 60) * 2 };
    let id = 0;
    if (kind === 'rain') id = start('ambient', 'rain', 0, 0, { screen: true, area: SCR, ground: groundScreen, density: d, slant: world.weather === 'Storm' ? -0.32 : -0.2, seed: 11 });
    else if (kind === 'snow') id = start('ambient', 'snow', 0, 0, { screen: true, area: SCR, ground: groundScreen, density: d * 0.8, wind: world.weather === 'Storm' ? 40 : 14, drift: false, seed: 12 });
    else if (kind === 'fog') {
      const cols = { swamp: ['#3d5a52', '#5f7f72', '#8fb0a0'], forest: ['#4a5640', '#6a7a5c', '#94a284'], crypt: ['#3e3852', '#5c5674', '#8a84a6'] }[wv.reg] || ['#4a5468', '#6a7488', '#94a0b4'];
      id = start('ambient', 'fog', 0, 0, { screen: true, area: { x: -120, y: 300, w: (W + 120) * 2, h: 300 }, density: Math.min(1, 0.35 + 0.5 * k) * (S.rMotion ? 0.7 : 1), colors: cols, wind: S.rMotion ? 6 : 16, layers: S.quality === 'low' ? 2 : 3, seed: 13 });
    } else if (kind === 'fireflies') id = start('ambient', 'fireflies', 0, 0, { area: { x: -640, y: -40, w: 1280, h: 680 }, ground: groundWorld, density: d * 1.2, close: Math.round(2 + 4 * k), grass: false, seed: 14 });
    else if (kind === 'leaves') id = start('ambient', 'fallingLeaves', 0, 0, { screen: true, area: SCR, ground: groundScreen, leaves: Math.round(10 + 22 * d), drift: world.weather === 'Wind' ? 30 : 12, litter: false, seed: 15,
      colors: wv.reg === 'forest' ? [['#c9b46a', '#9a8a4a', '#6f6a38', '#3e3a22'], ['#9cbf6a', '#6f8a4c', '#4e6a36', '#2c3e20'], ['#d6a060', '#b07a48', '#7e5232', '#4a2e1c']] : [['#b8dc8a', '#8fb86a', '#5f8a4a', '#34502a'], ['#e8c27a', '#c9a35a', '#8a6e3a', '#4e3c20']] });
    else if (kind === 'embers') id = start('ambient', 'embers', 0, 0, { area: { x: -500, y: 100, w: 1000, h: 500 }, density: d * k, heat: false, seed: 16 });
    amb[kind] = id;
  }
  function ambient(dt) {
    ambT -= dt; if (ambT > 0) return; ambT = 1;
    const wv = want(), key = ['rain', 'snow', 'fog', 'fireflies', 'leaves', 'embers'].map((k) => k + (wv[k] ? Math.round(wv[k] * 4) : 0)).join('|') + wv.reg + world.mode;
    if (key === ambKey) return;
    ambKey = key;
    for (const k of ['rain', 'snow', 'fog', 'fireflies', 'leaves', 'embers']) {
      const on = !!(amb[k] && find(amb[k]));
      if (!wv[k] && on) fieldStop(k);
      else if (wv[k]) { if (on) fieldStop(k); fieldStart(k, wv[k], wv); }
    }
  }

  // ------------------------------------------------------------------ update (postUpdate, game time)
  V.update = function (dt) {
    if (!V.enabled || !lib() || !base()) return;
    if (!simOn()) { if (active) V.clear(); return; }
    ambient(dt);
    const cx = game.camX * 2, cy = game.camY * 2;
    for (let i = 0; i < MAX; i++) {
      const r = R[i]; if (!r.on) continue;
      if (r.delay > 0) { r.delay -= dt; if (r.delay > 0) continue; r.delay = 0; construct(r); if (!r.on) continue; }
      r.age += dt;
      if (r.actor) {
        let alive = true; try { alive = !(r.actor.dead || r.actor.hp <= 0) && (!r.until || r.until(r.actor)); } catch (e) { alive = false; }
        if (!alive && !r.stopping) { r.stopping = true; if (typeof r.fx.stop === 'function') { try { r.fx.stop(); } catch (e) { release(r); continue; } } else { release(r); continue; } }
        r.ux = PJX(r.actor.x, r.actor.y) * 2; r.uy = PJY(r.actor.x, r.actor.y) * 2;
      }
      // culling: ambient / attached effects far off-screen are not stepped (one-shots always finish)
      if (!r.screen && (r.cls === 'attach') && (Math.abs(r.ux - cx) > W * 2 || Math.abs(r.uy - cy) > H * 2)) { culled++; continue; }
      try { r.fx.update(dt); } catch (e) { console.error('[MM.vfx] update ' + r.name, e); release(r); continue; }
      let done = false; try { done = r.fx.done(); } catch (e) { done = true; }
      if (done || r.age > r.maxAge + (r.stopping ? 3 : 0)) release(r);
      else if (r.age > r.maxAge && !r.stopping) { r.stopping = true; try { r.fx.stop && r.fx.stop(); } catch (e) { release(r); } }
    }
  };

  // ------------------------------------------------------------------ draw passes
  let ms = 0, msAvg = 0, msN = 0, lastRect = 0;
  const rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function pass(ctx, layer) {
    if (!V.enabled || !active || !base() || !simOn()) return;
    const t0 = performance.now();
    const camOX = Math.round(game.camX) - 256, camOY = Math.round(game.camY) - 160;
    rect.x0 = W; rect.y0 = H; rect.x1 = 0; rect.y1 = 0;
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const r = R[i]; if (!r.on || !r.fx) continue;
      if (r.screen || r.cls === 'ambient') { rect.x0 = 0; rect.y0 = 0; rect.x1 = W; rect.y1 = H; any = true; continue; }
      const sx = r.ux / 2 - camOX, sy = r.uy / 2 - camOY, rx = r.rx / 2, up = r.up / 2, dn = r.dn / 2;
      if (sx + rx < 0 || sx - rx > W || sy + dn < 0 || sy - up > H) continue;
      if (sx - rx < rect.x0) rect.x0 = sx - rx; if (sy - up < rect.y0) rect.y0 = sy - up; if (sx + rx > rect.x1) rect.x1 = sx + rx; if (sy + dn > rect.y1) rect.y1 = sy + dn;
      any = true;
    }
    if (!any) return;
    const x0 = Math.max(0, rect.x0 | 0), y0 = Math.max(0, rect.y0 | 0), x1 = Math.min(W, Math.ceil(rect.x1)), y1 = Math.min(H, Math.ceil(rect.y1));
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    frame.color.fill(0); frame.light.fill(0);
    for (let i = 0; i < MAX; i++) {
      const r = R[i]; if (!r.on || !r.fx) continue;
      if (r.screen) { frame.ox = 0; frame.oy = 0; } else { frame.ox = camOX; frame.oy = camOY; }
      try { r.fx.draw(frame, layer); } catch (e) { console.error('[MM.vfx] draw ' + r.name, e); release(r); }
    }
    const w = x1 - x0, h = y1 - y0;
    lastRect = w * h;
    if (img) {
      ox2.putImageData(img, 0, 0, x0, y0, w, h);
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(off, x0, y0, w, h, x0, y0, w, h);
      if (S.quality !== 'low') {
        lx2.putImageData(limg, 0, 0, x0, y0, w, h);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (S.rFlash ? 0.22 : 0.4) * Math.min(1.2, 0.7 + 0.3 * S.fxI);
        ctx.drawImage(loff, x0, y0, w, h, x0, y0, w, h);
      }
      ctx.restore();
    }
    ms = performance.now() - t0; msN++; msAvg += (ms - msAvg) / Math.min(msN, 120);
  }
  V.drawBack = (ctx) => pass(ctx, 'back');
  V.drawFront = (ctx) => pass(ctx, 'front');
  V.stats = function () {
    const names = {}; for (let i = 0; i < MAX; i++) if (R[i].on) names[R[i].name] = (names[R[i].name] || 0) + 1;
    return { active, counts: Object.assign({}, counts), caps: Object.assign({}, CAP), made, finished, culled, names, ambient: Object.assign({}, amb), lastMs: +ms.toFixed(3), avgMs: +msAvg.toFixed(3), rectPx: lastRect, max: MAX };
  };

  // ------------------------------------------------------------------ install
  let installed = false;
  V.install = function () {
    if (installed) return true;
    const h = MM.hooks; if (!h || !h.on || !base()) return false;
    installed = true;
    h.on('postUpdate', V.update, 5);
    h.on('drawGround', V.drawBack, 60);
    h.on('postEffects', V.drawFront, 20);
    const b = MM.bus;
    if (b && b.on) {
      b.on('settings', readSettings);
      const reset = () => V.clear();
      ['region', 'dungeon', 'death', 'respawn', 'game:new', 'game:continue', 'game:title'].forEach((n) => b.on(n, reset));
      b.on('state', (d) => { if (!simOn()) V.clear(); else ambKey = ''; });
      b.on('day', () => { ambKey = ''; });
    }
    try { if (MM.settings && MM.settings.onChange) MM.settings.onChange(readSettings); } catch (e) { /* */ }
    readSettings();
    return true;
  };
  readSettings();
  if (!V.install()) document.addEventListener('DOMContentLoaded', () => V.install());
})();
