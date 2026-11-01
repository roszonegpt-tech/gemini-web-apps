# Moss & Moon — Gameplay design (campaign)

Owner: CAMPAIGN. Data: `src/config/campaign.js` (`MM.CAMPAIGN_DATA`), systems: `src/systems/campaign.js` (`MM.campaign`),
bosses: `src/entities/bosses.js` (`MM.bosses`). Numbers below are copied from the data file. Change them there, then update this page.

## Loop
Farm at the homestead (plant → water → harvest), then brew, sell and craft. Help the villagers, upgrade your broom and gear, and
clear a region's 3-floor dungeon to beat its guardian. That gives you a Lunar Fragment. Bring it home and set it in the Moonwell: the
region is restored, the homestead visibly improves, and the next region opens. After all three fragments comes the final fight at the
Moonwell (The Hollow Moon), then the ending, then free play.
There is always exactly one current objective (`MM.campaign.objective()` → `{title, why, hint, target}`), and every objective says why it matters.

## Progression
| Ch | Name | Where | Gate to enter | Enemy lvl / rec. player lvl | Guardian | Reward |
|---|---|---|---|---|---|---|
| 0 | Arrival | Homestead | — | 1 / 1 | — | Village opens after the first brew; Thornbind + Ember Bloom at chapter 1 |
| 1 | The Blighted Forest | Forest + Rootways (3 floors) | tutorial done | 2 / 2–4 | Bramble Warden | Fragment I → Starfall, 60 g, 3 bark, 2 dust |
| 2 | The Whispering Swamp | Swamp + Sunken Lanterns | broom 1 (60 g + 2 blight bark) | 3 / 4–5 | Mire Heart | Fragment II → Frostbell, 90 g, 3 pearls, 2 dust |
| 3 | Frostpeak | Frostpeak + Rime Halls | broom 2 **or** swamp restored | 4 / 6–7 | Frost Wyrm Husk | Fragment III (`final_fragment` cine), 120 g |
| 4 | The Moonwell | Homestead | 3 fragments placed | — / 8 | The Hollow Moon | `ending` cine, homestead 4, 150 g + 5 dust |
| 5 | Moonlit Days | everywhere | — | Old Crypt 6 (×1.35 HP) | endless crypt + rifts | all 30 baseline spells, Moon Festival request |

- Chapter = `1 + fragments placed` once the tutorial is done (order-independent: a broom-2 player may do Frostpeak before the swamp).
- Arrival chain: plant → water → harvest → brew a Healing Draught → accept Wren's request. It **auto-completes** when the interactive
  tutorial (MM.flow, `moss-moon-flow-v1.tutorialDone`) is done or skipped. Wren's request stays offered.
- Placing a fragment restores that region: hazards gone, only 2 enemies at 60% damage, a lighter ground tint. Homestead level
  becomes `max(bought, fragments placed)` and Moonwell level = fragments placed. The first placement plays `first_restoration`.
- Boss floor shortcut: once you've reached floor 3, re-entering the dungeon takes you straight to the guardian.
- **Pacing target 45–90 min.** Basis: wheat grows in ~19 s, a day lasts 120 s, and a dungeon is 3 floors of 3–6 enemies. Boss
  time-to-kill for a perfect bot (`tests/campaign-balance.js`) is 67 / 44 / 54 / 77 s; expect a human to take about 2× that. No
  real human playtest has been done yet.

## Economy
Start: 85 gold, 2 potions, 1 rune, seeds wheat 4 / ember 2 / moon 2, plus 1 wheat in the pantry.
| Crop | Grows (s, grove ×1.25) | Seed pack ×3 (Pip) | Sell | Special | Used in |
|---|---|---|---|---|---|
| wheat | 24 (19) | 6 | 6 | — | Healing, Mana, Growth, Greater |
| ember pepper | 28 | 9 | 9 | — | Ember Bomb, Hearthfire |
| frost berry | 30 | 10 | 10 | — | Mire Ward |
| moonflower | 30 | 12 | 12 | — | Mana, Night-vision, Starlight |
| **glowcap** | 34 | 15 | 14 (Wren +20%) | ×1.3 in rain, ×1.2 at night | Growth, Greater, Mire Ward |
| **starmint** | 36 | 18 | 17 (Wren +20%) | ×1.6 at night, ×0.6 by day | Night-vision, Starlight |

- Repeatable income: selling crops, mob gold drops (8 + 2·player level, ×1.2 with the cat), material drops sold to Pip
  (bark 8, pearl 12, rime 15, moon dust 20) and found gear (5 + 3·power).
