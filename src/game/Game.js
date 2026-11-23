import { SceneManager } from './SceneManager.js';
import { Road } from './Road.js';
import { Environment } from './Environment.js';
import { PlayerCar } from './PlayerCar.js';
import { TrafficManager } from './TrafficManager.js';
import { Effects } from './Effects.js';
import { GameLoop } from './GameLoop.js';
import { KeyboardControls } from '../controls/KeyboardControls.js';
import { MobileControls } from '../controls/MobileControls.js';
import { GameHUD } from '../ui/GameHUD.js';
import { MainMenu } from '../ui/MainMenu.js';
import { GameOver } from '../ui/GameOver.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { Orientation } from '../ui/Orientation.js';
import { Celebration } from '../ui/Celebration.js';
import { SteeringPicker } from '../ui/SteeringPicker.js';
import { OnboardingOverlay } from '../ui/OnboardingOverlay.js';
import { GameStorage } from '../utils/Storage.js';
import { Ranking, buildLiveRows, rankFor } from '../utils/Ranking.js';
import { AudioManager } from '../audio/AudioManager.js';
import { CrazyGamesSDK } from '../utils/CrazyGamesSDK.js';
import {
  CRUISE_SPEED, MIN_SPEED, NITRO_SPEED, ACCEL, BRAKE_DECEL, COAST_DECEL, NITRO_ACCEL,
  NITRO_MAX, NITRO_DRAIN, NITRO_RECHARGE, NITRO_MIN_START, KMH_FACTOR,
  LIVES_MAX, INVINCIBLE_TIME, LEVEL_KM, LEVEL_BONUS, CRUISE_PER_LEVEL, MAX_CRUISE, CRASH_SPEED,
  PLAYER_HW, PLAYER_HL, RAIL_HIT_X, LAT_SPEED, HOLD_FREE,
} from '../utils/Constants.js';

