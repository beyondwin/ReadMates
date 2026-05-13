# ReadMates Architecture/SOLID Detailed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `2026-05-13-readmates-architecture-solid-review-plan.md`의 P1/P2/P3 개선 후보를 작고 검증 가능한 PR 단위로 구현한다.

**Architecture:** 프런트 변경은 route-first 경계를 더 엄격하게 만들고, 서버 변경은 existing clean architecture 방향을 유지하면서 outbound port와 application service를 use-case별로 줄인다. 모든 변경은 public-safe placeholder만 사용하며, 실제 멤버 데이터, secret, private deployment state, local absolute path를 문서나 fixture에 추가하지 않는다.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Kotlin 2.2, Spring Boot 4.0, JDBC, MySQL/Flyway, ArchUnit, JUnit 5.

---

## PR 스택

| PR | Branch | Surface | 목표 | 핵심 검증 |
| --- | --- | --- | --- | --- |
| 1 | `codex/readmates-front-boundary-tightening` | front tests/host/member-home | `model -> ui` hole, legacy `components` hole 닫기 | frontend boundary, member-home, host tests, lint/test/build |
| 2 | `codex/readmates-auth-port-segregation` | server auth | `MemberAccountStorePort`를 작은 outbound port로 분리 | ArchUnit, auth focused tests, server test |
| 3 | `codex/readmates-session-port-segregation` | server session | `HostSessionWritePort`와 `HostSessionCommandService` 책임 분리 | session focused tests, server architecture |
| 4 | `codex/readmates-notification-port-segregation` | server notification | `NotificationDeliveryPort` default/fat method 제거 | notification tests, server architecture |
| 5 | `codex/readmates-notification-persistence-split` | server notification persistence | query/write helper를 responsibility별 파일로 분리 | notification adapter/service tests |
| 6 | `codex/readmates-ui-file-splits` | front UI | 큰 UI 파일을 behavior-preserving split | targeted unit tests, lint/test/build, responsive inspection |
| 7 | `codex/readmates-maintenance-hygiene` | docs/test/docker | JPA test property와 Dockerfile runtime duplication 정리 | migration/seed tests, docker build, docs diff check |

권장 순서: PR 1 -> PR 2 -> PR 3 -> PR 4 -> PR 5 -> PR 6 -> PR 7.

## 공통 규칙

- 각 PR 시작 전 `git status --short --untracked-files=all`로 unrelated change를 확인한다.
- 프런트 PR은 `docs/agents/front.md`와 `docs/agents/design.md`를 읽는다. UI split이 없는 boundary-only PR도 `front.md`는 필수다.
- 서버 PR은 `docs/agents/server.md`를 읽는다.
- 문서/계획 갱신이 있으면 `docs/agents/docs.md`를 읽고 `git diff --check -- <changed-docs>`를 실행한다.
- public repo safety를 유지한다. 새 예시는 `host@example.com`, `https://api.example.com`, `<db-password>` 같은 placeholder만 쓴다.
- 각 PR은 behavior-preserving refactor로 시작한다. API response shape, route path, DB schema, authorization rule 변경을 섞지 않는다.

---

## PR 1: Front Boundary Tightening

### Scope

`host`와 `member-home`의 presentation 타입/컴포넌트 surface를 architecture guide에 맞춘다.

### Files

- Modify: `front/tests/unit/frontend-boundaries.test.ts`
- Move: `front/features/host/ui/host-ui-types.ts` -> `front/features/host/model/host-view-types.ts`
- Modify: `front/features/host/model/host-session-editor-form-state.ts`
- Modify: `front/features/host/ui/**/*.ts`
- Modify: `front/features/host/ui/**/*.tsx`
- Modify: `front/features/host/index.ts`
- Create: `front/features/member-home/model/member-home-view-model.ts`
- Create: `front/features/member-home/ui/member-home.tsx`
- Create: `front/features/member-home/ui/member-home-current-session.tsx`
- Create: `front/features/member-home/ui/member-home-records.tsx`
- Create: `front/features/member-home/ui/prep-card.tsx`
- Modify: `front/features/member-home/route/member-home-data.ts`
- Modify: `front/src/pages/app-home.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`
- Delete: `front/features/archive/components/*`
- Delete: `front/features/auth/components/*`
- Delete: `front/features/feedback/components/*`
- Delete: `front/features/member-home/components/*`
- Delete: `front/features/public/components/*`

### Steps

- [x] **Step 1: Add the failing frontend boundary assertions**

In `front/tests/unit/frontend-boundaries.test.ts`, add this helper near `isFeatureUiFile`:

```ts
function isFeatureComponentsFile(relativePath: string) {
  return /^features\/[^/]+\/components\//.test(relativePath);
}
```

Update `isFeatureModelBoundaryImport` so feature model cannot import same-feature `ui` or `route`:

