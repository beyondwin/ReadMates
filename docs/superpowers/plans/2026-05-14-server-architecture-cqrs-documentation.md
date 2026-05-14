# Server Architecture CQRS Documentation & ArchUnit Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** read-side(CQRS query) 와 write-side(command + domain) 패키지의 의도된 차이를 (a) 문서화하고 (b) ArchUnit 규칙으로 회귀 방지한다.

**Architecture:** 현재 `note`, `publication`, `archive`, `feedback` 은 `domain/` 패키지가 없는 read-side(JDBC 어댑터 → application service → port-in). `session`, `auth`, `club`, `notification` 은 `domain/` 을 가진 write-side. 이 차이가 의도이지만 문서화되어 있지 않아 신규 기여자가 "패키지 누락"으로 오해할 수 있음. 또한 read-side 서비스가 mutation 트랜잭션을 시작하지 않도록 ArchUnit 규칙으로 차단한다.

**Tech Stack:** Kotlin 2.2, Spring Boot 4, ArchUnit 1.3, Gradle.

---

## 배경 — 현재 상태

`server/src/main/kotlin/com/readmates/` 하위:

| 패키지 | domain/ | 비고 |
|---|---|---|
| `auth` | ✅ `MembershipRole.kt`, `MembershipStatus.kt`, `InvitationStatus.kt`, `MemberLifecycleStatus.kt` | 도메인 enum 집합 |
| `club` | ✅ | write-side |
| `session` | ✅ | write-side |
| `notification` | ✅ | outbox state machine |
| `note` | ❌ | `application/service/NotesFeedService.kt` + `JdbcNotesFeedAdapter.kt`. **read-side** |
| `publication` | ❌ | `application/service/PublicQueryService.kt` + `JdbcPublicQueryAdapter.kt`. **read-side** |
| `archive` | ❌ | read-side |
| `feedback` | ❌ | `FeedbackDocumentService` + `JdbcFeedbackDocumentStoreAdapter`. 부분적 mutation 존재 (업로드 저장) |

`server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt` 는 이미 모든 `*.adapter.in.web..` 와 `*.application..` 을 enumerate 중. 의도된 구조다.

## 변경 범위

1. `docs/development/architecture.md` 에 "CQRS Read vs Write split" 섹션 추가.
2. ArchUnit 테스트에 **read-only application service**를 식별하는 marker 추가 + 규칙 (read service는 mutation 메서드 시그니처 금지).
3. `feedback` 의 mixed read/write 케이스를 명시적으로 분류 (write 쪽 메서드는 별도 service 또는 별도 port로 분리할지 결정만 기록 — 본 PR에서는 분리하지 않음).

---

### Task 1: ArchUnit 테스트 baseline 확인

**Files:**
- Read: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: 현재 통과 상태 확인**

```bash
cd server && ./gradlew architectureTest
```

Expected: BUILD SUCCESSFUL. 기존 ArchUnit 규칙 통과.

- [ ] **Step 2: 현재 enumerate된 패키지 목록 출력**

```bash
grep -A 30 "migratedApplicationPackages\|migratedWebAdapterPackages" \
  server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
```

Expected: 모든 9개 도메인 패키지가 두 리스트에 포함됨.

---

### Task 2: Read-only service marker annotation 정의

**Files:**
- Create: `server/src/main/kotlin/com/readmates/shared/architecture/ReadOnlyApplicationService.kt`

- [ ] **Step 1: marker 작성**

```kotlin
package com.readmates.shared.architecture

/**
 * CQRS read-side application service임을 명시.
 *
 * 이 annotation이 붙은 클래스는:
 *  - mutation port (`...Save...`, `...Update...`, `...Delete...`) 를 참조하지 않는다.
 *  - `@Transactional(readOnly = false)` 를 사용하지 않는다.
 *
 * 현재 read-side 패키지: note, publication, archive.
 * `feedback` 은 mixed (upload mutation 존재) — annotation 부착 금지.
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
annotation class ReadOnlyApplicationService
```

- [ ] **Step 2: 컴파일 확인**

```bash
cd server && ./gradlew compileKotlin
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add server/src/main/kotlin/com/readmates/shared/architecture/ReadOnlyApplicationService.kt
git commit -m "feat(server): add ReadOnlyApplicationService marker annotation"
```

---

### Task 3: read-side service에 annotation 부착

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/note/application/service/NotesFeedService.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/service/` 하위 service들

- [ ] **Step 1: 대상 식별**

```bash
find server/src/main/kotlin/com/readmates/{note,publication,archive}/application/service -name "*.kt"
```

Expected: 각 패키지 service 클래스 목록 출력.

- [ ] **Step 2: 각 클래스 파일에 annotation 추가**

각 service 파일의 클래스 선언 직전에 다음 import + annotation 추가:

```kotlin
import com.readmates.shared.architecture.ReadOnlyApplicationService

