// Villager NPCs in the witch's chunky 48x56 cell (foot point 24,49 — the same as the baseline atlas):
//   npc_<id>_idle_<s|e|n>  4 frames (breathing bob + a blink), loop
//   npc_<id>_talk_<s|e|n>  3 frames (mouth + hand gesture), loop while speaking
//   west = draw the _e sprite with flip:true. Aliases npc_<id> = npc_<id>_idle_e (authored facing east).
// ids: marrow (Elder Marrow: violet shawl+hood, white beard, teal robe, staff with a lantern),
//      pip (peddler: felt hat with a red feather, big pack with a bedroll, green tunic),
//      wren (herbalist: straw sun hat, auburn braid, plum dress + apron, satchel, herb bundle).
// cat_idle_s / cat_idle_e (4f) and cat_sit (4f): a small moon-grey familiar, anchor = paws.
// Drawn at 46x54 then outlined (+1 px each side) -> 48x56; the figure's centre is between columns 22|23 (pre-outline).
include("_palette.px.js")
include("_iso.px.js")

const M = (x) => 45 - x                       // mirror column (pre-outline)
function R(c, x, y, w, h, k) { if (w > 0 && h > 0) c.rect(x, y, w, h, k) }
function RM(c, x, y, w, h, k) { R(c, x, y, w, h, k); R(c, M(x + w - 1), y, w, h, k) }
function PX(c, x, y, k) { c.px(x, y, k) }
function PM(c, x, y, k) { c.px(x, y, k); c.px(M(x), y, k) }

// ---------------------------------------------------------------- shared body parts
// front face block (x 16..29), y0 = top row of the face. mouth: 0 closed, 1 open, 2 smile
function faceS(c, y0, o = {}) {
  R(c, 16, y0, 14, 8, "p"); PX(c, 16, y0 + 7, "_"); PX(c, 29, y0 + 7, "_")
  R(c, 28, y0 + 1, 2, 6, "n"); R(c, 17, y0 + 7, 11, 1, "n")              // shade: right cheek + jaw
  PX(c, 17, y0 + 1, "c")                                                     // lit forehead glint
  const ey = y0 + 3 + (o.eyeDy || 0)
  if (o.blink) { R(c, 19, ey + 1, 2, 1, "n"); R(c, 25, ey + 1, 2, 1, "n") }
  else { R(c, 19, ey, 1, 2, "k"); R(c, 26, ey, 1, 2, "k"); PX(c, 20, ey, "c") }
  if (!o.noCheek) { PX(c, 18, ey + 2, "f"); PX(c, 27, ey + 2, "E") }
  const my = y0 + 5 + (o.eyeDy || 0)
  if (o.mouth === 1) { R(c, 22, my, 2, 1, "k"); R(c, 22, my + 1, 2, 1, "e") }
  else if (o.mouth === 2) { PX(c, 21, my, "n"); R(c, 22, my + 1, 2, 1, "n"); PX(c, 24, my, "n") }
  else if (!o.noMouth) R(c, 22, my, 2, 1, "n")
}
// side face (facing east): face x 21..29, nose at 30; back of the head is hair (drawn by the caller)
function faceE(c, y0, o = {}) {
  R(c, 20, y0, 10, 8, "p"); PX(c, 30, y0 + 4, "p"); PX(c, 30, y0 + 5, "n"); PX(c, 29, y0 + 7, "_")
  R(c, 20, y0 + 7, 9, 1, "n"); R(c, 20, y0 + 1, 1, 6, "n")
  R(c, 21, y0 + 3, 2, 2, "n"); PX(c, 22, y0 + 3, "p")                      // ear
  const ey = y0 + 3 + (o.eyeDy || 0)
  if (o.blink) R(c, 26, ey + 1, 2, 1, "n"); else { R(c, 27, ey, 1, 2, "k"); PX(c, 26, ey, "c") }
  if (!o.noCheek) PX(c, 26, ey + 2, "f")
  const my = y0 + 5 + (o.eyeDy || 0)
  if (o.mouth === 1) { PX(c, 28, my, "k"); PX(c, 29, my, "k"); PX(c, 28, my + 1, "e") }
  else if (!o.noMouth) R(c, 27, my + (o.mouth === 2 ? 1 : 0), 2, 1, "n")
}
function hand(c, x, y) { R(c, x, y, 3, 2, "p"); PX(c, x + 2, y + 1, "n"); PX(c, x, y, "c") }
// arm hanging at a side (front/back views): sleeve [lit, mid, dark]
function armDown(c, x, y, len, sl, right) {
  R(c, x, y, 3, len, sl[1]); R(c, right ? x + 2 : x, y, 1, len, right ? sl[2] : sl[0]); R(c, x, y + len - 1, 3, 1, sl[2])
  hand(c, x, y + len)
}
// talk gesture: forearm raised toward the chest/out (gesture 0 = down, 1 = half, 2 = up/out)
function armTalk(c, x, y, sl, g, right) {
  if (g === 0) return armDown(c, x, y, 8, sl, right)
  const dx = right ? 1 : -1
  R(c, x, y, 3, 4, sl[1]); R(c, right ? x + 2 : x, y, 1, 4, right ? sl[2] : sl[0])
  if (g === 1) { R(c, x - dx * 2, y + 3, 4, 3, sl[1]); R(c, x - dx * 2, y + 5, 4, 1, sl[2]); hand(c, x - dx * 3 + (right ? 0 : 1), y + 3) }
  else { R(c, x + dx * 2, y + 1, 3, 3, sl[1]); PX(c, x + dx * 2 + 1, y + 3, sl[2]); hand(c, x + dx * 3, y - 1); PX(c, x + dx * 3 + 1, y - 2, "p") }
}
function legsS(c, top, pant, shoe, gap = 2) {
  RM(c, 18, top, 3, 46 - top, pant); RM(c, 20, top, 1, 46 - top, SHADE1[pant] || pant)
  RM(c, 17, 46, 5, 2, shoe); PM(c, 18, 46, LIGHT1[shoe] || shoe); void gap
}
function legsE(c, top, pant, shoe, step = 0) {
  R(c, 19, top, 3, 46 - top, SHADE1[pant] || pant); R(c, 23 + step, top, 3, 46 - top, pant)
  R(c, 19, 46, 5, 2, SHADE1[shoe] || shoe); R(c, 23 + step, 46, 6, 2, shoe); PX(c, 27 + step, 46, LIGHT1[shoe] || shoe)
}

