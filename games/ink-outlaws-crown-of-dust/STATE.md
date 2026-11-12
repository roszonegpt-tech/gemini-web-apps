# State: handoff snapshot

**Version** 0.1.0 · **Branch** `claude/modest-euler-2msjdg` · **PR** #5 (draft) · **Updated** 2026-11-12

## Where things stand
The game is complete and playable end to end: title → captain pick → campaign map → camp (posse, captain and armoury, town) → briefing →
mission → results → overnight income and raids → victory. All five mission types and all three strongholds have been finished by the
test autopilot. No console errors in any test.

## How to verify quickly
From this folder, with Node and Playwright available:
`node tests/smoke.cjs` (about 20 s) and `node tests/reach.cjs "" 25` (about 2 min). For a single mission: `node tests/mission.cjs <territory> 8`.
For the whole game: `node tests/campaign.cjs 45 10` (20–45 min; it stops at the first stall and writes `tests/out/stuck.png`).

## Last full-campaign run
The autopilot reached Castle Gilt on day 14 holding 12 of 13 territories, with both lesser strongholds broken and no console errors.
It stalled there because Crown Clerics healed King Odo for 30% of his maximum health per cast, and Odo and the Tyrant stood stacked
on one spot. Both are fixed: heals are capped at 45 and bosses push each other apart. After the fix, an upgraded gang takes Castle Gilt in about 2 minutes of game time.
A confirming full run was started after this commit; see the PR for its result.

## Recently fixed (in case something similar comes back)
- A line comment in `src/systems/combat.js` swallowed the rest of the shot update, so bullets never expired. **Keep code and `//` comments on separate lines.**
- Point-blank shots spawned past their target. The first step now sweeps from the shooter's body (`b.px/b.py`).
- Small props (trees, cacti) blocked movement but not navigation, so walkers jammed. All solid props now block the nav grid.
- Crates could sit on a heist strongbox; they are now cleared from around every box.
- Crown Clerics could out-heal a boss (now capped at 45 per cast); stacked bosses now push each other apart.
- The last Defend wave could hang on an enemy wedged behind a rock; 3 or fewer stragglers now flee after the wave timer.

## Conventions
- Everything hangs off `window.CD`; files are classic scripts loaded in order by `index.html` (no modules, so file:// works).
- New art: `A.def(kind, [halfW, up, down], fn)` in `src/art/inkkit.js`. Check it with `tests/gallery.html`.
- New units: a look in `D.looks` (lab schema) plus `unit(id, name, faction, {...})` in `src/config/units.js`.
- Painter upgrades: see `notes/PAINTER_API.md`. Only the `INK.kit` block at the end of `assets/js/ink.js` is ours.
- Rebuild the single file after any change: `python3 build/build.py`.

## Open items
See `TODO.md`. The main ones: a balance pass with real players, a license choice, and enabling GitHub Pages.
