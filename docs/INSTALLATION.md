# Installer MyJob sur Proxmox

Le site tourne dans un conteneur LXC Debian 13, sans Docker :

- **Node.js** fait tourner l'application (service `myjob`) ;
- **SQLite** stocke les données dans un seul fichier (`/var/lib/myjob/myjob.db`), les CV et lettres importés sont dans `/var/lib/myjob/fichiers/` ;
- **Caddy** reçoit les connexions sur `https://myjob.mydouds.fr` et gère seul le certificat HTTPS ;
- **rclone** envoie chaque nuit une sauvegarde sur Google Drive.

## 1. Créer le conteneur LXC

Dans Proxmox : *Créer CT* avec le template **Debian 13**.

- Conteneur non privilégié, 1 cœur, 1 Go de RAM, 8 Go de disque suffisent.
- Réseau : une IP fixe (ou réservée dans la box), par exemple `192.168.1.50`.

## 2. Installer MyJob

Dans la console du conteneur, en root :

```bash
apt update && apt install -y git
git clone -b claude/job-tracker-site-2j5fa0 https://github.com/Mydouds29/myjob.git /opt/myjob
bash /opt/myjob/deploy/install.sh
```

Le script installe les paquets, crée le service, configure Caddy (il demande le nom de domaine, `myjob.mydouds.fr` par défaut) puis l'identifiant et le mot de passe du compte administrateur.

Vérifier que tout tourne :

```bash
systemctl status myjob caddy
journalctl -u myjob -f        # journal du site
```

## 3. Nom de domaine et accès depuis l'extérieur

1. **OVH**, zone DNS de `mydouds.fr` : ajouter un enregistrement `A` pour `myjob` vers l'IP publique de la box (ou un `CNAME` si vous avez déjà un nom en DNS dynamique).
2. **Box** : rediriger les ports TCP **80** et **443** vers l'IP du conteneur.
3. Redémarrer Caddy : `systemctl restart caddy`. Il obtient le certificat Let's Encrypt en quelques secondes (`journalctl -u caddy` en cas de souci).

Le site est alors accessible sur `https://myjob.mydouds.fr`, depuis l'ordinateur comme depuis le smartphone.

> Si les ports 80/443 sont déjà utilisés par un autre service, il faudra un seul reverse proxy en frontal qui redirige `myjob.mydouds.fr` vers `IP-du-conteneur:3000` ; dans ce cas, mettre `MYJOB_HOST=0.0.0.0` dans `/etc/myjob/myjob.env`.

## 4. Réglages dans le site

Tout le reste se règle dans le site. L'onglet **Mon profil** contient le nom, la ville et les compétences (utilisés pour les lettres et l'analyse des offres), avec une liste de compétences à cocher. L'onglet **Paramètres** contient les réglages de l'application :

