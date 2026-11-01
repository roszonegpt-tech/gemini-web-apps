# Handoff — SCREENS agent
- What exists: `src/screens/{flow,logo,title,intro}.js`, `assets/css/screens.css`, `tests/screens-test.js`, `notes/SCREENS.md` (full
  design/API). Scripts are listed in index.html via `node tools/build.js --sync` (CORE's PLANNED order: flow, logo, title, intro, tutorial).
- API: `MM.flow.*` (see SCREENS.md), `MM.flow.kit` (session/resources, night-relit sprites, glow, confirm/alert/toast, keepState),
  `MM.flow.logo|title|intro` = the registered screen defs (`_debug()` for tests).
- Tested: `node tests/screens-test.js` → 60/60 PASS (Chromium headless), 0 console errors; screenshots reviewed.
- Requests filed in notes/REQUESTS.md: SCREENS→CORE (load order, boot calls MM.flow.start — done), SCREENS→UI (title ownership,
  panels over title must keep the state, creation → MM.flow.afterCreation — done, memories return to title, Sprite Fusion credit line),
  SCREENS→CINEMATICS (persistent skip button / cleanup).
- Known issues: see SCREENS.md (portrait stage containment, tutorial pending).