- **Free daily seed barrel** at the homestead: 3 wheat seeds, plus 1 random unlocked seed per homestead level (minimum 1).
- Seeds are 25% cheaper after "Open for Business". Pip relation ≥3 gives −10% at his stall. "Peppers, Please" makes broom upgrades 20% cheaper.
- Defeat: lose 15% of your gold (max 25) and nothing else (CORE `respawnHome`). Story items can never be sold or lost.
- `tests/campaign-deadends.js` sets gold, seeds, crops, potions and items to zero at chapter 1. In 2 in-game days, the seed barrel,
  farming, selling and forest mobs pay for broom 1. At chapter 3 with broom 1 and no money, Frostpeak is still open.

### Upgrades
| Upgrade | Lv1 | Lv2 | Lv3 | Lv4 |
|---|---|---|---|---|
| Broom (+15% fly speed/lv) | 60 g + 2 bark (opens swamp) | 140 g + 3 pearl (Frostpeak early) | 240 g + 2 rime + 2 dust | — |
| Homestead (also +1 free per fragment) | 30 g + 3 wheat: barrel +1, bed full heal | 80 g + 2 bark + 2 glowcap: crops +15% | 150 g + 2 pearl + 2 starmint: +15% double harvest | 250 g + 2 rime + 3 dust: raids ≤2, +20 max HP |
| Spell mastery (each signature spell) | 45 g + 1 dust: +15% dmg | 110 g + 2 dust: +30% (Starfall −3 s cd) | | |
| Skills (baseline paths) | 1 skill point: Power +10% dmg / Guard +20 HP / Growth +2 mana/s +12% growth (max 3) | | | |

Equipment (Pip; wand = damage, robe = max HP, charm = mana/s): Rowan +10% (70 g, ch1), Starwood +22% (150 g + 2 pearl, ch2),
Moonsilver +36% (280 g + 2 rime + 1 dust, ch3); Mossweave +20 HP (60 g), Barkweave +40 (130 g + 3 bark), Moonthread +65 (240 g + 3 pearl);
Grandmother's Moon Charm +1/s (start), Glowcap Charm +2.5/s (90 g + 2 glowcap), Starmint Charm +4/s (180 g + 2 starmint + 1 dust).
Gear found in dungeons stays as the baseline "trinket" slot (power ×2.5% dmg + affix).

