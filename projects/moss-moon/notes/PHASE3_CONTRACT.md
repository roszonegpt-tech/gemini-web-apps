# Moss Moon — Phase 3 Contract (screens, single loop, joystick, buildings/interiors, tutorial, spectacle)

**Supersedes / amends `PHASE2_CONTRACT.md` where they conflict.** Read ARCHITECTURE.md, PHASE2_CONTRACT.md, BASELINE_AUDIT.md and the owner handoffs in `notes/handoff/` first.

## Non-negotiables from the product owner
1. **Keep the established sprite style.** The witch atlas and baseline enemy sprites are never modified or restyled. All new art is authored with claude-pxl in the project's shared palette (`art/palette*.js`), same outline/lighting rules as the existing 262 sprites. No emoji icons, no flat-rect placeholders, no "good enough" shortcuts: if a building, furniture piece, NPC or prop is visible, it has proper pixel art. Procedural drawing is allowed for ground/lighting/FX, not as a substitute for object art.
2. **Joystick, not d-pad buttons.** Movement on touch/mouse is an analog on-screen joystick (floating or fixed). No 9-button arrow pad anywhere. Action buttons (Cast, Interact, Broom, Potion, Pause) remain because they are not movement.
3. Real, separate **application states**; no gameplay world rendered/simulated behind logo, intro, main menu or creation; **one** authoritative `requestAnimationFrame` loop; explicit enter/exit/update/render/cleanup; transitions release listeners/timers/audio.
4. Scale/alignment/entering buildings is a systems fix (shared definitions), not cosmetics. Interiors are real scenes with collision, exits, persistence.
5. Only claim tests passed that were actually executed.

## State list (final) and screen flow
```
boot → logo → intro (first run: auto; skippable; replay from menu) → title (= MAIN MENU) →
   New Game → creation → [tutorial (first time, or on request)] → play
   Continue → play            Tutorial / Replay Intro / Settings / Controls / Credits from title
play ⇄ interior (enter/exit buildings) ; play → menu (pause) | dialogue | cine | defeat | ending | loading
```
State names: `boot logo intro title creation tutorial play interior menu(pause) dialogue cine defeat ending loading`. (`title` now means the main menu; `menu` remains the in-game pause state.)

