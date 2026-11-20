export class GameOver {
  constructor(parent = document.body, { onRestart } = {}) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.innerHTML = `
      <div class="panel glass">
        <h1 class="title small">GAME OVER</h1>
        <div class="newbest hidden" data-k="newbest">★ NEW HIGH SCORE ★</div>
        <div class="score-big" data-k="score">0</div>
        <div class="stats">
          <div><small>DISTANCE</small><b data-k="km">0.00 km</b></div>
          <div><small>LEVEL</small><b data-k="level">1</b></div>
          <div><small>BEST</small><b data-k="best">0</b></div>
        </div>
        <button type="button" class="btn" data-k="restart">RESTART</button>
        <p class="hint">ENTER / R to restart</p>
      </div>`;
    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((n) => { this.el[n.dataset.k] = n; });
    this.el.restart.addEventListener('click', (e) => { e.currentTarget.blur(); if (onRestart) onRestart(); });
    parent.appendChild(this.root);
  }

  show({ score, km, level, best, newBest }) {
    this.el.score.textContent = score.toLocaleString();
    this.el.km.textContent = `${km.toFixed(2)} km`;
    this.el.level.textContent = level;
    this.el.best.textContent = best.toLocaleString();
    this.el.newbest.classList.toggle('hidden', !newBest);
    this.root.classList.remove('hidden');
  }

  hide() { this.root.classList.add('hidden'); }
}
