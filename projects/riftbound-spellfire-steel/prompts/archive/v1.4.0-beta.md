# Next Build — Playtest-Driven Balance, Portrait Phones & Device Verification

## Starting Point
Project: Riftbound: Spellfire & Steel
Starting build: v1.3.0-beta
Target version: v1.4.0-beta
Output filename: `dist/index.html` (plus `dist/releases/riftbound-v1.4.0-beta.html`)
Read first: `STATE.md`, `README.md`, `architecture.md`, `CHANGELOG.md`, `BUGS.md`, `TESTING.md`, `notes/design-notes.md`, `src/ui/TouchControls.ts`, `src/scenes/ChallengeScene.ts`
Previous prompts: `PROMPT.md` (v1.0.0-gold), `prompts/archive/v1.1.0-beta.md`, `prompts/archive/v1.2.0-beta.md`, `prompts/archive/v1.3.0-beta.md`

## Goal
Main task: Tune the Challenge Trials and the golem segment from exported playtest records, make the game playable on phones held upright, and close the device-verification gap.
Expected player-visible result: Star thresholds that feel fair to real players, a portrait layout on phones instead of a "rotate your device" hint, and exports that work inside the claude.ai artifact.

## Preserve
Working features: Campaign sectors 1–4 + boss, ground spellcasting + combos, Arcane Ward, Vanguard AI, Sector 2 golem flight segment (swept collision, engine/beam audio), the three Challenge Trials and star → shard conversion, v1.3 context-aware touch controls, phone-landscape layout, Continue-from-checkpoint, opt-in playtest records, the audio mix (`npm run test:audio` must stay 12/12), LocalStorage save schema (`riftbound.save.v1`, frozen key names).
Existing controls: keyboard/mouse, gamepad, touch (left-handed + size presets).
Extension hooks to keep using: `World.updaters`, `World.cameraFocus`, `World.mountTarget`, `AudioEngine.registerRecipe()` / `loopVolume`, `UISystem.extraScreens`, `AUDIO_MIX`, `TouchControls.setContext()`, `recordPlaytest()`.

## Required Changes
1. **Balance from data** (`src/scenes/ChallengeScene.ts`, `src/entities/ArcaneGolem.ts`): load exported playtest JSON files placed in `notes/playtest/` (create the folder), summarise them with a script in `tests/` (median / quartiles per trial and per golem metric), and tune `TRIALS` star thresholds and `GOLEM` numbers from that summary. Document data, method and before/after values in `notes/design-notes.md`. With no data files, change nothing and say so.
2. **Portrait phones** (`src/ui/TouchControls.ts`, `src/systems/UISystem.ts`, `assets/css/style.css`): a portrait layout (HUD stacked at the top, sticks and buttons in the lower half, camera zoomed out) instead of the rotate hint; keep landscape unchanged.
3. **Artifact-friendly exports** (`src/game.ts`, `src/systems/DevTools.ts`): when downloads are blocked, fall back to a copyable text panel for playtest records and save exports (BUGS #22).
4. **Overlay margins** (`src/ui/Overlay2D.ts`): keep off-screen objective labels clear of the touch-mode objectives box and gauges (BUGS #21).
5. **Verification** (record in `TESTING.md`; needs real hardware / a person): FPS at 1080p on a desktop GPU, iPad and iPhone; Firefox, Safari 14.1+ (macOS + iOS), Edge; v1.3 touch controls on physical phones (both hands, all size presets); a real gamepad in golem flight; listening to the mix on desktop and phone speakers.

## Implementation Constraints
Use: existing three.js r162 render loop, Web Audio synth engine, current save keys (add keys only).
Do not use: external physics engines, sample-based audio, network calls (playtest data stays local / in exported files), new heavy libraries.
Work only inside: `src/scenes/ChallengeScene.ts`, `src/entities/ArcaneGolem.ts`, `src/ui/TouchControls.ts`, `src/ui/Overlay2D.ts`, `src/systems/UISystem.ts`, `src/systems/DevTools.ts`, `src/game.ts`, `assets/css/style.css`, `notes/`, docs and tests.
Do not change: `src/core/Engine.ts`, `src/audio/AudioEngine.ts`, `src/scenes/World.ts`, save key names, existing asset IDs.
Out of scope: Online multiplayer, cloud saves, new campaign sectors.

## Acceptance Checklist
- [ ] Any balance change cites the playtest records it is based on (or nothing changes).
- [ ] Portrait phone (390×844) plays a full sector with no overlapping HUD / controls (screenshots + smoke step).
- [ ] Playtest and save exports work inside the claude.ai artifact (copy panel fallback).
- [ ] `npm test` and `npm run test:audio` pass.
- [ ] Test results distinguish verified and unverified behaviour.
- [ ] New versioned build v1.4.0-beta is compiled and saved (bump `package.json` **before** building).

## Documentation Updates
- progress.md, CHANGELOG.md, TESTING.md, BUGS.md, STATE.md / TODO.md / VERSION.md
- prompts/next-build.md (archive this file to `prompts/archive/v1.4.0-beta.md` first)

## Handoff
Completed: v1.0.0-gold campaign + boss; v1.1.0-beta golem segment + trials; v1.2.0-beta swept golem collision, golem audio, measured audio mix; v1.3.0-beta context-aware mobile touch controls, phone-landscape layout, Continue-from-checkpoint, opt-in playtest records, live golem rumble metering.
Tested (automated, headless Chromium with an emulated touch screen): full regression, touch contexts, phone-landscape fit, checkpoint → reload → Continue, playtest records, audio targets 12/12.
Not tested: physical phones/tablets, real GPUs / FPS, Firefox / Safari / Edge, gamepads, the mix by ear, human balance.
Known issues: see `BUGS.md` (#12/#13 balance needs data; #19 smaller HUD on short phones; #20 no fullscreen on iPhone Safari; #21 overlay label overlap; #22 exports blocked in the artifact).
New build: v1.4.0-beta
Next focused task: Collect and summarise playtest records, then the portrait layout.

## Required Output
Return the complete updated project files, versioned build, change summary,
test results, known issues, and updated next-build prompt.
