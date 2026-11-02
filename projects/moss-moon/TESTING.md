# Testing
Playwright (Chromium) + Node. Run from this folder; each prints PASS/FAIL lines and a JSON summary; exit code 0 = pass.
| Command | Covers | Last result (2026-11-02, run by coordinator unless noted) |
|---|---|---|
| `node tests/smoke.js [html]` | boot, front-end frozen, play, pause, save/load, corruption, v1 migration, settings | pass (index.html and built file) |
| `node tests/core-test.js` / `core-phase3-test.js` | MM core, seams / loop, screens, 50× state round trips, leaks | 85/85 · 39/39 |
| `node tests/screens-test.js` | logo/intro/menu isolation, skip/replay, leaks, resize/dpr, reduced motion | 60/60 |
| `node tests/ui-test.js` | creation, HUD, pause menus, settings, joystick touch emulation | 58/58 |
| `node tests/tutorial-test.js` | event-verified steps, reset, skip restore, ×5 leak check | 54/54 |
| `node tests/interior-test.js` | validate()==[], enter/exit ×10 per building, persistence | pass |
| `node tests/world-walk.js`, `world-shots.js` | door reachability, collision traps, 2× screenshots | 0 failures |
| `node tests/campaign-test.js`, `campaign-deadends.js`, `campaign-balance.js` | whole campaign to ending, dead-ends, boss bot | 58/58 · 10/10 · pass |
| `node tests/fx-test.js`, `sfvfx-test.js` | effects caps/no-growth/flash rules; all 25 Sprite Fusion effects render | pass · 25/25 |
| `node tests/cine-test.js` | every scene, skip, fallback, cleanup ×20, frame-rate independence | pass (83 checks, agent run) |
| `node tests/audio-test.js [--quick]` | sfx/tracks, voice limits, peak levels | pass (no fails) |
| `node tests/art-api.js` | every sprite resolves/draws | 15/15 |
| `node tests/e2e-built.js builds/moss-moon-v0.3.0.html` | logo → … → play → save → reload → Continue on the single file | 18/18 |
Screenshots land in `tests/out/` (git-ignored). Not covered: real devices, Safari, gamepads, human playtest.
