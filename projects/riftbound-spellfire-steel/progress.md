# Progress Log

## 2026-10-27 — v1.1.0-beta (Claude Code)
- Implemented the Arcane Golem flight segment for Sector 2 (`src/entities/ArcaneGolem.ts`): shrine, mount/dismount, inertial flight, chest beam with heat, Stone Volley, Rift Dash, Stone Brace, AA missile towers, radar mines, barrier fences, emplacements, helicopter, AA objective, crash + respawn.
- Implemented Challenge Trials (`src/scenes/ChallengeScene.ts`): Target Run, Barrier Survival, Rift Onslaught; star grading; record + shard rewards.
- Added trials menu, trial results and golem HUD (`src/systems/UISystem.ts`); wired states, routing and segment install (`src/game.ts`).
- Verified with probes for the golem segment and each trial, extended the smoke test, re-ran the full v1.0 regression suite.
- Wrote the v1.2 next-build prompt; archived the v1.1 prompt.

## 2026-10-27 — v1.0.0-gold (Claude Code)
- Analysed the reference video (pixel-art 3D diorama, ~45–55° camera, soft shadows, saturated palette, pink-hatted wizard, stone pyramids, striped posts, sun-gate archway, pond with foam ring) → chose three.js low-res rendering + nearest upscale.
- Set up project folder, TypeScript/esbuild toolchain, standalone single-file build.
- Implemented engine, input (kb/mouse/touch/gamepad), state manager, save system, physics + A*, audio synth + procedural music.
- Implemented rendering systems (procedural ground painter, models, instanced props, particles, light pool, FX, camera rig).
- Implemented gameplay (player, spells + combos, Vanguard AI, boss, interactables, hazards, objectives, world).
- Implemented UI (title diorama, menus, HUD, overlay, minimap, touch, story scenes, dev console).
- Authored 4 sector levels.
- Tested: typecheck, logic tests, headless smoke suite, AI/feature/boss probes; fixed issues found (quick key taps lost between frames, low-FPS cinematic skip timing, layout overflow, touch layout overlaps, enemy readability, smoke readability, interaction radii).
