# Testing

## How to run
```bash
npm run typecheck                 # strict TypeScript, 0 errors expected
npm run test:logic                # 12 node logic tests (no browser)
npm run test:smoke                # headless Chromium end-to-end (needs Playwright: npm i -D playwright)
SMOKE_TARGET=dist npm run test:smoke   # same, against the standalone dist/index.html
npm run test:audio                # v1.2 audio level meter + mix targets (exits 1 if a target fails)
npm run playtest:summary          # v1.4 summary of exported playtest records in notes/playtest/
AUDIO_TARGET=dist/releases/riftbound-v1.1.0-beta.html npm run test:audio   # meter an archived build
```
Screenshots from the smoke run land in `tests/output/` (git-ignored).

## Results — v1.4.0-beta (2026-10-27, Linux, headless Chromium + SwiftShader)

### Verified (automated)
| Check | How | Result |
|---|---|---|
| Typecheck + build (`dist/releases/riftbound-v1.4.0-beta.html`) | `tsc`, `npm run build` | ✅ |
| Logic tests | `tests/logic.test.mjs` | ✅ 12/12 |
| Full regression incl. v1.2/v1.3 steps + two v1.4 steps | `tests/smoke.mjs` (folder **and** `SMOKE_TARGET=dist`) | ✅ 24/24 each |
| Portrait 390×844: view at the top (0–219 px), pad below it, status bars and objectives under the view, touch controls in the pad within the screen, no horizontal scroll, pause menu full-screen; switching to landscape restores the v1.3 layout | smoke + probe (emulated touch, left-stick drag moves the mage) + screenshots of title, game, pause, export | ✅ |
| Export panel: playtest JSON in a selectable text box, Back returns to Settings | smoke | ✅ |
| Playtest summary: no files → "balance stays"; sample file → quartiles + "not enough data" | manual run | ✅ |
| Audio mix targets (incl. live golem rumble at top speed) | `npm run test:audio` | ✅ 12/12 |
| Golem flow, collision stress, trials I–III | probes | ✅ 14/14 · 0 bad frames / 11 478 |

### Not verified (v1.4) — needs real hardware / a person
- Portrait and landscape touch play on physical phones (thumb reach, safe areas / notches, iOS Safari toolbars resizing the viewport).
- Copy-to-clipboard inside the real claude.ai app on iOS / Android.
- No playtest records were collected, so no balance change; everything under v1.2 / v1.3 "Not verified" still applies.

## Results — v1.3.0-beta (2026-10-27, Linux, headless Chromium + SwiftShader)

### Verified (automated)
| Check | How | Result |
|---|---|---|
| Typecheck + build (`dist/releases/riftbound-v1.3.0-beta.html`) | `tsc`, `npm run build` | ✅ |
| Logic tests incl. new save keys, checkpoint sanitizing, playtest opt-in + cap | `tests/logic.test.mjs` | ✅ 12/12 |
| Full regression + v1.2 golem steps + five new v1.3 steps | `tests/smoke.mjs` (folder **and** `SMOKE_TARGET=dist`) | ✅ 22/22 each |
| Touch: on foot (FLAME label, BOMB/POTION), golem (DASH/BRACE/VOLLEY/LAND, potion/bomb/cycle hidden), Barrier Survival (SPELL/BOMB/POTION/CYCLE hidden, aim stick inert), Target Run (aim stick casts Flame Burst), left-handed + large preset | smoke + probe (emulated touch screen 844×390, `page.touchscreen.tap` on BLINK) | ✅ |
| Phone-landscape title fits (last menu button above the footer) | smoke at 844×390 + screenshots of title, foot, golem, trial, pause | ✅ |
| Checkpoint saved at zone 2 → page reload → title shows "Continue · Sector 1 · checkpoint 2" → resumes zone 2 with stats kept; fresh deploy clears it | smoke | ✅ |
| Playtest records: nothing recorded while off; trial quit + golem segment recorded when on | smoke | ✅ |
| Reset Save Data needs a second tap and then resets | smoke | ✅ |
| Golem flow, collision stress (0 bad frames), trials I–III | probes | ✅ golem flow 7/7 · collision 0 bad frames / 11 478 · trials 7/7 |
| Audio mix targets incl. live golem rumble at 9.1 m/s (beam +6.4 dB over it) | `npm run test:audio` | ✅ 12/12 |

