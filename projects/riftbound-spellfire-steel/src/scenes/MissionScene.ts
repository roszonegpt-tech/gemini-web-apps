// Campaign gameplay state: runs a World for one sector, routes world events to the UI,
// handles pause / map / dev / camera keys, cinematics (dropship pans, the Goliath intro),
// checkpoint restarts, mission results, star grading, shard rewards and save updates.
import { SECTORS, SPELLS } from '../config/balance';
import type { LevelData } from '../config/types';
import type { GameState } from '../core/StateManager';
import type { Services } from '../core/Services';
import type { UISystem, ResultsData } from '../systems/UISystem';
import { clamp, formatTime } from '../utils/math';
import { World, emptyStats, type MissionStats } from './World';

export interface MissionParams {
  sector: number;
  startZone?: number;
  speedrun?: boolean;
  stats?: MissionStats;
  consumables?: { hp: number; mp: number; bombs: number } | null;
}

export interface MissionHost {
  services: Services;
  ui: UISystem;
  levels: LevelData[];
  onMissionEnd(kind: 'victory' | 'defeat' | 'quit', sector: number): void;
  playEnding(after: () => void): void;
  handleGlobalKeys(world: World): void;
}

export class MissionScene implements GameState {
  readonly name = 'mission';
  world: World | null = null;
  params: MissionParams = { sector: 0 };
  private host: MissionHost;
  private checkpointCons: { hp: number; mp: number; bombs: number } | null = null;
  private cine: { t: number; dur: number; onEnd: (() => void) | null; skipHold: number } | null = null;
  ended = false;
  pausedOverlay = false;

  constructor(host: MissionHost) {
    this.host = host;
  }

  get svc(): Services {
    return this.host.services;
  }

  enter(params?: unknown): void {
    this.params = params as MissionParams;
    this.ended = false;
    this.pausedOverlay = false;
    this.build();
  }

  private build(): void {
    const p = this.params;
    const level = this.host.levels[p.sector];
    const ui = this.host.ui;
    const w = new World(this.svc, level, { mode: 'campaign', startZone: p.startZone || 0, stats: p.stats || emptyStats(), consumables: p.consumables || null });
    this.world = w;
    this.checkpointCons = p.consumables || w.player.snapshotConsumables();
    w.events = {
      banner: (t, k) => ui.banner(t, k),
      subtitle: (who, t, d) => ui.subtitle(who, t, d),
      hit: (dir, amt) => ui.hit(dir, amt),
      checkpoint: (zone) => {
        this.checkpointCons = w.player.snapshotConsumables();
        this.persistCheckpoint(zone);
      },
      complete: () => this.onComplete(),
      failed: (reason) => this.onFailed(reason),
      bossIntro: () => this.bossIntro(),
      pan: (x, z, dur) => this.pan(x, z, dur),
    };
    // v1.3: a fresh deploy replaces any saved checkpoint; resuming keeps it
    if (!p.startZone && this.svc.save.campaign.checkpoint) {
      this.svc.save.campaign.checkpoint = null;
      this.svc.persist();
    }
    this.svc.music.play('explore');
    this.svc.input.gameplayActive = true;
    ui.hideScreens();
    ui.clearSubtitles();
    ui.showHud(true);
    ui.banner(`SECTOR ${p.sector + 1}: ${level.name.toUpperCase()}`, 'big');
    if (!p.startZone) ui.subtitle('High Priestess Lyra', level.subtitle, 5);
    this.svc.engine.resetWarmup();
  }

  exit(): void {
    if (this.world) this.world.dispose();
    this.world = null;
    this.svc.input.gameplayActive = false;
    this.host.ui.showHud(false);
    this.host.ui.clearSubtitles();
    this.cine = null;
  }

  // ------------------------------------------------------------ flow

  pause(): void {
    if (!this.world || this.ended || this.pausedOverlay) return;
    this.pausedOverlay = true;
    this.svc.input.gameplayActive = false;
    this.svc.audio.play('uiBack');
    this.svc.audio.stopAllLoops();
    this.host.ui.go('pause');
  }

  resume(): void {
    if (!this.pausedOverlay) return;
    this.pausedOverlay = false;
    this.svc.input.gameplayActive = true;
    this.svc.input.clearAll();
    this.host.ui.hideScreens();
  }

