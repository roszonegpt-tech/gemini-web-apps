// Virtual touch controls: floating move joystick, 360° aim joystick that auto-casts, and large
// (≥48px) action buttons. Haptic feedback where the Vibration API exists.
// v1.3: the button set follows the context (on foot / riding the Arcane Golem / Challenge Trial
// rules hide locked actions and retarget the aim stick), buttons show cooldown sweeps and the
// current spell, a MAP button, and settings for button size and a mirrored left-handed layout.
import type { Action, Input } from '../core/Input';

interface Stick {
  role: 'move' | 'aim';
  zone: HTMLElement;
  base: HTMLElement;
  knob: HTMLElement;
  id: number;
  ox: number;
  oy: number;
  rest: () => void;
}

export type TouchMode = 'foot' | 'golem';

/** What the touch layer should show this frame (built by UISystem from the World / trial rules). */
export interface TouchContext {
  mode: TouchMode;
  /** Actions locked by the current rules (their buttons are hidden). */
  hide: Action[];
  /** Action the aim stick casts while deflected (null = aim only). */
  aim: Action | null;
  /** Short name of the selected secondary spell (SPELL button label on foot). */
  spell: string;
  /** Remaining cooldown 0–1 per action (drawn as a sweep on the button). */
  cooldown: Partial<Record<Action, number>>;
  /** Small counter badges (potions / bombs left). */
  badge: Partial<Record<Action, string>>;
}

interface ButtonDef {
  action: Action;
  foot: string;
  golem: string | null; // null = hidden while riding the golem
  right: number;
  bottom: number;
  hold: boolean;
  big: boolean;
}

/** Positions are em from the bottom-right corner (mirrored to bottom-left for left-handed play). */
const BUTTONS: ButtonDef[] = [
  { action: 'blink', foot: 'BLINK', golem: 'DASH', right: 0.8, bottom: 0.8, hold: false, big: true },
  { action: 'ward', foot: 'WARD', golem: 'BRACE', right: 6.2, bottom: 0.6, hold: true, big: true },
  { action: 'fire2', foot: 'SPELL', golem: 'VOLLEY', right: 0.8, bottom: 6.0, hold: true, big: true },
  { action: 'interact', foot: 'USE', golem: 'LAND', right: 11.4, bottom: 0.6, hold: true, big: false },
  { action: 'potion', foot: 'POTION', golem: null, right: 0.8, bottom: 11.0, hold: false, big: false },
  { action: 'bomb', foot: 'BOMB', golem: null, right: 5.2, bottom: 9.6, hold: false, big: false },
  { action: 'cycle', foot: 'CYCLE', golem: null, right: 9.4, bottom: 5.4, hold: false, big: false },
];

export const TOUCH_SIZES: Record<string, number> = { small: 0.85, medium: 1, large: 1.2 };

export class TouchControls {
  root: HTMLElement;
  input: Input;
  visible = false;
  onPause: (() => void) | null = null;
  /** Current layout (read by tests). */
  mode: TouchMode = 'foot';
  lefty = false;
  aimAction: Action | null = 'fire1';
  private move: Stick;
  private aim: Stick;
  private buttons = new Map<Action, { el: HTMLButtonElement; label: HTMLElement; badge: HTMLElement; def: ButtonDef }>();
  private ctxKey = '';
  private aimFiring = false;

  constructor(root: HTMLElement, input: Input) {
    this.root = root;
    this.input = input;
    root.innerHTML = '';
    this.move = this.makeStick('move');
    this.aim = this.makeStick('aim');
    for (const def of BUTTONS) this.makeButton(def);
    this.makeTop('II', 'Pause', 'pause', () => { if (this.onPause) this.onPause(); });
    // MAP is a tap of the 'map' action (MissionScene / ChallengeScene open the dimensional map)
    this.makeTop('MAP', 'Map and objectives', 'map', () => {
      this.input.setVirtual('map', true);
      this.releaseAfterPoll('map');
    });
    this.layout();
  }

  private makeButton(def: ButtonDef): void {
    const input = this.input;
    const b = document.createElement('button');
    b.className = `tbtn${def.big ? ' big' : ''}`;
    b.dataset.action = def.action;
    const label = document.createElement('span');
    label.textContent = def.foot;
    b.appendChild(label);
    const badge = document.createElement('span');
    badge.className = 'n';
    b.appendChild(badge);
    b.setAttribute('aria-label', def.foot);
    this.root.appendChild(b);
    const down = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('on');
      input.vibrate(12);
      input.setDevice('touch');
      input.setVirtual(def.action, true);
      if (!def.hold) this.releaseAfterPoll(def.action);
    };
    const up = (e: PointerEvent) => {
      e.preventDefault();
      if (!b.classList.contains('on')) return; // pointerleave / cancel without a press
      b.classList.remove('on');
      if (def.hold) input.setVirtual(def.action, false);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    this.buttons.set(def.action, { el: b, label, badge, def });
  }

