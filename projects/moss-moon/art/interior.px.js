// Interior architecture: iso floors + back walls per building kind (cottage, shop, herbal, elder, hut).
// All pieces share the 32x16 floor-tile anchor: draw them at the CENTRE of the floor tile whose edge they stand on.
//   ifloor_<kind>_0..3                   32x16 floor diamonds (anchor 16,8), seamless planks/flags
//   iwall_<kind>_<piece>_l               stands on the tile's NW (upper-left) edge, faces SE (shaded side)
//   iwall_<kind>_<piece>_r               stands on the tile's NE (upper-right) edge, faces SW (lit side)
//     pieces: plain, plain2 (beam/post/shelf variant), window, door (closed), doorway (open, dark passage)
//   iwall_<kind>_corner                  post/cap joining _l and _r on the room's top (back) tile
//   iwall_<kind>_end_l / end_r           cut section at the front end of the left / right back wall (room's left / right vertex tile)
//   iwall_<kind>_low_sw / low_se         cut-away front wall stub on the tile's SW / SE edge (draw after the floor, before actors in front)
//   iwall_<kind>_lowdoor_sw / _se        the same stub with a threshold gap (front exit door)
//   iwall_curtain_l / _r                 curtains to overlay on any *_window_l/_r piece (same anchor)
//   iwall_shelf_l / _r, iwall_portrait_l/_r, iwall_herbs_l/_r, iwall_sconce_l/_r (3f flicker)  wall decor overlays (same anchor)
// Wall height 64 px (witch is ~39 px with hat), door opening 13x52 px, window glass 10x20 px at sill height 26.
include("_palette.px.js")
include("_iso.px.js")

const WH = 64, OY = 68, PH = OY + 9          // wall height, tile-box top inside the piece, piece height
const gy = (x) => OY + Math.floor((16 - x) / 2) - 1  // floor row under wall column x (L orientation)
const ANCH_L = [16, OY + 8], ANCH_R = [1, OY + 8]

// ---------------------------------------------------------------- generic wall piece pair
// fn(u, v, lit, x) -> key. u 0..15 along the wall (15 = toward the back corner), v 0..63 up from the floor.
// cap: [fill, edge] keys for the wall top (seen from above).
function wallPair(base, fn, cap, opt = {}) {
  for (const side of ["l", "r"]) {
    const lit = side === "r", name = `${base}_${side}`
    sprite(name, { w: 17, h: PH }, (c) => {
      for (let x = 0; x < 16; x++) {
        const col = lit ? 16 - x : x, g = gy(x)
        for (let v = 0; v < WH; v++) { const k = fn(x, v, lit, col); if (k) c.px(col, g - v, k) }
        const top = g - WH + 1
        if (!opt.noCap) { c.px(col, top - 1, cap[1]); c.px(col, top - 2, cap[0]); c.px(col, top - 3, cap[0]); c.px(col, top - 4, "k") }
      }
      if (opt.after) opt.after(c, lit)
    })
    meta(name, { ax: lit ? ANCH_R[0] : ANCH_L[0], ay: ANCH_L[1], wall: side === "l" ? "nw" : "ne" })
  }
}
// helpers in wall space
const inBox = (u, v, u0, v0, w, h) => u >= u0 && u < u0 + w && v >= v0 && v < v0 + h
// window opening u 3..12, v 26..47: frame, mullion, sill, reveal (wall thickness) on the left, view of a pale sky
function windowPx(u, v, lit, frame = ["D", "w"], sill = "W") {
  if (!inBox(u, v, 2, 24, 12, 26)) return null
  if (v === 24 || v === 25) return v === 25 ? sill : "d"               // sill (+ its shadow)
  if (v === 49) return frame[0]                                        // lintel
  if (u === 2 || u === 13 || v === 48) return lit ? frame[1] : frame[0]
  if (u === 3) return lit ? "C" : "q"                                  // reveal: the lit side of the wall thickness
  if (u === 8 || v === 37) return frame[0]                             // mullion + transom
  // glass: sky gradient, moon glint top-left of each pane, reflection streak
  const hi = (u === 4 || u === 9) && (v === 46 || v === 35)
  if (hi) return "c"
  if ((u + (48 - v)) % 9 === 0 && v > 38) return "L"
  return v > 41 ? "i" : v > 30 ? "B" : "b"
}
// door: opening u 2..14 (13 px), v 0..51
function doorPx(u, v, lit, open, wood = ["e", "E", "d"], frame = ["D", "w"]) {
  if (!inBox(u, v, 1, 0, 15, 54)) return null
  if (v >= 52 || u === 1 || u === 15) return v === 53 ? "d" : lit ? frame[1] : frame[0]   // frame + lintel
  if (open) {                                                           // dark passage, warm light from the next room on the floor
    if (u === 2) return lit ? "C" : "q"                                 // reveal
    if (v < 3 && u > 5) return v === 0 ? "o" : "a"
    return v > 46 ? "k" : "j"
  }
  if (u === 2) return lit ? "C" : "q"
  const p = (u - 3) % 4
  if (v === 51) return wood[2]
  if (p === 3) return wood[2]                                           // plank gaps
  if (v === 12 || v === 13 || v === 38 || v === 39) return v % 2 ? "S" : "r"   // iron straps
  if (u === 12 && v === 26) return "O"                                  // ring handle
  if (u === 12 && (v === 25 || v === 27)) return "a"
  return p === 0 ? wood[1] : wood[0]
}

