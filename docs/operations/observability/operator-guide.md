# ReadMates Observability Operator Guide

이 문서는 로그/메트릭/Actuator/Prometheus/Grafana/ELK 개념을 ReadMates 코드와 운영 흐름 기준으로 설명합니다.

## 한 줄 구분

| 질문 | ReadMates에서 보는 곳 |
| --- | --- |
| 서버가 살아 있나? | management `/actuator/health` |
| 요청이 늘었나, 느려졌나, 실패하나? | Prometheus/Grafana의 HTTP/JVM/Hikari/Redis/notification metric |
| 어떤 요청에서 왜 실패했나? | JSON log의 `requestId`와 correlation lookup runbook |
| API→Kafka→AI provider 호출이 한 흐름인가? | Grafana exemplar 또는 trace ID로 internal Tempo 조회 |
| 알림/AI/Redis 같은 비동기 또는 선택 계층 상태는? | metrics catalog, alert rules, `/admin/health`, source-of-truth DB row |
| 중앙 로그 검색 도구가 있나? | 이 phase에서는 도입하지 않음. JSON stdout log는 후속 OCI Logs/Loki/ELK/OpenSearch 연동 후보 |

## 1. Logback

Logback은 Spring Boot가 로그를 쓰는 도구입니다. ReadMates에서는 `server/src/main/resources/logback-spring.xml`이 기준입니다.

확인 명령:

```bash
sed -n '1,120p' server/src/main/resources/logback-spring.xml
```

볼 것:

- `net.logstash.logback.encoder.LogstashEncoder`
- `requestId`, `clubSlug`, `sessionId`, `actorId`, `source`, `eventType` MDC field
- `ts`, `msg`, `logger`, `thread` field 이름

디버깅할 때는 사람이 읽는 plain text 로그를 기대하지 말고 JSON 한 줄을 `jq`로 필터링합니다.

```bash
journalctl -u readmates-server --since "10 min ago" | jq 'select(.requestId == "<request-id>")'
```

초보자가 자주 헷갈리는 점: JSON 로그를 쓴다고 자동으로 Kibana가 생기지는 않습니다. JSON은 수집기가 이해하기 쉬운 출력 형식이고, 검색 UI는 별도 운영 구성입니다.

## 2. MDC And Request ID

ReadMates의 요청 correlation은 `RequestIdFilter`가 담당합니다.

확인 명령:

```bash
sed -n '1,120p' server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilter.kt
```

볼 것:

- Header: `X-Readmates-Request-Id`
- MDC key: `requestId`
- 요청이 끝난 뒤 `MDC.remove`
- 응답 header에 같은 request id 반환

디버깅할 때 사용자는 오류 신고에 request id를 줄 수 있고, 운영자는 같은 id로 서버 로그와 일부 outbox/Kafka 흐름을 따라갑니다.

초보자가 자주 헷갈리는 점: `requestId`는 인증 토큰이나 사용자 식별자가 아닙니다. 한 요청을 찾기 위한 public-safe lookup key입니다.

## 3. Actuator

Actuator는 운영용 진단 endpoint를 제공합니다. ReadMates 설정은 `server/src/main/resources/application.yml`의 `management` 블록입니다.

확인 명령:

```bash
rg -n "management:|base-path: /actuator|include: health,prometheus|server:" server/src/main/resources/application.yml
```

주요 endpoint:

```text
GET http://<server-host>:8081/actuator/health
GET http://<server-host>:8081/actuator/prometheus
```

기본 관리 주소는 loopback입니다. 운영에서 외부 scrape가 필요하면 보호된 reverse proxy나 같은 private network scrape를 설계합니다.

초보자가 자주 헷갈리는 점: Actuator는 대시보드가 아니라 데이터를 노출하는 endpoint입니다. Prometheus와 Grafana가 그 데이터를 수집하고 보여줍니다.

## 4. Prometheus

Prometheus는 Actuator의 metric을 주기적으로 scrape합니다. 로컬 실습 설정은 `ops/observability/local/prometheus.yml`입니다.

확인 명령:

```bash
sed -n '1,120p' ops/observability/local/prometheus.yml
```

볼 것:

- `scrape_interval`
- `metrics_path: /actuator/prometheus`
- `job_name: readmates-server`
- `target: host.docker.internal:8081`

대표 metric은 [metrics-catalog.md](metrics-catalog.md)를 기준으로 봅니다. HTTP, JVM, HikariCP, Logback, notification, Redis/cache, AI generation, outbound resilience metric이 핵심입니다.

초보자가 자주 헷갈리는 점: metric label에 `user_id`, `email`, `session_id` 같은 값을 넣으면 검색이 편해 보이지만 Prometheus time series 폭발과 개인정보 노출 위험이 생깁니다. ReadMates metric label은 enum이나 낮은 cardinality 값만 허용합니다.

## 5. Grafana

