// Interior furniture & fixtures. Iso, light from the top-left: top faces lightest, left (SW) faces lit,
// right (SE) faces in cool shade, 1px ink outline. Anchor = footprint centre on the floor (like a tile
// centre); manifest `foot` = [tiles along x, tiles along y].
// Naming: `<thing>_l` stands against the LEFT/NW back wall (its front faces SE), `<thing>_r` against the
// RIGHT/NE back wall (front faces SW). Free-standing pieces have one name; draw them with flip:true for the
// mirrored orientation (footprint swaps).
include("_palette.px.js")
include("_iso.px.js")

// point b px back along the left edge (-x), a px back along the right edge (-y), z up, from the footprint front vertex
const P = (g, b, a, z = 0) => [g.fx - b + a, g.fy - b / 2 - a / 2 - z]
// sub-box: spans b0..b0+B back along x, a0..a0+A back along y, z0..z0+H
function box(c, g, b0, a0, B, A, z0, H, sh) { const [x, y] = P(g, b0, a0, z0); prism(c, x, y, A, B, H, sh) }
const woodSh = (seed = 1, ph = 4, top = ["W", "w", "s"]) => (f, u, v) => f === "T" ? woodTop(u, v, 4, seed, top) : woodFace(f === "L" ? "lit" : "mid", u, v, ph, seed)
const darkWoodSh = (seed = 1) => (f, u, v) => f === "T" ? woodTop(u, v, 4, seed, ["w", "D", "W"]) : woodFace(f === "L" ? "mid" : "dark", u, v, 4, seed)
const flat = (T, L, R) => ({ T, L, R })
// mirrored twin for wall-backed pieces: name_r drawn, name_l = mirror
function pair(name, o, draw) { furn(name + "_r", o, draw); furnFlip(name + "_l", name + "_r", o) }

// ================================================================ beds
// bed_l: headboard against the left (NW) wall, long side (2 tiles along x) facing the room.
furn("bed_l", { fw: 2, fd: 1, up: 26 }, (c, g) => {
  // legs + frame
  for (const [b, a] of [[0, 0], [0, 14], [30, 0]]) box(c, g, b, a, 2, 2, 0, 4, flat("D", "D", "d"))
  box(c, g, 0, 0, 32, 16, 3, 5, woodSh(4))
  // mattress
  box(c, g, 1, 1, 29, 14, 8, 3, flat("C", "q", "R"))
  // quilt: patchwork squares (top) draped over the sides with a scalloped hem
  const QC = ["l", "L", "v", "C", "p", "l"]
  box(c, g, 0, 0, 22, 16, 8, 5, (f, u, v) => {
    if (f === "T") {
      const qa = Math.floor(u / 4), qb = Math.floor(v / 4)
      if (u % 4 < 0.6 || v % 4 < 0.6) return "v"
      const k = QC[(qa * 2 + qb * 3) % QC.length]; return (u % 4 > 3 || v % 4 > 3) && k !== "v" ? SHADE1[k] || k : k
    }
    if (v < 1.2 && Math.floor(u) % 3 === 1) return null
    if (v < 1.5) return f === "L" ? "v" : "m"
    const k = QC[Math.floor(u / 4) % QC.length]
    return f === "L" ? k : SHADE1[k] || k
  })
  // pillow
  box(c, g, 23, 2, 6, 12, 11, 3, (f, u, v) => f === "T" ? (u < 2 ? "q" : "c") : f === "L" ? "C" : "q")
  // footboard + headboard
  box(c, g, 0, 0, 2, 16, 3, 13, woodSh(5))
  box(c, g, 30, 0, 2, 16, 3, 24, (f, u, v) => f === "T" ? "W" : f === "R" ? ((Math.floor(u) % 4 === 0) ? "d" : v > 18 ? "w" : "D") : woodFace("lit", u, v, 6, 7))
  const [hx, hy] = P(g, 30, 8, 21); c.px(hx, hy, "o"); c.px(hx - 1, hy + 1, "a")   // carved moon on the headboard
  const [fx2, fy2] = P(g, 0, 8, 13); c.px(fx2, fy2 - 1, "s")
})
furnFlip("bed_r", "bed_l", { fw: 2, fd: 1, up: 26 })

// ================================================================ tables, chairs, stools
function tableTop(c, g, B, A, z, items) {
  const legs = [[1, 1], [B - 3, 1], [1, A - 3], [B - 3, A - 3]].sort((p, q) => q[0] + q[1] - p[0] - p[1])
  for (const [b, a] of legs) box(c, g, b, a, 2, 2, 0, z - 2, flat("w", "w", "D"))
  box(c, g, 0, 0, B, A, z - 2, 2, (f, u, v) => f === "T" ? woodTop(u, v, 5, 3, ["W", "w", "s"]) : f === "L" ? (v > 1 ? "W" : "w") : "D")
  // apron under the top
  box(c, g, 1, 1, B - 2, A - 2, z - 4, 2, flat("w", "D", "d"))
  box(c, g, 0, 0, B, A, z - 2, 2, (f, u, v) => f === "T" ? woodTop(u, v, 5, 3, ["W", "w", "s"]) : f === "L" ? (v > 1 ? "s" : "w") : v > 1 ? "w" : "D")
  if (items) items()
}
furn("table", { fw: 1, fd: 1, up: 12 }, (c, g) => tableTop(c, g, 16, 16, 14))
furn("table_set", { fw: 1, fd: 1, up: 16 }, (c, g) => tableTop(c, g, 16, 16, 14, () => {
  // linen runner, bread loaf, cup, candle
  box(c, g, 3, 0, 6, 16, 14, 0.5, (f, u, v) => (Math.floor(u) % 5 === 0 ? "C" : "c"))
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 14); c.grid(x, y - s.split("\n").length, s) }
  at(4, 10, ".WW.\nWsWW\nwWWw")
  at(11, 4, "Bi\nBB")
  at(8, 6, ".Y\n.O\n.c\n.c\nrC")
}))
furn("table_long", { fw: 2, fd: 1, up: 16 }, (c, g) => tableTop(c, g, 32, 16, 14, () => {
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 14); c.grid(x, y - s.split("\n").length, s) }
  at(6, 10, "rRRr\n.SS.")            // bowl
  at(13, 4, ".C.\nCcC\n.C.")          // plate
  at(20, 9, ".Y\n.O\n.c\nac")         // candle
  at(25, 3, "ff.\nfpf\n.e.")          // apples
}))
// round table: drum pedestal with a round top (ellipse), for the herbalist/elder
furn("table_round", { fw: 1, fd: 1, up: 12 }, (c, g) => {
  const cx = Math.round(g.cx), cy = Math.round(g.cy)
  c.rect(cx - 2, cy - 12, 4, 12, "w"); c.vline(cx - 2, cy - 12, 12, "W"); c.vline(cx + 1, cy - 12, 12, "D")
  c.ellipse(cx, cy, 6, 2, "D"); c.ellipse(cx, cy - 1, 5, 1, "w")
  c.ellipse(cx, cy - 13, 11, 5, "D"); c.ellipse(cx, cy - 14, 11, 5, "W"); c.ellipse(cx - 1, cy - 15, 8, 3, "s")
  c.hline(cx - 6, cy - 16, 6, "c"); c.ellipse(cx + 3, cy - 14, 2, 1, "W")
})

// chairs: seat 8x8 px, back rest on the far side. chair_sw faces SW (back on the NE side), chair_nw faces NW (back toward the viewer).
function chair(c, g, back) {
  const S = 9
  const legs = [[0.5, 0.5], [6, 0.5], [0.5, 6], [6, 6]].sort((p, q) => q[0] + q[1] - p[0] - p[1])
  const drawBack = () => {
    if (back === "ne") { for (const b of [0.5, 6]) box(c, g, b, 6.5, 1.5, 1.5, S, 12, flat("W", "w", "D")); box(c, g, 0, 6.5, 8, 1.5, S + 5, 2, flat("W", "w", "D")); box(c, g, 0, 6.5, 8, 1.5, S + 10, 3, flat("s", "W", "w")) }
    else { for (const a of [0.5, 6]) box(c, g, 0, a, 1.5, 1.5, S, 12, flat("W", "w", "D")); box(c, g, 0, 0, 1.5, 8, S + 5, 2, flat("W", "w", "D")); box(c, g, 0, 0, 1.5, 8, S + 10, 3, flat("s", "W", "w")) }
  }
  if (back === "ne") drawBack()
  for (const [b, a] of legs) box(c, g, b, a, 1.5, 1.5, 0, S - 1, flat("w", "w", "D"))
  box(c, g, 0, 0, 8, 8, S - 2, 2, (f, u, v) => f === "T" ? (u + v < 4 ? "s" : "W") : f === "L" ? "w" : "D")
  if (back === "nw") drawBack()
}
furn("chair_sw", { fw: 0.5, fd: 0.5, up: 22 }, (c, g) => chair(c, g, "ne"))
furnFlip("chair_se", "chair_sw", { fw: 0.5, fd: 0.5, up: 22 })
furn("chair_ne", { fw: 0.5, fd: 0.5, up: 22 }, (c, g) => chair(c, g, "nw"))   // seen from behind: faces NE (away), back toward the viewer-left
furnFlip("chair_nw", "chair_ne", { fw: 0.5, fd: 0.5, up: 22 })
furn("stool", { fw: 0.5, fd: 0.5, up: 8 }, (c, g) => {
  for (const [b, a] of [[5.5, 5.5], [5.5, 1], [1, 5.5], [1, 1]]) box(c, g, b, a, 1.5, 1.5, 0, 8, flat("w", "w", "D"))
  box(c, g, 0, 0, 8, 8, 2, 1, flat("D", "D", "d"))           // stretcher
  const cx = Math.round(g.cx), cy = Math.round(g.cy) - 9
  c.ellipse(cx, cy, 5, 2, "w"); c.ellipse(cx, cy - 1, 5, 2, "W"); c.hline(cx - 3, cy - 2, 3, "s")
})
// bench for interiors (the exterior `bench` is in props)
furn("bench_in", { fw: 2, fd: 0.5, up: 8 }, (c, g) => {
  for (const b of [27, 2]) box(c, g, b, 1, 2, 6, 0, 7, flat("w", "w", "D"))
  box(c, g, 0, 0, 32, 8, 7, 2, (f, u, v) => f === "T" ? woodTop(u, v, 4, 9) : f === "L" ? (v > 1 ? "s" : "w") : "D")
})

