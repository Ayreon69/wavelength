// Règles de Wavelength : cible, score, pari, rattrapage, fin de partie, coopératif, accords et secrets.
import { describe, expect, it } from 'vitest';
import { COOP_CARDS, WIN_SCORE, cleanClue, pointsFor, sideOf, zoneAt, type Spectrum } from '../shared/protocol';
import { Game, type Member } from '../server/game';
import { Room } from '../server/room';
import { SPECTRA } from '../server/spectra';

const TEAMS: Member[] = [
  { id: 'a1', team: 'A' },
  { id: 'b1', team: 'B' },
  { id: 'a2', team: 'A' },
  { id: 'b2', team: 'B' },
  { id: 'a3', team: 'A' },
];

function teamsGame(extra: Partial<ConstructorParameters<typeof Game>[0]> = {}): Game {
  return new Game({ mode: 'teams', members: TEAMS, firstTeam: 'A', ...extra });
}

/** Joue une manche entière : carte, indice, aiguille, accords, pari. */
function playRound(g: Game, dialAt: (target: number) => number, side?: 'left' | 'right' | 'good' | 'bad'): void {
  const r = g.round;
  expect(g.pick(r.psychic, 0)).toBeUndefined();
  expect(g.clue(r.psychic, 'Un indice')).toBeUndefined();
  const guessers = g.guessers();
  expect(g.dial(guessers[0], dialAt(r.target))).toBeUndefined();
  for (const id of guessers) expect(g.agree(id, true, r.dialSeq)).toBeUndefined();
  if (g.round.stage === 'side') {
    const correct = sideOf(r.target, r.dial);
    const pickSide = side === 'good' || side === undefined ? correct : side === 'bad' ? (correct === 'left' ? 'right' : 'left') : side;
    for (const id of g.voters()) expect(g.vote(id, pickSide)).toBeUndefined();
  }
  expect(g.round.stage).toBe('reveal');
}

describe('la cible', () => {
  it('compte 4, 3 et 2 points en s’éloignant du centre, et la frontière profite à la bande la plus haute', () => {
    expect(zoneAt(50, 50)).toBe(4);
    expect(zoneAt(50, 52)).toBe(4);
    expect(zoneAt(50, 52.1)).toBe(3);
    expect(zoneAt(50, 44)).toBe(3);
    expect(zoneAt(50, 43.9)).toBe(2);
    expect(zoneAt(50, 60)).toBe(2);
    expect(zoneAt(50, 60.1)).toBe(0);
  });

  it('vaut 3 en coopératif au centre', () => {
    expect(pointsFor(4, 'coop')).toBe(3);
    expect(pointsFor(4, 'teams')).toBe(4);
    expect(pointsFor(2, 'coop')).toBe(2);
  });

  it('situe le centre à gauche ou à droite de l’aiguille', () => {
    expect(sideOf(30, 50)).toBe('left');
    expect(sideOf(70, 50)).toBe('right');
  });
});

