# Confidence Initiative Phase 0 — Observability Backbone 상세 구현 문서

작성일: 2026-05-16
상태: READY FOR IMPLEMENTATION
연결 spec: `docs/superpowers/specs/2026-05-16-confidence-initiative-phase-0-observability-design.md`
연결 plan: `docs/superpowers/plans/2026-05-16-confidence-initiative-phase-0-observability-implementation.md`
상위: `docs/superpowers/specs/2026-05-16-confidence-initiative-overview-design.md`
대상 표면: `front/functions/` BFF, `server/src/main/kotlin/com/readmates/{shared/observability,notification}/`, `server/src/main/resources/{logback-spring.xml,db/mysql/migration,slo/}`, `ops/grafana/dashboards/`, `scripts/lint-grafana-dashboards.sh`, `docs/operations/`

## 1. 배경

ReadMates는 v1.9까지 BFF 보안 경계, MySQL transactional event outbox, Kafka relay/consumer 알림 파이프라인, 호스트 수동 발송 워크벤치, 멀티 클럽 도메인까지 확장했다. v1.9 시점에서 다음 두 가지가 다음 큰 product 작업을 막는 임계점에 가까워졌다.

첫째, 알림 outbox state machine은 `PENDING`/`PUBLISHING`/`PUBLISHED`/`FAILED`/`DEAD`로 운영 가시성이 있지만, **한 건의 요청이 어떤 BFF 요청에서 시작되어 어느 outbox row를 만들었고 어떤 publish 시도를 거쳐 어디서 실패했는지**를 단일 trace로 잇기 어렵다. BFF, Spring API, outbox row, Kafka header, consumer 로그에 일관된 correlation ID가 없다.

둘째, Spring 서버 로그는 `%X{requestId:-no-req}` plain-text pattern으로 출력된다. Logback MDC `requestId`는 이미 채워지지만, 외부 로그 수집/검색 도구가 sub-string grep 이상의 의미 있는 join을 하려면 structured JSON이 필요하고, `clubSlug`/`sessionId`/`actorId`/`source`/`eventType` 같은 도메인 축을 같이 가져야 dispatch 실패의 도메인 컨텍스트를 빠르게 잡을 수 있다.

Phase 0는 이 두 통증을 동시에 한 단계 낮추는 backbone 작업이다. Phase 2의 boundary refactor와 Phase 3의 operator console이 동일한 backbone 위에서 정량 측정 가능하도록 한다.

## 2. 목표

- Cloudflare Pages BFF가 `X-Readmates-Request-Id`를 생성/수용하고 Spring으로 전달한다. 동일 값이 BFF 응답 헤더로 다시 노출된다.
- Spring `RequestIdFilter`(이미 존재)가 같은 헤더를 MDC `requestId`로 바인딩한다. 변경 없음.
- 알림 outbox row의 `request_id` 컬럼이 MDC `requestId`를 영구화한다.
- 알림 publish 시 Kafka record header `readmates-request-id`로 같은 값을 propagate한다.
- 알림 consumer가 Kafka header를 읽어 MDC에 다시 바인딩한 뒤 dispatch handler를 실행하고 finally에서 cleanup한다.
- Logback이 JSON encoder로 출력하며 표준 MDC field 집합(`requestId`, `clubSlug`, `sessionId`, `actorId`, `source`, `eventType`)을 포함한다.
- SLO 3개(`notification_dispatch_success_ratio`, `bff_api_p95`, `login_success_ratio`)가 `server/src/main/resources/slo/slos.yaml`에 정의되고 startup에 schema 검증을 통과한다.
- Grafana dashboard JSON 2종이 repo에 커밋되고 CI에서 lint된다.
- 기존 검증 명령(`pnpm --dir front lint/test/build`, `./server/gradlew check`, `pnpm --dir front test:e2e manual-notifications.spec.ts`)이 모두 회귀 없이 그린이다.

## 3. 비목표

