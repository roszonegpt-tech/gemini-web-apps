# Get em Billy

*(Formerly Goat Guardian. The folder is still `games/goat-guardian/`, so links and saved progress keep working.)*

A lo-fi portrait herding game for 1–4 local players. Each player is a **goat** or a **dog**, in any combination. Guide the flock across a scrolling forest world while shadow wolves and bats hunt it, and day fades into sunset.

All art is drawn from pixel matrices in code, and all sound is synthesized with the Web Audio API. The game uses no external assets or libraries.

## Run
- Open `index.html` in any modern browser (desktop, iPad, or iPhone). No build step or server needed.
- GitHub Pages: works as a static site and includes `.nojekyll`.

## What's in the game
- **5 modes:** Escort (10 routes), Defend (10 arenas), Daily Challenge, Endless, and Versus (wolves against shepherds).
- **Online play:** one player hosts and up to 3 friends join with a 6-digit room code (PeerJS + WebRTC).
- **Shepherds:** Billy the goat (ram charge; the stomp is an upgrade bought with bells; rammed foes can smash into the screen) and the dog (bark, plus a skill that depends on the breed). In Versus, players can also be wolves (lunge, plus howl).
- **Breeds:** 9 goat breeds and 10 farm dogs, unlocked with medals. Each dog has its own speed, herding push and skill (see Farm dogs below).
- **Sheep:** normal, stubborn ram, quick lamb, and golden.
- **Predators:** shadow wolf, alpha wolf, fox, hawk, bat, and the Great Wolf boss.
- **World:** fords, rivers with bridges, and brambles. Weather can be rain, wind, fog or storm, and nights are lit only by lanterns.
- **Progression:** medals per map unlock goat breeds, farm dogs and wool colours. Bells are spent on upgrades during a run.
- **Map editor** with share codes; saved maps can be played as "MY MAP".
- **Story intro**, synthesized chiptune music, and an attract-mode demo.
- **Accessibility:** remappable keys, a colour-safe palette, reduced flashing, and game speed.
- **Installable app:** when served from GitHub Pages it installs to a home screen and works offline.

## Play online
Title screen, PLAY ONLINE. One player hosts and up to 3 friends join. It uses **PeerJS** (WebRTC), bundled in `vendor/peerjs.min.js`, so there is nothing to install or run.

**6-digit room codes (default):** the host chooses HOST A GAME and reads out the 6-digit code (shown big, and again in the lobby); friends choose JOIN A GAME and type it. The game connects them directly. The code is the host's PeerJS id; the free PeerJS cloud broker only introduces the players, no game data goes through it.

**Long codes (fallback):** if the broker can't be reached, or you choose USE LONG CODES INSTEAD, you can swap longer codes by copy and paste with no server at all (also works on a local network with no internet):
1. **Host:** MAKE INVITE CODE, COPY it and send it to a friend in any chat.
2. **Friend:** paste the invite, MAKE MY REPLY CODE, COPY it and send it back.
3. **Host:** paste the reply and press CONNECT. Repeat with a new invite code for each friend.

The host picks a mode as usual; friends choose their animal, breed and STYLE in the online lobby. The host's device runs the game, so a good connection for the host matters most. Everyone needs the same game version. PeerJS brings free STUN and TURN servers, which helps on strict networks (they are shared and best-effort). Each player gets their own camera.

**Your own broker (optional):** the PeerJS cloud is free but has no guarantees. To run your own, install the PeerJS server (`npm i -g peer`, then `peerjs --port 9000 --path /billy`, behind https) and build with `PEER_URL=https://peer.yourdomain.com/billy`, or open the game once with `?peer=https://peer.yourdomain.com/billy` (remembered; `?peer=default` clears it).

Tests: `node tests/online.js` (long codes) and `node tests/rooms.js` (6-digit codes against a local PeerJS server; run `cd tests && npm install` once).

## Putting it on your own domain
`node tools/build_site.js` writes `build/site/` (the page, `vendor/`, manifest, service worker, icons); upload it to any static host over https (a free GitHub Pages or Cloudflare Pages site is enough). It installs as an app and plays offline after the first visit. Add `PEER_URL=...` only if you run your own PeerServer.

