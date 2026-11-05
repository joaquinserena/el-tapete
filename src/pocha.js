// Motor de la Pocha (normas Fournier + variantes del grupo)
// 3, 4 o 5 jugadores con la baraja entera (con 3 sobra una carta en las rondas de subasta).
//
// Rondas: indio (1 carta, ves las de los demás y no la tuya), 1, 2, ... hasta max-1,
// tantas subastas como jugadores (se reparte todo), y luego max-1 ... 1 e indio otra vez.
// Turno: el mano es el de la derecha del que reparte (asiento siguiente) y siempre sale él.
const { makeDeck, shuffle, SUITS } = require('./cards');

// Orden de las cartas: as, rey, caballo, sota, 7, 6, 5, 4, 3, 2
const POWER = { 1: 10, 12: 9, 11: 8, 10: 7, 7: 6, 6: 5, 5: 4, 4: 3, 3: 2, 2: 1 };
const SUIT_ORDER = { oros: 0, copas: 1, espadas: 2, bastos: 3 };

function sortHand(hand, trump) {
  return hand.slice().sort((a, b) => {
    const sa = a.s === trump ? -1 : SUIT_ORDER[a.s];
    const sb = b.s === trump ? -1 : SUIT_ORDER[b.s];
    if (sa !== sb) return sa - sb;
    return POWER[b.r] - POWER[a.r];
  });
}

function buildSequence(n) {
  const max = Math.floor(40 / n); // 3 -> 13, 4 -> 10, 5 -> 8
  const up = [{ type: 'indio', cards: 1 }];
  for (let i = 1; i < max; i++) up.push({ type: 'normal', cards: i });
  const subastas = Array.from({ length: n }, () => ({ type: 'subasta', cards: max }));
  const down = up.slice().reverse().map((h) => ({ ...h }));
  return { max, sequence: [...up, ...subastas, ...down] };
}

class Pocha {
  constructor(players, settings = {}) {
    this.game = 'pocha';
    this.players = players; // [{id, name}]
    this.n = players.length;
    if (this.n < 3 || this.n > 5) throw new Error('La pocha se juega con 3, 4 o 5 personas');
    this.settings = {};
    const { max, sequence } = buildSequence(this.n);
    this.max = max;
    this.sequence = sequence;

    this.handIndex = 0;
    this.scores = Array(this.n).fill(0);
    this.history = [];
    this.stats = Array.from({ length: this.n }, () => ({
      aciertos: 0, fallos: 0, bazas: 0, racha: 0, mejorRacha: 0, manos: 0, subastas: 0, subastasCumplidas: 0,
    }));
    this.tiebreak = false;

    // Sorteo: se tiran cartas de una en una (empezando por alguien al azar); al primer rey le toca repartir
    this.resetHandState();
    this.draw = this.makeDraw();
    this.dealer = this.draw.winner;
    this.mano = this.next(this.dealer);
    this.drawShown = 0;
    this.phase = 'draw';
    this.turn = null;
  }

  next(seat) { return (seat + 1) % this.n; }
  fromMano() { return Array.from({ length: this.n }, (_, i) => (this.mano + i) % this.n); }

  makeDraw() {
    const deck = shuffle(makeDeck());
    let seat = Math.floor(Math.random() * this.n);
    const steps = [];
    for (const card of deck) {
      steps.push({ seat, card });
      if (card.r === 12) return { steps, winner: seat };
      seat = this.next(seat);
    }
    return { steps, winner: seat };
  }

  resetHandState() {
    this.hands = Array.from({ length: this.n }, () => []);
    this.bids = Array(this.n).fill(null);
    this.tricks = Array(this.n).fill(0);
    this.trick = [];
    this.lastTrick = null;
    this.trickDone = null;
    this.ready = new Set();
    this.handResult = null;
    this.trump = null;
    this.trumpCard = null;
    this.trumpFromDealer = false;
    this.auction = null;
    this.auctionWinner = null;
    this.bidOrder = [];
    this.cards = 0;
    this.handType = null;
  }

