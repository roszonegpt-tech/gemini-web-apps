/* Crown of Dust - the Tally Basin (levels/territories.js). Level data is a script, not JSON, so the game runs from file://.
   x, y are map positions 0..1. mission = what you play when you attack it. prisoner = an outlaw held there. */
(function () {
'use strict';
const D = window.CD.Data;
D.terr = [
  {id: 'gulch', name: 'Dry Gulch', x: 0.50, y: 0.55, own: 'outlaw', kind: 'town', income: 12, biome: 'desert', home: true, txt: 'Home. Hold it or lose everything.'},
  /* Greenskin Corsairs: the sinking south-west */
  {id: 'ford', name: 'Rattlesnake Ford', x: 0.37, y: 0.68, own: 'corsair', kind: 'camp', mission: 'raid', tier: 1, income: 6, reward: 40, txt: 'A goblin toll camp on the only dry crossing.'},
  {id: 'mudhook', name: 'Mudhook Landing', x: 0.21, y: 0.66, own: 'corsair', kind: 'camp', mission: 'heist', tier: 2, income: 9, reward: 60, prisoner: 'trueno', txt: 'Three strongboxes of river tolls, lightly sat upon.'},
  {id: 'croak', name: 'Croak Hollow', x: 0.31, y: 0.86, own: 'corsair', kind: 'camp', mission: 'rescue', tier: 2, income: 7, reward: 50, prisoner: 'wade', txt: 'Colonel Wade is in a cage here, and cross about it.'},
  {id: 'wreck', name: "Snig's Wreck", x: 0.11, y: 0.86, own: 'corsair', kind: 'fort', mission: 'boss', tier: 4, income: 14, reward: 150, stronghold: true, prisoner: 'tobias', txt: 'Captain Snig holds court in a beached galleon.'},
  /* The Hollow Court: the dead woods of the north-west */
  {id: 'rise', name: "Hangman's Rise", x: 0.40, y: 0.36, own: 'hollow', kind: 'camp', mission: 'raid', tier: 2, income: 6, reward: 50, prisoner: 'aldous', txt: 'Bone guards drill under the gallows.'},
  {id: 'fen', name: 'Lantern Fen', x: 0.23, y: 0.34, own: 'hollow', kind: 'camp', mission: 'rescue', tier: 3, income: 8, reward: 60, prisoner: 'hazel', txt: 'Hazel Crane hexed the wrong court and got caged for it.'},
  {id: 'chapel', name: 'Bonechapel', x: 0.34, y: 0.15, own: 'hollow', kind: 'camp', mission: 'raid', tier: 3, income: 9, reward: 70, prisoner: 'maren', txt: 'Old Hagga raises the congregation nightly.'},
  {id: 'pale', name: 'The Pale Hall', x: 0.13, y: 0.13, own: 'hollow', kind: 'fort', mission: 'boss', tier: 5, income: 15, reward: 180, stronghold: true, prisoner: 'bramble', txt: 'Queen Vex and her gallows oaks.'},
  /* The Gilded Crown: the rich east */
  {id: 'toll', name: 'Tollgate Bridge', x: 0.64, y: 0.42, own: 'crown', kind: 'camp', mission: 'raid', tier: 2, income: 8, reward: 55, txt: 'The King taxes the road. The road resents it.'},
  {id: 'farms', name: 'Brandwick Farms', x: 0.76, y: 0.64, own: 'crown', kind: 'town', mission: 'heist', tier: 3, income: 12, reward: 80, prisoner: 'ezra', txt: "Lord Aldric's harvest money, boxed and waiting."},
  {id: 'garrison', name: 'Ironhoof Garrison', x: 0.78, y: 0.24, own: 'crown', kind: 'camp', mission: 'rescue', tier: 4, income: 9, reward: 80, prisoner: 'holloway', txt: 'Sheriff Holloway rots in the stockade.'},
  {id: 'gilt', name: 'Castle Gilt', x: 0.90, y: 0.44, own: 'crown', kind: 'fort', mission: 'boss', tier: 6, income: 20, reward: 300, stronghold: true, final: true, txt: 'King Odo the Gilded, and the thing he keeps in the yard.'}
];
D.links = [['gulch', 'ford'], ['gulch', 'rise'], ['gulch', 'toll'], ['ford', 'mudhook'], ['ford', 'croak'], ['mudhook', 'croak'], ['mudhook', 'wreck'], ['croak', 'wreck'],
  ['rise', 'fen'], ['rise', 'chapel'], ['fen', 'chapel'], ['fen', 'pale'], ['chapel', 'pale'], ['toll', 'farms'], ['toll', 'garrison'], ['farms', 'garrison'], ['farms', 'gilt'], ['garrison', 'gilt']];
D.terrById = {}; D.terr.forEach(t => { D.terrById[t.id] = t; });
D.neighbors = id => D.links.filter(l => l[0] === id || l[1] === id).map(l => l[0] === id ? l[1] : l[0]);
})();
