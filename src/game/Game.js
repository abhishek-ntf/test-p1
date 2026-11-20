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
import { GameStorage } from '../utils/Storage.js';
import { AudioManager } from '../audio/AudioManager.js';
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
  constructor(canvas, pauseEl = null) {
    this.pauseEl = pauseEl;
    this.sm = new SceneManager(canvas);
    this.road = new Road(this.sm.scene, this.sm.renderer);
    this.environment = new Environment(this.sm.scene, this.sm.renderer);
    this.player = new PlayerCar(this.sm.scene);
    this.traffic = new TrafficManager(this.sm.scene);
    this.effects = new Effects(this.sm.scene);
    this.audio = new AudioManager();

    this.kb = new KeyboardControls();
    this.touch = new MobileControls();
    this.kb.onPause = () => this.togglePause();
    this.kb.onAction = (code) => {
      if (this.state === MENU && code === 'Enter') this.startRace();
      else if (this.state === OVER && this.overShown) this.startRace();
    };

    this.best = GameStorage.getBest();
    this.hud = new GameHUD(document.body, { onPause: () => this.togglePause(), onTheme: () => this.toggleTheme() });
    this.menu = new MainMenu(document.body, { onStart: () => this.startRace() });
    this.gameOverUI = new GameOver(document.body, { onRestart: () => this.startRace() });

    // run state
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
    this.sm.setTheme('day');

    this._onVis = () => { if (document.hidden && this.state === PLAYING && !this.paused) this.togglePause(); };
    document.addEventListener('visibilitychange', this._onVis);
    this._unlockAudio = () => this.audio.ensure();
    window.addEventListener('pointerdown', this._unlockAudio);
    window.addEventListener('keydown', this._unlockAudio);

    this._enterMenu();
    this.loop = new GameLoop((dt) => this.update(dt), () => this.sm.render());
  }

  run() { this.loop.start(); }
  toggleTheme() { this.sm.setTheme(this.sm.themeName === 'day' ? 'night' : 'day'); }

  // ---------- state transitions ----------
  _enterMenu() {
    this.state = MENU;
    this.traffic.clear();
    this.player.reset();
    this.cruise = CRUISE_SPEED; this.speed = CRUISE_SPEED;
    this.hud.hide(); this.gameOverUI.hide();
    this.menu.show(this.best, this.touch.enabled);
  }

  startRace() {
    this.audio.ensure();
    this.kb.reset(); this.touch.reset();
    this.paused = false;
    if (this.pauseEl) this.pauseEl.classList.add('hidden');
    this.lives = LIVES_MAX; this.distance = 0; this.bonus = 0; this.score = 0; this.level = 1;
    this.cruise = CRUISE_SPEED; this.speed = CRUISE_SPEED;
    this.nitro = NITRO_MAX; this.nitroActive = false;
    this.kbHold = 0; this.freeSteer = false; this.shake = 0;
    this.overShown = false; this.newBest = false; this.goTimer = 0;
    this.player.reset();
    this.traffic.reset(this.level, this.cruise);
    this.menu.hide(); this.gameOverUI.hide();
    this.hud.setLives(LIVES_MAX, false);
    this.hud.setBest(this.best.score);
    this.hud.show();
    this.state = PLAYING;
  }

  togglePause() {
    if (this.state !== PLAYING) return;
    this.paused = !this.paused;
    this.kb.reset(); this.touch.reset();
    if (this.pauseEl) this.pauseEl.classList.toggle('hidden', !this.paused);
  }

  _gameOver() {
    this.state = OVER;
    this.goTimer = 0; this.overShown = false;
    this.traffic.stopSpawning();
    this.nitroActive = false;
    this.newBest = this.score > this.best.score;
    if (this.newBest) {
      this.best = { score: this.score, km: this.distance / 1000, level: this.level };
      GameStorage.saveBest(this.best);
    }
    this.hud.banner('GAME OVER', 'bad');
  }

  getState() {
    return {
      state: this.state, speed: this.speed, kmh: Math.round(this.speed * KMH_FACTOR),
      nitro: this.nitro, nitroActive: this.nitroActive, lane: this.player.laneIndex,
      lives: this.lives, level: this.level, km: this.distance / 1000, score: this.score, paused: this.paused,
    };
  }

  // ---------- per-frame ----------
  _readInput() {
    const a = this.kb.state, b = this.touch.state;
    return { accel: a.accel || b.accel, brake: a.brake || b.brake, nitro: a.nitro || b.nitro };
  }

  _applySteering(dt) {
    const p = this.player;
    for (const src of [this.kb, this.touch]) { // lane taps, swipes
      let d;
      while ((d = src.consumeLane()) !== 0) p.moveLane(d);
    }
    let free = false;
    const ks = this.kb.state.steer;
    if (ks !== 0) {
      this.kbHold += dt;
      if (this.kbHold > HOLD_FREE) { p.steerBy(ks * LAT_SPEED * dt); free = true; }
    } else this.kbHold = 0;
    if (this.touch.steering) { // steering wheel: proportional, slightly eased
      const s = this.touch.state.steer;
      p.steerBy(Math.sign(s) * Math.pow(Math.abs(s), 1.25) * LAT_SPEED * dt);
      free = true;
    }
    if (!free && this.freeSteer) p.snapToLane(); // lane assist on release
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

    // World
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

    if (playing) { this._updateProgress(dt); this._checkCollisions(); }
    else if (this.state === OVER) this._updateOver(dt);

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

  _levelUp(l) {
    this.level = l;
    this.bonus += LEVEL_BONUS;
    this.nitro = NITRO_MAX;
    this.cruise = Math.min(CRUISE_SPEED + (l - 1) * CRUISE_PER_LEVEL, MAX_CRUISE);
    this.traffic.setLevel(l, this.cruise);
    let text = `LEVEL ${l}`;
    if (l % 3 === 0 && this.lives < LIVES_MAX) { this.lives++; this.hud.setLives(this.lives, false); text += ' · +1 LIFE'; }
    this.hud.banner(text, 'good');
  }

  _checkCollisions() {
    const p = this.player;
    if (p.invincibleT > 0) return;
    const car = this.traffic.hit(p.x, PLAYER_HW, PLAYER_HL);
    if (car) {
      // Slower than the car we touched: not a foul. Horn, and that car eases aside.
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
    if (Math.abs(p.x) > RAIL_HIT_X) this._foul('rail', null);
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
    if (this.lives <= 0) this._gameOver();
  }

  _updateOver(dt) {
    this.goTimer += dt;
    if (!this.overShown && this.goTimer > 1.1) {
      this.overShown = true;
      this.gameOverUI.show({
        score: this.score, km: this.distance / 1000, level: this.level, best: this.best.score, newBest: this.newBest,
      });
    }
  }

  _updateHud() {
    const h = this.hud, km = this.distance / 1000;
    h.setScore(this.score);
    h.setBest(Math.max(this.best.score, this.score));
    h.setKm(km);
    h.setLevel(this.level, (km % LEVEL_KM) / LEVEL_KM);
    h.setSpeed(Math.round(this.speed * KMH_FACTOR));
    h.setNitro((this.nitro / NITRO_MAX) * 100, this.nitroActive);
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
    window.removeEventListener('pointerdown', this._unlockAudio);
    window.removeEventListener('keydown', this._unlockAudio);
    this.audio.dispose();
    this.loop.dispose();
    this.kb.dispose(); this.touch.dispose();
    this.effects.dispose(); this.traffic.dispose();
    this.player.dispose(); this.environment.dispose(); this.road.dispose(); this.sm.dispose();
  }
}
