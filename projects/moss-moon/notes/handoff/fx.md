# FX agent handoff

**What exists.** `src/systems/lighting.js` (MM.lighting), `src/systems/fx.js` (MM.fx), `src/systems/filter.js` (MM.filter),
`src/systems/vfx-bridge.js` (MM.vfx, Sprite Fusion bridge over the generated `src/systems/sfvfx.js`). Full API, layering,
settings matrix, effect-class table and perf numbers: `notes/FX.md`.
Sprite Fusion credit (MIT © 2026 Hugo Duprez, https://www.spritefusion.com/pixel-art-vfx) is in notes/FX.md; SCREENS should show it in Credits.

**Integration points.** Hooks only (postUpdate, drawGround, light, postEffects, overlay); wrappers on baseline `drawEffect`
(signature spells only), `addParticles` (suppressed for signature colour pairs), `castSpell` (fail fizzle + `spell:fail`),
`hitEntity`/`pickup`/`awardXP`/`drink` (deduped with the bus seams), region/adventure resets, `update` (slow-mo beats).
Signature spells are detected by id/name (`moonbolt emberbloom thornbind frostbell starfall`) and sized from CAMPAIGN's
`mmBloom/mmZone/mmPulse/mmStrike` tile radii. `bosses.js` telegraphs (tile units, kinds danger/poison/frost/darkness/friendly)
are drawn by MM.fx; Starfall's friendly telegraph is absorbed (its own ring is drawn). HUD can listen to `spell:cast/impact/fail`.

**How tested (2026-11-02).** `node tests/fx-test.js` → 21/21 (stress 3000 frames, caps, no growth, flashes, reduced motion,
dormant in sim 'none', sounds/events, telegraphs, perf). `node tests/fx-visual.js` → screenshots reviewed at 2×/3×
(filter off/low/medium, day/dusk/night/storm/dungeon/swamp/frost/forest palettes, 5 spells, 16 effect classes, reduced flashes).
`node tests/smoke.js index.html` pass; `node tools/build.js --sync` + `--check` ok.

**Known issues / requests.**
- `tools/build.js` PLANNED does not yet list `src/systems/sfvfx.js` + `src/systems/vfx-bridge.js` (after filter.js) — request filed
  for CORE in notes/REQUESTS.md; until then the game runs every procedural FX but no Sprite Fusion effects (tests inject them).
- CAMPAIGN request: skip kit-drawing friendly thorn/bloom zones (FX draws them), emit `boss {phase:n}` on phase changes.
- Door glow fires on `state` interior→play and on `door` / `interior:enter|exit` events (INTERIORS may emit them).
- Vendor effects allocate small objects inside their own draw/update (not editable); everything in our modules is pooled.
- Perf numbers are software-raster worst case; `MM.filter.stats()` alone over-reports because it includes the frame raster flush.
- `tests/fx-standin.js` is only used when MM core is absent (kept for isolated testing).
