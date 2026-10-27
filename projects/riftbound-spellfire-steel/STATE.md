# STATE — AI handoff snapshot

**Project:** Riftbound: Spellfire & Steel · **Version:** 1.0.0-gold · **Updated:** 2026-10-27 · **Branch:** `claude/riftbound-spellfire-steel`

## Where things are
- Fully playable 4-sector campaign + boss, all menus, HUD, saves, audio, dev tools. See `README.md` (features/controls) and `architecture.md` (systems).
- Source of truth for code: `src/` (TypeScript). Levels: `levels/*.json`. Build output (committed): `assets/js/riftbound.js`, `dist/`.
- After editing anything in `src/` or `levels/`, run `npm run build` (and `npm run typecheck`, `npm test`).

## Last session (Claude Code)
- Built v1.0.0-gold from the prompt in `PROMPT.md` (no earlier code existed — repo previously only held the Gemini app tracker).
- Visual target: the user's reference video (pixel-art 3D diorama) — implemented as low-res three.js rendering with nearest upscaling.
- Verified with typecheck, 9 logic tests, 13-step headless smoke test, and probe scripts (AI, interactions, gamepad stub, boss phases). See `TESTING.md`.

## In progress / unfinished
- Nothing half-done in code. Next planned work is in `prompts/next-build.md` (v1.1.0-beta: Arcane Golem flight + Challenge Trials).

## Conventions to keep
- Save schema keys in `src/core/Save.ts` / `saves/save-schema.json` are **frozen** — add keys only.
- Asset IDs in `assets_manifest.json` follow `<category>/<name>` and are frozen.
- Prefer extension hooks (`World.updaters`, `World.cameraFocus`, `World.mountTarget`, `AudioEngine.registerRecipe`, `UISystem.extraScreens`) over editing core files.
- No external network calls, no new heavy dependencies; three.js r162 is pinned for WebGL1/Safari compatibility.

## Universal Assets
- None used: every model/texture/sound is procedural. If reusable assets from `D:\Projects\Moba RTS\Universal Assets` are adopted later, copy them into `assets/<type>/` (relative paths only) and record the source path / asset ID in `assets_manifest.json` and here.
