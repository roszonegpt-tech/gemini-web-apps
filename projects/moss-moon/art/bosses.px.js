// Bosses, one per region + the final boss. Each has <id>_idle_<s|e> (4 frames) and
// <id>_windup_<s|e> (3 frames, plays once and holds). West = draw east with flip; north is not drawn.
//   bramble_warden  Blighted Forest   64x72
//   mire_hag        Whispering Swamp  64x68   (Mire Hag-Heart)
//   frost_wyrm      Frostpeak         80x72   (Frost Wyrm Husk)
//   well_spirit     final: corrupted Moonwell spirit 72x88
// Anchor: bottom-centre (feet / base of the mound).
include("_palette.px.js")

const thorny = (c, x0, y0, x1, y1, w, col, thorn, every = 3) => {
  c.line(x0, y0, x1, y1, col, w)
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), dx = (x1 - x0) / n, dy = (y1 - y0) / n
  for (let i = 2; i < n; i += every) {
    const s = i % (2 * every) < every ? 1 : -1, ox = Math.round(-dy * (w / 2 + 1) * s), oy = Math.round(dx * (w / 2 + 1) * s)
    c.px(Math.round(x0 + dx * i) + ox, Math.round(y0 + dy * i) + oy, thorn)
  }
}
const lit = (c, cx, keys, map, steps = 1) => c.recolor(map, (x, y) => x < cx && c.is(x, y, keys))
// light the left part of the shapes with `keys`, shade the right part (top-left light, cool shade)
const shadeLR = (c, xl, xr, keys) => { c.light((x, y) => x < xl && c.is(x, y, keys)); c.shade((x, y) => x > xr && c.is(x, y, keys)) }
const eye = (c, x, y, col, hi) => { c.px(x, y, col); c.px(x + 1, y, col); if (hi) c.px(x, y - 1, hi) }

// Build idle (4f, looping) + windup (3f, once) for both facings from one painter.
function boss(id, w, h, paint) {
  for (const f of ["s", "e"]) {
    anim(`${id}_idle_${f}`, { w, h, frames: 4, fps: 5, outline: "k" }, (c) => paint(c, f, "idle", c.phase, c.frame))
    anim(`${id}_windup_${f}`, { w, h, frames: 3, fps: 6, loop: false, outline: "k" }, (c) => paint(c, f, "windup", c.frame / 2, c.frame))
  }
}

