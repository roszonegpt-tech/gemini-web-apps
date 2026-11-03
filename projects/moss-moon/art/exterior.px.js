// Building exteriors at the PHASE3 player-relative scale (MM.BUILDINGS.unit): wall 66 px (plinth 5 + door 54 + lintel 7),
// door opening 32x54 face px, windows 14x16 at sill 26, roof overhang 4, rise 30 (small) / 42 (large).
//   bld_tutorial_hut, bld_mill_locked, bld_shed_locked   whole buildings; anchor = front ground corner [16*fw+1+ov, h-2]
//   ext_* parts for WORLD's painter / overlays (see notes/ART_DIRECTION.md): _l = on a SW-facing (left) face, slanting
//   down-right; _r = on a SE-facing (right) face (mirrored, shaded). Anchor = centre of the piece's bottom edge on the wall.
//   Free-standing structures (WORLD requests): notice_board, mailbox, waystone (4f), pillar, pillar_broken, crypt_block,
//   thorn_gate, sunken_arch, ice_cave, mausoleum, rain_barrel, hanging_sign, training_dummy. Anchor bottom-centre.
include("_palette.px.js")
include("_iso.px.js")

const inR = (u, v, u0, v0, w, h) => u >= u0 && u < u0 + w && v >= v0 && v < v0 + h
const PL = 5, DOOR_W = 32, DOOR_H = 54, WH = 66
// ---------------------------------------------------------------- materials (face space; lit = left/SW face)
const MAT = {
  plank: (u, v, lit, wx) => { if (v % 5 === 4) return lit ? "D" : "d"; if (wx && hash(u >> 2, v / 5 | 0, 5) < wx * 0.15) return lit ? "D" : "d"; if (v % 5 === 3 && hash(u >> 3, v, 2) < 0.4) return lit ? "W" : "w"; return lit ? "w" : "D" },
  stone: (u, v, lit, wx) => { const row = Math.floor(v / 6), off = (row % 2) * 4; if (v % 6 === 5 || (u + off) % 9 === 8) return lit ? "r" : "S"; if (wx && hash((u + off) / 9 | 0, row, 7) < wx * 0.25 && v % 6 < 2) return lit ? "g" : "G"; return lit ? (hash((u + off) / 9 | 0, row, 2) < 0.3 ? "q" : "R") : (hash((u + off) / 9 | 0, row, 2) < 0.3 ? "R" : "r") },
  plaster: (u, v, lit) => (v === WH - 2 || v === PL + 1 ? (lit ? "D" : "d") : lit ? "c" : "q"),
  log: (u, v, lit) => { const vv = v % 7; return vv === 0 ? "d" : vv === 6 ? (lit ? "o" : "a") : vv === 1 ? (lit ? "D" : "d") : lit ? "a" : "D" },
}
const plinth = (u, v, lit) => { const off = v > 2 ? 3 : 0; return (u + off) % 7 === 6 || v === 4 ? (lit ? "r" : "S") : lit ? "R" : "r" }
const ROOF = {
  shingle: (x, y, d, row, mossy) => { if (d < 1 || d % 3 === 0 || (x + row * 3) % 6 === 0) return mossy && d < 4 && hash(x, row, 3) < 0.5 ? "G" : "t"; if (mossy && d < 6 && hash(x >> 1, row, 1) < 0.45) return hash(x, row, 2) < 0.4 ? "h" : "g"; return d % 3 === 1 && (x + row * 3) % 6 === 1 ? "y" : "T" },
  slate: (x, y, d, row, mossy) => { if (d < 1 || d % 3 === 0 || (x + row * 4) % 8 === 0) return mossy && hash(x, row, 7) < 0.3 ? "G" : "S"; if (mossy && d < 5 && hash(x >> 1, row, 3) < 0.5) return "g"; return d % 3 === 1 && (x + row * 4) % 8 === 1 ? "R" : hash(x >> 3, row, 9) < 0.2 ? "R" : "r" },
  thatch: (x, y, d, row, mossy) => (d % 4 === 0 ? "w" : mossy && d < 6 && hash(x, row, 4) < 0.35 ? "g" : hash(x, row, 3) < 0.3 ? "s" : (x + row) % 3 === 0 ? "w" : "W"),
}
const RIDGE = { shingle: ["R", "q", "S"], slate: ["S", "r", "j"], thatch: ["w", "W", "D"] }
// door opening (u0 = left edge of the opening, z0 = plinth): frame, double plank leaves, iron straps, ring pulls; locked = boarded X
function doorPx(u, v, u0, z0, lit, locked, open) {
  if (!inR(u, v, u0 - 2, z0, DOOR_W + 4, DOOR_H + 2)) return null
  const du = u - u0, dv = v - z0
  if (du < 0 || du >= DOOR_W || dv >= DOOR_H) return dv >= DOOR_H ? (lit ? "w" : "D") : lit ? "W" : "w"   // frame + lintel
  if (open) return dv < 2 ? "o" : du < 3 ? "d" : dv > DOOR_H - 4 ? "k" : "j"
  if (locked) {
    const t = dv / DOOR_H, a = Math.abs(du - t * DOOR_W), b = Math.abs(du - (1 - t) * DOOR_W)
    if (a < 2.2 || b < 2.2) return (a < 2.2 && Math.abs(a - 1) < 0.6 && dv % 9 === 4) || (b < 2.2 && Math.abs(b - 1) < 0.6 && dv % 9 === 7) ? "S" : (a < 0.8 || b < 0.8 ? "W" : "w")
  }
  if (du === 15 || du === 16) return "d"
  if (dv === 10 || dv === 11 || dv === 42 || dv === 43) return (du < 12 || du > 19) ? (dv % 2 ? "S" : "r") : null ?? (lit ? "D" : "d")
  if ((du === 13 || du === 18) && dv >= 26 && dv <= 28) return dv === 27 ? "O" : "a"
  if (du % 4 === 3) return lit ? "D" : "d"
  return du % 4 === 0 ? (lit ? "E" : "e") : lit ? "e" : "d"
}
// window 14x16 at sill z: frame, cross mullion, sill; lit (warm), dark (cool) or shuttered (closed planks with a Z brace)
function windowPx(u, v, u0, z, lit, mode) {
  if (!inR(u, v, u0 - 2, z - 2, 18, 20)) return null
  const du = u - u0, dv = v - z
  if (mode === "shut") {
    if (dv < 0) return dv === -1 ? (lit ? "W" : "w") : "d"
    if (du < -1 || du > 14 || dv > 16) return null
    const half = du < 7 ? du + 1 : du - 7
    if (du === 6 || du === 7) return "d"
    if (Math.abs(half - (dv / 16) * 7) < 0.8 || dv === 2 || dv === 13) return lit ? "W" : "w"
    return half % 3 === 0 ? (lit ? "D" : "d") : lit ? "w" : "D"
  }
  if (dv < 0) return dv === -1 ? (lit ? "s" : "W") : "d"
  if (du < 0 || du >= 14 || dv >= 16) return dv >= 16 && dv < 18 && du >= -1 && du <= 14 ? (lit ? "w" : "D") : du >= -2 && du <= 15 && dv < 18 ? (lit ? "W" : "w") : null
  if (du === 6 || du === 7 || dv === 8) return lit ? "D" : "d"
  if (mode === "lit") return dv > 10 ? "Y" : (du + dv) % 5 === 0 ? "Y" : "O"
  return (du === 1 || du === 9) && (dv === 14 || dv === 6) ? "i" : dv > 9 ? "B" : "b"
}

