# Riftbound: Spellfire & Steel

A browser-playable, pseudo-isometric **tactical spell-slinger vs. modern-military shooter**.
Archmage Valerius of the Elyrian Arcane Guard battles the Earth 101st Vanguard Division across a
fused warzone of floating crystal islands, muddy trenches, airfields and bunkers.

- **Look:** low-resolution 3D rendered with nearest-neighbour upscaling ("3D pixel art"), a ~55°
  camera, soft shadow maps and dynamic point lights — modelled on the reference video.
- **Tech:** TypeScript + three.js (WebGL), Web Audio synthesis, Canvas 2D. No external assets:
  every model, texture, sound effect and music track is generated at runtime.
- **Offline:** 100% offline after load. Ships as a static folder *and* a single standalone HTML file.
- **Version:** 1.3.0-beta — see [`VERSION.md`](VERSION.md) · history in [`CHANGELOG.md`](CHANGELOG.md).

## Play

| Option | How |
|---|---|
| Standalone file | Open **`dist/index.html`** (one self-contained file, works by double-click / from iPad Files / any static host). |
| Project folder | Open **`index.html`** at the project root (loads `assets/css/style.css` + `assets/js/riftbound.js`). Works from `file://` too. |
| Local server | `npm run serve` → http://localhost:8080/ |
| GitHub Pages | See [Deployment](#deployment-github-pages). |

Supported: Chrome/Edge 90+, Firefox 88+, Safari 14.1+ (desktop, iPad, iPhone, Android). Landscape recommended on phones.

## Controls

| Action | Keyboard & mouse | Gamepad (standard) | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | Left joystick (right one in left-handed mode) |
| Aim | Mouse (magic reticle, lock-on) | Right stick (aim assist) | Right joystick (auto-casts) |
| Arcane Bolt (primary, hold) | LMB | R2 | Right joystick |
| Secondary spell | RMB | R1 | SPELL (labelled with the spell, e.g. FLAME) |
| Select spell slot 1–4 | 1–4 / mouse wheel | D-pad / Y cycles | CYCLE |
| Teleport Blink | Space | A / Cross | BLINK |
| Arcane Ward (hold; raise just before a hit to **reflect**) | Shift | L2 | WARD |
| Interact / channel mana well | E / R (hold) | X / Square | USE |
| Frost Bomb | Q | L1 | BOMB |
| Health / mana potion | F / G | B / Circle (smart) | POTION (smart) |
| Pause · map | Esc / P · Tab | Start · Select | ❚❚ · MAP |
| Dev console · free cam · orbit cam · screenshot | ` (tilde) · F8 · F7 · F12/F9 | — | — |

Riding the Arcane Golem on touch: aim stick = beam, VOLLEY, DASH, BRACE, LAND (dismount). "Control mapping" in Settings swaps Space/Shift. Menus support Tab / arrow keys / Enter / Esc and the D-pad + A/B.

## New in v1.3.0-beta

- **Mobile controls:** the touch buttons change with what you are doing — on the Arcane Golem they become VOLLEY,
  DASH, BRACE and LAND (the aim stick fires the beam); Challenge Trials hide the actions their rules lock. The SPELL
  button shows your selected spell, BLINK / SPELL show cooldown sweeps, potion and bomb counts sit on their buttons,
  and a MAP button joins pause. Settings add button size (small / medium / large) and a mirrored left-handed layout;
  Pause and Settings offer fullscreen where the browser allows it.
- **Phone landscape:** title, menus and the in-game HUD are rearranged so nothing overlaps on ~390 px-tall screens.
- **Continue:** close the page mid-mission and pick up from the last checkpoint ("Continue" on the title screen).
- **Playtest records (opt-in):** Settings → "Record playtest runs" keeps your last 50 trial runs and golem flights on
  this device; copy or export them to help tune star thresholds and the golem segment.

## New in v1.2.0-beta

- **Golem flight polish:** the golem now glides and bounces cleanly off the flight-corridor edges, spires and gates at
  full dash speed (swept collision), with a camera bump, stone chips and a scrape on hard impacts (slamming in at dash
  speed chips a little armour; Stone Brace softens it).
- **Golem sound:** a stone/arcane engine rumble that rises with speed and darkens while bracing, a beam charge-up and
  ignition, beam pitch that climbs with heat, heat-warning ticks, an overheat steam hiss and heavy footfalls when it lands.
  The AA missile lock warning now sounds inside the golem.
- **Audio balance pass:** spells read clearly over gunfire, the rain and rift beds sit under the spells, and the music
  is a little louder — measured with `npm run test:audio` (details in `notes/design-notes.md`).

## New in v1.1.0-beta

- **Arcane Golem flight (Sector 2):** awaken the golem at the shrine by the flooded trenches (hold **E**),
  fly it over the fence into the flooded strip and destroy the Vanguard anti-air battery. LMB / R2 chest
  beam (watch the heat gauge), RMB / R1 Stone Volley, Space / A Rift Dash, Shift / L2 Stone Brace,
  **E** to dismount over solid ground. Obstacles: homing AA missiles (shoot them down with the beam),
  radar mines, barrier-pylon fences, sandbag emplacements, an attack helicopter.
- **Challenge Trials** (title → Challenge Trials): *Arcane Target Run* (25 targets, Flame Burst only, 90 s),
  *Barrier Survival* (3 minutes of mortars + miniguns, Ward and Blink only), *Rift Onslaught* (5 waves incl.
  helicopters, all spells). 1–3 stars on time and damage; each new star = 40 Crystal Shards (+25 first clear)
  for the Grimoire Sanctum. Sector speedruns live on the same menu.

## Features (v1.0.0-gold)

- **4-sector campaign — "The Shattered Threshold":** Rift Arrival (sanctum × airfield), Trenches of
  Elyria, Fortified Supply Outpost, and The Rift Heart boss arena. Each sector has 2–3 zones with
  gates, checkpoints and objectives (eliminate, destroy jammers / mortars, seal rift anchors, rescue a
  sorcerer, overload a generator, plant C4 on ammo depots, defend the Rift Catalyst, boss).
- **Spells:** Arcane Bolt, Flame Burst (→ Inferno Fireball), Chain Lightning, Vortex Surge, Meteor
  Strike, Teleport Blink, Arcane Ward (absorbs 80% of bullet damage, breaks under fire, snap-reflect),
  Frost Bombs, health/mana potions. **Combos:** Fire + Vortex = Firestorm · Arcane + Frozen = Crystal
  Spikes · Lightning on wet soldiers +50% · lightning detonates fuel drums and crystal clusters.
- **Vanguard AI:** troopers take protective cover, duck/peek and fire 3-round bursts, relocate, flank
  and throw grenades at a mage hiding behind cover; heavy minigunners (armoured front, weak back);
  laser-sighted snipers; officers calling mortar strikes; drones; attack helicopters; hijackable
  sentry turrets; mortar emplacements; dropship reinforcements. A* navigation on a grid that updates
  as cover is destroyed. Line-of-sight fog hides units behind tall walls.
- **Boss:** General Vance & the Iron Goliath — shield pylons, dual cannons, rocket salvos, mortar
  calls, shield reboot at 50%, overdrive ram charges, then Vance ejects in his exo-suit.
- **Destructible world:** sandbags crumble, concrete degrades under heavy magic, wood burns, fuel
  drums explode and chain, crystal clusters emit shockwaves.
- **Systems:** Grimoire Upgrade Sanctum (7 permanent upgrades, spell scrolls, Inferno, robe glows),
  Crystal Shards, Challenge Stars, Arcane Efficiency Rating (S–D), sector speedruns, LocalStorage saves.
- **Presentation:** procedural orchestral/synth soundtrack with combat layers, synthesized SFX,
  ambient rain / rift / artillery / radio chatter, narrated intro and ending (offline system voice,
  optional), subtitles, banners, directional damage indicators, objective markers, minimap.
- **Accessibility:** ≥16 px UI text, full keyboard/gamepad menu navigation, 48 px touch targets +
  haptics, reduced-motion mode, colour-blind palettes, aim-assist slider, auto-pause on focus loss.
- **Developer tools:** `~` console (god mode, infinite mana, no cooldowns, colliders / nav grid / LOS
  overlays, spawn squad / helicopter / mana well / golem, kill all, complete zone, sector teleport,
  save reset / import / export, stats export, FPS / ms / draw calls), F8 free camera, F7 orbit camera,
  F12/F9 HUD-less PNG screenshots, automatic quality downscaling below 45 FPS.

## Develop

```bash
npm install          # three, esbuild, typescript (+ optional: npm i -D playwright)
npm run build        # src/ → assets/js/riftbound.js + dist/index.html + dist/releases/riftbound-v<version>.html
npm run typecheck    # tsc --noEmit (strict)
npm run test:logic   # node logic tests (collision, low-cover rule, A*, save migration)
npm run test:smoke   # headless Chromium end-to-end smoke test (needs Playwright)
npm run test:audio   # audio level meter + mix-balance targets (needs Playwright)
npm run serve        # static dev server on :8080
```

Edit TypeScript under `src/` and level data under `levels/*.json`, then `npm run build`.
The built files (`assets/js/riftbound.js`, `dist/`) are committed so the game stays playable on
GitHub Pages, iPad and iPhone without a build step.

## Project structure

```
riftbound-spellfire-steel/
├─ index.html                 # entry (static folder version)
├─ .nojekyll                  # GitHub Pages: skip Jekyll processing
├─ README.md · LICENSE · .gitignore · package.json · tsconfig.json
├─ CHANGELOG.md · VERSION.md · STATE.md · TODO.md   # versioning + AI handoff
├─ PROMPT.md                  # original build prompt
├─ architecture.md            # system design / module map
├─ assets_manifest.json       # registry of procedural asset IDs (naming convention is frozen)
├─ TESTING.md · BUGS.md · progress.md
├─ assets/
│  ├─ css/style.css           # UI styles
│  ├─ js/riftbound.js         # built bundle (do not edit by hand)
│  └─ images/ audio/ fonts/ models/ sprites/ data/   # reserved (all assets are procedural)
├─ src/
│  ├─ main.ts · game.ts       # bootstrap + game orchestrator / state flow
│  ├─ core/                   # Engine (loop/renderer), Input, StateManager, Save, Physics, Services
│  ├─ audio/                  # AudioEngine (SFX synth), Music (procedural soundtrack)
│  ├─ systems/                # Spell, Projectile, Particle, Fx, LightPool, Prop, Camera, LevelBuilder,
│  │                          #   Objective, UISystem, DevTools
│  ├─ entities/               # Actor, PlayerMage, VanguardEnemy, Boss, Interactables, AllyGolem,
│  │                          #   ArcaneGolem (v1.1 flight segment, v1.2 swept collision + audio)
│  ├─ scenes/                 # World (mission sim), MissionScene, TitleScene, StoryScene,
│  │                          #   ChallengeScene (v1.1 trials)
│  ├─ ui/                     # Hud, Screens, Overlay2D, Minimap, TouchControls, icons
│  ├─ config/                 # balance tables, shared types, version
│  └─ utils/                  # math, rng, procedural textures + models
├─ levels/                    # sector1–4.json hand-crafted level data
├─ saves/                     # save-schema.json + example-save.json
├─ dist/                      # standalone single-file builds (index.html + releases/)
├─ tests/                     # logic.test.mjs, smoke.mjs, audio-levels.mjs (output/ is git-ignored)
├─ notes/                     # design notes, reference-look analysis
├─ docs/                      # extra documentation
├─ prompts/                   # next-build.md (v1.4) + archive/ (v1.1–v1.3 prompts)
└─ scripts/                   # build.mjs, serve.mjs
```

## Deployment (GitHub Pages)

The game is a pure static site with relative paths and no server code.

- **This repository:** enable Pages from the repo root (`main` / `/`). The game is then served at
  `https://<user>.github.io/<repo>/projects/riftbound-spellfire-steel/` (or `…/dist/` for the single file).
  No file in the game folder starts with `_`, so Jekyll processing is harmless; `.nojekyll` is included
  in the project folder for when the project is moved to its own repository (it only takes effect at
  the publishing root).
- **Own repository:** copy this folder as the repo root and publish from `/` (root `index.html`) —
  or publish `dist/index.html` alone.

## Save data

LocalStorage key `riftbound.save.v1` — schema in [`saves/save-schema.json`](saves/save-schema.json).
Export / import / reset from the `~` dev console or Settings. Key names are frozen; new builds may only add keys.

## Credits & licences

Code and procedural content: this project (MIT, see `LICENSE`). Rendering library: three.js r162 (MIT) — its
licence header is retained in the bundle. Visual direction from the provided pixel-art diorama reference video;
gameplay inspirations: Magicka, Helldivers, Alien Swarm, Diablo.