// ================================================================ storage
// bookcase_r: against the NE wall, front (lit SW face) shows four shelves of books
const BOOK = ["e", "b", "G", "m", "a", "t", "f", "D", "v", "u"]
function booksOn(f, u, v, sh, seed, gapOk) {
  const rows = [3, 14, 25, 36], top = 45
  if (v >= top) return null
  for (const r of rows) {
    if (v >= r - 1 && v < r) return "d"                                  // shelf board
    if (v >= r && v < r + 10) {
      const bi = Math.floor((u + r) / 2), h = 6 + Math.floor(hash(bi, r, seed) * 4)
      if (gapOk && hash(bi, r, seed + 1) < 0.12) return v - r < 2 ? "j" : "k"
      if (v - r >= h) return v - r === h ? "k" : "j"
      const k = BOOK[Math.floor(hash(bi, r, seed + 2) * BOOK.length)]
      if (Math.floor(u + r) % 2 === 1) return SHADE1[k] || k
      return v - r === h - 2 ? LIGHT1[k] || k : k
    }
  }
  return "j"
}
pair("bookcase", { fw: 1, fd: 0.5, up: 48 }, (c, g) => {
  box(c, g, 0, 0, 16, 8, 0, 47, (f, u, v) => {
    if (f === "T") return v < 1 || v > 15 ? "w" : "W"
    if (f === "R") return v > 45 ? "w" : "D"
    if (u < 1.5 || u > 14.5 || v < 2 || v > 45) return v > 45 ? "W" : u < 1.5 ? "W" : "w"   // carcass edges
    return booksOn(f, u, v, 0, 3, true)
  })
  const [x, y] = P(g, 15, 0, 47); c.hline(x - 1, y - 1, 3, "W")          // crown
})
pair("shelves", { fw: 1, fd: 0.5, up: 42 }, (c, g) => {
  box(c, g, 0, 0, 16, 8, 0, 40, (f, u, v) => {
    if (f === "T") return "W"
    if (f === "R") return "D"
    if (u < 1.5 || u > 14.5) return u < 1.5 ? "W" : "w"
    if (v < 2 || v > 38) return "w"
    for (const r of [2, 14, 26]) if (v >= r && v < r + 1) return "d"
    return "j"
  })
  // jars, crocks, folded cloth, a basket — on the three shelves
  const put = (b, z, s) => { const [x, y] = P(g, b, 0, z); const rows = s.split("\n"); c.grid(x - 1, y - rows.length + 1, s) }
  put(13, 3, ".a.\nBiB\nBBB\nbBb"); put(9, 3, "WWW\nwWw\nwww"); put(5, 3, ".r.\nRqR\nRRR\nrRr")
  put(13, 15, "lLl\nvlv"); put(9, 15, ".c.\nCcC\nCCC\nqCq"); put(5, 15, "O.O\nOOO\naoa")
  put(13, 27, ".S.\nrRr\nrrr"); put(8, 27, "hgh\nGgG\nwWw"); put(4, 27, "ee\npe\nee")
})
pair("potion_shelf", { fw: 1, fd: 0.5, up: 40 }, (c, g) => {
  box(c, g, 0, 0, 16, 8, 0, 38, (f, u, v) => {
    if (f === "T") return "W"; if (f === "R") return "D"
    if (u < 1.5 || u > 14.5) return u < 1.5 ? "W" : "w"
    if (v < 2 || v > 36) return "w"
    for (const r of [2, 13, 24]) if (v >= r && v < r + 1) return "d"
    return "j"
  })
  const bottle = (b, z, col, tall) => {
    const [x, y] = P(g, b, 0, z), lit = LIGHT1[col] || col
    c.px(x, y - (tall ? 6 : 5), "a"); c.px(x, y - (tall ? 5 : 4), "C"); if (tall) c.px(x, y - 4, "C")
    c.rect(x - 1, y - 3, 3, 3, col); c.px(x - 1, y - 3, lit); c.px(x - 1, y - 2, "c"); c.px(x + 1, y - 1, SHADE1[col] || col)
  }
  ;[[13, "f", 1], [10, "z", 0], [7, "B", 1], [4, "O", 0]].forEach(([b, k, t]) => bottle(b, 3, k, t))
  ;[[13, "l", 0], [10, "E", 1], [6, "h", 0], [3, "p", 1]].forEach(([b, k, t]) => bottle(b, 14, k, t))
  ;[[13, "i", 1], [9, "X", 0], [5, "o", 1]].forEach(([b, k, t]) => bottle(b, 25, k, t))
})
pair("wardrobe", { fw: 1, fd: 0.75, up: 52 }, (c, g) => {
  box(c, g, 0, 0, 16, 12, 0, 3, flat("d", "D", "d"))                       // plinth
  box(c, g, 0, 0, 16, 12, 3, 44, (f, u, v) => {
    if (f === "T") return "w"
    if (f === "R") return panelFace("dark", u, v, 12, 44, 12, [3, 3])
    if (u < 1 || u > 15) return u < 1 ? "W" : "D"
    if (Math.floor(u) === 8) return "d"                                    // door split
    const pu = u < 8 ? u - 1 : u - 9
    if (v < 2 || v > 41 || pu < 1 || pu > 5.8) return "w"
    if (v > 22 && v < 24) return "w"
    if (pu < 1.8 || v > 40 || (v > 21 && v < 25)) return "W"               // bevel
    if ((Math.floor(u) === 6 || Math.floor(u) === 10) && v > 19 && v < 23) return "O"   // handles
    return "D"
  })
  box(c, g, -0.5, -0.5, 17, 13, 47, 3, flat("W", "w", "D"))               // cornice
  const [x, y] = P(g, 8, 0, 49); c.grid(x - 2, y - 2, ".o.\noOo")         // carved crest
})
// chests: fw 0.75 x fd 0.5, front (lit SW face) with iron bands and a brass lock
function chestBody(c, g) {
  box(c, g, 0, 0, 12, 8, 0, 7, (f, u, v) => {
    if (f === "T") return "w"
    if (Math.floor(u) === 2 || Math.floor(u) === 9) return f === "L" ? "r" : "S"
    if (v < 1) return "d"
    return woodFace(f === "L" ? "lit" : "mid", u, v, 3, 6)
  })
}
furn("chest", { fw: 0.75, fd: 0.5, up: 10 }, (c, g) => {
  chestBody(c, g)
  box(c, g, 0, 0, 12, 8, 7, 3, (f, u, v) => {
    if (f === "T") return Math.floor(v) === 2 || Math.floor(v) === 9 ? "R" : v > 6 ? "W" : "w"
    if (Math.floor(u) === 2 || Math.floor(u) === 9) return f === "L" ? "R" : "r"
    return f === "L" ? (v > 1.5 ? "W" : "w") : "D"
  })
  const [x, y] = P(g, 6, 0, 7); c.px(x, y, "O"); c.px(x, y + 1, "a"); c.px(x, y - 1, "o")
})
// open chest: lid swung back (standing up behind), contents glinting
function chestOpen(c, g, lidH, glint) {
  box(c, g, 0, 6, 12, 2, 7, lidH, (f, u, v) => f === "L" ? (Math.floor(u) === 2 || Math.floor(u) === 9 ? "r" : v > lidH - 1 ? "W" : "D") : f === "T" ? "W" : "d")
  chestBody(c, g)
  box(c, g, 1, 1, 10, 6, 6.5, 0.5, (f, u, v) => (hash(Math.floor(u), Math.floor(v), 3) < 0.35 ? "O" : hash(Math.floor(u), Math.floor(v), 4) < 0.3 ? "l" : "D"))
  if (glint) { const [x, y] = P(g, 5, 3, 7); c.px(x, y - 1, "Y"); c.px(x, y - 2, "c") }
}
furn("chest_open", { fw: 0.75, fd: 0.5, up: 14 }, (c, g) => chestOpen(c, g, 9, true))
// closed -> ajar -> open, plays once and holds
furn("chest_opening", { fw: 0.75, fd: 0.5, up: 14, frames: 3, fps: 8, loop: false }, (c, g) => {
  if (c.frame === 2) return chestOpen(c, g, 9, true)
  chestBody(c, g)
  const lift = c.frame === 1 ? 3 : 0
  if (lift) box(c, g, 1, 1, 10, 6, 6.5, 0.5, flat("O", "O", "O"))
  box(c, g, 0, lift ? 2 : 0, 12, lift ? 6 : 8, 7 + lift, 3, (f, u, v) => {
    if (f === "T") return Math.floor(v) === 2 || Math.floor(v) === 9 ? "R" : v > 6 ? "W" : "w"
    if (Math.floor(u) === 2 || Math.floor(u) === 9) return f === "L" ? "R" : "r"
    return f === "L" ? (v > 1.5 ? "W" : "w") : "D"
  })
  if (lift) { const [x, y] = P(g, 6, 0, 8); c.px(x, y, "Y"); c.px(x + 1, y, "O") }
  else { const [x, y] = P(g, 6, 0, 7); c.px(x, y, "O"); c.px(x, y + 1, "a"); c.px(x, y - 1, "o") }
})
furn("barrel_apples", { fw: 0.75, fd: 0.75, up: 8 }, (c, g) => barrelIn(c, g, "apples"))
furn("barrel_water", { fw: 0.75, fd: 0.75, up: 8 }, (c, g) => barrelIn(c, g, "water"))
function barrelIn(c, g, kind) {
  const cx = Math.round(g.cx), by = Math.round(g.cy) + 3
  c.rect(cx - 6, by - 14, 13, 13, "w"); c.rect(cx - 5, by - 15, 11, 15, "w")
  c.vline(cx - 5, by - 14, 13, "W"); c.vline(cx - 4, by - 15, 15, "W"); c.vline(cx + 4, by - 15, 15, "D"); c.vline(cx + 5, by - 14, 13, "D"); c.vline(cx + 6, by - 13, 11, "d")
  c.vline(cx - 1, by - 14, 14, "D"); c.vline(cx + 2, by - 14, 14, "D")
  for (const y of [by - 12, by - 4]) { c.hline(cx - 6, y, 13, "r"); c.hline(cx + 3, y, 4, "S"); c.px(cx - 5, y, "R") }
  c.ellipse(cx, by - 15, 6, 2, "D")
  if (kind === "water") { c.ellipse(cx, by - 15, 5, 1, "b"); c.hline(cx - 2, by - 15, 3, "B"); c.px(cx - 3, by - 16, "i") }
  else { c.ellipse(cx, by - 16, 5, 2, "f"); c.grid(cx - 4, by - 18, ".fp.f\nfpffe\nffeff"); c.px(cx + 2, by - 18, "G") }
}
furn("crate_open", { fw: 1, fd: 1, up: 6 }, (c, g) => {
  box(c, g, 2, 2, 12, 12, 0, 9, (f, u, v) => f === "T" ? "d" : (Math.floor(v) === 4 ? (f === "L" ? "w" : "d") : f === "L" ? woodFace("lit", u, v, 3, 2) : woodFace("mid", u, v, 3, 2)))
  // turnips + carrots heaped inside
  const [x, y] = P(g, 8, 8, 9)
  c.grid(x - 5, y - 4, "..g.h...\n.ggG.ge.\nCpCcEeE.\npCCcEEe.\n.pCCEe..")
  c.grid(x - 1, y - 6, ".h\nhg")
})
furn("sack_pile", { fw: 1, fd: 1, up: 14 }, (c, g) => {
  // three burlap sacks: tied necks, rounded bellies, a stencilled moon, flour spilling from the front one
  const sack = (x, y, lit, tag) => {
    const L = lit ? "s" : "W", M = lit ? "W" : "w", D = lit ? "w" : "D"
    c.ellipse(x, y - 5, 6, 5, M); c.ellipse(x - 1, y - 6, 4, 3, L); c.rect(x - 6, y - 4, 13, 4, M); c.hline(x - 5, y, 11, D)
    c.vline(x + 5, y - 7, 7, D); c.vline(x + 6, y - 5, 5, D); c.vline(x + 4, y - 9, 3, D)
    c.rect(x - 2, y - 12, 4, 3, M); c.hline(x - 2, y - 10, 4, "e"); c.px(x - 1, y - 13, L); c.px(x + 1, y - 13, D); c.px(x - 3, y - 12, L)
    c.line(x - 5, y - 3, x - 2, y - 1, D)                                    // a fold
    if (tag) { c.px(x - 1, y - 5, "a"); c.px(x, y - 4, "a"); c.px(x, y - 6, "a") }
  }
  const cx = Math.round(g.cx), cy = Math.round(g.cy) + 3
  sack(cx + 5, cy - 6, false, false); sack(cx - 5, cy - 4, true, true); sack(cx + 2, cy, true, false)
  c.grid(cx - 4, cy - 1, ".CC\nCcCC\n.C.c")                                  // spilled flour
})
// ================================================================ hearth, stove, cauldron (animated)
function flames(c, x, y, w, h, phase, cols = ["E", "O", "Y"]) {
  const k = phase * TAU
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1), hh = Math.max(1, Math.round(h * (0.55 + 0.45 * Math.sin(t * Math.PI)) + Math.sin(k + i * 1.7) * 1.6))
    for (let j = 0; j < hh; j++) c.px(x + i, y - j, j > hh * 0.6 ? cols[0] : j > hh * 0.25 ? cols[1] : cols[2])
    if (hh > 2 && (i + Math.floor(phase * 4)) % 3 === 0) c.px(x + i, y - hh, cols[0])
  }
}
// hearth_r: stone fireplace 2 tiles wide against the NE wall; chimney breast rises to the wall top (64 px)
pair("hearth", { fw: 2, fd: 0.75, up: 64, frames: 4, fps: 8 }, (c, g) => {
  const stone = (f, u, v) => {
    if (f === "T") return "R"
    const row = Math.floor(v / 5), off = row % 2 ? 3 : 0
    if (v % 5 < 1 || (Math.floor(u) + off) % 7 === 0) return f === "L" ? "r" : "S"
    const h = hash(Math.floor((u + off) / 7), row, 5)
    return f === "L" ? (h < 0.3 ? "q" : "R") : h < 0.3 ? "R" : "r"
  }
  box(c, g, 4, 4, 24, 8, 26, 38, stone)                                     // chimney breast
  box(c, g, 0, 0, 32, 12, 0, 26, (f, u, v) => {
    if (f !== "L") return stone(f, u, v)
    if (u > 8 && u < 24 && v < 17) {                                        // firebox opening
      if (v > 15 || u < 10 || u > 22) return "S"
      return v > 13 ? "k" : "x"
    }
    return stone(f, u, v)
  })
  box(c, g, -1, -1, 34, 14, 24, 3, flat("w", "W", "D"))                     // oak mantel
  // fire: logs + flames inside the opening (left face plane)
  const fx0 = g.fx - 23, base = (u) => Math.round(g.fy - (32 - u) / 2) - 1
  for (let u = 11; u < 22; u++) { const y = Math.round(g.fy - u / 2) - 2; c.px(g.fx - 32 + u, y, "D"); c.px(g.fx - 32 + u, y - 1, u % 3 ? "d" : "e") }
  for (let u = 11; u < 22; u++) {
    const x = g.fx - 32 + u, y = Math.round(g.fy - u / 2) - 3, k = c.phase * TAU
    const h = Math.max(1, Math.round(5 + 3 * Math.sin((u - 11) / 10 * Math.PI) + Math.sin(k + u * 1.9) * 1.5))
    for (let j = 0; j < h; j++) c.px(x, y - j, j > h * 0.65 ? "E" : j > h * 0.3 ? "O" : "Y")
  }
  void fx0; void base
  // mantel things: candle, jar, small moon carving
  const at = (b, s) => { const [x, y] = P(g, b, 4, 27); const r = s.split("\n"); c.grid(x, y - r.length, s) }
  at(26, ".Y\n.O\n.c\n.c\nac"); at(8, "BiB\nBBB\nbBb"); at(18, "C.\nCC\nqC")
  // ember glow on the hearthstone
  const [ex, ey] = P(g, 16, 0, 0); if (c.frame % 2 === 0) { c.px(ex - 1, ey - 1, "E") } else c.px(ex + 1, ey - 1, "o")
})
pair("stove", { fw: 1, fd: 0.75, up: 64, frames: 3, fps: 6 }, (c, g) => {
  // stove pipe up to the ceiling
  box(c, g, 6, 6, 4, 4, 18, 46, (f, u, v) => (Math.floor(v) % 12 === 0 ? "R" : f === "L" ? "r" : f === "R" ? "S" : "S"))
  for (const [b, a] of [[1, 1], [13, 1], [1, 9], [13, 9]].sort((p, q) => q[0] + q[1] - p[0] - p[1])) box(c, g, b, a, 2, 2, 0, 4, flat("S", "S", "j"))
  box(c, g, 0, 0, 16, 12, 4, 14, (f, u, v) => {
    if (f === "T") return u < 3 || v < 2 ? "r" : ((Math.round(u - 6) ** 2 + Math.round(v - 8) ** 2 < 10) ? "j" : "S")
    if (f === "L" && u > 4 && u < 12 && v > 3 && v < 10) {                 // grate door with a glow
      if (u < 5 || u > 11 || v < 4 || v > 9) return "j"
      const glow = c.frame === 1 ? "O" : "E"
      return Math.floor(u) % 2 === 0 ? "k" : v < 6 ? glow : "e"
    }
    if (v > 12.5) return f === "L" ? "R" : "r"
    return f === "L" ? (u < 1.5 ? "r" : "S") : "j"
  })
  const [kx, ky] = P(g, 4, 4, 18); c.grid(kx - 3, ky - 5, "..rr..\n.r..r.\nrRRrrS\nRrrrSS\n.rSSS.")   // kettle
  if (c.frame !== 2) { c.px(kx + 3, ky - 7 - c.frame, "L"); c.px(kx + 4, ky - 9 - c.frame, "l") }
})
furn("cauldron_big", { fw: 1, fd: 1, up: 20, frames: 6, fps: 7 }, (c, g) => {
  const cx = Math.round(g.cx), cy = Math.round(g.cy) + 2
  // stone fire ring + embers
  c.ellipse(cx, cy, 13, 5, "S"); c.ellipse(cx, cy - 1, 12, 4, "r")
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, x = Math.round(cx + Math.cos(a) * 11), y = Math.round(cy - 1 + Math.sin(a) * 4); c.px(x, y, i % 2 ? "R" : "q"); c.px(x + 1, y, "r") }
  c.ellipse(cx, cy - 1, 8, 3, "d"); c.ellipse(cx, cy - 1, 6, 2, "e"); c.line(cx - 7, cy, cx + 5, cy - 3, "D"); c.line(cx - 5, cy - 3, cx + 7, cy, "w")
  const k = c.phase * TAU
  for (let i = 0; i < 12; i++) { const x = cx - 6 + i, h = 2 + Math.round(2 + Math.sin(k + i) * 1.5); for (let j = 0; j < h; j++) c.px(x, cy - 1 - j, j > h - 2 ? "E" : j > 1 ? "O" : "Y") }
  // pot: iron belly with a rolled rim, three stubby feet
  c.ellipse(cx, cy - 11, 11, 8, "j"); c.ellipse(cx - 1, cy - 12, 10, 7, "S"); c.ellipse(cx - 3, cy - 13, 6, 4, "r"); c.ellipse(cx - 5, cy - 14, 2, 1, "R"); c.px(cx - 7, cy - 14, "q")
  c.hline(cx - 9, cy - 8, 3, "r"); c.hline(cx + 6, cy - 6, 3, "t")
  c.ellipse(cx, cy - 18, 11, 3, "r"); c.hline(cx - 10, cy - 19, 13, "R"); c.ellipse(cx, cy - 18, 9, 2, "k")
  // brew: mint surface that heaves, bubbles that rise and pop
  c.ellipse(cx, cy - 18, 8, 1, "z"); c.hline(cx - 5 + (c.frame % 3), cy - 18, 4, "c")
  const bub = [[-4, 0], [2, 1], [5, 3], [-1, 4]]
  for (const [bx, ph] of bub) {
    const t = (c.frame + ph) % 6
    if (t < 3) c.px(cx + bx, cy - 19 - t, t === 2 ? "i" : "z")
    if (t === 3) { c.px(cx + bx - 1, cy - 21, "i"); c.px(cx + bx + 1, cy - 21, "i") }
  }
  // steam wisps
  for (let q = 0; q < 2; q++) { const t = ((c.frame + q * 3) % 6) / 6, x = cx - 3 + q * 6 + Math.round(Math.sin((t + q) * TAU)), y = cy - 23 - Math.round(t * 8); c.px(x, y, "L"); if (t < 0.6) c.px(x + 1, y, "L") }
  for (const dx of [-8, 8]) c.px(cx + dx, cy - 4, "j")
})

