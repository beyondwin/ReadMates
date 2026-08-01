# ReadMates Guest Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone browse a public ReadMates club without an account while keeping feedback, personal state, writes, host operations, cross-club data, and connection details fail-closed.

**Architecture:** Add canonical `access_scope` and `site_visibility` fields while retaining one-release compatibility writes for the existing visibility columns. Serve anonymous readers through a new hexagonal `browse` slice whose SQL and DTOs select only approved fields, then let the club-scoped React app choose a `GUEST | VIEWER | MEMBER | HOST` audience and reuse read-oriented UI without calling member APIs for guests. A signed, club-scoped OAuth join intent is the only path that may create a target-club `VIEWER` membership.

**Tech Stack:** React 19, TypeScript 6, Vite 8, TanStack Query 5, React Router 7, Zod 4, Vitest 4, Testing Library, Playwright 1.61, Cloudflare Pages Functions, Kotlin 2.4, Spring Boot 4, Spring Security, JDBC, MySQL 8, Flyway, JUnit 5, MockMvc, Testcontainers.

## Global Constraints

- Anonymous product copy is exactly `게스트`; anonymous entry is `둘러보기`; OAuth conversion is `멤버로 시작`.
- `GUEST` has no user row, membership row, authentication role, anonymous session cookie, or `ROLE_VIEWER` authority.
- The public marketing site remains `PUBLISHED + PUBLIC_RECORD`; `DRAFT`, `OPEN`, and `CLOSED` never appear there.
- Guest app reads require an `ACTIVE + PUBLIC` club and `sessions.access_scope = GUEST_READABLE`.
- Guest JSON may include session resource IDs, book/session metadata, display names, avatar keys, RSVP, attendance, questions, `draftThought`, and `PUBLIC` reviews.
- Guest JSON must exclude person IDs, `membershipId`, `accountName`, email, exact `locationLabel`, meeting URL/passcode, all `my*` fields, and all feedback metadata/body.
- Existing `PRIVATE` and `SESSION` review rows stay excluded; operationally existing external posts are already `PUBLIC`, so do not bulk-rewrite content visibility.
- Feedback remains locked for `GUEST` and `VIEWER`; active `MEMBER`/`HOST` must still satisfy existing participation and document rules.
- Guest browse responses use `Cache-Control: no-store` and never vary by Cookie or Authorization.
- Guest list defaults are 20 items and must reject limits above 50; guest read rate limit is 120 requests per minute per trusted client-IP hash and club slug.
- `/clubs/:slug/app/**` is `noindex`; `noindex` is not an authorization mechanism.
- Preserve exact route-to-club isolation and return 404 for private/inactive clubs, host-only sessions, malformed IDs, and cross-club IDs.
- Preserve the existing invite flow, signed `returnTo`, primary OAuth callback origin, session cookie, BFF secret, and host/member authorization.
- A target-club `VIEWER` may be created only after the user explicitly clicks `멤버로 시작` with a signed return target for the same active public club.
- Do not recreate or overwrite target memberships in `SUSPENDED`, `LEFT`, or `INACTIVE` state.
- New host UI copy is `호스트 전용`, `게스트 공개`, and `공개 기록에 게시`; do not expose compatibility enum names as product copy.
- Use root-pinned `pnpm@11.13.1` through Corepack for frontend commands.
- Do not use real member data, live Google OAuth, email delivery, AI-provider calls, production mutation, or browser-visible secrets in verification.

---

## File Structure

### Create

