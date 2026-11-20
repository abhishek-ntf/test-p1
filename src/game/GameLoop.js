import * as THREE from 'three';

/** requestAnimationFrame loop with THREE.Clock delta time; auto-pauses when the tab is hidden. */
export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.clock = new THREE.Clock(false);
    this.running = false;
    this.wasRunning = false;
    this._raf = 0;
    this._tick = this._tick.bind(this);
    this._onVisibility = () => {
      if (document.hidden) { this.wasRunning = this.running; this.stop(); }
      else if (this.wasRunning) this.start();
    };
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    this.clock.stop();
    cancelAnimationFrame(this._raf);
  }

  _tick() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);
    const dt = Math.min(this.clock.getDelta(), 0.05); // clamp big spikes
    this.update(dt);
    this.render();
  }

  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
}