## CORE additions (owner: CORE) — implement exactly these names
```
MM.loop            single rAF. MM.loop.stats() -> {rafs:1, frames, running, dt}. Wall-clock dt in seconds, clamped (≤0.1 for screens; baseline keeps its 1/60 substepping). Pauses on tab hidden, resumes with no dt spike.
                   MM.loop.onTick(fn) -> off  (fn(dt) runs every frame for ALL states: ONLY for services like cinematic timelines; keep tiny)
MM.screens.register(name, def)   def = {
   sim:   'none' | 'player' | 'world',   // what baseline simulates while this state is current: nothing / player controller+camera only (no enemies, farming, raids, clock) / full world
   draw:  'none' | 'world' | 'frozen' | 'custom',  // none = #scene hidden & not drawn; world = baseline draw each frame; frozen = last world frame dimmed; custom = def.render(ctx,w,h) draws instead of baseline (interiors, tutorial overlays)
   audio: { music:'trackId'|null, ambience:'id'|null, keep:false },  // applied on enter via MM.audio (fade); gameplay audio loops (broom etc.) are stopped for sim:'none' screens
   enter(data, prevName), exit(nextName), update(dt), render(ctx,w,h), resize(w,h,dpr), cleanup()  // all optional; cleanup runs after exit
}
MM.screens.mount(name, {w=512,h=320,pixelated=true,layer='screens'}) -> {canvas, ctx, destroy()}   // canvas inside #mm-screens (z-index 40, above #scene, below cine 50 and UI 100), sized/scaled with the stage; auto-destroyed on exit
MM.screens.current / MM.screens.def(name)
MM.state.go(name,data)  now runs: prev.exit → prev.cleanup → releases listeners the prev registered via MM.screens.listen() → applies draw/sim/audio policy → next.enter. 
MM.screens.listen(target, type, fn, opts) -> auto-removed on exit of the CURRENT screen (use this, never raw addEventListener, inside screens)
MM.screens.timeout(fn, ms) / MM.screens.interval(fn, ms) -> cleared on exit
MM.isPaused() === (sim === 'none' for current state) ... except 'play'→ false, 'interior'/'tutorial' → false.
Gameplay input (keys, pointer, joystick, gamepad) is processed ONLY when current screen sim !== 'none'.
MM.input.axis = {x,y} analog move vector in SCREEN space, magnitude 0..1 (set by joystick or gamepad stick via MM.input.setAxis(x,y,source)); baseline readInput consumes it with ~0.15 deadzone, analog speed scaling optional, 8-way sprite facing unchanged. Keyboard/click-to-move still work.
MM.input.method -> 'keyboard' | 'touch' | 'gamepad' (last used; bus 'input:method'), MM.input.glyph(action) -> label for that method (e.g. 'E', 'A button', 'Tap ✦').
New settings: joystickSize (0.8–1.4, def 1), joystickSide ('left'|'right'), joystickMode ('floating'|'fixed'), haptics (bool). touchControls 'auto' = on when (pointer: coarse) or a touch event is seen.
Baseline `loop` is removed/neutralized (its rAF replaced by MM.loop); there must be ZERO other rAF loops anywhere (cinematics, UI backdrops, FX all use MM.loop.onTick or screen update/render). Tests assert rafs===1 across all state transitions.
Page shell adds <div id="mm-screens"></div> between #scene and #mm-fx.
```
`sim:'player'` runs: input→movement→animation→camera→interaction proximity only. `draw:'custom'` states receive `ctx` = #scene's context; they may use baseline helpers (`drawCharacter`, `project`, `worldToCanvas`, `drawCastSprite`). While `interior`/`tutorial` are current, exterior enemies/farm/clock/raids do not update, exterior interaction prompts are cleared, and exterior autosave is suppressed unless `MM.save` says safe.