Grafana는 Prometheus query를 dashboard로 보여줍니다. ReadMates dashboard source of truth는 `ops/grafana/dashboards/`입니다.

확인 명령:

```bash
ls ops/grafana/dashboards
./scripts/lint-grafana-dashboards.sh
```

장애 때 보는 순서:

1. HTTP 5xx ratio와 p95 latency로 증상 확인
2. Hikari/JVM/Redis/notification panel로 영향 surface 좁히기
3. AI/provider 흐름이면 exemplar/trace ID로 Tempo를 확인하고, 일반 장애면 `requestId`/시간대로 로그와 DB row 확인

초보자가 자주 헷갈리는 점: Grafana 그래프는 원인을 자동으로 말해주지 않습니다. 그래프는 증상과 범위를 좁혀주고, 원인은 로그/DB row/최근 배포/외부 의존성 증거와 함께 판단합니다.

### Tempo와 exemplar

Tempo는 content-free span metadata를 7일 보관합니다. 로컬 query/OTLP port는 loopback에만 bind되고 OCI Tempo/OTLP는 Compose internal network에만 있습니다. Prometheus exemplar가 있는 histogram에서 trace로 이동하거나 Grafana Explore의 Tempo datasource에 32자 trace ID를 사용합니다.

```bash
bash scripts/validate-tempo-config.sh
bash scripts/observability-local-smoke.sh
```

AI span의 허용 dimension은 provider, allowlisted model, call mode, outcome, safe error code, job/attempt correlation뿐입니다. Prompt/completion/transcript/evidence/raw error와 user/session/club identity를 검색 편의를 위해 추가하지 않습니다. Tempo가 down이어도 server health와 product 요청이 유지되어야 하며 exporter failure/queue-drop meter로 손실을 별도로 확인합니다.

## 6. Admin health refresh 장애 격리

`/admin/health`는 platform-admin 전용 운영 진단입니다. Actuator liveness/readiness endpoint가 아니며 live AI provider를 호출하거나 email을 보내지 않습니다. 개별 card를 해석하기 전에 server response metadata를 확인합니다.

| `refreshState` | 운영 의미와 다음 조치 |
| --- | --- |
| `FRESH` | complete provider wave가 성공했습니다. card-local signal을 정상적으로 해석합니다. |
| `REFRESHING` | scheduled 또는 lazy wave가 진행 중이며 현재 화면에는 마지막으로 보였던 snapshot이 남습니다. `lastSuccessfulAt`이 있으면 그것이 last-known-good snapshot이지만, `null`이면 첫 complete success 전 partial/`UNKNOWN` snapshot일 수 있으므로 `lastSuccessfulAt`과 `refreshState`를 함께 구분합니다. outcome이 보이기 전 새 incident로 단정하지 않습니다. |
| `STALE` | failed wave 뒤 이전 complete snapshot을 보존한 상태입니다. card에 조치하기 전 `lastSuccessfulAt`, `staleAgeSeconds`, provider outcome counter, transport availability, executor saturation을 확인합니다. |
| `UNAVAILABLE` | complete success wave가 아직 없습니다. card에 provider-local `UNKNOWN`이 있어도 fresh로 가정하지 말고 initial wave가 끝나지 못한 이유를 찾습니다. |

다음 bounded metric을 함께 봅니다. `readmates.admin.health.provider.outcomes`는 `TIMEOUT`, `REJECTED` 등 provider outcome을 구분하고, `readmates.admin.health.refresh.overlap`은 existing wave에 join한 demand를 보이며, `readmates.admin.health.refresh.duration`은 완료된 `FRESH`/`STALE`/`UNAVAILABLE` wave를 분리하고, `readmates.admin.health.snapshot.stale.age.seconds`는 current age를 표시합니다. label은 fixed enum이므로 endpoint, URL, exception, club, user, deployment 값을 time series에서 찾지 않습니다.

`REJECTED`가 증가하면 dedicated bounded executor가 포화되어 request thread에서 provider work를 실행하는 대신 의도적으로 거절한 것입니다. workload와 configured executor capacity를 확인하되 caller-runs로 바꾸지 않습니다. timeout outcome이 늘면 Prometheus transport path와 configured connect, connection-request, read timeout의 provider deadline 관계를 점검합니다. invalid configuration은 fallback을 적용하지 않고 startup에서 application을 실패시키므로 restart 전 typed `readmates.admin.health` 값을 검증합니다. scheduler는 refresh input port를 비동기로 호출하고 failure에는 fixed safe warning만 남기므로 provider payload를 log에서 찾기보다 metric과 response metadata를 사용합니다.

## 7. Alerts And SLOs

Prometheus alert rule source는 `ops/prometheus/alerts/*.yml`입니다. SLO 사람 읽기용 문서는 `docs/operations/observability/slos.md`이고, 서버 resource source는 `server/src/main/resources/slo/slos.yaml`입니다.

확인 명령:

```bash
./scripts/validate-prometheus-rules.sh
sed -n '1,160p' docs/operations/observability/slos.md
```

