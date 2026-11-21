// Le petit jeu de ceux qui attendent le médium : un guerrier fait des pompes sur deux doigts, au rythme des appuis.
// Le compteur n'est là que pour l'amusement : il reste sur l'écran, ne part jamais au serveur et ne touche pas à la partie.
import { useEffect, useRef, useState } from 'react';
import { vibrate } from '../lib/util';

/** La scène en unités logiques, mise à l'échelle de l'écran. */
const W = 360;
const H = 160;
const GROUND = 138;
/** Les doigts restent plantés ici ; ce sont les pieds qui s'adaptent. */
const HAND_X = 306;
/** Longueur des pieds à l'épaule, et des deux segments du bras. */
const BODY = 196;
const SEG = 33;
/** Hauteur de l'épaule au-dessus du sol, bras tendu puis poitrine tout en bas. */
const H_UP = 62;
const H_DOWN = 27;
const WRIST_H = 9;

const SKIN = '#f2b48c';
const SKIN_SHADE = '#d98f68';
const SUIT = '#139d97';
const ARMOR = '#d7dcff';
const ARMOR_DARK = '#8b96e6';
const GOLD = '#ffcb3d';
const INK = '#1f1b3d';

interface Puff {
  x: number;
  y: number;
  t: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

/** Un guerrier original, dessiné ici : cheveux en flammes, armure de combat, deux doigts au sol. */
export function PushUps() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const push = useRef<() => void>(() => {});

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const hand = getComputedStyle(cv).getPropertyValue('--hand').trim() || 'inherit';
    let time = 0;
    let last = performance.now();
    let raf = 0;
    /** 0 : bras tendus, 1 : poitrine au ras du sol. */
    let p = 0;
    let mode: 'rest' | 'down' | 'up' = 'rest';
    let reps = 0;
    let lastRep = -9;
    let pop = -9;
    const puffs: Puff[] = [];
    const sparks: Spark[] = [];

    const fit = () => {
      const w = cv.clientWidth || W;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = w / W;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(H * scale * dpr);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);

    push.current = () => {
      if (mode !== 'down') mode = 'down';
    };

