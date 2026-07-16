#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

config_file="${1:-deploy/oci/prometheus/prometheus.yml}"

validate_config() {
  local candidate="$1"
  docker run --rm \
    -v "$PWD/$candidate:/etc/prometheus/prometheus.yml:ro" \
    -v "$PWD/ops/prometheus/alerts:/etc/prometheus/alerts:ro" \
    --entrypoint promtool \
    prom/prometheus:v2.55.0 \
    check config /etc/prometheus/prometheus.yml
}

validate_config "$config_file"
if [[ "$config_file" != "ops/observability/local/prometheus.yml" ]]; then
  validate_config "ops/observability/local/prometheus.yml"
fi

for required in deploy/oci/prometheus/prometheus.yml ops/observability/local/prometheus.yml; do
  grep -Eq 'job_name:[[:space:]]*tempo' "$required" || {
    printf 'Tempo scrape target missing from %s\n' "$required" >&2
    exit 1
  }
  grep -Eq 'tempo:3200' "$required" || {
    printf 'Tempo scrape endpoint missing from %s\n' "$required" >&2
    exit 1
  }
done

for compose in deploy/oci/compose.infra.yml ops/observability/local/compose.yml; do
  grep -Fq -- '--enable-feature=exemplar-storage' "$compose" || {
    printf 'Prometheus exemplar storage flag missing from %s\n' "$compose" >&2
    exit 1
  }
done

echo "Prometheus config OK"
