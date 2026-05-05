# ReadMates Improvement Analysis Detailed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `2026-05-05-readmates-improvement-analysis-review-plan.md`에서 필요하다고 판정한 개선 항목을 실제 PR 스택으로 구현한다.

**Architecture:** 구현은 배포/DB source-of-truth, 서버 boundary/운영성, 프런트 BFF/client 경계, UI split, 위생 작업으로 분리한다. 서버 코드는 `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence` 방향을 유지하고, 프런트 코드는 `src/app -> src/pages -> features -> shared` 의존 방향을 유지한다. 각 PR은 하나의 회귀 표면만 넓히며, auth/BFF/public visibility 변경은 E2E 또는 명시적 스킵 사유를 남긴다.

**Tech Stack:** Kotlin 2.2, Spring Boot 4.0, Spring Security, Spring Kafka 4, Kafka clients 4.1.1, MySQL/Flyway, Docker/GHCR, GitHub Actions, Vite 8, React 19, React Router 7, Cloudflare Pages Functions, Vitest/Playwright.

---

## 문서 관계

이 문서는 아래 문서의 실행판이다.

- Source analysis: `docs/superpowers/specs/2026-05-05-readmates-improvement-analysis.md`
- Reviewed priority plan: `docs/superpowers/plans/2026-05-05-readmates-improvement-analysis-review-plan.md`
- Architecture source of truth: `docs/development/architecture.md`
- Surface guides: `docs/agents/server.md`, `docs/agents/front.md`, `docs/agents/design.md`, `docs/agents/docs.md`

이 문서가 위 source-of-truth와 충돌하면 현재 코드, tests, `docs/development/architecture.md`를 먼저 따른다.

## PR 스택

| PR | Branch | Surface | 목표 | Verification |
| --- | --- | --- | --- | --- |
| 1 | `codex/readmates-flyway-source-truth` | server docs/config | unused Flyway path 제거 | `MySqlFlywayMigrationTest`, docs diff check |
| 2 | `codex/readmates-server-image-publish` | Docker/GitHub Actions/docs | server image reproducible build + GHCR publish | `docker build`, server tests, docs diff check |
| 3 | `codex/readmates-server-jdbc-boundary` | server dependency/arch | JPA 제거, application security 의존 제거 | ArchUnit, auth security tests, full server tests |
| 4 | `codex/readmates-jdbc-fail-fast` | server persistence | `ObjectProvider<JdbcTemplate>` fail-open 제거 | focused DB/API tests, full server tests |
| 5 | `codex/readmates-public-visibility-tests` | server tests | archive/publication visibility matrix 보강 | archive/publication tests, E2E if runnable |
| 6 | `codex/readmates-operational-logs` | server observability | 민감값 없는 운영 로그 최소 세트 | auth/notification/session tests |
| 7 | `codex/readmates-notification-kafka-cleanup` | server notification | delivery engine 추출, Kafka config 명시 | notification tests, Kafka integration |
| 8 | `codex/readmates-front-bff-client-cleanup` | front/functions | auth API client 통일, clubSlug helper 공유 | frontend focused tests, lint/test/build |
| 9 | `codex/readmates-host-ui-splits` | front UI | 대형 host/member UI split | targeted UI tests, lint/test/build, visual check |
| 10 | `codex/readmates-maintenance-hygiene` | front/compose docs | `"use client"` 제거, Redpanda healthcheck | frontend checks, compose healthcheck |

권장 순서: PR 1 -> PR 2 -> PR 3 -> PR 4 -> PR 5 -> PR 6 -> PR 7 -> PR 8 -> PR 9 -> PR 10.

## 공통 작업 규칙

- 각 PR 시작 전 `git status --short --untracked-files=all`로 unrelated worktree 변경을 확인한다.
- 관련 surface guide를 다시 읽고, PR 설명에 읽은 guide를 적는다.
- public-safe placeholder만 사용한다. 실제 member data, secrets, deployment host, OCID, token-like example, local absolute path를 새로 추가하지 않는다.
- `docs/superpowers/specs/2026-05-05-readmates-improvement-analysis.md`는 원문 기록이다. 판정/구현은 이 문서와 review plan을 기준으로 한다.
- 원문 제외 항목은 구현하지 않는다: `@ConditionalOnProperty` bugfix, reset-password route removal, CODEOWNERS 추가, Sentry drive-by integration.

---

## PR 1: Flyway migration source-of-truth

### Scope

삭제할 dead path:

```text
server/src/main/resources/db/migration/
```

유지할 운영 path:

```text
server/src/main/resources/db/mysql/migration/
server/src/main/resources/db/mysql/dev/
```

### Files

- Delete: `server/src/main/resources/db/migration/V1__auth_core.sql`
- Delete: `server/src/main/resources/db/migration/V2__session_core.sql`
- Delete: `server/src/main/resources/db/migration/V3__archive_and_publication.sql`
- Delete: `server/src/main/resources/db/migration/V4__allow_five_questions.sql`
- Delete: `server/src/main/resources/db/migration/V5__session_feedback_documents.sql`
- Delete: `server/src/main/resources/db/migration/V6__session_book_images_and_meeting_urls.sql`
- Delete: `server/src/main/resources/db/migration/V7__highlight_authors.sql`
- Delete: `server/src/main/resources/db/migration/V8__invite_only_membership_constraints.sql`
- Delete: `server/src/main/resources/db/migration/V9__reading_progress_one_line_session_visibility.sql`
- Delete: `server/src/main/resources/db/migration/V10__session_visibility.sql`
- Delete: `server/src/main/resources/db/migration/V11__db_query_optimization.sql`
- Delete: `server/src/main/resources/db/migration/V12__multi_club_platform.sql`
- Modify: `docs/development/local-setup.md`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/deploy/oci-backend.md`

### Steps

- [x] **Step 1: baseline 확인**

```bash
rg -n 'spring.flyway.locations|READMATES_FLYWAY_LOCATIONS|db/mysql/migration|db/migration' \
  server/src/main/resources server/src/test/kotlin docs/development docs/deploy