// ---------------------------------------------------------------- ELDER MARROW
const MR = { robe: ["B", "b", "j"], shawl: ["l", "v", "m"], beard: ["c", "q", "R"] }
function marrow(c, F, b, blink, mouth, gest) {
  const hy = 21 + b                                              // face top
  const staff = (x, top) => {
    R(c, x, top, 2, 47 - top, "D"); R(c, x, top, 1, 47 - top, "w"); PX(c, x, 47, "d")
    for (const y of [top + 9, top + 18]) PX(c, x + 1, y, "d")      // knots
    // crook + hanging lantern
    c.grid(x - 1, top - 4, ".DD.\nD..D\n...D\n...D"); R(c, x + 3, top, 1, 2, "S")
    R(c, x + 1, top + 2, 5, 6, "S"); R(c, x + 2, top + 3, 3, 4, "O"); PX(c, x + 3, top + 4, "Y"); PX(c, x + 3, top + 5, "Y"); R(c, x + 2, top + 1, 3, 1, "r"); R(c, x + 2, top + 8, 3, 1, "S")
  }
  if (F === "s") {
    staff(34, 9 + Math.min(b, 0))
    // robe to the ground (feet just peeking)
    for (let y = 30 + b; y <= 46; y++) { const t = (y - 30) / 16, x0 = Math.round(15 - t * 2), x1 = M(x0); R(c, x0, y, x1 - x0 + 1, 1, "b"); PX(c, x0, y, "B"); PX(c, x0 + 1, y, "B"); R(c, x1 - 1, y, 2, 1, "j") }
    for (const x of [19, 26]) R(c, x, 39, 1, 7, "j")                // folds
    R(c, 22, 31 + b, 2, 15 - b, "j"); PX(c, 21, 40, "B")
    RM(c, 17, 47, 4, 1, "d")                                        // shoe tips
    R(c, 14, 38 + b, 18, 1, "a"); R(c, 21, 38 + b, 3, 2, "o"); PX(c, 22, 40 + b, "a"); PX(c, 21, 41 + b, "a")   // rope belt + knot
    // arms: left hangs in the sleeve, right holds the staff (or gestures while talking)
    if (mouth !== null && gest) armTalk(c, 12, 31 + b, MR.robe, gest, false); else armDown(c, 12, 31 + b, 8, MR.robe, false)
    R(c, 30, 31 + b, 3, 5, "b"); R(c, 32, 31 + b, 1, 5, "j"); hand(c, 32, 35 + b)
    // shawl over the shoulders, pointed at the front
    for (let y = 28 + b; y <= 35 + b; y++) { const k = y - 28 - b, x0 = 13 + Math.max(0, k - 4), x1 = M(x0); if (x1 >= x0) { R(c, x0, y, x1 - x0 + 1, 1, "v"); PX(c, x0, y, "l"); R(c, x1 - 1, y, 2, 1, "m") } }
    R(c, 20, 34 + b, 6, 3, "v"); R(c, 21, 37 + b, 4, 1, "m"); PX(c, 22, 33 + b, "O")          // point + moon clasp
    // head: face, hood, brows, beard
    faceS(c, hy, { blink, mouth: 0, noMouth: true, noCheek: true, eyeDy: 1 })
    R(c, 18, hy + 3, 3, 1, "c"); R(c, 25, hy + 3, 3, 1, "c")          // bushy brows
    PX(c, 22, hy + 5, "n"); PX(c, 23, hy + 5, "n")                    // nose
    for (let y = hy + 6; y <= hy + 16; y++) { const k = y - hy - 6, x0 = 17 + Math.round(k * 0.45), x1 = M(x0); R(c, x0, y, x1 - x0 + 1, 1, "q"); PX(c, x0, y, "c"); PX(c, x1, y, "R") }
    R(c, 19, hy + 6, 8, 1, "c"); PX(c, 22, hy + 7, mouth === 1 ? "k" : "R"); PX(c, 23, hy + 7, mouth === 1 ? "k" : "R")   // moustache + mouth
    for (const y of [hy + 10, hy + 13]) PX(c, 23, y, "R")
    // hood
    R(c, 15, hy - 5, 16, 5, "v"); R(c, 14, hy - 2, 2, 10, "v"); R(c, 30, hy - 2, 2, 10, "m"); R(c, 17, hy - 6, 12, 1, "v")
    R(c, 16, hy - 5, 6, 1, "l"); PX(c, 15, hy - 3, "l"); R(c, 14, hy - 1, 1, 7, "l"); R(c, 16, hy - 1, 14, 1, "m"); R(c, 29, hy - 4, 2, 3, "m")
  } else if (F === "e") {
    staff(30, 9 + Math.min(b, 0))
    for (let y = 30 + b; y <= 46; y++) { const t = (y - 30) / 16, x0 = Math.round(17 - t * 2), x1 = Math.round(28 + t * 2); R(c, x0, y, x1 - x0 + 1, 1, "b"); PX(c, x0, y, "j"); PX(c, x1, y, "B") }
    R(c, 24, 38, 1, 8, "j"); R(c, 20, 40, 1, 6, "B"); R(c, 26, 47, 4, 1, "d")
    R(c, 17, 38 + b, 12, 1, "a"); R(c, 27, 38 + b, 2, 3, "o")
    // shawl seen from the side (drapes back over the shoulder)
    for (let y = 28 + b; y <= 36 + b; y++) { const k = y - 28 - b, x0 = 16 + Math.floor(k / 3), x1 = 28 - Math.max(0, k - 3); if (x1 >= x0) { R(c, x0, y, x1 - x0 + 1, 1, "v"); PX(c, x0, y, "m"); PX(c, x1, y, "l") } }
    // arm reaching forward to the staff (talk: lifts a hand)
    if (gest === 2) { R(c, 22, 31 + b, 3, 4, "b"); R(c, 25, 29 + b, 3, 3, "b"); hand(c, 27, 27 + b) } else { R(c, 22, 31 + b, 3, 4, "b"); R(c, 24, 34 + b, 5, 3, "b"); PX(c, 22, 31 + b, "B"); hand(c, 29, 34 + b) }
    faceE(c, hy, { blink, noMouth: true, noCheek: true, eyeDy: 1 })
    R(c, 25, hy + 3, 3, 1, "c")
    for (let y = hy + 6; y <= hy + 15; y++) { const k = y - hy - 6, x0 = 23 + Math.round(k * 0.3), x1 = 30 - Math.round(k * 0.4); if (x1 >= x0) { R(c, x0, y, x1 - x0 + 1, 1, "q"); PX(c, x1, y, "c"); PX(c, x0, y, "R") } }
    R(c, 26, hy + 6, 5, 1, "c"); PX(c, 29, hy + 7, mouth === 1 ? "k" : "R")
    R(c, 15, hy - 5, 14, 5, "v"); R(c, 14, hy - 2, 7, 11, "v"); R(c, 17, hy - 6, 10, 1, "v"); R(c, 16, hy - 5, 8, 1, "l"); R(c, 14, hy - 1, 1, 8, "m"); R(c, 19, hy - 1, 2, 9, "m"); R(c, 26, hy - 1, 3, 1, "m"); PX(c, 28, hy - 3, "l")
  } else {   // north: back view, the hood and shawl cover the back; staff on the left side now
    staff(9, 9 + Math.min(b, 0))
    for (let y = 30 + b; y <= 46; y++) { const t = (y - 30) / 16, x0 = Math.round(15 - t * 2), x1 = M(x0); R(c, x0, y, x1 - x0 + 1, 1, "b"); PX(c, x0, y, "B"); R(c, x1 - 1, y, 2, 1, "j") }
    for (const x of [18, 22, 27]) R(c, x, 37, 1, 9, "j")
    R(c, 14, 38 + b, 18, 1, "a")
    R(c, 12, 31 + b, 3, 5, "b"); hand(c, 11, 35 + b); armDown(c, 30, 31 + b, 8, MR.robe, true)
    for (let y = 27 + b; y <= 40 + b; y++) { const k = y - 27 - b, x0 = 13 + Math.max(0, k - 8), x1 = M(x0); if (x1 >= x0) { R(c, x0, y, x1 - x0 + 1, 1, "v"); PX(c, x0, y, "l"); R(c, x1 - 1, y, 2, 1, "m") } }
    for (const y of [32, 36]) R(c, 18, y + b, 10, 1, "m")
    R(c, 15, hy - 5, 16, 13, "v"); R(c, 17, hy - 6, 12, 1, "v"); R(c, 16, hy - 5, 7, 1, "l"); R(c, 15, hy - 4, 1, 11, "l"); R(c, 29, hy - 4, 2, 12, "m"); R(c, 22, hy - 3, 1, 10, "m")
    R(c, 17, hy + 7, 12, 2, "q"); PX(c, 17, hy + 7, "c")               // beard ends showing at the sides
  }
}

