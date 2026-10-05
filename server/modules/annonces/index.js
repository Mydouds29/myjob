// Module Annonces : à partir du lien d'une annonce, récupère l'entreprise,
// le poste, le lieu, le contrat, le salaire et le texte de l'offre.

import { telechargerPage } from './telechargement.js';
import { extraireAnnonce } from './extraction.js';

export default {
  nom: 'annonces',
  description: 'Remplissage d\'une candidature depuis le lien de l\'annonce',
  ordre: 15,

  routes(router, { httpError }) {
    router.post('/annonces/lire', async (req, res) => {
      const url = String(req.body?.url || '').trim();
      if (!url) throw httpError(400, 'Indiquez le lien de l\'annonce.');
      // Variable réservée aux tests automatiques (pages servies en local).
      const autoriserLocal = process.env.MYJOB_ANNONCES_LOCAL === '1';
      const page = await telechargerPage(url, { autoriserLocal });
      const annonce = extraireAnnonce(page.html, page.url);
      if (!annonce.poste && !annonce.texteOffre) {
        throw httpError(422, 'Aucune information trouvée sur cette page. Copiez-collez le texte de l\'annonce.');
      }
      res.json(annonce);
    });
  },
};
