// Farming: 6 crops x (seed, sprout, growing, ripe) + crop_<id>_sparkle (ripe, 4-frame twinkle),
// plus soil_watered (32x16 overlay for a watered plot). Crops stand on the plot centre (bottom-centre anchor).
// Crops: wheat, ember_pepper, frost_berry, moonflower, glowcap (new), starmint (new).
include("_palette.px.js")

const CW = 15, CH = 22, BX = 7, BY = 21          // canvas + base point for growing/ripe stages

// leaf: a 3px diagonal blade; dir -1 left, +1 right
const leaf = (c, x, y, dir, col, hi) => { c.px(x, y, col); c.px(x + dir, y - 1, col); c.px(x + 2 * dir, y - 1, hi || col) }
const stem = (c, x1, y1, col) => c.line(BX, BY, x1, y1, col)
const blob = (c, x, y, r, dk, md, hi) => { c.circ(x, y, r, dk); c.circ(x - 1, y - 1, Math.max(0, r - 1), md); if (hi) c.px(x - 1, y - r + 1, hi) }

// ------------------------------------------------------------------ seed + sprout stages (shared shapes, crop tints)
const SEEDCOL = { wheat: "O", ember_pepper: "E", frost_berry: "i", moonflower: "l", glowcap: "z", starmint: "Y" }
for (const [id, sc] of Object.entries(SEEDCOL)) {
  sprite(`crop_${id}_seed`, { w: 11, h: 5, outline: "k" }, (c) => {
    c.ellipse(5, 3, 5, 1, "D"); c.hline(2, 2, 6, "w"); c.px(3, 1, "w"); c.px(4, 1, "W")
    c.px(3, 2, sc); c.px(6, 3, sc); c.px(8, 2, sc)
  })
}
const SPROUT = {
  wheat: ["g", "h", "y"], ember_pepper: ["G", "g", "h"], frost_berry: ["t", "T", "i"],
  moonflower: ["g", "h", "l"], glowcap: ["B", "i", "z"], starmint: ["g", "h", "y"],
}
for (const [id, [dk, md, hi]] of Object.entries(SPROUT)) {
  sprite(`crop_${id}_sprout`, { w: 9, h: 8, outline: "k" }, (c) => {
    if (id === "glowcap") { c.vline(4, 4, 3, "C"); c.grid(2, 2, ".zz.\nzBBz"); c.vline(7, 6, 1, "C"); c.px(7, 5, "B"); c.hline(1, 7, 7, "D"); return }
    c.vline(4, 3, 4, dk); leaf(c, 3, 4, -1, md, hi); leaf(c, 5, 3, 1, md, hi); c.px(4, 2, hi)
    if (id === "wheat") { c.vline(2, 4, 3, md); c.px(2, 3, hi) }
    c.hline(1, 7, 7, "D")
  })
}

// ------------------------------------------------------------------ growing + ripe stages
const grain = (c, x, y, ripe) => {   // a wheat ear, 3x5
  const a = ripe ? "O" : "h", b = ripe ? "o" : "g", t = ripe ? "Y" : "y"
  c.px(x, y - 1, t); c.vline(x, y, 4, b); c.vline(x - 1, y + 1, 3, a); c.vline(x + 1, y + 1, 3, a)
}
const pepper = (c, x, y) => { c.px(x, y, "G"); c.vline(x, y + 1, 3, "E"); c.vline(x + 1, y + 1, 2, "e"); c.px(x, y + 1, "p"); c.px(x + 1, y + 3, "E"); c.px(x + 1, y + 4, "e") }
const berries = (c, x, y) => { c.px(x, y, "B"); c.px(x + 1, y, "i"); c.px(x, y + 1, "i"); c.px(x + 1, y + 1, "B"); c.px(x, y - 1, "c") }
const star = (c, x, y, k = "Y", m = "O") => { c.px(x, y, m); c.px(x - 1, y, k); c.px(x + 1, y, k); c.px(x, y - 1, k); c.px(x, y + 1, k) }
const cap = (c, x, y, w, body, hi, rim) => { c.hline(x + 1, y, w - 2, hi); c.hline(x, y + 1, w, body); c.hline(x, y + 2, w, rim); c.px(x + 1, y + 1, hi); c.vline(x + Math.floor(w / 2), y + 3, 3, "C") }

