# Deploy Observability Check Runbook

Use this before and after a release when docs, scripts, dashboards, alert rules, SLOs, request correlation, or operations evidence changed.

## What This Runbook Proves

- Prometheus rule files are syntactically valid.
- Grafana dashboard JSON files are structurally valid.
- The local Prometheus/Grafana provisioning stack can load configured rules and dashboards when Docker is available.
- Targeted request correlation tests still match documented `RequestIdFilter` and Logback behavior when server behavior docs changed.

## What This Runbook Does Not Prove

- It does not prove production Prometheus, Grafana, or Alertmanager are deployed or reachable.
- It does not prove production scrape targets are healthy.
- It does not prove alert receivers are configured or delivering messages.
- It does not prove there is no operational risk after release.

## Check 1: Docs Whitespace

Run this for changed docs:

```bash
git diff --check -- docs/operations/observability docs/operations/runbooks scripts/README.md
```

Expected: no output.

## Check 2: Public Safety Scan

Run this over changed operations docs before commit:

```bash
rg -n "ocid1\\.|/(Users|home)/|https://[^ ]*(readmates|private)|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]|xox[baprs]-|AKIA[0-9A-Z]{16}" \
  docs/operations/observability docs/operations/runbooks scripts/README.md
```

Expected: no output. If the scan finds a public-safe placeholder such as `https://api.example.com`, leave it only if it is clearly generic.

## Check 3: Prometheus Rules

```bash
./scripts/validate-prometheus-rules.sh
```

Expected: promtool validates `ops/prometheus/alerts/*.yml`.

This proves rule syntax and structure. It does not prove production Prometheus loaded the newest files.

## Check 4: Grafana Dashboard JSON

```bash
./scripts/lint-grafana-dashboards.sh
```

Expected: dashboard JSON is parseable and contains required fields.

This proves dashboard files are structurally valid. It does not prove a production Grafana instance imported them.

## Check 5: Local Provisioning Smoke

Run only when Docker is available and ports `9090` and `3001` are free:

```bash
./scripts/observability-local-smoke.sh
```

Expected:

- Prometheus readiness passes.
- Grafana readiness passes.
- Prometheus has alert rule groups.
- Prometheus has a configured `readmates-server` target.
- Grafana has provisioned ReadMates dashboards.

If the Spring server is not running on management port `8081`, record that scrape health was not proven. Target registration and dashboard provisioning can still be valid local evidence.

## Check 6: Request Correlation Behavior

Run when docs changed behavior claims about request id, MDC, Logback JSON fields, or error response `traceId`:

```bash
./server/gradlew -p server unitTest --tests com.readmates.shared.observability.RequestIdFilterTest --tests com.readmates.shared.observability.LogbackJsonEncoderTest
```

Expected: both targeted tests pass.

This proves the documented filter and JSON encoder behavior still matches those tests. It does not prove every application flow carries domain-specific MDC fields.

## Post-Deploy Evidence To Record

For production or staging release notes, record:

- which checks ran,
- which checks were skipped and why,
- whether production scrape targets were checked separately,
- whether alert delivery was checked separately,
- whether any request correlation lookup was sampled.

Use explicit language: "local provisioning passed" is different from "production Grafana is healthy".

## Related Docs

- [ReadMates observability operator guide](../observability/operator-guide.md)
- [Correlation ID lookup](correlation-id-lookup.md)
- [Observability bootstrap](observability-bootstrap.md)
- [SLO monthly report](slo-monthly-report.md)
