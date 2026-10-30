// Shared helpers for the ART2 sheets (furniture, interior, npcs, exterior, env, screens).
// Include after _palette.px.js.
//
// meta(name, {...}) prints one "@@meta {json}" line while the file loads. tools/build-art.js reads those
// lines and merges them into the manifest entry: ax/ay (anchor override), foot [tilesX, tilesY],
// plus any documented extra (wall, flipOf, hook...). Keeps anchors next to the art that defines them.
function meta(name, o) { console.log("@@meta " + JSON.stringify(Object.assign({ name }, o))) }

// World axes on screen: +x runs down-right (16, 8) per tile, +y runs down-left (-16, 8).
// An iso prism standing on a footprint: (fx, fy) = front-bottom vertex (pixel corner coords),
// B = px along the LEFT face (= 16 * tiles along x), A = px along the RIGHT face (= 16 * tiles along y),
// H = height. The shader paints every pixel in face space:
//   shader(face, u, v) -> key   face 'L' (SW-facing, lit), 'R' (SE-facing, shaded), 'T' (top)
//   L: u 0..B from the left vertex toward the front, v 0..H up from the ground
//   R: u 0..A from the front toward the right vertex, v 0..H
//   T: u = a 0..A (along the right edge, from the front), v = b 0..B (along the left edge)
// shader may also be an object {L, R, T} of flat keys.
const _TMP = { L: "#010203", R: "#020304", T: "#030405" }
function prism(c, fx, fy, A, B, H, shader) {
  const f = typeof shader === "function" ? shader : (face) => shader[face]
  if (B > 0) c.poly([fx - B, fy - B / 2, fx, fy, fx, fy - H, fx - B, fy - B / 2 - H], _TMP.L)
  if (A > 0) c.poly([fx, fy, fx + A, fy - A / 2, fx + A, fy - A / 2 - H, fx, fy - H], _TMP.R)
  if (A > 0 && B > 0) c.poly([fx, fy - H, fx + A, fy - A / 2 - H, fx + A - B, fy - (A + B) / 2 - H, fx - B, fy - B / 2 - H], _TMP.T)
  const cl = c.color(_TMP.L), cr = c.color(_TMP.R), ct = c.color(_TMP.T)
  const x0 = Math.max(0, Math.floor(fx - B - 1)), x1 = Math.min(c.w, Math.ceil(fx + A + 1))
  const y0 = Math.max(0, Math.floor(fy - (A + B) / 2 - H - 1)), y1 = Math.min(c.h, Math.ceil(fy + 1))
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const g = c.get(x, y); let k
    if (g === cl) { const u = x + 0.5 - (fx - B), v = fy - (fx - x - 0.5) / 2 - (y + 0.5); k = f("L", u, v, x, y) }
    else if (g === cr) { const u = x + 0.5 - fx, v = fy - (x + 0.5 - fx) / 2 - (y + 0.5); k = f("R", u, v, x, y) }
    else if (g === ct) { const sx = x + 0.5 - fx, up = fy - H - (y + 0.5); k = f("T", up + sx / 2, up - sx / 2, x, y) }
    else continue
    c.px(x, y, k == null ? "_" : k)
  }
}

// A flat iso diamond/parallelogram on the floor (rugs, shadows): same corner convention as prism with H = 0.
function floorQuad(c, fx, fy, A, B, shader) {
  const f = typeof shader === "function" ? shader : () => shader
  c.poly([fx, fy, fx + A, fy - A / 2, fx + A - B, fy - (A + B) / 2, fx - B, fy - B / 2], _TMP.T)
  const ct = c.color(_TMP.T)
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (c.get(x, y) !== ct) continue
    const sx = x + 0.5 - fx, up = fy - (y + 0.5)
    const k = f(up + sx / 2, up - sx / 2, x, y); c.px(x, y, k == null ? "_" : k)
  }
}

