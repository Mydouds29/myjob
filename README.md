# MyJob

Site personnel pour suivre ses candidatures à des offres d'emploi, avec les CV et lettres de motivation utilisés. Hébergé chez soi (conteneur LXC Proxmox), accessible depuis l'ordinateur et le smartphone, protégé par identifiant et mot de passe.

## Fonctionnalités

- **Candidatures** : réponse à une offre ou candidature spontanée ; entreprise, poste, lieu, lien et référence de l'annonce, source, contact, contrat, télétravail, salaire, notes.
- **Remplissage depuis le lien** : on colle le lien de l'annonce, le site remplit l'entreprise, le poste, le lieu, le contrat, le télétravail, le salaire, la référence et le texte (données « JobPosting » publiées par la plupart des sites d'emploi ; certains sites comme Indeed bloquent la lecture automatique).
- **Texte de l'offre et mots-clés** : on colle l'annonce, l'analyse repère les compétences techniques IT, les qualités attendues et les mots les plus répétés, et indique celles de votre profil (✓). Le bouton « Préparer pour Claude » copie une demande prête à coller dans Claude (analyse + brouillon de lettre).
- **Lettres Word** : modèles de lettre (texte saisi dans le site, ou fichier Word importé dont la mise en page est conservée) avec `{entreprise}`, `{poste}`, `{competences}`, `{date}`, `{nom}`, `{ville}` remplis automatiquement ; téléchargement en `.docx`.
- **CV & lettres** : import des fichiers (Word, PDF, LibreOffice), associés à chaque candidature.
- **Suivi** : statuts, historique daté des échanges, date de relance proposée (délai réglable), bandeau et e-mail quotidien des relances à faire, taux de réponse.
- **Entreprises** : toutes les entreprises contactées avec la date du dernier échange.
- Recherche sur tous les champs (touche `/`), thème clair / sombre, affichage adapté au smartphone.
- **Comptes** : plusieurs comptes possibles, chacun avec ses données et ses réglages (e-mails, Gmail, profil).
- **Sauvegarde** : export / import JSON, sauvegarde nocturne de la base et des fichiers, envoyée sur Google Drive.

## Installation

Voir [docs/INSTALLATION.md](docs/INSTALLATION.md) (Debian 13, sans Docker, Caddy pour le HTTPS).

## Développement

```bash
npm install
npm run user -- create moi --admin     # crée un compte (demande le mot de passe)
MYJOB_SECURE_COOKIE=false npm start     # http://127.0.0.1:3000
```

## Structure

```
server/
  index.js          démarrage
  app.js            socle : sécurité, sessions, chargement des modules
  core/             configuration, base SQLite, comptes et sessions
  modules/          une fonctionnalité par dossier (voir server/modules/README.md)
  cli.js            gestion des comptes en ligne de commande
public/             interface (HTML, CSS, JavaScript sans framework)
deploy/             installation, service systemd, Caddy, sauvegarde
docs/               documentation
```
