/* Moss Moon — MM.lighting (FX agent)
 * Replaces the baseline flat night tint (`drawWeatherAndLight`) through the MM.hooks 'light'
 * hook (returns true). Day/dawn/dusk/night/storm/dungeon palettes driven by world.time,
 * world.weather, region, mode and restoration level; light pools drawn into a low-res
 * light map (pre-rendered radial sprites, additive) that is multiplied over the scene, plus a
 * soft additive glow pass; rain streaks + splashes; swamp/crypt mist; storm lightning.
 *
 *   MM.lighting.setPalette(name|null)   force 'day'|'dawn'|'dusk'|'night'|'storm'|'dungeon' (null = auto)
 *   MM.lighting.addLight({x,y,h?,r,color,flicker?,intensity?,life?,glow?}) -> id   (tile coords, r in px)
 *   MM.lighting.removeLight(id) ; MM.lighting.clearLights()
 *   MM.lighting.pulse(x,y,r,color,intensity,life?)  short-lived light (tile coords; used by MM.fx)
 *   MM.lighting.pulseScreen(sx,sy,r,color,intensity,life?)  same in screen px (pre-shake)
 *   MM.lighting.info() -> {palette, ambient:[r,g,b], dark, lights, weather, region}
 *   MM.lighting.enabled (bool) ; MM.lighting.draw(ctx) (the hook body)
 * Light sources gathered each frame: MM.world.getLights() (or baseline lamp props when WORLD
 * does not provide it), glowing crops, player lantern, spells in flight, loot, interactables,
 * dim enemy rim lights in the dark (readability), MM.fx light emitters, addLight/pulse lights.
 * Classic script, IIFE, no per-frame allocations in the hot path.
 */
