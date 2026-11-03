# Baseline audit — `src/core/baseline.js`

Audit of the original game code (1,092 lines, 108 top-level functions) as of commit `2dd129b`. All line numbers refer to `src/core/baseline.js` unless another file is named.
Legend: **[V]** = I checked it in headless Chromium (probe scripts, see §11). **[R]** = I read it in the code but did not run it. **[?]** = not verified.

---

## 0. TL;DR for engineers extending the game

- **Classic-script scope rules decide what you can do without patching the file [V]:**
  - The 108 `function` declarations are **writable properties of `window`** (`writable:true, configurable:false`). Internal calls look them up by name each time they run, so another classic script can wrap them, e.g. `const _u=update; update=function(dt){...; return _u(dt);}`. I confirmed this for `update`, `draw`, `drawProp`, `hitEntity` (the `loop` function picked up the wrapped `update` and `draw`).
  - `const`/`let` names (`world`, `game`, `keys`, `enemies`, `SPELLS`, `ctx`…) are **not** on `window`. Any later classic script and `page.evaluate` can still reach them by bare name. `let` bindings can be reassigned from outside (`world = newWorld()` worked). `const` bindings cannot be reassigned, but their contents can be changed (`props.push(...)`, `keys.add('d')`).
  - Hazard: another script that declares a top-level name already used here (`let q`, `const fill`, `function draw`…) will either throw a SyntaxError (for let/const/class) or **silently replace** the baseline function (for `function`/`var`). **Every new module must be wrapped in an IIFE** and publish only on `window.MM`.
- **The sidebar DOM is a hard dependency.** Without `#spellSelect` the script aborts at line 147. Every `let`/`const` declared after that point then stays in the TDZ for good, so other modules get `ReferenceError: game is not defined` **[V]**. Removing any per-frame node (for example `#worldHud`) while the game runs throws inside `draw()` and **stops the rAF loop** **[V]**. A hidden "legacy UI shim" that creates the 59 ids before baseline.js loads fixes this with no patch to baseline.js **[V]** (§8).
- **There is no pause concept.** Pausing works with no patch by wrapping `update` (sim freezes, `draw` keeps running) **[V]**. Input can be blocked with capture-phase listeners on `window` that call `stopPropagation()` **[V]** (§3).
- **Systems worth keeping:** the character controller and animation, the atlas recolour, cast sprites, the 30 spells and their effect renderer, statuses and combos, farming, wards, the ground cache and depth-sorted renderer. **Thin or half-built:** co-op, rifts, constellations, quests, enemy variety (cosmetic only), regions (same map, only tint and mob change) (§9).

---

## 1. Globals & state

### 1.1 Top-level declarations (all share the global lexical scope)
| Kind | Names (line) |
|---|---|
| `const` data | `DIRS`(20) `ANIMATIONS`(21) `FRAME_W,FRAME_H,FOOT_X,FOOT_Y`(31) `COLOR_KEYS`(34) `PALETTES`(38) `defaultLook`(57) `SCREEN_W=512,SCREEN_H=320,TILE_W=32,TILE_H=16,MAP_SIZE=20`(102) `WALK_SPEED=22,FLY_SPEED=60,RIDE_HEIGHT=13`(103) `BOB`(104) `vec`(105) `SPELLS`(108, +10 pushed at 130) `CAST_KINDS`(172) `CAST_HEIGHT`(174) `WIZARDS`(188) `SEED_TYPES`(207) `REGIONS`(213) `SEASONS`(221) `FAMILIARS`(222) `props`(825) |
| `const` objects/state | `canvas`,`ctx`(66–67, `alpha:false`, smoothing off once) `atlasImages`(68) `colorBuffer`(69) `keys`(100, `Set` of lowercase `e.key`) `touchDirections`(101, `Map pointerId→dir`) `dummy`(149) `effects`(150) `numbers`(151) `castPages`(173) `familiarSprite`(234) `ground`,`gc`,`GX`,`GY`(789–791) |
| `const` DOM refs | `debug,modeLabel,modeDetail,mountBtn,touchMount,toggleDebug`(94–99) `spellSelect,castButton,resetDummyButton,spellDesc,dummyStatus`(142–146) `gameUI`(223, arrow fn → `getElementById`) |
| `const` helpers | `clamp`(158) `ease`(159) `defaultPlots`(224) |
| `let` | `chosenLook`(58) `recoloredAtlas`(70) `spellIndex`(148) `castCooldown,combatMessage,combatMessageTime`(152) `game`(153) **`q`**(157, leftover one-letter global!) `world`(232) `enemies,lootDrops,allies,party,particles,bursts,dungeonBlocks`(233) `worldId,worldAutosave,uiClock,familiarClock,touchPlayer`(235) `gearSignature`(586) `previous`(1026) |
| From data files | `ATLAS_DATA` (`assets/js/atlas-data.js`; keys `feminine/masculine/neutral`; 384×3584 PNG each) and `CAST_PAGE_DATA` (`cast-data.js`; 2 PNG pages, 7 kinds per page) |

Arrays that are **`let`** (`enemies`, `lootDrops`, `allies`, `party`, `particles`, `bursts`, `dungeonBlocks`) are **reassigned** by baseline code (`enemies=enemies.filter(...)` at 444, `=[]` in goRegion/resetPlayer…). **Never cache a reference to them.** Always read the binding by name. `effects` and `numbers` are `const` and are only spliced in place.

### 1.2 `game` — player controller (`freshGame()` 154–156)
`x,y` tile coords (float; map 0..20). `vx,vy` velocity in **screen px/s** (converted to tiles with `unproject`). `camX,camY` camera centre in projected px. `heading` (rad), `facing` (one of DIRS). `mounted`. `transition` (`{kind:'mount'|'land',elapsed,duration:.8}` or null). `height` (0..13 px broom height). `elapsed` (sim seconds, also drives every animation clock). `walkDistance`. `frame`, `animation` (key of ANIMATIONS), `state` (text label: Standing/Walking/Hovering/Flying/Mounting/Landing). `target` (click-to-move `{x,y}` or null). `bank`/`bankTimer`. `castRemaining` (.48 s cast pose). `castFacing`.
Note: the debug **Reset** button (1076) *replaces* `game` with a new object, so references held elsewhere go stale (see §9).

### 1.3 `world` — persistent adventure state (`newWorld()` 225–231)
| Field | Meaning |
|---|---|
| `cls` | wizard id (WIZARDS) |
| `region` | REGIONS key |
| `mode` | `'outside'`, `'dungeon'` or `'rift'` |
| `floor` | dungeon floor (0 outside) |
| `riftUnlocked` | set when any boss dies (294) |
| `modifier` | rift modifier `Fortified`, `Frenzy`, `Radiant` or `''` |
| `day`, `time` | day counter; `time` 0..1 (starts .18; +dt/120 → **120 s per day**) |
| `weather` | `Clear`, `Rain` or `Wind` (`weatherFor`, 241) |
| `lastRaid` | day number of the last night raid |
| `gold, hp, mana` | resources (mana max 100 hard-coded; HP max `heroMaxHP()` 238) |
| `ward` | **number**: blessing shield that absorbs damage (max 60). Not the same as `wards` |
| `cloak` | seconds of Shadow Veil remaining |
| `lastDamage` | used by Moment Rewind |
| `stars` | constellations found (0..3) |
| `level, xp, points` | XP needed per level = `level*45` (243–246) |
| `skillByClass` | `{cls:[power,guard,growth]}` ranks 0..3 (`ranks()` 237) |
| `seed` | currently selected seed id |
| `seeds`, `harvest` | per-seed inventories |
| `potions, bombs, runes` | consumables |
| `gear` | array of items (max 40) |
| `equipped` | **1-based** index into gear, or null |
| `plots` | 6 × `{x,y,seed,growth 0..100,watered,health?}` at tiles (7..9, 11..12) |
| `wards` | **array** of farm towers `{x,y,cooldown,power 0..3}`, max 3 |
| `familiar` | `none`, `cat`, `raven` or `golem` |
| `broom` | upgrade level 0..2 |
| `harvested, kills, requests` | lifetime counters (quests read these) |
| `lootMode` | `shared` or `individual` |
| `coop, p2Class, p2Spell` | co-op settings |
| *(added at runtime)* `targetId` | enemy id or `'dummy'` chosen by click |
| *(added at runtime)* `dungeonSeed` | set by `enterDungeon` (401) and **persisted** |

