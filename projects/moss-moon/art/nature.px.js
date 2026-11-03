// Nature props: trees per region, bushes, rocks, fungi, reeds, ice crystals, small flora.
// Anchor: bottom-centre (trunk base). Light from the top-left, shadows lean teal.
include("_palette.px.js")

// One leafy blob: dark rim, mid body offset up-left, highlight, sparkle. Drawn back to front.
function blob(c, cx, cy, r, cols = "Gghy") {
  const [dk, md, hi, sp] = cols
  c.circ(cx, cy, r, dk)
  c.circ(cx - 1, cy - 1, r - 1, md)
  if (r >= 4) c.circ(cx - 2, cy - 2, Math.max(1, r - 3), hi)
  if (r >= 5 && sp) { c.px(cx - 3, cy - 3, sp); c.px(cx - 1, cy - r + 1, sp) }
}
function trunk(c, x, yTop, yBot, w, cols = "dDw") {
  const [dk, md, hi] = cols
  c.rect(x - Math.floor(w / 2), yTop, w, yBot - yTop + 1, md)
  c.vline(x - Math.floor(w / 2), yTop, yBot - yTop + 1, hi)
  c.vline(x - Math.floor(w / 2) + w - 1, yTop, yBot - yTop + 1, dk)
  // root flare
  c.hline(x - Math.floor(w / 2) - 1, yBot, w + 2, md); c.px(x - Math.floor(w / 2) - 1, yBot, hi); c.px(x + w - Math.floor(w / 2), yBot, dk)
  c.hline(x - Math.floor(w / 2) - 2, yBot, 1, hi)
}
function branch(c, x, y, ang, len, wid, depth, r, col, hi, tip) {
  const x2 = Math.round(x + Math.cos(ang) * len), y2 = Math.round(y - Math.sin(ang) * len)
  c.line(Math.round(x), Math.round(y), x2, y2, col, wid)
  if (wid >= 2 && hi) c.line(Math.round(x) - 1, Math.round(y), x2 - 1, y2, hi)
  if (depth <= 0) { if (tip) c.px(x2, y2, tip); return }
  const spread = 0.35 + r() * 0.4
  branch(c, x2, y2, ang + spread, len * (0.6 + r() * 0.2), Math.max(1, wid - 1), depth - 1, r, col, hi, tip)
  branch(c, x2, y2, ang - spread * (0.8 + r() * 0.4), len * (0.55 + r() * 0.2), Math.max(1, wid - 1), depth - 1, r, col, hi, tip)
}

// ------------------------------------------------------------------ healthy grove oak (3 shapes)
const OAKS = [
  [[12, 26, 8], [27, 25, 8], [19, 17, 10], [11, 15, 6], [28, 14, 6], [19, 28, 7]],
  [[10, 27, 7], [26, 28, 8], [17, 18, 9], [27, 17, 7], [12, 13, 6], [20, 9, 6], [18, 29, 7]],
  [[13, 24, 9], [26, 24, 8], [20, 13, 9], [10, 16, 5], [30, 16, 5], [20, 27, 8]],
]
OAKS.forEach((blobs, v) => sprite(`tree_oak_${v}`, { w: 40, h: 54, outline: "k" }, (c) => {
  trunk(c, 19, 28, 53, 5)
  c.px(17, 40, "d"); c.px(18, 41, "d"); c.px(21, 46, "w")
  for (const [x, y, r] of blobs) blob(c, x, y, r)
  c.shade((x, y) => y > 30 && c.is(x, y, "g"), 1)                      // underside of the crown
  if (v === 1) for (const [x, y] of [[9, 20], [24, 12], [29, 22], [15, 26], [20, 6]]) { c.px(x, y, "p"); c.px(x + 1, y, "c") }
  if (v === 2) for (const [x, y] of [[13, 19], [25, 20], [19, 9]]) c.px(x, y, "O")
}))

// ------------------------------------------------------------------ Blighted Forest dead tree
sprite("tree_blighted", { w: 44, h: 58, outline: "k" }, (c) => {
  const r = c.rng(7)
  branch(c, 22, 57, Math.PI / 2 + 0.05, 20, 5, 3, r, "m", "v", "X")
  c.line(20, 57, 13, 57, "m", 2); c.line(24, 57, 31, 56, "m", 2)               // roots
  c.px(12, 56, "x"); c.px(32, 55, "x")
  for (const [x, y] of [[21, 48], [23, 42], [20, 34]]) { c.px(x, y, "X"); c.px(x + 1, y, "l") }
  c.grid(18, 50, "xx\n.x")                                                       // hollow
})
sprite("tree_blighted_small", { w: 28, h: 40, outline: "k" }, (c) => {
  const r = c.rng(21)
  branch(c, 14, 39, Math.PI / 2 - 0.1, 14, 4, 2, r, "m", "v", "X")
  c.px(15, 30, "X")
})

