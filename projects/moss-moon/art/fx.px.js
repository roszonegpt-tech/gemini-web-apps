// Spell impact + feedback effects (centre anchor = impact point). One-shot unless named fx_aura_*.
include("_palette.px.js")

const ringPx = (c, cx, cy, r, col, step = 1, ry = r) => {
  for (let a = 0; a < 64; a += step) { const t = a / 64 * TAU; c.px(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * ry), col) }
}
const spark = (c, x, y, a = "Y", m = "c") => { c.px(x, y, m); c.px(x - 1, y, a); c.px(x + 1, y, a); c.px(x, y - 1, a); c.px(x, y + 1, a) }

// Moonbolt: a lunar burst, crescent shards fly out, a soft ring fades
anim("fx_moonbolt_hit", { w: 25, h: 25, frames: 6, fps: 14 }, (c) => {
  const k = c.frame, cx = 12, cy = 12
  if (k < 2) { c.circ(cx, cy, 3 + k * 2, "l"); c.circ(cx, cy, 2 + k, "L"); c.circ(cx, cy, 1 + k, "c") }
  if (k >= 1) ringPx(c, cx, cy, 4 + k * 2, k > 3 ? "v" : "l", k > 3 ? 4 : 2)
  if (k >= 2 && k < 5) for (let i = 0; i < 5; i++) { const t = i / 5 * TAU + 0.3, r = 3 + k * 2; c.px(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), "c"); c.px(Math.round(cx + Math.cos(t) * (r - 1)), Math.round(cy + Math.sin(t) * (r - 1)), "L") }
  if (k === 2) spark(c, cx, cy, "L", "c")
})
// Ember Bloom: fiery petals unfold, then embers rise
anim("fx_ember_bloom", { w: 29, h: 29, frames: 7, fps: 12 }, (c) => {
  const k = c.frame, cx = 14, cy = 16
  const open = [1, 3, 5, 7, 7, 6, 0][k]
  if (open) for (let i = 0; i < 6; i++) {
    const t = i / 6 * TAU + k * 0.1, x = cx + Math.cos(t) * open, y = cy + Math.sin(t) * open * 0.7
    c.line(cx, cy, Math.round(x), Math.round(y), k > 4 ? "e" : "E", k < 4 ? 3 : 2); c.px(Math.round(x), Math.round(y), "O")
  }
  if (k < 5) { c.circ(cx, cy, Math.max(1, 3 - Math.abs(k - 2)), "O"); c.px(cx, cy, "Y") }
  if (k >= 3) for (let i = 0; i < 5; i++) { const x = cx - 8 + i * 4 + (i % 2), y = cy - 2 - (k - 3) * 3 - (i % 3) * 2; c.px(x, y, k > 5 ? "e" : i % 2 ? "O" : "E") }
})
// Thornbind: brambles burst from the ground and coil around the target point
anim("fx_thornbind", { w: 33, h: 27, frames: 6, fps: 10 }, (c) => {
  const k = c.frame, cx = 16, by = 24, hgt = [3, 8, 14, 18, 18, 16][k]
  c.ellipse(cx, by, 12, 2, k > 4 ? "G" : "D")
  for (const [dx, dir] of [[-9, 1], [-3, -1], [4, 1], [10, -1]]) {
    for (let t = 0; t < hgt; t++) {
      const x = cx + dx + Math.round(Math.sin(t * 0.5 + dx) * 3 * dir * (t / 18)), y = by - t
      c.px(x, y, t % 4 === 0 ? "G" : "g"); if (t % 4 === 2) c.px(x + dir, y, "h")
      if (t % 5 === 3 && k > 1) c.px(x - dir, y - 1, "v")
    }
  }
  if (k >= 3) for (const [ry, rx] of [[10, 8], [15, 6]]) { c.ellipse(cx, by - ry, rx, 2, "g", true); c.recolor({ g: "G" }, (x, y) => y < by - ry && Math.abs(x - cx) < rx) }
  if (k === 3) spark(c, cx, by - 18, "h", "y")
})
// Frostbell: an ice bell forms, rings (shockwave), and shatters
anim("fx_frostbell", { w: 25, h: 29, frames: 6, fps: 10 }, (c) => {
  const k = c.frame, cx = 12, top = 6
  if (k < 4) {
    const s = Math.min(1, (k + 1) / 2)
    c.poly([cx - Math.round(3 * s), top, cx + Math.round(3 * s), top, cx + Math.round(7 * s), top + Math.round(14 * s), cx - Math.round(7 * s), top + Math.round(14 * s)], "i")
    c.poly([cx + 1, top, cx + Math.round(3 * s), top, cx + Math.round(7 * s), top + Math.round(14 * s), cx + 2, top + Math.round(14 * s)], "B")
    c.line(cx - 2, top + 1, cx - Math.round(5 * s), top + Math.round(13 * s), "c"); c.px(cx, top - 1, "c")
    if (k >= 2) c.circ(cx, top + 16, 1, "c")
  }
  if (k >= 2) ringPx(c, cx, top + 15, 4 + (k - 2) * 3, k > 4 ? "L" : "c", 2, 2 + (k - 2))
  if (k >= 4) for (let i = 0; i < 6; i++) { const t = i / 6 * TAU, r = (k - 3) * 4; c.px(Math.round(cx + Math.cos(t) * r), Math.round(top + 8 + Math.sin(t) * r), i % 2 ? "i" : "c") }
})
// Starfall: a star streaks down and bursts
anim("fx_starfall", { w: 35, h: 41, frames: 7, fps: 14 }, (c) => {
  const k = c.frame, cx = 17, gy = 36
  if (k < 3) { const y = 4 + k * 12, x = cx + 6 - k * 3; c.line(x + 6, y - 9, x, y, "O"); c.line(x + 4, y - 6, x, y, "Y"); spark(c, x, y, "Y", "c") }
  if (k >= 3) {
    const r = (k - 2) * 3
    c.ellipse(cx, gy, r + 1, Math.ceil((r + 1) / 2), k > 5 ? "a" : "O", true)
    if (k < 6) { c.circ(cx, gy - 2, Math.max(1, 5 - k), "Y"); c.px(cx, gy - 2, "c") }
    for (let i = 0; i < 5; i++) { const t = -Math.PI * (0.1 + i * 0.2), rr = r + 2; spark(c, Math.round(cx + Math.cos(t) * rr), Math.round(gy - 2 + Math.sin(t) * rr * 1.2), k > 5 ? "o" : "Y", k > 5 ? "O" : "c") }
  }
})
// generic feedback
anim("fx_poof", { w: 23, h: 13, frames: 5, fps: 12 }, (c) => {
  const k = c.frame
  for (const [dx, dy, r] of [[-4, 1, 3], [4, 1, 3], [0, -2, 3], [-1, 2, 2]]) { const rr = Math.max(0, r + Math.floor(k / 2) - (k > 3 ? 2 : 0)); if (rr) { c.circ(11 + dx * (1 + k * 0.3), 7 + dy, rr, k > 2 ? "R" : "q"); c.circ(10 + dx * (1 + k * 0.3), 6 + dy, Math.max(0, rr - 2), "c") } }
})
anim("fx_harvest", { w: 17, h: 17, frames: 5, fps: 10 }, (c) => {
  const k = c.frame
  for (let i = 0; i < 4; i++) { const t = i / 4 * TAU + 0.6, r = 2 + k * 2; if (k < 4 || i % 2) spark(c, Math.round(8 + Math.cos(t) * r), Math.round(8 + Math.sin(t) * r - k), "Y", k > 3 ? "O" : "c") }
})
anim("fx_heal", { w: 15, h: 21, frames: 6, fps: 10 }, (c) => {
  for (const [x, o] of [[3, 0], [10, 2], [7, 4]]) { const y = 18 - ((c.frame * 3 + o * 2) % 18); c.hline(x - 1, y, 3, "h"); c.vline(x, y - 1, 3, "h"); c.px(x, y, "y") }
})
anim("fx_blight_burst", { w: 25, h: 25, frames: 6, fps: 12 }, (c) => {
  const k = c.frame, cx = 12, cy = 12
  if (k < 3) { c.circ(cx, cy, 2 + k * 2, "x"); c.circ(cx, cy, 1 + k, "X") }
  for (let i = 0; i < 7; i++) { const t = i / 7 * TAU, r = 3 + k * 2; c.px(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), k > 3 ? "m" : "X"); if (k < 4) c.px(Math.round(cx + Math.cos(t) * (r - 1)), Math.round(cy + Math.sin(t) * (r - 1)), "x") }
})
anim("fx_aura_moon", { w: 33, h: 17, frames: 8, fps: 8 }, (c) => {
  ringPx(c, 16, 8, 14, "l", 4, 6)
  for (let i = 0; i < 4; i++) { const t = (c.phase + i / 4) * TAU; c.px(Math.round(16 + Math.cos(t) * 14), Math.round(8 + Math.sin(t) * 6), "c"); c.px(Math.round(16 + Math.cos(t - 0.15) * 14), Math.round(8 + Math.sin(t - 0.15) * 6), "L") }
})
