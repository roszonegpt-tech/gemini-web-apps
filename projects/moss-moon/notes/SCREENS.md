# Moss & Moon — Screens (logo, intro, main menu) and MM.flow

Owner: SCREENS. Files: `src/screens/flow.js` (MM.flow + `MM.flow.kit` helpers), `src/screens/logo.js`, `src/screens/title.js`,
`src/screens/intro.js`, `assets/css/screens.css`, `tests/screens-test.js`. Contract: `notes/PHASE3_CONTRACT.md` "SCREENS".

## Flow
```
boot → MM.flow.start() → logo → (first run: intro) → title
title: Continue → play · New Game → [confirm if a valid save exists] → creation → MM.flow.afterCreation(name, look)
       → MM.game.newGame → first time: tutorial (campaign.start deferred until finishTutorial) · else campaign.start → play
       Tutorial → tutorial (from:'title' → back to title) · Replay Intro → intro({replay}) → title
       Memories / Settings / Controls / Credits → MM.ui panels over the title (state stays 'title')
```
`MM.flow`: `start() toLogo() afterLogo() toIntro({replay}) afterIntro(r) toTitle() newGame({confirmed}) afterCreation(name,look)
continueGame() startTutorial({replay,from}) finishTutorial({skipped,aborted}) toGame() tutorialAvailable() saveInfo() flags()
setFlag(k,v) resetFlags()`. Flags in `MM.storage` key `moss-moon-flow-v1` = `{introSeen, tutorialDone}` (not in the game save).
`introSeen` is set when the intro ends or is skipped; `tutorialDone` only by `finishTutorial()` without `{aborted:true}`.
`saveInfo()` → `{valid, status, summary, reason}`; `corrupt`/`newer`/`none` → Continue disabled with the reason shown under it.
Never overwrites a save without confirmation (`MM.ui.confirm`, or a built-in accessible modal when MM.ui is missing).
Bus events: `flow`, `flow:flags`, `flow:intro`, `flow:newGame`, `flow:tutorial`, `flow:continueFailed`, `logo:end`, `intro:end`, `title:ready`.
Hash shortcuts (tests): `#mm-title`, `#mm-intro` (`#mm-logo` = default). CORE's `#mm-new`/`#mm-continue` bypass flow.

## Screens (all `sim:'none', draw:'none'`; resources via `MM.flow.kit.session()` → `MM.screens.listen/timeout/mount`, released on exit)
- **logo** (~7.4 s, reduced motion 5.2 s): back pixel canvas (dithered night sky, twinkling stars, crescent moon that lights up with halo
  and god-rays, drifting mist, motes at 3 depths, fern/grass/hanging-moss silhouettes) · SVG wordmark "MOSS & MOON" (letters rise in one by
  one, glow, light sweep, pulse; crisp at any size) · front pixel canvas (moss vines grow along the baseline and climb the M, S and N, leaves
  pop, moss tufts settle on letter tops, flowers bloom at the pulse, near motes, front foliage) · fade from/to darkness, parallax push-in.
  Skip: visible focusable button, Space/Enter/Esc, click/tap anywhere. Reduced motion: static composition dissolving in, no parallax/twinkle/sweep.
  Audio: screen policy `music:'title'` (starts on the first user gesture via MM.audio's unlock; nothing depends on autoplay); one
  `moonwell_pulse` sfx at the pulse if audio is running.
- **intro**: hosts `MM.cine.play('intro', {skippable, force, replay})`; persistent "Skip intro [Esc]" button in `#mm-ui` (z 100, above
  the cinematic) — the cinematic's own hover-revealed skip button is hidden while `html.mm-scr-intro` is set. Captions, reduced motion,
  resize and tab visibility come from MM.cine (driven by MM.loop). Leaving the state early skips the cinematic cleanly.
- **title**: own animated backdrop on a mounted 512×320 canvas — sky, stars + shooting star, moon, drifting clouds, hills, two tree lines,
  mist bands, meadow with the lit cottage (MM.art `cottage_lush`), lamp post, the glowing Moonwell (`moonwell_restored`) with its light
  beam and rising motes, moonflower beds, fireflies (`mote_firefly`), chimney smoke, foreground branch/grass, vignette; mouse parallax.
  MM.art sprites are re-lit for night by `kit.night()` (albedo darkened toward moonlit blue, emissive palette colours Y/O/z/L/i kept and
  bloomed) — sprite styles are untouched; procedural fallbacks if MM.art is missing. Menu: Continue (+ name · Lv · Day, chapter, saved
  time), New Game, Tutorial, Replay Intro, Memories, Settings, Controls, Credits. Arrows/WASD (spatial), Enter/Space, Esc (focus default),
  Tab trapped in the menu, mouse hover focuses, touch, gamepad (d-pad/stick + A, polled in update). ≥44 px targets, gold focus ring.
  Layouts by stage size (container queries): two columns; compact (≤360 px tall); tiny (≤280 px, portrait phones: brand on top,
  full-width 2+3-column menu). `--mm-text-scale` scales the menu. A blurred copy of each screen fills the letterbox (`.mm-scr-ambient`).
- UI panels over the title: `kit.keepState()` temporarily marks the opened UI screen `state:'keep'` so `MM.ui.syncState()` does not switch
  to `'menu'` (see REQUESTS SCREENS→UI #2; harmless once UI handles sim:'none' states itself).

## Tests — `node tests/screens-test.js [--quick] [--no-shots]` (≈3 min, 60 checks, all passing 2026-11-01)
First run logo→intro→title sequence; for logo, intro and title: `game.elapsed`, `world.time`, player and enemy positions unchanged over 3 s
while D+S are held, `#scene` hidden and its pixels unchanged; logo skip at 0.15/1.2/2.6/4.2/6.0 s via Enter/Esc/click/button/Space;
replay intro 10× (button/Esc/`MM.cine.skip`); 30 logo→intro→title round trips: listeners added from `src/screens/*` (instrumented),
`MM.screens.stats()` live listeners/timers/mounts, canvas and screen-node counts back to baseline, `MM.loop.stats()` rafs 1 / peak 1 / foreign 0;
title keyboard nav without moving the witch; Continue disabled/enabled with summary; corrupt save explained; New Game confirm (cancel keeps
the save, confirm → creation, save intact until creation completes); Continue → play (sim resumes); Settings over title keeps state and
returns focus; reduced motion (calm logo, no parallax, static title sky); 390×844, 844×390, 1280×800, 1920×1080, 1280×800@2 layout
checks (8 buttons ≥44 px, in view, no brand/menu overlap, no scrolling) + live resize; textScale 1.5.
Screenshots: `tests/out/screens-*.png` (logo 1/2/3, intro 1/2, title desktop/phone/phone-land/fullhd/dpr2/with-save/confirm/settings/
corrupt/reduced-motion/textscale, logo phone) — reviewed visually.

## Known issues / notes
- Portrait phones: `#mm-stage` still has `contain: layout paint` (UI asked CORE to drop it), so the title lives inside the 390×244 stage
  (tiny layout); the letterbox bands show the blurred ambient fill only.
- During the very first intro start the loop's foreign-rAF peak briefly read 2 (not from src/screens — no rAF/setInterval there);
  the 30-transition run measures rafs 1 / peak 1.
- Tutorial button is disabled ("not available in this build") until TUTORIAL registers a real `tutorial` screen (`def.enter`).
- Credits text is owned by UI; the Sprite Fusion VFX credit line is requested there (REQUESTS) and present in the built-in fallback.
