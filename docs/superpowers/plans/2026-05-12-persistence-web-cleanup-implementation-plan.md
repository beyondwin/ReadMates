# persistence 어댑터 Web/HTTP 정리 Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 `ServerArchitectureBoundaryTest`의 baseline exception 리스트에 남아 있는 5개 persistence 어댑터의 Spring Web/HTTP 의존성을 슬라이스 단위로 제거하고, baseline exception 리스트를 점진적으로 비운다. 사용자 가시 동작과 HTTP 응답 계약은 보존되며, 어댑터 안에서 던지던 `ResponseStatusException`은 outbound port outcome → service 도메인 예외 → inbound `@RestControllerAdvice` HTTP 매핑 경로로 옮긴다.

**Architecture:** outbound port outcome sealed type → application service의 도메인 예외 매핑 → inbound `@RestControllerAdvice`의 HTTP 상태 매핑. 어댑터는 더 이상 `HttpStatus`/`ResponseStatusException`을 import하지 않고, Web 모듈은 inbound 방향에서만 사용한다.

**Tech Stack:** Kotlin, Spring Boot, JUnit 5, ArchUnit.

**범위(Scope):** 본 plan은 **문서 정착 PR이 아닌, 후속 코드 리팩터 사이클**을 위한 슬라이스 정의서다. 본 plan을 commit하는 PR 자체에는 코드 변경이 포함되지 않으며, 실제 어댑터 리팩터/baseline 제거는 다음 사이클에서 본 plan을 task-by-task로 실행한다.

---

## Source Documents

- 사전 risk hardening 짝 plan: `docs/superpowers/plans/2026-05-12-v1.7-followup-hardening-implementation-plan.md`
- 사전 risk hardening 상세 spec: `docs/superpowers/specs/2026-05-12-v1.7-followup-hardening-detailed-implementation.md`
- 아키텍처 출처: `docs/development/architecture.md`
- Surface guide: `docs/agents/server.md`

## Baseline Exception 현황

`server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt:124`(baseline 리스트는 lines 130-148 부근)에 등록된 5개 어댑터:

- `com.readmates.auth.adapter.out.persistence.JdbcMemberApprovalStoreAdapter`
- `com.readmates.auth.adapter.out.persistence.JdbcMemberLifecycleStoreAdapter`
- `com.readmates.auth.adapter.out.persistence.JdbcMemberProfileStoreAdapter`
- `com.readmates.auth.adapter.out.persistence.JdbcPendingApprovalStoreAdapter`
- `com.readmates.feedback.adapter.out.persistence.JdbcFeedbackDocumentStoreAdapter`

각 어댑터는 현재 JDBC 결과를 `ResponseStatusException(HttpStatus.*)`로 그대로 던져, outbound adapter에서 inbound Web 의존성이 노출돼 있다.

## File Map

### Create (per slice)

- `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberApprovalStoreOutcome.kt`: Approval 어댑터 outbound port outcome sealed type.
- `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberLifecycleStoreOutcome.kt`: Lifecycle 어댑터 outbound port outcome.
- `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberProfileStoreOutcome.kt`: Profile 어댑터 outbound port outcome.
- `server/src/main/kotlin/com/readmates/auth/application/port/out/PendingApprovalStoreOutcome.kt`: Pending approval 어댑터 outbound port outcome.
- `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStoreOutcome.kt`: Feedback document 어댑터 outbound port outcome.

> 실제 outcome 타입 이름/위치는 기존 `JdbcPlatformAdminAdapter` 리팩터 결과와 동일한 컨벤션을 따른다. 본 plan 실행 시 기존 모듈 패키지 구조와 충돌하면 그 경로에 맞춰 조정한다.

### Modify (per slice)

- 각 어댑터의 outbound port interface(메서드 시그니처를 outcome 반환으로 변경).
- 각 어댑터의 JDBC 구현체(`HttpStatus`/`ResponseStatusException` import 제거, outcome 반환).
- 각 어댑터를 사용하는 application service(outcome → 도메인 예외 매핑 추가).
- 해당 영역의 `@RestControllerAdvice`(또는 controller advice 위치)(도메인 예외 → HTTP 상태 매핑 보강. 이미 매핑이 있으면 변경 없음).
- `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`: baseline exception 리스트에서 해당 어댑터 1줄 제거.
- `CHANGELOG.md`(`Unreleased` 섹션): 슬라이스 한 줄 보강.

