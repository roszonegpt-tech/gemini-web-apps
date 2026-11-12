/* Crown of Dust - shared helpers (src/core/util.js). Everything hangs off window.CD; files are classic scripts so the game runs from file:// too. */
(function () {
'use strict';
const CD = window.CD = window.CD || {};
const U = CD.U = {};
CD.VERSION = '0.1.0'; CD.scenes = {};

U.YS = 0.72;                                   // ground depth -> screen y (same foreshortening the lab arena walks with)
U.INKC = '#161214'; U.MUST = '#d9a520'; U.RED = '#a8474a'; U.PAPER = '#e9e2d0'; U.PAPER2 = '#ddd3ba'; U.PAPER3 = '#cfc3a4'; U.DIM = '#5b5048';
U.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
U.lerp = (a, b, t) => a + (b - a) * t;
U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
U.copy = o => JSON.parse(JSON.stringify(o));
U.DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const R2 = Math.SQRT1_2;
U.DVEC = {S: [0, 1], SE: [R2, R2], E: [1, 0], NE: [R2, -R2], N: [0, -1], NW: [-R2, -R2], W: [-1, 0], SW: [-R2, R2]};
U.dirOf = (x, y) => ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8];
U.angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
U.rng32 = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
U.hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
U.pick = (a, r) => a[Math.floor((r || Math.random)() * a.length)];
U.shuffle = (a, r) => { r = r || Math.random; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
U.COARSE = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || 'ontouchstart' in window;

/* DOM */
U.$ = id => document.getElementById(id);
U.mk = (tag, cls, txt, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
U.clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
U.btn = (txt, cls, fn, parent) => { const b = U.mk('button', 'b' + (cls ? ' ' + cls : ''), txt, parent); b.type = 'button'; b.onclick = e => { if (CD.Sfx) CD.Sfx.play('click'); fn(e); }; return b; };

/* plain canvas helpers in the lab's own prop style: flat fill, ink edge, round-capped strokes */
U.poly = (c, pts, fill, lw, col) => {
  c.beginPath(); for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.lineWidth = lw; c.strokeStyle = col || U.INKC; c.lineJoin = 'miter'; c.stroke(); }
};
U.seg = (c, x0, y0, x1, y1, lw, col) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = lw; c.strokeStyle = col || U.INKC; c.lineCap = 'round'; c.stroke(); };
U.ngon = (cx, cy, r, n, rot, sy) => { const p = []; for (let i = 0; i < n; i++) { const a = (rot || 0) + i / n * Math.PI * 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * (sy == null ? 1 : sy)]); } return p; };
U.ell = (c, x, y, rx, ry, fill, lw, col) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); if (fill) { c.fillStyle = fill; c.fill(); } if (lw) { c.lineWidth = lw; c.strokeStyle = col || U.INKC; c.stroke(); } };
U.text = (c, s, x, y, px, fill, opt) => {
  opt = opt || {}; c.font = (opt.w || 700) + ' ' + px + 'px ' + (opt.font || 'Georgia,serif'); c.textAlign = opt.align || 'center'; c.textBaseline = opt.base || 'alphabetic'; c.lineJoin = 'round';
  if (opt.stroke !== 0) { c.lineWidth = opt.stroke || px * 0.26; c.strokeStyle = opt.sc || U.INKC; c.strokeText(s, x, y); }
  c.fillStyle = fill || U.PAPER; c.fillText(s, x, y);
};
})();
