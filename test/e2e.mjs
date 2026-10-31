// Test de bout en bout : 5 joueurs (socket.io) jouent une partie en équipes puis une partie coopérative
// sur le serveur compilé. Un sixième arrive en cours de route. Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), WL_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

const stats = { audited: 0, dialEvents: 0, rounds: 0, sidePhases: 0, catchUps: 0, resets: 0 };
const done = { teams: false, coop: false };

function client(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, acted: new Set() };
  socket.on('state', (v) => {
    c.view = v;
    audit(c, v);
    play(c);
  });
  socket.on('dial', () => stats.dialEvents++);
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Les secrets : la cible et les cartes proposées ne sortent que vers le médium, avant le dévoilement. */
function audit(c, v) {
  const json = JSON.stringify(v);
  if (json.includes('"token"')) fail('un jeton circule');
  const g = v.game;
  if (v.phase !== 'playing' || !g) return;
  stats.audited++;
  const r = g.round;
  const psychic = r.psychicId === v.me;
  if (r.stage !== 'reveal' && !psychic && r.target !== null) fail(`${c.name} voit la cible sans être médium`);
  if (psychic && r.stage === 'pick' && r.target !== null) fail('le médium voit la cible avant de choisir sa carte');
  if (psychic && r.stage !== 'pick' && r.target === null) fail('le médium ne voit pas la cible');
  if (!psychic && r.choices) fail(`${c.name} voit les cartes proposées au médium`);
  if (r.stage === 'reveal' && r.target === null) fail('la cible reste cachée au dévoilement');
  if (r.psychicId && r.deciders.includes(r.psychicId)) fail('le médium compte parmi ceux qui décident');
}

function once(c, key, fn) {
  if (c.acted.has(key)) return;
  c.acted.add(key);
  fn();
}

const ack = () => {};
function play(c) {
  const v = c.view;
  if (!v) return;
  if (v.phase === 'finished') {
    const f = v.final;
    if (v.hostId === v.me) {
      if (!f || f.rounds.length === 0) fail('pas de récapitulatif');
      once(c, `final:${f.mode}`, () => {
        done[f.mode] = true;
        if (f.mode === 'teams') {
          if (!f.winner) fail('pas de vainqueur en équipes');
          if (Math.max(f.scores.A, f.scores.B) < 10) fail('partie finie sous 10 points');
          console.log(`  équipes : ${f.scores.A} à ${f.scores.B}, ${f.rounds.length} manches`);
          setTimeout(async () => {
            await c.call('game:restart');
            await c.call('room:settings', { mode: 'coop', timer: 60 });
            const res = await c.call('game:start');
            if (!res.ok) fail(`relance refusée : ${res.error}`);
          }, 20);
        } else {
          console.log(`  coopératif : ${f.coopScore} points, ${f.rounds.length} manches`);
          finish();
        }
      });
    }
    return;
  }
  const g = v.game;
  if (v.phase !== 'playing' || !g) return;
  const r = g.round;
  const key = `${g.mode}:${r.n}:${r.stage}`;
  const me = v.me;
  if (r.stage === 'pick' && r.psychicId === me) {
    once(c, key, () => {
      // De temps en temps, le médium demande deux autres cartes.
      if (r.n % 3 === 0) c.socket.emit('game:redraw', {}, ack);
      c.socket.emit('game:pick', { index: r.n % 2 }, ack);
    });
  } else if (r.stage === 'clue' && r.psychicId === me) {
    once(c, key, () => c.socket.emit('game:clue', { text: `Indice ${r.n} de ${c.name}` }, ack));
  } else if (r.stage === 'guess' && r.deciders.includes(me)) {
    const first = r.deciders[0] === me;
    if (first) {
      once(c, `${key}:move`, () => {
        // Quelques pas d'aiguille, puis une position : souvent juste, parfois très loin.
        const steps = [20, 40, 60];
        steps.forEach((x, i) => setTimeout(() => c.socket.emit('game:dial', { value: x }), i * 30));
        setTimeout(() => {
          const value = Math.random() < 0.5 ? 50 : Math.random() * 100;
          c.socket.emit('game:dial', { value, final: true });
        }, 120);
      });
    }
    if (!r.agreed.includes(me) && r.dialSeq > 0) {
      once(c, `${key}:agree:${r.dialSeq}`, () => {
        if (r.agreed.length > 0) stats.resets++;
        setTimeout(() => c.socket.emit('game:agree', { agree: true, dialSeq: r.dialSeq }, ack), 40);
      });
    }
  } else if (r.stage === 'side' && r.deciders.includes(me) && !r.votes[me]) {
    once(c, key, () => {
      stats.sidePhases += r.deciders[0] === me ? 1 : 0;
      // Un premier désaccord, puis tout le monde se range à gauche.
      const side = r.deciders[0] === me && r.n % 2 ? 'right' : 'left';
      c.socket.emit('game:vote', { side }, ack);
      if (side === 'right') setTimeout(() => c.socket.emit('game:vote', { side: 'left' }, ack), 60);
    });
  } else if (r.stage === 'reveal' && v.hostId === me) {
    once(c, key, () => {
      stats.rounds++;
      if (r.result?.catchUp) stats.catchUps++;
      setTimeout(() => c.socket.emit('game:next', { seq: r.seq }, ack), 10);
    });
  }
}

const names = ['Ada', 'Bilal', 'Chloé', 'Dina', 'Eliott'];
const clients = names.map(client);
await Promise.all(clients.map((c) => new Promise((res) => c.socket.on('connect', res))));
const [host, ...rest] = clients;
const created = await host.call('room:create', { name: host.name, avatar: 'radio' });
if (!created.ok) fail('création refusée');
const code = created.data.code;
for (const c of rest) {
  const res = await c.call('room:join', { code, name: c.name, avatar: 'poulpe' });
  if (!res.ok) fail(`${c.name} ne peut pas rejoindre : ${res.error}`);
}
await host.call('room:settings', { mode: 'teams', timer: 0 });
const started = await host.call('game:start');
if (!started.ok) fail(`lancement refusé : ${started.error}`);

// Un retardataire s'assoit en pleine partie.
setTimeout(async () => {
  const late = client('Farid');
  await new Promise((res) => late.socket.on('connect', res));
  const res = await late.call('room:join', { code, name: late.name, avatar: 'cactus' });
  if (!res.ok) fail(`le retardataire est refusé : ${res.error}`);
  clients.push(late);
}, 300);

function finish() {
  if (!done.teams || !done.coop) return;
  if (stats.dialEvents === 0) fail("aucun mouvement d'aiguille diffusé");
  if (stats.sidePhases === 0) fail('aucun pari en équipes');
  console.log(`✓ ${stats.rounds} manches jouées, ${stats.audited} états vérifiés, ${stats.dialEvents} mouvements d'aiguille reçus, ${stats.catchUps} rattrapage(s)`);
  for (const c of clients) c.socket.close();
  server.kill();
  process.exit(0);
}
