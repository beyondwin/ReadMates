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
legacy_enum='AiGenerationPipeline''Mode'
legacy_field='pipeline''Mode'
legacy_mode='LEG''ACY'
grounded_mode='GROUNDED_''WHOLE_TRANSCRIPT'
legacy_selector_pattern="$legacy_env|$legacy_property|$legacy_enum|$legacy_field|\\b$legacy_mode\\b|\\b$grounded_mode\\b"
active_paths=(
  "$workflow"
  "$env_example"
  "$import_script"
  "$app_compose"
  "$infra_compose"
)
for path in \
  "$repo_root/server/src/main" \
  "$repo_root/docs/development" \
  "$repo_root/docs/operations" \
  "$repo_root/docs/case-studies"; do
  if [ -e "$path" ]; then
    active_paths+=("$path")
  fi
done
if rg -n "$legacy_selector_pattern" "${active_paths[@]}"; then
  fail "legacy pipeline selector remains in an active path"
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

read_env_example_value() {
  local key="$1"
  local count
  count="$(awk -F= -v key="$key" '$1 == key { count += 1 } END { print count + 0 }' "$env_example")"
  [ "$count" -eq 1 ] || fail "missing $key from .env.example or found duplicate assignments"
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2) }' "$env_example"
}

duration_milliseconds() {
  local key="$1"
  local value="$2"
  if [[ ! "$value" =~ ^([0-9]+)(ms|s|m|h)$ ]]; then
    fail "$key must use an explicit ms, s, m, or h duration unit"
  fi
  local amount="${BASH_REMATCH[1]}"
  local unit="${BASH_REMATCH[2]}"
  [ "${#amount}" -le 9 ] || fail "$key is outside its approved duration range"
  local numeric_amount=$((10#$amount))
  case "$unit" in
    ms) echo "$numeric_amount" ;;
    s) echo $((numeric_amount * 1000)) ;;
    m) echo $((numeric_amount * 60 * 1000)) ;;
    h) echo $((numeric_amount * 60 * 60 * 1000)) ;;
  esac
}

require_duration_range() {
  local key="$1"
  local value="$2"
  local minimum_milliseconds="$3"
  local maximum_milliseconds="$4"
  local milliseconds
  milliseconds="$(duration_milliseconds "$key" "$value")"
  if [ "$milliseconds" -lt "$minimum_milliseconds" ] || [ "$milliseconds" -gt "$maximum_milliseconds" ]; then
    fail "$key is outside its approved duration range"
  fi
}

