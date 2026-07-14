#!/usr/bin/env bash
# scripts/aigen-smoke-openai.sh — manual smoke for OpenAI provider end-to-end
# Spec: docs/superpowers/specs/2026-07-14-readmates-grounded-whole-transcript-ai-session-generation-design.md
# Plan: docs/superpowers/plans/2026-07-14-readmates-grounded-whole-transcript-ai-session-generation.md task 14
#
# Required env:
#   READMATES_AIGEN_OPENAI_API_KEY  — OpenAI API key (live billing implications)
#   READMATES_SMOKE_BASE_URL        — defaults https://readmates.pages.dev
#   READMATES_SMOKE_SESSION_ID      — session UUID owned by an active host
#   READMATES_SMOKE_HOST_COOKIE     — readmates.sid value for the host (browser DevTools)
#
# The script creates its own public-safe supported TXT fixture. The target
# session must belong to a dedicated smoke club with one ACTIVE membership
# whose display name is exactly `공개 회원 A`; never substitute private data.
#
# Note: requires server-side `readmates.aigen.enabled=true`, `enabled-providers`
# including OPENAI, and the model name set below to be in the YAML pricing table.
# OpenAI model IDs use the provider API aliases directly (for example, gpt-5.4-mini).
#
# Live execution requires separate operator authorization and a retention-
# reviewed environment. Normal CI validates syntax only and never runs this.
set -euo pipefail

BASE_URL="${READMATES_SMOKE_BASE_URL:-https://readmates.pages.dev}"
SESSION_ID="${READMATES_SMOKE_SESSION_ID:?READMATES_SMOKE_SESSION_ID required}"
COOKIE="${READMATES_SMOKE_HOST_COOKIE:?READMATES_SMOKE_HOST_COOKIE required (readmates.sid value)}"
MODEL="${READMATES_SMOKE_OPENAI_MODEL:-gpt-5.4-mini}"

SMOKE_DIR=$(mktemp -d)
TRANSCRIPT="$SMOKE_DIR/readmates-public-safe-smoke.txt"
cleanup_smoke_fixture() {
  rm -f "$TRANSCRIPT"
  rmdir "$SMOKE_DIR" 2>/dev/null || true
}
trap cleanup_smoke_fixture EXIT
printf '%s\n' \
  '공개 안전 합성 독서 모임' \
  '2026. 7. 14. 오후 7:00 · 1분 0초' \
  '공개 회원 A' \
  '' \
  '공개 회원 A 00:00' \
  '이 문장은 공개 안전 합성 AI 세션 smoke 입력입니다.' \
  '' \
  '공개 회원 A 00:25' \
  '첫 발언의 핵심을 다시 확인합니다.' >"$TRANSCRIPT"

if [[ -z "${READMATES_AIGEN_OPENAI_API_KEY:-}" ]]; then
  echo "READMATES_AIGEN_OPENAI_API_KEY not set in environment of the *server* process; the smoke will 503 or fail at LLM call. Ensure the server has the key before running." >&2
fi

api() {
  local method=$1
  local path=$2
  shift 2
  curl -fsS --max-time 60 -X "$method" \
    -b "readmates.sid=$COOKIE" \
    -H "Origin: $BASE_URL" -H "Referer: $BASE_URL/" \
    "$@" \
    "$BASE_URL/api/bff$path"
}

START_PATH="/api/host/sessions/$SESSION_ID/ai-generate/jobs"
echo "→ POST $START_PATH (model=$MODEL)"
BODY_JSON=$(printf '{"model":"%s","instructions":null}' "$MODEL")
RESPONSE=$(curl -fsS --max-time 60 -X POST \
  -b "readmates.sid=$COOKIE" \
  -H "Origin: $BASE_URL" -H "Referer: $BASE_URL/" \
  -F "transcript=@$TRANSCRIPT;type=text/plain" \
  -F "body=$BODY_JSON;type=application/json" \
  "$BASE_URL/api/bff$START_PATH")
echo "  ← $RESPONSE"

JOB_ID=$(python3 -c "import sys,json; print(json.loads(sys.argv[1])['jobId'])" "$RESPONSE")
echo "  jobId=$JOB_ID"

POLL_PATH="/api/host/sessions/$SESSION_ID/ai-generate/jobs/$JOB_ID"
echo "→ polling $POLL_PATH"
for attempt in $(seq 1 60); do
  STATUS_BODY=$(api GET "$POLL_PATH")
  STATUS=$(python3 -c "import sys,json; print(json.loads(sys.argv[1])['status'])" "$STATUS_BODY")
  echo "  attempt=$attempt status=$STATUS"
  case "$STATUS" in
    SUCCEEDED) break;;
    FAILED|CANCELLED)
      echo "  ✗ job ended in $STATUS — body: $STATUS_BODY" >&2
      exit 3
      ;;
  esac
  sleep 3
done

if [[ "$STATUS" != "SUCCEEDED" ]]; then
  echo "Timed out waiting for SUCCEEDED (last status=$STATUS)" >&2
  exit 4
fi

echo "✓ OpenAI smoke completed for jobId=$JOB_ID (model=$MODEL)"
echo "  Commit not exercised — that's the operator's call."