알림은 "조사해야 할 신호"입니다. SLO는 "얼마나 자주/오래 사용자가 영향을 받았는지"를 보는 기준입니다.

초보자가 자주 헷갈리는 점: 알림이 울리지 않았다고 장애가 없는 것은 아닙니다. 반대로 알림 하나만으로 root cause가 확정되는 것도 아닙니다.

## 8. ELK/Kibana

ELK는 로그를 중앙 수집, 저장, 검색, 시각화하는 스택입니다.

ReadMates의 현재 결정:

- 이 phase에서는 ELK/Kibana를 도입하지 않습니다.
- 서버는 JSON stdout log와 `requestId`를 이미 제공합니다.
- 후속으로 OCI Logs, Loki, ELK, OpenSearch 중 하나를 선택할 수 있습니다.

후속 도입 전에 결정할 것:

- 로그 보관 기간
- 운영자 접근 권한
- 비용과 디스크 사용량
- private data redaction 정책
- production, preview, local 환경 분리

초보자가 자주 헷갈리는 점: Kibana는 로그를 "보는 화면"이고, Logback은 로그를 "쓰는 라이브러리"입니다. 둘 사이에는 수집기와 저장소가 필요합니다.

## Notification recovery

### Relay/Kafka publication

`readmates_outbox_publish_total`의 `failure|dead|missing_payload|expired|stale_lease` 분포, event-outbox `pending|failed|dead|publishing`, backlog refresh result와 row의 `attempt_count`, `next_attempt_at`, `locked_at`, bounded `last_error`, `created_at`, transition time, request ID를 함께 확인합니다. Event deadline은 `created_at +` 현재 배포의 `READMATES_NOTIFICATION_EVENT_MAX_AGE`이며 UTC 현재 시각이 deadline과 같거나 늦으면 만료입니다. `next_attempt_at`은 deadline이 아닙니다. `DEAD` 원인이 missing payload/deadline/config/Kafka 장애 중 무엇인지 확인하고 원인이 제거되기 전에는 같은 business event를 다시 만들거나 delivery replay를 대신 실행하지 않습니다. 현재 slice에는 relay DEAD를 안전하게 되돌리는 범용 action이 없으므로 DB row를 직접 수정하지 않고 incident와 forward recovery를 분리합니다. Manual composer preview/confirm은 새 event를 만드는 명시적 forward action이지 기존 event replay가 아닙니다.

### Email worker/SMTP

Delivery `pending|failed|dead|sending`, sent/failed/dead counter와 row의 `attempt_count`, `next_attempt_at`, `locked_at`, bounded `last_error`, `created_at`을 확인합니다. Delivery deadline은 `created_at +` 현재 배포의 `READMATES_NOTIFICATION_DELIVERY_MAX_AGE`이고 equality부터 만료이며, lease는 `locked_at + READMATES_NOTIFICATION_CLAIM_LEASE`로 평가합니다. `PERMANENT`는 주소/구성 원인이 교정된 exact delivery ID만 host가 `POST /api/host/notifications/items/{id}/restore`로 명시적으로 복구합니다. 이 endpoint는 한 EMAIL delivery를 `PENDING`으로 되돌리는 action이며 manual preview/confirm처럼 새 event를 만들지 않습니다. `RETRYABLE`은 provider 회복과 lease 상태를 먼저 확인합니다. `AMBIGUOUS`는 provider acceptance 또는 recipient-side evidence로 미수락이 확인되지 않으면 restore하거나 resend하지 않습니다.

Platform admin bulk replay도 새 event/outbox를 만드는 forward 발송이 아니라 exact delivery 복구입니다. Preview는 최대 1,000개(설정 범위 `1..5000`)의 byte-exact `EMAIL` + `FAILED|DEAD` + `MAIL_RETRYABLE|MAIL_PERMANENT` target만 selection hash에 고정하며 `AMBIGUOUS`, expired, invalid-content, null/blank, unknown, case/padding lookalike는 제외합니다. Confirm은 현재 row가 preview의 status, attempt count, failure code, `updated_at`과 일치하고 active lease가 없을 때만 `PENDING`으로 되돌리며 달라진 row는 skip합니다. Reset, 단일 protected audit, receipt, preview consume는 한 DB transaction이고 동일 actor/hash 명령 재시도는 receipt 결과를 반환합니다. Legacy v1 preview는 count를 지어내지 않고 새 preview를 요구합니다. Audit API에는 bounded count/hash/scope/timestamp만 남기고 confirm reason, recipient/email, provider response, delivery ID list는 복사하지 않습니다.

Raw address, payload, provider response, stack trace는 ticket에 넣지 않습니다. SMTP accepted-before-`SENT` CAS는 lease reclaim 뒤 중복될 수 있는 at-least-once 경계입니다. Exactly-once에는 provider idempotency key/receipt API가 필요하며 현재 범위 밖입니다.
