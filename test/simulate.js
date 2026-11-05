// Simula muchas partidas con jugadas aleatorias para detectar errores en los motores
const assert = require('assert');
const { Mus } = require('../src/mus');
const { Pocha } = require('../src/pocha');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'J' + i }));

function simPocha(n, modo) {
  const g = new Pocha(players(n), { modo });
  let steps = 0;
  while (!g.isFinished()) {
    if (++steps > 100000) throw new Error('bucle infinito pocha');
    if (g.phase === 'bidding') {
      const s = g.turn;
      const opts = [];
      for (let k = 0; k <= g.cards; k++) if (!(s === g.dealer && k === g.forbiddenBid())) opts.push(k);
      g.act(s, { type: 'bid', value: pick(opts) });
      if (g.phase === 'playing') {
        const sum = g.bids.reduce((a, b) => a + b, 0);
        assert.notStrictEqual(sum, g.cards, 'la suma de apuestas no puede igualar las bazas');
      }
    } else if (g.phase === 'playing') {
      const s = g.turn;
      const legal = g.legalCards(s);
      assert(legal.length > 0);
      g.act(s, { type: 'play', card: pick(legal).id });
    } else if (g.phase === 'trickDone') {
      g.tick();
    } else if (g.phase === 'handEnd') {
      const last = g.history[g.history.length - 1];
      assert.strictEqual(last.tricks.reduce((a, b) => a + b, 0), last.cards);
      for (let s = 0; s < n; s++) g.act(s, { type: 'ready' });
    }
    // Nunca se ve la mano ajena
    const v = g.viewFor(0);
    assert(!JSON.stringify(v).includes('"hands"'));
  }
  const sum = g.summary();
  assert.strictEqual(sum.winners.length, 1);
  return g;
}

function simMus(settings) {
  const g = new Mus(players(4), settings);
  let steps = 0;
  while (!g.isFinished()) {
    if (++steps > 200000) throw new Error('bucle infinito mus');
    if (g.phase === 'mus') {
      g.act(g.turn, { type: Math.random() < 0.4 ? 'mus' : 'nomus' });
    } else if (g.phase === 'discard') {
      for (let s = 0; s < 4; s++) {
        const hand = g.hands[s];
        const k = 1 + Math.floor(Math.random() * 4);
        g.act(s, { type: 'discard', cards: hand.slice(0, k).map((c) => c.id) });
      }
      // nada de cartas repetidas
      const all = g.hands.flat().map((c) => c.id);
      assert.strictEqual(new Set(all).size, 16);
    } else if (g.phase === 'lance') {
      const acts = g.actionsFor(g.turn);
      const a = pick(acts.concat(acts.includes('ordago') && Math.random() < 0.9 ? acts.filter((x) => x !== 'ordago') : []));
      g.act(g.turn, a === 'envido' ? { type: 'envido', value: 2 + Math.floor(Math.random() * 4) } : { type: a });
    } else if (g.phase === 'roundEnd') {
      for (let s = 0; s < 4; s++) g.act(s, { type: 'ready' });
    }
    JSON.stringify(g.viewFor(1));
  }
  return g;
}

// Comprobaciones concretas del mus
function musChecks() {
  const g = new Mus(players(4), {});
  const c = (s, r) => ({ id: `${s}-${r}`, s, r });
  g.mano = 0;
  g.hands = [
    [c('oros', 12), c('copas', 3), c('espadas', 11), c('bastos', 1)], // 2 reyes (8 reyes) -> par de reyes, juego 31
    [c('oros', 1), c('copas', 2), c('espadas', 1), c('bastos', 4)], // medias de ases
    [c('oros', 7), c('copas', 7), c('espadas', 5), c('bastos', 5)], // duples
    [c('oros', 4), c('copas', 5), c('espadas', 6), c('bastos', 7)], // nada, punto 22
  ];
  assert.strictEqual(g.pares(0).name, 'Par');
  assert.strictEqual(g.pares(1).name, 'Medias');
  assert.strictEqual(g.pares(2).name, 'Duples');
  assert.strictEqual(g.pares(3), null);
  assert.strictEqual(g.sum(0), 31);
  assert.strictEqual(g.best('grande', [0, 1, 2, 3]), 0);
  assert.strictEqual(g.best('chica', [0, 1, 2, 3]), 1);
  assert.strictEqual(g.best('pares', [0, 1, 2, 3]), 2);
  assert.strictEqual(g.teamValue('pares', 0), 1 + 3); // par (asiento 0) + duples (asiento 2)
  assert.strictEqual(g.juegoValue(0), 3);
  // Empate: gana el más cercano al mano
  g.hands[1] = [c('oros', 12), c('copas', 3), c('espadas', 11), c('bastos', 1)].map((x) => ({ ...x, id: x.id + 'b' }));
  g.mano = 1;
  assert.strictEqual(g.best('grande', [0, 1]), 1);
  g.mano = 0;
  assert.strictEqual(g.best('grande', [0, 1]), 0);
  // juego 32 gana a 40
  g.hands[0] = [c('oros', 12), c('copas', 12), c('espadas', 11), c('bastos', 2)]; // 31
  g.hands[1] = [c('oros', 10), c('copas', 10), c('espadas', 11), c('bastos', 12)]; // 40
  g.hands[2] = [c('oros', 10), c('copas', 10), c('espadas', 11), c('bastos', 2)]; // 31? 10+10+10+1 = 31
  g.hands[3] = [c('oros', 10), c('copas', 10), c('espadas', 7), c('bastos', 5)]; // 32
  assert.strictEqual(g.best('juego', [1, 3]), 3);
}

// Comprobaciones de la pocha
function pochaChecks() {
  const g = new Pocha(players(4), {});
  assert.deepStrictEqual(g.sequence.length, 9 + 4 + 9);
  const g3 = new Pocha(players(3), {});
  assert.strictEqual(g3.max, 12);
  const g5 = new Pocha(players(5), { modo: 'corta' });
  assert.deepStrictEqual(g5.sequence, [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1]);
}

musChecks();
pochaChecks();
let t = Date.now();
for (let i = 0; i < 300; i++) simPocha(3 + (i % 3), i % 2 ? 'corta' : 'completa');
console.log(`Pocha: 300 partidas simuladas OK (${Date.now() - t} ms)`);
t = Date.now();
for (let i = 0; i < 300; i++) simMus({ puntos: i % 2 ? 30 : 40, juegos: 1 + (i % 3), ochoReyes: i % 4 !== 0 });
console.log(`Mus: 300 partidas simuladas OK (${Date.now() - t} ms)`);
