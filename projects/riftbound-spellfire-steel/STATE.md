# STATE — AI handoff snapshot

**Project:** Riftbound: Spellfire & Steel · **Version:** 1.4.0-beta · **Updated:** 2026-10-27 · **Branch:** `claude/riftbound-spellfire-steel` (draft PR #1)

## Where things are
- Fully playable 4-sector campaign + boss, the Sector 2 **Arcane Golem flight segment** (v1.2: swept collision, engine/beam audio), and three **Challenge Trials**, with menus, HUD, saves, audio and dev tools. v1.3: context-aware mobile touch controls, phone-landscape layout, Continue-from-checkpoint after reloads, opt-in local playtest records. v1.4: portrait-phone layout, export panel (works inside the artifact), playtest summary tool. See `README.md` (features/controls) and `architecture.md` (systems).
- Source of truth for code: `src/` (TypeScript). Levels: `levels/*.json` (campaign) and inline arenas in `src/scenes/ChallengeScene.ts` (trials); the golem course layout is `COURSE` and the flight corridor is `CORRIDOR` in `src/entities/ArcaneGolem.ts`.
- Touch controls: `src/ui/TouchControls.ts` (button table `BUTTONS`, `setContext()`), context built in `UISystem.touchContext()`; trial rules in `ChallengeScene.touchRules()`. Phone layout rules live at the end of `assets/css/style.css` (`#stage.touch-mode …`, `@media (max-height: 500px)`).
- Portrait layout: `UISystem.applyPortrait()` moves status, subtitles, touch controls and menus between the stage and `#portrait-pad` (CSS at the end of `style.css`, query `PORTRAIT_QUERY`). Exports: `UISystem.openExport()`.
- Balance data: exported playtest JSON goes in `notes/playtest/`; `npm run playtest:summary`.
- Checkpoint resume: `MissionScene.persistCheckpoint()` → `campaign.checkpoint`; `Game.uiAction('continueCheckpoint')`. Playtest records: `recordPlaytest()` in `src/core/Save.ts`, written by `ChallengeScene.record()` and `GolemSegment.recordRun()`.
- Audio mix: per-sound / per-loop dB trims and the music-bus trim live in `AUDIO_MIX` (`src/game.ts`); golem sound levels in `ArcaneGolem.ts`. Measure with `npm run test:audio` (targets + before/after in `notes/design-notes.md`).
- Build output (committed): `assets/js/riftbound.js`, `dist/index.html`, `dist/releases/riftbound-v{1.0.0-gold,1.1.0-beta,1.2.0-beta,1.3.0-beta,1.4.0-beta}.html`.
- After editing anything in `src/` or `levels/`, run `npm run build`, `npm run typecheck` and `npm test` (and `npm run test:audio` after audio changes). **Bump `package.json` version before building a new release**, otherwise the build overwrites the previous `dist/releases/` file.

## Version history (this branch)
- `1510b86` — v1.0.0-gold (campaign, boss, all core systems).
- `8a0b62c` — v1.1.0-beta (golem flight segment, challenge trials).
- `4a64f2f`…`16c0d87` — v1.2.0-beta (swept golem collision, golem audio, audio balance pass, manifest registration of v1.1 assets, audio level meter). Code edits confined to `ArcaneGolem.ts`, `game.ts`, `assets_manifest.json` (additive), tests and docs; `Engine.ts`, `AudioEngine.ts` and save keys untouched.
- `28deaf4`…`dbc7a4e` — v1.3.0-beta (mobile controls, phone layout, checkpoint resume, playtest records, live golem rumble meter, `challengeScreen` removed). `Engine.ts`, `AudioEngine.ts`, `World.ts`, save key names and asset IDs untouched.
- `c9f85cc`…`d835c45` — v1.4.0-beta (portrait phones, export panel, overlay keep-out, playtest summary). Same protected files untouched.

## In progress / unfinished
- Nothing half-done in code. Still owed (cannot be done in the cloud container): real-device FPS, Firefox/Safari/Edge, physical gamepad/touch, listening to the mix, human balance of trial stars — see `TODO.md` and `TESTING.md`.
- Next planned work: `prompts/next-build.md` (v1.5.0-beta).

## Conventions to keep
- Save schema keys (`src/core/Save.ts`, `saves/save-schema.json`) are **frozen** — add keys only. Trials use the existing `challenges` key (`targetRun`, `barrierSurvival`, `riftOnslaught`).
- Asset IDs in `assets_manifest.json` follow `<category>/<name>` and are frozen — add only (a logic test checks that every synthesized recipe is registered).
- Prefer extension hooks (`World.updaters`, `World.cameraFocus`, `World.mountTarget`, `PlayerMage.mounted`, `AudioEngine.registerRecipe` / `loopVolume` builders, `UISystem.extraScreens`, `AUDIO_MIX`) over editing core files.
- No network calls, no new heavy dependencies; three.js r162 is pinned for WebGL1 / Safari compatibility.

## Universal Assets
- None used: every model/texture/sound is procedural. If assets from `D:\Projects\Moba RTS\Universal Assets` are adopted later, copy them into `assets/<type>/` (relative paths only) and record the source path / asset ID in `assets_manifest.json` and here.
