// Moss & Moon — animated logo screen, state 'logo' (owner: SCREENS). Its own composition, never the game world:
// fade from darkness → moonlit glow + drifting motes → the crescent lights up → "MOSS & MOON" letters rise in →
// moss vines grow along the letters → a light sweep → pulse/bloom → hold → fade → MM.flow.afterLogo().
// Layers (back → front): pixel canvas (sky, stars, mist, moon, rays, far motes, back foliage) · SVG wordmark (crisp at
// any size) · pixel canvas (vines, leaves, flowers, near motes, front foliage) · DOM (skip button, fade).
// All animation runs in update(dt)/render() driven by MM.loop (no rAF, no timers). Reduced motion: static dissolve.
(function () {
  'use strict';
  const MM = window.MM;
  if (!MM || !MM.flow || !MM.flow.kit) return;
  const K = MM.flow.kit, { clamp, seg, sm, ease, el } = K;
  const W = 512, H = 320;
  const FULL = { end: 7.4, fadeOut: 0.7 }, CALM = { end: 5.2, fadeOut: 0.6 };
  const TITLE = 'MOSS & MOON';
  const FONT = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, Charter, "Bitstream Charter", "DejaVu Serif", serif';
  const MOON = { x: 256, y: 96, r: 19 };
  const BASE = 184;           // wordmark baseline (in 512×320 space)

  // ------------------------------------------------------------------ static art (built once, cached)
  let ART = null;
  function buildArt() {
    if (ART) return ART;
    const rnd = K.rng(20261029);
    // sky: ordered-dither vertical gradient through ink/teal toward a faint lavender band at the horizon
    const [sky, sg] = K.canvas(W, H);
    const stops = [[0, '#070b12'], [0.45, '#0e1720'], [0.72, '#14232a'], [0.86, '#1d2a35'], [1, '#121d1c']];
    const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const col = (y) => { const t = y / (H - 1); let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++; const [t0, c0] = stops[i], [t1, c1] = stops[i + 1]; return [c0, c1, (t - t0) / (t1 - t0)]; };
    for (let y = 0; y < H; y++) {
      const [c0, c1, f] = col(y);
      for (let x = 0; x < W; x += 1) { const th = (B4[y & 3][x & 3] + 0.5) / 16; sg.fillStyle = f > th ? c1 : c0; sg.fillRect(x, y, 1, 1); }
    }
    // stars
    const stars = [];
    for (let i = 0; i < 120; i++) { const y = Math.floor(Math.pow(rnd(), 1.5) * 220); stars.push({ x: Math.floor(rnd() * W), y, b: 0.25 + rnd() * 0.75, p: rnd() * 6.28, s: rnd() < 0.08 ? 2 : 1, c: rnd() < 0.2 ? '#c6aedb' : rnd() < 0.3 ? '#fff3c4' : '#ebe1f7' }); }
    // crescent moon (lit + unlit), pixel-art with rim shading
    const mk = (lit) => {
      const r = MOON.r, [c, g] = K.canvas(r * 2 + 4, r * 2 + 4), cx = r + 2, cy = r + 2, ox = 8, oy = -5, r2 = r * 0.84;
      for (let y = 0; y < r * 2 + 4; y++) for (let x = 0; x < r * 2 + 4; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), d2 = Math.hypot(dx - ox, dy - oy);
        if (d > r || d2 < r2) continue;
        const inner = (d2 - r2) / (r - r2 + 6), outer = (r - d) / r;
        let cc;
        if (lit) cc = inner < 0.18 ? '#f7f4e9' : outer < 0.08 ? '#8a78a8' : inner < 0.5 ? '#ebe1f7' : '#c6aedb';
        else cc = outer < 0.08 ? '#1c1726' : inner < 0.3 ? '#3a3350' : '#2e2638';
        if (lit && ((x * 7 + y * 13) % 23 === 0) && inner > 0.4) cc = '#a993c4'; // tiny craters
        g.fillStyle = cc; g.fillRect(x, y, 1, 1);
      }
      return c;
    };
    // soft god-rays fan from the moon (smooth, drawn additively)
    const [rays, rg] = K.canvas(W, H);
    rg.translate(MOON.x, MOON.y);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + (i - 3) * 0.23 + (rnd() - 0.5) * 0.08, len = 260, wd = 0.05 + rnd() * 0.05;
      const gr = rg.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      gr.addColorStop(0, 'rgba(198,174,219,.22)'); gr.addColorStop(1, 'rgba(198,174,219,0)');
      rg.fillStyle = gr; rg.beginPath(); rg.moveTo(0, 0); rg.lineTo(Math.cos(a - wd) * len, Math.sin(a - wd) * len); rg.lineTo(Math.cos(a + wd) * len, Math.sin(a + wd) * len); rg.closePath(); rg.fill();
    }
    // mist strip (tileable horizontally)
    const [mist, mg] = K.canvas(W, 40);
    for (let i = 0; i < 70; i++) { const x = rnd() * W, y = 14 + rnd() * 14, rr = 10 + rnd() * 18; for (const dx of [-W, 0, W]) mg.drawImage(K.glow(rr, '#8a78a8', 0.55), x + dx - rr, y - rr); }
    // foliage silhouettes: back (far, teal) and front (near, ink) — ferns, grass blades and hanging moss
    const foliage = (seed, color, rim, density, h0) => {
      const r = K.rng(seed), [c, g] = K.canvas(W + 40, H);
      const blade = (x, base, hgt, lean) => { for (let k = 0; k < hgt; k++) { const px = Math.round(x + lean * (k / hgt) * (k / hgt) * hgt * 0.5), py = base - k; g.fillStyle = color; g.fillRect(px, py, k < hgt * 0.7 ? 2 : 1, 1); if (rim && k > hgt * 0.4 && r() < 0.5) { g.fillStyle = rim; g.fillRect(px, py, 1, 1); } } };
      const fern = (x, base, s, dir) => {
        for (let k = 0; k < 22 * s; k++) { const t = k / (22 * s), px = Math.round(x + dir * t * t * 16 * s), py = Math.round(base - t * 26 * s); g.fillStyle = color; g.fillRect(px, py, 1, 1);
          if (k % 3 === 0) { const len = Math.round((1 - t) * 7 * s + 1); for (let j = 1; j <= len; j++) { g.fillRect(px - j, py + (j >> 1), 1, 1); g.fillRect(px + j, py + (j >> 1), 1, 1); } if (rim) { g.fillStyle = rim; g.fillRect(px + dir, py - 1, 1, 1); } } }
      };
      // ground mound along the bottom, higher at the corners
      for (let x = 0; x < W + 40; x++) { const e = Math.min(x, W + 40 - x) / ((W + 40) / 2); const hh = Math.round(h0 * (1 - e) * (1 - e) + 4 + Math.sin(x * 0.11 + seed) * 2); g.fillStyle = color; g.fillRect(x, H - hh, 1, hh); if (rim && r() < 0.3) { g.fillStyle = rim; g.fillRect(x, H - hh, 1, 1); } }
      for (let i = 0; i < 90 * density; i++) { const x = r() * (W + 40), e = Math.min(x, W + 40 - x) / ((W + 40) / 2), hb = H - Math.round(h0 * (1 - e) * (1 - e) + 3); if (r() > (1 - e) * 1.2 + 0.15) continue; blade(x, hb, 6 + r() * 16 * (1.2 - e), (r() - 0.5) * 1.6); }
      for (const [fx, s, d] of [[16, 1.4, 1], [52, 1.0, -1], [W + 18, 1.3, -1], [W - 24, 0.9, 1]]) fern(fx, H - 6, s * (0.8 + density * 0.3), d);
      // hanging moss from the top corners
      for (const side of [0, 1]) for (let i = 0; i < 16 * density; i++) {
        const x = side ? W + 40 - r() * 90 : r() * 90, len = Math.round((1 - Math.abs((side ? W + 40 - x : x)) / 95) * (24 + r() * 26));
        for (let k = 0; k < len; k++) { g.fillStyle = color; g.fillRect(Math.round(x + Math.sin(k * 0.4 + i) * 0.8), k, 1, 1); if (k % 4 === 0) g.fillRect(Math.round(x) + (k % 8 ? 1 : -1), k + 1, 1, 1); }
      }
      return c;
    };
    ART = { sky, stars, moonLit: mk(true), moonDark: mk(false), rays, mist,
      backFol: foliage(7, '#122220', '#2f4b47', 0.8, 46), frontFol: foliage(11, '#070d0c', '#2a3d3a', 1, 30) };
    return ART;
  }

  // ------------------------------------------------------------------ vines (built from the measured letter boxes)
  function buildVines(S) {
    const boxes = S.boxes, rnd = K.rng(77);
    const pts = []; // ordered pixels with growth order
    const leaves = [], flowers = [];
    const add = (x, y) => { x = Math.round(x); y = Math.round(y); const p = pts[pts.length - 1]; if (!p || p.x !== x || p.y !== y) pts.push({ x, y }); };
    const curve = (fn, n) => { for (let i = 0; i <= n; i++) { const [x, y] = fn(i / n); add(x, y); } };
    const L = boxes.filter((b) => b.ch.trim());
    const minX = L[0].x, maxX = L[L.length - 1].x + L[L.length - 1].w, base = BASE + 6;
    const amp = (x) => Math.sin(x * 0.09) * 2.2 + Math.sin(x * 0.031 + 1) * 1.2;
    const strands = [];
    // main runner under the whole wordmark, starting with a small curl left of the M
    const main = [];
    const push = (arr, fn, n) => { const s = pts.length; curve(fn, n); arr.push([s, pts.length]); };
    push(main, (t) => { const a = Math.PI * 1.2 * (1 - t) + Math.PI * 0.5; return [minX - 10 + Math.cos(a) * 6 * (1 - t * 0.4), base - 6 + Math.sin(a) * 6 * (1 - t * 0.4)]; }, 40);
    push(main, (t) => { const x = minX - 10 + t * (maxX - minX + 22); return [x, base + amp(x)]; }, Math.round(maxX - minX) * 2);
    // closing tendril: climbs the right side of the last N and curls over its top
    const N = L[L.length - 1];
    push(main, (t) => { const y = base - t * (base - N.y + 4); return [maxX + 12 - Math.sin(t * 3) * 3, y]; }, 70);
    push(main, (t) => { const a = t * Math.PI * 1.6; return [maxX + 12 - 4 + Math.cos(a) * (5 - t * 2.5), N.y - 4 + Math.sin(-a) * (5 - t * 2.5)]; }, 50);
    strands.push(main);
    // climbing tendril on the first M (left stem)
    const M = L[0], S2 = L[3];
    const climb = (b, side, top, start) => {
      const arr = []; const x0 = side < 0 ? b.x + 2 : b.x + b.w - 2;
      push(arr, (t) => [x0 + Math.sin(t * 9) * 1.6 * side, base - 2 - t * (base - 2 - (b.y + top))], 60);
      push(arr, (t) => { const a = t * Math.PI * 1.7; return [x0 + side * (Math.cos(a) * 4 - 4) * -1, b.y + top - Math.sin(a) * 4]; }, 34);
      arr.start = start; return arr;
    };
    strands.push(climb(M, -1, 6, 0.08), climb(S2, 1, 10, 0.4));
    // leaves: every ~9 px along the strands, alternating sides; a few become flowers
    let n = 0;
    for (const st of strands) for (const [a, b] of st) for (let i = a + 4; i < b; i += 8 + Math.floor(rnd() * 4)) {
      const p = pts[i], q = pts[Math.min(b - 1, i + 2)], dx = q.x - p.x, dy = q.y - p.y, side = (n++ % 2) ? 1 : -1;
      const nx = -dy * side, ny = dx * side; // normal
      leaves.push({ i, x: p.x, y: p.y, nx: Math.sign(nx) || 0, ny: Math.sign(ny) || side, big: rnd() < 0.35 });
      if (rnd() < 0.28) flowers.push({ i, x: p.x + (Math.sign(nx) || 0) * 3, y: p.y + (Math.sign(ny) || side) * 3, c: rnd() < 0.55 ? '#c6aedb' : '#f7f4e9', ph: rnd() * 6 });
    }
    // growth order: strands grow in parallel; each point gets a 0..1 "when"
    const when = new Float32Array(pts.length).fill(1);
    for (const st of strands) {
      const total = st.reduce((s, [a, b]) => s + (b - a), 0); let k = 0; const s0 = st.start || 0;
      for (const [a, b] of st) for (let i = a; i < b; i++) when[i] = s0 + (1 - s0) * (k++ / Math.max(1, total));
    }
    for (const l of leaves) l.w = when[l.i];
    for (const f of flowers) f.w = when[f.i];
    S.vine = { pts, when, leaves, flowers };
  }
  function drawVines(g, S, grow, bloom) {
    const V = S.vine; if (!V) return;
    const { pts, when } = V;
    for (let i = 0; i < pts.length; i++) { if (when[i] > grow) continue; const p = pts[i]; g.fillStyle = '#16261f'; g.fillRect(p.x, p.y + 1, 2, 1); }
    for (let i = 0; i < pts.length; i++) { if (when[i] > grow) continue; const p = pts[i]; g.fillStyle = '#456b53'; g.fillRect(p.x, p.y, 2, 1); if ((i & 3) === 0) { g.fillStyle = '#688d65'; g.fillRect(p.x, p.y, 1, 1); } }
    // bright growing tips
    if (grow < 1) for (let i = 1; i < pts.length; i++) if (when[i] <= grow && (i + 1 >= pts.length || when[i + 1] > grow)) { g.fillStyle = '#d2e3ad'; g.fillRect(pts[i].x, pts[i].y - 1, 2, 2); }
    for (const l of V.leaves) {
      const k = clamp((grow - l.w) * 14); if (k <= 0) continue;
      const x = l.x, y = l.y, sx = l.nx || 1, sy = l.ny || -1;
      g.fillStyle = '#4b7052'; g.fillRect(x + sx, y + sy, 1, 1);
      if (k > 0.5) { g.fillStyle = '#688d65'; g.fillRect(x + sx * 2, y + sy * 2, 1, 1); g.fillRect(x + sx, y + sy * 2, 1, 1); g.fillStyle = '#87ad7b'; g.fillRect(x + sx * 2, y + sy, 1, 1); }
      if (k >= 1 && l.big) { g.fillStyle = '#a6c593'; g.fillRect(x + sx * 3, y + sy * 2, 1, 1); g.fillStyle = '#4b7052'; g.fillRect(x + sx * 2, y + sy * 3, 1, 1); }
    }
    if (bloom > 0) for (const f of V.flowers) {
      if (f.w > grow) continue; const k = clamp(bloom * 1.4 - f.ph * 0.05); if (k <= 0) continue;
      g.globalAlpha = k; g.fillStyle = f.c; g.fillRect(f.x, f.y - 1, 1, 1); g.fillRect(f.x - 1, f.y, 1, 1); g.fillRect(f.x + 1, f.y, 1, 1); g.fillRect(f.x, f.y + 1, 1, 1);
      g.fillStyle = '#eac979'; g.fillRect(f.x, f.y, 1, 1); g.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ motes
  function makeMotes(n) {
    const r = K.rng(99), out = [];
    for (let i = 0; i < n; i++) out.push({ x: r() * W, y: 60 + r() * 270, z: 0.35 + r() * 1.25, sp: 3 + r() * 7, sw: r() * 6.28, c: r() < 0.5 ? '#eac979' : r() < 0.6 ? '#c6aedb' : '#8ff0d0', a: 0.5 + r() * 0.5 });
    return out;
  }
  function drawMotes(g, S, near, vis, cam) {
    const t = S.t, rm = S.rm;
    for (const m of S.motes) {
      if ((m.z > 1.1) !== near) continue;
      let y = m.y - (rm ? 0 : t * m.sp), x = m.x + (rm ? 0 : Math.sin(t * 0.8 + m.sw) * 4 * m.z);
      y = ((y % 300) + 300) % 300 + 20; x += cam.x * (m.z - (near ? 1 : 0)) * 3; y += cam.y * (m.z - (near ? 1 : 0)) * 3;
      const tw = rm ? 1 : 0.65 + 0.35 * Math.sin(t * 2.1 + m.sw * 3);
      const a = vis * m.a * tw; if (a <= 0.02) continue;
      const rr = Math.round(3 + m.z * 4);
      g.globalAlpha = a * 0.8; g.globalCompositeOperation = 'lighter'; g.drawImage(K.glow(rr, m.c), Math.round(x) - rr, Math.round(y) - rr);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = a; g.fillStyle = m.c; const s = m.z > 1.2 ? 2 : 1; g.fillRect(Math.round(x), Math.round(y), s, s);
    }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ the screen
  let S = null;
  function enter() {
    const rm = K.reduced(), sess = K.session('logo');
    S = { sess, t: 0, rm, T: rm ? CALM : FULL, leaving: 0, done: false, coreRenders: false, motes: makeMotes(46), boxes: null, pulsed: false };
    buildArt();
    sess.htmlClass('mm-scr-logo');
    S.bg = sess.mount({ w: W, h: H });
    S.amb = sess.ambient('logo', S.bg.canvas);
    // wordmark (SVG text in the same 512×320 space as the canvases)
    const root = sess.root('mm-logo', S.bg.canvas.parentNode);
    root.setAttribute('role', 'img'); root.setAttribute('aria-label', 'Moss and Moon');
    const chars = [...TITLE];
    const tspans = (cls) => chars.map((c, i) => el('tspan', { class: cls + (c === '&' ? ' amp' : ''), 'data-i': i }, c === ' ' ? ' ' : c));
    const mkText = (cls, attrs) => { const ts = tspans(cls); const t = el('text', Object.assign({ x: 256, y: BASE, 'text-anchor': 'middle', class: 'mm-logo-' + cls }, attrs || {}), ts); return [t, ts]; };
    const [glowT, glowS] = mkText('glow', { filter: 'url(#mmScrLogoBlur)' });
    const [shadT, shadS] = mkText('shad');
    const [mainT, mainS] = mkText('main');
    const [sweepT, sweepS] = mkText('sweep');
    const sweepGrad = el('linearGradient', { id: 'mmScrLogoSweep', gradientUnits: 'userSpaceOnUse', x1: '-40', y1: '0', x2: '40', y2: '0', gradientTransform: 'translate(-200,0)' },
      el('stop', { offset: '0', 'stop-color': '#fffdf4', 'stop-opacity': '0' }), el('stop', { offset: '0.5', 'stop-color': '#fffdf4', 'stop-opacity': '0.95' }), el('stop', { offset: '1', 'stop-color': '#fffdf4', 'stop-opacity': '0' }));
    const tag = el('text', { x: 256, y: BASE + 30, 'text-anchor': 'middle', class: 'mm-logo-tag' }, 'a  cozy  witch’s  tale');
    const svg = el('svg', { class: 'mm-logo-svg', viewBox: '0 0 512 320', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false' },
      el('defs', null,
        el('linearGradient', { id: 'mmScrLogoFill', x1: '0', y1: '0', x2: '0', y2: '1' }, el('stop', { offset: '0', 'stop-color': '#fff8e2' }), el('stop', { offset: '0.42', 'stop-color': '#f2dfb0' }), el('stop', { offset: '0.7', 'stop-color': '#cfaa71' }), el('stop', { offset: '1', 'stop-color': '#9a7444' })),
        sweepGrad,
        el('filter', { id: 'mmScrLogoBlur', x: '-20%', y: '-60%', width: '140%', height: '220%' }, el('feGaussianBlur', { stdDeviation: '5' }))),
      el('g', { class: 'mm-logo-mark' }, glowT, shadT, mainT, sweepT), tag);
    svg.style.fontFamily = FONT;
    const mark = el('div', { class: 'mm-logo-layer' }, svg);
    root.appendChild(mark);
    S.svg = { svg, mark, glowT, shadT, mainT, sweepT, sweepGrad, tag, sets: [glowS, shadS, mainS, sweepS] };
    S.fg = sess.mount({ w: W, h: H }); // vines + near motes, in front of the letters
    // top layer: skip button + fade
    const top = sess.root('mm-logo-top', S.bg.canvas.parentNode);
    const skip = el('button', { type: 'button', class: 'mm-scr-skip', 'aria-label': 'Skip logo' }, el('span', { text: 'Skip' }), el('i', { class: 'mm-scr-skip-ico', 'aria-hidden': 'true' }));
    const fade = el('div', { class: 'mm-scr-fade', 'aria-hidden': 'true' });
    top.append(fade, skip);
    S.fade = fade; S.skipBtn = skip; S.top = top;
    sess.on(skip, 'click', (e) => { e.stopPropagation(); skipNow('button'); });
    sess.on(top, 'pointerdown', (e) => { if (e.target === skip || skip.contains(e.target)) return; if (e.button > 0) return; skipNow('pointer'); });
    sess.on(document, 'keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || K.uiBusy()) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape' || e.key === 'Spacebar') { e.preventDefault(); if (!e.repeat) skipNow('key'); }
    });
    // measure letters for the vines (system serif fonts are synchronous)
    measure();
    applyFrame();
  }
  function measure() {
    const t = S.svg.mainT; S.boxes = [];
    try {
      const n = t.getNumberOfChars();
      for (let i = 0; i < n; i++) { const b = t.getExtentOfChar(i); S.boxes.push({ ch: TITLE[i] || ' ', x: b.x, y: b.y, w: b.width, h: b.height }); }
    } catch (e) { S.boxes = null; }
    if (!S.boxes || !S.boxes.length || !(S.boxes[S.boxes.length - 1].x > S.boxes[0].x)) {
      // layout not available (hidden document): approximate monospaced boxes
      S.boxes = [...TITLE].map((ch, i) => ({ ch, x: 70 + i * 34, y: BASE - 40, w: 30, h: 48 }));
    }
    buildVines(S);
  }
  function skipNow(why) {
    if (!S || S.done || S.leaving) return;
    S.leaving = S.t; S.skipped = why || true;
    K.sfx('ui_select');
  }
  function finish() {
    if (!S || S.done) return; S.done = true;
    MM.bus && MM.bus.emit && MM.bus.emit('logo:end', { skipped: !!S.skipped, t: S.t });
    MM.flow.afterLogo();
  }
  function update(dt) {
    if (!S) return;
    S.t += dt;
    const T = S.T;
    if (S.leaving) { if (S.t - S.leaving >= (S.rm ? 0.25 : 0.35)) finish(); }
    else if (S.t >= T.end) finish();
    if (!S.coreRenders && S) render();
  }
  // Timeline values for time t (seconds).
  function timeline(t) {
    if (S.rm) {
      const v = { fadeIn: sm(seg(t, 0, 1.2)), moon: sm(seg(t, 0.4, 1.6)), letters: [], vine: 1, vineA: sm(seg(t, 1.6, 2.8)), sweep: -1, glow: 0.38 * sm(seg(t, 0.6, 2)), bloom: sm(seg(t, 2.2, 3.2)), tag: sm(seg(t, 2.2, 3.2)), motes: sm(seg(t, 0.2, 1.4)), cam: { x: 0, y: 0 } };
      for (let i = 0; i < TITLE.length; i++) v.letters.push({ a: sm(seg(t, 0.8, 2.0)), dy: 0 });
      return v;
    }
    const v = { fadeIn: sm(seg(t, 0, 1.3)), moon: ease.inOut(seg(t, 1.5, 2.7)), letters: [], vine: ease.inOut(seg(t, 2.3, 4.6)), vineA: 1, sweep: seg(t, 4.45, 5.35), glow: 0, bloom: sm(seg(t, 5.25, 6.1)), tag: sm(seg(t, 5.0, 5.9)), motes: sm(seg(t, 0.2, 2.0)) };
    let k = 0;
    for (let i = 0; i < TITLE.length; i++) { const t0 = 1.6 + k * 0.11; if (TITLE[i] !== ' ') k++; const p = seg(t, t0, t0 + 0.65); v.letters.push({ a: sm(p), dy: (1 - ease.outCubic(p)) * 8 }); }
    const pulse = t < 5.3 ? 0 : Math.exp(-(t - 5.3) * 2.6) * (1 - Math.exp(-(t - 5.3) * 30));
    v.glow = 0.3 * v.moon + 0.65 * pulse * (K.reducedFlashes() ? 0.4 : 1);
    v.pulse = pulse;
    const push = ease.outCubic(seg(t, 0, 4.4));
    v.cam = { x: (1 - push) * -7 + Math.sin(t * 0.45) * 0.8, y: (1 - push) * 5 + Math.cos(t * 0.37) * 0.5 };
    return v;
  }
  function applyFrame() {
    const v = timeline(S.t), D = S.svg;
    S.v = v;
    for (const set of D.sets) for (let i = 0; i < set.length; i++) { const L = v.letters[i]; set[i].setAttribute('y', (BASE + L.dy).toFixed(2)); set[i].style.opacity = L.a.toFixed(3); }
    D.glowT.style.opacity = clamp(v.glow).toFixed(3);
    if (v.sweep > 0 && v.sweep < 1) { const L = S.boxes, x0 = L[0].x - 60, x1 = L[L.length - 1].x + L[L.length - 1].w + 60; D.sweepGrad.setAttribute('gradientTransform', 'translate(' + (x0 + (x1 - x0) * ease.inOut(v.sweep)).toFixed(1) + ',0) skewX(-24)'); D.sweepT.style.visibility = 'visible'; }
    else D.sweepT.style.visibility = 'hidden';
    D.tag.style.opacity = v.tag.toFixed(3);
    // parallax: wordmark + front canvas move together at depth 1
    const tx = (v.cam.x / W * 100).toFixed(3) + '%', ty = (v.cam.y / H * 100).toFixed(3) + '%';
    const tr = S.rm ? '' : 'translate(' + tx + ',' + ty + ')';
    D.mark.style.transform = tr; S.fg.canvas.style.transform = tr;
    // fade overlay: in from darkness, out at the end (or quickly on skip)
    let dark = 1 - v.fadeIn;
    if (S.leaving) dark = Math.max(dark, clamp((S.t - S.leaving) / (S.rm ? 0.25 : 0.35)));
    else dark = Math.max(dark, sm(seg(S.t, S.T.end - S.T.fadeOut, S.T.end)));
    S.fade.style.opacity = dark.toFixed(3);
    S.skipBtn.classList.toggle('mm-on', S.t > 0.3);
  }
  function render() {
    if (!S || !S.bg) return;
    applyFrame();
    const A = ART, v = S.v, t = S.t, g = S.bg.ctx, f = S.fg.ctx, cam = v.cam, rm = S.rm;
    const off = (z) => [Math.round(cam.x * z), Math.round(cam.y * z)];
    // --- back canvas
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const [sx, sy] = off(0.15); g.drawImage(A.sky, 0, 0);
    for (const s of A.stars) { const tw = rm ? 1 : 0.55 + 0.45 * Math.sin(t * (1.3 + s.b) + s.p); g.globalAlpha = s.b * tw; g.fillStyle = s.c; g.fillRect(s.x + sx, s.y + sy, s.s, s.s); }
    g.globalAlpha = 1;
    // moon halo + rays + crescent
    const [mx, my] = off(0.3), moon = v.moon;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.25 + 0.75 * moon; g.drawImage(K.glow(150, '#4f4566', 0.9), MOON.x + mx - 150, MOON.y + my - 150);
    g.globalAlpha = moon * (0.8 + 0.3 * (v.pulse || 0)); g.drawImage(K.glow(70, '#c6aedb', 1), MOON.x + mx - 70, MOON.y + my - 70);
    if (!rm) { g.globalAlpha = moon * 0.9; g.drawImage(A.rays, mx, my); } else { g.globalAlpha = moon * 0.6; g.drawImage(A.rays, 0, 0); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    const mox = MOON.x + mx - MOON.r - 2, moy = MOON.y + my - MOON.r - 2;
    g.drawImage(A.moonDark, mox, moy); g.globalAlpha = moon; g.drawImage(A.moonLit, mox, moy); g.globalAlpha = 1;
    if (moon > 0 && moon < 1 && !rm) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.sin(moon * Math.PI) * 0.8; g.drawImage(K.glow(26, '#f7f4e9', 1), MOON.x + mx - 26, MOON.y + my - 26); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    // mist (two bands, different speeds)
    const [hx, hy] = off(0.45);
    for (const [y0, sp, a] of [[206, 4, 0.5], [236, 7, 0.65]]) { const o = rm ? 0 : ((t * sp) % W); g.globalAlpha = a * (0.4 + 0.6 * v.fadeIn); g.drawImage(A.mist, Math.round(-o + hx), y0 + hy); g.drawImage(A.mist, Math.round(W - o + hx), y0 + hy); }
    g.globalAlpha = 1;
    drawMotes(g, S, false, v.motes, cam);
    const [bx, by] = off(0.6); g.drawImage(A.backFol, -20 + bx, 4 + by);
    // --- front canvas (depth 1 = moves with the wordmark via CSS transform)
    f.clearRect(0, 0, W, H);
    f.globalAlpha = v.vineA;
    drawVines(f, S, v.vine, v.bloom);
    f.globalAlpha = 1;
    if (v.pulse > 0.02 && S.vine) { f.globalCompositeOperation = 'lighter'; f.globalAlpha = v.pulse * 0.35; for (const fl of S.vine.flowers) f.drawImage(K.glow(5, '#c6aedb', 1), fl.x - 5, fl.y - 5); f.globalCompositeOperation = 'source-over'; f.globalAlpha = 1; }
    drawMotes(f, S, true, v.motes, cam);
    const [fx, fy] = off(0.6); f.drawImage(A.frontFol, -20 + fx, 10 + fy);
    if (!S.pulsed && v.pulse > 0.5) { S.pulsed = true; K.sfx('moonwell_pulse', { volume: 0.6 }); }
    if (S.amb) S.amb.update(MM.loop ? MM.loop.dt || 0.016 : 0.016);
  }
  function renderFromCore() { if (S) { S.coreRenders = true; render(); } }
  function cleanup() { if (S) { S.sess.dispose(); S = null; } }

  const def = {
    sim: 'none', draw: 'none', audio: { music: 'title', fade: 2.5 },
    enter, update, render: renderFromCore, cleanup, exit() { /* resources released in cleanup */ },
    // test/diagnostic hooks
    _debug: () => (S ? { t: S.t, rm: S.rm, leaving: S.leaving, done: S.done, end: S.T.end, boxes: S.boxes && S.boxes.length, vine: S.vine && S.vine.pts.length } : null),
    _seek(t) { if (S) { S.t = t; render(); } },
  };
  if (MM.screens && typeof MM.screens.register === 'function') MM.screens.register('logo', def);
  MM.flow.logo = def;
})();
