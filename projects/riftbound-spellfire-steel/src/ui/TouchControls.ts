// Virtual touch controls: floating left joystick (move), right joystick (360° aim with
// auto-cast), and large (≥48px) buttons for Blink, Ward, Spell, Use/Mana, Potion,
// Frost Bomb, spell cycle and pause. Haptic feedback where the Vibration API exists.
import type { Action, Input } from '../core/Input';

interface Stick {
  zone: HTMLElement;
  base: HTMLElement;
  knob: HTMLElement;
  id: number;
  ox: number;
  oy: number;
}

export class TouchControls {
  root: HTMLElement;
  input: Input;
  visible = false;
  onPause: (() => void) | null = null;
  private left: Stick;
  private right: Stick;

  constructor(root: HTMLElement, input: Input) {
    this.root = root;
    this.input = input;
    root.innerHTML = '';
    this.left = this.makeStick('left');
    this.right = this.makeStick('right');
    const btn = (label: string, action: Action | 'pause', right: number, bottom: number, hold = true, big = false) => {
      const b = document.createElement('button');
      b.className = `tbtn${action === 'pause' ? ' pause' : ''}${big ? ' big' : ''}`;
      b.textContent = label;
      b.setAttribute('aria-label', label);
      b.style.right = `${right}em`;
      b.style.bottom = `${bottom}em`;
      root.appendChild(b);
      const down = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('on');
        input.vibrate(12);
        if (action === 'pause') { if (this.onPause) this.onPause(); return; }
        input.setVirtual(action, true);
        if (!hold) setTimeout(() => input.setVirtual(action, false), 90);
      };
      const up = (e: PointerEvent) => {
        e.preventDefault();
        b.classList.remove('on');
        if (action !== 'pause' && hold) input.setVirtual(action, false);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      return b;
    };
    // action cluster hugging the bottom-right corner; the aim stick floats in the free area
    btn('BLINK', 'blink', 0.8, 0.8, false, true);
    btn('WARD', 'ward', 6.2, 0.6, true, true);
    btn('SPELL', 'fire2', 0.8, 6.0, true, true);
    btn('USE', 'interact', 11.4, 0.6);
    btn('POTION', 'potion', 0.8, 11.0, false);
    btn('BOMB', 'bomb', 5.2, 9.6, false);
    btn('CYCLE', 'cycle', 9.4, 5.4, false);
    const p = btn('II', 'pause', 0, 0, false);
    p.style.top = '0.6em';
    p.style.left = '29em';
    p.style.right = '';
    p.style.bottom = '';
  }

  private makeStick(side: 'left' | 'right'): Stick {
    const zone = document.createElement('div');
    zone.className = `stick-zone ${side}`;
    const base = document.createElement('div');
    base.className = 'stick-base';
    const knob = document.createElement('div');
    knob.className = 'stick-knob';
    base.appendChild(knob);
    zone.appendChild(base);
    this.root.appendChild(zone);
    const st: Stick = { zone, base, knob, id: -1, ox: 0, oy: 0 };
    const rest = () => {
      base.style.left = side === 'left' ? '30%' : '28%';
      base.style.top = side === 'left' ? '62%' : '45%';
      knob.style.transform = '';
    };
    rest();
    const R = 56;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (st.id >= 0) return;
      st.id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      st.ox = e.clientX;
      st.oy = e.clientY;
      base.style.left = `${e.clientX - r.left}px`;
      base.style.top = `${e.clientY - r.top}px`;
      this.input.setDevice('touch');
      if (side === 'right') this.input.touchAimActive = true;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== st.id) return;
      let dx = e.clientX - st.ox, dy = e.clientY - st.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / R, ny = dy / R;
      if (side === 'left') {
        this.input.touchMoveX = nx;
        this.input.touchMoveY = ny;
      } else {
        this.input.touchAimX = nx;
        this.input.touchAimY = ny;
        this.input.setVirtual('fire1', Math.hypot(nx, ny) > 0.45);
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== st.id) return;
      st.id = -1;
      rest();
      if (side === 'left') {
        this.input.touchMoveX = this.input.touchMoveY = 0;
      } else {
        this.input.touchAimActive = false;
        this.input.setVirtual('fire1', false);
      }
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    return st;
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
    }
  }
}
