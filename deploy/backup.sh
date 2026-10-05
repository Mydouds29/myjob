#!/usr/bin/env bash
# Sauvegarde de MyJob : copie cohérente de la base SQLite et des fichiers
# importés, conservée en local puis envoyée sur Google Drive avec rclone
# (si le remote « gdrive » est configuré, voir docs/INSTALLATION.md).
set -euo pipefail

DATA_DIR="${MYJOB_DATA_DIR:-/var/lib/myjob}"
BACKUP_DIR="${MYJOB_BACKUP_DIR:-$DATA_DIR/sauvegardes}"
REMOTE="${MYJOB_RCLONE_REMOTE:-gdrive:MyJob-sauvegardes}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/etc/myjob/rclone.conf}"
KEEP_LOCAL="${MYJOB_KEEP_LOCAL:-7}"   # nombre d'archives gardées en local
KEEP_REMOTE_DAYS="${MYJOB_KEEP_REMOTE_DAYS:-60}"

stamp=$(date +%Y-%m-%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# Rien n'a changé depuis la dernière archive : on n'en crée pas une de plus
# (sinon des sauvegardes identiques chasseraient les anciennes de la rotation).
derniere=$(ls -1t "$BACKUP_DIR"/myjob-*.tar.gz 2>/dev/null | head -1 || true)
if [ -n "$derniere" ] && [ -z "$(find "$DATA_DIR" \( -name 'myjob.db*' -o -path "$DATA_DIR/fichiers*" \) -newer "$derniere" -print -quit)" ]; then
  echo "Aucun changement depuis $(basename "$derniere") : pas de nouvelle sauvegarde."
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Copie à chaud sans risque (sauvegarde en ligne de SQLite).
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MYJOB_DATA_DIR="$DATA_DIR" node "$APP_DIR/server/copie-base.js" "$work/myjob.db"
# Écrite sous un nom provisoire, vérifiée, puis renommée : une copie vers
# un autre disque ne voit jamais d'archive à moitié écrite.
archive="$BACKUP_DIR/myjob-$stamp.tar.gz"
tar -czf "$archive.partiel" -C "$work" myjob.db -C "$DATA_DIR" fichiers
tar -tzf "$archive.partiel" >/dev/null
chmod 600 "$archive.partiel"
mv "$archive.partiel" "$archive"
echo "Sauvegarde locale : $archive"

# Garde les KEEP_LOCAL archives les plus récentes.
ls -1t "$BACKUP_DIR"/myjob-*.tar.gz | tail -n +"$((KEEP_LOCAL + 1))" | xargs -r rm -f --

if [ -f "$RCLONE_CONFIG" ] && rclone --config "$RCLONE_CONFIG" listremotes | grep -q "^${REMOTE%%:*}:$"; then
  rclone --config "$RCLONE_CONFIG" copy "$archive" "$REMOTE"
  rclone --config "$RCLONE_CONFIG" delete --min-age "${KEEP_REMOTE_DAYS}d" "$REMOTE"
  echo "Envoyée sur $REMOTE"
else
  echo "Google Drive non configuré : sauvegarde locale uniquement."
fi