// ------------------------------------------------------------------ Bramble Warden
boss("bramble_warden", 64, 72, (c, f, pose, ph, k) => {
  const e = f === "e", cx = 32 + (e ? 2 : 0), bob = pose === "idle" ? Math.round(Math.sin(ph * TAU)) : -k
  const hx = cx + (e ? 6 : 0), hy = 22 + bob
  const sway = pose === "idle" ? Math.round(Math.sin(ph * TAU + 1) * 2) : 0
  const up = pose === "windup" ? k / 2 : 0
  // far arm (east facing: behind the body)
  if (e) thorny(c, cx - 12, 38 + bob, cx - 20 + Math.round(up * 4), Math.round(58 - up * 40) + sway, 4, "x", "m")
  // root legs
  c.poly([cx - 15, 71, cx - 9, 56, cx - 3, 71], "m"); c.poly([cx + 3, 71, cx + 9, 56, cx + 15, 71], "m")
  c.line(cx - 15, 71, cx - 22, 71, "x"); c.line(cx + 15, 71, cx + 22, 70, "x"); c.line(cx - 6, 71, cx - 10, 71, "x")
  // torso of twisted bramble: broad shoulders, pinched waist, splayed hips
  c.poly([cx - 21, 35 + bob, cx - 14, 30 + bob, cx + 14, 30 + bob, cx + 21, 35 + bob, cx + 17, 45, cx + 11, 52, cx + 15, 61, cx - 15, 61, cx - 11, 52, cx - 17, 45], "m")
  for (let i = 0; i < 7; i++) for (let y = 30 + bob; y < 62; y++) {
    const x = Math.round(cx - 18 + i * 6 + Math.sin(y * 0.32 + i * 1.7) * 3)
    if (c.is(x, y, "mv")) c.px(x, y, "x"); if (c.is(x - 1, y, "m") && (y + i) % 3) c.px(x - 1, y, "v")
  }
  shadeLR(c, cx - 9, cx + 9, "m")
  // heart-knot of blight in the chest
  const pulse = pose === "windup" ? 2 : Math.sin(ph * TAU * 2) > 0 ? 1 : 0
  c.circ(cx + (e ? 4 : 0), 45 + bob, 2 + (pulse > 1 ? 1 : 0), "X"); c.px(cx + (e ? 4 : 0), 45 + bob, pulse ? "l" : "X")
  // mossy shoulders
  for (const [sx, r] of e ? [[cx - 10, 5], [cx + 14, 6]] : [[cx - 16, 6], [cx + 16, 6]]) { c.circ(sx, 34 + bob, r, "G"); c.circ(sx - 1, 33 + bob, r - 2, "g"); c.px(sx - 2, 30 + bob, "h"); c.px(sx + 2, 31 + bob, "h") }
  // bark mask head: long face, deep brow, sockets with ember eyes, jagged jaw
  c.ellipse(hx, hy, 8, 11, "D"); c.ellipse(hx - 2, hy - 2, 5, 8, "w")
  for (const gx of [-5, -1, 3, 6]) c.vline(hx + gx, hy - 9, 5 + ((gx + 9) % 4), "d")
  c.recolor({ w: "D" }, (x, y) => x > hx + 3); c.recolor({ D: "d" }, (x, y) => x > hx + 6 && c.is(x, y, "D"))
  c.hline(hx - 7 + (e ? 4 : 0), hy - 2, e ? 11 : 15, "d")
  const eyeCol = pose === "windup" ? "Y" : "O"
  const sockets = e ? [[hx + 1, hy], [hx + 6, hy]] : [[hx - 5, hy], [hx + 3, hy]]
  for (const [ex, ey] of sockets) { c.rect(ex - 1, ey - 1, 4, 3, "x"); eye(c, ex, ey, eyeCol, pose === "windup" ? "c" : null) }
  const mouth = pose === "windup" ? 3 : 1, mx = e ? hx : hx - 4
  c.rect(mx, hy + 5, 9, mouth + 1, "x"); for (let x = mx; x < mx + 9; x += 2) { c.px(x, hy + 5, "q"); c.px(x + 1, hy + 5 + mouth, "C") }
  c.grid(hx - 5, hy - 11, "gGg.g\n.g.Gg")
  // crown of dead branches
  const crown = [[-8, -12, -14, -24], [-3, -10, -5, -27], [3, -10, 6, -26], [8, -12, 15, -22]]
  for (const [ax, ay, bx, by] of crown) {
    const spread = pose === "windup" ? Math.sign(bx) * k : 0
    c.line(hx + ax, hy + ay + 3, hx + bx + spread, hy + by + 6, "m", 2); c.px(hx + bx + spread, hy + by + 5, "X")
    c.px(hx + Math.round((ax + bx) / 2) - 1, hy + Math.round((ay + by) / 2) + 4, "v")
  }
  c.grid(hx - 6, hy - 10, "f.f"); c.px(hx + 7, hy - 9, "f")
  // near arm(s)
  const arm = (sx, dir) => {
    const hxp = pose === "windup" ? sx + dir * (6 - k) : sx + dir * 6 + sway * dir, hyp = pose === "windup" ? 58 - k * 22 : 60 + sway
    thorny(c, sx, 37 + bob, hxp, hyp, 4, "m", "v")
    c.grid(hxp - 2, hyp + 1, dir < 0 ? "x.x.\n.x.x" : ".x.x\nx.x.")
  }
  if (e) arm(cx + 16, 1); else { arm(cx - 18, -1); arm(cx + 18, 1) }
  if (pose === "windup" && k > 0) for (const [x, y] of [[cx - 26, 30], [cx + 26, 28], [cx, 6]]) if (k === 2) { c.px(x, y, "X"); c.px(x + 1, y - 1, "l") }
})

