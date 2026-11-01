'use strict';
// Moss & Moon — interior scene renderer (owner: INTERIORS). Draws the room of the current MM.interiors instance:
// pixel-painted iso floor + back walls (baked once per room), windows (glass follows the time of day), cut-away front
// wall with the doorway, furniture depth-sorted with the player (baseline drawCharacter) and NPCs, warm light pools via
// a multiply light map, window beams, dust motes and small ambient animation. 1 world tile = 32x16 px, 1:1 with the witch.
// Furniture/wall pieces use claude-pxl sprites from MM.art when present (names in MM.BUILDINGS); otherwise a TEMPORARY
// procedural fallback in the same palette is drawn and the name is recorded in MM.interiorRender.fallbacks (ART2 list).
window.MM = window.MM || {};
(function () {
  const MM = window.MM;
  if (!MM.BUILDINGS) return;
  const BD = MM.BUILDINGS, U = BD.unit;
  const PAL = { k: '#263a37', j: '#2f4b47', t: '#46695f', T: '#6a907f', G: '#4b7052', g: '#688d65', h: '#87ad7b', H: '#a6c593', y: '#d2e3ad',
    d: '#4a3a31', D: '#6e5642', w: '#8f7a5a', W: '#b89d72', s: '#c8aa86', S: '#4e5660', r: '#737d7e', R: '#9ea79f', q: '#d5d6bd',
    c: '#f7f4e9', C: '#e2dcc2', a: '#9a7444', o: '#cfaa71', O: '#eac979', Y: '#fff3c4', m: '#4f4566', v: '#8a78a8', l: '#c6aedb', L: '#ebe1f7',
    b: '#36636f', B: '#5f9ca3', i: '#a5d6d8', e: '#8a4a40', E: '#d27a55', p: '#e8b8a8', f: '#c95d6a', x: '#2e2638', X: '#7b4f7d', z: '#8ff0d0', u: '#59573a', U: '#8b8a58' };
  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const RGB = {}; for (const k in PAL) RGB[k] = hexRgb(PAL[k]);
  const col = (c) => (c && c[0] === '#' ? c : PAL[c] || PAL.k);
  const rgb = (c) => (c && c[0] === '#' ? hexRgb(c) : RGB[c] || RGB.k);
  function hsh(a, b, n) { let x = Math.imul((a | 0) + 1013, 73856093) ^ Math.imul((b | 0) + 2027, 19349663) ^ Math.imul((n | 0) + 307, 83492791); x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
  const art = () => (MM.art && MM.art.ready ? MM.art : null);
  const has = (n) => { const A = art(); return !!(A && n && A.has(n)); };
  const fallbacks = new Set();
  const T = U.wall.thickness, WH = U.wall.height, CUT = U.wall.cutaway;
  const setting = (k, d) => { try { const v = MM.settings && MM.settings.get(k); return v === undefined ? d : v; } catch (e) { return d; } };

  // ================================================================== view (projection of the current room onto the canvas)
  function view(inst, w, h) {
    w = w || 512; h = h || 320;
    const I = inst.I, W = I.W, D = I.D;
    const minX = -16 * (D + T) - 2, maxX = 16 * (W + T) + 2, minY = -WH - 10, maxY = 8 * (W + D) + 8 * T * 2 + 4;
    const ox = Math.round(w / 2 - (minX + maxX) / 2), oy = Math.round(h / 2 - (minY + maxY) / 2 + 4);
    const v = {
      ox, oy, W, D, w, h, bbox: [minX + ox, minY + oy, maxX + ox, maxY + oy],
      p(lx, ly, z) { return { x: Math.round(ox + (lx - ly) * 16), y: Math.round(oy + (lx + ly) * 8 - (z || 0)) }; },
      toLocal(sx, sy) { const dx = sx - ox, dy = sy - oy; return { x: (dx / 16 + dy / 8) / 2, y: (dy / 8 - dx / 16) / 2 }; },
    };
    return v;
  }

  // ================================================================== time of day
  function dayInfo() {
    let t = 0.3; try { t = world.time; } catch (e) { /* */ } // eslint-disable-line no-undef
    let dark; if (t >= 0.68 || t < 0.08) dark = 1; else if (t >= 0.56) dark = (t - 0.56) / 0.12; else if (t < 0.18) dark = 1 - (t - 0.08) / 0.1; else dark = 0;
    const dusk = t >= 0.5 && t < 0.72 ? 1 - Math.abs(t - 0.62) / 0.12 : 0;
    return { t, dark: Math.max(0, Math.min(1, dark)), dusk: Math.max(0, Math.min(1, dusk)) };
  }

  // ================================================================== baked room (floor + back walls), per interior key
  const bakes = new Map();
  const FLOORS = {
    planks(lx, ly, seed) { const bi = Math.floor(ly * 4), f = ly * 4 - bi; if (f < 0.1) return 'd'; const off = hsh(bi, 3, seed) * 1.5, e = (lx + off) / 1.5, fe = e - Math.floor(e); if (fe < 0.025) return 'd';
      const v = hsh(bi, Math.floor(e), seed + 1); const nail = fe > 0.06 && fe < 0.07 && f > 0.4 && f < 0.6; return nail ? 'D' : v < 0.3 ? 'w' : v < 0.8 ? 'W' : 's'; },
    boards(lx, ly, seed) { const bi = Math.floor(lx * 3), f = lx * 3 - bi; if (f < 0.09) return 'd'; const off = hsh(bi, 5, seed) * 2, e = (ly + off) / 2, fe = e - Math.floor(e); if (fe < 0.02) return 'd';
      const v = hsh(bi, Math.floor(e), seed + 2); return v < 0.35 ? 'D' : v < 0.85 ? 'w' : 'a'; },
    herbs(lx, ly, seed) { const c = FLOORS.planks(lx, ly, seed); const n = hsh(Math.floor(lx * 20), Math.floor(ly * 20), seed + 9); return n < 0.012 ? 'g' : n < 0.018 ? 'h' : n < 0.021 ? 'y' : c; },
    flagstone(lx, ly, seed) { const row = Math.floor(ly / 0.7), off = (row % 2) * 0.45, fx = (lx + off) / 0.9, ci = Math.floor(fx), u = fx - ci, vv = ly / 0.7 - row;
      if (u < 0.05 || vv < 0.09) return 'S'; const v = hsh(ci, row, seed); const sp = hsh(Math.floor(lx * 24), Math.floor(ly * 24), seed + 4) < 0.06; return sp ? 'r' : v < 0.3 ? 'r' : v < 0.85 ? 'R' : 'q'; },
  };
  const WALLS = {
    plaster: { a: ['C', 'c', 'q'], b: ['q', 'C', 'R'], trim: 'D', dark: 'd' }, stone: { a: ['R', 'q', 'r'], b: ['r', 'R', 'S'], trim: 'S', dark: 'S' },
    log: { a: ['a', 'o', 'D'], b: ['D', 'a', 'd'], trim: 'd', dark: 'd' }, plank: { a: ['W', 's', 'w'], b: ['w', 'W', 'D'], trim: 'd', dark: 'd' },
  };
  function wallPix(mat, side, s, z, len, seed) {
    const m = WALLS[mat] || WALLS.plaster, sh = side === 'y0' ? m.a : m.b;
    if (z < 4) return z === 3 ? m.dark : m.trim;                     // baseboard
    if (z >= WH - 3) return z === WH - 1 ? m.dark : m.trim;          // top plate
    if (mat === 'log') { const pr = 6, zz = z - 4; if (zz % pr === pr - 1) return 'd'; if (zz % pr === 0) return sh[1]; const v = hsh(Math.floor((s + (Math.floor(zz / pr) % 2) * 11) / 15), Math.floor(zz / pr), seed); return v < 0.15 ? sh[2] : sh[0]; }
    if (mat === 'plank') { const bi = Math.floor(s / 7); if (s % 7 === 0) return 'd'; const v = hsh(bi, Math.floor(z / 30), seed); return v < 0.25 ? sh[2] : v < 0.7 ? sh[0] : sh[1]; }
    if (mat === 'stone') { const row = Math.floor((z - 4) / 7), off = (row % 2) * 6; if ((z - 4) % 7 === 6 || (s + off) % 13 === 0) return side === 'y0' ? 'r' : 'S'; const v = hsh(Math.floor((s + off) / 13), row, seed); return v < 0.25 ? sh[1] : v < 0.85 ? sh[0] : sh[2]; }
    // plaster with timber framing (posts every 24 face px, rail at 58%)
    if ((s % 24 === 0 && s > 0 && s < len - 1) || z === Math.floor(WH * 0.58) || z === Math.floor(WH * 0.58) + 1) return m.trim;
    const v = hsh(s, z, seed); return v < 0.04 ? sh[2] : v < 0.12 ? sh[1] : sh[0];
  }
  function bake(inst, v) {
    const I = inst.I, key = I.key + ':' + v.ox + ',' + v.oy + ':' + v.w + 'x' + v.h;
    let b = bakes.get(key); if (b) return b;
    const Wc = v.w, Hc = v.h, img = new ImageData(Wc, Hc), px = img.data;
    const put = (x, y, c, a) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= Wc || y >= Hc) return; const i = (y * Wc + x) * 4, cc = rgb(c); px[i] = cc[0]; px[i + 1] = cc[1]; px[i + 2] = cc[2]; px[i + 3] = a == null ? 255 : a; };
    const def = I.def, seed = (I.key.length * 31) | 0, floorFn = FLOORS[def.floor] || FLOORS.planks, mat = def.wall || 'plaster';
    // floor (with contact darkening along the back walls)
    const [x0, y0, x1, y1] = v.bbox;
    for (let y = Math.max(0, y0); y < Math.min(Hc, y1); y++) for (let x = Math.max(0, x0); x < Math.min(Wc, x1); x++) {
      const L = v.toLocal(x + 0.5, y + 0.5); if (L.x < 0 || L.y < 0 || L.x > I.W || L.y > I.D) continue;
      let c = floorFn(L.x, L.y, seed);
      const ao = Math.min(L.x, L.y);
      if (ao < 0.12) c = c === 'd' ? 'x' : 'd'; else if (ao < 0.3 && hsh(x, y, 5) < 0.5) c = ({ s: 'W', W: 'w', w: 'D', D: 'd', a: 'D', q: 'R', R: 'r', r: 'S' })[c] || c;
      put(x, y, c);
    }
    // back walls: y0 (top vertex -> right vertex, s rightwards) and x0 (top vertex -> left vertex, s leftwards)
    const top = v.p(0, 0, 0);
    const lenY0 = Math.round(I.W * 16), lenX0 = Math.round(I.D * 16);
    for (let s = 0; s < lenY0; s++) for (let z = 0; z < WH; z++) put(top.x + s, top.y + Math.floor(s / 2) - z, wallPix(mat, 'y0', s, z, lenY0, seed));
    for (let s = 0; s < lenX0; s++) for (let z = 0; z < WH; z++) put(top.x - 1 - s, top.y + Math.floor(s / 2) - z, wallPix(mat, 'x0', s, z, lenX0, seed + 7));
    // corner post where the two back walls meet
    for (let z = 0; z < WH; z++) { put(top.x, top.y - z, 'd'); put(top.x - 1, top.y - z, 'D'); }
    // wall top caps (thickness T outward) + outline
    const cap = Math.round(T * 16);
    for (let s = -cap; s < lenY0 + cap; s++) for (let k = 0; k < cap; k++) put(top.x + s + k, top.y + Math.floor((s - k) / 2) - WH - k / 2, k === cap - 1 ? 'k' : mat === 'stone' ? 'r' : 'd');
    for (let s = -cap; s < lenX0 + cap; s++) for (let k = 0; k < cap; k++) put(top.x - 1 - s - k, top.y + Math.floor((s - k) / 2) - WH - k / 2, k === cap - 1 ? 'k' : mat === 'stone' ? 'S' : 'd');
    // outer ends of the back walls (thickness visible at the left and right vertices)
    const lv = v.p(0, I.D, 0), rv = v.p(I.W, 0, 0);
    for (let z = CUT; z < WH; z++) for (let k = 0; k < cap; k++) { put(lv.x - 1 - k, lv.y - z - Math.floor(k / 2) + Math.floor(k / 2), k === cap - 1 ? 'k' : 'D'); put(rv.x + k, rv.y - z, k === cap - 1 ? 'k' : 'D'); }
    const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; c.getContext('2d').putImageData(img, 0, 0);
    b = { c, key }; bakes.set(key, b);
    if (bakes.size > 12) bakes.delete(bakes.keys().next().value);
    return b;
  }

  // ================================================================== small drawing helpers
  function F(g, c, x, y, w, h) { g.fillStyle = col(c); g.fillRect(Math.round(x), Math.round(y), w, h); }
  // pixel on a wall face: wall 'y0' runs right-down from the top vertex, 'x0' runs left-down. s = face px from the top vertex.
  function wallPt(v, wall, s, z) { const t = v.p(0, 0, 0); return wall === 'y0' ? { x: t.x + s, y: t.y + Math.floor(s / 2) - z } : { x: t.x - 1 - s, y: t.y + Math.floor(s / 2) - z }; }
  function wpx(g, v, wall, s, z, c) { const p = wallPt(v, wall, s, z); F(g, c, p.x, p.y, 1, 1); }
  // iso box from local rect + z range. faces: top, left (y=y1, lower-left), right (x=x1, lower-right)
  function box(g, v, r, z0, h, c) {
    const [x0, y0, x1, y1] = r, P = (x, y, z) => v.p(x, y, z);
    const a = P(x0, y1, z0), b = P(x1, y1, z0), cc = P(x1, y0, z0), at = P(x0, y1, z0 + h), bt = P(x1, y1, z0 + h), ct = P(x1, y0, z0 + h), dt = P(x0, y0, z0 + h);
    const poly = (pts, fill) => { g.fillStyle = col(fill); g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); g.closePath(); g.fill(); };
    if (h > 0) { poly([a, b, bt, at], c.left); poly([b, cc, ct, bt], c.right); }
    poly([at, bt, ct, dt], c.top);
    if (c.outline !== false) {
      g.strokeStyle = col(c.outline || 'k'); g.lineWidth = 1; g.beginPath();
      const L = (p, q) => { g.moveTo(p.x + 0.5, p.y + 0.5); g.lineTo(q.x + 0.5, q.y + 0.5); };
      L(at, bt); L(bt, ct); L(ct, dt); L(dt, at); if (h > 0) { L(a, b); L(b, cc); L(a, at); L(b, bt); L(cc, ct); } g.stroke();
      if (h > 0) { g.strokeStyle = col(c.hi || c.top); g.beginPath(); L({ x: at.x + 1, y: at.y + 1 }, { x: bt.x - 1, y: bt.y }); g.stroke(); }
    }
  }
  // pixel on the FRONT face of an item (native: left face y=y1; rot y: right face x=x1). s = px from the face's left end.
  function frontPt(v, f, s, z) {
    const [x0, y0, x1, y1] = f.rect;
    if (f.rot === 'y') { const p = v.p(x1, y1, z); return { x: p.x + s, y: p.y - Math.floor(s / 2) }; }
    const p = v.p(x0, y1, z); return { x: p.x + s, y: p.y + Math.floor(s / 2) };
  }
  const frontLen = (f) => Math.round((f.rot === 'y' ? f.rect[3] - f.rect[1] : f.rect[2] - f.rect[0]) * 16);
  function fpx(g, v, f, s, z, c) { const p = frontPt(v, f, s, z); F(g, c, p.x, p.y, 1, 1); }
  const WOOD = { top: 'W', left: 'w', right: 'D', hi: 's' }, DWOOD = { top: 'w', left: 'D', right: 'd', hi: 'W' }, STONE = { top: 'R', left: 'r', right: 'S', hi: 'q' };
  const shrink = (r, a) => [r[0] + a, r[1] + a, r[2] - a, r[3] - a];

  // ================================================================== furniture: sprite or marked fallback
  function spriteFor(f) {
    const s = BD.furniture[f.type]; if (!s) return null;
    if (f.open && s.open && has(s.open)) return s.open;
    for (const n of s.sprite || []) if (has(n)) return n;
    return null;
  }
  function drawSprite(g, v, f, name, t) {
    const A = art(), p = v.p(f.rect[2], f.rect[3], 0);
    A.draw(g, name, p.x, p.y, { t, flip: f.rot === 'y' });
  }
  const FB = {
    bed(g, v, f, t) {
      const r = f.rect, rot = f.rot === 'y', head = rot ? [r[0], r[1], r[0] + 0.2, r[3]] : [r[0], r[1], r[2], r[1] + 0.2];
      box(g, v, r, 0, 9, DWOOD);
      const m = rot ? [r[0] + 0.15, r[1] + 0.05, r[2] - 0.03, r[3] - 0.05] : [r[0] + 0.05, r[1] + 0.15, r[2] - 0.05, r[3] - 0.03];
      box(g, v, m, 9, 6, { top: 'B', left: 'b', right: 'b', hi: 'i' });
      const pil = rot ? [m[0] + 0.05, m[1] + 0.12, m[0] + 0.45, m[3] - 0.12] : [m[0] + 0.12, m[1] + 0.05, m[2] - 0.12, m[1] + 0.45];
      box(g, v, pil, 15, 3, { top: 'c', left: 'C', right: 'q' });
      const quilt = rot ? [m[0] + 0.55, m[1], m[2], m[3]] : [m[0], m[1] + 0.55, m[2], m[3]];
      box(g, v, quilt, 15, 2, { top: 'f', left: 'e', right: 'e', hi: 'p' });
      // quilt patches
      for (let i = 0; i < 6; i++) { const lx = quilt[0] + (quilt[2] - quilt[0]) * hsh(i, 1, 4), ly = quilt[1] + (quilt[3] - quilt[1]) * hsh(i, 2, 4), p = v.p(lx, ly, 17); F(g, i % 2 ? 'p' : 'O', p.x, p.y, 2, 1); }
      box(g, v, head, 0, 26, DWOOD);
      const hp = v.p(rot ? head[2] : (head[0] + head[2]) / 2, rot ? (head[1] + head[3]) / 2 : head[3], 20); F(g, 'O', hp.x - 1, hp.y, 2, 2);
    },
    chest(g, v, f) {
      box(g, v, f.rect, 0, 11, { top: 'a', left: 'D', right: 'd', hi: 'o' });
      const len = frontLen(f);
      for (let s = 0; s < len; s++) { fpx(g, v, f, s, 7, 'd'); if (s === 1 || s === len - 2) for (let z = 1; z < 11; z++) fpx(g, v, f, s, z, 'S'); }
      if (f.open) { const r = f.rect, lid = f.rot === 'y' ? [r[0], r[1], r[0] + 0.12, r[3]] : [r[0], r[1], r[2], r[1] + 0.12]; box(g, v, lid, 11, 12, { top: 'a', left: 'D', right: 'd' }); const ins = v.p((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 11); F(g, 'x', ins.x - 4, ins.y - 1, 8, 2); F(g, 'O', ins.x - 1, ins.y - 2, 2, 1); }
      else { box(g, v, shrink(f.rect, -0.02), 11, 5, { top: 'o', left: 'a', right: 'D', hi: 'O' }); const c = frontPt(v, f, Math.floor(len / 2), 9); F(g, 'O', c.x - 1, c.y, 2, 3); F(g, 'Y', c.x - 1, c.y, 1, 1); }
    },
    hearth(g, v, f, t) {
      const r = f.rect; box(g, v, r, 0, 34, STONE);
      const len = frontLen(f);
      for (let s = 0; s < len; s++) for (let z = 0; z < 34; z++) if ((s + (Math.floor(z / 5) % 2) * 4) % 8 === 0 || z % 5 === 4) fpx(g, v, f, s, z, 'r');
      // firebox opening
      const a = Math.round(len * 0.22), b = Math.round(len * 0.78);
      for (let s = a; s < b; s++) for (let z = 2; z < 22; z++) { const arch = z > 18 && (s - a < 2 || b - s < 3); fpx(g, v, f, s, z, arch ? 'S' : z < 4 ? 'S' : 'x'); }
      if (f.lit) {
        for (let s = a + 2; s < b - 2; s++) { const ph = Math.sin(t * 9 + s * 1.7) * 0.5 + Math.sin(t * 13 + s * 0.6) * 0.5, hgt = 6 + Math.round((ph + 1) * 4 * (1 - Math.abs(s - (a + b) / 2) / ((b - a) / 2 + 1)));
          for (let z = 4; z < 4 + hgt; z++) fpx(g, v, f, s, z, z > 4 + hgt * 0.7 ? 'E' : z > 4 + hgt * 0.35 ? 'O' : 'Y'); }
        for (let s = a + 1; s < b - 1; s += 2) fpx(g, v, f, s, 3, 'e');
      } else for (let s = a + 2; s < b - 2; s++) fpx(g, v, f, s, 3, hsh(s, 1, 2) < 0.3 ? 'e' : 'r');
      // mantel + chimney breast up to the eave
      box(g, v, shrink(r, -0.06), 34, 3, DWOOD);
      const ch = f.rot === 'y' ? [r[0], r[1] + 0.35, r[0] + 0.45, r[3] - 0.35] : [r[0] + 0.35, r[1], r[2] - 0.35, r[1] + 0.45];
      box(g, v, ch, 37, WH - 37, STONE);
    },
    bookcase(g, v, f) {
      box(g, v, f.rect, 0, f.h, DWOOD);
      const len = frontLen(f), BOOK = ['f', 'B', 'U', 'v', 'E', 'g', 'O', 'b', 'X'];
      for (let row = 0; row < 4; row++) { const z0 = 4 + row * 13; for (let s = 2; s < len - 2; s++) { fpx(g, v, f, s, z0 - 1, 'd'); const bi = Math.floor((s + row * 3) / 2.5), tall = 7 + Math.floor(hsh(bi, row, 7) * 4), gap = hsh(bi, row, 9) < 0.12;
        if (!gap) for (let z = z0; z < z0 + tall; z++) fpx(g, v, f, s, z, (s + row) % 3 === 0 && z === z0 + tall - 1 ? 'Y' : BOOK[Math.floor(hsh(bi, row, 3) * BOOK.length)]); else for (let z = z0; z < z0 + 11; z++) fpx(g, v, f, s, z, 'x'); } }
    },
    wardrobe(g, v, f) {
      box(g, v, f.rect, 0, f.h, DWOOD); const len = frontLen(f);
      for (let z = 2; z < f.h - 2; z++) { fpx(g, v, f, Math.floor(len / 2), z, 'd'); fpx(g, v, f, 1, z, 'd'); fpx(g, v, f, len - 2, z, 'd'); }
      for (let s = Math.floor(len / 2) + 3; s < len - 4; s++) for (let z = 26; z < 48; z++) fpx(g, v, f, s, z, (s + z) % 7 === 0 ? 'c' : z > 44 ? 'q' : 'i');
      fpx(g, v, f, Math.floor(len / 2) - 2, 30, 'O'); fpx(g, v, f, Math.floor(len / 2) + 2, 30, 'O');
    },
    rug(g, v, f) {
      const [x0, y0, x1, y1] = f.rect, cl = BD.furniture[f.type].cloth || '#8a4a40';
      const round = f.type === 'rug_round', cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
      for (let lx = x0; lx < x1; lx += 1 / 32) for (let ly = y0; ly < y1; ly += 1 / 32) {
        const dx = (lx - cx) / rx, dy = (ly - cy) / ry, d = round ? Math.hypot(dx, dy) : Math.max(Math.abs(dx), Math.abs(dy)); if (d > 1) continue;
        const p = v.p(lx, ly, 0); const band = d > 0.86 ? 'O' : d > 0.78 ? 'd' : (Math.floor(d * 6) % 2 ? cl : (f.type === 'doormat' ? 'a' : 'p'));
        F(g, d > 0.94 ? 'x' : band, p.x, p.y, 1, 1);
      }
    },
    table(g, v, f) {
      const r = f.rect, leg = 0.12; for (const [a, b] of [[r[0], r[1]], [r[2] - leg, r[1]], [r[0], r[3] - leg], [r[2] - leg, r[3] - leg]]) box(g, v, [a, b, a + leg, b + leg], 0, f.h - 3, DWOOD);
      box(g, v, r, f.h - 3, 3, WOOD);
      if (f.type === 'worktable' || f.id === 'table') { const items = f.type === 'worktable' ? ['G', 'z', 'E', 'B'] : ['c', 'O']; items.forEach((c, i) => { const p = v.p(r[0] + 0.3 + i * 0.32 * (f.rot === 'y' ? 0.3 : 1), r[1] + 0.35 + i * 0.32 * (f.rot === 'y' ? 1 : 0.2), f.h); F(g, 'k', p.x - 2, p.y - 6, 4, 6); F(g, c, p.x - 1, p.y - 5, 2, 4); F(g, 'Y', p.x - 1, p.y - 5, 1, 1); }); }
    },
    chair(g, v, f) { const r = f.rect; box(g, v, r, 0, 12, DWOOD); const back = f.rot === 'y' ? [r[0], r[1], r[0] + 0.12, r[3]] : [r[0], r[1], r[2], r[1] + 0.12]; box(g, v, back, 12, 14, DWOOD); },
    stool(g, v, f) { box(g, v, f.rect, 0, f.h, WOOD); },
    armchair(g, v, f) { const r = f.rect, cl = { top: 'X', left: 'm', right: 'x', hi: 'l' }; box(g, v, r, 0, 14, cl); const back = f.rot === 'y' ? [r[0], r[1], r[0] + 0.22, r[3]] : [r[0], r[1], r[2], r[1] + 0.22]; box(g, v, back, 14, 16, cl); box(g, v, shrink(r, 0.15), 14, 2, { top: 'l', left: 'X', right: 'm' }); },
    counter(g, v, f) {
      box(g, v, f.rect, 0, f.h - 3, DWOOD); box(g, v, shrink(f.rect, -0.04), f.h - 3, 3, WOOD);
      const len = frontLen(f); for (let s = 0; s < len; s += 12) for (let z = 2; z < f.h - 4; z++) fpx(g, v, f, s, z, 'd');
      const r = f.rect; const at = (k, z) => v.p(r[0] + (r[2] - r[0]) * k, (r[1] + r[3]) / 2, z);
      let p = at(0.2, f.h); F(g, 'S', p.x - 4, p.y - 2, 8, 2); F(g, 'O', p.x - 3, p.y - 6, 2, 4); F(g, 'O', p.x + 2, p.y - 5, 2, 3); F(g, 'r', p.x, p.y - 8, 1, 6);
      p = at(0.55, f.h); F(g, 'k', p.x - 3, p.y - 7, 6, 7); F(g, 'f', p.x - 2, p.y - 6, 4, 5); F(g, 'p', p.x - 2, p.y - 6, 1, 1);
      p = at(0.8, f.h); for (let i = 0; i < 3; i++) { F(g, 'k', p.x - 4 + i * 3, p.y - 5, 3, 5); F(g, ['B', 'G', 'O'][i], p.x - 3 + i * 3, p.y - 4, 1, 4); }
    },
    shelves(g, v, f) {
      box(g, v, f.rect, 0, f.h, DWOOD); const len = frontLen(f), JAR = ['B', 'G', 'O', 'E', 'z', 'l', 'U'];
      for (let row = 0; row < 3; row++) { const z0 = 4 + row * 15; for (let s = 1; s < len - 1; s++) { fpx(g, v, f, s, z0 - 1, 'd'); fpx(g, v, f, s, z0 - 2, 'W'); }
        for (let k = 3; k < len - 4; k += 5) { const c = JAR[Math.floor(hsh(k, row, 11) * JAR.length)], hh = 6 + Math.floor(hsh(k, row, 3) * 4); for (let s = k; s < k + 3; s++) for (let z = z0; z < z0 + hh; z++) fpx(g, v, f, s, z, s === k && z > z0 + 1 ? 'Y' : z === z0 + hh - 1 ? 'k' : c); } }
    },
    drying_rack(g, v, f, t) {
      const r = f.rect, rot = f.rot === 'y', post = 0.1;
      const ends = rot ? [[r[0], r[1]], [r[0], r[3] - post]] : [[r[0], r[1]], [r[2] - post, r[1]]];
      for (const [a, b] of ends) box(g, v, [a, b, a + post, b + post + (rot ? 0 : 0.2)], 0, f.h, DWOOD);
      const len = frontLen(f); for (let s = 0; s < len; s++) fpx(g, v, f, s, f.h - 4, 'd');
      for (let k = 3; k < len - 2; k += 4) { const sway = Math.round(Math.sin(t * 1.2 + k) * 0.6), c = hsh(k, 1, 5) < 0.5 ? 'g' : 'G', hh = 10 + Math.floor(hsh(k, 2, 5) * 8);
        for (let z = f.h - 5 - hh; z < f.h - 4; z++) { fpx(g, v, f, k + (z < f.h - 10 ? sway : 0), z, z === f.h - 5 ? 'a' : c); if (z < f.h - 8) fpx(g, v, f, k + 1 + (z < f.h - 10 ? sway : 0), z, hsh(k, z, 3) < 0.3 ? 'h' : c); } }
    },
    display_case(g, v, f, t) {
      box(g, v, f.rect, 0, 14, DWOOD);
      const r = f.rect, c = v.p((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 14);
      F(g, 'O', c.x - 5, c.y - 9, 3, 8); F(g, 'Y', c.x - 4, c.y - 7, 1, 2); F(g, 'R', c.x, c.y - 4, 5, 2); F(g, 'q', c.x + 4, c.y - 6, 1, 3); F(g, 'B', c.x + 2, c.y - 2, 4, 1);
      g.globalAlpha = 0.35; box(g, v, f.rect, 14, f.h - 14, { top: 'i', left: 'i', right: 'B', outline: 'b' }); g.globalAlpha = 1;
      const s = Math.floor((t * 6) % 18); const p = v.p(r[0] + 0.1, r[3], 16 + s); F(g, 'c', p.x + 2, p.y, 1, 1);
    },
    stove(g, v, f, t) {
      box(g, v, f.rect, 0, 24, { top: 'S', left: 'x', right: 'k', hi: 'r' }); const len = frontLen(f);
      for (let s = 4; s < len - 4; s++) for (let z = 4; z < 13; z++) fpx(g, v, f, s, z, z === 4 || z === 12 || s === 4 || s === len - 5 ? 'r' : (Math.sin(t * 7 + s) > 0.2 ? 'E' : 'O'));
      const r = f.rect, c = [(r[0] + r[2]) / 2 - 0.1, (r[1] + r[3]) / 2 - 0.1]; box(g, v, [c[0], c[1], c[0] + 0.2, c[1] + 0.2], 24, WH - 24, { top: 'r', left: 'S', right: 'x' });
    },
    plant(g, v, f, t) {
      const r = f.rect; box(g, v, shrink(r, 0.08), 0, 9, { top: 'e', left: 'E', right: 'e', hi: 'p' });
      const c = v.p((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 9);
      for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.33 + Math.sin(t * 1.1 + i) * 0.04, L = 7 + (i % 3) * 3; for (let k = 0; k < L; k++) F(g, k > L - 3 ? 'h' : i % 2 ? 'g' : 'G', c.x + Math.cos(a) * k, c.y + Math.sin(a) * k * 1.2, 1, 1); }
    },
  };
  FB.worktable = FB.table; FB.rug_round = FB.rug; FB.doormat = FB.rug;
  function drawFurniture(g, v, f, t) {
    const name = spriteFor(f);
    if (name) { drawSprite(g, v, f, name, t + (f.ph || 0)); return; }
    const spec = BD.furniture[f.type]; if (spec && spec.sprite) fallbacks.add(spec.sprite[0]);
    const fn = FB[f.type]; if (fn) fn(g, v, f, t); else box(g, v, f.rect, 0, f.h || 16, WOOD);
  }

  // ================================================================== wall decor (windows, portrait, …)
  function glassColor(day, s, z, w, h) {
    const hi = (s + (h - z)) % 9 === 0;
    if (day.dark > 0.6) return hi ? 'v' : z > h * 0.7 && s > w * 0.6 ? 'L' : 'm';
    if (day.dusk > 0.4) return hi ? 'Y' : z < h * 0.45 ? 'E' : 'O';
    return hi ? 'c' : z < h * 0.4 ? 'B' : 'i';
  }
  function drawDecor(g, v, inst, d, day, t) {
    const sp = BD.wallDecor[d.type] || {}, w = d.w || sp.w || 16, h = d.h || sp.h || 16, z0 = d.z ?? sp.z ?? 26, s0 = Math.round(d.at * 16 - w / 2), wall = d.wall;
    const name = (sp.sprite || []).find(has);
    if (name && d.type !== 'window') { const p = wallPt(v, wall, s0 + w / 2, z0); art().draw(g, name, p.x, p.y + Math.floor(w / 4), { t, flip: wall === 'x0' }); }
    else if (d.type === 'window') {
      if (name) { const p = wallPt(v, wall, s0 + w / 2, z0); art().draw(g, name, p.x, p.y + Math.floor(w / 4), { t, flip: wall === 'x0' }); }
      else {
        fallbacks.add('int_window');
        for (let s = -1; s <= w; s++) for (let z = -1; z <= h; z++) {
          const edge = s < 1 || s >= w - 1 || z < 1 || z >= h - 1, mull = s === Math.floor(w / 2) || z === Math.floor(h / 2);
          wpx(g, v, wall, s0 + s, z0 + z, s === -1 || s === w || z === -1 || z === h ? 'k' : edge ? 'D' : mull ? 'd' : glassColor(day, s, z, w, h));
        }
        for (let s = -2; s <= w + 1; s++) { wpx(g, v, wall, s0 + s, z0 - 2, 'W'); wpx(g, v, wall, s0 + s, z0 - 3, 'd'); }
        // curtains
        for (let z = 2; z < h + 3; z++) for (const s of [-2, -1, w, w + 1]) wpx(g, v, wall, s0 + s, z0 + z, (z + s) % 3 ? 'f' : 'e');
      }
    } else {
      fallbacks.add((sp.sprite || ['int_' + d.type])[0]);
      const P = (s, z, c) => wpx(g, v, wall, s0 + s, z0 + z, c);
      if (d.type === 'portrait') {
        for (let s = -1; s <= w; s++) for (let z = -1; z <= h; z++) { const fr = s <= 0 || s >= w - 1 || z <= 0 || z >= h - 1; P(s, z, s === -1 || s === w || z === -1 || z === h ? 'k' : fr ? 'O' : 'b'); }
        for (let s = 3; s < w - 3; s++) for (let z = 1; z < 9; z++) P(s, z, z > 6 ? 'm' : 'X');                  // shawl
        for (let s = 5; s < w - 5; s++) for (let z = 9; z < 15; z++) P(s, z, (s === 6 || s === w - 7) && z === 12 ? 'k' : 'p'); // face
        for (let s = 4; s < w - 4; s++) for (let z = 15; z < 18; z++) P(s, z, 'R');                                  // silver hair
        P(Math.floor(w / 2), 8, 'c'); P(Math.floor(w / 2) - 1, 8, 'R'); P(Math.floor(w / 2), 7, 'q');                // moon charm
      } else if (d.type === 'star_chart') {
        for (let s = 0; s < w; s++) for (let z = 0; z < h; z++) P(s, z, s === 0 || s === w - 1 || z === 0 || z === h - 1 ? 'a' : 'C');
        for (let i = 0; i < 9; i++) P(2 + Math.floor(hsh(i, 1, 2) * (w - 4)), 2 + Math.floor(hsh(i, 2, 2) * (h - 4)), 'm');
        for (const [s, z] of [[5, 10], [12, 5], [17, 11]]) { P(s, z, 'v'); P(s - 1, z, 'R'); P(s + 1, z, 'R'); P(s, z - 1, 'R'); P(s, z + 1, 'R'); }
      } else if (d.type === 'wall_shelf') {
        for (let s = 0; s < w; s++) { P(s, 0, 'd'); P(s, 1, 'W'); } P(2, -2, 'd'); P(w - 3, -2, 'd'); P(2, -1, 'd'); P(w - 3, -1, 'd');
      } else if (d.type === 'herbs_hanging') {
        for (let s = 0; s < w; s++) P(s, h - 1, 'd');
        for (let k = 1; k < w - 1; k += 3) { const L = 6 + Math.floor(hsh(k, 3, 1) * 6), sw = Math.round(Math.sin(t * 1.3 + k) * 0.5); for (let z = h - 2; z > h - 2 - L; z--) P(k + (z < h - 5 ? sw : 0), z, z === h - 2 ? 'a' : hsh(k, z, 2) < 0.35 ? 'h' : k % 2 ? 'g' : 'G'); }
      } else if (d.type === 'lesson_board') {
        for (let s = 0; s < w; s++) for (let z = 0; z < h; z++) P(s, z, s === 0 || s === w - 1 || z === 0 || z === h - 1 ? 'D' : 'w');
        for (const [s, z, c] of [[3, 9, 'c'], [12, 6, 'O'], [19, 10, 'c']]) for (let a = 0; a < 6; a++) for (let b = 0; b < 5; b++) P(s + a, z + b, b === 4 && a === 2 ? 'f' : c);
      } else if (d.type === 'wall_lantern') {
        const fl = 0.6 + 0.4 * Math.sin(t * 8 + d.at * 3);
        for (let s = 1; s < w - 1; s++) P(s, h, 'k');
        for (let s = 1; s < w - 1; s++) for (let z = 2; z < h - 1; z++) P(s, z, s === 1 || s === w - 2 || z === 2 || z === h - 2 ? 'k' : fl > 0.8 ? 'Y' : 'O');
        P(Math.floor(w / 2), h - 1, 'k');
      }
    }
    // placed item on a slot shelf
    if (d.slot && MM.interiors) { const it = MM.interiors.placed(inst.id, d.slot); if (it) drawPlaced(g, wallPt(v, wall, s0 + w / 2, z0 + 2), it); }
  }
  const ICON = { wheat: 'icon_wheat', ember: 'icon_ember_pepper', frost: 'icon_frost_berry', moon: 'icon_moonflower', glowcap: 'icon_glowcap', starmint: 'icon_starmint',
    potion: 'icon_potion_health', greater_potion: 'icon_potion_health', mana_tonic: 'icon_potion_mana', growth_tonic: 'icon_potion_growth', starlight: 'icon_potion_moon', hearthfire: 'icon_potion_ember', mireward: 'icon_potion' };
  function drawPlaced(g, p, id) {
    const n = ICON[id] || (has('icon_' + id) ? 'icon_' + id : 'icon_potion');
    if (has(n)) { const f = art().get(n); art().draw(g, n, p.x - Math.floor(f.w / 2), p.y - f.h + 1); }
    else { F(g, 'k', p.x - 3, p.y - 8, 6, 8); F(g, 'f', p.x - 2, p.y - 7, 4, 6); }
  }

  // ================================================================== NPCs + player
  function drawNpc(g, v, n, t) {
    const p = v.p(n.x, n.y, 0), A = art();
    let gx = 0; try { gx = MM.interiors.local(game.x, game.y).x - n.x; } catch (e) { /* */ } // eslint-disable-line no-undef
    const shadow = () => { g.fillStyle = 'rgba(20,16,24,.35)'; g.beginPath(); g.ellipse(p.x, p.y, 9, 3, 0, 0, Math.PI * 2); g.fill(); };
    const names = ['npc_' + n.id + '_idle', 'npc_' + n.id];
    const nm = names.find(has);
    shadow();
    if (nm) { A.draw(g, nm, p.x, p.y, { t: n.t, flip: gx < -0.2 }); return; }
    fallbacks.add('npc_' + n.id);
    try { drawCastSprite('keeper', p, { id: n.id.length, artFacing: n.facing || 'S', artMoving: 0 }); } catch (e) { box(g, v, [n.x - 0.15, n.y - 0.15, n.x + 0.15, n.y + 0.15], 0, 34, { top: 'X', left: 'm', right: 'x' }); } // eslint-disable-line no-undef
    // a tiny per-NPC accessory so the three keepers read apart until ART2's sprites land
    const acc = { pip: ['O', -6, 30], wren: ['g', 5, 34], marrow: ['Y', 7, 22] }[n.id];
    if (acc) { F(g, 'k', p.x + acc[1] - 1, p.y - acc[2] - 1, 4, 4); F(g, acc[0], p.x + acc[1], p.y - acc[2], 2, 2); }
  }

  // ================================================================== light map + motes
  let lightC = null, lightG = null;
  function lightMap(w, h) { if (!lightC || lightC.width !== w || lightC.height !== h) { lightC = document.createElement('canvas'); lightC.width = w; lightC.height = h; lightG = lightC.getContext('2d'); } return lightG; }
  function collectLights(inst, v, day, t) {
    const out = [], I = inst.I;
    const fl = (k, ph) => 1 - k * 0.5 * (0.5 + 0.5 * Math.sin(t * 9 + ph) * Math.sin(t * 3.7 + ph * 2));
    for (const f of inst.items) {
      const L = BD.furniture[f.type] && BD.furniture[f.type].light; if (!L) continue;
      if (f.type === 'hearth' && !f.lit) continue;
      const [x0, y0, x1, y1] = f.rect, fx = f.rot === 'y' ? x1 + 0.2 : (x0 + x1) / 2, fy = f.rot === 'y' ? (y0 + y1) / 2 : y1 + 0.2;
      const p = v.p(fx, fy, L.dz || 0); out.push({ x: p.x, y: p.y, r: L.r * fl(L.flicker, f.ph || 1), color: L.color, a: 0.9 });
    }
    for (const l of I.lights) { const p = v.p(l.x, l.y, l.z || 0); out.push({ x: p.x, y: p.y + (l.z || 0) * 0.6, r: l.r * fl(l.flicker || 0, l.x * 3), color: l.color, a: 0.55 + day.dark * 0.35 }); }
    for (const d of inst.decor) {
      const sp = BD.wallDecor[d.type]; if (!sp) continue;
      if (sp.light) { const p = wallPt(v, d.wall, Math.round(d.at * 16), (sp.z || 40) + 6); out.push({ x: p.x, y: p.y + 6, r: sp.light.r * fl(sp.light.flicker, d.at * 7), color: sp.light.color, a: 0.5 + day.dark * 0.4 }); }
      if (d.type === 'window') { const p = wallPt(v, d.wall, Math.round(d.at * 16), (sp.z || 26) + 4), dayK = 1 - day.dark; out.push({ x: p.x + (d.wall === 'y0' ? -8 : 8), y: p.y + 22, r: 44 + 20 * dayK, color: day.dark > 0.6 ? '#7d8fd0' : day.dusk > 0.4 ? '#ffb070' : '#fff6da', a: 0.25 + 0.5 * dayK }); }
    }
    // daylight / night air through the doorway
    const d = I.door, dp = d.face === 'L' ? v.p(d.cx, I.D + 0.2, 0) : v.p(I.W + 0.2, d.cy, 0);
    out.push({ x: dp.x, y: dp.y, r: 46, color: day.dark > 0.6 ? '#6f7fc0' : '#fff2cf', a: 0.25 + 0.4 * (1 - day.dark) });
    return out;
  }
  const MOTES = new Map();
  function motes(inst) {
    let m = MOTES.get(inst.I.key); if (m) return m;
    const n = Math.max(6, Math.round((inst.I.def.ambience && inst.I.def.ambience.motes || 20) * (setting('reducedMotion', false) ? 0.4 : 1)));
    m = []; for (let i = 0; i < n; i++) m.push({ x: Math.random() * inst.I.W, y: Math.random() * inst.I.D, z: 6 + Math.random() * 50, vx: (Math.random() - 0.5) * 0.04, vz: (Math.random() - 0.5) * 3, ph: Math.random() * 6.28 });
    MOTES.set(inst.I.key, m); return m;
  }

  // ================================================================== main draw
  let lastT = 0;
  function draw(g, inst, w, h) {
    if (!g || !inst) return;
    w = w || 512; h = h || 320;
    const v = view(inst, w, h), I = inst.I, t = inst.time || 0, day = dayInfo();
    const dt = Math.max(0, Math.min(0.1, t - lastT)); lastT = t;
    g.save(); g.imageSmoothingEnabled = false;
    // backdrop: deep warm dark with a faint radial lift behind the room
    g.fillStyle = '#100d14'; g.fillRect(0, 0, w, h);
    const bg = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.6); bg.addColorStop(0, 'rgba(70,52,64,.55)'); bg.addColorStop(1, 'rgba(16,13,20,0)'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.drawImage(bake(inst, v).c, 0, 0);
    // back-wall decor
    for (const d of inst.decor) drawDecor(g, v, inst, d, day, t);
    // window beams on the floor (day: sun, night: moon)
    if (!setting('reducedFlashes', false) || true) for (const d of inst.decor) if (d.type === 'window') {
      const half = (d.w || 14) / 32, a = 0.07 + 0.08 * (1 - day.dark), len = 1.4 + day.dusk * 0.8;
      const pts = d.wall === 'y0' ? [[d.at - half, 0.05], [d.at + half, 0.05], [d.at + half + 0.5, len], [d.at - half + 0.5, len]] : [[0.05, d.at - half], [0.05, d.at + half], [len, d.at + half + 0.5], [len, d.at - half + 0.5]];
      g.globalCompositeOperation = 'lighter'; g.fillStyle = day.dark > 0.6 ? 'rgba(120,140,220,' + (a * 0.6).toFixed(3) + ')' : 'rgba(255,236,190,' + a.toFixed(3) + ')';
      g.beginPath(); pts.forEach(([x, y], i) => { const p = v.p(Math.min(I.W, x), Math.min(I.D, y), 0); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.closePath(); g.fill(); g.globalCompositeOperation = 'source-over';
    }
    // doorway threshold + outside light spill (clear, aligned with the exit trigger)
    const d = I.door;
    const thr = d.face === 'L' ? [d.a0, I.D - 0.02, d.a1, I.D + T] : [I.W - 0.02, d.a0, I.W + T, d.a1];
    box(g, v, thr, 0, 0, { top: 'R', left: 'r', right: 'r', outline: 'S' });
    // floor items (rugs, mats) then depth-sorted solids + characters
    const flat = inst.items.filter((f) => BD.furniture[f.type] && BD.furniture[f.type].floor);
    for (const f of flat) drawFurniture(g, v, f, t);
    const boxes = inst.items.filter((f) => !(BD.furniture[f.type] && BD.furniture[f.type].floor)).sort((a, b) => (a.rect[0] + a.rect[1] + a.rect[2] + a.rect[3]) - (b.rect[0] + b.rect[1] + b.rect[2] + b.rect[3]));
    const pts = [];
    let pl = null; try { pl = MM.interiors.local(game.x, game.y); } catch (e) { /* */ } // eslint-disable-line no-undef
    if (pl) pts.push({ kind: 'player', x: pl.x, y: pl.y });
    if (inst.npc) pts.push({ kind: 'npc', x: inst.npc.x, y: inst.npc.y, n: inst.npc });
    // order: a point is in front of a box when it is past the box's front faces (x >= x1 or y >= y1)
    const order = boxes.map((f) => ({ kind: 'box', f }));
    for (const p of pts.sort((a, b) => (a.x + a.y) - (b.x + b.y))) {
      let idx = 0; for (let i = 0; i < order.length; i++) { const o = order[i]; if (o.kind === 'box' ? (p.x >= o.f.rect[2] - 0.02 || p.y >= o.f.rect[3] - 0.02) : (p.x + p.y >= o.x + o.y)) idx = i + 1; }
      order.splice(idx, 0, p);
    }
    for (const o of order) {
      if (o.kind === 'box') drawFurniture(g, v, o.f, t);
      else if (o.kind === 'npc') drawNpc(g, v, o.n, t);
      else { const p = v.p(o.x, o.y, 0); try { drawCharacter(p); } catch (e) { /* baseline missing */ } } // eslint-disable-line no-undef
      if (o.kind === 'box' && o.f.slot && MM.interiors) { const it = MM.interiors.placed(inst.id, o.f.slot); if (it) { const r = o.f.rect; drawPlaced(g, v.p((r[0] + r[2]) / 2 + (o.f.rot === 'y' ? 0.2 : 0), (r[1] + r[3]) / 2 + (o.f.rot === 'y' ? 0 : 0.2), 37), it); } }
    }
    drawFront(g, v, inst, day, t);
    // light map (multiply) + additive glow
    const amb = day.dark > 0 ? mix([214, 202, 196], [88, 78, 112], day.dark) : [214, 202, 196];
    const lg = lightMap(w, h); lg.globalCompositeOperation = 'source-over'; lg.fillStyle = 'rgb(' + amb.map(Math.round).join(',') + ')'; lg.fillRect(0, 0, w, h);
    const lights = collectLights(inst, v, day, t);
    lg.globalCompositeOperation = 'lighter';
    for (const L of lights) { const gr = lg.createRadialGradient(L.x, L.y, 0, L.x, L.y, Math.max(4, L.r)); const c = hexRgb(L.color); gr.addColorStop(0, 'rgba(' + c.join(',') + ',' + (L.a * 0.75).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(' + c.join(',') + ',0)'); lg.fillStyle = gr; lg.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2); }
    g.globalCompositeOperation = 'multiply'; g.drawImage(lightC, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (const L of lights) if (L.a > 0.6) { const gr = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.45); const c = hexRgb(L.color); gr.addColorStop(0, 'rgba(' + c.join(',') + ',.16)'); gr.addColorStop(1, 'rgba(' + c.join(',') + ',0)'); g.fillStyle = gr; g.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2); }
    // dust motes drifting through the light
    const rm = setting('reducedMotion', false);
    for (const m of motes(inst)) {
      if (!rm) { m.x += m.vx * dt; m.z += m.vz * dt; m.ph += dt; if (m.z < 4 || m.z > 58) m.vz = -m.vz; if (m.x < 0) m.x += I.W; if (m.x > I.W) m.x -= I.W; }
      const p = v.p(m.x, m.y, m.z + Math.sin(m.ph * 0.9) * 2), tw = 0.35 + 0.35 * Math.sin(m.ph * 2.1);
      g.fillStyle = 'rgba(255,240,200,' + (tw * (0.5 + 0.5 * (1 - day.dark))).toFixed(3) + ')'; g.fillRect(p.x, p.y, 1, 1);
    }
    g.globalCompositeOperation = 'source-over';
    // exit cue: soft pulsing chevron on the threshold when near the door
    if (pl) { const dd = d.face === 'L' ? Math.abs(pl.y - I.D) + Math.max(0, Math.abs(pl.x - d.cx) - d.w / 2) : Math.abs(pl.x - I.W) + Math.max(0, Math.abs(pl.y - d.cy) - d.w / 2);
      if (dd < 1.6) { const a = (1 - dd / 1.6) * (0.5 + 0.3 * Math.sin(t * 5)), p = d.face === 'L' ? v.p(d.cx, I.D + 0.15, 0) : v.p(I.W + 0.15, d.cy, 0);
        g.globalAlpha = Math.max(0, a); const sx = d.face === 'L' ? -1 : 1; for (let k = 0; k < 4; k++) { F(g, 'Y', p.x + sx * (k - 2) * 2, p.y + k, 2, 1); F(g, 'Y', p.x + sx * (k - 2) * 2 + sx * -6, p.y + k - 3, 2, 1); } g.globalAlpha = 1; } }
    // vignette
    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62); vg.addColorStop(0, 'rgba(10,8,14,0)'); vg.addColorStop(1, 'rgba(10,8,14,.55)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
    // entry fade + rest fade
    const age = t; if (age < 0.4) { g.fillStyle = 'rgba(10,8,14,' + (1 - age / 0.4).toFixed(3) + ')'; g.fillRect(0, 0, w, h); }
    if (inst.rest > 0) { const k = inst.rest / 1.6, a = Math.sin(Math.min(1, 1 - k) * Math.PI); g.fillStyle = 'rgba(8,6,14,' + (a * 0.92).toFixed(3) + ')'; g.fillRect(0, 0, w, h); }
    g.restore();
  }
  const mix = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
  // cut-away front walls (low stub + top cap), with the doorway gap and jamb posts
  function drawFront(g, v, inst, day, t) {
    const I = inst.I, d = I.door, mat = WALLS[I.def.wall] || WALLS.plaster, cap = Math.round(T * 16);
    const seg = (face, a0, a1) => { if (a1 - a0 < 0.01) return;
      const r = face === 'L' ? [a0, I.D, a1, I.D + T] : [I.W, a0, I.W + T, a1];
      box(g, v, r, 0, CUT, { top: mat.trim === 'S' ? 'r' : 'D', left: mat.a[0], right: mat.b[0], outline: 'k', hi: mat.a[1] });
    };
    const Lgap = d.face === 'L', Rgap = d.face === 'R';
    if (Lgap) { seg('L', -T, d.a0); seg('L', d.a1, I.W); } else seg('L', -T, I.W);
    if (Rgap) { seg('R', -T, d.a0); seg('R', d.a1, I.D + T); } else seg('R', -T, I.D + T);
    // corner block where the two cut walls meet
    box(g, v, [I.W, I.D, I.W + T, I.D + T], 0, CUT, { top: 'D', left: mat.a[0], right: mat.b[0] });
    // door jambs (frame posts) so the entrance reads clearly from inside
    const post = (lx, ly) => box(g, v, [lx, ly, lx + 0.18, ly + 0.18], 0, CUT + 14, DWOOD);
    if (Lgap) { post(d.a0 - 0.18, I.D); post(d.a1, I.D); } else { post(I.W, d.a0 - 0.18); post(I.W, d.a1); }
    void cap; void day; void t;
  }
  // click picking: id of the interactable whose on-screen footprint/volume contains (sx,sy)
  function pick(inst, sx, sy) {
    const v = view(inst, 512, 320); let best = null, bd = Infinity;
    for (const c of (MM.interiors && MM.interiors.candidates()) || []) {
      const r = c.rect, z = c.ref && c.ref.h != null ? c.ref.h : 36;
      const pts = [v.p(r[0], r[1], 0), v.p(r[2], r[1], 0), v.p(r[0], r[3], 0), v.p(r[2], r[3], 0), v.p(r[0], r[1], z), v.p(r[2], r[3], z)];
      if (c.kind === 'npc') { const p = v.p(r[0], r[1], 0); pts.push({ x: p.x - 10, y: p.y - 40 }, { x: p.x + 10, y: p.y + 2 }); }
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 2;
      if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
      const area = (x1 - x0) * (y1 - y0); if (area < bd) { bd = area; best = c.id; }
    }
    return best;
  }
  MM.interiorRender = { draw, view: (inst) => view(inst, 512, 320), pick, fallbacks, clearCache() { bakes.clear(); MOTES.clear(); } };
})();