// ---------------------------------------------------------------- PIP the peddler
const PP = { tunic: ["h", "g", "G"] }
function pip(c, F, b, blink, mouth, gest) {
  const hy = 21 + b
  const pack = (x0, x1, top) => {           // big pack behind the shoulders + bedroll on top
    R(c, x0, top + 4, x1 - x0 + 1, 15, "w"); R(c, x0, top + 4, 2, 15, "W"); R(c, x1 - 1, top + 4, 2, 15, "D"); R(c, x0, top + 18, x1 - x0 + 1, 1, "d")
    R(c, x0 - 2, top, x1 - x0 + 5, 4, "v"); R(c, x0 - 2, top, x1 - x0 + 5, 1, "l"); R(c, x0 - 2, top + 3, x1 - x0 + 5, 1, "m"); PX(c, x0 - 2, top + 1, "L")
    for (const x of [x0 + 3, x1 - 3]) R(c, x, top, 1, 4, "a")         // bedroll straps
  }
  const hat = (x0, x1, y, side) => {
    R(c, x0, y + 6, x1 - x0 + 1, 2, "D"); R(c, x0, y + 6, x1 - x0 + 1, 1, "w"); PX(c, x0, y + 7, "d"); PX(c, x1, y + 7, "d")   // brim
    const cx0 = x0 + 4, cx1 = x1 - 4
    R(c, cx0, y + 1, cx1 - cx0 + 1, 5, "w"); R(c, cx0 + 1, y, cx1 - cx0 - 1, 1, "w"); R(c, cx0, y + 1, 2, 4, "W"); R(c, cx1 - 1, y + 1, 2, 5, "D"); R(c, cx0, y + 5, cx1 - cx0 + 1, 1, "e")   // crown + band
    R(c, cx0 + Math.floor((cx1 - cx0) / 2), y, 1, 2, "D")                                                                  // pinch
    const fx = side === "l" ? cx0 - 1 : cx1 - 1
    c.grid(fx, y - 6, side === "l" ? "f..\nff.\n.fp\n.ff\n..f\n..f\n..f" : "..f\n.ff\npf.\nff.\nf..\nf..\nf..")   // feather
  }
  if (F === "s") {
    pack(12, 33, 17 + b)
    legsS(c, 40, "D", "d")
    for (let y = 29 + b; y <= 40; y++) { const x0 = y > 37 ? 15 : 16, x1 = M(x0); R(c, x0, y, x1 - x0 + 1, 1, "g"); PX(c, x0, y, "h"); PX(c, x1, y, "G") }
    R(c, 22, 30 + b, 2, 4, "C"); PX(c, 22, 30 + b, "c")                // shirt opening
    R(c, 15, 37, 16, 1, "d"); R(c, 21, 37, 3, 1, "o")                   // belt + buckle
    for (const x of [18, 27]) R(c, x, 29 + b, 1, 8 - b, "D")             // pack straps
    R(c, 26, 38, 4, 3, "a"); R(c, 26, 38, 4, 1, "o")                     // coin pouch
    armDown(c, 13, 30 + b, 8, PP.tunic, false)
    if (gest) armTalk(c, 30, 30 + b, PP.tunic, gest, true); else armDown(c, 30, 30 + b, 8, PP.tunic, true)
    faceS(c, hy, { blink, mouth })
    PX(c, 18, hy + 6, "n"); PX(c, 20, hy + 6, "n"); PX(c, 25, hy + 6, "n")           // freckles
    R(c, 15, hy - 1, 3, 6, "E"); R(c, 28, hy - 1, 3, 6, "e"); R(c, 16, hy, 13, 2, "E"); PX(c, 15, hy + 5, "e"); PX(c, 30, hy + 5, "e"); R(c, 20, hy + 1, 3, 1, "e")   // ginger hair
    hat(11, 34, hy - 9, "r")
  } else if (F === "e") {
    pack(10, 18, 17 + b)
    legsE(c, 40, "D", "d", 0)
    for (let y = 29 + b; y <= 40; y++) { const x0 = 18, x1 = y > 37 ? 28 : 27; R(c, x0, y, x1 - x0 + 1, 1, "g"); PX(c, x0, y, "G"); PX(c, x1, y, "h") }
    R(c, 18, 37, 11, 1, "d"); R(c, 26, 37, 2, 1, "o"); R(c, 19, 29 + b, 2, 9 - b, "D")              // belt, pack strap
    if (gest) { R(c, 22, 30 + b, 3, 4, "g"); R(c, 24, 32 + b - (gest === 2 ? 3 : 0), 5, 3, "g"); hand(c, 29, 31 + b - (gest === 2 ? 4 : 0)) } else armDown(c, 22, 30 + b, 8, PP.tunic, true)
    faceE(c, hy, { blink, mouth }); PX(c, 25, hy + 6, "n"); PX(c, 27, hy + 6, "n")
    R(c, 17, hy - 1, 6, 8, "E"); R(c, 17, hy - 1, 13, 2, "E"); R(c, 17, hy + 4, 3, 4, "e"); PX(c, 23, hy + 1, "e")
    hat(12, 33, hy - 9, "l")
  } else {
    legsS(c, 40, "D", "d")
    for (let y = 29 + b; y <= 40; y++) { const x0 = y > 37 ? 15 : 16, x1 = M(x0); R(c, x0, y, x1 - x0 + 1, 1, "g"); PX(c, x0, y, "h"); PX(c, x1, y, "G") }
    armDown(c, 13, 30 + b, 8, PP.tunic, false); armDown(c, 30, 30 + b, 8, PP.tunic, true)
    R(c, 15, hy - 1, 16, 8, "E"); R(c, 15, hy + 5, 16, 2, "e"); PX(c, 22, hy + 4, "e")
    // the pack fills the back: flap, buckles, a hanging pot and a lantern
    R(c, 14, 25 + b, 18, 16, "w"); R(c, 14, 25 + b, 2, 16, "W"); R(c, 30, 25 + b, 2, 16, "D"); R(c, 14, 40 + b, 18, 1, "d")
    R(c, 15, 26 + b, 16, 6, "W"); R(c, 15, 31 + b, 16, 1, "D"); for (const x of [18, 27]) { R(c, x, 31 + b, 2, 2, "a"); PX(c, x, 31 + b, "o") }
    R(c, 20, 34 + b, 6, 4, "D"); R(c, 20, 34 + b, 6, 1, "W")            // side pocket
    c.grid(10, 30 + b, ".SS.\nSrRS\nSrrS\n.SS."); c.grid(32, 32 + b, "r.\nSO\nSY\nS.")   // pot + lantern
    R(c, 11, 21 + b, 24, 4, "v"); R(c, 11, 21 + b, 24, 1, "l"); R(c, 11, 24 + b, 24, 1, "m"); for (const x of [15, 30]) R(c, x, 21 + b, 1, 4, "a")
    hat(11, 34, hy - 9, "r")
  }
}

