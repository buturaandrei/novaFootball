// Dimensioni e parametri globali dell'arena e della simulazione.
// Tutte le misure sono in metri, asse X lungo il campo (porte a x = ±HALF_LENGTH),
// asse Z lungo la larghezza, asse Y verticale.

export const FIELD_LENGTH = 62;
export const FIELD_WIDTH = 38;
export const HALF_LENGTH = FIELD_LENGTH / 2;
export const HALF_WIDTH = FIELD_WIDTH / 2;

export const WALL_HEIGHT = 9;
export const DOME_HEIGHT = 16; // cupola energetica invisibile che chiude l'arena in alto

export const GOAL_WIDTH = 7.5;
export const GOAL_HEIGHT = 3.4;
export const GOAL_DEPTH = 2.6;

export const BALL_RADIUS = 0.36;
export const GRAVITY = 22; // gravità arcade, più forte del reale per un feeling scattante

// Giocatore
export const PLAYER_RADIUS = 0.45;
export const WALK_SPEED = 7.2;
export const SPRINT_SPEED = 11.0;
export const PLAYER_ACCEL = 42;
export const PLAYER_DECEL = 30;
export const JUMP_SPEED = 8.8;
export const DOUBLE_JUMP_SPEED = 7.8;
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN = 22; // al secondo in scatto
export const STAMINA_REGEN = 15;
export const STAMINA_MIN_SPRINT = 6; // soglia minima per iniziare uno scatto

// Controllo palla
export const CONTROL_RADIUS = 1.25; // distanza per agganciare la palla
export const CONTROL_LOSE_RADIUS = 1.9;
export const CONTROL_MAX_BALL_SPEED = 10; // oltre questa velocità relativa la palla non si aggancia
export const KICK_CHARGE_TIME = 0.9; // secondi per la carica completa (3 livelli)
export const KICK_COOLDOWN = 0.35;