- 신규 Prometheus/Micrometer metric 도입. SLO catalog는 *기존* metric에 대한 SLI 정의이며 metric 추가 자체는 Phase 0 범위 밖이다. 실제 metric 이름과 catalog의 PromQL query가 어긋나면 dashboard에서 NaN으로 노출되며, 그 추적은 Phase 3 또는 별도 spec.
- 분산 trace(OpenTelemetry span/trace). 본 phase의 correlation ID는 *log correlation*에 한정한다.
- SLO 기반 alert 라우팅. Phase 3에서 다룬다.
- BFF가 생성한 `X-Readmates-Request-Id`를 SPA error toast나 debug overlay에 user-visible하게 노출. follow-up 후보로만 적고 본 phase에서는 응답 헤더 노출까지만 한다.
- 다른 모듈(`feedback`, `archive`, `publication`)의 read/write 경계 정리. Phase 1, 2에서 다룬다.
- 로그 수집/검색 도구(OCI Logs, Loki, ELK 등)의 인덱싱 schema 변경. 본 phase는 *서버 출력 schema*만 표준화하고 수집 측은 운영자가 별도 점검.

## 4. 현재 사실

### 4.1 BFF (Cloudflare Pages Functions)

- `front/functions/api/bff/[[path]].ts`가 메인 proxy. 요청 검증, BFF secret 부착, 헤더 화이트리스트, public cache, mutation origin 검사를 수행한다.
- 현재 forwarded headers: `Content-Type`, `Cookie`, `Origin/Referer`(mutation 시), `X-Readmates-Club-Host`, `X-Readmates-Club-Slug`, `X-Readmates-Bff-Secret`, `X-Readmates-Client-IP`. **`X-Readmates-Request-Id`는 없다.**
- `front/functions/_shared/proxy.ts`가 helper들(`copyUpstreamHeaders`, `bffSecretFromEnv`, `clientIpFromRequest` 등)을 모아둔다. 응답 헤더는 `copyUpstreamHeaders`가 set-cookie sanitize 외에는 그대로 전달한다.
- OAuth 경로(`oauth2/authorization/[[registrationId]].ts`, `login/oauth2/code/[[registrationId]].ts`)도 동일 helper를 쓰지만 별도 구성이다.

### 4.2 Spring server

- `server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilter.kt`가 이미 존재한다. `X-Readmates-Request-Id` 헤더를 받아 검증(`^[A-Za-z0-9-]{12,64}$`)하고, 없거나 잘못된 경우 UUID에서 dash 제거 후 12자 hex를 생성한다. MDC `requestId`에 set, 응답 헤더에 set, finally에서 `MDC.remove`. 등록은 `RequestIdFilterRegistration`이 `Ordered.HIGHEST_PRECEDENCE`로 `/*`에 매핑한다.
- `server/src/main/resources/logback-spring.xml`은 plain text 인코더로 `%d{ISO8601} [%X{requestId:-no-req}] %-5level %logger{36} - %msg%n`을 출력한다. MDC `requestId`는 이미 패턴에 포함되어 있다.
- 알림 outbox: V20 migration이 `notification_event_outbox`를 만들고 V27/V28이 `notification_manual_dispatch_previews`, `notification_manual_dispatches`를 추가했다. 어떤 테이블에도 `request_id` 컬럼은 없다.
- 어댑터: `JdbcNotificationEventOutboxAdapter`가 outbox insert를 담당. row mapper는 `NotificationDeliveryRowMappers`.
- Publisher: `KafkaNotificationEventPublisherAdapter`가 `MessageBuilder`로 `readmates-schema-version`, `readmates-event-id`, `readmates-event-type` 세 헤더를 set한다. `readmates-*` 형식이 이미 컨벤션이다.
- Consumer: `NotificationEventKafkaListener.onMessage(message: NotificationEventMessage)`가 schema version 확인 후 `dispatchNotificationEventUseCase.dispatch(message)`를 호출한다. Kafka 헤더는 현재 사용하지 않는다.
- Relay: `NotificationRelayService`가 outbox row를 읽어 publisher에 위임. 이 경로가 row의 `request_id`를 publisher로 흘려야 한다.

