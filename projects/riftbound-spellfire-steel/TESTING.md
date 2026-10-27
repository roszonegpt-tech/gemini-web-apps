# Testing

## How to run
```bash
npm run typecheck                 # strict TypeScript, 0 errors expected
npm run test:logic                # 9 node logic tests (no browser)
npm run test:smoke                # headless Chromium end-to-end (needs Playwright: npm i -D playwright)
SMOKE_TARGET=dist npm run test:smoke   # same, against the standalone dist/index.html
```
Screenshots from the smoke run land in `tests/output/` (git-ignored).

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