```ts
return (
  isSharedApiImport(importSpecifier.projectPath) ||
  isFeatureLayerImport(importSpecifier.projectPath, "api") ||
  isFeatureLayerImport(importSpecifier.projectPath, "route") ||
  isFeatureLayerImport(importSpecifier.projectPath, "ui")
);
```

Inside the main `for (const sourceFile of collectAllSourceFiles())` loop, before reading import specifiers is fine, add:

```ts
if (isFeatureComponentsFile(sourceFile.relativePath)) {
  violations.push(
    `${sourceFile.displayPath} is under a legacy components directory; migrated features must use api/model/route/ui.`,
  );
}
```

- [x] **Step 2: Run the boundary test and capture the expected failures**

```bash
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: FAIL. The failure must include `front/features/host/model/host-session-editor-form-state.ts` importing `features/host/ui/host-ui-types` and legacy `front/features/*/components/*` files.

- [x] **Step 3: Move host UI type declarations into model**

```bash
git mv front/features/host/ui/host-ui-types.ts front/features/host/model/host-view-types.ts
```

Replace imports under `front/features/host`:

```ts
from "@/features/host/ui/host-ui-types"
```

with:

```ts
from "@/features/host/model/host-view-types"
```

The critical fixed import in `front/features/host/model/host-session-editor-form-state.ts` must become:

```ts
import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
```

- [x] **Step 4: Keep route/action API types in `api/host-contracts.ts`**

Do not make `front/features/host/ui/**` import `front/features/host/api/**`. Route/action modules may continue importing API contracts:

```ts
import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";
```

UI and model modules must import view types from:

```ts
import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
```

If a route passes an API response into UI, keep the conversion structural in the route for this PR:

```ts
const sessionView: import("@/features/host/model/host-view-types").HostSessionDetailResponse = session;
return <HostSessionEditor session={sessionView} actions={hostSessionEditorActions} />;
```

- [x] **Step 5: Migrate member-home to `ui` and add a view model boundary**

Create `front/features/member-home/model/member-home-view-model.ts`:

```ts
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { AttendanceStatus, RsvpStatus } from "@/shared/model/readmates-types";

export type MemberHomeAuth = AuthMeResponse;
export type MemberHomeMemberRole = "HOST" | "MEMBER";
export type MemberHomeMembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type MemberHomeSessionParticipationStatus = "ACTIVE" | "REMOVED";

export type MemberHomeCurrentSessionView = {
  currentSession: null | {
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookLink: string | null;
    bookImageUrl: string | null;
    date: string;
    startTime: string;
    endTime: string;
    locationLabel: string;
    meetingUrl: string | null;
    meetingPasscode: string | null;
    questionDeadlineAt: string;
    myRsvpStatus: RsvpStatus;
    myCheckin: null | {
      readingProgress: number;
    };
    myQuestions: Array<{
      priority: number;
      text: string;
      draftThought: string | null;
      authorName: string;
      authorShortName: string;
    }>;
    myOneLineReview: null | {
      text: string;
    };
    myLongReview: null | {
      body: string;
    };
    board: {
      questions: Array<{
        priority: number;
        text: string;
        draftThought: string | null;
        authorName: string;
        authorShortName: string;
      }>;
      oneLineReviews: Array<{
        authorName: string;
        authorShortName: string;
        text: string;
      }>;
      highlights: Array<{
        text: string;
        sortOrder: number;
      }>;
    };
    attendees: Array<{
      membershipId: string;
      displayName: string;
      accountName: string;
      role: MemberHomeMemberRole;
      rsvpStatus: RsvpStatus;
      attendanceStatus: AttendanceStatus;
      participationStatus?: MemberHomeSessionParticipationStatus;
    }>;
  };
};

export type MemberHomeNoteFeedItemView = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  authorName: string | null;
  authorShortName: string | null;
  kind: "QUESTION" | "ONE_LINE_REVIEW" | "HIGHLIGHT";
  text: string;
};

export type MemberHomeUpcomingSessionView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  visibility: "MEMBER" | "PUBLIC";
};

export type MemberHomeView = {
  auth: MemberHomeAuth;
  current: MemberHomeCurrentSessionView;
  noteFeedItems: MemberHomeNoteFeedItemView[];
  upcomingSessions: MemberHomeUpcomingSessionView[];
};

export function memberHomeViewFromRouteData(view: MemberHomeView): MemberHomeView {
  return view;
}
```

Move the component files:

```bash
mkdir -p front/features/member-home/ui
git mv front/features/member-home/components/member-home.tsx front/features/member-home/ui/member-home.tsx
git mv front/features/member-home/components/member-home-current-session.tsx front/features/member-home/ui/member-home-current-session.tsx
git mv front/features/member-home/components/member-home-records.tsx front/features/member-home/ui/member-home-records.tsx
git mv front/features/member-home/components/prep-card.tsx front/features/member-home/ui/prep-card.tsx
```

Update intra-feature imports from:

```ts
@/features/member-home/components/
```

to:

```ts
@/features/member-home/ui/
```

Update `front/features/member-home/route/member-home-data.ts` so `MemberHomeRouteData` imports model view types instead of API contract types:

```ts
import type {
  MemberHomeCurrentSessionView,
  MemberHomeNoteFeedItemView,
  MemberHomeUpcomingSessionView,
} from "@/features/member-home/model/member-home-view-model";

export type MemberHomeRouteData = {
  current: MemberHomeCurrentSessionView;
  noteFeedItems: MemberHomeNoteFeedItemView[];
  upcomingSessions: MemberHomeUpcomingSessionView[];
};
```

The fetch functions may still return API contract types; TypeScript structural compatibility lets the route assign them to the view data shape without importing API contracts into `ui` or `model`.

Update `front/src/pages/app-home.tsx`:

```ts
import MemberHome from "@/features/member-home/ui/member-home";
import { memberHomeViewFromRouteData } from "@/features/member-home/model/member-home-view-model";
```

Use the mapper at the render boundary:

```tsx
const view = memberHomeViewFromRouteData({
  auth: authState.auth,
  current: data.current,
  noteFeedItems: data.noteFeedItems,
  upcomingSessions: data.upcomingSessions,
});

return <MemberHome {...view} />;
```

Update `front/features/member-home/ui/*.tsx` type imports from the API contract to:

```ts
import type {
  MemberHomeAuth,
  MemberHomeCurrentSessionView,
  MemberHomeNoteFeedItemView,
  MemberHomeUpcomingSessionView,
} from "@/features/member-home/model/member-home-view-model";
```

Update `front/tests/unit/member-home.test.tsx`:

```ts
import MemberHome from "@/features/member-home/ui/member-home";
```

- [x] **Step 6: Delete stale compatibility component shims**

After `rg -n '@/features/.*/components|features/.*/components' front/src front/features front/shared front/tests -g '*.{ts,tsx}'` shows only files inside the component directories themselves, delete stale shim files:

