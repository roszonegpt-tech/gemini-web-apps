# STATE — AI handoff snapshot

**Project:** Riftbound: Spellfire & Steel · **Version:** 1.2.0-beta · **Updated:** 2026-10-27 · **Branch:** `claude/riftbound-spellfire-steel` (draft PR #1)

## Where things are
- Fully playable 4-sector campaign + boss, the Sector 2 **Arcane Golem flight segment** (v1.2: swept collision, engine/beam audio), and three **Challenge Trials**, with menus, HUD, saves, audio and dev tools. See `README.md` (features/controls) and `architecture.md` (systems).
- Source of truth for code: `src/` (TypeScript). Levels: `levels/*.json` (campaign) and inline arenas in `src/scenes/ChallengeScene.ts` (trials); the golem course layout is `COURSE` and the flight corridor is `CORRIDOR` in `src/entities/ArcaneGolem.ts`.
- Audio mix: per-sound / per-loop dB trims and the music-bus trim live in `AUDIO_MIX` (`src/game.ts`); golem sound levels in `ArcaneGolem.ts`. Measure with `npm run test:audio` (targets + before/after in `notes/design-notes.md`).
- Build output (committed): `assets/js/riftbound.js`, `dist/index.html`, `dist/releases/riftbound-v{1.0.0-gold,1.1.0-beta,1.2.0-beta}.html`.
- After editing anything in `src/` or `levels/`, run `npm run build`, `npm run typecheck` and `npm test` (and `npm run test:audio` after audio changes). **Bump `package.json` version before building a new release**, otherwise the build overwrites the previous `dist/releases/` file.

## Version history (this branch)
- `1510b86` — v1.0.0-gold (campaign, boss, all core systems).
- `8a0b62c` — v1.1.0-beta (golem flight segment, challenge trials).
- next commit — v1.2.0-beta (swept golem collision, golem audio, audio balance pass, manifest registration of v1.1 assets, audio level meter). Code edits confined to `ArcaneGolem.ts`, `game.ts`, `assets_manifest.json` (additive), tests and docs; `Engine.ts`, `AudioEngine.ts` and save keys untouched.

## In progress / unfinished
- Nothing half-done in code. Still owed (cannot be done in the cloud container): real-device FPS, Firefox/Safari/Edge, physical gamepad/touch, listening to the mix, human balance of trial stars — see `TODO.md` and `TESTING.md`.
- Next planned work: `prompts/next-build.md` (v1.3.0-beta).

## Conventions to keep
- Save schema keys (`src/core/Save.ts`, `saves/save-schema.json`) are **frozen** — add keys only. Trials use the existing `challenges` key (`targetRun`, `barrierSurvival`, `riftOnslaught`).
- Asset IDs in `assets_manifest.json` follow `<category>/<name>` and are frozen — add only (a logic test checks that every synthesized recipe is registered).
- Prefer extension hooks (`World.updaters`, `World.cameraFocus`, `World.mountTarget`, `PlayerMage.mounted`, `AudioEngine.registerRecipe` / `loopVolume` builders, `UISystem.extraScreens`, `AUDIO_MIX`) over editing core files.
- No network calls, no new heavy dependencies; three.js r162 is pinned for WebGL1 / Safari compatibility.

## Universal Assets
- None used: every model/texture/sound is procedural. If assets from `D:\Projects\Moba RTS\Universal Assets` are adopted later, copy them into `assets/<type>/` (relative paths only) and record the source path / asset ID in `assets_manifest.json` and here.
