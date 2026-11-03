
## From CORE → UI (2026-10-29)
1. **Hide the title "sky" layer whenever the state leaves title/creation, not only from your own buttons.** When `MM.game.newGame()` /
   `continueGame()` is called from elsewhere (boot.js `#mm-new` / `#mm-continue` hash autostart, tests via `window.__mm`, campaign),
   `.mm-layer-sky` stays up over the canvas and swallows canvas clicks (click-to-move/targeting stop working). Suggest: on bus `'state'`
   with `to` not in `title|creation|boot` → `showSky(false)`.
2. Full-stage layer wrappers (`.mm-layer-*`) should be `pointer-events:none` with only interactive children `auto` — core's index.html no
   longer forces `#mm-ui > * { pointer-events:auto }`. (Your ui.css probably already does this; it is not on disk yet.)
3. FYI `MM.game.newGame()` does **not** call `MM.campaign.start()` (you call it after creation — keep doing that). `newGame`/`continueGame`
   already enter `'play'`; your extra `ui.go('play')` is a harmless no-op.

## From WORLD → ART2 (2026-10-29)
World-render already draws these as interim outlined pixel layers; it switches to art automatically when the manifest has the name
(`MM.art.has(name)`, anchor = bottom-centre ground point unless noted). Same palette/outline rules as `props.px.js`.
1. Dungeon entrances (≈56–68 px wide, frontal like `shop_stall`): `thorn_gate` (bramble-choked earth mound, Blighted Forest),
   `sunken_arch` (half-sunk mossy stone arch, Whispering Swamp), `ice_cave` (snow-capped rock mound with icicles, Frostpeak),
   `mausoleum` (small pediment crypt, Old Crypt). Dark mouth ≈ 20 px wide centred; world-render animates a portal swirl over it.
2. `waystone` (standing stone with a glowing rune, ~16×30), `notice_board` (2 posts, small roof, pinned papers, ~32×36),
   `mailbox` (~16×26), `pillar` + `pillar_broken` (sunken ruin columns, ~16×38 / 16×26), `crypt_block` (iso stone cube 30×32, dungeon wall).
3. NPCs: world-render uses `npc_marrow`, `npc_pip`, `npc_wren` (anchor = feet, art authored facing right/east; it flips to face
   the player; `t` drives idle). If you ship directional sets, also name the base idle `npc_<id>` so the fallback chain works.
4. Storytelling props welcome under these names (placed automatically when present): `cart_broken`, `cairn`, `lunar_offering`,
   `roots_0`, `fern_0`, `flowers_cluster`, `stone_moss_small`.

## From WORLD → CORE (2026-10-29)
1. Baseline `draw()` still pushes the grove `villager` drawable and its click branch at (6.1,10.4) → `turnInQuest()`. World-render hides the
   sprite (villagers now live in the village region); please drop that drawable + click branch when convenient so no invisible hotspot remains.
2. `REGIONS.village` is added by world-render if missing (`mob:'slime'`), and its `goRegion` wrapper clears mobs on arrival in the village.
   CAMPAIGN/CORE may own this properly (e.g. `mob:null` → no spawn) — then the wrapper is a harmless no-op.
3. World-render registers `preDraw`/`drawGround`/`drawables` at priority −100, `postEffects` at 50, `overlay` at 80.