require_integer_range() {
  local key="$1"
  local value="$2"
  local minimum="$3"
  local maximum="$4"
  [[ "$value" =~ ^[0-9]+$ ]] || fail "$key must be an integer"
  [ "${#value}" -le 9 ] || fail "$key must be between $minimum and $maximum"
  local numeric_value=$((10#$value))
  if [ "$numeric_value" -lt "$minimum" ] || [ "$numeric_value" -gt "$maximum" ]; then
    fail "$key must be between $minimum and $maximum"
  fi
}

retry_delay="$(read_env_example_value READMATES_AIGEN_KAFKA_CONSUMER_RETRY_DELAY)"
consumer_attempts="$(read_env_example_value READMATES_AIGEN_KAFKA_CONSUMER_MAX_ATTEMPTS)"
processing_deadline="$(read_env_example_value READMATES_AIGEN_PROCESSING_DEADLINE)"
recovery_delay="$(read_env_example_value READMATES_AIGEN_RECOVERY_FIXED_DELAY)"
recovery_batch="$(read_env_example_value READMATES_AIGEN_RECOVERY_BATCH_SIZE)"
repair_batch="$(read_env_example_value READMATES_AIGEN_RECOVERY_INDEX_REPAIR_BATCH_SIZE)"
repair_maximum="$(read_env_example_value READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS)"
probe_delay="$(read_env_example_value READMATES_AIGEN_QUEUE_PROBE_FIXED_DELAY)"

require_duration_range READMATES_AIGEN_KAFKA_CONSUMER_RETRY_DELAY "$retry_delay" 1 60000
require_integer_range READMATES_AIGEN_KAFKA_CONSUMER_MAX_ATTEMPTS "$consumer_attempts" 1 100
require_duration_range READMATES_AIGEN_PROCESSING_DEADLINE "$processing_deadline" 60000 7200000
require_duration_range READMATES_AIGEN_RECOVERY_FIXED_DELAY "$recovery_delay" 1000 600000
require_integer_range READMATES_AIGEN_RECOVERY_BATCH_SIZE "$recovery_batch" 1 500
require_integer_range READMATES_AIGEN_RECOVERY_INDEX_REPAIR_BATCH_SIZE "$repair_batch" 1 5000
[[ "$repair_maximum" =~ ^[0-9]+$ ]] ||
  fail "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS must be an integer"
[ "${#repair_maximum}" -le 9 ] ||
  fail "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS must be at most 50000"
repair_maximum_number=$((10#$repair_maximum))
repair_batch_number=$((10#$repair_batch))
[ "$repair_maximum_number" -ge 1 ] ||
  fail "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS must be positive"
[ "$repair_maximum_number" -le 50000 ] ||
  fail "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS must be at most 50000"
[ "$repair_maximum_number" -ge "$repair_batch_number" ] ||
  fail "READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS must be at least READMATES_AIGEN_RECOVERY_INDEX_REPAIR_BATCH_SIZE"
require_duration_range READMATES_AIGEN_QUEUE_PROBE_FIXED_DELAY "$probe_delay" 1000 600000

require_config_surface() {
  local key="$1"
  local expected="$2"
  local application_fragment="$3"
  local actual
  actual="$(read_env_example_value "$key")"
  [ "$actual" = "$expected" ] || fail "$key must use the approved default $expected"
  grep -Fq "$application_fragment" "$repo_root/server/src/main/resources/application.yml" ||
    fail "application.yml must bind $key with default $expected"
  grep -Fq "$key: \${{ vars.$key || '$expected' }}" "$workflow" ||
    fail "sync-config must source $key with default $expected"
  grep -Fq "printf '$key=%s\\n' \"\$$key\"" "$workflow" ||
    fail "sync-config must render $key"
  grep -Eq "^[[:space:]]{2}$key$" "$import_script" ||
    fail "bulk config import must classify $key"
}

require_config_surface \
  READMATES_AIGEN_KAFKA_CONSUMER_RETRY_DELAY 5s \
  "consumer-retry-delay: \${READMATES_AIGEN_KAFKA_CONSUMER_RETRY_DELAY:5s}"
require_config_surface \
  READMATES_AIGEN_KAFKA_CONSUMER_MAX_ATTEMPTS 10 \
  "consumer-max-attempts: \${READMATES_AIGEN_KAFKA_CONSUMER_MAX_ATTEMPTS:10}"
require_config_surface \
  READMATES_AIGEN_PROCESSING_DEADLINE 20m \
  "processing-deadline: \${READMATES_AIGEN_PROCESSING_DEADLINE:20m}"
require_config_surface \
  READMATES_AIGEN_RECOVERY_FIXED_DELAY 1m \
  "recovery-fixed-delay: \${READMATES_AIGEN_RECOVERY_FIXED_DELAY:1m}"
require_config_surface \
  READMATES_AIGEN_RECOVERY_BATCH_SIZE 50 \
  "recovery-batch-size: \${READMATES_AIGEN_RECOVERY_BATCH_SIZE:50}"
require_config_surface \
  READMATES_AIGEN_RECOVERY_INDEX_REPAIR_BATCH_SIZE 500 \
  "recovery-index-repair-batch-size: \${READMATES_AIGEN_RECOVERY_INDEX_REPAIR_BATCH_SIZE:500}"
require_config_surface \
  READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS 5000 \
  "recovery-index-repair-max-members: \${READMATES_AIGEN_RECOVERY_INDEX_REPAIR_MAX_MEMBERS:5000}"
require_config_surface \
  READMATES_AIGEN_QUEUE_PROBE_FIXED_DELAY 30s \
  "queue-probe-fixed-delay: \${READMATES_AIGEN_QUEUE_PROBE_FIXED_DELAY:30s}"

echo "Production AI config contract OK"
