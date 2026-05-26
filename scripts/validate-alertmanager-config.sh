#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Substitute env placeholders with dummy values so amtool can lint structure
# without requiring real credentials.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
# shellcheck disable=SC2016
# Intentional: ${VAR} is literal sed search text, not a shell expansion.
sed -e 's|\${READMATES_ALERT_SMTP_HOST}|smtp.example.com|g' \
    -e 's|\${READMATES_ALERT_SMTP_PORT}|587|g' \
    -e 's|\${READMATES_ALERT_SMTP_FROM}|alerts@example.com|g' \
    -e 's|\${READMATES_ALERT_SMTP_USER}|user|g' \
    -e 's|\${READMATES_ALERT_SMTP_PASSWORD}|pass|g' \
    -e 's|\${READMATES_ALERT_EMAIL_TO}|ops@example.com|g' \
    deploy/oci/alertmanager/alertmanager.yml > "$tmp"

docker run --rm -v "$tmp:/etc/alertmanager/alertmanager.yml:ro" \
  prom/alertmanager:v0.27.0 \
  amtool check-config /etc/alertmanager/alertmanager.yml

echo "Alertmanager config OK"