@ReadOnlyApplicationService
@Service
class NotesFeedService(
  // ...
) { ... }
```

> 주의: `feedback` 은 mixed → annotation 부착하지 않음.

- [ ] **Step 3: 단위 테스트 실행**

```bash
cd server && ./gradlew unitTest
```

Expected: 모든 unit 테스트 통과 (annotation은 런타임 동작에 영향 없음).

- [ ] **Step 4: Commit**

```bash
git add server/src/main/kotlin/com/readmates/{note,publication,archive}/application/service
git commit -m "refactor(server): mark read-side services with @ReadOnlyApplicationService"
```

---

### Task 4: ArchUnit 규칙 — read service의 mutation 차단

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: 새 ArchUnit 규칙 작성**

`ServerArchitectureBoundaryTest` 클래스에 다음 메서드 추가:

```kotlin
@Test
fun `read-only application services must not depend on mutation ports`() {
    val rule = classes()
        .that().areAnnotatedWith(
            "com.readmates.shared.architecture.ReadOnlyApplicationService"
        )
        .should().onlyDependOnClassesThat(
            DescribedPredicate.describe("non-mutation ports") { dep ->
                val name = dep.name
                val isMutationPort = name.contains(".port.out.")
                    && (name.endsWith("SavePort")
                        || name.endsWith("UpdatePort")
                        || name.endsWith("DeletePort")
                        || name.endsWith("WriterPort")
                        || name.endsWith("StorePort"))
                !isMutationPort
            }
        )
    rule.check(importedClasses)
}

@Test
fun `read-only application services must not be Transactional with rollback`() {
    val rule = noClasses()
        .that().areAnnotatedWith(
            "com.readmates.shared.architecture.ReadOnlyApplicationService"
        )
        .should().beAnnotatedWith(
            "org.springframework.transaction.annotation.Transactional"
        )
        .andShould(
            // 본 규칙은 단순화 버전. @Transactional(readOnly=true) 만 허용하려면
            // 추가 reflection 검사가 필요하므로, 일단 모든 @Transactional 부착 금지로 시작.
            object : ArchCondition<JavaClass>("not be @Transactional (read services use repository-level readOnly)") {
                override fun check(item: JavaClass, events: ConditionEvents) {
                    // no-op: @Transactional 부착 자체를 금지하는 위 조건으로 충분
                }
            }
        )
    rule.check(importedClasses)
}
```

> 필요한 import 추가:
> ```kotlin
> import com.tngtech.archunit.base.DescribedPredicate
> import com.tngtech.archunit.core.domain.JavaClass
> import com.tngtech.archunit.lang.ArchCondition
> import com.tngtech.archunit.lang.ConditionEvents
> ```

- [ ] **Step 2: ArchUnit 테스트 실행**

```bash
cd server && ./gradlew architectureTest
```

Expected: BUILD SUCCESSFUL. 새 규칙이 추가되었고 위반 없음.

- [ ] **Step 3: 의도적으로 위반 추가하여 fail 확인 (TDD 검증)**

`NotesFeedService.kt` 클래스 위에 임시로 `@org.springframework.transaction.annotation.Transactional` 추가 후:

```bash
cd server && ./gradlew architectureTest
```

Expected: BUILD FAILED. 위 규칙이 위반을 잡아냄.

원복:

```bash
git checkout server/src/main/kotlin/com/readmates/note/application/service/NotesFeedService.kt
```

- [ ] **Step 4: Commit**

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "test(server): enforce read-side service purity in ArchUnit"
```

---

### Task 5: 아키텍처 문서 갱신

**Files:**
- Modify: `docs/development/architecture.md`

- [ ] **Step 1: 현재 문서 확인**

```bash
head -80 docs/development/architecture.md
```

Expected: 기존 아키텍처 문서 내용 출력.

- [ ] **Step 2: CQRS 섹션 추가**

문서 적절한 위치(아키텍처 개요 아래)에 다음 섹션을 추가:

```markdown
## CQRS Read vs Write Package Split

ReadMates 서버는 도메인 패키지를 다음 두 형태로 운영합니다.

### Write-side (domain/ 포함)
- `auth`, `club`, `session`, `notification`
- 상태를 가진 entity, 도메인 enum, 비즈니스 invariant
- `application/` 은 command use case와 도메인 객체 조작
- 트랜잭션 mutation을 수행

### Read-side (domain/ 없음)
- `note`, `publication`, `archive`
- `application/model/` 의 read DTO + `JdbcXxxAdapter` 직접 query
- 도메인 엔티티 없이 query result 모델만 정의
- `@ReadOnlyApplicationService` 마커로 식별 (`shared/architecture/`)

### Mixed
- `feedback` — 문서 업로드 mutation + 조회를 함께 보유. 향후 분리 후보지만 현재 단일 service에 응집.

### 강제 규칙
- ArchUnit `ServerArchitectureBoundaryTest` 가 다음을 차단:
  - read-only service의 mutation port 의존
  - read-only service의 `@Transactional` 부착
```

- [ ] **Step 3: docs build (있다면) 또는 markdown lint**

```bash
# 본 저장소에 docs build 스크립트가 없으면 skip
test -f scripts/check-docs.sh && bash scripts/check-docs.sh || echo "no docs check script"
```

Expected: error 없음 또는 스크립트 없음 안내.

- [ ] **Step 4: Commit**

```bash
git add docs/development/architecture.md
git commit -m "docs(server): document CQRS read/write package split convention"
```

---

## Self-Review 체크리스트

- [x] Spec coverage: 문서화(Task 5), marker(Task 2), 부착(Task 3), 규칙(Task 4)
- [x] Placeholder: 없음 (모든 코드 블록은 실제 작성 가능한 형태)
- [x] Type consistency: annotation FQCN, service 클래스명, port suffix 규칙 일관

## Rollback

각 Task가 독립 커밋이므로 역순으로 revert. ArchUnit 규칙만 revert해도 코드는 동작.

## Out of Scope

- `feedback` 의 read/write 분리는 별도 플랜으로 (도메인 영향 큼).
- ArchUnit의 정밀 `@Transactional(readOnly=true)` 검사는 후속 작업.