### 1.4 Other state
- `enemies[]` (`makeEnemy` 319–323): `{id,type,x,y,hp,maxHP,boss,name,status:{},flash,attack(timer),special(boss timer),dead,age,raid?,artFacing,artDistance,artMoving}`.
- `lootDrops[]`: `{id,x,y,type:'gold'|'gear'|'rune',amount?,item?,life:90}`.
- `allies[]` (`spawnAlly` 345–350, max 4): `{id,type:'skeleton'|'wisp'|'golem'|'mirage',x,y,life(35 s; mirage 12 s),hp,cooldown,farmCooldown,owner}`.
- `party[]` (co-op companions, `newCompanion` 466–471): a reduced copy of the game-like fields, plus `id(2..4),cls,spellIndex,hp/maxHP 65,gold,power,cooldown,buttonA/B`.
- `dungeonBlocks[]`: `{x,y,variant}` on even tiles (`buildDungeonLayout` 324–330).
- `effects[]` (const, cap 32): `{spell,elapsed,from:{x,y,height},target,caster,hitIndex}`.
- `numbers[]` (const): floating damage text `{value,color,life,offset,x?,y?}`.
- `particles[]` (cap 220) and `bursts[]` (cap 20): see §6.
- `dummy` (149): training dummy at (12,9), 1200 HP, its own status table (`addStatus` 667).
- `familiarSprite` (234): position only. Behaviour lives in updateWorld (453–454, 460–462).
- `chosenLook` (58): `{style,skin,hair,outfit}`.

---

## 2. Main loop

```
loop(t) 1027–1033
  dt = min((t - previous)/1000, 0.2)          // clamp 200 ms
  while remaining: update(min(remaining,1/60)) // semi-fixed: ≤1/60 substeps, last step is the remainder
  draw()                                       // once per rAF
  requestAnimationFrame(loop)                  // by name → wrappers of `loop` take effect next frame
```
`visibilitychange` resets `previous=0` and clears keys (1055). The timestep is **not deterministic** (variable remainder step).

### 2.1 `update(dt)` 733–786, in order
1. 734 `game.elapsed += dt`
2. 735 `updateCombat(dt)` (674–710): cast cooldown, dummy flash/reset/status DoTs, **effects resolve hits** (687–708), `numbers` age.
3. 736 `readInput()` (717–732): returns a move vector from keys, the touch pad, or click-to-move.
4. 737–742 mount/land transition easing.
5. 744–757 velocity smoothing, `moveActor(game, …)` (collision only against dungeon blocks).
6. 759–766 heading, facing, broom bank.
7. 767–781 animation state and frame selection, cast pose override.
8. 782–783 **camera follow** (exp smoothing, rate 4/s).
9. 784 `updateWorld(dt)` (412–464): time/day/weather (413–414), night raid (415), mana regen (416), cloak (417), crop growth (418–423), **enemy AI and attacks** (424–444), allies (445–452), familiar attack (453–454), farm wards (455), loot pickup (456–457), **particles/bursts integrate** (458–459), familiar follow (460–462), **`updateParty(dt)`** (463, 477–501), autosave every 8 s (463).
10. 784 `uiClock += dt` (draw refreshes the sidebar every 0.2 s).

### 2.2 `draw()` 971–1025, paint order
| # | Lines | Layer |
|---|---|---|
| 1 | 972–973 | clear + flat bg `#a0bf9c` |
| 2 | 974 | **ground**: one blit of the cached `ground` canvas (rebuilt only by `drawGround()`) |
| 3 | 975–987 | build `drawables` (local array): props (outside: all 16; dungeon: only lamp/rock), player, dummy and villager (grove outside only), plots (depth −0.1), wards, enemies, dungeon blocks, loot, summons, companions, familiar. `depth = project(x,y).y` |
| 4 | 988 | sort by depth |
| 5 | 989–1002 | dispatch by `type`: drawCharacter, drawDummy, drawFarmPlot, drawWard, drawMonster, drawDungeonBlock, drawLoot, drawSummon, drawCompanion, drawFamiliar, drawVillageKeeper, else drawProp. **Each entity draws its own shadow first**, so shadows are depth-sorted with the entity |
| 6 | 1003 | `drawWeatherAndLight()` (560–563): flat night tint plus rain streaks. Painted **before** spells and particles, so magic is not darkened |
| 7 | 1004 | `drawEffect(fx)` for every effect (875–958) |
| 8 | 1005 | `drawExtraMagic()` (564–572): bursts, then particles |
| 9 | 1006–1008 | damage numbers (text drawn into the canvas) |
| 10 | 1009 | click-to-move target ring |
| 11 | 1010–1023 | **DOM writes every frame** (debug, modeLabel, modeDetail, mount buttons, spellDesc, dummyStatus, castButton) |
| 12 | 1024 | `refreshAdventureUI()` every 0.2 s (587–602, sidebar DOM) |

There is **no in-canvas HUD**. All HUD is DOM. Boss names (527), `P2` labels (544), `DUMMY` (858) and damage numbers (1007) are canvas text, which conflicts with ARCHITECTURE rule 5.

### 2.3 Hook points (exact locations)
| Hook | Patch location | Zero-patch alternative (verified mechanism) |
|---|---|---|
| preUpdate | top of `update`, before 734 | wrap `update` |
| postUpdate | after `updateWorld(dt)` at 784 | wrap `update` (runs once per substep) |
| between combat and movement | after 735 | wrap `updateCombat` |
| world sim extra | end of `updateWorld`, before 463 | wrap `updateWorld` |
| preDraw (after clear, before ground) | after 973 | none (inline) |
| postGround / decals (before entities) | after 974 | bake into `ground` by wrapping `drawGround` (static only) |
| **depth-sorted entity insertion** | after 987, before the `sort` at 988; add a `custom` branch before the final `else` at 1001 | push `{type:'custom',x,y,draw}` objects into the `props` const array and wrap `drawProp` to call `p.draw` (outside: all props are drawn; dungeon: only `lamp`/`rock`) |
| postWorld / preLight | between 1002 and 1003 | wrap `drawWeatherAndLight` (pre-call) |
| lighting replacement | 1003 | replace `drawWeatherAndLight` |
| post-effects | after 1005 | wrap `drawExtraMagic` (post-call) |
| overlay (screen space) | after 1009, before DOM writes | wrap `draw` (post-call) |
| postDraw | end of `draw` (1024) | wrap `draw` |

