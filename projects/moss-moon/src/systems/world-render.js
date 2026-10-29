'use strict';
// Moss & Moon — world visuals (owner: WORLD). Classic script loaded AFTER src/core/baseline.js.
// Replaces the baseline ground + props with layered per-region terrain, prop layouts, the homestead
// restoration arc, the village hub (NPCs + interactables), soft contact shadows, obstruction fading,
// foreground foliage, animated water/fog/smoke and region ambience. Publishes window.MM.world.
// Integration: MM.hooks preDraw (backdrop + terrain cache), drawGround (water/fog/ground fx),
// drawables (props/NPCs + a post-entity pass), postEffects (emissive motes, marker), overlay (wipes).
// Without MM.hooks it falls back to wrapping baseline functions (props array + drawProp, ctx.drawImage).
// Wrapped baseline functions: drawGround, drawProp, ellipse (soft shadows), moveActor (collision),
// drawDungeonBlock (themed walls), drawVillageKeeper (hidden: villagers live in the village), goRegion.
// Docs: notes/WORLD.md, notes/handoff/world.md.
window.MM = window.MM || {};
(function () {
  const MM = window.MM;
  try { world; game; ctx; project; props; ground; gc; } catch (e) { console.warn('[MM.world] baseline globals missing; world-render disabled', e); return; } // eslint-disable-line no-undef

  // ================================================================== utilities
  const TAU = Math.PI * 2, MAPN = 20;
  const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
  const nowS = () => (window.performance ? performance.now() : Date.now()) / 1000;
  function hsh(a, b, n) {
    let x = Math.imul((a | 0) + 1013, 73856093) ^ Math.imul((b | 0) + 2027, 19349663) ^ Math.imul((n | 0) + 307, 83492791);
    x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296;
  }
  function vnoise(x, y, s, seed) {
    x /= s; y /= s; const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hsh(xi, yi, seed), b = hsh(xi + 1, yi, seed), c = hsh(xi, yi + 1, seed), d = hsh(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const noise2 = (x, y, s, seed) => vnoise(x, y, s, seed) * 0.75 + vnoise(x, y, s / 2.3, seed + 17) * 0.25;
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? clampN(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }
  function polyDist(px, py, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; }
  const near = (x, y, lines, w) => lines.some((pl) => polyDist(x, y, pl) < w);
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
  const rgba = (rgb, a) => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
  function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const base = (name) => (typeof window[name] === 'function' ? window[name] : null);
  const callBase = (name, ...a) => { const f = base(name); if (!f) return undefined; try { return f(...a); } catch (e) { console.error('[MM.world] ' + name, e); return undefined; } };
  const setting = (k, d) => { try { const v = MM.settings?.get?.(k); return v === undefined ? d : v; } catch (e) { return d; } };
  const reducedMotion = () => !!setting('reducedMotion', false);
  const pScale = () => { try { return MM.settings?.particleScale?.() ?? 0.7; } catch (e) { return 0.7; } };
  const isNightNow = () => { const t = world.time; return t >= 0.68 || t < 0.1; };
  // 0 (day) .. 1 (night), with dusk/dawn ramps
  function darkness() { const t = world.time; if (t >= 0.68 || t < 0.08) return 1; if (t >= 0.56) return (t - 0.56) / 0.12; if (t < 0.18) return 1 - (t - 0.08) / 0.1; return 0; }

  // ================================================================== public object + options
  const W = MM.world = MM.world || {};
  W.version = 1;
  W.enabled = true;
  W.options = Object.assign({ art: true, foreground: true, ambient: true, collision: true, fade: true, softShadows: true, hideGroveKeeper: true }, W.options || {});
  const RV = () => MM.REGION_VISUALS || {};
  const DV = () => MM.DUNGEON_VISUALS || {};

  // ================================================================== art access
  const artReady = () => !!(W.options.art && MM.art && MM.art.ready);
  const hasArt = (n) => artReady() && MM.art.has(n);
  const artGet = (n) => (hasArt(n) ? MM.art.get(n) : null);
  // blit an art frame with optional flip / alpha / canopy sway (top part shifted dx px)
  function blitArt(g, name, x, y, t, flip, alpha, sway) {
    const f = artGet(name); if (!f || !f.img || !f.img.complete) return false;
    const fi = f.frames > 1 ? MM.art.frameAt(name, t) : 0;
    const sx = f.x + fi * f.w, dx0 = Math.round(x - (flip ? f.w - 1 - f.ax : f.ax)), dy0 = Math.round(y - f.ay);
    const a0 = g.globalAlpha; if (alpha != null && alpha < 1) g.globalAlpha = a0 * alpha;
    const split = sway ? Math.floor(f.h * 0.58) : 0;
    if (flip) { g.save(); g.translate(dx0 + f.w, dy0); g.scale(-1, 1); }
    const ox = flip ? 0 : dx0, oy = flip ? 0 : dy0, sd = flip ? -sway : sway;
    if (split) {
      g.drawImage(f.img, sx, f.y, f.w, split, ox + sd, oy, f.w, split);
      g.drawImage(f.img, sx, f.y + split, f.w, f.h - split, ox, oy + split, f.w, f.h - split);
    } else g.drawImage(f.img, sx, f.y, f.w, f.h, ox, oy, f.w, f.h);
    if (flip) g.restore();
    g.globalAlpha = a0; return true;
  }

  // ================================================================== baked procedural sprites (outlined)
  const bakes = new Map();
  function bake(key, w, h, ax, ay, paint, outline) {
    let b = bakes.get(key); if (b) return b;
    const [c, g] = mk(w + 2, h + 2); g.translate(1, 1); paint(g, w, h); g.setTransform(1, 0, 0, 1, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data, W2 = c.width, H2 = c.height;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 110 ? 0 : 255;
    if (outline !== false) {
      const ol = hexRgb(outline || '#263a37'), src = new Uint8Array(W2 * H2);
      for (let i = 0; i < W2 * H2; i++) src[i] = d[i * 4 + 3] ? 1 : 0;
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        const i = y * W2 + x; if (src[i]) continue;
        if ((x > 0 && src[i - 1]) || (x < W2 - 1 && src[i + 1]) || (y > 0 && src[i - W2]) || (y < H2 - 1 && src[i + W2])) { d[i * 4] = ol[0]; d[i * 4 + 1] = ol[1]; d[i * 4 + 2] = ol[2]; d[i * 4 + 3] = 255; }
      }
    }
    g.putImageData(im, 0, 0);
    b = { c, w: W2, h: H2, ax: ax + 1, ay: ay + 1 }; bakes.set(key, b); return b;
  }
  function blitBake(g, b, x, y, flip, alpha) {
    const a0 = g.globalAlpha; if (alpha != null && alpha < 1) g.globalAlpha = a0 * alpha;
    const dx = Math.round(x - (flip ? b.w - 1 - b.ax : b.ax)), dy = Math.round(y - b.ay);
    if (flip) { g.save(); g.translate(dx + b.w, dy); g.scale(-1, 1); g.drawImage(b.c, 0, 0); g.restore(); } else g.drawImage(b.c, dx, dy);
    g.globalAlpha = a0;
  }
  const F = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const E = (g, c, x, y, rx, ry) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); };
  const POLY = (g, c, pts) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
  const LINE = (g, c, w, pts) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };

  // ---------------------------------------------------------------- villagers (procedural, 3/4 view facing right)
  const NPC_INFO = { marrow: { name: 'Elder Marrow', lantern: true }, pip: { name: 'Pip' }, wren: { name: 'Wren' } };
  function paintMarrow(g, b, blink) {
    F(g, '#6e5642', 22, 9, 2, 31); F(g, '#8f7a5a', 22, 9, 1, 31);                    // staff
    F(g, '#4e5660', 22, 8, 4, 1); F(g, '#4e5660', 24, 9, 1, 2); F(g, '#4e5660', 23, 11, 4, 5); F(g, '#fff3c4', 24, 12, 2, 3);
    for (let y = 18 + b; y <= 39; y++) { const k = (y - 18) / 21, w = Math.round(9 + k * 7), x0 = 14 - Math.floor(w / 2) - 1; F(g, '#36636f', x0, y, w, 1); F(g, '#5f9ca3', x0, y, 1, 1); F(g, '#24474f', x0 + w - 2, y, 2, 1); }
    F(g, '#24474f', 13, 28, 1, 11); F(g, '#9a7444', 9, 26 + b, 10, 1); F(g, '#cfaa71', 15, 26 + b, 1, 3);
    F(g, '#4a3a31', 10, 40, 3, 1); F(g, '#4a3a31', 15, 40, 3, 1);
    F(g, '#2c5560', 7, 19 + b, 2, 8); F(g, '#e8b8a8', 7, 27 + b, 2, 2);                // back arm
    F(g, '#36636f', 16, 19 + b, 3, 4); F(g, '#36636f', 18, 22 + b, 4, 3); F(g, '#5f9ca3', 16, 19 + b, 3, 1); F(g, '#e8b8a8', 21, 21 + b, 2, 3);
    F(g, '#e8b8a8', 10, 10 + b, 8, 8); F(g, '#c98f7e', 17, 11 + b, 1, 6); F(g, '#c98f7e', 18, 13 + b, 1, 2);
    F(g, '#4f4566', 9, 7 + b, 10, 4); F(g, '#4f4566', 8, 9 + b, 3, 10); F(g, '#6d6390', 10, 7 + b, 6, 1); F(g, '#4f4566', 6, 8 + b, 3, 3); F(g, '#4f4566', 5, 10 + b, 2, 3);
    if (blink) F(g, '#c98f7e', 13, 13 + b, 4, 1); else { F(g, '#263a37', 13, 13 + b, 1, 1); F(g, '#263a37', 16, 13 + b, 1, 1); }
    F(g, '#d5d6bd', 12, 12 + b, 2, 1); F(g, '#d5d6bd', 15, 12 + b, 2, 1);
    F(g, '#d5d6bd', 11, 15 + b, 7, 4); F(g, '#d5d6bd', 12, 19 + b, 5, 3); F(g, '#d5d6bd', 13, 22 + b, 3, 2); F(g, '#9ea79f', 17, 15 + b, 1, 4); F(g, '#9ea79f', 16, 19 + b, 1, 3); F(g, '#9ea79f', 14, 16 + b, 2, 1);
  }
  function paintPip(g, b, blink) {
    F(g, '#9a7444', 6, 14 + b, 1, 2); F(g, '#9a7444', 5, 16 + b, 1, 12); F(g, '#9a7444', 6, 28 + b, 1, 2); F(g, '#d5d6bd', 7, 15 + b, 1, 14);
    F(g, '#6e5642', 11, 31, 3, 7); F(g, '#6e5642', 15, 31, 3, 7); F(g, '#4a3a31', 10, 37, 4, 3); F(g, '#4a3a31', 15, 37, 4, 3); F(g, '#6e5642', 11, 37, 2, 1);
    for (let y = 19 + b; y <= 31; y++) { const w = 10 + (y > 27 ? 2 : 0), x0 = 14 - w / 2; F(g, '#688d65', x0, y, w, 1); F(g, '#87ad7b', x0, y, 1, 1); F(g, '#4b7052', x0 + w - 1, y, 1, 1); }
    F(g, '#4a3a31', 9, 27, 11, 1); F(g, '#cfaa71', 14, 27, 2, 1);
    for (let i = 0; i < 7; i++) F(g, '#8f7a5a', 10 + i, 20 + b + i, 1, 1);
    F(g, '#b89d72', 17, 26, 5, 4); F(g, '#8f7a5a', 17, 26, 5, 1); F(g, '#9a7444', 21, 27, 1, 3);
    F(g, '#4b7052', 8, 20 + b, 2, 6); F(g, '#e8b8a8', 8, 26 + b, 2, 2); F(g, '#688d65', 18, 20 + b, 2, 5); F(g, '#e8b8a8', 18, 25 + b, 2, 2);
    F(g, '#e8b8a8', 10, 11 + b, 8, 8); F(g, '#c98f7e', 17, 12 + b, 1, 6); F(g, '#c98f7e', 18, 14 + b, 1, 1);
    F(g, '#d27a55', 9, 12 + b, 2, 5); F(g, '#d27a55', 10, 11 + b, 3, 2); F(g, '#d27a55', 16, 11 + b, 2, 1);
    F(g, '#4b7052', 9, 8 + b, 10, 4); F(g, '#688d65', 10, 8 + b, 7, 1); F(g, '#2f4b47', 15, 11 + b, 5, 1); F(g, '#c95d6a', 8, 4 + b, 2, 5); F(g, '#f7f4e9', 8, 4 + b, 1, 2);
    if (blink) F(g, '#c98f7e', 14, 14 + b, 3, 1); else { F(g, '#263a37', 14, 14 + b, 1, 1); F(g, '#263a37', 16, 14 + b, 1, 1); }
    F(g, '#c98f7e', 13, 16 + b, 1, 1); F(g, '#c98f7e', 15, 17 + b, 2, 1);
  }
  function paintWren(g, b, blink) {
    F(g, '#8a4a40', 8, 14 + b, 3, 11); F(g, '#6e3a33', 8, 25 + b, 2, 2); F(g, '#c95d6a', 8, 24 + b, 3, 1);
    for (let y = 19 + b; y <= 38; y++) { const k = (y - 19) / 19, w = Math.round(10 + k * 5), x0 = 14 - Math.floor(w / 2); F(g, '#7b4f7d', x0, y, w, 1); F(g, '#9a6f9c', x0, y, 1, 1); F(g, '#5a3a5d', x0 + w - 1, y, 1, 1); }
    F(g, '#e2dcc2', 11, 22 + b, 7, 14); F(g, '#c8aa86', 11, 35, 7, 1); F(g, '#e2dcc2', 11, 19 + b, 1, 3); F(g, '#e2dcc2', 16, 19 + b, 1, 3); F(g, '#c8aa86', 13, 29, 3, 2);
    F(g, '#4a3a31', 11, 39, 3, 2); F(g, '#4a3a31', 15, 39, 3, 2);
    F(g, '#5a3a5d', 8, 20 + b, 2, 5); F(g, '#e8b8a8', 7, 25 + b, 2, 2);
    F(g, '#9a7444', 3, 25 + b, 7, 5); F(g, '#cfaa71', 3, 25 + b, 7, 1); F(g, '#8f7a5a', 4, 27 + b, 5, 1);
    F(g, '#87ad7b', 4, 22 + b, 1, 3); F(g, '#688d65', 6, 21 + b, 1, 4); F(g, '#a6c593', 8, 23 + b, 1, 2); F(g, '#ebe1f7', 5, 21 + b, 1, 1); F(g, '#eac979', 7, 22 + b, 1, 1);
    F(g, '#7b4f7d', 18, 20 + b, 2, 6); F(g, '#e8b8a8', 18, 26 + b, 2, 2);
    F(g, '#e8b8a8', 10, 11 + b, 8, 8); F(g, '#c98f7e', 17, 12 + b, 1, 6); F(g, '#c98f7e', 18, 14 + b, 1, 1);
    F(g, '#8a4a40', 10, 11 + b, 7, 2); F(g, '#8a4a40', 9, 12 + b, 2, 5);
    F(g, '#cfaa71', 5, 10 + b, 18, 2); F(g, '#9a7444', 5, 11 + b, 18, 1); F(g, '#cfaa71', 9, 6 + b, 10, 4); F(g, '#eac979', 10, 6 + b, 6, 1); F(g, '#c95d6a', 9, 9 + b, 10, 1);
    F(g, '#ebe1f7', 17, 8 + b, 2, 2); F(g, '#eac979', 19, 9 + b, 1, 1); F(g, '#c6aedb', 15, 8 + b, 1, 1);
    if (blink) F(g, '#c98f7e', 14, 14 + b, 3, 1); else { F(g, '#263a37', 14, 14 + b, 1, 1); F(g, '#263a37', 16, 14 + b, 1, 1); }
    F(g, '#e8a090', 13, 16 + b, 1, 1); F(g, '#c98f7e', 15, 17 + b, 1, 1);
  }
  const NPC_PAINT = { marrow: paintMarrow, pip: paintPip, wren: paintWren };
  const npcBake = (id, bob, blink) => bake('npc:' + id + bob + blink, 28, 42, 14, 40, (g) => (NPC_PAINT[id] || paintPip)(g, bob, blink));

  // ---------------------------------------------------------------- procedural props ('@name')
  function thorns(g, pts, col, spike) {
    LINE(g, col, 2, pts);
    for (let i = 0; i < pts.length - 2; i += 2) {
      const mx = (pts[i] + pts[i + 2]) / 2, my = (pts[i + 1] + pts[i + 3]) / 2;
      F(g, spike, mx, my - 2, 1, 2); F(g, spike, mx + 2, my + 1, 2, 1);
    }
  }
  const PROC = {
    mailbox: [16, 26, 8, 25, (g) => { F(g, '#6e5642', 7, 9, 2, 17); F(g, '#8f7a5a', 7, 9, 1, 17); F(g, '#36636f', 2, 3, 12, 7); F(g, '#5f9ca3', 2, 3, 12, 2); F(g, '#24474f', 12, 4, 2, 6); F(g, '#263a37', 3, 6, 2, 2); F(g, '#c95d6a', 13, 0, 2, 5); F(g, '#e8b8a8', 13, 0, 1, 1); }],
    notice_board: [32, 36, 16, 35, (g) => {
      F(g, '#6e5642', 3, 8, 3, 28); F(g, '#6e5642', 26, 8, 3, 28); F(g, '#8f7a5a', 3, 8, 1, 28); F(g, '#8f7a5a', 26, 8, 1, 28);
      F(g, '#8a4a40', 0, 5, 32, 4); F(g, '#d27a55', 1, 5, 30, 1); F(g, '#6e3a33', 0, 8, 32, 1);
      F(g, '#8f7a5a', 2, 10, 28, 16); F(g, '#b89d72', 3, 11, 26, 14);
      F(g, '#f7f4e9', 5, 12, 7, 9); F(g, '#e2dcc2', 6, 14, 5, 1); F(g, '#e2dcc2', 6, 16, 4, 1); F(g, '#e2dcc2', 6, 18, 5, 1);
      F(g, '#f7f4e9', 14, 13, 6, 6); F(g, '#c6aedb', 15, 14, 4, 3); F(g, '#fff3c4', 21, 12, 7, 10); F(g, '#cfaa71', 22, 14, 5, 1); F(g, '#cfaa71', 22, 16, 4, 1);
      F(g, '#c95d6a', 8, 12, 1, 1); F(g, '#c95d6a', 17, 13, 1, 1); F(g, '#c95d6a', 24, 12, 1, 1);
    }],
    waystone: [18, 32, 9, 31, (g) => {
      POLY(g, '#9ea79f', [3, 31, 4, 8, 7, 2, 12, 1, 15, 7, 16, 31]); POLY(g, '#737d7e', [11, 2, 12, 1, 15, 7, 16, 31, 11, 31]);
      F(g, '#d5d6bd', 5, 9, 1, 12); F(g, '#8ff0d0', 8, 10, 2, 1); F(g, '#8ff0d0', 9, 11, 1, 4); F(g, '#8ff0d0', 7, 15, 4, 1); F(g, '#8ff0d0', 8, 18, 2, 2);
      F(g, '#688d65', 3, 27, 5, 4); F(g, '#4b7052', 12, 28, 4, 3); F(g, '#87ad7b', 4, 27, 2, 1);
    }],
    pillar: [16, 38, 8, 37, (g) => {
      F(g, '#9ea79f', 3, 6, 10, 30); F(g, '#d5d6bd', 4, 6, 2, 30); F(g, '#737d7e', 11, 6, 2, 30); F(g, '#737d7e', 7, 8, 1, 26);
      F(g, '#9ea79f', 1, 2, 14, 4); F(g, '#d5d6bd', 1, 2, 14, 1); F(g, '#737d7e', 1, 5, 14, 1); F(g, '#737d7e', 1, 34, 14, 4);
      F(g, '#4b7052', 3, 6, 2, 9); F(g, '#4b7052', 10, 6, 2, 5); F(g, '#688d65', 4, 2, 6, 2); F(g, '#36636f', 1, 33, 14, 2);
    }],
    pillar_broken: [16, 26, 8, 25, (g) => {
      POLY(g, '#9ea79f', [3, 25, 3, 6, 6, 3, 8, 6, 11, 2, 13, 5, 13, 25]); F(g, '#d5d6bd', 4, 7, 2, 18); F(g, '#737d7e', 11, 6, 2, 19);
      F(g, '#737d7e', 1, 22, 14, 4); F(g, '#4b7052', 4, 7, 2, 7); F(g, '#4b7052', 11, 6, 2, 4); F(g, '#36636f', 1, 21, 14, 2);
    }],
    crypt_block: [30, 32, 15, 31, (g) => {
      POLY(g, '#9ea79f', [15, 0, 29, 7, 15, 14, 1, 7]); POLY(g, '#737d7e', [1, 7, 15, 14, 15, 31, 1, 24]); POLY(g, '#4e5660', [15, 14, 29, 7, 29, 24, 15, 31]);
      F(g, '#d5d6bd', 8, 4, 6, 1); F(g, '#5d625f', 5, 16, 6, 1); F(g, '#3a3f44', 19, 18, 1, 6); F(g, '#5d625f', 8, 21, 1, 4); F(g, '#4b7052', 2, 21, 4, 3);
    }],
    thorn_gate: [66, 52, 33, 51, (g) => {
      E(g, '#3a2c26', 33, 52, 32, 31); E(g, '#4a3a31', 31, 50, 28, 27); E(g, '#6e5642', 24, 34, 13, 8);
      E(g, '#140f14', 33, 33, 11, 11); F(g, '#140f14', 22, 33, 22, 19); E(g, '#2a1c2a', 33, 35, 7, 8); F(g, '#2a1c2a', 26, 35, 14, 17);
      thorns(g, [4, 44, 10, 30, 20, 22, 30, 19], '#36293f', '#6d6390'); thorns(g, [62, 44, 56, 30, 46, 22, 36, 18], '#36293f', '#6d6390');
      thorns(g, [14, 50, 18, 38, 22, 30], '#4f4566', '#8a78a8'); thorns(g, [52, 50, 48, 38, 44, 30], '#4f4566', '#8a78a8');
      thorns(g, [26, 21, 33, 15, 40, 21], '#36293f', '#8a78a8');
      F(g, '#c95d6a', 12, 34, 2, 2); F(g, '#c95d6a', 50, 36, 2, 2); F(g, '#c95d6a', 33, 14, 2, 2);
    }],
    sunken_arch: [60, 54, 30, 53, (g) => {
      F(g, '#0f2228', 15, 20, 30, 32); E(g, '#0f2228', 30, 20, 15, 12);
      g.strokeStyle = '#9ea79f'; g.lineWidth = 6; g.beginPath(); g.arc(30, 20, 17, Math.PI, Math.PI * 1.86); g.stroke();
      g.strokeStyle = '#d5d6bd'; g.lineWidth = 1; g.beginPath(); g.arc(30, 20, 19, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
      F(g, '#9ea79f', 6, 18, 10, 34); F(g, '#d5d6bd', 7, 18, 2, 34); F(g, '#737d7e', 14, 18, 2, 34);
      POLY(g, '#9ea79f', [44, 52, 44, 24, 47, 20, 50, 23, 54, 21, 54, 52]); F(g, '#737d7e', 52, 22, 2, 30);
      F(g, '#4b7052', 7, 18, 3, 12); F(g, '#4b7052', 13, 22, 2, 8); F(g, '#688d65', 18, 5, 6, 3); F(g, '#4b7052', 19, 8, 2, 7); F(g, '#4b7052', 45, 24, 2, 9);
      F(g, '#36636f', 2, 46, 56, 7); F(g, '#5f9ca3', 4, 46, 10, 1); F(g, '#5f9ca3', 30, 47, 12, 1); F(g, '#a5d6d8', 20, 46, 4, 1);
    }],
    ice_cave: [68, 50, 34, 49, (g) => {
      E(g, '#5b6b86', 34, 52, 33, 34); E(g, '#7d8aa0', 31, 50, 28, 31); E(g, '#9ea9bd', 24, 34, 12, 8);
      E(g, '#f7f4e9', 30, 21, 24, 9); F(g, '#f7f4e9', 9, 20, 6, 6); F(g, '#f7f4e9', 44, 22, 8, 4); F(g, '#e6eef6', 14, 26, 30, 2);
      E(g, '#101828', 34, 40, 13, 13); F(g, '#101828', 21, 40, 26, 10); E(g, '#1f2c48', 34, 42, 8, 9); F(g, '#1f2c48', 26, 42, 16, 8);
      for (let i = 0; i < 6; i++) { const x = 24 + i * 4; POLY(g, '#d6f1fb', [x, 28, x + 3, 28, x + 1, 33 + (i % 3) * 2]); }
    }],
    mausoleum: [60, 60, 30, 59, (g) => {
      F(g, '#737d7e', 3, 53, 54, 6); F(g, '#9ea79f', 7, 49, 46, 4); F(g, '#d5d6bd', 7, 49, 46, 1);
      F(g, '#9ea79f', 10, 22, 40, 27); F(g, '#737d7e', 44, 22, 6, 27);
      F(g, '#d5d6bd', 12, 24, 5, 25); F(g, '#d5d6bd', 43, 24, 5, 25); F(g, '#9ea79f', 16, 24, 1, 25); F(g, '#9ea79f', 47, 24, 1, 25);
      POLY(g, '#4e5660', [5, 23, 30, 7, 55, 23]); POLY(g, '#8a8f8a', [9, 22, 30, 10, 51, 22]); POLY(g, '#737d7e', [16, 21, 30, 14, 44, 21]);
      F(g, '#120f1c', 22, 30, 16, 19); E(g, '#120f1c', 30, 30, 8, 5); F(g, '#4e5660', 21, 29, 1, 20); F(g, '#4e5660', 38, 29, 1, 20);
      F(g, '#b48cff', 29, 16, 2, 2); F(g, '#4b7052', 10, 44, 4, 5); F(g, '#4b7052', 47, 40, 3, 9); F(g, '#5d625f', 34, 25, 1, 4);
    }],
  };
  const PROC_MOUTH = { thorn_gate: [0, -12], sunken_arch: [0, -18], ice_cave: [0, -9], mausoleum: [0, -14] };
  const procBake = (n) => { const d = PROC[n]; return d ? bake('p:' + n, d[0], d[1], d[2], d[3], d[4]) : null; };

  // ---------------------------------------------------------------- foreground foliage sprites
  function fgSprite(style, which) {
    return bake('fg:' + style + which, 132, 84, 0, 0, (g) => {
      const R = (n) => hsh(n, which.length * 13, style.length * 7);
      if (style === 'leafy' || style === 'bunting' && which === 'b') {
        if (which === 'b') { // ferns rising from the bottom corner
          for (let f = 0; f < 5; f++) { const bx = 4 + f * 9, len = 26 + R(f) * 30, ang = -1.25 + f * 0.13;
            for (let s = 0; s < len; s += 3) { const x = bx + Math.cos(ang) * s * 0.9 + s * s * 0.004 * f, y = 84 - Math.sin(-ang) * s; F(g, s < len * 0.3 ? '#2f4b47' : '#46695f', x, y, 2, 2); if (s > 4) { F(g, '#4b7052', x - 4, y - 1, 4, 1); F(g, '#4b7052', x + 2, y - 2, 4, 1); } } }
          return;
        }
        LINE(g, '#2b2422', 4, [0, 4, 30, 12, 64, 16, 96, 26]); LINE(g, '#3d302a', 2, [40, 14, 58, 30, 66, 40]);
        for (let i = 0; i < 70; i++) {
          const t = R(i), x = t * 110, y = 6 + (x * 0.2) + (R(i + 99) - 0.3) * 30;
          const c = R(i + 7) < 0.4 ? '#2f4b47' : R(i + 7) < 0.8 ? '#46695f' : '#4b7052';
          E(g, c, x, y, 4 + R(i + 3) * 3, 2.5 + R(i + 5) * 2); if (R(i + 11) > 0.7) F(g, '#688d65', x - 2, y - 2, 2, 1);
        }
      } else if (style === 'thorn' || style === 'roots') {
        const c1 = style === 'roots' ? '#2b2422' : '#2a2030', c2 = style === 'roots' ? '#3a2c26' : '#4f4566';
        LINE(g, c1, 5, [0, 0, 26, 14, 52, 18, 84, 34, 104, 30]); LINE(g, c1, 3, [36, 16, 44, 40, 40, 58]); LINE(g, c1, 2, [70, 28, 78, 48]);
        if (style === 'roots') { for (let i = 0; i < 9; i++) LINE(g, c2, 1, [8 + i * 11, 6 + i * 2, 9 + i * 11 + R(i) * 4, 22 + R(i + 3) * 30]); }
        else for (let i = 0; i < 22; i++) { const x = R(i) * 100, y = x * 0.28 + 2; F(g, c2, x, y - 3, 1, 3); F(g, c2, x + 1, y + 2, 3, 1); }
      } else if (style === 'moss') {
        LINE(g, '#2b2422', 4, [0, 2, 40, 8, 90, 6, 132, 12]);
        for (let i = 0; i < 26; i++) { const x = 2 + R(i) * 126, l = 10 + R(i + 5) * 46; for (let y = 6; y < l; y += 2) F(g, y % 6 ? '#4f7a5e' : '#3d5e4a', x + Math.sin(y * 0.3 + i) * 1.5, y, 1 + (y < l * 0.5 ? 1 : 0), 2); }
      } else if (style === 'pine') {
        LINE(g, '#2b2422', 4, [0, 6, 50, 14, 112, 30]);
        for (let s = 0; s < 104; s += 3) { const x = s, y = 6 + s * 0.22; LINE(g, '#2f4b47', 1, [x, y, x - 6, y + 9]); LINE(g, '#2f4b47', 1, [x, y, x + 4, y + 10]); F(g, s % 9 ? '#f7f4e9' : '#d6f1fb', x - 2, y - 2, 4, 1); }
      } else if (style === 'icicles') {
        F(g, '#1d2638', 0, 0, 132, 6);
        for (let i = 0; i < 16; i++) { const x = 2 + i * 8 + R(i) * 3, l = 8 + R(i + 1) * 26; POLY(g, R(i + 2) > 0.5 ? '#a5d6d8' : '#d6f1fb', [x, 4, x + 5, 4, x + 2, 4 + l]); }
      } else if (style === 'web') {
        LINE(g, '#2b2422', 3, [0, 10, 40, 22, 72, 50]);
        g.strokeStyle = '#c9c4d6'; g.lineWidth = 1;
        for (let a = 0; a < 6; a++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a * 0.3) * 58, Math.sin(a * 0.3) * 58); g.stroke(); }
        for (let r = 10; r < 56; r += 9) { g.beginPath(); for (let a = 0; a < 6; a++) { const x = Math.cos(a * 0.3) * r, y = Math.sin(a * 0.3) * r; if (!a) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
      } else if (style === 'bunting') {
        g.strokeStyle = '#4a3a31'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 6); g.quadraticCurveTo(60, 34, 132, 10); g.stroke();
        const cols = ['#c95d6a', '#eac979', '#5f9ca3', '#c6aedb', '#87ad7b'];
        for (let i = 0; i < 11; i++) { const t = (i + 0.5) / 11, x = t * 132, y = (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * 34 + t * t * 10; POLY(g, cols[i % 5], [x - 4, y, x + 4, y, x, y + 8]); }
      }
    }, style === 'web' || style === 'bunting' ? false : '#1f2c2a');
  }

  // ================================================================== tile families (procedural fallbacks)
  const FAM = {
    grass_grove: ['#a6c593', '#9fbf8d', '#a0c090', '#aac696', '#82a977'], grass_wild: ['#87ad7b', '#7fa574', '#8db27f', '#80a676', '#5f8a5c'],
    forest_moss: ['#4b7052', '#466b4e', '#517656', '#486c4f', '#355640'], path_dirt: ['#c8aa86', '#c2a47f', '#cdb08c', '#bfa07c', '#a88c6a'],
    cobble: ['#e2dcc2', '#d5d6bd', '#dcd6bc', '#d1cdb2', '#b8b49c'], crypt_flag: ['#8a8f8a', '#7f847f', '#868a85', '#7a7e7a', '#5d625f'],
    snow: ['#f7f4e9', '#f1efe6', '#f4f2ea', '#ece9e0', '#c9d4e6'], ice: ['#a5d6d8', '#9ccfd2', '#aedbdc', '#97c8cc', '#6aa9b3'],
    swamp_mud: ['#5a5636', '#55512f', '#5f5a39', '#504c2e', '#433f27'], swamp_bog: ['#36636f', '#335d68', '#3a6874', '#305864', '#24474f'],
    water: ['#5f9ca3', '#5a979e', '#64a1a8', '#56939a', '#a5d6d8'], soil_dry: ['#b89d72', '#b39770', '#bca277', '#ad926b', '#8f7a5a'], soil_wet: ['#6e5642', '#69523f', '#735a45', '#644e3c', '#4a3a31'],
  };
  const RANK = { water: 0, swamp_bog: 1, path_dirt: 2, cobble: 2, crypt_flag: 2, soil_dry: 2, soil_wet: 2, swamp_mud: 2, ice: 2.5, grass_grove: 3, forest_moss: 3, snow: 3, grass_wild: 3.5 };
  const EDGE = { grass_grove: 'grass', grass_wild: 'wild', forest_moss: 'moss', snow: 'snow' };
  const NATURAL = ['grass_grove', 'grass_wild', 'forest_moss', 'snow', 'swamp_mud', 'ice'];
  // neighbour offset -> edge suffix (the side of THIS tile that touches the neighbour)
  const SIDES = [[0, -1, 'ne'], [-1, 0, 'nw'], [1, 0, 'se'], [0, 1, 'sw']];

  // ================================================================== state
  const S = {
    key: '', cfg: null, dungeon: false, region: 'grove', L: 0, mwSet: null, campL: null, campMW: null, campR: -1,
    tiles: null, items: [], draws: [], inter: [], npcs: [], lights: [], smokeSrc: [], obs: [], waterTiles: [], waterDecals: [], groundFx: [],
    terrain: null, tg: null, prev: null, fadeT: 0, back: null, backKey: '', t0: nowS(), t: 0, fdt: 0.016, tLast: nowS(),
    parts: [], puffs: [], fog: [], prompt: null, handlers: new Map(), perf: { n: 0, ground: 0, items: 0, post: 0, emit: 0, build: 0 }, stuck: 0,
    trans: null, sentinel: null, lastPromptKey: '',
  };
  const OX = 380, OY = 44, TCW = 760, TCH = 450; // terrain cache: world (0,0) projects to (OX,OY)
  const tileAt = (x, y) => { if (!S.tiles) return null; x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= MAPN || y >= MAPN ? null : S.tiles[x + y * MAPN]; };

  function levels() {
    const L = clampN(S.L | 0, 0, 4);
    const mw = S.mwSet != null ? clampN(S.mwSet | 0, 0, 3) : [0, 1, 2, 3, 3][L];
    return { L, mw };
  }
  function restoredOf(id) { try { return !!MM.campaign?.state?.restored?.[id]; } catch (e) { return false; } }
  function syncCampaign() {
    let st = null; try { st = MM.campaign?.state; } catch (e) { st = null; }
    if (!st) return;
    const hl = st.homestead?.level; if (Number.isFinite(hl) && hl !== S.campL) { S.campL = hl; S.L = clampN(hl | 0, 0, 4); }
    const ml = st.moonwell?.level; if (Number.isFinite(ml) && ml !== S.campMW) { S.campMW = ml; S.mwSet = clampN(ml | 0, 0, 3); }
  }

  // ================================================================== layout builder
  function regionCfg(region, mode) {
    if (mode && mode !== 'outside') {
      const d = DV(), rc = RV()[region];
      return d[mode === 'rift' ? 'rift' : (rc?.dungeon || 'crypt')] || d.crypt || null;
    }
    return RV()[region] || RV().grove || null;
  }
  function buildLayout(region, mode, opt) {
    opt = opt || {};
    const cfg = regionCfg(region, mode); if (!cfg) return null;
    const lv = levels(), dungeon = mode !== 'outside';
    const floor = opt.floor ?? world.floor, blocks = opt.blocks ?? (dungeon ? dungeonBlocks : []); // eslint-disable-line no-undef
    const c = { L: lv.L, mw: lv.mw, restored: restoredOf, h: hsh, noise: noise2, dist: polyDist, near, floor, blocks, region, mode };
    const tiles = new Array(MAPN * MAPN);
    for (let y = 0; y < MAPN; y++) for (let x = 0; x < MAPN; x++) { let f = 'grass_grove'; try { f = cfg.terrain ? cfg.terrain(x, y, c) : f; } catch (e) { console.error('[MM.world] terrain', e); } tiles[x + y * MAPN] = f || 'grass_grove'; }
    const L = { cfg, region, mode, tiles, items: [], inter: [], npcs: [], decals: [], reserves: [], scat: [], groundFx: [] };
    const B = {
      p(s, x, y, o) { const it = Object.assign({ s, x, y }, o || {}); it.ph = hsh(Math.round(x * 97), Math.round(y * 89), 5) * TAU; L.items.push(it); return it; },
      i(id, x, y, o) { o = o || {}; L.inter.push({ id, x, y, r: o.r || 1.2, prompt: o.prompt || id, kind: o.kind || id, region, action: o.action }); },
      npc(id, x, y, o) { o = o || {}; const nm = o.name || NPC_INFO[id]?.name || id; const it = B.p('@npc', x, y, { k: 'npc', npc: id, name: nm, r: 0.25 }); L.npcs.push(it); B.i(id, x, y, { prompt: 'Talk to ' + nm, r: 1.4, kind: 'npc' }); return it; },
      decal(s, x, y, o) { L.decals.push(Object.assign({ s, x, y }, o || {})); },
      garland(x1, y1, z1, x2, y2, z2, o) { return B.p('@garland', (x1 + x2) / 2, (y1 + y2) / 2, { k: 'garland', a: [x1, y1, z1], b: [x2, y2, z2], kind: (o || {}).kind || 'bunting' }); },
      reserve(x, y, r) { L.reserves.push([x, y, r]); },
      scatter(spec) { L.scat.push(spec); },
      fx(kind, x, y, o) { L.groundFx.push(Object.assign({ kind, x, y }, o || {})); },
    };
    try { if (dungeon) buildDungeon(B, c, cfg); else if (cfg.build) cfg.build(B, c); } catch (e) { console.error('[MM.world] build', region, e); }
    // scatter (deterministic)
    const seedBase = (region.length * 131 + (dungeon ? 977 + (world.dungeonSeed || 1) % 997 + floor * 31 : 0)) | 0;
    L.scat.forEach((sp, si) => scatter(L, sp, si, seedBase, lv.L));
    // derive per-item data
    for (const it of L.items) prepItem(it);
    return L;
  }
  function inZone(zone, x, y, L) {
    const back = x < 2.6 || y < 2.6, front = x > 17.4 || y > 17.4;
    if (zone === 'back') return back && !front; if (zone === 'front') return front; if (zone === 'rim') return back || front;
    if (zone === 'inner') return !back && !front;
    if (zone === 'shore') { const t = L.tiles[Math.floor(x) + Math.floor(y) * MAPN]; if (t === 'water') return false; return SIDES.some(([dx, dy]) => { const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy; return xx >= 0 && yy >= 0 && xx < MAPN && yy < MAPN && L.tiles[xx + yy * MAPN] === 'water'; }); }
    return true;
  }
  function insideFoot(it, x, y, pad) { const r = itemRect(it); return r && x > r[0] - pad && x < r[2] + pad && y > r[1] - pad && y < r[3] + pad; }
  function scatter(L, sp, si, seedBase, lvl) {
    const n = Array.isArray(sp.n) ? (sp.n[lvl] || 0) : (sp.n || 0); if (!n || !sp.s || !sp.s.length) return;
    if (sp.minL != null && lvl < sp.minL) return; if (sp.maxL != null && lvl > sp.maxL) return;
    const on = sp.on || (sp.water ? ['water'] : NATURAL), zone = sp.zone || 'any', avoid = sp.avoid || 0.9;
    let placed = 0;
    for (let a = 0; a < n * 40 && placed < n; a++) {
      const x = 0.35 + hsh(a, si, seedBase + 11) * 19.3, y = 0.35 + hsh(si, a, seedBase + 23) * 19.3;
      if (!inZone(zone, x, y, L)) continue;
      if (!on.includes(L.tiles[Math.floor(x) + Math.floor(y) * MAPN])) continue;
      if (L.reserves.some(([rx, ry, rr]) => Math.hypot(x - rx, y - ry) < rr + 0.2)) continue;
      if (L.inter.some((i) => Math.hypot(x - i.x, y - i.y) < (sp.decal ? 0.6 : 1.0))) continue;
      let bad = false;
      for (const it of L.items) { if (insideFoot(it, x, y, 0.6)) { bad = true; break; } const d = Math.hypot(x - it.x, y - it.y); if (d < (it._sc === si ? avoid : Math.max(0.55, avoid * 0.55))) { bad = true; break; } }
      if (!bad && sp.decal) for (const d of L.decals) if (Math.hypot(x - d.x, y - d.y) < avoid * 0.8) { bad = true; break; }
      if (bad) continue;
      const s = sp.s[Math.floor(hsh(a, si, seedBase + 41) * sp.s.length)];
      const flip = hsh(si, a, seedBase + 53) < 0.5;
      if (sp.decal) L.decals.push({ s, x, y, flip, water: !!sp.water, glow: sp.glow });
      else { const it = Object.assign({ s, x, y, flip, _sc: si }, { k: sp.k, r: sp.r, low: sp.low, tall: sp.tall, sway: sp.sway, glow: sp.glow }); it.ph = hsh(a, si, 9) * TAU; L.items.push(it); }
      placed++;
    }
  }
  function buildDungeon(B, c, cfg) {
    const blocks = c.blocks || [];
    const odd = (c.floor || 1) % 2 === 1;
    const exitP = odd ? [10, 1.6] : [10, 17.9], stairP = odd ? [10, 17.9] : [10, 1.6];
    B.fx('exit', exitP[0], exitP[1]); B.i('exit', exitP[0], exitP[1], { prompt: 'Climb back to the surface', r: 1.1, kind: 'exit' });
    B.fx('stairs', stairP[0], stairP[1]); B.i('stairs', stairP[0], stairP[1], { prompt: 'Descend deeper', r: 1.1, kind: 'stairs' });
    B.reserve(exitP[0], exitP[1], 1.4); B.reserve(stairP[0], stairP[1], 1.4); B.reserve(9.7, 10, 1.5);
    for (const b of blocks) B.reserve(b.x, b.y, 0.9);
    const d = cfg.decor; if (d) B.scatter({ s: d.s, n: d.n, zone: 'any', avoid: 1.3, k: 'decor', low: true, glow: d.glow, on: Object.keys(FAM) });
    B.scatter({ s: cfg.walls.filter((w) => !w.startsWith('@')), n: 10, zone: 'rim', avoid: 1.6, k: 'decor', low: true, on: Object.keys(FAM) });
  }

  // ---------------------------------------------------------------- per-item derived data (size, collision, lights)
  const KIND_R = { tree: 0.3, pine: 0.28, moonwell: 0.85, well: 0.55 };
  const FALLBACK_SIZE = { tree: [42, 56], pine: [36, 58], house: [90, 100], moonwell: [54, 50], npc: [28, 42], entrance: [64, 54], bush: [24, 17], stall: [46, 48], well: [32, 44], lamp: [11, 34], scarecrow: [26, 40] };
  function spriteSize(it) {
    if (it.k === 'npc') return [28, 42, 14, 40];
    if (it.k === 'garland') return [0, 0, 0, 0];
    if (it.s && it.s[0] === '@') { const d = PROC[it.s.slice(1)]; if (d) return [d[0] + 2, d[1] + 2, d[2] + 1, d[3] + 1]; }
    const f = artGet(it.s); if (f) return [f.w, f.h, f.ax, f.ay];
    const fs = FALLBACK_SIZE[it.k] || [20, 22]; return [fs[0], fs[1], fs[0] / 2, fs[1] - 1];
  }
  function itemRect(it) {
    if (it.rect) return it.rect;
    if (it.foot) return [it.x - it.foot[0] + 0.15, it.y - it.foot[1] + 0.15, it.x - 0.1, it.y - 0.1];
    return null;
  }
  function prepItem(it) {
    const sz = spriteSize(it); it.w = sz[0]; it.h = sz[1]; it.ax = sz[2]; it.ay = sz[3];
    if (it.r == null && KIND_R[it.k] != null) it.r = KIND_R[it.k];
    it.depth = project(it.x, it.y).y + (it.dz || 0);
    it.fade = 1;
    if (it.k === 'garland') { const pa = project(it.a[0], it.a[1]).y, pb = project(it.b[0], it.b[1]).y; it.depth = (pa + pb) / 2; }
  }

  // ================================================================== apply a layout to the live game
  const BASE_PROPS = props.slice(); // eslint-disable-line no-undef
  let useHooks = false;
  function applyLayout(L) {
    S.cfg = L.cfg; S.region = L.region; S.dungeon = L.mode !== 'outside'; S.tiles = L.tiles;
    S.items = L.items; S.inter = L.inter; S.npcs = L.npcs; S.groundFx = L.groundFx;
    S.decals = L.decals.filter((d) => !d.water); S.waterDecals = L.decals.filter((d) => d.water);
    S.waterTiles = []; S.bogTiles = [];
    for (let y = 0; y < MAPN; y++) for (let x = 0; x < MAPN; x++) { const f = L.tiles[x + y * MAPN]; if (f === 'water') S.waterTiles.push([x, y, hsh(x, y, 3)]); else if (f === 'swamp_bog') S.bogTiles.push([x, y, hsh(x, y, 4)]); }
    // obstacles
    S.obs = [];
    for (const it of S.items) {
      const rc = itemRect(it);
      if (rc) S.obs.push({ rect: rc, low: !!it.low, it });
      else if (it.r) S.obs.push({ x: it.x, y: it.y, r: it.r, low: !!it.low, it });
    }
    // interactable heights (marker placement) from the nearest item
    for (const i of S.inter) { let best = null, bd = 0.6; for (const it of S.items) { const d = Math.hypot(it.x - i.x, it.y - i.y); if (d < bd) { bd = d; best = it; } } i.item = best; i.hy = best ? Math.min(60, best.ay || 24) + 6 : 26; }
    for (const g of S.groundFx) { const i = S.inter.find((n) => n.kind === g.kind); if (i) i.hy = 18; }
    // lights
    S.lights = [];
    const addL = (it, l, x, y, z) => S.lights.push({ id: (it.s || it.k) + '@' + x.toFixed(1) + ',' + y.toFixed(1), kind: l.kind || it.k || 'light', x, y, z: z || 0, r: l.r || 24, color: l.color || '#ffd98a', flicker: l.flicker ?? 0.2, night: !!l.night, base: l.r || 24, intensity: 1, on: true, ph: hsh(Math.round(x * 31), Math.round(y * 37), 2) * TAU });
    for (const it of S.items) {
      if (it.lights) for (const l of it.lights) addL(it, l, it.x + (l.dx || 0) / 32, it.y - (l.dx || 0) / 32, -(l.dy || 0));
      if (it.glow) addL(it, { r: 16, color: it.glow, flicker: 0.1, kind: 'glow' }, it.x, it.y, 6);
      if (it.k === 'garland' && it.kind === 'lanterns') for (let k = 1; k < 4; k++) { const t = k / 4; addL(it, { r: 16, color: '#ffd27a', flicker: 0.3, night: true, kind: 'lantern' }, it.a[0] + (it.b[0] - it.a[0]) * t, it.a[1] + (it.b[1] - it.a[1]) * t, it.a[2] + (it.b[2] - it.a[2]) * t - 8 * Math.sin(Math.PI * t)); }
      if (it.k === 'npc' && NPC_INFO[it.npc]?.lantern) addL(it, { r: 22, color: '#ffe0a0', flicker: 0.25, night: true, kind: 'lantern' }, it.x + 10 / 32, it.y - 10 / 32, 28);
      if (it.k === 'entrance') it.mouth = PROC_MOUTH[it.s.slice(1)] || [0, -12];
    }
    for (const d of L.decals) if (d.glow) addL(d, { r: 14, color: d.glow, flicker: 0.1, kind: 'glow' }, d.x, d.y, 3);
    for (const g of S.groundFx) addL(g, { r: g.kind === 'exit' ? 30 : 22, color: g.kind === 'exit' ? '#bfe9ff' : '#b48cff', flicker: 0.2, kind: g.kind }, g.x, g.y, 4);
    // smoke emitters
    S.smokeSrc = [];
    for (const it of S.items) if (it.smoke) for (const s of it.smoke) S.smokeSrc.push({ it, dx: s[0], dy: s[1], next: hsh(Math.round(it.x * 10), 3, 3) });
    // fog patches
    const fogN = L.cfg.fog ? L.cfg.fog.count : 0;
    S.fog = []; for (let i = 0; i < fogN; i++) S.fog.push({ x: hsh(i, 1, 7) * 20, y: hsh(i, 2, 7) * 20, s: 0.6 + hsh(i, 3, 7) * 0.8, v: 0.04 + hsh(i, 4, 7) * 0.05 });
    // drawables (pre-created; depth fixed)
    S.draws = S.items.map((it) => ({ type: 'custom', x: it.x, y: it.y, depth: it.depth, it, draw: drawCustom }));
    // baseline props: remove the original 16 (other modules' entries stay); fallback path reuses the array
    for (let i = props.length - 1; i >= 0; i--) if (BASE_PROPS.includes(props[i]) || props[i]._mm) props.splice(i, 1); // eslint-disable-line no-undef
    if (!useHooks) {
      for (const it of S.items) props.push({ x: it.x, y: it.y, type: 'rock', _mm: it }); // eslint-disable-line no-undef
      props.push({ x: 60, y: 60, type: 'rock', _mm: 'post' }); // eslint-disable-line no-undef
    }
    S.shadowCache = new Map(); S.terrainDirty = true; S.back = null;
    try { MM.bus?.emit?.('world:layout', { region: L.region, mode: L.mode, level: levels().L }); } catch (e) { /* bus optional */ }
  }
  function stateKey() {
    const lv = levels();
    const rb = (restoredOf('forest') ? 1 : 0) + (restoredOf('swamp') ? 2 : 0) + (restoredOf('mountain') ? 4 : 0);
    return world.region + '|' + world.mode + '|' + (world.mode === 'outside' ? 0 : world.floor + '|' + (world.dungeonSeed || 0) + '|' + dungeonBlocks.length) + '|' + lv.L + '|' + lv.mw + '|' + rb + '|' + (artReady() ? 1 : 0); // eslint-disable-line no-undef
  }
  function ensure() {
    syncCampaign();
    const k = stateKey(); if (k === S.key) return;
    const t0 = nowS();
    const sameRegion = S.key && S.key.split('|').slice(0, 2).join('|') === k.split('|').slice(0, 2).join('|') && world.mode === 'outside';
    if (sameRegion && S.terrain) { // restoration change: cross-fade the old terrain out
      if (!S.prev) S.prev = mk(TCW, TCH);
      S.prev[1].clearRect(0, 0, TCW, TCH); S.prev[1].drawImage(S.terrain, 0, 0); S.fadeT = 1;
    } else S.fadeT = 0;
    S.key = k;
    const L = buildLayout(world.region, world.mode);
    if (L) applyLayout(L);
    S.perf.build = (nowS() - t0) * 1000;
  }
  function markDirty() { S.key = ''; }

  // ================================================================== soft contact shadows
  function shadowRGB() { return (S.cfg && S.cfg.shadow) || [36, 56, 42]; }
  function shadowSprite(rx, ry) {
    rx = Math.max(2, Math.round(rx)); ry = Math.max(1, Math.round(ry));
    const key = rx * 1000 + ry; const cache = S.shadowCache || (S.shadowCache = new Map());
    let c = cache.get(key); if (c) return c;
    const [cv, g] = mk(rx * 2 + 1, ry * 2 + 1), im = g.createImageData(cv.width, cv.height), d = im.data, rgb = shadowRGB();
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const dx = (x - rx) / (rx + 0.5), dy = (y - ry) / (ry + 0.5), q = dx * dx + dy * dy;
      const a = q < 0.3 ? 1 : q < 0.62 ? 0.72 : q < 1 ? 0.4 : 0; const i = (y * cv.width + x) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = Math.round(a * 255);
    }
    g.putImageData(im, 0, 0); cache.set(key, cv); return cv;
  }
  function softShadow(g, x, y, rx, ry, a) {
    if (!(a > 0)) return; const sp = shadowSprite(rx, ry);
    const a0 = g.globalAlpha; g.globalAlpha = a0 * Math.min(0.85, a * 1.35);
    g.drawImage(sp, Math.round(x - (sp.width - 1) / 2), Math.round(y - (sp.height - 1) / 2)); g.globalAlpha = a0;
  }
  const SHADOW_RE = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/;
  const _ellipse = window.ellipse;
  if (typeof _ellipse === 'function') {
    window.ellipse = function (x, y, rx, ry, color) {
      if (W.enabled && W.options.softShadows && typeof color === 'string') {
        const m = SHADOW_RE.exec(color);
        if (m && +m[1] < 80 && +m[2] < 100 && +m[3] < 100 && +m[4] <= 0.4) { softShadow(ctx, x, y, rx * 1.05, ry * 1.2 + 0.5, +m[4]); return; } // eslint-disable-line no-undef
      }
      return _ellipse(x, y, rx, ry, color);
    };
  }

  // ================================================================== terrain cache
  function tileCenter(x, y) { return [OX + (x - y) * 16, OY + (x + y + 1) * 8]; }
  function famDraw(g, fam, seed, cx, cy) {
    if (hasArt(fam + '_0') || hasArt(fam)) { if (MM.art.drawTile(g, fam, seed, cx, cy)) return; }
    const p = FAM[fam] || FAM.grass_grove, r = hsh(seed, 7, 1);
    diamondFill(g, cx, cy, p[Math.floor(r * 4)]);
    g.fillStyle = p[4];
    if (r > 0.3) { g.fillRect(cx - 5, cy + 1, 1, 2); g.fillRect(cx - 3, cy, 1, 2); }
    if (r < 0.2) g.fillRect(cx + 3, cy - 2, 3, 1);
    if (fam === 'cobble' || fam === 'crypt_flag') { g.fillRect(cx - 8, cy, 16, 1); g.fillRect(cx, cy - 4, 1, 8); }
  }
  function diamondFill(g, cx, cy, col) { g.fillStyle = col; for (let i = 0; i < 8; i++) { const w = 4 + i * 4; g.fillRect(cx - w / 2, cy - 8 + i, w, 1); g.fillRect(cx - w / 2, cy + 7 - i, w, 1); } }
  function edgeDraw(g, fam, side, cx, cy) {
    const e = EDGE[fam], n = e && 'edge_' + e + '_' + side;
    if (n && hasArt(n)) { MM.art.draw(g, n, cx, cy); return; }
    const col = (FAM[fam] || FAM.grass_grove)[0]; g.fillStyle = col;
    for (let i = 0; i < 15; i += 1) { // a 1-2px lip along that diamond edge
      const t = i / 15; let x, y;
      if (side === 'ne') { x = cx + t * 16; y = cy - 8 + t * 8; } else if (side === 'nw') { x = cx - t * 16; y = cy - 8 + t * 8; }
      else if (side === 'se') { x = cx + 16 - t * 16; y = cy + t * 8; } else { x = cx - 16 + t * 16; y = cy + t * 8; }
      g.fillRect(Math.round(x), Math.round(y), 2, (i % 3) ? 1 : 2);
    }
  }
  function shoreDraw(g, side, cx, cy) { const n = 'edge_shore_' + side; if (hasArt(n)) { MM.art.draw(g, n, cx, cy); return; } edgeDraw(g, 'cobble', side, cx, cy); }
  function buildTerrain() {
    const t0 = nowS();
    if (!S.terrain) { const [c, g] = mk(TCW, TCH); S.terrain = c; S.tg = g; }
    const g = S.tg, cfg = S.cfg || {}; g.clearRect(0, 0, TCW, TCH);
    // 1. island skirt: earth band below the two front edges, with drips (roots / icicles / moss / crystals)
    const sk = cfg.skirt || { a: '#5c4634', b: '#3f3029' }, depth = 30;
    const L0 = [OX - 320, OY + 160], Bt = [OX, OY + 320], R0 = [OX + 320, OY + 160];
    for (let k = 0; k < depth; k += 2) {
      const col = k < 6 ? sk.a : k < 14 ? (k % 4 ? sk.a : sk.b) : sk.b;
      g.fillStyle = col; g.beginPath(); g.moveTo(L0[0], L0[1] + k); g.lineTo(Bt[0], Bt[1] + k); g.lineTo(R0[0], R0[1] + k); g.lineTo(R0[0], R0[1] + k + 2); g.lineTo(Bt[0], Bt[1] + k + 2); g.lineTo(L0[0], L0[1] + k + 2); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(Bt[0], Bt[1]); g.lineTo(R0[0], R0[1]); g.lineTo(R0[0], R0[1] + depth); g.lineTo(Bt[0], Bt[1] + depth); g.closePath(); g.fill();
    for (let i = 0; i < 90; i++) { // strata specks + drips
      const t = hsh(i, 1, 61), left = i % 2 === 0, x = left ? L0[0] + t * 320 : Bt[0] + t * 320, y0 = (left ? L0[1] + t * 160 : Bt[1] - t * 160);
      g.fillStyle = sk.b; g.fillRect(Math.round(x), Math.round(y0 + 6 + hsh(i, 2, 61) * 18), 3, 1);
      if (i % 3 === 0) { const l = 3 + hsh(i, 3, 61) * 9, dc = sk.dripColor || sk.b; g.fillStyle = dc;
        if (sk.drip === 'icicles' || sk.drip === 'crystals') { for (let k = 0; k < l; k++) g.fillRect(Math.round(x) + (k > l * 0.6 ? 1 : 0), Math.round(y0 + depth + k), Math.max(1, 3 - Math.floor(k / 3)), 1); }
        else for (let k = 0; k < l; k++) g.fillRect(Math.round(x + Math.sin(k * 0.8 + i) * 1), Math.round(y0 + depth - 2 + k), 1, 1); }
    }
    // 2. side tiles under the front edge tiles
    const side = cfg.side || 'side_earth';
    if (hasArt(side)) for (let i = 0; i < MAPN; i++) { const a = tileCenter(i, MAPN - 1), b = tileCenter(MAPN - 1, i); MM.art.draw(g, side, a[0], a[1]); if (i !== MAPN - 1) MM.art.draw(g, side, b[0], b[1]); }
    // 3. ground tiles + 4. edge lips
    const T = S.tiles;
    for (let s = 0; s < MAPN * 2 - 1; s++) for (let x = 0; x < MAPN; x++) { const y = s - x; if (y < 0 || y >= MAPN) continue; const [cx, cy] = tileCenter(x, y); famDraw(g, T[x + y * MAPN], x * 131 + y * 17 + 3, cx, cy); }
    for (let y = 0; y < MAPN; y++) for (let x = 0; x < MAPN; x++) {
      const f = T[x + y * MAPN], rf = RANK[f] ?? 3, [cx, cy] = tileCenter(x, y);
      for (const [dx, dy, sd] of SIDES) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= MAPN || yy >= MAPN) continue;
        const nf = T[xx + yy * MAPN]; if (nf === f) continue;
        if (f === 'water') continue; // shore lips drawn in the water pass
        if ((RANK[nf] ?? 3) > rf && EDGE[nf]) edgeDraw(g, nf, sd, cx, cy);
      }
    }
    // 5. flat decals (soil beds, flowers, mounds...) in depth order
    const decs = S.decals.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const d of decs) { const px = OX + (d.x - d.y) * 16, py = OY + (d.x + d.y) * 8; if (d.tile) famDraw(g, d.s, Math.round(d.x * 7 + d.y * 13), px, py); else if (!blitArt(g, d.s, px, py, 0, d.flip)) fallbackFlat(g, d.s, px, py); }
    // 6. baked static shadows (buildings: offset footprint; trees/rocks: soft ellipse)
    for (const it of S.items) {
      const px = OX + (it.x - it.y) * 16, py = OY + (it.x + it.y) * 8;
      if (it.foot) {
        const a = [it.x, it.y], l = [it.x - it.foot[0], it.y], b = [it.x - it.foot[0], it.y - it.foot[1]], r = [it.x, it.y - it.foot[1]];
        g.fillStyle = rgba(shadowRGB(), 0.28); g.beginPath();
        [a, l, b, r].forEach((p, i) => { const X = OX + (p[0] - p[1]) * 16 + 7, Y = OY + (p[0] + p[1]) * 8 + 3; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.closePath(); g.fill();
      } else if (it.k !== 'garland' && it.k !== 'npc' && it.k !== 'fence' && it.w > 9) {
        const rx = Math.max(4, Math.min(20, it.w * (it.k === 'tree' || it.k === 'pine' ? 0.4 : 0.42)));
        softShadowTo(g, px + (it.tall ? 3 : 1), py, rx, Math.max(2, rx * 0.36), it.k === 'tree' || it.k === 'pine' ? 0.3 : 0.22);
      }
    }
    // 7. region tint (and neglect tint at low restoration)
    const tints = [cfg.tint, cfg.tintByLevel && !S.dungeon ? cfg.tintByLevel[levels().L] : null].filter(Boolean);
    if (tints.length) { g.globalCompositeOperation = 'source-atop'; for (const t of tints) { g.fillStyle = t; g.fillRect(0, 0, TCW, TCH); } g.globalCompositeOperation = 'source-over'; }
    S.terrainDirty = false; S.perf.terrain = (nowS() - t0) * 1000;
  }
  function softShadowTo(g, x, y, rx, ry, a) { const sp = shadowSprite(rx, ry); const a0 = g.globalAlpha; g.globalAlpha = a; g.drawImage(sp, Math.round(x - rx), Math.round(y - ry)); g.globalAlpha = a0; }
  function fallbackFlat(g, s, x, y) {
    if (/flowers/.test(s)) { const c = /moon/.test(s) ? '#c6aedb' : '#f1e6bb'; for (let i = 0; i < 4; i++) { F(g, '#729a69', x - 4 + i * 3, y - 3, 1, 3); F(g, c, x - 5 + i * 3, y - 4 - (i % 2), 3, 2); } }
    else if (/mound/.test(s)) { E(g, /snow/.test(s) ? '#f1efe6' : '#6e5642', x, y - 2, 10, 4); }
    else if (/lily/.test(s)) { E(g, '#4b7052', x, y, 6, 3); F(g, '#87ad7b', x - 3, y - 1, 3, 1); }
    else if (/mushroom/.test(s)) { F(g, '#e2dcc2', x - 1, y - 4, 2, 4); F(g, '#c95d6a', x - 3, y - 6, 6, 2); }
  }

  // ================================================================== backdrop (screen space, gentle parallax)
  function buildBackdrop() {
    const cfg = S.cfg || {}, bd = cfg.backdrop || { top: '#b9d3a6', bottom: '#6e9372', motif: 'canopy', far: '#86a983', near: '#5f8566', haze: '#e3edd0' };
    const [c, g] = mk(640, 400), top = hexRgb(bd.top), bot = hexRgb(bd.bottom);
    for (let i = 0; i < 25; i++) { const t = i / 24; g.fillStyle = 'rgb(' + top.map((v, k) => Math.round(v + (bot[k] - v) * t)).join(',') + ')'; g.fillRect(0, i * 16, 640, 16); }
    const m = bd.motif, R = (i, n) => hsh(i, n, 77);
    if (m === 'stars' || m === 'icicles' || m === 'roots') for (let i = 0; i < 90; i++) F(g, R(i, 1) > 0.85 ? '#fff3c4' : '#d8d0ee', R(i, 2) * 640, R(i, 3) * 260, 1, 1);
    if (m === 'stars') { E(g, '#ebe1f7', 520, 60, 14, 14); E(g, bd.top, 526, 55, 13, 13); }
    if (m === 'canopy' || m === 'roofs' || m === 'deadtrees') {
      for (let row = 0; row < 2; row++) { const col = row ? bd.near : bd.far, y0 = 250 + row * 70;
        for (let x = -20; x < 660; x += 18 + R(x, row) * 16) {
          if (m === 'deadtrees') { const h = 50 + R(x, 5) * 70; LINE(g, col, 3, [x, y0 + 40, x + 2, y0 - h * 0.5, x - 8, y0 - h]); LINE(g, col, 2, [x + 1, y0 - h * 0.4, x + 14, y0 - h * 0.7]); }
          else if (m === 'roofs' && row === 0 && R(x, 7) > 0.55) { const w = 26 + R(x, 8) * 20; F(g, col, x, y0 - 10, w, 30); POLY(g, col, [x - 4, y0 - 10, x + w / 2, y0 - 26 - R(x, 9) * 8, x + w + 4, y0 - 10]); }
          else E(g, col, x, y0 + 10, 16 + R(x, 3) * 14, 14 + R(x, 4) * 16);
        }
        F(g, col, 0, y0 + 14, 640, 400);
      }
    } else if (m === 'peaks') {
      for (let row = 0; row < 2; row++) { const col = row ? bd.near : bd.far, y0 = 230 + row * 60;
        for (let x = -60; x < 700; x += 80 + R(x, row) * 60) { const h = 70 + R(x, row + 3) * 80, w = 70 + R(x, 9) * 50; POLY(g, col, [x - w, y0 + 60, x, y0 - h, x + w, y0 + 60]); POLY(g, '#f4f9fb', [x - w * 0.22, y0 - h * 0.62, x, y0 - h, x + w * 0.22, y0 - h * 0.62, x + 4, y0 - h * 0.55, x - 6, y0 - h * 0.58]); }
        F(g, col, 0, y0 + 58, 640, 400); }
    } else if (m === 'mistwater') {
      F(g, bd.near, 0, 250, 640, 150);
      for (let i = 0; i < 40; i++) F(g, bd.far, R(i, 1) * 640, 255 + R(i, 2) * 140, 10 + R(i, 3) * 30, 1);
      for (let x = 0; x < 640; x += 30 + R(x, 1) * 40) { const h = 30 + R(x, 2) * 50; LINE(g, bd.far, 2, [x, 250, x + 1, 250 - h]); E(g, bd.far, x, 250 - h, 12, 18); }
    }
    if (m === 'roots' || m === 'icicles') for (let i = 0; i < 40; i++) { const x = R(i, 5) * 640, l = 20 + R(i, 6) * 80; if (m === 'roots') LINE(g, bd.far, 2, [x, 0, x + 6, l * 0.5, x - 2, l]); else POLY(g, bd.far, [x - 4, 0, x + 4, 0, x, l]); }
    // haze bands
    g.globalAlpha = 0.18; for (let i = 0; i < 4; i++) F(g, bd.haze, 0, 200 + i * 14, 640, 6 + i * 2); g.globalAlpha = 1;
    S.back = c;
  }

  // ================================================================== per-frame: ground layer (preDraw) + water/fog (postGround)
  function camOrigin() { return [Math.round(256 - game.camX), Math.round(160 - game.camY)]; } // eslint-disable-line no-undef
  function frameClock() { const t = nowS(); S.fdt = clampN(t - S.tLast, 0, 0.1); S.tLast = t; S.t = t - S.t0; }
  function preDrawPass(g) {
    if (!W.enabled) return;
    const t0 = nowS(); frameClock(); ensure();
    if (!S.back) buildBackdrop();
    const rm = reducedMotion();
    const bx = rm ? -64 : Math.round(-64 - clampN(game.camX * 0.08, -60, 60)), by = rm ? -40 : Math.round(-40 - clampN((game.camY - 160) * 0.08, -38, 38)); // eslint-disable-line no-undef
    g.drawImage(S.back, bx, by);
    if (S.terrainDirty) buildTerrain();
    const [ox, oy] = camOrigin();
    if (S.fadeT > 0 && S.prev) {
      g.drawImage(S.terrain, ox - OX, oy - OY);
      g.globalAlpha = S.fadeT; g.drawImage(S.prev[0], ox - OX, oy - OY); g.globalAlpha = 1;
      S.fadeT = Math.max(0, S.fadeT - S.fdt / 1.4);
    } else g.drawImage(S.terrain, ox - OX, oy - OY);
    S.perf.ground += (nowS() - t0) * 1000;
  }
  function postGroundPass(g) {
    if (!W.enabled || !S.tiles) return;
    const t0 = nowS(), [ox, oy] = camOrigin(), t = S.t;
    // animated water + shore lips + floating decals
    const anim = hasArt('water_anim');
    for (const [x, y, r] of S.waterTiles) {
      const cx = ox + (x - y) * 16, cy = oy + (x + y + 1) * 8; if (cx < -20 || cx > 532 || cy < -12 || cy > 332) continue;
      if (anim) MM.art.draw(g, 'water_anim', cx, cy, { frame: Math.floor(t * 2.2 + r * 4) }); else { diamondFill(g, cx, cy, FAM.water[Math.floor(r * 4)]); F(g, '#a5d6d8', cx - 6 + Math.round(Math.sin(t * 1.5 + r * 9) * 3), cy - 1, 5, 1); }
      for (const [dx, dy, sd] of SIDES) { const nf = tileAt(x + dx, y + dy); if (nf && nf !== 'water') shoreDraw(g, sd, cx, cy); }
    }
    for (const d of S.waterDecals) { const p = [ox + (d.x - d.y) * 16, oy + (d.x + d.y) * 8 + Math.round(Math.sin(t * 0.9 + d.x * 3) * 0.6)]; if (!blitArt(g, d.s, p[0], p[1], t, d.flip)) fallbackFlat(g, d.s, p[0], p[1]); }
    // bog shimmer: a few slow ripple glints
    for (let i = 0; i < S.bogTiles.length; i += 3) { const [x, y, r] = S.bogTiles[i], k = (t * 0.35 + r) % 1; if (k > 0.5) continue; const cx = ox + (x - y) * 16, cy = oy + (x + y + 1) * 8; if (cx < -20 || cx > 532 || cy < -12 || cy > 332) continue; g.globalAlpha = 0.5 * (1 - k * 2); g.strokeStyle = '#8fc4c0'; g.lineWidth = 1; g.beginPath(); g.ellipse(cx + (r - 0.5) * 10, cy, 2 + k * 14, 1 + k * 6, 0, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    // dungeon stairs / exit
    for (const f of S.groundFx) drawGroundFx(g, f, ox, oy, t);
    // ground fog patches
    const fc = S.cfg && S.cfg.fog; if (fc && S.fog.length) {
      const sp = fogSprite(fc.color), a = fc.alpha * (1 + 0.6 * darkness()) * (world.weather === 'Rain' ? 1.3 : 1);
      g.globalAlpha = Math.min(0.5, a);
      for (const f of S.fog) { const x = ((f.x + t * f.v) % 22) - 1, y = f.y; const px = ox + (x - y) * 16, py = oy + (x + y) * 8; if (px < -120 || px > 632 || py < -40 || py > 360) continue; g.drawImage(sp, Math.round(px - sp.width * f.s / 2), Math.round(py - sp.height * f.s / 2), Math.round(sp.width * f.s), Math.round(sp.height * f.s)); }
      g.globalAlpha = 1;
    }
    S.perf.ground += (nowS() - t0) * 1000;
  }
  const fogCache = {};
  function fogSprite(col) {
    if (fogCache[col]) return fogCache[col];
    const [c, g] = mk(120, 36), im = g.createImageData(120, 36), d = im.data, rgb = hexRgb(col);
    for (let y = 0; y < 36; y++) for (let x = 0; x < 120; x++) { const dx = (x - 60) / 60, dy = (y - 18) / 18, q = dx * dx + dy * dy; const v = q < 1 ? (1 - q) : 0; const th = ((x * 7 + y * 13) % 5) / 5; const a = v > th * 0.9 ? Math.min(1, v * 1.4) : v * 0.4; const i = (y * 120 + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = Math.round(a * 255); }
    g.putImageData(im, 0, 0); return (fogCache[col] = c);
  }
  function drawGroundFx(g, f, ox, oy, t) {
    const x = ox + (f.x - f.y) * 16, y = oy + (f.x + f.y) * 8;
    if (f.kind === 'stairs') {
      diamondFill(g, x, y, '#120f1c');
      for (let i = 0; i < 4; i++) { const w = 22 - i * 5; F(g, i % 2 ? '#3a3450' : '#4e5660', x - w / 2 + i * 2, y - 3 + i * 2, w, 1); }
      F(g, '#737d7e', x - 16, y, 2, 1); F(g, '#737d7e', x + 14, y, 2, 1);
    } else {
      const p = 0.5 + 0.5 * Math.sin(t * 2.4);
      g.strokeStyle = '#bfe9ff'; g.lineWidth = 1; g.globalAlpha = 0.5 + 0.4 * p;
      g.beginPath(); g.ellipse(x, y, 13, 6.5, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(x, y, 8 + p * 3, 4 + p * 1.5, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1; for (let i = 0; i < 4; i++) { const a = t * 0.8 + i * TAU / 4; F(g, '#e6f7ff', x + Math.cos(a) * 11, y + Math.sin(a) * 5.5, 1, 1); }
    }
  }

  // ================================================================== items (depth-sorted)
  function playerBox() { const p = worldToCanvas(game.x, game.y), h = Math.max(0, game.height || 0); return [p.x - 9, p.y - 42 - h, p.x + 9, p.y - 6 - h]; } // eslint-disable-line no-undef
  function covers(it, sx, sy) {
    if (!W.options.fade) return false;
    if (it.depth <= project(game.x, game.y).y) return false; // eslint-disable-line no-undef
    const bx = S._pbox || (S._pbox = playerBox());
    const l = sx - it.ax, tp = sy - it.ay, r = l + it.w, b = sy - 2;
    return bx[0] < r && bx[2] > l && bx[1] < b && bx[3] > tp + 4;
  }
  function swayPx(it) { if (!it.sway || reducedMotion()) return 0; const wind = world.weather === 'Wind' ? 1.6 : 1; return Math.round(Math.sin(S.t * 1.25 + it.ph) * 0.9 * wind + Math.sin(S.t * 0.53 + it.ph * 2) * 0.4); }
  function drawCustom(c, pos, d) { drawItem(d.it, pos.x, pos.y); }
  function drawItem(it, sx, sy) {
    if (it === 'post') return postEntityPass(ctx); // eslint-disable-line no-undef
    const t0 = nowS(), g = ctx; // eslint-disable-line no-undef
    if (sx < -140 || sx > 652 || sy < -40 || sy > 460) return;
    let a = 1;
    if (it.tall) { const tg = covers(it, sx, sy) ? 0.45 : 1; it.fade += (tg - it.fade) * Math.min(1, S.fdt * 7); a = it.fade; }
    try {
      if (it.k === 'npc') drawNPC(g, it, sx, sy);
      else if (it.k === 'garland') drawGarland(g, it);
      else if (it.s[0] === '@') { const b = procBake(it.s.slice(1)); if (b) { blitBake(g, b, sx, sy, it.flip, a); if (it.k === 'entrance') drawPortal(g, it, sx, sy); } else fallbackDraw(g, it, sx, sy); }
      else {
        if (it.k === 'moonwell') drawMoonwellBack(g, it, sx, sy);
        if (!blitArt(g, it.s, sx, sy, S.t + it.ph, it.flip, a, swayPx(it))) fallbackDraw(g, it, sx, sy, a);
        if (it.k === 'moonwell') drawMoonwellFront(g, it, sx, sy);
      }
    } catch (e) { console.error('[MM.world] draw item', it.s, e); }
    S.perf.items += (nowS() - t0) * 1000;
  }
  function drawNPC(g, it, sx, sy) {
    const p = worldToCanvas(game.x, game.y); // eslint-disable-line no-undef
    const want = p.x < sx - 2 ? true : p.x > sx + 2 ? false : it.flipNow;
    it.flipNow = want; const t = S.t + it.ph;
    softShadow(g, sx, sy, 8, 3, 0.26);
    const art = 'npc_' + it.npc;
    if (hasArt(art)) { MM.art.draw(g, art, sx, sy, { t, flip: want }); return; }
    const bob = reducedMotion() ? 0 : (Math.floor(t * 1.6) % 2), blink = (t % 3.7) < 0.13 ? 1 : 0;
    blitBake(g, npcBake(it.npc, bob, blink), sx, sy, want);
  }
  function drawGarland(g, it) {
    const a = worldToCanvas(it.a[0], it.a[1]), b = worldToCanvas(it.b[0], it.b[1]); // eslint-disable-line no-undef
    const ax = a.x, ay = a.y - it.a[2], bx = b.x, by = b.y - it.b[2], sag = 10 + Math.abs(bx - ax) * 0.06, sw = reducedMotion() ? 0 : Math.sin(S.t * 1.1 + it.ph) * 1.2;
    const P = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t + Math.sin(Math.PI * t) * (sag + sw)];
    g.fillStyle = '#4a3a31'; for (let i = 0; i <= 40; i++) { const [x, y] = P(i / 40); g.fillRect(Math.round(x), Math.round(y), 1, 1); }
    if (it.kind === 'lanterns') {
      for (let k = 1; k < 4; k++) { const [x, y] = P(k / 4); F(g, '#4e5660', x - 1, y + 1, 3, 1); F(g, '#263a37', x - 2, y + 2, 5, 5); F(g, (S.t * 3 + k) % 2 < 1.85 ? '#ffd27a' : '#eac979', x - 1, y + 3, 3, 3); }
    } else {
      const cols = ['#c95d6a', '#eac979', '#5f9ca3', '#c6aedb', '#87ad7b'], n = Math.max(4, Math.round(Math.hypot(bx - ax, by - ay) / 9));
      for (let k = 1; k < n; k++) { const [x, y] = P(k / n); POLY(g, '#263a37', [x - 3, y, x + 3, y, x, y + 6]); POLY(g, cols[k % 5], [x - 2, y + 1, x + 2, y + 1, x, y + 4]); }
    }
  }
  function drawMoonwellBack(g, it, sx, sy) { /* reserved: halo behind the well is handled by lighting */ }
  function drawMoonwellFront(g, it, sx, sy) {
    if (artGet(it.s)) return;
  }
  function drawPortal(g, it, sx, sy) {
    const m = it.mouth || [0, -12], x = sx + m[0], y = sy + m[1], t = S.t;
    for (let i = 0; i < 6; i++) { const a = t * 1.6 + i * TAU / 6, r = 3 + ((t * 0.9 + i / 6) % 1) * 6; F(g, i % 2 ? '#b69be6' : '#8ff0d0', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9, 1, 1); }
  }

  // ---------------------------------------------------------------- fallback procedural props (no MM.art)
  function fallbackDraw(g, it, x, y, a) {
    const k = it.k || '', s = it.s || '', sw = swayPx(it);
    const a0 = g.globalAlpha; if (a != null && a < 1) g.globalAlpha = a0 * a;
    if (k === 'tree' && /blight|crypt/.test(s)) { const c = /crypt/.test(s) ? '#8a8f8a' : '#4f4566'; LINE(g, c, 4, [x, y, x, y - 30]); LINE(g, c, 2, [x, y - 20, x - 12, y - 36]); LINE(g, c, 2, [x, y - 26, x + 12, y - 44]); LINE(g, c, 1, [x - 8, y - 30, x - 14, y - 40]); }
    else if (k === 'tree') { callBase('tree', x + sw, y, /1|willow/.test(s) ? 1 : 0); if (/willow/.test(s)) for (let i = -14; i <= 14; i += 4) F(g, '#5e865f', x + i + sw, y - 34, 1, 14 + Math.abs(i) * 0.3); }
    else if (k === 'pine') { F(g, '#5e5642', x - 2, y - 10, 4, 10); for (let i = 0; i < 4; i++) { POLY(g, '#2f4b47', [x - 15 + i * 3 + sw, y - 8 - i * 11, x + sw, y - 26 - i * 11, x + 15 - i * 3 + sw, y - 8 - i * 11]); F(g, '#f7f4e9', x - 12 + i * 3 + sw, y - 9 - i * 11, 24 - i * 6, 1); } }
    else if (k === 'bush') { const c = /blight/.test(s) ? ['#4f4566', '#36293f'] : /snow/.test(s) ? ['#688d65', '#f7f4e9'] : /swamp/.test(s) ? ['#5f8a74', '#46695f'] : ['#688d65', '#4b7052']; E(g, c[1], x + sw, y - 6, 11, 7); E(g, c[0], x - 3 + sw, y - 8, 7, 5); E(g, c[0], x + 4 + sw, y - 7, 6, 5); }
    else if (k === 'rock' || k === 'decor' && /rock/.test(s)) { F(g, /snow/.test(s) ? '#c9d4e6' : '#8a8f8a', x - 7, y - 6, 14, 6); F(g, /snow/.test(s) ? '#f7f4e9' : '#b2beaa', x - 5, y - 8, 10, 3); }
    else if (k === 'grass' || k === 'reeds') { for (let i = 0; i < 5; i++) F(g, k === 'reeds' ? '#46695f' : '#688d65', x - 5 + i * 2.5 + (i % 2 ? sw : 0), y - 6 - (i % 3) * 3 - (k === 'reeds' ? 8 : 0), 1, 6 + (i % 3) * 3 + (k === 'reeds' ? 8 : 0)); }
    else if (k === 'mushroom' || /mushroom/.test(s)) { F(g, '#e2dcc2', x - 1, y - 5, 2, 5); F(g, it.glow || '#c95d6a', x - 4, y - 8, 8, 3); }
    else if (k === 'crystal' || /crystal/.test(s)) { POLY(g, '#a5d6d8', [x - 6, y, x - 3, y - 18, x, y]); POLY(g, '#d6f1fb', [x - 1, y, x + 2, y - 24, x + 6, y]); }
    else if (k === 'tombstone' || /tomb/.test(s)) { F(g, '#8a8f8a', x - 5, y - 14, 10, 14); E(g, '#8a8f8a', x, y - 14, 5, 4); F(g, '#5d625f', x - 2, y - 11, 4, 1); }
    else if (k === 'fence') { const dir = /_y/.test(s) ? -1 : 1, br = /broken/.test(s); F(g, '#6e5642', x - 8, y - 12 - 4 * dir, 2, 12); F(g, '#6e5642', x + 7, y - 12 + 4 * dir, 2, 12); for (let i = 0; i < 16; i++) { if (br && i > 7 && i < 11) continue; F(g, '#b89d72', x - 8 + i, y - 10 - 4 * dir + i * 0.5 * dir, 1, 1); F(g, '#b89d72', x - 8 + i, y - 5 - 4 * dir + i * 0.5 * dir, 1, 1); } }
    else if (k === 'house') fallbackHouse(g, it, x, y);
    else if (k === 'moonwell') { E(g, '#737d7e', x, y - 4, 20, 8); E(g, ['#2e2638', '#4f4566', '#5f9ca3', '#a5d6d8'][it.moonwell || 0], x, y - 5, 15, 5); F(g, '#9ea79f', x - 20, y - 30, 5, 26); F(g, '#9ea79f', x + 15, y - 30, 5, 26); E(g, it.moonwell ? '#ebe1f7' : '#4e5660', x, y - 36, 6, 6); }
    else if (k === 'lamp') callBase('lamp', x, y);
    else if (k === 'bench') callBase('bench', x, y);
    else if (k === 'flowers') callBase('flowers', x, y);
    else if (k === 'well') { E(g, '#737d7e', x, y - 5, 13, 6); E(g, '#24474f', x, y - 6, 9, 3); F(g, '#6e5642', x - 12, y - 30, 2, 26); F(g, '#6e5642', x + 10, y - 30, 2, 26); POLY(g, '#8a4a40', [x - 16, y - 28, x, y - 40, x + 16, y - 28]); }
    else if (k === 'stall') { F(g, '#8f7a5a', x - 20, y - 18, 40, 18); F(g, '#6e5642', x - 20, y - 40, 2, 22); F(g, '#6e5642', x + 18, y - 40, 2, 22); for (let i = 0; i < 6; i++) F(g, i % 2 ? '#f7f4e9' : '#c6aedb', x - 22 + i * 7.5, y - 44, 8, 6); }
    else if (k === 'lantern') { F(g, '#4e5660', x - 3, y - 12, 6, 9); F(g, '#ffd27a', x - 2, y - 10, 4, 5); }
    else if (k === 'signpost') { F(g, '#6e5642', x - 1, y - 24, 3, 24); F(g, '#b89d72', x - 10, y - 24, 18, 5); F(g, '#b89d72', x - 6, y - 16, 16, 5); }
    else if (k === 'scarecrow') { F(g, '#6e5642', x - 1, y - 30, 2, 30); F(g, '#6e5642', x - 11, y - 24, 22, 2); F(g, '#5f9ca3', x - 5, y - 26, 10, 12); E(g, '#f7f4e9', x, y - 30, 4, 4); POLY(g, '#4f4566', [x - 6, y - 32, x, y - 42, x + 6, y - 32]); }
    else if (k === 'cauldron') { E(g, '#2e2638', x, y - 7, 9, 7); E(g, '#8ff0d0', x, y - 12, 7, 2); F(g, '#ff9a52', x - 4, y - 2, 8, 2); }
    else { const c = /barrel|crate|wood|table|sack|bucket|compost|stand/.test(s) ? '#9a7444' : '#8a8f8a'; F(g, c, x - 6, y - 10, 12, 10); F(g, '#b89d72', x - 6, y - 10, 12, 2); }
    g.globalAlpha = a0;
  }
  function fallbackHouse(g, it, x, y) {
    const A = it.foot[0] * 16, Bw = it.foot[1] * 16, wh = 30, wall = it.s.includes('ruined') ? '#8f7a5a' : '#e2dcc2';
    POLY(g, wall, [x, y, x - A, y - A / 2, x - A, y - A / 2 - wh, x, y - wh]);
    POLY(g, '#b8b49c', [x, y, x + Bw, y - Bw / 2, x + Bw, y - Bw / 2 - wh, x, y - wh]);
    const roof = it.s.includes('village_0') ? '#d27a55' : it.s.includes('village_1') ? '#8a78a8' : it.s.includes('ruined') ? '#4b7052' : '#6a907f';
    POLY(g, roof, [x - A - 3, y - A / 2 - wh + 2, x - A + Bw / 2, y - A / 2 - Bw / 4 - wh - 22, x + Bw / 2, y - Bw / 4 - wh - 22, x + 3, y - wh + 2]);
    F(g, '#4a3a31', x - A + 10, y - A / 2 + 5 - 20, 7, 15);
    F(g, isNightNow() ? '#ffd98a' : '#5f9ca3', x - A / 2, y - A / 4 - 20, 7, 6);
  }

  // ================================================================== post-entity pass (smoke, ambient particles, foreground)
  function postEntityPass(g) {
    if (!W.enabled) return;
    const t0 = nowS(); S._pbox = null;
    updateParticles();
    drawSmoke(g);
    drawParticles(g, false);
    if (W.options.foreground) drawForeground(g);
    S.perf.post += (nowS() - t0) * 1000;
  }
  function drawSmoke(g) {
    const rm = reducedMotion();
    for (const s of S.smokeSrc) {
      s.next -= S.fdt; if (s.next > 0) continue; s.next = rm ? 1.2 : 0.42;
      if (S.puffs.length > 60) S.puffs.shift();
      const p = project(s.it.x, s.it.y); S.puffs.push({ wx: p.x + s.dx, wy: p.y, z: -s.dy, life: 0, max: 3 + Math.random(), vx: 3 + Math.random() * 3 });
    }
    for (let i = S.puffs.length - 1; i >= 0; i--) {
      const p = S.puffs[i]; p.life += S.fdt; if (p.life > p.max) { S.puffs.splice(i, 1); continue; }
      const k = p.life / p.max, x = Math.round(p.wx + p.vx * p.life + Math.sin(p.life * 2 + p.wy) * 1.5 - game.camX + 256), y = Math.round(p.wy - p.z - p.life * 9 - game.camY + 160), sz = 2 + Math.round(k * 3); // eslint-disable-line no-undef
      g.globalAlpha = 0.5 * (1 - k); F(g, '#e9ece4', x, y, sz, sz); F(g, '#cfd5d0', x + sz - 1, y + 1, 1, sz - 1);
    }
    g.globalAlpha = 1;
  }
  const P_DEF = {
    pollen: { em: false, col: ['#fff3c4', '#d2e3ad'] }, petals: { em: false, col: ['#f2c8c0', '#f7f4e9', '#eabcb4'] },
    leaves: { em: false, col: ['#8a6a3f', '#6e5642', '#9a7444', '#5a4a6a'] }, snow: { em: false, col: ['#ffffff', '#eef6fb'] },
    fireflies: { em: true, col: ['#e9f59a'] }, spores: { em: true, col: ['#8ff0d0'] }, embers: { em: true, col: ['#ff9a52', '#ffd27a'] },
    wisps: { em: true, col: ['#c6aedb'] }, motes: { em: true, col: ['#ebe1f7'] },
  };
  function spawnParticle(spec) {
    const kd = spec.kind, d = P_DEF[kd] || P_DEF.pollen, col = spec.color || d.col[Math.floor(Math.random() * d.col.length)];
    const wx = game.camX - 280 + Math.random() * 560, wy = game.camY - 190 + Math.random() * 380; // eslint-disable-line no-undef
    const falling = kd === 'snow' || kd === 'leaves' || kd === 'petals';
    return { kd, col, em: d.em, wx, wy, z: falling ? 40 + Math.random() * 140 : 4 + Math.random() * 34, vx: (Math.random() - 0.5) * 6, ph: Math.random() * TAU, life: 0, max: falling ? 30 : 5 + Math.random() * 7, sz: kd === 'snow' ? (Math.random() < 0.3 ? 2 : 1) : kd === 'wisps' ? 2 : 1 };
  }
  function updateParticles() {
    if (!W.options.ambient || !S.cfg) { S.parts.length = 0; return; }
    const specs = S.cfg.ambient || [], sc = pScale(), dk = darkness(), lvl = levels().L, dt = S.fdt * (reducedMotion() ? 0.5 : 1);
    S.want = S.want || {};
    for (const sp of specs) {
      let n = Array.isArray(sp.n) ? sp.n[lvl] : sp.n; if (sp.kind === 'fireflies') n *= 0.15 + 0.85 * dk;
      if (world.weather === 'Rain' && (sp.kind === 'pollen' || sp.kind === 'petals' || sp.kind === 'fireflies')) n *= 0.3;
      S.want[sp.kind] = Math.round(Math.min(80, n * sc));
    }
    const count = {}; for (const p of S.parts) count[p.kd] = (count[p.kd] || 0) + 1;
    for (const sp of specs) { let c = count[sp.kind] || 0; while (c < S.want[sp.kind] && S.parts.length < 160) { S.parts.push(spawnParticle(sp)); c++; } }
    const wind = world.weather === 'Wind' ? 12 : 0;
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i]; p.life += dt;
      const kd = p.kd;
      if (kd === 'snow') { p.z -= (16 + p.sz * 6) * dt; p.wx += (5 + wind + Math.sin(p.ph + p.life) * 4) * dt; }
      else if (kd === 'leaves' || kd === 'petals') { p.z -= (kd === 'leaves' ? 11 : 7) * dt; p.wx += (Math.sin(p.ph + p.life * 2.2) * 14 + wind) * dt; }
      else if (kd === 'fireflies' || kd === 'wisps' || kd === 'motes') { p.wx += Math.sin(p.ph + p.life * 0.9) * 6 * dt; p.wy += Math.cos(p.ph * 1.3 + p.life * 0.7) * 4 * dt; p.z += Math.sin(p.ph + p.life * 1.7) * 3 * dt; }
      else if (kd === 'embers') { p.z += 9 * dt; p.wx += (Math.sin(p.ph + p.life * 3) * 5 + wind) * dt; }
      else { p.z += (kd === 'spores' ? 3 : 1.5) * dt; p.wx += (p.vx + wind) * dt; }
      const sx = p.wx - game.camX + 256, sy = p.wy - p.z - game.camY + 160; // eslint-disable-line no-undef
      const over = S.want[kd] != null && (count[kd] || 0) > S.want[kd] + 2;
      if (p.z < 0 || p.life > p.max || sx < -40 || sx > 552 || sy < -60 || sy > 380 || (over && Math.random() < 0.02)) { S.parts.splice(i, 1); if (over) count[kd]--; }
    }
  }
  function drawParticles(g, emissive) {
    const dk = darkness();
    for (const p of S.parts) {
      if (p.em !== emissive) continue;
      const sx = Math.round(p.wx - game.camX + 256), sy = Math.round(p.wy - p.z - game.camY + 160); // eslint-disable-line no-undef
      const fin = Math.min(1, p.life * 1.5, (p.max - p.life) * 1.5);
      let a = fin;
      if (p.kd === 'fireflies') a *= (0.3 + 0.7 * dk) * (0.55 + 0.45 * Math.sin(p.ph + p.life * 4));
      else if (p.kd === 'pollen' || p.kd === 'motes') a *= 0.55 + 0.35 * Math.sin(p.ph + p.life * 3);
      else if (p.kd === 'wisps') a *= 0.5;
      if (a <= 0.02) continue;
      g.globalAlpha = Math.min(1, a);
      if (p.em) { g.globalAlpha = Math.min(1, a) * 0.28; F(g, p.col, sx - 1, sy - 1, p.sz + 2, p.sz + 2); g.globalAlpha = Math.min(1, a); }
      if (p.kd === 'leaves' || p.kd === 'petals') { const f = Math.sin(p.ph + p.life * 5) > 0; F(g, p.col, sx, sy, f ? 2 : 1, f ? 1 : 2); }
      else F(g, p.col, sx, sy, p.sz, p.sz);
    }
    g.globalAlpha = 1;
  }
  function drawForeground(g) {
    const st = S.cfg && S.cfg.foliage; if (!st || st === 'none') return;
    const rm = reducedMotion();
    const ox = rm ? 0 : Math.round(clampN(-game.camX * 0.05, -14, 14)), oy = rm ? 0 : Math.round(clampN(-(game.camY - 160) * 0.05, -10, 10)); // eslint-disable-line no-undef
    const sw = rm ? 0 : Math.round(Math.sin(S.t * 0.9) * 1.2);
    const top = fgSprite(st, 't');
    blitBake(g, top, -10 + ox + sw, -8 + oy, false);
    blitBake(g, top, 512 + 10 + ox - sw, -8 + oy, true);
    if (st === 'leafy' || st === 'moss') { const bt = fgSprite('leafy', 'b'); blitBake(g, bt, -14 + ox, 320 - 84 + 12 + oy - sw, false); blitBake(g, bt, 512 + 14 + ox, 320 - 84 + 12 + oy + sw, true); }
  }

  // ================================================================== emissive pass (after lighting): motes, glows, marker
  function emissivePass(g) {
    if (!W.enabled) return;
    const t0 = nowS();
    drawParticles(g, true);
    const dk = darkness();
    // light halos only when no lighting module renders getLights()
    if (!MM.lighting && dk > 0.05) {
      g.globalCompositeOperation = 'lighter';
      for (const l of getLights()) { if (!l.on || l.intensity <= 0.02) continue; const p = lightToScreen(l); if (p.x < -60 || p.x > 572 || p.y < -60 || p.y > 380) continue; const r = l.r * 0.55; g.globalAlpha = 0.16 * l.intensity * dk; E(g, l.color, p.x, p.y, r, r * 0.8); g.globalAlpha = 0.22 * l.intensity * dk; E(g, l.color, p.x, p.y, r * 0.4, r * 0.32); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    // Moonwell shimmer column at full restoration
    for (const it of S.items) if (it.k === 'moonwell' && (it.moonwell || 0) >= 3) {
      const p = worldToCanvas(it.x, it.y), L = levels().L, n = L >= 4 ? 14 : 6; // eslint-disable-line no-undef
      for (let i = 0; i < n; i++) { const k = (S.t * 0.35 + i / n) % 1, x = p.x + Math.sin(i * 2.3 + S.t) * (6 + i % 5), y = p.y - 12 - k * (L >= 4 ? 70 : 40); g.globalAlpha = (1 - k) * 0.85; F(g, i % 3 ? '#d6f1fb' : '#ffffff', x, y, 1, i % 4 ? 1 : 2); }
      if (L >= 4) { g.globalAlpha = 0.1 + 0.04 * Math.sin(S.t * 2); F(g, '#d6f1fb', p.x - 5, p.y - 90, 10, 80); g.globalAlpha = 0.07; F(g, '#ffffff', p.x - 2, p.y - 90, 4, 80); }
      g.globalAlpha = 1;
    }
    drawMarker(g);
    S.perf.emit += (nowS() - t0) * 1000;
    S.perf.n++;
  }
  function drawMarker(g) {
    const it = currentPrompt(); if (!it || it.kind === 'plot') return;
    const p = worldToCanvas(it.x, it.y), b = reducedMotion() ? 0 : Math.round(Math.sin(S.t * 4) * 1.5); // eslint-disable-line no-undef
    const x = p.x, y = p.y - (it.hy || 26) - 4 + b;
    F(g, '#263a37', x - 4, y - 1, 9, 3); F(g, '#263a37', x - 3, y + 2, 7, 2); F(g, '#263a37', x - 1, y + 4, 3, 2);
    F(g, '#fff3c4', x - 3, y, 7, 1); F(g, '#eac979', x - 2, y + 1, 5, 1); F(g, '#eac979', x - 1, y + 2, 3, 1); F(g, '#cfaa71', x, y + 3, 1, 1);
  }

  // ================================================================== lights API
  function getLights() {
    const dk = darkness(), t = S.t;
    for (const l of S.lights) {
      const fl = l.flicker ? 1 - l.flicker * 0.5 * (0.5 + 0.5 * Math.sin(t * 9 + l.ph) * Math.sin(t * 3.7 + l.ph * 2)) : 1;
      l.intensity = (l.night ? dk : 1) * fl; l.on = l.intensity > 0.01;
    }
    return S.lights;
  }
  function lightToScreen(l) { const p = worldToCanvas(l.x, l.y); return { x: p.x, y: p.y - (l.z || 0) }; } // eslint-disable-line no-undef

  // ================================================================== interactables
  function nearestInteractable(x, y, maxDist) {
    let best = null, bd = Infinity;
    for (const i of S.inter) { const d = Math.hypot(i.x - x, i.y - y); if (d <= i.r && d <= (maxDist ?? Infinity) && d < bd) { bd = d; best = i; } }
    return best;
  }
  function plotCandidate() {
    if (world.region !== 'grove' || world.mode !== 'outside' || !world.plots) return null;
    let best = null, bd = 52;
    for (const p of world.plots) { const d = callBase('screenDistance', game, p); if (d != null && d <= bd) { bd = d; best = p; } } // eslint-disable-line no-undef
    return best ? { p: best, d: bd } : null;
  }
  function currentPrompt() {
    if (!S.inter || typeof game === 'undefined') return null; // eslint-disable-line no-undef
    const it = nearestInteractable(game.x, game.y), pl = plotCandidate(); // eslint-disable-line no-undef
    if (pl && (!it || pl.d < (callBase('screenDistance', game, it) ?? 1e9))) { // eslint-disable-line no-undef
      const p = pl.p, seed = SEED_TYPES?.[p.seed]; // eslint-disable-line no-undef
      const prompt = !p.seed ? 'Plant ' + (SEED_TYPES?.[world.seed]?.name || 'seeds') : p.growth >= 100 ? 'Harvest ' + (seed?.name || '') : !p.watered ? 'Water ' + (seed?.name || '') : null; // eslint-disable-line no-undef
      return prompt ? { id: 'plot', kind: 'plot', prompt, key: 'E', x: p.x, y: p.y, plot: p, region: 'grove' } : null;
    }
    if (!it) return null;
    return Object.assign({ key: 'E' }, it);
  }
  const FALLBACK = {
    seeds: () => callBase('buySeeds'), brew: () => callBase('brew'), craft: () => callBase('brewBomb'), board: () => callBase('turnInQuest'), shop: () => callBase('sellHarvest'),
    broom: () => callBase('toggleBroom'), dungeon: () => callBase('enterDungeon', false), stairs: () => callBase('advanceFloor'), exit: () => callBase('goRegion', world.region),
    rest: () => { world.time += 0.25; callBase('message', 'You rest a while. Time passes.'); },
    mail: () => callBase('message', 'No letters today — just a pressed moonflower.'),
    well: () => callBase('message', 'Cool, clear water. The bucket creaks.'),
    moonwell: () => callBase('message', ['The Moonwell is dark and silent.', 'A faint glimmer stirs in the Moonwell.', 'The Moonwell hums with moonlight.', 'The Moonwell shines, whole again.'][levels().mw]),
    travel: () => { const order = ['grove', 'village', 'forest', 'swamp', 'mountain', 'crypt']; const i = order.indexOf(world.region); callBase('goRegion', order[(i + 1) % order.length]); },
    npc: (it) => {
      try { const d = MM.campaign?.dialogue?.(it.id); if (d && MM.ui?.dialogue) { MM.ui.dialogue(d); return; } } catch (e) { console.error('[MM.world] dialogue', e); }
      const lines = { marrow: 'The Moonwell remembers your grandmother. Give it time.', pip: 'Arrows, seeds, string — Pip has it all!', wren: 'Bring me glowcaps and I will teach you a recipe.' };
      callBase('message', (NPC_INFO[it.id]?.name || it.id) + ': ' + (lines[it.id] || 'Lovely evening.'));
    },
  };
  const UI_SCREEN = { shop: 'shop', travel: 'travel', craft: 'crafting', brew: 'crafting', board: 'journal' };
  function interact(target) {
    const it = target || currentPrompt(); if (!it) return false;
    if (it.kind === 'plot') { callBase('tendPlot', it.plot); return true; }
    try { MM.bus?.emit?.('interact', { id: it.id, kind: it.kind, region: it.region, x: it.x, y: it.y }); } catch (e) { /* optional */ }
    const h = S.handlers.get(it.id) || S.handlers.get(it.kind) || S.handlers.get('*');
    if (h) { try { if (h(it) !== false) return true; } catch (e) { console.error('[MM.world] handler ' + it.id, e); return true; } }
    if (typeof it.action === 'function') { try { return it.action(it) !== false; } catch (e) { console.error(e); return true; } }
    if (UI_SCREEN[it.kind] && MM.ui?.open && MM.campaign) { try { MM.ui.open(UI_SCREEN[it.kind], { from: it.id, region: it.region }); return true; } catch (e) { console.error(e); } }
    const fb = FALLBACK[it.kind]; if (fb) { fb(it); return true; }
    return false;
  }
  window.addEventListener('keydown', (e) => {
    if (!W.enabled || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.key || '').toLowerCase() !== 'e') return;
    try { if (MM.isPaused?.() || MM.input?.isBlocked?.()) return; } catch (err) { return; }
    const tg = e.target; if (tg && tg.closest && tg.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]')) return;
    const c = currentPrompt(); if (!c || c.kind === 'plot') return; // plots stay with baseline tendPlot
    e.preventDefault(); e.stopImmediatePropagation(); interact(c);
  }, true);
  // tap/click on an interactable's sprite while in range
  try {
    canvas.addEventListener('pointerdown', (e) => { // eslint-disable-line no-undef
      if (!W.enabled) return; try { if (MM.isPaused?.() || MM.input?.isBlocked?.()) return; } catch (err) { return; }
      const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * 512 / r.width, y = (e.clientY - r.top) * 320 / r.height; // eslint-disable-line no-undef
      let best = null, bd = 18;
      for (const i of S.inter) { const p = worldToCanvas(i.x, i.y), h = i.hy || 26; if (x < p.x - 14 || x > p.x + 14 || y < p.y - h - 6 || y > p.y + 6) continue; const d = Math.abs(x - p.x) + Math.abs(y - (p.y - h / 2)) * 0.3; if (d < bd) { bd = d; best = i; } } // eslint-disable-line no-undef
      if (!best || Math.hypot(best.x - game.x, best.y - game.y) > best.r) return; // eslint-disable-line no-undef
      e.stopImmediatePropagation(); e.preventDefault(); interact(best);
    }, true);
  } catch (e) { /* canvas missing */ }

  // ================================================================== collision (outside only; gentle slide, never traps)
  const _moveActor = window.moveActor;
  if (typeof _moveActor === 'function') {
    window.moveActor = function (actor, dx, dy) {
      const ox = actor.x, oy = actor.y;
      const r = _moveActor(actor, dx, dy);
      if (W.enabled && W.options.collision && world.mode === 'outside' && S.obs) { try { resolve(actor, ox, oy, dx, dy); } catch (e) { console.error('[MM.world] collision', e); } }
      return r;
    };
  }
  function resolve(a, ox, oy, dx, dy) {
    const AR = 0.22, high = (a.height || 0) > 6;
    let x = a.x, y = a.y;
    for (const o of S.obs) {
      if (high && o.low) continue;
      if (o.rect) {
        const [x0, y0, x1, y1] = o.rect, X0 = x0 - AR, Y0 = y0 - AR, X1 = x1 + AR, Y1 = y1 + AR;
        if (x <= X0 || x >= X1 || y <= Y0 || y >= Y1) continue;
        if (ox > X0 && ox < X1 && oy > Y0 && oy < Y1) continue; // started inside: let it walk out
        const pl = x - X0, pr = X1 - x, pt = y - Y0, pb = Y1 - y, m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = X0; else if (m === pr) x = X1; else if (m === pt) y = Y0; else y = Y1;
      } else {
        const R = o.r + AR, d = Math.hypot(x - o.x, y - o.y); if (d >= R) continue;
        if (Math.hypot(ox - o.x, oy - o.y) < R - 0.01) continue;
        if (d < 1e-4) { x = ox; y = oy; continue; }
        x = o.x + (x - o.x) / d * R; y = o.y + (y - o.y) / d * R;
      }
    }
    if (!high && tileAt(x, y) === 'water' && tileAt(ox, oy) !== 'water') { if (tileAt(x, oy) !== 'water') y = oy; else if (tileAt(ox, y) !== 'water') x = ox; else { x = ox; y = oy; } }
    a.x = clampN(x, 0.6, 19.4); a.y = clampN(y, 0.6, 19.4);
    if (a === game && game.target) { // eslint-disable-line no-undef
      const want = Math.hypot(dx, dy), got = Math.hypot(a.x - ox, a.y - oy);
      if (want > 1e-4 && got < want * 0.25) { S.stuck += 1 / 60; if (S.stuck > 0.45) { game.target = null; S.stuck = 0; } } else S.stuck = 0; // eslint-disable-line no-undef
    }
  }

  // ================================================================== baseline wrappers
  const _drawGround = window.drawGround;
  window.drawGround = function () {
    if (!W.enabled) return _drawGround();
    gc.clearRect(0, 0, ground.width, ground.height); // eslint-disable-line no-undef
    markDirty(); try { ensure(); } catch (e) { console.error('[MM.world] rebuild', e); }
  };
  const _drawProp = window.drawProp;
  window.drawProp = function (p, x, y) { if (p && p._mm) { if (p._mm === 'post') return postEntityPass(ctx); return drawItem(p._mm, x, y); } return _drawProp(p, x, y); }; // eslint-disable-line no-undef
  const _ddb = window.drawDungeonBlock;
  window.drawDungeonBlock = function (b) {
    if (!W.enabled || !S.cfg || !S.cfg.walls) return _ddb(b);
    const p = worldToCanvas(b.x, b.y), names = S.cfg.walls, s = names[(b.variant || 0) % names.length], g = ctx; // eslint-disable-line no-undef
    softShadow(g, p.x + 2, p.y, 11, 4, 0.32);
    if (!b._mm) b._mm = { s, x: b.x, y: b.y, k: 'decor', tall: true, fade: 1, ph: hsh(b.x, b.y, 3) * TAU };
    const it = b._mm; const sz = spriteSize(it); it.w = sz[0]; it.h = sz[1]; it.ax = sz[2]; it.ay = sz[3]; it.depth = project(b.x, b.y).y;
    const tg = covers(it, p.x, p.y) ? 0.45 : 1; it.fade += (tg - it.fade) * Math.min(1, S.fdt * 7);
    if (s[0] === '@') { const bk = procBake(s.slice(1)); if (bk) blitBake(g, bk, p.x, p.y, b.variant === 2, it.fade); }
    else {
      if (S.cfg === DV().forest) blitArt(g, 'bush_blight', p.x - 6, p.y + 1, 0, false, it.fade);
      if (!blitArt(g, s, p.x, p.y, S.t + it.ph, (b.x + b.y) % 4 === 0, it.fade)) { _ddb(b); return; }
      if (S.cfg === DV().mountain) blitArt(g, 'rock_snow', p.x + 5, p.y + 2, 0, false, it.fade);
    }
  };
  const _dvk = window.drawVillageKeeper;
  if (typeof _dvk === 'function') window.drawVillageKeeper = function () { if (W.enabled && W.options.hideGroveKeeper) return; return _dvk(); };
  // village hub: make sure the region exists and stays peaceful
  try { if (!REGIONS.village) REGIONS.village = { name: 'Hollowbrook Village', tint: null, mob: 'slime', level: 1 }; } catch (e) { /* ignore */ } // eslint-disable-line no-undef
  const _goRegion = window.goRegion;
  if (typeof _goRegion === 'function') window.goRegion = function (id) { const r = _goRegion.apply(this, arguments); try { if (id === 'village' && world.region === 'village' && world.mode === 'outside') enemies = []; } catch (e) { /* ignore */ } return r; }; // eslint-disable-line no-undef

  // ================================================================== hook wiring
  function attach() {
    const H = MM.hooks;
    if (H && typeof H.on === 'function') {
      useHooks = true;
      H.on('preDraw', preDrawPass, -100);
      H.on('drawGround', postGroundPass, -100);
      S.sentinel = { type: 'custom', x: 0, y: 0, depth: 1e7, draw: () => postEntityPass(ctx) }; // eslint-disable-line no-undef
      H.on('drawables', (list) => { if (!W.enabled) return; S._pbox = null; for (const d of S.draws) list.push(d); list.push(S.sentinel); }, -100);
      H.on('postEffects', emissivePass, 50);
      H.on('overlay', overlayPass, 80);
    } else {
      // no MM core: intercept the ground blit and the post-effects call
      const di = ctx.drawImage; // eslint-disable-line no-undef
      ctx.drawImage = function (img) { if (img === ground && arguments.length === 3 && W.enabled) { preDrawPass(ctx); di.apply(this, arguments); postGroundPass(ctx); return; } return di.apply(this, arguments); }; // eslint-disable-line no-undef
      const _dem = window.drawExtraMagic; if (typeof _dem === 'function') window.drawExtraMagic = function () { _dem(); emissivePass(ctx); overlayPass(ctx); }; // eslint-disable-line no-undef
    }
  }

  // ================================================================== transitions (optional visual helper)
  function overlayPass(g) {
    const tr = S.trans; if (!tr) return;
    const k = (nowS() - tr.t0) / tr.dur;
    if (k >= 1) { S.trans = null; tr.resolve(); return; }
    if (!tr.mid && k >= 0.5) { tr.mid = true; try { tr.onMid && tr.onMid(); } catch (e) { console.error(e); } }
    const c = 1 - Math.abs(k * 2 - 1); // 0 -> 1 -> 0
    if (reducedMotion() || tr.fade) { g.globalAlpha = c; F(g, tr.color, 0, 0, 512, 320); g.globalAlpha = 1; return; }
    const R = Math.max(0, (1 - c) * 320), cx = 256, cy = 160;
    g.fillStyle = tr.color; g.beginPath(); g.rect(0, 0, 512, 320);
    for (let i = 0; i <= 32; i++) { const a = -i / 32 * TAU, rr = R * (1 + 0.06 * Math.sin(a * 5 + k * 6)); const X = cx + Math.cos(a) * rr, Y = cy + Math.sin(a) * rr * 0.75; if (!i) g.moveTo(X, Y); else g.lineTo(X, Y); }
    g.closePath(); g.fill('evenodd');
  }
  function transition(from, to, opt) {
    opt = opt || {};
    const cfg = RV()[to] || RV()[from] || {};
    return new Promise((resolve) => { S.trans = { t0: nowS(), dur: opt.dur || 1.1, color: opt.color || cfg.backdrop?.bottom || '#1f2c2a', onMid: opt.onMid, fade: !!opt.fade, resolve }; });
  }

  // ================================================================== public API
  Object.assign(W, {
    setRestoration(level, o) { S.L = clampN(Number(level) | 0, 0, 4); if (o && o.moonwell != null) S.mwSet = clampN(o.moonwell | 0, 0, 3); else if (!o || !o.keepMoonwell) S.mwSet = null; markDirty(); return S.L; },
    getRestoration() { return levels(); },
    setMoonwell(level) { S.mwSet = level == null ? null : clampN(level | 0, 0, 3); markDirty(); },
    layout(regionId, mode) {
      const L = buildLayout(regionId || world.region, mode || (regionId && regionId !== world.region ? 'outside' : world.mode));
      if (!L) return null;
      return { region: L.region, mode: L.mode, props: L.items.map((i) => ({ sprite: i.s, kind: i.k, x: i.x, y: i.y })), npcs: L.npcs.map((n) => ({ id: n.npc, name: n.name, x: n.x, y: n.y })), interactables: L.inter.map((i) => ({ id: i.id, kind: i.kind, x: i.x, y: i.y, r: i.r, prompt: i.prompt })) };
    },
    interactables() { return S.inter.slice(); },
    nearestInteractable, currentPrompt, interact,
    register(id, handler) { if (typeof handler !== 'function') return () => {}; S.handlers.set(id, handler); return () => { if (S.handlers.get(id) === handler) S.handlers.delete(id); }; },
    unregister(id) { S.handlers.delete(id); },
    getLights, lightToScreen,
    npcs() { return S.npcs.map((n) => ({ id: n.npc, name: n.name, x: n.x, y: n.y })); },
    obstacles() { return S.obs.map((o) => (o.rect ? { rect: o.rect.slice(), low: o.low } : { x: o.x, y: o.y, r: o.r, low: o.low })); },
    tileAt, transition, rebuild() { markDirty(); bakes.clear(); },
    regionVisual(id) { return RV()[id] || null; },
    perf(reset) { const p = S.perf, n = Math.max(1, p.n), r = { frames: p.n, groundMs: p.ground / n, itemsMs: p.items / n, postMs: p.post / n, emissiveMs: p.emit / n, totalMs: (p.ground + p.items + p.post + p.emit) / n, lastBuildMs: p.build, lastTerrainMs: p.terrain || 0, particles: S.parts.length }; if (reset) Object.assign(p, { n: 0, ground: 0, items: 0, post: 0, emit: 0 }); return r; },
    _state: S,
  });

  // keep in sync with campaign + art
  try { MM.bus?.on?.('restored', () => { syncCampaign(); markDirty(); }); MM.bus?.on?.('chapter', () => { syncCampaign(); markDirty(); }); MM.bus?.on?.('settings', () => { S.parts.length = 0; }); } catch (e) { /* bus optional */ }
  try { MM.art?.whenReady?.(() => { markDirty(); bakes.forEach((v, k) => { if (k.startsWith('fg:')) bakes.delete(k); }); }); } catch (e) { /* art optional */ }
  attach();
  gc.clearRect(0, 0, ground.width, ground.height); // eslint-disable-line no-undef
  ensure();
})();
