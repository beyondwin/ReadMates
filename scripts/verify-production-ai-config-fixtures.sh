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
  "$fixture_root/server/src/main/resources" \
  "$fixture_root/scripts/sync-config"

reset_fixture() {
  cp "$repo_root/.github/workflows/sync-config.yml" "$fixture_root/.github/workflows/"
  cp "$repo_root/.env.example" "$fixture_root/"
  cp "$repo_root/deploy/oci/compose.yml" "$fixture_root/deploy/oci/"
  cp "$repo_root/deploy/oci/compose.infra.yml" "$fixture_root/deploy/oci/"
  cp "$repo_root/server/src/main/resources/application.yml" "$fixture_root/server/src/main/resources/"
  cp "$repo_root/scripts/sync-config/import-from-prod-env.sh" "$fixture_root/scripts/sync-config/"
  cp "$repo_root/docs/case-studies/04-pii-safe-ai-session-generation.md" "$fixture_root/docs/case-studies/"
}

replace_exact_line() {
  local file="$1"
  local old_line="$2"
  local new_line="$3"
  awk -v old_line="$old_line" -v new_line="$new_line" '
    $0 == old_line { print new_line; replaced=1; next }
    { print }
    END { if (!replaced) exit 3 }
  ' "$file" > "$file.next"
  mv "$file.next" "$file"
}

remove_exact_line() {
  local file="$1"
  local exact_line="$2"
  awk -v exact_line="$exact_line" '
    $0 == exact_line { next }
    { print }
  ' "$file" > "$file.next"
  mv "$file.next" "$file"
}

expect_contract_failure() {
  local label="$1"
  local expected="$2"
  if bash "$repo_root/scripts/validate-production-ai-config.sh" "$fixture_root" \
    >"$fixture_root/$label.out" 2>"$fixture_root/$label.err"; then
    echo "production AI config fixture failed: $label unexpectedly passed" >&2
    exit 1
  fi
  grep -Fq "$expected" "$fixture_root/$label.err" || {
    sed 's/^/  /' "$fixture_root/$label.err" >&2
    echo "production AI config fixture failed for the wrong reason: $label" >&2
    exit 1
  }
}

reset_fixture

bash "$repo_root/scripts/validate-production-ai-config.sh" "$fixture_root" >/dev/null

reset_fixture
remove_exact_line "$fixture_root/.env.example" "READMATES_AIGEN_PROCESSING_DEADLINE=20m"
expect_contract_failure "missing-processing-deadline" "missing READMATES_AIGEN_PROCESSING_DEADLINE"

reset_fixture
remove_exact_line \
  "$fixture_root/server/src/main/resources/application.yml" \
  "      queue-probe-fixed-delay: \${READMATES_AIGEN_QUEUE_PROBE_FIXED_DELAY:30s}"
expect_contract_failure "missing-application-binding" "application.yml must bind READMATES_AIGEN_QUEUE_PROBE_FIXED_DELAY"

reset_fixture
remove_exact_line \
  "$fixture_root/scripts/sync-config/import-from-prod-env.sh" \
  "  READMATES_AIGEN_RECOVERY_BATCH_SIZE"
expect_contract_failure "missing-import-classification" "bulk config import must classify READMATES_AIGEN_RECOVERY_BATCH_SIZE"

reset_fixture
replace_exact_line \
  "$fixture_root/.env.example" \
  "READMATES_AIGEN_KAFKA_CONSUMER_RETRY_DELAY=5s" \
  "READMATES_AIGEN_KAFKA_CONSUMER_RETRY_DELAY=5"
expect_contract_failure "malformed-retry-unit" "READMATES_AIGEN_KAFKA_CONSUMER_RETRY_DELAY"

reset_fixture
replace_exact_line \
  "$fixture_root/.env.example" \
  "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS=5000" \
  "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS=499"
expect_contract_failure \
  "repair-maximum-below-batch" \
  "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS must be at least READMATES_AIGEN_RECOVERY_INDEX_REPAIR_BATCH_SIZE"

reset_fixture
replace_exact_line \
  "$fixture_root/.env.example" \
  "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS=5000" \
  "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS=50001"
expect_contract_failure \
  "repair-maximum-above-ceiling" \
  "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS must be at most 50000"

reset_fixture
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
