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
#   7. Grounded hashes remain metadata-only and terminal cleanup removes sensitive fields.
#   8. Kafka job messages remain content-free routing metadata.
#   9. AI audit/receipt schemas remain aggregate/metadata-only.
#  10. Production logs do not interpolate request or generation content objects.
#  11. Spring AI prompt/completion/error/tool content observations remain disabled.
#  12. AI logs/advisors never receive content-bearing objects or raw throwables.
#  13. AI tracing code never uses baggage or member/session/club identity.
#  14. Provider observation keys stay within the metric/span allowlists.
#  15. Kafka payload/header changes cannot add content or identity metadata.
#
# Exit 0 = all PII invariants hold; non-zero = at least one regression found.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Each check returns 0 on pass, 1 on fail. They never abort the whole script;
# main aggregates so the operator sees every failing invariant in one run.

detect_raw_throwable_logging() {
  perl -0777 -ne '
    my $source = $_;
    my %throwables;
    while ($source =~ /\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z0-9_.]*(?:Exception|Throwable|Error)\b/g) {
      $throwables{$1} = 1;
    }
    while ($source =~ /\b(?:log|logger)\.(?:trace|debug|info|warn|error)\s*\((.*?)\)\s*/sg) {
      my $arguments = $1;
      for my $name (keys %throwables) {
        if ($arguments =~ /\b\Q$name\E\.(?:message|localizedMessage|cause|stackTrace|toString)\b/ ||
            $arguments =~ /\$\{?\Q$name\E\b/ ||
            $arguments =~ /(?:^|,)\s*\Q$name\E\s*(?:,|$)/s) {
          print "$name\n";
        }
      }
    }
  ' | grep -q .
}

detect_dynamic_observation_key() {
  rg -U -q '(?:lowCardinalityKeyValue|highCardinalityKeyValue|addLowCardinalityKeyValue|addHighCardinalityKeyValue)\(\s*[^\"]' -
}

detect_kafka_header_api() {
  rg -q '(?:setHeader[A-Za-z]+|addHeader|copyHeaders|copyHeadersIfAbsent|RecordHeader|headers?(?:\(\))?\.add)\s*\(' -
}

detect_trace_privacy_violation() {
  rg -q -i \
    '\b(?:baggage|BaggageField)\b|(?:lowCardinalityKeyValue|highCardinalityKeyValue|addLowCardinalityKeyValue|addHighCardinalityKeyValue|span\.tag|setAttribute)\(\s*\"(?:session(?:[-_]?id)?|club(?:[-_]?(?:id|slug))?|host(?:[-_]?user)?[-_]?id|user[-_]?id|actor[-_]?id|email(?:[-_]?address)?)\"|(?:span\.tag|setAttribute)\(\s*[^\"]' -
}

