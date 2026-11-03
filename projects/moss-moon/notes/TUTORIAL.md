# Moss & Moon — Interactive tutorial (owner: TUTORIAL)

Files: `src/config/tutorial.js` (MM.TUTORIAL data, registers baseline `REGIONS.tutorial`), `src/screens/tutorial.js`
(state `tutorial` + MM.tutorial), `tests/tutorial-test.js`. Both scripts are in index.html via `node tools/build.js --sync`.

## Flow
- New game: `MM.flow.afterCreation()` → `MM.game.newGame()` → (tutorialDone false) `MM.flow.startTutorial({from:'new'})` → state `tutorial`.
  Replay: title "Tutorial" / pause "Replay Tutorial" → `MM.flow.startTutorial({replay})`.
- Finish (celebration panel → "Begin the journey") → `MM.flow.finishTutorial({skipped:false})`; Skip → MM.ui.confirm → `finishTutorial({skipped:true})`.
  Both persist `tutorialDone` (MM.flow owns storage). Leaving any other way (quit to title from pause, new game…) = abort: world restored, flag untouched.

## Sandbox (real world never touched, never saved)
- On start: `world` binding is swapped for a practice copy (region `tutorial`, one plot, seeds 3 wheat, 1 potion, daylight, no wards/raids);
  `enemies lootDrops allies party particles bursts dungeonBlocks` swapped for empty arrays; `effects/numbers` stashed; `game`, `dummy`,
  `spellIndex`, `castCooldown`, familiar position snapshotted. On end everything is put back (game/dummy in place; world JSON re-checked).
- While alive (also in `interior`/`menu`/`dialogue` entered from the tutorial) `MM.save.save` refuses (`lastResult.reason='tutorial'`)
  and `MM.save.whyNot()` returns `'tutorial'`. Interiors' practice hut is `persist:false` (TEMP store, reset per run).
- Baseline farming/dummy are grove-only: in the yard `tendPlot` runs with the region presented as `grove` for the synchronous call,
  `spellTarget` returns the dummy, and plot + dummy are pushed through the `drawables` hook. Dummy moved to (12.8, 8.6) while in the yard.
- Safe practice: no enemies, HP never drops below half (except the scripted potion lesson), dummy refills, mana refilled per step.

## Lessons (one objective at a time; verified by events/state, never timers)
| # | id | completes when |
|---|---|---|
| 1 | move | player ≥1.5 tiles from the step's start (keys / joystick axis / click-to-move) |
| 2 | sign | bus `interact` id `tutorial_sign` (MM.world; sign opens a dialogue) |
| 3 | enter | state `interior` with `MM.interiors.current==='practice_hut'` |
| 4 | exit | back in state `tutorial`, outside |
| 5 | plant | bus `plant` on the yard plot and plot.seed set |
| 6 | water | bus `water` and plot.watered |
| 7 | harvest | framed "moon-quick" magic growth (visible ~1.5 s ripening) then bus `harvest` |
| 8 | cast | bus `cast` (actor=player, target=dummy) followed by a dummy hit / HP drop |
| 9 | potion | potions decreased and HP increased (or bus `potion`) |
| 10 | menu | `MM.ui.isOpen('inventory')` seen, then back to state `tutorial` with no UI open |
| 11 | broom | bus `mount` end mounted, then landed |
Early actions: plant/water already done when the prompt appears → auto-satisfied (toast "Already done"); event-only steps (sign, cast, menu)
must be redone during their step; missing resources are refilled when a step begins. **Reset step** button: respawns/refills the step's
targets (replant/clear plot, potion=1 and low HP, dummy full, mana full, leaves the hut, teleports beside the target).

## Presentation
HUD `.mm-tut` (DOM in #mm-ui, moonlit tokens from ui.css): step n/N + progress bar, title, objective, control hint with
`MM.input.glyph()` per method (updates on `input:method`), Reset + Skip buttons (keyboard focusable, visible focus; mouse clicks blur so
Space keeps casting). Landscape: top-right under the clock; portrait: just above the stage. Hidden in menu/dialogue.
World highlight via `MM.hooks` overlay: pixel ring + bobbing arrow (edge-clamped); move step shows the distance ring. Touch: the matching
action button (Use/Cast/Potion/Pause/Broom) gets `.mm-tut-glow`. Success: toast + `ui_select` + `MM.fx.burst`; finish: `quest_complete`,
burst, modal panel with an MM.art sprite, input blocked until "Begin the journey".

## API
`MM.tutorial.{start(opts), active, index, step, reset(), skip({confirmed}), finish(), target(), stats(), _debug}`; bus `tutorial:start|step|reset|complete|end`.

## Tests
`node tests/tutorial-test.js` (54 checks; screenshots tests/out/tutorial-*.png). 2026-11-02: pass 54/54, plus screens-test 60/60,
interior-test pass, smoke 23/23, core-phase3 39/39.
