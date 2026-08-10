#!/usr/bin/env bash
set -euo pipefail

# Validate every Prometheus rule file and execute the PromQL rule fixtures.
# Uses one pinned docker image so contributors don't need promtool installed locally.

cd "$(git rev-parse --show-toplevel)"

rules="ops/prometheus/alerts/aigen-rules.yml"
for alert in \
  AiGenProviderCircuitOpen \
  AiGenQueueProbeUnavailable \
  AiGenQueueProbeStale \
  AiGenRecoveryFailure \
  AiGenRecoveryIndexRepairBlocked \
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
  -v "$PWD/ops/prometheus:/etc/prometheus:ro" \
  -w /etc/prometheus \
  --entrypoint /bin/sh \
  prom/prometheus:v2.55.0 \
  -c 'promtool check rules alerts/*.yml && promtool test rules tests/*.test.yml'

echo "All Prometheus rule files and tests OK"
