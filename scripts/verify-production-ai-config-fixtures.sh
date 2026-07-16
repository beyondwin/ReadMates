#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
fixture_root="$repo_root/.tmp/production-ai-config-fixtures"

cleanup() {
  rm -rf -- "$fixture_root"
}
trap cleanup EXIT

rm -rf -- "$fixture_root"
mkdir -p \
  "$fixture_root/.github/workflows" \
  "$fixture_root/deploy/oci" \
  "$fixture_root/docs/case-studies" \
  "$fixture_root/scripts/sync-config"

cp "$repo_root/.github/workflows/sync-config.yml" "$fixture_root/.github/workflows/"
cp "$repo_root/.env.example" "$fixture_root/"
cp "$repo_root/deploy/oci/compose.yml" "$fixture_root/deploy/oci/"
cp "$repo_root/deploy/oci/compose.infra.yml" "$fixture_root/deploy/oci/"
cp "$repo_root/scripts/sync-config/import-from-prod-env.sh" "$fixture_root/scripts/sync-config/"
cp "$repo_root/docs/case-studies/04-pii-safe-ai-session-generation.md" "$fixture_root/docs/case-studies/"

bash "$repo_root/scripts/validate-production-ai-config.sh" "$fixture_root" >/dev/null

printf "\nPipeline 기본값은 \`LEGACY\`이며 장애 시 \`GROUNDED_WHOLE_TRANSCRIPT\`에서 되돌립니다.\n" \
  >> "$fixture_root/docs/case-studies/04-pii-safe-ai-session-generation.md"

if bash "$repo_root/scripts/validate-production-ai-config.sh" "$fixture_root" \
  >"$fixture_root/legacy-selector.out" 2>"$fixture_root/legacy-selector.err"; then
  echo "production AI config fixture failed: active case-study legacy selector unexpectedly passed" >&2
  exit 1
fi

grep -Fq "legacy pipeline selector remains in an active path" "$fixture_root/legacy-selector.err" || {
  sed 's/^/  /' "$fixture_root/legacy-selector.err" >&2
  echo "production AI config fixture failed for the wrong reason" >&2
  exit 1
}

echo "Production AI config fixture checks passed"
