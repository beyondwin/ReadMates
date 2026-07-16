#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

tempo_config="ops/tempo/tempo.yml"
oci_compose="deploy/oci/compose.infra.yml"
local_compose="ops/observability/local/compose.yml"

fail() {
  printf 'validate-tempo-config: %s\n' "$*" >&2
  exit 1
}

[[ -f "$tempo_config" ]] || fail "missing $tempo_config"

grep -Eq '^[[:space:]]+block_retention:[[:space:]]+168h([[:space:]]|$)' "$tempo_config" ||
  fail "Tempo block retention must be exactly 168h"
grep -Eq '^[[:space:]]+backend:[[:space:]]+local([[:space:]]|$)' "$tempo_config" ||
  fail "Tempo trace backend must be local"
grep -Eq '^[[:space:]]+path:[[:space:]]+/var/tempo/wal([[:space:]]|$)' "$tempo_config" ||
  fail "Tempo WAL path must be /var/tempo/wal"
grep -Eq '^[[:space:]]+path:[[:space:]]+/var/tempo/blocks([[:space:]]|$)' "$tempo_config" ||
  fail "Tempo block path must be /var/tempo/blocks"
grep -Eq '^[[:space:]]+grpc:[[:space:]]*$' "$tempo_config" || fail "OTLP gRPC receiver is required"
grep -Eq '^[[:space:]]+http:[[:space:]]*$' "$tempo_config" || fail "OTLP HTTP receiver is required"
grep -Eq '^[[:space:]]+endpoint:[[:space:]]+0\.0\.0\.0:4317([[:space:]]|$)' "$tempo_config" ||
  fail "OTLP gRPC receiver must listen on container port 4317"
grep -Eq '^[[:space:]]+endpoint:[[:space:]]+0\.0\.0\.0:4318([[:space:]]|$)' "$tempo_config" ||
  fail "OTLP HTTP receiver must listen on container port 4318"

python3 - "$oci_compose" <<'PY'
import re
import sys

path = sys.argv[1]
lines = open(path, encoding="utf-8").read().splitlines()
in_tempo = False
tempo_indent = None
for line in lines:
    match = re.match(r"^(\s*)tempo:\s*(?:#.*)?$", line)
    if match:
        in_tempo = True
        tempo_indent = len(match.group(1))
        continue
    if not in_tempo:
        continue
    if line.strip() and len(line) - len(line.lstrip()) <= tempo_indent:
        in_tempo = False
        continue
    if re.match(r"^\s*ports:\s*(?:#.*)?$", line):
        raise SystemExit("validate-tempo-config: OCI Tempo service must not publish ports")
PY

if grep -En '(^|[^0-9])(3200|4317|4318):[[:space:]]*(3200|4317|4318)([^0-9]|$)' "$oci_compose" >/dev/null; then
  fail "OCI compose must not publish Tempo or OTLP ports"
fi

# Match the literal Compose interpolation contract.
# shellcheck disable=SC2016
grep -Fq '127.0.0.1:${READMATES_LOCAL_GRAFANA_PORT:-3001}:3000' "$local_compose" ||
  fail "local Grafana must bind to loopback because it proxies the Tempo datasource"
# Match the literal Compose interpolation contract.
# shellcheck disable=SC2016
grep -Fq '127.0.0.1:${READMATES_LOCAL_PROMETHEUS_PORT:-9090}:9090' "$local_compose" ||
  fail "local Prometheus must bind to loopback"

docker run --rm \
  -v "$PWD/$tempo_config:/etc/tempo/tempo.yml:ro" \
  grafana/tempo:2.10.5 \
  --config.file=/etc/tempo/tempo.yml \
  --config.verify=true

echo "Tempo config OK"
