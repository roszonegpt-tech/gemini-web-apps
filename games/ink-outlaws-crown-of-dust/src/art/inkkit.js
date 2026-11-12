/* Crown of Dust - static ink art (src/art/inkkit.js).
   Structures and props are assembled from the lab painter's own primitives (INK.kit: Scene, prism, ring8, inkSeg,
   outline, fillp, tick, mat) so they share the characters' flat tones, spot blacks and uneven ink line.
   Each piece is painted once per variant into a trimmed canvas and reused. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, S = CD.Sprites, k = window.INK.kit;
const A = CD.Art = {map: new Map(), defs: {}, k: k};
A.flush = () => A.map.clear();
/* region = [half width, height above the anchor, depth below it] in world units */
A.def = (kind, region, fn, meta) => { A.defs[kind] = Object.assign({r: region, fn: fn}, meta || {}); };
A.get = function (kind, v, pal) {
  const key = kind + '|' + (v || 0) + '|' + (pal || ''); let sp = A.map.get(key);
  if (!sp) {
    const d = A.defs[kind]; if (!d) throw new Error('no art: ' + kind);
    seed = 300 + (v || 0) * 37 + (U.hash(kind) % 200);
    sp = S.capture(d.r[0], d.r[1], d.r[0] * 2, d.r[1] + d.r[2], S.scale, (c, ax, ay, s) => { c.translate(ax, ay); c.scale(s, s); c.lineCap = 'round'; d.fn(c, v || 0, A.PAL[pal] || A.PAL.outlaw, pal); });
    A.map.set(key, sp);
  }
  return sp;
};
A.draw = function (c, kind, x, y, v, pal, opt) {
  const sp = A.get(kind, v, pal);
  if (opt && (opt.rot || opt.alpha != null || opt.sx)) { c.save(); c.translate(x, y); if (opt.rot) c.rotate(opt.rot); if (opt.sx) c.scale(opt.sx, opt.sy || opt.sx); if (opt.alpha != null) c.globalAlpha = opt.alpha; c.drawImage(sp.cv, sp.ox, sp.oy, sp.w, sp.h); c.restore(); }
  else c.drawImage(sp.cv, x + sp.ox, y + sp.oy, sp.w, sp.h);
  return sp;
};

/* faction colours: main cloth, trim, pale cloth */
A.PAL = {
  outlaw: {main: '#a8474a', alt: '#d9a520', cloth: '#d8c9a6', dark: '#5a3a34'},
  corsair: {main: '#6f8a3a', alt: '#e0782c', cloth: '#b7ae84', dark: '#3f4a2a'},
  hollow: {main: '#5a4f72', alt: '#6fd08a', cloth: '#9a968c', dark: '#34303e'},
  crown: {main: '#3f5a70', alt: '#d9a520', cloth: '#cfc8b4', dark: '#2c3a46'}
};
const C = A.C = {wood: '#8a6a4a', wood2: '#6b5442', dark: '#5e4a3f', canvas: '#d8c08a', stone: '#a89c86', stone2: '#8f8676', thatch: '#c9a85a', steel: '#6f7480', bone: '#e6dcc3', leaf: '#7c8a5a', leaf2: '#5f7350', dead: '#6a5a50', red: '#a8474a', must: '#d9a520', paper: '#e8e0cf'};
const INKC = k.INKC;
let seed = 300;
const M = (c, spot, tb) => k.mat(c, spot !== false, tb);

/* ----- 3D helpers ----- */
const scene = yaw => new k.Scene(yaw == null ? -28 : yaw, 0);
const fr = (x, y, z, yaw) => ({o: [x, y, z], m: k.RY((yaw || 0) * k.D2R)});
function solid(G, F, levels, col, o) {
  o = o || {}; const rings = levels.map(l => k.ring8(F, l[0], l[1], l[2], l[3] == null ? 0.5 : l[3], l[4], l[5]));
  const key = o.key != null ? o.key : G.P(k.FP(F, 0, 0, 0))[2] + (o.dk || 0);
  return k.prism(G, rings, Object.assign({seed: seed++, col: col, top: col, w: 0.9, hatch: 0.025}, o, {key: key}));
}
const box = (G, F, hw, hd, y0, y1, col, o) => solid(G, F, [[y0, hw, hd], [y1, hw, hd]], col, o);
function flat(G, F, pts, fill, o) {                         // a flat patch (door, window, sign) given in frame-local coordinates
  o = o || {}; let z = 0; const p = pts.map(q => { const r = G.P(k.FP(F, q[0], q[1], q[2])); z += r[2]; return [r[0], r[1]]; });
  return G.add({key: o.key != null ? o.key : z / pts.length + (o.dk == null ? 0.4 : o.dk), seed: seed++, w: o.w == null ? 0.55 : o.w, polys: [{p: p, f: fill}], post: o.post ? [o.post] : []});
}
const pt = (G, F, x, y, z) => { const r = G.P(k.FP(F, x, y, z)); return [r[0], r[1]]; };
function paint(c, G) { G.parts.sort((a, b) => a.key - b.key); for (const p of G.parts) k.drawPart(c, p, 0); }

/* ----- 2D helpers (screen space, y up is negative) ----- */
function shape(c, pts, fill, w) { if (w !== 0) k.outline(c, pts, (w || 0.9) * 2, seed++); k.fillp(c, pts, fill); }
const ink = (c, pts) => k.fillp(c, pts, INKC);
const stroke = (c, pts, w, col) => k.line(c, pts, w || 0.7, seed++, col);
const hatch = (c, a, b, w, col) => k.tick(c, a, b, w || 0.4, col);
const rr = i => k.rnd(seed, i);
A.h = {scene: scene, fr: fr, solid: solid, box: box, flat: flat, pt: pt, paint: paint, shape: shape, ink: ink, stroke: stroke, hatch: hatch, M: M, C: C, rr: rr, nextSeed: () => seed++};

