// Construction de l'application : socle (sécurité, sessions, fichiers
// statiques) puis chargement automatique des modules de server/modules/.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './core/config.js';
import * as dbCore from './core/db.js';
import * as auth from './core/auth.js';
import * as http from './core/http.js';

const MODULES_DIR = path.join(config.root, 'server', 'modules');

export async function chargerModules() {
  const dirs = fs.readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(MODULES_DIR, d.name, 'index.js')))
    .map((d) => d.name);
  const modules = [];
  for (const dir of dirs) {
    const mod = (await import(pathToFileURL(path.join(MODULES_DIR, dir, 'index.js')).href)).default;
    if (mod.actif === false) continue;
    modules.push({ ordre: 50, ...mod, nom: mod.nom || dir });
  }
  return modules.sort((a, b) => a.ordre - b.ordre);
}

export async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // derrière Caddy

  // En-têtes de sécurité.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });

  // Protection CSRF : une requête qui modifie des données doit venir du site lui-même.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    let host = null;
    try { host = origin ? new URL(origin).host : req.get('host'); } catch { /* origine invalide */ }
    if (host !== req.get('host')) {
      return res.status(403).json({ error: 'Origine refusée' });
    }
    next();
  });

  app.use(express.json({ limit: '5mb' }));

  const modules = await chargerModules();
  const ctx = { ...dbCore, ...http, auth, config, modules };

  modules.forEach((m) => {
    if (m.reglages) dbCore.declareSettings(m.reglages, m.secrets || []);
  });

  // Routes publiques (connexion), puis routes réservées aux comptes connectés.
  const publicRouter = express.Router();
  const privateRouter = express.Router();
  privateRouter.use(auth.requireAuth);
  modules.forEach((m) => {
    m.routesPubliques?.(publicRouter, ctx);
    m.routes?.(privateRouter, ctx);
  });

  // État complet du compte, assemblé à partir de chaque module.
  privateRouter.get('/etat', (req, res) => {
    const etat = { utilisateur: { username: req.user.username, isAdmin: req.user.isAdmin },
      modules: modules.map((m) => m.nom), reglages: dbCore.getSettings(req.user.id) };
    modules.forEach((m) => Object.assign(etat, m.etat?.(req.user.id, ctx)));
    res.json(etat);
  });

  app.use('/api', publicRouter, privateRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Introuvable' }));

  app.use(express.static(config.publicDir, { index: 'index.html', extensions: ['html'] }));

  // Erreurs : message lisible pour l'interface, détails dans le journal.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Erreur interne du serveur' : err.message });
  });

  for (const m of modules) await m.demarrer?.(ctx);
  return app;
}
