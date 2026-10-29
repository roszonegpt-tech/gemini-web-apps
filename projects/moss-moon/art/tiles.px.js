// Ground tiles: 32x16 iso diamonds, 4 variants per surface (<surface>_0..3), edge fringes
// (edge_<kind>_<ne|se|sw|nw>) drawn over the neighbouring tile, and side skirts for map borders.
include("_palette.px.js")

const T = { w: 32, h: 16 }
const V = [0, 1, 2, 3]
const tileSet = (name, fn) => V.forEach((v) => sprite(`${name}_${v}`, T, (c) => fn(c, v, 101 + v * 37 + name.length * 7)))

// ------------------------------------------------------------------ grove grass
const TUFT = ["h.h\n.h.", "h.\n.h", ".h\nh.", "y.h\n.h.", "h.y\n.h."]
tileSet("grass_grove", (c, v, s) => {
  fillDia(c, "H")
  if (v === 1) sprinkle(c, s + 9, ["yy", "y"], 2)
  sprinkle(c, s, TUFT, [3, 5, 3, 4][v])
  if (v === 2) sprinkle(c, s + 3, ["p\nh", "O\nh", "c\nh"], 2)
  if (v === 3) sprinkle(c, s + 5, [".h.\nhgh", "hh\ngh"], 2)
})

// ------------------------------------------------------------------ dirt path (warm, worn)
tileSet("path_dirt", (c, v, s) => {
  fillDia(c, "s")
  sprinkle(c, s, ["W", "WW"], 3)
  sprinkle(c, s + 1, ["R\nr", "Rr", "w"], [2, 3, 1, 2][v])
  if (v === 1) sprinkle(c, s + 2, ["ww..\n..ww"], 1, 2)                    // cart rut
  if (v === 3) sprinkle(c, s + 2, ["h.h", ".h"], 1, 2)                     // a stray tuft
  if (v === 2) sprinkle(c, s + 4, ["ww\nWW"], 1)
})

// ------------------------------------------------------------------ tilled soil (furrows run along j)
// Furrows follow the iso grain exactly: m = 2y - x is constant along a 2:1 line, and it matches
// across neighbouring tiles, so rows continue seamlessly from plot to plot.
const furrows = (c, base, groove, ridge, seed, wet) => {
  fillDia(c, base)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    if (!DIA(x, y)) continue
    const m = (((2 * y - x) % 8) + 8) % 8
    if (m === 0 || m === 1) c.px(x, y, groove); else if (m === 6 || m === 7) c.px(x, y, ridge)
  }
  if (wet) sprinkle(c, seed, ["B", "Bi"], 2)
  else sprinkle(c, seed, ["s"], 2)
}
V.forEach((v) => {
  sprite(`soil_dry_${v}`, T, (c) => { furrows(c, "w", "D", "W", 300 + v * 11, false); if (v === 2) sprinkle(c, 50, ["R"], 1); if (v === 3) sprinkle(c, 51, ["h"], 1) })
  sprite(`soil_wet_${v}`, T, (c) => { furrows(c, "D", "d", "w", 400 + v * 11, true); if (v === 1) sprinkle(c, 60, ["b"], 2) })
})

// ------------------------------------------------------------------ neglected farm grass (overgrown)
const WEED = ["g.g\n.g.\n.g.", "G.g\n.G.", "g\ng\nG", "W.\n.W\n.W", "y\ng", "g.G\nggg"]
tileSet("grass_wild", (c, v, s) => {
  fillDia(c, "h")
  sprinkle(c, s + 7, ["HH", "H"], 3)
  sprinkle(c, s, WEED, [6, 8, 7, 6][v])
  if (v === 2) sprinkle(c, s + 2, ["O\ng", "l\ng"], 2)
  if (v === 3) sprinkle(c, s + 2, ["WW\n.W"], 1)
})

// ------------------------------------------------------------------ water (static variants + shimmer anim)
tileSet("water", (c, v, s) => {
  fillDia(c, "B")
  sprinkle(c, s + 3, ["bb", "bbb"], [2, 3, 1, 2][v])
  sprinkle(c, s, ["ii", "iii", "c"], [2, 3, 2, 1][v])
  if (v === 3) sprinkle(c, s + 9, [".g.\nggg"], 1, 2)                     // a lily pad
})
anim("water_anim", { ...T, frames: 4, fps: 3 }, (c) => {
  fillDia(c, "B")
  sprinkle(c, 7, ["bb", "bbb"], 2)
  const r = rng(5)
  for (let k = 0; k < 4; k++) {
    const x = 6 + Math.floor(r() * 18), y = 4 + Math.floor(r() * 8), len = 2 + ((k + c.frame) % 3)
    const xx = x + ((c.frame + k) % 4) - 1
    for (let q = 0; q < len; q++) if (DIA(xx + q, y) && DIA(xx + q, y - 1) && DIA(xx + q, y + 1)) c.px(xx + q, y, (q + k + c.frame) % 4 ? "i" : "c")
  }
})

