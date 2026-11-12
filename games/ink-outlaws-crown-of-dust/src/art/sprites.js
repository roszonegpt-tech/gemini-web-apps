/* Crown of Dust - sprite cache (src/art/sprites.js).
   Every character frame comes from the lab painter (INK.draw). A frame costs 1-5 ms to paint, so each one is painted once
   into a scratch canvas, trimmed to its inked pixels and kept in a byte-budgeted LRU. Big units (rex, riders) never clip
   because the scratch region is larger than the lab's 80x80 cell. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, INK = window.INK;
const S = CD.Sprites = {scale: 3, bytes: 0, budget: 150e6, made: 0, spent: 0, frameBudget: 9, map: new Map(), ids: new WeakMap(), nextId: 1, queue: []};
const RX0 = 64, RY0 = 100, RW = 128, RH = 116;          // scratch region in painter units: x -64..64, y -100..16 around the foot anchor
let scratch = null, sctx = null, tint = null;

S.configure = function (pxPerUnit) {
  const cap = U.COARSE ? 3 : 4, sc = U.clamp(Math.round(pxPerUnit), 2, cap);
  S.budget = U.COARSE ? 70e6 : 190e6;
  if (sc !== S.scale) { S.scale = sc; S.flush(); }
};
S.flush = function () { S.map.clear(); S.bytes = 0; S.queue.length = 0; if (CD.Art) CD.Art.flush(); };
S.idOf = function (look) { let id = S.ids.get(look); if (!id) { id = S.nextId++; S.ids.set(look, id); } return id; };
S.beginFrame = function () { S.spent = 0; };

/* paint fn(ctx) into a scratch region (painter units, origin at the anchor), trim to the inked pixels, return a sprite */
S.capture = function (rx0, ry0, rw, rh, s, fn, mult) {
  mult = mult || 1; const W = Math.ceil(rw * s), H = Math.ceil(rh * s);
  if (!scratch || scratch.width < W || scratch.height < H) { scratch = document.createElement('canvas'); scratch.width = Math.max(W, scratch ? scratch.width : 0); scratch.height = Math.max(H, scratch ? scratch.height : 0); sctx = scratch.getContext('2d', {willReadFrequently: true}); }
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1; sctx.clearRect(0, 0, scratch.width, scratch.height);
  fn(sctx, rx0 * s, ry0 * s, s);
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  const d = new Uint32Array(sctx.getImageData(0, 0, W, H).data.buffer);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0, i = 0; y < H; y++) { let hit = false; for (let x = 0; x < W; x++, i++) if (d[i] >>> 24) { hit = true; if (x < x0) x0 = x; if (x > x1) x1 = x; } if (hit) { if (y < y0) y0 = y; y1 = y; } }
  if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(scratch, x0, y0, w, h, 0, 0, w, h);
  return {cv: cv, ox: (x0 / s - rx0) * mult, oy: (y0 / s - ry0) * mult, w: w / s * mult, h: h / s * mult, bytes: w * h * 4};
};
function paint(look, act, f, dir, mult) {
  return S.capture(RX0, RY0, RW, RH, S.scale * mult, (ctx, ax, ay, s) => INK.draw(ctx, look, act, f, dir, {x: ax, y: ay, scale: s}), mult);
}
function store(k, sp) {
  S.map.set(k, sp); S.bytes += sp.bytes; S.made++;
  if (S.bytes > S.budget) for (const [k2, v] of S.map) { if (S.bytes <= S.budget * 0.85) break; if (k2 === k) continue; S.map.delete(k2); S.bytes -= v.bytes; }
}
/* returns a trimmed sprite {cv, ox, oy, w, h} in world units relative to the feet, or null when this frame's paint budget is spent */
S.get = function (look, act, f, dir, mult, force) {
  mult = mult || 1; const k = S.idOf(look) + '|' + act + '|' + f + '|' + dir + '|' + mult;
  let sp = S.map.get(k);
  if (sp) { S.map.delete(k); S.map.set(k, sp); return sp; }
  if (!force && S.spent > S.frameBudget) return null;
  const t0 = performance.now(); sp = paint(look, act, f, dir, mult); S.spent += performance.now() - t0;
  store(k, sp); return sp;
};
S.has = (look, act, f, dir, mult) => S.map.has(S.idOf(look) + '|' + act + '|' + f + '|' + dir + '|' + (mult || 1));
/* queue frames to paint ahead of need; step() paints for a few ms and returns how many are left */
S.warm = function (look, acts, mult, dirs) { for (const act of acts) for (const dir of dirs || U.DIRS) for (let f = 0; f < INK.COUNT[act]; f++) if (!S.has(look, act, f, dir, mult)) S.queue.push([look, act, f, dir, mult || 1]); };
S.step = function (ms) { const t0 = performance.now(); while (S.queue.length && performance.now() - t0 < ms) { const q = S.queue.pop(); S.get(q[0], q[1], q[2], q[3], q[4], true); } return S.queue.length; };

/* draw at world position (feet). opt: alpha, flash (0..1 paper-white), rot (radians about the feet), sx/sy squash */
S.draw = function (c, look, act, f, dir, x, y, opt) {
  opt = opt || {}; const mult = opt.mult || 1;
  let sp = S.get(look, act, f, dir, mult);
  if (!sp) sp = opt.last || S.get(look, 'idle', 0, dir, mult, true);
  const plain = !opt.rot && !opt.sx && !opt.sy && opt.alpha == null;
  if (!plain) { c.save(); c.translate(x, y); if (opt.rot) c.rotate(opt.rot); if (opt.sx || opt.sy) c.scale(opt.sx || 1, opt.sy || 1); if (opt.alpha != null) c.globalAlpha = opt.alpha; x = 0; y = 0; }
  if (opt.flash > 0) {
    if (!tint) tint = document.createElement('canvas');
    if (tint.width < sp.cv.width || tint.height < sp.cv.height) { tint.width = Math.max(tint.width, sp.cv.width); tint.height = Math.max(tint.height, sp.cv.height); }
    const t = tint.getContext('2d'); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, sp.cv.width, sp.cv.height); t.drawImage(sp.cv, 0, 0);
    t.globalCompositeOperation = 'source-atop'; t.globalAlpha = Math.min(1, opt.flash); t.fillStyle = opt.flashCol || '#fff6d8'; t.fillRect(0, 0, sp.cv.width, sp.cv.height);
    c.drawImage(tint, 0, 0, sp.cv.width, sp.cv.height, x + sp.ox, y + sp.oy, sp.w, sp.h);
  } else c.drawImage(sp.cv, x + sp.ox, y + sp.oy, sp.w, sp.h);
  if (!plain) c.restore();
  return sp;
};
/* anchors in painter cell space -> offset from the feet in world units */
S.anchors = function (look, act, f, dir) { try { return INK.anchors(look, act, f, dir); } catch (e) { return null; } };
S.off = (pt, mult) => [(pt[0] - INK.AX) * (mult || 1), (pt[1] - INK.AY) * (mult || 1)];
})();
