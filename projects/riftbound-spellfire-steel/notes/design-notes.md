# Design notes — how the prompt was interpreted

- **Repo fit:** this repository is a Gemini web-app tracker, so the game lives in its own standard project folder (`projects/riftbound-spellfire-steel/`) using the house template (`index.html` at project root, `assets/`, `src/`, `levels/`, `tests/`, `notes/`, …). The prompt's `/src` + `dist/index.html` requests are honoured inside that folder.
- **Language/engine:** TypeScript + three.js r162 (pinned: last release with WebGL1 fallback, matching the Safari 14 target). Bundled with esbuild into a classic script so `index.html` also runs from `file://`.
- **Controls mapping:** Space = Blink, Shift = Ward (hold); "Ward Shield Snap" = raising the ward within 0.22 s before a bullet lands reflects it. Settings can swap Space/Shift. Potions: F (health) / G (mana); gamepad B and touch POTION pick the most-needed one.
- **Spell slots:** LMB is always Arcane Bolt (primary); slots 1–4 choose the secondary elemental spell (Flame Burst, Chain Lightning, Vortex Surge, Meteor Strike). Chain Lightning unlocks after Sector 1, Vortex after Sector 2, Meteor after Sector 3 — or buy scrolls in the Sanctum. Inferno Fireball is a purchasable Flame Burst upgrade.
- **Combos:** Fire + Wind = Firestorm (Flame Burst into a Vortex); Ice + Arcane = Crystal Spikes (Arcane Bolt on a Frost-Bomb-frozen soldier).
- **Channelled-spell slowdown:** holding Arcane Bolt streams it and slows movement by 15%.
- **"Enchanted turrets":** Vanguard sentry guns can be enchanted ([E] hold) to fight for the mage for 25 s, then overload.
- **Golem summons:** the rescued sorcerer and the Sector 3 catalyst defence summon an allied Arcane Golem (scripted defence event).
- **Challenge trials (v1.0):** sector speedruns with a timer; the dedicated trials are the v1.1 task.
- **Difficulty knobs:** `World.difficultyHp / difficultyDmg / difficultySpread` (all 1.0 in the campaign).

## v1.2 — Golem collision response
- **Swept circle by conservative advancement.** Each frame the golem's displacement is split into sub-steps no longer than a quarter of its radius (≤ 0.35 m at the 22 m/s dash). Each sub-step is pushed out of `CF.FLY` colliders (spires, hangars, tall walls, zone gates), clamped into the flight corridor (now a union of two rectangles, `CORRIDOR`, so the inside corner at x 45.5 / z 62 has a proper normal), and resolved against `CF.FLY` once more. If the result is still invalid the golem stays where it was — its previous position is always valid, so it can never end a frame inside geometry or outside the corridor.
- **Response:** the push direction is the contact normal; the normal velocity is reflected with restitution 0.35 and the tangential velocity keeps 85% (scrape). Knockback (explosions, barrier shocks) is folded into the flight velocity so it is swept too, instead of moving the golem with the ground (MOVE) resolver.
- **Feel:** impacts above 3.5 m/s normal speed give a camera bump (0.12–0.42 trauma, off in Reduced Motion), stone chips + arcane sparks and a `golemScrape` crunch (louder / lower with speed). Above 12 m/s (only reachable while dashing) the golem chips itself for 2.2 HP per m/s over the threshold, ×0.3 while bracing, never below 1 HP. A head-on dash typically costs 5–15 armour.
- **Measured** (probe, 345 runs / 11 478 frames at dash speed into every corridor edge, the inside corner, every reachable FLY collider and 300 random dashes): v1.1 = 21 frames grazing up to 0.07 m into geometry; v1.2 = 0 frames inside geometry or outside the corridor.

