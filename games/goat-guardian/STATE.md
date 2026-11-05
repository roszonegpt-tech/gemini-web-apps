# State — Goat Guardian

**Version:** 0.8.1 · **Status:** Playable. v0.8.1 redraws the goat: taller than the dog, horns outlined in black, and 8 facing directions.

## Snapshot
- The whole game is in `index.html`. Its sections are: canvases, palette and remap, sprites, font, audio, world generation and rendering, camera, input devices, state, particles, collision, players, herd boids, enemies, modes, lobby, update, render, and boot.
- **Resolution:** `resize()` picks an integer pixel scale `PIX` and sizes the buffer `W×H` (W 120–560, H 180–420) to fill the screen. The world buffer has a 1px margin for sub-pixel camera presentation. The HUD is a separate canvas that is never palette-swapped. All layout must use `W`/`H`, never fixed numbers.
- **Screens:** `TITLE → MODE → PLAYERS → PLAYING → RESULTS / GAMEOVER`, plus `OPTIONS` and `HOWTO`. List screens are built by `screenItems()` and handled by `listEvent()`. The player-select screen uses `playersEvent()`. Taps hit-test against `hits`, which is rebuilt every frame.
- **Goat sprites:** the goat has `E`, `SE`, `NE`, `S` and `N` sets; `faceDir8()` picks one, and W, SW and NW are mirrors. `outlineHorns()` adds the black outline around the `b` horn pixels, and `lowerHead()` builds the ram poses.
- **Sprites:** `SP[kind][dir][frame]`, where dir is N, S, SE or NE; NW and SW are mirrored. `SP[kind].act[dir]` holds the ram and bark poses. `faceDir(fx, fy)` picks the direction.
- **Modes:** `escort`, `defend`, `daily`, `endless`, `versus` and `custom` (an editor map). `isEscort()` covers every escort-like mode. `escortWorld(src)` builds the world for a map index, `'daily'`, `'endless'` or `'custom'`.
- **Mask values:** 0 meadow, 1 forest, 2 pillar, 3 ford (slow), 4 deep water (blocked), 5 brambles (slow; tangles sheep). `blocked()` and `terrainSlow()` read these. Hazards come from `addHazards(def)`, using `def.rivers` and `def.brambles`.
- **Weather:** `def.weather` is `rain`, `wind`, `fog` or `storm`. `applyRemap()` also does the fog and night dithering using a vision grid built by `buildVisGrid()`.
- **Creatures:** enemy types are wolf (with alpha and boss variants), bat, fox and hawk. Sheep types are normal, ram, lamb and golden. Player kinds are goat, dog and wolf (Versus only).
- **Progression:** `bells` and `upg` reset each run. `progress.medals` and `progress.daily` are saved in `goatGuardianMaps`. Looks are defined in `GOAT_SKINS`, `DOG_SKINS` and `WOOL_SKINS`, unlocked by `totalMedals()`.
- **Editor:** the `ED` object holds a 75x175 grid of 8px cells. Share codes look like `GG1|rle|pillars|start|goal` and are saved under `goatGuardianCustom`.
- **Birds:** the `birds` array is filled by `spawnFlock(big)` and updated by `updateBirds()`. `drawBirdShadows()` draws the shadows on the ground layer and `drawBirds()` draws the birds above everything.
- **Trailer:** the `TRAILER` scene list is played through the showcase system with `showcase.trailer = true`. In trailer mode `resize()` uses `dh / 180`, which gives a closer camera, and `drawTrailerOverlay()` draws the cards, letterbox and captions. `window.__trailerMark(id)` is called at every cut so `tools/trailer/` can time the soundtrack.
- **Music:** `updateMusic()` schedules the `THEMES` loops on `musicBus` every frame.
- **PWA:** the service worker registers only when the page is served over http(s), has the manifest link, and isn't running inside an artifact.
- **Pause menu:** while `paused` is true, `pauseView` selects the sub-view: main, options, controls, restart or exit. `pauseItems()` builds each list and `openPause()` opens the menu. The title Exit goes to the `BYE` menu state.
- **Maps:** `ESCORT_MAPS` and `DEFEND_MAPS` each hold 10 definitions. Map 0 in each is the legacy generator (`makeEscortWorld(2, 7777)` and `makeDefendWorld(4242)`). The other maps use `makeEscortMap(def, seed)` and `makeDefendMap(def, seed)` with fixed seeds. `getMapWorld()` keeps a cache of up to 5 maps and `mapPreview()` draws the minimaps. Best results are stored in `localStorage` under `goatGuardianMaps`. Loading goes through `requestLoad()` and the `LOADING` state.
- **CPU helpers:** players with `cpu: true` and `dev` set to `ai<slot>`. `joinCPU()` and `removeCPU()` add and remove them, and `updateAI()` drives them whenever `hasCPU()` is true. Auto helpers are flagged `auto` and removed when you return to Player Select.
- **Demo:** `showcase` and `SCENES` script the attract-mode demo. `updateAI()` drives players whose `dev` is `ai0`–`ai3` through `aiVec`. `startShowcase()` saves the real players and `endShowcase()` restores them. While the demo runs, `rngFn` is a seeded mulberry32 generator.
- **Input:** `dispatch()` runs synchronously inside DOM handlers so fullscreen requests count as user gestures. Gamepads are polled each frame.
- **Palette:** all world art must use the exact `PAL_DAY` hex colours. `applyRemap()` swaps them each frame toward the sunset and dusk palettes. Any colour outside the palette is not swapped, so avoid alpha blending and rotation in world drawing.
- **World mask:** 0 is meadow, 1 is forest, 2 is a pillar. Players and sheep collide with forest and pillars. Wolves pass through the forest and are drawn only as eyes while inside it.
- **Escort:** each mission builds a new world from a path that starts at the bottom and ends at the top. Sheep inside the goal ring are `penned` and safe.
- **Input:** devices are `kbL`, `kbR`, `touch`, and `pad0`–`pad3`. They produce events, which the lobby or the game consumes.
- **Saved data:** best scores are stored in `localStorage` under `goatGuardianBest2` as `{escort, defend}`. Settings are stored under `goatGuardianSettings` as `{sound, shake, fullscreen}`.
- **Assets:** no Universal Assets are used. Everything is procedural.

