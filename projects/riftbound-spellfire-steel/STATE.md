# STATE — AI handoff snapshot

**Project:** Riftbound: Spellfire & Steel · **Version:** 1.1.0-beta · **Updated:** 2026-10-27 · **Branch:** `claude/riftbound-spellfire-steel` (draft PR #1)

## Where things are
- Fully playable 4-sector campaign + boss, the Sector 2 **Arcane Golem flight segment**, and three **Challenge Trials**, with menus, HUD, saves, audio and dev tools. See `README.md` (features/controls) and `architecture.md` (systems).
- Source of truth for code: `src/` (TypeScript). Levels: `levels/*.json` (campaign) and inline arenas in `src/scenes/ChallengeScene.ts` (trials); the golem course layout lives in `COURSE` inside `src/entities/ArcaneGolem.ts`.
- Build output (committed): `assets/js/riftbound.js`, `dist/index.html`, `dist/releases/riftbound-v1.0.0-gold.html`, `dist/releases/riftbound-v1.1.0-beta.html`.
- After editing anything in `src/` or `levels/`, run `npm run build`, `npm run typecheck` and `npm test`.

## Version history (this branch)
- `1510b86` — v1.0.0-gold (campaign, boss, all core systems).
- next commit — v1.1.0-beta (golem flight segment, challenge trials). Code edits for v1.1 were confined to `ArcaneGolem.ts`, `ChallengeScene.ts`, `UISystem.ts`, `game.ts` as the v1.1 prompt required; `Engine.ts`, `AudioEngine.ts`, `assets_manifest.json` untouched.

## In progress / unfinished
- Nothing half-done in code. Next planned work: `prompts/next-build.md` (v1.2.0-beta: swept golem collision, golem audio, manifest registration of v1.1 assets, audio balance, real-device verification).

## Conventions to keep
- Save schema keys (`src/core/Save.ts`, `saves/save-schema.json`) are **frozen** — add keys only. Trials use the existing `challenges` key (`targetRun`, `barrierSurvival`, `riftOnslaught`).
- Asset IDs in `assets_manifest.json` follow `<category>/<name>` and are frozen (v1.1 assets still to be registered — see BUGS #14).
- Prefer extension hooks (`World.updaters`, `World.cameraFocus`, `World.mountTarget`, `PlayerMage.mounted`, `AudioEngine.registerRecipe` / `loopVolume` builders, `UISystem.extraScreens`) over editing core files.
- No network calls, no new heavy dependencies; three.js r162 is pinned for WebGL1 / Safari compatibility.

## Universal Assets
- None used: every model/texture/sound is procedural. If assets from `D:\Projects\Moba RTS\Universal Assets` are adopted later, copy them into `assets/<type>/` (relative paths only) and record the source path / asset ID in `assets_manifest.json` and here.
