// Moss & Moon — main menu, state 'title' (owner: SCREENS). A dedicated animated backdrop (NOT the game world): a moonlit
// grove in layered parallax — dithered sky, stars, drifting clouds, the moon, far hills and tree lines, mist, the lit
// cottage, the glowing Moonwell with its beam, moonflower beds, fireflies and foreground foliage — drawn as pixel art on
// a mounted 512×320 canvas (MM.art sprites re-lit for night, procedural silhouettes elsewhere). Menu = crisp DOM.
// Keyboard (arrows/WASD/Enter/Space/Esc), pointer, touch and gamepad; visible focus; ≥44px targets; reduced motion; textScale.
(function () {
  'use strict';
  const MM = window.MM;
  if (!MM || !MM.flow || !MM.flow.kit) return;
  const K = MM.flow.kit, { clamp, el, sm, seg } = K;
  const W = 512, H = 320;
  const FONT = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, Charter, "Bitstream Charter", "DejaVu Serif", serif';
  const CHAPTERS = ['Arrival', 'The Blighted Forest', 'The Whispering Swamp', 'Frostpeak', 'The Moonwell', 'Free Play'];
  const MOON = { x: 446, y: 50, r: 21 };
  const WELL = { x: 238, y: 270 }, COTTAGE = { x: 104, y: 266 };

  // ================================================================== static backdrop layers (cached)
  let L = null;
  function dither(g, x0, y0, w, h, stops) {
    const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    for (let y = 0; y < h; y++) {
      const t = y / Math.max(1, h - 1); let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
      const [t0, c0] = stops[i], [t1, c1] = stops[i + 1], f = (t - t0) / (t1 - t0);
      for (let x = 0; x < w; x++) { g.fillStyle = f > (B4[(y0 + y) & 3][(x0 + x) & 3] + 0.5) / 16 ? c1 : c0; g.fillRect(x0 + x, y0 + y, 1, 1); }
    }
  }
  function ridge(g, w, base, amp, seed, color, rim, rough) {
    const r = K.rng(seed); const ph = [r() * 6, r() * 6, r() * 6];
    for (let x = 0; x < w; x++) {
      const y = Math.round(base - amp * (0.55 * Math.sin(x * 0.011 + ph[0]) + 0.3 * Math.sin(x * 0.027 + ph[1]) + 0.15 * Math.sin(x * 0.071 + ph[2])) - (rough ? (r() < 0.5 ? 1 : 0) : 0));
      g.fillStyle = color; g.fillRect(x, y, 1, H - y);
      if (rim) { g.fillStyle = rim; g.fillRect(x, y, 1, 1); }
    }
  }
  function treeline(g, w, base, seed, color, rim, scale) {
    const r = K.rng(seed);
    for (let x = -10; x < w + 10;) {
      const kind = r(), hgt = Math.round((14 + r() * 16) * scale), cx = x;
      if (kind < 0.55) { // pine: stacked triangles
        for (let k = 0; k < hgt; k++) { const half = Math.round((k / hgt) * 6 * scale * (1 + 0.35 * ((k % Math.max(3, Math.round(5 * scale))) / 5))); g.fillStyle = color; g.fillRect(cx - half, base - hgt + k, half * 2 + 1, 1); if (rim && k > 0 && (k % 3 === 0)) { g.fillStyle = rim; g.fillRect(cx + half, base - hgt + k, 1, 1); } }
        x += Math.round((7 + r() * 7) * scale);
      } else { // round oak crown
        const rr = Math.round((6 + r() * 5) * scale);
        for (let dy = -rr; dy <= rr; dy++) { const hw = Math.round(Math.sqrt(rr * rr - dy * dy) + (r() < 0.3 ? 1 : 0)); g.fillStyle = color; g.fillRect(cx - hw, base - rr - 4 * scale + dy, hw * 2 + 1, 1); if (rim && dy < -rr * 0.3) { g.fillStyle = rim; g.fillRect(cx + hw, base - rr - 4 * scale + dy, 1, 1); } }
        g.fillStyle = color; g.fillRect(cx, base - 5 * scale, Math.max(1, Math.round(scale * 1.5)), 5 * scale + 2);
        x += Math.round((9 + r() * 8) * scale);
      }
    }
  }
  function cloudShape(seed, w, h) {
    const r = K.rng(seed), [c, g] = K.canvas(w, h);
    const blobs = []; for (let i = 0; i < 9; i++) blobs.push([w * 0.12 + r() * w * 0.76, h * 0.45 + r() * h * 0.25, h * (0.18 + r() * 0.28)]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let inside = false, top = 1e9;
      for (const [bx, by, br] of blobs) { const d = Math.hypot((x - bx) * 0.6, y - by); if (d < br) { inside = true; top = Math.min(top, (y - (by - br)) / br); } }
      if (!inside || y > h * 0.78) continue;
      g.fillStyle = top < 0.18 ? '#8a78a8' : top < 0.45 ? '#4f4566' : '#2e2a48'; g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  function buildLayers() {
    if (L) return L;
    const rnd = K.rng(4242);
    const sky = K.canvas(W, H); dither(sky[1], 0, 0, W, 236, [[0, '#080d1a'], [0.35, '#101a2e'], [0.7, '#1f2945'], [0.88, '#33325a'], [1, '#4f4566']]);
    const stars = []; for (let i = 0; i < 140; i++) stars.push({ x: Math.floor(rnd() * W), y: Math.floor(Math.pow(rnd(), 1.6) * 190), b: 0.2 + rnd() * 0.8, p: rnd() * 6.28, c: rnd() < 0.15 ? '#c6aedb' : rnd() < 0.25 ? '#fff3c4' : '#ebe1f7', s: rnd() < 0.06 ? 2 : 1 });
    // moon: nearly full disc with lavender shading
    const mr = MOON.r, moon = K.canvas(mr * 2 + 2, mr * 2 + 2);
    for (let y = 0; y < mr * 2 + 2; y++) for (let x = 0; x < mr * 2 + 2; x++) {
      const dx = x + 0.5 - mr - 1, dy = y + 0.5 - mr - 1, d = Math.hypot(dx, dy); if (d > mr) continue;
      const lit = (dx * -0.55 + dy * -0.45) / mr; const e = d / mr;
      let c = lit > 0.25 ? '#f7f4e9' : lit > -0.2 ? '#ebe1f7' : lit > -0.55 ? '#c6aedb' : '#8a78a8';
      if (e > 0.93) c = lit > 0 ? '#ebe1f7' : '#8a78a8';
      const n = K.hash(x, y); if (n < 0.07 && e < 0.85) c = '#a993c4'; else if (n < 0.1 && e < 0.85 && lit > 0) c = '#d9cbe8';
      moon[1].fillStyle = c; moon[1].fillRect(x, y, 1, 1);
    }
    const clouds = [cloudShape(11, 120, 30), cloudShape(23, 90, 24), cloudShape(37, 150, 34)];
    const far = K.canvas(W + 40, H); ridge(far[1], W + 40, 196, 26, 3, '#262b4a', '#4f4566', false);
    const mid = K.canvas(W + 40, H); ridge(mid[1], W + 40, 214, 12, 9, '#1b2a3a', null, true); treeline(mid[1], W + 40, 214, 17, '#162330', '#36636f', 1);
    const near = K.canvas(W + 40, H); ridge(near[1], W + 40, 226, 6, 21, '#14261f', null, false); treeline(near[1], W + 40, 228, 29, '#11201c', '#2f4b47', 1.35);
    // meadow ground: dithered moonlit grass with a path toward the well
    const ground = K.canvas(W + 40, H - 222); dither(ground[1], 0, 0, W + 40, H - 222, [[0, '#1a3330'], [0.5, '#162a26'], [1, '#0f1d1b']]);
    const gg = ground[1];
    for (let i = 0; i < 900; i++) { const x = Math.floor(rnd() * (W + 40)), y = Math.floor(rnd() * (H - 222)); gg.fillStyle = rnd() < 0.5 ? '#21403a' : '#2f4b47'; gg.fillRect(x, y, 1, rnd() < 0.3 ? 2 : 1); }
    for (let y = 0; y < H - 222; y++) { const t = y / (H - 222), cx = 250 + (t * t) * 40 - t * 30, hw = 3 + t * t * 26; gg.fillStyle = '#2a3330'; gg.fillRect(Math.round(cx - hw), y + 40, Math.round(hw * 2), 1); }
    // foreground: overhanging oak branch (top-left) + tall grass & blooms along the bottom (silhouette, rim-lit)
    const fg = K.canvas(W + 60, H), fgg = fg[1];
    const leafClump = (x, y, rr, c, rim) => { for (let dy = -rr; dy <= rr; dy++) { const hw = Math.round(Math.sqrt(rr * rr - dy * dy) * (0.8 + K.hash(x + dy, y) * 0.4)); fgg.fillStyle = c; fgg.fillRect(x - hw, y + dy, hw * 2 + 1, 1); if (rim && dy > rr * 0.4 && K.hash(dy, x) < 0.5) { fgg.fillStyle = rim; fgg.fillRect(x - hw + Math.floor(K.hash(x, dy) * hw), y + dy, 2, 1); } } };
    fgg.fillStyle = '#060c0b';
    for (let k = 0; k < 120; k++) { const x = k, y = Math.round(18 + Math.sin(k * 0.03) * 6 + k * 0.12); fgg.fillRect(x, y, 1, Math.max(2, 7 - Math.floor(k / 20))); }
    for (const [x, y, rr] of [[6, 10, 16], [30, 4, 14], [54, 16, 12], [80, 22, 10], [104, 28, 8], [20, 30, 10], [120, 32, 5]]) leafClump(x, y, rr, '#070e0d', '#1d3532');
    for (let i = 0; i < 5; i++) { const x = 14 + i * 22 + Math.floor(rnd() * 8); let y = 28 + i * 4; for (let k = 0; k < 18 + rnd() * 18; k++) { fgg.fillStyle = '#0a1513'; fgg.fillRect(x + Math.round(Math.sin(k * 0.5) * 0.7), y + k, 1, 1); } }
    for (let x = 0; x < W + 60; x++) { const e = Math.abs(x - (W + 60) / 2) / ((W + 60) / 2); const hh = Math.round(5 + e * e * 18 + Math.sin(x * 0.2) * 1.5); fgg.fillStyle = '#070e0d'; fgg.fillRect(x, H - hh, 1, hh); }
    for (let i = 0; i < 260; i++) { const x = rnd() * (W + 60), e = Math.abs(x - (W + 60) / 2) / ((W + 60) / 2); if (rnd() > 0.25 + e) continue; const hh = 6 + rnd() * 22 * (0.4 + e), lean = (rnd() - 0.5) * 6; for (let k = 0; k < hh; k++) { fgg.fillStyle = '#070e0d'; fgg.fillRect(Math.round(x + lean * (k / hh) * (k / hh)), H - 4 - k, 1, 1); } if (rnd() < 0.18) { fgg.fillStyle = rnd() < 0.5 ? '#8a78a8' : '#c6aedb'; fgg.fillRect(Math.round(x + lean), H - 5 - Math.round(hh), 2, 2); } }
    const mist = K.canvas(W, 36); for (let i = 0; i < 80; i++) { const x = rnd() * W, y = 12 + rnd() * 12, rr = 8 + rnd() * 16; for (const dx of [-W, 0, W]) mist[1].drawImage(K.glow(rr, '#8a78a8', 0.5), x + dx - rr, y - rr); }
    // vignette
    const vig = K.canvas(W, H), vg = vig[1].createRadialGradient(W * 0.45, H * 0.5, 80, W * 0.45, H * 0.5, 330);
    vg.addColorStop(0, 'rgba(4,8,10,0)'); vg.addColorStop(1, 'rgba(4,8,10,.62)'); vig[1].fillStyle = vg; vig[1].fillRect(0, 0, W, H);
    // beam above the Moonwell
    const beam = K.canvas(40, 240), bg = beam[1].createLinearGradient(0, 0, 0, 240);
    bg.addColorStop(0, 'rgba(165,214,216,0)'); bg.addColorStop(0.55, 'rgba(165,214,216,.18)'); bg.addColorStop(1, 'rgba(198,240,236,.5)');
    beam[1].fillStyle = bg; beam[1].fillRect(13, 0, 14, 240); beam[1].globalAlpha = 0.5; beam[1].fillRect(17, 0, 6, 240);
    L = { sky: sky[0], stars, moon: moon[0], clouds, far: far[0], mid: mid[0], near: near[0], ground: ground[0], fg: fg[0], mist: mist[0], vig: vig[0], beam: beam[0] };
    return L;
  }

  // Props placed in the meadow (MM.art sprites re-lit for night via kit.night; procedural fallbacks when missing).
  const PROPS = [
    { n: 'tree_oak_1', x: 20, y: 262, s: 1 }, { n: 'tree_willow', x: 300, y: 252, s: 1 }, { n: 'tree_oak_0', x: 176, y: 238, s: 0.75 },
    { n: 'fence_x', x: 150, y: 286, s: 1 }, { n: 'fence_x', x: 168, y: 296, s: 1 },
    { n: 'cottage_lush', x: COTTAGE.x, y: COTTAGE.y, s: 1, anim: true },
    { n: 'lamp_post', x: 176, y: 276, s: 1, anim: true, light: [176, 246, '#eac979'] },
    { n: 'moonwell_restored', x: WELL.x, y: WELL.y, s: 1, anim: true },
    { n: 'bush_berry', x: 206, y: 284, s: 1 }, { n: 'rock_moss', x: 286, y: 280, s: 1 },
    { n: 'crop_moonflower_ripe', x: 262, y: 292, s: 1 }, { n: 'crop_moonflower_ripe', x: 276, y: 298, s: 1 }, { n: 'crop_moonflower_ripe', x: 290, y: 304, s: 1 },
    { n: 'crop_moonflower_ripe', x: 248, y: 300, s: 1 }, { n: 'crop_starmint_ripe', x: 262, y: 308, s: 1 }, { n: 'crop_moonflower_ripe', x: 304, y: 310, s: 1 },
    { n: 'mushroom_moon', x: 60, y: 300, s: 1, anim: true }, { n: 'flowers_moon', x: 196, y: 306, s: 1 }, { n: 'flowers_moon', x: 34, y: 290, s: 1 },
  ];
  function drawProps(g, t, ox, oy) {
    const A = MM.art, have = A && A.ready;
    for (const p of PROPS) {
      if (!have || !K.drawNight(g, p.n, p.x + ox, p.y + oy, { scale: p.s, t: p.anim ? t : null, bloom: 0.7 })) fallbackProp(g, p, ox, oy);
    }
  }
  function fallbackProp(g, p, ox, oy) {
    const x = p.x + ox, y = p.y + oy;
    if (p.n.startsWith('cottage')) { g.fillStyle = '#1b2430'; g.fillRect(x - 34, y - 40, 68, 40); g.fillStyle = '#141b26'; for (let k = 0; k < 26; k++) g.fillRect(x - 38 + k, y - 40 - k, 76 - k * 2, 1); g.fillStyle = '#eac979'; g.fillRect(x - 22, y - 28, 9, 9); g.fillRect(x + 12, y - 28, 9, 9); }
    else if (p.n.startsWith('moonwell')) { g.fillStyle = '#3a4a52'; g.fillRect(x - 20, y - 12, 40, 12); g.fillStyle = '#a5d6d8'; g.fillRect(x - 15, y - 14, 30, 4); }
    else if (p.n.startsWith('tree')) { g.fillStyle = '#122822'; for (let dy = -18; dy <= 18; dy++) { const hw = Math.round(Math.sqrt(324 - dy * dy)); g.fillRect(x - hw, y - 40 + dy, hw * 2, 1); } g.fillRect(x - 2, y - 22, 4, 22); }
  }

  // ================================================================== backdrop renderer
  function makeFlies(n) { const r = K.rng(5), a = []; for (let i = 0; i < n; i++) a.push({ x: 20 + r() * 470, y: 200 + r() * 110, z: 0.6 + r() * 0.9, ph: r() * 6.28, sp: 0.3 + r() * 0.6, c: r() < 0.75 ? '#eac979' : '#8ff0d0' }); return a; }
  function makeSmoke() { const r = K.rng(8), a = []; for (let i = 0; i < 9; i++) a.push({ o: r(), s: 0.7 + r() * 0.6 }); return a; }
  function drawBackdrop(g, S) {
    const B = buildLayers(), t = S.t, rm = S.rm, cam = S.cam;
    const o = (z) => [Math.round(cam.x * z), Math.round(cam.y * z)];
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.imageSmoothingEnabled = false;
    g.drawImage(B.sky, 0, 0);
    const [sx, sy] = o(0.1);
    for (const s of B.stars) { const tw = rm ? 1 : 0.5 + 0.5 * Math.sin(t * (0.9 + s.b * 1.4) + s.p); g.globalAlpha = s.b * tw; g.fillStyle = s.c; g.fillRect(s.x + sx, s.y + sy, s.s, s.s); }
    g.globalAlpha = 1;
    // shooting star every ~11 s (not in reduced motion)
    if (!rm) { const cyc = t % 11; if (cyc > 9 && cyc < 9.7) { const k = (cyc - 9) / 0.7, x0 = 120 + (Math.floor(t / 11) % 3) * 70, y0 = 30; for (let i = 0; i < 14; i++) { const kk = k - i * 0.012; if (kk < 0) break; g.globalAlpha = (1 - i / 14) * (1 - k); g.fillStyle = '#f7f4e9'; g.fillRect(Math.round(x0 + kk * 90), Math.round(y0 + kk * 34), 1, 1); } g.globalAlpha = 1; } }
    // moon + halo
    const [mx, my] = o(0.18);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.9; g.drawImage(K.glow(120, '#4f4566', 1), MOON.x + mx - 120, MOON.y + my - 120);
    g.globalAlpha = rm ? 0.75 : 0.7 + 0.08 * Math.sin(t * 0.7); g.drawImage(K.glow(56, '#c6aedb', 1), MOON.x + mx - 56, MOON.y + my - 56);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(B.moon, MOON.x + mx - MOON.r - 1, MOON.y + my - MOON.r - 1);
    // clouds drifting
    const [cx, cy] = o(0.22);
    const cl = [[0, 34, 2.2, 0.85], [1, 78, 1.4, 0.7], [2, 112, 3, 0.8]];
    for (const [i, y, sp, a] of cl) { const c = B.clouds[i], span = W + c.width, x = ((rm ? i * 170 : t * sp + i * 170) % span) - c.width; g.globalAlpha = a; g.drawImage(c, Math.round(W - x - c.width + cx), y + cy); }
    g.globalAlpha = 1;
    const [fx, fy] = o(0.3); g.drawImage(B.far, -20 + fx, fy);
    // far mist band
    const mo = rm ? 0 : (t * 3) % W; g.globalAlpha = 0.5; g.drawImage(B.mist, Math.round(-mo), 186); g.drawImage(B.mist, Math.round(W - mo), 186); g.globalAlpha = 1;
    const [ix, iy] = o(0.45); g.drawImage(B.mid, -20 + ix, iy);
    const [nx, ny] = o(0.65); g.drawImage(B.near, -20 + nx, ny);
    // meadow + props (depth 1)
    const [px, py] = o(1); g.drawImage(B.ground, -20 + px, 222 + py);
    // well beam + light pools behind the props
    const pulse = rm ? 0.8 : 0.72 + 0.18 * Math.sin(t * 1.3) + 0.06 * Math.sin(t * 3.1);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = pulse * 0.9; g.drawImage(B.beam, WELL.x + px - 20, WELL.y + py - 262);
    g.globalAlpha = pulse * 0.9; g.drawImage(K.glow(60, '#36636f', 1), WELL.x + px - 60, WELL.y + py - 74);
    g.globalAlpha = 0.6; g.drawImage(K.glow(40, '#9a7444', 1), COTTAGE.x + px - 40, COTTAGE.y + py - 70);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    drawProps(g, t, px, py);
    // chimney smoke (soft puffs) — cottage_lush chimney sits ~ (+18,-92) from its anchor
    if (!rm) for (const s of S.smoke) { const k = (t * 0.09 * s.s + s.o) % 1, x = COTTAGE.x + px + 14 + k * 26 + Math.sin(k * 6 + s.o * 6) * 3, y = COTTAGE.y + py - 96 - k * 46; g.globalAlpha = (1 - k) * 0.35 * sm(k * 6); g.drawImage(K.glow(Math.round(4 + k * 9), '#8a78a8', 0.8), Math.round(x - 4 - k * 9), Math.round(y - 4 - k * 9)); }
    g.globalAlpha = 1;
    // lights over the props (windows, lamp, well)
    g.globalCompositeOperation = 'lighter';
    const fl = rm ? 1 : 0.88 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    g.globalAlpha = 0.55 * fl; g.drawImage(K.glow(22, '#eac979', 1), 176 + px - 22, 246 + py - 22);
    g.globalAlpha = 0.45 * pulse; g.drawImage(K.glow(30, '#8ff0d0', 0.8), WELL.x + px - 30, WELL.y + py - 46);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    // well motes rising
    for (let i = 0; i < 10; i++) { const k = rm ? (i / 10) : ((t * 0.18 + i / 10) % 1), x = WELL.x + px + Math.sin(i * 2.3 + (rm ? 0 : t)) * (5 + k * 6), y = WELL.y + py - 16 - k * 90; g.globalAlpha = (1 - k) * 0.9; g.fillStyle = i % 3 ? '#a5d6d8' : '#ebe1f7'; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
    g.globalAlpha = 1;
    // low mist over the meadow
    const lo = rm ? 0 : (t * 6) % W; g.globalAlpha = 0.42; g.drawImage(B.mist, Math.round(-lo + px), 250 + py); g.drawImage(B.mist, Math.round(W - lo + px), 250 + py); g.globalAlpha = 1;
    // fireflies
    for (const f of S.flies) {
      const x = f.x + (rm ? 0 : Math.sin(t * f.sp + f.ph) * 14 + Math.sin(t * f.sp * 2.3 + f.ph) * 4) + cam.x * f.z, y = f.y + (rm ? 0 : Math.cos(t * f.sp * 0.8 + f.ph) * 8) + cam.y * f.z;
      const a = rm ? 0.7 : clamp(0.25 + 0.75 * Math.sin(t * 1.7 + f.ph * 3)); if (a < 0.05) continue;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = a * 0.7; const rr = Math.round(3 + f.z * 3); g.drawImage(K.glow(rr, f.c, 1), Math.round(x) - rr, Math.round(y) - rr);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = a;
      if (!(MM.art && K.drawNight(g, 'mote_firefly', Math.round(x), Math.round(y) + 2, { t: t + f.ph, bloom: false }))) { g.fillStyle = f.c; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // foreground (depth 1.5)
    const [qx, qy] = o(1.5); g.drawImage(B.fg, -30 + qx, qy);
    g.drawImage(B.vig, 0, 0);
  }

  // ================================================================== menu (DOM)
  function savedAgo(ts) {
    if (!ts) return ''; const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'saved just now'; if (s < 3600) return 'saved ' + Math.floor(s / 60) + ' min ago'; if (s < 86400) return 'saved ' + Math.floor(s / 3600) + ' h ago';
    const d = Math.floor(s / 86400); return 'saved ' + d + (d === 1 ? ' day' : ' days') + ' ago';
  }
  const uiFn = (name, screen) => () => {
    const ui = MM.ui; if (!ui) return false;
    if (typeof ui[name] === 'function') { K.safe(() => ui[name]()); return true; }
    if (typeof ui.open === 'function' && ui.screens && ui.screens[screen]) { K.safe(() => ui.open(screen)); return true; }
    return false;
  };
  const CREDITS_FALLBACK = 'Moss & Moon — the project and its contributors.\nPixel art tooling: claude-pxl by crsolver — MIT License.\nPixel-art VFX library by Sprite Fusion (spritefusion.com/pixel-art-vfx) — MIT License, © 2026 Hugo Duprez.\nMusic & sound: procedural Web Audio, generated in your browser.';
  const CONTROLS_FALLBACK = 'Move: WASD / arrows / joystick · Cast: Space · Interact: E · Broom: B · Potion: H · Pause: Esc. Menus: arrows, Enter, Esc.';

  function buildWordmark() {
    const chars = 'MOSS & MOON';
    const sweep = el('linearGradient', { id: 'mmScrTitleSweep', gradientUnits: 'userSpaceOnUse', x1: '-30', y1: '0', x2: '30', y2: '0', gradientTransform: 'translate(-100,0)' },
      el('stop', { offset: '0', 'stop-color': '#fffdf4', 'stop-opacity': '0' }), el('stop', { offset: '.5', 'stop-color': '#fffdf4', 'stop-opacity': '.85' }), el('stop', { offset: '1', 'stop-color': '#fffdf4', 'stop-opacity': '0' }));
    const txt = (cls, extra) => el('text', Object.assign({ x: '200', y: '62', 'text-anchor': 'middle', class: cls }, extra || {}), chars.split('&')[0], el('tspan', { class: 'amp' }, '&'), chars.split('&')[1]);
    const svg = el('svg', { class: 'mm-title-mark', viewBox: '0 0 400 84', role: 'img', 'aria-label': 'Moss and Moon' },
      el('defs', null,
        el('linearGradient', { id: 'mmScrTitleFill', x1: '0', y1: '0', x2: '0', y2: '1' }, el('stop', { offset: '0', 'stop-color': '#fff8e2' }), el('stop', { offset: '.45', 'stop-color': '#f2dfb0' }), el('stop', { offset: '.75', 'stop-color': '#cfaa71' }), el('stop', { offset: '1', 'stop-color': '#9a7444' })),
        sweep, el('filter', { id: 'mmScrTitleBlur', x: '-20%', y: '-60%', width: '140%', height: '220%' }, el('feGaussianBlur', { stdDeviation: '4' }))),
      txt('glow', { filter: 'url(#mmScrTitleBlur)' }), txt('shad', { y: '64' }), txt('main'), txt('sweep'),
      // tiny crescent above the ampersand
      el('path', { class: 'moon', d: 'M200 6 a9 9 0 1 0 8 13 a7 7 0 1 1 -8 -13z' }));
    svg.style.fontFamily = FONT;
    return { svg, sweep };
  }

  let S = null;
  function enter(data) {
    const sess = K.session('title');
    S = { sess, t: 0, rm: K.reduced(), cam: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, flies: makeFlies(34), smoke: makeSmoke(), coreRenders: false, items: [], menuOffs: [], last: null, wasBusy: false, pad: { prev: {}, rep: {} }, sweepAt: 2.5 };
    buildLayers();
    sess.htmlClass('mm-scr-title');
    S.bg = sess.mount({ w: W, h: H });
    S.amb = sess.ambient('title', S.bg.canvas);
    const root = S.root = sess.root('mm-title', S.bg.canvas.parentNode);
    root.setAttribute('role', 'main'); root.setAttribute('aria-label', 'Moss and Moon — main menu');
    const wm = buildWordmark(); S.wm = wm;
    const brand = el('header', { class: 'mm-title-brand' }, wm.svg, el('p', { class: 'mm-title-tag', text: 'Restore Moonflower Grove after the Moonwell loses its light.' }));
    const nav = S.nav = el('nav', { class: 'mm-title-menu', 'aria-label': 'Main menu' });
    const foot = el('footer', { class: 'mm-title-foot' }, el('span', { class: 'mm-title-ver', text: 'v' + (MM.version || '') }),
      el('span', { class: 'mm-title-hint', 'aria-hidden': 'true' }, el('kbd', { text: '↑↓' }), ' choose  ', el('kbd', { text: 'Enter' }), ' select'));
    const ui = el('div', { class: 'mm-title-ui' }, brand, nav, foot);
    root.appendChild(ui);
    // events
    sess.on(document, 'keydown', onKey);
    sess.on(root, 'pointermove', (e) => { if (S.rm || e.pointerType === 'touch') return; const r = root.getBoundingClientRect(); S.aim.x = ((e.clientX - r.left) / r.width - 0.5) * -8; S.aim.y = ((e.clientY - r.top) / r.height - 0.5) * -4; });
    sess.on(root, 'pointerleave', () => { S.aim.x = 0; S.aim.y = 0; });
    if (MM.bus && MM.bus.on) { for (const ev of ['ui:close', 'save:erase', 'save:import', 'save', 'flow:flags', 'memory']) { const off = MM.bus.on(ev, () => { if (S) S.dirty = true; }); sess.offs.push(off); } }
    buildMenu();
    focusDefault();
    MM.bus && MM.bus.emit && MM.bus.emit('title:ready', { from: data && data.from });
  }
  function item(id, label, sub, act, opts) {
    opts = opts || {};
    const b = el('button', { type: 'button', class: 'mm-mbtn' + (opts.cls ? ' ' + opts.cls : ''), id: 'mm-title-' + id, 'data-act': id, disabled: !!opts.disabled, 'aria-describedby': opts.describedby || null, title: opts.title || null },
      el('span', { class: 'mm-mbtn-label', text: label }), sub ? el('span', { class: 'mm-mbtn-sub', text: sub }) : null);
    const on = (t, f) => S.menuOffs.push(S.sess.on(b, t, f));
    on('click', () => { if (b.disabled) return; S.last = id; K.sfx('ui_select'); act(); });
    on('pointerenter', (e) => { if (e.pointerType === 'mouse' && !b.disabled && document.activeElement !== b && !K.uiBusy()) { K.focus(b); } });
    on('focus', () => { S.last = id; K.sfx('ui_move', { volume: 0.5 }); });
    S.items.push(b);
    return b;
  }
  function buildMenu() {
    const nav = S.nav, keep = document.activeElement && nav.contains(document.activeElement) ? document.activeElement.dataset.act : S.last;
    for (const off of S.menuOffs.splice(0)) off();
    for (const b of S.items) b.remove(); S.items = []; nav.textContent = '';
    const info = MM.flow.saveInfo(); S.info = info; S.saveKey = info.status + '|' + (info.summary ? info.summary.savedAt : '');
    let sub = '', note = null;
    if (info.valid) { const s = info.summary; sub = [s.name, 'Lv ' + (s.level || 1), 'Day ' + (s.day || 1)].join(' · '); }
    else note = el('p', { class: 'mm-title-note', id: 'mm-title-cont-note', role: 'note', text: info.reason });
    const cont = item('continue', 'Continue', sub, () => MM.flow.continueGame(), { cls: 'mm-mbtn-main' + (info.valid ? ' mm-mbtn-primary' : ''), disabled: !info.valid, describedby: info.valid ? 'mm-title-cont-card' : 'mm-title-cont-note' });
    const ng = item('new', 'New Game', info.valid ? 'Replaces your saved journey' : 'Begin your journey', () => MM.flow.newGame(), { cls: 'mm-mbtn-main' + (info.valid ? '' : ' mm-mbtn-primary') });
    const top = el('div', { class: 'mm-title-main' });
    if (info.valid) {
      const s = info.summary;
      const card = el('p', { class: 'mm-title-card', id: 'mm-title-cont-card' },
        el('span', { class: 'mm-title-card-ch', text: 'Chapter ' + (s.chapter || 0) + (CHAPTERS[s.chapter] ? ' · ' + CHAPTERS[s.chapter] : '') }),
        el('span', { class: 'mm-title-card-at', text: savedAgo(s.savedAt) }));
      top.append(cont, ng); nav.append(top, card);
    } else { top.append(ng, cont); nav.append(top, note); }
    const tutOk = MM.flow.tutorialAvailable(), done = MM.flow.flags().tutorialDone;
    const memOk = !!(MM.ui && (typeof MM.ui.openMemories === 'function' || (MM.ui.screens && MM.ui.screens.memories)));
    const grid = el('div', { class: 'mm-title-grid' },
      item('tutorial', done ? 'Tutorial' : 'Tutorial', null, () => MM.flow.startTutorial({ replay: done, from: 'title' }), { disabled: !tutOk, title: tutOk ? (done ? 'Practise the basics again' : 'Learn the basics in the training yard') : 'The tutorial is not available in this build' }),
      item('intro', 'Replay Intro', null, () => MM.flow.toIntro({ replay: true }), { disabled: !(MM.cine && MM.cine.play), title: 'Watch the opening story again' }),
      item('memories', 'Memories', null, () => uiFn('openMemories', 'memories')(), { disabled: !memOk, title: memOk ? 'Story scenes you have witnessed' : 'Unlocked as you play' }),
      item('settings', 'Settings', null, () => { if (!uiFn('openSettings', 'settings')()) K.alert({ title: 'Settings', body: 'Settings are unavailable in this build.' }); }),
      item('controls', 'Controls', null, () => { if (!uiFn('openControls', 'controls')()) K.alert({ title: 'Controls', body: CONTROLS_FALLBACK }); }),
      item('credits', 'Credits', null, () => { if (!uiFn('openCredits', 'credits')()) K.alert({ title: 'Credits', body: CREDITS_FALLBACK }); }));
    nav.appendChild(grid);
    S.dirty = false;
    if (keep) { const b = S.items.find((x) => x.dataset.act === keep && !x.disabled); if (b && document.activeElement && (document.activeElement === document.body || !document.activeElement.isConnected || nav.contains(document.activeElement) || document.activeElement === null)) K.focus(b); }
  }
  function focusDefault() { const b = S.items.find((x) => !x.disabled && x.classList.contains('mm-mbtn-primary')) || S.items.find((x) => !x.disabled); K.focus(b); }
  function enabled() { return S.items.filter((b) => !b.disabled && b.offsetParent !== null); }
  function move(dir) {
    const list = enabled(); if (!list.length) return;
    const cur = document.activeElement; if (!list.includes(cur)) { focusDefault(); return; }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bs = Infinity;
    for (const b of list) {
      if (b === cur) continue; const q = b.getBoundingClientRect(), qx = q.left + q.width / 2, qy = q.top + q.height / 2;
      const along = (qx - cx) * v[0] + (qy - cy) * v[1]; if (along <= 4) continue;
      const perp = Math.abs((qx - cx) * v[1]) + Math.abs((qy - cy) * v[0]);
      const sc = along + perp * 2.2; if (sc < bs) { bs = sc; best = b; }
    }
    if (!best && v[1]) { // wrap vertically
      const sorted = list.slice().sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return (A.top - B.top) * v[1] || Math.abs(A.left - r.left) - Math.abs(B.left - r.left); });
      best = sorted[0];
    }
    if (best) K.focus(best);
  }
  function onKey(e) {
    if (!S || e.ctrlKey || e.metaKey || e.altKey || K.uiBusy()) return;
    const k = e.key, t = e.target;
    if (t && t.closest && t.closest('.mm-scr-modal')) return;
    const nav = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right' }[k];
    if (nav) { e.preventDefault(); move(nav); return; }
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault(); if (e.repeat) return;
      const a = document.activeElement; if (a && S.items.includes(a)) a.click(); else focusDefault(); return;
    }
    if (k === 'Escape') { e.preventDefault(); focusDefault(); return; }
    if (k === 'Tab') { // keep Tab inside the menu
      const list = enabled(); if (!list.length) return; e.preventDefault();
      const i = list.indexOf(document.activeElement); K.focus(list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length] || list[0]);
    }
  }
  function pollPad(now) {
    let gp = null; try { gp = navigator.getGamepads ? Array.from(navigator.getGamepads()).find(Boolean) : null; } catch (e) { gp = null; }
    if (!gp) return;
    const P = S.pad, b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const st = { up: b(12) || ay < -0.55, down: b(13) || ay > 0.55, left: b(14) || ax < -0.55, right: b(15) || ax > 0.55, a: b(0) };
    for (const d of ['up', 'down', 'left', 'right']) { if (!st[d]) { P.rep[d] = 0; continue; } if (!P.prev[d]) { P.rep[d] = now + 0.38; move(d); } else if (now >= P.rep[d]) { P.rep[d] = now + 0.12; move(d); } }
    if (st.a && !P.prev.a) { const a = document.activeElement; if (a && S.items.includes(a)) a.click(); }
    P.prev = st;
  }
  function update(dt) {
    if (!S) return;
    S.t += dt;
    const k = 1 - Math.exp(-dt * 3);
    S.cam.x += ((S.rm ? 0 : S.aim.x + Math.sin(S.t * 0.15) * 2) - S.cam.x) * k;
    S.cam.y += ((S.rm ? 0 : S.aim.y + Math.cos(S.t * 0.11) * 1) - S.cam.y) * k;
    const busy = K.uiBusy();
    if (S.wasBusy && !busy) { S.dirty = true; S.refocus = true; }
    S.wasBusy = busy;
    if (S.dirty && !busy) { buildMenu(); if (S.refocus) { S.refocus = false; const b = S.items.find((x) => x.dataset.act === S.last && !x.disabled); if (b) K.focus(b); else focusDefault(); } }
    if (!busy) {
      if (!S.pollT || S.t - S.pollT > 1) { S.pollT = S.t; const info = MM.flow.saveInfo(), key = info.status + '|' + (info.summary ? info.summary.savedAt : ''); if (key !== S.saveKey) S.dirty = true; }
      const a = document.activeElement; if ((!a || a === document.body) && S.t > 0.2) focusDefault();
      pollPad(S.t);
    }
    if (S && !S.coreRenders) render();
  }
  function render() {
    if (!S || !S.bg) return;
    drawBackdrop(S.bg.ctx, S);
    // wordmark light sweep every ~9 s
    if (!S.rm) { const c = (S.t - S.sweepAt) % 9; const p = c >= 0 && c < 1.4 ? c / 1.4 : -1; if (p >= 0) { S.wm.sweep.setAttribute('gradientTransform', 'translate(' + (40 + p * 320).toFixed(1) + ',0) skewX(-24)'); S.wm.svg.classList.add('mm-sweeping'); } else S.wm.svg.classList.remove('mm-sweeping'); }
    if (S.amb) S.amb.update(0.05);
    S.root.firstChild.style.setProperty('--mm-in', sm(seg(S.t, 0, S.rm ? 0.3 : 0.8)).toFixed(3));
  }
  function cleanup() { if (S) { S.sess.dispose(); S = null; } }
  const def = {
    sim: 'none', draw: 'none', audio: { music: 'title', fade: 1.5 },
    enter, update, render() { if (S) { S.coreRenders = true; render(); } }, exit() {}, cleanup,
    _debug: () => (S ? { t: S.t, items: S.items.map((b) => ({ id: b.dataset.act, disabled: b.disabled })), focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act : null, info: S.info } : null),
  };
  if (MM.screens && typeof MM.screens.register === 'function') MM.screens.register('title', def);
  MM.flow.title = def;
})();