## v1.2 — Golem audio
- `loop/golemHum` is now an engine rumble: sawtooth + octave sub through a resonant low-pass, plus a band-passed "stone/air grind" noise. `tuneEngine()` follows speed every frame (pitch 44→68 Hz, filter 230→1050 Hz, grind up) and Stone Brace (lower pitch, darker filter, more grind).
- `loop/golemBeam` pitch and band rise with heat; `sfx/golemCharge` plays during a 0.15 s charge-up before the beam fires (core flares, sparks converge), `sfx/golemLaser` is the ignition crack, `sfx/golemHeatWarn` ticks faster above 80% heat, `sfx/golemOverheat` is a steam hiss with venting particles during the lock.
- `sfx/golemStomp` ×2 (two feet, 190 ms apart) + dust ring + small camera bump when the golem settles after a dismount, and when a destroyed golem re-forms (it now drops onto its shrine from 4.5 m).
- The AA **lock warning** now sounds inside the golem (non-positional) instead of at the tower, so it is audible at any lock range.

## v1.2 — Audio mix
The mix is now **measured**, not guessed: `tests/audio-levels.mjs` renders every recipe offline (seeded noise) and meters the live buses in headless Chromium. Levels are approximately K-weighted (BS.1770 pre-filter via biquads), "M100" = loudest 100 ms window; "phone" adds a 24 dB/oct high-pass at 350 Hz as a crude small-speaker proxy; "game" applies each sound's in-game volume and distance attenuation.

Changes live in two places, both inside the allowed files:
- `src/game.ts` → `AUDIO_MIX`: dB trims layered over the public `AudioEngine.play` / `loopVolume` / `setVolumes` (synthesis code untouched). Music bus **+4.5 dB**; Arcane Bolt **+5**, Flame Burst cast **+4**, Blink / Ward up / Snap / potion **+2**, player hurt **+3**, bolt impact **+3**, enemy rifle **−1.5**; rain loop **−14**, rift drone **−8**.
- `src/entities/ArcaneGolem.ts`: golem recipe/loop levels (engine rumble −8 dB and a lower in-game volume, beam loop +12 dB, charge +6, lock warning +15 and non-positional, heat warning +16, overheat hiss −3, mid-range "click/crunch" layers on stomp, dash and stone hits so they survive phone speakers).

| Measure (dB, K-weighted) | v1.1 | v1.2 |
|---|---|---|
| Arcane Bolt cast (M100, in game) | −26.9 | −21.9 |
| Flame Burst cast | −24.2 | −20.2 |
| Chain Lightning | −19.8 | −19.8 |
| Blink | −22.4 | −20.5 |
| Enemy rifle shot @ 14 m | −30.4 | −32.3 |
| Rain bed, Sector 2 (rain 1.0) | −13.6 | −27.4 |
| Rift drone | −24.9 | −32.9 |
| Sector 1 ambient bus (live mean) | −17.8 | −29.7 |
| Music, calm / combat (live mean, Sector 1) | −36.3 / −29.9 | −31.8 / −25.5 |
| Golem engine rumble (idle, in-game volume) | −16.6 | −28.6 |
| Golem beam loop | −32.1 | −19.7 |
| AA lock warning (v1.1: at the tower, 14 m) | −49.7 | −23.7 |

Targets checked by the tool (v1.1 → v1.2: 4/11 → 11/11 pass):
- **T1** each player cast (Bolt, Flame Burst, Lightning, Blink) ≥ 6 dB over one rifle shot at 14 m, on full-range and phone proxies (v1.2: +10.3 / +12.1 / +12.5 / +11.7 dB; phone +7.8 dB or more).
- **T2** the heaviest rain bed sits under the Arcane Bolt (−27.4 vs −21.9).
- **T3** calm music within ±4 dB of the ambient bed (−2.1), combat music ≥ 3 dB over it (+4.4), and the bolt ≥ 2 dB over combat music (+3.6).
- **T4** golem beam ≥ 4 dB over the engine rumble (+8.9); lock warning no more than 6 dB under it (+4.9).
- **T5** no in-game one-shot peaks above −1 dBFS before the master compressor.