// ---------------------------------------------------------------- kinds
// Each kind: wall(u, v, lit, variant) for the plain face, cap, floor painter, low stub colours.
const KINDS = {}

// Cottage (grandmother's home): tongue-and-groove wainscot, cream plaster, oak beam under the ceiling.
KINDS.cottage = {
  cap: ["C", "c"], low: ["W", "w", "D"],
  wall: (u, v, lit, vr) => {
    if (v < 2) return v ? (lit ? "D" : "d") : "d"                         // skirting
    if (v < 18) { if (v === 17) return lit ? "s" : "W"; if (v === 16) return lit ? "D" : "d"; return u % 4 === 3 ? (lit ? "D" : "d") : u % 4 === 0 ? (lit ? "W" : "w") : lit ? "w" : "D" }
    if (v >= 58) return v === 58 ? (lit ? "d" : "k") : v === 63 ? (lit ? "w" : "D") : (u + v) % 7 === 0 ? "d" : lit ? "D" : "d"   // ceiling beam
    if (vr === 1 && u >= 6 && u <= 9) return u === 6 ? (lit ? "w" : "D") : u === 9 ? "d" : (v % 9 === 4 ? "d" : lit ? "D" : "d")   // timber post
    if (vr === 2 && v >= 40 && v <= 41) return v === 41 ? (lit ? "W" : "w") : "d"                                                  // picture rail
    if (v === 18) return lit ? "R" : "r"                                  // shadow under the rail
    return lit ? "c" : "q"
  },
  floor: (c, vr, s) => planks(c, vr, s, ["W", "w", "D", "s"], 8),
}
// Shop: horizontal pine planks, a long shelf ledge at hand height, pegs.
KINDS.shop = {
  cap: ["W", "s"], low: ["W", "w", "D"],
  wall: (u, v, lit, vr) => {
    if (v < 2) return "d"
    if (v >= 60) return v === 60 ? "d" : lit ? "D" : "d"
    if (vr === 2 && (v === 32 || v === 33)) return v === 33 ? (lit ? "s" : "W") : "d"     // ledge
    if (vr === 2 && v === 31) return "j"
    if (vr === 1 && v === 44 && u % 8 === 4) return "a"                                   // pegs
    if (vr === 1 && v === 43 && u % 8 === 4) return "d"
    return woodFace(lit ? "lit" : "mid", u, v, 5, 3)
  },
  floor: (c, vr, s) => planks(c, vr, s, ["s", "W", "w", "c"], 8, true),
}
// Herbalist (Wren): rubble-stone dado, sage-washed plaster, a rafter with pegs.
KINDS.herbal = {
  cap: ["q", "c"], low: ["R", "r", "S"],
  wall: (u, v, lit, vr) => {
    if (v < 14) {                                                        // rubble dado
      const row = Math.floor(v / 4), off = row % 2 ? 2 : 0, cu = Math.floor((u + off) / 5)
      if (v % 4 === 3 || (u + off) % 5 === 4) return lit ? "r" : "S"
      if (v % 4 === 2 && hash(cu, row, 4) < 0.5) return lit ? "q" : "R"
      return hash(cu, row, 9) < 0.3 ? (lit ? "q" : "R") : lit ? "R" : "r"
    }
    if (v === 14) return lit ? "R" : "r"
    if (v >= 56) return v === 56 ? "k" : v === 63 ? (lit ? "w" : "D") : lit ? "D" : "d"
    if (vr === 1 && v === 52 && u % 5 === 2) return "a"
    if (vr === 2 && v > 20 && v < 50 && hash(u >> 1, v >> 3, 2) < 0.06) return lit ? "h" : "g"   // painted sprigs
    return lit ? "y" : "H"
  },
  floor: (c, vr, s) => terracotta(c, vr, s),
}
// Elder Marrow's house: dressed stone below, dark panelled wood above, heavy beam.
KINDS.elder = {
  cap: ["R", "q"], low: ["R", "r", "S"],
  wall: (u, v, lit, vr) => {
    if (v < 30) {
      const row = Math.floor(v / 6), off = row % 2 ? 4 : 0
      if (v % 6 === 5 || (u + off) % 8 === 7) return lit ? "r" : "S"
      if (v % 6 === 4 || (u + off) % 8 === 0) return lit ? "q" : "R"
      return hash(Math.floor((u + off) / 8), row, 3) < 0.35 ? (lit ? "q" : "R") : lit ? "R" : "r"
    }
    if (v === 30) return lit ? "w" : "D"
    if (v >= 58) return v === 58 ? "k" : lit ? "D" : "d"
    // panels: frame rails/stiles, inset field with a lit bevel
    const pu = u % 8, pv = (v - 31) % 13
    if (pv === 0 || pv === 12 || pu === 0 || pu === 7) return lit ? "D" : "d"
    if (pv === 1 || pu === 1) return lit ? "w" : "D"
    if (vr === 2 && pv === 6 && pu === 4) return "a"
    return lit ? "D" : "d"
  },
  floor: (c, vr, s) => flags(c, vr, s),
}
// Practice hut: rough horizontal logs with mossy chinking.
KINDS.hut = {
  cap: ["w", "W"], low: ["w", "D", "d"],
  wall: (u, v, lit, vr) => {
    const row = Math.floor(v / 7), vv = v % 7
    if (vv === 0) return hash(u >> 1, row, 6) < 0.25 ? (lit ? "g" : "G") : "d"      // chinking (+ moss)
    if (vv === 6) return lit ? "W" : "w"
    if (vv === 5) return lit ? "w" : "D"
    if (vv === 1) return lit ? "D" : "d"
    if (hash(u >> 2, row, 2) < 0.12 && vv === 3) return "d"                            // bark split
    if (vr === 1 && row === 5 && u >= 5 && u <= 7) return vv === 3 && u === 6 ? "d" : lit ? "W" : "w"   // log end knot
    return lit ? "w" : "D"
  },
  floor: (c, vr, s) => earth(c, vr, s),
}

