# Next Build — Checkpoint Persistence, Playtest Telemetry & Balance Pass

## Starting Point
Project: Riftbound: Spellfire & Steel
Starting build: v1.2.0-beta
Target version: v1.3.0-beta
Output filename: `dist/index.html` (plus `dist/releases/riftbound-v1.3.0-beta.html`)
Read first: `STATE.md`, `README.md`, `architecture.md`, `CHANGELOG.md`, `BUGS.md`, `TESTING.md`, `notes/design-notes.md`, `src/scenes/MissionScene.ts`, `src/core/Save.ts`
Previous prompts: `PROMPT.md` (v1.0.0-gold), `prompts/archive/v1.1.0-beta.md`, `prompts/archive/v1.2.0-beta.md`

## Goal
Main task: Let players resume a mission from its last checkpoint after closing the page, and give the remaining balance work (trial stars, golem segment) real data by recording local, opt-in playtest runs.
Expected player-visible result: "Continue — Sector N, checkpoint M" on the campaign screen after a reload; a Settings toggle for local playtest records with an export button; star thresholds and golem tuning adjusted from recorded runs.

## Preserve
Working features: Campaign sectors 1–4, ground spellcasting + combos, Arcane Ward (80% bullet absorption, snap-reflect), Vanguard AI, Vance & Iron Goliath boss, Sector 2 golem flight segment (v1.2 swept collision, engine/beam audio), the three Challenge Trials and their star → shard conversion, the v1.2 audio mix (`AUDIO_MIX`, `npm run test:audio` must stay 11/11), LocalStorage save schema (`riftbound.save.v1`, frozen key names).
Existing controls: WASD / mouse aim, Space Blink, Shift Ward, gamepad mapping, touch joysticks + buttons, golem controls.
Existing visual elements: low-res "3D pixel art" rendering, cosmic rift palette, HUD layout, golem armour/heat gauges.
Extension hooks to keep using: `World.updaters`, `World.cameraFocus`, `World.mountTarget`, `AudioEngine.registerRecipe()` / `loopVolume(name, vol, builder)`, `UISystem.extraScreens`, `AUDIO_MIX`.

## Required Changes
1. **Checkpoint persistence** (`src/scenes/MissionScene.ts`, `src/game.ts`, `src/systems/UISystem.ts`):
   - When a zone checkpoint is reached, write `{ sector, zone, stats, consumables, time }` to the existing `campaign.checkpoint` key (currently always `null`); clear it on mission complete, failure-to-menu or a new deploy of another sector.
   - Campaign screen: show "Continue — Sector N, checkpoint M" when a checkpoint exists; it rebuilds the World with that `startZone` and restores the snapshot (same path as Restart from Checkpoint). Old saves without the field keep working.
2. **Local playtest records** (`src/scenes/ChallengeScene.ts`, `src/entities/ArcaneGolem.ts`, `src/game.ts`, `src/systems/UISystem.ts`):
   - Settings toggle "Record playtest runs (local only)", default off; new keys only, added under the existing `settings` / `stats` objects.
   - Per trial run: trial id, time, damage taken, stars, quit/complete. Per golem segment: time mounted, armour lost, impacts, overheats, missiles shot down, crashes. Keep the last 50 runs.
   - Dev console + Settings: export records as JSON (no network).
3. **Balance pass from data**: tune trial star thresholds (`TRIALS` in `ChallengeScene.ts`) and golem numbers (`GOLEM`) only with recorded human runs; document the before/after values and the data they came from in `notes/design-notes.md`. If no human data is available, leave the numbers unchanged and say so.
4. **Golem rumble at speed** (BUGS #16): extend `tests/audio-levels.mjs` to meter the live golem engine at full speed and while bracing; keep T4 (beam ≥ 4 dB over the rumble) passing at full speed.
5. **Cleanup**: remove the superseded `challengeScreen` from `src/ui/Screens.ts` (BUGS #15).
6. **Verification carried over from v1.2** (record results in `TESTING.md`, needs real hardware / a person): FPS at 1080p on a desktop GPU, iPad and iPhone; Firefox, Safari 14.1+ (macOS + iOS), Edge; real gamepad in golem flight; physical touch; listening to the mix on desktop and phone speakers.

## Implementation Constraints
Use: existing three.js r162 render loop, Web Audio synth engine, current save keys (add keys only).
Do not use: external physics engines, sample-based audio files, network calls (records stay in LocalStorage / exported files), new heavy libraries.
Work only inside: `src/scenes/MissionScene.ts`, `src/scenes/ChallengeScene.ts`, `src/entities/ArcaneGolem.ts`, `src/systems/UISystem.ts`, `src/ui/Screens.ts`, `src/game.ts`, `src/core/Save.ts` (defaults for new keys only), `saves/save-schema.json`, docs and tests.
Do not change: `src/core/Engine.ts`, `src/audio/AudioEngine.ts`, `src/scenes/World.ts`, existing save key names, existing asset IDs in `assets_manifest.json`.
Out of scope: Online multiplayer, cloud saves, new campaign sectors.

## Acceptance Checklist
- [ ] Reloading the page mid-mission offers "Continue" and resumes at the saved checkpoint with the saved stats/consumables.
- [ ] Old saves (v1.0–v1.2) load unchanged; `saves/save-schema.json` documents the new keys.
- [ ] Playtest records are off by default, stay local, export as JSON, and cap at 50 runs.
- [ ] Any balance change cites the recorded runs it is based on (or the numbers stay as they are).
- [ ] `npm test` and `npm run test:audio` pass (incl. golem rumble at full speed).
- [ ] Test results distinguish verified and unverified behaviour.
- [ ] New versioned build v1.3.0-beta is compiled and saved (bump `package.json` **before** building).

## Documentation Updates
- progress.md
- CHANGELOG.md
- TESTING.md
- BUGS.md
- STATE.md / TODO.md / VERSION.md
- saves/save-schema.json
- prompts/next-build.md (archive this file to `prompts/archive/v1.3.0-beta.md` first)

## Handoff
Completed: v1.0.0-gold campaign + boss; v1.1.0-beta golem flight segment and Challenge Trials; v1.2.0-beta swept golem collision, golem engine/beam audio, measured audio balance pass (`AUDIO_MIX`, `npm run test:audio`), v1.1 assets registered in the manifest.
Tested (automated, headless Chromium): full campaign regression, golem flow, dash-speed collision stress (0 clipping frames), trials, audio mix targets 11/11, standalone build.
Not tested: real GPUs / FPS, Firefox / Safari / Edge, physical touch and gamepads, the mix by ear, trial star thresholds and golem balance with human players.
Known issues: see `BUGS.md` (#12 golem balance and #13 trial stars need play data; #16 rumble only metered at idle; #15 superseded `challengeScreen`).
New build: v1.3.0-beta
Next focused task: Checkpoint persistence, then opt-in local playtest records.

## Required Output
Return the complete updated project files, versioned build, change summary,
test results, known issues, and updated next-build prompt.
