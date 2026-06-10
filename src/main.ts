import { Game } from './core/Game';

const container = document.getElementById('app');
if (!container) throw new Error('Contenitore #app non trovato');

const game = new Game(container);
game.start();

// handle di debug per gli smoke test headless
(window as unknown as { __nova: Game }).__nova = game;