## One-file offline build
`node tools/build_offline.js` writes **`build/get-em-billy.html`**: the whole game in a single file (about 545 KB) that works with no internet and no other files. Double-click it, send it to a phone, or host it anywhere. `node tools/build_offline.js --demo` writes the demo as one file too. Run `node tests/offline.js` to check that each file works alone, offline, from `file://`. (PeerJS is inside the file. Online play still needs a connection between the players, and a single file can't be installed as an app; use the hosted version for that.)

## Demo build
`tools/build_demo.sh` writes a free demo to `build/demo/` (set `FULL_URL=https://...` to add a "GET THE FULL GAME" button). The demo has 3 escort routes, 3 defend arenas, 8 defend waves and the first 3 breeds of each animal; the other modes and the map editor show an upgrade screen. It keeps its own saves and cache name. Run `node tests/demo.js` to check the limits.

## Trailer
- **Farm Dogs trailer:** `tools/trailer/make.sh dogs` writes `build/trailer-dogs/dogs-trailer.mp4`, about 62 s, scored with the dogs' theme.
- **Billy trailer:** `tools/trailer/make.sh billy` writes `build/trailer-billy/billy-trailer.mp4`, about 55 s, scored with Billy's own theme.
- In the game, the title screen alternates between the gameplay demo and the trailer when left idle.
- **TikTok / Reels / Shorts versions:** add `tiktok`, e.g. `tools/trailer/make.sh billy tiktok` or `dogs tiktok`. They write `build/trailer-billy-tiktok/billy-trailer-tiktok.mp4` and `build/trailer-dogs-tiktok/dogs-trailer-tiktok.mp4`: 1080x1920 (9:16), 30 fps, H.264 + AAC. The game is recorded in a portrait window, so the picture is laid out for a phone (about 120 world pixels across, full-bleed, story cards wrapped, captions kept in the middle of the screen above the app's buttons), not cropped from the wide version.
- To build the video file, run `tools/trailer/make.sh` (needs Node, Playwright and ffmpeg). It writes `build/trailer/get-em-billy-trailer.mp4`: 1080p, about 65 s, with a soundtrack synthesized from the game's music.

## Maps
- **Escort routes:** 1 Meadow Run (the original), 2 Birch Bend, 3 Switchbacks, 4 Twin Trails, 5 Stone Road, 6 Wolf Hollow, 7 Open Moor, 8 Lake of Pines, 9 The Long March, 10 Sunset Summit. Routes 2–10 get longer and wider.
- **Defend arenas:** The Henge, Twin Glades, Ring Road, Crossroads, Ruined Plaza, Crescent, Grove Isles, Long Valley, Clover, Great Circle.
- Choose a map on the Map Select screen, which shows a minimap preview. Escort continues through the routes in order.

## AI helpers
On Player Select, press H (keyboard), Y (gamepad) or tap "+ CPU" to add an AI goat or dog. Remove one with N, LB or "REMOVE". With **Solo AI helper** set to AUTO in Options (the default), playing alone brings in a CPU partner automatically.

## Modes
- **Escort**: drive the herd from the start pin (bottom) through the woods to the pen at the red pin (top). Sheep that enter the pen are safe. A mission is complete when every remaining sheep is penned. The next mission is longer and harder, and its herd is the sheep you delivered plus 2 lambs.
- **Defend**: endless waves around a stone henge. Clearing a wave returns 1 lamb.

## Preview
Choose **Watch Preview** on the title screen, or leave the title screen idle for 30 seconds. AI goats and dogs then play Escort, 4-player Defend, Nightfall and Farm Dogs, with on-screen labels for every unit. Farm Dogs cycles through all 10 breeds using their skills. Press any button to exit.

## Characters
| | Goat | Dog |
|---|---|---|
| Action | **Ram charge**: a fast dash that launches and destroys predators (alpha wolves take 2 hits) | **Bark**: shoves nearby sheep away and stuns predators, which then run off (alpha wolves need 2 barks) |
| Herding | Sheep follow the goat (lead from the front) | Sheep move away from the dog (push from behind) |
| Speed | Slower and heavier | Fast and agile |

Ram or bark a predator that is carrying a sheep and the sheep is saved.

## Goat breeds
Saanen, Alpine (both available from the start), Boer (1 medal), Kid Brown (2), Nubian (3), Valais Blackneck (5), Toggenburg (7), Golden Guernsey (9), Oberhasli (12), Pygmy (16), Chocolate (20) and Panda (26). Goat breeds are colourways of the Rusty Lab goat and change the look only.

## Customization (STYLE)
On Player Select, press the ability button (E, `.`, gamepad X) or tap **STYLE** on your card. You can pick:
- breed and coat colourway
- eyes
- hat: Hood, Bandana, Witch hat, Horned helm or Mushroom
- hair: Shaggy, Spikes, Mohawk or Top knot
- outfit: Vest, Tunic, Robe, Poncho or Fur wrap
- earring, warpaint and bell collar

Each item has its own colour options. The preview turns through all 8 directions and plays idle, walk, run and attack. Looks are saved per animal.

## Farm dogs
Only working farm breeds are included: herders, livestock guardians and a farm terrier. On Player Select, Up/Down (or tapping the preview) changes the breed. The last breed you picked is remembered.

| Dog | Medals | Skill (ability button) | Trait |
|---|---|---|---|
| Border Collie | 0 | Whistle: sends nearby sheep to the goal | All-round herder |
| Corgi | 2 | Heel Nip: a short dash that stuns foes and drives sheep | Low and nimble |
| Shetland Sheepdog | 4 | Sprint: 3 s at 1.55x speed with a wider push | Fastest herder |
| Australian Cattle Dog | 6 | Bite Dash: a dash that takes down foes | Tough blue heeler |
| Old English Sheepdog | 8 | Gather: calls every sheep within 140 px to the dog | Big, gentle push |
| German Shepherd | 10 | Takedown: lunges at the nearest foe, 2 damage | Bark stuns 1.8x longer |
| Jack Russell Terrier | 12 | Yap Frenzy: 3 quick barks | Ratter: bark defeats foxes and bats |
| Bernese Mountain Dog | 15 | Carry: picks up a sheep (safe from predators) and drops it; dropping inside the pen pens it | Strong farm dog |
| Komondor | 18 | Ambush: pounces and stuns everything within 32 px | Sheep drift to it, and predators can't see sheep beside it |
| Great Pyrenees | 22 | Roar: every foe within 110 px flees | Guardian aura slows foes within 55 px |

## Art
The goat, wolf, fox and farm dogs come from **Rusty Lab v0.13.1**, the user's sprite lab. The data is embedded in `index.html` as `LAB`, and each frame is shrunk to the game's sprite scale when it is baked. The Great Wolf, bat and hawk were made to the same standard. Sheep keep the original game art.

## Animation
Every animal faces 8 directions and has a 4-frame walk and a 4-frame bounding gallop. During the gallop the body bobs and the head pitches down on the reach. Dogs also sit after 2.5 s idle and lie down after 7 s, lifting their head when a predator comes near. They sniff when moving slowly, and open their mouth to bark and bite.

## Controls
| Device | Move | Action | Notes |
|---|---|---|---|
| Keyboard left | WASD | Space or left-click; ability E or right-click | With only one keyboard player, the arrows and Enter also work. Keys can be remapped in Options |
| Keyboard right | Arrow keys | Enter or Right Shift; ability `.` | |
| Gamepads 1–4 | Left stick or D-pad | A; ability X or B | Y changes CPU orders, Start pauses |
| Touch | Drag on the left side | Tap on the right side; ability button in the bottom-right | Pause button in the top-right corner |

**Menus:** Title → Mode → Players. In menus, Up/Down moves the cursor, Action selects, and Back (Esc, Backspace or B) goes back. On the Players screen, any new device presses Action to join. Left/Right switches between goat and dog, and Action readies up. The game starts when everyone is ready. Options covers sound, screen shake and fullscreen.

**In game:** click or tap the pause button in the top-right, or press P, Esc or Start, to open the pause menu. It offers Resume, Restart, Options, Controls and Exit to Title. M toggles sound, F toggles fullscreen, and R retries after a game over. The title menu also has Exit.

## Tech notes
- Adaptive low-res buffer drawn at a whole-number pixel scale. Its size follows the screen, so the game fills portrait phones and landscape monitors.
- Six facing directions for every animal: front, back and four diagonals.
- The camera follows the average position of all players with lerp damping and leads in the direction they're moving. The world is drawn at a sub-pixel offset, so scrolling is smooth even though the art is chunky.
- Everything is drawn in a 12-colour day palette. Each frame is then palette-swapped pixel by pixel toward the sunset and dusk palettes.
- Worlds are procedural: a forest mask, rounded tree crowns, undergrowth bands with trunks, stone pillars, and a pen at the goal.
- Players share one camera and are kept inside its view.

## Structure
```
goat-guardian/
├─ index.html              # entire game (HTML/CSS/JS)
├─ manifest.webmanifest    # installable app manifest
├─ sw.js                   # service worker (offline cache)
├─ assets/icons/           # app icons (192, 512, maskable 512)
├─ .nojekyll
├─ README.md
├─ CHANGELOG.md
├─ VERSION.md
├─ STATE.md        # AI handoff snapshot
├─ TODO.md
├─ tests/smoke.js          # Playwright headless smoke test
└─ tools/trailer/          # trailer recorder + soundtrack renderer (output goes to build/, ignored by git)
```
