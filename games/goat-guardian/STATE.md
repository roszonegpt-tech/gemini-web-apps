# State — Goat Guardian

**Version:** 0.2.0 · **Status:** Playable. v0.2.0 was a full visual and gameplay rewrite.

## Snapshot
- The whole game is in `index.html`. Its sections are: canvases, palette and remap, sprites, font, audio, world generation and rendering, camera, input devices, state, particles, collision, players, herd boids, enemies, modes, lobby, update, render, and boot.
- **Resolution:** the internal buffer is 160×288, plus a 1px margin used for sub-pixel camera presentation. The HUD is a separate canvas that is never palette-swapped.
- **Palette:** all world art must use the exact `PAL_DAY` hex colours. `applyRemap()` swaps them each frame toward the sunset and dusk palettes. Any colour outside the palette is not swapped, so avoid alpha blending and rotation in world drawing.
- **World mask:** 0 is meadow, 1 is forest, 2 is a pillar. Players and sheep collide with forest and pillars. Wolves pass through the forest and are drawn only as eyes while inside it.
- **Escort:** each mission builds a new world from a path that starts at the bottom and ends at the top. Sheep inside the goal ring are `penned` and safe.
- **Input:** devices are `kbL`, `kbR`, `touch`, and `pad0`–`pad3`. They produce events, which the lobby or the game consumes.
- **Saved data:** best scores are stored in `localStorage` under `goatGuardianBest2` as `{escort, defend}`.
- **Assets:** no Universal Assets are used. Everything is procedural.

## Verified
- `node tests/smoke.js` prints SMOKE OK. It covers the 2-player lobby, ram, bark, penning, mission advance, 4-player defend, and game over.
- Screenshots were checked for day, sunset, menu, and defend. A frame renders in about 2.4ms headless.

## Not verified
- Real gamepads. The Gamepad API mapping assumes the standard layout.
- Real touch devices.
- How the audio sounds.
