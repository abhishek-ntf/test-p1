import { GameStorage } from '../utils/Storage.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ── SVGs ─────────────────────────────────────────────────────────────── */
const CHEVRON_L = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
  <polyline points="15,6 9,12 15,18" stroke="white" stroke-width="3.2"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const CHEVRON_R = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
  <polyline points="9,6 15,12 9,18" stroke="white" stroke-width="3.2"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const HORN_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
  <path d="M3 9v6h4l5 5V4L7 9H3z" fill="white"/>
  <path d="M18 5a9 9 0 0 1 0 14M15 7.5a5 5 0 0 1 0 9"
    stroke="white" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;
const BOOST_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#00e5ff"
    stroke="#00e5ff" stroke-width="1" stroke-linejoin="round"/>
</svg>`;
const BRAKE_SVG = `<svg viewBox="0 0 48 20" aria-hidden="true">
  <rect x="1" y="1" width="46" height="4" rx="2" fill="white" opacity=".9"/>
  <rect x="1" y="8" width="46" height="4" rx="2" fill="white" opacity=".7"/>
  <rect x="1" y="15" width="46" height="4" rx="2" fill="white" opacity=".5"/>
</svg>`;
const ACCEL_SVG = `<svg viewBox="0 0 48 20" aria-hidden="true">
  <rect x="1" y="1" width="46" height="4" rx="2" fill="white" opacity=".5"/>
  <rect x="1" y="8" width="46" height="4" rx="2" fill="white" opacity=".7"/>
  <rect x="1" y="15" width="46" height="4" rx="2" fill="white" opacity=".9"/>
</svg>`;
const STEER_MODES_ICON = {
  arrows: `<svg viewBox="0 0 20 12" fill="none">
    <polyline points="7,2 2,6 7,10" stroke="#00e5ff" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="13,2 18,6 13,10" stroke="#00e5ff" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  motion: `<svg viewBox="0 0 20 20" fill="none">
    <rect x="6" y="1" width="8" height="14" rx="2"
      stroke="#00e5ff" stroke-width="1.8"/>
    <circle cx="10" cy="17.5" r="1.5" fill="#00e5ff"/>
    <path d="M2 7 L6 7 M14 7 L18 7"
      stroke="#00e5ff" stroke-width="1.6" stroke-linecap="round"/>
    <polyline points="2,10 0,7 2,4" stroke="#00e5ff" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="18,10 20,7 18,4" stroke="#00e5ff" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  wheel: `<svg viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="8" stroke="#00e5ff" stroke-width="1.8"/>
    <circle cx="10" cy="10" r="2.5" fill="#00e5ff"/>
    <path d="M10 10 L10 3 M10 10 L4.3 13.5 M10 10 L15.7 13.5"
      stroke="#00e5ff" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,
};
const MODE_LABELS = { arrows: 'ARROWS', motion: 'MOTION', wheel: 'WHEEL' };

/**
 * Mobile controls — three steering modes:
 *
 *  'arrows'  Hold < > buttons (bottom-left) for free steering.
 *  'motion'  Device gyroscope/accelerometer (DeviceOrientationEvent).
 *            NO touch input steers the car in this mode whatsoever.
 *  'wheel'   Drag the virtual steering wheel (bottom-left).
 *
 *  Right side always visible: HORN, BOOST (top), BRAKE, ACCELERATE (pedals).
 *  Floating STEER button (bottom-centre) opens the SteeringPicker at any time.
 */
export class MobileControls {
  static shouldShow() {
    return new URLSearchParams(location.search).has('controls') ||
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window;
  }

