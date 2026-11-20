import './styles/style.css';
import { Game } from './game/Game.js';

const canvas = document.getElementById('game');
const pauseEl = document.getElementById('pause');
const game = new Game(canvas, pauseEl);
game.run();

// Temporary helper until the Settings screen arrives in Phase 6
window.addEventListener('keydown', (e) => { if (e.code === 'KeyN' && !e.repeat) game.toggleTheme(); });
pauseEl.addEventListener('click', () => game.togglePause());

if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