/* ================= structures ================= */
function flag(c, x, y, h, col, s) {                        // pole with a pennant
  s = s || 1; stroke(c, [[x, y], [x + 0.3, y - h]], 1.1);
  shape(c, [[x + 0.4, y - h], [x + 9 * s, y - h + 2.6], [x + 0.5, y - h + 6]], col, 0.6);
}
function planks(c, G, F, hw, y0, y1, z, n) {               // vertical board seams on a front wall
  for (let i = 1; i < n; i++) { const x = -hw + 2 * hw * i / n; stroke(c, [pt(G, F, x, y0 + 1, z), pt(G, F, x + 0.2, y1 - 1, z)], 0.45); }
}

A.def('tent', [34, 58, 12], (c, v, P) => {
  const G = scene(-24 + (v % 3) * 9), F = fr(0, 0, 0), cl = M(v % 2 ? P.cloth : C.canvas), H = 30;
  solid(G, F, [[0, 21, 15, 7], [H * 0.72, 7, 5, 2.4], [H, 1, 0.8, 0.3]], cl, {hatch: 0.05, top: cl});
  flat(G, F, [[-5.5, 0, 15.2], [5.5, 0, 15.2], [0.4, 17, 8.6]], INKC, {w: 0.4});
  flat(G, F, [[-21, 9, 0], [21, 9, 0], [20, 11.5, 0], [-20, 11.5, 0]].map(q => [q[0] * 0.74, q[1], 15 - q[1] * 0.42]), P.main, {w: 0.4, dk: 0.2});
  paint(c, G); flag(c, 0, -H + 1, 14, P.main);
});
A.def('bigtent', [44, 72, 14], (c, v, P) => {
  const G = scene(-26), F = fr(0, 0, 0), cl = M(P.cloth), H = 42;
  solid(G, F, [[0, 28, 19, 5], [18, 27, 18, 5], [H * 0.8, 6, 4, 2], [H, 1, 0.8, 0.3]], (i, j) => j === 0 ? M(P.main) : cl, {hatch: 0.05, top: cl});
  flat(G, F, [[-7, 0, 19.2], [7, 0, 19.2], [6, 17, 18.6], [-6, 17, 18.6]], INKC, {w: 0.4});
  paint(c, G); flag(c, 0, -H + 1, 18, P.alt, 1.3);
});
A.def('shack', [38, 66, 12], (c, v, P) => {              // goblin stilt hut
  const G = scene(-30 + (v % 2) * 12), F = fr(0, 0, 0), wd = M(C.dark), th = M(C.thatch, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(G, fr(sx * 13, 0, sz * 9), 1.2, 1.2, 0, 12, M(C.wood2));
  box(G, F, 16, 11, 11, 30, wd, {hatch: 0.06});
  solid(G, F, [[29, 20, 14, 2], [44, 12, 2, 1]], th, {hatch: 0.09, dk: 0.5});
  flat(G, F, [[-4, 12, 11.2], [4, 12, 11.2], [3.6, 24, 11.2], [-3.6, 24, 11.2]], INKC, {w: 0.4});
  flat(G, F, [[8, 19, 11.2], [13, 19, 11.2], [13, 24, 11.2], [8, 24, 11.2]], P.alt, {w: 0.4});
  paint(c, G); stroke(c, [pt(G, F, -3, 11, 13), pt(G, F, -5, 0, 17)], 0.9); stroke(c, [pt(G, F, 3, 11, 13), pt(G, F, 1.5, 0, 17)], 0.9);
  for (let i = 0; i < 4; i++) stroke(c, [pt(G, F, -4.2 + i * 0.2, 9 - i * 2.6, 14 + i), pt(G, F, 2.4 - i * 0.2, 9 - i * 2.6, 14 + i)], 0.6);
});
function house(c, v, P, o) {
  const G = scene(-28), F = fr(0, 0, 0), wall = M(o.wall), roof = M(o.roof), hw = o.hw, hd = o.hd, h = o.h;
  box(G, F, hw, hd, 0, h, wall, {hatch: 0.03});
  solid(G, F, [[h, hw + 2, hd + 2, 1], [h + o.rise, hw + 2, 1.2, 0.6]], roof, {hatch: 0.07, dk: 0.3});
  if (o.front) box(G, fr(0, 0, hd + 0.8), hw + 1, 0.9, 0, h + o.front, M(o.frontc || o.wall), {hatch: 0.02, dk: 2});
  const z = hd + (o.front ? 1.9 : 0.2), dk = o.front ? 3 : 0.5;
  flat(G, F, [[-5, 0, z], [5, 0, z], [5, 19, z], [-5, 19, z]], o.door || C.dark, {dk: dk});
  for (const sx of [-1, 1]) flat(G, F, [[sx * (hw - 13), 9, z], [sx * (hw - 5), 9, z], [sx * (hw - 5), 18, z], [sx * (hw - 13), 18, z]], o.win || '#3a4a55', {dk: dk});
  if (o.sign) flat(G, F, [[-hw * 0.62, h - 1, z + 0.3], [hw * 0.62, h - 1, z + 0.3], [hw * 0.62, h + 8, z + 0.3], [-hw * 0.62, h + 8, z + 0.3]], o.sign, {dk: dk + 0.5});
  if (o.awn) flat(G, F, [[-hw, 22, z], [hw, 22, z], [hw + 1, 17.5, z + 9], [-hw - 1, 17.5, z + 9]], o.awn, {dk: dk + 1});
  if (o.tower) { box(G, fr(0, 0, -2), 7, 7, h + 2, h + o.tower, wall, {dk: 0.6}); solid(G, fr(0, 0, -2), [[h + o.tower, 9, 9, 1], [h + o.tower + 11, 0.8, 0.8, 0.3]], roof, {dk: 0.8});
    flat(G, fr(0, 0, -2), [[-3, h + 9, 7.2], [3, h + 9, 7.2], [3, h + o.tower - 4, 7.2], [-3, h + o.tower - 4, 7.2]], INKC, {dk: 1}); }
  paint(c, G);
  planks(c, G, F, hw, 0, h, z, Math.round(hw / 5));
  if (o.sign) { const a = pt(G, F, -hw * 0.5, h + 3.5, z + 0.4), b = pt(G, F, hw * 0.5, h + 3.5, z + 0.4); for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; hatch(c, [U.lerp(a[0], b[0], t) - 2.4, U.lerp(a[1], b[1], t) + 1.2], [U.lerp(a[0], b[0], t) + 2.4, U.lerp(a[1], b[1], t) - 1], 0.9, INKC); } }
  if (o.awn) { for (const sx of [-1, 1]) stroke(c, [pt(G, F, sx * hw, 17.5, z + 9), pt(G, F, sx * hw, 0, z + 9)], 0.9); }
  stroke(c, [pt(G, F, 3, 9, z + 0.2), pt(G, F, 3.2, 10.4, z + 0.2)], 0.9, C.must);
}
A.def('house', [56, 86, 14], (c, v, P) => house(c, v, P, [
  {hw: 30, hd: 15, h: 34, rise: 16, wall: C.wood, roof: C.dark, front: 12, sign: C.paper, awn: P.main},
  {hw: 26, hd: 14, h: 32, rise: 18, wall: '#b9ae93', roof: '#7a4a3a'},
  {hw: 34, hd: 15, h: 36, rise: 14, wall: '#9a7a5c', roof: C.dark, front: 14, frontc: '#c9b287', sign: P.alt, awn: P.cloth},
  {hw: 24, hd: 13, h: 30, rise: 20, wall: C.wood2, roof: C.thatch}][v % 4]));
