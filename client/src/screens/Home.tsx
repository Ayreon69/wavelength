// Accueil : l'affiche, un cadran qui joue tout seul pour montrer le principe, pseudo + avatar, créer / rejoindre une table, règles.
import { motion } from 'framer-motion';
import { BookOpen, House, MessageSquare, LogIn, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { Dial, SpectrumCard } from '../components/Dial';
import { AVATAR_EMOJI, AVATAR_LABELS, Button, Logo, Paper } from '../components/Ui';
import { cls, reducedMotion } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

const DEMOS = [
  { spectrum: { left: 'Froid', right: 'Chaud' }, clue: 'Un café oublié sur le bureau', target: 36, guess: 38 },
  { spectrum: { left: 'Inutile', right: 'Indispensable' }, clue: 'Un tire-bouchon', target: 64, guess: 58 },
  { spectrum: { left: 'Ringard', right: 'Stylé' }, clue: 'Des chaussettes dans des sandales', target: 14, guess: 16 },
  { spectrum: { left: 'Calme', right: 'Bruyant' }, clue: 'Une bibliothèque un samedi', target: 22, guess: 30 },
];

/** Le principe en image : un indice, l'aiguille qui cherche, l'écran qui s'ouvre. */
function Demo() {
  const [i, setI] = useState(0);
  const [needle, setNeedle] = useState(50);
  const [open, setOpen] = useState(false);
  const demo = DEMOS[i];
  useEffect(() => {
    if (reducedMotion()) {
      setNeedle(demo.guess);
      setOpen(true);
      return;
    }
    const timers = [
      window.setTimeout(() => setNeedle(demo.guess), 500),
      window.setTimeout(() => setOpen(true), 2300),
      window.setTimeout(() => setOpen(false), 5200),
      window.setTimeout(() => setI((x) => (x + 1) % DEMOS.length), 6100),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [i, demo.guess]);

  return (
    <div className="demo" aria-hidden>
      <motion.p key={demo.clue} className="clue clue-demo" initial={{ y: 8 }} animate={{ y: 0 }}>
        « {demo.clue} »
      </motion.p>
      <Dial value={needle} spectrum={demo.spectrum} target={demo.target} open={open} hit={open} className="dial-demo" />
      <SpectrumCard spectrum={demo.spectrum} />
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('wl:url', sync);
    return () => window.removeEventListener('wl:url', sync);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Paper className="home">
      <div className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=wavelength">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </div>
      <div className="home-grid">
        <header className="home-hero">
          <motion.div initial={{ y: -10 }} animate={{ y: 0 }} transition={{ duration: 0.5 }}>
            <Logo size="lg" />
          </motion.div>
          <p className="tagline">
            Un indice. Un cadran. <span className="hl">Toute la table qui débat.</span>
          </p>
          <Demo />
        </header>

        <motion.section className="sheet home-panel" initial={{ y: 20 }} animate={{ y: 0 }} transition={{ delay: 0.12, duration: 0.45 }}>
          {invited && (
            <div className="invite-banner">
              Invitation à la table <b>{invited}</b> : choisis ton pseudo et rejoins !
            </div>
          )}
          <label className="field-label" htmlFor="pseudo">
            Ton pseudo
          </label>
          <input
            id="pseudo"
            className="input input-lg"
            placeholder="Ex. Fréquence"
            value={profile.name}
            maxLength={16}
            autoComplete="nickname"
            onChange={(e) => setProfile({ name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
            }}
          />
          <span className="field-label" id="avatar-label">
            Ton avatar
          </span>
          <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
            {AVATARS.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
                {AVATAR_EMOJI[a]}
              </button>
            ))}
          </div>

          {invited ? (
            <div className="home-actions">
              <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
                {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  window.history.replaceState(null, '', '/');
                  setInvited(null);
                }}
              >
                Créer ma propre table à la place
              </Button>
            </div>
          ) : (
            <div className="home-actions">
              <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
                {busy === 'create' ? 'Création…' : 'Créer une table'}
              </Button>
              <div className="or">
                <span>ou</span>
              </div>
              <div className="join-row">
                <input
                  className="input code-input"
                  placeholder="CODE"
                  value={cleanCode}
                  maxLength={4}
                  aria-label="Code de la table"
                  autoCapitalize="characters"
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                  }}
                />
                <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                  Rejoindre
                </Button>
              </div>
            </div>
          )}
          <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
            Les règles en 2 minutes
          </Button>
          <p className="home-note">De 2 à 12 joueurs, en équipes ou tous ensemble. Mieux à plusieurs, avec un appel vocal ou dans la même pièce : tout le sel est dans le débat.</p>
          {conn !== 'online' && (
            <p className="wake-note" role="status">
              <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
            </p>
          )}
        </motion.section>
      </div>

      <footer className="home-foot">
        D'après <i>Wavelength</i>, le jeu de Wolfgang Warsch, Alex Hague et Justin Vickers. Création de fans, non officielle.
      </footer>
    </Paper>
  );
}
