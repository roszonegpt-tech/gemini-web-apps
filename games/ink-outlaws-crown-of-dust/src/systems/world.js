/* Crown of Dust - battlefield (src/systems/world.js).
   Builds a mission map from a spec (type, faction, biome, tier, seed): inked ground, props, camps, walls, structures.
   Also owns collision, the navigation grid and structure behaviour (spawner tents, towers, kegs, campfires). */
(function () {
'use strict';
const CD = window.CD, U = CD.U, D = CD.Data, A = CD.Art, E = CD.Ent, S = CD.Sprites;
const W = CD.World = {};
const NC = 12, BK = 64;
let sid = 100000;

W.BIOME = {
  desert: {ground: '#d9c9a0', patch: '#cebd90', lite: '#e3d6b2', tick: '#bfae85', trail: '#e6dbb8', props: [['cactus', 5], ['rock', 5], ['boulder', 2], ['bush', 1], ['deadtree', 1]], bits: ['tuft', 'tuft', 'tuft', 'bones', 'rock']},
  swamp: {ground: '#b9bc8c', patch: '#a3ad7c', lite: '#c9cc9c', tick: '#8f9a6a', trail: '#cfc9a0', water: '#8fa894', props: [['swamptree', 5], ['reeds', 5], ['bush', 3], ['boulder', 1], ['stump', 2], ['mushroom', 2]], bits: ['tuft', 'tuft', 'mushroom', 'bones', 'stump']},
  hollow: {ground: '#bdb6a8', patch: '#aaa397', lite: '#cbc5b8', tick: '#8f887c', trail: '#d2ccbe', props: [['deadtree', 6], ['grave', 4], ['boulder', 2], ['rock', 3], ['gallows', 0.5], ['lamp', 1]], bits: ['tuft', 'bones', 'bones', 'stump', 'rock']},
  crown: {ground: '#c7cc98', patch: '#b4bf84', lite: '#d6d9ac', tick: '#98a66a', trail: '#ddd3ac', props: [['tree', 5], ['pine', 3], ['bush', 3], ['haybale', 2], ['rock', 2], ['fence', 2]], bits: ['tuft', 'tuft', 'tuft', 'stump', 'rock']}
};
/* gameplay shape of each structure: half footprint (ground units), health, height of its top for numbers */
const SD = W.SD = {
  tent: {hw: 16, hh: 8, hp: 70, top: 36, spawner: true}, bigtent: {hw: 24, hh: 11, hp: 150, top: 46, spawner: true}, shack: {hw: 15, hh: 8, hp: 80, top: 46, spawner: true},
  house: {hw: 28, hh: 10, hp: null, top: 60}, hall: {hw: 40, hh: 12, hp: 900, top: 80}, keep: {hw: 46, hh: 13, hp: null, top: 110},
  tower: {hw: 9, hh: 5, hp: 130, top: 86, shoot: {range: 200, cd: 1.8, dmg: 9, arrow: true, h: 62, speed: 240}}, guntower: {hw: 10, hh: 6, hp: 180, top: 40, shoot: {range: 185, cd: 0.75, dmg: 8, h: 32, speed: 320}},
  barricade: {hw: 17, hh: 4, hp: 150, top: 24, low: true}, totem: {hw: 5, hh: 4, hp: 170, top: 72}, cage: {hw: 13, hh: 8, hp: 70, top: 38},
  chest: {hw: 7, hh: 4, hp: null, top: 12, use: 'chest'}, crate: {hw: 7, hh: 5, hp: 12, top: 14, team: 3, loot: 0.5}, barrel: {hw: 5, hh: 4, hp: 12, top: 16, team: 3, loot: 0.3},
  keg: {hw: 6, hh: 4, hp: 6, top: 18, team: 3, boom: [56, 60]}, campfire: {hw: 0, hh: 0, hp: null, top: 10, aura: [70, 5], nosolid: true}, wagon: {hw: 22, hh: 8, hp: null, top: 36},
  well: {hw: 9, hh: 6, hp: null, top: 30}, gatepost: {hw: 4, hh: 4, hp: null, top: 50}
};
const SOLIDR = {cactus: 2.6, rock: 0, boulder: 14, tree: 3.5, pine: 3, deadtree: 3, swamptree: 4, grave: 4, gallows: 0, lamp: 1.5, haybale: 8, fence: 0, bush: 0, reeds: 0, sign: 1.5, stump: 0, mushroom: 0, well: 8};

/* ================= collision ================= */
function bucketAdd(M, c) {
  const x0 = Math.floor((c.x - c.hw - 10) / BK), x1 = Math.floor((c.x + c.hw + 10) / BK), y0 = Math.floor((c.y - c.hh - 10) / BK), y1 = Math.floor((c.y + c.hh + 10) / BK);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = x + y * 1000; (M.buckets[k] || (M.buckets[k] = [])).push(c); }
}
W.rebuild = function (M) {
  M.buckets = {}; for (const c of M.cols) if (!c.gone) bucketAdd(M, c);
  const nx = M.nx = Math.ceil(M.W / NC), ny = M.ny = Math.ceil(M.H / NC), b = M.block = new Uint8Array(nx * ny);
  for (const c of M.cols) { if (c.gone || c.nonav) continue; const pad = 6;
    const x0 = Math.max(0, Math.floor((c.x - c.hw - pad) / NC)), x1 = Math.min(nx - 1, Math.floor((c.x + c.hw + pad) / NC)), y0 = Math.max(0, Math.floor((c.y - c.hh - pad) / NC)), y1 = Math.min(ny - 1, Math.floor((c.y + c.hh + pad) / NC));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const cx = x * NC + NC / 2, cy = y * NC + NC / 2; if (Math.abs(cx - c.x) <= c.hw + pad && Math.abs(cy - c.y) <= c.hh + pad) b[x + y * nx] = 1; } }
  M.navStamp = new Uint32Array(nx * ny); M.navG = new Float32Array(nx * ny); M.navFrom = new Int32Array(nx * ny); M.navN = 0;
};
W.resolve = function (M, u) {
  const cr = Math.min(u.r, 7) * 0.9;
  u.x = U.clamp(u.x, 8, M.W - 8); u.y = U.clamp(u.y, 8, M.H - 8);
  const list = M.buckets[Math.floor(u.x / BK) + Math.floor(u.y / BK) * 1000]; if (!list) return;
  for (const c of list) {
    if (c.gone) continue;
    const px = U.clamp(u.x, c.x - c.hw, c.x + c.hw), py = U.clamp(u.y, c.y - c.hh, c.y + c.hh), dx = u.x - px, dy = u.y - py, d2 = dx * dx + dy * dy;
    if (d2 >= cr * cr) continue;
    if (d2 > 0.0001) { const d = Math.sqrt(d2), k = (cr - d) / d; u.x += dx * k; u.y += dy * k; }
    else { const l = u.x - (c.x - c.hw), r = c.x + c.hw - u.x, t = u.y - (c.y - c.hh), b = c.y + c.hh - u.y, m = Math.min(l, r, t, b);
      if (m === l) u.x = c.x - c.hw - cr; else if (m === r) u.x = c.x + c.hw + cr; else if (m === t) u.y = c.y - c.hh - cr; else u.y = c.y + c.hh + cr; }
  }
};
W.shotBlocked = function (M, x, y) {
  if (x < -20 || y < -20 || x > M.W + 20 || y > M.H + 20) return true;
  const list = M.buckets[Math.floor(x / BK) + Math.floor(y / BK) * 1000]; if (!list) return false;
  for (const c of list) if (c.wall && !c.gone && !(c.s && c.s.hp != null) && Math.abs(x - c.x) < c.hw && Math.abs(y - c.y) < c.hh) return true;   // things with health take the hit instead
  return false;
};
const blocked = (M, x, y) => { const cx = Math.floor(x / NC), cy = Math.floor(y / NC); return cx < 0 || cy < 0 || cx >= M.nx || cy >= M.ny || M.block[cx + cy * M.nx] === 1; };
W.blocked = blocked;
W.los = function (M, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 6);
  for (let i = 1; i < n; i++) { const t = i / n; if (blocked(M, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
  return true;
};
/* A* on the nav grid; returns a list of ground points or null */
W.path = function (M, x0, y0, x1, y1) {
  const nx = M.nx, ny = M.ny, B = M.block; let sx = U.clamp(Math.floor(x0 / NC), 0, nx - 1), sy = U.clamp(Math.floor(y0 / NC), 0, ny - 1), gx = U.clamp(Math.floor(x1 / NC), 0, nx - 1), gy = U.clamp(Math.floor(y1 / NC), 0, ny - 1);
  const free = (cx, cy) => { for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < nx && y < ny && !B[x + y * nx]) return [x, y]; } return null; };
  if (B[gx + gy * nx]) { const f = free(gx, gy); if (!f) return null; gx = f[0]; gy = f[1]; }
  if (B[sx + sy * nx]) { const f = free(sx, sy); if (!f) return null; sx = f[0]; sy = f[1]; }
  const stamp = ++M.navN, St = M.navStamp, G = M.navG, From = M.navFrom, heap = [], hf = [];
  const push = (i, f) => { let n = heap.length; heap.push(i); hf.push(f); while (n > 0) { const p = (n - 1) >> 1; if (hf[p] <= f) break; heap[n] = heap[p]; hf[n] = hf[p]; n = p; } heap[n] = i; hf[n] = f; };
  const pop = () => { const top = heap[0], li = heap.pop(), lf = hf.pop(); let n = 0; const len = heap.length; if (len) { for (;;) { let c = n * 2 + 1; if (c >= len) break; if (c + 1 < len && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; heap[n] = heap[c]; hf[n] = hf[c]; n = c; } heap[n] = li; hf[n] = lf; } return top; };
  const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); };
  const s = sx + sy * nx, g = gx + gy * nx; St[s] = stamp; G[s] = 0; From[s] = -1; push(s, h(sx, sy));
  let it = 0, found = false;
  while (heap.length && it++ < 9000) {
    const cur = pop(); if (cur === g) { found = true; break; }
    const cx = cur % nx, cy = (cur - cx) / nx, cg = G[cur];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= nx || y >= ny) continue; const i = x + y * nx; if (B[i]) continue;
      if (dx && dy && (B[cx + dx + cy * nx] || B[cx + (cy + dy) * nx])) continue;
      const ng = cg + (dx && dy ? 1.414 : 1); if (St[i] === stamp && G[i] <= ng) continue; St[i] = stamp; G[i] = ng; From[i] = cur; push(i, ng + h(x, y));
    }
  }
  if (!found) return null;
  const out = []; for (let i = g; i !== -1 && i !== s; i = From[i]) out.push([(i % nx) * NC + NC / 2, Math.floor(i / nx) * NC + NC / 2]);
  out.reverse(); if (out.length) out[out.length - 1] = [U.clamp(x1, 4, M.W - 4), U.clamp(y1, 4, M.H - 4)];
  return out;
};