  /** v1.3: stores the checkpoint (zone, stats, consumables) so a page reload can resume it. */
  private persistCheckpoint(zone: number): void {
    const w = this.world;
    if (!w || this.params.speedrun || zone <= 0) return;
    const stats: Record<string, number> = {};
    for (const [k, v] of Object.entries(w.stats)) if (typeof v === 'number') stats[k] = v;
    this.svc.save.campaign.checkpoint = { sector: this.params.sector, zone, stats, consumables: this.checkpointCons, savedAt: Date.now() };
    this.svc.persist();
  }

  restartCheckpoint(): void {
    const w = this.world;
    if (!w) return;
    const stats = w.stats;
    if (w.player.alive) stats.deaths++;
    const zone = w.checkpointZone;
    const cons = this.checkpointCons;
    w.dispose();
    this.world = null;
    this.params = { ...this.params, startZone: zone, stats, consumables: cons };
    this.ended = false;
    this.pausedOverlay = false;
    this.build();
    this.host.ui.banner('CHECKPOINT RESTORED', 'checkpoint');
  }

  restartMission(): void {
    const w = this.world;
    if (w) w.dispose();
    this.world = null;
    this.params = { sector: this.params.sector, speedrun: this.params.speedrun };
    this.ended = false;
    this.pausedOverlay = false;
    this.build();
  }

  private pan(x: number, z: number, dur: number): void {
    const w = this.world;
    if (!w || this.cine) return;
    w.cinematicLock = true;
    this.host.ui.stage.classList.add('letterbox');
    w.camRig.playCinematic([{ x, z, dist: 26, t: 1.0 }, { x, z, dist: 24, t: dur - 1.0 }]);
    this.cine = { t: 0, dur: dur + 0.2, onEnd: null, skipHold: 0 };
  }

  private bossIntro(): void {
    const w = this.world;
    if (!w || !w.tank) { if (w) w.startBoss(); return; }
    const t = w.tank;
    w.cinematicLock = true;
    this.host.ui.stage.classList.add('letterbox');
    this.svc.music.play('boss');
    w.camRig.playCinematic([
      { x: t.x, z: t.z + 2, dist: 20, t: 2.0, pitch: 0.75, yaw: 0.4 },
      { x: t.x, z: t.z, dist: 15, t: 3.5, pitch: 0.6, yaw: -0.3 },
      { x: t.x, z: t.z, dist: 30, t: 2.5 },
    ]);
    const ui = this.host.ui;
    ui.subtitle('General Vance', 'So the wizard made it to the Heart. Impressive. Mount up — Goliath is rolling!', 4);
    setTimeout(() => { if (this.world === w) ui.subtitle('General Vance', 'Every gate you closed, I\'ll blast open again!', 3.5); }, 4000);
    setTimeout(() => { if (this.world === w) ui.subtitle('High Priestess Lyra', 'His tank is shielded by three generator pylons. Destroy them, Valerius!', 4); }, 6200);
    // Vance climbs into the hatch during the pan
    t.model.vance.position.y = 0.6;
    this.cine = {
      t: 0, dur: 8.2, skipHold: 0,
      onEnd: () => {
        t.model.vance.position.y = -0.6;
        w.startBoss();
        ui.banner('BOSS: GENERAL VANCE & THE IRON GOLIATH', 'big');
      },
    };
  }

  private endCinematic(): void {
    const w = this.world;
    const c = this.cine;
    this.cine = null;
    this.host.ui.stage.classList.remove('letterbox');
    if (w) {
      w.camRig.endCinematic();
      w.cinematicLock = false;
    }
    if (c && c.onEnd) c.onEnd();
  }

  private onComplete(): void {
    if (this.ended) return;
    this.ended = true;
    const sector = this.params.sector;
    this.svc.music.play('victory');
    this.svc.input.gameplayActive = false;
    const show = () => this.showResults(true);
    if (sector === 3) {
      setTimeout(() => this.host.playEnding(show), 1800);
    } else {
      setTimeout(show, 1600);
    }
  }

  private onFailed(reason: string): void {
    if (this.ended) return;
    this.ended = true;
    this.svc.input.gameplayActive = false;
    this.svc.audio.stopAllLoops();
    this.host.ui.go('defeat', reason);
  }