const MENU = 'menu', PLAYING = 'playing', OVER = 'over';
const NO_INPUT = { accel: false, brake: false, nitro: false };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.cg = CrazyGamesSDK.getInstance();
    this.cg.init();

    this.sm = new SceneManager(canvas);
    this.road = new Road(this.sm.scene, this.sm.renderer);
    this.environment = new Environment(this.sm.scene, this.sm.renderer);
    this.player = new PlayerCar(this.sm.scene);
    this.traffic = new TrafficManager(this.sm.scene);
    this.effects = new Effects(this.sm.scene);
    this.audio = new AudioManager();

    this.kb = new KeyboardControls();
    this.touch = new MobileControls(document.body, {
      onReset: () => this.startRace(),
      onSteerSwitch: () => this._showSteerPicker(),
    });
    this.orient = new Orientation(document.body);

    // Identity & settings
    this.deviceId = GameStorage.getDeviceId();
    this.name = GameStorage.getUserName();
    this.settings = GameStorage.getSettings();

    // Check if user is logged into CrazyGames
    this.cg.getUser().then((u) => {
      if (u && u.username) {
        this.name = GameStorage.setUserName(u.username);
      }
    });

    // UI overlays
    this.onboarding = new OnboardingOverlay(document.body, {
      onComplete: (skipped) => this._onOnboardingComplete(skipped),
      isTouch: this.touch.enabled,
    });

    this.pauseMenu = new PauseMenu(document.body, {
      onResume: () => this.togglePause(),
      onRestart: () => this.startRace(),
      onMenu: () => this._enterMenu(),
      onToggleMute: () => this.toggleMute(),
      onToggleFullscreen: () => this.toggleFullscreen(),
      onHowToPlay: () => {
        this.pauseMenu.hide();
        this.onboarding.start();
      },
    });

    this.hud = new GameHUD(document.body, {
      onPause: () => this.togglePause(),
      onTheme: () => this.toggleTheme(),
      onToggleMute: () => this.toggleMute(),
      onToggleFullscreen: () => this.toggleFullscreen(),
      onHelp: () => {
        if (this.state === PLAYING) {
          this.onboarding.start();
        }
      },
    });
    this.hud.setMuted(this.audio.isMuted);

    this.menu = new MainMenu(document.body, {
      onStart: () => this.startRace(),
      onSettingsChange: (p) => this._onSettingsChange(p),
      onCalibrate: () => this.touch.calibrate(),
      onReplayTutorial: () => {
        this.menu.hide();
        this.startRace(true);
      },
      onToggleMute: () => this.toggleMute(),
      onToggleFullscreen: () => this.toggleFullscreen(),
    });

    this.gameOverUI = new GameOver(document.body, {
      onRestart: () => this.startRace(),
      onMenu: () => this._enterMenu(),
    });

    this.steerPicker = new SteeringPicker(document.body, {
      onSelect: (mode) => this._onSteerModeSelect(mode),
    });

    // Wire keyboard actions
    this.kb.onPause = () => this.togglePause();
    this.kb.onMute = () => this.toggleMute();
    this.kb.onFullscreen = () => this.toggleFullscreen();
    this.kb.onKeyActivity = (action, isDown) => {
      this.onboarding.handleAction(action, isDown);
    };
    this.kb.onAction = (code) => {
      if (this.state === MENU && code === 'Enter') this.startRace();
      else if (this.state === OVER && this.overShown) this.startRace();
      else if (this.paused && (code === 'Enter' || code === 'KeyR')) this.startRace();
    };

    // Fullscreen change listener
    this._onFsChange = () => {
      const isFs = !!document.fullscreenElement;
      this.hud.setFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', this._onFsChange);

    // Ranking state
    this._globalScores = [];
    this._overtaken = new Set();
    this._pbNotified = false;
    this._overReady = false;
    this._overPayload = null;

    // Run state
    this.state = MENU;
    this.paused = false;
    this.lives = LIVES_MAX; this.distance = 0; this.bonus = 0; this.score = 0; this.level = 1;
    this.cruise = CRUISE_SPEED; this.speed = CRUISE_SPEED;
    this.nitro = NITRO_MAX; this.nitroActive = false;
    this.kbHold = 0; this.freeSteer = false;
    this.shake = 0; this.camX = 0; this.fovBoost = 0;
    this.goTimer = 0; this.overShown = false; this.newBest = false;

    this.sm.onThemeChange((theme) => {
      this.road.setTheme(theme);
      this.environment.setTheme(theme);
      this.player.setNight(theme.headlights);
    });
    this.sm.setTheme('night'); // Cyberpunk neon highway default

    this._onVis = () => {
      if (document.hidden) {
        if (this.state === PLAYING && !this.paused) this.togglePause();
        if (this.audio.ctx && this.audio.ctx.state === 'running') this.audio.ctx.suspend();
      } else {
        if (this.audio.ctx && this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
      }
    };
    document.addEventListener('visibilitychange', this._onVis);

    this._unlockAudio = () => this.audio.ensure();
    window.addEventListener('pointerdown', this._unlockAudio);
    window.addEventListener('keydown', this._unlockAudio);

    // Leaderboard
    this._unsubRank = Ranking.subscribe((rows) => {
      this._globalScores = rows;
      this._onRankUpdate();
    });
    Ranking.getLeaderboard(100).then((rows) => { this._globalScores = rows; this._onRankUpdate(); });

    // CrazyGames Onboarding entry:
    // If user has not completed onboarding, land directly in gameplay with tutorial active!
    if (!GameStorage.hasCompletedOnboarding()) {
      this.startRace(true);
    } else {
      this._enterMenu();
    }

    this.loop = new GameLoop((dt) => this.update(dt), () => this.sm.render());
  }

  run() {
    this.loop.start();
  }

  toggleTheme() {
    this.sm.setTheme(this.sm.themeName === 'day' ? 'night' : 'day');
  }

  toggleMute() {
    const isMuted = this.audio.toggleMute();
    this.hud.setMuted(isMuted);
    this.pauseMenu.setMuted(isMuted);
    this.menu.setMuted(isMuted);
    return isMuted;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  _onOnboardingComplete(skipped) {
    if (skipped) {
      this.hud.banner('TUTORIAL SKIPPED', 'good');
    } else {
      this.hud.banner('TUTORIAL COMPLETE! GO!', 'good');
      this.cg.happytime();
    }
  }

  _onSettingsChange(partial) {
    this.settings = GameStorage.saveSettings(partial);
    if (partial.controlMode) this.touch.setMode(this.settings.controlMode);
    if (partial.tiltSensitivity != null) this.touch.setSensitivity(this.settings.tiltSensitivity);
    if (partial.tiltInvert != null) this.touch.setInvert(this.settings.tiltInvert);
  }

  _showSteerPicker() {
    this.steerPicker.show(this.settings.controlMode || 'arrows');
  }

  _onSteerModeSelect(mode) {
    this.touch.setMode(mode);
    this.settings = GameStorage.saveSettings({ controlMode: mode });
    if (mode === 'motion') this.touch.calibrate();
  }

  _onRankUpdate() {
    if (this.state === MENU && this.menu) this.menu.updateRanks(this._globalScores);
  }

  // ---------- State transitions ----------
  _enterMenu() {
    this.state = MENU;
    this.cg.gameplayStop();
    this.traffic.clear();
    this.player.reset();
    this.cruise = CRUISE_SPEED;
    this.speed = CRUISE_SPEED;
    this.hud.hide();
    this.gameOverUI.hide();
    this.pauseMenu.hide();
    this.onboarding.hide();

    this.name = GameStorage.getUserName();
    this.settings = GameStorage.getSettings();
    const best = GameStorage.getBest();
    const board = this._globalScores && this._globalScores.length ? this._globalScores : null;

    this.menu.show({
      best,
      isTouch: this.touch.enabled,
      name: this.name,
      leaderboard: board,
      settings: this.settings,
      isMuted: this.audio.isMuted,
    });

    Ranking.getLeaderboard(100).then((rows) => {
      this._globalScores = rows;
      if (this.state === MENU) this.menu.updateRanks(rows);
    });
  }

  startRace(startTutorial = false) {
    this.audio.ensure();
    this.cg.gameplayStart();
    this.kb.reset();
    this.touch.reset();
    this.paused = false;

    this.lives = LIVES_MAX;
    this.distance = 0;
    this.bonus = 0;
    this.score = 0;
    this.level = 1;
    this.cruise = CRUISE_SPEED;
    this.speed = CRUISE_SPEED;
    this.nitro = NITRO_MAX;
    this.nitroActive = false;
    this.kbHold = 0;
    this.freeSteer = false;
    this.shake = 0;
    this.overShown = false;
    this.newBest = false;
    this.goTimer = 0;
    this._overReady = false;
    this._overPayload = null;

    this.name = GameStorage.getUserName();
    this._overtaken = new Set();
    this._pbNotified = false;

    if (!this._globalScores || !this._globalScores.length) {
      Ranking.getLeaderboard(100).then((rows) => { this._globalScores = rows; });
    }

    this.player.reset();
    this.traffic.reset(this.level, this.cruise);

    this.menu.hide();
    this.gameOverUI.hide();
    this.pauseMenu.hide();

    this.hud.setLives(LIVES_MAX, false);
    this.hud.setBest(GameStorage.getBest().score);
    this.hud.setGoal('🎯 GOAL: REACH LEVEL 2 (1,000m)');
    this.hud.renderLiveRank(buildLiveRows(this._globalScores, this.deviceId, this.name, 0));
    this.hud.show();

    this.state = PLAYING;
    this.orient.requestLandscape();

    if (startTutorial) {
      this.onboarding.start();
    } else {
      this.onboarding.hide();
    }
  }

  togglePause() {
    if (this.state !== PLAYING) return;
    this.paused = !this.paused;
    this.kb.reset();
    this.touch.reset();

    if (this.paused) {
      this.pauseMenu.show(this.audio.isMuted);
      this.cg.gameplayStop();
    } else {
      this.pauseMenu.hide();
      this.cg.gameplayStart();
    }
  }

  _gameOver() {
    this.state = OVER;
    this.cg.gameplayStop();
    this.goTimer = 0;
    this.overShown = false;
    this._overReady = false;
    this.traffic.stopSpawning();
    this.nitroActive = false;
    this.onboarding.hide();
    this._endRun();
    this.hud.banner('GAME OVER', 'bad');
  }

  async _endRun() {
    const prevBest = GameStorage.getBest();
    const prevRank = rankFor(this._globalScores, prevBest.score);

    await Ranking.submitScore({
      deviceId: this.deviceId,
      name: this.name,
      score: this.score,
      distance: this.distance,
      level: this.level,
    });

    GameStorage.saveBest({ score: this.score, distance: this.distance, level: this.level });
    this._globalScores = await Ranking.getLeaderboard(100);

    const newBest = this.score > prevBest.score;
    const newRank = rankFor(this._globalScores, Math.max(prevBest.score, this.score));

    this._overPayload = {
      score: this.score,
      distance: this.distance,
      level: this.level,
      best: Math.max(prevBest.score, this.score),
      newBest,
      prevRank,
      newRank,
      leaderboard: this._globalScores,
      meId: this.deviceId,
    };
    this._overReady = true;
  }

  // ---------- Per-frame loop ----------
  _readInput() {
    const a = this.kb.state, b = this.touch.state;
    return { accel: a.accel || b.accel, brake: a.brake || b.brake, nitro: a.nitro || b.nitro };
  }

  _applySteering(dt) {
    const p = this.player;
    for (const src of [this.kb, this.touch]) {
      let d;
      while ((d = src.consumeLane()) !== 0) p.moveLane(d);
    }
    let free = false;
    const ks = this.kb.state.steer;
    if (ks !== 0) {
      this.kbHold += dt;
      if (this.kbHold > HOLD_FREE) { p.steerBy(ks * LAT_SPEED * dt); free = true; }
    } else this.kbHold = 0;

    if (this.touch.steering) {
      const s = this.touch.state.steer;
      p.steerBy(Math.sign(s) * Math.pow(Math.abs(s), 1.25) * LAT_SPEED * dt);
      free = true;
    }
    if (!free && this.freeSteer) p.snapToLane();
    this.freeSteer = free;
  }

  update(dt) {
    if (this.paused) {
      this.audio.update({ active: false, speed: 0, nitro: false });
      return;
    }

    const playing = this.state === PLAYING;
    const inp = playing ? this._readInput() : NO_INPUT;

    if (playing) {
      this._applySteering(dt);
      const horn = this.kb.consumeHorn();
      const hornTouch = this.touch.consumeHorn();
      if (horn || hornTouch) {
        this.audio.horn();
        this.traffic.yieldAhead(this.player.x);
      }
    }

    // Nitro
    this.nitroActive = inp.nitro && !inp.brake && (this.nitroActive ? this.nitro > 0 : this.nitro >= NITRO_MIN_START);
    this.nitro = this.nitroActive
      ? Math.max(0, this.nitro - NITRO_DRAIN * dt)
      : Math.min(NITRO_MAX, this.nitro + NITRO_RECHARGE * dt);

    // Speed model
    const maxSpeed = this.cruise + 22;
    let target, rate;
    if (this.state === OVER) { target = 0; rate = 30; }
    else if (this.nitroActive) { target = NITRO_SPEED; rate = NITRO_ACCEL; }
    else if (inp.brake) { target = MIN_SPEED; rate = BRAKE_DECEL; }
    else if (inp.accel) { target = maxSpeed; rate = this.speed > maxSpeed ? COAST_DECEL : ACCEL; }
    else { target = this.cruise; rate = this.speed > this.cruise ? COAST_DECEL : ACCEL; }
    this.speed = approach(this.speed, target, rate * dt);

    // World updates
    this.player.setControlState(this.nitroActive, inp.brake);
    this.road.update(dt, this.speed);
    this.environment.update(dt, this.speed);
    this.player.update(dt, this.speed);
    this.traffic.update(dt, this.speed, this.player.x);
    this.effects.update(dt);

    this.audio.update({
      active: this.state !== MENU && !this.paused,
      speed: this.speed,
      nitro: this.nitroActive && playing,
    });

    if (playing) {
      this._updateProgress(dt);
      this._checkCollisions();
      this._updateRanking();
    } else if (this.state === OVER) {
      this._updateOver(dt);
    }

    this._updateCamera(dt);
    if (this.state !== MENU) this._updateHud();
  }

  _updateProgress(dt) {
    this.distance += this.speed * dt;
    const km = this.distance / 1000;
    this.score = Math.floor(this.distance) + this.bonus;
    const lvl = 1 + Math.floor(km / LEVEL_KM);
    if (lvl > this.level) this._levelUp(lvl);
  }

  _updateRanking() {
    const score = this.score;
    this.hud.renderLiveRank(buildLiveRows(this._globalScores, this.deviceId, this.name, score));

    for (const o of this._globalScores) {
      if (o.deviceId === this.deviceId) continue;
      if (o.score > 0 && o.score <= score && !this._overtaken.has(o.deviceId)) {
        this._overtaken.add(o.deviceId);
        this.hud.toast(`You just overtook ${o.name}!`);
        Celebration.burst();
        this.cg.happytime();
      }
    }

    const me = this._globalScores.find((s) => s.deviceId === this.deviceId);
    const pb = me ? me.score : GameStorage.getBest().score;
    if (!this._pbNotified && pb > 0 && score > pb) {
      this._pbNotified = true;
      this.hud.toast('NEW PERSONAL BEST!');
      Celebration.burst();
      this.cg.happytime();
    }
  }

  _levelUp(l) {
    this.level = l;
    this.bonus += LEVEL_BONUS;
    this.nitro = NITRO_MAX;
    this.cruise = Math.min(CRUISE_SPEED + (l - 1) * CRUISE_PER_LEVEL, MAX_CRUISE);
    this.traffic.setLevel(l, this.cruise);
    let text = `LEVEL ${l}`;
    if (l % 3 === 0 && this.lives < LIVES_MAX) {
      this.lives++;
      this.hud.setLives(this.lives, false);
      text += ' · +1 LIFE';
    }
    this.hud.banner(text, 'good');
    this.cg.happytime();
  }

  _checkCollisions() {
    const p = this.player;
    if (p.invincibleT > 0) return;

    const car = this.traffic.hit(p.x, PLAYER_HW, PLAYER_HL);
    if (car) {
      if (this.speed < car.v || car.nudgeT > 0) {
        if (this.traffic.nudgeAside(car)) {
          this.audio.horn();
          car.nudgeT = 1.4;
        }
        return;
      }
      this._foul('car', car);
      return;
    }

    if (Math.abs(p.x) > RAIL_HIT_X) {
      this._foul('rail', null);
    }
  }

  _foul(kind, car) {
    const p = this.player;
    this.lives--;
    this.hud.setLives(Math.max(0, this.lives));
    this.hud.flash();
    this.shake = 0.8;
    p.setInvincible(INVINCIBLE_TIME);

    this.audio.impact(kind === 'car');
    if (kind === 'car') {
      const dir = Math.sign(car.x - p.x) || (Math.random() < 0.5 ? -1 : 1);
      this.traffic.knock(car, dir);
      this.effects.burst((car.x + p.x) / 2, 0.8, car.z, 26, dir, 10);
      p.vx += -dir * 3;
      this.speed = Math.min(this.speed, CRASH_SPEED);
      this.hud.banner('CRASH!', 'bad');
    } else {
      const dir = Math.sign(p.x);
      this.effects.burst(dir * 5.7, 0.5, p.group.position.z, 22, -dir, 8);
      p.bounce(dir);
      this.speed *= 0.75;
      this.hud.banner('RAILING FOUL!', 'bad');
    }

    if (this.lives <= 0) {
      this._gameOver();
    }
  }

  _updateOver(dt) {
    this.goTimer += dt;
    if (!this.overShown && this.goTimer > 1.1 && this._overReady) {
      this.overShown = true;
      this.gameOverUI.show(this._overPayload);
    }
  }

  _updateHud() {
    const h = this.hud, km = this.distance / 1000;
    h.setScore(this.score);
    h.setBest(Math.max(GameStorage.getBest().score, this.score));
    h.setDistance(this.distance);
    h.setLevel(this.level, (km % LEVEL_KM) / LEVEL_KM);
    h.setSpeed(Math.round(this.speed * KMH_FACTOR));
    h.setNitro((this.nitro / NITRO_MAX) * 100, this.nitroActive);

    // Goal tracking
    const nextTargetM = this.level * 1000;
    const remainingM = Math.max(0, nextTargetM - Math.floor(this.distance));
    h.setGoal(`🎯 NEXT LEVEL: ${remainingM}m`);
  }

  _updateCamera(dt) {
    const cam = this.sm.camera;
    const lvl = this.player.flameLevel;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * 0.28;

    this.camX += (this.player.x * 0.4 - this.camX) * Math.min(1, dt * 14);
    cam.position.x = this.camX + (Math.random() - 0.5) * (0.05 * lvl + sh);
    cam.position.y = 4.2 + (Math.random() - 0.5) * (0.05 * lvl + sh);
    cam.position.z = 9.5 + lvl * 0.9;
    cam.lookAt(this.camX * 0.6, 1.2, -14);

    const targetBoost = clamp((this.speed - this.cruise) / (NITRO_SPEED - this.cruise), 0, 1) * 10;
    this.fovBoost += (targetBoost - this.fovBoost) * Math.min(1, dt * 5);
    this.sm.setFovBoost(this.fovBoost);
  }

  dispose() {
    document.removeEventListener('visibilitychange', this._onVis);
    document.removeEventListener('fullscreenchange', this._onFsChange);
    window.removeEventListener('pointerdown', this._unlockAudio);
    window.removeEventListener('keydown', this._unlockAudio);
    if (this._unsubRank) this._unsubRank();

    this.audio.dispose();
    this.loop.dispose();
    this.kb.dispose();
    this.touch.dispose();
    this.orient.dispose();
    this.steerPicker.dispose();
    this.pauseMenu.dispose();
    this.onboarding.dispose();
    this.effects.dispose();
    this.traffic.dispose();
    this.player.dispose();
    this.environment.dispose();
    this.road.dispose();
    this.sm.dispose();
  }
}
