#!/usr/bin/env bash
set -euo pipefail

DIR="${1:-ops/grafana/dashboards}"
fail=0

if ! command -v jq >/dev/null; then
  echo "lint-grafana-dashboards: jq is required" >&2
  exit 2
fi

shopt -s nullglob
files=("$DIR"/*.json)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "lint-grafana-dashboards: no JSON files under $DIR" >&2
  exit 2
fi

for f in "${files[@]}"; do
  if ! jq empty "$f" >/dev/null 2>&1; then
    echo "INVALID JSON: $f" >&2
    fail=1
    continue
  fi
  title=$(jq -r '.title // empty' "$f")
  schema=$(jq -r '.schemaVersion // empty' "$f")
  panels=$(jq -r '.panels | length // 0' "$f")
  if [[ -z "$title" || -z "$schema" || "$panels" == "0" ]]; then
    echo "MISSING REQUIRED FIELDS in $f (title=$title schemaVersion=$schema panels=$panels)" >&2
    fail=1
  fi
done

if [[ $fail -eq 0 ]]; then
  echo "lint-grafana-dashboards: ${#files[@]} dashboard(s) ok"
fi
exit $fail
