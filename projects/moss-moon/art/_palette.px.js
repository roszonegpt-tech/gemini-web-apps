// Moss Moon master palette (40 colors) + light ramps + shared helpers.
// Included by every art/*.px.js. Keep tools/../art/meta.js `palette` in sync (build audits it).
pal({
  k: "#263a37", j: "#2f4b47", t: "#46695f", T: "#6a907f",                 // ink + teal shadows
  G: "#4b7052", g: "#688d65", h: "#87ad7b", H: "#a6c593", y: "#d2e3ad",   // moss greens
  d: "#4a3a31", D: "#6e5642", w: "#8f7a5a", W: "#b89d72", s: "#c8aa86",   // bark, wood, soil, straw
  S: "#4e5660", r: "#737d7e", R: "#9ea79f", q: "#d5d6bd",                 // cool stone
  c: "#f7f4e9", C: "#e2dcc2",                                             // cream, paper, snow
  a: "#9a7444", o: "#cfaa71", O: "#eac979", Y: "#fff3c4",                 // brass + lantern gold
  m: "#4f4566", v: "#8a78a8", l: "#c6aedb", L: "#ebe1f7",                 // moonlight violets
  b: "#36636f", B: "#5f9ca3", i: "#a5d6d8",                               // water, ice
  e: "#8a4a40", E: "#d27a55", p: "#e8b8a8", f: "#c95d6a",                 // brick, ember, blossom, berry
  x: "#2e2638", X: "#7b4f7d", z: "#8ff0d0",                               // blight, spirit glow
  u: "#59573a", U: "#8b8a58",                                             // swamp olive
})
// dark -> light. Shadows step toward teal (cool), highlights toward cream (warm).
ramps("kjGghHy", "kjtT", "kdDwWs", "jSrRqc", "daoOY", "xmvlL", "jbBi", "deEp", "efp", "xXl", "kuUW", "qCc", "Tz")

const TAU = Math.PI * 2

// 32x16 iso diamond: rows 0..7 are 2,6,..,30 px wide, rows 8..15 mirror. Tiles placed at
// (+-16, +-8) offsets tessellate with no gaps or overlaps. Anchor (16, 8).
const DIA = (x, y) => { if (y < 0 || y > 15 || x < 0 || x > 31) return false; const k = y < 8 ? y : 15 - y; return x >= 15 - 2 * k && x <= 16 + 2 * k }
const diaRow = (y) => { const k = y < 8 ? y : 15 - y; return [15 - 2 * k, 4 * k + 2] }
// iso coords inside the tile: i runs along the NE edge direction, j along the NW one, both 0..1.
const isoUV = (x, y) => { const dx = x + 0.5 - 16, dy = y + 0.5; return [dx / 32 + dy / 16, dy / 16 - dx / 32] }
// small deterministic hash
const hash = (a, b, s = 0) => { let h = (a * 374761393 + b * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

function fillDia(c, col) { for (let y = 0; y < 16; y++) { const [x, w] = diaRow(y); c.hline(x, y, w, col) } }
// Place small grid strings at random spots fully inside the diamond (never cut at seams).
function sprinkle(c, seed, parts, count, inset = 1) {
  const r = c.rng(seed); let placed = 0, tries = 0
  while (placed < count && tries++ < count * 40) {
    const g = parts[Math.floor(r() * parts.length)], rows = g.split("\n"), gw = Math.max(...rows.map((s) => s.length)), gh = rows.length
    const x = Math.floor(r() * (32 - gw)), y = Math.floor(r() * (16 - gh))
    let ok = true
    for (let yy = -inset; yy < gh + inset && ok; yy++) for (const xx of [-inset, gw - 1 + inset]) if (!DIA(x + xx, y + yy)) ok = false
    if (!ok) continue
    c.grid(x, y, g); placed++
  }
}
// Cell-pattern stones (flagstones, cobbles): cellOf(x, y) -> id. Joints go on the right/bottom
// side of each cell (incl. the tile's lower edges), highlights on the top/left (light from top-left).
function stones(c, cellOf, body, joint, hi, lo, opts = {}) {
  const id = (x, y) => (DIA(x, y) ? cellOf(x, y) : "out")
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    if (!DIA(x, y)) continue
    const me = id(x, y)
    const isJoint = id(x + 1, y) !== me || id(x, y + 1) !== me
    const tl = id(x - 1, y) !== me || id(x, y - 1) !== me
    const col = typeof body === "function" ? body(me, x, y) : body
    c.px(x, y, isJoint ? joint : tl && hi ? hi : col)
    if (!isJoint && !tl && lo && (id(x + 2, y) !== me && id(x + 1, y + 1) !== me)) c.px(x, y, lo)
  }
}
