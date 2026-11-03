# CAMPAIGN handoff — Moss & Moon (phase 2 + phase 3 amendments)

Owner files: `src/config/campaign.js`, `src/systems/campaign.js`, `src/entities/bosses.js`, `tests/campaign-*.js`,
`notes/GAMEPLAY.md` (the design, with every number), this note. Zero-patch: no edits to baseline/index/core.

## What exists
| File | Contents |
|---|---|
| `src/config/campaign.js` | `MM.CAMPAIGN_DATA` (pure data, loads before baseline): regions (+ village), chapters, objectives (title/why/hint), tutorial steps, crops (glowcap, starmint), 30 items, 9 recipes, Pip/Wren shops, equipment tiers, upgrades (broom 0–3, homestead 0–4, spell mastery), 5 signature spells, 13 enemy archetypes + scaling, 4 boss tunings, hazards, 11 villager requests, dialogue, defeat/ending text. |
| `src/entities/bosses.js` | `MM.bosses` + combat kit `MM.bosses.kit` (telegraphs/zones/projectiles/sim-time timers, `hurt()`, inShape). Brains for Bramble Warden, Mire Heart, Frost Wyrm Husk, The Hollow Moon. Drawing uses the art atlas (`bramble_warden/mire_hag/frost_wyrm/well_spirit_{idle,windup}_{s,e}`), falling back to a ×2 tinted cast sprite. |
| `src/systems/campaign.js` | `MM.campaign`: save section `campaign`, story/chapters/tutorial, objective tracker, requests, shop/sell/craft/items/equipment/upgrades, travel + loading, dungeons + boss floors, fragments/restoration/final/ending, defeat bookkeeping, hazards, enemy archetypes + melee, signature spell mechanics, interactions, debug helpers. |
| `tests/campaign-test.js` | 58-check end-to-end run (see Tests). |
| `tests/campaign-deadends.js` | 10 checks: bankrupt → still progresses. |
| `tests/campaign-balance.js` | Bot fights all 4 bosses (walking-speed dodging, real spells). |

## Integration (how it hooks the baseline)
- Wrapped by name: `makeEnemy goRegion enterDungeon advanceFloor resetPlayer tendPlot brew sellHarvest turnInQuest upgradeBroom hitEntity
  pickup spellMultiplier heroMaxHP castSpell chooseSpell spellTarget nearestEnemy updateCombat updateWorld drawMonster saveWorld draw drawExtraMagic`.
- Tables: `SPELLS` (5 signature spells moved to indices 0–4 so keys 1–5 select them), `SEED_TYPES` (+glowcap, starmint),
  `REGIONS` (+village, levels).
- Enemy melee is replaced by the campaign (per-archetype dmg/rate, Thornbind blocks it, slow-on-hit). Baseline melee/boss pulse are
  suppressed every frame (`attack=special=9`). All campaign damage goes through `MM.bosses.kit.hurt()` → bus `hurt {amount, kind}`.
- Hooks: `drawGround` (hazard decals, zones, built-in telegraphs only when `MM.fx.telegraph` is missing, projectiles) and `drawables`
  (brazier sprites at Frostpeak warm spots). Fallback layer in `drawExtraMagic` if the hook doesn't fire.
- **Phase 3:** campaign systems are dormant unless the current screen's sim is `'world'` and the region is a campaign region
  (`MM.campaign.isDormant()`). `tutorial` state/region, `interior` (sim `player`), cine/menu etc. → baseline-only behaviour, no quest/kill
  bookkeeping. Timers use `MM.screens.timeout` (or sim time via `kit.later`). No rAF.
- Death: baseline `resetPlayer` → campaign bookkeeping (stats, abort final, clear telegraphs, `defeat` bus event with penalty text)
  → CORE `MM.game.handleDeath()` → state `defeat`. Recovery = `MM.game.respawnHome()` (UI defeat screen) or `MM.campaign.recover()`.
  Bus `respawn` → campaign clears the downed flag and plays `defeat_recover` the first time.
- Cinematics: `MM.state.go('cine')` → `MM.cine.play` → back to the previous state (`play`, or `interior` with its last data
  `+{resume:true, fromCine:true}`), or to `ending` for the finale. Rewards + memory are granted at trigger time (`grantOnce`), so skip == watch.
- `start()` no longer plays `intro` (MM.flow does). It gives the moon charm, begins Arrival, and auto-completes the Arrival chain when
  `MM.flow.flags().tutorialDone` / `MM.storage['moss-moon-flow-v1'].tutorialDone` is true (also on bus `flow:flags`).

