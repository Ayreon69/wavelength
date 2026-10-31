// Le cadran : la face graduée, la cible en bandes 2-3-4-3-2, l'écran qui la cache, l'aiguille qu'on tourne. Et la carte des deux idées.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { BAND, type Spectrum, type Zone } from '../../../shared/protocol';
import { cls } from '../lib/util';

const W = 400;
const H = 224;
const CX = 200;
const CY = 206;
/** Le bord de la face, l'écran et la cible, le moyeu. */
const RIM = 192;
const FACE = 180;
const HUB = 30;
const NEEDLE = 168;

const INK = '#1f1b3d';
const PAPER = '#fbf7ef';

/** Les couples d'encres des cartes : une couleur par idée. */
const PALETTES: [string, string][] = [
  ['#2f5bd3', '#ff8a2b'],
  ['#0e9a94', '#ff4f7b'],
  ['#6b4fd8', '#ffcb3d'],
  ['#1f1b3d', '#ff6047'],
  ['#2fae6b', '#ff4f7b'],
  ['#2f5bd3', '#ffcb3d'],
  ['#d23a8c', '#0e9a94'],
];

/** Toujours la même paire d'encres pour une carte donnée, sur tous les écrans. */
export function paletteFor(s: Spectrum | null): [string, string] {
  if (!s) return ['#47426b', '#9b93b8'];
  let h = 0;
  for (const ch of s.left + '|' + s.right) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

/** Texte foncé sur les encres claires (jaune, orange), clair sur les autres. */
export function inkOn(hex: string): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return lum > 0.35 ? INK : PAPER;
}