A.def('hall', [66, 116, 16], (c, v, P) => house(c, v, P, {hw: 40, hd: 17, h: 44, rise: 16, wall: '#c9b99a', roof: '#6a4a3a', front: 10, frontc: '#d9cfb4', sign: P.main, awn: P.alt, tower: 30, door: '#4a362b'}));
A.def('keep', [70, 150, 18], (c, v, P) => {               // stone stronghold keep
  const G = scene(-28), F = fr(0, 0, 0), st = M(C.stone), st2 = M(C.stone2);
  box(G, F, 34, 16, 0, 60, st, {hatch: 0.05});
  for (const sx of [-1, 1]) { const T = fr(sx * 36, 0, 6); solid(G, T, [[0, 11, 11, 4], [84, 11, 11, 4], [86, 13, 13, 4], [92, 13, 13, 4]], st2, {hatch: 0.05, dk: sx > 0 ? 1 : 0.6}); solid(G, T, [[92, 12, 12, 4], [112, 0.8, 0.8, 0.3]], M(P.main), {dk: 1.2}); }
  for (let i = -3; i <= 3; i++) box(G, fr(i * 9.4, 0, 14), 3, 2, 60, 66, st, {dk: 0.4});
  flat(G, F, [[-9, 0, 16.2], [9, 0, 16.2], [9, 22, 16.2], [5, 28, 16.2], [-5, 28, 16.2], [-9, 22, 16.2]], INKC, {dk: 2});
  flat(G, F, [[-6, 36, 16.2], [6, 36, 16.2], [6, 54, 16.2], [0, 50, 16.2], [-6, 54, 16.2]], P.main, {dk: 2});
  paint(c, G);
  for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) { const x = -30 + i * 11 + (j % 2) * 5, y = 6 + j * 11; if (Math.abs(x) < 11 && y < 30) continue; stroke(c, [pt(G, F, x, y, 16.2), pt(G, F, x + 5, y, 16.2)], 0.5); }
  for (const sx of [-1, 1]) flag(c, pt(G, fr(sx * 36, 0, 6), 0, 112, 0)[0], pt(G, fr(sx * 36, 0, 6), 0, 112, 0)[1], 10, P.alt);
});
A.def('tower', [30, 110, 10], (c, v, P) => {              // watchtower on four legs
  const G = scene(-26), F = fr(0, 0, 0), wd = M(C.wood2), H = 52;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid(G, fr(sx * 9, 0, sz * 7), [[0, 1.5, 1.5, 0.4], [H, 1.2, 1.2, 0.4]], wd, {hatch: 0});
  box(G, F, 12.5, 10, H, H + 3, M(C.wood), {dk: 0.5});
  for (const sz of [-1, 1]) box(G, fr(0, 0, sz * 9.4), 12.5, 0.7, H + 3, H + 11, M(sz > 0 ? P.main : C.wood), {dk: sz > 0 ? 2.2 : -1, hatch: 0.04});
  for (const sx of [-1, 1]) box(G, fr(sx * 12, 0, 0), 0.7, 9.4, H + 3, H + 11, M(C.wood), {dk: sx > 0 ? 1.4 : -0.6});
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(G, fr(sx * 11.4, 0, sz * 8.8), 0.8, 0.8, H + 11, H + 22, wd, {dk: 1, hatch: 0});
  solid(G, F, [[H + 22, 16, 13, 2], [H + 33, 1, 1, 0.3]], M(v % 2 ? C.thatch : C.dark), {hatch: 0.08, dk: 3});
  paint(c, G);
  stroke(c, [pt(G, F, -9, 4, 7), pt(G, F, 9, H - 6, 7)], 0.8); stroke(c, [pt(G, F, 9, 4, 7), pt(G, F, -9, H - 6, 7)], 0.8);
  stroke(c, [pt(G, F, 9, 6, 7), pt(G, F, 9, H - 8, -7)], 0.6);
  for (let i = 1; i < 6; i++) stroke(c, [pt(G, F, -2.4, i * 8, 8), pt(G, F, 2.4, i * 8, 8)], 0.7);
  for (const sx of [-1, 1]) stroke(c, [pt(G, F, sx * 2.6, 0, 8.4), pt(G, F, sx * 2.6, H, 8)], 0.7);
  flag(c, pt(G, F, 0, H + 33, 0)[0], pt(G, F, 0, H + 33, 0)[1], 10, P.alt);
});
A.def('guntower', [26, 74, 10], (c, v, P) => {            // player-built gun nest
  const G = scene(-26), F = fr(0, 0, 0), wd = M(C.wood), H = 22;
  solid(G, F, [[0, 12, 9, 3], [H, 10, 7.5, 2.5]], wd, {hatch: 0.07});
  solid(G, F, [[H, 12, 9.5, 2.5], [H + 7, 12.5, 10, 2.5]], M(P.main), {dk: 0.5, top: M(C.dark)});
  box(G, fr(0, 0, 1), 1.3, 1.3, H + 7, H + 12, M(C.steel), {dk: 1});
  solid(G, {o: [0, H + 13, 1], m: k.MM(k.RY(-0.5), k.RX(Math.PI / 2 - 0.1))}, [[-3, 2.2, 2.2, 0.8], [13, 1.5, 1.5, 0.6]], M(C.steel), {dk: 2, hatch: 0});
  paint(c, G);
  for (let i = 1; i < 4; i++) stroke(c, [pt(G, F, -11 + i * 0.4, i * 5.4, 9 - i * 0.3), pt(G, F, 11 - i * 0.4, i * 5.4, 9 - i * 0.3)], 0.6);
  flag(c, pt(G, F, -10, H + 7, -8)[0], pt(G, F, -10, H + 7, -8)[1], 15, P.alt, 0.9);
});
A.def('log', [9, 50, 6], (c, v, P) => {                    // one palisade stake; walls are rows of these
  const G = scene(-20 + (v % 5) * 9), h = 30 + (v % 3) * 3, wd = M(v % 2 ? C.wood2 : C.dark);
  solid(G, fr(0, 0, 0), [[0, 4.2, 3.6, 1.6], [h, 3.9, 3.3, 1.5], [h + 7, 0.5, 0.5, 0.2]], wd, {hatch: 0.1});
  paint(c, G);
});
A.def('stonewall', [14, 60, 8], (c, v, P) => {            // fortress wall block with a merlon
  const G = scene(-28), st = M(v % 2 ? C.stone : C.stone2);
  box(G, fr(0, 0, 0), 9, 5, 0, 34, st, {hatch: 0.06});
  if (v % 2) box(G, fr(0, 0, 0), 5, 5, 34, 41, st, {dk: 0.3});
  paint(c, G); const F = fr(0, 0, 0);
  for (let j = 0; j < 3; j++) stroke(c, [pt(G, F, -7 + (j % 2) * 4, 8 + j * 9, 5.2), pt(G, F, -1 + (j % 2) * 4, 8 + j * 9, 5.2)], 0.5);
});
A.def('gatepost', [12, 76, 6], (c, v, P) => {
  const G = scene(-24), wd = M(C.dark);
  solid(G, fr(0, 0, 0), [[0, 5, 4.4, 1.8], [46, 4.6, 4, 1.6], [53, 0.6, 0.6, 0.2]], wd, {hatch: 0.1});
  paint(c, G); flag(c, 0, -52, 12, P.main);
});
A.def('barricade', [24, 34, 8], (c, v, P) => {
  const G = scene(-22), wd = M(C.wood), F = fr(0, 0, 0);
  for (const sx of [-1, 0, 1]) solid(G, {o: [sx * 12, 0, 0], m: k.RX(-0.5)}, [[0, 1.5, 1.5, 0.5], [22, 1.2, 1.2, 0.4], [26, 0.2, 0.2, 0.1]], M(C.wood2), {hatch: 0.05});
  box(G, fr(0, 7, 3), 17, 1, 0, 3.4, wd, {dk: 2}); box(G, fr(0, 14, 6.5), 17, 1, 0, 3.4, wd, {dk: 2.4});
  paint(c, G);
});
A.def('totem', [26, 100, 8], (c, v, P, pal) => {          // the camp standard: break it to break the camp
  const G = scene(-22), F = fr(0, 0, 0);
  solid(G, F, [[0, 6, 5, 2], [5, 4.5, 4, 1.6]], M(C.stone2));
  solid(G, F, [[5, 2, 2, 0.7], [66, 1.6, 1.6, 0.6]], M(C.dark), {hatch: 0.06, dk: 0.2});
  box(G, fr(0, 58, 0), 13, 1, 0, 2.2, M(C.dark), {dk: 0.4});
  flat(G, F, [[-11, 58, 1.4], [11, 58, 1.4], [11, 30, 1.4], [5.5, 25, 1.4], [0, 30, 1.4], [-5.5, 25, 1.4], [-11, 30, 1.4]], P.main, {dk: 1, w: 0.7});
  paint(c, G);
  const e = pt(G, F, 0, 44, 1.6);                           // emblem
  if (pal === 'corsair') { shape(c, U.ngon(e[0], e[1], 5, 7, 0.3), C.bone, 0.5); ink(c, [[e[0] - 2.6, e[1] - 1], [e[0] - 0.8, e[1] - 1.4], [e[0] - 1, e[1] + 0.6]]); ink(c, [[e[0] + 2.6, e[1] - 1], [e[0] + 0.8, e[1] - 1.4], [e[0] + 1, e[1] + 0.6]]); stroke(c, [[e[0] - 6, e[1] + 6], [e[0] + 6, e[1] + 10]], 1.1, C.bone); stroke(c, [[e[0] + 6, e[1] + 6], [e[0] - 6, e[1] + 10]], 1.1, C.bone); }
  else if (pal === 'hollow') { shape(c, [[e[0] - 4, e[1] - 5], [e[0] + 4, e[1] - 5], [e[0] + 5, e[1] + 4], [e[0], e[1] + 7], [e[0] - 5, e[1] + 4]], P.alt, 0.5); ink(c, U.ngon(e[0], e[1] - 0.5, 2.2, 6)); stroke(c, [[e[0], e[1] - 5], [e[0], e[1] - 9]], 0.8, C.bone); }
  else if (pal === 'crown') { shape(c, [[e[0] - 6, e[1] + 4], [e[0] - 7, e[1] - 4], [e[0] - 3, e[1] - 0.5], [e[0], e[1] - 6], [e[0] + 3, e[1] - 0.5], [e[0] + 7, e[1] - 4], [e[0] + 6, e[1] + 4]], C.must, 0.5); }
  else { shape(c, U.ngon(e[0], e[1], 6, 10, -Math.PI / 2).map((p, i) => i % 2 ? [e[0] + (p[0] - e[0]) * 0.45, e[1] + (p[1] - e[1]) * 0.45] : p), C.must, 0.5); }
  const t = pt(G, F, 0, 66, 0); shape(c, U.ngon(t[0], t[1] - 3, 3.6, 6, 0.4), C.bone, 0.6); ink(c, [[t[0] - 2, t[1] - 4], [t[0] - 0.4, t[1] - 4.2], [t[0] - 0.8, t[1] - 2.4]]); ink(c, [[t[0] + 2, t[1] - 4], [t[0] + 0.4, t[1] - 4.2], [t[0] + 0.8, t[1] - 2.4]]);
});
A.def('cage', [22, 50, 8], (c, v, P) => {                  // v: 0 = back half (drawn behind the prisoner), 1 = front bars
  const G = scene(-24), F = fr(0, 0, 0), wd = M(C.dark);
  if (v === 0) { box(G, F, 13, 9, 0, 2, wd); box(G, F, 13, 9, 34, 36.5, wd, {dk: 0.3}); for (let i = -2; i <= 2; i++) box(G, fr(i * 6, 0, -8.4), 0.6, 0.6, 2, 34, M(C.steel), {hatch: 0, dk: -0.2}); paint(c, G); }
  else { for (let i = -2; i <= 2; i++) box(G, fr(i * 6, 0, 8.4), 0.7, 0.7, 2, 34, M(C.steel), {hatch: 0}); for (const sx of [-1, 1]) box(G, fr(sx * 12.4, 0, 0), 0.7, 0.7, 2, 34, M(C.steel), {hatch: 0});
    box(G, fr(0, 2, 8.6), 13, 0.6, 0, 1.6, wd, {dk: 0.5}); box(G, fr(0, 33, 8.6), 13, 0.6, 0, 2, wd, {dk: 0.5}); paint(c, G);
    const l = pt(G, F, 0, 16, 9.4); shape(c, [[l[0] - 2.4, l[1] - 2], [l[0] + 2.4, l[1] - 2], [l[0] + 2.4, l[1] + 2.6], [l[0] - 2.4, l[1] + 2.6]], C.must, 0.5); }
});
A.def('chest', [16, 26, 6], (c, v, P) => {
  const G = scene(-26), F = fr(0, 0, 0), wd = M('#8a5a3a'), open = v === 1;
  box(G, F, 8, 5.4, 0, 6.5, wd, {hatch: 0.05, top: open ? M('#2a1a14') : wd});
  if (open) solid(G, {o: [0, 6.5, -5.4], m: k.RX(-1.1)}, [[0, 8.3, 5.6, 0.9, 0, 5.4], [2.6, 8.3, 5.6, 1.4, 0, 5.4], [4.3, 6.4, 3.8, 1.6, 0, 5.4]], wd, {dk: -1});
  else solid(G, fr(0, 6.5, 0), [[0, 8.3, 5.6, 0.9], [2.6, 8.3, 5.6, 1.4], [4.3, 6.4, 3.8, 1.6]], wd, {dk: 0.3});
  paint(c, G);
  for (const x of [-5, 5]) stroke(c, [pt(G, F, x, 0.4, 5.6), pt(G, F, x, open ? 6.2 : 9, 5.6)], 1.3, '#6f6a66');
  const l = pt(G, F, 0, 5.4, 5.8); shape(c, [[l[0] - 1.6, l[1] - 1.6], [l[0] + 1.6, l[1] - 1.6], [l[0] + 1.6, l[1] + 1.8], [l[0] - 1.6, l[1] + 1.8]], C.must, 0.4);
  if (open) { const g = pt(G, F, 0, 7, 0); for (let i = 0; i < 5; i++) shape(c, U.ngon(g[0] - 5 + i * 2.5, g[1] - (i % 2) * 1.2, 1.5, 6, i), C.must, 0.35); }
});
A.def('crate', [14, 26, 6], (c, v, P) => {
  const G = scene(-30 + (v % 3) * 14), F = fr(0, 0, 0), wd = M(v % 2 ? C.wood : '#9a7a5c', false), h = 11 + (v % 2) * 3;
  box(G, F, 7, 6, 0, h, wd, {hatch: 0.04}); paint(c, G);
  stroke(c, [pt(G, F, -6.4, 0.6, 6.1), pt(G, F, 6.4, h - 0.6, 6.1)], 0.7); stroke(c, [pt(G, F, -7, h * 0.5, 6.1), pt(G, F, 7, h * 0.5, 6.1)], 0.5);
});
function barrel(c, col, band, fuse) {
  const G = scene(-20), F = fr(0, 0, 0), wd = M(col, false);
  solid(G, F, [[0, 5.2, 5.2, 2.2], [7, 6.6, 6.6, 2.8], [14, 5.2, 5.2, 2.2]], wd, {hatch: 0.03}); paint(c, G);
  for (const y of [3.4, 10.6]) stroke(c, [pt(G, F, -5.8, y, 3), pt(G, F, -2, y - 0.5, 6), pt(G, F, 3, y - 0.3, 5.8), pt(G, F, 6.2, y + 0.3, 2)], 1.1, band);
  if (fuse) { const t = pt(G, F, 0, 14, 0); stroke(c, [t, [t[0] + 2, t[1] - 4], [t[0] + 5, t[1] - 5]], 0.7); shape(c, U.ngon(t[0] + 5.6, t[1] - 5.6, 1.5, 5, 0.3), C.must, 0.3); }
}
A.def('barrel', [12, 26, 6], c => barrel(c, C.wood, '#4a4046'));
A.def('keg', [14, 30, 6], c => barrel(c, C.red, INKC, true));
A.def('campfire', [16, 14, 8], (c, v, P) => {
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283, x = Math.cos(a) * 9, y = Math.sin(a) * 4.4 - 1; shape(c, U.ngon(x, y, 2.3 + rr(i) * 0.8, 5, i * 1.3, 0.8), i % 2 ? C.stone : C.stone2, 0.5); }
  shape(c, [[-7, -1], [-6, -3.4], [6.4, -0.6], [5.6, 1.6]], C.dark, 0.6); shape(c, [[7, -1.4], [6.2, -3.8], [-6, -0.4], [-5.4, 1.8]], C.wood2, 0.6);
});
A.def('stake', [14, 26, 5], (c, v, P) => {                 // surveyor's stakes: a build spot
  for (const sx of [-1, 1]) shape(c, [[sx * 8 - 1, 0], [sx * 8 - 0.8, -13], [sx * 8 + 0.8, -13.4], [sx * 8 + 1, 0]], C.wood, 0.5);
  stroke(c, [[-8, -11], [0, -8.6], [8, -11]], 0.6, C.red); shape(c, [[-1.6, -8.8], [1.6, -8.8], [0, -4.6]], C.red, 0.4); shape(c, [[-8, -13], [-2, -15.6], [-8, -18]], C.must, 0.4);
});
A.def('wagon', [44, 62, 12], (c, v, P) => {
  const G = scene(-26), F = fr(0, 0, 0);
  box(G, F, 22, 9, 8, 18, M(C.wood), {hatch: 0.05});
  solid(G, F, [[18, 21, 9, 2], [30, 19, 8, 5], [36, 14, 5, 4]], M(C.canvas, false), {hatch: 0.07, dk: 0.4});
  paint(c, G);
  for (const x of [-14, 14]) { const w = pt(G, F, x, 7, 10); shape(c, U.ngon(w[0], w[1], 8, 10, 0.2), C.wood2, 0.8); shape(c, U.ngon(w[0], w[1], 5.6, 10, 0.2), '#c9b78c', 0.4); for (let i = 0; i < 5; i++) { const a = i / 5 * 3.1416; stroke(c, [[w[0] - Math.cos(a) * 5.6, w[1] - Math.sin(a) * 5.6], [w[0] + Math.cos(a) * 5.6, w[1] + Math.sin(a) * 5.6]], 0.5); } }
  stroke(c, [pt(G, F, 22, 10, 0), pt(G, F, 36, 6, 2)], 1);
});
A.def('well', [18, 46, 8], (c, v, P) => {
  const G = scene(-22), F = fr(0, 0, 0);
  solid(G, F, [[0, 9, 7, 3.4], [9, 9, 7, 3.4]], M(C.stone), {top: M('#2a2228'), hatch: 0.05});
  for (const sx of [-1, 1]) box(G, fr(sx * 8, 0, 0), 0.9, 0.9, 9, 26, M(C.wood2), {dk: 0.4});
  solid(G, F, [[26, 12, 7, 1], [32, 12, 0.6, 0.3]], M(C.dark), {dk: 1}); paint(c, G);
  stroke(c, [pt(G, F, 0, 26, 0), pt(G, F, 0, 12, 0)], 0.5);
});
A.def('haybale', [16, 20, 6], (c, v, P) => { const G = scene(-18 + v * 20), F = fr(0, 0, 0); solid(G, F, [[0, 9, 5.4, 1.4], [9, 9, 5.4, 1.4]], M(C.thatch, false), {hatch: 0.16}); paint(c, G); stroke(c, [pt(G, F, -4, 0, 5.5), pt(G, F, -4, 9, 5.5)], 0.6, C.red); stroke(c, [pt(G, F, 4, 0, 5.5), pt(G, F, 4, 9, 5.5)], 0.6, C.red); });
A.def('fence', [16, 20, 4], (c, v, P) => {                // rail fence segment, 28 wide
  for (const x of [-13, 13]) shape(c, [[x - 1, 0], [x - 0.8, -11.5], [x + 1, -12], [x + 1.2, 0]], '#7a614a', 0.5);
  stroke(c, [[-14, -8.5], [14, -9.2]], 1.3, '#7a614a'); stroke(c, [[-14, -4.4], [14, -3.8]], 1.3, '#7a614a'); stroke(c, [[-14, -9.2], [14, -9.9]], 0.45); stroke(c, [[-14, -3.6], [14, -3]], 0.45);
});
A.def('sign', [14, 30, 4], (c, v, P) => { shape(c, [[-1, 0], [-0.9, -18], [0.9, -18], [1, 0]], C.wood2, 0.5); shape(c, [[-9, -19], [8, -20], [11, -16.5], [8, -13], [-9, -13.6]], C.paper, 0.7); for (let i = 0; i < 4; i++) hatch(c, [-6 + i * 3.6, -15], [-4.4 + i * 3.6, -17.6], 0.7); });
A.def('lamp', [10, 44, 4], (c, v, P) => { shape(c, [[-0.9, 0], [-0.8, -30], [0.8, -30], [0.9, 0]], C.dark, 0.5); stroke(c, [[0, -29], [6, -31]], 0.9); shape(c, [[4, -30], [8, -30], [7.4, -24], [4.6, -24]], '#f0c23a', 0.5); ink(c, [[6.4, -30], [8, -30], [7.4, -24], [6.6, -24]]); });
A.def('grave', [10, 24, 5], (c, v, P) => {
  if (v % 3 === 2) { shape(c, [[-1, 0], [-0.9, -15], [0.9, -15], [1, 0]], C.wood2, 0.5); shape(c, [[-5, -11.4], [5, -11.8], [5, -9.6], [-5, -9.2]], C.wood2, 0.5); return; }
  const p = [[-5, 0], [-5.2, -10], [-3, -14], [2.6, -14.4], [5, -10.6], [5.2, 0]]; shape(c, p, C.stone, 0.8); ink(c, [[2.2, -14.2], [2.6, -14.4], [5, -10.6], [5.2, 0], [2.8, 0]]);
  stroke(c, [[-2.6, -9.4], [0.6, -9.6]], 0.5); stroke(c, [[-1, -11.6], [-1, -6]], 0.5);
});
A.def('gallows', [26, 70, 6], (c, v, P) => {
  shape(c, [[-12, 0], [-11.6, -46], [-9, -46], [-8.6, 0]], C.dark, 0.7); shape(c, [[-12, -46], [14, -47], [14, -44], [-12, -43]], C.dark, 0.7); stroke(c, [[-10, -34], [-1, -45]], 1.1);
  stroke(c, [[9, -44], [9.3, -32]], 0.6); stroke(c, U.ngon(9.3, -29, 2.6, 7, 0).concat([[11.9, -29]]), 0.6); shape(c, [[-18, 0], [-16, -4], [16, -4.6], [19, 0]], C.wood2, 0.7);
});

