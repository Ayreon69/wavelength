// Salon : partage de la table, mode de jeu, équipes, chrono et lancement.
import { motion } from 'framer-motion';
import { ArrowLeftRight, BookOpen, Check, Copy, Crown, LogOut, Play, QrCode, Share2, Shuffle, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, TEAMS, TEAM_MIN, TEAM_NAME, TIMER_OPTIONS, type Mode, type PlayerView, type RoomView, type TeamId, type TimerSetting } from '../../../shared/protocol';
import { Avatar, Button, Logo, Modal, Paper, Pill, Segmented } from '../components/Ui';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

function PlayerRow({ p, view, i }: { p: PlayerView; view: RoomView; i: number }) {
  const isHost = view.hostId === view.me;
  return (
    <motion.li className={cls('player-row', p.id === view.me && 'is-me')} initial={{ x: -8 }} animate={{ x: 0 }} transition={{ delay: i * 0.03 }}>
      <Avatar avatar={p.avatar} className="player-avatar" />
      <span className="player-name">
        {p.name}
        {p.id === view.me && <span className="muted"> (toi)</span>}
      </span>
      {p.isHost && (
        <Pill tone="ink">
          <Crown size={12} aria-hidden /> Hôte
        </Pill>
      )}
      {!p.connected && <Pill>Hors ligne</Pill>}
      {isHost && p.id !== view.me && (
        <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
          <UserX size={18} />
        </button>
      )}
    </motion.li>
  );
}

function startProblem(mode: Mode, seated: PlayerView[]): string | null {
  if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs`;
  if (mode === 'teams') {
    if (seated.length < TEAM_MIN * 2) return `Il faut ${TEAM_MIN * 2} joueurs pour jouer en équipes`;
    for (const t of TEAMS) if (seated.filter((p) => p.team === t).length < TEAM_MIN) return `${TEAM_NAME[t]} doit compter ${TEAM_MIN} joueurs`;
  }
  return null;
}

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const me = view.players.find((p) => p.id === view.me);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);
  const mode = view.settings.mode;
  const problem = startProblem(mode, seated);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Wavelength', text: `Rejoins ma table de Wavelength (code ${view.code}) !`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <Paper className="is-quiet">
      <div className="lobby">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="code-panel" initial={{ y: 10 }} animate={{ y: 0 }}>
          <span className="eyebrow">Code de la table</span>
          <div className="big-code" aria-label={`Code ${view.code.split('').join(' ')}`}>
            {view.code.split('').map((c, i) => (
              <motion.span key={i} initial={{ y: -16, rotate: 0 }} animate={{ y: 0, rotate: [-3, 2, -2, 3][i] }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 16 }}>
                {c}
              </motion.span>
            ))}
          </div>
          <div className="share-row">
            <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
              Inviter des amis
            </Button>
            <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
              {copied ? 'Lien copié !' : 'Copier le lien'}
            </Button>
            <Button icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="Afficher le QR code">
              QR
            </Button>
          </div>
        </motion.section>

        <section className="sheet">
          <div className="sheet-head">
            <h3>Mode de jeu</h3>
            {!isHost && <span className="muted small">choisi par {host?.name ?? "l'hôte"}</span>}
          </div>
          <Segmented<Mode>
            label="Mode de jeu"
            value={mode}
            disabled={!isHost}
            onChange={(m) => void send('room:settings', { mode: m })}
            options={[
              { value: 'teams', label: 'En équipes', sub: 'de 4 à 12 · Corail contre Lagon' },
              { value: 'coop', label: 'Tous ensemble', sub: 'de 2 à 12 · coopératif' },
            ]}
          />
        </section>

        <section className="sheet">
          <div className="sheet-head">
            <h3>
              Joueurs <span className="muted">{seated.length}/{MAX_PLAYERS}</span>
            </h3>
            {isHost && mode === 'teams' && seated.length >= 2 && (
              <Button variant="ghost" icon={<Shuffle size={18} />} onClick={() => void send('room:shuffle')}>
                Mélanger
              </Button>
            )}
          </div>
          {mode === 'teams' ? (
            <div className="teams">
              {TEAMS.map((t: TeamId) => {
                const members = seated.filter((p) => p.team === t);
                const mine = me?.team === t && me.status !== 'spectator';
                return (
                  <div key={t} className={cls('team-col', `is-${t}`, mine && 'is-mine')}>
                    <div className="team-head">
                      <span className="team-name">{TEAM_NAME[t]}</span>
                      <span className="team-count">{members.length}</span>
                    </div>
                    <ul className="player-list">
                      {members.map((p, i) => (
                        <PlayerRow key={p.id} p={p} view={view} i={i} />
                      ))}
                      {members.length < TEAM_MIN &&
                        Array.from({ length: TEAM_MIN - members.length }, (_, i) => (
                          <li key={`empty${i}`} className="player-row is-empty">
                            <span className="player-ghost">?</span>
                            <span className="player-name muted">Il manque quelqu'un</span>
                          </li>
                        ))}
                    </ul>
                    {!mine && me && me.status !== 'spectator' && (
                      <Button className="team-join" icon={<ArrowLeftRight size={16} />} onClick={() => void send('room:team', { team: t })}>
                        Passer chez {TEAM_NAME[t]}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="player-list">
              {seated.map((p, i) => (
                <PlayerRow key={p.id} p={p} view={view} i={i} />
              ))}
              {seated.length < MIN_PLAYERS && (
                <li className="player-row is-empty">
                  <span className="player-ghost">?</span>
                  <span className="player-name muted">En attente d'un joueur…</span>
                </li>
              )}
            </ul>
          )}
          {spectators.length > 0 && <p className="muted small">Spectateurs : {spectators.map((p) => p.name).join(', ')}</p>}
        </section>

        <section className="sheet">
          <div className="sheet-head">
            <h3>Chrono</h3>
          </div>
          <Segmented<TimerSetting>
            label="Temps pour régler l'aiguille"
            value={view.settings.timer}
            disabled={!isHost}
            onChange={(timer) => void send('room:settings', { timer })}
            options={TIMER_OPTIONS.map((t) => ({ value: t, label: t === 0 ? 'Sans limite' : `${t / 60} min` }))}
          />
          <p className="muted small lobby-note">{view.settings.timer ? "Le temps écoulé, l'aiguille se verrouille où elle est. L'autre équipe a ensuite 30 secondes pour parier." : 'On prend le temps de débattre. Le médium, lui, prend tout son temps pour trouver son indice.'}</p>
        </section>

        <div className="lobby-cta">
          {isHost ? (
            <>
              <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={!!problem} onClick={() => void send('game:start')}>
                {problem ?? `Lancer la partie (${seated.length} joueurs)`}
              </Button>
              {problem && mode === 'teams' && seated.length >= MIN_PLAYERS && seated.length < TEAM_MIN * 2 && (
                <Button variant="ghost" onClick={() => void send('room:settings', { mode: 'coop' })}>
                  Jouer tous ensemble à la place
                </Button>
              )}
            </>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente que {host?.name ?? "l'hôte"} lance la partie…
            </div>
          )}
          <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
            Nouveau ? Les règles en 2 minutes
          </Button>
        </div>

        <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
          <div className="qr-box">
            <QRCodeSVG value={url} size={220} bgColor="#fbf7ef" fgColor="#1f1b3d" level="M" includeMargin />
            <p className="muted small">Scanne pour rejoindre la table directement.</p>
            <code className="url-code">{url}</code>
          </div>
        </Modal>
      </div>
    </Paper>
  );
}
