'use strict';
// Moss & Moon — cinematic player (MM.cine).
// Plays scenes listed in MM.CINE_MANIFEST (src/config/cinematics.js) either from a real video file
// (assets/video/*.webm|mp4, when listed) or from the procedural "engine" scenes defined below.
// Renders into its own overlay <canvas> (512×320, pixelated, letterboxed 8:5) above the game canvas and
// below DOM UI (z-index 50 < 100; PHASE2_CONTRACT). Subtitles, titles and nameplates are sharp DOM text.
// Never throws, always resolves; never grants rewards (callers use result.rewardKey). See notes/CINEMATICS.md.
window.MM = window.MM || {};
(function (MM) {
  const W = 512, H = 320, Z_INDEX = 50;
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const sm = t => t * t * (3 - 2 * t);
  const EASE = {
    linear: t => t, in: t => t * t, out: t => 1 - (1 - t) * (1 - t), inOut: sm,
    cubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outCubic: t => 1 - Math.pow(1 - t, 3)
  };
  const R = Math.round;
  function rng(seed) {
    let s = seed | 0;
    return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const RGB = {};
  function rgb(h) { let c = RGB[h]; if (!c) { const n = parseInt(h.slice(1), 16); c = RGB[h] = [n >> 16 & 255, n >> 8 & 255, n & 255]; } return c; }
  const mixA = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
  function mix(a, b, t) { const c = mixA(rgb(a), rgb(b), clamp(t)); return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
  function rgba(h, a) { const c = rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function mkCanvas(w, h, rf) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', rf ? { willReadFrequently: true } : undefined); g.imageSmoothingEnabled = false; return [c, g]; }
  const CACHE = new Map();
  function cached(key, fn) { let v = CACHE.get(key); if (v === undefined) { v = fn(); CACHE.set(key, v); } return v; }

  // ───────────────────────────── pixel pen ─────────────────────────────
  // Draws in "art units" scaled by an integer pixel size so close-ups stay chunky and crisp.
  function pen(g, ox, oy, sc) {
    ox = R(ox); oy = R(oy);
    const P = {
      r(x, y, w, h, c) { if (c) g.fillStyle = c; g.fillRect(ox + R(x) * sc, oy + R(y) * sc, R(w) * sc, R(h) * sc); },
      ell(cx, cy, rx, ry, c) {
        g.fillStyle = c; const n = Math.floor(ry);
        for (let dy = -n; dy <= n; dy++) { const hw = R(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry)))); g.fillRect(ox + (R(cx) - hw) * sc, oy + (R(cy) + dy) * sc, (hw * 2 + 1) * sc, sc); }
      },
      disc(cx, cy, r, c) { P.ell(cx, cy, r, r, c); },
      ring(cx, cy, rx, ry, c) {
        g.fillStyle = c; const n = Math.max(1, Math.floor(ry)), hwAt = dy => R(rx * Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry))));
        for (let dy = -n; dy <= n; dy++) {
          const hw = hwAt(dy), nx = dy === 0 ? hw : hwAt(dy < 0 ? dy + 1 : dy - 1), o = Math.max(hw, nx - 1), w = Math.abs(dy) === n ? hw * 2 + 1 : o - hw + 1;
          if (Math.abs(dy) === n) { g.fillRect(ox + (R(cx) - hw) * sc, oy + (R(cy) + dy) * sc, w * sc, sc); continue; }
          g.fillRect(ox + (R(cx) - o) * sc, oy + (R(cy) + dy) * sc, w * sc, sc); g.fillRect(ox + (R(cx) + hw) * sc, oy + (R(cy) + dy) * sc, w * sc, sc);
        }
      },
      line(x0, y0, x1, y1, c, w = 1) { g.fillStyle = c; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) { const t = i / n; g.fillRect(ox + R(x0 + (x1 - x0) * t) * sc, oy + R(y0 + (y1 - y0) * t) * sc, w * sc, w * sc); } }
    };
    return P;
  }

  // ───────────────────────────── light & sky ─────────────────────────────
  function glowSprite(col) {
    return cached('glow:' + col, () => {
      const [c, g] = mkCanvas(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(.18, rgba(col, .55)); gr.addColorStop(.5, rgba(col, .16)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
    });
  }
  function glow(g, x, y, r, col, a) {
    if (!(a > .004) || r <= 0) return;
    const op = g.globalCompositeOperation, ga = g.globalAlpha;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a); g.imageSmoothingEnabled = true;
    g.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
    g.imageSmoothingEnabled = false; g.globalCompositeOperation = op; g.globalAlpha = ga;
  }
  const SKY = {
    night: ['#0a0f2e', '#1c2a5a', '#46668a', .6], dim: ['#06060d', '#131226', '#2c2840', .6],
    bright: ['#0e1944', '#2a4386', '#86a6c8', .58], dawn: ['#121a46', '#46478a', '#e0a08c', .6],
    forest: ['#08060e', '#1d1128', '#4c2a4a', .6], swamp: ['#040a0a', '#0e211c', '#2e4c36', .6],
    frost: ['#060b1a', '#17284a', '#5e7c9e', .6], void: ['#030409', '#080b16', '#121828', .6],
    velvet: ['#070a1c', '#101838', '#1c2a4c', .5]
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function skyCanvas(key) {
    return cached('sky:' + key, () => {
      const [c, g] = mkCanvas(W, H), [a, b, d, m] = SKY[key], A = rgb(a), B = rgb(b), D = rgb(d), N = 16;
      const img = g.createImageData(W, H), px = img.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = clamp(R(y / (H - 1) * N + BAYER[(y & 3) * 4 + (x & 3)] / 16 - .5) / N);
        const col = k < m ? mixA(A, B, k / m) : mixA(B, D, (k - m) / (1 - m)), i = (y * W + x) * 4;
        px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
      }
      g.putImageData(img, 0, 0); return c;
    });
  }
  function sky(g, key, a = 1) { if (a <= 0) return; g.globalAlpha = Math.min(1, a); g.drawImage(skyCanvas(key), 0, 0); g.globalAlpha = 1; }
  const STARS = (() => { const r = rng(7); return Array.from({ length: 190 }, () => ({ x: r() * 1024, y: Math.pow(r(), 1.5) * 220, b: .3 + r() * .7, s: .8 + r() * 3, p: r() * 6.3, big: r() < .07, c: r() < .2 ? '#ffe9c4' : r() < .5 ? '#cfe0ff' : '#f4f7ff' })); })();
  function stars(g, t, ox, a = 1, rm) {
    for (const s of STARS) {
      const x = R(((s.x - ox) % 1024 + 1024) % 1024); if (x >= W) continue;
      const tw = rm ? .8 : .55 + .45 * Math.sin(t * s.s + s.p), al = a * s.b * tw; if (al < .03) continue;
      g.globalAlpha = al; g.fillStyle = s.c; const y = R(s.y); g.fillRect(x, y, 1, 1);
      if (s.big) { g.globalAlpha = al * .4; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
    }
    g.globalAlpha = 1;
  }
  function moonDisk(r) {
    return cached('moon:' + r, () => {
      const s = r * 2 + 3, [c, g] = mkCanvas(s, s), img = g.createImageData(s, s), px = img.data, cr = r + 1.5;
      const L = [-.55, -.6, .58], crat = [[-.35, -.2, .22], [.25, .3, .18], [.1, -.45, .12], [-.1, .45, .1], [.45, -.1, .1]];
      const ramp = ['#8b8a8e', '#b4b1a8', '#d6d2c0', '#ece8d4', '#fbf8e8'].map(rgb);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = (x - cr + .5) / r, dy = (y - cr + .5) / r, d2 = dx * dx + dy * dy; if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2); let l = dx * L[0] + dy * L[1] + nz * L[2];
        for (const [cx, cy, rr] of crat) { const q = ((dx - cx) ** 2 + (dy - cy) ** 2) / (rr * rr); if (q < 1) l -= q > .55 ? .05 : .22; }
        const k = clamp(R(clamp(.25 + l * .95) * 4 + BAYER[(y & 3) * 4 + (x & 3)] / 16 - .5), 0, 4), col = ramp[k], i = (y * s + x) * 4;
        px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
      }
      g.putImageData(img, 0, 0); return c;
    });
  }
  function moon(g, x, y, r, a = 1, dim = 0) {
    glow(g, x, y, r * 8, '#7f9cf0', .2 * a * (1 - dim * .6)); glow(g, x, y, r * 3, '#dce8ff', .34 * a * (1 - dim * .7));
    g.globalAlpha = a * (1 - dim * .5); g.drawImage(moonDisk(r), R(x - r - 1.5), R(y - r - 1.5)); g.globalAlpha = 1;
    if (dim > 0) { g.globalAlpha = dim * .45; g.fillStyle = '#3a2c4a'; g.fillRect(R(x - r - 2), R(y - 2), r * 2 + 4, 3); g.fillRect(R(x - r * .6), R(y + r * .45), R(r * 1.6), 2); g.globalAlpha = 1; }
  }
  function vignetteCanvas(col, k) {
    return cached('vig:' + col + k, () => {
      const [c, g] = mkCanvas(W, H), gr = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .62);
      gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(1, rgba(col, k)); g.fillStyle = gr; g.fillRect(0, 0, W, H); return c;
    });
  }

  // ───────────────────────────── silhouettes (masks → colorized layers) ─────────────────────────────
  function disc(g, cx, cy, r) { cx = R(cx); cy = R(cy); r = R(r); for (let dy = -r; dy <= r; dy++) { const hw = R(Math.sqrt(r * r - dy * dy)); g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1); } }
  function seg2(g, x0, y0, x1, y1, w = 1) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) { const t = i / n; g.fillRect(R(x0 + (x1 - x0) * t - (w - 1) / 2), R(y0 + (y1 - y0) * t - (w - 1) / 2), w, w); } }
  function pine(g, cx, by, h, r, snow) {
    g.fillRect(cx, by - 4, 2, 5); const tiers = h > 28 ? 4 : 3, th = (h - 4) / tiers;
    for (let i = 0; i < h - 4; i++) { const tier = Math.floor(i / th), inT = 1 - (i - tier * th) / th, w = R(inT * (tiers - tier) * (h * .06 + 1.1) + .4); g.fillRect(cx + 1 - w, by - 4 - i, w * 2, 1); }
    g.fillRect(cx, by - h - 1, 2, 2);
  }
  function oak(g, cx, by, h, r) {
    const tr = R(h * .45); g.fillRect(cx - 1, by - tr, 3, tr + 1); const rr = Math.max(3, R(h * .3)), cy = by - R(h * .64);
    disc(g, cx, cy, rr); disc(g, cx - rr * .7, cy + rr * .35, rr * .75); disc(g, cx + rr * .7, cy + rr * .3, rr * .7); disc(g, cx + R(r() * 2 - 1), cy - rr * .55, rr * .66);
  }
  function branch(g, x, y, dir, len, r, depth) {
    const a = -Math.PI / 2 + dir * (.45 + r() * .75), x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len; seg2(g, x, y, x1, y1, 1);
    if (depth > 0) { branch(g, x1, y1, dir, len * .55, r, depth - 1); if (r() < .65) branch(g, x1, y1, -dir, len * .42, r, depth - 1); }
  }
  function deadTree(g, cx, by, h, r) {
    let x = cx; const pts = [];
    for (let i = 0; i <= h; i++) { if (r() < .2) x += r() < .5 ? -1 : 1; g.fillRect(x, by - i, i < h * .3 ? 3 : 2, 1); pts.push([x, by - i]); }
    const nb = 2 + Math.floor(r() * 3);
    for (let k = 0; k < nb; k++) { const p = pts[Math.min(pts.length - 1, Math.floor(h * (.38 + r() * .55)))]; branch(g, p[0], p[1], r() < .5 ? -1 : 1, 4 + r() * h * .38, r, 2); }
  }
  function deadPine(g, cx, by, h, r) {
    g.fillRect(cx, by - h, 2, h + 1);
    for (let y = by - 6; y > by - h + 2; y -= 3 + Math.floor(r() * 3)) { const l = R((by - y) / h < .5 ? 4 + r() * 5 : 2 + r() * 3); const d = r() < .5 ? -1 : 1; seg2(g, cx + (d > 0 ? 2 : -1), y, cx + d * l, y + R(r() * 3 - 1), 1); }
  }
  function willow(g, cx, by, h, r, dead) {
    g.fillRect(cx - 1, by - R(h * .5), 3, R(h * .5) + 1); const cy = by - R(h * .62), rr = R(h * .32);
    if (!dead) { disc(g, cx, cy, rr); disc(g, cx - rr * .8, cy + 2, rr * .7); disc(g, cx + rr * .8, cy + 2, rr * .7); }
    else { branch(g, cx, cy + 3, -1, rr, r, 1); branch(g, cx, cy + 3, 1, rr, r, 1); }
    for (let x = -R(rr * 1.4); x <= R(rr * 1.4); x += 2) { if (dead && r() < .5) continue; const top = cy + R(Math.abs(x) * .3) - (dead ? -2 : 0), len = R(h * (dead ? .2 : .35) * (.5 + r() * .7)); g.fillRect(cx + x, top, 1, len); }
  }
  function reedClump(g, cx, by, r) {
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) { const x = cx + R(r() * 8 - 4), h = 5 + R(r() * 10); g.fillRect(x, by - h, 1, h); if (r() < .4) g.fillRect(x, by - h - 2, 2, 3); }
  }
  function iceSpike(g, cx, by, h, r) {
    const w = 2 + R(r() * 3); for (let i = 0; i < h; i++) { const hw = R(w * (1 - i / h)); g.fillRect(cx - hw, by - i, hw * 2 + 1, 1); }
    if (r() < .6) { const h2 = R(h * .55), o = r() < .5 ? -w - 1 : w + 1; for (let i = 0; i < h2; i++) { const hw = R((w - 1) * (1 - i / h2)); g.fillRect(cx + o - hw + R(i * .25 * Math.sign(o)), by - i, hw * 2 + 1, 1); } }
  }
  function mask(kind, w, h, seed, o = {}) {
    return cached('mask:' + [kind, w, h, seed, JSON.stringify(o)].join('|'), () => {
      const [c, g] = mkCanvas(w, h, true), r = rng(seed); g.fillStyle = '#fff';
      const TAU = Math.PI * 2, base = x => h - (o.base ?? 8) - R((Math.sin(x / w * TAU * 2 + seed) * .6 + Math.sin(x / w * TAU * 5 + seed * 2) * .4) * (o.roll ?? 5));
      const wrap = (fn, x, by, hh, sd, ex) => { for (const dx of [0, -w, w]) fn(g, x + dx, by, hh, rng(sd), ex); };
      if (kind === 'mountains') {
        const ridge = new Float32Array(w).fill(h), pk = o.peaks || 6;
        for (let i = 0; i < pk; i++) {
          const cx = (o.px ? o.px[i] : (i + r() * .8) / pk) * w, ph = h * ((o.minH ?? .35) + r() * ((o.maxH ?? .9) - (o.minH ?? .35))), sl = .45 + r() * .9, sl2 = sl * (.6 + r() * .8);
          for (let x = 0; x < w; x++) { let dx = x - cx; if (!o.noWrap) { if (dx > w / 2) dx -= w; if (dx < -w / 2) dx += w; } const top = h - ph + Math.abs(dx) * (dx < 0 ? sl : sl2) + Math.sin(x * .21 + i) * 1.5 + Math.sin(x * .057 + i * 3) * 4; if (top < ridge[x]) ridge[x] = top; }
        }
        let j = 0; for (let x = 0; x < w; x++) { j += (r() - .5) * 2.2; j *= .8; g.fillRect(x, R(ridge[x] + j), 1, h); }
        return c;
      }
      if (kind === 'clouds') {
        for (let i = 0; i < (o.n || 7); i++) {
          const cx = r() * w, cy = h * .45 + r() * h * .3, n = 3 + Math.floor(r() * 5), sp = 7 + r() * 5;
          for (const dx of [0, -w, w]) { g.save(); g.beginPath(); g.rect(cx + dx - n * sp, 0, n * sp * 2 + 20, R(cy + 3)); g.clip(); for (let k = 0; k < n; k++) disc(g, cx + dx + (k - n / 2) * sp, cy - r() * 5, 4 + r() * 9); g.restore(); }
        }
        return c;
      }
      if (kind === 'frame') {
        for (let y = 0; y < h; y++) { const tw = 15 + R(Math.max(0, y - h * .55) * .16), cx = 34 + R(Math.sin(y * .025) * 4); g.fillRect(cx - (tw >> 1), y, tw, 1); }
        seg2(g, 38, 70, 150, 34, 5); seg2(g, 120, 46, 220, 30, 3); seg2(g, 36, 128, 112, 98, 3); seg2(g, 100, 102, 140, 96, 2);
        for (let i = 0; i < 46; i++) disc(g, 10 + r() * 230, r() * 50 - 6 + (r() < .3 ? 30 : 0), 7 + r() * 15);
        for (let i = 0; i < 40; i++) { const x = R(40 + r() * 190), y = R(30 + r() * 30); g.fillRect(x, y, 1, R(5 + r() * 26)); }
        return c;
      }
      for (let x = 0; x < w; x++) g.fillRect(x, base(x), 1, h);
      const sr = rng(seed * 31 + 7); let x = Math.floor(r() * 6), i = 0;
      while (x < w) {
        const by = base(x) + 2, hh = R((o.min ?? 14) + r() * ((o.max ?? 34) - (o.min ?? 14))), type = r(), sub = seed * 97 + i++;
        if (kind === 'forest') {
          if (o.blight) wrap(type < (o.pine ?? .5) ? deadPine : deadTree, x, by, hh, sub);
          else wrap(type < (o.pine ?? .5) ? pine : oak, x, by, hh, sub);
        } else if (kind === 'swamp') {
          if (type < .22) wrap(willow, x, by, hh, sub, o.blight); else wrap((gg, xx, b2, _h, rr) => reedClump(gg, xx, b2, rr), x, by, hh, sub);
        } else if (kind === 'frost') {
          if (o.blight) wrap(iceSpike, x, by, R(hh * .8), sub); else wrap(pine, x, by, hh, sub);
        }
        x += R((o.gap ?? 7) * (.6 + r()));
        void sr;
      }
      return c;
    });
  }
  function colorize(m, p) {
    const w = m.width, h = m.height, src = m.getContext('2d').getImageData(0, 0, w, h).data, [c, g] = mkCanvas(w, h), img = g.createImageData(w, h), d = img.data;
    const B = rgb(p.body), RM = rgb(p.rim || p.body), D = rgb(p.base || p.body), S = p.snow ? rgb(p.snow) : null, T = p.tex ? rgb(p.tex) : null;
    const tops = new Int16Array(w).fill(h); for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (src[(y * w + x) * 4 + 3] > 127) { tops[x] = y; break; }
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 127;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!op(x, y)) continue; const i = (y * w + x) * 4;
      let col = mixA(B, D, clamp(y / h) * (p.fade ?? .8));
      if (T && hash(x, y) < (p.texP ?? .07)) col = mixA(col, T, .7);
      const depth = y - tops[x];
      if (S && depth < (p.snowD ?? 4) + hash(x, 3) * 3 && tops[x] < h * (p.snowLine ?? .7)) col = mixA(S, col, depth / ((p.snowD ?? 4) + 5));
      else if (!op(x, y - 1) || (p.rimL && !op(x - 1, y))) col = RM;
      else if (p.rim2 && !op(x, y - 2)) col = mixA(RM, col, .55);
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return c;
  }
  function band(g, cv, ox, y, a = 1) {
    if (a <= 0) return; const w = cv.width; let x = -(((R(ox) % w) + w) % w); g.globalAlpha = Math.min(1, a);
    for (; x < W; x += w) g.drawImage(cv, x, R(y)); g.globalAlpha = 1;
  }
  // Named layer recipes. Each pair (…H healthy / …C corrupt) shares a mask unless the shapes differ on purpose.
  const LAYERS = {
    hillsH: () => colorize(mask('forest', 1024, 96, 5, { base: 34, roll: 12, min: 6, max: 14, gap: 9 }), { body: '#1e3452', rim: '#5a7ca6', base: '#192a44', rim2: 1 }),
    hillsC: () => colorize(mask('forest', 1024, 96, 5, { base: 34, roll: 12, min: 6, max: 14, gap: 9 }), { body: '#1b1a2c', rim: '#403b5c', base: '#141322' }),
    treesH: () => colorize(mask('forest', 1024, 112, 9, { base: 10, roll: 6, min: 20, max: 58, gap: 6 }), { body: '#132a3a', rim: '#4a7f92', base: '#0b1722', tex: '#24485e', rim2: 1 }),
    treesC: () => colorize(mask('forest', 1024, 112, 9, { base: 10, roll: 6, min: 20, max: 58, gap: 6 }), { body: '#14121f', rim: '#41395a', base: '#0a0911', tex: '#26213a' }),
    frameL: () => colorize(mask('frame', 260, 340, 41), { body: '#070a11', rim: '#1d2c42', base: '#04060a', fade: .5, tex: '#0e1522', texP: .1 }),
    cloudsA: () => colorize(mask('clouds', 1024, 80, 12, { n: 8 }), { body: '#242e5a', rim: '#8ea2d8', base: '#1a2148', rim2: 1 }),
    cloudsB: () => colorize(mask('clouds', 1024, 110, 19, { n: 6 }), { body: '#1a2048', rim: '#6c80bc', base: '#121738', rim2: 1 }),
    // regions (far + mid, healthy + corrupt)
    forestFarH: () => colorize(mask('forest', 640, 110, 21, { base: 30, roll: 10, min: 10, max: 22, gap: 6 }), { body: '#1d3a48', rim: '#5d8e9a', base: '#172c3a', rim2: 1 }),
    forestFarC: () => colorize(mask('forest', 640, 110, 21, { base: 30, roll: 10, min: 10, max: 22, gap: 6, blight: 1 }), { body: '#2a1c34', rim: '#6a4d84', base: '#1d1426' }),
    forestMidH: () => colorize(mask('forest', 640, 150, 23, { base: 12, roll: 6, min: 30, max: 70, gap: 8 }), { body: '#12282c', rim: '#4a8678', base: '#0a1619', tex: '#21463f', rim2: 1 }),
    forestMidC: () => colorize(mask('forest', 640, 150, 23, { base: 12, roll: 6, min: 30, max: 70, gap: 8, blight: 1 }), { body: '#170f1f', rim: '#7a52a0', base: '#0d0912', tex: '#2c1d38' }),
    swampFarH: () => colorize(mask('swamp', 640, 90, 31, { base: 24, roll: 4, min: 20, max: 40, gap: 10 }), { body: '#1a3a3c', rim: '#4f8a7e', base: '#132a2c', rim2: 1 }),
    swampFarC: () => colorize(mask('swamp', 640, 90, 31, { base: 24, roll: 4, min: 20, max: 40, gap: 10, blight: 1 }), { body: '#1b2419', rim: '#4d6a34', base: '#121a12' }),
    swampMidH: () => colorize(mask('swamp', 640, 120, 33, { base: 18, roll: 3, min: 40, max: 80, gap: 9 }), { body: '#0f2626', rim: '#4a8a70', base: '#091818', tex: '#1d3d38', rim2: 1 }),
    swampMidC: () => colorize(mask('swamp', 640, 120, 33, { base: 18, roll: 3, min: 40, max: 80, gap: 9, blight: 1 }), { body: '#121a10', rim: '#6a8a3a', base: '#0a0f09', tex: '#24301a' }),
    frostFarH: () => colorize(mask('mountains', 640, 170, 41, { peaks: 8, minH: .3, maxH: .95 }), { body: '#2a3e5e', rim: '#a8c2e2', base: '#1c2a44', snow: '#e8f2ff', snowD: 7, snowLine: .55 }),
    frostFarC: () => colorize(mask('mountains', 640, 170, 41, { peaks: 8, minH: .3, maxH: .95 }), { body: '#1a1d2e', rim: '#55667e', base: '#11131f', snow: '#7d8fab', snowD: 5, snowLine: .55 }),
    frostMidH: () => colorize(mask('frost', 640, 120, 43, { base: 14, roll: 8, min: 24, max: 56, gap: 7 }), { body: '#172840', rim: '#dcecff', base: '#0e1a2c', tex: '#2d4466', rim2: 1 }),
    frostMidC: () => colorize(mask('frost', 640, 120, 43, { base: 14, roll: 8, min: 24, max: 56, gap: 7, blight: 1 }), { body: '#121828', rim: '#86aee0', base: '#0b0f1a', tex: '#25344e' }),
    peakFar: () => colorize(mask('mountains', 1024, 190, 47, { peaks: 9, minH: .3, maxH: .85 }), { body: '#24365a', rim: '#a6c0e6', base: '#17233e', snow: '#eef5ff', snowD: 8, snowLine: .6 })
  };
  const layer = name => cached('L:' + name, LAYERS[name]);
  function groundCanvas(key, top, bot, tuft, tuftL, h = 120) {
    return cached('ground:' + key, () => {
      const [c, g] = mkCanvas(1024, h), A = rgb(top), B = rgb(bot), img = g.createImageData(1024, h), d = img.data, N = 8;
      for (let y = 0; y < h; y++) for (let x = 0; x < 1024; x++) { const k = clamp(R(y / h * N + BAYER[(y & 3) * 4 + (x & 3)] / 16 - .5) / N), col = mixA(A, B, k), i = (y * 1024 + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
      g.putImageData(img, 0, 0); const r = rng(key.length * 13 + 5);
      for (let i = 0; i < 520; i++) { const x = R(r() * 1024), y = R(Math.pow(r(), .8) * h), s = 1 + y / h * 2.5; g.fillStyle = r() < .5 ? tuft : tuftL; g.fillRect(x, y - R(s), 1, R(s)); if (s > 2) g.fillRect(x + 1, y - R(s) + 1, 1, R(s) - 1); }
      return c;
    });
  }
  function mistCanvas(col) {
    return cached('mist:' + col, () => {
      const [c, g] = mkCanvas(1024, 56), r = rng(3); g.imageSmoothingEnabled = true;
      for (let i = 0; i < 64; i++) {
        const x = r() * 1024, y = 18 + r() * 20, rx = 40 + r() * 90, ry = 6 + r() * 9;
        for (const ox of [-1024, 0, 1024]) { g.save(); g.translate(x + ox, y); g.scale(rx / ry, 1); const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry); gr.addColorStop(0, rgba(col, .2)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ry, 0, 7); g.fill(); g.restore(); }
      }
      return c;
    });
  }
  function mist(g, y, col, a, ox) { band(g, mistCanvas(col), ox, y - 28, a); }

  // ───────────────────────────── particles ─────────────────────────────
  const MOTES = (() => { const r = rng(99); return Array.from({ length: 80 }, () => ({ x: r() * 600, y: r(), ax: 4 + r() * 14, ay: 3 + r() * 8, f1: .3 + r() * .7, f2: .4 + r() * .8, ph: r() * 6.3, fb: 1 + r() * 2.2, z: r(), dx: (r() - .4) * 5 })); })();
  function fireflies(g, t, o) {
    const n = Math.min(MOTES.length, o.n || 24), col = o.col || '#c8ff8a', core = o.core || '#f4ffd2';
    for (let i = 0; i < n; i++) {
      const f = MOTES[i], x = (((f.x + t * f.dx + Math.sin(t * f.f1 + f.ph) * f.ax - (o.ox || 0) * (.6 + f.z * .6)) % 600) + 600) % 600 - 44;
      const y = lerp(o.y0, o.y1, f.y) + Math.cos(t * f.f2 + f.ph) * f.ay, bl = Math.pow(.5 + .5 * Math.sin(t * f.fb + f.ph * 3), 2), al = (o.a ?? 1) * (.2 + .8 * bl);
      glow(g, x, y, 5 + f.z * 6, col, al * .5); g.globalAlpha = Math.min(1, al); g.fillStyle = core; const s = f.z > .65 ? 2 : 1; g.fillRect(R(x), R(y), s, s);
    }
    g.globalAlpha = 1;
  }
  function pollen(g, t, o) {
    const n = o.n || 30;
    for (let i = 0; i < n; i++) {
      const f = MOTES[(i * 7 + 3) % MOTES.length], x = (((f.x * .9 + t * (4 + f.z * 6) + Math.sin(t * f.f1 + f.ph) * 6 - (o.ox || 0)) % 560) + 560) % 560 - 24;
      const y = ((lerp(o.y1, o.y0, f.y) - t * (2 + f.z * 4) + Math.cos(t * f.f2) * 3) % (o.y1 - o.y0 + 20) + (o.y1 - o.y0 + 20)) % (o.y1 - o.y0 + 20) + o.y0 - 10;
      g.globalAlpha = (o.a ?? 1) * (.25 + f.z * .45); g.fillStyle = o.col || '#ffeab0'; g.fillRect(R(x), R(y), 1, 1);
    }
    g.globalAlpha = 1;
  }
  function snowfall(g, t, a, wind = 30, n = 90) {
    g.fillStyle = '#eef4ff';
    for (let i = 0; i < n; i++) { const f = MOTES[i % MOTES.length], sp = 18 + f.z * 30; const x = (((f.x + i * 37 + t * wind * (.5 + f.z)) % 560) + 560) % 560 - 24, y = (((f.y * 340 + i * 13 + t * sp) % 340) + 340) % 340 - 10; g.globalAlpha = a * (.35 + f.z * .6); g.fillRect(R(x), R(y), f.z > .7 ? 2 : 1, f.z > .7 ? 2 : 1); }
    g.globalAlpha = 1;
  }
  function spores(g, t, a, col, n = 40) {
    for (let i = 0; i < n; i++) { const f = MOTES[(i * 3) % MOTES.length]; const x = (((f.x + Math.sin(t * f.f1 + f.ph) * 10) % 540) + 540) % 540 - 14, y = (((f.y * 340 - t * (6 + f.z * 10)) % 340) + 340) % 340; glow(g, x, y, 3 + f.z * 3, col, a * .35); g.globalAlpha = a * (.3 + f.z * .5); g.fillStyle = col; g.fillRect(R(x), R(y), 1, 1); }
    g.globalAlpha = 1;
  }
  // A lunar fragment: a small diamond shard of moonlight.
  function shard(g, x, y, sc, a, t, big) {
    if (a <= 0) return; x = R(x); y = R(y);
    glow(g, x, y, (big ? 26 : 12) * sc + Math.sin(t * 7) * 2, '#8fe8ff', .75 * a); glow(g, x, y, 4 * sc, '#ffffff', .6 * a);
    g.globalAlpha = Math.min(1, a); g.fillStyle = '#9fe9ff';
    for (const [dx, dy, w] of [[0, -3, 1], [-1, -2, 3], [-1, -1, 3], [-2, 0, 5], [-1, 1, 3], [-1, 2, 3], [0, 3, 1]]) g.fillRect(x + dx * sc, y + dy * sc, w * sc, sc);
    g.fillStyle = '#ffffff'; g.fillRect(x, y - sc, sc, sc * 2);
    const s = 3 + R(2 * (.5 + .5 * Math.sin(t * 5))); g.globalAlpha = .6 * a; g.fillRect(x - s * sc, y, (s * 2 + 1) * sc, 1); g.fillRect(x, y - s * sc - sc, 1, (s * 2 + 2) * sc);
    g.globalAlpha = 1;
  }
  function trail(g, pts, a, col = '#bff3ff') {
    for (let i = 0; i < pts.length; i++) { const k = 1 - i / pts.length, [x, y] = pts[i]; g.globalAlpha = a * k * .8; g.fillStyle = i % 3 ? col : '#ffffff'; g.fillRect(R(x), R(y), k > .6 ? 2 : 1, k > .6 ? 2 : 1); }
    g.globalAlpha = 1;
  }

  // ───────────────────────────── set pieces ─────────────────────────────
  const crescentPix = (r1, r2, ox, oy) => cached(`cres:${r1},${r2},${ox},${oy}`, () => {
    const out = [], n = Math.ceil(r1);
    for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) {
      const a = x * x + y * y <= r1 * r1, b = (x - ox) ** 2 + (y - oy) ** 2 <= r2 * r2; if (!a || b) continue;
      const outer = (x * x + y * y) > (r1 - 1.2) ** 2, inner = (x - ox) ** 2 + (y - oy) ** 2 <= (r2 + 1.2) ** 2;
      out.push([x, y, outer ? 0 : inner ? 3 : (x + y < -r1 * .5 ? 2 : 1)]);
    }
    return out;
  });
  // The Moonwell: stone basin, arch with crescent ornament, glowing water and a beam of light.
  function moonwell(g, X, Y, sc, st) {
    const P = pen(g, X, Y, sc), gl = clamp(st.glow ?? 0), bl = clamp(st.blaze || 0), t = st.t || 0, crack = st.crack || 0, ov = clamp(st.over || 0);
    const sD = '#262c3b', s0 = '#46506a', sL = '#66738f', sT = '#8a97b2', sH = '#a9b6cf';
    g.globalAlpha = .38; P.ell(0, 1, 40, 6, '#04060a'); g.globalAlpha = 1;
    for (const px of [-31, 26]) {
      P.r(px, -60, 5, 48, s0); P.r(px, -60, 1, 48, sL); P.r(px + 4, -60, 1, 48, sD);
      for (let y = -55; y < -12; y += 7) P.r(px, y, 5, 1, sD);
      P.r(px - 1, -63, 7, 3, sT); P.r(px - 1, -14, 7, 3, sD);
      if (ov > 0) for (let k = 0; k < 9 * ov; k++) P.r(px + R(hash(px, k) * 6) - 1, -58 + R(hash(k, px) * 44), 2, 2, k % 2 ? '#2b4433' : '#3c5e44');
    }
    for (let ax = -32; ax <= 32; ax++) { const ay = R(-61 - Math.sqrt(Math.max(0, 32 * 32 - ax * ax)) * .36); P.r(ax, ay - 1, 1, 4, (ax + 40) % 8 === 0 ? sD : (ay < -70 ? sT : sL)); P.r(ax, ay + 3, 1, 1, sD); }
    const cg = clamp(gl * (1 - crack * .8) + bl);
    for (const [x, y, k] of crescentPix(5, 4.2, 2, -1.5)) P.r(x, -80 + y, 1, 1, mix(['#2a3142', '#5d6a86', '#76849f', '#8794b0'][k], ['#9fdfff', '#e6fbff', '#ffffff', '#c9f4ff'][k], cg));
    glow(g, X, Y - 80 * sc, 14 * sc, '#9fe8ff', .55 * cg);
    // basin top surface, inner lip, water
    P.ell(0, -16, 30, 9, sT); P.ell(0, -16, 30, 9 - 1, sT); P.r(-30, -16, 1, 1, sH);
    P.ell(0, -15.5, 26.5, 7, sD);
    const water = mix(mix('#0f1828', '#55bfe8', gl), '#eafcff', bl);
    P.ell(0, -15, 25, 6, water);
    P.ell(-4, -16, 13, 2.4, mix(water, '#e6fbff', .35 * gl + .5 * bl));
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; P.r(R(Math.cos(a) * 28), R(-16 + Math.sin(a) * 8), 1, 1, sL); }
    if (gl > .05 && !st.still) for (let k = 0; k < 3; k++) { const ph = (t * .45 + k / 3) % 1, rr = 3 + ph * 21; g.globalAlpha = (1 - ph) * gl * .5; P.ring(0, -15, rr, rr * .24, '#dff8ff'); g.globalAlpha = 1; }
    // front wall
    for (let x = -30; x <= 30; x++) {
      const ye = -16 + R(9 * Math.sqrt(1 - (x / 30) ** 2));
      for (let y = ye + 1; y <= ye + 14; y++) {
        const row = Math.floor((y - ye - 1) / 4), bx = (x + 30 + (row % 2) * 4) % 8, mortar = (y - ye - 1) % 4 === 3 || bx === 0;
        let c = mortar ? sD : x < -18 ? sL : x > 16 ? '#3a4358' : s0;
        if (!mortar && hash(x, y) < .06) c = sT;
        if (ov > 0 && y > ye + 9 && hash(x * 3, y) < ov * .55) c = hash(x, y * 5) < .5 ? '#2b4433' : '#3c5e44';
        P.r(x, y, 1, 1, c);
      }
    }
    const rc = mix(sD, '#a8f4ff', clamp(gl * 1.1 + bl));
    [[-19, 0], [-10, 1], [0, 2], [9, 1], [18, 0]].forEach(([rx, k], i) => {
      const ye = -16 + R(9 * Math.sqrt(1 - (rx / 30) ** 2)) + 5, glyph = [[[0, 0], [1, 1], [0, 2], [1, 3]], [[0, 0], [2, 0], [1, 1], [1, 2], [1, 3]], [[1, 0], [0, 1], [2, 1], [1, 2], [0, 3], [2, 3]]][k];
      glyph.forEach(([gx, gy]) => P.r(rx - 1 + gx, ye + gy, 1, 1, rc)); if (gl > .3) glow(g, X + rx * sc, Y + (ye + 2) * sc, 6 * sc, '#8fefff', .25 * gl);
    });
    P.r(-30, -16, 1, 1, sH);
    // light
    glow(g, X, Y - 16 * sc, (16 + 26 * gl + 70 * bl) * sc, '#79dcff', .5 * gl + .5 * bl);
    if ((gl > .02 || bl > 0) && st.beam !== false) {
      const bw = R((5 + 8 * gl + bl * 30) * sc), top = Y - 16 * sc;
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createLinearGradient(0, top, 0, Math.max(-40, top - 360 * sc)); gr.addColorStop(0, rgba('#9fe9ff', .5 * gl + .4 * bl)); gr.addColorStop(.35, rgba('#7fc8ff', .16 * gl + .25 * bl)); gr.addColorStop(1, rgba('#7fc8ff', 0));
      g.fillStyle = gr; g.fillRect(R(X - bw / 2), 0, bw, top); g.fillRect(R(X - bw / 6), 0, Math.max(1, R(bw / 3)), top);
      g.restore();
    }
    if (gl > .15 && !st.still) for (let i = 0; i < 12; i++) {
      const ph = (t * .32 + i * .137) % 1, x = X + Math.sin(i * 7.3 + t * .8) * 16 * sc * (1 - ph * .5), y = Y - 16 * sc - ph * 80 * sc;
      g.globalAlpha = gl * (1 - ph) * .9; g.fillStyle = '#d8faff'; g.fillRect(R(x), R(y), sc > 1 ? 2 : 1, sc > 1 ? 2 : 1);
    }
    g.globalAlpha = 1;
  }
  // A cottage (3/4 front view). lit: number or [left,right] window light; over: overgrowth 0..1.
  function cottage(g, X, Y, sc, o = {}) {
    const P = pen(g, X, Y, sc), lw = Array.isArray(o.lit) ? o.lit : [o.lit || 0, o.lit || 0], ov = clamp(o.over || 0), t = o.t || 0;
    const wall = '#565a70', wallL = '#6e7290', wallD = '#3b3d50', beam = '#2b2634', roof = '#3d3449', roofL = '#5c4f6c', roofD = '#251f2e';
    g.globalAlpha = .4; P.ell(0, 1, 38, 4, '#04060a'); g.globalAlpha = 1;
    P.r(13, -63, 7, 18, '#4a4d60'); P.r(13, -63, 1, 18, '#62667e'); P.r(12, -65, 9, 3, '#5d6076');
    P.r(-26, -28, 52, 28, wall); P.r(-26, -28, 3, 28, wallL); P.r(23, -28, 3, 28, wallD);
    for (let y = -26; y < -3; y += 5) for (let x = -24 + ((y / 5) & 1) * 3; x < 23; x += 7) if (hash(x, y) < .35) P.r(x, y, 3, 1, wallD);
    P.r(-26, -28, 52, 2, beam); P.r(-26, -16, 52, 1, beam);
    for (let x = -26; x < 26; x += 5) P.r(x, -3, 4, 3, (x / 5) & 1 ? '#45485c' : '#505469');
    for (let y = -53; y <= -26; y++) { const hw = R(17 + (y + 53) * (15 / 27)); P.r(-hw, y, hw * 2, 1, (y + 53) % 4 === 3 ? roofD : roof); for (let x = -hw + ((y & 4) ? 2 : 0); x < hw - 2; x += 6) if ((y + 53) % 4 === 1) P.r(x, y, 3, 1, roofL); }
    P.r(-17, -54, 34, 2, roofL); P.r(-33, -26, 66, 1, roofD); P.r(-32, -25, 64, 1, '#1a1620');
    if (ov > .2) for (let k = 0; k < 26 * ov; k++) P.r(R(-28 + hash(k, 9) * 56), R(-50 + hash(9, k) * 22), 2, 1, k % 2 ? '#34503c' : '#46694c');
    P.r(-5, -18, 10, 18, '#2a1e1a'); P.r(-4, -17, 8, 17, '#4a3326'); P.r(-4, -17, 8, 1, '#5d4232'); P.r(-1, -16, 1, 16, '#3b291f'); P.r(2, -9, 1, 1, '#d4ad55');
    [[-19, 0], [11, 1]].forEach(([wx, i]) => {
      const l = clamp(lw[i]); P.r(wx - 1, -23, 10, 10, '#211b27');
      P.r(wx, -22, 8, 8, mix('#141a28', '#ffbf5c', l)); P.r(wx, -22, 3, 3, mix('#1d2436', '#fff0b4', l)); P.r(wx + 5, -18, 3, 3, mix('#1d2436', '#ffe08a', l));
      P.r(wx + 3, -22, 2, 8, '#211b27'); P.r(wx, -19, 8, 2, '#211b27'); P.r(wx - 2, -13, 12, 2, '#4b4258');
      if (o.flowers) for (let k = 0; k < 4; k++) P.r(wx - 1 + k * 3, -14, 2, 1, ['#e88aa8', '#f2d27a', '#9ad0ff', '#f0a0c0'][k]);
      if (l > 0) { glow(g, X + (wx + 4) * sc, Y - 18 * sc, 24 * sc, '#ffad46', .5 * l); g.globalAlpha = .14 * l; for (let y = 1; y < 9; y++) P.r(wx - 2 - y, y, 12 + y * 2, 1, '#ffcf73'); g.globalAlpha = 1; }
      if (o.board === i && l < .5) { P.line(wx - 1, -21, wx + 8, -15, '#6a5240', 1); P.line(wx - 1, -15, wx + 8, -21, '#5a4434', 1); }
    });
    if (ov > 0) for (let k = 0; k < 70 * ov; k++) { const x = R(-27 + hash(k, 3) * 54), y = R(-2 - Math.pow(hash(3, k), 1.6) * 26 * ov); if (Math.abs(x) < 6 && y > -18) continue; P.r(x, y, 2, 2, k % 3 ? '#2a4530' : '#3f6a48'); }
    if (o.lantern) { P.r(8, -21, 2, 3, mix('#3a3040', '#ffd27a', o.lantern)); glow(g, X + 9 * sc, Y - 19 * sc, 9 * sc, '#ffb24a', .6 * o.lantern); }
    if (o.smoke) for (let k = 0; k < 7; k++) { const ph = (t * .22 + k / 7) % 1; g.globalAlpha = (1 - ph) * .28 * o.smoke * Math.min(1, ph * 5); P.disc(16 + Math.sin(ph * 5 + k) * 2 + ph * 12, -68 - ph * 44, 1.5 + ph * 4, '#9a9fb8'); }
    g.globalAlpha = 1;
  }
  // A row-planted crop patch. health 0 (withered) … 1 (lush, glowing moonbuds).
  function crops(g, X, Y, sc, o) {
    const P = pen(g, X, Y, sc), h0 = clamp(o.health ?? 1), t = o.t || 0, rows = o.rows || 4, cols = o.cols || 9;
    for (let r = 0; r < rows; r++) {
      const ry = r * 7, rx = r * 5; P.r(rx - 4, ry + 1, cols * 8 + 2, 2, '#231c22'); P.r(rx - 4, ry, cols * 8 + 2, 1, '#3a2f36');
      for (let c = 0; c < cols; c++) {
        const hh = clamp(h0 + (o.wave ? o.wave(c, r) : 0)), x = rx + c * 8, y = ry, h = R(3 + 6 * hh), sway = hh > .5 && !o.still ? R(Math.sin(t * 1.6 + c * .7 + r) * .6) : 0;
        const stem = mix('#5e4e34', '#3f8150', hh), leaf = mix('#6e5a3e', '#58a862', hh), leafL = mix('#7e6a4a', '#9be08c', hh);
        P.r(x, y - h, 1, h, stem);
        for (let k = 2; k < h; k += 3) {
          if (hh > .45) { P.r(x - 2 + sway, y - k - 1, 2, 1, leaf); P.r(x + 1 + sway, y - k, 2, 1, leafL); }
          else { P.r(x - 2, y - k + 1, 2, 1, leaf); P.r(x + 1, y - k + 2, 1, 2, leaf); }
        }
        if (hh < .35) P.r(x + 1, y - h, 1, 1, stem);
        if (hh > .55) { const b = (hh - .55) / .45; P.r(x - 1 + sway, y - h - 2, 3, 2, mix('#7aa07a', '#eef8ff', b)); P.r(x + sway, y - h - 3, 1, 1, mix('#7aa07a', '#ffffff', b)); if (o.glow !== false) glow(g, X + (x + sway) * sc, Y + (y - h - 2) * sc, 4 * sc, '#bfeaff', .4 * b); }
      }
    }
  }
  function brambles(g, X, Y, sc, o) {
    const P = pen(g, X, Y, sc), gr = clamp(o.grow ?? 1), n = o.n || 4, len = o.len || 80;
    for (let k = 0; k < n; k++) {
      const steps = R(len * gr), y0 = (k - n / 2) * 4;
      for (let i = 0; i < steps; i++) {
        const x = i, y = y0 + Math.sin(i * .12 + k * 2) * 4 + Math.sin(i * .31 + k) * 1.5;
        P.r(x, y, 1, 2, k % 2 ? '#3a2a40' : '#4a3650');
        if (i % 7 === k % 3) P.r(x, y - 1, 1, 1, '#6a4a70');
        if (i % 13 === 5) P.r(x + 1, y + 2, 2, 1, '#2c3a2c');
        if (i % 23 === 11 && o.berries) P.r(x, y - 2, 1, 1, '#9a4a8a');
      }
    }
  }
  function dirtPath(g, pts, col = '#2e2a36', edge = '#3d3846') {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, w0] = pts[i], [x1, y1, w1] = pts[i + 1];
      for (let y = R(y0); y <= R(y1); y++) { const t = (y - y0) / ((y1 - y0) || 1), x = lerp(x0, x1, t), w = lerp(w0, w1, t); g.fillStyle = col; g.fillRect(R(x - w / 2), y, R(w), 1); g.fillStyle = edge; g.fillRect(R(x - w / 2), y, 1, 1); g.fillRect(R(x + w / 2) - 1, y, 1, 1); }
    }
  }
  function lanternPost(g, x, y, sc, lit, t) {
    const P = pen(g, x, y, sc); P.r(0, -18, 1, 18, '#2a2230'); P.r(0, -18, 4, 1, '#2a2230'); P.r(3, -17, 1, 2, '#2a2230');
    P.r(2, -15, 3, 4, mix('#2c2a36', '#ffd27a', lit)); P.r(2, -16, 3, 1, '#1d1822');
    glow(g, x + 3 * sc, y - 13 * sc, (12 + Math.sin(t * 3 + x) * 1.2) * sc, '#ffb54a', .7 * lit);
  }

  // ───────────────────────────── characters ─────────────────────────────
  const AROW = { idle: 0, walk: 8, hover: 16, fly: 24, mount: 32, bank_left: 40, bank_right: 48, cast: 56 };
  const DIR8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const IMGS = {};
  function img(key, src) { let im = IMGS[key]; if (!im) { im = IMGS[key] = new Image(); im.src = src; } return im.complete && im.naturalWidth ? im : null; }
  function atlasStyle() { try { if (typeof chosenLook !== 'undefined' && chosenLook && ATLAS_DATA[chosenLook.style]) return chosenLook.style; } catch (e) { /* not ready */ } return 'feminine'; }
  function atlas() { try { if (typeof ATLAS_DATA === 'undefined' || !ATLAS_DATA) return null; const s = atlasStyle(); return ATLAS_DATA[s] ? img('atlas:' + s, ATLAS_DATA[s]) : null; } catch (e) { return null; } }
  const CAST = ['keeper', 'skeleton', 'skeleton_ally', 'blight', 'ghost', 'spirit', 'slime', 'ice', 'golem', 'wisp', 'cat', 'raven', 'little_golem', 'dummy'];
  function castPage(i) { try { if (typeof CAST_PAGE_DATA === 'undefined' || !CAST_PAGE_DATA[i]) return null; return img('cast:' + i, CAST_PAGE_DATA[i]); } catch (e) { return null; } }
  function witch(g, x, y, sc, anim, dir, frame, a = 1) {
    if (a <= 0) return; const im = atlas(); x = R(x); y = R(y); g.globalAlpha = Math.min(1, a);
    if (im) g.drawImage(im, (frame & 7) * 48, ((AROW[anim] ?? 0) + Math.max(0, DIR8.indexOf(dir))) * 56, 48, 56, x - 24 * sc, y - 49 * sc, 48 * sc, 56 * sc);
    else {
      const P = pen(g, x, y, sc), fly = anim === 'fly' || anim === 'hover', bob = fly ? -10 : 0;
      if (fly) { P.r(-12, -11, 22, 1, '#6a4a30'); P.r(-16, -13, 5, 4, '#b8a070'); }
      P.r(-4, -17 + bob + 10 * !fly, 8, 10, '#3a3946'); P.r(-3, -21 + bob + 10 * !fly, 6, 4, '#e7b89c');
      for (let i = 0; i < 7; i++) P.r(-i * .9, -22 - 7 + i + bob + 10 * !fly, i * 1.8 + 1, 1, '#2b2a36'); P.r(-6, -22 + bob + 10 * !fly, 12, 1, '#2b2a36');
    }
    g.globalAlpha = 1;
  }
  function castSprite(g, kind, x, y, sc, dir, moving, frame, a = 1) {
    const k = CAST.indexOf(kind), im = k < 0 ? null : castPage(Math.floor(k / 7)); if (!im || a <= 0) return false;
    g.globalAlpha = Math.min(1, a); g.drawImage(im, (frame & 7) * 48, ((k % 7) * 16 + (moving ? 8 : 0) + Math.max(0, DIR8.indexOf(dir))) * 56, 48, 56, R(x) - 24 * sc, R(y) - 49 * sc, 48 * sc, 56 * sc); g.globalAlpha = 1; return true;
  }
  function villager(g, x, y, sc, dir, moving, frame, lantern, t) {
    if (!castSprite(g, 'keeper', x, y, sc, dir, moving, frame)) { const P = pen(g, x, y, sc); P.r(-4, -18, 8, 14, '#3d4a3e'); P.r(-3, -24, 6, 6, '#d9a98a'); P.r(-5, -26, 10, 2, '#5a4a32'); P.r(-3, -4, 2, 4, '#2a2420'); P.r(1, -4, 2, 4, '#2a2420'); }
    if (lantern > 0) { const lx = x + 9 * sc, ly = y - 18 * sc + Math.sin(t * 4 + x) * sc; g.fillStyle = '#2a2230'; g.fillRect(R(lx), R(ly - 3 * sc), sc, 3 * sc); g.fillStyle = mix('#3a3040', '#ffd27a', lantern); g.fillRect(R(lx - sc), R(ly), 3 * sc, 3 * sc); glow(g, lx, ly + sc, 14 * sc, '#ffb24a', .65 * lantern); }
  }
  // The keepsake: grandmother's silver crescent-moon charm, in close-up.
  function charm(g, X, Y, sc, gl, t, chain = true) {
    const P = pen(g, X, Y, sc), ramp = ['#3a4252', '#9aa4b6', '#d4dbe6', '#f4f7fc'];
    if (chain) for (let i = 1; i < 40; i++) { const y = -12 - i * 2; P.r(i % 2 ? -1 : 0, y, i % 2 ? 2 : 1, 2, i % 2 ? '#8b94a6' : '#c4cbd8'); }
    glow(g, X, Y, (40 + 22 * gl) * sc / 3, '#bfe6ff', .28 + .45 * gl);
    P.ring(0, -12, 2, 2, '#c4cbd8');
    for (const [x, y, k] of crescentPix(11, 9.2, 5, -3)) P.r(x, y, 1, 1, ramp[k]);
    for (const [x, y] of [[-8, -3], [-7, -6], [-9, 1]]) P.r(x, y, 1, 1, '#ffffff');
    P.r(-5, 4, 1, 1, mix('#7fa8d8', '#e8fbff', gl)); glow(g, X - 5 * sc, Y + 4 * sc, 6 * sc, '#9fe9ff', .6 * gl);
    const tw = .5 + .5 * Math.sin(t * 2.2), gx = X - 9 * sc, gy = Y - 4 * sc; g.globalAlpha = (.4 + .6 * gl) * tw; g.fillStyle = '#ffffff';
    g.fillRect(R(gx - 5 * sc), R(gy), 11 * sc, Math.max(1, sc >> 1)); g.fillRect(R(gx), R(gy - 5 * sc), Math.max(1, sc >> 1), 11 * sc); g.globalAlpha = 1;
  }
  function seedCase(g, X, Y, sc, t, sprout) {
    const P = pen(g, X, Y, sc);
    g.globalAlpha = .45; P.ell(0, 1, 18, 2, '#020306'); g.globalAlpha = 1;
    P.r(-15, -14, 30, 14, '#6b4630'); P.r(-15, -14, 30, 1, '#8a5c3c'); P.r(-15, -1, 30, 1, '#3a251a'); P.r(-15, -14, 1, 14, '#7c5238'); P.r(14, -14, 1, 14, '#4a2f20');
    for (let x = -12; x < 14; x += 5) P.r(x, -11, 3, 1, '#5d3c28');
    P.r(-16, -20, 32, 6, '#5a3a28'); P.r(-16, -20, 32, 1, '#7d5236'); P.r(-16, -15, 32, 1, '#3a251a');
    P.r(-8, -21, 2, 22, '#3b2a24'); P.r(7, -21, 2, 22, '#3b2a24');
    P.r(-2, -16, 4, 4, '#c9a24a'); P.r(-1, -15, 2, 2, '#f0d27a'); P.r(-1, -16, 1, 1, '#fff2c0');
    P.r(-5, -9, 1, 4, '#3e2a1e'); P.r(-6, -8, 3, 1, '#3e2a1e'); P.r(-4, -7, 1, 1, '#3e2a1e');
    if (sprout) { const s = R(Math.sin(t * 1.5) * .6); P.r(10, -24, 1, 4, '#4f9a5a'); P.r(8 + s, -26, 2, 2, '#7fd08a'); P.r(11 + s, -27, 2, 2, '#9be6a0'); glow(g, X + 10 * sc, Y - 25 * sc, 6 * sc, '#b8ffb0', .3 * sprout); }
  }
  // Bosses: procedural silhouettes (low-res path art, thresholded to hard pixels) with a separate rim-light layer.
  const BOSS = {
    forest: { k: .8, w: 110, h: 140, body: '#110b17', tex: '#2a1c35', rim: '#c79cff', eye: '#ffcf5a', eyes: [[49, 42], [60, 42]], heart: [55, 84], draw(g) {
      g.lineWidth = 5; [[50, 128, 20, 139], [60, 128, 92, 139], [55, 128, 57, 139], [44, 126, 30, 134], [66, 126, 80, 135]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); });
      g.beginPath(); g.moveTo(38, 132); g.lineTo(72, 132); g.lineTo(70, 100); g.quadraticCurveTo(80, 74, 75, 58); g.lineTo(35, 58); g.quadraticCurveTo(30, 74, 40, 100); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(55, 58, 27, 9, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(55, 41, 12, 15, 0, 0, 7); g.fill();
      const r = rng(11), br = (x, y, a, len, w, d) => { const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.stroke(); if (d > 0) { br(x1, y1, a - .35 - r() * .3, len * .7, Math.max(1.5, w * .72), d - 1); br(x1, y1, a + .3 + r() * .3, len * .62, Math.max(1.5, w * .72), d - 1); } };
      br(48, 31, -2.05, 16, 4, 3); br(62, 31, -1.1, 16, 4, 3);
      g.lineWidth = 8; g.beginPath(); g.moveTo(34, 60); g.quadraticCurveTo(12, 80, 16, 112); g.stroke(); g.beginPath(); g.moveTo(76, 60); g.quadraticCurveTo(98, 80, 94, 112); g.stroke();
      g.lineWidth = 2.5; [[16, 112, 7, 125], [16, 112, 14, 128], [16, 112, 22, 126], [94, 112, 103, 125], [94, 112, 96, 128], [94, 112, 88, 126]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); });
      g.lineWidth = 2; for (let i = 0; i < 10; i++) { const t = i / 10, ax = lerp(30, 17, t), ay = lerp(64, 110, t); g.beginPath(); g.moveTo(ax - 3, ay); g.lineTo(ax - 8, ay - 4); g.stroke(); g.beginPath(); g.moveTo(110 - ax + 3, ay); g.lineTo(110 - ax + 8, ay - 4); g.stroke(); }
    } },
    swamp: { k: .9, w: 150, h: 112, body: '#0a1510', tex: '#1d3526', rim: '#a6e48c', eye: '#e6ff7a', eyes: [[55, 66], [65, 61], [76, 66], [62, 73]], heart: [127, 19], draw(g) {
      g.beginPath(); g.ellipse(72, 92, 60, 26, 0, 0, 7); g.fill();
      [[42, 76, 17], [70, 66, 23], [100, 77, 16], [56, 70, 14]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
      g.lineWidth = 4; g.beginPath(); g.moveTo(84, 54); g.quadraticCurveTo(100, 0, 125, 15); g.stroke();
      g.beginPath(); g.ellipse(127, 19, 5, 6, 0, 0, 7); g.fill();
      g.lineWidth = 6; [[22, 98, 4, 110], [120, 98, 146, 110]].forEach(([a, b, c, d]) => { g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo((a + c) / 2, b - 8, c, d); g.stroke(); });
      g.lineWidth = 1.6; for (let i = 0; i < 14; i++) { const x = 34 + i * 6, y = 62 + Math.abs(i - 6) * 2.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (i % 3 - 1), y + 14 + (i * 7) % 12); g.stroke(); }
    } },
    frost: { k: .95, w: 156, h: 132, body: '#0d1626', tex: '#2a3c5a', rim: '#dcf2ff', eye: '#bff6ff', eyes: [[47, 27], [55, 26]], heart: [84, 101], draw(g) {
      const st = (pts, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) g.lineTo(...pts[i]); g.stroke(); };
      // tattered wing
      g.beginPath(); [[98, 82], [118, 34], [144, 8], [150, 40], [140, 38], [146, 62], [132, 58], [134, 80], [120, 74], [116, 92]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out'; [[130, 40, 4], [138, 54, 3], [124, 64, 3]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }); g.globalCompositeOperation = 'source-over';
      st([[98, 82], [118, 34], [144, 8]], 3);
      // spine, neck and tail
      st([[124, 112], [138, 116], [154, 126]], 5); st([[124, 110], [100, 92], [84, 88], [74, 74], [68, 54], [66, 38]], 9); st([[70, 60], [64, 40], [62, 30]], 7);
      // ribs (hollow cage)
      for (let i = 0; i < 6; i++) { const x = 72 + i * 9; st([[x + 4, 90 - i * .5], [x - 4, 102], [x - 2, 116]], 3); }
      st([[66, 114], [124, 114]], 3);
      // legs
      st([[74, 108], [64, 124], [56, 130]], 7); st([[112, 110], [118, 124], [126, 130]], 7); st([[56, 130], [48, 131]], 3); st([[126, 130], [134, 131]], 3);
      // skull, jaw, horns
      g.beginPath(); [[70, 20], [56, 16], [38, 22], [28, 30], [44, 33], [60, 34], [72, 30]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
      g.beginPath(); [[56, 33], [34, 42], [30, 40], [48, 34]].forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
      st([[64, 18], [78, 6], [90, 4]], 3); st([[60, 16], [70, 2]], 2.5); st([[36, 33], [36, 37]], 2); st([[42, 34], [42, 38]], 2);
      // icicle shards along the spine
      for (let i = 0; i < 5; i++) { const x = 86 + i * 8; g.beginPath(); g.moveTo(x - 3, 90 + i * 2); g.lineTo(x, 78 + i * 2); g.lineTo(x + 3, 90 + i * 2); g.fill(); }
    } }
  };
  function bossArt(kind) {
    return cached('boss:' + kind, () => {
      const b0 = BOSS[kind], k = b0.k || 1, b = Object.assign({}, b0, { w: Math.ceil(b0.w * k), h: Math.ceil(b0.h * k), eyes: b0.eyes.map(([x, y]) => [R(x * k), R(y * k)]), heart: b0.heart.map(v => R(v * k)) }), [c, g] = mkCanvas(b.w, b.h, true); g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = 'round'; g.scale(k, k); b0.draw(g);
      const src = g.getImageData(0, 0, b.w, b.h).data, op = (x, y) => x >= 0 && y >= 0 && x < b.w && y < b.h && src[(y * b.w + x) * 4 + 3] > 110;
      const [bc, bg] = mkCanvas(b.w, b.h), [rc, rg] = mkCanvas(b.w, b.h), bi = bg.createImageData(b.w, b.h), ri = rg.createImageData(b.w, b.h);
      const B = rgb(b.body), T = rgb(b.tex), RM = rgb(b.rim);
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        if (!op(x, y)) continue; const i = (y * b.w + x) * 4, col = hash(x >> 1, y >> 2) < .05 ? T : B;
        bi.data[i] = col[0]; bi.data[i + 1] = col[1]; bi.data[i + 2] = col[2]; bi.data[i + 3] = 255;
        const e1 = !op(x, y - 1) || !op(x - 1, y), e2 = !op(x, y - 2) || !op(x - 2, y);
        if (e1 || e2) { const k = e1 ? 1 : .45; ri.data[i] = RM[0]; ri.data[i + 1] = RM[1]; ri.data[i + 2] = RM[2]; ri.data[i + 3] = 255 * k; }
      }
      bg.putImageData(bi, 0, 0); rg.putImageData(ri, 0, 0); return { body: bc, rim: rc, b };
    });
  }
  function boss(g, kind, X, Y, sc, o) {
    const art = bossArt(kind), b = art.b, x0 = R(X - b.w * sc / 2), y0 = R(Y - b.h * sc + (o.bob || 0) * sc);
    g.globalAlpha = clamp(o.body ?? 1); g.drawImage(art.body, x0, y0, b.w * sc, b.h * sc);
    g.globalAlpha = clamp(o.rim || 0); g.drawImage(art.rim, x0, y0, b.w * sc, b.h * sc); g.globalAlpha = 1;
    if (o.heart > 0) { const [hx, hy] = b.heart; shard(g, x0 + hx * sc, y0 + hy * sc, sc > 1 ? 2 : 1, o.heart, o.t, true); }
    if (o.eyes > 0) for (const [ex, ey] of b.eyes) { const x = x0 + ex * sc, y = y0 + ey * sc; glow(g, x, y, 11 * sc, b.eye, .7 * o.eyes); g.globalAlpha = o.eyes; g.fillStyle = '#ffffff'; g.fillRect(R(x - sc), R(y - sc / 2), sc * 2, sc); g.globalAlpha = 1; }
  }

  // ───────────────────────────── composed backdrops ─────────────────────────────
  // Moonflower Grove, shared by most scenes. st.health 0 (dim, overgrown) … 1 (healthy), st.layout 'wide'|'home'|'well'.
  function grove(g, s, st) {
    const t = s.t, hl = clamp(st.health ?? 1), cx = s.cam.x, cy = s.cam.y, sk = st.sky || (hl > .5 ? 'night' : 'dim');
    sky(g, 'dim'); sky(g, sk, st.skyMix ?? hl);
    if (st.sky2) sky(g, st.sky2, st.sky2a);
    stars(g, t, cx * .04, (st.stars ?? 1) * (.45 + .55 * hl), s.rm);
    const lay = st.layout || 'wide', L = LAYOUTS[lay], m = st.moon || L.moon; moon(g, m[0] - cx * .05, m[1] - cy * .05, m[2], st.moonA ?? 1, st.moonDim ?? (1 - hl) * .8);
    band(g, layer('hillsC'), cx * .25 + L.hx, L.hills - cy * .25); band(g, layer('hillsH'), cx * .25 + L.hx, L.hills - cy * .25, hl);
    mist(g, L.hills + 70 - cy * .3, '#9ab4e0', .55 + .3 * (1 - hl), cx * .3 + t * 3);
    band(g, layer('treesC'), cx * .45 + L.tx, L.trees - cy * .45); band(g, layer('treesH'), cx * .45 + L.tx, L.trees - cy * .45, hl);
    const gy = L.ground - cy;
    g.drawImage(groundCanvas('groveC', '#20202e', '#111119', '#2c2b3c', '#181824'), 0, 0, 1024, 120, -R(((cx * 1) % 1024 + 1024) % 1024), R(gy), 1024, 120);
    g.globalAlpha = hl; band(g, groundCanvas('groveH', '#1f3c3e', '#10221f', '#2e5a4c', '#173029'), cx, gy, hl); g.globalAlpha = 1;
    g.fillStyle = mix('#111119', '#10221f', hl); g.fillRect(0, R(gy + 120), W, H);
    mist(g, gy + 6, '#a8c0f0', .35 + .25 * (1 - hl), cx * .6 - t * 4);
    if (st.extra) st.extra(g, s, gy);
    L.draw(g, s, st, hl, gy);
    if (st.frame !== false && L.frame) { const fl = layer('frameL'); if (L.frame === 'L') g.drawImage(fl, R(-22 - cx * 1.3), R(-24 - cy * 1.2)); else { g.save(); g.scale(-1, 1); g.drawImage(fl, R(-W - 22 + cx * 1.3), R(-24 - cy * 1.2)); g.restore(); } }
    fireflies(g, t, { n: R((st.flies ?? 26) * (.25 + .75 * hl)), y0: L.ground - 70 - cy, y1: H - 20 - cy, ox: cx, a: .35 + .65 * hl });
    pollen(g, t, { n: R(26 * hl), y0: 60, y1: H, ox: cx * 1.1, a: .8 });
  }
  const LAYOUTS = {
    wide: {
      hills: 120, trees: 132, ground: 222, hx: 0, tx: 40, moon: [404, 62, 15], frame: 'L',
      draw(g, s, st, hl, gy) {
        const cx = s.cam.x, t = s.t;
        dirtPath(g, [[128 - cx, gy + 26, 10], [170 - cx, gy + 50, 22], [236 - cx, gy + 98, 46]]);
        dirtPath(g, [[255 - cx * .9, gy + 12, 8], [215 - cx, gy + 60, 18], [236 - cx, gy + 98, 46]]);
        moonwell(g, 256 - cx * .9, gy + 12 - s.cam.y * .1, 1, { glow: st.glow ?? hl * .9, blaze: st.blaze, t, over: 1 - hl, crack: st.crack, still: s.rm && false });
        cottage(g, 118 - cx, gy + 28, 1, { lit: st.lit ?? hl, over: st.over ?? (1 - hl), t, smoke: st.smoke ?? hl, lantern: st.lit ?? hl, flowers: hl > .6, board: st.board });
        crops(g, 318 - cx, gy + 30, 1, { health: st.crops ?? hl, t, cols: 10, rows: 4, still: s.rm });
        crops(g, 330 - cx, gy + 62, 1, { health: st.crops ?? hl, t, cols: 9, rows: 3, still: s.rm });
        if ((st.over ?? 1 - hl) > .05) brambles(g, 140 - cx, gy + 52, 1, { grow: st.over ?? 1 - hl, len: 70, n: 3 });
        if (st.villagers) st.villagers(g, s, gy);
      }
    },
    home: {
      hills: 106, trees: 118, ground: 206, hx: 160, tx: 260, moon: [92, 66, 14], frame: 'R',
      draw(g, s, st, hl, gy) {
        const cx = s.cam.x, t = s.t;
        moonwell(g, 404 - cx * .8, gy + 10, 1, { glow: st.glow ?? hl * .9, t, over: 1 - hl, crack: st.crack });
        dirtPath(g, [[186 - cx, gy + 58, 12], [214 - cx, gy + 80, 30], [262 - cx, gy + 116, 64]]);
        cottage(g, 182 - cx, gy + 58, 2, { lit: st.lit ?? [hl, hl], over: st.over ?? 1 - hl, t, smoke: st.smoke ?? 0, board: st.board ?? 1, lantern: st.lantern, flowers: hl > .6 });
        crops(g, 318 - cx, gy + 50, 2, { health: st.crops ?? hl, t, cols: 9, rows: 3, wave: st.wave, still: s.rm });
        if ((st.over ?? 1 - hl) > .05) { brambles(g, 168 - cx, gy + 84, 2, { grow: st.over ?? 1 - hl, len: 60, n: 3, berries: 1 }); brambles(g, 300 - cx, gy + 80, 2, { grow: st.over ?? 1 - hl, len: 70, n: 2 }); }
        if (st.actors) st.actors(g, s, gy);
      }
    },
    well: {
      hills: 96, trees: 112, ground: 200, hx: 300, tx: 420, moon: [424, 60, 14], frame: null,
      draw(g, s, st, hl, gy) {
        moonwell(g, 300 - s.cam.x, gy + 66, 2, { glow: st.glow ?? hl, blaze: st.blaze, t: s.t, over: st.over ?? 1 - hl, crack: st.crack, still: st.still });
        crops(g, 4 - s.cam.x, gy + 70, 2, { health: st.crops ?? hl, t: s.t, cols: 5, rows: 2, still: s.rm });
        if (st.actors) st.actors(g, s, gy);
      }
    }
  };
  // Distant regions (forest / swamp / frost), healthy ↔ corrupt. x is the region's left edge on screen.
  const REGION = {
    forest: { far: 112, mid: 104, gy: 240, ground: ['#1d3a34', '#0e1d1a', '#2c5444', '#183228'], groundC: ['#1e1426', '#0d0912', '#2e2038', '#1b1224'], fog: '#b48ae0', sky: 'forest' },
    swamp: { far: 134, mid: 136, gy: 236, ground: ['#16302e', '#0a1716', '#2a5048', '#123028'], groundC: ['#151d14', '#090d08', '#29361e', '#151d12'], fog: '#9fd06a', sky: 'swamp', water: true },
    frost: { far: 58, mid: 128, gy: 240, ground: ['#a9bfd8', '#56708f', '#d6e6f8', '#8ea6c4'], groundC: ['#4e5b72', '#252c3c', '#68789a', '#3b465c'], fog: '#c8dcff', sky: 'frost' }
  };
  function region(g, s, key, x, w, c, farOff, midOff, clipW, bg) {
    const Rg = REGION[key], t = s.t, cw = clipW ?? w; if (cw <= 0) return;
    g.save(); g.beginPath(); g.rect(R(x), 0, R(Math.min(w, cw)), H); g.clip(); if (bg) bg();
    const f = (name, off, y, a) => { if (a <= 0) return; const cv = layer(key + name), cwid = cv.width; let sx = x + off; while (sx > x) sx -= cwid; g.globalAlpha = Math.min(1, a); for (; sx < x + w; sx += cwid) g.drawImage(cv, R(sx), R(y)); g.globalAlpha = 1; };
    f('FarH', farOff, Rg.far, 1); f('FarC', farOff, Rg.far, c);
    if (key === 'frost' && c > 0) band(g, layer('cloudsB'), -(x + farOff) + t * 25, Rg.far - 20, c * .85);
    mist(g, Rg.gy - 40, c > .5 ? Rg.fog : '#a8c0f0', .5 + c * .4, -midOff * .8 - x + t * 8);
    const gy = Rg.gy, gH = groundCanvas(key + 'H', ...Rg.ground, 80), gC = groundCanvas(key + 'C', ...Rg.groundC, 80);
    f('MidH', midOff, Rg.mid, 1); f('MidC', midOff, Rg.mid, c);
    band(g, gH, -(x + midOff), gy, 1); band(g, gC, -(x + midOff), gy, c);
    if (Rg.water) { const wy = gy + 10; g.fillStyle = mix('#0b1c22', '#0a120c', c); g.fillRect(R(x), wy, R(w), 50); for (let i = 0; i < 26; i++) { g.globalAlpha = .35 + .3 * Math.sin(t * 2 + i); g.fillStyle = c > .5 ? '#4a6a2a' : '#7fb8d8'; g.fillRect(R(x + (i * 53 + t * 6) % w), wy + 4 + (i * 7) % 40, 6 + i % 9, 1); } g.globalAlpha = 1; }
    if (key === 'forest') { if (c > .02) spores(g, t, c, '#c89aff', 30); fireflies(g, t, { n: R(20 * (1 - c)), y0: 160, y1: 280, ox: -(x + midOff), a: 1 - c }); }
    if (key === 'swamp') { for (let i = 0; i < 7; i++) { const wx = x + midOff * .5 + 40 + i * 70 + Math.sin(t * .7 + i) * 12, wy = 210 + Math.sin(t * 1.1 + i * 2) * 8; glow(g, wx, wy, 10, c > .5 ? '#c8ff6a' : '#8fe8ff', .55); g.fillStyle = '#eaffff'; g.fillRect(R(wx), R(wy), 1, 1); } }
    if (key === 'frost') { snowfall(g, t, .4 + c * .5, 20 + c * 80, R(50 + c * 60)); if (c < .5) for (let i = 0; i < 8; i++) { const sx = x + (i * 71) % w, sy = 180 + (i * 37) % 90, a = Math.max(0, Math.sin(t * 3 + i * 1.7)) * (1 - c * 2); g.globalAlpha = a; g.fillStyle = '#ffffff'; g.fillRect(R(sx) - 2, R(sy), 5, 1); g.fillRect(R(sx), R(sy) - 2, 1, 5); g.globalAlpha = 1; } }
    if (c > .02) { const gr = g.createLinearGradient(0, 60, 0, H); gr.addColorStop(0, rgba(Rg.fog, 0)); gr.addColorStop(1, rgba(Rg.fog, .28 * c)); g.fillStyle = gr; g.fillRect(R(x), 0, R(w), H); }
    g.restore();
  }
  function regionVignette(g, s, key, c) {
    sky(g, 'night'); sky(g, REGION[key].sky, c); stars(g, s.t, s.cam.x * .05, 1 - c * .6, s.rm);
    moon(g, 410 - s.cam.x * .05, 60, 13, 1 - c * .5, c * .8);
    region(g, s, key, 0, W, c, -s.cam.x * .4, -s.cam.x * .7);
  }

  // ───────────────────────────── engine scenes ─────────────────────────────
  // Shot: {t0, t1, in:'dissolve'|'cut'|'fade', xf, cam:[[p,{x,y,z,fx,fy}],…], ease, still:{…}, draw(g, s)}
  // s = {t (scene time), lt (time in shot), p (0..1 in shot), d, cam:{x,y,z}, rm (reduced motion)}
  const frameAt = (lt, fps = 10) => Math.floor(lt * fps) & 7;
  const charmGlowAt = (g, x, y, a, t) => glow(g, x, y, 7 + Math.sin(t * 3) * 1.5, '#cfefff', a);
  function bokeh(g, t, warm) {
    for (let i = 0; i < 16; i++) { const f = MOTES[i * 3], x = (f.x * .9 + Math.sin(t * .2 + i) * 14) % 540 - 10, y = 30 + f.y * 260 + Math.cos(t * .17 + i) * 8; glow(g, x, y, 14 + f.z * 34, i % 3 === 0 && warm ? '#ffcf8a' : i % 2 ? '#9fc8ff' : '#c8f0ff', .1 + f.z * .12); }
  }
  function flicker(t, rm) { if (rm) return .7; const a = Math.sin(t * 23) * Math.sin(t * 7.3 + 1) + Math.sin(t * 41.7) * .4; return a > .35 ? .15 : a > -.2 ? .65 : 1; }
  function frags(n, seed) { const r = rng(seed); return Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + r() * .5, sp: .8 + r() * .5, up: 120 + r() * 120, side: (r() - .5) * 2, ph: r() * 6 })); }
  const FR7 = frags(7, 5);

  function bossScene(kind) {
    const R0 = { forest: 'forest', swamp: 'swamp', frost: 'frost' }[kind];
    return {
      bars: true, fadeIn: .7, fadeOut: .7, vignette: { col: { forest: '#2a0a2a', swamp: '#0a2a10', frost: '#0a1a3a' }[kind], pulse: 1 },
      shake: [{ t0: 3.1, t1: 4.4, amp: 3 }], flash: [{ t: 3.1, d: .5, c: { forest: '#d8a0ff', swamp: '#d0ff9a', frost: '#e0f6ff' }[kind], a: .35 }],
      captions: [{ t0: 4.1, t1: 8.3, kind: 'name', boss: true }],
      shots: [{
        t0: 0, t1: 8.5, cam: [[0, { x: 0, y: 6, z: 1 }], [.36, { x: 0, y: 0, z: 1.06 }], [1, { x: 0, y: -4, z: 1.1, fy: -30 }]], still: { x: 0, y: 0, z: 1 },
        draw(g, s) {
          const t = s.t, c = 1, roar = seg(t, 3.05, 3.4), rev = sm(seg(t, 3.1, 4.6)), cx = s.cam.x, cy = s.cam.y;
          sky(g, 'void'); sky(g, REGION[R0].sky, .85);
          stars(g, t, cx * .05, .35, s.rm);
          if (kind === 'frost') band(g, layer('peakFar'), 200 + cx * .2, 60 - cy * .2);
          region(g, s, R0, 0, W, c, -cx * .4, -cx * .7);
          const art = BOSS[kind], sc = 2, bob = s.rm ? 0 : R(Math.sin(t * 1.4) * 1.5);
          const by = kind === 'swamp' ? 282 : 296;
          glow(g, 256, by - 140, 170, REGION[R0].fog, .12 + .18 * rev);
          boss(g, kind, 256 - cx * .9, by - cy * .9, sc, { body: .5 + .5 * seg(t, 0, 2.5), rim: rev, eyes: sm(seg(t, 2.9, 3.3)) * (s.rm ? 1 : .85 + .15 * Math.sin(t * 9)), heart: .3 + .7 * rev, t, bob });
          mist(g, by - 8 - cy, REGION[R0].fog, .6, cx * .9 + t * 10);
          g.fillStyle = '#05060a'; g.fillRect(0, R(278 - cy * 1.1), W, 60);
          for (let x = 0; x < W; x += 3) { const hh = 3 + R(hash(x, 1) * 7); g.fillRect(x, R(278 - cy * 1.1) - hh, 2, hh); }
          witch(g, 84 - cx * 1.2, 290 - cy * 1.1, 2, 'idle', 'NE', frameAt(t, 8));
          charmGlowAt(g, 84 - cx * 1.2, 290 - 40 - cy * 1.1, .25 + .35 * rev, t);
          if (kind === 'forest') spores(g, t, .8, '#c89aff', 40);
          if (kind === 'frost') snowfall(g, t, .8, 70 + roar * 120, 100);
          if (kind === 'swamp') pollen(g, t, { n: 30, y0: 120, y1: 300, col: '#c8ff9a', a: .7 });
          void art;
        }
      }]
    };
  }

  const SCENES = {
    intro: {
      bars: true, fadeIn: 1.2, fadeOut: 1.2, vignette: { col: '#000000', k: .5 },
      shake: [{ t0: 11.4, t1: 12.6, amp: 2.5 }], flash: [{ t: 11.4, d: .9, c: '#dff6ff', a: .7 }],
      captions: [
        { t0: 19.7, t1: 21.2, kind: 'region', title: 'The Blighted Forest', sub: 'once the Whisperwood' },
        { t0: 21.3, t1: 22.8, kind: 'region', title: 'The Whispering Swamp', sub: 'once Lilyreach' },
        { t0: 22.9, t1: 24.2, kind: 'region', title: 'Frostpeak', sub: 'once the Shining Heights' },
        { t0: 38.4, t1: 42.5, kind: 'title', title: 'Moss & Moon', sub: 'Restore the Moonwell · Tend the grove' }
      ],
      shots: [
        { t0: 0, t1: 8.6, cam: [[0, { x: -26, y: 8, z: 1 }], [1, { x: 22, y: 0, z: 1.05 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) { grove(g, s, { health: 1, layout: 'wide', glow: .9 }); } },
        { t0: 8.6, t1: 15.2, xf: 1, cam: [[0, { x: 0, y: 0, z: 1 }], [.42, { x: 0, y: -4, z: 1.1, fy: -40 }], [.5, { x: 0, y: -4, z: 1.1, fy: -40 }], [1, { x: 0, y: -50, z: 1.02 }]], still: { x: 0, y: -10, z: 1 },
          draw(g, s) {
            const lt = s.lt, br = 2.8, broken = lt >= br, fl = lt < br ? .85 * flicker(lt, s.rm) * (lt < .8 ? 1 : 1) : Math.max(0, .9 - (lt - br) * 3) * .9;
            const fade = seg(lt, br, br + 3.2);
            grove(g, s, { health: 1 - fade * .55, layout: 'well', glow: broken ? fl : lerp(.9, fl, seg(lt, .6, 1)), crack: broken ? 1 : 0, crops: 1 - fade * .3, frame: false, flies: 26 * (1 - fade) });
            if (broken) {
              const k = lt - br, wx = 300 - s.cam.x, wy = 200 + 66 - 16 * 2 - s.cam.y;
              FR7.forEach(f => {
                const pos = q => [wx + Math.cos(f.a) * 230 * q * f.sp + f.side * 40 * q, wy - f.up * q * 1.5 + 160 * q * q];
                const q = clamp(k * .42 * f.sp), [x, y] = pos(q), pts = []; for (let i = 1; i < 18; i++) pts.push(pos(Math.max(0, q - i * .012)));
                trail(g, pts, 1 - q * .5); shard(g, x, y, 2, 1 - seg(q, .8, 1), s.t);
              });
            }
          } },
        { t0: 15.2, t1: 19.4, xf: 1, cam: [[0, { x: -10, y: 0, z: 1 }], [1, { x: 16, y: 0, z: 1.04 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) { const p = sm(s.p); grove(g, s, { health: lerp(.55, .05, p), layout: 'home', crops: lerp(.9, .05, p), over: lerp(0, 1, p), lit: [lerp(.6, 0, p), 0], glow: .05, crack: 1, board: -1 }); } },
        { t0: 19.4, t1: 21.0, xf: .7, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 40, y: 0, z: 1 }]], still: { x: 20, y: 0, z: 1 }, draw(g, s) { regionVignette(g, s, 'forest', sm(seg(s.lt, .1, 1.4))); } },
        { t0: 21.0, t1: 22.6, xf: .5, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 40, y: 0, z: 1 }]], still: { x: 20, y: 0, z: 1 }, draw(g, s) { regionVignette(g, s, 'swamp', sm(seg(s.lt, .1, 1.4))); } },
        { t0: 22.6, t1: 24.2, xf: .5, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 40, y: 0, z: 1 }]], still: { x: 20, y: 0, z: 1 }, draw(g, s) { regionVignette(g, s, 'frost', sm(seg(s.lt, .1, 1.4))); } },
        { t0: 24.2, t1: 28.4, xf: .9, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 0, y: 0, z: 1 }]],
          draw(g, s) {
            const lt = s.lt, t = s.t;
            sky(g, 'night'); sky(g, 'dim', .35); stars(g, t, lt * 8, 1, s.rm); moon(g, 300, 128, 36, 1, .1);
            band(g, layer('cloudsB'), lt * 30, 40); band(g, layer('treesC'), lt * 60 + 100, 262); band(g, layer('treesH'), lt * 60 + 100, 262, .3);
            const path = q => [lerp(-50, 570, q), 150 + Math.sin(q * 7) * 6 - (q - .5) * 40];
            const q = seg(lt, .1, 4.1), [x, y] = path(q), pts = []; for (let i = 1; i < 34; i++) { const [px, py] = path(Math.max(0, q - i * .006)); pts.push([px - 24 + Math.sin(i * 1.7 + t * 9) * 2, py - 22 + i * .45]); }
            trail(g, pts, .9, '#ffe7a8'); witch(g, x, y, 2, 'fly', 'E', frameAt(lt)); charmGlowAt(g, x + 8, y - 44, .55, t);
            band(g, layer('cloudsA'), lt * 90 + 300, 250);
          } },
        { t0: 28.4, t1: 31.6, xf: .8, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 0, y: 0, z: 1 }]],
          draw(g, s) {
            const lt = s.lt, t = s.t; sky(g, 'velvet'); bokeh(g, t, true);
            charm(g, 196 + (s.rm ? 0 : R(Math.sin(t * 1.3) * 3)), 152, 5, .55 + .45 * seg(lt, .4, 2.2), t);
            seedCase(g, 376, 262, 4, t, seg(lt, 1, 2.5));
            g.drawImage(vignetteCanvas('#000000', .7), 0, 0);
          } },
        { t0: 31.6, t1: 38.0, xf: .9, cam: [[0, { x: 18, y: -6, z: 1 }], [.8, { x: 0, y: 0, z: 1.05, fx: -40, fy: 30 }], [1, { x: 0, y: 0, z: 1.05, fx: -40, fy: 30 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) {
            const lt = s.lt, wl = sm(seg(lt, 4.2, 5.4));
            grove(g, s, {
              health: .06, layout: 'home', crops: .06, over: 1, lit: [wl, 0], board: 1, glow: .04, crack: 1, smoke: wl,
              actors(g2, s2, gy) {
                const cx = s2.cam.x; let x, y, an = 'fly', dir = 'SE', fr = frameAt(lt), a = 1;
                if (lt < 2.4) { const q = EASE.out(seg(lt, 0, 2.4)); x = lerp(520, 280, q); y = lerp(70, gy + 80, q); }
                else if (lt < 3.2) { x = 280; y = gy + 80; an = 'mount'; fr = 7 - Math.min(7, Math.floor((lt - 2.4) * 10)); }
                else { const q = seg(lt, 3.4, 4.5); x = lerp(280, 196, q); y = lerp(gy + 80, gy + 62, q); an = q > 0 && q < 1 ? 'walk' : 'idle'; dir = 'NW'; fr = frameAt(lt, 9); a = 1 - seg(lt, 4.3, 4.7); if (lt < 3.4) dir = 'S'; }
                witch(g2, x - cx, y, 2, an, dir, fr, a); charmGlowAt(g2, x - cx, y - 40, .3 * a, s2.t);
                castSprite(g2, 'raven', 100 - cx, gy + 74, 2, 'SE', false, frameAt(s2.t, 4), 1);
              }
            });
          } },
        { t0: 38.0, t1: 42, xf: 1.2, cam: [[0, { x: 0, y: -10, z: 1 }], [1, { x: 0, y: 0, z: 1 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) { grove(g, s, { health: .12, layout: 'wide', glow: .05, crack: 1, lit: .9, smoke: 1, over: .9, crops: .1, board: 1 }); g.globalAlpha = .35; g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; } }
      ]
    },
    first_restoration: {
      bars: true, fadeIn: .7, fadeOut: .9, vignette: { col: '#000000', k: .45 }, flash: [{ t: 3.0, d: .8, c: '#e6fbff', a: .55 }],
      shots: [
        { t0: 0, t1: 5.4, cam: [[0, { x: 0, y: -20, z: 1 }], [.55, { x: 0, y: 0, z: 1.04 }], [1, { x: 0, y: 0, z: 1.04 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) {
            const lt = s.lt, land = 3.0, gl = lt < land ? .1 : lerp(.1, .55, sm(seg(lt, land, land + 1.2))), ring = seg(lt, land, land + 2.2);
            grove(g, s, {
              health: .15 + .25 * seg(lt, land, land + 2), layout: 'well', glow: gl, over: .7 - .3 * seg(lt, land, 5), frame: false, crops: .15 + .4 * ring,
              actors(g2, s2, gy) {
                const wx = 300 - s2.cam.x, wy = gy + 66 - 32;
                witch(g2, 150 - s2.cam.x, gy + 86, 2, lt > 2 && lt < 2.6 ? 'cast' : 'idle', 'E', lt > 2 && lt < 2.6 ? Math.floor((lt - 2) * 16) & 7 : frameAt(lt, 8)); charmGlowAt(g2, 156 - s2.cam.x, gy + 46, .3 + .5 * ring, s2.t);
                if (lt < land) { const q = sm(seg(lt, 0, land)), a = q * 6 + 1, rr = (1 - q) * 110; const pos = qq => [wx + Math.cos(qq * 6 + 1) * (1 - qq) * 110, wy - 40 - (1 - qq) * 150 + qq * 40]; const [x, y] = pos(q), pts = []; for (let i = 1; i < 20; i++) pts.push(pos(Math.max(0, q - i * .01))); trail(g2, pts, 1); shard(g2, x, y, 2, 1, s2.t, true); void a; void rr; }
                if (ring > 0 && ring < 1) { g2.globalAlpha = 1 - ring; pen(g2, wx, wy + 32, 1).ring(0, 0, 30 + ring * 260, (30 + ring * 260) * .22, '#cff6ff'); g2.globalAlpha = 1; }
              }
            });
          } },
        { t0: 5.4, t1: 10, xf: .9, cam: [[0, { x: 10, y: 0, z: 1 }], [1, { x: -10, y: 0, z: 1 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) {
            const lt = s.lt, w = seg(lt, 0, 3.2);
            grove(g, s, {
              health: .3 + .2 * w, layout: 'home', glow: .55, over: .55 - .25 * w, crops: .15, lit: [.3 + .7 * seg(lt, 1.5, 2.4), 0], board: 1, smoke: .8,
              wave: (c, r) => clamp((w * 14 - (9 - c) - r) / 4) * .75,
              actors(g2, s2, gy) { witch(g2, 284 - s2.cam.x, gy + 80, 2, 'idle', 'NE', frameAt(lt, 8)); charmGlowAt(g2, 284 - s2.cam.x, gy + 40, .5, s2.t); castSprite(g2, 'cat', 244 - s2.cam.x, gy + 72, 2, 'SE', false, frameAt(s2.t, 5), seg(lt, 1, 2)); }
            });
          } }
      ]
    },
    boss_forest_intro: bossScene('forest'),
    boss_swamp_intro: bossScene('swamp'),
    boss_frost_intro: bossScene('frost'),
    final_fragment: {
      bars: true, fadeIn: .8, fadeOut: 1, vignette: { col: '#000000', k: .5 }, flash: [{ t: 6.6, d: .6, c: '#e6fbff', a: .4 }],
      shots: [{
        t0: 0, t1: 11, cam: [[0, { x: -10, y: 10, z: 1 }], [.55, { x: 0, y: 0, z: 1.05, fy: -30 }], [1, { x: -40, y: -20, z: 1.0 }]], still: { x: 0, y: 0, z: 1 },
        draw(g, s) {
          const t = s.t, lt = s.lt, cx = s.cam.x, cy = s.cam.y;
          sky(g, 'frost'); sky(g, 'night', .5); stars(g, t, cx * .05, 1, s.rm);
          g.save(); g.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 70; i++) { const x = i * 8 - cx * .1, yy = 40 + Math.sin(i * .21 + t * .4) * 18 + Math.sin(i * .07) * 10, h = 40 + Math.sin(i * .5 + t) * 14, gr = g.createLinearGradient(0, yy, 0, yy + h); gr.addColorStop(0, rgba('#7affc8', 0)); gr.addColorStop(.5, rgba(i % 9 < 3 ? '#9fd8ff' : '#7affc8', .12 + .06 * Math.sin(i + t * 2))); gr.addColorStop(1, rgba('#7affc8', 0)); g.fillStyle = gr; g.fillRect(R(x), R(yy - cy * .1), 8, R(h)); }
          g.restore();
          moon(g, 420 - cx * .05, 56 - cy * .05, 12, 1 + seg(lt, 7, 9), 0);
          band(g, layer('peakFar'), cx * .2, 150 - cy * .2); g.globalAlpha = .35; g.fillStyle = '#1a2a4a'; g.fillRect(0, R(240 - cy * .2), W, 100); g.globalAlpha = 1;
          mist(g, 250 - cy * .4, '#cfe0ff', .7, cx * .4 + t * 6);
          const home = seg(lt, 7.6, 10.5); if (home > 0) { glow(g, 96 - cx * .2, 236 - cy * .2, 30, '#8fe8ff', home * .7); g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = home * .6; g.fillStyle = '#9fe9ff'; g.fillRect(R(95 - cx * .2), 0, 2, R(236 - cy * .2)); g.restore(); }
          const P = pen(g, -cx, -cy, 1); g.fillStyle = '#0c1424';
          for (let x = 0; x < W + 60; x++) { const xx = x - 20, top = R(236 + Math.pow(Math.abs(xx - 236) / 10, 1.5) * 1.6 + Math.sin(xx * .19) * 2 + (hash(xx >> 2, 5) - .5) * 3); P.r(xx, top, 1, 140, '#0c1424'); P.r(xx, top, 1, 2 + R(hash(xx, 2) * 2), '#dbe8f8'); P.r(xx, top + 3, 1, 1, '#7d93b5'); if (hash(xx, 9) < .05) P.r(xx, top + 6 + R(hash(xx, 4) * 20), 2, 1, '#2a3a58'); }
          witch(g, 230 - cx, 240 - cy, 2, lt > 2.2 && lt < 2.7 ? 'cast' : 'idle', 'NE', lt > 2.2 && lt < 2.7 ? Math.floor((lt - 2.2) * 16) & 7 : frameAt(lt, 8));
          charmGlowAt(g, 236 - cx, 200 - cy, .2 + .7 * seg(lt, 4, 5) * (1 - seg(lt, 7, 9) * .5), t);
          const fx0 = 312 - cx, fy0 = 150 - cy + (s.rm ? 0 : Math.sin(t * 2) * 4);
          if (lt < 6.6) shard(g, fx0, fy0, 2, 1, t, true);
          else { const q = EASE.in(seg(lt, 6.6, 8.4)); const pos = qq => [lerp(fx0, 96 - cx * .2, qq), lerp(fy0, 236 - cy * .2, qq) - Math.sin(qq * Math.PI) * 120]; const [x, y] = pos(q), pts = []; for (let i = 1; i < 30; i++) pts.push(pos(Math.max(0, q - i * .008))); if (q < 1) { trail(g, pts, 1); shard(g, x, y, 2 - (q > .5 ? 1 : 0), 1, t, true); } }
          snowfall(g, t, .5, 25, 60);
        }
      }]
    },
    ending: {
      bars: true, fadeIn: 1.2, fadeOut: 1.4, vignette: { col: '#000000', k: .42 },
      flash: [{ t: 10.6, d: 1.6, c: '#ffffff', a: .9 }], shake: [{ t0: 10.6, t1: 11.6, amp: 1.5 }],
      captions: [
        { t0: 14.6, t1: 16.8, kind: 'region', title: 'The Whisperwood', sub: 'restored' },
        { t0: 17.2, t1: 19.6, kind: 'region', title: 'Lilyreach', sub: 'restored' },
        { t0: 20.0, t1: 22.4, kind: 'region', title: 'The Shining Heights', sub: 'restored' },
        { t0: 39.0, t1: 46.5, kind: 'card', title: 'Moss & Moon', sub: 'The Moonwell shines again.', small: 'To be continued — keep playing ✦' }
      ],
      shots: [
        { t0: 0, t1: 8.2, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 0, y: 0, z: 1.04, fy: -20 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) {
            const lt = s.lt;
            grove(g, s, {
              health: .2, layout: 'well', glow: .2 + .1 * seg(lt, 4, 8), over: .6, frame: false, crops: .2,
              actors(g2, s2, gy) {
                const wx = 300 - s2.cam.x, wy = gy + 34, cast = lt > 4.6 && lt < 5.1;
                witch(g2, 150 - s2.cam.x, gy + 86, 2, cast ? 'cast' : 'idle', 'E', cast ? Math.floor((lt - 4.6) * 16) & 7 : frameAt(lt, 8)); charmGlowAt(g2, 156 - s2.cam.x, gy + 46, .3 + .6 * seg(lt, 4.6, 6), s2.t);
                FR7.forEach((f, i) => {
                  const arrive = 1 + i * .45, q = sm(seg(lt, arrive - 1, arrive + 1.4)), orb = lt * .9 + i / 7 * Math.PI * 2;
                  const sx = wx + Math.cos(f.a) * 340, sy = wy - 140 + Math.sin(f.a) * 120, ox = wx + Math.cos(orb) * 70, oy = wy - 40 + Math.sin(orb) * 18;
                  const x = lerp(sx, ox, q), y = lerp(sy, oy, q); shard(g2, x, y, 1, seg(lt, arrive - 1, arrive - .6), s2.t);
                });
              }
            });
          } },
        { t0: 8.2, t1: 13.4, in: 'cut', cam: [[0, { x: 0, y: 0, z: 1.04, fy: -20 }], [.5, { x: 0, y: 0, z: 1.04 }], [1, { x: 0, y: -90, z: 1 }]], still: { x: 0, y: -20, z: 1 },
          draw(g, s) {
            const lt = s.lt, blaze = sm(seg(lt, 2.4, 3.6)), hl = .2 + .5 * seg(lt, 2.4, 5);
            grove(g, s, {
              health: hl, layout: 'well', glow: .3 + .7 * seg(lt, 0, 2.4), blaze: blaze * (1 - seg(lt, 4, 5.2) * .6), over: .6 * (1 - seg(lt, 2.4, 5)), frame: false, crops: hl, moonA: 1 + blaze, sky: 'bright',
              actors(g2, s2, gy) {
                const wx = 300 - s2.cam.x, wy = gy + 34 - s2.cam.y * 0;
                witch(g2, 150 - s2.cam.x, gy + 86, 2, 'idle', 'E', frameAt(lt, 8)); charmGlowAt(g2, 156 - s2.cam.x, gy + 46, .9, s2.t);
                FR7.forEach((f, i) => { const q = sm(seg(lt, i * .2, 1.4 + i * .2)), orb = (8.2 + lt) * .9 + i / 7 * Math.PI * 2 + q * 5, rr = 70 * (1 - q); const x = wx + Math.cos(orb) * rr, y = wy - 40 * (1 - q) + Math.sin(orb) * rr * .26 - 6 * q; if (q < 1) shard(g2, x, y, 1, 1, s2.t); });
              }
            });
          } },
        { t0: 13.4, t1: 22.4, xf: 1, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 1244, y: 0, z: 1 }]], ease: 'inOut', still: null,
          draw(g, s) {
            const lt = s.lt, cx = s.rm ? 0 : s.cam.x, wave = cx * .9 + lerp(-40, 330, sm(seg(lt, 0, 2))) + 260 * sm(seg(lt, 7, 9));
            const bgf = () => { sky(g, 'dim'); sky(g, 'bright', seg(lt, .5, 8)); stars(g, s.t, cx * .03, 1, s.rm); moon(g, 420, 52, 14, 1.3, 0); }; bgf();
            const reg = ['forest', 'swamp', 'frost'];
            if (s.rm) { const k = Math.min(2, Math.floor(seg(lt, 0, 9) * 3)), ls = lt - k * 3; region(g, s, reg[k], 0, W, 1 - sm(seg(ls, .3, 2)), 0, 0); return; }
            const wx = wave - cx * .9;
            reg.forEach((key, i) => { const x0 = R(i * 560 - cx * .9); if (x0 > W || x0 + 560 < 0) return; region(g, s, key, x0, 560, 1, cx * .5, cx * .1); region(g, s, key, x0, 560, 0, cx * .5, cx * .1, R(wx - x0), bgf); });
            for (let i = 1; i < 3; i++) { const bx = i * 560 - cx * .9; if (bx < -60 || bx > W + 60) continue; const gr = g.createLinearGradient(bx - 40, 0, bx + 40, 0); gr.addColorStop(0, rgba('#9ab4e0', 0)); gr.addColorStop(.5, rgba('#9ab4e0', .22)); gr.addColorStop(1, rgba('#9ab4e0', 0)); g.fillStyle = gr; g.fillRect(R(bx - 40), 90, 80, H); } g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createLinearGradient(wx - 80, 0, wx + 10, 0); gr.addColorStop(0, rgba('#9fe9ff', 0)); gr.addColorStop(.8, rgba('#bff3ff', .35)); gr.addColorStop(1, rgba('#ffffff', 0)); g.fillStyle = gr; g.fillRect(R(wx - 80), 0, 90, H); g.restore();
            for (let i = 0; i < 40; i++) { const f = MOTES[i], x = wx - f.x % 70, y = 140 + f.y * 170 - ((s.t * 20 + i * 9) % 60); g.globalAlpha = .7; g.fillStyle = i % 2 ? '#e6fbff' : '#ffe9a8'; g.fillRect(R(x), R(y), 1, 1); } g.globalAlpha = 1;
          } },
        { t0: 22.4, t1: 30.6, xf: 1, cam: [[0, { x: -20, y: 0, z: 1 }], [1, { x: 20, y: 0, z: 1.03 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) {
            const lt = s.lt, t = s.t, cx = s.cam.x;
            sky(g, 'bright'); stars(g, t, cx * .04, 1, s.rm); moon(g, 420 - cx * .05, 52, 14, 1.3, 0);
            g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createLinearGradient(0, 210, 0, 0); gr.addColorStop(0, rgba('#9fe9ff', .5)); gr.addColorStop(1, rgba('#9fe9ff', 0)); g.fillStyle = gr; g.fillRect(R(254 - cx * .3), 0, 8, 210); g.restore(); glow(g, 258 - cx * .3, 206, 40, '#8fe8ff', .5);
            band(g, layer('hillsH'), cx * .25 + 60, 116); band(g, layer('treesH'), cx * .45 + 200, 150);
            mist(g, 238, '#a8c0f0', .4, cx * .5 + t * 3);
            const gy = 230; band(g, groundCanvas('groveH', '#1f3c3e', '#10221f', '#2e5a4c', '#173029'), cx + 300, gy); g.fillStyle = '#10221f'; g.fillRect(0, gy + 120, W, 40);
            [[70, 238, .5, 0], [150, 226, .9, 1], [400, 230, 1.3, 2], [470, 244, 1.7, 3]].forEach(([x, y, d, i]) => cottage(g, x - cx * .7, y, 1, { lit: [sm(seg(lt, d, d + .5)), sm(seg(lt, d + .3, d + .8))], t, smoke: 1, flowers: true, lantern: seg(lt, d, d + .4) }));
            dirtPath(g, [[262 - cx, 236, 8], [292 - cx, 258, 16], [250 - cx, 284, 28], [200 - cx, 322, 44]], '#3a3444', '#4a4456');
            [[206, 288], [246, 270], [300, 256], [276, 242]].forEach(([x, y], i) => lanternPost(g, x - cx, y, 1, sm(seg(lt, 1.6 + i * .6, 2.1 + i * .6)), t));
            [[0, .2, 'NE'], [1, 1.6, 'N'], [2, 3.0, 'NE']].forEach(([i, st, dir]) => { const q = seg(lt, st, st + 6); const x = lerp(196 + i * 26, 262 + i * 8, q) - cx, y = lerp(306, 248 + i * 4, q); villager(g, x, y, 1, dir, q < 1, frameAt(t, 8), sm(seg(lt, st + .4, st + 1)), t); });
            castSprite(g, 'cat', 330 - cx, 284, 1, 'SW', false, frameAt(t, 5));
            fireflies(g, t, { n: 30, y0: 180, y1: 300, ox: cx }); pollen(g, t, { n: 30, y0: 120, y1: 320, ox: cx });
          } },
        { t0: 30.6, t1: 34.8, xf: 1, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 0, y: 0, z: 1.05, fx: -100, fy: 40 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) {
            const lt = s.lt;
            grove(g, s, { health: 1, layout: 'well', glow: 1, blaze: .25, frame: false, sky: 'bright', flies: 40,
              actors(g2, s2, gy) { witch(g2, 160 - s2.cam.x, gy + 86, 2, 'idle', 'E', frameAt(lt, 8)); charmGlowAt(g2, 166 - s2.cam.x, gy + 46, 1, s2.t); castSprite(g2, 'cat', 100 - s2.cam.x, gy + 88, 2, 'E', false, frameAt(s2.t, 5)); } });
          } },
        { t0: 34.8, t1: 38.6, xf: 1, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 0, y: 0, z: 1 }]],
          draw(g, s) { const t = s.t; sky(g, 'velvet'); bokeh(g, t, true); glow(g, 330, 120, 120, '#8fe8ff', .25); charm(g, 230 + (s.rm ? 0 : R(Math.sin(t * 1.1) * 2)), 170, 6, 1, t); g.drawImage(vignetteCanvas('#000000', .7), 0, 0); } },
        { t0: 38.6, t1: 46, xf: 1.4, cam: [[0, { x: 0, y: -24, z: 1.03 }], [1, { x: 0, y: 0, z: 1 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) { grove(g, s, { health: 1, layout: 'wide', glow: 1, sky: 'bright', sky2: 'dawn', sky2a: .55 * seg(s.lt, 0, 6), lit: 1, smoke: 1, flies: 50 }); g.globalAlpha = .38; g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; } }
      ]
    },
    defeat_recover: {
      bars: true, fadeIn: .8, fadeOut: .9, vignette: { col: '#000000', k: .55 },
      shots: [
        { t0: 0, t1: 3.0, cam: [[0, { x: 0, y: 0, z: 1 }], [1, { x: 0, y: 0, z: 1 }]],
          draw(g, s) { const t = s.t; sky(g, 'void'); bokeh(g, t, false); charm(g, 256, 160, 4, .3 + .5 * sm(seg(s.lt, .2, 2)), t); g.drawImage(vignetteCanvas('#000000', .85), 0, 0); } },
        { t0: 3.0, t1: 6.5, xf: 1.1, cam: [[0, { x: 10, y: 0, z: 1 }], [1, { x: 0, y: 0, z: 1 }]], still: { x: 0, y: 0, z: 1 },
          draw(g, s) {
            grove(g, s, { health: .5, layout: 'home', lit: [1, .8], smoke: 1, board: -1, over: .2, crops: .6, glow: .45,
              actors(g2, s2, gy) { const x = 262 - s2.cam.x, y = gy + 78; witch(g2, x, y, 2, 'idle', 'S', frameAt(s2.t, 6)); charmGlowAt(g2, x, y - 40, .6, s2.t); for (let i = 0; i < 10; i++) { const ph = (s2.t * .4 + i / 10) % 1; g2.globalAlpha = (1 - ph) * .9; g2.fillStyle = i % 2 ? '#bff3ff' : '#ffe9a8'; g2.fillRect(R(x + Math.sin(i * 2.3 + s2.t) * 18), R(y - 10 - ph * 50), 1, 1); } g2.globalAlpha = 1; castSprite(g2, 'cat', x + 44, y + 4, 2, 'W', false, frameAt(s2.t, 5)); } });
          } }
      ]
    }
  };

  // ───────────────────────────── runtime ─────────────────────────────
  const CSS = `.mm-cine{position:absolute;inset:0;z-index:${Z_INDEX};container-type:size;display:grid;place-items:center;background:#000;opacity:0;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none;cursor:default}
.mm-cine.mm-fixed{position:fixed}
.mm-cine-stage{position:relative;width:min(100cqw,160cqh);height:min(100cqh,62.5cqw);container-type:inline-size;overflow:hidden;background:#000}
.mm-cine-stage>canvas,.mm-cine-stage>video{position:absolute;inset:0;width:100%;height:100%;display:block}
.mm-cine-stage>canvas{image-rendering:pixelated;image-rendering:crisp-edges}
.mm-cine-stage>video{object-fit:contain;background:#000}
.mm-cine-sub{position:absolute;left:7%;right:7%;bottom:1.6%;min-height:7.5%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#f7f1de;font:600 max(11px,2.45cqw)/1.3 ui-rounded,"Trebuchet MS",system-ui,sans-serif;text-shadow:0 1px 2px #000,0 0 10px #000c;pointer-events:none;opacity:0}
.mm-cine-sub[hidden]{display:none}
.mm-cine-sub b{display:block;font:800 max(8px,1.35cqw)/1.2 ui-rounded,"Trebuchet MS",system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#e8c98a;margin-bottom:.25em}
.mm-cine-cap{position:absolute;inset:0;pointer-events:none}
.mm-cap{position:absolute;opacity:0;color:#f7f0da;text-shadow:0 2px 0 #0008,0 0 18px #000a}
.mm-cap h2,.mm-cap h3,.mm-cap p{margin:0}
.mm-cap-title,.mm-cap-card{inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-bottom:3%}
.mm-cap-title h2,.mm-cap-card h2{font:400 max(26px,9.6cqw)/1 Georgia,"Times New Roman",serif;letter-spacing:.07em;text-shadow:0 0 .5em #9fd8ff55,0 .05em 0 #000a}
.mm-cap-title h2 span,.mm-cap-card h2 span{color:#e8cf8e;font-style:italic;font-size:.82em;padding:0 .08em}
.mm-cap-title p,.mm-cap-card p{font:700 max(9px,1.55cqw)/1.4 ui-rounded,"Trebuchet MS",system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#cfe3e6;margin-top:1.3em}
.mm-cap-title p:before,.mm-cap-title p:after,.mm-cap-card small:before,.mm-cap-card small:after{content:"";display:inline-block;width:3.2em;height:1px;background:currentColor;opacity:.5;vertical-align:middle;margin:0 1em}
.mm-cap-card h2{font-size:max(20px,6.2cqw)}
.mm-cap-card p{font:italic 400 max(13px,2.9cqw)/1.3 Georgia,serif;letter-spacing:.02em;text-transform:none;color:#f6ecd0;margin-top:.7em}
.mm-cap-card small{display:block;margin-top:1.6em;font:800 max(9px,1.45cqw)/1.2 ui-rounded,"Trebuchet MS",system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#e8cf8e}
.mm-cap-region{left:6%;top:15%;border-left:2px solid #e8cf8e99;padding:.2em 0 .25em .8em}
.mm-cap-region h3{font:italic 400 max(14px,3.5cqw)/1.1 Georgia,serif}
.mm-cap-region p{font:800 max(8px,1.25cqw)/1.2 ui-rounded,"Trebuchet MS",system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#cfe0e8;margin-top:.45em}
.mm-cap-name{left:0;right:0;bottom:15%;text-align:center}
.mm-cap-name h2{font:400 max(18px,5.4cqw)/1 Georgia,serif;letter-spacing:.05em;color:#fbf2ff}
.mm-cap-name p{font:800 max(8px,1.3cqw)/1.2 ui-rounded,"Trebuchet MS",system-ui,sans-serif;letter-spacing:.26em;text-transform:uppercase;color:#e8cf8e;margin-top:.7em}
.mm-cap-name p:before,.mm-cap-name p:after{content:"✦";margin:0 .9em;opacity:.7}
.mm-cine-skip{position:absolute;right:2.4%;top:11.5%;display:flex;gap:.55em;align-items:center;background:#0b0f1cd9;color:#f4ecd4;border:1px solid #e8d4a066;border-radius:99px;padding:.5em .95em .5em .7em;font:700 max(10px,1.45cqw)/1 ui-rounded,"Trebuchet MS",system-ui,sans-serif;letter-spacing:.04em;opacity:0;pointer-events:none;transition:opacity .2s;cursor:pointer}
.mm-cine-skip.on{opacity:1;pointer-events:auto}
.mm-cine-skip:focus-visible{outline:2px solid #e8cf8e;outline-offset:2px}
.mm-cine-skip i{width:1.05em;height:1.05em;border-radius:50%;background:conic-gradient(#f0d48c calc(var(--hold,0)*360deg),#ffffff2a 0)}`;

  let sess = null, timeScale = 1, reducedFlashes = false, shakeK = 1, subtitlesOn = true, subtitlesSet = false, reducedSet = false, reduced = false, busBound = false;
  const queue = [];
  try { reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignore */ }
  const manifest = () => MM.CINE_MANIFEST || {};
  const safe = (fn, ...a) => { try { return fn && fn(...a); } catch (e) { MM.cine.lastError = String(e && e.stack || e); console.warn('[cine]', e); } };
  const audio = (m, ...a) => { const A = MM.audio; if (A && typeof A[m] === 'function') safe(() => A[m](...a)); };
  const emit = (n, d) => { const b = MM.bus; if (b && typeof b.emit === 'function') safe(() => b.emit(n, d)); };
  function applySettingsObj(a, fromApiGuard) {
    if (!a) return;
    if (typeof a.subtitles === 'boolean' && !(fromApiGuard && subtitlesSet)) subtitlesOn = a.subtitles;
    if (typeof a.reducedMotion === 'boolean' && !(fromApiGuard && reducedSet)) reduced = a.reducedMotion;
    if (typeof a.reducedFlashes === 'boolean') reducedFlashes = a.reducedFlashes;
    if (typeof a.shake === 'string') shakeK = { off: 0, low: .5, full: 1 }[a.shake] ?? 1;
  }
  function bindBus() {
    if (busBound || !MM.bus || typeof MM.bus.on !== 'function') return; busBound = true;
    // core emits {key, value, changed, all:{…settings}, audio:{master,music,sfx,cine}}
    safe(() => MM.bus.on('settings', d => { if (!d) return; applySettingsObj(d.all || d); if (sess && sess.sub) sess.sub.hidden = !subtitlesOn; if (sess && sess.video) sess.video.volume = effVolume(); }));
  }
  function readSettings() {
    const st = MM.settings; if (!st) return;
    const all = typeof st.all === 'function' ? safe(() => st.all()) : null;
    if (all) applySettingsObj(all, true);
    else { const get = k => typeof st.get === 'function' ? safe(() => st.get(k)) : st[k]; applySettingsObj({ subtitles: get('subtitles'), reducedMotion: get('reducedMotion'), reducedFlashes: get('reducedFlashes'), shake: get('shake') }, true); }
  }
  function effVolume() {
    let v = typeof api.volume === 'number' ? api.volume : null; const vols = MM.audio && typeof MM.audio.getVolumes === 'function' ? safe(() => MM.audio.getVolumes()) : null;
    if (v == null) v = vols && typeof vols.cine === 'number' ? vols.cine : 1;
    return clamp(v * (vols && typeof vols.master === 'number' ? vols.master : 1));
  }
  function resolveUrl(u) { return /^(blob:|data:|https?:|file:|\/)/.test(u) ? u : (MM.CINE_VIDEO_BASE || '') + u; }
  function videoSources(entry) {
    if (!entry || entry.playback === 'engine' || !entry.video) return [];
    const v = document.createElement('video'), out = [];
    const can = t => { try { return !!v.canPlayType(t); } catch (e) { return false; } };
    if (entry.video.webm && can('video/webm')) out.push(entry.video.webm);
    if (entry.video.mp4 && can('video/mp4')) out.push(entry.video.mp4);
    if (!out.length) { if (entry.video.webm) out.push(entry.video.webm); if (entry.video.mp4) out.push(entry.video.mp4); }
    return out.map(resolveUrl);
  }
  function engineFor(id) {
    const e = manifest()[id]; if (SCENES[id]) return { sceneId: id, entry: e };
    const fb = e && e.fallback && e.fallback !== 'engine' ? e.fallback : null;
    if (fb && SCENES[fb]) return { sceneId: fb, entry: manifest()[fb] || e };
    return null;
  }
  function listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); sess.listeners.push([target, type, fn, opts]); }
  function el(tag, cls, parent, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }

  function buildDom() {
    const style = el('style'); style.textContent = CSS; style.setAttribute('data-mm-cine', ''); document.head.appendChild(style);
    const host = document.querySelector('#mm-stage') || document.querySelector('.canvas-wrap');
    const root = el('div', 'mm-cine' + (host ? '' : ' mm-fixed')); root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Cinematic: ' + (sess.entry?.title || sess.id)); root.setAttribute('aria-roledescription', 'cinematic');
    const stage = el('div', 'mm-cine-stage', root), cv = el('canvas', null, stage); cv.width = W; cv.height = H; cv.setAttribute('aria-hidden', 'true');
    const cap = el('div', 'mm-cine-cap', stage), sub = el('div', 'mm-cine-sub', stage); sub.setAttribute('aria-live', 'polite');
    const skip = el('button', 'mm-cine-skip', stage); skip.type = 'button'; skip.setAttribute('aria-label', 'Skip cinematic'); el('i', null, skip); el('span', null, skip, 'Skip ▸');
    (host || document.body).appendChild(root);
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    Object.assign(sess, { style, root, stage, cv, g, cap, sub, skipBtn: skip, host });
  }
  function bufs() { return cached('bufs', () => ({ work: mkCanvas(W, H), a: mkCanvas(W, H), b: mkCanvas(W, H) })); }
  function buildCaptions(scene, entry) {
    sess.caps = (scene.captions || []).map(c => {
      const d = el('div', 'mm-cap mm-cap-' + c.kind, sess.cap);
      if (c.kind === 'name') { const b = entry && entry.boss || {}; el('h2', null, d, b.name || entry?.title || ''); el('p', null, d, b.epithet || ''); }
      else if (c.kind === 'region') { el('h3', null, d, c.title); el('p', null, d, c.sub); }
      else { const h = el('h2', null, d); const parts = String(c.title).split('&'); parts.forEach((p, i) => { if (i) el('span', null, h, '&'); h.appendChild(document.createTextNode(p.trim() ? (i ? ' ' + p.trim() : p.trim() + ' ') : '')); }); if (c.sub) el('p', null, d, c.sub); if (c.small) el('small', null, d, c.small); }
      return { c, d };
    });
  }

  function start(job) {
    const entry = manifest()[job.id] || null;
    sess = { id: job.id, job, entry, opts: job.opts || {}, listeners: [], t: 0, real: 0, paused: false, closing: false, closeT: 0, closeDur: 0, usedFallback: false, fired: 0, hold: 0, holding: false, skipShownAt: -1, lastInput: -9, subKey: null, mode: 'pending', caps: [], subs: [] };
    sess.skippable = sess.opts.skippable !== false;
    readSettings(); bindBus(); atlas(); castPage(0); castPage(1);
    const cur = MM.audio && typeof MM.audio.current === 'function' ? safe(() => MM.audio.current()) : null; sess.prevMusic = cur && cur.music || null;
    buildDom(); bindInput();
    const sources = sess.opts.engineOnly ? [] : videoSources(entry);
    if ((entry && entry.playback === 'video' || entry && entry.playback === 'auto') && sources.length) startVideo(sources);
    else if (!startEngine(job.id, false)) { finish(false, 'no-scene'); return; }
    emit('cine:start', { id: sess.id, title: entry && entry.title, playback: sess.mode, rewardKey: entry && entry.rewardKey });
    sess.raf = requestAnimationFrame(tick);
  }
  function startEngine(id, fallback) {
    const e = engineFor(id); if (!e) return false;
    const entry = e.entry || sess.entry || {}, scene = SCENES[e.sceneId];
    Object.assign(sess, { mode: 'engine', scene, sceneId: e.sceneId, t: 0, fired: 0, usedFallback: !!fallback || e.sceneId !== id, dur: entry.duration || (scene.shots[scene.shots.length - 1].t1), subs: entry.subtitles || [], cues: (entry.cues || []).slice().sort((a, b) => a.t - b.t), sceneEntry: entry });
    buildCaptions(scene, entry);
    if (entry.music) audio('music', entry.music, { fade: .7 });
    return true;
  }
  function startVideo(sources) {
    const v = el('video'); v.setAttribute('playsinline', ''); v.playsInline = true; v.preload = 'auto'; v.muted = false; v.volume = effVolume();
    sess.stage.insertBefore(v, sess.cap); sess.video = v; sess.mode = 'video-pending'; sess.srcs = sources.slice(); sess.subs = sess.entry.subtitles || []; sess.dur = sess.entry.duration || 0;
    const fail = why => {
      if (!sess || sess.video !== v || sess.mode === 'engine') return;
      if (sess.srcs.length) { trySrc(); return; }
      sess.fallbackReason = why; dropVideo(); if (!startEngine(sess.id, true)) finish(false, 'no-fallback');
    };
    const trySrc = () => {
      clearTimeout(sess.vTimer); const src = sess.srcs.shift(); v.src = src; sess.mode = 'video-pending'; sess.vStart = sess.real;
      sess.vTimer = setTimeout(() => sess && sess.video === v && sess.mode === 'video-pending' && fail('timeout'), api.videoTimeoutMs);
      let p; try { p = v.play(); } catch (e) { fail('play-threw'); return; }
      if (p && p.catch) p.catch(err => { if (sess && sess.video === v && sess.mode === 'video-pending' && v.src.indexOf(src) >= 0) fail(err && err.name === 'NotAllowedError' ? 'autoplay-blocked' : 'play-rejected'); });
    };
    listen(v, 'error', () => fail('error'));
    listen(v, 'playing', () => { if (!sess || sess.video !== v) return; if (sess.mode === 'video-pending') { sess.mode = 'video'; clearTimeout(sess.vTimer); audio('duck', .7, Infinity); sess.ducked = true; } });
    listen(v, 'ended', () => { if (sess && sess.video === v) finish(false); });
    try { v.defaultPlaybackRate = v.playbackRate = clamp(timeScale, .25, 16); } catch (e) { /* ignore */ }
    trySrc();
  }
  function dropVideo() {
    const v = sess && sess.video; if (!v) return; clearTimeout(sess.vTimer);
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ }
    v.remove(); sess.video = null; sess.listeners = sess.listeners.filter(([tg, ty, fn, o]) => { if (tg === v) { tg.removeEventListener(ty, fn, o); return false; } return true; });
  }

  // input: Esc skips; Space/Enter/click reveal "Skip ▸" (press again or hold to skip); pointer/keys never reach the game while playing.
  const SKIP_KEYS = { Escape: 1, ' ': 1, Spacebar: 1, Enter: 1 };
  function bindInput() {
    const reveal = () => { if (!sess.skippable) return; sess.lastInput = sess.real; if (!sess.skipBtn.classList.contains('on')) { sess.skipBtn.classList.add('on'); sess.skipShownAt = sess.real; } };
    listen(window, 'keydown', e => {
      if (!sess || e.ctrlKey || e.metaKey || e.altKey) return;
      e.stopImmediatePropagation();
      if (!SKIP_KEYS[e.key]) { reveal(); return; }
      e.preventDefault(); if (!sess.skippable || sess.closing) return;
      if (e.key === 'Escape') { api.skip(); return; }
      if (e.repeat) return;
      if (sess.skipBtn.classList.contains('on') && sess.real - sess.skipShownAt > .15) { api.skip(); return; }
      reveal(); sess.holding = 'key';
    }, true);
    listen(window, 'keyup', e => { if (sess && sess.holding === 'key' && SKIP_KEYS[e.key]) { sess.holding = false; sess.hold = 0; } }, true);
    listen(sess.root, 'pointerdown', e => { e.stopPropagation(); if (e.target.closest && e.target.closest('.mm-cine-skip')) return; reveal(); sess.holding = 'ptr'; });
    listen(sess.root, 'pointerup', () => { if (sess && sess.holding === 'ptr') { sess.holding = false; sess.hold = 0; } });
    listen(sess.root, 'pointercancel', () => { if (sess) { sess.holding = false; sess.hold = 0; } });
    listen(sess.root, 'pointermove', e => { if (e.movementX || e.movementY) reveal(); });
    listen(sess.root, 'contextmenu', e => e.preventDefault());
    listen(sess.skipBtn, 'click', e => { e.stopPropagation(); api.skip(); });
  }

  function camAt(shot, p) {
    if (reduced && shot.still !== undefined) return Object.assign({ x: 0, y: 0, z: 1, fx: 0, fy: 0 }, shot.still || (shot.cam && shot.cam[shot.cam.length - 1][1]) || {});
    const keys = shot.cam || [[0, {}]], ease = EASE[shot.ease || 'inOut'], out = { x: 0, y: 0, z: 1, fx: 0, fy: 0 };
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (p >= keys[i][0] && p <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    const acc = k => { const o = { x: 0, y: 0, z: 1, fx: 0, fy: 0 }; for (const kk of keys) { Object.assign(o, kk[1]); if (kk === k) break; } return o; };
    const A = acc(a), B = acc(b), q = a === b ? 0 : ease(clamp((p - a[0]) / (b[0] - a[0])));
    for (const k in out) out[k] = lerp(A[k], B[k], q);
    return out;
  }
  function drawShot(shot, t, out) {
    const B = bufs(), d = shot.t1 - shot.t0, lt = t - shot.t0, p = clamp(lt / d), cam = camAt(shot, p);
    const [wc, wg] = B.work, [oc, og] = out; wg.setTransform(1, 0, 0, 1, 0, 0); wg.globalAlpha = 1; wg.globalCompositeOperation = 'source-over'; wg.imageSmoothingEnabled = false; wg.fillStyle = '#000'; wg.fillRect(0, 0, W, H);
    shot.draw(wg, { t, lt, p, d, cam, rm: reduced });
    og.imageSmoothingEnabled = false; og.globalAlpha = 1;
    if (Math.abs(cam.z - 1) < .001) og.drawImage(wc, 0, 0);
    else { const z = cam.z, cx = W / 2 + cam.fx, cy = H / 2 + cam.fy; og.fillStyle = '#000'; og.fillRect(0, 0, W, H); og.drawImage(wc, cx - cx / z, cy - cy / z, W / z, H / z, 0, 0, W, H); }
    return oc;
  }
  function render() {
    const g = sess.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = false;
    if (sess.mode !== 'engine') { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); return; }
    const sc = sess.scene, t = sess.t, shots = sc.shots, B = bufs();
    let i = shots.findIndex(s => t >= s.t0 && t < s.t1); if (i < 0) i = t < shots[0].t0 ? 0 : shots.length - 1;
    const cur = shots[i], xf = cur.xf ?? .9, cut = cur.in === 'cut' && !reduced;
    let sx = 0, sy = 0;
    if (!reduced && shakeK > 0) for (const s of sc.shake || []) if (t >= s.t0 && t < s.t1) { const k = s.amp * shakeK * (1 - seg(t, s.t0, s.t1)); sx += R((hash(R(t * 60), 1) - .5) * 2 * k); sy += R((hash(R(t * 60), 2) - .5) * 2 * k); }
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const a = drawShot(cur, t, B.a);
    const mixPrev = i > 0 && !cut && t - cur.t0 < xf ? 1 - (t - cur.t0) / xf : 0;
    if (mixPrev > 0) { g.drawImage(drawShot(shots[i - 1], t, B.b), sx, sy); g.globalAlpha = sm(1 - mixPrev); g.drawImage(a, sx, sy); g.globalAlpha = 1; }
    else g.drawImage(a, sx, sy);
    if (sc.vignette) { const v = sc.vignette; let k = v.k ?? .55; if (v.pulse) k = .55 + .25 * (reduced ? .5 : .5 + .5 * Math.sin(t * 2.4)); const j = v.pulse && !reduced ? R(Math.sin(t * 13) * 2 + sx) : 0; g.drawImage(vignetteCanvas(v.col, R(k * 20) / 20), j, v.pulse && !reduced ? R(Math.cos(t * 11) * 2 + sy) : 0); if (v.pulse && v.col !== '#000000') g.drawImage(vignetteCanvas('#000000', .5), 0, 0); }
    for (const f of sc.flash || []) if (t >= f.t && t < f.t + f.d) { g.globalAlpha = f.a * (reduced || reducedFlashes ? .3 : 1) * (1 - EASE.out(seg(t, f.t, f.t + f.d))); g.fillStyle = f.c; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    const fade = Math.max(1 - seg(t, 0, sc.fadeIn || .6), seg(t, sess.dur - (sc.fadeOut || .8), sess.dur));
    if (fade > 0) { g.globalAlpha = fade; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (sc.bars) { const bh = R(30 * EASE.outCubic(seg(t, 0, 1.1))); g.fillStyle = '#000'; g.fillRect(0, 0, W, bh); g.fillRect(0, H - bh, W, bh); }
  }
  function updateDom() {
    const t = sess.t, real = sess.real;
    let op = Math.min(1, real / .35);
    if (sess.mode === 'engine' || sess.mode === 'video') op = Math.min(op, sess.dur ? clamp((sess.dur - t) / .45) : 1);
    if (sess.closing && sess.closeDur > 0) op = Math.min(op, 1 - sess.closeT / sess.closeDur);
    sess.root.style.opacity = op.toFixed(3);
    for (const { c, d } of sess.caps) { const a = sess.mode === 'engine' ? Math.min(seg(t, c.t0, c.t0 + .8), 1 - seg(t, c.t1 - .7, c.t1)) : 0; d.style.opacity = a.toFixed(3); d.style.transform = reduced ? '' : `translateY(${((1 - sm(seg(t, c.t0, c.t0 + 1.2))) * 6).toFixed(2)}px)`; }
    const sub = sess.subs.find(s => t >= s.t0 && t < s.t1), key = sub ? sub.t0 + sub.text : null;
    sess.sub.hidden = !subtitlesOn;
    if (key !== sess.subKey) { sess.subKey = key; sess.sub.textContent = ''; if (sub) { if (sub.speaker) el('b', null, sess.sub, sub.speaker); sess.sub.appendChild(document.createTextNode(sub.text)); } }
    sess.sub.style.opacity = sub ? Math.min(seg(t, sub.t0, sub.t0 + .25), 1 - seg(t, sub.t1 - .25, sub.t1)).toFixed(3) : '0';
    const btn = sess.skipBtn;
    if (btn.classList.contains('on') && !sess.holding && real - sess.lastInput > 2.6) btn.classList.remove('on');
    btn.style.setProperty('--hold', sess.hold.toFixed(3));
  }
  function fireCues(from, to) {
    const cues = sess.cues || [];
    while (sess.fired < cues.length && cues[sess.fired].t <= to) { const c = cues[sess.fired++]; if (c.t < from - .001) continue; if (c.music) audio('music', c.music, { fade: .9 }); if (c.sfx) audio('sfx', c.sfx, {}); }
  }
  function tick(now) {
    if (!sess) return; sess.raf = 0;
    try {
      const dt = sess.lastNow == null ? 0 : Math.min(.1, Math.max(0, (now - sess.lastNow) / 1000)); sess.lastNow = now; sess.real += dt;
      if (sess.closing) { sess.closeT += dt; if (sess.closeT >= sess.closeDur) { finalize(); return; } }
      else {
        if (sess.holding && sess.skippable) { sess.hold = Math.min(1, sess.hold + dt / .7); if (sess.hold >= 1) { api.skip(); } }
        if (!sess.paused && !sess.closing) {
          if (sess.mode === 'engine') { const t0 = sess.t; sess.t = Math.min(sess.dur, sess.t + dt * timeScale); fireCues(t0, sess.t); if (sess.t >= sess.dur) { render(); updateDom(); finish(false); return; } }
          else if (sess.mode === 'video' && sess.video) {
            const v = sess.video; if (v.currentTime !== sess.vLast) { sess.vLast = v.currentTime; sess.vStall = 0; } else sess.vStall = (sess.vStall || 0) + dt;
            sess.t = v.currentTime; if (isFinite(v.duration) && v.duration > 0) sess.dur = v.duration;
            if (sess.vStall > 8) { finish(false, 'stalled'); return; }
          }
        }
      }
      if (!sess || sess.closing && sess.closeDur === 0) return;
      render(); updateDom();
    } catch (e) { MM.cine.lastError = String(e && e.stack || e); console.warn('[cine] render error', e); finish(false, 'render-error'); return; }
    if (sess) sess.raf = requestAnimationFrame(tick);
  }
  function finish(skipped, reason) {
    if (!sess || sess.closing) return; const e = sess.sceneEntry || sess.entry || {};
    sess.result = { id: sess.id, skipped: !!skipped, completed: reason !== 'no-scene', usedFallback: !!sess.usedFallback, playback: sess.mode === 'engine' ? 'engine' : 'video', rewardKey: (sess.entry || e).rewardKey || null };
    if (sess.fallbackReason) sess.result.fallbackReason = sess.fallbackReason;
    if (reason && reason !== 'skip') sess.result.reason = reason;
    sess.closing = true; sess.closeT = 0; sess.closeDur = skipped ? .25 : 0;
    if (sess.video) safe(() => sess.video.pause());
    if (!skipped) finalize(); else if (!sess.raf) sess.raf = requestAnimationFrame(tick);
  }
  function finalize() {
    const s = sess; if (!s) return; sess = null;
    if (s.raf) cancelAnimationFrame(s.raf); clearTimeout(s.vTimer);
    for (const [tg, ty, fn, o] of s.listeners) safe(() => tg.removeEventListener(ty, fn, o));
    s.listeners.length = 0;
    if (s.video) { safe(() => { s.video.pause(); s.video.removeAttribute('src'); s.video.load(); }); }
    safe(() => s.root && s.root.remove()); safe(() => s.style && s.style.remove());
    if (s.ducked) audio('duck', 0, 0);
    if (s.prevMusic && s.mode === 'engine' && !/^cine_|^ending$/.test(s.prevMusic)) audio('music', s.prevMusic, { fade: 1.2 });
    const r = s.result || { id: s.id, skipped: false, completed: false, usedFallback: false }; r.prevMusic = s.prevMusic;
    emit('cine:end', r);
    resolveJob(s.job, r);
    if (queue.length) { const next = queue.shift(); setTimeout(() => { try { if (sess) queue.unshift(next); else start(next); } catch (e) { console.warn('[cine]', e); finalizeBroken(next); } }, 0); }
  }
  function finalizeBroken(job) { if (sess) { sess.result = { id: job.id, skipped: false, completed: false, usedFallback: false, reason: 'error' }; finalize(); } else resolveJob(job, { id: job.id, skipped: false, completed: false, usedFallback: false, reason: 'error' }); }
  function resolveJob(job, r) { safe(() => job.resolve(r)); if (job.opts && typeof job.opts.onEnd === 'function') safe(() => job.opts.onEnd(r)); }

  const api = {
    volume: null, videoTimeoutMs: 4000, scenes: SCENES, lastError: null,
    play(id, opts = {}) {
      return new Promise(resolve => {
        const job = { id, opts: opts || {}, resolve };
        try {
          if (!api.has(id)) { console.warn('[cine] unknown scene', id); resolveJob(job, { id, skipped: false, completed: false, usedFallback: false, reason: 'unknown-scene' }); return; }
          if (sess) {
            if (job.opts.force) { queue.unshift(job); if (sess.closing) return; sess.interrupted = true; finish(true, 'interrupted'); return; }
            if (job.opts.queue === false) { resolveJob(job, { id, skipped: false, completed: false, usedFallback: false, reason: 'busy' }); return; }
            queue.push(job); return;
          }
          start(job);
        } catch (e) { MM.cine.lastError = String(e && e.stack || e); console.warn('[cine] play failed', e); finalizeBroken(job); }
      });
    },
    skip() { if (!sess || sess.closing) return false; finish(true, 'skip'); return true; },
    pause() { if (!sess) return false; sess.paused = true; if (sess.video) safe(() => sess.video.pause()); return true; },
    resume() { if (!sess) return false; sess.paused = false; if (sess.video && sess.mode === 'video') safe(() => { const p = sess.video.play(); if (p && p.catch) p.catch(() => { }); }); return true; },
    isPlaying() { return !!sess && !sess.closing; },
    isPaused() { return !!sess && sess.paused; },
    current() { return sess ? { id: sess.id, t: sess.t, duration: sess.dur, mode: sess.mode, paused: sess.paused, usedFallback: sess.usedFallback, queued: queue.map(j => j.id) } : null; },
    seek(t) { if (!sess || sess.mode !== 'engine') return false; sess.t = clamp(t, 0, sess.dur - .001); sess.fired = (sess.cues || []).filter(c => c.t <= sess.t).length; render(); updateDom(); return true; },
    clearQueue() { const q = queue.splice(0); q.forEach(j => resolveJob(j, { id: j.id, skipped: false, completed: false, usedFallback: false, reason: 'cleared' })); return q.length; },
    setSubtitles(on) { subtitlesOn = !!on; subtitlesSet = true; if (sess) sess.sub.hidden = !subtitlesOn; return subtitlesOn; },
    getSubtitles() { return subtitlesOn; },
    setReducedMotion(on) { reduced = !!on; reducedSet = true; return reduced; },
    getReducedMotion() { return reduced; },
    setVolume(v) { api.volume = clamp(+v); if (sess && sess.video) sess.video.volume = effVolume(); return api.volume; },
    setTimeScale(n) { timeScale = Math.max(.01, +n || 1); if (sess && sess.video) safe(() => { sess.video.playbackRate = clamp(timeScale, .25, 16); }); return timeScale; },
    getTimeScale() { return timeScale; },
    has(id) { return !!(manifest()[id] || SCENES[id]); },
    list() {
      const m = manifest(), ids = Array.from(new Set([...Object.keys(m), ...Object.keys(SCENES)]));
      return ids.map(id => { const e = m[id] || {}; return { id, title: e.title || id, trigger: e.trigger || '', playback: e.playback || 'engine', duration: e.duration || 0, hasVideo: !!(e.video && (e.video.webm || e.video.mp4)), engine: !!engineFor(id), replay: e.replay || { allowed: true, unlockMemory: false }, rewardKey: e.rewardKey || null }; });
    },
    clearCache() { CACHE.clear(); }
  };
  MM.cine = api;
})(window.MM);
