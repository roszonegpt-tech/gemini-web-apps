# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-05
### Added
- Escort missions: herd the flock from the start pin to a pen at the red pin across procedurally generated forest worlds that get longer each mission. Includes results screen with stars.
- Herding dog character: fast, presses sheep away from itself, and barks to shove the herd, stun predators and send them running.
- Local multiplayer for up to 4 players in any goat/dog mix: two keyboard halves, gamepads 1-4 (Gamepad API) and touch. Lobby with join, character swap, mode select and ready-up.
- Smooth lerp follow camera with velocity lead, sub-pixel scrolling and a shared-view leash for multiplayer.
- Stone pillars (henge in Defend, gate pillars along Escort routes), edge arrows to the goal and to carried sheep, predators lurking in the forest as glinting eyes.
- Bark, pen and join sound effects.

### Changed
- Portrait 160x288 viewport with a scrolling world larger than the screen.
- Restricted 12-colour lo-fi palette; day -> sunset -> dusk is now a per-pixel palette swap (olive/teal day to orange/purple sunset).
- Chunky low-res sprites for goat, sheep, wolves, bats.
- Flat ground with sparse tufts; rounded canopy crowns with indigo undertones and trunk-striped undergrowth replace the detailed tree border.
- Floaty acceleration/deceleration movement and analog input.
- Minimal corner HUD replaces the top bar; per-player cooldown pips sit under each character.

## [0.1.0] - 2026-11-05
### Added
- Initial playable build: goat ram-charge controller, Boids sheep herd with panic vector, wolves and bats with capture/carry/escape, rescue by ramming carriers, alpha wolves (2 HP, stun).
- Procedural pixel sprites, grass/flower/rock field, dithered tree border, day-to-sunset palette shift, fireflies at dusk.
- Particles: dust (turns, charges), impact bursts, shockwave rings, wool puffs, leaves.
- Web Audio SFX: dash sweep, impact thump, pop/shatter, sheep baa (calm/panic), capture, rescue, wave jingles.
- HUD (score, sheep, ram cooldown meter, wave, foes left), menu, pause, game over with local best score.
- Touch controls (virtual joystick + ram), viewport scaling with pixelated rendering.
