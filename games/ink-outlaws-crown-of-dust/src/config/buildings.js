/* Crown of Dust - Dry Gulch upgrades (src/config/buildings.js). cost[i] is the gold price of level i + 1. */
(function () {
'use strict';
const D = window.CD.Data;
D.bld = {
  saloon: {name: 'Saloon', art: 'house', v: 0, cost: [60, 110, 170, 240], txt: 'One more seat in the posse per level.'},
  smithy: {name: 'Smithy', art: 'house', v: 3, cost: [70, 130, 200], txt: 'Hero damage +12%, posse damage +10%, gun nests hit harder.'},
  doc: {name: "Doc's Tent", art: 'bigtent', v: 0, cost: [70, 130, 200], txt: 'Hero health +15% and one second wind per mission, per level.'},
  tower: {name: 'Watchtowers', art: 'tower', v: 1, cost: [50, 90, 140, 200], txt: 'A gun nest in every town you defend. Garrisons hold better on their own.'},
  powder: {name: 'Powder Store', art: 'keg', v: 0, cost: [40, 80, 130], txt: 'Start every mission with 4 more scrip to build with.'},
  stable: {name: 'Stable', art: 'wagon', v: 0, cost: [80, 120, 160, 210], txt: 'A mount for the hero: horse, then camel, yak and giant lizard.'}
};
D.mounts = [['horse', 'Ash the horse'], ['camel', 'Clementine the camel'], ['yak', 'Moss the yak'], ['lizard', 'Gila the lizard']];
})();
