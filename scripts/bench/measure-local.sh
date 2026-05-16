#!/usr/bin/env bash
# Local build/test wallclock harness for the build/test speed optimization work.
# Usage: scripts/bench/measure-local.sh <label> <cold|warm>
#   label: e.g., baseline, after-task1, after-task2
#   mode:  cold  - drop all gradle caches between runs
#          warm  - first run is discarded, second is recorded (caches hot)
#
# Output: docs/superpowers/reports/2026-05-16-<label>-<mode>.md
# Each measurement ID is run N=3 times; median + min/max recorded.
# Reference: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §3
set -euo pipefail

LABEL="${1:?label required (e.g., baseline, after-task1)}"
MODE="${2:?mode required: cold or warm}"

case "$MODE" in
  cold|warm) ;;
  *) echo "mode must be 'cold' or 'warm'" >&2; exit 1 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${REPO_ROOT}/docs/superpowers/reports/2026-05-16-${LABEL}-${MODE}.md"
mkdir -p "$(dirname "$OUT")"

run_once() {
  local cmd="$1"
  /usr/bin/time -p bash -c "$cmd" 2> /tmp/bench-time.txt > /dev/null
  awk '/^real/ {print $2}' /tmp/bench-time.txt
}

prep_cold() {
  (cd "$REPO_ROOT/server" && ./gradlew --stop >/dev/null 2>&1 || true)
  rm -rf "$HOME/.gradle/caches/build-cache-"* 2>/dev/null || true
  rm -rf "$REPO_ROOT/server/.gradle" "$REPO_ROOT/server/build"
}

prep_warm() {
  local cmd="$1"
  # Discard run to populate caches; the next measurement uses warm caches.
  bash -c "$cmd" >/dev/null 2>&1 || true
}

measure() {
  local id="$1" cmd="$2"
  echo "### $id" >> "$OUT"
  echo '```' >> "$OUT"
  echo "command: $cmd" >> "$OUT"
  local runs=()
  for i in 1 2 3; do
    if [[ "$MODE" == "cold" ]]; then
      prep_cold
    else
      prep_warm "$cmd"
    fi
    runs+=("$(run_once "$cmd")")
    echo "run $i: ${runs[-1]} sec" >> "$OUT"
  done
  local sorted
  sorted=$(printf '%s\n' "${runs[@]}" | sort -n)
  local min median max
  min=$(echo "$sorted" | sed -n '1p')
  median=$(echo "$sorted" | sed -n '2p')
  max=$(echo "$sorted" | sed -n '3p')
  echo "median: ${median} sec  min: ${min}  max: ${max}" >> "$OUT"
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
}

echo "# ${LABEL} (${MODE})" > "$OUT"
echo "" >> "$OUT"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT"
echo "Host: $(uname -a)" >> "$OUT"
echo "" >> "$OUT"

measure "L1" "cd '$REPO_ROOT/server' && ./gradlew check"
measure "L2" "cd '$REPO_ROOT/server' && ./gradlew unitTest"
measure "L3" "cd '$REPO_ROOT/server' && ./gradlew architectureTest"
measure "L5" "cd '$REPO_ROOT' && pnpm --dir front test"
measure "L6" "cd '$REPO_ROOT' && pnpm --dir front build"
measure "L7" "cd '$REPO_ROOT' && pnpm --dir front test:coverage"

echo "Wrote ${OUT}"
