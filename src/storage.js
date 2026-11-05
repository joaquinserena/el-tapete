// Guardado de perfiles y estadísticas.
// - Sin DATABASE_URL: archivo data/db.json (ideal si el servidor corre en tu ordenador).
// - Con DATABASE_URL (Postgres gratis, p.ej. Neon): todo el documento se guarda en una fila.
const fs = require('fs');
const path = require('path');

const EMPTY = () => ({ profiles: {}, matches: [] });

function emptyStats() {
  return {
    mus: {
      partidas: 0, victorias: 0, juegosGanados: 0, juegosPerdidos: 0, manos: 0,
      ordagos: 0, ordagosGanados: 0, treintaYUna: 0, duples: 0, medias: 0, piedras: 0,
      companeros: {}, rivales: {},
    },
    pocha: {
      partidas: 0, victorias: 0, manos: 0, aciertos: 0, fallos: 0, bazas: 0,
      puntosTotales: 0, mejorPuntuacion: null, peorPuntuacion: null, mejorRacha: 0, rivales: {},
      subastas: 0, subastasCumplidas: 0,
    },
  };
}

class Storage {
  constructor() {
    this.db = EMPTY();
    this.file = path.join(__dirname, '..', 'data', 'db.json');
    this.pg = null;
    this.saveTimer = null;
  }

  async init() {
    if (process.env.DATABASE_URL) {
      const { Pool } = require('pg');
      this.pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      await this.pg.query('CREATE TABLE IF NOT EXISTS tapete_store (id INT PRIMARY KEY, doc JSONB NOT NULL)');
      const r = await this.pg.query('SELECT doc FROM tapete_store WHERE id = 1');
      if (r.rows.length) this.db = r.rows[0].doc;
      console.log('Estadísticas: base de datos Postgres');
    } else {
      try {
        this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      } catch {
        this.db = EMPTY();
      }
      console.log('Estadísticas: archivo', this.file);
    }
    this.db.profiles ||= {};
    this.db.matches ||= [];
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush().catch((e) => console.error('Error guardando:', e)), 300);
  }

  async flush() {
    const json = JSON.stringify(this.db);
    if (this.pg) {
      await this.pg.query(
        'INSERT INTO tapete_store (id, doc) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc',
        [json],
      );
    } else {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, this.file);
    }
  }

  static key(name) { return name.trim().toLowerCase(); }

  upsertProfile(name, avatar) {
    const k = Storage.key(name);
    let p = this.db.profiles[k];
    if (!p) {
      p = { name: name.trim(), avatar, created: Date.now(), stats: emptyStats() };
      this.db.profiles[k] = p;
    }
    if (avatar) p.avatar = avatar;
    p.lastSeen = Date.now();
    // Por si se añaden campos nuevos en versiones futuras
    const base = emptyStats();
    for (const g of Object.keys(base)) p.stats[g] = { ...base[g], ...(p.stats[g] || {}) };
    this.save();
    return p;
  }

  getProfile(name) { return this.db.profiles[Storage.key(name)] || null; }

  recordMatch(match) {
    this.db.matches.unshift(match);
    if (this.db.matches.length > 300) this.db.matches.length = 300;
    this.save();
  }

  publicData() {
    return {
      profiles: Object.values(this.db.profiles).map((p) => ({ name: p.name, avatar: p.avatar, stats: p.stats })),
      matches: this.db.matches.slice(0, 50),
    };
  }
}

module.exports = { Storage };
