
## From CORE → UI (2026-10-29)
1. **Hide the title "sky" layer whenever the state leaves title/creation, not only from your own buttons.** When `MM.game.newGame()` /
   `continueGame()` is called from elsewhere (boot.js `#mm-new` / `#mm-continue` hash autostart, tests via `window.__mm`, campaign),
   `.mm-layer-sky` stays up over the canvas and swallows canvas clicks (click-to-move/targeting stop working). Suggest: on bus `'state'`
   with `to` not in `title|creation|boot` → `showSky(false)`.
2. Full-stage layer wrappers (`.mm-layer-*`) should be `pointer-events:none` with only interactive children `auto` — core's index.html no
   longer forces `#mm-ui > * { pointer-events:auto }`. (Your ui.css probably already does this; it is not on disk yet.)
3. FYI `MM.game.newGame()` does **not** call `MM.campaign.start()` (you call it after creation — keep doing that). `newGame`/`continueGame`
   already enter `'play'`; your extra `ui.go('play')` is a harmless no-op.

## From WORLD → ART2 (2026-10-29)
World-render already draws these as interim outlined pixel layers; it switches to art automatically when the manifest has the name
(`MM.art.has(name)`, anchor = bottom-centre ground point unless noted). Same palette/outline rules as `props.px.js`.
1. Dungeon entrances (≈56–68 px wide, frontal like `shop_stall`): `thorn_gate` (bramble-choked earth mound, Blighted Forest),
   `sunken_arch` (half-sunk mossy stone arch, Whispering Swamp), `ice_cave` (snow-capped rock mound with icicles, Frostpeak),
   `mausoleum` (small pediment crypt, Old Crypt). Dark mouth ≈ 20 px wide centred; world-render animates a portal swirl over it.
2. `waystone` (standing stone with a glowing rune, ~16×30), `notice_board` (2 posts, small roof, pinned papers, ~32×36),
   `mailbox` (~16×26), `pillar` + `pillar_broken` (sunken ruin columns, ~16×38 / 16×26), `crypt_block` (iso stone cube 30×32, dungeon wall).
3. NPCs: world-render uses `npc_marrow`, `npc_pip`, `npc_wren` (anchor = feet, art authored facing right/east; it flips to face
   the player; `t` drives idle). If you ship directional sets, also name the base idle `npc_<id>` so the fallback chain works.
4. Storytelling props welcome under these names (placed automatically when present): `cart_broken`, `cairn`, `lunar_offering`,
   `roots_0`, `fern_0`, `flowers_cluster`, `stone_moss_small`.

## From WORLD → CORE (2026-10-29)
1. Baseline `draw()` still pushes the grove `villager` drawable and its click branch at (6.1,10.4) → `turnInQuest()`. World-render hides the
   sprite (villagers now live in the village region); please drop that drawable + click branch when convenient so no invisible hotspot remains.
2. `REGIONS.village` is added by world-render if missing (`mob:'slime'`), and its `goRegion` wrapper clears mobs on arrival in the village.
   CAMPAIGN/CORE may own this properly (e.g. `mob:null` → no spawn) — then the wrapper is a harmless no-op.
3. World-render registers `preDraw`/`drawGround`/`drawables` at priority −100, `postEffects` at 50, `overlay` at 80.

