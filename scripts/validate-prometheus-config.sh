#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

docker run --rm \
  -v "$PWD/deploy/oci/prometheus:/etc/prometheus:ro" \
  -v "$PWD/ops/prometheus/alerts:/etc/prometheus/alerts:ro" \
  prom/prometheus:v2.55.0 \
  promtool check config /etc/prometheus/prometheus.yml

echo "Prometheus config OK"
