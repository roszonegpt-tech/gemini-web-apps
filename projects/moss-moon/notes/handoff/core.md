# CORE handoff — Moss & Moon phase 2

Owner files: `src/core/mm.js`, `src/core/legacy-shim.js`, `src/core/boot.js`, `src/core/baseline.js` (seams), `index.html`,
`tools/build.js`, `tests/smoke.js`, `tests/core-*.js`, this note.

## What exists
| File | What it does |
|---|---|
| `src/core/legacy-shim.js` | Hidden `#mm-legacy-ui` with the 59 ids baseline.js expects (selects / spans / buttons). Loaded before mm.js. |
| `src/core/mm.js` | `window.MM` core: bus, settings, state machine, input gate, hooks, camera, save, game. One IIFE, only global is `window.MM`. Loaded BEFORE baseline.js. |
| `src/core/baseline.js` | Original game + surgical seams, every one marked `// MM seam` (grep it). All are no-ops without `window.MM`. |
| `src/core/boot.js` | Loaded LAST. Stage layout, settings→page, autosave, tab-hide pause, error toasts, fallback title/pause/defeat when `MM.ui` is missing, `window.__mm` diagnostics. `boot`→`title` on DOMContentLoaded. |
| `index.html` | Page shell per contract: `#mm-app > #mm-stage > canvas#scene + #mm-fx + #mm-ui`, stage CSS, `<noscript>`. |
| `tools/build.js` | `--check`, `--sync`, default = single-file build to `builds/moss-moon-v<MM.version>.html` + `builds/LATEST.txt`. |
| `tests/smoke.js`, `tests/core-test.js` | Browser smoke test and core/baseline tests (see "Tests"). |

## Adding a module to the page
1. Name it as in PHASE2_CONTRACT "File ownership" (the order is fixed in `PLANNED` inside `tools/build.js`).
   UI files: list them, one per line, in `src/ui/MANIFEST.txt` (`ui-core.js` or `src/ui/x.js`; `#` comments ok).
   Without a manifest the default UI order is ui-core, ui-hud, ui-menus, ui-screens, ui-input.
2. Run `node tools/build.js --sync` — rewrites the `<!-- MM:SCRIPTS -->` block of index.html with every planned file
   that exists (and links `assets/css/ui.css` in `<!-- MM:STYLES -->` once it exists). Then `node tools/build.js --check`.
3. A new file name that is not in the contract: ask CORE (append to `notes/REQUESTS.md`) to add it to `PLANNED`.
Files above baseline.js in the order must not touch baseline globals at load time.

## MM API (contract + exact additions)
Contract names are implemented exactly (`MM.version='0.2.0'`, bus, settings, state, isPaused, hooks, camera, save, game, input.block).
**Additions beyond the contract** (all optional to use):
- `MM.bus.once(name, fn)`, `MM.bus.count(name)`, wildcard `MM.bus.on('*', (data, name) => …)`. Listener signature is `(data, name)`.
- `MM.storage` `{available, get, set, remove}` — localStorage with in-memory fallback (never throws).
- `MM.settings.set({k: v, …})` (batch), `MM.settings.schema`, `.presets`, `.defaults()`. Invalid keys/values are rejected (returns false, warns).
  `'settings'` payload: `{key, value, changed:[keys], all:{…}, audio:{master,music,sfx,cine}}` (audio.js reads `.audio`).
  Quality presets: low = softFilter off / bloom off / particles low; medium = low/low/medium; high = medium/high/high.
  Setting quality to a preset rewrites those three; changing one of them recomputes quality (`custom` if no preset matches).
  `reducedMotion` defaults to `prefers-reduced-motion` on first run.
- `MM.state.list`, `MM.state.data` (data passed to the last `go`), `MM.state.since`. `go()` returns false for unknown or same state.
- `MM.input.isBlocked()` (= block flag || paused), `MM.input.touch(pointerId, dir|null)` (on-screen pad → baseline `touchDirections`),
  `MM.input.action(name)` for `cast broom tend potion bomb spell1..spell5` (ignored while blocked). `MM.input.block(true)` also clears held keys.
- `MM.hooks.run(name, …args)` (custom hook names allowed), `MM.hooks.count(name)`, `MM.hooks.names`.
  Order: **lower priority runs first** (draw hooks: higher priority paints on top). Errors are caught and logged (3× per listener, then silent).
- `MM.camera.focused` (getter), `MM.camera.focusPoint(dt)` (used by baseline), `MM.camera.snap()` (snap to player after teleports).
  Shake: amplitude × `shakeScale()`, quadratic decay on wall-clock time (settles even while paused), clamped ±16 px, integer translate.
