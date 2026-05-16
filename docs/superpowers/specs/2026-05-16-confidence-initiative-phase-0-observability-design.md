# Confidence Initiative — Phase 0: Observability Backbone

- Status: Draft
- Author: kws
- Date: 2026-05-16
- Parent: [Confidence Initiative — Overview](./2026-05-16-confidence-initiative-overview-design.md)

## 1. Goal

ReadMates의 BFF → Spring → Kafka producer → consumer → SMTP send 경로 전체에 단일 `requestId`를 흐르게 하고, 로그를 structured JSON으로 표준화하며, SLO와 Grafana dashboard를 코드로 보유한다. 이후 Phase 1~3 작업이 동일한 backbone 위에서 정량 측정 가능하도록 한다.

## 2. Exit Criteria

이 phase가 완료되었을 때 다음이 *모두* 참이다:

1. **End-to-end correlation ID**: Cloudflare Pages BFF가 받는 요청 1건이 동일한 `X-Request-Id` 값을 (a) Spring 서버 로그 라인, (b) 해당 요청이 만든 outbox row의 `request_id` column, (c) Kafka record header, (d) consumer 처리 로그, (e) SMTP send 로그에 모두 동일하게 남긴다. 회귀 테스트(integration + Playwright)가 위 5개 위치를 검증한다.
2. **Structured JSON logging**: 서버 로그가 JSON 인코더로 출력되며, 모든 라인이 `ts`, `level`, `logger`, `thread`, `msg`, `requestId`, 그리고 path/security context에서 추출 가능한 경우 `clubSlug`/`sessionId`/`actorId`/`source`/`eventType`을 포함한다.
3. **SLO 카탈로그 (코드)**: `server/src/main/resources/slo/slos.yaml`(또는 동등 경로)이 최소 3개 SLO를 정의하고, 시작 시 schema 검증을 통과한다. 검증 실패는 서버 부트를 막는다.
4. **Dashboards as code**: `ops/grafana/dashboards/notification-dispatch.json`과 `ops/grafana/dashboards/bff-api-latency.json`이 repo에 존재하고, CI에서 JSON 유효성과 panel 필수 필드 lint를 통과한다.
5. **회귀 없음**: 기존 `pnpm --dir front test`, `./server/gradlew check`, `pnpm --dir front test:e2e manual-notifications.spec.ts`가 모두 그린이다.

## 3. Scope

### 3.1 In-scope

- BFF (Cloudflare Pages Functions) 요청에 `X-Request-Id` 생성/수용/전달, BFF audit 로그에 동일 ID 기록
- Spring Boot `OncePerRequestFilter`로 `X-Request-Id` 수용/생성, MDC 바인딩, 응답 헤더 set, finally cleanup
- Outbox row에 `request_id` column 추가 (Flyway V29) 및 publish path가 capture
- Kafka producer가 Kafka record `X-Request-Id` header를 설정
- Kafka consumer가 record header를 읽어 MDC 바인딩 + finally cleanup
- SMTP send 직전 로그가 동일 MDC field를 사용
- Logback JSON 인코더 도입(`logstash-logback-encoder`), 공통 MDC field 표준 정의
- `slo/slos.yaml` 형식, schema 검증, loader, unit test
- Grafana dashboard JSON 2종 + `scripts/lint-grafana-dashboards.sh`(또는 동등 lint)
- 본 phase 변경을 대상으로 한 회귀 테스트 추가

### 3.2 Out-of-scope

- 신규 metric 도입(기존 Micrometer/Prometheus metric 명세 변경 없음). SLO catalog는 *기존* metric의 SLI 조합을 정의한다.
- Frontend에서 `X-Request-Id`를 user-visible 형태로 노출. SPA error toast/debug overlay 표시는 별도 follow-up 후보로만 적는다.
- Alert 라우팅 (Phase 3에서 SLO 기반으로 도입).
- 분산 trace(OpenTelemetry span). 본 phase의 correlation ID는 log correlation에 한정한다.

