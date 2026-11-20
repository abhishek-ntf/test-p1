/**
 * Landscape handling for mobile.
 *  - Tries to lock the screen to landscape on a user gesture (START).
 *  - If locking is unavailable / fails and the device is in portrait, shows a
 *    full-screen "rotate your device" overlay so the player knows to turn it.
 *  - Adjusts nothing in the renderer (SceneManager already reacts to resize +
 *    orientationchange); this only manages the lock + overlay UI.
 */
export class Orientation {
  constructor(parent = document.body) {
    this.parent = parent;
    this.mobile = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.locked = false;

    this.overlay = document.createElement('div');
    this.overlay.id = 'rotate-overlay';
    this.overlay.className = 'hidden';
    this.overlay.innerHTML = `
      <div class="rotate-inner">
        <svg viewBox="0 0 24 24" class="rotate-icon" aria-hidden="true">
          <path d="M6 9h12v6h-3l4 4 4-4h-3V7a1 1 0 0 0-1-1H6V3L1 7l5 4V9z" fill="#00e5ff"/>
        </svg>
        <h2>ROTATE YOUR DEVICE</h2>
        <p>Play in landscape for the best experience</p>
      </div>`;
    parent.appendChild(this.overlay);

    this._onOrient = () => this.update();
    window.addEventListener('orientationchange', this._onOrient);
    window.addEventListener('resize', this._onOrient);
    this.update();
  }

  isLandscape() { return window.innerWidth >= window.innerHeight; }

  /** Call from a user gesture (e.g. START). Best-effort fullscreen + landscape lock. */
  async requestLandscape() {
    if (!this.mobile) return;
    // Fullscreen improves the chance that orientation.lock succeeds on Android.
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
    } catch { /* ignored — not all browsers/contexts allow it */ }
    try {
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        await screen.orientation.lock('landscape');
        this.locked = true;
      }
    } catch { this.locked = false; }
    this.update();
  }

  update() {
    const show = this.mobile && !this.isLandscape();
    this.overlay.classList.toggle('hidden', !show);
  }

  dispose() {
    window.removeEventListener('orientationchange', this._onOrient);
    window.removeEventListener('resize', this._onOrient);
    this.overlay.remove();
  }
}