check0_guard_self_test_fixtures() {
  local unsafe_message safe_message unsafe_column unsafe_flag unsafe_log unsafe_trace unsafe_header unsafe_throwable unsafe_baggage
  unsafe_message=$'data class AiGenerationJobMessage(\n  val jobId: UUID,\n  val transcript: String,\n)'
  safe_message=$'data class AiGenerationJobMessage(\n  val jobId: UUID,\n  val model: String,\n)'
  unsafe_column='ALTER TABLE ai_generation_commit_receipts ADD COLUMN evidence_text TEXT;'
  unsafe_flag='log-prompt: true'
  unsafe_log='log.error("provider response={}", response, failure)'
  unsafe_trace=$'observation.lowCardinalityKeyValue(\n  JOB_ID_KEY,\n  jobId.toString(),\n)'
  unsafe_header='builder.addHeader("sessionId", command.sessionId)'
  unsafe_throwable='fun failed(err: RuntimeException) { log.error("AI failed", err) }'
  unsafe_baggage='class Telemetry { val field = BaggageField.create("sessionId") }'
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
  if ! printf '%s\n' "$unsafe_flag" | grep -Eq '(log-prompt|log-completion|include-error-logging|include-content):[[:space:]]*true'; then
    echo "FAIL [check0]: unsafe Spring AI observation flag self-test fixture was not detected" >&2
    return 1
  fi
  if ! printf '%s\n' "$unsafe_log" | grep -Eiq '(log|logger)\.(trace|debug|info|warn|error).*\b(prompt|request|response|content|transcript|evidence|instructions)\b'; then
    echo "FAIL [check0]: unsafe content-log self-test fixture was not detected" >&2
    return 1
  fi
  if ! printf '%s\n' "$unsafe_throwable" | detect_raw_throwable_logging; then
    echo "FAIL [check0]: raw throwable logging self-test fixture was not detected" >&2
    return 1
  fi
  if ! printf '%s\n' "$unsafe_trace" | detect_dynamic_observation_key; then
    echo "FAIL [check0]: dynamic observation-key self-test fixture was not detected" >&2
    return 1
  fi
  if ! printf '%s\n' "$unsafe_header" | detect_kafka_header_api; then
    echo "FAIL [check0]: alternate Kafka header API self-test fixture was not detected" >&2
    return 1
  fi
  if ! printf '%s\n' "$unsafe_baggage" | detect_trace_privacy_violation; then
    echo "FAIL [check0]: baggage/trace identity self-test fixture was not detected" >&2
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
  tests=server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGroundedAiGenerationJobStoreTest.kt
  for suffix in transcript turns result evidence; do
    if ! grep -q "private fun ${suffix}Key" "$adapter"; then
      echo "FAIL [check6]: missing $suffix payload key boundary" >&2
      return 1
    fi
  done
  if ! grep -q 'payloadSuffixes = listOf("transcript", "turns", "result", "evidence")' "$tests" || \
     ! grep -q 'all four grounded payloads share six hour ttl and cleanup removes each' "$tests"; then
    echo "FAIL [check6]: missing four-payload TTL/delete regression coverage" >&2
    return 1
  fi
  if ! grep -q "DEL', KEYS\[2\], KEYS\[3\], KEYS\[4\], KEYS\[5\]" \
    server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisScripts.kt; then
    echo "FAIL [check6]: terminal cleanup no longer deletes all four payload keys" >&2
    return 1
  fi
  return 0
}

