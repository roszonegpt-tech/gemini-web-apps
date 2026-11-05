# State — Goat Guardian

**Version:** 0.5.0 · **Status:** Playable. v0.5.0 adds 10 maps per mode, a Map Select screen, and CPU helpers.

## Snapshot
- The whole game is in `index.html`. Its sections are: canvases, palette and remap, sprites, font, audio, world generation and rendering, camera, input devices, state, particles, collision, players, herd boids, enemies, modes, lobby, update, render, and boot.
- **Resolution:** `resize()` picks an integer pixel scale `PIX` and sizes the buffer `W×H` (W 120–560, H 180–420) to fill the screen. The world buffer has a 1px margin for sub-pixel camera presentation. The HUD is a separate canvas that is never palette-swapped. All layout must use `W`/`H`, never fixed numbers.
- **Screens:** `TITLE → MODE → PLAYERS → PLAYING → RESULTS / GAMEOVER`, plus `OPTIONS` and `HOWTO`. List screens are built by `screenItems()` and handled by `listEvent()`. The player-select screen uses `playersEvent()`. Taps hit-test against `hits`, which is rebuilt every frame.
- **Sprites:** `SP[kind][dir][frame]`, where dir is N, S, SE or NE; NW and SW are mirrored. `SP[kind].act[dir]` holds the ram and bark poses. `faceDir(fx, fy)` picks the direction.
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
- All 20 maps were checked with a BFS from start to goal using 2px clearance: every route is connected. The largest map takes about 0.7 seconds to generate and render.
- `node tests/smoke.js` prints SMOKE OK. It also covers map select, adding and removing a CPU, Defend on Ruined Plaza with a moving CPU helper, and Next Mission loading map 2. It covers title → mode → players, the 2-player keyboard lobby, the 6-direction check, ram, bark, pause and resume, penning, mission advance, 4-player defend, game over → title, starting and exiting the demo, fullscreen on Play, and filling a 1280×720 window.
- The full demo was recorded twice at 1280×720. Both runs penned all 10 sheep in the escort scene, and all three scenes completed with no errors.
- Screenshots were checked for day, sunset, menu, and defend. A frame renders in about 2.4ms headless.

## Not verified
- Real gamepads. The Gamepad API mapping assumes the standard layout.
- Real touch devices.
- How the audio sounds.
