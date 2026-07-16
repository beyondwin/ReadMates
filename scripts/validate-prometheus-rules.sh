#!/usr/bin/env bash
set -euo pipefail

# Validate every Prometheus rule file in ops/prometheus/alerts/.
# Uses docker so contributors don't need promtool installed locally.

cd "$(git rev-parse --show-toplevel)"

rules="ops/prometheus/alerts/aigen-rules.yml"
for alert in \
  AiGenProviderCircuitOpen \
  AiGenEstimatedUnknownCostGrowth \
  AiGenPhysicalCallCapExhausted \
  AiGenOtlpExporterDrops \
  TempoTargetDown \
  TempoNotReady; do
  grep -Fq "alert: $alert" "$rules" || {
    printf 'Missing required observability alert: %s\n' "$alert" >&2
    exit 1
  }
done

docker run --rm \
  -v "$PWD/ops/prometheus/alerts:/etc/prometheus/alerts:ro" \
  --entrypoint /bin/sh \
  prom/prometheus:v2.55.0 \
  -c 'promtool check rules /etc/prometheus/alerts/*.yml'

echo "All Prometheus rule files OK"
