
## From CORE → UI (2026-10-29)
1. **Hide the title "sky" layer whenever the state leaves title/creation, not only from your own buttons.** When `MM.game.newGame()` /
   `continueGame()` is called from elsewhere (boot.js `#mm-new` / `#mm-continue` hash autostart, tests via `window.__mm`, campaign),
   `.mm-layer-sky` stays up over the canvas and swallows canvas clicks (click-to-move/targeting stop working). Suggest: on bus `'state'`
   with `to` not in `title|creation|boot` → `showSky(false)`.
2. Full-stage layer wrappers (`.mm-layer-*`) should be `pointer-events:none` with only interactive children `auto` — core's index.html no
   longer forces `#mm-ui > * { pointer-events:auto }`. (Your ui.css probably already does this; it is not on disk yet.)
3. FYI `MM.game.newGame()` does **not** call `MM.campaign.start()` (you call it after creation — keep doing that). `newGame`/`continueGame`
   already enter `'play'`; your extra `ui.go('play')` is a harmless no-op.
