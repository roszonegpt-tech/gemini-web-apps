// Input mapping layer: merges keyboard + mouse, virtual touch controls and the
// Gamepad API into one action-based interface. Gameplay code only ever asks for
// actions (`isDown('ward')`, `pressed('blink')`), never for raw keys or buttons.

export type Action =
  | 'fire1' | 'fire2' | 'blink' | 'ward' | 'interact' | 'channel' | 'bomb' | 'potion' | 'potionHp' | 'potionMp'
  | 'cycle' | 'spell1' | 'spell2' | 'spell3' | 'spell4' | 'pause' | 'map' | 'skip'
  | 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'
  | 'dev' | 'freecam' | 'orbit' | 'screenshot';

export type Device = 'kbm' | 'touch' | 'pad';

const KEYMAP: Record<string, Action[]> = {
  KeyW: ['up'], ArrowUp: ['up'], KeyS: ['down'], ArrowDown: ['down'],
  KeyA: ['left'], ArrowLeft: ['left'], KeyD: ['right'], ArrowRight: ['right'],
  KeyE: ['interact'], KeyR: ['channel'], KeyQ: ['bomb'], KeyF: ['potionHp'], KeyG: ['potionMp'],
  Digit1: ['spell1'], Digit2: ['spell2'], Digit3: ['spell3'], Digit4: ['spell4'],
  Escape: ['pause', 'back'], KeyP: ['pause'], Tab: ['map'], Enter: ['confirm'],
  Backquote: ['dev'], F8: ['freecam'], F7: ['orbit'], F12: ['screenshot'], F9: ['screenshot'],
};

const PAD_DEAD = 0.2;

export class Input {
  moveX = 0;
  moveY = 0;
  /** Pointer position in stage CSS pixels. */
  pointerX = 0;
  pointerY = 0;
  pointerActive = false;
  aimStickX = 0;
  aimStickY = 0;
  aimMode: 'pointer' | 'stick' = 'pointer';
  lastDevice: Device = 'kbm';
  wheel = 0;
  scheme: 'default' | 'swapped' = 'default';
  gameplayActive = false;
  hapticsEnabled = true;
  padConnected = false;
  touchMoveX = 0;
  touchMoveY = 0;
  touchAimX = 0;
  touchAimY = 0;
  touchAimActive = false;
  onDeviceChange: ((d: Device) => void) | null = null;
  /** Raw key listener for UI (menus) that need keydown events. */
  onKey: ((e: KeyboardEvent) => void) | null = null;

  private keys = new Set<string>();
  /** Keys / buttons pressed since the last poll (kept even if already released). */
  private tapped = new Set<string>();
  private mouse = 0;
  private mouseTap = 0;
  private virtual = new Set<Action>();
  private padActions = new Set<Action>();
  private current = new Set<Action>();
  private prev = new Set<Action>();
  private stage: HTMLElement;
  private padIndex = -1;

