# Changelog

All notable changes to **Riftbound: Spellfire & Steel**. Format: [Keep a Changelog](https://keepachangelog.com/);
versions follow semantic versioning with the pre-release labels requested by the build prompts.
Git commits (and tags, once merged) are the authoritative history.

## [Unreleased]
- Nothing yet.

## [1.0.0-gold] — 2026-10-27
First playable build (starting point: v0.1.0-alpha prompt spec; no prior code existed in this repo).

### Added
- Static-site project under `projects/riftbound-spellfire-steel/` with TypeScript sources, esbuild build,
  committed bundle (`assets/js/riftbound.js`) and standalone single-file builds (`dist/index.html`,
  `dist/releases/riftbound-v1.0.0-gold.html`).
- Engine core: 16:9 letterboxed stage, low-resolution "3D pixel art" rendering (three.js r162), fixed-substep
  loop, FPS tracking, automatic quality downscaling below 45 FPS, catch-all error guard.
- Input mapping layer: keyboard + mouse, virtual touch joysticks/buttons with haptics, standard Gamepad API;
  swappable Space/Shift mapping.
- Collision (circles/boxes, spatial hash, low-cover shot rule) and A* grid navigation with live updates.
- Player mage (Valerius): Arcane Bolt, Flame Burst / Inferno Fireball, Chain Lightning, Vortex Surge, Meteor
  Strike, Teleport Blink, Arcane Ward (80% bullet reduction, drain, break, snap-reflect), Frost Bombs,
  health/mana potions, channelling. Combos: Firestorm, Crystal Spikes, wet + lightning, barrel/crystal chains.
- Vanguard AI: trooper (cover, duck/peek bursts, relocate, flank, grenades), heavy minigunner (armour facing),
  sniper (laser sight, AP rounds, perches), officer (mortar calls, flank orders), drone, attack helicopter,
  sentry turret (hijackable "enchanted turret"), mortar emplacement, dropship reinforcements.
- Boss: General Vance & the Iron Goliath (shield pylons, cannons, rockets, mortars, 50% shield reboot,
  overdrive ram, Vance on foot).
- 4 hand-crafted sectors (`levels/sector1-4.json`) with zones, gates, checkpoints, objectives, events,
  hazards (barbed wire, laser tripwires, anti-magic smoke, rift hazards, portal beams, searchlights),
  mana wells, chests, pools, floating islands, destructible cover.
- Screens: title diorama, campaign map, briefing (rift map, objectives, loadout), Grimoire Upgrade Sanctum,
  settings, credits, challenge trials (sector speedruns), pause, dimensional map, results, defeat;
  intro and ending narrative with subtitles and optional offline narration.
- HUD: portrait, health/mana/ward bars, spell slots + cooldowns, potion counters, objective tracker, boss bar,
  minimap, contextual prompt, reticle + lock-on, damage numbers, directional damage, objective marker/arrows.
- Procedural Web Audio: 59 synthesized SFX recipes, 8 ambient loops, layered orchestral/synth soundtrack.
- Save system (LocalStorage `riftbound.save.v1`, frozen schema), stars, ratings, shards, upgrades, cosmetics.
- Accessibility: reduced motion, colour-blind palettes, aim assist, keyboard/gamepad menu navigation,
  ≥48 px touch targets, ≥16 px text, auto-pause on blur.
- Dev tools: `~` console, F8 free camera, F7 orbit camera, F12/F9 PNG screenshots, stats/save export.
- Tests: `tests/logic.test.mjs` (9 logic tests), `tests/smoke.mjs` (13-step headless end-to-end run).
- Docs: README, architecture, assets manifest, save schema, TESTING, BUGS, progress, STATE, TODO, prompts.