// ---------------------------------------------------------------- floor painters (seamless across tiles)
// m1 = 2y - x is constant along the down-right grain, m2 = 2y + x along the down-left grain; both match
// across neighbouring tiles (shifts of (16,8) / (-16,8) change them by 0 or 32).
const mod = (a, n) => ((a % n) + n) % n
function planks(c, vr, s, [base, alt, seam, hi], bw, wide) {
  const W2 = wide ? 10 : bw
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    if (!DIA(x, y)) continue
    const m1 = 2 * y - x, m2 = 2 * y + x, board = Math.floor((m1 + 64) / W2), bm = mod(m1, W2)
    const len = 32, joint = mod(board * 11 + (vr === 3 ? 5 : 0), len)
    let k = hash(board & 3, 0, s) < 0.35 ? alt : base
    if (bm === 0 || bm === 1) k = seam
    else if (bm === 2 || bm === 3) k = k === base ? hi : base            // lit leading edge of each board
    else if (mod(m2 - joint, len) < 2) k = seam                          // board end joint
    else if (mod(m2 - joint, len) === 2 || mod(m2 - joint, len) === 3) k = hi
    else if (mod(m2 + board * 5, 13) < 2 && bm === Math.floor(W2 / 2) + 1) k = alt === k ? seam : alt   // grain dash
    c.px(x, y, k)
  }
  if (vr === 1) sprinkle(c, s + 1, ["d"], 1, 2)                          // a nail-head knot
  if (vr === 2) sprinkle(c, s + 2, [hi + hi], 1, 2)
}
function terracotta(c, vr, s) {
  // square iso tiles, 4 per floor tile; grout lines lit on the top-left
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    if (!DIA(x, y)) continue
    const m1 = 2 * y - x + 64, m2 = 2 * y + x, a = Math.floor(m1 / 16), b = Math.floor(m2 / 16), am = m1 % 16, bmm = m2 % 16
    let k = hash(a & 1, b & 1, s + vr) < 0.3 ? "e" : "E"
    if (am < 2 || bmm < 2) k = "w"
    else if (am < 4 || bmm < 4) k = k === "E" ? "p" : "E"
    else if (vr === 2 && am === 9 && bmm > 6 && bmm < 12) k = "e"
    c.px(x, y, k)
  }
  if (vr === 3) sprinkle(c, s, ["g"], 1, 2)                              // a fallen leaf
  if (vr === 1) sprinkle(c, s, ["h\n.g"], 1, 2)
}
function flags(c, vr, s) {
  // large irregular flags, low-contrast tones per stone (no checker): ids from a 2x2 iso grid with staggered rows
  const cell = (x, y) => { const [i, j] = isoUV(x, y), a = Math.floor(i * 2 + 4), b = Math.floor(j * 2 + 4 + (a % 2) * 0.5); return a * 16 + b }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    if (!DIA(x, y)) continue
    const me = cell(x, y), r = cell(x + 1, y) !== me || cell(x, y + 1) !== me, tl = cell(x - 1, y) !== me || cell(x, y - 1) !== me
    const tone = hash(me, vr, s) < 0.5 ? "R" : "q"
    c.px(x, y, r ? "r" : tl ? (tone === "R" ? "q" : "c") : tone)
  }
  if (vr === 1) sprinkle(c, s, ["r.\n.r"], 1, 2)
  if (vr === 2) sprinkle(c, s, ["h", "g"], 1, 1)
}
function earth(c, vr, s) {
  fillDia(c, "W")
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) if (DIA(x, y) && mod(2 * y - x + 3 * (y >> 2), 11) === 0 && hash(x, y, s) < 0.6) c.px(x, y, "w")   // trodden ridges
  sprinkle(c, s, ["O.\n.o", "o", "Oo"], 3)                                // straw
  sprinkle(c, s + 1, ["w", "D"], 2)
  if (vr === 1) sprinkle(c, s + 2, ["sss\n.ww"], 1, 2)
  if (vr === 3) sprinkle(c, s + 3, ["g.\nGg"], 1, 2)
}