// ================================================================ counters, workbench, desk, alchemy
furn("counter", { fw: 2, fd: 0.75, up: 22 }, (c, g) => {
  box(c, g, 0, 0, 32, 12, 0, 16, (f, u, v) => {
    if (f === "T") return "W"
    if (v < 1.5) return "d"
    return vBoards(f === "L" ? "lit" : "mid", u, v, 16, 4)
  })
  box(c, g, -1, -1, 34, 14, 16, 2, (f, u, v) => f === "T" ? woodTop(u, v, 4, 2, ["W", "w", "s"]) : f === "L" ? "W" : "D")   // overhanging top
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 18); const r = s.split("\n"); c.grid(x - 1, y - r.length, s) }
  at(27, 6, "...a...\n..aOa..\n.a.a.a.\nrr.a.rr\n.SSSSS.")    // brass scale
  at(17, 5, "llll\nlCCl\nvvvv")                                   // ledger
  at(9, 7, ".O.\nOYO\naaa")                                       // coin dish
  at(4, 4, "iBi\nBBB\nbBb")                                       // sweets jar
})
furn("counter_stall", { fw: 2, fd: 1, up: 20 }, (c, g) => {
  box(c, g, 0, 0, 32, 16, 0, 13, (f, u, v) => {
    if (f === "T") return "W"
    if (v < 1.5) return "d"
    if (f === "L" && v > 3 && v < 11) return Math.floor(u / 4) % 2 ? "l" : "c"    // striped cloth skirt
    return woodFace(f === "L" ? "lit" : "mid", u, v, 4, 3)
  })
  // produce trays
  const tray = (b, a, k1, k2) => { box(c, g, b, a, 9, 7, 13, 2, flat("w", "D", "d")); const [x, y] = P(g, b + 4.5, a + 3.5, 15); c.grid(x - 3, y - 3, `.${k1}${k2}${k1}.\n${k1}${k2}${k1}${k2}${k1}\n.${k1}${k1}${k2}.`) }
  tray(22, 6, "O", "o"); tray(12, 6, "f", "p"); tray(2, 6, "h", "g"); tray(12, -1 + 1, "i", "B")
})
furn("workbench", { fw: 2, fd: 0.75, up: 20 }, (c, g) => {
  for (const [b, a] of [[30, 9], [30, 1], [1, 9], [1, 1]]) box(c, g, b, a, 2, 2, 0, 13, flat("w", "w", "D"))
  box(c, g, 1, 1, 30, 10, 4, 1.5, flat("D", "D", "d"))                       // lower shelf
  box(c, g, 0, 0, 32, 12, 13, 3, (f, u, v) => f === "T" ? woodTop(u, v, 3, 5, ["W", "w", "s"]) : f === "L" ? (v > 2 ? "s" : "W") : "D")
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 16); const r = s.split("\n"); c.grid(x - 1, y - r.length, s) }
  at(28, 4, "SSS\nS.S\nrSr\n.r.")                      // vise
  at(19, 6, "...S\n..S.\nwwS.\nww..")                   // hammer
  at(12, 4, "WWWWW\nwwwww")                              // plank offcut
  at(5, 7, "W.W\n.W.")                                   // shavings
  const [x, y] = P(g, 10, 0, 6); c.grid(x - 2, y - 3, "ss.\nsWs\n.s.")   // shavings on the shelf
})
furn("loom", { fw: 1.5, fd: 0.75, up: 30 }, (c, g) => {
  // two A-frames joined by beams; warp threads from top beam to cloth beam; woven lavender cloth
  for (const b of [22, 1]) { box(c, g, b, 1, 2, 10, 0, 2, flat("w", "w", "D")); box(c, g, b, 5, 2, 2, 0, 34, flat("W", "w", "D")) }
  box(c, g, 0, 5, 24, 2, 32, 2, flat("W", "w", "D"))                          // top beam
  box(c, g, 0, 5, 24, 2, 12, 2, flat("W", "w", "D"))                          // breast beam
  for (let b = 3; b < 22; b++) {
    const [x, y] = P(g, b, 6, 14)
    for (let z = 0; z < 18; z++) {
      const yy = y - z
      if (z < 9) c.px(x, yy, (b + z) % 2 ? "l" : "v")                          // woven cloth with a twill
      else if (z === 9) c.px(x, yy, "L")
      else if (b % 2) c.px(x, yy, "C")                                          // warp threads
    }
  }
  const [sx, sy] = P(g, 12, 6, 24); c.grid(sx - 3, sy, "WWWWWW\n.aaaa.")   // shuttle
})
pair("desk", { fw: 1, fd: 0.75, up: 22 }, (c, g) => {
  box(c, g, 1, 1, 14, 10, 0, 13, (f, u, v) => {
    if (f === "T") return "D"
    if (f === "L") { if (Math.floor(u) === 7 && Math.floor(v) === 9) return "O"; return panelFace("mid", u, v, 14, 13, 7, [2, 2]) }
    return panelFace("dark", u, v, 10, 13, 10, [1, 1])
  })
  box(c, g, 0, 0, 16, 12, 13, 2, (f, u, v) => f === "T" ? woodTop(u, v, 4, 6, ["w", "D", "W"]) : f === "L" ? "W" : "D")
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 15); const r = s.split("\n"); c.grid(x - 1, y - r.length, s) }
  at(12, 4, "CCcC.\nCcCCq\n.qqq.")                       // open book
  at(5, 8, ".C\nCq")                                       // letters
  at(4, 3, "...c\n..c.\n.c..\nk...\nS...")                // quill + ink pot
  at(14, 9, ".Y\n.O\n.c\nac")                              // candle
})
pair("alchemy_bench", { fw: 2, fd: 0.75, up: 32 }, (c, g) => {
  box(c, g, 0, 0, 32, 12, 0, 14, (f, u, v) => {
    if (f === "T") return "D"
    if (v < 1.5) return "d"
    if (f === "L" && Math.floor(v) === 10 && Math.floor(u) % 8 === 4) return "O"     // drawer pulls
    return f === "L" ? panelFace("mid", u, v, 32, 14, 8, [2, 3]) : panelFace("dark", u, v, 12, 14, 12, [1, 1])
  })
  box(c, g, 0, 0, 32, 12, 14, 2, (f, u, v) => f === "T" ? woodTop(u, v, 4, 7, ["w", "D", "W"]) : f === "L" ? "W" : "D")
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 16); const r = s.split("\n"); c.grid(x - 1, y - r.length, s) }
  at(28, 5, "...S...\n..SrS..\n...r...\n...r...\n..BiB..\n.BzzzB.\n.BzczB.\n.BzzzB.\n..BBB..\n.Saaa..\nSE.O.E.")   // alembic over a burner
  at(21, 6, "..i.\n..i.\n.ii.\niiBB\nBffB\nBffB\n.BB.")     // retort flask, red tincture
  at(14, 4, "r.\nRr.\nRRr\n.SS")                            // mortar + pestle
  at(9, 7, ".c.\nlLl\nlvl")                                  // lavender jar
  at(4, 4, "h.g.\nGhgG\n.GG.")                               // herb sprigs
})

