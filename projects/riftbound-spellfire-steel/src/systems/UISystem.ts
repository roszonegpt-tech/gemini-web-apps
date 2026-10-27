// UI orchestration: menu screens with full keyboard / gamepad focus navigation and
// hover sounds, the HUD, 2D overlay, minimap, touch controls, banners, subtitles and
// screen flashes. Game logic talks to the UI only through this class.
import { SECTORS } from '../config/balance';
import type { LevelData } from '../config/types';
import type { Action } from '../core/Input';
import type { Services } from '../core/Services';
import { ArcaneGolem, GOLEM } from '../entities/ArcaneGolem';
import { FIRST_CLEAR_SHARDS, SHARDS_PER_STAR, TRIALS, totalTrialStars, type TrialResult } from '../scenes/ChallengeScene';
import type { World } from '../scenes/World';
import { formatTime } from '../utils/math';
import { Hud } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';
import { Overlay2D } from '../ui/Overlay2D';
import {
  briefingScreen, campaignScreen, creditsScreen, defeatScreen, mapScreen, pauseScreen, resultsScreen,
  sanctumScreen, settingsScreen, titleScreen, type ResultsData, type ScreenHost,
} from '../ui/Screens';
import { TouchControls, type TouchContext } from '../ui/TouchControls';
import { downloadText } from './DevTools';
import { escapeHtml } from '../ui/Hud';

export interface UiGame {
  services: Services;
  levels: LevelData[];
  uiAction(name: string, data?: unknown): void;
  currentWorld(): World | null;
  /** v1.3: touch-control rules of the running Challenge Trial (null outside trials). */
  trialTouchRules?(): { hide: Action[]; aim: Action | null } | null;
}

/** v1.4: phones / small tablets held upright get the portrait layout. */
export const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 900px)';

/** v1.4: data for the export panel (copyable text + download). */
export interface ExportData {
  title: string;
  file: string;
  text: string;
  back: { screen: string | null; data: unknown };
}

/** v1.3: short SPELL-button labels for the secondary spells. */
const SPELL_SHORT: Record<string, string> = { flameBurst: 'FLAME', chainLightning: 'CHAIN', vortexSurge: 'VORTEX', meteorStrike: 'METEOR' };

/** Extra screen builders registered by later modules (v1.1 challenge trials …). */
export type ScreenBuilder = (ui: UISystem, data: unknown) => HTMLElement;

const FOCUSABLE = 'button:not([disabled]), input, select, [tabindex="0"], .sector-card, .slot';

export class UISystem implements ScreenHost {
  game: UiGame;
  stage: HTMLElement;
  screensEl: HTMLElement;
  hud: Hud;
  overlay: Overlay2D;
  minimap: Minimap;
  touch: TouchControls;
  current: string | null = null;
  currentData: unknown = null;
  mapCache = new Map<string, HTMLCanvasElement>();
  extraScreens = new Map<string, ScreenBuilder>();
  private hudEl: HTMLElement;
  private bannerEl: HTMLElement;
  private subsEl: HTMLElement;
  private flashEl: HTMLElement;
  private vignetteEl: HTMLElement;
  private currentEl: HTMLElement | null = null;
  private lastHover = 0;
  private lastBanner = '';
  private lastBannerT = 0;
  private heartbeatT = 0;
  // v1.4 portrait layout: the 16:9 view sits at the top, status + controls fill the space below
  portrait = false;
  private portraitMq: MediaQueryList;
  private portraitPad: HTMLElement;
  private ppTop: HTMLElement;
  private ppControls: HTMLElement;
  private hudTl: HTMLElement;
  private hudTc: HTMLElement;
  private keepOutT = 0;
  private golemHud: HTMLElement;
  private golemArmor: HTMLElement;
  private golemHeat: HTMLElement;
  private golemText: HTMLElement;
  private golemName: HTMLElement;

