# INTERIORS handoff (phase 3)

## What exists
- `src/config/buildings.js` — `MM.BUILDINGS` (unit derived from the witch, furniture + wall-decor size tables, 7 building
  types incl. locked mill/shed, Moonwell structure, placements for grove/village/tutorial, 5 interior layouts, lore) and
  `MM.buildings` (`get/resolve(id)`, `list(region)`, `structures(region)`, `footprintBlocks(region)`, `paintSpec(id,L)`,
  `toWorld(id,L)`, `interior(id)`, `door(id)`, `byInterior(key)`, `validate({world})`, `missingSprites()`).
  Placement records are already in WORLD's building-record shape (WORLD consumes them today).
- `src/systems/interiors.js` — `MM.interiors`: `enter(id,{from,force})`, `exit()`, `locked(id)`, `interact(target|'enter:<id>')`,
  `prompt()`, `nearest()`, `candidates()`, `current`, `active`, `instance`, `defs`, `state()`, `chest(b,c)`, `transfer(b,c,item,n,toChest)`,
  `openChest`, `placed(b,slot)`, `visits(b)`, `resetTemp()`, `local(x,y)`, `toWorld(lx,ly)`. Screen `interior` (sim player, draw custom),
  moveActor wrapper + `blocked` hook, chest UI screen (`MM.ui.registerScreen('chest')`), save section `interiors`,
  `MM.world.register('enter:<id>')` for every building, `MM.world.currentPrompt` answers with interior prompts while inside.
- `src/systems/interior-render.js` — `MM.interiorRender.draw/view/pick/fallbacks/clearCache`.
- `tests/interior-test.js`, screenshots in `tests/out/interior-*.png`; docs `notes/BUILDINGS.md`.

## Integration used
CAMPAIGN `MM.campaign.interact('rest'|'cauldron'|'shop:<npc>'|'talk:<npc>')`, `inventory()`, `give()`; UI `MM.ui.dialogue/open/toast/panel/button`;
CORE `MM.screens/MM.state/MM.save/MM.hooks('blocked')/MM.camera.snap`; WORLD `enter:` interactables + painter.
Bus events: `interior:enter|exit|locked|rest|chest|place|lore|abandon`, `interact` (indoor ids).

## Tested (run 2026-11-01)
`node tests/interior-test.js` → `{"pass":true,"failed":[]}`; `node tests/smoke.js index.html` → pass. Node: `validate()` → `[]`.

## Known issues / open requests (notes/REQUESTS.md)
- ART2: no `int_*` / `npc_*` sprites yet → procedural fallbacks (33 names, `MM.buildings.missingSprites()`).
- UI: touch "Use" button gated on state `play` (keyboard E works indoors); HUD reads interior prompts via the currentPrompt wrap.
- CAMPAIGN: `rest()` refuses when an exterior enemy is within 140 px of the player's coordinates; indoors those coordinates are
  the room's, so a night raid near the room origin could block resting — please skip the danger check when `MM.state.current==='interior'`.
- CAMPAIGN region locks gate `goRegion`; the test switches regions directly. REGIONS.tutorial is not defined yet (TUTORIAL).
- WORLD: please gate `resolve()` collision by `worldActive()` (interiors bypasses it anyway) and move props now inside footprints.