describe('une manche en équipes', () => {
  it('donne un point de départ à l’équipe qui joue en second', () => {
    const g = teamsGame();
    expect(g.scores).toEqual({ A: 0, B: 1 });
    expect(g.round.team).toBe('A');
    expect(['a1', 'a2', 'a3']).toContain(g.round.psychic);
  });

  it('suit les étapes : carte, indice, aiguille, pari, dévoilement', () => {
    const g = teamsGame();
    const r = g.round;
    expect(r.stage).toBe('pick');
    expect(r.choices).toHaveLength(2);
    expect(g.pick('b1', 0)).toMatch(/médium/);
    expect(g.pick(r.psychic, 1)).toBeUndefined();
    expect(r.stage).toBe('clue');
    expect(g.clue(r.psychic, '   ')).toMatch(/Écris/);
    expect(g.clue(r.psychic, '  Un   pingouin\n en vacances ')).toBeUndefined();
    expect(r.clue).toBe('Un pingouin en vacances');
    expect(r.stage).toBe('guess');
    expect(g.dial(r.psychic, 30)).toMatch(/médium/);
    expect(g.dial('b1', 30)).toMatch(/autre équipe/);
    const [x, y] = g.guessers();
    expect(g.dial(x, 30)).toBeUndefined();
    expect(g.agree(x, true, r.dialSeq)).toBeUndefined();
    expect(r.stage).toBe('guess');
    expect(g.agree(y, true, r.dialSeq)).toBeUndefined();
    expect(r.stage).toBe('side');
    expect(g.deciders().sort()).toEqual(['b1', 'b2']);
    g.vote('b1', 'left');
    expect(r.stage).toBe('side');
    g.vote('b2', 'right');
    expect(r.stage).toBe('side');
    g.vote('b2', 'left');
    expect(r.stage).toBe('reveal');
    expect(r.result?.side).toBe('left');
  });

  it('fait tomber les accords quand l’aiguille bouge, et refuse un accord donné sur une ancienne position', () => {
    const g = teamsGame();
    const r = g.round;
    g.pick(r.psychic, 0);
    g.clue(r.psychic, 'Indice');
    const [x, y] = g.guessers();
    g.dial(x, 20);
    const seq = r.dialSeq;
    g.agree(x, true, seq);
    expect(r.agreed.has(x)).toBe(true);
    g.dial(y, 25);
    expect(r.agreed.size).toBe(0);
    expect(g.agree(x, true, seq)).toMatch(/bouger/);
    expect(g.agree(x, true, r.dialSeq)).toBeUndefined();
    g.agree(x, false, r.dialSeq);
    expect(r.agreed.has(x)).toBe(false);
  });

  it('marque les points de la bande, et le point du pari sauf en plein centre', () => {
    const g = teamsGame();
    playRound(g, (t) => (t > 50 ? t - 5 : t + 5), 'good');
    expect(g.round.result?.zone).toBe(3);
    expect(g.round.result?.sidePoint).toBe(true);
    expect(g.scores).toEqual({ A: 3, B: 2 });

    const h = teamsGame();
    playRound(h, (t) => t, 'good');
    expect(h.round.result?.zone).toBe(4);
    expect(h.round.result?.sidePoint).toBe(false);
    expect(h.scores).toEqual({ A: 4, B: 1 });
  });

  it('passe la main à l’autre équipe, avec un nouveau médium chacun son tour', () => {
    const g = teamsGame();
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(g.round.psychic);
      expect(g.round.team).toBe(i % 2 === 0 ? 'A' : 'B');
      playRound(g, () => 0, 'bad');
      expect(g.next(g.round.psychic, g.round.seq)).toBeUndefined();
    }
    const teamA = seen.filter((_, i) => i % 2 === 0);
    expect(new Set(teamA).size).toBe(3);
    const teamB = seen.filter((_, i) => i % 2 === 1);
    expect(teamB[0]).not.toBe(teamB[1]);
    expect(teamB[0]).toBe(teamB[2]);
  });

  it('ignore un « suivant » envoyé deux fois', () => {
    const g = teamsGame();
    playRound(g, () => 0, 'bad');
    const seq = g.round.seq;
    g.next('a1', seq);
    const n = g.round.n;
    g.next('a1', seq);
    expect(g.round.n).toBe(n);
  });

  it('applique le rattrapage : plein centre et toujours derrière, l’équipe rejoue', () => {
    const g = teamsGame({ firstTeam: 'B' });
    // B joue en premier, A part avec 1 point. On amène A à 8.
    g.scores = { A: 8, B: 1 };
    playRound(g, (t) => t);
    expect(g.round.result?.catchUp).toBe(true);
    const before = g.round.psychic;
    g.next('a1', g.round.seq);
    expect(g.round.team).toBe('B');
    expect(g.round.catchUp).toBe(true);
    expect(g.round.psychic).not.toBe(before);
  });

  it('pas de rattrapage quand l’équipe passe devant', () => {
    const g = teamsGame();
    g.scores = { A: 2, B: 5 };
    playRound(g, (t) => t);
    expect(g.scores.A).toBe(6);
    expect(g.round.result?.catchUp).toBe(false);
  });

  it(`s'arrête dès qu'une équipe atteint ${WIN_SCORE}`, () => {
    const g = teamsGame();
    g.scores = { A: 8, B: 4 };
    playRound(g, (t) => (t > 50 ? t - 7 : t + 7), 'bad');
    expect(g.scores).toEqual({ A: 10, B: 4 });
    expect(g.round.result?.gameOver).toBe(true);
    expect(g.over).toEqual({ winner: 'A' });
    expect(g.next('a1', g.round.seq)).toBe('over');
  });

  it('départage une égalité par une mort subite, une manche par équipe', () => {
    const g = teamsGame();
    g.scores = { A: 8, B: 9 };
    // A marque 2, B gagne le pari : 10 partout.
    playRound(g, (t) => (t > 50 ? t - 7 : t + 7), 'good');
    expect(g.scores).toEqual({ A: 10, B: 10 });
    expect(g.over).toBeNull();
    expect(g.round.result?.suddenDeath).toBe(true);
    g.next('a1', g.round.seq);
    expect(g.round.suddenDeath).toBe(true);
    expect(g.round.team).toBe('B');
    playRound(g, () => (g.round.target > 50 ? 0 : 100), 'bad');
    expect(g.over).toBeNull();
    g.next('a1', g.round.seq);
    expect(g.round.team).toBe('A');
    playRound(g, (t) => t);
    expect(g.over).toEqual({ winner: 'A' });
  });
});

