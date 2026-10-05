// Module Lettres : génère une lettre de motivation Word (.docx) pour une
// candidature, à partir d'un modèle texte ou d'un modèle Word importé.

import { offres } from '../candidatures/index.js';
import { documents, cheminFichier } from '../documents/index.js';
import { champsLettre, remplirTexte, docxDepuisTexte, docxDepuisModeleWord } from './generation.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function nomFichier(offre) {
  const base = `Lettre ${offre.entreprise || ''} ${offre.poste || ''}`.trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w -]+/g, '').replace(/\s+/g, '_');
  return `${base || 'Lettre'}.docx`;
}

export default {
  nom: 'lettres',
  description: 'Lettres de motivation Word générées depuis un modèle',
  ordre: 30,

  routes(router, { checkId, httpError, getSettings }) {
    // Aperçu texte (modèle texte uniquement), pour relire ou copier.
    router.post('/offres/:id/lettre/apercu', (req, res) => {
      const offre = offres.get(req.user.id, checkId(req.params.id));
      const modele = documents.get(req.user.id, checkId(req.body?.modeleId));
      if (!offre || !modele) throw httpError(404, 'Candidature ou modèle introuvable.');
      const champs = champsLettre(offre, getSettings(req.user.id));
      res.json({ texte: remplirTexte(req.body.texte ?? modele.contenu, champs), modeleWord: Boolean(cheminFichier(req.user.id, modele)) });
    });

    // Lettre Word. Si le modèle a un fichier .docx, sa mise en page est conservée.
    router.post('/offres/:id/lettre.docx', async (req, res) => {
      const uid = req.user.id;
      const offre = offres.get(uid, checkId(req.params.id));
      const modele = documents.get(uid, checkId(req.body?.modeleId));
      if (!offre || !modele) throw httpError(404, 'Candidature ou modèle introuvable.');
      const champs = champsLettre(offre, getSettings(uid));
      const fichier = cheminFichier(uid, modele);

      let buffer;
      if (fichier && fichier.endsWith('.docx')) {
        try {
          buffer = docxDepuisModeleWord(fichier, champs);
        } catch (err) {
          throw httpError(400, `Le modèle Word n'a pas pu être rempli : vérifiez l'écriture des champs comme {entreprise}. (${err.message})`);
        }
      } else {
        // Texte éventuellement retouché dans l'aperçu.
        buffer = await docxDepuisTexte(req.body.texte ?? remplirTexte(modele.contenu, champs));
      }
      res.setHeader('Content-Type', DOCX);
      res.setHeader('Content-Disposition', `attachment; filename="${nomFichier(offre)}"`);
      res.send(buffer);
    });

    // Lettre rédigée (par Claude, puis relue) : mise en page simple, ou modèle
    // Word dont le champ {corps} reçoit le texte.
    router.post('/lettre-texte.docx', async (req, res) => {
      const uid = req.user.id;
      const b = req.body || {};
      const texte = String(b.texte || '').trim();
      if (!texte) throw httpError(400, 'La lettre est vide.');
      const offre = {};
      for (const k of ['entreprise', 'poste', 'lieu', 'contact', 'reference']) offre[k] = String(b[k] || '').slice(0, 300);
      let buffer;
      if (b.modeleId) {
        const modele = documents.get(uid, checkId(b.modeleId));
        const fichier = modele && cheminFichier(uid, modele);
        if (!fichier || !fichier.endsWith('.docx')) throw httpError(400, 'Ce modèle n\'est pas un fichier Word.');
        try {
          buffer = docxDepuisModeleWord(fichier, { ...champsLettre(offre, getSettings(uid)), corps: texte });
        } catch (err) {
          throw httpError(400, `Le modèle Word n'a pas pu être rempli (${err.message}).`);
        }
      } else {
        buffer = await docxDepuisTexte(texte);
      }
      res.setHeader('Content-Type', DOCX);
      res.setHeader('Content-Disposition', `attachment; filename="${nomFichier(offre)}"`);
      res.send(buffer);
    });
  },
};
