#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-.}"
workflow="$repo_root/.github/workflows/sync-config.yml"
env_example="$repo_root/.env.example"
import_script="$repo_root/scripts/sync-config/import-from-prod-env.sh"
app_compose="$repo_root/deploy/oci/compose.yml"
infra_compose="$repo_root/deploy/oci/compose.infra.yml"

fail() {
  echo "production AI config contract failed: $*" >&2
  exit 1
}

for file in "$workflow" "$env_example" "$import_script" "$app_compose" "$infra_compose"; do
  [ -f "$file" ] || fail "missing ${file#"$repo_root"/}"
done

legacy_env='READMATES_AIGEN_''PIPELINE_MODE'
legacy_property='readmates.aigen.pipeline''-mode'
if rg -n "$legacy_env|$legacy_property" \
  "$workflow" "$env_example" "$import_script" "$app_compose"; then
  fail "legacy pipeline selector remains in an active production config path"
fi

grep -Fq 'READMATES_OTLP_TRACES_ENDPOINT: http://tempo:4318/v1/traces' "$app_compose" ||
  fail "readmates-api must export traces to internal Tempo Docker DNS"

tempo_service="$(awk '
  /^  tempo:[[:space:]]*$/ { in_tempo=1; next }
  in_tempo && /^  [[:alnum:]_-]+:[[:space:]]*$/ { exit }
  in_tempo { print }
' "$infra_compose")"
[ -n "$tempo_service" ] || fail "OCI Tempo service is missing"
if printf '%s\n' "$tempo_service" | grep -Eq '^[[:space:]]+ports:[[:space:]]*$'; then
  fail "OCI Tempo must not publish query or OTLP ports"
fi

grep -Fq 'READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED:' "$workflow" ||
  fail "sync-config must expose the Google paid-tier confirmation variable"
grep -Fq "vars.READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED || 'false'" "$workflow" ||
  fail "Google paid-tier confirmation must default false"
grep -Fq "printf 'READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED=%s" "$workflow" ||
  fail "sync-config must render the Google paid-tier confirmation"
grep -Fq 'READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED' "$import_script" ||
  fail "bulk config import must classify the Google paid-tier confirmation"
grep -Fq 'READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED=false' "$env_example" ||
  fail ".env.example must show the fail-closed false default"

echo "Production AI config contract OK"
