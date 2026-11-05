// Cartas de baraja española dibujadas en SVG (diseño propio, estilo tradicional):
// marco con "pinta" (oros sin cortes, copas 1, espadas 2, bastos 3), bastos y espadas
// alargados y cruzados, y figuras de cuerpo entero.
(function () {
  const INK = '#2b1d12';
  const SUIT_COLOR = { oros: '#a8700a', copas: '#b8281c', espadas: '#1f4f96', bastos: '#2f6b1a' };
  const FIG = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' };
  const PINTA = { oros: 0, copas: 1, espadas: 2, bastos: 3 };

  // ---- Símbolos de palo ----
  // Oros y copas en caja 24x24; espadas y bastos alargados en caja 12x60 (centro 6,30)
  const ORO = `
    <circle cx="12" cy="12" r="11" fill="#f2c335" stroke="${INK}" stroke-width="1"/>
    <circle cx="12" cy="12" r="8.6" fill="#f7d660" stroke="#b07812" stroke-width=".8"/>
    <g stroke="#b07812" stroke-width=".9">
      <path d="M12 3.6v3M12 17.4v3M3.6 12h3M17.4 12h3M6 6l2.1 2.1M15.9 15.9L18 18M18 6l-2.1 2.1M8.1 15.9L6 18"/>
    </g>
    <circle cx="12" cy="12" r="4.6" fill="#e9a720" stroke="${INK}" stroke-width=".8"/>
    <circle cx="12" cy="12" r="2.2" fill="#c0392b"/>`;
  const COPA = `
    <path d="M3.5 2.2h17c.2 6.3-3.3 10.3-8.5 10.8C6.8 12.5 3.3 8.5 3.5 2.2z" fill="#c8331f" stroke="${INK}" stroke-width=".9"/>
    <path d="M3.6 2.2h16.8v2.1H3.6z" fill="#f2c335" stroke="${INK}" stroke-width=".7"/>
    <path d="M7 6.5c1.5 2.5 3 3.4 5 3.6" fill="none" stroke="#f7d660" stroke-width=".9"/>
    <circle cx="12" cy="7.4" r="1.3" fill="#2c5aa0" stroke="${INK}" stroke-width=".5"/>
    <path d="M10.6 12.9h2.8l-.3 2.2.9.8-.9.8.4 2.4h-3l.4-2.4-.9-.8.9-.8z" fill="#f2c335" stroke="${INK}" stroke-width=".7"/>
    <path d="M6 22.6c.4-2.4 2.9-3.6 6-3.6s5.6 1.2 6 3.6z" fill="#f2c335" stroke="${INK}" stroke-width=".8"/>
    <path d="M8.5 21.2h7" stroke="#c8331f" stroke-width=".8"/>`;
  const ESPADA = `
    <path d="M6 0.6l2.3 3.2V43H3.7V3.8z" fill="#9cc3ef" stroke="${INK}" stroke-width=".8"/>
    <path d="M6 3v40" stroke="#4f7fbf" stroke-width="1"/>
    <path d="M0.6 42.6c1.8-1.4 3.6-1.2 5.4 0 1.8-1.2 3.6-1.4 5.4 0v2.4c-1.8-1.1-3.6-.9-5.4.2-1.8-1.1-3.6-1.3-5.4-.2z" fill="#f2c335" stroke="${INK}" stroke-width=".7"/>
    <rect x="4.4" y="45" width="3.2" height="10" rx="1" fill="#c8331f" stroke="${INK}" stroke-width=".7"/>
    <path d="M4.4 48h3.2M4.4 51h3.2" stroke="#f2c335" stroke-width=".7"/>
    <circle cx="6" cy="57.4" r="2.2" fill="#f2c335" stroke="${INK}" stroke-width=".7"/>`;
  const BASTO = `
    <path d="M3.4 59.2L2.2 10C2 3.5 4 .8 6.2.8S10.4 3.5 10 10l-1.2 49.2c-1.8.8-3.6.8-5.4 0z" fill="#5d9c2e" stroke="${INK}" stroke-width=".9"/>
    <path d="M5 3.5c-.9 2.5-1 6-.9 10" fill="none" stroke="#a9d36d" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M2.4 15.5l-2-1.4M9.8 22l2-1.5M2.7 30l-2-1.2M9.4 38l2-1.3M3 46l-1.9-1" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M2.4 15.5l-1.6-1.1M9.8 22l1.6-1.2M2.7 30l-1.6-1M9.4 38l1.6-1M3 46l-1.5-.8" stroke="#c8331f" stroke-width=".6" stroke-linecap="round"/>
    <path d="M3.5 56.5h5" stroke="#c8331f" stroke-width="1.2"/>`;
  const SYMBOL = { oros: ORO, copas: COPA, espadas: ESPADA, bastos: BASTO };
  const LONG = { espadas: true, bastos: true };

  const round = (def, x, y, size) => `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})">${def}</g>`;
  const long = (def, x, y, len, angle) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${len / 60}) translate(-6 -30)">${def}</g>`;

  // ---- Colocación de los símbolos (carta de 100 x 155) ----
  const ROUND_LAYOUT = {
    1: [[50, 77, 52]],
    2: [[50, 44, 32], [50, 111, 32]],
    3: [[50, 37, 27], [50, 77, 27], [50, 117, 27]],
    4: [[32, 44, 27], [68, 44, 27], [32, 111, 27], [68, 111, 27]],
    5: [[32, 40, 25], [68, 40, 25], [50, 77, 25], [32, 114, 25], [68, 114, 25]],
    6: [[32, 37, 24], [68, 37, 24], [32, 77, 24], [68, 77, 24], [32, 117, 24], [68, 117, 24]],
    7: [[32, 34, 22], [68, 34, 22], [50, 55, 22], [32, 77, 22], [68, 77, 22], [32, 119, 22], [68, 119, 22]],
  };
  // Bastos y espadas: cruzados, como en la baraja tradicional
  const LONG_LAYOUT = {
    1: [[50, 77, 112, 0]],
    2: [[50, 77, 104, 24], [50, 77, 104, -24]],
    3: [[50, 77, 104, 26], [50, 77, 104, -26], [50, 77, 104, 0]],
    4: [[50, 48, 62, 38], [50, 48, 62, -38], [50, 107, 62, 38], [50, 107, 62, -38]],
    5: [[50, 48, 62, 38], [50, 48, 62, -38], [50, 107, 62, 38], [50, 107, 62, -38], [50, 77, 56, 90]],
    6: [[50, 42, 50, 40], [50, 42, 50, -40], [50, 77, 50, 40], [50, 77, 50, -40], [50, 112, 50, 40], [50, 112, 50, -40]],
    7: [[50, 40, 48, 40], [50, 40, 48, -40], [50, 77, 50, 0], [50, 77, 48, 40], [50, 77, 48, -40], [50, 114, 48, 40], [50, 114, 48, -40]],
  };

  // ---- Marco con pinta ----
  function frame(s) {
    const col = SUIT_COLOR[s];
    const g = PINTA[s];
    const x1 = 7;
    const x2 = 93;
    const top = 7;
    const bot = 148;
    // Huecos centrados (ancho 6, separación 9)
    const gaps = [];
    for (let i = 0; i < g; i++) gaps.push(50 + (i - (g - 1) / 2) * 9);
    const hline = (y) => {
      let x = x1;
      let d = '';
      for (const c of gaps) { d += `M${x} ${y}H${c - 3}`; x = c + 3; }
      d += `M${x} ${y}H${x2}`;
      return d;
    };
    return `<path d="${hline(top)}${hline(bot)}M${x1} ${top}V${bot}M${x2} ${top}V${bot}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
  }

  function indices(card) {
    const col = SUIT_COLOR[card.s];
    const t = String(card.r);
    return `<text x="11" y="23" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="15" fill="${col}">${t}</text>
            <text x="89" y="143" text-anchor="end" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="15" fill="${col}">${t}</text>`;
  }

  // ---- Figuras (sota, caballo, rey), dibujo propio ----
  const PAL = {
    oros: { a: '#c8331f', b: '#f2c335', c: '#2c5aa0' },
    copas: { a: '#2c5aa0', b: '#c8331f', c: '#f2c335' },
    espadas: { a: '#3d7a1f', b: '#2c5aa0', c: '#c8331f' },
    bastos: { a: '#c8331f', b: '#3d7a1f', c: '#f2c335' },
  };
  const SKIN = '#f3d2b0';

  function heldItem(s, x, y, scale) {
    if (LONG[s]) return long(SYMBOL[s], x, y, 52 * scale, s === 'espadas' ? -8 : 12);
    return round(SYMBOL[s], x, y, 22 * scale);
  }

  function face(x, y, beard) {
    return `<ellipse cx="${x}" cy="${y}" rx="7" ry="8" fill="${SKIN}" stroke="${INK}" stroke-width=".8"/>
      <path d="M${x - 3} ${y - 1}h1.6M${x + 1.4} ${y - 1}h1.6" stroke="${INK}" stroke-width="1"/>
      <path d="M${x - 1.5} ${y + 3.5}q1.5 1 3 0" fill="none" stroke="${INK}" stroke-width=".7"/>
      ${beard ? `<path d="M${x - 6.5} ${y + 1}c0 7 3 10 6.5 10s6.5-3 6.5-10c-2 2.5-4 3-6.5 3s-4.5-.5-6.5-3z" fill="#8a5a2b" stroke="${INK}" stroke-width=".7"/>` : ''}
      <path d="M${x - 7} ${y - 2}c0-6 3-9 7-9s7 3 7 9c-2-3-4.5-4-7-4s-5 1-7 4z" fill="#6b4423" stroke="${INK}" stroke-width=".6"/>`;
  }

  function ermine(x1, x2, y) {
    let dots = '';
    for (let x = x1 + 3; x < x2 - 1; x += 5) dots += `<path d="M${x} ${y + 1.5}v2.4" stroke="${INK}" stroke-width="1"/>`;
    return `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="5" fill="#fff" stroke="${INK}" stroke-width=".6"/>${dots}`;
  }

  function rey(s) {
    const p = PAL[s];
    return `
      <path d="M30 140l4-74c2-8 9-11 16-11s14 3 16 11l4 74z" fill="${p.a}" stroke="${INK}" stroke-width="1"/>
      <path d="M38 68l12 70 12-70" fill="${p.c}" stroke="${INK}" stroke-width=".8"/>
      <path d="M44 72h12M45 82h10M46 92h8M47 102h6" stroke="${p.b}" stroke-width="2"/>
      ${ermine(29, 71, 133)}
      <path d="M33 62c-6 6-10 18-10 34l8 2c1-12 3-22 7-28z" fill="${p.b}" stroke="${INK}" stroke-width=".9"/>
      <path d="M67 62c6 6 10 18 10 34l-8 2c-1-12-3-22-7-28z" fill="${p.b}" stroke="${INK}" stroke-width=".9"/>
      <circle cx="27" cy="99" r="3.6" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/>
      <circle cx="73" cy="99" r="3.6" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/>
      ${face(50, 46, true)}
      <path d="M40 38l2-12 4 6 4-9 4 9 4-6 2 12z" fill="#f2c335" stroke="${INK}" stroke-width=".9"/>
      <circle cx="50" cy="31" r="1.5" fill="#c8331f"/><circle cx="43.5" cy="34" r="1.1" fill="#2c5aa0"/><circle cx="56.5" cy="34" r="1.1" fill="#2c5aa0"/>
      ${heldItem(s, 73, LONG[s] ? 74 : 88, 1)}`;
  }

  function sota(s) {
    const p = PAL[s];
    return `
      <path d="M41 112l-2 28h7l3-28zM51 112l3 28h7l-2-28z" fill="${p.c}" stroke="${INK}" stroke-width=".8"/>
      <path d="M38 140h9M53 140h9" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M34 114l4-46c2-7 7-10 12-10s10 3 12 10l4 46z" fill="${p.a}" stroke="${INK}" stroke-width="1"/>
      <path d="M34 108h32v6H34z" fill="${p.b}" stroke="${INK}" stroke-width=".7"/>
      <path d="M50 60v48" stroke="${p.b}" stroke-width="2" stroke-dasharray="3 3"/>
      <path d="M36 64c-5 6-8 16-8 28l7 1c1-10 3-17 6-22z" fill="${p.b}" stroke="${INK}" stroke-width=".9"/>
      <path d="M64 64c5 6 8 16 8 28l-7 1c-1-10-3-17-6-22z" fill="${p.b}" stroke="${INK}" stroke-width=".9"/>
      <circle cx="31" cy="95" r="3.4" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/>
      <circle cx="69" cy="95" r="3.4" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/>
      ${face(50, 48, false)}
      <path d="M40 41c0-6 4-10 10-10s10 4 10 10c-3-2-6-3-10-3s-7 1-10 3z" fill="${p.a}" stroke="${INK}" stroke-width=".8"/>
      <path d="M58 33c4-4 8-4 10-2-3 1-6 3-8 6z" fill="#fff" stroke="${INK}" stroke-width=".6"/>
      ${heldItem(s, LONG[s] ? 71 : 50, LONG[s] ? 72 : 80, LONG[s] ? 0.95 : 1.1)}`;
  }

  function caballo(s) {
    const p = PAL[s];
    return `
      <path d="M24 118l-3 22M36 120l1 20M64 120l-1 20M76 116l4 22" stroke="#7a5230" stroke-width="5" stroke-linecap="round"/>
      <path d="M21 140h4M35 140h4M61 140h4M78 138h4" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M80 104c8 4 10 14 6 24-1-8-4-14-8-16z" fill="#5b3a1e" stroke="${INK}" stroke-width=".8"/>
      <ellipse cx="50" cy="108" rx="31" ry="15" fill="#a87545" stroke="${INK}" stroke-width="1"/>
      <path d="M28 102c-6-8-8-18-6-28l9-4c4 6 6 14 8 24z" fill="#a87545" stroke="${INK}" stroke-width="1"/>
      <path d="M22 74c-6 0-10 4-11 9l6 3c2-3 4-4 7-4z" fill="#a87545" stroke="${INK}" stroke-width="1"/>
      <path d="M23 71l3-6 3 5" fill="#a87545" stroke="${INK}" stroke-width=".8"/>
      <path d="M27 70c2 8 4 16 9 26" fill="none" stroke="#5b3a1e" stroke-width="3"/>
      <circle cx="18" cy="78" r="1" fill="${INK}"/>
      <path d="M36 100h30l-4 14H40z" fill="${p.b}" stroke="${INK}" stroke-width=".8"/>
      <path d="M42 98l2-26c1-6 4-9 8-9s7 3 8 9l2 26z" fill="${p.a}" stroke="${INK}" stroke-width="1"/>
      <path d="M46 98l-3 20h6l2-20z" fill="${p.c}" stroke="${INK}" stroke-width=".8"/>
      <path d="M43 118h7" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M59 72c5 2 9 0 12-4l3 3c-3 6-9 8-15 7z" fill="${p.b}" stroke="${INK}" stroke-width=".8"/>
      <circle cx="74" cy="68" r="3" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/>
      ${face(52, 54, false)}
      <path d="M41 49c2-8 7-12 12-12s9 4 11 11c-4-2-7-3-11-3-5 0-8 2-12 4z" fill="${p.c}" stroke="${INK}" stroke-width=".8"/>
      <path d="M41 49h23" stroke="${INK}" stroke-width=".8"/>
      ${heldItem(s, 77, LONG[s] ? 46 : 56, LONG[s] ? 0.9 : 1)}`;
  }

  function cardSvg(card) {
    let body;
    if (FIG[card.r]) {
      body = card.r === 12 ? rey(card.s) : card.r === 11 ? caballo(card.s) : sota(card.s);
    } else if (LONG[card.s]) {
      body = LONG_LAYOUT[card.r].map(([x, y, l, a]) => long(SYMBOL[card.s], x, y, l, a)).join('');
    } else {
      body = ROUND_LAYOUT[card.r].map(([x, y, sz]) => round(SYMBOL[card.s], x, y, sz)).join('');
    }
    return `<svg class="cardsvg" viewBox="0 0 100 155" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="0" width="100" height="155" fill="#fffdf7"/>
      ${frame(card.s)}${indices(card)}${body}</svg>`;
  }

  function suitIcon(s, size) {
    if (LONG[s]) {
      return `<svg class="suit-ico" viewBox="0 0 24 24" width="${size}" height="${size}">${long(SYMBOL[s], 12, 12, 26, s === 'espadas' ? 0 : 20)}</svg>`;
    }
    return `<svg class="suit-ico" viewBox="0 0 24 24" width="${size}" height="${size}">${SYMBOL[s]}</svg>`;
  }

  const svgCache = {};
  window.Cards = {
    suitIcon,
    SUIT_COLOR,
    face(card, extraClass = '') {
      const el = document.createElement('div');
      el.className = `card face suit-${card.s} ${extraClass}`;
      el.dataset.id = card.id;
      el.innerHTML = svgCache[card.id] || (svgCache[card.id] = cardSvg(card));
      el.title = `${FIG[card.r] || card.r} de ${card.s}`;
      return el;
    },
    back(extraClass = '') {
      const el = document.createElement('div');
      el.className = `card back ${extraClass}`;
      el.innerHTML = '<div class="back-inner"><span>✦</span></div>';
      return el;
    },
    name(card) { return `${FIG[card.r] || card.r} de ${card.s}`; },
  };
})();
