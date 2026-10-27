// Game orchestrator: wires the engine loop, input, audio, save data, UI and the game
// states (title diorama → campaign map / briefing → mission → results; story cinematics).
import sector1 from '../levels/sector1.json';
import sector2 from '../levels/sector2.json';
import sector3 from '../levels/sector3.json';
import sector4 from '../levels/sector4.json';
import { AudioEngine } from './audio/AudioEngine';
import { Music } from './audio/Music';
import type { EnemyKind, LevelData } from './config/types';
import { Engine, type QualityLevel } from './core/Engine';
import { Input, type Action } from './core/Input';
import { importSave, loadSave, resetSave, writeSave, type SaveData } from './core/Save';
import type { DevFlags, Services } from './core/Services';
import { StateManager } from './core/StateManager';
import { installGolemSegment, type GolemSegment } from './entities/ArcaneGolem';
import { GoliathTank } from './entities/Boss';
import { Catalyst, ManaWell } from './entities/Interactables';
import { VanguardEnemy } from './entities/VanguardEnemy';
import { ChallengeScene, type TrialId } from './scenes/ChallengeScene';
import { MissionScene, type MissionHost } from './scenes/MissionScene';
import { StoryScene } from './scenes/StoryScene';
import { TitleScene } from './scenes/TitleScene';
import { emptyStats, type World } from './scenes/World';
import { DevTools, pickFile, type DevHost } from './systems/DevTools';
import { UISystem, type UiGame } from './systems/UISystem';
import { VERSION } from './config/version';

const QUALITY: Record<string, QualityLevel> = { high: 2, medium: 1, low: 0 };

/**
 * v1.2 audio balance pass: dB trims layered over the synthesized recipes / loops and the music bus
 * through AudioEngine's public API, so the synthesis code itself stays untouched. Levels were measured
 * with `tests/audio-levels.mjs`; targets and results are in notes/design-notes.md ("Audio mix").
 */
export const AUDIO_MIX = {
  music: 4.5,
  recipes: {
    bolt: 5, fireCast: 4, blink: 2, wardUp: 2, snap: 2, potion: 2, playerHurt: 3, boltHit: 3,
    gunshot: -1.5,
  } as Record<string, number>,
  loops: { rain: -14, rift: -8 } as Record<string, number>,
};

const dbGain = (db: number): number => Math.pow(10, db / 20);

function installAudioMix(audio: AudioEngine): void {
  const play = audio.play.bind(audio);
  audio.play = (name, opts = {}) => {
    const t = AUDIO_MIX.recipes[name];
    play(name, t ? { ...opts, vol: (opts.vol !== undefined ? opts.vol : 1) * dbGain(t) } : opts);
  };
  const loop = audio.loopVolume.bind(audio);
  audio.loopVolume = (name, vol, build) => {
    const t = AUDIO_MIX.loops[name];
    loop(name, t ? vol * dbGain(t) : vol, build);
  };
}

export class Game implements UiGame, MissionHost, DevHost {
  services: Services;
  levels: LevelData[] = [sector1, sector2, sector3, sector4] as unknown as LevelData[];
  states = new StateManager();
  ui: UISystem;
  devTools: DevTools;
  title: TitleScene;
  mission: MissionScene;
  story: StoryScene;
  challenge: ChallengeScene;
  /** v1.2 mix table (read by tests/audio-levels.mjs). */
  readonly audioMix = AUDIO_MIX;
  /** v1.1 Arcane Golem flight segment, attached to Sector 2 mission worlds. */
  private golemSeg: GolemSegment | null = null;
  private golemWorld: World | null = null;
  private polled = false;
  private firstStep = false;

