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
  `active`, enters `'play'`, emits `game:new`, **then calls `MM.campaign.start()` if it exists** (UI must not call it again), then force-saves.
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
`#mm-fx` z-index 50 (cinematics/fx canvases go inside it, pointer-events none), `#mm-ui` z-index 100 (children get pointer events).
Body has `touch-action:none` / no overscroll; the canvas has no focus ring during play.

## Diagnostics `window.__mm` (tests/automation)
`getState()` (state, paused, active, elapsed, x, y, region, mode, floor, day, time, hp, mana, gold, level, enemies, boss, saveStatus, layout…),
`setState(name,data)`, `newGame(opts)`, `continueGame()`, `toTitle()`, `world()`, `game()` (live baseline objects), `setWorld(patch)`,
`teleport(x,y)`, `give(item,n)` (`gold potions bombs runes points stars hp mana xp`, `seed:<id>`, `harvest:<id>` or a crop id; else `MM.campaign.give`),
`heal()`, `killAll()`, `spawn(type,n,boss)`, `region(id)`, `dungeon(rift)`, `nextFloor()`, `step(n,dt,force)` (synchronous sim steps; respects pause unless force),
`events(name?)` / `clearEvents()` (last 400 bus events), `errors()`, `save(force)`, `load()`, `layout()`, `canvasColors()`.
URL hash autostart: `#mm-new` (new game), `#mm-continue` / `#mm-play` (continue, else new).

## Tests
See the "Test log" section at the end (updated with real results).
