# Goat Guardian

A lo-fi portrait herding game for 1–4 local players. Each player is a **goat** or a **dog**, in any combination. Guide the flock across a scrolling forest world while shadow wolves and bats hunt it, and day fades into sunset.

All art is drawn from pixel matrices in code, and all sound is synthesized with the Web Audio API. The game uses no external assets or libraries.

## Run
- Open `index.html` in any modern browser (desktop, iPad, or iPhone). No build step or server needed.
- GitHub Pages: works as a static site and includes `.nojekyll`.

## Maps
- **Escort routes:** 1 Meadow Run (the original), 2 Birch Bend, 3 Switchbacks, 4 Twin Trails, 5 Stone Road, 6 Wolf Hollow, 7 Open Moor, 8 Lake of Pines, 9 The Long March, 10 Sunset Summit. Routes 2–10 get longer and wider.
- **Defend arenas:** The Henge, Twin Glades, Ring Road, Crossroads, Ruined Plaza, Crescent, Grove Isles, Long Valley, Clover, Great Circle.
- Choose a map on the Map Select screen, which shows a minimap preview. Escort continues through the routes in order.

## AI helpers
On Player Select, press H (keyboard), Y (gamepad) or tap "+ CPU" to add an AI goat or dog. Remove one with N, LB or "REMOVE". With **Solo AI helper** set to AUTO in Options (the default), playing alone brings in a CPU partner automatically.

## Modes
- **Escort**: drive the herd from the start pin (bottom) through the woods to the pen at the red pin (top). Sheep that enter the pen are safe. A mission is complete when every remaining sheep is penned. The next mission is longer and harder, and its herd is the sheep you delivered plus 2 lambs.
- **Defend**: endless waves around a stone henge. Clearing a wave returns 1 lamb.

## Demo
Choose **Watch Demo** on the title screen, or leave the title screen idle for 30 seconds. AI goats and dogs then play Escort, 4-player Defend and Nightfall, with on-screen labels for every unit. Press any button to exit.

## Characters
| | Goat | Dog |
|---|---|---|
| Action | **Ram charge**: a fast dash that launches and destroys predators (alpha wolves take 2 hits) | **Bark**: shoves nearby sheep away and stuns predators, which then run off (alpha wolves need 2 barks) |
| Herding | Sheep follow the goat (lead from the front) | Sheep move away from the dog (push from behind) |
| Speed | Slower and heavier | Fast and agile |

Ram or bark a predator that is carrying a sheep and the sheep is saved.

## Controls
| Device | Move | Action | Notes |
|---|---|---|---|
| Keyboard left | WASD | Space or left-click | With only one keyboard player, the arrows and Enter also work |
| Keyboard right | Arrow keys | Enter or Right Shift | |
| Gamepads 1–4 | Left stick or D-pad | A or X | B leaves the lobby, Start pauses |
| Touch | Drag on the left side | Tap on the right side | Pause button in the top-right corner |

**Menus:** Title → Mode → Players. In menus, Up/Down moves the cursor, Action selects, and Back (Esc, Backspace or B) goes back. On the Players screen, any new device presses Action to join. Left/Right switches between goat and dog, and Action readies up. The game starts when everyone is ready. Options covers sound, screen shake and fullscreen.

**In game:** click or tap the pause button in the top-right, or press P, Esc or Start, to open the pause menu. It offers Resume, Restart, Options, Controls and Exit to Title. M toggles sound, F toggles fullscreen, and R retries after a game over. The title menu also has Exit.

## Tech notes
- Adaptive low-res buffer drawn at a whole-number pixel scale. Its size follows the screen, so the game fills portrait phones and landscape monitors.
- Six facing directions for every animal: front, back and four diagonals.
- The camera follows the average position of all players with lerp damping and leads in the direction they're moving. The world is drawn at a sub-pixel offset, so scrolling is smooth even though the art is chunky.
- Everything is drawn in a 12-colour day palette. Each frame is then palette-swapped pixel by pixel toward the sunset and dusk palettes.
- Worlds are procedural: a forest mask, rounded tree crowns, undergrowth bands with trunks, stone pillars, and a pen at the goal.
- Players share one camera and are kept inside its view.

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
