#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Substitute env placeholders with dummy values so amtool can lint structure
# without requiring real credentials.
mkdir -p .tmp
tmpdir="$(mktemp -d "$PWD/.tmp/alertmanager-lint.XXXXXX")"
trap 'rm -rf "$tmpdir"' EXIT
# shellcheck disable=SC2016
# Intentional: ${VAR} is literal sed search text, not a shell expansion.
sed -e 's|\${READMATES_ALERT_SMTP_HOST}|smtp.example.com|g' \
    -e 's|\${READMATES_ALERT_SMTP_PORT}|587|g' \
    -e 's|\${READMATES_ALERT_SMTP_FROM}|alerts@example.com|g' \
    -e 's|\${READMATES_ALERT_SMTP_USER}|user|g' \
    -e 's|\${READMATES_ALERT_SMTP_PASSWORD}|pass|g' \
    -e 's|\${READMATES_ALERT_EMAIL_TO}|ops@example.com|g' \
    deploy/oci/alertmanager/alertmanager.yml > "$tmpdir/alertmanager.yml"

docker run --rm -v "$tmpdir:/workspace:ro" \
  --entrypoint amtool \
  prom/alertmanager:v0.27.0 \
  check-config /workspace/alertmanager.yml

echo "Alertmanager config OK"
