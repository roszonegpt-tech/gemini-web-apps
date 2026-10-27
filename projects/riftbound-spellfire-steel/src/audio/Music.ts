// Procedural hybrid-orchestral soundtrack: pipe organ + choir pads blended with dark
// synth bass/arps, and action drums + distorted guitar layers that fade in with combat
// intensity. Scheduled ahead of time on the Web Audio clock for tight timing.
import type { AudioEngine } from './AudioEngine';

export type TrackId = 'none' | 'title' | 'explore' | 'boss' | 'victory';

interface TrackDef {
  bpm: number;
  chords: number[][]; // midi notes per bar
  bass: number[]; // bass root per bar
  drums: 'none' | 'march' | 'drive';
  arp: boolean;
  bell: boolean;
}

const D3 = 50;
const chord = (root: number, minor: boolean) => [root, root + (minor ? 3 : 4), root + 7];

const TRACKS: Record<Exclude<TrackId, 'none' | 'victory'>, TrackDef> = {
  title: {
    bpm: 70,
    chords: [chord(D3, true), chord(D3 + 5, true), chord(D3 - 4, false), chord(D3 - 5, false)],
    bass: [D3 - 12, D3 - 7, D3 - 16, D3 - 17],
    drums: 'none', arp: false, bell: true,
  },
  explore: {
    bpm: 96,
    chords: [chord(D3, true), chord(D3 - 4, false), chord(D3 + 3, false), chord(D3 - 2, false)],
    bass: [D3 - 12, D3 - 16, D3 - 9, D3 - 14],
    drums: 'march', arp: true, bell: false,
  },
  boss: {
    bpm: 132,
    chords: [chord(D3, true), chord(D3 - 4, false), chord(D3 + 5, true), chord(D3 + 7, false)],
    bass: [D3 - 12, D3 - 16, D3 - 7, D3 - 5],
    drums: 'drive', arp: true, bell: false,
  },
};

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private a: AudioEngine;
  track: TrackId = 'none';
  private def: TrackDef | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  intensity = 0;
  private targetIntensity = 0;
  private layers: { pad: GainNode; drums: GainNode; guitar: GainNode; bass: GainNode; arp: GainNode } | null = null;
  private shaper: WaveShaperNode | null = null;

  constructor(a: AudioEngine) {
    this.a = a;
  }

  private ensureLayers(): boolean {
    const ctx = this.a.ctx;
    if (!ctx) return false;
    if (this.layers) return true;
    const mk = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.a.musicBus);
      return g;
    };
    this.layers = { pad: mk(0.5), drums: mk(0), guitar: mk(0), bass: mk(0.3), arp: mk(0.15) };
    const shaper = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      curve[i] = Math.tanh(x * 6) * 0.8;
    }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    shaper.connect(lp);
    lp.connect(this.layers.guitar);
    this.shaper = shaper;
    return true;
  }

  play(track: TrackId): void {
    if (track === this.track) return;
    this.track = track;
    if (track === 'none') {
      this.stopTimer();
      return;
    }
    if (track === 'victory') {
      this.stopTimer();
      this.fanfare();
      return;
    }
    if (!this.ensureLayers()) return;
    this.def = TRACKS[track];
    this.step = 0;
    this.nextTime = (this.a.ctx as AudioContext).currentTime + 0.1;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), 25);
  }

  /** Re-attempt playback after the audio context unlocks. */
  resume(): void {
    const t = this.track;
    this.track = 'none';
    if (t !== 'none') this.play(t);
  }

  setIntensity(v: number): void {
    this.targetIntensity = Math.max(0, Math.min(1, v));
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    const ctx = this.a.ctx;
    if (!ctx || !this.def || !this.layers) return;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.1;
      return;
    }
    // smooth intensity → layer gains
    this.intensity += (this.targetIntensity - this.intensity) * 0.02;
    const L = this.layers;
    const t = ctx.currentTime;
    const base = this.track === 'title' ? 0 : 0.25;
    L.drums.gain.setTargetAtTime(this.def.drums === 'none' ? 0 : base * 0.6 + this.intensity * 0.55, t, 0.3);
    L.guitar.gain.setTargetAtTime(this.track === 'boss' ? 0.1 + this.intensity * 0.18 : Math.max(0, this.intensity - 0.45) * 0.3, t, 0.3);
    L.bass.gain.setTargetAtTime(0.18 + this.intensity * 0.25, t, 0.3);
    L.arp.gain.setTargetAtTime(this.def.arp ? 0.06 + this.intensity * 0.06 : 0, t, 0.3);
    if (this.nextTime < t - 0.5) this.nextTime = t + 0.05; // tab was asleep
    const stepDur = 60 / this.def.bpm / 4;
    while (this.nextTime < t + 0.15) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % (16 * this.def.chords.length);
      this.nextTime += stepDur;
    }
  }

  private playStep(step: number, t: number, sd: number): void {
    const def = this.def as TrackDef;
    const L = this.layers as NonNullable<Music['layers']>;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const ch = def.chords[bar];
    if (s === 0) {
      this.organ(ch, t, sd * 16, L.pad);
      this.choir(ch, t, sd * 16, L.pad);
      if (def.bell) this.bell(ch[2] + 24, t + sd * 8, L.pad);
    }
    // bass
    const root = def.bass[bar];
    if (def.drums === 'drive') {
      if (s % 2 === 0) this.bass(root + (s % 8 === 6 ? 12 : 0), t, sd * 1.8, L.bass);
    } else if (s % 4 === 0) {
      this.bass(root, t, sd * 3.5, L.bass);
    }
    // arp
    if (def.arp && s % 2 === 0) {
      const seq = [0, 1, 2, 1, 2, 0, 2, 1];
      const n = ch[seq[(s / 2) % 8]] + 12 + (s >= 8 ? 12 : 0);
      this.arp(n, t, sd * 1.5, L.arp);
    }
    // drums
    if (def.drums === 'march') {
      if (s === 0 || s === 8 || s === 10) this.kick(t, L.drums);
      if (s === 4 || s === 12) this.snare(t, L.drums);
      if (s % 2 === 0) this.hat(t, L.drums, s % 4 === 0 ? 0.5 : 0.3);
      if (s === 14 || s === 15) this.snare(t, L.drums, 0.4);
    } else if (def.drums === 'drive') {
      if (s % 4 === 0 || s === 7 || s === 10) this.kick(t, L.drums);
      if (s === 4 || s === 12) this.snare(t, L.drums);
      this.hat(t, L.drums, s % 2 === 0 ? 0.45 : 0.25);
    }
    // guitar chugs (power chords)
    if (def.drums !== 'none' && (s % 2 === 0 || (def.drums === 'drive' && s % 4 === 3))) {
      const accent = s === 0 || s === 6 || s === 12;
      this.guitar(root + 12, t, accent ? sd * 1.6 : sd * 0.6, accent ? 0.5 : 0.3);
    }
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, vol: number, out: AudioNode, attack = 0.01, release = 0.2): void {
    const ctx = this.a.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private organ(notes: number[], t: number, dur: number, out: AudioNode): void {
    for (const n of notes) {
      const f = midiHz(n);
      this.osc('sine', f, t, dur, 0.05, out, 0.08, 0.6);
      this.osc('sine', f * 2, t, dur, 0.025, out, 0.08, 0.6);
      this.osc('sine', f * 4, t, dur, 0.01, out, 0.08, 0.6);
    }
    this.osc('sine', midiHz(notes[0] - 12), t, dur, 0.05, out, 0.1, 0.6);
  }

  private choir(notes: number[], t: number, dur: number, out: AudioNode): void {
    const ctx = this.a.ctx as AudioContext;
    for (const n of notes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(n + 12);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5 + Math.random();
      const vg = ctx.createGain();
      vg.gain.value = 3;
      vib.connect(vg);
      vg.connect(o.detune);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass'; f1.frequency.value = 720; f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.035, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
      o.start(t); vib.start(t);
      o.stop(t + dur + 0.4); vib.stop(t + dur + 0.4);
    }
  }

  private bell(n: number, t: number, out: AudioNode): void {
    const f = midiHz(n);
    [1, 2, 2.76, 4.07].forEach((m, i) => this.osc('sine', f * m, t, 2.5 - i * 0.4, 0.03 / (i + 1), out, 0.005, 2));
  }

  private bass(n: number, t: number, dur: number, out: AudioNode): void {
    const ctx = this.a.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midiHz(n);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private arp(n: number, t: number, dur: number, out: AudioNode): void {
    const ctx = this.a.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = midiHz(n);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private kick(t: number, out: AudioNode): void {
    const ctx = this.a.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.32);
  }

  private snare(t: number, out: AudioNode, vol = 0.6): void {
    const ctx = this.a.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.a.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random()); src.stop(t + 0.2);
    this.osc('triangle', 190, t, 0.1, vol * 0.4, out, 0.002, 0.08);
  }

  private hat(t: number, out: AudioNode, vol: number): void {
    const ctx = this.a.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.a.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random()); src.stop(t + 0.05);
  }

  private guitar(root: number, t: number, dur: number, vol: number): void {
    if (!this.shaper) return;
    const ctx = this.a.ctx as AudioContext;
    for (const n of [root, root + 7, root + 12]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(n);
      o.detune.value = (Math.random() - 0.5) * 12;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * 0.35, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.shaper);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  private fanfare(): void {
    if (!this.ensureLayers()) return;
    const ctx = this.a.ctx as AudioContext;
    const t = ctx.currentTime + 0.05;
    const out = (this.layers as NonNullable<Music['layers']>).pad;
    const seq = [62, 66, 69, 74, 74, 78, 81];
    seq.forEach((n, i) => this.osc('triangle', midiHz(n), t + i * 0.14, 0.5 + (i === seq.length - 1 ? 1.5 : 0), 0.08, out, 0.01, 0.3));
    this.organ([62, 66, 69], t + 1.0, 3.0, out);
    this.choir([62, 66, 69], t + 1.0, 3.0, out);
  }
}
