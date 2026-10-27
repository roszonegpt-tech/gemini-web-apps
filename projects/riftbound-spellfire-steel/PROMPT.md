# Riftbound: Spellfire & Steel — Complete Build Prompt

> Original v1.0.0-gold build prompt, preserved verbatim for future builds and AI handoff.
> Reference look: a screen-recorded pixel-art 3D diorama video (wizard with a pink pointed hat, ~45° camera,
> stone pyramids, striped-cap posts, sun-gate archway, pond). See `notes/reference-look.md`.
> Implementation notes on how this prompt was interpreted for this repository are in `notes/design-notes.md`.

## Agent Instructions
Build: A single-page, browser-playable top-down / pseudo-isometric tactical shooter and spell-slinger game featuring mages fighting a high-tech modern military army.
Work inside: `/src` directory (`index.html`, `js/`, `css/`, `assets/`).
Read these project files first: `README.md`, `architecture.md`, `assets_manifest.json`.
Preserve: Engine core loop, input mapping layer, state manager, audio synth engine, dynamic collision & render pipeline.
Do not change: Save state schema key names, asset naming conventions in manifest.
Do not include: External heavy engine runtimes (e.g., Unity WebGL, Unreal HTML5 exports), bloat libraries, or online multiplayer server dependencies.

## Product Target
Game title: Riftbound: Spellfire & Steel
Genre: Top-Down / Pseudo-Isometric Tactical Action Shooter & Arcane Combat
Player experience: Fast-paced tactical spellcasting vs. suppressive military ballistic fire; maneuvering around arcane wards and concrete sandbags, managing mana wells, and fighting off heavy gunners, snipers, and mechanized tanks.
Target platform: Web Browser (Desktop and Mobile Web)
Target audience: Fans of tactical top-down shooters (Helldivers, Alien Swarm), action RPGs (Magicka, Diablo), and cross-genre fantasy-vs-military matchups.
Scope of first playable build: Full 4-level Campaign Chapter (The Shattered Threshold) featuring 3 rift-blended battle zones, 1 boss zone (General Vance & The Iron Goliath Tank), mana supply nodes, protective magical barriers, mounted arc-turrets, and challenge trials.

## Technical Delivery
Engine or framework: Vanilla HTML5 Canvas / WebGL (via Lightweight Canvas2D or Three.js/Phaser 3 embedded)
Programming language: TypeScript / Modern JavaScript (ES6+)
Required file format: Standalone bundled `.html` or single entry static folder suitable for GitHub Pages / Vercel.
Dependencies allowed: Lightweight audio synth (Howler.js or Web Audio API) and vector math helper functions.
Offline requirements: 100% offline playable without external network calls after initial load.
Supported browsers: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+.
Supported devices: PC Desktop, Laptop, Tablet, Mobile (Touch controls).
Save and loading requirements: LocalStorage saving for level completion, grimoire spell upgrades, challenge scores, and settings.
Performance requirements: Solid 60 FPS at 1080p rendering resolution; sub-100ms UI response time.

## Game Identity
Setting: A fractured battleground where floating crystal islands, ancient wizard sanctums, and glowing rune-carved archways collide violently with barbed-wire trenches, sandbag bunkers, and rain-slicked asphalt airfields under a purple cosmic rift sky.
Premise: A catastrophic cosmic event collapsed the boundary between dimensions, fusing the High Magical Realm of Elyria with Earth's militarized 101st Vanguard Division. Convinced the collision was an unprovoked dimensional invasion, both factions blame each other for destroying their homeworlds and have mobilized for total war.
Player role: Archmage Valerius, elite battle-mage of the Elyrian Arcane Guard, deployed behind military lines to destroy army command outposts and close rift anchors.
Main objective: Infiltrate the fused warzone, neutralize army assault units, destroy ballistic mortar artillery, and defeat General Vance before his battalion deploys dimensional drill warheads.
Distinctive feature: Dynamic Spell-Slinging vs. Ballistic Warfare System. Combine instant-cast magic (Arcane Bolt, Flame Burst, Chain Lightning, Teleport Blink) with tactical cover, warding shields, and environmental magic interactions against heavy military automatic fire and explosives.
Characters or factions:
  - The Arcane Order of Elyria (Wizards, Sorcerers, Golem Summons - Player faction).
  - The 101st Earth Vanguard Army (Soldiers, Snipers, Heavy Gunners, Attack Helicopters, Tanks - Opposing faction).

