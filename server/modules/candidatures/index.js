// Module Candidatures : les offres suivies et leur historique.

import { collection } from '../../core/db.js';

export const offres = collection('offres');

export default {
  nom: 'candidatures',
  description: 'Candidatures, statuts, relances et historique',
  ordre: 10,
  reglages: {
    delaiRelance: 10,
    alerteRelances: true,
  },

  etat: (uid) => ({ offres: offres.all(uid) }),

  routes(router, { checkId, httpError }) {
    router.put('/offres/:id', (req, res) => {
      const o = req.body;
      if (!o || typeof o !== 'object' || !String(o.entreprise || '').trim()) {
        throw httpError(400, 'Le nom de l\'entreprise est obligatoire.');
      }
      o.id = checkId(req.params.id);
      offres.put(req.user.id, o);
      res.json(o);
    });

    router.delete('/offres/:id', (req, res) => {
      offres.delete(req.user.id, checkId(req.params.id));
      res.json({ ok: true });
    });
  },

  exporter: (uid) => ({ offres: offres.all(uid) }),
  importer(uid, data) {
    if (!Array.isArray(data.offres)) return;
    offres.clear(uid);
    data.offres.forEach((o) => { if (o?.id) offres.put(uid, o); });
  },
};
