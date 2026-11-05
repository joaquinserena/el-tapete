// Dibujo de cartas de baraja española (SVG propio)
(function () {
  const SUIT_SVG = {
    oros: `<circle cx="12" cy="12" r="10" fill="#f3c437" stroke="#a8730c" stroke-width="1.4"/>
           <circle cx="12" cy="12" r="6" fill="none" stroke="#a8730c" stroke-width="1.2"/>
           <circle cx="12" cy="12" r="2.2" fill="#d4462a"/>`,
    copas: `<path d="M4.5 3h15c0 6.5-3.2 9.6-7.5 10C7.7 12.6 4.5 9.5 4.5 3z" fill="#d4462a" stroke="#7d1d0e" stroke-width="1.2"/>
            <path d="M6 5.2h12" stroke="#f3c437" stroke-width="1.4"/>
            <rect x="10.8" y="12.6" width="2.4" height="5.4" fill="#e3a72b" stroke="#8a5a10" stroke-width=".8"/>
            <path d="M6.5 22c0-2.3 2.4-3.6 5.5-3.6s5.5 1.3 5.5 3.6z" fill="#e3a72b" stroke="#8a5a10" stroke-width="1"/>`,
    espadas: `<path d="M12 .8l1.6 2.6V16h-3.2V3.4z" fill="#5b8fd1" stroke="#1f3f6e" stroke-width="1"/>
              <path d="M5.5 15.6h13l-1 2.2h-11z" fill="#e3a72b" stroke="#8a5a10" stroke-width=".9"/>
              <rect x="10.9" y="17.8" width="2.2" height="3.6" fill="#7d4a1a"/>
              <circle cx="12" cy="22.3" r="1.4" fill="#e3a72b" stroke="#8a5a10" stroke-width=".7"/>`,
    bastos: `<path d="M9.2 22.5L9.6 6.2C9.8 2.6 14.2 2.6 14.4 6.2L14.8 22.5c-1.8 1-3.8 1-5.6 0z" fill="#6aa83a" stroke="#2f5d16" stroke-width="1.1"/>
             <path d="M10.4 8.5l-1.6-1M13.6 11.5l1.7-1M10.3 15l-1.6-.8M13.7 18.2l1.6-.9" stroke="#2f5d16" stroke-width="1.2" stroke-linecap="round"/>
             <ellipse cx="12" cy="5" rx="1.3" ry="1.9" fill="#d4462a" opacity=".8"/>`,
  };
  const SUIT_COLOR = { oros: '#b07a0c', copas: '#c0392b', espadas: '#2c5aa0', bastos: '#3d7a1f' };
  const FIG = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' };
  const PIPS = {
    1: [[50, 50]],
    2: [[50, 24], [50, 76]],
    3: [[50, 18], [50, 50], [50, 82]],
    4: [[30, 24], [70, 24], [30, 76], [70, 76]],
    5: [[30, 20], [70, 20], [50, 50], [30, 80], [70, 80]],
    6: [[30, 18], [70, 18], [30, 50], [70, 50], [30, 82], [70, 82]],
    7: [[30, 16], [70, 16], [50, 33], [30, 52], [70, 52], [30, 84], [70, 84]],
  };

  function suitIcon(s, size) {
    return `<svg class="suit-ico" viewBox="0 0 24 24" width="${size}" height="${size}">${SUIT_SVG[s]}</svg>`;
  }

  // Figuras: un personaje sencillo con los colores del palo
  function figureSvg(card) {
    const c = SUIT_COLOR[card.s];
    const head = `<circle cx="30" cy="24" r="8" fill="#f2d2b0" stroke="#5a3a1a" stroke-width="1"/>`;
    let hat = '';
    if (card.r === 12) hat = `<path d="M21 18l3-8 3 5 3-7 3 7 3-5 3 8z" fill="#f3c437" stroke="#8a5a10" stroke-width="1"/>`;
    if (card.r === 11) hat = `<path d="M22 18c0-6 16-6 16 0z" fill="${c}" stroke="#333" stroke-width=".8"/>`;
    if (card.r === 10) hat = `<path d="M22 19c1-7 15-7 16 0l-3-2-5 1-5-1z" fill="${c}" stroke="#333" stroke-width=".8"/>`;
    const body = `<path d="M17 72c0-26 4-38 13-38s13 12 13 38z" fill="${c}" stroke="#333" stroke-width="1"/>
                  <path d="M22 44h16l-2 8H24z" fill="#f3c437" opacity=".9"/>
                  <path d="M30 34v38" stroke="#f3c437" stroke-width="1.5" stroke-dasharray="2 3"/>`;
    const horse = card.r === 11
      ? `<path d="M10 70c2-14 10-20 20-20s16 4 19 0c2 4 0 9-4 11 2 4 3 7 3 9z" fill="#9a6a3a" stroke="#4a2a10" stroke-width="1"/>
         <path d="M44 50c3-4 6-4 8-2-1 3-3 5-6 5z" fill="#9a6a3a" stroke="#4a2a10" stroke-width="1"/>`
      : '';
    const item = `<g transform="translate(36 34) scale(1)">${SUIT_SVG[card.s]}</g>`;
    return `<svg viewBox="0 0 60 80" class="figure" preserveAspectRatio="xMidYMid meet">${horse}${body}${head}${hat}${item}</svg>`;
  }

  function label(r) { return String(r); }

  window.Cards = {
    suitIcon,
    SUIT_COLOR,
    face(card, extraClass = '') {
      const el = document.createElement('div');
      el.className = `card face suit-${card.s} ${extraClass}`;
      el.dataset.id = card.id;
      const color = SUIT_COLOR[card.s];
      let center;
      if (FIG[card.r]) {
        center = `<div class="fig-wrap">${figureSvg(card)}</div>`;
      } else {
        const pips = PIPS[card.r].map(([x, y]) =>
          `<span class="pip" style="left:${x}%;top:${y}%">${suitIcon(card.s, card.r === 1 ? 46 : 18)}</span>`).join('');
        center = `<div class="pips ${card.r === 1 ? 'ace' : ''}">${pips}</div>`;
      }
      el.innerHTML = `
        <div class="frame frame-${card.s}"></div>
        <span class="idx tl" style="color:${color}">${label(card.r)}</span>
        <span class="idx br" style="color:${color}">${label(card.r)}</span>
        ${center}`;
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
