/**
 * In-game HUD:
 * - Live ranking panel (top-left)
 * - Clear reachable goals badge (top-center)
 * - Center speed and nitro gauges
 * - Right stats (score, best, lives)
 * - Quick action buttons (theme, mute, fullscreen, controls help, pause)
 * - Visual feedback banners, damage flash, overtake toasts.
 */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export class GameHUD {
  constructor(parent = document.body, { onPause, onTheme, onToggleMute, onToggleFullscreen, onHelp } = {}) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="hud-col hud-left">
        <div class="live-rank">
          <div class="lr-head">LIVE RANKING</div>
          <div class="lr-list" data-k="lrList"></div>
        </div>
      </div>

      <div class="hud-col hud-center">
        <div class="goal-chip" data-k="goal">🎯 GOAL: REACH LEVEL 2 (1,000m)</div>
        <div class="lvl" data-k="level">LEVEL 1</div>
        <div class="km"><b data-k="dist">0</b> m</div>
        <div class="bar"><i data-k="lvlbar"></i></div>
        <div class="spd"><b data-k="speed">0</b> km/h</div>
        <div class="bar nitro"><i data-k="nitro"></i></div>
        <small class="nlabel">NITRO</small>
      </div>

      <div class="hud-col hud-right">
        <div class="lives" data-k="lives"><span>♥</span><span>♥</span><span>♥</span></div>
        <div class="stat"><small>SCORE</small><b data-k="score">0</b></div>
        <div class="stat"><small>BEST</small><b data-k="best">0</b></div>
        <div class="btns">
          <button type="button" data-k="help" title="Controls diagram" aria-label="Controls">🎮</button>
          <button type="button" data-k="audio" title="Mute / Unmute" aria-label="Mute / Unmute">🔊</button>
          <button type="button" data-k="fs" title="Toggle Fullscreen" aria-label="Fullscreen">⛶</button>
          <button type="button" data-k="theme" title="Day / Night" aria-label="Day / night">☾</button>
          <button type="button" data-k="pause" title="Pause Game [P]" aria-label="Pause">❚❚</button>
        </div>
      </div>

      <div class="flash" data-k="flash"></div>
      <div class="banner" data-k="banner"></div>
      <div class="toast" data-k="toast"></div>
    `;

    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((n) => { this.el[n.dataset.k] = n; });
    this.hearts = Array.from(this.el.lives.children);
    this._c = {};
    this._lives = 3;

    const wire = (btn, fn) => btn.addEventListener('click', (e) => { e.currentTarget.blur(); if (fn) fn(); });
    wire(this.el.pause, onPause);
    wire(this.el.theme, onTheme);
    wire(this.el.audio, onToggleMute);
    wire(this.el.fs, onToggleFullscreen);
    wire(this.el.help, onHelp);

    parent.appendChild(this.root);
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  _txt(k, v) { if (this._c[k] !== v) { this._c[k] = v; this.el[k].textContent = v; } }
  _w(k, pct) {
    const v = `${Math.round(pct)}%`;
    if (this._c[k] !== v) { this._c[k] = v; this.el[k].style.width = v; }
  }

  setGoal(text) { this._txt('goal', text); }
  setScore(n) { this._txt('score', n.toLocaleString()); }
  setBest(n) { this._txt('best', n.toLocaleString()); }
  setDistance(m) { this._txt('dist', Math.round(m).toLocaleString()); }
  setLevel(l, progress) { this._txt('level', `LEVEL ${l}`); this._w('lvlbar', progress * 100); }
  setSpeed(kmh) { this._txt('speed', kmh); }

  setMuted(muted) {
    this.el.audio.textContent = muted ? '🔇' : '🔊';
  }

  setFullscreen(isFs) {
    this.el.fs.textContent = isFs ? '🗗' : '⛶';
  }

  setNitro(pct, active) {
    this._w('nitro', pct);
    if (this._c.nitroOn !== active) { this._c.nitroOn = active; this.el.nitro.classList.toggle('on', active); }
  }

  renderLiveRank(rows) {
    if (!rows || !rows.length) { this.el.lrList.innerHTML = ''; return; }
    let html = '';
    for (const r of rows) {
      if (r.sep) { html += '<div class="lr-sep">···</div>'; continue; }
      html += `<div class="lr-row${r.isMe ? ' me' : ''}">
        <span class="lr-rk">${r.rank}</span>
        <span class="lr-nm">${esc(r.name)}${r.isMe ? '' : ''}</span>
        <span class="lr-sc">${r.score.toLocaleString()}</span>
      </div>`;
    }
    if (this._c.lr !== html) { this._c.lr = html; this.el.lrList.innerHTML = html; }
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

  toast(text) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  }

  flash() {
    const f = this.el.flash;
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  dispose() {
    this.root.remove();
  }
}
