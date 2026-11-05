# Changelog

## [Unreleased]

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
