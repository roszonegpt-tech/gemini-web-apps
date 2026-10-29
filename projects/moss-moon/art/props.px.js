// Placeable props. Anchor: bottom-centre ground point (fences: midpoint of the segment).
// Iso boxes: top face lightest, left (SW) face lit, right (SE) face in cool shade.
include("_palette.px.js")

// Iso box: (x, y) = top vertex of the top face, hw = half width (2:1 slope), h = wall height.
function isoBox(c, x, y, hw, h, top, left, right) {
  const hh = Math.floor(hw / 2)
  c.poly([x - hw, y + hh, x, y + 2 * hh, x, y + 2 * hh + h, x - hw, y + hh + h], left)
  c.poly([x, y + 2 * hh, x + hw, y + hh, x + hw, y + hh + h, x, y + 2 * hh + h], right)
  c.poly([x, y, x + hw, y + hh, x, y + 2 * hh, x - hw, y + hh], top)
}
function post(c, x, y, h, cols = "Wwd") { c.vline(x, y, h, cols[0]); c.vline(x + 1, y, h, cols[1]); c.vline(x + 2, y, h, cols[2]); c.px(x + 1, y, cols[0]) }

// ------------------------------------------------------------------ fences (along world x: screen down-right)
const fenceX = (broken) => (c) => {
  post(c, 0, 2, 13); post(c, 16, 10, 13)
  for (const dy of [5, 10]) {
    if (broken && dy === 5) { c.line(3, 2 + dy, 8, 4 + dy, "W"); c.line(3, 3 + dy, 8, 5 + dy, "w"); c.px(9, 6 + dy, "D"); continue }
    c.line(3, 2 + dy, 15, 8 + dy, "W"); c.line(3, 3 + dy, 15, 9 + dy, "w")
  }
  c.px(1, 1, "W"); c.px(17, 9, "W")
}
sprite("fence_x", { w: 19, h: 23, outline: "k" }, fenceX(false))
sprite("fence_y", { base: "fence_x", flip: "x" })
sprite("fence_x_broken", { w: 19, h: 23, outline: "k" }, fenceX(true), (c) => c.grid(9, 19, "g.g\n.g."))
sprite("fence_y_broken", { base: "fence_x_broken", flip: "x" })
sprite("fence_post", { w: 3, h: 14, outline: "k" }, (c) => { post(c, 0, 1, 13); c.px(1, 0, "W") })

// ------------------------------------------------------------------ signpost
sprite("signpost", { w: 22, h: 26, outline: "k" }, (c) => {
  post(c, 9, 2, 24)
  c.poly([2, 4, 18, 4, 21, 7, 18, 10, 2, 10], "W"); c.hline(2, 10, 17, "w"); c.hline(4, 6, 10, "D"); c.hline(4, 8, 7, "D")
  c.poly([20, 13, 4, 13, 1, 16, 4, 19, 20, 19], "w"); c.hline(4, 13, 16, "W"); c.hline(7, 15, 10, "d"); c.hline(9, 17, 6, "d")
  c.px(10, 5, "S"); c.px(10, 14, "S")
  c.grid(7, 24, "g.h\n.gg")
})