// ================================================================ herbs, plants
furn("herb_rack", { fw: 1, fd: 0.5, up: 30 }, (c, g) => {
  for (const b of [14, 1]) box(c, g, b, 3, 1.5, 2, 0, 30, flat("W", "w", "D"))
  for (const z of [28, 18]) box(c, g, 0, 3.5, 16, 1, z, 1, flat("W", "w", "D"))
  const bundle = (b, z, k1, k2) => {
    const [x, y] = P(g, b, 4, z)
    c.px(x, y + 1, "W"); c.px(x, y + 2, "e")
    for (let j = 0; j < 7; j++) { const w = j < 2 ? 1 : j < 5 ? 2 : 1; for (let dx = -w; dx <= w; dx++) c.px(x + dx, y + 3 + j, (dx + j) % 3 === 0 ? k2 : k1) }
  }
  bundle(12, 27, "g", "G"); bundle(8, 27, "v", "m"); bundle(4, 27, "h", "g")
  bundle(12, 17, "O", "a"); bundle(8, 17, "p", "E"); bundle(4, 17, "H", "h")
})
// hanging bundle cluster (hook anchor: draw at the ceiling/beam point it hangs from)
sprite("herbs_hanging", { w: 15, h: 18, outline: "k" }, (c) => {
  c.vline(7, 0, 3, "W"); c.hline(2, 3, 11, "a")
  const bundle = (x, len, k1, k2) => { c.vline(x, 4, 2, "W"); c.px(x, 6, "e"); for (let j = 0; j < len; j++) { const w = j < 2 ? 1 : j < len - 2 ? 2 : 1; for (let dx = -w; dx <= w; dx++) c.px(x + dx, 7 + j, (dx + j) % 3 === 0 ? k2 : k1) } }
  bundle(4, 8, "g", "G"); bundle(10, 9, "v", "m"); bundle(7, 6, "O", "a")
})
meta("herbs_hanging", { ax: 8, ay: 1, hook: true })
furn("plant_pot", { fw: 0.5, fd: 0.5, up: 16 }, (c, g) => {
  const cx = Math.round(g.cx), cy = Math.round(g.cy) + 2
  c.poly([cx - 4, cy - 7, cx + 4, cy - 7, cx + 3, cy, cx - 3, cy], "E"); c.poly([cx + 1, cy - 7, cx + 4, cy - 7, cx + 3, cy, cx + 1, cy], "e"); c.hline(cx - 5, cy - 8, 10, "p"); c.hline(cx - 5, cy - 7, 10, "E")
  // fern fronds
  c.grid(cx - 7, cy - 18, "......h......\n...h..g..h...\n..hg..g.gG...\n.hg.hggg.Gg..\nhg..hgGgg.Gg.\ng..hg.g.G..G.\n..g..gGg.G...\n....gGGG.....\n.....GGG.....")
})
furn("plant_flower", { fw: 0.5, fd: 0.5, up: 14 }, (c, g) => {
  const cx = Math.round(g.cx), cy = Math.round(g.cy) + 2
  c.rect(cx - 3, cy - 6, 7, 6, "W"); c.rect(cx + 1, cy - 6, 3, 6, "w"); c.hline(cx - 4, cy - 7, 9, "s"); c.hline(cx - 3, cy - 3, 7, "e")
  c.grid(cx - 5, cy - 15, "..p.l.f..\n.pYp.lLl.\n..p.g.l..\n.g.ggg.g.\nGg.gGg.gG\n.GgGgGgG.\n..GgGgG..")
})
furn("plant_tall", { fw: 0.5, fd: 0.5, up: 28 }, (c, g) => {
  const cx = Math.round(g.cx), cy = Math.round(g.cy) + 2
  c.rect(cx - 4, cy - 8, 9, 8, "r"); c.rect(cx + 1, cy - 8, 4, 8, "S"); c.hline(cx - 5, cy - 9, 11, "R"); c.hline(cx - 4, cy - 4, 9, "S"); c.px(cx - 3, cy - 7, "q")
  c.vline(cx, cy - 22, 13, "D")
  const leaf = (x, y, dir) => c.grid(x, y, dir ? ".hh.\nhhgG\n.gG." : ".hh.\nGghh\n.Gg.")
  leaf(cx - 5, cy - 14, 0); leaf(cx + 1, cy - 18, 1); leaf(cx - 5, cy - 21, 0); leaf(cx + 1, cy - 24, 1); leaf(cx - 2, cy - 27, 0)
  c.grid(cx - 1, cy - 12, "Gg\n.G")
})