const PLANTS = {
  wheat: {
    growing: (c) => { for (const [x, y] of [[3, 9], [7, 6], [11, 8]]) { stem(c, x, y, "g"); grain(c, x, y - 4, false) } leaf(c, 6, 16, -1, "h"); leaf(c, 8, 14, 1, "h") },
    ripe: (c) => {
      for (const [x, y] of [[2, 8], [7, 4], [12, 7]]) { stem(c, x, y, "W"); grain(c, x, y - 5, true); c.px(x, y - 1, "o") }
      leaf(c, 6, 15, -1, "w"); leaf(c, 8, 13, 1, "W"); c.px(BX, BY - 3, "e"); c.px(BX - 1, BY - 3, "E"); c.px(BX + 1, BY - 3, "E")
    },
  },
  ember_pepper: {
    growing: (c) => { stem(c, 7, 9, "G"); stem(c, 4, 13, "G"); stem(c, 10, 12, "G"); blob(c, 7, 9, 3, "G", "g", "h"); blob(c, 4, 13, 3, "G", "g", "h"); blob(c, 11, 12, 3, "G", "g", "h"); c.px(8, 13, "E") },
    ripe: (c) => { stem(c, 7, 7, "G"); stem(c, 3, 11, "G"); stem(c, 11, 10, "G"); blob(c, 7, 7, 4, "G", "g", "h"); blob(c, 3, 11, 3, "G", "g", "h"); blob(c, 11, 10, 3, "G", "g", "h"); pepper(c, 5, 11); pepper(c, 9, 13); pepper(c, 12, 12); pepper(c, 2, 14) },
  },
  frost_berry: {
    growing: (c) => { stem(c, 4, 11, "t"); stem(c, 10, 10, "t"); blob(c, 5, 12, 3, "t", "T", "i"); blob(c, 10, 11, 3, "t", "T", "i"); blob(c, 7, 9, 3, "t", "T", "c"); c.px(8, 12, "i") },
    ripe: (c) => { stem(c, 4, 10, "t"); stem(c, 10, 9, "t"); blob(c, 4, 11, 4, "t", "T", "c"); blob(c, 11, 10, 3, "t", "T", "c"); blob(c, 7, 7, 4, "t", "T", "c"); for (const [x, y] of [[3, 10], [8, 6], [11, 9], [6, 12], [10, 13], [2, 14]]) berries(c, x, y) },
  },
  moonflower: {
    growing: (c) => { stem(c, 7, 6, "g"); leaf(c, 6, 15, -1, "g", "h"); leaf(c, 8, 12, 1, "g", "h"); leaf(c, 6, 10, -1, "h"); c.grid(6, 2, ".v.\nvlv\nvlv\n.g.") },
    ripe: (c) => {
      stem(c, 7, 8, "g"); leaf(c, 6, 16, -1, "g", "h"); leaf(c, 8, 13, 1, "g", "h"); leaf(c, 6, 11, -1, "h")
      c.grid(2, 0, "...L.L...\n..LlLlL..\n.LllLllL.\nLllvOvllL\n.lvOYOvl.\nLllvOvllL\n.LllvllL.\n..lL.Ll..")
    },
  },
  glowcap: {
    growing: (c) => { cap(c, 3, 10, 5, "B", "i", "b"); cap(c, 8, 12, 4, "B", "i", "b") },
    ripe: (c) => { cap(c, 1, 10, 6, "z", "c", "B"); cap(c, 6, 6, 7, "z", "c", "B"); cap(c, 10, 12, 4, "z", "c", "B"); c.px(4, 8, "i"); c.px(13, 9, "z") },
  },
  starmint: {
    growing: (c) => { for (const [x, d] of [[4, -1], [10, 1], [7, -1]]) { stem(c, x, 13, "g"); blob(c, x, 13, 2, "G", "h", "y") } blob(c, 7, 11, 2, "g", "h", "y") },
    ripe: (c) => {
      for (const x of [3, 11, 7]) { stem(c, x, 12, "g"); blob(c, x, 12, 3, "G", "h", "y") } blob(c, 7, 9, 3, "g", "h", "y")
      for (const [x, y] of [[3, 7], [7, 4], [12, 6], [9, 9]]) { c.vline(x, y + 2, 2, "g"); star(c, x, y) }
    },
  },
}
for (const [id, p] of Object.entries(PLANTS)) {
  sprite(`crop_${id}_growing`, { w: CW, h: CH, outline: "k" }, p.growing)
  sprite(`crop_${id}_ripe`, { w: CW, h: CH, outline: "k" }, p.ripe)
}
// sparkle: ripe crop + a twinkle that hops around (frame 3 rests)
const SPARK = [[3, 3], [12, 2], [9, 8], null]
for (const id of Object.keys(PLANTS))
  anim(`crop_${id}_sparkle`, { base: `crop_${id}_ripe`, fps: 6 },
    ...SPARK.map((p) => frame(p ? (c) => { const [x, y] = p; c.px(x, y, "c"); c.px(x - 1, y, "Y"); c.px(x + 1, y, "Y"); c.px(x, y - 1, "Y"); c.px(x, y + 1, "Y") } : () => {})))

// ------------------------------------------------------------------ watered-soil overlay (draw over a dry plot)
sprite("soil_watered", { w: 32, h: 16 }, (c) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    if (!DIA(x, y)) continue
    const m = (((2 * y - x) % 8) + 8) % 8
    if ((m === 0 || m === 1) && (x >> 1) % 2 === 0) c.px(x, y, "d")
    else if ((x * 3 + y * 5) % 11 === 0 && DIA(x - 2, y) && DIA(x + 2, y)) c.px(x, y, "B")
  }
  for (const [x, y] of [[10, 6], [19, 9], [14, 11]]) { c.px(x, y, "i"); c.px(x + 1, y, "B") }
})
