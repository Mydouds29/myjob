#!/usr/bin/env bash
# Installation de MyJob dans un conteneur LXC Debian 13 (à lancer en root).
#
#   apt install -y git
#   git clone -b claude/job-tracker-site-2j5fa0 https://github.com/Mydouds29/myjob.git /opt/myjob
#   bash /opt/myjob/deploy/install.sh
#
# Le script peut être relancé sans risque : il ne remplace ni la
# configuration existante ni les données.
set -euo pipefail

APP_DIR=/opt/myjob
DATA_DIR=/var/lib/myjob
CONF_DIR=/etc/myjob
DOMAINE_DEFAUT=myjob.mydouds.fr

[ "$(id -u)" -eq 0 ] || { echo "À lancer en root."; exit 1; }
[ -f "$APP_DIR/package.json" ] || { echo "Le dépôt doit être cloné dans $APP_DIR."; exit 1; }

echo "==> Paquets système"
apt-get update
apt-get install -y nodejs npm sqlite3 rclone caddy ca-certificates build-essential python3

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || { echo "Node.js 20 ou plus est requis (trouvé : $(node -v))."; exit 1; }

echo "==> Utilisateur système et dossiers"
id myjob >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin myjob
install -d -o myjob -g myjob -m 700 "$DATA_DIR"
install -d -o root -g myjob -m 750 "$CONF_DIR"
if [ ! -f "$CONF_DIR/myjob.env" ]; then
  install -o root -g myjob -m 640 "$APP_DIR/deploy/myjob.env.example" "$CONF_DIR/myjob.env"
fi

echo "==> Dépendances Node.js"
cd "$APP_DIR"
npm ci --omit=dev
chown -R root:root "$APP_DIR"
chmod +x "$APP_DIR/deploy/"*.sh

echo "==> Services systemd"
install -m 644 deploy/myjob.service /etc/systemd/system/myjob.service
install -m 644 deploy/myjob-backup.service /etc/systemd/system/myjob-backup.service
install -m 644 deploy/myjob-backup.timer /etc/systemd/system/myjob-backup.timer
systemctl daemon-reload
systemctl enable --now myjob.service myjob-backup.timer

echo "==> Caddy (HTTPS)"
if ! grep -q "reverse_proxy 127.0.0.1:3000" /etc/caddy/Caddyfile 2>/dev/null; then
  read -r -p "Nom de domaine du site [$DOMAINE_DEFAUT] : " DOMAINE
  DOMAINE=${DOMAINE:-$DOMAINE_DEFAUT}
  [ -f /etc/caddy/Caddyfile ] && cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.origine
  sed "s/myjob.mydouds.fr/$DOMAINE/" deploy/Caddyfile > /etc/caddy/Caddyfile
  sed -i "s|^MYJOB_URL=.*|MYJOB_URL=https://$DOMAINE|" "$CONF_DIR/myjob.env"
fi
systemctl enable caddy
systemctl reload-or-restart caddy

echo "==> Compte administrateur"
en_myjob() { runuser -u myjob -- env $(grep -v '^#' "$CONF_DIR/myjob.env" | xargs) "$@"; }
if [ "$(en_myjob node "$APP_DIR/server/cli.js" count)" = "0" ]; then
  read -r -p "Identifiant de connexion : " IDENTIFIANT
  en_myjob node "$APP_DIR/server/cli.js" create "$IDENTIFIANT" --admin
else
  echo "Un compte existe déjà."
fi

systemctl restart myjob.service
echo
echo "MyJob est installé."
echo " - Service : systemctl status myjob"
echo " - Journal : journalctl -u myjob -f"
echo " - Site    : $(grep '^MYJOB_URL=' "$CONF_DIR/myjob.env" | cut -d= -f2)"
echo " - Sauvegarde Google Drive : voir docs/INSTALLATION.md, étape 5"
