// Buildings (iso, gable roofs) + the Moonwell. Footprint: left (SW) face A px wide, right (SE)
// face B px wide; the anchor is the front ground corner (A+1, h-2 after the outline).
// The witch cottage has three states (ruined / mended / lush), there are three village houses and
// four Moonwell states (dark, faint, glowing, restored + shimmer animation).
include("_palette.px.js")

// ------------------------------------------------------------------ house generator
// o: { A, B, wh, rh, wallL(u,v,c), wallR(u,v,c), roof(x,y,d,row,c), extra(c, geo) }
function house(o) {
  const { A, B, wh, rh } = o
  return (c) => {
  const by = c.h - 1, W = A + B, g = { A, B, wh, rh, by }
  g.L = [0, by - A / 2]; g.Bv = [A, by]; g.R = [A + B, by - B / 2]
  g.P1 = [B / 2, by - A / 2 - B / 4 - wh - rh]; g.P2 = [A + B / 2, by - B / 4 - wh - rh]
  g.Ly = (x) => by - A / 2 + x / 2                 // ground line under the left face
  g.Ry = (x) => by - (x - A) / 2                   // ground line under the right face
    // walls, painted per pixel in (u, v) face space so features follow the iso slant
    for (let x = 0; x < W; x++) {
      const left = x < A, yb = Math.floor(left ? g.Ly(x) : g.Ry(x))
      for (let v = 0; v < wh + (left ? 0 : 0); v++) {
        const col = left ? o.wallL(x, v, c, g) : o.wallR(x - A, v, c, g)
        if (col) c.px(x, yb - v, col)
      }
    }
    // gable triangle above the right face
    c.poly([A, Math.floor(g.Ry(A)) - wh + 1, A + B, Math.floor(g.Ry(A + B)) - wh + 1, g.P2[0], g.P2[1]], o.gable || "C")
    if (o.gableFn) o.gableFn(c, g)
    // front roof plane with 2px overhang along the ridge and at the eave
    const e = 2
    const q = [g.P1[0] - e, g.P1[1] - e / 2, g.P2[0] + e, g.P2[1] + e / 2, A + e, by - wh + e / 2 + 3, -e, by - A / 2 - wh - e / 2 + 3]
    c.poly(q, o.roofBase || "T")
    const eave = (x) => by - A / 2 - wh + 3 + x / 2   // eave line (front)
    for (let y = 0; y < c.h; y++) for (let x = 0; x < W; x++) {
      if (!c.is(x, y, o.roofBase || "T")) continue
      const d = eave(x) - y, row = Math.floor(d / 3)
      const col = o.roof(x, y, d, row, c, g); if (col) c.px(x, y, col)
    }
    // roof edge on the gable side (thickness) and ridge cap
    c.line(Math.round(g.P2[0] + e), Math.round(g.P2[1] + e / 2), A + e, Math.round(by - wh + e / 2 + 3), o.roofEdge || "j")
    c.line(Math.round(g.P1[0] - e), Math.round(g.P1[1] - e / 2), Math.round(g.P2[0] + e), Math.round(g.P2[1] + e / 2), o.ridge || "R")
    if (o.extra) o.extra(c, g)
  }
}
// Features in wall space: rect (u0..u1, v0..v1)
const inR = (u, v, u0, v0, w, h) => u >= u0 && u < u0 + w && v >= v0 && v < v0 + h
function windowAt(u, v, u0, v0, w, h, glass, frame = "D", sill = "W") {
  if (!inR(u, v, u0 - 1, v0 - 1, w + 2, h + 2)) return null
  if (v === v0 - 1) return sill
  if (!inR(u, v, u0, v0, w, h)) return frame
  if (u === u0 + Math.floor(w / 2) || v === v0 + Math.floor(h / 2)) return frame
  return typeof glass === "function" ? glass(u - u0, v - v0) : glass
}
function doorAt(u, v, u0, w, h, wood, dark, knob) {
  if (!inR(u, v, u0 - 1, 0, w + 2, h + 1)) return null
  if (!inR(u, v, u0, 0, w, h)) return dark
  if (u === u0 + w - 2 && v === Math.floor(h / 2)) return knob
  return (u - u0) % 3 === 2 ? dark : wood
}
// timber + plaster, stone plinth
const plaster = (lit) => (u, v, len, wh) => {
  if (v < 4) return v === 3 ? "S" : (u + (v > 1 ? 2 : 0)) % 6 === 5 ? "S" : lit ? "R" : "r"
  if (v === 4 || v === wh - 1 || u === 0 || u === len - 1) return lit ? "D" : "d"
  return lit ? "c" : "q"
}
const planks = (lit, worn) => (u, v, len, wh) => {
  if (v % 4 === 3) return lit ? "D" : "d"
  if (worn && hash(u >> 1, v >> 2, 5) < 0.12) return "d"
  return lit ? "w" : "D"
}
const stoneWall = (lit) => (u, v) => {
  const row = Math.floor(v / 4), off = (row % 2) * 3
  if (v % 4 === 3 || (u + off) % 7 === 6) return lit ? "r" : "S"
  return lit ? (hash(Math.floor((u + off) / 7), row, 2) < 0.3 ? "q" : "R") : "r"
}
const shingles = (base, joint, hi) => (x, y, d, row) => {
  if (d < 1) return joint
  if (d % 3 === 0) return joint
  if ((x + row * 3) % 6 === 0) return joint
  return d % 3 === 1 && (x + row * 3) % 6 === 1 ? hi : base
}
const thatch = (x, y, d, row) => (d % 4 === 0 ? "w" : hash(x, row, 3) < 0.3 ? "s" : (x + row) % 3 === 0 ? "w" : "W")
const chimney = (c, x, y, h, cols = "rRS") => {
  c.rect(x, y, 6, h, cols[0]); c.vline(x, y, h, cols[1]); c.rect(x + 4, y, 2, h, cols[2]); c.rect(x - 1, y - 1, 8, 2, cols[1]); c.hline(x - 1, y, 8, cols[2])
  c.rect(x + 1, y - 1, 4, 1, "k")
}

