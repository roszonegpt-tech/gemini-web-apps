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
| 9 | Low | Audio | Mix balance (magic vs. gunfire) is untuned by ear — synthesized levels were set by reasoning only. | Next build task. |
| 10 | Info | Fog | Line-of-sight fog hides units behind *tall* geometry only; low cover never hides enemies (by design). | — |
| 11 | Low | Golem (v1.1) | Flight-corridor edge response is axis-separated (velocity reflected per axis) and collision uses the 3-iteration circle resolver; at dash speed the golem can briefly graze/clip tall terrain edges. | Planned for v1.2 (`prompts/next-build.md`). |
| 12 | Low | Golem (v1.1) | Beam damage, AA missile rate and golem armour were set by reasoning, not playtesting. | Tune in v1.2. |
| 13 | Low | Trials (v1.1) | Star thresholds (times / damage) are untested with human players. | Tune in v1.2. |
| 14 | Info | Manifest | v1.1 procedural assets (golem, AA tower, mines, pylons, emplacements, targets, nests, golem sounds, trial arenas) are not yet listed in `assets_manifest.json` because the v1.1 prompt froze that file. | Register in v1.2 (additive). |
| 15 | Info | Code | `challengeScreen` in `src/ui/Screens.ts` is superseded by the v1.1 trials screen in `UISystem` but left in place (Screens.ts was outside the v1.1 edit scope). | Remove in a cleanup pass. |
