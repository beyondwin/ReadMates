# Confidence Initiative Phase 0 — Observability Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BFF → Spring → Kafka producer → consumer → SMTP send 경로 전체에 단일 `X-Readmates-Request-Id`(MDC `requestId`)를 흐르게 하고, 서버 로그를 structured JSON으로 표준화하며, SLO 카탈로그와 Grafana dashboard를 코드로 보유한다.

**Architecture:** Spring 서버는 이미 `RequestIdFilter`로 MDC `requestId`를 바인딩하고 `%X{requestId}` Logback pattern을 갖고 있다. 이 plan은 (1) Cloudflare Pages BFF가 `X-Readmates-Request-Id`를 생성/forward, (2) 알림 outbox row에 `request_id` 컬럼 추가 + capture, (3) Kafka producer header 전파 + consumer MDC 바인딩, (4) Logback JSON 인코더 전환, (5) SLO yaml + loader, (6) Grafana JSON + lint를 추가한다. 모든 변경은 NULL-safe migration과 in-place wiring만 사용해 회귀 가능성을 좁힌다.

**Tech Stack:** Cloudflare Pages Functions (TypeScript), Kotlin/Spring Boot, Flyway/MySQL, Spring Kafka, Logback + `logstash-logback-encoder`, Jackson(yaml), Grafana JSON, Bash for lint.

**Spec:** [Phase 0 Observability spec](../specs/2026-05-16-confidence-initiative-phase-0-observability-design.md)

---

## Pre-flight: 코드베이스 anchor 확인

플랜 시작 전 다음 anchor가 현재 main에 존재함을 1회 확인한다 (file paths only). 이후 task들은 이 anchor들을 직접 인용한다.

- [ ] `server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilter.kt` (이미 존재 — 변경 없음)
- [ ] `server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapter.kt` (producer)
- [ ] `server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListener.kt` (consumer)
- [ ] `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt` (outbox writer)
- [ ] `server/src/main/resources/logback-spring.xml`
- [ ] `server/src/main/resources/db/mysql/migration/V20__kafka_notification_pipeline.sql` (outbox table 정의 위치)
- [ ] `front/functions/api/bff/[[path]].ts` (BFF main proxy)
- [ ] `front/functions/_shared/proxy.ts` (BFF helpers)

확인 명령:
```bash
ls server/src/main/kotlin/com/readmates/shared/observability/RequestIdFilter.kt \
   server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapter.kt \
   server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListener.kt \
   server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt \
   server/src/main/resources/logback-spring.xml \
   front/functions/api/bff/[[path]].ts
```
파일 중 하나라도 누락이면 plan 진행 전 알려야 한다.

또한 outbox/dispatch 테이블 이름을 한 번 확인:
```bash
grep -E "CREATE TABLE.*(outbox|manual_dispatch)" server/src/main/resources/db/mysql/migration/V*.sql
```
이 명령 결과(테이블 이름)는 Task 2의 migration 작성에 사용한다.

---

## Task 1: BFF가 `X-Readmates-Request-Id`를 생성·검증·forward·응답에 set

**Files:**
- Modify: `front/functions/_shared/proxy.ts` (helper 추가)
- Modify: `front/functions/api/bff/[[path]].ts` (forward + response header)
- Test: `front/tests/unit/functions/proxy-request-id.test.ts`

검증 규칙은 Spring `RequestIdFilter`의 regex `^[A-Za-z0-9-]{12,64}$`와 정확히 동일해야 한다. BFF에서 생성하는 경우 server filter와 동일한 12자 hex(UUID에서 dash 제거 후 12자)를 사용한다.

- [ ] **Step 1: Write the failing test**

`front/tests/unit/functions/proxy-request-id.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { requestIdForUpstream, READMATES_REQUEST_ID_HEADER } from "../../../functions/_shared/proxy";

describe("requestIdForUpstream", () => {
  it("returns the inbound header when it matches the allowed pattern", () => {
    const request = new Request("https://example.test", {
      headers: { [READMATES_REQUEST_ID_HEADER]: "abc123def4567" },
    });
    expect(requestIdForUpstream(request)).toBe("abc123def4567");
  });

  it("generates a new id when the inbound header is missing", () => {
    const request = new Request("https://example.test");
    const id = requestIdForUpstream(request);
    expect(id).toMatch(/^[A-Za-z0-9-]{12,64}$/);
  });

  it("generates a new id when the inbound header violates the pattern", () => {
    const request = new Request("https://example.test", {
      headers: { [READMATES_REQUEST_ID_HEADER]: "  " },
    });
    const id = requestIdForUpstream(request);
    expect(id).toMatch(/^[A-Za-z0-9-]{12,64}$/);
    expect(id.trim()).toBe(id);
  });

  it("generates a new id when the inbound header is too long", () => {
    const request = new Request("https://example.test", {
      headers: { [READMATES_REQUEST_ID_HEADER]: "a".repeat(100) },
    });
    const id = requestIdForUpstream(request);
    expect(id.length).toBeLessThanOrEqual(64);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --dir front test -- proxy-request-id
```
Expected: FAIL with `requestIdForUpstream` not exported.

- [ ] **Step 3: Add helper to `front/functions/_shared/proxy.ts`**

파일 끝에 추가:

```typescript
export const READMATES_REQUEST_ID_HEADER = "X-Readmates-Request-Id";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{12,64}$/;

function generateRequestId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

export function requestIdForUpstream(request: Request): string {
  const inbound = request.headers.get(READMATES_REQUEST_ID_HEADER)?.trim();
  if (inbound && REQUEST_ID_PATTERN.test(inbound)) {
    return inbound;
  }
  return generateRequestId();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --dir front test -- proxy-request-id
```
Expected: PASS (4 cases).

