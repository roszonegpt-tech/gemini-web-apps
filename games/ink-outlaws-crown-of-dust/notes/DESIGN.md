# Design notes: Crown of Dust

## Loop
Map (choose a target) → briefing → mission (real time) → results → overnight: income, maybe a raid → map.

## Campaign
- 13 territories (`levels/territories.js`). Only neighbours of your land can be attacked. Castle Gilt opens once both lesser
  strongholds fall. Taking it wins the game; free play continues after.
- Income = the sum of owned territories' `income`. Bounty = the territory's `reward` + strongboxes + up to 25 for unspent scrip.
- Raids start on day 3, with chance `min(0.6, 0.3 + day × 0.012)`, from a faction bordering your land, weighted toward factions whose stronghold
  still stands. You can defend in person (a Defend mission) or trust the garrison (odds `0.3 + 0.13 × towers + 0.04 × gang`, home excluded).
  Losing Dry Gulch is game over, with a retry of that defence.
- Prisoners (`prisoner` on a territory) are freed by breaking their cage; they join the gang. 9 outlaws can only be won this way.

## Missions
| Type | Goal | Notes |
|---|---|---|
| Raid | Burn every tent inside the palisade, then the standard | the standard is LOCKED while camp tents stand |
| Rescue | Break the cage, walk the prisoner to the start ring | the prisoner takes 40% damage; the camp is alerted |
| Heist | 3 strongboxes, then back to the wagon | each box triggers reinforcements |
| Defend | survive 3–5 waves; the hall must stand | stakes, militia and watchtower gun nests |
| Stronghold | kill the boss (plus the Tyrant at Castle Gilt) | Snig and Odo mount up at half health |

Difficulty: tier 1–6 scales enemy HP (+16% per tier) and damage (+10% per tier) and the roster mix (grunts → mid → heavy → elite).
Spawner tents have a cap and a finite reserve.

## Units
One record type for everyone (`src/entities/unit.js`). AI kinds: melee, ranged (kites when close), caster (every third cast is a
telegraphed ground blast), charger (wind-up line, dash), beast (bites), blob (hops, some split), mimic (dormant chest), pet.
Posse orders: Follow (formation behind the captain), Hold (a 110-unit leash), Charge (a point on the ground), Focus (one target).

## Ideas not done yet
See `../TODO.md`.