- `MM.save.whyNot()` → '' or reason (`no-game`, `state:<s>`, `dead`, `danger`, `not-ready`), `MM.save.status()` → `none|ok|v1|backup|corrupt|newer`,
  `MM.save.sections()`, `MM.save.lastResult`, events `save:load`, `save:error` `{reason:'corrupt'|'newer'|'section', …}`, `save:erase`, `save:import`.
- `MM.game.active` (true after newGame/continueGame until toTitle), `MM.game.handleDeath()` (called by baseline), `MM.game.unsafeReason()`.
- `MM.legacyUI = false` (baseline sidebar DOM writes off), `MM.baselineDraw = {damageNumbers:true, labels:true}` — FX/UI set these false
  to take over canvas damage numbers / boss name / P2 / DUMMY labels. Damage numbers are also gated by `settings.damageNumbers`.
- `MM.boot.toast(text, kind)` (uses `MM.ui.toast` when present), `MM.boot.layout()` → `{scale,width,height,integer,dpr}`; bus `layout`, `boot`.
- Bus events from core: `state`, `settings`, `save`, `save:*`, `game:new`, `game:continue`, `game:title`, `respawn {goldLost}`,
  `camera:focus`, `input:block`, `layout`, `boot`.

### Save details
Key `moss-moon-save-v2` (+ `-bak` rolling backup of the previous good save, `-corrupt` copy of a damaged one). Envelope
`{v:2, app, version, savedAt, reason, sections:{world, player, look, meta, campaign, …}}`. Sections apply in order world → player → look → meta → others
(registration order). A section's `set()` that throws is reset (others still load) and `save:error {reason:'section'}` fires.
Data for sections whose module is not loaded is kept and re-saved untouched; a module registering *after* `load()` gets its data on registration.
Load fallback chain: primary → backup → v1 key `moss-moon-adventure-v1` (+ `moss-moon-look`), the v1 key is never deleted except by `erase()`.
Baseline registers `world` (`{...world}` sanitised on load), `player` `{x,y,mounted,facing,spell}`, `look` (`chosenLook`); core registers `meta` `{name, createdAt, playTime}`.
`save()` refuses (unless `{force:true}`) when no game is active, in states boot/title/creation/cine/loading/defeat, at 0 HP, or with a living enemy within 3 tiles.
Storage unavailable/quota → `MM.save.available === false`, saves go to memory for the session (`'save'` event has `persisted:false`).

### Game flow
- `MM.game.newGame({name, look, cls, startCampaign})`: resets every section (world reset = baseline `newAdventure()`), applies name/look, sets
  `active`, enters `'play'`, emits `game:new`, then force-saves. It does **not** start the story: the caller (UI creation screen) calls
  `MM.campaign.start()` — or passes `{startCampaign:true}` (boot.js fallback title / `#mm-new` do that).
  UI should not call `MM.state.go('play')` after newGame/continueGame (they do it; campaign may already have moved to `'cine'`).
- `continueGame()` → `{ok, reason?, restored?, migrated?}`, enters `'play'` on success. `toTitle()` saves if safe, `active=false`, `'title'`.
- Death: baseline `resetPlayer()` emits `death`, then `MM.game.handleDeath()` sets HP 0 and enters `'defeat'` with
  data `{region, mode, floor, goldLoss}`. The defeat screen calls `MM.game.respawnHome()` (15% gold, max 25; `{goldLoss}` overrides;
  `{resume:false}` keeps the state) which teleports home, restores HP/mana, emits `respawn`, goes to `'play'` and force-saves.
  Without `MM.ui`, boot.js shows a fallback "Moonlit Recovery" overlay and respawns after 2.5 s.

