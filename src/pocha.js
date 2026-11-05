// Motor de la Pocha (normas Fournier)
// 3 a 5 jugadores. Con 3 se quitan los doses.
const { makeDeck, shuffle } = require('./cards');

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

class Pocha {
  constructor(players, settings = {}) {
    this.game = 'pocha';
    this.players = players; // [{id, name}]
    this.n = players.length;
    if (this.n < 3 || this.n > 5) throw new Error('La pocha se juega con 3, 4 o 5 personas');
    this.settings = { modo: settings.modo === 'corta' ? 'corta' : 'completa' };
    this.exclude = this.n === 3 ? [2] : [];
    this.deckSize = 40 - this.exclude.length * 4;
    this.max = Math.floor(this.deckSize / this.n);

    const up = [];
    for (let i = 1; i < this.max; i++) up.push(i);
    const down = up.slice().reverse();
    const top = this.settings.modo === 'corta' ? [this.max] : Array(this.n).fill(this.max);
    this.sequence = [...up, ...top, ...down];

    this.handIndex = 0;
    this.dealer = Math.floor(Math.random() * this.n);
    this.scores = Array(this.n).fill(0);
    this.history = []; // por mano: {cards, bids, tricks, points}
    this.stats = Array.from({ length: this.n }, () => ({
      aciertos: 0, fallos: 0, bazas: 0, racha: 0, mejorRacha: 0, manos: 0,
    }));
    this.tiebreak = false;
    this.startHand();
  }

  next(seat) { return (seat + 1) % this.n; }

  startHand() {
    const cards = this.sequence[this.handIndex];
    this.cards = cards;
    this.mano = this.next(this.dealer);
    const deck = shuffle(makeDeck(this.exclude));
    this.hands = Array.from({ length: this.n }, () => []);
    let idx = 0;
    for (let k = 0; k < cards; k++) {
      for (let i = 0; i < this.n; i++) {
        const seat = (this.mano + i) % this.n;
        this.hands[seat].push(deck[idx++]);
      }
    }
    if (idx < deck.length) {
      this.trumpCard = deck[idx];
      this.trumpFromDealer = false;
    } else {
      // Se reparte toda la baraja: la última carta del que reparte marca el triunfo
      const dh = this.hands[this.dealer];
      this.trumpCard = dh[dh.length - 1];
      this.trumpFromDealer = true;
    }
    this.trump = this.trumpCard.s;
    for (let i = 0; i < this.n; i++) this.hands[i] = sortHand(this.hands[i], this.trump);
    this.bids = Array(this.n).fill(null);
    this.tricks = Array(this.n).fill(0);
    this.trick = [];
    this.lastTrick = null;
    this.trickDone = null;
    this.turn = this.mano;
    this.phase = 'bidding';
    this.ready = new Set();
    this.handResult = null;
  }

  forbiddenBid() {
    // Solo afecta al que reparte (último en hablar)
    const others = this.bids.reduce((s, b, i) => (i === this.dealer || b === null ? s : s + b), 0);
    const f = this.cards - others;
    return f >= 0 && f <= this.cards ? f : null;
  }

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
      case 'bid': return this.bid(seat, Number(a.value));
      case 'play': return this.play(seat, a.card);
      case 'ready': return this.setReady(seat);
      default: throw new Error('Acción desconocida');
    }
  }

  bid(seat, v) {
    if (this.phase !== 'bidding') throw new Error('No es momento de apostar');
    if (seat !== this.turn) throw new Error('No es tu turno');
    if (!Number.isInteger(v) || v < 0 || v > this.cards) throw new Error('Apuesta no válida');
    if (seat === this.dealer && v === this.forbiddenBid()) {
      throw new Error(`Como repartes, no puedes pedir ${v}: la suma no puede ser igual al número de bazas`);
    }
    this.bids[seat] = v;
    if (seat === this.dealer) {
      this.phase = 'playing';
      this.turn = this.mano;
    } else {
      this.turn = this.next(seat);
    }
  }

  play(seat, cardId) {
    if (this.phase !== 'playing') throw new Error('No es momento de jugar carta');
    if (seat !== this.turn) throw new Error('No es tu turno');
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

  // Pausa para que se vea la baza completa
  tickDelay() { return this.phase === 'trickDone' ? 1400 : null; }

  tick() {
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
      } else {
        st.fallos++;
        st.racha = 0;
      }
    });
    this.history.push({
      cards: this.cards, bids: this.bids.slice(), tricks: this.tricks.slice(), points,
      totals: this.scores.slice(), trump: this.trump,
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
        this.sequence.push(1);
      } else {
        this.phase = 'finished';
        this.turn = null;
        return;
      }
    }
    this.startHand();
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
    const view = {
      game: 'pocha',
      phase: this.phase,
      n: this.n,
      settings: this.settings,
      handNumber: this.handIndex + 1,
      totalHands: this.sequence.length,
      sequence: this.sequence,
      cards: this.cards,
      dealer: this.dealer,
      mano: this.mano,
      turn: this.turn,
      trump: this.trump,
      trumpCard: this.trumpCard,
      trumpFromDealer: this.trumpFromDealer,
      bids: this.bids,
      tricks: this.tricks,
      trick: this.trickDone ? this.trickDone.cards : this.trick,
      trickWinner: this.trickDone ? this.trickDone.winner : null,
      lastTrick: this.lastTrick,
      handSizes: this.hands.map((h) => h.length),
      scores: this.scores,
      history: this.history,
      ready: [...this.ready],
      tiebreak: this.tiebreak,
      myHand: isMine ? this.hands[seat] : [],
      legal: [],
      forbiddenBid: null,
    };
    if (isMine && this.phase === 'playing' && this.turn === seat) {
      view.legal = this.legalCards(seat).map((c) => c.id);
    }
    if (isMine && this.phase === 'bidding' && this.turn === seat && seat === this.dealer) {
      view.forbiddenBid = this.forbiddenBid();
    }
    if (this.phase === 'finished') view.summary = this.summary();
    return view;
  }
}

module.exports = { Pocha, POWER };