// ------------------------------------------------------------------ Mire Hag-Heart
boss("mire_hag", 64, 68, (c, f, pose, ph, k) => {
  const e = f === "e", cx = 32, bob = pose === "idle" ? Math.round(Math.sin(ph * TAU)) : -k
  const beat = pose === "windup" ? 1 + (k > 0 ? 1 : 0) : (ph < 0.25 ? 1 : 0)
  // mud mound
  c.ellipse(cx, 62, 26, 6, "u"); c.ellipse(cx - 3, 60, 20, 4, "U"); c.ellipse(cx + 8, 64, 6, 1, "b"); c.hline(cx + 4, 63, 4, "B")
  // hunched moss-cloak body
  const sx = e ? 4 : 0
  c.poly([cx - 18, 60, cx - 15 + sx, 32 + bob, cx - 6 + sx, 24 + bob, cx + 8 + sx, 24 + bob, cx + 16 + sx, 32 + bob, cx + 19, 60], "t")
  // hanging moss strands
  for (let x = cx - 17; x <= cx + 18; x += 3) { const len = 3 + ((x * 7) % 5); c.vline(x, 57, len, x % 2 ? "T" : "t"); c.px(x, 57 + len, "h") }
  c.recolor({ t: "T" }, (x, y) => x < cx - 7 && y < 56 && c.is(x, y, "t"))
  // the exposed heart in the chest, veins of blight
  const hx = cx + (e ? 5 : 0), hy = 42 + bob, r = 4 + beat
  c.line(hx, hy, hx - 12, hy + 12, "X"); c.line(hx, hy, hx + 11, hy + 14, "X"); c.line(hx, hy, hx + 2, hy - 13, "X")
  c.circ(hx - 2, hy - 1, r - 1, "e"); c.circ(hx + 2, hy - 1, r - 1, "e"); c.poly([hx - r - 1, hy, hx + r + 2, hy, hx, hy + r + 3], "e")
  c.circ(hx - 2, hy - 2, r - 2, "f"); c.px(hx - 3, hy - 3, "p"); if (beat > 1) { c.px(hx - 2, hy - 3, "p"); c.px(hx + 2, hy - 2, "f") }
  // head: gaunt pale face under stringy hair
  const hdx = cx + (e ? 8 : 0), hdy = 20 + bob
  c.ellipse(hdx, hdy, 7, 8, "T"); c.ellipse(hdx + (e ? 3 : 0), hdy + 2, 5, 5, "R"); c.ellipse(hdx + (e ? 2 : -1), hdy + 1, 3, 3, "q")
  for (let x = hdx - 8; x <= hdx + 8; x += 2) { const len = 6 + ((x * 5) % 7); if (!e || x < hdx + 1) c.vline(x, hdy - 3, len + (Math.abs(x - hdx) > 4 ? 6 : 0), x % 4 ? "t" : "T") }
  c.recolor({ T: "t" }, (x, y) => x > hdx + 3 && c.is(x, y, "T"))
  const ec = pose === "windup" ? "c" : "z"
  if (e) { eye(c, hdx + 3, hdy, ec); c.px(hdx + 7, hdy + 1, ec) } else { eye(c, hdx - 4, hdy, ec); eye(c, hdx + 2, hdy, ec) }
  c.hline(hdx - 2 + (e ? 3 : 0), hdy + 5, 4, pose === "windup" ? "x" : "S"); if (pose === "windup") c.hline(hdx - 1 + (e ? 3 : 0), hdy + 6, 2, "x")
  // long arms with claws
  const arm = (sx0, dir, behind) => {
    const spread = pose === "windup" ? k * 3 : Math.round(Math.sin(ph * TAU) * 1)
    const ex = sx0 + dir * (10 + spread), ey = pose === "windup" ? 34 - k * 6 : 50
    c.line(sx0, 32 + bob, ex, ey, behind ? "j" : "T", 3); c.line(sx0 - dir, 32 + bob, ex - dir, ey, behind ? "j" : "h")
    c.grid(ex - 2, ey + 1, dir < 0 ? "q.q.q\n.q.q." : "q.q.q\n.q.q.")
  }
  if (e) { arm(cx - 6, -1, true); arm(cx + 14, 1, false) } else { arm(cx - 14, -1, false); arm(cx + 15, 1, false) }
  // swamp lights orbiting
  for (let i = 0; i < 2; i++) { const a = (ph + i / 2) * TAU, x = Math.round(cx + Math.cos(a) * 24), y = Math.round(36 + Math.sin(a) * 6); c.px(x, y, "z"); c.px(x, y - 1, "i") }
})

