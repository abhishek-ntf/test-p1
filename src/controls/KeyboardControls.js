const PREVENT_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab',
]);

/**
 * Desktop input:
 * - Adapts to international layouts: QWERTY (WASD) and AZERTY (ZQSD), plus Arrow keys.
 * - Tap Left/Right: snap to next lane. Hold: free steering.
 * - Accel / Brake / Nitro: held states.
 * - Safe Pause key: 'P' (avoids conflicting with browser Escape key in fullscreen).
 * - Key activity tracking for the in-game visual keyboard overlay.
 */
export class KeyboardControls {
  constructor() {
    this.state = { accel: false, brake: false, nitro: false, steer: 0 };
    this.laneQueue = [];
    this.hornPulse = false;
    this.onPause = null;
    this.onAction = null; // Enter / R (start, restart)
    this.onMute = null;   // M key
    this.onFullscreen = null; // F key
    this.onKeyActivity = null; // (action, isDown) => for visual overlay

    this.activeActions = new Set();
    this._l = false;
    this._r = false;

    this._isLeft = (code, key) => code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ' || key === 'a' || key === 'A' || key === 'q' || key === 'Q';
    this._isRight = (code, key) => code === 'ArrowRight' || code === 'KeyD' || key === 'd' || key === 'D';
    this._isAccel = (code, key) => code === 'ArrowUp' || code === 'KeyW' || code === 'KeyZ' || key === 'w' || key === 'W' || key === 'z' || key === 'Z';
    this._isBrake = (code, key) => code === 'ArrowDown' || code === 'KeyS' || key === 's' || key === 'S';
    this._isNitro = (code, key) => code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyN' || code === 'KeyX' || key === ' ' || key === 'n' || key === 'N' || key === 'x' || key === 'X';
    this._isHorn = (code, key) => code === 'KeyH' || code === 'KeyE' || key === 'h' || key === 'H' || key === 'e' || key === 'E';
    this._isPause = (code, key) => code === 'KeyP' || key === 'p' || key === 'P' || code === 'Escape';
    this._isAction = (code, key) => code === 'Enter' || code === 'KeyR' || key === 'r' || key === 'R' || key === 'Enter';
    this._isMute = (code, key) => code === 'KeyM' || key === 'm' || key === 'M';
    this._isFs = (code, key) => code === 'KeyF' || key === 'f' || key === 'F';

    this._down = (e) => {
      // Prevent default scrolling / browser actions for game keys
      if (PREVENT_KEYS.has(e.code) || e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
      }

      const { code, key } = e;

      if (this._isLeft(code, key)) {
        if (!e.repeat) this._push(-1);
        this._l = true;
        this._notify('left', true);
      }
      if (this._isRight(code, key)) {
        if (!e.repeat) this._push(1);
        this._r = true;
        this._notify('right', true);
      }
      if (this._isAccel(code, key)) {
        this.state.accel = true;
        this._notify('accel', true);
      }
      if (this._isBrake(code, key)) {
        this.state.brake = true;
        this._notify('brake', true);
      }
      if (this._isNitro(code, key)) {
        this.state.nitro = true;
        this._notify('nitro', true);
      }
      if (this._isHorn(code, key)) {
        if (!e.repeat) this.hornPulse = true;
        this._notify('horn', true);
      }
      if (this._isPause(code, key)) {
        if (!e.repeat && this.onPause) this.onPause();
      }
      if (this._isAction(code, key)) {
        if (!e.repeat && this.onAction) this.onAction(code);
      }
      if (this._isMute(code, key)) {
        if (!e.repeat && this.onMute) this.onMute();
      }
      if (this._isFs(code, key)) {
        if (!e.repeat && this.onFullscreen) this.onFullscreen();
      }

      this._sync();
    };

    this._up = (e) => {
      const { code, key } = e;

      if (this._isLeft(code, key)) {
        this._l = false;
        this._notify('left', false);
      }
      if (this._isRight(code, key)) {
        this._r = false;
        this._notify('right', false);
      }
      if (this._isAccel(code, key)) {
        this.state.accel = false;
        this._notify('accel', false);
      }
      if (this._isBrake(code, key)) {
        this.state.brake = false;
        this._notify('brake', false);
      }
      if (this._isNitro(code, key)) {
        this.state.nitro = false;
        this._notify('nitro', false);
      }
      if (this._isHorn(code, key)) {
        this._notify('horn', false);
      }

      this._sync();
    };

    this._blur = () => this.reset();
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
  }

  _notify(action, isDown) {
    if (isDown) this.activeActions.add(action);
    else this.activeActions.delete(action);
    if (this.onKeyActivity) this.onKeyActivity(action, isDown);
  }

  _sync() {
    this.state.steer = (this._r ? 1 : 0) - (this._l ? 1 : 0);
  }

  _push(d) {
    if (this.laneQueue.length < 3) this.laneQueue.push(d);
  }

  consumeLane() {
    return this.laneQueue.shift() || 0;
  }

  consumeHorn() {
    const h = this.hornPulse;
    this.hornPulse = false;
    return h;
  }

  reset() {
    this.state.accel = this.state.brake = this.state.nitro = false;
    this.state.steer = 0;
    this._l = this._r = false;
    this.laneQueue.length = 0;
    this.hornPulse = false;
    this.activeActions.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }
}
