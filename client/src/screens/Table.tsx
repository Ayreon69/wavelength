// La table : le score en haut, les joueurs, l'indice, le cadran et la carte au centre, et en bas ce qu'il y a à faire.
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BookOpen, Check, Eye, Flag, LogOut, MoreHorizontal, RefreshCw, Send, Smile, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CLUE_MAX, EMOTES, TAUNTS, TEAMS, TEAM_NAME, WIN_SCORE, type PlayerView, type RoomView, type RoundView, type Side } from '../../../shared/protocol';
import { Dial, SpectrumCard } from '../components/Dial';
import { Avatar, Button, Logo, Modal, TeamTag, Waves } from '../components/Ui';
import { sfx } from '../lib/sound';
import { NameOf, ZONE_TITLE, nameOf, pointsLabel, teamName } from '../lib/text';
import { cls, plural, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore } from '../store';

// ───────────────────────────── L'aiguille ─────────────────────────────

/**
 * La position affichée : la sienne pendant qu'on la tourne, sinon la plus fraîche reçue du serveur.
 * Les mouvements partent par petits paquets, et le dernier toujours.
 */
function useNeedle(r: RoundView) {
  const live = useStore((s) => s.liveDial);
  const [local, setLocal] = useState<number | null>(null);
  const lastSent = useRef(0);
  const trailing = useRef<number | undefined>(undefined);
  const release = useRef<number | undefined>(undefined);
  const lastNotch = useRef<number | null>(null);

  useEffect(() => {
    setLocal(null);
    lastNotch.current = null;
  }, [r.n, r.stage]);
  useEffect(
    () => () => {
      window.clearTimeout(trailing.current);
      window.clearTimeout(release.current);
    },
    [],
  );

  const remote = live && live.n === r.n && live.seq > r.dialSeq ? live : null;
  const value = local ?? (remote ? remote.v : r.dial);

  const move = (v: number, final: boolean) => {
    window.clearTimeout(release.current);
    setLocal(v);
    const notch = Math.round(v / 2.5);
    if (lastNotch.current !== null && notch !== lastNotch.current) sfx.tick();
    lastNotch.current = notch;
    const emit = () => {
      lastSent.current = performance.now();
      socket.emit('game:dial', { value: v, final });
    };
    window.clearTimeout(trailing.current);
    if (final) {
      emit();
      // On garde sa position le temps que le serveur la renvoie, sans à-coup.
      release.current = window.setTimeout(() => setLocal(null), 700);
    } else if (performance.now() - lastSent.current > 50) emit();
    else trailing.current = window.setTimeout(emit, 50);
  };

  const mover = remote && Date.now() - remote.at < 1600 ? remote.by : null;
  return { value, move, dragging: local !== null, mover };
}

// ───────────────────────────── Sons et vibrations ─────────────────────────────

function useStageEffects(view: RoomView) {
  const r = view.game!.round;
  const prev = useRef<{ n: number; stage: string; agreed: number } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = { n: r.n, stage: r.stage, agreed: r.agreed.length };
    if (!p) return;
    if (p.n === r.n && p.stage === r.stage) {
      if (r.agreed.length > p.agreed) sfx.pop();
      return;
    }
    if (r.stage === 'pick' && r.psychicId === view.me) {
      sfx.turn();
      vibrate([30, 60, 30]);
    } else if (r.stage === 'clue' && r.psychicId === view.me) sfx.sweep();
    else if (r.stage === 'guess') sfx.clue();
    else if (r.stage === 'side') {
      sfx.lock();
      vibrate(20);
    } else if (r.stage === 'reveal' && r.result) {
      const res = r.result;
      if (p.stage === 'guess') sfx.lock();
      sfx.sweep();
      const t1 = window.setTimeout(() => {
        sfx.score(res.points);
        vibrate(res.zone === 4 ? [40, 50, 40, 50, 80] : res.points ? 40 : [80, 60, 80]);
      }, 950);
      const t2 = res.side ? window.setTimeout(() => sfx.side(res.sidePoint), 1700) : 0;
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
  }, [r.n, r.stage, r.agreed.length, r.psychicId, r.result, view.me]);
}

// ───────────────────────────── Haut de table ─────────────────────────────

