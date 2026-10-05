# MyJob

Site personnel pour suivre ses candidatures à des offres d'emploi, ainsi que les CV et lettres de motivation utilisés.

## Fonctionnalités

- **Candidatures** : réponse à une offre ou candidature spontanée ; entreprise, poste, lieu, lien et référence de l'annonce, source, contact, contrat, télétravail, salaire, notes.
- **Texte de l'offre et mots-clés** : collez l'annonce, l'analyse repère les compétences techniques IT, les qualités attendues et les mots les plus répétés (localement, sans service externe).
- **Statuts** : À postuler, Postulé, Relancé, Entretien, Offre reçue, Refusé, Abandonné, avec compteurs cliquables, taux de réponse et candidatures des 7 derniers jours.
- **Relances** : date proposée automatiquement (délai réglable), bandeau des relances à faire.
- **Historique daté** des échanges par candidature (les changements de statut s'y ajoutent seuls).
- **Entreprises** : toutes les entreprises contactées avec la date du dernier échange.
- **CV & lettres** : versions de CV et de lettres (liens), et modèles de lettre avec `{entreprise}`, `{poste}`, `{competences}` et `{date}` remplis automatiquement.
- Recherche sur tous les champs (touche `/`), thème clair / sombre au choix, affichage adapté au smartphone.
- **Export / import JSON** dans les paramètres.

## Utilisation

Aucune installation : ouvrir `index.html` dans un navigateur.

Prochaine étape : un petit serveur à installer dans un LXC Proxmox (connexion par identifiant et mot de passe, base SQLite, fichiers de CV et lettres, sauvegarde nocturne sur Google Drive avec rclone).

## Stockage des données

Les données restent **dans le navigateur** (localStorage) : rien n'est envoyé sur un serveur. Pensez à utiliser **Exporter** régulièrement pour garder une sauvegarde, car vider les données du navigateur efface tout.

## Structure

```
index.html      page unique
css/styles.css  styles (thème clair / sombre automatique)
js/app.js       logique de l'application
js/keywords.js  dictionnaire et analyse des mots-clés des offres
```