### 4.3 SLO/Dashboard

- 서버에는 Micrometer/Prometheus가 활성화되어 있다. 정확한 metric 카탈로그는 `ReadmatesOperationalMetrics`에서 확인 가능. 본 phase의 catalog는 이를 *참조*만 한다.
- Grafana dashboard JSON 또는 ops 디렉토리는 현재 없음(`ops/` 신설).
- CI 백엔드 job은 `./gradlew check`(ktlint + detekt + tests + JaCoCo verify)를 단일 호출로 실행한다. lint script를 끼울 위치는 `Test`/`server check` step 직후.

### 4.4 Migration 번호

- 마지막 적용된 Flyway 번호는 V28(`manual_notification_dispatch_hardening`). 본 phase는 V29.

## 5. 핵심 결정

### 5.1 헤더 이름: `X-Readmates-Request-Id` / `readmates-request-id`

기존 코드와 일관성을 우선한다. BFF↔Spring HTTP에서는 이미 Spring filter가 쓰는 `X-Readmates-Request-Id`를 그대로 따른다. Kafka에서는 publisher의 기존 `readmates-*` lowercase 컨벤션(`readmates-event-id` 등)을 따라 `readmates-request-id`로 둔다. 다른 이름을 도입하면 `Ordered.HIGHEST_PRECEDENCE`로 이미 등록된 filter를 우회하거나 중복 처리 위험이 생기므로 회피.

### 5.2 ID 생성 책임은 BFF로 집중

Spring filter도 검증/생성을 할 수 있지만, BFF에서 먼저 생성/검증해 forward하면 BFF audit log와 응답 헤더가 같은 값으로 노출된다. **요청 1건당 단일 ID가 BFF entry부터 SMTP send까지 흐른다는 invariant**를 BFF가 보장한다. Spring filter는 fallback으로 남겨두며 변경하지 않는다 — 외부에서 직접 Spring 포트로 들어오는 path(테스트, 일부 OAuth callback, internal smoke)는 여전히 server 측에서 자가 생성한다.

### 5.3 검증 regex 동기화

BFF의 검증 regex는 Spring filter의 `^[A-Za-z0-9-]{12,64}$`와 정확히 같다. BFF 자체 생성도 12자 hex로 통일한다. 두 곳이 다르면 "BFF는 통과시켰는데 server filter가 재생성"하는 silent drift가 생긴다.

### 5.4 NULL `request_id`는 *의미 있는* 상태

스케줄러나 startup hook 같은 MDC가 비어 있는 path는 row를 NULL로 남긴다. 빈 문자열이나 `unknown`을 row에 영구화하면 향후 backfill/조회 시 "진짜 unknown"과 "기록 누락"을 구분할 수 없다. Kafka header는 spring-kafka header 필수성 때문에 null 대신 sentinel `unknown`을 보낸다(`@Header(required = false)`로 받아도 동일 효과지만 producer 측에서 명시적으로 unknown을 보내야 consumer가 MDC에 `unknown`을 기록해 audit 가능).

### 5.5 Logback JSON 인코더는 dev/prod 통일

dev profile만 plain text로 두면 dev 환경에서 본 로그와 prod의 로그 행동이 달라진다. ReadMates의 dev/prod parity는 멀티 클럽 도메인 incident에서 한 차례 깨진 적이 있어, 본 phase는 인코더를 통일한다. 가독성 보완은 `./gradlew bootRun 2>&1 | jq '.'`로 충분.

### 5.6 SLO catalog는 metric의 *카탈로그*, metric 추가의 driver는 아니다

PromQL query에 사용된 metric 이름이 현재 코드 metric과 정확히 일치하지 않으면 catalog는 schema 검증만 통과하고 dashboard에서 NaN으로 노출된다. Phase 0의 책임은 *카탈로그 형식 + loader + 향후 metric 추가 시 PR이 잡힐 lint surface*를 마련하는 것이다. 실제 metric 추가/이름 정리는 Phase 3 이전에 별도 spec으로 처리한다.