// ---------------------------------------------------------------- building generator (ported from buildings.px.js house())
// o: {A (left face px), B (right face px), rh, wall, roof, door:{face, at}, windows:[{face, at, mode}], weather, locked, extra}
function bld(o) {
  const { A, B, rh } = o, ov = 6
  return (c) => {
    const by = c.h - 2, X = (x) => x + ov
    const Ly = (x) => by - A / 2 + x / 2, Ry = (x) => by - (x - A) / 2
    const lit0 = (face) => face === "L"
    const feats = { L: [], R: [] }
    if (o.door) feats[o.door.face].push({ k: "door", u0: Math.round((o.door.face === "L" ? A - o.door.at : o.door.at) - DOOR_W / 2) })
    for (const w of o.windows || []) feats[w.face].push({ k: "win", u0: Math.round((w.face === "L" ? A - w.at : w.at) - 7), mode: w.mode })
    const wall = (face, u, v) => {
      const lit = lit0(face)
      for (const f of feats[face]) { const p = f.k === "door" ? doorPx(u, v, f.u0, PL, lit, o.locked, false) : windowPx(u, v, f.u0, 26, lit, f.mode); if (p) return p }
      if (v < PL) return plinth(u, v, lit)
      if (o.weather && v < PL + 8 && hash(u >> 1, v >> 1, 11) < o.weather * (PL + 8 - v) / 14) return lit ? "g" : "G"    // moss creeping up
      if (o.ivy && v > 10 && hash(u >> 2, v >> 3, 4) < o.ivy * 0.2 && hash(u, v, 9) < 0.7) return hash(u, v, 3) < 0.3 ? "h" : "g"
      return MAT[o.wall](u, v, lit, o.weather)
    }
    for (let x = 0; x < A + B; x++) {
      const left = x < A, yb = Math.floor(left ? Ly(x) : Ry(x))
      for (let v = 0; v < WH; v++) c.px(X(x), yb - v, wall(left ? "L" : "R", left ? x : x - A, v))
    }
    // gable (right face), weatherboarded, with a vent
    const P1 = [B / 2, by - A / 2 - B / 4 - WH - rh], P2 = [A + B / 2, by - B / 4 - WH - rh]
    c.poly([X(A), Math.floor(Ry(A)) - WH + 1, X(A + B), Math.floor(Ry(A + B)) - WH + 1, X(P2[0]), P2[1]], o.gable || "D")
    for (let y = Math.floor(P2[1]); y < by; y++) for (let x = A; x < A + B; x++) if (c.key(X(x), y) === (o.gable || "D") && (y - Math.floor(P2[1])) % 4 === 3) c.px(X(x), y, "d")
    c.grid(X(Math.round(P2[0])) - 2, Math.round(P2[1]) + 9, "kkkk\nkjjk\nkkkk")
    // roof plane with overhang e
    const e = 4, q = [X(P1[0] - e), P1[1] - e / 2, X(P2[0] + e), P2[1] + e / 2, X(A + e), by - WH + e / 2 + 3, X(-e), by - A / 2 - WH - e / 2 + 3]
    c.poly(q, "#050607"); const tmp = c.color("#050607")
    const eave = (x) => by - A / 2 - WH + 3 + x / 2
    for (let y = 0; y < c.h; y++) for (let x = -e; x < A + B; x++) {
      if (c.get(X(x), y) !== tmp) continue
      const d = eave(x) - y, row = Math.floor(d / 3)
      c.px(X(x), y, ROOF[o.roof](x, y, d, row, o.weather > 0.4))
    }
    const rc = RIDGE[o.roof]
    c.line(X(Math.round(P2[0] + e)), Math.round(P2[1] + e / 2), X(A + e), Math.round(by - WH + e / 2 + 3), rc[2])
    c.line(X(Math.round(P2[0] + e)), Math.round(P2[1] + e / 2) + 1, X(A + e), Math.round(by - WH + e / 2 + 3) + 1, rc[2])
    c.line(X(Math.round(P1[0] - e)), Math.round(P1[1] - e / 2), X(Math.round(P2[0] + e)), Math.round(P2[1] + e / 2), rc[1])
    c.line(X(Math.round(P1[0] - e)), Math.round(P1[1] - e / 2) + 1, X(Math.round(P2[0] + e)), Math.round(P2[1] + e / 2) + 1, rc[0])
    // steps in front of the door
    if (o.door && o.door.face === "L") {
      const u1 = Math.round(A - o.door.at + DOOR_W / 2 + 2)
      for (let s = 0; s < (o.steps || 1); s++) { const D = 6 + s * 5, H = 4 * ((o.steps || 1) - s) - 1; prism(c, X(u1) - D, Ly(u1) + D / 2, D, DOOR_W + 4, H, (f, u, v) => f === "T" ? (u < 1.5 ? "q" : "R") : f === "L" ? (Math.floor(u) % 7 === 0 ? "r" : "R") : "S") }
    } else if (o.door) {
      const u0 = Math.round(o.door.at - DOOR_W / 2 - 2), D = 6
      prism(c, X(A + u0) + D, Ry(A + u0) + D / 2, DOOR_W + 4, D, 3, (f, u, v) => f === "T" ? "R" : f === "L" ? "R" : "S")
    }
    if (o.extra) o.extra(c, { A, B, by, X, Ly, Ry, P1, P2 })
  }
}
function building(name, fw, fd, rh, o) {
  const A = fw * 16, B = fd * 16, w = A + B + 12, h = WH + rh + Math.ceil((A + B) / 2) + 30
  sprite(name, { w, h, outline: "k" }, bld(Object.assign({ A, B, rh }, o)))
  meta(name, { ax: A + 6 + 1, ay: h - 1, foot: [fw, fd], anchorMode: "front" })
}
building("bld_tutorial_hut", 3.5, 3, 30, {
  wall: "plank", roof: "shingle", door: { face: "L", at: 26 }, windows: [{ face: "R", at: 24, mode: "lit" }], steps: 1, weather: 0.1,
  extra: (c, g) => { const x = g.X(4), y = Math.floor(g.Ly(4)); c.grid(x, y - 6, "..l.p.\n.gghgg\nGgGggG") ; const lx = g.X(g.A - 3), ly = Math.floor(g.Ly(g.A - 3)) - 50; c.grid(lx, ly, "S.\nSO\nSY\nS.") },
})
building("bld_shed_locked", 3, 3, 30, {
  wall: "plank", roof: "slate", door: { face: "R", at: 24 }, windows: [{ face: "L", at: 24, mode: "shut" }], locked: true, weather: 0.6, gable: "w",
  extra: (c, g) => { const x = g.X(g.A + 6), y = Math.floor(g.Ry(g.A + 6)); c.grid(x, y - 4, "g.h\nggG\nGgg"); c.grid(g.X(2), Math.floor(g.Ly(2)) - 5, "h..\nggh\nGgG") },
})
building("bld_mill_locked", 4.5, 4, 42, {
  wall: "stone", roof: "slate", door: { face: "L", at: 28 }, windows: [{ face: "L", at: 56, mode: "shut" }, { face: "R", at: 30, mode: "shut" }], locked: true, weather: 0.7, ivy: 0.4, steps: 1, gable: "w",
  extra: (c, g) => {
    // broken water wheel leaning on the right face: spokes, paddles, one missing
    const cx = g.X(g.A + 44), cy = Math.floor(g.Ry(g.A + 44)) - 22, R = 20
    c.ellipse(cx, cy, 7, R, "D", true); c.ellipse(cx, cy, 6, R - 1, "w", true); c.ellipse(cx, cy, 5, R - 2, "d", true)
    for (let i = 0; i < 8; i++) { if (i === 5) continue; const a = i / 8 * TAU, x = Math.round(cx + Math.cos(a) * 6), y = Math.round(cy + Math.sin(a) * (R - 1)); c.line(cx, cy, x, y, "w"); c.rect(x - 1, y - 1, 3, 3, "W"); c.px(x + 1, y + 1, "D") }
    c.rect(cx - 1, cy - 1, 3, 3, "S"); c.px(cx - 1, cy - 1, "r")
    c.grid(cx - 4, cy + R - 3, "g.G.h\nGgggG"); c.grid(g.X(3), Math.floor(g.Ly(3)) - 6, ".h.g\nhggG\nGgGg")
  },
})

