import { STORAGE_KEY_MUTED } from './constants';

/**
 * Fully synthesised audio: engine drone with gear shifts, wind, off-road rumble,
 * plus one-shot SFX. Everything is created lazily on the first user gesture.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private whine: OscillatorNode | null = null;
  private whineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY_MUTED) === '1';
    } catch {
      this.muted = false;
    }
  }

  get ready() {
    return !!this.ctx;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* audio unsupported — game still works */
    }
  }

  private build() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    master.connect(ctx.destination);
    this.master = master;

    // noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    // engine chain
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 70;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 35;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.35;
    osc1.connect(filter);
    osc2.connect(o2g).connect(filter);
    filter.connect(engineGain).connect(master);
    osc1.start();
    osc2.start();
    this.osc1 = osc1;
    this.osc2 = osc2;
    this.engineFilter = filter;
    this.engineGain = engineGain;

    // boost whine
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.value = 900;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    whine.connect(whineGain).connect(master);
    whine.start();
    this.whine = whine;
    this.whineGain = whineGain;

    // wind + rumble from a looping noise source
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 900;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 160;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(master);
    noise.connect(rumbleFilter).connect(rumbleGain).connect(master);
    noise.start();
    this.windGain = windGain;
    this.rumbleGain = rumbleGain;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Called every frame while the game runs. */
  setEngine(speedPct: number, running: boolean, boosting: boolean, offRoad: boolean, revving = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.osc1 || !this.osc2 || !this.engineGain || !this.engineFilter || !this.windGain || !this.rumbleGain || !this.whineGain || !this.whine) return;
    const t = ctx.currentTime;
    const gears = 7.4;
    const g = Math.min(gears * speedPct, gears - 0.001);
    const gear = Math.floor(g);
    const frac = g - gear;
    let freq = 62 + gear * 9 + frac * 105 + revving * 140;
    if (boosting) freq *= 1.18;
    this.osc1.frequency.setTargetAtTime(freq, t, 0.03);
    this.osc2.frequency.setTargetAtTime(freq / 2, t, 0.03);
    this.engineFilter.frequency.setTargetAtTime(380 + speedPct * 2600 + revving * 1500, t, 0.05);
    const vol = running ? 0.06 + speedPct * 0.085 + revving * 0.07 : 0;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
    this.windGain.gain.setTargetAtTime(running ? speedPct * speedPct * 0.09 : 0, t, 0.1);
    this.rumbleGain.gain.setTargetAtTime(running && offRoad ? 0.18 + speedPct * 0.15 : 0, t, 0.05);
    this.whineGain.gain.setTargetAtTime(running && boosting ? 0.035 : 0, t, 0.08);
    this.whine.frequency.setTargetAtTime(700 + speedPct * 900, t, 0.1);
  }

  stopEngine() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, t, 0.15);
    this.windGain?.gain.setTargetAtTime(0, t, 0.15);
    this.rumbleGain?.gain.setTargetAtTime(0, t, 0.1);
    this.whineGain?.gain.setTargetAtTime(0, t, 0.1);
  }

  // ---- one shots -----------------------------------------------------------

  private blip(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noiseBurst(dur: number, type: BiquadFilterType, freq: number, gain: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  playNearMiss(combo: number) {
    this.noiseBurst(0.28, 'bandpass', 1600, 0.3, 250);
    const base = 780 + Math.min(combo, 8) * 60;
    this.blip(base, 0.09, 'square', 0.05);
    this.blip(base * 1.5, 0.12, 'square', 0.05, undefined, 0.07);
  }

  playOvertake() {
    this.blip(1250, 0.05, 'sine', 0.05, 1500);
  }

  playCrash() {
    this.noiseBurst(0.55, 'lowpass', 1200, 0.55, 90);
    this.blip(110, 0.45, 'sawtooth', 0.35, 28);
    this.noiseBurst(0.12, 'highpass', 2500, 0.25);
  }

  playCheckpoint() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.blip(n, 0.16, 'triangle', 0.14, undefined, i * 0.085));
    this.blip(1046, 0.5, 'sine', 0.08, undefined, 0.36);
  }

  playBoost() {
    this.blip(180, 0.6, 'sawtooth', 0.16, 950);
    this.noiseBurst(0.7, 'bandpass', 500, 0.28, 3200);
  }

  playBoostReady() {
    this.blip(660, 0.09, 'sine', 0.09);
    this.blip(990, 0.16, 'sine', 0.09, undefined, 0.09);
  }

  playLight() {
    this.blip(440, 0.14, 'square', 0.07);
  }

  playGo() {
    this.blip(880, 0.5, 'square', 0.09);
    this.noiseBurst(0.6, 'bandpass', 700, 0.25, 2600);
  }

  playGameOver() {
    [440, 370, 311, 262].forEach((n, i) => this.blip(n, 0.28, 'triangle', 0.13, undefined, i * 0.22));
    this.noiseBurst(0.9, 'lowpass', 600, 0.15, 80, 0.2);
  }

  playOffroadHit() {
    this.noiseBurst(0.08, 'lowpass', 500, 0.12);
  }

  playClick() {
    this.blip(620, 0.04, 'sine', 0.05);
  }

  playSelect() {
    this.blip(520, 0.06, 'triangle', 0.06, 780);
  }
}