### 5.7 Migration V29는 ADD COLUMN NULL만

모든 `request_id` 컬럼은 NULL-safe로 추가한다. 향후 NOT NULL 전환은 backfill 후 별도 phase에서 결정한다. 인덱스는 추가하지 않는다 — 운영 조회는 grep + ad-hoc query 수준이며, hot path에서 `WHERE request_id = ?`로 검색하는 경로는 본 phase에 없다.

## 6. 구체 구현

각 항목은 plan의 task 번호를 참조하지만, 결정/패턴 중심으로 다시 정리한다. step-by-step TDD 흐름은 plan을 본다.

### 6.1 BFF helper: `requestIdForUpstream`

`front/functions/_shared/proxy.ts`에 다음 export를 추가한다. crypto.getRandomValues로 6 byte를 만들어 hex 12자로 변환 — Spring filter가 만드는 12자 hex와 동일한 alphabet/length.

```typescript
export const READMATES_REQUEST_ID_HEADER = "X-Readmates-Request-Id";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{12,64}$/;

function generateRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function requestIdForUpstream(request: Request): string {
  const inbound = request.headers.get(READMATES_REQUEST_ID_HEADER)?.trim();
  if (inbound && REQUEST_ID_PATTERN.test(inbound)) {
    return inbound;
  }
  return generateRequestId();
}
```

`front/functions/api/bff/[[path]].ts`의 헤더 구성 직전에 `const requestId = requestIdForUpstream(context.request);`를 호출하고, forward header `headers.set(READMATES_REQUEST_ID_HEADER, requestId)`, 응답 직후 `outboundResponse.headers.set(READMATES_REQUEST_ID_HEADER, requestId)`로 set한다. OAuth start/callback 두 파일도 같은 패턴.

테스트는 `front/tests/unit/functions/proxy-request-id.test.ts`에 4 case: inbound valid → preserved, missing → generated, blank → generated and trimmed, oversize → regenerated under 64. `Request` 생성은 standard `Request` constructor로 충분.

### 6.2 Spring filter: 변경 없음

`RequestIdFilter`는 4.2에 기술된 현재 동작을 그대로 유지한다. BFF가 forward한 값이 valid이면 server filter는 그 값을 그대로 MDC `requestId`에 쓴다. **외부에서 Spring API origin을 직접 신뢰 경계로 두는 BFF 정책상, BFF를 거치지 않은 요청은 X-Readmates-Request-Id가 없거나 임의값일 수 있다 — 이 경우 server filter가 fallback으로 생성한다.**

### 6.3 Flyway V29

`server/src/main/resources/db/mysql/migration/V29__correlation_request_id_columns.sql`:

```sql
-- Phase 0 (observability backbone): correlation id columns for log/audit join.
-- VARCHAR(64) matches RequestIdFilter regex ^[A-Za-z0-9-]{12,64}$.

ALTER TABLE notification_event_outbox
    ADD COLUMN request_id VARCHAR(64) NULL AFTER event_type;

ALTER TABLE notification_manual_dispatch_previews
    ADD COLUMN request_id VARCHAR(64) NULL;

ALTER TABLE notification_manual_dispatches
    ADD COLUMN request_id VARCHAR(64) NULL;
```

테이블 이름은 plan pre-flight에서 grep으로 재확인한다. 인덱스 없음 — 본 phase의 조회 경로는 grep 수준.

### 6.4 Outbox writer (`JdbcNotificationEventOutboxAdapter`)

MDC 의존은 adapter 레이어가 캡슐화. domain/use case는 무지.

```kotlin
import org.slf4j.MDC

private fun currentRequestId(): String? = MDC.get("requestId")?.takeIf { it.isNotBlank() }
```

`INSERT INTO notification_event_outbox` SQL에 `request_id` 컬럼을 추가하고, 바인딩에 `currentRequestId()`를 넣는다. 이 함수가 null이면 driver가 SQL NULL로 바인딩(`PreparedStatement.setObject(idx, null)`).

