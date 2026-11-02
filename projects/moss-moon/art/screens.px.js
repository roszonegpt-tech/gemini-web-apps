// Logo / title-screen art elements for SCREENS (logo letters are drawn by SCREENS, not here). Centre anchor.
//   moon_large (3f phase glow), moon_small, vine_corner (top-left; flip for the others), vine_divider, vine_drape (hangs from a
//   letter), mote_glow (4f), mote_spark (4f), banner_stone (mossy stone banner frame, 160x44) + banner_stone_l/_m/_r (9-slice: m repeats)
include("_palette.px.js")
include("_iso.px.js")

anim("moon_large", { w: 72, h: 72, frames: 3, fps: 2, outline: null }, (c) => {
  const cx = 36, cy = 36, R = 24, glow = [[30, "m"], [28, "v"], [26, "l"]]
  // dithered halo rings that breathe frame to frame
  for (const [r, k] of glow) { const rr = r + (c.frame === 1 ? 1 : c.frame === 2 ? 2 : 0); for (let y = 0; y < 72; y++) for (let x = 0; x < 72; x++) { const d = Math.hypot(x - cx, y - cy); if (d < rr && d >= rr - 2 && (x + y) % 2 === 0) c.px(x, y, k) } }
  c.circ(cx, cy, R, "L"); c.circ(cx - 3, cy - 3, R - 4, "c")
  // craters with lit rims
  for (const [x, y, r] of [[-8, 6, 4], [6, -9, 3], [-4, -12, 2], [9, 8, 5], [-13, -3, 2]]) { c.circ(cx + x, cy + y, r, "l"); c.circ(cx + x + 1, cy + y + 1, r - 1, "L"); c.px(cx + x - r + 1, cy + y - 1, "c") }
  // crescent: the shadowed limb bites the right side
  c.circ(cx + 14, cy - 6, R - 2, "_")
  c.ring(cx, cy, R, "l"); c.circ(cx + 14, cy - 6, R - 2, "_")
  for (let y = 0; y < 72; y++) for (let x = 0; x < 72; x++) { const d1 = Math.hypot(x - cx, y - cy), d2 = Math.hypot(x - cx - 14, y - cy + 6); if (d1 < R && d2 >= R - 2 && d2 < R) c.px(x, y, "Y") }
  if (c.frame === 2) for (const [x, y] of [[cx - 22, cy - 18], [cx - 26, cy + 4], [cx - 10, cy + 25]]) { c.px(x, y, "c"); c.px(x - 1, y, "L"); c.px(x + 1, y, "L"); c.px(x, y - 1, "L"); c.px(x, y + 1, "L") }
})
sprite("moon_small", { w: 20, h: 20, outline: null }, (c) => { c.circ(10, 10, 8, "L"); c.circ(9, 9, 6, "c"); c.circ(14, 7, 7, "_"); c.px(5, 12, "l"); c.px(7, 15, "l") })
// moss vines: a woody stem with leaves (lit top-left), tiny moonflowers
function vineLeaf(c, x, y, dir) { c.grid(x, y, dir > 0 ? ".hy\nhgh\n.G." : "yh.\nhgh\n.G.") }
sprite("vine_corner", { w: 48, h: 48, outline: "k" }, (c) => {
  for (let i = 0; i < 44; i++) { const x = 2 + i, y = 3 + Math.round(Math.sin(i / 7) * 2); c.px(x, y, "D"); c.px(x, y + 1, "d") }
  for (let i = 0; i < 44; i++) { const y = 2 + i, x = 3 + Math.round(Math.sin(i / 6 + 1) * 2); c.px(x, y, "D"); c.px(x + 1, y, "d") }
  for (let i = 0; i < 6; i++) { vineLeaf(c, 8 + i * 7, 4 + (i % 2 ? 1 : -3), i % 2 ? 1 : -1); vineLeaf(c, 4 + (i % 2 ? 1 : -3) + 2, 8 + i * 7, i % 2 ? -1 : 1) }
  c.circ(5, 5, 4, "G"); c.circ(4, 4, 3, "g"); c.grid(2, 2, ".h\nhy")                       // moss knot in the corner
  for (const [x, y] of [[18, 9], [9, 20], [33, 1], [1, 36]]) c.grid(x, y, ".L.\nLYL\n.L.")
  c.grid(40, 6, ".g\ng.\n.G"); c.grid(6, 40, "g.g\n.G.")
})
sprite("vine_divider", { w: 96, h: 12, outline: "k" }, (c) => {
  for (let x = 2; x < 94; x++) { const y = 5 + Math.round(Math.sin(x / 8) * 2); c.px(x, y, "D"); c.px(x, y + 1, "d") }
  for (let i = 0; i < 12; i++) { const x = 6 + i * 7, y = 5 + Math.round(Math.sin(x / 8) * 2); vineLeaf(c, x, i % 2 ? y - 3 : y + 1, i % 2 ? 1 : -1) }
  c.grid(44, 2, "..L..\n.LcL.\nLcYcL\n.LcL.\n..L..")                                               // central moonflower
})
sprite("vine_drape", { w: 14, h: 30, outline: "k" }, (c) => {
  c.hline(0, 1, 14, "D"); c.hline(1, 2, 12, "d")
  for (const [x, len] of [[3, 24], [9, 17]]) { for (let y = 2; y < len; y++) { const xx = x + Math.round(Math.sin(y / 4) * 1.5); c.px(xx, y, "G"); if (y % 5 === 2) vineLeaf(c, xx - 1, y, y % 10 ? 1 : -1) } }
  c.grid(1, 25, ".L.\nLYL\n.L.")
})
anim("mote_glow", { w: 9, h: 9, frames: 4, fps: 6, outline: null }, (c) => {
  const r = [1, 2, 3, 2][c.frame]; for (let k = 1; k <= r; k++) { c.px(4 - k, 4, k === r ? "l" : "L"); c.px(4 + k, 4, k === r ? "l" : "L"); c.px(4, 4 - k, k === r ? "l" : "L"); c.px(4, 4 + k, k === r ? "l" : "L") } c.px(4, 4, "c"); if (r > 1) { c.px(3, 3, "L"); c.px(5, 5, "L"); c.px(5, 3, "L"); c.px(3, 5, "L") }
})
anim("mote_spark", { w: 7, h: 7, frames: 4, fps: 8, outline: null }, (c) => { const k = ["Y", "O", "o", "O"][c.frame]; c.px(3, 3, c.frame ? k : "c"); if (c.frame % 2 === 0) { c.px(3, 1, k); c.px(3, 5, k); c.px(1, 3, k); c.px(5, 3, k) } else { c.px(2, 2, k); c.px(4, 4, k); c.px(4, 2, k); c.px(2, 4, k) } })
// mossy stone banner frame: dressed stone border, slate inset panel, moss on the top edge, hanging fronds
function bannerPx(x, y, W, H) {
  const edge = x < 4 || x >= W - 4 || y < 4 || y >= H - 4
  if (!edge) return (x + y * 3) % 17 === 0 ? "S" : "j"                              // inset panel
  const block = Math.floor((x + (y < 4 ? 0 : 5)) / 10)
  if ((x + (y < 4 ? 0 : 5)) % 10 === 0 && (y < 4 || y >= H - 4)) return "S"
  if (y === 0 || x === 0) return "q"; if (y === H - 1 || x === W - 1) return "S"
  if (y === 4 - 1 && x >= 4 && x < W - 4) return "r"
  return hash(block, y < 4 ? 0 : 1, 3) < 0.3 ? "q" : "R"
}
function banner(c, W, H, mossL, mossR) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.px(x, y, bannerPx(x, y, W, H))
  for (let x = mossL; x < W - mossR; x++) { const m = hash(x, 1, 7); if (m < 0.75) c.px(x, 0, m < 0.3 ? "h" : "g"); if (m < 0.45) c.px(x, 1, "G"); if (m < 0.12) { c.px(x, 2, "g"); c.px(x, 4, "G"); c.px(x, 5, "g") } }
}
sprite("banner_stone", { w: 160, h: 44, outline: "k" }, (c) => { banner(c, 160, 44, 0, 0); c.grid(2, 40, "g.h\nGgg"); c.grid(150, 1, "hg.\nGgg\n.g.") })
sprite("banner_stone_l", { w: 16, h: 44, outline: "k" }, (c) => { for (let y = 0; y < 44; y++) for (let x = 0; x < 16; x++) c.px(x, y, bannerPx(x, y, 160, 44)); c.grid(1, 0, "hgg\nGg.\n.g.") })
sprite("banner_stone_m", { w: 16, h: 44, outline: null }, (c) => { for (let y = 0; y < 44; y++) for (let x = 0; x < 16; x++) c.px(x, y, bannerPx(x + 40, y, 160, 44)); c.hline(0, 0, 16, "k"); c.hline(0, 43, 16, "k"); c.grid(5, 1, "g.h.g\n.G.G.") })
sprite("banner_stone_r", { w: 16, h: 44, outline: "k" }, (c) => { for (let y = 0; y < 44; y++) for (let x = 0; x < 16; x++) c.px(x, y, bannerPx(x + 144, y, 160, 44)) })