  constructor(game: UiGame) {
    this.game = game;
    this.stage = document.getElementById('stage') as HTMLElement;
    this.screensEl = document.getElementById('screens') as HTMLElement;
    this.hudEl = document.getElementById('hud') as HTMLElement;
    this.bannerEl = document.getElementById('banner-area') as HTMLElement;
    this.subsEl = document.getElementById('subtitles') as HTMLElement;
    this.flashEl = document.getElementById('flash') as HTMLElement;
    this.vignetteEl = document.getElementById('vignette') as HTMLElement;
    this.hud = new Hud(this.hudEl);
    this.overlay = new Overlay2D(document.getElementById('fx2d') as HTMLCanvasElement);
    this.minimap = new Minimap(this.hud.minimap);
    this.touch = new TouchControls(document.getElementById('touch') as HTMLElement, game.services.input);
    this.touch.onPause = () => game.uiAction('pause');
    // v1.1: Arcane Golem armour + beam heat gauges (shown while mounted)
    this.golemHud = document.createElement('div');
    this.golemHud.className = 'golem-hud hidden';
    this.golemHud.innerHTML = '<div class="golem-name" style="font-size:0.8em;letter-spacing:0.15em;color:#9cf6ff;text-shadow:0 1px 2px #000">ARCANE GOLEM</div>'
      + '<div class="bar"><div class="fill" data-g="armor" style="background:linear-gradient(90deg,#6a6478,#b2acc6)"></div><div class="txt" data-g="txt"></div></div>'
      + '<div class="bar" style="height:0.6em"><div class="fill" data-g="heat" style="background:linear-gradient(90deg,#4fc8ff,#ffb04a,#ff4a2a)"></div></div>';
    this.hudEl.appendChild(this.golemHud);
    this.golemArmor = this.golemHud.querySelector('[data-g="armor"]') as HTMLElement;
    this.golemHeat = this.golemHud.querySelector('[data-g="heat"]') as HTMLElement;
    this.golemText = this.golemHud.querySelector('[data-g="txt"]') as HTMLElement;
    this.golemName = this.golemHud.querySelector('.golem-name') as HTMLElement;
    this.screensEl.addEventListener('mouseover', (e) => {
      const t = (e.target as HTMLElement).closest('.btn, .sector-card, .slot');
      if (t && performance.now() - this.lastHover > 60) {
        this.lastHover = performance.now();
        this.playUi('uiHover');
      }
    });
    this.screensEl.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      if (t.matches('.btn, .sector-card, .slot') && performance.now() - this.lastHover > 60) {
        this.lastHover = performance.now();
        this.playUi('uiHover');
      }
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    // v1.4: portrait pad (status strip + controls) and the export panel
    this.hudTl = this.hudEl.querySelector('.hud-tl') as HTMLElement;
    this.hudTc = this.hudEl.querySelector('.hud-tc') as HTMLElement;
    this.portraitPad = document.createElement('div');
    this.portraitPad.id = 'portrait-pad';
    this.portraitPad.className = 'hidden';
    this.ppTop = document.createElement('div');
    this.ppTop.className = 'pp-top hidden';
    this.ppControls = document.createElement('div');
    this.ppControls.className = 'pp-controls';
    this.portraitPad.append(this.ppTop, this.ppControls);
    document.body.appendChild(this.portraitPad);
    this.portraitMq = window.matchMedia(PORTRAIT_QUERY);
    const onChange = () => this.applyPortrait();
    if (this.portraitMq.addEventListener) this.portraitMq.addEventListener('change', onChange);
    else this.portraitMq.addListener(onChange);
    this.applyPortrait();
    this.extraScreens.set('export', (ui, data) => ui.exportScreen(data as ExportData));
  }

  // ------------------------------------------------------------ ScreenHost

  get save() { return this.game.services.save; }
  get levels() { return this.game.levels; }

  playUi(name: string): void {
    this.game.services.audio.play(name, { throttle: 0.02 });
  }

  persist(): void {
    this.game.services.persist();
  }

  action(name: string, data?: unknown): void {
    if (name === 'refocus') { this.autofocus(); return; }
    this.game.uiAction(name, data);
  }