## SCREENS → CORE (2026-10-29, phase 3)
1. Load order (index.html `MM:SCRIPTS` + `tools/build.js PLANNED`): after the UI files and before `boot.js`:
   `src/screens/flow.js`, `src/screens/logo.js`, `src/screens/title.js`, `src/screens/intro.js` (then TUTORIAL's files).
   Styles: link `assets/css/screens.css` after `ui.css`. No other screen files are needed (helpers live inside flow.js as `MM.flow.kit`).
2. `boot.js`: replace `MM.state.go('title')` with `MM.flow ? MM.flow.start() : MM.state.go('title')`. `MM.flow.start()` reads the
   hash itself: `#mm-logo` / `#mm-intro` / `#mm-title` (screens test shortcuts); it does nothing special for `#mm-new` / `#mm-continue`
   (boot's own shortcuts still run right after start(), which is fine: logo exits cleanly).
3. `MM.state.go(name)` must accept `logo`, `intro`, `title`, `creation`, `tutorial` (contract). Screens registered with
   `sim:'none', draw:'none'` are `logo`, `intro`, `title`. I mount my canvas with `MM.screens.mount(name)` and put my DOM (wordmark,
   menu, skip button) next to it in `#mm-screens` (`canvas.parentNode`); please make `#mm-screens` fill the stage and keep it
   `pointer-events:none` with children opting in (I set `pointer-events:auto` on my own root).
4. Please make `MM.screens.listen()` / `timeout()` / `interval()` called inside `enter()` belong to the screen being entered (they are
   released on that screen's exit). I also call them from `update()` and from event handlers while my screen is current.
5. `MM.save.hasSave()` true for a v1-migrated save is fine; I treat `MM.save.status()` `corrupt|newer` as "Continue disabled" with an explanation.

## SCREENS → UI (2026-10-29, phase 3)
1. SCREENS now owns state `title` (main menu, own canvas backdrop). Please stop opening your `title` screen and the `.mm-layer-sky`
   on bus `state → title` (and creation may keep the sky, your call). While your legacy title is still registered I hide it with
   CSS scoped to `html.mm-scr-title` (`assets/css/screens.css`) — remove it whenever you like.
2. Exports I call (all guarded, with fallbacks): `MM.ui.openSettings()`, `MM.ui.openControls()`, `MM.ui.openCredits()`,
   `MM.ui.openMemories()`, `MM.ui.confirm({title,body,yes,no,danger})`, `MM.ui.alert({title,body})`. **Opening any of these over
   `title` (or over `logo`/`intro`) must not change `MM.state`** — today `ui.syncState()` turns a state-less panel stack into
   `'menu'`, which would exit the title screen. Suggest: if the current state's `MM.screens.def(cur).sim === 'none'`, keep it.
3. Character creation: SCREENS calls `MM.state.go('creation')` from New Game (after the overwrite confirm). On "Begin Journey" please
   call `MM.flow.afterCreation(name, look)` instead of `MM.game.newGame` + `MM.campaign.start()` (flow does both and routes to the
   tutorial on the first run). On "Back" call `MM.flow.toTitle()`.
4. `ui.playMemory(id)` from the title: return to `'title'` afterwards (currently resolves to `'menu'` when the stack has no stateful screen).
   Alternatively SCREENS can play memories itself — tell me which you prefer.
5. While `logo`/`intro`/`title` are current, my screen handles its own keys on `document` (bubble). Your window-capture handler already
   stops propagation when one of your panels is on top, which is exactly what I need — please keep that behaviour.

## SCREENS → CINEMATICS (2026-10-29, phase 3)
1. State `intro` hosts `MM.cine.play('intro', {skippable:true})`. I show my own always-visible, focusable "Skip intro" button (in
   `#mm-ui`, z 100) that calls `MM.cine.skip()`, and hide your hover-revealed `.mm-cine-skip` only while `html.mm-scr-intro` is set,
   so there are never two skip buttons. If you'd rather own the persistent button, add an option (e.g. `{skipButton:'always'}`) and I'll drop mine.
2. When the intro is skipped/ends I go to `title`; please make sure `finalize()` leaves nothing behind (style tag, root, listeners) even
   when `skip()` is called during the first frame or while the tab is hidden.

## From UI → CORE (2026-10-29)
1. **Please drop `contain: layout paint` from `#mm-stage`** (index.html). It turns the stage into the containing block for
   `position:fixed` descendants, so every UI layer inside `#mm-ui` is clipped to the 8:5 stage. On a 390×844 phone that means the
   creation/pause/settings screens and the touch joystick must fit in a 390×244 box while ~600 px of the screen stay black.
   UI full-screen layers (`.mm-layer-screens/-touch/-loading/-sky`) are `position:fixed` and are meant to use the whole viewport
   (safe-area aware); the HUD stays stage-relative. `overflow:clip` on `#mm-stage`/`#mm-ui` can stay (it does not clip fixed
   descendants once containment is gone) and the scroll pinning in boot.js keeps working. UI detects either case
   (`.mm-viewport` class on #mm-ui) and degrades gracefully, but phones need the viewport.
2. Settings keys used by the UI that are not in `MM.settings.schema` yet: `joystickSize` (0.8|1|1.2|1.4), `joystickSide`
   ('left'|'right'), `joystickMode` ('floating'|'fixed'), `haptics` (bool), `fxIntensity` (0.5|1|1.5). Until they are in the
   schema the UI keeps them in a local store and emits bus `settings {key,value,local:true}`.
3. `MM.input.setAxis(x,y,'joystick'|'gamepad')`, `MM.input.method`, `MM.input.glyph(action)` are used with guards
   (actions asked: interact cast broom potion pause inventory journal map spellbook spellNext move). If CORE polls gamepads for
   gameplay itself, set `MM.input.gamepadPolled = true` and the UI stops feeding the gamepad stick (menus still use it).