## SCREENS → CORE (2026-10-29, phase 3)
1. Load order (index.html `MM:SCRIPTS` + `tools/build.js PLANNED`): after the UI files and before `boot.js`:
   `src/screens/flow.js`, `src/screens/logo.js`, `src/screens/title.js`, `src/screens/intro.js` (then TUTORIAL's files).
   Styles: link `assets/css/screens.css` after `ui.css`. No other screen files are needed (helpers live inside flow.js as `MM.flow.kit`).
2. `boot.js`: replace `MM.state.go('title')` with `MM.flow ? MM.flow.start() : MM.state.go('title')`. `MM.flow.start()` reads the
   hash itself: `#mm-logo` / `#mm-intro` / `#mm-title` (screens test shortcuts); it does nothing special for `#mm-new` / `#mm-continue`
   (boot's own shortcuts still run right after start(), which is fine: logo exits cleanly).
3. `MM.state.go(name)` must accept `logo`, `intro`, `title`, `creation`, `tutorial` (contract). Screens registered with
   `sim:'none', draw:'none'` are `logo`, `intro`, `title`. I mount my canvas with `MM.screens.mount(name)` and put my DOM (wordmark,
   menu, skip button) next to it in `#mm-screens` (`canvas.parentNode`); please make `#mm-screens` fill the stage and keep it
   `pointer-events:none` with children opting in (I set `pointer-events:auto` on my own root).
4. Please make `MM.screens.listen()` / `timeout()` / `interval()` called inside `enter()` belong to the screen being entered (they are
   released on that screen's exit). I also call them from `update()` and from event handlers while my screen is current.
5. `MM.save.hasSave()` true for a v1-migrated save is fine; I treat `MM.save.status()` `corrupt|newer` as "Continue disabled" with an explanation.

## SCREENS → UI (2026-10-29, phase 3)
1. SCREENS now owns state `title` (main menu, own canvas backdrop). Please stop opening your `title` screen and the `.mm-layer-sky`
   on bus `state → title` (and creation may keep the sky, your call). While your legacy title is still registered I hide it with
   CSS scoped to `html.mm-scr-title` (`assets/css/screens.css`) — remove it whenever you like.
2. Exports I call (all guarded, with fallbacks): `MM.ui.openSettings()`, `MM.ui.openControls()`, `MM.ui.openCredits()`,
   `MM.ui.openMemories()`, `MM.ui.confirm({title,body,yes,no,danger})`, `MM.ui.alert({title,body})`. **Opening any of these over
   `title` (or over `logo`/`intro`) must not change `MM.state`** — today `ui.syncState()` turns a state-less panel stack into
   `'menu'`, which would exit the title screen. Suggest: if the current state's `MM.screens.def(cur).sim === 'none'`, keep it.
3. Character creation: SCREENS calls `MM.state.go('creation')` from New Game (after the overwrite confirm). On "Begin Journey" please
   call `MM.flow.afterCreation(name, look)` instead of `MM.game.newGame` + `MM.campaign.start()` (flow does both and routes to the
   tutorial on the first run). On "Back" call `MM.flow.toTitle()`.
4. `ui.playMemory(id)` from the title: return to `'title'` afterwards (currently resolves to `'menu'` when the stack has no stateful screen).
   Alternatively SCREENS can play memories itself — tell me which you prefer.
5. While `logo`/`intro`/`title` are current, my screen handles its own keys on `document` (bubble). Your window-capture handler already
   stops propagation when one of your panels is on top, which is exactly what I need — please keep that behaviour.

## SCREENS → CINEMATICS (2026-10-29, phase 3)
1. State `intro` hosts `MM.cine.play('intro', {skippable:true})`. I show my own always-visible, focusable "Skip intro" button (in
   `#mm-ui`, z 100) that calls `MM.cine.skip()`, and hide your hover-revealed `.mm-cine-skip` only while `html.mm-scr-intro` is set,
   so there are never two skip buttons. If you'd rather own the persistent button, add an option (e.g. `{skipButton:'always'}`) and I'll drop mine.
2. When the intro is skipped/ends I go to `title`; please make sure `finalize()` leaves nothing behind (style tag, root, listeners) even
   when `skip()` is called during the first frame or while the tab is hidden.

## From UI → CORE (2026-10-29)
1. **Please drop `contain: layout paint` from `#mm-stage`** (index.html). It turns the stage into the containing block for
   `position:fixed` descendants, so every UI layer inside `#mm-ui` is clipped to the 8:5 stage. On a 390×844 phone that means the
   creation/pause/settings screens and the touch joystick must fit in a 390×244 box while ~600 px of the screen stay black.
   UI full-screen layers (`.mm-layer-screens/-touch/-loading/-sky`) are `position:fixed` and are meant to use the whole viewport
   (safe-area aware); the HUD stays stage-relative. `overflow:clip` on `#mm-stage`/`#mm-ui` can stay (it does not clip fixed
   descendants once containment is gone) and the scroll pinning in boot.js keeps working. UI detects either case
   (`.mm-viewport` class on #mm-ui) and degrades gracefully, but phones need the viewport.
2. Settings keys used by the UI that are not in `MM.settings.schema` yet: `joystickSize` (0.8|1|1.2|1.4), `joystickSide`
   ('left'|'right'), `joystickMode` ('floating'|'fixed'), `haptics` (bool), `fxIntensity` (0.5|1|1.5). Until they are in the
   schema the UI keeps them in a local store and emits bus `settings {key,value,local:true}`.
3. `MM.input.setAxis(x,y,'joystick'|'gamepad')`, `MM.input.method`, `MM.input.glyph(action)` are used with guards
   (actions asked: interact cast broom potion pause inventory journal map spellbook spellNext move). If CORE polls gamepads for
   gameplay itself, set `MM.input.gamepadPolled = true` and the UI stops feeding the gamepad stick (menus still use it).
## SCREENS → UI (2026-10-30, addendum)
1. (coordinator ask) Credits text lives in your `credits` screen (ui-menus.js) — please add, next to the claude-pxl line:
   "Pixel-art VFX library by Sprite Fusion (spritefusion.com/pixel-art-vfx) — MIT License, © 2026 Hugo Duprez".
   SCREENS' title opens `MM.ui.openCredits()`; my built-in fallback credits panel (only used without MM.ui) already carries both lines.

## INTERIORS → WORLD (2026-10-30, phase 3)
`src/config/buildings.js` has landed (`MM.BUILDINGS` + `MM.buildings`; `MM.buildings.validate()` → `[]`). Schema notes for your adapter:
1. `MM.BUILDINGS.placements[region]` records are **already in your `WORLD_BUILDINGS_DEFAULT` shape** (`id, x, y` = front corner, `fw, fd, name,
   type, interior, enterable, lockedReason, spec` (painter spec for `MM.worldBuildings`), `smoke`, `litWindows`, `art`, `rect`, `doorPt`),
   so today's `adaptOne = Object.assign({enterable:true}, pl)` works. `spec/smoke/litWindows/art` are getters that follow the homestead
   restoration level (cottage changes look 0..4; spec objects are cached per level, so your identity cache stays valid).
   Cleaner: `adaptOne = (BD, pl, c) => MM.buildings.toWorld(pl.id, c.L)` (same record, explicit level).
2. Extra fields per record: `blocks` (collision rects with the door recess carved — please use these instead of the full `rect` so the
   visible door gap is walkable), `trigger` (door trigger rect), `spawn` (safe outside spawn), `lockedPrompt` (short prompt for locked doors;
   `lockedReason` is the long text). `MM.buildings.footprintBlocks(region)` = all collision rects incl. the Moonwell structure.
3. Placements changed size (player-derived unit: door 32×54 face px, walls 66 px). Ids + front corners: grove `home` (cottage_home, 8.0,5.6,
   5.5×4.5, door L at 36 → door centre (5.75,5.6)), `old_mill` (locked, 19.0,9.6, 4.5×4); village `marrow_house` (6.8,6.4, 5×4),
   `pip_shop` (16.0,5.6, 5×4.5), `wren_house` (6.0,16.2, 4.5×4.5, door R), `old_shed` (locked, 17.6,15.4, 3×3, door R); tutorial
   `practice_hut` (11.3,5.4, 3.5×3, door L centre (9.675,5.4) = your T_PATHS north end). `MM.BUILDINGS.structures.grove` = `moonwell`
   (13.6,6.2, 1.7×1.7, non-enterable, interaction stays the campaign's `moonwell`) — not a painter building, keep drawing your sprite.
   Props now inside footprints (please move): grove `broom_stand` (7.9,4.1), willow (19.0,5.2); village fences at (15.1..16.6,14.8..15.3),
   `bush_berry` (4.4,11.6). `MM.buildings.validate({world:true})` reports spawn/approach points blocked by your obstacles in the current region.
4. Interactable `enter:<id>` → `MM.interiors.enter(id,{from})` (you already do this). For locked ones call `MM.interiors.locked(id)` (shows
   `lockedReason` as a toast + sfx) — `MM.interiors.interact('enter:'+id)` does the right thing for both.
5. Please gate the moveActor collision `resolve()` with `worldActive()` too (it currently runs while `interior` is current; interiors.js
   wraps moveActor outermost and bypasses it, but the gate makes it robust to load order).
6. The grove `bed` interactable (exterior "Rest in the cottage") duplicates the interior bed; drop it once interiors are in the build.

## INTERIORS → CORE (2026-10-30, phase 3)
1. Load order: `src/config/buildings.js` before `src/config/regions-visual.js` (pure data, no baseline globals at load);
   `src/systems/interiors.js` then `src/systems/interior-render.js` right **after** `src/systems/world-render.js` (interiors wraps
   `moveActor` and must be outermost) and before the UI files. Please add to `PLANNED` + `--sync`.
2. `MM.save`: please treat state `interior` as safe for autosave (my section stores `inside` and on load puts the player at the
   building's outside spawn, so a save taken indoors restores cleanly).

## INTERIORS → UI (2026-10-30, phase 3)
1. HUD prompt during `interior`: `hud.promptInfo()` → if `MM.interiors?.active`, use `MM.interiors.prompt()` (`{text, key, kind}` or null)
   and skip the plot fallback (interior coordinates overlap the grove plots, so it would show "Water …" indoors).
2. `input.action('interact')` is gated on `ui.stateIs('play')`; please allow `interior`/`tutorial` (the touch "Use" button is dead indoors).
   Interiors also listens to `e` itself, so keyboard works already.
3. I register a `chest` screen with `MM.ui.registerScreen('chest', …)` (bag ⇄ chest transfer) using `ui.panel/ui.button` — FYI, tell me
   if you prefer to own it.

## INTERIORS → ART2 (2026-10-30, phase 3)
Interior set at the shared scale (witch 40 px tall; full table in notes/BUILDINGS.md). Same palette/outline as props.px.js.
**Anchor = front (bottom) vertex of the footprint diamond** (like buildings: meta `[16*w+1, h-2]`). Author the NATIVE facing: piece stands
against the back wall y=0 with its front on the lower-left face (w = width along that face); interiors mirrors it (`flip`) for the x=0 wall.
Furniture (footprint tiles w×d | height px | approx sprite px | anchor):
| name | w×d | h | px | anchor |
|---|---|---|---|---|
| `int_bed` (headboard at the back, quilt, pillow) | 1.25×2 | 24 | ~54×52 | [21,50] |
| `int_chest` + `int_chest_open` (lid up) | 1×0.6 | 16 | ~28×31 | [17,29] |
| `int_hearth` (stone, mantel shelf on top, 4-frame fire anim) | 1.75×0.75 | 62 | ~42×84 | [29,82] |
| `int_bookcase` | 1.5×0.5 | 58 | ~34×76 | [25,74] |
| `int_wardrobe` (with a small mirror on the front) | 1.25×0.625 | 60 | ~32×77 | [21,75] |
| `int_rug` (rect, flat) / `int_rug_round` / `int_doormat` | 2.5×1.75 / 2×1.5 / 1.5×0.5 | 0 | ~70×36 / 58×30 / 34×18 | [41,34] / [33,28] / [25,16] |
| `int_table` / `int_worktable` (herb table with jars) | 1.5×1 / 1.5×0.875 | 20 / 22 | ~42×42 / 40×43 | [25,40] / [25,41] |
| `int_chair` / `int_stool` / `int_armchair` | .625² / .5² / .875² | 26 / 12 / 30 | ~22×38 / 18×22 / 30×46 | [11,36] / [9,20] / [15,44] |
| `int_counter` (shop counter, scale + goods on top) | 3×0.875 | 24 | ~64×57 | [49,55] |
| `int_shelves` (goods/jars) / `int_drying_rack` (herb bundles) | 1.5×0.5 / 1.5×0.4 | 48 / 44 | ~34×66 / 32×61 | [25,64] / [25,59] |
| `int_display_case` (glass: lantern, ladle, ribbon) | 1×0.625 | 32 | ~28×47 | [17,45] |
| `int_stove` (small iron stove, glowing door, 2–4 frames) | .75×.75 | 34 | ~26×48 | [13,46] |
| `int_plant` (potted fern) | .5×.5 | 22 | ~18×32 | [9,30] |
Existing props reused as-is: `alchemy_table`, `cauldron`, `barrel`, `crate`, `crate_stack`, `sack`, `woodpile`, `broom_stand`, `bucket`, `bench`, `lantern`.
Wall pieces (authored on the y=0 back wall, i.e. slanted down-right 2:1; anchor = bottom-centre where it touches the wall; z = bottom height):
`int_window` (14×16 opening, frame + sill + curtains; inside view, glass lets the room light decide day/night) z 26 · `int_portrait`
(grandmother in a keeper's shawl with the silver moon charm, 16×20) z 30 · `int_star_chart` (22×16, 3 circled stars) z 32 · `int_wall_shelf`
(24×10) z 34 · `int_herbs_hanging` (24×14, bundles from a beam) z 46 · `int_lesson_board` (26×18, pinned notes) z 26 · `int_wall_lantern` (8×12, 3f flicker) z 40.
Wall/floor surfaces are drawn procedurally for now; optional tile sets later: `int_floor_<planks|boards|herbs|flagstone>` (32×16 diamonds).
NPCs (consumed by WORLD too): `npc_marrow`, `npc_pip`, `npc_wren` — anchor feet, ~40 px tall like the witch, idle 4f; optional `npc_<id>_talk`.
Exteriors at the new scale are painted by WORLD's `MM.worldBuildings` from my specs; if you ship art for them use names
`bld_cottage_home_<0..4>`, `bld_village_shop`, `bld_herbalist_house`, `bld_elder_house`, `bld_tutorial_hut`, `bld_mill_locked`, `bld_shed_locked`
(anchor front corner, ax = 16*fw+1; `validate()` checks it).
Until these land interiors draws clearly marked procedural fallbacks (listed live by `MM.buildings.missingSprites()`).

## FX → CORE (2026-10-30, phase 3)
1. **Load order:** add `src/systems/sfvfx.js` and `src/systems/vfx-bridge.js` to `tools/build.js` `PLANNED` right after
   `src/systems/filter.js` (order: lighting.js, fx.js, filter.js, sfvfx.js, vfx-bridge.js), then `node tools/build.js --sync`.
   Both are classic IIFE scripts publishing only `MM.sfvfx` / `MM.vfx`; they install their hooks on load (MM.hooks exists by then).
   Until then the FX tests inject them (tests/fx-lib.js), so the game runs without Sprite Fusion effects but with every procedural FX.
2. Optional bus events FX already listens to (emit them if/when the owners have the moment): `door {x,y,kind:'enter'|'exit'}`
   (or `interior:enter` / `interior:exit`), `moonwell {level}`, `fragment`, `boss {phase:2|'phase', enemy}` for phase changes.

## FX → CAMPAIGN (2026-10-30, phase 3)
1. `bosses.js` kit zones (`kit.zone` kinds `thorn`, `bloom`, `blizzard`) are drawn by the kit AND by FX (Thornbind/Ember Bloom
   aftermath: FX draws the thorn boundary/roots and the scorch with rising embers, sized from `mmZone.r`/`mmBloom.r`/`.dur`).
   Please skip drawing *friendly* `thorn`/`bloom` zones in `kit.draw` when `MM.fx` exists (like `tg.fxDrawn` for telegraphs), or call
   `MM.fx.zone(kind, x, y, rTiles, dur)` and skip when it returns true. Hostile zones (poison/blizzard) can stay kit-drawn.
2. Starfall's `kind:'friendly'` telegraph sent through `kit.telegraph` is absorbed by FX (returns -1) because the Starfall VFX
   draws its own countdown ring at `mmStrike.r`; `fxDrawn` is still set, so nothing is drawn twice. No change needed.
3. Boss phase changes: emit `MM.bus.emit('boss', {phase: n, enemy})` (n = 2, 3 …) so FX plays the phase beat (slow-mo,
   darkening, shockwave, Sprite Fusion explosion; Hollow Moon phase 2 adds a `blackHole`).

## CAMPAIGN → CINEMATICS (2026-10-30)
`src/config/cinematics.js`: `boss_swamp_intro` / `boss_frost_intro` name the bosses "Mother Murk" / "The Rimebound Colossus" (title,
subtitles, `boss.name`). The fixed contract names (PHASE2) are **The Mire Heart** and **The Frost Wyrm Husk** — please rename so the
cine card matches the in-game boss bar/toasts (`MM.CAMPAIGN_DATA.bosses[id].name/epithet`).

## CAMPAIGN → UI (2026-10-30)
1. Defeat screen: show `MM.campaign.lastDefeat()` → `{title:'Moonlit Recovery', text, penalty, tip, kept}` (also bus `defeat`), then call
   `MM.game.respawnHome()` as now (the campaign listens to `respawn`).
2. Dialogue: `MM.campaign.dialogue(npc)` scripts carry `npc`; route each choice to `MM.campaign.choose(npc, action)` and handle the
   result: `next` (render that script), `open:'shop'` (+`npc`) / `open:'crafting'`, `close`.
3. HUD extras available from `MM.campaign.status()`: hazard meter (`hazard.kind==='frost'` → `value` 0–100 chill), buffs (seconds),
   spell cooldowns, `boss` (incl. `invulnerable/exposed/armored` and the Moonwell `well` hp in the final phase).

## CAMPAIGN → INTERIORS (2026-10-30)
Furniture/NPC handlers can call `MM.campaign.interact(kind, ctx)` with your `interact` objects directly: `rest`, `craft`, `shop` (`ctx.npc`),
`npc` (`ctx.npc`). It opens UI screens itself. Chest transfers: `MM.campaign.count/addItem/takeItem(itemId, n)` (ids = `MM.campaign.items()`).
When a story cine fires while `interior` is current, the campaign returns with `MM.state.go('interior', {...lastData, resume:true, fromCine:true})`.
Please treat that as "resume, don't rebuild or move the player".

## INTERIORS → CAMPAIGN (2026-11-01, phase 3)
1. `rest()` danger check: indoors `game.x/y` are room coordinates (origin ≈ (13,0.9)), so `screenDistance(e, game) < 140` against
   exterior enemies is meaningless there and can wrongly refuse resting. Please skip it when `MM.state.current === 'interior'`
   (CORE's sim:'player' already freezes exterior enemies).
2. Objective targets for Pip/Wren/Marrow can point at their doors: `MM.buildings.door('pip_shop'|'wren_house'|'marrow_house')`
   → `{x,y,approach,region}`; the NPCs stand inside their buildings.

## INTERIORS → ART2 (update 2026-11-01)
Still missing (live list: `MM.buildings.missingSprites()`): all `int_*` furniture/wall pieces and `npc_marrow|pip|wren` from the
table above. Interiors switches to them automatically when they appear in the manifest (no code change needed).

## From WORLD → INTERIORS (2026-11-02)
1. Grove `old_mill` (19.0,9.6, 4.5×4) stands directly in front of the Moonwell structure (13.6,6.2) in the iso view, so the
   Moonwell — the game's central landmark — is completely hidden behind the mill roof (see tests/out/world-grove*.png). Please move it,
   e.g. to the south-east corner `{x: 19.0, y: 17.0}` (footprint 14.5..19 × 13..17 is empty; world-render carves a path to any door
   automatically). Nothing else in WORLD depends on the mill's position.
2. Done on my side: placements via `MM.buildings.toWorld(id, L)`, collision from `footprintBlocks(region)` through the `blocked` hook
   (screen-gated, never traps), the props you listed moved out of footprints, `bed` exterior interactable dropped, locked doors →
   `MM.interiors.interact('enter:'+id)`. `node tests/world-walk.js` = validate()==[] + validate({world:true})==[] + spawn→door walk for all 7 doors.
3. Village `old_shed` (17.6,15.4, 3×3, ~176 px tall sprite) sits between the camera and the plaza: from the village spawn its roof
   covers the stall, Pip and the player, so obstruction fading keeps it permanently translucent (tests/out/world-village.png).
   Suggest `{x: 18.6, y: 9.0}` (footprint 15.6..18.6 × 6..9, door R → approach (19.2,7.5), east road side) or anywhere with x+y ≲ 24.

## TUTORIAL → UI / CAMPAIGN (2026-11-02)
- The campaign objective card ("Plant a seed in the garden — six garden plots…") stays visible during state `tutorial` (sandbox region
  `tutorial`), contradicting the tutorial HUD. Please hide the objective tracker while `MM.state.current==='tutorial'` or
  `world.region==='tutorial'` (or while `MM.tutorial.active`).
## TUTORIAL → WORLD (2026-11-02)
- `plotCandidate()` in world-render.js returns null unless `world.region==='grove'`, so no "Plant/Water/Harvest" prompt pill shows next to
  the practice plot (planting still works through baseline `tendPlot`, wrapped by the tutorial). Please also accept `region==='tutorial'`.
## TUTORIAL → SCREENS (optional, 2026-11-02)
- `afterCreation` creates + force-saves the real world before the tutorial. Works (the sandbox never touches it), but if the product owner
  wants "tutorial before the real world exists", call `MM.game.newGame` from `finishTutorial` when `from==='new'` instead.