## Per-slice Steps (공통 패턴)

각 어댑터 task는 다음 5단계로 구성한다. Task별 세부는 아래 Task 1~5에 명시한다.

1. **(a) sealed outcome 추가**: 어댑터 outbound port outcome sealed interface/class를 새 파일로 추가하고, 기존 port 메서드 시그니처를 outcome 반환으로 교체. 기존 호출부 컴파일 오류를 고의로 발생시켜 모든 호출 경로를 찾는다.
2. **(b) service 매핑**: outcome을 application service에서 분해해 기존에 던지던 도메인 예외(없으면 정의)를 던지도록 한다. controller 계층에서 보던 HTTP 의미가 그대로 보존되는지 매핑 표를 확인한다.
3. **(c) adapter import 제거**: JDBC 어댑터에서 `org.springframework.http.HttpStatus`와 `org.springframework.web.server.ResponseStatusException` import를 제거한다. `rg`로 잔존 여부를 검증한다.
4. **(d) baseline exception 1개 제거**: `ServerArchitectureBoundaryTest`의 baseline 리스트에서 이 어댑터의 진입을 1줄 제거한다. ArchUnit이 더 이상 예외를 인정하지 않는 상태에서도 boundary test가 통과해야 한다.
5. **(e) controller test 회귀 확인**: 해당 어댑터 의존 controller에 한정된 narrow 테스트 실행으로 HTTP 응답 코드/메시지가 변하지 않았는지 확인한다.

## Full Verification (모든 슬라이스 완료 시점에 1회)

- `./server/gradlew -p server clean test`
- 슬라이스마다 영향 controller test 한정 실행(예: `./server/gradlew -p server test --tests 'com.readmates.auth.adapter.in.web.*'`).
- `rg -n 'ResponseStatusException|org\.springframework\.http\.HttpStatus' server/src/main/kotlin/com/readmates/auth/adapter/out/persistence server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence` 결과가 비어야 한다.
- 공개 저장소 안전 스캔(`rg -n '(/)Users/|readmates[.]kr|ocid1[.]|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9][A-Za-z0-9_-]{20,}' ...`).

## Release Readiness

- 슬라이스 완료마다 `CHANGELOG.md`의 `## Unreleased` 섹션에 boundary cleanup 진척 한 줄을 추가한다(예: `- 아키텍처 경계: JdbcMemberApprovalStoreAdapter Web/HTTP 의존성 제거 및 baseline exception 1건 축소.`).
- 실행 환경에서 일부 검사가 건너뛰어졌으면 PR 본문에 다음 형식으로 명시한다(Skipped를 passed로 기록하지 않는다).

```text
Skipped: <check>, because <reason>.
```

---

### Task 1: jdbc-member-approval-store (JdbcMemberApprovalStoreAdapter)

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberApprovalStoreOutcome.kt`
- Modify: `JdbcMemberApprovalStoreAdapter`(JDBC 구현체), 동일 outbound port interface, 호출 application service, 영향 `@RestControllerAdvice`, `ServerArchitectureBoundaryTest.kt` baseline 리스트.

- [ ] **Step 1: sealed outcome 추가 (a)**

`MemberApprovalStoreOutcome` sealed interface를 정의하고, outbound port의 메서드 시그니처를 `MemberApprovalStoreOutcome` 반환으로 교체한다. 기존 어댑터가 던지던 `HttpStatus.CONFLICT/NOT_FOUND/...` 의미별로 outcome variant를 분리한다.

- [ ] **Step 2: service 매핑 (b)**

호출하는 application service에서 outcome을 분해해 기존 HTTP 의미와 동일한 도메인 예외를 던지도록 매핑한다. 매핑 표(outcome → domain exception → HTTP status)를 PR 설명에 첨부한다.

- [ ] **Step 3: adapter import 제거 (c)**

`JdbcMemberApprovalStoreAdapter`에서 `org.springframework.http.HttpStatus`, `org.springframework.web.server.ResponseStatusException` import 제거. 검증:

```bash
rg -n 'ResponseStatusException|org\.springframework\.http\.HttpStatus' \
  server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberApprovalStoreAdapter.kt
