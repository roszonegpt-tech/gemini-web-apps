# Next Build — Installable App, Balance From Data & Device Verification

## Starting Point
Project: Riftbound: Spellfire & Steel
Starting build: v1.4.0-beta
Target version: v1.5.0-beta
Output filename: `dist/index.html` (plus `dist/releases/riftbound-v1.5.0-beta.html`)
Read first: `STATE.md`, `README.md`, `architecture.md`, `CHANGELOG.md`, `BUGS.md`, `TESTING.md`, `notes/design-notes.md`, `notes/playtest/README.md`
Previous prompts: `PROMPT.md` (v1.0.0-gold), `prompts/archive/v1.1.0-beta.md` … `prompts/archive/v1.4.0-beta.md`

## Goal
Main task: Make the game installable on phones (home-screen icon, full-screen, works offline without a server), tune the trials and golem from collected playtest records, and record real-device results.
Expected player-visible result: "Add to Home Screen" gives a full-screen offline app on iPhone and Android; star thresholds that match how people actually play.

## Preserve
Working features: campaign 1–4 + boss, golem segment, three trials + star rewards, landscape and portrait touch layouts, Continue-from-checkpoint, opt-in playtest records + export panel, audio mix (`npm run test:audio` 12/12), save schema `riftbound.save.v1` (frozen keys), the single-file `dist/index.html` that runs from `file://`.
Extension hooks: `World.updaters`, `World.cameraFocus`, `World.mountTarget`, `AudioEngine.registerRecipe()` / `loopVolume`, `UISystem.extraScreens`, `UISystem.openExport()`, `AUDIO_MIX`, `TouchControls.setContext()`, `recordPlaytest()`.

## Required Changes
1. **Installable web app** (`index.html`, new `manifest.webmanifest`, new `sw.js`, `scripts/build.mjs`): web app manifest (name, icons generated as PNG data at build time, `display: fullscreen`, `orientation: any`), a service worker that caches the folder build for offline play, Apple meta tags for iOS home-screen mode. The standalone `dist/index.html` must keep working from `file://` (no service worker there).
2. **Balance from data** (`src/scenes/ChallengeScene.ts`, `src/entities/ArcaneGolem.ts`): only if `notes/playtest/` holds ≥ 10 completed runs per trial from ≥ 3 players — run `npm run playtest:summary`, apply its suggestions where sensible, document before/after and the data in `notes/design-notes.md`. Otherwise change nothing and say so.
3. **Verification** (record in `TESTING.md`; needs real hardware / a person): FPS on a desktop GPU (1080p), iPad and iPhone; Firefox, Safari 14.1+ (macOS + iOS), Edge; portrait + landscape touch play on a physical phone (notch / safe areas, iOS toolbars); real gamepad in golem flight; listening to the mix on desktop and phone speakers.

## Implementation Constraints
Use: existing three.js r162 render loop, Web Audio synth engine, current save keys (add keys only).
Do not use: external physics engines, sample-based audio, network calls (the service worker caches local files only), new heavy libraries.
Work only inside: `index.html`, `manifest.webmanifest`, `sw.js`, `scripts/build.mjs`, `src/main.ts`, `src/scenes/ChallengeScene.ts`, `src/entities/ArcaneGolem.ts`, `notes/`, docs and tests.
Do not change: `src/core/Engine.ts`, `src/audio/AudioEngine.ts`, `src/scenes/World.ts`, save key names, existing asset IDs.
Out of scope: Online multiplayer, cloud saves, app-store packaging, new campaign sectors.

## Acceptance Checklist
- [ ] Lighthouse-style checks: manifest valid, service worker registers on http(s) only, game loads offline after one visit.
- [ ] `dist/index.html` still runs from `file://` and inside the claude.ai artifact.
- [ ] Any balance change cites the playtest records it is based on (or nothing changes).
- [ ] `npm test` and `npm run test:audio` pass.
- [ ] Test results distinguish verified and unverified behaviour.
- [ ] New versioned build v1.5.0-beta is compiled and saved (bump `package.json` **before** building).

## Documentation Updates
- progress.md, CHANGELOG.md, TESTING.md, BUGS.md, STATE.md / TODO.md / VERSION.md
- prompts/next-build.md (archive this file to `prompts/archive/v1.5.0-beta.md` first)

## Handoff
Completed: v1.0.0-gold campaign + boss; v1.1.0-beta golem segment + trials; v1.2.0-beta swept collision, golem audio, measured mix; v1.3.0-beta mobile touch controls, phone landscape, Continue, playtest records; v1.4.0-beta portrait-phone layout, export panel, overlay keep-out, playtest summary tool.
Tested (automated, headless Chromium with emulated touch): full regression 24/24 on folder and standalone builds, portrait and landscape layouts, export panel, audio targets 12/12.
Not tested: physical phones/tablets, real GPUs / FPS, Firefox / Safari / Edge, gamepads, the mix by ear, human balance (no playtest records yet).
Known issues: see `BUGS.md` (#12/#13 balance needs data; #19 smaller HUD on short phones; #23 small view in portrait; #24 portrait touch auto-detection).
New build: v1.5.0-beta
Next focused task: Installable offline web app, then the balance pass if records exist.

## Required Output
Return the complete updated project files, versioned build, change summary,
test results, known issues, and updated next-build prompt.
