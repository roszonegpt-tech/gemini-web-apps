# Changelog

All notable changes to this project are recorded here. Versions follow semantic versioning.

## [Unreleased]

## [0.1.0] — 2026-11-01

### Added
- Single-file three.js r170 diorama `index.html` (importmap from jsDelivr, no other downloads).
- Shrine scene built from boxes, cones and extrusions: hall on a stone plinth with veranda, six vermilion pillars, tiled roof with crossed ridge boards and ridge logs, sacred rope with paper zigzags, gate at the top of stone steps, six stone lanterns, 12 × 7 m paved court, koi pond, water pavilion, cedar, maple, bamboo, rain chains.
- Six swordsmen rigged from ~34 boxes each, posed every frame with two-bone IK (arms and legs), kimono, wide hakama, sash, hanging or tied-back sleeves, topknot or ponytail, umbrellas.
- Swordwork: five stances, six cuts plus a draw-and-cut and a parting cut from the bind, each a hilt/point path with a sliding step; parries, slips and grazes (sleeve, sash or sleeve cord cut, no blood); blade binds; final pass after lightning with three endings (sword in the earth, cut hair cord, blade at the neck); loser kneels and bows, winner shakes off the rain and sheathes; next pair climbs the steps.
- Rain: up to 1,250 wind-leaning streaks that stop on roofs, trees, lanterns and umbrellas, splashes, ripple rings in puddles and the pond, eave and umbrella drips, water running down rain chains.
- Rendering: orthographic isometric camera snapped to whole pixels, low-res target, hard moon shadow, flickering lanterns, depth outlines, 72-colour OKLab palette quantization, optional Bayer dither, Raw 3D toggle, mirrored wet-stone reflections.
- UI: editorial control panel (fighter cards, commentary, win–loss roll, results), weather presets and wind, veranda view, turn, pause, ×3, sound, close-up, pixel size, palette/dither/outline/raw toggles; drag/scroll/pinch camera; keys L, F, P; phone layout; WebGL 2 fallback message.
- Procedural Web Audio: rain bed and drip ticks, wind, thunder, steel clashes, draws, sheathing, cloth cuts.
- Headless test scripts in `tests/`.
