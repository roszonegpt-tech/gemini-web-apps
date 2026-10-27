// LocalStorage persistence. KEY NAMES IN SaveData ARE FROZEN (see saves/save-schema.json):
// later builds may add keys but must not rename or repurpose existing ones.
import type { SecondarySpellId, SpellId, UpgradeId } from '../config/types';

export const SAVE_KEY = 'riftbound.save.v1';

export interface Settings {
  master: number;
  sfx: number;
  music: number;
  voice: number;
  controlScheme: 'default' | 'swapped';
  touchOpacity: number;
  touchMode: 'auto' | 'on' | 'off';
  reducedMotion: boolean;
  aimAssist: number;
  colorblind: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
  quality: 'auto' | 'high' | 'medium' | 'low';
  pixelStyle: 'crisp' | 'classic' | 'chunky';
  narration: boolean;
  subtitles: boolean;
  showFps: boolean;
  speedrunTimer: boolean;
  haptics: boolean;
}

export interface ChallengeRecord {
  bestTime: number | null;
  bestScore: number;
  stars: number;
}

export interface SaveData {
  schema: number;
  campaign: {
    unlocked: number;
    completed: boolean[];
    stars: number[];
    bestTimes: (number | null)[];
    bestRatings: (string | null)[];
    checkpoint: { sector: number; zone: number } | null;
    introSeen: boolean;
  };
  shards: number;
  shardsEarnedTotal: number;
  upgrades: Record<UpgradeId, number>;
  spells: {
    unlocked: SpellId[];
    loadout: SecondarySpellId[];
    inferno: boolean;
  };
  cosmetics: { robeGlow: string };
  challenges: Record<string, ChallengeRecord>;
  settings: Settings;
  stats: { kills: number; deaths: number; playTime: number; missions: number };
}

export function defaultSettings(): Settings {
  return {
    master: 0.8,
    sfx: 0.8,
    music: 0.55,
    voice: 0.8,
    controlScheme: 'default',
    touchOpacity: 0.55,
    touchMode: 'auto',
    reducedMotion: false,
    aimAssist: 0.5,
    colorblind: 'none',
    quality: 'auto',
    pixelStyle: 'classic',
    narration: true,
    subtitles: true,
    showFps: false,
    speedrunTimer: false,
    haptics: true,
  };
}

export function defaultSave(): SaveData {
  return {
    schema: 1,
    campaign: {
      unlocked: 1,
      completed: [false, false, false, false],
      stars: [0, 0, 0, 0],
      bestTimes: [null, null, null, null],
      bestRatings: [null, null, null, null],
      checkpoint: null,
      introSeen: false,
    },
    shards: 0,
    shardsEarnedTotal: 0,
    upgrades: { spellPower: 0, maxMana: 0, maxHealth: 0, manaRegen: 0, blink: 0, wardResist: 0, elemDuration: 0 },
    spells: { unlocked: ['arcaneBolt', 'flameBurst'], loadout: ['flameBurst', 'chainLightning', 'vortexSurge', 'meteorStrike'], inferno: false },
    cosmetics: { robeGlow: 'violet' },
    challenges: {},
    settings: defaultSettings(),
    stats: { kills: 0, deaths: 0, playTime: 0, missions: 0 },
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge stored data over defaults so missing keys (older saves) get filled in. */
function mergeDefaults<T>(def: T, stored: unknown): T {
  if (!isObj(def) || !isObj(stored)) {
    if (Array.isArray(def) && Array.isArray(stored)) return stored as unknown as T;
    if (stored === undefined || stored === null) return def;
    return typeof stored === typeof def ? (stored as T) : def;
  }
  const out: Record<string, unknown> = { ...(def as Record<string, unknown>) };
  for (const k of Object.keys(stored)) {
    const dv = (def as Record<string, unknown>)[k];
    out[k] = dv === undefined ? stored[k] : mergeDefaults(dv, stored[k]);
  }
  return out as T;
}

let storageOk = true;

export function loadSave(): SaveData {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return sanitize(mergeDefaults(defaultSave(), JSON.parse(raw)));
  } catch (err) {
    storageOk = false;
    console.warn('[save] could not read save, using defaults', err);
    return defaultSave();
  }
}

function sanitize(s: SaveData): SaveData {
  const c = s.campaign;
  for (const key of ['completed', 'stars', 'bestTimes', 'bestRatings'] as const) {
    const arr = c[key] as unknown[];
    while (arr.length < 4) arr.push(key === 'completed' ? false : key === 'stars' ? 0 : null);
  }
  c.unlocked = Math.max(1, Math.min(4, c.unlocked | 0));
  if (s.spells.unlocked.indexOf('arcaneBolt') < 0) s.spells.unlocked.unshift('arcaneBolt');
  if (s.spells.loadout.length !== 4) s.spells.loadout = defaultSave().spells.loadout;
  s.shards = Math.max(0, Math.floor(s.shards));
  return s;
}

export function writeSave(s: SaveData): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    storageOk = true;
    return true;
  } catch (err) {
    storageOk = false;
    console.warn('[save] could not write save', err);
    return false;
  }
}

export function storageAvailable(): boolean {
  return storageOk;
}

export function resetSave(keepSettings: Settings | null): SaveData {
  const s = defaultSave();
  if (keepSettings) s.settings = keepSettings;
  writeSave(s);
  return s;
}

export function importSave(json: string): SaveData | null {
  try {
    const parsed = JSON.parse(json);
    if (!isObj(parsed) || typeof parsed.schema !== 'number') return null;
    return sanitize(mergeDefaults(defaultSave(), parsed));
  } catch {
    return null;
  }
}
