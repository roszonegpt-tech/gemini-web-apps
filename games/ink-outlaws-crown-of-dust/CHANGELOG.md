# Changelog

All notable changes to this project. The format follows Keep a Changelog; versions follow semantic versioning.

## [Unreleased]
### Added
- Playable Artifact build: `python3 build/build.py --artifact` and `tests/artifact.cjs`.
- Controls card, Fullscreen button and Load save code on the title screen; Copy and Load save code in the campaign Menu. Saves are sanitised on load (`K.sanitize`) and kept in memory when browser storage is blocked.
### Added
- Narrated "Story and How to Play" guide: `trailer/guide.js`, `guide.html` and `guide_script.json`, and `build/make_vo.py` (Piper TTS). `tests/render_trailer.cjs --film guide` renders YouTube and TikTok cuts with burned-in captions, an `.srt` and chapters.
- The trailer engine is split into `trailer/director.js`, shared by the trailer and the guide.
- Gameplay trailer: `trailer/` director (48 shots, 58 s, cut on a 120 BPM beat) and `tests/render_trailer.cjs`, which renders a YouTube cut (1920×1080) and a TikTok cut (1080×1920) frame by frame with an offline soundtrack.
- Trailer hooks: `spec.noHud`, `spec.skipWarm`, `spec.noEnd`, `spec.bgS`, `M.camLock`, `Sprites.lockScale`, `CD.Sfx.onPlay` / `renderInto`, and `unit.scripted`. Normal play is unchanged.
### Fixed
- Crown Clerics no longer out-heal bosses (heals capped at 45); King Odo and the Tyrant no longer stand stacked on one spot.

## [0.1.0] - 2026-11-12
### Added
- First playable release.
- Campaign map of the Tally Basin: 13 territories, 3 enemy factions, daily income, enemy raids with a choice to defend in person or trust the garrison, game over and retry when Dry Gulch falls, and a victory screen with free play afterwards.
- Camp: hire outlaws, seat the posse (2 to 6), swap captains, armoury with 22 weapons and 2 slots, and 6 town buildings (Saloon, Smithy, Doc's Tent, Watchtowers, Powder Store, Stable with 4 mounts).
- Missions: Raid, Rescue, Heist, Defend (waves) and Stronghold boss fights (Captain Snig, who mounts a lizard at half health; Queen Vex with her gallows oaks; King Odo with the Tyrant, who takes to horseback at half health).
- Hero combat from the lab's anchors: guns fire from the painter's muzzle frames, melee hits land on its hit frames, a 3-hit combo chain, dodge roll with invulnerability frames, and 8 special moves.
- Enemy AI: chasers, kiters, casters with telegraphed blasts, chargers, mimic chests, spawner tents, towers, summoners, healers, splitting slimes.
- Posse AI with follow, hold, charge and focus orders; building at surveyor stakes using scrip.
- Structures and props (tents, huts, houses, town hall, keep, towers, palisades, stone walls, totems, cages, chests, wagons, trees, cacti, graves and more), built from the painter's own primitives.
- Four biomes: desert, swamp, hollow woods and crown farmland.
- All 63 Chunk Lab presets used, plus 24 new looks; a lab-designed character becomes a playable captain.
- Wanted posters (unit codex), synthesised sound, touch controls, iPhone and iPad layouts, a pause menu.
- Single-file build, plus smoke, reachability, mission and full-campaign autopilot tests.