    const step = (dt: number) => {
      time += dt;
      if (mode === 'down') {
        p = Math.min(1, p + dt * 7.5);
        if (p >= 1) {
          mode = 'up';
          reps++;
          lastRep = time;
          pop = time;
          setCount(reps);
          vibrate(12);
          puffs.push({ x: HAND_X + 4, y: GROUND, t: time }, { x: HAND_X - 12, y: GROUND, t: time });
          if (!calm) for (let i = 0; i < 4; i++) sparks.push({ x: 0, y: 0, vx: -30 - Math.random() * 60, vy: -40 - Math.random() * 70, t: time });
        }
      } else if (mode === 'up') {
        p = Math.max(0, p - dt * 4.6);
        if (p <= 0) mode = 'rest';
      }
      for (let i = puffs.length - 1; i >= 0; i--) if (time - puffs[i].t > 0.5) puffs.splice(i, 1);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 90 * dt;
        if (time - s.t > 0.7) sparks.splice(i, 1);
      }
    };

    const line = (pts: [number, number][]) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    };
    const thick = (a: [number, number], b: [number, number], w: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      line([a, b]);
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      // Le sol, tracé à main levée.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      line(Array.from({ length: 19 }, (_, i) => [i * 20, GROUND + 2 + Math.sin(i * 1.7) * 1.2] as [number, number]));

      // La pose : l'épaule descend, les pieds restent au sol, les doigts ne bougent pas.
      const e = p * p * (3 - 2 * p);
      const h = H_UP + (H_DOWN - H_UP) * e;
      const sx = HAND_X - 6;
      const sinT = h / (BODY * 0.9);
      const cosT = Math.sqrt(1 - sinT * sinT);
      const ux = cosT;
      const uy = -sinT;
      const tx = sx - ux * BODY * 0.9;
      const at = (k: number): [number, number] => [tx + ux * BODY * k, GROUND + uy * BODY * k];
      const toes = at(0);
      const hip = at(0.5);
      const waist = at(0.56);
      const chest = at(0.86);
      const shoulder: [number, number] = [sx, GROUND - h];
      const nx = uy; // la normale vers le haut du corps
      const ny = -ux;
      const wrist: [number, number] = [HAND_X, GROUND - WRIST_H];

      // Le bras : coude replié vers l'arrière quand on descend.
      const dx = wrist[0] - shoulder[0];
      const dy = wrist[1] - shoulder[1];
      const dist = Math.min(Math.hypot(dx, dy), SEG * 2 - 0.5);
      const bend = Math.sqrt(Math.max(SEG * SEG - (dist / 2) * (dist / 2), 0));
      const mx = shoulder[0] + dx / 2;
      const my = shoulder[1] + dy / 2;
      const len = Math.hypot(dx, dy) || 1;
      const elbow: [number, number] = [mx - (dy / len) * bend, my + (dx / len) * bend];
      // L'ombre sous le guerrier.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.beginPath();
      ctx.ellipse((toes[0] + HAND_X) / 2, GROUND + 4, (HAND_X - toes[0]) / 2 + 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Les jambes, les bottes.
      thick(toes, hip, 15, SUIT);
      thick(at(0.03), at(0.2), 17, ARMOR_DARK);
      thick(at(0.3), at(0.34), 17, GOLD);
      thick(toes, [toes[0] - 3, toes[1] + 1], 16, '#7b3fc9');
      // Le torse : combinaison, plastron et ceinture.
      thick(waist, at(0.93), 28, SUIT);
      thick(at(0.6), chest, 27, ARMOR);
      thick(at(0.63), at(0.84), 13, ARMOR_DARK);
      thick(at(0.53), at(0.57), 24, GOLD);
      // Le bras, avec son brassard doré, puis les deux doigts.
      thick(shoulder, elbow, 12, SKIN);
      thick(elbow, wrist, 11, SKIN);
      const bm: [number, number] = [elbow[0] + (wrist[0] - elbow[0]) * 0.35, elbow[1] + (wrist[1] - elbow[1]) * 0.35];
      thick(bm, [elbow[0] + (wrist[0] - elbow[0]) * 0.75, elbow[1] + (wrist[1] - elbow[1]) * 0.75], 13, GOLD);
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(wrist[0], wrist[1], 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = SKIN_SHADE;
      ctx.lineWidth = 3.6;
      line([[wrist[0] + 1, wrist[1] + 2], [wrist[0] + 1, GROUND]]);
      line([[wrist[0] + 6, wrist[1] + 2], [wrist[0] + 7, GROUND]]);
      // Une épaulière ronde, cerclée d'or.
      ctx.fillStyle = ARMOR;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(shoulder[0] + nx * 3, shoulder[1] + ny * 3 - 1, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // La tête, dans le prolongement du corps, le regard droit devant.
      const head: [number, number] = [shoulder[0] + 24, shoulder[1] - 12 + e * 3];
      // Les flammes : sept pointes qui dansent, rouges dehors, jaunes au cœur.
      const flick = calm ? 0 : 1;
      const flame = (len: number, wid: number, ang: number, color: string, phase: number) => {
        const a = ang + Math.sin(time * 9 + phase) * 0.14 * flick;
        const l = len * (1 + Math.sin(time * 11 + phase * 2) * 0.1 * flick);
        const bx = head[0] - 2;
        const by = head[1] - 3;
        const tipX = bx + Math.sin(a) * l;
        const tipY = by - Math.cos(a) * l;
        const px = Math.cos(a) * wid;
        const py = Math.sin(a) * wid;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(bx - px, by - py);
        ctx.quadraticCurveTo(bx - px * 0.4 + Math.sin(a) * l * 0.5, by - py * 0.4 - Math.cos(a) * l * 0.5, tipX, tipY);
        ctx.quadraticCurveTo(bx + px * 0.4 + Math.sin(a) * l * 0.5, by + py * 0.4 - Math.cos(a) * l * 0.5, bx + px, by + py);
        ctx.closePath();
        ctx.fill();
      };
      const spikes: [number, number, number, number][] = [
        [34, 6.5, -1.15, 0.2],
        [42, 7, -0.78, 1.1],
        [50, 7.5, -0.4, 2.3],
        [54, 7.5, 0, 3.1],
        [48, 7, 0.38, 4.2],
        [38, 6.5, 0.72, 5.0],
        [26, 5.5, 1.05, 5.9],
      ];
      for (const [l, w, a, ph] of spikes) flame(l, w, a, '#ff5a1f', ph);
      for (const [l, w, a, ph] of spikes) flame(l * 0.66, w * 0.62, a * 0.9, GOLD, ph + 0.5);
      // Le visage : front dur, œil de côté, dents serrées.
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.ellipse(head[0], head[1], 12.5, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SKIN_SHADE;
      ctx.beginPath();
      ctx.ellipse(head[0] - 9, head[1] + 7, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(head[0] + 5, head[1] - 1.5, 3.6, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(head[0] + 6.4, head[1] - 1.2, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6;
      line([[head[0] - 1, head[1] - 8], [head[0] + 9, head[1] - 4]]);
      ctx.lineWidth = 1.8;
      const grit = time - lastRep < 0.4 ? 3 : 1.6;
      line([[head[0] + 3, head[1] + 6], [head[0] + 10, head[1] + 5.6 + grit * 0.1]]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = grit;
      line([[head[0] + 4, head[1] + 6.4], [head[0] + 9, head[1] + 6.2]]);

      // La sueur après un effort récent.
      if (time - lastRep < 1.1 && reps > 0 && !calm) {
        const k = (time - lastRep) / 1.1;
        ctx.fillStyle = '#9fe3ff';
        for (let i = 0; i < 2; i++) {
          const sx2 = head[0] - 8 - i * 10 - k * 6;
          const sy2 = head[1] - 14 + k * 24 + i * 5;
          ctx.globalAlpha = 1 - k;
          ctx.beginPath();
          ctx.ellipse(sx2, sy2, 2, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // La poussière aux doigts, et les étincelles d'une flamme.
      for (const f of puffs) {
        const k = (time - f.t) / 0.5;
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.fillStyle = '#fffefa';
        ctx.beginPath();
        ctx.arc(f.x + (f.x < HAND_X ? -k * 12 : k * 14), f.y - 3 - k * 6, 3 + k * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const s of sparks) {
        const k = (time - s.t) / 0.7;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = k < 0.5 ? GOLD : '#ff5a1f';
        ctx.fillRect(head[0] + s.x - 1.5, head[1] - 30 + s.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
      // Le « +1 » qui s'envole.
      if (time - pop < 0.6) {
        const k = (time - pop) / 0.6;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#fffefa';
        ctx.font = `800 17px ${hand}`;
        ctx.textAlign = 'center';
        ctx.fillText('+1', HAND_X - 4, GROUND - 78 - k * 22);
        ctx.globalAlpha = 1;
      }
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const tap = () => {
    setStarted(true);
    push.current();
  };

  return (
    <div
      className="pushups"
      role="button"
      tabIndex={0}
      aria-label="Faire faire une pompe au guerrier"
      onPointerDown={(e) => {
        e.preventDefault();
        tap();
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) tap();
        }
      }}
    >
      <canvas ref={canvas} className="pushups-scene" />
      <p className="pushups-count" aria-live="off">
        <b>{count}</b> {count > 1 ? 'pompes' : 'pompe'}
      </p>
      {!started && <p className="pushups-hint">Touche pour faire des pompes, sur deux doigts</p>}
    </div>
  );
}
