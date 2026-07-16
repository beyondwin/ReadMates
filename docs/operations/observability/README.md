# Observability

ReadMates의 메트릭/로그/트레이스/대시보드/알림 가이드입니다.

## 운영 진입점

| 상황 | 먼저 볼 곳 | 목적 |
| --- | --- | --- |
| 장애 증상 확인 | Grafana dashboard 또는 Prometheus query | 5xx, p95 latency, JVM, Hikari, Redis, notification backlog 같은 숫자로 실제 증상을 확인 |
| 단일 요청 추적 | [Correlation ID lookup runbook](../runbooks/correlation-id-lookup.md) + Grafana Tempo | 일반 로그는 `requestId`, API→Kafka→AI provider는 W3C trace/exemplar로 연결 |
| 배포 전후 관측성 확인 | [Deploy observability check runbook](../runbooks/deploy-observability-check.md) | rule/dashboard/SLO/script가 깨지지 않았는지 확인하고 증거의 한계를 기록 |
| 관측성 개념을 코드에 매핑 | [ReadMates observability operator guide](operator-guide.md) | Logback, MDC, Actuator, Prometheus, Grafana, alert, ELK 개념을 이 repo의 파일과 명령어로 이해 |
| 운영자 health 화면 | `/admin/health` | DB / Redis / Kafka / AI provider / outbox / 알림 발송 성공률 / 최근 deploy attempt 카드를 aggregate로 확인 |
| 로컬 provisioning smoke | `./scripts/observability-local-smoke.sh` | Prometheus/Grafana/Tempo provisioning, trace query, Tempo-down product isolation을 공개-safe 로컬 stack으로 확인 |

## 현재 상태

- Spring Boot Actuator + Micrometer + Prometheus registry가 server에 활성화되어 있습니다. Prometheus scrape endpoint는 management server의 `/actuator/prometheus`입니다.
- Management server는 기본적으로 `127.0.0.1:8081`에 바인딩됩니다. 외부 공개 포트가 필요하면 reverse proxy나 방화벽 보호를 별도로 설계해야 합니다.
- `RequestIdFilter`가 `X-Readmates-Request-Id`를 생성/수용하고 MDC `requestId`에 바인딩합니다. 같은 값은 응답 헤더와 에러 응답의 `traceId` lookup에도 쓰입니다.
- Micrometer Tracing/OpenTelemetry가 W3C context를 Spring MVC, observed Kafka producer/consumer, AI provider/Spring AI 호출까지 연결합니다. `requestId`는 trace ID를 대체하지 않습니다.
- OTLP span은 bounded asynchronous exporter로 internal Tempo에 전달됩니다. Sampling 기본값은 100%, Tempo retention은 7일이며 exporter/Tempo 실패는 product 요청을 실패시키지 않습니다.
- 서버 로그는 `logback-spring.xml`의 `LogstashEncoder`로 JSON 출력되며 `requestId`, `clubSlug`, `sessionId`, `actorId`, `source`, `eventType` MDC field를 포함할 수 있습니다.
- Custom 메트릭으로 notification, Redis/cache, AI generation, outbound resilience meter set이 export됩니다. 자세한 이름과 label 정책은 [메트릭 카탈로그](metrics-catalog.md)를 기준으로 합니다.
- `ops/grafana/dashboards/`와 `ops/prometheus/alerts/`가 dashboard/rule source of truth입니다. 문서는 사람이 읽는 해설입니다.
- 대시보드/알림 인프라 자체의 외부 배포 상태는 Git만으로 확인하지 않습니다. 로컬 smoke와 production health evidence를 구분해 기록합니다.
- AI trace/log/metric/span/baggage에는 prompt, completion, transcript, evidence, raw provider error, user/session/club identity를 넣지 않습니다. 상세 allowlist는 [Spring AI 2 provider architecture](../../development/spring-ai-2-provider-architecture.md)를 따릅니다.

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