function Scoreboard({ view }: { view: RoomView }) {
  const g = view.game!;
  if (g.mode === 'coop') {
    return (
      <div className="scoreboard is-coop">
        <div className="score-box">
          <span className="score-label">Score</span>
          <b className="score-num">{g.coopScore}</b>
        </div>
        <div className="score-box is-cards" title="Cartes restantes après celle-ci">
          <span className="score-label">Cartes</span>
          <b className="score-num">{g.cardsLeft}</b>
        </div>
      </div>
    );
  }
  return (
    <div className="scoreboard">
      {TEAMS.map((t) => (
        <div key={t} className={cls('score-box', `is-${t}`, g.round.team === t && 'is-active')} aria-label={`${TEAM_NAME[t]} : ${g.scores[t]} points`}>
          <span className="score-label">{TEAM_NAME[t]}</span>
          <motion.b key={g.scores[t]} className="score-num" initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            {g.scores[t]}
          </motion.b>
          <span className="score-track" aria-hidden>
            <span style={{ width: `${Math.min(100, (g.scores[t] / WIN_SCORE) * 100)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function TimerBar({ endsAt, total }: { endsAt: number; total: number }) {
  const now = useTick(250);
  if (!endsAt) return null;
  const left = Math.max(0, endsAt - now);
  return (
    <div className={cls('timer', left < 10_000 && 'is-low')} role="timer" aria-label={`${Math.ceil(left / 1000)} secondes`}>
      <span style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
      <b>{Math.ceil(left / 1000)} s</b>
    </div>
  );
}

function Seat({ p, view, r }: { p: PlayerView; view: RoomView; r: RoundView }) {
  const emotes = useStore((s) => s.emotes).filter((e) => e.playerId === p.id);
  const psychic = r.psychicId === p.id;
  const agreed = r.stage === 'guess' && r.agreed.includes(p.id);
  const vote = r.stage === 'side' ? r.votes[p.id] : undefined;
  const waiting = r.deciders.includes(p.id) && !agreed && !vote;
  return (
    <li className={cls('seat', psychic && 'is-psychic', p.away && 'is-away', p.id === view.me && 'is-me', waiting && 'is-waiting')}>
      <span className="seat-avatar">
        <Avatar avatar={p.avatar} team={view.game!.mode === 'teams' ? p.team : null} />
        {psychic && (
          <span className="seat-badge is-psychic" title="Médium">
            <Eye size={11} strokeWidth={3} aria-hidden />
          </span>
        )}
        {agreed && (
          <span className="seat-badge is-ok" title="D'accord">
            <Check size={11} strokeWidth={3.5} aria-hidden />
          </span>
        )}
        {vote && (
          <span className="seat-badge is-vote" title={vote === 'left' ? 'À gauche' : 'À droite'}>
            {vote === 'left' ? <ArrowLeft size={11} strokeWidth={3} aria-hidden /> : <ArrowRight size={11} strokeWidth={3} aria-hidden />}
          </span>
        )}
      </span>
      <span className="seat-name">{p.id === view.me ? 'Toi' : p.name}</span>
      <span className="sr-only">
        {psychic ? ', médium' : ''}
        {agreed ? ", d'accord" : ''}
        {p.away ? ', absent' : ''}
      </span>
      <AnimatePresence>
        {emotes.slice(-1).map((e) => (
          <motion.span key={e.id} className={cls('emote', e.emoji.length > 3 && 'is-text')} initial={{ y: 6, scale: 0.6 }} animate={{ y: 0, scale: 1 }} exit={{ opacity: 0 }}>
            {e.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </li>
  );
}

function Seats({ view }: { view: RoomView }) {
  const g = view.game!;
  const r = g.round;
  const playing = view.players.filter((p) => p.status === 'playing');
  if (g.mode === 'coop') {
    return (
      <ul className="seats">
        {playing.map((p) => (
          <Seat key={p.id} p={p} view={view} r={r} />
        ))}
      </ul>
    );
  }
  return (
    <div className="seats-teams">
      {TEAMS.map((t) => (
        <ul key={t} className={cls('seats', `is-${t}`, r.team === t && 'is-active')} aria-label={TEAM_NAME[t]}>
          {playing
            .filter((p) => p.team === t)
            .map((p) => (
              <Seat key={p.id} p={p} view={view} r={r} />
            ))}
        </ul>
      ))}
    </div>
  );
}

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" role="menu" aria-label="Réactions" initial={{ y: -6 }} animate={{ y: 0 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" role="menuitem" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" role="menuitem" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ───────────────────────────── Ce qu'il y a à faire ─────────────────────────────

function Waiting({ children }: { children: ReactNode }) {
  return (
    <p className="panel-wait" role="status">
      <span className="dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {children}
    </p>
  );
}

function PickPanel({ r }: { r: RoundView }) {
  return (
    <div className="panel-pick">
      <p className="panel-lead">
        <b>Tu es le médium !</b> Choisis ta carte. Tu découvriras la cible juste après.
      </p>
      <div className="choices">
        {(r.choices ?? []).map((c, i) => (
          <motion.button key={`${c.left}-${c.right}`} type="button" className="choice" onClick={() => void send('game:pick', { index: i })} initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: i * 0.06 }}>
            <SpectrumCard spectrum={c} size="sm" />
            <span className="choice-cta">Choisir</span>
          </motion.button>
        ))}
      </div>
      <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={() => void send('game:redraw')}>
        Deux autres cartes
      </Button>
    </div>
  );
}

function CluePanel() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const clean = text.replace(/\s+/g, ' ').trim();
  const submit = async () => {
    if (!clean || busy) return;
    setBusy(true);
    await send('game:clue', { text: clean });
    setBusy(false);
  };
  return (
    <form
      className="panel-clue"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="panel-lead">
        <b>Voici la cible.</b> Quel indice tombe pile à cet endroit, entre ces deux idées ?
      </p>
      <div className="clue-input-row">
        <input className="input clue-input" value={text} maxLength={CLUE_MAX} placeholder="Ton indice…" aria-label="Ton indice" autoFocus enterKeyHint="send" onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="primary" icon={<Send size={18} />} disabled={!clean || busy} aria-label="Envoyer l'indice">
          Envoyer
        </Button>
      </div>
      <ul className="clue-tips" aria-label="Rappels">
        <li>Une seule idée</li>
        <li>Pas de chiffres</li>
        <li>Ni les mots de la carte</li>
      </ul>
    </form>
  );
}

/** Les accords : qui a validé, qui on attend, et le bouton. */
function AgreePanel({ view, r, canAct }: { view: RoomView; r: RoundView; canAct: boolean }) {
  const deciders = r.deciders;
  const agreed = deciders.filter((id) => r.agreed.includes(id));
  const mine = r.agreed.includes(view.me);
  const missing = deciders.filter((id) => !r.agreed.includes(id) && id !== view.me);
  const team = r.team ? TEAM_NAME[r.team] : 'La table';
  return (
    <div className="panel-agree">
      {canAct ? (
        <p className="panel-lead">
          {deciders.length > 1 ? (
            <>
              <b>Tournez l'aiguille</b> sur l'indice de {nameOf(view, r.psychicId)}. Quand tout le monde a validé la même position, elle se verrouille.
            </>
          ) : (
            <>
              <b>Tourne l'aiguille</b> sur l'indice de {nameOf(view, r.psychicId)}, puis valide.
            </>
          )}
        </p>
      ) : r.psychicId === view.me ? (
        <p className="panel-lead">
          <b>Silence radio !</b> Ton équipe cherche. Pas un mot, pas une grimace.
        </p>
      ) : (
        <p className="panel-lead">
          <b>{team}</b> règle l'aiguille.{r.team && view.game!.mode === 'teams' ? ' Préparez votre pari : gauche ou droite ?' : ''}
        </p>
      )}
      <TimerBar endsAt={r.endsAt} total={view.settings.timer * 1000} />
      {canAct && (
        <Button
          variant={mine ? 'default' : 'primary'}
          className={cls('btn-lg btn-wide', mine && 'is-agreed')}
          icon={<Check size={20} />}
          onClick={() => void send('game:agree', { agree: !mine, dialSeq: r.dialSeq })}
        >
          {mine
            ? missing.length
              ? `D'accord · on attend ${missing.map((id) => nameOf(view, id)).join(', ')}`
              : "D'accord"
            : deciders.length > 1
              ? `Valider cette position (${agreed.length}/${deciders.length})`
              : 'Valider cette position'}
        </Button>
      )}
      {!canAct && deciders.length > 1 && (
        <p className="panel-progress">
          {agreed.length}/{deciders.length} d'accord
        </p>
      )}
    </div>
  );
}

function SidePanel({ view, r, canAct }: { view: RoomView; r: RoundView; canAct: boolean }) {
  const other = r.team === 'A' ? 'B' : 'A';
  const my = r.votes[view.me];
  const voters = (s: Side) => r.deciders.filter((id) => r.votes[id] === s);
  const choose = (s: Side) => void send('game:vote', { side: my === s ? null : s });
  return (
    <div className="panel-side">
      <p className="panel-lead">
        {canAct ? (
          <>
            <b>À vous de parier !</b> Le centre de la cible est-il à gauche ou à droite de l'aiguille ?
          </>
        ) : (
          <>
            <b>{TEAM_NAME[other]}</b> parie : le centre de la cible, à gauche ou à droite de l'aiguille ?
          </>
        )}
      </p>
      <TimerBar endsAt={r.endsAt} total={30_000} />
      <div className="side-buttons">
        {(['left', 'right'] as Side[]).map((s) => (
          <button key={s} type="button" className={cls('side-btn', `is-${s}`, my === s && 'is-on')} disabled={!canAct} onClick={() => choose(s)} aria-pressed={my === s}>
            <span className="side-arrow" aria-hidden>
              {s === 'left' ? <ArrowLeft size={26} strokeWidth={2.6} /> : <ArrowRight size={26} strokeWidth={2.6} />}
            </span>
            <b>{s === 'left' ? 'À gauche' : 'À droite'}</b>
            <span className="side-voters">
              {voters(s).map((id) => {
                const p = view.players.find((x) => x.id === id);
                return p ? <Avatar key={id} avatar={p.avatar} className="mini" /> : null;
              })}
            </span>
          </button>
        ))}
      </div>
      {canAct && r.deciders.length > 1 && <p className="panel-progress">Tout le monde doit choisir le même côté.</p>}
    </div>
  );
}

function RevealPanel({ view, r }: { view: RoomView; r: RoundView }) {
  const res = r.result!;
  const g = view.game!;
  const me = view.players.find((p) => p.id === view.me);
  const canNext = me?.status === 'playing';
  const other = r.team === 'A' ? 'B' : r.team === 'B' ? 'A' : null;
  const notes: string[] = [];
  if (res.side && other) {
    const side = res.side === 'left' ? 'à gauche' : 'à droite';
    if (res.zone === 4) notes.push(`${TEAM_NAME[other]} pariait ${side}, mais le plein centre ne laisse rien.`);
    else notes.push(`${TEAM_NAME[other]} pariait ${side} : ${res.sidePoint ? 'bien vu, +1 point.' : 'raté.'}`);
  } else if (other && g.mode === 'teams') notes.push(`${TEAM_NAME[other]} n'a pas parié.`);
  if (res.bonusCard) notes.push('Plein centre : une carte de plus !');
  if (res.catchUp && r.team) notes.push(`Rattrapage ! ${TEAM_NAME[r.team]} fait mouche et reste derrière : elle rejoue tout de suite.`);
  if (res.suddenDeath) notes.push('Égalité au-delà de 10 : mort subite ! Chaque équipe rejoue une manche, la meilleure gagne.');
  let over = '';
  if (res.gameOver) over = g.mode === 'coop' ? 'Plus de cartes : la partie est finie !' : `${teamName(g.scores.A > g.scores.B ? 'A' : 'B')} l'emporte !`;

  return (
    <div className="panel-reveal">
      <motion.div className={cls('verdict', `is-z${res.zone}`)} initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: -3, opacity: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 14 }}>
        <b>{ZONE_TITLE[res.zone]}</b>
        <span>
          {pointsLabel(res.points)}
          {r.team && g.mode === 'teams' ? ` pour ${TEAM_NAME[r.team]}` : ''}
        </span>
      </motion.div>
      {notes.map((n) => (
        <motion.p key={n} className="reveal-note" initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.5 }}>
          {n}
        </motion.p>
      ))}
      {over && <p className="reveal-over">{over}</p>}
      {canNext ? (
        <Button variant="primary" className="btn-lg btn-wide" onClick={() => void send('game:next', { seq: r.seq })}>
          {res.gameOver ? 'Voir les résultats' : 'Manche suivante'}
        </Button>
      ) : (
        <Waiting>La manche suivante arrive…</Waiting>
      )}
    </div>
  );
}