  startHand() {
    const h = this.sequence[this.handIndex];
    this.resetHandState();
    this.handType = h.type;
    this.cards = h.cards;
    this.mano = this.next(this.dealer);
    if (h.type === 'subasta') {
      const min = Math.floor(h.cards / 2);
      this.auction = { min, startMin: min, reduced: false, attempt: 1, redeals: 0, highest: null, highestSeat: null, passed: [] };
      this.deal();
      this.startAuctionRound();
    } else {
      this.deal();
      this.bidOrder = this.fromMano();
      this.phase = 'bidding';
      this.turn = this.bidOrder[0];
    }
  }

  deal() {
    const deck = shuffle(makeDeck());
    this.hands = Array.from({ length: this.n }, () => []);
    let idx = 0;
    for (let k = 0; k < this.cards; k++) {
      for (let i = 0; i < this.n; i++) this.hands[(this.mano + i) % this.n].push(deck[idx++]);
    }
    if (this.handType === 'subasta') {
      // El triunfo lo elige quien gane la subasta. Con 3 jugadores sobra una carta que nadie ve.
      this.trump = null;
      this.trumpCard = null;
    } else if (idx < deck.length) {
      this.trumpCard = deck[idx];
      this.trump = this.trumpCard.s;
      this.trumpFromDealer = false;
    } else {
      const dh = this.hands[this.dealer];
      this.trumpCard = dh[dh.length - 1];
      this.trump = this.trumpCard.s;
      this.trumpFromDealer = true;
    }
    this.sortHands();
  }

  sortHands() {
    for (let i = 0; i < this.n; i++) this.hands[i] = sortHand(this.hands[i], this.trump);
  }

  // ---------- subasta ----------
  startAuctionRound() {
    const A = this.auction;
    A.highest = null;
    A.highestSeat = null;
    A.passed = [];
    this.phase = 'auction';
    this.turn = this.mano;
  }

  auctionOptions() {
    const A = this.auction;
    if (A.reduced) return [A.min];
    const lo = Math.max(A.min, A.highest === null ? A.min : A.highest + 1);
    const opts = [];
    for (let v = lo; v <= this.cards; v++) opts.push(v);
    return opts;
  }

  auctionBid(seat, v) {
    if (this.phase !== 'auction') throw new Error('No es momento de subastar');
    if (seat !== this.turn) throw new Error('No es tu turno');
    if (!this.auctionOptions().includes(v)) throw new Error('Puja no válida');
    const A = this.auction;
    A.highest = v;
    A.highestSeat = seat;
    // Si se ha bajado el mínimo, el primero que se lo pide se lo queda
    if (A.reduced || v === this.cards) return this.winAuction(seat, v);
    this.advanceAuction(seat);
  }

  auctionPass(seat) {
    if (this.phase !== 'auction') throw new Error('No es momento de subastar');
    if (seat !== this.turn) throw new Error('No es tu turno');
    const A = this.auction;
    A.passed.push(seat);
    this.advanceAuction(seat);
  }

  advanceAuction(from) {
    const A = this.auction;
    const others = [];
    for (let i = 1; i <= this.n; i++) {
      const s = (from + i) % this.n;
      if (!A.passed.includes(s) && s !== A.highestSeat) others.push(s);
    }
    if (others.length) {
      this.turn = others[0];
      return;
    }
    if (A.highestSeat !== null) return this.winAuction(A.highestSeat, A.highest);
    // Nadie ha pujado
    if (!A.reduced && A.attempt < 2) {
      A.attempt++;
    } else {
      A.reduced = true;
      A.min--;
    }
    A.redeals++;
    this.deal();
    if (A.min <= 0) return this.winAuction(this.mano, 0);
    this.startAuctionRound();
  }

  winAuction(seat, v) {
    this.auctionWinner = seat;
    this.bids[seat] = v;
    this.stats[seat].subastas++;
    this.phase = 'chooseTrump';
    this.turn = seat;
  }