- [ ] **Step 5: Wire helper into BFF main proxy**

`front/functions/api/bff/[[path]].ts`의 header 구성 블록(현재 약 line 133 이후 `const headers = new Headers();` 다음)에서 다음을 추가한다 — `Origin/Referer` set 직후, `X-Readmates-Club-Host` set 이전이 적절:

```typescript
import {
  apiBaseUrlFromEnv,
  bffSecretFromEnv,
  clientIpFromRequest,
  copyUpstreamHeaders,
  normalizedHostFromRequest,
  requestIdForUpstream,
  READMATES_REQUEST_ID_HEADER,
} from "../../_shared/proxy";
// ...
const requestId = requestIdForUpstream(context.request);
headers.set(READMATES_REQUEST_ID_HEADER, requestId);
```

응답에도 set한다 — `new Response(...)` 직후:

```typescript
outboundResponse.headers.set(READMATES_REQUEST_ID_HEADER, requestId);
```

(`copyUpstreamHeaders`가 Spring 응답에서 같은 헤더를 이미 전달하므로 BFF가 생성한 id로 덮어쓰는 단일 source of truth가 된다.)

- [ ] **Step 6: Apply 동일한 패턴을 OAuth proxy에도 (선택, 권장)**

`front/functions/oauth2/authorization/[[registrationId]].ts`와 `front/functions/login/oauth2/code/[[registrationId]].ts`는 OAuth start/callback이다. 두 파일도 동일 helper를 사용해 header를 set/forward한다. 실제 OAuth 흐름 검증은 Task 9의 E2E에서.

- [ ] **Step 7: Frontend 회귀 체크**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```
Expected: 모두 PASS.

- [ ] **Step 8: Commit**

```bash
git add front/functions/_shared/proxy.ts \
        front/functions/api/bff/'[[path]].ts' \
        front/functions/oauth2/authorization/'[[registrationId]].ts' \
        front/functions/login/oauth2/code/'[[registrationId]].ts' \
        front/tests/unit/functions/proxy-request-id.test.ts
git commit -m "feat(bff): forward X-Readmates-Request-Id and set on response"
```

---

## Task 2: Flyway V29 — outbox/dispatch 테이블에 `request_id` 컬럼 추가

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V29__correlation_request_id_columns.sql`
- Test: 기존 `./gradlew :server:test`(Flyway 검증 포함)로 충분. 별도 마이그레이션 specific test는 추가하지 않음.

Pre-flight에서 확인한 테이블 이름을 그대로 사용한다. 일반적으로 `notification_event_outbox`, `notification_manual_dispatch_previews`, `notification_manual_dispatches`. **Pre-flight grep 결과가 다르면 아래 컬럼 이름은 유지하되 테이블 이름을 그대로 치환한다.**

- [ ] **Step 1: Create migration**

`server/src/main/resources/db/mysql/migration/V29__correlation_request_id_columns.sql`:

```sql
-- Phase 0 (observability backbone): correlation id columns for log/audit join.
-- Nullable VARCHAR(64) matches RequestIdFilter regex ^[A-Za-z0-9-]{12,64}$.

ALTER TABLE notification_event_outbox
    ADD COLUMN request_id VARCHAR(64) NULL AFTER event_type;

ALTER TABLE notification_manual_dispatch_previews
    ADD COLUMN request_id VARCHAR(64) NULL;

ALTER TABLE notification_manual_dispatches
    ADD COLUMN request_id VARCHAR(64) NULL;
```

- [ ] **Step 2: Run server test to verify migration applies cleanly**

```bash
./server/gradlew -p server unitTest
```
Expected: PASS. Flyway가 V29를 적용한 testcontainer DB에서 모든 테스트가 통과.

만약 컬럼 이름이 기존 schema와 충돌(예: 이미 존재)하면 grep으로 확인 후 conflict 해결:
```bash
grep -n "request_id" server/src/main/resources/db/mysql/migration/V*.sql
```

- [ ] **Step 3: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V29__correlation_request_id_columns.sql
git commit -m "feat(db): add request_id columns to outbox and manual dispatch tables (V29)"
```

---

## Task 3: Outbox writer가 MDC `requestId`를 row에 저장

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt` (존재 시 case 추가, 없으면 신규 작성)

MDC에서 값을 읽는 책임은 adapter 레이어가 갖는다(domain은 무지). 어댑터는 `MDC.get("requestId")`를 호출하고, null이면 빈 문자열이 아닌 NULL로 저장한다(scheduled job 등 MDC가 비어 있는 path 식별을 쉽게 하기 위함).

- [ ] **Step 1: Write the failing test**

`server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`에 case 추가:

```kotlin
@Test
fun `outbox insert persists MDC requestId into request_id column`() {
    MDC.put("requestId", "test-req-1234")
    try {
        val eventId = adapter.enqueue(buildSampleEvent())
        val storedRequestId =
            jdbcTemplate.queryForObject(
                "SELECT request_id FROM notification_event_outbox WHERE event_id = ?",
                String::class.java,
                eventId.toString(),
            )
        assertEquals("test-req-1234", storedRequestId)
    } finally {
        MDC.remove("requestId")
    }
}

@Test
fun `outbox insert stores NULL request_id when MDC is empty`() {
    MDC.remove("requestId")
    val eventId = adapter.enqueue(buildSampleEvent())
    val storedRequestId =
        jdbcTemplate.queryForObject(
            "SELECT request_id FROM notification_event_outbox WHERE event_id = ?",
            String::class.java,
            eventId.toString(),
        )
    assertNull(storedRequestId)
}
```