---

## 3. Input

- **Keyboard** (`window` keydown 1036–1052, keyup 1053):
  - Ignored when Alt/Ctrl/Meta is held, or when focus is in `select`/`input`/`textarea`.
  - Space and Enter are ignored when focus is on a `button`.
  - Movement keys (`w a s d` and the arrows) go into `keys`.
  - One-shot actions (non-repeat): `b` → `toggleBroom`, Space → `castSpell()`, `e` → `tendPlot()`, `h` → `drink()`, Enter → P2 cast (co-op only), `1`–`5` → `chooseSpell(0..4)` (global spell indices, not per class).
  - In co-op the arrow keys stop moving P1 (718–719) and move P2 instead (484).
- **Touch pad**: `[data-dir]` buttons (1056–1060) use pointer capture and write into `touchDirections`. `touchPlayer` (1 or 2) decides who the pad drives.
- **Canvas pointerdown** (1061–1072), checked in priority order:
  1. Enemy hit-box → `world.targetId=id; castSpell()`.
  2. Farm plot → `tendPlot(plot)`.
  3. Villager at (6.1, 10.4) → `turnInQuest()`.
  4. Dummy → target it and cast.
  5. Otherwise click-to-move: `game.target = unproject(screen + cam)`, clamped to `.6..MAP_SIZE-.6`.

  Screen mapping is `(client - rect) * 512 / rect.width`, which assumes the canvas CSS box *is* the drawing area (no letterboxing or `object-fit`).
- **Gamepads**: polled only inside `updateParty` (480), so only in co-op. Pad *i* drives `party[i]`: the first pad controls **P2**, and P1 has no pad support. Button 0 casts, button 1 toggles the broom (instantly, with no transition).
- **Clearing**: `clearControls()` (711) is called on `blur` and on hidden `visibilitychange`.
- **No pause or input gating exists.** What is needed:
  1. Stop the sim: skip `update` (patch at 1031, or wrap `update`; verified that `game.elapsed` freezes while `draw` keeps running).
  2. Block keydown and pointerdown: patch early-returns at 1037 and 1062, or add `window.addEventListener('keydown'|'pointerdown', e=>{if(paused)e.stopPropagation();}, true)`. A capture listener on `window` runs before the canvas listener and before the bubbling listener on `window`. **Verified for both keydown and pointerdown.**
  3. Call `clearControls()` when entering pause so held keys don't stick. Keyup still reaches baseline unless you block it.
  4. Gamepads are gated automatically, because they are polled inside `update`.
  5. Autosave (463) and the day clock also stop, because they live in `update`.

---

## 4. Camera & map

- `project(x,y)` (160) gives `{(x−y)·16, (x+y)·8}`. `unproject` (161) is its inverse. Both work on deltas or absolute values.
- `worldToCanvas(x,y)` (851) = `round(256 + p.x − camX, 160 + p.y − camY)` (integer pixels).
- The ground blit at 974 uses the same `camX/camY` minus `GX,GY`.
- Camera follow: 782–783 lerps `camX/camY` toward the player's projected position (`1−e^(−4·dt)`). There is **no clamp to map bounds**, **no shake** and **no look-ahead**. The projected map is 640×320 px against a 512×320 screen, so it barely scrolls horizontally.
- Hard camera snaps: 157 (boot), 354 (`resetPlayer`), 395 (`goRegion`), 1076 (Reset button).
- Bounds:
  - `MAP_SIZE=20` (102).
  - Actors are clamped to `.6..19.4` in `moveActor` (334; hard-coded, not derived from MAP_SIZE).
  - Spawns are clamped to `1..19` (341). Allies spawn in `1..19` (348).
  - Click targets are clamped to `.6..MAP_SIZE−.6` (1071).
  - **No collision with trees, props or the pond.** The only collision is with dungeon blocks (`blockedAt` 331).
- Ground cache `ground` canvas: 740×420 (789), origin `GX=370, GY=22`. `drawGround()` (794–822) **must be called after any change to region, mode, floor or dungeonSeed** (it reads `world`).
  - Outside: grass/stone palette, a stone "plaza" (7..12) and cross paths (9..10), and a pond (x≥15, y≤4).
  - Dungeon/rift: grey palette seeded by `dungeonSeed + floor*37` (803), no pond.
  - The tint is composited `source-atop` (820–821): `REGIONS[region].tint` outside, `rgba(45,39,58,.25)` in dungeons.
- **Every region uses the same layout and the same 16 props.** Only the tint and the mob type change.
- Mode switches: `goRegion` (392–398), `enterDungeon` (399–403), `advanceFloor` (404–409), `resetPlayer` (351–356), `initializeExpansion` restore (625–626). All of them reset `enemies` (and most reset `lootDrops`, the player, familiar, party and allies) and call `drawGround()`.

---

## 5. Content tables

### 5.1 SPELLS (108–141) — 30 entries
Rules that apply to every spell:
- Mana cost = summon 18; blessing/rewind/cloak 15; otherwise `min(17, 6+floor(dmg/16))` (644).
- Range 220 screen px (649). Global cooldown 0.32 s. Cast pose 0.48 s.
- Damage is split evenly across the `hit[]` times.
- The first hit applies `status`.
- Kinds `fireball, blizzard, storm, meteor, nova, wave` **splash** 55% damage to other enemies within 28 px (702).

| id | name | school | kind | dmg | hits (s) | status / special |
|---|---|---|---|---|---|---|
| ember | Ember Bolt | Fire | bolt | 34 | .38 | burn |
| frost | Frost Shard | Frost | shard | 36 | .43 | chill |
| spark | Arc Spark | Storm | lightning | 32 | .17 | shock (no mechanical effect) |
| missile | Arcane Missile | Arcane | missile | 39 | .35 | – |
| poison | Venom Seed | Nature | seed | 26 | .40 | poison |
| star | Starlight Dart | Astral | star | 38 | .42 | – |
| moonbeam | Moonbeam | Moon | beam | 48 | .18 | – |
| sunlance | Sun Lance | Sun | beam | 45 | .19 | burn |
| fireball | Fireball | Fire | fireball | 60 | .55 | burn, splash |
| blizzard | Blizzard | Frost | blizzard | 60 | .38/.72/1.06 | chill, splash |
| thunder | Thunderstorm | Storm | storm | 72 | .37/.70/1.02 | shock, splash |
| vines | Vine Grasp | Nature | vines | 31 | .40 | root |
| meteor | Meteor Fall | Fire | meteor | 82 | .68 | burn, splash, 28 particles |
| earth | Earth Spikes | Earth | spikes | 56 | .40 | – |
| tide | Tidal Wave | Water | wave | 49 | .55 | **wet** (698), splash |
| wind | Wind Slash | Wind | wind | 42 | .35 | – |
| shadow | Shadow Orb | Shadow | orb | 58 | .62 | – |
| gravity | Gravity Well | Arcane | well | 30 | .45 | vulnerable (+25% taken) |
| fairy | Fairy Swarm | Spirit | swarm | 60 | .38/.63/.88 | – |
| nova | Radiant Nova | Sun | nova | 65 | .38 | splash |
| bone | Bone Spear | Necromancy | shard | 46 | .38 | – |
| skeleton | Raise Skeleton | Necromancy | summon | 0 | .20 | ally `skeleton` (also waters crops, 447) |
| siphon | Soul Siphon | Necromancy | beam | 34 | .22 | heal 12 → **always heals P1** (701) |
| wisp | Summon Wisp | Summoning | summon | 0 | .20 | ally `wisp` |
| golem | Summon Golem | Summoning | summon | 0 | .20 | ally `golem` |
| hex | Spirit Hex | Voodoo | well | 36 | .35 | vulnerable |
| ward | Ancestor’s Blessing | Voodoo | summon | 0 | .20 | `world.ward` +30 (max 60), +18 HP to P1 and to party within 80 px (691) |
| rewind | Moment Rewind | Arcane | summon | 0 | .20 | heal `clamp(lastDamage,10,35)` (692) |
| cloak | Shadow Veil | Shadow | summon | 0 | .20 | `world.cloak=7` → enemies ignore P1 (428) |
| mirage | Moon Mirage | Moon | summon | 0 | .20 | decoy ally, 40 HP, 12 s; enemies target it |

