# Handoff — art agent

## What exists
- `art/_palette.px.js` holds the master 40-color palette, the ramps and the iso helpers. `art/meta.js` holds anchors, one-shot anims, contact-shadow sizes and baseline aliases.
- 8 art files → 8 sheets, **269 names (262 sprites + 7 aliases)**, all drawn with the same palette (the build audits it: 40/40 colors, none stray):
  - `tiles.px.js`: 13 ground surfaces × 4 variants, `water_anim`, 20 edge fringes (grass, wild, moss, shore, snow × 4 sides) and 4 side skirts.
  - `nature.px.js`: 35. Trees per region (oak ×3, blighted ×2, willow, snowy pine, crypt), bushes, rocks, fungi (2 animated glowing), reeds, crystals, flora.
  - `props.px.js`: 28. Fences, signpost, barrel, crates, lantern, lamp post, brazier, bench, tombstones, well, scarecrow, compost, cauldron, alchemy table, shop stall, broom stand and more.
  - `buildings.px.js`: 11. Cottage ruined/mended/lush (animated), 3 village houses, Moonwell dark/faint/glow/restored (8-frame shimmer), a dry fountain.
  - `crops.px.js`: 6 crops (wheat, ember_pepper, frost_berry, moonflower, glowcap, starmint) × seed/sprout/growing/ripe + sparkle anim, plus `soil_watered`.
  - `bosses.px.js`: bramble_warden, mire_hag, frost_wyrm, well_spirit. Each has idle (4f) and windup (3f, once) for s and e facings; west = flip.
  - `icons.px.js`: 54. Crop, seed, potion, bomb, gold, 3 lunar fragments, 5 runes, gear + empty slots, 6 spell badges, UI ornaments, 3 motes (3f each).
  - `fx.px.js`: 10. Impacts for Moonbolt, Ember Bloom, Thornbind, Frostbell and Starfall, plus poof, harvest, heal, blight burst and a moon aura.
- `tools/build-art.js` runs claude-pxl on every `art/*.px.js`, packs the sheets and writes `assets/images/<sheet>.png`, `assets/images/manifest.json`
  and `assets/js/art-data.js` (`window.MM_ART`, about 83 KB, data URIs). Raw pxl output stays in `assets/images/pxl/<file>/`.
- `src/systems/art.js` (`MM.art`) has `ready`, `whenReady(cb|promise)`, `draw(ctx,name,x,y,{frame,t,scale,flip,alpha,ax,ay,shadow})`,
  `get`, `has`, `names(prefix)`, `frameAt`, `tile(base, seed)`, `drawTile`, `shadow`. A missing atlas or sprite is a silent no-op. It emits `art:ready` on `MM.bus` if one exists.
- Docs: `notes/ART_DIRECTION.md` covers the full name list, sizes, anchors, palette, how to add art and how to rebuild.

## How it was tested (all run)
- `node tools/build-art.js`: every pxl file builds with no errors, and the palette audit reports 40 colors with no strays.
- `node tests/art-api.js` passes 15/15 contract checks: ready, whenReady after ready, names/prefix, has, anim meta, stable tile
  variants that use all 4, missing tile, frameAt loop, one-shot hold, missing-sprite no-op, anchor pixel lands exactly on (x,y),
  flip+alpha, draw with `t`.
- `node tests/art-gallery.js [outDir] [scale]` renders `tests/art-gallery.html` into one PNG per sheet, plus `patches`
  (tessellated tile seams, edge and skirt demo) and `scene` (a diorama at game scale).
- An in-game check: I injected the atlas into `index.html` and drew sprites next to the baseline witch. With the aliases, the baseline seam shows
  the new trees, lamps, bench and flowers with contact shadows. `node tests/smoke.js index.html` passed with no errors after the aliases.

## Visual review notes (from the gallery screenshots)
- **Tiles:** the patches tessellate with no seams. Soil furrows follow the iso grain and continue from plot to plot. Cobble is a
  regular 3×3 stone grid. Skirts line up under border tiles. Grove grass and path are close to the baseline's tones.
- **Buildings:** they read clearly at scale (door ≈ witch height × 0.6). Cottage states are easy to tell apart: holes, boards and moss when ruined; clean
  teal shingles when mended; lit windows, flower boxes, ivy and smoke when lush.
- **Moonwell:** the 4 states step up clearly (cracked and dry → violet → teal glow → bright shimmer with motes).
- **Fixed during review:** the pine was hollow (now has a snow blanket per tier). Soil was a checkerboard (now clean furrows). Skirt
  columns stuck out. The cauldron fire was hidden. The bench was broken. The wheat crop and icon read as blobs (now separate stalks).
  The bramble torso was a flat rectangle (now woven, with a waist). The spirit halo looked like a horn (now a broken ring). The thornbind scaffold lines were replaced by coils.
  Starfall and poof frames were clipped (canvas widened).
- **Still weakest:** frost_wyrm (thin spine, small front skull, odd mouth in the s-facing windup), the bramble_warden face is a bit
  comical, ui_corner is plain, and some flagstone variants show an obvious light/dark checker.

## Known gaps / ideas for later
- Bosses have no north or 8-direction facings and no hurt/death frames. There are no new small regional enemies (the baseline cast still covers them).
- No NPC sprites (Marrow/Pip/Wren in PHASE2_CONTRACT) and no witch replacement. The baseline atlas is still used for both.
- No terrain-corner transitions: edge fringes are per side only. Corners come from layering two fringes.
- Night look should come from `MM.lighting`. The sprites are day albedo on purpose. Glowing parts use `Y/O/z/L` if a
  lighting pass wants emissive masks.
- `assets/images/pxl/` (about 1.4 MB of per-sprite PNG/JSON) can be regenerated. The coordinator may want to gitignore it.
- Restoration mapping suggestion (levels 0–4) is in ART_DIRECTION.md.
