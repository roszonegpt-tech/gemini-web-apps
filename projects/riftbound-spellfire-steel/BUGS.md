# Known Issues & Limitations

| # | Severity | Area | Description | Workaround / note |
|---|---|---|---|---|
| 1 | Info | Performance | 60 FPS at 1080p could not be measured on real GPUs in this environment (only headless SwiftShader software rendering, ~15–20 FPS). The renderer draws a ~640×360 internal image with ~50–300 draw calls and ~20k triangles, so real hardware should have ample headroom; auto-quality steps down below 45 FPS. | Verify on target devices (see TODO). |
| 2 | Low | Browsers | Bundle is transpiled for Safari **14.1**+ (esbuild flags a destructuring bug in Safari 14.0). Only Chromium was tested automatically. | Test Firefox / Safari / iOS manually. |
| 3 | Low | Narration | Voice-over uses the browser's *local* speech voices only (to stay offline). If none are installed, narration is silent; subtitles always show. | Toggle in Settings. |
| 4 | Low | Checkpoints | A checkpoint restart rebuilds the level: cover destroyed in earlier zones is restored and earlier zones' enemies are not respawned (by design: enemies in the active zone reset). | — |
| 5 | Low | Input | Some browsers reserve F12 for devtools before the page sees it. | Use **F9** for screenshots. |
| 6 | Low | Aiming | Mouse aim projects onto a plane 1 m above ground; flying units (drones, helicopter) are hit by XZ proximity, so leading airborne targets feels slightly generous. | Aim assist covers it. |
| 7 | Low | Camera | At map corners the camera can show the cosmic void beyond the floating landmass. | Intentional floating-island look. |
| 8 | Low | Touch | Touch layout and controls were verified by rendering + synthetic events only, not on a physical phone/tablet. | Verify on device. |
| 9 | Low | Audio | v1.2 measured and rebalanced the mix (`npm run test:audio`, 11/11 objective targets), but nobody has listened to it on desktop or phone speakers. | Listen on real devices; adjust `AUDIO_MIX` in `src/game.ts`. |
| 10 | Info | Fog | Line-of-sight fog hides units behind *tall* geometry only; low cover never hides enemies (by design). | — |
| 11 | Fixed (v1.2) | Golem | ~~Axis-separated corridor bounce; the golem could graze tall terrain at dash speed.~~ Replaced by swept sub-stepped collision with normal reflection: 0 penetrating frames in 11 478 dash-speed frames (v1.1: 21). | — |
| 12 | Low | Golem | Beam damage, AA missile rate, golem armour, and (v1.2) the 0.15 s beam charge-up and impact self-damage were set by reasoning, not playtesting. | Human playtest (v1.3). |
| 13 | Low | Trials (v1.1) | Star thresholds (times / damage) are untested with human players. | Needs play data (v1.3). |
| 14 | Fixed (v1.2) | Manifest | ~~v1.1 procedural assets missing from `assets_manifest.json`.~~ Registered (24 additive IDs); a logic test now fails if a synthesized recipe is missing. | — |
| 15 | Info | Code | `challengeScreen` in `src/ui/Screens.ts` is superseded by the v1.1 trials screen in `UISystem` but left in place (Screens.ts was outside the v1.1 edit scope). | Remove in a cleanup pass. |
| 16 | Low | Audio (v1.2) | The golem engine rumble is metered at idle only; at full speed / bracing it is estimated (not measured) ~4–5 dB louder, shrinking the beam's lead over it to ~4 dB. | Meter it live at speed (v1.3). |
| 17 | Info | Tooling (v1.2) | `tests/audio-levels.mjs` uses an approximate K-weighting and a crude phone-speaker proxy, and reads `AudioEngine`'s private recipe map at runtime. Renaming engine internals would break the tool (not the game). | Test-only. |
| 18 | Info | Audio (v1.2) | `AUDIO_MIX` trims are applied by wrapping `audio.play` / `loopVolume` on the AudioEngine instance at startup; code that keeps a reference to the unwrapped methods taken before `Game` is constructed would bypass them (none does). | Keep using `services.audio`. |