// ------------------------------------------------------------------ the witch cottage, 3 states
const CA = 48, CB = 36, CWH = 32, CRH = 20
const cottageWalls = (state) => ({
  wallL: (u, v, c, g) => {
    const len = CA, wh = CWH
    const lit = state === "lush" ? (a, b) => (hash(a, b, 1) < 0.5 ? "Y" : "O") : state === "mended" ? (a, b) => (b === 0 ? "B" : "b") : (a, b) => (hash(a, b, 4) < 0.3 ? "j" : "x")
    const d = doorAt(u, v, 8, 9, 19, state === "ruined" ? "D" : "e", "k", "O"); if (d) return state === "ruined" && (inR(u, v, 7, 12, 11, 2) || inR(u, v, 7, 5, 11, 2)) ? "W" : d
    const w = windowAt(u, v, 27, 13, 10, 9, lit); if (w) return state === "ruined" && (inR(u, v, 26, 16, 12, 1) || inR(u, v, 26, 19, 12, 1)) ? "W" : w
    if (state === "lush" && v < 16 && v > 2 && (u === 4 || u === 5 || u === 20 || u === 41) && hash(u, v, 3) < 0.7) return hash(u, v, 8) < 0.3 ? "h" : "g"   // ivy
    return (state === "ruined" ? planks(true, true) : plaster(true))(u, v, len, wh)
  },
  wallR: (u, v, c, g) => {
    const len = CB, wh = CWH
    const lit = state === "lush" ? (a, b) => (b > 3 ? "O" : "Y") : state === "mended" ? (a, b) => (b === 0 ? "B" : "b") : () => "x"
    const w = windowAt(u, v, 13, 13, 10, 9, lit); if (w) return state === "ruined" && (u + v) % 5 === 0 ? "D" : w
    return (state === "ruined" ? planks(false, true) : plaster(false))(u, v, len, wh)
  },
})
const cottage = (state) => house({
  A: CA, B: CB, wh: CWH, rh: CRH, top: 10, ...cottageWalls(state),
  gable: state === "ruined" ? "D" : "q",
  gableFn: (c, g) => { const x = Math.round(g.P2[0]) - 2, y = Math.round(g.P2[1]) + 6; c.grid(x, y, state === "lush" ? "OYYO\nOYYO" : state === "mended" ? "bBBb\nbbbb" : "xjjx\nxxxx") },
  roofBase: "T",
  roof: state === "ruined"
    ? (x, y, d, row) => (hash(x >> 2, row, 11) < 0.16 && d > 3 ? (d % 3 === 0 ? "D" : "k") : hash(x, row, 7) < 0.25 ? "g" : shingles("t", "j", "T")(x, y, d, row))
    : state === "mended" ? shingles("T", "t", "y")
      : (x, y, d, row) => (d < 3 && hash(x, 0, 2) < 0.6 ? (hash(x, 1, 2) < 0.3 ? "h" : "g") : hash(x >> 1, row, 5) < 0.08 ? "l" : shingles("T", "t", "y")(x, y, d, row)),
  ridge: state === "ruined" ? "D" : "R",
  extra: (c, g) => {
    if (state !== "ruined") chimney(c, Math.round(g.P1[0]) + 10, Math.round(g.P1[1]) + 1, 9)
    else { c.rect(Math.round(g.P1[0]) + 10, Math.round(g.P1[1]) + 5, 6, 5, "r"); c.grid(Math.round(g.P1[0]) + 9, Math.round(g.P1[1]) + 4, "S.S.") }
    const gy = Math.floor(g.Ly(0))
    if (state === "ruined") {
      c.grid(2, Math.floor(g.Ly(2)) - 2, "g.g..\nggGg.\n.gggg")
      c.line(52, g.by - 3, 64, g.by - 9, "D"); c.line(53, g.by - 2, 65, g.by - 8, "w")
      c.grid(74, Math.floor(g.Ry(74)) - 3, "h.g\nggh\nGgg")
    }
    if (state === "lush") {
      // flower boxes, lantern by the door, moss on the eave
      for (let u = 26; u < 38; u++) { const y = Math.floor(g.Ly(u)) - 12; c.px(u, y, "D"); c.px(u, y - 1, (u % 3) ? "g" : u % 2 ? "p" : "l") }
      const lx = 20, ly = Math.floor(g.Ly(20)) - 18; c.grid(lx, ly, "S.\nOS\nYS\nS.")
      c.grid(1, Math.floor(g.Ly(1)) - 3, "l.p.\ngghg\nGggG")
      c.grid(74, Math.floor(g.Ry(74)) - 3, "p.l\nggh\nGgg")
    }
    void gy
  },
})
sprite("cottage_ruined", { w: CA + CB, h: 98, outline: "k" }, cottage("ruined"))
sprite("cottage_mended", { w: CA + CB, h: 98, outline: "k" }, cottage("mended"))
// lush is animated: chimney smoke curls up, window light breathes
anim("cottage_lush", { w: CA + CB, h: 98, frames: 4, fps: 3, outline: "k" }, cottage("lush"), (c) => {
  const x0 = Math.round(CB / 2) + 13, y0 = 6
  for (let k = 0; k < 3; k++) { const y = y0 - k * 3 - (c.frame % 2), x = x0 + Math.round(Math.sin((c.phase + k * 0.3) * TAU) * 1.5); if (y >= 0) { c.px(x, y, k ? "L" : "q"); c.px(x + 1, y, "L") } }
  if (c.frame === 2) c.recolor({ Y: "O" }, (x, y) => x < CA)
})

