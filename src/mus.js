// Motor del Mus a 4 (dos parejas), normas Fournier
// Asientos 0..3. Pareja A = asientos 0 y 2, pareja B = 1 y 3.
// El turno avanza seat -> seat+1 (en la mesa se dibuja en sentido antihorario).
const { makeDeck, shuffle } = require('./cards');

const LANCE_NAMES = { grande: 'Grande', chica: 'Chica', pares: 'Pares', juego: 'Juego', punto: 'Punto' };
const JUEGO_ORDER = [31, 32, 40, 37, 36, 35, 34, 33];

const team = (s) => s % 2;
const nextSeat = (s) => (s + 1) % 4;

function cmpKeys(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity;
    const y = b[i] ?? -Infinity;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

class Mus {
  constructor(players, settings = {}) {
    this.game = 'mus';
    if (players.length !== 4) throw new Error('El mus se juega con 4 personas');
    this.players = players;
    this.n = 4;
    this.settings = {
      puntos: Number(settings.puntos) === 30 ? 30 : 40,
      juegos: [1, 2, 3].includes(Number(settings.juegos)) ? Number(settings.juegos) : 3,
      ochoReyes: settings.ochoReyes !== false,
    };
    this.scores = [0, 0];
    this.juegos = [0, 0];
    this.piedrasTotales = [0, 0];
    this.mano = Number.isInteger(settings.mano) ? settings.mano : Math.floor(Math.random() * 4);
    this.roundNumber = 0;
    this.matchWinner = null;
    this.stats = Array.from({ length: 4 }, () => ({
      manos: 0, ordagos: 0, ordagosGanados: 0, treintaYUna: 0, duples: 0, medias: 0, musCortados: 0,
    }));
    // Sorteo de parejas ya hecho por el servidor (solo para enseñarlo en la mesa)
    this.drawSteps = Array.isArray(settings.draw) ? settings.draw : null;
    if (this.drawSteps) {
      this.initEmpty();
      this.drawShown = 0;
      this.phase = 'draw';
      this.turn = null;
    } else {
      this.startRound();
    }
  }

  initEmpty() {
    this.hands = [[], [], [], []];
    this.dealer = (this.mano + 3) % 4;
    this.musSaid = {};
    this.pendingDiscard = {};
    this.musRounds = 0;
    this.said = [null, null, null, null];
    this.records = [];
    this.bet = null;
    this.lance = null;
    this.declared = { pares: null, juego: null };
    this.breakdown = [];
    this.juegoWinner = null;
    this.ordagoResult = null;
    this.ready = new Set();
    this.log = [];
  }

  // ---------- valoración de manos ----------
  nr(c) {
    if (this.settings.ochoReyes) {
      if (c.r === 3) return 12;
      if (c.r === 2) return 1;
    }
    return c.r;
  }
  jv(c) { const v = this.nr(c); return v >= 10 ? 10 : v; }
  sum(seat) { return this.hands[seat].reduce((s, c) => s + this.jv(c), 0); }
  ranks(seat) { return this.hands[seat].map((c) => this.nr(c)); }

  pares(seat) {
    const counts = {};
    for (const r of this.ranks(seat)) counts[r] = (counts[r] || 0) + 1;
    const groups = Object.entries(counts).map(([r, n]) => ({ r: Number(r), n })).sort((a, b) => b.r - a.r);
    const four = groups.find((g) => g.n === 4);
    if (four) return { type: 3, key: [3, four.r, four.r], name: 'Duples' };
    const pairs = groups.filter((g) => g.n === 2);
    if (pairs.length === 2) return { type: 3, key: [3, pairs[0].r, pairs[1].r], name: 'Duples' };
    const three = groups.find((g) => g.n === 3);
    if (three) return { type: 2, key: [2, three.r], name: 'Medias' };
    if (pairs.length === 1) return { type: 1, key: [1, pairs[0].r], name: 'Par' };
    return null;
  }
  hasJuego(seat) { return this.sum(seat) >= 31; }
  juegoValue(seat) { const s = this.sum(seat); return s === 31 ? 3 : s >= 31 ? 2 : 0; }

  key(lance, seat) {
    const r = this.ranks(seat);
    switch (lance) {
      case 'grande': return r.sort((a, b) => b - a);
      case 'chica': return r.sort((a, b) => a - b).map((x) => -x);
      case 'pares': { const p = this.pares(seat); return p ? p.key : [0]; }
      case 'juego': { const s = this.sum(seat); return s >= 31 ? [8 - JUEGO_ORDER.indexOf(s)] : [-1]; }
      case 'punto': return [this.sum(seat)];
      default: return [0];
    }
  }

  // Asientos ordenados empezando por el mano
  fromMano(seats) {
    return seats.slice().sort((a, b) => ((a - this.mano + 4) % 4) - ((b - this.mano + 4) % 4));
  }
  // Asientos ordenados empezando por el siguiente a `seat`
  fromNext(seat, seats) {
    return seats.slice().sort((a, b) => ((a - seat + 3) % 4) - ((b - seat + 3) % 4));
  }

  best(lance, seats) {
    let bestSeat = null;
    for (const s of this.fromMano(seats)) {
      if (bestSeat === null || cmpKeys(this.key(lance, s), this.key(lance, bestSeat)) > 0) bestSeat = s;
    }
    return bestSeat; // en empate gana el más cercano al mano
  }

  teamValue(lance, t) {
    let v = 0;
    for (const s of [t, t + 2]) {
      if (lance === 'pares') { const p = this.pares(s); if (p) v += p.type; }
      if (lance === 'juego') v += this.juegoValue(s);
    }
    return v;
  }

  // ---------- ronda ----------
  startRound() {
    this.roundNumber++;
    this.deck = shuffle(makeDeck());
    this.discardPile = [];
    this.hands = [[], [], [], []];
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 4; i++) this.hands[(this.mano + i) % 4].push(this.deck.pop());
    }
    this.sortHands();
    this.dealer = (this.mano + 3) % 4;
    this.phase = 'mus';
    this.turn = this.mano;
    this.musSaid = {};
    this.pendingDiscard = {};
    this.musRounds = 0;
    this.said = [null, null, null, null];
    this.records = [];
    this.bet = null;
    this.lance = null;
    this.declared = { pares: null, juego: null };
    this.breakdown = [];
    this.juegoWinner = null;
    this.ordagoResult = null;
    this.ready = new Set();
    this.log = [];
    for (const st of this.stats) st.manos++;
  }

  sortHands() {
    for (let i = 0; i < 4; i++) this.hands[i].sort((a, b) => this.nr(b) - this.nr(a) || a.s.localeCompare(b.s));
  }

  name(seat) { return this.players[seat].name; }
  addLog(t) { this.log.push(t); if (this.log.length > 40) this.log.shift(); }

  act(seat, a) {
    if (this.phase === 'finished') throw new Error('La partida ha terminado');
    switch (a.type) {
      case 'mus': return this.doMus(seat, true);
      case 'nomus': return this.doMus(seat, false);
      case 'discard': return this.doDiscard(seat, a.cards);
      case 'paso': return this.doPaso(seat);
      case 'envido': return this.doEnvido(seat, a.value);
      case 'ordago': return this.doOrdago(seat);
      case 'quiero': return this.doQuiero(seat);
      case 'noquiero': return this.doNoQuiero(seat);
      case 'ready': return this.setReady(seat);
      default: throw new Error('Acción desconocida');
    }
  }

  doMus(seat, wants) {
    if (this.phase !== 'mus') throw new Error('No es momento de mus');
    if (seat !== this.turn) throw new Error('No es tu turno');
    if (wants) {
      this.musSaid[seat] = true;
      this.said[seat] = 'Mus';
      this.addLog(`${this.name(seat)}: mus`);
      this.turn = nextSeat(seat);
      if (this.turn === this.mano) {
        this.phase = 'discard';
        this.turn = null;
        this.pendingDiscard = {};
      }
    } else {
      this.said[seat] = 'No hay mus';
      this.stats[seat].musCortados++;
      this.addLog(`${this.name(seat)}: no hay mus`);
      this.startLances();
    }
  }

  doDiscard(seat, cardIds) {
    if (this.phase !== 'discard') throw new Error('No es momento de descartar');
    if (this.pendingDiscard[seat]) throw new Error('Ya has descartado');
    if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 4) throw new Error('Elige de 1 a 4 cartas para descartar');
    const ids = [...new Set(cardIds)];
    if (!ids.every((id) => this.hands[seat].some((c) => c.id === id))) throw new Error('Carta no válida');
    this.pendingDiscard[seat] = ids;
    this.said[seat] = `Descarta ${ids.length}`;
    if (Object.keys(this.pendingDiscard).length === 4) this.applyDiscards();
  }

  draw() {
    if (this.deck.length === 0) {
      this.deck = shuffle(this.discardPile);
      this.discardPile = [];
    }
    return this.deck.pop();
  }

  applyDiscards() {
    const thrown = [];
    for (const seat of this.fromMano([0, 1, 2, 3])) {
      const ids = this.pendingDiscard[seat];
      const out = this.hands[seat].filter((c) => ids.includes(c.id));
      this.hands[seat] = this.hands[seat].filter((c) => !ids.includes(c.id));
      thrown.push(...out);
      for (let i = 0; i < out.length; i++) this.hands[seat].push(this.draw());
      this.addLog(`${this.name(seat)} se descarta de ${ids.length}`);
    }
    this.discardPile.push(...thrown);
    this.sortHands();
    this.musRounds++;
    this.pendingDiscard = {};
    this.musSaid = {};
    this.said = [null, null, null, null];
    this.phase = 'mus';
    this.turn = this.mano;
  }

  // ---------- lances ----------
  startLances() {
    this.lanceList = ['grande', 'chica', 'pares', 'juego'];
    this.lanceIdx = 0;
    this.beginLance();
  }

  beginLance() {
    if (this.lanceIdx >= this.lanceList.length) return this.endRound();
    let name = this.lanceList[this.lanceIdx];
    const all = [0, 1, 2, 3];
    let participants = this.fromMano(all);
    if (name === 'pares') {
      this.declared.pares = all.map((s) => !!this.pares(s));
      participants = participants.filter((s) => this.declared.pares[s]);
      this.addLog('Pares: ' + all.map((s) => `${this.name(s)} ${this.declared.pares[s] ? 'sí' : 'no'}`).join(', '));
    }
    if (name === 'juego') {
      this.declared.juego = all.map((s) => this.hasJuego(s));
      participants = participants.filter((s) => this.declared.juego[s]);
      if (participants.length === 0) {
        name = 'punto';
        participants = this.fromMano(all);
        this.addLog('Nadie tiene juego: se juega al punto');
      } else {
        this.addLog('Juego: ' + all.map((s) => `${this.name(s)} ${this.declared.juego[s] ? 'sí' : 'no'}`).join(', '));
      }
    }
    this.lance = name;
    this.said = [null, null, null, null];
    const teams = new Set(participants.map(team));
    if (teams.size < 2) {
      this.records.push({ lance: name, status: participants.length ? 'sinApuesta' : 'nadie', participants });
      this.lanceIdx++;
      return this.beginLance();
    }
    this.bet = {
      lance: name, participants, phase: 'open', queue: participants.slice(), amount: 0, prev: 1,
      bettorTeam: null, bettorSeat: null, responders: [], ordago: false,
    };
    this.phase = 'lance';
    this.turn = this.bet.queue[0];
  }

  nextLance() {
    this.bet = null;
    this.lanceIdx++;
    this.beginLance();
  }

  checkTurn(seat) {
    if (this.phase !== 'lance') throw new Error('No es momento de apostar');
    if (seat !== this.turn) throw new Error('No es tu turno');
  }

  doPaso(seat) {
    this.checkTurn(seat);
    const b = this.bet;
    if (b.phase !== 'open') throw new Error('Hay un envite: quiero, no quiero o sube');
    this.said[seat] = 'Paso';
    this.addLog(`${this.name(seat)} pasa a ${LANCE_NAMES[b.lance]}`);
    const i = b.queue.indexOf(seat);
    if (i === b.queue.length - 1) {
      this.records.push({ lance: b.lance, status: 'paso', participants: b.participants });
      this.nextLance();
    } else {
      this.turn = b.queue[i + 1];
    }
  }

  raise(seat, label) {
    const b = this.bet;
    b.bettorTeam = team(seat);
    b.bettorSeat = seat;
    b.responders = this.fromNext(seat, b.participants.filter((s) => team(s) !== team(seat)));
    b.phase = 'envite';
    this.said[seat] = label;
    this.turn = b.responders[0];
  }

  doEnvido(seat, value) {
    this.checkTurn(seat);
    const b = this.bet;
    if (b.ordago) throw new Error('Hay un órdago: quiero o no quiero');
    let v = Math.floor(Number(value) || 2);
    if (v < 2) v = 2;
    if (v > 40) v = 40;
    if (b.phase === 'open') {
      b.prev = 1;
      b.amount = v;
      this.addLog(`${this.name(seat)} envida ${v} a ${LANCE_NAMES[b.lance]}`);
      this.raise(seat, v === 2 ? 'Envido' : `Envido ${v}`);
    } else {
      b.prev = b.amount;
      b.amount += v;
      this.addLog(`${this.name(seat)}: ${v} más (${b.amount})`);
      this.raise(seat, `${v} más`);
    }
  }

  doOrdago(seat) {
    this.checkTurn(seat);
    const b = this.bet;
    if (b.ordago) throw new Error('Ya hay un órdago');
    b.prev = b.phase === 'open' ? 1 : b.amount;
    b.ordago = true;
    this.stats[seat].ordagos++;
    this.addLog(`¡${this.name(seat)} echa un órdago a ${LANCE_NAMES[b.lance]}!`);
    this.raise(seat, '¡Órdago!');
  }

  doQuiero(seat) {
    this.checkTurn(seat);
    const b = this.bet;
    if (b.phase !== 'envite') throw new Error('No hay nada que querer');
    this.said[seat] = 'Quiero';
    this.addLog(`${this.name(seat)} quiere`);
    this.records.push({
      lance: b.lance, status: 'querido', amount: b.amount, ordago: b.ordago,
      bettorTeam: b.bettorTeam, bettorSeat: b.bettorSeat, participants: b.participants,
    });
    if (b.ordago) {
      const w = this.best(b.lance, b.participants);
      const t = team(w);
      if (t === b.bettorTeam) this.stats[b.bettorSeat].ordagosGanados++;
      this.ordagoResult = { lance: b.lance, winnerSeat: w, team: t };
      this.juegoWinner = t;
      this.addLog(`Órdago a ${LANCE_NAMES[b.lance]}: gana ${this.name(w)}`);
      this.bet = null;
      return this.endRound();
    }
    this.nextLance();
  }

  doNoQuiero(seat) {
    this.checkTurn(seat);
    const b = this.bet;
    if (b.phase !== 'envite') throw new Error('No hay nada que rechazar');
    this.said[seat] = 'No quiero';
    this.addLog(`${this.name(seat)} no quiere`);
    b.responders.shift();
    if (b.responders.length) {
      this.turn = b.responders[0];
      return;
    }
    this.records.push({
      lance: b.lance, status: 'noquerido', deje: b.prev, bettorTeam: b.bettorTeam, participants: b.participants,
    });
    if (b.ordago && b.bettorSeat !== null) this.stats[b.bettorSeat].ordagosGanados++;
    this.award(b.bettorTeam, b.prev, `${LANCE_NAMES[b.lance]}: no querido`);
    if (this.juegoWinner !== null) {
      this.bet = null;
      return this.endRound();
    }
    this.nextLance();
  }

  award(t, pts, reason) {
    if (pts <= 0 || this.juegoWinner !== null) return;
    this.scores[t] += pts;
    this.piedrasTotales[t] += pts;
    this.breakdown.push({ team: t, points: pts, reason });
    if (this.scores[t] >= this.settings.puntos) this.juegoWinner = t;
  }

  endRound() {
    this.phase = 'roundEnd';
    this.turn = null;
    this.lance = null;
    this.said = [null, null, null, null];
    this.lanceWinners = [];
    if (this.juegoWinner === null) {
      for (const r of this.records) {
        if (this.juegoWinner !== null) break;
        const L = LANCE_NAMES[r.lance];
        if (r.status === 'nadie') continue;
        if (r.lance === 'grande' || r.lance === 'chica') {
          if (r.status === 'noquerido') continue;
          const w = this.best(r.lance, r.participants);
          this.lanceWinners.push({ lance: r.lance, seat: w });
          this.award(team(w), r.status === 'paso' ? 1 : r.amount, r.status === 'paso' ? `${L} en paso` : `${L} (envite querido)`);
        } else if (r.lance === 'pares' || r.lance === 'juego') {
          let t;
          if (r.status === 'noquerido') {
            t = r.bettorTeam;
          } else {
            const w = this.best(r.lance, r.participants);
            this.lanceWinners.push({ lance: r.lance, seat: w });
            t = team(w);
            if (r.status === 'querido') this.award(t, r.amount, `${L} (envite querido)`);
          }
          this.award(t, this.teamValue(r.lance, t), `${L}`);
        } else if (r.lance === 'punto') {
          if (r.status === 'noquerido') {
            this.award(r.bettorTeam, 1, 'Punto');
          } else {
            const w = this.best('punto', r.participants);
            this.lanceWinners.push({ lance: 'punto', seat: w });
            if (r.status === 'querido') this.award(team(w), r.amount, 'Punto (envite querido)');
            this.award(team(w), 1, 'Punto');
          }
        }
      }
    }
    for (let s = 0; s < 4; s++) {
      if (this.sum(s) === 31) this.stats[s].treintaYUna++;
      const p = this.pares(s);
      if (p && p.type === 3) this.stats[s].duples++;
      if (p && p.type === 2) this.stats[s].medias++;
    }
    if (this.juegoWinner !== null) {
      this.juegos[this.juegoWinner]++;
      if (this.juegos[this.juegoWinner] >= this.settings.juegos) this.matchWinner = this.juegoWinner;
    }
    this.ready = new Set();
  }

  setReady(seat) {
    if (this.phase !== 'roundEnd') return;
    this.ready.add(seat);
    if (this.ready.size >= 4) this.nextRound();
  }

  forceReady(seats) {
    if (this.phase !== 'roundEnd') return;
    seats.forEach((s) => this.ready.add(s));
    if (this.ready.size >= 4) this.nextRound();
  }

  nextRound() {
    if (this.matchWinner !== null) {
      this.phase = 'finished';
      return;
    }
    if (this.juegoWinner !== null) this.scores = [0, 0];
    this.mano = nextSeat(this.mano);
    this.startRound();
  }

  tickDelay() {
    if (this.phase !== 'draw') return null;
    return this.drawShown < this.drawSteps.length ? 650 : 3500;
  }

  tick() {
    if (this.phase !== 'draw') return;
    if (this.drawShown < this.drawSteps.length) this.drawShown++;
    else this.startRound();
  }
  isFinished() { return this.phase === 'finished'; }

  summary() {
    const w = this.matchWinner;
    return {
      winners: w === null ? [] : [w, w + 2],
      juegos: this.juegos,
      perSeat: this.stats.map((st, s) => ({
        ...st,
        juegosGanados: this.juegos[team(s)],
        juegosPerdidos: this.juegos[1 - team(s)],
        piedras: this.piedrasTotales[team(s)],
      })),
    };
  }

  actionsFor(seat) {
    if (this.phase === 'mus' && this.turn === seat) return ['mus', 'nomus'];
    if (this.phase === 'discard' && !this.pendingDiscard[seat]) return ['discard'];
    if (this.phase === 'lance' && this.turn === seat) {
      if (this.bet.phase === 'open') return ['paso', 'envido', 'ordago'];
      if (this.bet.ordago) return ['quiero', 'noquiero'];
      return ['quiero', 'noquiero', 'envido', 'ordago'];
    }
    if (this.phase === 'roundEnd' && !this.ready.has(seat)) return ['ready'];
    return [];
  }

  viewFor(seat) {
    const reveal = this.phase === 'roundEnd' || this.phase === 'finished';
    const isMine = seat !== null && seat !== undefined && seat >= 0;
    const v = {
      game: 'mus',
      phase: this.phase,
      settings: this.settings,
      roundNumber: this.roundNumber,
      mano: this.mano,
      dealer: this.dealer,
      turn: this.turn,
      scores: this.scores,
      juegos: this.juegos,
      said: this.said,
      lance: this.lance,
      lanceNames: LANCE_NAMES,
      bet: this.bet && {
        lance: this.bet.lance, phase: this.bet.phase, amount: this.bet.amount, prev: this.bet.prev,
        ordago: this.bet.ordago, bettorTeam: this.bet.bettorTeam, participants: this.bet.participants,
      },
      records: this.records.map((r) => ({ lance: r.lance, status: r.status, amount: r.amount, ordago: r.ordago })),
      declared: this.declared,
      musRounds: this.musRounds,
      discarded: Object.keys(this.pendingDiscard).map(Number),
      handCounts: this.hands.map((h) => h.length),
      myHand: isMine ? this.hands[seat] : [],
      actions: isMine ? this.actionsFor(seat) : [],
      ready: [...this.ready],
      log: this.log,
    };
    if (isMine && this.phase === 'lance') {
      // Para la ayuda visual: qué tengo
      const p = this.pares(seat);
      v.myInfo = { pares: p ? p.name : null, juego: this.sum(seat) };
    } else if (isMine) {
      const p = this.pares(seat);
      v.myInfo = { pares: p ? p.name : null, juego: this.sum(seat) };
    }
    if (this.phase === 'draw') {
      v.draw = { steps: this.drawSteps.slice(0, this.drawShown), done: this.drawShown >= this.drawSteps.length };
    }
    if (reveal) {
      v.hands = this.hands;
      v.breakdown = this.breakdown;
      v.lanceWinners = this.lanceWinners;
      v.juegoWinner = this.juegoWinner;
      v.matchWinner = this.matchWinner;
      v.ordagoResult = this.ordagoResult;
      v.handInfo = [0, 1, 2, 3].map((s) => {
        const p = this.pares(s);
        return { pares: p ? p.name : null, juego: this.sum(s) };
      });
    }
    if (this.phase === 'finished') v.summary = this.summary();
    return v;
  }
}

// Sorteo de parejas: se tira una carta por jugador, empezando por uno al azar, hasta que sale
// un rey (solo los 12). Se sigue tirando a los demás hasta el segundo rey. Esos dos van juntos
// y la otra pareja reparte; reparte el que deja de mano al primero que sacó rey.
// Devuelve el nuevo orden de asientos (índices de los jugadores originales) y los pasos del sorteo.
function musDraw() {
  const deck = shuffle(makeDeck());
  const kings = [];
  const steps = [];
  let i = Math.floor(Math.random() * 4);
  while (kings.length < 2) {
    if (!kings.includes(i)) {
      const card = deck.pop();
      steps.push({ idx: i, card });
      if (card.r === 12) kings.push(i);
    }
    i = (i + 1) % 4;
  }
  const others = [0, 1, 2, 3].filter((x) => !kings.includes(x));
  // Asientos: 0 reparte, 1 es mano (primer rey), 2 compañero del que reparte, 3 segundo rey
  const order = [others[0], kings[0], others[1], kings[1]];
  return {
    order,
    mano: 1,
    steps: steps.map((s) => ({ seat: order.indexOf(s.idx), card: s.card })),
  };
}

module.exports = { Mus, team, musDraw };