## Baseline seams (grep `MM seam`)
S0 helpers (`uiEl`, `mmEmit`, `mmHook`, `mmPaused`, `mmInputBlocked`, `mmSetting`, `mmArt`). S1 null-safe DOM + per-frame sidebar writes gated by `MM.legacyUI`.
S2 sim loop frozen per substep while paused; keydown / canvas pointerdown / pad pointerdown ignored while `MM.input.isBlocked()` **or `e.defaultPrevented`**
(a module can claim a key/click during play by calling `preventDefault()` in an earlier/capture listener).
S3 hooks: preUpdate, postUpdate (per ≤1/60 s substep), preDraw, drawGround, drawables (+ `{type:'custom',x,y,depth?,draw(ctx,pos,item)}`), light (return true
to replace the night tint), postEffects, overlay (screen space, unshaken), postDraw.
S4 events: `cast {actor,spell,target}` (also bomb), `hit {target,amount,color,source,boss}`, `kill {enemy,source,boss}`, `boss {phase:'spawn'|'defeated',enemy,restored?}`,
`pickup {type,amount,item,actor}`, `levelup {level}`, `plant {plot,seed}`, `water {plot}`, `harvest {plot,seed,amount,mutated}`, `quest {requests}`, `region {id}`,
`dungeon {mode,floor,boss?,modifier,region}`, `day {day,season,weather}`, `raid {day,night}`, `hurt {amount,from}`, `death {region,mode,floor}`,
`mount {kind:'mount'|'land',phase:'start'|'end',mounted?}`, `message {text}` (suppressed during load/new-game restores), `save` (from MM.save).
S5 art override via `MM.art` (anchor = foot): props `p.draw(ctx,pos,p)` → `p.art` → `prop_<type>_<variant>` → `prop_<type>`; cast sprites
`cast_<kind>_<idle|walk>_<DIR>` → `cast_<kind>` (frame passed); `plot_wet|plot_dry`, `crop_<seed>_<0..4>`, `ward_<power>|ward`,
`block_<region>_<variant>|block_<variant>|block`, `loot_<type>`. None of these names exist yet, so visuals are unchanged until art provides them.
S6 camera: follow rate `MM.camera.follow`, velocity look-ahead `lookAhead`, `focus()` target; shake = integer `ctx.translate` around world layers.
S7 particles: count × `particleScale()`, cap 220 × scale, bursts capped too. S8 save routing + `newAdventure(cls)`, `restoreAdventure()`, `respawnAtHome(goldLoss)`, `sanitizeWorld()`.
Baseline bug fixes: night raid keyed by night (§9 #2), companions have their own mana (#3), defeated boss floor doesn't respawn its boss on load and loaded
gear/equipped/mode/floor/modifier/skills/wards/plots/numbers are validated (#14). Pointer mapping (#19) is correct because the canvas box is exactly the
letterboxed stage (no object-fit) — verified by test. Baseline's own 8 s autosave is off with MM (boot.js autosaves every 30 s of play, or ~6 s after
levelup/quest/region/dungeon/day/fragment/restored/chapter, only at safe moments; also on tab hide / pagehide).

## Page shell
Stage 8:5, letterboxed on dark moss; boot.js sizes it to an integer **device-pixel** scale when ≥2× fits, else fractional; CSS var `--mm-scale`,
`--mm-text-scale` (from settings), `html[data-reduced-motion]`, `[data-reduced-flashes]`, `[data-quality]`. Safe-area insets padded on `#mm-app`.
`#mm-fx` z-index 50 (cinematics/fx canvases go inside it, pointer-events none), `#mm-ui` z-index 100 with `pointer-events:none` —
UI elements must opt in with `pointer-events:auto` (full-stage wrappers must NOT, or they swallow canvas clicks).
`#mm-stage` and `#mm-ui` are `overflow:clip` and boot.js pins their scroll to 0,0: focusing overflowing UI content once scrolled the
stage by ~6000 px, moving the canvas out from under the pointer. Body has `touch-action:none` / no overscroll; no canvas focus ring during play.

## Diagnostics `window.__mm` (tests/automation)
`getState()` (state, paused, active, elapsed, x, y, region, mode, floor, day, time, hp, mana, gold, level, enemies, boss, saveStatus, layout…),
`setState(name,data)`, `newGame(opts)`, `continueGame()`, `toTitle()`, `world()`, `game()` (live baseline objects), `setWorld(patch)`,
`teleport(x,y)`, `give(item,n)` (`gold potions bombs runes points stars hp mana xp`, `seed:<id>`, `harvest:<id>` or a crop id; else `MM.campaign.give`),
`heal()`, `killAll()`, `spawn(type,n,boss)`, `region(id)`, `dungeon(rift)`, `nextFloor()`, `step(n,dt,force)` (synchronous sim steps; respects pause unless force),
`events(name?)` / `clearEvents()` (last 400 bus events), `errors()`, `save(force)`, `load()`, `layout()`, `canvasColors()`.
URL hash autostart: `#mm-new` (new game), `#mm-continue` / `#mm-play` (continue, else new).

## PHASE 3 additions (notes/PHASE3_CONTRACT.md "CORE additions") — final API
**States:** `boot logo intro title creation tutorial play interior menu dialogue cine defeat ending loading` (`title` = main menu, `menu` = pause).
Default policies (override with `MM.screens.register`, which merges over them):
| state | sim | draw | | state | sim | draw |
|---|---|---|---|---|---|---|
| boot/logo/intro/title/creation | none | none | | menu | none | frozen |
| tutorial, play | world | world | | dialogue, cine, ending | none | world |
| interior | player | custom (falls back to `world` until a `render` is registered) | | defeat, loading | none | frozen |

- `MM.isPaused()` = current `sim === 'none'`. `MM.input.isBlocked()` = `MM.input.block()` flag || paused → baseline keys/pointer/axis ignored.
- `MM.state.go(name, data)`: `prev.exit(next)` → `prev.cleanup()` → release everything prev registered via `MM.screens.listen/timeout/interval/mount`
  → policy (`#scene` `visibility:hidden` for draw `none`; frozen snapshot; sim `none` clears keys/click target/axis and stops every `MM.audio` loop;
  `def.audio` `{music, ambience, keep, fade}` applied via `MM.audio.music/ambience` unless `keep`) → `next.enter(data, prev)` → bus `'state'` `{from,to,data}`.
  `go()` called inside exit/cleanup runs right after the transition; `go()` inside enter (redirect) runs nested, and `'state'` events are still emitted in order.
  Unknown/same state → false. Resources registered while state X is current belong to X (including during X's enter).
- `MM.screens`: `register(name, {sim, draw, audio, enter, exit, update(dt), render(ctx,w,h), resize(w,h,dpr), cleanup})`, `current`, `def(name?)`,
  **extras** `sim()`, `drawMode()`, `states`, `stats()` → `{listeners, timers, mounts, listened, released, timersMade, timersCleared, mounted, unmounted, transitions, canvases}`.
  `listen(target,type,fn,opts)` → off(); `timeout(fn,ms)` / `interval(fn,ms)` → `cancel()` (with `.id`); all auto-cleared on exit.
  `mount(name, {w=512, h=320 | 'stage', pixelated=true, layer='screens'|'fx'|'ui'})` → `{canvas, ctx, destroy()}`; canvas class `mm-screen-canvas`,
  CSS-stretched to the stage; `w:'stage'` = stage CSS px × dpr, resized on layout. Destroyed on exit.
  `render` gets: draw `custom` → `#scene` ctx (instead of baseline draw); `world`/`frozen` → `#scene` ctx after the world (overlay);
  `none` → the ctx of the screen's last mounted canvas (or null). `resize(w,h,dpr)` is called on every stage layout change (bus `layout`).
- `MM.loop`: the ONE rAF (started by baseline via `MM.loop.attach({simulate, draw})`; baseline never calls rAF itself when MM exists).
  Frame: `onTick` fns → gamepad stick poll → `def.update(dt)` → baseline `simulate(min(raw,.2), sim)` (≤1/60 substeps) unless sim `none` → render per draw policy.
  `dt` wall clock clamped ≤0.1; reset on visibility change (no spike). `onTick(fn)` → off. `stats()` → `{rafs, frames, running, dt, foreign, peak, ticks}`;
  every other `requestAnimationFrame` call is counted as `foreign` (rafs = 1 + foreign last frame); `resetPeak()`; `start()/stop()`.
- `sim:'player'`: baseline `update()` runs input → movement → animation → camera; skips `updateCombat` (only cooldowns tick) and `updateWorld`
  (enemies, farm, raids, clock, particles, familiar, baseline autosave). `preUpdate`/`postUpdate` hooks still run — check `MM.screens.sim()`.
- Collision hook (extra): `MM.hooks.on('blocked', (x, y) => true|false)` — consulted by baseline `blockedAt()` for every actor move (buildings, interiors).
- `MM.input`: `axis` {x,y} (screen space, |v|≤1), `setAxis(x,y,source)` (`'touch'|'gamepad'|'keyboard'`), `axisSource`, `method` (`keyboard|touch|gamepad`,
  bus `input:method`), `setMethod(m)`, `glyph(action)` for `move cast interact broom potion pause confirm back tend inventory map spells click`
  (keyboard 'E'/'Space'…, touch 'Tap ✦'/'Joystick'…, gamepad 'A button'/'Left stick'…), `glyphs` table, `touchControls()` → resolved bool
  (`auto` = `(pointer: coarse)` or a touch/pen pointerdown seen; bus `input:touch` on first touch). Baseline `readInput` consumes the axis after keys
  (0.15 deadzone, analog speed). Gamepad: CORE maps only the left stick → axis (0.2 deadzone); buttons stay with the UI input module.
  `MM.input.touch()` (d-pad) was **removed**, as was baseline's `[data-dir]` pad.
- Settings added: `joystickSize` 0.8–1.4 (1), `joystickSide` left|right (left), `joystickMode` floating|fixed (floating), `haptics` (true), `fxIntensity` 0.5|1|1.5 (1).
- Page: `<div id="mm-screens">` between `#scene` and `#mm-fx`, z-index 40, `pointer-events:none` (screens listen on window/document via `MM.screens.listen`).
- boot.js: calls `MM.flow.start()` when present (else enters `title` with the fallback overlay); `#mm-new/#mm-continue` bypass the flow.
  Tab hidden or Esc (fallback) pauses from `play|interior|tutorial` with `MM.state.go('menu', {screen:'pause', reason, resume: from})` — resume to `data.resume`.
  DPR changes re-run the integer-scale layout. Save refused in `logo intro title creation tutorial cine loading defeat boot` (tutorial = sandbox).
- `tools/build.js` PLANNED (load order): data → legacy-shim → mm → audio → art → cinematics (config, system) → campaign config → regions-visual → **baseline**
  → buildings.js, tutorial.js (config) → bosses → campaign → world-render → interiors, interior-render → lighting, fx, filter → UI files (MANIFEST or default
  incl. `ui-joystick.js`) → `src/screens/flow, logo, title, intro, tutorial` → boot.js. Styles: `assets/css/ui.css`, `assets/css/screens.css`.
- `__mm` extras: `loop()`, `screens()`, `listeners()`.
- Tests: `node tests/core-phase3-test.js` (39 checks: lifecycle order, release counters, deferred/redirect ordering, isPaused per state, audio policy, settings,
  axis/glyph/method; browser: no sim/draw in logo/intro/title/creation, sim 'player', frozen draw, deadzone, gamepad stick, mount, 50× round trips with zero
  listener/timer/mount/canvas/bus leaks, rafs===1 settled, full page rafs===1). Smoke now expects a front-end state (logo/intro/title) and checks `#scene` hidden + frozen.
  Results 2026-10-30: core-test 85/85, core-phase3-test 39/39, smoke index 23/23, smoke build 23/23 (0 console errors). A mutation (title sim→world) fails 4 phase-3 checks.

## Tests
- `node tests/smoke.js [index.html|builds/moss-moon-v0.2.0.html] [shot.png]` — 22 checks: title reached, canvas non-uniform (title+play),
  59 legacy ids, newGame→play, frames advance, keyboard moves the witch, pause freezes `game.elapsed` and blocks keys, resume, save/load
  round trip (gold, potions, position), corrupt primary → backup restored, total corruption → safe failure while the game keeps running,
  v1 migration (with sanitising of a junk gear entry and an out-of-range `equipped`), settings validation/presets/persistence across reload,
  save persists across reload, zero console errors.
- `node tests/core-test.js [--unit-only]` — 85 checks: Node-vm unit tests of mm.js (bus, settings, state, hooks, camera, save envelope,
  sections, late registration, unknown-section passthrough, failing section isolation, newer-version refusal, import/export, v1 migration,
  storage unavailable) + browser: baseline alone with no MM/no shim (S1 null safety, seams no-op, legacy v1 save), baseline+shim without MM,
  layout+click-to-move mapping at 1280×800 (integer 2×), 700×1000, 1500×520, 390×844, hooks/custom drawables, cast/hit/region/kill events,
  night-raid fix, P2 mana, particle cap, shake, death→defeat→respawnHome, defeated boss floor not respawned after reload, preventDefault key
  claiming, `MM.input.block`, legacy DOM writes gated, no-UI fallbacks (title/pause/defeat/toTitle), tab-hide pause, 30 s sim autosave,
  single-file build boots, `--check` passes, `builds/baseline` untouched.

### Test log (2026-10-29, Chromium headless via Playwright, with every module on disk at the time loaded)
- `node tests/core-test.js` → `{"pass":true,"total":85,"failed":[]}`
- `node tests/smoke.js index.html` → pass, 22/22 checks, 0 console errors.
- `node tests/smoke.js builds/moss-moon-v0.2.0.html` → pass, 22/22, 0 console errors.
- `node tools/build.js` → `builds/moss-moon-v0.2.0.html` (~1.6 MiB, all scripts inlined), `builds/LATEST.txt` written; `--check` ok.

## Known issues / notes for others
- `MM.input.pressed(action)` (optional in the contract) is not implemented; use `MM.input.action(name)` / `MM.input.touch()`.
- The S5 art names (`prop_*`, `cast_*`, `plot_*`, `crop_*`, `ward*`, `block*`, `loot_*`) don't exist in the atlas yet, so the baseline
  still draws its procedural art; props can also carry `art:'tree_oak_0'` or a `draw(ctx,pos,p)` function.
- Requests filed for UI in `notes/REQUESTS.md` (title sky layer stays over the canvas when a game starts outside the UI flow).
