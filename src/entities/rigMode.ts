/**
 * Selettore del rig giocatore: skinned (default, milestone 7) oppure
 * il rig classico a capsule rigide come fallback per confronto A/B
 * (`?rig=classico` nell'URL).
 */
let skinned = true;

export function setSkinnedRig(on: boolean): void {
  skinned = on;
}

export function useSkinnedRig(): boolean {
  return skinned;
}
