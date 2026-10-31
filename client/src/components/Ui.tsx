// Briques d'interface communes : boutons, fenêtres, pastilles, sélecteurs, logo, avatars et décor d'affiche risographiée.
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TEAM_NAME, type TeamId } from '../../../shared/protocol';
import { cls } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'pink';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

/** Le nom imprimé en deux passages, l'un un peu décalé de l'autre, comme sur une affiche risographiée. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Wavelength">
      <svg className="logo-dial" viewBox="0 0 40 24" aria-hidden>
        <path d="M2 22a18 18 0 0 1 36 0Z" className="logo-dial-face" />
        <path d="M20 22L14.4 6.3A18 18 0 0 1 23.1 4.3Z" className="logo-dial-hit" />
        <path d="M20 22L28.5 7.5" className="logo-dial-needle" />
      </svg>
      <span className="logo-word" data-text="Wavelength" aria-hidden>
        Wavelength
      </span>
    </div>
  );
}

/** Les ondes : des arcs concentriques imprimés en rose et en bleu, qui se chevauchent dans les coins. */
export function Waves() {
  return (
    <div className="paper-waves" aria-hidden>
      <svg className="wave-a" viewBox="0 0 600 600">
        {[60, 110, 160, 210, 260, 300].map((r) => (
          <circle key={r} cx="300" cy="300" r={r} />
        ))}
      </svg>
      <svg className="wave-b" viewBox="0 0 600 600">
        {[50, 95, 140, 185, 230, 275].map((r) => (
          <circle key={r} cx="300" cy="300" r={r} />
        ))}
      </svg>
    </div>
  );
}

/** Le papier de l'affiche, avec ses ondes. */
export function Paper({ children, className, waves = true }: { children: ReactNode; className?: string; waves?: boolean }) {
  return (
    <div className={cls('paper', className)}>
      {waves && <Waves />}
      <div className="paper-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'ink' | 'pink' | 'blue' | 'A' | 'B'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

export function TeamTag({ team, className }: { team: TeamId; className?: string }) {
  return <span className={cls('team-tag', `is-${team}`, className)}>{TEAM_NAME[team]}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || o.disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/**
 * Une fenêtre. Elle s'ouvre avec un petit mouvement en CSS, dont l'état final est l'état de repos,
 * et se ferme d'un coup : aucune animation de sortie dont dépendrait l'affichage suivant.
 */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    // Le focus entre dans la fenêtre, et revient d'où il venait à la fermeture.
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus], .modal-body button, .modal-body input')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  // Rendue à la racine du document : aucun écran ne peut la décaler ni la recouvrir.
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  radio: '📻',
  casque: '🎧',
  micro: '🎙️',
  satellite: '📡',
  vague: '🌊',
  perroquet: '🦜',
  poulpe: '🐙',
  orange: '🍊',
  cactus: '🌵',
  planete: '🪐',
  ballon: '🎈',
  disque: '💿',
};

export const AVATAR_LABELS: Record<string, string> = {
  radio: 'Radio',
  casque: 'Casque',
  micro: 'Micro',
  satellite: 'Antenne',
  vague: 'Vague',
  perroquet: 'Perroquet',
  poulpe: 'Poulpe',
  orange: 'Orange',
  cactus: 'Cactus',
  planete: 'Planète',
  ballon: 'Ballon',
  disque: 'Disque',
};

export function Avatar({ avatar, className, team }: { avatar: string; className?: string; team?: TeamId | null }) {
  return (
    <span className={cls('avatar', team && `is-${team}`, className)} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '📻'}
    </span>
  );
}
