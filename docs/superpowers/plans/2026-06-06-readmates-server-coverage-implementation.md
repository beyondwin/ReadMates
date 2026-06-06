# 서버 단위 테스트 커버리지 상향 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ReadMates 서버의 JaCoCo 단위 테스트 LINE 커버리지 게이트를 오래된 0.23에서 실제 측정치에 맞는 0.40+ baseline으로 끌어올린다. 먼저 순수 `application/model`의 의미 있는 계산/매핑 동작을 고정하고, 숫자만 올리는 DTO getter 테스트는 피한다.

**Architecture:** 구조 변경 없음. 기존 hexagonal 경계를 유지한 채 `application/model`(순수 계산/매핑/검증)과 mocked-port `application/service` 단위 테스트를 추가한다. 신규 테스트는 `@Tag` 미부착 또는 `@Tag("unit")`만 허용해 `unitTest` 레인에 들어가게 한다. `integration`, `container`, `architecture` 태그는 `unitTest`와 JaCoCo 집계에서 제외된다.

**Tech Stack:** Kotlin, JUnit5(`@Test`), AssertJ(`org.assertj.core.api.Assertions.assertThat`), Gradle JaCoCo 0.8.12.

**강의 매핑:** Practical Testing(329295) — "무엇을 테스트할지(동작/경계값), 테스트하기 좋은 구조". 순수 함수부터 검증 → 분기/경계값 커버.

---

## 사전 사실 (실측, 2026-06-06)

- 게이트 위치: `server/build.gradle.kts:293-302` — `counter=LINE`, `value=COVEREDRATIO`, `minimum=0.23`. report에서 `**/*Application*`, `**/dto/**`, `**/config/**` 제외.
- 집계 원천: `unitTest` task의 `JacocoTaskExtension`만 (`server/build.gradle.kts:241-251`). **DB/integration/container 테스트는 커버리지에 잡히지 않는다.** 그래서 "controller DB 테스트로 검증된" persistence adapter도 unit 커버리지엔 0일 수 있다.
- 실제 현재 커버리지: `./server/gradlew -p server unitTest jacocoTestReport` 결과 LINE `7340/19134 = 0.3836`. 즉 제품 코드 커버리지가 23%인 것이 아니라 **게이트가 0.23으로 오래 낮게 남아 있는 것**이 결함이다. 0.40까지는 현재 denominator 기준 약 314 covered line이 더 필요하다.
- 실제 report 경로: XML `server/build/reports/jacoco/test/jacocoTestReport.xml`, HTML `server/build/reports/jacoco/test/html/index.html`. 기존 `server/build/reports/jacoco/jacocoTestReport/...` 경로는 현재 Gradle 출력과 맞지 않는다.
- `application/model` 미커버 라인은 대부분 DTO constructor/getter line이다. 이 영역만 무작정 채우면 숫자는 오르지만 테스트 가치가 낮다. 먼저 명시적 함수/계산 프로퍼티/companion parser를 고정하고, 남은 0.40 gap은 service/adapter 단위 테스트로 채운다.
- 테스트 컨벤션: 패키지 동일, JUnit5 `@Test`, AssertJ `assertThat`, 백틱 테스트명, `@Tag` 미부착 또는 `@Tag("unit")`(예: `SessionImportServiceCommitValidatedTest`, `AiGenerationSecurityConfigTest`도 `unitTest` 포함).
- 실행 명령: 단위 fast lane `./server/gradlew -p server unitTest`, 게이트 포함 `./server/gradlew -p server check`.

## 코드 대조로 찾은 계획 결함

- **결함 1: 커버리지 baseline 표현 오류** — 현재 측정치는 0.3836인데 문서는 "0.23 → 0.40+"만 강조해 실제 리스크를 흐린다. 올려야 할 대상은 stale gate다.
- **결함 2: report path 오류** — `jacocoTestReport.xml` 위치가 틀려 Task N+2가 그대로는 실패한다.
- **결함 3: "미테스트 model 25개" 전략 과잉** — `AdminAnalyticsModels`, `AiGenerationOpsModels`, `NotificationModels`, `AdminAuditModels`, admin health model 일부는 이미 model/service/controller 테스트에서 커버된다. 반면 `ArchiveResults`, `FeedbackDocumentResults`, `PublicResults` 등은 대부분 DTO라 직접 테스트 가치가 낮다.
- **결함 4: `@Tag` 규칙 과잉** — `unitTest`는 태그 미부착뿐 아니라 `@Tag("unit")`도 실행한다. 금지해야 할 것은 `integration`, `container`, `architecture` 태그다.

