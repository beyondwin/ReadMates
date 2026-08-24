#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
fixture_root="$repo_root/.tmp/production-ai-config-fixtures"
import_env_fixture=""

cleanup() {
  rm -rf -- "$fixture_root"
  if [ -n "$import_env_fixture" ]; then
    rm -f -- "$import_env_fixture"
  fi
}
trap cleanup EXIT

rm -rf -- "$fixture_root"
mkdir -p \
  "$fixture_root/.github/workflows" \
  "$fixture_root/deploy/oci" \
  "$fixture_root/docs/case-studies" \
  "$fixture_root/docs/operations/runbooks" \
  "$fixture_root/server/src/main/resources" \
  "$fixture_root/bin" \
  "$fixture_root/scripts/sync-config"

reset_fixture() {
  cp "$repo_root/.github/workflows/sync-config.yml" "$fixture_root/.github/workflows/"
  cp "$repo_root/.env.example" "$fixture_root/"
  cp "$repo_root/deploy/oci/compose.yml" "$fixture_root/deploy/oci/"
  cp "$repo_root/deploy/oci/compose.infra.yml" "$fixture_root/deploy/oci/"
  cp "$repo_root/server/src/main/resources/application.yml" "$fixture_root/server/src/main/resources/"
  cp "$repo_root/scripts/sync-config/import-from-prod-env.sh" "$fixture_root/scripts/sync-config/"
  cp "$repo_root/docs/case-studies/04-pii-safe-ai-session-generation.md" "$fixture_root/docs/case-studies/"
  cp "$repo_root/docs/operations/runbooks/secrets-management.md" "$fixture_root/docs/operations/runbooks/"
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

import_env_fixture="$(mktemp -t readmates-config-import-XXXXXX.env)"
printf '%s\n' \
  'READMATES_HOST_LIST_CURSOR_CURRENT_KEY=fixture-cursor-current-material' \
  'READMATES_HOST_LIST_CURSOR_CURRENT_KEY_VERSION=7' \
  'READMATES_HOST_LIST_CURSOR_PREVIOUS_KEY=fixture-cursor-previous-material' \
  'READMATES_HOST_LIST_CURSOR_PREVIOUS_KEY_VERSION=6' \
  'READMATES_MUTATION_IDENTITY_CURRENT_KEY=fixture-mutation-current-material' \
  'READMATES_MUTATION_IDENTITY_CURRENT_KEY_VERSION=9' \
  'READMATES_MUTATION_IDENTITY_PREVIOUS_KEY=fixture-mutation-previous-material' \
  'READMATES_MUTATION_IDENTITY_PREVIOUS_KEY_VERSION=8' \
  > "$import_env_fixture"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [ "$1 $2" = "auth status" ]; then exit 0; fi' \
  'exit 97' \
  > "$fixture_root/bin/gh"
chmod +x "$fixture_root/bin/gh"
PATH="$fixture_root/bin:$PATH" \
  bash "$repo_root/scripts/sync-config/import-from-prod-env.sh" "$import_env_fixture" \
  > "$fixture_root/import-dry-run.out"
for key in \
  READMATES_HOST_LIST_CURSOR_CURRENT_KEY \
  READMATES_HOST_LIST_CURSOR_PREVIOUS_KEY \
  READMATES_MUTATION_IDENTITY_CURRENT_KEY \
  READMATES_MUTATION_IDENTITY_PREVIOUS_KEY; do
  grep -Eq "^DRY   secret[[:space:]]+$key  \(len=[0-9]+\)$" "$fixture_root/import-dry-run.out" || {
    echo "production config import fixture failed to classify secret: $key" >&2
    exit 1
  }
done
for key in \
  READMATES_HOST_LIST_CURSOR_CURRENT_KEY_VERSION \
  READMATES_HOST_LIST_CURSOR_PREVIOUS_KEY_VERSION \
  READMATES_MUTATION_IDENTITY_CURRENT_KEY_VERSION \
  READMATES_MUTATION_IDENTITY_PREVIOUS_KEY_VERSION; do
  grep -Eq "^DRY   variable[[:space:]]+$key  = [0-9]+$" "$fixture_root/import-dry-run.out" || {
    echo "production config import fixture failed to classify variable: $key" >&2
    exit 1
  }
done
if grep -Fq 'fixture-' "$fixture_root/import-dry-run.out"; then
  echo "production config import fixture leaked secret material" >&2
  exit 1
fi
grep -Fq 'Empty values are skipped; this importer never deletes existing GitHub Secrets.' \
  "$fixture_root/import-dry-run.out" || {
  echo "production config import fixture did not disclose non-deleting empty-value behavior" >&2
  exit 1
}

printf '%s\n' \
  'READMATES_HOST_LIST_CURSOR_PREVIOUS_KEY=' \
  'READMATES_MUTATION_IDENTITY_PREVIOUS_KEY=' \
  > "$import_env_fixture"
PATH="$fixture_root/bin:$PATH" \
  bash "$repo_root/scripts/sync-config/import-from-prod-env.sh" "$import_env_fixture" --apply \
  > "$fixture_root/import-empty-previous.out"
for key in \
  READMATES_HOST_LIST_CURSOR_PREVIOUS_KEY \
  READMATES_MUTATION_IDENTITY_PREVIOUS_KEY; do
  grep -Eq "^SKIP  \(empty\)[[:space:]]+$key$" "$fixture_root/import-empty-previous.out" || {
    echo "production config import fixture did not preserve previous secret on empty input: $key" >&2
    exit 1
  }
done

reset_fixture

awk '
  index($0, "gh secret delete READMATES_MUTATION_IDENTITY_PREVIOUS_KEY --repo") == 0 { print }
' "$fixture_root/docs/operations/runbooks/secrets-management.md" \
  > "$fixture_root/docs/operations/runbooks/secrets-management.md.next"
mv \
  "$fixture_root/docs/operations/runbooks/secrets-management.md.next" \
  "$fixture_root/docs/operations/runbooks/secrets-management.md"
expect_contract_failure \
  "missing-exact-previous-secret-deletion" \
  "runbook must document exact deletion for READMATES_MUTATION_IDENTITY_PREVIOUS_KEY"

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
remove_exact_line \
  "$fixture_root/scripts/sync-config/import-from-prod-env.sh" \
  "  READMATES_MUTATION_IDENTITY_CURRENT_KEY"
expect_contract_failure \
  "missing-mutation-identity-import" \
  "bulk config import must classify READMATES_MUTATION_IDENTITY_CURRENT_KEY"

reset_fixture
remove_exact_line \
  "$fixture_root/.github/workflows/sync-config.yml" \
  '      READMATES_HOST_LIST_CURSOR_CURRENT_KEY: ${{ secrets.READMATES_HOST_LIST_CURSOR_CURRENT_KEY }}'
expect_contract_failure \
  "missing-host-list-current-key-workflow" \
  "sync-config must source READMATES_HOST_LIST_CURSOR_CURRENT_KEY as a secret"

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

echo "Production runtime config fixture checks passed"
