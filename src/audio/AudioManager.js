import { GameStorage } from '../utils/Storage.js';

/**
 * Audio Manager:
 * - Synthesized sound effects (engine, boost, horn, collision impact).
 * - Procedural Synthwave / Cyberpunk background music generator.
 * - Master DynamicsCompressor to maintain consistent, distortion-free audio levels.
 * - Master volume & mute controls with localStorage persistence.
 * - Safe suspend/resume for tab visibility changes.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this._boosting = false;
    this._hornAt = 0;
    this._musicPlaying = false;
    this._musicTimer = null;
    this.isMuted = GameStorage.isMuted();
    this.volume = GameStorage.getVolume();
    this.onMuteChange = null;

    // Synthwave music state
    this._step = 0;
    this._chords = [
      { root: 146.83, notes: [220.00, 261.63, 293.66, 349.23, 440.00] }, // Dm
      { root: 116.54, notes: [174.61, 233.08, 293.66, 349.23, 466.16] }, // Bb
      { root: 130.81, notes: [196.00, 261.63, 329.63, 392.00, 523.25] }, // C
      { root: 110.00, notes: [164.81, 220.00, 261.63, 329.63, 440.00] }, // Am
    ];
  }

  ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      const ctx = this.ctx = new AC();

      // Master gain
      this.master = ctx.createGain();
      this.master.gain.value = this.isMuted ? 0 : this.volume;

      // Compressor to ensure smooth, balanced levels without peaks
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 12;
      this.comp.ratio.value = 6;
      this.comp.attack.value = 0.005;
      this.comp.release.value = 0.2;

      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);

      // Separate SFX and BGM channels
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);

      this.bgmGain = ctx.createGain();
      this.bgmGain.gain.value = 0.24;
      this.bgmGain.connect(this.master);

      this._buildEngine();
      this._buildBoost();
      this.ready = true;
      this._startMusic();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.ensure();
    this.isMuted = !this.isMuted;
    GameStorage.setMuted(this.isMuted);
    if (this.master) {
      const target = this.isMuted ? 0 : this.volume;
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    if (this.onMuteChange) this.onMuteChange(this.isMuted);
    return this.isMuted;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    GameStorage.setVolume(this.volume);
    if (this.master && !this.isMuted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  _buildEngine() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    osc.type = 'sawtooth';
    sub.type = 'triangle';
    osc.frequency.value = 48;
    sub.frequency.value = 24;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    sub.start();
    this.engOsc = osc;
    this.engSub = sub;
    this.engFilter = filter;
    this.engGain = gain;
  }

  _buildBoost() {
    const ctx = this.ctx;
    const seconds = 1;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start();

    this.boostFilter = filter;
    this.boostGain = gain;
  }

  /* ── Procedural Synthwave Music ────────────────────────────────────────── */
  _startMusic() {
    if (this._musicTimer) return;
    this._musicPlaying = true;
    const stepInterval = 120; // ms per 16th note at ~125 BPM

    this._musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || !this._musicPlaying) return;
      this._playMusicStep();
    }, stepInterval);
  }

  _playMusicStep() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const step = this._step;
    this._step = (this._step + 1) % 32;

    const chordIndex = Math.floor(step / 8);
    const chord = this._chords[chordIndex];
    const subStep = step % 8;

    // Bassline (8th notes driving pulse)
    if (subStep % 2 === 0) {
      const bassOsc = ctx.createOscillator();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(chord.root / 2, t);

      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(320, t);
      bassFilter.frequency.exponentialRampToValueAtTime(100, t + 0.16);

      const bassGain = ctx.createGain();
      bassGain.gain.setValueAtTime(0.22, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(this.bgmGain);

      bassOsc.start(t);
      bassOsc.stop(t + 0.2);
    }

    // Lead Arpeggio (16th notes melodic synth)
    if (subStep % 2 === 1 || subStep === 0) {
      const noteIdx = (step * 3) % chord.notes.length;
      const freq = chord.notes[noteIdx];

      const leadOsc = ctx.createOscillator();
      leadOsc.type = 'sine';
      leadOsc.frequency.setValueAtTime(freq, t);

      const leadGain = ctx.createGain();
      leadGain.gain.setValueAtTime(0.09, t);
      leadGain.gain.exponentialRampToValueAtTime(0.0005, t + 0.14);

      leadOsc.connect(leadGain);
      leadGain.connect(this.bgmGain);

      leadOsc.start(t);
      leadOsc.stop(t + 0.15);
    }

    // Hi-hat pulse on off-beats
    if (subStep % 2 === 1 && this.noiseBuf) {
      const hatSrc = ctx.createBufferSource();
      hatSrc.buffer = this.noiseBuf;

      const hatFilter = ctx.createBiquadFilter();
      hatFilter.type = 'highpass';
      hatFilter.frequency.setValueAtTime(7000, t);

      const hatGain = ctx.createGain();
      hatGain.gain.setValueAtTime(0.035, t);
      hatGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

      hatSrc.connect(hatFilter);
      hatFilter.connect(hatGain);
      hatGain.connect(this.bgmGain);

      hatSrc.start(t);
      hatSrc.stop(t + 0.06);
    }
  }

  setMusicActive(active) {
    this._musicPlaying = active;
    if (this.bgmGain && this.ctx) {
      const target = active ? 0.24 : 0.0001;
      this.bgmGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
    }
  }

  update({ active, speed, nitro }) {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = active ? Math.max(0, speed) : 0;
    const freq = 40 + s * 1.05;
    const vol = s > 1 ? 0.04 + Math.min(0.055, s * 0.0009) : 0.0001;

    this.engOsc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engSub.frequency.setTargetAtTime(freq * 0.5, t, 0.1);
    this.engFilter.frequency.setTargetAtTime(130 + s * 5.5, t, 0.1);
    this.engGain.gain.setTargetAtTime(vol, t, 0.08);
    this._setBoost(!!nitro);
  }

  _setBoost(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on === this._boosting) return;
    this._boosting = on;
    const g = this.boostGain.gain;
    g.cancelScheduledValues(t);
    this.boostFilter.frequency.cancelScheduledValues(t);
    if (on) {
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(0.22, t + 0.18);
      this.boostFilter.frequency.setValueAtTime(420, t);
      this.boostFilter.frequency.exponentialRampToValueAtTime(1500, t + 0.35);
    } else {
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.0001, t + 0.22);
    }
  }

  horn() {
    this.ensure();
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (t - this._hornAt < 0.42) return;
    this._hornAt = t;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.015);
    gain.gain.setValueAtTime(0.2, t + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    gain.connect(this.sfxGain);

    for (const freq of [392, 494]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.42);
    }
  }

  impact(hard = true) {
    this.ensure();
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(hard ? 900 : 500, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.25);

    const gain = ctx.createGain();
    const peak = hard ? 0.35 : 0.16;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.34);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(hard ? 110 : 80, t);
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(hard ? 0.25 : 0.1, t + 0.01);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    thump.connect(tg);
    tg.connect(this.sfxGain);
    thump.start(t);
    thump.stop(t + 0.24);
  }

  dispose() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.ready = false;
  }
}
