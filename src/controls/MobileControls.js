const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MAX_ANGLE = 1.4; // rad (~80 deg) of wheel rotation = full lock

const WHEEL_SVG = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="44" fill="rgba(0,0,0,.28)" stroke="#00e5ff" stroke-width="7"/>
  <circle cx="50" cy="50" r="10" fill="#00e5ff"/>
  <path d="M50 50 L50 14 M50 50 L17 69 M50 50 L83 69" stroke="#00e5ff" stroke-width="6" stroke-linecap="round"/>
  <rect x="43" y="3" width="14" height="10" rx="2" fill="#ff2a6d"/>
</svg>`;

/**
 * Touch input: a real steering wheel (drag to rotate), BRAKE, NITRO and swipe-to-change-lane.
 * Shown on touch devices only (add ?controls to the URL to force it on desktop for testing).
 */
export class MobileControls {
  static shouldShow() {
    return new URLSearchParams(location.search).has('controls') ||
      window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  constructor(parent = document.body) {
    this.state = { accel: false, brake: false, nitro: false, steer: 0 };
    this.steering = false;
    this.laneQueue = [];
    this.hornPulse = false;
    this.enabled = MobileControls.shouldShow();

    this.root = document.createElement('div');
    this.root.id = 'mobile-controls';
    this.root.hidden = !this.enabled;
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    this._buildWheel();
    this._btn('ctrl-brake', 'BRAKE', () => (this.state.brake = true), () => (this.state.brake = false));
    this._btn('ctrl-nitro', 'NITRO', () => (this.state.nitro = true), () => (this.state.nitro = false));
    this._btn('ctrl-horn', 'HORN', () => { this.hornPulse = true; });
    parent.appendChild(this.root);

    // Swipe anywhere (outside controls / HUD buttons) to snap to the next lane
    this._sx = null; this._sid = null;
    this._pd = (e) => {
      if (e.target.closest && e.target.closest('.ctrl, .wheel, button, .overlay')) return;
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

  _btn(cls, label, onDown, onUp) {
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
    this.root.appendChild(b);
  }

  _push(d) { if (this.laneQueue.length < 3) this.laneQueue.push(d); }
  consumeLane() { return this.laneQueue.shift() || 0; }
  consumeHorn() { const h = this.hornPulse; this.hornPulse = false; return h; }

  reset() {
    this.state.accel = this.state.brake = this.state.nitro = false;
    this.state.steer = 0; this.steering = false;
    this.laneQueue.length = 0; this.hornPulse = false;
    this.wheel.style.transform = 'rotate(0rad)';
    this.root.querySelectorAll('.active').forEach((n) => n.classList.remove('active'));
  }

  dispose() {
    window.removeEventListener('pointerdown', this._pd);
    window.removeEventListener('pointerup', this._pu);
    this.root.remove();
  }
}
