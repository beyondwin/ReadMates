#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

docker run --rm \
  -v "$PWD/deploy/oci/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$PWD/ops/prometheus/alerts:/etc/prometheus/alerts:ro" \
  --entrypoint promtool \
  prom/prometheus:v2.55.0 \
  check config /etc/prometheus/prometheus.yml

echo "Prometheus config OK"
