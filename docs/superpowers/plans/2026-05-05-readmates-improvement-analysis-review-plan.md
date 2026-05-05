# ReadMates Improvement Analysis Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-05-05-readmates-improvement-analysis.md`의 22개 개선 제안을 현재 코드 기준으로 재검증하고, 필요한 항목만 안전한 PR 단위로 실행한다.

**Architecture:** 변경은 서버 운영 안정성, 배포 재현성, 프런트 경계 정리, 문서/로컬 개발 위생으로 나눠 진행한다. 서버 변경은 feature-local clean architecture와 BFF/auth 경계를 유지하고, 프런트 변경은 route-first 의존 방향과 UI prop/callback 경계를 유지한다. 외부 서비스나 배포 계정이 필요한 항목은 코드 변경 전에 결정 기록을 남긴다.

**Tech Stack:** Kotlin 2.2 + Spring Boot 4.0, Spring Security, Spring Kafka 4 / Kafka clients 4.1.1, MySQL/Flyway, React 19 + Vite 8 + React Router 7, Cloudflare Pages Functions, Docker/GitHub Actions.

---

## 검토 결론

원문은 유용한 개선 후보를 많이 담고 있지만, 현재 코드와 맞지 않는 전제도 섞여 있다. 특히 `@ConditionalOnProperty`는 현재 Spring Boot 4.0 의존성에서 `@Repeatable(ConditionalOnProperties.class)`가 붙어 있으므로 “두 번째 조건이 무시될 수 있다”는 원문 전제는 버그로 보기 어렵다. Kafka producer idempotence도 Kafka clients 4.1.1 기본값이 `enable.idempotence=true`, `acks=all`, `retries=Int.MAX_VALUE`라서 원문의 위험 설명은 낡았다.

반대로 Flyway migration 경로 중복, 서버 이미지 배포 부재, `ObjectProvider<JdbcTemplate>` fail-open, application 계층의 Spring Security 의존, 운영 로그 부족, 대형 UI 파일, public/archive 가시성 테스트 부족은 현재 코드에서도 확인된다.

## 항목별 판정표

| 원문 | 판정 | 새 우선순위 | 결정 |
| --- | --- | --- | --- |
| 1-1 `@ConditionalOnProperty` 중복 | 불필요 | 제외 | Spring Boot 4.0에서 repeatable이다. 버그 수정으로 진행하지 않는다. 스타일 통합만 원하면 별도 작은 PR로 처리한다. |
| 1-2 Flyway migration 디렉토리 2개 | 필요 | P0 | `db/migration` 12개가 dead path로 남아 있다. 삭제와 guard가 필요하다. |
| 1-3 서버 Docker 이미지 CI 미게시 | 필요 | P0 | version skew 재발 방지를 위해 서버 이미지 빌드/게시 경로가 필요하다. |
| 1-4 서버 운영 로그 부족 | 필요 | P1 | 민감값 없이 상태 전환, BFF 거부, 알림 실패를 구조화 로그로 남긴다. |
| 1-5 대형 프런트 컴포넌트 | 필요 | P2 | `host-dashboard`, `my-page`는 기존 split plan을 사용하고, `host-members` plan을 추가한다. |
| 2-1 미사용 JPA 의존성 | 필요 | P1 | JPA 사용처가 없으므로 `spring-boot-starter-jdbc`로 명시 전환한다. |
| 2-2 Notes feed 상관 서브쿼리 | 필요 | P2 | 애플리케이션 N+1은 아니지만 MySQL plan 비용 후보이다. 측정 후 쿼리 개선한다. |
| 2-3 application 계층의 Spring Security 의존 | 필요 | P1 | `AuthenticatedMemberResolver`에서 `Authentication` 의존을 제거하고 ArchUnit guard를 추가한다. |
| 2-4 `ObjectProvider<JdbcTemplate>` fail-open | 필요 | P1 | 운영 DB 부재를 빈 결과로 숨기는 adapter부터 직접 주입으로 바꾼다. |
| 2-5 Kafka producer idempotence | 부분 필요 | P2 | producer 위험 설명은 낡았다. consumer commit/isolation 명시와 config test 보강으로 축소한다. |
| 2-6 notification delivery 로직 중복 | 필요 | P2 | retry 정책은 이미 외부화됐다. 남은 failure/success 처리 중복을 엔진으로 추출한다. |
| 2-7 `JdbcNotesFeedAdapter.shortNameFor` | 필요 | P3 | dev seed 결합은 맞지만 기능 위험은 낮다. 관련 short-name helper 정리와 함께 처리한다. |
| 2-8 auth API가 공통 client 우회 | 필요 | P2 | `readmatesFetchResponse`로 통일하되 401 redirect가 맞는 호출만 선별한다. |
| 2-9 archive/publication 테스트 부족 | 필요 | P1 | public/member visibility와 multi-club 격리는 보안 경계라 우선 보강한다. |
| 2-10 서버 Dockerfile multi-stage 부재 | 필요 | P0 | 서버 이미지 CI와 같은 PR 묶음으로 재현 가능한 빌드를 만든다. |
| 2-11 Vite route lazy loading 부재 | 선택 | P3 | bundle 측정 후 진행한다. 운영 안정성보다 후순위다. |
| 2-12 Sentry/외부 에러 수신 없음 | 보류 | Decision needed | 외부 서비스 계정/DSN/개인정보 정책 결정이 필요하다. 기본 구현 대상에서 제외한다. |
| 3-1 `"use client"` 21개 | 필요 | P3 | Vite에서는 불필요한 잔재다. 자동 삭제와 lint/test로 처리한다. |
| 3-2 reset-password dead code | 불필요 | 제외 | architecture와 UI copy가 종료된 호환 route임을 이미 설명한다. 코드 주석 추가는 선택이다. |
| 3-3 `clubSlug` 정규식 중복 | 필요 | P2 | Vite proxy와 Pages Function 차이를 막기 위해 shared helper로 통합한다. |
| 3-4 Redpanda healthcheck 없음 | 필요 | P3 | 로컬 DX 개선으로 처리한다. |
| 3-5 CODEOWNERS 없음 | 불필요 | 제외 | 현재 `.github/CODEOWNERS`에 `.github/workflows/** @beyondwin`이 이미 있다. |

