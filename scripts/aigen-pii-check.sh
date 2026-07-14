#!/usr/bin/env bash
# scripts/aigen-pii-check.sh — PII regression check for aigen
# Spec: docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md §11
# Plan: docs/superpowers/plans/2026-05-16-readmates-in-app-ai-session-generation-implementation-plan.md task 6.4
# Runbook: docs/operations/runbooks/ai-session-generation.md#pii-regression
#
# Run by CI on every PR (.github/workflows/ci.yml :: scripts job).
# Operators can also run manually: `bash scripts/aigen-pii-check.sh`.
#
# Invariants enforced (spec §5.7, §11.1, current Redis handoff design):
#   1. Durable transcript-body-like column or property names MUST NOT exist in
#      server/src/main/ Kotlin sources.
#   2. Kafka producers MUST NOT send arguments named `transcript` (we forward
#      job-routing metadata only, not transcript bodies, on the job topic).
#   3. Micrometer .tag(...) keys in aigen production code MUST be one of the
#      §11.1 allowlist: provider, model, kind, status, reason, direction.
#   4. Flyway migrations MUST NOT introduce columns with transcript-body names.
#   5. The raw transcript Redis key is allowed only inside the job-store handoff
#      boundary and must remain TTL/delete covered by integration tests.
#   6. All four short-lived Redis payload keys stay inside the Redis adapter boundary.
#   7. Grounded hashes remain metadata-only and terminal cleanup removes legacy fields.
#   8. Kafka job messages remain content-free routing metadata.
#   9. AI audit/receipt schemas remain aggregate/metadata-only.
#  10. Production logs do not interpolate request or generation content objects.
#
# Exit 0 = all PII invariants hold; non-zero = at least one regression found.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Each check returns 0 on pass, 1 on fail. They never abort the whole script;
# main aggregates so the operator sees every failing invariant in one run.

check0_guard_self_test_fixtures() {
  local unsafe_message safe_message unsafe_column
  unsafe_message=$'data class AiGenerationJobMessage(\n  val jobId: UUID,\n  val transcript: String,\n)'
  safe_message=$'data class AiGenerationJobMessage(\n  val jobId: UUID,\n  val model: String,\n)'
  unsafe_column='ALTER TABLE ai_generation_commit_receipts ADD COLUMN evidence_text TEXT;'
  if ! printf '%s\n' "$unsafe_message" | grep -Eiq '\b(transcript|turns?|speaker|result|evidence|excerpt|prompt|instructions|name)\b'; then
    echo "FAIL [check0]: Kafka unsafe-field self-test fixture was not detected" >&2
    return 1
  fi
  if printf '%s\n' "$safe_message" | grep -Eiq '\b(transcript|turns?|speaker|result|evidence|excerpt|prompt|instructions|name)\b'; then
    echo "FAIL [check0]: Kafka safe-field self-test fixture was rejected" >&2
    return 1
  fi
  if ! printf '%s\n' "$unsafe_column" | grep -Eiq '\b(transcript|turns?|result|evidence|excerpt|prompt|instructions|member_name|speaker_name|body|text)\b'; then
    echo "FAIL [check0]: migration unsafe-column self-test fixture was not detected" >&2
    return 1
  fi
  return 0
}