/* ================= structures ================= */
W.addStruct = function (M, kind, x, y, o) {
  const d = SD[kind] || {hw: 6, hh: 4, hp: null, top: 20};
  const s = Object.assign({id: sid++, isStruct: true, kind: kind, art: kind, x: x, y: y, hw: d.hw, hh: d.hh, r: Math.max(d.hw, d.hh) * 0.8, hp: d.hp, maxHp: d.hp, top: d.top, team: d.team != null ? d.team : 2, v: 0, pal: M.pal, low: d.low, hot: 0, t: Math.random() * 3, cd: 1}, o || {});
  if (s.hp != null && s.team === 1) { s.hp = s.maxHp = Math.round(s.hp * M.hpScale); }
  M.structs.push(s);
  if (!d.nosolid) { s.col = {x: x, y: y, hw: d.hw, hh: d.hh, s: s, wall: !d.low && d.hw > 6}; M.cols.push(s.col); if (M.ready) W.rebuild(M); }
  return s;
};
W.destroy = function (M, s, src) {
  if (s.gone) return; s.gone = true; s.hp = 0; if (s.col) { s.col.gone = true; W.rebuild(M); }
  const d = SD[s.kind] || {};
  for (let i = 0; i < 5; i++) M.fx.push({k: 'puff', x: s.x + (Math.random() - 0.5) * s.hw * 2, y: s.y + 1, h: Math.random() * (s.top || 20), t: -i * 0.03, T: 0.4, r: 8});
  M.fx.push({k: 'debris', x: s.x, y: s.y, t: 0, T: 0.6, r: Math.max(12, s.hw * 1.4), col: s.kind === 'keg' ? U.RED : A.C.wood}); CD.Sfx.play(s.hw > 12 ? 'boom' : 'hit');
  W.stain(M, s.x, s.y, Math.max(8, s.hw), '#7a6a58');
  if (d.boom) CD.Combat.boom(M, s.x, s.y, d.boom[0], d.boom[1], -1, src);
  if (d.loot && Math.random() < d.loot) M.pickups.push({k: Math.random() < 0.25 ? 'heart' : 'coin', x: s.x, y: s.y, v: Math.random() < 0.25 ? 25 : 3, t: 0, vz: 40, z: 4});
  if (s.kind === 'tent' || s.kind === 'bigtent' || s.kind === 'shack') { for (let i = 0; i < 6; i++) M.pickups.push({k: 'coin', x: s.x + (Math.random() - 0.5) * 30, y: s.y + 6 + Math.random() * 10, v: 2, t: 0, vz: 30 + Math.random() * 40, z: 8}); }
  if (s.onDeath) s.onDeath(M, s, src);
  if (M.onStruct) M.onStruct(s, src);
};
W.openChest = function (M, s) {
  if (s.v === 1) return; s.v = 1; CD.Sfx.play('coin');
  const n = 5 + Math.floor(Math.random() * 4) + M.tier; for (let i = 0; i < n; i++) M.pickups.push({k: 'coin', x: s.x + (Math.random() - 0.5) * 24, y: s.y + 8 + Math.random() * 8, v: 3, t: 0, vz: 40 + Math.random() * 40, z: 8});
  M.pickups.push({k: 'bag', x: s.x, y: s.y + 12, v: 15 + M.tier * 5, t: 0, vz: 50, z: 8});
};
function nearestHostile(M, s, range) { let best = null, bd = range; CD.Combat.each(M, s.team, t => { if (t.isStruct && (t.team === 3 || t.kind === 'barricade')) return; const d = Math.hypot(t.x - s.x, t.y - s.y); if (d < bd) { bd = d; best = t; } }); return best; }
W.updateStructs = function (M, dt) {
  const hero = M.hero;
  for (const s of M.structs) {
    if (s.gone) continue; if (s.hot > 0) s.hot -= dt; s.t += dt; const d = SD[s.kind] || {};
    if (d.shoot && s.team !== 2) {                            // towers
      s.cd -= dt; if (s.cd <= 0) { const t = nearestHostile(M, s, d.shoot.range); if (t) { s.cd = d.shoot.cd; const a = Math.atan2(t.y - s.y, t.x - s.x), sp = d.shoot.speed;
        M.shots.push({x: s.x, y: s.y, h: d.shoot.h, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: d.shoot.range / sp + 0.1, dmg: d.shoot.dmg * (s.team === 1 ? M.dmgScale : 1 + 0.25 * (M.perk.smithy || 0)), team: s.team, src: s, arrow: d.shoot.arrow, push: 20, drop: d.shoot.h / (Math.hypot(t.x - s.x, t.y - s.y) / sp + 0.01)});
        if (!d.shoot.arrow) M.fx.push({k: 'flash', x: s.x, y: s.y + 0.5, h: d.shoot.h, a: a, t: 0, T: 0.08, r: 5}); if (CD.Combat.onScreen(M, s)) CD.Sfx.play(d.shoot.arrow ? 'bow' : 'shot'); } else s.cd = 0.3; }
    }
    if (d.aura) { s.cd -= dt; if (s.cd <= 0) { s.cd = 1; for (const u of M.units) if (u.team === 0 && !u.dead && u.hp < u.maxHp && Math.hypot(u.x - s.x, u.y - s.y) < d.aura[0]) CD.Combat.heal(M, u, d.aura[1]); } }
    if (s.kind === 'keg' && s.armed) { for (const u of M.units) if (u.team === 1 && !u.dead && Math.hypot(u.x - s.x, u.y - s.y) < 20) { W.destroy(M, s, hero); break; } }
    if (s.spawn && s.team === 1 && hero && !hero.dead) {         // spawner tents wake when the hero is near or the camp is alarmed
      const sp = s.spawn, near = Math.hypot(hero.x - s.x, hero.y - s.y) < sp.wake || M.alarm;
      if (near) { sp.t -= dt; sp.kids = sp.kids.filter(k => !k.dead); if (sp.t <= 0 && sp.left > 0 && sp.kids.length < sp.cap && M.enemyCount() < 46) { sp.t = sp.every; sp.left--; const id = U.pick(sp.pool, M.rng), n = E.spawn(M, id, 1, s.x + (M.rng() - 0.5) * 10, s.y + s.hh + 8); n.ai.hate = hero; n.ai.alert = true; sp.kids.push(n);
        M.fx.push({k: 'puff', x: n.x, y: n.y, h: 8, t: 0, T: 0.3, r: 7}); } }
    }
  }
};

