const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

/**
 * Desktop input.
 * - Tap A/D or arrows: snap to the next lane.  Hold: free steering (handled in Game).
 * - accel / brake / nitro are held states.
 */
export class KeyboardControls {
  constructor() {
    this.state = { accel: false, brake: false, nitro: false, steer: 0 };
    this.laneQueue = [];
    this.hornPulse = false;
    this.onPause = null;
    this.onAction = null; // Enter / R  (start, restart)
    this._l = false; this._r = false;

    this._down = (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': if (!e.repeat) this._push(-1); this._l = true; break;
        case 'ArrowRight': case 'KeyD': if (!e.repeat) this._push(1); this._r = true; break;
        case 'ArrowUp': case 'KeyW': this.state.accel = true; break;
        case 'ArrowDown': case 'KeyS': this.state.brake = true; break;
        case 'Space': this.state.nitro = true; break;
        case 'KeyH': if (!e.repeat) this.hornPulse = true; break;
        case 'Escape': if (!e.repeat && this.onPause) this.onPause(); break;
        case 'Enter': case 'KeyR': if (!e.repeat && this.onAction) this.onAction(e.code); break;
        default: break;
      }
      this._sync();
    };
    this._up = (e) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this._l = false; break;
        case 'ArrowRight': case 'KeyD': this._r = false; break;
        case 'ArrowUp': case 'KeyW': this.state.accel = false; break;
        case 'ArrowDown': case 'KeyS': this.state.brake = false; break;
        case 'Space': this.state.nitro = false; break;
        default: break;
      }
      this._sync();
    };
    this._blur = () => this.reset();
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
  }

  _sync() { this.state.steer = (this._r ? 1 : 0) - (this._l ? 1 : 0); }
  _push(d) { if (this.laneQueue.length < 3) this.laneQueue.push(d); }
  consumeLane() { return this.laneQueue.shift() || 0; }
  consumeHorn() { const h = this.hornPulse; this.hornPulse = false; return h; }

  reset() {
    this.state.accel = this.state.brake = this.state.nitro = false;
    this.state.steer = 0; this._l = this._r = false;
    this.laneQueue.length = 0; this.hornPulse = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }
}
