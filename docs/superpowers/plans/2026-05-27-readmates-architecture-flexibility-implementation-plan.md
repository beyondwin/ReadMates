# ReadMates Architecture Flexibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen ReadMates' clean architecture, route-first frontend boundaries, and vertical-slice working rules without changing product behavior.

**Architecture:** Start with boundary tests because the value of this work is enforcement, then fix the concrete pilot violations that those tests reveal. Keep the app in one Spring Boot module and one Vite frontend, but classify server slices and frontend feature layers explicitly so future features fail fast when they cross boundaries.

**Tech Stack:** Kotlin/Spring Boot, ArchUnit, React/Vite, React Router 7, TanStack Query v5, Vitest, Markdown docs.

---

## Source Spec

- `docs/superpowers/specs/2026-05-27-readmates-architecture-flexibility-design.md`

## File Structure

Server boundary work:

- Modify `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`
  - Owns server slice registry and ArchUnit/source-scan rules.
- Create `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationActor.kt`
  - Application-safe caller identity value object that replaces `CurrentMember` in aigen application ports/services.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationUseCases.kt`
  - Replace `CurrentMember` in `CommitGenerationUseCase`.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/port/in/ClubAiDefaultsUseCases.kt`
  - Replace `CurrentMember` in AI defaults ports.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`
  - Use `AiGenerationActor` instead of `CurrentMember`.
- Modify `server/src/main/kotlin/com/readmates/aigen/application/service/ClubAiDefaultsService.kt`
  - Use `AiGenerationActor` instead of `CurrentMember`.
- Create `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationAuthorizationUseCases.kt`
  - Input port for session-level aigen authorization.
- Create `server/src/main/kotlin/com/readmates/aigen/application/port/out/LoadAiGenerationSessionMetaPort.kt`
  - Outbound port for loading `SessionMeta`.
- Create `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationAuthorizationService.kt`
  - Application service that checks host access using `AiGenerationActor`.
- Create `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationSessionMetaAdapter.kt`
  - JDBC implementation of `LoadAiGenerationSessionMetaPort`.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationAuthorizationPolicy.kt`
  - Keep only the web-facing policy interface and a small adapter from `CurrentMember` to `AiGenerationActor`.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationController.kt`
  - Pass `AiGenerationActor` to application ports.
- Modify `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/ClubAiDefaultsController.kt`
  - Pass `AiGenerationActor` to application ports.

Frontend boundary work:

- Modify `front/tests/unit/frontend-boundaries.test.ts`
  - Add `queries` layer rules and generalize boundary helpers.
- Modify `front/features/platform-admin/ui/admin-health-grid.tsx`
  - Convert from query-owning component to props/callback presentation.
- Modify `front/features/platform-admin/route/admin-health-route.tsx`
  - Own `useQuery`, stale timer, refresh callback, and data-to-UI assembly.
- Modify `front/features/platform-admin/ui/admin-health-grid.test.tsx`
  - Test props-driven rendering and refresh callback instead of API fetch.

Documentation work:

- Modify `docs/development/architecture.md`
  - Add slice classification and frontend `queries` layer rules.
- Modify `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
  - Update follow-up status around slice registry and aigen workflow-side rules.
- Modify `docs/development/adr/0003-frontend-route-first-architecture.md`
  - Update route-first architecture with `queries` and shared promotion criteria.
- Modify `docs/agents/front.md`
  - Add `queries` layer and vertical-slice checklist references.
- Modify `docs/agents/server.md`
  - Add server slice types and aigen workflow-side guidance.
- Modify `docs/agents/docs.md`
  - Add architecture-flexibility doc update guidance.
- Create `docs/development/vertical-slice-checklist.md`
  - One-page checklist for feature changes crossing frontend/server/BFF/tests.

## Task 1: Add Server Slice Registry Boundary Tests

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: Replace hard-coded migrated package arrays with a slice registry**

In `ServerArchitectureBoundaryTest`, replace the two array properties with this registry and derived arrays:

```kotlin
    private enum class ServerSliceType {
        WRITE,
        READ,
        OPS_READ,
        WORKFLOW,
        SHARED,
    }

    private data class ServerSlice(
        val name: String,
        val type: ServerSliceType,
        val webAdapterPackages: List<String> = emptyList(),
        val applicationPackages: List<String> = emptyList(),
    )

    private val serverSlices =
        listOf(
            ServerSlice(
                name = "session",
                type = ServerSliceType.WRITE,
                webAdapterPackages = listOf("com.readmates.session.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.session.application.."),
            ),
            ServerSlice(
                name = "note",
                type = ServerSliceType.READ,
                webAdapterPackages = listOf("com.readmates.note.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.note.application.."),
            ),
            ServerSlice(
                name = "publication",
                type = ServerSliceType.READ,
                webAdapterPackages = listOf("com.readmates.publication.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.publication.application.."),
            ),
            ServerSlice(
                name = "archive",
                type = ServerSliceType.READ,
                webAdapterPackages = listOf("com.readmates.archive.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.archive.application.."),
            ),
            ServerSlice(
                name = "feedback",
                type = ServerSliceType.WORKFLOW,
                webAdapterPackages = listOf("com.readmates.feedback.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.feedback.application.."),
            ),
            ServerSlice(
                name = "auth",
                type = ServerSliceType.WRITE,
                webAdapterPackages = listOf("com.readmates.auth.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.auth.application.."),
            ),
            ServerSlice(
                name = "notification",
                type = ServerSliceType.WRITE,
                webAdapterPackages = listOf("com.readmates.notification.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.notification.application.."),
            ),
            ServerSlice(
                name = "club",
                type = ServerSliceType.WRITE,
                webAdapterPackages = listOf("com.readmates.club.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.club.application.."),
            ),
            ServerSlice(
                name = "admin.audit",
                type = ServerSliceType.READ,
                webAdapterPackages = listOf("com.readmates.admin.audit.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.admin.audit.application.."),
            ),
            ServerSlice(
                name = "admin.health",
                type = ServerSliceType.OPS_READ,
                webAdapterPackages = listOf("com.readmates.admin.health.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.admin.health.application.."),
            ),
            ServerSlice(
                name = "aigen",
                type = ServerSliceType.WORKFLOW,
                webAdapterPackages = listOf("com.readmates.aigen.adapter.in.web.."),
                applicationPackages = listOf("com.readmates.aigen.application.."),
            ),
            ServerSlice(
                name = "shared",
                type = ServerSliceType.SHARED,
                webAdapterPackages = listOf("com.readmates.shared.adapter.in.web.."),
            ),
        )

    private val migratedWebAdapterPackages =
        serverSlices.flatMap(ServerSlice::webAdapterPackages).toTypedArray()

    private val migratedApplicationPackages =
        serverSlices.flatMap(ServerSlice::applicationPackages).toTypedArray()
```

- [ ] **Step 2: Add a registry coverage test**

Add this test after the registry:

```kotlin
    @Test
    fun `server architecture registry includes recent admin and aigen slices`() {
        val registered = serverSlices.map(ServerSlice::name).toSet()

        assertTrue(
            registered.containsAll(setOf("admin.audit", "admin.health", "aigen")),
            "Server slice registry must include admin.audit, admin.health, and aigen.",
        )
    }
```

- [ ] **Step 3: Add a source rule that keeps aigen application free of CurrentMember**

Add this test near the existing `application packages do not depend on spring web http or security types` rule:

```kotlin
    @Test
    fun `aigen application does not depend on web current member`() {
        val violations =
            sourceRoot()
                .resolve("com/readmates/aigen/application")
                .takeIf(Files::exists)
                ?.let { root ->
                    Files
                        .walk(root)
                        .use { paths ->
                            paths
                                .filter { it.name.endsWith(".kt") }
                                .flatMap { sourceFile ->
                                    sourceFile
                                        .readLines()
                                        .mapIndexedNotNull { index, line ->
                                            if ("CurrentMember" in line) {
                                                "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: ${line.trim()}"
                                            } else {
                                                null
                                            }
                                        }.stream()
                                }.toList()
                        }
                } ?: emptyList()

        assertTrue(
            violations.isEmpty(),
            "Aigen application code must use application-safe actor values instead of CurrentMember:\n" +
                violations.joinToString("\n"),
        )
    }
```

- [ ] **Step 4: Run the focused architecture test and confirm the intended failure**

Run:

```bash
./server/gradlew -p server architectureTest --tests com.readmates.architecture.ServerArchitectureBoundaryTest
```

Expected: FAIL. The failure should include `DefaultAiGenerationAuthorizationPolicy` depending on `JdbcTemplate` from `adapter.in.web`, and aigen application files referencing `CurrentMember`.

- [ ] **Step 5: Commit the failing test only if using a red/green branch workflow**

If the execution session is committing every red/green checkpoint, use:

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "test: register server architecture slices"
```

If the execution session keeps red tests unstaged until green, leave the file unstaged and continue to Task 2.

## Task 2: Move Aigen Authorization and Actor Identity Behind Application Boundaries

**Files:**
- Create: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationActor.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationAuthorizationUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/LoadAiGenerationSessionMetaPort.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationAuthorizationService.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationSessionMetaAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationAuthorizationPolicy.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/ClubAiDefaultsController.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/ClubAiDefaultsUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitService.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/ClubAiDefaultsService.kt`