- `server/src/main/resources/db/mysql/migration/V44__guest_browsing_exposure_model.sql` — add/backfill canonical app access and public-site placement fields plus indexes and checks.
- `server/src/main/kotlin/com/readmates/session/domain/SessionExposure.kt` — canonical enums and compatibility mapping.
- `server/src/main/kotlin/com/readmates/browse/application/model/GuestBrowseResults.kt` — safe guest read results only.
- `server/src/main/kotlin/com/readmates/browse/application/port/in/GuestBrowseUseCases.kt` — guest shell/session/note/archive input ports.
- `server/src/main/kotlin/com/readmates/browse/application/port/out/LoadGuestBrowseDataPort.kt` — persistence contract for public club-scoped reads.
- `server/src/main/kotlin/com/readmates/browse/application/service/GuestBrowseQueryService.kt` — read-only orchestration, cursor validation, and 404 semantics.
- `server/src/main/kotlin/com/readmates/browse/adapter/in/web/GuestBrowseController.kt` — `/api/public/clubs/{slug}/browse/**` GET endpoints and `no-store` headers.
- `server/src/main/kotlin/com/readmates/browse/adapter/in/web/GuestBrowseWebDtos.kt` — explicit allowlisted response DTOs.
- `server/src/main/kotlin/com/readmates/browse/adapter/out/persistence/JdbcGuestSessionBrowseAdapter.kt` — shell/current/upcoming safe queries.
- `server/src/main/kotlin/com/readmates/browse/adapter/out/persistence/JdbcGuestRecordBrowseAdapter.kt` — notes/archive/detail safe queries.
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthGuestJoinSession.kt` — target-club session attribute and return-target extraction.
- `server/src/test/kotlin/com/readmates/browse/api/GuestBrowseControllerDbTest.kt` — actor/club/state/content matrix and recursive forbidden-key assertions.
- `server/src/test/kotlin/com/readmates/browse/application/service/GuestBrowseQueryServiceTest.kt` — use-case validation and paging behavior.
- `server/src/test/kotlin/com/readmates/browse/adapter/out/persistence/JdbcGuestBrowseQueryBudgetTest.kt` — fixed query-budget evidence.
- `server/src/test/kotlin/com/readmates/session/domain/SessionExposureTest.kt` — canonical/compatibility exposure mapping table tests.
- `front/features/guest-browse/api/guest-browse-contracts.ts` — Zod schemas and safe guest contracts.
- `front/features/guest-browse/api/guest-browse-api.ts` — no-redirect anonymous API calls.
- `front/features/guest-browse/queries/guest-browse-queries.ts` — club/audience-isolated query keys.
- `front/features/guest-browse/model/club-app-audience.ts` — audience derivation and default-deny navigation capabilities.
- `front/features/guest-browse/model/guest-view-models.ts` — safe response-to-read-view adapters without fabricated personal state.
- `front/features/guest-browse/route/club-app-audience-loader.ts` — scoped auth plus public club availability loader.
- `front/features/guest-browse/route/guest-route-data.ts` — home/current/notes/archive guest loaders.
- `front/features/guest-browse/ui/guest-home.tsx` — guest desktop/mobile home.
- `front/features/guest-browse/ui/guest-current-session.tsx` — read-only session board and roster.
- `front/features/guest-browse/ui/guest-locked-page.tsx` — reusable feedback/account/notification lock state with no protected fetch.
- `front/features/guest-browse/ui/guest-my-space.tsx` — real feature preview with no fake personal data.
- `front/features/guest-browse/ui/guest-account-control.tsx` — guest badge, conversion, and public-home exit.
- `front/features/guest-browse/ui/guest-app-head.tsx` — scoped app `noindex` metadata.
- `front/features/guest-browse/api/guest-browse-api.test.ts` — redirect/cache/context isolation.
- `front/features/guest-browse/model/club-app-audience.test.ts` — audience and capability matrix.
- `front/features/guest-browse/route/guest-route-data.test.ts` — route-to-endpoint and locked-route zero-fetch evidence.
- `front/features/guest-browse/ui/guest-surfaces.test.tsx` — desktop/mobile guest content, copy, locks, and accessibility.
- `front/tests/e2e/guest-browsing.spec.ts` — browser actor/direct-URL/responsive/OAuth-intent evidence.

### Modify

- `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt` and host session web models — expose canonical fields beside compatibility `visibility`.
- `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionWriteOperations.kt` — transactionally dual-write canonical and compatibility fields.
- `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcSessionParticipationWriteAdapter.kt` — default newly written one-line and long reviews to `PUBLIC` without rewriting legacy exceptions.
- `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt` and `HostSessionRowMappers.kt` — read canonical exposure.
- `server/src/main/kotlin/com/readmates/sessionrecord/adapter/out/persistence/JdbcSessionRecordAdapter.kt` — preserve canonical fields through record drafts/applies.
- `server/src/main/kotlin/com/readmates/sessionimport/adapter/out/persistence/JdbcSessionImportWriteAdapter.kt` — map imports through the central compatibility mapper.
- `server/src/main/kotlin/com/readmates/sessionclosing/adapter/out/persistence/JdbcSessionClosingStatusAdapter.kt` and service — calculate public readiness from `accessScope + siteVisibility + state`.
- `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt` — switch marketing reads to `site_visibility = PUBLIC_RECORD` while retaining `PUBLISHED`.
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt` and `RateLimitFilter.kt` — explicit guest GET policy and public-read limit.
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthInviteTokenCaptureFilter.kt` and `ReadmatesOAuthSuccessHandler.kt` — capture/consume same-club explicit join intent without affecting invitations.
- `server/src/main/kotlin/com/readmates/auth/application/service/GoogleLoginService.kt` — target-aware viewer creation and blocked-membership preservation.
- `server/src/main/kotlin/com/readmates/auth/application/port/out/GoogleAccountStorePort.kt` and `MemberIdentityLookupPort.kt` — target-club viewer creation/status lookup contracts.
- `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt` — parameterize viewer membership creation by validated club.
- `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`, `session/domain/SessionInvariantConstraintTest.kt`, host session tests, OAuth tests, rate-limit tests, and architecture tests — migration, dual-write, actor, join, and boundary coverage.
- `front/shared/api/client.ts` — add a response path that never performs a login redirect.
- `front/shared/auth/login-return.ts` — add allowlisted `joinClub` OAuth intent.
- `front/shared/auth/member-app-loader.ts` — retain authenticated-only helper while delegating club-app routing to the new audience loader.
- `front/src/app/routes/member.tsx`, `front/src/app/layouts/club-app-route-layout.tsx`, `front/src/app/layouts/app-route-layout.tsx`, and `front/src/app/route-guards.tsx` — admit guests only to scoped app routes and branch protected routes before their loaders fetch.
- `front/shared/ui/top-nav.tsx`, `mobile-header.tsx`, `mobile-tab-bar.tsx`, and `public-footer.tsx` — guest badge, regular member navigation, locked state, and conversion actions.
- `front/features/member-home/**`, `front/features/current-session/**`, and `front/features/archive/**` read UI/model files — extract read-only props used by both member and guest surfaces; keep member mutation state separate.
- `front/features/host/api/host-contracts.ts`, host session record contracts/models, dashboard upcoming row, record draft/workspace, import/AI labels, and notification labels — represent and label the two canonical exposure axes.
- `front/features/auth/route/login-route.tsx`, `front/features/auth/ui/login-card.tsx`, public path helpers, and public home/club/records/session UI — add `둘러보기` and `멤버로 시작` entry points.
- `front/src/styles/globals.css` and `front/shared/styles/mobile.css` — guest badge, lock panel/sheet, entry CTA, and 320px/390px rules.
- `front/functions/_shared/cache.ts` and BFF unit tests — characterize that browse URLs are recognized but never cached when upstream is `no-store`.
- `docs/development/architecture.md`, `project-map.md`, `acceptance-matrix.md`, `CHANGELOG.md` — synchronize implemented behavior and release evidence.

### Intentionally Unchanged

- Existing member, viewer, host, feedback, invitation, notification, and mutation endpoint authorization.
- Exact-location storage and meeting credential storage; they remain available only through authenticated member/host responses.
- Existing public marketing routes and canonical URLs.
- Production data, provider credentials, deploy configuration, email/AI workflows, and release tags.

---

## Execution Preflight

- [ ] Confirm the approved design commit is on `HEAD`, classify the expected paths, and preserve unrelated work:

```bash
git merge-base --is-ancestor 6556d201 HEAD
git status --short --branch --untracked-files=all
python3 scripts/agent-preflight.py --intent change --paths 'server/src,front/src,front/features,front/functions,docs/development,CHANGELOG.md' --json
```

Expected: ancestry exits 0; preflight identifies frontend, server, design, docs, migration, auth/BFF, and release evidence. Do not edit or stage unrelated paths.

- [ ] Commit this reviewed plan by itself before product edits:

```bash
git add docs/superpowers/plans/2026-08-02-readmates-guest-browsing.md
git commit -m "docs: plan guest browsing implementation"
```

Expected: one docs-only commit. If already committed, verify with `git log -1 --oneline -- docs/superpowers/plans/2026-08-02-readmates-guest-browsing.md` and do not duplicate it.

---

### Task 1: Canonical Session Exposure Migration

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V44__guest_browsing_exposure_model.sql`
- Create: `server/src/main/kotlin/com/readmates/session/domain/SessionExposure.kt`
- Create: `server/src/test/kotlin/com/readmates/session/domain/SessionExposureTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/domain/SessionInvariantConstraintTest.kt`

**Interfaces:**
- Produces: `enum class SessionAccessScope { HOST_ONLY, GUEST_READABLE }`.
- Produces: `enum class PublicSiteVisibility { HIDDEN, PUBLIC_RECORD }`.
- Produces: `data class SessionExposure(val accessScope: SessionAccessScope, val siteVisibility: PublicSiteVisibility)`.
- Produces: `SessionExposure.fromCompatibility(state, sessionVisibility, publicationVisibility, isPublic)`.
- Preserves: existing `sessions.visibility`, `public_session_publications.visibility`, and `is_public` columns for rollback and old frontend compatibility.

- [ ] **Step 1: Add failing Flyway and domain mapping tests**

Add assertions that latest Flyway has non-null checked `access_scope` and `site_visibility`, and add this table-driven unit test:

```kotlin
@Test
fun `compatibility values map to independent guest and public-site axes`() {
    assertEquals(
        SessionExposure(SessionAccessScope.HOST_ONLY, PublicSiteVisibility.HIDDEN),
        SessionExposure.fromCompatibility("DRAFT", "HOST_ONLY", null, false),
    )
    assertEquals(
        SessionExposure(SessionAccessScope.GUEST_READABLE, PublicSiteVisibility.HIDDEN),
        SessionExposure.fromCompatibility("DRAFT", "MEMBER", null, false),
    )
    assertEquals(
        SessionExposure(SessionAccessScope.GUEST_READABLE, PublicSiteVisibility.PUBLIC_RECORD),
        SessionExposure.fromCompatibility("PUBLISHED", "PUBLIC", "PUBLIC", true),
    )
    assertEquals(
        SessionExposure(SessionAccessScope.GUEST_READABLE, PublicSiteVisibility.HIDDEN),
        SessionExposure.fromCompatibility("OPEN", "PUBLIC", "PUBLIC", true),
    )
}
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
./server/gradlew -p server test --tests 'com.readmates.session.domain.SessionExposureTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.support.MySqlFlywayMigrationTest' --tests 'com.readmates.session.domain.SessionInvariantConstraintTest'
```

Expected: FAIL because V44 and the canonical exposure types do not exist.

- [ ] **Step 3: Implement the migration**

Create V44 with these exact semantics:

```sql
alter table sessions
  add column access_scope varchar(24) not null default 'HOST_ONLY' after visibility;

update sessions
set access_scope = case
  when visibility in ('MEMBER', 'PUBLIC') then 'GUEST_READABLE'
  else 'HOST_ONLY'
end;

alter table sessions
  add constraint sessions_access_scope_check
  check (access_scope in ('HOST_ONLY', 'GUEST_READABLE'));

alter table public_session_publications
  add column site_visibility varchar(24) not null default 'HIDDEN' after visibility;

update public_session_publications p
join sessions s on s.id = p.session_id and s.club_id = p.club_id
set p.site_visibility = case
  when s.state in ('CLOSED', 'PUBLISHED')
   and s.visibility in ('MEMBER', 'PUBLIC')
   and (p.visibility = 'PUBLIC' or p.is_public = true)
    then 'PUBLIC_RECORD'
  else 'HIDDEN'
end;

alter table public_session_publications
  add constraint public_session_publications_site_visibility_check
  check (site_visibility in ('HIDDEN', 'PUBLIC_RECORD'));

create index sessions_club_access_state_number_idx
  on sessions (club_id, access_scope, state, number desc);
```

- [ ] **Step 4: Implement canonical types and compatibility mapping**

```kotlin
enum class SessionAccessScope { HOST_ONLY, GUEST_READABLE }
enum class PublicSiteVisibility { HIDDEN, PUBLIC_RECORD }

data class SessionExposure(
    val accessScope: SessionAccessScope,
    val siteVisibility: PublicSiteVisibility,
) {
    companion object {
        fun fromCompatibility(
            state: String,
            sessionVisibility: String,
            publicationVisibility: String?,
            isPublic: Boolean,
        ): SessionExposure {
            val access = if (sessionVisibility in setOf("MEMBER", "PUBLIC")) SessionAccessScope.GUEST_READABLE else SessionAccessScope.HOST_ONLY
            val publicSite =
                if (state in setOf("CLOSED", "PUBLISHED") && access == SessionAccessScope.GUEST_READABLE &&
                    (publicationVisibility == "PUBLIC" || isPublic)
                ) PublicSiteVisibility.PUBLIC_RECORD else PublicSiteVisibility.HIDDEN
            return SessionExposure(access, publicSite)
        }
    }
}
```

- [ ] **Step 5: Run migration tests and confirm GREEN**

Run the Step 2 commands plus:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.support.ReadmatesMySqlSeedTest'
```

Expected: PASS; backfill counts are asserted without printing content or member values.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V44__guest_browsing_exposure_model.sql server/src/main/kotlin/com/readmates/session/domain/SessionExposure.kt server/src/test/kotlin/com/readmates/session/domain/SessionExposureTest.kt server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt server/src/test/kotlin/com/readmates/session/domain/SessionInvariantConstraintTest.kt
git commit -m "feat(session): add guest exposure model"
```

---

### Task 2: Transactional Exposure Compatibility Across Host Workflows

**Files:**
- Modify: session application models, host web DTOs, `HostSessionWriteOperations.kt`, queries, and row mappers.
- Modify: `JdbcSessionRecordAdapter.kt`, `JdbcSessionImportWriteAdapter.kt`, and `JdbcSessionClosingStatusAdapter.kt`.
- Modify: host session, session record, import, closing, and service tests that assert visibility.

**Interfaces:**
- Produces: host response fields `accessScope: SessionAccessScope` and `siteVisibility: PublicSiteVisibility` beside legacy `visibility`.
- Produces: `SessionExposure.toCompatibility(state): CompatibilityExposure` with exact legacy writes.
- Produces: new host requests `{ accessScope }` and `{ publicSummary, siteVisibility }`; old `{ visibility }` requests remain accepted for one release.
- Guarantees: `DRAFT/OPEN + PUBLIC_RECORD` and `HOST_ONLY + PUBLIC_RECORD` return `409 SESSION_EXPOSURE_INVALID`.

- [ ] **Step 1: Write failing service and DB tests**

Add cases that create/update each canonical combination and assert all five columns:

```kotlin
@Test
fun `guest-readable hidden exposure dual-writes member compatibility`() {
    patchAccessScope(SESSION_ID, "GUEST_READABLE").andExpect {
        status { isOk() }
        jsonPath("$.accessScope") { value("GUEST_READABLE") }
        jsonPath("$.siteVisibility") { value("HIDDEN") }
    }
    assertEquals("GUEST_READABLE", scalar("select access_scope from sessions where id = '$SESSION_ID'"))
    assertEquals("MEMBER", scalar("select visibility from sessions where id = '$SESSION_ID'"))
}

@Test
fun `closed public-record intent is stored but open intent is rejected`() {
    updateState(SESSION_ID, "CLOSED")
    savePublication(SESSION_ID, "PUBLIC_RECORD").andExpect { status { isOk() } }
    updateState(SESSION_ID, "OPEN")
    savePublication(SESSION_ID, "PUBLIC_RECORD").andExpect {
        status { isConflict() }
        jsonPath("$.code") { value("SESSION_EXPOSURE_INVALID") }
    }
}
```

- [ ] **Step 2: Run focused server tests and confirm RED**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.session.api.HostSessionControllerDbTest' --tests 'com.readmates.sessionrecord.api.HostSessionRecordControllerDbTest' --tests 'com.readmates.sessionimport.api.HostSessionImportControllerDbTest'
./server/gradlew -p server test --tests 'com.readmates.session.application.service.HostSessionServicesTest' --tests 'com.readmates.sessionclosing.*'
```

Expected: FAIL on missing canonical request/response fields and missing dual writes.

- [ ] **Step 3: Implement one compatibility mapper**

Add this mapping to `SessionExposure.kt` and use it from every persistence write path:

```kotlin
data class CompatibilityExposure(
    val sessionVisibility: String,
    val publicationVisibility: String,
    val isPublic: Boolean,
)

fun SessionExposure.toCompatibility(state: String): CompatibilityExposure {
    require(!(accessScope == SessionAccessScope.HOST_ONLY && siteVisibility == PublicSiteVisibility.PUBLIC_RECORD))
    require(siteVisibility != PublicSiteVisibility.PUBLIC_RECORD || state in setOf("CLOSED", "PUBLISHED"))
    return when {
        accessScope == SessionAccessScope.HOST_ONLY -> CompatibilityExposure("HOST_ONLY", "MEMBER", false)
        siteVisibility == PublicSiteVisibility.PUBLIC_RECORD -> CompatibilityExposure("PUBLIC", "PUBLIC", true)
        else -> CompatibilityExposure("MEMBER", "MEMBER", false)
    }
}
```

- [ ] **Step 4: Add canonical host endpoints and transactional writes**

Add `PATCH /api/host/sessions/{id}/access-scope` and make publication save accept `siteVisibility`. Update `sessions.access_scope`, legacy session visibility, publication site visibility, publication visibility, and `is_public` within the existing transaction. Map invalid combinations to `SESSION_EXPOSURE_INVALID` without partial updates.

```kotlin
data class HostSessionAccessScopeRequest(val accessScope: SessionAccessScope)
data class HostSessionPublicationRequest(
    val publicSummary: String,
    val siteVisibility: PublicSiteVisibility,
    val visibility: SessionRecordVisibility? = null,
)
```

- [ ] **Step 5: Route record drafts, imports, closing, and notification readiness through canonical exposure**

Replace direct `visibility == PUBLIC` decisions with:

```kotlin
val guestReadable = exposure.accessScope == SessionAccessScope.GUEST_READABLE
val publicReady = state == "PUBLISHED" && exposure.siteVisibility == PublicSiteVisibility.PUBLIC_RECORD
```

When old import/draft payloads contain `HOST_ONLY | MEMBER | PUBLIC`, convert them with `SessionExposure.fromCompatibility`; do not create a second mapping table.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run the Step 2 commands and `./scripts/server-ci-check.sh`.

Expected: focused suites and the PR-level server gate PASS; old visibility contract tests remain green.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session server/src/main/kotlin/com/readmates/sessionrecord server/src/main/kotlin/com/readmates/sessionimport server/src/main/kotlin/com/readmates/sessionclosing server/src/test/kotlin/com/readmates/session server/src/test/kotlin/com/readmates/sessionrecord server/src/test/kotlin/com/readmates/sessionimport server/src/test/kotlin/com/readmates/sessionclosing
git commit -m "feat(session): dual-write guest exposure"
```

---

### Task 3: Host Exposure Controls and Product Copy

**Files:**
- Create: `front/features/host/model/session-exposure-model.ts`
- Create: `front/features/host/model/session-exposure-model.test.ts`
- Modify: host API contracts/client/query hooks.
- Modify: upcoming session row, record draft panel/workspace, ledger, import/AI preview, and notification visibility labels/tests.

**Interfaces:**
- Produces: `SessionAccessScope = "HOST_ONLY" | "GUEST_READABLE"`.
- Produces: `PublicSiteVisibility = "HIDDEN" | "PUBLIC_RECORD"`.
- Produces: `sessionExposureCopy(accessScope, siteVisibility)` and request builders.
- Consumes: canonical host fields from Task 2 while retaining legacy parsing during rolling deploy.

- [ ] **Step 1: Write failing model and component tests**

```ts
it("separates guest access from public-record placement", () => {
  expect(sessionExposureCopy("GUEST_READABLE", "HIDDEN")).toEqual({
    accessLabel: "게스트 공개",
    siteLabel: "공개 기록에 게시 안 함",
  });
  expect(sessionExposureCopy("GUEST_READABLE", "PUBLIC_RECORD").siteLabel).toBe("공개 기록에 게시");
});

it("does not offer public-record placement for draft sessions", () => {
  render(<SessionExposureControls state="DRAFT" accessScope="GUEST_READABLE" siteVisibility="HIDDEN" {...callbacks} />);
  expect(screen.getByRole("radio", { name: "게스트 공개" })).toBeChecked();
  expect(screen.queryByRole("checkbox", { name: "공개 기록에 게시" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused frontend tests and confirm RED**

```bash
corepack pnpm --dir front exec vitest run features/host/model/session-exposure-model.test.ts features/host/ui/host-dashboard.test.tsx features/host/ui/session-editor/session-record-draft-panel.test.tsx features/host/ui/session-editor/session-record-workspace.test.tsx
```

- [ ] **Step 3: Implement canonical contracts and copy helpers**

```ts
export type SessionAccessScope = "HOST_ONLY" | "GUEST_READABLE";
export type PublicSiteVisibility = "HIDDEN" | "PUBLIC_RECORD";

export function sessionExposureCopy(accessScope: SessionAccessScope, siteVisibility: PublicSiteVisibility) {
  return {
    accessLabel: accessScope === "HOST_ONLY" ? "호스트 전용" : "게스트 공개",
    siteLabel: siteVisibility === "PUBLIC_RECORD" ? "공개 기록에 게시" : "공개 기록에 게시 안 함",
  };
}
```

The upcoming-session toggle sends `HOST_ONLY ↔ GUEST_READABLE`. The record panel shows the public-site checkbox only for `CLOSED/PUBLISHED`, never translates `PUBLIC_RECORD` into “게스트 공개,” and keeps compatibility `visibility` out of rendered copy.

- [ ] **Step 4: Update legacy workflow labels without changing their payload format**

For import/AI/notification screens that still consume compatibility visibility during the rollout, map labels exactly:

```ts
const compatibilityExposureLabel = {
  HOST_ONLY: "호스트 전용",
  MEMBER: "게스트 공개",
  PUBLIC: "게스트 공개 · 공개 기록에 게시",
} as const;
```

- [ ] **Step 5: Run host frontend tests and confirm GREEN**

Run Step 2 plus:

```bash
corepack pnpm --dir front exec vitest run features/host
```

- [ ] **Step 6: Commit**

```bash
git add front/features/host
git commit -m "feat(host): separate guest and public exposure"
```

---

### Task 4: Guest Browse Server Shell, Current Session, and Upcoming Sessions

**Files:**
- Create: the `browse` model/port/service/controller/DTO files.
- Create: `JdbcGuestSessionBrowseAdapter.kt`.
- Create: browse service and controller tests.
- Modify: `ServerArchitectureBoundaryTest.kt`.

**Interfaces:**
- Produces: `GetGuestBrowseShellUseCase`, `GetGuestCurrentSessionUseCase`, and `ListGuestUpcomingSessionsUseCase`.
- Produces: `GuestCurrentSessionResponse` whose nested keys are allowlisted and contain no personal IDs or `my*` fields.
- Produces: `GuestCursorPage<T>(items, nextCursor)` with limit 20 default/50 max.
- Consumes: canonical `access_scope` from Task 1.

- [ ] **Step 1: Write failing controller matrix tests**

Seed active-public, private, inactive, outside-club, HOST_ONLY, DRAFT, and OPEN rows. Assert:

```kotlin
@Test
fun `anonymous current session returns approved fields and no sensitive keys`() {
    val body = get("/api/public/clubs/guest-test/browse/sessions/current")
        .andExpect { status { isOk() }; header { string("Cache-Control", "no-store") } }
        .andReturn().response.contentAsString
    assertForbiddenKeysAbsent(body, FORBIDDEN_GUEST_KEYS)
    assertThatJson(body).node("currentSession.attendees[0].displayName").isString
    assertThatJson(body).node("currentSession.board.questions[0].draftThought").isString
}

@Test
fun `draft guest-readable session appears only in upcoming browse`() {
    get("/api/public/clubs/guest-test/browse/sessions/upcoming").andExpect {
        status { isOk() }
        jsonPath("$.items[*].sessionId") { value(hasItem(DRAFT_ID)) }
    }
    get("/api/public/clubs/guest-test/sessions/$DRAFT_ID").andExpect { status { isNotFound() } }
}
```

Add `assertForbiddenKeysAbsent(body, forbiddenKeys)` in the same test file as a recursive Jackson object/array key walk, then call it with this exact forbidden set:

```kotlin
setOf("membershipId", "accountName", "email", "locationLabel", "meetingUrl", "meetingPasscode",
      "myRsvpStatus", "myCheckin", "myQuestions", "myOneLineReview", "myLongReview", "feedbackDocument")
```

- [ ] **Step 2: Run the new tests and confirm RED**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.browse.api.GuestBrowseControllerDbTest'
./server/gradlew -p server test --tests 'com.readmates.browse.application.service.GuestBrowseQueryServiceTest'
```

- [ ] **Step 3: Define safe results and DTOs**

Use separate attendee and board types; do not import `CurrentSessionPayload`:

```kotlin
data class GuestAttendeeResult(
    val displayName: String,
    val avatarKey: String,
    val rsvpStatus: String,
    val attendanceStatus: String,
)

data class GuestQuestionResult(
    val priority: Int,
    val text: String,
    val draftThought: String?,
    val authorName: String,
    val authorShortName: String,
    val avatarKey: String,
)

data class GuestLongReviewResult(
    val title: String,
    val content: String,
    val authorName: String,
    val authorShortName: String,
    val avatarKey: String,
)

data class GuestCurrentSessionResult(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String,
    val endTime: String,
    val questionDeadlineAt: String,
    val attendees: List<GuestAttendeeResult>,
    val questions: List<GuestQuestionResult>,
    val longReviews: List<GuestLongReviewResult>,
)
```

- [ ] **Step 4: Implement safe SQL and club/state filters**

Every root query joins clubs and requires:

```sql
clubs.slug = ?
and clubs.status = 'ACTIVE'
and clubs.public_visibility = 'PUBLIC'
and sessions.access_scope = 'GUEST_READABLE'
```

Current adds `sessions.state = 'OPEN'`; upcoming adds `sessions.state = 'DRAFT'`. Attendee SQL selects only display name, avatar, RSVP, and attendance. Question/review SQL selects only active participant rows and `PUBLIC` reviews. It never selects membership ID, user account name/email, location, meeting fields, or feedback tables.

- [ ] **Step 5: Implement controller and no-store response helper**

```kotlin
private fun <T> noStore(body: T): ResponseEntity<T> =
    ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body)
```

Malformed UUIDs, invalid cursors, hidden sessions, and club mismatch return the existing stable 404/400 error contract without leaking which predicate failed.

- [ ] **Step 6: Register the browse slice in architecture tests and run GREEN**

Add `browse` to `SERVER_SLICES`, run Step 2, then:

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest'
```

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/browse server/src/test/kotlin/com/readmates/browse server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "feat(browse): expose safe guest sessions"
```

---

### Task 5: Guest Notes and Archive Read Projections

**Files:**
- Modify: guest browse results, ports, service, controller, and DTOs.
- Create: `JdbcGuestRecordBrowseAdapter.kt`.
- Extend: `GuestBrowseControllerDbTest.kt` and query-budget test.
- Modify: `JdbcSessionParticipationWriteAdapter.kt` and `CurrentSessionControllerDbTest.kt` for the approved new-review default.
- Modify: `JdbcPublicQueryAdapter.kt` and public controller tests to read canonical site visibility.

**Interfaces:**
- Produces: note sessions/feed, archive list/detail cursor endpoints.
- Produces: `GuestArchiveDetailResult` with summary/highlights/questions/public reviews and aggregate attendance only.
- Guarantees: no feedback existence/status, no personal fields, no `PRIVATE/SESSION` review exposure.
- Guarantees: new one-line and long reviews are written as `PUBLIC`; existing exceptional `PRIVATE/SESSION` rows are not rewritten.
- Preserves: marketing API state gate `PUBLISHED + PUBLIC_RECORD`.

- [ ] **Step 1: Add failing content and lifecycle matrix tests**

```kotlin
@Test
fun `guest archive includes closed and published guest-readable sessions`() {
    get("/api/public/clubs/guest-test/browse/archive?limit=20").andExpect {
        status { isOk() }
        jsonPath("$.items[*].state") { value(hasItems("CLOSED", "PUBLISHED")) }
        jsonPath("$.items[*].feedbackDocument") { doesNotExist() }
    }
}

@Test
fun `guest records include public reviews but preserve private and session scopes`() {
    get("/api/public/clubs/guest-test/browse/archive/$PUBLISHED_ID").andExpect {
        jsonPath("$.oneLiners[*].text") { value(hasItem(PUBLIC_REVIEW)) }
        jsonPath("$.oneLiners[*].text") { value(not(hasItems(PRIVATE_REVIEW, SESSION_REVIEW))) }
        jsonPath("$.questions[0].draftThought") { value(DRAFT_THOUGHT) }
    }
}

@Test
fun `new current-session reviews default to public without rewriting legacy visibility`() {
    postOneLineReview("새 한줄평").andExpect { status { isOk() } }
    postLongReview("새 서평").andExpect { status { isOk() } }
    assertEquals("PUBLIC", reviewVisibility("one_line_reviews", currentSessionId, memberId))
    assertEquals("PUBLIC", reviewVisibility("long_reviews", currentSessionId, memberId))
    assertEquals("SESSION", reviewVisibility("one_line_reviews", legacySessionId, memberId))
    assertEquals("PRIVATE", reviewVisibility("long_reviews", legacySessionId, memberId))
}
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.browse.api.GuestBrowseControllerDbTest' --tests 'com.readmates.publication.api.PublicControllerDbTest'
```

- [ ] **Step 3: Implement cursor-safe notes and archive queries**

Use the existing cursor codec conventions. Notes require `PUBLISHED + GUEST_READABLE`; archive requires `(CLOSED or PUBLISHED) + GUEST_READABLE`. Review predicates are exactly `visibility = 'PUBLIC'`; questions include `draft_thought`; all author joins replace LEFT members with the existing `탈퇴한 멤버` fallback. Change both current-session review upserts to write `PUBLIC` for newly saved content, while leaving historical rows untouched unless that author explicitly saves the review again.

```sql
where sessions.club_id = ?
  and sessions.access_scope = 'GUEST_READABLE'
  and sessions.state in ('CLOSED', 'PUBLISHED')
  and (sessions.number < ? or (sessions.number = ? and sessions.id < ?))
order by sessions.number desc, sessions.id desc
limit ?
```

- [ ] **Step 4: Keep marketing reads on their separate axis**

Replace marketing predicates with:

```sql
sessions.state = 'PUBLISHED'
and public_session_publications.site_visibility = 'PUBLIC_RECORD'
```

Do not add current/upcoming records to public club stats, home, records, or public session detail.

- [ ] **Step 5: Add fixed query-budget evidence**

Run each current/detail/list adapter against small and large fixtures and assert equal query counts and bounded response collections. Do not accept N+1 attendee/question/review queries.

- [ ] **Step 6: Run GREEN and commit**

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.browse.*' --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' --tests 'com.readmates.publication.api.PublicControllerDbTest' --tests 'com.readmates.performance.MySqlQueryPlanTest'
git add server/src/main/kotlin/com/readmates/browse server/src/test/kotlin/com/readmates/browse server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcSessionParticipationWriteAdapter.kt server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt server/src/test/kotlin/com/readmates/publication
git commit -m "feat(browse): add guest notes and archive"
```

---

### Task 6: Security, Rate Limit, and BFF Cache Boundaries

**Files:**
- Modify: `SecurityConfig.kt`, `RateLimitFilter.kt`, and their tests.
- Modify: `front/functions/_shared/cache.ts`, `front/functions/api/bff/[[path]].ts` only if tests reveal incorrect handling.
- Modify/Create: BFF cache unit tests for browse paths.

**Interfaces:**
- Produces: public GET allowlist for `/api/public/clubs/{slug}/browse/**`; no public mutation.
- Produces: rate-limit key `rl:ip:<hash>:guest-browse:<club-hash>` with 120/minute.
- Preserves: URL cache key behavior but prevents storage because upstream returns `no-store`.

- [ ] **Step 1: Write failing security and rate tests**

```kotlin
@Test
fun `anonymous guest browse is allowed but mutation and member endpoints remain protected`() {
    mockMvc.get("/api/public/clubs/reading-sai/browse").andExpect { status { isOk() } }
    mockMvc.post("/api/public/clubs/reading-sai/browse").andExpect { status { isUnauthorized() } }
    mockMvc.get("/api/sessions/current").andExpect { status { isUnauthorized() } }
}

@Test
fun `guest browse is rate limited by hashed ip and club`() {
    val check = request("GET", "/api/public/clubs/reading-sai/browse/archive").toRateLimitCheckForTest()
    assertEquals(120, check!!.limit)
    assertFalse(check.key.contains("reading-sai"))
}
```

- [ ] **Step 2: Add BFF no-store characterization**

Assert two requests with different Cookie headers receive the same upstream body, `caches.default.put` is never called for `Cache-Control: no-store`, and the Cookie still never changes the public DTO shape.

- [ ] **Step 3: Run tests and confirm RED where implementation is absent**

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.RateLimitFilterTest' --tests 'com.readmates.auth.infrastructure.security.SecurityRoleHierarchyTest'
corepack pnpm --dir front exec vitest run tests/unit/cache.test.ts tests/unit/cloudflare-bff.test.ts
```

- [ ] **Step 4: Implement exact rate-limit path parsing**

```kotlin
private val GUEST_BROWSE = Regex("^/api/public/clubs/([^/]+)/browse(?:/.*)?$")

method == "GET" && GUEST_BROWSE.matches(path) -> {
    val slug = GUEST_BROWSE.matchEntire(path)!!.groupValues[1]
    RateLimitCheck("rl:ip:$ipHash:guest-browse:${stableHash(slug).take(12)}", 120, Duration.ofMinutes(1), sensitive = false)
}
```

Reject malformed encoded path segments before this branch and retain hashed/raw-value logging rules.

- [ ] **Step 5: Run GREEN and commit**

```bash
./server/gradlew -p server test --tests 'com.readmates.auth.infrastructure.security.*'
corepack pnpm --dir front exec vitest run tests/unit/cache.test.ts tests/unit/cloudflare-bff.test.ts
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security server/src/test/kotlin/com/readmates/auth/infrastructure/security front/functions front/tests/unit
git commit -m "feat(security): protect guest browse reads"
```

---

### Task 7: Guest Frontend Contracts, Client, Audience, and Loaders

**Files:**
- Create: guest API/contracts/queries/model/route files and tests.
- Modify: `front/shared/api/client.ts` and its tests.
- Modify: `front/shared/auth/member-app-loader.ts` only to share `authMePath`, slug, and scoped path helpers.

**Interfaces:**
- Produces: `ClubAppAudience = "GUEST" | "VIEWER" | "MEMBER" | "HOST"`.
- Produces: `ClubAppAccess = { audience; auth; club: GuestBrowseShell }`.
- Produces: default-deny `guestNavigationCapability(path): OPEN | PREVIEW | LOCKED | DENY`.
- Produces: `readmatesPublicFetchResponse` that never redirects on 401 and never injects a scoped `clubSlug` query.

- [ ] **Step 1: Write failing client and audience tests**

```ts
it("does not redirect or inject member club context for guest reads", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
  await expect(readmatesPublicFetchResponse("/api/public/clubs/alpha/browse")).resolves.toHaveProperty("status", 401);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/bff/api/public/clubs/alpha/browse");
  expect(assign).not.toHaveBeenCalled();
});

it.each([
  [false, null, "GUEST"],
  [true, "VIEWER", "VIEWER"],
  [true, "ACTIVE", "MEMBER"],
])("derives audience", (authenticated, membershipStatus, expected) => {
  expect(deriveClubAppAudience(auth({ authenticated, membershipStatus }))).toBe(expected);
});

it("defaults unknown guest routes to LOCKED", () => {
  expect(guestNavigationCapability("/app/new-feature")).toBe("LOCKED");
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
corepack pnpm --dir front exec vitest run features/guest-browse shared/api
```

- [ ] **Step 3: Implement no-redirect public client**

```ts
export async function readmatesPublicFetchResponse(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`/api/bff${readmatesApiPath(path, { clubSlug: undefined })}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
```

`readmatesPublicFetch<T>` parses non-OK responses through the existing error contract but never calls `window.location.assign`.

- [ ] **Step 4: Define exact navigation matrix**

```ts
export const GUEST_NAVIGATION = {
  home: "OPEN",
  current: "OPEN",
  notes: "OPEN",
  archive: "OPEN",
  sessionDetail: "OPEN",
  mySpace: "PREVIEW",
  myRecords: "PREVIEW",
  settings: "LOCKED",
  notifications: "LOCKED",
  feedback: "LOCKED",
  host: "DENY",
} as const;
```

- [ ] **Step 5: Implement Zod safe contracts and loaders**

Define guest schemas with only approved fields. `loadClubAppAudience` fetches auth and browse shell without login redirect; child guest loaders call only browse endpoints. Query keys are `['guest-browse', clubSlug, resource, ...]` and never overlap member keys.

- [ ] **Step 6: Run GREEN and commit**

```bash
corepack pnpm --dir front exec vitest run features/guest-browse shared/api
git add front/features/guest-browse front/shared/api/client.ts front/shared/auth/member-app-loader.ts
git commit -m "feat(frontend): model guest app audience"
```

---

### Task 8: Scoped Guest Routes, Navigation, Locks, and Personal Preview

**Files:**
- Modify: member route tree, club/app layouts, route guards, top/mobile navigation, footer.
- Create: guest lock, my-space, account control, and noindex UI/tests.

**Interfaces:**
- Consumes: `ClubAppAccess` and `GUEST_NAVIGATION` from Task 7.
- Produces: guest-safe route elements that decide capability before any protected loader executes.
- Guarantees: feedback/print/host/account/notification direct URLs issue zero protected API calls.

- [ ] **Step 1: Write failing route-order and zero-fetch tests**

```tsx
it.each(["/clubs/reading-sai/app/feedback/s1", "/clubs/reading-sai/app/feedback/s1/print"])(
  "renders a lock without fetching feedback for %s",
  async (path) => {
    renderGuestRouter(path);
    expect(await screen.findByRole("heading", { name: "정식 멤버에게 열립니다" })).toBeVisible();
    expect(fetchFeedbackDocument).not.toHaveBeenCalled();
  },
);

it("denies host deep links before host loaders run", async () => {
  renderGuestRouter("/clubs/reading-sai/app/host/members");
  expect(await screen.findByRole("heading", { name: /클럽 둘러보기/ })).toBeVisible();
  expect(fetchHostMembers).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run route tests and confirm RED**

```bash
corepack pnpm --dir front exec vitest run src/app/router-route-order.test.tsx tests/unit/spa-router.test.tsx features/guest-browse/route/guest-route-data.test.ts
```

- [ ] **Step 3: Admit GUEST only on club-scoped app routes**

Keep unscoped `/app` authenticated club selection. Replace the scoped layout gate with:

```tsx
export function ClubMemberAppRouteLayout() {
  const access = useLoaderData() as ClubAppAccess;
  return (
    <ClubAppAudienceProvider value={access}>
      <GuestAppHead />
      <AppRouteLayout scopedAuth={access.auth} audience={access.audience} />
    </ClubAppAudienceProvider>
  );
}
```

Host route definitions remain ordered before member wildcards; guest host paths redirect to the scoped app root before lazy host data loaders execute.

- [ ] **Step 4: Render regular member navigation with capabilities**

Desktop and mobile show Home, Notes, Archive, and My Space. Locked destinations remain interactive and open the lock page/sheet. Host/admin navigation is not rendered for guests. The account control shows `게스트`, `멤버로 시작`, and `공개 홈으로 나가기`; it never calls logout.

- [ ] **Step 5: Implement personal preview and locked copy**

Use exact copy:

```text
내 공간
멤버로 시작하면 내가 참석한 모임, 질문과 서평, 알림 설정을 이곳에서 이어볼 수 있어요.
```

Feedback lock copy states that Google starts viewer membership and host approval is still required. Do not show fake counts, names, avatars, attendance, or feedback availability.

- [ ] **Step 6: Add noindex and accessibility behavior**

`GuestAppHead` installs a single `<meta name="robots" content="noindex">`; lock dialogs/sheets restore focus, close on Escape/backdrop, expose text status, and use 44px controls.

- [ ] **Step 7: Run GREEN and commit**

```bash
corepack pnpm --dir front exec vitest run src/app features/guest-browse shared/ui
git add front/src/app front/features/guest-browse front/shared/ui
git commit -m "feat(frontend): add guest app shell"
```

---

### Task 9: Guest Home, Current Session, Notes, and Archive UI

**Files:**
- Create: guest home/current UI.
- Modify: member-home/current-session/archive read models and low-level UI props where needed.
- Modify: guest route data and surface tests.

**Interfaces:**
- Produces: read-only view types with `capabilities.canWrite = false` and no fabricated `my*` values.
- Reuses: note feed/page and archive list primitives after mapping safe guest contracts.
- Guarantees: guest current session renders approved roster/board fields and no write form or feedback metadata.

- [ ] **Step 1: Write failing surface tests**

```tsx
it("shows real guest session data but no participation controls", () => {
  render(<GuestCurrentSession data={guestSessionFixture} />);
  expect(screen.getByText("다가오는 질문")).toBeVisible();
  expect(screen.getByText("초안 생각")).toBeVisible();
  expect(screen.getByText("참석")).toBeVisible();
  expect(screen.queryByRole("button", { name: /RSVP|저장|질문 추가/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/접속 링크|비밀번호|정확한 장소/)).not.toBeInTheDocument();
});

it("shows upcoming sessions on guest home without placing them on public home", () => {
  render(<GuestHome data={guestHomeFixture} />);
  expect(screen.getByRole("heading", { name: "다가오는 세션" })).toBeVisible();
});
```

- [ ] **Step 2: Run surface tests and confirm RED**

```bash
corepack pnpm --dir front exec vitest run features/guest-browse/ui/guest-surfaces.test.tsx features/member-home features/current-session features/archive
```

- [ ] **Step 3: Separate read data from member participation data**

Introduce view props shaped like:

```ts
export type SessionReadView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  questionDeadlineAt: string;
  attendees: Array<{ displayName: string; avatarKey: string; rsvpStatus: RsvpStatus; attendanceStatus: AttendanceStatus }>;
  board: { questions: BoardQuestion[]; longReviews: BoardLongReview[] };
};
```

Member adapters add participation state separately. Guest adapters never construct `myRsvpStatus`, `myQuestions`, feedback status, membership IDs, or meeting fields.

On member review forms, add persistent helper copy `작성한 글은 게스트에게도 공개돼요.` beside the save action. Do not add a misleading per-post privacy selector in v1: newly saved reviews use the server-enforced `PUBLIC` default from Task 5, while preserved legacy `PRIVATE/SESSION` rows remain hidden until their author explicitly saves again.

- [ ] **Step 4: Implement guest pages using read primitives**

Guest home shows current, upcoming, recent note activity, and a member-conversion prompt. Guest current shows session metadata, roster, questions/`draftThought`, and public reviews. Notes reuse `NotesFeedPage` with guest cursor callbacks. Archive list/detail use a guest detail view that omits personal rail and replaces feedback with a static member-only explanation outside the data model.

- [ ] **Step 5: Verify member UI regression and guest GREEN**

```bash
corepack pnpm --dir front exec vitest run features/guest-browse features/member-home features/current-session features/archive tests/unit/member-home.test.tsx tests/unit/current-session.test.tsx tests/unit/archive-page.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add front/features/guest-browse front/features/member-home front/features/current-session front/features/archive
git commit -m "feat(frontend): render guest club records"
```

---

### Task 10: Public Entry Points and Target-Club OAuth Join

**Files:**
- Modify: login/public UI, public path helpers, OAuth URL helper and tests.
- Create/Modify: OAuth guest join session, capture filter, success handler, Google login service/ports/JDBC, and tests.

**Interfaces:**
- Produces: `oauthHrefForReturnTo(returnTo, { chooseAccount?, joinClub? })`.
- Produces: server-owned `OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE` accepted only when it matches `/clubs/{slug}/app/**` safe return target.
- Produces: `loginVerifiedGoogleUserForSession(..., targetClubSlug: String?)`.
- Produces: `createViewerMembershipForExistingUser(userId, clubSlug, avatarKey)` and `findMembershipStatusByUserIdAndClubId`.

- [ ] **Step 1: Write failing frontend CTA and OAuth URL tests**

```ts
it("builds a same-club explicit member-start intent", () => {
  expect(oauthHrefForReturnTo("/clubs/reading-sai/app/archive", { joinClub: "reading-sai" })).toBe(
    "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Farchive&joinClub=reading-sai",
  );
  expect(oauthHrefForReturnTo("/clubs/other/app", { joinClub: "reading-sai" })).toBe(
    "/oauth2/authorization/google?returnTo=%2Fclubs%2Fother%2Fapp",
  );
});
```

Update login/public UI tests to require both `둘러보기` and `멤버로 시작` with scoped destinations.

- [ ] **Step 2: Write failing server join tests**

Cover new user, user in another club, existing target viewer/member, target LEFT/SUSPENDED/INACTIVE, private/inactive target club, mismatched return path, invite+join collision, and concurrent viewer creation.

```kotlin
@Test
fun `explicit signed target creates viewer only in that public club`() {
    startGoogleOAuth(returnTo = "/clubs/book-club/app/archive", joinClub = "book-club")
    completeGoogleCallback("new-user@example.test")
    assertEquals("VIEWER", membershipStatus("new-user@example.test", "book-club"))
    assertNull(membershipStatus("new-user@example.test", "reading-sai"))
}
```

- [ ] **Step 3: Run focused tests and confirm RED**

```bash
corepack pnpm --dir front exec vitest run tests/unit/login-return.test.ts tests/unit/login-card.test.tsx tests/unit/public-home.test.tsx tests/unit/public-club.test.tsx
./server/gradlew -p server test --tests 'com.readmates.auth.application.GoogleLoginServiceTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.auth.api.GoogleOAuthLoginSessionTest'
```

- [ ] **Step 4: Implement safe frontend join intent**

Only include `joinClub` when it matches the club slug extracted from the already-safe relative `returnTo`:

```ts
const match = returnTo?.match(/^\/clubs\/([^/]+)\/app(?:\/|$)/);
if (options.joinClub && match?.[1] === options.joinClub) query.set("joinClub", options.joinClub);
```

Public home/about/records/session and login cards use scoped `둘러보기` links and `멤버로 시작` OAuth links. Generic unscoped login keeps existing behavior without a join intent.

- [ ] **Step 5: Capture and consume target club server-side**

The OAuth start filter first signs/validates `returnTo`, extracts its scoped club slug, requires equality with normalized `joinClub`, and stores the slug in the server session. Invite token presence suppresses guest join. Success/failure always removes the attribute.

- [ ] **Step 6: Make Google login target-aware and fail closed**

Before creating a membership, verify the target club is `ACTIVE + PUBLIC`. For an existing user, look up target-club status including blocked states. Return existing VIEWER/ACTIVE membership; reject SUSPENDED/LEFT/INACTIVE; create a VIEWER only when no target row exists. Use a unique `(club_id,user_id)` conflict recovery lookup for concurrency.

- [ ] **Step 7: Run GREEN and commit**

```bash
corepack pnpm --dir front exec vitest run features/auth features/public tests/unit/login-return.test.ts tests/unit/login-card.test.tsx tests/unit/public-home.test.tsx tests/unit/public-club.test.tsx
./server/gradlew -p server test --tests 'com.readmates.auth.application.GoogleLoginServiceTest' --tests 'com.readmates.auth.infrastructure.security.OAuthReturnStateTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.auth.api.GoogleOAuthLoginSessionTest'
git add front/features/auth front/features/public front/shared/auth server/src/main/kotlin/com/readmates/auth server/src/test/kotlin/com/readmates/auth
git commit -m "feat(auth): join guest to target club"
```

---

### Task 11: Session Expiry, Responsive UX, and Browser Matrix

**Files:**
- Modify: auth state/session error handling and guest UI styles/tests.
- Create/Modify: `front/tests/e2e/guest-browsing.spec.ts` and E2E fixtures/routes.

**Interfaces:**
- Produces: read-only expiry choice `재로그인 | 게스트로 계속 보기` for public clubs.
- Preserves: mutation-screen draft state and existing forced reauthentication for protected writes.
- Produces: 320px, 390px, and desktop evidence for entry, navigation, locks, and conversion.

- [ ] **Step 1: Write failing expiry and responsive tests**

Test that a member read query 401 offers both actions, while a current-session write 401 preserves entered text and does not silently remount as guest. Add Playwright cases for public entry, guest home/upcoming, notes/archive/detail, feedback direct URL, host direct URL, cross-club 404, and mobile lock sheet.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
corepack pnpm --dir front exec vitest run tests/unit/auth-context.test.tsx features/guest-browse
corepack pnpm --dir front exec playwright test tests/e2e/guest-browsing.spec.ts --project=chromium
```

- [ ] **Step 3: Implement explicit expiry recovery**

On read-only routes, retain current successful data, show a non-destructive banner, and route `게스트로 계속 보기` to the same scoped guest-readable path after clearing member query keys. On write routes, retain local form state and show only reauthentication until the user explicitly leaves.

- [ ] **Step 4: Add responsive and accessible styles**

Use existing design tokens, minimum 44px targets, no content-covering sticky CTA, wrapping Korean copy, visible focus, focus restoration, and `prefers-reduced-motion`. Verify no horizontal overflow at 320px/390px and no desktop nav collision.

- [ ] **Step 5: Run browser matrix and commit**

```bash
corepack pnpm --dir front exec vitest run src/app features/guest-browse features/auth
corepack pnpm --dir front exec playwright test tests/e2e/guest-browsing.spec.ts --project=chromium
git add front/src/app front/features/guest-browse front/src/styles/globals.css front/shared/styles/mobile.css front/tests/e2e
git commit -m "test(frontend): cover guest browsing journey"
```

---

### Task 12: Documentation, Full Regression, and Public-Release Safety

**Files:**
- Modify: `docs/development/architecture.md`, `project-map.md`, `acceptance-matrix.md`, and `CHANGELOG.md`.
- Modify: fixture contracts/query-plan tests only where canonical fields require synchronized expectations.

**Interfaces:**
- Consumes: all completed runtime contracts.
- Produces: one current architecture/access matrix and final repository evidence at HEAD.

- [ ] **Step 1: Update docs from implemented behavior**

Document the four audiences, guest/public-site separation, canonical fields, safe DTO exclusions, route capabilities, OAuth target join, rate/cache behavior, rollout compatibility, and removal boundary. Remove stale claims that DRAFT+PUBLIC is valid or that MEMBER/PUBLIC alone is the app visibility source of truth.

- [ ] **Step 2: Run focused contract and architecture checks**

```bash
./server/gradlew -p server test --tests 'com.readmates.architecture.ServerArchitectureBoundaryTest' --tests 'com.readmates.contract.FrontendZodSchemaContractTest' --tests 'com.readmates.contract.FrontendFixtureContractTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.support.MySqlFlywayMigrationTest' --tests 'com.readmates.browse.*' --tests 'com.readmates.auth.api.GoogleOAuthLoginSessionTest'
corepack pnpm --dir front exec vitest run features/guest-browse tests/unit/cache.test.ts tests/unit/cloudflare-bff.test.ts tests/unit/spa-router.test.tsx
```

Expected: PASS with no fixture containing forbidden guest keys.

- [ ] **Step 3: Run canonical frontend and server gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front test:e2e
```

Expected: all PASS. If a check cannot run, record the exact command and reason; do not substitute a claim.

- [ ] **Step 4: Run public-release and diff safety gates**

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check
git status --short --branch
```

Expected: public candidate checks PASS; no secret, local absolute path, private data, or unrelated file is staged.

- [ ] **Step 5: Perform final manual browser proof without live provider actions**

Capture desktop and mobile evidence for anonymous entry, upcoming/current, notes/archive, feedback lock, personal preview, and OAuth link parameters. Confirm member/viewer/host routes still behave through local fixtures. Do not complete live Google OAuth or send email/AI requests.

- [ ] **Step 6: Commit docs and final evidence adjustments**

```bash
git add docs/development/architecture.md docs/development/project-map.md docs/development/acceptance-matrix.md CHANGELOG.md
git commit -m "docs: document guest browsing boundaries"
```

- [ ] **Step 7: Final review checkpoint**

Review `git diff origin/main..HEAD` against the approved design, verify every task commit is present, and report:

```text
changed surfaces: migration, server browse/auth/session, BFF, frontend guest/member/public/host, docs
checks: exact commands and outcomes
remaining risk: compatibility columns intentionally retained for one release
skipped live actions: Google OAuth, email, AI provider, production mutation
```

Do not merge, push, deploy, remove compatibility columns, or execute billable/user-impacting smoke without separate user authorization.