// ------------------------------------------------------------------ Whispering Swamp willow
sprite("tree_willow", { w: 48, h: 56, outline: "k" }, (c) => {
  trunk(c, 24, 26, 55, 6, "dDw")
  c.line(21, 30, 14, 22, "D", 2); c.line(27, 30, 34, 21, "D", 2)
  for (const [x, y, r] of [[14, 20, 8], [34, 19, 8], [24, 13, 11], [24, 22, 8]]) blob(c, x, y, r, "tThy")
  // hanging strands, longer toward the sides
  const r = c.rng(3)
  for (let x = 3; x < 46; x += 2) {
    let top = 0; while (top < 40 && !c.is(x, top, "*")) top++
    if (top >= 40) continue
    let bot = top; while (bot < 40 && c.is(x, bot, "*")) bot++
    const len = 6 + Math.floor(r() * 10) + (Math.abs(x - 24) > 10 ? 8 : 0)
    if (x > 19 && x < 30) continue
    c.vline(x, bot - 1, len, x % 4 ? "T" : "t"); c.px(x, bot - 1 + len, "h")
  }
  c.grid(20, 50, "uU..UUu")
})

// ------------------------------------------------------------------ Frostpeak snowy pine
sprite("tree_pine_snow", { w: 34, h: 56, outline: "k" }, (c) => {
  c.rect(15, 46, 4, 10, "D"); c.vline(15, 46, 10, "w"); c.vline(18, 46, 10, "d")
  const tiers = [[49, 16, 14], [39, 13, 13], [29, 10, 12], [19, 7, 11]]
  for (const [yb, hw, th] of tiers) {
    const top = yb - th
    c.poly([17 - hw, yb, 17, top, 18, top, 18 + hw, yb], "G")
    c.poly([18, top, 18 + hw, yb, 18, yb], "j")                              // shaded right side
    c.poly([17 - hw + 3, yb - 2, 17, top + 3, 17, yb - 2], "g")              // lit left face
    c.hline(17 - hw, yb, hw * 2 + 2, "j")
    // snow blanket on the top of each tier (wavy lower edge), lavender where it is in shade
    for (let y = top; y < yb; y++) for (let x = 0; x < 34; x++) {
      const lim = top + Math.round(th * 0.42 + Math.sin(x * 1.3 + yb) * 1.2)
      if (y > lim) continue
      if (c.is(x, y, "Gg")) c.px(x, y, "c"); else if (c.is(x, y, "j")) c.px(x, y, "L")
    }
  }
  c.grid(16, 6, ".c\ncc")
})

// ------------------------------------------------------------------ Old Crypt dead tree (pale, mossy)
sprite("tree_crypt", { w: 40, h: 54, outline: "k" }, (c) => {
  const r = c.rng(12)
  branch(c, 20, 53, Math.PI / 2 - 0.08, 18, 4, 3, r, "r", "R", "S")
  c.line(18, 53, 12, 53, "r", 2); c.line(22, 53, 28, 52, "S", 2)
  for (const [x, y, len] of [[11, 18, 7], [30, 15, 9], [24, 9, 5], [16, 24, 5]]) { c.vline(x, y, len, "T"); c.px(x, y + len, "t") }
  c.grid(19, 40, "SS\nS.")
})

// ------------------------------------------------------------------ bushes
const bushBlobs = [[[6, 9, 5], [14, 9, 5], [10, 6, 5]], [[5, 10, 4], [11, 7, 5], [17, 10, 4], [11, 11, 4]]]
bushBlobs.forEach((bl, v) => sprite(`bush_${v}`, { w: 22, h: 15, outline: "k" }, (c) => { for (const [x, y, r] of bl) blob(c, x, y, r); c.shade((x, y) => y > 12 && c.is(x, y, "g"), 1) }))
sprite("bush_berry", { base: "bush_0" }, (c) => { for (const [x, y] of [[6, 7], [12, 5], [15, 9], [9, 11], [4, 11]]) { c.px(x, y, "f"); c.px(x + 1, y + 1, "e") } c.px(12, 4, "p") })
sprite("bush_blight", { base: "bush_1", swap: { G: "x", g: "m", h: "v", y: "X" } }, (c) => { c.px(8, 5, "X"); c.px(15, 8, "l") })
sprite("bush_swamp", { base: "bush_1", swap: { G: "t", g: "T", h: "h" } })
sprite("bush_snow", { base: "bush_0" }, (c) => {
  for (let x = 0; x < c.w; x++) { let y = 0; while (y < c.h && !c.is(x, y, "*")) y++; if (y < c.h - 2) { c.px(x, y + 1, "c"); if (x % 3) c.px(x, y + 2, "L") } }
})

