/** One-time name entry shown only on first launch (no auth). */
export class NamePrompt {
  constructor(parent = document.body, { onSubmit } = {}) {
    this.onSubmit = onSubmit;
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    this.root.innerHTML = `
      <div class="panel glass name-panel">
        <h1 class="title small">NEON HIGHWAY</h1>
        <p class="sub">Enter your name to join the global leaderboard</p>
        <input type="text" maxlength="14" placeholder="Your name" data-k="name" autocomplete="off" />
        <button type="button" class="btn" data-k="go">CONTINUE</button>
        <p class="hint">No login needed — your name is saved on this device.</p>
      </div>`;
    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((n) => { this.el[n.dataset.k] = n; });
    this.el.go.addEventListener('click', () => {
      const n = (this.el.name.value || '').trim();
      if (n && this.onSubmit) this.onSubmit(n);
    });
    this.el.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.el.go.click(); } });
    parent.appendChild(this.root);
  }

  focus() { this.el.name.focus(); }
  remove() { this.root.remove(); }
}