// ------------------------------------------------------------------ barrels & crates
sprite("barrel", { w: 13, h: 16, outline: "k" }, (c) => {
  c.rect(1, 2, 11, 12, "w"); c.rect(0, 4, 13, 8, "w")
  c.vline(1, 3, 10, "W"); c.vline(2, 2, 12, "W"); c.vline(10, 2, 12, "D"); c.vline(11, 3, 10, "D"); c.vline(12, 4, 8, "d")
  c.vline(5, 3, 11, "D"); c.vline(8, 3, 11, "D")
  for (const y of [4, 11]) { c.hline(0, y, 13, "r"); c.hline(9, y, 4, "S") }
  c.ellipse(6, 2, 5, 2, "D"); c.ellipse(6, 2, 4, 1, "W"); c.hline(3, 2, 6, "s")
  c.hline(1, 15, 11, "D")
})
sprite("crate", { w: 17, h: 17, outline: "k" }, (c) => {
  isoBox(c, 8, 0, 8, 8, "W", "w", "D")
  c.line(1, 6, 7, 9, "D"); c.line(1, 12, 7, 15, "D"); c.line(9, 9, 15, 6, "d"); c.line(9, 15, 15, 12, "d")
  c.line(2, 7, 7, 14, "W"); c.line(9, 14, 14, 8, "w")
  c.line(3, 4, 13, 4, "s"); c.px(8, 1, "s")
})
sprite("crate_stack", { w: 20, h: 26, outline: "k" }, (c) => {
  isoBox(c, 10, 9, 9, 9, "W", "w", "D"); c.line(1, 17, 9, 21, "D"); c.line(11, 21, 18, 17, "d")
  isoBox(c, 8, 0, 6, 7, "W", "w", "D"); c.line(3, 6, 7, 8, "D"); c.line(9, 8, 13, 6, "d")
})
sprite("sack", { w: 11, h: 12, outline: "k" }, `
  ...ww......
  ..wWWw.....
  ...dd......
  ..WWsWw....
  .WsssWWw...
  WsssWWWWw..
  WssWWWWWw..
  WsWWWWWww..
  WWWWWWwww..
  .wwwwwww...`)

// ------------------------------------------------------------------ lights (animated flicker)
anim("lantern", { w: 9, h: 14, fps: 6, outline: "k" }, `
  ...rr....
  ..r..r...
  ..SrrS...
  .SSSSSS..
  .SOYYOS..
  .SOYYOS..
  .SoOOoS..
  .SSSSSS..
  ..SSSS...`,
  frame(), frame(recolor({ Y: "O" }, [2, 4, 4, 1])), frame(recolor({ O: "Y" }, [2, 6, 4, 1])))
anim("lamp_post", { w: 9, h: 32, fps: 5, outline: "k" }, (c) => {
  c.vline(3, 9, 21, "r"); c.vline(4, 9, 21, "S"); c.vline(5, 9, 21, "S"); c.px(3, 12, "R")
  c.rect(2, 28, 5, 3, "S"); c.hline(2, 28, 5, "r"); c.hline(1, 30, 7, "S")
  c.rect(1, 2, 7, 7, "S"); c.rect(2, 3, 5, 5, "O"); c.rect(3, 4, 3, 3, "Y")
  c.hline(0, 1, 9, "S"); c.hline(2, 0, 5, "r"); c.hline(1, 8, 7, "r")
  if (c.frame === 1) c.px(4, 4, "c"); if (c.frame === 2) c.recolor({ Y: "O" }, [3, 6, 3, 1])
}, frame(), frame(), frame())
anim("brazier", { w: 14, h: 22, fps: 8, frames: 4, outline: "k" }, (c) => {
  c.rect(5, 12, 4, 9, "S"); c.vline(5, 12, 9, "r"); c.hline(3, 20, 8, "S")
  c.poly([1, 8, 13, 8, 10, 13, 4, 13], "S"); c.hline(1, 8, 12, "r")
  const k = c.phase * TAU, up = (h, a, o) => 8 - Math.round(h + Math.sin(k + o) * a)
  c.poly([2, 8, 4, up(4, 1, 0), 7, up(8, 2, 1), 10, up(5, 1, 2.5), 12, 8], "E")
  c.poly([4, 8, 6, up(3, 1, 1.5), 7, up(6, 1, 0.3), 9, up(3, 1, 2), 10, 8], "O")
  c.poly([6, 8, 7, up(3, 1, 2.2), 8, 8], "Y")
})

