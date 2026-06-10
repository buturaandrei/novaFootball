import { Game } from './core/Game';

/**
 * iOS Safari ignora user-scalable=no: blocca esplicitamente lo zoom da
 * doppio tap e da pinch, che altrimenti rompe la visuale di gioco.
 */
function preventMobileZoom(): void {
  document.addEventListener('dblclick', (e) => e.preventDefault());
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = performance.now();
      if (now - lastTouchEnd < 350) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, (e) => e.preventDefault());
  }
}

preventMobileZoom();

const container = document.getElementById('app');
if (!container) throw new Error('Contenitore #app non trovato');

const game = new Game(container);
game.start();

// handle di debug per gli smoke test headless
(window as unknown as { __nova: Game }).__nova = game;
