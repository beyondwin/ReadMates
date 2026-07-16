#!/usr/bin/env bash
set -euo pipefail

DIR="${1:-ops/grafana/dashboards}"
repo_root="$(git rev-parse --show-toplevel)"
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

for datasource in \
  "$repo_root/ops/observability/local/grafana/provisioning/datasources/tempo.yml" \
  "$repo_root/deploy/oci/grafana/provisioning/datasources/tempo.yml"; do
  if [[ ! -f "$datasource" ]] ||
     ! grep -Eq '^[[:space:]]*uid:[[:space:]]*readmates-tempo([[:space:]]|$)' "$datasource" ||
     ! grep -Eq '^[[:space:]]*url:[[:space:]]*http://tempo:3200([[:space:]]|$)' "$datasource"; then
    echo "MISSING TEMPO DATASOURCE: $datasource" >&2
    fail=1
  fi
done

for datasource in \
  "$repo_root/ops/observability/local/grafana/provisioning/datasources/prometheus.yml" \
  "$repo_root/deploy/oci/grafana/provisioning/datasources/prometheus.yml"; do
  if ! grep -Fq 'exemplarTraceIdDestinations:' "$datasource" ||
     ! grep -Eq '^[[:space:]]+- name:[[:space:]]*trace_id([[:space:]]|$)' "$datasource" ||
     ! grep -Eq '^[[:space:]]*datasourceUid:[[:space:]]*readmates-tempo([[:space:]]|$)' "$datasource"; then
    echo "MISSING PROMETHEUS EXEMPLAR LINK: $datasource" >&2
    fail=1
  fi
done

aigen_dashboard="$repo_root/ops/grafana/dashboards/aigen.json"
for title_fragment in 'Provider call outcomes' 'Provider call latency' 'Cost basis' 'Gate rejections' 'Circuit state' 'Exporter and Tempo health'; do
  if ! jq -e --arg title "$title_fragment" '[.panels[].title | select(contains($title))] | length > 0' "$aigen_dashboard" >/dev/null; then
    echo "MISSING AI DASHBOARD PANEL: $title_fragment" >&2
    fail=1
  fi
done

if jq -e '[.templating.list[]?.name | ascii_downcase | select(. == "job" or . == "job_id" or . == "trace" or . == "trace_id")] | length > 0' "$aigen_dashboard" >/dev/null; then
  echo "FORBIDDEN HIGH-CARDINALITY DASHBOARD VARIABLE in $aigen_dashboard" >&2
  fail=1
fi

if [[ $fail -eq 0 ]]; then
  echo "lint-grafana-dashboards: ${#files[@]} dashboard(s) ok"
fi
exit $fail
