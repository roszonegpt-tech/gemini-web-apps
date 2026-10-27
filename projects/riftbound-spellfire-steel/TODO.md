# TODO

## Next build (v1.2.0-beta) — see `prompts/next-build.md`
- [ ] Swept-circle golem collision response (corridor edges, spires, gates) without clipping at dash speed.
- [ ] Golem engine rumble tied to speed/brace, beam charge + overheat audio (via `registerRecipe`).
- [ ] Register v1.1 procedural assets in `assets_manifest.json` (additive).
- [ ] Audio balance pass (magic vs. gunfire vs. music; rain loop level).

## Verification still owed
- [ ] FPS on real hardware: desktop 1080p, iPad, iPhone, Android (target 60 FPS).
- [ ] Manual test in Firefox 88+, Safari 14.1+ (macOS + iOS), Edge.
- [ ] Physical touch + real gamepad pass (on foot and during golem flight).
- [ ] Human difficulty pass: campaign sectors, golem segment, trial star thresholds.

## Nice to have
- [ ] Remove the superseded `challengeScreen` from `src/ui/Screens.ts`.
- [ ] More radio-chatter and Lyra guidance lines.
- [ ] Optional channelled "Ray of Disintegration" spell.
- [ ] Persist mid-mission checkpoints across page reloads (`campaign.checkpoint` key exists, currently always null).

## Blockers
- None.
