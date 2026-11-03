# Known issues
- No human playtest yet; difficulty/economy numbers come from scripted bots (`tests/campaign-balance.js`).
- Audio untested by ear; real touch device, iOS Safari and physical gamepads untested (only emulation).
- Four building exteriors lack dedicated whole-building sprites (painter-composed from art parts).
- Tutorial skip marks Arrival objectives complete (design choice, see TODO 5).
- Phone portrait layout leaves the game canvas small.
- A transient second animation-frame request was observed once at the very start of an intro replay by SCREENS (not reproduced in the 30× leak test); `MM.loop.stats()` counts every rAF.
- Slow camera zooms in cinematics show slight pixel crawl (reduced motion removes it).
- Performance numbers are headless software-rendering (medium ≈ 9.8 ms/frame under effect stress); not measured on real GPUs.
