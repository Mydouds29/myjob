// Petits utilitaires partagés par les modules.

// Erreur HTTP avec code de statut, renvoyée en JSON par le gestionnaire d'erreurs.
export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// Identifiants générés par le navigateur : lettres et chiffres uniquement.
export function checkId(id) {
  if (!/^[a-z0-9]{6,40}$/i.test(String(id || ''))) throw httpError(400, 'Identifiant invalide');
  return id;
}

export const today = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale
