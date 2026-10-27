// Shared type definitions used across systems, entities and level data.

export type SpellId = 'arcaneBolt' | 'flameBurst' | 'chainLightning' | 'vortexSurge' | 'meteorStrike';
export type SecondarySpellId = Exclude<SpellId, 'arcaneBolt'>;

export type DmgType =
  | 'arcane' | 'fire' | 'lightning' | 'frost' | 'wind'
  | 'bullet' | 'ap' | 'explosive' | 'laser' | 'melee' | 'rift';

export type Faction = 'mage' | 'army' | 'neutral';

export type EnemyKind =
  | 'trooper' | 'sniper' | 'heavy' | 'officer' | 'drone'
  | 'turret' | 'mortar' | 'helicopter' | 'vance';

export type UpgradeId = 'spellPower' | 'maxMana' | 'maxHealth' | 'manaRegen' | 'blink' | 'wardResist' | 'elemDuration';

export interface DamageInfo {
  amount: number;
  type: DmgType;
  source?: unknown;
  dirX?: number;
  dirZ?: number;
  /** World position of the hit (for impact effects / directional indicators). */
  x?: number;
  z?: number;
  knockback?: number;
  /** Set for player spells so accuracy and combo stats can be tracked. */
  spell?: SpellId | 'frostBomb' | 'turret' | 'combo' | 'golem';
}

// ---------------------------------------------------------------- level data

export type Vec2T = [number, number];

export interface LevelTheme {
  sky: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sun: string;
  sunIntensity: number;
  rain: number;
  ground: string;
  cliff: string;
  riftColor: string;
}

export interface GroundPaint {
  m: string;
  shape: 'rect' | 'circle' | 'path' | 'ring';
  x?: number; z?: number; w?: number; d?: number; r?: number; r2?: number;
  pts?: Vec2T[];
  width?: number;
  edge?: number;
}

export type ObjectiveType = 'eliminate' | 'destroy' | 'seal' | 'sabotage' | 'overload' | 'defend' | 'rescue' | 'boss' | 'portal' | 'survive';

export interface ObjectiveData {
  id: string;
  type: ObjectiveType;
  text: string;
  /** Entity tag(s) the objective tracks. */
  tag?: string;
  optional?: boolean;
  duration?: number;
}

export interface GateData {
  type: 'barrier' | 'riftwall';
  a: Vec2T;
  b: Vec2T;
}

export interface SpawnData {
  k: EnemyKind;
  x: number;
  z: number;
  tag?: string;
  /** Holds a fixed elevated position (watchtower). */
  perch?: boolean;
  patrol?: Vec2T[];
  /** Spawn only when this event fires (e.g. "wave1"); otherwise placed at level start. */
  wave?: string;
  /** Facing in degrees (0 = +z / screen-down); defaults to facing the zone entry. */
  face?: number;
}

export interface ZoneEvent {
  on: 'enter' | 'objective' | 'time' | 'defendTick';
  ref?: string;
  delay?: number;
  do: 'dropship' | 'subtitle' | 'mortarBarrage' | 'heli' | 'allyGolem' | 'wave' | 'banner' | 'bossIntro';
  x?: number;
  z?: number;
  n?: number;
  kinds?: EnemyKind[];
  text?: string;
  who?: string;
  wave?: string;
  pan?: boolean;
}

export interface ZoneData {
  id: string;
  name: string;
  rect: [number, number, number, number];
  checkpoint: Vec2T;
  objectives: ObjectiveData[];
  gate?: GateData;
  enemies: SpawnData[];
  events?: ZoneEvent[];
}

export interface PropData {
  t: string;
  x?: number;
  z?: number;
  a?: Vec2T;
  b?: Vec2T;
  w?: number;
  d?: number;
  h?: number;
  r?: number;
  rot?: number;
  n?: number;
  tag?: string;
  mat?: string;
  mana?: boolean;
  loot?: string;
  gap?: number;
  door?: string;
  seed?: number;
  zone?: number;
}

export interface LevelData {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  size: Vec2T;
  theme: LevelTheme;
  ground: GroundPaint[];
  player: Vec2T;
  parTime: number;
  briefing: string[];
  zones: ZoneData[];
  props: PropData[];
  music?: 'explore' | 'boss';
}
