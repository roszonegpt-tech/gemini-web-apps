# Ink Outlaws: Crown of Dust

An action-adventure strategy game drawn entirely by the **Chunk Lab: Ink Outlaws** painter. Every character, beast, building,
tree and rock is painted in JavaScript in the lab's hand-inked style. There are no image files.

You are an outlaw captain taking the Tally Basin back from three powers: the **Greenskin Corsairs**, the **Hollow Court**
and the **Gilded Crown**.

- **Strategy layer:** a day-by-day campaign map of 13 territories. Ride out against a neighbouring territory, take it, earn
  gold every day, then weather the enemy's raids. Hire a posse, buy weapons, and build up Dry Gulch.
- **Action layer:** real-time missions. Your captain fights with any of the lab's 22 weapons, using its combo chain, a dodge roll
  and a special move. Up to six posse members follow orders, and you can build barricades, gun nests, campfires and powder kegs
  at surveyor stakes.
- **Mission types:** Raid, Rescue, Heist, Defend and Stronghold boss fights against Captain Snig, Queen Vex, and King Odo with his Tyrant.
- **Cast:** all 63 Chunk Lab presets plus 24 new looks built from the lab's own look schema. Any character you design in the lab
  shows up as a fourth captain ("The Stranger").

## Run it

- **Locally:** open `index.html` in a browser. No server and no build step are needed; it works from `file://`.
- **Single file:** `python3 build/build.py` writes `build/Ink_Outlaws_Crown_of_Dust_v<version>.html`, which runs anywhere
  (AirDrop or Files on an iPad/iPhone, or as an email attachment).
- **GitHub Pages:** publish the repository root; the game is at `/games/ink-outlaws-crown-of-dust/`. The repo root has `.nojekyll`.
  All paths are relative.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | WASD / arrows | left stick |
| Attack (hold to keep firing, tap for melee combos) | mouse / J | ATTACK |
| Dodge roll | Space / right click / K | ROLL |
| Special move | F / L | SPECIAL |
| Swap weapon | Q | SWAP |
| Open chest / build at a stake | E | USE |
| Posse: follow / hold / charge / focus | 1 2 3 4 | buttons above the pad |
| Pause | Esc / P | II |

With the mouse, attacks aim at the cursor. With keys or touch, attacks auto-aim at the enemy in front of you.

## Project layout

```
games/ink-outlaws-crown-of-dust/
├─ index.html              entry point (classic scripts, file:// safe)
├─ assets/css/game.css     lab palette and button language
├─ assets/js/ink.js        the Chunk Lab painter v0.5.0, verbatim plus one INK.kit export line
├─ src/core/               util, audio (WebAudio synth), save, input, boot/loop
├─ src/art/                sprites (trimmed LRU cache), inkkit (structures and props), fx
├─ src/config/             weapons, units (cast and stats), buildings
├─ src/entities/unit.js    the one unit record type, its animation and drawing
├─ src/systems/            combat, world (map gen, collision, A*), ai, campaign rules
├─ src/scenes/             mission (real-time layer), map (title and campaign map)
├─ src/ui/                 hud, menus
├─ levels/territories.js   the Tally Basin: territories, links, prisoners
├─ saves/                  save schema and an example save
├─ tests/                  smoke, reachability, mission and full-campaign autopilot tests (Playwright)
├─ notes/                  DESIGN, PAINTER_API, UNIT_ROSTER
├─ docs/lab/               the original Chunk Lab file, unmodified
└─ build/build.py          single-file build
```

## Play in an Artifact

`python3 build/build.py --artifact` writes `build/artifact/ink-outlaws-crown-of-dust.html`, the game as a page fragment (title, style, body and inline scripts)
for a claude.ai Artifact. It is git-ignored and regenerates in a second. `node tests/artifact.cjs` plays it inside the Artifact skeleton at desktop and phone sizes,
and with browser storage blocked.

Saves use `localStorage`. The Menu (and the title screen) can copy and load a **save code**, one line of text that moves the campaign between browsers and devices.
Loaded codes are whitelisted and clamped by `K.sanitize` in `src/systems/campaign.js`.

## Trailer

A 58-second gameplay trailer is filmed from the engine itself by `trailer/trailer.js`. It has 48 shots cut on a 120 BPM beat, and its soundtrack is made from the game's own synth sounds plus a drum and bass loop.

- **Watch it live:** open `trailer/index.html#yt` (16:9) or `trailer/index.html#tt` (9:16) and press Play.
- **Render the video files:** `node tests/render_trailer.cjs yt` or `node tests/render_trailer.cjs tt` writes an H.264 + AAC MP4, 30 fps,
  to `build/trailer/`, which is git-ignored.
- **Contact sheet:** add `--sheet` to get one frame per shot instead of a video.

The render needs Playwright with Chromium, and `ffmpeg` with libx264.

## Story and How to Play (narrated guide)

`trailer/guide.js` films a narrated guide on the same director engine (`trailer/director.js`).

- **YouTube cut:** about 3:50, 13 chapters.
- **TikTok cut:** about 56 s.

The real menus and HUD are on screen, with burned-in captions, keycaps and pointer rings.

The narration is offline neural TTS (Piper, voice "norman", a public-domain LibriVox narrator). The script lives in `trailer/guide_script.json`.

1. Generate the narration: `python3 build/make_vo.py --piper <piper binary> --model en_US-norman-medium.onnx`. Setup steps are in the file header.
2. Render: `node tests/render_trailer.cjs yt --film guide`, or `tt`. This writes the MP4, an `.srt` subtitle file and a chapter list to `build/guide/` (git-ignored).

## Tests

Tests need Node and Playwright with Chromium. Run them from this folder:

```
node tests/smoke.cjs             # http, file:// and the single-file build; fails on any console error
node tests/reach.cjs "" 25       # every objective reachable on 12 territories x 25 seeds
node tests/mission.cjs ford 6    # autopilot plays one mission (territory id, or defend:<faction>:<tier>)
node tests/campaign.cjs 45 10    # autopilot plays the whole campaign through the real menus
```

`tests/gallery.html` shows every structure and prop next to a character for a style check.

## Assets

All art is generated by code from `assets/js/ink.js`, which is copied from Chunk Lab: Ink Outlaws v0.5.0
(`docs/lab/Chunk_Lab_Ink_Outlaws_v0.5.0.html`, lines 157–1726). No files from the Universal Assets library are used.