`NotificationDeliveryRowMappers`(또는 outbox row를 읽는 mapper)에 `requestId: String?` 필드를 추가. row를 publisher로 전달하는 path에서 사용한다(6.5 참조). 외부 응답 DTO에는 노출하지 않는다 — Phase 0는 server-internal 정보로 한정한다.

테스트는 (a) MDC가 set된 상태에서 enqueue → row.requestId == MDC 값, (b) MDC가 비었을 때 enqueue → row.requestId == NULL 두 case.

### 6.5 Kafka publisher port + adapter

`NotificationEventPublisherPort.publish`의 시그니처에 `requestId: String?`를 추가한다.

```kotlin
fun publish(message: NotificationEventMessage, topic: String, key: String, requestId: String?)
```

`KafkaNotificationEventPublisherAdapter.publish`의 `MessageBuilder`에 한 줄 추가:

```kotlin
.setHeader("readmates-request-id", requestId ?: "unknown")
```

Caller(`NotificationRelayService` 또는 동등 위치)는 outbox row의 `requestId`를 그대로 publisher에 전달한다. row.requestId가 null이면 publisher 측에서 `unknown` sentinel을 보낸다(5.4 참조).

테스트는 `KafkaTemplate`을 mock(Mockito) 또는 `EmbeddedKafkaIntegrationTest` fixture를 재사용하여 captured Message의 header를 검증. 두 case: requestId 제공 → header == 그 값, null 제공 → header == "unknown".

### 6.6 Kafka consumer (`NotificationEventKafkaListener`)

리스너 시그니처에 헤더 파라미터를 추가하고, 본문을 MDC try-finally로 감싼다.

```kotlin
import org.slf4j.MDC
import org.springframework.messaging.handler.annotation.Header

@KafkaListener(/* 기존과 동일 */)
fun onMessage(
    message: NotificationEventMessage,
    @Header(name = "readmates-request-id", required = false) requestId: String?,
) {
    val effectiveRequestId = requestId?.takeIf { it.isNotBlank() } ?: "unknown"
    MDC.put("requestId", effectiveRequestId)
    try {
        if (message.schemaVersion != SUPPORTED_SCHEMA_VERSION) {
            throw NotificationUnsupportedSchemaVersionException(message.schemaVersion)
        }
        dispatchNotificationEventUseCase.dispatch(message)
    } finally {
        MDC.remove("requestId")
    }
}
```

dispatch 내부에서 async/thread switch가 일어나면 MDC가 손실될 수 있다. 현재 dispatch path를 점검한 결과 `dispatchNotificationEventUseCase.dispatch(message)`는 같은 스레드에서 SMTP send까지 도달한다(별도 `CompletableFuture.supplyAsync` 또는 `@Async` 사용 없음). 만약 6.6 구현 중 async가 발견되면 plan의 task 5에 wrapping helper(`MdcContext.preserve { ... }`) 추가 task를 끼우고 이 문서를 업데이트한다.

테스트는 dispatch handler를 mock해 호출 시점의 `MDC.get("requestId")`를 캡처하고 finally 후 cleanup 됨을 검증.

### 6.7 Logback JSON 인코더

의존성: `server/build.gradle.kts` dependencies 블록에 한 줄.

```kotlin
implementation("net.logstash.logback:logstash-logback-encoder:7.4")
```

(Spring Boot 3.x의 Logback 1.4 BOM과 호환. 빌드 실패 시 spring-boot release notes의 logback 버전에 맞춰 encoder 메이저 버전 조정.)

`server/src/main/resources/logback-spring.xml` 전체:

