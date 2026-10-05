// Module Annonces : à partir du lien d'une annonce, récupère l'entreprise,
// le poste, le lieu, le contrat, le salaire et le texte de l'offre.
// Le favori « Envoyer à MyJob » envoie aussi la page que le navigateur
// affiche (utile pour les sites qui bloquent la lecture automatique).

import { telechargerPage } from './telechargement.js';
import { extraireAnnonce, contratDepuisTexte, teletravailDepuisTexte } from './extraction.js';

const TAILLE_MAX_PAGE = 1024 * 1024;

const chaine = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

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

    // Page envoyée par le favori : extrait réduit de la page (données
    // JobPosting, balises meta, texte de l'annonce) et champs lus à l'écran.
    router.post('/annonces/page', (req, res) => {
      const b = req.body || {};
      const url = chaine(b.url, 2000);
      if (!/^https?:\/\//i.test(url)) throw httpError(400, 'Lien de la page invalide.');
      const html = chaine(b.html, TAILLE_MAX_PAGE);
      const a = extraireAnnonce(html, url);

      // Champs lus directement sur la page : ils complètent ou remplacent le
      // repli « titre de la page », mais pas les données JobPosting.
      const champs = b.champs && typeof b.champs === 'object' ? b.champs : {};
      for (const k of ['poste', 'entreprise', 'lieu', 'salaire']) {
        const v = chaine(champs[k], 300).split('\n')[0].trim();
        if (v && (!a[k] || a.methode !== 'jsonld')) a[k] = v;
      }
      // Contrat et télétravail donnés en clair par le site (Indeed : « Temps plein CDI »,
      // « Télétravail partiel ») : ramenés aux choix du formulaire.
      const contrat = contratDepuisTexte(chaine(champs.contrat, 300));
      if (contrat && (!a.contrat || a.methode !== 'jsonld')) a.contrat = contrat;
      const teletravail = teletravailDepuisTexte(chaine(champs.teletravail, 300));
      if (teletravail && (!a.teletravail || a.methode !== 'jsonld')) a.teletravail = teletravail;
      // Texte sélectionné par l'utilisateur : c'est lui qui fait foi.
      const selection = chaine(b.selection, 30000);
      if (selection.length > 40) {
        a.texteOffre = selection;
        a.contrat ||= contratDepuisTexte(selection) || undefined;
        a.teletravail ||= teletravailDepuisTexte(selection) || undefined;
      }
      Object.keys(a).forEach((k) => { if (a[k] === '' || a[k] === undefined) delete a[k]; });
      res.json(a);
    });
  },
};
