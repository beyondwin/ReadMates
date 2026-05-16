#!/usr/bin/env bash
# scripts/aigen-smoke-gemini.sh — manual smoke for Gemini provider end-to-end
# Spec: docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md §7
# Plan: docs/superpowers/plans/2026-05-16-readmates-in-app-ai-session-generation-implementation-plan.md task 5.4
#
# Required env:
#   READMATES_AIGEN_GEMINI_API_KEY  — Gemini API key (live billing implications)
#   READMATES_SMOKE_BASE_URL        — defaults https://readmates.pages.dev
#   READMATES_SMOKE_SESSION_ID      — session UUID owned by an active host
#   READMATES_SMOKE_HOST_COOKIE     — readmates.sid value for the host (browser DevTools)
#   READMATES_SMOKE_TRANSCRIPT      — path to a .txt transcript (≤ 1 MB)
#
# Retention contract (spec §5.7): the server-side GeminiApiClient MUST send
# `disablePromptLogging=true` on every request so transcripts are not retained
# by Google for model training. Verify the server build before exercising live.
#
# Note: requires server-side `readmates.aigen.enabled=true`, `enabled-providers`
# including GEMINI, and the model name below to be present in the YAML pricing
# table (task 5.1 keys: `gemini-2-5-pro`, `gemini-2-5-flash`).
#
# OPERATOR CAVEAT: as of task_5_3 the live Gemini SDK call throws
# NotImplementedError — the provider adapter is wired but the SDK invocation
# has not landed yet. This smoke script will therefore fail at the LLM call
# until the live wiring is merged. Run it post-merge of the live-call task.
#
# Live execution is currently waived (orchestrator directive: missing
# READMATES_AIGEN_GEMINI_API_KEY in headless env); this script is the manual
# operator runbook for when the key is available post-merge.
set -euo pipefail

BASE_URL="${READMATES_SMOKE_BASE_URL:-https://readmates.pages.dev}"
SESSION_ID="${READMATES_SMOKE_SESSION_ID:?READMATES_SMOKE_SESSION_ID required}"
COOKIE="${READMATES_SMOKE_HOST_COOKIE:?READMATES_SMOKE_HOST_COOKIE required (readmates.sid value)}"
TRANSCRIPT="${READMATES_SMOKE_TRANSCRIPT:?READMATES_SMOKE_TRANSCRIPT required (path to .txt)}"
MODEL="${READMATES_SMOKE_GEMINI_MODEL:-gemini-2-5-pro}"

if [[ ! -f "$TRANSCRIPT" ]]; then
  echo "Transcript file not found at $TRANSCRIPT" >&2
  exit 2
fi
size=$(wc -c <"$TRANSCRIPT")
if (( size > 1048576 )); then
  echo "Transcript exceeds 1 MB (size=$size)" >&2
  exit 2
fi

if [[ -z "${READMATES_AIGEN_GEMINI_API_KEY:-}" ]]; then
  echo "READMATES_AIGEN_GEMINI_API_KEY not set in environment of the *server* process; the smoke will 503 or fail at LLM call. Ensure the server has the key before running." >&2
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
BODY_JSON=$(printf '{"model":"%s","authorNameMode":"real","instructions":null}' "$MODEL")
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

echo "✓ Gemini smoke completed for jobId=$JOB_ID (model=$MODEL)"
echo "  Commit not exercised — that's the operator's call."
