#!/usr/bin/env bash
# scripts/aigen-pii-check.sh — PII regression check for aigen
# Spec: docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md §11
# Plan: docs/superpowers/plans/2026-05-16-readmates-in-app-ai-session-generation-implementation-plan.md task 6.4
# Runbook: docs/superpowers/runbooks/2026-05-16-readmates-aigen-operations.md#pii-regression (created by task 6.5)
#
# Run by CI on every PR (.github/workflows/ci.yml :: scripts job).
# Operators can also run manually: `bash scripts/aigen-pii-check.sh`.
#
# Invariants enforced (spec §5.7, §11.1):
#   1. transcript-body-like column or property names MUST NOT exist in
#      server/src/main/ Kotlin sources (we never persist raw transcripts).
#   2. Kafka producers MUST NOT send arguments named `transcript` (we forward
#      object-storage keys, not transcript bodies, on the job topic).
#   3. Micrometer .tag(...) keys in aigen production code MUST be one of the
#      §11.1 allowlist: provider, model, kind, status, reason, direction.
#   4. Flyway migrations MUST NOT introduce columns with transcript-body names.
#
# Exit 0 = all PII invariants hold; non-zero = at least one regression found.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Each check returns 0 on pass, 1 on fail. They never abort the whole script;
# main aggregates so the operator sees every failing invariant in one run.

check1_transcript_body_columns() {
  local matches
  matches=$(grep -RIn --include='*.kt' -E \
    '(transcript_text|transcript_body|raw_transcript|raw_text)' \
    server/src/main/ 2>/dev/null || true)
  # Strip lines that are pure comments (// or * or #) — the script and audit-log
  # KDoc/Markdown reference these names while *documenting* the prohibition.
  if [[ -n "$matches" ]]; then
    matches=$(printf '%s\n' "$matches" | \
      grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|#)' || true)
  fi
  if [[ -n "$matches" ]]; then
    echo "FAIL [check1]: transcript-body column/property names in production Kotlin:" >&2
    echo "$matches" >&2
    return 1
  fi
  return 0
}

check2_kafka_producer_transcript_arg() {
  local matches
  matches=$(grep -RIn --include='*.kt' -E \
    '(producer|kafkaTemplate|jobProducer)\.send\([^)]*transcript' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    echo "FAIL [check2]: Kafka producer sends transcript-named argument:" >&2
    echo "$matches" >&2
    return 1
  fi
  return 0
}

check3_metric_tag_allowlist() {
  # Spec §11.1: only provider, model, kind, status, reason, direction are
  # allowed as Micrometer tag keys in aigen production code.
  local hits
  hits=$(grep -RIn --include='*.kt' -oE '\.tag\("[a-zA-Z_]+"' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    hits=$(printf '%s\n' "$hits" | \
      grep -vE '\.tag\("(provider|model|kind|status|reason|direction)"$' || true)
  fi
  if [[ -n "$hits" ]]; then
    echo "FAIL [check3]: forbidden Micrometer tag key in aigen production code" >&2
    echo "        (allowlist: provider/model/kind/status/reason/direction):" >&2
    echo "$hits" >&2
    return 1
  fi
  return 0
}

check4_flyway_columns() {
  local hits
  hits=$(grep -RIn -E \
    '(transcript_text|transcript_body|raw_transcript|raw_text)' \
    server/src/main/resources/db/mysql/migration/ 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    echo "FAIL [check4]: forbidden column name in Flyway migration:" >&2
    echo "$hits" >&2
    return 1
  fi
  return 0
}

main() {
  local rc=0
  check1_transcript_body_columns || rc=1
  check2_kafka_producer_transcript_arg || rc=1
  check3_metric_tag_allowlist || rc=1
  check4_flyway_columns || rc=1
  if [[ "$rc" -eq 0 ]]; then
    echo "aigen-pii-check: PASS (4 invariants)"
  else
    echo "aigen-pii-check: FAIL — see lines above (spec §11)" >&2
  fi
  exit "$rc"
}

main "$@"
