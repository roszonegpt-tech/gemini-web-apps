# Moss Moon — Architecture & Agent Ground Rules

Project root: `projects/moss-moon/` (this folder). Static site, no build step required to play: open `index.html`.
`tools/build.js` (to be written) inlines everything into one self-contained file in `builds/`.

## Hard rules (every contributor)
1. **Classic `<script>` files only** — no ES modules, no `import`, no fetch/XHR of local files (must work from `file://`). All shared state lives on globals; every new module exposes itself on a single global namespace **`window.MM`** (create with `window.MM = window.MM || {}`).
2. **No external libraries or network assets.** Images/audio are embedded as data URIs in `assets/js/*.js` (and may also exist as loose files for editing).
3. **Never edit another owner's files.** Ownership is listed below. If you need a change in a file you don't own, write the exact request in `notes/REQUESTS.md` (append a section) and move on.
4. **Never edit** `builds/baseline/*` (the untouched original) or `src/core/baseline.js` unless you are listed as its owner. The baseline file is the original demo's game code; it is a classic script that shares global lexical scope (`world`, `game`, `ctx`, `SPELLS`, `REGIONS`, …) with the other scripts.
5. Render target: 512×320 internal canvas (`#scene`), pixel-art, `image-rendering: pixelated`, iso tile 32×16, character frame 48×56 (foot at 24,49). UI is DOM/CSS above the canvas (sharp text), never drawn into the canvas.
6. Keep code readable and consistent with a compact, plain-JS style. Guard every cross-module call (`MM.audio?.play(...)`) so a missing module never throws.
7. Test with `node tests/smoke.js index.html out.png` (Playwright/Chromium preinstalled; `require('playwright')` works). Do not claim something works unless you ran it.
8. Log what you did in your own handoff note under `notes/handoff/<agent>.md` (what exists, API, how tested, known issues).

## Namespaces and planned load order in `index.html`
```
assets/js/atlas-data.js   (baseline atlas)        assets/js/cast-data.js (baseline enemy sprites)
assets/js/art-data.js     (MM_ART data URIs)      -- art agent
src/core/mm.js            (MM, bus, settings, state machine, save wrapper)  -- core agent (phase 2)
src/systems/audio.js      MM.audio                -- audio agent
src/systems/art.js        MM.art                  -- art agent
src/systems/cinematics.js MM.cine                 -- cinematics agent
src/config/cinematics.js  MM.CINE_MANIFEST        -- cinematics agent
(phase 2: fx.js, lighting.js, camera.js, campaign.js, ui/*.js …)
src/core/baseline.js      (original game code, patched with MM hook calls in phase 2)
```

## Event bus (provided by core in phase 2; until then modules may use a tiny local fallback)
`MM.bus.on(name, fn)`, `MM.bus.emit(name, data)`. Planned events: `state`, `cast`, `hit`, `kill`, `harvest`, `plant`, `water`, `pickup`, `levelup`, `region`, `dungeon`, `boss`, `quest`, `cine:start`, `cine:end`, `save`, `settings`.

## Audio API contract (audio agent implements)
`MM.audio.init()` (call on first user gesture), `MM.audio.setVolume(bus, 0..1)` for buses `master|music|sfx|cine`, `MM.audio.music(trackId, {fade})`, `MM.audio.sfx(id, {pan, rate, volume})`, `MM.audio.stopAll()`, `MM.audio.duck(amount, ms)`, `MM.audio.getVolumes()`, `MM.audio.ready`.

## Cinematics API contract (cinematics agent implements)
`MM.cine.play(sceneId, {onEnd, skippable})` → Promise resolving `{id, skipped}`; `MM.cine.skip()`, `pause()`, `resume()`, `isPlaying()`, `setSubtitles(bool)`, `setReducedMotion(bool)`. Fires `MM.bus` events `cine:start` / `cine:end` if bus exists. Never grants rewards itself — the caller does it identically for watched and skipped scenes.

## Art API contract (art agent implements)
Sprite sheets are generated from `art/*.px.js` with the **claude-pxl** tool (cloned at `/home/user/crsolver/claude-pxl`, run `node /home/user/crsolver/claude-pxl/bin/pxl.js build <file> --out <dir>`; read its `SKILL.md`, `reference.md`, `lighting.md`). Exposed in the game as `MM.art.draw(ctx, spriteName, x, y, {frame, scale, flip, alpha})`, `MM.art.get(name)`, `MM.art.has(name)`, `MM.art.names()`, with anchor = bottom-center foot point unless the manifest says otherwise.

## File ownership (phase 1)
| Agent | Owns |
|---|---|
| audit | `notes/BASELINE_AUDIT.md` (read-only on code) |
| art | `art/**`, `assets/images/**`, `assets/js/art-data.js`, `src/systems/art.js`, `tests/art-*.js`, `notes/ART_DIRECTION.md`, `notes/handoff/art.md` |
| audio | `src/systems/audio.js`, `tests/audio-*.js`, `notes/handoff/audio.md` |
| cinematics | `src/systems/cinematics.js`, `src/config/cinematics.js`, `assets/video/**`, `tests/cine-*.js`, `notes/CINEMATICS.md`, `notes/handoff/cinematics.md` |