// ---------------------------------------------------------------- face parts (ext_*), drawn in face space then slanted
// part(name, w, h, fn(u, v, lit)) -> name_l (SW face, lit) + name_r (SE face, shaded, mirrored)
function part(name, w, h, fn, frames) {
  for (const side of ["l", "r"]) {
    const lit = side === "l", H = h + Math.floor((w - 1) / 2), n = `${name}_${side}`
    const body = (c) => { for (let x = 0; x < w; x++) for (let v = 0; v < h; v++) { const u = lit ? x : w - 1 - x, k = fn(u, v, lit, c.frame || 0); if (k) c.px(x, h - 1 - v + (lit ? Math.floor(x / 2) : Math.floor((w - 1 - x) / 2)), k) } }
    if (frames) anim(n, { w, h: H, frames, fps: 5, outline: "k" }, body); else sprite(n, { w, h: H, outline: "k" }, body)
    const cx = Math.floor(w / 2); meta(n, { ax: cx + 1, ay: h - 1 + Math.floor((lit ? cx : w - 1 - cx) / 2) + 1, face: lit ? "L" : "R" })
  }
}
part("ext_door", DOOR_W + 4, DOOR_H + 2, (u, v, lit) => doorPx(u, v, 2, 0, lit, false, false))
part("ext_door_open", DOOR_W + 4, DOOR_H + 2, (u, v, lit) => doorPx(u, v, 2, 0, lit, false, true))
part("ext_door_boarded", DOOR_W + 4, DOOR_H + 2, (u, v, lit) => doorPx(u, v, 2, 0, lit, true, false))
part("ext_door_frame", DOOR_W + 4, DOOR_H + 2, (u, v, lit) => { const p = doorPx(u, v, 2, 0, lit, false, false); return u < 2 || u >= DOOR_W + 2 || v >= DOOR_H ? p : null })
part("ext_window_lit", 18, 20, (u, v, lit) => windowPx(u, v, 2, 2, lit, "lit"))
part("ext_window_dark", 18, 20, (u, v, lit) => windowPx(u, v, 2, 2, lit, "dark"))
part("ext_window_shuttered", 18, 20, (u, v, lit) => windowPx(u, v, 2, 2, lit, "shut"))
part("ext_shutters_open", 30, 20, (u, v, lit) => {                     // open shutters flanking a 14 px window (window not included)
  if (v < 1 || v > 18 || (u > 6 && u < 23)) return null
  const half = u < 7 ? u : u - 23
  if (half === 0 || half === 6) return lit ? "t" : "j"
  if (v === 4 || v === 15) return lit ? "T" : "t"
  return half % 2 ? (lit ? "T" : "t") : lit ? "B" : "b"
})
part("ext_flowerbox", 20, 7, (u, v, lit) => {
  if (v < 3) return v === 0 ? "d" : u % 5 === 0 ? (lit ? "D" : "d") : lit ? "w" : "D"
  return hash(u, v, 3) < 0.25 ? (hash(u, v, 4) < 0.5 ? "p" : "l") : hash(u, v, 5) < 0.2 ? "O" : (u + v) % 2 ? "g" : "h"
})
part("ext_foundation", 16, 6, (u, v, lit) => plinth(u, v, lit))
part("ext_foundation_mossy", 16, 8, (u, v, lit) => v < 5 ? (hash(u >> 1, v, 3) < 0.35 ? (lit ? "g" : "G") : plinth(u, v, lit)) : hash(u, v, 6) < 0.45 ? (lit ? "h" : "g") : null)
part("ext_awning", 36, 12, (u, v, lit) => {                           // striped canvas awning, scalloped hem, with a pole
  if (v < 3) return (u % 6 < 3) === (v === 0) ? null : Math.floor(u / 6) % 2 ? (lit ? "c" : "q") : lit ? "l" : "v"
  return Math.floor(u / 6) % 2 ? (lit ? "c" : "C") : lit ? "l" : "v"
})
part("ext_sign_bracket", 20, 18, (u, v, lit) => {                      // iron bracket + hanging board
  if (v === 17 && u < 18) return "S"; if (v === 16 && u === 0) return "S"
  if (u === 3 && v > 12 && v < 17) return "S"; if (u === 15 && v > 12 && v < 17) return "S"
  if (u >= 1 && u <= 17 && v >= 2 && v <= 12) { if (u === 1 || u === 17 || v === 2 || v === 12) return lit ? "D" : "d"; if (v === 7 && u > 4 && u < 14) return "o"; return lit ? "W" : "w" }
  return null
})

