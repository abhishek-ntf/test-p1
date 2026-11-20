/** Lightweight DOM confetti burst (used when the player overtakes someone). */
const COLORS = ['#00e5ff', '#ff2a6d', '#ffd84a', '#7cf3ff', '#ff7a1a', '#a3ff7a'];

function layer() {
  let l = document.getElementById('confetti-layer');
  if (!l) { l = document.createElement('div'); l.id = 'confetti-layer'; document.body.appendChild(l); }
  return l;
}

export const Celebration = {
  burst(x, y) {
    const root = layer();
    const cx = x != null ? x : window.innerWidth / 2;
    const cy = y != null ? y : window.innerHeight * 0.4;
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('div');
      p.className = 'confetti';
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.background = COLORS[i % COLORS.length];
      const ang = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 200;
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist - 90 + 'px');
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      root.appendChild(p);
      setTimeout(() => p.remove(), 1300);
    }
  },
};