// ------------------------------------------------------------------ Frost Wyrm Husk
boss("frost_wyrm", 80, 72, (c, f, pose, ph, k) => {
  const e = f === "e", sw = pose === "idle" ? Math.sin(ph * TAU) * 2 : -k * 2
  // snow mound it erupts from
  c.ellipse(40, 66, 30, 6, "L"); c.ellipse(37, 64, 26, 4, "c"); c.grid(14, 62, "R.r\n.SS")
  // spine curve: points from the mound up to the skull
  const pts = []
  for (let i = 0; i <= 14; i++) {
    const t = i / 14
    const x = e ? 26 + t * 30 + Math.sin(t * 5) * 6 + sw * t * t : 40 + Math.sin(t * 4.2 + 0.6) * 12 * (1 - t * 0.4) + sw * t * t
    const y = 64 - t * 46 - (pose === "windup" ? k * 2 * t : 0)
    pts.push([Math.round(x), Math.round(y)])
  }
  // body: vertebrae + rib shards, thicker toward the bottom
  for (let i = 0; i < pts.length - 1; i++) {
    const [x, y] = pts[i], [x2, y2] = pts[i + 1], wv = Math.round(10 - i * 0.5)
    c.line(x, y, x2, y2, "R", wv)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [x, y] = pts[i], wv = Math.round(10 - i * 0.5)
    c.hline(x - Math.floor(wv / 2), y, wv, "S")                                   // segment joints
    if (i % 2 === 0 && i < 11) { const rl = Math.round(wv / 2) + 2; c.line(x - rl, y, x - rl - 4, y + 5, "C", 2); c.line(x + rl, y, x + rl + 4, y + 5, "q", 2); c.px(x - rl - 4, y + 6, "R"); c.px(x + rl + 4, y + 6, "r") }    // ribs
    if (i % 2 === 1 && i < 12) { const s = 4 + (i % 4); c.poly([x - 2, y - 1, x + 1, y - 1 - s, x + 3, y - 1], "i"); c.line(x - 1, y - 2, x + 1, y - s, "c"); c.px(x + 2, y - 2, "B") }   // ice shards on spine
  }
  shadeLR(c, 30, 46, "R")
  // skull
  const [sx, sy] = pts[pts.length - 1], jaw = pose === "windup" ? 1 + k * 2 : Math.round(Math.max(0, Math.sin(ph * TAU)))
  if (e) {
    c.poly([sx - 9, sy - 4, sx + 2, sy - 9, sx + 17, sy - 4, sx + 19, sy + 1, sx - 8, sy + 4], "c")
    c.poly([sx - 5, sy + 3, sx + 17, sy + 2 + jaw, sx + 15, sy + 6 + jaw, sx - 5, sy + 7], "C")
    c.hline(sx - 3, sy + 3, 20, jaw ? "j" : "S"); if (jaw) c.rect(sx, sy + 3, 15, jaw, "j")
    c.grid(sx + 4, sy + 2, "c.c.c"); eye(c, sx + 3, sy - 2, pose === "windup" ? "c" : "z")
    c.line(sx - 4, sy - 4, sx - 12, sy - 11, "C", 2); c.line(sx, sy - 6, sx - 6, sy - 14, "q", 2); c.px(sx - 12, sy - 12, "i"); c.px(sx - 6, sy - 15, "i")
  } else {
    c.ellipse(sx, sy, 10, 7, "c"); c.poly([sx - 7, sy + 3, sx + 7, sy + 3, sx + 4, sy + 11 + jaw, sx - 4, sy + 11 + jaw], "C")
    if (jaw) c.rect(sx - 3, sy + 4, 6, jaw, "j")
    c.grid(sx - 3, sy + 3, "c.c.c.c"); eye(c, sx - 5, sy - 1, pose === "windup" ? "c" : "z"); eye(c, sx + 3, sy - 1, pose === "windup" ? "c" : "z")
    c.line(sx - 6, sy - 4, sx - 13, sy - 12, "C", 2); c.line(sx + 6, sy - 4, sx + 13, sy - 12, "q", 2); c.px(sx - 13, sy - 13, "i"); c.px(sx + 13, sy - 13, "i")
    c.recolor({ c: "C" }, (x, y) => x > sx + 3 && y < sy + 3 && c.is(x, y, "c"))
  }
  // frost breath gathering in the windup
  if (pose === "windup" && k > 0) {
    const bx = e ? sx + 16 : sx, by = e ? sy + 3 : sy + 11
    c.circ(bx, by, k, "i"); c.px(bx, by, "c"); if (k === 2) { c.px(bx - 3, by - 2, "L"); c.px(bx + 3, by + 1, "L") }
  }
  // drifting snow
  for (let i = 0; i < 3; i++) { const t = (ph + i / 3) % 1; c.px(Math.round(12 + i * 26 + t * 6), Math.round(10 + t * 40), "c") }
})