// ------------------------------------------------------------------ furniture
sprite("bench", { w: 25, h: 22, outline: "k" }, (c) => {
  // seat runs along world x (screen down-right); back rest behind it, legs below the front edge
  c.vline(4, 0, 9, "D"); c.vline(22, 9, 9, "d")
  c.line(4, 1, 22, 10, "W"); c.line(4, 2, 22, 11, "w"); c.line(4, 4, 22, 13, "W"); c.line(4, 5, 22, 14, "D")
  c.poly([0, 9, 3, 7, 25, 18, 22, 20], "W"); c.line(1, 9, 21, 19, "s")
  c.line(0, 10, 21, 20, "w"); c.line(0, 11, 21, 21, "D")
  for (const [x, y] of [[1, 11], [19, 20]]) c.vline(x, y, 1, "d")
  c.vline(2, 12, 3, "D"); c.vline(18, 20, 2, "D")
})
const tomb = (c, kind) => {
  if (kind === 1) {   // cross
    c.rect(5, 0, 4, 18, "R"); c.rect(1, 4, 12, 4, "R"); c.vline(8, 0, 18, "r"); c.hline(1, 7, 12, "r"); c.vline(9, 1, 17, "S"); c.vline(13, 5, 3, "S")
    c.px(6, 1, "q"); c.px(2, 5, "q")
  } else {
    c.rect(1, 4, 11, 14, "R"); c.ellipse(6, 4, 5, 4, "R"); c.rect(1, 4, 11, 1, "R")
    c.vline(1, 3, 15, "q"); c.vline(11, 3, 15, "r"); c.vline(12, 4, 14, "S"); c.vline(13, 6, 12, "S")
    c.hline(4, 8, 5, "r"); c.hline(4, 10, 5, "r"); c.px(6, 6, "r")
  }
  if (kind === 2) { c.line(3, 4, 7, 12, "S"); c.px(4, 6, "r"); c.grid(1, 13, "g.\nggh\ngGgg"); c.grid(8, 2, "gg\n.g") }
  c.hline(0, 18, 15, "S"); c.hline(0, 17, 3, "g"); c.px(12, 17, "g")
}
for (const v of [0, 1, 2]) sprite(`tombstone_${v}`, { w: 15, h: 19, outline: "k" }, (c) => tomb(c, v))
sprite("grave_mound", { w: 22, h: 9, outline: "k" }, (c) => { c.ellipse(11, 5, 10, 3, "D"); c.ellipse(10, 4, 8, 2, "w"); c.grid(4, 2, "g.g"); c.px(15, 4, "l") })