```bash
git rm front/features/archive/components/*
git rm front/features/auth/components/*
git rm front/features/feedback/components/*
git rm front/features/public/components/*
```

Remove empty directories from the working tree if they remain locally. Do not add placeholder files.

- [x] **Step 7: Run targeted frontend checks**

```bash
pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts tests/unit/member-home.test.tsx tests/unit/host-session-editor.test.tsx tests/unit/host-dashboard.test.tsx tests/unit/host-members.test.tsx tests/unit/host-invitations.test.tsx
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all commands pass. If a host unit test imports `host-ui-types`, update it to `host-view-types`.

- [x] **Step 8: Commit**

```bash
git add front/tests/unit/frontend-boundaries.test.ts \
        front/features/host \
        front/features/member-home \
        front/src/pages/app-home.tsx \
        front/tests/unit/member-home.test.tsx
git commit -m "refactor: tighten frontend feature boundaries"
```

---

## PR 2: Auth Port Segregation

### Scope

Split `MemberAccountStorePort` so application services depend on narrow outbound contracts.

### Files

- Delete: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAccountStorePort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberIdentityLookupPort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/GoogleAccountStorePort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/PlatformAdminLookupPort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/DevSeedMemberLookupPort.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAccountDuplicateException.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcCurrentMemberAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/AuthenticatedMemberResolver.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/ResolveCurrentMemberService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/GoogleLoginService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/service/DevLoginMemberService.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

### Steps

- [x] **Step 1: Create narrow ports**

Create `MemberAccountDuplicateException.kt`:

```kotlin
package com.readmates.auth.application.port.out

class MemberAccountDuplicateException(cause: Throwable) : RuntimeException("Member account duplicate", cause)
```

Create `MemberIdentityLookupPort.kt`:

```kotlin
package com.readmates.auth.application.port.out

import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import java.util.UUID

interface MemberIdentityLookupPort {
    fun findActiveMemberByEmail(email: String): CurrentMember?
    fun findActiveMemberByUserId(userId: String): CurrentMember?
    fun findMemberByUserIdAndClubId(userId: UUID, clubId: UUID): CurrentMember?
    fun findMemberByEmailAndClubId(email: String, clubId: UUID): CurrentMember?
    fun findMemberByUserIdIncludingViewer(userId: UUID): CurrentMember?
    fun findAnyUserIdByEmail(email: String): UUID?
    fun findUserById(userId: UUID): CurrentUser?
    fun findMembershipStatusByUserId(userId: UUID): MembershipStatus?
    fun listJoinedClubs(userId: UUID): List<JoinedClubSummary>
}
```

Create `GoogleAccountStorePort.kt`:

```kotlin
package com.readmates.auth.application.port.out

