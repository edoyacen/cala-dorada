/**
 * audio.js — every sound in Cala Dorada is synthesised here, from an engine
 * that rises with the revs and a two-tone siren to the sea behind the beach,
 * the shots, the explosions, the horns and four radio stations that play their
 * own procedural music. No audio file is loaded, so the game stays offline.
 */
import { RADIO_STATIONS } from './config.js';
import { clamp, lerp } from './random.js';

const NOTE = (semitone, root = 0) => 440 * Math.pow(2, (semitone + root) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.ready = false;
    this.muted = false;
    this.station = 0;
    this.nextNote = 0;
    this.step = 0;
    this.listener = { x: 0, y: 0 };
    this.lastShot = 0;
    this.waves = null;
    this.volume = 0.55;
  }

  /** Create the context on the first real gesture; browsers require one. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
    // Engine: two detuned saws through a lowpass.
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    this.engineGain.connect(filter);
    filter.connect(this.master);
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 78;
    this.engineOsc.connect(this.engineGain);
    this.engineOsc2.connect(this.engineGain);
    this.engineOsc.start();
    this.engineOsc2.start();
    // Siren: one oscillator bent between two tones.
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this._noiseBuffer = this._makeNoise(2);
    this.ready = true;
    this.nextNote = this.ctx.currentTime + 0.2;
  }

  _makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let n = 0; n < data.length; n += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[n] = white * 0.7 + last * 3;
    }
    return buffer;
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  /** Distance attenuation against the listener. */
  _gainAt(x, y, near = 1) {
    const d = Math.hypot(x - this.listener.x, y - this.listener.y);
    return clamp(1 - d / 90, 0, 1) * near;
  }

  _burst(x, y, opts = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.value = opts.freq ?? 900;
    filter.Q.value = opts.q ?? 0.9;
    const gain = this.ctx.createGain();
    const peak = (opts.gain ?? 0.5) * this._gainAt(x, y);
    if (peak <= 0.001) return;
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (opts.decay ?? 0.2));
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 1.2);
    src.stop(t + (opts.decay ?? 0.2) + 0.02);
  }

  _tone(freq, opts = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + (opts.decay ?? 0.2));
    const gain = this.ctx.createGain();
    const peak = (opts.gain ?? 0.2) * (opts.volume ?? 1);
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (opts.decay ?? 0.25));
    osc.connect(gain);
    gain.connect(opts.music ? this.musicGain : this.master);
    osc.start(t);
    osc.stop(t + (opts.decay ?? 0.25) + 0.02);
  }

  shoot(kind, x, y, isPlayer) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.012) return;
    this.lastShot = now;
    const near = isPlayer ? 1.2 : this._gainAt(x, y);
    if (kind === 'shotgun') {
      this._burst(x, y, { gain: 1.0 * near, decay: 0.34, freq: 380, type: 'lowpass', q: 0.6 });
      this._tone(120, { gain: 0.34 * near, decay: 0.3, to: 48, type: 'square' });
    } else if (kind === 'smg') {
      this._burst(x, y, { gain: 0.42 * near, decay: 0.09, freq: 1500, q: 1.2 });
      this._tone(210, { gain: 0.12 * near, decay: 0.08, to: 120, type: 'square' });
    } else if (kind === 'punch') {
      this._burst(x, y, { gain: 0.4 * near, decay: 0.1, freq: 300, type: 'lowpass' });
    } else {
      this._burst(x, y, { gain: 0.5 * near, decay: 0.16, freq: 1100, q: 0.9 });
      this._tone(260, { gain: 0.16 * near, decay: 0.14, to: 90, type: 'square' });
    }
  }

  punch(x = this.listener.x, y = this.listener.y) {
    this._burst(x, y, { gain: 0.35, decay: 0.09, freq: 260, type: 'lowpass' });
  }

  explosion(x, y) {
    if (!this.ready) return;
    this._burst(x, y, { gain: 1.2, decay: 1.1, freq: 220, type: 'lowpass', q: 0.4 });
    this._tone(90, { gain: 0.5 * this._gainAt(x, y, 1), decay: 0.9, to: 30, type: 'sawtooth' });
  }

  crash(x, y, strength = 0.5) {
    if (!this.ready) return;
    this._burst(x, y, { gain: 0.9 * strength, decay: 0.4, freq: 700, q: 0.5 });
    this._burst(x, y, { gain: 0.5 * strength, decay: 0.2, freq: 2400, q: 1.6 });
  }

  horn(x, y, volume = 0.4) {
    if (!this.ready) return;
    this._tone(330, { gain: 0.16 * volume, decay: 0.5, type: 'square' });
    this._tone(415, { gain: 0.12 * volume, decay: 0.5, type: 'square' });
  }

  siren(x, y, volume = 0.5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    const gain = this.ctx.createGain();
    const peak = 0.12 * volume * this._gainAt(x, y, 1);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.08);
    gain.gain.linearRampToValueAtTime(0, t + 1.4);
    osc.frequency.setValueAtTime(760, t);
    osc.frequency.linearRampToValueAtTime(560, t + 0.5);
    osc.frequency.linearRampToValueAtTime(760, t + 1.0);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.45);
  }

  hurt(x, y) {
    this._burst(x, y, { gain: 0.3, decay: 0.16, freq: 420, type: 'bandpass' });
  }

  scream(x, y) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = this.ctx.createGain();
    const peak = 0.05 * this._gainAt(x, y, 1);
    if (peak <= 0.001) return;
    osc.frequency.setValueAtTime(620 + Math.random() * 180, t);
    osc.frequency.linearRampToValueAtTime(880 + Math.random() * 120, t + 0.28);
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.62);
  }

  pickup(kind = 'cash') {
    if (!this.ready) return;
    if (kind === 'cash') {
      this._tone(NOTE(12), { gain: 0.14, decay: 0.12, type: 'triangle' });
      this._tone(NOTE(19), { gain: 0.1, decay: 0.18, type: 'triangle' });
    } else {
      this._tone(NOTE(7), { gain: 0.12, decay: 0.2, type: 'sine', to: NOTE(12) });
    }
  }

  ui(up = true) {
    this._tone(up ? NOTE(9) : NOTE(5), { gain: 0.1, decay: 0.1, type: 'square' });
  }

  mission() {
    if (!this.ready) return;
    const root = -5;
    [0, 7, 12, 16].forEach((semis, n) => {
      setTimeout(() => this._tone(NOTE(semis, root), { gain: 0.13, decay: 0.5, type: 'triangle' }), n * 110);
    });
  }

  /** Engine note and siren bed, called every frame. */
  update(dt, state) {
    if (!this.ready) return;
    this.listener.x = state.x;
    this.listener.y = state.y;
    const t = this.ctx.currentTime;
    if (state.inCar) {
      const rev = clamp(state.speed / 46, 0, 1);
      const gear = Math.min(3, Math.floor(rev * 4));
      const freq = 46 + gear * 12 + rev * 90;
      this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
      this.engineOsc2.frequency.setTargetAtTime(freq * 1.51, t, 0.08);
      this.engineGain.gain.setTargetAtTime(0.1 + rev * 0.16, t, 0.12);
    } else {
      this.engineGain.gain.setTargetAtTime(0, t, 0.2);
    }
    if (state.siren > 0) {
      const sirenTone = 640 + Math.sin(t * 5.2) * 220;
      this.sirenOsc.frequency.setTargetAtTime(sirenTone, t, 0.05);
      this.sirenGain.gain.setTargetAtTime(0.05 * clamp(state.siren, 0, 1), t, 0.2);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.3);
    }
    this._music(dt, state);
  }

  /** The radio: a station's scale, a bass line and a lead, on a clock. */
  _music(dt, state) {
    if (this.muted) return;
    const station = RADIO_STATIONS[this.station];
    if (!station) return;
    const playing = state.inCar && state.radio;
    this.musicGain.gain.setTargetAtTime(playing ? 0.16 : 0.05, this.ctx.currentTime, 0.4);
    if (!playing && !state.menu) {
      this.nextNote = Math.max(this.nextNote, this.ctx.currentTime + 0.2);
      return;
    }
    const beat = 60 / station.bpm;
    while (this.nextNote < this.ctx.currentTime + 0.25) {
      const when = this.nextNote;
      const step = this.step % 8;
      const scale = station.scale;
      const root = station.root;
      if (step === 0 || step === 3 || step === 6) {
        this._scheduled(NOTE(scale[0] - 12, root), when, beat * 1.4, 0.22, 'triangle');
      }
      if (step % 2 === 0) {
        const idx = (this.step + Math.floor(this.step / 3)) % scale.length;
        this._scheduled(NOTE(scale[idx] + 12, root), when, beat * 0.9, 0.05, 'sine');
      }
      if (step === 2 || step === 5) {
        const idx = (this.step * 3) % scale.length;
        this._scheduled(NOTE(scale[idx], root), when + beat * 0.5, beat * 0.8, 0.06, 'square');
      }
      if (station.bpm > 100 && step % 4 === 0) {
        this._scheduled(70, when, 0.16, 0.12, 'sine', true);
      }
      this.nextNote = when + beat / (station.bpm > 110 ? 2 : 1);
      this.step += 1;
    }
  }

  _scheduled(freq, when, length, gain, type = 'sine', drum = false) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(drum ? 150 : freq, when);
    if (drum) osc.frequency.exponentialRampToValueAtTime(45, when + length);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + length);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + length + 0.05);
  }

  nextStation() {
    this.station = (this.station + 1) % RADIO_STATIONS.length;
    this._tone(NOTE(12), { gain: 0.08, decay: 0.15, type: 'triangle' });
    return RADIO_STATIONS[this.station];
  }

  stationName() {
    return RADIO_STATIONS[this.station]?.name ?? '';
  }
}

export { lerp };
