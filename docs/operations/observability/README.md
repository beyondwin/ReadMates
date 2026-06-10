# Observability

ReadMates의 메트릭/로그/트레이스/대시보드/알림 가이드입니다.

## 운영 진입점

- 운영자 진입점: `/admin/health` — DB / Redis / Kafka / AI provider / outbox / 알림 발송 성공률 / 최근 deploy attempt 7개 카드를 한 화면에서 봅니다 (S2).
- 로컬 검증 진입점: `./scripts/observability-local-smoke.sh` — Prometheus/Grafana provisioning, alert rule load, dashboard import를 공개-safe fixture로 확인합니다.
- [Observability bootstrap runbook](../runbooks/observability-bootstrap.md) — OCI VM에서 Prometheus + Alertmanager 첫 bring-up과 smoke check.
- [SLO monthly report runbook](../runbooks/slo-monthly-report.md) — 매월 첫 주 6개 SLO 측정·기록 절차.

## 현재 상태

- Spring Boot Actuator + Micrometer + Prometheus registry가 server에 활성화되어 있습니다 (`/actuator/prometheus`).
- request traceId가 모든 응답과 에러 응답에 포함됩니다.
- Custom 메트릭으로 notification outbox backlog gauge와 AI session generation meter set이 export됩니다.
- `ops/grafana/dashboards/`에 3개 dashboard JSON(`aigen.json`, `notification-dispatch.json`, `bff-api-latency.json`)이, `ops/prometheus/alerts/`에 7개 rule 파일(`notification`, `http`, `jvm`, `security`, `redis`, `targets`, `aigen`)이 파일화되어 있습니다. SSOT는 이 디렉토리이며 docs는 동기화 사본입니다.
- **대시보드/알림 인프라 자체 (Grafana, Prometheus alertmanager 등)는 본 문서 작성 시점에 외부 배포 상태를 Git에서 확인하지 않습니다.** 본 가이드는 *권장 구성*과 *현재 인용 가능한 측정점*을 정리합니다. 실제 배포 여부와 provider limit은 운영 콘솔에서 재확인합니다.

## 문서

- [메트릭 카탈로그](metrics-catalog.md) — 어떤 메트릭이, 어떤 의미로, 어디서 나오는가.
- [대시보드](dashboards.md) — 권장 패널과 PromQL 쿼리.
- [알림 룰](alerts.md) — 파일화된 Prometheus alert rule과 임계 정책.
- [SLO](slos.md) — 운영 목표와 측정 방법.

## 용어

- **메트릭(metric)**: 시계열 수치. Prometheus가 scrape.
- **gauge**: 현재 값을 그대로 노출 (예: backlog count).
- **counter**: 단조 증가하는 누적값 (예: 처리된 요청 수).
- **histogram**: 분포를 bucket으로 (예: 응답 시간).
- **SLO**: Service Level Objective. 측정 가능한 운영 목표.
- **에러 예산**: SLO 위반 허용량. 위반 시 신규 기능 배포보다 신뢰성 작업 우선.