// ------------------------------------------------------------------ rocks
const rock = (c, cx, cy, rx, ry) => { c.ellipse(cx, cy, rx, ry, "S"); c.ellipse(cx - 1, cy - 1, rx - 1, ry - 1, "r"); c.ellipse(cx - 2, cy - 2, Math.max(1, rx - 3), Math.max(1, ry - 2), "R") }
sprite("rock_0", { w: 14, h: 9, outline: "k" }, (c) => { rock(c, 7, 5, 6, 4); c.px(4, 2, "q") })
sprite("rock_1", { w: 20, h: 13, outline: "k" }, (c) => { rock(c, 10, 7, 9, 6); c.px(6, 3, "q"); c.line(11, 4, 13, 9, "S"); c.px(12, 5, "S") })
sprite("rock_2", { w: 20, h: 10, outline: "k" }, (c) => { rock(c, 6, 6, 5, 4); rock(c, 14, 7, 5, 3); rock(c, 10, 8, 3, 2) })
sprite("rock_moss", { base: "rock_1" }, (c) => {
  for (let x = 1; x < c.w - 1; x++) { let y = 0; while (y < c.h && !c.is(x, y, "rRSq")) y++; if (y < c.h && x < 15) { c.px(x, y, x % 3 ? "g" : "h"); if (x % 2) c.px(x, y + 1, "g") } }
  c.grid(3, 4, "h.\nG.")
})
sprite("rock_snow", { base: "rock_1" }, (c) => {
  for (let x = 1; x < c.w - 1; x++) { let y = 0; while (y < c.h && !c.is(x, y, "rRSq")) y++; if (y < c.h) { c.px(x, y, "c"); if (x < 14) c.px(x, y + 1, x % 3 ? "c" : "L") } }
})
sprite("rock_crypt", { w: 16, h: 14, outline: "k" }, (c) => {            // broken pillar stump
  c.rect(3, 3, 10, 11, "r"); c.vline(3, 3, 11, "R"); c.vline(12, 3, 11, "S")
  c.ellipse(8, 3, 5, 2, "R"); c.px(6, 2, "q"); c.grid(9, 6, "S\nSS\n.S"); c.hline(3, 13, 10, "S")
  c.grid(2, 11, "g.\ngg")
})

// ------------------------------------------------------------------ mushrooms & glowing fungi
sprite("mushroom_red", { w: 9, h: 9, outline: "k" }, `
  ..eeeee..
  .eEcEEEe.
  eEEEEcEEe
  eeeeeeeee
  ...cCc...
  ...cCc...
  ...cCc...
  ..ccCCc..
  ..gGgGg..`)
sprite("mushroom_brown", { w: 12, h: 8, outline: "k" }, `
  .DDD........
  DwWwD...DDD.
  DDDDD..DwWD.
  ..CC...DDDD.
  ..CC....CC..
  .CCC....CC..
  .gCg...gCCg.
  gggg...gggg.`)
const capGlow = (c, x, y, w, k, body, hi, stem) => {
  c.hline(x + 1, y, w - 2, k > 0 ? hi : body); c.hline(x, y + 1, w, body); c.hline(x, y + 2, w, body)
  c.px(x + 1, y + 1, hi); c.hline(x, y + 2, w, body === "z" ? "B" : "v")
  c.vline(x + Math.floor(w / 2), y + 3, 3, stem)
}
for (const [name, body, hi, spore] of [["mushroom_glow", "z", "c", "i"], ["mushroom_moon", "l", "L", "L"]])
  anim(name, { w: 14, h: 12, frames: 4, fps: 4, outline: "k" }, (c) => {
    const k = Math.sin(c.phase * TAU)
    capGlow(c, 1, 4, 6, k, body, hi, "C"); capGlow(c, 7, 2, 6, -k, body, hi, "C"); capGlow(c, 5, 7, 4, k, body, hi, "C")
    c.hline(1, 11, 12, "g"); c.px(3, 10, "g"); c.px(11, 10, "G")
    const sy = 3 - c.frame; if (sy >= 0) c.px(3 + c.frame, sy, spore)
  })

