/**
 * Local-only storage for device identity, the one-time username, the local
 * best (offline fallback) and settings. No auth, no backend — just this device.
 */
const DEVICE_KEY = 'neon-highway:device-id';
const NAME_KEY = 'neon-highway:username';
const REG_KEY = 'neon-highway:registered';
const BEST_KEY = 'neon-highway:best';
const SETTINGS_KEY = 'neon-highway:settings';

const DEFAULT_SETTINGS = { controlMode: 'wheel', tiltSensitivity: 1.5, tiltInvert: false };

function uuid() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const GameStorage = {
  _g(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
  _s(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  _gs(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : v; } catch { return fb; } },
  _ss(k, v) { try { localStorage.setItem(k, v); } catch {} },

  /** Stable unique id for this device (generated once, kept forever). */
  getDeviceId() {
    let id = this._gs(DEVICE_KEY);
    if (!id) { id = uuid(); this._ss(DEVICE_KEY, id); }
    return id;
  },
  getUserName() { return this._gs(NAME_KEY, ''); },
  setUserName(name) { this._ss(NAME_KEY, name); this._ss(REG_KEY, '1'); },
  isRegistered() { return this._gs(REG_KEY) === '1'; },

  /** Local best (used as offline fallback + before first Supabase sync). */
  getBest() {
    const b = this._g(BEST_KEY, null);
    if (b && typeof b.score === 'number') {
      return { score: b.score, distance: b.distance || 0, km: (b.distance || 0) / 1000, level: b.level || 1 };
    }
    return { score: 0, distance: 0, km: 0, level: 1 };
  },
  saveBest(rec) {
    const c = this.getBest();
    const score = Math.max(c.score, Math.floor(rec.score || 0));
    const distance = Math.max(c.distance, Math.round(rec.distance || 0));
    const level = Math.max(c.level, Math.round(rec.level || 1));
    this._s(BEST_KEY, { score, distance, level });
    return { score, distance, level };
  },

  getSettings() { return { ...DEFAULT_SETTINGS, ...this._g(SETTINGS_KEY, {}) }; },
  saveSettings(p) { const s = { ...this.getSettings(), ...p }; this._s(SETTINGS_KEY, s); return s; },
};
