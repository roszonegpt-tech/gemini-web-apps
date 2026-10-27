# TODO

## Next build (v1.1.0-beta) — see `prompts/next-build.md`
- [ ] Arcane Golem mount + flight trench run in Sector 2 (flooded strip z≈63–80 is reserved).
- [ ] Three Challenge Trials (Target Run, Barrier Survival, Rift Onslaught) with 1–3 star grading.
- [ ] Challenge stars → Crystal Shards integration.

## Verification still owed (from v1.0)
- [ ] Measure FPS on real hardware: desktop 1080p, iPad, iPhone, Android (target 60 FPS).
- [ ] Manual test in Firefox 88+, Safari 14.1+ (macOS + iOS), Edge.
- [ ] Physical touch + real gamepad pass (rumble, deadzones).
- [ ] Listen-through audio balance: magic vs. gunfire, music vs. SFX, rain loop level.
- [ ] Human difficulty pass on all four sectors (enemy damage / spread multipliers live in `World.difficulty*`).

## Nice to have
- [ ] Voice line variety for radio chatter; more Lyra guidance lines.
- [ ] Optional "Ray of Disintegration" channelled spell (prompt mentions channelled-spell slowdown; the held Arcane Bolt stream implements the slowdown for now).
- [ ] Persist mid-mission checkpoint across page reloads (`campaign.checkpoint` key already exists, currently always null).

## Blockers
- None.
