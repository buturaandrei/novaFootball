/**
 * Identità Flux delle squadre: ogni energia planetaria ha colori, nomi
 * delle mosse e meccaniche proprie (lo scatto e il dribbling cambiano
 * davvero comportamento, non solo colore).
 */
export type FluxProfileId = 'gelo' | 'ombra' | 'ruggito';

export interface FluxProfile {
  id: FluxProfileId;
  /** Nome dell'energia, mostrato nell'HUD. */
  energyName: string;
  /** Colore principale dell'aura. */
  color: number;
  /** Colore secondario (particelle/accenti). */
  accent: number;
  sprintName: string;
  dribbleName: string;
  shotName: string; // usato dalla milestone 5
}

export const FLUX_PROFILES: Record<FluxProfileId, FluxProfile> = {
  gelo: {
    id: 'gelo',
    energyName: 'SOFFIO DI GELO',
    color: 0x6ef0ff,
    accent: 0xd9fbff,
    sprintName: 'SCIA POLARE',
    dribbleName: 'PASSO DI BRINA',
    shotName: 'ZERO ASSOLUTO',
  },
  ombra: {
    id: 'ombra',
    energyName: 'VELO D’OMBRA',
    color: 0xa64aff,
    accent: 0x3c1466,
    sprintName: 'CORSA NOTTURNA',
    dribbleName: 'PASSO NEL BUIO',
    shotName: 'ECLISSE',
  },
  ruggito: {
    id: 'ruggito',
    energyName: 'RUGGITO SOLARE',
    color: 0xffa53c,
    accent: 0xffe1a8,
    sprintName: 'CARICA FERINA',
    dribbleName: 'ZAMPATA',
    shotName: 'METEORA RUGGENTE',
  },
};
