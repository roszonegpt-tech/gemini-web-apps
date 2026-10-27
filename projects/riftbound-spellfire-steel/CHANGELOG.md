# Changelog

All notable changes to **Riftbound: Spellfire & Steel**. Format: [Keep a Changelog](https://keepachangelog.com/);
versions follow semantic versioning with the pre-release labels requested by the build prompts.
Git commits (and tags, once merged) are the authoritative history.

## [Unreleased]
- Nothing yet.

## [1.4.0-beta] — 2026-10-27
Implements `prompts/archive/v1.4.0-beta.md`. Code changes stay in the prompt's files (`UISystem.ts`, `Overlay2D.ts`,
`game.ts`, `assets/css/style.css`, tests, notes, docs). `Engine.ts`, `AudioEngine.ts`, `World.ts`, save keys and
asset IDs are unchanged.

### Added
- **Portrait phones:** instead of a "rotate your device" hint, phones and small tablets held upright get a
  handheld-style layout — the 16:9 game view pinned to the top, a status strip below it (health / mana / ward,
  objectives, subtitles), then the sticks and buttons with the whole lower half as stick area. Menus fill the screen.
  Rotating back to landscape restores the v1.3 layout instantly.
- **Export panel:** playtest records, save data and mission stats open in a panel with the text selectable, a Copy
  button (with a manual-select fallback) and Download — exports now work inside the claude.ai artifact, where
  downloads are blocked (BUGS #22).
- `npm run playtest:summary` (`tests/playtest-summary.mjs`) summarises exported records dropped into
  `notes/playtest/` (runs, completion, median / quartiles of time and damage, golem medians) and suggests star
  thresholds once there are ≥ 10 completed runs from ≥ 3 players.
- Smoke steps for the portrait layout (and switching back) and the export panel.

### Fixed
- Off-screen objective labels no longer cover the touch-mode objectives box, gauges, slots or buttons; the overlay
  steps labels out of HUD rectangles reported by `UISystem` (BUGS #21).

### Balance
- Unchanged: `notes/playtest/` has no records yet, so there is no data to tune from.

### Changed
- `package.json` version → 1.4.0-beta; new standalone build `dist/releases/riftbound-v1.4.0-beta.html`.

## [1.3.0-beta] — 2026-10-27
Implements `prompts/archive/v1.3.0-beta.md` plus the requested **mobile controls** pass. Code changes stay in the
prompt's files (`MissionScene.ts`, `ChallengeScene.ts`, `ArcaneGolem.ts`, `UISystem.ts`, `Screens.ts`, `game.ts`,
`Save.ts` — added keys only) plus, for the mobile work, `src/ui/TouchControls.ts` and `assets/css/style.css`.
`Engine.ts`, `AudioEngine.ts`, `World.ts`, existing save key names and asset IDs are unchanged.

### Added
- **Context-aware touch controls:** riding the Arcane Golem relabels the buttons (VOLLEY / DASH / BRACE / LAND, the aim
  stick fires the beam; LAND only shows over solid ground); Challenge Trials hide the actions their rules lock and
  retarget the aim stick (Target Run: aim stick casts Flame Burst; Barrier Survival: aim only).
- SPELL button shows the selected spell (FLAME / CHAIN / VORTEX / METEOR / INFERNO); cooldown sweeps on BLINK / SPELL
  (DASH / VOLLEY on the golem); potion and bomb counts as badges; a **MAP** button next to pause.
- Settings: **Touch button size** (small / medium / large) and **Touch layout** (right- or left-handed, mirrored).
- **Toggle Fullscreen** in Pause and Settings where the browser supports it (locks landscape on Android).
- **Continue from checkpoint:** reaching a zone checkpoint saves sector, zone, mission stats and consumables to
  `campaign.checkpoint`; the title and campaign screens offer "Continue · Sector N · checkpoint M" after a reload.
  A fresh deploy or a completed mission clears it; speedruns never save one.
- **Opt-in local playtest records** (Settings → "Record playtest runs", off by default): every trial run (complete /
  failed / quit / restart: time, damage, stars, kills, score) and every flown golem segment (time mounted, armour lost,
  impacts, overheats, missiles shot down, crashes, towers left). Newest 50 kept in `stats.playtest`; Copy / Export
  (.json) / Clear in Settings. Nothing is sent anywhere.
- `npm run test:audio` meters the golem engine live at top speed and while bracing (new target: beam ≥ 4 dB over the
  rumble at full speed — measured +6.4 dB at 9.1 m/s).
- Tests: logic tests for the new save keys / checkpoint sanitizing / playtest cap; smoke steps for touch contexts and a
  real BLINK button press, the phone-landscape title fit, checkpoint → page reload → Continue, playtest records and the
  in-page reset confirmation.

### Changed
- Phone landscape (viewport height ≤ 500 px): title logo beside the menu, compact menus, two-column pause menu, HUD and
  banners one step smaller.
- Touch-mode HUD: status + objectives top-left, compact spell slots + minimap top-right, pause / map top-centre, golem
  and boss gauges below them, consumable list replaced by button badges; banners sit lower.
- Reset Save Data asks for a second tap inside the page instead of a browser `confirm()` dialog (which embedded views
  such as the claude.ai artifact block).
- `package.json` version → 1.3.0-beta; new standalone build `dist/releases/riftbound-v1.3.0-beta.html`.

### Fixed
- Quick taps on touch buttons (BLINK, POTION, BOMB, CYCLE, MAP) could be lost on slow devices when the press and
  release both happened between two frames; taps now hold until the game has polled input.
- Hiding the touch layer could switch a mouse/keyboard session into touch mode (a release through `Input.setVirtual()`
  marks the device), letting the aim-stick zone cover the mouse — caught by the smoke suite before release.
- Phone landscape: the title menu's last button overlapped the footer, and the touch pause button overlapped the
  objective panel and spell slots.

### Removed
- The superseded sector-speedrun `challengeScreen` from `src/ui/Screens.ts` (BUGS #15).

### Balance
- Trial star thresholds and golem numbers are **unchanged**: no human playtest data exists yet. The new playtest
  records are the way to collect it.

## [1.2.0-beta] — 2026-10-27
Implements `prompts/archive/v1.2.0-beta.md`. Code changes are confined to the files that prompt allows
(`src/entities/ArcaneGolem.ts`, `src/game.ts`, `assets_manifest.json` — additive only — plus tests and docs);
`src/core/Engine.ts`, `src/audio/AudioEngine.ts` and the save schema are unchanged.

### Added
- **Swept golem collision response:** the flight step is split into sub-steps of ≤ ¼ radius (≤ 0.35 m at the 22 m/s
  dash), each resolved against `CF.FLY` geometry (spires, hangars, tall walls, gates) and a two-rectangle flight
  corridor with a correct inside corner; velocity reflects about the contact normal (restitution 0.35, scrape 0.85);
  knockback is swept too. Hard impacts: camera bump, stone chips + sparks, `golemScrape` crunch; light, non-lethal
  self-damage above 12 m/s (softened by Stone Brace).
- **Golem audio:** engine rumble whose pitch / filter / grind follow speed and Stone Brace; beam pitch rising with
  heat; 0.15 s beam charge-up (sound + core flare + converging sparks) and ignition crack; heat-warning ticks above
  80%; overheat steam hiss + venting; twin stone footfalls + dust when the golem lands after a dismount or re-forms
  (now dropping onto its shrine). New recipes: `golemScrape`, `golemStomp`, `golemCharge`, `golemOverheat`, `golemHeatWarn`.
- **Audio balance pass:** `AUDIO_MIX` dB trims in `src/game.ts` layered over the public AudioEngine API (music bus +4.5,
  player casts +2…+5, rifle −1.5, rain −14, rift drone −8) and rebalanced golem levels; measured before/after in
  `notes/design-notes.md`.
- `tests/audio-levels.mjs` (`npm run test:audio`): offline, seeded, approximately K-weighted level meter for every recipe
  and loop + live bus meter + 11 mix-target checks (v1.1: 4/11 pass, v1.2: 11/11).
- `assets_manifest.json`: 24 new IDs (the 19 v1.1 assets + 5 v1.2 golem sounds), with a `since` field; no IDs renamed.
- Tests: logic test for manifest consistency (every synthesized recipe registered), smoke steps for dash-speed
  collision (edges, inside corner, gates, 120 seeded random dashes) and for golem audio / landing / mix table.

### Changed
- The AA missile **lock warning** sounds inside the golem (non-positional) and is longer/louder, so it is heard at any
  lock range over the engine and beam.
- `package.json` (and the stale `package-lock.json` header) version → 1.2.0-beta; new standalone build
  `dist/releases/riftbound-v1.2.0-beta.html`.

### Fixed
- Golem could graze up to 0.07 m into tall geometry at dash speed and stick on the corridor's inside corner
  (BUGS #11): 0 penetrating frames in 11 478 dash-speed frames after the change (v1.1: 21).
- Explosion knockback moved the airborne golem with the ground resolver (low cover could block it, and it could be
  pushed past the corridor edge).

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