/* ================= props: plants and rocks ================= */
A.def('tuft', [9, 10, 2], (c, v, P) => { const col = ['#8b7d4f', '#7c8a5a', '#6a6a52', '#8f9a5c'][v % 4]; for (let i = -2; i <= 2; i++) hatch(c, [i * 1.1, 0], [i * 2.1 + rr(i + 3) - 0.5, -4.6 + Math.abs(i) * 1.1 - rr(i + 9) * 1.6], 0.9, i % 2 ? col : INKC); });
A.def('rock', [14, 18, 4], (c, v, P) => {
  const s = 0.8 + (v % 3) * 0.35, col = v % 2 ? C.stone2 : C.stone, p = [[-6, 0], [-5, -4], [-1, -6.5], [4, -5], [6.5, -1.5], [6, 0]].map((q, i) => [q[0] * s + (rr(i) - 0.5), q[1] * s]);
  shape(c, p, col, 0.8); ink(c, [[1.5 * s, -6 * s], p[3], p[4], p[5], [3 * s, 0]]); stroke(c, [[-3.5 * s, -2 * s], [-1.5 * s, -2.6 * s]], 0.5); stroke(c, [[-3 * s, -3.6 * s], [-1.6 * s, -4 * s]], 0.5);
});
A.def('boulder', [26, 36, 6], (c, v, P) => {
  const col = v % 2 ? C.stone2 : C.stone, p = [[-17, 0], [-18, -9], [-12, -19], [-3, -24], [8, -22], [16, -13], [18, -4], [16, 0]].map((q, i) => [q[0] + (rr(i) - 0.5) * 3, q[1] + (rr(i + 20) - 0.5) * 2]);
  shape(c, p, col, 1); ink(c, [[4, -23], p[4], p[5], p[6], p[7], [7, 0], [9, -10]]); shape(c, [[-12, -19], [-3, -24], [4, -23], [-2, -16], [-10, -14]], k.mix(col, '#fff2d2', 0.25), 0);
  for (let i = 0; i < 4; i++) stroke(c, [[-13 + i * 3, -4 - i * 2.5], [-9 + i * 3, -5 - i * 2.5]], 0.5);
});
A.def('cactus', [14, 34, 3], (c, v, P) => {
  const s = 0.9 + (v % 3) * 0.2, col = C.leaf, T = p => p.map(q => [q[0] * s, q[1] * s]);
  shape(c, T([[-2.4, 0], [-2.6, -17], [-1, -19.5], [1.2, -19.5], [2.6, -17], [2.4, 0]]), col, 0.8); ink(c, T([[0.8, -19.5], [1.2, -19.5], [2.6, -17], [2.4, 0], [0.9, 0]]));
  shape(c, T([[-2.6, -8], [-6.5, -8.5], [-7, -14], [-5, -14.4], [-4.8, -10.6], [-2.6, -10.4]]), col, 0.8);
  if (v % 2) { k.outline(c, T([[2.6, -10], [6.4, -10.4], [6.8, -15.5], [4.9, -15.8], [4.7, -12.4], [2.6, -12.2]]), 1.4, seed++); ink(c, T([[2.6, -10], [6.4, -10.4], [6.8, -15.5], [4.9, -15.8], [4.7, -12.4], [2.6, -12.2]])); }
  for (let y = -15; y < -2; y += 4) hatch(c, [-1.3 * s, y * s], [-1.3 * s, (y + 1.6) * s], 0.45);
});
function canopy(c, cx, cy, rx, ry, col, n) {              // leafy mass: lit top-left facet, solid ink crescent down the right and underside
  const p = [], out = [], inn = [];
  for (let i = 0; i < n; i++) { const a = -0.7 + i / n * 6.2832, r = 0.84 + rr(i) * 0.28, q = [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]; p.push(q);
    if (a < 2.2) { out.push(q); inn.push([cx + Math.cos(a) * rx * r * 0.52 + rx * 0.16, cy + Math.sin(a) * ry * r * 0.5 + ry * 0.16]); } }
  shape(c, p, col, 1);
  if (out.length > 1) ink(c, out.concat(inn.reverse()));
  const hx = cx - rx * 0.34, hy = cy - ry * 0.38; k.fillp(c, U.ngon(hx, hy, 1, 6, 0.5).map(q => [hx + (q[0] - hx) * rx * 0.3, hy + (q[1] - hy) * ry * 0.26]), k.mix(col, '#fff2d2', 0.22));
  return p;
}
A.def('tree', [30, 74, 5], (c, v, P) => {
  const col = ['#6f8a54', '#7c8a5a', '#8a9a5c', '#5f7350'][v % 4], h = 26 + (v % 3) * 5;
  shape(c, [[-3, 0], [-2.2, -h], [2.2, -h], [3.4, 0]], C.wood2, 0.8); ink(c, [[0.8, -h], [2.2, -h], [3.4, 0], [1.2, 0]]);
  canopy(c, -8, -h - 4, 12, 9, col, 9); canopy(c, 8, -h - 6, 13, 10, col, 9); canopy(c, 0, -h - 17, 15, 12, col, 10);
});
A.def('pine', [22, 76, 5], (c, v, P) => {
  const col = v % 2 ? '#4f6a5a' : '#5f7350', h = 54 + (v % 3) * 6;
  shape(c, [[-2, 0], [-1.6, -14], [1.6, -14], [2.2, 0]], C.wood2, 0.7);
  for (let i = 0; i < 4; i++) { const y = -10 - i * (h - 14) / 4, w = 15 - i * 3, hh = (h - 10) / 3.2; shape(c, [[-w, y], [-w * 0.45, y - hh * 0.5], [0, y - hh], [w * 0.45, y - hh * 0.5], [w, y], [w * 0.4, y - 2], [0, y + 1.5], [-w * 0.4, y - 2]], col, 0.9); ink(c, [[0, y - hh], [w * 0.45, y - hh * 0.5], [w, y], [w * 0.4, y - 2], [w * 0.2, y - hh * 0.5]]); }
});
function branch(c, a, len, ang, w, d, col) {
  const b = [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len]; shape(c, k.ribbon(a, b, w, w * 0.62), col, 0.55);
  if (d > 0) { const n = d > 2 ? 3 : 2; for (let i = 0; i < n; i++) branch(c, b, len * (0.6 + rr(d * 7 + i) * 0.2), ang + (i - (n - 1) / 2) * 0.75 + (rr(d * 3 + i) - 0.5) * 0.4, w * 0.6, d - 1, col); }
}
A.def('deadtree', [34, 70, 5], (c, v, P) => { branch(c, [0, 0], 20 + (v % 3) * 3, -Math.PI / 2 + (v % 2 ? 0.12 : -0.1), 3, 3, v % 2 ? C.dead : '#4a4046'); ink(c, [[0.6, 0], [3, 0], [2.4, -12], [0.9, -12]]); });
A.def('swamptree', [36, 70, 5], (c, v, P) => {
  shape(c, [[-5, 0], [-2.4, -9], [-2, -30], [2.4, -30], [3, -9], [6, 0]], '#5a5f48', 0.8); ink(c, [[0.8, -30], [2.4, -30], [3, -9], [6, 0], [2, 0]]);
  const p = canopy(c, 0, -38, 22, 12, v % 2 ? '#5f7350' : '#6a7a4a', 11);
  for (let i = 0; i < 7; i++) { const x = -17 + i * 5.6; stroke(c, [[x, -32], [x + (rr(i) - 0.5) * 2, -32 + 8 + rr(i + 5) * 9]], 0.6, i % 2 ? '#5f7350' : INKC); }
});
A.def('bush', [16, 18, 3], (c, v, P) => { canopy(c, 0, -6, 11, 6.5, ['#7c8a5a', '#6f8a54', '#8a8452', '#5a5f48'][v % 4], 8); });
A.def('reeds', [10, 22, 2], (c, v, P) => { for (let i = -2; i <= 2; i++) { const x = i * 2.2, t = [x + (rr(i + 5) - 0.5) * 3, -11 - rr(i + 9) * 7]; hatch(c, [x, 0], t, 0.8, i % 2 ? '#6a7a4a' : INKC); if (i % 2 === 0) shape(c, [[t[0] - 0.9, t[1] + 1], [t[0] + 0.9, t[1] + 1], [t[0] + 0.7, t[1] - 3], [t[0] - 0.7, t[1] - 3]], '#6a4a34', 0.3); } });
A.def('mushroom', [10, 16, 2], (c, v, P) => { const col = v % 2 ? '#b8433c' : '#c9a23a'; shape(c, [[-1.4, 0], [-1, -6], [1, -6], [1.4, 0]], C.bone, 0.5); shape(c, [[-6, -5.4], [-3.6, -10], [1.6, -11], [5.6, -8], [6, -5.2]], col, 0.7); ink(c, [[1.6, -11], [5.6, -8], [6, -5.2], [3, -5.3]]); for (let i = 0; i < 3; i++) shape(c, U.ngon(-3 + i * 2.2, -7.6 - (i % 2), 0.8, 5, i), C.bone, 0); });
A.def('bones', [12, 10, 3], (c, v, P) => { stroke(c, [[-7, -1], [5, -3]], 1.3, C.bone); stroke(c, [[-5, -4], [6, -0.6]], 1.3, C.bone); shape(c, U.ngon(-1 + v % 2 * 4, -4.6, 3, 7, 0.4), C.bone, 0.5); ink(c, [[-2.2 + v % 2 * 4, -5.4], [-0.8 + v % 2 * 4, -5.6], [-1.2 + v % 2 * 4, -4]]); });
A.def('stump', [10, 12, 3], (c, v, P) => { shape(c, [[-5, 0], [-4.4, -6], [4.4, -6.4], [5.4, 0]], C.wood2, 0.7); shape(c, U.ngon(0, -6.2, 4.6, 8, 0.2, 0.36), '#c9b287', 0.5); ink(c, [[2, -6.3], [4.4, -6.4], [5.4, 0], [2.6, 0]]); });
A.def('bag', [8, 14, 3], (c, v, P) => { shape(c, [[-4.4, 0], [-5, -5], [-2, -8.4], [-2.6, -10.6], [2.6, -10.8], [2, -8.4], [5, -5], [4.4, 0]], '#c9b287', 0.7); ink(c, [[2, -8.4], [5, -5], [4.4, 0], [2, 0]]); stroke(c, [[-2, -8.4], [2, -8.4]], 0.7, C.red); k.tick(c, [-1.6, -5.6], [1.2, -2], 0.9, C.must); });
A.def('coin', [5, 8, 2], (c, v, P) => { shape(c, U.ngon(0, -3, 2.6, 8, 0.2), C.must, 0.5); stroke(c, [[-0.8, -3.6], [0.6, -2.4]], 0.5, '#fff6d8'); });
A.def('heart', [6, 10, 2], (c, v, P) => { shape(c, [[-3.4, -1], [-3.6, -6.6], [3.6, -6.6], [3.4, -1]], C.paper, 0.6); k.fillp(c, [[-0.9, -5.6], [0.9, -5.6], [0.9, -4.6], [2, -4.6], [2, -3], [0.9, -3], [0.9, -2], [-0.9, -2], [-0.9, -3], [-2, -3], [-2, -4.6], [-0.9, -4.6]], C.red); });
})();
