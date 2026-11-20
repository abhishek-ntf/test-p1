import { GameStorage } from '../utils/Storage.js';
import { rankedRows, boardHTML } from './Leaderboard.js';

/**
 * Start screen: PLAY (player name + best + start), RANKS (leaderboard),
 * SETTINGS (steering mode + tilt). Name is set once (NamePrompt), shown read-only.
 */
export class MainMenu {
  constructor(parent = document.body, { onStart, onSettingsChange, onCalibrate } = {}) {
    this.onStart = onStart; this.onSettingsChange = onSettingsChange; this.onCalibrate = onCalibrate;

    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.innerHTML = `
      <div class="panel glass menu-panel">
        <div class="menu-tabs">
          <button type="button" class="tab active" data-tab="play">PLAY</button>
          <button type="button" class="tab" data-tab="ranks">RANKS</button>
          <button type="button" class="tab" data-tab="settings">SETTINGS</button>
        </div>

        <div class="tab-body" data-body="play">
          <h1 class="title small">NEON<br>HIGHWAY</h1>
          <p class="sub">Dodge traffic · avoid the railing · 3 lives</p>
          <div class="profile-row"><small>PLAYER</small><b class="cur" data-k="name">Player</b></div>
          <div class="best-line">BEST <b data-k="best">0</b> · <span data-k="km">0.00</span> KM · RANK <b data-k="rank">–</b></div>
          <button type="button" class="btn" data-k="start">START</button>
          <p class="hint" data-k="hint"></p>
        </div>

        <div class="tab-body hidden" data-body="ranks">
          <h2 class="tab-title">LEADERBOARD</h2>
          <div class="board" data-k="board"></div>
          <p class="hint">Global rankings · overtake rivals as you score!</p>
        </div>

        <div class="tab-body hidden" data-body="settings">
          <h2 class="tab-title">SETTINGS</h2>
          <div class="set-group">
            <small>STEERING CONTROL</small>
            <div class="mode-pick" data-k="modes">
              <button type="button" data-mode="tilt">TILT</button>
              <button type="button" data-mode="wheel">WHEEL</button>
              <button type="button" data-mode="buttons">BUTTONS</button>
            </div>
          </div>
          <div class="set-group tilt-only">
            <small>TILT SENSITIVITY · <span data-k="sensVal">1.5</span></small>
            <input type="range" min="0.5" max="3" step="0.1" data-k="sens" />
          </div>
          <div class="set-group tilt-only">
            <label class="check"><input type="checkbox" data-k="invert" /> INVERT TILT</label>
            <button type="button" class="btn small" data-k="calib">CALIBRATE TILT</button>
          </div>
          <p class="hint" data-k="setHint"></p>
        </div>
      </div>`;

    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((n) => { this.el[n.dataset.k] = n; });

    this.root.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => this._switchTab(t.dataset.tab));
    });
    this.el.start.addEventListener('click', (e) => { e.currentTarget.blur(); if (this.onStart) this.onStart(); });
    this.el.modes.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.currentTarget.blur();
        this._applyMode(b.dataset.mode);
        if (this.onSettingsChange) this.onSettingsChange({ controlMode: b.dataset.mode });
      });
    });
    this.el.sens.addEventListener('input', () => {
      const v = Number(this.el.sens.value);
      this.el.sensVal.textContent = v.toFixed(1);
      if (this.onSettingsChange) this.onSettingsChange({ tiltSensitivity: v });
    });
    this.el.invert.addEventListener('change', () => {
      if (this.onSettingsChange) this.onSettingsChange({ tiltInvert: this.el.invert.checked });
    });
    this.el.calib.addEventListener('click', (e) => { e.currentTarget.blur(); if (this.onCalibrate) this.onCalibrate(); });

    parent.appendChild(this.root);
  }

  _switchTab(tab) {
    this.root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    this.root.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('hidden', b.dataset.body !== tab));
  }

  _applyMode(mode) {
    this.el.modes.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    this.root.classList.toggle('mode-tilt', mode === 'tilt');
  }

  show({ best, isTouch, name, leaderboard, settings }) {
    this.el.name.textContent = name || 'Player';
    this.el.best.textContent = best.score.toLocaleString();
    this.el.km.textContent = best.km.toFixed(2);
    this.setBoard(leaderboard);
    this._applyMode(settings.controlMode);
    this.el.sens.value = settings.tiltSensitivity;
    this.el.sensVal.textContent = Number(settings.tiltSensitivity).toFixed(1);
    this.el.invert.checked = !!settings.tiltInvert;
    this.el.setHint.textContent = isTouch
      ? 'Tilt needs permission on iOS — tap CALIBRATE TILT while holding the phone level.'
      : 'Touch controls appear on mobile. Add ?controls to the URL to test on desktop.';
    this.el.hint.textContent = isTouch
      ? 'Steer with the on-screen controls · GAS · BRAKE · NITRO · HORN · swipe to switch lane'
      : '←→ / A D steer (tap = lane, hold = free) · ↑↓ speed · SPACE nitro · H horn · ENTER start';
    this.root.classList.remove('hidden');
  }

  /** leaderboard: raw score rows (name,score,distance,deviceId). */
  setBoard(leaderboard) {
    const meId = GameStorage.getDeviceId();
    const rows = rankedRows(leaderboard || [], meId);
    this.el.board.innerHTML = boardHTML(rows);
    const me = rows.find((r) => r.isCurrent);
    if (this.el.rank) this.el.rank.textContent = me ? `#${me.rank}` : `#${rows.length + 1}`;
  }

  /** Live refresh of the board while the menu is open (realtime). */
  updateRanks(leaderboard) { this.setBoard(leaderboard); }

  hide() { this.root.classList.add('hidden'); }
}