**Combos** (697–700, 264):
- Tide applies wet.
- Frost on a wet target → root.
- Fire on a rooted target → burn.
- Storm against a wet target: +50% damage.

**Statuses** (`statusOptions` 282–285; dummy copy in `addStatus` 667–673):
- burn: 3 dmg per 0.6 s for 2.4 s.
- poison: 4 dmg per 0.75 s for 3 s.
- chill: −50% enemy speed.
- root: speed 0.
- vulnerable: ×1.25 damage taken.
- wet: enables the combos above.
- shock: **no effect**.

**Damage multiplier** (`spellMultiplier` 255–268): starts at 1, then:
- +10% per power rank (P1 only).
- +25% when the spell's school matches the class.
- +2.5% per point of equipped gear power; +10% with the Spellpower affix.
- +12% Fire/Frost/Moon while holding ≥1 harvested ember/frost/moon crop.
- +4% per star for Astral.
- +50% Storm vs wet.
- +20% in a Radiant rift.
- Party actors get ×(1 + power·2.5%).

### 5.2 WIZARDS (188–206) — 17 classes
Every class has `{id,name,school,starter,paths[3],desc}`. The three skill paths share the same mechanics for every class:
- Rank 0: +10% damage.
- Rank 1: +20 max HP.
- Rank 2: +2 mana/s and +12% crop growth.

The path names are cosmetic.

Class-specific code exists for `grove`, `ember`, `frost`, `storm`, `earth`, `sun`, `moon`, `beast`, `alchemy`, `shadow`, `time` and `summoner`. The remaining five behave as follows:

| class | what the code does |
|---|---|
| `tide` | **no code**: the "rain helps your garden" text applies to everyone |
| `rune` | **no code**: "socketed runes add power" also applies to everyone |
| `necro`, `star`, `voodoo` | school bonus only |

There are also perks the descriptions don't mention:
- `frost` sells crops for 11 gold instead of 9 (383).
- `storm` makes wards fire every 0.65 s (455).
- `sun` halves raid damage to crops (439).

### 5.3 SEED_TYPES (207–212), farming (357–371, 418–423)
| seed | in-season | growth time (s) | use |
|---|---|---|---|
| wheat | Summer | 24 | 2 → potion |
| ember | Summer | 28 | 1 → bomb |
| frost | Winter | 30 | – |
| moon | Autumn | 30 | – |

- No seed is in season during Spring.
- Planting uses 1 seed. A plot planted during rain starts watered.
- Growth happens only while watered, and watered stays true until harvest (water once per planting). Rain waters every plot.
- Growth multipliers: season ×1.25, growth rank +12% per rank, grove ×1.25, time ×1.15, ember-on-ember ×1.25, moon-on-moon at night ×1.4, golem familiar ×1.1, Harvest affix ×1.15.
- Harvest: 12% chance of a double; awards 7 XP (12 on a double).
- Selling (383) converts **every** crop at 9 g (11 for frost). This also removes the crop-holding spell bonuses.
- Seeds are bought in packs of 3 of the selected seed: 12 g, or 9 g after the first request (388).

### 5.4 REGIONS (213–220)
| id | name | mob | tint |
|---|---|---|---|
| grove | Moonflower Grove | slime | none |
| forest | Blighted Forest | blight | `rgba(65,82,57,.20)` |
| swamp | Whispering Swamp | ghost | `rgba(58,105,93,.25)` |
| mountain | Frostpeak | ice | `rgba(150,192,212,.32)` |
| crypt | Old Crypt | skeleton | `rgba(65,54,76,.32)` |
| sky | Starfall Island | spirit | `rgba(146,122,181,.23)`; needs broom level 2 |

- The `level` field (1..6) is **unused**.
- Travelling (`goRegion`) spawns 3–4 mobs (none in the grove).
- The farm, dummy, villager, wards and raids exist only in the grove while outside.

### 5.5 Enemies & bosses (`makeEnemy` 319–323, AI 424–443)
- **All mob types share the same stats and AI**; the type only picks the sprite.
- HP = (boss 210 / mob 45) + 8·level + 12·floor + 35 in rifts, then ×1.35 in a Fortified rift.
- Movement: steer toward the nearest target with 18 px separation; pace 14 px/s (boss 13), +7 in Frenzy, ×0.5 when chilled, 0 when rooted; a side-step is tried when blocked.
- Targets: P1 (unless cloaked), living party members, and mirages. Raiders prefer crops.
- Melee at ≤23 px:
  - Mobs: 4 damage every 1.8 s. Bosses: 14 damage every 1.2 s.
  - `world.ward` absorbs damage first.
  - Crops take 2× damage (1× for `sun`).
- Bosses also pulse every 4 s for 9 damage within 55 px (P1 only).
- Boss names by region (321): Wicker King, Blight Guardian, Mire Mother, Frost Giant, Bone Regent, Star Warden. The `'Rift Guardian'` fallback is unreachable.
- Bosses spawn only on **dungeon/rift floors where floor%3==0** (407 and 626). One boss per group, and it gets a crown and its name drawn above it.
- A boss kill sets `riftUnlocked` **[V]**.
- Raids (415): 2 + min(3, level) `blight` raiders.

### 5.6 Drops, gear, affixes (`dropReward` 296–307, `pickup` 308–318)
- Gold always drops: boss 42, otherwise 8 + 2·level; ×1.3 for `shadow`, ×1.2 with the cat familiar, ×1.2 with the Greed affix.
- Gear drops 50% of the time (always from bosses):
  - Rarity: Legendary if the roll is >.95 or the source is a boss; Rare >.76; Magic >.43; otherwise Common.
  - power = (boss 5 / mob 1) + level + {0, 1, 3, 5} by rarity.
  - Slot is Wand, Robe, Ring or Charm, but **the slot is only part of the name**.
  - Affix is Vitality (+15 max HP), Focus (+3 mana/s), Harvest (+15% growth), Greed (+20% gold) or Spellpower (+10% damage).
  - Sockets: 0 of 1 (2 for Legendary).
- Runes drop 20% of the time.
- Drops last 90 s and are auto-picked up within 15 px (456), or within 55 px with the "Collect nearby loot" button.
- Only **one** item can be equipped (`world.equipped`). Socketing a rune gives +4 power (386).