- [ ] **Step 1: Create the application-safe actor model**

Create `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationActor.kt`:

```kotlin
package com.readmates.aigen.application.model

import java.util.UUID

data class AiGenerationActor(
    val userId: UUID,
    val clubId: UUID,
    val clubSlug: String,
    val isHost: Boolean,
)
```

- [ ] **Step 2: Add the authorization input port**

Create `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationAuthorizationUseCases.kt`:

```kotlin
package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.SessionMeta
import java.util.UUID

interface AuthorizeAiGenerationSessionUseCase {
    fun authorize(
        sessionId: UUID,
        actor: AiGenerationActor,
    ): SessionMeta
}
```

- [ ] **Step 3: Add the outbound session metadata port**

Create `server/src/main/kotlin/com/readmates/aigen/application/port/out/LoadAiGenerationSessionMetaPort.kt`:

```kotlin
package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.SessionMeta
import java.util.UUID

interface LoadAiGenerationSessionMetaPort {
    fun load(sessionId: UUID): SessionMeta?
}
```

- [ ] **Step 4: Add the application authorization service**

Create `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationAuthorizationService.kt`:

```kotlin
package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.port.`in`.AuthorizeAiGenerationSessionUseCase
import com.readmates.aigen.application.port.out.LoadAiGenerationSessionMetaPort
import com.readmates.shared.security.AccessDeniedException
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.util.UUID

@Service
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class AiGenerationAuthorizationService(
    private val sessionMetaPort: LoadAiGenerationSessionMetaPort,
) : AuthorizeAiGenerationSessionUseCase {
    override fun authorize(
        sessionId: UUID,
        actor: AiGenerationActor,
    ): SessionMeta {
        val meta = sessionMetaPort.load(sessionId)
            ?: throw AccessDeniedException("Session $sessionId not found")
        if (meta.clubId != actor.clubId || !actor.isHost) {
            throw AccessDeniedException("Host access to session $sessionId is required")
        }
        return meta
    }
}
```

- [ ] **Step 5: Move JDBC session metadata loading to an outbound adapter**

Create `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationSessionMetaAdapter.kt`:

```kotlin
package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.port.out.LoadAiGenerationSessionMetaPort
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.util.UUID

@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class JdbcAiGenerationSessionMetaAdapter(
    private val jdbc: JdbcTemplate,
) : LoadAiGenerationSessionMetaPort {
    override fun load(sessionId: UUID): SessionMeta? {
        val row =
            jdbc
                .queryForList(
                    """
                    select s.club_id, s.number, s.book_title, s.book_author, s.session_date
                    from sessions s
                    where s.id = ?
                    """.trimIndent(),
                    sessionId.toString(),
                ).firstOrNull()
                ?: return null

        val expectedAuthorNames =
            jdbc.queryForList(
                """
                select u.name
                from session_participants sp
                join memberships m on m.id = sp.membership_id
                join users u on u.id = m.user_id
                where sp.session_id = ?
                  and sp.participation_status = 'ACTIVE'
                order by sp.id
                """.trimIndent(),
                String::class.java,
                sessionId.toString(),
            )

        return SessionMeta(
            sessionId = sessionId,
            clubId = UUID.fromString(row["club_id"] as String),
            sessionNumber = (row["number"] as Number).toInt(),
            bookTitle = row["book_title"] as String,
            bookAuthor = row["book_author"] as String?,
            meetingDate = (row["session_date"] as java.sql.Date).toLocalDate() ?: LocalDate.now(),
            expectedAuthorNames = expectedAuthorNames,
            authorNameMode = AuthorNameMode.REAL,
        )
    }
}
```

- [ ] **Step 6: Keep the web policy as a thin adapter**

Replace `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationAuthorizationPolicy.kt` with:

```kotlin
package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.port.`in`.AuthorizeAiGenerationSessionUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.UUID

interface AiGenerationAuthorizationPolicy {
    fun requireHostAccess(
        sessionId: UUID,
        member: CurrentMember,
    ): SessionMeta

    fun actor(member: CurrentMember): AiGenerationActor =
        AiGenerationActor(
            userId = member.userId,
            clubId = member.clubId,
            clubSlug = member.clubSlug,
            isHost = member.isHost,
        )
}

@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class DefaultAiGenerationAuthorizationPolicy(
    private val authorizeSession: AuthorizeAiGenerationSessionUseCase,
) : AiGenerationAuthorizationPolicy {
    override fun requireHostAccess(
        sessionId: UUID,
        member: CurrentMember,
    ): SessionMeta = authorizeSession.authorize(sessionId, actor(member))
}
```