## Verified
- v0.8.0: the smoke test checks that birds spawn and that the trailer starts, advances and exits back to the title. `tools/trailer/make.sh` rebuilt the 1080p trailer (64.7 s, h264 + AAC) end to end.
- v0.7.0: the smoke test also covers the story intro, Versus (both sides filled, timeout win), Daily and Endless starts, stomp, whistle, buying an upgrade, medals and unlocks, the editor route and share-code round trip, and the colour-safe remap.
- A runtime sweep of every mode, the editor, the story, How to Play, the pause shop and key remap, night and fog had no page errors.
- Over a local http server, the service worker registers and the game reloads offline.
- The full attract demo was re-recorded: the escort pens 10/10 and all scenes complete.
- All 20 maps were checked with a BFS from start to goal using 2px clearance: every route is connected. The largest map takes about 0.7 seconds to generate and render.
- `node tests/smoke.js` prints SMOKE OK. It also covers the pause button, pause Options, Controls, the exit confirmation, title Exit, map select, adding and removing a CPU, Defend on Ruined Plaza with a moving CPU helper, and Next Mission loading map 2. It covers title → mode → players, the 2-player keyboard lobby, the 6-direction check, ram, bark, pause and resume, penning, mission advance, 4-player defend, game over → title, starting and exiting the demo, fullscreen on Play, and filling a 1280×720 window.
- The full demo was recorded twice at 1280×720. Both runs penned all 10 sheep in the escort scene, and all three scenes completed with no errors.
- Screenshots were checked for day, sunset, menu, and defend. A frame renders in about 2.4ms headless.

## Not verified
- Real gamepads. The Gamepad API mapping assumes the standard layout.
- Real touch devices.
- How the audio sounds.