## File Structure

- 신규 테스트는 대상 main 클래스와 **동일 패키지의 test 소스 루트**에 co-locate:
  `src/main/kotlin/com/readmates/<feat>/application/model/Foo.kt`
  → `src/test/kotlin/com/readmates/<feat>/application/model/FooTest.kt`
- 한 테스트 파일 = 한 model 파일의 public 함수/계산 동작. 데이터 운반만 하는 필드 getter는 테스트하지 않는다(동작 없는 라인은 다른 테스트의 부수 커버리지로 충분).
- `build.gradle.kts`의 게이트 임계값은 **마지막 Task에서 한 번만** 상향.

## 우선순위 타깃 (실제 코드 기준)

**1군 — 명확한 함수/계산 프로퍼티 (먼저):**
`notification/application/model/NotificationErrorSanitizer.kt`,
`notification/application/model/NotificationModels.kt`,
`club/application/model/PlatformAdminModels.kt`,
`club/application/model/HostClubOperationsModels.kt`

**2군 — 이미 일부 커버됐지만 parser/default branch 보강 가치 있음:**
`admin/analytics/application/model/AdminAnalyticsModels.kt`(`AnalyticsWindow.fromWire`는 이미 테스트 있음),
`aigen/application/model/AiGenerationOpsModels.kt`(`AiOpsCostWindow.fromWire`는 이미 테스트 있음),
`admin/audit/application/model/AdminAuditModels.kt`(`utc()`와 filter defaults는 service 테스트에서 커버됨)

**3군 — 숫자만 올리는 DTO-heavy 영역(마지막 또는 제외):**
`archive/application/model/ArchiveResults.kt`,
`archive/application/model/ArchiveDetailFragments.kt`,
`feedback/application/model/FeedbackDocumentResults.kt`,
`publication/application/model/PublicResults.kt`,
`note/application/model/NotesFeedResults.kt`,
`session/application/model/SessionMemberResults.kt`,
`club/application/model/AdminClubOperationsModels.kt`,
`club/application/model/AdminSupportModels.kt`,
`club/application/model/SupportAccessGrantModels.kt`,
`notification/application/model/AdminNotificationOperationsModels.kt`

> 각 타깃은 먼저 main 파일을 읽고 **public 함수/계산 동작이 있는지** 확인한다. 순수 데이터 클래스(로직 0)면 건너뛰고 다음 타깃으로. 동작이 있는 것만 테스트한다(Practical Testing 원칙).

---

## Task 1: NotificationErrorSanitizer 단위 테스트 (워크드 예시)

대상 `sanitizeNotificationError(value: String?, maxLength: Int): String?` — null/blank 처리, trim, 비밀/토큰/이메일 redaction, 길이 절단. 보안 불변식이라 회귀 가치가 높다.

**Files:**
- Read first: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationErrorSanitizer.kt`
- Create: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationErrorSanitizerTest.kt`

- [ ] **Step 1: 실패 테스트 작성**

`server/src/test/kotlin/com/readmates/notification/application/model/NotificationErrorSanitizerTest.kt`:

