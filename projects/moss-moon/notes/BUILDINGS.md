# Buildings & interiors — scale, data, behaviour (owner: INTERIORS)

Files: `src/config/buildings.js` (`MM.BUILDINGS` data + `MM.buildings` geometry/validation), `src/systems/interiors.js`
(`MM.interiors`, screen state `interior`, collision, handlers, save section), `src/systems/interior-render.js`
(`MM.interiorRender`), `tests/interior-test.js`. Exteriors are painted by WORLD (`src/systems/world-buildings.js`) from
`MM.buildings.paintSpec()` / the placement records, so outside and inside come from the same numbers.

## 1. One unit, derived from the player
Measured from the witch atlas (idle + walk, 8 directions): frame 48×56, foot (24,49), **visible height 40 px** (walk 41),
**visible width 25–27 px → 26**. Iso tile 32×16; along a wall 1 tile = **16 horizontal screen px** ("face px"); across the view
1 world unit = 32/√2 = **22.63 px**, so the witch's envelope is 26/22.63 = **1.149 world units** wide.

| quantity | rule | value |
|---|---|---|
| door clear height | ≥ 1.35 × 40 | **54 px** |
| door clear width (screen) | ≥ 1.2 × 26 px = 31.2 px → /16 px per tile = 1.95 tiles | |
| door clear width (world) | ≥ 1.2 × 1.149 = 1.379 tiles | |
| door width used | max of both, rounded up to ¼ tile | **2.0 tiles = 32 face px** |
| wall height (eave) | plinth 5 + door 54 + lintel 7 | **66 px** |
| jamb (wall beside a door) | | ≥ 0.4 tile |
| window | 14 × 16 px, sill 26 px (head 42 < eave) | |
| steps / porch | 3 px rise per step; porch 10 face px (0.625 tile), walkable | |
| wall thickness | | 0.25 tile; interior = footprint − 2×0.25 |
| cut-away front wall | | 12 px |
| door recess (walkable) / trigger depth / approach / outside spawn | along the door normal | 0.3 / 0.8 / 0.6 / 1.3 tiles |
| inside spawn / exit line | from the doorway inward / outward | 0.9 / 0.2 tiles |
| player collision radius | (baseline/WORLD) | 0.22 tile |
Both width checks, the height check, the spawn-outside-trigger rule (1.3 > 0.8 + 0.22) and the window head are asserted by
`validate()`.

Furniture table (`MM.BUILDINGS.furniture`, footprint tiles w×d in the native facing, height px): bed 1.25×2/24, chest 1×0.6/16,
hearth 1.75×0.75/62, bookcase 1.5×0.5/58, wardrobe 1.25×0.625/60, rug 2.5×1.75/0, table 1.5×1/20, chair .625²/26, stool .5²/12,
armchair .875²/30, counter 3×.875/24 (waist height for a 40 px witch), shelves 1.5×.5/48, drying rack 1.5×.4/44,
display case 1×.625/32, stove .75²/34, plant .5²/22; existing props reused: alchemy_table 1×1/28, cauldron .75²/22, barrel,
crate, crate_stack, sack, woodpile, broom_stand, bucket, bench. Wall decor (`wallDecor`): window, portrait, star_chart,
wall_shelf, herbs_hanging, lesson_board, wall_lantern (face px + z).

## 2. Conventions
World x runs right-down, y left-down (`project(x,y) = ((x−y)·16, (x+y)·8)`). A footprint is [x0,y0]–[x1,y1]; the **front
corner (x1,y1)** is the bottom vertex on screen and the sprite anchor (`placements[].x/y`). Face **L** = wall y=y1 (lower-left),
face **R** = wall x=x1 (lower-right); door/window `at` = face px from the front corner (same as the WORLD painter).
Furniture sprites: anchor = front vertex of the footprint; authored against the back wall y=0 (front on the lower-left face);
`rot:'y'` swaps w/d and draws the sprite mirrored for the x=0 wall.

## 3. Buildings (ids are stable)
| id | region | type | front corner | footprint | door | enterable |
|---|---|---|---|---|---|---|
| home | grove | cottage_home (look follows homestead level 0–4) | 8.0, 5.6 | 5.5×4.5 | L @36 → (5.75,5.6) | yes |
| old_mill | grove | mill | 19.0, 9.6 | 4.5×4 | L @28 | **locked** ("boarded up") |
| marrow_house | village | elder_house | 6.8, 6.4 | 5×4 | L @30 | yes |
| pip_shop | village | village_shop | 16.0, 5.6 | 5×4.5 | L @30 | yes |
| wren_house | village | herbalist_house | 6.0, 16.2 | 4.5×4.5 | R @30 | yes |
| old_shed | village | shed | 17.6, 15.4 | 3×3 | R @24 | **locked** ("barred shut") |
| practice_hut | tutorial | tutorial_hut (persist:false) | 11.3, 5.4 | 3.5×3 | L @26 | yes |
| moonwell | grove | structure (no door, campaign `moonwell` interaction) | 13.6, 6.2 | 1.7×1.7 | — | no |
Derived per building (`MM.buildings.get(id)`): `rect`, `blocks` (collision = visible structure with the door recess carved),
`door`, `trigger`, `approach`, `spawn`, `interact` (`enter:<id>`, prompt from name or `lockedPrompt`), `lockedReason`.
Locked buildings are painted shuttered/locked by WORLD and pressing E shows `lockedReason` (toast + `interior:locked`).

