# Changelog — Get em Billy (formerly Goat Guardian)

## [Unreleased]

## [0.12.0] - 2026-11-05
### Added
- **Screen smash**: when Billy rams a foe out, there is a 20% chance (always for the Great Wolf) that it flies at the camera, hits the glass with a white flash, shake and shatter sound, and leaves a spider-web crack. It sticks squashed for a moment, then slides down the screen leaving a smear. The crack dithers away after about 3 s. It is drawn on the HUD layer, so the crack is never tinted.
- **Attack bars**: a bar under every human player fills while the ram, bark or lunge recharges and flashes when it is ready. A HUD meter at the bottom right shows RAM, BARK or LUNGE for each human player (P1–P4 in co-op).
- **Billy's theme**: a heroic E-minor riff, now the menu music and the soundtrack of the new trailer.
- **Billy trailer** (`tools/trailer/make.sh billy` writes `build/trailer-billy/billy-trailer.mp4`, about 55 s). It has a close-up camera on a solo Billy, title cards ("The wolves thought the flock was easy... then they met BILLY"), ram, screen-crack, combo, stomp, alpha and Great Wolf scenes, a dress-up montage and the logo. The score is Billy's theme: power-chord chug, octave bass, double kicks, the melody and goat bleats, with thuds on every recorded ram hit and glass shatters on every crack. The idle title screen now cycles demo, trailer and Billy trailer.
### Changed
- **The ram is back**: during the charge Billy gallops with his head and horns lowered and forward. The frames are made from the lab's head-down butt frame on top of the gallop legs; the front and back views use the head-dip frames.
- **Stomp is now an upgrade**: STOMP (8 bells, one level) in the Upgrades shop. Until it is bought, the goat's ability button says "STOMP: BUY IN UPGRADES". Player Select, How to Play and the controls help say so.
### Fixed
- The sniff pose no longer drops the front legs.

## [0.11.0] - 2026-11-05
### Changed
- **Renamed to Get em Billy.** Updated the title screen logo ("GET EM" over a big "BILLY"), the page title, the home-screen app name (manifest and iOS), the trailer's title card ("The flock needs a billy goat") and finale, the docs, and the trailer file (`build/trailer/get-em-billy-trailer.mp4`).
- Unchanged so nothing breaks: the folder `games/goat-guardian/`, the saved-data keys (settings, looks, medals and bests carry over) and the `GG1` map share codes. The service worker cache is renamed, so installed copies refresh.

## [0.10.1] - 2026-11-05
### Changed
- Goats are drawn larger than the farm dogs: the goat is baked at 0.92 of the lab size (12 px tall) and the dogs at 2/3 (at most 10 px tall). The goat shadow is wider to match. The smoke test checks that every goat breed is taller than every dog.
- The trailer was rebuilt with the Rusty Lab animals.

## [0.10.0] - 2026-11-05
### Changed
- **Animals now use the Rusty Lab art** (from `rusty_lab_v0_13_1.html`): the goat, wolf, fox and the lab versions of the ten farm dogs. Each is drawn in all 8 directions (west-facing views are drawn, not mirrored), with idle, walk, run, jump and attack frames. The ram uses the attack frames, the stomp uses the jump frames, and the bark and bites use the attack frames.
- The lab art is shrunk to the original sprite scale (2/3) at bake time by a detail-preserving reduction: every source pixel maps to exactly one pixel, eyes, nose and fangs take priority, and thin legs and ears are kept. Shadows are back to their original sizes.
- **Goat breeds are lab goat colourways**: Saanen, Alpine, Boer, Nubian, Valais, Toggenburg*, Golden, Oberhasli*, Pygmy, Kid Brown, Chocolate and Panda (12; *new colourways added to the lab set).
- The lab colours follow the sunset and night palette swap: each off-palette colour moves the way its nearest palette colour does.
- Sheep are unchanged.
### Added
- **Animal customization (STYLE)**: press the ability button, or tap STYLE on a Player Select card, to open it. It sets breed, coat colourway, eyes, hat (Hood, Bandana, Witch hat, Horned helm, Mushroom), hair (Shaggy, Spikes, Mohawk, Top knot), outfit (Vest, Tunic, Robe, Poncho, Fur wrap), earring, warpaint and a bell collar, each with the lab's colour options. It has a rotating, animated preview, plus Random and Reset. Looks are saved per animal (goat, dog, wolf). CPU helpers get varied looks, and the wolf player can be styled in Versus.
- Made to the lab standard (letter colour regions, colourways, all 8 directions, five actions): the **Great Wolf** boss (full size), a **bat** (3 colourways, 4-frame flap) and a **hawk** (2 colourways, flap and dive).
- Dog idle poses (sit, lie, alert, sniff) are now generated from the lab frames.
- The demo's Farm Dogs scene shows hats and collars.

