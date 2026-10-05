# MyJob

Site personnel pour suivre ses candidatures à des offres d'emploi, ainsi que les CV et lettres de motivation utilisés.

## Fonctionnalités

- **Candidatures** : entreprise, poste, lieu, lien de l'offre, source, contact, salaire, notes.
- **Statuts** : À postuler, Postulé, Relancé, Entretien, Offre reçue, Refusé, Abandonné, avec compteurs cliquables pour filtrer.
- **Dates** : date de candidature et date de relance ; une relance échue sur une candidature en attente s'affiche en rouge.
- **CV & lettres** : bibliothèque de documents (nom, lien vers Drive/Dropbox/OneDrive…), associés à chaque candidature.
- Recherche, tri, et **export / import JSON** pour sauvegarder ou changer de navigateur.

## Utilisation

Aucune installation : ouvrir `index.html` dans un navigateur.

Pour le publier en ligne, activer GitHub Pages sur le dépôt (Settings → Pages → branche par défaut, dossier racine).

## Stockage des données

Les données restent **dans le navigateur** (localStorage) : rien n'est envoyé sur un serveur. Pensez à utiliser **Exporter** régulièrement pour garder une sauvegarde, car vider les données du navigateur efface tout.

## Structure

```
index.html      page unique
css/styles.css  styles (thème clair / sombre automatique)
js/app.js       logique de l'application
```
