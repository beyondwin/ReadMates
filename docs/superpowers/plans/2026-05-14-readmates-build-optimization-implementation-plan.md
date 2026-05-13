# ReadMates Build Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce repeat server build overhead, make server image layers cacheable, and shrink the frontend initial route bundle without changing product behavior.

**Architecture:** Keep the existing Vite route-first frontend and single-module Spring Boot server. Apply low-risk build configuration first, then Docker layering, then frontend route lazy imports with route tests and bundle measurements.

**Tech Stack:** React 19, React Router 7, Vite 8/Rolldown, pnpm 10, Kotlin 2.2, Spring Boot 4, Gradle 9.1, Docker Buildx.

---

## File Map

- Create: `server/gradle.properties`
  - Enables Gradle configuration cache for the server module.
- Modify: `server/build.gradle.kts`
  - Disables the plain jar task so `bootJar` remains the sole server jar artifact.
- Modify: `server/Dockerfile`
  - Keeps local multi-stage build but extracts Spring Boot jar layers before runtime copy.
- Modify: `server/Dockerfile.release`
  - Uses the CI-built boot jar and extracts layers for cacheable image builds.
- Modify: `front/src/app/router.tsx`
  - Replaces selected static page/loader imports with route `lazy` imports.
- Modify: `front/src/app/host-route-elements.tsx`
  - Replaces `@/features/host` barrel import with exact route module imports.
- Optional modify: deploy docs under `docs/deploy/`
  - Only update if Dockerfile runtime behavior documentation becomes inaccurate.

## Task 1: Baseline Current Build Outputs

**Files:**
- Read: `front/vite.config.ts`
- Read: `front/src/app/router.tsx`
- Read: `server/build.gradle.kts`
- Read: `server/Dockerfile`
- Read: `server/Dockerfile.release`

- [ ] **Step 1: Confirm working tree state**

Run:

```bash
git status --short
```

Expected: note existing user/WIP changes. Do not revert unrelated changes.

- [ ] **Step 2: Measure frontend build**

Run:

```bash
pnpm --dir front build
find front/dist/assets -maxdepth 1 -type f -name '*.js' -print0 | xargs -0 du -h | sort -h
find front/dist/assets -maxdepth 1 -type f -name '*.css' -print0 | xargs -0 du -h | sort -h
```

Expected: `vite build` succeeds and prints chunk sizes. Record `index`, `vendor`, `host`, and CSS chunk sizes.

- [ ] **Step 3: Measure server boot jar**

Run:

```bash
./server/gradlew -p server clean bootJar -x test
ls -lh server/build/libs
jar tf server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar | rg 'BOOT-INF/layers.idx|org/springframework/boot/loader/launch/JarLauncher.class'
```

Expected: `BUILD SUCCESSFUL`; boot jar exists; jar contains `BOOT-INF/layers.idx` and `JarLauncher.class`.

- [ ] **Step 4: Commit**

No commit for Task 1 unless baseline notes are intentionally written to a document. If no file changed, continue.

## Task 2: Enable Server Gradle Configuration Cache

**Files:**
- Create: `server/gradle.properties`

- [ ] **Step 1: Add Gradle properties**

Create `server/gradle.properties` with exactly:

```properties
org.gradle.configuration-cache=true
```

- [ ] **Step 2: Verify bootJar stores the cache**

Run:

```bash
./server/gradlew -p server clean bootJar -x test
```

Expected: `BUILD SUCCESSFUL` and a configuration cache entry is stored.

- [ ] **Step 3: Verify bootJar reuses the cache**

Run:

```bash
./server/gradlew -p server bootJar -x test
```

Expected: `Reusing configuration cache.` appears and `BUILD SUCCESSFUL`.

- [ ] **Step 4: Verify test task graph compatibility**

Run:

```bash
./server/gradlew -p server test --dry-run
```

Expected: `BUILD SUCCESSFUL`; no configuration cache incompatibility report.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/gradle.properties
git commit -m "build: enable server Gradle configuration cache"
```

Expected: commit succeeds. If this plan is executed inside a larger uncommitted branch where commits are intentionally deferred, stage only this file and record the reason.

## Task 3: Keep Only the Server Boot Jar Artifact

**Files:**
- Modify: `server/build.gradle.kts`

- [ ] **Step 1: Disable plain jar**

Add this block after the `dependencies` block and before `val colimaDockerSocket`:

```kotlin
tasks.named<org.gradle.jvm.tasks.Jar>("jar") {
    enabled = false
}
```

- [ ] **Step 2: Verify boot jar still builds**

Run:

```bash
./server/gradlew -p server clean bootJar -x test
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Verify plain jar is gone**

