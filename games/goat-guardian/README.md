# Goat Guardian

A single-file, top-down pixel-art herding defense game. You play a goat guarding a flock of sheep from shadow wolves and predator bats, wave after wave, while the day fades into sunset.

All art is drawn procedurally with Canvas 2D pixel matrices, and all sound is synthesized with the Web Audio API. The game uses no external assets or libraries.

## Run
- Open `index.html` in any modern browser (desktop, iPad, or iPhone). No build step or server needed.
- GitHub Pages: works as a static site and includes `.nojekyll`.

## Controls
| Input | Action |
|---|---|
| WASD / Arrow keys | Move (8 directions) |
| Space / Left-click | Ram charge (1.5s cooldown) |
| Touch: left half drag | Virtual joystick |
| Touch: right half tap | Ram charge |
| P / Esc | Pause |
| M | Mute |
| R / Space (game over) | Restart |

## Gameplay
- Sheep flock using Boids (cohesion, separation, alignment) and flee from predators that come within their panic radius.
- Wolves emerge from the tree line (red eyes appear first). Bats join from wave 2 and fly over the trees.
- Any enemy that touches a sheep grabs it and runs for the woods. Ram the enemy before it escapes to save the sheep.
- From wave 3, some purple "alpha" wolves appear. They take two rams: the first stuns them and the second destroys them.
- Clearing a wave returns one lost lamb, up to 15 sheep.
- The game ends when no sheep are left in the field and none are still being carried.

## Structure
```
goat-guardian/
├─ index.html      # entire game (HTML/CSS/JS)
├─ .nojekyll
├─ README.md
├─ CHANGELOG.md
├─ VERSION.md
├─ STATE.md        # AI handoff snapshot
├─ TODO.md
└─ tests/smoke.js  # Playwright headless smoke test
```
