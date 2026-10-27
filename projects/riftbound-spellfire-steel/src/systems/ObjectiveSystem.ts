// Zone-by-zone objectives (eliminate, destroy, seal, sabotage, overload, defend, rescue,
// boss, portal). Completing a zone's required objectives opens its gate; entering the
// next zone sets a checkpoint. The final zone activates the exit Rift Gate.
import type { ObjectiveData, ZoneData } from '../config/types';
import type { Actor } from '../entities/Actor';
import { Catalyst, type Interactable } from '../entities/Interactables';
import { VanguardEnemy } from '../entities/VanguardEnemy';
import type { World } from '../scenes/World';
import { dist } from '../utils/math';

export interface ObjState {
  data: ObjectiveData;
  done: boolean;
  failed: boolean;
  progress: number;
  total: number;
  label: string;
}

export interface ZoneState {
  data: ZoneData;
  objs: ObjState[];
  complete: boolean;
  entered: boolean;
  enterT: number;
}

export interface Marker {
  x: number;
  z: number;
  label: string;
}

export class ObjectiveSystem {
  world: World;
  zones: ZoneState[] = [];
  portalPhase = false;
  allComplete = false;
  dirty = true;

  constructor(world: World) {
    this.world = world;
    for (const z of world.level.zones) {
      this.zones.push({
        data: z,
        objs: z.objectives.map((o) => ({ data: o, done: false, failed: false, progress: 0, total: 0, label: o.text })),
        complete: false,
        entered: false,
        enterT: 0,
      });
    }
  }

  get active(): ZoneState {
    return this.zones[Math.min(this.world.activeZone, this.zones.length - 1)];
  }

  tagActive(tag: string | null): boolean {
    if (!tag) return true;
    const z = this.active;
    if (!z) return false;
    return z.objs.some((o) => o.data.tag === tag && !o.done);
  }

  private actorsWithTag(tag: string): Actor[] {
    return this.world.actors.filter((a) => a.tag === tag);
  }

  private interWithTag(tag: string): Interactable[] {
    return this.world.interactables.filter((i) => i.tag === tag);
  }

  update(dt: number): void {
    const w = this.world;
    const zi = w.activeZone;
    const z = this.zones[zi];
    if (!z) return;
    if (z.entered) z.enterT += dt;
    for (const o of z.objs) {
      if (o.done || o.failed) continue;
      const before = `${o.progress}/${o.total}`;
      this.evaluate(o, zi, z);
      if (`${o.progress}/${o.total}` !== before) this.dirty = true;
      if (o.done) {
        this.dirty = true;
        w.audio.play('objective');
        if (!o.data.optional) w.banner(`OBJECTIVE COMPLETE: ${o.data.text.toUpperCase()}`, 'objective');
        else w.banner(`BONUS OBJECTIVE: ${o.data.text.toUpperCase()}`, 'objective');
        w.onObjectiveDone(o.data.id);
      }
    }
    if (!z.complete && z.objs.every((o) => o.done || o.data.optional)) {
      z.complete = true;
      this.dirty = true;
      w.onZoneComplete(zi);
    }
  }

