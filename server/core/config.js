// Configuration lue dans les variables d'environnement (fichier .env chargé
// par systemd en production, voir deploy/myjob.env.example).

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// En développement, charge un éventuel fichier .env à la racine.
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const dataDir = path.resolve(root, env.MYJOB_DATA_DIR || 'data');

export const config = {
  root,
  publicDir: path.join(root, 'public'),
  dataDir,
  filesDir: path.join(dataDir, 'fichiers'),
  host: env.MYJOB_HOST || '127.0.0.1',
  port: Number(env.MYJOB_PORT || 3000),
  // Cookie « Secure » : à activer dès que le site passe par HTTPS (Caddy).
  secureCookie: env.MYJOB_SECURE_COOKIE !== 'false',
  sessionDays: Number(env.MYJOB_SESSION_DAYS || 30),
  maxUploadMb: Number(env.MYJOB_MAX_UPLOAD_MB || 20),
  rappelHeure: Number(env.MYJOB_RAPPEL_HEURE || 8),
  siteUrl: env.MYJOB_URL || '',
};
