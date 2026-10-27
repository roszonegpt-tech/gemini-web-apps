# Testing

## How to run
```bash
npm run typecheck                 # strict TypeScript, 0 errors expected
npm run test:logic                # 9 node logic tests (no browser)
npm run test:smoke                # headless Chromium end-to-end (needs Playwright: npm i -D playwright)
SMOKE_TARGET=dist npm run test:smoke   # same, against the standalone dist/index.html
```
Screenshots from the smoke run land in `tests/output/` (git-ignored).

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