// ================================================================ lights (animated flicker)
anim("candle", { w: 5, h: 12, frames: 4, fps: 6, outline: "k" }, (c) => {
  c.rect(1, 6, 3, 5, "C"); c.vline(1, 6, 5, "c"); c.vline(3, 6, 5, "q"); c.hline(0, 11, 5, "a"); c.px(2, 5, "k")
  const f = c.frame, dx = [0, 0, -1, 1][f]
  c.px(2, 4, "O"); c.px(2 + dx, 3, f === 1 ? "O" : "Y"); c.px(2, 2 - (f === 3 ? 0 : 0), f === 2 ? "O" : "Y"); if (f !== 1) c.px(2 + dx, 1, "O")
  c.px(1, 7, "c"); if (f === 0) c.px(3, 8, "C")
})
anim("candles_cluster", { w: 11, h: 13, frames: 4, fps: 6, outline: "k" }, (c) => {
  const stub = (x, top, ph) => {
    c.rect(x, top, 3, 12 - top, "C"); c.vline(x, top, 12 - top, "c"); c.vline(x + 2, top, 12 - top, "q"); c.px(x + 1, top - 1, "k")
    const f = (c.frame + ph) % 4; c.px(x + 1, top - 2, "O"); c.px(x + 1 + [0, 0, -1, 1][f], top - 3, f === 1 ? "O" : "Y"); if (f % 2 === 0) c.px(x + 1, top - 4, "O")
  }
  stub(0, 6, 0); stub(4, 3, 2); stub(8, 7, 1); c.hline(0, 12, 11, "C"); c.px(3, 11, "c")
})
anim("candelabra", { w: 15, h: 34, frames: 4, fps: 6, outline: "k" }, (c) => {
  c.vline(7, 10, 21, "a"); c.vline(8, 10, 21, "d"); c.rect(4, 30, 7, 2, "a"); c.hline(3, 32, 9, "d"); c.hline(5, 30, 3, "o")
  c.hline(2, 15, 11, "a"); c.vline(2, 12, 3, "a"); c.vline(12, 12, 3, "a"); c.px(7, 20, "o")
  for (const [x, top, ph] of [[1, 8, 0], [6, 5, 2], [11, 8, 1]]) {
    c.rect(x, top, 3, 4, "C"); c.vline(x, top, 4, "c"); c.hline(x - 1, top + 4, 5, "o")
    const f = (c.frame + ph) % 4; c.px(x + 1, top - 1, "O"); c.px(x + 1 + [0, 0, -1, 1][f], top - 2, f === 1 ? "O" : "Y"); if (f % 2 === 0) c.px(x + 1, top - 3, "O")
  }
})
anim("lamp_oil", { w: 9, h: 15, frames: 3, fps: 5, outline: "k" }, (c) => {
  c.ellipse(4, 12, 4, 2, "a"); c.hline(1, 11, 7, "o"); c.rect(3, 9, 3, 2, "a")
  c.rect(2, 3, 5, 6, "i"); c.vline(2, 3, 6, "c"); c.hline(2, 2, 5, "C"); c.hline(3, 1, 3, "a")
  c.px(4, 6, c.frame === 1 ? "O" : "Y"); c.px(4, 5, "O"); c.px(4, 7, "o"); if (c.frame === 2) c.px(4, 4, "O")
  c.px(3, 4, "c")
})
anim("lamp_hanging", { w: 11, h: 22, frames: 4, fps: 5, outline: "k" }, (c) => {
  c.vline(5, 0, 7, "S"); c.hline(3, 7, 5, "S"); c.px(2, 8, "S"); c.px(8, 8, "S")
  c.rect(2, 9, 7, 8, "S"); c.rect(3, 10, 5, 6, "O"); c.rect(4, 11, 3, 4, "Y"); c.hline(1, 17, 9, "S"); c.hline(3, 18, 5, "r"); c.px(5, 19, "S")
  c.vline(5, 10, 6, "S"); c.px(3, 10, "c")
  if (c.frame === 1) c.px(4, 12, "O"); if (c.frame === 2) c.recolor({ Y: "O" }, [4, 14, 3, 1]); if (c.frame === 3) c.px(6, 11, "c")
})
meta("lamp_hanging", { ax: 6, ay: 1, hook: true })

// ================================================================ rugs (flat, no outline; edge darkened in-art)
furn("rug_round", { fw: 2, fd: 2, up: 0, outline: null, ml: 0, mr: 0, mb: 0 }, (c, g) => {
  floorQuad(c, g.fx, g.fy, 32, 32, (a, b) => {
    const da = (a - 16) / 16, db = (b - 16) / 16, r = Math.sqrt(da * da + db * db)
    if (r > 0.98) return null
    const ring = Math.floor(r * 9)
    if (r > 0.9) return "m"                                               // braided edge
    return ["L", "l", "C", "v", "l", "p", "l", "v", "l"][ring] === "v" ? ((Math.floor(a) + Math.floor(b)) % 2 ? "v" : "m") : ["L", "l", "C", "v", "l", "p", "l", "v", "l"][ring]
  })
})
furn("rug_rect", { fw: 2, fd: 3, up: 0, outline: null, ml: 0, mr: 0, mb: 0 }, (c, g) => {
  floorQuad(c, g.fx, g.fy, 48, 32, (a, b) => {
    if (a < 1.5 || a > 46.5) return Math.floor(b) % 2 ? "C" : null      // fringe on the short ends
    if (b < 1 || b > 31 || a < 3 || a > 45) return "e"                    // border
    if (b < 3 || b > 29 || a < 5 || a > 43) return "o"
    const ca = Math.abs(a - 24), cb = Math.abs(b - 16)
    if (Math.abs(ca / 2 + cb - 8) < 1) return "o"                          // central lozenge
    if (ca / 2 + cb < 7) return (ca + cb) % 4 < 2 ? "E" : "p"
    return (Math.floor(a / 3) + Math.floor(b / 3)) % 5 === 0 ? "E" : "e"
  })
})
furn("rug_runner", { fw: 3, fd: 1, up: 0, outline: null, ml: 0, mr: 0, mb: 0 }, (c, g) => {
  floorQuad(c, g.fx, g.fy, 16, 48, (a, b) => {
    if (b < 1.5 || b > 46.5) return Math.floor(a) % 2 ? "C" : null
    if (a < 2 || a > 14) return "t"
    if (a < 3 || a > 13) return "T"
    return Math.floor(b / 4) % 2 ? "B" : (Math.floor(b) % 4 === 1 && Math.abs(a - 8) < 2 ? "i" : "b")
  })
})
furn("rug_doormat", { fw: 1, fd: 0.5, up: 0, outline: null, ml: 0, mr: 0, mb: 0 }, (c, g) => {
  floorQuad(c, g.fx, g.fy, 8, 16, (a, b) => (a < 1 || a > 7 || b < 1 || b > 15 ? "D" : (Math.floor(a) + Math.floor(b)) % 2 ? "W" : "w"))
})

// ================================================================ stairs (to a loft): rise along y toward the NE wall
pair("stairs", { fw: 1, fd: 2, up: 78 }, (c, g) => {
  const steps = 8
  for (let i = steps - 1; i >= 0; i--) {
    const a0 = i * 4, z = i * 8
    box(c, g, 0, a0, 16, 4, 0, z + 8, (f, u, v) => {
      if (f === "T") return v > 14 ? "W" : (u < 1 ? "s" : "W")
      if (f === "L") return v > z + 6 ? "s" : v > z + 5 ? "w" : (Math.floor(u) % 4 === 0 ? "d" : Math.floor(u) % 4 === 1 ? "w" : "D")
      return v > z + 6 ? "w" : "d"
    })
  }
  // handrail posts
  for (const i of [0, 7]) { const [x, y] = P(g, 0, i * 4 + 2, i * 8 + 8); c.vline(x, y - 12, 12, "D") }
  const [x0, y0] = P(g, 0, 2, 20), [x1, y1] = P(g, 0, 30, 76); c.line(x0, y0, x1, y1, "w")
})

