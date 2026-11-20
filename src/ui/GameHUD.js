/** In-game HUD: lives, score, level + distance (km), speed, nitro, banners and damage flash. */
export class GameHUD {
  constructor(parent = document.body, { onPause, onTheme } = {}) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="hud-col hud-left">
        <div class="lives" data-k="lives"><span>♥</span><span>♥</span><span>♥</span></div>
        <div class="stat"><small>SCORE</small><b data-k="score">0</b></div>
      </div>
      <div class="hud-col hud-center">
        <div class="lvl" data-k="level">LEVEL 1</div>
        <div class="km"><b data-k="km">0.00</b> KM</div>
        <div class="bar"><i data-k="lvlbar"></i></div>
        <div class="spd"><b data-k="speed">0</b> km/h</div>
        <div class="bar nitro"><i data-k="nitro"></i></div>
      </div>
      <div class="hud-col hud-right">
        <div class="stat"><small>BEST</small><b data-k="best">0</b></div>
        <div class="btns">
          <button type="button" data-k="theme" aria-label="Day / night">☾</button>
          <button type="button" data-k="pause" aria-label="Pause">❚❚</button>
        </div>
      </div>
      <div class="flash" data-k="flash"></div>
      <div class="banner" data-k="banner"></div>`;
    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((n) => { this.el[n.dataset.k] = n; });
    this.hearts = Array.from(this.el.lives.children);
    this._c = {};
    this._lives = 3;

    const wire = (btn, fn) => btn.addEventListener('click', (e) => { e.currentTarget.blur(); if (fn) fn(); });
    wire(this.el.pause, onPause);
    wire(this.el.theme, onTheme);
    parent.appendChild(this.root);
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  _txt(k, v) { if (this._c[k] !== v) { this._c[k] = v; this.el[k].textContent = v; } }
  _w(k, pct) {
    const v = `${Math.round(pct)}%`;
    if (this._c[k] !== v) { this._c[k] = v; this.el[k].style.width = v; }
  }

  setScore(n) { this._txt('score', n.toLocaleString()); }
  setBest(n) { this._txt('best', n.toLocaleString()); }
  setKm(km) { this._txt('km', km.toFixed(2)); }
  setLevel(l, progress) { this._txt('level', `LEVEL ${l}`); this._w('lvlbar', progress * 100); }
  setSpeed(kmh) { this._txt('speed', kmh); }
  setNitro(pct, active) {
    this._w('nitro', pct);
    if (this._c.nitroOn !== active) { this._c.nitroOn = active; this.el.nitro.classList.toggle('on', active); }
  }

  setLives(n, animate = true) {
    this.hearts.forEach((h, i) => {
      const lost = i >= n;
      h.classList.toggle('lost', lost);
      if (animate && i === n && n < this._lives) { h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit'); }
    });
    this._lives = n;
  }

  banner(text, kind = 'good') {
    const b = this.el.banner;
    b.textContent = text; b.className = `banner ${kind}`;
    void b.offsetWidth; b.classList.add('show');
  }

  flash() {
    const f = this.el.flash;
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
}