import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface GoogleAccountStorePort {
    fun findMemberByGoogleSubject(googleSubjectId: String): CurrentMember?
    fun googleSubjectOwnerEmail(googleSubjectId: String): String?
    fun connectGoogleSubject(userId: UUID, googleSubjectId: String, profileImageUrl: String?): Boolean
    fun createGoogleUser(googleSubjectId: String, email: String, displayName: String?, profileImageUrl: String?): UUID
    fun createViewerGoogleMember(googleSubjectId: String, email: String, displayName: String?, profileImageUrl: String?): CurrentMember
    fun recordLastLogin(userId: UUID)
}
```

Create `PlatformAdminLookupPort.kt`:

```kotlin
package com.readmates.auth.application.port.out

import com.readmates.shared.security.CurrentPlatformAdmin
import java.util.UUID

interface PlatformAdminLookupPort {
    fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin?
}
```

Create `DevSeedMemberLookupPort.kt`:

```kotlin
package com.readmates.auth.application.port.out

import com.readmates.shared.security.CurrentMember

interface DevSeedMemberLookupPort {
    fun findDevSeedActiveMemberByEmail(email: String): CurrentMember?
}
```

- [x] **Step 2: Make `JdbcMemberAccountAdapter` implement the new ports**

Change its class declaration to:

```kotlin
class JdbcMemberAccountAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : MemberIdentityLookupPort,
    GoogleAccountStorePort,
    PlatformAdminLookupPort,
    DevSeedMemberLookupPort {
```

Update imports accordingly and keep method bodies unchanged.

- [x] **Step 3: Update service constructor dependencies**

Use these constructor changes:

```kotlin
class GoogleLoginService(
    private val memberIdentityLookup: MemberIdentityLookupPort,
    private val googleAccountStore: GoogleAccountStorePort,
    private val platformAdminLookup: PlatformAdminLookupPort,
)
```

Replace calls:

```kotlin
memberAccountStore.findAnyUserIdByEmail(...)
memberAccountStore.findMemberByUserIdIncludingViewer(...)
memberAccountStore.findMembershipStatusByUserId(...)
```

with `memberIdentityLookup`.

Replace calls:

```kotlin
memberAccountStore.findMemberByGoogleSubject(...)
memberAccountStore.googleSubjectOwnerEmail(...)
memberAccountStore.connectGoogleSubject(...)
memberAccountStore.createViewerGoogleMember(...)
```

with `googleAccountStore`.

Replace:

```kotlin
memberAccountStore.findPlatformAdmin(userId)
```

with:

```kotlin
platformAdminLookup.findPlatformAdmin(userId)
```

Apply the same pattern to:

- `AuthenticatedMemberResolver`: inject `MemberIdentityLookupPort`.
- `ResolveCurrentMemberService`: inject `MemberIdentityLookupPort` and `PlatformAdminLookupPort`.
- `InvitationService`: inject `MemberIdentityLookupPort` and `GoogleAccountStorePort`.
- `DevLoginMemberService`: inject `DevSeedMemberLookupPort`.
- `JdbcCurrentMemberAdapter`: inject `MemberIdentityLookupPort`.

- [x] **Step 4: Delete the old fat port**

```bash
git rm server/src/main/kotlin/com/readmates/auth/application/port/out/MemberAccountStorePort.kt
rg -n 'MemberAccountStorePort|memberAccountStore' server/src/main/kotlin server/src/test/kotlin
```

Expected: no production references to `MemberAccountStorePort`. Variable names may remain only if they now refer to a narrow port; prefer renaming them to the narrow dependency name.

- [x] **Step 5: Add an architecture guard**

Add this test to `ServerArchitectureBoundaryTest`:

```kotlin
@Test
fun `auth application services do not depend on removed fat member account port`() {
    val violations = applicationSourceFiles()
        .filter { sourceFile -> sourceFile.toString().contains("/auth/application/") }
        .flatMap { sourceFile ->
            sourceFile.readLines()
                .mapIndexedNotNull { index, line ->
                    if ("MemberAccountStorePort" in line) {
                        "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: ${line.trim()}"
                    } else {
                        null
                    }
                }
        }
        .sorted()

    assertTrue(
        violations.isEmpty(),
        "Auth application must depend on narrow outbound ports, not MemberAccountStorePort:\n${violations.joinToString("\n")}",
    )
}
```

- [x] **Step 6: Run server checks**

```bash
./server/gradlew -p server test \
  --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
  --tests com.readmates.auth.api.AuthMeControllerTest \
  --tests com.readmates.auth.api.GoogleOAuthLoginSessionTest \
  --tests com.readmates.auth.api.HostInvitationControllerTest \
  --tests com.readmates.auth.api.HostMemberLifecycleControllerTest \
  --tests com.readmates.auth.api.MemberProfileControllerTest
./server/gradlew -p server clean test
```

Expected: targeted auth tests and full server test pass.

- [x] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth \
        server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "refactor: split auth account outbound ports"
```

---

## PR 3: Session Port and Service Segregation

### Scope

Split host session outbound responsibility and reduce `HostSessionCommandService` reasons to change.

### Files

- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionQueryPort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionDraftPort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionLifecyclePort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionPublicationPort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionAttendancePort.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionDeletionPort.kt`
- Delete: `server/src/main/kotlin/com/readmates/session/application/port/out/HostSessionWritePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/JdbcHostSessionWriteAdapter.kt`
- Split: `server/src/main/kotlin/com/readmates/session/application/service/HostSessionCommandService.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

### Steps

- [x] **Step 1: Create split outbound ports**

Use the existing method signatures, grouped by responsibility:

```kotlin
interface HostSessionQueryPort {
    fun list(host: CurrentMember, pageRequest: PageRequest): CursorPage<HostSessionListItem>
    fun detail(command: HostSessionIdCommand): HostSessionDetailResponse
    fun dashboard(host: CurrentMember): HostDashboardResult
    fun upcoming(member: CurrentMember): List<UpcomingSessionItem>
}

interface HostSessionDraftPort {
    fun create(command: HostSessionCommand): CreatedSessionResponse
    fun update(command: UpdateHostSessionCommand): HostSessionDetailResponse
    fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse
}

interface HostSessionLifecyclePort {
    fun open(command: HostSessionIdCommand): HostSessionTransitionResult
    fun close(command: HostSessionIdCommand): HostSessionTransitionResult
    fun publish(command: HostSessionIdCommand): HostSessionTransitionResult
}

interface HostSessionDeletionPort {
    fun deletionPreview(command: HostSessionIdCommand): HostSessionDeletionPreviewResponse
    fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse
}

interface HostSessionAttendancePort {
    fun confirmAttendance(command: ConfirmAttendanceCommand): HostAttendanceResponse
}

interface HostSessionPublicationPort {
    fun upsertPublication(command: UpsertPublicationCommand): HostPublicationResponse
}
```

Keep `HostSessionTransitionResult` in `HostSessionLifecyclePort.kt`.

- [x] **Step 2: Update the JDBC adapter**

Change `JdbcHostSessionWriteAdapter` to implement all split ports:

```kotlin
) : HostSessionQueryPort,
    HostSessionDraftPort,
    HostSessionLifecyclePort,
    HostSessionDeletionPort,
    HostSessionAttendancePort,
    HostSessionPublicationPort {
```

Keep method bodies unchanged. Remove `HostSessionWritePort` import.

- [x] **Step 3: Split application services**

Replace `HostSessionCommandService` with focused classes in the same package:

- `HostSessionQueryService`: implements `HostSessionDraftUseCase` read methods `list/detail`, `ListUpcomingSessionsUseCase`, `GetHostDashboardUseCase`; injects `HostSessionQueryPort`.
- `HostSessionDraftCommandService`: implements `HostSessionDraftUseCase` write methods `create/update`; injects `HostSessionDraftPort` and cache invalidation.
- `HostSessionLifecycleService`: implements `HostSessionLifecycleUseCase`; injects `HostSessionLifecyclePort`, `HostSessionDeletionPort`, `HostSessionDraftPort` for `updateVisibility`, cache invalidation, and notification recorder.
- `HostSessionAttendanceService`: implements `ConfirmAttendanceUseCase`; injects `HostSessionAttendancePort`.
- `HostSessionPublicationService`: implements `UpsertPublicationUseCase`; injects `HostSessionPublicationPort`.

Do not create duplicate beans for the same inbound method. The easiest safe split is to remove `HostSessionCommandService` after the new classes compile.

- [x] **Step 4: Add a no-fat-port architecture guard**

Add to `ServerArchitectureBoundaryTest`:

```kotlin
@Test
fun `session application does not depend on removed host session fat port`() {
    val violations = applicationSourceFiles()
        .filter { sourceFile -> sourceFile.toString().contains("/session/application/") }
        .flatMap { sourceFile ->
            sourceFile.readLines().mapIndexedNotNull { index, line ->
                if ("HostSessionWritePort" in line) {
                    "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: ${line.trim()}"
                } else {
                    null
                }
            }
        }
        .sorted()

    assertTrue(
        violations.isEmpty(),
        "Session application must use split host session outbound ports:\n${violations.joinToString("\n")}",
    )
}
```

- [x] **Step 5: Run focused session checks**

```bash
./server/gradlew -p server test \
  --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
  --tests com.readmates.session.application.service.HostSessionCommandServiceTest \
  --tests com.readmates.session.api.HostSessionControllerDbTest \
  --tests com.readmates.session.api.HostDashboardControllerTest \
  --tests com.readmates.session.api.CurrentSessionControllerDbTest \
  --tests com.readmates.publication.api.PublicControllerDbTest \
  --tests com.readmates.archive.api.ArchiveControllerDbTest
./server/gradlew -p server clean test
```

If `HostSessionCommandServiceTest` is renamed as part of the split, keep the test class behavior and update the `--tests` selector to the new class names in the PR notes.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/session \
        server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt \
        server/src/test/kotlin/com/readmates/session
git commit -m "refactor: split host session application ports"
```

---

## PR 4: Notification Delivery Port Segregation

### Scope

Remove default failing methods from `NotificationDeliveryPort` and split delivery responsibilities.

### Files

- Delete: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationDeliveryPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationDeliveryPlanningPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationDeliveryClaimPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationDeliveryStatusPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/NotificationDeliveryBacklogPort.kt`
- Create: `server/src/main/kotlin/com/readmates/notification/application/port/out/HostNotificationDeliveryLedgerPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/application/service/*.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

### Steps

- [x] **Step 1: Create split notification delivery ports**

Use these contracts:

```kotlin
interface NotificationDeliveryPlanningPort {
    fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem>
}

interface NotificationDeliveryClaimPort {
    fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem?
    fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem>
    fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem>
    fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem?
}

interface NotificationDeliveryStatusPort {
    fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus?
    fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean
    fun markDeliveryFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean
    fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean
    fun restoreDeadEmailDeliveryForClub(clubId: UUID, id: UUID): Boolean
}

interface NotificationDeliveryBacklogPort {
    fun deliveryBacklog(): NotificationDeliveryBacklog
    fun countByStatus(clubId: UUID, channel: NotificationChannel?, status: NotificationDeliveryStatus): Int
}

interface HostNotificationDeliveryLedgerPort {
    fun hostSummary(clubId: UUID): HostNotificationSummary
    fun listHostEmailItems(clubId: UUID, query: HostNotificationItemQuery, pageRequest: PageRequest): HostNotificationItemList
    fun hostEmailDetail(clubId: UUID, id: UUID): HostNotificationDetail?
    fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        pageRequest: PageRequest,
    ): CursorPage<HostNotificationDelivery>
}
```

- [x] **Step 2: Update adapter and services**

Make `JdbcNotificationDeliveryAdapter` implement all split interfaces. Update service constructors:

- `NotificationDispatchService`: `NotificationDeliveryPlanningPort`, `NotificationDeliveryStatusPort`, `NotificationDeliveryTransactionalOperations`.
- `NotificationDeliveryEngine`: `NotificationDeliveryStatusPort`.
- `NotificationDeliveryTransactionalOperations`: planning and claim ports.
- `CachedNotificationBacklogProvider`: `NotificationDeliveryBacklogPort`.
- `HostNotificationOperationsService`: `HostNotificationDeliveryLedgerPort`, `NotificationDeliveryStatusPort` where needed.

Remove the nullable default from `CachedNotificationBacklogProvider`:

```kotlin
class CachedNotificationBacklogProvider(
    private val port: NotificationDeliveryBacklogPort,
)
```

- [x] **Step 3: Delete default failing API**

Delete `NotificationDeliveryPort.kt` and verify:

```bash
rg -n 'NotificationDeliveryPort|planDeliveries\\(|error\\("Host notification' server/src/main/kotlin server/src/test/kotlin
```

Expected: no matches.

- [x] **Step 4: Add an architecture guard for default failure methods in outbound ports**

Add to `ServerArchitectureBoundaryTest`:

```kotlin
@Test
fun `outbound ports do not provide default runtime failure implementations`() {
    val violations = Files.walk(sourceRoot())
        .use { paths ->
            paths
                .filter { it.name.endsWith("Port.kt") }
                .flatMap { sourceFile ->
                    sourceFile.readLines().mapIndexedNotNull { index, line ->
                        if ("= error(" in line || "= throw" in line) {
                            "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: ${line.trim()}"
                        } else {
                            null
                        }
                    }.stream()
                }
                .toList()
        }
        .sorted()

    assertTrue(
        violations.isEmpty(),
        "Outbound ports must not hide unsupported behavior behind default runtime failures:\n${violations.joinToString("\n")}",
    )
}
```

- [x] **Step 5: Run notification checks**

```bash
./server/gradlew -p server test \
  --tests com.readmates.architecture.ServerArchitectureBoundaryTest \
  --tests 'com.readmates.notification.*'
