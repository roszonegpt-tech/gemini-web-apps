/* Crown of Dust - cast and stats (src/config/units.js).
   Looks are plain lab look objects (the same schema the Chunk Lab customizer edits), so any look copied out of the lab
   can be pasted here. All 63 lab presets are used; the rest are new looks built from the same schema. */
(function () {
'use strict';
const CD = window.CD, D = CD.Data = CD.Data || {}, INK = window.INK, K = INK.kit;
/* same defaults as the lab's own L() helper */
const BASE = {build: 'regular', sex: 'm', head: 'human', hat: 'flat', hair: 'short', ears: 'round', horns: false, facial: 'none', cover: 'none', scar: false, smoke: false, outer: 'duster', neck: 'bandana', sash: 'none', back: 'none', offhand: 'none', peg: false, mount: 'none', halo: 'none', cape: false, gunner: false, gloves: false, crow: false,
  skin: '#e2a08f', hairc: '#6b5a4c', eyes: '#6f93a8', hatc: '#4b3d3f', coat: '#8c7a58', shirt: '#d9d0bb', scarf: '#a8474a', pants: '#1d181d', accent: '#d9a520', glove: '#4a3f44', weapon: 'revolver', expr: 'calm'};
const L = o => Object.assign({}, BASE, o);
const looks = D.looks = {};
INK.PRESETS.forEach(p => { looks[p.id] = p.look; });
const vary = (id, o) => Object.assign({}, looks[id], o);
D.L = L;

/* ---------- new looks made with the lab schema ---------- */
Object.assign(looks, {
  /* Greenskin Corsairs */
  gobslinger: L({build: 'small', head: 'goblin', hat: 'band', hair: 'bald', skin: '#8aa83e', eyes: '#f4efe2', outer: 'vest', coat: '#6a4a34', shirt: '#7a6a48', neck: 'bandana', scarf: '#e0782c', accent: '#c9a14a', pants: '#3a3a30', back: 'quiver', weapon: 'bow', expr: 'grin'}),
  gobgun: L({build: 'small', head: 'goblin', hat: 'tricorn', hatc: '#4a3a30', hair: 'bald', skin: '#7f9a3a', eyes: '#f4efe2', outer: 'duster', coat: '#5a6a3a', shirt: '#4a3a30', neck: 'none', accent: '#e0a63c', pants: '#4a3a30', sash: 'bandolier', weapon: 'flintlock', expr: 'shout'}),
  gobshaman: L({build: 'small', head: 'goblin', hat: 'skullhelm', hair: 'bald', skin: '#6f9a5a', eyes: '#e8f03a', outer: 'feather', coat: '#7a4a6a', shirt: '#4a3a30', neck: 'fur', scarf: '#c9b98f', accent: '#e0782c', pants: '#3a3a30', back: 'maw', weapon: 'tome', expr: 'grin'}),
  gobbrute: L({build: 'brute', head: 'goblin', hat: 'none', hair: 'bald', skin: '#7a9a44', eyes: '#f0d24a', outer: 'bare', sash: 'chains', scarf: '#6f6a66', neck: 'none', accent: '#e0782c', pants: '#5a4a34', gloves: true, glove: '#4a3a30', weapon: 'hammer', expr: 'angry'}),
  gobrider: L({build: 'small', head: 'goblin', mount: 'lizard', hat: 'helm', hatc: '#8a8a7a', hair: 'bald', skin: '#9ab84a', eyes: '#f4efe2', outer: 'quilted', coat: '#6a4a34', shirt: '#5a5f48', neck: 'none', accent: '#e0782c', pants: '#3a3a30', weapon: 'lance', expr: 'shout'}),
  snigrider: vary('snig', {mount: 'lizard', peg: false}),
  redslime: L({build: 'slime', skin: '#d0682c', eyes: '#5a2414', coat: '#f0a05a', accent: '#a8432c', weapon: 'fists'}),
  bogpup: L({build: 'pup', skin: '#5a7a6a', eyes: '#f0782c', accent: '#e0782c', coat: '#9ab89a', weapon: 'fists'}),
  /* Hollow Court */
  boneman: L({build: 'regular', head: 'skull', hat: 'helm', hatc: '#6a6a70', eyes: '#4fe07a', outer: 'wraps', coat: '#7a7468', shirt: '#5a564c', neck: 'none', accent: '#6fb08a', pants: '#3a3a36', offhand: 'shield', gloves: true, glove: '#4a4046', weapon: 'sword'}),
  bonegun: L({build: 'slim', head: 'skull', hat: 'kepi', hatc: '#3a4440', eyes: '#4fe07a', outer: 'duster', coat: '#4a5a54', shirt: '#3a4a46', neck: 'tie', accent: '#6fb08a', pants: '#263430', sash: 'bandolier', gloves: true, glove: '#4a4046', weapon: 'rifle'}),
  reaper: L({build: 'tall', head: 'skull', hat: 'hood', hatc: '#2e2a34', eyes: '#e0435a', outer: 'cloak', coat: '#34303e', shirt: '#2a2630', neck: 'none', accent: '#8a8478', pants: '#1d181d', gloves: true, glove: '#e6dcc3', weapon: 'scythe', expr: 'angry'}),
  wisp: L({build: 'small', head: 'lantern', hat: 'none', outer: 'cloak', coat: '#5a4f72', accent: '#6fd08a', eyes: '#6fe07a', neck: 'scarf', scarf: '#34303e', shirt: '#3a3a44', skin: '#4a4a58', gloves: true, glove: '#34303e', weapon: 'magic'}),
  hound: L({build: 'pup', skin: '#3a363c', eyes: '#e0322c', accent: '#5a4f72', coat: '#6a6470', weapon: 'fists'}),
  blackcat: L({build: 'cat', skin: '#2e2a30', coat: '#4a4450', accent: '#6fd08a', eyes: '#9fe03a', weapon: 'fists'}),
  ashoak: L({build: 'tree', skin: '#6a625a', eyes: '#e0435a', accent: '#5a4f72', coat: '#a89a8a', weapon: 'fists'}),
  /* Gilded Crown */
  footman: L({build: 'regular', hat: 'helm', hatc: '#8a9098', hair: 'short', outer: 'tabard', coat: '#3f5a70', shirt: '#8a9098', scarf: '#d9a520', neck: 'none', accent: '#d9a520', pants: '#2c3a46', offhand: 'shield', gloves: true, glove: '#6a7078', weapon: 'sword', expr: 'angry'}),
  crossbow: L({build: 'slim', hat: 'helm', hatc: '#8a9098', hair: 'short', hairc: '#8a5a34', outer: 'quilted', coat: '#3f5a70', shirt: '#4a6478', neck: 'none', accent: '#d9a520', pants: '#2c3a46', back: 'quiver', weapon: 'bow'}),
  halberd: L({build: 'tall', hat: 'galea', hatc: '#7a8088', hair: 'short', outer: 'armor', coat: '#8a9098', shirt: '#3f5a70', neck: 'none', accent: '#d9a520', pants: '#3f5a70', gloves: true, glove: '#6a7078', skin: '#8a9098', weapon: 'spear', expr: 'angry'}),
  musketeer: L({build: 'regular', hat: 'kepi', hatc: '#3f5a70', hair: 'short', hairc: '#c9a23a', facial: 'handlebar', outer: 'duster', coat: '#3f5a70', shirt: '#d9d2c2', neck: 'tie', accent: '#d9a520', pants: '#d9d2c2', sash: 'bandolier', weapon: 'rifle'}),
  lancer: L({build: 'regular', mount: 'horse', hat: 'galea', hatc: '#8a9098', hair: 'short', outer: 'armor', coat: '#9aa0a8', shirt: '#3f5a70', neck: 'none', accent: '#d9a520', pants: '#3f5a70', gloves: true, glove: '#6a7078', skin: '#9aa0a8', cape: true, scarf: '#3f5a70', weapon: 'lance', expr: 'angry'}),
  cleric: L({build: 'stocky', hat: 'hood', hatc: '#d9d2c2', hair: 'bald', facial: 'full', hairc: '#d9d2c2', outer: 'tabard', coat: '#d9d2c2', shirt: '#b9b4a8', scarf: '#d9a520', neck: 'none', accent: '#d9a520', halo: 'ring', pants: '#6a5a50', weapon: 'tome'}),
  odorider: vary('odo', {mount: 'horse'}),
  /* townsfolk and bandits */
  militia: L({build: 'regular', hat: 'straw', hatc: '#c9a85a', hair: 'short', outer: 'overalls', coat: '#4f6a7a', shirt: '#d9d0bb', neck: 'bandana', pants: '#4f6a7a', weapon: 'pitchfork', expr: 'angry'}),
  rifleman: L({build: 'slim', sex: 'f', hat: 'wide', hatc: '#6a4a3a', hair: 'tail', hairc: '#8a5a34', outer: 'vest', coat: '#6a4a3a', shirt: '#cfc6b0', neck: 'bandana', scarf: '#3f6f70', weapon: 'rifle'}),
  /* the hero's mounted selves are made on demand by D.mounted() */
});
D.mounted = function (look, mount) { const k = '_m' + mount; if (!look[k]) Object.defineProperty(look, k, {value: Object.assign({}, look, {mount: mount}), enumerable: false}); return look[k]; };

/* ---------- unit table ---------- */
const units = D.units = {};
function autoAi(look) { if (K.BLOB[look.build]) return 'blob'; if (K.BEAST[look.build]) return 'beast'; const w = D.weapons[look.weapon]; if (look.weapon === 'magic' || look.weapon === 'tome') return 'caster'; return w.kind === 'gun' ? 'ranged' : 'melee'; }
function unit(id, name, faction, o) {
  o = o || {}; const look = looks[o.look || id]; if (!look) throw new Error('no look ' + id);
  const big = look.build === 'brute' ? 1 : 0;
  units[id] = Object.assign({id: id, name: name, faction: faction, look: look, hp: 30 + big * 30, spd: 26 - big * 4, r: 6 + big * 2, mult: 1, ai: autoAi(look), dmg: 1, bounty: 2, sight: 150, weapon: look.weapon}, o, {look: look});
  return units[id];
}
/* --- Outlaws: [id, name, hp, gold cost, tier, blurb] --- tier 0 = starting pick, 1/2 = for hire as the gang grows, 3 = rescued */
const OUT = [
  ['harrow', 'Clay Harrow', 110, 0, 0, 'Steady hand, steadier hat.'], ['goro', 'Goro the Porter', 120, 0, 0, 'Carries the trunk. Carries the fight.'], ['wren', 'Wren Tolliver', 95, 0, 0, 'One shot, one empty saddle.'],
  ['kit', 'Kit Marlowe', 70, 40, 1, 'Loud and quick.'], ['pike', 'Tobias Pike', 75, 35, 1, 'Farm tools are tools of war.'], ['paco', 'Paco Ruiz', 65, 40, 1, 'Small man, big hat.'], ['dunn', 'Mister Dunn', 70, 35, 1, 'Polite until he is not.'],
  ['tully', 'Red Tully', 65, 50, 1, 'Shoots from behind someone taller.'], ['fizz', 'Fizz', 60, 45, 1, 'Goggles on, safety off.'], ['pip', 'Pip Haywood', 70, 50, 1, 'Reaps what others sow.'], ['hob', 'Hob the Archer', 60, 50, 1, 'Never out of arrows somehow.'],
  ['abel', 'Big Abel Stroud', 170, 110, 2, 'Hits like a mule cart.'], ['juniper', 'Old Juniper', 95, 90, 2, 'The shotgun is older than you.'], ['vane', 'Silas Vane', 90, 100, 2, 'Two guns, no questions.'], ['reyes', 'Marlon Reyes', 100, 95, 2, 'Smokes while he works.'],
  ['nori', 'Nori', 85, 100, 2, 'You will not hear the second cut.'], ['mo', 'Deputy Mo', 100, 80, 2, 'Kept the badge. Lost the patience.'], ['pell', 'Sgt. Otis Pell', 105, 95, 2, 'Deserted with the good shotgun.'], ['finch', 'Alder Finch', 100, 90, 2, 'A sword for hire and a beard for free.'],
  ['vega', 'Dusty Vega', 85, 90, 2, 'Red eyes, dry humour.'], ['ulf', 'Ulf Wolfhood', 115, 105, 2, 'Brought his own cutlery.'], ['brannoc', 'Brannoc Gearbeard', 115, 100, 2, 'Axe in one hand, payroll in the other.'], ['jory', 'Jory Fenn', 110, 120, 2, 'The sword is taller than Paco.'],
  ['vesper', 'Vesper', 80, 95, 2, 'Collar up, knife out.'], ['vinyl', 'Pops Vinyl', 80, 70, 2, 'Plays the posse into battle.'], ['morrow', 'Captain Morrow', 120, 130, 2, 'A captain without a ship is still a captain.'],
  ['holloway', 'Sheriff Bram Holloway', 130, 0, 3, 'The law, such as it is.'], ['trueno', 'El Trueno', 180, 0, 3, 'The thunder of the ring.'], ['hazel', 'Hazel Crane', 90, 0, 3, 'Hexes extra.'], ['maren', 'Sylph Maren', 85, 0, 3, 'Spellfire from the far shore.'],
  ['aldous', 'Brother Aldous', 110, 0, 3, 'Reads the last rites, then the first aid.'], ['wade', 'Colonel Wade', 130, 0, 3, 'Old soldier. Large soldier.'], ['tobias', 'Big Tobias', 190, 0, 3, 'A wall that walks.'], ['bramble', 'Bramble', 120, 0, 3, 'Rides Moss. Do not pet Moss.'],
  ['ezra', 'Ezra Cole', 115, 0, 3, 'Clementine does the walking.']
];
D.outlaws = [];
OUT.forEach(o => { const u = unit(o[0], o[1], 'outlaw', {hp: o[2], cost: o[3], tier: o[4], blurb: o[5], spd: 30}); if (u.look.mount !== 'none') { u.spd = 40; u.r = 9; } D.outlaws.push(o[0]); });
unit('militia', 'Town Militia', 'outlaw', {hp: 45, spd: 24}); unit('rifleman', 'Town Rifle', 'outlaw', {hp: 40, spd: 24});
unit('biscuit', 'Biscuit', 'outlaw', {ai: 'pet', hp: 999, spd: 34, r: 4});

/* --- Greenskin Corsairs --- */
unit('grub', 'Goblin Grunt', 'corsair', {hp: 24, spd: 27, bounty: 2});
unit('gobslinger', 'Goblin Slinger', 'corsair', {hp: 18, spd: 25, bounty: 2});
unit('gobgun', 'Powder Monkey', 'corsair', {hp: 22, spd: 23, bounty: 3});
unit('gobshaman', 'Bog Shaman', 'corsair', {hp: 34, spd: 21, bounty: 5, dmg: 1.2});
unit('gobbrute', 'Goblin Bruiser', 'corsair', {hp: 110, spd: 20, bounty: 7, dmg: 0.9});
unit('gobrider', 'Lizard Rider', 'corsair', {hp: 90, spd: 34, r: 10, ai: 'charger', bounty: 8, dmg: 1.2});
unit('snap', 'Croc Pup', 'corsair', {hp: 14, spd: 40, r: 4, bounty: 1, bite: 6});
unit('bogpup', 'Bog Pup', 'corsair', {hp: 20, spd: 42, r: 4, bounty: 1, bite: 8});
unit('gila', 'Giant Lizard', 'corsair', {hp: 130, spd: 24, r: 11, ai: 'charger', bounty: 8, bite: 16, mult: 1.25});
unit('gloop', 'Slime', 'corsair', {hp: 34, spd: 18, r: 6, bounty: 2, bite: 8, split: 'gloopling'});
unit('gloopling', 'Slimeling', 'corsair', {look: 'gloop', hp: 12, spd: 24, r: 4, mult: 0.62, bounty: 1, bite: 4});
unit('redslime', 'Ember Slime', 'corsair', {hp: 60, spd: 20, r: 7, mult: 1.2, bounty: 4, bite: 12, split: 'gloop'});
unit('chomp', 'Mimic', 'corsair', {hp: 70, spd: 30, r: 6, ai: 'mimic', bounty: 12, bite: 16});
unit('grizzle', 'Grizzle the Imp', 'corsair', {hp: 160, spd: 22, bounty: 20, dmg: 1.4, elite: true, summon: 'snap'});
unit('snig', 'Captain Snig', 'corsair', {hp: 520, spd: 26, bounty: 60, dmg: 1.5, boss: true, mult: 1.25, summon: 'grub', phase2: 'snigrider'});
unit('snigrider', 'Captain Snig', 'corsair', {hp: 420, spd: 36, r: 11, ai: 'charger', bounty: 0, dmg: 1.6, boss: true, mult: 1.2, weapon: 'flintlock'});

/* --- Hollow Court --- */
unit('boneman', 'Bone Guard', 'hollow', {hp: 34, spd: 22, bounty: 3});
unit('bonegun', 'Bone Rifle', 'hollow', {hp: 24, spd: 21, bounty: 3, dmg: 0.7});
unit('reaper', 'Reaper', 'hollow', {hp: 80, spd: 24, bounty: 7});
unit('wisp', 'Lantern Wisp', 'hollow', {hp: 16, spd: 30, r: 5, bounty: 2, dmg: 0.7});
unit('wick', 'Wick', 'hollow', {hp: 60, spd: 30, bounty: 8, dmg: 1.2, elite: true});
unit('hound', 'Grave Hound', 'hollow', {hp: 22, spd: 44, r: 4, bounty: 2, bite: 8});
unit('blackcat', 'Hex Cat', 'hollow', {hp: 16, spd: 46, r: 4, bounty: 1, bite: 6});
unit('crow', 'Old Crow', 'hollow', {hp: 120, spd: 26, bounty: 10, dmg: 1.6, elite: true, reach: 34});
unit('wrapped', 'The Wrapped Man', 'hollow', {hp: 130, spd: 26, bounty: 10, dmg: 1.2, elite: true});
unit('grim', 'The Brothers Grim', 'hollow', {hp: 120, spd: 24, bounty: 10, elite: true});
unit('fang', 'Fang Ronin', 'hollow', {hp: 220, spd: 30, bounty: 22, dmg: 1.4, elite: true});
unit('bone', 'Mortimer Bone', 'hollow', {hp: 180, spd: 22, bounty: 22, dmg: 1.2, elite: true});
unit('hagga', 'Old Hagga', 'hollow', {hp: 170, spd: 20, bounty: 22, dmg: 1.5, elite: true, summon: 'boneman'});
unit('oak', 'Gallows Oak', 'hollow', {hp: 260, spd: 15, r: 11, mult: 1.5, bounty: 14, bite: 22, ai: 'beast'});
unit('ashoak', 'Ash Oak', 'hollow', {hp: 380, spd: 16, r: 13, mult: 1.8, bounty: 20, bite: 28, ai: 'beast'});
unit('vex', 'Queen Vex', 'hollow', {hp: 760, spd: 30, bounty: 80, dmg: 1.4, boss: true, mult: 1.3, summon: 'wisp', nova: true});

/* --- Gilded Crown --- */
unit('footman', 'Crown Footman', 'crown', {hp: 44, spd: 23, bounty: 3});
unit('crossbow', 'Crown Crossbow', 'crown', {hp: 30, spd: 22, bounty: 3});
unit('halberd', 'Halberdier', 'crown', {hp: 70, spd: 22, bounty: 5});
unit('musketeer', 'Musketeer', 'crown', {hp: 36, spd: 22, bounty: 4, dmg: 0.75});
unit('lancer', 'Knight Lancer', 'crown', {hp: 120, spd: 38, r: 10, ai: 'charger', bounty: 9, dmg: 1.2});
unit('cleric', 'Crown Cleric', 'crown', {hp: 50, spd: 20, bounty: 6, heals: true});
unit('rowan', 'Sir Rowan Ashby', 'crown', {hp: 190, spd: 26, bounty: 18, dmg: 1.3, elite: true});
unit('aldric', 'Lord Aldric Brand', 'crown', {hp: 260, spd: 26, bounty: 24, dmg: 1.4, elite: true});
unit('kestor', 'Kestor Ironhoof', 'crown', {hp: 240, spd: 38, r: 10, ai: 'charger', bounty: 24, dmg: 1.4, elite: true});
unit('brasswood', 'Brasswood', 'crown', {hp: 240, spd: 18, bounty: 16, dmg: 1.3, elite: true});
unit('bulwark', 'Bulwark', 'crown', {hp: 280, spd: 18, bounty: 16, dmg: 1.5, elite: true});
unit('rattle', 'Rattle', 'crown', {hp: 130, spd: 30, bounty: 12, dmg: 1.2, elite: true});
unit('tyrant', 'Tyrant', 'crown', {hp: 900, spd: 27, r: 18, mult: 2.1, bounty: 60, bite: 34, ai: 'beast', boss: true, stomp: true});
unit('odo', 'King Odo the Gilded', 'crown', {hp: 760, spd: 24, bounty: 120, dmg: 1.6, boss: true, mult: 1.3, summon: 'footman', nova: true, phase2: 'odorider'});
unit('odorider', 'King Odo the Gilded', 'crown', {hp: 520, spd: 38, r: 11, ai: 'charger', bounty: 0, dmg: 1.7, boss: true, mult: 1.2, summon: 'footman', weapon: 'greatsword'});
/* loose animals used as scenery and mounts */
unit('ash', 'Ash', 'outlaw', {ai: 'pet', hp: 999, spd: 30, r: 8}); unit('clementine', 'Clementine', 'outlaw', {ai: 'pet', hp: 999, spd: 26, r: 8}); unit('moss', 'Moss', 'outlaw', {ai: 'pet', hp: 999, spd: 22, r: 9});

D.factions = {
  outlaw: {name: 'The Outlaws', color: '#a8474a', biome: 'desert'},
  corsair: {name: 'Greenskin Corsairs', color: '#6f8a3a', biome: 'swamp', boss: 'snig',
    grunts: ['grub', 'grub', 'gobslinger', 'snap'], mid: ['gobgun', 'gloop', 'bogpup', 'gobshaman'], heavy: ['gobbrute', 'gobrider', 'gila', 'redslime'], elite: ['grizzle'], critter: 'snap'},
  hollow: {name: 'The Hollow Court', color: '#5a4f72', biome: 'hollow', boss: 'vex',
    grunts: ['boneman', 'boneman', 'bonegun', 'hound'], mid: ['wisp', 'bonegun', 'blackcat', 'reaper'], heavy: ['reaper', 'oak', 'crow', 'wrapped'], elite: ['fang', 'bone', 'hagga', 'grim', 'wick'], critter: 'hound'},
  crown: {name: 'The Gilded Crown', color: '#3f5a70', biome: 'crown', boss: 'odo',
    grunts: ['footman', 'footman', 'crossbow', 'musketeer'], mid: ['halberd', 'musketeer', 'cleric', 'crossbow'], heavy: ['lancer', 'brasswood', 'bulwark', 'rattle'], elite: ['rowan', 'aldric', 'kestor'], critter: 'footman'}
};
})();