// ------------------------------------------------------------------ Blighted Forest floor: moss + leaf litter
const LEAF = ["D", "e", "w", "eD", "D\n.e", "X"]
tileSet("forest_moss", (c, v, s) => {
  fillDia(c, "G")
  sprinkle(c, s + 1, ["gg", "ggg\n.g.", "g"], 4)
  sprinkle(c, s, LEAF, [4, 6, 5, 3][v])
  if (v === 1) sprinkle(c, s + 3, ["d..\n.dd"], 1)                         // twig
  if (v === 2) sprinkle(c, s + 3, [".h.\nhhh"], 1)
  if (v === 3) sprinkle(c, s + 3, ["X.\n.x", "x"], 2)                      // blight spots
})

// ------------------------------------------------------------------ Whispering Swamp: mud + bog water
tileSet("swamp_mud", (c, v, s) => {
  fillDia(c, "u")
  sprinkle(c, s + 2, ["UU", "U"], 3)
  if (v !== 2) sprinkle(c, s, [".bb.\nbbbb", "bbb"], 1, 2)                 // puddle
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) if (c.is(x, y, "b") && c.is(x, y - 1, "uU")) c.px(x, y, "B")
  sprinkle(c, s + 5, ["g\ng", "G"], [2, 1, 3, 2][v])
})
tileSet("swamp_bog", (c, v, s) => {
  fillDia(c, "b")
  sprinkle(c, s + 1, ["jj", "jjj"], 2)
  sprinkle(c, s, ["U", "UU", "gU"], [3, 5, 2, 4][v])
  sprinkle(c, s + 4, ["i", ".i\ni."], [1, 1, 2, 0][v])
  if (v === 2) sprinkle(c, s + 9, [".g.\nggg"], 1, 2)
})

// ------------------------------------------------------------------ Frostpeak: snow + ice
tileSet("snow", (c, v, s) => {
  fillDia(c, "c")
  // wind drifts: short ridges along the iso grain, lit cream on top, moonlit lavender below
  const r = c.rng(s)
  for (let k = 0; k < 3; k++) {
    const x0 = 6 + Math.floor(r() * 16), y0 = 4 + Math.floor(r() * 7), len = 3 + Math.floor(r() * 4)
    for (let q = 0; q < len; q++) { const x = x0 + q * 2, y = y0 + q; if (DIA(x + 1, y + 1) && DIA(x - 1, y)) { c.hline(x, y, 2, "L"); c.px(x, y - 1, "c") } }
  }
  if (v === 2) sprinkle(c, s + 4, ["R\nL"], 1)
  if (v === 3) sprinkle(c, s + 4, ["i"], 1)
  if (v === 1) sprinkle(c, s + 5, ["C"], 2)
})
tileSet("ice", (c, v, s) => {
  fillDia(c, "i")
  sprinkle(c, s, ["B", "BB"], 2)
  // a crack and a couple of diagonal glints
  const r = c.rng(s)
  let x = 8 + Math.floor(r() * 12), y = 5 + Math.floor(r() * 4)
  for (let k = 0; k < 8 + v * 2; k++) { if (DIA(x, y) && DIA(x + 1, y + 1) && DIA(x - 1, y - 1)) c.px(x, y, "B"); x += r() < 0.6 ? 1 : 0; y += r() < 0.4 ? 1 : r() < 0.3 ? -1 : 0 }
  sprinkle(c, s + 2, ["c.\n.c", "cc", "c"], 2)
})