  chooseTrump(seat, suit) {
    if (this.phase !== 'chooseTrump') throw new Error('No es momento de elegir triunfo');
    if (seat !== this.auctionWinner) throw new Error('El triunfo lo elige quien ha ganado la subasta');
    if (!SUITS.includes(suit)) throw new Error('Palo no válido');
    this.trump = suit;
    this.sortHands();
    this.bidOrder = this.fromMano().filter((s) => s !== this.auctionWinner);
    this.phase = 'bidding';
    this.turn = this.bidOrder[0];
  }

  // ---------- apuestas ----------
  lastBidder() { return this.bidOrder[this.bidOrder.length - 1]; }

  forbiddenBid() {
    // El último en pedirse no puede hacer que la suma sea igual al número de bazas
    const last = this.lastBidder();
    const others = this.bids.reduce((s, b, i) => (i === last || b === null ? s : s + b), 0);
    const f = this.cards - others;
    return f >= 0 && f <= this.cards ? f : null;
  }

  bid(seat, v) {
    if (this.phase !== 'bidding') throw new Error('No es momento de pedirse');
    if (seat !== this.turn) throw new Error('No es tu turno');
    if (!Number.isInteger(v) || v < 0 || v > this.cards) throw new Error('Número no válido');
    const last = this.lastBidder();
    if (seat === last && v === this.forbiddenBid()) {
      throw new Error(`Eres el último en pedirte: no puedes pedir ${v}, la suma no puede ser igual al número de bazas`);
    }
    this.bids[seat] = v;
    if (seat === last) {
      this.phase = 'playing';
      this.turn = this.mano;
    } else {
      this.turn = this.bidOrder[this.bidOrder.indexOf(seat) + 1];
    }
  }

  // ---------- juego de bazas ----------
  currentWinner(trick) {
    let best = trick[0];
    for (const t of trick.slice(1)) {
      const c = t.card;
      const b = best.card;
      if (c.s === b.s) {
        if (POWER[c.r] > POWER[b.r]) best = t;
      } else if (c.s === this.trump) {
        best = t;
      }
    }
    return best;
  }

  legalCards(seat) {
    const hand = this.hands[seat];
    if (this.trick.length === 0) return hand;
    const led = this.trick[0].card.s;
    const win = this.currentWinner(this.trick).card;
    const follow = hand.filter((c) => c.s === led);
    if (follow.length) {
      // Asistir y, si la baza no está fallada, montar si se puede
      if (win.s === led) {
        const higher = follow.filter((c) => POWER[c.r] > POWER[win.r]);
        if (higher.length) return higher;
      }
      return follow;
    }
    const trumps = hand.filter((c) => c.s === this.trump);
    if (trumps.length) {
      if (win.s === this.trump) {
        const higher = trumps.filter((c) => POWER[c.r] > POWER[win.r]);
        if (higher.length) return higher;
        return hand; // no puede montar: juega lo que quiera
      }
      return trumps; // obligado a fallar
    }
    return hand;
  }

  act(seat, a) {
    if (this.phase === 'finished') throw new Error('La partida ha terminado');
    switch (a.type) {
      case 'auctionBid': return this.auctionBid(seat, Number(a.value));
      case 'auctionPass': return this.auctionPass(seat);
      case 'trump': return this.chooseTrump(seat, a.suit);
      case 'bid': return this.bid(seat, Number(a.value));
      case 'play': return this.play(seat, a.card);
      case 'ready': return this.setReady(seat);
      default: throw new Error('Acción desconocida');
    }
  }

