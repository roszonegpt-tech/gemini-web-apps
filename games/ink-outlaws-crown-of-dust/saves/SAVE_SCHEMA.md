# Save format

One `localStorage` key holds the campaign: **`crown_of_dust_save_v1`**. It is written after every day and every camp purchase.
Settings live separately in `crown_of_dust_settings_v1` as `{sound, shake}`.

```
{
  v: 1,                        // format version; anything else is ignored on load
  at: <ms timestamp>,
  G: {
    day, gold, seed,           // seed + territory + day fix each mission's map
    hero: <unit id>,           // current captain (or "custom" for the lab look)
    weapons: [id, id],         // the two carried weapons
    armory: {<weapon id>: 1},  // weapons owned
    mount: null | "horse" | "camel" | "yak" | "lizard",
    roster: [<unit id>],       // the gang, not counting the captain
    posse: [<unit id>],        // the ones who ride along (at most 2 + saloon level)
    freed: {<unit id>: 1},     // prisoners already rescued
    bld: {saloon, smithy, doc, tower, powder, stable},   // levels
    own: {<territory id>: "outlaw" | "corsair" | "hollow" | "crown"},
    at: <territory id>,        // where the captain stands on the map
    log: [string],             // newest first, at most 30
    won, wonOnce, kills, missions, tut, seen: {<unit id>: 1}
  }
}
```

The captain called "custom" is rebuilt from the Chunk Lab's own key, `chunklab_outlaws_look_v1`. That key is validated against the lab schema
(`CD.Save.labLook`), so a bad value never reaches the painter. Beast and blob builds are changed to a regular build so the
captain can hold a weapon. See `example-save.json`.