```kotlin
package com.readmates.notification.application.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class NotificationErrorSanitizerTest {
    @Test
    fun `null or blank returns null`() {
        assertThat(sanitizeNotificationError(null, 200)).isNull()
        assertThat(sanitizeNotificationError("   ", 200)).isNull()
    }

    @Test
    fun `plain message is trimmed and passed through`() {
        assertThat(sanitizeNotificationError("  SMTP timeout  ", 200))
            .isEqualTo("SMTP timeout")
    }

    @Test
    fun `email addresses are redacted`() {
        assertThat(sanitizeNotificationError("failed for alice@example.com", 200))
            .isEqualTo("failed for [redacted-email]")
    }

    @Test
    fun `bearer credentials are redacted`() {
        assertThat(sanitizeNotificationError("Authorization: Bearer abc.def.ghijk", 200))
            .doesNotContain("abc.def.ghijk")
            .contains("[redacted-secret]")
    }

    @Test
    fun `secret assignments are redacted`() {
        assertThat(sanitizeNotificationError("password=example-secret leaked", 200))
            .doesNotContain("example-secret")
            .contains("[redacted-secret]")
    }

    @Test
    fun `jwt-shaped tokens are redacted`() {
        val jwt = listOf("a".repeat(16), "b".repeat(8), "c".repeat(8)).joinToString(".")
        assertThat(sanitizeNotificationError("token $jwt end", 200))
            .doesNotContain(jwt)
            .contains("[redacted-secret]")
    }

    @Test
    fun `aws access keys are redacted`() {
        val accessKey = "AKIA" + "A".repeat(16)
        assertThat(sanitizeNotificationError("key $accessKey here", 200))
            .doesNotContain(accessKey)
            .contains("[redacted-secret]")
    }

    @Test
    fun `output is truncated to maxLength after redaction`() {
        val long = "x".repeat(500)
        assertThat(sanitizeNotificationError(long, 50)).hasSize(50)
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `./server/gradlew -p server unitTest --tests com.readmates.notification.application.model.NotificationErrorSanitizerTest`
Expected: PASS — characterization test이므로 기존 redaction contract와 다르면 먼저 실제 출력과 보안 의도를 비교한다. 보안상 원문 secret/email이 남는다면 main 수정 + test가 맞고, 단순 placeholder 문자열 차이면 테스트 기대값을 현재 contract에 맞춘다.

> 주의: 이 Task는 **새 테스트로 기존 동작을 고정**하는 characterization test다. main 코드는 바꾸지 않는다. assertion 기대값이 어긋나면 main의 실제 출력으로 정정한다.

- [ ] **Step 3: 구현 변경 없음 확인**

main 파일은 수정하지 않는다. 테스트만 추가.

- [ ] **Step 4: 통과 확인**

Run: `./server/gradlew -p server unitTest --tests com.readmates.notification.application.model.NotificationErrorSanitizerTest`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add server/src/test/kotlin/com/readmates/notification/application/model/NotificationErrorSanitizerTest.kt
git commit -m "test(server): cover NotificationErrorSanitizer redaction behavior"
```

---

## Task 2: NotificationModels helper gap 보강

`NotificationModels.kt`는 이미 `NotificationEventModelsTest`, `NotificationManualDispatchModelsTest`, `NotificationPreferencesTest`가 있지만 helper branch가 일부 남아 있다. 새 DTO smoke를 만들지 말고 아래 동작만 추가한다.

**Files:**
- Read first: `server/src/main/kotlin/com/readmates/notification/application/model/NotificationModels.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/application/model/NotificationEventModelsTest.kt`

- [ ] **Step 1: helper branch 테스트 추가**

`NotificationEventModelsTest`에 추가:

```kotlin
    @Test
    fun `club scoped app path normalizes leading slashes`() {
        assertThat(clubScopedAppPath("reading-room", "/session/current"))
            .isEqualTo("/clubs/reading-room/app/session/current")
        assertThat(clubScopedAppHomePath("reading-room"))
            .isEqualTo("/clubs/reading-room/app")
    }

    @Test
    fun `manual audiences reject non manual event types`() {
        assertThat(allowedManualAudiences(NotificationEventType.REVIEW_PUBLISHED)).isEmpty()
        assertThat(allowedManualAudiences(NotificationEventType.AI_GENERATION_READY)).isEmpty()
    }
```

- [ ] **Step 2: 실행**

