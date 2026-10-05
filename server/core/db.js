// Base SQLite : un seul fichier (data/myjob.db), facile à sauvegarder.
// Le socle crée les tables communes (comptes, sessions, réglages) ; chaque
// module peut ajouter les siennes (voir server/modules/README.md).

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(config.filesDir, { recursive: true, mode: 0o700 });

export const db = new Database(path.join(config.dataDir, 'myjob.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );
`);

export function allUserIds() {
  return db.prepare('SELECT id FROM users').all().map((r) => r.id);
}

// ---------- Collections JSON par compte ----------
// Une collection stocke des objets JSON (avec un champ id) appartenant à un
// compte. Le modèle reste souple : ajouter un champ ne demande pas de migration.

export function collection(table) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ${table}_user ON ${table}(user_id);
  `);
  const all = db.prepare(`SELECT data FROM ${table} WHERE user_id = ? ORDER BY rowid`);
  const get = db.prepare(`SELECT data FROM ${table} WHERE user_id = ? AND id = ?`);
  const owner = db.prepare(`SELECT user_id FROM ${table} WHERE id = ?`);
  const put = db.prepare(`INSERT INTO ${table} (id, user_id, data, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
  const del = db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND id = ?`);
  const clear = db.prepare(`DELETE FROM ${table} WHERE user_id = ?`);
  return {
    all: (uid) => all.all(uid).map((r) => JSON.parse(r.data)),
    get: (uid, id) => { const r = get.get(uid, id); return r ? JSON.parse(r.data) : null; },
    // Refuse d'écraser un enregistrement appartenant à un autre compte.
    put: (uid, obj) => {
      const o = owner.get(obj.id);
      if (o && o.user_id !== uid) throw Object.assign(new Error('Accès refusé'), { status: 403 });
      put.run(obj.id, uid, JSON.stringify(obj));
    },
    delete: (uid, id) => del.run(uid, id).changes > 0,
    clear: (uid) => clear.run(uid),
  };
}

// ---------- Réglages par compte ----------
// Chaque module déclare ses réglages et leurs valeurs par défaut ; les
// réglages « secrets » (mots de passe) ne sont jamais renvoyés au navigateur.

const defaults = {};
const secrets = new Set();

export function declareSettings(values, secretKeys = []) {
  Object.assign(defaults, values);
  secretKeys.forEach((k) => secrets.add(k));
}

export function getSettings(uid, { withSecrets = false } = {}) {
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(uid);
  const s = { ...defaults };
  rows.forEach((r) => { if (r.key in defaults) s[r.key] = JSON.parse(r.value); });
  if (!withSecrets) {
    secrets.forEach((k) => {
      s[`${k}Defini`] = Boolean(s[k]);
      delete s[k];
    });
  }
  return s;
}

export function saveSettings(uid, values) {
  const put = db.prepare(`INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`);
  db.transaction(() => {
    Object.keys(defaults).forEach((k) => {
      if (!(k in values)) return;
      // Un secret vide signifie « ne pas changer ».
      if (secrets.has(k) && !values[k]) return;
      const def = defaults[k];
      let v = values[k];
      if (typeof def === 'number') v = Number(v) || 0;
      else if (typeof def === 'boolean') v = Boolean(v);
      else v = String(v ?? '').slice(0, 20000);
      put.run(uid, k, JSON.stringify(v));
    });
  })();
  return getSettings(uid);
}

// Valeurs internes d'un module (ex. date du dernier rappel), hors réglages.
export function getInternal(uid, key) {
  const r = db.prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?').get(uid, `_${key}`);
  return r ? JSON.parse(r.value) : undefined;
}

export function setInternal(uid, key, value) {
  db.prepare(`INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`).run(uid, `_${key}`, JSON.stringify(value));
}