// ------------------------------------------------------------------ farm & home props
sprite("well", { w: 30, h: 42, outline: "k" }, (c) => {
  // posts + little roof
  c.rect(3, 6, 2, 26, "D"); c.vline(3, 6, 26, "w"); c.rect(25, 6, 2, 26, "d")
  c.poly([0, 8, 15, 0, 30, 8, 26, 10, 15, 4, 4, 10], "e"); c.line(1, 8, 15, 1, "E"); c.line(15, 1, 29, 8, "e")
  c.hline(5, 14, 20, "D"); c.px(15, 14, "S"); c.vline(15, 15, 9, "C"); c.rect(13, 23, 5, 4, "w"); c.hline(13, 23, 5, "W")
  // stone drum (cylinder)
  c.rect(2, 30, 26, 10, "r"); c.ellipse(15, 40, 13, 2, "r"); c.rect(2, 30, 6, 10, "R")
  c.rect(22, 30, 6, 10, "S"); c.ellipse(15, 30, 13, 4, "R"); c.ellipse(15, 30, 10, 2, "j"); c.ellipse(15, 31, 8, 1, "b"); c.px(12, 31, "i")
  for (const [x, y] of [[9, 34], [16, 33], [21, 36], [6, 37], [13, 38], [24, 33]]) c.hline(x, y, 3, "S")
  c.grid(1, 37, "g.\ngg")
})
sprite("scarecrow", { w: 24, h: 38, outline: "k" }, (c) => {
  c.vline(11, 14, 24, "D"); c.vline(12, 14, 24, "d"); c.hline(2, 16, 20, "D"); c.hline(2, 17, 20, "d")
  // robe-like shirt
  c.poly([6, 15, 17, 15, 18, 28, 5, 28], "B"); c.poly([12, 15, 17, 15, 18, 28, 12, 28], "b"); c.rect(9, 20, 3, 3, "f")
  c.vline(7, 17, 9, "i"); c.hline(5, 28, 14, "W"); c.grid(5, 29, "W.W.W.W..W.W")
  c.grid(1, 15, "WW\nW.W"); c.grid(20, 15, "WW\n.WW")
  // sack head + pointed witch hat
  c.ellipse(12, 11, 4, 4, "C"); c.ellipse(11, 10, 3, 3, "c"); c.px(10, 10, "k"); c.px(13, 10, "k"); c.hline(10, 13, 4, "D")
  c.poly([4, 7, 20, 7, 18, 5, 14, 4, 13, 0, 9, 4, 6, 5], "m"); c.hline(4, 7, 17, "x"); c.hline(8, 5, 7, "o"); c.px(13, 0, "v")
})
sprite("compost", { w: 24, h: 20, outline: "k" }, (c) => {
  isoBox(c, 12, 4, 11, 9, "d", "w", "D")
  c.poly([12, 5, 21, 9, 12, 13, 3, 9], "d")                                     // open top
  c.ellipse(11, 9, 6, 2, "D"); c.grid(7, 7, ".gG.h\nGDgeg"); c.grid(13, 8, "yg\nDw")
  for (const x of [4, 8]) c.line(x, 10 + Math.floor(x / 4), x, 18, "D"); c.line(17, 12, 17, 18, "d")
  c.px(9, 3, "i"); c.px(14, 1, "i")
})
anim("cauldron", { w: 22, h: 22, frames: 4, fps: 6, outline: "k" }, (c) => {
  // pot
  c.ellipse(11, 12, 9, 7, "S"); c.ellipse(9, 10, 6, 4, "r"); c.px(6, 8, "R"); c.px(7, 8, "R")
  c.rect(5, 18, 2, 3, "S"); c.rect(15, 18, 2, 3, "S")
  c.ellipse(11, 6, 9, 2, "r"); c.hline(3, 5, 16, "R"); c.ellipse(11, 6, 7, 1, "z"); c.hline(6, 6, 5, "c")
  const b = [[7, 3], [13, 2], [10, 0], [15, 4]]
  for (let i = 0; i < 2; i++) { const [x, y] = b[(c.frame + i * 2) % 4]; c.px(x, y + (c.frame % 2), i ? "z" : "i") }
  c.px(4 + c.frame * 4, 6, "c")
  // fire under
  const k = c.phase * TAU
  c.poly([5, 21, 8, 17 - Math.round(Math.sin(k) * 1), 11, 21], "E"); c.poly([10, 21, 13, 17 - Math.round(Math.sin(k + 2) * 1), 16, 21], "E")
  c.poly([7, 21, 9, 18, 11, 21], "O"); c.poly([12, 21, 13, 18, 14, 21], "Y")
})
sprite("alchemy_table", { w: 32, h: 26, outline: "k" }, (c) => {
  // table top (iso slab) + legs
  c.poly([0, 14, 16, 6, 32, 14, 16, 22], "W"); c.poly([0, 14, 16, 22, 16, 24, 0, 16], "w"); c.poly([16, 22, 32, 14, 32, 16, 16, 24], "D")
  for (const [x, y] of [[1, 16], [15, 24]]) c.vline(x, y, 2, "d")
  c.line(2, 14, 16, 7, "s")
  // bottles, book, candle
  c.grid(5, 4, ".S.\n.c.\nfff\nfpf\nfff")
  c.grid(10, 1, ".r.\n.c.\nBiB\nBBB\nBBB\nbBb")
  c.grid(20, 6, "zz\nzc\nzz")
  c.poly([16, 13, 23, 10, 28, 13, 21, 16], "l"); c.line(21, 16, 28, 13, "v"); c.line(18, 13, 23, 11, "c")
  c.grid(13, 9, "Y\nO\nc\nC")
  c.grid(24, 7, "SSS\nrRS\n.S.")
})
sprite("shop_stall", { w: 44, h: 46, outline: "k" }, (c) => {
  // posts
  c.rect(3, 12, 2, 30, "D"); c.vline(3, 12, 30, "w"); c.rect(39, 12, 2, 30, "d")
  // awning: lavender/cream stripes with scalloped hem
  c.poly([0, 14, 44, 14, 40, 2, 4, 2], "c")
  for (let x = 4; x < 44; x += 8) c.poly([x, 2, x + 4, 2, x + 6, 14, x + 2, 14], "l")
  c.hline(4, 2, 36, "v"); c.hline(1, 13, 42, "v")
  for (let x = 0; x < 44; x += 4) { c.px(x + 1, 14, "c"); c.px(x + 2, 14, "c"); c.px(x + 1, 15, "C"); c.px(x + 2, 15, "l") }
  // counter (iso-ish front)
  c.rect(2, 30, 40, 12, "w"); c.hline(2, 30, 40, "W"); c.hline(2, 29, 40, "s"); c.rect(32, 31, 10, 11, "D")
  for (let x = 6; x < 32; x += 6) c.vline(x, 31, 11, "D")
  c.hline(2, 42, 40, "d")
  // produce in crates on the counter
  c.grid(5, 25, ".OO.O\nOOWOO\nwwwww"); c.grid(13, 25, "f.ff.\nfEff.\nwwwww"); c.grid(21, 25, ".ii.i\niBiii\nwwwww"); c.grid(30, 24, ".l..\nlLl.\n.v.l\nwwww")
  // hanging sign
  c.vline(16, 16, 3, "S"); c.vline(27, 16, 3, "S"); c.rect(14, 19, 16, 5, "W"); c.box(14, 19, 16, 5, "D"); c.hline(17, 21, 3, "D"); c.px(22, 21, "o"); c.hline(24, 21, 3, "D")
})
sprite("broom_stand", { w: 20, h: 32, outline: "k" }, (c) => {
  c.rect(1, 28, 18, 3, "D"); c.hline(1, 28, 18, "w"); c.rect(2, 4, 2, 25, "D"); c.vline(2, 4, 25, "w"); c.hline(1, 6, 18, "D"); c.rect(16, 4, 2, 25, "d")
  for (const [x, lean] of [[6, -1], [11, 1]]) {
    c.line(x, 1, x + lean, 20, "w"); c.line(x + 1, 1, x + 1 + lean, 20, "W")
    c.poly([x - 2 + lean, 27, x - 1 + lean, 20, x + 3 + lean, 20, x + 4 + lean, 27], "O"); c.hline(x - 1 + lean, 20, 5, "e")
    c.vline(x + lean, 22, 5, "o"); c.vline(x + 2 + lean, 22, 5, "a")
  }
})
sprite("woodpile", { w: 22, h: 14, outline: "k" }, (c) => {
  const end = (x, y) => { c.circ(x, y, 2, "D"); c.px(x, y, "W"); c.px(x - 1, y - 1, "s") }
  c.rect(3, 4, 16, 9, "D"); c.hline(3, 4, 16, "w")
  end(4, 10); end(9, 10); end(14, 10); end(18, 10); end(6, 6); end(11, 6); end(16, 6); end(9, 2)
})
sprite("pumpkin", { w: 12, h: 10, outline: "k" }, (c) => {
  c.ellipse(6, 6, 5, 3, "E"); c.vline(4, 3, 7, "e"); c.vline(8, 3, 7, "e"); c.px(3, 4, "p"); c.px(4, 4, "p"); c.grid(5, 0, ".g\nGg")
})
sprite("bucket", { w: 9, h: 9, outline: "k" }, (c) => {
  c.rect(1, 2, 7, 6, "w"); c.vline(1, 2, 6, "W"); c.vline(7, 2, 6, "D"); c.hline(1, 3, 7, "r"); c.hline(1, 6, 7, "r"); c.ellipse(4, 2, 3, 1, "B"); c.px(3, 2, "i")
})
