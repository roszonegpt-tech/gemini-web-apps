// Web Audio synth engine. Every sound is synthesized at runtime (no sample files),
// so the game stays tiny and 100% offline. Sounds are named "recipes"; new recipes
// can be registered from other modules with `registerRecipe` without editing this file.

export interface PlayOpts {
  x?: number;
  z?: number;
  vol?: number;
  pitch?: number;
  /** Minimum seconds between two plays of the same recipe (anti-clipping). */
  throttle?: number;
}

export interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  vol: number;
  attack?: number;
  delay?: number;
  curve?: 'exp' | 'lin';
  detune?: number;
}

export interface NoiseOpts {
  dur: number;
  vol: number;
  filter?: BiquadFilterType;
  f0?: number;
  f1?: number;
  q?: number;
  attack?: number;
  delay?: number;
}

export type Recipe = (a: AudioEngine, out: AudioNode, pitch: number) => void;

export interface LoopHandle {
  gain: GainNode;
  stop(): void;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  voiceBus!: GainNode;
  ambientBus!: GainNode;
  noiseBuffer!: AudioBuffer;
  listenerX = 0;
  listenerZ = 0;
  volumes = { master: 0.8, sfx: 0.8, music: 0.55, voice: 0.8 };
  muted = false;
  private recipes = new Map<string, Recipe>();
  private lastPlay = new Map<string, number>();
  private loops = new Map<string, LoopHandle>();
  private activeVoices = 0;
  onUnlock: (() => void) | null = null;

  constructor() {
    registerDefaultRecipes(this);
  }

  /** Must be called from a user gesture (click / key / touch) to satisfy autoplay policies. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      return;
    }
    const Ctor: typeof AudioContext | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(comp);
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.voiceBus = ctx.createGain();
      this.ambientBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.voiceBus.connect(this.master);
      this.ambientBus.connect(this.sfxBus);
      const len = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      if (this.onUnlock) this.onUnlock();
    } catch (err) {
      console.warn('[audio] Web Audio unavailable', err);
      this.ctx = null;
    }
  }

  setVolumes(v: { master: number; sfx: number; music: number; voice: number }): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.7, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(this.volumes.voice, t, 0.05);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  setListener(x: number, z: number): void {
    this.listenerX = x;
    this.listenerZ = z;
  }

  registerRecipe(name: string, fn: Recipe): void {
    this.recipes.set(name, fn);
  }

  hasRecipe(name: string): boolean {
    return this.recipes.has(name);
  }

  play(name: string, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const recipe = this.recipes.get(name);
    if (!recipe) return;
    const now = ctx.currentTime;
    const throttle = opts.throttle !== undefined ? opts.throttle : 0.03;
    const last = this.lastPlay.get(name) || 0;
    if (now - last < throttle) return;
    if (this.activeVoices > 48) return;
    this.lastPlay.set(name, now);
    let vol = opts.vol !== undefined ? opts.vol : 1;
    let pan = 0;
    if (opts.x !== undefined && opts.z !== undefined) {
      const dx = opts.x - this.listenerX, dz = opts.z - this.listenerZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 55) return;
      vol *= 1 / Math.pow(1 + d / 14, 1.3);
      pan = Math.max(-0.8, Math.min(0.8, dx / 18));
    }
    if (vol < 0.01) return;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfxBus);
    } else {
      g.connect(this.sfxBus);
    }
    this.activeVoices++;
    setTimeout(() => {
      this.activeVoices--;
      try { g.disconnect(); } catch { /* already gone */ }
    }, 2500);
    try {
      recipe(this, g, opts.pitch !== undefined ? opts.pitch : 1);
    } catch (err) {
      console.warn('[audio] recipe failed', name, err);
    }
  }

  /** Oscillator with an envelope. */
  tone(out: AudioNode, o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t0);
    if (o.f1 !== undefined) {
      if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
    }
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const atk = o.attack !== undefined ? o.attack : 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  /** Filtered noise burst with an envelope. */
  noise(out: AudioNode, o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const g = ctx.createGain();
    const atk = o.attack !== undefined ? o.attack : 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node: AudioNode = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(o.f0 || 1000, t0);
      if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
      f.Q.value = o.q !== undefined ? o.q : 0.8;
      src.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + o.dur + 0.05);
  }

  /**
   * Continuous looping sound (rain, rumble, hum…). `build` wires sources into `out` and returns
   * the source nodes to stop. Use `loopVolume` each frame to fade it.
   */
  loopVolume(name: string, vol: number, build?: (a: AudioEngine, out: GainNode) => AudioScheduledSourceNode[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    let h = this.loops.get(name);
    if (!h) {
      if (vol <= 0.001) return;
      const b = build || LOOP_BUILDERS[name];
      if (!b) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.ambientBus);
      const srcs = b(this, gain);
      h = {
        gain,
        stop: () => {
          for (const s of srcs) { try { s.stop(); } catch { /* noop */ } }
          try { gain.disconnect(); } catch { /* noop */ }
        },
      };
      this.loops.set(name, h);
    }
    h.gain.gain.setTargetAtTime(Math.max(0, vol), ctx.currentTime, 0.12);
  }

  stopLoop(name: string): void {
    const h = this.loops.get(name);
    if (h) {
      h.stop();
      this.loops.delete(name);
    }
  }

  stopAllLoops(): void {
    this.loops.forEach((h) => h.stop());
    this.loops.clear();
  }

  noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    return src;
  }
}