## 4. Component 설계

### 4.1 BFF: `X-Request-Id` 생성/전달

- Cloudflare Pages Functions 공통 middleware(`front/functions/_middleware.ts` 또는 동등 위치)가 incoming request의 `X-Request-Id`를 읽는다. 없거나 형식이 잘못된 경우 UUIDv4를 생성한다(존재 여부 신뢰는 BFF 경계까지로 한정 — 외부에서 임의값을 보낼 수 있으나 길이/문자 제한을 강제한다).
- 검증 규칙: `^[A-Za-z0-9-]{8,64}$`. 위반 시 새 UUIDv4로 대체한다.
- 검증된 값은 Spring으로 전달하는 fetch에 `X-Request-Id` 헤더로 부착하고, BFF audit log 한 줄에도 기록한다.
- 응답 헤더에 동일 값을 set해 SPA가 추후 디버깅에 활용할 수 있게 한다(SPA 측 적용은 본 phase 범위 밖).
- 보안: BFF가 추가로 부착하는 `X-Readmates-Bff-Secret`과 충돌하지 않는 독립 header.

### 4.2 Spring: 필터 + MDC 바인딩

- 위치: `server/src/main/kotlin/com/readmates/shared/observability/RequestContextFilter.kt`(이미 유사 컴포넌트가 있다면 확장).
- 동작: `OncePerRequestFilter` 구현, 우선순위는 Security filter chain *이후*, Controller advice *이전*. 우선순위 충돌은 plan에서 확정한다.
  - `X-Request-Id`를 읽고, 4.1과 동일한 검증 규칙을 적용. 실패/누락 시 UUIDv4 생성.
  - MDC `requestId`에 set. 응답 헤더에도 set.
  - `try { chain.doFilter } finally { MDC.remove("requestId") }`.
- 같은 필터(또는 같은 위치에 chained interceptor)에서 path matcher로 `clubSlug`, `sessionId`를 추출해 MDC에 넣는다. SecurityContext의 principal id가 존재하면 `actorId`에 넣는다.
- 이 필터의 동작은 RequestContextFilterTest 단위 테스트로 검증한다(임시 MDC 검사 + 응답 헤더 + cleanup 보장).

### 4.3 Outbox row에 `request_id` 컬럼

- Flyway V29 migration이 다음 테이블에 `request_id VARCHAR(64) NULL`을 추가한다(정확한 테이블 이름은 plan에서 확정):
  - 알림 outbox 테이블
  - `notification_manual_dispatch_previews`
  - `notification_manual_dispatches`
- NULL-safe 도입: 기존 row 영향 없음. 향후 NOT NULL 전환은 별도 phase에서 데이터 backfill 후 결정.
- 도메인 측: 알림 outbox 저장 path가 현재 MDC `requestId`를 읽어 row에 함께 저장한다. MDC가 비어 있는 경로(예: scheduled job)는 별도 path id를 부여한다(예: `scheduled-<task>-<runId>`).

### 4.4 Kafka producer/consumer

- Producer: outbox relay가 publish할 때 record header `X-Request-Id`에 row의 `request_id`를 set. 누락된 경우 빈 문자열 대신 `unknown`을 set(검색 시 누락 검출 가능).
- Consumer: `@KafkaListener` 메서드 진입 시 record header를 읽어 MDC `requestId`에 set. 함수 종료 시 finally에서 cleanup. async dispatch(thread switch)가 일어나는 경우 MDC를 명시적으로 capture & restore하는 wrapping helper를 둔다.
- 이미 발생한 throughput 변화는 무시할 수준(헤더 크기 약 36 bytes/record).

### 4.5 SMTP send 로깅

