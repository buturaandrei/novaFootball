import type { FluxProfileId } from '../flux/FluxProfile';
import type { TeamConfig } from './Team';

/** Dati di presentazione delle tre squadre (per menu e HUD). */
export const TEAM_PRESENTATION: Record<
  FluxProfileId,
  { name: string; color: number; planet: string; tagline: string }
> = {
  gelo: {
    name: 'GELO',
    color: 0x49e9ff,
    planet: 'Pianeta di ghiaccio Kryon',
    tagline: 'Precisione cristallina, piroette di brina',
  },
  ombra: {
    name: 'OMBRA',
    color: 0xb44aff,
    planet: 'Luna oscura Nyxis',
    tagline: 'Teletrasporti corti, tiri che svaniscono',
  },
  ruggito: {
    name: 'RUGGITO',
    color: 0xffa53c,
    planet: 'Gigante solare Tharr',
    tagline: 'Zampate e onde d’urto devastanti',
  },
};

const ROSTERS: Record<FluxProfileId, string[]> = {
  gelo: ['Boreas', 'Ilya', 'Vesna', 'Nyra', 'Sorin', 'Mirka', 'Kael'],
  ombra: ['Tenebr', 'Nox', 'Lyrr', 'Vesper', 'Crepus', 'Umbra', 'Vrax'],
  ruggito: ['Korr', 'Brann', 'Tarvok', 'Sela', 'Drogh', 'Maula', 'Ragnar'],
};

const COLORS: Record<FluxProfileId, { colors: TeamConfig['colors']; gkColors: TeamConfig['gkColors'] }> = {
  gelo: {
    colors: { primary: 0x2a6f9e, secondary: 0x10222e, glow: 0x49e9ff },
    gkColors: { primary: 0x1a4a72, secondary: 0x0c1a26, glow: 0x9af2ff },
  },
  ombra: {
    colors: { primary: 0x4a2a6e, secondary: 0x1a1024, glow: 0xb44aff },
    gkColors: { primary: 0x32184e, secondary: 0x120a1c, glow: 0xd99aff },
  },
  ruggito: {
    colors: { primary: 0x8a4a1a, secondary: 0x2e1606, glow: 0xffa53c },
    gkColors: { primary: 0x6a3210, secondary: 0x1e0e04, glow: 0xffd28c },
  },
};

export function buildTeamConfig(id: FluxProfileId, defendsSide: number): TeamConfig {
  return {
    name: TEAM_PRESENTATION[id].name,
    defendsSide,
    color: TEAM_PRESENTATION[id].color,
    flux: id,
    colors: COLORS[id].colors,
    gkColors: COLORS[id].gkColors,
    roster: ROSTERS[id],
  };
}
