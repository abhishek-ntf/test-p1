import { GameStorage } from '../utils/Storage.js';
import { rankedRows, boardHTML } from './Leaderboard.js';

/**
 * Start screen:
 * - PLAY tab: quick start, stats, editable player name, clear goals
 * - CONTROLS tab: visual keyboard diagram (WASD / ZQSD / Arrows) + Replay Tutorial
 * - RANKS tab: global live leaderboard
 * - SETTINGS tab: audio toggle, fullscreen, steering mode
 */
export class MainMenu {
  constructor(parent = document.body, { onStart, onSettingsChange, onCalibrate, onReplayTutorial, onToggleMute, onToggleFullscreen } = {}) {
    this.onStart = onStart;
    this.onSettingsChange = onSettingsChange;
    this.onCalibrate = onCalibrate;
    this.onReplayTutorial = onReplayTutorial;
    this.onToggleMute = onToggleMute;
    this.onToggleFullscreen = onToggleFullscreen;

    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.innerHTML = `
      <div class="panel glass menu-panel">
        <div class="menu-tabs">
          <button type="button" class="tab active" data-tab="play">PLAY</button>
          <button type="button" class="tab" data-tab="controls">CONTROLS</button>
          <button type="button" class="tab" data-tab="ranks">RANKS</button>
          <button type="button" class="tab" data-tab="settings">SETTINGS</button>
        </div>

        <!-- PLAY TAB -->
        <div class="tab-body" data-body="play">
          <h1 class="title small">NEON<br>HIGHWAY</h1>
          <p class="sub">Solo Cyberpunk Arcade Racer · Endless 3D Highway</p>

          <div class="profile-row">
            <small>PLAYER NAME (CLICK TO EDIT)</small>
            <div class="name-edit-wrap">
              <input type="text" class="name-input" data-k="nameInput" maxlength="14" placeholder="Enter name" />
              <button type="button" class="btn-xs" data-k="saveName">SAVE</button>
            </div>
          </div>

          <div class="best-line">
            BEST <b data-k="best">0</b> · <span data-k="km">0.00</span> KM · RANK <b data-k="rank">–</b>
          </div>

          <div class="main-goal-banner">
            <span>🎯 OBJECTIVE:</span> Reach 1,000m to unlock Level 2 &amp; extra life!
          </div>

          <button type="button" class="btn" data-k="start">START RACE</button>
          <p class="hint" data-k="hint"></p>
        </div>

        <!-- CONTROLS & HOW TO PLAY TAB -->
        <div class="tab-body hidden" data-body="controls">
          <h2 class="tab-title">HOW TO CONTROL</h2>
          <div class="controls-guide">
            <div class="ctrl-grid">
              <div class="ctrl-card">
                <b>STEER LEFT / RIGHT</b>
                <p>Tap <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> to change lanes.<br>Hold for free steering.<br><small>(AZERTY: <kbd>Q</kbd> <kbd>D</kbd>)</small></p>
              </div>
              <div class="ctrl-card">
                <b>ACCELERATE &amp; BRAKE</b>
                <p>Hold <kbd>W</kbd> / <kbd>↑</kbd> for gas.<br>Hold <kbd>S</kbd> / <kbd>↓</kbd> to brake.<br><small>(AZERTY: <kbd>Z</kbd> for gas)</small></p>
              </div>
              <div class="ctrl-card">
                <b>NITRO BOOST ⚡</b>
                <p>Press <kbd>SPACEBAR</kbd> when nitro gauge is charged to blast through traffic!</p>
              </div>
              <div class="ctrl-card">
                <b>HORN &amp; PAUSE</b>
                <p>Press <kbd>H</kbd> to make cars move aside.<br>Press <kbd>P</kbd> to pause anytime.</p>
              </div>
            </div>

            <button type="button" class="btn ghost small mt-10" data-k="replayTut">REPLAY IN-GAME TUTORIAL</button>
          </div>
        </div>

        <!-- RANKS TAB -->
        <div class="tab-body hidden" data-body="ranks">
          <h2 class="tab-title">GLOBAL LEADERBOARD</h2>
          <div class="board" data-k="board"></div>
          <p class="hint">Global rankings · overtake rivals in real-time as you score!</p>
        </div>

        <!-- SETTINGS TAB -->
        <div class="tab-body hidden" data-body="settings">
          <h2 class="tab-title">SETTINGS</h2>

          <div class="set-group">
            <small>AUDIO &amp; DISPLAY</small>
            <div class="pause-row-btns">
              <button type="button" class="btn small" data-k="audioBtn">🔊 SOUND: ON</button>
              <button type="button" class="btn small" data-k="fsBtn">⛶ FULLSCREEN</button>
            </div>
          </div>

          <div class="set-group">
            <small>MOBILE STEERING CONTROL</small>
            <div class="mode-pick" data-k="modes">
              <button type="button" data-mode="arrows">ARROWS</button>
              <button type="button" data-mode="wheel">WHEEL</button>
              <button type="button" data-mode="motion">TILT / MOTION</button>
            </div>
          </div>

          <div class="set-group tilt-only">
            <small>TILT SENSITIVITY · <span data-k="sensVal">1.5</span></small>
            <input type="range" min="0.5" max="3" step="0.1" data-k="sens" />
          </div>

          <div class="set-group tilt-only">
            <label class="check"><input type="checkbox" data-k="invert" /> INVERT TILT</label>
            <button type="button" class="btn small" data-k="calib">CALIBRATE TILT SENSOR</button>
          </div>

          <p class="hint" data-k="setHint"></p>
        </div>
      </div>
    `;

    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((n) => { this.el[n.dataset.k] = n; });

    // Tabs
    this.root.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => this._switchTab(t.dataset.tab));
    });

    // Start
    this.el.start.addEventListener('click', (e) => {
      e.currentTarget.blur();
      this._saveName();
      if (this.onStart) this.onStart();
    });

    // Name change
    this.el.saveName.addEventListener('click', () => this._saveName());
    this.el.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._saveName();
      }
    });

    // Replay tutorial
    this.el.replayTut.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (this.onReplayTutorial) this.onReplayTutorial();
    });

    // Quick Audio / FS buttons
    this.el.audioBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (this.onToggleMute) {
        const isMuted = this.onToggleMute();
        this.setMuted(isMuted);
      }
    });

    this.el.fsBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (this.onToggleFullscreen) this.onToggleFullscreen();
    });

    // Mode pick
    this.el.modes.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.currentTarget.blur();
        this._applyMode(b.dataset.mode);
        if (this.onSettingsChange) this.onSettingsChange({ controlMode: b.dataset.mode });
      });
    });

    // Sens
    this.el.sens.addEventListener('input', () => {
      const v = Number(this.el.sens.value);
      this.el.sensVal.textContent = v.toFixed(1);
      if (this.onSettingsChange) this.onSettingsChange({ tiltSensitivity: v });
    });

    // Invert
    this.el.invert.addEventListener('change', () => {
      if (this.onSettingsChange) this.onSettingsChange({ tiltInvert: this.el.invert.checked });
    });

    // Calib
    this.el.calib.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (this.onCalibrate) this.onCalibrate();
    });

    parent.appendChild(this.root);
  }

  _saveName() {
    const val = (this.el.nameInput.value || '').trim();
    if (val) {
      GameStorage.setUserName(val);
    }
  }

  _switchTab(tab) {
    this.root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    this.root.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('hidden', b.dataset.body !== tab));
  }

  _applyMode(mode) {
    this.el.modes.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    this.root.classList.toggle('mode-tilt', mode === 'motion');
  }

  setMuted(muted) {
    this.el.audioBtn.textContent = muted ? '🔇 SOUND: OFF' : '🔊 SOUND: ON';
  }

  show({ best, isTouch, name, leaderboard, settings, isMuted = false }) {
    this.el.nameInput.value = name || GameStorage.getUserName();
    this.el.best.textContent = best.score.toLocaleString();
    this.el.km.textContent = best.km.toFixed(2);
    this.setBoard(leaderboard);
    this.setMuted(isMuted);

    const mode = settings.controlMode || 'arrows';
    this._applyMode(mode);
    this.el.sens.value = settings.tiltSensitivity ?? 1.5;
    this.el.sensVal.textContent = Number(settings.tiltSensitivity ?? 1.5).toFixed(1);
    this.el.invert.checked = !!settings.tiltInvert;

    this.el.setHint.textContent = isTouch
      ? 'Tilt needs permission on iOS — tap CALIBRATE TILT SENSOR while holding phone level.'
      : 'Full desktop keyboard support: QWERTY (WASD) and AZERTY (ZQSD). Touch controls auto-enable on mobile.';

    this.el.hint.textContent = isTouch
      ? 'Steer with on-screen arrows / wheel · GAS · BRAKE · NITRO · HORN'
      : '←→ / A D steer (tap = lane, hold = free) · ↑↓ / W S speed · SPACE nitro · P pause';

    this.root.classList.remove('hidden');
  }

  setBoard(leaderboard) {
    const meId = GameStorage.getDeviceId();
    const rows = rankedRows(leaderboard || [], meId);
    this.el.board.innerHTML = boardHTML(rows);
    const me = rows.find((r) => r.isCurrent);
    if (this.el.rank) this.el.rank.textContent = me ? `#${me.rank}` : `#${rows.length + 1}`;
  }

  updateRanks(leaderboard) {
    this.setBoard(leaderboard);
  }

  hide() {
    this._saveName();
    this.root.classList.add('hidden');
  }

  dispose() {
    this.root.remove();
  }
}
