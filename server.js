// El Tapete - servidor de Mus y Pocha
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Storage } = require('./src/storage');
const { Mus, musDraw } = require('./src/mus');
const { Pocha } = require('./src/pocha');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 30000 });
const storage = new Storage();

// no-cache: el navegador comprueba siempre si hay versión nueva (tras cada publicación)
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
app.get('/ping', (req, res) => res.send('ok'));
// Jugadores que han entrado alguna vez (para elegir "quién eres" con un toque)
app.get('/api/players', (req, res) => {
  const list = Object.values(storage.db.profiles)
    .map((p) => ({ name: p.name, avatar: p.avatar, lastSeen: p.lastSeen || 0 }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
  res.json(list);
});

const GAMES = {
  mus: { name: 'Mus', min: 4, max: 4, Engine: Mus, defaults: { puntos: 40, juegos: 3, ochoReyes: true } },
  pocha: { name: 'Pocha', min: 3, max: 5, Engine: Pocha, defaults: {} },
};

const rooms = new Map(); // id -> room
const sessions = new Map(); // playerId -> { name, avatar, sockets:Set, roomId }

function newRoomId() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let id;
  do {
    id = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  } while (rooms.has(id));
  return id;
}

function createRoom(game) {
  const room = {
    id: newRoomId(), game, hostId: null, players: [], status: 'waiting',
    settings: { ...GAMES[game].defaults }, engine: null, chat: [], tickTimer: null, lastSummary: null,
  };
  rooms.set(room.id, room);
  return room;
}

const isConnected = (pid) => (sessions.get(pid)?.sockets.size || 0) > 0;
const seatOf = (room, pid) => room.players.findIndex((p) => p.id === pid);

function roomView(room, pid) {
  const seat = seatOf(room, pid);
  return {
    id: room.id,
    game: room.game,
    gameName: GAMES[room.game].name,
    min: GAMES[room.game].min,
    max: GAMES[room.game].max,
    hostId: room.hostId,
    status: room.status,
    settings: room.settings,
    players: room.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, connected: isConnected(p.id) })),
    mySeat: seat,
    view: room.engine ? room.engine.viewFor(seat) : null,
    chat: room.chat,
    lastSummary: room.lastSummary,
  };
}

function emitTo(pid, ev, data) {
  const s = sessions.get(pid);
  if (!s) return;
  for (const sid of s.sockets) io.to(sid).emit(ev, data);
}

function broadcastRoom(room) {
  for (const p of room.players) emitTo(p.id, 'room', roomView(room, p.id));
}

function lobbyData() {
  return [...rooms.values()].map((r) => ({
    id: r.id, game: r.game, status: r.status, count: r.players.length,
    players: r.players.map((p) => ({ name: p.name, avatar: p.avatar })),
  }));
}
function broadcastLobby() { io.emit('lobby', lobbyData()); }

function systemMsg(room, text) {
  room.chat.push({ system: true, text, t: Date.now() });
  if (room.chat.length > 60) room.chat.shift();
}

function leaveRoom(pid) {
  const s = sessions.get(pid);
  const room = s && s.roomId && rooms.get(s.roomId);
  if (s) s.roomId = null;
  if (!room) return;
  if (room.status !== 'waiting') {
    // En partida (o viendo el resultado) no se quita el asiento: puede volver
    const present = room.players.filter((p) => sessions.get(p.id)?.roomId === room.id);
    if (present.length === 0) {
      clearTimeout(room.tickTimer);
      rooms.delete(room.id);
      broadcastLobby();
      return;
    }
    if (room.hostId === pid) {
      room.hostId = present[0].id;
      systemMsg(room, `${present[0].name} es ahora el anfitrión`);
    }
    broadcastRoom(room);
    return;
  }
  room.players = room.players.filter((p) => p.id !== pid);
  if (room.hostId === pid) room.hostId = room.players[0]?.id || null;
  if (room.players.length === 0) {
    clearTimeout(room.tickTimer);
    rooms.delete(room.id);
  } else {
    systemMsg(room, `${s.name} ha salido de la sala`);
    broadcastRoom(room);
  }
  broadcastLobby();
}