./server/gradlew -p server clean test
```

Expected: notification focused tests and full server suite pass.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification \
        server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "refactor: split notification delivery ports"
```

---

## PR 5: Notification Persistence Helper Split

### Scope

After PR 4, split SQL helpers by the new port responsibilities.

### Files

- Split: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryQueries.kt`
- Split: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryWriteOperations.kt`
- Modify: `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationDeliveryAdapter.kt`

### Steps

- [x] **Step 1: Create responsibility-specific helpers**

Create these files and move existing methods without changing SQL text:

- `NotificationDeliveryBacklogQueries.kt`: `deliveryBacklog`, `countByStatus`.
- `HostNotificationLedgerQueries.kt`: `hostSummary`, `listHostEmailItems`, `hostEmailDetail`, `listHostDeliveries`, `latestFailures`.
- `NotificationDeliveryPlanningOperations.kt`: `persistPlannedDeliveries`, `insertDeliveryRows`, `insertMemberNotifications`, recipient planning helpers.
- `NotificationDeliveryClaimOperations.kt`: `claimEmailDelivery`, `claimEmailDeliveries`, `claimEmailDeliveriesForClub`, `claimHostEmailDelivery`, `claimedDeliveryItems`, stale sending reset.
- `NotificationDeliveryStatusOperations.kt`: `findDeliveryStatus`, `markDeliverySent`, `markDeliveryFailed`, `markDeliveryDead`, `restoreDeadEmailDeliveryForClub`.

