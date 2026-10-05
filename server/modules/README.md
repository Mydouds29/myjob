# Modules du serveur

Chaque dossier de `server/modules/` est un module chargé automatiquement au démarrage (`server/app.js`). Pour ajouter une fonctionnalité, on crée un dossier avec un `index.js`, sans toucher au reste.

| Module | Rôle |
|---|---|
| `comptes` | connexion, réglages du compte, mot de passe, gestion des comptes |
| `candidatures` | candidatures, statuts, relances, historique |
| `annonces` | remplissage d'une candidature depuis le lien de l'annonce |
| `documents` | CV, lettres, modèles et leurs fichiers |
| `lettres` | génération des lettres Word depuis un modèle |
| `rappels` | e-mail quotidien des relances à faire |
| `sauvegarde` | export et import JSON |

## Contrat d'un module

`index.js` exporte un objet ; tout est facultatif sauf `nom` :

```js
export default {
  nom: 'exemple',
  description: 'Ce que fait le module',
  ordre: 50,            // ordre de chargement (petit = en premier)
  actif: true,          // false pour désactiver le module

  // Réglages du compte gérés par ce module, avec leur valeur par défaut.
  // Ils apparaissent dans GET/PUT /api/reglages.
  reglages: { monReglage: true },
  secrets: [],          // réglages jamais renvoyés au navigateur (mots de passe)

  // Routes réservées aux comptes connectés, montées sous /api.
  // req.user = { id, username, isAdmin }
  routes(router, ctx) {
    router.get('/exemple', (req, res) => res.json({ ok: true }));
  },

  // Routes sans connexion (rarement utile).
  routesPubliques(router, ctx) {},

  // Données ajoutées à GET /api/etat, chargé par l'interface au démarrage.
  etat(uid, ctx) { return { exemples: [] }; },

  // Participation à l'export / import JSON.
  exporter(uid) { return { exemples: [] }; },
  importer(uid, data) {},

  // Lancé une fois au démarrage (tâches planifiées…).
  demarrer(ctx) {},
};
```

`ctx` donne accès au socle : `db` (SQLite), `collection(nom)` (stockage JSON par compte), `getSettings`, `saveSettings`, `getInternal`, `setInternal`, `httpError`, `checkId`, `today`, `auth`, `config` et la liste des `modules`.

Pour stocker des données, le plus simple est une collection :

```js
import { collection } from '../../core/db.js';
const exemples = collection('exemples');   // crée la table si besoin
exemples.put(uid, { id: 'abc123', ... });  // ajoute ou remplace
exemples.all(uid);                          // tous les éléments du compte
```
