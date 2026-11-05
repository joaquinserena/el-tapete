// Simula muchas partidas con jugadas aleatorias para detectar errores en los motores
const assert = require('assert');
const { Mus } = require('../src/mus');
const { Pocha } = require('../src/pocha');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'J' + i }));

function simPocha(n) {
  const g = new Pocha(players(n), {});
  assert.strictEqual(g.phase, 'draw');
  const dr = g.draw.steps;
  assert.strictEqual(dr[dr.length - 1].card.r, 12, 'el sorteo acaba en rey');
  assert(dr.slice(0, -1).every((s) => s.card.r !== 12));
  assert.strictEqual(g.dealer, dr[dr.length - 1].seat);
  let steps = 0;
  while (!g.isFinished()) {
    if (++steps > 200000) throw new Error('bucle infinito pocha');
    if (g.phase === 'draw') {
      g.tick();
    } else if (g.phase === 'auction') {
      assert.strictEqual(g.handType, 'subasta');
      const all = g.hands.flat().map((c) => c.id);
      assert.strictEqual(new Set(all).size, g.cards * n);
      const opts = g.auctionOptions();
      if (Math.random() < 0.5) g.act(g.turn, { type: 'auctionBid', value: pick(opts) });
      else g.act(g.turn, { type: 'auctionPass' });
    } else if (g.phase === 'chooseTrump') {
      g.act(g.turn, { type: 'trump', suit: pick(['oros', 'copas', 'espadas', 'bastos']) });
    } else if (g.phase === 'bidding') {
      const s = g.turn;
      if (g.bids.every((b) => b === null)) {
        // Sale pidiéndose el de la derecha del que reparte (salvo quien ganó la subasta)
        assert.strictEqual(s, g.handType === 'subasta' && g.auctionWinner === g.mano ? g.next(g.mano) : g.mano);
      }
      const opts = [];
      for (let k = 0; k <= g.cards; k++) if (!(s === g.lastBidder() && k === g.forbiddenBid())) opts.push(k);
      g.act(s, { type: 'bid', value: pick(opts) });
      if (g.phase === 'playing') {
        const sum = g.bids.reduce((a, b) => a + b, 0);
        assert.notStrictEqual(sum, g.cards, 'la suma de apuestas no puede igualar las bazas');
        assert.strictEqual(g.turn, g.mano, 'siempre sale el de la derecha del que reparte');
      }
    } else if (g.phase === 'playing') {
      const s = g.turn;
      if (g.handType === 'indio') {
        const v = g.viewFor(s);
        assert.strictEqual(v.myHand[0].id, 'hidden', 'en el indio no ves tu carta');
        assert(v.othersHands.every((h, i) => (i === s ? h === null : h.length === g.hands[i].length)));
        assert(!JSON.stringify(v.myHand).includes(g.hands[s][0].id), 'no se filtra la carta propia');
        g.act(s, { type: 'play', card: 'hidden' });
        continue;
      }
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
  const { musDraw } = require('../src/mus');
  const d = musDraw();
  const g = new Mus(players(4), { ...settings, mano: d.mano, draw: d.steps });
  let steps = 0;
  while (!g.isFinished()) {
    if (++steps > 200000) throw new Error('bucle infinito mus');
    if (g.phase === 'draw') {
      g.tick();
      if (g.phase === 'mus') assert.strictEqual(g.mano, 1);
    } else if (g.phase === 'mus') {
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
  const desc = (g) => g.sequence.map((h) => (h.type === 'indio' ? 'I' : h.type === 'subasta' ? 'S' : String(h.cards))).join(',');
  assert.strictEqual(desc(new Pocha(players(3), {})), 'I,1,2,3,4,5,6,7,8,9,10,11,12,S,S,S,12,11,10,9,8,7,6,5,4,3,2,1,I');
  assert.strictEqual(desc(new Pocha(players(4), {})), 'I,1,2,3,4,5,6,7,8,9,S,S,S,S,9,8,7,6,5,4,3,2,1,I');
  assert.strictEqual(desc(new Pocha(players(5), {})), 'I,1,2,3,4,5,6,7,S,S,S,S,S,7,6,5,4,3,2,1,I');
  assert.strictEqual(new Pocha(players(3), {}).max, 13);

  // Subasta: mínimo = mitad de las bazas; si nadie puja dos veces, baja el mínimo
  // y el primero que se pide el nuevo mínimo se lo queda
  const g = new Pocha(players(4), {});
  g.handIndex = 10;
  g.startHand();
  assert.strictEqual(g.phase, 'auction');
  assert.deepStrictEqual(g.auctionOptions(), [5, 6, 7, 8, 9, 10]);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) g.act(g.turn, { type: 'auctionPass' });
  assert.strictEqual(g.auction.reduced, true);
  assert.deepStrictEqual(g.auctionOptions(), [4]);
  g.act(g.turn, { type: 'auctionPass' });
  const s = g.turn;
  g.act(s, { type: 'auctionBid', value: 4 });
  assert.strictEqual(g.phase, 'chooseTrump');
  assert.strictEqual(g.auctionWinner, s);
  g.act(s, { type: 'trump', suit: 'bastos' });
  assert.strictEqual(g.trump, 'bastos');
  assert.strictEqual(g.bids[s], 4);

  // Subasta normal: se puede subir la puja hasta que los demás pasen
  const h = new Pocha(players(3), {});
  h.handIndex = 13;
  h.startHand();
  assert.strictEqual(h.cards, 13);
  const a = h.turn;
  h.act(a, { type: 'auctionBid', value: 6 });
  const b = h.turn;
  h.act(b, { type: 'auctionBid', value: 7 });
  h.act(h.turn, { type: 'auctionPass' }); // el tercero pasa
  assert.strictEqual(h.turn, a); // vuelve al primero, que puede subir
  h.act(a, { type: 'auctionPass' });
  assert.strictEqual(h.auctionWinner, b);
}

function musDrawChecks() {
  const { musDraw } = require('../src/mus');
  for (let k = 0; k < 500; k++) {
    const d = musDraw();
    assert.deepStrictEqual([...d.order].sort(), [0, 1, 2, 3]);
    const kingSeats = d.steps.filter((s) => s.card.r === 12).map((s) => s.seat);
    assert.deepStrictEqual(kingSeats, [1, 3], 'los dos reyes van juntos y el primero es mano');
    assert.strictEqual(d.mano, 1);
    // Al que ya sacó rey no se le vuelve a tirar
    const firstKing = d.steps.findIndex((s) => s.card.r === 12);
    assert(d.steps.slice(firstKing + 1).every((s) => s.seat !== 1));
  }
}

musChecks();
pochaChecks();
musDrawChecks();
let t = Date.now();
for (let i = 0; i < 300; i++) simPocha(3 + (i % 3));
console.log(`Pocha: 300 partidas simuladas OK (${Date.now() - t} ms)`);
t = Date.now();
for (let i = 0; i < 300; i++) simMus({ puntos: i % 2 ? 30 : 40, juegos: 1 + (i % 3), ochoReyes: i % 4 !== 0 });
console.log(`Mus: 300 partidas simuladas OK (${Date.now() - t} ms)`);