## SCREENS (owner: SCREENS agent) — `src/screens/*.js` (logo.js, title.js, intro.js, flow.js, backdrop-*.js as needed) + `assets/css/screens.css`
`MM.flow`: `start()` (called by boot.js after load: → logo), `toLogo()`, `toIntro({replay})`, `toTitle()`, `newGame()` (confirm if save exists → creation), `afterCreation(name,look)` (→ tutorial if first time else play; both start MM.game.newGame), `continueGame()`, `startTutorial({replay})`, `finishTutorial({skipped})` (persists `tutorialDone` ONLY on finish/skip; then → play), `toGame()`. Persistent first-run flags in `MM.storage` key `moss-moon-flow-v1`: `{introSeen, tutorialDone}` (not inside the game save so New Game doesn't re-show the intro).
Screens: **logo** (own full-screen canvas composition: fade from dark, motes + moon glow, deliberate logo reveal with light sweep/pulse, final hold, concise ~6–8 s, skip button + any key/click, reduced-motion variant), **intro** (hosts `MM.cine.play('intro')` inside its own state; skip/replay; ends → title or tutorial path), **title/main menu** (animated procedural backdrop on its own canvas — NOT the game world; New Game, Continue (only with valid save, shows summary), Tutorial, Replay Intro, Memories, Settings, Controls, Credits; confirm before overwriting a save), all keyboard/pointer/touch operable with visible focus.

## UI (owner: UI agent) changes
Drops the Title screen (SCREENS owns it); keeps creation, HUD, pause, submenus, shop, dialogue, etc., adapted to new states (HUD only in play/interior/tutorial). Builds the **joystick** (`src/ui/ui-joystick.js`: analog floating/fixed stick, multi-touch safe with action buttons, pointer-events for touch+mouse+pen, deadzone, visual base+thumb in the UI's moonlit style, haptics where supported, visible only when `touchControls` resolves on, hides when sim==='none' or UI modal open, releases on pointercancel/blur/visibility, feeds `MM.input.setAxis`) and the right-side action cluster (Cast big, Interact, Broom, Potion, Pause) honoring joystickSide. Removes the `[data-dir]` d-pad entirely. Settings gets joystick options. Pause menu gets "Controls", "Settings", "Replay tutorial".

## BUILDINGS & INTERIORS (owner: INTERIORS agent) — `src/config/buildings.js`, `src/systems/interiors.js`, `src/systems/interior-render.js`, tests/interior-*.js, notes/BUILDINGS.md
`MM.BUILDINGS` = single source of truth: `unit` (derived from player dims: tile 32×16 px, player ≈ 1 unit tall; door height ≥ 1.35 player height; door clear width ≥ 1.2 player width; wall/floor heights, window sizes, stair rise/run, porch depth, furniture size table), `types` (cottage_home, village_shop, herbalist_house, elder_house, tutorial_hut, mill/shed (intentionally locked), shrine/Moonwell structure (non-enterable) …) each with footprint (tiles w×d), wall/roof/door/window specs, door side+offset, collision footprint rects (visible structure = collision, door gap walkable), approach point, outside spawn point, interaction trigger rect, sprite names, enterable bool + `lockedReason` text, `interior` id; `placements[regionId]` list with ids/positions/facing; `MM.buildings.validate()` returns problems (floating anchors, door blocked, spawn inside collision, trigger misaligned) — tests must call it and it must return [].
`MM.interiors`: `enter(buildingId,{from})`, `exit()`, `current`, `defs` (data-driven: size, floor kind, wall segments w/ windows, furniture [{type,x,y,w,d,solid,interact,handler}], lights, exit door rect + safe interior spawn, optional NPC, shop/brew/rest/storage hooks), furniture handlers (rest at bed → advance ¼ day + heal; storage chest with persisted contents; brewing station opens crafting; shop counter opens shop; bookshelf lore text; hearth warm light). Registered as screen state `interior` (`sim:'player'`, `draw:'custom'`). Prevents enter/exit loops (cooldown + require leaving trigger), duplicate objects on revisit (instances rebuilt from defs + saved state), spawning in walls (spawn validated), keeps inventory/quests/hp. Saves section `interiors` (opened chests, placed items, visits). Interactables: `MM.world.register('enter:'+id, …)`; prompt text from `lockedReason` for non-enterable doors; no silently broken entrances.

## TUTORIAL (owner: TUTORIAL agent) — `src/screens/tutorial.js`, `src/config/tutorial.js`, tests/tutorial-*.js
State `tutorial` (`sim:'world'` over a **sandbox**: separate small tutorial region id `tutorial` with its own world snapshot: a practice yard with a plot, a dummy, a sign, a small enterable practice hut (uses MM.interiors), a few seeds/potion; real world is snapshotted and restored byte-for-byte on exit; real save untouched). Steps are event-verified, one objective at a time, with correct glyph for the current input method (`MM.input.glyph`), a highlight ring/arrow on the target and UI element, feedback toast + sfx, never advance on timers, retry/reset-step support (respawn missing targets so the player can't be trapped), Skip → confirm. Lessons only for mechanics that exist: move (joystick/WASD), interact (sign), enter/exit hut, plant→water→harvest, cast at dummy, drink potion, open inventory/pause menu, (optional) broom mount/land. Clear completion moment; then `MM.flow.finishTutorial`.

## WORLD (owner: WORLD agent) amendments
Consumes `MM.BUILDINGS` for exterior rendering: foundations, door/window frames, steps/porches/awnings, roof edges/material variation, moss/weathering — all from art-agent sprites (extend through ART2 requests) or pixel-authored layers; correct anchoring and depth order (player passes behind roofs/in front of porches), collision from `footprintBlocks`, door triggers aligned with visible entrances, paths connecting destinations (cottage↔garden↔village↔travel board↔dungeon portals), vegetation clusters, roots/rocks/foliage, storytelling props (broken fence, abandoned cart, old lunar offering, etc.), ambient motion; door cue ("E"/glyph prompt + subtle door glow) when near; locked buildings communicate via shuttered windows + prompt text.

## ART2 (owner: ART2 agent) — extends `art/**` with the same claude-pxl palette/rules
Interior furniture & fixtures set (bed, table, chairs, stools, shelves, bookcase, hearth/stove, counter/stall counter, barrels, crates, chests (closed/open), rugs, wardrobe, loom/work bench, cauldron interior, herb drying racks, lamps, hanging herbs, curtains, window interiors, interior wall/floor tile sets per building kind with doorway pieces, stairs), NPC sprites Marrow/Pip/Wren (idle ×4 facing + talk frames, same chunky proportions as the witch), building exteriors upgrades required by BUILDINGS (door frames/steps/porch/awning/roof edge pieces, shuttered windows, tutorial hut, mill/shed), more env props & ground detail (roots, ferns, flower clusters, mossy stones, ruined cart, cairn), logo-screen art elements (moon, moss-vine letter ornaments, light motes — logo letters themselves are drawn by SCREENS in canvas/SVG), and fix the weakest sprites (Frost Wyrm south windup, flagstone checker, UI corner). Regenerates `assets/js/art-data.js`; keep names stable; append new names to `assets/images/manifest.json`; notes/ART_DIRECTION.md updated.

## FX (owner: FX agent) amendments
Spectacle upgrade with explicit **anticipation → action → impact → aftermath** sequences per effect class (cast, melee/hit, crit, kill, boss phase, harvest, level-up, region restoration, door open/enter, Moonwell pulses); size/color/motion/duration scale by gameplay meaning (small for chip damage, large for boss/restoration); layered: charge glints, impact flash (reduced-flash aware), particle bursts, trails, expanding rings/shockwaves (shockwave distortion by cheap radial offset blit where affordable), sparks/smoke/dust/residue, brief local light accents via `MM.lighting.addLight`, camera impulses via `MM.camera.shake`, glow. Strict budgets/pooling/culling/lifetime cleanup; no rapid flashing (≤3 flashes/s, honor reducedFlashes), reducedMotion, `fxIntensity` setting (0.5/1/1.5 via particles + quality). FX only runs in states with sim !== 'none'.

## CINEMATICS amendments
`MM.cine` must not own a rAF: drive it from `MM.loop.onTick` (or screen update/render) and handle resize (ResizeObserver via MM.screens.listen) and tab visibility (pause/resume timelines without dt spike). Hosting: state `intro` (SCREENS) and state `cine` (campaign). Frame-rate independent (timeline time accumulates from dt). Provide `MM.cine.attach(container)` or keep the overlay canvas but make creation/destruction part of enter/exit.

## CAMPAIGN amendments
`MM.campaign.start()` no longer plays the `intro` cinematic (flow already did); it begins the Arrival chapter. Campaign tutorial chain remains as *story objectives* but must be skippable/auto-complete when `MM.flow` tutorial was done. Cinematic playback must set `MM.state.go('cine')` and return to the previous state (`play` or `interior`). Buildings/NPC dialogue interactions go through `MM.world.register`/interiors.

## File ownership additions (and load order, appended)
```
src/config/buildings.js              INTERIORS (before world-render.js)
src/systems/interiors.js, interior-render.js   INTERIORS
src/screens/flow.js logo.js title.js intro.js  SCREENS (after ui-*.js)
src/screens/tutorial.js, src/config/tutorial.js TUTORIAL
src/ui/ui-joystick.js                UI
assets/css/screens.css               SCREENS
```
CORE updates `tools/build.js PLANNED` to include them (screens after ui, boot.js last).
