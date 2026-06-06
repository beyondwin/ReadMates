# 서버 단위 테스트 커버리지 상향 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ReadMates 서버의 JaCoCo 단위 테스트 LINE 커버리지 게이트를 0.23 → 0.40+로 끌어올린다. 미테스트 순수 `application/model` 클래스에 단위 테스트를 추가하는 것을 최우선으로 한다.

**Architecture:** 구조 변경 없음. 기존 hexagonal 경계를 유지한 채 `application/model`(순수 계산/매핑/검증)과 mocked-port `application/service` 단위 테스트를 추가한다. 모든 신규 테스트는 `@Tag` 없이 작성해 `unitTest` 레인에 들어가고 `build/jacoco/unitTest.exec`에 집계된다 (integration/container 태그는 집계 제외).

**Tech Stack:** Kotlin, JUnit5(`@Test`), AssertJ(`org.assertj.core.api.Assertions.assertThat`), Gradle JaCoCo 0.8.12.

**강의 매핑:** Practical Testing(329295) — "무엇을 테스트할지(동작/경계값), 테스트하기 좋은 구조". 순수 함수부터 검증 → 분기/경계값 커버.

---

## 사전 사실 (실측, 2026-06-06)

- 게이트 위치: `server/build.gradle.kts:293-302` — `counter=LINE`, `value=COVEREDRATIO`, `minimum=0.23`. report에서 `**/*Application*`, `**/dto/**`, `**/config/**` 제외.
- 집계 원천: `unitTest` task의 `JacocoTaskExtension`만 (`server/build.gradle.kts:243-251`). **DB/integration 테스트(`@Tag("integration")` 90개, `@Tag("container")` 13개)는 커버리지에 잡히지 않는다.** → 그래서 "이미 controller DB 테스트로 검증된" 서비스도 unit 커버리지엔 0일 수 있다.
- 미테스트 순수 model 클래스 **25개** (테스트에서 클래스명 참조 0건). 이게 인프라 없이 라인을 올리는 가장 싼 타깃.
- 테스트 컨벤션: 패키지 동일, JUnit5 `@Test`, AssertJ `assertThat`, 백틱 테스트명, `@Tag` 미부착(예: `notification/application/model/NotificationEventModelsTest.kt`).
- 실행 명령: 단위 fast lane `./server/gradlew -p server unitTest`, 게이트 포함 `./server/gradlew -p server check`.

## File Structure

- 신규 테스트는 대상 main 클래스와 **동일 패키지의 test 소스 루트**에 co-locate:
  `src/main/kotlin/com/readmates/<feat>/application/model/Foo.kt`
  → `src/test/kotlin/com/readmates/<feat>/application/model/FooTest.kt`
- 한 테스트 파일 = 한 model 파일의 public 함수/계산 동작. 데이터 운반만 하는 필드 getter는 테스트하지 않는다(동작 없는 라인은 다른 테스트의 부수 커버리지로 충분).
- `build.gradle.kts`의 게이트 임계값은 **마지막 Task에서 한 번만** 상향.

## 우선순위 타깃 (미테스트 model 25개, 로직 밀도 순)

**1군 — 명확한 로직/검증/매핑 (먼저):**
`notification/application/model/NotificationErrorSanitizer.kt`,
`club/application/model/ClubContextModels.kt`,
`auth/application/model/MemberProfileCommands.kt`,
`session/application/model/HostSessionCommands.kt`,
`session/application/model/SessionMemberCommands.kt`,
`sessionimport/application/model/SessionImportModels.kt`

**2군 — 결과 매핑/projection:**
`archive/application/model/ArchiveResults.kt`, `ArchiveDetailFragments.kt`,
`publication/application/model/PublicResults.kt`,
`note/application/model/NotesFeedResults.kt`,
`feedback/application/model/FeedbackDocumentResults.kt`,
`session/application/model/SessionMemberResults.kt`