## 4. Interiors
`MM.BUILDINGS.interiors[key]` (data): floor kind, wall material, furniture `{id,type,x,y,rot,interact}`, wall decor, NPC,
lights, slots, initial chest contents. `MM.buildings.interior(id)` derives room size (footprint − walls), the doorway (same
face/offset as outside), the inside spawn and the exit rect.
- **cottage (home)**: bed → rest (¼ day + heal, via `MM.campaign.interact('rest')`, then a safe save), storage chest
  (persisted; starts with 1 healing draught + 3 wheat), alchemy table → crafting (`interact('cauldron')`), hearth (warm hands
  +15 HP once a day, light/bank the fire — persisted, display slot on the mantel), bookcase → grandmother's books, wardrobe
  mirror → cycle outfit/hair colour (baseline `chooseLook`), wall shelf display slot, rug, woodpile, windows, lantern.
- **Pip's shop**: counter → `interact('shop:pip')`, Pip → `interact('talk:pip')`, shelves, crates (lore), barrel, sack.
- **Wren's cottage**: cauldron → crafting, Wren → talk (requests live in her dialogue), drying racks + jar shelves (lore), worktable, plants, hanging herbs.
- **Elder Marrow's house**: Marrow → talk, grandmother's portrait (lore, sets flag `saw_portrait`), star chart, keeper's
  keepsakes display case, bookcase, stove, armchair, tea table.
- **Practice hut**: practice notes (lore), practice chest (potion + 2 wheat; state is temporary and resets when the tutorial starts).
Placed items: slots (`mantel`, `sill`) take one crop/potion/material from the bag and show its icon; persisted.

## 5. Runtime behaviour
- Enter: exterior interactable `enter:<id>` (WORLD builds it from the placement; interiors registers the handler) → E / tap.
  `MM.interiors.enter(id)` lands the broom, puts the player on the validated inside spawn, `MM.state.go('interior')`
  (CORE policy `sim:'player'`, `draw:'custom'`: no enemies/farm/clock/raids, exterior prompts gone). The room lives at a fixed
  origin inside the baseline movement box away from the garden plots; baseline controller/animation run unchanged.
- Collision: `moveActor` wrapper (outermost, so WORLD's exterior colliders never apply indoors) + the baseline `blocked` hook.
  Walls, solid furniture and NPCs block; rugs/mats/sacks don't; the doorway gap lets you walk out.
- Exit: walk through the doorway (exit rect) or E "Leave". The player lands on the outside spawn (outside the trigger, 1.3 tiles
  out). No loops: 0.6 s door cooldown, the exit only arms after the player has been outside the exit rect, spawns are outside
  both triggers. No duplicates: every visit rebuilds instances from defs + saved state.
- Pause/dialogue/cine: the visit stays alive and `interior` resumes (campaign returns from cines with `{resume:true}`).
- Indoors Space/B are claimed ("Spells stay holstered indoors" / "No broom-riding indoors!"); H (potion) works; click/tap moves
  or uses the clicked object when in reach. HUD prompt: `MM.world.currentPrompt()` answers with the interior prompt while inside.
- Save section `interiors`: `{chests, placed, visits, flags, hearth, inside}`. Saved while inside → on load the player stands on
  that building's outside spawn. Bus: `interior:enter|exit|locked|rest|chest|place|lore|abandon`.

## 6. Rendering
Floor and back walls are pixel-painted once per room (planks / boards / herb-strewn / flagstone; plaster+timber / stone / log /
plank) with contact shading; windows show sky/dusk/night glass and cast floor beams; front walls are cut to 12 px with jamb
posts at the doorway, a stone threshold, outside-light spill and a pulsing chevron near the exit. Furniture, NPCs and the player
(baseline `drawCharacter`) are depth-sorted (a point is in front of a box once past its front faces). Multiply light map
(ambient by time of day + hearth/stove/cauldron/lamps/windows/door) with additive cores, dust motes, swaying herbs/plants,
hearth/stove flames, entry fade, rest fade, vignette. Camera centres the room (all rooms fit the 512×320 view at 1:1).

## 7. Art status
claude-pxl sprites are used whenever MM.art has them (`int_*`, `npc_<id>`, existing props). Missing names are listed live by
`MM.buildings.missingSprites()` and `MM.interiorRender.fallbacks`; until ART2 lands them a **temporary procedural fallback**
in the shared palette is drawn (marked in code as FB). NPCs fall back to the baseline keeper cast sprite + a small accessory.
Request with sizes/anchors: notes/REQUESTS.md "INTERIORS → ART2".

## 8. Tests (all run, Chromium/Playwright)
`node tests/interior-test.js` → pass (validate()==[] incl. live world obstacles per region; door interactables present;
per enterable building: walk from outside spawn to the door with the controller + real E key, walk out through the doorway,
×10 with no loop/duplicate/wall spawn, inventory/hp/gold/quests/world unchanged; pause→resume keeps the same visit; exterior
enemies frozen inside; every furniture handler runs; exterior prompts hidden; locked buildings message + stay outside; rest =
+¼ day & full heal; chest survives save → reload → continue; save taken indoors loads outside the door; resize 390×844,
1500×520, 1280×800 keeps 512×320 at 8:5). Screenshots: `tests/out/interior-<id>-<day|night>.png` (2×), reviewed.
`node tests/smoke.js index.html` → pass.