// Iso furniture definer. o = {fw, fd (tiles), up (px of canvas above the footprint top), ml, mr, mb (margins), anim opts...}
// draw(c, g) gets g = {fx, fy, A, B, cx, cy} (front-bottom vertex + footprint centre, pre-outline coords).
// Anchor (written to the manifest) = footprint centre on the floor, like a tile centre: place it on the
// screen point of the footprint's centre. A flipped copy `<name>_f`-style variant swaps fw/fd.
function furnGeo(o) {
  const A = Math.round((o.fd ?? 1) * 16), B = Math.round((o.fw ?? 1) * 16)
  const ml = o.ml ?? 1, mr = o.mr ?? 1, mb = o.mb ?? 1, up = o.up ?? 24
  const w = ml + B + A + mr, h = up + Math.ceil((A + B) / 2) + mb
  const fx = ml + B, fy = h - mb
  return { A, B, w, h, fx, fy, cx: fx + (A - B) / 2, cy: fy - (A + B) / 4 }
}
function furn(name, o, draw) {
  const g = furnGeo(o), outline = o.outline === undefined ? "k" : o.outline, pad = outline ? 1 : 0
  const opts = { w: g.w, h: g.h }; if (outline) opts.outline = outline
  if (o.frames || o.fps) { if (o.frames) opts.frames = o.frames; opts.fps = o.fps || 8; if (o.loop === false) opts.loop = false; anim(name, opts, (c) => draw(c, g)) }
  else sprite(name, opts, (c) => draw(c, g))
  meta(name, { ax: Math.round(g.cx + pad), ay: Math.round(g.cy + pad), foot: [o.fw ?? 1, o.fd ?? 1], ...(o.meta || {}) })
  return g
}
// Mirror an existing furn() sprite/anim (stands against the other back wall). Footprint swaps.
function furnFlip(name, src, o) {
  const g = furnGeo(o), pad = (o.outline === undefined ? 1 : o.outline ? 1 : 0), W = g.w + 2 * pad
  if (o.frames || o.fps) anim(name, { base: src, flip: "x" }); else sprite(name, { base: src, flip: "x" })
  meta(name, { ax: Math.round(W - (g.cx + pad)), ay: Math.round(g.cy + pad), foot: [o.fd ?? 1, o.fw ?? 1], flipOf: src, ...(o.meta || {}) })
}

// ---------------------------------------------------------------- materials (face-space shaders)
// Wood boards: horizontal planks of height ph on side faces, with grain dashes and knots, lit/shaded tones.
const WOOD = { lit: ["W", "w", "D", "s"], mid: ["w", "D", "d", "W"], dark: ["D", "d", "k", "w"] }
function woodFace(tone, u, v, ph = 4, seed = 1) {
  const [base, grain, seam, hi] = WOOD[tone]
  const row = Math.floor(v / ph), vv = v - row * ph
  if (vv < 1) return seam
  if (vv >= ph - 1 && hash(Math.floor(u), row, seed) < 0.5) return hi === "s" && tone !== "lit" ? base : hi
  const h = hash(Math.floor(u / 3), row, seed + 7)
  if (h < 0.18 && vv === Math.floor(ph / 2)) return grain
  if (hash(Math.floor(u), row, seed + 3) < 0.03) return seam
  return base
}
// Top boards along the u (a) axis, board width bw.
function woodTop(u, v, bw = 4, seed = 1, cols = ["W", "w", "s"]) {
  const row = Math.floor(v / bw), vv = v - row * bw
  if (vv < 1) return cols[1]
  if (vv >= bw - 1) return cols[2]
  if (hash(Math.floor(u / 4), row, seed) < 0.15 && vv === 1) return cols[1]
  return cols[0]
}
// light/shade one step along the master ramps (for hand-shading inside shaders)
const LIGHT1 = { k: "j", j: "t", t: "T", G: "g", g: "h", h: "H", H: "y", d: "D", D: "w", w: "W", W: "s", S: "r", r: "R", R: "q", q: "c", C: "c", a: "o", o: "O", O: "Y", m: "v", v: "l", l: "L", b: "B", B: "i", e: "E", E: "p", x: "m", X: "l", u: "U" }
const SHADE1 = { y: "H", H: "h", h: "g", g: "G", G: "j", T: "t", t: "j", s: "W", W: "w", w: "D", D: "d", d: "k", c: "q", q: "R", R: "r", r: "S", S: "j", C: "q", Y: "O", O: "o", o: "a", a: "d", L: "l", l: "v", v: "m", m: "x", i: "B", B: "b", b: "j", p: "E", E: "e", e: "d", f: "e", U: "u", u: "k", z: "T" }
