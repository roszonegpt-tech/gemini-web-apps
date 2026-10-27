# TODO

## Done in v1.2.0-beta
- [x] Swept-circle golem collision response (corridor edges, inside corner, spires, gates) — 0 clipping frames at dash speed.
- [x] Golem engine rumble tied to speed/brace, beam charge-up + ignition + heat warning + overheat hiss, landing stomps.
- [x] Register v1.1 procedural assets in `assets_manifest.json` (additive, 24 IDs).
- [x] Audio balance pass (measured: magic vs. gunfire vs. music; rain and rift beds) + `npm run test:audio`.

## Next build (v1.3.0-beta) — see `prompts/next-build.md`
- [ ] Engine-rumble level at full speed / while bracing (only idle is measured — expose speed to the meter or meter live).
- [ ] Trial star-threshold tuning from human play data; golem beam / AA balance from playtests.
- [ ] Remove the superseded `challengeScreen` from `src/ui/Screens.ts` (needs Screens.ts in scope).

## Verification still owed (needs real hardware / a person)
- [ ] FPS on real hardware: desktop 1080p, iPad, iPhone, Android (target 60 FPS); confirm auto-quality steps down below 45 FPS.
- [ ] Manual test in Firefox 88+, Safari 14.1+ (macOS + iOS), Edge.
- [ ] Physical touch + real gamepad pass (on foot and during golem flight: stick drift, R2 beam, L2 brace, A dash).
- [ ] Listen to the mix on desktop speakers and phone speakers (the v1.2 numbers are objective proxies only).
- [ ] Human difficulty pass: campaign sectors, golem segment, trial star thresholds.

## Nice to have
- [ ] More radio-chatter and Lyra guidance lines.
- [ ] Optional channelled "Ray of Disintegration" spell.
- [ ] Persist mid-mission checkpoints across page reloads (`campaign.checkpoint` key exists, currently always null).
- [ ] Settings toggle for golem impact camera bump separate from Reduced Motion.

## Blockers
- None in code. Real-device / by-ear verification cannot be performed from the cloud container.
