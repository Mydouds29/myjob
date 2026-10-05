// Module Documents : CV, lettres et modèles de lettre, avec import des
// fichiers (Word, PDF…) stockés sur le serveur dans data/fichiers/<compte>/.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { collection } from '../../core/db.js';
import { config } from '../../core/config.js';

export const documents = collection('documents');

const EXTENSIONS = ['.docx', '.doc', '.odt', '.pdf', '.rtf', '.txt'];

function dossierCompte(uid) {
  const dir = path.join(config.filesDir, String(Number(uid)));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function cheminFichier(uid, doc) {
  if (!doc?.fichier?.stockage) return null;
  // Le nom de stockage est généré par le serveur ; basename évite toute sortie du dossier.
  const p = path.join(dossierCompte(uid), path.basename(doc.fichier.stockage));
  return fs.existsSync(p) ? p : null;
}

function supprimerFichier(uid, doc) {
  const p = cheminFichier(uid, doc);
  if (p) fs.rmSync(p, { force: true });
}

export default {
  nom: 'documents',
  description: 'CV, lettres de motivation et modèles, avec leurs fichiers',
  ordre: 20,

  etat: (uid) => ({ documents: documents.all(uid) }),

  routes(router, { checkId, httpError }) {
    const upload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, dossierCompte(req.user.id)),
        filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
      }),
      limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
      fileFilter: (req, file, cb) => {
        const ok = EXTENSIONS.includes(path.extname(file.originalname).toLowerCase());
        cb(ok ? null : httpError(400, `Format non accepté. Formats possibles : ${EXTENSIONS.join(', ')}`), ok);
      },
    });

    router.put('/documents/:id', (req, res) => {
      const d = req.body;
      if (!d || typeof d !== 'object' || !String(d.nom || '').trim()) throw httpError(400, 'Le nom est obligatoire.');
      d.id = checkId(req.params.id);
      // Les informations du fichier sont gérées uniquement par le serveur.
      const existant = documents.get(req.user.id, d.id);
      d.fichier = existant?.fichier || null;
      documents.put(req.user.id, d);
      res.json(d);
    });

    router.delete('/documents/:id', (req, res) => {
      const id = checkId(req.params.id);
      supprimerFichier(req.user.id, documents.get(req.user.id, id));
      documents.delete(req.user.id, id);
      res.json({ ok: true });
    });

    router.post('/documents/:id/fichier', upload.single('fichier'), (req, res) => {
      const id = checkId(req.params.id);
      const doc = documents.get(req.user.id, id);
      if (!req.file) throw httpError(400, 'Aucun fichier reçu.');
      if (!doc) {
        fs.rmSync(req.file.path, { force: true });
        throw httpError(404, 'Document introuvable.');
      }
      supprimerFichier(req.user.id, doc);
      doc.fichier = {
        nom: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
        taille: req.file.size,
        type: req.file.mimetype,
        stockage: req.file.filename,
        importeLe: new Date().toISOString(),
      };
      documents.put(req.user.id, doc);
      res.json(doc);
    });

    router.get('/documents/:id/fichier', (req, res) => {
      const doc = documents.get(req.user.id, checkId(req.params.id));
      const p = cheminFichier(req.user.id, doc);
      if (!p) throw httpError(404, 'Fichier introuvable.');
      res.download(p, doc.fichier.nom);
    });
  },

  exporter: (uid) => ({ documents: documents.all(uid) }),
  importer(uid, data) {
    if (!Array.isArray(data.documents)) return;
    // Les fichiers déjà importés sont conservés quand le document existe encore.
    const anciens = Object.fromEntries(documents.all(uid).map((d) => [d.id, d]));
    documents.clear(uid);
    data.documents.forEach((d) => {
      if (!d?.id) return;
      d.fichier = anciens[d.id]?.fichier || null;
      documents.put(uid, d);
    });
  },
};