  go(screen: string, data?: unknown): void {
    this.current = screen;
    this.currentData = data === undefined ? null : data;
    let el: HTMLElement;
    switch (screen) {
      case 'title': el = titleScreen(this); break;
      case 'campaign': el = campaignScreen(this); break;
      case 'briefing': el = briefingScreen(this, data as number, this.mapCache); break;
      case 'sanctum': el = sanctumScreen(this, data); break;
      case 'settings': el = settingsScreen(this, data); break;
      case 'credits': el = creditsScreen(this); break;
      case 'challenges': el = this.trialsScreen(); break;
      case 'trialResults': el = this.trialResultsScreen(data as TrialResult); break;
      case 'pause': el = pauseScreen(this); break;
      case 'map': {
        const w = this.game.currentWorld();
        if (!w) return;
        el = mapScreen(this, w.level, w.objectives.hudLines(), this.mapCache, w.player.x, w.player.z);
        break;
      }
      case 'results': el = resultsScreen(this, data as ResultsData); break;
      case 'defeat': el = defeatScreen(this, data as string); break;
      default: {
        const b = this.extraScreens.get(screen);
        if (!b) return;
        el = b(this, data);
      }
    }
    this.screensEl.innerHTML = '';
    this.screensEl.appendChild(el);
    this.currentEl = el;
    this.autofocus();
  }

  hideScreens(): void {
    this.screensEl.innerHTML = '';
    this.current = null;
    this.currentEl = null;
  }