- 실제 SMTP send 직전 로그 라인이 `requestId` MDC field를 자동으로 포함하도록 logback pattern을 4.6 항목에서 표준화한다.
- 별도 코드 변경은 없으며, 4.4에서 consumer가 MDC를 set한 결과로 자동 전파된다.

### 4.6 Logback: JSON 인코더 + 공통 MDC field

- 의존성 추가: `net.logstash.logback:logstash-logback-encoder` (server/build.gradle.kts).
- `server/src/main/resources/logback-spring.xml`이 console appender에 `LogstashEncoder`를 사용. 기존 pattern 인코더는 dev profile에서 가독성을 위해 유지하거나 JSON 통일 중 택일 — plan에서 결정(권장: 통일).
- 필수 출력 필드: `@timestamp`, `level`, `logger_name`, `thread_name`, `message`, `mdc.requestId`. 존재할 때만 추가: `mdc.clubSlug`, `mdc.sessionId`, `mdc.actorId`, `mdc.source`, `mdc.eventType`.
- 로그 비용: line 길이가 늘어나므로 OCI Compose 로그 회전 정책을 plan에서 재확인한다.

### 4.7 SLO 카탈로그 (코드)

- 파일: `server/src/main/resources/slo/slos.yaml`.
- 형식 (초기 3개):
  ```yaml
  version: 1
  slos:
    - id: notification_dispatch_success_ratio
      description: 알림 outbox publish 성공률 (DEAD 미포함)
      objective: 0.99
      window: 7d
      sli:
        type: prometheus
        query_good: sum(rate(readmates_outbox_publish_total{result="success"}[5m]))
        query_total: sum(rate(readmates_outbox_publish_total[5m]))
    - id: bff_api_p95
      description: BFF → Spring API 응답 p95 latency (ms)
      objective_ms: 800
      window: 7d
      sli:
        type: prometheus
        query_latency_p95: histogram_quantile(0.95, sum(rate(readmates_bff_api_latency_seconds_bucket[5m])) by (le)) * 1000
    - id: login_success_ratio
      description: Google OAuth 로그인 성공률
      objective: 0.99
      window: 7d
      sli:
        type: prometheus
        query_good: sum(rate(readmates_login_total{result="success"}[5m]))
        query_total: sum(rate(readmates_login_total[5m]))
  ```
- 위 PromQL은 *제안*이다. 실제 metric 이름은 plan 단계에서 코드 확인 후 확정. 정의된 metric이 없으면 plan에서 metric을 추가하는 별도 task로 분리(scope creep 경계: 본 phase는 SLO catalog 형식 + loader가 우선).
- Loader: Kotlin `SloCatalogLoader`가 startup에 yaml을 로드하고 schema 검증한다. 검증 실패는 ApplicationContext 초기화 실패로 이어진다.
- Unit test: 잘못된 yaml(필드 누락, objective 범위 벗어남 등)에 대해 loader가 실패해야 함을 검증.

### 4.8 Grafana dashboards as code

- 파일: `ops/grafana/dashboards/notification-dispatch.json`, `ops/grafana/dashboards/bff-api-latency.json`.
- 내용:
  - notification-dispatch: outbox state 분포(PENDING/PUBLISHING/PUBLISHED/FAILED/DEAD), publish 성공률 SLO line, manual dispatch 대비 auto dispatch 비율, dead-letter 누적량.
  - bff-api-latency: BFF → Spring p50/p95/p99, route별 분포, 5xx ratio.
- Lint: `scripts/lint-grafana-dashboards.sh`가 `jq .` 유효성 검사 + 최소 필수 필드(`title`, `panels`, `schemaVersion`) 검사. CI front/back job에 추가하거나 별도 job으로 분리(plan에서 결정).
- 실제 Grafana instance와의 sync는 본 phase 범위 밖이며, dashboard JSON이 source of truth.

## 5. Migration & Backward Compatibility

