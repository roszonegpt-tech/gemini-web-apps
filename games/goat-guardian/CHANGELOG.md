# Changelog — Get em Billy (formerly Goat Guardian)

## [Unreleased]

## [0.18.0] - 2026-11-06
### Changed
- **New goat and farm dogs, from the shapes in the offline edit you liked** (`Get_Em_Billy_Offline.html`, an edit of 0.14 with `nativeAnimalRows`). The goat and all ten dogs are drawn from shapes on a 30x30 grid (level back from a rounded rump, a neck rising into the head, swept horns, side-set eye, beard), then shrunk to the game's sprite size (`FARM_SCALE`: goat 0.7, dogs 0.56) and given a dark outline. The goat is about the size it was (roughly 20x20 visible pixels, still bigger than every dog) and the dogs are back near their old size (about 15x14).
- **Legs walk and gallop properly.** In the edit, the legs only slid a pixel sideways. Now each leg reaches forward, stands under the body, pushes back and lifts in a trot (near hind with far front, far hind with near front), the near and far legs of a pair open into a clear V, the body rises a pixel on the passing frames, and the gallop takes longer strides with higher lifts. Front and back views lift their legs in turn.
- **Dogs closer to the older look:** long and low (lower body, shorter legs, a longer barrel than the goat) while keeping the new back and neck.
- Hats, hair and accessories are taken from the lab art and moved onto the new heads; outfits recolour the new barrel and legs. Sit, lie, alert, sniff, bite and the ram are built from the new frames as before.
- Player cards in the lobby fit the taller sprites (`cardSprite`).
- The wolf, fox, bat, hawk, Great Wolf and sheep are unchanged.
- The smoke test checks the outline, that all four walk and gallop frames differ with moving feet and a body rise, and the goat and dog sizes.

## [0.17.2] - 2026-11-06
### Changed
- **Back to the original look:** no outlines, and the lab's own front and back views (with the 0.16.0 widened backs) for every animal. The 0.17.0 outline and the 0.17.1 side-only views are still in the code, switched off (`LAB_OUTLINE`, `LAB_TRUE_BACK`, `LAB_SIDE_ONLY`).
### Fixed
- **The goat's back in side view.** The head sat on the middle of a short, flat back, leaving a notch and a dead-straight crease under it. Like the reference sheets, the goat's body, tail and legs now sit further back so the head stands at the front, the back is level from a rounded rump and rises through the shoulders into a neck that joins the head, and the legs are a pixel longer (`labGoatNeck`, applied to every east and west frame: walk, gallop, jump and the ram dip). The head is where it was, so hats, hair and collars still fit; outfits follow the moved body. The smoke test checks every frame for a gap between body and head.

## [0.17.1] - 2026-11-06
### Fixed
- **No more straight-on front or back views.** Up/down (and the diagonals) now use the pure side profile for every animal, like the reference sheets: the goats and all dogs, the fox and the wolf always show their side, facing left or right (the last horizontal direction is kept while moving straight up or down). The 0.17.0 three-quarter art, which still read as a blob facing the camera, is behind `LAB_SIDE_ONLY = false`; `LAB_TRUE_BACK = true` restores the original straight views. The Great Wolf boss is unchanged.

