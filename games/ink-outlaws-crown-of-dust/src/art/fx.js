/* Crown of Dust - effects (src/art/fx.js). Muzzle flash, hit puff and bullets are the lab arena's own; the rest follow the same ink-and-mustard rules. */
(function () {
'use strict';
const CD = window.CD, U = CD.U, YS = U.YS;
const F = CD.Fx = {};
const INKC = U.INKC, MUST = U.MUST;

F.shot = function (c, b) {
  const m = Math.hypot(b.vx, b.vy), ux = b.vx / m, uy = b.vy / m * YS, x = b.x, y = b.y * YS - b.h;
  if (b.orb) { U.poly(c, U.ngon(x, y, 3.6, 7, b.life * 9), b.orb, 0.9); U.poly(c, U.ngon(x, y, 1.6, 5, -b.life * 7), '#fffbe6', 0); U.seg(c, x - ux * 7, y - uy * 7, x - ux * 3, y - uy * 3, 1.2, b.orb); }
  else if (b.arrow) { U.seg(c, x - ux * 9, y - uy * 9, x, y, 0.9); U.seg(c, x - ux * 9, y - uy * 9, x - ux * 6.5, y - uy * 6.5, 1.8, U.RED); U.seg(c, x - ux * 1.5, y - uy * 1.5, x + ux * 0.8, y + uy * 0.8, 1.6); }
  else { U.seg(c, x - ux * 8, y - uy * 8, x, y, 1.3); U.seg(c, x - ux * 4, y - uy * 4, x, y, 0.55, '#ffd84a'); }
};
F.draw = function (c, e) {
  if (e.t < 0) return; const u = e.t / e.T, x = e.x, y = e.y * YS - (e.h || 0);
  switch (e.k) {
    case 'flash': { c.save(); c.translate(x, y); c.rotate(Math.atan2(Math.sin(e.a) * YS, Math.cos(e.a))); const p = [], n = 9;
      for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = (i % 2 ? 0.42 : 1) * e.r * (0.8 + ((i * 7) % 5) * 0.08); p.push([e.r * 0.55 + Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.8]); }
      U.poly(c, p, u < 0.5 ? '#ffd84a' : MUST, 0.9); U.poly(c, p.map(q => [e.r * 0.4 + (q[0] - e.r * 0.55) * 0.45, q[1] * 0.45]), '#fffbe6', 0); c.restore(); break; }
    case 'puff': { c.globalAlpha = 1 - u; const r = e.r * (0.5 + u);
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + e.x; U.seg(c, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, x + Math.cos(a) * r, y + Math.sin(a) * r, 0.8); } c.globalAlpha = 1; break; }
    case 'dust': { c.globalAlpha = 0.5 * (1 - u); U.ell(c, x, y - u * 4, e.r * (0.6 + u), e.r * 0.5 * (0.6 + u), '#bfae85', 0.5); c.globalAlpha = 1; break; }
    case 'slash': {                                          // a swept crescent in the plane of the ground, lifted to hand height
      const n = 9, o = [], inn = [], a0 = e.a - e.arc * (1 - u * 0.2), a1 = e.a + e.arc; c.globalAlpha = 1 - u * u;
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, w = Math.sin(Math.PI * i / n); o.push([x + Math.cos(a) * e.r, y + Math.sin(a) * e.r * YS]); inn.push([x + Math.cos(a) * e.r * (1 - 0.34 * w), y + Math.sin(a) * e.r * (1 - 0.34 * w) * YS]); }
      U.poly(c, o.concat(inn.reverse()), '#fffbe6', 0.7); c.globalAlpha = 1; break; }
    case 'boom': { const r = e.r * (0.35 + 0.75 * Math.sqrt(u)), p = [], n = 11; c.globalAlpha = u < 0.5 ? 1 : 2 - u * 2;
      for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * 6.283 + e.x, rr = (i % 2 ? 0.6 : 1) * r * (0.85 + ((i * 5) % 7) * 0.04); p.push([x + Math.cos(a) * rr, y - r * 0.25 + Math.sin(a) * rr * 0.75]); }
      U.poly(c, p, u < 0.3 ? '#fffbe6' : u < 0.6 ? '#ffd84a' : U.RED, 1.2); U.poly(c, p.map(q => [x + (q[0] - x) * 0.5, y - r * 0.25 + (q[1] - y + r * 0.25) * 0.5]), u < 0.3 ? '#ffd84a' : '#fffbe6', 0);
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + 0.3; U.seg(c, x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 0.7, x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 0.86, 1); } c.globalAlpha = 1; break; }
    case 'ring': { c.globalAlpha = 1 - u; const r = e.r * (0.3 + 0.7 * u); c.beginPath(); c.ellipse(x, y, r, r * YS, 0, 0, 7); c.lineWidth = 2.2 * (1 - u) + 0.6; c.strokeStyle = INKC; c.stroke(); c.lineWidth = 1.1 * (1 - u) + 0.3; c.strokeStyle = e.col || '#fffbe6'; c.stroke(); c.globalAlpha = 1; break; }
    case 'heal': { c.globalAlpha = 1 - u; for (let i = 0; i < 3; i++) { const px = x - 6 + i * 6, py = y - 14 - u * 18 - i * 5; U.seg(c, px - 1.6, py, px + 1.6, py, 1.2, '#9fe07a'); U.seg(c, px, py - 1.6, px, py + 1.6, 1.2, '#9fe07a'); } c.globalAlpha = 1; break; }
    case 'tele': { c.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(e.t * 20)); const ex = x + Math.cos(e.a) * e.r, ey = y + Math.sin(e.a) * e.r * YS; c.setLineDash([4, 3]); U.seg(c, x, y, ex, ey, 2.2, U.RED); c.setLineDash([]); c.globalAlpha = 1; break; }
    case 'debris': { c.globalAlpha = 1 - u; for (let i = 0; i < 7; i++) { const a = i * 0.9 + e.x, d = e.r * u * (0.6 + (i % 3) * 0.3), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.5 - Math.sin(u * 3.14) * (10 + i * 3); U.poly(c, U.ngon(px, py, 2 + (i % 2), 4, a + u * 6), i % 2 ? e.col : '#6b5442', 0.5); } c.globalAlpha = 1; break; }
  }
};
F.zone = function (c, z) {                                 // telegraphed blast: an inked ring that fills as the fuse burns
  const u = z.t / z.T, x = z.x, y = z.y * YS; c.globalAlpha = 0.22 + 0.2 * u; U.ell(c, x, y, z.r * u, z.r * u * YS, z.col || U.RED); c.globalAlpha = 1;
  c.setLineDash([3, 2.4]); U.ell(c, x, y, z.r, z.r * YS, null, 1.1, U.RED); c.setLineDash([]);
};
F.num = function (c, n) {
  const y = n.y * YS - n.h - n.t * 16; c.globalAlpha = U.clamp(2.2 - n.t * 2.75, 0, 1);
  U.text(c, n.txt, n.x, y, n.big ? 9 : 7, n.col || (n.big ? '#ffd84a' : U.PAPER), {stroke: 1.8}); c.globalAlpha = 1;
};
F.flame = function (c, x, y, t, s) {                        // campfire tongue
  s = s || 1; const w = (Math.sin(t * 11) * 0.8 + Math.sin(t * 17) * 0.5), p = [[x - 4 * s, y - 1], [x - 2.6 * s + w * 0.3, y - 7 * s], [x + w, y - (13 + Math.sin(t * 13) * 2) * s], [x + 2.8 * s + w * 0.3, y - 6 * s], [x + 4 * s, y - 1]];
  U.poly(c, p, '#e8b93a', 0.9); U.poly(c, p.map(q => [x + (q[0] - x) * 0.5, y - 1 + (q[1] - y + 1) * 0.55]), '#fff6d8', 0);
};
})();