Found and fixed during this pass: the first full run failed "casting did not fire" in sectors 2–4. Hiding the touch layer released its aim action through `Input.setVirtual()`, which also marks the device as touch, so a mouse session switched into touch mode and the aim-stick zone covered the mouse. Releases now happen only for actions that are actually pressed; the full suite then passed. In the emulated-touch probe, one of four runs of a real `touchscreen.tap` on BLINK did not register (the other three did, and a traced tap showed the press held until the game polled it); not reproduced since — watch for it on devices.

### Not verified (v1.3) — needs real hardware / a person
- The new touch controls on physical phones and tablets (thumb reach, button sizes, left-handed layout, haptics).
- Fullscreen + landscape lock on real Android Chrome; iOS Safari has no fullscreen API.
- Everything listed under v1.2 "Not verified" below still applies (real-GPU FPS, Firefox/Safari/Edge, gamepad, listening to the mix, human balance).

## Results — v1.2.0-beta (2026-10-27, Linux, headless Chromium + SwiftShader)

### Verified (automated)
| Check | How | Result |
|---|---|---|
| Typecheck + build (bundle 868 KB, standalone 890 KB, `dist/releases/riftbound-v1.2.0-beta.html`) | `tsc`, `npm run build` | ✅ |
| Logic tests incl. new manifest consistency test (unique IDs, convention, 19 v1.1 IDs, every recipe registered) | `tests/logic.test.mjs` | ✅ 10/10 |
| Full regression: all sectors, victory flow, ward 80%, pause/checkpoint, boss → ending → results, golem install + mount, trials start, touch layout | `tests/smoke.mjs` (folder build **and** `SMOKE_TARGET=dist`) | ✅ 17/17 each |
| Golem never inside tall geometry or outside the corridor at dash speed: edges, inside corner, rift-wall and barrier gates, 120 seeded random dashes | smoke step | ✅ 0 bad frames |
| Same, exhaustive: 345 runs / 11 478 frames incl. every reachable FLY collider from 8 directions + 300 random dashes | probe (v1.1 build for comparison: 21 grazing frames, max 0.07 m) | ✅ 0 bad frames |
| Impact response: dash into the north edge bounces back (vz < 0), chips 5–25 armour (non-lethal), camera trauma 0.31 | smoke step + probe | ✅ |
| Golem recipes registered; dismount on solid ground → landing → stomp (landing flag clears, golem settles) | smoke step | ✅ |
| v1.1 golem flow still works with the beam charge-up: mount, fly over the fence, beam damages AA tower (300 → 187), course spawns, AA objective completes, dismount | probe | ✅ |
| Trials I–III regression with the v1.2 mix (loadouts, barrage, 5 waves → results, records, star → shard conversion) | probe | ✅ 7/7 |
| Audio mix targets T1–T5 (casts over rifle fire on full-range + phone proxy, rain under bolt, music vs ambient bed, golem beam / lock warning vs rumble, no hot peaks) | `npm run test:audio` (v1.1 build: 4/11) | ✅ 11/11 |
| No console errors / no recovered runtime errors in any of the above | all | ✅ |

### Not verified (v1.2) — could not be performed in the cloud container
These items from the v1.2 prompt need real hardware or a person and remain open (see `TODO.md`):
- **FPS at 1080p** on a desktop GPU, iPad and iPhone, and auto-quality behaviour on them. Only headless SwiftShader software rendering was available (14–17 FPS there; not representative).
- **Firefox, Safari 14.1+ (macOS + iOS), Edge** manual passes — only Chromium is automated here.
- **Real gamepad during golem flight** (stick drift, R2 beam, L2 brace, A dash) and **physical touch** play.
- **Audio by ear** on desktop speakers and phone speakers — v1.2 balanced the mix against objective, approximately K-weighted measurements only.
- **Human balance pass** of Challenge Trial star thresholds, golem beam/AA balance, impact self-damage and the 0.15 s beam charge-up.

## Results — v1.1.0-beta (2026-10-27, Linux, headless Chromium + SwiftShader)

