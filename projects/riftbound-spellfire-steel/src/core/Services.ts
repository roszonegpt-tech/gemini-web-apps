// Shared service bundle handed to scenes and the World (avoids importing game.ts).
import type { AudioEngine } from '../audio/AudioEngine';
import type { Music } from '../audio/Music';
import type { Engine } from './Engine';
import type { Input } from './Input';
import type { SaveData, Settings } from './Save';

export interface DevFlags {
  god: boolean;
  infiniteMana: boolean;
  noCooldowns: boolean;
  allSpells: boolean;
  colliders: boolean;
  nav: boolean;
  los: boolean;
}

export interface Services {
  engine: Engine;
  input: Input;
  audio: AudioEngine;
  music: Music;
  save: SaveData;
  readonly settings: Settings;
  dev: DevFlags;
  /** Write the save to LocalStorage. */
  persist(): void;
}