- [ ] **Step 7: Replace aigen application ports that accept CurrentMember**

In `AiGenerationUseCases.kt`, replace the `CurrentMember` import with `AiGenerationActor`, and change `CommitGenerationUseCase`:

```kotlin
interface CommitGenerationUseCase {
    fun commit(
        host: AiGenerationActor,
        sessionId: UUID,
        jobId: UUID,
        recordVisibility: SessionRecordVisibility,
        overrideResult: SessionImportV1Snapshot?,
    ): SessionImportCommitResult
}
```

In `ClubAiDefaultsUseCases.kt`, replace the `CurrentMember` import with `AiGenerationActor`, and change both ports:

```kotlin
interface GetClubAiDefaultsUseCase {
    fun get(
        clubSlug: String,
        actor: AiGenerationActor,
    ): ClubAiDefaultsView
}

interface UpdateClubAiDefaultsUseCase {
    fun update(
        clubSlug: String,
        defaultModel: String,
        actor: AiGenerationActor,
    )
}
```

- [ ] **Step 8: Update aigen services to use AiGenerationActor**

In `AiGenerationCommitService`, replace the `CurrentMember` import with `AiGenerationActor`, and change the method signature:

```kotlin
    override fun commit(
        host: AiGenerationActor,
        sessionId: UUID,
        jobId: UUID,
        recordVisibility: SessionRecordVisibility,
        overrideResult: SessionImportV1Snapshot?,
    ): SessionImportCommitResult {
```

Keep existing `host.userId`, `host.clubId`, and `host.clubSlug` property reads. The actor model intentionally exposes the same application-safe fields used by the service.

In `ClubAiDefaultsService`, replace `CurrentMember` with `AiGenerationActor`:

```kotlin
    override fun get(
        clubSlug: String,
        actor: AiGenerationActor,
    ): ClubAiDefaultsView {
        requireHostOfClub(clubSlug, actor)
        val row = clubDefaultPort.load(actor.clubId)
        return ClubAiDefaultsView(defaultModel = row?.defaultModel)
    }

    override fun update(
        clubSlug: String,
        defaultModel: String,
        actor: AiGenerationActor,
    ) {
        requireHostOfClub(clubSlug, actor)
        val resolved =
            resolveAllowlistedModel(defaultModel)
                ?: throw AiGenerationException.Coded(
                    ErrorCode.AI_DISABLED,
                    "model '$defaultModel' is not allowlisted",
                )
        clubDefaultPort.upsert(
            clubId = actor.clubId,
            defaultModel = resolved.name,
            updatedBy = actor.userId,
        )
    }

    private fun requireHostOfClub(
        clubSlug: String,
        actor: AiGenerationActor,
    ) {
        if (actor.clubSlug != clubSlug || !actor.isHost) {
            throw AccessDeniedException("Host of '$clubSlug' required")
        }
    }
```

- [ ] **Step 9: Update web controllers to pass actors into application use cases**

In `AiGenerationController.commit`, replace:

```kotlin
        auth.requireHostAccess(sessionId, member)
        return commitUc.commit(
            host = member,
```

with:

```kotlin
        auth.requireHostAccess(sessionId, member)
        return commitUc.commit(
            host = auth.actor(member),
```

In `ClubAiDefaultsController`, map `CurrentMember` before calling the use cases:

```kotlin
        val actor = auth.actor(member)
        return getDefaults.get(clubSlug, actor)
```

and:

```kotlin
        val actor = auth.actor(member)
        updateDefaults.update(clubSlug, request.defaultModel, actor)
```

If `ClubAiDefaultsController` does not currently inject `AiGenerationAuthorizationPolicy`, add it as a constructor dependency and keep the existing request/response mapping unchanged.

- [ ] **Step 10: Run focused server tests**

Run:

```bash
./server/gradlew -p server architectureTest --tests com.readmates.architecture.ServerArchitectureBoundaryTest
./server/gradlew -p server unitTest --tests "*AiGeneration*"
```

Expected: both commands PASS.

- [ ] **Step 11: Commit server boundary changes**

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt \
  server/src/main/kotlin/com/readmates/aigen
