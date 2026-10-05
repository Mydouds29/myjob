// Module Sauvegarde : export et import JSON des données d'un compte
// (candidatures, documents, réglages). Les fichiers importés ne sont pas
// inclus : ils sont sauvegardés avec la base par deploy/backup.sh.

export default {
  nom: 'sauvegarde',
  description: 'Export et import JSON des données du compte',
  ordre: 90,

  routes(router, { modules, getSettings, saveSettings, db, httpError, today }) {
    router.get('/export', (req, res) => {
      const data = { format: 'myjob', version: 2, exporteLe: new Date().toISOString(), settings: getSettings(req.user.id) };
      modules.forEach((m) => Object.assign(data, m.exporter?.(req.user.id)));
      res.setHeader('Content-Disposition', `attachment; filename="myjob-sauvegarde-${today()}.json"`);
      res.json(data);
    });

    // Accepte aussi les sauvegardes de la première version (données du navigateur).
    router.post('/import', (req, res) => {
      const data = req.body;
      if (!data || !Array.isArray(data.offres) || !Array.isArray(data.documents)) {
        throw httpError(400, 'Fichier invalide : ce n\'est pas une sauvegarde MyJob.');
      }
      db.transaction(() => {
        modules.forEach((m) => m.importer?.(req.user.id, data));
        if (data.settings) saveSettings(req.user.id, data.settings);
      })();
      res.json({ ok: true, offres: data.offres.length, documents: data.documents.length });
    });
  },
};
