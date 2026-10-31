// Contrat partagé entre le serveur et le client : vues de table, réglages, constantes et géométrie de la cible.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
/** En équipes, chacune compte au moins deux joueurs : un médium et quelqu'un pour régler l'aiguille. */
export const TEAM_MIN = 2;
export const WIN_SCORE = 10;
/** En coopératif, la partie dure sept cartes, plus une par tir en plein centre. */
export const COOP_CARDS = 7;

/** Le cadran va de 0 (tout à gauche) à 100 (tout à droite). Chaque bande de la cible en couvre 4. */
export const BAND = 4;
/** La cible entière : 2, 3, 4, 3, 2. */
export const TARGET_SPAN = BAND * 5;
export const CLUE_MAX = 60;

export type Mode = 'teams' | 'coop';
export type TeamId = 'A' | 'B';
export const TEAMS: readonly TeamId[] = ['A', 'B'];
export const TEAM_NAME: Record<TeamId, string> = { A: 'Corail', B: 'Lagon' };
export function otherTeam(t: TeamId): TeamId {
  return t === 'A' ? 'B' : 'A';
}

export type Side = 'left' | 'right';
export type Zone = 4 | 3 | 2 | 0;

/** La bande où tombe l'aiguille. Sur une frontière, on prend la plus haute, comme le veut la règle. */
export function zoneAt(target: number, dial: number): Zone {
  const d = Math.abs(dial - target);
  if (d <= BAND / 2) return 4;
  if (d <= BAND * 1.5) return 3;
  if (d <= BAND * 2.5) return 2;
  return 0;
}

/** Les points d'une bande. En coopératif, le centre vaut 3, mais rapporte une carte de plus. */
export function pointsFor(zone: Zone, mode: Mode): number {
  return mode === 'coop' && zone === 4 ? 3 : zone;
}

/** De quel côté de l'aiguille se trouve le centre de la cible. */
export function sideOf(target: number, dial: number): Side {
  return target < dial ? 'left' : 'right';
}

export const AVATARS = ['radio', 'casque', 'micro', 'satellite', 'vague', 'perroquet', 'poulpe', 'orange', 'cactus', 'planete', 'ballon', 'disque'] as const;
/** Des réactions et des petites phrases de table. Le médium, lui, garde le silence. */
export const EMOTES = ['😂', '😮', '🤔', '😬', '🎯', '👏'] as const;
export const TAUNTS = ['Plus à gauche !', 'Plus à droite !', 'Un poil', 'Beaucoup plus', 'Je le sens', 'Aucune idée'] as const;

export const TIMER_OPTIONS = [0, 60, 120] as const;
export type TimerSetting = (typeof TIMER_OPTIONS)[number];

export interface Settings {
  mode: Mode;
  /** Temps pour régler l'aiguille, en secondes (0 : sans limite). */
  timer: TimerSetting;
}

export interface Spectrum {
  left: string;
  right: string;
}

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  connected: boolean;
  /** Parti, ou déconnecté depuis un moment : il ne compte plus pour les accords. */
  away: boolean;
  status: PlayerStatus;
  team: TeamId;
}

/**
 * Les étapes d'une manche : le médium choisit sa carte, découvre la cible et donne un indice ;
 * son équipe règle l'aiguille ; en équipes, l'autre camp parie à gauche ou à droite ; puis on dévoile.
 */
export type Stage = 'pick' | 'clue' | 'guess' | 'side' | 'reveal';

export interface RoundResult {
  zone: Zone;
  points: number;
  /** Le bon côté, et le pari de l'autre équipe (null s'il n'y en a pas eu). */
  correct: Side;
  side: Side | null;
  sidePoint: boolean;
  /** Coopératif : un tir en plein centre ajoute une carte. */
  bonusCard: boolean;
  /** Équipes : tir en plein centre et toujours derrière, l'équipe rejoue. */
  catchUp: boolean;
  /** La partie est jouée : la manche suivante affiche les résultats. */
  gameOver: boolean;
  /** Égalité au-delà de 10 : chaque équipe rejoue une manche. */
  suddenDeath: boolean;
}

export interface RoundView {
  n: number;
  psychicId: string;
  team: TeamId | null;
  stage: Stage;
  /** Les deux cartes proposées, pour le médium seulement, le temps qu'il choisisse. */
  choices: Spectrum[] | null;
  spectrum: Spectrum | null;
  clue: string | null;
  /** Le centre de la cible : le médium la voit dès qu'il a choisi sa carte, les autres au dévoilement. */
  target: number | null;
  dial: number;
  dialBy: string | null;
  dialSeq: number;
  /** Ceux qui approuvent la position actuelle de l'aiguille. */
  agreed: string[];
  /** Les paris de l'autre équipe, visibles de tous, comme autour d'une vraie table. */
  votes: Record<string, Side>;
  /** Qui doit se mettre d'accord à cette étape. */
  deciders: string[];
  endsAt: number;
  result: RoundResult | null;
  catchUp: boolean;
  suddenDeath: boolean;
  /** Sert à ignorer un « suivant » envoyé deux fois. */
  seq: number;
}

export interface GameView {
  mode: Mode;
  scores: Record<TeamId, number>;
  coopScore: number;
  cardsLeft: number;
  round: RoundView;
}

export interface RoundRecap {
  n: number;
  psychicId: string;
  psychicName: string;
  team: TeamId | null;
  spectrum: Spectrum;
  clue: string;
  target: number;
  dial: number;
  zone: Zone;
  points: number;
  side: Side | null;
  sidePoint: boolean;
}

export interface FinalView {
  mode: Mode;
  winner: TeamId | null;
  scores: Record<TeamId, number>;
  coopScore: number;
  rounds: RoundRecap[];
  players: { id: string; name: string; avatar: string; team: TeamId }[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
}

/** Un mouvement de l'aiguille, envoyé à part pour rester fluide. */
export interface DialMove {
  v: number;
  by: string;
  seq: number;
  n: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

/** Nettoie un indice saisi : une ligne, sans caractères de contrôle. */
export function cleanClue(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CLUE_MAX);
}
