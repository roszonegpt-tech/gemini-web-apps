# State — Duel in the Rain

**Version:** 0.1.0 · **Updated:** 2026-11-01 · **Status:** playable, feature-complete for the first brief.

## What exists
- `index.html` is the whole app (≈3,000 lines, one `<script type="module">`). Sections are numbered in a header comment: boot, utils, palette, renderer & post, camera, materials & builder, scene, rain catch map, rain & particles, fighter rig, choreography, weather & lightning, audio, UI, main loop.
- `tests/smoke.mjs`, `tests/finale.mjs`, `tests/views.mjs` drive headless Chromium (Playwright, SwiftShader) and save screenshots. All three ran clean (no console errors) on 2026-11-01.

## How it fits together
- Static scenery is merged per material by `Builder` (vertex colours). Layer 1 marks what appears in wet-stone reflections; the reflection pass renders the `world` group mirrored (`scale.y = -1`) into `reflRT`, sampled in screen space by the wet-paving shader.
- The pixel pass renders into `mainRT` (with a depth texture) at `W × H`, then `POST_FS` draws sky, depth outlines and OKLab palette quantization to the canvas, which CSS scales up with `image-rendering: pixelated`.
- Choreography runs as generator coroutines (`spawn`, `wait`, `tween`, `all`). `director()` → `bout()` → `fight()` / `finale()` / `aftermath()`; `approach()` / `leave()` move pairs up and down the steps.
- Fighter poses: a command layer (`cmd`) is smoothed into `cur`; `solve()` computes joints with two-bone IK and `place3D()` positions ~34 boxes.
- Debug handle: `window.__duel` (fighters, D, settings, view, setWeather, callLightning, setCloseup, setVeranda, willOn). `D.forceHow = 'sword' | 'hair' | 'neck'` and `D.forceFinale = true` force an ending.

## Assets
- No external assets. Every mesh is generated and every sound is synthesized. Nothing was taken from the Universal Assets library (not reachable from the cloud session, and none needed).

## Handoff notes
- Nothing is half-finished. See `TODO.md` for device testing and open ideas.