  constructor(parent = document.body, { onReset, onSteerSwitch } = {}) {
    this.onReset       = onReset;
    this.onSteerSwitch = onSteerSwitch;
    this.state         = { accel: false, brake: false, nitro: false, steer: 0 };
    this.steering      = false;
    this.laneQueue     = [];
    this.hornPulse     = false;
    this.enabled       = MobileControls.shouldShow();

    const s        = GameStorage.getSettings();
    // Migrate old 'gesture'/'tilt' saved values → 'motion'
    const saved    = s.controlMode;
    const initMode = (saved === 'gesture' || saved === 'tilt') ? 'motion'
                   : (saved || 'arrows');
    this.mode      = this.enabled ? initMode : 'arrows';
    this._sens     = s.tiltSensitivity ?? 1.5;
    this._sl       = false;  // left arrow held
    this._sr       = false;  // right arrow held

    // ── Motion / sensor state ──────────────────────────────────────────
    this._motionEnabled  = false;   // becomes true after permission granted
    this._motionCalib    = null;    // calibration zero (degrees), null = re-zero on first read
    this._motionSmooth   = 0;       // low-pass filtered value [-1,1]
    this._motionLast     = 0;       // last committed steering value (hysteresis)
    this._motionListener = null;    // bound handler reference

    this.root = document.createElement('div');
    this.root.id = 'mobile-controls';
    this.root.hidden = !this.enabled;
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    this._buildLayout();
    this._buildSteerSwitch(parent);
    this._applyMode(this.mode, false);

    // Global pointer handler ONLY for lane-snap swipe in arrow/wheel modes.
    // ⚠️  Motion mode registers ZERO pointer/touch listeners for steering.
    this._onGlobalDown = (e) => this._handleSwipeDown(e);
    this._onGlobalUp   = (e) => this._handleSwipeUp(e);
    if (this.enabled) {
      window.addEventListener('pointerdown', this._onGlobalDown);
      window.addEventListener('pointerup',   this._onGlobalUp);
    }

    parent.appendChild(this.root);
  }

