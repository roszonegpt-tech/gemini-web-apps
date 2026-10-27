# Architecture — Riftbound: Spellfire & Steel

## Runtime overview

```
main.ts ─► Game (game.ts)
            ├─ Services: Engine · Input · AudioEngine · Music · SaveData · DevFlags
            ├─ StateManager ── TitleScene  (3D diorama behind menus)
            │                ├ MissionScene (campaign gameplay → World)
            │                ├ ChallengeScene (v1.1 trials → World with inline arena)
            │                └ StoryScene   (2D narrative: intro / ending)
            ├─ GolemSegment (v1.1, installed into Sector 2 mission worlds by Game)
            ├─ UISystem ── Hud · Overlay2D · Minimap · TouchControls · Screens (DOM menus)
            └─ DevTools (~ console)
```

### Main loop (`core/Engine.ts`)
- `requestAnimationFrame` → `dt` clamped to 0.1 s, split into ≤ 1/60 s **substeps** → `update(step)` ×N, then `render(dt)` once.
- Input is polled once per frame (`Input.beginFrame`) before the first substep; press/release edges are consumed after it so a press fires exactly once.
- Every update/render call runs inside `Engine.guard()`: exceptions are logged (throttled) to the console and the dev console, the loop never stops.
- FPS is tracked; with *Auto* quality the engine steps quality down (shadow map size → particles/lights → coarser pixel scale) after 3 s below 45 FPS.

### Rendering pipeline
- three.js `WebGLRenderer` (r162, keeps a WebGL1 fallback). The stage is letterboxed to **16:9**; the canvas drawing buffer uses an integer device-pixel scale so the internal height is ~270/360/540 px (Chunky/Classic/Crisp) and CSS `image-rendering: pixelated` upscales it → the reference video's "3D pixel art".
- Scene: hemisphere light + one shadow-casting directional "sun" whose shadow camera follows the view (snapped to shadow texels to avoid shimmer) + a **fixed pool of 6 point lights** (`LightPool`) that effects request every frame (bolts, fireballs, muzzle flashes, explosions, wells, portals). Fixed count = no shader recompiles.
- Ground: one plane with a procedurally painted pixel texture (`utils/textures.paintGround`) built from the level's paint list; cliffs and dangling rock cones make each level a floating landmass over the cosmic rift sky.
- Props are **instanced** (`PropSystem`): one `InstancedMesh` per part per prop kind; damage states tint / squash instances; destroyed props are zero-scaled.
- Particles: two pooled `THREE.Points` (additive + alpha) with a tiny custom shader; square points at low res = chunky pixel particles. `FxSystem` handles telegraph rings, shockwaves, lightning polylines, laser beams, scorch decals, rune glyphs and floating text.
- 2D overlay canvas at full resolution for crisp reticle, lock-on, damage numbers, indicators, markers. HUD/menus are DOM.

### Simulation (`scenes/World.ts`)
- Holds collision (`core/Physics.CollisionWorld`), navigation (`NavGrid`), actors, projectiles, spells, interactables, hazards, gates, objectives, dropships and the camera rig.
- Update order: aim → zone flow/timers → actors → extension `updaters` → projectiles → spells → interactables → hazards → gates → dropships → props (burning) → objectives → cleanup → LOS visibility/heat → atmosphere → fx → particles → camera.
- `dealDamage`, `explode`, `damageProp` route all damage (ward, armour facing, combos, material rules for cover).
- Events to the UI go through `world.events` callbacks (banner, subtitle, hit, checkpoint, complete, failed, bossIntro, pan).

### Collision & navigation (`core/Physics.ts`)
- Circles + axis-aligned boxes in a 4 m spatial hash. Flags: `MOVE`, `SHOT`, `SIGHT` (tall), `LOW` (low cover), `FLY`.
- **Low-cover rule:** a shot ignores LOW cover within 1.6 m of the shooter (firing over sandbags) and LOW cover hugging an *exposed* target (soldier peeking). A target ducking behind cover is protected.
- `NavGrid`: 1 m cells, inflated by agent radius; A* (8-way, no corner cutting, binary heap, expansion cap) + string-pulling. Cells are re-evaluated when cover is destroyed or a gate opens. Path requests are budgeted (4/frame).

