# Moss & Moon — Cinematics

Files: `src/systems/cinematics.js` (player + procedural engine scenes, `MM.cine`), `src/config/cinematics.js`
(`MM.CINE_MANIFEST`, data only), `assets/video/README.md` (video drop-in), `tests/cine-demo.html`, `tests/cine-test.js`.
Load order does not matter: the manifest is read lazily at `play()` time.

## Scenes

| id | length | playback today | video-capable | music | trigger |
|---|---|---|---|---|---|
| `intro` | 42 s | engine | yes (`auto`) | cine_intro → cine_sorrow → cine_intro | new game, before control at the homestead |
| `first_restoration` | 10 s | engine | yes | cine_triumph | first fragment placed in the Moonwell |
| `boss_forest_intro` | 8.5 s | engine | yes | cine_sorrow | Bramble Warden arena |
| `boss_swamp_intro` | 8.5 s | engine | yes | cine_sorrow | Mire Heart arena |
| `boss_frost_intro` | 8.5 s | engine | yes | cine_sorrow | Frost Wyrm Husk arena |
| `final_fragment` | 11 s | engine | yes | cine_triumph | last fragment collected |
| `ending` | 46 s | engine | yes | ending | all fragments returned (final restoration) |
| `defeat_recover` | 6.5 s | engine | yes | cine_sorrow | optional: knocked out, wake at home |

All shipped entries use `playback: 'auto'` with `video: {}`, so they play the engine scene. A scene becomes a video
scene as soon as a real file is listed (see `assets/video/README.md`).

Engine scene contents (all procedural canvas art at 512×320, chunky `fillRect` pixels; witch from `ATLAS_DATA`,
villagers/cat/raven from `CAST_PAGE_DATA`, with procedural fallbacks when those globals are missing):
- **intro**: (1) moonlit healthy grove: dithered sky, twinkling stars, moon glow, parallax hills/tree lines, mist, Moonwell
  beam, glowing moonbud crops, lit cottage, fireflies, pollen. (2) Close on the Moonwell: it flickers, then a flash, and
  7 fragments arc away with trails while the camera tilts up. (3) The homestead dims: crops wilt, brambles grow,
  windows go dark. (4) Three quick vignettes as the Blighted Forest, Whispering Swamp and Frostpeak turn corrupt
  (region captions). (5) The witch flies across a huge moon with a sparkle trail. (6) Close-up insert of
  grandmother's silver crescent charm and the seed case, with a sprout. (7) She lands at the overgrown homestead, walks
  in, and a window lights and the chimney smokes. (8) Title card **Moss & Moon** (DOM, Georgia).
- **first_restoration**: a fragment spirals into the well, a pulse ring spreads, the crops wake in a wave, a window
  lights, and the cat appears.
- **boss_*_intro**: the corrupt region backdrop, the witch from behind for scale, and a silhouette boss (procedural, with
  a separate rim-light layer). The eyes ignite at 3.1 s with a roar, shake and flash. The rim light reveals the shape,
  and the stolen fragment glows inside it. A pulsing tinted vignette, then a DOM nameplate.
- **final_fragment**: the Frostpeak summit under an aurora. The fragment hovers, the charm answers, and the fragment
  streaks home to a beam on the far horizon.
- **ending**: fragments gather and orbit the well, spiral in, and the Moonwell blazes (white flash). A restoration wave
  sweeps a three-region panorama (Whisperwood / Lilyreach / Shining Heights captions). The village lights up window by
  window, lantern posts light, and villagers walk up with lanterns. The witch stands at the bright well, then a close-up
  of the blazing charm. Closing card: "Moss & Moon · The Moonwell shines again · To be continued — keep playing ✦",
  over a dawn-tinted grove.
- **defeat_recover**: the charm glowing in the dark, then waking at the lit cottage with healing sparkles.

## API (`MM.cine`)
```
play(id, {onEnd, skippable=true, force=false, queue=true, engineOnly=false})
  → Promise<{id, skipped, completed, usedFallback, playback:'engine'|'video', rewardKey, prevMusic,
             reason?, fallbackReason?}>   // never rejects, never throws
skip() pause() resume() isPlaying() isPaused() current() → {id,t,duration,mode,paused,usedFallback,queued}
seek(t)                      // engine scenes; for tests/tools
setSubtitles(bool) getSubtitles() setReducedMotion(bool) getReducedMotion()
setVolume(0..1) / volume     // video volume (null → audio cine bus)
setTimeScale(n) getTimeScale()  // tests (also sets video playbackRate, clamped .25–16)
has(id) list() clearQueue() clearCache() scenes lastError videoTimeoutMs(=4000)
```
Result semantics:
- `completed: true` whenever the scene ran, whether watched or skipped. Callers grant rewards on `completed` with
  `MM.campaign.grantOnce(result.rewardKey, …)`, so skipping gives exactly what watching gives. The player never grants
  anything itself.
- `skipped: true` for the skip button, Esc, hold, a second Space/Enter, `skip()`, or being interrupted by `force`
  (`reason: 'interrupted'`).
- `completed: false` only for `reason: 'unknown-scene' | 'busy' | 'cleared' | 'no-scene'`.

