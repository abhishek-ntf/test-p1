/** Minimal start screen (full animated menu + garage arrive in Phase 6). */
export class MainMenu {
  constructor(parent = document.body, { onStart } = {}) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.innerHTML = `
      <div class="panel glass">
        <h1 class="title">NEON<br>HIGHWAY</h1>
        <p class="sub">Dodge traffic · avoid the railing · 3 lives</p>
        <div class="best-line">BEST <b data-k="best">0</b> · <span data-k="km">0.00</span> KM</div>
        <button type="button" class="btn" data-k="start">START</button>
        <p class="hint" data-k="hint"></p>
      </div>`;
    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((n) => { this.el[n.dataset.k] = n; });
    this.el.start.addEventListener('click', (e) => { e.currentTarget.blur(); if (onStart) onStart(); });
    parent.appendChild(this.root);
  }

  show(best, touch) {
    this.el.best.textContent = best.score.toLocaleString();
    this.el.km.textContent = best.km.toFixed(2);
    this.el.hint.textContent = touch
      ? 'Drag the wheel to steer · BRAKE · NITRO · HORN · swipe to switch lane'
      : '←→ / A D steer (tap = lane, hold = free) · ↑↓ speed · SPACE nitro · H horn · ENTER start';
    this.root.classList.remove('hidden');
  }

  hide() { this.root.classList.add('hidden'); }
}