git commit -m "refactor: enforce server architecture slices"
```

## Task 3: Make Platform Admin Health UI Props-Driven

**Files:**
- Modify: `front/features/platform-admin/ui/admin-health-grid.tsx`
- Modify: `front/features/platform-admin/route/admin-health-route.tsx`
- Modify: `front/features/platform-admin/ui/admin-health-grid.test.tsx`

- [ ] **Step 1: Convert AdminHealthGrid to a presentation component**

Replace the top of `admin-health-grid.tsx` so it exports props instead of calling `useQuery`:

```tsx
import { AdminHealthCard } from "@/features/platform-admin/ui/admin-health-card";
import { AdminHealthDeployStrip } from "@/features/platform-admin/ui/admin-health-deploy-strip";
import type { PlatformHealthSnapshot } from "@/features/platform-admin/model/platform-admin-health-model";

export type AdminHealthGridProps = {
  snapshot: PlatformHealthSnapshot | null;
  loading: boolean;
  error: boolean;
  fetching: boolean;
  stale: boolean;
  onRefresh: () => void;
};

export function AdminHealthGrid({
  snapshot,
  loading,
  error,
  fetching,
  stale,
  onRefresh,
}: AdminHealthGridProps) {
  if (loading) return <p className="admin-health-grid__loading">로딩 중...</p>;
  if (error || !snapshot) {
    return <p className="admin-health-grid__error">스냅샷을 불러오지 못했습니다.</p>;
  }
  const stripCard = snapshot.cards.find((c) => c.id === "deploy_attempts_strip");
  const rest = snapshot.cards.filter((c) => c.id !== "deploy_attempts_strip");
```

Inside the JSX, replace `query.data` with `snapshot`, `query.isFetching` with `fetching`, `isStale` with `stale`, and `query.refetch()` with `onRefresh()`:

```tsx
            {snapshot.schema} · 생성 {formatTimestamp(snapshot.generatedAt)}
```

```tsx
              stale ? "admin-health-grid__stale admin-health-grid__stale--warn" : "admin-health-grid__stale"
```

```tsx
            {fetching ? "갱신 중" : stale ? "30초 이상 경과" : "최신"}
```

```tsx
            disabled={fetching}
            onClick={onRefresh}
```

- [ ] **Step 2: Move query ownership to the route component**

Replace `front/features/platform-admin/route/admin-health-route.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { AdminHealthGrid } from "@/features/platform-admin/ui/admin-health-grid";

const STALE_AFTER_MS = 30_000;

export function AdminHealthRoute() {
  const query = useQuery(platformAdminHealthSnapshotQuery());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const stale = query.dataUpdatedAt > 0 && now - query.dataUpdatedAt > STALE_AFTER_MS;

  return (
    <section className="admin-health" aria-labelledby="admin-health-title">
      <header className="admin-health__header">
        <h1 id="admin-health-title" className="h1 editorial">Platform Health</h1>
        <p className="admin-health__lede">서비스·큐·AI 가용성·outbox·배포 신호를 한 화면에서 봅니다.</p>
      </header>
      <AdminHealthGrid
        snapshot={query.data ?? null}
        loading={query.isLoading}
        error={query.isError}
        fetching={query.isFetching}
        stale={stale}
        onRefresh={() => void query.refetch()}
      />
    </section>
  );
}
```

- [ ] **Step 3: Update AdminHealthGrid tests to pass props**

In `admin-health-grid.test.tsx`, remove `QueryClient`, `QueryClientProvider`, `readmatesFetchMock`, and the `vi.mock("@/shared/api/client", ...)` block. Replace `renderGrid()` with:

```tsx
function renderGrid(
  props: Partial<React.ComponentProps<typeof AdminHealthGrid>> = {},
) {
  const defaultProps: React.ComponentProps<typeof AdminHealthGrid> = {
    snapshot: HEALTH_SNAPSHOT,
    loading: false,
    error: false,
    fetching: false,
    stale: false,
    onRefresh: vi.fn(),
  };
  render(
    <MemoryRouter>
      <AdminHealthGrid {...defaultProps} {...props} />
    </MemoryRouter>,
  );
  return { onRefresh: defaultProps.onRefresh };
}
```

Update the refresh test:

```tsx
  it("calls the refresh callback", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    renderGrid({ onRefresh });

    await user.click(screen.getByRole("button", { name: "새로고침" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
```

Update the stale test:

```tsx
  it("marks the snapshot stale when the route says it is stale", () => {
    renderGrid({ stale: true });

    expect(screen.getByText("30초 이상 경과")).toBeInTheDocument();
  });
```

- [ ] **Step 4: Run focused frontend tests**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-health-grid.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the platform-admin pilot refactor**

```bash
git add front/features/platform-admin/ui/admin-health-grid.tsx \
  front/features/platform-admin/route/admin-health-route.tsx \
  front/features/platform-admin/ui/admin-health-grid.test.tsx
git commit -m "refactor: keep admin health ui presentation-only"
```

## Task 4: Expand Frontend Boundary Tests for Queries Layer

**Files:**
- Modify: `front/tests/unit/frontend-boundaries.test.ts`

- [ ] **Step 1: Add the `feature-queries` rule id**

Extend `BoundaryRuleId`:

```ts
type BoundaryRuleId =
  | "shared-boundary"
  | "feature-to-feature"
  | "feature-model"
  | "feature-queries"
  | "feature-route"
  | "feature-ui"
  | "readmates-api-compat"
  | "feature-components-public";
```

- [ ] **Step 2: Add query layer helper functions**

Add these helpers near the existing feature layer helpers:

```ts
function isFeatureQueriesFile(relativePath: string) {
  return /^features\/[^/]+\/queries\//.test(relativePath);
}

function isFeatureQueriesBoundaryImport(sourceFile: SourceFile, projectPath: string | null) {
  if (!isFeatureQueriesFile(sourceFile.relativePath) || projectPath === null) {
    return false;
  }

  return (
    isFeatureLayerImport(projectPath, "ui") ||
    isFeatureLayerImport(projectPath, "route") ||
    projectPath.startsWith("src/pages/") ||
    projectPath.startsWith("src/app/")
  );
}
```

- [ ] **Step 3: Forbid model imports from queries**

In `isFeatureModelBoundaryImport`, add:

```ts
    isFeatureLayerImport(importSpecifier.projectPath, "queries") ||
```

The final return block should include `api`, `queries`, `route`, `ui`, `src/pages`, and `src/app`.

- [ ] **Step 4: Forbid UI imports from queries**

In `isFeatureUiBoundaryImport`, add:

```ts
    isFeatureLayerImport(projectPath, "queries") ||
```

The final return block should include `shared/api`, `api`, `queries`, `route`, `src/pages`, and `src/app`.

- [ ] **Step 5: Add query boundary violation checks**

In the main import loop, after the model rule and before the UI rule, add:

```ts
        if (isFeatureQueriesBoundaryImport(sourceFile, importSpecifier.projectPath)) {
          addImportViolation(
            violations,
            consumedLegacyExceptions,
            sourceFile,
            importSpecifier,
            "feature-queries",
            "feature query files must not import UI, route, app, or page modules.",
          );
        }
```

- [ ] **Step 6: Add helper unit coverage**

Add this test before the main boundary test:

```ts
  it("rejects query imports from UI and route modules", () => {
    const sourceFile: SourceFile = {
      absolutePath: "/unused/features/platform-admin/queries/platform-admin-health-queries.ts",
      displayPath: "front/features/platform-admin/queries/platform-admin-health-queries.ts",
      relativePath: "features/platform-admin/queries/platform-admin-health-queries.ts",
    };

    const uiImport = normalizeImportSpecifier(sourceFile, "@/features/platform-admin/ui/admin-health-grid");
    const routeImport = normalizeImportSpecifier(sourceFile, "@/features/platform-admin/route/admin-health-route");
    const apiImport = normalizeImportSpecifier(sourceFile, "@/features/platform-admin/api/platform-admin-health-api");

    expect(isFeatureQueriesBoundaryImport(sourceFile, uiImport.projectPath)).toBe(true);
    expect(isFeatureQueriesBoundaryImport(sourceFile, routeImport.projectPath)).toBe(true);
    expect(isFeatureQueriesBoundaryImport(sourceFile, apiImport.projectPath)).toBe(false);
  });
```

- [ ] **Step 7: Run the focused frontend boundary test**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit frontend boundary changes**

```bash
git add front/tests/unit/frontend-boundaries.test.ts
git commit -m "test: enforce frontend query boundaries"
```

## Task 5: Update Architecture Docs and Agent Guides

**Files:**
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- Modify: `docs/development/adr/0003-frontend-route-first-architecture.md`
- Modify: `docs/agents/front.md`
- Modify: `docs/agents/server.md`
- Modify: `docs/agents/docs.md`
- Create: `docs/development/vertical-slice-checklist.md`

- [ ] **Step 1: Update frontend architecture layer text**

In `docs/development/architecture.md`, replace the four feature bullets under "Feature는 가능한 범위에서..." with:

```markdown
Feature는 가능한 범위에서 `api`, `queries`, `model`, `route`, `ui`로 나눕니다.

- `features/<name>/api`는 해당 feature의 BFF endpoint 호출과 request/response contract만 담당합니다.
- `features/<name>/queries`는 TanStack Query key, `queryOptions`, mutation hook, invalidation policy를 담당합니다. UI와 route module을 import하지 않습니다.
- `features/<name>/model`은 React, React Router, TanStack Query, API client를 import하지 않는 순수 화면 모델 계산만 둡니다.
- `features/<name>/route`는 loader/action, route error/loading state, query seeding, API/model 호출, UI props 조립을 담당합니다.
- `features/<name>/ui`는 props와 callback으로만 렌더링하며 `fetch`, `shared/api`, feature API, feature queries, route module을 직접 import하지 않습니다.
```

- [ ] **Step 2: Update server slice classification in architecture docs**

In `docs/development/architecture.md`, update "CQRS Read vs Write Package Split" so it includes:

```markdown
### Ops Read-side
- `admin.health` — 운영 상태 snapshot과 deploy ledger를 provider/adapter에서 읽어 aggregate card model로 반환합니다.
- Mutation surface가 아니며, application service는 provider 결과를 card-local failure로 격리합니다.

### Mixed / Workflow-side
- `feedback` — 문서 업로드 mutation + 조회를 함께 보유합니다.
- `sessionimport` — preview read path와 commit write path를 함께 보유합니다.
- `aigen` — 외부 LLM provider, Redis job handoff, Kafka worker, commit/recovery orchestration을 포함합니다. Application layer는 provider SDK, Redis, JDBC, Kafka detail이 아니라 outbound port에 의존합니다.
```

- [ ] **Step 3: Update ADR-0002 follow-up section**

In `docs/development/adr/0002-server-clean-architecture-with-archunit.md`, add this bullet to the "결과" or "후속 작업" area:

```markdown
- 2026-05-27 architecture flexibility update: `ServerArchitectureBoundaryTest`는 slice registry를 통해 `admin.audit`, `admin.health`, `aigen`까지 최근 확장 surface를 명시적으로 등록한다. `aigen`은 workflow-side slice로 분류하고, `CurrentMember` 같은 web/session carrier는 application-safe actor value로 변환해 전달한다.
```

- [ ] **Step 4: Update ADR-0003 with queries layer**

In `docs/development/adr/0003-frontend-route-first-architecture.md`, update the frontend structure block so it includes:

```markdown
  queries/                  — TanStack Query key, queryOptions, mutation hook, invalidation policy
```

Add this rule to the dependency direction list:

```markdown
- `features/<name>/queries/`는 API contract와 shared query primitive를 사용할 수 있지만 UI, route, app, page module을 import하지 않는다.
```

- [ ] **Step 5: Update agent guides**

In `docs/agents/front.md`, change the feature bullets to include:

```markdown
- `features/<name>/queries`: TanStack Query keys, `queryOptions`, mutation hooks, and invalidation policy; do not import UI, route, app, or page modules.
```

In `docs/agents/server.md`, add after the CQRS paragraph:

```markdown
Recent architecture work classifies server slices as write-side, read-side, ops read-side, or workflow-side. `admin.audit` is read-side, `admin.health` is ops read-side, and `aigen` is workflow-side. Workflow-side slices may orchestrate transactions and side effects, but provider SDKs, Redis, JDBC, Kafka, and mail details stay behind outbound ports/adapters.
```

In `docs/agents/docs.md`, add to documentation rules:

```markdown
- Architecture flexibility changes should keep `docs/development/architecture.md`, ADR-0002, ADR-0003, `docs/agents/front.md`, and `docs/agents/server.md` aligned with the boundary tests that enforce the rule.
```

- [ ] **Step 6: Add the vertical slice checklist**

Create `docs/development/vertical-slice-checklist.md`:

```markdown
# Vertical Slice Checklist

Use this checklist when a change crosses frontend, BFF, server API, auth, persistence, or public-safety boundaries.

## 1. Surface

- Product surface is one of public, member, host, platform admin, auth, BFF, or operations.
- The owning feature folder is named before code changes start.
- The change does not introduce real member data, secrets, private domains, deployment state, local paths, OCIDs, or token-shaped examples.

## 2. Server

- Controller parses HTTP input and maps responses only.
- Application service owns authorization, lifecycle rules, orchestration, and application errors.
- Persistence, Redis, Kafka, mail, provider SDK, and HTTP client details are behind outbound ports/adapters.
- Read-side services use `@ReadOnlyApplicationService` and do not depend on mutation ports.
- Workflow-side services keep side effects behind ports and document retry or recovery behavior in tests.

## 3. BFF / Auth

- Browser traffic uses same-origin `/api/bff/**` when the frontend calls Spring API.
- Internal `x-readmates-*` response headers and secrets are stripped.
- Club context is derived from trusted BFF input, not browser-supplied internal headers.
- Route return values and redirects use safe relative paths unless an allowlisted absolute return flow is explicitly documented.

## 4. Frontend

- `api` owns BFF calls and response contracts.
- `queries` owns query keys, `queryOptions`, mutation hooks, and invalidation.
- `model` owns pure view-model calculation and imports no React, router, query, or API client.
- `route` owns loader/action behavior, auth/redirect, URL state, query seeding, and UI prop assembly.
- `ui` renders from props/callbacks and imports no API, query, route, or `shared/api` client.

## 5. Tests

- Server boundary change: run `./server/gradlew -p server architectureTest`.
- Server behavior change: run the focused unit or integration test for the slice.
- Frontend boundary change: run `pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts`.
- Frontend behavior change: run the focused Vitest file and the smallest relevant route/component test.
- API, auth, BFF, or user-flow change: run `pnpm --dir front test:e2e`.
- Public release change: run `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate`.
```

- [ ] **Step 7: Run docs checks**

Run:

```bash
git diff --check -- docs/development/architecture.md \
  docs/development/adr/0002-server-clean-architecture-with-archunit.md \
  docs/development/adr/0003-frontend-route-first-architecture.md \
  docs/agents/front.md \
  docs/agents/server.md \
  docs/agents/docs.md \
  docs/development/vertical-slice-checklist.md
rg -n "(/[U]sers/|ocid1\\.|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]+)" \
  docs/development/architecture.md \
  docs/development/adr/0002-server-clean-architecture-with-archunit.md \
  docs/development/adr/0003-frontend-route-first-architecture.md \
  docs/agents/front.md \
  docs/agents/server.md \
  docs/agents/docs.md \
  docs/development/vertical-slice-checklist.md
```

Expected: `git diff --check` exits 0. The `rg` command exits 1 with no matches.

- [ ] **Step 8: Commit docs and guide updates**

```bash
git add docs/development/architecture.md \
  docs/development/adr/0002-server-clean-architecture-with-archunit.md \
  docs/development/adr/0003-frontend-route-first-architecture.md \
  docs/agents/front.md \
  docs/agents/server.md \
  docs/agents/docs.md \
  docs/development/vertical-slice-checklist.md
git commit -m "docs: document architecture slice boundaries"
```

## Task 6: Final Verification

**Files:**
- No new files.
- Verify all changed files from Tasks 1-5.

- [ ] **Step 1: Run server architecture and focused aigen tests**

```bash
./server/gradlew -p server architectureTest
./server/gradlew -p server unitTest --tests "*AiGeneration*" --tests "*ClubAiDefaults*"
```

Expected: PASS.

- [ ] **Step 2: Run frontend boundary and focused platform-admin tests**

```bash
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
pnpm --dir front exec vitest run features/platform-admin/ui/admin-health-grid.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run broad local checks for touched surfaces**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server check
```

Expected: PASS.

- [ ] **Step 4: Run docs whitespace and public-safety checks**

```bash
git diff --check
rg -n "(/[U]sers/|ocid1\\.|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]+)" \
  docs/development docs/agents docs/superpowers/specs/2026-05-27-readmates-architecture-flexibility-design.md
```

Expected: `git diff --check` exits 0. The `rg` command exits 1 with no matches.

- [ ] **Step 5: Inspect final diff**

```bash
git status --short
git diff --stat HEAD
```

Expected: working tree contains only intentional changes from this plan. No generated build output, private local state, or unrelated files appear.

- [ ] **Step 6: Commit final verification adjustments if needed**

If Step 5 shows uncommitted intentional fixes, commit them:

```bash
git add server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt \
  server/src/main/kotlin/com/readmates/aigen \
  front/tests/unit/frontend-boundaries.test.ts \
  front/features/platform-admin \
  docs/development \
  docs/agents
git commit -m "chore: finish architecture boundary hardening"
```

Expected: final `git status --short` is clean.

## Spec Coverage Self-Review

- Goals and non-goals: covered by Task 5 docs and Task 6 verification.
- Server clean architecture hardening: covered by Tasks 1 and 2.
- `admin.audit`, `admin.health`, `aigen` registry coverage: covered by Task 1.
- Aigen workflow-side pilot: covered by Task 2.
- Frontend `queries` layer and UI boundary: covered by Tasks 3 and 4.
- Vertical slice standard: covered by Task 5.
- Verification strategy: covered by Task 6.
- Public repo safety: covered by Task 5 and Task 6 scans.
