// Baraja española de 40 cartas
const crypto = require('crypto');

const SUITS = ['oros', 'copas', 'espadas', 'bastos'];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

function makeDeck(excludeRanks = []) {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      if (excludeRanks.includes(r)) continue;
      deck.push({ id: `${s}-${r}`, s, r });
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { SUITS, RANKS, makeDeck, shuffle };
