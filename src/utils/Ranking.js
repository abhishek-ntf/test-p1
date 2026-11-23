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
  const cleanName = (GameStorage.getUserName() || 'You').trim();
  const me = { name: cleanName, score: best.score, distance: best.distance, deviceId: GameStorage.getDeviceId() };
  const userMap = new Map();
  for (const r of [...LOCAL_RIVALS, me]) {
    const key = (r.name || '').trim().toLowerCase();
    if (!userMap.has(key) || r.score > userMap.get(key).score) {
      userMap.set(key, r);
    }
  }
  return Array.from(userMap.values()).sort((a, b) => b.score - a.score || (b.distance || 0) - (a.distance || 0));
}

export const Ranking = {
  enabled: supabaseEnabled(),

  /** Top scores (name, score, distance, deviceId), best first. Keeps only the highest score per user. */
  async getLeaderboard(limit = 100) {
    const sb = await getSupabase();
    if (sb) {
      const { data, error } = await sb.from(TABLE)
        .select('name,score,distance,device_id')
        .order('score', { ascending: false })
        .order('distance', { ascending: false })
        .limit(limit * 2);
      if (!error && data) {
        // Group by user name so each user only has their single highest score
        const userMap = new Map();
        for (const r of data) {
          const key = (r.name || 'Player').trim().toLowerCase();
          if (!userMap.has(key)) {
            userMap.set(key, { name: r.name, score: r.score, distance: r.distance, deviceId: r.device_id });
          } else {
            const cur = userMap.get(key);
            if (r.score > cur.score || (r.score === cur.score && (r.distance || 0) > (cur.distance || 0))) {
              userMap.set(key, { name: r.name, score: r.score, distance: r.distance, deviceId: r.device_id });
            }
          }
        }
        return Array.from(userMap.values())
          .sort((a, b) => b.score - a.score || (b.distance || 0) - (a.distance || 0))
          .slice(0, limit);
      }
      console.warn('Leaderboard fetch failed, using local', error);
    }
    return localRows().slice(0, limit);
  },

  /** Submit this run's result; keeps the single highest score for this user (never adds or overwrites with a lower score). */
  async submitScore({ deviceId, name, score, distance, level }) {
    score = Math.max(0, Math.floor(score || 0));
    distance = Math.max(0, Math.floor(distance || 0));
    level = Math.max(1, Math.floor(level || 1));
    const cleanName = (name || GameStorage.getUserName() || 'Player').trim();

    // Always update local storage with the maximum score
    GameStorage.saveBest({ score, distance, level });

    const sb = await getSupabase();
    if (sb) {
      try {
        // Check if this user (by name or deviceId) already has a score in Supabase
        const { data: existingRows } = await sb.from(TABLE)
          .select('id,name,score,distance,level')
          .or(`device_id.eq.${deviceId},name.ilike.${cleanName}`)
          .order('score', { ascending: false })
          .limit(1);

        if (existingRows && existingRows.length > 0) {
          const prev = existingRows[0];
          // Only update if current run's score is higher than their previous score!
          if (score > prev.score) {
            await sb.from(TABLE).update({
              score,
              distance: Math.max(prev.distance || 0, distance),
              level: Math.max(prev.level || 1, level),
              device_id: deviceId,
              name: cleanName,
              updated_at: new Date().toISOString(),
            }).eq('id', prev.id);
          }
          // If the new score is lower or equal, keep the previous highest score intact!
          return;
        }

        // If no previous record exists for this user, insert or call upsert_score
        const { error } = await sb.rpc('upsert_score', { d: deviceId, n: cleanName, s: score, dist: distance, lvl: level });
        if (!error) return;
        throw error;
      } catch (e) {
        // Fallback: plain insert if not already present
        try {
          await sb.from(TABLE).insert({
            device_id: deviceId,
            name: cleanName,
            score,
            distance,
            level,
          });
        } catch {}
      }
    }
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
  const cleanMeName = (meName || 'You').trim();
  const currentLive = Math.max(0, Math.floor(liveScore || 0));

  // Deduplicate incoming scores by player name so each user only appears once
  const userMap = new Map();
  for (const s of (scores || [])) {
    const key = (s.name || '').trim().toLowerCase();
    if (!userMap.has(key) || s.score > userMap.get(key).score) {
      userMap.set(key, { name: s.name, score: s.score, deviceId: s.deviceId, isMe: s.deviceId === meId || key === cleanMeName.toLowerCase() });
    }
  }

  const entries = Array.from(userMap.values());
  const meIdx = entries.findIndex((e) => e.isMe);
  const meScore = Math.max(currentLive, meIdx >= 0 ? entries[meIdx].score : 0);
  if (meIdx >= 0) {
    entries[meIdx].score = meScore;
    entries[meIdx].name = cleanMeName;
  } else {
    entries.push({ name: cleanMeName, score: meScore, deviceId: meId, isMe: true });
  }

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
