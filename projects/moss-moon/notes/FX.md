# Moss & Moon — FX, lighting, soft filter, Sprite Fusion VFX (owner: FX agent)

Files: `src/systems/lighting.js` (MM.lighting), `src/systems/fx.js` (MM.fx), `src/systems/filter.js` (MM.filter),
`src/systems/vfx-bridge.js` (MM.vfx), tests `tests/fx-lib.js`, `tests/fx-test.js`, `tests/fx-visual.js`, `tests/fx-standin.js`.
`src/systems/sfvfx.js` is GENERATED from `art/vendor/spritefusion-vfx/*.ts` by `tools/port-sfvfx.js` — never hand-edit.

**Credits.** Pixel-art VFX by **Sprite Fusion** (https://www.spritefusion.com/pixel-art-vfx), MIT License,
Copyright (c) 2026 Hugo Duprez — vendored unmodified, adapted only through options in `vfx-bridge.js`.

## Frame layering (MM.hooks, lower priority runs first)
| hook | prio | what |
|---|---|---|
| postUpdate | 0 / 5 | MM.fx simulation (pools, sequences, ambient) / MM.vfx update + ambient fields |
| drawGround | 50 / 60 | ground decals (scorch, rime, thorn zone, residue, status rings, Starfall warning fill) / Sprite Fusion **back** layer |
| (drawEffect wrapper) | – | 5 signature spells (mid layer); the other 25 baseline spells render unchanged |
| light | 0 | MM.lighting replaces `drawWeatherAndLight` (returns true) |
| postEffects | 10 / 20 / 1000 | MM.fx world particles, sprites, rings, shockwave blit / Sprite Fusion **front** layer + light layer ('lighter') / **MM.filter** (last) |
| overlay | 0 | tints & flashes, then telegraphs, Starfall ring, damage numbers, text — post-filter, always crisp and on top |
Everything is dormant when the current state's `sim === 'none'` (no update, no draw; Sprite Fusion records are released).
No private rAF: all work runs inside MM.loop through hooks.

## MM.lighting
`setPalette(name|null)` ('day','dawn','dusk','night','storm','dungeon'; null = auto from `world.time`/weather/region/mode/restoration),
`addLight({x,y,h,r,color,flicker,intensity,life,glow,follow}) -> id`, `removeLight(id)`, `clearLights()`, `pulse(x,y,r,color,i,life)`,
`pulseScreen(...)`, `info()`, `darkness()`, `paletteName()`, `enabled`. Night/dusk/dungeon: 256×160 light map (512×320 on quality high)
filled with the ambient colour, radial sprites added ('lighter'), multiplied over the scene (nearest upscale), then a soft additive glow.
Day: one flat multiply (region/restoration tint). Sources: `MM.world.getLights()` (WORLD format `{x,y,z,r,color,night,intensity,on,kind}`;
baseline lamp props if absent), glowing crops (moonflower/glowcap/starmint), player lantern (larger in dungeons), spells in flight,
impact accents, loot, interactables and dim rim lights on enemies in the dark (readability), fireflies, FX decals. Rain + splashes and
swamp/crypt/forest mist only when MM.vfx does not own `rain`/`fog`. Storm lightning (reducedFlashes: 25 %).

## MM.filter (scene canvas only; DOM UI untouched)
Bloom: half-res bright pass (`ctx.filter` brightness+contrast threshold, only near-white / saturated-bright pixels) → blur →
'lighter' (nearest 2×; `low` thresholds at quarter res). Grade: one cached 1:1 **multiply** layer (warm centre / cooler darker edges =
grade + light vignette) and one cached **screen** layer (cool shadow lift + region-tinted top haze), per palette. Medium adds a
quarter-res diffusion ('screen' 8 %) and integer-offset film grain (off with reducedMotion). No chromatic aberration. Fallback without
`ctx.filter`: x⁸ self-multiply threshold + down/up-scale blur. `apply(ctx)`, `snapshot(scale)` → dataURL, `stats()`, `mode()`.

| quality | softFilter | bloom | lightmap | Sprite Fusion | extras |
|---|---|---|---|---|---|
| low (core preset: off/off/particles low) | ≤ low | ≤ low | 256×160 | no light layer, caps 4/3/3/1, thinner fog | no diffusion/grain/shockwave |
| medium (preset low/low/medium) | as set | as set | 256×160 | caps 6/5/6/3 | – |
| high (preset medium/high/high) | as set | as set | 512×320 | caps 6/5/6/3 | diffusion + grain (medium soft) |
Other settings, live via bus `settings`: `particles` → `MM.settings.particleScale()` (pool caps + counts), `fxIntensity` 0.5/1/1.5
(counts, light accents, shake, Sprite Fusion size/density), `reducedMotion` (no shockwave blit/slow-mo/shake/grain, calmer ambient,
particles ≤ .35), `reducedFlashes` (flash ≤ 0.08 alpha, ≥ 0.4 s apart, dimmer light layer/tints), `damageNumbers`.

## MM.fx
`burst(kind,x,y,opts)` kinds: dust soil water wet growth harvest pickup broom trail sparks hit shield heal crit burn chill root poison shock
smoke levelup kill potion bloom fragment door moonwell ember frost star moon · `telegraph({shape:'circle'|'ring'|'line'|'cone'|'rect',x,y,r,w,
h|len,x2,y2,dir,arc,dur,kind:'danger'|'poison'|'frost'|'darkness'|'friendly',follow,onEnd,px})` (TILE units like bosses.js; per-kind
pattern = shape cue: stripes / dots / crosshatch / bars, inner fill grows with time, dark+bright double outline, last beat thickens) ·
`cancelTelegraph` · `zone(kind,x,y,rTiles,dur)` · `restorationWave(region,{x,y}?)` · `moonwellPulse(k)` · `door(x,y,kind)` ·
`shockwave(x,y,rPx,dur)` · `flash(color,ms,alpha)` (≤ 3/s) · `slowmo(sec,scale)` · `text(str,x,y,opts)` (3×5 pixel font, outlined) ·
`shake` · `stats()` · `clear()`. Bus out (HUD): `spell:cast {id,name,sig,school,color,cost,cooldown,actor}`, `spell:impact`, `spell:fail {reason}`.
Pools: particles 1400 SoA (cap 1000×particleScale×min(fxI,1.4); per-class caps combat .4 / spell .45 / world .35 / env .25), decals 96,
texts 48, telegraphs 32, sequence steps 48, shockwaves 4, ambient 160; spawns > 90 px off-screen are dropped; region/state changes clear all.
FX takes over baseline damage numbers (`MM.baselineDraw.damageNumbers=false`).

### Effect classes — anticipation → action → impact → aftermath
| class | anticipation | action | impact | aftermath |
|---|---|---|---|---|
| Moonbolt | silver glint at the staff | outlined crescent + silver-blue ribbon trail | `fx_moonbolt_hit` + SF `impact` (moon ramp) + ring + light | SF `sparkle`, lunar motes, residue |
| Ember Bloom | ember swirl | spiralling seed, spark trail | SF `explosion`(.36) + `fx_ember_bloom` + six-petal flower + light + shake | scorch (zone duration) with rising embers; burning foes get SF `fire` attached |
| Thornbind | leaf glints | root crawling along the ground | `fx_thornbind` + SF `poison` puddle (thorn ramp) + soil/leaves | thorn boundary + curling roots for `mmZone.dur` |
| Frostbell | crystal at the hand | crystalline shard | `fx_frostbell` bell + two ring pulses to `mmPulse.r` + SF `ice` crystals | rime patch, falling flakes |
| Starfall | gathering star + countdown ring ≥ 0.7 s (hit 1.05 s) | SF `holyLight` slam timed to the hit | starburst, ring, shockwave blit, soft flash, shake | SF `sparkle`, stardust |
| hit (chip/normal/heavy) | enemy windup "!" + cone (baseline enemies) | directional sparks | SF `impact` sized by damage share, ring, accent | dust puffs |
| crit | – | hit-stop 0.05 s | star burst + SF `slash` (gold) + 2× number | sparks |
| kill / boss kill | hit-stop | `fx_poof`/`fx_blight_burst` + burst | ring + light; boss: SF `explosion`+`sparkle`, flash, shake, slow-mo | soul wisp, smoke, ash residue |
| boss phase | darkening vignette + converging motes + slow-mo | shockwave ring | flash + shake + SF `explosion` (Hollow Moon p2: `blackHole`) | embers |
| harvest | crop glint pulls light in | `fx_harvest` pop + burst | ring + light | SF `pickup` orb flies to the witch, `+N` |
| level-up | light converges (0.35 s) | SF `powerUp` on the witch | ring + shockwave + soft flash | sparkles, LEVEL UP text |
| restoration | Moonwell gathers light (0.7 s) | expanding green-gold wave + SF `holyLight` + `powerUp` | screen recolour, shockwave, flash | petals/blooms along the ring, firefly boost 12 s |
| potion / heal | uncork glint | SF `heal` on the witch | ring + light | sparkles, `+N` |
| pickup | loot in reach glints | SF `pickup` coin/orb magnet | sparkle pop at the witch | `+gold` |
| door / Moonwell | doorway light swells / motes gather | light spill + SF `sparkle` / ring | dust ring / big pulse: `holyLight` | motes drift |
| hurt | (telegraph) | slash arc from the attacker | SF `impact` (rose), sparks, red vignette, shake | – |
Ambient (MM.vfx fields, density × particles × fxIntensity): rain (storm), snow (Frostpeak / winter), fog (swamp, blighted forest,
crypt; lifts with restoration), fireflies (night, density by restoration), falling leaves (forest / windy grove), embers (crypt);
MM.fx keeps pollen, spores, dust motes, sky stars, restored-grove petals.

## MM.vfx (Sprite Fusion bridge)
`play(name,x,y,opts)`, `attach(name,actor,opts)` (opts.until(actor)), `stop(id)` (graceful), `kill(id)`, `clear(keepAmbient)`, `owns(kind)`,
`isActive(id)`, `stats()`, `hex()`, `PAL`/`RAMP` (moon, ember, thorn, frost, star, heal, rose, gold). One shared 512×320 Frame backed by two
ImageData buffers (no copies); per effect `frame.ox/oy` = camera origin (world) or 0 (weather); only the union bbox is uploaded
(dirty-rect `putImageData`) and blitted under the world (shake) transform; light layer 'lighter'. Callbacks: shake → MM.camera.shake
(throttled), ripple → MM.fx.shockwave, flash → MM.fx.flash (limited). Records: 28 max, caps burst 6 / spell 5 / attach 6 / ambient 3,
lifetime limits, off-screen attached effects not stepped.

## Performance (headless Chromium, software raster, `node tests/fx-test.js`, night stress scene: a signature cast every 12 frames +
hits; ms per frame for update + draw + raster flush; noisy ±1 ms)
| quality | frame total | without filter | filter share | baseline only | Sprite Fusion pass |
|---|---|---|---|---|---|
| low | 6.3 | 7.5 | ~0 (off) | 2.7 | 0.9 |
| medium (soft low, bloom low) | 9.8 | 9.0 | ~0.8–1.7 | 1.8 | 1.3 |
| high (soft medium, bloom high, grain, diffusion) | 13.2 | 11.7 | ~1.5–2.2 | 2.0 | 1.4 |
Medium filter stays under the 2.5 ms target. Measuring `MM.filter.apply` alone reads 3–4.5 ms because sampling the scene forces the
whole frame to rasterise inside that call (cost the browser pays at present time anyway). GPU-backed canvases are far cheaper.

## Tests
- `node tests/fx-test.js` — 21 checks: 200 casts + kills + hits over 3000 frames with caps (particles ≤ cap, decals ≤ 96, texts, telegraphs,
  queue, Sprite Fusion records) and no growth after load, baseline numbers drained, flash limiter (≤ 3/s; reducedFlashes ≥ 0.4 s),
  reducedMotion (no shockwave/slow-mo/shake, particles ≤ .35), dormant when sim 'none' (menu state), sfx + HUD events for all 5 spells,
  Sprite Fusion constructed, tile-unit telegraphs (circle/line/ring) + onEnd, perf per quality, zero page errors. Last run: 21/21.
- `node tests/fx-visual.js [filter,palettes,spells,classes,reduced]` — 2× scene shots `tests/out/fx-*.png` and 3× strips
  `tests/out/fx-strip-*.png` (reviewed visually).
- `node tests/sfvfx-test.js` (library smoke, all 25 effects), `node tests/smoke.js index.html` (CORE) — pass.