## Full Game Loop
Launch →
Title screen →
Setup (Rift Briefing & Grimoire Spell Selection) →
Core gameplay (Tactical movement, spell casting, ward barrier usage, objective destruction, mana node channeling) →
Win or lose (Mission Complete or Mana Depletion / Death) →
Results (Debriefing, Arcane Efficiency Rating, Challenge Stars, Earned Crystal Shards) →
Restart or return to title

## Screens and Menus
Title screen: Cosmic rift backdrop with swirling purple portal tearing through a military bunker, magic runes clashing with bullet casings, buttons: [Play Campaign], [Challenge Trials], [Spell Grimoire], [Settings], [Credits].
Game setup: Rift map display, mission debriefing text, objective checklist, primary spell loadout selector, and crystal upgrade store.
Gameplay screen: Main HUD (Health bar, Mana meter, Arcane Barrier gauge, active spell slots, potion counters, minimap, rift objective tracker).
Pause menu: Semi-transparent cosmic overlay: [Resume], [Dimensional Map & Objectives], [Controls / Audio Settings], [Restart Mission], [Main Menu].
Settings: Master volume, SFX volume, Music volume, Control mapping toggle, Touch control opacity, Reduced motion toggle, Aim-assist strength.
Results screen: Mission stats (Soldiers Defeated, Spell Accuracy, Wards Cast, Clear Time, Rift Anchors Sealed), Crystal Shards earned, [Next Level], [Replay], [Main Menu].
Other screens: Grimoire Upgrade Sanctum (Upgrade spell damage, mana regen rate, teleport cooldown, barrier resistance), Challenge Trial Menu.

## Camera and Controls
Camera perspective: Pseudo-isometric top-down view (~45-degree angled overhead angle, tracking the player).
Camera behavior: Smooth dynamic panning following the player, auto-zooming outward during large skirmishes or artillery barrages, clamping to level boundaries.
Keyboard controls: WASD or Arrow keys (Movement), Mouse pointer (Spell Aiming), Spacebar or Shift (Blink Teleport / Ward Shield Snap), Left Mouse Button (Primary Spell Fire / Arcane Bolt), Right Mouse Button (Secondary Area Spell / Flame Blast), R (Channel Mana Well), Q (Throw Arcane Potion / Frost Bomb), 1-4 (Cycle Spells / Elemental Stances).
Mouse controls: Dynamic magic reticle with spell spread indicator, right-click context spell actions.
Touch controls: Virtual left joystick (Movement), Virtual right joystick (360-degree spell aiming and auto-cast), On-screen buttons for Blink, Ward Shield, Mana Recharge, Potion.
Controller support: Standard Gamepad API (Left Stick move, Right Stick spell aim, R2 Cast Primary, L2 Barrier Shield, Cross/A Blink Teleport, Square/X Channel Mana, Circle/B Potion, Triangle/Y Cycle Spell).

## Core Gameplay
Player actions: Run, cast elemental spells, raise Arcane Ward barriers, teleport blink through obstacle walls or bullet streams, channel mana nodes, hijack enchanted military turrets, throw elemental potions.
Movement: Swift mage movement with instant short-range Teleport Blink evasion; movement slightly slowed while channeling continuous channeled spells (e.g., Ray of Disintegration).
Interaction: Approach interaction prompts (`[E] Channel Mana Well`, `[E] Overload Military Generator`, `[E] Seal Rift Anchor`, `[E] Rescue Imprisoned Sorcerer`).
Progression: Unlock higher-tier arcane spells (Inferno Fireball, Chain Lightning, Vortex Surge, Meteor Strike) by completing missions and earning Crystal Shards.
Challenge: Heavy military firepower (high bullet velocity, suppressive automatic rifles, long-range sniper lasers, mortar shell drops) requiring constant warding, teleport positioning, and spell combo usage.
Rewards: Crystal Shards, ancient spell scrolls, cosmetic robe glowing effects, and bonus challenge trials.
Win conditions: Primary rift objectives completed and military commander/target defeated.
Lose conditions: Health reaches 0 or friendly rift crystal catalyst is destroyed.
Restart behavior: Instant checkpoint restart with full mana and reset enemy positions in the active zone.