```xml
<configuration>
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <includeMdcKeyName>requestId</includeMdcKeyName>
            <includeMdcKeyName>clubSlug</includeMdcKeyName>
            <includeMdcKeyName>sessionId</includeMdcKeyName>
            <includeMdcKeyName>actorId</includeMdcKeyName>
            <includeMdcKeyName>source</includeMdcKeyName>
            <includeMdcKeyName>eventType</includeMdcKeyName>
            <fieldNames>
                <timestamp>ts</timestamp>
                <message>msg</message>
                <logger>logger</logger>
                <thread>thread</thread>
                <levelValue>[ignore]</levelValue>
            </fieldNames>
        </encoder>
    </appender>

    <root level="INFO">
        <appender-ref ref="CONSOLE" />
    </root>
</configuration>
```

`includeMdcKeyName`을 명시적으로 6개 field에 한정한다. 다른 MDC 값을 우연히 흘리지 않기 위해서다. 더 추가할 field가 생기면 본 파일을 명시적으로 갱신해야 한다는 의도된 마찰.

`clubSlug`/`sessionId`/`actorId`/`source`/`eventType` 같은 추가 MDC field는 본 phase에서 *자동 채워지지 않는다*. 향후 phase에서 path matcher / SecurityContext / outbox dispatch path가 채우게 된다. 지금은 *흘릴 준비*만 한다.

Smoke 테스트 (`LogbackJsonEncoderTest`)는 `System.setOut` capture로 JSON 한 줄에 `requestId` 포함, `[ignore]` placeholder 미노출, JSON parse 가능함을 검증.

### 6.8 SLO catalog + loader

도메인 타입과 loader는 plan의 Task 7 코드 블록을 그대로 사용한다. 추가로 본 문서가 강조하는 결정:

- `SloCatalogConfiguration`이 `@Configuration` + `@Bean fun sloCatalog()`로 등록한다. ApplicationContext 시작 시 yaml이 로드되고 검증된다. 실패는 `IllegalStateException`으로 부트 중단.
- yaml은 `version: 1` 단일 버전만 허용. 향후 schema 변경은 version bump + loader switch로 처리한다.
- query는 *제안*임을 yaml 주석으로 명시한다(plan에 동일 경고 포함). 실제 metric과 mismatch가 발견되면 yaml만 수정하면 되도록 PromQL을 한 줄에 유지한다.

`server/src/main/resources/slo/slos.yaml` 전체:

```yaml
# Phase 0 카탈로그. PromQL은 *제안*이며 실제 metric 이름이 다르면 dashboard에서 NaN으로 노출된다.
# metric 추가/이름 정리는 Phase 3 이전 별도 spec.
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

Loader는 jackson-yaml + KotlinModule + SNAKE_CASE 정책으로 yaml의 `query_good` → `queryGood` Kotlin field로 매핑. 검증은 `version == 1`, slos non-empty, id regex, window regex, objective 범위, sli type, ratio/latency query 중 하나 이상 존재.

### 6.9 Grafana dashboards as code

`ops/grafana/dashboards/` 디렉토리를 신설하고 두 JSON을 둔다. plan의 Task 8 블록과 동일 — 본 문서는 이 dashboard들이 *최소 viable*임을 강조한다.

- `notification-dispatch.json`: 2 panel(publish success ratio, DEAD count). 향후 panel은 manual vs auto, latency p95 분포, dead-letter 누적 증분 등 추가.
- `bff-api-latency.json`: 2 panel(BFF→API p95, 5xx ratio).

`scripts/lint-grafana-dashboards.sh`는 `jq` 의존. `jq empty`로 JSON 유효성, `jq -r .title/.schemaVersion/(.panels | length)`로 필수 필드 강제. CI는 backend job의 `gradlew check` step 직후 호출.

JSON을 production Grafana에 import하는 책임은 본 phase 범위가 아니다. 운영자는 사람이 직접 import하거나 별도 sync 도구를 쓰며, repo는 source of truth.

### 6.10 End-to-end 회귀 테스트

두 층:

1. **Spring integration test (`CorrelationIdEndToEndTest`)**: `@SpringBootTest(WebEnvironment.RANDOM_PORT)`로 controller 호출 → `X-Readmates-Request-Id` 헤더 전달 → outbox row의 `request_id` 일치 + `KafkaTemplate` spy가 capture한 record의 `readmates-request-id` 헤더 일치를 검증한다. controller는 manual dispatch preview/confirm path를 사용해 실제 outbox enqueue가 일어나는 경로를 cover한다.
2. **Playwright (`correlation-id.spec.ts`)**: BFF `/api/bff/api/health`(또는 기존 smoke 경로) 호출이 응답 헤더 `X-Readmates-Request-Id`를 노출함, client-supplied 값이 보존됨을 검증한다. 이는 BFF helper만 다루며, server 측 propagation은 Spring integration test가 책임진다.

E2E full chain(BFF → server → DB → Kafka → consumer → SMTP) 검증을 단일 Playwright spec에서 시도하지 않는다. 비용 대비 깨질 가능성이 너무 크다.

## 7. 검증

본 phase 완료 시 다음 명령이 모두 통과한다. 각 명령은 plan의 마지막 task(Final verification)에서도 동일하게 실행된다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- correlation-id
pnpm --dir front test:e2e -- manual-notifications
./server/gradlew -p server check
./server/gradlew -p server integrationTest --tests "*CorrelationIdEndToEndTest*"
./scripts/lint-grafana-dashboards.sh
```

