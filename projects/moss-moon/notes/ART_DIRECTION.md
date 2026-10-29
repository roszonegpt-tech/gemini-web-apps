# Moss Moon — Art Direction & Art Pipeline

All game art beyond the baseline witch/cast atlases is **pixel art as code**: small `art/*.px.js`
files rendered by the open-source **claude-pxl** tool, packed by `tools/build-art.js` into
`assets/js/art-data.js` (`window.MM_ART`, data URIs, file:// safe) and drawn at runtime by
`src/systems/art.js` (`MM.art`). 262 sprites in 8 sheets, ~81 KB of JS. All of them use one 40-color palette.

## Look

- **Cozy moonlit witch farm.** The palette is soft and slightly desaturated: mossy greens, teal shadows, warm lantern
  gold, lavender moonlight, cream. The albedo is tuned to sit next to the baseline's daytime ground and witch, so the
  sprites read in daylight. Night is meant to come from the lighting pass (phase 2 `MM.lighting`), which
  tints the whole scene. Do not paint night into the sprites.
- **Light comes from the top-left.** Lit faces step toward cream/yellow-green. Shaded faces step toward teal (`j`/`t`),
  never toward black. On iso boxes and buildings, the left (SW) face is lit and the right (SE) face is shaded.
- **Outlines.** Props, plants, characters and icons get a 1px **dark-teal ink outline `k` #263a37** (pxl `outline: "k"`).
  Pure black is never used. Ground tiles, fringes, skirts and FX have no outline.
- **No filler noise.** Every mark has a cause: grass tufts, pebbles, furrows along the iso grain, stone joints,
  wind drifts, leaf litter. Speckle is only used for granular materials such as dirt.
- **Scale.** The internal canvas is 512×320. Iso tiles are 32×16. Characters are 48×56 (foot at 24,49; the witch is
  about 30 px tall). A cottage door is about 19 px tall. Trees are about 42×56, like the baseline trees. Bosses are 66–82 px wide and 70–90 px tall.

## Master palette (40 colors) — `art/_palette.px.js` (mirrored in `art/meta.js`)

| key | hex | use | key | hex | use |
|---|---|---|---|---|---|
| k | #263a37 | ink outline | j | #2f4b47 | deepest cool shadow |
| t | #46695f | teal shadow | T | #6a907f | teal mid / willow / shingles |
| G | #4b7052 | forest dark green | g | #688d65 | green |
| h | #87ad7b | green light | H | #a6c593 | grove grass |
| y | #d2e3ad | leaf highlight | d | #4a3a31 | dark bark / soil groove |
| D | #6e5642 | wood | w | #8f7a5a | wood light / dry soil |
| W | #b89d72 | straw / planks | s | #c8aa86 | dirt path |
| S | #4e5660 | dark stone / iron | r | #737d7e | stone |
| R | #9ea79f | stone light | q | #d5d6bd | pale stone / shaded plaster |
| c | #f7f4e9 | cream / snow / lit plaster | C | #e2dcc2 | paper / bone |
| a | #9a7444 | brass | o | #cfaa71 | lantern gold |
| O | #eac979 | light gold / lit window | Y | #fff3c4 | glow core |
| m | #4f4566 | violet shadow / blight bark | v | #8a78a8 | violet |
| l | #c6aedb | lavender moonlight | L | #ebe1f7 | pale moonlight |
| b | #36636f | deep water | B | #5f9ca3 | water |
| i | #a5d6d8 | ice / ripple | e | #8a4a40 | brick / roof tile |
| E | #d27a55 | ember | p | #e8b8a8 | blossom |
| f | #c95d6a | berry / heart red | x | #2e2638 | blight void |
| X | #7b4f7d | blight magenta | z | #8ff0d0 | spirit / glowcap mint |
| u | #59573a | swamp mud | U | #8b8a58 | swamp olive |

Ramps (dark → light, used by pxl `shade()`/`light()`): `kjGghHy kjtT kdDwWs jSrRqc daoOY xmvlL jbBi deEp efp xXl kuUW qCc Tz`.
Shadows step into teal, so `shade(g)` goes to G and then to j.
`tools/build-art.js` audits every sheet. It warns about any color outside the palette and about going over 40 colors.
(Do not use pxl `lighting()` or color-mode `glow()` in exported art. They leave the palette.)

## Sheets, names, sizes, anchors

The source of truth is `assets/images/manifest.json`. It has every sprite with x, y, w, h, ax, ay, frames, fps and loop. Sizes below
include the 1px outline. Anchor (`ax, ay`) is the pixel that lands on the (x, y) you pass to `MM.art.draw`.

| sheet | anchor | contents |
|---|---|---|
| **tiles** | diamond centre (16,8) | `<surface>_0..3` for `grass_grove`, `path_dirt`, `soil_dry`, `soil_wet`, `grass_wild` (neglected farm), `water`, `forest_moss` (Blighted Forest), `swamp_mud`, `swamp_bog`, `snow`, `ice`, `crypt_flag` (Old Crypt), `cobble` (village); `water_anim` (4f); fringes `edge_<grass\|wild\|moss\|shore\|snow>_<ne\|se\|sw\|nw>` (draw on top of the tile whose `<side>` touches that surface); side skirts `side_earth\|stone\|snow\|crypt` 32×26 (same anchor, draw *before* the border tile) |
| **nature** | bottom-centre (trunk base) | `tree_oak_0..2`, `tree_blighted`, `tree_blighted_small`, `tree_willow`, `tree_pine_snow`, `tree_crypt`; `bush_0/1`, `bush_berry`, `bush_blight`, `bush_swamp`, `bush_snow`; `rock_0..2`, `rock_moss`, `rock_snow`, `rock_crypt`; `mushroom_red`, `mushroom_brown`, `mushroom_glow`(4f), `mushroom_moon`(4f); `reeds_0`(4f), `reeds_1`, `grass_tall`(4f), `lilypad`, `flowers_moon`, `flowers_wild`, `stump`, `log`; `ice_crystal_0`, `ice_crystal_1`(4f), `snow_mound` |
| **props** | bottom-centre | `fence_x`/`fence_y` (+`_broken`; anchor = segment midpoint (10,19), put it on a tile-edge midpoint; `x` runs screen down-right, `y` down-left), `fence_post`, `signpost`, `barrel`, `crate`, `crate_stack`, `sack`, `lantern`(3f), `lamp_post`(3f), `brazier`(4f), `bench`, `tombstone_0..2`, `grave_mound`, `well`, `scarecrow`, `compost`, `cauldron`(4f), `alchemy_table`, `shop_stall`, `broom_stand`, `woodpile`, `pumpkin`, `bucket` |
| **buildings** | front ground corner of the footprint | `cottage_ruined`, `cottage_mended`, `cottage_lush` (4f: smoke + window flicker) 86×100; `house_village_0..2` (red-tile plaster / slate stone / thatch 2-storey); `moonwell_dark`, `moonwell_faint`, `moonwell_glow`(4f), `moonwell_restored`(8f shimmer) 54×50 (bottom-centre); `fountain_dry` |
| **crops** | bottom-centre (stem base) | `crop_<id>_<seed\|sprout\|growing\|ripe>` and `crop_<id>_sparkle` (4f, ripe + twinkle) for `wheat`, `ember_pepper`, `frost_berry`, `moonflower`, `glowcap` (new), `starmint` (new); `soil_watered` 32×16 overlay (anchor 16,8) |
| **bosses** | bottom-centre (feet / mound base) | `<id>_idle_<s\|e>` (4f loop) and `<id>_windup_<s\|e>` (3f, plays once and holds) for `bramble_warden` (Blighted Forest), `mire_hag` (Whispering Swamp, "Mire Heart"), `frost_wyrm` (Frostpeak, "Frost Wyrm Husk"), `well_spirit` (final: corrupted Moonwell spirit, "The Hollow Moon"). For west, draw east with `flip:true`. North is not drawn yet. |
| **icons** | top-left | 16×16: `icon_<wheat\|ember_pepper\|frost_berry\|moonflower\|glowcap\|starmint>`, `icon_seeds`, `icon_seeds_<crop>`, `icon_potion` + `icon_potion_<health\|mana\|growth\|moon\|frost\|ember>`, `icon_bomb`, `icon_gold`, `icon_lunar_fragment_1..3`, `icon_rune_<ward\|growth\|frost\|ember\|moon>`, gear `icon_<hat\|robe\|wand\|boots\|charm>` and empty slots `icon_slot_<same>`; spell badges `spell_<moonbolt\|ember_bloom\|thornbind\|frostbell\|starfall\|moonbeam>`; UI `ui_corner` (flip for the other corners), `ui_divider`, `ui_edge_h`/`ui_edge_v` (repeat), `ui_bullet`; motes `mote_moon`, `mote_firefly`, `mote_well` (3f each) |
| **fx** | centre (impact point) | `fx_moonbolt_hit`, `fx_ember_bloom`, `fx_thornbind` (ground), `fx_frostbell`, `fx_starfall` (ground), `fx_poof`, `fx_harvest`, `fx_heal`, `fx_blight_burst` (all play once); `fx_aura_moon` (loop) |

Suggested homestead restoration mapping (levels 0–4 in PHASE2_CONTRACT):
0 = `cottage_ruined` + `moonwell_dark` + `grass_wild` around it, 1 = `cottage_ruined` + `moonwell_faint`,
2 = `cottage_mended` + `moonwell_faint`, 3 = `cottage_mended` + `moonwell_glow`, 4 = `cottage_lush` + `moonwell_restored`.

## Runtime (`MM.art`, src/systems/art.js)

```js
MM.art.whenReady(cb)  /  await MM.art.whenReady()   // all sheets decoded (fires immediately if MM_ART missing)
MM.art.ready, MM.art.error, MM.art.count
MM.art.draw(ctx, name, x, y, {frame, t, scale, flip, alpha, ax, ay, shadow})  // -> true if drawn; no-op false if missing
MM.art.shadow(ctx, x, y, rx, ry)                    // crisp translucent ink-teal contact ellipse
MM.art.get(name) / has(name) / names(prefix?) / frameAt(name, tSeconds)
MM.art.tile('grass_grove', seed) -> 'grass_grove_2'   // stable variant pick
MM.art.drawTile(ctx, 'grass_grove', seed, x, y, opts)
```
`t` is in seconds and selects the frame from fps. Per-frame durations (`durs`) and `loop:false` (hold the last frame) are honored.
`flip:true` mirrors around the anchor. Positions are rounded to whole pixels, so keep `ctx.imageSmoothingEnabled = false`.
Load order: `assets/js/art-data.js`, then `src/systems/art.js` (index.html already does this).

**Contact shadows.** Ground-standing sprites in nature, props, crops and bosses carry `sh: [rx, ry]`. `{shadow:true}`
draws the ellipse under the anchor before the sprite. **Aliases for the baseline seams** (`art/meta.js` → `aliases`):
`prop_tree_0..2` → `tree_oak_0..2`, `prop_lamp` → `lamp_post`, `prop_bench` → `bench`, `prop_flowers` → `flowers_wild`,
`prop_rock` → `rock_moss`. The baseline `drawProp` seam picks these up automatically. They draw their shadow by default
(`autoShadow`), because the baseline skips its own ellipse when the art path is taken. Delete an alias to fall back to
the baseline drawing.

## How to add or change art

1. Edit or create `art/<sheet>.px.js`. Start it with `include("_palette.px.js")`. Each file becomes one sheet named after
   the file. Files starting with `_` are includes only. Names starting with `_` are pxl parts and are not exported.
   Use only palette keys. Use `outline: "k"` for props.
   Helpers in `_palette.px.js`: `DIA`, `diaRow`, `fillDia`, `isoUV`, `sprinkle` (decor that never crosses tile seams),
   `stones`, `hash`.
2. Iterate quickly in a scratch dir:
   `node /home/user/crsolver/claude-pxl/bin/pxl.js build art/props.px.js --only barrel --out /tmp/pv`, then look at
   `/tmp/pv/_preview/barrel.png`. Or use `pxl ascii art/props.px.js barrel` for exact pixels.
3. If the default anchor is wrong (anchors, one-shot anims), set it in `art/meta.js`.
4. Rebuild everything with `node tools/build-art.js`. Options: `--only tiles,props` rebuilds only those pxl files and repacks the rest from
   `assets/images/pxl/`. `--preview` keeps pxl previews and GIFs. `--pxl <dir>` (or env `PXL_HOME`) points to the tool.
   Outputs: `assets/images/pxl/<file>/` (pxl output), `assets/images/<sheet>.png`, `assets/images/manifest.json`,
   `assets/js/art-data.js`.
5. Check the result with `node tests/art-gallery.js [outDir] [scale] [views]`. It renders `tests/art-gallery.html` into
   `art-gallery-<sheet|patches|scene>.png`. `patches` tiles every ground type, so you can check seams. `scene` is a small
   diorama at game scale. Then run `node tests/art-api.js` (15 API contract checks).

## Credits

- Pixel art authored for Moss Moon as code (art/*.px.js), rendered with **claude-pxl** by crsolver,
  https://github.com/crsolver/claude-pxl, **MIT License** (Copyright (c) 2026 crsolver). The tool is not vendored in
  this repo. It is invoked from its own clone at build time. No example art from it was copied. Only its documented DSL is used.
- The baseline witch and cast atlases are unchanged from the original demo.