describe('le coopératif', () => {
  const members: Member[] = [
    { id: 'p1', team: 'A' },
    { id: 'p2', team: 'A' },
    { id: 'p3', team: 'B' },
  ];

  it(`dure ${COOP_CARDS} cartes, sans pari, et chacun devine avec toute la table`, () => {
    const g = new Game({ mode: 'coop', members });
    expect(g.cardsLeft).toBe(COOP_CARDS - 1);
    expect(g.round.team).toBeNull();
    expect(g.guessers()).toHaveLength(2);
    let rounds = 0;
    while (!g.over) {
      playRound(g, () => (g.round.target > 50 ? 0 : 100));
      rounds++;
      g.next('p1', g.round.seq);
    }
    expect(rounds).toBe(COOP_CARDS);
    expect(g.coopScore).toBe(0);
  });

  it('ajoute une carte et 3 points pour un tir en plein centre', () => {
    const g = new Game({ mode: 'coop', members });
    const left = g.cardsLeft;
    playRound(g, (t) => t);
    expect(g.round.result?.points).toBe(3);
    expect(g.round.result?.bonusCard).toBe(true);
    expect(g.cardsLeft).toBe(left + 1);
    expect(g.coopScore).toBe(3);
  });

  it('se joue à deux : un médium, un joueur qui règle et valide seul', () => {
    const g = new Game({ mode: 'coop', members: members.slice(0, 2) });
    playRound(g, (t) => t + 3);
    expect(g.round.result?.points).toBe(3);
  });
});

describe('les absents', () => {
  it('ne bloquent pas les accords, et le médium absent passe la main', () => {
    const away = new Set<string>();
    const g = teamsGame({ isAway: (id) => away.has(id) });
    const psychic = g.round.psychic;
    away.add(psychic);
    g.settle();
    expect(g.round.psychic).not.toBe(psychic);
    expect(g.round.team).toBe('A');
    const r = g.round;
    g.pick(r.psychic, 0);
    g.clue(r.psychic, 'Indice');
    const guessers = g.guessers().filter((id) => !away.has(id));
    expect(guessers).toHaveLength(1);
    g.agree(guessers[0], true, r.dialSeq);
    expect(r.stage).toBe('side');
    away.add('b2');
    g.vote('b1', 'right');
    expect(r.stage).toBe('reveal');
  });

  it("attendent le retour d'une équipe entièrement absente, sauf fin du temps", () => {
    const away = new Set<string>();
    let now = 0;
    const g = teamsGame({ isAway: (id) => away.has(id), sideMs: 30_000, now: () => now });
    const r = g.round;
    g.pick(r.psychic, 0);
    g.clue(r.psychic, 'Indice');
    for (const id of g.guessers()) away.add(id);
    g.settle();
    expect(r.stage).toBe('guess');
    away.clear();
    for (const id of g.guessers()) g.agree(id, true, r.dialSeq);
    expect(r.stage).toBe('side');
    g.vote('b1', 'left');
    for (const id of g.voters()) away.add(id);
    g.settle();
    expect(r.stage).toBe('side');
    now = 30_000;
    g.settle();
    expect(r.stage).toBe('reveal');
    expect(r.result?.side).toBe('left');
  });

  it('verrouille l’aiguille à la fin du temps, puis applique le pari majoritaire', () => {
    let now = 1000;
    const g = teamsGame({ guessMs: 60_000, sideMs: 30_000, now: () => now });
    const r = g.round;
    g.pick(r.psychic, 0);
    g.clue(r.psychic, 'Indice');
    expect(r.endsAt).toBe(61_000);
    now = 61_000;
    g.settle();
    expect(r.stage).toBe('side');
    g.vote('b1', 'left');
    now += 30_000;
    g.settle();
    expect(r.stage).toBe('reveal');
    expect(r.result?.side).toBe('left');
  });
});