Run: `./server/gradlew -p server unitTest --tests com.readmates.notification.application.model.NotificationEventModelsTest`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add server/src/test/kotlin/com/readmates/notification/application/model/NotificationEventModelsTest.kt
git commit -m "test(server): cover notification model helper branches"
```

---

## Task 3: Club 운영 projection 계산 보강

`PlatformAdminModels.kt`의 extension property와 `HostClubOperationsModels.kt`의 `toHostSnapshot()`은 DTO getter가 아니라 UI/API 상태 계산이다.

**Files:**
- Read first: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminModels.kt`
- Read first: `server/src/main/kotlin/com/readmates/club/application/model/HostClubOperationsModels.kt`
- Create: `server/src/test/kotlin/com/readmates/club/application/model/PlatformAdminModelsTest.kt`
- Create: `server/src/test/kotlin/com/readmates/club/application/model/HostClubOperationsModelsTest.kt`

- [ ] **Step 1: PlatformAdminModels extension 테스트 작성**

`PlatformAdminModelsTest.kt`:

```kotlin
package com.readmates.club.application.model

import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class PlatformAdminModelsTest {
    @Test
    fun `disabled domain requests disabled desired state and no manual action`() {
        val domain = domain(status = ClubDomainStatus.DISABLED)

        assertThat(domain.desiredState).isEqualTo(PlatformAdminDomainDesiredState.DISABLED)
        assertThat(domain.manualAction).isEqualTo(PlatformAdminDomainManualAction.NONE)
    }

    @Test
    fun `action required domain stays enabled and requires custom domain action`() {
        val domain = domain(status = ClubDomainStatus.ACTION_REQUIRED)

        assertThat(domain.desiredState).isEqualTo(PlatformAdminDomainDesiredState.ENABLED)
        assertThat(domain.manualAction).isEqualTo(PlatformAdminDomainManualAction.CLOUDFLARE_PAGES_CUSTOM_DOMAIN)
    }

    private fun domain(status: ClubDomainStatus): PlatformAdminClubDomain =
        PlatformAdminClubDomain(
            id = UUID.nameUUIDFromBytes("domain".toByteArray()),
            clubId = UUID.nameUUIDFromBytes("club".toByteArray()),
            hostname = "club.example.com",
            kind = ClubDomainKind.CUSTOM_DOMAIN,
            status = status,
            isPrimary = true,
            verifiedAt = null,
            lastCheckedAt = null,
            errorCode = null,
        )
}
```

- [ ] **Step 2: HostClubOperations mapping 테스트 작성**

`HostClubOperationsModelsTest.kt`:

```kotlin
package com.readmates.club.application.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostClubOperationsModelsTest {
    @Test
    fun `host snapshot keeps host-safe club fields and omits admin-only counts`() {
        val admin =
            AdminClubOperationsSnapshot(
                generatedAt = OffsetDateTime.parse("2026-06-06T00:00:00Z"),
                club =
                    AdminClubOperationsClub(
                        clubId = UUID.nameUUIDFromBytes("club".toByteArray()),
                        slug = "reading-room",
                        name = "Reading Room",
                        status = "ACTIVE",
                        publicVisibility = "PUBLIC",
                    ),
                readiness =
                    AdminClubReadinessSummary(
                        state = "PUBLIC_READY",
                        blockingReasons = emptyList(),
                        nextAction = null,
                    ),
                memberActivity =
                    AdminClubMemberActivity(
                        activeCount = 10,
                        dormantCount = 0,
                        pendingViewerCount = 1,
                        hostCount = 2,
                    ),
                sessionProgress =
                    AdminClubSessionProgress(
                        upcomingCount = 2,
                        currentOpenCount = 1,
                        closedCount = 3,
                        publishedRecordCount = 3,
                        incompleteRecordCount = 0,
                    ),
                notificationHealth =
                    AdminClubNotificationHealth(
                        pending = 0,
                        failed = 0,
                        dead = 0,
                        lastSuccessAt = null,
                        failureClusters = emptyList(),
                    ),
                aiUsage =
                    AdminClubAiUsage(
                        activeJobs = 0,
                        failedRecentJobs = 0,
                        staleCandidates = 0,
                        costEstimateUsd = "1.25",
                        state = "OK",
                    ),
                safeLinks = emptyList(),
            )

        val host = admin.toHostSnapshot()

        assertThat(host.schema).isEqualTo("host.club_operations_snapshot.v1")
        assertThat(host.generatedAt).isEqualTo(admin.generatedAt)
        assertThat(host.club.slug).isEqualTo("reading-room")
        assertThat(host.readiness).isEqualTo(admin.readiness)
        assertThat(host.sessionProgress).isEqualTo(admin.sessionProgress)
        assertThat(host.aiUsage).isEqualTo(admin.aiUsage)
    }
}
```

