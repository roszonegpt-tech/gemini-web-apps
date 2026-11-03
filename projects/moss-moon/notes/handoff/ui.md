# UI handoff — Moss & Moon (phase 3)

Owner files: `src/ui/ui-core.js, ui-hud.js, ui-menus.js, ui-screens.js, ui-joystick.js, ui-input.js` (order in `src/ui/MANIFEST.txt`;
ui-input runs init), `assets/css/ui.css`, `tests/ui-test.js`, this note. Title/logo/intro belong to SCREENS (`MM.flow`).

## API (`MM.ui`)
`toast(text,kind,{icon,ms,force})` · `confirm({title,body,yes,no,danger,icon}) → Promise<bool>` · `alert(opts)` · `dialogue(script) → Promise<action>`
(script `{npc, speaker, portrait?, pages:[{text, choices?:[{label,action}]}]}`; choices go to `MM.campaign.choose(npc, action)` → `next` / `open` / `msg`) ·
`talk(npc)` · `open(id,args)` / `replace` / `close(id?)` / `closeAll` / `back` / `isOpen(id?)` / `top()` / `registerScreen(id, factory)` / `focusFirst(el?)` ·
`openSettings/openControls/openCredits/openMemories` · `openPause()` / `resume()` / `toTitle()` · `ready` (bool) + `onReady(fn)` · `tick(fn)` (shared per-frame,
driven by `MM.loop.onTick`; no own rAF) · `glyph(action)` / `method()` · `joystick` (`enabled() apply() release() active out`) · `input.action(name)`.
Screens: creation, pause, inventory, equipment, spellbook, crafting, journal, map, travel, shop, settings, controls, credits, memories, dialogue,
dungeonSummary (bus `dungeon:complete`), defeat (state `defeat`, text from `MM.campaign.lastDefeat()`), campaignComplete (state `ending`), confirm, loading card (state `loading`).
Factory returns `{el, state?, label?, onOpen, onClose, onKey(e)→bool, back()→bool, refresh}`; `ui.panel({title,subtitle,icon,foot})` gives the gold-filigree frame.

## Behaviour
- State sync: screens with `state` set it (pause/shop → `menu`, dialogue → `dialogue`, creation, defeat, ending). Panels over front-end states
  (logo/intro/title/creation) never switch to `menu`; closing the last panel returns to the last gameplay state (`play|interior|tutorial`).
- HUD (vitals, objective, time chip, region banner, boss bar, hotbar w/ cooldown rings from `MM.campaign.status().cooldowns`, potion, prompt from
  `MM.world.currentPrompt()` / interiors, message line, save indicator) shows only when the state simulates (`sim !== 'none'`) and no panel is open.
  Gameplay toasts/messages are dropped (and flushed) in boot/logo/intro/title/creation.
- Keyboard: a capture listener owns keys while a panel is open (stopPropagation → no leakage); spatial arrows/WASD, Enter/Space, Esc back, Tab trap,
  Q/E tab cycling. Gameplay hotkeys Esc/P pause, I/K/J/M. Gamepad (Standard): menus d-pad/A/B/Start/LB/RB; play buttons A cast, X interact, Y broom,
  B potion, LB/RB spells, Start pause (CORE owns the left stick → axis).
- Touch: `ui-joystick.js` analog stick (floating/fixed, size/side/haptics settings, pointer capture, 0.14 deadzone, drag-follow, smooth return,
  releases on cancel/blur/hidden/state/panel) → `MM.input.setAxis(x,y,'touch')`; action cluster Cast/Use/Broom/Potion/Swap/Pause mirrored by
  `joystickSide`; touch compat clicks cancelled. No d-pad anywhere. Use = `MM.interiors.interact()` indoors, else `MM.world.interact()` / `tend`.

## Tests (run 2026-11-02, Chromium/Playwright)
`node tests/ui-test.js` → 58/58 pass: API, single rAF (`MM.loop.stats().rafs===1`), title panels keep state + toast suppression, creation (preview,
look, name validation, back-confirm), HUD, Esc pause freezes `game.elapsed`, no key leakage, keyboard open/close of every pause submenu, Tab trap,
focus ring, live text scale + persistence across reload, resume restores sim/keys, NPC dialogue → `choose` → shop, defeat/ending flows, touch at
390×844 and 844×390 (joystick drag moves the player, 2nd finger on Cast keeps the stick, release recentres, ≥44 px buttons, touch Pause), 0 console errors.
Screenshots: `tests/out/ui-*.png` (desktop/phone/landscape for every screen).

## Known issues / requests
- **`#mm-stage { contain: layout paint }` (CORE, index.html) still confines every UI layer to the stage**, so on a 390×844 phone menus, creation and the
  joystick live in a 390×244 box (scrollable, compact `.mm-short` layout) while the rest of the screen is black. Removing `contain` makes the
  fixed layers use the full viewport (UI detects it via `.mm-viewport`; portrait HUD bands are already written). Filed in notes/REQUESTS.md.
- Damage numbers stay with FX/baseline (no DOM layer). Item icons: crop sprites via `MM.art` when available, else inline SVG glyphs.
