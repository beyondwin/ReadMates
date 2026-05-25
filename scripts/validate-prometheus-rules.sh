#!/usr/bin/env bash
set -euo pipefail

# Validate every Prometheus rule file in ops/prometheus/alerts/.
# Uses docker so contributors don't need promtool installed locally.

cd "$(git rev-parse --show-toplevel)"

docker run --rm \
  -v "$PWD/ops/prometheus/alerts:/etc/prometheus/alerts:ro" \
  prom/prometheus:v2.55.0 \
  promtool check rules /etc/prometheus/alerts/*.yml

echo "All Prometheus rule files OK"