// ---------------------------------------------------------------- generate every kind
for (const [kind, K] of Object.entries(KINDS)) {
  const w = K.wall
  for (let v = 0; v < 4; v++) sprite(`ifloor_${kind}_${v}`, { w: 32, h: 16 }, (c) => K.floor(c, v, 211 + v * 31 + kind.length * 13))
  wallPair(`iwall_${kind}_plain`, (u, v, lit) => w(u, v, lit, 0), K.cap)
  wallPair(`iwall_${kind}_plain2`, (u, v, lit) => w(u, v, lit, 1 + (kind.length % 2)), K.cap)
  wallPair(`iwall_${kind}_window`, (u, v, lit) => windowPx(u, v, lit) || w(u, v, lit, 0), K.cap)
  wallPair(`iwall_${kind}_door`, (u, v, lit) => doorPx(u, v, lit, false, kind === "elder" ? ["D", "w", "d"] : kind === "hut" ? ["w", "W", "D"] : ["e", "E", "d"]) || w(u, v, lit, 0), K.cap)
  wallPair(`iwall_${kind}_doorway`, (u, v, lit) => doorPx(u, v, lit, true) || w(u, v, lit, 0), K.cap)
  // back corner: the two caps meet in a little diamond; a corner post (or quoins for stone)
  sprite(`iwall_${kind}_corner`, { w: 8, h: PH }, (c) => {
    for (const [x, lit] of [[3, false], [4, true]]) {
      const g = OY - 1, top = g - WH + 1
      for (let v = 0; v < WH; v++) c.px(x, g - v, kind === "elder" || kind === "herbal" ? (v < 30 && Math.floor(v / 6) % 2 ? (lit ? "q" : "R") : lit ? "R" : "r") : lit ? "w" : "D")
      for (let k = 1; k <= 4; k++) c.px(x, top - k, k === 4 ? "k" : K.cap[0])
    }
    c.px(2, OY - 1 - WH - 2, "k"); c.px(5, OY - 1 - WH - 2, "k")
  })
  meta(`iwall_${kind}_corner`, { ax: 4, ay: OY + 8, wall: "corner" })
  // cut ends: the section through the wall thickness (4 px), lit on the left end, shaded on the right end
  for (const side of ["l", "r"]) {
    const lit = side === "l", name = `iwall_${kind}_end_${side}`
    sprite(name, { w: lit ? 21 : 20, h: PH }, (c) => {
      for (let k = 0; k < 4; k++) {
        const x = lit ? 3 - k : 16 + k, g = gy(0) - Math.ceil(k / 2)
        for (let v = 0; v < WH + 3; v++) c.px(x, g - v, k === 3 || v === 0 || v === WH + 2 ? "k" : v >= WH ? K.cap[0] : k === 0 ? K.cap[1] : K.cap[0])
      }
    })
    meta(name, { ax: lit ? 20 : 0, ay: OY + 8, wall: side === "l" ? "nw-end" : "ne-end" })
  }
  // cut-away front stubs (SW and SE edges), 8 px tall with a lit cap
  for (const side of ["sw", "se"]) for (const door of [false, true]) {
    const name = `iwall_${kind}_${door ? "lowdoor" : "low"}_${side}`, right = side === "se", LH = 8, T0 = 12
    sprite(name, { w: 17, h: T0 + 16 + 4 }, (c) => {
      for (let x = 0; x < 16; x++) {
        const col = right ? 16 - x : x, yb = T0 + 15 - Math.ceil((15 - x) / 2)   // bottom diamond row under this column
        if (door && x >= 3 && x <= 13) { c.px(col, yb + 1, "d"); c.px(col, yb, x === 3 || x === 13 ? "w" : "W"); continue }   // threshold
        for (let v = 0; v < LH; v++) c.px(col, yb + 2 - v, v === 0 ? "k" : v < 3 ? (right ? K.low[2] : K.low[1]) : right ? K.low[1] : K.low[0])
        c.px(col, yb + 2 - LH, K.cap[1]); c.px(col, yb + 1 - LH, K.cap[0]); c.px(col, yb - LH, K.cap[0]); c.px(col, yb - 1 - LH, "k")
        if (door && (x === 2 || x === 14)) for (let v = 0; v < LH + 3; v++) c.px(col, yb + 2 - v, v === 0 ? "k" : "d")   // jamb posts
      }
    })
    meta(name, { ax: right ? 1 : 16, ay: T0 + 8, wall: side })
  }
}