// ================================================================================================
// INTERIORS set (notes/REQUESTS.md "INTERIORS -> ART2"): exact footprints from MM.BUILDINGS furniture table.
// Native facing: against the back wall y=0 (front = lower-left/SW face); interiors mirrors with flip for the x=0 wall.
// Anchor = FRONT (bottom) vertex of the footprint diamond: [16*w + 1 (+ left margin), bottom diamond row].
function intF(name, fw, fd, o, draw) {
  const g = furnGeo({ fw, fd, up: o.up, ml: o.ml ?? 1, mr: o.mr ?? 1, mb: 1 }), opts = { w: g.w, h: g.h }
  const outline = o.outline === undefined ? "k" : o.outline, pad = outline ? 1 : 0; if (outline) opts.outline = outline
  if (o.frames) { opts.frames = o.frames; opts.fps = o.fps || 6; anim(name, opts, (c) => draw(c, g)) } else sprite(name, opts, (c) => draw(c, g))
  meta(name, { ax: g.fx + pad, ay: g.fy - 1 + pad, foot: [fw, fd], h: o.h, anchorMode: "front" })
}
const QUILT = ["B", "i", "C", "b", "B", "c"]
intF("int_bed", 1.25, 2, { up: 22, h: 24 }, (c, g) => {
  const B = 20, A = 32
  for (const [b, a] of [[0, A - 2], [B - 2, A - 2], [B - 2, 0], [0, 0]]) box(c, g, b, a, 2, 2, 0, 4, flat("D", "D", "d"))
  box(c, g, 0, 0, B, A, 3, 5, woodSh(4))
  box(c, g, 1, 2, B - 2, A - 4, 8, 3, flat("C", "q", "R"))
  box(c, g, 2, A - 9, B - 4, 6, 11, 3, (f, u, v) => f === "T" ? (v < 2 ? "q" : "c") : f === "L" ? "C" : "q")                 // pillow
  box(c, g, 0, 1, B, 21, 8, 5, (f, u, v) => {                                                                            // patchwork quilt
    if (f === "T") { if (u % 4 < 0.6 || v % 4 < 0.6) return "b"; const k = QUILT[(Math.floor(u / 4) * 2 + Math.floor(v / 4) * 3) % 6]; return k }
    if (v < 1.2 && Math.floor(u) % 3 === 1) return null
    if (v < 1.5) return "b"
    const k = QUILT[Math.floor(u / 4) % 6]; return f === "L" ? k : SHADE1[k] || k
  })
  box(c, g, 0, 0, B, 2, 3, 11, woodSh(5))                                                                                // footboard
  box(c, g, 0, A - 2, B, 2, 3, 21, (f, u, v) => f === "T" ? "W" : f === "L" ? (Math.floor(u) % 5 === 0 ? "D" : v > 16 ? "W" : "w") : "D")   // headboard
  const [hx, hy] = P(g, 10, A - 2, 20); c.px(hx, hy, "o"); c.px(hx + 1, hy - 1, "a")
})
const chestLid = (f, u, v) => f === "T" ? (Math.floor(v) === 3 || Math.floor(v) === 12 ? "R" : v > 13 ? "W" : "w") : (Math.floor(u) === 3 || Math.floor(u) === 12 ? (f === "L" ? "R" : "r") : f === "L" ? (v > 2.5 ? "W" : "w") : "D")
const chestBox = (c, g) => box(c, g, 0, 0, 16, 10, 0, 11, (f, u, v) => f === "T" ? "w" : Math.floor(u) === 3 || Math.floor(u) === 12 ? (f === "L" ? "r" : "S") : v < 1 ? "d" : woodFace(f === "L" ? "lit" : "mid", u, v, 4, 6))
intF("int_chest", 1, 0.6, { up: 10, h: 16 }, (c, g) => {
  chestBox(c, g); box(c, g, 0, 0, 16, 10, 11, 4, chestLid)
  const [x, y] = P(g, 8, 0, 10); c.grid(x - 1, y - 2, ".o.\noOo\n.a.")
})
intF("int_chest_open", 1, 0.6, { up: 22, h: 16 }, (c, g) => {
  box(c, g, 0, 8, 16, 2, 11, 13, (f, u, v) => f === "L" ? (Math.floor(u) === 3 || Math.floor(u) === 12 ? "r" : v > 11 ? "W" : "D") : f === "T" ? "W" : "d")
  chestBox(c, g)
  box(c, g, 1, 1, 14, 8, 10.5, 0.5, (f, u, v) => (hash(Math.floor(u), Math.floor(v), 3) < 0.35 ? "O" : hash(Math.floor(u), Math.floor(v), 4) < 0.3 ? "l" : "D"))
  const [x, y] = P(g, 7, 4, 11); c.px(x, y - 1, "Y"); c.px(x, y - 2, "c"); c.px(x + 3, y, "z")
})
const stoneSh = (f, u, v) => { if (f === "T") return "R"; const row = Math.floor(v / 5), off = row % 2 ? 3 : 0; if (v % 5 < 1 || (Math.floor(u) + off) % 7 === 0) return f === "L" ? "r" : "S"; const h = hash(Math.floor((u + off) / 7), row, 5); return f === "L" ? (h < 0.3 ? "q" : "R") : h < 0.3 ? "R" : "r" }
intF("int_hearth", 1.75, 0.75, { up: 64, h: 62, frames: 4, fps: 8, ml: 2, mr: 2 }, (c, g) => {
  const B = 28, A = 12
  box(c, g, 4, 4, 20, 8, 26, 36, stoneSh)
  box(c, g, 0, 0, B, A, 0, 26, (f, u, v) => (f === "L" && u > 6 && u < 21 && v < 17) ? (v > 15 || u < 8 || u > 19 ? "S" : v > 13 ? "k" : "x") : stoneSh(f, u, v))
  box(c, g, -1.5, -1, B + 3, A + 2, 24, 3, flat("w", "W", "D"))
  for (let u = 8; u < 20; u++) { const [x, y] = P(g, B - u, 0, 1); c.px(x, y, "D"); c.px(x, y - 1, u % 3 ? "d" : "e") }
  for (let u = 8; u < 20; u++) {
    const [x, y0] = P(g, B - u, 0, 3), k = c.phase * TAU
    const h = Math.max(1, Math.round(5 + 3 * Math.sin((u - 8) / 11 * Math.PI) + Math.sin(k + u * 1.9) * 1.5))
    for (let j = 0; j < h; j++) c.px(x, y0 - j, j > h * 0.65 ? "E" : j > h * 0.3 ? "O" : "Y")
  }
  const at = (b, s) => { const [x, y] = P(g, b, 5, 27); const r = s.split("\n"); c.grid(x, y - r.length, s) }
  at(23, ".Y\n.O\n.c\n.c\nac"); at(7, "BiB\nBBB\nbBb"); at(15, "C.\nCC\nqC")
  const [ex, ey] = P(g, 14, 0, 0); c.px(ex + (c.frame % 2 ? 1 : -1), ey - 1, c.frame % 2 ? "o" : "E")
})
intF("int_bookcase", 1.5, 0.5, { up: 60, h: 58 }, (c, g) => {
  const H = 58
  box(c, g, 0, 0, 24, 8, 0, H, (f, u, v) => {
    if (f === "T") return v < 1 || v > 23 ? "w" : "W"
    if (f === "R") return v > H - 2 ? "w" : "D"
    if (u < 1.5 || u > 22.5 || v < 2 || v > H - 3) return v > H - 3 || u < 1.5 ? "W" : "w"
    return booksOn(f, u, v - 2 - Math.floor((v - 2) / 46) * 0, 0, 9, true) ?? (v > 47 ? (Math.floor(u) % 6 === 2 && v < 54 ? "a" : "j") : "j")
  })
  const [x, y] = P(g, 22, 0, H); c.hline(x - 1, y - 1, 3, "W")
  const [ox, oy] = P(g, 12, 0, 49); c.grid(ox - 2, oy - 4, ".C.\nCqC\nqCq\n.q.")   // a skull-white jug on the top shelf
})
intF("int_wardrobe", 1.25, 0.625, { up: 62, h: 60 }, (c, g) => {
  box(c, g, 0, 0, 20, 10, 0, 4, flat("d", "D", "d"))
  box(c, g, 0, 0, 20, 10, 4, 52, (f, u, v) => {
    if (f === "T") return "w"
    if (f === "R") return panelFace("dark", u, v, 10, 52, 10, [3, 3])
    if (u < 1 || u > 19) return u < 1 ? "W" : "D"
    if (Math.floor(u) === 10) return "d"
    if (u > 6 && u < 14 && v > 30 && v < 46) { const du = (u - 10) / 3.6, dv = (v - 38) / 7.5, r = du * du + dv * dv; if (r < 1) return r > 0.7 ? "o" : (u - 10) + (v - 38) * 0.5 > 1 && (u - 10) + (v - 38) * 0.5 < 3 ? "c" : v > 38 ? "i" : "B" }   // oval mirror
    const pu = u < 10 ? u - 1 : u - 11
    if (v < 2 || v > 49 || pu < 1 || pu > 7.8) return "w"
    if (pu < 1.8 || v > 48) return "W"
    if ((Math.floor(u) === 8 || Math.floor(u) === 12) && v > 22 && v < 26) return "O"
    return "D"
  })
  box(c, g, -0.5, -0.5, 21, 11, 56, 3, flat("W", "w", "D"))
})
function rugQuad(c, g, A, B, f) { floorQuad(c, g.fx, g.fy, A, B, f) }
intF("int_rug", 2.5, 1.75, { up: 0, h: 0, outline: null, ml: 0, mr: 0 }, (c, g) => rugQuad(c, g, 28, 40, (a, b) => {
  if (b < 1.5 || b > 38.5) return Math.floor(a) % 2 ? "C" : null
  if (a < 1 || a > 27 || b < 3 || b > 37) return "e"
  if (a < 3 || a > 25 || b < 5 || b > 35) return "o"
  const ca = Math.abs(a - 14), cb = Math.abs(b - 20)
  if (Math.abs(ca + cb / 2 - 7) < 0.8) return "o"
  if (ca + cb / 2 < 6) return (ca + cb) % 4 < 2 ? "E" : "p"
  return (Math.floor(a / 3) + Math.floor(b / 3)) % 5 === 0 ? "E" : "e"
}))
intF("int_rug_round", 2, 1.5, { up: 0, h: 0, outline: null, ml: 0, mr: 0 }, (c, g) => rugQuad(c, g, 24, 32, (a, b) => {
  const da = (a - 12) / 12, db = (b - 16) / 16, r = Math.sqrt(da * da + db * db)
  if (r > 0.98) return null
  if (r > 0.88) return "m"
  const ring = ["L", "l", "C", "v", "l", "p", "l", "v", "l"][Math.floor(r * 9)]
  return ring === "v" ? ((Math.floor(a) + Math.floor(b)) % 2 ? "v" : "m") : ring
}))
intF("int_doormat", 1.5, 0.5, { up: 0, h: 0, outline: null, ml: 0, mr: 0 }, (c, g) => rugQuad(c, g, 8, 24, (a, b) => (a < 1 || a > 7 || b < 1 || b > 23 ? "D" : (Math.floor(a) + Math.floor(b)) % 2 ? "W" : "w")))
intF("int_table", 1.5, 1, { up: 18, h: 20 }, (c, g) => tableTop(c, g, 24, 16, 20, () => {
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 20); c.grid(x, y - s.split("\n").length, s) }
  at(16, 9, ".WW.\nWsWW\nwWWw"); at(7, 5, "Bi\nBB"); at(10, 11, ".Y\n.O\n.c\nac")
}))
intF("int_worktable", 1.5, 0.875, { up: 24, h: 22 }, (c, g) => tableTop(c, g, 24, 14, 22, () => {
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 22); const r = s.split("\n"); c.grid(x - 1, y - r.length, s) }
  at(21, 8, ".a.\nBiB\nBBB\nbBb"); at(17, 9, ".r.\nlLl\nlvl\nlvl"); at(12, 6, "r.\nRr.\nRRr\n.SS"); at(7, 8, "h.g.\nGhgG\n.GG."); at(4, 4, ".a.\nfpf\nfff")
}))
function chairAt(c, g, S, D, top, cushion) {
  const legs = [[0.5, 0.5], [D - 2, 0.5], [0.5, D - 2], [D - 2, D - 2]].sort((p, q) => q[0] + q[1] - p[0] - p[1])
  for (const b of [0.5, D - 2]) box(c, g, b, D - 2, 1.5, 1.5, S, top - S, flat("W", "w", "D"))
  box(c, g, 0, D - 2, D, 1.5, S + 6, 2, flat("W", "w", "D")); box(c, g, 0, D - 2, D, 1.5, top - 4, 4, flat("s", "W", "w"))
  for (const [b, a] of legs) box(c, g, b, a, 1.5, 1.5, 0, S - 1, flat("w", "w", "D"))
  box(c, g, 0, 0, D, D - 1, S - 2, 2, (f, u, v) => f === "T" ? (cushion ? (u + v < 5 ? "v" : "X") : u + v < 5 ? "s" : "W") : f === "L" ? (cushion ? "X" : "w") : cushion ? "m" : "D")
}
intF("int_chair", 0.625, 0.625, { up: 28, h: 26 }, (c, g) => chairAt(c, g, 12, 10, 26, false))
intF("int_stool", 0.5, 0.5, { up: 10, h: 12 }, (c, g) => {
  for (const [b, a] of [[5.5, 5.5], [5.5, 1], [1, 5.5], [1, 1]]) box(c, g, b, a, 1.5, 1.5, 0, 11, flat("w", "w", "D"))
  box(c, g, 0.5, 0.5, 7, 7, 3, 1, flat("D", "D", "d"))
  const cx = Math.round(g.cx), cy = Math.round(g.cy) - 12; c.ellipse(cx, cy, 5, 2, "w"); c.ellipse(cx, cy - 1, 5, 2, "W"); c.hline(cx - 3, cy - 2, 3, "s")
})
intF("int_armchair", 0.875, 0.875, { up: 30, h: 30 }, (c, g) => {
  const D = 14, cloth = (f, u, v) => f === "T" ? ((Math.floor(u) + Math.floor(v)) % 5 === 0 ? "v" : "X") : f === "L" ? (Math.floor(v) === 1 ? "m" : "X") : "m"
  box(c, g, 0, D - 4, D, 4, 2, 28, (f, u, v) => f === "L" ? (v > 25 ? "v" : Math.floor(u) % 5 === 2 && v > 14 && v < 24 ? "m" : "X") : cloth(f, u, v))   // tufted back
  box(c, g, D - 3, 0, 3, D - 4, 2, 16, cloth)                                                                                     // far arm
  for (const [b, a] of [[D - 2, 0], [0, 0]]) box(c, g, b, a, 2, 2, 0, 3, flat("D", "D", "d"))
  box(c, g, 3, 0, D - 6, D - 4, 2, 10, (f, u, v) => f === "T" ? (u + v < 5 ? "v" : "X") : f === "L" ? (v < 2 ? "m" : "X") : "m")   // seat cushion
  box(c, g, 0, 0, 3, D - 4, 2, 16, (f, u, v) => f === "T" ? "v" : f === "L" ? (v > 13 ? "v" : "X") : "m")                          // near arm
  const [x, y] = P(g, 7, 4, 13); c.grid(x - 2, y - 2, ".CC\nCcC")                                                                   // knitted cushion
})
intF("int_counter", 3, 0.875, { up: 30, h: 24 }, (c, g) => {
  const B = 48, A = 14
  box(c, g, 0, 0, B, A, 0, 22, (f, u, v) => f === "T" ? "W" : v < 1.5 ? "d" : vBoards(f === "L" ? "lit" : "mid", u, v, 22, 4))
  box(c, g, -1, -1, B + 2, A + 2, 22, 2, (f, u, v) => f === "T" ? woodTop(u, v, 4, 2, ["W", "w", "s"]) : f === "L" ? "W" : "D")
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 24); const r = s.split("\n"); c.grid(x - 1, y - r.length, s) }
  at(42, 7, "...a...\n..aOa..\n.a.a.a.\nrr.a.rr\n.SSSSS."); at(32, 6, "llll\nlCCl\nvvvv"); at(24, 8, ".O.\nOYO\naaa"); at(16, 6, "iBi\nBBB\nbBb"); at(8, 7, ".ff.\nfpfe\neffe")
})
function rackShelves(c, g, B, A, H, rows, fill) {
  box(c, g, 0, 0, B, A, 0, H, (f, u, v) => {
    if (f === "T") return "W"; if (f === "R") return "D"
    if (u < 1.5 || u > B - 1.5) return u < 1.5 ? "W" : "w"
    if (v < 2 || v > H - 2) return "w"
    for (const r of rows) if (v >= r && v < r + 1) return "d"
    return "j"
  })
  fill()
}
intF("int_shelves", 1.5, 0.5, { up: 50, h: 48 }, (c, g) => rackShelves(c, g, 24, 8, 48, [2, 17, 32], () => {
  const put = (b, z, s) => { const [x, y] = P(g, b, 0, z); const r = s.split("\n"); c.grid(x - 1, y - r.length + 1, s) }
  put(21, 3, ".a.\nBiB\nBBB\nbBb"); put(16, 3, "WWW\nwWw\nwww"); put(11, 3, ".r.\nRqR\nRRR\nrRr"); put(6, 3, "O.O\nOOO\naoa")
  put(21, 18, "lLl\nvlv"); put(16, 18, ".c.\nCcC\nCCC\nqCq"); put(10, 18, "ee\npe\nee"); put(5, 18, ".S.\nrRr\nrrr")
  put(21, 33, "hgh\nGgG\nwWw"); put(15, 33, "fp.\nfff\n.e."); put(8, 33, "WWWW\nwwww\nDDDD")
}))
intF("int_drying_rack", 1.5, 0.4, { up: 46, h: 44 }, (c, g) => {
  for (const b of [22, 1]) box(c, g, b, 2, 1.5, 2, 0, 44, flat("W", "w", "D"))
  for (const z of [42, 28, 14]) box(c, g, 0, 2.5, 24, 1, z, 1, flat("W", "w", "D"))
  const bundle = (b, z, k1, k2) => { const [x, y] = P(g, b, 3, z); c.px(x, y + 1, "W"); c.px(x, y + 2, "e"); for (let j = 0; j < 7; j++) { const w = j < 2 ? 1 : j < 5 ? 2 : 1; for (let dx = -w; dx <= w; dx++) c.px(x + dx, y + 3 + j, (dx + j) % 3 === 0 ? k2 : k1) } }
  const ks = [["g", "G"], ["v", "m"], ["h", "g"], ["O", "a"], ["p", "E"], ["H", "h"], ["l", "v"], ["g", "G"], ["y", "h"]]
  let i = 0; for (const z of [41, 27, 13]) for (const b of [19, 12, 5]) { const [k1, k2] = ks[i++]; bundle(b, z, k1, k2) }
})
intF("int_display_case", 1, 0.625, { up: 30, h: 32 }, (c, g) => {
  box(c, g, 0, 0, 16, 10, 0, 14, (f, u, v) => f === "T" ? "W" : f === "L" ? panelFace("mid", u, v, 16, 14, 8, [2, 2]) : panelFace("dark", u, v, 10, 14, 10, [1, 1]))
  // goods on the shelf (behind the glass)
  const [x, y] = P(g, 8, 5, 14)
  c.grid(x - 6, y - 9, "..S.......\n.SOS......\n.SYS...a..\n.SOS..a...\n.SSS.aaa..\n.....aaa..")   // lantern + ladle
  c.grid(x + 2, y - 4, "ff.\nfpf\n.f.f")                                                                   // ribbon
  box(c, g, 0, 0, 16, 10, 14, 16, (f, u, v) => {                                                            // glass box: frame + see-through panes
    const edge = f === "T" ? (u < 1 || v < 1 || u > 9 || v > 15) : (u < 1 || v > 15 || (f === "L" ? u > 15 : u > 9))
    if (edge) return f === "R" ? "D" : "w"
    if (f === "T") return (Math.floor(u + v) % 7 === 0) ? "c" : null
    return (Math.floor(u) + Math.floor(15 - v)) % 9 === 0 ? "c" : (Math.floor(u) + Math.floor(15 - v)) % 9 === 1 ? "i" : null
  })
})
intF("int_stove", 0.75, 0.75, { up: 36, h: 34, frames: 3, fps: 6 }, (c, g) => {
  box(c, g, 4, 4, 4, 4, 18, 16, (f, u, v) => (Math.floor(v) % 8 === 0 ? "R" : f === "L" ? "r" : "S"))
  for (const [b, a] of [[1, 9], [9, 9], [9, 1], [1, 1]]) box(c, g, b, a, 2, 2, 0, 4, flat("S", "S", "j"))
  box(c, g, 0, 0, 12, 12, 4, 14, (f, u, v) => {
    if (f === "T") return u < 2 || v < 2 ? "r" : "S"
    if (f === "L" && u > 2 && u < 10 && v > 3 && v < 10) { if (u < 3.2 || u > 9 || v < 4.2 || v > 9) return "j"; return Math.floor(u) % 2 === 0 ? "k" : v < 6 ? (c.frame === 1 ? "O" : "E") : "e" }
    if (v > 12.5) return f === "L" ? "R" : "r"
    return f === "L" ? (u < 1.5 ? "r" : "S") : "j"
  })
  if (c.frame !== 2) { const [x, y] = P(g, 3, 3, 18); c.px(x, y - 2 - c.frame, "L") }
})
intF("int_plant", 0.5, 0.5, { up: 24, h: 22 }, (c, g) => {
  const cx = Math.round(g.cx), cy = Math.round(g.cy) + 2
  c.poly([cx - 4, cy - 7, cx + 4, cy - 7, cx + 3, cy, cx - 3, cy], "E"); c.poly([cx + 1, cy - 7, cx + 4, cy - 7, cx + 3, cy, cx + 1, cy], "e"); c.hline(cx - 5, cy - 8, 10, "p"); c.hline(cx - 5, cy - 7, 10, "E")
  c.grid(cx - 7, cy - 22, "......h......\n...h..g..h...\n..hg..g.gG...\n.hg.hggg.Gg..\nhg..hgGgg.Gg.\ng..hg.g.G..G.\n.hg.hggG.Gg..\nhg..hgGgg..G.\n..g..gGg.G...\n....gGGG.....\n.....GGG.....\n.....GGG.....\n......G......")
})
intF("int_alchemy_table", 1, 1, { up: 34, h: 28 }, (c, g) => tableTop(c, g, 16, 16, 16, () => {
  const at = (b, a, s) => { const [x, y] = P(g, b, a, 16); const r = s.split("\n"); c.grid(x - 1, y - r.length, s) }
  at(12, 8, "...S...\n..SrS..\n...r...\n..BiB..\n.BzzzB.\n.BzczB.\n..BBB..\n.Saaa..\nSE.O.E."); at(5, 10, "..i.\n.ii.\niiBB\nBffB\n.BB."); at(4, 3, "llll\nlCCl\nvvvv")
}))
intF("int_cauldron", 0.75, 0.75, { up: 24, h: 22, frames: 6, fps: 7 }, (c, g) => {
  const cx = Math.round(g.cx), cy = Math.round(g.cy) + 1, k = c.phase * TAU
  c.ellipse(cx, cy, 8, 3, "S"); c.ellipse(cx, cy - 1, 6, 2, "d")
  for (let i = 0; i < 10; i++) { const x = cx - 5 + i, h = 2 + Math.round(1.5 + Math.sin(k + i) * 1.2); for (let j = 0; j < h; j++) c.px(x, cy - 1 - j, j > h - 2 ? "E" : j > 0 ? "O" : "Y") }
  c.ellipse(cx, cy - 9, 9, 6, "j"); c.ellipse(cx - 1, cy - 10, 8, 5, "S"); c.ellipse(cx - 3, cy - 11, 4, 3, "r"); c.px(cx - 5, cy - 12, "R")
  c.ellipse(cx, cy - 15, 9, 2, "r"); c.hline(cx - 8, cy - 16, 11, "R"); c.ellipse(cx, cy - 15, 7, 1, "k"); c.ellipse(cx, cy - 15, 6, 1, "z"); c.hline(cx - 3 + (c.frame % 3), cy - 15, 3, "c")
  for (const [bx, ph] of [[-3, 0], [2, 2], [4, 4]]) { const t = (c.frame + ph) % 6; if (t < 3) c.px(cx + bx, cy - 16 - t, t === 2 ? "i" : "z") }
  const t = c.phase, sx = cx - 1 + Math.round(Math.sin(t * TAU)), sy = cy - 20 - Math.round(t * 4); c.px(sx, sy, "L")
})