// roof edge pieces per material (16 px segments): ridge cap (runs down-right), eave edge (down-right), verge (gable edge, down-left)
for (const m of ["shingle", "slate", "thatch"]) {
  const rc = RIDGE[m]
  for (const mossy of [false, true]) {
    const sfx = mossy ? "_mossy" : ""
    sprite(`ext_ridge_${m}${sfx}`, { w: 16, h: 12, outline: "k" }, (c) => { for (let x = 0; x < 16; x++) { const y = 2 + Math.floor(x / 2); c.px(x, y, rc[1]); c.px(x, y + 1, rc[0]); c.px(x, y + 2, rc[2]); if (mossy && hash(x, 1, 3) < 0.4) c.px(x, y - 1, hash(x, 2, 3) < 0.5 ? "g" : "h") } })
    sprite(`ext_eave_${m}${sfx}`, { w: 16, h: 16, outline: "k" }, (c) => { for (let x = 0; x < 16; x++) { const y = 3 + Math.floor(x / 2); for (let d = 0; d < 6; d++) c.px(x, y + 5 - d, ROOF[m](x, 0, d, Math.floor(d / 3), mossy)); c.px(x, y + 6, rc[2]) } if (mossy) c.grid(5, 11, "g\nG\ng") })
    sprite(`ext_verge_${m}${sfx}`, { w: 16, h: 14, outline: "k" }, (c) => { for (let x = 0; x < 16; x++) { const y = 2 + Math.floor((15 - x) / 2); c.px(x, y, rc[1]); c.px(x, y + 1, rc[2]); c.px(x, y + 2, rc[2]); c.px(x, y + 3, "d"); if (mossy && hash(x, 4, 1) < 0.35) c.px(x, y - 1, "g") } })
  }
}
// chimney (stone, with a cap and soot), mossy variant
for (const mossy of [false, true]) sprite(mossy ? "ext_chimney_mossy" : "ext_chimney", { w: 12, h: 26, outline: "k" }, (c) => {
  c.rect(1, 4, 10, 22, "r"); c.rect(1, 4, 4, 22, "R"); c.rect(8, 4, 3, 22, "S")
  for (let y = 7; y < 26; y += 4) { c.hline(1, y, 10, "S"); c.px((y % 8 ? 4 : 7), y - 1, "S"); c.px((y % 8 ? 4 : 7), y - 2, "S") }
  c.rect(0, 2, 12, 3, "R"); c.hline(0, 4, 12, "S"); c.rect(2, 0, 8, 2, "S"); c.rect(3, 0, 6, 1, "k"); c.hline(2, 5, 8, "j")
  if (mossy) c.grid(0, 2, "gg.hg...gGg\nG.gG......g")
})

