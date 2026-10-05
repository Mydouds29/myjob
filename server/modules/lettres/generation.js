// Génération des lettres de motivation au format Word (.docx).
// Deux sortes de modèles :
//  - un modèle texte saisi dans le site, mis en page simplement ;
//  - un modèle Word (.docx) importé : sa mise en page est conservée et les
//    champs {entreprise}, {poste}, {competences}, {date}, {nom}, {ville}
//    sont remplacés.

import fs from 'node:fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { Document, Packer, Paragraph, TextRun } from 'docx';

export function champsLettre(offre, settings) {
  return {
    entreprise: offre.entreprise || '',
    poste: offre.poste || '',
    competences: (offre.motsCles || []).slice(0, 6).join(', '),
    date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    nom: settings.nomComplet || '',
    ville: settings.ville || '',
    lieu: offre.lieu || '',
    contact: offre.contact || '',
    reference: offre.reference || '',
  };
}

export function remplirTexte(texte, champs) {
  return String(texte || '').replace(/\{(\w+)\}/g, (m, k) => (k in champs ? champs[k] : m));
}

export async function docxDepuisTexte(texte) {
  const paragraphs = String(texte).split(/\r?\n/).map((line) => new Paragraph({
    children: [new TextRun({ text: line, font: 'Calibri', size: 22 })],
    spacing: { after: line.trim() ? 120 : 0 },
  }));
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      children: paragraphs,
    }],
  });
  return Packer.toBuffer(doc);
}

export function docxDepuisModeleWord(cheminModele, champs) {
  const zip = new PizZip(fs.readFileSync(cheminModele));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Un champ inconnu reste vide au lieu de provoquer une erreur.
    nullGetter: () => '',
  });
  doc.render(champs);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
