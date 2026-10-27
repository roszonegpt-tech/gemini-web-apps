# Design notes — how the prompt was interpreted

- **Repo fit:** this repository is a Gemini web-app tracker, so the game lives in its own standard project folder (`projects/riftbound-spellfire-steel/`) using the house template (`index.html` at project root, `assets/`, `src/`, `levels/`, `tests/`, `notes/`, …). The prompt's `/src` + `dist/index.html` requests are honoured inside that folder.
- **Language/engine:** TypeScript + three.js r162 (pinned: last release with WebGL1 fallback, matching the Safari 14 target). Bundled with esbuild into a classic script so `index.html` also runs from `file://`.
- **Controls mapping:** Space = Blink, Shift = Ward (hold); "Ward Shield Snap" = raising the ward within 0.22 s before a bullet lands reflects it. Settings can swap Space/Shift. Potions: F (health) / G (mana); gamepad B and touch POTION pick the most-needed one.
- **Spell slots:** LMB is always Arcane Bolt (primary); slots 1–4 choose the secondary elemental spell (Flame Burst, Chain Lightning, Vortex Surge, Meteor Strike). Chain Lightning unlocks after Sector 1, Vortex after Sector 2, Meteor after Sector 3 — or buy scrolls in the Sanctum. Inferno Fireball is a purchasable Flame Burst upgrade.
- **Combos:** Fire + Wind = Firestorm (Flame Burst into a Vortex); Ice + Arcane = Crystal Spikes (Arcane Bolt on a Frost-Bomb-frozen soldier).
- **Channelled-spell slowdown:** holding Arcane Bolt streams it and slows movement by 15%.
- **"Enchanted turrets":** Vanguard sentry guns can be enchanted ([E] hold) to fight for the mage for 25 s, then overload.
- **Golem summons:** the rescued sorcerer and the Sector 3 catalyst defence summon an allied Arcane Golem (scripted defence event).
- **Challenge trials (v1.0):** sector speedruns with a timer; the dedicated trials are the v1.1 task.
- **Difficulty knobs:** `World.difficultyHp / difficultyDmg / difficultySpread` (all 1.0 in the campaign).
