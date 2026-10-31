// Sons synthétisés (Web Audio), aucun fichier à charger : crans du cadran, balayage de radio, carillons du score.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number; sweep?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Une note de vibraphone : sinus clair et sa résonance. */
function vibe(freq: number, delay = 0, gain = 0.07): void {
  tone(freq, 1.1, { gain, delay });
  tone(freq * 4, 0.35, { gain: gain * 0.25, delay });
}

const C5 = 523.25;
const scale = (n: number) => C5 * 2 ** ([0, 2, 4, 7, 9, 12, 14, 16, 19][n] / 12);

let lastTick = 0;

export const sfx = {
  /** Un cran du cadran sous le doigt. */
  tick: () => {
    const now = performance.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    noise(0.012, { gain: 0.09, freq: 3200, q: 2 });
  },
  /** « D'accord » : un petit pop. */
  pop: () => tone(620, 0.12, { gain: 0.08, slide: 1.7, type: 'triangle' }),
  /** L'aiguille se verrouille : un loquet. */
  lock: () => {
    noise(0.05, { gain: 0.4, freq: 1400, q: 1 });
    tone(130, 0.18, { gain: 0.16, slide: 0.6 });
    noise(0.03, { gain: 0.25, freq: 3800, delay: 0.07 });
  },
  /** On ouvre l'écran : la radio qui cherche sa station. */
  sweep: () => {
    noise(0.9, { gain: 0.14, freq: 500, sweep: 4200, q: 4, fade: 0.6 });
    tone(220, 0.8, { type: 'sawtooth', gain: 0.025, slide: 4, attack: 0.1 });
  },
  /** Les points : autant de notes que de points, en montant. */
  score: (points: number) => {
    if (points <= 0) {
      tone(330, 0.32, { type: 'triangle', gain: 0.09, slide: 0.85 });
      tone(262, 0.5, { type: 'triangle', gain: 0.09, slide: 0.8, delay: 0.3 });
      return;
    }
    for (let i = 0; i < points; i++) vibe(scale(i * 2), i * 0.11, 0.065);
    if (points >= 4) for (let i = 0; i < 8; i++) tone(2400 + Math.random() * 2400, 0.08, { gain: 0.018, delay: 0.45 + i * 0.05 });
  },
  /** Le pari de l'autre équipe : juste ou non. */
  side: (good: boolean) => (good ? tone(880, 0.25, { gain: 0.06, slide: 1.25 }) : tone(300, 0.25, { gain: 0.05, slide: 0.75, type: 'triangle' })),
  /** L'indice arrive. */
  clue: () => {
    vibe(scale(4), 0, 0.06);
    vibe(scale(6), 0.09, 0.05);
  },
  /** C'est toi le médium. */
  turn: () => {
    vibe(scale(2), 0, 0.06);
    vibe(scale(5), 0.12, 0.06);
    vibe(scale(7), 0.24, 0.05);
  },
  tap: () => tone(880, 0.05, { gain: 0.025, slide: 1.3 }),
  /** Fin de partie : une petite fanfare de vibraphone, plus longue pour une victoire. */
  finale: (win: boolean) => {
    const notes = win ? [0, 2, 3, 4, 5, 4, 5, 7, 8] : [4, 3, 2, 1, 0];
    notes.forEach((n, i) => vibe(scale(n), i * 0.16, 0.06));
  },
};