### Actors (`entities/`)
- `Actor`: hp, faction, status effects (burn, freeze, stun, slow, wet), hit flash, knockback, collision movement.
- `PlayerMage`: input → movement/aim/casting, ward (hold, drains, breaks, snap-reflect), blink (through walls but not through closed gates), channel/interact, potions, animation.
- `VanguardEnemy`: perception (FOV, LOS, alerts/noise, squad alert), state by kind (see header comment): cover search scoring (`World.coverProtects` raycast + LOS + distance + flank bonus), duck/peek/burst cycle, grenades vs. protected targets, sniper laser, heavy spin-up/armour, drone/heli orbits, turret (hijackable), mortar, Vance.
- `Boss`: `GoliathTank` phases + `ShieldPylon`.
- `Interactables`: wells, chests, anchors, depots, generators, cages, catalyst, exit portal, turret hack, pickups, gates, hazards, searchlights, dropship.

### Objectives & levels
- `levels/*.json` (`config/types.LevelData`): size, theme, ground paint, zones (rect, checkpoint, objectives, gate, enemies, events), props.
- `ObjectiveSystem` evaluates the active zone; completion opens the zone gate; entering the next zone rect sets the checkpoint. Last zone → exit Rift Gate (or ending for the boss sector).
- Checkpoint restart rebuilds the World with `startZone` and fast-forwards earlier zones (`fastForward`), keeping mission stats and the consumables snapshot from when the checkpoint was reached.

### Audio
- `AudioEngine`: master → (sfx, music, voice, ambient) buses → compressor. Named **recipes** synthesize one-shots from oscillators + filtered noise; spatial gain/pan from the listener; throttling and a voice cap prevent clipping. Loops (rain, rift, ward hum, channel choir, rotor, engine, portal) fade via `loopVolume`. New sounds can be added with `registerRecipe()` without editing the engine.
- `Music`: look-ahead scheduler with organ + choir pads, synth bass/arp, drums and distorted guitar; layer gains follow combat intensity (`World.heat`).

### Persistence
- `core/Save.ts`, key `riftbound.save.v1`. Stored JSON is deep-merged over defaults (older/partial saves upgrade safely). **Key names are frozen.**

## v1.1 additions
- `entities/ArcaneGolem.ts` — `GolemSegment` is installed by `Game.attachGolemSegment()` whenever a Sector 2 mission World is (re)built. It adds the shrine + mount interactables, the AA towers, and a required zone-B objective, and registers its per-frame logic in `World.updaters`. Mounting sets `PlayerMage.mounted`, `World.cameraFocus` and `World.mountTarget` (enemies retarget the golem). Flight collides with `CF.FLY` geometry and a corridor test (`allowed()`); the beam is an XZ hitscan against actors, then `SIGHT|FLY` geometry, and also shoots down AA missiles. Sounds use `registerRecipe` / `loopVolume` builders.
- `scenes/ChallengeScene.ts` — a GameState that builds a World from an inline arena `LevelData` (mode `challenge`), applies trial rules via `World.updaters` (loadout restrictions through cooldowns, target spawns, minigun nests, mortar barrages, wave director), grades stars, writes `SaveData.challenges[id]` and converts new stars into shards.
- `systems/UISystem.ts` — overrides the `challenges` screen (trials + speedruns), adds `trialResults`, and the golem armour/heat gauges.

## v1.2 additions
- `ArcaneGolem.moveSwept()` — sub-stepped (≤ ¼ radius) swept circle against `CF.FLY` colliders and the `CORRIDOR` rectangle union; reflects velocity about the push normal; `onImpact()` handles camera trauma, particles, scrape sound and threshold self-damage. Golem knockback is folded into velocity (`applyKnock` override).
- Golem loops keep handles to their nodes (`engineNodes`, `beamNodes`) so `tuneEngine()` / `tuneBeam()` can modulate pitch and filters every frame through plain Web Audio params — `AudioEngine` still owns the loops.
- `game.ts` → `AUDIO_MIX` + `installAudioMix()` — wraps the AudioEngine instance's `play` / `loopVolume` once at startup to apply per-sound / per-loop dB trims, and trims the music volume passed to `setVolumes`. `Game.audioMix` exposes the table to tests.
- `tests/audio-levels.mjs` — renders each recipe in an `OfflineAudioContext` (seeded noise), meters K-weighted/phone-proxy levels and the live buses, and checks the mix targets.

