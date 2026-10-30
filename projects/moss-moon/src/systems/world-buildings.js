'use strict';
// Moss & Moon — exterior building painter (owner: WORLD). Loaded after world-render.js (it registers itself on MM.world).
// Paints an isometric building pixel-by-pixel in face space (same approach as art/buildings.px.js) from a spec, so any
// footprint / door / window layout from MM.BUILDINGS renders at the true player-relative scale with foundation trim,
// framed doors + windows, steps/porch/awning, roof edges/materials, chimney, moss/weathering and shutters when locked.
// Result: { c, w, h, ax, ay, doors:[{x,y,w,h}], windows:[{x,y,w,h,lit}], chimney:{x,y} } (sprite-space; anchor = front ground corner).
//
// spec (px unless noted):
//   fw, fd          footprint in tiles along x (left/SW face) and y (right/SE face)
//   wh, rh          wall height, roof rise above the walls
//   ridge           'x' (ridge parallel to the left face; gable on the right face) | 'y'
//   wall            'plaster' | 'plank' | 'stone' | 'log' ; roof 'shingle' | 'thatch' | 'slate' ; colors {wall, wall2, trim, roof, roof2, door}
//   door            {face:'L'|'R', at: px from the front corner along that face (door centre), w, h, arch:true}
//   windows         [{face, at, z, w, h}]   (z = sill height)
//   foundation      px of stone base trim (default 5) ; steps (count) ; porch {depth, posts:true} ; awning {stripes:[c1,c2]}
//   chimney         {at: px along ridge from front gable, w} ; weather 0..1 (moss/cracks) ; ruined bool ; locked bool ; ivy 0..1 ; flowerBoxes bool
window.MM = window.MM || {};
(function () {
  const MM = window.MM;
  const PAL = {
    k: '#263a37', j: '#2f4b47', t: '#46695f', T: '#6a907f', G: '#4b7052', g: '#688d65', h: '#87ad7b', H: '#a6c593', y: '#d2e3ad',
    d: '#4a3a31', D: '#6e5642', w: '#8f7a5a', W: '#b89d72', s: '#c8aa86', S: '#4e5660', r: '#737d7e', R: '#9ea79f', q: '#d5d6bd',
    c: '#f7f4e9', C: '#e2dcc2', a: '#9a7444', o: '#cfaa71', O: '#eac979', Y: '#fff3c4', m: '#4f4566', v: '#8a78a8', l: '#c6aedb', L: '#ebe1f7',
    b: '#36636f', B: '#5f9ca3', i: '#a5d6d8', e: '#8a4a40', E: '#d27a55', p: '#e8b8a8', f: '#c95d6a', x: '#2e2638', X: '#7b4f7d', z: '#8ff0d0', u: '#59573a', U: '#8b8a58',
  };
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const RGB = {}; for (const k in PAL) RGB[k] = hex(PAL[k]);
  const col = (c) => RGB[c] || (c && c[0] === '#' ? hex(c) : RGB.k);
  function hsh(a, b, n) { let x = Math.imul((a | 0) + 1013, 73856093) ^ Math.imul((b | 0) + 2027, 19349663) ^ Math.imul((n | 0) + 307, 83492791); x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; }

  const MATERIALS = {
    plaster: { L: ['C', 'c', 'q'], R: ['q', 'C', 'R'], trim: 'D' }, plank: { L: ['W', 's', 'w'], R: ['w', 'W', 'D'], trim: 'd' },
    stone: { L: ['R', 'q', 'r'], R: ['r', 'R', 'S'], trim: 'S' }, log: { L: ['a', 'o', 'D'], R: ['D', 'a', 'd'], trim: 'd' },
  };
  const ROOFS = { shingle: ['T', 't', 'h'], red: ['E', 'e', 'p'], violet: ['v', 'm', 'l'], thatch: ['W', 'w', 'o'], slate: ['r', 'S', 'R'], moss: ['g', 'G', 'h'] };

  function paint(spec) {
    const A = Math.round(spec.fw * 16), B = Math.round(spec.fd * 16), wh = spec.wh | 0, rh = spec.rh | 0;
    const ov = 6, padT = 26, padB = 12;
    const W = A + B + ov * 2 + 4, H = wh + rh + Math.ceil((A + B) / 2) + padT + padB;
    const Fx = ov + 2 + A, Fy = H - padB;                 // front ground corner
    const buf = new Uint8ClampedArray(W * H * 4), zb = new Int16Array(W * H).fill(-32000);
    const lit = new Uint8ClampedArray(W * H * 4);
    const put = (x, y, c, z) => {
      if (c && c.length === 3 && c[1] === ':') { const lc = col(c[2]); const xi = Math.round(x), yi = Math.round(y); if (xi >= 0 && yi >= 0 && xi < W && yi < H) { const j = (yi * W + xi) * 4; if (z == null || z >= zb[yi * W + xi]) { lit[j] = lc[0]; lit[j + 1] = lc[1]; lit[j + 2] = lc[2]; lit[j + 3] = 255; } } c = c[0]; }
      return put0(x, y, c, z);
    };
    const put0 = (x, y, c, z) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (z != null) { if (z < zb[i]) return; zb[i] = z; } const rgb = col(c); buf[i * 4] = rgb[0]; buf[i * 4 + 1] = rgb[1]; buf[i * 4 + 2] = rgb[2]; buf[i * 4 + 3] = 255; };
    const seed = spec.seed || 7, weather = spec.weather || 0, mat = MATERIALS[spec.wall] || MATERIALS.plaster;
    const roofC = spec.roofColors || ROOFS[spec.roofColor || (spec.roof === 'thatch' ? 'thatch' : spec.roof === 'slate' ? 'slate' : 'shingle')];
    const fz = spec.foundation ?? 5;
    // screen position of a point u px back along the left face (-x), v px back along the right face (-y), height z
    const P = (u, v, z) => [Fx - u + v, Fy - u / 2 - v / 2 - z];
    const doors = [], windows = [];
    const inRect = (s, z, o) => s >= o.at - o.w / 2 && s < o.at + o.w / 2 && z >= o.z0 && z < o.z0 + o.h;
    const faceOpen = { L: [], R: [] };
    if (spec.door) { const d = Object.assign({ face: 'L', w: 20, h: 50, at: A / 2 }, spec.door); d.z0 = fz; faceOpen[d.face].push(Object.assign({ kind: 'door' }, d)); }
    for (const w0 of spec.windows || []) { const w = Object.assign({ face: 'L', w: 12, h: 12, z: fz + 18 }, w0); w.z0 = w.z; faceOpen[w.face].push(Object.assign({ kind: 'win' }, w)); }

    // ---------------- walls (face space)
    const wallPix = (face, s, z) => {
      const sh = face === 'L' ? mat.L : mat.R, len = face === 'L' ? A : B;
      if (z < fz) { // foundation stones
        const row = Math.floor(z / 3), off = row % 2 ? 3 : 0;
        if ((s + off) % 7 === 0 || z % 3 === 2) return face === 'L' ? 'r' : 'S';
        return face === 'L' ? (hsh(s >> 2, row, seed) < 0.3 ? 'q' : 'R') : (hsh(s >> 2, row, seed) < 0.3 ? 'R' : 'r');
      }
      if (s < 2 || s >= len - 2) return mat.trim;           // corner posts
      if (z === fz || z >= wh - 2) return mat.trim;            // sill beam + top plate
      const zz = z - fz;
      if (spec.wall === 'plank' || spec.wall === 'log') {
        const pr = spec.wall === 'log' ? 5 : 4;
        if (zz % pr === pr - 1) return face === 'L' ? 'D' : 'd';
        const v = hsh(Math.floor((s + (Math.floor(zz / pr) % 2) * 9) / 13), Math.floor(zz / pr), seed);
        return v < 0.18 ? sh[2] : v < 0.6 ? sh[0] : sh[1];
      }
      if (spec.wall === 'stone') {
        const row = Math.floor(zz / 5), off = (row % 2) * 4;
        if (zz % 5 === 4 || (s + off) % 9 === 0) return face === 'L' ? 'r' : 'S';
        const v = hsh(Math.floor((s + off) / 9), row, seed); return v < 0.25 ? sh[1] : v < 0.85 ? sh[0] : sh[2];
      }
      // plaster with timber framing
      if (spec.timber !== false && (zz === Math.floor((wh - fz) * 0.55) || (s % 24 === 12 && zz > 2))) return mat.trim;
      const v = hsh(s, z, seed); return v < 0.05 ? sh[2] : v < 0.12 ? sh[1] : sh[0];
    };
    const openPix = (o, s, z, face) => {
      const ls = s - (o.at - o.w / 2), lz = z - o.z0, ww = o.w, hh = o.h;
      if (o.kind === 'door') {
        const archTop = o.arch !== false ? Math.max(0, Math.round(ww / 2 - Math.sqrt(Math.max(0, (ww / 2) ** 2 - (ls - ww / 2 + 0.5) ** 2)))) : 0;
        if (lz >= hh - archTop) return null;
        if (ls < 2 || ls >= ww - 2 || lz >= hh - archTop - 2) return 'd';   // frame
        if (spec.locked) { if (Math.abs((ls - 2) - (lz * (ww - 4)) / (hh - 2)) < 1.2 || Math.abs((ww - 3 - ls) - (lz * (ww - 4)) / (hh - 2)) < 1.2) return 'a'; }
        if (ls === Math.round(ww * 0.72) && lz > hh * 0.42 && lz < hh * 0.5) return 'O';
        const dc = spec.colors?.door || 'e';
        return (ls - 2) % 5 === 0 ? 'd' : face === 'L' ? dc : 'd';
      }
      if (ls < 1 || ls >= ww - 1 || lz < 1 || lz >= hh - 1) return 'd';
      if (spec.locked || spec.shuttered) { // closed shutters, planks + brace
        if (ls === Math.floor(ww / 2)) return 'd';
        if (lz === Math.floor(hh / 2)) return 'D';
        return (ls % 3 === 0) ? 'w' : 'W';
      }
      if (ls === Math.floor(ww / 2) || lz === Math.floor(hh / 2)) return 'D';
      return lz < hh / 2 && ls < ww / 2 ? 'i:Y' : 'b:O';  // glass (day colour : lit colour)
    };
    for (const face of ['L', 'R']) {
      const len = face === 'L' ? A : B;
      for (let s = 0; s < len; s++) for (let z = 0; z < wh; z++) {
        let c = wallPix(face, s, z);
        for (const o of faceOpen[face]) if (inRect(s, z, o)) { const oc = openPix(o, s, z, face); if (oc) c = oc; }
        if (spec.ruined && z > fz + 4 && hsh(s >> 2, z >> 2, seed + 5) < 0.06) c = 'k';
        if (weather && z < fz + 10 && hsh(s, z, seed + 9) < weather * 0.3 * (1 - (z - fz) / 10)) c = hsh(s, z, 3) < 0.5 ? 'g' : 'G';
        if (spec.ivy && s < len * spec.ivy * 0.5 && hsh(s >> 1, z >> 1, seed + 11) < 0.45 * (1 - z / wh) + 0.1 && face === 'L') c = hsh(s, z, 4) < 0.6 ? 'G' : 'h';
        const [x, y] = face === 'L' ? P(s, 0, z) : P(0, s, z);
        put(x, y, c, face === 'L' ? 1000 - s : 1000 - s);
      }
    }
    // record door/window rects in sprite space (bounding boxes) + window sills / flower boxes
    for (const face of ['L', 'R']) for (const o of faceOpen[face]) {
      const p0 = face === 'L' ? P(o.at + o.w / 2, 0, o.z0 + o.h) : P(0, o.at - o.w / 2, o.z0 + o.h), p1 = face === 'L' ? P(o.at - o.w / 2, 0, o.z0) : P(0, o.at + o.w / 2, o.z0);
      const r = { face, x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), w: Math.abs(p1[0] - p0[0]), h: Math.abs(p1[1] - p0[1]) + o.w / 2, at: o.at, z: o.z0, ow: o.w, oh: o.h };
      if (o.kind === 'door') doors.push(r); else windows.push(r);
      if (o.kind === 'win') for (let s = o.at - o.w / 2 - 1; s < o.at + o.w / 2 + 1; s++) {
        const [x, y] = face === 'L' ? P(s, 0, o.z0 - 1) : P(0, s, o.z0 - 1); put(x, y, 'q', 2000); put(x, y + 1, 'r', 2000);
        if (spec.flowerBoxes && face === 'L') { put(x, y + 2, 'D', 2000); put(x, y + 3, 'd', 2000); if (hsh(s, 1, seed) < 0.5) put(x, y - 1, hsh(s, 2, seed) < 0.5 ? 'f' : 'L', 2000); }
      }
    }
    // steps / porch slab in front of the door (protrude outward from the face)
    if (spec.door) {
      const d = faceOpen[spec.door.face || 'L'][0], steps = spec.steps ?? 2, depth = spec.porch ? (spec.porch.depth || 10) : steps * 3;
      for (let k = 0; k < depth; k++) for (let s = d.at - d.w / 2 - 3; s < d.at + d.w / 2 + 3; s++) {
        const top = spec.porch ? fz - 1 : Math.max(0, fz - 1 - Math.floor(k / 3) * Math.ceil(fz / Math.max(1, steps)));
        for (let z = 0; z <= top; z++) {
          const edge = z === top, c = spec.porch ? (edge ? (k % 4 === 3 ? 'D' : 'W') : 'D') : (edge ? 'R' : z === 0 ? 'S' : 'r');
          const [x, y] = d.face === 'L' ? P(s, -k - 1, z) : P(-k - 1, s, z); put(x, y, c, 3000 + k);
        }
      }
      if (spec.porch && spec.porch.posts !== false) for (const s of [d.at - d.w / 2 - 3, d.at + d.w / 2 + 2]) for (let z = fz; z < d.z0 + d.h + 8; z++) { const [x, y] = d.face === 'L' ? P(s, -depth, z) : P(-depth, s, z); put(x, y, z % 9 === 0 ? 'd' : 'D', 3500); put(x + 1, y, 'd', 3500); }
      if (spec.awning || spec.porch) { // sloped awning over the door
        const aw = spec.awning || {}, st = aw.stripes || ['f', 'c'], z0 = d.z0 + d.h + 9;
        for (let k = 0; k <= depth + 1; k++) for (let s = d.at - d.w / 2 - 5; s < d.at + d.w / 2 + 5; s++) {
          const z = z0 - Math.floor(k * 0.6); const c = k === depth + 1 ? 'k' : spec.awning ? st[Math.floor((s - d.at) / 4 + 50) % 2] : (k % 3 ? roofC[0] : roofC[1]);
          const [x, y] = d.face === 'L' ? P(s, -k, z) : P(-k, s, z); put(x, y, c, 4000 + k);
        }
      }
    }
    // ---------------- roof (ridge along x: front plane over the left face, gable on the right face)
    const e = 4, ridgeV = B / 2, rz = wh + rh;
    const roofPix = (row, s, t, back) => {
      const rc = roofC, lr = Math.floor(row / 3);
      if (spec.roof === 'thatch') { const v = hsh(Math.floor(s / 2), lr, seed + 2); return row % 6 === 5 ? rc[1] : v < 0.25 ? rc[1] : v > 0.9 ? rc[2] : rc[0]; }
      if (row % 3 === 2) return back ? 'k' : rc[1];
      if ((s + (lr % 2) * 4) % 8 === 0) return rc[1];
      const v = hsh(Math.floor((s + (lr % 2) * 4) / 8), lr, seed + 3);
      if (spec.ruined && v < 0.12) return 'k';
      if (weather && lr * 3 < 12 && v < weather * 0.5) return v < weather * 0.25 ? 'G' : 'g';
      return v < 0.08 ? rc[2] : back ? rc[1] : rc[0];
    };
    // back plane (from ridge to back eave), drawn first
    const steps2 = 2;
    for (let s = -e; s <= A + e; s += 0.5) for (let k = 0; k <= 1; k += 1 / ((B / 2 + rh) * steps2)) {
      const v = ridgeV + k * (B / 2 + e), z = rz - k * (rh + e / 2), [x, y] = P(s, v, z); put(x, y, roofPix(Math.floor(k * (B / 2 + rh) / 1.5), Math.round(s), k, true), 500 + Math.round(k * 50));
    }
    // gable triangle on the right face (u = 0)
    for (let s = 0; s < B; s++) { const top = rh * (1 - Math.abs(s - B / 2) / (B / 2)); for (let z = wh; z < wh + top; z++) { const lz = z - wh; let c = spec.wall === 'stone' || spec.wall === 'plaster' ? ((s % 6 === 0) ? 'D' : 'W') : wallPix('R', s, Math.min(wh - 3, z)); if (Math.abs(s - B / 2) < 3 && lz > top * 0.3 && lz < top * 0.3 + 5 && !spec.ruined) c = lz === Math.round(top * 0.3) || Math.abs(s - B / 2) >= 2 ? 'd' : 'b'; const [x, y] = P(0, s, z); put(x, y, c, 900); } }
    // front plane (eave -> ridge) with overhang + barge boards
    const len = Math.hypot(B / 2 + e, rh + e / 2);
    for (let s = -e; s <= A + e; s += 0.5) for (let k = 0; k <= 1; k += 1 / (len * steps2)) {
      const v = -e + k * (B / 2 + e), z = wh - e / 2 + k * (rh + e / 2), [x, y] = P(s, v, z);
      const row = Math.floor((1 - k) * len / 1.5);
      let c = roofPix(row, Math.round(s), k, false);
      if (s < -e + 2 || s > A + e - 2) c = 'd'; else if (k < 1.5 / len) c = 'k'; else if (k > 1 - 1.2 / len) c = roofC[1];
      put(x, y, c, 1500 + Math.round(k * 100));
    }
    // chimney
    let chim = null;
    if (spec.chimney !== false) {
      const cu = spec.chimney?.at ?? A * 0.3, cw = spec.chimney?.w ?? 7, ch = 14;
      for (let du = 0; du < cw; du++) for (let dv = 0; dv < cw; dv++) for (let z = rz - 10; z < rz + ch; z++) {
        const face = du === 0 ? 'L' : dv === 0 ? 'R' : null; if (!face && z !== rz + ch - 1) continue;
        const [x, y] = P(cu + du, ridgeV - cw / 2 + dv, z);
        const c = z === rz + ch - 1 ? (du > 0 && dv > 0 ? 'k' : 'r') : ((z + du) % 4 === 0 ? 'S' : face === 'R' ? 'r' : 'R');
        put(x, y, c, 2500 + z);
      }
      const top = P(cu + cw / 2, ridgeV, rz + ch); chim = { x: top[0], y: top[1] };
    }
    // outline pass
    const out = new Uint8ClampedArray(buf); const ok = RGB.k;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (buf[i * 4 + 3]) continue;
      if ((x > 0 && buf[(i - 1) * 4 + 3]) || (x < W - 1 && buf[(i + 1) * 4 + 3]) || (y > 0 && buf[(i - W) * 4 + 3]) || (y < H - 1 && buf[(i + W) * 4 + 3])) { out[i * 4] = ok[0]; out[i * 4 + 1] = ok[1]; out[i * 4 + 2] = ok[2]; out[i * 4 + 3] = 255; }
    }
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0);
    // lit-window mask: only glass pixels still visible in the final image
    for (let i = 0; i < W * H; i++) if (lit[i * 4 + 3] && !(buf[i * 4] === col('b')[0] && buf[i * 4 + 1] === col('b')[1] && buf[i * 4 + 2] === col('b')[2]) && !(buf[i * 4] === col('i')[0] && buf[i * 4 + 1] === col('i')[1] && buf[i * 4 + 2] === col('i')[2])) lit[i * 4 + 3] = 0;
    const lc = document.createElement('canvas'); lc.width = W; lc.height = H; lc.getContext('2d').putImageData(new ImageData(lit, W, H), 0, 0);
    return { c, lit: lc, w: W, h: H, ax: Fx, ay: Fy, doors, windows, chimney: chim, A, B };
  }
  const cache = new Map();
  function get(spec) { const k = JSON.stringify(spec); let r = cache.get(k); if (!r) { r = paint(spec); cache.set(k, r); } return r; }
  MM.worldBuildings = { paint, get, materials: Object.keys(MATERIALS), roofs: Object.keys(ROOFS) };
})();