window.MM = window.MM || {};
(function () {
  'use strict';
  const MM = window.MM;
  const W = 512, H = 320;
  const L = MM.lighting = { enabled: true, forced: null, version: 1 };

  // ------------------------------------------------------------------ guards & settings
  function base() { try { return typeof world === 'object' && !!world && typeof game === 'object' && !!game; } catch (e) { return false; } }
  function setting(k, d) { try { const s = MM.settings; if (s && s.get) { const v = s.get(k); return v === undefined || v === null ? d : v; } } catch (e) { /* optional */ } return d; }
  const cfg = { quality: 'medium', pScale: 0.7, rFlash: false, rMotion: false };
  function readSettings() {
    cfg.quality = setting('quality', 'medium');
    cfg.rFlash = !!setting('reducedFlashes', false);
    cfg.rMotion = !!setting('reducedMotion', false);
    let ps = 0.7; try { if (MM.settings && MM.settings.particleScale) ps = MM.settings.particleScale(); } catch (e) { /* */ }
    cfg.pScale = ps > 0 ? ps : 0.35;
    const lw = cfg.quality === 'low' ? 128 : 256, lh = lw * 5 / 8;
    if (lm.width !== lw) { lm.width = lw; lm.height = lh; }
  }

  // ------------------------------------------------------------------ palettes
  // [t, r, g, b, dark]  ambient multiply colour over the day (world.time 0..1, night >= .68 or < .10)
  const KEYS = [
    [0.000, 86, 100, 158, 1.00], [0.085, 86, 100, 158, 1.00], [0.130, 190, 158, 184, 0.50],
    [0.175, 250, 232, 214, 0.08], [0.220, 255, 251, 243, 0.00], [0.560, 255, 251, 243, 0.00],
    [0.625, 255, 224, 186, 0.12], [0.685, 204, 154, 170, 0.48], [0.745, 86, 100, 158, 1.00],
    [1.000, 86, 100, 158, 1.00]];
  const NAMED = {
    day: [255, 251, 243, 0], dawn: [214, 172, 190, 0.38], dusk: [212, 160, 168, 0.42],
    night: [86, 100, 158, 1], storm: [150, 158, 182, 0.5], dungeon: [62, 58, 90, 1],
  };
  // weather multipliers [r,g,b,darkAdd]
  const WEATHER = { Clear: [255, 255, 255, 0], Wind: [252, 252, 250, 0], Rain: [196, 204, 218, 0.22], Storm: [160, 168, 190, 0.4], Snow: [232, 238, 250, 0.08], Fog: [220, 226, 226, 0.1] };
  // region multipliers: [unrestored rgb, restored rgb]
  const REGION = {
    grove: [[226, 224, 232], [255, 252, 244]], village: [[250, 244, 234], [255, 250, 240]],
    forest: [[206, 220, 196], [244, 250, 236]], swamp: [[196, 220, 208], [232, 246, 236]],
    mountain: [[218, 234, 255], [236, 244, 255]], crypt: [[188, 176, 212], [214, 206, 228]],
    sky: [[230, 220, 255], [246, 240, 255]], moonwell: [[200, 206, 240], [236, 236, 255]],
  };
  const MIST = { swamp: '#cfe6d6', crypt: '#b9aed2', forest: '#c9d6bf', moonwell: '#c6cdf0' };

  const amb = [255, 255, 255], tgt = [255, 255, 255];
  let dark = 0, tgtDark = 0, palName = 'day', lastT = -1, lastRegion = '', ambStr = 'rgb(255,255,255)', ambKey = -1;
  const lmix = (a, b, t) => a + (b - a) * t;

  function restoration() {
    try {
      const c = MM.campaign && MM.campaign.state;
      if (world.region === 'grove') {
        if (c && c.homestead && Number.isFinite(c.homestead.level)) return c.homestead.level / 4;
        if (MM.world && Number.isFinite(MM.world.restoration)) return MM.world.restoration / 4;
        return 0.5;
      }
      if (c && c.restored && c.restored[world.region]) return 1;
    } catch (e) { /* */ }
    return 0;
  }
  function computeTarget() {
    const dungeon = world.mode !== 'outside';
    let name, r, g, b, d;
    const forced = L.forced && NAMED[L.forced] ? L.forced : null;
    if (forced) { const p = NAMED[forced]; r = p[0]; g = p[1]; b = p[2]; d = p[3]; name = forced; }
    else if (dungeon) { const p = NAMED.dungeon; r = p[0]; g = p[1]; b = p[2]; d = p[3]; name = 'dungeon'; }
    else {
      const t = ((world.time % 1) + 1) % 1;
      let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
      const a = KEYS[i], c = KEYS[i + 1], k = (t - a[0]) / Math.max(1e-6, c[0] - a[0]), s = k * k * (3 - 2 * k);
      r = lmix(a[1], c[1], s); g = lmix(a[2], c[2], s); b = lmix(a[3], c[3], s); d = lmix(a[4], c[4], s);
      name = d > 0.8 ? 'night' : t > 0.5 && d > 0.05 ? 'dusk' : t < 0.25 && d > 0.05 ? 'dawn' : 'day';
    }
    if (!dungeon) {
      const wk = forced === 'storm' ? 'Storm' : world.weather;
      const wm = WEATHER[wk] || WEATHER.Clear;
      if (forced !== 'storm') { r *= wm[0] / 255; g *= wm[1] / 255; b *= wm[2] / 255; d = Math.min(1, d + wm[3]); }
      if (!forced && (wk === 'Rain' || wk === 'Storm') && d < 0.8) name = 'storm';
      const reg = REGION[world.region] || REGION.grove, rs = restoration();
      r *= lmix(reg[0][0], reg[1][0], rs) / 255; g *= lmix(reg[0][1], reg[1][1], rs) / 255; b *= lmix(reg[0][2], reg[1][2], rs) / 255;
    } else if (world.region === 'crypt' || world.mode === 'rift') { r *= 0.92; b *= 1.04; }
    tgt[0] = r; tgt[1] = g; tgt[2] = b; tgtDark = d; palName = name;
  }

  // ------------------------------------------------------------------ light sprites
  const sprites = new Map();
  function sprite(color) {
    let c = sprites.get(color);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color); g.addColorStop(0.25, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.globalAlpha = 1; x.fillRect(0, 0, 64, 64);
    // soften: second falloff so the edge is gentle
    x.globalCompositeOperation = 'destination-in';
    const m = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.45, 'rgba(0,0,0,.75)'); m.addColorStop(0.75, 'rgba(0,0,0,.28)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = m; x.fillRect(0, 0, 64, 64);
    if (sprites.size > 48) sprites.delete(sprites.keys().next().value);
    sprites.set(color, c);
    return c;
  }
  L.sprite = sprite;

  // ------------------------------------------------------------------ light records (pooled)
  const MAXL = 96;
  const lx = new Float32Array(MAXL), ly = new Float32Array(MAXL), lr = new Float32Array(MAXL), li = new Float32Array(MAXL), lg = new Float32Array(MAXL);
  const lc = new Array(MAXL).fill('#fff');
  let ln = 0, lcap = 64;
  // world -> screen (pre-shake: the ctx transform adds the shake offset)
  let camX = 0, camY = 0;
  function push(sx, sy, r, color, inten, glow) {
    if (ln >= lcap || inten <= 0.01 || r < 2) return;
    if (sx < -r || sx > W + r || sy < -r || sy > H + r) return;
    lx[ln] = sx; ly[ln] = sy; lr[ln] = r; lc[ln] = color; li[ln] = inten; lg[ln] = glow; ln++;
  }
  function pushTile(x, y, h, r, color, inten, glow) {
    push(256 + (x - y) * 16 - camX, 160 + (x + y) * 8 - camY - (h || 0), r, color, inten, glow);
  }
  L.emitScreen = push; // for MM.fx emitters: (sx, sy, r, color, intensity, glow)

  // user lights
  const user = [];
  let uid = 1;
  L.addLight = function (o) {
    if (!o) return 0;
    const rec = { id: uid++, x: +o.x || 0, y: +o.y || 0, h: +o.h || 0, r: +o.r || 48, color: o.color || '#ffd890', flicker: +o.flicker || 0, intensity: o.intensity == null ? 0.8 : +o.intensity, life: o.life == null ? -1 : +o.life, ttl: o.life == null ? -1 : +o.life, glow: o.glow == null ? 0.5 : +o.glow, follow: o.follow || null };
    if (user.length >= 64) user.shift();
    user.push(rec); return rec.id;
  };
  L.removeLight = function (id) { for (let i = user.length - 1; i >= 0; i--) if (user[i].id === id) user.splice(i, 1); };
  L.clearLights = function () { user.length = 0; pn = 0; };
  // transient pulses (pool)
  const PM = 48, pX = new Float32Array(PM), pY = new Float32Array(PM), pR = new Float32Array(PM), pI = new Float32Array(PM), pL = new Float32Array(PM), pT = new Float32Array(PM), pS = new Uint8Array(PM);
  const pC = new Array(PM).fill('#fff');
  let pn = 0;
  function addPulse(screen, x, y, r, color, inten, life) {
    let i = pn < PM ? pn++ : 0;
    if (i === 0 && pn >= PM) { let m = 1e9; for (let k = 0; k < PM; k++) if (pL[k] < m) { m = pL[k]; i = k; } }
    pX[i] = x; pY[i] = y; pR[i] = r || 40; pC[i] = color || '#fff'; pI[i] = inten == null ? 0.8 : inten; pL[i] = pT[i] = life || 0.25; pS[i] = screen ? 1 : 0;
  }
  L.pulse = function (x, y, r, color, inten, life) { addPulse(false, x, y, r, color, inten, life); };
  L.pulseScreen = function (sx, sy, r, color, inten, life) { addPulse(true, sx + camX - 256, sy + camY - 160, r, color, inten, life); };

  L.setPalette = function (name) { L.forced = name && NAMED[name] ? name : null; snap = true; return L.forced; };
  L.info = function () { return { palette: palName, forced: L.forced, ambient: [Math.round(amb[0]), Math.round(amb[1]), Math.round(amb[2])], dark: +dark.toFixed(3), lights: ln, weather: base() ? world.weather : null, region: base() ? world.region : null }; };
  L.darkness = () => dark;
  L.paletteName = () => palName;
  let snap = true;

  // ------------------------------------------------------------------ light map & mist canvases
  const lm = document.createElement('canvas'); lm.width = 256; lm.height = 160;
  const lmx = lm.getContext('2d');
  let mist = null; const mistTint = new Map();
  function makeMist() {
    mist = document.createElement('canvas'); mist.width = 256; mist.height = 128;
    const x = mist.getContext('2d');
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const cx = rnd() * 256, cy = 20 + rnd() * 96, r = 14 + rnd() * 30, a = 0.18 + rnd() * 0.22;
      for (let o = -256; o <= 256; o += 256) {
        const g = x.createRadialGradient(cx + o, cy, 0, cx + o, cy, r);
        g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(cx + o - r, cy - r, r * 2, r * 2);
      }
    }
  }
  function tintedMist(color) {
    let c = mistTint.get(color); if (c) return c;
    if (!mist) makeMist();
    c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d'); x.drawImage(mist, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = color; x.fillRect(0, 0, 256, 128);
    mistTint.set(color, c); return c;
  }

  // ------------------------------------------------------------------ rain (pooled)
  const RM = 170, rX = new Float32Array(RM), rY = new Float32Array(RM), rV = new Float32Array(RM), rG = new Float32Array(RM), rLn = new Uint8Array(RM);
  let rInit = false;
  const SM = 48, sX = new Float32Array(SM), sY = new Float32Array(SM), sL = new Float32Array(SM);
  let sn = 0;
  function rainReset(i, top) {
    rX[i] = Math.random() * (W + 60); rY[i] = top ? -Math.random() * H : Math.random() * H;
    rV[i] = 230 + Math.random() * 90; rG[i] = 40 + Math.random() * (H - 30); rLn[i] = 4 + (Math.random() * 4) | 0;
  }
  function drawRain(ctx, dt, heavy) {
    if (!rInit) { for (let i = 0; i < RM; i++) rainReset(i, false); rInit = true; }
    const n = Math.min(RM, Math.round((heavy ? 160 : 105) * Math.max(0.45, cfg.pScale)));
    const slant = heavy ? 0.32 : 0.2, mo = cfg.rMotion ? 0.55 : 1;
    ctx.fillStyle = heavy ? 'rgba(206,222,236,.5)' : 'rgba(214,230,236,.42)';
    for (let i = 0; i < n; i++) {
      rY[i] += rV[i] * dt * mo; rX[i] -= rV[i] * slant * dt * mo;
      if (rY[i] >= rG[i]) {
        if (sn < SM && rY[i] > 0) { sX[sn] = rX[i]; sY[sn] = rG[i]; sL[sn] = 0.22; sn++; }
        rainReset(i, true); rY[i] = -rLn[i] - Math.random() * 30;
      }
      if (rX[i] < -8) rX[i] += W + 40;
      const x = rX[i] | 0, y = rY[i] | 0, len = rLn[i];
      ctx.fillRect(x, y, 1, len >> 1); ctx.fillRect(x - 1, y + (len >> 1), 1, len - (len >> 1));
    }
    // splashes: tiny 2-frame crowns
    ctx.fillStyle = 'rgba(226,240,244,.55)';
    for (let i = sn - 1; i >= 0; i--) {
      sL[i] -= dt;
      if (sL[i] <= 0) { sn--; sX[i] = sX[sn]; sY[i] = sY[sn]; sL[i] = sL[sn]; continue; }
      const x = sX[i] | 0, y = sY[i] | 0, w = sL[i] > 0.11 ? 1 : 2;
      ctx.fillRect(x - w - 1, y, 1, 1); ctx.fillRect(x + w + 1, y, 1, 1);
      if (sL[i] > 0.11) ctx.fillRect(x, y - 2, 1, 1); else { ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); }
    }
  }

  // ------------------------------------------------------------------ gather lights
  const SEEDGLOW = { moon: '#cdb6ff', moonflower: '#cdb6ff', glowcap: '#7ff0d0', starmint: '#bff7ff', frost: '#bfe8ff' };
  const LOOTC = { gold: '#ffdc84', rune: '#9cecf0', gear: '#f0b8f4' };
  const lightCB = function (sx, sy, r, color, inten, glow) { push(sx, sy, r, color, inten, glow == null ? 0.4 : glow); };
  function gather(dt) {
    ln = 0; lcap = cfg.quality === 'low' ? 32 : cfg.quality === 'high' ? 96 : 64;
    const t = game.elapsed, night = dark, outside = world.mode === 'outside';
    // pulses first (spells/impacts matter most)
    for (let i = pn - 1; i >= 0; i--) {
      pL[i] -= dt;
      if (pL[i] <= 0) { pn--; pX[i] = pX[pn]; pY[i] = pY[pn]; pR[i] = pR[pn]; pC[i] = pC[pn]; pI[i] = pI[pn]; pL[i] = pL[pn]; pT[i] = pT[pn]; pS[i] = pS[pn]; continue; }
      const k = pL[i] / pT[i], sx = pS[i] ? pX[i] + 256 - camX : 0, sy = pS[i] ? pY[i] + 160 - camY : 0;
      if (pS[i]) push(sx, sy, pR[i] * (0.7 + 0.3 * k), pC[i], pI[i] * k, 0.6 * k);
      else pushTile(pX[i], pY[i], 18, pR[i] * (0.7 + 0.3 * k), pC[i], pI[i] * k, 0.6 * k);
    }
    // spells in flight / impacting (generic for every baseline spell)
    try {
      for (let i = 0; i < effects.length; i++) {
        const fx = effects[i], s = fx.spell; if (!s || s.kind === 'summon') continue;
        const v = fx.target || dummy, hit = s.hit[0] || 0.3, q = Math.min(1, fx.elapsed / Math.max(0.01, hit));
        const x = fx.from.x + (v.x - fx.from.x) * q, y = fx.from.y + (v.y - fx.from.y) * q;
        const after = fx.elapsed >= hit ? Math.max(0, 1 - (fx.elapsed - hit) / Math.max(0.1, s.duration - hit)) : 1;
        pushTile(x, y, 20, fx.elapsed >= hit ? 46 : 30, s.color, (0.55 + 0.3 * night) * after, 0.45 * after);
      }
    } catch (e) { /* effects missing */ }
    if (MM.fx && MM.fx.emitLights) { try { MM.fx.emitLights(lightCB, night); } catch (e) { /* */ } }
    // player lantern (warm, larger in dungeons)
    if (night > 0.2) {
      const dun = !outside, r = dun ? 104 : 74;
      pushTile(game.x, game.y, 14 + (game.height || 0), r, dun ? '#ffd9a0' : '#ffe2b0', (dun ? 0.95 : 0.7) * Math.min(1, night * 1.3), 0.12);
    }
    // world lights (WORLD agent) or baseline lamp props
    let wl = null; try { if (MM.world && MM.world.getLights) wl = MM.world.getLights(); } catch (e) { wl = null; }
    if (wl && wl.length) {
      for (let i = 0; i < wl.length; i++) {
        const o = wl[i]; if (!o) continue;
        const fl = o.flicker ? 1 - o.flicker * (0.5 + 0.25 * Math.sin(t * 9.1 + i * 1.7) + 0.25 * Math.sin(t * 23.3 + i)) : 1;
        const always = o.always || o.kind === 'moonwell' || o.kind === 'magic';
        const inten = (o.intensity == null ? 0.85 : o.intensity) * fl * (always ? Math.max(0.35, night) : night);
        pushTile(o.x, o.y, o.h == null ? 18 : o.h, o.r || 56, o.color || '#ffd890', inten, o.glow == null ? 0.5 : o.glow);
      }
    } else if (night > 0.05) {
      try {
        for (let i = 0; i < props.length; i++) {
          const p = props[i]; if (p.type !== 'lamp') continue;
          const fl = 1 - 0.08 * (0.5 + 0.5 * Math.sin(t * 7.3 + i * 2.1));
          pushTile(p.x, p.y, 24, 62, '#ffcf86', 0.9 * fl * night, 0.55);
        }
      } catch (e) { /* */ }
    }
    // user lights
    for (let i = user.length - 1; i >= 0; i--) {
      const u = user[i];
      if (u.ttl > 0) { u.life -= dt; if (u.life <= 0) { user.splice(i, 1); continue; } }
      const k = u.ttl > 0 ? u.life / u.ttl : 1, fl = u.flicker ? 1 - u.flicker * (0.5 + 0.5 * Math.sin(t * 11 + u.id)) : 1;
      const x = u.follow ? u.follow.x : u.x, y = u.follow ? u.follow.y : u.y;
      pushTile(x, y, u.h, u.r, u.color, u.intensity * fl * k * Math.max(0.3, night), u.glow * k);
    }
    if (night > 0.1) {
      // glowing crops
      if (outside && world.plots) {
        for (let i = 0; i < world.plots.length; i++) {
          const p = world.plots[i]; if (!p.seed || p.growth < 45) continue;
          const c = SEEDGLOW[p.seed]; if (!c) continue;
          pushTile(p.x, p.y, 10, 18 + p.growth * 0.12, c, (0.35 + 0.004 * p.growth) * night * (0.85 + 0.15 * Math.sin(t * 2 + i)), 0.35);
        }
      }
      // loot, interactables, enemies (readability in the dark)
      try { for (let i = 0; i < lootDrops.length; i++) { const d = lootDrops[i]; pushTile(d.x, d.y, 4, 20, LOOTC[d.type] || '#fff0c0', 0.75 * night, 0.3); } } catch (e) { /* */ }
      try {
        const it = MM.world && MM.world.interactables ? MM.world.interactables() : null;
        if (it) for (let i = 0; i < it.length && i < 12; i++) pushTile(it[i].x, it[i].y, 10, 22, '#ffe6a8', 0.45 * night, 0);
      } catch (e) { /* */ }
      if (night > 0.35) {
        try { for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.hp > 0) pushTile(e.x, e.y, 16, e.boss ? 40 : 26, e.boss ? '#ffc8b0' : '#c8d0ff', (e.boss ? 0.6 : 0.42) * night, 0); } } catch (e) { /* */ }
      }
    }
  }

  // ------------------------------------------------------------------ lightning (storm)
  let boltT = 0, boltNext = 6;
  function lightning(dt, active) {
    if (!active) { boltT = 0; return 0; }
    boltNext -= dt; if (boltNext <= 0) { boltNext = 6 + Math.random() * 9; boltT = 0.28; }
    if (boltT > 0) { boltT -= dt; const k = boltT > 0.2 ? 1 : boltT > 0.14 ? 0.25 : boltT > 0.08 ? 0.7 : 0.15 * (boltT / 0.08); return Math.max(0, k) * (cfg.rFlash ? 0.25 : 1); }
    return 0;
  }

  // ------------------------------------------------------------------ the hook body
  let settingsTick = 0, mistX = 0;
  L.draw = function (ctx) {
    if (!L.enabled || !base()) return false;
    if (--settingsTick <= 0) { settingsTick = 30; readSettings(); }
    let dt = lastT < 0 ? 0 : game.elapsed - lastT; lastT = game.elapsed;
    if (!(dt >= 0) || dt > 0.25) dt = 0;
    if (world.region !== lastRegion) { lastRegion = world.region; snap = true; }
    computeTarget();
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.5); snap = false;
    amb[0] = lmix(amb[0], tgt[0], k); amb[1] = lmix(amb[1], tgt[1], k); amb[2] = lmix(amb[2], tgt[2], k); dark = lmix(dark, tgtDark, k);
    camX = game.camX; camY = game.camY;
    const outside = world.mode === 'outside';
    const weather = L.forced === 'storm' ? 'Storm' : world.weather;
    const bolt = lightning(dt, outside && weather === 'Storm');
    gather(dt);
    // the ctx may carry the camera-shake translate; full-screen layers are drawn in identity space
    let tx = 0, ty = 0; try { const m = ctx.getTransform(); tx = m.e; ty = m.f; } catch (e) { /* */ }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ar = Math.min(255, amb[0] + bolt * 120), ag = Math.min(255, amb[1] + bolt * 120), ab = Math.min(255, amb[2] + bolt * 110);
    const lit = ar < 252 || ag < 252 || ab < 252 || ln > 0;
    if (lit) {
      const key = ((ar | 0) << 16) | ((ag | 0) << 8) | (ab | 0);
      if (key !== ambKey) { ambKey = key; ambStr = 'rgb(' + (ar | 0) + ',' + (ag | 0) + ',' + (ab | 0) + ')'; }
      const LW = lm.width, LH = lm.height, s = LW / W;
      lmx.globalCompositeOperation = 'source-over'; lmx.globalAlpha = 1; lmx.fillStyle = ambStr; lmx.fillRect(0, 0, LW, LH);
      lmx.globalCompositeOperation = 'lighter';
      const lightBoost = 0.25 + 0.75 * dark;
      for (let i = 0; i < ln; i++) {
        const r = lr[i] * s, x = (lx[i] + tx) * s, y = (ly[i] + ty) * s;
        lmx.globalAlpha = Math.min(1, li[i] * lightBoost);
        lmx.drawImage(sprite(lc[i]), x - r, y - r * 0.8, r * 2, r * 1.6);
      }
      ctx.globalCompositeOperation = 'multiply'; ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1;
      ctx.drawImage(lm, 0, 0, W, H);
      // soft additive glow at the brightest sources (warm pools on the ground)
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < ln; i++) {
        if (lg[i] <= 0) continue;
        const a = lg[i] * li[i] * (0.1 + 0.32 * dark); if (a < 0.02) continue;
        const r = lr[i] * 0.62;
        ctx.globalAlpha = Math.min(0.5, a);
        ctx.drawImage(sprite(lc[i]), lx[i] + tx - r, ly[i] + ty - r * 0.7, r * 2, r * 1.4);
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // region mist (swamp, crypt, blighted forest)
    const mc = outside ? MIST[world.region] : (world.region === 'swamp' ? MIST.swamp : null);
    if (mc) {
      const m = tintedMist(mc), rs = restoration(), a = (world.region === 'forest' ? 0.12 : 0.2) * (1 - 0.5 * rs) * (0.7 + 0.3 * dark);
      mistX = (mistX + dt * (cfg.rMotion ? 2 : 6)) % 256;
      const ox = -((((camX * 0.6) | 0) % 256) + 256) % 256 - mistX | 0;
      ctx.globalAlpha = a; ctx.globalCompositeOperation = 'screen'; ctx.imageSmoothingEnabled = true;
      for (let x = ox - 256; x < W; x += 256) ctx.drawImage(m, x, 150, 256, 170);
      ctx.globalAlpha = a * 0.55;
      for (let x = ox * 0.5 - 256; x < W; x += 320) ctx.drawImage(m, x, 70, 320, 120);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (outside && (weather === 'Rain' || weather === 'Storm')) drawRain(ctx, dt, weather === 'Storm');
    else sn = 0;
    ctx.restore();
    return true;
  };

  // ------------------------------------------------------------------ install
  let installed = false;
  L.install = function () {
    if (installed) return true;
    const h = MM.hooks; if (!h || !h.on) return false;
    h.on('light', L.draw, 0);
    installed = true;
    try { if (MM.bus && MM.bus.on) MM.bus.on('settings', readSettings); } catch (e) { /* */ }
    try { if (MM.settings && MM.settings.onChange) MM.settings.onChange(readSettings); } catch (e) { /* */ }
    const snapNow = () => { snap = true; };
    try { if (MM.bus && MM.bus.on) { MM.bus.on('region', snapNow); MM.bus.on('dungeon', snapNow); } } catch (e) { /* */ }
    readSettings();
    return true;
  };
  if (!L.install()) document.addEventListener('DOMContentLoaded', () => L.install());
})();