`buildSampleEvent()`와 fixture wiring은 기존 outbox adapter test 패턴(같은 디렉토리 내 다른 test 파일)을 그대로 따른다.

- [ ] **Step 2: Run test to verify it fails**

```bash
./server/gradlew -p server unitTest --tests "*JdbcNotificationEventOutboxAdapterTest*"
```
Expected: FAIL — `storedRequestId`가 null (어댑터가 MDC를 읽지 않음).

- [ ] **Step 3: Modify adapter**

`JdbcNotificationEventOutboxAdapter`의 insert SQL에 `request_id` 컬럼을 추가하고, parameter를 MDC에서 읽어 바인딩한다. (정확한 SQL anchor는 파일 내 `INSERT INTO notification_event_outbox` 검색.)

```kotlin
import org.slf4j.MDC
// ...

private fun currentRequestId(): String? = MDC.get("requestId")?.takeIf { it.isNotBlank() }

// SQL 변경 예:
// INSERT INTO notification_event_outbox (event_id, event_type, request_id, ...)
// VALUES (?, ?, ?, ...)
// 그리고 bind에서 currentRequestId()를 해당 자리에 넣음
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./server/gradlew -p server unitTest --tests "*JdbcNotificationEventOutboxAdapterTest*"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt \
        server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt
git commit -m "feat(notification): persist MDC requestId into outbox row"
```

---

## Task 4: Outbox relay/Kafka producer가 `readmates-request-id` header 설정

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt` (relay가 outbox row를 읽어 publisher에 전달)
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapter.kt` (publisher가 header 추가)
- Modify: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationEventPublisherPort.kt` (port signature 변경)
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapterTest.kt`

Publisher port에 `requestId: String?` 파라미터를 추가한다(`String?`, null-safe).

- [ ] **Step 1: Write the failing test**

`KafkaNotificationEventPublisherAdapterTest`에 case 추가(EmbeddedKafka 또는 Testcontainers Kafka가 이미 있다면 그것을 사용; 없다면 `KafkaTemplate`을 mock하고 `send()`의 message 인수를 검증):

```kotlin
@Test
fun `publish sets readmates-request-id header when requestId is provided`() {
    val captor = argumentCaptor<Message<NotificationEventMessage>>()
    whenever(kafkaTemplate.send(captor.capture())).thenReturn(CompletableFuture.completedFuture(mockSendResult))

    adapter.publish(sampleMessage, topic = "t", key = "k", requestId = "test-req-1234")

    val headers = captor.firstValue.headers
    assertEquals("test-req-1234", headers.get("readmates-request-id", String::class.java))
}

@Test
fun `publish sets readmates-request-id to 'unknown' when requestId is null`() {
    val captor = argumentCaptor<Message<NotificationEventMessage>>()
    whenever(kafkaTemplate.send(captor.capture())).thenReturn(CompletableFuture.completedFuture(mockSendResult))

    adapter.publish(sampleMessage, topic = "t", key = "k", requestId = null)

    val headers = captor.firstValue.headers
    assertEquals("unknown", headers.get("readmates-request-id", String::class.java))
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./server/gradlew -p server unitTest --tests "*KafkaNotificationEventPublisherAdapterTest*"
```
Expected: FAIL — port에 `requestId` 파라미터가 없거나, header가 set되지 않음.

- [ ] **Step 3: Update port signature**

`NotificationEventPublisherPort.kt`:
```kotlin
fun publish(
    message: NotificationEventMessage,
    topic: String,
    key: String,
    requestId: String?,
)
```

- [ ] **Step 4: Update adapter to set header**

`KafkaNotificationEventPublisherAdapter.publish`의 `MessageBuilder` 블록에 추가:

```kotlin
.setHeader("readmates-request-id", requestId ?: "unknown")
```

- [ ] **Step 5: Update relay caller**

`NotificationRelayService`(또는 outbox row → publisher 호출 위치)는 row에서 `requestId`를 읽어 publisher에 전달한다. row → message domain object 매핑 코드와 publisher 호출 anchor를 grep으로 찾는다:

```bash
grep -n "publisher.publish\|NotificationEventPublisherPort" server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt
```

해당 호출 지점에서 `requestId = row.requestId`를 추가한다. row DTO에 `requestId` 필드를 노출하려면 `NotificationDeliveryRowMappers` 또는 동일 위치의 row record에 컬럼을 추가한다. SQL projection도 `request_id`를 select하도록 수정.

- [ ] **Step 6: Run test to verify it passes**

```bash
./server/gradlew -p server unitTest --tests "*KafkaNotificationEventPublisherAdapterTest*" \
                                       --tests "*NotificationRelay*"
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationEventPublisherPort.kt \
        server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapter.kt \
        server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt \
        server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryRowMappers.kt \
        server/src/test/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapterTest.kt
git commit -m "feat(notification): propagate requestId via readmates-request-id Kafka header"
```

---

## Task 5: Kafka consumer가 `readmates-request-id` 헤더를 MDC에 바인딩

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListener.kt`
- Test: `server/src/test/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListenerTest.kt`

리스너 메서드 진입 시 헤더를 읽어 MDC에 set, finally에서 cleanup. async/thread switch는 listener 메서드 안에서 일어나지 않으면 별도 wrapping helper 불필요.

- [ ] **Step 1: Write the failing test**

```kotlin
@Test
fun `onMessage binds readmates-request-id header to MDC during dispatch`() {
    var observedRequestId: String? = null
    whenever(dispatchUseCase.dispatch(any())).thenAnswer {
        observedRequestId = MDC.get("requestId")
        Unit
    }

    listener.onMessage(sampleMessage, requestId = "test-req-1234")

    assertEquals("test-req-1234", observedRequestId)
    assertNull(MDC.get("requestId"), "MDC should be cleaned up after dispatch")
}

