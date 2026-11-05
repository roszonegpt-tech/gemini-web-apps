# State — Goat Guardian

**Version:** 0.1.0 · **Status:** Playable, feature-complete for the initial spec.

## Snapshot
- The whole game is in `index.html`. It is organized into sections: canvas setup, sprites (pixel matrices), font, audio, environment pre-render, tint, state, particles, input, goat, Boids herd, enemies, waves, update, render, and loop.
- Internal resolution is 480x270. The `FIELD` constant sets the playable area, and the tree band surrounds it.
- Bottom-row trees render on a foreground layer (`fgCanvas`) so entities pass behind them.
- Best score is stored in `localStorage` under the key `goatGuardianBest`, wrapped in try/catch.
- No Universal Assets are used. Everything is procedural.

## Verified
- `node tests/smoke.js` runs with no page errors. Ram hits destroy wolves and bats and stun alpha wolves.
- Visually checked at 960x540 and on an iPhone 13 in landscape.

## Not verified
- Audio has not been listened to, because tests run headless.
- Real touch input has only been code-reviewed, not tested on a device.
