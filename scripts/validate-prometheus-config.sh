#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

config_file="${1:-deploy/oci/prometheus/prometheus.yml}"

docker run --rm \
  -v "$PWD/$config_file:/etc/prometheus/prometheus.yml:ro" \
  -v "$PWD/ops/prometheus/alerts:/etc/prometheus/alerts:ro" \
  --entrypoint promtool \
  prom/prometheus:v2.55.0 \
  check config /etc/prometheus/prometheus.yml

echo "Prometheus config OK"
