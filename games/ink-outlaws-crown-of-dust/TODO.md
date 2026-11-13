# TODO

## Next
- [ ] Balance pass with real players: the autopilot tests only prove each mission can be finished (they use god mode).
- [ ] Defend missions at tier 4+ can be harsh without watchtowers; consider an extra free stake or a militia per Saloon level.
- [ ] Gamepad support (the Input layer already uses action names).
- [ ] Music: a short synthesised loop per biome.

## Ideas
- [ ] Hurt and death animations in the painter itself (currently a game-layer flash, topple and stain).
- [ ] Named outlaw specials (each preset its own move, not only per weapon).
- [ ] Mounted posse members charge like enemy chargers.
- [ ] A second campaign map using the lab's other biomes.

## Decisions for the owner
- [ ] LICENSE: none added. Pick one before publishing widely.
- [ ] GitHub Pages: enable Pages on the repo root to serve `/games/ink-outlaws-crown-of-dust/`.

## Known limits
- The sprite cache budget is 70 MB on touch devices; very long missions on older iPhones may repaint frames (a brief hitch, not a crash).
- Tests need Node and Playwright with Chromium (preinstalled in the cloud environment, not shipped).