// ---------------------------------------------------------------- wall decor for the y=0 back wall (slants down-right 2:1)
// Default bottom-centre anchor: the point where the piece's centre touches the wall at its z (interiors adds floor(w/4)).
function wallDeco(name, w, h, f, anim) {
  const H = h + Math.floor((w - 1) / 2), body = (c) => { for (let x = 0; x < w; x++) for (let v = 0; v < h; v++) { const k = f(x, v, c.frame || 0); if (k) c.px(x, h - 1 - v + Math.floor(x / 2), k) } }
  if (anim) anim_(name, { w, h: H, frames: anim, fps: 6, outline: "k" }, body); else sprite(name, { w, h: H, outline: "k" }, body)
}
const anim_ = (n, o, fn) => anim(n, o, fn)
wallDeco("int_window", 14, 18, (u, v) => {
  if (v < 2) return v === 0 ? "d" : "W"                                                      // sill
  if (u === 0 || u === 13 || v === 17) return "D"
  if (v >= 14 && v <= 16) return (u + v) % 2 ? "l" : "L"                                     // valance
  if ((u <= 2 && v > 4 + u * 2) || (u >= 11 && v > 4 + (13 - u) * 2)) return (u + v) % 2 ? "l" : "v"   // tied curtains
  if (u === 7 || v === 9) return "D"
  if ((u === 2 || u === 8) && (v === 12 || v === 7)) return "c"
  return v > 10 ? "i" : v > 5 ? "B" : "b"
})
wallDeco("int_portrait", 16, 20, (u, v) => {
  const du = (u - 7.5) / 7.6, dv = (v - 9.5) / 9.8, r = du * du + dv * dv
  if (r > 1) return null
  if (r > 0.74) return r > 0.87 ? "a" : "O"
  if (v < 6) return u % 2 ? "m" : "v"                                                        // keeper's shawl
  if (v === 6 && u >= 7 && u <= 8) return "L"                                                // silver moon charm
  if (v === 6 && u > 4 && u < 11) return "l"
  if (v >= 7 && v <= 12 && u >= 6 && u <= 9) return v === 10 && (u === 6 || u === 9) ? "k" : u === 9 ? "n" : "p"
  if (v >= 13 && v <= 16 && u >= 5 && u <= 10) return v === 16 || u === 10 ? "r" : "R"
  if (v >= 9 && v <= 12 && (u === 5 || u === 10)) return "r"
  return v > 14 ? "t" : "T"
})
wallDeco("int_star_chart", 22, 16, (u, v) => {
  if (u === 0 || u === 21) return v % 3 ? "D" : "w"                                          // scroll rods
  if (v === 0 || v === 15) return "q"
  const stars = [[5, 10], [11, 5], [16, 11]], dots = [[3, 4], [8, 12], [13, 9], [18, 4], [9, 7], [15, 2], [19, 13]]
  for (const [x, y] of stars) { const d = Math.max(Math.abs(u - x), Math.abs(v - y)); if (d === 0) return "O"; if (d === 2 && (u === x || v === y || Math.abs(u - x) === 2)) return "e" }
  for (const [x, y] of dots) if (u === x && v === y) return "v"
  if (Math.abs((v - 10) - (u - 5) * -5 / 6) < 0.5 && u > 5 && u < 11) return "R"           // constellation lines
  if (Math.abs((v - 5) - (u - 11) * 6 / 5) < 0.5 && u > 11 && u < 16) return "R"
  return (u + v * 3) % 11 === 0 ? "C" : "c"
})
wallDeco("int_wall_shelf", 24, 10, (u, v) => {
  if (v === 0 && (u === 3 || u === 20)) return "D"
  if (v === 1 && (u === 3 || u === 20)) return "d"
  if (v === 2) return "W"
  if (v === 1) return u > 0 && u < 23 ? "w" : null
  if (v < 1) return null
  const it = [[1, 3, 5, "B", "i"], [5, 2, 4, "e", "p"], [8, 2, 3, "O", "o"], [11, 4, 3, "l", "L"], [16, 3, 6, "G", "h"], [20, 2, 4, "C", "c"]]
  for (const [x, w, h, k1, k2] of it) if (u >= x && u < x + w && v >= 3 && v < 3 + h) return u === x ? k2 : k1
  return null
})
wallDeco("int_herbs_hanging", 24, 14, (u, v) => {
  if (v === 13) return u % 4 === 0 ? "d" : "D"                                               // beam
  if (v === 12) return u % 4 === 1 ? "a" : null
  const B = [[2, "g", "G", 9], [7, "v", "m", 8], [12, "O", "a", 10], [17, "h", "g", 8], [21, "p", "E", 7]]
  for (const [x, k1, k2, len] of B) { const dv = 12 - v, dx = u - x; if (dv >= 1 && dv <= 2 && dx === 0) return dv === 2 ? "e" : "W"; if (dv > 2 && dv <= len && Math.abs(dx) <= (dv < 5 ? 1 : dv < len - 1 ? 2 : 1)) return (dx + dv) % 3 === 0 ? k2 : k1 }
  return null
})
wallDeco("int_lesson_board", 26, 18, (u, v) => {
  if (u === 0 || u === 25 || v === 0 || v === 17) return u === 0 || v === 17 ? "W" : "D"
  const notes = [[3, 9, 6, 6, "c"], [11, 10, 5, 5, "C"], [18, 8, 6, 7, "c"], [5, 2, 7, 5, "C"], [15, 2, 6, 5, "c"]]
  for (const [x, y, w, h, k] of notes) if (u >= x && u < x + w && v >= y && v < y + h) {
    if (u === x + Math.floor(w / 2) && v === y + h - 1) return "f"                            // pin
    return (v - y) % 2 === 1 && u > x && u < x + w - 1 ? "R" : k
  }
  return (u * 3 + v * 7) % 13 === 0 ? "w" : "a"                                              // cork
})
wallDeco("int_wall_lantern", 8, 12, (u, v, f) => {
  if (v === 11 && u >= 3 && u <= 4) return "S"
  if (v >= 1 && v <= 9 && (u === 1 || u === 6)) return "S"
  if (v === 10 || v === 0) return u >= 1 && u <= 6 ? "S" : null
  if (u >= 2 && u <= 5 && v >= 2 && v <= 8) { if (u === 2) return "c"; const flick = f === 1 ? (v > 5 ? "O" : "Y") : f === 2 ? (v > 6 ? "o" : "O") : "Y"; return v >= 4 && v <= 6 && u >= 3 && u <= 4 ? flick : "O" }
  if (v >= 1 && v <= 9 && u >= 2 && u <= 5) return "S"
  return null
}, 3)