check7_grounded_hash_boundary() {
  local codec legacy_cleanup grounded_cleanup selector_pattern
  codec=server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisRecordCodec.kt
  legacy_cleanup=server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/AiGenerationRedisScripts.kt
  grounded_cleanup=server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/GroundedAiGenerationRedisScripts.kt
  selector_pattern='AiGeneration'"PipelineMode|pipeline"'Mode'
  if grep -qE "$selector_pattern" "$codec"; then
    echo "FAIL [check7]: removed legacy pipeline selector returned to the Redis codec" >&2
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
  hits=$(rg -n -U -i \
    '(?:log|logger)\.(?:trace|debug|info|warn|error)\([^\"]*\"[^\"]*\"\s*,[\s\S]{0,500}?\b(?:prompt|request|response|content|transcript|turns?|evidence|draft|instructions|schema|completion)\b' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    echo "FAIL [check10]: AI production log may interpolate content-bearing objects:" >&2
    echo "$hits" >&2
    return 1
  fi
  return 0
}

check11_spring_ai_content_observation_disabled() {
  local config unsafe
  config=server/src/main/resources/application.yml
  unsafe=$(grep -nHE '(log-prompt|log-completion|include-error-logging|include-content):[[:space:]]*true' \
    server/src/main/resources/application*.yml 2>/dev/null || true)
  if [[ -n "$unsafe" ]]; then
    echo "FAIL [check11]: Spring AI content/error observation was enabled:" >&2
    echo "$unsafe" >&2
    return 1
  fi
  if [[ "$(grep -c 'log-prompt:[[:space:]]*false' "$config" || true)" -lt 2 ]] || \
     [[ "$(grep -c 'log-completion:[[:space:]]*false' "$config" || true)" -lt 2 ]] || \
     ! grep -q 'include-error-logging:[[:space:]]*false' "$config" || \
     ! grep -q 'include-content:[[:space:]]*false' "$config"; then
    echo "FAIL [check11]: required Spring AI content/privacy flags are not explicitly false" >&2
    return 1
  fi
  return 0
}

check12_no_content_advisor_or_raw_throwable_logging() {
  local content_hits throwable_hits advisor_hits
  content_hits=$(rg -n -U -i \
    '(?:log|logger)\.(?:trace|debug|info|warn|error)\([^\"]*\"[^\"]*\"\s*,[\s\S]{0,500}?\b(?:prompt|request|response|content|transcript|turns?|evidence|draft|instructions|schema|completion)\b' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  throwable_hits=""
  while IFS= read -r source_file; do
    if detect_raw_throwable_logging < "$source_file"; then
      throwable_hits+="${source_file}"$'\n'
    fi
  done < <(find server/src/main/kotlin/com/readmates/aigen -type f -name '*.kt' -print)
  advisor_hits=$(rg -n -i \
    '(SimpleLoggerAdvisor|LoggingAdvisor|PromptChatMemoryAdvisor|\.advisors?\([^)]*(prompt|request|response|content))' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  if [[ -n "$content_hits$throwable_hits$advisor_hits" ]]; then
    echo "FAIL [check12]: AI logging/advisor path can receive content or a raw throwable:" >&2
    printf '%s\n%s\n%s\n' "$content_hits" "$throwable_hits" "$advisor_hits" >&2
    return 1
  fi
  return 0
}

check13_trace_identity_and_baggage_absent() {
  local hits source_file
  hits=""
  while IFS= read -r source_file; do
    if detect_trace_privacy_violation < "$source_file"; then
      hits+="${source_file}"$'\n'
    fi
  done < <(find server/src/main/kotlin/com/readmates/aigen -type f -name '*.kt' -print)
  if [[ -n "$hits" ]]; then
    echo "FAIL [check13]: AI trace/observation code contains baggage or business identity:" >&2
    echo "$hits" >&2
    return 1
  fi
  return 0
}

check14_observation_attribute_allowlist() {
  local adapter source_root low high forbidden_low forbidden_high dynamic required unexpected_sources
  adapter=server/src/main/kotlin/com/readmates/aigen/adapter/out/observability/MicrometerAiProviderObservationAdapter.kt
  source_root=server/src/main/kotlin/com/readmates/aigen
  if [[ ! -f "$adapter" ]]; then
    echo "FAIL [check14]: content-free provider observation adapter is missing" >&2
    return 1
  fi
  dynamic=""
  while IFS= read -r source_file; do
    if detect_dynamic_observation_key < "$source_file"; then
      dynamic+="${source_file}"$'\n'
    fi
  done < <(find "$source_root" -type f -name '*.kt' -print)
  unexpected_sources=$(rg -U -l \
    '(?:lowCardinalityKeyValue|highCardinalityKeyValue|addLowCardinalityKeyValue|addHighCardinalityKeyValue|ObservationConvention|KeyValues?\.of)\s*\(' \
    "$source_root" 2>/dev/null | grep -vF "$adapter" || true)
  low=$(rg -U -o 'lowCardinalityKeyValue\(\s*"[a-zA-Z]+"' "$source_root" || true)
  high=$(rg -U -o 'highCardinalityKeyValue\(\s*"[a-zA-Z]+"' "$source_root" || true)
  forbidden_low=$(printf '%s\n' "$low" | grep -vE '"(provider|model|callMode|outcome|errorCode)"$' || true)
  forbidden_high=$(printf '%s\n' "$high" | grep -vE '"(jobId|attempt)"$' || true)
  required=""
  for key in provider model callMode outcome errorCode; do
    grep -q "\"${key}\"$" <<< "$low" || required+="missing low-cardinality ${key}"$'\n'
  done
  for key in jobId attempt; do
    grep -q "\"${key}\"$" <<< "$high" || required+="missing high-cardinality ${key}"$'\n'
  done
  if [[ -n "$forbidden_low$forbidden_high$dynamic$required$unexpected_sources" ]]; then
    echo "FAIL [check14]: provider observation attribute escaped its bounded allowlist:" >&2
    printf '%s\n%s\n%s\n%s\n%s\n' \
      "$forbidden_low" "$forbidden_high" "$dynamic" "$required" "$unexpected_sources" >&2
    return 1
  fi
  return 0
}

check15_kafka_payload_and_header_allowlist() {
  local message fields unexpected_fields header_calls unexpected_headers producer kafka_constants
  message=server/src/main/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobMessage.kt
  fields=$(sed -n '/data class AiGenerationJobMessage(/,/^)/p' "$message" | sed -nE 's/.*val ([a-zA-Z0-9_]+):.*/\1/p')
  unexpected_fields=$(printf '%s\n' "$fields" | grep -vE '^(jobId|sessionId|clubId|hostUserId|provider|model|kind)$' || true)
  header_calls=$(rg -n '(?:setHeader[A-Za-z]*|addHeader|copyHeaders|copyHeadersIfAbsent|RecordHeader|headers?(?:\(\))?\.add)\s*\(' \
    server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null || true)
  unexpected_headers=$(printf '%s\n' "$header_calls" | \
    grep -vE 'KafkaHeaders\.(TOPIC|KEY)|"readmates-aigen-(job-id|kind)"' || true)
  while IFS= read -r source_file; do
    if detect_kafka_header_api < "$source_file"; then
      unexpected_headers+="${source_file}: alternate Kafka header API"$'\n'
    fi
  done < <(find server/src/main/kotlin/com/readmates/aigen -type f -name '*.kt' -print)
  kafka_constants=$(rg -n 'KafkaHeaders\.[A-Z_]+' server/src/main/kotlin/com/readmates/aigen/ 2>/dev/null | \
    grep -vE 'KafkaHeaders\.(TOPIC|KEY)\b' || true)
  [[ -n "$kafka_constants" ]] && unexpected_headers+="${kafka_constants}"$'\n'
  producer=server/src/main/kotlin/com/readmates/aigen/adapter/out/messaging/AiGenerationJobProducer.kt
  if [[ "$(printf '%s\n' "$header_calls" | grep -c . || true)" -ne 4 ]] || \
     ! rg -U -q '\.setHeader\(KafkaHeaders\.TOPIC,\s*properties\.topicJobs\)' "$producer" || \
     ! rg -U -q '\.setHeader\(KafkaHeaders\.KEY,\s*command\.clubId\.toString\(\)\)' "$producer" || \
     ! grep -q '\.setHeader("readmates-aigen-job-id", jobId.toString())' "$producer" || \
     ! grep -q '\.setHeader("readmates-aigen-kind", command.kind.name)' "$producer"; then
    unexpected_headers="${unexpected_headers}"$'\nKafka header baseline changed; only existing topic, partition key, random job ID, and kind headers are allowed'
  fi
  if [[ -n "$unexpected_fields$unexpected_headers" ]]; then
    echo "FAIL [check15]: Kafka payload/header gained content or identity metadata:" >&2
    printf '%s\n%s\n' "$unexpected_fields" "$unexpected_headers" >&2
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
  check11_spring_ai_content_observation_disabled || rc=1
  check12_no_content_advisor_or_raw_throwable_logging || rc=1
  check13_trace_identity_and_baggage_absent || rc=1
  check14_observation_attribute_allowlist || rc=1
  check15_kafka_payload_and_header_allowlist || rc=1
  if [[ "$rc" -eq 0 ]]; then
    echo "aigen-pii-check: PASS (15 invariants + self-test fixtures; content-free logs, traces, metrics, and Kafka covered)"
  else
    echo "aigen-pii-check: FAIL — see lines above (spec §11)" >&2
  fi
  exit "$rc"
}

main "$@"
