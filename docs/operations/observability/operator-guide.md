# ReadMates Observability Operator Guide

이 문서는 로그/메트릭/Actuator/Prometheus/Grafana/ELK 개념을 ReadMates 코드와 운영 흐름 기준으로 설명합니다.

## 한 줄 구분

| 질문 | ReadMates에서 보는 곳 |
| --- | --- |
| 서버가 살아 있나? | management `/actuator/health` |
| 요청이 늘었나, 느려졌나, 실패하나? | Prometheus/Grafana의 HTTP/JVM/Hikari/Redis/notification metric |
| 어떤 요청에서 왜 실패했나? | JSON log의 `requestId`와 correlation lookup runbook |
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
3. `requestId` 또는 시간대 기준으로 로그와 DB row 확인

초보자가 자주 헷갈리는 점: Grafana 그래프는 원인을 자동으로 말해주지 않습니다. 그래프는 증상과 범위를 좁혀주고, 원인은 로그/DB row/최근 배포/외부 의존성 증거와 함께 판단합니다.

## 6. Alerts And SLOs

Prometheus alert rule source는 `ops/prometheus/alerts/*.yml`입니다. SLO 사람 읽기용 문서는 `docs/operations/observability/slos.md`이고, 서버 resource source는 `server/src/main/resources/slo/slos.yaml`입니다.

확인 명령:

```bash
./scripts/validate-prometheus-rules.sh
sed -n '1,160p' docs/operations/observability/slos.md
```

알림은 "조사해야 할 신호"입니다. SLO는 "얼마나 자주/오래 사용자가 영향을 받았는지"를 보는 기준입니다.

초보자가 자주 헷갈리는 점: 알림이 울리지 않았다고 장애가 없는 것은 아닙니다. 반대로 알림 하나만으로 root cause가 확정되는 것도 아닙니다.

## 7. ELK/Kibana

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
