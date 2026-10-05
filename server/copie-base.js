// Copie cohérente de la base SQLite, même pendant que le site tourne.
// Utilisé par deploy/backup.sh :  node server/copie-base.js <fichier-destination>

import Database from 'better-sqlite3';
import path from 'node:path';
import { config } from './core/config.js';

const dest = process.argv[2];
if (!dest) {
  console.error('Usage : node server/copie-base.js <fichier-destination>');
  process.exit(1);
}
const db = new Database(path.join(config.dataDir, 'myjob.db'), { readonly: true, fileMustExist: true });
await db.backup(dest);
db.close();