## [0.9.1] - 2026-11-05
### Fixed
- **Choppy walk and run.** CPU dogs' speed swings between about 20 and 90 px/s while herding. Each time it crossed 52 px/s the sprite switched between walk and run, and the two counted frames differently, so it jumped to an unrelated frame. Now:
  - Walk and run share one stride phase (`stepGait`), so changing gait keeps the beat.
  - The gait switches with hysteresis (run above 58, walk below 42; predators 48/34).
  - Facing has hysteresis: the view changes 33° past the sector centre (`faceDirH`), and left/right flips only once the heading clearly crosses (`faceLeft`).
  - Predators animate by distance travelled, not by time, so their feet no longer slide.
- Smoother gallop: the legs fold under the body in the gathered frame instead of vanishing, and the body bob is gentler (0, -1, -1, 0).
- Sniffing only happens when moving very slowly (under 16 px/s for over a second), so herding dogs no longer duck their heads.
### Changed
- **Great Wolf boss redrawn.** It used to be the black alpha wolf scaled 2×, which read as black blocks with eyes. It is now a hand-drawn full-size wolf (32×19): dark fur with a dark outline, a silver mane and ruff, a scar over glowing eyes, bared fangs and a bushy tail. It has side, front and back views, with a 4-frame walk and gallop.

## [0.9.0] - 2026-11-05
### Added
- **9 goat breeds** from the reference sheet: Saanen, Alpine, Boer, Nubian (spotted), Valais Blackneck, Toggenburg (face stripes), Golden Guernsey, Oberhasli (dorsal stripe) and Pygmy (roan). Medals unlock them.
- **10 unlockable farm dogs**, each with its own speed, herding push and skill: Border Collie (whistle), Corgi (heel nip), Sheltie (sprint), Cattle Dog (bite dash), Old English (gather), German Shepherd (takedown; longer bark stun), Jack Russell (yap frenzy; ratter), Bernese (carry a sheep), Komondor (ambush; the flock follows it and hides beside it) and Great Pyrenees (roar; guardian aura).
- Dog idle behaviour based on the reference video: sit, lie down, alert (head up when a predator is near), sniff, bark (mouth open) and bite poses.
- CPU dogs use their breed's skill, and CPU helpers pick a different unlocked breed per slot.
- How to Play now has 7 pages, including two pages of farm dogs (locked dogs show the medals needed) and a goat breed gallery.
- A Farm Dogs demo scene that cycles through all 10 breeds, and a "9 goats + 10 farm dogs" trailer clip.
- Player Select shows the breed name, its skill and how many breeds are unlocked. The game remembers the last breed picked.
### Changed
- **Running fixed:** every animal (goats, dogs, wolves and foxes) has a 4-frame walk and a 4-frame bounding gallop. The gallop bobs the body (0, -1, -2, -1), pitches the head on the reach and tucks the legs in flight. Walk is used below 52 px/s.
- Dogs, wolves and foxes are now generated from body parameters (length, legs, ears, tail, coat pattern) and face 8 directions.
- The old recolour looks for goats and dogs (Brown/Golden goat, Husky/Corgi dog) are replaced by real breeds. The unlock banner now reads "NEW BREED!".
- App icons show the new goat with a sitting collie. The service worker cache was bumped to v0.9.0.

## [0.8.1] - 2026-11-05
### Changed
- Goat redrawn to match the reference sheet: cream-white coat with grey shading, tan ears, beard and tail tuft, long legs with dark hooves, and curved brown horns with a black outline (generated around every horn pixel, so it holds in every pose).
- The goat is now about 13 px tall, clearly taller than the 6 px dog, and casts a wider shadow.
- The goat faces 8 directions (S, N, E, W, SE, SW, NE, NW) with matching lowered-head ram poses. Other animals keep 6.
- Goat looks: Cream (default), Brown (3 medals), Golden (8 medals).
- App icons regenerated with the new goat. The service worker cache was bumped to v0.8.1. The trailer was rebuilt.

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
