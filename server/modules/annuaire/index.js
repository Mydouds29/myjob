// Module Annuaire : entreprises à démarcher autour de chez soi (candidatures
// spontanées). Remplissage depuis l'annuaire officiel des entreprises
// (recherche.js) ou à la main, puis suivi des contacts.

import { collection, getSettings } from '../../core/db.js';
import { chercher, chercherParNom, trouverVille } from './recherche.js';

export const annuaire = collection('annuaire');

export const STATUTS_ANNUAIRE = ['a_etudier', 'a_contacter', 'contacte', 'pas_interesse', 'ecarte'];

const enCours = new Set(); // une recherche à la fois par compte

export default {
  nom: 'annuaire',
  description: 'Annuaire des entreprises à démarcher',
  ordre: 15,
  reglages: { annuaireVille: '', annuaireRayon: 20 },

  etat: (uid) => ({ annuaire: annuaire.all(uid) }),

  routes(router, { checkId, httpError }) {
    router.post('/annuaire/recherche', async (req, res) => {
      const uid = req.user.id;
      const idCible = String(req.body?.cible || '');
      if (!['informatique', 'grands'].includes(idCible)) throw httpError(400, 'Recherche inconnue.');
      if (enCours.has(uid)) throw httpError(409, 'Une recherche est déjà en cours.');
      enCours.add(uid);
      try {
        const r = getSettings(uid);
        const rayon = Math.min(Math.max(Number(r.annuaireRayon) || 20, 1), 100);
        const ville = await trouverVille(r.annuaireVille || r.ville);
        const trouvees = await chercher(idCible, ville, rayon);
        let ajoutees = 0;
        const date = new Date().toLocaleDateString('sv-SE');
        for (const f of trouvees) {
          const existante = annuaire.get(uid, f.id);
          if (existante) {
            // Mise à jour des données officielles, sans toucher au suivi.
            annuaire.put(uid, { ...existante, ...f, cible: existante.cible });
          } else {
            annuaire.put(uid, { ...f, statut: 'a_etudier', source: 'annuaire', ajoutee: date, historique: [] });
            ajoutees += 1;
          }
        }
        res.json({ ville: ville.nom, rayon, trouvees: trouvees.length, ajoutees, annuaire: annuaire.all(uid) });
      } finally {
        enCours.delete(uid);
      }
    });

    router.get('/annuaire/officiel', async (req, res) => {
      const q = String(req.query.q || '').trim().slice(0, 100);
      if (q.length < 2) throw httpError(400, 'Tapez au moins deux lettres du nom.');
      const r = getSettings(req.user.id);
      const ville = await trouverVille(r.annuaireVille || r.ville);
      res.json(await chercherParNom(q, ville));
    });

    router.put('/annuaire/:id', (req, res) => {
      const e = req.body;
      if (!e || typeof e !== 'object' || !String(e.nom || '').trim()) {
        throw httpError(400, 'Le nom de l\'entreprise est obligatoire.');
      }
      if (!STATUTS_ANNUAIRE.includes(e.statut)) e.statut = 'a_etudier';
      e.id = checkId(req.params.id);
      annuaire.put(req.user.id, e);
      res.json(e);
    });

    router.delete('/annuaire/:id', (req, res) => {
      annuaire.delete(req.user.id, checkId(req.params.id));
      res.json({ ok: true });
    });
  },

  exporter: (uid) => ({ annuaire: annuaire.all(uid) }),
  importer(uid, data) {
    if (!Array.isArray(data.annuaire)) return;
    annuaire.clear(uid);
    data.annuaire.forEach((e) => { if (e?.id) annuaire.put(uid, e); });
  },
};
