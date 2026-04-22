#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${READMATES_DB_HOST:?READMATES_DB_HOST is required}"
: "${READMATES_DB_NAME:?READMATES_DB_NAME is required}"
: "${READMATES_DB_USER:?READMATES_DB_USER is required}"
: "${READMATES_EXPORT_DIR:?READMATES_EXPORT_DIR is required}"
: "${READMATES_MYSQL_DEFAULTS_FILE:?READMATES_MYSQL_DEFAULTS_FILE is required}"

if [ ! -f "$READMATES_MYSQL_DEFAULTS_FILE" ]; then
  echo "MySQL defaults file does not exist: $READMATES_MYSQL_DEFAULTS_FILE" >&2
  exit 1
fi

defaults_file_mode="$(
  stat -c "%a" "$READMATES_MYSQL_DEFAULTS_FILE" 2>/dev/null ||
    stat -f "%Lp" "$READMATES_MYSQL_DEFAULTS_FILE" 2>/dev/null ||
    true
)"

if [ "$defaults_file_mode" != "600" ]; then
  echo "MySQL defaults file must have 0600 permissions: $READMATES_MYSQL_DEFAULTS_FILE" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p -m 700 "$READMATES_EXPORT_DIR"
chmod 700 "$READMATES_EXPORT_DIR"
output="$READMATES_EXPORT_DIR/readmates-${timestamp}.sql.gz"
tmp_output="$(mktemp "${output}.tmp.XXXXXX")"

cleanup() {
  rm -f "$tmp_output"
}
trap cleanup EXIT

mysqldump \
  --defaults-extra-file="$READMATES_MYSQL_DEFAULTS_FILE" \
  --host="$READMATES_DB_HOST" \
  --user="$READMATES_DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  "$READMATES_DB_NAME" | gzip > "$tmp_output"

chmod 600 "$tmp_output"
mv "$tmp_output" "$output"
trap - EXIT

echo "$output"
