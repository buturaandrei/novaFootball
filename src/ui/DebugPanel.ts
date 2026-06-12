import type { Game } from '../core/Game';

/**
 * Pannello di tuning live (lil-gui), solo con ?debug=1: serve a iterare
 * sul polish (tempo, Flux, difficoltà, partita) senza ricompilare.
 * Import dinamico: in partita normale non pesa sul bundle.
 */
export async function maybeShowDebugPanel(game: Game): Promise<void> {
  if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
  const { GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'NOVA · tuning' });

  gui.add(game.time, 'scale', 0.05, 2, 0.05).name('time scale').listen();

  const flux = gui.addFolder('Flux');
  flux.add(game.fluxSystems[0], 'value', 0, 100, 1).name('barra mia').listen();
  flux.add(game.fluxSystems[1], 'value', 0, 100, 1).name('barra avversaria').listen();

  const match = gui.addFolder('Partita');
  match.add(game.match, 'clock', 0, 180, 1).name('cronometro').listen();
  match
    .add({ d: game.difficulty }, 'd', ['facile', 'normale', 'difficile'])
    .name('difficoltà')
    .onChange((d: 'facile' | 'normale' | 'difficile') => game.setDifficulty(d));
  match.add({ kickoff: () => game.match.kickoff() }, 'kickoff').name('↺ kickoff');
}
