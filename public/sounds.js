// Música y sonidos generados en el navegador (sin archivos de audio).
// Música: guitarra punteada (síntesis Karplus-Strong) sobre la cadencia andaluza Lam-Sol-Fa-Mi,
// composición propia con variaciones aleatorias para que no se haga repetitiva.
(function () {
  const PREF_KEY = 'tapete.sound';
  let prefs = { music: true, sfx: true };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { /* nada */ }
  const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));

  let ctx = null;
  let master;
  let musicBus;
  let sfxBus;
  const pluckCache = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    // Un poco de "sala" con un eco suave
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(master);
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = prefs.music ? 0.16 : 0;
    musicBus.connect(master);
    musicBus.connect(delay);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = prefs.sfx ? 0.55 : 0;
    sfxBus.connect(master);
    return ctx;
  }

  // Cuerda punteada (Karplus-Strong), precalculada y cacheada
  function pluckBuffer(freq, dur = 2.2, bright = 0.55) {
    const key = `${freq.toFixed(2)}-${bright}`;
    if (pluckCache[key]) return pluckCache[key];
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(N);
    let last = 0;
    for (let i = 0; i < N; i++) {
      const w = Math.random() * 2 - 1;
      last = bright * w + (1 - bright) * last; // ataque más o menos brillante
      ring[i] = last;
    }
    let p = 0;
    for (let i = 0; i < len; i++) {
      const nxt = (p + 1) % N;
      const v = ring[p];
      d[i] = v;
      ring[p] = 0.4985 * (v + ring[nxt]);
      p = nxt;
    }
    pluckCache[key] = buf;
    return buf;
  }

  function playPluck(freq, when, gain, bus, bright) {
    const src = ctx.createBufferSource();
    src.buffer = pluckBuffer(freq, 2.2, bright);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(bus);
    src.start(when);
  }

  function tone(freq, when, dur, gain, type = 'sine', bus = sfxBus, slideTo = null) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(bus);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  let noiseBuf = null;
  function noise(when, dur, gain, freq, q = 1.2) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(when, Math.random() * 0.3, dur + 0.05);
  }

  const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // nota MIDI -> Hz

  // ---------- efectos ----------
  const SFX = {
    click(t) { tone(1500, t, 0.05, 0.12, 'triangle'); noise(t, 0.03, 0.15, 3000, 2); },
    card(t) { noise(t, 0.09, 0.5, 2200, 0.8); tone(220, t, 0.06, 0.06, 'triangle'); },
    king(t) { SFX.card(t); [72, 76, 79].forEach((n, i) => tone(N(n), t + 0.08 + i * 0.07, 0.35, 0.12, 'triangle')); },
    chip(t) { tone(2100, t, 0.08, 0.14); tone(2600, t + 0.06, 0.1, 0.12); },
    turn(t) { tone(N(76), t, 0.25, 0.14, 'triangle'); tone(N(81), t + 0.12, 0.35, 0.14, 'triangle'); },
    tick(t) { tone(900, t, 0.05, 0.2, 'square'); },
    ordago(t) {
      // Rasgueo fuerte en Mi frigio
      [40, 47, 52, 56, 59, 64].forEach((n, i) => playPluck(N(n), t + i * 0.018, 0.5, sfxBus, 0.9));
      [40, 47, 52, 55, 59, 64].forEach((n, i) => playPluck(N(n + 1), t + 0.35 + i * 0.018, 0.45, sfxBus, 0.9));
    },
    win(t) { [60, 64, 67, 72, 76].forEach((n, i) => playPluck(N(n), t + i * 0.09, 0.5, sfxBus, 0.7)); },
    lose(t) { [64, 62, 60, 59].forEach((n, i) => playPluck(N(n - 12), t + i * 0.16, 0.45, sfxBus, 0.5)); },
  };

  // ---------- música ----------
  // Cadencia andaluza: Lam - Sol - Fa - Mi (dos compases de 3/4 por acorde)
  const CHORDS = [
    { bass: 45, tones: [52, 57, 60, 64] }, // La menor
    { bass: 43, tones: [50, 55, 59, 62] }, // Sol
    { bass: 41, tones: [48, 53, 57, 60] }, // Fa
    { bass: 40, tones: [47, 52, 56, 59] }, // Mi (con sol sostenido)
  ];
  const PATTERNS = [
    [0, 1, 2, 3, 2, 1],
    [0, 2, 1, 3, 1, 2],
    [0, 1, 3, 2, 3, 1],
  ];
  const STEP = 0.24; // corcheas
  let musicOn = false;
  let nextTime = 0;
  let stepIdx = 0;
  let schedTimer = null;
  let pattern = PATTERNS[0];
  let melody = null;

  function scheduleMusic() {
    while (nextTime < ctx.currentTime + 0.4) {
      const chordIdx = Math.floor(stepIdx / 12) % 4;
      const inChord = stepIdx % 12;
      const ch = CHORDS[chordIdx];
      if (stepIdx % 48 === 0) {
        pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
        melody = Math.random() < 0.6 ? [76, 74, 72, 71].map((n) => n + (Math.random() < 0.3 ? -12 : 0)) : null;
      }
      const human = (Math.random() - 0.5) * 0.012;
      if (inChord === 0) {
        playPluck(N(ch.bass - 12 + 12), nextTime + human, 0.55, musicBus, 0.35);
        if (Math.random() < 0.35) {
          // Pequeño rasgueo al cambiar de acorde
          ch.tones.forEach((n, i) => playPluck(N(n), nextTime + 0.01 + i * 0.022, 0.18, musicBus, 0.5));
        }
      }
      const tIdx = pattern[inChord % 6];
      playPluck(N(ch.tones[tIdx]), nextTime + human, inChord % 6 === 0 ? 0.32 : 0.24, musicBus, 0.45);
      if (melody && inChord === 6) playPluck(N(melody[chordIdx]), nextTime + human, 0.3, musicBus, 0.6);
      nextTime += STEP;
      stepIdx++;
    }
  }

  function startMusic() {
    if (!ensure() || musicOn) return;
    musicOn = true;
    nextTime = ctx.currentTime + 0.1;
    stepIdx = 0;
    schedTimer = setInterval(scheduleMusic, 100);
  }
  function stopMusic() {
    musicOn = false;
    clearInterval(schedTimer);
  }

  window.Sound = {
    prefs,
    // Los navegadores solo dejan sonar audio después de un toque del usuario
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (prefs.music) startMusic();
    },
    play(name) {
      if (!prefs.sfx || !ctx || ctx.state !== 'running' || !SFX[name]) return;
      SFX[name](ctx.currentTime + 0.01);
    },
    deal(count, staggerMs) {
      if (!prefs.sfx || !ctx || ctx.state !== 'running') return;
      for (let i = 0; i < count; i++) noise(ctx.currentTime + 0.02 + (i * staggerMs) / 1000, 0.06, 0.32, 2400, 0.9);
    },
    setMusic(on) {
      prefs.music = on;
      savePrefs();
      if (!ensure()) return;
      musicBus.gain.setTargetAtTime(on ? 0.16 : 0, ctx.currentTime, 0.2);
      if (on) { if (ctx.state === 'suspended') ctx.resume(); startMusic(); } else setTimeout(() => { if (!prefs.music) stopMusic(); }, 600);
    },
    setSfx(on) {
      prefs.sfx = on;
      savePrefs();
      if (ensure()) sfxBus.gain.value = on ? 0.55 : 0;
    },
  };
})();
