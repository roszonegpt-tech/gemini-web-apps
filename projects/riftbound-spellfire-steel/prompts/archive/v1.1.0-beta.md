# Next Build — Arcane Golem Flight Segment & Challenge Trials

## Starting Point
Project: Riftbound: Spellfire & Steel
Starting build: v1.0.0-gold
Target version: v1.1.0-beta
Output filename: `dist/index.html`
Read first: `PROMPT.md`, `README.md`, `CHANGELOG.md`, `src/systems/SpellSystem.ts`

## Goal
Main task: Implement the playable Arcane Golem flight trench run in Sector 2 and add 3 dedicated standalone Challenge Trials accessible from the main menu.
Expected player-visible result: Players can mount and control a giant flying Stone Golem through flooded trenches, blasting army anti-air turrets with beam lasers, and play specialized skill challenges from the main menu.

## Preserve
Working features: Ground spellcasting, Ward Shield mechanics, Vanguard enemy AI cover/flanking logic, General Vance boss encounter, LocalStorage save state schema.
Existing controls: WASD / Mouse aiming, Gamepad mapping, Touch joystick layers.
Existing visual elements: Cosmic rift art style, dark fantasy vs. military palette, particle light flashes, HUD layout.
Existing files that must remain unchanged: `src/core/Engine.ts`, `src/audio/AudioEngine.ts`, `assets_manifest.json`.

## Required Changes
1. **Arcane Golem Mount Mechanics**:
   - Create `src/entities/ArcaneGolem.ts` class handling movement velocity, flight drift, chest laser beam attack, and stone armor durability.
   - Add interaction shrine in Sector 2 enabling Valerius to mount and dismount the Arcane Golem.
   - Implement aerial combat obstacles (military anti-air missiles, radar mines, barrier pylons).
2. **Challenge Trials System**:
   - Create `src/scenes/ChallengeScene.ts` for 3 distinct trials:
     * *Trial 1: Arcane Target Run* (Destroy 25 military targets using Fireball before timer expires).
     * *Trial 2: Barrier Survival* (Survive 3 minutes of continuous mortar and minigun fire using only Ward Shields and Teleport).
     * *Trial 3: Rift Onslaught* (Defeat 5 escalating waves of mixed Vanguard troops and attack helicopters).
   - Star grading system (1 to 3 Stars) based on clear time and damage taken.
3. **Reward Integration**:
   - Award bonus Challenge Stars that convert into Crystal Shards for spell upgrades in the main campaign.

## Implementation Constraints
Use: Existing WebGL/Canvas render loop, Web Audio synth engine, and standard LocalStorage save keys.
Do not use: External 3D physics engines or unapproved heavy libraries.
Work only inside: `src/entities/ArcaneGolem.ts`, `src/scenes/ChallengeScene.ts`, `src/systems/UISystem.ts`, `src/game.ts`.
Do not overwrite: Core collision engine without backward compatibility for ground mage combat.
Out of scope: Online multiplayer co-op modes.

## Acceptance Checklist
- [ ] Player can mount, fly, shoot laser beams, and dismount the Arcane Golem in Sector 2.
- [ ] Golem laser destroys military anti-air towers, sandbag emplacements, and army helicopters.
- [ ] Challenge Trials menu is selectable from Title Screen with 3 playable challenge types.
- [ ] Star ratings and high scores persist in LocalStorage upon challenge completion.
- [ ] Challenge points correctly populate the main Campaign Grimoire upgrade system.
- [ ] All original v1.0.0 ground spellcasting, barrier mechanics, and boss encounters remain fully operational.
- [ ] No performance regression below 60 FPS during heavy particle combat.
- [ ] Test results distinguish verified and unverified behavior.
- [ ] New versioned build v1.1.0-beta is compiled and saved.

## Documentation Updates
- progress.md
- CHANGELOG.md
- TESTING.md
- BUGS.md
- prompts/next-build.md

## Handoff
Completed: Base v1.0.0 campaign build, core spellcasting engine, Vanguard enemy AI, General Vance boss fight.
Tested: Keyboard/Mouse combat, mobile touch inputs, save system, UI menus.
Not tested: Gamepad controller performance during Golem flight controls.
Known issues: Minor collision boundary clipping if Golem impacts rift mountain edges at max speed.
New build: v1.1.0-beta
Next focused task: Polish Golem collision response and add audio engine sound hooks for golem engine rumble.

## Required Output
Return the complete updated project files, versioned build, change summary,
test results, known issues, and updated next-build prompt.

---
### Notes for the implementer (added by the v1.0.0-gold build)
- Sector 2 already reserves a **flooded trench strip** (z ≈ 63–80, fenced off from the ground fight) for the golem run.
- Extension points that let the listed files implement this without touching `World.ts`, `Engine.ts` or `AudioEngine.ts`:
  `World.updaters`, `World.cameraFocus`, `World.mountTarget`, `PlayerMage.mounted`, `AudioEngine.registerRecipe()`,
  `UISystem.extraScreens`, `SaveData.challenges` (already in the frozen schema).
