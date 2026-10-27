# Progress Log

## 2026-10-27 — v1.3.0-beta (Claude Code)
- Rebuilt the touch controls around a context: on foot / riding the golem / trial rules (hidden locked actions, retargeted aim stick), current-spell label, cooldown sweeps, potion / bomb badges, MAP button, size and left-handed settings, fullscreen toggle.
- Found and fixed lost quick taps on slow frames; reworked the phone-landscape title, menus and touch-mode HUD after screenshot review at 844×390.
- Checkpoints now persist in `campaign.checkpoint` and the title / campaign screens offer Continue after a reload.
- Added opt-in local playtest records for trials and the golem segment (copy / export / clear in Settings).
- Metered the golem engine rumble live at top speed (+2.5 dB over idle; beam leads by 6.4 dB) — closes BUGS #16.
- Removed the superseded `challengeScreen`; reset now confirms inside the page. Balance numbers unchanged (no human data).
- Tests: 12 logic, smoke extended with five v1.3 steps; full regression on folder + standalone builds.

## 2026-10-27 — v1.2.0-beta (Claude Code)
- Replaced the golem's axis-separated corridor bounce with swept sub-stepped collision against `CF.FLY` geometry and a two-rectangle corridor; normal reflection with damping, scrape friction, impact camera bump / particles / sound, non-lethal self-damage above 12 m/s; knockback folded into velocity.
- Stress-probed collision (345 runs, 11 478 frames at dash speed): v1.1 21 grazing frames → v1.2 0.
- Golem audio: speed/brace-following engine rumble, heat-following beam, charge-up, ignition, heat warning, overheat hiss, landing stomps, scrape; lock warning made non-positional.
- Built `tests/audio-levels.mjs` (offline K-weighted level meter + live bus meter + mix targets) and ran the balance pass through `AUDIO_MIX` in `game.ts`: targets 4/11 → 11/11.
- Registered the v1.1 assets (+ new v1.2 sounds) in `assets_manifest.json`; added manifest logic test and two smoke steps; bumped to 1.2.0-beta and built `dist/releases/riftbound-v1.2.0-beta.html`.
- Archived the v1.2 prompt and wrote the v1.3 next-build prompt.

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