```

기대: 출력 없음.

- [ ] **Step 4: baseline exception 1개 제거 (d)**

`ServerArchitectureBoundaryTest.kt`(line 124 근처 정의의 baseline 리스트 lines 130-148)에서 `JdbcMemberApprovalStoreAdapter` 진입 1줄을 제거한다. 검증:

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

기대: 통과.

- [ ] **Step 5: controller test 회귀 확인 (e)**

해당 어댑터 영향 controller에 한정해 narrow 테스트를 돌린다.

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.adapter.in.web.*MemberApproval*'
```

기대: 통과. HTTP 상태와 응답 본문 의미가 변하지 않는다.

- [ ] **Step 6: 슬라이스 commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/port/out/MemberApprovalStoreOutcome.kt \
        server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberApprovalStoreAdapter.kt \
        server/src/main/kotlin/com/readmates/auth \
        server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt \
        CHANGELOG.md
git commit -m "refactor: lift member approval store http mapping into web layer"
```

### Task 2: jdbc-member-lifecycle-store (JdbcMemberLifecycleStoreAdapter)

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberLifecycleStoreOutcome.kt`
- Modify: `JdbcMemberLifecycleStoreAdapter`, outbound port interface, 호출 application service, 영향 `@RestControllerAdvice`, `ServerArchitectureBoundaryTest.kt` baseline 리스트.

- [ ] **Step 1: sealed outcome 추가 (a)**

`MemberLifecycleStoreOutcome` sealed interface 정의. 어댑터가 던지던 HTTP 상태별 의미를 outcome variant로 분리.

- [ ] **Step 2: service 매핑 (b)**

application service에서 outcome → 도메인 예외 매핑 추가. 기존 controller advice가 도메인 예외를 받지 못하면 advice에 매핑 추가.

- [ ] **Step 3: adapter import 제거 (c)**

```bash
rg -n 'ResponseStatusException|org\.springframework\.http\.HttpStatus' \
  server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberLifecycleStoreAdapter.kt
```

기대: 출력 없음.

- [ ] **Step 4: baseline exception 1개 제거 (d)**

`ServerArchitectureBoundaryTest.kt` baseline 리스트에서 `JdbcMemberLifecycleStoreAdapter` 진입 제거.

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

- [ ] **Step 5: controller test 회귀 확인 (e)**

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.adapter.in.web.*MemberLifecycle*'
```

- [ ] **Step 6: 슬라이스 commit**

```bash
git commit -m "refactor: lift member lifecycle store http mapping into web layer"
```

### Task 3: jdbc-member-profile-store (JdbcMemberProfileStoreAdapter)

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberProfileStoreOutcome.kt`
- Modify: `JdbcMemberProfileStoreAdapter`, outbound port interface, 호출 application service, 영향 `@RestControllerAdvice`, `ServerArchitectureBoundaryTest.kt` baseline 리스트.

- [ ] **Step 1: sealed outcome 추가 (a)**

`MemberProfileStoreOutcome` sealed interface 정의 및 port 시그니처 교체.

- [ ] **Step 2: service 매핑 (b)**

application service에서 outcome 분해 + 도메인 예외 매핑 추가.

- [ ] **Step 3: adapter import 제거 (c)**

```bash
rg -n 'ResponseStatusException|org\.springframework\.http\.HttpStatus' \
  server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberProfileStoreAdapter.kt
```

기대: 출력 없음.

- [ ] **Step 4: baseline exception 1개 제거 (d)**

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

- [ ] **Step 5: controller test 회귀 확인 (e)**

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.adapter.in.web.*MemberProfile*'
```

- [ ] **Step 6: 슬라이스 commit**

```bash
git commit -m "refactor: lift member profile store http mapping into web layer"
```

### Task 4: jdbc-pending-approval-store (JdbcPendingApprovalStoreAdapter)

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/PendingApprovalStoreOutcome.kt`
- Modify: `JdbcPendingApprovalStoreAdapter`, outbound port interface, 호출 application service, 영향 `@RestControllerAdvice`, `ServerArchitectureBoundaryTest.kt` baseline 리스트.

