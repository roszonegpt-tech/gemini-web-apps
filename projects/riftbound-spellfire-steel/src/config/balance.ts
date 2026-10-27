// Gameplay tuning tables. Change numbers here rather than inside systems.
import type { EnemyKind, SecondarySpellId, SpellId, UpgradeId } from './types';

export const PLAYER = {
  radius: 0.45,
  speed: 6.2,
  hp: 100,
  mana: 100,
  manaRegen: 7,
  wardMax: 100,
  wardDrainHold: 5,
  wardRegen: 22,
  wardRegenDelay: 0.9,
  wardBreakLock: 2.5,
  wardReduce: 0.8,
  wardReduceAP: 0.5,
  wardReduceExplosive: 0.6,
  wardMoveMul: 0.7,
  snapWindow: 0.22,
  blinkRange: 6.5,
  blinkCooldown: 2.2,
  blinkInvuln: 0.3,
  channelTime: 2.0,
  potionHp: 45,
  potionMana: 60,
  startHpPotions: 2,
  startManaPotions: 2,
  startBombs: 2,
  maxPotions: 3,
  maxBombs: 4,
  bombRange: 12,
  castMoveMul: 0.85,
};

export interface SpellDef {
  id: SpellId;
  name: string;
  mana: number;
  cooldown: number;
  damage: number;
  color: number;
  css: string;
  desc: string;
  unlockCost: number;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  arcaneBolt: {
    id: 'arcaneBolt', name: 'Arcane Bolt', mana: 4, cooldown: 0.17, damage: 16, color: 0xb36bff, css: '#b36bff',
    desc: 'Rapid violet bolts. Hold to stream. Shatters frozen foes into Crystal Spikes.', unlockCost: 0,
  },
  flameBurst: {
    id: 'flameBurst', name: 'Flame Burst', mana: 18, cooldown: 1.0, damage: 42, color: 0xff7a1a, css: '#ff8a2a',
    desc: 'Lobbed fireball that bursts into flame. Ignites wood, scorches concrete. Cast into a Vortex for a Firestorm.', unlockCost: 0,
  },
  chainLightning: {
    id: 'chainLightning', name: 'Chain Lightning', mana: 22, cooldown: 1.4, damage: 34, color: 0x7fd8ff, css: '#7fd8ff',
    desc: 'Arcs between up to 5 soldiers, ignoring cover. Stuns briefly; wet targets take +50%.', unlockCost: 150,
  },
  vortexSurge: {
    id: 'vortexSurge', name: 'Vortex Surge', mana: 30, cooldown: 6, damage: 10, color: 0x9cffd8, css: '#9cffd8',
    desc: 'A wind vortex that drags soldiers in and swallows bullets. Feed it fire for a Firestorm.', unlockCost: 250,
  },
  meteorStrike: {
    id: 'meteorStrike', name: 'Meteor Strike', mana: 45, cooldown: 10, damage: 140, color: 0xff4a2a, css: '#ff5a3a',
    desc: 'Calls a burning meteor down after a short delay. Pulverizes concrete cover.', unlockCost: 400,
  },
};

export const SECONDARY_SPELLS: SecondarySpellId[] = ['flameBurst', 'chainLightning', 'vortexSurge', 'meteorStrike'];

export const INFERNO_COST = 300;

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  per: string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'spellPower', name: 'Spell Power', desc: 'All spell damage', per: '+10%' },
  { id: 'maxMana', name: 'Mana Capacity', desc: 'Maximum mana', per: '+15' },
  { id: 'maxHealth', name: 'Vitality', desc: 'Maximum health', per: '+15' },
  { id: 'manaRegen', name: 'Mana Flow', desc: 'Mana regeneration rate', per: '+15%' },
  { id: 'blink', name: 'Rift Step', desc: 'Blink distance & cooldown', per: '+0.8m / -0.2s' },
  { id: 'wardResist', name: 'Ward Resonance', desc: 'Ward capacity & resistance', per: '+10 / -12% drain' },
  { id: 'elemDuration', name: 'Elemental Mastery', desc: 'Burn / freeze / stun duration', per: '+15%' },
];