- [ ] **Step 3: 실행**

Run: `./server/gradlew -p server unitTest --tests com.readmates.club.application.model.PlatformAdminModelsTest --tests com.readmates.club.application.model.HostClubOperationsModelsTest`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add \
  server/src/test/kotlin/com/readmates/club/application/model/PlatformAdminModelsTest.kt \
  server/src/test/kotlin/com/readmates/club/application/model/HostClubOperationsModelsTest.kt
git commit -m "test(server): cover club operation projection helpers"
```

---

## Task 4~N: 측정 기반으로 다음 후보 진행

각 후보마다 Task 1~3과 같은 red-green-commit 사이클을 반복하되, 다음 기준을 적용한다:

- [ ] **A. main 파일 Read** — public 함수/계산/검증 분기를 파악. 동작 0(순수 데이터 클래스)이면 건너뛰고 우선순위 다음 타깃으로.
- [ ] **B. 실패 테스트 작성** — 동작별 1 assertion: 정상 케이스 + 경계값(빈 입력, 최대 길이, null, 잘못된 enum/포맷) + 분기 양쪽. 데이터 필드 getter는 테스트하지 않는다.
- [ ] **C. 실패/컴파일 확인** — `./server/gradlew -p server unitTest --tests com.readmates.<feat>.application.model.<Name>Test`
- [ ] **D. 통과 확인** — 같은 명령 PASS
- [ ] **E. 커밋** — `test(server): cover <Name> <behavior>`

**테스트 설계 규칙 (Practical Testing 329295):**
- 한 테스트 = 한 동작. 이름은 동작을 서술(`returns null when ...`).
- 경계값 우선: 빈 컬렉션, 0/최대 길이, 누락 필드, 잘못된 포맷.
- 매핑 함수는 "입력 → 기대 출력 전체"를 assertThat(...).isEqualTo(expected)로 고정.
- 검증 함수(`*Commands` validate류)는 valid 1개 + invalid 분기마다 1개.
- DB/Spring/Redis가 필요하면 그 클래스는 model이 아니다 → 이 Task 범위 아님(service 단위 테스트로, mocked port 사용).

**진행 체크리스트:**

- [ ] NotificationErrorSanitizer (Task 1)
- [ ] NotificationModels helper branches (Task 2)
- [ ] PlatformAdminModels extension properties (Task 3)
- [ ] HostClubOperationsModels host projection (Task 3)
- [ ] AdminAnalyticsModels/AiGenerationOpsModels only if new parser/window branch appears (existing tests already cover current `fromWire`)
- [ ] DTO-heavy result files only when a mapper/service test can assert the real projection contract without testing getters

---

## Task N+1: service/adapter 단위 테스트 (0.40 gap의 실질 후보)

실제 report 기준 큰 missed line은 `application/model`보다 persistence/web/security adapter에 많다. `application/model`의 의미 있는 동작을 보강한 뒤에도 0.40에 못 미치면 다음 후보를 우선한다.

- [ ] **A. 후보 식별** — `server/build/reports/jacoco/test/jacocoTestReport.xml`의 class missed line 상위권에서 순수 단위 테스트가 가능한 후보를 고른다. 2026-06-06 현재 상위권: `InvitationService`, `MemberLifecycleService`, `PlatformAdminService`, `FeedbackDocumentService`, `RedisReadCacheInvalidationAdapter`, `RedisGenerationCostCounters`, web mapper `*Kt` 함수.
- [ ] **B. outbound port를 fake/mock** — service 생성자 port 파라미터를 fake/mock으로 주입(기존 service 테스트 패턴 따름). DB/Spring 부팅 금지.
- [ ] **B-2. adapter는 로컬 fake client만** — Redis/JDBC/HTTP 실연결 대신 fake template/client 또는 mapper 함수 단위로 테스트한다. 연결이 필요하면 integration으로 분리되어 coverage gate에 기여하지 않는다.
- [ ] **C~E.** Task 1과 동일한 실패→통과→커밋 사이클.

> 2026-06-06 report의 missed line 상위는 persistence adapter가 크지만, JDBC integration 테스트를 unitTest에 억지로 넣으면 테스트 격리가 깨진다. coverage gate를 올리는 목적이어도 unit-suitable class만 고른다.

---

## Task N+2: 커버리지 측정 후 게이트 상향

- [ ] **Step 1: 전체 리포트 생성**

Run: `./server/gradlew -p server unitTest jacocoTestReport`
Expected: `server/build/reports/jacoco/test/html/index.html`와 `server/build/reports/jacoco/test/jacocoTestReport.xml` 생성. 브라우저나 아래로 LINE 비율 확인.

```bash
./server/gradlew -p server unitTest jacocoTestReport
```

- [ ] **Step 2: 측정 LINE 비율 확인**

`server/build/reports/jacoco/test/jacocoTestReport.xml`의 최상위 `<counter type="LINE" .../>`에서 `covered/(covered+missed)` 계산. 목표는 ≥ 0.40. 미달이면 Task 4~N+1로 돌아가 unit-suitable missed line을 더 덮는다.

```bash
ruby -r rexml/document -e 'xml=REXML::Document.new(File.read("server/build/reports/jacoco/test/jacocoTestReport.xml")); c=xml.root.elements.to_a("counter").find { |e| e.attributes["type"] == "LINE" }; missed=c.attributes["missed"].to_i; covered=c.attributes["covered"].to_i; puts "#{covered}/#{covered + missed} = #{(covered.to_f / (covered + missed)).round(4)}"'
```

- [ ] **Step 3: 게이트 임계값 상향**

`server/build.gradle.kts:293-302`의 rule을 **측정치 -2pp(정수 floor)** baseline 규칙으로 갱신. 예: 측정 0.42 → `minimum = "0.40"`. 측정치가 0.40 미만이면 0.40으로 올리지 않는다. 현 상태 그대로면 0.3836이므로 immediate stale-gate cleanup은 0.36이 맞지만, 이 계획의 목표는 추가 테스트 후 0.40+다.

```kotlin
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                // baseline 0.42 (measured 2026-06-06) -2pp.
                minimum = "0.40".toBigDecimal()
            }