@Test
fun `onMessage uses 'unknown' MDC requestId when header is missing or empty`() {
    var observedRequestId: String? = null
    whenever(dispatchUseCase.dispatch(any())).thenAnswer {
        observedRequestId = MDC.get("requestId")
        Unit
    }

    listener.onMessage(sampleMessage, requestId = null)

    assertEquals("unknown", observedRequestId)
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./server/gradlew -p server unitTest --tests "*NotificationEventKafkaListenerTest*"
```
Expected: FAIL — listener 시그니처에 `requestId` 파라미터 없음.

- [ ] **Step 3: Modify listener**

```kotlin
import org.slf4j.MDC
import org.springframework.messaging.handler.annotation.Header
// ...

@KafkaListener(
    topics = ["\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}"],
    groupId = "\${readmates.notifications.kafka.consumer-group:readmates-notification-dispatcher}",
    containerFactory = "notificationKafkaListenerContainerFactory",
)
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

- [ ] **Step 4: Run test to verify it passes**

```bash
./server/gradlew -p server unitTest --tests "*NotificationEventKafkaListenerTest*"
```
Expected: PASS (2 cases).

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListener.kt \
        server/src/test/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListenerTest.kt
git commit -m "feat(notification): bind readmates-request-id Kafka header into MDC on consume"
```

---

## Task 6: Logback JSON encoder + 공통 MDC field 표준화

**Files:**
- Modify: `server/build.gradle.kts` (dependency 추가)
- Modify: `server/src/main/resources/logback-spring.xml` (JSON encoder)
- Test: `server/src/test/kotlin/com/readmates/shared/observability/LogbackJsonEncoderTest.kt`

dev 환경에서도 JSON으로 통일한다(Spec Open Question 결정). 가독성은 `jq`로 보완.

- [ ] **Step 1: Add dependency**

`server/build.gradle.kts`의 dependencies 블록에 추가:

```kotlin
implementation("net.logstash.logback:logstash-logback-encoder:7.4")
```

(`7.4`는 Logback 1.4+ 호환. 빌드 실패 시 spring-boot BOM의 Logback 버전에 맞는 logstash-logback-encoder 버전을 README/release notes에서 확인.)

- [ ] **Step 2: Replace logback-spring.xml**

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

- [ ] **Step 3: Write smoke test**

`server/src/test/kotlin/com/readmates/shared/observability/LogbackJsonEncoderTest.kt`:

```kotlin
package com.readmates.shared.observability

import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertFalse
import java.io.ByteArrayOutputStream
import java.io.PrintStream

class LogbackJsonEncoderTest {
    @Test
    fun `console log line is valid JSON containing requestId from MDC`() {
        val originalOut = System.out
        val captured = ByteArrayOutputStream()
        System.setOut(PrintStream(captured))
        try {
            MDC.put("requestId", "smoke-req-1234")
            LoggerFactory.getLogger(LogbackJsonEncoderTest::class.java).info("smoke-line")
        } finally {
            System.setOut(originalOut)
            MDC.remove("requestId")
        }
        val line = captured.toString().lineSequence().first { it.contains("smoke-line") }
        assertTrue(line.trim().startsWith("{"), "log line should be JSON: $line")
        assertTrue(line.contains("\"requestId\":\"smoke-req-1234\""), "missing requestId in: $line")
        assertFalse(line.contains("[ignore]"), "should not contain placeholder")
    }
}
```

- [ ] **Step 4: Run server tests**

```bash
./server/gradlew -p server unitTest --tests "*LogbackJsonEncoderTest*"
./server/gradlew -p server check
```
Expected: PASS.

테스트 실패 시 logstash-logback-encoder 버전을 spring-boot 3.x BOM의 Logback과 맞는지 확인하고 조정.

- [ ] **Step 5: Update local-setup docs note**

`docs/development/local-setup.md`(또는 가까운 dev guide)에 한 줄 추가: "Server 로그는 JSON 형식이므로 `./server/gradlew bootRun 2>&1 | jq '.'`로 보기 좋게 볼 수 있다."

- [ ] **Step 6: Commit**

```bash
git add server/build.gradle.kts \
        server/src/main/resources/logback-spring.xml \
        server/src/test/kotlin/com/readmates/shared/observability/LogbackJsonEncoderTest.kt \
        docs/development/local-setup.md
git commit -m "feat(server): switch logback to JSON encoder with standard MDC fields"
```

---

## Task 7: SLO catalog yaml + Kotlin loader + tests

**Files:**
- Create: `server/src/main/resources/slo/slos.yaml`
- Create: `server/src/main/kotlin/com/readmates/shared/observability/slo/SloCatalog.kt`
- Create: `server/src/main/kotlin/com/readmates/shared/observability/slo/SloCatalogLoader.kt`
- Test: `server/src/test/kotlin/com/readmates/shared/observability/slo/SloCatalogLoaderTest.kt`

YAML 파싱은 spring-boot에 이미 포함된 SnakeYAML 또는 jackson-yaml 사용. Spec section 4.7의 schema를 그대로 따른다. Loader는 `@Configuration`으로 등록되어 startup에 catalog를 검증 후 bean으로 노출. 검증 실패는 `IllegalStateException`을 던져 부트 실패.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.readmates.shared.observability.slo

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.Assertions.assertEquals

class SloCatalogLoaderTest {
    @Test
    fun `loads valid catalog with three SLOs`() {
        val catalog = SloCatalogLoader().loadFromClasspath("/slo/slos.yaml")
        assertEquals(1, catalog.version)
        assertEquals(3, catalog.slos.size)
        val ids = catalog.slos.map { it.id }.toSet()
        assertEquals(setOf("notification_dispatch_success_ratio", "bff_api_p95", "login_success_ratio"), ids)
    }

    @Test
    fun `fails when ratio objective is out of range`() {
        val yaml = """
            version: 1
            slos:
              - id: bad_ratio
                description: invalid
                objective: 1.5
                window: 7d
                sli:
                  type: prometheus
                  query_good: sum(x)
                  query_total: sum(y)
        """.trimIndent()
        assertThrows<IllegalStateException> { SloCatalogLoader().loadFromString(yaml) }
    }

    @Test
    fun `fails when required field is missing`() {
        val yaml = """
            version: 1
            slos:
              - id: no_sli
                description: missing sli
                objective: 0.99
                window: 7d
        """.trimIndent()
        assertThrows<IllegalStateException> { SloCatalogLoader().loadFromString(yaml) }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./server/gradlew -p server unitTest --tests "*SloCatalogLoaderTest*"
```
Expected: FAIL — class 미존재.

- [ ] **Step 3: Implement domain types**

`server/src/main/kotlin/com/readmates/shared/observability/slo/SloCatalog.kt`:

```kotlin
package com.readmates.shared.observability.slo

data class SloCatalog(
    val version: Int,
    val slos: List<SloDefinition>,
)

data class SloDefinition(
    val id: String,
    val description: String,
    val objective: Double?,
    val objectiveMs: Long?,
    val window: String,
    val sli: SloIndicator,
)

data class SloIndicator(
    val type: String,
    val queryGood: String?,
    val queryTotal: String?,
    val queryLatencyP95: String?,
)
```

- [ ] **Step 4: Implement loader**

`server/src/main/kotlin/com/readmates/shared/observability/slo/SloCatalogLoader.kt`:

```kotlin
package com.readmates.shared.observability.slo

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.KotlinModule
import com.fasterxml.jackson.module.kotlin.readValue
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

class SloCatalogLoader {
    private val mapper: ObjectMapper =
        ObjectMapper(YAMLFactory())
            .registerModule(KotlinModule.Builder().build())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

    fun loadFromClasspath(path: String): SloCatalog {
        val stream = SloCatalogLoader::class.java.getResourceAsStream(path)
            ?: error("SLO catalog not found on classpath: $path")
        val catalog: SloCatalog = mapper.readValue(stream)
        validate(catalog)
        return catalog
    }

    fun loadFromString(yaml: String): SloCatalog {
        val catalog: SloCatalog = mapper.readValue(yaml)
        validate(catalog)
        return catalog
    }

    private fun validate(catalog: SloCatalog) {
        check(catalog.version == 1) { "Unsupported SLO catalog version: ${catalog.version}" }
        check(catalog.slos.isNotEmpty()) { "SLO catalog must define at least one SLO" }
        val ids = mutableSetOf<String>()
        for (slo in catalog.slos) {
            check(slo.id.matches(Regex("^[a-z][a-z0-9_]+$"))) { "Invalid SLO id: ${slo.id}" }
            check(ids.add(slo.id)) { "Duplicate SLO id: ${slo.id}" }
            check(slo.window.matches(Regex("^[0-9]+[dhm]$"))) { "Invalid window for ${slo.id}: ${slo.window}" }
            check(slo.objective != null || slo.objectiveMs != null) { "${slo.id} must declare objective or objective_ms" }
            slo.objective?.let { check(it in 0.0..1.0) { "${slo.id} objective must be 0..1" } }
            check(slo.sli.type == "prometheus") { "${slo.id} unsupported sli.type: ${slo.sli.type}" }
            val ratioOk = slo.sli.queryGood != null && slo.sli.queryTotal != null
            val latencyOk = slo.sli.queryLatencyP95 != null
            check(ratioOk || latencyOk) { "${slo.id} sli must declare ratio or latency_p95 queries" }
        }
    }
}

@Configuration
class SloCatalogConfiguration {
    @Bean
    fun sloCatalog(): SloCatalog = SloCatalogLoader().loadFromClasspath("/slo/slos.yaml")
}
```

- [ ] **Step 5: Create `slos.yaml`**

`server/src/main/resources/slo/slos.yaml`:

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

> 주의: 위 query에 사용된 metric 이름(`readmates_outbox_publish_total`, `readmates_bff_api_latency_seconds_bucket`, `readmates_login_total`)은 *제안*이다. 실제 운영 metric 카탈로그에 동일 이름이 없으면 Grafana dashboard에서 runtime 시 NaN으로 잡힌다(Task 8에서 점검). metric 추가는 본 plan 범위 밖이며 별도 spec으로 처리.

- [ ] **Step 6: Run tests**

```bash
./server/gradlew -p server unitTest --tests "*SloCatalogLoaderTest*"
./server/gradlew -p server check
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/resources/slo/slos.yaml \
        server/src/main/kotlin/com/readmates/shared/observability/slo/SloCatalog.kt \
        server/src/main/kotlin/com/readmates/shared/observability/slo/SloCatalogLoader.kt \
        server/src/test/kotlin/com/readmates/shared/observability/slo/SloCatalogLoaderTest.kt
git commit -m "feat(server): add SLO catalog yaml + startup loader with schema validation"
```

---

## Task 8: Grafana dashboards-as-code + lint

**Files:**
- Create: `ops/grafana/dashboards/notification-dispatch.json`
- Create: `ops/grafana/dashboards/bff-api-latency.json`
- Create: `scripts/lint-grafana-dashboards.sh`
- Modify: `.github/workflows/ci.yml` (또는 동일한 server quality gate 파일) — lint 호출 추가
- Test: `scripts/lint-grafana-dashboards.sh`가 직접 실행 가능한 smoke로 충분.

Dashboard JSON은 Grafana 11 schema 11 기준. panel 최소 1개씩. 본 plan은 정합한 minimal JSON과 lint를 도입하는 것이 목적이다 — panel 디자인 polish는 spec 외 범위.

- [ ] **Step 1: Create notification-dispatch.json**

`ops/grafana/dashboards/notification-dispatch.json`:

```json
{
  "title": "Notification Dispatch",
  "schemaVersion": 38,
  "version": 1,
  "tags": ["readmates", "phase-0"],
  "timezone": "browser",
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "Outbox publish success ratio (5m rate)",
      "targets": [
        {
          "expr": "sum(rate(readmates_outbox_publish_total{result=\"success\"}[5m])) / sum(rate(readmates_outbox_publish_total[5m]))",
          "refId": "A"
        }
      ],
      "fieldConfig": { "defaults": { "unit": "percentunit" } },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 }
    },
    {
      "id": 2,
      "type": "stat",
      "title": "Outbox DEAD count",
      "targets": [
        {
          "expr": "sum(readmates_outbox_dead_total)",
          "refId": "A"
        }
      ],
      "gridPos": { "h": 8, "w": 6, "x": 12, "y": 0 }
    }
  ]
}
```

- [ ] **Step 2: Create bff-api-latency.json**

`ops/grafana/dashboards/bff-api-latency.json`:

```json
{
  "title": "BFF -> API Latency",
  "schemaVersion": 38,
  "version": 1,
  "tags": ["readmates", "phase-0"],
  "timezone": "browser",
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "BFF -> API p95 (ms)",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(readmates_bff_api_latency_seconds_bucket[5m])) by (le)) * 1000",
          "refId": "A"
        }
      ],
      "fieldConfig": { "defaults": { "unit": "ms" } },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 }
    },
    {
      "id": 2,
      "type": "timeseries",
      "title": "5xx ratio",
      "targets": [
        {
          "expr": "sum(rate(readmates_bff_api_response_total{status=~\"5..\"}[5m])) / sum(rate(readmates_bff_api_response_total[5m]))",
          "refId": "A"
        }
      ],
      "fieldConfig": { "defaults": { "unit": "percentunit" } },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 }
    }
  ]
}
```

- [ ] **Step 3: Create lint script**

`scripts/lint-grafana-dashboards.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DIR="${1:-ops/grafana/dashboards}"
fail=0

if ! command -v jq >/dev/null; then
  echo "lint-grafana-dashboards: jq is required" >&2
  exit 2
fi

shopt -s nullglob
files=("$DIR"/*.json)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "lint-grafana-dashboards: no JSON files under $DIR" >&2
  exit 2
fi

for f in "${files[@]}"; do
  if ! jq empty "$f" >/dev/null 2>&1; then
    echo "INVALID JSON: $f" >&2
    fail=1
    continue
  fi
  title=$(jq -r '.title // empty' "$f")
  schema=$(jq -r '.schemaVersion // empty' "$f")
  panels=$(jq -r '.panels | length // 0' "$f")
  if [[ -z "$title" || -z "$schema" || "$panels" == "0" ]]; then
    echo "MISSING REQUIRED FIELDS in $f (title=$title schemaVersion=$schema panels=$panels)" >&2
    fail=1
  fi
done

if [[ $fail -eq 0 ]]; then
  echo "lint-grafana-dashboards: ${#files[@]} dashboard(s) ok"
fi
exit $fail
```

```bash
chmod +x scripts/lint-grafana-dashboards.sh
```

- [ ] **Step 4: Run lint locally**

```bash
./scripts/lint-grafana-dashboards.sh
```
Expected: `lint-grafana-dashboards: 2 dashboard(s) ok`.

`scripts/lint-grafana-dashboards.sh` 위에 잘못된 JSON을 추가해 일부러 fail 시켜 확인 후 원복:
```bash
echo "{ not json" > ops/grafana/dashboards/_broken.json
./scripts/lint-grafana-dashboards.sh; rm ops/grafana/dashboards/_broken.json
```
Expected: exit code != 0, `INVALID JSON` 메시지.

- [ ] **Step 5: Wire into CI**

CI에서 backend quality gate 단계에 lint를 추가한다. 정확한 위치는 grep:
```bash
grep -nr "gradlew check\|backend-reports" .github/workflows/
```
backend job의 `- name: server check` step 직후에 다음 step을 삽입:

```yaml
      - name: Lint Grafana dashboards
        run: ./scripts/lint-grafana-dashboards.sh
```

- [ ] **Step 6: Update scripts/README.md**

`scripts/README.md`에 새 스크립트 한 줄 추가:

```markdown
- `lint-grafana-dashboards.sh` — `ops/grafana/dashboards/*.json` JSON 유효성과 필수 필드(`title`, `schemaVersion`, `panels`)를 검사합니다. CI에서 호출됩니다.
```

- [ ] **Step 7: Commit**

```bash
git add ops/grafana/dashboards/notification-dispatch.json \
        ops/grafana/dashboards/bff-api-latency.json \
        scripts/lint-grafana-dashboards.sh \
        scripts/README.md \
        .github/workflows/ci.yml
git commit -m "feat(ops): add Phase 0 Grafana dashboards as code with CI lint"
```

---

## Task 9: End-to-end correlation 회귀 테스트

**Files:**
- Create: `front/tests/e2e/correlation-id.spec.ts`
- 필요 시 add helper to: `front/tests/e2e/_fixtures/` 기존 헬퍼 옆

E2E 단계에서는 BFF 응답의 `X-Readmates-Request-Id` 헤더가 그 직후 호스트 화면에서 어떤 서버 동작과도 매칭 가능한지 확인한다. 실제 BFF → Spring → outbox → Kafka → consumer 전체를 e2e에서 검증하는 것은 비용이 크므로, 다음으로 분할한다:

- **Spring integration test**: 단일 SpringBootTest 안에서 controller 호출 → outbox row 검사 → KafkaTemplate spy → consumer 호출까지 동일 `requestId` 일관성을 검증
- **Playwright E2E**: 호스트가 manual notification dispatch 1건을 발송한 후, BFF 응답 헤더의 `X-Readmates-Request-Id` 값이 dispatch ledger 응답 row의 `requestId` 필드와 매칭됨을 확인

후자(Playwright)는 host 응답에 requestId가 노출되어야 한다. 현재 ledger 응답에 노출되지 않으면 Task 4의 row mapper 단계에서 read-side DTO에 `requestId` 필드를 추가하는 task를 별도로 만들거나, Spring integration test로 대체한다(권장).

- [ ] **Step 1: Write Spring end-to-end correlation integration test**

`server/src/test/kotlin/com/readmates/notification/CorrelationIdEndToEndTest.kt`:

```kotlin
package com.readmates.notification

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.jdbc.core.JdbcTemplate

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CorrelationIdEndToEndTest {
    @Autowired lateinit var rest: TestRestTemplate
    @Autowired lateinit var jdbc: JdbcTemplate

    @Test
    fun `request id from header survives controller, outbox row, and Kafka header`() {
        val rid = "e2e-corr-12345"
        val headers = HttpHeaders().apply {
            set("X-Readmates-Request-Id", rid)
            // additional auth / BFF secret headers as required by test profile
        }
        // Replace path with a host controller that enqueues an outbox event (e.g. manual dispatch confirm).
        rest.exchange("/api/host/notifications/manual/preview", HttpMethod.POST,
            HttpEntity(buildPreviewBody(), headers), String::class.java)

        val storedRequestId = jdbc.queryForObject(
            "SELECT request_id FROM notification_event_outbox ORDER BY id DESC LIMIT 1",
            String::class.java,
        )
        assertEquals(rid, storedRequestId)
        // KafkaTemplate spy bean (registered in test config) should also capture header == rid.
    }

    private fun buildPreviewBody(): String = TODO("reuse existing manual dispatch fixture body")
}
```

> 이 테스트는 manual dispatch path와 spring-kafka test fixture 패턴에 의존한다. 작성자는 기존 `HostManualNotificationService` 통합 테스트(`server/src/test/.../HostManualNotificationServiceTest` 등)를 anchor로 fixture body와 wiring을 가져온다. KafkaTemplate spy는 `@SpyBean`으로 등록해 capture.

- [ ] **Step 2: Run integration test**

```bash
./server/gradlew -p server integrationTest --tests "*CorrelationIdEndToEndTest*"
```
Expected: PASS.

- [ ] **Step 3: Add Playwright assertion to existing manual-notifications spec (or new file)**

`front/tests/e2e/correlation-id.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test("BFF response includes X-Readmates-Request-Id header on /api/bff/** calls", async ({ request }) => {
  const response = await request.get("/api/bff/api/health");
  const headerValue = response.headers()["x-readmates-request-id"];
  expect(headerValue).toMatch(/^[A-Za-z0-9-]{12,64}$/);
});

test("client-supplied X-Readmates-Request-Id is preserved end-to-end on /api/bff/** calls", async ({ request }) => {
  const supplied = "client-abc-1234";
  const response = await request.get("/api/bff/api/health", {
    headers: { "X-Readmates-Request-Id": supplied },
  });
  expect(response.headers()["x-readmates-request-id"]).toBe(supplied);
});
```

`/api/bff/api/health` 또는 기존에 공개된 안전한 GET 경로를 사용한다. 정확한 경로는 `front/tests/e2e/`의 기존 smoke 패턴을 따른다.

- [ ] **Step 4: Run E2E**

```bash
pnpm --dir front test:e2e -- correlation-id
```
Expected: PASS (2 cases).

기존 `manual-notifications.spec.ts`도 회귀 없이 통과해야 한다:

```bash
pnpm --dir front test:e2e -- manual-notifications
```

- [ ] **Step 5: Commit**

```bash
git add server/src/test/kotlin/com/readmates/notification/CorrelationIdEndToEndTest.kt \
        front/tests/e2e/correlation-id.spec.ts
git commit -m "test(observability): assert requestId correlation across BFF, outbox, and Kafka"
```

---

## Task 10: 운영 docs + CHANGELOG Unreleased 업데이트

**Files:**
- Modify: `docs/operations/README.md` (또는 동일 hub) — correlation ID 사용법 단락 추가
- Create: `docs/operations/runbooks/correlation-id-lookup.md` (간단한 runbook)
- Modify: `CHANGELOG.md` — Unreleased 섹션

- [ ] **Step 1: Add runbook**

`docs/operations/runbooks/correlation-id-lookup.md`:

```markdown
# Correlation ID Lookup Runbook

> Phase 0 (Observability Backbone) — single `requestId` joins BFF, Spring API, outbox row, Kafka header, and consumer log.

## When to use
- A user reports a failed action and provides a request id from the BFF response (`X-Readmates-Request-Id` header).
- An outbox `FAILED`/`DEAD` row needs end-to-end context.

## Steps

1. **Search server logs**
   ```bash
   journalctl -u readmates-server --since "10 min ago" | jq 'select(.requestId == "<id>")'
   ```

2. **Find originating outbox row**
   ```sql
   SELECT * FROM notification_event_outbox WHERE request_id = '<id>';
   SELECT * FROM notification_manual_dispatches WHERE request_id = '<id>';
   ```

3. **Find consumer log lines**
   - Same `journalctl` filter; consumer lines log with the same `requestId` bound from the Kafka `readmates-request-id` header.

## Notes
- `requestId = "unknown"` indicates scheduled or async path with no upstream request. Cross-reference by `eventType` and timestamp.
- Migration V29 introduces `request_id` columns nullable; pre-V29 rows have NULL.
```

- [ ] **Step 2: Update operations README**

`docs/operations/README.md`의 적절한 섹션에 한 단락 추가 (정확한 위치는 grep으로 결정):
```bash
grep -n "## " docs/operations/README.md | head -10
```

추가할 내용:
```markdown
### Request correlation

ReadMates는 모든 요청에 `X-Readmates-Request-Id`를 BFF에서 생성/수용해 Spring 로그, outbox row, Kafka header, consumer 로그까지 동일 값으로 전파합니다. 조회 절차는 [correlation id lookup runbook](runbooks/correlation-id-lookup.md)을 참고합니다.
```

- [ ] **Step 3: Update CHANGELOG Unreleased**

`CHANGELOG.md`의 `## Unreleased` 섹션 `### Changed` 또는 `### Added` 아래에 추가:

```markdown
- **Observability backbone (Phase 0)**: BFF → Spring → Kafka producer → consumer → SMTP 경로에 동일한 `X-Readmates-Request-Id`를 전파하고, Logback을 JSON 인코더로 전환했습니다. `notification_event_outbox`, `notification_manual_dispatch_previews`, `notification_manual_dispatches`에 `request_id VARCHAR(64) NULL` 컬럼이 추가됐습니다(Flyway V29). SLO 카탈로그(`server/src/main/resources/slo/slos.yaml`)를 startup에서 schema 검증으로 로드하고, Grafana dashboard 2종을 `ops/grafana/dashboards/`에 코드로 보유합니다. 운영 조회 절차는 `docs/operations/runbooks/correlation-id-lookup.md` 참고.
```

- [ ] **Step 4: Final verification**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server check
./scripts/lint-grafana-dashboards.sh
```
모두 PASS여야 한다.

- [ ] **Step 5: Commit**

```bash
git add docs/operations/runbooks/correlation-id-lookup.md \
        docs/operations/README.md \
        CHANGELOG.md
git commit -m "docs(observability): add correlation id runbook and Phase 0 CHANGELOG entry"
```

---

## Task 11: Phase 0 완료 점검 + overview 진행상태 업데이트

**Files:**
- Modify: `docs/superpowers/specs/2026-05-16-confidence-initiative-overview-design.md`

- [ ] **Step 1: Tick Phase 0 exit criteria in overview**

overview의 Section 3 또는 Section 4에 Phase 0 완료 표시를 추가하고, 다음 단계로 Phase 1 spec brainstorming을 명시한다(아직 작성 안 됨).

`Section 4` 끝에 다음 단락 추가:
```markdown
### Phase 0 status — 완료 (날짜는 머지 commit 기준)
- Exit criterion (a) JSON logging ✅
- Exit criterion (b) end-to-end requestId 회귀 테스트 ✅
- Exit criterion (c) SLO yaml + loader + Grafana dashboards lint ✅
- 후속: Phase 1 (Boundary inventory) brainstorming 진행.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-16-confidence-initiative-overview-design.md
git commit -m "docs(superpowers): mark Phase 0 status complete in Confidence Initiative overview"
```

---

## Self-Review Checklist

이 plan을 spec에 대조해 다음을 확인했다:

- **Spec coverage**
  - End-to-end correlation ID: Task 1, 3, 4, 5, 9 (BFF, outbox writer, producer, consumer, e2e).
  - Structured JSON logging: Task 6.
  - SLO catalog as code: Task 7.
  - Grafana dashboards as code: Task 8.
  - Migration: Task 2.
  - Verification plan: Task 9 (integration + E2E), 각 task 별 unit test 단계.
  - 운영 docs/runbook: Task 10.
- **Placeholder check**: 의도적 placeholder는 두 곳뿐 — Task 9 Step 1의 `buildPreviewBody`는 작성자가 기존 fixture를 가져오라는 명시적 anchor 지시(완전 자동 작성이 비현실적). Task 8 Step 5의 정확한 CI step 위치는 grep으로 찾는 절차 제공. 그 외 placeholder 없음.
- **Type consistency**: `X-Readmates-Request-Id` header / `readmates-request-id` Kafka header / `requestId` MDC key / `request_id` SQL column 모두 plan 전체에서 일관됨. Publisher port 시그니처의 `requestId: String?`는 Task 4와 Task 5에서 동일.
- **Migration safety**: V29는 모두 NULL-safe. 기존 row 영향 없음.
- **TDD 형식**: 모든 implementation task는 test-first → fail → impl → pass → commit 순서.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-confidence-initiative-phase-0-observability-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