/* ================= ground art ================= */
W.decal = function (M, fn) { const c = M.bgc; c.setTransform(M.bgS, 0, 0, M.bgS, 0, 0); fn(c); };
W.stain = function (M, x, y, r, col) { W.decal(M, c => { const rng = U.rng32((x * 31 + y * 17) | 0); c.globalAlpha = 0.5; U.poly(c, U.ngon(x, y * U.YS, r, 9, rng() * 3, 0.5).map(p => [p[0] + (rng() - 0.5) * r * 0.5, p[1] + (rng() - 0.5) * r * 0.25]), col || U.INKC); c.globalAlpha = 1;
  for (let i = 0; i < 5; i++) { const a = rng() * 6.28, d = r * (0.9 + rng() * 0.7); U.ell(c, x + Math.cos(a) * d, y * U.YS + Math.sin(a) * d * 0.5, 0.6 + rng() * 1.2, 0.4 + rng() * 0.6, col || U.INKC); } }); };
W.scorch = function (M, x, y, r) { W.stain(M, x, y, r, '#2a2228'); };
function paintGround(M, rng, roads) {
  const B = M.B, sc = M.bgS = Math.min(S.scale, M.spec.bgS || 2, Math.sqrt((M.spec.bgS ? 3e7 : 7e6) / (M.W * M.H * U.YS))), cv = M.bg = document.createElement('canvas'); cv.width = Math.ceil(M.W * sc); cv.height = Math.ceil(M.H * U.YS * sc);
  const c = M.bgc = cv.getContext('2d'); c.setTransform(sc, 0, 0, sc, 0, 0); const Wd = M.W, Hd = M.H * U.YS;
  c.fillStyle = B.ground; c.fillRect(0, 0, Wd, Hd);
  for (let i = 0; i < 46; i++) {                              // soft patches of darker and lighter ground
    const x = rng() * Wd, y = rng() * Hd, r = 30 + rng() * 70, col = i % 3 ? B.patch : B.lite; c.globalAlpha = 0.55;
    U.poly(c, U.ngon(x, y, r, 11, rng() * 3, 0.5).map(p => [p[0] + (rng() - 0.5) * r * 0.5, p[1] + (rng() - 0.5) * r * 0.22]), col); c.globalAlpha = 1;
  }
  if (B.water) for (let i = 0; i < 9; i++) {                 // swamp pools: flat water with an ink lip on the near edge
    const x = 80 + rng() * (Wd - 160), y = 40 + rng() * (Hd - 80), r = 22 + rng() * 34; if (M.clear.some(z => Math.hypot(z[0] - x, z[1] * U.YS - y) < z[2] + r)) continue;
    const p = U.ngon(x, y, r, 12, rng() * 3, 0.42).map(q => [q[0] + (rng() - 0.5) * r * 0.4, q[1] + (rng() - 0.5) * r * 0.14]); U.poly(c, p, B.water, 0.8);
    for (let k = 0; k < 4; k++) { const yy = y - r * 0.2 + k * r * 0.14, w = r * (0.2 + rng() * 0.3), xx = x + (rng() - 0.5) * r; U.seg(c, xx - w, yy, xx + w, yy + 0.3, 0.5, '#c9d6c2'); }
    M.pools.push([x, y / U.YS, r * 0.8]);
  }
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const rd of roads) {                                   // worn trails
    c.beginPath(); rd.forEach((p, i) => i ? c.lineTo(p[0], p[1] * U.YS) : c.moveTo(p[0], p[1] * U.YS)); c.strokeStyle = B.trail; c.lineWidth = 20; c.globalAlpha = 0.85; c.stroke(); c.globalAlpha = 1;
    for (let i = 0; i < rd.length - 1; i++) { const a = rd[i], b = rd[i + 1], n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14); for (let k = 0; k < n; k++) { const t = (k + rng()) / n, x = a[0] + (b[0] - a[0]) * t + (rng() - 0.5) * 16, y = (a[1] + (b[1] - a[1]) * t) * U.YS + (rng() - 0.5) * 9; U.seg(c, x, y, x + 2 + rng() * 5, y + (rng() - 0.5) * 0.8, 0.5, k % 5 ? B.tick : U.INKC); } }
  }
  const n = Math.round(Wd * Hd / 420);
  for (let i = 0; i < n; i++) { const x = rng() * Wd, y = rng() * Hd, w = 1.5 + rng() * 4; U.seg(c, x, y, x + w, y + (rng() - 0.5) * 0.6, i % 7 ? 0.5 : 0.7, i % 7 ? B.tick : U.INKC); }   // ground ticks, as in the lab arena
  for (let i = 0; i < Math.round(M.W * M.H / 5200); i++) {    // small flat bits are painted straight into the ground
    const x = 12 + rng() * (M.W - 24), y = 12 + rng() * (M.H - 24), kd = U.pick(B.bits, rng); if (M.clear.some(z => z[3] && Math.hypot(z[0] - x, z[1] - y) < z[2])) continue;
    const sp = A.get(kd, Math.floor(rng() * 4)); c.drawImage(sp.cv, x + sp.ox, y * U.YS + sp.oy, sp.w, sp.h);
  }
}