check1_durable_transcript_body_columns() {
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
    echo "FAIL [check1]: durable transcript-body column/property names in production Kotlin:" >&2
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

check5_redis_transcript_scope() {
  local matches unexpected
  matches=$(grep -RIn --include='*.kt' -E \
    '(aigen:job:.*:transcript|transcriptKey)' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  unexpected=$(printf '%s\n' "$matches" | \
    grep -vE 'RedisAiGenerationJobStore\.kt|AiGenerationJobStore\.kt|AiGenerationJobQueue\.kt|AiGenerationJobMessage\.kt' || true)
  if [[ -n "$unexpected" ]]; then
    echo "FAIL [check5]: raw transcript Redis key used outside the job-store handoff boundary:" >&2
    echo "$unexpected" >&2
    return 1
  fi
  return 0
}

check6_grounded_payload_scope_and_lifecycle() {
  local production_hits unexpected adapter tests
  production_hits=$(grep -RIn --include='*.kt' -E 'aigen:job:.*:(transcript|turns|result|evidence)' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  unexpected=$(printf '%s\n' "$production_hits" | grep -v 'RedisAiGenerationJobStore.kt' || true)
  if [[ -n "$unexpected" ]]; then
    echo "FAIL [check6]: grounded Redis payload literal escaped the Redis adapter:" >&2
    echo "$unexpected" >&2
    return 1
  fi
  adapter=server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt
  tests=server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt
  for suffix in transcript turns result evidence; do
    if ! grep -q "private fun ${suffix}Key" "$adapter"; then
      echo "FAIL [check6]: missing $suffix payload key boundary" >&2
      return 1
    fi
    if ! grep -q "aigen:job:.*:$suffix" "$tests"; then
      echo "FAIL [check6]: missing $suffix TTL/delete regression coverage" >&2
      return 1
    fi
  done
  if ! grep -q "DEL', KEYS\[2\], KEYS\[3\], KEYS\[4\], KEYS\[5\]" \
    server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisScripts.kt; then
    echo "FAIL [check6]: terminal cleanup no longer deletes all four payload keys" >&2
    return 1
  fi
  return 0
}

check7_grounded_hash_boundary() {
  local codec legacy_cleanup grounded_cleanup
  codec=server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisRecordCodec.kt
  legacy_cleanup=server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisScripts.kt
  grounded_cleanup=server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/GroundedAiGenerationRedisScripts.kt
  if ! grep -q 'pipelineMode == AiGenerationPipelineMode.LEGACY' "$codec"; then
    echo "FAIL [check7]: sensitive compatibility hash fields are not LEGACY-gated" >&2
    return 1
  fi
  if ! grep -q "HDEL'.*'sessionMeta'.*'instructions'" "$legacy_cleanup" || \
     ! grep -q "HDEL'.*'sessionMeta'.*'instructions'" "$grounded_cleanup"; then
    echo "FAIL [check7]: terminal cleanup does not remove legacy sensitive hash fields" >&2
    return 1
  fi
  return 0
}

check8_kafka_message_content_free() {
  local message fields forbidden
  message=server/src/main/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobMessage.kt
  fields=$(sed -n '/data class AiGenerationJobMessage(/,/^)/p' "$message")
  forbidden=$(printf '%s\n' "$fields" | grep -Ei '\b(transcript|turns?|speaker|result|evidence|excerpt|prompt|instructions|name)\b' || true)
  if [[ -n "$forbidden" ]]; then
    echo "FAIL [check8]: Kafka job message gained a content-bearing field:" >&2
    echo "$forbidden" >&2
    return 1
  fi
  return 0
}

check9_content_free_mysql_surfaces() {
  local forbidden
  forbidden=$(grep -RIn -E '\b(transcript|turns?|result|evidence|excerpt|prompt|instructions|member_name|speaker_name|body|text)\b' \
    server/src/main/resources/db/mysql/migration/V30__create_ai_generation_audit_log.sql \
    server/src/main/resources/db/mysql/migration/V37__grounded_ai_generation.sql 2>/dev/null || true)
  if [[ -n "$forbidden" ]]; then
    echo "FAIL [check9]: AI audit/receipt migration gained a content column:" >&2
    echo "$forbidden" >&2
    return 1
  fi
  return 0
}

check10_no_content_object_logging() {
  local hits
  hits=$(grep -RIn --include='*.kt' -Ei \
    'logger\.(trace|debug|info|warn|error).*\b(request|response|transcript|turns?|evidence|draft|instructions)\b' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    echo "FAIL [check10]: AI production log may interpolate content-bearing objects:" >&2
    echo "$hits" >&2
    return 1
  fi
  return 0
}

main() {
  local rc=0
  check0_guard_self_test_fixtures || rc=1
  check1_durable_transcript_body_columns || rc=1
  check2_kafka_producer_transcript_arg || rc=1
  check3_metric_tag_allowlist || rc=1
  check4_flyway_columns || rc=1
  check5_redis_transcript_scope || rc=1
  check6_grounded_payload_scope_and_lifecycle || rc=1
  check7_grounded_hash_boundary || rc=1
  check8_kafka_message_content_free || rc=1
  check9_content_free_mysql_surfaces || rc=1
  check10_no_content_object_logging || rc=1
  if [[ "$rc" -eq 0 ]]; then
    echo "aigen-pii-check: PASS (10 invariants + self-test fixtures; transcript/turns/result/evidence lifecycle covered)"
  else
    echo "aigen-pii-check: FAIL — see lines above (spec §11)" >&2
  fi
  exit "$rc"
}

main "$@"
