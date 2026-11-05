# Changelog

## [Unreleased]

## [0.8.0] - 2026-11-05
### Added
- Ambient birds: V-formation flocks of 3–7 birds and an occasional gliding heron cross the sky, with shadows sweeping over the meadow and forest. They appear in play, on the title screen and in the trailer, but not at night or in rain. Wind drifts them, and flocks chirp as they pass.
- In-game trailer (`startTrailer()`): a ~62 s cinematic cut with title cards, a letterbox, a closer camera, and clips of every mode, predator and feature, ending on the logo with "Play now". When the title screen is left idle, it alternates between the gameplay demo and the trailer.
- `tools/trailer/` (`make.sh`, `record.js`, `render_audio.js`): records the trailer at 1080p, renders a soundtrack offline from the game's music themes, timed to the real scene cuts, and muxes `build/trailer/goat-guardian-trailer.mp4`.
- `.gitignore` for `build/`.

## [0.7.0] - 2026-11-05
### Added
1. Weather per map: rain (hides lurking eyes), wind (slows bats and hawks, blows leaves), fog (sight shrinks around players), and storm (rain, wind and lightning).
2. Hazards: shallow fords (slow), deep rivers crossed by narrow bridges, and brambles (slow; a sheep tangled for 3 s is lost).
3. Predators: the fox (sneaks along tree lines, then dashes), the hawk (circles with a warning marker, then dives; hit it while it's low), and the Great Wolf boss (8 HP; on route 10, every 5th endless stage and every 10th defend wave).
4. Sheep types: the stubborn ram ignores the dog, the lamb is quick and jumpy, and the golden sheep is worth +10 and 5 bells when penned.
5. Second ability: the goat stomps (stuns everything nearby) and the dog whistles (sends nearby sheep to the goal). Use E or `.`, gamepad X or B, right-click, or the on-screen button on touch.
6. Upgrades: bells earned in a run buy Ram Power, Big Bark, Swift Hooves, Quick Skills and Wide Pen (3 levels each). Buy them from the pause menu or the results screen.
7. Daily Challenge mode: one seeded random route per day, with today's best saved.
8. Endless mode: chained random stages, scored by distance and score.
9. Medals: escort routes award Time, Flawless and Hunter; defend arenas award Wave 5, 10 and 15. They show on Map Select and Results.
10. Unlockable looks earned with medals: Snow and Golden goats, Husky and Corgi dogs, and Cream, Grey and Rose wool.
11. Map editor: paint meadow, forest, ford, water and brambles; place pillars and start/goal pins. Test play, save, and copy or paste a share code. Saved maps appear as "MY MAP" in escort Map Select.
12. Versus mode: wolf players lunge, grab sheep and howl for help, against goat and dog players or CPUs, in a 150 s match on any arena.
13. Knockdowns and revives (alphas and the Great Wolf can knock a shepherd down; a teammate standing close revives them), plus team combos for chained takedowns.
14. CPU orders: Push to Goal, Follow Me or Guard the Herd (C, gamepad Y, or tap the CPU label).
15. Music: a synthesized chiptune loop that changes from day to dusk to night (Music option).
16. Effects: footprints in the grass, wool tufts where sheep are grabbed, a slow-motion finish with a baa chorus when the last sheep is penned.
17. Night lanterns: after dusk only the area around each player, fireflies and the pen is lit, and predators' eyes glow in the dark.
18. Story intro: 4 illustrated panels before the first game, replayable from How to Play.
19. Accessibility: remappable keys for both keyboard players, a colour-safe palette, reduced flashing (no shake, flashes or blinking), and game speed of 100%, 75% or 50%.
20. Installable app: `manifest.webmanifest`, service worker `sw.js` (works offline) and icons in `assets/icons/`. These apply only to the GitHub Pages copy.

### Changed
- Mode select now offers Escort, Defend, Daily, Endless and Versus.
- How to Play has 4 pages: shepherds and sheep, predators, modes and hazards, controls.
- The pause menu gains Upgrades and a key remapping sub-view. The Nightfall demo scene now includes the fox, the hawk and the Great Wolf.

## [0.6.0] - 2026-11-05
### Added
- On-screen pause button (top-right) for mouse and touch, alongside P, Esc and gamepad Start.
- Pause menu: Resume, Restart Route/Arena (asks to confirm), Options (sound, screen shake, fullscreen and solo AI helper, all opened inside the pause menu), Controls and Exit to Title (asks to confirm).
- Title menu Exit: leaves fullscreen and shows a goodbye screen with Back to Title. Browsers don't let a page close a tab it didn't open, so the screen asks the player to close it.

## [0.5.0] - 2026-11-05
### Added
- 10 escort routes: Meadow Run (the original map, kept as level 1), Birch Bend, Switchbacks, Twin Trails, Stone Road, Wolf Hollow, Open Moor, Lake of Pines, The Long March and Sunset Summit. Levels 2–10 are larger, from 640x1400 up to 800x2900, compared with 600x1060 for level 1.
- 10 defend arenas: The Henge (original), Twin Glades, Ring Road, Crossroads, Ruined Plaza, Crescent, Grove Isles, Long Valley, Clover and Great Circle.
- Map Select screen (Mode → Map → Players) with a minimap preview, map size and description. Escort routes remember your best stars; arenas remember your best wave.
- Map traits: Wolf Hollow has more wolves, Open Moor and Great Circle have more bats, and Twin Trails and Lake of Pines split the path around pine islands.
- CPU helpers: add AI goats or dogs on the Player Select screen (H / pad Y / tap "+ CPU", remove with N / pad LB / "REMOVE"). Options gains "Solo AI helper" (AUTO by default), which adds a partner when you play alone.
- Loading screen while a map is generated.

### Changed
- Escort missions run through the 10 routes in order. After route 10 they loop back with harder waves. Daylight fades across the 10 routes.
- RETRY in escort restarts on the route where the flock was lost. Game over also offers CHANGE MAP.
- The camera follows human players only. CPU helpers are kept on screen by the leash.

## [0.4.0] - 2026-11-05
### Added
- Attract-mode gameplay demo ("WATCH DEMO" on the title, and automatically after 30 s idle): AI goats and dogs play three scenes: Escort (goat leads, dog drives, the herd is penned), Defend with 4-player co-op at sunset, and Nightfall (wave 8, alphas and bat swarms).
- Units are labelled the first time they appear in a scene (goat, dog, sheep, shadow wolf, alpha wolf, bat). A caption bar shows the scene title and progress. Any button exits the demo.
- Shepherd AI: goats hunt predators and walk the path ahead of the flock; dogs gather stragglers, drive the herd from behind, and bark at predators.
- The demo uses a seeded RNG so it plays out the same way each time.

## [0.3.0] - 2026-11-05
### Added
- 6-direction facing sprites (N, S, NE, NW, SE, SW) for goat, dog, sheep and wolves, including front/back ram and bark poses.
- Proper screen flow: Title (live goat + dog herding demo), Mode select cards, Player select, Options, How to Play.
- Options: sound, screen shake, fullscreen (saved per browser). F toggles fullscreen; PLAY enters fullscreen when the browser allows it.
- Option-list menus for pause, mission results and game over (retry / change players / title).
- Mouse and touch can tap any menu option.

### Changed
- Adaptive resolution: integer pixel scale with the buffer sized to the screen, so the game fills portrait and landscape screens.
- Worlds widened to 600 px so wide screens still scroll.
- Join prompts and menu prompts no longer blink; player slots show static "open slot" options.
- Input is dispatched synchronously from DOM events (needed for fullscreen requests).

## [0.2.0] - 2026-11-05
### Added
- Escort missions: herd the flock from the start pin to a pen at the red pin across procedurally generated forest worlds that get longer each mission. Includes results screen with stars.
- Herding dog character: fast, presses sheep away from itself, and barks to shove the herd, stun predators and send them running.
- Local multiplayer for up to 4 players in any goat/dog mix: two keyboard halves, gamepads 1-4 (Gamepad API) and touch. Lobby with join, character swap, mode select and ready-up.
- Smooth lerp follow camera with velocity lead, sub-pixel scrolling and a shared-view leash for multiplayer.
- Stone pillars (henge in Defend, gate pillars along Escort routes), edge arrows to the goal and to carried sheep, predators lurking in the forest as glinting eyes.
- Bark, pen and join sound effects.

### Changed
- Portrait 160x288 viewport with a scrolling world larger than the screen.
- Restricted 12-colour lo-fi palette; day -> sunset -> dusk is now a per-pixel palette swap (olive/teal day to orange/purple sunset).
- Chunky low-res sprites for goat, sheep, wolves, bats.
- Flat ground with sparse tufts; rounded canopy crowns with indigo undertones and trunk-striped undergrowth replace the detailed tree border.
- Floaty acceleration/deceleration movement and analog input.
- Minimal corner HUD replaces the top bar; per-player cooldown pips sit under each character.

## [0.1.0] - 2026-11-05
### Added
- Initial playable build: goat ram-charge controller, Boids sheep herd with panic vector, wolves and bats with capture/carry/escape, rescue by ramming carriers, alpha wolves (2 HP, stun).
- Procedural pixel sprites, grass/flower/rock field, dithered tree border, day-to-sunset palette shift, fireflies at dusk.
- Particles: dust (turns, charges), impact bursts, shockwave rings, wool puffs, leaves.
- Web Audio SFX: dash sweep, impact thump, pop/shatter, sheep baa (calm/panic), capture, rescue, wave jingles.
- HUD (score, sheep, ram cooldown meter, wave, foes left), menu, pause, game over with local best score.
- Touch controls (virtual joystick + ram), viewport scaling with pixelated rendering.