## Gameplay Systems
Combat: Arcane vs. Firearm Combat. Cast offensive spells against soldiers who duck behind concrete sandbags, metal barriers, and ruined stone pillars. Arcane Ward shields reduce incoming bullet damage by 80% until depleted.
Resources or economy: Mana Wells and Arcane Chests distributed throughout levels to restore Health, Mana, and Potions; Crystal Shards awarded upon mission victory.
Building or crafting: Spell Combination System (Combine Fire + Wind for Firestorm; Ice + Arcane for Crystal Spikes).
Inventory: 2 Active Spell Slots (Primary Bolt / Secondary Elemental), 1 Ward/Shield Ability, 1 Utility Spell (Teleport/Summon), Potion inventory.
Abilities or upgrades: Permanent passive stat boosts purchased in Grimoire Sanctum: Max Mana, Health Capacity, Mana Regeneration Rate, Teleport Distance, Ward Resistance, Elemental Effect Duration.
Enemies or AI:
  - Vanguard Infantry (Takes cover behind sandbags, fires burst rifle shots, throws frag grenades).
  - Vanguard Heavy Minigunner (High HP, suppressive gatling fire, vulnerable from behind).
  - Vanguard Sniper (Long-range red laser scope, high damage armor-piercing rounds).
  - Vanguard Attack Drone (Fast flying automated drone firing laser bursts).
  - Boss: General Vance & The Iron Goliath (Heavy dual-cannon armored tank with military shield generators, rocket salvos, and mortar strikes).
Objectives: Destroy military radio jammers, seal unstable dimensional rifts, sabotage army ammo depots, defend mana crystals from soldier squads, defeat battalion bosses.
Other systems: Dynamic Line-of-Sight fog, destruction of cover (concrete degrades under heavy magic, wooden obstacles burn), explosive barrel and crystal shockwave chain reactions.

