#!/usr/bin/env bash
# Sauvegarde de MyJob : copie cohérente de la base SQLite et des fichiers
# importés, conservée en local puis envoyée sur Google Drive avec rclone
# (si le remote « gdrive » est configuré, voir docs/INSTALLATION.md).
set -euo pipefail

DATA_DIR="${MYJOB_DATA_DIR:-/var/lib/myjob}"
BACKUP_DIR="${MYJOB_BACKUP_DIR:-$DATA_DIR/sauvegardes}"
REMOTE="${MYJOB_RCLONE_REMOTE:-gdrive:MyJob-sauvegardes}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/etc/myjob/rclone.conf}"
KEEP_LOCAL_DAYS="${MYJOB_KEEP_LOCAL_DAYS:-14}"
KEEP_REMOTE_DAYS="${MYJOB_KEEP_REMOTE_DAYS:-60}"

stamp=$(date +%Y-%m-%d_%H%M)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$BACKUP_DIR"

# Copie à chaud sans risque (sauvegarde en ligne de SQLite).
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MYJOB_DATA_DIR="$DATA_DIR" node "$APP_DIR/server/copie-base.js" "$work/myjob.db"
tar -czf "$BACKUP_DIR/myjob-$stamp.tar.gz" -C "$work" myjob.db -C "$DATA_DIR" fichiers
chmod 600 "$BACKUP_DIR/myjob-$stamp.tar.gz"
echo "Sauvegarde locale : $BACKUP_DIR/myjob-$stamp.tar.gz"

find "$BACKUP_DIR" -name 'myjob-*.tar.gz' -mtime +"$KEEP_LOCAL_DAYS" -delete

if [ -f "$RCLONE_CONFIG" ] && rclone --config "$RCLONE_CONFIG" listremotes | grep -q "^${REMOTE%%:*}:$"; then
  rclone --config "$RCLONE_CONFIG" copy "$BACKUP_DIR/myjob-$stamp.tar.gz" "$REMOTE"
  rclone --config "$RCLONE_CONFIG" delete --min-age "${KEEP_REMOTE_DAYS}d" "$REMOTE"
  echo "Envoyée sur $REMOTE"
else
  echo "Google Drive non configuré : sauvegarde locale uniquement."
fi