// ---------------------------------------------------------------- WREN the herbalist
const WR = { dress: ["v", "X", "m"] }
function wren(c, F, b, blink, mouth, gest) {
  const hy = 21 + b
  const hat = (x0, x1, y) => {
    R(c, x0, y + 5, x1 - x0 + 1, 2, "o"); R(c, x0 + 1, y + 5, x1 - x0 - 1, 1, "O"); R(c, x0 + 2, y + 7, x1 - x0 - 3, 1, "a")   // straw brim
    for (let x = x0 + 1; x < x1; x += 3) PX(c, x, y + 6, "a")
    R(c, x0 + 5, y, x1 - x0 - 9, 5, "O"); R(c, x0 + 6, y - 1, x1 - x0 - 11, 1, "O"); R(c, x0 + 5, y + 1, 2, 3, "Y"); R(c, x1 - 6, y, 2, 5, "o"); R(c, x0 + 5, y + 4, x1 - x0 - 9, 1, "X")   // crown + ribbon
  }
  const bundle = (x, y) => c.grid(x, y, ".l.L\nl.lL\nhg.l\n.hgh\n.gh.\n.hg.\n.ee.\n.gG.\n.g..")   // lavender + sage, tied with red twine
  if (F === "s") {
    // braid hanging behind the right shoulder
    R(c, 29, hy + 4, 3, 12, "e"); for (let y = hy + 5; y < hy + 16; y += 2) PX(c, 30, y, "d"); PX(c, 30, hy + 16, "X")
    // skirt + bodice
    for (let y = 33 + b; y <= 45; y++) { const t = (y - 33) / 12, x0 = Math.round(16 - t * 3), x1 = M(x0); R(c, x0, y, x1 - x0 + 1, 1, "X"); PX(c, x0, y, "v"); R(c, x1 - 1, y, 2, 1, "m") }
    R(c, 13, 45, 20, 1, "m"); RM(c, 18, 46, 4, 2, "d"); PM(c, 18, 46, "D")
    RM(c, 16, 29 + b, 7, 5, "X"); PX(c, 16, 29 + b, "v"); R(c, 28, 29 + b, 2, 5, "m")
    R(c, 20, 29 + b, 6, 2, "C")                                                       // blouse collar
    // apron with a pocket + sprig
    for (let y = 33 + b; y <= 43; y++) { const x0 = 18 - Math.floor((y - 33) / 6), x1 = M(x0); R(c, x0, y, x1 - x0 + 1, 1, "C"); PX(c, x0, y, "c"); PX(c, x1, y, "q") }
    R(c, 17, 33 + b, 12, 1, "q"); R(c, 24, 38, 4, 3, "q"); R(c, 24, 38, 4, 1, "C"); PX(c, 25, 37, "h"); PX(c, 26, 36, "g")
    // satchel strap (right shoulder -> left hip) and bag
    for (let k = 0; k < 11; k++) PX(c, 27 - k, 29 + b + k, "a")
    R(c, 10, 37 + b, 7, 6, "a"); R(c, 10, 37 + b, 7, 3, "o"); R(c, 10, 37 + b, 7, 1, "O"); R(c, 16, 37 + b, 1, 6, "d"); PX(c, 13, 39 + b, "S"); R(c, 10, 42 + b, 7, 1, "d")
    armDown(c, 13, 30 + b, 7, WR.dress, false)
    if (gest) armTalk(c, 30, 30 + b, WR.dress, gest, true); else { armDown(c, 30, 30 + b, 7, WR.dress, true); bundle(31, 29 + b) }
    faceS(c, hy, { blink, mouth })
    // hair framing the face
    R(c, 15, hy - 1, 2, 8, "e"); R(c, 29, hy - 1, 2, 6, "d"); R(c, 16, hy, 14, 2, "e"); R(c, 17, hy + 1, 4, 1, "e"); R(c, 25, hy + 1, 4, 1, "d"); PX(c, 15, hy - 1, "E"); PX(c, 17, hy, "E")
    hat(10, 35, hy - 8)
    c.grid(28, hy - 6, "p.l\nppl\n.g.")                                              // hat flowers
  } else if (F === "e") {
    R(c, 15, hy + 4, 3, 13, "e"); for (let y = hy + 5; y < hy + 17; y += 2) PX(c, 16, y, "d"); PX(c, 16, hy + 17, "X")   // braid down the back
    for (let y = 33 + b; y <= 45; y++) { const t = (y - 33) / 12, x0 = Math.round(17 - t * 2), x1 = Math.round(28 + t * 2); R(c, x0, y, x1 - x0 + 1, 1, "X"); PX(c, x0, y, "m"); PX(c, x1, y, "v") }
    R(c, 18, 46, 4, 2, "d"); R(c, 24, 46, 5, 2, "d"); PX(c, 27, 46, "D")
    R(c, 18, 29 + b, 10, 5, "X"); PX(c, 27, 29 + b, "v"); R(c, 24, 29 + b, 4, 2, "C")
    for (let y = 33 + b; y <= 43; y++) R(c, 26, y, 3 + Math.floor((y - 33) / 5), 1, "C")
    R(c, 13, 36 + b, 5, 6, "a"); R(c, 13, 36 + b, 5, 2, "o"); R(c, 13, 41 + b, 5, 1, "d"); for (let k = 0; k < 8; k++) PX(c, 25 - k, 29 + b + Math.floor(k * 0.9), "a")
    if (gest) { R(c, 21, 30 + b, 3, 4, "X"); R(c, 23, 32 + b - (gest === 2 ? 3 : 0), 5, 3, "X"); hand(c, 28, 31 + b - (gest === 2 ? 4 : 0)) }
    else { R(c, 21, 30 + b, 3, 6, "X"); R(c, 21, 30 + b, 1, 6, "m"); hand(c, 21, 36 + b); bundle(21, 34 + b) }
    faceE(c, hy, { blink, mouth })
    R(c, 16, hy - 1, 6, 9, "e"); R(c, 16, hy - 1, 14, 2, "e"); R(c, 16, hy + 5, 3, 3, "d"); PX(c, 23, hy + 1, "d"); PX(c, 17, hy - 1, "E")
    hat(10, 35, hy - 8); c.grid(12, hy - 5, "l.p\nlpp\n.g.")
  } else {
    for (let y = 33 + b; y <= 45; y++) { const t = (y - 33) / 12, x0 = Math.round(16 - t * 3), x1 = M(x0); R(c, x0, y, x1 - x0 + 1, 1, "X"); PX(c, x0, y, "v"); R(c, x1 - 1, y, 2, 1, "m") }
    R(c, 13, 45, 20, 1, "m"); RM(c, 18, 46, 4, 2, "d")
    RM(c, 16, 29 + b, 7, 5, "X"); PX(c, 16, 29 + b, "v"); R(c, 28, 29 + b, 2, 5, "m")
    R(c, 18, 33 + b, 10, 1, "C"); R(c, 22, 34 + b, 2, 3, "C"); PX(c, 21, 36 + b, "C"); PX(c, 24, 36 + b, "C")   // apron bow
    for (let k = 0; k < 11; k++) PX(c, 18 + k, 29 + b + k, "a"); R(c, 29, 38 + b, 6, 5, "a"); R(c, 29, 38 + b, 6, 2, "o")
    armDown(c, 13, 30 + b, 7, WR.dress, false); armDown(c, 30, 30 + b, 7, WR.dress, true)
    R(c, 15, hy - 1, 16, 9, "e"); R(c, 15, hy - 1, 3, 9, "E"); R(c, 28, hy, 3, 8, "d")
    R(c, 21, hy + 6, 4, 13, "e"); for (let y = hy + 7; y < hy + 18; y += 2) { PX(c, 22, y, "d"); PX(c, 23, y + 1, "d") } R(c, 22, hy + 19, 2, 1, "X")   // braid
    hat(10, 35, hy - 8); c.grid(17, hy - 6, "l.p\nlpp\n.g.")
  }
}