  constructor() {
    const stage = document.getElementById('stage') as HTMLElement;
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const engine = new Engine(stage, canvas);
    const input = new Input(stage);
    const audio = new AudioEngine();
    installAudioMix(audio);
    const music = new Music(audio);
    const dev: DevFlags = { god: false, infiniteMana: false, noCooldowns: false, allSpells: false, colliders: false, nav: false, los: false };
    const svc = {
      engine, input, audio, music, dev,
      save: loadSave() as SaveData,
      get settings() { return this.save.settings; },
      persist: () => { writeSave(this.services.save); },
    };
    this.services = svc;
    this.ui = new UISystem(this);
    this.devTools = new DevTools(this);
    this.title = new TitleScene(svc);
    this.mission = new MissionScene(this);
    this.story = new StoryScene(svc);
    this.challenge = new ChallengeScene(this);
    this.states.register(this.title);
    this.states.register(this.mission);
    this.states.register(this.story);
    this.states.register(this.challenge);
    engine.onResize = () => this.ui.resize();
    engine.onQualityChange = (q, auto) => this.onQuality(q, auto);
    audio.onUnlock = () => music.resume();
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchend', unlock);
    // auto-pause when the tab loses focus
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
      if (audio.ctx) {
        if (document.hidden) audio.ctx.suspend().catch(() => undefined);
        else audio.ctx.resume().catch(() => undefined);
      }
    });
    window.addEventListener('blur', () => this.autoPause());
    this.applySettings();
    this.ui.resize();
  }

  start(): void {
    this.states.change('title');
    this.ui.go('title');
    this.services.engine.start({
      update: (dt) => this.update(dt),
      render: (dt) => this.render(dt),
    });
  }

  private update(dt: number): void {
    const inp = this.services.input;
    if (!this.polled) {
      inp.beginFrame();
      this.polled = true;
      this.firstStep = true;
    }
    this.attachGolemSegment();
    this.states.update(dt);
    if (this.firstStep) {
      if (inp.pressed('dev')) this.devTools.toggle();
      const inMission = this.states.is('mission') && !this.mission.pausedOverlay && !this.mission.ended;
      const inTrial = this.states.is('challenge') && !this.challenge.pausedOverlay && !this.challenge.ended;
      if (!inMission && !inTrial) this.ui.navUpdate();
      this.devTools.update(dt);
      if (this.states.is('title')) this.ui.update(dt, null, false, null);
    }
    inp.consumeEdges();
    this.firstStep = false;
  }

  private render(dt: number): void {
    this.states.render(dt);
    this.polled = false;
  }

  currentWorld(): World | null {
    if (this.states.is('mission')) return this.mission.world;
    if (this.states.is('challenge')) return this.challenge.world;
    return null;
  }

  /** Installs / removes the golem flight segment whenever the Sector 2 world is (re)built. */
  private attachGolemSegment(): void {
    const w = this.states.is('mission') ? this.mission.world : null;
    if (w === this.golemWorld) return;
    if (this.golemSeg) this.golemSeg.dispose();
    this.golemSeg = w ? installGolemSegment(w) : null;
    this.golemWorld = w;
  }

  persist(): void {
    writeSave(this.services.save);
  }

  private autoPause(): void {
    if (this.states.is('mission') && !this.mission.ended && !this.mission.pausedOverlay) this.mission.pause();
    if (this.states.is('challenge') && !this.challenge.ended && !this.challenge.pausedOverlay) this.challenge.pause();
  }

  applySettings(): void {
    const s = this.services.settings;
    const { engine, input, audio } = this.services;
    audio.setVolumes({ master: s.master, sfx: s.sfx, music: s.music * dbGain(AUDIO_MIX.music), voice: s.voice });
    input.scheme = s.controlScheme;
    input.hapticsEnabled = s.haptics;
    if (engine.pixelStyle !== s.pixelStyle) engine.setPixelStyle(s.pixelStyle);
    if (s.quality === 'auto') engine.setQuality(engine.quality, true);
    else engine.setQuality(QUALITY[s.quality], false);
    const w = this.currentWorld();
    if (w) w.camRig.reducedMotion = s.reducedMotion;
    this.ui.stage.classList.toggle('reduced-motion', s.reducedMotion);
  }

  private onQuality(q: QualityLevel, auto: boolean): void {
    const w = this.currentWorld() || (this.states.is('title') ? this.title.world : null);
    if (w) {
      w.particles.density = q === 2 ? 1 : q === 1 ? 0.65 : 0.4;
      w.lights.enabled = q === 0 ? 3 : 6;
      w.sun.castShadow = q > 0;
      const size = q === 2 ? 2048 : 1024;
      if (w.sun.shadow.mapSize.x !== size) {
        if (w.sun.shadow.map) { w.sun.shadow.map.dispose(); (w.sun.shadow as { map: unknown }).map = null; }
        w.sun.shadow.mapSize.set(size, size);
      }
    }
    if (auto) this.ui.toast(`Graphics quality lowered to ${['Low', 'Medium', 'High'][q]} to keep the frame rate smooth`);
  }

  // ------------------------------------------------------------ UI actions

  uiAction(name: string, data?: unknown): void {
    const save = this.services.save;
    switch (name) {
      case 'playCampaign':
        if (!save.campaign.introSeen) this.playIntro(() => this.ui.go('campaign'));
        else this.ui.go('campaign');
        break;
      case 'intro':
        this.playIntro(() => this.ui.go('campaign'));
        break;
      case 'deploy':
        this.startMission(data as number, false);
        break;
      case 'speedrun':
        this.startMission(data as number, true);
        break;
      case 'pause':
        if (this.states.is('challenge')) this.challenge.pause();
        else this.mission.pause();
        break;
      case 'resume':
        if (this.states.is('challenge')) this.challenge.resume();
        else this.mission.resume();
        break;
      case 'restartCheckpoint':
      case 'restartMission':
        if (this.states.is('mission')) {
          this.ui.hideScreens();
          if (name === 'restartCheckpoint') this.mission.restartCheckpoint();
          else this.mission.restartMission();
        } else if (this.states.is('challenge')) {
          this.ui.hideScreens();
          this.challenge.restart();
        }
        break;
      case 'trial':
        this.ui.hideScreens();
        this.states.change('challenge', { trial: data as TrialId });
        break;
      case 'toTitleScreen':
        this.toTitle(data as string);
        break;
      case 'mainMenu':
        this.toTitle('title');
        break;
      case 'nextMission': {
        const next = Math.min(3, this.mission.params.sector + 1);
        this.toTitle('briefing', next);
        break;
      }
      case 'replay':
        this.startMission(this.mission.params.sector, !!this.mission.params.speedrun);
        break;
      case 'applySettings':
        this.applySettings();
        break;
      case 'continueCheckpoint': {
        // v1.3: resume the checkpoint saved before the page was closed
        const cp = save.campaign.checkpoint;
        const level = cp ? this.levels[cp.sector] : null;
        if (!cp || !level || cp.zone <= 0 || cp.zone >= level.zones.length) { this.ui.go('campaign'); break; }
        this.ui.hideScreens();
        this.states.change('mission', {
          sector: cp.sector, startZone: cp.zone,
          stats: { ...emptyStats(), ...(cp.stats || {}) },
          consumables: cp.consumables || null,
        });
        this.ui.banner('CHECKPOINT RESTORED', 'checkpoint');
        break;
      }
      case 'fullscreen':
        this.toggleFullscreen();
        break;
      case 'exportPlaytest':
        this.ui.openExport('Playtest Records', `riftbound-playtest-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ game: 'riftbound', version: VERSION, runs: save.stats.playtest || [] }, null, 1));
        break;
      case 'resetSave': {
        this.services.save = resetSave(this.services.settings);
        this.applySettings();
        this.ui.go('title');
        break;
      }
    }
  }

  /** v1.3: fullscreen + landscape lock where the browser allows it (Android Chrome, desktop). */
  private toggleFullscreen(): void {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        void doc.exitFullscreen().catch(() => undefined);
        return;
      }
      const req = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      void req.then(() => {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        if (o && o.lock) o.lock('landscape').catch(() => undefined);
      }).catch(() => this.ui.toast('Fullscreen is not available in this view'));
    } catch {
      this.ui.toast('Fullscreen is not available in this view');
    }
  }

  private toTitle(screen: string, data?: unknown): void {
    if (!this.states.is('title')) this.states.change('title');
    this.ui.showHud(false);
    this.ui.go(screen, data);
  }

  startMission(sector: number, speedrun: boolean): void {
    this.ui.hideScreens();
    this.states.change('mission', { sector, speedrun });
  }

  playIntro(after: () => void): void {
    this.ui.hideScreens();
    this.states.change('story', {
      kind: 'intro',
      onDone: () => {
        this.services.save.campaign.introSeen = true;
        this.persist();
        this.toTitle('title');
        after();
      },
    });
  }

  playEnding(after: () => void): void {
    // the mission world stays alive for the results screen: render the story on top
    const story = this.story;
    story.enter({ kind: 'ending', onDone: () => { story.exit(); this.endingActive = false; after(); } });
    this.endingActive = true;
    let last = performance.now();
    const tick = (now: number) => {
      if (!this.endingActive) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      story.update(dt);
      story.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  private endingActive = false;

  onMissionEnd(): void {
    /* results flow is handled by MissionScene */
  }

  trialTouchRules(): { hide: Action[]; aim: Action | null } | null {
    return this.states.is('challenge') ? this.challenge.touchRules() : null;
  }

  handleGlobalKeys(w: World): void {
    const inp = this.services.input;
    if (inp.pressed('freecam')) this.devAction('freecam');
    if (inp.pressed('orbit')) this.devAction('orbit');
    if (inp.pressed('screenshot')) this.devAction('shot');
    if (w.camRig.mode === 'free') w.cinematicLock = true;
  }

  // ------------------------------------------------------------ dev tools

  perfText(): string {
    const e = this.services.engine;
    const w = this.currentWorld();
    return [
      `FPS ${e.fps.toFixed(1)}  frame ${e.frameMs.toFixed(2)} ms`,
      `draw calls ${e.drawCalls}  tris ${e.triangles}`,
      `quality ${e.quality}${e.autoQuality ? ' (auto)' : ''}  pixel ratio ${e.pixelRatio.toFixed(2)}`,
      w ? `actors ${w.actors.length}  particles ${w.particles.count}  colliders ${w.phys.all.length}` : 'no mission',
      `build v${VERSION}`,
    ].join('\n');
  }

  devAction(name: string, arg?: unknown): void {
    const w = this.currentWorld();
    const ui = this.ui;
    switch (name) {
      case 'squad':
        if (w) {
          const kinds: EnemyKind[] = ['trooper', 'trooper', 'trooper', 'officer'];
          kinds.forEach((k, i) => {
            const e = w.spawnEnemy(k, w.player.x + 9 + i, w.player.z - 6 + (i % 2) * 2, w.activeZone, null);
            if (e) e.alerted = true;
          });
        }
        break;
      case 'heli':
        if (w) w.runEvent({ on: 'enter', do: 'heli', x: w.player.x + 6, z: w.player.z - 6 }, w.activeZone);
        break;
      case 'killAll':
        if (w) {
          for (const a of w.actors) {
            if (!a.alive || a.faction !== 'army') continue;
            if (a instanceof GoliathTank) {
              for (const p of a.pylons) if (p.alive) p.damage({ amount: 1e6, type: 'explosive' });
              a.phase = 'assault';
              a.rebooted = true;
            }
            a.damage({ amount: 1e7, type: 'explosive', source: w.player, spell: 'combo' });
          }
        }
        break;
      case 'completeZone':
        if (w) this.completeZone(w);
        break;
      case 'well':
        if (w) w.interactables.push(new ManaWell(w, w.player.x + 2.5, w.player.z + 1));
        break;
      case 'golem':
        if (w) w.spawnAllyGolem(w.player.x + 2, w.player.z + 2, 60);
        break;
      case 'sector':
        this.startMission(arg as number, false);
        break;
      case 'freecam':
        if (w) {
          const free = w.camRig.mode !== 'free';
          w.camRig.mode = free ? 'free' : 'follow';
          w.cinematicLock = free;
          ui.toast(free ? 'FREE CAMERA (WASD to pan, F8 to exit)' : 'Camera follow restored');
        }
        break;
      case 'orbit':
        if (w) {
          const orbit = w.camRig.mode !== 'orbit';
          w.camRig.mode = orbit ? 'orbit' : 'follow';
          w.camRig.orbitDist = 16;
          w.camRig.orbitPitch = 0.6;
          w.camRig.orbitSpeed = 0.35;
          ui.toast(orbit ? 'ORBIT CAMERA (F7 to exit)' : 'Camera follow restored');
        }
        break;
      case 'shot':
        this.screenshot();
        break;
      case 'exportStats':
        if (w) this.ui.openExport('Mission Stats', `riftbound-stats-${w.level.id}-${Date.now()}.json`, JSON.stringify({ version: VERSION, level: w.level.id, zone: w.activeZone, stats: w.stats, fps: this.services.engine.fps }, null, 2));
        break;
      case 'exportSave':
        this.ui.openExport('Save Data', `riftbound-save-${Date.now()}.json`, JSON.stringify(this.services.save, null, 2));
        break;
      case 'importSave':
        pickFile('application/json,.json', (text) => {
          const s = importSave(text);
          if (!s) { ui.toast('Import failed: not a Riftbound save'); return; }
          this.services.save = s;
          this.persist();
          this.applySettings();
          ui.toast('Save imported');
          if (this.states.is('title')) ui.go('title');
        });
        break;
      case 'resetSave':
        if (window.confirm('Reset all save data?')) this.uiAction('resetSave');
        break;
    }
  }

  private completeZone(w: World): void {
    const zi = w.activeZone;
    const z = w.objectives.zones[zi];
    for (const o of z.objs) {
      const tag = o.data.tag;
      for (const a of w.actors) {
        if (!a.alive) continue;
        if (a instanceof Catalyst && (!tag || a.tag === tag)) { a.awakened = true; a.defendT = a.duration; continue; }
        if (a.faction !== 'army') continue;
        if ((o.data.type === 'eliminate' && a instanceof VanguardEnemy && a.zone === zi) || (tag && a.tag === tag)) {
          if (a instanceof GoliathTank) { for (const p of a.pylons) p.damage({ amount: 1e6, type: 'explosive' }); a.phase = 'assault'; a.rebooted = true; }
          a.damage({ amount: 1e7, type: 'explosive' });
        }
      }
      for (const it of w.interactables) if (tag && it.tag === tag && !it.done) it.interact(w, w.player);
    }
  }

  private screenshot(): void {
    const w = this.currentWorld() || (this.states.is('title') ? this.title.world : null);
    if (!w) return;
    const e = this.services.engine;
    const r = e.renderer;
    const prev = r.getPixelRatio();
    try {
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      w.render(r);
      const url = r.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `riftbound-${w.level.id}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      this.ui.toast('SCREENSHOT SAVED');
    } catch (err) {
      console.warn('screenshot failed', err);
    } finally {
      r.setPixelRatio(prev);
    }
  }
}