  /* ══════════════════════════════════════════════════════════════════════
     LAYOUT BUILD
     ══════════════════════════════════════════════════════════════════════ */
  _buildLayout() {
    /* ── LEFT zone ── */
    this._leftZone = document.createElement('div');
    this._leftZone.className = 'mc-left-zone';

    // Arrow buttons (shown in 'arrows' mode only)
    this._leftArrow  = this._arrowBtn(this._leftZone, 'mc-arrow left',  CHEVRON_L, true);
    this._rightArrow = this._arrowBtn(this._leftZone, 'mc-arrow right', CHEVRON_R, false);

    // Virtual wheel (shown in 'wheel' mode)
    this._buildWheel(this._leftZone);

    // Motion / sensor badge + status (shown in 'motion' mode)
    this._motionBadge = document.createElement('div');
    this._motionBadge.className = 'mc-motion-badge hidden';
    this._motionBadge.innerHTML = `
      <div class="mc-motion-icon">
        <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
          <rect x="8" y="2" width="8" height="16" rx="2"
            stroke="#00e5ff" stroke-width="1.8"/>
          <circle cx="12" cy="20.5" r="1.5" fill="#00e5ff"/>
          <path d="M2 9 L8 9 M16 9 L22 9"
            stroke="#00e5ff" stroke-width="1.6" stroke-linecap="round"/>
          <polyline points="3,12 1,9 3,6" stroke="#00e5ff" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="21,12 23,9 21,6" stroke="#00e5ff" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="mc-motion-text">
        <span class="mc-motion-status" data-status>TILT PHONE TO STEER</span>
        <span class="mc-motion-hint">Left ← phone → Right</span>
      </div>`;

    // Calibrate button (inside badge)
    this._motionCalibBtn = document.createElement('button');
    this._motionCalibBtn.type = 'button';
    this._motionCalibBtn.className = 'mc-motion-calib-btn';
    this._motionCalibBtn.textContent = 'CALIBRATE';
    this._motionCalibBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      this._motionCalib = null;  // re-zero on next sensor read
      this._motionSmooth = 0;
      this._motionLast   = 0;
      this.state.steer   = 0;
      const s = this._motionBadge.querySelector('[data-status]');
      if (s) { s.textContent = 'CALIBRATED ✓'; setTimeout(() => { s.textContent = 'TILT PHONE TO STEER'; }, 1500); }
    });
    this._motionBadge.appendChild(this._motionCalibBtn);

    // Enable/permission button (shown before sensor is active)
    this._motionEnableBtn = document.createElement('button');
    this._motionEnableBtn.type = 'button';
    this._motionEnableBtn.className = 'mc-tilt-enable';
    this._motionEnableBtn.textContent = 'ENABLE MOTION';
    this._motionEnableBtn.addEventListener('click', (e) => {
      e.currentTarget.blur(); this._requestMotion();
    });

    this._leftZone.appendChild(this._motionBadge);
    this._leftZone.appendChild(this._motionEnableBtn);
    this.root.appendChild(this._leftZone);

    /* ── RIGHT zone ── */
    const rightZone = document.createElement('div');
    rightZone.className = 'mc-right-zone';

    const topRow = document.createElement('div');
    topRow.className = 'mc-top-row';
    this._hornBtn  = this._smallBtn(topRow, 'mc-small-btn horn',  HORN_SVG,  'HORN',
      null, () => { this.hornPulse = true; });
    this._boostBtn = this._smallBtn(topRow, 'mc-small-btn boost', BOOST_SVG, 'BOOST',
      () => (this.state.nitro = true), () => (this.state.nitro = false));
    rightZone.appendChild(topRow);

    const pedalRow = document.createElement('div');
    pedalRow.className = 'mc-pedal-row';
    this._brakeBtn = this._pedalBtn(pedalRow, 'mc-pedal brake', BRAKE_SVG, 'BRAKE',
      () => (this.state.brake = true), () => (this.state.brake = false));
    this._accelBtn = this._pedalBtn(pedalRow, 'mc-pedal accel', ACCEL_SVG, 'ACCELERATE',
      () => (this.state.accel = true), () => (this.state.accel = false));
    rightZone.appendChild(pedalRow);
    this.root.appendChild(rightZone);
  }

  /* ── Floating STEER mode switcher ──────────────────────────────────── */
  _buildSteerSwitch(parent) {
    this._steerSwitch = document.createElement('button');
    this._steerSwitch.id = 'steer-switch-btn';
    this._steerSwitch.type = 'button';
    if (!this.enabled) this._steerSwitch.classList.add('hidden');
    this._updateSwitchLabel();
    this._steerSwitch.addEventListener('click', (e) => {
      e.preventDefault(); e.currentTarget.blur();
      if (this.onSteerSwitch) this.onSteerSwitch();
    });
    parent.appendChild(this._steerSwitch);
  }

  _updateSwitchLabel() {
    this._steerSwitch.innerHTML =
      `<span class="ssb-icon">${STEER_MODES_ICON[this.mode] || ''}</span>` +
      `<span>${MODE_LABELS[this.mode] || this.mode.toUpperCase()}</span>`;
  }

  /* ══════════════════════════════════════════════════════════════════════
     BUTTON BUILDERS
     ══════════════════════════════════════════════════════════════════════ */
  _arrowBtn(parent, cls, svg, isLeft) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.innerHTML = svg;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (b.setPointerCapture) b.setPointerCapture(e.pointerId);
      b.classList.add('active');
      if (isLeft) this._sl = true; else this._sr = true;
      this._syncArrows();
      this._push(isLeft ? -1 : 1);
    });
    const up = () => {
      if (!b.classList.contains('active')) return;
      b.classList.remove('active');
      if (isLeft) this._sl = false; else this._sr = false;
      this._syncArrows();
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    parent.appendChild(b);
    return b;
  }

  _syncArrows() {
    if (this.mode !== 'arrows') return;
    const s = (this._sr ? 1 : 0) - (this._sl ? 1 : 0);
    this.state.steer = s;
    this.steering    = s !== 0;
  }

  _buildWheel(parent) {
    const WHEEL_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="rgba(0,0,0,.35)"
        stroke="#00e5ff" stroke-width="7"/>
      <circle cx="50" cy="50" r="10" fill="#00e5ff"/>
      <path d="M50 50 L50 14 M50 50 L17 69 M50 50 L83 69"
        stroke="#00e5ff" stroke-width="6" stroke-linecap="round"/>
      <rect x="43" y="3" width="14" height="10" rx="2" fill="#ff2a6d"/>
    </svg>`;
    const w = document.createElement('div');
    w.className = 'mc-wheel'; w.innerHTML = WHEEL_SVG;
    this.wheel = w;
    let pid = null, a0 = 0;
    const ang = (e) => {
      const r = w.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top  + r.height / 2),
                        e.clientX - (r.left + r.width  / 2));
    };
    w.addEventListener('pointerdown', (e) => {
      e.preventDefault(); pid = e.pointerId; a0 = ang(e);
      if (w.setPointerCapture) w.setPointerCapture(pid);
      this.steering = true; w.classList.add('active'); w.style.transition = 'none';
    });
    w.addEventListener('pointermove', (e) => {
      if (!this.steering || e.pointerId !== pid) return;
      let d = ang(e) - a0;
      while (d >  Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      d = clamp(d, -1.4, 1.4);
      this.state.steer = d / 1.4;
      w.style.transform = `rotate(${d}rad)`;
    });
    const rel = (e) => {
      if (!this.steering || (e && e.pointerId !== pid)) return;
      this.steering = false; this.state.steer = 0; pid = null;
      w.classList.remove('active');
      w.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1.2)';
      w.style.transform  = 'rotate(0rad)';
    };
    w.addEventListener('pointerup',          rel);
    w.addEventListener('pointercancel',      rel);
    w.addEventListener('lostpointercapture', rel);
    parent.appendChild(w);
  }

  _smallBtn(parent, cls, svg, label, onDown, onUp) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls;
    b.innerHTML = `<span class="mc-btn-icon">${svg}</span><span class="mc-btn-label">${label}</span>`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (b.setPointerCapture) b.setPointerCapture(e.pointerId);
      b.classList.add('active'); if (onDown) onDown();
    });
    const up = () => {
      if (!b.classList.contains('active')) return;
      b.classList.remove('active'); if (onUp) onUp();
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    parent.appendChild(b); return b;
  }

  _pedalBtn(parent, cls, svg, label, onDown, onUp) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls;
    b.innerHTML = `<span class="mc-pedal-icon">${svg}</span><span class="mc-pedal-label">${label}</span>`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (b.setPointerCapture) b.setPointerCapture(e.pointerId);
      b.classList.add('active'); if (onDown) onDown();
    });
    const up = () => {
      if (!b.classList.contains('active')) return;
      b.classList.remove('active'); if (onUp) onUp();
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    parent.appendChild(b); return b;
  }

  /* ══════════════════════════════════════════════════════════════════════
     GLOBAL SWIPE (lane-snap) — ONLY active in arrow/wheel modes.
     Motion mode has ZERO touch-based steering of any kind.
     ══════════════════════════════════════════════════════════════════════ */
  _isControlTarget(e) {
    return e.target.closest &&
      e.target.closest(
        '.mc-arrow,.mc-pedal,.mc-small-btn,.mc-wheel,.mc-motion-badge,' +
        '.mc-motion-calib-btn,.mc-tilt-enable,button,.overlay,' +
        '#steer-switch-btn,#steering-picker'
      );
  }

  _handleSwipeDown(e) {
    // Motion mode: no touch tracking at all
    if (this.mode === 'motion') return;
    if (this._isControlTarget(e)) return;
    if (this._lsid !== null) return;
    this._lsid = e.pointerId;
    this._lsx  = e.clientX;
  }

  _handleSwipeUp(e) {
    // Motion mode: no touch tracking at all
    if (this.mode === 'motion') return;
    if (e.pointerId !== this._lsid) return;
    const dx = e.clientX - (this._lsx || 0);
    this._lsid = null; this._lsx = null;
    if (Math.abs(dx) > 55) this._push(dx > 0 ? 1 : -1);
  }

  /* ══════════════════════════════════════════════════════════════════════
     MOTION / SENSOR STEERING
     Uses DeviceOrientationEvent exclusively — no touch, no mouse, no swipe.
     ══════════════════════════════════════════════════════════════════════ */

  /** Request iOS permission then start the sensor listener. */
  _requestMotion() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      // iOS 13+: must be called from a user gesture
      D.requestPermission()
        .then((result) => {
          if (result === 'granted') {
            this._startMotionListener();
          } else {
            this._motionUnavailable('Permission denied. Choose another mode.');
          }
        })
        .catch(() => this._motionUnavailable('Permission error. Choose another mode.'));
    } else {
      // Android / other: no permission API, just start
      this._startMotionListener();
    }
  }

  _startMotionListener() {
    if (this._motionListener) return;  // already listening
    this._motionListener = (e) => this._onMotion(e);
    window.addEventListener('deviceorientation', this._motionListener, { passive: true });

    // Mark as enabled and update UI
    this._motionEnabled = true;
    if (this._motionEnableBtn) this._motionEnableBtn.classList.add('hidden');
    if (this._motionBadge) {
      this._motionBadge.classList.add('on');
      const s = this._motionBadge.querySelector('[data-status]');
      if (s) s.textContent = 'TILT PHONE TO STEER';
    }
  }

  _stopMotionListener() {
    if (this._motionListener) {
      window.removeEventListener('deviceorientation', this._motionListener);
      this._motionListener = null;
    }
    this._motionEnabled = false;
    this._motionCalib   = null;
    this._motionSmooth  = 0;
    this._motionLast    = 0;
    this.state.steer    = 0;
    this.steering       = false;
  }

  _motionUnavailable(msg) {
    if (this._motionBadge) {
      const s = this._motionBadge.querySelector('[data-status]');
      if (s) s.textContent = msg || 'Sensors unavailable';
    }
  }

  /**
   * Core sensor handler — called on every deviceorientation event.
   *
   * Coordinate mapping (phone held in landscape for racing):
   *   • landscape-primary   → beta  is left/right tilt
   *   • landscape-secondary → -beta
   *   • portrait (fallback) → gamma is left/right tilt
   *
   * Pipeline:
   *   1. Pick raw axis value
   *   2. Subtract calibration zero on first read
   *   3. Divide by sensitivity threshold (degrees for full lock)
   *   4. Apply deadzone so small wobble doesn't steer
   *   5. Low-pass smooth (exponential moving average) → prevents jitter
   *   6. Hysteresis guard → prevents rapid repeated lane changes
   */
  _onMotion(e) {
    if (!this._motionEnabled || this.mode !== 'motion') return;

    // Choose axis based on current orientation
    const orient = (screen.orientation && screen.orientation.type) || '';
    let raw;
    if (orient.includes('landscape')) {
      raw = e.beta || 0;
      if (orient === 'landscape-secondary') raw = -raw;
    } else {
      // portrait or unknown
      raw = e.gamma || 0;
    }

    // 1. Auto-calibrate: capture zero on first reading after enable/calibrate
    if (this._motionCalib === null) {
      this._motionCalib = raw;
      return;  // skip first sample to avoid a steer spike
    }

    // 2. Offset from calibration zero
    const offset = raw - this._motionCalib;

    // 3. Normalise: threshold = 25° / sensitivity
    //    At sensitivity 1.5 → ~16.7° from centre = full lock
    const threshold = 25 / (this._sens || 1.5);
    let val = clamp(offset / threshold, -1, 1);

    // 4. Deadzone: ignore small wobble
    if (Math.abs(val) < 0.08) val = 0;

    // 5. Exponential low-pass smooth (α = 0.18 → sluggish but stable)
    this._motionSmooth += (val - this._motionSmooth) * 0.18;

    // 6. Hysteresis: only commit a new steer value when it differs enough
    if (Math.abs(this._motionSmooth - this._motionLast) > 0.05) {
      this._motionLast  = this._motionSmooth;
      this.state.steer  = this._motionSmooth;
      this.steering     = Math.abs(this._motionSmooth) > 0.04;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     MODE SWITCHING
     ══════════════════════════════════════════════════════════════════════ */
  _applyMode(mode, save = true) {
    // Map legacy saved values
    if (mode === 'gesture' || mode === 'tilt') mode = 'motion';

    this.mode = mode;

    // Reset all steering state
    this._sl = this._sr = false;
    this._lsid = null; this._lsx = null;
    this.state.steer = 0;
    this.steering    = false;

    // Stop sensor if leaving motion mode
    if (mode !== 'motion') this._stopMotionListener();

    // ── Visibility ──────────────────────────────────────────────────────
    // Arrows: shown only in 'arrows' mode
    const isArrows = mode === 'arrows';
    if (this._leftArrow)  this._leftArrow.style.display  = isArrows ? '' : 'none';
    if (this._rightArrow) this._rightArrow.style.display = isArrows ? '' : 'none';

    // Wheel: shown only in 'wheel' mode
    if (this.wheel) this.wheel.style.display = mode === 'wheel' ? '' : 'none';

    // Motion badge + enable btn: shown only in 'motion' mode
    const isMotion = mode === 'motion';
    if (this._motionBadge)     this._motionBadge.classList.toggle('hidden',    !isMotion);
    if (this._motionEnableBtn) {
      const needsPermission = isMotion &&
        typeof window.DeviceOrientationEvent !== 'undefined' &&
        typeof window.DeviceOrientationEvent.requestPermission === 'function' &&
        !this._motionEnabled;
      this._motionEnableBtn.classList.toggle('hidden', !needsPermission);
    }

    // Start sensor automatically on Android (no permission dialog needed)
    if (isMotion) {
      const needsPermission =
        typeof window.DeviceOrientationEvent !== 'undefined' &&
        typeof window.DeviceOrientationEvent.requestPermission === 'function';
      if (!needsPermission) {
        // Android / non-iOS: start immediately
        this._startMotionListener();
      }
      // iOS: user must tap ENABLE MOTION to trigger the permission prompt
    }

    this._updateSwitchLabel();
    if (save) GameStorage.saveSettings({ controlMode: mode });
  }

  /** Public: switch steering mode (called from SteeringPicker / Settings). */
  setMode(mode)      { this._applyMode(mode, true); }
  setSensitivity(n)  { this._sens = Number(n) || 1.5; }
  // setInvert kept for API compatibility but not used in motion mode
  setInvert(b)       { /* not applicable */ }

  /** Request iOS motion permission from a user gesture (called by SteeringPicker confirm). */
  calibrate() { if (this.mode === 'motion') this._requestMotion(); }

  /* ══════════════════════════════════════════════════════════════════════
     PUBLIC INPUT API
     ══════════════════════════════════════════════════════════════════════ */
  _push(d) { if (this.laneQueue.length < 3) this.laneQueue.push(d); }
  consumeLane()  { return this.laneQueue.shift() || 0; }
  consumeHorn()  { const h = this.hornPulse; this.hornPulse = false; return h; }

  reset() {
    this.state.accel = this.state.brake = this.state.nitro = false;
    this.state.steer = 0; this.steering = false;
    this._sl = this._sr = false;
    this._lsid = null; this._lsx = null;
    this.laneQueue.length = 0; this.hornPulse = false;
    // Keep sensor running through reset — just zero the steer output
    if (this.mode === 'motion') { this._motionSmooth = 0; this._motionLast = 0; }
    if (this.wheel) this.wheel.style.transform = 'rotate(0rad)';
    this.root.querySelectorAll('.active').forEach((n) => n.classList.remove('active'));
  }

  dispose() {
    this._stopMotionListener();
    if (this._onGlobalDown) window.removeEventListener('pointerdown', this._onGlobalDown);
    if (this._onGlobalUp)   window.removeEventListener('pointerup',   this._onGlobalUp);
    if (this._steerSwitch)  this._steerSwitch.remove();
    this.root.remove();
  }
}