// ---------------------------------------------------------------- wall decor overlays (same anchor as the wall piece)
// curtains framing the window opening (u 2..13), tied back, lavender with a cream hem
wallPair("iwall_curtain", (u, v, lit) => {
  if (v === 51 || v === 52) return u >= 0 && u <= 15 ? (v === 52 ? "a" : "d") : null            // rod
  if (v > 50 || v < 20) return null
  const left = u <= 3 && u >= 0, right = u >= 12
  const tie = 34, sw = (vv) => (vv > tie ? 0 : Math.round((tie - vv) / 6))
  if (left && u <= 3 - sw(v) + 0 || right && u >= 12 + sw(v)) {
    if (v === tie) return "o"
    if (v < 23) return "C"
    const fold = (u + (v > tie ? 0 : 1)) % 2
    return fold ? (lit ? "l" : "v") : lit ? "L" : "l"
  }
  return null
}, null, { noCap: true })
wallPair("iwall_shelf", (u, v, lit) => {
  if (u < 1 || u > 14) return null
  if (v === 30) return lit ? "W" : "w"
  if (v === 29) return "d"
  if (v === 28 && (u === 3 || u === 12)) return "d"
  if (v === 27 && (u === 3 || u === 12)) return "D"
  // jars and a book on the ledge
  if (v > 30 && v < 37 && u >= 2 && u <= 4) return v === 36 ? "a" : v === 35 ? "c" : u === 2 ? "i" : "B"
  if (v > 30 && v < 35 && u >= 6 && u <= 7) return v === 34 ? "r" : u === 6 ? "p" : "f"
  if (v > 30 && v < 39 && u >= 9 && u <= 10) return v === 38 ? "c" : u === 9 ? "h" : "G"
  if (v > 30 && v < 34 && u >= 12 && u <= 13) return v === 33 ? "S" : "O"
  return null
}, null, { noCap: true })
// grandmother's portrait: oval frame, lavender dress, grey bun, a moon brooch
wallPair("iwall_portrait", (u, v, lit) => {
  const cu = 7.5, cv = 40, du = (u - cu) / 6.2, dv = (v - cv) / 11
  const r = du * du + dv * dv
  if (r > 1) return null
  if (r > 0.72) return r > 0.86 ? "a" : lit ? "O" : "o"                // gilt frame, lit inner edge
  if (v < 33) return u % 2 ? "m" : "v"                                   // dress
  if (v === 33 && u > 4 && u < 11) return "o"                            // brooch row
  if (v >= 34 && v <= 41 && u >= 6 && u <= 9) return v === 37 && (u === 6 || u === 9) ? "k" : v === 39 && u >= 7 && u <= 8 ? "p" : "p"   // face
  if (v >= 42 && v <= 46 && u >= 5 && u <= 10) return v === 46 || u === 5 || u === 10 ? "r" : "R"   // grey bun + hair
  if (v >= 38 && v <= 41 && (u === 5 || u === 10)) return "r"
  return v > 44 ? "t" : "T"                                              // painted dusk backdrop
}, null, { noCap: true })
wallPair("iwall_herbs", (u, v, lit) => {
  // a twine with three drying bundles hanging under the beam
  if (v === 54) return u % 3 === 0 ? "a" : "W"
  const bundles = [[3, "g", "G"], [8, "v", "m"], [12, "O", "a"]]
  for (const [bu, c1, c2] of bundles) {
    const dv = 54 - v, dx = u - bu
    if (dv >= 1 && dv <= 2 && dx === 0) return "W"
    if (dv >= 3 && dv <= 11 && Math.abs(dx) <= Math.min(2, Math.floor((12 - dv) / 3) + (dv < 6 ? 1 : 0))) return dv === 3 ? "e" : (dx + dv) % 3 === 0 ? c2 : c1
  }
  return null
}, null, { noCap: true })
// wall sconce with a candle: animated flame (3 frames)
for (const side of ["l", "r"]) {
  const lit = side === "r", name = `iwall_sconce_${side}`
  anim(name, { w: 17, h: PH, frames: 3, fps: 6 }, (c) => {
    const at = (u, v, k) => { const col = lit ? 16 - u : u; c.px(col, gy(u) - v, k) }
    for (let v = 32; v < 36; v++) at(8, v, "a"); at(7, 33, "S"); at(9, 33, "S"); at(7, 34, "a"); at(9, 34, "a")
    at(8, 36, "C"); at(8, 37, "C"); at(8, 38, "c")
    const f = c.frame
    at(8, 39, "O"); at(8, 40, f === 1 ? "O" : "Y"); if (f !== 2) at(8, 41, "Y"); at(f === 1 ? 9 : 7, 40, "o")
    if (f === 0) at(8, 42, "O")
  })
  meta(name, { ax: lit ? ANCH_R[0] : ANCH_L[0], ay: ANCH_L[1], wall: side === "l" ? "nw" : "ne" })
}
