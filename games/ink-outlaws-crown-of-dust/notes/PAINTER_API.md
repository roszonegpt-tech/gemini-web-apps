# Painter API (how the game talks to the Chunk Lab painter)

`assets/js/ink.js` is lines 157–1726 of `docs/lab/Chunk_Lab_Ink_Outlaws_v0.5.0.html`, copied verbatim. **Only one block was added**,
at the end: `window.INK.kit = {...}`. It exposes internals the lab never exported, so structures and props can be built from the
same solids and ink. To upgrade the painter, copy the new lab's painter script over this file and re-append that block.

## Public API (unchanged lab API)
| Call | Use in the game |
|---|---|
| `INK.draw(ctx, look, act, f, dir, {x, y, scale})` | Every character frame (through `CD.Sprites`), menu portraits |
| `INK.anchors(look, act, f, dir)` | Per-frame `fire`, `hit`, `muzzle`, `muzzle2`, `handA`, `aim`, `back`; drives all combat timing |
| `INK.PRESETS`, `SCHEMA`, `WEAPONS`, `KIND`, `COUNT`, `FPS`, `DIRS`, `defaultLook` | Cast, look validation, animation timing |
| `INK.audit(look)` | Bone-length check (used while making new looks) |

Actions: `idle walk run jump attack shoot combo1 combo2 combo3 dance1 dance2 dance3`. Game mapping:
- melee hero: `combo1→2→3` chain, the third has an area slam; guns, thrusts and bows use `shoot`; beasts bite with `attack`
- dodge roll = `jump` frames; whirlwind and nova specials = `dance2`; summoning = `dance3`; victory = `dance1–3`
- hurt and death are done in the game layer: a paper-white flash (`source-atop` tint), knockback, a topple and an ink stain

## INK.kit (added)
`Scene, prism, ring8, ribbon, shadeStrip, drawPart, flash, inkSeg, tick, line, outline, fillp, area2, mat, mix, hex, rnd, toneOf,
FP, RX, RY, RZ, MM, MV, add, sub, mul, norm, lerp2, lerp3, compose, BEAST, BLOB, MOUNT, K, D2R, INKC, LIGHT`

`src/art/inkkit.js` wraps these: `solid()` (ring stacks to flat-shaded prisms), `box()`, `flat()` (doors, signs), `shape()` (2D
inked polygon), `ink()` (spot black), `stroke()`, `hatch()`. Each art piece is registered with `A.def(kind, [halfW, up, down], fn)`,
painted once per variant and palette, trimmed, and cached. Palettes: `outlaw`, `corsair`, `hollow`, `crown`.

## Sprite cache
`CD.Sprites` paints into a 128×116 scratch region (bigger than the lab's 80×80 cell, so the rex and riders never clip), trims to the
inked pixels and keeps the result in a byte-budgeted LRU (190 MB on desktop, 70 MB on touch devices). New frames are capped at about 9 ms of
painting per rendered frame; anything over that uses the previous frame. Missions pre-paint the hero and every unit's walk and idle
behind an "Inking the posse..." bar.
