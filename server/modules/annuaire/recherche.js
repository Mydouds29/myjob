// Recherche d'entreprises autour d'une ville dans l'annuaire officiel des
// entreprises (API Recherche d'entreprises de l'État, ouverte et sans clé :
// https://recherche-entreprises.api.gouv.fr/docs/) et position de la ville par
// l'API Découpage administratif (https://geo.api.gouv.fr).

import fs from 'node:fs';

const API = 'https://recherche-entreprises.api.gouv.fr/search';
const GEO = 'https://geo.api.gouv.fr/communes';
const AGENT = 'MyJob (suivi personnel de recherche d\'emploi)';

// Libellés officiels, repris du dépôt de l'API (app/labels).
export const NAF = JSON.parse(fs.readFileSync(new URL('./naf.json', import.meta.url), 'utf8'));
export const TRANCHES = {
  NN: 'Pas de salarié déclaré', '00': 'Pas de salarié au 31/12', '01': '1 ou 2 salariés', '02': '3 à 5 salariés',
  '03': '6 à 9 salariés', 11: '10 à 19 salariés', 12: '20 à 49 salariés', 21: '50 à 99 salariés',
  22: '100 à 199 salariés', 31: '200 à 249 salariés', 32: '250 à 499 salariés', 41: '500 à 999 salariés',
  42: '1 000 à 1 999 salariés', 51: '2 000 à 4 999 salariés', 52: '5 000 à 9 999 salariés',
  53: '10 000 salariés et plus',
};
const ORDRE_TRANCHES = Object.keys(TRANCHES).sort((a, b) => (a === 'NN' ? -1 : b === 'NN' ? 1 : a.localeCompare(b)));
const auMoins = (min) => ORDRE_TRANCHES.slice(ORDRE_TRANCHES.indexOf(min));

// Ce que l'on cherche. « avecSalaries » : tranches acceptées pour l'entreprise
// (filtre de l'API) ; « surPlace » : tranches acceptées pour l'établissement local ;
// « exclure » : débuts de codes d'activité de l'établissement à ignorer.
export const CIBLES = {
  informatique: {
    libelle: 'Entreprises d\'informatique',
    activites: ['62.01Z', '62.02A', '62.02B', '62.03Z', '62.09Z', '63.11Z', '58.29C',
      '95.11Z', '46.51Z', '47.41Z', '61.10Z', '61.20Z', '61.90Z'],
    avecSalaries: auMoins('01'),
    surPlace: auMoins('01'),
  },
  grands: {
    libelle: 'Grands employeurs (service informatique interne probable)',
    activites: [],
    avecSalaries: auMoins('22'),
    surPlace: auMoins('22'),
    // Secteurs presque jamais dotés d'une équipe informatique sur place :
    // super/hypermarchés, restauration, sécurité privée, nettoyage, EHPAD et
    // hébergement médico-social, aide à domicile et ESAT, crèches, blanchisseries.
    exclure: ['47.1', '56.', '80.1', '81.2', '87.', '88.1', '88.91', '96.01'],
  },
  // Recherche par nom (ajout à la main) : toutes tailles.
  manuel: {
    libelle: 'Recherche par nom',
    activites: [],
    avecSalaries: [],
    surPlace: ORDRE_TRANCHES,
  },
};

const pause = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function lire(url) {
  for (let essai = 0; essai < 5; essai++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(20000) });
    } catch {
      throw Object.assign(new Error('L\'annuaire des entreprises ne répond pas.'), { status: 502 });
    }
    if (res.status === 429) { // trop de requêtes : on attend le délai demandé
      await pause(Math.min(Number(res.headers.get('retry-after')) || 2, 30) * 1000);
      continue;
    }
    if (!res.ok) throw Object.assign(new Error(`L'annuaire des entreprises répond « erreur ${res.status} ».`), { status: 502 });
    return res.json();
  }
  throw Object.assign(new Error('L\'annuaire des entreprises est surchargé, réessayez dans quelques minutes.'), { status: 502 });
}

