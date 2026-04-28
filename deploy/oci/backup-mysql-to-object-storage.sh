#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${READMATES_EXPORT_BUCKET:?READMATES_EXPORT_BUCKET is required}"
: "${OCI_NAMESPACE:?OCI_NAMESPACE is required}"
: "${READMATES_DB_HOST:?READMATES_DB_HOST is required}"
: "${READMATES_DB_NAME:=readmates}"
: "${READMATES_DB_USER:=readmates}"
: "${READMATES_EXPORT_DIR:=/var/backups/readmates/mysql}"
: "${READMATES_MYSQL_DEFAULTS_FILE:=/etc/readmates/mysql-backup.cnf}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export_path="$(
  READMATES_DB_HOST="$READMATES_DB_HOST" \
  READMATES_DB_NAME="$READMATES_DB_NAME" \
  READMATES_DB_USER="$READMATES_DB_USER" \
  READMATES_EXPORT_DIR="$READMATES_EXPORT_DIR" \
  READMATES_MYSQL_DEFAULTS_FILE="$READMATES_MYSQL_DEFAULTS_FILE" \
  "$script_dir/export-mysql.sh"
)"

checksum_path="${export_path}.sha256"
export_dir="$(dirname "$export_path")"
backup_name="$(basename "$export_path")"

(
  cd "$export_dir"
  sha256sum "$backup_name"
) > "$checksum_path"

object_prefix="${READMATES_BACKUP_OBJECT_PREFIX:-mysql}"
checksum_name="$(basename "$checksum_path")"

oci os object put \
  --namespace-name "$OCI_NAMESPACE" \
  --bucket-name "$READMATES_EXPORT_BUCKET" \
  --name "$object_prefix/$backup_name" \
  --file "$export_path" \
  --force

oci os object put \
  --namespace-name "$OCI_NAMESPACE" \
  --bucket-name "$READMATES_EXPORT_BUCKET" \
  --name "$object_prefix/$checksum_name" \
  --file "$checksum_path" \
  --force

echo "UPLOADED: $object_prefix/$backup_name"
echo "UPLOADED: $object_prefix/$checksum_name"