  showResults(victory: boolean): void {
    const w = this.world;
    if (!w) return;
    const svc = this.svc;
    const save = svc.save;
    const sector = this.params.sector;
    const meta = SECTORS[sector];
    const level = this.host.levels[sector];
    const s = w.stats;
    const acc = s.shotsFired ? clamp(s.shotsHit / s.shotsFired, 0, 1) : 0;
    const timeK = clamp(level.parTime / Math.max(1, s.time), 0, 1.2);
    const dmgK = clamp(1 - s.damageTaken / (w.player.maxHp * 3), 0, 1);
    const score = acc * 330 + timeK * 330 + dmgK * 220 + Math.min(100, s.combos * 8) + s.rescued * 40 + s.anchorsSealed * 10 - s.deaths * 60;
    const rating = score >= 850 ? 'S' : score >= 700 ? 'A' : score >= 550 ? 'B' : score >= 400 ? 'C' : 'D';
    const stars = 1 + (s.time <= level.parTime ? 1 : 0) + (s.deaths === 0 && s.damageTaken <= w.player.maxHp * 1.5 ? 1 : 0);
    const c = save.campaign;
    const firstClear = !c.completed[sector];
    const prevStars = c.stars[sector];
    let shards = Math.round(meta.baseShards * (firstClear ? 1 : 0.4)) + Math.max(0, stars - prevStars) * 30 + w.missionShards + s.kills;
    shards = Math.max(10, shards);
    let unlocked: string | null = null;
    if (firstClear && meta.unlockSpell && save.spells.unlocked.indexOf(meta.unlockSpell) < 0) {
      save.spells.unlocked.push(meta.unlockSpell);
      unlocked = SPELLS[meta.unlockSpell].name;
    }
    const bestTime = c.bestTimes[sector] === null || s.time < (c.bestTimes[sector] as number);
    c.completed[sector] = true;
    c.unlocked = Math.max(c.unlocked, Math.min(4, sector + 2));
    c.stars[sector] = Math.max(prevStars, stars);
    if (bestTime) c.bestTimes[sector] = Math.round(s.time * 10) / 10;
    const order = ['D', 'C', 'B', 'A', 'S'];
    const prevR = c.bestRatings[sector];
    if (!prevR || order.indexOf(rating) > order.indexOf(prevR)) c.bestRatings[sector] = rating;
    c.checkpoint = null;
    save.shards += shards;
    save.shardsEarnedTotal += shards;
    save.stats.missions++;
    save.stats.playTime += s.time;
    svc.persist();
    const data: ResultsData = {
      sector, name: `Sector ${sector + 1}: ${level.name}`, victory, rating, stars, shards, unlocked, bestTime,
      hasNext: sector < 3,
      stats: [
        { label: 'Soldiers Defeated', value: String(s.kills) },
        { label: 'Spell Accuracy', value: `${Math.round(acc * 100)}%` },
        { label: 'Wards Cast', value: String(s.wardsCast) },
        { label: 'Clear Time', value: `${formatTime(s.time)} (par ${formatTime(level.parTime)})` },
        { label: 'Rift Anchors Sealed', value: String(s.anchorsSealed) },
        { label: 'Damage Taken', value: String(Math.round(s.damageTaken)) },
        { label: 'Spell Combos', value: String(s.combos) },
        { label: 'Cover Destroyed', value: String(s.coverDestroyed) },
        { label: 'Checkpoint Restarts', value: String(s.deaths) },
      ],
    };
    this.host.ui.showHud(false);
    this.host.ui.go('results', data);
  }

  // ------------------------------------------------------------ loop

  update(dt: number): void {
    const w = this.world;
    if (!w) return;
    const inp = this.svc.input;
    if (this.pausedOverlay) {
      if (inp.pressed('pause') && this.host.ui.current === 'pause') this.resume();
      return;
    }
    if (!this.ended) {
      if (inp.pressed('pause')) { this.pause(); return; }
      if (inp.pressed('map')) {
        this.pause();
        this.host.ui.go('map');
        return;
      }
    }
    this.host.handleGlobalKeys(w);
    if (this.cine) {
      this.cine.t += dt;
      if (inp.isDown('skip') || inp.isDown('confirm')) {
        this.cine.skipHold += dt;
        if (this.cine.skipHold > 0.6) this.endCinematic();
      } else this.cine.skipHold = 0;
      if (this.cine && this.cine.t >= this.cine.dur) this.endCinematic();
    }
    w.update(dt);
  }

  render(dt: number): void {
    const w = this.world;
    if (!w) return;
    w.render(this.svc.engine.renderer);
    const timer = this.params.speedrun || this.svc.settings.speedrunTimer ? w.stats.time : null;
    this.host.ui.update(dt, w, !this.pausedOverlay && !this.ended, timer);
  }
}