// Commune la plus peuplée portant ce nom (ou ce code postal).
export async function trouverVille(nom) {
  const q = String(nom || '').trim();
  if (!q) throw Object.assign(new Error('Indiquez votre ville.'), { status: 400 });
  const champ = /^\d{5}$/.test(q) ? 'codePostal' : 'nom';
  const liste = await lire(`${GEO}?${champ}=${encodeURIComponent(q)}&fields=nom,centre,departement,population&limit=5`);
  const c = [...(liste || [])].sort((a, b) => (b.population || 0) - (a.population || 0))[0];
  if (!c?.centre) throw Object.assign(new Error(`Ville « ${q} » introuvable.`), { status: 400 });
  const [lon, lat] = c.centre.coordinates;
  return { nom: c.nom, departement: c.departement.code, lat, lon };
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// « SAGE (SAGE) (SAGE) » → « SAGE » : retire les sigles qui répètent le nom.
export function nomCourt(nom) {
  const cle = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const base = String(nom || '').replace(/\s*\([^()]*\)/g, '').trim();
  const vus = new Set([cle(base)]);
  const sigles = [...String(nom || '').matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim())
    .filter((x) => x && !vus.has(cle(x)) && vus.add(cle(x)));
  return [base, ...sigles.map((x) => `(${x})`)].join(' ');
}

const titre = (s) => String(s || '').toLowerCase().replace(/(^|[\s'’(-])\p{L}/gu, (m) => m.toUpperCase());

// Transforme une réponse de l'API en fiches d'établissements proches.
export function etablissementsProches(resultats, ville, rayon, cible, idCible) {
  const fiches = [];
  for (const u of resultats || []) {
    for (const e of u.matching_etablissements || []) {
      if (e.etat_administratif !== 'A' || !cible.surPlace.includes(e.tranche_effectif_salarie || 'NN')) continue;
      const activite = e.activite_principale || u.activite_principale;
      if ((cible.exclure || []).some((x) => String(activite).startsWith(x))) continue;
      const lat = Number(e.latitude);
      const lon = Number(e.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const distance = distanceKm(ville.lat, ville.lon, lat, lon);
      if (distance > rayon) continue;
      const nom = nomCourt(u.nom_complet);
      const enseigne = [...(e.liste_enseignes || []), e.nom_commercial].filter(Boolean)
        .find((x) => !nom.toLowerCase().includes(String(x).toLowerCase())) || '';
      fiches.push({
        id: e.siret,
        siret: e.siret,
        siren: u.siren,
        nom,
        enseigne,
        activite,
        activiteLibelle: NAF[activite] || '',
        adresse: e.adresse || '',
        commune: titre(e.libelle_commune),
        distance: Math.round(distance * 10) / 10,
        effectif: e.tranche_effectif_salarie,
        effectifLibelle: TRANCHES[e.tranche_effectif_salarie] || 'Effectif inconnu',
        cible: idCible,
      });
    }
  }
  return fiches;
}

// Parcourt toutes les pages de résultats (au plus 4 requêtes par seconde,
// l'API en accepte 7) et renvoie les établissements à moins de « rayon » km.
export async function chercher(idCible, ville, rayon) {
  const cible = CIBLES[idCible];
  if (!cible) throw Object.assign(new Error('Recherche inconnue.'), { status: 400 });
  const params = new URLSearchParams({
    departement: ville.departement,
    etat_administratif: 'A',
    per_page: '25',
    limite_matching_etablissements: '100',
  });
  if (cible.avecSalaries.length) params.set('tranche_effectif_salarie', cible.avecSalaries.join(','));
  if (cible.activites.length) params.set('activite_principale', cible.activites.join(','));

  const fiches = new Map();
  let page = 1;
  let pages = 1;
  while (page <= pages && page <= 200) {
    const d = await lire(`${API}?${params}&page=${page}`);
    pages = d.total_pages || 0;
    etablissementsProches(d.results, ville, rayon, cible, idCible).forEach((f) => fiches.set(f.id, f));
    page += 1;
    if (page <= pages) await pause(250);
  }
  return [...fiches.values()];
}

// Établissements d'une entreprise cherchée par son nom, dans le département de
// la ville (et à moins de 100 km), pour l'ajouter à la main.
export async function chercherParNom(q, ville) {
  const params = new URLSearchParams({
    q, departement: ville.departement, etat_administratif: 'A', per_page: '10', limite_matching_etablissements: '10',
  });
  const d = await lire(`${API}?${params}`);
  return etablissementsProches(d.results, ville, 100, CIBLES.manuel, 'manuel').slice(0, 30);
}
