import './styles/style.css';
import { Game } from './game/Game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
game.run();

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