## [0.17.0] - 2026-11-06
### Changed
- **Pixel-art direction: outlined sprites and three-quarter views** (from the new reference sheets and art prompt). Every lab animal (goats, farm dogs, fox, wolf, bat, hawk) now has a crisp 1px dark outline around its whole silhouette (`labOutline`, the palette's near-black), so they read against any ground. Sprites carry a 1px margin (`pad`) and are anchored so feet and shadows stay where they were.
- **Up and down are three-quarter views, not top-down.** Moving up draws the north-east art and moving down draws the south-east art (mirrored for west), so animals show a side-profile or three-quarter face in all directions (`LAB_PAIRS_34`). The old straight-on front/back art is kept behind `LAB_TRUE_BACK` (set it to `true` to restore it; the 0.16.0 back-view widening in `LAB_BACK` is only used then).
- The Great Wolf boss keeps its own art, with no outline and its own front and back views.
- Sheep, the palette, sprite proportions and animation timing are unchanged.
- The smoke test checks that every silhouette-edge pixel is the outline colour, that `pad` is set, that up/down match the three-quarter views, and that the Great Wolf is unchanged.

## [0.16.0] - 2026-11-06
### Changed
- **Online play now runs on PeerJS + WebRTC.** The 6-digit room code is the host's PeerJS id (`getembilly-123456`): HOST A GAME opens a room on the PeerJS broker (the free cloud one by default, or your own PeerServer), and friends type the code to connect directly. No relay to deploy any more. PeerJS 1.5.5 is bundled (`vendor/peerjs.min.js`, MIT) and is inlined into the one-file offline build, copied by the site and demo builds, and cached by the service worker.
  - The game's host-authoritative protocol is unchanged. PeerJS connections are wrapped to look like data channels (`NetCh`), so the same messages are used for PeerJS rooms and for long codes. Each friend opens one reliable and one unordered connection; because PeerJS's unordered mode still retransmits, snapshots and controls now carry sequence numbers and stale ones are ignored.
  - PeerJS adds free STUN and TURN servers, which helps on networks that block direct connections.
  - The long copy-and-paste codes remain as a fallback: automatic when the broker can't be reached or the library didn't load, or with USE LONG CODES INSTEAD.
  - New friendly messages for a wrong code, an unreachable broker, a full room, a host that doesn't answer and a browser that can't do WebRTC.
  - `PEER_URL=https://peer.yourdomain.com/billy` (build scripts) or `?peer=` (once, remembered) points the game at your own PeerServer. `RELAY_URL`, `?relay=` and `NET_RELAY` are replaced by `PEER_URL`, `?peer=` and `NET_PEER`.
- `tools/relay/` (the custom matchmaking service from 0.15) is no longer used by the game. It is kept, with its tests, as an alternative until you decide to remove it.
- `node tests/rooms.js` now runs against a real local PeerJS server (`cd tests && npm install` once): a host, three friends typing the code, a fourth refused as full, a wrong code, a 4-player round with controls and ordered snapshots, the host leaving, and the broker going down.
### Fixed
- **Back views of the goat and all dogs, the wolf and the fox.** From behind, the lab art drew a head wider than the body on thin legs (a bobblehead; the goat looked like a stick figure). Below the head, the body is now widened to shoulders and haunches and the hind legs are split apart, following each frame's own crouch so all 17 animation frames still line up (per-animal settings in `LAB_BACK`). Heads, ears, hats and hair are untouched. The smoke test checks that every body grew.

## [0.15.0] - 2026-11-06
### Added
- **6-digit room codes.** When a relay is set up (see `tools/relay/README.md`), HOST A GAME shows a big 6-digit code (it is also shown in the lobby and on the online screen), friends choose JOIN A GAME, type the code (a space is fine) and connect on their own, with no copy and paste. A full room, a wrong code, a short code, an unreachable relay and a host who doesn't answer each get a clear message. The host's room stays open while the game is played and closes when the host leaves. The long copy-and-paste codes stay as a fallback ("USE LONG CODES INSTEAD", and automatic when the relay can't be reached) and as the mode when no relay is set.
- **The relay** (`tools/relay/`): a tiny matchmaking service that only passes the two handshake messages between a host and a friend; no game data goes through it. One logic core (`core.mjs`) runs in Node (`node-server.mjs`) and as a Cloudflare Worker with a Durable Object (`worker.mjs`, `wrangler.toml`, free plan). Rooms last 20 minutes, are limited in size and tries, and can be locked to your own site with `ALLOWED_ORIGINS`. `node tests/relay_core.js` tests the logic.
- **Putting the game on a domain:** `RELAY_URL=https://relay.yourdomain.com node tools/build_site.js` writes `build/site/` (page with the relay address baked in, manifest, service worker, icons), ready to upload; `--demo` builds the demo site. `RELAY_URL` also works for `tools/build_offline.js` and `tools/build_demo.sh`. A relay can also be set by opening the game once with `?relay=https://...` (remembered; `?relay=off` clears it).
- `node tests/rooms.js`: a host, three friends typing the code, a fourth told the room is full, a wrong code, a 4-player Defend round, closing the room, and the relay going down (the host falls back to long codes).
### Fixed
- A friend could occasionally connect but never be welcomed by the host. They now say hello again every 1.5 s until welcomed, and give up with a clear message after 30 s. Connection events are kept in a short log (`net.log`) for diagnosing problems.

## [0.14.1] - 2026-11-06
### Added
- **One-file offline build**: `node tools/build_offline.js` writes `build/get-em-billy.html` (and `--demo` writes `build/get-em-billy-demo.html`), about 545 KB each. The file holds the whole game (page, code, icons as data URIs; all art and sound are generated in code), makes no network requests, and needs no other file, manifest or service worker. Double-click it, open it from a phone's Files app, or host it anywhere. Online play still needs a connection between the players.
- `node tests/offline.js` builds both files, copies each ALONE into an empty folder, opens it from `file://` with the network switched off, and checks that nothing is requested or fails, the game plays (a Defend round with input), a trailer and the editor open, and there are no errors.

## [0.14.0] - 2026-11-06
### Added
- **Online play** (title screen: PLAY ONLINE). One player hosts and up to 3 friends join; hosts can mix in CPU helpers. It needs no account and no server: the host makes an invite code, the friend pastes it and makes a reply code, and the host pastes that back (codes are about 570 characters and can be sent in any chat; line breaks are ignored). The connection is a WebRTC data channel, and only a public STUN server is used to find each other.
  - The **host runs the whole game**; guests send their controls and draw the host's 20-per-second snapshots, smoothed between updates. Sounds, text, shake, particles and the screen smash are replayed on every guest, so a guest hears and sees what the host does.
  - Every player has **their own camera** following their own animal, so there is no shared-screen leash online. Every Escort route, Defend arena, Daily, Endless and Versus work (a guest can be a wolf). Guests pick their goat or dog, breed and STYLE in an online lobby; the host sees them on the Player Select screen and can kick.
  - A host pause is shown to guests; results and game over appear as an overlay; a leave prompt, a ping readout and "YOU" markers are included. Disconnects, a silent player (15 s), a different game version, a full room and joining mid-game are handled with a clear message.
  - Guests who open the box can also type and paste in it on phones: it is real HTML, so system paste works.
  - Tests: `node tests/online.js` links two separate browsers through the real box and plays Defend, Escort and Versus rounds, covering movement, ram, effects, pause, results, a late joiner, leaving and the host dropping.
- **Demo build** (`tools/build_demo.sh`, optionally `FULL_URL=https://... tools/build_demo.sh`): a static site in `build/demo/` with 3 escort routes, 3 defend arenas, 8 defend waves and the first 3 breeds of each animal. Daily, Endless, Versus and the map editor lead to an upgrade screen that lists what the full game has (and a "GET THE FULL GAME" button when a URL is given). The demo saves under its own keys and cache name, so it can sit beside the full game. Online play is included; a demo host and full-game guests are held to the demo limits. `node tests/demo.js` builds it and checks every limit.
### Changed
- The title item "WATCH DEMO" is now "WATCH PREVIEW" (the attract-mode showcase), so it can't be confused with the demo build.
- Online sessions let players use any breed their own game has unlocked.

## [0.13.0] - 2026-11-05
### Added
- **Farm Dogs trailer** (`tools/trailer/make.sh dogs` writes `build/trailer-dogs/dogs-trailer.mp4`, about 62 s), in the style of the Billy trailer:
  - **Opening cards:** "Every flock needs a dog." and "Meet the ten".
  - **Breed scenes:** each of the 10 farm dogs gets a close-up scene captioned with its name and skill, staged to show that skill:
    - the collie whistling the flock into the pen
    - the corgi heel-nipping
    - the sheltie sprinting
    - the heeler bite-dashing
    - the Old English gathering a scattered flock
    - the shepherd's takedown
    - the Jack Russell's yap frenzy on foxes and bats
    - the Bernese carrying a stray
    - the komondor's ambush
    - the Great Pyrenees roaring a pack away
  - **Ending:** a "Team up with Billy" co-op scene, a "Style every dog" montage, and the logo.
- **The dogs' theme**: a bouncy G-major romp with octave bass, off-beat stabs, claps and a whistled melody (`THEMES.dogs`). Woofs and skill chimes are timed to the barks and skills recorded during the trailer.
- Trailer captions can carry a second line (`sub`). The idle title screen cycles the demo, the main trailer, the Billy trailer and the dogs trailer.

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
