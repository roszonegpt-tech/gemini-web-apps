/* Crown of Dust - weapon table (src/config/weapons.js). Every weapon id is one the lab painter can draw (INK.WEAPONS).
   melee: dmg per swing, reach and arc (degrees) in ground units. gun: dmg per shot, bullet speed, range, pellets, spread.
   rate scales the painter's animation speed for that weapon; cd is the rest between attacks for AI units. */
(function () {
'use strict';
const CD = window.CD, D = CD.Data = CD.Data || {};
const melee = (name, dmg, reach, arc, o) => Object.assign({name: name, kind: 'melee', dmg: dmg, reach: reach, arc: arc, rate: 1, cd: 0.7, push: 60}, o);
const gun = (name, dmg, speed, range, o) => Object.assign({name: name, kind: 'gun', dmg: dmg, speed: speed, range: range, pellets: 1, spread: 0, rate: 1, cd: 0.9, push: 30}, o);
D.weapons = {
  fists: melee('Fists', 9, 20, 110, {rate: 1.1, cd: 0.5, push: 80}),
  katana: melee('Katana', 15, 30, 120, {rate: 1.15}),
  saber: melee('Cutlass', 14, 28, 110),
  sword: melee('Broadsword', 15, 28, 110),
  dagger: melee('Glow dagger', 10, 20, 90, {rate: 1.5, cd: 0.4}),
  axe: melee('Hand axe', 17, 24, 100, {push: 90}),
  cleavers: melee('Twin cleavers', 12, 24, 130, {rate: 1.35, cd: 0.45}),
  hammer: melee('War hammer', 26, 30, 110, {rate: 0.8, cd: 1.1, push: 170, stun: 0.6}),
  greatsword: melee('Greatsword', 24, 37, 140, {rate: 0.85, cd: 1.0, push: 120}),
  scythe: melee('Scythe', 20, 38, 160, {rate: 0.9, cd: 0.9}),
  spear: melee('Spear', 14, 42, 40, {thrust: true, cd: 0.8}),
  lance: melee('Lance', 17, 46, 36, {thrust: true, cd: 0.9, push: 120}),
  pitchfork: melee('Pitchfork', 12, 40, 44, {thrust: true, cd: 0.8}),
  revolver: gun('Revolver', 9, 300, 190, {rate: 1.25, cd: 0.7}),
  twin: gun('Twin revolvers', 7, 300, 170, {rate: 2.0, cd: 0.35}),
  rifle: gun('Rifle', 24, 440, 310, {rate: 0.62, cd: 1.5, pierce: 1}),
  shotgun: gun('Shotgun', 6, 280, 100, {pellets: 6, spread: 0.11, rate: 0.7, cd: 1.4, push: 110}),
  sawedoff: gun('Sawed-off', 6, 270, 78, {pellets: 5, spread: 0.15, rate: 0.9, cd: 1.1, push: 120}),
  flintlock: gun('Flintlock', 19, 300, 180, {rate: 0.6, cd: 1.6, push: 60}),
  bow: gun('Bow', 13, 250, 240, {rate: 1.0, cd: 1.0, arrow: true}),
  magic: gun('Spell hands', 12, 180, 210, {rate: 1.0, cd: 1.2, orb: '#6fe0d0', splash: 20}),
  tome: gun('Spell book', 10, 165, 220, {rate: 0.9, cd: 1.4, orb: '#c8e03a', splash: 26})
};
/* what the armoury sells to the hero, in order, with the gold price */
D.armory = [['revolver', 0], ['fists', 0], ['saber', 40], ['bow', 50], ['axe', 60], ['sawedoff', 70], ['spear', 70], ['twin', 90], ['katana', 100], ['shotgun', 110], ['rifle', 120], ['cleavers', 120],
  ['flintlock', 90], ['hammer', 150], ['scythe', 150], ['magic', 170], ['greatsword', 190], ['lance', 160], ['tome', 180], ['dagger', 80], ['sword', 90], ['pitchfork', 30]];
/* hero special by weapon family: [name, cooldown seconds, text] */
D.specials = {
  fan: ['Fan the Hammer', 9, 'Six fast shots in a spread.'],
  deadeye: ['Dead Eye', 11, 'One shot through everything in line for triple damage.'],
  blast: ['Both Barrels', 10, 'A wide blast that throws enemies back.'],
  whirl: ['Whirlwind', 9, 'Spin and cut everything around you.'],
  slam: ['Ground Slam', 10, 'Leap and stun everything nearby.'],
  volley: ['Arrow Volley', 10, 'Seven arrows in a fan.'],
  nova: ['Nova', 12, 'A ring of spellfire around you.'],
  mend: ['Mending Word', 14, 'Heal yourself and the posse.']
};
D.specialOf = w => ({revolver: 'fan', twin: 'fan', flintlock: 'deadeye', rifle: 'deadeye', shotgun: 'blast', sawedoff: 'blast', bow: 'volley', magic: 'nova', tome: 'mend', fists: 'slam', hammer: 'slam'})[w] || 'whirl';
})();
