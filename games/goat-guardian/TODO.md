# TODO

All 20 items from the feature list were added in v0.7.0. What remains is playtesting and tuning:

- [ ] Playtest balance: hawk dive timing, fox speed, Great Wolf HP, how fast brambles tangle sheep, upgrade costs.
- [ ] Test real gamepads (Xbox / PlayStation standard mapping) in game, in the editor and in the lobby.
- [ ] Test touch on iPhone / iPad (ability button, editor painting, CPU label tap).
- [ ] Listen-test the music loops and the new sound effects; tune the mix.
- [ ] Check night lanterns and fog on long routes for readability.
- [ ] Install the GitHub Pages build on a phone and test offline play.
- [ ] Test 6-digit rooms through the real PeerJS cloud broker across two real networks (and mobile data). If the free broker proves unreliable, run your own PeerServer (see README) and build with `PEER_URL`.
- [ ] Art: check the new goat side view (level back, neck, longer legs) on a real phone. Possible next steps: an ear that sticks out backwards and a beard like the reference goats, the same neck fix for the three-quarter (SE/NE) goat views, and outfits on the ram frames (they never lined up).
- [ ] Decide whether to delete `tools/relay/` and `tests/relay_core.js` (the custom relay is no longer used).
- [ ] Online: client-side prediction, guest reconnect, spectators.
- [ ] Demo: add a Steam/itch link via `FULL_URL`, and decide whether to limit STYLE in the demo.
- [ ] Optional: more editor map sizes, several custom map slots.
- [ ] Balance the farm dog skills (Komondor hiding and the Pyrenees roar may be strong; the Corgi push may be weak).
- [ ] STYLE: per-breed coat memory (one dog look is shared across breeds; the coat index wraps per breed).
- [ ] Optional: goat breed perks (breeds currently change the look only), and goat idle poses (graze, lie).
