// Environment details & storytelling props (bottom-centre anchor = ground point, contact shadow sizes in the manifest).
//   roots_0..2, fern_0..1, flowers_cluster (+_violet, _gold), stone_moss_small, stone_moss_flat, cairn, fence_ruin,
//   cart_broken, lunar_offering (4f candle/moon-dish glow), mushroom_ring, lantern_string (4f, hook anchor), stepping_stone_0..2,
//   wet/frost variants: <name>_frost (fern_0, roots_0, stone_moss_small, cairn, flowers_cluster), stepping_stone_<n>_wet.
include("_palette.px.js")
include("_iso.px.js")

// surface roots creeping over the ground (low, mossy), drawn along the iso grain
for (let v = 0; v < 3; v++) sprite(`roots_${v}`, { w: 30, h: 12, outline: "k" }, (c) => {
  const r = c.rng(7 + v * 5)
  for (let k = 0; k < 3 + v; k++) {
    let x = 15 + Math.round((r() - 0.5) * 6), y = 3 + Math.round(r() * 2), dir = k % 2 ? 1 : -1
    for (let s = 0; s < 9 + Math.floor(r() * 5); s++) {
      c.px(x, y, "D"); c.px(x, y + 1, "d"); if (s % 3 === 0) c.px(x, y - 1, "w")
      x += dir * (1 + (s % 2)); if (s % 2) y += 1; if (x < 1 || x > 28 || y > 9) break
    }
  }
  c.rect(12, 1, 6, 4, "D"); c.hline(12, 1, 6, "w"); c.px(13, 2, "W")
  c.grid(6 + v * 3, 7, "g.\nGg"); c.grid(20 - v, 3, ".g\ngh")
})
const frond = (c, x0, y0, len, dir, dy, k1, k2) => { for (let i = 0; i < len; i++) { const x = x0 + dir * i, y = y0 + Math.round((i * i) / (len * 1.6)) - (i < 2 ? 0 : 0) + dy * Math.floor(i / 3); c.px(x, y, i < len - 2 ? k2 : k1); if (i > 1 && i < len - 1) { c.px(x, y - 1, k1); if (i % 2) c.px(x, y + 1, k2) } } }
for (let v = 0; v < 2; v++) sprite(`fern_${v}`, { w: 22, h: 15, outline: "k" }, (c) => {
  frond(c, 10, 7, 10, -1, 0, "h", "g"); frond(c, 11, 7, 10, 1, 0, "h", "G"); frond(c, 10, 4, 8, -1, -1, "H", "g"); frond(c, 11, 4, 8, 1, -1, "h", "g")
  c.vline(10, 1, 13, "g"); c.vline(11, 2, 12, "G"); c.grid(9, 0, ".h.\nhHh"); if (v) { c.grid(3, 11, "G.g\nGgG"); c.px(16, 2, "y") }
  c.hline(8, 14, 6, "G")
})
const cluster = (c, petal, hi, seed) => {
  const r = c.rng(seed)
  c.grid(1, 9, "..g.G.g.g..g\n.gGgGgGgGgG.\nGgGGgGGgGgGg")
  for (let k = 0; k < 9; k++) { const x = 1 + Math.floor(r() * 11), y = 2 + Math.floor(r() * 6); c.vline(x, y + 1, 9 - y, k % 2 ? "g" : "G"); c.px(x, y, hi); c.px(x - 1, y, petal); c.px(x + 1, y, petal); c.px(x, y - 1, petal); c.px(x, y + 1, SHADE1[petal] || petal) }
}
sprite("flowers_cluster", { w: 14, h: 12, outline: "k" }, (c) => cluster(c, "p", "O", 3))
sprite("flowers_cluster_violet", { w: 14, h: 12, outline: "k" }, (c) => cluster(c, "l", "c", 5))
sprite("flowers_cluster_gold", { w: 14, h: 12, outline: "k" }, (c) => cluster(c, "O", "Y", 9))
sprite("stone_moss_small", { w: 13, h: 9, outline: "k" }, (c) => { c.ellipse(6, 5, 6, 3, "r"); c.ellipse(5, 4, 4, 2, "R"); c.px(4, 3, "q"); c.ellipse(9, 6, 3, 2, "S"); c.grid(2, 2, "gGg..\n.g.hg"); c.hline(1, 8, 11, "S") })
sprite("stone_moss_flat", { w: 20, h: 9, outline: "k" }, (c) => { c.ellipse(10, 5, 9, 3, "r"); c.ellipse(9, 4, 7, 2, "R"); c.hline(5, 3, 6, "q"); c.ellipse(14, 6, 4, 2, "S"); c.grid(11, 2, "ggh.\nGgGg"); c.grid(1, 5, "g.\nGg"); c.hline(3, 7, 3, "S") })
sprite("cairn", { w: 18, h: 24, outline: "k" }, (c) => {
  const st = (x, y, rx, ry, top) => { c.ellipse(x, y, rx, ry, "r"); c.ellipse(x - 1, y - 1, rx - 1, ry - 1, "R"); c.hline(x - rx + 2, y - ry + 1, rx, top ? "q" : "R"); c.hline(x - rx + 1, y + ry, rx * 2 - 1, "S") }
  st(9, 19, 8, 3, false); st(8, 14, 6, 3, false); st(10, 9, 5, 2, false); st(9, 5, 3, 2, true); c.grid(7, 1, ".O.\nOYO"); c.grid(0, 20, "g.h\nGgg"); c.grid(13, 12, "gG\n.g")
})
sprite("fence_ruin", { w: 26, h: 16, outline: "k" }, (c) => {
  c.vline(2, 2, 13, "w"); c.vline(3, 2, 13, "D"); c.px(2, 1, "W"); c.line(4, 7, 11, 11, "W"); c.line(4, 8, 11, 12, "w")
  c.line(8, 14, 24, 10, "w"); c.line(8, 15, 24, 11, "D"); c.line(14, 13, 24, 13, "W"); c.grid(17, 7, "w\nwD\n.D"); c.grid(4, 13, "g.g\nGgG"); c.grid(20, 13, "hg\ngG")
})
sprite("cart_broken", { w: 44, h: 30, outline: "k" }, (c) => {
  // tipped farm cart: bed resting on one wheel, the other wheel fallen flat beside it, a spilled sack
  prism(c, 24, 24, 12, 26, 7, (f, u, v) => f === "T" ? (Math.floor(u) % 4 === 0 ? "D" : "w") : f === "L" ? (Math.floor(v) % 3 === 2 ? "D" : "w") : "d")
  c.line(25, 19, 40, 27, "D", 2); c.line(26, 19, 41, 27, "w")                      // shaft on the ground
  c.ellipse(9, 20, 7, 7, "D", true); c.ellipse(9, 20, 6, 6, "w", true); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.line(9, 20, Math.round(9 + Math.cos(a) * 5), Math.round(20 + Math.sin(a) * 5), "D") } c.rect(8, 19, 3, 3, "S")
  c.ellipse(32, 9, 7, 3, "D", true); c.ellipse(32, 9, 6, 2, "w", true); c.px(32, 9, "S")         // wheel lying flat (behind)
  c.grid(28, 21, ".WW.\nWsWw\nwWWw\n.CC."); c.grid(1, 25, "g.h.g\nGgGgG"); c.grid(36, 25, "gh\nGg")
})
anim("lunar_offering", { w: 24, h: 16, frames: 4, fps: 4, outline: "k" }, (c) => {
  // a ring of small stones around a silver moon dish, two candle stubs, scattered petals
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, x = Math.round(12 + Math.cos(a) * 10), y = Math.round(10 + Math.sin(a) * 4); c.rect(x - 1, y - 1, 3, 2, i < 4 ? "r" : "R"); c.px(x - 1, y - 1, "q") }
  c.ellipse(12, 10, 5, 2, "R"); c.ellipse(12, 10, 4, 1, "L"); c.grid(10, 9, "c..\n.l."); c.px(13, 10, c.frame % 2 ? "c" : "L")
  for (const [x, ph] of [[6, 0], [18, 2]]) { c.rect(x, 5, 2, 3, "C"); c.px(x, 5, "c"); const f = (c.frame + ph) % 4; c.px(x, 4, "O"); c.px(x + (f === 1 ? 1 : 0), 3, f === 2 ? "O" : "Y"); if (f % 2 === 0) c.px(x, 2, "O") }
  c.px(4, 13, "p"); c.px(20, 12, "l"); c.px(15, 14, "p")
})
sprite("mushroom_ring", { w: 34, h: 16, outline: null }, (c) => {
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * TAU, x = Math.round(17 + Math.cos(a) * 14), y = Math.round(8 + Math.sin(a) * 5)
    c.px(x, y + 1, "C"); c.px(x, y + 2, "q"); c.rect(x - 1, y, 3, 1, i % 3 ? "e" : "w"); c.px(x - 1, y, i % 3 ? "f" : "W"); c.px(x, y - 1, i % 3 ? "e" : "w"); c.px(x + 1, y + 1, "k"); c.px(x - 2, y + 1, "k")
  }
  c.grid(15, 7, "y.\n.y")
})
anim("lantern_string", { w: 40, h: 16, frames: 4, fps: 4, outline: "k" }, (c) => {
  for (let x = 0; x < 40; x++) c.px(x, 1 + Math.round(Math.sin((x / 39) * Math.PI) * 5), "d")
  for (const [x, ph, k] of [[7, 0, "O"], [20, 2, "l"], [33, 1, "O"]]) {
    const y = 2 + Math.round(Math.sin((x / 39) * Math.PI) * 5), f = (c.frame + ph) % 4
    c.px(x, y, "S"); c.rect(x - 1, y + 1, 3, 4, "S"); c.px(x, y + 2, f === 1 ? k : "Y"); c.px(x, y + 3, k); c.px(x - 1, y + 5, "S"); c.px(x + 1, y + 5, "S"); if (f === 3) c.px(x, y + 2, k)
  }
})
for (let v = 0; v < 3; v++) sprite(`stepping_stone_${v}`, { w: 18, h: 9, outline: "k" }, (c) => {
  const rx = [7, 8, 6][v]; c.ellipse(9, 5, rx, 3, "S"); c.ellipse(9, 4, rx, 3, "r"); c.ellipse(8, 3, rx - 2, 2, "R"); c.hline(6, 2, 4, "q")
  if (v !== 1) c.grid(2 + v * 3, 5, "g.\nGg"); if (v === 2) c.px(12, 3, "S")
})
// frost & wet variants (pure recolours of the finished sprites)
const FROST = { g: "R", G: "r", h: "q", H: "c", y: "c", D: "m", d: "x", w: "v", W: "l", r: "R", S: "r", p: "L", O: "c", l: "L" }
for (const n of ["fern_0", "roots_0", "stone_moss_small", "cairn", "flowers_cluster"]) sprite(`${n}_frost`, { base: n, swap: FROST })
for (let v = 0; v < 3; v++) sprite(`stepping_stone_${v}_wet`, { base: `stepping_stone_${v}`, swap: { R: "B", q: "i", r: "b", S: "j" } })
meta("lantern_string", { ax: 20, ay: 2, hook: true, sh: null })
meta("mushroom_ring", { ax: 17, ay: 8, sh: null })