export const UPGRADE_MAX = 5;
export const UPGRADE_COSTS = [60, 120, 200, 300, 420];

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  radius: number;
  sight: number;
  range: number;
  damage: number;
  score: number;
  flying?: boolean;
  stationary?: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  trooper: { name: 'Vanguard Trooper', hp: 60, speed: 4.2, radius: 0.42, sight: 21, range: 17, damage: 6, score: 100 },
  sniper: { name: 'Vanguard Sniper', hp: 48, speed: 3.6, radius: 0.42, sight: 34, range: 32, damage: 32, score: 150 },
  heavy: { name: 'Heavy Exo-Gunner', hp: 280, speed: 2.4, radius: 0.62, sight: 20, range: 13, damage: 3, score: 300 },
  officer: { name: 'Vanguard Officer', hp: 95, speed: 3.8, radius: 0.42, sight: 24, range: 15, damage: 7, score: 250 },
  drone: { name: 'Attack Drone', hp: 34, speed: 6.5, radius: 0.5, sight: 24, range: 12, damage: 5, score: 120, flying: true },
  turret: { name: 'Sentry Turret', hp: 160, speed: 0, radius: 0.7, sight: 20, range: 19, damage: 5, score: 150, stationary: true },
  mortar: { name: 'Mortar Emplacement', hp: 200, speed: 0, radius: 0.9, sight: 40, range: 40, damage: 34, score: 200, stationary: true },
  helicopter: { name: 'Attack Helicopter', hp: 520, speed: 7, radius: 1.6, sight: 34, range: 22, damage: 5, score: 600, flying: true },
  vance: { name: 'General Vance', hp: 650, speed: 5.0, radius: 0.55, sight: 40, range: 18, damage: 9, score: 2000 },
};

export interface SectorMeta {
  index: number;
  id: string;
  name: string;
  baseShards: number;
  unlockSpell: SecondarySpellId | null;
}

export const SECTORS: SectorMeta[] = [
  { index: 0, id: 'sector1', name: 'The Rift Arrival', baseShards: 110, unlockSpell: 'chainLightning' },
  { index: 1, id: 'sector2', name: 'Trenches of Elyria', baseShards: 150, unlockSpell: 'vortexSurge' },
  { index: 2, id: 'sector3', name: 'Fortified Supply Outpost', baseShards: 200, unlockSpell: 'meteorStrike' },
  { index: 3, id: 'sector4', name: 'The Rift Heart', baseShards: 320, unlockSpell: null },
];

export const ROBE_GLOWS: { id: string; name: string; color: number; css: string; stars: number }[] = [
  { id: 'violet', name: 'Elyrian Violet', color: 0xb36bff, css: '#b36bff', stars: 0 },
  { id: 'azure', name: 'Azure Ward', color: 0x4fc8ff, css: '#4fc8ff', stars: 3 },
  { id: 'ember', name: 'Ember Sigil', color: 0xff8a3a, css: '#ff8a3a', stars: 6 },
  { id: 'verdant', name: 'Verdant Rune', color: 0x5dff9a, css: '#5dff9a', stars: 9 },
  { id: 'celestial', name: 'Celestial Gold', color: 0xffd84a, css: '#ffd84a', stars: 12 },
];

/** Colour palettes for minimap / target rings (colour-blind assistance). */
export const PALETTES: Record<string, { enemy: string; objective: string; well: string; ally: string; player: string; ring: number }> = {
  none: { enemy: '#ff4040', objective: '#ffd84a', well: '#b46bff', ally: '#4be0ff', player: '#ffffff', ring: 0xff4040 },
  deuteranopia: { enemy: '#ff9d00', objective: '#ffffff', well: '#9a8cff', ally: '#3da5ff', player: '#e6f2ff', ring: 0xff9d00 },
  protanopia: { enemy: '#ffb000', objective: '#ffffff', well: '#8f8cff', ally: '#3d8bff', player: '#e6f2ff', ring: 0xffb000 },
  tritanopia: { enemy: '#ff2e63', objective: '#ffffff', well: '#20c9b5', ally: '#9be7ff', player: '#ffe0ea', ring: 0xff2e63 },
};