function polar(v: number, r: number): [number, number] {
  const a = Math.PI * (1 - v / 100);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

/** Un secteur d'anneau entre deux positions du cadran. */
function sector(a: number, b: number, r1: number, r2: number): string {
  const [x1, y1] = polar(a, r2);
  const [x2, y2] = polar(b, r2);
  const [x3, y3] = polar(b, r1);
  const [x4, y4] = polar(a, r1);
  const f = (n: number) => n.toFixed(2);
  return `M${f(x1)} ${f(y1)}A${r2} ${r2} 0 0 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${r1} ${r1} 0 0 0 ${f(x4)} ${f(y4)}Z`;
}

const BANDS: { from: number; zone: Zone }[] = [
  { from: -2.5, zone: 2 },
  { from: -1.5, zone: 3 },
  { from: -0.5, zone: 4 },
  { from: 0.5, zone: 3 },
  { from: 1.5, zone: 2 },
];
const ZONE_FILL: Record<number, string> = { 4: '#ff4f7b', 3: '#ff8a2b', 2: '#ffcb3d' };

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

interface DialProps {
  value: number;
  spectrum: Spectrum | null;
  /** Le centre de la cible, si on le connaît. */
  target?: number | null;
  /** L'écran est ouvert : la cible se voit. */
  open?: boolean;
  interactive?: boolean;
  onChange?: (v: number, final: boolean) => void;
  /** L'aiguille glisse en douceur vers chaque nouvelle position reçue. */
  smooth?: boolean;
  locked?: boolean;
  /** La bande où l'aiguille est tombée, mise en valeur au dévoilement. */
  hit?: boolean;
  size?: 'lg' | 'sm';
  className?: string;
}

export function Dial({ value, spectrum, target = null, open = false, interactive = false, onChange, smooth, locked, hit, size = 'lg', className }: DialProps) {
  const uid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [left, right] = paletteFor(spectrum);
  // L'écran s'ouvre en tournant : il part fermé, puis pivote au rendu suivant.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!open) {
      setOpened(false);
      return;
    }
    if (size === 'sm') {
      setOpened(true);
      return;
    }
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setOpened(true));
    });
    return () => cancelAnimationFrame(id);
  }, [open, size]);

  const fromPointer = (e: PointerEvent<SVGSVGElement>): number => {
    const rect = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * W) / rect.width;
    const y = ((e.clientY - rect.top) * H) / rect.height;
    let a = Math.atan2(CY - y, x - CX);
    if (a < 0) a = x < CX ? Math.PI : 0;
    return clamp(100 * (1 - a / Math.PI));
  };

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!interactive || !onChange) return;
    e.preventDefault();
    svg.current?.setPointerCapture(e.pointerId);
    dragging.current = true;
    onChange(fromPointer(e), false);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !onChange) return;
    onChange(fromPointer(e), false);
  };
  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !onChange) return;
    dragging.current = false;
    onChange(fromPointer(e), true);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!interactive || !onChange) return;
    const step = e.shiftKey ? 5 : 1;
    const moves: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -10, PageUp: 10 };
    let v: number | null = null;
    if (e.key in moves) v = value + moves[e.key];
    else if (e.key === 'Home') v = 0;
    else if (e.key === 'End') v = 100;
    if (v === null) return;
    e.preventDefault();
    onChange(clamp(v), true);
  };

  const showTarget = target !== null && target !== undefined;
  const hitBand = hit && showTarget ? BANDS.findIndex((b) => Math.abs(value - (target! + (b.from + 0.5) * BAND)) <= BAND / 2) : -1;
  const ticks = size === 'lg' ? Array.from({ length: 41 }, (_, i) => i * 2.5) : [0, 25, 50, 75, 100];

  return (
    <svg
      ref={svg}
      className={cls('dial', `dial-${size}`, interactive && 'is-interactive', locked && 'is-locked', className)}
      viewBox={`0 0 ${W} ${H}`}
      role={interactive ? 'slider' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={spectrum ? `Cadran de « ${spectrum.left} » à « ${spectrum.right} »` : 'Cadran'}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? Math.round(value) : undefined}
      aria-valuetext={interactive && spectrum ? `${Math.round(value)} sur 100, de ${spectrum.left} à ${spectrum.right}` : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    >
      <defs>
        <clipPath id={`${uid}-top`}>
          <rect x="0" y="0" width={W} height={CY} />
        </clipPath>
        <pattern id={`${uid}-dots`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="2" cy="2" r="1.25" fill={PAPER} opacity="0.3" />
        </pattern>
      </defs>

      {/* La face graduée. */}
      <path className="dial-face" d={`M${CX - RIM} ${CY}A${RIM} ${RIM} 0 0 1 ${CX + RIM} ${CY}Z`} />
      <g className="dial-ticks">
        {ticks.map((v) => {
          const long = v % 10 === 0;
          const [x1, y1] = polar(v, RIM - (v === 50 ? 14 : long ? 10 : 6));
          const [x2, y2] = polar(v, RIM - 2);
          return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} className={cls(long && 'is-long')} />;
        })}
      </g>

      {/* La cible : on ne la dessine que si on la connaît. */}
      {showTarget && (
        <g className="dial-target">
          {BANDS.map((b, i) => {
            const a = Math.max(0, target! + b.from * BAND);
            const z = Math.min(100, target! + (b.from + 1) * BAND);
            if (z - a <= 0.05) return null;
            const [tx, ty] = polar((a + z) / 2, FACE - 18);
            return (
              <g key={i} className={cls('band', `band-${b.zone}`, i === hitBand && 'is-hit')}>
                <path d={sector(a, z, HUB, FACE)} fill={ZONE_FILL[b.zone]} />
                {z - a >= BAND * 0.6 && size === 'lg' && (
                  <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central">
                    {b.zone}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* L'écran : deux encres qui se chevauchent au milieu, des points de trame et des ondes. Il pivote pour dévoiler la cible. */}
      <g clipPath={`url(#${uid}-top)`}>
        <g className={cls('dial-cover', opened && 'is-open')} style={{ transformOrigin: `${CX}px ${CY}px` } as CSSProperties}>
          <path d={sector(0, 57, 0.01, FACE)} fill={left} />
          <path d={sector(43, 100, 0.01, FACE)} fill={right} className="cover-over" />
          <path d={sector(0, 100, 0.01, FACE)} fill={`url(#${uid}-dots)`} />
          <g className="cover-waves">
            {[58, 92, 126, 160].map((r) => (
              <path key={r} d={`M${CX - r} ${CY}A${r} ${r} 0 0 1 ${CX + r} ${CY}`} />
            ))}
          </g>
        </g>
      </g>

      {/* Le socle, avec une pointe de chaque encre aux deux bouts. */}
      <rect className="dial-base" x={CX - RIM - 6} y={CY - 1} width={RIM * 2 + 12} height={H - CY + 1} rx="9" />
      <rect x={CX - RIM - 6} y={CY + 4} width="34" height="8" rx="4" fill={left} />
      <rect x={CX + RIM - 28} y={CY + 4} width="34" height="8" rx="4" fill={right} />

      {/* L'aiguille. */}
      <g className={cls('dial-needle', smooth && 'is-smooth')} style={{ transform: `rotate(${(value - 50) * 1.8}deg)`, transformOrigin: `${CX}px ${CY}px` } as CSSProperties}>
        <line x1={CX} y1={CY} x2={CX} y2={CY - NEEDLE} className="needle-shadow" />
        <line x1={CX} y1={CY} x2={CX} y2={CY - NEEDLE} className="needle-line" />
        {interactive && <circle cx={CX} cy={CY - NEEDLE} r="18" className="needle-halo" />}
        <circle cx={CX} cy={CY - NEEDLE} r={size === 'lg' ? 10 : 12} className="needle-tip" />
      </g>
      <circle cx={CX} cy={CY} r={HUB * 0.62} className="dial-hub" />
      <circle cx={CX} cy={CY} r={HUB * 0.2} className="dial-hub-dot" />
    </svg>
  );
}

/** La carte : deux idées, une à chaque bout, imprimées chacune dans son encre. */
export function SpectrumCard({ spectrum, size = 'lg', className }: { spectrum: Spectrum | null; size?: 'lg' | 'sm'; className?: string }) {
  const [left, right] = paletteFor(spectrum);
  return (
    <div className={cls('spectrum', `spectrum-${size}`, !spectrum && 'is-blank', className)}>
      <div className="spec-half is-left" style={{ '--c': left, '--t': inkOn(left) } as CSSProperties}>
        <span className="spec-arrow" aria-hidden>
          ←
        </span>
        <span className="spec-word">{spectrum?.left ?? '…'}</span>
      </div>
      <div className="spec-half is-right" style={{ '--c': right, '--t': inkOn(right) } as CSSProperties}>
        <span className="spec-word">{spectrum?.right ?? '…'}</span>
        <span className="spec-arrow" aria-hidden>
          →
        </span>
      </div>
    </div>
  );
}