### Verified (automated)
| Check | How | Result |
|---|---|---|
| Typecheck + build (bundle 862 KB, standalone 884 KB) | `tsc`, `npm run build` | ✅ |
| Logic tests | `tests/logic.test.mjs` | ✅ 9/9 |
| Full v1.0 regression (all sectors, victory flow, ward 80%, pause/checkpoint, boss → ending → results, touch layout) | `tests/smoke.mjs` | ✅ 13/13 |
| Golem segment installed only in Sector 2 (4 AA towers, AA objective, shrine) and mounting sets camera/target | smoke | ✅ |
| Trials menu reachable from the title; all three trials start | smoke | ✅ |
| Shrine prompt → hold E mounts; WASD flight with drift crosses the fence into the flooded strip; flight bounds hold | probe | ✅ |
| Chest beam damages AA tower (300 → 48 HP in ~3 s) and heat builds (0.92); obstacles spawn (mines, 4 pylons, 3 emplacements) | probe | ✅ |
| Destroying all AA towers completes the objective; dismount on solid ground restores the mage | probe | ✅ |
| Trial I: Flame-Burst-only loadout, targets immune to non-fire damage, 25 targets → results, record saved, 3★ → +145 shards | probe | ✅ |
| Trial II: spells/potions/bombs locked, minigun + mortar barrage active, survive 3:00 → results + record | probe (time fast-forwarded, god mode) | ✅ |
| Trial III: waves 1→5 progress (dropships, drones, helicopters) → results + record | probe (dev kill-all between waves) | ✅ |
| No console errors / no recovered runtime errors in any of the above | all | ✅ |

### Not verified (v1.1)
- Golem flight feel, beam/AA balance and trial star thresholds with a human player.
- Gamepad during golem flight (only the stubbed Gamepad API was exercised, on foot).
- Everything listed under v1.0 "Not verified" below still applies.

## Results — v1.0.0-gold (2026-10-27, Linux, headless Chromium + SwiftShader)

### Verified (automated)
| Check | How | Result |
|---|---|---|
| TypeScript strict typecheck | `tsc --noEmit` | ✅ 0 errors |
| Build (bundle + standalone + versioned copy) | `npm run build` | ✅ 819 KB bundle, 841 KB standalone |
| Collision push-out, raycasts, low-cover rule, LOS, A*, nav updates, maths, save defaults & migration | `tests/logic.test.mjs` | ✅ 9/9 |
| Title screen renders, no console errors | smoke | ✅ |
| Keyboard menu navigation (arrows/Enter/Esc) → Sanctum | smoke | ✅ |
| Settings, campaign map, briefing screens | smoke + screenshots | ✅ |
| All 4 sectors load; moving, Arcane Bolt, Flame Burst, Blink, Ward, Frost Bomb execute | smoke | ✅ |
| Sector 1 objectives → gates → checkpoints → Rift Gate → results; save updated (completed, unlocked, shards, spell unlock) | smoke (dev "complete zone" + teleport) | ✅ |
| Ward absorbs exactly 80% of bullet damage, gauge drains; unwarded hit full; save in LocalStorage | smoke | ✅ |
| Pause menu, Restart from Checkpoint | smoke | ✅ |
| Boss: intro cinematic, hold-Space skip, tank destroyed → Vance ejects → ending story → results | smoke | ✅ |
| Boss phases: shielded → assault (pylons down) → shield reboot at 50% + reinforcements → overdrive; no runtime errors | probe script | ✅ |
| Trooper AI: alert, choose protective cover, duck/peek/burst, relocate; grenade thrown at hiding mage ("Frag out!") | probe script (state dumps + screenshots) | ✅ |
| Mana well channel (hold E) restores mana; turret enchant; C4 sabotage destroys depot; catalyst awaken + defence waves + ally golem | probe script | ✅ |
| Gamepad (stubbed `navigator.getGamepads`): D-pad menu focus, left-stick move, R2 cast | probe script | ✅ |
| Touch layout renders (sticks, buttons, relocated minimap) | smoke screenshot | ✅ |
| Standalone `dist/index.html` plays sector 1 to victory | `SMOKE_TARGET=dist` | ✅ |

### Not verified (needs real hardware / manual testing)
- 60 FPS at 1080p on real GPUs (desktop, iPad, iPhone, Android) — headless software rendering only.
- Firefox, Safari (macOS/iOS) and Edge — only Chromium was automated.
- Physical touch screens and real gamepads (vibration, analog feel).
- Audio output quality / mix balance (synthesis runs, but nothing was listened to).
- Offline narration voices (depends on locally installed system voices).
- Full unassisted human playthrough difficulty balance of all four sectors.