## 우선순위 정의

- **P0:** 배포 재현성, DB source-of-truth, version skew 방지. 먼저 끝내야 이후 변경이 안전하다.
- **P1:** auth/security boundary, 운영 장애 가시성, public/member data exposure 회귀 방지.
- **P2:** 성능과 유지보수성. 영향은 크지만 P0/P1 이후 순차 진행한다.
- **P3:** 위생/DX/선택 기능. 다른 작업과 겹칠 때만 작게 처리한다.
- **제외/보류:** 원문 전제가 틀렸거나, 이미 처리됐거나, 제품/운영 결정 없이는 진행하지 않는다.

## 실행 순서

1. P0를 2개 PR로 처리한다: Flyway dead path cleanup, 서버 이미지 재현성.
2. P1을 서버 중심으로 처리한다: JPA 제거, auth boundary, JDBC fail-fast, 운영 로그, public/archive 테스트.
3. P2를 독립 PR로 처리한다: notes query, notification engine, Kafka config 명시, auth API client, slug helper, 대형 UI split.
4. P3는 release 전 위생 작업 또는 관련 파일을 만질 때 함께 처리한다.

---

## P0 Task 1: Flyway migration source-of-truth 정리

**Why:** `server/src/main/resources/db/migration`은 현재 `spring.flyway.locations`에서 사용하지 않는 dead path다. 새 migration이 이 경로에 추가되면 운영 DB에 적용되지 않는다.

**Files:**

- Delete: `server/src/main/resources/db/migration/`
- Modify: `docs/development/local-setup.md`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/deploy/oci-backend.md`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [x] **Step 1: dead migration path 참조 확인**

Run:

```bash
rg -n 'db/migration|db/mysql/migration|READMATES_FLYWAY_LOCATIONS' \
  server/src/main/resources docs/development docs/deploy server/src/test/kotlin