Run:

```bash
test -f server/build/libs/readmates-server-0.0.1-SNAPSHOT.jar
test ! -e server/build/libs/readmates-server-0.0.1-SNAPSHOT-plain.jar
ls -lh server/build/libs
```

Expected: boot jar exists; plain jar does not exist.

- [ ] **Step 4: Verify compile/test graph still resolves**

Run:

```bash
./server/gradlew -p server test --dry-run
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/build.gradle.kts
git commit -m "build: keep server boot jar as sole jar artifact"
```

Expected: commit succeeds or is intentionally deferred with a written note.

## Task 4: Convert Server Dockerfiles to Layered Jar Layout

**Files:**
- Modify: `server/Dockerfile`
- Modify: `server/Dockerfile.release`

- [ ] **Step 1: Update `server/Dockerfile.release`**

Replace the whole file with:

```dockerfile
FROM eclipse-temurin:21-jre-jammy AS layers

WORKDIR /layers
COPY build/libs/readmates-server-0.0.1-SNAPSHOT.jar readmates-server.jar
RUN java -Djarmode=layertools -jar readmates-server.jar extract

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates

WORKDIR /app
COPY --from=layers /layers/dependencies/ ./
COPY --from=layers /layers/spring-boot-loader/ ./
COPY --from=layers /layers/snapshot-dependencies/ ./
COPY --from=layers /layers/application/ ./
RUN chown -R readmates:readmates /app

USER readmates
EXPOSE 8080 8081

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "org.springframework.boot.loader.launch.JarLauncher"]
```

- [ ] **Step 2: Update `server/Dockerfile`**

Replace the whole file with:

```dockerfile
FROM eclipse-temurin:21-jdk-jammy AS builder

WORKDIR /build
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-jammy AS layers

WORKDIR /layers
COPY --from=builder /build/build/libs/readmates-server-0.0.1-SNAPSHOT.jar readmates-server.jar
RUN java -Djarmode=layertools -jar readmates-server.jar extract

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates

WORKDIR /app
COPY --from=layers /layers/dependencies/ ./
COPY --from=layers /layers/spring-boot-loader/ ./
COPY --from=layers /layers/snapshot-dependencies/ ./
COPY --from=layers /layers/application/ ./
RUN chown -R readmates:readmates /app

USER readmates
EXPOSE 8080 8081

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "org.springframework.boot.loader.launch.JarLauncher"]
```

- [ ] **Step 3: Build jar for release Dockerfile context**

Run:

