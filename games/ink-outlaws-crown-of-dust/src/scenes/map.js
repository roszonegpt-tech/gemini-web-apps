/* Crown of Dust - title backdrop and campaign map (src/scenes/map.js). Both are drawn on the game canvas; menus sit above in the DOM. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, S = CD.Sprites, A = CD.Art, I = CD.Input, INK = window.INK, k = INK.kit;

/* ================= title: a posse on the march ================= */
const T = {bg: null, walkers: [], props: [], t: 0};
function titleBuild() {
  const V = CD.View, s = T.s = Math.max(1.3, V.h / 340), W = T.W = V.w / s, H = T.H = V.h / s, r = U.rng32(11);
  const bg = T.bg = document.createElement('canvas'); bg.width = V.cv.width; bg.height = V.cv.height; const c = bg.getContext('2d'), hz = T.hz = H * 0.34; c.setTransform(s * V.dpr, 0, 0, s * V.dpr, 0, 0);
  c.fillStyle = '#d9c9a0'; c.fillRect(0, 0, W, H); c.fillStyle = '#c9b78c'; c.fillRect(0, 0, W, hz);
  for (let x = -10; x < W; x += 46 + r() * 30) { const w = 30 + r() * 40, h = 9 + r() * 16;
    U.poly(c, [[x, hz], [x + 4, hz - h], [x + w * 0.55, hz - h - 1.5], [x + w - 5, hz - h + 1], [x + w, hz]], '#b39e76', 0.7); U.poly(c, [[x + w * 0.55, hz - h - 1.5], [x + w - 5, hz - h + 1], [x + w, hz], [x + w * 0.7, hz]], U.INKC, 0); }
  U.seg(c, 0, hz, W, hz, 0.9);
  for (let i = 0; i < 260; i++) { const x = r() * W, y = hz + 4 + r() * (H - hz), w = 1.5 + r() * 4; U.seg(c, x, y, x + w, y + (r() - 0.5) * 0.6, i % 7 ? 0.5 : 0.7, i % 7 ? '#bfae85' : U.INKC); }
  T.props = []; const kinds = ['cactus', 'cactus', 'rock', 'tuft', 'tuft', 'boulder', 'deadtree', 'bush'];
  for (let i = 0; i < 22; i++) T.props.push({kind: U.pick(kinds, r), x: r() * W, y: hz + 10 + r() * (H - hz - 10), v: Math.floor(r() * 4)});
  T.props.push({kind: 'house', x: W * 0.16, y: hz + 22, v: 0, pal: 'outlaw'}, {kind: 'tower', x: W * 0.86, y: hz + 30, v: 1, pal: 'outlaw'}, {kind: 'wagon', x: W * 0.7, y: hz + 44, v: 0}, {kind: 'sign', x: W * 0.3, y: hz + 40, v: 0});
  const ids = U.shuffle(D.outlaws.slice(), U.rng32((Date.now() / 60000) | 0)).slice(0, 9).concat(['biscuit', 'ash']);
  T.walkers = ids.map((id, i) => { const u = D.units[id]; return {look: u.look, x: (i / ids.length) * (W + 80) - 40, y: hz + 34 + ((i * 37) % 60) / 60 * (H - hz - 44), sp: 14 + (i % 4) * 3, t: i * 0.3}; });
}
CD.scenes.title = {
  enter: () => { titleBuild(); CD.UI.title(); },
  resize: titleBuild,
  update: dt => { T.t += dt; for (const w of T.walkers) { w.x += w.sp * dt; w.t += dt; if (w.x > T.W + 40) w.x = -40; } },
  draw: () => {
    const V = CD.View, c = V.ctx, s = T.s * V.dpr; if (!T.bg || T.bg.width !== V.cv.width) titleBuild();
    S.beginFrame(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(T.bg, 0, 0); c.setTransform(s, 0, 0, s, 0, 0);
    const list = T.props.map(p => ({y: p.y, p: p})).concat(T.walkers.map(w => ({y: w.y, w: w}))); list.sort((a, b) => a.y - b.y);
    for (const o of list) { if (o.p) A.draw(c, o.p.kind, o.p.x, o.p.y, o.p.v, o.p.pal); else { const w = o.w; U.ell(c, w.x, w.y, 9, 2.3, 'rgba(22,18,20,.26)'); S.draw(c, w.look, 'walk', Math.floor(w.t * INK.FPS.walk * (w.sp / 20)) % INK.COUNT.walk, 'E', w.x, w.y); } }
  }
};

/* ================= campaign map ================= */
const MP = CD.Map = {sel: null, bg: null, dirty: true, t: 0, MH: 250};
const OWNC = f => D.factions[f].color;
function mapLayout() {
  const V = CD.View, top = 50, pad = 8; MP.px = (V.h - top - pad) / MP.MH; MP.MW = (V.w - pad * 2) / MP.px;
  if (MP.MW < 250) { MP.px = (V.w - pad * 2) / 250; MP.MW = 250; MP.MHv = (V.h - top - pad) / MP.px; } else MP.MHv = MP.MH;
  MP.ox = pad; MP.oy = top; MP.dirty = true;
}
const NX = t => 14 + t.x * (MP.MW - 28), NY = t => 16 + t.y * (MP.MHv - 40);
function blob(cx, cy, r, seed, n) { const p = []; for (let i = 0; i < (n || 12); i++) { const a = i / (n || 12) * 6.2832, rr = r * (0.78 + k.rnd(seed, i) * 0.44); p.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * 0.9]); } return p; }
function mapBuild() {
  const V = CD.View, G = CD.G, bg = MP.bg = MP.bg || document.createElement('canvas'); bg.width = V.cv.width; bg.height = V.cv.height;
  const c = bg.getContext('2d'), s = MP.px * V.dpr; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = U.INKC; c.fillRect(0, 0, bg.width, bg.height);
  c.setTransform(s, 0, 0, s, MP.ox * V.dpr, MP.oy * V.dpr); c.lineCap = 'round';
  const W = MP.MW, H = MP.MHv, r = U.rng32(5);
  c.fillStyle = U.PAPER; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) { c.globalAlpha = 0.35; U.poly(c, blob(r() * W, r() * H, 14 + r() * 26, i + 3, 10), i % 2 ? U.PAPER2 : '#efe9da'); c.globalAlpha = 1; }
  /* territories: a tinted, inked patch of land each */
  for (const t of D.terr) { const p = blob(NX(t), NY(t), t.stronghold ? 27 : t.home ? 26 : 22, U.hash(t.id) % 97, 13); c.globalAlpha = 0.5; k.fillp(c, p, k.mix(OWNC(G.own[t.id]), U.PAPER, 0.35)); c.globalAlpha = 1; k.outline(c, p, 1.5, U.hash(t.id) % 53); }
  /* trails */
  for (const l of D.links) { const a = D.terrById[l[0]], b = D.terrById[l[1]], ax = NX(a), ay = NY(a), bx = NX(b), by = NY(b), mx = (ax + bx) / 2 + (by - ay) * 0.12, my = (ay + by) / 2 - (bx - ax) * 0.12;
    c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(mx, my, bx, by); c.setLineDash([3, 3]); c.lineWidth = 1.3; c.strokeStyle = '#5b5048'; c.stroke(); c.setLineDash([]); }
  /* scenery by biome */
  const deco = {desert: ['cactus', 'rock', 'cactus', 'boulder'], swamp: ['swamptree', 'reeds', 'bush', 'mushroom'], hollow: ['deadtree', 'grave', 'deadtree', 'rock'], crown: ['tree', 'pine', 'haybale', 'bush']};
  const items = [];
  for (const t of D.terr) { const set = deco[t.biome || D.factions[t.own].biome], rr = U.rng32(U.hash(t.id)); for (let i = 0; i < 9; i++) { const a = rr() * 6.28, d = 15 + rr() * 16; items.push({kind: U.pick(set, rr), x: NX(t) + Math.cos(a) * d * 1.25, y: NY(t) + Math.sin(a) * d * 0.8, v: Math.floor(rr() * 4), sc: 0.32}); } }
  for (let i = 0; i < 26; i++) items.push({kind: 'boulder', x: r() * W, y: r() * H, v: i % 2, sc: 0.3 + r() * 0.25, far: true});
  for (const t of D.terr) { const own = G.own[t.id], x = NX(t), y = NY(t); items.push({kind: t.kind === 'fort' ? 'keep' : t.kind === 'town' ? (t.home ? 'hall' : 'house') : own === 'corsair' ? 'shack' : 'bigtent', x: x, y: y, v: t.home ? 0 : 2, pal: own, sc: t.kind === 'fort' ? 0.36 : t.home ? 0.4 : 0.44, node: true});
    items.push({kind: 'totem', x: x + (t.kind === 'fort' ? 22 : 17), y: y + 1.5, v: 0, pal: own, sc: 0.3, node: true}); }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) { if (it.far && D.terr.some(t => Math.hypot(NX(t) - it.x, NY(t) - it.y) < 30)) continue; c.save(); c.translate(it.x, it.y); c.scale(it.sc, it.sc); A.draw(c, it.kind, 0, 0, it.v, it.pal); c.restore(); }
  for (const t of D.terr) { const y = NY(t) + 9; U.text(c, t.name, NX(t), y, 5.4, U.PAPER, {stroke: 1.5, font: 'Rockwell,Georgia,serif'}); }
  /* frame, compass, cartouche */
  k.outline(c, [[2, 2], [W - 2, 2], [W - 2, H - 2], [2, H - 2]], 2.4, 7); k.outline(c, [[4.5, 4.5], [W - 4.5, 4.5], [W - 4.5, H - 4.5], [4.5, H - 4.5]], 0.9, 9);
  const cx = W - 22, cy = 22; k.fillp(c, [[cx, cy - 12], [cx + 3, cy], [cx, cy + 12], [cx - 3, cy]], U.RED); k.fillp(c, [[cx - 12, cy], [cx, cy - 3], [cx + 12, cy], [cx, cy + 3]], U.PAPER3); k.outline(c, [[cx, cy - 12], [cx + 3, cy], [cx, cy + 12], [cx - 3, cy]], 0.9, 3); U.text(c, 'N', cx, cy - 13.5, 5, U.INKC, {stroke: 0});
  U.text(c, 'THE TALLY BASIN', 12, 13, 7, U.INKC, {stroke: 0, align: 'left', font: 'Rockwell,Georgia,serif'});
  MP.dirty = false;
}
MP.select = function (id) { MP.sel = id; CD.UI.mapInfo(D.terrById[id]); };
CD.scenes.map = {
  enter: arg => { mapLayout(); MP.sel = MP.sel || CD.G.at || 'gulch'; CD.UI.mapChrome(arg); CD.UI.mapInfo(D.terrById[MP.sel]); const hd = D.units[CD.G.hero]; S.warm(E_look(hd), ['idle'], 1, ['S']); },
  leave: () => {},
  resize: mapLayout,
  update: dt => {
    MP.t += dt; S.step(4);
    if (I.hit('tap')) { const V = CD.View, x = (I.tapX - MP.ox) / MP.px, y = (I.tapY - MP.oy) / MP.px; let best = null, bd = 24; for (const t of D.terr) { const d = Math.hypot(NX(t) - x, NY(t) - 6 - y); if (d < bd) { bd = d; best = t; } } if (best) { MP.select(best.id); CD.Sfx.play('page'); } }
    I.flush();
  },
  draw: () => {
    const V = CD.View, c = V.ctx, G = CD.G; if (!G) return; if (MP.dirty || !MP.bg || MP.bg.width !== V.cv.width || MP.bg.height !== V.cv.height) mapBuild();
    S.beginFrame(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(MP.bg, 0, 0); const s = MP.px * V.dpr; c.setTransform(s, 0, 0, s, MP.ox * V.dpr, MP.oy * V.dpr);
    for (const t of D.terr) { const x = NX(t), y = NY(t);
      if (CD.Camp.canAttack(t)) { const b = Math.sin(MP.t * 4 + x) * 1.5; U.poly(c, [[x - 5, y - 30 + b], [x + 5, y - 30 + b], [x, y - 23 + b]], U.RED, 0.9); }
      if (t.id === MP.sel) { c.setLineDash([4, 3]); c.lineDashOffset = -MP.t * 8; U.ell(c, x, y - 2, 26, 15, null, 1.6, U.MUST); c.setLineDash([]); c.lineDashOffset = 0; } }
    const at = D.terrById[G.at] || D.terrById.gulch, hd = D.units[G.hero], lk = E_look(hd);
    c.save(); c.translate(NX(at) - 16, NY(at) + 4); c.scale(0.5, 0.5); U.ell(c, 0, 0, 9, 2.4, 'rgba(22,18,20,.3)'); S.draw(c, lk, 'idle', Math.floor(MP.t * 5) % 4, 'S', 0, 0); c.restore();
  }
};
function E_look(hd) { const G = CD.G; let v = CD.Ent.lookWith(hd.look, G.weapons[0]); if (G.mount) v = D.mounted(v, G.mount); return v; }
MP.heroLook = () => E_look(D.units[CD.G.hero]);
MP.invalidate = () => { MP.dirty = true; };
})();