### Recipes (all use crops)
Healing Draught 2 wheat (start) · Mana Tonic moon + wheat (Wren's tutorial request) · Ember Bomb 1 ember → 2 (ch1) ·
Growth Tonic glowcap + wheat and Greater Healing 2 wheat + glowcap ("Mushroom Lore") · Night-vision starmint + moon ("Lanterns in the Dark") ·
Mire Ward Balm glowcap + frost (ch2) · Hearthfire Salve 2 ember + wheat → 2 (ch3) · Starlight Elixir starmint + moon + glowcap ("A Starlit Garden").

## Signature spells (keys 1–5 = `SPELLS[0..4]`)
| Key | id | Renderer `kind` | School | Dmg | Mana | Cooldown | Mechanic | Unlock |
|---|---|---|---|---|---|---|---|---|
| 1 | moonbolt | star | Moon | 30 | 7 | — (0.32 s global) | fast single target, +20% at night (+25% more with Night-vision) | start |
| 2 | emberbloom | fireball | Fire | 44 | 10 | 2.5 s | burst + baseline splash, burns everyone within 1.6 tiles, burning bloom zone for 3 s, **burns bramble hazards**; Fire on rooted = burn combo | chapter 1 |
| 3 | thornbind | vines | Nature (+25% class) | 22 | 7 | 4 s | root zone r 1.5 for 4.5 s: roots, 4 dmg/0.75 s, **enemies inside can't melee**; bosses are rooted 1.2 s once per zone | tutorial done |
| 4 | frostbell | nova | Frost | 34 | 9 | 3 s | chills and hurts everyone within 2.2 tiles; **shatters** a target that was chilled/rooted before the hit for +30 (×2 on an exposed Wyrm) | Fragment II (or ch3) |
| 5 | starfall | meteor | Astral | 92 | 23 | 9 s | ground telegraph first, the star lands 1.05 s later; 70% to everyone within 2.2 tiles | Fragment I |
FX agent upgrades the visuals by spell id. The baseline renderer draws them via `kind`. After the ending, the other 30 baseline spells
can be picked in the spellbook.

## Bosses (`src/entities/bosses.js`)
Every attack: windup ≥ 0.95 s with a visible danger zone (`MM.fx.telegraph` if present, else the built-in canvas telegraph),
damage only on resolve, one hit per attack. Phase change: camera focus + shake, `boss` bus event `{phase:'phase'}`, a 1.2 s
stagger and a toast. Art: `bramble_warden / mire_hag / frost_wyrm / well_spirit` `_idle|_windup` `_s|_e` (west = flip). Without
art, a ×2 tinted baseline cast sprite is drawn.
| Boss | HP | Attacks | Phases | Weakness / counterplay |
|---|---|---|---|---|
| Bramble Warden (forest) | 3800 | Root slam: 3 lines (enraged: 5), 11 dmg · Thorn sprouts ×3 (cap 4) | <40% Enraged (faster) | ≥2 sprouts = bark armour (½ dmg): kill sprouts; Thornbind blocks melee |
| Mire Heart (swamp) | 4800 | Poison pools ×3 (zone 6 s, 4/0.6 s + slow) · Bog hands 14 + grab slow | 50%: sinks, invulnerable, splits into 3 wisps (each kill −8%); resurfaces at 25% | Mire Ward halves poison |
| Frost Wyrm Husk (mountain) | 6800 | Ice lances 3/5 lines 15 · Blizzard zones (5 s, 3/0.8 s + slow) · Charge line 20 → exposed 2.6 s | 50% Cracked (5 lances) | Exposed = ×2 damage; Fire +25%; Hearthfire vs cold |
| The Hollow Moon (Moonwell) | 8000 + Moonwell 1500 | Shard orbs (5–6 telegraphed lines, 12) · shard wisps · darkness pulse 22 with 3 safe light pools · collapse circles 14 | 66% Darkness, 33% Collapse: boss invulnerable, the Moonwell becomes the target; restoring it (1500) wins | Night-vision halves darkness |
Balance probe (`node tests/campaign-balance.js`, bot at lv 4/5/7/8 with ch-appropriate gear, walking-speed dodges):
TTK 67/44/54/77 s, damage taken 127/122/202/144, 1–3 potions, 0 defeats. Bosses scale +5% HP per level above the
region's recommendation (max +30%).

## Regions: identity in play
| Region | Roster (archetype → sprite) | Hazard |
|---|---|---|
| Forest | blightling (blight), moss slime (slime, tinted) | thorn brambles: slow ×0.7, 2 dmg/s; Ember Bloom burns them |
| Swamp | bog ghost, mire slime (slows on hit), marsh wisp | bog patches: slow ×0.55 (Mire Ward = immune) |
| Frostpeak | rime imp (slows on hit), frost-bitten golem, frost spirit | cold meter fills 7/s (×1.8 at night); full → slow ×0.75 + 3 dmg/2 s; braziers / Hearthfire |
| Old Crypt | crypt skeleton, crypt shade | gloom: halves mana regen (Night-vision clears it) |
Enemy HP = base × (1 + 0.16·(lvl−1)) × (1 + 0.12·floor). Dmg = base × (1 + 0.14·(lvl−1)). Enemy level = region level +
⌊(player − rec)/3⌋. Night raids (grove) are suppressed during the tutorial, the final fight and recovery.
Boss arenas (floor 3) have no hazards.

## Villager requests
| id | Giver | Title | Task | Reward | Offered |
|---|---|---|---|---|---|
| wren_seeds | Wren | Seeds of Kindness | deliver 2 wheat | Mana Tonic recipe, 15 g | tutorial step 5 |
| marrow_path | Marrow | The Forest Path | calm 5 forest creatures | 2 potions, 35 g | ch1 |
| pip_business | Pip | Open for Business | sell 5 crops | seeds −25%, 20 g | ch1 |
| pip_peppers | Pip | Peppers, Please | deliver 3 ember | broom −20%, 30 g | ch1 |
| wren_mushrooms | Wren | Mushroom Lore | harvest 2 glowcap (spores given) | Growth Tonic + Greater Healing | ch1 |
| marrow_lanterns | Marrow | Lanterns in the Dark | deliver 3 blight bark (starmint seeds given) | Night-vision recipe, 40 g | ch2 |
| wren_swamp | Wren | Whispers in the Reeds | calm 6 swamp creatures | 2 Mire Ward, pearl, 50 g | ch2 |
| marrow_warmth | Marrow | Warmth for the Peaks | deliver 2 ember + 1 starmint | 2 Hearthfire, 60 g | ch3 |
| pip_wyrm | Pip | A Wyrm's Tooth | calm 6 Frostpeak creatures | 2 rime, dust, 80 g | ch3 |
| wren_starmint | Wren | A Starlit Garden | harvest 3 starmint | Starlight Elixir recipe | after Lanterns |
| marrow_festival | Marrow | The Moon Festival | deliver 3 moon + 3 wheat + 1 starmint | 3 dust, 120 g | postgame |
Each finished request gives +1 relation (0–5). You can also give each villager their favourite crop once per day for +1 relation.

## Cinematics & states
The campaign triggers `first_restoration`, `boss_*_intro` (first visit to each boss floor), `final_fragment`, `ending` and
`defeat_recover` (first defeat), always through `MM.state.go('cine')`, then returns to the previous state (`play` or `interior`).
After `ending` it goes to `ending` instead. Rewards and the "seen" memory are recorded when the cine is **triggered** via `grantOnce`, so skipping
gives the same rewards as watching and a cine never repeats after a reload. `intro` belongs to MM.flow; `campaign.start()` doesn't play it.