## v1.3 additions
- `ui/TouchControls.ts` — button table (`BUTTONS`) with on-foot / golem labels; `setContext(TouchContext)` hides locked actions, retargets the aim stick, sets the spell label, cooldown sweeps (`--cd`) and badges; `configure(size, handed, opacity)`; taps are held until the loop has polled input (`releaseAfterPoll`). `UISystem.touchContext(world)` builds the context; `Game.trialTouchRules()` → `ChallengeScene.touchRules()`.
- Phone layout: `#stage.touch-mode …` rules and `@media (max-height: 500px)` at the end of `assets/css/style.css`.
- Checkpoint resume: `MissionScene.persistCheckpoint()` writes `campaign.checkpoint` (sector, zone, stats, consumables); `Game.uiAction('continueCheckpoint')` rebuilds the World at that zone; `Save.sanitize` drops malformed checkpoints.
- Playtest records: `recordPlaytest(save, run)` (opt-in, capped at 50) in `core/Save.ts`; written by `ChallengeScene.record()` (complete / failed / quit / restart) and `GolemSegment.recordRun()` on dispose. Settings → Copy / Export / Clear.

## v1.4 additions
- `UISystem.applyPortrait()` (matchMedia `PORTRAIT_QUERY`) moves `.hud-tl`, `.hud-tc`, `#subtitles`, `#touch` and `#screens` between the stage and `#portrait-pad` (`.pp-top` strip + `.pp-controls`); the stage is pinned to the top with CSS. Engine.ts is untouched — the view stays 16:9.
- `UISystem.openExport(title, file, text)` → `export` screen (selectable text, Copy, Download, Back to the previous screen); used for playtest records, save and stats exports.
- `Overlay2D.keepOut` — HUD rectangles (refreshed every 0.25 s by `UISystem.updateKeepOut`) that objective labels step out of.
- `tests/playtest-summary.mjs` — reads `notes/playtest/*.json`, prints quartiles and threshold suggestions.

## Extension points (used by later builds)
- `World.updaters` — per-frame hooks (e.g. vehicles, trial logic) without editing `World`.
- `World.cameraFocus`, `World.mountTarget` — camera follow override and enemy target override.
- `AudioEngine.registerRecipe(name, fn)` — new synthesized sounds.
- `AUDIO_MIX` (`game.ts`) — mix trims in dB for recipes, loops and the music bus.
- `UISystem.extraScreens` — register new menu screens.
- `Game.uiAction` / `MissionScene` hooks — new flows.
- `levels/*.json` — new props/zones/events without code changes.

## File responsibilities
| File | Responsibility |
|---|---|
| `src/game.ts` | Wires everything; UI actions; dev actions; screenshots; auto-pause |
| `src/core/Engine.ts` | Renderer, 16:9 stage, pixel scale, loop, FPS, auto-quality, error guard |
| `src/core/Input.ts` | Keyboard/mouse/touch/gamepad → actions |
| `src/ui/TouchControls.ts` | Touch sticks + context-aware buttons (v1.3) |
| `src/core/StateManager.ts` | Game state switching |
| `src/core/Save.ts` | LocalStorage schema, defaults, migration, import |
| `src/core/Physics.ts` | Collision world, raycasts, nav grid, A* |
| `src/audio/AudioEngine.ts` · `Music.ts` | SFX synth · soundtrack |
| `src/systems/SpellSystem.ts` | Spell casting, vortex/meteor/frost/combos |
| `src/systems/ProjectileSystem.ts` | Bullets, bolts, arcs, impacts |
| `src/systems/UISystem.ts` | Screens, HUD, banners, subtitles, navigation |
| `src/systems/LevelBuilder.ts` | Level JSON → world |
| `src/systems/ObjectiveSystem.ts` | Zone objectives, markers, checkpoints |
| `src/entities/*` | Player, enemies, boss, interactables, allies |
| `src/scenes/*` | World, mission/title/story/challenge states |
| `src/entities/ArcaneGolem.ts` | v1.1 golem flight segment + aerial obstacles; v1.2 swept collision + golem audio |
| `src/scenes/ChallengeScene.ts` | v1.1 challenge trials, grading, rewards |