  private evaluate(o: ObjState, zi: number, z: ZoneState): void {
    const w = this.world;
    const tag = o.data.tag || '';
    switch (o.data.type) {
      case 'eliminate': {
        const units = w.actors.filter((a) => a instanceof VanguardEnemy && !a.structure && a.zone === zi && (!tag || a.tag === tag));
        const alive = units.filter((a) => a.alive).length;
        o.total = Math.max(o.total, units.length);
        o.progress = o.total - alive;
        o.label = `${o.data.text} (${alive} remaining)`;
        if (alive === 0 && z.enterT > 1 && !w.pendingSpawns(zi)) o.done = true;
        break;
      }
      case 'destroy':
      case 'boss': {
        const list = this.actorsWithTag(tag);
        o.total = list.length;
        o.progress = list.filter((a) => !a.alive).length;
        o.label = o.total > 1 ? `${o.data.text} (${o.progress}/${o.total})` : o.data.text;
        if (o.total > 0 && o.progress === o.total) o.done = true;
        break;
      }
      case 'seal':
      case 'sabotage':
      case 'overload':
      case 'rescue': {
        const list = this.interWithTag(tag);
        o.total = list.length;
        o.progress = list.filter((i) => i.done).length;
        o.label = o.total > 1 ? `${o.data.text} (${o.progress}/${o.total})` : o.data.text;
        if (o.total > 0 && o.progress === o.total) o.done = true;
        break;
      }
      case 'defend': {
        const c = this.actorsWithTag(tag).find((a) => a instanceof Catalyst) as Catalyst | undefined;
        if (!c) { o.done = true; break; }
        o.total = Math.round(c.duration);
        o.progress = Math.floor(c.defendT);
        if (!c.alive) { o.failed = true; break; }
        o.label = c.awakened ? `${o.data.text} — ${Math.max(0, Math.ceil(c.duration - c.defendT))}s` : o.data.text;
        if (c.awakened && c.defendT >= c.duration) o.done = true;
        break;
      }
      case 'survive':
      case 'portal':
        break;
    }
  }

  /** Objectives to show in the HUD tracker. */
  hudLines(): { text: string; done: boolean; optional: boolean }[] {
    const z = this.active;
    if (!z) return [];
    if (this.portalPhase) return [{ text: 'Enter the Rift Gate', done: false, optional: false }];
    const lines = z.objs.map((o) => ({ text: o.label, done: o.done, optional: !!o.data.optional }));
    if (z.complete && this.world.activeZone < this.zones.length - 1) lines.push({ text: 'Advance through the open gateway', done: false, optional: false });
    return lines;
  }

  /** World position of the current primary objective (for the 3D rune marker). */
  marker(): Marker | null {
    const w = this.world;
    const p = w.player;
    if (this.portalPhase && w.exitPortal) return { x: w.exitPortal.x, z: w.exitPortal.z, label: 'Rift Gate' };
    const z = this.active;
    if (!z) return null;
    if (z.complete) {
      const next = this.zones[w.activeZone + 1];
      if (next) return { x: next.data.checkpoint[0], z: next.data.checkpoint[1], label: next.data.name };
      return null;
    }
    for (const o of z.objs) {
      if (o.done || o.data.optional) continue;
      const tag = o.data.tag || '';
      let best: { x: number; z: number } | null = null;
      let bd = 1e9;
      const consider = (x: number, zz: number) => {
        const d = dist(p.x, p.z, x, zz);
        if (d < bd) { bd = d; best = { x, z: zz }; }
      };
      if (o.data.type === 'destroy' || o.data.type === 'boss' || o.data.type === 'defend') {
        for (const a of w.actors) if (a.tag === tag && a.alive) consider(a.x, a.z);
      } else if (o.data.type === 'eliminate') {
        for (const a of w.actors) if (a instanceof VanguardEnemy && a.alive && !a.structure && a.zone === w.activeZone && (!tag || a.tag === tag) && a.seen) consider(a.x, a.z);
      } else {
        for (const i of w.interactables) if (i.tag === tag && !i.done) consider(i.x, i.z);
      }
      if (best) return { x: (best as { x: number }).x, z: (best as { z: number }).z, label: o.data.text };
    }
    return null;
  }

  /** Marks everything before `zone` as complete (checkpoint restarts). */
  fastForward(zone: number): void {
    const w = this.world;
    for (let i = 0; i < zone && i < this.zones.length; i++) {
      const z = this.zones[i];
      z.complete = true;
      z.entered = true;
      for (const o of z.objs) {
        o.done = true;
        const tag = o.data.tag;
        if (!tag) continue;
        for (const it of w.interactables) {
          if (it.tag === tag && !it.done) w.forceDone(it);
        }
        for (const a of w.actors) {
          if (a.tag === tag && a.alive) w.forceDestroyed(a);
        }
      }
    }
    this.dirty = true;
  }
}
