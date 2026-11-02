# TUTORIAL handoff
- Owns: src/screens/tutorial.js, src/config/tutorial.js, tests/tutorial-test.js, notes/TUTORIAL.md (design/API/tests — read it).
- Registered: state `tutorial` (sim world, draw world, audio keep) over a sandbox region `tutorial` (REGIONS.tutorial added by the config).
- Test: `node tests/tutorial-test.js` → pass 54/54 (2026-11-02): 8 s idle no-advance, every step via real keyboard/mouse/touch input,
  early plant auto-satisfied, early cast not counted, reset restores a vanished potion, skip→confirm cancel/accept→world/game/save/campaign
  byte-identical, finish→'play' + campaign started + tutorialDone, abort keeps flag false, ×5 enter/exit no bus/hook/listener/timer/tick/HUD
  leaks, rafs 1, touch 390×844 (joystick axis + Use button + tap Skip), 0 console errors. Regression: screens 60/60, interior pass, smoke, core-phase3 39/39.
- Known: new game still runs `MM.game.newGame()` (and its first save) before the tutorial (MM.flow design); the sandbox keeps that world
  untouched. Requests filed in notes/REQUESTS.md (campaign objective card during tutorial, WORLD plot prompt in region 'tutorial').
