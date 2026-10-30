# Handoff — cinematics agent

## What exists
- `src/systems/cinematics.js`: `MM.cine` player and all 8 procedural engine scenes (≈1240 lines, classic script, no deps).
- `src/config/cinematics.js`: `MM.CINE_MANIFEST` (8 scenes: subtitles, cues, music, rewardKey, replay, boss nameplates).
- `assets/video/README.md`: how to drop in WebM/MP4. No videos ship; every scene plays from the engine.
- `tests/cine-demo.html` (manual player and test page with listener instrumentation) and `tests/cine-test.js`.
- `notes/CINEMATICS.md`: full API, manifest schema, layering, scene breakdown, how to add scenes.

## API (summary)
`MM.cine.play(id,{onEnd,skippable,force,queue})` → Promise `{id,skipped,completed,usedFallback,playback,rewardKey,prevMusic,…}`.
It never rejects and never throws. Also `skip pause resume isPlaying isPaused current seek setSubtitles
setReducedMotion setVolume setTimeScale has list clearQueue`.
Emits `cine:start` / `cine:end` on `MM.bus`. Grants nothing: callers use `result.rewardKey` with `MM.campaign.grantOnce`
whenever `completed` is true (skip == watch).

## Integration status (checked against the phase-2 tree)
- `index.html` already loads both files. The overlay mounts in `#mm-stage` at z-index 50, under `#mm-ui` (z 100).
  Verified headless: no console errors, and the result resolves.
- The UI memories screen calls `play(id,{skippable:true, replay:true})`. `replay` is accepted and ignored.
- Settings: reads `MM.settings.all()` at play time (`subtitles, reducedMotion, reducedFlashes, shake`) and listens to
  the bus `'settings'` (`d.all`). Video volume follows `MM.audio.getVolumes().cine × master` unless `MM.cine.volume` is set.
- Audio follows `notes/handoff/audio.md`:
  - `music(id,{fade:.7})` (seconds) and manifest cues;
  - restores the previous `MM.audio.current().music` after engine scenes (non-cine tracks only);
  - video ducks with `duck(.7, Infinity)` and releases with `duck(0,0)`.
- Boss names match PHASE2_CONTRACT: Bramble Warden, Mire Heart, Frost Wyrm Husk.
- The caller should still wrap the scene in `MM.state.go('cine')` … `'play'` (contract). If it doesn't, UI screens at z ≥ 100
  (e.g. the title screen) draw over the cinematic, which is the intended layering.

## How tested
`node tests/cine-test.js` → **ALL PASSED** (54 checks, run twice). It covers:
- every scene plays to the end at 12× and resolves `skipped:false, completed:true`;
- skip via Esc, Space-twice, button click, hold-Space and `skip()`: all resolve `skipped:true` within ~0.3–0.5 s, and `onEnd` fires;
- queueing, `{queue:false}` → busy, `{force:true}` → interrupted, unknown id;
- video paths: a missing file → engine fallback, autoplay-blocked (stubbed `NotAllowedError`) → fallback, and a real
  MediaRecorder-generated WebM blob plays as `playback:'video'`, with duck/unduck observed;
- bus events, audio cues, subtitle toggle, reduced motion with pause/seek/resume, and the `document.body` fallback host
  (8:5 letterbox);
- the 8:5 overlay inside `.canvas-wrap` at z < 100 with a z-120 element still on top;
- DOM node and window/document listener counts identical before and after every path; no console errors; `MM.cine.lastError === null`.

The test-only video entries are injected at runtime and deleted afterwards; they are never in the shipped manifest.
All 24 screenshots (`tests/out/cine-*.png`) were reviewed visually and the scenes were iterated on: region
composition, panorama seams, boss texture, actor placement above the letterbox bars, and the frost wyrm redesign.

## Known issues / caveats
- Camera zoom is a nearest-neighbour scale of the composed frame. Slow pushes (≤ 1.1×) show slight pixel crawl, which
  is typical of pixel-art cameras. Reduced motion removes it.
- `MM.art` sprites are not used. The procedural set pieces are composed at specific scales, and the art pass's
  anchors and sizes would need per-sprite tuning. The hook point is the `moonwell`/`cottage`/`boss` painters.
- Listener-leak instrumentation counts only listeners registered from `src/systems/cinematics.js`, because Playwright
  injects its own window listeners during element screenshots.
- The single-file build would need videos inlined. Engine scenes need nothing extra (they only use `ATLAS_DATA` and
  `CAST_PAGE_DATA` when present).
- rAF-driven: a hidden tab pauses the cinematic, and it resumes when the tab is visible again.
