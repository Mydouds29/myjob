// Comptes et sessions : mots de passe hachés avec scrypt (inclus dans Node),
// session dans un cookie HttpOnly dont le jeton est stocké en base.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';

const COOKIE = 'myjob_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function checkPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Le mot de passe doit contenir au moins 10 caractères.';
  }
  return null;
}

// ---------- Comptes ----------

export function createUser(username, password, isAdmin = false) {
  username = String(username || '').trim();
  if (!/^[\w.@-]{3,40}$/.test(username)) {
    throw Object.assign(new Error('Identifiant invalide (3 à 40 caractères : lettres, chiffres, . _ - @).'), { status: 400 });
  }
  const weak = checkPasswordStrength(password);
  if (weak) throw Object.assign(new Error(weak), { status: 400 });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    throw Object.assign(new Error('Cet identifiant existe déjà.'), { status: 409 });
  }
  const info = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(username, hashPassword(password), isAdmin ? 1 : 0);
  return info.lastInsertRowid;
}

export function setPassword(userId, password) {
  const weak = checkPasswordStrength(password);
  if (weak) throw Object.assign(new Error(weak), { status: 400 });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
  // Déconnecte les autres sessions.
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function findUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
}

export function deleteUser(userId) {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  fs.rmSync(path.join(config.filesDir, String(Number(userId))), { recursive: true, force: true });
}

export function listUsers() {
  return db.prepare('SELECT id, username, is_admin AS isAdmin, created_at AS createdAt FROM users ORDER BY id').all()
    .map((u) => ({ ...u, isAdmin: Boolean(u.isAdmin) }));
}

export function userCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

// ---------- Sessions ----------

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setCookie(res, value, maxAgeSec) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (config.secureCookie) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = config.sessionDays * 86400;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, Date.now() + maxAge * 1000);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  setCookie(res, token, maxAge);
}

export function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  setCookie(res, '', 0);
}

export function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.username, u.is_admin AS isAdmin FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now()) || null;
}

// Middleware : refuse l'accès à l'API sans session valide.
export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Non connecté' });
  req.user = { ...user, isAdmin: Boolean(user.isAdmin) };
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Réservé à l\'administrateur' });
  next();
}

// ---------- Limitation des tentatives de connexion ----------

const attempts = new Map(); // ip -> { n, until }

export function loginAllowed(ip) {
  const a = attempts.get(ip);
  return !a || a.until < Date.now() || a.n < 5;
}

export function loginFailed(ip) {
  const a = attempts.get(ip);
  if (!a || a.until < Date.now()) attempts.set(ip, { n: 1, until: Date.now() + 15 * 60 * 1000 });
  else a.n += 1;
}

export function loginSucceeded(ip) {
  attempts.delete(ip);
}
