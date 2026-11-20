import { GameStorage } from '../utils/Storage.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MAX_ANGLE = 1.4; // rad (~80 deg) of wheel rotation = full lock

const WHEEL_SVG = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="44" fill="rgba(0,0,0,.28)" stroke="#00e5ff" stroke-width="7"/>
  <circle cx="50" cy="50" r="10" fill="#00e5ff"/>
  <path d="M50 50 L50 14 M50 50 L17 69 M50 50 L83 69" stroke="#00e5ff" stroke-width="6" stroke-linecap="round"/>
  <rect x="43" y="3" width="14" height="10" rx="2" fill="#ff2a6d"/>
</svg>`;

const ARROW_SVG = (left) => left
  ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 L9 12 L15 18" stroke="#00e5ff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6 L15 12 L9 18" stroke="#00e5ff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Touch input with three selectable steering modes (saved in LocalStorage):
 *   - 'wheel'   : drag a virtual steering wheel (proportional)
 *   - 'buttons' : hold left/right arrow buttons (free steering)
 *   - 'tilt'    : device orientation (tilt left/right), with calibration + sensitivity
 * Plus touch buttons: ACCELERATOR, BRAKE, NITRO, HORN, RESET.
 * Multi-touch friendly (each control captures its own pointer).
 */
export class MobileControls {
  static shouldShow() {
    return new URLSearchParams(location.search).has('controls') ||
      window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  constructor(parent = document.body, { onReset } = {}) {
    this.onReset = onReset;
    this.state = { accel: false, brake: false, nitro: false, steer: 0 };
    this.steering = false;        // true while a steering control is providing input
    this.laneQueue = [];
    this.hornPulse = false;
    this.enabled = MobileControls.shouldShow();

    const s = GameStorage.getSettings();
    this.mode = this.enabled ? (s.controlMode || 'wheel') : 'wheel';
    this._sens = s.tiltSensitivity ?? 1.5;
    this._invert = !!s.tiltInvert;
    this._calib = null;          // tilt zero (degrees), null = auto-zero on first reading
    this._tiltSmooth = 0;
    this._tiltEnabled = false;
    this._sl = false; this._sr = false;  // arrow buttons held

    this.root = document.createElement('div');
    this.root.id = 'mobile-controls';
    this.root.hidden = !this.enabled;
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    this._buildActions();
    this._buildSteering();

    // Swipe anywhere (outside controls / HUD buttons) to snap to the next lane.
    this._sx = null; this._sid = null;
    this._pd = (e) => {
      if (e.target.closest && e.target.closest('.ctrl, .wheel, .steer-arrows, .tilt-badge, button, .overlay')) return;
      this._sx = e.clientX; this._sid = e.pointerId;
    };
    this._pu = (e) => {
      if (this._sx === null || e.pointerId !== this._sid) return;
      const dx = e.clientX - this._sx; this._sx = null;
      if (Math.abs(dx) > 50) this._push(dx > 0 ? 1 : -1);
    };
    if (this.enabled) {
      window.addEventListener('pointerdown', this._pd);
      window.addEventListener('pointerup', this._pu);
    }

    parent.appendChild(this.root);
  }

  // ---------- action buttons ----------
  _buildActions() {
    const cluster = document.createElement('div');
    cluster.className = 'ctrl-cluster';
    this._btn(cluster, 'ctrl-reset', 'RESET', null, () => { if (this.onReset) this.onReset(); });
    this._btn(cluster, 'ctrl-horn', 'HORN', null, () => { this.hornPulse = true; });
    this._btn(cluster, 'ctrl-nitro', 'NITRO', () => (this.state.nitro = true), () => (this.state.nitro = false));
    this._btn(cluster, 'ctrl-brake', 'BRAKE', () => (this.state.brake = true), () => (this.state.brake = false));
    this._btn(cluster, 'ctrl-accel', 'GAS', () => (this.state.accel = true), () => (this.state.accel = false));
    this.root.appendChild(cluster);
  }

  _btn(parent, cls, label, onDown, onUp) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `ctrl ${cls}`; b.textContent = label;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (b.setPointerCapture) b.setPointerCapture(e.pointerId);
      b.classList.add('active');
      if (onDown) onDown();
    });
    const up = () => {
      if (!b.classList.contains('active')) return;
      b.classList.remove('active');
      if (onUp) onUp();
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    parent.appendChild(b);
    return b;
  }

  // ---------- steering modes ----------
  _buildSteering() {
    if (this.mode === 'wheel') this._buildWheel();
    else if (this.mode === 'buttons') this._buildButtons();
    else if (this.mode === 'tilt') this._buildTilt();
  }

  _buildWheel() {
    const w = document.createElement('div');
    w.className = 'wheel'; w.innerHTML = WHEEL_SVG;
    this.wheel = w;
    let pid = null, a0 = 0;
    const angle = (e) => {
      const r = w.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    w.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pid = e.pointerId; a0 = angle(e);
      if (w.setPointerCapture) w.setPointerCapture(pid);
      this.steering = true; w.classList.add('active'); w.style.transition = 'none';
    });
    w.addEventListener('pointermove', (e) => {
      if (!this.steering || e.pointerId !== pid) return;
      let d = angle(e) - a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      d = clamp(d, -MAX_ANGLE, MAX_ANGLE);
      this.state.steer = d / MAX_ANGLE;
      w.style.transform = `rotate(${d}rad)`;
    });
    const release = (e) => {
      if (!this.steering || (e && e.pointerId !== pid)) return;
      this.steering = false; this.state.steer = 0; pid = null;
      w.classList.remove('active');
      w.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1.2)';
      w.style.transform = 'rotate(0rad)';
    };
    w.addEventListener('pointerup', release);
    w.addEventListener('pointercancel', release);
    w.addEventListener('lostpointercapture', release);
    this.root.appendChild(w);
  }

  _buildButtons() {
    const wrap = document.createElement('div');
    wrap.className = 'steer-arrows';
    const mk = (left) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `ctrl steer-arrow ${left ? 'left' : 'right'}`;
      b.innerHTML = ARROW_SVG(left);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (b.setPointerCapture) b.setPointerCapture(e.pointerId);
        b.classList.add('active');
        if (left) this._sl = true; else this._sr = true;
        this._syncButtons();
      });
      const up = () => {
        if (!b.classList.contains('active')) return;
        b.classList.remove('active');
        if (left) this._sl = false; else this._sr = false;
        this._syncButtons();
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      return b;
    };
    wrap.appendChild(mk(true));
    wrap.appendChild(mk(false));
    this.steerArrows = wrap;
    this.root.appendChild(wrap);
  }

  _syncButtons() {
    const s = (this._sr ? 1 : 0) - (this._sl ? 1 : 0);
    this.state.steer = s;
    this.steering = s !== 0;
  }

  _buildTilt() {
    const badge = document.createElement('div');
    badge.className = 'tilt-badge';
    badge.innerHTML = '<span class="tilt-dot"></span> TILT';
    this.tiltBadge = badge;
    this.root.appendChild(badge);

    const en = document.createElement('button');
    en.type = 'button'; en.className = 'ctrl tilt-enable';
    en.textContent = 'ENABLE TILT';
    en.addEventListener('click', (e) => { e.currentTarget.blur(); this.calibrate(); });
    this.tiltEnableBtn = en;
    this.root.appendChild(en);

    // Android / desktop: sensor usually works without an explicit permission prompt,
    // so start listening right away. iOS needs the Calibrate/Enable gesture (below).
    this._startTiltListener();
  }

  _startTiltListener() {
    if (this._tiltListener) return;
    this._tiltListener = (e) => this._onTilt(e);
    window.addEventListener('deviceorientation', this._tiltListener);
  }

  /** Request iOS permission (if needed) and re-zero the tilt centre. */
  calibrate() {
    const D = window.DeviceOrientationEvent;
    const go = () => {
      this._tiltEnabled = true;
      this._calib = null; // re-zero on next reading
      if (this.tiltEnableBtn) this.tiltEnableBtn.classList.add('hidden');
      if (this.tiltBadge) this.tiltBadge.classList.add('on');
    };
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission().then((r) => { if (r === 'granted') go(); }).catch(() => {});
    } else {
      go();
    }
  }

  _onTilt(e) {
    if (!this._tiltEnabled || this.mode !== 'tilt') return;
    const o = (screen.orientation && screen.orientation.type) || '';
    let raw;
    if (o.includes('landscape')) {
      raw = e.beta || 0;
      if (o === 'landscape-secondary') raw = -raw;
    } else {
      raw = e.gamma || 0; // portrait: left/right tilt
    }
    if (this._calib === null) this._calib = raw; // first reading (or after calibrate) = zero
    let val = ((raw - this._calib) * this._sens) / 25; // ~25° = full lock at sensitivity 1
    if (this._invert) val = -val;
    val = clamp(val, -1, 1);
    if (Math.abs(val) < 0.06) val = 0; // deadzone
    this._tiltSmooth += (val - this._tiltSmooth) * 0.25; // low-pass smoothing
    this.state.steer = this._tiltSmooth;
    this.steering = true;
  }

  // ---------- public API ----------
  setMode(mode) {
    this.mode = mode;
    // tear down existing steering UI
    if (this.wheel) { this.wheel.remove(); this.wheel = null; }
    if (this.steerArrows) { this.steerArrows.remove(); this.steerArrows = null; }
    if (this.tiltBadge) { this.tiltBadge.remove(); this.tiltBadge = null; }
    if (this.tiltEnableBtn) { this.tiltEnableBtn.remove(); this.tiltEnableBtn = null; }
    this._sl = this._sr = false;
    this.steering = false; this.state.steer = 0; this._tiltSmooth = 0;
    if (mode !== 'tilt' && this._tiltListener) {
      window.removeEventListener('deviceorientation', this._tiltListener);
      this._tiltListener = null; this._tiltEnabled = false;
    }
    this._buildSteering();
    if (mode === 'tilt') this._startTiltListener();
    GameStorage.saveSettings({ controlMode: mode });
  }

  setSensitivity(n) { this._sens = Number(n) || 1.5; }
  setInvert(b) { this._invert = !!b; }

  _push(d) { if (this.laneQueue.length < 3) this.laneQueue.push(d); }
  consumeLane() { return this.laneQueue.shift() || 0; }
  consumeHorn() { const h = this.hornPulse; this.hornPulse = false; return h; }

  reset() {
    this.state.accel = this.state.brake = this.state.nitro = false;
    this.state.steer = 0; this.steering = false; this._tiltSmooth = 0;
    this._sl = this._sr = false;
    this.laneQueue.length = 0; this.hornPulse = false;
    if (this.wheel) this.wheel.style.transform = 'rotate(0rad)';
    this.root.querySelectorAll('.active').forEach((n) => n.classList.remove('active'));
  }

  dispose() {
    if (this._tiltListener) window.removeEventListener('deviceorientation', this._tiltListener);
    window.removeEventListener('pointerdown', this._pd);
    window.removeEventListener('pointerup', this._pu);
    this.root.remove();
  }
}