## World and Level Design
Environment: Fused dimensional warzone featuring floating arcane ruins fused with muddy army trenches, ruined city plazas with glowing spell glyphs, and military supply depots built inside shattered wizard towers.
Map layout: Sector-based multi-room layout with tactical corridors, sandbag emplacements, mana-well courtyards, and branching flank paths.
Important locations:
  1. Sector 1: The Rift Arrival (Shattered wizard sanctum collided with army airfield, sandbags, searchlights).
  2. Sector 2: Trenches of Elyria (Muddy military trenches interwoven with floating crystal spires and mana pools).
  3. Sector 3: Fortified Supply Outpost (Army bunker built around a captured dimensional portal anchor).
  4. Sector 4: The Rift Heart (Dimensional epicenter featuring General Vance's Goliath Tank and unstable portal beams).
Obstacles: Barbed wire, laser tripwires, automated turrets, anti-magic smoke fields, unstable energy rifts.
Interactive objects: Mana wells, crystal chests, explosive red fuel drums, enchanted turret nests, rift terminals, C4 charges.
Level progression: Clear sector zones by destroying military barriers or sealing rift anomalies to unlock gateway portals to the next area.
Procedural generation requirements: None (Hand-crafted tactical layout balancing wizard cover and military firing lanes).

## Characters and Objects
Playable characters: Archmage Valerius (Elyrian Arcane Guard - glowing wizard robes, rune staff, hovering orb).
Enemies:
  - Vanguard Trooper (Standard combat gear, assault rifle, helmet).
  - Vanguard Sniper (Tactical ghillie suit, high-powered rifle with red laser sight).
  - Vanguard Officer (Commands troops to flank, calls in mortar strikes).
  - Vanguard Heavy Exo-Soldier (Heavy metal armor, rotary minigun).
  - General Vance (Military commander in exo-suit with custom sidearm and tactical radio).
NPCs: Captured Elyrian Sorcerers, High Priestess Lyra (Telepathic rift guidance).
Units: Arcane Golems (Summoned friendly units in scripted defense events).
Buildings: Army Bunkers, Watchtowers, Wizard Towers, Crystal Sanctuaries, Helipads.
Props: Sandbags, concrete barriers, metal crates, rune pedestals, spellbooks, barbed wire, supply lockers.
Required animations: Idle, Running, Spell Casting, Ward Barrier Stance, Blink Teleport, Mana Channeling, Potion Throw, Death, Downed state.
Damage and destruction states: Cover crumbles under magic impact; barrels explode into fire; military structures scorch and collapse.

## Art Direction
Visual style: High-contrast clash of Dark High Fantasy and Modern Gritty Sci-Fi Military. Vibrant neon purples, blues, and magentas colliding with industrial olive drabs, grays, and steel armor.
Color palette: Deep violet, arc blue, fiery orange, contrast against dark green fatigue tones, metallic gray, and muddy browns.
Character design: Flowing ornate wizard robes with glowing arcane runes vs. utilitarian Kevlar armor, helmets, and tactical gear on soldiers.
Environment design: Floating island chunks suspended over militarized airfields, overgrown arcane roots tearing through concrete, rain and particle sparks.
Lighting: Dynamic point lights for spell projectiles, muzzle flashes, laser sights, and glowing dimensional portal rifts.
Materials and textures: Weathered concrete, polished crystal, muddy earth, brushed steel armor, embroidered cloth.
Visual effects: Particle magic trails, glowing rune glyphs on cast, bullet tracer lines, shockwave distortion rings, directional damage indicators.
Reference material: Magicka, Helldivers, Diablo, Metal Gear Solid top-down style, Gate (anime fantasy vs military theme).
Visual elements to avoid: Bland single-genre fantasy or pure sci-fi without cross-dimensional clash elements.

## UI and Feedback
HUD:
  - Top-Left: Mage portrait, Health bar (Green/Red), Mana bar (Purple), Ward Shield gauge (Cyan).
  - Top-Right: Active Primary Spell icon, Secondary Spell cooldown, Potion counter (`2x Mana Potion`).
  - Bottom-Left: Radar / Minimap displaying enemies (red dots), rift objectives (yellow star), mana wells (purple dot).
  - Bottom-Right: Contextual action prompt (`[E] Channel Mana`, `[E] Seal Rift`).
Menus: Monochromatic rift terminal overlaying glowing magic circles, clean typography, hover sound effects.
Health or status displays: Directional damage red vignette on hit; purple aura around screen when mana is full; screen flashes blue when Ward Shield breaks.
Objective indicators: Spatial 3D rune marker pointing toward active rift anchor or boss with distance meter (e.g., `Destroy Radar Tower - 30m`).
Notifications: Arcane banner alerts top-center: `RIFT ANCHOR SEALED`, `NEW SPELL UNLOCKED: CHAIN LIGHTNING`, `CHECKPOINT REACHED`.
Selection and interaction feedback: Magic reticle snaps onto targets with lock-on ring; cursor turns gold over interactable mana nodes.
Responsive layout requirements: Automatic canvas scaling maintaining 16:9 aspect ratio across desktop and mobile screens.

## Audio
Music: Hybrid orchestral track combining pipe organs, choir vocals, and dark synth instruments blended with intense action drums and electric guitar riffs during combat.
Ambient sound: Crackling rift energy, rain, distant artillery bombardment, military radio chatter, chanting voices near mana wells.
Action sound effects: Crisp magical sound effects (booming fireballs, zapping lightning, glass-shattering ward impacts) mixed with heavy gunfire, bullet impacts, ricochets, and tank engine rumbles.
UI sounds: Arcane chime, portal hum, objective clear bell, low-mana warning pulse.
Volume controls: Independent sliders for Master, SFX, Music, and Voice Chatter.

## Intro and Cutscenes
Opening sequence: Narrative briefing showing a map of the two worlds colliding, voiceover from High Priestess Lyra explaining the cosmic catastrophe and the Earth army's aggressive invasion.
In-game sequences: Camera pans showing army dropships landing troops or General Vance entering his Goliath Tank.
Ending sequence: Valerius seals the central rift anchor, forcing the military army to retreat as the dimensional boundary stabilizes.
Skip behavior: Hold `Space` or press `[SKIP]` button to bypass any narrative sequence.
Subtitles: High-legibility white text with black outline at bottom center of screen.

## Developer Tools
Debug access: Press `~` (Tilde key) to open developer console overlay.
Inspectors: Render collision boxes toggle, pathfinding node overlay toggle, enemy line-of-sight cone visualization.
Editable settings: God mode, Infinite Mana, No Spell Cooldowns, Spawn Soldier Squad, Instant Kill All.
Spawn and reset tools: Fast teleport to Sector 1/2/3/4, reset save data, spawn Mana Well.
Import and export: Export level test stats and JSON save file state.
Performance display: Mini FPS counter, render time (ms), draw call count in top-right debug overlay.

## Preview and Capture
Preview mode: Free camera mode (`F8`) allowing unrestricted panning across the full rift battle map.
Required shots: Dynamic battle shot showing wizard casting fireball against army sandbag line, boss encounter with Goliath Tank.
Camera paths: Automated orbit camera path around player mage for cinematic captures.
Screenshot export: Press `F12` to capture high-res uncompressed PNG screenshot without HUD elements.
Video recording: N/A (Standard browser compatibility).
Fallback behavior: Automatic quality downscaling (reducing magic particle count) if frame rate drops below 45 FPS.

## Accessibility and Reliability
Text readability: Minimum 16px font size with high-contrast background backdrops on all HUD text.
Keyboard navigation: Full menu tab navigation support with visual highlight focus states.
Touch accessibility: Large touch targets (min 48x48px) for mobile virtual buttons with haptic touch feedback where supported.
Reduced motion: Option in settings to turn off screen shake, spell flash effects, and dynamic camera tilt.
Color assistance: Colorblind mode toggles (Deuteranopia, Protanopia, Tritanopia) updating minimap icon colors and target rings.
Pause and focus behavior: Automatic auto-pause when browser tab loses focus or window is minimized.
Error handling: Graceful catch-all error handling that logs errors to developer console without freezing canvas render loop.

## Current Build Scope
Must include:
  1. Complete 4-Sector Campaign map structure with win/lose conditions.
  2. Fully functional spellcasting and Ward Shield mechanics.
  3. AI system for 3 Vanguard soldier types (Trooper, Heavy Minigunner, Sniper) with cover usage and firing behavior.
  4. At least 4 distinct spells (Arcane Bolt, Flame Burst, Chain Lightning, Teleport Blink).
  5. Interactive Mana Wells, Health Potions, and enchanted turrets.
  6. Sector 4 Boss fight with General Vance & The Iron Goliath Tank.
  7. Full HUD, Title Screen, Settings, Mission Results, and Save State support.
Include only if the main scope is complete:
  - Playable Arcane Flying Golem segment.
  - Additional challenge trials mode with speedrun timer.
Out of scope:
  - Online 8-player infrastructure multiplayer.
  - 3D procedural level editor.

## Acceptance Checklist
- [ ] Game launches successfully without syntax or asset loading errors.
- [ ] Main gameplay loop (Title → Briefing → Tactical Gameplay → Win/Lose → Results) is complete.
- [ ] Required controls (WASD/Mouse, Touch, and Gamepad) operate cleanly.
- [ ] Spellcasting and Teleport Blink work seamlessly.
- [ ] Ward Barrier Shield absorbs incoming bullet fire and degrades under heavy assault.
- [ ] Enemy soldier AI utilizes sandbag cover, flanks, and fires accurately.
- [ ] Mana Wells replenish mana and health upon interaction.
- [ ] Boss fight with General Vance & Goliath Tank triggers and completes with victory state.
- [ ] Save system stores completed levels, high scores, and spell upgrades in LocalStorage.
- [ ] Mobile responsive touch layout renders and operates correctly.
- [ ] Performance stays at 60 FPS under heavy magic particle load.
- [ ] Project documentation is fully updated.

## Versioning and Handoff
Starting build: v0.1.0-alpha
New build version: v1.0.0-gold
New build filename: `index.html` (dist build)
Files to update: `src/game.ts`, `src/entities/PlayerMage.ts`, `src/entities/VanguardEnemy.ts`, `src/systems/SpellSystem.ts`, `src/systems/UISystem.ts`, `README.md`, `CHANGELOG.md`.
Known issues: None for initial baseline build.
Next task: Verify cross-browser performance and polish magic vs. gunfire audio balance.

## Required Output
1. Complete working project files (HTML, CSS, TS/JS modules).
2. New versioned build bundle.
3. Summary of implemented architecture and game systems.
4. Test results, distinguishing tested from untested features.
5. Known issues and technical limitations.
6. Updated handoff documents.
7. Next-build prompt in `prompts/next-build.md`.