Keep `NotificationDeliveryRowMappers.kt` as the shared mapping dependency.

- [x] **Step 2: Wire helpers in the adapter**

`JdbcNotificationDeliveryAdapter` should own helper instances:

```kotlin
private val rowMappers = NotificationDeliveryRowMappers(objectMapper, appBaseUrl)
private val backlogQueries = NotificationDeliveryBacklogQueries()
private val ledgerQueries = HostNotificationLedgerQueries(rowMappers)
private val planningOperations = NotificationDeliveryPlanningOperations(rowMappers)
private val claimOperations = NotificationDeliveryClaimOperations(rowMappers)
private val statusOperations = NotificationDeliveryStatusOperations()
```

Each override should delegate to the matching helper. Do not keep a catch-all `queries` or `writeOperations` field.

- [x] **Step 3: Delete emptied helper files**

When no methods remain, delete:

```bash
git rm server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryQueries.kt
git rm server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/NotificationDeliveryWriteOperations.kt
```

Run:

```bash
rg -n 'NotificationDeliveryQueries|NotificationDeliveryWriteOperations' server/src/main/kotlin server/src/test/kotlin
```

Expected: no matches.

- [x] **Step 4: Run persistence and notification tests**

```bash
./server/gradlew -p server test \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationDeliveryAdapterTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest \
  --tests com.readmates.notification.api.HostNotificationControllerTest \
  --tests com.readmates.notification.application.service.NotificationDispatchServiceTest \
  --tests 'com.readmates.notification.*'
```