Limits: these are objective proxies. Nobody has listened to the mix on desktop speakers or phone speakers yet — that remains a manual check (TESTING.md). The rumble is measured at idle; at full speed it is estimated (not measured) to rise ~4–5 dB, which would shrink the beam's lead to ~4 dB while flying flat out.

## v1.3 — Mobile controls
- **One button table, three contexts.** On foot: BLINK, WARD, SPELL, USE, POTION, BOMB, CYCLE. Riding the golem the same thumb positions become DASH, WARD→BRACE, SPELL→VOLLEY, USE→LAND (shown only where dismounting is possible); POTION / BOMB / CYCLE disappear because they do nothing in the air. Trials hide what their rules lock, and the aim stick casts the one allowed attack (Target Run: Flame Burst; Barrier Survival: nothing), so a phone player never presses a dead button.
- **Information on the buttons instead of in text lists.** SPELL shows the selected spell, BLINK / SPELL (DASH / VOLLEY) show a cooldown sweep, POTION / BOMB carry count badges; the keyboard-oriented consumables list and spell hint are hidden in touch mode.
- **Phone landscape (≤ 500 px tall).** The stage font cannot go below 16 px (Engine.ts, unchanged), so on a 390 px-tall phone the HUD alone filled the screen. The HUD subtree drops one step (0.85em ≈ 13.6 px); status + objectives sit top-left, compact slots + minimap top-right, pause / MAP top-centre (fixed 48 px targets), gauges under them. Title switches to logo-beside-menu; pause uses two columns.
- **Presets:** button size small / medium / large = 0.85 / 1 / 1.2 × (all positions are in em, so the whole cluster scales); left-handed mirrors sticks and buttons.
- **Taps:** non-hold buttons stay pressed until two animation frames and ≥ 90 ms have passed, so a tap cannot fall between two input polls on a slow phone (this happened in headless testing at ~15 FPS).

## v1.3 — Checkpoints and playtest records
- Reaching a zone checkpoint saves `{sector, zone, stats, consumables, savedAt}` into the existing `campaign.checkpoint` key; Continue rebuilds the World exactly like "Restart from Checkpoint". Fresh deploys and completed missions clear it; speedruns never write one (their timer would be meaningless).
- Playtest records are off by default and local only (`stats.playtest`, newest 50). Each record carries the build version so data from different balance versions can be separated.
- **Balance:** no human runs exist yet, so trial star thresholds (`TRIALS`) and `GOLEM` numbers are unchanged. Suggested procedure: collect ≥ 10 runs per trial from at least three players, set 2★ near the median and 3★ near the best quartile.

## v1.3 — Golem rumble at speed
- Metered live on the ambient bus (minus the rain / rift baseline): idle −29.1, top speed (9.1 m/s) −26.6, bracing −26.4 dB; the beam measures −20.2 dB, i.e. +6.4 dB over the full-speed rumble (target ≥ 4). The v1.2 estimate of +4–5 dB at speed was pessimistic; the measured rise is ~2.5 dB.

## v1.4 — Portrait phones
- The engine always renders 16:9 and Engine.ts is off-limits, so portrait cannot have a taller view. Instead of a rotate hint the screen becomes a handheld: the view pinned to the top (390×219 on a typical phone), a status strip under it (bars, objectives, subtitles — 15 px, readable), and the remaining ~60% of the height as stick area with the button cluster at the bottom-right (mirrored in left-handed mode). Menus leave the small view and fill the screen.
- Elements are moved, not duplicated: `applyPortrait()` re-parents the existing HUD nodes, so the Hud keeps updating them by reference and landscape is restored exactly on rotation.
- What stays in the view (slots, minimap, interaction prompt, banners, golem/boss gauges) is scaled to 0.7em so the world remains visible.

## v1.4 — Balance
- `notes/playtest/` is empty, so `TRIALS` thresholds and `GOLEM` numbers are unchanged. `npm run playtest:summary` suggests thresholds only with ≥ 10 completed runs from ≥ 3 players (2★ ≈ median, 3★ ≈ best quartile of completed runs).
