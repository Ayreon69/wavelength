// Le moteur d'une partie : manches, médiums, aiguille, accords, paris, score et fin de partie.
import crypto from 'node:crypto';
import {
  COOP_CARDS,
  WIN_SCORE,
  cleanClue,
  otherTeam,
  pointsFor,
  sideOf,
  zoneAt,
  type Mode,
  type RoundResult,
  type Side,
  type Spectrum,
  type Stage,
  type TeamId,
  type Zone,
} from '../shared/protocol';
import { SPECTRA } from './spectra';

export interface Member {
  id: string;
  team: TeamId;
}

export interface Round {
  n: number;
  psychic: string;
  team: TeamId | null;
  stage: Stage;
  choices: Spectrum[];
  spectrum: Spectrum | null;
  clue: string | null;
  target: number;
  dial: number;
  dialBy: string | null;
  dialSeq: number;
  agreed: Set<string>;
  votes: Map<string, Side>;
  endsAt: number;
  result: RoundResult | null;
  catchUp: boolean;
  suddenDeath: boolean;
  seq: number;
}

export interface RoundRecord {
  n: number;
  psychic: string;
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

export interface GameOptions {
  mode: Mode;
  members: Member[];
  /** Parti ou absent depuis trop longtemps : il ne compte plus pour les accords, ni comme médium. */
  isAway?: (id: string) => boolean;
  /** Temps pour régler l'aiguille, puis pour parier (0 : sans limite). */
  guessMs?: number;
  sideMs?: number;
  firstTeam?: TeamId;
  spectra?: Spectrum[];
  random?: () => number;
  now?: () => number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export class Game {
  readonly mode: Mode;
  members: Member[];
  scores: Record<TeamId, number> = { A: 0, B: 0 };
  coopScore = 0;
  cardsLeft = 0;
  round!: Round;
  records: RoundRecord[] = [];
  over: { winner: TeamId | null } | null = null;

  private deck: Spectrum[] = [];
  private readonly all: Spectrum[];
  private readonly isAway: (id: string) => boolean;
  private readonly guessMs: number;
  private readonly sideMs: number;
  private readonly random: () => number;
  private readonly now: () => number;
  /** Le dernier médium de chaque équipe (ou de la table, en coopératif). */
  private lastPsychic: Record<string, string | undefined> = {};
  /** Égalité au-delà de 10 : les scores au début de la mort subite, et le nombre de manches qui restent. */
  private sudden: { base: Record<TeamId, number>; left: number } | null = null;
  private seq = 0;

  constructor(opts: GameOptions) {
    this.mode = opts.mode;
    this.members = opts.members.map((m) => ({ ...m }));
    this.isAway = opts.isAway ?? (() => false);
    this.guessMs = opts.guessMs ?? 0;
    this.sideMs = opts.sideMs ?? 0;
    this.random = opts.random ?? (() => crypto.randomInt(1_000_000) / 1_000_000);
    this.now = opts.now ?? Date.now;
    this.all = opts.spectra ?? SPECTRA;
    this.deck = this.shuffled(this.all);
    if (this.mode === 'teams') {
      const first = opts.firstTeam ?? (this.random() < 0.5 ? 'A' : 'B');
      // L'équipe qui joue en second commence avec un point.
      this.scores[otherTeam(first)] = 1;
      this.startRound(first);
    } else {
      this.cardsLeft = COOP_CARDS;
      this.startRound(null);
    }
  }

  // ───────────────────────────── Qui fait quoi ─────────────────────────────

  private shuffled<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  isMember(id: string): boolean {
    return this.members.some((m) => m.id === id);
  }

  addMember(member: Member): void {
    if (!this.isMember(member.id)) this.members.push({ ...member });
  }

  /** Ceux qui règlent l'aiguille : l'équipe du médium, sans lui (toute la table, en coopératif). */
  guessers(): string[] {
    const r = this.round;
    return this.members.filter((m) => m.id !== r.psychic && (r.team === null || m.team === r.team)).map((m) => m.id);
  }

  /** Ceux qui parient à gauche ou à droite : l'autre équipe. */
  voters(): string[] {
    const r = this.round;
    if (r.team === null) return [];
    return this.members.filter((m) => m.team !== r.team).map((m) => m.id);
  }

  /** Ceux dont on attend l'accord à cette étape. */
  deciders(): string[] {
    const stage = this.round.stage;
    const pool = stage === 'guess' ? this.guessers() : stage === 'side' ? this.voters() : [];
    return pool.filter((id) => !this.isAway(id));
  }

  /** Le médium suivant de l'équipe : chacun son tour, en sautant les absents. */
  private nextPsychic(team: TeamId | null): string {
    const pool = this.members.filter((m) => team === null || m.team === team).map((m) => m.id);
    const key = team ?? 'all';
    const start = pool.indexOf(this.lastPsychic[key] ?? '') + 1;
    let chosen = pool[start % pool.length];
    for (let i = 0; i < pool.length; i++) {
      const id = pool[(start + i) % pool.length];
      if (!this.isAway(id)) {
        chosen = id;
        break;
      }
    }
    this.lastPsychic[key] = chosen;
    return chosen;
  }

  private draw(n: number): Spectrum[] {
    const out: Spectrum[] = [];
    while (out.length < n) {
      if (!this.deck.length) this.deck = this.shuffled(this.all);
      const card = this.deck.pop()!;
      if (!out.includes(card)) out.push(card);
    }
    return out;
  }

  /** Les cartes écartées repartent sous la pioche. */
  private putBack(cards: Spectrum[]): void {
    this.deck.unshift(...cards);
  }

  private startRound(team: TeamId | null, opts: { catchUp?: boolean; consume?: boolean } = {}): void {
    if (this.mode === 'coop' && opts.consume !== false) this.cardsLeft--;
    const previous = this.round as Round | undefined;
    if (previous?.stage === 'pick') this.putBack(previous.choices);
    // Le centre de la cible tombe n'importe où, pourvu que le plein centre reste au moins à moitié sur le cadran.
    const target = round1(1 + this.random() * 98);
    this.round = {
      n: (previous?.n ?? 0) + 1,
      psychic: this.nextPsychic(team),
      team,
      stage: 'pick',
      choices: this.draw(2),
      spectrum: null,
      clue: null,
      target,
      dial: 50,
      dialBy: null,
      dialSeq: 0,
      agreed: new Set(),
      votes: new Map(),
      endsAt: 0,
      result: null,
      catchUp: !!opts.catchUp,
      suddenDeath: !!this.sudden,
      seq: ++this.seq,
    };
  }

  // ───────────────────────────── Le médium ─────────────────────────────

  pick(by: string, index: unknown): string | undefined {
    const r = this.round;
    if (r.stage !== 'pick') return 'La carte est déjà choisie.';
    if (by !== r.psychic) return "C'est au médium de choisir la carte.";
    if (index !== 0 && index !== 1) return 'Carte inconnue.';
    r.spectrum = r.choices[index];
    this.putBack(r.choices.filter((_, i) => i !== index));
    r.choices = [];
    r.stage = 'clue';
    return undefined;
  }

  /** Deux autres cartes : le médium n'a pas encore vu la cible, il ne peut donc rien en tirer. */
  redraw(by: string): string | undefined {
    const r = this.round;
    if (r.stage !== 'pick') return 'La carte est déjà choisie.';
    if (by !== r.psychic) return "C'est au médium de choisir la carte.";
    const old = r.choices;
    r.choices = this.draw(2);
    this.putBack(old);
    return undefined;
  }

  clue(by: string, text: unknown): string | undefined {
    const r = this.round;
    if (r.stage !== 'clue') return "Ce n'est pas le moment de donner l'indice.";
    if (by !== r.psychic) return "C'est au médium de donner l'indice.";
    const clue = cleanClue(text);
    if (!clue) return 'Écris ton indice.';
    r.clue = clue;
    r.stage = 'guess';
    r.endsAt = this.guessMs ? this.now() + this.guessMs : 0;
    return undefined;
  }

  // ───────────────────────────── L'équipe ─────────────────────────────

  /** Tourne l'aiguille. Tout accord donné sur l'ancienne position tombe. */
  dial(by: string, value: unknown): string | undefined {
    const r = this.round;
    if (r.stage !== 'guess') return "L'aiguille est verrouillée.";
    if (!this.guessers().includes(by)) return r.psychic === by ? 'Le médium ne touche pas à l’aiguille.' : "C'est à l'autre équipe de régler l'aiguille.";
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Position inconnue.';
    const v = round1(Math.max(0, Math.min(100, value)));
    if (Math.abs(v - r.dial) < 0.05) return undefined;
    r.dial = v;
    r.dialBy = by;
    r.dialSeq++;
    r.agreed.clear();
    return undefined;
  }

  agree(by: string, yes: unknown, dialSeq: unknown): string | undefined {
    const r = this.round;
    if (r.stage !== 'guess') return "L'aiguille est déjà verrouillée.";
    if (!this.guessers().includes(by)) return "Seule l'équipe du médium valide l'aiguille.";
    if (yes === false) {
      r.agreed.delete(by);
      return undefined;
    }
    if (dialSeq !== undefined && dialSeq !== r.dialSeq) return "L'aiguille vient de bouger : regarde où elle est avant de valider.";
    r.agreed.add(by);
    this.settle();
    return undefined;
  }

  /** L'autre équipe parie : le centre de la cible est-il à gauche ou à droite de l'aiguille ? */
  vote(by: string, side: unknown): string | undefined {
    const r = this.round;
    if (r.stage !== 'side') return "Ce n'est pas le moment de parier.";
    if (!this.voters().includes(by)) return "C'est à l'autre équipe de parier.";
    if (side === null) r.votes.delete(by);
    else if (side === 'left' || side === 'right') r.votes.set(by, side);
    else return 'Gauche ou droite ?';
    this.settle();
    return undefined;
  }

  /**
   * Remet la manche d'aplomb après chaque changement : verrouille quand tout le monde est d'accord,
   * passe la main si le médium a disparu, et applique la fin du temps.
   */
  settle(): void {
    if (this.over && this.round.stage !== 'reveal') return;
    const r = this.round;
    if ((r.stage === 'pick' || r.stage === 'clue') && this.isAway(r.psychic)) {
      const pool = this.members.filter((m) => r.team === null || m.team === r.team);
      if (pool.some((m) => m.id !== r.psychic && !this.isAway(m.id))) this.startRound(r.team, { catchUp: r.catchUp, consume: false });
      return;
    }
    const expired = r.endsAt > 0 && this.now() >= r.endsAt;
    // Une équipe dont tout le monde a l'écran éteint n'est pas partie : on l'attend, sauf fin du temps.
    if (r.stage === 'guess') {
      const d = this.deciders();
      if (expired || (d.length > 0 && d.every((id) => r.agreed.has(id)))) this.lockGuess();
      return;
    }
    if (r.stage === 'side') {
      const d = this.deciders();
      const first = r.votes.get(d[0]);
      if (d.length > 0 && first && d.every((id) => r.votes.get(id) === first)) this.reveal(first);
      else if (expired) this.reveal(this.majority());
    }
  }

  private majority(): Side | null {
    let left = 0;
    let right = 0;
    for (const v of this.round.votes.values()) v === 'left' ? left++ : right++;
    return left > right ? 'left' : right > left ? 'right' : null;
  }

  private lockGuess(): void {
    const r = this.round;
    r.agreed.clear();
    // Sans personne en face pour parier, on dévoile tout de suite.
    if (this.mode === 'teams' && this.voters().some((id) => !this.isAway(id))) {
      r.stage = 'side';
      r.votes.clear();
      r.endsAt = this.sideMs ? this.now() + this.sideMs : 0;
      return;
    }
    this.reveal(null);
  }

  // ───────────────────────────── Dévoilement & score ─────────────────────────────

  private reveal(side: Side | null): void {
    const r = this.round;
    const zone = zoneAt(r.target, r.dial);
    const points = pointsFor(zone, this.mode);
    const correct = sideOf(r.target, r.dial);
    const result: RoundResult = { zone, points, correct, side, sidePoint: false, bonusCard: false, catchUp: false, gameOver: false, suddenDeath: false };

    if (this.mode === 'teams' && r.team) {
      const other = otherTeam(r.team);
      this.scores[r.team] += points;
      // Un tir en plein centre ne laisse rien à l'autre équipe.
      result.sidePoint = zone !== 4 && side === correct;
      if (result.sidePoint) this.scores[other] += 1;
      this.endCheck(result);
      // Rattrapage : plein centre et toujours derrière, l'équipe rejoue avec un autre médium.
      result.catchUp = !this.over && !this.sudden && zone === 4 && this.scores[r.team] < this.scores[other];
    } else {
      this.coopScore += points;
      result.bonusCard = zone === 4;
      if (result.bonusCard) this.cardsLeft++;
      if (this.cardsLeft <= 0) this.over = { winner: null };
    }
    result.gameOver = !!this.over;

    r.stage = 'reveal';
    r.endsAt = 0;
    r.result = result;
    r.agreed.clear();
    this.records.push({
      n: r.n,
      psychic: r.psychic,
      team: r.team,
      spectrum: r.spectrum!,
      clue: r.clue ?? '',
      target: r.target,
      dial: r.dial,
      zone,
      points,
      side,
      sidePoint: result.sidePoint,
    });
  }

  private endCheck(result: RoundResult): void {
    const { A, B } = this.scores;
    if (this.sudden) {
      this.sudden.left--;
      if (this.sudden.left > 0) return;
      const gainA = A - this.sudden.base.A;
      const gainB = B - this.sudden.base.B;
      if (gainA !== gainB) {
        this.over = { winner: gainA > gainB ? 'A' : 'B' };
        this.sudden = null;
      } else {
        this.sudden = { base: { A, B }, left: 2 };
        result.suddenDeath = true;
      }
      return;
    }
    if (Math.max(A, B) < WIN_SCORE) return;
    if (A !== B) this.over = { winner: A > B ? 'A' : 'B' };
    else {
      // Égalité : chaque équipe joue une manche de plus, pari compris.
      this.sudden = { base: { A, B }, left: 2 };
      result.suddenDeath = true;
    }
  }

  /** Passe à la manche suivante. Renvoie « over » quand il ne reste plus qu'à afficher les résultats. */
  next(by: string, seq: unknown): string | undefined {
    const r = this.round;
    if (r.stage !== 'reveal') return 'La manche est encore en cours.';
    if (!this.isMember(by)) return 'Seuls les joueurs lancent la manche suivante.';
    if (seq !== undefined && seq !== r.seq) return undefined;
    if (this.over) return 'over';
    if (r.team === null) this.startRound(null);
    else if (r.result?.catchUp) this.startRound(r.team, { catchUp: true });
    else this.startRound(otherTeam(r.team));
    return undefined;
  }
}