만약 환경 사정으로 일부 명령을 실행하지 못하면, AGENTS.md 규약대로 *실행하지 못한 명령과 이유*를 PR 본문 또는 commit log에 남긴다. "통과한 것처럼" 쓰지 않는다.

## 8. 운영 영향

- **로그 비용**: 한 라인이 plain text(약 100~200자)에서 JSON(약 250~400자)로 늘어난다. ReadMates의 현 로그 volume은 OCI Compose 단일 서버 기준 대단히 크지 않지만, retention/rotation 정책이 line bytes 기준이면 한 번은 운영자가 확인해야 한다. Phase 0 머지 직후 첫 24시간 로그 사이즈를 비교한다.
- **BFF latency**: `crypto.getRandomValues(6)` + regex test는 sub-microsecond. 측정 가능한 영향 없음.
- **Spring throughput**: MDC put/remove, Kafka header 1개 추가, outbox row 1 컬럼은 영향 없음. publisher path는 이미 `readmates-*` 3개 헤더를 set하던 곳.
- **Migration**: V29는 ADD COLUMN NULL만이므로 online schema change 도구 없이 적용 가능. 그러나 대형 테이블에서 ALTER TABLE은 lock을 잡을 수 있다. 알림 outbox는 정기적으로 정리되어 row 수가 폭증할 가능성은 낮으나, 운영 적용은 트래픽 적은 시간대에 권장한다.
- **OCI 로그 인덱싱**: 외부 수집 도구가 plain text format을 가정하고 있다면 JSON 전환 후 grep pattern과 dashboard query를 한 차례 재점검해야 한다. 운영 runbook에 표기.
- **호환성**: 응답 헤더 `X-Readmates-Request-Id`가 추가되며, 브라우저/SPA는 이 헤더를 무시해도 무방하다. CORS preflight에 영향 없음(simple response header).

## 9. 후속 작업

본 phase 완료 직후 다음을 의사결정한다(별도 spec).

1. **Phase 1 (Boundary inventory)** brainstorming 시작. `feedback`, `notification ↔ session`, `session ↔ membership` 등 cross-context 직접 호출 audit. ArchUnit 규칙 generalize.
2. SLO catalog의 PromQL이 실제 metric과 일치하는지 점검. 미존재 metric은 Phase 1 또는 별도 metric 추가 spec으로 분리.
3. SPA가 BFF 응답의 `X-Readmates-Request-Id`를 user-visible(예: 지원 요청 양식의 자동 포함, 오류 toast의 작은 글씨)하게 노출할지 검토.
4. OCI 로그 수집 측 인덱싱 schema/필드 매핑 update.
5. `clubSlug`/`sessionId`/`actorId`/`source`/`eventType` MDC field를 *자동 채우는* path filter/interceptor 도입. Phase 0는 logging schema만 준비하고 실제 채우기는 다음 phase의 책임으로 둔다.
