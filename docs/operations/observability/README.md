# Observability

ReadMates의 메트릭/로그/트레이스/대시보드/알림 가이드입니다.

## 현재 상태

- Spring Boot Actuator + Micrometer + Prometheus registry가 server에 활성화되어 있습니다 (`/actuator/prometheus`).
- request traceId가 모든 응답과 에러 응답에 포함됩니다.
- Custom 메트릭으로 notification outbox backlog gauge가 1분 주기로 export됩니다.
- **대시보드/알림 인프라 자체 (Grafana, Prometheus alertmanager 등)는 본 문서 작성 시점에 외부 배포되지 않았습니다.** 본 가이드는 *권장 구성*과 *현재 인용 가능한 측정점*을 정리합니다. 실 배포는 후속 plan.

## 문서

- [메트릭 카탈로그](metrics-catalog.md) — 어떤 메트릭이, 어떤 의미로, 어디서 나오는가.
- [대시보드](dashboards.md) — 권장 패널과 PromQL 쿼리.
- [알림 룰](alerts.md) — 임계 정책 후보 (alertmanager rule).
- [SLO](slos.md) — 운영 목표와 측정 방법.

## 용어

- **메트릭(metric)**: 시계열 수치. Prometheus가 scrape.
- **gauge**: 현재 값을 그대로 노출 (예: backlog count).
- **counter**: 단조 증가하는 누적값 (예: 처리된 요청 수).
- **histogram**: 분포를 bucket으로 (예: 응답 시간).
- **SLO**: Service Level Objective. 측정 가능한 운영 목표.
- **에러 예산**: SLO 위반 허용량. 위반 시 신규 기능 배포보다 신뢰성 작업 우선.