### 5.7 Consumables, quests, upgrades, familiars, stars, cycle
- **Potions**: `brew` (379) turns 2 wheat into 1 potion (2 for alchemy). `drink` (382, key H) restores +40 HP (55 for sun) and +25 mana.
- **Bombs**:
  - `brewBomb` (380): 1 ember pepper → 1 bomb.
  - `throwBomb` (381): fires a copy of the fireball effect with `id:'bomb', damage 48`, using the cast cooldown and no mana.
  - It applies burn and splash, has **no key binding**, and does not go through `castSpell`.
- **Quests** (`turnInQuest` 387; click the villager or use the button):
  - Request #n needs a lifetime total of 2n harvests and 2n kills (counters are not consumed).
  - Reward: +45 g (+10 on festival days, day%3==0) and 30 XP.
  - Request 1 makes seeds cost 9; request 2 makes runes cost 24. After that the request just repeats.
  - The keeper's stall and banner visuals appear at 555–556.
- **Upgrades**:
  - Broom 0→2 (390): costs 55 then 105; +15% fly speed per level; level 2 unlocks `sky`.
  - Wards (`buildFarmWard` 372, 40 g, max 3, placed at the player's position):
    - Each ward hits the nearest enemy within 75 px every 1 s (0.65 s for storm).
    - Damage is 12 (18 for earth) + 5·power.
    - Wards work only in the grove while outside.
    - `empowerWard` (378) spends a rune to raise power, up to rank 3.
  - Runes can be bought for 30 g (24 after request 2, 389).
  - Skills: `upgradeSkill` (384).
- **Familiars** (FAMILIARS 222):
  - Behaviour: follows the player; attacks the nearest enemy within 100 px every 1.8 s (1.2 s for beast) for 7 damage (12 for golem) (453–454).
  - cat: +20% gold. golem: +10% crop growth. **raven: no perk.**
- **Constellations** (`discoverStar` 391): a button that works only at night. Max 3; each gives +12 XP and +4% Astral damage. There is no exploration or minigame.
- **Day/season/weather**:
  - A day lasts 120 s. Night is `time ≥ .68 || < .10`.
  - Season = `SEASONS[floor((day−1)/3)%4]`, i.e. 3 days per season, starting in Spring.
  - Weather follows a fixed 6-day cycle: `Clear, Rain, Clear, Wind, Rain, Clear` (241).
  - Rain waters crops and draws streaks outside. Night applies a flat blue overlay. **Wind does nothing.** The festival is a HUD label plus the +10 g quest bonus.
  - "Rest ¼ day" adds .25 to `time` (616).

---

## 6. Rendering

All drawing goes to `ctx` at 512×320, with integer-rounded coordinates via `fill()` (835) and `worldToCanvas`.

**Procedural vs sprite-based**

| Element | How it is drawn |
|---|---|
| Ground tiles | procedural, cached (`drawGround` 794) |
| Props | procedural: `tree` 837 (2 variants), `lamp` 847, `flowers` 848, `bench` 849, rock inline in `drawProp` 850 |
| Farm plots | procedural (502) |
| Wards | procedural (510) |
| Dungeon blocks | procedural (511) |
| Loot | procedural (546) |
| Boss crown and HP bars | procedural (520–526) |
| All spell effects | procedural (`drawEffect` 875–958, `impact` 868, `magicRing` 867, `pixelLine` 862, `sparkle` 866) |
| Night/rain | procedural (560–563) |
| Player | **atlas sprite** (`drawCharacter` 959–970): row = `ANIMATIONS[anim].row + dirIndex`, column = frame; recoloured atlas built by `buildColoredAtlas` 71–88 |
| Mirage and companions | atlas sprite (raw atlas for companions; mirage at alpha .48) |
| Enemies, allies, familiars, keeper, dummy | **cast sprites** (`drawCastSprite` 175–183) |

Player sprite details:
- The vertical offset is `height − BOB[frame]`.
- The shadow ellipse shrinks with height (963–964).

Cast sprite details (`drawCastSprite` 175–183):
- 14 kinds (`CAST_KINDS` 172); page = `index/7`.
- 16 rows per kind: 8 idle directions, then 8 walk directions.
- Walk frame = `artDistance/3`; idle runs at 5 fps.
- Facing comes from `noteCastMotion` (184–187), which `moveActor` calls.
- `CAST_HEIGHT` (174) gives sprite heights for bars and click boxes.
- Hit flash uses `ctx.filter='brightness()'` (516, 855). This is a no-op on browsers without canvas filters [?].

Other rendering notes:
- **Shadows**: each entity draws its own ellipse just before its sprite (538, 515, 530, 542, 546, 549, 554, 838, 847–850, 854, 964). There is no global shadow pass.
- **Region tint** is baked into the ground only. Sprites are never tinted.
- **Lighting** is a single flat night rectangle. Lamps emit no light.
- **Particles** (`addParticles` 247–254):
  - Each call pushes `count` (default 16) pixel particles. They live in world position plus a screen offset, with gravity 18 px/s².
  - **Each call also pushes one ring "burst".**
  - Caps: **particles 220** (oldest spliced first), **bursts 20** **[V]**.
  - Update happens at 458–459 (inside updateWorld); drawing in `drawExtraMagic`.
  - Callers: castSpell (10 particles), every spell hit (18, or 28 for meteor), boss pulse 18, melee hit 6, ally hit 5, familiar 4, ward 4, bomb 10.
- **Other caps**:
  - effects 32: the oldest is shifted out (381, 653), and **its pending hits are lost**.
  - numbers: 40 (293) or 20 (664).
  - allies 4; party 3; gear 40; wards 3.
- **Performance**: `draw()` takes ~0.35 ms per frame in headless Chromium **[V]**.
- If anything resizes `canvas.width/height`, `imageSmoothingEnabled` resets and must be set to false again (67).

---

## 7. Save / load

| Key | Written by | Content |
|---|---|---|
| `moss-moon-adventure-v1` | `saveWorld` (573–576): autosave every 8 s (463) and the Save button | `JSON.stringify({...world, coop:false, targetId:null})`, ~1 KB **[V]**, 41 fields (all of §1.3 plus `dungeonSeed` once set) |
| `moss-moon-look` | `chooseLook` (1085), only when the look changes | `chosenLook` |

- **Versioning**: none apart from `-v1` in the key name. There is no schema field and no migration.
- `loadWorld` (577–585) runs **once, during script evaluation**, inside `initializeExpansion` at 604:
  - It does a shallow merge over `newWorld()` (nested merge only for `seeds` and `harvest`).
  - It validates `cls`, `region`, `seed`, `familiar`, `plots.length===6`, the gear and wards arrays, and `hp`/`mana`.
  - It does **not** validate gear items, `skillByClass`, `equipped` range, `wards` entries, `mode`, `floor` or `modifier`.
  - The look is read at 59–65.
- Errors: a parse error resets the world. A storage error is swallowed (private mode).
- **Not persisted**:
  - Player position, heading and mount state (always respawns at (9.7, 10)).
  - The selected spell (reset to the class starter at 627).
  - enemies (respawned fresh, so a boss floor **respawns its boss on load**, letting you re-farm the boss and rift unlock).
  - lootDrops, allies/summons, party/co-op, the dummy, effects, the `worldId` counter, the camera and the familiar position.
- **No "new game" path**: the only way to start over is to clear localStorage. The Reset button resets only `game` and the dummy.

---

## 8. DOM coupling (what breaks if the sidebar is removed)

**Load-time `getElementById` captures**:
- 66: `scene` (keep it, it's the canvas).
- 94–99: `debug`, `modeLabel`, `modeDetail`, `mount`, `touchMount`, `debugToggle`.
- 142–146: `spellSelect`, `castButton`, `resetDummy`, `spellDesc`, `dummyStatus`.
- 1076: `reset`.

**Where they are used**:
- Line 147 writes `spellSelect.innerHTML`. This is **the first crash** if the node is missing; the rest of the file never runs **[V]**.
- draw() writes all of them **every frame** (1010–1023).
- Listeners at 1073–1077.
- `chooseSpell` (634) writes `spellSelect.value`; so does `toggleLocalCoop` (474).

**`gameUI(id)`** (223; ids and the lines that use them):
- `worldHud` 588 · `areaLabel` 589 · `areaSub` 590 · `classDesc` 591 · `farmInfo` 592 · `adventureInfo` 593 · `progressInfo` 594
- `skill0..2` 595 · `gearSelect` 385/596 · `gearInfo` 597 · `questInfo` 598
- `toggleCoop`, `lootMode`, `p2Cast`, `depositP2` 599 · `touchActor` 473/600 · `openRift`, `nextFloor` 601
- `classSelect` 605/611 · `seedSelect` 606/612 · `regionSelect` 607/617 · `familiarSelect` 608/613
- `p2Class` 609/614 · `p2Spell` 610/614/615/1074
- Click handlers on all 31 action buttons (616–624): `farmAction buildWard empowerWard restTime brewPotion usePotion brewBomb throwBomb sellCrops travelRegion enterDungeon nextFloor exitDungeon openRift skill0 skill1 skill2 equipGear socketRune collectLoot finishQuest buySeed buyRune upgradeBroom discoverStar toggleCoop lootMode p2Cast depositP2 touchActor saveGame`.

`refreshAdventureUI` (every 0.2 s) and `initializeExpansion` (at load) both crash on the first missing id.

**`querySelectorAll`** (null-safe, nothing breaks): `[data-dir]` (711, 1056), `[data-style]` and `[data-group][data-color]` (1079–1080, 1087–1088).

**Game logic that depends on the DOM**:
- `equipSelected` (385) reads the gear index from `#gearSelect.value`.
- `goRegion` via the travel button reads `#regionSelect.value` (617).
- All player feedback goes through `message()` (631): one slot, shown only inside `#spellDesc` for 1.5 s.

**Recommendation, in order of preference:**
1. **Now, with zero patches [V]:** load `src/ui/legacy-shim.js` **before** baseline.js. It appends a hidden `<div id="mm-legacy-ui" hidden>` holding every missing id from the list above (59 ids): `<select>` for `*Select`, `p2Class` and `p2Spell` (so `.value` and `<option>` work), `<span>` for the text nodes, `<button>` for the rest.
   - In my probe the baseline ran on a bare page containing only `<canvas id="scene">` with no errors, and the loop advanced.
   - The new menu then calls baseline functions by name (`goRegion('swamp')`, `tendPlot()`, `castSpell()`, `equipSelected`→ set `world.equipped = i+1` directly) and reads `world`/`game` for its HUD.
2. **Phase 2 patch (cleanest long-term), seam S1 below:** add a hoisted null-safe `uiEl(id, tag)` that returns the element or a cached detached stub. Use it at 94–99, 142–146, 223 and 1076. Gate the per-frame DOM writes (1010–1024) behind `window.MM?.legacyUI !== false`. Have `message()` emit an event.

---

## 9. Bugs, dead ends, half-finished systems

| # | Severity | Finding | Where |
|---|---|---|---|
| 1 | High (refactor) | Hard DOM dependency. A missing node kills the script at load (permanent TDZ for `game`, `world` …) or kills the loop at runtime **[V]** | §8 |
| 2 | Med | **Night raid fires twice on the first night, then at midnight instead of dusk.** Night spans two day numbers (`time<.10` belongs to the next day), and `lastRaid` is keyed by day. Probe: day 1 at .68 → raid; day 2 at .00 → raid again; day 2 at .68 → none **[V]**. Fix: key raids by night, e.g. `const night = world.time<.10 ? world.day-1 : world.day` | 415 |
| 3 | Med | Co-op is half-finished: P2 spends **P1's mana** (100→82 after a P2 wisp cast **[V]**); siphon heals, blessing and cloak always apply to P1; the first gamepad drives P2 and P1 has no pad; companions can't die (reset to 65 HP); the party never shrinks; P2's broom has no transition; XP and kills are shared; the party isn't saved | 466–501, 644–650, 691–701, 442 |
| 4 | Med | Enemy types are cosmetic (identical stats and AI); `REGIONS[].level` is unused; all regions share one map and props | 319–323, 213–220, 825 |
| 5 | Low | The `shock` status has no effect (it gets applied **[V]** but nothing reads it) | 284 |
| 6 | Low | Effect cap 32 shifts out the oldest effect, so its unresolved damage is lost | 381, 653 |
| 7 | Low | Inconsistent number caps (40 vs 20). The dummy has its own copy of the status table (`addStatus`) | 293, 664, 667 |
| 8 | Low | Class text doesn't match the code (tide, rune have no perk); some perks are undocumented (frost, storm, sun) | §5.2 |
| 9 | Low | Keys 1–5 always select spells 0–4 (Ember…Venom), whatever the class | 1049 |
| 10 | Low | The Reset button replaces `game`. Allies keep the old `owner`, lose the summoner bonus and are treated as non-player in `spellMultiplier` | 1076, 450, 256 |
| 11 | Low | There is no death state: `resetPlayer()` (−12 g, teleport home) is called inline from the enemy loop | 433, 441, 351 |
| 12 | Low | No collision outside dungeons (you can walk through trees and the pond); bounds are hard-coded | 334 |
| 13 | Low | `advanceFloor` keeps `lootDrops` (loot may sit inside new blocks); `enterDungeon` while already inside restarts at floor 1 | 404–409, 399 |
| 14 | Low | Load respawns the boss on a floor%3 save (boss and rift unlock can be farmed); loaded gear, skills and equipped index are not validated | 626, 577–585 |
| 15 | Info | Canvas text (boss name, P#, DUMMY, damage numbers) conflicts with the "UI is DOM" rule | 527, 544, 858, 1007 |
| 16 | Info | Naming collision: `world.ward` (shield number) vs `world.wards` (towers) vs spell id `ward` (Ancestor’s Blessing) | 227, 229, 137 |
| 17 | Info | Stray global `let q` (157) and very generic global function names (`fill`, `tree`, `hash`, `draw`, `update`, `message`, `speed`, `season`, `pickup`…). Any top-level redeclaration in another script throws or silently overrides | – |
| 18 | Info | Thin systems: **rift** (a modifier plus HP only, endless floors, no reward), **constellations** (a night-time button), **quests** (one repeating counter check), **raven** (no perk), **Wind/Spring** (no effect), **gear slots** (name only), **festival** (label only) | §5 |
| 19 | Info | Pointer mapping assumes no letterboxing; gamepads are only polled in co-op; autosave runs every 8 s even under menus (unless `update` is paused) | 1062, 480, 463 |

**Solid, keep as-is:**
- Character controller and animation selection (733–786).
- Atlas recolour (71–93).
- Cast-sprite pipeline (172–187).
- Spell data and effect renderer (108–141, 868–958).
- Status/combo resolution in `updateCombat` (687–708).
- Farming growth (418–423) and plots.
- Farm wards.
- Loot and gear generation (296–318, as a starting point).
- Dungeon block generator (324–331).
- Ground cache plus depth-sorted renderer (788–822, 971–1002).

**Rework:** co-op, rift, quests, constellations, region identity, enemy archetypes, lighting, raid timing, DOM layer.

---

## 10. Seams — prioritized minimal patches to baseline.js

Every patch is guarded so baseline still runs with no MM present. Line numbers refer to the **unpatched** file. Apply bottom-up, or re-locate each patch by its anchor text.

**S0. Helpers.** Insert after line 65, before `const canvas=` at 66.
```js
// --- MM seams (no-ops without window.MM) ---
const UI_STUBS={};
function uiEl(id,tag='div'){return document.getElementById(id)||UI_STUBS[id]||(UI_STUBS[id]=document.createElement(tag));}
function mmEmit(name,data){try{window.MM?.bus?.emit?.(name,data);}catch(e){console.error('[MM emit]',name,e);}}
function mmHook(name,...a){const f=window.MM?.hooks?.[name];if(typeof f==='function'){try{return f(...a);}catch(e){console.error('[MM hook]',name,e);}}}
function mmPaused(){return !!(window.MM?.isPaused?.()??window.MM?.paused);}
```
- `try/catch` keeps one bad listener from killing the rAF loop.
- `window.MM?.` is required: a bare `MM` throws a ReferenceError under `'use strict'` if MM is missing.
- The `MM` API names (`isPaused`, `hooks`, `settings.get`, `save`, `camera`) are placeholders for the core agent to fix.

**S1. DOM decoupling (P0).**
- 94–99: `document.getElementById('x')` → `uiEl('x')`. For `debugToggle`, use `uiEl('debugToggle','button')`.
- 142: `uiEl('spellSelect','select')`. 143–146: `uiEl(...)`.
- 223: `const gameUI=id=>uiEl(id,/Select$|^p2(Class|Spell)$/.test(id)?'select':'div');`
- 1076: `uiEl('reset').addEventListener(...)`.
- 1010: wrap lines 1010–1023 in `if(window.MM?.legacyUI!==false){ … }`.
- 631: `function message(text){combatMessage=text;combatMessageTime=1.5;mmEmit('message',{text});}`

**S2. Pause / state gating (P0).**
- 1031: `if(!mmPaused())while(remaining>0.00001){…}`. `previous` is still updated at 1030, so there is no dt spike on resume.
- 1037: `if(mmPaused())return;`
- 1062, first line of the canvas pointerdown handler: `if(mmPaused())return;`
- 1057, touch pad pointerdown: `if(mmPaused())return;`
- The MM state machine must call `clearControls()` when it enters a paused state. Cinematics count as paused.

**S3. Hooks (P1).**
- 734 (top of `update`): `mmHook('preUpdate',dt);`
- 784 → `updateWorld(dt);mmHook('postUpdate',dt);uiClock+=dt;`
- 973 (after the bg fill): `mmHook('preDraw',ctx);`
- 974 (after the ground blit): `mmHook('drawGround',ctx);` for decals, footprints and blob shadows.
- 987→988: `mmHook('drawables',drawables,project);` lets modules push `{type:'custom',depth,x,y,draw(ctx,pos)}`.
- 1001: insert `else if(item.type==='custom')item.draw(ctx,worldToCanvas(item.x,item.y));` before the final `else`.
- 1003: `if(mmHook('light',ctx)!==true)drawWeatherAndLight();` lets a lighting module replace the flat night tint.
- 1005→1006: `mmHook('postEffects',ctx);`
- 1009→1010: `mmHook('overlay',ctx);` (screen space). End of `draw` (1024): `mmHook('postDraw');`

**S4. Events (P1).** `mmEmit(...)` one-liners at these anchors:

| Event | Line | Insert |
|---|---|---|
| levelup | 245, inside the `while`, after `world.level++` | `mmEmit('levelup',{level:world.level});` |
| hit | 291, after `target.flash=.18;` | `mmEmit('hit',{target,amount:hit,color,source});` |
| hit (dummy) | 662, after `dummy.flash=.18;` | `mmEmit('hit',{target:dummy,amount:hit,color});` |
| kill / boss | 294, inside `if(target.hp===0&&!target.dead){` | `mmEmit('kill',{enemy:target,source,boss:!!target.boss});if(target.boss)mmEmit('boss',{phase:'defeated',enemy:target});` |
| pickup | 317, before `drop.life=0;` | `mmEmit('pickup',{type:drop.type,amount:drop.amount,item:drop.item,actor});` |
| boss spawn | 342, after `enemies.push(enemy);` | `if(enemy.boss)mmEmit('boss',{phase:'spawn',enemy});` |
| death | 351, first statement of `resetPlayer` | `mmEmit('death',{region:world.region,mode:world.mode});` |
| plant | 363, before `return true` | `mmEmit('plant',{plot:p,seed});` |
| harvest | 366, after `awardXP(...)` | `mmEmit('harvest',{plot:p,seed:p.seed,amount,mutated});` |
| water | 369 | `mmEmit('water',{plot:p});` (optionally also 447, skeleton) |
| quest | 387, after `world.requests++;` | `mmEmit('quest',{requests:world.requests});` |
| region | 397, before `message(...)` | `mmEmit('region',{id});` |
| dungeon | 402 | `mmEmit('dungeon',{mode:world.mode,floor:1,modifier:world.modifier});` |
| dungeon (next floor) | 407 | `mmEmit('dungeon',{mode:world.mode,floor:world.floor,boss});` |
| day | 414, inside the `if` | `mmEmit('day',{day:world.day,season:season(),weather:world.weather});` |
| raid | 415, inside the `if` | `mmEmit('raid',{day:world.day});` |
| hurt | 433, after `world.hp-=pulse;` | `mmEmit('hurt',{amount:pulse,from:enemy});` |
| hurt | 441, after `world.hp-=damage;` | `mmEmit('hurt',{amount:damage,from:enemy});` |
| save | 574, after `setItem` | `mmEmit('save',{silent});` |
| cast | 656, before `message(` | `mmEmit('cast',{actor,spell,target});` |
| cast (bomb) | 381, after `effects.push(...)` | `mmEmit('cast',{actor:game,spell:{id:'bomb',school:'Fire'},target});` |
| mount | 715 | `mmEmit('mount',{kind:game.transition.kind});` |

**S5. Sprite-based art override (P2).** The `MM.art` anchor is the bottom-centre foot, which is what these functions receive.
- 850, first statement of `drawProp`: `const art='prop_'+p.type+(p.variant?'_'+p.variant:'');if(window.MM?.art?.has?.(art)){MM.art.draw(ctx,art,x,y);return;}`
- 176, after `if(index<0)return;` in `drawCastSprite`: `if(window.MM?.art?.has?.('cast_'+kind)){MM.art.draw(ctx,'cast_'+kind,pos.x,pos.y,{frame:…,flip:…});return;}`. Reuse the existing frame and direction maths. Moving lines 178–180 above the check is the simplest way.
- Same pattern for `drawFarmPlot` 502, `drawWard` 510, `drawDungeonBlock` 511 and `drawLoot` 546.
- For tiles: in `drawGround` at 806, draw `MM.art` tiles into `gc` (it's cached, so cost doesn't matter).
- Zero-patch fallback **[V]**: wrap `drawProp` (called ~1,000×/s).

**S6. Camera shake / look-ahead (P2).**
- 782–783 → `const cam=window.MM?.camera,lead=cam?.lookAhead??0,cf=1-Math.exp(-dt*(cam?.follow??4));game.camX+=(now.x+game.vx*lead-game.camX)*cf;game.camY+=(now.y+game.vy*lead-game.camY)*cf;`
  - `vx`/`vy` are screen px/s (max 22 walking, 78 flying with broom 2), so `lead≈.3` gives ~23 px of lead.
- Shake: at 974 (before the ground blit) add `const sh=window.MM?.camera?.offset?.()||{x:0,y:0};ctx.save();ctx.translate(Math.round(sh.x),Math.round(sh.y));`, and `ctx.restore();` after 1009, before the overlay hook. Integer translate keeps pixels crisp.
- Leave the pointer mapping (1069) unshaken.
- Zero-patch alternative **[V]**: wrap `draw` and offset `game.camX/camY` temporarily, restoring them in `finally`.

**S7. Settings-aware particles (P2).** In `addParticles` (247–254):
```js
 const q=window.MM?.settings?.get?.('particles')??1;   // 0 = off/reduced motion … 1 = full
 count=Math.round(count*q);
 /* loop unchanged */
 const cap=Math.round(220*q);if(particles.length>cap)particles.splice(0,particles.length-cap);
 if(q>0){bursts.push({...});if(bursts.length>20)bursts.shift();}
```
- Optionally also raise the effect cap at 381/653, or resolve evicted effects instead of dropping their hits.

**S8. Versioned save (P1, needed by the menu's Continue/New).**
- 573–585: route through `MM.save` when present, otherwise fall back to the current key.
  - `saveWorld`: `const snap={...world,coop:false,targetId:null}; if(window.MM?.save){MM.save.write('world',snap);} else localStorage.setItem('moss-moon-adventure-v1',JSON.stringify(snap));`
  - `loadWorld`: `const value=window.MM?.save?MM.save.read('world'):JSON.parse(localStorage.getItem('moss-moon-adventure-v1')||'null');` Keep the existing sanitising.
- Suggested envelope: `{v:2, savedAt, slot, world, player:{x,y,mounted,spellIndex}, look:chosenLook}`. Migration from v1 = the raw world object under the `-v1` key.
- Also validate `mode`/`floor`/`equipped`/gear (§7).
- 463: autosave interval → `(window.MM?.settings?.get?.('autosaveSec')??8)`.
- Because `loadWorld` runs during baseline evaluation (604), **`MM.save` must be defined in a script loaded before baseline.js.** It cannot be wrapped afterwards.
- Add a `newAdventure()` next to `resetPlayer` for the menu (all of it can also be done from outside, since `world` and `game` are `let`):
  ```js
  function newAdventure(cls='grove'){world=newWorld();world.cls=cls;enemies=[];lootDrops=[];allies=[];party=[];dungeonBlocks=[];game=freshGame();const p=project(game.x,game.y);game.camX=p.x;game.camY=p.y;familiarSprite.x=game.x+.55;familiarSprite.y=game.y-.55;resetTraining();const s=SPELLS.findIndex(x=>x.id===currentWizard().starter);if(s>=0)chooseSpell(s);drawGround();refreshAdventureUI();mmEmit('state',{newGame:true});}
  ```
- "Continue" = `loadWorld()` followed by the restore block at 625–628.

### 10.1 Zero-patch integration recipe (works today, verified mechanisms)
Load a bridge script **after** baseline.js, or run the code from MM on `DOMContentLoaded`, which fires after parser-inserted classic scripts.
```js
(function(){ const _u=update, _d=draw;
  update=function(dt){ if(MM.isPaused?.()) return 0; MM.hooks?.preUpdate?.(dt); const r=_u(dt); MM.hooks?.postUpdate?.(dt); return r; };
  draw=function(){ const sx=game.camX, sy=game.camY, o=MM.camera?.offset?.()||{x:0,y:0}; game.camX-=o.x; game.camY-=o.y;
    try{ _d(); } finally { game.camX=sx; game.camY=sy; } MM.hooks?.overlay?.(ctx); };
  window.addEventListener('keydown', e=>{ if(MM.isPaused?.()) e.stopPropagation(); }, true);
  window.addEventListener('pointerdown', e=>{ if(MM.isPaused?.()&&e.target===canvas) e.stopPropagation(); }, true);
})();
```
Event wrappers follow the same pattern:
- `castSpell` returns true on success → `cast`.
- `hitEntity`: compare `hp` and `dead` before and after → `hit`, `kill`, `boss`.
- `tendPlot`: diff the plot state → `plant`, `water`, `harvest`.
- `pickup` → `pickup`.
- `awardXP`: compare levels → `levelup`.
- `goRegion`, `enterDungeon`, `advanceFloor`, `turnInQuest`, `resetPlayer`.

Limits of wrapping:
1. References captured as *values* before the wrap don't see it. That covers legacy-button entries such as `buildWard:buildFarmWard`, `brewPotion:brew`, `finishQuest:turnInQuest`, `nextFloor:advanceFloor` (616–620), and the listeners at 1054 and 1073–1077. Entries written as arrows that call by name (`farmAction:()=>tendPlot()`, `travelRegion`, `enterDungeon`, `p2Cast`…) and all keyboard/canvas handlers *do* go through wrappers.
2. `loadWorld` and `initializeExpansion` have already run by then.
3. Inline events (player hurt, raid, day change, death through the boss pulse) can only be detected by diffing `world.hp`, `world.day` and `enemies` in `postUpdate`.
4. A custom depth-sorted entity needs the `props.push` + `drawProp` trick (outside only, unless its type is `lamp` or `rock`).

---

## 11. Verification log
Probe scripts (scratchpad, not committed) were run with Playwright and Chromium against `index.html` and synthetic pages.
- `node tests/smoke.js index.html` → `stateKeys 24, errors []`.
- Binding probe: function declarations sit on `window` (writable, non-configurable); `let`/`const` don't but resolve by name; `world` can be reassigned from outside.
- Wrapping `update` gave ~49 calls in 500 ms. A pause wrapper froze `game.elapsed`. Wrapping `drawProp` gave ~300 calls in 300 ms. A `hitEntity` wrapper caught a dummy hit.
- A capture-phase `stopPropagation` on `window` blocked keydown (`keys` stayed empty) and canvas pointerdown (`game.target` stayed null). Both worked normally once removed.
- Offsetting `game.camX/Y` inside a `draw` wrapper shifted the frame.
- Raid timing (§9 #2). Save key and fields (§7). `draw()` ≈ 0.348 ms.
- Removing `#worldHud` at runtime → `Cannot set properties of null (setting 'textContent')` and the loop stopped.
- Bare page with only the canvas → `Cannot set properties of null (setting 'innerHTML')`, then `game is not defined` (TDZ).
- The same bare page plus the legacy shim → no errors, loop running, scene rendered correctly.
- Dungeon flow: crypt → dungeon floor 1 (4 enemies, 13 blocks) → floor 3 boss "Bone Regent" (262 HP at level 1) → kill → `riftUnlocked=true` → rift (Radiant).
- `shock` gets applied but has no effect. P2 cast drains P1 mana. Particle and burst caps 220/20.
- **Not verified [?]:** gamepad behaviour (no device), touch pad on a real touch screen, `ctx.filter` on Safari, long-session save/load round-trip in a real browser profile.
