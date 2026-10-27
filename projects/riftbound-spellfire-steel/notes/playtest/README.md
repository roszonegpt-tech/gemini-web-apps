# Playtest records

Drop exported playtest files here (Settings → Record playtest runs → play → **Export records** or **Copy records**
pasted into a `.json` file). One file per player/session is easiest, e.g. `2026-11-02-alex-phone.json`.

Then run:

```bash
npm run playtest:summary      # node tests/playtest-summary.mjs
```

It prints, per trial and for the golem segment, the number of runs, completion rate and the median / quartiles of
time and damage, and suggests star thresholds (2★ ≈ median of completed runs, 3★ ≈ best quartile) next to the
current ones in `src/scenes/ChallengeScene.ts → gradeTrial()`.

Records contain only game metrics (times, damage, stars, counts, build version) — no names or device data. Remove a
file to drop that player's data. As of v1.4.0-beta no files have been collected, so the balance is unchanged.