// ------------------------------------------------------------------ the corrupted Moonwell spirit (final boss)
boss("well_spirit", 72, 88, (c, f, pose, ph, k) => {
  const e = f === "e", cx = 36 + (e ? 3 : 0), fl = pose === "idle" ? Math.round(Math.sin(ph * TAU) * 2) : -k * 2
  const top = 18 + fl
  // broken lunar halo behind the head: a 2px ring with a blighted gap
  const glow = pose === "windup" ? "c" : "L"
  c.circ(cx, top + 4, 15, "l"); c.circ(cx, top + 4, 13, "_")
  c.recolor({ l: glow }, (x, y) => x < cx - 4 && y < top + 4)
  c.recolor({ l: "_", L: "_", c: "_" }, (x, y) => x > cx + 5 && y > top - 2 && y < top + 8)
  c.px(cx + 6, top - 9, "X"); c.px(cx + 10, top + 11, "X"); c.px(cx + 12, top - 4, "x")
  // robe: flowing bell shape that dissolves into blight tendrils
  c.poly([cx - 7, top + 6, cx + 7, top + 6, cx + 18, top + 40, cx + 14, top + 52, cx - 14, top + 52, cx - 18, top + 40], "v")
  for (let i = 0; i < 7; i++) {
    const x0 = cx - 13 + i * 4.3, wav = Math.sin(ph * TAU + i) * 2
    const len = 10 + ((i * 5) % 7)
    for (let t = 0; t < len; t++) c.px(Math.round(x0 + wav * (t / len) + (i < 3 ? -t / 4 : i > 3 ? t / 4 : 0)), top + 52 + t, t > len - 4 ? "x" : t > len / 2 ? "X" : "m")
    c.px(Math.round(x0), top + 51, "m")
  }
  // robe folds + light/shade
  for (const dx of [-8, -3, 3, 9]) c.line(cx + Math.round(dx / 3), top + 10, cx + dx, top + 50, "m")
  shadeLR(c, cx - 6, cx + 6, "v")
  c.recolor({ v: "m" }, (x, y) => y > top + 44 && c.is(x, y, "v"))
  // blight cracks spreading over the robe
  c.line(cx + 2, top + 20, cx + 9, top + 30, "X"); c.line(cx + 9, top + 30, cx + 7, top + 38, "X"); c.line(cx - 5, top + 28, cx - 11, top + 40, "X")
  // hood + void face
  c.ellipse(cx, top + 6, 8, 9, "v"); c.ellipse(cx - 2, top + 4, 5, 6, "l"); c.ellipse(cx + (e ? 3 : 0), top + 8, 5, 5, "x")
  const ec = pose === "windup" ? "c" : "z"
  if (e) { eye(c, cx + 3, top + 7, ec); c.px(cx + 7, top + 7, ec) } else { eye(c, cx - 3, top + 7, ec); eye(c, cx + 2, top + 7, ec) }
  // arms + moon-orbs
  const armUp = pose === "windup" ? k : 0
  const hand = (dir, behind) => {
    const sx = cx + dir * 7, sy = top + 16, hx = cx + dir * (16 + armUp * 2), hy = top + 30 - armUp * 10
    c.line(sx, sy, hx, hy, behind ? "m" : "l", 3); c.line(sx, sy + 1, hx, hy + 1, behind ? "x" : "v")
    if (!behind) { const r = pose === "windup" ? 2 + k : 2; c.circ(hx + dir * 2, hy - 2, r, "z"); c.px(hx + dir * 2 - 1, hy - 3, "c") }
  }
  if (e) { hand(-1, true); hand(1, false) } else { hand(-1, false); hand(1, false) }
  // motes swirling around
  for (let i = 0; i < 4; i++) { const a = (ph + i / 4) * TAU, x = Math.round(cx + Math.cos(a) * 26), y = Math.round(top + 34 + Math.sin(a) * 8); c.px(x, y, i % 2 ? "l" : "X") }
})
