#!/usr/bin/env bash
# Sweep maxParallelForks across 1..4 for :unitTest and record wallclock.
# Output: docs/superpowers/reports/2026-05-16-sweep-forks.md
#
# Run AFTER baseline measurement (Task 0) so the result table can be compared
# with the after-task3 numbers. Use the lowest stable median in CI via the
# READMATES_TEST_FORKS env in .github/workflows/ci.yml.
#
# Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.3
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${REPO_ROOT}/docs/superpowers/reports/2026-05-16-sweep-forks.md"
mkdir -p "$(dirname "$OUT")"

echo "# maxParallelForks sweep" > "$OUT"
echo "" >> "$OUT"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT"
echo "Host: $(uname -a)" >> "$OUT"
echo "Processors: $(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)" >> "$OUT"
echo "" >> "$OUT"

for n in 1 2 3 4; do
  echo "## forks=$n" >> "$OUT"
  echo '```' >> "$OUT"
  runs=()
  for i in 1 2 3; do
    (cd "$REPO_ROOT/server" && ./gradlew --stop >/dev/null 2>&1 || true)
    rm -rf "$REPO_ROOT/server/.gradle" "$REPO_ROOT/server/build"
    real=$(/usr/bin/time -p bash -c "cd '$REPO_ROOT/server' && ./gradlew unitTest -PmaxForks=$n" 2>&1 >/dev/null | awk '/^real/ {print $2}')
    runs+=("$real")
    echo "forks=$n run=$i real=$real" >> "$OUT"
  done
  sorted=$(printf '%s\n' "${runs[@]}" | sort -n)
  median=$(echo "$sorted" | sed -n '2p')
  echo "median=$median" >> "$OUT"
  echo '```' >> "$OUT"
  echo "" >> "$OUT"
done

echo "Wrote $OUT"