```

같은 baseline 문구를 `docs/development/test-guide.md:219`의 "최소 0.23(측정치 -2pp)" 서술과 `server/build.gradle.kts:298` 주석에도 맞춰 갱신.

- [ ] **Step 4: 게이트 통과 확인**

Run: `./server/gradlew -p server check`
Expected: PASS — `jacocoTestCoverageVerification` 포함 전체 green.

- [ ] **Step 5: 커밋**

```bash
git add server/build.gradle.kts docs/development/test-guide.md
git commit -m "test(server): raise JaCoCo line coverage gate to 0.40"
```

---

## Self-Review (작성자 점검)

- **Spec 커버:** 목표(0.23→0.40+, model 우선)와 각 Task가 일치하는가? — Task 1(워크드) + Task 2~N(레시피·체크리스트 25개) + N+1(service 보강) + N+2(게이트 상향)로 커버.
- **Placeholder:** Task 1은 실제 테스트 코드 포함. Task 2~N은 "동일 5스텝 + 대상별 Read 먼저" 명시(각 model의 실제 시그니처는 워커가 Read로 확보 — 25개 전부의 코드를 선기재하지 않음은 의도적, 각 파일을 읽고 동작만 테스트하라는 지시가 핵심).
- **타입 일관성:** assertion 라이브러리(AssertJ), 태그 정책(`@Tag` 미부착=unit 레인), 게이트 위치(build.gradle.kts:293-302) 전 Task 일관.

## 검증 (완료 보고용)

```bash
./server/gradlew -p server unitTest        # 신규 단위 테스트 통과
./server/gradlew -p server check           # 게이트(JaCoCo 0.40) 포함 전체
./server/gradlew -p server architectureTest # 경계 무변경 확인
```

완료 보고에는 실행한 명령, 측정된 최종 LINE 비율, 스킵/실패 항목과 이유, 남은 리스크를 남긴다.