// ───────────────────────────── La table ─────────────────────────────

function headline(view: RoomView, r: RoundView): string {
  const psychic = r.psychicId === view.me;
  const who = NameOf(view, r.psychicId);
  switch (r.stage) {
    case 'pick':
      return psychic ? 'À toi d’être le médium' : `${who} choisit une carte…`;
    case 'clue':
      return psychic ? 'Toi seul vois la cible' : `${who} cherche un indice…`;
    case 'guess':
      return `L'indice de ${nameOf(view, r.psychicId)}`;
    case 'side':
      return 'Gauche ou droite ?';
    default:
      return 'Dévoilement';
  }
}

export function Table({ view }: { view: RoomView }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [react, setReact] = useState(false);
  useTick(400);
  useStageEffects(view);
  const g = view.game!;
  const r = g.round;
  const needle = useNeedle(r);

  const me = view.players.find((p) => p.id === view.me);
  const member = me?.status === 'playing';
  const isPsychic = r.psychicId === view.me;
  const isHost = view.hostId === view.me;
  const onActiveTeam = r.team === null || me?.team === r.team;
  const canGuess = r.stage === 'guess' && !!member && !isPsychic && onActiveTeam;
  const canVote = r.stage === 'side' && !!member && !onActiveTeam;
  const silent = isPsychic && (r.stage === 'clue' || r.stage === 'guess' || r.stage === 'side');
  const mover = needle.mover && needle.mover !== view.me ? view.players.find((p) => p.id === needle.mover) : null;
  const open = r.target !== null && r.stage !== 'pick';

  useEffect(() => {
    if (silent) setReact(false);
  }, [silent]);

  return (
    <div className={cls('table-screen', `stage-${r.stage}`, isPsychic && 'is-psychic', canGuess && 'can-guess')}>
      <Waves />
      <header className="table-top">
        <span className="table-logo">
          <Logo size="sm" />
        </span>
        <Scoreboard view={view} />
        <div className="table-tools">
          <button type="button" className="icon-btn" aria-label="Les règles" onClick={() => setRulesOpen(true)}>
            <BookOpen size={20} />
          </button>
          <button
            type="button"
            className={cls('icon-btn', react && 'is-on')}
            aria-label={silent ? 'Le médium garde le silence' : 'Réagir'}
            title={silent ? 'Le médium garde le silence' : undefined}
            aria-expanded={react}
            disabled={silent}
            onClick={() => setReact((x) => !x)}
          >
            <Smile size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
        {react && <ReactionTray onClose={() => setReact(false)} />}
      </header>

      <Seats view={view} />

      <main className="stage">
        <div className="round-head">
          <span className="round-n">Manche {r.n}</span>
          {r.team && g.mode === 'teams' && <TeamTag team={r.team} />}
          {r.catchUp && <span className="flag">Rattrapage</span>}
          {r.suddenDeath && <span className="flag is-hot">Mort subite</span>}
          <span className="round-title">{headline(view, r)}</span>
        </div>

        <div className="clue-zone">
          <AnimatePresence mode="wait">
            {r.clue ? (
              <motion.p key={`clue-${r.n}`} className="clue" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
                « {r.clue} »
              </motion.p>
            ) : (
              <motion.p key={`wait-${r.n}`} className="clue is-pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {r.stage === 'pick' ? 'Une carte, deux idées…' : isPsychic ? 'Ton indice apparaîtra ici' : 'L’indice arrive…'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="dial-wrap">
          <Dial
            key={r.n}
            value={needle.value}
            spectrum={r.spectrum}
            target={r.target}
            open={open}
            interactive={canGuess}
            onChange={needle.move}
            smooth={!needle.dragging}
            locked={r.stage === 'side' || r.stage === 'reveal'}
            hit={r.stage === 'reveal'}
          />
          {mover && r.stage === 'guess' && (
            <span className="mover" aria-live="off">
              <Avatar avatar={mover.avatar} className="mini" /> {mover.name} tourne l'aiguille
            </span>
          )}
          {canGuess && !needle.dragging && r.dialSeq === 0 && <span className="drag-hint">Fais glisser l'aiguille</span>}
        </div>
        <SpectrumCard spectrum={r.spectrum} />
      </main>

      <section className={cls('panel', `panel-${r.stage}`)} aria-live="polite">
        {r.stage === 'pick' && (isPsychic ? <PickPanel r={r} /> : <Waiting>{NameOf(view, r.psychicId)} choisit sa carte. Patience…</Waiting>)}
        {r.stage === 'clue' && (isPsychic ? <CluePanel /> : <Waiting>{NameOf(view, r.psychicId)} a vu la cible et cherche son indice.</Waiting>)}
        {r.stage === 'guess' && <AgreePanel view={view} r={r} canAct={canGuess} />}
        {r.stage === 'side' && <SidePanel view={view} r={r} canAct={canVote} />}
        {r.stage === 'reveal' && r.result && <RevealPanel view={view} r={r} />}
        {!member && r.stage !== 'reveal' && <p className="spectator-note">Tu regardes la partie : tu joueras à la prochaine.</p>}
      </section>

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <p className="muted small">
            Table <b>{view.code}</b> · {plural(view.players.filter((p) => p.status === 'playing').length, 'joueur')}
          </p>
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son : {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:end');
              }}
            >
              {confirmStop ? 'Confirmer : arrêter pour tout le monde' : 'Arrêter la partie'}
            </Button>
          )}
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}

