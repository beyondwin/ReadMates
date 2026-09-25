# Deploy Observability Check Runbook

문서, 스크립트, dashboard, alert rule, SLO, request correlation, 운영 증거가 바뀐 release의 배포 전후에 씁니다.

## 이 runbook으로 확인되는 것

- Prometheus rule 파일 문법과 구조가 맞다.
- Grafana dashboard JSON 구조가 맞다.
- Docker가 있으면 로컬 Prometheus/Grafana/Tempo provisioning stack이 rule, dashboard, datasource를 올린다.
- server 동작 문서가 바뀌었을 때 `RequestIdFilter`와 Logback JSON 동작이 테스트와 맞다.
- 프론트 route-load/error 메트릭은 측정 시작 신호입니다. production 트래픽 전 데이터가 없다고 프론트 에러가 없다는 뜻은 아닙니다.

## 확인되지 않는 것

- production Prometheus, Grafana, Alertmanager, Tempo가 배포되어 있거나 닿는지.
- production scrape target이 건강한지.
- 알림 receiver가 설정되어 실제로 메일을 보내는지.
- release 뒤 운영 위험이 없다는 것.

## 1. 문서 공백 검사

```bash
git diff --check -- docs/operations/observability docs/operations/runbooks scripts/README.md
```

기대: 출력 없음.

## 2. 공개 안전 스캔

commit 전에 바뀐 운영 문서를 스캔합니다.

```bash
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)|[p]ages\\.dev" \
  docs/operations/observability docs/operations/runbooks scripts/README.md
```

기대: 출력 없음. `https://api.example.com` 같은 일반 placeholder만 남깁니다. 실제 도메인, OCI namespace, VM IP도 눈으로 한 번 더 확인합니다.

## 3. Prometheus rule

```bash
./scripts/validate-prometheus-rules.sh
```

기대: promtool이 `ops/prometheus/alerts/*.yml`을 통과시킵니다. production Prometheus가 새 파일을 읽었다는 증거는 아닙니다.

## 4. Grafana dashboard JSON

```bash
./scripts/lint-grafana-dashboards.sh
```

기대: `ops/grafana/dashboards/*.json`이 파싱되고 필수 field가 있습니다. production Grafana가 import했다는 증거는 아닙니다.

## 5. 로컬 provisioning smoke

Docker가 있고 로컬 포트 `9090`, `3001`, `3200`, `4318`이 비어 있을 때만 실행합니다(포트는 `READMATES_LOCAL_*_PORT`로 바꿀 수 있음).

```bash
./scripts/observability-local-smoke.sh
```

기대:

- Prometheus, Grafana, Tempo readiness 통과
- Prometheus에 alert rule group이 있음
- `readmates-server` target이 등록됨
- Grafana에 ReadMates dashboard가 provisioning됨

Spring 서버가 management port `8081`에 없으면 scrape health는 확인되지 않았다고 기록합니다. target 등록과 dashboard provisioning은 여전히 유효한 로컬 증거입니다.

## 6. Request correlation 동작

request id, MDC, Logback JSON field, 에러 응답 `traceId` 관련 문서를 바꿨을 때 실행합니다.

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.shared.observability.RequestIdFilterTest \
  --tests com.readmates.shared.observability.LogbackJsonEncoderTest
```

기대: 두 테스트 통과. 모든 기능 흐름이 도메인 MDC field를 싣는다는 증거는 아닙니다.

## 배포 후 기록할 증거

release note에 적습니다.

- 실행한 확인
- 건너뛴 확인과 이유
- production scrape target을 따로 확인했는지
- 알림 전달을 따로 확인했는지
- request correlation 조회를 샘플로 해 봤는지

"로컬 provisioning 통과"와 "production Grafana 정상"은 다른 말입니다. 구분해서 씁니다.

## 관련 문서

- [ReadMates observability operator guide](../observability/operator-guide.md)
- [Correlation ID lookup](correlation-id-lookup.md)
- [Observability bootstrap](observability-bootstrap.md)
- [SLO monthly report](slo-monthly-report.md)