**3군 — admin/ops projection (값 밀도 낮음, 마지막):**
`admin/analytics/application/model/AdminAnalyticsModels.kt`,
`admin/audit/application/model/AdminAuditModels.kt`,
`aigen/application/model/AiGenerationModels.kt`, `AiGenerationOpsModels.kt`,
`club/application/model/AdminClubOperationsModels.kt`, `AdminSupportModels.kt`, `HostClubOperationsModels.kt`, `PlatformAdminModels.kt`, `SupportAccessGrantModels.kt`,
`notification/application/model/AdminNotificationOperationsModels.kt`, `NotificationModels.kt`

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
        assertThat(sanitizeNotificationError("password=hunter2 leaked", 200))
            .doesNotContain("hunter2")
            .contains("[redacted-secret]")
    }

    @Test
    fun `jwt-shaped tokens are redacted`() {
        val jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4"
        assertThat(sanitizeNotificationError("token $jwt end", 200))
            .doesNotContain(jwt)
            .contains("[redacted-secret]")
    }

    @Test
    fun `aws access keys are redacted`() {
        assertThat(sanitizeNotificationError("key AKIAIOSFODNN7EXAMPLE here", 200))
            .doesNotContain("AKIAIOSFODNN7EXAMPLE")
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
Expected: 컴파일/통과 — 만약 한 assertion이라도 실패하면 main 정규식 동작과 기대값을 main 파일 기준으로 맞춘다(테스트를 코드 동작에 맞춤, main 수정 아님).

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

## Task 2~N: 동일 레시피로 1군→2군→3군 진행

각 타깃 model 파일마다 Task 1과 **동일한 5스텝**을 반복한다. 타깃별로 다음을 지킨다:

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

**진행 체크리스트 (model 25개):**

1군:
- [ ] NotificationErrorSanitizer (Task 1)
- [ ] ClubContextModels
- [ ] MemberProfileCommands
- [ ] HostSessionCommands
- [ ] SessionMemberCommands
- [ ] SessionImportModels

2군:
- [ ] ArchiveResults
- [ ] ArchiveDetailFragments
- [ ] PublicResults
- [ ] NotesFeedResults
- [ ] FeedbackDocumentResults
- [ ] SessionMemberResults

3군:
- [ ] AdminAnalyticsModels
- [ ] AdminAuditModels
- [ ] AiGenerationModels
- [ ] AiGenerationOpsModels
- [ ] AdminClubOperationsModels
- [ ] AdminSupportModels
- [ ] HostClubOperationsModels
- [ ] PlatformAdminModels
- [ ] SupportAccessGrantModels
- [ ] AdminNotificationOperationsModels
- [ ] NotificationModels

---

## Task N+1: service 단위 테스트 (model 소진 후, 선택)

model 25개를 소진해도 0.40에 못 미치면, **integration으로만 커버되는 application service**에 mocked-port 단위 테스트를 추가한다.

- [ ] **A. 후보 식별** — `application/service/*.kt` 중 단위 테스트가 없고(서비스 옆 `*Test.kt` 부재) DB 컨트롤러 테스트로만 도는 것. 우선순위: 권한/분기 로직이 많은 write-side service(`session`, `auth`, `notification`).
- [ ] **B. outbound port를 mock** — service 생성자 port 파라미터를 fake/mock으로 주입(기존 service 테스트 패턴 따름). DB/Spring 부팅 금지(부팅하면 integration 태그 대상이 되어 커버리지 집계에서 빠짐).
- [ ] **C~E.** Task 1과 동일한 실패→통과→커밋 사이클.

> service 테스트 1건은 model 테스트보다 비용이 크지만 분기 라인을 많이 덮는다. 측정하며 진행한다(아래 Task N+2의 리포트로 어디가 비는지 확인).

---

## Task N+2: 커버리지 측정 후 게이트 상향

- [ ] **Step 1: 전체 리포트 생성**

Run: `./server/gradlew -p server unitTest jacocoTestReport`
Expected: `server/build/reports/jacoco/jacocoTestReport/html/index.html` 생성. 브라우저나 아래로 LINE 비율 확인.

```bash
./server/gradlew -p server unitTest jacocoTestReport
```

- [ ] **Step 2: 측정 LINE 비율 확인**

`server/build/reports/jacoco/jacocoTestReport/jacocoTestReport.xml`의 최상위 `<counter type="LINE" .../>`에서 `covered/(covered+missed)` 계산. 목표는 ≥ 0.40. 미달이면 Task 2~N+1로 돌아가 비는 패키지를 더 덮는다.

- [ ] **Step 3: 게이트 임계값 상향**

`server/build.gradle.kts:293-302`의 rule을 **측정치 -2pp(정수 floor)** baseline 규칙으로 갱신. 예: 측정 0.42 → `minimum = "0.40"`.

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