## API (contract names + additions)
`MM.campaign.state` (getter) · `objective()` · `grantOnce(key, fn)` · `start()` · `quests()` · `recipes()` / `craft(id, n)` ·
`shop(npc)` / `buy(id, qty, npc)` / `sell(id, qty, npc)` / `sellAllCrops(npc)` · `upgrades()` / `buyUpgrade(id)` (`broom`, `homestead`,
`spell_<id>`, `skill_0..2`) · `regions()` / `travelTo(id)` → `{ok, msg, pending}` (state `loading` ~650 ms) · `enterDungeon()` / `nextFloor()` / `exitDungeon()` ·
`dialogue(npc|'board')` → `{npc, speaker, portrait, pages:[{text, choices:[{label, action}]}]}` · `choose(npc, action)` →
`{ok, msg, next?:script, open?:'shop'|'crafting', npc?, close?}` · `inventory()` / `useItem(id)` · `equipment()` / `equip(id)` ·
`spells()` / `selectSpell(id)` / `selectSeed(crop)` · `map()` · `status()` (HUD summary: chapter, objective, hazard, buffs, cooldowns, boss, defeat).
Extra: `interact(id, ctx)`, `interactions(region)`, `rest()`, `claimSeeds()`, `recover()`, `lastDefeat()`, `hazards()`, `hazardStatus()`,
`acceptRequest/turnIn`, `placeFragments/beginFinal`, `count/addItem/takeItem/itemName/items()`, `pointOf(region, id)`, `moonwellPos()`,
`regionLock(id)`, `playStory(id, opts)`, `on(name, fn)`, `debug {step, give, grantFragment, teleport, killAll, killBoss, hurt, heal,
setTime, skipTo(ch), snapshot, quietCines}`.
`MM.bosses`: `spawn(id, x, y)`, `active()` → `[{id, name, hp, maxHP, phase, phaseName, invulnerable, exposed, armored, well}]`,
`damageFactor`, `kit`, `drawEnemy`.
Bus events emitted: `objective quest fragment restored chapter story:cine toast {text, kind} defeat ending tutorial spell homestead
inventory shop upgrade equip buff relation hurt boss {phase:'spawn'|'phase'|'defeated', id, …} campaign:* (start, rest, day, talk, open, harvest, …)`.

### Interaction ids (for WORLD `MM.world.register` and INTERIORS furniture)
Registered with `MM.world`: `moonwell seed_barrel cauldron alchemy_table bed travel_board marrow pip wren notice_board shop dungeon stairs exit`.
`MM.campaign.interact(kind, ctx)` also accepts the interiors furniture kinds: `rest` (bed: +¼ day, crops grow 30 s, full heal, refills
the barrel on a new day; refused near enemies outdoors), `craft`/`brew` (opens crafting), `shop` (+ `ctx.npc` or `'shop:wren'`),
`npc`/`talk` (+ `ctx.npc`), `herbs`. NPC talk calls `MM.ui.dialogue(script)` if it exists, else emits `campaign:talk`. Screens open
via `MM.ui.open(screen, data)` (else bus `campaign:open`).

## Tests (run 2026-10-30, Chromium headless, against index.html with every module on disk at the time)
- `node tests/campaign-test.js` → `{"pass":true,"total":58}`. Covers: tutorial chain; forest + 3 floors + boss cine + telegraphs +
  Bramble Warden; restoration + `first_restoration`; defeat → CORE respawn (≤25 g, no story loss); broom gate; swamp + Mire Heart
  split; save → reload → continue (identical state, no duplicate rewards); Frostpeak cold + Hearthfire; Frost Wyrm; `final_fragment`;
  Hollow Moon phases (darkness/safe light, collapse → Moonwell target); ending cine → `ending` → free play; crypt; cine from
  `interior` returns to `interior`; interior rest/shop/craft/talk actions; skipped vs watched cine (identical rewards);
  flow-tutorial auto-complete; dormancy in `tutorial`; zero page errors.
- `node tests/campaign-deadends.js` → 10/10. `node tests/campaign-balance.js` → 4/4 (numbers in GAMEPLAY.md).
- `node tests/smoke.js index.html` (CORE) still passes with campaign loaded.

## Known gaps / notes
- Balance is checked only by the bot (a perfect caster). A real playtest should tune boss HP and enemy damage
  (`CAMPAIGN_DATA.bosses/archetypes/scaling`). The 45–90 min estimate is calculated, not measured.
- Boss art has no hurt/death frames; phase beats use flash, shake and particles. Thorn sprouts use `bush_blight`.
- `tests/campaign-test.js` uses state `interior` with no MM.interiors on disk to test cine-return; the INTERIORS screen should accept
  re-entry with `{resume:true}` data without rebuilding/teleporting the player.
- Cinematics manifest names "Mother Murk" / "The Rimebound Colossus" for the bosses the contract calls Mire Heart / Frost Wyrm Husk
  (request filed).
- The grove `bed` (exterior) and interior bed both call `rest()` (WORLD plans to drop the exterior one).
