# assets/video — drop-in cinematic videos

Every cinematic currently plays as a procedural **engine scene** (`src/systems/cinematics.js`). No video files ship.
To replace a scene with a pre-rendered video:

1. Export the clip at 8:5 (e.g. 1024×640 or 1280×800). It is shown with `object-fit: contain` over black, so other
   ratios get letterboxed. Use VP9/Opus **WebM**, and optionally an H.264/AAC **MP4** for Safari.
2. Name it after the scene id: `assets/video/<id>.webm` / `<id>.mp4`, e.g. `intro.webm`.
3. In `src/config/cinematics.js`, list **only files that really exist**:
   `video: { webm: 'assets/video/intro.webm', mp4: 'assets/video/intro.mp4' }`, and keep `playback: 'auto'`
   (or `'video'`). Set `duration` to the clip length. Subtitles in the manifest are timed against `video.currentTime`.
4. Keep `fallback: 'engine'`. If the file is missing, fails to decode, autoplay is blocked or it hasn't started within
   `MM.cine.videoTimeoutMs` (4 s), the player falls back to the engine scene automatically.

Notes
- Paths resolve relative to the page (`MM.CINE_VIDEO_BASE`, default `''`). The single-file build (`tools/build.js`)
  would need to inline videos as data URIs. That is only practical for very short clips, so prefer the engine scenes there.
- The video carries its own audio. Manifest `music`/`cues` are only used for engine playback. Game music is ducked
  (`MM.audio.duck(.7, Infinity)`) while a video plays and released (`duck(0, 0)`) afterwards.
- Volume = `MM.cine.volume` if set, else the audio `cine` bus, times `master`.