// ------------------------------------------------------------------ village houses
sprite("house_village_0", { w: 54 + 40, h: 110, outline: "k" }, house({
  A: 54, B: 40, wh: 34, rh: 24,
  wallL: (u, v) => windowAt(u, v, 8, 13, 8, 9, "O") || windowAt(u, v, 38, 13, 8, 9, (a, b) => (b > 3 ? "O" : "Y")) || doorAt(u, v, 23, 9, 19, "D", "d", "O") || plaster(true)(u, v, 54, 34),
  wallR: (u, v) => windowAt(u, v, 16, 13, 8, 9, "O") || plaster(false)(u, v, 40, 34),
  gable: "q", roofBase: "E", roof: shingles("E", "e", "p"), ridge: "e", roofEdge: "d",
  extra: (c, g) => chimney(c, Math.round(g.P1[0]) + 32, Math.round(g.P1[1]) + 7, 12),
}))
sprite("house_village_1", { w: 46 + 46, h: 104, outline: "k" }, house({
  A: 46, B: 46, wh: 32, rh: 22,
  wallL: (u, v) => windowAt(u, v, 30, 12, 9, 9, "O") || doorAt(u, v, 10, 9, 19, "e", "k", "O") || stoneWall(true)(u, v),
  wallR: (u, v) => windowAt(u, v, 8, 12, 8, 8, "b") || windowAt(u, v, 30, 12, 8, 8, "O") || stoneWall(false)(u, v),
  gable: "r", roofBase: "v", roof: shingles("v", "m", "l"), ridge: "m", roofEdge: "x",
  extra: (c, g) => chimney(c, Math.round(g.P2[0]) - 14, Math.round(g.P2[1]) - 3, 11),
}))
sprite("house_village_2", { w: 40 + 34, h: 106, outline: "k" }, house({
  A: 40, B: 34, wh: 48, rh: 20,
  wallL: (u, v) => windowAt(u, v, 24, 30, 8, 9, "O") || windowAt(u, v, 6, 30, 8, 9, "b") || windowAt(u, v, 27, 8, 8, 8, "O") || doorAt(u, v, 9, 9, 19, "D", "k", "O") || (v === 25 ? "d" : planks(true, false)(u, v)),
  wallR: (u, v) => windowAt(u, v, 12, 30, 9, 9, "O") || windowAt(u, v, 12, 8, 9, 8, "b") || (v === 25 ? "d" : planks(false, false)(u, v)),
  gable: "w", roofBase: "W", roof: thatch, ridge: "w", roofEdge: "D",
  extra: (c, g) => { const x = Math.round(g.P2[0]) + 3, y = Math.floor(g.Ry(g.P2[0])) - 42; c.grid(x, y, "SS\nOS\nSS") },
}))

