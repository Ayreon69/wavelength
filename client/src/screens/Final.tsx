// Fin de partie : le vainqueur ou l'appréciation, des confettis, et toutes les manches rejouées en miniature.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { TEAMS, TEAM_NAME, type FinalView, type RoomView } from '../../../shared/protocol';
import { Dial, SpectrumCard } from '../components/Dial';
import { Avatar, Button, Logo, Paper, TeamTag } from '../components/Ui';
import { sfx } from '../lib/sound';
import { coopRating } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

const TEAM_HEX = { A: '#ff6047', B: '#0e9a94' };
const RISO = ['#ff4f7b', '#ffcb3d', '#2f5bd3', '#ff8a2b', '#0e9a94'];

function useFinale(final: FinalView, me: string) {
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const mine = final.players.find((p) => p.id === me)?.team;
    const win = final.mode === 'coop' ? final.coopScore >= 16 : final.winner === mine;
    sfx.finale(win);
    if (reducedMotion() || (final.mode === 'coop' && final.coopScore < 10)) return;
    const colors = final.mode === 'teams' && final.winner ? [TEAM_HEX[final.winner], '#fbf7ef', '#1f1b3d'] : RISO;
    const t = window.setTimeout(() => {
      void confetti({ particleCount: 140, spread: 100, origin: { y: 0.25 }, colors, gravity: 0.7, scalar: 0.9, disableForReducedMotion: true });
    }, 250);
    return () => window.clearTimeout(t);
  }, [final, me]);
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  useFinale(final, view.me);
  const rating = coopRating(final.coopScore);
  const avatarOf = (id: string) => final.players.find((p) => p.id === id)?.avatar ?? 'radio';

  return (
    <Paper className="is-quiet">
      <div className="final">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className={cls('final-hero', final.winner && `is-${final.winner}`)} initial={{ y: 16 }} animate={{ y: 0 }} transition={{ duration: 0.5 }}>
          {final.mode === 'teams' ? (
            <>
              <span className="eyebrow">Fin de partie</span>
              <h1 className="final-title">{final.winner ? `${TEAM_NAME[final.winner]} l'emporte !` : 'Partie terminée'}</h1>
              <div className="final-scores">
                {TEAMS.map((t) => (
                  <div key={t} className={cls('final-score', `is-${t}`, final.winner === t && 'is-win')}>
                    <span>{TEAM_NAME[t]}</span>
                    <motion.b initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 14 }}>
                      {final.scores[t]}
                    </motion.b>
                    <span className="final-members">
                      {final.players
                        .filter((p) => p.team === t)
                        .map((p) => (
                          <Avatar key={p.id} avatar={p.avatar} className="mini" />
                        ))}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <span className="eyebrow">Score de la table</span>
              <motion.b className="final-big" initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 14 }}>
                {final.coopScore}
              </motion.b>
              <h1 className="final-title">{rating.title}</h1>
              <p className="final-text">{rating.text}</p>
            </>
          )}
        </motion.section>

        <section className="sheet recap">
          <h3>Les manches</h3>
          <ol className="recap-list">
            {final.rounds.map((r, i) => (
              <motion.li key={r.n} className={cls('recap-item', `is-z${r.zone}`)} initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: 0.2 + Math.min(i, 10) * 0.05 }}>
                <div className="recap-dial">
                  <Dial value={r.dial} target={r.target} open spectrum={r.spectrum} size="sm" hit />
                </div>
                <div className="recap-body">
                  <div className="recap-meta">
                    <Avatar avatar={avatarOf(r.psychicId)} className="mini" />
                    <span>{r.psychicName}</span>
                    {r.team && final.mode === 'teams' && <TeamTag team={r.team} />}
                    <b className="recap-points">{r.points ? `+${r.points}` : '0'}</b>
                  </div>
                  <p className="recap-clue">« {r.clue} »</p>
                  {r.side && (
                    <p className="recap-side">
                      Pari {r.side === 'left' ? <ArrowLeft size={13} aria-label="à gauche" /> : <ArrowRight size={13} aria-label="à droite" />} {r.sidePoint ? 'gagné' : r.zone === 4 ? 'annulé par le plein centre' : 'perdu'}
                    </p>
                  )}
                </div>
                <div className="recap-spec">
                  <SpectrumCard spectrum={r.spectrum} size="sm" />
                </div>
              </motion.li>
            ))}
          </ol>
        </section>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Rejouer
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente de la revanche…
            </div>
          )}
        </div>
      </div>
    </Paper>
  );
}
