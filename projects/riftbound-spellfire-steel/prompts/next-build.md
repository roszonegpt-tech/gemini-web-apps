# Next Build — Golem Flight Polish, Audio Pass & Device Verification

## Starting Point
Project: Riftbound: Spellfire & Steel
Starting build: v1.1.0-beta
Target version: v1.2.0-beta
Output filename: `dist/index.html` (plus `dist/releases/riftbound-v1.2.0-beta.html`)
Read first: `STATE.md`, `README.md`, `architecture.md`, `CHANGELOG.md`, `BUGS.md`, `TESTING.md`, `src/entities/ArcaneGolem.ts`, `src/scenes/ChallengeScene.ts`
Previous prompts: `PROMPT.md` (v1.0.0-gold), `prompts/archive/v1.1.0-beta.md`

## Goal
Main task: Polish the Arcane Golem flight segment (collision response, feel, audio) and run the outstanding real-device / cross-browser verification and audio balance pass.
Expected player-visible result: The golem glides and bounces cleanly off the flight-corridor edges and tall terrain at full speed, has a rumbling stone/arcane engine sound that follows its speed, and the whole game sounds balanced (magic vs. gunfire vs. music) on desktop and mobile.

## Preserve
Working features: Campaign sectors 1–4, ground spellcasting + combos, Arcane Ward (80% bullet absorption, snap-reflect), Vanguard AI (cover, flanking, grenades), Vance & Iron Goliath boss, Sector 2 golem flight segment, the three Challenge Trials and their star → shard conversion, LocalStorage save schema (`riftbound.save.v1`, frozen key names).
Existing controls: WASD / mouse aim, Space Blink, Shift Ward, gamepad mapping, touch joysticks + buttons.
Existing visual elements: low-res "3D pixel art" rendering, cosmic rift palette, HUD layout, golem armour/heat gauges.
Extension hooks to keep using: `World.updaters`, `World.cameraFocus`, `World.mountTarget`, `AudioEngine.registerRecipe()` / `loopVolume(name, vol, builder)`, `UISystem.extraScreens`.

## Required Changes
1. **Golem collision response** (`src/entities/ArcaneGolem.ts`):
   - Replace the axis-separated bounce at the flight-corridor edge with a swept circle test against the corridor boundary and `CF.FLY` geometry (spires, tall walls, gates) so the golem never clips or tunnels at dash speed (22 m/s).
   - Reflect velocity along the contact normal with damping; add a short camera bump + stone-scrape particles on hard impacts; deal light self-damage only above a speed threshold.
2. **Golem audio** (`src/entities/ArcaneGolem.ts`, via `registerRecipe` / `loopVolume` builders — do not edit `AudioEngine.ts`):
   - Engine rumble whose pitch/filter follow golem speed and brace state; stone footfall thumps when landing at a shrine; beam charge-up and overheat hiss.
3. **Asset manifest** (`assets_manifest.json` — now allowed to change, additive only):
   - Register the v1.1 procedural assets with the existing `<category>/<name>` convention: `model/arcaneGolemFlyer`, `model/aaTower`, `model/radarMine`, `model/barrierPylon`, `model/emplacement`, `model/golemShrine`, `model/targetDummy`, `model/minigunNest`, `sfx/golemLaser`, `sfx/golemAwaken`, `sfx/golemDash`, `sfx/aaLaunch`, `sfx/lockTone`, `sfx/stoneHit`, `loop/golemHum`, `loop/golemBeam`, `level/trial-targetRun`, `level/trial-barrierSurvival`, `level/trial-riftOnslaught`.
4. **Audio balance pass**: tune bus/recipe volumes so spells read clearly over gunfire; check the rain loop and music intensity layering; document final levels in `notes/design-notes.md`.
5. **Verification** (record results in `TESTING.md`):
   - Measure FPS at 1080p on a desktop GPU, an iPad and an iPhone; confirm auto-quality behaviour.
   - Manual pass in Firefox, Safari 14.1+ (macOS + iOS) and Edge.
   - Real gamepad during golem flight (stick drift, R2 beam, L2 brace, A dash) and physical touch play.
   - Human balance pass of Challenge Trial star thresholds (they were set by reasoning, not playtesting).

## Implementation Constraints
Use: existing three.js r162 render loop, Web Audio synth engine, current save keys.
Do not use: external physics engines, sample-based audio files, network calls, new heavy libraries.
Work only inside: `src/entities/ArcaneGolem.ts`, `src/scenes/ChallengeScene.ts`, `src/systems/UISystem.ts`, `src/game.ts`, `assets_manifest.json`, docs and tests.
Do not change: `src/core/Engine.ts`, `src/audio/AudioEngine.ts`, `src/core/Save.ts` key names.
Out of scope: Online multiplayer, new campaign sectors.

## Acceptance Checklist
- [ ] Golem never clips through corridor edges, spires or gates at dash speed; impacts feel weighty.
- [ ] Golem engine rumble responds to speed / brace; beam has charge + overheat audio.
- [ ] `assets_manifest.json` lists every v1.1 procedural asset (no renamed IDs).
- [ ] Audio mix verified by ear on desktop speakers and phone speakers.
- [ ] FPS measured on real hardware and recorded; no regression below 60 FPS on desktop.
- [ ] All v1.1 features (campaign, golem segment, three trials, star rewards) still pass `npm test`.
- [ ] Test results distinguish verified and unverified behaviour.
- [ ] New versioned build v1.2.0-beta is compiled and saved.

## Documentation Updates
- progress.md
- CHANGELOG.md
- TESTING.md
- BUGS.md
- STATE.md / TODO.md / VERSION.md
- prompts/next-build.md (archive this file to `prompts/archive/v1.2.0-beta.md` first)

## Handoff
Completed: v1.0.0-gold campaign + boss; v1.1.0-beta Arcane Golem flight segment (Sector 2) and Challenge Trials (Target Run, Barrier Survival, Rift Onslaught) with star → shard rewards.
Tested (automated, headless Chromium): campaign flow, golem mount/flight/beam/AA objective/dismount, all three trials to completion with records + shard conversion, v1.0 regression suite.
Not tested: real GPUs / FPS, Firefox / Safari, physical touch devices and gamepads, audio by ear, trial star thresholds with human players.
Known issues: see `BUGS.md` (golem corridor-edge bounce is axis-separated; beam/AA balance unplaytested; v1.1 assets not yet registered in the manifest because it was frozen for v1.1).
New build: v1.2.0-beta
Next focused task: Swept golem collision response, then the audio balance pass.

## Required Output
Return the complete updated project files, versioned build, change summary,
test results, known issues, and updated next-build prompt.
