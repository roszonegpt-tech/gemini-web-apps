# Moss Moon — Phase 2 Contract (core / campaign / UI / world visuals / fx)

Read first: `notes/ARCHITECTURE.md` (rules) and `notes/BASELINE_AUDIT.md` (how the baseline works; sections 2.3 and 10 matter most).
Phase-1 modules already exist or are landing: `MM.audio`, `MM.art`, `MM.cine` (see ARCHITECTURE contracts; check `notes/handoff/*.md` for what was actually built).

## Design decisions (fixed — do not re-litigate)
- Title: **Moss & Moon** (display "MOSS & MOON"; save/namespace "moss-moon"). Premise: a young witch restores Moonflower Grove after the Moonwell loses its light.
- Campaign (compact): **Ch0 Arrival** (tutorial: plant, water, harvest, brew first potion) → **Ch1 Blighted Forest** (dungeon 3 floors, boss *Bramble Warden*, Lunar Fragment I) → **Ch2 Whispering Swamp** (boss *Mire Heart*, Fragment II) → **Ch3 Frostpeak** (boss *Frost Wyrm Husk*, Fragment III; `final_fragment` cinematic) → **Ch4 Moonwell** (final encounter *The Hollow Moon* at the Moonwell, then `ending` cinematic) → **post-game free play** (Old Crypt rift/dungeons from the baseline stay as optional endgame).
- Hubs: **Homestead** (region `grove`, restoration level 0–4 changes visuals) and a small **Village** hub (new region id `village`: shop stall, 3 named villagers with requests, brewing/notice board, travel board).
- Villagers: **Elder Marrow** (Moonwell keeper's old friend, story), **Pip the Fletcher/Peddler** (shop), **Wren** (herbalist, requests/recipes). Keepsake: silver moon charm from the witch's grandmother (the Moonwell keeper).
- Signature spells (map onto baseline `SPELLS` ids or add new ones; they must differ mechanically): **Moonbolt** (fast single-target crescent, low cost, small lunar bonus at night), **Ember Bloom** (area burst, burning DoT), **Thornbind** (ground roots: snare/root zone, DoT, blocks melee), **Frostbell** (chill + slow aura pulse, shatter combo), **Starfall** (telegraphed delayed AoE strike, high damage, long cooldown, unlocked by Fragment I). Wizard path selection from the baseline is replaced by: the player is always the witch with these 5 (others remain accessible post-game or hidden).
- Crops (≥6): wheat, ember pepper, frost berry, moonflower (baseline) + **glowcap** (swamp-themed mushroom) + **starmint** (night herb). Each feeds potions/bombs/shop/requests.
- Failure: defeat → "Moonlit Recovery" screen; you wake at the homestead, lose 15% gold (min 0, max 25g) and nothing else; story items are never lost; seeds can always be bought cheaply / a free basic seed pack replenishes daily from a seed barrel.

## MM core API (owner: CORE agent; others code against it NOW with `window.MM?.` guards, test when src/core/mm.js exists)
```
MM.version = '0.2.0'
MM.bus.on(name, fn) -> off fn ; MM.bus.off ; MM.bus.emit(name, data)   // listener errors are caught+logged, never break the loop
MM.settings.get(key) / set(key,val) / all() / reset() / onChange(fn)    // persisted (localStorage 'moss-moon-settings-v1', try/catch); emits 'settings'
   keys & defaults: quality:'medium'('low'|'medium'|'high'|'custom'), softFilter:'low'('off'|'low'|'medium'), bloom:'low'('off'|'low'|'high'),
   particles:'medium'('low'|'medium'|'high'), shake:'low'('off'|'low'|'full'), reducedFlashes:false, reducedMotion:false, subtitles:true,
   damageNumbers:true, volMaster:.8, volMusic:.6, volSfx:.8, volCine:.8, autosave:true, touchControls:'auto', textScale:1
   MM.settings.particleScale() -> .35|.7|1 (0 if reducedMotion→.35)   MM.settings.shakeScale() -> 0|.35|1 (0 if reducedMotion)
MM.state.go(name, data) ; MM.state.current ; MM.state.prev ; MM.state.is(name)        // states: boot,title,creation,play,menu,dialogue,cine,defeat,ending,loading
   MM.isPaused() === (MM.state.current !== 'play')  — baseline update/input are gated by it. Entering any non-play state calls clearControls() and cancels click-to-move.
   MM.state emits bus 'state' {from,to,data}. 'ending' state returns to 'play' via MM.state.go('play') (free play continues).
MM.hooks.on(name, fn, priority=0) / off ; dispatchers called by patched baseline: preUpdate(dt) postUpdate(dt) preDraw(ctx) drawGround(ctx) drawables(list, project) light(ctx)->true if handled
   postEffects(ctx) overlay(ctx) postDraw()   (see audit §10 S3; 'drawables' lets modules push {type:'custom',x,y,depth?,draw(ctx,pos)} into the depth-sorted list)
MM.camera.shake(amountPx, durSec) (scaled by settings.shakeScale) ; MM.camera.offset() -> {x,y} ; MM.camera.lookAhead (default .3) ; MM.camera.follow (default 4)
   MM.camera.focus({x,y,zoomHint?,hold?}|null)  — gameplay-camera framing target (tile coords) for bosses/discoveries; null returns to following the player smoothly.
MM.save: MM.save.available (bool) ; registerSection(name,{get():obj, set(obj), reset()}) ; save(opts:{silent,reason}) -> bool ; load() -> {ok, reason?} ; hasSave() ; summary() -> {name,level,day,chapter,savedAt}|null ;
   erase() ; exportJSON()/importJSON(str) ; envelope {v:2, savedAt, sections:{world,player,look,campaign,memories,…}} ; migrates v1 key 'moss-moon-adventure-v1' ; corrupt/missing → safe defaults + bus 'save:error';
   emits 'save' {silent,ok} so UI shows a save indicator ; in-memory fallback with MM.save.available=false when storage throws. Never save while MM.state is cine/loading/defeat, or while any enemy is aggro'd within 3 tiles (unless forced).
MM.game: newGame({name,look}) ; continueGame() ; toTitle() ; saveNow() ; safeToSave() ; MM.game.name (player name) ; MM.game.respawnHome() ; MM.game.flags (volatile)
   MM.game exposes helpers: MM.game.world() -> baseline `world`; MM.game.player() -> baseline `game`.
MM.input.block(on) (extra gate), MM.input.pressed(action) abstraction optional.
```
Input/pause: baseline keyboard/pointer handlers are patched (audit S2) to ignore events while `MM.isPaused()`. DOM UI keyboard navigation is the UI agent's job.

## Page shell (owner: CORE)
`index.html`: `<div id="mm-app"><div id="mm-stage"><canvas id="scene" width="512" height="320"></canvas><div id="mm-fx"></div><div id="mm-ui"></div></div></div>` — stage keeps 8:5, scales to fit the window (integer scale when ≥2× fits, else fractional), letterboxed on a dark moss background; UI overlay `#mm-ui` fills the stage (position:absolute; inset:0) and is where all DOM menus/HUD live (z-index ≥ 100); cinematics canvas sits at z-index 50. A hidden `#mm-legacy-ui` provides the baseline's 59 DOM ids (audit §8). Touch: pointer events on canvas map through `getBoundingClientRect` (baseline already does); mobile layout keeps the stage large with an on-screen pad provided by the UI agent.

## Campaign API (owner: CAMPAIGN agent) — `MM.campaign`
```
MM.campaign.state  // serializable, registered as save section 'campaign':
  { chapter:0..4|5(postgame), flags:{}, fragments:['forest','swamp','mountain'] subset, restored:{forest,swamp,mountain}, bosses:{id:true}, requests:{id:{state:'offered|active|done',progress}},
    relations:{marrow,pip,wren: 0..5}, homestead:{level:0..4}, moonwell:{level:0..3}, memories:[sceneIds], rewarded:{rewardKey:true}, tutorial:{step}, endingSeen:bool, stats:{…} }
MM.campaign.objective() -> {title, why, hint, target?:{region,x,y}}   // always something; HUD + journal use it
MM.campaign.grantOnce(rewardKey, fn) -> bool   // runs fn at most once EVER (persisted in state.rewarded); used for cinematic rewards so skip == watch
MM.campaign.start()                // after character creation: plays 'intro' cine → arrival tutorial
MM.campaign.quests() -> [{id,title,desc,giver,status,progress:{have,need,label},reward:'text'}]
MM.campaign.recipes() -> [{id,name,desc,ingredients:{itemId:n},makes,icon,unlocked}] ; MM.campaign.craft(id) -> {ok,msg}
MM.campaign.shop(npcId) -> {name, stock:[{id,name,desc,icon,price,kind,stockLeft?}], sell:{itemId:price}} ; buy(id,qty) / sell(id,qty) -> {ok,msg}
MM.campaign.upgrades() -> [{id,name,desc,level,max,cost:{gold,items},apply}] ; MM.campaign.buyUpgrade(id)    // homestead, broom, equipment, spells
MM.campaign.travel -> MM.campaign.regions() -> [{id,name,desc,level,locked,reason,boss,restored,recommended}] ; MM.campaign.travelTo(id) -> {ok,msg}   // handles loading transition via MM.state 'loading'
MM.campaign.dialogue(npcId) -> {speaker,portrait?,pages:[{text,choices?:[{label,action}]}]}  // UI renders it; actions are string ids resolved by MM.campaign.choose(npcId, action)
MM.campaign.inventory() -> {groups:[{name,items:[{id,name,count,icon,desc,sellPrice?,usable?}]}]}, MM.campaign.useItem(id)
MM.campaign.equipment() -> {slots:[…], owned:[…]}, equip(id) ; MM.campaign.spells() -> [{id,name,desc,icon,unlocked,key,cost,cooldown,school}], selectSpell(id)
MM.campaign.map() -> {regions:[…], player:{region,x,y}}
Events the campaign emits (bus): 'objective', 'quest', 'fragment', 'restored' {region}, 'chapter', 'story:cine' {id}, 'toast' {text,kind}, 'defeat' {…}, 'ending'
```
Cinematics are triggered **by the campaign** via `MM.cine.play(id)` wrapped in `MM.state.go('cine')` … back to `'play'`; rewards through `grantOnce`. Cine scene ids: `intro first_restoration boss_forest_intro boss_swamp_intro boss_frost_intro final_fragment ending defeat_recover`.

## UI contract (owner: UI agent)
Everything under `src/ui/*.js` + `assets/css/ui.css`. Exposes `MM.ui`: `MM.ui.toast(text,kind)`, `MM.ui.confirm({title,body,yes,no}) -> Promise<bool>`, `MM.ui.dialogue(script) -> Promise`, `MM.ui.open(screenId)`, `MM.ui.close()`, screens: title, creation, hud, pause, inventory, equipment, spellbook, crafting, journal, map, settings, controls, credits, travel, shop, dialogue, dungeonSummary, defeat, campaignComplete, loading, memories, saveSlots(optional). UI drives `MM.state` transitions (title→creation→play etc.), calls `MM.game.newGame/continueGame/saveNow`, reads data via `MM.campaign.*` (fall back to reading baseline `world` directly when a campaign function is missing). Keyboard navigation (arrows/WASD/Enter/Esc/Tab), visible focus rings, gamepad optional, pointer + touch support, `prefers-reduced-motion`, text scale setting. No decorative dead controls.

## World visuals contract (owner: WORLD agent) — `src/systems/world-render.js`, `src/config/regions-visual.js`
Region-specific ground (wrap `drawGround`, use `MM.art.tile/draw` when available else improved procedural), prop sets per region (mutate `props` const array contents or draw via 'drawables'), homestead restoration levels 0–4 (cottage sprite state, overgrowth → lush, lit windows, Moonwell state, fences, garden), village hub layout (stall, 3 houses, board, NPC drawing: Marrow/Pip/Wren), contact shadows, obstruction fading, foreground foliage layer, animated water/lanterns/smoke, region transition wipes. Exposes `MM.world.setRestoration(level)`, `MM.world.layout(regionId)` (props + NPC positions + interaction points: `{id,x,y,r,prompt,action}`), `MM.world.interactables()`, `MM.world.nearestInteractable(x,y)`; the UI shows `prompt`; pressing E triggers `action` via `MM.world.interact()` (campaign supplies actions via `MM.world.register(id, handler)`).

## FX / lighting / filter contract (owner: FX agent) — `src/systems/fx.js`, `lighting.js`, `filter.js`
Day/dusk/night/weather palettes and light pools (windows, lanterns, Moonwell, glow plants) replacing `drawWeatherAndLight` through the `light` hook; soft filter + bloom + vignette + haze + grain applied to the scene canvas via an offscreen pass in `postDraw`/overlay (UI stays sharp because it is DOM); signature spell VFX for Moonbolt/Ember Bloom/Thornbind/Frostbell/Starfall (anticipation, shape, impact, aftermath) via wrapping `drawEffect`/`impact`; enemy telegraphs / danger zones; hit flashes; damage numbers moved to optional DOM or crisp canvas per settings; farming FX (plant/water/harvest), broom dust/trail, ambient fireflies/leaves/rain splashes, region restoration wave; pooled particles with caps from `MM.settings.particleScale()`; reduced flashes / reduced motion honored everywhere. Exposes `MM.fx.burst(kind,x,y,opts)`, `MM.fx.telegraph({shape,x,y,r|w,h,dir,dur,onEnd})`, `MM.fx.restorationWave(region)`, `MM.fx.flash(color,ms)` (respects reducedFlashes), `MM.lighting.setPalette(name)`, `MM.lighting.addLight({x,y,r,color,flicker})`.

## Rules for modifying shared/baseline behavior
Only CORE edits `src/core/baseline.js` and `index.html`. Others integrate by: IIFE-wrapped modules, wrapping baseline functions at load (`update`, `draw`, `drawProp`, `drawEffect`, `makeEnemy`, `hitEntity`, …), mutating exported tables (`SPELLS`, `SEED_TYPES`, `REGIONS`, `WIZARDS`, `props`), listening to `MM.bus` events and using `MM.hooks`. Anything that cannot be done that way → append to `notes/REQUESTS.md` (section per agent: the exact change + why). Module file names are fixed (below) so CORE can list them in `index.html` load order now.

## File ownership (phase 2) and fixed script load order
```
assets/js/atlas-data.js, cast-data.js, art-data.js
src/core/legacy-shim.js        CORE
src/core/mm.js                 CORE   (bus, settings, state, hooks, camera, save, game)
src/systems/audio.js           (audio agent, phase 1)
src/systems/art.js             (art agent, phase 1)
src/config/cinematics.js, src/systems/cinematics.js   (cinematics agent, phase 1)
src/config/campaign.js         CAMPAIGN (data: regions, quests, recipes, shop, upgrades, dialogue)
src/config/regions-visual.js   WORLD
src/core/baseline.js           CORE (patched with seams)
src/entities/bosses.js         CAMPAIGN (boss AI/attacks/phases, enemy archetypes)
src/systems/campaign.js        CAMPAIGN
src/systems/world-render.js    WORLD
src/systems/lighting.js, fx.js, filter.js   FX
src/ui/ui-core.js, ui-screens-*.js, ui-hud.js   UI        (UI may split into several files; list them in src/ui/MANIFEST.txt, CORE's index.html loads them via that order — UI agent edits MANIFEST.txt, and CORE writes tools/build.js + a dev loader that reads it. Simplest: UI agent uses exactly these names: ui-core.js, ui-hud.js, ui-menus.js, ui-screens.js, ui-input.js)
src/core/boot.js               CORE   (wires everything, starts title)
assets/css/ui.css              UI
```
Everything loads after baseline.js except the files above `baseline.js` in this list (those must not touch baseline globals at load time).
