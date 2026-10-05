#!/usr/bin/env bash
# Mise à jour de MyJob (à lancer en root) : récupère la dernière version,
# installe les dépendances et redémarre le service. Les données ne sont pas touchées.
set -euo pipefail
cd /opt/myjob

echo "==> Sauvegarde avant mise à jour"
runuser -u myjob -- env $(grep -v '^#' /etc/myjob/myjob.env | xargs) /opt/myjob/deploy/backup.sh || echo "(sauvegarde impossible, mise à jour poursuivie)"

echo "==> Récupération de la nouvelle version"
git pull --ff-only
npm ci --omit=dev
install -m 644 deploy/myjob.service /etc/systemd/system/myjob.service
install -m 644 deploy/myjob-backup.service /etc/systemd/system/myjob-backup.service
install -m 644 deploy/myjob-backup.timer /etc/systemd/system/myjob-backup.timer
systemctl daemon-reload
systemctl restart myjob.service
systemctl --no-pager status myjob.service | head -5