function joinRoom(pid, room) {
  const s = sessions.get(pid);
  if (s.roomId && s.roomId !== room.id) leaveRoom(pid);
  if (seatOf(room, pid) < 0) {
    if (room.status !== 'waiting') throw new Error('La partida ya ha empezado');
    if (room.players.length >= GAMES[room.game].max) throw new Error('La sala está llena');
    room.players.push({ id: pid, name: s.name, avatar: s.avatar });
    if (!room.hostId) room.hostId = pid;
    systemMsg(room, `${s.name} se ha sentado a la mesa`);
  }
  s.roomId = room.id;
  broadcastRoom(room);
  broadcastLobby();
}

function afterAction(room) {
  const eng = room.engine;
  if (!eng) return;
  // Los desconectados no bloquean el paso a la siguiente mano
  const away = room.players.map((p, i) => (isConnected(p.id) ? -1 : i)).filter((i) => i >= 0);
  if (away.length) eng.forceReady(away);
  if (eng.isFinished() && room.status === 'playing') finishMatch(room);
  const d = eng.tickDelay();
  if (d && !room.tickTimer) {
    room.tickTimer = setTimeout(() => {
      room.tickTimer = null;
      eng.tick();
      afterAction(room);
    }, d);
  }
  broadcastRoom(room);
}

function bump(map, key, won) {
  map[key] ||= { partidas: 0, victorias: 0 };
  map[key].partidas++;
  if (won) map[key].victorias++;
}

function finishMatch(room) {
  room.status = 'finished';
  const sum = room.engine.summary();
  const names = room.players.map((p) => p.name);
  const profiles = room.players.map((p) => storage.upsertProfile(p.name, p.avatar));
  let detail = '';
  if (room.game === 'mus') {
    profiles.forEach((pr, s) => {
      const st = pr.stats.mus;
      const ps = sum.perSeat[s];
      const won = sum.winners.includes(s);
      st.partidas++;
      if (won) st.victorias++;
      for (const k of ['juegosGanados', 'juegosPerdidos', 'manos', 'ordagos', 'ordagosGanados', 'treintaYUna', 'duples', 'medias', 'piedras']) {
        st[k] += ps[k] || 0;
      }
      bump(st.companeros, names[(s + 2) % 4], won);
      bump(st.rivales, names[(s + 1) % 4], won);
      bump(st.rivales, names[(s + 3) % 4], won);
    });
    detail = `${names[0]} y ${names[2]} ${sum.juegos[0]} – ${sum.juegos[1]} ${names[1]} y ${names[3]}`;
  } else {
    const rankOf = {};
    sum.ranking.forEach((r, pos) => { rankOf[r.seat] = pos; });
    profiles.forEach((pr, s) => {
      const st = pr.stats.pocha;
      const ps = sum.perSeat[s];
      st.partidas++;
      if (sum.winners.includes(s)) st.victorias++;
      st.manos += ps.manos;
      st.aciertos += ps.aciertos;
      st.fallos += ps.fallos;
      st.bazas += ps.bazas;
      st.puntosTotales += ps.puntos;
      st.mejorPuntuacion = st.mejorPuntuacion === null ? ps.puntos : Math.max(st.mejorPuntuacion, ps.puntos);
      st.peorPuntuacion = st.peorPuntuacion === null ? ps.puntos : Math.min(st.peorPuntuacion, ps.puntos);
      st.mejorRacha = Math.max(st.mejorRacha, ps.mejorRacha);
      st.subastas += ps.subastas;
      st.subastasCumplidas += ps.subastasCumplidas;
      names.forEach((n, o) => { if (o !== s) bump(st.rivales, n, rankOf[s] < rankOf[o]); });
    });
    detail = sum.ranking.map((r) => `${names[r.seat]} ${r.score}`).join(' · ');
  }
  const match = {
    game: room.game,
    date: Date.now(),
    players: room.players.map((p) => ({ name: p.name, avatar: p.avatar })),
    winners: sum.winners.map((s) => names[s]),
    detail,
  };
  storage.recordMatch(match);
  room.lastSummary = match;
  systemMsg(room, `Fin de la partida. Gana: ${match.winners.join(' y ')}`);
  broadcastLobby();
}

