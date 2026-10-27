# Changelog

All notable changes to **Riftbound: Spellfire & Steel**. Format: [Keep a Changelog](https://keepachangelog.com/);
versions follow semantic versioning with the pre-release labels requested by the build prompts.
Git commits (and tags, once merged) are the authoritative history.

## [Unreleased]
- Nothing yet.

## [1.1.0-beta] — 2026-10-27
Implements `prompts/archive/v1.1.0-beta.md`. Code changes are confined to the four files the prompt allows
(`src/entities/ArcaneGolem.ts`, `src/scenes/ChallengeScene.ts`, `src/systems/UISystem.ts`, `src/game.ts`);
`src/core/Engine.ts`, `src/audio/AudioEngine.ts` and `assets_manifest.json` are unchanged.

### Added
- **Arcane Golem flight segment (Sector 2):** a golem shrine near the flooded trenches; hold E to awaken and
  mount the golem, fly it with inertial drift over the fence into the flooded strip, sweep the chest laser
  beam (heat gauge + overheat), Stone Volley (RMB), Rift Dash (Space), Stone Brace (Shift, −70% damage),
  stone-armour durability; dismount anywhere on solid zone-B ground; parked golems can be re-mounted;
  a destroyed golem throws the mage clear and re-forms at its shrine.
- **Aerial obstacles:** anti-air missile towers (homing missiles the beam can shoot down), radar mines,
  barrier-pylon energy fences, sandbag emplacements with troopers, and an attack helicopter.
- New required Sector 2 objective "Arcane Golem: destroy the AA battery" (4 towers).
- **Challenge Trials** (`ChallengeScene`): Arcane Target Run (25 targets, Flame Burst only, 90 s),
  Barrier Survival (3 min of mortars + minigun nests, Ward + Blink only), Rift Onslaught (5 escalating
  waves incl. drones and helicopters, all spells). 1–3 star grading on time and damage; records in
  `SaveData.challenges`; each new star converts into 40 Crystal Shards (+25 on first clear).
- Challenge Trials menu (trials + sector speedruns), trial results screen, golem armour/heat HUD.
- Golem/AA sounds via `AudioEngine.registerRecipe` and loop builders (no engine changes).
- Smoke test steps for the golem segment and trials.

### Changed
- `package.json` version → 1.1.0-beta; new standalone build `dist/releases/riftbound-v1.1.0-beta.html`.
- Floating islands above the Sector 2 flight course are lifted out of the camera's way during the segment.

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
