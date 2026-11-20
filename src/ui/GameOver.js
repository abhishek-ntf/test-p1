import { rankedRows, boardHTML } from './Leaderboard.js';

export class GameOver {
  constructor(parent = document.body, { onRestart, onMenu } = {}) {
    this.onRestart = onRestart; this.onMenu = onMenu;
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.innerHTML = `
      <div class="panel glass">
        <h1 class="title small">GAME OVER</h1>
        <div class="newbest hidden" data-k="newbest">★ NEW HIGH SCORE ★</div>
        <div class="score-big" data-k="score">0</div>
        <div class="over-rank">RANK <b data-k="rank">–</b> <span class="rank-note" data-k="rankNote"></span></div>
        <div class="stats">
          <div><small>DISTANCE</small><b data-k="dist">0 m</b></div>
          <div><small>LEVEL</small><b data-k="level">1</b></div>
          <div><small>BEST</small><b data-k="best">0</b></div>
        </div>
        <div class="board full" data-k="board"></div>
        <div class="go-actions">
          <button type="button" class="btn" data-k="restart">RESTART</button>
          <button type="button" class="btn ghost" data-k="menu">MENU</button>
        </div>
        <p class="hint">ENTER / R to restart</p>
      </div>`;
    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((n) => { this.el[n.dataset.k] = n; });
    this.el.restart.addEventListener('click', (e) => { e.currentTarget.blur(); if (this.onRestart) this.onRestart(); });
    this.el.menu.addEventListener('click', (e) => { e.currentTarget.blur(); if (this.onMenu) this.onMenu(); });
    parent.appendChild(this.root);
  }

  /** payload: { score, distance, level, best, newBest, prevRank, newRank, leaderboard(raw rows), meId } */
  show({ score, distance, level, best, newBest, prevRank, newRank, leaderboard, meId }) {
    this.el.score.textContent = score.toLocaleString();
    this.el.dist.textContent = `${Math.round(distance).toLocaleString()} m`;
    this.el.level.textContent = level;
    this.el.best.textContent = best.toLocaleString();
    this.el.newbest.classList.toggle('hidden', !newBest);
    this.el.rank.textContent = `#${newRank}`;
    const improved = newRank < prevRank;
    this.el.rankNote.textContent = improved ? `▲ from #${prevRank}` : '';
    this.el.rankNote.classList.toggle('up', improved);
    this.el.board.innerHTML = boardHTML(rankedRows(leaderboard || [], meId));
    this.root.classList.remove('hidden');
    // scroll the player's row into view
    requestAnimationFrame(() => {
      const me = this.el.board.querySelector('.row.me');
      if (me && me.scrollIntoView) me.scrollIntoView({ block: 'center' });
    });
  }

  hide() { this.root.classList.add('hidden'); }
}
