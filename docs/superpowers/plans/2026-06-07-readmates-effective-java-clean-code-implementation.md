# ReadMates — Effective Java / Clean Code 개선 구현 문서

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans 또는
> superpowers:subagent-driven-development 로 task-by-task 구현. 각 스텝은 체크박스
> (`- [ ]`)로 추적한다. 모든 PR은 **동작 보존 refactor**다 — 응답 shape/라우트/DB
> 스키마/인가 규칙을 섞지 않는다.

**Goal:** `docs/superpowers/specs/2026-06-07-readmates-effective-java-clean-code-design.md`
의 P1/P2/P4를 작고 검증 가능한 PR로 구현하고, P3는 분류표만 남긴다.

**Tech Stack:** Kotlin 2.2, Spring Boot 4.0, JDK 21, JDBC, JUnit 5, ArchUnit, detekt.

---

## PR 스택

| PR | Branch | Surface | 목표 | 핵심 검증 |
| --- | --- | --- | --- | --- |
| 1 | `codex/readmates-sha256-hex-util` | shared + 4 service + ClientIpHashing | SHA-256→hex 중복 5곳을 `Sha256` 유틸로 통합 (EJ Item 59) | 신규 유틸 단위 테스트, server test, detekt |
| 2 | `codex/readmates-audit-entry-factory` | aigen | `AuditLogEntry` 실패 항목 정적 팩터리 (EJ Item 1, DRY) | aigen focused test, server test |
| 3 | `codex/readmates-exception-hygiene` | aigen llm adapters + health providers | 광범위 catch/swallow 근거 주석·`ignored` 네이밍 (EJ Item 77) | server test, detekt (suppress 근거 정렬) |

권장 순서: PR 1 → PR 2 → PR 3. 서로 독립이라 순서 무관하나 위험 낮은 순.

## 공통 규칙

- 각 PR 시작 전 `git status --short --untracked-files=all`로 unrelated change 확인.
- 서버 PR이므로 `docs/agents/server.md`를 읽는다.
- 문서 갱신 시 `docs/agents/docs.md` + `git diff --check -- <changed-docs>`.
- public repo safety: 새 예시는 placeholder만. 실데이터/시크릿/로컬 경로 금지.
- 각 PR은 behavior-preserving. 출력은 byte-identical, 필드는 1:1.

---

## PR 1: SHA-256 hex 유틸 통합

### Scope

5곳에 복제된 `MessageDigest.getInstance("SHA-256") ... "%02x".format` 관용구를
JDK 21 `java.util.HexFormat` 기반 단일 유틸로 모은다.

### Files

- Create: `server/src/main/kotlin/com/readmates/shared/security/Sha256.kt`
- Create: `server/src/test/kotlin/com/readmates/shared/security/Sha256Test.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/HostManualNotificationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationOperationsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationTestMailService.kt`
- Modify: `server/src/main/kotlin/com/readmates/shared/security/ClientIpHashing.kt`

### Steps

- [ ] **Step 1: 동작 고정 테스트 먼저 작성 (TDD).**
  `Sha256Test`에 known-vector 어서션 추가. 예: 빈 문자열 SHA-256 hex =
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
  추가로 임의 문자열에 대해 `Sha256.hex(s)` ==
  `MessageDigest.getInstance("SHA-256").digest(s.toByteArray(UTF_8)).joinToString(""){"%02x".format(it)}`
  를 어서션(레거시 표현과 byte-identical 고정). 이 시점엔 컴파일 실패 = red.

- [ ] **Step 2: `Sha256` object 구현.**
  ```kotlin
  package com.readmates.shared.security

  import java.nio.charset.StandardCharsets
  import java.security.MessageDigest
  import java.util.HexFormat

  object Sha256 {
      private val HEX = HexFormat.of() // 기본: 소문자, 구분자/패딩 없음

      fun hex(value: String): String = hex(value.toByteArray(StandardCharsets.UTF_8))

      fun hex(bytes: ByteArray): String =
          HEX.formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))
  }
  ```
  테스트 green 확인.

- [ ] **Step 3: 호출부 5곳 치환.**
  - `AiGenerationOrchestrator`: private `sha256(text)` 제거, 호출부를 `Sha256.hex(text)`로.
    `import java.security.MessageDigest` 미사용 시 제거.
  - `HostManualNotificationService`/`AdminNotificationOperationsService`: 해시 표현을
    `Sha256.hex(raw)` / `Sha256.hex(basis)`로. (입력 문자열 조립 로직은 그대로.)
  - `NotificationTestMailService`: private `sha256Hex(value)` 제거 → `Sha256.hex(value)`.
  - `ClientIpHashing`: `MessageDigest...joinToString...` 블록을
    `Sha256.hex("$salt::$ip").take(32)`로. `MessageDigest` import 제거.

- [ ] **Step 4: 검증.**
  `./server/gradlew -p server clean test`. detekt가 `Sha256.kt`에 새 suppress를
  요구하지 않는지 확인. 호출부의 기존 테스트(알림 dedupe 해시, IP 해시 등) 무변경 통과.

### 동작 보존 근거

`HexFormat.of().formatHex` 기본은 소문자·무패딩·무구분자라 `"%02x".format` 루프와
바이트 단위로 동일. `ClientIpHashing`은 동일 hex의 앞 32자 → 변화 없음.

---

## PR 2: AuditLogEntry 실패 항목 정적 팩터리

### Scope

`AiGenerationOrchestrator`의 세 실패 경로가 손으로 짓는 `AuditLogEntry`의 0-값
보일러플레이트를 `AuditLogEntry.failed(...)` 팩터리로 흡수한다.

### Files

- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationAuditPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify (test): `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt` (존재 시)

### Steps

- [ ] **Step 1: 기존 감사 동작 테스트 확인.**
  orchestrator 실패 경로(큐 발행 실패, 모델 미허용, cost guard deny)가 기록하는
  `AuditLogEntry` 필드를 검증하는 기존 테스트를 찾고, 없으면 1개 추가해
  현재 필드 값을 고정(특히 `usage=(0,0,0)`, `costEstimateUsd=ZERO`, `latencyMs=0`,
  `status=FAILED`, `kind=FULL`).

- [ ] **Step 2: 팩터리 추가.**
  `AiGenerationAuditPort.kt`의 `AuditLogEntry`에 companion 추가:
  ```kotlin
  companion object {
      fun failed(
          jobId: UUID,
          sessionId: UUID,
          clubId: UUID,
          hostUserId: UUID,
          provider: Provider,
          model: String,
          transcriptSha256: String?,
          errorCode: ErrorCode,
          errorMessage: String,
          createdAt: Instant,
      ): AuditLogEntry =
          AuditLogEntry(
              jobId = jobId, sessionId = sessionId, clubId = clubId, hostUserId = hostUserId,
              kind = AuditKind.FULL, item = null, provider = provider, model = model,
              transcriptSha256 = transcriptSha256, usage = TokenUsage(0, 0, 0),
              costEstimateUsd = BigDecimal.ZERO, status = AuditStatus.FAILED,
              errorCode = errorCode, errorMessage = errorMessage, latencyMs = 0,
              createdAt = createdAt,
          )
  }
  ```

- [ ] **Step 3: orchestrator 3곳 치환.**
  `compensateQueuePublishFailure`, `failStart(command, modelId, code, message)`,
  `failStart(command, code, message)`의 `AuditLogEntry(...)`를
  `AuditLogEntry.failed(...)` 호출로. transcript 해시는 PR 1 적용 후면 `Sha256.hex(...)`.
  (cancel 경로의 `AuditLogEntry`는 `kind=CANCEL` 형태가 달라 **이번엔 그대로 둔다** —
  spec §5.2 결정.)

- [ ] **Step 4: 검증.** `./server/gradlew -p server test`. 감사 필드 1:1 동일 확인.

### 동작 보존 근거

팩터리가 채우는 모든 필드가 기존 인라인 생성과 값이 같다. 순수 추출.

---

## PR 3: 예외 처리 위생 (주석 + ignored 네이밍)

### Scope

광범위 catch/swallow 지점에 근거 주석과 `ignored` 네이밍을 정렬한다. **동작 변경 없음.**

### Files (점검 후 누락분만 수정)

- `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/**/*.kt` (6개 generator/regenerator)
- `server/src/main/kotlin/com/readmates/admin/health/application/service/providers/*.kt` (3개 card provider)
- `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`

### Steps

- [ ] **Step 1: 각 suppress 지점 분류.**
  `grep -rn 'TooGenericExceptionCaught\|SwallowedException'`로 나온 지점마다
  (a) 이미 근거 주석 있음 → skip, (b) 주석 없음 → 추가 대상 으로 분류.

- [ ] **Step 2: 근거 주석 + 네이밍.**
  주석 없는 광범위 catch에 1줄 추가 — *왜* 광범위 catch가 맞는지(외부 provider 실패
  격리 / 헬스 프로브는 throw 금지). 무시되는 예외 변수는 `ignored`로.
  `AiGenerationOrchestrator`의 큐 보상 주석을 모범 사례로 톤 정렬.

- [ ] **Step 3: 검증.** `./server/gradlew -p server test` + detekt. suppress 개수는
  유지될 수 있으나(정당), 남은 것은 코드에서 근거가 읽혀야 한다.

### 동작 보존 근거

주석·변수명만 변경. 제어 흐름·catch 범위·throw 동작 불변.

---

## P3 부록: LongParameterList suppress 분류 (조사 결과, 코드 변경 없음)

> spec §5.3. 15개 `@Suppress("LongParameterList")`를 분류한다. **이 PR 스택에서는
> 시그니처를 바꾸지 않는다** — 아래 표는 후속 승인용 후보 목록이다.

| 분류 | 처리 방침 | 예 |
| --- | --- | --- |
| (a) DI 생성자 | 유지 (Spring 주입, 빌더 불필요) | `AiGenerationOrchestrator` 10 deps |
| (b) 명령/DTO | 파라미터 오브젝트 후보 (응집 식별자 그룹) | 감사/알림 명령류 |
| (c) 내부 헬퍼 | 인라인/그룹화 후보, 호출부 적을 때만 | 사적 팩터리 함수 |

> 구현자 노트: 실제 분류는 구현 시점에 `grep -rn 'LongParameterList' server/src`로
> 15곳을 열거해 위 표를 채우고, (b)/(c) 중 **호출부 1~2곳·테스트 커버됨**인 것만
> 사용자에게 별도 PR로 제안한다. 임의 시그니처 변경은 회귀 위험으로 금지.

---

## Final Verification Matrix

| 검증 | PR1 | PR2 | PR3 |
| --- | --- | --- | --- |
| 신규/대상 단위 테스트 통과 | ✅ | ✅ | n/a |
| `./server/gradlew -p server clean test` | ✅ | ✅ | ✅ |
| detekt 통과 (불필요 suppress 미추가) | ✅ | ✅ | ✅ |
| 출력 byte-identical / 필드 1:1 | ✅ | ✅ | n/a |
| 응답·라우트·스키마·인가 무변경 | ✅ | ✅ | ✅ |
| 공개 저장소 안전 | ✅ | ✅ | ✅ |
