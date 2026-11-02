# Moss & Moon

A cozy isometric pixel-art witch game: restore Moonflower Grove after the Moonwell loses its light — farm magical crops,
brew potions, help three villagers, explore three corrupted regions, defeat three guardians and the Hollow Moon.
Static HTML/JS/CSS, no server, no dependencies. **Version 0.3.0.**

## Play
- Dev: open `index.html` (works from `file://`).
- Single file: `builds/moss-moon-v0.3.0.html` (everything inlined, ~2.8 MB). Rebuild with `node tools/build.js`.
- GitHub Pages: publish this folder from its root (`index.html` + `.nojekyll`), or just the single built file.

## Flow
`logo → intro cinematic (first run) → main menu → New Game → character creation → interactive tutorial (first time / on request) → play`.
Pause → Inventory, Equipment, Spellbook, Crafting, Journal, Map, Settings, Controls, Save. Enterable buildings: your cottage,
Pip's shop, Wren's house, Elder Marrow's house (and the tutorial hut). Locked: the old mill and shed.
Logo, intro, main menu and character creation are real separate states: the world is neither drawn nor simulated behind them.

## Controls
| | Keyboard / mouse | Touch | Gamepad |
|---|---|---|---|
| Move | WASD / arrows, click ground | on-screen **analog joystick** (floating or fixed; size/side in Settings) | left stick |
| Cast / swap spell | Space, 1–5 | Cast / Swap buttons | RB |
| Interact | E | Use | A |
| Broom | B | Broom | – |
| Potion | H | Potion | – |
| Pause | Esc / P | Pause | Start |

## Layout (see `notes/` for details)
| Path | Purpose |
|---|---|
| `index.html`, `.nojekyll` | entry point (script order managed by `tools/build.js --sync`) |
| `src/core/` | `mm.js` runtime (loop, screens/state, input, settings, save, camera, hooks), `baseline.js` (original demo game code with marked `// MM seam` patches), `boot.js` |
| `src/screens/` | `flow.js`, `logo.js`, `title.js`, `intro.js`, `tutorial.js` |
| `src/systems/` | audio, art loader, cinematics, campaign, world-render, interiors, fx, lighting, soft filter, Sprite Fusion VFX bridge |
| `src/config/` | data: campaign, buildings (single source of scale), cinematics, tutorial, regions |
| `src/entities/bosses.js` | four boss fights |
| `src/ui/`, `assets/css/` | DOM UI (menus, HUD, joystick) — sharp text above the soft-filtered canvas |
| `art/` | pixel-art sources (`*.px.js`, built with claude-pxl); `art/vendor/spritefusion-vfx` vendored VFX |
| `assets/` | built sprite sheets/data URIs (`assets/js/*-data.js`), images, css |
| `tools/` | `build.js` (single-file build, `--sync`, `--check`), `build-art.js`, `port-sfvfx.js` |
| `tests/` | Playwright/Node test suites (see `TESTING.md`) |
| `notes/` | architecture, contracts, per-system docs and handoffs |
| `builds/` | `baseline/` = original untouched demo; versioned single-file builds |

## Credits
Original demo: Moss & Moon isometric witch prototype (`builds/baseline/`). Pixel art authored with **claude-pxl** by crsolver (MIT).
Pixel-art VFX by **Sprite Fusion** (https://www.spritefusion.com/pixel-art-vfx), MIT, © 2026 Hugo Duprez.
