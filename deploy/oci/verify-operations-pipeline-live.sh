#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "MISSING command: $1" >&2
    exit 1
  fi
}

require_env() {
  if [ -z "${!1:-}" ]; then
    echo "MISSING env: $1" >&2
    return 1
  fi
}

optional_env() {
  if [ -z "${!1:-}" ]; then
    echo "SKIP $2: $1 is not set"
    return 1
  fi
}

verify_object_storage() {
  require_command oci
  require_env READMATES_EXPORT_BUCKET

  namespace="${OCI_NAMESPACE:-$(oci os ns get --query 'data' --raw-output)}"
  export OCI_NAMESPACE="$namespace"
  oci os bucket get \
    --namespace-name "$namespace" \
    --bucket-name "$READMATES_EXPORT_BUCKET" \
    --query 'data.{name:name,publicAccessType:"public-access-type"}' \
    --output json

  if [ "${READMATES_OBJECT_STORAGE_SMOKE_WRITE:-false}" != "true" ]; then
    echo "SKIP object write smoke: set READMATES_OBJECT_STORAGE_SMOKE_WRITE=true to upload and delete a temporary object"
    return
  fi

  object_name="smoke/readmates-ops-smoke-$(date -u +%Y%m%dT%H%M%SZ).txt"
  tmp_file="$(mktemp)"
  download_file="$(mktemp)"
  object_uploaded=false
  cleanup() {
    if [ "$object_uploaded" = "true" ]; then
      oci os object delete \
        --namespace-name "$namespace" \
        --bucket-name "$READMATES_EXPORT_BUCKET" \
        --name "$object_name" \
        --force >/dev/null 2>&1 || true
    fi
    rm -f "$tmp_file" "$download_file"
  }
  trap cleanup RETURN

  printf 'readmates operations object storage smoke\n' > "$tmp_file"
  oci os object put \
    --namespace-name "$namespace" \
    --bucket-name "$READMATES_EXPORT_BUCKET" \
    --name "$object_name" \
    --file "$tmp_file" \
    --force >/dev/null
  object_uploaded=true
  oci os object head \
    --namespace-name "$namespace" \
    --bucket-name "$READMATES_EXPORT_BUCKET" \
    --name "$object_name" >/dev/null
  oci os object get \
    --namespace-name "$namespace" \
    --bucket-name "$READMATES_EXPORT_BUCKET" \
    --name "$object_name" \
    --file "$download_file" >/dev/null
  cmp "$tmp_file" "$download_file" >/dev/null
  oci os object delete \
    --namespace-name "$namespace" \
    --bucket-name "$READMATES_EXPORT_BUCKET" \
    --name "$object_name" \
    --force
  object_uploaded=false
  echo "PASS object write smoke: uploaded and deleted $object_name"
}

verify_mysql_connection() {
  require_command mysql
  require_env READMATES_DB_HOST
  : "${READMATES_DB_NAME:=readmates}"
  : "${READMATES_DB_USER:=readmates}"
  : "${READMATES_MYSQL_DEFAULTS_FILE:=/etc/readmates/mysql-backup.cnf}"

  if [ ! -f "$READMATES_MYSQL_DEFAULTS_FILE" ]; then
    echo "MISSING file: READMATES_MYSQL_DEFAULTS_FILE" >&2
    return 1
  fi

  mysql \
    --defaults-extra-file="$READMATES_MYSQL_DEFAULTS_FILE" \
    --host="$READMATES_DB_HOST" \
    --user="$READMATES_DB_USER" \
    --batch \
    --skip-column-names \
    --execute "select 1" \
    "$READMATES_DB_NAME" >/dev/null
  echo "PASS mysql connection smoke"
}

verify_backup_upload() {
  if [ "${READMATES_BACKUP_UPLOAD_SMOKE:-false}" != "true" ]; then
    echo "SKIP backup upload smoke: set READMATES_BACKUP_UPLOAD_SMOKE=true to run a real dump and upload"
    return
  fi

  require_command mysqldump
  require_command sha256sum
  require_command oci
  "$script_dir/backup-mysql-to-object-storage.sh"
}

verify_smtp_delivery() {
  require_command curl
  require_env READMATES_SMTP_SMOKE_TO
  require_env SPRING_MAIL_HOST
  require_env SPRING_MAIL_USERNAME
  require_env SPRING_MAIL_PASSWORD
  require_env READMATES_NOTIFICATION_SENDER_EMAIL

  : "${SPRING_MAIL_PORT:=587}"
  tmp_mail="$(mktemp)"
  cleanup() {
    rm -f "$tmp_mail"
  }
  trap cleanup RETURN

  cat > "$tmp_mail" <<EOF
From: ReadMates <${READMATES_NOTIFICATION_SENDER_EMAIL}>
To: ${READMATES_SMTP_SMOKE_TO}
Subject: ReadMates operations SMTP smoke

This is a ReadMates operations SMTP smoke message.
EOF

  curl --silent --show-error --fail \
    --url "smtp://${SPRING_MAIL_HOST}:${SPRING_MAIL_PORT}" \
    --ssl-reqd \
    --user "${SPRING_MAIL_USERNAME}:${SPRING_MAIL_PASSWORD}" \
    --mail-from "$READMATES_NOTIFICATION_SENDER_EMAIL" \
    --mail-rcpt "$READMATES_SMTP_SMOKE_TO" \
    --upload-file "$tmp_mail" >/dev/null
  echo "PASS smtp delivery smoke"
}

verify_object_storage

if optional_env READMATES_DB_HOST "mysql connection smoke"; then
  verify_mysql_connection
else
  echo "SKIP backup upload smoke: READMATES_DB_HOST is not set"
fi

verify_backup_upload

if optional_env READMATES_SMTP_SMOKE_TO "smtp delivery smoke"; then
  verify_smtp_delivery
fi

echo "DONE operations pipeline live verification"