- Flyway V29 — outbox 계열 테이블에 `request_id VARCHAR(64) NULL` 추가. 모두 NULL-safe.
- 로그 schema 변경 — 외부 로그 수집/검색 도구가 기존 plain text format을 가정하고 있다면 영향. 본 phase 시작 전에 로그 인덱싱 설정(OCI 로그, Loki 등)을 plan에서 점검한다.
- BFF response header 추가는 SPA/외부에 영향 없음(브라우저가 무시).

## 6. Verification Plan

- **Unit**
  - `RequestContextFilterTest`: 헤더 수용/생성/검증/MDC bind/응답 헤더/cleanup
  - `SloCatalogLoaderTest`: 유효/무효 yaml schema 검증
  - Logback encoder smoke test(MDC 필드 포함 여부)
- **Integration**
  - 알림 outbox publish path가 MDC `requestId`를 row에 저장하고, Kafka header에 set하고, consumer가 MDC에 bind함을 testcontainers 기반으로 검증
  - 동일 `X-Request-Id`로 BFF → controller → outbox row → Kafka header → consumer 로그까지의 chain을 검증하는 end-to-end 테스트(가능하면 Playwright + log assertion, 또는 Spring `@SpringBootTest` 안에서 in-process 검증)
- **E2E**
  - 기존 `manual-notifications.spec.ts`가 통과 + 새로 `correlation-id.spec.ts`(혹은 동일 spec에 case 추가)가 BFF 응답 헤더의 `X-Request-Id`가 동일 dispatch의 audit ledger row와 매칭됨을 검증
- **Backward compat**
  - V29 migration이 빈 데이터셋에서 idempotent 함을 확인
- **수동 점검**
  - Grafana dashboard JSON 두 파일을 로컬 Grafana(또는 import dry-run)로 한 번 로드해 panel 렌더 확인

## 7. Risk & Mitigation

- **MDC 누락(consumer/async)**: thread switch 경계에서 MDC 손실 가능. 4.4의 wrapping helper로 명시적 capture/restore. 회귀 테스트로 강제.
- **로그 비용 증가**: JSON 인코더와 MDC field 추가로 라인 길이 증가. OCI Compose의 log rotation/retention을 plan 단계에서 검토 후 필요시 sampling 정책 도입.
- **BFF의 `X-Request-Id` 신뢰 경계**: 외부 클라이언트가 임의값을 보낼 수 있음. 4.1의 검증 규칙으로 길이/문자만 허용. 추가 위험은 보안 검토에서 본 phase 종료 시 재확인.
- **SLO PromQL 미스매치**: 4.7의 query 예시가 실제 metric 이름과 다를 수 있음. plan 단계에서 metric 카탈로그 1차 audit이 필요. 잘못된 query는 loader schema 검증을 통과해도 runtime에서 NaN — 본 phase의 dashboard 점검에서 잡는다.
- **Logback dev/prod profile divergence**: dev에서 JSON 출력은 디버깅 가독성이 떨어진다. plan에서 dev profile은 pretty-printed JSON 또는 별도 console encoder를 결정한다.

## 8. Open Questions (plan에서 해소)

- 정확한 outbox 테이블/컬럼 이름(`notification_outbox`인지 다른 이름인지) 확인.
- `RequestContextFilter`가 기존 어떤 필터와 충돌/중복되는지 — `BffSecretFilter`, Security filter chain과의 ordering.
- Logback dev profile JSON 통일 vs plain text 유지 결정.
- Kafka consumer MDC wrapping helper의 위치(`shared/observability` 패키지 신설 여부).
- SLO yaml에 metric별 unit/threshold(예: latency in ms vs s) 컨벤션 확정.
- Grafana lint 스크립트의 CI 위치(front job, back job, 별도 job).

## 9. 다음 단계

이 spec이 user-approved되면 `superpowers:writing-plans` skill을 호출해 Phase 0 implementation plan을 작성한다. plan은 위 component 8개를 task 단위로 분해하고 각 task의 verification command를 명시한다.