```bash
./server/gradlew -p server clean bootJar -x test
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Build release image locally**

Run:

```bash
docker build -f server/Dockerfile.release -t readmates-server:layered-release server
```

Expected: Docker build succeeds.

- [ ] **Step 5: Verify release image layout**

Run:

```bash
docker run --rm --entrypoint sh readmates-server:layered-release -c 'test -f org/springframework/boot/loader/launch/JarLauncher.class && test -d BOOT-INF/classes && test -d BOOT-INF/lib'
```

Expected: command exits 0.

- [ ] **Step 6: Build local multi-stage image**

Run:

```bash
docker build -f server/Dockerfile -t readmates-server:layered-local server
```

Expected: Docker build succeeds.

- [ ] **Step 7: Commit**

Run:

```bash
git add server/Dockerfile server/Dockerfile.release
git commit -m "build: layer server Docker images"
```

Expected: commit succeeds or is intentionally deferred with a written note.

## Task 5: Lazy Load Public and Admin Frontend Routes

**Files:**
- Modify: `front/src/app/router.tsx`

- [ ] **Step 1: Remove static page/admin imports**

Remove these imports from the top of `front/src/app/router.tsx`:

```tsx
import { publicClubLoader, publicSessionLoader } from "@/features/public/route/public-route-data";
import { platformAdminLoader } from "@/features/platform-admin/route/platform-admin-data";
import { PlatformAdminRoute } from "@/features/platform-admin/route/platform-admin-route";
import AboutPage from "@/src/pages/about";
import InvitePage from "@/src/pages/invite";
import LoginPage from "@/src/pages/login";
import PublicHomePage from "@/src/pages/public-home";
import PublicRecordsPage from "@/src/pages/public-records";
import PublicSessionPage from "@/src/pages/public-session";
import ResetPasswordPage from "@/src/pages/reset-password";
```

Keep `PublicRouteError`, `RequirePlatformAdmin`, and `ReadmatesRouteLoading`.

- [ ] **Step 2: Convert public home route**

Replace the unscoped `/` route object with:

```tsx
{
  path: "/",
  errorElement: <PublicRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="공개 홈을 불러오는 중" variant="public" />,
  lazy: async () => {
    const [{ default: PublicHomePage }, { publicClubLoader }] = await Promise.all([
      import("@/src/pages/public-home"),
      import("@/features/public/route/public-route-data"),
    ]);
    return { Component: PublicHomePage, loader: publicClubLoader };
  },
}
```

- [ ] **Step 3: Convert public about route**

Use this route object for `/about` and `/clubs/:clubSlug/about`:

```tsx
{
  path: "/about",
  errorElement: <PublicRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="클럽 소개를 불러오는 중" variant="public" />,
  lazy: async () => {
    const [{ default: AboutPage }, { publicClubLoader }] = await Promise.all([
      import("@/src/pages/about"),
      import("@/features/public/route/public-route-data"),
    ]);
    return { Component: AboutPage, loader: publicClubLoader };
  },
}
```

For the club-scoped copy, keep the same body and change only `path` to `"/clubs/:clubSlug/about"`.

- [ ] **Step 4: Convert public records route**

Use this route object for `/records` and `/clubs/:clubSlug/records`:

```tsx
{
  path: "/records",
  errorElement: <PublicRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="공개 기록을 불러오는 중" variant="public" />,
  lazy: async () => {
    const [{ default: PublicRecordsPage }, { publicClubLoader }] = await Promise.all([
      import("@/src/pages/public-records"),
      import("@/features/public/route/public-route-data"),
    ]);
    return { Component: PublicRecordsPage, loader: publicClubLoader };
  },
}
```

For the club-scoped copy, keep the same body and change only `path` to `"/clubs/:clubSlug/records"`.

- [ ] **Step 5: Convert public session route**

Use this route object for `/sessions/:sessionId` and `/clubs/:clubSlug/sessions/:sessionId`:

```tsx
{
  path: "/sessions/:sessionId",
  errorElement: <PublicRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="공개 세션 기록을 불러오는 중" variant="public" />,
  lazy: async () => {
    const [{ default: PublicSessionPage }, { publicSessionLoader }] = await Promise.all([
      import("@/src/pages/public-session"),
      import("@/features/public/route/public-route-data"),
    ]);
    return { Component: PublicSessionPage, loader: publicSessionLoader };
  },
}
```

For the club-scoped copy, keep the same body and change only `path` to `"/clubs/:clubSlug/sessions/:sessionId"`.

- [ ] **Step 6: Convert public club route**

Use this route object for `/clubs/:clubSlug`:

```tsx
{
  path: "/clubs/:clubSlug",
  errorElement: <PublicRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="공개 홈을 불러오는 중" variant="public" />,
  lazy: async () => {
    const [{ default: PublicHomePage }, { publicClubLoader }] = await Promise.all([
      import("@/src/pages/public-home"),
      import("@/features/public/route/public-route-data"),
    ]);
    return { Component: PublicHomePage, loader: publicClubLoader };
  },
}
```

- [ ] **Step 7: Convert simple auth/info routes**

Replace the login, invite, and reset route objects with:

```tsx
{
  path: "/login",
  lazy: async () => {
    const { default: LoginPage } = await import("@/src/pages/login");
    return { Component: LoginPage };
  },
},
{
  path: "/clubs/:clubSlug/invite/:token",
  lazy: async () => {
    const { default: InvitePage } = await import("@/src/pages/invite");
    return { Component: InvitePage };
  },
},
{
  path: "/invite/:token",
  lazy: async () => {
    const { default: InvitePage } = await import("@/src/pages/invite");
    return { Component: InvitePage };
  },
},
{
  path: "/reset-password/:token",
  lazy: async () => {
    const { default: ResetPasswordPage } = await import("@/src/pages/reset-password");
    return { Component: ResetPasswordPage };
  },
}
```

- [ ] **Step 8: Convert platform admin route**

Replace the `/admin` route object with:

```tsx
{
  path: "/admin",
  errorElement: <RouteErrorBoundary variant="auth" />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="플랫폼 관리를 불러오는 중" variant="member" />,
  lazy: async () => {
    const [{ PlatformAdminRoute }, { platformAdminLoader }] = await Promise.all([
      import("@/features/platform-admin/route/platform-admin-route"),
      import("@/features/platform-admin/route/platform-admin-data"),
    ]);

    function PlatformAdminRouteElement() {
      return (
        <RequirePlatformAdmin>
          <PlatformAdminRoute />
        </RequirePlatformAdmin>
      );
    }

    return { Component: PlatformAdminRouteElement, loader: platformAdminLoader };
  },
}
```

- [ ] **Step 9: Run targeted frontend tests**

Run:

```bash
pnpm --dir front test -- tests/unit/spa-router.test.tsx tests/unit/public-navigation-auth.test.tsx tests/unit/route-guards.test.tsx tests/unit/frontend-boundaries.test.ts
```

Expected: tests pass. If failures show route object shape changes, fix the route tests or implementation so behavior remains unchanged.

- [ ] **Step 10: Build and compare chunks**

Run:

```bash
pnpm --dir front build
find front/dist/assets -maxdepth 1 -type f -name '*.js' -print0 | xargs -0 du -h | sort -h
```

Expected: build passes and the initial `index` chunk is not larger than the Task 1 baseline.

- [ ] **Step 11: Commit**

Run:

```bash
git add front/src/app/router.tsx
git commit -m "build: lazy load public and admin routes"
```

Expected: commit succeeds or is intentionally deferred with a written note.

## Task 6: Lazy Load Member Routes That Currently Inflate the Router Chunk

**Files:**
- Modify: `front/src/app/router.tsx`

- [ ] **Step 1: Remove static member imports**

Remove these imports:

```tsx
import {
  CurrentSessionRoute,
  CurrentSessionRouteError,
  currentSessionAction,
  currentSessionLoader,
  type InternalLinkComponent,
} from "@/features/current-session";
import { clubSelectionLoader } from "@/features/club-selection/route/club-selection-data";
import { ClubSelectionRoute } from "@/features/club-selection/route/club-selection-route";
import { memberHomeLoader } from "@/features/member-home/route/member-home-data";
import { memberNotificationsLoader } from "@/features/notifications/route/member-notifications-data";
import { MemberNotificationsRoute } from "@/features/notifications/route/member-notifications-route";
import { myPageLoader } from "@/features/archive/route/my-page-data";
import {
  notesFeedLoader,
  notesFeedShouldRevalidate,
} from "@/features/archive/route/notes-feed-data";
import AppHomePage from "@/src/pages/app-home";
import MyRoutePage from "@/src/pages/my-page";
import NotesPage from "@/src/pages/notes";
import PendingApprovalPage from "@/src/pages/pending-approval";
```

Then add this type-only import:

```tsx
import type { InternalLinkComponent } from "@/features/current-session";
```

- [ ] **Step 2: Convert member home helper**

Replace `memberHomeRoute()` with:

```tsx
function memberHomeRoute(): RouteObject {
  return {
    index: true,
    errorElement: <ArchiveRouteError />,
    hydrateFallbackElement: <ReadmatesRouteLoading label="멤버 홈을 불러오는 중" variant="member" />,
    lazy: async () => {
      const [{ default: AppHomePage }, { memberHomeLoader }] = await Promise.all([
        import("@/src/pages/app-home"),
        import("@/features/member-home/route/member-home-data"),
      ]);
      return { Component: AppHomePage, loader: memberHomeLoader };
    },
  };
}
```

- [ ] **Step 3: Convert current session route**

Replace the `"session/current"` route object with:

```tsx
{
  path: "session/current",
  hydrateFallbackElement: <ReadmatesRouteLoading label="세션을 불러오는 중" variant="member" />,
  lazy: async () => {
    const {
      CurrentSessionRoute,
      CurrentSessionRouteError,
      currentSessionAction,
      currentSessionLoader,
    } = await import("@/features/current-session");

    function CurrentSessionRouteElement() {
      return <CurrentSessionRoute internalLinkComponent={currentSessionInternalLink} />;
    }

    return {
      Component: CurrentSessionRouteElement,
      ErrorBoundary: CurrentSessionRouteError,
      action: currentSessionAction,
      loader: currentSessionLoader,
    };
  },
}
```

- [ ] **Step 4: Convert notes route**

Replace the `"notes"` route object with:

```tsx
{
  path: "notes",
  errorElement: <ArchiveRouteError />,
  hydrateFallbackElement: <ArchiveRouteLoading label="클럽 노트를 불러오는 중" />,
  lazy: async () => {
    const [{ default: NotesPage }, { notesFeedLoader, notesFeedShouldRevalidate }] = await Promise.all([
      import("@/src/pages/notes"),
      import("@/features/archive/route/notes-feed-data"),
    ]);
    return {
      Component: NotesPage,
      loader: notesFeedLoader,
      shouldRevalidate: notesFeedShouldRevalidate,
    };
  },
}
```

- [ ] **Step 5: Convert my page route**

Replace the `"me"` route object with:

```tsx
{
  path: "me",
  errorElement: <ArchiveRouteError />,
  hydrateFallbackElement: <ArchiveRouteLoading label="내 공간을 불러오는 중" />,
  lazy: async () => {
    const [{ default: MyRoutePage }, { myPageLoader }] = await Promise.all([
      import("@/src/pages/my-page"),
      import("@/features/archive/route/my-page-data"),
    ]);
    return { Component: MyRoutePage, loader: myPageLoader };
  },
}
```

- [ ] **Step 6: Convert member notifications route**

Replace the `"notifications"` member route object with:

```tsx
{
  path: "notifications",
  errorElement: <ArchiveRouteError />,
  hydrateFallbackElement: <ArchiveRouteLoading label="알림을 불러오는 중" />,
  lazy: async () => {
    const [{ MemberNotificationsRoute }, { memberNotificationsLoader }] = await Promise.all([
      import("@/features/notifications/route/member-notifications-route"),
      import("@/features/notifications/route/member-notifications-data"),
    ]);
    return { Component: MemberNotificationsRoute, loader: memberNotificationsLoader };
  },
}
```

- [ ] **Step 7: Convert pending approval routes**

Replace both pending route objects with lazy wrappers. Use this body for `/app/pending` and change only `path` for `/clubs/:clubSlug/app/pending`:

```tsx
{
  path: "/app/pending",
  lazy: async () => {
    const { default: PendingApprovalPage } = await import("@/src/pages/pending-approval");

    function PendingApprovalRouteElement() {
      return (
        <RequireAuth>
          <PendingApprovalPage />
        </RequireAuth>
      );
    }

    return { Component: PendingApprovalRouteElement };
  },
}
```

- [ ] **Step 8: Convert club selection index route**

Replace the `/app` index child route with:

```tsx
{
  index: true,
  errorElement: <ArchiveRouteError />,
  hydrateFallbackElement: <ReadmatesRouteLoading label="클럽을 확인하는 중" variant="member" />,
  lazy: async () => {
    const [{ ClubSelectionRoute }, { clubSelectionLoader }] = await Promise.all([
      import("@/features/club-selection/route/club-selection-route"),
      import("@/features/club-selection/route/club-selection-data"),
    ]);

    function ClubSelectionRouteElement() {
      return (
        <RequireAuth>
          <ClubSelectionRoute />
        </RequireAuth>
      );
    }

    return { Component: ClubSelectionRouteElement, loader: clubSelectionLoader };
  },
}
```

- [ ] **Step 9: Run member route tests**

Run:

```bash
pnpm --dir front test -- tests/unit/spa-router.test.tsx tests/unit/member-app-access.test.ts tests/unit/member-notifications.test.tsx tests/unit/current-session.test.tsx tests/unit/notes-page.test.tsx tests/unit/my-page.test.tsx
```

Expected: tests pass.

- [ ] **Step 10: Build and compare chunks**

Run:

```bash
pnpm --dir front build
find front/dist/assets -maxdepth 1 -type f -name '*.js' -print0 | xargs -0 du -h | sort -h
```

Expected: build passes; initial `index` chunk is not larger than the Task 5 result.

- [ ] **Step 11: Commit**

Run:

```bash
git add front/src/app/router.tsx
git commit -m "build: lazy load member routes"
```

Expected: commit succeeds or is intentionally deferred with a written note.

## Task 7: Remove Host Feature Barrel Coupling From Lazy Loader Paths

**Files:**
- Modify: `front/src/app/router.tsx`
- Modify: `front/src/app/host-route-elements.tsx`

- [ ] **Step 1: Replace host route element imports**

In `front/src/app/host-route-elements.tsx`, replace the `@/features/host` import block with exact imports:

```tsx
import { HostDashboardRoute } from "@/features/host/route/host-dashboard-route";
import { HostInvitationsRoute } from "@/features/host/route/host-invitations-route";
import { HostMembersRoute } from "@/features/host/route/host-members-route";
import { HostNotificationsRoute } from "@/features/host/route/host-notifications-route";
import {
  EditHostSessionRoute,
  NewHostSessionRoute,
} from "@/features/host/route/host-session-editor-route";
```

- [ ] **Step 2: Replace host loader dynamic imports**

In `front/src/app/router.tsx`, replace each `import("@/features/host")` loader import with the exact data module:

```tsx
import("@/features/host/route/host-dashboard-data")
import("@/features/host/route/host-members-data")
import("@/features/host/route/host-invitations-data")
import("@/features/host/route/host-notifications-data")
import("@/features/host/route/host-session-editor-data")
```

Keep `HostRouteError` and `requireHostLoaderAuth` imports as they are unless bundle analysis shows they pull full host UI.

- [ ] **Step 3: Run host route tests**

Run:

```bash
pnpm --dir front test -- tests/unit/host-dashboard.test.tsx tests/unit/host-members.test.tsx tests/unit/host-invitations.test.tsx tests/unit/host-notifications.test.tsx tests/unit/host-session-editor.test.tsx
```

Expected: tests pass.

- [ ] **Step 4: Build and inspect host chunk**

Run:

```bash
pnpm --dir front build
find front/dist/assets -maxdepth 1 -type f -name '*host*.js' -print0 | xargs -0 du -h | sort -h
```

Expected: build passes. Host chunk may remain one chunk because `host-route-elements.tsx` still imports all host route elements; this task is still useful because it removes the broad barrel import.

- [ ] **Step 5: Commit**

Run:

```bash
git add front/src/app/router.tsx front/src/app/host-route-elements.tsx
git commit -m "build: avoid host feature barrel in route lazy imports"
```

Expected: commit succeeds or is intentionally deferred with a written note.

## Task 8: Full Verification

**Files:**
- All changed files from Tasks 2-7.

- [ ] **Step 1: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all commands pass.

- [ ] **Step 2: Run server checks**

Run:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server bootJar -x test
```

