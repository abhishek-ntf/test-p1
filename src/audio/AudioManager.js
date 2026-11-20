/** Engine rumble, nitro whoosh, horn and impact — all synthesized, no audio files.   */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this._boosting = false;
    this._hornAt = 0;
  }

  ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 10;
      this.comp.ratio.value = 8;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.18;
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);
      this._buildEngine();
      this._buildBoost();
      this.ready = true;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
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
    gain.connect(this.master);
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
    gain.connect(this.master);
    src.start();

    this.boostFilter = filter;
    this.boostGain = gain;
  }

  /** Call every frame. `active` is false on the menu and while paused. */
  update({ active, speed, nitro }) {
    if (!this.ready) return;
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
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (t - this._hornAt < 0.42) return;
    this._hornAt = t;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.015);
    gain.gain.setValueAtTime(0.2, t + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    gain.connect(this.master);
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
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(hard ? 900 : 500, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.25);
    const gain = ctx.createGain();
    const peak = hard ? 0.4 : 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.34);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(hard ? 110 : 80, t);
    thump.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(hard ? 0.28 : 0.12, t + 0.01);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    thump.connect(tg);
    tg.connect(this.master);
    thump.start(t);
    thump.stop(t + 0.24);
  }

  dispose() {
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.ready = false;
  }
}