/* ================= generation ================= */
function prop(M, kind, x, y, v, pal) {
  const p = {kind: kind, x: x, y: y, v: v || 0, pal: pal}; M.props.push(p);
  const r = SOLIDR[kind]; if (r) M.cols.push({x: x, y: y, hw: r, hh: r * 0.7});
  return p;
}
function wall(M, x0, y0, x1, y1, kind, rng) {                // straight run of stakes or stone blocks with one collider
  const len = Math.hypot(x1 - x0, y1 - y0), horiz = Math.abs(x1 - x0) >= Math.abs(y1 - y0), step = kind === 'log' ? (horiz ? 7.4 : 6) : (horiz ? 17 : 9), n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) { const t = i / n; M.props.push({kind: kind, x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, v: Math.floor(rng() * 6), pal: M.pal}); }
  M.cols.push({x: (x0 + x1) / 2, y: (y0 + y1) / 2, hw: horiz ? len / 2 + 3 : 4, hh: horiz ? 3 : len / 2 + 3, wall: true});
}
/* rectangular enclosure with gates: g = {w: yOffset|null, s: xOffset|null} (gap centre offsets), gap width 52 */
function enclosure(M, cx, cy, hw, hh, gates, kind, rng) {
  const GAP = 26, x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
  wall(M, x0, y0, x1, y0, kind, rng); wall(M, x1, y0, x1, y1, kind, rng);
  const split = (ax, ay, bx, by, at, horiz) => {
    if (at == null) return wall(M, ax, ay, bx, by, kind, rng);
    const g = horiz ? cx + at : cy + at;
    if (horiz) { wall(M, ax, ay, g - GAP, by, kind, rng); wall(M, g + GAP, ay, bx, by, kind, rng); for (const s of [-1, 1]) W.addStruct(M, 'gatepost', g + s * (GAP + 2), ay, {}); M.gates.push([g, ay + 20]); }
    else { wall(M, ax, ay, bx, g - GAP, kind, rng); wall(M, ax, g + GAP, bx, by, kind, rng); for (const s of [-1, 1]) W.addStruct(M, 'gatepost', ax, g + s * (GAP + 2), {}); M.gates.push([ax - 20, g]); }
  };
  split(x0, y1, x1, y1, gates.s, true); split(x0, y0, x0, y1, gates.w, false);
}
function roster(M, kind) {                                    // pick an enemy id for this tier
  const F = M.F, t = M.tier, r = M.rng();
  if (kind === 'elite') return U.pick(F.elite, M.rng);
  if (kind === 'heavy') return U.pick(F.heavy, M.rng);
  if (t <= 1) return U.pick(F.grunts, M.rng);
  if (t === 2) return r < 0.7 ? U.pick(F.grunts, M.rng) : U.pick(F.mid, M.rng);
  if (t === 3) return r < 0.5 ? U.pick(F.grunts, M.rng) : r < 0.88 ? U.pick(F.mid, M.rng) : U.pick(F.heavy, M.rng);
  return r < 0.38 ? U.pick(F.grunts, M.rng) : r < 0.78 ? U.pick(F.mid, M.rng) : U.pick(F.heavy, M.rng);
}
W.roster = roster;
function group(M, x, y, n, o) { const out = []; for (let i = 0; i < n; i++) { const a = M.rng() * 6.28, d = 8 + M.rng() * 26, u = E.spawn(M, (o && o.ids) ? U.pick(o.ids, M.rng) : roster(M, o && o.kind), 1, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, o && o.set); u.ai.home = [x, y]; out.push(u); } return out; }
W.group = group;
function spawnerTent(M, x, y, big) {
  const kind = M.spec.faction === 'corsair' ? (big ? 'bigtent' : 'shack') : big ? 'bigtent' : 'tent';
  const s = W.addStruct(M, kind, x, y, {team: 1, v: Math.floor(M.rng() * 4)}); s.spawn = {every: Math.max(4.5, 9 - M.tier * 0.7) * (big ? 0.8 : 1), t: 2 + M.rng() * 3, cap: big ? 4 : 3, left: (big ? 7 : 5) + M.tier, kids: [], wake: 230, pool: M.tier >= 3 ? M.F.grunts.concat(M.F.mid) : M.F.grunts};
  M.tents.push(s); return s;
}
function outpost(M, x, y, n) {
  const r = M.rng(); if (r < 0.45) spawnerTent(M, x, y - 14, false); else if (r < 0.75 && M.tier >= 2) W.addStruct(M, 'tower', x - 26, y - 10, {team: 1, v: M.rng() < 0.5 ? 1 : 0});
  group(M, x, y + 14, n);
  for (let i = 0; i < 3; i++) W.addStruct(M, U.pick(['crate', 'crate', 'barrel', 'keg'], M.rng), x + 24 + i * 13 + (M.rng() - 0.5) * 4, y - 6 + (M.rng() - 0.5) * 16, {v: Math.floor(M.rng() * 4)});
  if (M.rng() < 0.7) chest(M, x - 6, y - 2);
  M.clear.push([x, y, 60, 1]);
}
function chest(M, x, y) {
  const mimicChance = M.spec.faction === 'corsair' ? 0.3 : 0.12;
  if (M.tier >= 2 && M.rng() < mimicChance) { const u = E.spawn(M, 'chomp', 1, x, y); u.dormant = true; u.dir = 'S'; return u; }
  return W.addStruct(M, 'chest', x, y, {});
}
function stake(M, x, y) { M.stakes.push({x: x, y: y, built: null}); M.clear.push([x, y, 26, 1]); }
function camp(M, cx, cy, hw, hh, o) {
  const kind = M.spec.type === 'boss' && M.spec.faction === 'crown' ? 'stonewall' : M.spec.type === 'boss' ? 'log' : 'log';
  M.clear.push([cx, cy, Math.max(hw, hh) + 40, 1]); enclosure(M, cx, cy, hw, hh, {w: o.gw == null ? 0 : o.gw, s: o.gs}, kind, M.rng);
  const tp = [[-hw + 46, -hh + 34], [hw - 50, -hh + 34], [-hw + 60, hh - 30], [hw - 46, hh - 34], [0, -hh + 30]];
  for (let i = 0; i < o.tents; i++) spawnerTent(M, cx + tp[i][0], cy + tp[i][1], i === 4 || (o.big && i === 1));
  if (M.tier >= 2) W.addStruct(M, 'tower', cx - hw + 22, cy - 48 + (o.gw || 0), {team: 1});
  if (M.tier >= 4) W.addStruct(M, 'tower', cx - hw + 22, cy + 48 + (o.gw || 0), {team: 1, v: 1});
  group(M, cx - hw + 60, cy + (o.gw || 0), 2 + Math.ceil(M.tier / 2));
  group(M, cx + 10, cy + 20, 2 + M.tier);
  for (let i = 0; i < 5; i++) W.addStruct(M, U.pick(['crate', 'barrel', 'crate', 'keg'], M.rng), cx + hw - 20 - (i % 3) * 13, cy - 10 + Math.floor(i / 3) * 14 + (M.rng() - 0.5) * 6, {v: Math.floor(M.rng() * 4)});
  chest(M, cx + hw - 30, cy + hh - 24); if (M.tier >= 3) chest(M, cx - 20, cy - hh + 26);
}
function scatter(M, rng, density) {
  const B = M.B, tot = B.props.reduce((a, p) => a + p[1], 0), n = Math.round(M.W * M.H / 9000 * density);
  for (let i = 0; i < n; i++) {
    const x = 16 + rng() * (M.W - 32), y = 16 + rng() * (M.H - 32); if (M.clear.some(z => Math.hypot(z[0] - x, z[1] - y) < z[2])) continue;
    if (M.pools.some(z => Math.hypot(z[0] - x, z[1] - y) < z[2])) { if (B.water && rng() < 0.6) prop(M, 'reeds', x, y, Math.floor(rng() * 4)); continue; }
    let r = rng() * tot, kd = B.props[0][0]; for (const p of B.props) { r -= p[1]; if (r <= 0) { kd = p[0]; break; } }
    prop(M, kd, x, y, Math.floor(rng() * 4), M.pal);
  }
  for (let i = 0; i < 26; i++) {                              // a ragged border of big props so the map edge reads as wild country
    const side = i % 4, t = rng(), x = side === 0 ? t * M.W : side === 1 ? t * M.W : side === 2 ? 6 + rng() * 14 : M.W - 6 - rng() * 14, y = side === 0 ? 6 + rng() * 12 : side === 1 ? M.H - 4 - rng() * 10 : t * M.H, t2 = t * M.H;
    if (M.clear.some(z => Math.hypot(z[0] - x, z[1] - y) < z[2] * 0.6)) continue; prop(M, U.pick(B.props, rng)[0], x, side < 2 ? y : t2, Math.floor(rng() * 4), M.pal);
  }
}

