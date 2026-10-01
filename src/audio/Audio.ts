import { CallKind } from '../data/species/SpeciesDef';
import { CallEvent } from '../game/Animal';
import { Game } from '../game/Game';
import { yawOf } from '../util/quat';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fully synthesized audio (no asset files, works offline). Positional animal calls help locate animals. */
export class AudioEngine {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: GainNode;
  private noise!: AudioBuffer;
  private crickets!: GainNode;
  private stepAcc = 0;
  private birdT = 3;
  private farT = 40;
  private thudT = 0;

  /** Must be called from a user gesture (iOS). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain();
      this.master.gain.value = this.enabled ? 0.7 : 0;
      this.master.connect(c.destination);

      // White noise buffer
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      // Reverb (generated impulse response) for gunshots
      const conv = c.createConvolver();
      const len = Math.floor(c.sampleRate * 1.6);
      const ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      conv.buffer = ir;
      this.reverb = c.createGain();
      this.reverb.gain.value = 0.35;
      this.reverb.connect(conv);
      conv.connect(this.master);

      this.startWind();
      this.startCrickets();
    }
    void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  // --- building blocks ---

  private noiseSrc(loop: boolean): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise; s.loop = loop;
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q: number, dest: AudioNode): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    f.connect(dest);
    return f;
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when = 0, vib = 0): void {
    const c = this.ctx!, t0 = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.04, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    if (vib > 0) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = 6; lg.gain.value = vib * f0;
      l.connect(lg); lg.connect(o.frequency);
      l.start(t0); l.stop(t0 + dur + 0.05);
    }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  private burst(dest: AudioNode, dur: number, gain: number, type: BiquadFilterType, freq: number, when = 0, q = 0.7): void {
    const c = this.ctx!, t0 = c.currentTime + when;
    const s = this.noiseSrc(false), g = c.createGain();
    const f = this.filter(type, freq, q, g);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); g.connect(dest);
    s.start(t0, Math.random() * 1.5, dur + 0.05);
  }

  // --- ambience ---

  private startWind(): void {
    const c = this.ctx!;
    const s = this.noiseSrc(true), g = c.createGain();
    g.gain.value = 0.05;
    const f = this.filter('lowpass', 450, 0.6, g);
    g.connect(this.master);
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.12; lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); s.start(); lfo.start();
  }

  private startCrickets(): void {
    const c = this.ctx!;
    const osc = c.createOscillator(), a = c.createGain(), b = c.createGain();
    this.crickets = c.createGain();
    this.crickets.gain.value = 0;
    osc.type = 'sine'; osc.frequency.value = 4500;
    a.gain.value = 0.5; b.gain.value = 0.5;
    const l1 = c.createOscillator(), l1g = c.createGain();   // fast pulses
    l1.type = 'square'; l1.frequency.value = 27; l1g.gain.value = 0.5; l1.connect(l1g); l1g.connect(a.gain);
    const l2 = c.createOscillator(), l2g = c.createGain();   // slow bursts
    l2.type = 'square'; l2.frequency.value = 1.1; l2g.gain.value = 0.5; l2.connect(l2g); l2g.connect(b.gain);
    osc.connect(a); a.connect(b); b.connect(this.crickets); this.crickets.connect(this.master);
    const q = c.createGain(); q.gain.value = 0.03; // overall level
    this.crickets.disconnect(); this.crickets.connect(q); q.connect(this.master);
    osc.start(); l1.start(); l2.start();
  }

  // --- positional bus ---

  private bus(dist: number, pan: number, front: boolean, level: number): GainNode {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = level * clamp(40 / (dist + 20), 0.05, 1.6) * (front ? 1 : 0.8);
    const lp = this.filter('lowpass', clamp(12000 / (1 + dist / 40), 500, 12000) * (front ? 1 : 0.6), 0.5, this.master);
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p); p.connect(lp);
    } else {
      g.connect(lp);
    }
    return g;
  }

  // --- animal calls ---

  private voice(kind: CallKind, out: AudioNode, p: number): void {
    switch (kind) {
      case 'chirp':
        for (let i = 0; i < 3; i++) this.tone(out, 'sine', 3200 * p, 4300 * p, 0.08, 0.22, i * 0.11);
        break;
      case 'squeak':
        this.tone(out, 'sine', 2000 * p, 2800 * p, 0.07, 0.15);
        break;
      case 'caw': {
        const f = this.filter('bandpass', 900, 1, out);
        for (let i = 0; i < 2; i++) this.tone(f, 'sawtooth', 450 * p, 300 * p, 0.25, 0.4, i * 0.34);
        break;
      }
      case 'quack': {
        const f = this.filter('lowpass', 1400, 0.7, out);
        for (let i = 0; i < 2; i++) this.tone(f, 'square', 520 * p, 300 * p, 0.15, 0.25, i * 0.2);
        break;
      }
      case 'screech': {
        const f = this.filter('bandpass', 2400, 1.2, out);
        this.tone(f, 'sawtooth', 2200 * p, 1300 * p, 0.9, 0.35, 0, 0.03);
        break;
      }
      case 'grunt': {
        const f = this.filter('lowpass', 500, 0.8, out);
        this.tone(f, 'sawtooth', 130 * p, 85 * p, 0.5, 0.6);
        this.burst(f, 0.3, 0.3, 'lowpass', 300);
        break;
      }
      case 'bugle': {
        const f = this.filter('bandpass', 1200, 0.7, out);
        this.tone(f, 'sawtooth', 350 * p, 900 * p, 0.7, 0.4, 0, 0.02);
        this.tone(f, 'sawtooth', 900 * p, 600 * p, 0.9, 0.4, 0.7, 0.02);
        break;
      }
      case 'bark': {
        const f = this.filter('bandpass', 900, 1.5, out);
        for (let i = 0; i < 2; i++) this.tone(f, 'square', 650 * p, 420 * p, 0.11, 0.35, i * 0.2);
        break;
      }
      case 'honk': {
        const f = this.filter('bandpass', 600, 1, out);
        this.tone(f, 'sawtooth', 170 * p, 230 * p, 0.45, 0.45);
        this.tone(f, 'sawtooth', 230 * p, 180 * p, 0.4, 0.4, 0.5);
        break;
      }
      case 'hum': {
        const f = this.filter('lowpass', 1200, 0.7, out);
        this.tone(f, 'sawtooth', 95 * p, 105 * p, 1.4, 0.25, 0, 0.02);
        this.tone(f, 'sine', 190 * p, 210 * p, 1.4, 0.15);
        break;
      }
      case 'motor': {
        const f = this.filter('lowpass', 320, 0.8, out);
        this.tone(f, 'sawtooth', 55 * p, 50 * p, 1.6, 0.45, 0, 0.03);
        this.burst(f, 1.2, 0.2, 'lowpass', 250);
        break;
      }
      case 'roar': {
        const f = this.filter('lowpass', 450, 0.8, out);
        this.tone(f, 'sawtooth', 70 * p, 45 * p, 1.8, 0.7, 0, 0.05);
        this.burst(f, 1.6, 0.4, 'lowpass', 500, 0, 1);
        break;
      }
    }
  }

  /** Plays animal calls positionally (pan by bearing, gain and muffling by distance). */
  playCalls(events: CallEvent[], game: Game): void {
    if (!this.ctx || !this.enabled || events.length === 0) return;
    const p = game.player.position, yaw = yawOf(game.player.orientation);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const e of events) {
      if (!e.species.call) continue;
      const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz) || 0.001;
      if (dist > 260) continue;
      const nx = dx / dist, nz = dz / dist;
      const pitch = clamp(Math.pow(1 / Math.max(0.3, e.species.bounds.halfLength), 0.25), 0.7, 1.5) * (0.92 + Math.random() * 0.16);
      const out = this.bus(dist, nx * rx + nz * rz, nx * fx + nz * fz > -0.2, 1);
      this.voice(e.species.call.kind, out, pitch);
    }
  }

  // --- player / equipment sounds ---

  shot(): void {
    if (!this.ctx || !this.enabled) return;
    const m = this.master;
    this.burst(m, 0.3, 1.0, 'lowpass', 4000);
    this.burst(m, 0.06, 0.6, 'highpass', 2000);
    this.tone(m, 'sine', 120, 35, 0.35, 0.9);
    this.burst(this.reverb, 0.5, 0.8, 'lowpass', 3000);
  }

  /** The player is mauled: heavy thud, roar and a rumble. */
  maul(): void {
    if (!this.ctx || !this.enabled) return;
    this.tone(this.master, 'sine', 90, 30, 0.7, 0.9);
    this.burst(this.master, 0.5, 0.8, 'lowpass', 900);
    this.voice('roar', this.master, 0.9);
    this.burst(this.reverb, 0.8, 0.6, 'lowpass', 2000);
  }

  launch(): void {
    if (!this.ctx || !this.enabled) return;
    this.burst(this.master, 0.9, 0.5, 'bandpass', 1500, 0, 0.8);
    this.tone(this.master, 'sawtooth', 200, 900, 0.6, 0.25);
    this.burst(this.reverb, 0.6, 0.4, 'lowpass', 2500);
  }

  /** Explosion at a world position (positional: pan and muffling by distance). */
  blast(x: number, z: number, game: Game): void {
    if (!this.ctx || !this.enabled) return;
    const p = game.player.position, yaw = yawOf(game.player.orientation);
    const dx = x - p.x, dz = z - p.z, dist = Math.hypot(dx, dz) || 0.001;
    const out = this.bus(dist, (dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / dist, true, 1.6);
    this.tone(out, 'sine', 90, 25, 0.9, 0.9);
    this.burst(out, 0.8, 0.7, 'lowpass', 1500);
    this.burst(this.reverb, 1.0, 0.8, 'lowpass', 2500);
  }

  bolt(): void {
    if (!this.ctx || !this.enabled) return;
    this.tone(this.master, 'square', 1800, 900, 0.03, 0.12, 0.5);
    this.tone(this.master, 'square', 1500, 700, 0.04, 0.12, 0.75);
  }

  shutter(): void {
    if (!this.ctx || !this.enabled) return;
    this.burst(this.master, 0.03, 0.25, 'highpass', 3000);
    this.burst(this.master, 0.05, 0.2, 'highpass', 2500, 0.07);
  }

  /** Per-frame: footsteps and ambience (birds by day, crickets by night, distant sounds). */
  update(dt: number, game: Game): void {
    if (!this.ctx || !this.enabled) return;
    const p = game.player, hour = game.sim.timeOfDay;
    const day = hour >= 5.5 && hour < 19.5;

    // Footsteps
    if (p.speed > 0.1) {
      this.stepAcc += p.speed * dt;
      const stride = p.crouching ? 0.9 : 1.4;
      if (this.stepAcc >= stride) {
        this.stepAcc = 0;
        this.burst(this.master, 0.07, p.crouching ? 0.05 : 0.12, 'lowpass', 700 + Math.random() * 500);
      }
    } else {
      this.stepAcc = 0;
    }

    // Heavy footfalls of charging predators (positional)
    this.thudT -= dt;
    if (this.thudT <= 0) {
      this.thudT = 0.4;
      const yaw = yawOf(p.orientation);
      for (const a of game.sim.animals.list) {
        if (a.state !== 'CHARGING' && a.state !== 'STALKING') continue;
        const dx = a.position.x - p.position.x, dz = a.position.z - p.position.z, dist = Math.hypot(dx, dz) || 0.001;
        if (dist > 90) continue;
        const size = clamp(a.species.bounds.halfLength / 2, 0.4, 2.5);
        const out = this.bus(dist, (dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / dist, true, 0.5 + size * 0.5);
        this.tone(out, 'sine', 75 / Math.sqrt(size), 35, 0.22, 0.9);
      }
    }

    // Crickets at night
    this.crickets.gain.setTargetAtTime(day ? 0 : 1, this.ctx.currentTime, 2);

    const valley = game.level.ambience === 'valley';
    // Distant birdsong by day (not on the machine range)
    if (day && game.level.ambience !== 'range') {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = (valley ? 6 : 2) + Math.random() * (valley ? 12 : 6);
        const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 90;
        const out = this.bus(dist, Math.sin(ang), Math.cos(ang) > -0.2, 0.7);
        this.voice('chirp', out, (valley ? 0.6 : 1) * (0.85 + Math.random() * 0.4));
      }
    }
    // Very distant roars in the valley
    if (valley) {
      this.farT -= dt;
      if (this.farT <= 0) {
        this.farT = 40 + Math.random() * 50;
        const out = this.bus(220, (Math.random() * 2 - 1), true, 0.6);
        this.voice('roar', out, 0.8);
      }
    }
  }
}