- [ ] **Step 1: sealed outcome 추가 (a)**

`PendingApprovalStoreOutcome` sealed interface 정의 및 port 시그니처 교체.

- [ ] **Step 2: service 매핑 (b)**

application service에서 outcome 분해 + 도메인 예외 매핑 추가. pending approval 영역 controller advice에 매핑이 없으면 추가.

- [ ] **Step 3: adapter import 제거 (c)**

```bash
rg -n 'ResponseStatusException|org\.springframework\.http\.HttpStatus' \
  server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcPendingApprovalStoreAdapter.kt
```

기대: 출력 없음.

- [ ] **Step 4: baseline exception 1개 제거 (d)**

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

- [ ] **Step 5: controller test 회귀 확인 (e)**

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.adapter.in.web.*PendingApproval*'
```

- [ ] **Step 6: 슬라이스 commit**

```bash
git commit -m "refactor: lift pending approval store http mapping into web layer"
```

### Task 5: jdbc-feedback-document-store (JdbcFeedbackDocumentStoreAdapter)

**Files:**
- Create: `server/src/main/kotlin/com/readmates/feedback/application/port/out/FeedbackDocumentStoreOutcome.kt`
- Modify: `JdbcFeedbackDocumentStoreAdapter`, outbound port interface, 호출 application service, feedback 영역 `@RestControllerAdvice`, `ServerArchitectureBoundaryTest.kt` baseline 리스트.

- [ ] **Step 1: sealed outcome 추가 (a)**

`FeedbackDocumentStoreOutcome` sealed interface 정의 및 port 시그니처 교체.

- [ ] **Step 2: service 매핑 (b)**

application service에서 outcome 분해 + 도메인 예외 매핑 추가.

- [ ] **Step 3: adapter import 제거 (c)**

```bash
rg -n 'ResponseStatusException|org\.springframework\.http\.HttpStatus' \
  server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence/JdbcFeedbackDocumentStoreAdapter.kt
```

기대: 출력 없음.

- [ ] **Step 4: baseline exception 1개 제거 (d)**

이 슬라이스에서 baseline 리스트가 비워진다(5개 모두 제거 완료).

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

- [ ] **Step 5: controller test 회귀 확인 (e)**

```bash
./server/gradlew -p server test --tests 'com.readmates.feedback.adapter.in.web.*'
```

- [ ] **Step 6: 슬라이스 commit**

```bash
git commit -m "refactor: lift feedback document store http mapping into web layer"
```

### Task 6: 최종 검증 및 baseline 빈 상태 잠금

**Files:**
- Verify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`, 영향 어댑터/서비스/advice.

- [ ] **Step 1: 전체 서버 테스트**

```bash
./server/gradlew -p server clean test
```

기대: 통과.

- [ ] **Step 2: 잔존 Web/HTTP import 0건 확인**

```bash
rg -n 'ResponseStatusException|org\.springframework\.http\.HttpStatus' \
  server/src/main/kotlin/com/readmates/auth/adapter/out/persistence \
  server/src/main/kotlin/com/readmates/feedback/adapter/out/persistence
```

기대: 출력 없음.

- [ ] **Step 3: baseline 리스트가 비었는지 확인**

`ServerArchitectureBoundaryTest.kt`의 baseline exception 리스트가 비어 있고, 본 plan이 다루는 5개 어댑터 클래스명이 어디에도 잔존하지 않는다.

- [ ] **Step 4: 공개 저장소 안전 스캔**

```bash
rg -n '(/)Users/|readmates[.]kr|ocid1[.]|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9][A-Za-z0-9_-]{20,}' \
  $(git diff --name-only origin/main...HEAD)
```

기대: 출력 없음.

- [ ] **Step 5: CHANGELOG `Unreleased` 마감 한 줄**

`## Unreleased`에 다음 한 줄을 추가한다.

```text
- 아키텍처 경계: persistence 어댑터 Web/HTTP 의존성 5건 정리 완료, `ServerArchitectureBoundaryTest` baseline exception 리스트 0건.
```