Expected: both commands pass; second command reuses configuration cache.

- [ ] **Step 3: Run Docker checks**

Run:

```bash
docker build -f server/Dockerfile.release -t readmates-server:layered-release server
docker run --rm --entrypoint sh readmates-server:layered-release -c 'test -f org/springframework/boot/loader/launch/JarLauncher.class && test -d BOOT-INF/classes && test -d BOOT-INF/lib'
docker build -f server/Dockerfile -t readmates-server:layered-local server
```

Expected: all commands pass.

- [ ] **Step 4: Run doc whitespace check if docs changed**

Run:

```bash
git diff --check -- docs/superpowers/specs/2026-05-14-readmates-build-optimization-detailed-implementation.md docs/superpowers/plans/2026-05-14-readmates-build-optimization-implementation-plan.md
```

Expected: no output and exit 0.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --stat
git diff -- server/gradle.properties server/build.gradle.kts server/Dockerfile server/Dockerfile.release front/src/app/router.tsx front/src/app/host-route-elements.tsx
```

Expected: diff only contains build optimization changes described in this plan.

- [ ] **Step 6: Final commit**

If earlier tasks were not committed individually, run:

```bash
git add server/gradle.properties server/build.gradle.kts server/Dockerfile server/Dockerfile.release front/src/app/router.tsx front/src/app/host-route-elements.tsx
git commit -m "build: optimize front and server builds"
```

Expected: commit succeeds.

## Follow-Up Work Not Included

- Add `typecheck` script and make `tsc --noEmit` pass across front source, Cloudflare Functions, and tests.
- Split host route element modules into one file per host screen if the host chunk continues growing.
- Evaluate `org.gradle.caching=true` after deciding whether CI should ever reuse test task outputs.
- Add bundle size budget reporting to CI if chunk growth becomes a repeated issue.

## Self-Review

- Spec coverage: server Gradle cache, plain jar cleanup, Docker layering, frontend route lazy splitting, host barrel reduction, and verification are mapped to tasks.
- Placeholder scan: no task uses placeholder markers, deferred implementation language, or unspecified test commands.
- Type consistency: route snippets use existing React Router lazy return keys `Component`, `ErrorBoundary`, `loader`, `action`, and `shouldRevalidate`; server snippets use existing Gradle/Spring Boot artifact names.
