import { getSupabase, supabaseEnabled } from './supabase.js';
import { GameStorage } from './Storage.js';

const TABLE = 'scores';

/** Local rivals so the game is playable before Supabase is configured. */
const LOCAL_RIVALS = [
  { name: 'Kai', score: 9800, distance: 9100, deviceId: 'rival-kai' },
  { name: 'Rico', score: 8700, distance: 8000, deviceId: 'rival-rico' },
  { name: 'Max', score: 7600, distance: 7100, deviceId: 'rival-max' },
  { name: 'Leo', score: 6100, distance: 5700, deviceId: 'rival-leo' },
  { name: 'Rahul', score: 4200, distance: 3900, deviceId: 'rival-rahul' },
  { name: 'Nova', score: 3400, distance: 3100, deviceId: 'rival-nova' },
  { name: 'Aria', score: 2300, distance: 2000, deviceId: 'rival-aria' },
  { name: 'Zoe', score: 1500, distance: 1300, deviceId: 'rival-zoe' },
];

function localRows() {
  const best = GameStorage.getBest();
  const me = { name: GameStorage.getUserName() || 'You', score: best.score, distance: best.distance, deviceId: GameStorage.getDeviceId() };
  return [...LOCAL_RIVALS, me].sort((a, b) => b.score - a.score);
}

export const Ranking = {
  enabled: supabaseEnabled(),

  /** Top scores (name, score, distance, deviceId), best first. */
  async getLeaderboard(limit = 100) {
    const sb = await getSupabase();
    if (sb) {
      const { data, error } = await sb.from(TABLE)
        .select('name,score,distance,device_id')
        .order('score', { ascending: false })
        .order('distance', { ascending: false })
        .limit(limit);
      if (!error && data) {
        return data.map((r) => ({ name: r.name, score: r.score, distance: r.distance, deviceId: r.device_id }));
      }
      console.warn('Leaderboard fetch failed, using local', error);
    }
    return localRows().slice(0, limit);
  },

  /** Submit this run's result; keeps the best score per device (server-side upsert). */
  async submitScore({ deviceId, name, score, distance, level }) {
    score = Math.max(0, Math.floor(score || 0));
    distance = Math.max(0, Math.floor(distance || 0));
    level = Math.max(1, Math.floor(level || 1));
    const sb = await getSupabase();
    if (sb) {
      try {
        const { error } = await sb.rpc('upsert_score', { d: deviceId, n: name, s: score, dist: distance, lvl: level });
        if (!error) return;
        throw error;
      } catch (e) {
        // Fallback: plain upsert (keeps a single row per device, may overwrite).
        try { await sb.from(TABLE).upsert({ device_id: deviceId, name, score, distance, level }, { onConflict: 'device_id' }); } catch {}
      }
    }
    GameStorage.saveBest({ score, distance, level });
  },

  /** Live updates when anyone scores. Returns an unsubscribe fn. */
  subscribe(cb) {
    let active = true;
    let channel = null;
    (async () => {
      const sb = await getSupabase();
      if (!sb || !active) return;
      channel = sb.channel('public:scores')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, async () => {
          if (!active) return;
          const rows = await this.getLeaderboard(100);
          if (active) cb(rows);
        })
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) { try { (async () => { const sb = await getSupabase(); if (sb) sb.removeChannel(channel); })(); } catch {} }
    };
  },
};

/** Position (1 = top) a score would have among these rows (dense). */
export function rankFor(rows, score) {
  let r = 1;
  for (const o of rows) if (o.score > score) r++;
  return r;
}

/**
 * Build the live mini-leaderboard rows shown top-left while playing:
 * top 3, then 3 above / me / 3 below me (≈10 rows). `scores` are cached global
 * scores; the player's own row is replaced with their live score.
 */
export function buildLiveRows(scores, meId, meName, liveScore, total = 10) {
  let entries = (scores || []).map((s) => ({ name: s.name, score: s.score, deviceId: s.deviceId, isMe: s.deviceId === meId }));
  const meIdx = entries.findIndex((e) => e.isMe);
  const meScore = Math.max(Math.floor(liveScore || 0), meIdx >= 0 ? entries[meIdx].score : 0);
  if (meIdx >= 0) entries[meIdx].score = meScore;
  else entries.push({ name: meName || 'You', score: meScore, deviceId: meId, isMe: true });
  entries.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  let rank = 0, last = Infinity;
  entries.forEach((e, i) => { if (e.score !== last) { rank = i + 1; last = e.score; } e.rank = rank; });
  const meIndex = entries.findIndex((e) => e.isMe);
  const rows = [];
  const row = (e) => ({ rank: e.rank, name: e.name, score: e.score, isMe: e.isMe });
  if (meIndex < 3) {
    entries.slice(0, total).forEach((e) => rows.push(row(e)));
  } else {
    entries.slice(0, 3).forEach((e) => rows.push(row(e)));
    const start = Math.max(3, meIndex - 3);
    if (start > 3) rows.push({ sep: true });
    for (let i = start; i <= Math.min(entries.length - 1, meIndex + 3); i++) rows.push(row(entries[i]));
  }
  return rows.slice(0, total);
}