describe('les cartes', () => {
  it('sont nombreuses, sans doublon, et lisibles sur un téléphone', () => {
    expect(SPECTRA.length).toBeGreaterThanOrEqual(180);
    const keys = new Set<string>();
    for (const s of SPECTRA) {
      for (const w of [s.left, s.right]) {
        expect(w.trim()).toBe(w);
        expect(w.length).toBeLessThanOrEqual(34);
      }
      const key = [s.left, s.right].map((w) => w.toLowerCase()).sort().join('|');
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it('ne repassent pas avant que la pioche soit épuisée, et deux autres cartes ne coûtent rien', () => {
    const deck: Spectrum[] = Array.from({ length: 12 }, (_, i) => ({ left: `G${i}`, right: `D${i}` }));
    const g = new Game({ mode: 'coop', members: [{ id: 'p1', team: 'A' }, { id: 'p2', team: 'A' }], spectra: deck });
    const first = g.round.choices;
    expect(g.redraw('p2')).toMatch(/médium/);
    expect(g.redraw(g.round.psychic)).toBeUndefined();
    expect(g.round.choices).not.toEqual(first);
    expect(g.round.choices[0]).not.toBe(g.round.choices[1]);
  });

  it('nettoient l’indice', () => {
    expect(cleanClue('  <b>Un\tchat</b>  ')).toBe('bUn chat/b');
    expect(cleanClue('x'.repeat(200))).toHaveLength(60);
    expect(cleanClue(42)).toBe('');
  });
});

describe('la table', () => {
  function room(n: number, mode: 'teams' | 'coop' = 'teams') {
    const r = new Room('TEST');
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = r.addHuman(`J${i}`, 'radio');
      if (typeof p === 'string') throw new Error(p);
      r.connect(p, `s${i}`);
      ids.push(p.id);
    }
    r.settings.mode = mode;
    return { r, ids };
  }

  it('équilibre les équipes à l’arrivée et refuse une équipe trop petite', () => {
    const { r, ids } = room(4);
    expect(r.players.map((p) => p.team)).toEqual(['A', 'B', 'A', 'B']);
    r.setTeam(ids[1], 'A');
    expect(r.start(r.hostId)).toMatch(/Lagon/);
    r.setTeam(ids[1], 'B');
    expect(r.start(r.hostId)).toBeUndefined();
  });

  it('ne montre la cible et les cartes proposées qu’au médium, puis à tous au dévoilement', () => {
    const { r, ids } = room(4);
    r.start(r.hostId);
    const g = r.game!;
    const psychic = g.round.psychic;
    const others = ids.filter((id) => id !== psychic);
    expect(r.viewFor(psychic).game!.round.choices).toHaveLength(2);
    expect(r.viewFor(psychic).game!.round.target).toBeNull();
    for (const id of others) expect(r.viewFor(id).game!.round.choices).toBeNull();
    g.pick(psychic, 0);
    expect(r.viewFor(psychic).game!.round.target).toBe(g.round.target);
    for (const id of others) {
      const json = JSON.stringify(r.viewFor(id));
      expect(r.viewFor(id).game!.round.target).toBeNull();
      expect(json).not.toContain('"token"');
    }
    g.clue(psychic, 'Indice');
    for (const id of g.guessers()) g.agree(id, true, g.round.dialSeq);
    for (const id of g.voters()) g.vote(id, 'left');
    for (const id of others) expect(r.viewFor(id).game!.round.target).toBe(g.round.target);
  });

  it('accueille un joueur en pleine partie, dans la plus petite équipe', () => {
    const { r } = room(5);
    r.start(r.hostId);
    const late = r.addHuman('Tard', 'radio');
    if (typeof late === 'string') throw new Error(late);
    expect(late.status).toBe('playing');
    expect(late.team).toBe('B');
    expect(r.game!.isMember(late.id)).toBe(true);
  });

  it('garde le silence du médium : pas de réaction pendant qu’il voit la cible', () => {
    const { r } = room(2, 'coop');
    r.start(r.hostId);
    const g = r.game!;
    expect(r.canEmote(g.round.psychic)).toBe(true);
    g.pick(g.round.psychic, 0);
    expect(r.canEmote(g.round.psychic)).toBe(false);
    expect(r.canEmote(g.guessers()[0])).toBe(true);
  });

  it('va jusqu’aux résultats et revient au salon pour la revanche', () => {
    const { r } = room(3, 'coop');
    r.start(r.hostId);
    const g = r.game!;
    while (r.phase === 'playing') {
      const round = g.round;
      g.pick(round.psychic, 0);
      g.clue(round.psychic, 'Indice');
      for (const id of g.guessers()) g.agree(id, true, round.dialSeq);
      r.next(g.guessers()[0], round.seq);
    }
    expect(r.phase).toBe('finished');
    expect(r.final?.rounds.length).toBeGreaterThanOrEqual(COOP_CARDS);
    expect(r.final?.rounds[0].psychicName).toMatch(/^J/);
    r.restart(r.hostId);
    expect(r.phase).toBe('lobby');
    expect(r.players.every((p) => p.status === 'lobby')).toBe(true);
  });
});