  constructor(stage: HTMLElement) {
    this.stage = stage;
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clearAll());
    stage.addEventListener('mousemove', (e) => this.onPointer(e.clientX, e.clientY));
    stage.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.ui-interactive')) return;
      this.mouse |= 1 << e.button;
      this.mouseTap |= 1 << e.button;
      this.onPointer(e.clientX, e.clientY);
      this.setDevice('kbm');
    });
    window.addEventListener('mouseup', (e) => { this.mouse &= ~(1 << e.button); });
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    stage.addEventListener('wheel', (e) => {
      if (this.gameplayActive) {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      }
    }, { passive: false });
    stage.addEventListener('mouseleave', () => { this.pointerActive = false; });
    window.addEventListener('gamepadconnected', (e) => {
      this.padIndex = (e as GamepadEvent).gamepad.index;
      this.padConnected = true;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.padIndex = -1;
      this.padConnected = false;
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (this.onKey) this.onKey(e);
    if (typing && e.code !== 'Escape' && e.code !== 'Backquote') return;
    this.keys.add(e.code);
    this.tapped.add(e.code);
    this.setDevice('kbm');
    if (this.gameplayActive) {
      if (e.code === 'Space' || e.code === 'Tab' || e.code.indexOf('Arrow') === 0 || e.code === 'F12' || e.code === 'F8' || e.code === 'F7' || e.code === 'F9') e.preventDefault();
    } else if (e.code === 'Backquote' || e.code === 'F8' || e.code === 'F12' || e.code === 'F9') {
      e.preventDefault();
    }
  }

  private onPointer(cx: number, cy: number): void {
    const r = this.stage.getBoundingClientRect();
    this.pointerX = cx - r.left;
    this.pointerY = cy - r.top;
    this.pointerActive = true;
    this.aimMode = 'pointer';
  }

  setDevice(d: Device): void {
    if (d !== this.lastDevice) {
      this.lastDevice = d;
      if (this.onDeviceChange) this.onDeviceChange(d);
    }
  }

  setVirtual(a: Action, down: boolean): void {
    if (down) this.virtual.add(a);
    else this.virtual.delete(a);
    this.setDevice('touch');
  }

  clearAll(): void {
    this.keys.clear();
    this.tapped.clear();
    this.mouse = 0;
    this.mouseTap = 0;
    this.virtual.clear();
    this.touchMoveX = this.touchMoveY = 0;
    this.touchAimActive = false;
  }

  /** Called once per rendered frame before simulation substeps. */
  beginFrame(): void {
    this.pollPad();
    const cur = this.current;
    cur.clear();
    const keys = this.keys;
    const tapped = this.tapped;
    const has = (c: string) => keys.has(c) || tapped.has(c);
    const addKey = (code: string) => {
      const acts = KEYMAP[code];
      if (acts) for (const a of acts) cur.add(a);
    };
    keys.forEach(addKey);
    tapped.forEach(addKey);
    tapped.clear();
    const space = has('Space');
    const shift = has('ShiftLeft') || has('ShiftRight');
    if (this.scheme === 'default') {
      if (space) { cur.add('blink'); cur.add('skip'); }
      if (shift) cur.add('ward');
    } else {
      if (space) { cur.add('ward'); cur.add('skip'); }
      if (shift) cur.add('blink');
    }
    const mb = this.mouse | this.mouseTap;
    this.mouseTap = 0;
    if (mb & 1) cur.add('fire1');
    if (mb & 4) cur.add('fire2');
    this.virtual.forEach((a) => cur.add(a));
    this.padActions.forEach((a) => cur.add(a));
    if (cur.has('channel')) cur.add('interact');

    let mx = 0, my = 0;
    if (cur.has('left')) mx -= 1;
    if (cur.has('right')) mx += 1;
    if (cur.has('up')) my -= 1;
    if (cur.has('down')) my += 1;
    mx += this.touchMoveX + this.padMoveX;
    my += this.touchMoveY + this.padMoveY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.moveX = mx;
    this.moveY = my;

    if (this.touchAimActive) {
      this.aimStickX = this.touchAimX;
      this.aimStickY = this.touchAimY;
      this.aimMode = 'stick';
    } else if (Math.hypot(this.padAimX, this.padAimY) > 0.3) {
      this.aimStickX = this.padAimX;
      this.aimStickY = this.padAimY;
      this.aimMode = 'stick';
    } else if (this.lastDevice !== 'kbm') {
      this.aimStickX = this.aimStickY = 0;
    }
  }

  /** After the first simulation substep, edges are consumed so presses fire once. */
  consumeEdges(): void {
    this.prev.clear();
    this.current.forEach((a) => this.prev.add(a));
    this.wheel = 0;
  }

  isDown(a: Action): boolean {
    return this.current.has(a);
  }

  pressed(a: Action): boolean {
    return this.current.has(a) && !this.prev.has(a);
  }

  released(a: Action): boolean {
    return !this.current.has(a) && this.prev.has(a);
  }

  private padMoveX = 0;
  private padMoveY = 0;
  private padAimX = 0;
  private padAimY = 0;

  private pollPad(): void {
    this.padActions.clear();
    this.padMoveX = this.padMoveY = this.padAimX = this.padAimY = 0;
    if (!navigator.getGamepads) return;
    let pad: Gamepad | null = null;
    const pads = navigator.getGamepads();
    if (this.padIndex >= 0) pad = pads[this.padIndex] || null;
    if (!pad) {
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) { pad = pads[i]; this.padIndex = i; break; }
      }
    }
    if (!pad) return;
    this.padConnected = true;
    const dz = (v: number) => (Math.abs(v) < PAD_DEAD ? 0 : v);
    const ax = pad.axes;
    this.padMoveX = dz(ax[0] || 0);
    this.padMoveY = dz(ax[1] || 0);
    this.padAimX = dz(ax[2] || 0);
    this.padAimY = dz(ax[3] || 0);
    const b = (i: number) => !!pad && !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.4);
    const A = this.padActions;
    if (b(7)) A.add('fire1');
    if (b(5)) A.add('fire2');
    if (b(6)) A.add('ward');
    if (b(4)) A.add('bomb');
    if (b(0)) { A.add('blink'); A.add('confirm'); A.add('skip'); }
    if (b(1)) { A.add('potion'); A.add('back'); }
    if (b(2)) { A.add('interact'); A.add('channel'); }
    if (b(3)) A.add('cycle');
    if (b(9)) A.add('pause');
    if (b(8)) A.add('map');
    if (b(12)) { A.add('up'); A.add('spell1'); }
    if (b(15)) { A.add('right'); A.add('spell2'); }
    if (b(13)) { A.add('down'); A.add('spell3'); }
    if (b(14)) { A.add('left'); A.add('spell4'); }
    if (A.size > 0 || this.padMoveX || this.padMoveY || this.padAimX || this.padAimY) this.setDevice('pad');
  }

  /** Haptic feedback through the Vibration API and gamepad rumble when supported. */
  vibrate(ms: number, strength = 0.5): void {
    if (!this.hapticsEnabled) return;
    try {
      if (this.lastDevice === 'touch' && navigator.vibrate) navigator.vibrate(ms);
      if (this.lastDevice === 'pad' && navigator.getGamepads) {
        const pad = this.padIndex >= 0 ? navigator.getGamepads()[this.padIndex] : null;
        const act = pad && (pad as unknown as { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }).vibrationActuator;
        if (act && act.playEffect) {
          act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => undefined);
        }
      }
    } catch {
      /* haptics are best-effort */
    }
  }
}