// ---------------------------------------------------------------- free-standing structures (bottom-centre anchor)
sprite("rain_barrel", { w: 15, h: 18, outline: "k" }, (c) => {
  c.rect(1, 3, 13, 13, "w"); c.rect(0, 5, 15, 9, "w"); c.vline(1, 4, 11, "W"); c.vline(2, 3, 13, "W"); c.vline(11, 3, 13, "D"); c.vline(12, 4, 11, "D"); c.vline(13, 5, 9, "d")
  for (const y of [5, 13]) { c.hline(0, y, 15, "r"); c.hline(10, y, 5, "S") }
  c.ellipse(7, 3, 6, 2, "D"); c.ellipse(7, 3, 5, 1, "b"); c.hline(4, 3, 4, "B"); c.px(9, 2, "i"); c.hline(1, 17, 13, "D"); c.grid(0, 15, "g.\ngG")
})
sprite("hanging_sign", { w: 22, h: 20, outline: "k" }, (c) => {
  c.vline(1, 0, 20, "D"); c.vline(2, 0, 20, "d"); c.hline(1, 1, 20, "S"); c.line(3, 6, 8, 1, "S")
  c.vline(7, 2, 3, "S"); c.vline(18, 2, 3, "S"); c.rect(5, 5, 16, 9, "W"); c.box(5, 5, 16, 9, "D"); c.hline(6, 12, 14, "w")
  c.grid(10, 7, ".O..\nOYO.\n.O..\n.a.."); c.grid(15, 7, "lL\nL.\nlL")
})
sprite("notice_board", { w: 32, h: 36, outline: "k" }, (c) => {
  c.rect(3, 8, 3, 28, "D"); c.vline(3, 8, 28, "w"); c.rect(26, 8, 3, 28, "d")
  c.poly([0, 8, 16, 1, 32, 8, 29, 10, 16, 4, 3, 10], "t"); c.line(1, 8, 16, 1, "T"); c.line(16, 1, 31, 8, "t"); c.hline(13, 2, 6, "T")
  c.rect(4, 10, 24, 17, "a"); c.box(4, 10, 24, 17, "D"); c.hline(5, 26, 22, "d")
  c.rect(6, 12, 7, 8, "c"); c.hline(7, 14, 5, "R"); c.hline(7, 16, 4, "R"); c.px(9, 12, "f")
  c.rect(15, 11, 8, 6, "C"); c.hline(16, 13, 6, "R"); c.px(18, 11, "f"); c.rect(14, 18, 10, 7, "c"); c.grid(16, 19, "O.O\n.O.\nO.O"); c.px(23, 18, "B")
  c.grid(1, 33, "g.h\nggG"); c.grid(26, 34, "hg\nGg")
})
sprite("mailbox", { w: 16, h: 26, outline: "k" }, (c) => {
  c.rect(7, 12, 2, 14, "D"); c.vline(7, 12, 14, "w")
  c.rect(2, 4, 12, 9, "T"); c.ellipse(8, 4, 6, 3, "T"); c.rect(2, 4, 3, 9, "h"); c.rect(11, 4, 3, 9, "t"); c.hline(2, 12, 12, "t"); c.hline(3, 7, 10, "j")
  c.rect(5, 8, 5, 3, "c"); c.px(13, 2, "f"); c.vline(14, 1, 5, "S"); c.rect(14, 1, 2, 2, "f")
  c.grid(5, 24, "g.h\nGgg")
})
anim("waystone", { w: 16, h: 30, frames: 4, fps: 4, outline: "k" }, (c) => {
  c.poly([3, 29, 2, 10, 5, 2, 10, 0, 13, 4, 14, 29], "r"); c.poly([3, 29, 2, 10, 5, 2, 7, 1, 6, 29], "R"); c.poly([11, 3, 13, 4, 14, 29, 11, 29], "S")
  c.grid(5, 1, "qq\nq")
  const g = ["z", "i", "z", "T"][c.frame]; c.grid(6, 10, `.${g}.\n${g}.${g}\n.${g}.\n.${g}.\n${g}${g}${g}`); if (c.frame === 1) c.px(7, 8, "c")
  c.grid(1, 25, "g..\nGgh\ngGgG"); c.grid(12, 24, ".h\ngG")
  c.hline(4, 18, 4, "S"); c.px(11, 21, "R")
})
sprite("pillar", { w: 16, h: 38, outline: "k" }, (c) => {
  c.rect(2, 4, 12, 30, "r"); c.rect(2, 4, 4, 30, "R"); c.rect(11, 4, 3, 30, "S"); for (const x of [5, 8, 11]) c.vline(x, 5, 28, x === 11 ? "j" : "S")
  c.rect(0, 0, 16, 4, "R"); c.hline(0, 3, 16, "S"); c.hline(1, 0, 14, "q"); c.rect(0, 33, 16, 5, "r"); c.hline(0, 33, 16, "R"); c.rect(12, 33, 4, 5, "S")
  c.grid(1, 28, "g..\nGg.\nggh"); c.grid(11, 6, ".g\ngG\n.g")
})
sprite("pillar_broken", { w: 16, h: 26, outline: "k" }, (c) => {
  c.poly([2, 22, 2, 6, 6, 3, 9, 6, 12, 2, 14, 5, 14, 22], "r"); c.poly([2, 22, 2, 6, 6, 3, 6, 22], "R"); c.rect(11, 3, 3, 19, "S")
  for (const x of [5, 8, 11]) c.vline(x, 7, 15, x === 11 ? "j" : "S"); c.line(6, 3, 9, 6, "q")
  c.rect(0, 21, 16, 5, "r"); c.hline(0, 21, 16, "R"); c.rect(12, 21, 4, 5, "S"); c.grid(0, 18, "g.h.\nGgGg"); c.grid(9, 20, "hg\nGg")
})
sprite("crypt_block", { w: 30, h: 32, outline: "k" }, (c) => {
  prism(c, 14, 31, 14, 14, 22, (f, u, v) => {
    if (f === "T") return (Math.floor(u) % 7 === 0 || Math.floor(v) % 7 === 0) ? "r" : "R"
    const row = Math.floor(v / 6), off = row % 2 ? 4 : 0
    if (Math.floor(v) % 6 === 5 || (Math.floor(u) + off) % 7 === 6) return f === "L" ? "r" : "j"
    return f === "L" ? (hash(Math.floor((u + off) / 7), row, 3) < 0.25 ? "q" : "R") : hash(Math.floor((u + off) / 7), row, 3) < 0.25 ? "r" : "S"
  })
  c.grid(2, 24, "g.\nGg\ngG"); c.grid(17, 26, "m.\n.m")
})
// dungeon entrances (frontal, dark mouth ~20 px wide, centred; WORLD animates a portal swirl over the mouth)
const mouth = (c, cx, top, bot, w) => { c.ellipse(cx, top + w / 2, w / 2, w / 2, "x"); c.rect(cx - w / 2, top + w / 2, w + 1, bot - top - w / 2, "x"); c.ellipse(cx, top + w / 2 + 1, w / 2 - 2, w / 2 - 2, "k"); c.rect(cx - w / 2 + 2, top + w / 2 + 1, w - 3, bot - top - w / 2 - 1, "k") }
sprite("thorn_gate", { w: 62, h: 46, outline: "k" }, (c) => {
  c.ellipse(31, 34, 30, 16, "D"); c.ellipse(28, 30, 24, 12, "w"); c.ellipse(26, 27, 16, 7, "W"); c.rect(1, 34, 60, 12, "D"); c.ellipse(31, 45, 30, 2, "d")
  c.ellipse(46, 36, 12, 8, "d")
  mouth(c, 31, 22, 45, 20)
  const vine = (pts) => { for (let i = 0; i < pts.length - 2; i += 2) { c.line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], "m", 2); c.line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], "X") } }
  vine([4, 40, 12, 26, 20, 20, 30, 18, 40, 21, 50, 28, 58, 40]); vine([10, 44, 18, 30, 22, 24]); vine([52, 44, 46, 32, 42, 25])
  for (const [x, y] of [[12, 26], [20, 20], [30, 18], [40, 21], [50, 28], [18, 30], [46, 32], [7, 34], [55, 35]]) { c.px(x, y - 2, "x"); c.px(x + 2, y - 1, "x"); c.px(x - 1, y + 2, "l") }
  c.grid(23, 34, "x.x\n.x.\nx.x"); c.grid(35, 38, "x.\n.x"); c.grid(2, 42, "G.g\nGGg")
})
sprite("sunken_arch", { w: 60, h: 48, outline: "k" }, (c) => {
  c.ellipse(30, 44, 29, 4, "u"); c.ellipse(30, 44, 26, 2, "b")
  // arch stones (voussoirs) on two piers, sunk to the knees
  c.rect(6, 18, 12, 26, "r"); c.rect(42, 18, 12, 26, "S"); c.rect(6, 18, 4, 26, "R")
  for (let i = 0; i <= 10; i++) { const a = Math.PI + i / 10 * Math.PI, x = Math.round(30 + Math.cos(a) * 18), y = Math.round(22 + Math.sin(a) * 18); c.rect(x - 4, y - 3, 8, 7, i < 5 ? "R" : "r"); c.box(x - 4, y - 3, 8, 7, i < 5 ? "r" : "S") }
  mouth(c, 30, 14, 44, 20)
  c.rect(12, 0, 4, 2, "q"); for (const y of [24, 30, 36]) { c.hline(6, y, 12, "S"); c.hline(42, y, 12, "j") }
  c.grid(4, 8, "gg.G\nGg.g\n.g..\n.G.."); c.grid(40, 4, "..gG\n.gg.\n..g."); c.grid(20, 42, "U.U.U\nUUUUU"); c.grid(44, 40, ".U.\nUUU")
  c.vline(9, 18, 10, "g"); c.vline(48, 22, 8, "G")
})
sprite("ice_cave", { w: 66, h: 48, outline: "k" }, (c) => {
  c.ellipse(33, 36, 32, 20, "r"); c.ellipse(29, 31, 25, 14, "R"); c.ellipse(46, 38, 14, 9, "S"); c.rect(1, 36, 64, 12, "r"); c.rect(44, 36, 21, 12, "S")
  c.ellipse(30, 20, 26, 9, "c"); c.ellipse(22, 18, 14, 5, "c"); c.ellipse(44, 22, 12, 4, "L"); c.ellipse(30, 24, 22, 3, "L")
  mouth(c, 33, 24, 47, 20)
  for (const [x, l] of [[25, 6], [28, 4], [31, 7], [35, 5], [38, 6], [41, 3]]) { c.vline(x, 26, l, "i"); c.px(x, 26 + l, "B") }
  c.ellipse(33, 46, 30, 2, "c"); c.grid(4, 41, "cc.\nLcc"); c.grid(55, 40, ".cc\nccL"); c.grid(10, 30, "q.\nqq")
})
sprite("mausoleum", { w: 56, h: 52, outline: "k" }, (c) => {
  c.rect(4, 20, 48, 30, "r"); c.rect(4, 20, 14, 30, "R"); c.rect(42, 20, 10, 30, "S")
  for (let y = 24; y < 50; y += 5) { c.hline(4, y, 48, "S"); for (let x = 8 + (y % 2) * 5; x < 52; x += 10) c.vline(x, y + 1, 4, "S") }
  c.poly([0, 21, 28, 6, 56, 21], "R"); c.poly([28, 6, 56, 21, 28, 21], "r"); c.hline(0, 21, 56, "S"); c.hline(2, 19, 52, "q"); c.line(0, 21, 28, 6, "q")
  c.ellipse(28, 15, 3, 3, "l"); c.ellipse(29, 14, 2, 2, "R")                 // moon rondel in the pediment
  for (const x of [10, 44]) { c.rect(x, 22, 4, 28, "q"); c.vline(x + 3, 22, 28, "R"); c.hline(x - 1, 22, 6, "c") }
  mouth(c, 28, 26, 50, 20)
  c.rect(2, 49, 52, 3, "S"); c.hline(2, 49, 52, "r"); c.grid(1, 44, "g.\nGg\nmG"); c.grid(48, 45, ".G\nGm")
})
sprite("training_dummy", { w: 22, h: 34, outline: "k" }, (c) => {
  c.vline(10, 8, 26, "D"); c.vline(11, 8, 26, "d"); c.hline(1, 14, 20, "D"); c.hline(1, 15, 20, "d")
  c.ellipse(10, 21, 6, 8, "W"); c.ellipse(9, 20, 4, 6, "s"); for (const y of [16, 22, 27]) c.hline(5, y, 11, "a")
  c.ellipse(10, 6, 5, 5, "W"); c.ellipse(9, 5, 3, 3, "s"); c.grid(7, 4, "k.k\n...\n.e."); c.ellipse(13, 21, 2, 2, "f"); c.px(13, 21, "c")
  c.grid(4, 30, "W.W.W.\n.WWWW.\nwwWWww"); c.grid(0, 31, "g.\nGg")
})