  /**
   * Releases a tapped action only after the game loop has polled input at least once (two animation
   * frames and ≥ 90 ms), so a quick tap is never lost between frames on a slow device.
   */
  private releaseAfterPoll(action: Action): void {
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => this.input.setVirtual(action, false))), 90);
  }

  private makeTop(text: string, aria: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `tbtn top ${cls}`;
    b.textContent = text;
    b.setAttribute('aria-label', aria);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.vibrate(12);
      fn();
    });
    this.root.appendChild(b);
    return b;
  }

  private makeStick(role: 'move' | 'aim'): Stick {
    const zone = document.createElement('div');
    zone.className = `stick-zone ${role}`;
    const base = document.createElement('div');
    base.className = 'stick-base';
    const knob = document.createElement('div');
    knob.className = 'stick-knob';
    base.appendChild(knob);
    zone.appendChild(base);
    this.root.appendChild(zone);
    const st: Stick = {
      role, zone, base, knob, id: -1, ox: 0, oy: 0,
      rest: () => {
        // rest spots sit towards the screen edges, mirrored for left-handed play
        const edge = role === 'move' ? 30 : 28;
        const nearLeftEdge = (role === 'move') !== this.lefty;
        base.style.left = `${nearLeftEdge ? edge : 100 - edge}%`;
        base.style.top = role === 'move' ? '62%' : '45%';
        knob.style.transform = '';
      },
    };
    const R = 56;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (st.id >= 0) return;
      st.id = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      const r = zone.getBoundingClientRect();
      st.ox = e.clientX;
      st.oy = e.clientY;
      base.style.left = `${e.clientX - r.left}px`;
      base.style.top = `${e.clientY - r.top}px`;
      this.input.setDevice('touch');
      if (role === 'aim') this.input.touchAimActive = true;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== st.id) return;
      let dx = e.clientX - st.ox, dy = e.clientY - st.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / R, ny = dy / R;
      if (role === 'move') {
        this.input.touchMoveX = nx;
        this.input.touchMoveY = ny;
      } else {
        this.input.touchAimX = nx;
        this.input.touchAimY = ny;
        this.setAimFiring(Math.hypot(nx, ny) > 0.45);
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== st.id) return;
      st.id = -1;
      st.rest();
      if (role === 'move') {
        this.input.touchMoveX = this.input.touchMoveY = 0;
      } else {
        this.input.touchAimActive = false;
        this.setAimFiring(false);
      }
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    return st;
  }

  // Input.setVirtual() also marks the device as touch, so only call it for real changes:
  // a release while nothing is pressed would flip a mouse / keyboard session into touch mode.
  private setAimFiring(on: boolean): void {
    if (on === this.aimFiring) return;
    this.aimFiring = on;
    if (this.aimAction) this.input.setVirtual(this.aimAction, on);
  }

  /** Places sticks and buttons for the current handedness. */
  private layout(): void {
    this.root.classList.toggle('lefty', this.lefty);
    for (const { el, def } of this.buttons.values()) {
      el.style.bottom = `${def.bottom}em`;
      el.style.right = this.lefty ? '' : `${def.right}em`;
      el.style.left = this.lefty ? `${def.right}em` : '';
    }
    this.move.rest();
    this.aim.rest();
  }

  /** Applies the player's touch settings (size scale, handedness, opacity). */
  configure(size: string, handed: string, opacity: number): void {
    const scale = TOUCH_SIZES[size] || 1;
    const fs = `${scale}em`;
    if (this.root.style.fontSize !== fs) this.root.style.fontSize = fs;
    const lefty = handed === 'left';
    if (lefty !== this.lefty) {
      this.lefty = lefty;
      this.layout();
    }
    this.root.style.opacity = String(opacity);
  }

  /** Updates the button set for the current context; cheap when nothing changed. */
  setContext(c: TouchContext): void {
    const key = `${c.mode}|${c.hide.join(',')}|${c.aim}|${c.spell}`;
    if (key !== this.ctxKey) {
      this.ctxKey = key;
      this.mode = c.mode;
      if (c.aim !== this.aimAction) {
        if (this.aimAction && this.aimFiring) this.input.setVirtual(this.aimAction, false);
        this.aimAction = c.aim;
        if (this.aimAction && this.aimFiring) this.input.setVirtual(this.aimAction, true);
      }
      for (const { el, label, def } of this.buttons.values()) {
        const text = c.mode === 'golem' ? def.golem : def.action === 'fire2' && c.spell ? c.spell : def.foot;
        const hidden = text === null || c.hide.indexOf(def.action) >= 0;
        el.classList.toggle('hidden', hidden);
        if (hidden) {
          if (el.classList.contains('on')) { el.classList.remove('on'); this.input.setVirtual(def.action, false); }
          continue;
        }
        if (label.textContent !== text) {
          label.textContent = text;
          el.setAttribute('aria-label', text);
        }
      }
    }
    for (const { el, badge, def } of this.buttons.values()) {
      const v = c.cooldown[def.action] || 0;
      const s = v > 0.01 ? v.toFixed(2) : '0';
      if (el.style.getPropertyValue('--cd') !== s) el.style.setProperty('--cd', s);
      const n = c.badge[def.action] || '';
      if (badge.textContent !== n) badge.textContent = n;
    }
  }

  /** Label currently shown for an action ('' when hidden) — used by tests. */
  labelOf(action: Action): string {
    const b = this.buttons.get(action);
    return b && !b.el.classList.contains('hidden') ? (b.label.textContent || '') : '';
  }

  show(on: boolean, opacity: number): void {
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    const stage = document.getElementById('stage');
    if (stage) stage.classList.toggle('touch-mode', on);
    this.root.style.opacity = String(opacity);
    if (!on) {
      this.input.touchMoveX = this.input.touchMoveY = 0;
      this.input.touchAimActive = false;
      if (this.aimFiring) this.setAimFiring(false);
      for (const { el, def } of this.buttons.values()) {
        if (el.classList.contains('on')) { el.classList.remove('on'); this.input.setVirtual(def.action, false); }
      }
    }
  }
}