W.build = function (M, spec) {
  const rng = M.rng = U.rng32(spec.seed || 1); M.spec = spec; M.tier = spec.tier || 1; M.F = D.factions[spec.faction]; M.pal = spec.faction; M.biomeId = spec.biome || M.F.biome; M.B = W.BIOME[M.biomeId];
  M.hpScale = 1 + (M.tier - 1) * 0.16; M.dmgScale = 1 + (M.tier - 1) * 0.1;
  Object.assign(M, {units: [], shots: [], fx: [], nums: [], structs: [], props: [], pickups: [], stakes: [], zones: [], cols: [], clear: [], pools: [], gates: [], tents: [], waves: null, ready: false, alarm: false});
  const T = spec.type, big = T === 'boss';
  M.W = T === 'defend' ? 820 : big ? 1080 : 1000; M.H = T === 'defend' ? 640 : big ? 700 : 640;
  const cy = M.H / 2, start = M.start = T === 'defend' ? [M.W / 2, cy + 40] : [70, cy + (rng() - 0.5) * 120];
  M.clear.push([start[0], start[1], 70, 1]);
  const roads = [];
  if (T === 'defend') {
    const hx = M.W / 2, hy = cy - 30; M.hall = W.addStruct(M, 'hall', hx, hy, {team: 0, pal: 'outlaw'}); M.clear.push([hx, cy, 190, 1]);
    const spots = [[-150, -50], [150, -60], [-170, 70], [170, 80], [-60, 120], [70, 130]]; spots.forEach((p, i) => { W.addStruct(M, i === 4 ? 'well' : 'house', hx + p[0], hy + p[1], {v: i, pal: 'outlaw'}); });
    for (let i = 0; i < 3; i++) prop(M, 'fence', hx - 60 + i * 28, hy + 190, 0); for (let i = 0; i < 2; i++) prop(M, 'haybale', hx + 110 + i * 20, hy + 150, i);
    const tw = [[-100, 30], [100, 30], [0, 150], [-190, 150], [190, 150]]; for (let i = 0; i < Math.min(tw.length, M.perk.tower || 0); i++) W.addStruct(M, 'guntower', hx + tw[i][0], hy + tw[i][1], {team: 0, pal: 'outlaw'});
    [[-120, 100], [120, 100], [0, 190], [-210, 10], [210, 10], [0, -90]].forEach(p => stake(M, hx + p[0], hy + p[1]));
    M.edges = [[30, cy], [M.W - 30, cy], [M.W / 2, M.H - 24], [M.W / 2, 24], [60, 60], [M.W - 60, M.H - 60]];
    for (const e of M.edges) { roads.push([e, [hx, hy + 30]]); M.clear.push([e[0], e[1], 50, 1]); }
    for (let i = 0; i < 2 + (M.perk.tower ? 1 : 0); i++) E.spawn(M, i % 2 ? 'rifleman' : 'militia', 0, hx - 40 + i * 40, hy + 50, {militia: true});
    E.spawn(M, 'biscuit', 0, hx + 30, hy + 70);
  } else {
    const ccx = M.W - (big ? 290 : 220), hw = big ? 200 : T === 'raid' ? 140 : 118, hh = big ? 150 : T === 'raid' ? 108 : 92, gw = Math.round((rng() - 0.5) * 60);
    M.campAt = [ccx, cy, hw, hh];
    const o1 = [300 + rng() * 60, cy + (rng() < 0.5 ? -1 : 1) * (90 + rng() * 90)], o2 = [540 + rng() * 60, cy + (o1[1] < cy ? 1 : -1) * (80 + rng() * 100)];
    roads.push([start, [200, cy + (start[1] - cy) * 0.5], [ccx - hw - 70, cy + gw], [ccx - hw + 10, cy + gw]]); roads.push([[200, cy], o1]); roads.push([[420, cy + gw * 0.5], o2]);
    for (const r of roads) for (let i = 0; i < r.length - 1; i++) { const n = Math.ceil(Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]) / 40); for (let k = 0; k <= n; k++) M.clear.push([r[i][0] + (r[i + 1][0] - r[i][0]) * k / n, r[i][1] + (r[i + 1][1] - r[i][1]) * k / n, 26, 0]); }
    camp(M, ccx, cy, hw, hh, {gw: gw, gs: T === 'raid' || big ? -30 : null, tents: T === 'raid' ? Math.min(4, 2 + Math.floor(M.tier / 2)) : big ? 3 : T === 'rescue' ? 2 : 2, big: M.tier >= 3});
    outpost(M, o1[0], o1[1], 2 + Math.ceil(M.tier / 2)); if (M.tier >= 2 || T !== 'raid') outpost(M, o2[0], o2[1], 3 + Math.ceil(M.tier / 2));
    if (spec.prisoner) {                                      // a caged outlaw: the whole point of a rescue, a bonus anywhere else
      const at = T === 'rescue' ? [ccx + 20, cy - 10] : [ccx - 36, cy + hh - 46]; M.cage = W.addStruct(M, 'cage', at[0], at[1], {team: 1});
      const p = E.spawn(M, spec.prisoner, 0, at[0], at[1] - 2, {caged: true, dir: 'S'}); p.prisoner = true; M.prisoner = p;
    }
    stake(M, 170, cy - 46); stake(M, 430, cy + gw * 0.5 + 44); stake(M, ccx - hw - 56, cy + gw - 50); stake(M, ccx - hw - 56, cy + gw + 50);
    if (T === 'raid') {
      M.totem = W.addStruct(M, 'totem', ccx + 54, cy - 6, {team: 1, lock: m => m.tents.some(t => !t.gone && t.inCamp)}); M.tents.forEach(t => { if (Math.abs(t.x - ccx) < hw && Math.abs(t.y - cy) < hh) t.inCamp = true; });
      const chief = E.spawn(M, roster(M, M.tier >= 2 ? 'elite' : 'heavy'), 1, ccx + 30, cy + 14); chief.elite = true; chief.ai.home = [ccx + 30, cy + 14]; M.chief = chief;
    } else if (T === 'rescue') {
      group(M, ccx + 20, cy + 30, 2, {kind: M.tier >= 3 ? 'heavy' : null});
    } else if (T === 'heist') {
      M.boxes = []; [[-hw + 40, -hh + 60], [hw - 40, 0], [-10, hh - 30]].forEach(p => { const b = {k: 'box', x: ccx + p[0], y: cy + p[1], v: 1, t: 0, z: 0, vz: 0, fixed: true}; M.pickups.push(b); M.boxes.push(b); });
      const near = o => M.boxes.some(b => Math.hypot(b.x - o.x, b.y - o.y) < 30) && !(SD[o.kind] || {}).spawner && o.kind !== 'tower';   // keep every strongbox reachable
      M.structs = M.structs.filter(o => !near(o)); M.cols = M.cols.filter(c => !(c.s && near(c.s)));
      M.wagon = W.addStruct(M, 'wagon', start[0] + 6, start[1] - 40, {pal: 'outlaw'}); group(M, ccx, cy, 2, {kind: 'heavy'});
    } else if (big) {
      W.addStruct(M, 'keep', ccx + 60, cy - hh + 40, {}); const b = E.spawn(M, spec.boss || M.F.boss, 1, ccx + 60, cy - 20); b.ai.home = [ccx + 60, cy - 20]; b.ai.asleep = true; M.boss = b; M.bosses = [b];
      if (spec.faction === 'crown') { const t = E.spawn(M, 'tyrant', 1, ccx - 40, cy + 50); t.ai.home = [ccx - 40, cy + 50]; t.ai.asleep = true; M.bosses.push(t); }
      if (spec.faction === 'hollow') for (let i = 0; i < 2; i++) { const t = E.spawn(M, 'oak', 1, ccx - 30 + i * 150, cy + 70); t.ai.home = [t.x, t.y]; }
      if (spec.faction === 'corsair') for (let i = 0; i < 2; i++) { const t = E.spawn(M, 'gila', 1, ccx - 60 + i * 160, cy + 60); t.ai.home = [t.x, t.y]; }
      group(M, ccx - 40, cy - 60, 3, {kind: 'heavy'}); group(M, ccx + 120, cy + 60, 2, {kind: 'elite'});
    }
  }
  paintGround(M, rng, roads);
  scatter(M, rng, T === 'defend' ? 0.8 : 1.15);
  M.ready = true; W.rebuild(M);
  for (const u of M.units) W.resolve(M, u);
};
})();