Concurrency: `play()` while another scene plays is **queued** by default. `{queue:false}` resolves immediately with
`reason:'busy'`. `{force:true}` ends the current scene (it resolves `skipped:true, reason:'interrupted'`) and starts the
new one.

Input while playing: a capture-phase `keydown` on `window` stops propagation for unmodified keys, so the game never
sees them. `keyup` is not swallowed, so held keys never stick. Esc skips immediately. Space/Enter/click/mouse-move
reveal **Skip ▸**. Press again, click the button, or hold for 0.7 s (ring fills) to skip. It auto-hides after 2.6 s.
`skippable:false` disables all of this; `skip()` still works.

Events: `MM.bus.emit('cine:start', {id,title,playback,rewardKey})` and `('cine:end', result)`.
Audio (all guarded):
- `music(entry.music, {fade:.7})` at start, plus manifest `cues` (`{t, music|sfx}`) fired as time passes. Seeking or
  skipping past a cue never fires it.
- After an engine scene, the music that was playing before (`MM.audio.current().music`) is restored with fade 1.2,
  unless it was a cine track. The caller may override this right after.
- Video: `duck(.7, Infinity)` once playing, `duck(0, 0)` on cleanup.

Settings: at each `play()` the player reads `MM.settings.all()` (`subtitles`, `reducedMotion`, `reducedFlashes`,
`shake`: off|low|full) and subscribes once to the bus `'settings'` event (`{all, audio}`). Explicit `setSubtitles()` and
`setReducedMotion()` calls are not overridden by the read at play time; a later settings event does override them. The
OS `prefers-reduced-motion` setting is the initial default.

Reduced motion: shots use their `still` camera (or their last keyframe). No pans, zooms or shake, no star twinkle or
Moonwell flicker, cuts become dissolves, and flashes drop to 30%. The ending panorama becomes three static dissolving
region shots. `reducedFlashes` scales flashes too.

## Rendering & layering
- Root `<div class="mm-cine">` goes into `#mm-stage` (phase-2 index), else `.canvas-wrap`, else `document.body`
  (`position:fixed`). It has z-index **50**: above the game canvas, below DOM UI (≥100).
  `container-type:size` + a stage of `min(100cqw,160cqh) × min(100cqh,62.5cqw)` gives an exact 8:5 letterbox in any host.
- The canvas is 512×320 with `image-rendering: pixelated`. Each shot renders unzoomed into a work buffer. Camera zoom
  is a final nearest-neighbour crop/scale, so pixels stay chunky. Dissolves cross-fade two shot buffers. Post passes:
  vignette, flash, scene fade, sliding letterbox bars (30 px).
- Subtitles (`.mm-cine-sub`, `aria-live`), titles, region captions, nameplates and the closing card are DOM text,
  sized in `cqw` so they scale with the stage.
- Everything is created at `play()` and removed at the end: style tag, root, listeners, rAF, timers, video, duck.
  The test checks node and listener counts before and after every path.
- The overlay fades in over 0.35 s, the scene fades out from black, and the overlay fades out over the last 0.45 s, so
  the game reappears without a hard cut. Skips close with a 0.25 s fade.

## Manifest schema (`MM.CINE_MANIFEST[id]`)
`id, title, trigger, playback:'video'|'engine'|'auto', video:{webm?,mp4?}, fallback:'engine'|<sceneId>,
subtitles:[{t0,t1,text,speaker?}], duration, music, cues?:[{t,music?|sfx?}], replay:{unlockMemory,allowed}, rewardKey,
boss?:{name,epithet}` (nameplate text for boss intros).
- `playback:'engine'` ignores `video`.
- `fallback` names the engine scene used when video fails. `'engine'` means the scene with the same id. A
  manifest-only id whose fallback points at another scene plays that scene's engine timeline with the fallback
  entry's subtitles.

## Adding / editing an engine scene
`SCENES[id] = {bars, fadeIn, fadeOut, vignette:{col,k,pulse}, shake:[{t0,t1,amp}], flash:[{t,d,c,a}],
captions:[{t0,t1,kind:'title'|'region'|'name'|'card',title,sub,small}], shots:[{t0,t1,in:'dissolve'|'cut',xf,
cam:[[p,{x,y,z,fx,fy}]…],ease,still,draw(g,s)}]}`. `s = {t,lt,p,d,cam,rm}`. Reusable painters: `grove(g,s,{health,
layout:'wide'|'home'|'well',glow,blaze,lit,over,crops,actors…})`, `region(...)`, `regionVignette`, `moonwell`,
`cottage`, `crops`, `brambles`, `witch`, `castSprite`, `villager`, `charm`, `seedCase`, `boss`, `shard`, `trail`,
`fireflies`, `pollen`, `snowfall`, `spores`, `sky`, `stars`, `moon`, `mist`, `band`, `glow`. Shot timing in the
manifest (`duration`, subtitles, cues) must match the scene's shot times.

## Testing
`node tests/cine-test.js` (≈60 s, 54 checks; exits non-zero on failure). Screenshots go to
`tests/out/cine-<id>-{start,mid,end}.png` plus `cine-reduced-motion-boss_forest_intro.png`.
`tests/cine-demo.html` is a manual player with subtitle, reduced-motion and speed toggles.
