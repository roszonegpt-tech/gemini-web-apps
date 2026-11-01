# Duel in the Rain

A pixel-art three.js diorama: a mountain Shinto shrine at night in the rain, where six swordsmen duel two at a time. Nobody dies — the loser kneels and bows, the winner shakes the rain off his blade and sheathes it, and the next pair comes up the steps.

Single file, static, no build step. three.js r170 is loaded through an importmap from jsDelivr; everything else (geometry, palette, sound) is generated in the page.

## Run it
- Open `index.html` in a current desktop or mobile browser with WebGL 2, or
- serve the folder: `python3 -m http.server 8000` and open `http://localhost:8000/`.

## Controls
| Action | How |
|---|---|
| Orbit / zoom | Drag; scroll or pinch |
| Will a swordsman on | Click him in the scene, or click his name in the roll |
| Lightning | **Call down the lightning** or `L` (during a bout it calls the final pass) |
| Close-up | **Close-up** or `F` |
| Pause | **Pause** or `P` |
| Other | Weather (dusk / night / drizzle / rain / storm), wind, veranda view, turn left/right, ×3 speed, sound, pixel size, palette / dither / outline / Raw 3D |

## Project map
```
duel-in-the-rain/
├─ index.html        the whole app (HTML, CSS, one ES module)
├─ .nojekyll         keep GitHub Pages from running Jekyll
├─ .gitignore
├─ README.md         this file
├─ CHANGELOG.md      notable changes by version
├─ VERSION.md        current version / build / date
├─ STATE.md          architecture snapshot for handoff
├─ TODO.md           next steps, ideas, known limitations
├─ notes/
│  └─ design.md      design notes: scene layout, palette, choreography
└─ tests/
   ├─ smoke.mjs      load, run, screenshot, report console errors
   ├─ finale.mjs     force an ending (sword | hair | neck) and capture it
   └─ views.mjs      weather presets, veranda, Raw 3D, phone width
```

## Tests
Serve the folder on port 8765, then:
```
node tests/smoke.mjs  http://localhost:8765/index.html ./out 8
node tests/finale.mjs sword ./out
node tests/views.mjs  ./out
```
They need Playwright with Chromium; they use SwiftShader, so they are slow but need no GPU.

## GitHub Pages
The app is static and uses only relative paths. If Pages publishes this repository from the root, the diorama is served at `/apps/duel-in-the-rain/`. Add an empty `.nojekyll` at the publishing root if Pages is set to the repository root.

## Credits
Original content. three.js (MIT) by the three.js authors. Fonts: Merriweather and Libre Franklin from Google Fonts (system fallbacks if offline).