find server/src/main/resources/db/migration -type f -name '*.sql' | sort
find server/src/main/resources/db/mysql/migration -type f -name '*.sql' | sort
```

Expected:

```text
application.yml default location is classpath:db/mysql/migration
application-dev.yml adds classpath:db/mysql/dev
db/migration has only unused historical SQL files
```

- [x] **Step 2: dead path 삭제**

Use `git rm` for the dead files only:

```bash
git rm server/src/main/resources/db/migration/*.sql
```

If the empty directory remains locally, leave it untracked or remove it from the filesystem. Do not add a replacement placeholder file.

- [x] **Step 3: docs에 migration 위치 명시**

Add this paragraph to `docs/development/local-setup.md` near the `READMATES_FLYWAY_LOCATIONS` table row:

```markdown
운영 migration은 `server/src/main/resources/db/mysql/migration`에만 추가합니다. `server/src/main/resources/db/migration`은 사용하지 않으며, 새 파일을 그 위치에 만들면 운영 Flyway가 읽지 않습니다.
```

Add this paragraph to `docs/development/test-guide.md` near Flyway/E2E guidance:

```markdown
테스트에서 운영 migration 경로를 지정할 때도 `classpath:db/mysql/migration`을 사용합니다. `dev` profile 또는 E2E seed가 필요한 경우에만 `classpath:db/mysql/dev`를 뒤에 추가합니다.
```

Add this paragraph to `docs/deploy/oci-backend.md` near backend migration notes:

```markdown
서버 시작 중 Flyway가 적용하는 운영 migration 위치는 `classpath:db/mysql/migration`입니다. 배포 전 migration diff를 확인할 때는 `server/src/main/resources/db/mysql/migration`만 기준으로 봅니다.
```

- [x] **Step 4: verify**

```bash
./server/gradlew -p server test --tests com.readmates.support.MySqlFlywayMigrationTest
git diff --check -- docs/development/local-setup.md docs/development/test-guide.md docs/deploy/oci-backend.md
```

Expected: Flyway test passes and diff check has no output. Review the changed docs for public-safe placeholder use before committing.

- [x] **Step 5: commit**

```bash
git add server/src/main/resources/db/migration \
        docs/development/local-setup.md \
        docs/development/test-guide.md \
        docs/deploy/oci-backend.md
git commit -m "chore: remove unused Flyway migration path"
```

### Rollback

If a test unexpectedly depends on `db/migration`, stop and inspect the test property before restoring files. The runtime source of truth should remain `db/mysql/migration`.

---

## PR 2: Server image reproducibility and publish workflow

### Scope

Current `server/Dockerfile` copies `build/libs/readmates-server-0.0.1-SNAPSHOT.jar`, so the image depends on a host-side build. Convert it to build inside Docker using the `server` directory as context, then publish tag-named images to GHCR.

### Files

- Modify: `server/Dockerfile`
- Modify: `server/.dockerignore`
- Create: `.github/workflows/deploy-server.yml`
- Modify: `deploy/oci/05-deploy-compose-stack.sh`
- Modify: `docs/deploy/oci-backend.md`
- Modify: `docs/deploy/compose-stack.md`
- Modify: `docs/deploy/README.md`
- Modify: `docs/development/release-management.md`
- Modify: `docs/development/versioning.md`

### Steps

- [x] **Step 1: `.dockerignore`를 builder-friendly로 변경**

Replace `server/.dockerignore` with:

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

Keep `src`, `gradle`, `gradlew`, `gradlew.bat`, `settings.gradle.kts`, and `build.gradle.kts` available to the build context.

- [x] **Step 2: multi-stage Dockerfile 작성**

Replace `server/Dockerfile` with:

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

- [x] **Step 3: local build 확인**

```bash
docker build -t readmates-server:local server
docker run --rm readmates-server:local --version
```

Expected: the image builds. If `java -jar` does not support `--version`, the container may exit non-zero after printing Spring Boot usage or startup failure because env is missing; the build itself is the gate. Do not add runtime secrets to test this image.

- [x] **Step 4: GHCR workflow 추가**

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

- [x] **Step 5: docs에 배포 artifact 규칙 추가**

In `docs/deploy/oci-backend.md`, document:

```markdown
서버 이미지는 release tag와 같은 tag로 GHCR에 게시합니다. 운영 compose는 `ghcr.io/<owner>/<repo>/readmates-server:<git-tag>` 형태의 이미지를 pull해야 하며, 임의의 로컬 빌드 산출물을 운영 서버에서 다시 빌드하지 않습니다.
```

In `docs/development/release-management.md`, add release checklist item:

```markdown
서버 변경이 포함된 release tag는 `Deploy Server Image` workflow가 같은 tag의 GHCR 이미지를 게시했는지 확인합니다.
```

Review fix: update `deploy/oci/05-deploy-compose-stack.sh` and live deploy docs so release deploys pull `ghcr.io/<owner>/<repo>/readmates-server:<git-tag>` on the VM instead of rebuilding a local image under the GHCR tag. Keep local non-GHCR image tags as a build-and-transfer path for transition checks.

- [x] **Step 6: verify**

```bash
docker build -t readmates-server:local server
./server/gradlew -p server clean test
bash -n deploy/oci/05-deploy-compose-stack.sh
git diff --check -- server/Dockerfile server/.dockerignore .github/workflows/deploy-server.yml deploy/oci/05-deploy-compose-stack.sh docs/deploy/oci-backend.md docs/deploy/compose-stack.md docs/deploy/README.md docs/development/release-management.md docs/development/versioning.md
```

- [x] **Step 7: commit**

```bash
git add server/Dockerfile server/.dockerignore .github/workflows/deploy-server.yml \
        deploy/oci/05-deploy-compose-stack.sh \
        docs/deploy/oci-backend.md docs/deploy/compose-stack.md docs/deploy/README.md \
        docs/development/release-management.md docs/development/versioning.md
git commit -m "ci: publish reproducible server images"
```

### Rollback

Revert the workflow and Dockerfile together. Do not leave a workflow that points to a Dockerfile requiring a host-side jar.

---

## PR 3: Server dependency and application boundary cleanup

### Scope

Remove unused JPA dependencies and block Spring Security from application packages. This PR should not alter API behavior.

### Files

- Modify: `server/build.gradle.kts`
- Modify: `server/src/main/resources/application.yml`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

### Steps

- [x] **Step 1: JPA 사용처가 없는지 확인**

```bash
rg -n '@Entity|JpaRepository|EntityManager|jakarta\.persistence|javax\.persistence' \
  server/src/main/kotlin server/src/test/kotlin
```

Expected: no output.

- [x] **Step 2: Gradle dependency 변경**

In `server/build.gradle.kts`, remove:

```kotlin
kotlin("plugin.jpa") version "2.2.0"
implementation("org.springframework.boot:spring-boot-starter-data-jpa")
```

Add under dependencies:

```kotlin
implementation("org.springframework.boot:spring-boot-starter-jdbc")
```

- [x] **Step 3: JPA config 제거**

Remove from `server/src/main/resources/application.yml`:

```yaml
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
```

- [x] **Step 4: ArchUnit failure 만들기**

In `ServerArchitectureBoundaryTest`, change the forbidden prefixes:

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

Expected: the test fails because `AuthenticatedMemberResolver` imports `Authentication`.

- [x] **Step 5: `AuthenticatedMemberResolver`에서 Security type 제거**

Change the resolver to accept application-level inputs:

```kotlin
@Component
class AuthenticatedMemberResolver(
    private val memberAccountStore: MemberAccountStorePort,
    private val memberProfileStore: MemberProfileStorePort,
) {
    fun resolveByEmail(email: String?, clubContext: ResolvedClubContext?): CurrentMember? {
        val normalizedEmail = email?.takeIf { it.isNotBlank() } ?: return null
        return if (clubContext != null) {
            memberAccountStore.findMemberByEmailAndClubId(normalizedEmail, clubContext.clubId)
        } else {
            memberAccountStore.findActiveMemberByEmail(normalizedEmail)
        }
    }

    fun resolveByUserId(userId: String, clubContext: ResolvedClubContext?): CurrentMember? =
        if (clubContext != null) {
            runCatching { UUID.fromString(userId) }
                .getOrNull()
                ?.let { memberAccountStore.findMemberByUserIdAndClubId(it, clubContext.clubId) }
        } else {
            memberAccountStore.findActiveMemberByUserId(userId)
        }

    fun resolveUserById(userId: String): CurrentUser? =
        runCatching { UUID.fromString(userId) }
            .getOrNull()
            ?.let(memberAccountStore::findUserById)

    fun resolveProfileByUserId(userId: String): CurrentMember? =
        runCatching { UUID.fromString(userId) }
            .getOrNull()
            ?.let(memberProfileStore::findProfileMemberByUserId)
            ?.toCurrentMember()
}
```

Keep the existing `MemberProfileRow.toCurrentMember()` helper.

- [x] **Step 6: infrastructure filters extract email**

In `MemberAuthoritiesFilter`, replace:

```kotlin
authenticatedMemberResolver.resolve(authentication, requestedClubContext.context)
```

with:

```kotlin
authenticatedMemberResolver.resolveByEmail(email, requestedClubContext.context)
```

In `SessionCookieAuthenticationFilter`, keep the existing `resolveByUserId`, `resolveProfileByUserId`, and `resolveUserById` calls. Only update names if the resolver method names changed.

- [x] **Step 7: verify**

```bash
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.*'
./server/gradlew -p server test --tests com.readmates.auth.api.AuthMeControllerTest
./server/gradlew -p server clean test
```

- [x] **Step 8: commit**

```bash
git add server/build.gradle.kts server/src/main/resources/application.yml \
        server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt \
        server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt \
        server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt \
        server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "refactor: keep application layer free of security framework types"
```

---

## PR 4: JDBC fail-fast conversion

### Scope

Convert DB persistence adapters from optional `ObjectProvider<JdbcTemplate>` to direct `JdbcTemplate` injection. Do this in small batches so API behavior regressions are visible.

### Batch order

1. Read-heavy public/member adapters:
   - `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
   - `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/JdbcArchiveQueryAdapter.kt`
   - `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
   - `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcClubContextAdapter.kt`
2. Auth/profile/membership adapters:
   - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcAuthSessionAdapter.kt`
   - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
   - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberProfileStoreAdapter.kt`
   - `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcHostInvitationStoreAdapter.kt`
3. Session/notification adapters:
   - files returned by `rg -l 'ObjectProvider<JdbcTemplate>' server/src/main/kotlin/com/readmates/session server/src/main/kotlin/com/readmates/notification`

### Steps

- [x] **Step 1: inventory**

```bash
rg -n 'ObjectProvider<JdbcTemplate>|jdbcTemplateProvider|ifAvailable \?: return' server/src/main/kotlin/com/readmates
```

Save the output in the PR description, not in repository docs.

- [x] **Step 2: add guard test**

Add this test to `ServerArchitectureBoundaryTest`:

```kotlin
@Test
fun `persistence adapters do not use optional JdbcTemplate providers`() {
    val sourceRoot = java.nio.file.Path.of("server/src/main/kotlin")
    val violations = java.nio.file.Files.walk(sourceRoot).use { paths ->
        paths
            .filter { path -> path.toString().endsWith(".kt") }
            .filter { path -> path.toString().contains("/adapter/out/persistence/") }
            .filter { path -> java.nio.file.Files.readString(path).contains("ObjectProvider<JdbcTemplate>") }
            .map { path -> sourceRoot.relativize(path).toString() }
            .sorted()
            .toList()
    }

    assertTrue(
        violations.isEmpty(),
        "Persistence adapters must inject JdbcTemplate directly:\n${violations.joinToString("\n")}",
    )
}
```

Run:

```bash
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Expected: fails and lists persistence adapters still using optional providers.

- [x] **Step 3: convert one file at a time**

Pattern:

```kotlin
// before
class JdbcNotesFeedAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : LoadNotesFeedPort {
    override fun loadNoteSessions(...): CursorPage<NoteSessionResult> {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: return emptyList<NoteSessionResult>().toCursorPage()
        return jdbcTemplate.query(...)
    }
}
```

```kotlin
// after
class JdbcNotesFeedAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadNotesFeedPort {
    override fun loadNoteSessions(...): CursorPage<NoteSessionResult> {
        return jdbcTemplate.query(...)
    }
}
```

Remove unused imports:

```kotlin
import org.springframework.beans.factory.ObjectProvider
```

- [x] **Step 4: remove helper only when unused**

If `SessionPersistenceSupport.kt` becomes unused after session adapters are converted, delete it in the same batch and run session tests. Do not delete it before all call sites are converted.

- [x] **Step 5: verify per batch**

Batch 1:

```bash
./server/gradlew -p server test --tests 'com.readmates.note.api.*'
./server/gradlew -p server test --tests 'com.readmates.archive.api.*'
./server/gradlew -p server test --tests 'com.readmates.publication.api.*'
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Batch 2:

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.api.*'
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.*'
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Batch 3:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.*'
./server/gradlew -p server test --tests 'com.readmates.notification.*'
./server/gradlew -p server test --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Final:

```bash
./server/gradlew -p server clean test
```

### Commit strategy

Commit each batch separately:

```bash
git commit -m "refactor: require JdbcTemplate for read adapters"
git commit -m "refactor: require JdbcTemplate for auth persistence"
git commit -m "refactor: require JdbcTemplate for session and notification persistence"
```

---

## PR 5: Public/archive visibility regression tests

### Scope

Add explicit tests for public exposure and multi-club isolation. This PR should not change production code unless a test exposes a real bug.

### Files

- Modify: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`

### Tests to add

- [x] **Step 1: public publication matrix**

Add tests with fixture sessions for:

```text
PUBLISHED + PUBLIC is returned by /api/public/clubs/{slug}/sessions/{id}
PUBLISHED + MEMBER returns 404 on public detail and is absent from public record list
CLOSED + PUBLIC returns 404 on public detail and is absent from public record list
DRAFT + PUBLIC returns 404 on public detail and is absent from public record list
OPEN + PUBLIC returns 404 on public detail and is absent from public record list
```

Use UUIDs in the existing test fixture style. Use placeholder book titles like `공개 범위 테스트 책`.

- [x] **Step 2: archive club isolation**

Add tests proving:

```text
member5@example.com with X-Readmates-Club-Slug=reading-sai cannot fetch sample-book-club archive records
same authenticated user gets different archive list when X-Readmates-Club-Slug changes and membership exists
public records from one club do not appear in another club member archive response
```

Use existing dev seed clubs if available. Do not add real club/member data.

- [x] **Step 3: verify**

```bash
./server/gradlew -p server test --tests com.readmates.publication.api.PublicControllerDbTest
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveAndNotesDbTest
./server/gradlew -p server test --tests com.readmates.archive.api.ArchiveControllerDbTest
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

If E2E cannot run because local MySQL cannot create the E2E schema, record that exact reason in the final response and PR notes.

Status: focused server tests and full `./server/gradlew -p server clean test` passed. `pnpm --dir front test:e2e` was attempted after installing frontend dependencies with a frozen lockfile, but the configured Spring `bootRun` web server failed Flyway validation against the existing local `readmates_e2e` schema because migration checksums for versions 16, 18, 20, and 21 differ from the resolved local migrations.

---

## PR 6: Operational logs

### Scope

Add privacy-safe logs around BFF rejection, notification publish/delivery, and session lifecycle transitions.

### Files

- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationRelayService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`

### Log policy

Allowed log fields:

```text
request method, request path, client IP, clubId, sessionId, eventId, deliveryId, eventType, status, attemptCount
```

Forbidden log fields:

```text
raw email, raw invite token, raw session token, OAuth code, BFF secret, SMTP credential, feedback document body
```

### Steps

- [x] **Step 1: BFF rejection logs**

In `BffSecretFilter`, add:

```kotlin
import org.slf4j.LoggerFactory
```

Add companion logger:

```kotlin
private companion object {
    private val operationalLogger = LoggerFactory.getLogger(BffSecretFilter::class.java)
    const val BFF_SECRET_HEADER = "X-Readmates-Bff-Secret"
    val MUTATING_METHODS = setOf("POST", "PUT", "PATCH", "DELETE")
}
```

Log before returning:

```kotlin
logger.warn(
    "BFF secret rejected method={} path={} clientIp={}",
    request.method,
    request.requestURI,
    request.remoteAddr,
)
```

For forbidden origin:

```kotlin
logger.warn(
    "BFF mutating origin rejected method={} path={} clientIp={}",
    request.method,
    request.requestURI,
    request.remoteAddr,
)
```

- [x] **Step 2: notification relay logs**

In `NotificationRelayService`, log:

```kotlin
logger.info("Notification event published eventId={} topic={} key={}", item.id, item.kafkaTopic, item.kafkaKey)
logger.warn("Notification event publish failed eventId={} attemptCount={} error={}", item.id, item.attemptCount + 1, error)
logger.warn("Notification event publish dead eventId={} attemptCount={} error={}", item.id, item.attemptCount + 1, error)
```

Do not log payload body.

- [x] **Step 3: notification delivery logs**

For send success:

```kotlin
logger.info("Notification email delivery sent deliveryId={} eventType={}", claimed.id, claimed.eventType)
```

For retry/dead:

```kotlin
logger.warn("Notification email delivery failed deliveryId={} eventType={} attemptCount={} error={}", claimed.id, claimed.eventType, claimed.attemptCount + 1, error)
logger.warn("Notification email delivery dead deliveryId={} eventType={} attemptCount={} error={}", claimed.id, claimed.eventType, claimed.attemptCount + 1, error)
```

- [x] **Step 4: session lifecycle logs**

In the service method that performs open/close/publish, log after a successful state update:

```kotlin
logger.info("Session state changed clubId={} sessionId={} oldState={} newState={}", clubId, sessionId, "DRAFT", "OPEN")
logger.info("Session state changed clubId={} sessionId={} oldState={} newState={}", clubId, sessionId, "OPEN", "CLOSED")
logger.info("Session state changed clubId={} sessionId={} oldState={} newState={}", clubId, sessionId, "CLOSED", "PUBLISHED")
```

Use actual local variable names from `HostSessionCommandService.kt`.

- [x] **Step 5: verify**

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

## PR 7: Notification and Kafka cleanup

### Scope

Extract shared email delivery state transition logic, then make Kafka config explicit. Do not change event schema or topics.

### Files

- Create: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryEngine.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDispatchService.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/kafka/NotificationKafkaConfiguration.kt`
- Modify: notification service/config tests

### Steps

- [ ] **Step 1: engine result type**

Create:

```kotlin
sealed interface DeliveryEngineResult {
    data object Sent : DeliveryEngineResult
    data object Dead : DeliveryEngineResult
    data class RetryableFailure(val message: String) : DeliveryEngineResult
}
```

- [ ] **Step 2: engine service**

Create `NotificationDeliveryEngine` with:

```kotlin
class NotificationDeliveryEngine(
    private val deliveryPort: NotificationDeliveryPort,
    private val mailDeliveryPort: MailDeliveryPort,
    private val metrics: ReadmatesOperationalMetrics,
    private val maxAttempts: Int,
    private val retryDelayMinutesConfig: List<Long>,
) {
    fun sendClaimed(item: ClaimedNotificationDeliveryItem): DeliveryEngineResult {
        val command = MailDeliveryCommand(
            to = requiredDeliveryField(item.id, "recipientEmail", item.recipientEmail),
            subject = requiredDeliveryField(item.id, "subject", item.subject),
            text = requiredDeliveryField(item.id, "bodyText", item.bodyText),
            html = item.bodyHtml?.takeIf { it.isNotBlank() },
        )

        try {
            mailDeliveryPort.send(command)
        } catch (exception: Exception) {
            return markFailure(item, exception)
        }

        if (!deliveryPort.markDeliverySent(item.id, item.lockedAt)) {
            throw staleDeliveryLeaseException(item.id, NotificationDeliveryStatus.SENT)
        }
        metrics.sent(item.eventType)
        return DeliveryEngineResult.Sent
    }
}
```

Move existing private helpers into the engine and keep their behavior unchanged.

- [ ] **Step 3: worker delegates**

`NotificationDeliveryProcessingService.processClaimed` becomes:

```kotlin
fun processClaimed(item: ClaimedNotificationDeliveryItem) {
    deliveryEngine.sendClaimed(item)
}
```

If the engine returns `RetryableFailure`, worker processing still continues to the next claimed item.

- [ ] **Step 4: Kafka dispatch delegates and rethrows retryable**

`NotificationDispatchService.dispatchEmail` should convert engine result:

```kotlin
return when (val result = deliveryEngine.sendClaimed(claimed)) {
    DeliveryEngineResult.Sent,
    DeliveryEngineResult.Dead,
    -> null
    is DeliveryEngineResult.RetryableFailure -> NotificationDeliveryRetryableException(result.message)
}
```

- [ ] **Step 5: Kafka config explicit keys**

In producer configs add:

```kotlin
ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG to true,
ProducerConfig.ACKS_CONFIG to "all",
ProducerConfig.RETRIES_CONFIG to Int.MAX_VALUE,
ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION to 5,
```

In consumer configs add:

```kotlin
ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG to false,
ConsumerConfig.ISOLATION_LEVEL_CONFIG to "read_committed",
```

- [ ] **Step 6: verify**

```bash
./server/gradlew -p server test --tests 'com.readmates.notification.application.service.*'
./server/gradlew -p server test --tests com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapterTest
./server/gradlew -p server test --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest
./server/gradlew -p server clean test
```

---

## PR 8: Frontend BFF/client cleanup

### Scope

Unify auth API calls through `readmatesFetchResponse` where behavior matches, and share `clubSlug` normalization between Vite dev proxy and Cloudflare Pages Function.

### Files

- Create: `front/shared/security/club-slug.ts`
- Modify: `front/vite.config.ts`
- Modify: `front/functions/api/bff/[[path]].ts`
- Modify: `front/features/auth/api/auth-api.ts`
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Modify: `front/tests/unit/readmates-fetch.test.ts`
- Modify: `front/tests/unit/login-card.test.tsx`
- Modify: `front/tests/unit/invite-acceptance-card.test.tsx`

### Steps

- [ ] **Step 1: shared slug helper**

Create:

```ts
export const CLUB_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function normalizedClubSlug(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return CLUB_SLUG_PATTERN.test(normalized) && !normalized.includes("--") ? normalized : "";
}
```

- [ ] **Step 2: Vite proxy uses helper**

In `front/vite.config.ts`, remove local regex and call:

```ts
import { normalizedClubSlug } from "./shared/security/club-slug";

function normalizedClubSlugFromProxyPath(proxyPath: string | undefined) {
  if (!proxyPath) {
    return "";
  }
  return normalizedClubSlug(new URL(proxyPath, "http://readmates.local").searchParams.get("clubSlug"));
}
```

- [ ] **Step 3: Pages Function uses helper**

In `front/functions/api/bff/[[path]].ts`, remove local regex and call the shared helper:

```ts
import { normalizedClubSlug } from "../../../shared/security/club-slug";
```

The relative import must be verified from `front/functions/api/bff/[[path]].ts` to `front/shared/security/club-slug.ts`.

- [ ] **Step 4: auth API direct fetch replacement**

In `front/features/auth/api/auth-api.ts`:

```ts
import { readmatesFetchResponse } from "@/shared/api/client";
```

Change dev login:

```ts
return readmatesFetchResponse("/api/dev/login", {
  method: "POST",
  body: JSON.stringify(body),
});
```

Change logout:

```ts
return readmatesFetchResponse("/api/auth/logout", { method: "POST" });
```

For invitation preview, keep raw `Response` behavior:

```ts
if (clubSlug) {
  return readmatesFetchResponse(
    `/api/clubs/${encodeURIComponent(clubSlug)}/invitations/${encodeURIComponent(token)}`,
    undefined,
    { clubSlug },
  );
}

return readmatesFetchResponse(`/api/invitations/${encodeURIComponent(token)}`);
```

- [ ] **Step 5: verify**

```bash
pnpm --dir front test tests/unit/cloudflare-bff.test.ts tests/unit/readmates-fetch.test.ts
pnpm --dir front test tests/unit/login-card.test.tsx tests/unit/invite-acceptance-card.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

For BFF behavior changes, run or report why skipped:

```bash
pnpm --dir front test:e2e
```

---

## PR 9: Host UI split execution

### Scope

Execute existing split plans and add the missing `host-members` split plan before editing host members UI.

### Existing plans

- `docs/superpowers/plans/2026-05-05-readmates-host-dashboard-split-plan.md`
- `docs/superpowers/plans/2026-05-05-readmates-my-page-split-plan.md`
- `docs/superpowers/plans/2026-05-05-readmates-host-session-editor-split-plan.md`

### Missing plan file

- Create: `docs/superpowers/plans/2026-05-05-readmates-host-members-split-plan.md`

### HostMembers split target

Source:

```text
front/features/host/ui/host-members.tsx
front/features/host/route/host-members-route.tsx
front/tests/unit/host-members.test.tsx
```

Candidate modules:

```text
front/features/host/ui/members/member-status-filter.tsx
front/features/host/ui/members/member-profile-editor.tsx
front/features/host/ui/members/member-approval-actions.tsx
front/features/host/ui/members/member-desktop-table.tsx
front/features/host/ui/members/member-mobile-card.tsx
```

### Steps

- [ ] **Step 1: characterization baseline**

```bash
pnpm --dir front test tests/unit/host-members.test.tsx
pnpm --dir front test tests/unit/host-dashboard.test.tsx tests/unit/host-dashboard-model.test.ts
pnpm --dir front test tests/unit/my-page.test.tsx
pnpm --dir front test tests/unit/host-session-editor.test.tsx tests/unit/host-session-editor-model.test.ts
```

- [ ] **Step 2: extract leaf components first**

For each file, extract components that:

```text
receive props/callbacks only
do not import feature API modules
do not import route modules
do not call fetch or shared/api
do not read React Router state directly
```

- [ ] **Step 3: preserve route state injection**

Keep return-state and scoped link construction in route/app boundary modules or pass the already-derived values into UI props.

- [ ] **Step 4: verify after each extraction**

```bash
pnpm --dir front test tests/unit/host-members.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

- [ ] **Step 5: visual/manual check**

Start the frontend if needed:

```bash
pnpm --dir front dev
```

Inspect desktop and mobile host member/dashboard screens. Confirm no text overlap, disabled controls remain clear, and privacy-sensitive notification/email values remain masked.

---

## PR 10: Maintenance hygiene

### Scope

Remove Vite-noop `"use client"` directives and add Redpanda healthcheck.

### Files

- Modify files returned by `rg -l '^"use client";' front/{features,shared,src}`
- Modify: `compose.yml`
- Modify: `docs/development/local-setup.md` if Kafka startup wording changes

### Steps

- [ ] **Step 1: remove only first-line directives**

Use a mechanical edit that removes exactly:

```text
"use client";
```

when it is the first line. Do not remove other string literals.

- [ ] **Step 2: Redpanda healthcheck**

In `compose.yml` under `kafka`, add:

```yaml
    healthcheck:
      test: ["CMD", "rpk", "cluster", "info"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
```

- [ ] **Step 3: verify**

```bash
rg -n '^"use client";' front/{features,shared,src}
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
docker compose up -d kafka
docker compose ps kafka
git diff --check -- compose.yml docs/development/local-setup.md
```

Expected: the `rg` command returns no output and Kafka reaches healthy state.

---

## 보류 항목 처리 규칙

### Sentry/external error tracking

Do not implement in this stack. Create a separate decision document first with:

```text
server-only or browser+server scope
PII redaction policy
sample rate
owner for DSN/secret provisioning
incident workflow
```

### `@ConditionalOnProperty`

Do not replace with `@ConditionalOnExpression` as a bug fix. Spring Boot 4.0 marks `ConditionalOnProperty` repeatable.

### reset-password route

Do not delete. It is a documented compatibility route and server endpoints return `410 Gone`.

### CODEOWNERS

Do not change unless workflow ownership changes. `.github/workflows/**` already has an owner.

## Final verification before merging the stack

Run after the last PR in a local integration branch:

```bash
./server/gradlew -p server clean test
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
git diff --check
```

If public release files or scanner docs changed, also run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

## Completion checklist

- [ ] P0 PRs are merged before P1/P2 behavior changes.
- [ ] Every merged PR names the changed surface and checks actually run.
- [ ] Every skipped E2E or Docker/Compose check has an exact blocker and residual risk.
- [ ] Public-safe constraints are preserved in docs, workflows, logs, and examples.
- [ ] No excluded item was changed as a drive-by cleanup.