```

Expected: runtime/test/deploy docs are already anchored on `db/mysql/migration`; only deleted source files remain under `db/migration`.

- [x] **Step 2: unused migration directory 삭제**

Delete all files under:

```text
server/src/main/resources/db/migration/
```

Do not renumber or edit `server/src/main/resources/db/mysql/migration/*.sql`.

- [x] **Step 3: docs에 새 migration 추가 위치 명시**

Add a short note near existing Flyway/local setup guidance:

```markdown
새 운영 migration은 `server/src/main/resources/db/mysql/migration`에만 추가합니다.
`server/src/main/resources/db/migration`은 사용하지 않으며, 새 파일을 만들면 운영 Flyway가 읽지 않습니다.
```

- [x] **Step 4: Flyway test로 migration source 확인**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
git diff --check -- docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md
```

Expected: Flyway migration test passes and doc whitespace check passes.

- [x] **Step 5: commit**

```bash
git add server/src/main/resources/db/migration \
        docs/development/local-setup.md \
        docs/development/test-guide.md \
        docs/deploy/oci-backend.md
git commit -m "chore: remove unused Flyway migration path"
```

## P0 Task 2: 재현 가능한 서버 이미지와 GHCR publish

**Why:** 현재 `server/Dockerfile`은 사전 `bootJar` 산출물을 복사하므로 `docker build server`만으로 이미지가 재현되지 않는다. GitHub Actions도 서버 이미지를 게시하지 않아 tag와 운영 서버 버전이 분리될 수 있다.

**Files:**

- Modify: `server/Dockerfile`
- Modify: `server/.dockerignore`
- Create: `.github/workflows/deploy-server.yml`
- Modify: `deploy/oci/05-deploy-compose-stack.sh`
- Modify: `docs/deploy/oci-backend.md`
- Modify: `docs/deploy/compose-stack.md`
- Modify: `docs/deploy/README.md`
- Modify: `docs/development/release-management.md`
- Modify: `docs/development/versioning.md`

- [x] **Step 1: Dockerfile을 multi-stage로 전환**

Use this shape, preserving the existing non-root runtime user and exposed ports:

```dockerfile
FROM eclipse-temurin:21-jdk-jammy AS builder
WORKDIR /build
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates
WORKDIR /app
COPY --from=builder /build/build/libs/*.jar /app/readmates-server.jar
RUN chown -R readmates:readmates /app
USER readmates
EXPOSE 8080 8081
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/readmates-server.jar"]
```

Update `server/.dockerignore` so the builder stage can see Gradle wrapper files and sources:

```dockerignore
.gradle
build/classes
build/generated
build/kotlin
build/reports
build/test-results
build/tmp
*.iml
```

Build with `server/` as the Docker context:

```bash
docker build -t readmates-server:local server
```

- [x] **Step 2: server image workflow 추가**

Create `.github/workflows/deploy-server.yml`:

```yaml
name: Deploy Server Image

on:
  workflow_dispatch:
  push:
    tags:
      - "v*"

permissions:
  contents: read
  packages: write

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-and-push:
    name: Build and push GHCR image
    if: ${{ github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/tags/v') }}
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          ref: ${{ github.ref }}

      - name: Log in to GHCR
        uses: docker/login-action@11f9a3f1bbfb5a0e7ef0f419ca55f271fdd53c44 # v3.6.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@263435318d21b8e681c14492fe198d362a7d2c83 # v6.18.0
        with:
          context: server
          file: server/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/readmates-server:${{ github.ref_name }}
```

- [x] **Step 3: release/deploy docs에 tag-image 연결 추가**

Document that server deploy pulls:

```text
ghcr.io/<owner>/<repo>/readmates-server:<git-tag>
```

Use placeholder owner/repo only. Do not add private registry URLs or deployment hostnames.

Update `deploy/oci/05-deploy-compose-stack.sh` so `ghcr.io/` image tags are pulled on the VM. Keep non-GHCR tags as the local build/save/load path for transition checks.

- [x] **Step 4: verification**

Run:

```bash
docker build -t readmates-server:local server
./server/gradlew -p server clean test
bash -n deploy/oci/05-deploy-compose-stack.sh
git diff --check -- server/Dockerfile server/.dockerignore .github/workflows/deploy-server.yml deploy/oci/05-deploy-compose-stack.sh docs/deploy/oci-backend.md docs/deploy/compose-stack.md docs/deploy/README.md docs/development/release-management.md docs/development/versioning.md
```

Expected: local image builds from a clean repo root context, server tests pass, diff check passes.

- [x] **Step 5: commit**

```bash
git add server/Dockerfile server/.dockerignore .github/workflows/deploy-server.yml \
        deploy/oci/05-deploy-compose-stack.sh \
        docs/deploy/oci-backend.md docs/deploy/compose-stack.md docs/deploy/README.md \
        docs/development/release-management.md docs/development/versioning.md
git commit -m "ci: publish tagged server images"
```

---

## P1 Task 3: JPA 제거와 JDBC 의존성 명시

**Why:** 현재 서버는 `@Entity`, `JpaRepository`, `EntityManager`를 쓰지 않는다. `spring-boot-starter-data-jpa`와 `spring.jpa.*` 설정은 부팅 비용과 혼동만 만든다.

**Files:**

- Modify: `server/build.gradle.kts`
- Modify: `server/src/main/resources/application.yml`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Test: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [x] **Step 1: 사용처 재확인**

Run:

```bash
rg -n '@Entity|JpaRepository|EntityManager|jakarta\.persistence|javax\.persistence' server/src/main/kotlin server/src/test/kotlin
```

Expected: no output.

- [x] **Step 2: Gradle dependency 교체**

In `server/build.gradle.kts`:

```kotlin
// remove
kotlin("plugin.jpa") version "2.2.0"
implementation("org.springframework.boot:spring-boot-starter-data-jpa")

// add
implementation("org.springframework.boot:spring-boot-starter-jdbc")
```

- [x] **Step 3: JPA config 제거**

Remove this block from `server/src/main/resources/application.yml`:

```yaml
jpa:
  open-in-view: false
  hibernate:
    ddl-auto: validate
```

- [x] **Step 4: verification**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
./server/gradlew -p server clean test
```

Expected: tests pass and no missing `JdbcTemplate` bean failures occur.

## P1 Task 4: application 계층에서 Spring Security 제거

**Why:** `com.readmates.auth.application.AuthenticatedMemberResolver`가 `org.springframework.security.core.Authentication`에 직접 의존한다. 현재 architecture doc의 application boundary와 맞지 않고, ArchUnit이 이 의존을 막지 못한다.

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/*Test.kt`

- [x] **Step 1: failing ArchUnit rule 추가**

Add `org.springframework.security.` to the manual forbidden prefix check:

```kotlin
val forbiddenPrefixes = listOf(
    "org.springframework.http.",
    "org.springframework.web.",
    "org.springframework.security.",
)
```

Run:

```bash
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Expected: fails on `AuthenticatedMemberResolver -> org.springframework.security.core.Authentication`.

- [x] **Step 2: resolver API를 email/userId 기반으로 변경**

Keep the class in application if useful, but remove every Spring Security import. The class should expose domain/application inputs only:

```kotlin
fun resolveByEmail(email: String?, clubContext: ResolvedClubContext?): CurrentMember?
fun resolveByUserId(userId: String, clubContext: ResolvedClubContext?): CurrentMember?
fun resolveUserById(userId: String): CurrentUser?
fun resolveProfileByUserId(userId: String): CurrentMember?
```

The `email` null/blank handling stays in this service or in the caller, but no method accepts `Authentication`.

- [x] **Step 3: security filters extract email in infrastructure**

In `MemberAuthoritiesFilter`, keep this logic in infrastructure:

```kotlin
val authentication = SecurityContextHolder.getContext().authentication
val email = authentication.emailOrNull()
```

Then call:

```kotlin
authenticatedMemberResolver.resolveByEmail(email, requestedClubContext.context)
```

`SessionCookieAuthenticationFilter` already has `userId`; call `resolveByUserId` directly.

- [x] **Step 4: verification**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.*'
./server/gradlew -p server clean test
```

Expected: ArchUnit passes and auth/session filter behavior remains unchanged.

## P1 Task 5: JDBC persistence adapter fail-open 제거

**Why:** 운영에서 `JdbcTemplate`가 없으면 부팅 실패해야 한다. 현재 여러 persistence adapter가 `ObjectProvider<JdbcTemplate>.ifAvailable ?: return emptyList()/null`로 장애를 정상 빈 응답처럼 숨긴다.

**Scope:** Only remove `ObjectProvider<JdbcTemplate>` from persistence adapters. Keep `ObjectProvider` for optional non-DB dependencies such as `MeterRegistry`, OAuth client registration, and Redis metrics.

**Files, first batch:**

- Modify: `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcClubContextAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [x] **Step 1: inventory 작성**

Run:

```bash
rg -n 'ObjectProvider<JdbcTemplate>|jdbcTemplateProvider|ifAvailable \?: return' server/src/main/kotlin/com/readmates
```

Expected: list all DB adapters that still need conversion. Split work into 3-5 file batches.

- [x] **Step 2: first batch failing guard 추가**

Add an ArchUnit or focused source scan test that forbids `ObjectProvider<JdbcTemplate>` under `..adapter.out.persistence..`:

```kotlin
noClasses()
    .that()
    .resideInAnyPackage("..adapter.out.persistence..")
    .should()
    .dependOnClassesThat()
    .haveName("org.springframework.beans.factory.ObjectProvider")
```

If this is too broad because non-JDBC providers exist in persistence adapters, use a source-level test that scans Kotlin source for `ObjectProvider<JdbcTemplate>`.

- [x] **Step 3: direct injection conversion pattern**

Change:

```kotlin
class JdbcNotesFeedAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return emptyList<NoteFeedResult>().toCursorPage()
}
```

To:

```kotlin
class JdbcNotesFeedAdapter(
    private val jdbcTemplate: JdbcTemplate,
) {
    // use jdbcTemplate directly
}
```

Do not change SQL semantics in this task.

- [x] **Step 4: focused verification per batch**

Run at minimum:

```bash
./server/gradlew -p server test --tests com.readmates.note.api.*
./server/gradlew -p server test --tests com.readmates.archive.api.*
./server/gradlew -p server test --tests com.readmates.publication.api.*
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Finish with:

```bash
./server/gradlew -p server clean test
```

Expected: no endpoint silently changes from data to empty state.

## P1 Task 6: public/archive visibility 테스트 보강

**Why:** archive/publication은 member-only와 public exposure가 만나는 곳이다. 현재 test count 자체보다 중요한 것은 multi-club isolation과 `visibility` x `state` matrix의 명시적 회귀 테스트다.

**Files:**

- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
- Optional Modify: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`

- [x] **Step 1: publication visibility matrix 추가**

In `PublicControllerDbTest`, add tests for:

```text
PUBLISHED + PUBLIC => public API 200
PUBLISHED + MEMBER => public API 404 or not listed
CLOSED + PUBLIC => public API 404 or not listed
DRAFT/OPEN + PUBLIC => public API 404 or not listed
```

Use placeholder-safe fixture book/member data only.

- [x] **Step 2: archive multi-club isolation 추가**

In archive DB tests, prove:

```text
member from club A cannot see club B member archive session
host from club A cannot expose club B archive detail
same user with membership in two clubs gets data scoped by X-Readmates-Club-Slug
```

- [x] **Step 3: focused verification**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveAndNotesDbTest
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveControllerDbTest
./server/gradlew -p server test --tests com.readmates.publication.api.PublicControllerDbTest
./server/gradlew -p server clean test
```

For API/auth exposure changes, also run or report why skipped:

```bash
pnpm --dir front test:e2e
```

Status: focused server tests and full `./server/gradlew -p server clean test` passed. `pnpm --dir front test:e2e` was attempted after installing frontend dependencies with a frozen lockfile, but the configured Spring `bootRun` web server failed Flyway validation against the existing local `readmates_e2e` schema because migration checksums for versions 16, 18, 20, and 21 differ from the resolved local migrations.

## P1 Task 7: 운영 로그 최소 세트 추가

**Why:** metrics만으로는 어떤 요청/상태 전환이 장애를 만들었는지 추적하기 어렵다. 로그는 secrets, raw email, raw token, private body 없이 correlation-safe 식별자와 상태만 남긴다.

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`
- Modify: relevant session application service or adapter owning state transition, such as `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
- Test: notification service tests and BFF filter tests

- [x] **Step 1: log policy**

Use `LoggerFactory` and structured placeholders. Allowed values:

```text
eventId, deliveryId, sessionId, clubId, eventType, oldState, newState, attemptCount, status, client IP
```

Never log:

```text
raw token, BFF secret, OAuth code, email address, feedback document body, SMTP credential, invite token
```

- [x] **Step 2: BFF rejection warnings**

Add WARN logs for missing/mismatched BFF secret and forbidden mutating origin. Include request method, path, and client IP only.

- [x] **Step 3: notification relay/delivery logs**

Add INFO on publish success and WARN on publish/delivery failure/dead. Reuse sanitized error strings already used for storage.

- [x] **Step 4: session lifecycle logs**

Add INFO on `DRAFT -> OPEN`, `OPEN -> CLOSED`, `CLOSED -> PUBLISHED` transitions with session/club IDs only.

- [x] **Step 5: verification**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.BffSecretFilter*'
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.*'
./server/gradlew -p server test --tests 'com.readmates.session.application.service.*'
./server/gradlew -p server clean test
```

Verification recorded 2026-05-06:

- PASS `./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.BffSecretFilter*'`
- PASS `./server/gradlew -p server test --tests 'com.readmates.notification.application.service.*'`
- PASS `./server/gradlew -p server test --tests 'com.readmates.session.application.service.*'`
- PASS `./server/gradlew -p server clean test`
- PASS `git diff --check`
- BLOCKED `pnpm --dir front test:e2e`: Playwright webServer `bootRun` failed before browser tests because the existing local `readmates_e2e` schema has Flyway checksum mismatches for migrations 16, 18, 20, and 21. No destructive repair, drop, or reset was performed.

---

## P2 Task 8: Notes feed count query optimization

**Why:** `JdbcNotesFeedAdapter.loadNoteSessions` uses four correlated count subqueries. It is one DB round trip, not application N+1, but it can still create costly MySQL execution plans as page size and participation rows grow.

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`
- Modify: `server/src/main/resources/db/mysql/migration/` only if EXPLAIN proves a missing index

- [ ] **Step 1: baseline plan capture**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.performance.MySqlQueryPlanTest
```

Record whether existing indexes from `V22__note_count_query_indexes.sql` already keep the plan acceptable.

- [ ] **Step 2: rewrite counts as grouped derived tables**

Use one grouped subquery per source table, joined by `session_id`, preserving:

```text
same club only
sessions.state = 'PUBLISHED'
sessions.visibility in ('MEMBER', 'PUBLIC')
active participant filter for member-authored content
anonymous highlights included
```

- [ ] **Step 3: add query budget coverage for notes endpoint**

Add a budget test for `/api/notes/sessions` or the route that calls `loadNoteSessions`.

- [ ] **Step 4: verification**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.note.api.*
./server/gradlew -p server test --tests com.readmates.performance.MySqlQueryPlanTest
./server/gradlew -p server test --tests com.readmates.performance.ServerQueryBudgetTest
./server/gradlew -p server clean test
```

## P2 Task 9: Notification delivery engine 추출

**Why:** `NotificationDeliveryProcessingService`와 `NotificationDispatchService`가 required field, retry delay, stale lease, error storage 변환을 중복 구현한다.

**Files:**

- Create: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryEngine.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt`
- Modify tests under `server/src/test/kotlin/com/readmates/notification/application/service/`

- [x] **Step 1: characterization tests**

Before extracting, confirm tests cover:

```text
missing required delivery field throws
send success marks SENT and increments sent metric
send failure before max attempts marks FAILED and returns retryable result where Kafka path needs it
send failure at max attempts marks DEAD and increments dead metric
stale lease throws
configured retry delays are used
```

Confirmed with existing service tests and added `NotificationDeliveryEngineTest` before extraction.

- [x] **Step 2: engine API**

Create an engine with no scheduler/Kafka knowledge:

```kotlin
class NotificationDeliveryEngine(
    private val deliveryPort: NotificationDeliveryPort,
    private val mailDeliveryPort: MailDeliveryPort,
    private val metrics: ReadmatesOperationalMetrics,
    private val maxAttempts: Int,
    private val retryDelayMinutesConfig: List<Long>,
) {
    fun sendClaimed(item: ClaimedNotificationDeliveryItem): DeliveryEngineResult
}
```

Return a small sealed result so the Kafka dispatch path can rethrow retryable failures while the worker path can continue processing.

- [x] **Step 3: services delegate only orchestration**

`NotificationDeliveryProcessingService` keeps claim-loop behavior. `NotificationDispatchService` keeps `persistPlannedDeliveries` and per-event retry aggregation. Both delegate actual email send and status transitions to the engine.

- [x] **Step 4: verification**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.*'
./server/gradlew -p server test --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest
./server/gradlew -p server clean test
```

Result:

- PASS `./server/gradlew -p server test --tests 'com.readmates.notification.application.service.*'`
- PASS `./server/gradlew -p server test --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest`
- PASS `./server/gradlew -p server clean test`

## P2 Task 10: Kafka config 명시와 condition style 정리

**Why:** producer idempotence 위험은 현재 Kafka 기본값 때문에 낮다. 그래도 config drift를 막기 위해 중요한 producer/consumer 설정을 명시하고 test로 고정한다. `@ConditionalOnProperty`는 버그가 아니므로 이 task에서 큰 리팩터링을 하지 않는다.

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/out/kafka/KafkaNotificationEventPublisherAdapterTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/notification/adapter/in/kafka/NotificationEventKafkaListenerTest.kt`

- [x] **Step 1: config tests**

Assert producer map contains:

```text
enable.idempotence=true
acks=all
retries=2147483647
max.in.flight.requests.per.connection=5
```

Assert consumer map contains:

```text
enable.auto.commit=false
isolation.level=read_committed
auto.offset.reset=earliest
```

- [x] **Step 2: config implementation**

Add explicit config keys in `notificationProducerConfigs` and `notificationConsumerConfigs`.

- [x] **Step 3: optional condition style**

Only if reviewers want one annotation, replace pairs like:

```kotlin
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
```

with:

```kotlin
@ConditionalOnProperty(
    prefix = "readmates.notifications",
    name = ["enabled", "kafka.enabled"],
    havingValue = "true",
)
```

This is style-only, not a bug fix.

Decision: not changed for PR7; tests continue to cover the existing repeatable property conditions.

- [x] **Step 4: verification**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapterTest
./server/gradlew -p server test --tests com.readmates.notification.adapter.in.kafka.NotificationEventKafkaListenerTest
./server/gradlew -p server test --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest
```

Result:

- PASS `./server/gradlew -p server test --tests com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapterTest`
- PASS `./server/gradlew -p server test --tests com.readmates.notification.adapter.in.kafka.NotificationEventKafkaListenerTest`
- PASS `./server/gradlew -p server test --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest`

## P2 Task 11: auth API 공통 client 통일

**Why:** `front/features/auth/api/auth-api.ts`가 direct `fetch("/api/bff/...")`를 사용해 `cache: "no-store"`와 club context helper를 우회한다.

**Files:**

- Modify: `front/features/auth/api/auth-api.ts`
- Modify: `front/tests/unit/login-card.test.tsx`
- Modify: `front/tests/unit/invite-acceptance-card.test.tsx`
- Modify: `front/tests/unit/readmates-fetch.test.ts`

- [x] **Step 1: response-preserving wrapper로 교체**

Use `readmatesFetchResponse` where callers still need raw `Response`:

```ts
return readmatesFetchResponse("/api/dev/login", {
  method: "POST",
  body: JSON.stringify(body),
});
```

For invitation preview:

```ts
return readmatesFetchResponse(`/api/clubs/${encodeURIComponent(clubSlug)}/invitations/${encodeURIComponent(token)}`);
```

Use explicit context only if tests show current URL scope is ambiguous.

- [x] **Step 2: 401 redirect behavior 확인**

If an auth flow intentionally handles 401 without redirect, keep a small direct helper or add an option to `readmatesFetchResponse`. Do not silently change login/invite user flow.

- [x] **Step 3: verification**

Run:

```bash
pnpm --dir front test tests/unit/login-card.test.tsx tests/unit/invite-acceptance-card.test.tsx tests/unit/readmates-fetch.test.ts
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Verification 2026-05-06:

- RED: `pnpm --dir front test tests/unit/login-card.test.tsx tests/unit/invite-acceptance-card.test.tsx` failed while auth API still used direct `fetch` for dev login and invite preview.
- GREEN: the focused login/invite command passed after dev login moved to `readmatesFetchResponse`; invitation preview and logout use a raw-response shared-path wrapper so their intentional `401` in-flow handling is preserved.
- RED/GREEN follow-up: `pnpm --dir front test tests/unit/auth-context.test.tsx` first failed with logout `401` leaving auth `ACTIVE`, then passed after logout was kept on the raw-response helper.
- Final pass: `pnpm --dir front lint`, `pnpm --dir front test`, and `pnpm --dir front build`.
- E2E attempted: `pnpm --dir front test:e2e` was blocked by local `readmates_e2e` Flyway checksum mismatches for migrations 16, 18, 20, and 21. No repair/drop/reset was run.

## P2 Task 12: `clubSlug` validation helper 공유

**Why:** `front/vite.config.ts`와 `front/functions/api/bff/[[path]].ts`가 같은 regex를 복사한다. dev proxy와 production BFF가 갈라질 수 있다.

**Files:**

- Create: `front/shared/security/club-slug.ts`
- Modify: `front/vite.config.ts`
- Modify: `front/functions/api/bff/[[path]].ts`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Modify: `front/tests/unit/readmates-fetch.test.ts`

- [x] **Step 1: shared helper 생성**

```ts
export const CLUB_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function normalizedClubSlug(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return CLUB_SLUG_PATTERN.test(normalized) && !normalized.includes("--") ? normalized : "";
}
```

- [x] **Step 2: BFF와 Vite에서 import**

Both call sites should use the same helper and keep existing status behavior:

```text
missing clubSlug query => no trusted slug header
invalid clubSlug query => 400 in Pages Function
invalid clubSlug query => no trusted slug header in local Vite proxy
```

- [x] **Step 3: verification**

Run:

```bash
pnpm --dir front test tests/unit/cloudflare-bff.test.ts tests/unit/readmates-fetch.test.ts
pnpm --dir front lint
pnpm --dir front build
```

Verification 2026-05-06:

- RED: `pnpm --dir front test tests/unit/cloudflare-bff.test.ts tests/unit/readmates-fetch.test.ts` failed on missing shared helper import and Pages Function uppercase slug normalization.
- GREEN: the focused BFF/fetch command passed after Vite and Pages Function imported `front/shared/security/club-slug.ts`.
- Final pass: `pnpm --dir front lint`, `pnpm --dir front test`, and `pnpm --dir front build`.

## P2 Task 13: 대형 UI split 계획 실행

**Why:** large UI files slow review and increase accidental regression risk. Existing split plans already cover two of the original three files and one additional file.

**Existing plans to execute:**

- `docs/superpowers/plans/2026-05-05-readmates-host-dashboard-split-plan.md`
- `docs/superpowers/plans/2026-05-05-readmates-my-page-split-plan.md`
- `docs/superpowers/plans/2026-05-05-readmates-host-session-editor-split-plan.md`

**Missing plan to add:**

- Create: `docs/superpowers/plans/2026-05-05-readmates-host-members-split-plan.md`

- [x] **Step 1: do not duplicate existing plans**

Execute the existing plans as-is unless code has drifted. If drift exists, patch the plan first rather than improvising.

- [x] **Step 2: HostMembers split plan 작성**

Use these current sources:

```text
front/features/host/ui/host-members.tsx
front/features/host/route/host-members-route.tsx
front/tests/unit/host-members.test.tsx
```

Split likely sections:

```text
members-table
member-status-filter
member-profile-editor
member-approval-actions
member-mobile-card
```

- [x] **Step 3: verification per UI split**

Run the targeted suite after each extraction:

```bash
pnpm --dir front test tests/unit/host-members.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

2026-05-06 PR9 completion: executed the remaining split phases from the host dashboard, my-page, host session editor, and host members split plans. Targeted suites, full frontend lint/test/build, `git diff --check`, and the extracted-UI import-boundary scan passed. No visual/manual browser check was run for PR9.

## P2 Task 14: short-name fallback 정리

**Why:** `JdbcNotesFeedAdapter.shortNameFor` maps dev seed display names inside production persistence code. The current dev seed already writes `memberships.short_name`, so this adapter helper is redundant.

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
- Inspect: `server/src/main/kotlin/com/readmates/archive/application/ArchiveShortNames.kt`
- Inspect: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationSupport.kt`
- Modify tests for note/archive/session display if needed

- [ ] **Step 1: characterize display output**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.note.api.*
./server/gradlew -p server test --tests com.readmates.archive.api.*
./server/gradlew -p server test --tests com.readmates.session.api.*
```

- [ ] **Step 2: remove note adapter helper**

Change:

```kotlin
authorShortName = authorShortNameSource?.let(::shortNameFor)
```

To:

```kotlin
authorShortName = authorShortNameSource
```

Then delete the local `shortNameFor` function from the adapter.

- [ ] **Step 3: decide shared fallback separately**

If archive/session application helpers still handle legacy rows, keep them until a migration or test proves they are dead. Do not remove all helpers in the same PR unless coverage is explicit.

---

## P3 Task 15: Vite route lazy loading and bundle measurement

**Why:** route modules are statically imported. This may increase initial bundle size, but it should be measured before changing route loading behavior.

**Files:**

- Modify: `front/src/app/router.tsx`
- Modify: `front/src/app/host-route-elements.tsx`
- Modify: `front/vite.config.ts`
- Modify relevant route tests

- [ ] **Step 1: baseline bundle report**

Run:

```bash
pnpm --dir front build
find front/dist/assets -type f -name '*.js' -exec ls -lh {} \; | sort -k5 -h
```

- [ ] **Step 2: lazy-load high-cost routes**

Start with host/admin/archive heavy pages only. Wrap route elements in `Suspense` using existing `ReadmatesRouteLoading`.

- [ ] **Step 3: verification**

Run:

```bash
pnpm --dir front test tests/unit/spa-router.test.tsx tests/unit/route-continuity.test.ts
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

## P3 Task 16: `"use client"` 잔재 삭제

**Why:** This is a Vite app, not Next.js. The directives are no-op noise.

**Files:** files returned by:

```bash
rg -l '^"use client";' front/{features,shared,src}
```

- [ ] **Step 1: remove only first-line directives**

Use editor/apply_patch or a safe formatter-assisted mechanical edit. Do not remove string literals elsewhere.

- [ ] **Step 2: verification**

Run:

```bash
rg -n '^"use client";' front/{features,shared,src}
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: `rg` returns no output.

## P3 Task 17: Redpanda healthcheck

**Why:** local MySQL and Redis have healthchecks, but Kafka/Redpanda does not. This is DX only.

**Files:**

- Modify: `compose.yml`
- Modify: `docs/development/local-setup.md` if startup instructions change

- [ ] **Step 1: add healthcheck**

```yaml
kafka:
  healthcheck:
    test: ["CMD", "rpk", "cluster", "info"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 10s
```

- [ ] **Step 2: verify compose service health**

Run:

```bash
docker compose up -d kafka
docker compose ps kafka
```

Expected: service reaches healthy state.

---

## 보류/제외 항목

### Excluded: `@ConditionalOnProperty` bugfix

Do not implement the original `@ConditionalOnExpression` proposal as a bug fix. Local dependency inspection shows Spring Boot 4.0 `ConditionalOnProperty` is repeatable. Existing `NotificationEventKafkaListenerTest` also asserts both required properties are present.

If a style cleanup is desired, use a single `@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled", "kafka.enabled"], havingValue = "true")` and keep the current annotation test.

### Excluded: reset-password route removal

Do not remove `/reset-password/:token` by default. Current architecture documents it as a compatibility public route, the server returns `410 Gone`, and the UI copy clearly says password login/reset is retired.

### Excluded: CODEOWNERS workflow ownership

Do not create another CODEOWNERS change for the original finding. Current `.github/CODEOWNERS` already owns `.github/workflows/**`.

### Decision needed: Sentry or external error tracking

Do not add Sentry DSN/config in a drive-by PR. First decide:

```text
provider: Sentry, OpenTelemetry collector, Cloud provider logs, or none
PII policy: which request/user fields are allowed
sampling: traces/errors only or performance traces too
frontend: server-only first or browser SDK too
```

If approved, add placeholder-only config:

```yaml
sentry:
  dsn: ${READMATES_SENTRY_DSN:}
```

Never commit a real DSN or environment-specific project URL.

## Full Verification Matrix

Use the smallest relevant checks per PR, then the broader checks before merging a multi-surface batch.

Server:

```bash
./server/gradlew -p server clean test
```

Frontend:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Auth/BFF/API/user-flow:

```bash
pnpm --dir front test:e2e
```

Docs-only:

```bash
git diff --check -- <changed-docs>
```

Public release candidate, only when release/public-repo surface changes:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

## Done Criteria

- Every implemented item maps back to a row in the 판정표.
- Excluded items are not accidentally changed in the same PR.
- No new real member data, secrets, deployment state, private domains, OCIDs, local absolute paths, or token-shaped examples are added.
- Final PR notes name the touched surface and checks actually run.
- Skipped checks include a concrete reason and remaining risk.