  play(seat, cardId) {
    if (this.phase !== 'playing') throw new Error('No es momento de jugar carta');
    if (seat !== this.turn) throw new Error('No es tu turno');
    // En el indio no ves tu carta: juegas "la que tengas"
    if (this.handType === 'indio' && cardId === 'hidden' && this.hands[seat].length) cardId = this.hands[seat][0].id;
    const legal = this.legalCards(seat);
    const card = legal.find((c) => c.id === cardId);
    if (!card) throw new Error('No puedes jugar esa carta (hay que asistir, montar o fallar)');
    this.hands[seat] = this.hands[seat].filter((c) => c.id !== cardId);
    this.trick.push({ seat, card });
    if (this.trick.length === this.n) {
      const w = this.currentWinner(this.trick).seat;
      this.trickDone = { cards: this.trick, winner: w };
      this.phase = 'trickDone';
      this.turn = null;
    } else {
      this.turn = this.next(seat);
    }
  }

  tickDelay() {
    if (this.phase === 'trickDone') return 1400;
    if (this.phase === 'draw') return this.drawShown < this.draw.steps.length ? 650 : 3000;
    return null;
  }

  tick() {
    if (this.phase === 'draw') {
      if (this.drawShown < this.draw.steps.length) this.drawShown++;
      else this.startHand();
      return;
    }
    if (this.phase !== 'trickDone') return;
    const { winner } = this.trickDone;
    this.tricks[winner]++;
    this.lastTrick = this.trickDone;
    this.trickDone = null;
    this.trick = [];
    if (this.hands.every((h) => h.length === 0)) {
      this.endHand();
    } else {
      this.phase = 'playing';
      this.turn = winner;
    }
  }

  endHand() {
    const points = this.bids.map((b, i) => {
      const t = this.tricks[i];
      return b === t ? 10 + 5 * t : -5 * Math.abs(b - t);
    });
    points.forEach((p, i) => {
      this.scores[i] += p;
      const st = this.stats[i];
      st.manos++;
      st.bazas += this.tricks[i];
      if (this.bids[i] === this.tricks[i]) {
        st.aciertos++;
        st.racha++;
        st.mejorRacha = Math.max(st.mejorRacha, st.racha);
        if (this.handType === 'subasta' && i === this.auctionWinner) st.subastasCumplidas++;
      } else {
        st.fallos++;
        st.racha = 0;
      }
    });
    this.history.push({
      type: this.handType, cards: this.cards, bids: this.bids.slice(), tricks: this.tricks.slice(), points,
      totals: this.scores.slice(), trump: this.trump, auctionWinner: this.auctionWinner,
    });
    this.handResult = { points };
    this.phase = 'handEnd';
    this.turn = null;
    this.ready = new Set();
  }

  setReady(seat) {
    if (this.phase !== 'handEnd') return;
    this.ready.add(seat);
    if (this.ready.size >= this.n) this.nextHand();
  }

  forceReady(seats) {
    if (this.phase !== 'handEnd') return;
    seats.forEach((s) => this.ready.add(s));
    if (this.ready.size >= this.n) this.nextHand();
  }

  nextHand() {
    this.handIndex++;
    this.dealer = this.next(this.dealer);
    if (this.handIndex >= this.sequence.length) {
      const best = Math.max(...this.scores);
      const leaders = this.scores.filter((s) => s === best).length;
      if (leaders > 1) {
        // Empate: manos extra de una carta hasta deshacerlo
        this.tiebreak = true;
        this.sequence.push({ type: 'normal', cards: 1 });
      } else {
        this.phase = 'finished';
        this.turn = null;
        return;
      }
    }
    this.startHand();
  }

  // ---------- tiempo máximo por decisión ----------
  timerInfo() {
    if (['auction', 'chooseTrump', 'bidding', 'playing'].includes(this.phase)) return { seats: [this.turn], ms: 10000 };
    if (this.phase === 'handEnd') {
      return { seats: Array.from({ length: this.n }, (_, i) => i).filter((s) => !this.ready.has(s)), ms: 25000 };
    }
    return null;
  }