io.on('connection', (socket) => {
  const pidOf = () => socket.data.playerId;
  const sessionOf = () => sessions.get(pidOf());
  const roomOf = () => { const s = sessionOf(); return s && s.roomId ? rooms.get(s.roomId) : null; };
  const wrap = (fn) => async (data, cb) => {
    try {
      const r = await fn(data || {});
      if (typeof cb === 'function') cb({ ok: true, ...(r || {}) });
    } catch (e) {
      if (typeof cb === 'function') cb({ error: e.message });
    }
  };

  socket.on('hello', wrap(({ playerId, name, avatar }) => {
    name = String(name || '').trim().slice(0, 20);
    if (!name) throw new Error('Escribe tu nombre');
    if (typeof playerId !== 'string' || playerId.length < 8 || playerId.length > 64) throw new Error('Identificador no válido');
    avatar = String(avatar || '').slice(0, 60);
    socket.data.playerId = playerId;
    let s = sessions.get(playerId);
    if (!s) {
      s = { name, avatar, sockets: new Set(), roomId: null };
      sessions.set(playerId, s);
    }
    s.name = name;
    s.avatar = avatar;
    s.sockets.add(socket.id);
    const profile = storage.upsertProfile(name, avatar);
    const room = s.roomId && rooms.get(s.roomId);
    if (room) {
      const p = room.players.find((x) => x.id === playerId);
      if (p && room.status !== 'playing') { p.name = name; p.avatar = avatar; }
      socket.join(room.id);
      broadcastRoom(room);
    } else {
      s.roomId = null;
    }
    socket.emit('lobby', lobbyData());
    return { profile: { name: profile.name, avatar: profile.avatar }, roomId: room ? room.id : null };
  }));

  socket.on('joinGame', wrap(({ game, roomId }) => {
    if (!sessionOf()) throw new Error('Identifícate primero');
    let room;
    if (roomId) {
      room = rooms.get(String(roomId).toUpperCase());
      if (!room) throw new Error('No existe esa sala');
    } else {
      if (!GAMES[game]) throw new Error('Juego desconocido');
      room = [...rooms.values()].find((r) => r.game === game && r.status === 'waiting' && r.players.length < GAMES[game].max);
      if (!room) room = createRoom(game);
    }
    joinRoom(pidOf(), room);
    return { roomId: room.id };
  }));

  socket.on('newRoom', wrap(({ game }) => {
    if (!sessionOf()) throw new Error('Identifícate primero');
    if (!GAMES[game]) throw new Error('Juego desconocido');
    const room = createRoom(game);
    joinRoom(pidOf(), room);
    return { roomId: room.id };
  }));

  socket.on('rejoin', wrap(() => {
    const room = roomOf();
    if (!room) throw new Error('No estás en ninguna partida');
    broadcastRoom(room);
    return { roomId: room.id };
  }));

  socket.on('leaveRoom', wrap(() => { leaveRoom(pidOf()); }));

  const hostRoom = () => {
    const room = roomOf();
    if (!room) throw new Error('No estás en ninguna sala');
    if (room.hostId !== pidOf()) throw new Error('Solo el anfitrión puede hacer eso');
    return room;
  };

  socket.on('updateSettings', wrap((settings) => {
    const room = hostRoom();
    if (room.status === 'playing') throw new Error('La partida ya ha empezado');
    room.settings = { ...room.settings, ...settings };
    broadcastRoom(room);
  }));

  socket.on('shuffleSeats', wrap(() => {
    const room = hostRoom();
    if (room.status === 'playing') throw new Error('La partida ya ha empezado');
    for (let i = room.players.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [room.players[i], room.players[j]] = [room.players[j], room.players[i]];
    }
    systemMsg(room, 'Se han sorteado los asientos');
    broadcastRoom(room);
  }));

  socket.on('kick', wrap(({ playerId }) => {
    const room = hostRoom();
    if (room.status === 'playing') throw new Error('No se puede echar a nadie en mitad de la partida');
    if (playerId === pidOf()) throw new Error('No puedes echarte a ti mismo');
    const s = sessions.get(playerId);
    room.players = room.players.filter((p) => p.id !== playerId);
    if (s && s.roomId === room.id) { s.roomId = null; emitTo(playerId, 'kicked', {}); }
    broadcastRoom(room);
    broadcastLobby();
  }));

  socket.on('startGame', wrap(() => {
    const room = hostRoom();
    if (room.status === 'playing') throw new Error('La partida ya ha empezado');
    const g = GAMES[room.game];
    const n = room.players.length;
    if (n < g.min || n > g.max) {
      throw new Error(g.min === g.max ? `${g.name}: hacen falta ${g.min} jugadores` : `${g.name}: hacen falta de ${g.min} a ${g.max} jugadores`);
    }
    let settings = room.settings;
    if (room.game === 'mus') {
      // Sorteo de parejas con reyes: recoloca los asientos
      const d = musDraw();
      room.players = d.order.map((i) => room.players[i]);
      settings = { ...room.settings, mano: d.mano, draw: d.steps };
    }
    room.engine = new g.Engine(room.players.map((p) => ({ id: p.id, name: p.name })), settings);
    // Solo para pruebas en local: empezar la pocha en una mano concreta
    if (room.game === 'pocha' && process.env.TAPETE_DEBUG_HAND) room.engine.handIndex = Number(process.env.TAPETE_DEBUG_HAND);
    room.status = 'playing';
    room.lastSummary = null;
    systemMsg(room, '¡Empieza la partida!');
    broadcastLobby();
    afterAction(room);
  }));

  socket.on('cancelGame', wrap(() => {
    const room = hostRoom();
    if (room.status !== 'playing') throw new Error('No hay partida en curso');
    clearTimeout(room.tickTimer);
    room.tickTimer = null;
    room.engine = null;
    room.status = 'waiting';
    systemMsg(room, 'El anfitrión ha cancelado la partida (no cuenta para las estadísticas)');
    // Quien ya no está, sale de la sala
    room.players = room.players.filter((p) => sessions.get(p.id)?.roomId === room.id);
    if (!room.players.some((p) => p.id === room.hostId)) room.hostId = room.players[0]?.id || null;
    broadcastRoom(room);
    broadcastLobby();
  }));

  socket.on('backToWaiting', wrap(() => {
    const room = hostRoom();
    if (room.status !== 'finished') throw new Error('La partida no ha terminado');
    room.status = 'waiting';
    room.engine = null;
    room.players = room.players.filter((p) => sessions.get(p.id)?.roomId === room.id);
    broadcastRoom(room);
    broadcastLobby();
  }));

  socket.on('action', wrap((a) => {
    const room = roomOf();
    if (!room || !room.engine || room.status !== 'playing') throw new Error('No hay partida en curso');
    const seat = seatOf(room, pidOf());
    if (seat < 0) throw new Error('No estás sentado en esta mesa');
    room.engine.act(seat, a);
    afterAction(room);
  }));

  socket.on('chat', wrap(({ text }) => {
    const room = roomOf();
    const s = sessionOf();
    if (!room || !s) throw new Error('No estás en ninguna sala');
    text = String(text || '').trim().slice(0, 200);
    if (!text) return;
    room.chat.push({ id: pidOf(), name: s.name, avatar: s.avatar, text, t: Date.now() });
    if (room.chat.length > 60) room.chat.shift();
    broadcastRoom(room);
  }));

  socket.on('getStats', wrap(() => storage.publicData()));

  socket.on('disconnect', () => {
    const pid = pidOf();
    const s = sessions.get(pid);
    if (!s) return;
    s.sockets.delete(socket.id);
    const room = s.roomId && rooms.get(s.roomId);
    if (!room) return;
    if (s.sockets.size === 0 && room.status === 'waiting') {
      // Si no vuelve en 2 minutos, deja libre su silla
      setTimeout(() => {
        if (!isConnected(pid) && s.roomId === room.id && room.status === 'waiting') leaveRoom(pid);
      }, 120000);
    }
    if (room.status === 'playing') afterAction(room);
    else broadcastRoom(room);
  });
});

// Limpieza: mesas sin nadie conectado durante 30 minutos se cierran
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const room of rooms.values()) {
    if (room.players.some((p) => isConnected(p.id))) {
      room.emptySince = null;
    } else if (!room.emptySince) {
      room.emptySince = now;
    } else if (now - room.emptySince > 30 * 60 * 1000) {
      clearTimeout(room.tickTimer);
      for (const p of room.players) {
        const s = sessions.get(p.id);
        if (s && s.roomId === room.id) s.roomId = null;
      }
      rooms.delete(room.id);
      changed = true;
    }
  }
  if (changed) broadcastLobby();
}, 60 * 1000);

storage.init().then(() => {
  server.listen(PORT, () => console.log(`El Tapete escuchando en http://localhost:${PORT}`));
}).catch((e) => {
  console.error('No se pudo iniciar el almacenamiento:', e);
  process.exit(1);
});