// ------------------------------------------------------------------ Old Crypt flagstones
tileSet("crypt_flag", (c, v, s) => {
  const cell = (x, y) => { const [i, j] = isoUV(x, y), a = Math.floor(i * 2), b = Math.floor(j * 2 + (a % 2) * 0.5 + (v % 2) * 0.25); return a + "," + b }
  stones(c, cell, (id) => (hash(id.length, id.charCodeAt(0) + id.charCodeAt(2) * 7, v) < 0.3 ? "R" : "r"), "S", "R", null)
  if (v === 1) sprinkle(c, s, ["g", "gg"], 2, 0)
  if (v === 2) sprinkle(c, s, ["S.\n.S", "S"], 1)                          // crack
  if (v === 3) sprinkle(c, s, ["l"], 1)                                    // a glint of moon-dust
})

// ------------------------------------------------------------------ village cobble
// Cobbles: a 3x3 iso grid of rounded stones set in mortar; stones stay inside the tile so the
// mortar line at the seam reads as just another joint.
tileSet("cobble", (c, v, s) => {
  fillDia(c, "R")
  const r = c.rng(s)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const fi = (i + 0.5) / 3, fj = (j + 0.5) / 3
    const cx = Math.round(16 + (fi - fj) * 16 + (r() - 0.5) * 1.5), cy = Math.round((fi + fj) * 8 - 0.5)
    const body = r() < 0.25 ? "C" : "q"
    const hl = (x, y, n, col) => { for (let q = 0; q < n; q++) if (DIA(x + q, y)) c.px(x + q, y, col) }
    hl(cx - 3, cy - 1, 6, body); hl(cx - 4, cy, 8, body); hl(cx - 3, cy + 1, 6, "r")
    hl(cx - 2, cy - 1, 3, "c"); if (r() < 0.5) hl(cx + 2, cy, 1, "C")
  }
  if (v === 2) sprinkle(c, s, ["h"], 2, 0)
  if (v === 3) sprinkle(c, s, ["g"], 1, 0)
})

// ------------------------------------------------------------------ edge fringes (overlay a neighbour tile)
// side: which edge of THIS tile touches the other surface. Rows 0..7 = upper edges, 8..15 = lower.
const SIDES = { ne: [0, 1], se: [1, 1], sw: [1, 0], nw: [0, 0] }   // [lower?, right?]
function fringe(name, cols, depth, seed, tipCol) {
  for (const [side, [lower, right]] of Object.entries(SIDES)) {
    sprite(`edge_${name}_${side}`, T, (c) => {
      const r = c.rng(seed + side.length + (lower ? 7 : 0) + (right ? 3 : 0))
      for (let y = lower ? 8 : 0; y < (lower ? 16 : 8); y++) {
        const [x0, w] = diaRow(y)
        const d = Math.max(1, Math.round(depth[0] + r() * (depth[1] - depth[0])))
        for (let k = 0; k < d && k < w; k++) {
          const x = right ? x0 + w - 1 - k : x0 + k
          c.px(x, y, k === d - 1 ? cols[1] : cols[0])
        }
        if (tipCol && r() < 0.35) { const k = d, x = right ? x0 + w - 1 - k : x0 + k; if (DIA(x, y - 1)) c.px(x, y - 1, tipCol) }
      }
    })
  }
}
fringe("grass", ["H", "h"], [1, 4], 11, "h")       // grass creeping onto a path/soil tile
fringe("wild", ["h", "g"], [2, 5], 19, "g")
fringe("shore", ["i", "c"], [1, 2], 23, null)       // foam on a water tile next to land
fringe("snow", ["c", "L"], [2, 5], 29, null)        // drifts onto a non-snow tile
fringe("moss", ["G", "g"], [1, 4], 31, "g")

// ------------------------------------------------------------------ side skirts (map borders), 32x26, anchor (16,8)
function skirt(name, top, face, faceDark, deep, fleck) {
  sprite(name, { w: 32, h: 26 }, (c) => {
    const r = c.rng(name.length)
    for (let x = 0; x < 32; x++) {
      let y0 = 15; while (y0 > 0 && !DIA(Math.min(30, Math.max(1, x)), y0)) y0--
      y0++                                                // first row below the diamond
      for (let y = y0 - 1; y < y0 + 9 && y < 26; y++) {
        const dy = y - y0
        let col = x < 16 ? face : faceDark
        if (dy <= 0) col = top; else if (dy >= 7) col = deep
        else if (fleck && r() < 0.08) col = fleck
        c.px(x, y, col)
      }
    }
  })
}
skirt("side_earth", "g", "D", "d", "k", "w")
skirt("side_stone", "R", "r", "S", "j", "R")
skirt("side_snow", "c", "L", "l", "m", "c")
skirt("side_crypt", "r", "S", "m", "x", null)
