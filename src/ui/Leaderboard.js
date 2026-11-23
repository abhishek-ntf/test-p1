const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const MEDAL = ['\u{1F947}', '\u{1F948}', '\u{1F949}']; // 🥇🥈🥉

/** Convert raw score rows into ranked rows, flagging the current device. Keeps only the highest score per user name. */
export function rankedRows(rows, meId) {
  // Deduplicate by player name so each user only appears once with their single best score
  const userMap = new Map();
  for (const r of (rows || [])) {
    const key = (r.name || 'Player').trim().toLowerCase();
    if (!userMap.has(key)) {
      userMap.set(key, r);
    } else {
      const prev = userMap.get(key);
      if (r.score > prev.score || (r.score === prev.score && (r.distance || 0) > (prev.distance || 0))) {
        userMap.set(key, r);
      }
    }
  }

  const sorted = Array.from(userMap.values()).sort((a, b) => b.score - a.score || (b.distance || 0) - (a.distance || 0));
  let rank = 0, last = Infinity;
  const out = [];
  sorted.forEach((r, i) => {
    if (r.score < last) { rank = i + 1; last = r.score; }
    out.push({
      rank, name: r.name, bestScore: r.score,
      bestDistance: r.distance || 0, isCurrent: r.deviceId === meId,
    });
  });
  return out;
}

/** Render ranked rows as an HTML list (used by the menu and game-over). */
export function boardHTML(entries) {
  if (!entries || !entries.length) {
    return '<p class="hint">No records yet — play a round!</p>';
  }
  return `<ol class="board-list">${entries.map((e) => {
    const rk = e.rank <= 3 ? `<span class="rk medal">${MEDAL[e.rank - 1]}</span>` : `<span class="rk num">${e.rank}</span>`;
    return `<li class="row${e.isCurrent ? ' me' : ''}" data-me="${e.isCurrent ? '1' : '0'}">
      ${rk}
      <span class="nm">${esc(e.name)}${e.isCurrent ? ' <i class="you">(you)</i>' : ''}</span>
      <span class="sc">${e.bestScore.toLocaleString()}</span>
      <span class="dm">${Math.round(e.bestDistance).toLocaleString()} m</span>
    </li>`;
  }).join('')}</ol>`;
}