  private autofocus(): void {
    const el = this.currentEl;
    if (!el) return;
    const f = (el.querySelector('[data-autofocus]') as HTMLElement | null) || (el.querySelector(FOCUSABLE) as HTMLElement | null);
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 0);
  }

  private focusables(): HTMLElement[] {
    if (!this.currentEl) return [];
    return Array.from(this.currentEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => e.offsetParent !== null);
  }

  private moveFocus(dir: number): void {
    const list = this.focusables();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const n = list[(i + dir + list.length) % list.length];
    n.focus({ preventScroll: false });
  }

  back(): void {
    const el = this.currentEl;
    if (!el) return;
    const b = el.dataset.back;
    if (b === 'none') return;
    if (b === 'resume') { this.game.uiAction('resume'); return; }
    const btn = el.querySelector('[data-act="back"]') as HTMLElement | null;
    if (btn) { btn.click(); return; }
    if (b) this.go(b);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.currentEl || this.game.services.input.gameplayActive) return;
    const t = e.target as HTMLElement;
    const isRange = t instanceof HTMLInputElement && t.type === 'range';
    const isSelect = t instanceof HTMLSelectElement;
    if (e.code === 'ArrowDown' || (e.code === 'KeyS' && !isRange)) { if (!isSelect) { e.preventDefault(); this.moveFocus(1); } }
    else if (e.code === 'ArrowUp' || (e.code === 'KeyW' && !isRange)) { if (!isSelect) { e.preventDefault(); this.moveFocus(-1); } }
    else if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft') && !isRange && !isSelect) { e.preventDefault(); this.moveFocus(e.code === 'ArrowRight' ? 1 : -1); }
    else if (e.code === 'Escape') { e.preventDefault(); this.playUi('uiBack'); this.back(); }
  }

  /** Gamepad menu navigation (keyboard uses native focus + onKey). */
  navUpdate(): void {
    const inp = this.game.services.input;
    if (!this.currentEl || inp.lastDevice !== 'pad') return;
    if (inp.pressed('down') || inp.pressed('right')) this.moveFocus(1);
    if (inp.pressed('up') || inp.pressed('left')) this.moveFocus(-1);
    if (inp.pressed('confirm')) {
      const a = document.activeElement as HTMLElement | null;
      if (a && this.currentEl.contains(a)) {
        if (a instanceof HTMLInputElement && a.type === 'checkbox') { a.checked = !a.checked; a.dispatchEvent(new Event('input')); }
        else a.click();
      } else this.autofocus();
    }
    if (inp.pressed('back')) { this.playUi('uiBack'); this.back(); }
  }

  // ------------------------------------------------------------ HUD / feedback

  showHud(on: boolean): void {
    this.hudEl.classList.toggle('hidden', !on);
    this.ppTop.classList.toggle('hidden', !on);
    if (!on) {
      this.overlay.clear();
      this.vignetteEl.className = '';
      this.touch.show(false, 0);
    }
  }

  updateTouchVisibility(gameplay: boolean): void {
    const s = this.game.services.settings;
    const inp = this.game.services.input;
    const want = gameplay && (s.touchMode === 'on' || (s.touchMode === 'auto' && (inp.lastDevice === 'touch' || (this.game.services.engine.isMobile && inp.lastDevice !== 'pad' && inp.lastDevice !== 'kbm'))));
    if (want !== this.touch.visible) this.touch.show(want, s.touchOpacity);
    if (want) this.touch.configure(s.touchSize, s.touchHanded, s.touchOpacity);
  }

  /** v1.3: builds the touch button context — riding the golem, trial rules, current spell, cooldowns. */
  private touchContext(w: World): TouchContext {
    const p = w.player;
    const g = w.mountTarget;
    if (g instanceof ArcaneGolem && g.alive && p.mounted) {
      return {
        mode: 'golem',
        hide: g.canDismount() ? [] : ['interact'],
        aim: 'fire1',
        spell: '',
        cooldown: { blink: g.dashCd / GOLEM.dashCd, fire2: g.volleyCd / GOLEM.volleyCd },
        badge: {},
      };
    }
    const rules = this.game.trialTouchRules ? this.game.trialTouchRules() : null;
    const sec = p.secondary;
    return {
      mode: 'foot',
      hide: rules ? rules.hide : [],
      aim: rules ? rules.aim : 'fire1',
      spell: sec === 'flameBurst' && w.services.save.spells.inferno ? 'INFERNO' : SPELL_SHORT[sec] || 'SPELL',
      cooldown: { blink: p.cooldownFrac('blink'), fire2: p.cooldownFrac(sec) },
      badge: { potion: String(p.hpPotions + p.manaPotions), bomb: String(p.bombs) },
    };
  }

  banner(text: string, kind = 'info'): void {
    const now = performance.now();
    if (text === this.lastBanner && now - this.lastBannerT < 1500) return;
    this.lastBanner = text;
    this.lastBannerT = now;
    const d = document.createElement('div');
    d.className = `banner ${kind}`;
    d.textContent = text;
    const wrap = document.createElement('div');
    wrap.appendChild(d);
    this.bannerEl.appendChild(wrap);
    while (this.bannerEl.children.length > 3) this.bannerEl.removeChild(this.bannerEl.firstChild as Node);
    const life = kind === 'big' ? 3200 : 2400;
    setTimeout(() => d.classList.add('out'), life);
    setTimeout(() => wrap.remove(), life + 600);
    if (kind === 'objective' || kind === 'checkpoint') this.playUi('chime');
  }

  subtitle(who: string, text: string, dur: number): void {
    if (!this.game.services.settings.subtitles) return;
    const d = document.createElement('div');
    d.innerHTML = `<span class="sub"><span class="who">${escapeHtml(who)}:</span>${escapeHtml(text)}</span>`;
    this.subsEl.appendChild(d);
    while (this.subsEl.children.length > 2) this.subsEl.removeChild(this.subsEl.firstChild as Node);
    setTimeout(() => d.remove(), dur * 1000);
  }

  clearSubtitles(): void {
    this.subsEl.innerHTML = '';
    this.bannerEl.innerHTML = '';
  }

  flash(kind: 'ward' | 'white' | 'hurt'): void {
    if (this.game.services.settings.reducedMotion && kind !== 'hurt') return;
    this.flashEl.className = '';
    void this.flashEl.offsetWidth;
    this.flashEl.className = kind;
  }

  hit(dir: number, amount: number): void {
    this.overlay.addHit(dir, amount);
    if (amount > 8) this.flash('hurt');
  }

  /** Per-frame HUD refresh while a World is active. */
  update(dt: number, w: World | null, gameplay: boolean, timer: number | null): void {
    const svc = this.game.services;
    this.stage.classList.toggle('reduced-motion', svc.settings.reducedMotion);
    this.updateTouchVisibility(gameplay && !!w);
    if (!w) return;
    if (this.touch.visible) this.touch.setContext(this.touchContext(w));
    if (gameplay) this.updateKeepOut(dt);
    if (!gameplay) {
      this.overlay.clear();
      return;
    }
    const eng = svc.engine;
    const fps = svc.settings.showFps || svc.dev.colliders || svc.dev.nav ? `${eng.fps.toFixed(0)} FPS\n${eng.frameMs.toFixed(1)} ms\n${eng.drawCalls} draws\nQ${eng.quality} px${eng.pixelRatio.toFixed(2)}` : null;
    this.hud.update(w, dt, svc.input.lastDevice, timer, fps);
    this.minimap.draw(w, svc.settings.colorblind, dt);
    this.overlay.draw(w, svc.input, svc.settings, dt, gameplay && !w.cinematicLock);
    const p = w.player;
    const lowHp = p.alive && p.hp / p.maxHp < 0.28;
    const manaFull = p.alive && p.mana >= p.maxMana - 0.5;
    const cls = lowHp ? 'low-hp' : manaFull ? 'mana-full' : '';
    if (this.vignetteEl.className !== cls) this.vignetteEl.className = cls;
    if (lowHp) {
      this.heartbeatT -= dt;
      if (this.heartbeatT <= 0) { this.heartbeatT = 1.0; svc.audio.play('heartbeat', { vol: 0.6 }); }
    }
    if (p.wardBreakFlash > 0.35) this.flash('ward');
    // golem gauges
    const g = w.mountTarget;
    if (g instanceof ArcaneGolem && g.alive) {
      this.golemHud.classList.remove('hidden');
      this.golemArmor.style.width = `${Math.max(0, (g.hp / g.maxHp) * 100).toFixed(1)}%`;
      this.golemHeat.style.width = `${(g.heat * 100).toFixed(1)}%`;
      const keys = svc.input.lastDevice === 'pad' ? ['R2', 'R1', 'A', 'L2'] : svc.input.lastDevice === 'touch' ? ['AIM', 'VOLLEY', 'DASH', 'BRACE'] : ['LMB', 'RMB', 'SPACE', 'SHIFT'];
      const t = `STONE ARMOUR ${Math.ceil(g.hp)} / ${GOLEM.hp}${g.overheat > 0 ? ' · BEAM OVERHEATED' : ''}`;
      if (this.golemText.textContent !== t) this.golemText.textContent = t;
      const n = `ARCANE GOLEM · ${keys[0]} beam · ${keys[1]} volley · ${keys[2]} dash · ${keys[3]} brace`;
      if (this.golemName.textContent !== n) this.golemName.textContent = n;
    } else if (!this.golemHud.classList.contains('hidden')) this.golemHud.classList.add('hidden');
  }

  // ------------------------------------------------------------ v1.1 challenge trial screens

  private stars(n: number): string {
    let s = '';
    for (let i = 0; i < 3; i++) s += i < n ? '★' : '<span class="off">★</span>';
    return `<span class="stars">${s}</span>`;
  }

  private trialsScreen(): HTMLElement {
    const save = this.save;
    const c = save.campaign;
    const total = totalTrialStars(this.game.services);
    const wrap = document.createElement('div');
    wrap.className = 'screen cosmic';
    wrap.dataset.back = 'title';
    const trials = TRIALS.map((t) => {
      const rec = save.challenges[t.id];
      const best = rec ? `Best ${rec.bestTime !== null ? formatTime(rec.bestTime) : '—'} · score ${rec.bestScore}` : 'Not yet attempted';
      return `<div class="up-row"><div><b>${t.short} · ${escapeHtml(t.name)}</b> <span style="color:var(--muted);font-size:0.8em">(${escapeHtml(t.rules)})</span>
        <div class="desc">${escapeHtml(t.desc)}</div><div class="desc">★ ${t.stars.map(escapeHtml).join(' · ★ ')}</div><div class="desc">${best}</div></div>
        <div>${this.stars(rec ? rec.stars : 0)}</div>
        <button class="btn small center" data-trial="${t.id}">Play</button></div>`;
    }).join('');
    const runs = SECTORS.map((m, i) => {
      const ok = c.completed[i];
      const best = c.bestTimes[i];
      return `<div class="up-row"><div><b>Speedrun · Sector ${i + 1}: ${m.name}</b><div class="desc">${ok ? `Best clear: ${best ? formatTime(best) : '—'}` : 'Complete this sector in the campaign to unlock.'}</div></div><div>${this.stars(c.stars[i])}</div>
        <button class="btn small center" data-run="${i}" ${ok ? '' : 'disabled'}>Run</button></div>`;
    }).join('');
    wrap.innerHTML = `<div class="panel sanctum">
        <h2>Challenge Trials</h2>
        <p>Challenge Stars earned: <b style="color:var(--gold)">${total} / ${TRIALS.length * 3}</b> · every new star converts into <span class="shards">${SHARDS_PER_STAR}</span> Crystal Shards (+${FIRST_CLEAR_SHARDS} for a first clear) for the Grimoire Sanctum.</p>
        ${trials}
        <h3>Sector Speedruns</h3>${runs}
        <div class="btn-row"><button class="btn primary" data-act="back" data-autofocus>Back</button></div>
      </div>`;
    wrap.querySelectorAll<HTMLButtonElement>('[data-trial]').forEach((b) => b.addEventListener('click', () => {
      this.playUi('uiClick');
      this.game.uiAction('trial', b.dataset.trial);
    }));
    wrap.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((b) => b.addEventListener('click', () => {
      this.playUi('uiClick');
      this.game.uiAction('speedrun', Number(b.dataset.run));
    }));
    (wrap.querySelector('[data-act="back"]') as HTMLElement).addEventListener('click', () => { this.playUi('uiBack'); this.go('title'); });
    return wrap;
  }

  private trialResultsScreen(r: TrialResult): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'screen cosmic';
    wrap.dataset.back = 'none';
    const reasons: Record<string, string> = { cleared: 'Trial cleared', survived: 'You survived the barrage', timeout: 'Time expired', fallen: 'Fallen in battle' };
    const rows: [string, string][] = [
      ['Result', reasons[r.reason] || r.reason],
      [r.trial.id === 'barrierSurvival' ? 'Time survived' : 'Time', formatTime(r.time)],
      ['Damage taken', String(Math.round(r.damage))],
      [r.trial.id === 'targetRun' ? 'Targets / kills' : 'Kills', String(r.kills)],
      ['Score', String(r.score)],
    ];
    wrap.innerHTML = `<div class="panel results">
        <h2>${r.victory ? 'Trial Complete' : 'Trial Failed'}</h2>
        <p>${escapeHtml(r.trial.short)} · ${escapeHtml(r.trial.name)}</p>
        <div style="display:flex;justify-content:space-around;align-items:center;margin:0.6em 0">
          <div><div style="color:var(--muted);font-size:0.8em">CHALLENGE STARS</div><div class="big-stars">${this.stars(r.stars)}</div></div>
          <div><div style="color:var(--muted);font-size:0.8em">CRYSTAL SHARDS</div><div class="shards" style="font-size:1.8em">+${r.shards}</div></div>
        </div>
        ${r.victory && r.stars > r.prevStars ? `<p style="color:var(--ok)">${r.stars - r.prevStars} new Challenge Star${r.stars - r.prevStars > 1 ? 's' : ''} converted into Crystal Shards!</p>` : ''}
        ${r.newBest ? '<p style="color:var(--arc)">New best score!</p>' : ''}
        <p style="font-size:0.85em">★ ${r.trial.stars.map(escapeHtml).join(' · ★ ')}</p>
        <div class="stat-grid">${rows.map(([a, b]) => `<div><span>${escapeHtml(a)}</span><b>${escapeHtml(b)}</b></div>`).join('')}</div>
        <div class="btn-row">
          <button class="btn primary" data-a="retry" data-autofocus>Retry</button>
          <button class="btn" data-a="trials">Challenge Trials</button>
          <button class="btn" data-a="sanctum">Grimoire Sanctum</button>
          <button class="btn" data-a="menu">Main Menu</button>
        </div>
      </div>`;
    const act = (a: string) => {
      this.playUi('uiClick');
      if (a === 'retry') this.game.uiAction('trial', r.trial.id);
      else if (a === 'trials') this.game.uiAction('toTitleScreen', 'challenges');
      else if (a === 'sanctum') this.game.uiAction('toTitleScreen', 'sanctum');
      else this.game.uiAction('mainMenu');
    };
    wrap.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => act(b.dataset.a as string)));
    return wrap;
  }

  resize(): void {
    const eng = this.game.services.engine;
    this.overlay.resize(eng.width, eng.height);
    this.applyPortrait();
  }

  /**
   * v1.4 portrait phones: the engine keeps its 16:9 view, so it is pinned to the top of the screen and the
   * space below becomes a handheld-style pad — status bars, objectives and subtitles in a strip, then the
   * sticks and buttons. Menus move out of the small view and fill the screen. Landscape is unchanged.
   */
  applyPortrait(): void {
    const on = this.portraitMq.matches;
    if (on === this.portrait && this.portraitPad.parentElement) return;
    this.portrait = on;
    document.body.classList.toggle('portrait-mode', on);
    this.portraitPad.classList.toggle('hidden', !on);
    const put = (el: HTMLElement, parent: HTMLElement) => { if (el.parentElement !== parent) parent.appendChild(el); };
    if (on) {
      put(this.hudTl, this.ppTop);
      put(this.hudTc, this.ppTop);
      put(this.subsEl, this.ppTop);
      put(this.touch.root, this.ppControls);
      put(this.screensEl, document.body);
    } else {
      put(this.hudTl, this.hudEl);
      put(this.hudTc, this.hudEl);
      put(this.subsEl, this.stage);
      put(this.touch.root, this.stage);
      put(this.screensEl, this.stage);
    }
  }

  /** v1.4: opens the export panel (selectable text, Copy, Download) and returns to the current screen. */
  openExport(title: string, file: string, text: string): void {
    this.go('export', { title, file, text, back: { screen: this.current, data: this.currentData } } as ExportData);
  }

  exportScreen(d: ExportData): HTMLElement {
    const root = document.createElement('div');
    root.className = 'screen cosmic';
    root.dataset.back = 'x';
    root.innerHTML = `<div class="panel export-panel">
        <h2>${escapeHtml(d.title)}</h2>
        <p>Copy the text below or download it as a file. Embedded viewers (such as the claude.ai artifact) block downloads — use Copy there.</p>
        <textarea id="export-text" class="export-text" readonly rows="9" spellcheck="false"></textarea>
        <p class="export-status" aria-live="polite"></p>
        <div class="btn-row">
          <button class="btn primary" data-act="copy" data-autofocus>Copy</button>
          <button class="btn" data-act="download">Download ${escapeHtml(d.file.replace(/^.*\./, '.'))}</button>
          <button class="btn" data-act="back">Back</button>
        </div>
      </div>`;
    const ta = root.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = d.text;
    const status = root.querySelector('.export-status') as HTMLElement;
    const act = (name: string, fn: () => void) => (root.querySelector(`[data-act="${name}"]`) as HTMLElement).addEventListener('click', () => { this.playUi('uiClick'); fn(); });
    const selectAll = () => { ta.focus(); ta.select(); };
    act('copy', () => {
      const fallback = () => {
        selectAll();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        status.textContent = ok ? 'Copied.' : 'Copy is blocked here — the text is selected, copy it manually.';
      };
      try {
        navigator.clipboard.writeText(d.text).then(() => { status.textContent = 'Copied to the clipboard.'; }, fallback);
      } catch {
        fallback();
      }
    });
    act('download', () => {
      downloadText(d.file, d.text);
      status.textContent = `Saving ${d.file}… if nothing appears, use Copy.`;
    });
    act('back', () => {
      if (d.back.screen && d.back.screen !== 'export') this.go(d.back.screen, d.back.data);
      else this.hideScreens();
    });
    return root;
  }

  /** v1.4: HUD boxes the overlay's objective labels must avoid (stage coordinates). */
  private updateKeepOut(dt: number): void {
    this.keepOutT -= dt;
    if (this.keepOutT > 0) return;
    this.keepOutT = 0.25;
    const sr = this.stage.getBoundingClientRect();
    const out: { x: number; y: number; w: number; h: number }[] = [];
    const sel = ['.objectives', '.hud-tl', '.hud-tr', '.hud-bl', '.golem-hud', '.boss-bar', '#touch .tbtn'];
    for (const q of sel) {
      this.stage.querySelectorAll<HTMLElement>(q).forEach((el) => {
        if (!el.offsetParent) return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        out.push({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });
      });
    }
    this.overlay.keepOut = out;
  }

  /** Brief "screenshot saved" style toast. */
  toast(text: string): void {
    this.banner(text, 'info');
  }
}

export type { ResultsData };