// ------------------------------------------------------------------ Moonwell (4 states)
// 52 wide: two back pillars carrying a crescent, a round stone basin in front.
function moonwell(state) {
  return (c) => {
    const cx = 26, cy = 38
    const pal = {
      dark: { moon: "S", moonHi: "r", water: "x", glint: "m", rune: "S", pillar: "rRS" },
      faint: { moon: "v", moonHi: "l", water: "m", glint: "v", rune: "v", pillar: "rRS" },
      glow: { moon: "l", moonHi: "L", water: "b", glint: "l", rune: "z", pillar: "rRS" },
      restored: { moon: "L", moonHi: "c", water: "B", glint: "i", rune: "z", pillar: "RqS" },
    }[state]
    // pillars (behind the basin)
    for (const px of [7, 41]) {
      const [m, h, s] = pal.pillar
      c.rect(px, 14, 5, 24, m); c.vline(px, 14, 24, h); c.vline(px + 4, 14, 24, s)
      c.rect(px - 1, 12, 7, 3, h); c.hline(px - 1, 14, 7, s); c.rect(px - 1, 36, 7, 2, s)
      for (const y of [20, 26]) c.px(px + 2, y, pal.rune)
      if (state === "dark") { c.line(px + 1, 17, px + 3, 24, "S"); c.px(px + 2, 21, "j") }
    }
    // the arch beam + crescent
    if (state === "dark") { c.line(7, 12, 18, 7, "r", 2); c.line(36, 7, 46, 12, "r", 2); c.grid(20, 3, "..SS\n.Sr.\nSr..\nS..."); c.grid(30, 9, "S\n.S") }
    else {
      c.line(7, 12, 26, 4, pal.pillar[1], 2); c.line(26, 4, 46, 12, pal.pillar[0], 2)
      c.circ(26, 6, 7, pal.moon); c.circ(29, 4, 6, "_"); c.px(21, 4, pal.moonHi); c.px(20, 6, pal.moonHi); c.px(21, 9, pal.moonHi)
      c.line(7, 12, 26, 4, pal.pillar[1]); c.line(27, 4, 46, 12, pal.pillar[0])
    }
    // basin: outer wall, rim, pool
    c.ellipse(cx, cy + 4, 21, 8, "S"); c.rect(5, cy - 2, 43, 6, "r"); c.rect(5, cy - 2, 12, 6, "R"); c.rect(38, cy - 2, 10, 6, "S")
    for (const [x, y] of [[10, cy + 1], [18, cy + 3], [27, cy + 4], [35, cy + 3], [42, cy + 1]]) c.vline(x, y - 3, 3, "S")
    c.ellipse(cx, cy - 2, 21, 8, "R"); c.ellipse(cx - 1, cy - 3, 19, 6, "q"); c.ellipse(cx, cy - 2, 17, 6, "r")
    c.ellipse(cx, cy - 1, 16, 5, pal.water)
    // front rim runes
    for (const x of [14, 22, 30, 38]) c.px(x, cy + 3, pal.rune)
    if (state === "dark") {
      c.line(16, cy + 2, 20, cy + 6, "j"); c.line(33, cy - 6, 36, cy - 2, "S"); c.grid(20, cy - 2, "D.e\n.w.")
      c.grid(32, cy, "S.\n.S"); c.grid(4, cy + 4, "g.G\nGg.")
    } else {
      c.hline(cx - 9, cy - 3, 5, pal.glint); c.hline(cx + 3, cy, 6, pal.glint)
    }
    if (state === "glow" || state === "restored") {
      c.ellipse(cx, cy - 1, 10, 3, state === "restored" ? "i" : "B"); c.ellipse(cx - 1, cy - 2, 5, 1, state === "restored" ? "c" : "i")
      c.grid(3, cy + 4, "l.L.\nggHg"); c.grid(44, cy + 3, ".L.l\nhggg")
    }
  }
}
sprite("moonwell_dark", { w: 52, h: 48, outline: "k" }, moonwell("dark"))
sprite("moonwell_faint", { w: 52, h: 48, outline: "k" }, moonwell("faint"))
anim("moonwell_glow", { w: 52, h: 48, frames: 4, fps: 4, outline: "k" }, moonwell("glow"), (c) => {
  const pts = [[16, 36], [30, 39], [36, 35], [22, 40]], [x, y] = pts[c.frame]; c.px(x, y, "L"); c.px(x + 1, y, "l")
})
anim("moonwell_restored", { w: 52, h: 48, frames: 8, fps: 6, outline: "k" }, moonwell("restored"), (c) => {
  // shimmer: a glint orbits the pool, motes rise from it, the crescent pulses
  const a = c.phase * TAU, gx = Math.round(26 + Math.cos(a) * 12), gy = Math.round(37 + Math.sin(a) * 4)
  c.px(gx, gy, "c"); c.px(gx - 1, gy, "L"); c.px(gx + 1, gy, "L")
  for (let k = 0; k < 3; k++) {
    const t = (c.phase + k / 3) % 1, x = Math.round(18 + k * 8 + Math.sin((t * 2 + k) * TAU) * 2), y = Math.round(34 - t * 26)
    c.px(x, y, t < 0.5 ? "Y" : "L")
  }
  if (c.frame % 4 < 2) { c.px(22, 7, "c"); c.px(21, 5, "c") }
  for (const [px] of [[9], [43]]) c.px(px, 20 + (c.frame % 2) * 6, "c")
})
// a plain stone village well is in props; a dry fountain for the village square:
sprite("fountain_dry", { w: 40, h: 30, outline: "k" }, (c) => {
  c.ellipse(20, 22, 18, 6, "S"); c.rect(2, 16, 37, 6, "r"); c.rect(2, 16, 10, 6, "R")
  c.ellipse(20, 16, 18, 6, "R"); c.ellipse(20, 16, 15, 4, "r"); c.ellipse(20, 17, 14, 3, "S")
  c.rect(18, 4, 5, 12, "r"); c.vline(18, 4, 12, "R"); c.vline(22, 4, 12, "S"); c.ellipse(20, 4, 5, 2, "R"); c.px(20, 2, "q")
  c.grid(8, 17, "D.w")
})
