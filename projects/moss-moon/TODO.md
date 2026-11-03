# TODO / next steps
1. **Human playtest** of the full campaign (balance and 45–90 min length are estimated from a bot only); tune boss HP/economy.
2. **Real-device checks**: iPhone/iPad Safari (audio unlock, joystick, safe areas), an actual gamepad, Windows browsers.
3. **Audio**: audition `tests/audio-demo.html` by ear; mix levels were only checked by peak/clipping tests.
4. **Art leftovers (ART2 was cut short by rate limits)**: whole-building sprites for cottage/elder/herbalist/shop (`MM.buildings.missingSprites()`; exteriors are currently composed by the world painter from sprite parts); verify/finish environment details, extra logo elements, Frost Wyrm south windup, flagstone checker, boss north-facing/hurt frames; extra enemy/NPC variants.
5. Skipping the tutorial auto-completes the Arrival chain (plant→harvest→brew) — consider keeping it as story objectives when skipped.
6. Tutorial: plant/water prompt next to the practice plot (see `notes/REQUESTS.md` WORLD), optional deferral of real-world creation until after the tutorial.
7. Co-op (baseline) is intentionally not exposed in the release UI; stabilise or remove.
8. Optional: replace in-engine cinematics with generated WebM/MP4 (`assets/video/README.md`; fallback to engine scenes is automatic).
9. Phone portrait: the 8:5 stage is small with HUD around it — consider a taller portrait layout.
