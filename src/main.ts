import { Game, type GameConfig } from './core/Game';
import { showMenu } from './ui/Menu';
import type { FluxProfileId } from './flux/FluxProfile';
import type { DifficultyName } from './ai/Difficulty';

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

const VALID_TEAMS: FluxProfileId[] = ['gelo', 'ombra', 'ruggito'];
const VALID_DIFF: DifficultyName[] = ['facile', 'normale', 'difficile'];

function parseTeam(v: string | null): FluxProfileId | null {
  return VALID_TEAMS.includes(v as FluxProfileId) ? (v as FluxProfileId) : null;
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo') === '1';
  const io = parseTeam(params.get('io'));
  const avversario = parseTeam(params.get('avversario'));
  const diffParam = params.get('difficolta');
  const difficulty = VALID_DIFF.includes(diffParam as DifficultyName)
    ? (diffParam as DifficultyName)
    : 'normale';

  let config: GameConfig;
  if (demo) {
    // partita automatica IA vs IA (bilanciamento / vetrina)
    config = {
      player: io ?? 'gelo',
      opponent: avversario ?? 'ombra',
      difficulty,
      demo: true,
    };
  } else if (io && avversario && io !== avversario) {
    // scorciatoia via URL: salta il menu
    config = { player: io, opponent: avversario, difficulty };
  } else {
    config = { ...(await showMenu(container!)), demo: false };
  }

  const game = new Game(container!, config);
  // handle di debug per gli smoke test headless
  (window as unknown as { __nova: Game }).__nova = game;
  game.start();
  game.beginMatch();
}

void boot();