Expected: all targeted notification tests pass.

- [x] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/notification/adapter/out/persistence \
        server/src/test/kotlin/com/readmates/notification
git commit -m "refactor: split notification delivery persistence helpers"
```

---

## PR 6: Large UI File Splits

### Scope

Split large frontend UI files after boundary cleanup, with no product behavior changes.

### Files

- Split: `front/features/archive/ui/archive-page.tsx`
- Split: `front/features/current-session/ui/current-session-mobile.tsx`
- Split: `front/features/host/ui/host-notifications-page.tsx`
- Split: `front/features/host/ui/host-session-editor.tsx`

### Steps

- [x] **Step 1: Split archive page by section**

Create:

- `front/features/archive/ui/archive-page-shell.tsx`: top-level `ArchivePage`, tab focus helpers, `ArchiveSelectedSection`.
- `front/features/archive/ui/archive-desktop.tsx`: `ArchiveDesktop`, desktop list components.
- `front/features/archive/ui/archive-mobile.tsx`: `ArchiveMobile`, mobile section intro, mobile list components.
- `front/features/archive/ui/archive-empty-state.tsx`: `EmptyState`, `MobileEmptyState`, load-more buttons.

Keep `front/features/archive/ui/archive-page.tsx` as a thin re-export during the PR:

```ts
export { default } from "./archive-page-shell";
export type { ArchiveView } from "./archive-page-shell";
```

- [x] **Step 2: Split current-session mobile**

Create:

- `front/features/current-session/ui/mobile/current-session-mobile-board.tsx`
- `front/features/current-session/ui/mobile/mobile-prep-segment.tsx`
- `front/features/current-session/ui/mobile/mobile-board-segment.tsx`
- `front/features/current-session/ui/mobile/mobile-records-segment.tsx`
- `front/features/current-session/ui/mobile/mobile-session-tabs.ts`

Keep `front/features/current-session/ui/current-session-mobile.tsx` as the public export owner:

```ts
export { MobileCurrentSessionBoard } from "./mobile/current-session-mobile-board";
export type { MobileSessionTab } from "./mobile/mobile-session-tabs";
```

- [x] **Step 3: Split host notifications page**

Create:

- `front/features/host/ui/notifications/host-notifications-summary.tsx`
- `front/features/host/ui/notifications/notification-ledger-tabs.tsx`
- `front/features/host/ui/notifications/notification-event-ledger.tsx`
- `front/features/host/ui/notifications/notification-delivery-ledger.tsx`
- `front/features/host/ui/notifications/restore-notification-dialog.tsx`
- `front/features/host/ui/notifications/notification-formatters.ts`

Keep `HostNotificationsPage` in `host-notifications-page.tsx` as the composition component.

- [x] **Step 4: Split host session editor composition**

Move top-level local types and actions that are not presentation markup to:

- `front/features/host/ui/session-editor/session-editor-actions.ts`
- `front/features/host/ui/session-editor/session-editor-links.tsx`
- `front/features/host/ui/session-editor/session-editor-feedback.ts`

Keep `host-session-editor.tsx` as the page shell that wires reducer state, actions, and subpanels.

- [x] **Step 5: Run frontend checks and responsive inspection**

```bash
pnpm --dir front exec vitest run \
  tests/unit/archive-page.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/host-notifications.test.tsx \
  tests/unit/host-session-editor.test.tsx \
  tests/unit/frontend-boundaries.test.ts
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Manual or browser inspection targets:

- `/clubs/reading-sai/app/archive?view=sessions`
- `/clubs/reading-sai/app/session/current`
- `/clubs/reading-sai/app/host/notifications`
- `/clubs/reading-sai/app/host/sessions/new`

Record in the PR notes whether browser inspection ran. If not, include the reason.

- [x] **Step 6: Commit**

```bash
git add front/features/archive/ui \
        front/features/current-session/ui \
        front/features/host/ui \
        front/tests/unit
git commit -m "refactor: split large frontend UI modules"
```

---

## PR 7: Maintenance Hygiene

### Scope

Clean up low-risk confusion left by previous architecture work.

### Files

- Modify: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/support/ReadmatesMySqlSeedTest.kt`
- Modify: `server/Dockerfile`
- Modify: `server/Dockerfile.release`
- Modify: `docs/deploy/oci-backend.md`
- Modify: `docs/development/test-guide.md`

### Steps

- [x] **Step 1: Remove stale JPA test property**

In both MySQL support tests, remove this `@TestPropertySource` entry:

```kotlin
"spring.jpa.hibernate.ddl-auto=validate",
```

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.support.MySqlFlywayMigrationTest \
  --tests com.readmates.support.ReadmatesMySqlSeedTest
```

Expected: both tests pass.

- [x] **Step 2: Document the intentional Dockerfile split**

Keep both Dockerfiles in this PR. `Dockerfile.release` intentionally consumes the CI-built jar before image scanning, while `Dockerfile` remains the local reproducible multi-stage build. Add this note to `docs/deploy/oci-backend.md`:

```markdown
`server/Dockerfile` is the local reproducible multi-stage image build. `server/Dockerfile.release` is used by the server image publish workflow after `clean test bootJar` so the scanned digest contains the exact CI-tested jar. Runtime instructions in both files must stay aligned.
```

Add this note to `docs/development/test-guide.md` near backend build/image guidance:

```markdown
For local image reproducibility use `docker build -t readmates-server:local server`, which uses `server/Dockerfile`. The release workflow uses `server/Dockerfile.release` after CI builds the jar, then scans and promotes the same digest.
```

- [x] **Step 3: Verify Dockerfile runtime instructions manually**

Compare the runtime sections in `server/Dockerfile` and `server/Dockerfile.release`. They must both use:

```dockerfile
FROM eclipse-temurin:21-jre-jammy
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates
WORKDIR /app
RUN chown -R readmates:readmates /app
USER readmates
EXPOSE 8080 8081
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/readmates-server.jar"]
```

The only expected difference is how `/app/readmates-server.jar` is copied into the runtime image.

- [x] **Step 4: Run docs and backend checks**

```bash
git diff --check -- docs/deploy/oci-backend.md docs/development/test-guide.md
./server/gradlew -p server test \
  --tests com.readmates.support.MySqlFlywayMigrationTest \
  --tests com.readmates.support.ReadmatesMySqlSeedTest
```

If Docker is available:

```bash
docker build -t readmates-server:local server
```

Expected: docs diff check passes, support tests pass, and local Docker build passes when Docker is available.

- [x] **Step 5: Commit**

```bash
git add server/src/test/kotlin/com/readmates/support \
        docs/deploy/oci-backend.md \
        docs/development/test-guide.md
git commit -m "chore: clarify server persistence and image build hygiene"
```

---

## Final Verification Matrix

After all PRs land on the same branch, run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
git diff --check
```

If any PR touches BFF/auth route behavior, also run:

```bash
pnpm --dir front test:e2e
```

If preparing a public release candidate, run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Completion criteria:

- Frontend boundary test fails before PR 1 fixes and passes after.
- No production source imports `features/*/components`.
- No production source references `MemberAccountStorePort`, `HostSessionWritePort`, or `NotificationDeliveryPort`.
- Server ArchUnit boundary test passes after each server PR.
- No API route, DB migration, auth policy, or public visibility behavior changes are introduced by these refactors.