// ------------------------------------------------------------------ reeds, tall grass, water plants
anim("reeds_0", { w: 16, h: 24, frames: 4, fps: 3, outline: "k" }, (c) => {
  const s = Math.round(Math.sin(c.phase * TAU))
  const stalk = (x, h, lean, head) => {
    for (let y = 0; y < h; y++) { const xx = x + Math.round((lean + s) * (y / h) ** 2); c.px(xx, 23 - y, y > h - 3 ? "h" : "g") }
    if (head) { const xx = x + lean + s; c.vline(xx, 23 - h - 3, 4, "D"); c.px(xx, 23 - h - 3, "w"); c.px(xx, 23 - h - 4, "g") }
  }
  stalk(3, 14, -2, false); stalk(6, 18, -1, true); stalk(8, 13, 0, false); stalk(10, 19, 1, true); stalk(12, 12, 2, false); stalk(5, 9, -1, false)
  c.hline(2, 23, 12, "G")
})
sprite("reeds_1", { w: 12, h: 18, outline: "k" }, (c) => {
  for (const [x, h, l] of [[2, 12, -1], [4, 16, 0], [6, 10, 1], [8, 14, 1], [10, 9, 2]]) c.line(x, 17, x + l, 17 - h, h > 13 ? "T" : "g")
  c.vline(4, 1, 4, "D"); c.px(4, 0, "w"); c.hline(1, 17, 10, "t")
})
anim("grass_tall", { w: 14, h: 12, frames: 4, fps: 3, outline: "k" }, (c) => {
  const s = Math.round(Math.sin(c.phase * TAU) * 0.8)
  for (const [x, h, l] of [[1, 6, -1], [3, 9, 0], [5, 11, 1], [7, 8, 1], [9, 10, 2], [11, 6, 1], [6, 5, 0]])
    c.line(x, 11, x + l + s, 11 - h, h > 8 ? "h" : "g")
  c.px(5 + 1 + s, 0, "y")
})
sprite("lilypad", { w: 14, h: 7, outline: "t" }, `
  ...gggggg...
  .ggHgggggg..
  gghgggg.ggg.
  ggggggg..ggg
  .gGggggggGg.
  ...GGGGGG...`, (c) => c.grid(9, 0, "pc\n.p"))
sprite("flowers_moon", { w: 14, h: 9, outline: "k" }, `
  .l.....L.....
  lLl...lLl..l.
  .l.l...l..lLl
  .g.Ll..g...l.
  .g..l..g...g.
  ..g.g.g...g..
  ..g.gg...g...
  .gGggGg.gG...`)
sprite("flowers_wild", { w: 12, h: 7, outline: "k" }, `
  .O...p.....
  OYO.pcp..O.
  .O...p..OYO
  .g...g...O.
  ..g.g..g.g.
  .gGggGggGg.`)
sprite("stump", { w: 16, h: 11, outline: "k" }, (c) => {
  c.rect(2, 3, 12, 7, "D"); c.vline(2, 3, 7, "w"); c.vline(13, 3, 7, "d")
  c.ellipse(8, 3, 6, 2, "W"); c.ellipse(8, 3, 3, 1, "s"); c.px(8, 3, "w")
  c.hline(0, 9, 16, "D"); c.px(0, 9, "w"); c.px(15, 9, "d"); c.grid(3, 7, "g\ngh")
})
sprite("log", { w: 26, h: 10, outline: "k" }, (c) => {
  c.line(4, 6, 21, 3, "D", 4); c.line(4, 5, 21, 2, "w"); c.line(5, 7, 21, 5, "d")
  c.ellipse(22, 3, 2, 3, "W"); c.px(22, 3, "s"); c.grid(9, 2, "gh.\n.gg"); c.px(14, 3, "g")
})

// ------------------------------------------------------------------ Frostpeak ice crystals
const shard = (c, x, yb, h, w, lean = 0) => {
  const top = yb - h
  c.poly([x, yb, x + lean + Math.floor(w / 2), top, x + w, yb], "i")
  c.poly([x + lean + Math.floor(w / 2), top, x + w, yb, x + Math.floor(w / 2) + 1, yb], "B")
  c.line(x + 1, yb - 1, x + lean + Math.floor(w / 2), top + 1, "c")
}
sprite("ice_crystal_0", { w: 18, h: 18, outline: "k" }, (c) => { shard(c, 6, 17, 16, 6, 0); shard(c, 1, 17, 9, 5, -1); shard(c, 11, 17, 11, 5, 2); c.hline(0, 17, 18, "L") })
anim("ice_crystal_1", { w: 22, h: 26, frames: 4, fps: 4, outline: "k" }, (c) => {
  shard(c, 7, 25, 24, 8, 0); shard(c, 1, 25, 13, 6, -1); shard(c, 14, 25, 16, 6, 2); shard(c, 4, 25, 6, 4, 0)
  c.hline(0, 25, 22, "L")
  const pts = [[10, 4], [4, 14], [17, 12], [12, 16]], [x, y] = pts[c.frame]
  c.px(x, y, "c"); if (c.frame % 2 === 0) { c.px(x - 1, y, "L"); c.px(x + 1, y, "L"); c.px(x, y - 1, "L"); c.px(x, y + 1, "L") }
})
sprite("snow_mound", { w: 20, h: 8, outline: "k" }, (c) => { c.ellipse(10, 5, 9, 3, "L"); c.ellipse(9, 4, 8, 3, "c"); c.px(4, 3, "c") })
