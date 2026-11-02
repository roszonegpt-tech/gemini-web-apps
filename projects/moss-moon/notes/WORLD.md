# World visuals (owner: WORLD) — `src/systems/world-render.js`, `src/config/regions-visual.js`

## Pipeline (all via MM.hooks; only runs when baseline `draw()` runs, i.e. screens with `draw:'world'`)
| Hook (priority) | Layer |
|---|---|
| `preDraw` (−100) | screen-space backdrop (gradient + motif, gentle parallax) → cached **terrain canvas** (760×450, world (0,0) at (380,44)): island skirt + side tiles, tiles (`MM.art.drawTile` or procedural), organic fringes between families, flat decals, baked static shadows, region/neglect tint. Restoration changes cross-fade old→new terrain (1.4 s). Baseline `ground` is cleared (its blit is a no-op). |
| `drawGround` (−100) | animated water (`water_anim`) + cached water-edge overlay (shore lips, land fringes, lilypads), bog ripples, dungeon stairs/exit, drifting ground-fog patches |
| `drawables` (−100) | one pre-built `{type:'custom'}` per prop/NPC/building/garland (depth fixed at layout time, multi-tile footprints re-sorted vs the player each frame) + a sentinel (depth 1e7) = **post-entity pass**: chimney smoke, non-emissive ambient particles, foreground foliage |
| `postEffects` (50) | emissive motes (fireflies/spores/embers/wisps), Moonwell shimmer column, fallback light halos (only if `MM.lighting` is absent), door cue glow, interaction chevron |
| `overlay` (80) | `MM.world.transition()` iris/fade wipe |
| `blocked` | building + structure collision rects (`MM.buildings.footprintBlocks(region)`, door recess carved), ignored for a rect the player already stands in (never traps) |
Without `MM.hooks` it falls back to the `props` array + `drawProp` wrapper and a `ctx.drawImage(ground)` interception.
Wrapped baseline functions: `drawGround`, `drawProp`, `ellipse` (shadow-coloured ellipses → stepped soft pixel shadows in the region's shadow colour), `moveActor` (prop circles/rects + water, slide, start-inside escapes, stall-clears click target, gated by `worldActive()`), `drawDungeonBlock` (themed walls), `drawVillageKeeper` (hidden), `goRegion` (village stays mob-free).

## Buildings
`MM.BUILDINGS` (INTERIORS) is the only source: `placements[region]` → `MM.buildings.toWorld(id, L)` (L = restoration). Exterior = the inline painter `MM.worldBuildings.paint(spec)` (face-space pixel painting, outlined: plinth stones, timbered plaster / planks / stone / logs, shingle/thatch/slate roofs with barge boards + ridge, gable window, chimney, steps/porch/awning, moss/ivy/ruin holes, shutters/boarded door when locked, lit-window mask) **plus ART2 parts on top**: `ext_door[_boarded]_l|r`, `ext_window_dark|lit|shuttered_l|r`, `ext_flowerbox_l|r`. A whole-building sprite named in the type (`bld_*`, e.g. `bld_mill_locked`, `bld_shed_locked`, `bld_tutorial_hut`) replaces the painter when MM.art has it.
- Depth: footprint items sort at `min(project(x0,y1), project(x1,y0))`; if the player is behind/beside (not in front of either face) the building is drawn after the player and fades to 45 % where its **sprite alpha** covers the player's head/torso/feet.
- Door: interactable `enter:<id>` at the door approach (prompt `Enter <name>` or `lockedPrompt`), warm pulsing door glow (cool grey when locked), chevron; E/tap → registered handler (INTERIORS) → fallback `MM.interiors.interact('enter:'+id)`.
- Paths: a BFS carves a footpath from every door approach to the nearest path/cobble tile.

## Regions (`MM.REGION_VISUALS`, `MM.DUNGEON_VISUALS`)
grove (restoration 0–4: wild→groomed grass, overgrowth/brambles → flowers/moon mushrooms/lamps/bench/lantern garland, cottage look via BUILDINGS levels, Moonwell dark→faint→glow→restored + shimmer column at 3–4, fireflies 3→24, neglect tint), village (Hollowbrook: cobble plaza, roads, well, notice board, stall, bunting/lantern garlands, Marrow/Pip/Wren), forest, swamp, mountain, crypt, sky, tutorial (practice yard; `tutorial_sign`), dungeons forest/swamp/mountain/crypt/rift (themed floors + walls: thorn bushes / sunken pillars / ice crystals / crypt blocks). Each region: `terrain(x,y,c)`, `build(B,c)`, backdrop motif, skirt drips, shadow colour, fog, ambient particle specs, foreground style.
**Add a region:** add `R.<id>` in regions-visual.js (copy `R.forest`), give it `terrain` + `build`; props via `B.p(sprite,x,y,{k,r|rect,low,tall,sway,lights,smoke,glow})`, interactables `B.i(id,x,y,{prompt,r,kind})`, NPCs `B.npc(id,x,y)`, flat decals `B.decal`, `B.scatter({s,n,zone,on,avoid,cluster,decal})`. Buildings go in `MM.BUILDINGS.placements[<id>]`.

## Sprites consumed
tiles: `grass_grove|grass_wild|forest_moss|path_dirt|cobble|crypt_flag|snow|ice|swamp_mud|swamp_bog|water|soil_dry|soil_wet _0..3`, `water_anim`, `edge_shore_*`, `side_earth|stone|snow|crypt`. nature/props: trees (oak 0–2, blighted, blighted_small, willow, pine_snow, crypt), bushes, rocks, reeds, grass_tall, mushrooms (glow/moon animated), flowers, lilypad, ice crystals, snow_mound, log, stump, fences (+broken), signpost, barrel, bucket, sack, crate(_stack), compost, scarecrow, cauldron, alchemy_table, broom_stand, woodpile, lamp_post, lantern, bench, pumpkin, well, shop_stall, tombstone_0–2, grave_mound, brazier, moonwell_dark|faint|glow|restored. ART2: `npc_<marrow|pip|wren>_<idle|talk>_<s|e|n>` (west = e flipped; talk when the player is in range), `thorn_gate`, `sunken_arch`, `ice_cave`, `mausoleum`, `waystone`, `notice_board`, `mailbox`, `pillar(_broken)`, `crypt_block`, `bld_*`, `ext_*`. Any `'@name'` prop uses art `name` when present, else an outlined pixel fallback.

## Lights API (for FX lighting)
`MM.world.getLights()` → live array of `{id, kind:'window'|'lamp'|'lantern'|'fire'|'moonwell'|'portal'|'rune'|'glow'|'exit'|'stairs', x, y (tile coords of the ground point), z (px above it), r (px), color, flicker 0..1, night (only on after dusk), intensity 0..1 (night ramp × flicker), on}`. `MM.world.lightToScreen(l)` → canvas px.

## Other API
`setRestoration(L,{moonwell})`, `getRestoration()`, `setMoonwell(L)` (campaign `homestead.level` / `moonwell.level` are synced automatically), `layout(region)`, `interactables()`, `nearestInteractable(x,y,max)`, `register(idOrKind, fn)`, `interact()`, `currentPrompt()` (`{id,kind,prompt,glyph,key,x,y,…}`, also plot prompts; null outside world screens), `buildings()`, `blocks()`, `obstacles()`, `npcs()`, `tileAt`, `transition(from,to,{onMid,dur,fade})`, `perf(reset)`, `options` (art, foreground, ambient, collision, fade, softShadows).

## Boundary with FX
WORLD: terrain/props/buildings animation, region scenery particles (pollen/petals/leaves/snow/spores/embers/wisps/motes/fireflies), smoke, fog, foreground foliage, light *sources*. FX: weather (rain/wind), spell/combat/farming particles, lighting/bloom passes that read `getLights()`. Caps from `MM.settings.particleScale()` (max 160 world particles), reducedMotion = no sway/parallax, slower motes.

## Tests
`node tests/world-shots.js [out] [flags] [only]` → tests/out/world-*.png (2×) for grove0–4, village, 5 regions + sky + tutorial, 4 dungeons, nights, door cue, edges + per-layer ms/frame. `node tests/world-walk.js` → `MM.buildings.validate()==[]`, `validate({world:true})==[]` per region, BFS spawn→every door over live collision and replays it with the real `moveActor`.
