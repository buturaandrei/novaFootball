import { FLUX_PROFILES, type FluxProfileId } from '../flux/FluxProfile';
import { TEAM_PRESENTATION } from '../match/teamConfigs';
import type { DifficultyName } from '../ai/Difficulty';
import { DIFFICULTIES } from '../ai/Difficulty';

export interface MenuResult {
  player: FluxProfileId;
  opponent: FluxProfileId;
  difficulty: DifficultyName;
}

const IDS: FluxProfileId[] = ['gelo', 'ombra', 'ruggito'];

function hexColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

/**
 * Menu olografico: selezione della tua squadra, dell'avversario e della
 * difficoltà. Restituisce una Promise con la configurazione scelta.
 */
export function showMenu(parent: HTMLElement): Promise<MenuResult> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.style.cssText =
      'position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:14px;padding:12px;overflow:auto;' +
      "font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#cdf3ff;" +
      'background:radial-gradient(ellipse at center, rgba(4,18,32,.94), rgba(2,8,18,.99));';
    parent.appendChild(root);

    const title = document.createElement('div');
    title.textContent = 'NOVA FOOTBALL';
    title.style.cssText =
      'font-size:min(46px,8vw);font-weight:900;letter-spacing:8px;transform:skewX(-8deg);color:#eaffff;' +
      'text-shadow:0 0 22px rgba(110,230,255,1),0 0 60px rgba(60,180,255,.9);';
    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:13px;letter-spacing:5px;opacity:.85;margin-bottom:6px;';
    const cards = document.createElement('div');
    cards.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;';
    root.append(title, subtitle, cards);

    let player: FluxProfileId | null = null;
    let difficulty: DifficultyName = 'normale';

    const makeCard = (id: FluxProfileId, onPick: (id: FluxProfileId) => void) => {
      const t = TEAM_PRESENTATION[id];
      const f = FLUX_PROFILES[id];
      const color = hexColor(t.color);
      const card = document.createElement('div');
      card.dataset.team = id;
      card.style.cssText =
        'width:min(200px,28vw);min-width:150px;padding:14px 12px;cursor:pointer;border-radius:10px;' +
        `border:2px solid ${color};background:rgba(8,24,40,.75);text-align:center;` +
        `box-shadow:0 0 16px ${color}44, inset 0 0 18px ${color}22;transition:transform .12s;`;
      card.innerHTML =
        `<div style="font-size:24px;font-weight:900;letter-spacing:3px;color:${color};text-shadow:0 0 12px ${color}">${t.name}</div>` +
        `<div style="font-size:11px;opacity:.8;margin:6px 0 2px">${t.planet}</div>` +
        `<div style="font-size:11px;opacity:.65">${t.tagline}</div>` +
        `<div style="font-size:11px;margin-top:8px;letter-spacing:1px;color:${color}">⚡ ${f.energyName}</div>` +
        `<div style="font-size:10px;opacity:.7;margin-top:2px">${f.shotName}</div>`;
      card.addEventListener('pointerenter', () => (card.style.transform = 'scale(1.05)'));
      card.addEventListener('pointerleave', () => (card.style.transform = 'scale(1)'));
      card.addEventListener('pointerdown', () => onPick(id));
      return card;
    };

    const diffRow = document.createElement('div');
    diffRow.style.cssText = 'display:flex;gap:10px;margin-top:4px;';
    const diffButtons = new Map<DifficultyName, HTMLDivElement>();
    (['facile', 'normale', 'difficile'] as DifficultyName[]).forEach((d) => {
      const b = document.createElement('div');
      b.dataset.diff = d;
      b.textContent = DIFFICULTIES[d].label;
      b.style.cssText =
        'padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px;letter-spacing:2px;' +
        'border:1px solid rgba(80,220,255,.5);background:rgba(8,24,40,.7);';
      b.addEventListener('pointerdown', () => {
        difficulty = d;
        for (const [k, el] of diffButtons) {
          el.style.background = k === d ? 'rgba(70,200,255,.35)' : 'rgba(8,24,40,.7)';
        }
      });
      diffButtons.set(d, b);
      diffRow.appendChild(b);
    });
    diffButtons.get('normale')!.style.background = 'rgba(70,200,255,.35)';

    const stepPlayer = () => {
      subtitle.textContent = 'SCEGLI LA TUA SQUADRA';
      cards.replaceChildren(...IDS.map((id) => makeCard(id, (picked) => {
        player = picked;
        stepOpponent();
      })));
      if (diffRow.parentElement) diffRow.remove();
    };

    const stepOpponent = () => {
      subtitle.textContent = 'SCEGLI L’AVVERSARIO E LA DIFFICOLTÀ';
      const rest = IDS.filter((id) => id !== player);
      cards.replaceChildren(...rest.map((id) => makeCard(id, (picked) => {
        root.remove();
        resolve({ player: player!, opponent: picked, difficulty });
      })));
      root.insertBefore(diffRow, null);
      root.appendChild(diffRow);
    };

    stepPlayer();
  });
}