  // Lo que se juega solo si se acaba el tiempo
  autoAct(seat) {
    switch (this.phase) {
      case 'auction': return this.auctionPass(seat);
      case 'chooseTrump': {
        const count = {};
        for (const c of this.hands[seat]) count[c.s] = (count[c.s] || 0) + 1;
        const suit = SUITS.slice().sort((a, b) => (count[b] || 0) - (count[a] || 0))[0];
        return this.chooseTrump(seat, suit);
      }
      case 'bidding': {
        const v = seat === this.lastBidder() && this.forbiddenBid() === 0 ? 1 : 0;
        return this.bid(seat, v);
      }
      case 'playing': {
        if (this.handType === 'indio') return this.play(seat, 'hidden');
        const legal = this.legalCards(seat).slice().sort((a, b) =>
          (a.s === this.trump) - (b.s === this.trump) || POWER[a.r] - POWER[b.r]);
        return this.play(seat, legal[0].id);
      }
      case 'handEnd': return this.setReady(seat);
      default: return undefined;
    }
  }

  isFinished() { return this.phase === 'finished'; }

  winners() {
    const best = Math.max(...this.scores);
    return this.scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  }

  summary() {
    const ranking = this.scores
      .map((s, i) => ({ seat: i, score: s }))
      .sort((a, b) => b.score - a.score);
    return {
      winners: this.winners(),
      ranking,
      perSeat: this.stats.map((st, i) => ({ ...st, puntos: this.scores[i] })),
    };
  }

  viewFor(seat) {
    const isMine = seat !== null && seat !== undefined && seat >= 0;
    const indio = this.handType === 'indio' && this.phase !== 'handEnd';
    const view = {
      game: 'pocha',
      phase: this.phase,
      n: this.n,
      settings: this.settings,
      handNumber: this.handIndex + 1,
      totalHands: this.sequence.length,
      sequence: this.sequence,
      handType: this.handType,
      cards: this.cards,
      dealer: this.dealer,
      mano: this.mano,
      turn: this.turn,
      trump: this.trump,
      trumpCard: this.trumpCard,
      trumpFromDealer: this.trumpFromDealer,
      bids: this.bids,
      bidOrder: this.bidOrder,
      tricks: this.tricks,
      trick: this.trickDone ? this.trickDone.cards : this.trick,
      trickWinner: this.trickDone ? this.trickDone.winner : null,
      lastTrick: this.lastTrick,
      handSizes: this.hands.map((h) => h.length),
      scores: this.scores,
      history: this.history,
      ready: [...this.ready],
      tiebreak: this.tiebreak,
      myHand: [],
      othersHands: null,
      legal: [],
      forbiddenBid: null,
      auction: this.auction && {
        min: this.auction.min, startMin: this.auction.startMin, reduced: this.auction.reduced,
        attempt: this.auction.attempt, redeals: this.auction.redeals, highest: this.auction.highest,
        highestSeat: this.auction.highestSeat, passed: this.auction.passed,
      },
      auctionWinner: this.auctionWinner,
      auctionOptions: [],
    };
    if (this.phase === 'draw') {
      view.draw = {
        steps: this.draw.steps.slice(0, this.drawShown),
        done: this.drawShown >= this.draw.steps.length,
        dealer: this.dealer,
        mano: this.mano,
      };
      return view;
    }
    if (isMine) {
      if (indio) {
        // Ves las cartas de los demás, pero no la tuya
        view.myHand = this.hands[seat].map(() => ({ id: 'hidden', hidden: true }));
        view.othersHands = this.hands.map((h, i) => (i === seat ? null : h));
      } else {
        view.myHand = this.hands[seat];
      }
      if (this.phase === 'playing' && this.turn === seat) {
        view.legal = indio ? ['hidden'] : this.legalCards(seat).map((c) => c.id);
      }
      if (this.phase === 'bidding' && this.turn === seat && seat === this.lastBidder()) {
        view.forbiddenBid = this.forbiddenBid();
      }
      if (this.phase === 'auction' && this.turn === seat) view.auctionOptions = this.auctionOptions();
    }
    if (this.phase === 'finished') view.summary = this.summary();
    return view;
  }
}

module.exports = { Pocha, POWER, buildSequence };
