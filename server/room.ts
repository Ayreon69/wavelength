// Une table de Wavelength : salon, équipes, partie, minuteries et vue personnalisée de chacun.
import crypto from 'node:crypto';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  TEAM_MIN,
  TEAM_NAME,
  TIMER_OPTIONS,
  type DialMove,
  type FinalView,
  type GameView,
  type Mode,
  type PlayerStatus,
  type RoomView,
  type RoundView,
  type Settings,
  type TeamId,
  type TimerSetting,
} from '../shared/protocol';
import { Game } from './game';

const MAX_MEMBERS = 16;
/** Mode accéléré pour les tests locaux (WL_FAST=1). */
const FAST = process.env.WL_FAST === '1';
/** Délai laissé à un joueur déconnecté avant qu'il ne compte plus pour les accords. */
const GRACE_MS = FAST ? 600 : 20_000;
/** Le temps de parier, quand la table joue avec un chrono. */
const SIDE_MS = 30_000;
/** Après un mouvement de l'aiguille, l'état complet suit peu après, pour que tout le monde soit d'accord. */
const DIAL_SYNC_MS = 250;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
  team: TeamId;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { mode: 'teams', timer: 0 };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onDial: (move: DialMove) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;
  private dialTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  isAway(p: Player | undefined): boolean {
    return !p || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  /** La plus petite équipe, pour qu'un nouveau venu équilibre la table. */
  private smallerTeam(): TeamId {
    const pool = this.seated.filter((p) => !p.left);
    const a = pool.filter((p) => p.team === 'A').length;
    const b = pool.filter((p) => p.team === 'B').length;
    return b < a ? 'B' : 'A';
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    const seats = this.seated.filter((p) => !p.left).length;
    if (this.phase === 'lobby' && seats >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    // Un jeu d'ambiance : on peut rejoindre une partie en cours, comme on s'assoit à une table qui joue déjà.
    const status: PlayerStatus = this.phase === 'lobby' ? 'lobby' : this.phase === 'playing' && this.game && seats < MAX_PLAYERS ? 'playing' : 'spectator';
    const p: Player = {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      sockets: new Set(),
      connected: false,
      disconnectedAt: Date.now(),
      left: false,
      status,
      team: this.smallerTeam(),
    };
    this.players.push(p);
    if (status === 'playing') this.game!.addMember({ id: p.id, team: p.team });
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa place reste à la table : on ne l'attend plus, c'est tout.
    if (this.phase !== 'playing' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else p.left = true;
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.left && p.connected) ?? this.players.find((p) => !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if (payload.mode === 'teams' || payload.mode === 'coop') this.settings.mode = payload.mode as Mode;
    if ((TIMER_OPTIONS as readonly unknown[]).includes(payload.timer)) this.settings.timer = payload.timer as TimerSetting;
    return undefined;
  }

  setTeam(by: string, team: unknown): string | undefined {
    if (this.phase !== 'lobby') return "On change d'équipe dans le salon.";
    const p = this.get(by);
    if (!p || p.status === 'spectator') return 'Tu regardes la partie.';
    if (team !== 'A' && team !== 'B') return 'Équipe inconnue.';
    p.team = team;
    return undefined;
  }

  /** L'hôte rebat les équipes : moitié Corail, moitié Lagon, au hasard. */
  shuffleTeams(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut mélanger les équipes.";
    if (this.phase !== 'lobby') return 'On mélange les équipes dans le salon.';
    const pool = shuffle([...this.seated]);
    const firstA = crypto.randomInt(2) === 0;
    pool.forEach((p, i) => {
      p.team = (i % 2 === 0) === firstA ? 'A' : 'B';
    });
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs.`;
    const mode = this.settings.mode;
    if (mode === 'teams') {
      for (const t of ['A', 'B'] as TeamId[]) {
        const n = seated.filter((p) => p.team === t).length;
        if (n < TEAM_MIN) return `L'équipe ${TEAM_NAME[t]} doit compter au moins ${TEAM_MIN} joueurs.`;
      }
    }
    for (const p of seated) p.status = 'playing';
    // L'ordre de passage comme médium est tiré au sort.
    const order = shuffle(seated.map((p) => p.id));
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game({
      mode,
      members: order.map((id) => ({ id, team: this.get(id)!.team })),
      isAway: (id) => this.isAway(this.get(id)),
      guessMs: this.settings.timer * 1000,
      sideMs: this.settings.timer ? SIDE_MS : 0,
    });
    this.phase = 'playing';
    this.final = null;
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimers();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    return this.restart(by);
  }

  private playing(): Game | string {
    if (this.phase !== 'playing' || !this.game) return "Aucune partie n'est en cours.";
    return this.game;
  }

  pick(by: string, index: unknown): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.pick(by, index);
  }

  redraw(by: string): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.redraw(by);
  }

  clue(by: string, text: unknown): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.clue(by, text);
  }

  agree(by: string, yes: unknown, dialSeq: unknown): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.agree(by, yes, dialSeq);
  }

  vote(by: string, side: unknown): string | undefined {
    const g = this.playing();
    return typeof g === 'string' ? g : g.vote(by, side);
  }

  next(by: string, seq: unknown): string | undefined {
    const g = this.playing();
    if (typeof g === 'string') return g;
    const res = g.next(by, seq);
    if (res === 'over') {
      this.finishGame();
      return undefined;
    }
    return res;
  }

  /**
   * L'aiguille bouge : le mouvement part tout de suite à toute la table, à part de l'état complet.
   * Renvoie true si l'état doit être rediffusé (des accords sont tombés).
   */
  dial(by: string, value: unknown): string | boolean {
    const g = this.playing();
    if (typeof g === 'string') return g;
    const r = g.round;
    const before = { seq: r.dialSeq, agreed: r.agreed.size };
    const err = g.dial(by, value);
    if (err) return err;
    if (r.dialSeq === before.seq) return false;
    this.onDial({ v: r.dial, by, seq: r.dialSeq, n: r.n });
    if (!this.dialTimer) {
      this.dialTimer = setTimeout(() => {
        this.dialTimer = null;
        this.onChange();
      }, DIAL_SYNC_MS);
    }
    return before.agreed > 0;
  }

  /** Le médium garde le silence de la carte au dévoilement. */
  canEmote(id: string): boolean {
    const g = this.phase === 'playing' ? this.game : null;
    if (!g) return true;
    const r = g.round;
    return !(r.psychic === id && (r.stage === 'clue' || r.stage === 'guess' || r.stage === 'side'));
  }

  private finishGame(): void {
    const g = this.game;
    if (!g?.over) return;
    this.final = {
      mode: g.mode,
      winner: g.over.winner,
      scores: { ...g.scores },
      coopScore: g.coopScore,
      rounds: g.records.map((r) => ({
        n: r.n,
        psychicId: r.psychic,
        psychicName: this.get(r.psychic)?.name ?? '?',
        team: r.team,
        spectrum: { ...r.spectrum },
        clue: r.clue,
        target: r.target,
        dial: r.dial,
        zone: r.zone,
        points: r.points,
        side: r.side,
        sidePoint: r.sidePoint,
      })),
      players: this.players.filter((p) => g.isMember(p.id)).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, team: p.team })),
    };
    this.phase = 'finished';
    this.clearTimers();
  }

  // ───────────────────────────── Minuteries ─────────────────────────────

  private clearTimers(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.dialTimer) clearTimeout(this.dialTimer);
    this.timer = null;
    this.dialTimer = null;
  }

  /** À appeler après chaque changement : remet la manche d'aplomb, planifie la prochaine échéance, puis diffuse. */
  commit(): void {
    if (this.phase === 'playing') this.game?.settle();
    this.reschedule();
    this.onChange();
  }

  /** La prochaine échéance : la fin du chrono, ou le moment où un absent cessera d'être attendu. */
  private reschedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    let due = g.round.endsAt > 0 ? g.round.endsAt : Infinity;
    for (const p of this.players) {
      if (p.status === 'playing' && !p.connected && !p.left && !this.isAway(p)) due = Math.min(due, p.disconnectedAt + GRACE_MS + 5);
    }
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.commit();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
    }, Math.max(0, Math.min(due - Date.now(), 2_147_000_000)));
  }

  dispose(): void {
    this.clearTimers();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  /** Le secret du jeu : la cible n'est vue que du médium, jusqu'au dévoilement. Les cartes proposées aussi. */
  private roundView(g: Game, viewer: string): RoundView {
    const r = g.round;
    const psychic = viewer === r.psychic;
    return {
      n: r.n,
      psychicId: r.psychic,
      team: r.team,
      stage: r.stage,
      choices: psychic && r.stage === 'pick' ? r.choices.map((c) => ({ ...c })) : null,
      spectrum: r.spectrum ? { ...r.spectrum } : null,
      clue: r.clue,
      target: r.stage === 'reveal' || (psychic && r.stage !== 'pick') ? r.target : null,
      dial: r.dial,
      dialBy: r.dialBy,
      dialSeq: r.dialSeq,
      agreed: [...r.agreed],
      votes: Object.fromEntries(r.votes),
      deciders: g.deciders(),
      endsAt: r.endsAt,
      result: r.result ? { ...r.result } : null,
      catchUp: r.catchUp,
      suddenDeath: r.suddenDeath,
      seq: r.seq,
    };
  }

  private gameView(g: Game, viewer: string): GameView {
    return {
      mode: g.mode,
      scores: { ...g.scores },
      coopScore: g.coopScore,
      cardsLeft: g.cardsLeft,
      round: this.roundView(g, viewer),
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.id === this.hostId,
        connected: p.connected,
        away: p.status === 'playing' && this.isAway(p),
        status: p.status,
        team: p.team,
      })),
      game: g ? this.gameView(g, viewerId) : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