// ---------------------------------------------------------------- build anims
const NPC = { marrow, pip, wren }
const BOB = [0, 0, 1, 1]
for (const [id, fn] of Object.entries(NPC)) for (const F of ["s", "e", "n"]) {
  anim(`npc_${id}_idle_${F}`, { w: 46, h: 54, frames: 4, fps: 4, outline: "k" }, (c) => fn(c, F, BOB[c.frame], c.frame === 3 && F !== "n", 0, 0))
  anim(`npc_${id}_talk_${F}`, { w: 46, h: 54, frames: 3, fps: 6, outline: "k" }, (c) => fn(c, F, c.frame === 1 ? 1 : 0, false, F === "n" ? 0 : [1, 0, 1][c.frame], [2, 1, 2][c.frame] * (c.frame === 1 ? 1 : 1)))
  for (const k of ["idle", "talk"]) meta(`npc_${id}_${k}_${F}`, { ax: 24, ay: 49, sh: [8, 3], facing: F })
}

// ---------------------------------------------------------------- cat familiar (moon-grey with a lavender collar)
function cat(c, F, f) {
  const tail = [[0, 0], [1, -1], [1, -2], [0, -1]][f]
  if (F === "s") {   // sitting, facing the viewer, tail curled to one side
    c.grid(2, 0, "m...m\nmv.vm\nvvvvv\nvOvOv\nvvlvv\n.vvv.")
    R(c, 2, 6, 5, 4, "v"); R(c, 1, 8, 7, 3, "v"); R(c, 2, 6, 1, 4, "l"); R(c, 6, 7, 1, 4, "m"); R(c, 3, 10, 1, 1, "l"); R(c, 5, 10, 1, 1, "l")
    PX(c, 3, 6, "f"); PX(c, 4, 6, "f"); PX(c, 5, 6, "f")
    c.grid(8 + tail[0], 7 + tail[1], "m\nvm\nvm")
    if (f === 2) { PX(c, 3, 3, "k"); PX(c, 5, 3, "k") }
  } else {           // sitting in profile facing east
    c.grid(7, 0, "m..m.\nvv.vm\nvvvvv\nvvvOv\n.vvvl\n..vv.")
    R(c, 3, 5, 7, 6, "v"); R(c, 3, 5, 7, 1, "l"); R(c, 2, 8, 2, 3, "v"); R(c, 8, 8, 2, 3, "m"); PX(c, 9, 5, "f"); PX(c, 8, 5, "f")
    c.grid(0 + tail[0], 4 + tail[1], "m.\nvm\n.v")
    if (f === 2) PX(c, 10, 3, "k")
  }
}
for (const F of ["s", "e"]) { anim(`cat_idle_${F}`, { w: 12, h: 11, frames: 4, fps: 3, outline: "k" }, (c) => cat(c, F, c.frame)); meta(`cat_idle_${F}`, { ax: 6, ay: 12, sh: [5, 2], facing: F }) }
