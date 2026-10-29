# Audio handoff (MM.audio)

Files: `src/systems/audio.js` (engine, classic script, ~700 dense lines, sectioned), `tests/audio-demo.html` (audition bench),
`tests/audio-test.js` (headless Playwright checks). No audio files and no libraries: everything is synthesized with Web Audio.

## Load / unlock
- Include `<script src="src/systems/audio.js"></script>` after `src/core/mm.js`. It creates `window.MM.audio`.
- The AudioContext is created lazily by `MM.audio.init()`. The script also attaches capture-phase `pointerdown/mousedown/touchend/keydown`
  listeners that call `init()` (or `resume()` if the context was suspended/interrupted), so the first click/key unlocks audio automatically.
- Before init, or without Web Audio, every call is a safe no-op. `music()` and `ambience()` calls made before init are remembered and start on init,
  so core can call `MM.audio.music('title')` at boot.

## API
| Call | Notes |
|---|---|
| `init()` → bool | Creates the context and graph. Returns false if Web Audio is missing. |
| `ready` (getter) | true when the context exists and is running |
| `resume()` | resumes a suspended context |
| `music(id, {fade=1.5})` | Crossfades between tracks. Calling it again with the same id does nothing. `music(null)` or `'none'` fades out. At most 2 old instances keep fading; older ones are cut quickly. |
| `ambience(id, {fade=2})` | `grove_night, grove_day, forest, swamp, mountain_wind, crypt, rain, none`. Runs on its own sub-bus inside sfx. |
| `sfx(id, {pan, rate, volume})` → bool | Has a per-id voice limit (the oldest voice is stolen with a 12 ms fade) and a minimum retrigger gap (calls inside the gap are dropped). Plays only while the context is running. |
| `loop(name, on, {speed 0..1})` | `broom` (alias `broom_whoosh`) and `charge`. Calling `loop(name, true, {speed})` again only updates the speed. |
| `setIntensity(0..1)` | Fades a gentle combat percussion layer in over the current track. `combat`/`boss` have their own drums. |
| `duck(amount=0.6, ms=1500)` | Lowers music fully and ambience by 60% of `amount`, then recovers. `ms=Infinity` holds the duck until `duck(0)`. |
| `setVolume(bus, 0..1)` | Buses: `master, music, sfx, cine, ambience`. Changes are smooth (setTargetAtTime). |
| `getVolumes()` | `{master,music,sfx,cine,ambience,muted}` |
| `mute(bool)` / `setMuted` / `toggleMute()` | |
| `applySettings({master,music,sfx,cine,ambience,muted})` | Also accepts `musicVolume`-style keys and 0..100 values. Persists nothing. Automatically subscribed to `MM.bus` `'settings'` (uses the event's `.audio` view). At load and at init it also reads `MM.settings.get()` `volMaster/volMusic/volSfx/volCine`. Verified against the current `src/core/mm.js`. |
| `stopAll({fade})` | Fades music and ambience, stops loops, and silences sfx voices. |
| `stats()` | `{ready,state,voices,byId,nodes,transient,persistent,musicNodes,ambNodes,sfxNodes,tracks,ambiences,loops,music,ambience,intensity,dropped,stolen,skips,maxStepsPerTick,bad,errors}` |
| `meter()` | `{pre, post}`: realtime peak before and after the safety clipper |
| `list()` / `limits(id)` / `current()` | ids of everything; per-sfx `{voices,gapMs,bus}` |
| `preview.render(spec)` → Promise | OfflineAudioContext render → `{peak,rms,clipped,bad}`. spec: `{seconds, music, ambience, intensity, loop, sfx:[[t,id,opts]], safety:false}` |
| `preview.track(id)`, `preview.amb(id)`, `preview.playAll(gapMs)` | helpers for auditioning |

Music ids: `title, homestead_day, homestead_night, village, forest, swamp, mountain, dungeon, combat, boss, cine_intro, cine_sorrow, cine_triumph, ending, defeat`.
`cine_*` tracks are routed through the `cine` bus, so the cinematic volume slider controls them.
SFX ids: the full list from the brief: ui_*, save, cast_* (+cast_charge), impact_*, hit_player/enemy, crit, enemy_windup/die, boss_roar/phase,
shield, heal, plant, water, harvest, pickup, coin, craft, brew, potion, broom_mount/land/whoosh, footstep_grass/stone/snow/mud,
level_up, quest_complete, region_restored, door, shop_buy, cine_whoosh, cine_sting (both on the cine bus), moonwell_pulse, defeat, victory.

## Design
- Graph: voices → bus (dry and reverb-send paths share one volume) → master → 9 kHz low-pass → compressor (-14 dB, 4:1)
  → soft-knee WaveShaper (asymptote 0.97, so the output can never reach 1.0) → destination. The reverb is a ConvolverNode with a procedurally
  generated 2.8 s darkening stereo impulse response.
- Music is a generative 16th-step sequencer per track. Each track defines a mode, chord progression (scale degrees; chords stacked in thirds),
  and layers: pad/str, drone, bass (root/walk/pulse), arp (pluck or bell), music-box bells, flute/brass lead (random walk snapped to chord tones),
  pluck rhythm, and percussion patterns. A seeded RNG makes each play-through slightly different.
- Scheduler: `setInterval` every 25 ms with 120 ms lookahead (1.5 s while the tab is hidden). If a track falls behind (stalled main thread or a tab waking up),
  it skips whole steps and re-triggers the pad, so there is never a catch-up burst. Hard caps: 48 steps per track per tick, and a live-node cap of 900
  (decoration notes and new sfx are dropped above it).
- Gain staging constants are at the top of the file: `SFX_GAIN`, `AMB_GAIN`, `CINE_TRACK_GAIN`.

## Tested (`node tests/audio-test.js [--quick] [--verbose]`, ~75 s full)
- No AudioContext: every call no-ops, `init()` returns false, and there are no errors.
- Realtime in headless Chromium: before init everything no-ops, and music/ambience queued before init start on a real click. Every track was played ~1 s,
  every ambience, and every sfx with random pan/rate. Also covered: intensity, duck, loops, volume/mute/applySettings, the same-id music no-op,
  and stopAll leaving 0 instances.
- Spam: 200× `sfx('cast_moonbolt')` in one tick → 1 voice. Five ids spammed every 4 ms for 1.5 s → never over their limits, max ~950 live nodes.
- Stalled main thread for 2.5 s during the boss track → at most 2 steps scheduled per tick afterwards, and the stall was detected.
- `bad` (non-finite values) = 0, engine errors = 0, no console errors.
- Offline renders with the safety clipper bypassed: every sfx (2.5 s), every track (10 s, intensity 1), every ambience (8 s), and dense mixes
  (boss + crypt + broom + 10 heavy sfx; combat + rain + 40 sfx). All peaks are below 1.0, none are silent, and no samples clip.
  Measured: sfx 0.03–0.55, music 0.19–0.29, heaviest mix ~0.75.
- Typical live node counts: 100–155 (music + ambience).

## Known issues / notes for integration
- The sound was not judged by ear (headless only). A human should audition `tests/audio-demo.html` on a device, especially for loudness balance
  and to check that the crickets/hats are not too bright.
- `cine:start`/`cine:end` do not auto-duck. The cinematics/core owner should call `MM.audio.duck(0.6, ms)` or `music('cine_*')` explicitly.
- A stolen sfx voice is silenced but its nodes finish naturally, which is bounded by the voice limits.