- **Rappels par e-mail** : adresse qui reçoit les rappels, adresse Gmail d'envoi et **mot de passe d'application** Gmail
  (à créer sur <https://myaccount.google.com/apppasswords>, la validation en deux étapes doit être active). Le bouton « Envoyer un e-mail de test » vérifie la configuration ;
- **Comptes** (administrateur) : créer d'autres comptes, chacun avec ses propres données et réglages.

La configuration technique (port, heure des rappels, durée de connexion…) est dans `/etc/myjob/myjob.env`. Après modification : `systemctl restart myjob`.

## 5. Sauvegarde sur Google Drive

Une sauvegarde (base + fichiers) est faite chaque nuit à 3 h dans `/var/lib/myjob/sauvegardes/` (les 7 dernières archives sont gardées ; aucune n'est créée si rien n'a changé depuis la précédente). Pour l'envoyer aussi sur Google Drive :

1. Sur votre PC Windows, installer rclone (<https://rclone.org/downloads/>) : il servira uniquement à autoriser l'accès à Google Drive.
2. Dans le conteneur, en root :

   ```bash
   rclone config --config /etc/myjob/rclone.conf
   ```

   - `n` (nouveau remote), nom : **gdrive** ;
   - type de stockage : **drive** (Google Drive) ;
   - `client_id` et `client_secret` : laisser vide ;
   - scope : **drive.file** (rclone ne voit que les fichiers qu'il crée) ;
   - `Use web browser to automatically authenticate?` : **n** ; rclone affiche une commande `rclone authorize "drive" "..."` à lancer sur le PC Windows, qui ouvre le navigateur ; recopier le jeton obtenu dans le conteneur ;
   - Shared Drive : `n`, puis valider.

3. Donner le fichier au service et tester :

   ```bash
   chown myjob:myjob /etc/myjob/rclone.conf && chmod 600 /etc/myjob/rclone.conf
   systemctl start myjob-backup.service
   journalctl -u myjob-backup -n 20
   ```

Les sauvegardes arrivent dans le dossier **MyJob-sauvegardes** de votre Drive (60 jours conservés). Les sauvegardes du conteneur par Proxmox restent un complément utile.

### Restaurer une sauvegarde

```bash
systemctl stop myjob
tar -xzf /var/lib/myjob/sauvegardes/myjob-AAAA-MM-JJ_HHMM.tar.gz -C /var/lib/myjob
rm -f /var/lib/myjob/myjob.db-wal /var/lib/myjob/myjob.db-shm
chown -R myjob:myjob /var/lib/myjob
systemctl start myjob
```

## 6. Mettre à jour

```bash
bash /opt/myjob/deploy/update.sh
```

Le script fait une sauvegarde, récupère la dernière version, met à jour les dépendances et redémarre le site.

## 7. Analyse des annonces par Claude (facultatif)

Le bouton **Analyser avec Claude** (texte de l'offre) fait lire l'annonce par Claude avec **votre abonnement Claude** (Pro ou Max) : résumé, missions, compétences, atouts et manques par rapport à votre profil, points de vigilance. Les analyses comptent dans les limites d'usage de l'abonnement, comme claude.ai et Claude Code. Claude ne reçoit aucun outil : il lit le texte envoyé et répond, rien d'autre.

1. **Installer Claude Code** dans le conteneur, depuis le dépôt signé d'Anthropic (empreinte de la clé à vérifier : `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE`). Claude Code demande 4 Go de RAM : augmenter la mémoire du conteneur si besoin.

   ```bash
   apt install -y gnupg
   install -d -m 0755 /etc/apt/keyrings
   curl -fsSL https://downloads.claude.ai/keys/claude-code.asc -o /etc/apt/keyrings/claude-code.asc
   gpg --show-keys /etc/apt/keyrings/claude-code.asc
   echo "deb [signed-by=/etc/apt/keyrings/claude-code.asc] https://downloads.claude.ai/claude-code/apt/stable stable main" \
     > /etc/apt/sources.list.d/claude-code.list
   apt update && apt install -y claude-code
   ```

2. **Créer un jeton** sur un ordinateur où Claude Code est installé, avec le compte de l'abonnement : `claude setup-token`. Le jeton (valable un an) s'affiche une seule fois.

3. **Le donner à MyJob** : page **Paramètres → Services connectés**, champ « Jeton Claude », puis « Vérifier ». Il est enregistré avec les réglages du compte et n'est jamais renvoyé au navigateur. Autre possibilité, pour tous les comptes du serveur, dans le conteneur et sans qu'il apparaisse à l'écran :

   ```bash
   read -rsp "Jeton : " T && echo && sed -i '/^CLAUDE_CODE_OAUTH_TOKEN=/d' /etc/myjob/myjob.env \
     && echo "CLAUDE_CODE_OAUTH_TOKEN=$T" >> /etc/myjob/myjob.env && unset T && systemctl restart myjob
   ```

Le bouton apparaît dans le formulaire dès que le jeton est en place. Pour changer de modèle, ajouter par exemple `MYJOB_CLAUDE_MODEL=sonnet` dans `/etc/myjob/myjob.env`.

## 8. Offres d'emploi France Travail (facultatif)

1. Créer un compte sur <https://francetravail.io>, puis une application (adresse du site : par exemple celle du dépôt GitHub) avec l'API **« Offres d'emploi »**.
2. Recopier l'identifiant client et la clé secrète dans **Paramètres → Services connectés**, puis « Vérifier ». À défaut, `MYJOB_FT_CLIENT_ID` et `MYJOB_FT_CLIENT_SECRET` dans `/etc/myjob/myjob.env` valent pour tous les comptes.

## Comptes en ligne de commande

```bash
cd /opt/myjob
runuser -u myjob -- env $(grep -v '^#' /etc/myjob/myjob.env | xargs) node server/cli.js list
runuser -u myjob -- env $(grep -v '^#' /etc/myjob/myjob.env | xargs) node server/cli.js password <identifiant>
```

Commandes : `create <identifiant> [--admin]`, `password <identifiant>`, `list`, `delete <identifiant>`.

## Récupérer les données de la première version

Si vous aviez saisi des candidatures dans la première version (données dans le navigateur) : bouton **Exporter** de l'ancienne version, puis **Paramètres → Sauvegarde → Importer** dans la nouvelle.
