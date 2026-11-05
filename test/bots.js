// Bots de prueba: se sientan en una mesa y juegan al azar.
// Uso: node test/bots.js <mus|pocha> <numBots> [url] [codigoSala]
const { io } = require('socket.io-client');

const [game = 'mus', nStr = '3', url = 'http://localhost:3000', code] = process.argv.slice(2);
const N = Number(nStr);
const NAMES = ['Bot Paco', 'Bot Lola', 'Bot Manolo', 'Bot Carmen'];
const AV = ['🤖|#2980b9', '🐸|#27ae60', '🐷|#e84393', '🦉|#8e44ad'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

for (let i = 0; i < N; i++) {
  const s = io(url);
  const playerId = `bot-${game}-${i}-${process.env.BOT_TAG || 'x'}-xxxxxxxx`;
  let busy = false;
  s.on('connect', () => {
    s.emit('hello', { playerId, name: NAMES[i], avatar: AV[i] }, (h) => {
      if (h.roomId) { console.log(NAMES[i], 'back to', h.roomId); return; }
      s.emit('joinGame', code ? { roomId: code } : { game }, (r) => console.log(NAMES[i], 'joined', r));
    });
  });
  let latest = null;
  s.on('room', (room) => {
    latest = room;
    // Si el bot es anfitrión y la mesa está completa, empieza solo (útil para pruebas)
    if (process.env.BOT_AUTOSTART && room.status === 'waiting' && room.hostId === playerId && room.players.length === N) {
      s.emit('updateSettings', game === 'mus' ? { puntos: 30, juegos: 1 } : { modo: 'corta' }, () => s.emit('startGame', {}, () => {}));
    }
    if (process.env.BOT_AUTOSTART && room.status === 'finished' && i === 0) {
      s.emit('getStats', {}, (r) => { console.log('STATS', JSON.stringify(r.matches[0]), JSON.stringify(r.profiles.map((p) => [p.name, p.stats[game].partidas, p.stats[game].victorias]))); process.exit(0); });
    }
    think();
  });
  function think() {
    const room = latest;
    const v = room && room.view;
    if (!v || room.status !== 'playing' || busy) return;
    const me = room.mySeat;
    let action = null;
    if (v.game === 'pocha') {
      if (v.phase === 'auction' && v.turn === me) {
        action = Math.random() < (v.auction.reduced ? 0.5 : 0.35)
          ? { type: 'auctionBid', value: v.auctionOptions[0] }
          : { type: 'auctionPass' };
      } else if (v.phase === 'chooseTrump' && v.turn === me) {
        action = { type: 'trump', suit: pick(['oros', 'copas', 'espadas', 'bastos']) };
      } else if (v.phase === 'bidding' && v.turn === me) {
        const opts = [];
        for (let k = 0; k <= v.cards; k++) if (v.forbiddenBid !== k) opts.push(k);
        action = { type: 'bid', value: pick(opts.slice(0, Math.max(1, Math.ceil(opts.length / 2)))) };
      } else if (v.phase === 'playing' && v.turn === me) {
        action = { type: 'play', card: pick(v.legal) };
      } else if (v.phase === 'handEnd' && !v.ready.includes(me)) {
        action = { type: 'ready' };
      }
    } else {
      const a = v.actions;
      if (a.includes('mus')) action = { type: Math.random() < 0.5 ? 'mus' : 'nomus' };
      else if (a.includes('discard')) action = { type: 'discard', cards: v.myHand.slice(0, 2).map((c) => c.id) };
      else if (a.includes('quiero')) action = { type: pick(['quiero', 'noquiero', 'noquiero']) };
      else if (a.includes('paso')) action = Math.random() < 0.7 ? { type: 'paso' } : { type: 'envido', value: 2 };
      else if (a.includes('ready')) action = { type: 'ready' };
    }
    if (action) {
      busy = true;
      setTimeout(() => {
        s.emit('action', action, (r) => {
          busy = false;
          if (r.error) console.log(NAMES[i], r.error);
          else think();
        });
      }, process.env.BOT_DELAY ? Number(process.env.BOT_DELAY) : 600 + Math.random() * 600);
    }
  }
}
