// Module France Travail : accès à l'API « Offres d'emploi » de francetravail.io
// avec l'application créée par l'utilisateur (identifiant client et clé secrète,
// page Paramètres ; à défaut MYJOB_FT_CLIENT_ID / MYJOB_FT_CLIENT_SECRET).

import { getSettings } from '../../core/db.js';

const URL_JETON = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const PORTEE = 'api_offresdemploiv2 o2dsoffre';

function identifiants(uid) {
  const r = getSettings(uid, { withSecrets: true });
  return {
    id: r.ftClientId || process.env.MYJOB_FT_CLIENT_ID || '',
    secret: r.ftClientSecret || process.env.MYJOB_FT_CLIENT_SECRET || '',
  };
}

export const franceTravailConfigure = (uid) => {
  const { id, secret } = identifiants(uid);
  return Boolean(id && secret);
};

// Jeton d'accès, gardé en mémoire jusqu'à une minute avant son expiration.
const jetons = new Map();

export async function jetonFranceTravail(uid) {
  const { id, secret } = identifiants(uid);
  if (!id || !secret) throw Object.assign(new Error('Identifiants France Travail non renseignés (Paramètres → Services connectés).'), { status: 400 });
  const cle = `${id}:${secret}`;
  const enCache = jetons.get(uid);
  if (enCache && enCache.cle === cle && enCache.expire > Date.now()) return enCache.jeton;

  let res;
  try {
    res = await fetch(URL_JETON, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: PORTEE }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw Object.assign(new Error('France Travail ne répond pas.'), { status: 502 });
  }
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) {
    const detail = [d.error, d.error_description].filter(Boolean).join(' : ') || `code ${res.status}`;
    throw Object.assign(new Error(`France Travail refuse ces identifiants (${detail}).`), { status: 502 });
  }
  jetons.set(uid, { cle, jeton: d.access_token, expire: Date.now() + (Number(d.expires_in || 600) - 60) * 1000 });
  return d.access_token;
}

export default {
  nom: 'francetravail',
  description: 'Accès à l\'API Offres d\'emploi de France Travail',
  ordre: 25,
  reglages: { ftClientId: '', ftClientSecret: '' },
  secrets: ['ftClientSecret'],

  etat: (uid) => ({ franceTravailConfigure: franceTravailConfigure(uid) }),

  routes(router) {
    router.post('/francetravail/test', async (req, res) => {
      jetons.delete(req.user.id);
      await jetonFranceTravail(req.user.id);
      res.json({ ok: true });
    });
  },
};