// ------------------------------------------------------------------ loops

const LOOP_BUILDERS: Record<string, (a: AudioEngine, out: GainNode) => AudioScheduledSourceNode[]> = {
  rain: (a, out) => {
    const ctx = a.ctx as AudioContext;
    const src = a.noiseSource() as AudioBufferSourceNode;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 7000;
    src.connect(hp); hp.connect(lp); lp.connect(out);
    src.start();
    return [src];
  },
  rift: (a, out) => {
    const ctx = a.ctx as AudioContext;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.2;
    const lfoG = ctx.createGain(); lfoG.gain.value = 120;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 4;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    const g = ctx.createGain(); g.gain.value = 0.25;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(out);
    o1.start(); o2.start(); lfo.start();
    return [o1, o2, lfo];
  },
  ward: (a, out) => {
    const ctx = a.ctx as AudioContext;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 440;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 663;
    const trem = ctx.createOscillator(); trem.frequency.value = 7;
    const tg = ctx.createGain(); tg.gain.value = 0.05;
    const g = ctx.createGain(); g.gain.value = 0.12;
    trem.connect(tg); tg.connect(g.gain);
    o1.connect(g); o2.connect(g); g.connect(out);
    o1.start(); o2.start(); trem.start();
    return [o1, o2, trem];
  },
  channel: (a, out) => {
    const ctx = a.ctx as AudioContext;
    const srcs: AudioScheduledSourceNode[] = [];
    for (const [f, form] of [[220, 750], [277, 1100], [330, 900]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = form; bp.Q.value = 6;
      const g = ctx.createGain(); g.gain.value = 0.12;
      o.connect(bp); bp.connect(g); g.connect(out);
      o.start(); srcs.push(o);
    }
    return srcs;
  },
  minigun: (a, out) => {
    const ctx = a.ctx as AudioContext;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 95;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const g = ctx.createGain(); g.gain.value = 0.25;
    o.connect(f); f.connect(g); g.connect(out); o.start();
    return [o];
  },
  engine: (a, out) => {
    const ctx = a.ctx as AudioContext;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 42;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 21;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = ctx.createGain(); g.gain.value = 0.5;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(out); o.start(); o2.start();
    return [o, o2];
  },
  rotor: (a, out) => {
    const ctx = a.ctx as AudioContext;
    const src = a.noiseSource() as AudioBufferSourceNode;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const g = ctx.createGain(); g.gain.value = 0.0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11;
    const lg = ctx.createGain(); lg.gain.value = 0.6;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(out); src.start(); lfo.start();
    return [src, lfo];
  },
  portal: (a, out) => {
    const ctx = a.ctx as AudioContext;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 110;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 165.5;
    const g = ctx.createGain(); g.gain.value = 0.2;
    o.connect(g); o2.connect(g); g.connect(out); o.start(); o2.start();
    return [o, o2];
  },
};

// ------------------------------------------------------------------ one-shot recipes

function registerDefaultRecipes(a: AudioEngine): void {
  const r = (n: string, fn: Recipe) => a.registerRecipe(n, fn);
  const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

  // --- magic
  r('bolt', (a, o, p) => {
    a.tone(o, { type: 'square', f0: 900 * p * rnd(0.95, 1.05), f1: 380 * p, dur: 0.11, vol: 0.12 });
    a.tone(o, { type: 'sine', f0: 1500 * p, f1: 700 * p, dur: 0.09, vol: 0.12 });
  });
  r('boltHit', (a, o) => {
    a.noise(o, { dur: 0.1, vol: 0.2, filter: 'bandpass', f0: 2400, f1: 900, q: 2 });
    a.tone(o, { type: 'triangle', f0: 700, f1: 300, dur: 0.1, vol: 0.12 });
  });
  r('fireCast', (a, o) => {
    a.noise(o, { dur: 0.35, vol: 0.3, filter: 'bandpass', f0: 300, f1: 1500, q: 1.2, attack: 0.05 });
    a.tone(o, { type: 'sine', f0: 180, f1: 90, dur: 0.3, vol: 0.18 });
  });
  r('fireBoom', (a, o, p) => {
    a.noise(o, { dur: 0.8, vol: 0.55, filter: 'lowpass', f0: 2200 * p, f1: 120, q: 0.7 });
    a.tone(o, { type: 'sine', f0: 140 * p, f1: 38, dur: 0.55, vol: 0.5 });
    a.noise(o, { dur: 0.5, vol: 0.15, filter: 'bandpass', f0: 600, f1: 300, q: 1, delay: 0.08 });
  });
  r('lightning', (a, o) => {
    for (let i = 0; i < 5; i++) a.noise(o, { dur: 0.06, vol: 0.28, filter: 'highpass', f0: 2600 + i * 300, q: 0.5, delay: i * 0.035 });
    a.tone(o, { type: 'sawtooth', f0: 140, f1: 70, dur: 0.35, vol: 0.18 });
    a.tone(o, { type: 'square', f0: 2200, f1: 400, dur: 0.15, vol: 0.06 });
  });
  r('vortex', (a, o) => {
    a.noise(o, { dur: 1.4, vol: 0.32, filter: 'bandpass', f0: 250, f1: 1100, q: 3, attack: 0.25 });
    a.tone(o, { type: 'sine', f0: 90, f1: 140, dur: 1.2, vol: 0.12, attack: 0.3 });
  });
  r('firestorm', (a, o) => {
    a.noise(o, { dur: 1.6, vol: 0.4, filter: 'bandpass', f0: 500, f1: 2000, q: 1.5, attack: 0.1 });
    a.tone(o, { type: 'sawtooth', f0: 70, f1: 120, dur: 1.4, vol: 0.18 });
  });
  r('meteorFall', (a, o) => {
    a.tone(o, { type: 'sine', f0: 1500, f1: 160, dur: 0.95, vol: 0.2, attack: 0.1 });
    a.noise(o, { dur: 0.95, vol: 0.2, filter: 'bandpass', f0: 3000, f1: 400, q: 1, attack: 0.3 });
  });
  r('meteorImpact', (a, o) => {
    a.noise(o, { dur: 1.4, vol: 0.8, filter: 'lowpass', f0: 2600, f1: 60, q: 0.7 });
    a.tone(o, { type: 'sine', f0: 90, f1: 25, dur: 1.0, vol: 0.8 });
    a.tone(o, { type: 'square', f0: 60, f1: 30, dur: 0.5, vol: 0.12 });
  });
  r('blink', (a, o) => {
    a.tone(o, { type: 'sine', f0: 280, f1: 1600, dur: 0.18, vol: 0.22 });
    a.noise(o, { dur: 0.16, vol: 0.16, filter: 'highpass', f0: 3000, q: 0.5 });
    a.tone(o, { type: 'triangle', f0: 1600, f1: 900, dur: 0.15, vol: 0.08, delay: 0.12 });
  });
  r('wardUp', (a, o) => {
    a.tone(o, { type: 'sine', f0: 520, f1: 880, dur: 0.25, vol: 0.16 });
    a.tone(o, { type: 'sine', f0: 780, f1: 1320, dur: 0.25, vol: 0.1 });
  });
  r('wardHit', (a, o) => {
    a.tone(o, { type: 'triangle', f0: rnd(1700, 2300), f1: 1300, dur: 0.09, vol: 0.12 });
  });
  r('wardBreak', (a, o) => {
    a.noise(o, { dur: 0.6, vol: 0.45, filter: 'highpass', f0: 2500, q: 0.6 });
    for (let i = 0; i < 6; i++) a.tone(o, { type: 'sine', f0: rnd(1800, 4200), f1: rnd(900, 1600), dur: rnd(0.15, 0.4), vol: 0.1, delay: i * 0.03 });
  });
  r('snap', (a, o) => {
    a.tone(o, { type: 'sine', f0: 1800, f1: 3200, dur: 0.12, vol: 0.2 });
    a.tone(o, { type: 'triangle', f0: 900, f1: 1800, dur: 0.18, vol: 0.12 });
  });
  r('freeze', (a, o) => {
    a.tone(o, { type: 'sine', f0: 2000, f1: 3400, dur: 0.4, vol: 0.12 });
    a.noise(o, { dur: 0.5, vol: 0.25, filter: 'highpass', f0: 5000, q: 1 });
    a.noise(o, { dur: 0.3, vol: 0.3, filter: 'lowpass', f0: 900, f1: 200, q: 1 });
  });
  r('shatter', (a, o) => {
    for (let i = 0; i < 7; i++) a.tone(o, { type: 'triangle', f0: rnd(1500, 3800), f1: rnd(800, 1400), dur: rnd(0.1, 0.35), vol: 0.1, delay: i * 0.02 });
    a.noise(o, { dur: 0.3, vol: 0.25, filter: 'highpass', f0: 3500, q: 0.8 });
  });
  r('shockwave', (a, o) => {
    a.tone(o, { type: 'sine', f0: 300, f1: 60, dur: 0.5, vol: 0.4 });
    a.noise(o, { dur: 0.4, vol: 0.25, filter: 'bandpass', f0: 1200, f1: 300, q: 1.5 });
  });
  r('throw', (a, o) => {
    a.noise(o, { dur: 0.2, vol: 0.18, filter: 'bandpass', f0: 600, f1: 1400, q: 2, attack: 0.04 });
  });
  r('potion', (a, o) => {
    for (let i = 0; i < 3; i++) a.tone(o, { type: 'sine', f0: 260 + i * 60, f1: 480 + i * 80, dur: 0.1, vol: 0.18, delay: i * 0.11 });
    a.tone(o, { type: 'sine', f0: 880, f1: 1320, dur: 0.3, vol: 0.1, delay: 0.35 });
  });
  r('pickup', (a, o) => {
    [660, 880, 1320].forEach((f, i) => a.tone(o, { type: 'triangle', f0: f, dur: 0.18, vol: 0.14, delay: i * 0.06 }));
  });
  r('channelDone', (a, o) => {
    [523, 659, 784, 1046].forEach((f, i) => a.tone(o, { type: 'sine', f0: f, dur: 1.2, vol: 0.12, delay: i * 0.05, attack: 0.02 }));
  });
  r('seal', (a, o) => {
    [196, 247, 294, 392, 494].forEach((f, i) => a.tone(o, { type: 'triangle', f0: f, dur: 1.8, vol: 0.13, delay: i * 0.04 }));
    a.noise(o, { dur: 1.2, vol: 0.3, filter: 'bandpass', f0: 2000, f1: 300, q: 1 });
  });
  r('turretHack', (a, o) => {
    a.tone(o, { type: 'square', f0: 300, f1: 1800, dur: 0.4, vol: 0.12 });
    a.noise(o, { dur: 0.35, vol: 0.2, filter: 'highpass', f0: 3000, q: 1 });
  });

  // --- military
  r('gunshot', (a, o, p) => {
    a.noise(o, { dur: 0.1, vol: 0.4, filter: 'lowpass', f0: 3400 * p, f1: 700, q: 0.8 });
    a.tone(o, { type: 'sine', f0: 160 * p, f1: 55, dur: 0.08, vol: 0.32 });
  });
  r('pistol', (a, o) => {
    a.noise(o, { dur: 0.08, vol: 0.3, filter: 'bandpass', f0: 2200, f1: 900, q: 1 });
    a.tone(o, { type: 'sine', f0: 220, f1: 90, dur: 0.06, vol: 0.2 });
  });
  r('minigunShot', (a, o) => {
    a.noise(o, { dur: 0.05, vol: 0.3, filter: 'lowpass', f0: 2600, f1: 900, q: 0.8 });
  });
  r('spinUp', (a, o) => {
    a.tone(o, { type: 'sawtooth', f0: 60, f1: 320, dur: 0.8, vol: 0.12, attack: 0.1 });
  });
  r('sniper', (a, o) => {
    a.noise(o, { dur: 0.3, vol: 0.55, filter: 'lowpass', f0: 5000, f1: 400, q: 0.7 });
    a.tone(o, { type: 'square', f0: 2400, f1: 120, dur: 0.18, vol: 0.12 });
    a.noise(o, { dur: 0.9, vol: 0.08, filter: 'bandpass', f0: 500, q: 0.5, delay: 0.12 });
  });
  r('laserCharge', (a, o) => {
    a.tone(o, { type: 'sine', f0: 400, f1: 1200, dur: 0.5, vol: 0.06, attack: 0.2 });
  });
  r('laserShot', (a, o) => {
    a.tone(o, { type: 'square', f0: 1500, f1: 500, dur: 0.1, vol: 0.1 });
    a.tone(o, { type: 'sawtooth', f0: 3000, f1: 900, dur: 0.06, vol: 0.05 });
  });
  r('ricochet', (a, o) => {
    a.tone(o, { type: 'sine', f0: rnd(2200, 3200), f1: rnd(900, 1400), dur: 0.16, vol: 0.06 });
  });
  r('impact', (a, o) => {
    a.noise(o, { dur: 0.05, vol: 0.18, filter: 'highpass', f0: 1500, q: 0.6 });
  });
  r('coverHit', (a, o) => {
    a.noise(o, { dur: 0.08, vol: 0.18, filter: 'lowpass', f0: 900, f1: 300, q: 0.6 });
  });
  r('explosion', (a, o, p) => {
    a.noise(o, { dur: 1.1, vol: 0.75, filter: 'lowpass', f0: 1800 * p, f1: 50, q: 0.6 });
    a.tone(o, { type: 'sine', f0: 95 * p, f1: 28, dur: 0.8, vol: 0.7 });
    a.noise(o, { dur: 0.25, vol: 0.3, filter: 'highpass', f0: 2000, q: 0.5 });
  });
  r('distantBoom', (a, o) => {
    a.noise(o, { dur: 1.6, vol: 0.25, filter: 'lowpass', f0: 300, f1: 40, q: 0.5, attack: 0.05 });
    a.tone(o, { type: 'sine', f0: 50, f1: 25, dur: 1.2, vol: 0.25 });
  });
  r('grenadeBeep', (a, o) => {
    a.tone(o, { type: 'square', f0: 1900, dur: 0.05, vol: 0.06 });
  });
  r('mortarWhistle', (a, o) => {
    a.tone(o, { type: 'sine', f0: 1900, f1: 520, dur: 1.3, vol: 0.09, attack: 0.15 });
  });
  r('mortarLaunch', (a, o) => {
    a.noise(o, { dur: 0.3, vol: 0.4, filter: 'lowpass', f0: 600, f1: 120, q: 1 });
    a.tone(o, { type: 'sine', f0: 120, f1: 50, dur: 0.25, vol: 0.4 });
  });
  r('rocket', (a, o) => {
    a.noise(o, { dur: 0.7, vol: 0.3, filter: 'bandpass', f0: 1200, f1: 500, q: 1.5, attack: 0.02 });
  });
  r('cannon', (a, o) => {
    a.noise(o, { dur: 0.7, vol: 0.7, filter: 'lowpass', f0: 1200, f1: 60, q: 0.8 });
    a.tone(o, { type: 'sine', f0: 70, f1: 30, dur: 0.6, vol: 0.7 });
  });
  r('enemyHurt', (a, o) => {
    a.noise(o, { dur: 0.06, vol: 0.18, filter: 'bandpass', f0: 1100, q: 1.2 });
  });
  r('enemyDie', (a, o) => {
    a.tone(o, { type: 'square', f0: 320, f1: 90, dur: 0.25, vol: 0.08 });
    a.noise(o, { dur: 0.2, vol: 0.15, filter: 'lowpass', f0: 1200, f1: 200 });
  });
  r('metalHit', (a, o) => {
    a.tone(o, { type: 'triangle', f0: rnd(500, 700), f1: 300, dur: 0.12, vol: 0.12 });
    a.noise(o, { dur: 0.05, vol: 0.12, filter: 'highpass', f0: 2500 });
  });
  r('shieldHit', (a, o) => {
    a.tone(o, { type: 'sine', f0: 220, f1: 180, dur: 0.25, vol: 0.2 });
    a.tone(o, { type: 'triangle', f0: 1400, f1: 1200, dur: 0.12, vol: 0.06 });
  });
  r('playerHurt', (a, o) => {
    a.tone(o, { type: 'square', f0: 210, f1: 110, dur: 0.14, vol: 0.12 });
    a.noise(o, { dur: 0.08, vol: 0.15, filter: 'lowpass', f0: 1500 });
  });
  r('alarm', (a, o) => {
    for (let i = 0; i < 3; i++) a.tone(o, { type: 'square', f0: 700, f1: 950, dur: 0.3, vol: 0.06, delay: i * 0.35, curve: 'lin' });
  });
  r('radio', (a, o) => {
    a.tone(o, { type: 'sine', f0: 1450, dur: 0.06, vol: 0.06 });
    for (let i = 0; i < 4; i++) a.noise(o, { dur: rnd(0.08, 0.18), vol: 0.07, filter: 'bandpass', f0: rnd(900, 1600), q: 4, delay: 0.08 + i * 0.17 });
    a.tone(o, { type: 'sine', f0: 1450, dur: 0.06, vol: 0.05, delay: 0.85 });
  });
  r('dropship', (a, o) => {
    a.noise(o, { dur: 2.2, vol: 0.3, filter: 'lowpass', f0: 400, f1: 900, q: 1, attack: 0.6 });
  });
  r('c4Beep', (a, o) => {
    a.tone(o, { type: 'square', f0: 2100, dur: 0.07, vol: 0.08 });
  });

  // --- UI
  r('uiHover', (a, o) => a.tone(o, { type: 'sine', f0: 1250, f1: 1350, dur: 0.05, vol: 0.05 }));
  r('uiClick', (a, o) => {
    a.tone(o, { type: 'triangle', f0: 760, f1: 1240, dur: 0.09, vol: 0.12 });
    a.tone(o, { type: 'sine', f0: 1520, dur: 0.12, vol: 0.05, delay: 0.03 });
  });
  r('uiBack', (a, o) => a.tone(o, { type: 'triangle', f0: 700, f1: 420, dur: 0.1, vol: 0.1 }));
  r('uiDeny', (a, o) => a.tone(o, { type: 'square', f0: 180, f1: 140, dur: 0.15, vol: 0.08 }));
  r('chime', (a, o) => {
    [988, 1319, 1568].forEach((f, i) => a.tone(o, { type: 'sine', f0: f, dur: 0.6, vol: 0.09, delay: i * 0.07 }));
  });
  r('objective', (a, o) => {
    // bell: inharmonic partials with long decay
    [1, 2.0, 2.76, 4.07].forEach((m, i) => a.tone(o, { type: 'sine', f0: 523 * m, dur: 1.6 - i * 0.25, vol: 0.12 / (i + 1) }));
    [1, 2.0, 2.76].forEach((m, i) => a.tone(o, { type: 'sine', f0: 784 * m, dur: 1.4 - i * 0.25, vol: 0.1 / (i + 1), delay: 0.18 }));
  });
  r('lowMana', (a, o) => a.tone(o, { type: 'sine', f0: 230, f1: 200, dur: 0.18, vol: 0.12 }));
  r('upgrade', (a, o) => {
    [392, 523, 659, 784, 1046].forEach((f, i) => a.tone(o, { type: 'triangle', f0: f, dur: 0.35, vol: 0.1, delay: i * 0.05 }));
  });
  r('portalOpen', (a, o) => {
    a.tone(o, { type: 'sine', f0: 110, f1: 440, dur: 1.5, vol: 0.2, attack: 0.3 });
    a.noise(o, { dur: 1.5, vol: 0.2, filter: 'bandpass', f0: 300, f1: 3000, q: 2, attack: 0.4 });
  });
  r('heartbeat', (a, o) => {
    a.tone(o, { type: 'sine', f0: 70, f1: 45, dur: 0.12, vol: 0.35 });
    a.tone(o, { type: 'sine', f0: 65, f1: 40, dur: 0.12, vol: 0.25, delay: 0.18 });
  });
}
