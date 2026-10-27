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
| 8 | Low | Touch | v1.3 touch controls were verified in headless Chromium with an emulated touch screen (844×390, real touch taps and pointer events), not on a physical phone/tablet; thumb reach and the size presets need a human. | Verify on device. |
| 9 | Low | Audio | v1.2 measured and rebalanced the mix (`npm run test:audio`, 11/11 objective targets), but nobody has listened to it on desktop or phone speakers. | Listen on real devices; adjust `AUDIO_MIX` in `src/game.ts`. |
| 10 | Info | Fog | Line-of-sight fog hides units behind *tall* geometry only; low cover never hides enemies (by design). | — |
| 11 | Fixed (v1.2) | Golem | ~~Axis-separated corridor bounce; the golem could graze tall terrain at dash speed.~~ Replaced by swept sub-stepped collision with normal reflection: 0 penetrating frames in 11 478 dash-speed frames (v1.1: 21). | — |
| 12 | Low | Golem | Beam damage, AA missile rate, golem armour, the 0.15 s beam charge-up and impact self-damage were set by reasoning, not playtesting. v1.3 left them unchanged (no human data). | Turn on Settings → Record playtest runs, play, export. |
| 13 | Low | Trials (v1.1) | Star thresholds (times / damage) are untested with human players; unchanged in v1.3 for lack of data. | Playtest records (v1.3) collect it. |
| 14 | Fixed (v1.2) | Manifest | ~~v1.1 procedural assets missing from `assets_manifest.json`.~~ Registered (24 additive IDs); a logic test now fails if a synthesized recipe is missing. | — |
| 15 | Fixed (v1.3) | Code | ~~Superseded `challengeScreen` left in `src/ui/Screens.ts`.~~ Removed. | — |
| 16 | Fixed (v1.3) | Audio | ~~Golem rumble only metered at idle.~~ Metered live: idle −29.1, top speed −26.6, bracing −26.4 dB; the beam leads the full-speed rumble by 6.4 dB (target ≥ 4). | — |
| 17 | Info | Tooling (v1.2) | `tests/audio-levels.mjs` uses an approximate K-weighting and a crude phone-speaker proxy, and reads `AudioEngine`'s private recipe map at runtime. Renaming engine internals would break the tool (not the game). | Test-only. |
| 18 | Info | Audio (v1.2) | `AUDIO_MIX` trims are applied by wrapping `audio.play` / `loopVolume` on the AudioEngine instance at startup; code that keeps a reference to the unwrapped methods taken before `Game` is constructed would bypass them (none does). | Keep using `services.audio`. |
| 19 | Low | Accessibility (v1.3) | On phone-landscape viewports (height ≤ 500 px) the HUD, subtitles and banners render one step smaller (~13.6 px instead of the 16 px minimum) so they no longer overlap. | Trade-off for 390 px-tall screens; larger phones / tablets keep 16 px. |
| 20 | Low | Mobile (v1.3) | iPhone Safari has no element fullscreen API, so the Fullscreen button is hidden there (Add to Home Screen gives a full-screen web app). Portrait play shows a rotate hint instead of a portrait HUD. | — |
| 21 | Low | Touch (v1.3) | Off-screen objective marker labels (drawn on the 2D overlay) can overlap the moved touch-mode objectives box briefly. | Overlay2D margin tweak (v1.4). |
| 22 | Info | Artifact (v1.3) | Inside the claude.ai artifact viewer, file downloads (playtest export, save export, screenshots) are blocked; "Copy records" works there. | Use the normal build for exports. |
