# TODO

## Done in v1.3.0-beta
- [x] Context-aware mobile touch controls (golem / trial rules), spell label, cooldown sweeps, badges, MAP button.
- [x] Touch size + left-handed layout settings; fullscreen toggle; quick taps no longer lost on slow devices.
- [x] Phone-landscape layout (title, menus, pause, touch-mode HUD).
- [x] Continue from checkpoint after a page reload.
- [x] Opt-in local playtest records (trials + golem segment) with copy / export / clear.
- [x] Golem engine rumble metered live at top speed (beam leads by 6.4 dB).
- [x] Removed the superseded `challengeScreen`; in-page reset confirmation.

## Done in v1.4.0-beta
- [x] Portrait-phone layout (view on top, status strip + controls below, full-screen menus).
- [x] Export panel with Copy / Download (works inside the artifact).
- [x] Objective labels avoid HUD boxes.
- [x] Playtest summary tool + `notes/playtest/` drop folder (no data yet → balance unchanged).

## Next build (v1.5.0-beta) — see `prompts/next-build.md`
- [ ] Balance pass once `notes/playtest/` has ≥ 10 completed runs per trial from ≥ 3 players.
- [ ] Portrait: optional larger view (zoomed camera / taller 4:3 crop) — needs an Engine.ts change.
- [ ] Installable PWA (manifest + offline service worker) for a home-screen icon and full-screen iPhone play.

## Verification still owed (needs real hardware / a person)
- [ ] FPS on real hardware: desktop 1080p, iPad, iPhone, Android (target 60 FPS); confirm auto-quality steps down below 45 FPS.
- [ ] Manual test in Firefox 88+, Safari 14.1+ (macOS + iOS), Edge.
- [ ] Physical touch pass of the v1.3 controls (thumb reach, button size presets, left-handed layout) and a real gamepad in golem flight.
- [ ] Listen to the mix on desktop speakers and phone speakers (v1.2/v1.3 numbers are objective proxies only).
- [ ] Human difficulty pass: campaign sectors, golem segment, trial star thresholds (use the playtest records).

## Nice to have
- [ ] More radio-chatter and Lyra guidance lines.
- [ ] Optional channelled "Ray of Disintegration" spell.
- [ ] Settings toggle for golem impact camera bump separate from Reduced Motion.

## Blockers
- None in code. Real-device / by-ear verification cannot be performed from the cloud container.
