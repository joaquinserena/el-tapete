/* El Tapete – cliente */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const AVATARS = ['🐻', '🦊', '🐺', '🦁', '🐯', '🐸', '🐵', '🦉', '🐙', '🦄', '🐲', '🐼', '🐨', '🐷', '🐮', '🐗', '🦅', '🐔', '🤠', '🧔', '👵', '🧙', '🥷', '🤴', '👸', '🧛', '🤖', '👽', '💀', '🎩'];
  const COLORS = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#d35400', '#7f8c8d', '#2c3e50', '#e84393', '#6d4c41'];
  const SUIT_NAMES = { oros: 'Oros', copas: 'Copas', espadas: 'Espadas', bastos: 'Bastos' };

  // ---------- estado ----------
  const store = {
    load() { try { return JSON.parse(localStorage.getItem('tapete.me')) || {}; } catch { return {}; } },
    save(v) { localStorage.setItem('tapete.me', JSON.stringify(v)); },
  };
  let me = store.load();
  if (!me.playerId) {
    me.playerId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.save(me);
  }
  let room = null;
  let lobby = [];
  let screen = 'login';
  let discardSel = new Set();
  let unread = 0;
  let lastChatLen = 0;
  let statsData = null;
  let statsTab = 'mus';
  let overlayHiddenFor = null; // permite ocultar el resumen para ver la mesa
  let loggedIn = false;
  let envidoVal = null;
  const chatBubbles = {}; // playerId -> { text, until }
  let chatClosed = false; // en pantallas anchas el chat va fijo a la derecha salvo que lo cierres
  const chatBubbleFor = (pid) => {
    const b = chatBubbles[pid];
    return b && b.until > Date.now() ? b.text : null;
  };

  const socket = io({ autoConnect: false });

  function avatarHtml(av, size = '') {
    const [emoji, color] = String(av || '🙂|#7f8c8d').split('|');
    return `<div class="avatar ${size}" style="background:${esc(color || '#7f8c8d')}">${esc(emoji || '🙂')}</div>`;
  }

  function show(name) {
    screen = name;
    if (name !== 'room') document.body.classList.remove('chat-docked');
    for (const s of ['login', 'menu', 'stats', 'room']) $(`#screen-${s}`).classList.toggle('hidden', s !== name);
    if (name === 'menu') renderMenu();
    if (name === 'room') renderRoom();
  }

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  function emit(ev, data) {
    return new Promise((resolve) => {
      socket.emit(ev, data, (res) => {
        if (res && res.error) toast(res.error, 3500);
        resolve(res || {});
      });
    });
  }

  // ---------- entrada ----------
  let pickEmoji = me.emoji || AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let pickColor = me.color || COLORS[Math.floor(Math.random() * COLORS.length)];

  let knownPlayers = [];
  async function loadKnown() {
    try {
      const r = await fetch('/api/players');
      knownPlayers = await r.json();
    } catch { knownPlayers = []; }
    renderLogin();
  }

  // resetName: solo al abrir la pantalla; al cambiar avatar o color se respeta lo escrito
  function renderLogin(resetName = false) {
    if (resetName) $('#name-input').value = me.name || '';
    const typed = $('#name-input').value.trim().toLowerCase();
    $('#known').classList.toggle('hidden', knownPlayers.length === 0);
    const kl = $('#known-list');
    kl.innerHTML = '';
    for (const p of knownPlayers) {
      const b = h('div', 'known-opt' + (p.name.toLowerCase() === typed ? ' sel' : ''), `${avatarHtml(p.avatar, 'sm')}<span>${esc(p.name)}</span>`);
      b.onclick = () => {
        const [emoji, color] = String(p.avatar || '').split('|');
        $('#name-input').value = p.name;
        if (emoji) pickEmoji = emoji;
        if (color) pickColor = color;
        renderLogin();
      };
      kl.appendChild(b);
    }
    const ag = $('#avatar-grid');
    ag.innerHTML = '';
    for (const a of AVATARS) {
      const b = h('div', 'avatar-opt' + (a === pickEmoji ? ' sel' : ''), a);
      b.style.background = a === pickEmoji ? pickColor : '';
      b.onclick = () => { pickEmoji = a; renderLogin(); };
      ag.appendChild(b);
    }
    const cg = $('#color-grid');
    cg.innerHTML = '';
    for (const c of COLORS) {
      const b = h('div', 'color-opt' + (c === pickColor ? ' sel' : ''));
      b.style.background = c;
      b.onclick = () => { pickColor = c; renderLogin(); };
      cg.appendChild(b);
    }
  }

  async function hello() {
    const res = await emit('hello', { playerId: me.playerId, name: me.name, avatar: `${me.emoji}|${me.color}` });
    if (res.error) { show('login'); renderLogin(true); $('#login-error').textContent = res.error; return; }
    loggedIn = true;
    if (res.roomId) {
      show('room');
    } else {
      room = null;
      if (screen === 'login' || screen === 'room') show('menu');
    }
  }

  $('#btn-enter').onclick = () => {
    const name = $('#name-input').value.trim();
    if (!name) { $('#login-error').textContent = 'Escribe tu nombre'; return; }
    me.name = name; me.emoji = pickEmoji; me.color = pickColor;
    store.save(me);
    $('#login-error').textContent = '';
    if (socket.connected) hello(); else socket.connect();
  };
  $('#name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-enter').click(); });
  $('#name-input').addEventListener('input', () => {
    $$('#known-list .known-opt').forEach((el, i) => {
      el.classList.toggle('sel', knownPlayers[i] && knownPlayers[i].name.toLowerCase() === $('#name-input').value.trim().toLowerCase());
    });
  });
  function openProfileEditor() {
    pickEmoji = me.emoji || pickEmoji;
    pickColor = me.color || pickColor;
    show('login');
    renderLogin(true);
    loadKnown();
  }

  socket.on('connect', () => { $('#conn').classList.add('hidden'); if (me.name) hello(); });
  socket.on('disconnect', () => { if (loggedIn) $('#conn').classList.remove('hidden'); });
  socket.on('connect_error', () => { if (loggedIn) $('#conn').classList.remove('hidden'); });
  socket.on('lobby', (l) => { lobby = l; if (screen === 'menu') renderMenu(); });
  socket.on('kicked', () => { room = null; toast('El anfitrión te ha sacado de la sala'); show('menu'); });
  // Sonidos según lo que cambia en la mesa
  function soundsFor(prev, r) {
    const a = prev && prev.view;
    const b = r.view;
    if (!b || !a || prev.id !== r.id) return;
    const me = r.mySeat;
    if (b.turn === me && a.turn !== me && !['draw'].includes(b.phase)) Sound.play('turn');
    if (b.game === 'pocha' && (b.trick || []).length > (a.trick || []).length) Sound.play('card');
    if (b.game === 'mus') {
      (b.said || []).forEach((s, i) => {
        if (!s || s === (a.said || [])[i]) return;
        if (/Órdago/.test(s)) Sound.play('ordago');
        else if (/Envido|más/.test(s)) Sound.play('chip');
        else if (/Quiero/.test(s)) Sound.play('chip');
      });
    }
    if (b.phase === 'finished' && a.phase !== 'finished') {
      const won = b.summary && b.summary.winners.includes(b.game === 'mus' ? me % 2 : me);
      Sound.play(won ? 'win' : 'lose');
    }
  }

  socket.on('room', (r) => {
    const prevPhase = room && room.view && room.view.phase;
    const sameRoom = room && room.id === r.id;
    soundsFor(room, r);
    timerState = r.timer ? { seats: r.timer.seats, deadline: Date.now() + r.timer.remaining, total: r.timer.total } : null;
    if (r.view && r.mySeat >= 0) checkDeal(r.view);
    room = r;
    if (r.view && r.view.phase !== prevPhase) { discardSel.clear(); overlayHiddenFor = null; }
    if (!r.view || r.view.turn !== r.mySeat) envidoVal = null;
    if (!sameRoom) lastChatLen = r.chat.length;
    if (r.chat.length > lastChatLen) {
      if ($('#chat-panel').classList.contains('hidden')) unread += r.chat.length - lastChatLen;
      // Los mensajes nuevos salen unos segundos encima de quien los escribe
      for (const m of r.chat.slice(lastChatLen)) {
        if (m.system || !m.id) continue;
        chatBubbles[m.id] = { text: m.text, until: Date.now() + 7000 };
        setTimeout(() => { if (screen === 'room') renderRoom(); }, 7100);
      }
    }
    lastChatLen = r.chat.length;
    if (screen === 'room') renderRoom();
    if (screen === 'menu') renderMenu();
  });

  // ---------- menú ----------
  function renderMenu() {
    $('#menu-me').innerHTML = `${avatarHtml(`${me.emoji}|${me.color}`)}<span>${esc(me.name)}</span><span class="edit">✎</span>`;
    for (const g of ['mus', 'pocha']) {
      const rs = lobby.filter((r) => r.game === g);
      const waiting = rs.filter((r) => r.status === 'waiting');
      const playing = rs.filter((r) => r.status === 'playing');
      const parts = [];
      if (waiting.length) parts.push(`${waiting.reduce((s, r) => s + r.count, 0)} esperando en la mesa`);
      if (playing.length) parts.push(`${playing.length} partida${playing.length > 1 ? 's' : ''} en juego`);
      $(`#status-${g}`).textContent = parts.join(' · ') || 'Mesa libre';
    }
    const inGame = room && room.mySeat >= 0 && room.status !== 'waiting';
    $('#rejoin-banner').classList.toggle('hidden', !inGame);
  }

  function drawArt() {
    const mus = $('#art-mus');
    const pocha = $('#art-pocha');
    const cardsMus = [{ id: 'oros-12', s: 'oros', r: 12 }, { id: 'copas-1', s: 'copas', r: 1 }, { id: 'bastos-11', s: 'bastos', r: 11 }, { id: 'espadas-12', s: 'espadas', r: 12 }];
    const cardsPocha = [{ id: 'espadas-1', s: 'espadas', r: 1 }, { id: 'copas-7', s: 'copas', r: 7 }, { id: 'oros-10', s: 'oros', r: 10 }];
    cardsMus.forEach((c, i) => { const e = Cards.face(c); e.style.transform = `translateX(${(i - 1.5) * 38}px) rotate(${(i - 1.5) * 9}deg)`; mus.appendChild(e); });
    cardsPocha.forEach((c, i) => { const e = Cards.face(c); e.style.transform = `translateX(${(i - 1) * 44}px) rotate(${(i - 1) * 10}deg)`; pocha.appendChild(e); });
  }

  $$('[data-join]').forEach((b) => {
    b.onclick = async () => {
      if (room && room.mySeat >= 0 && room.status === 'playing'
        && !confirm('Tienes una partida a medias. Si entras en otra mesa, tus compañeros se quedarán esperándote. ¿Seguir?')) return;
      const res = await emit('joinGame', { game: b.dataset.join });
      if (res.ok) show('room');
    };
  });
  $('#btn-code').onclick = async () => {
    const code = $('#code-input').value.trim().toUpperCase();
    if (code.length !== 4) return toast('El código tiene 4 letras');
    const res = await emit('joinGame', { roomId: code });
    if (res.ok) show('room');
  };
  $('#btn-rejoin').onclick = async () => { const r = await emit('rejoin'); if (r.ok) show('room'); };
  $('#menu-me').onclick = openProfileEditor;
  $('#btn-stats').onclick = () => { show('stats'); loadStats(); };
  $('#btn-stats-back').onclick = () => show('menu');

  // ---------- estadísticas ----------
  async function loadStats() {
    $('#stats-body').innerHTML = '<p class="empty">Cargando…</p>';
    const res = await emit('getStats');
    if (res.ok) { statsData = res; renderStats(); }
  }
  $$('.tab').forEach((t) => {
    t.onclick = () => { statsTab = t.dataset.tab; $$('.tab').forEach((x) => x.classList.toggle('active', x === t)); renderStats(); };
  });

  const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '–');

  function bestOf(map, mode) {
    // mode: 'best' (más victorias %) | 'worst'
    const list = Object.entries(map || {}).filter(([, v]) => v.partidas > 0);
    if (!list.length) return '–';
    list.sort((a, b) => {
      const ra = a[1].victorias / a[1].partidas;
      const rb = b[1].victorias / b[1].partidas;
      return mode === 'best' ? rb - ra || b[1].partidas - a[1].partidas : ra - rb || b[1].partidas - a[1].partidas;
    });
    const [n, v] = list[0];
    const ratio = v.victorias / v.partidas;
    if (mode === 'best' && ratio === 0) return '–';
    if (mode === 'worst' && ratio >= 0.5) return '–';
    return `<span class="kpi-name">${esc(n)} <small>(${v.victorias}/${v.partidas})</small></span>`;
  }

  function renderStats(detailName) {
    const body = $('#stats-body');
    if (!statsData) return;
    if (statsTab === 'historial') {
      if (!statsData.matches.length) { body.innerHTML = '<p class="empty">Todavía no se ha terminado ninguna partida.</p>'; return; }
      body.innerHTML = statsData.matches.map((m) => `
        <div class="match-row">
          <span class="tag">${m.game === 'mus' ? 'MUS' : 'POCHA'}</span>
          <span>🏆 <b>${esc(m.winners.join(' y '))}</b></span>
          <span class="muted">${esc(m.detail)}</span>
          <span class="when">${new Date(m.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>`).join('');
      return;
    }
    const g = statsTab;
    const rows = statsData.profiles
      .filter((p) => p.stats[g] && p.stats[g].partidas > 0)
      .sort((a, b) => b.stats[g].victorias - a.stats[g].victorias || (b.stats[g].victorias / b.stats[g].partidas) - (a.stats[g].victorias / a.stats[g].partidas));
    if (!rows.length) { body.innerHTML = `<p class="empty">Nadie ha terminado aún una partida de ${g}.</p>`; return; }
    let head; let line;
    if (g === 'mus') {
      head = '<th>#</th><th>Jugador</th><th>Partidas</th><th>Victorias</th><th>%</th><th>Juegos</th><th>Órdagos</th>';
      line = (p, i) => { const s = p.stats.mus; return `<td>${i + 1}</td><td class="name">${avatarHtml(p.avatar, 'sm')}${esc(p.name)}</td><td>${s.partidas}</td><td>${s.victorias}</td><td>${pct(s.victorias, s.partidas)}</td><td>${s.juegosGanados}-${s.juegosPerdidos}</td><td>${s.ordagosGanados}/${s.ordagos}</td>`; };
    } else {
      head = '<th>#</th><th>Jugador</th><th>Partidas</th><th>Victorias</th><th>%</th><th>Aciertos</th><th>Media pts</th>';
      line = (p, i) => { const s = p.stats.pocha; return `<td>${i + 1}</td><td class="name">${avatarHtml(p.avatar, 'sm')}${esc(p.name)}</td><td>${s.partidas}</td><td>${s.victorias}</td><td>${pct(s.victorias, s.partidas)}</td><td>${pct(s.aciertos, s.aciertos + s.fallos)}</td><td>${s.partidas ? Math.round(s.puntosTotales / s.partidas) : '–'}</td>`; };
    }
    body.innerHTML = `<div class="scroll-x"><table class="stat-table"><thead><tr>${head}</tr></thead><tbody>${rows.map((p, i) => `<tr class="clickable" data-name="${esc(p.name)}">${line(p, i)}</tr>`).join('')}</tbody></table></div><div id="player-detail"></div>`;
    $$('#stats-body tr.clickable').forEach((tr) => { tr.onclick = () => renderDetail(tr.dataset.name); });
    renderDetail(detailName || (rows.find((p) => p.name.toLowerCase() === (me.name || '').toLowerCase()) || rows[0]).name);
  }

  function renderDetail(name) {
    const p = statsData.profiles.find((x) => x.name === name);
    if (!p) return;
    const g = statsTab;
    const s = p.stats[g];
    let k = [];
    if (g === 'mus') {
      k = [
        [s.partidas, 'Partidas'], [s.victorias, 'Victorias'], [pct(s.victorias, s.partidas), '% victorias'],
        [`${s.juegosGanados}-${s.juegosPerdidos}`, 'Juegos ganados-perdidos'], [s.manos, 'Manos jugadas'],
        [`${s.ordagosGanados}/${s.ordagos}`, 'Órdagos ganados/echados'], [s.treintaYUna, 'Veces con 31'],
        [s.duples, 'Duples ligados'], [s.medias, 'Medias ligadas'], [s.piedras, 'Piedras de su pareja'],
        [bestOf(s.companeros, 'best'), 'Mejor compañero'], [bestOf(s.rivales, 'best'), 'Rival favorito'],
        [bestOf(s.rivales, 'worst'), 'Bestia negra'],
      ];
    } else {
      k = [
        [s.partidas, 'Partidas'], [s.victorias, 'Victorias'], [pct(s.victorias, s.partidas), '% victorias'],
        [pct(s.aciertos, s.aciertos + s.fallos), '% manos clavadas'], [s.aciertos, 'Manos clavadas'], [s.fallos, 'Manos falladas'],
        [s.mejorRacha, 'Mejor racha clavando'], [s.mejorPuntuacion ?? '–', 'Mejor puntuación'], [s.peorPuntuacion ?? '–', 'Peor puntuación'],
        [s.partidas ? Math.round(s.puntosTotales / s.partidas) : '–', 'Media de puntos'], [s.bazas, 'Bazas ganadas'],
        [`${s.subastasCumplidas || 0}/${s.subastas || 0}`, 'Subastas cumplidas/ganadas'],
        [bestOf(s.rivales, 'best'), 'Rival favorito'], [bestOf(s.rivales, 'worst'), 'Bestia negra'],
      ];
    }
    $('#player-detail').innerHTML = `<div class="player-detail"><h3>${avatarHtml(p.avatar)}${esc(p.name)}</h3>
      <div class="kpis">${k.map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('')}</div></div>`;
  }

  // ---------- mesa ----------
  const POS = {
    2: ['bottom', 'top'],
    3: ['bottom', 'top-right', 'top-left'],
    4: ['bottom', 'right', 'top', 'left'],
    5: ['bottom', 'right', 'top-right', 'top-left', 'left'],
  };
  const TRICK_POS = {
    bottom: [50, 78], right: [82, 50], top: [50, 22], left: [18, 50], 'top-right': [72, 26], 'top-left': [28, 26],
  };
  const relPos = (seat, n) => POS[n][(seat - room.mySeat + n) % n];
  const pname = (seat) => (room.players[seat] ? room.players[seat].name : '?');

  $('#btn-leave').onclick = async () => {
    if (room && room.status === 'playing') {
      toast('Sigues sentado: puedes volver desde el menú');
      show('menu');
      return;
    }
    await emit('leaveRoom');
    room = null;
    show('menu');
  };
  const isWide = () => window.innerWidth >= 1100;
  $('#btn-chat').onclick = () => {
    if (isWide()) chatClosed = !chatClosed;
    else $('#chat-panel').classList.toggle('hidden');
    $('#score-panel').classList.add('hidden');
    unread = 0;
    renderRoom();
    if (!$('#chat-panel').classList.contains('hidden')) setTimeout(() => $('#chat-input').focus(), 50);
  };
  $('#btn-score').onclick = () => { $('#score-panel').classList.toggle('hidden'); $('#chat-panel').classList.add('hidden'); renderScorePanel(); };
  $$('[data-close]').forEach((b) => { b.onclick = () => $('#' + b.dataset.close).classList.add('hidden'); });
  $('#chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const t = $('#chat-input').value.trim();
    if (!t) return;
    $('#chat-input').value = '';
    await emit('chat', { text: t });
  };

  function renderChat() {
    const docked = screen === 'room' && isWide() && !chatClosed;
    document.body.classList.toggle('chat-docked', docked);
    if (docked) { $('#chat-panel').classList.remove('hidden'); unread = 0; }
    else if (isWide()) $('#chat-panel').classList.add('hidden');
    const badge = $('#chat-badge');
    badge.textContent = unread;
    badge.classList.toggle('hidden', !unread);
    if ($('#chat-panel').classList.contains('hidden') || !room) return;
    const list = $('#chat-list');
    list.innerHTML = room.chat.map((m) => (m.system
      ? `<div class="chat-sys">${esc(m.text)}</div>`
      : `<div class="chat-msg">${avatarHtml(m.avatar, 'sm')}<div class="txt"><b>${esc(m.name)}</b>${esc(m.text)}</div></div>`)).join('');
    list.scrollTop = list.scrollHeight;
  }

  function renderRoom() {
    if (!room) return;
    const v = room.view;
    const statusTxt = room.status === 'waiting' ? 'Esperando jugadores' : room.status === 'finished' ? 'Partida terminada' : 'En juego';
    $('#room-title').innerHTML = `${esc(room.gameName)} · Sala ${esc(room.id)}<small>${statusTxt}</small>`;
    renderChat();
    if (!$('#score-panel').classList.contains('hidden')) renderScorePanel();
    $('#seats').innerHTML = '';
    $('#center').innerHTML = '';
    $('#info').innerHTML = '';
    $('#my-hand').innerHTML = '';
    $('#controls').innerHTML = '';
    if (room.status === 'waiting' || !v) {
      renderWaitingSeats();
      renderWaitingDialog();
      return;
    }
    if (v.game === 'pocha') renderPocha(v); else renderMus(v);
    animateDealIn();
    renderOverlay(v);
    updateTimers();
  }

  function seatEl(seat, n, extra = {}) {
    const p = room.players[seat];
    const pos = relPos(seat, n);
    const el = h('div', `seat pos-${pos}${extra.turn ? ' turn' : ''}${p && !p.connected ? ' offline' : ''}`);
    el.dataset.seat = seat;
    let marks = '';
    if (extra.mark) marks = ` <span title="${esc(extra.markTitle || '')}">${extra.mark}</span>`;
    el.innerHTML = `
      ${extra.bubble ? `<div class="bubble${extra.hot ? ' hot' : ''}">${esc(extra.bubble)}</div>` : ''}
      <div class="who">${avatarHtml(p && p.avatar)}<span class="nm">${esc(p ? p.name : '')}</span>${marks}</div>
      <div class="tags">${(extra.tags || []).map((t) => `<span class="tag-chip ${t.cls || ''}">${t.html}</span>`).join('')}</div>`;
    if (extra.revealed) {
      const r = h('div', 'revealed');
      extra.revealed.forEach((c) => r.appendChild(Cards.face(c)));
      el.appendChild(r);
    } else if (extra.count) {
      const b = h('div', 'backs');
      for (let i = 0; i < Math.min(extra.count, 6); i++) b.appendChild(Cards.back('mini'));
      el.appendChild(b);
      if (extra.count > 6) el.querySelector('.tags').insertAdjacentHTML('beforeend', `<span class="tag-chip dark">${extra.count} cartas</span>`);
    }
    if (p && !p.connected) el.querySelector('.tags').insertAdjacentHTML('beforeend', '<span class="tag-chip dark">desconectado</span>');
    if (timerState && timerState.total <= 10000 && timerState.seats.includes(seat)) {
      el.querySelector('.who').insertAdjacentHTML('afterend', timerBar());
    }
    const said = p && chatBubbleFor(p.id);
    if (said) el.appendChild(h('div', 'chat-bubble', esc(said)));
    $('#seats').appendChild(el);
    return el;
  }

  // ----- animaciones: cartas que salen del centro de la mesa hacia su sitio -----
  function flyFromCenter(items) {
    // items: [{ el, delay }]; se calcula la distancia al centro cuando ya están colocadas
    requestAnimationFrame(() => {
      const t = $('#table').getBoundingClientRect();
      const cx = t.left + t.width / 2;
      const cy = t.top + t.height * 0.44;
      for (const { el, delay } of items) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--dx', `${cx - (r.left + r.width / 2)}px`);
        el.style.setProperty('--dy', `${cy - (r.top + r.height / 2)}px`);
        el.style.animationDelay = `${delay}ms`;
        el.classList.add('fly');
      }
    });
  }

  // Reparto: cuando empieza una mano (o tras el descarte) las cartas vuelan una a una
  let lastDealKey = null;
  let dealStart = 0;
  let dealPlan = { n: 4, cards: 4, mano: 0, stagger: 60 };
  function dealKeyOf(v) {
    if (v.game === 'pocha') {
      return ['auction', 'bidding'].includes(v.phase) && v.bids.every((b) => b === null)
        ? `p${v.handNumber}-${v.auction ? v.auction.redeals : 0}` : null;
    }
    return v.phase === 'mus' && Object.keys(v.said || {}).every((k) => !v.said[k]) ? `m${v.roundNumber}-${v.musRounds}` : null;
  }
  function checkDeal(v) {
    const key = dealKeyOf(v);
    if (!key || key === lastDealKey) return;
    lastDealKey = key;
    const n = v.game === 'pocha' ? v.n : 4;
    const cards = v.game === 'pocha' ? v.cards : 4;
    dealStart = Date.now();
    dealPlan = { n, cards, mano: v.mano, stagger: Math.max(18, Math.min(70, 1100 / (n * cards))) };
    Sound.deal(Math.min(n * cards, 24), dealPlan.stagger);
  }
  // Retraso de la carta k que recibe el asiento `seat`, descontando lo que ya ha pasado
  function dealDelay(seat, k) {
    const order = (seat - dealPlan.mano + dealPlan.n) % dealPlan.n;
    return (k * dealPlan.n + order) * dealPlan.stagger - (Date.now() - dealStart);
  }
  const dealing = () => Date.now() - dealStart < dealPlan.n * dealPlan.cards * dealPlan.stagger + 400;
  function animateDealIn() {
    if (!dealing()) return;
    const items = [];
    $$('#my-hand .card').forEach((el, k) => items.push({ el, delay: dealDelay(room.mySeat, k) }));
    $$('#seats .seat').forEach((seatDiv) => {
      const s = Number(seatDiv.dataset.seat);
      seatDiv.querySelectorAll('.backs .card, .revealed .card').forEach((el, k) => items.push({ el, delay: dealDelay(s, k) }));
    });
    flyFromCenter(items.filter((it) => it.delay > -350));
  }

  // Sorteo (quién reparte / parejas): cada carta va hacia el jugador al que le toca, con su nombre debajo
  const PILE_POS = {
    bottom: [50, 63], right: [73, 44], top: [50, 31], left: [27, 44], 'top-right': [67, 33], 'top-left': [33, 33],
  };
  let lastDrawCount = 0;
  function renderDrawPiles(d, n) {
    if (d.steps.length < lastDrawCount) lastDrawCount = 0;
    const bySeat = {};
    d.steps.forEach((st, i) => { (bySeat[st.seat] ||= []).push({ ...st, i }); });
    const newest = d.steps.length - 1;
    let flyEl = null;
    for (const [seat, list] of Object.entries(bySeat)) {
      const s = Number(seat);
      const [x, y] = PILE_POS[relPos(s, n)];
      const pile = h('div', 'draw-pile' + (list.some((st) => st.card.r === 12) ? ' got-king' : ''));
      pile.style.left = `${x}%`;
      pile.style.top = `${y}%`;
      const stack = h('div', 'stack');
      list.slice(-4).forEach((st) => {
        const el = Cards.face(st.card, st.card.r === 12 ? 'king' : '');
        if (st.i === newest && d.steps.length > lastDrawCount) flyEl = el;
        stack.appendChild(el);
      });
      pile.appendChild(stack);
      pile.appendChild(h('div', 'who-name', esc(pname(s))));
      $('#seats').appendChild(pile);
    }
    if (flyEl) {
      flyFromCenter([{ el: flyEl, delay: 0 }]);
      Sound.play(d.steps[newest].card.r === 12 ? 'king' : 'card');
    }
    lastDrawCount = d.steps.length;
  }

  // ----- cuenta atrás -----
  let timerState = null; // { seats, deadline, total }
  const timerBar = () => '<div class="tbar"><div class="tfill"></div></div>';
  function updateTimers() {
    if (!timerState) return;
    const left = Math.max(0, timerState.deadline - Date.now());
    const frac = left / timerState.total;
    const secs = Math.ceil(left / 1000);
    $$('.tbar').forEach((b) => {
      b.querySelector('.tfill').style.width = `${frac * 100}%`;
      b.classList.toggle('warn', secs <= 5 && secs > 3);
      b.classList.toggle('danger', secs <= 3);
    });
    $$('.tsec').forEach((e) => { e.textContent = `${secs}s`; });
    $$('.my-timer').forEach((e) => e.classList.toggle('danger', secs <= 3));
    const mine = room && timerState.seats.includes(room.mySeat) && timerState.total <= 10000;
    if (mine && secs <= 3 && secs > 0 && secs !== updateTimers.lastTick) {
      updateTimers.lastTick = secs;
      Sound.play('tick');
    }
  }
  setInterval(updateTimers, 200);

  function meTag(extra = {}) {
    const p = room.players[room.mySeat];
    const row = h('div', 'my-row');
    row.innerHTML = `<div class="me-tag${extra.turn ? ' turn' : ''}">${avatarHtml(p.avatar, 'sm')}${esc(p.name)}${extra.mark ? ' ' + extra.mark : ''}</div>
      ${(extra.tags || []).map((t) => `<span class="tag-chip ${t.cls || ''}">${t.html}</span>`).join('')}
      ${extra.bubble ? `<span class="bubble${extra.hot ? ' hot' : ''}">${esc(extra.bubble)}</span>` : ''}`;
    const said = chatBubbleFor(p.id);
    if (said) row.appendChild(h('span', 'chat-bubble', esc(said)));
    if (timerState && timerState.seats.includes(room.mySeat) && timerState.total <= 10000) {
      const wrap = h('div', 'my-row');
      wrap.appendChild(row);
      wrap.appendChild(h('div', 'my-timer', `${timerBar()}<span class="tsec"></span>`));
      wrap.style.flexDirection = 'column';
      return wrap;
    }
    return row;
  }

  function fitHand(container, count) {
    const w = container.clientWidth - 16;
    const cardW = container.querySelector('.card')?.offsetWidth || 70;
    const total = cardW * count + 4 * (count - 1);
    const overlap = total > w ? (total - w) / Math.max(1, count - 1) : 0;
    [...container.children].forEach((c, i) => { c.style.marginLeft = i === 0 ? '0' : `${4 - overlap}px`; });
  }

  // ----- sala de espera -----
  function renderWaitingSeats() {
    const n = room.players.length;
    if (n < 2 || room.mySeat < 0) return;
    const nn = Math.min(Math.max(n, 2), 5);
    room.players.forEach((p, i) => { if (i !== room.mySeat) seatEl(i, nn, {}); });
  }

  function renderWaitingDialog() {
    const ov = $('#overlay');
    ov.classList.remove('hidden');
    const isHost = room.hostId === me.playerId;
    const n = room.players.length;
    const canStart = n >= room.min && n <= room.max;
    const need = room.min === room.max ? `Hacen falta ${room.min} jugadores` : `De ${room.min} a ${room.max} jugadores`;
    let settings = '';
    const s = room.settings;
    const dis = isHost ? '' : 'disabled';
    if (room.game === 'mus') {
      settings = `
        <div class="row">Puntos por juego <select id="set-puntos" ${dis}><option value="40" ${s.puntos == 40 ? 'selected' : ''}>40</option><option value="30" ${s.puntos == 30 ? 'selected' : ''}>30</option></select></div>
        <div class="row">Juegos para ganar <select id="set-juegos" ${dis}>${[1, 2, 3].map((j) => `<option value="${j}" ${s.juegos == j ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
        <div class="row">Baraja <select id="set-reyes" ${dis}><option value="8" ${s.ochoReyes ? 'selected' : ''}>8 reyes (treses = reyes, doses = ases)</option><option value="4" ${!s.ochoReyes ? 'selected' : ''}>4 reyes</option></select></div>`;
    } else {
      const nn = Math.min(5, Math.max(3, n));
      const max = Math.floor(40 / nn);
      settings = `<p class="muted">Con ${nn} jugadores: indio, de 1 a ${max - 1} cartas, ${nn} subastas de ${max} cartas,
        de ${max - 1} a 1 e indio (${2 * max + nn} manos). Para repartir la primera se tiran cartas hasta que sale un rey.</p>`;
    }
    const teams = false;
    ov.innerHTML = `<div class="dialog">
      <h2>${esc(room.gameName)} · sala de espera</h2>
      <div class="muted">Código de la sala: <span class="code-box">${esc(room.id)}</span></div>
      <div class="waiting-list">${room.players.map((p, i) => `
        <div class="waiting-player">${avatarHtml(p.avatar, 'sm')}<b>${esc(p.name)}</b>
          ${p.id === room.hostId ? '<span class="host">anfitrión</span>' : ''}
          ${teams ? `<span class="team">Pareja ${i % 2 === 0 ? 'A' : 'B'}</span>` : ''}
          ${!p.connected ? '<span class="muted">(desconectado)</span>' : ''}
          <span class="spacer"></span>
          ${isHost && p.id !== me.playerId ? `<button class="btn ghost small" data-kick="${esc(p.id)}" style="color:#999">✕</button>` : ''}
        </div>`).join('')}
        ${Array.from({ length: Math.max(0, room.max - n) }, () => '<div class="waiting-player muted">· silla libre ·</div>').join('')}
      </div>
      ${room.game === 'mus' ? '<p class="muted">Al empezar se sortean las parejas: se tiran cartas y los dos primeros que saquen rey van juntos. Reparte la otra pareja.</p>' : ''}
      ${settings}
      <p class="muted">${need}. ${isHost ? (canStart ? '¡Ya podéis empezar!' : 'Esperando a que se sienten…') : 'El anfitrión empezará la partida.'}</p>
      <div class="row">
        ${isHost ? `<button class="btn primary" id="btn-start" ${canStart ? '' : 'disabled'}>Empezar partida</button>
                    ${room.game === 'pocha' ? '<button class="btn light" id="btn-shuffle">Sortear asientos</button>' : ''}` : ''}
        <button class="btn light" id="btn-wait-leave">Salir</button>
      </div>
      ${room.lastSummary ? `<p class="muted">Última partida: 🏆 ${esc(room.lastSummary.winners.join(' y '))} — ${esc(room.lastSummary.detail)}</p>` : ''}
    </div>`;
    if (isHost) {
      $('#btn-start').onclick = () => emit('startGame');
      if ($('#btn-shuffle')) $('#btn-shuffle').onclick = () => emit('shuffleSeats');
      $$('[data-kick]').forEach((b) => { b.onclick = () => emit('kick', { playerId: b.dataset.kick }); });
      const upd = (obj) => emit('updateSettings', obj);
      if (room.game === 'mus') {
        $('#set-puntos').onchange = (e) => upd({ puntos: Number(e.target.value) });
        $('#set-juegos').onchange = (e) => upd({ juegos: Number(e.target.value) });
        $('#set-reyes').onchange = (e) => upd({ ochoReyes: e.target.value === '8' });
      }
    }
    $('#btn-wait-leave').onclick = async () => { await emit('leaveRoom'); room = null; show('menu'); };
  }

  // ----- POCHA -----
  const handLabel = (type, cards) => (type === 'indio' ? 'Indio' : type === 'subasta' ? 'Subasta' : `${cards} carta${cards > 1 ? 's' : ''}`);

  function renderPocha(v) {
    const n = v.n;
    const my = room.mySeat;

    if (v.phase === 'draw') {
      $('#info').innerHTML = v.draw.done
        ? `<span class="pill">Reparte <b>${esc(pname(v.draw.dealer))}</b> · empieza <b>${esc(pname(v.draw.mano))}</b></span>`
        : '<span class="pill">¿Quién reparte? El primero que saque rey</span>';
      for (let s = 0; s < n; s++) if (s !== my) seatEl(s, n, {});
      renderDrawPiles(v.draw, n);
      $('#controls').appendChild(meTag({}));
      return;
    }

    const bidSum = v.bids.reduce((s, b) => s + (b ?? 0), 0);
    const allBid = v.bids.every((b) => b !== null);
    const subastaN = v.handType === 'subasta' ? v.sequence.slice(0, v.handNumber).filter((x) => x.type === 'subasta').length : 0;
    $('#info').innerHTML = `
      <span class="pill">Mano <b>${v.handNumber}</b>/${v.totalHands}${v.tiebreak ? ' (desempate)' : ''}</span>
      <span class="pill"><b>${handLabel(v.handType, v.cards)}</b>${v.handType === 'subasta' ? ` ${subastaN}/${n} · ${v.cards} cartas` : ''}</span>
      ${v.phase === 'auction' && v.auction ? `<span class="pill">Mínimo <b>${v.auction.min}</b>${v.auction.reduced ? ' (el primero se lo queda)' : ''}</span>` : ''}
      ${v.trump ? `<span class="pill">Triunfo <b>${SUIT_NAMES[v.trump]}</b></span>` : ''}
      ${v.phase === 'auction' || v.phase === 'chooseTrump' ? '' : `<span class="pill">Pedidas: <b>${bidSum}</b>/${v.cards}${allBid ? (bidSum > v.cards ? ' · sobran' : ' · faltan') : ''}</span>`}`;

    const A = v.auction;
    for (let s = 0; s < n; s++) {
      if (s === my) continue;
      const tags = [];
      if (v.phase === 'auction' && A) {
        if (A.highestSeat === s) tags.push({ html: `Puja ${A.highest}`, cls: 'gold' });
        else if (A.passed.includes(s)) tags.push({ html: 'Pasa', cls: 'dark' });
      } else if (v.bids[s] !== null) {
        tags.push({ html: `${v.auctionWinner === s ? 'Subasta ' : 'Pide '}${v.bids[s]}`, cls: v.auctionWinner === s ? 'gold' : '' });
      }
      if (v.phase === 'playing' || v.phase === 'trickDone' || v.phase === 'handEnd') tags.push({ html: `Lleva ${v.tricks[s]}`, cls: v.tricks[s] === v.bids[s] ? 'gold' : 'dark' });
      tags.push({ html: `${v.scores[s]} pts`, cls: 'dark' });
      if (s === v.dealer) tags.push({ html: 'Reparte', cls: 'dark' });
      const indioCards = v.othersHands ? v.othersHands[s] : null;
      seatEl(s, n, {
        turn: v.turn === s,
        count: indioCards ? 0 : v.handSizes[s],
        revealed: indioCards || null,
        tags,
      });
    }

    // Centro: solo la carta de triunfo y la baza
    const c = $('#center');
    if (v.trump) {
      const tb = h('div', 'trump-box');
      tb.appendChild(v.trumpCard ? Cards.face(v.trumpCard) : h('div', 'big-suit', Cards.suitIcon(v.trump, 40)));
      tb.title = `Triunfo: ${SUIT_NAMES[v.trump]}`;
      c.appendChild(tb);
    }
    const ta = h('div', 'trick-area');
    v.trick.forEach((t) => {
      const e = Cards.face(t.card, v.trickWinner === t.seat ? 'win' : '');
      const [x, y] = TRICK_POS[relPos(t.seat, n)];
      e.style.left = x + '%';
      e.style.top = y + '%';
      ta.appendChild(e);
    });
    c.appendChild(ta);

    // Mi zona
    const myTags = [];
    if (v.phase === 'auction' && A) {
      if (A.highestSeat === my) myTags.push({ html: `Pujas ${A.highest}`, cls: 'gold' });
      else if (A.passed.includes(my)) myTags.push({ html: 'Has pasado', cls: 'dark' });
    } else if (v.bids[my] !== null) {
      myTags.push({ html: `${v.auctionWinner === my ? 'Subastas' : 'Pides'} ${v.bids[my]}`, cls: v.auctionWinner === my ? 'gold' : '' });
    }
    if (v.phase === 'playing' || v.phase === 'trickDone' || v.phase === 'handEnd') myTags.push({ html: `Llevas ${v.tricks[my]}`, cls: v.tricks[my] === v.bids[my] ? 'gold' : 'dark' });
    myTags.push({ html: `${v.scores[my]} pts`, cls: 'dark' });
    if (my === v.dealer) myTags.push({ html: 'Repartes', cls: 'dark' });
    const ctr = $('#controls');
    ctr.appendChild(meTag({ turn: v.turn === my, tags: myTags }));

    if (v.phase === 'auction') {
      if (v.turn === my) {
        ctr.appendChild(h('div', 'hint', A.reduced ? `¿Te pides ${A.min}? El primero que diga sí se lo queda` : '¿Cuántas bazas subastas? (el que más se pida elige triunfo)'));
        const bb = h('div', 'bid-buttons');
        v.auctionOptions.forEach((k) => {
          const b = h('button', 'btn primary', String(k));
          b.onclick = () => emit('action', { type: 'auctionBid', value: k });
          bb.appendChild(b);
        });
        const p = h('button', 'btn light', 'Paso');
        p.onclick = () => emit('action', { type: 'auctionPass' });
        bb.appendChild(p);
        ctr.appendChild(bb);
      } else {
        ctr.appendChild(h('div', 'hint', `Subasta: habla ${esc(pname(v.turn))}…`));
      }
    } else if (v.phase === 'chooseTrump') {
      if (v.turn === my) {
        ctr.appendChild(h('div', 'hint', `Te has llevado la subasta con ${v.bids[my]}: elige el triunfo`));
        const sb = h('div', 'suit-buttons');
        ['oros', 'copas', 'espadas', 'bastos'].forEach((s) => {
          const b = h('button', 'btn light', `${Cards.suitIcon(s, 22)} ${SUIT_NAMES[s]}`);
          b.onclick = () => emit('action', { type: 'trump', suit: s });
          sb.appendChild(b);
        });
        ctr.appendChild(sb);
      } else {
        ctr.appendChild(h('div', 'hint', `${esc(pname(v.turn))} se ha llevado la subasta con ${v.bids[v.turn]} y está eligiendo triunfo…`));
      }
    } else if (v.phase === 'bidding') {
      if (v.turn === my) {
        const last = v.bidOrder[v.bidOrder.length - 1] === my;
        ctr.appendChild(h('div', 'hint', v.handType === 'indio' ? 'Indio: ¿cuántas bazas harás? (tu carta no la ves)' : '¿Cuántas bazas vas a hacer?'));
        const bb = h('div', 'bid-buttons');
        for (let k = 0; k <= v.cards; k++) {
          const b = h('button', 'btn primary', String(k));
          if (last && v.forbiddenBid === k) { b.disabled = true; b.title = 'Eres el último en pedirte: la suma no puede cuadrar'; }
          b.onclick = () => emit('action', { type: 'bid', value: k });
          bb.appendChild(b);
        }
        ctr.appendChild(bb);
      } else {
        ctr.appendChild(h('div', 'hint', `Se pide ${esc(pname(v.turn))}…`));
      }
    } else if (v.phase === 'playing') {
      const mine = v.handType === 'indio' ? 'Tu turno: juega tu carta (sin verla)' : 'Tu turno: juega una carta';
      ctr.appendChild(h('div', 'hint', v.turn === my ? mine : `Juega ${esc(pname(v.turn))}…`));
    }

    const hand = $('#my-hand');
    const myTurnPlay = v.phase === 'playing' && v.turn === my;
    v.myHand.forEach((card) => {
      const legal = v.legal.includes(card.id);
      const cls = myTurnPlay ? (legal ? 'playable' : 'dim') : '';
      const e = card.hidden ? Cards.back(cls) : Cards.face(card, cls);
      if (myTurnPlay && legal) e.onclick = () => emit('action', { type: 'play', card: card.id });
      hand.appendChild(e);
    });
    requestAnimationFrame(() => fitHand(hand, v.myHand.length));
  }

  // ----- MUS -----
  const LANCES = ['grande', 'chica', 'pares', 'juego'];
  function renderMus(v) {
    const my = room.mySeat;
    const myTeam = my % 2;
    const teamName = (t) => (t === myTeam ? 'Nosotros' : 'Ellos');
    if (v.phase === 'draw') {
      $('#info').innerHTML = v.draw.done
        ? `<span class="pill">Parejas: <b>${esc(pname(1))} y ${esc(pname(3))}</b> contra <b>${esc(pname(0))} y ${esc(pname(2))}</b> · reparte ${esc(pname(0))}</span>`
        : '<span class="pill">Sorteo de parejas: los dos primeros reyes van juntos</span>';
      for (let s = 0; s < 4; s++) if (s !== my) seatEl(s, 4, {});
      renderDrawPiles(v.draw, 4);
      $('#controls').appendChild(meTag({}));
      return;
    }
    const lanceIdx = v.lance ? LANCES.indexOf(v.lance === 'punto' ? 'juego' : v.lance) : -1;
    $('#info').innerHTML = `
      <div class="mus-score">
        ${[myTeam, 1 - myTeam].map((t) => `<div class="team-score ${t === myTeam ? 'mine' : ''}">${teamName(t)} <b>${v.scores[t]}</b> <span title="Juegos">· ${v.juegos[t]} J</span></div>`).join('')}
      </div>`;

    const reveal = v.hands && (v.phase === 'roundEnd' || v.phase === 'finished');
    for (let s = 0; s < 4; s++) {
      if (s === my) continue;
      const tags = [{ html: s % 2 === myTeam ? 'Compañero' : 'Rival', cls: s % 2 === myTeam ? 'gold' : 'dark' }];
      if (v.lance === 'pares' && v.declared.pares) tags.push({ html: v.declared.pares[s] ? 'Pares sí' : 'Pares no' });
      if ((v.lance === 'juego' || v.lance === 'punto') && v.declared.juego) tags.push({ html: v.declared.juego[s] ? 'Juego sí' : 'Juego no' });
      if (v.phase === 'discard' && v.discarded.includes(s)) tags.push({ html: 'Descartado ✓' });
      if (reveal && v.handInfo) tags.push({ html: `${v.handInfo[s].pares || 'Sin pares'} · ${v.handInfo[s].juego}`, cls: 'dark' });
      const said = v.said[s];
      seatEl(s, 4, {
        turn: v.turn === s,
        count: reveal ? 0 : v.handCounts[s],
        revealed: reveal ? v.hands[s] : null,
        tags,
        bubble: said,
        hot: said && /Órdago|Envido|más/.test(said),
        mark: s === v.mano ? '✋' : '',
        markTitle: 'Mano',
      });
    }

    // Centro: solo la ronda en la que estamos, coloreada (y lo que hay en juego)
    const c = $('#center');
    const track = h('div', 'lance-track');
    const stake = v.bet && v.bet.phase === 'envite' ? ` · ${v.bet.ordago ? '¡Órdago!' : v.bet.amount}` : '';
    track.innerHTML = (v.phase === 'mus' || v.phase === 'discard')
      ? `<span class="lance-step active">${v.phase === 'mus' ? 'Mus' : 'Descarte'}${v.musRounds ? ` (${v.musRounds + (v.phase === 'mus' ? 1 : 0)}ª)` : ''}</span>`
      : LANCES.map((l, i) => `<span class="lance-step ${i === lanceIdx ? 'active' : i < lanceIdx ? 'done' : ''}">${l === 'juego' && v.lance === 'punto' ? 'Punto' : v.lanceNames[l]}${i === lanceIdx ? stake : ''}</span>`).join('');
    c.appendChild(track);

    // Mi zona
    const ctr = $('#controls');
    const myTags = [];
    if (v.myInfo) myTags.push({ html: `${v.myInfo.pares || 'Sin pares'} · ${v.myInfo.juego >= 31 ? 'Juego ' + v.myInfo.juego : 'Punto ' + v.myInfo.juego}`, cls: 'dark' });
    ctr.appendChild(meTag({ turn: v.turn === my, tags: myTags, mark: my === v.mano ? '✋ eres mano' : '', bubble: v.said[my] }));

    const act = v.actions;
    const btn = (label, cls, fn) => { const b = h('button', `btn ${cls}`, label); b.onclick = fn; ctr.appendChild(b); return b; };
    if (act.includes('mus')) {
      btn('Mus', 'primary', () => emit('action', { type: 'mus' }));
      btn('No hay mus', 'light', () => emit('action', { type: 'nomus' }));
    } else if (act.includes('discard')) {
      const b = btn(`Descartar (${discardSel.size})`, 'primary', () => {
        emit('action', { type: 'discard', cards: [...discardSel] });
      });
      b.disabled = discardSel.size === 0;
    } else if (act.includes('paso') || act.includes('quiero')) {
      const open = act.includes('paso');
      if (open) btn('Paso', 'light', () => emit('action', { type: 'paso' }));
      if (act.includes('quiero')) {
        btn('Quiero', 'primary', () => emit('action', { type: 'quiero' }));
        btn('No quiero', 'light', () => emit('action', { type: 'noquiero' }));
      }
      if (act.includes('envido')) {
        // Un solo botón de envidar: empieza en 2 (o en 1 si subes un envite) y se sube con +1 / +5
        const min = open ? 2 : 1;
        if (!envidoVal || envidoVal < min) envidoVal = min;
        btn(open ? `Envido ${envidoVal}` : `Subo ${envidoVal}`, 'primary env-amount', () => {
          const value = envidoVal;
          envidoVal = null;
          emit('action', { type: 'envido', value });
        });
        btn('+1', 'light', () => { envidoVal = Math.min(40, envidoVal + 1); renderRoom(); });
        btn('+5', 'light', () => { envidoVal = Math.min(40, envidoVal + 5); renderRoom(); });
        // Siempre presente (aunque desactivado) para que los botones no cambien de sitio
        btn('↺', 'ghost', () => { envidoVal = min; renderRoom(); }).disabled = envidoVal <= min;
      }
      if (act.includes('ordago')) btn('¡Órdago!', 'danger', () => { if (confirm('¿Seguro que echas un órdago?')) emit('action', { type: 'ordago' }); });
    }

    const hand = $('#my-hand');
    const canDiscard = act.includes('discard');
    v.myHand.forEach((card) => {
      const e = Cards.face(card, canDiscard ? 'playable' + (discardSel.has(card.id) ? ' selected' : '') : '');
      if (canDiscard) {
        e.onclick = () => {
          if (discardSel.has(card.id)) discardSel.delete(card.id); else discardSel.add(card.id);
          renderRoom();
        };
      }
      hand.appendChild(e);
    });
    requestAnimationFrame(() => fitHand(hand, v.myHand.length));
  }

  // ----- resúmenes -----
  function renderOverlay(v) {
    const ov = $('#overlay');
    const my = room.mySeat;
    let html = '';
    const iAmReady = v.ready && v.ready.includes(my);
    const readyBtn = (label) => (iAmReady
      ? `<p class="muted">Esperando al resto (${v.ready.length}/${room.players.length})…</p>`
      : `<button class="btn primary" id="btn-ready">${label} <span class="tsec"></span></button>`);
    const hideBtn = '<button class="btn light" id="btn-hide-ov">Ver la mesa</button>';

    if (v.phase === 'finished') {
      html = finishedHtml(v);
    } else if (v.game === 'pocha' && v.phase === 'handEnd') {
      const last = v.history[v.history.length - 1];
      html = `<div class="dialog"><h2>Fin de la mano ${v.history.length} (${handLabel(last.type, last.cards)}${last.type === 'subasta' ? ` de ${esc(pname(last.auctionWinner))}` : ''})</h2>
        <table class="stat-table"><thead><tr><th>Jugador</th><th>Pidió</th><th>Hizo</th><th>Puntos</th><th>Total</th></tr></thead><tbody>
        ${room.players.map((p, s) => `<tr><td class="name">${avatarHtml(p.avatar, 'sm')}${esc(p.name)}</td><td>${last.bids[s]}</td><td>${last.tricks[s]}</td>
          <td style="color:${last.points[s] >= 0 ? '#2b8a3e' : '#c0392b'};font-weight:700">${last.points[s] > 0 ? '+' : ''}${last.points[s]}</td><td><b>${last.totals[s]}</b></td></tr>`).join('')}
        </tbody></table>
        <div class="row">${readyBtn('Siguiente mano')} ${hideBtn}</div></div>`;
    } else if (v.game === 'mus' && v.phase === 'roundEnd') {
      const myTeam = my % 2;
      const tn = (t) => (t === myTeam ? 'Nosotros' : 'Ellos');
      let head = '';
      if (v.ordagoResult) head = `<div class="result-big">Órdago a ${v.lanceNames[v.ordagoResult.lance]}: gana ${esc(pname(v.ordagoResult.winnerSeat))}</div>`;
      if (v.juegoWinner !== null) head += `<div class="result-big">${v.juegoWinner === myTeam ? '🎉 ¡Juego para nosotros!' : 'Juego para ellos'}</div>`;
      if (v.matchWinner !== null) head += `<div class="result-big">${v.matchWinner === myTeam ? '🏆 ¡Habéis ganado la partida!' : 'Han ganado la partida'}</div>`;
      html = `<div class="dialog"><h2>Fin de la mano</h2>${head}
        <div class="waiting-list">${room.players.map((p, s) => {
          const info = v.handInfo[s];
          const won = (v.lanceWinners || []).filter((w) => w.seat === s).map((w) => v.lanceNames[w.lance]);
          return `<div class="waiting-player end-row"><div class="top">${avatarHtml(p.avatar, 'sm')}<div><b>${esc(p.name)}</b> <span class="muted">${s % 2 === myTeam ? 'nosotros' : 'ellos'}</span>
            <div class="muted">${info.pares || 'Sin pares'} · ${info.juego >= 31 ? 'juego ' + info.juego : 'punto ' + info.juego}${won.length ? ' · gana ' + won.join(', ') : ''}</div></div></div>
            <div class="end-hand" data-seat="${s}"></div></div>`;
        }).join('')}</div>
        <ul class="breakdown">${v.breakdown.length ? v.breakdown.map((b) => `<li><span>${esc(b.reason)}</span><b>${tn(b.team)} +${b.points}</b></li>`).join('') : '<li>Sin piedras esta mano</li>'}</ul>
        <div class="row" style="justify-content:space-between"><span>Nosotros <b>${v.scores[myTeam]}</b> · Ellos <b>${v.scores[1 - myTeam]}</b></span><span>Juegos ${v.juegos[myTeam]}-${v.juegos[1 - myTeam]}</span></div>
        <div class="row">${readyBtn(v.matchWinner !== null ? 'Ver resultado' : 'Siguiente mano')} ${hideBtn}</div></div>`;
    }

    const key = v.phase + ':' + (v.handNumber || v.roundNumber);
    if (!html || overlayHiddenFor === key) {
      ov.classList.add('hidden');
      if (html && overlayHiddenFor === key) {
        const b = h('button', 'btn primary', 'Ver resumen');
        b.onclick = () => { overlayHiddenFor = null; renderRoom(); };
        $('#controls').appendChild(b);
      }
      return;
    }
    ov.classList.remove('hidden');
    ov.innerHTML = html;
    $$('#overlay .end-hand').forEach((el) => {
      const s = Number(el.dataset.seat);
      (v.hands[s] || []).forEach((c) => el.appendChild(Cards.face(c)));
    });
    const rb = $('#btn-ready');
    if (rb) rb.onclick = () => emit('action', { type: 'ready' });
    const hb = $('#btn-hide-ov');
    if (hb) hb.onclick = () => { overlayHiddenFor = key; renderRoom(); };
    const isHost = room.hostId === me.playerId;
    const again = $('#btn-again');
    if (again) again.onclick = () => emit('backToWaiting');
    const out = $('#btn-out');
    if (out) out.onclick = async () => { await emit('leaveRoom'); room = null; show('menu'); };
    if (!isHost && again) again.remove();
  }

  function finishedHtml(v) {
    const sum = v.summary;
    const my = room.mySeat;
    let body;
    if (v.game === 'mus') {
      const won = sum.winners.includes(my);
      body = `<div class="result-big">${won ? '🏆 ¡Victoria!' : 'Derrota… ¡a por la revancha!'}</div>
        <div class="podium">${[0, 1].map((t) => `<div class="waiting-player ${sum.winners.includes(t) ? 'first' : ''}">
          ${avatarHtml(room.players[t].avatar, 'sm')}${avatarHtml(room.players[t + 2].avatar, 'sm')}
          <b>${esc(room.players[t].name)} y ${esc(room.players[t + 2].name)}</b><span class="spacer"></span><b>${sum.juegos[t]} juego${sum.juegos[t] === 1 ? '' : 's'}</b></div>`).join('')}</div>`;
    } else {
      body = `<div class="podium">${sum.ranking.map((r, i) => `<div class="waiting-player ${i === 0 ? 'first' : ''}">
          <b>${i + 1}º</b>${avatarHtml(room.players[r.seat].avatar, 'sm')}<b>${esc(room.players[r.seat].name)}</b>
          <span class="spacer"></span><b>${r.score} pts</b></div>`).join('')}</div>`;
    }
    return `<div class="dialog"><h2>Fin de la partida</h2>${body}
      <p class="muted">El resultado se ha guardado en las estadísticas.</p>
      <div class="row"><button class="btn primary" id="btn-again">Otra partida</button><button class="btn light" id="btn-out">Volver al menú</button></div></div>`;
  }

  function renderScorePanel() {
    const body = $('#score-body');
    if (!room || !room.view) { body.innerHTML = '<p class="muted">Aún no hay partida.</p>'; return; }
    const v = room.view;
    if (v.game === 'pocha') {
      const ps = room.players;
      body.innerHTML = `<table><thead><tr><th>Cartas</th>${ps.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
        ${v.history.map((hst) => `<tr><td>${handLabel(hst.type, hst.cards)} ${hst.trump ? Cards.suitIcon(hst.trump, 12) : ''}</td>${ps.map((p, s) => `<td class="${hst.bids[s] === hst.tricks[s] ? 'ok' : 'ko'}" title="Pidió ${hst.bids[s]}, hizo ${hst.tricks[s]}">${hst.totals[s]}<br><small>${hst.bids[s]}/${hst.tricks[s]}</small></td>`).join('')}</tr>`).join('')}
        ${v.sequence.slice(v.history.length).map((x) => `<tr><td>${handLabel(x.type, x.cards)}</td>${ps.map(() => '<td>·</td>').join('')}</tr>`).join('')}
        </tbody></table>`;
    } else {
      const myTeam = room.mySeat % 2;
      body.innerHTML = `<p><b>Nosotros</b> ${v.scores[myTeam]} piedras · ${v.juegos[myTeam]} juegos<br><b>Ellos</b> ${v.scores[1 - myTeam]} piedras · ${v.juegos[1 - myTeam]} juegos</p>
        <p class="muted">Mano nº ${v.roundNumber}</p>
        <ul class="log">${v.log.slice().reverse().map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
    }
  }

  window.addEventListener('resize', () => { if (screen === 'room') renderRoom(); });

  // ---------- sonido ----------
  function renderSoundButtons() {
    $$('.snd-music').forEach((b) => { b.textContent = '🎵'; b.style.opacity = Sound.prefs.music ? 1 : 0.45; b.title = Sound.prefs.music ? 'Quitar música' : 'Poner música'; });
    $$('.snd-sfx').forEach((b) => { b.textContent = Sound.prefs.sfx ? '🔊' : '🔇'; b.title = Sound.prefs.sfx ? 'Quitar sonidos' : 'Poner sonidos'; });
  }
  $$('.snd-music').forEach((b) => { b.onclick = () => { Sound.setMusic(!Sound.prefs.music); renderSoundButtons(); }; });
  $$('.snd-sfx').forEach((b) => { b.onclick = () => { Sound.setSfx(!Sound.prefs.sfx); renderSoundButtons(); }; });
  renderSoundButtons();
  // El audio solo puede empezar tras el primer toque; cada botón suena al pulsarlo
  document.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (e.target.closest('.btn, .avatar-opt, .color-opt, .known-opt, .tab, .me.clickable')) Sound.play('click');
    else if (e.target.closest('.hand .card.playable')) Sound.play('card');
  }, true);
  // Mantener despierto el servidor gratuito mientras alguien tenga la web abierta
  setInterval(() => { fetch('/ping').catch(() => {}); }, 4 * 60 * 1000);

  // ---------- arranque ----------
  drawArt();
  renderLogin(true);
  if (me.name) {
    show('menu');
    socket.connect();
  } else {
    show('login');
    loadKnown();
  }
})();
