const KEY = 'neon-highway:best';
const EMPTY = { score: 0, km: 0, level: 1 };

/** Thin LocalStorage wrapper – never throws (private mode / blocked storage). */
export const GameStorage = {
  getBest() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return v && typeof v.score === 'number' ? v : { ...EMPTY };
    } catch (e) { return { ...EMPTY }; }
  },
  saveBest(rec) {
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* ignore */ }
  },
};
