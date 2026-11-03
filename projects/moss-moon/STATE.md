# STATE (handoff snapshot — 2026-11-02, v0.3.0)
**Playable end to end** from clean state to ending in headless runs (campaign bot) and via the single-file build through logo → intro → menu → creation → tutorial(skip) → play → save → reload → Continue (`tests/e2e-built.js`).
Branch `claude/moss-moon-complete-game-qilwrj`, draft PR #2.
- Entry: `index.html`; build: `node tools/build.js` → `builds/moss-moon-v0.3.0.html`. Script order: `node tools/build.js --sync`; verify: `--check`.
- Architecture & contracts: `notes/ARCHITECTURE.md`, `PHASE2_CONTRACT.md`, `PHASE3_CONTRACT.md`; per-system handoffs in `notes/handoff/`; audit of the original code in `notes/BASELINE_AUDIT.md`.
- Everything outside `src/core/baseline.js` integrates by wrapping baseline functions/hook points; baseline patches are marked `// MM seam`.
- Open requests between modules: `notes/REQUESTS.md` (some already applied — check before acting).
- Not verified / known limits: see `BUGS.md` and `TODO.md`.
