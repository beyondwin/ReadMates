# Admin vNext — S1 IA Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

```yaml waygent-task
id: phase_1_models
title: Phase 1 — Implement Tasks 1-4 (permission matrix, admin-route-catalog SSOT, status strip metric derivation, workbench model AI-item merge). Do not create git commits from the task worktree.
dependencies: []
file_claims:
  - path: front/features/platform-admin/model/platform-admin-permissions.ts
    mode: owned
  - path: front/features/platform-admin/model/platform-admin-permissions.test.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-route-catalog.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-route-catalog.test.ts
    mode: owned
  - path: front/features/platform-admin/model/admin-status-strip-model.ts
    mode: owned
  - path: front/features/platform-admin/model/admin-status-strip-model.test.ts
    mode: owned
  - path: front/features/platform-admin/model/platform-admin-workbench-model.ts
    mode: owned
  - path: front/features/platform-admin/model/platform-admin-workbench-model.test.ts
    mode: owned
risk: low
verify_isolation: fast
verify:
  - pnpm install --frozen-lockfile --prefer-offline
  - pnpm --dir front test -- --run features/platform-admin/model features/platform-admin/route/admin-route-catalog.test.ts
  - pnpm --dir front lint
instructions:
  - Implement Tasks 1, 2, 3, and 4 in this single worker invocation following the detailed steps in the plan body below.
  - Write the failing tests first, then implement, per the existing TDD steps.
  - Do not execute the per-task `git add` / `git commit` shell snippets — leave changes uncommitted so waygent apply lands them.
```

```yaml waygent-task
id: phase_2_server_seed
title: Phase 2 — Implement Tasks 5-6 (SQL dev seed for admin accounts, dev-login adapter whitelist). Do not create git commits from the task worktree.
dependencies: [phase_1_models]
file_claims:
  - path: server/src/main/resources/db/dev/R__readmates_dev_seed.sql
    mode: owned
  - path: server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql
    mode: owned
  - path: server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapterDevSeedTest.kt
    mode: owned
  - path: server/src/test/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapterDevSeedAllowListTest.kt
    mode: owned
risk: medium
verify_isolation: fast
verify:
  - ./gradlew :server:test --tests "com.readmates.auth.adapter.out.persistence.JdbcMemberAccountAdapterDevSeedTest" --tests "com.readmates.auth.adapter.out.persistence.JdbcMemberAccountAdapterDevSeedAllowListTest"
instructions:
  - Implement Tasks 5 and 6 in this single worker invocation following the detailed steps in the plan body below.
  - Keep `Repeatable` SQL idempotent. Whitelist the three admin emails in the dev-login adapter behind the existing dev profile guard.
  - Do not execute the per-task `git add` / `git commit` shell snippets — leave changes uncommitted so waygent apply lands them.
```

```yaml waygent-task
id: phase_3_ui_components
title: Phase 3 — Implement Tasks 7-11 (AdminComingSoon, AdminStatusStrip, AdminLayoutNav, AdminBreadcrumb, AdminOnboardingModal). Do not create git commits from the task worktree.
dependencies: [phase_1_models]
file_claims:
  - path: front/features/platform-admin/ui/admin-coming-soon.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-coming-soon.test.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-status-strip.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-status-strip.test.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-layout-nav.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-layout-nav.test.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-breadcrumb.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-breadcrumb.test.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-onboarding-modal.tsx
    mode: owned
  - path: front/features/platform-admin/ui/admin-onboarding-modal.test.tsx
    mode: owned
risk: low
verify_isolation: fast
verify:
  - pnpm install --frozen-lockfile --prefer-offline
  - pnpm --dir front test -- --run features/platform-admin/ui
  - pnpm --dir front lint
instructions:
  - Implement Tasks 7, 8, 9, 10, and 11 in this single worker invocation following the detailed steps in the plan body below.
  - Build each component test-first. Korean copy is the default for user-facing strings.
  - Do not execute the per-task `git add` / `git commit` shell snippets — leave changes uncommitted so waygent apply lands them.
```

```yaml waygent-task
id: phase_4_route_shell
title: Phase 4 — Implement Tasks 12-14 (AdminShellLayout loader + component + breadcrumb context, AdminComingSoonRoute). Do not create git commits from the task worktree.
dependencies: [phase_3_ui_components]
file_claims:
  - path: front/features/platform-admin/route/admin-shell-data.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-shell-layout.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-shell-layout.test.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-breadcrumb-context.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-coming-soon-route.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-coming-soon-route.test.tsx
    mode: owned
risk: low
verify_isolation: fast
verify:
  - pnpm install --frozen-lockfile --prefer-offline
  - pnpm --dir front test -- --run features/platform-admin/route/admin-shell-layout.test.tsx features/platform-admin/route/admin-coming-soon-route.test.tsx
  - pnpm --dir front lint
instructions:
  - Implement Tasks 12, 13, and 14 in this single worker invocation following the detailed steps in the plan body below.
  - The shell layout owns leftnav + status strip + breadcrumb + onboarding modal. Do not couple it to specific route loaders.
  - Do not execute the per-task `git add` / `git commit` shell snippets — leave changes uncommitted so waygent apply lands them.
```

```yaml waygent-task
id: phase_5_route_registration
title: Phase 5 — Implement Tasks 15-16 (route module + wire into router; remove old /admin block). Do not create git commits from the task worktree.
dependencies: [phase_4_route_shell]
file_claims:
  - path: front/src/app/routes/admin.tsx
    mode: owned
  - path: front/src/app/router.tsx
    mode: owned
  - path: front/src/app/routes/auth.tsx
    mode: owned
risk: medium
verify_isolation: fast
verify:
  - pnpm install --frozen-lockfile --prefer-offline
  - pnpm --dir front lint
  - pnpm --dir front build
instructions:
  - Implement Tasks 15 and 16 in this single worker invocation following the detailed steps in the plan body below.
  - Replace the single legacy /admin block in router.tsx with the new admin route family lazy-loaded from front/src/app/routes/admin.tsx.
  - All READY route imports are placeholder-friendly — Phase 6 will fill in actual route files; ensure the registration compiles by referencing only modules that will exist.
  - Do not execute the per-task `git add` / `git commit` shell snippets — leave changes uncommitted so waygent apply lands them.
```

```yaml waygent-task
id: phase_6_ready_routes
title: Phase 6 — Implement Tasks 17-21 (/admin/today, /admin/clubs, /admin/clubs/:clubId, /admin/ai-ops, /admin/support). Do not create git commits from the task worktree.
dependencies: [phase_5_route_registration]
file_claims:
  - path: front/features/platform-admin/route/admin-today-route.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-today-data.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-today-route.test.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-clubs-route.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-clubs-data.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-clubs-route.test.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-club-detail-route.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-club-detail-data.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-club-detail-route.test.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-ai-ops-route.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-ai-ops-data.ts
    mode: owned
  - path: front/features/platform-admin/route/admin-ai-ops-route.test.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-support-route.tsx
    mode: owned
  - path: front/features/platform-admin/route/admin-support-route.test.tsx
    mode: owned
  - path: front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts
    mode: owned
risk: medium
verify_isolation: fast
verify:
  - pnpm install --frozen-lockfile --prefer-offline
  - pnpm --dir front test -- --run features/platform-admin/route
  - pnpm --dir front lint
  - pnpm --dir front build
instructions:
  - Implement Tasks 17, 18, 19, 20, and 21 in this single worker invocation following the detailed steps in the plan body below.
  - Task 20 includes the AI_DISABLED 503 correction in `platform-admin-ai-ops-queries.ts`.
  - Do not execute the per-task `git add` / `git commit` shell snippets — leave changes uncommitted so waygent apply lands them.
```

```yaml waygent-task
id: phase_7_cleanup
title: Phase 7 — Implement Task 22 (delete legacy single-page admin files). Do not create git commits from the task worktree.
dependencies: [phase_6_ready_routes]
file_claims:
  - path: front/features/platform-admin/route/platform-admin-route.tsx
    mode: owned
  - path: front/features/platform-admin/route/platform-admin-data.ts
    mode: owned
  - path: front/features/platform-admin/ui/platform-admin-dashboard.tsx
    mode: owned
  - path: front/features/platform-admin/ui/platform-admin-overview-metrics.tsx
    mode: owned
risk: medium
verify_isolation: fast
verify:
  - pnpm install --frozen-lockfile --prefer-offline
  - pnpm --dir front lint
  - pnpm --dir front test -- --run
  - pnpm --dir front build
instructions:
  - Implement Task 22 in this single worker invocation following the detailed steps in the plan body below.
  - Confirm no remaining references in front/ using ripgrep first; if any non-self references remain, stop and report instead of deleting.
  - Delete the four listed files (plus any colocated test files that exist) using rm. These files are claimed `owned` by this task, so deletion is in scope.
  - Do not execute the per-task `git add` / `git commit` shell snippets — leave changes uncommitted so waygent apply lands them.
```

```yaml waygent-task
id: phase_8_e2e_docs
title: Phase 8 — Implement Tasks 23-25 (Playwright admin shell E2E, README + showcase doc updates, CHANGELOG entry). Do not create git commits from the task worktree.
dependencies: [phase_7_cleanup]
file_claims:
  - path: front/tests/e2e/admin-shell.spec.ts
    mode: owned
  - path: README.md
    mode: owned
  - path: docs/showcase/architecture-evidence.md
    mode: owned
  - path: CHANGELOG.md
    mode: owned
risk: low
verify_isolation: fast
verify:
  - pnpm install --frozen-lockfile --prefer-offline
  - pnpm --dir front lint
  - pnpm --dir front build
instructions:
  - Implement Tasks 23, 24, and 25 in this single worker invocation following the detailed steps in the plan body below.
  - Skip running the Playwright suite during verify — it requires a live server. Write the spec; humans run it post-apply.
  - Do not execute the per-task `git add` / `git commit` shell snippets — leave changes uncommitted so waygent apply lands them.
```

**Goal:** Split `/admin` from a single 1,300-line page into a lazy-split 9-route family with shared leftnav + status strip + capability matrix + dev-login admin seed + URL-state onboarding modal + standard "준비 중" empty state.

**Architecture:** A new `AdminShellLayout` owns leftnav + status strip + breadcrumb + onboarding modal. Five routes are READY (`today`, `clubs`, `clubs/:clubId`, `ai-ops`, `support`); four routes are COMING-SOON placeholders (`health`, `notifications`, `audit`, `analytics`). An `admin-route-catalog.ts` is the single source of truth that drives leftnav rendering, route registration, breadcrumb labels, and empty-state content. No new server endpoints. SQL dev seed adds 3 admin accounts.

**Tech Stack:** React 18, Vite, react-router 6 (`createBrowserRouter` + lazy + loaders), TanStack Query, Vitest + React Testing Library, Playwright, Spring Boot 3 + Kotlin (server side only for seed adapter changes), Flyway repeatable migrations for dev seed.

**Spec:** `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-s1-ia-foundation-design.md`

**Umbrella:** `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md`

---

## Conventions

- Tests are co-located with source per `front/AGENTS.md` (e.g. `foo.tsx` ↔ `foo.test.tsx`).
- Frontend default checks: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`. E2E: `pnpm --dir front test:e2e`.
- Server default check: `./gradlew :server:check`.
- Pre-push gate: `./scripts/pre-push-check.sh`.
- Korean copy is the project default for user-facing strings.
- Commit messages follow the existing project style: `category: short description in Korean or English` (see recent commits). Each task ends with a single commit.

## Phase order

Tasks 1–4 (model layer) → Tasks 5–6 (server dev seed) → Tasks 7–11 (UI building blocks) → Tasks 12–14 (route shell) → Tasks 15–16 (route registration) → Tasks 17–21 (READY routes) → Task 22 (cleanup) → Tasks 23–25 (E2E + docs + CHANGELOG).

The order is sequential. Some tasks within a phase could be done in any order (e.g. Tasks 1–4 are pure modules), but later phases assume earlier types/files exist.

---

## Task 1: Permission matrix model

**Files:**
- Create: `front/features/platform-admin/model/platform-admin-permissions.ts`
- Create: `front/features/platform-admin/model/platform-admin-permissions.test.ts`

- [ ] **Step 1: Write the failing test**

`front/features/platform-admin/model/platform-admin-permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canDo, type AdminCapability } from "./platform-admin-permissions";

describe("canDo", () => {
  const allViews: AdminCapability[] = [
    "view_today", "view_clubs", "view_club_detail",
    "view_ai_ops", "view_support", "view_health",
    "view_notifications", "view_audit", "view_analytics",
  ];

  it.each(["OWNER", "OPERATOR", "SUPPORT"] as const)("allows every view_* for %s", (role) => {
    for (const capability of allViews) {
      expect(canDo(role, capability)).toBe(true);
    }
  });

  it("OWNER can perform every mutating capability", () => {
    expect(canDo("OWNER", "create_club")).toBe(true);
    expect(canDo("OWNER", "edit_club_metadata")).toBe(true);
    expect(canDo("OWNER", "toggle_club_visibility")).toBe(true);
    expect(canDo("OWNER", "create_support_grant")).toBe(true);
    expect(canDo("OWNER", "revoke_support_grant")).toBe(true);
    expect(canDo("OWNER", "force_cancel_ai_job")).toBe(true);
    expect(canDo("OWNER", "check_domain_provisioning")).toBe(true);
  });

  it("OPERATOR can act on clubs and AI but not support grants", () => {
    expect(canDo("OPERATOR", "create_club")).toBe(true);
    expect(canDo("OPERATOR", "edit_club_metadata")).toBe(true);
    expect(canDo("OPERATOR", "toggle_club_visibility")).toBe(true);
    expect(canDo("OPERATOR", "force_cancel_ai_job")).toBe(true);
    expect(canDo("OPERATOR", "check_domain_provisioning")).toBe(true);
    expect(canDo("OPERATOR", "create_support_grant")).toBe(false);
    expect(canDo("OPERATOR", "revoke_support_grant")).toBe(false);
  });

  it("SUPPORT can only view, never mutate", () => {
    expect(canDo("SUPPORT", "create_club")).toBe(false);
    expect(canDo("SUPPORT", "edit_club_metadata")).toBe(false);
    expect(canDo("SUPPORT", "toggle_club_visibility")).toBe(false);
    expect(canDo("SUPPORT", "create_support_grant")).toBe(false);
    expect(canDo("SUPPORT", "revoke_support_grant")).toBe(false);
    expect(canDo("SUPPORT", "force_cancel_ai_job")).toBe(false);
    expect(canDo("SUPPORT", "check_domain_provisioning")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-permissions.test.ts`
Expected: FAIL — file `./platform-admin-permissions` does not exist.

- [ ] **Step 3: Write the implementation**

`front/features/platform-admin/model/platform-admin-permissions.ts`:

```ts
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";

export type AdminCapability =
  | "view_today"
  | "view_clubs"
  | "view_club_detail"
  | "view_ai_ops"
  | "view_support"
  | "view_health"
  | "view_notifications"
  | "view_audit"
  | "view_analytics"
  | "create_club"
  | "edit_club_metadata"
  | "toggle_club_visibility"
  | "create_support_grant"
  | "revoke_support_grant"
  | "force_cancel_ai_job"
  | "check_domain_provisioning";

const ALL_VIEWS: readonly AdminCapability[] = [
  "view_today",
  "view_clubs",
  "view_club_detail",
  "view_ai_ops",
  "view_support",
  "view_health",
  "view_notifications",
  "view_audit",
  "view_analytics",
];

const OWNER_CAPS: ReadonlySet<AdminCapability> = new Set<AdminCapability>([
  ...ALL_VIEWS,
  "create_club",
  "edit_club_metadata",
  "toggle_club_visibility",
  "create_support_grant",
  "revoke_support_grant",
  "force_cancel_ai_job",
  "check_domain_provisioning",
]);

const OPERATOR_CAPS: ReadonlySet<AdminCapability> = new Set<AdminCapability>([
  ...ALL_VIEWS,
  "create_club",
  "edit_club_metadata",
  "toggle_club_visibility",
  "force_cancel_ai_job",
  "check_domain_provisioning",
]);

const SUPPORT_CAPS: ReadonlySet<AdminCapability> = new Set<AdminCapability>(ALL_VIEWS);

export const ADMIN_CAPABILITY_MATRIX: Record<PlatformAdminRole, ReadonlySet<AdminCapability>> = {
  OWNER: OWNER_CAPS,
  OPERATOR: OPERATOR_CAPS,
  SUPPORT: SUPPORT_CAPS,
};

export function canDo(role: PlatformAdminRole, capability: AdminCapability): boolean {
  return ADMIN_CAPABILITY_MATRIX[role].has(capability);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-permissions.test.ts`
Expected: PASS — 4 test cases (3 from `it.each`) all green.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-permissions.ts \
        front/features/platform-admin/model/platform-admin-permissions.test.ts
git commit -m "platform-admin: introduce capability matrix model"
```

---

## Task 2: Route catalog SSOT

**Files:**
- Create: `front/features/platform-admin/route/admin-route-catalog.ts`
- Create: `front/features/platform-admin/route/admin-route-catalog.test.ts`

- [ ] **Step 1: Write the failing test**

`front/features/platform-admin/route/admin-route-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ADMIN_CLUB_DETAIL_ROUTE,
  ADMIN_ROUTES,
  type AdminRouteDescriptor,
} from "./admin-route-catalog";

describe("ADMIN_ROUTES catalog", () => {
  it("contains exactly the 8 nav-visible routes", () => {
    const paths = ADMIN_ROUTES.map((route) => route.path).sort();
    expect(paths).toEqual([
      "ai-ops",
      "analytics",
      "audit",
      "clubs",
      "health",
      "notifications",
      "support",
      "today",
    ]);
  });

  it("has no duplicate paths", () => {
    const paths = ADMIN_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("uses a single label per group", () => {
    const labelByGroup = new Map<string, string>();
    for (const route of ADMIN_ROUTES) {
      const existing = labelByGroup.get(route.group);
      if (existing) expect(existing).toBe(route.groupLabel);
      else labelByGroup.set(route.group, route.groupLabel);
    }
  });

  it("requires comingSoon block when status is coming_soon", () => {
    for (const route of ADMIN_ROUTES) {
      if (route.status === "coming_soon") {
        expect(route.comingSoon).toBeDefined();
        expect(route.comingSoon?.title).toBeTruthy();
        expect(route.comingSoon?.summary).toBeTruthy();
        expect(route.comingSoon?.bullets.length).toBeGreaterThanOrEqual(3);
        expect(route.comingSoon?.docHref).toMatch(
          /^\/docs\/superpowers\/specs\/2026-05-25-readmates-admin-vnext-roadmap-design\.md#/,
        );
      } else {
        expect(route.comingSoon).toBeUndefined();
      }
    }
  });

  it("requires no comingSoon block when status is ready", () => {
    const ready = ADMIN_ROUTES.filter((route) => route.status === "ready");
    expect(ready.map((route) => route.path).sort()).toEqual([
      "ai-ops",
      "clubs",
      "support",
      "today",
    ]);
  });

  it("ADMIN_CLUB_DETAIL_ROUTE is not in the nav catalog", () => {
    const navPaths = new Set(ADMIN_ROUTES.map((route) => route.path));
    expect(navPaths.has(ADMIN_CLUB_DETAIL_ROUTE.path)).toBe(false);
    expect(ADMIN_CLUB_DETAIL_ROUTE.path).toBe("clubs/:clubId");
    expect(ADMIN_CLUB_DETAIL_ROUTE.status).toBe("ready");
  });

  it("every descriptor has a valid required capability", () => {
    const valid = new Set([
      "view_today", "view_clubs", "view_club_detail",
      "view_ai_ops", "view_support", "view_health",
      "view_notifications", "view_audit", "view_analytics",
    ]);
    const all: AdminRouteDescriptor[] = [...ADMIN_ROUTES, ADMIN_CLUB_DETAIL_ROUTE];
    for (const route of all) {
      expect(valid.has(route.requiredCapability)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-route-catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`front/features/platform-admin/route/admin-route-catalog.ts`:

```ts
import type { AdminCapability } from "@/features/platform-admin/model/platform-admin-permissions";

export type AdminRouteGroup = "today" | "ops" | "review";
export type AdminRouteStatus = "ready" | "coming_soon";
export type AdminRouteSlice =
  | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10";

export type AdminRouteDescriptor = {
  path: string;
  label: string;
  group: AdminRouteGroup;
  groupLabel: string;
  slice: AdminRouteSlice;
  status: AdminRouteStatus;
  requiredCapability: AdminCapability;
  comingSoon?: {
    title: string;
    summary: string;
    bullets: ReadonlyArray<string>;
    docHref: string;
  };
};

const UMBRELLA_DOC = "/docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md";

export const ADMIN_ROUTES: ReadonlyArray<AdminRouteDescriptor> = [
  {
    path: "today",
    label: "오늘",
    group: "today",
    groupLabel: "오늘/헬스",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_today",
  },
  {
    path: "health",
    label: "헬스",
    group: "today",
    groupLabel: "오늘/헬스",
    slice: "S2",
    status: "coming_soon",
    requiredCapability: "view_health",
    comingSoon: {
      title: "Platform Ops Health",
      summary: "DB, Redis, Kafka, AI provider, outbox, deploy 신호를 한 화면에서 봅니다.",
      bullets: [
        "서비스·큐·AI 가용성 카드 (unknown/ok/degraded/down 4-state)",
        "Outbox backlog · 알림 발송 성공률",
        "최근 deploy attempt 5건 ledger",
        "각 카드의 last-checked + drill 링크",
      ],
      docHref: `${UMBRELLA_DOC}#s2--platform-ops-health--deploy-ledger`,
    },
  },
  {
    path: "clubs",
    label: "클럽",
    group: "ops",
    groupLabel: "운영",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_clubs",
  },
  {
    path: "support",
    label: "지원",
    group: "ops",
    groupLabel: "운영",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_support",
  },
  {
    path: "notifications",
    label: "알림",
    group: "ops",
    groupLabel: "운영",
    slice: "S5",
    status: "coming_soon",
    requiredCapability: "view_notifications",
    comingSoon: {
      title: "알림/Outbox 운영",
      summary: "relay lag, dead letter, replay, 실패 cluster, 클럽별 성공률을 한 화면에서 봅니다.",
      bullets: [
        "Outbox state ledger와 dead letter 목록",
        "수동 replay (dry-run → confirm 두 단계)",
        "발송 실패 cluster (errorCode 그룹)",
        "호스트 manual notification audit cross-cut",
      ],
      docHref: `${UMBRELLA_DOC}#s5--알림outbox-운영`,
    },
  },
  {
    path: "ai-ops",
    label: "AI Ops",
    group: "ops",
    groupLabel: "운영",
    slice: "S1",
    status: "ready",
    requiredCapability: "view_ai_ops",
  },
  {
    path: "audit",
    label: "감사",
    group: "review",
    groupLabel: "감사/분석",
    slice: "S7",
    status: "coming_soon",
    requiredCapability: "view_audit",
    comingSoon: {
      title: "Audit / Activity ledger",
      summary: "platform admin · OWNER · SUPPORT · 클럽 lifecycle · role transition 액션을 시간순 통합 뷰로 봅니다.",
      bullets: [
        "actor / club / action / outcome 통합 ledger",
        "club · role · actor 필터",
        "출처 slice 표기 (S2/S3/S4/S5 어떤 작업이었는지)",
        "마스킹 정책 일관 적용",
      ],
      docHref: `${UMBRELLA_DOC}#s7--audit--activity-ledger-통합`,
    },
  },
  {
    path: "analytics",
    label: "분석",
    group: "review",
    groupLabel: "감사/분석",
    slice: "S8",
    status: "coming_soon",
    requiredCapability: "view_analytics",
    comingSoon: {
      title: "분석/리포팅 lite",
      summary: "클럽별 활성 멤버, 세션 완료율, RSVP rate, AI 비용/세션, 알림 도달률 트렌드.",
      bullets: [
        "7/30/90일 시계열",
        "클럽 간 비교 (cross-club benchmark)",
        "데이터 부족 시 정직한 empty state",
        "fixture seed로 dev 환경에서도 의미 있는 차트",
      ],
      docHref: `${UMBRELLA_DOC}#s8--분석리포팅-lite`,
    },
  },
];

export const ADMIN_CLUB_DETAIL_ROUTE: AdminRouteDescriptor = {
  path: "clubs/:clubId",
  label: "클럽 상세",
  group: "ops",
  groupLabel: "운영",
  slice: "S1",
  status: "ready",
  requiredCapability: "view_club_detail",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-route-catalog.test.ts`
Expected: PASS — all 7 test cases.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/route/admin-route-catalog.ts \
        front/features/platform-admin/route/admin-route-catalog.test.ts
git commit -m "platform-admin: introduce admin route catalog SSOT"
```

---

## Task 3: Status strip metric derivation

**Files:**
- Create: `front/features/platform-admin/model/admin-status-strip-model.ts`
- Create: `front/features/platform-admin/model/admin-status-strip-model.test.ts`

Notes: "ready_to_publish" predicate uses the same publish-readiness rule the existing `ClubPublishChecklist` enforces. In the current code this is computed inside `buildPlatformAdminWorkbench`; this task extracts a small pure predicate (`isClubReadyToPublish`) and the count derivation. The full workbench keeps using the same predicate.

- [ ] **Step 1: Write the failing test**

`front/features/platform-admin/model/admin-status-strip-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  PlatformAdminClub,
  PlatformAdminClubListResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import { deriveStripMetrics } from "./admin-status-strip-model";

function club(overrides: Partial<PlatformAdminClub>): PlatformAdminClub {
  return {
    clubId: "club-1",
    slug: "c",
    name: "name",
    tagline: "",
    about: "",
    status: "ACTIVE",
    publicVisibility: "PRIVATE",
    domainCount: 0,
    domainActionRequiredCount: 0,
    firstHostOnboardingState: "ASSIGNED",
    ...overrides,
  };
}

const summary: PlatformAdminSummaryResponse = {
  platformRole: "OWNER",
  activeClubCount: 0,
  domainActionRequiredCount: 3,
  domainsRequiringAction: [],
};

describe("deriveStripMetrics", () => {
  it("counts SETUP_REQUIRED clubs as 조치 필요", () => {
    const clubs: PlatformAdminClubListResponse = {
      items: [
        club({ clubId: "a", status: "SETUP_REQUIRED" }),
        club({ clubId: "b", status: "ACTIVE" }),
        club({ clubId: "c", status: "SETUP_REQUIRED" }),
      ],
    };
    const metrics = deriveStripMetrics(summary, clubs);
    expect(metrics.setupRequiredCount).toBe(2);
  });

  it("counts PRIVATE + ready-to-publish clubs as 공개 준비", () => {
    const clubs: PlatformAdminClubListResponse = {
      items: [
        // ready: PRIVATE, ACTIVE, host ASSIGNED, no domain action
        club({ clubId: "a", status: "ACTIVE", publicVisibility: "PRIVATE", firstHostOnboardingState: "ASSIGNED" }),
        // not ready: domain action required
        club({ clubId: "b", status: "ACTIVE", publicVisibility: "PRIVATE", firstHostOnboardingState: "ASSIGNED", domainActionRequiredCount: 1 }),
        // not ready: already PUBLIC
        club({ clubId: "c", status: "ACTIVE", publicVisibility: "PUBLIC", firstHostOnboardingState: "ASSIGNED" }),
        // not ready: host MISSING
        club({ clubId: "d", status: "ACTIVE", publicVisibility: "PRIVATE", firstHostOnboardingState: "MISSING" }),
        // not ready: SETUP_REQUIRED
        club({ clubId: "e", status: "SETUP_REQUIRED", publicVisibility: "PRIVATE", firstHostOnboardingState: "ASSIGNED" }),
      ],
    };
    const metrics = deriveStripMetrics(summary, clubs);
    expect(metrics.readyToPublishCount).toBe(1);
  });

  it("passes summary fields through unchanged", () => {
    const metrics = deriveStripMetrics(summary, { items: [] });
    expect(metrics.platformRole).toBe("OWNER");
    expect(metrics.domainActionRequiredCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/model/admin-status-strip-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`front/features/platform-admin/model/admin-status-strip-model.ts`:

```ts
import type {
  PlatformAdminClub,
  PlatformAdminClubListResponse,
  PlatformAdminRole,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";

export type AdminStripMetrics = {
  platformRole: PlatformAdminRole;
  setupRequiredCount: number;
  readyToPublishCount: number;
  domainActionRequiredCount: number;
};

export function isClubReadyToPublish(club: PlatformAdminClub): boolean {
  return (
    club.status === "ACTIVE" &&
    club.publicVisibility === "PRIVATE" &&
    club.firstHostOnboardingState === "ASSIGNED" &&
    club.domainActionRequiredCount === 0
  );
}

export function deriveStripMetrics(
  summary: PlatformAdminSummaryResponse,
  clubs: PlatformAdminClubListResponse,
): AdminStripMetrics {
  let setupRequired = 0;
  let readyToPublish = 0;
  for (const club of clubs.items) {
    if (club.status === "SETUP_REQUIRED") setupRequired += 1;
    if (isClubReadyToPublish(club)) readyToPublish += 1;
  }
  return {
    platformRole: summary.platformRole,
    setupRequiredCount: setupRequired,
    readyToPublishCount: readyToPublish,
    domainActionRequiredCount: summary.domainActionRequiredCount,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/model/admin-status-strip-model.test.ts`
Expected: PASS — all 3 cases.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/admin-status-strip-model.ts \
        front/features/platform-admin/model/admin-status-strip-model.test.ts
git commit -m "platform-admin: derive status strip metrics from summary + clubs"
```

---

## Task 4: Workbench model — AI-item 합류

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`

This extends the existing queue builder to mix AI-item rows alongside club items, distinguished by a discriminated `type` field. Existing club logic must remain identical.

- [ ] **Step 1: Read the current model and tests**

Read `front/features/platform-admin/model/platform-admin-workbench-model.ts` and its tests first to keep existing behavior intact.

- [ ] **Step 2: Write the new failing test (append to existing test file)**

Append to `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`:

```ts
import type { PlatformAdminAiOpsJobView } from "@/features/platform-admin/ui/platform-admin-ai-ops";

describe("buildPlatformAdminWorkbench — AI item 합류", () => {
  function aiJob(overrides: Partial<PlatformAdminAiOpsJobView>): PlatformAdminAiOpsJobView {
    return {
      jobId: "job-1",
      clubId: "club-1",
      clubName: "샘플 클럽",
      sessionTitle: "1회차",
      status: "FAILED",
      errorCode: null,
      stale: false,
      startedAt: "2026-05-20T00:00:00Z",
      ...overrides,
    };
  }

  it("appends AI items as typed view models with severity", () => {
    const result = buildPlatformAdminWorkbench({
      role: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      selectedClubId: null,
      clubs: [],
      domains: [],
      aiJobs: [
        aiJob({ jobId: "job-1", status: "FAILED", stale: false }),
        aiJob({ jobId: "job-2", status: "RUNNING", stale: true }),
      ],
      aiDisabled: false,
    });
    const aiItems = result.queueItems.filter((item) => item.type === "ai");
    expect(aiItems).toHaveLength(2);
    expect(aiItems.find((item) => item.id === "ai-job-1")?.severity).toBe("critical");
    expect(aiItems.find((item) => item.id === "ai-job-2")?.severity).toBe("warn");
  });

  it("uses 'info' severity for AI items when AI is disabled", () => {
    const result = buildPlatformAdminWorkbench({
      role: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      selectedClubId: null,
      clubs: [],
      domains: [],
      aiJobs: [aiJob({ jobId: "job-3", status: "FAILED", stale: false })],
      aiDisabled: true,
    });
    const aiItem = result.queueItems.find((item) => item.id === "ai-job-3");
    expect(aiItem?.severity).toBe("info");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-workbench-model.test.ts`
Expected: FAIL — `aiJobs` field unknown on input; `type` field unknown on queue item.

- [ ] **Step 4: Extend the model**

In `platform-admin-workbench-model.ts`:

1. Add to the `PlatformAdminWorkbenchInput` type:
```ts
aiJobs?: ReadonlyArray<PlatformAdminAiOpsJobView>;
aiDisabled?: boolean;
```

2. Change the queue item type to a discriminated union:
```ts
export type WorkbenchQueueItem =
  | WorkbenchClubQueueItem
  | WorkbenchAiQueueItem;

export type WorkbenchClubQueueItem = {
  type: "club";
  id: string;
  // ...existing club fields kept unchanged
};

export type WorkbenchAiQueueItem = {
  type: "ai";
  id: string; // "ai-{jobId}"
  jobId: string;
  clubName: string;
  sessionTitle: string;
  severity: "critical" | "warn" | "info";
  label: string; // "AI 실패", "AI stale", "AI 비활성"
};
```

3. In `buildPlatformAdminWorkbench`, after computing club queue items, append AI items:
```ts
const aiItems: WorkbenchAiQueueItem[] = (input.aiJobs ?? []).map((job) => {
  const severity: WorkbenchAiQueueItem["severity"] = input.aiDisabled
    ? "info"
    : job.status === "FAILED"
      ? "critical"
      : job.stale
        ? "warn"
        : "info";
  const label = input.aiDisabled
    ? "AI 비활성"
    : job.status === "FAILED"
      ? "AI 실패"
      : job.stale
        ? "AI stale"
        : "AI 진행";
  return {
    type: "ai",
    id: `ai-${job.jobId}`,
    jobId: job.jobId,
    clubName: job.clubName,
    sessionTitle: job.sessionTitle,
    severity,
    label,
  };
});

const queueItems: WorkbenchQueueItem[] = [...clubItems, ...aiItems];
```

Where `clubItems` are the existing items wrapped with `{ type: "club", ...existing }`.

4. Update existing call sites (`platform-admin-dashboard.tsx`, etc.) — but Task 22 will delete the dashboard, so leave compatibility shims minimal: each existing access of `queueItems[i].something` must still compile. The simplest path is to keep all existing club-item fields under the new `type: "club"` shape so old code still reads them.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-workbench-model.test.ts`
Expected: PASS — all existing cases plus the 2 new AI cases.

- [ ] **Step 6: Run all front unit tests**

Run: `pnpm --dir front test`
Expected: GREEN, including existing dashboard / queue / brief / AI Ops tests.

- [ ] **Step 7: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-workbench-model.ts \
        front/features/platform-admin/model/platform-admin-workbench-model.test.ts
git commit -m "platform-admin: mix AI items into today work queue"
```

---

## Task 5: SQL dev seed for admin accounts

**Files:**
- Modify: `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`
- Modify: `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`

- [ ] **Step 1: Append Postgres dev seed block**

At the bottom of `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`, after the existing seeds, append:

```sql
-- Platform admin dev-login accounts (S1 IA Foundation).
with admin_seed(id_suffix, google_subject_id, email, name) as (
  values
    (901, 'readmates-dev-google-admin-owner',    'admin-owner@example.com',    '오너관리자'),
    (902, 'readmates-dev-google-admin-operator', 'admin-operator@example.com', '운영관리자'),
    (903, 'readmates-dev-google-admin-support',  'admin-support@example.com',  '지원관리자')
)
insert into users (id, google_subject_id, email, name, profile_image_url)
select
  ('00000000-0000-0000-0000-' || lpad(id_suffix::text, 12, '0'))::uuid,
  google_subject_id,
  email,
  name,
  null
from admin_seed
on conflict (email) do update set
  google_subject_id = excluded.google_subject_id,
  name = excluded.name,
  profile_image_url = excluded.profile_image_url;

with admin_role_seed(id_suffix, email, role) as (
  values
    (911, 'admin-owner@example.com',    'OWNER'),
    (912, 'admin-operator@example.com', 'OPERATOR'),
    (913, 'admin-support@example.com',  'SUPPORT')
)
insert into platform_admins (id, user_id, role, status, created_at)
select
  ('00000000-0000-0000-0000-' || lpad(id_suffix::text, 12, '0'))::uuid,
  users.id,
  admin_role_seed.role,
  'ACTIVE',
  now()
from admin_role_seed
join users on users.email = admin_role_seed.email
on conflict (user_id) do update set
  role = excluded.role,
  status = 'ACTIVE';
```

- [ ] **Step 2: Append MySQL dev seed block**

At the bottom of `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`, append:

```sql
-- Platform admin dev-login accounts (S1 IA Foundation).
insert into users (id, google_subject_id, email, name, short_name, profile_image_url)
with admin_seed as (
  select 901 as id_suffix, 'readmates-dev-google-admin-owner'    as google_subject_id, 'admin-owner@example.com'    as email, '오너관리자' as name, '오너' as short_name
  union all
  select 902, 'readmates-dev-google-admin-operator', 'admin-operator@example.com', '운영관리자', '운영'
  union all
  select 903, 'readmates-dev-google-admin-support',  'admin-support@example.com',  '지원관리자', '지원'
)
select
  concat('00000000-0000-0000-0000-', lpad(id_suffix, 12, '0')),
  google_subject_id,
  email,
  name,
  short_name,
  null
from admin_seed
on duplicate key update
  google_subject_id = values(google_subject_id),
  name = values(name),
  short_name = values(short_name),
  profile_image_url = values(profile_image_url),
  updated_at = utc_timestamp(6);

insert into platform_admins (id, user_id, role, status, created_at)
with admin_role_seed as (
  select 911 as id_suffix, 'admin-owner@example.com'    as email, 'OWNER'    as role
  union all
  select 912, 'admin-operator@example.com', 'OPERATOR'
  union all
  select 913, 'admin-support@example.com',  'SUPPORT'
)
select
  concat('00000000-0000-0000-0000-', lpad(id_suffix, 12, '0')),
  users.id,
  admin_role_seed.role,
  'ACTIVE',
  utc_timestamp(6)
from admin_role_seed
join users on users.email = admin_role_seed.email
on duplicate key update
  role = values(role),
  status = 'ACTIVE';
```

Note: if `platform_admins` in the MySQL schema does not have a `(user_id)` unique constraint, the `on duplicate key update` will fall through to insert-only behaviour. Confirm by reading `db/mysql/migration/V21*` during execution; the spec assumes the same schema parity that production uses.

- [ ] **Step 3: Run the server check to confirm migrations replay**

Run: `./gradlew :server:check`
Expected: GREEN — Flyway repeatable migrations apply against the test container, no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/main/resources/db/dev/R__readmates_dev_seed.sql \
        server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql
git commit -m "platform-admin: seed dev-login admin accounts for /admin verification"
```

---

## Task 6: Whitelist admin emails in dev-login adapter

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
- Create or modify: `server/src/test/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapterDevSeedTest.kt`

- [ ] **Step 1: Write/extend the failing test**

If a test for `findDevSeedActiveMemberByEmail` exists already, append the admin cases. Otherwise create the file:

```kotlin
package com.readmates.auth.adapter.out.persistence

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class JdbcMemberAccountAdapterDevSeedAllowListTest {
  // This test uses reflection-free check: inspect the public devSeedEmails-like contract
  // indirectly by attempting dev-login with the seeded emails when the testcontainer is on,
  // OR a unit test that only verifies the set membership constant via a test-only accessor.
  //
  // Implementation guidance: expose the email set as a package-private companion property
  // so tests in the same package can read it directly without reflection.

  @Test
  fun `dev seed allowlist contains the three admin accounts`() {
    val allowed = JdbcMemberAccountAdapter.DEV_SEED_EMAILS
    assertThat(allowed).contains(
      "admin-owner@example.com",
      "admin-operator@example.com",
      "admin-support@example.com",
    )
  }

  @Test
  fun `dev seed allowlist still contains the existing host and member accounts`() {
    val allowed = JdbcMemberAccountAdapter.DEV_SEED_EMAILS
    assertThat(allowed).contains(
      "host@example.com",
      "member1@example.com",
      "member5@example.com",
    )
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :server:test --tests JdbcMemberAccountAdapterDevSeedAllowListTest`
Expected: FAIL — `JdbcMemberAccountAdapter.DEV_SEED_EMAILS` does not exist (it's currently a private instance property).

- [ ] **Step 3: Refactor + extend the allowlist**

In `JdbcMemberAccountAdapter.kt`:

1. Move the private instance set `devSeedEmails` to a companion-object constant:

```kotlin
class JdbcMemberAccountAdapter(...) : ... {
  override fun findDevSeedActiveMemberByEmail(email: String): CurrentMember? {
    val normalizedEmail = email.trim().lowercase(Locale.ROOT)
    if (normalizedEmail !in DEV_SEED_EMAILS) {
      return null
    }
    return queryActiveMemberByEmail(normalizedEmail)
  }

  companion object {
    @JvmField
    internal val DEV_SEED_EMAILS: Set<String> = setOf(
      "host@example.com",
      "member1@example.com",
      "member2@example.com",
      "member3@example.com",
      "member4@example.com",
      "member5@example.com",
      "admin-owner@example.com",
      "admin-operator@example.com",
      "admin-support@example.com",
    )
  }
}
```

(Visibility `internal` keeps it visible in test source; production callers continue using `findDevSeedActiveMemberByEmail`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :server:test --tests JdbcMemberAccountAdapterDevSeedAllowListTest`
Expected: PASS — 2 cases green.

- [ ] **Step 5: Run full server check**

Run: `./gradlew :server:check`
Expected: GREEN.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt \
        server/src/test/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapterDevSeedAllowListTest.kt
git commit -m "platform-admin: extend dev-seed allowlist with admin accounts"
```

---

## Task 7: AdminComingSoon UI component

**Files:**
- Create: `front/features/platform-admin/ui/admin-coming-soon.tsx`
- Create: `front/features/platform-admin/ui/admin-coming-soon.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AdminRouteDescriptor } from "@/features/platform-admin/route/admin-route-catalog";
import { AdminComingSoon } from "./admin-coming-soon";

const descriptor: AdminRouteDescriptor = {
  path: "health",
  label: "헬스",
  group: "today",
  groupLabel: "오늘/헬스",
  slice: "S2",
  status: "coming_soon",
  requiredCapability: "view_health",
  comingSoon: {
    title: "Platform Ops Health",
    summary: "DB · Redis · Kafka · AI provider · outbox · deploy 신호를 한 화면에서 봅니다.",
    bullets: ["a", "b", "c", "d"],
    docHref: "/docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md#s2--platform-ops-health--deploy-ledger",
  },
};

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("AdminComingSoon", () => {
  it("renders the slice badge and title", () => {
    renderWithRouter(<AdminComingSoon descriptor={descriptor} />);
    expect(screen.getByText(/준비 중 · S2/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Platform Ops Health" })).toBeInTheDocument();
  });

  it("renders the summary text", () => {
    renderWithRouter(<AdminComingSoon descriptor={descriptor} />);
    expect(screen.getByText(/AI provider · outbox · deploy/)).toBeInTheDocument();
  });

  it("renders all bullets", () => {
    renderWithRouter(<AdminComingSoon descriptor={descriptor} />);
    for (const bullet of descriptor.comingSoon!.bullets) {
      expect(screen.getByText(bullet)).toBeInTheDocument();
    }
  });

  it("renders the doc link with the descriptor href", () => {
    renderWithRouter(<AdminComingSoon descriptor={descriptor} />);
    const link = screen.getByRole("link", { name: /로드맵에서 S2 자세히 보기/ });
    expect(link).toHaveAttribute("href", descriptor.comingSoon!.docHref);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-coming-soon.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

```tsx
import type { AdminRouteDescriptor } from "@/features/platform-admin/route/admin-route-catalog";

export function AdminComingSoon({ descriptor }: { descriptor: AdminRouteDescriptor }) {
  const block = descriptor.comingSoon;
  if (!block) {
    return null;
  }
  return (
    <section className="admin-coming-soon" aria-labelledby="admin-coming-soon-title">
      <p className="eyebrow">준비 중 · {descriptor.slice}</p>
      <h1 id="admin-coming-soon-title" className="h1 editorial">
        {block.title}
      </h1>
      <p className="body admin-coming-soon__summary">{block.summary}</p>
      <h2 className="h3 admin-coming-soon__heading">들어올 기능</h2>
      <ul className="admin-coming-soon__bullets">
        {block.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <a className="admin-coming-soon__doc-link" href={block.docHref}>
        로드맵에서 {descriptor.slice} 자세히 보기 →
      </a>
    </section>
  );
}
```

(Plain `<a>` is intentional — the doc link points to a markdown file that opens outside the SPA. Use `target="_blank"` if the project convention requires it — confirm against existing doc-link patterns during execution.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-coming-soon.test.tsx`
Expected: PASS — 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/ui/admin-coming-soon.tsx \
        front/features/platform-admin/ui/admin-coming-soon.test.tsx
git commit -m "platform-admin: add coming-soon empty state component"
```

---

## Task 8: AdminStatusStrip component

**Files:**
- Create: `front/features/platform-admin/ui/admin-status-strip.tsx`
- Create: `front/features/platform-admin/ui/admin-status-strip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AdminStripMetrics } from "@/features/platform-admin/model/admin-status-strip-model";
import { AdminStatusStrip } from "./admin-status-strip";

function renderStrip(props: { metrics: AdminStripMetrics; error?: boolean }) {
  return render(
    <MemoryRouter>
      <AdminStatusStrip {...props} />
    </MemoryRouter>,
  );
}

const baseMetrics: AdminStripMetrics = {
  platformRole: "OWNER",
  setupRequiredCount: 0,
  readyToPublishCount: 0,
  domainActionRequiredCount: 0,
};

describe("AdminStatusStrip", () => {
  it("renders the role badge", () => {
    renderStrip({ metrics: { ...baseMetrics, platformRole: "OPERATOR" } });
    expect(screen.getByText("OPERATOR")).toBeInTheDocument();
  });

  it("links each count card to the today route with the corresponding filter", () => {
    renderStrip({ metrics: { ...baseMetrics, setupRequiredCount: 2, readyToPublishCount: 1, domainActionRequiredCount: 3 } });
    expect(screen.getByRole("link", { name: /조치 필요 클럽/ })).toHaveAttribute("href", "/admin/today?filter=setup_required");
    expect(screen.getByRole("link", { name: /공개 준비/ })).toHaveAttribute("href", "/admin/today?filter=ready_to_publish");
    expect(screen.getByRole("link", { name: /도메인 조치/ })).toHaveAttribute("href", "/admin/today?filter=domain_action");
  });

  it("highlights count cards when the count is at least 1", () => {
    const { container } = renderStrip({ metrics: { ...baseMetrics, setupRequiredCount: 1 } });
    const highlighted = container.querySelector(".admin-status-strip__card--highlight");
    expect(highlighted).not.toBeNull();
    expect(highlighted?.textContent).toContain("조치 필요 클럽");
  });

  it("falls back to a single error card when error=true", () => {
    renderStrip({ metrics: baseMetrics, error: true });
    expect(screen.getByText("상태를 확인할 수 없습니다 · 재시도")).toBeInTheDocument();
    expect(screen.queryByText("OWNER")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-status-strip.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

```tsx
import { Link } from "react-router-dom";
import type { AdminStripMetrics } from "@/features/platform-admin/model/admin-status-strip-model";

export type AdminStatusStripProps = {
  metrics: AdminStripMetrics;
  error?: boolean;
};

export function AdminStatusStrip({ metrics, error = false }: AdminStatusStripProps) {
  if (error) {
    return (
      <div className="admin-status-strip admin-status-strip--error" role="alert">
        <span className="admin-status-strip__card">상태를 확인할 수 없습니다 · 재시도</span>
      </div>
    );
  }
  return (
    <div className="admin-status-strip">
      <div className="admin-status-strip__card admin-status-strip__card--role">
        <span className="admin-status-strip__label">플랫폼 역할</span>
        <span className="admin-status-strip__value">{metrics.platformRole}</span>
      </div>
      <CountCard
        label="조치 필요 클럽"
        count={metrics.setupRequiredCount}
        to="/admin/today?filter=setup_required"
      />
      <CountCard
        label="공개 준비"
        count={metrics.readyToPublishCount}
        to="/admin/today?filter=ready_to_publish"
      />
      <CountCard
        label="도메인 조치"
        count={metrics.domainActionRequiredCount}
        to="/admin/today?filter=domain_action"
      />
    </div>
  );
}

function CountCard({ label, count, to }: { label: string; count: number; to: string }) {
  const className =
    "admin-status-strip__card" + (count >= 1 ? " admin-status-strip__card--highlight" : "");
  return (
    <Link to={to} className={className} aria-label={`${label} ${count}건`}>
      <span className="admin-status-strip__label">{label}</span>
      <span className="admin-status-strip__value">{count}</span>
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-status-strip.test.tsx`
Expected: PASS — 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/ui/admin-status-strip.tsx \
        front/features/platform-admin/ui/admin-status-strip.test.tsx
git commit -m "platform-admin: add 4-card status strip"
```

---

## Task 9: AdminLayoutNav component

**Files:**
- Create: `front/features/platform-admin/ui/admin-layout-nav.tsx`
- Create: `front/features/platform-admin/ui/admin-layout-nav.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminLayoutNav } from "./admin-layout-nav";

function renderNav(opts: { role?: "OWNER" | "OPERATOR" | "SUPPORT"; activePath?: string }) {
  return render(
    <MemoryRouter initialEntries={[opts.activePath ?? "/admin/today"]}>
      <AdminLayoutNav role={opts.role ?? "OWNER"} />
    </MemoryRouter>,
  );
}

describe("AdminLayoutNav", () => {
  it("renders the 3 group headers", () => {
    renderNav({});
    expect(screen.getByText("오늘/헬스")).toBeInTheDocument();
    expect(screen.getByText("운영")).toBeInTheDocument();
    expect(screen.getByText("감사/분석")).toBeInTheDocument();
  });

  it("renders all 8 nav items", () => {
    renderNav({});
    for (const label of ["오늘", "헬스", "클럽", "지원", "알림", "AI Ops", "감사", "분석"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("shows a 준비 중 · S2 pill on the health item", () => {
    renderNav({});
    const healthLink = screen.getByRole("link", { name: /헬스/ });
    expect(healthLink.textContent).toContain("준비 중 · S2");
  });

  it("does not show 준비 중 pill on ready routes", () => {
    renderNav({});
    const todayLink = screen.getByRole("link", { name: /오늘/ });
    expect(todayLink.textContent).not.toContain("준비 중");
  });

  it("marks the active route with aria-current=page", () => {
    renderNav({ activePath: "/admin/clubs" });
    const clubsLink = screen.getByRole("link", { name: /클럽/ });
    expect(clubsLink).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-layout-nav.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

```tsx
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import { canDo } from "@/features/platform-admin/model/platform-admin-permissions";
import {
  ADMIN_ROUTES,
  type AdminRouteDescriptor,
  type AdminRouteGroup,
} from "@/features/platform-admin/route/admin-route-catalog";

export function AdminLayoutNav({ role }: { role: PlatformAdminRole }) {
  const location = useLocation();
  const groups = useMemo(() => groupRoutes(ADMIN_ROUTES, role), [role]);
  const currentPath = location.pathname;

  return (
    <nav className="admin-layout-nav" aria-label="플랫폼 관리 메뉴">
      {groups.map((group) => (
        <section key={group.id} className="admin-layout-nav__group">
          <header className="admin-layout-nav__group-header">{group.label}</header>
          <ul className="admin-layout-nav__items">
            {group.routes.map((route) => (
              <li key={route.path}>
                <NavItem route={route} isActive={isRouteActive(currentPath, route.path)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function NavItem({ route, isActive }: { route: AdminRouteDescriptor; isActive: boolean }) {
  return (
    <Link
      to={`/admin/${route.path}`}
      className={
        "admin-layout-nav__item" + (isActive ? " admin-layout-nav__item--active" : "")
      }
      aria-current={isActive ? "page" : undefined}
    >
      <span className="admin-layout-nav__item-label">{route.label}</span>
      {route.status === "coming_soon" ? (
        <span className="admin-layout-nav__pill">준비 중 · {route.slice}</span>
      ) : null}
    </Link>
  );
}

type GroupBucket = { id: AdminRouteGroup; label: string; routes: AdminRouteDescriptor[] };

function groupRoutes(routes: ReadonlyArray<AdminRouteDescriptor>, role: PlatformAdminRole): GroupBucket[] {
  const visible = routes.filter((route) => canDo(role, route.requiredCapability));
  const buckets = new Map<AdminRouteGroup, GroupBucket>();
  for (const route of visible) {
    const existing = buckets.get(route.group);
    if (existing) {
      existing.routes.push(route);
    } else {
      buckets.set(route.group, { id: route.group, label: route.groupLabel, routes: [route] });
    }
  }
  return [...buckets.values()];
}

function isRouteActive(pathname: string, routePath: string): boolean {
  return pathname === `/admin/${routePath}` || pathname.startsWith(`/admin/${routePath}/`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-layout-nav.test.tsx`
Expected: PASS — 5 cases green.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/ui/admin-layout-nav.tsx \
        front/features/platform-admin/ui/admin-layout-nav.test.tsx
git commit -m "platform-admin: add 3-group leftnav with status pills"
```

---

## Task 10: AdminBreadcrumb component

**Files:**
- Create: `front/features/platform-admin/ui/admin-breadcrumb.tsx`
- Create: `front/features/platform-admin/ui/admin-breadcrumb.test.tsx`

The breadcrumb takes a `routePath` (e.g. `"today"`, `"clubs/:clubId"`) and an optional `extra` (e.g. club name) and renders the catalog-derived chain.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminBreadcrumb } from "./admin-breadcrumb";

describe("AdminBreadcrumb", () => {
  it("renders 'today' breadcrumb as a single label", () => {
    render(<AdminBreadcrumb routePath="today" />);
    expect(screen.getByText("오늘")).toBeInTheDocument();
  });

  it("renders 'clubs' breadcrumb as group · label", () => {
    render(<AdminBreadcrumb routePath="clubs" />);
    expect(screen.getByText(/운영/)).toBeInTheDocument();
    expect(screen.getByText(/클럽/)).toBeInTheDocument();
  });

  it("renders club detail breadcrumb with extra (club name)", () => {
    render(<AdminBreadcrumb routePath="clubs/:clubId" extra="샘플 클럽" />);
    expect(screen.getByText(/샘플 클럽/)).toBeInTheDocument();
  });

  it("renders coming-soon route with '준비 중' suffix", () => {
    render(<AdminBreadcrumb routePath="health" />);
    expect(screen.getByText(/준비 중/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-breadcrumb.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

```tsx
import {
  ADMIN_CLUB_DETAIL_ROUTE,
  ADMIN_ROUTES,
  type AdminRouteDescriptor,
} from "@/features/platform-admin/route/admin-route-catalog";

export function AdminBreadcrumb({ routePath, extra }: { routePath: string; extra?: string | null }) {
  const descriptor = findDescriptor(routePath);
  if (!descriptor) {
    return <nav className="admin-breadcrumb" aria-label="현재 위치" />;
  }
  const parts = buildParts(descriptor, extra);
  return (
    <nav className="admin-breadcrumb" aria-label="현재 위치">
      {parts.map((part, idx) => (
        <span key={`${part}-${idx}`} className="admin-breadcrumb__part">
          {idx > 0 ? <span className="admin-breadcrumb__sep"> · </span> : null}
          {part}
        </span>
      ))}
    </nav>
  );
}

function findDescriptor(routePath: string): AdminRouteDescriptor | null {
  if (routePath === ADMIN_CLUB_DETAIL_ROUTE.path) return ADMIN_CLUB_DETAIL_ROUTE;
  return ADMIN_ROUTES.find((route) => route.path === routePath) ?? null;
}

function buildParts(descriptor: AdminRouteDescriptor, extra?: string | null): string[] {
  const parts: string[] = [];
  if (descriptor.group !== "today" || descriptor.path !== "today") {
    parts.push(descriptor.groupLabel);
  }
  parts.push(descriptor.label === "오늘" ? "오늘 할 일" : descriptor.label);
  if (extra) parts.push(extra);
  if (descriptor.status === "coming_soon") parts.push("준비 중");
  return parts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-breadcrumb.test.tsx`
Expected: PASS — 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/ui/admin-breadcrumb.tsx \
        front/features/platform-admin/ui/admin-breadcrumb.test.tsx
git commit -m "platform-admin: add catalog-driven admin breadcrumb"
```

---

## Task 11: AdminOnboardingModal component

**Files:**
- Create: `front/features/platform-admin/ui/admin-onboarding-modal.tsx`
- Create: `front/features/platform-admin/ui/admin-onboarding-modal.test.tsx`

The modal owns: portal, focus trap, close-channel triage, dirty-confirm. It wraps the existing `PlatformAdminOnboardingWizard` but its children prop is the wizard, so the test can replace it with a stub.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminOnboardingModal } from "./admin-onboarding-modal";

function renderModal(props: { isDirty: boolean; onClose: () => void }) {
  return render(
    <AdminOnboardingModal onRequestClose={props.onClose} isDirty={props.isDirty}>
      <div>wizard contents</div>
    </AdminOnboardingModal>,
  );
}

describe("AdminOnboardingModal", () => {
  it("renders children inside a dialog", () => {
    renderModal({ isDirty: false, onClose: () => {} });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("wizard contents")).toBeInTheDocument();
  });

  it("closes immediately when not dirty", () => {
    const onClose = vi.fn();
    renderModal({ isDirty: false, onClose });
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation when dirty", () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderModal({ isDirty: true, onClose });
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("aborts close when confirmation is cancelled", () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderModal({ isDirty: true, onClose });
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("closes on ESC keydown", () => {
    const onClose = vi.fn();
    renderModal({ isDirty: false, onClose });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = renderModal({ isDirty: false, onClose });
    const backdrop = container.querySelector(".admin-onboarding-modal__backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-onboarding-modal.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

```tsx
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export type AdminOnboardingModalProps = {
  isDirty: boolean;
  onRequestClose: () => void;
  children: ReactNode;
};

export function AdminOnboardingModal({ isDirty, onRequestClose, children }: AdminOnboardingModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  function requestClose() {
    if (isDirty) {
      const ok = window.confirm("작성 중인 내용이 사라집니다. 닫을까요?");
      if (!ok) return;
    }
    onRequestClose();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // requestClose closes over isDirty intentionally
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const focusables = node.querySelectorAll<HTMLElement>(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length > 0) {
      focusables[0].focus();
    }
  }, []);

  return (
    <div
      className="admin-onboarding-modal"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          requestClose();
        }
      }}
    >
      <div
        className="admin-onboarding-modal__backdrop"
        onClick={() => requestClose()}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-onboarding-modal-title"
        className="admin-onboarding-modal__dialog"
      >
        <header className="admin-onboarding-modal__header">
          <h1 id="admin-onboarding-modal-title" className="h2">새 클럽</h1>
          <button
            type="button"
            className="admin-onboarding-modal__close"
            onClick={() => requestClose()}
            aria-label="닫기"
          >
            닫기
          </button>
        </header>
        <div className="admin-onboarding-modal__body">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/ui/admin-onboarding-modal.test.tsx`
Expected: PASS — 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/ui/admin-onboarding-modal.tsx \
        front/features/platform-admin/ui/admin-onboarding-modal.test.tsx
git commit -m "platform-admin: add URL-state onboarding modal shell"
```

---

## Task 12: AdminShellLayout loader

**Files:**
- Create: `front/features/platform-admin/route/admin-shell-data.ts`

This factory reuses `requirePlatformAdminLoaderAuth` plus seeds both `platformAdminSummaryQuery` and `platformAdminClubsQuery` into the cache so the strip and child routes don't refetch.

- [ ] **Step 1: Write the file**

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export function adminShellLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminShell(args?: LoaderFunctionArgs) {
    await requirePlatformAdminLoaderAuth(args);
    await Promise.all([
      queryClient.fetchQuery(platformAdminSummaryQuery()),
      queryClient.fetchQuery(platformAdminClubsQuery()),
    ]);
    return null;
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add front/features/platform-admin/route/admin-shell-data.ts
git commit -m "platform-admin: add admin shell loader seeding summary and clubs"
```

(No new test here — the loader is a thin composition. Coverage of the auth + seed behavior comes through E2E in Task 23 and Task 13's component test.)

---

## Task 13: AdminShellLayout component

**Files:**
- Create: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Create: `front/features/platform-admin/route/admin-shell-layout.test.tsx`
- Create: `front/features/platform-admin/route/admin-breadcrumb-context.tsx`

The layout owns: nav, strip, breadcrumb, header CTA, onboarding modal portal. It reads `?onboarding=1` to mount the modal, and exposes a context for child routes to push the breadcrumb extra.

- [ ] **Step 1: Write the breadcrumb context first**

`front/features/platform-admin/route/admin-breadcrumb-context.tsx`:

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type AdminBreadcrumbContextValue = {
  extra: string | null;
  setExtra: (value: string | null) => void;
};

const AdminBreadcrumbContext = createContext<AdminBreadcrumbContextValue | null>(null);

export function AdminBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [extra, setExtra] = useState<string | null>(null);
  const value = useMemo(() => ({ extra, setExtra }), [extra]);
  return <AdminBreadcrumbContext.Provider value={value}>{children}</AdminBreadcrumbContext.Provider>;
}

export function useAdminBreadcrumbExtra() {
  const ctx = useContext(AdminBreadcrumbContext);
  if (!ctx) throw new Error("useAdminBreadcrumbExtra used outside AdminBreadcrumbProvider");
  return ctx;
}
```

- [ ] **Step 2: Write the failing test**

`admin-shell-layout.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type {
  PlatformAdminClubListResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminShellLayout } from "./admin-shell-layout";

const summary: PlatformAdminSummaryResponse = {
  platformRole: "OWNER",
  activeClubCount: 1,
  domainActionRequiredCount: 0,
  domainsRequiringAction: [],
};

const clubs: PlatformAdminClubListResponse = { items: [] };

function renderShell(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, summary);
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, clubs);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin/*" element={<AdminShellLayout />}>
            <Route path="today" element={<div>today content</div>} />
            <Route path="clubs" element={<div>clubs content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminShellLayout", () => {
  it("renders status strip, leftnav, and breadcrumb", () => {
    renderShell("/admin/today");
    expect(screen.getByText("OWNER")).toBeInTheDocument();
    expect(screen.getByText("오늘/헬스")).toBeInTheDocument();
    expect(screen.getByText("today content")).toBeInTheDocument();
  });

  it("renders the new-club button for OWNER role", () => {
    renderShell("/admin/today");
    expect(screen.getByRole("link", { name: /새 클럽/ })).toBeInTheDocument();
  });

  it("shows the onboarding modal when ?onboarding=1 is present", () => {
    renderShell("/admin/today?onboarding=1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/새 클럽/)).toBeInTheDocument();
  });

  it("does not show the onboarding modal without the query param", () => {
    renderShell("/admin/today");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-shell-layout.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 4: Write the implementation**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { canDo } from "@/features/platform-admin/model/platform-admin-permissions";
import { deriveStripMetrics } from "@/features/platform-admin/model/admin-status-strip-model";
import { AdminBreadcrumb } from "@/features/platform-admin/ui/admin-breadcrumb";
import { AdminLayoutNav } from "@/features/platform-admin/ui/admin-layout-nav";
import { AdminOnboardingModal } from "@/features/platform-admin/ui/admin-onboarding-modal";
import { AdminStatusStrip } from "@/features/platform-admin/ui/admin-status-strip";
import { PlatformAdminOnboardingWizard } from "@/features/platform-admin/ui/platform-admin-onboarding-wizard";
import {
  commitPlatformAdminOnboarding,
  previewPlatformAdminOnboarding,
} from "@/features/platform-admin/api/platform-admin-api";
import { AdminBreadcrumbProvider, useAdminBreadcrumbExtra } from "./admin-breadcrumb-context";

export function AdminShellLayout() {
  return (
    <AdminBreadcrumbProvider>
      <AdminShellLayoutInner />
    </AdminBreadcrumbProvider>
  );
}

function AdminShellLayoutInner() {
  const summaryQuery = useQuery(platformAdminSummaryQuery());
  const clubsQuery = useQuery(platformAdminClubsQuery());
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { extra } = useAdminBreadcrumbExtra();
  const [isWizardDirty, setIsWizardDirty] = useState(false);

  const summary = summaryQuery.data;
  const clubs = clubsQuery.data;
  const role = summary?.platformRole ?? "SUPPORT";
  const stripError = summaryQuery.isError || clubsQuery.isError;
  const stripMetrics =
    summary && clubs
      ? deriveStripMetrics(summary, clubs)
      : {
          platformRole: role,
          setupRequiredCount: 0,
          readyToPublishCount: 0,
          domainActionRequiredCount: 0,
        };

  const routePath = derivePathSegment(location.pathname);
  const onboardingOpen = searchParams.get("onboarding") === "1" && canDo(role, "create_club");

  function closeOnboarding() {
    const next = new URLSearchParams(searchParams);
    next.delete("onboarding");
    navigate(
      { pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : "" },
      { replace: true },
    );
    setIsWizardDirty(false);
  }

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <span className="admin-shell__wordmark">ReadMates Admin</span>
        <AdminBreadcrumb routePath={routePath} extra={extra} />
        <div className="admin-shell__header-actions">
          {canDo(role, "create_club") ? (
            <Link
              to={{
                pathname: location.pathname,
                search: appendOnboardingQuery(searchParams),
              }}
              className="btn btn-primary btn-sm"
            >
              새 클럽
            </Link>
          ) : null}
          <span className="admin-shell__role-badge">{role}</span>
          <Link to="/app" className="btn btn-ghost btn-sm">→ 멤버 공간</Link>
        </div>
      </header>
      <AdminStatusStrip metrics={stripMetrics} error={stripError} />
      <div className="admin-shell__body">
        <aside className="admin-shell__nav">
          <AdminLayoutNav role={role} />
        </aside>
        <main className="admin-shell__main">
          <Outlet />
        </main>
      </div>
      {onboardingOpen ? (
        <AdminOnboardingModal isDirty={isWizardDirty} onRequestClose={closeOnboarding}>
          <PlatformAdminOnboardingWizard
            onPreview={previewPlatformAdminOnboarding}
            onCommit={commitPlatformAdminOnboarding}
            onDirtyChange={setIsWizardDirty}
            onCreated={(result) => {
              setIsWizardDirty(false);
              navigate(`/admin/clubs/${result.club.clubId}`, { replace: true });
            }}
          />
        </AdminOnboardingModal>
      ) : null}
    </div>
  );
}

function derivePathSegment(pathname: string): string {
  // "/admin" -> "today" (Navigate hasn't fired yet for breadcrumb's first render)
  // "/admin/today" -> "today"
  // "/admin/clubs/abc-123" -> "clubs/:clubId"
  const stripped = pathname.replace(/^\/admin\/?/, "");
  if (!stripped) return "today";
  if (stripped.startsWith("clubs/") && stripped !== "clubs") return "clubs/:clubId";
  return stripped;
}

function appendOnboardingQuery(current: URLSearchParams): string {
  const next = new URLSearchParams(current);
  next.set("onboarding", "1");
  return `?${next.toString()}`;
}
```

Notes:
- `PlatformAdminOnboardingWizard` currently exposes `onPreview`, `onCommit`, `onCreated`. This task adds an `onDirtyChange` callback prop. If the wizard does not yet accept it, **extend the wizard prop type** in this same task to accept the optional callback. Wire it inside the wizard's effect that observes step/form state.
- `commitPlatformAdminOnboarding` is the existing API function — if not currently exported, add it to `platform-admin-api.ts` as a thin wrapper around the existing mutation logic the route used to do directly. (Confirm during execution by reading `platform-admin-api.ts`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-shell-layout.test.tsx`
Expected: PASS — 4 cases green.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/route/admin-shell-layout.tsx \
        front/features/platform-admin/route/admin-shell-layout.test.tsx \
        front/features/platform-admin/route/admin-breadcrumb-context.tsx \
        front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx \
        front/features/platform-admin/api/platform-admin-api.ts
git commit -m "platform-admin: add shell layout with strip, nav, breadcrumb, and onboarding modal"
```

---

## Task 14: AdminComingSoonRoute

**Files:**
- Create: `front/features/platform-admin/route/admin-coming-soon-route.tsx`
- Create: `front/features/platform-admin/route/admin-coming-soon-route.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AdminRouteDescriptor } from "@/features/platform-admin/route/admin-route-catalog";
import {
  AdminComingSoonRoute,
  adminComingSoonLoader,
} from "./admin-coming-soon-route";

const descriptor: AdminRouteDescriptor = {
  path: "audit",
  label: "감사",
  group: "review",
  groupLabel: "감사/분석",
  slice: "S7",
  status: "coming_soon",
  requiredCapability: "view_audit",
  comingSoon: {
    title: "Audit / Activity ledger",
    summary: "통합 ledger 요약 문장.",
    bullets: ["a", "b", "c"],
    docHref: "/docs/superpowers/specs/2026-05-25-readmates-admin-vnext-roadmap-design.md#s7",
  },
};

describe("AdminComingSoonRoute", () => {
  it("renders the descriptor via the route loader", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: AdminComingSoonRoute,
        loader: adminComingSoonLoader(descriptor),
      },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("heading", { name: "Audit / Activity ledger" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-coming-soon-route.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
import { useLoaderData } from "react-router-dom";
import { AdminComingSoon } from "@/features/platform-admin/ui/admin-coming-soon";
import type { AdminRouteDescriptor } from "@/features/platform-admin/route/admin-route-catalog";

export function adminComingSoonLoader(descriptor: AdminRouteDescriptor) {
  return async () => descriptor;
}

export function AdminComingSoonRoute() {
  const descriptor = useLoaderData() as AdminRouteDescriptor;
  return <AdminComingSoon descriptor={descriptor} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-coming-soon-route.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/route/admin-coming-soon-route.tsx \
        front/features/platform-admin/route/admin-coming-soon-route.test.tsx
git commit -m "platform-admin: add shared coming-soon route component"
```

---

## Task 15: Route module — `front/src/app/routes/admin.tsx`

**Files:**
- Create: `front/src/app/routes/admin.tsx`

This module iterates the catalog and assembles the full `/admin` tree.

- [ ] **Step 1: Write the file**

```tsx
import type { QueryClient } from "@tanstack/react-query";
import { Navigate, type RouteObject } from "react-router-dom";
import { RouteErrorBoundary } from "@/src/app/route-error";
import { NotFoundRoute } from "@/src/app/route-error";
import { RequirePlatformAdmin } from "@/src/app/route-guards";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";
import { adminShellLoaderFactory } from "@/features/platform-admin/route/admin-shell-data";
import {
  ADMIN_CLUB_DETAIL_ROUTE,
  ADMIN_ROUTES,
  type AdminRouteDescriptor,
} from "@/features/platform-admin/route/admin-route-catalog";

export function adminRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      id: "app-admin",
      path: "/admin",
      errorElement: <RouteErrorBoundary variant="auth" />,
      hydrateFallbackElement: <ReadmatesRouteLoading label="플랫폼 관리를 불러오는 중" variant="auth" />,
      loader: adminShellLoaderFactory(queryClient),
      lazy: async () => {
        const { AdminShellLayout } = await import(
          "@/features/platform-admin/route/admin-shell-layout"
        );
        function AdminShellElement() {
          return (
            <RequirePlatformAdmin>
              <AdminShellLayout />
            </RequirePlatformAdmin>
          );
        }
        return { Component: AdminShellElement };
      },
      children: buildChildren(queryClient),
    },
  ];
}

function buildChildren(queryClient: QueryClient): RouteObject[] {
  const children: RouteObject[] = [
    { index: true, element: <Navigate to="today" replace /> },
  ];
  for (const route of ADMIN_ROUTES) {
    children.push(
      route.status === "ready"
        ? readyChild(route, queryClient)
        : comingSoonChild(route),
    );
  }
  children.push(clubDetailChild(queryClient));
  children.push({ path: "*", element: <NotFoundRoute variant="auth" /> });
  return children;
}

function readyChild(route: AdminRouteDescriptor, queryClient: QueryClient): RouteObject {
  switch (route.path) {
    case "today":
      return {
        path: "today",
        lazy: async () => {
          const [{ AdminTodayRoute }, { adminTodayLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-today-route"),
            import("@/features/platform-admin/route/admin-today-data"),
          ]);
          return { Component: AdminTodayRoute, loader: adminTodayLoaderFactory(queryClient) };
        },
      };
    case "clubs":
      return {
        path: "clubs",
        lazy: async () => {
          const [{ AdminClubsRoute }, { adminClubsLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-clubs-route"),
            import("@/features/platform-admin/route/admin-clubs-data"),
          ]);
          return { Component: AdminClubsRoute, loader: adminClubsLoaderFactory(queryClient) };
        },
      };
    case "ai-ops":
      return {
        path: "ai-ops",
        lazy: async () => {
          const [{ AdminAiOpsRoute }, { adminAiOpsLoaderFactory }] = await Promise.all([
            import("@/features/platform-admin/route/admin-ai-ops-route"),
            import("@/features/platform-admin/route/admin-ai-ops-data"),
          ]);
          return { Component: AdminAiOpsRoute, loader: adminAiOpsLoaderFactory(queryClient) };
        },
      };
    case "support":
      return {
        path: "support",
        lazy: async () => {
          const { AdminSupportRoute } = await import(
            "@/features/platform-admin/route/admin-support-route"
          );
          return { Component: AdminSupportRoute };
        },
      };
    default:
      throw new Error(`No ready route wired for catalog path ${route.path}`);
  }
}

function comingSoonChild(descriptor: AdminRouteDescriptor): RouteObject {
  return {
    path: descriptor.path,
    lazy: async () => {
      const { AdminComingSoonRoute, adminComingSoonLoader } = await import(
        "@/features/platform-admin/route/admin-coming-soon-route"
      );
      return {
        Component: AdminComingSoonRoute,
        loader: adminComingSoonLoader(descriptor),
      };
    },
  };
}

function clubDetailChild(queryClient: QueryClient): RouteObject {
  return {
    path: ADMIN_CLUB_DETAIL_ROUTE.path,
    lazy: async () => {
      const [{ AdminClubDetailRoute }, { adminClubDetailLoaderFactory }] = await Promise.all([
        import("@/features/platform-admin/route/admin-club-detail-route"),
        import("@/features/platform-admin/route/admin-club-detail-data"),
      ]);
      return {
        Component: AdminClubDetailRoute,
        loader: adminClubDetailLoaderFactory(queryClient),
      };
    },
  };
}
```

Note: TypeScript will not compile yet because the `admin-today-*`, `admin-clubs-*`, `admin-club-detail-*`, `admin-ai-ops-*`, `admin-support-*` modules don't exist. Tasks 17–21 create them. To keep this commit green, either:

- Defer this task until after Tasks 17–21, OR
- Commit this file with the imports commented out and uncomment as each task lands.

**Chosen approach:** defer the wiring into `router.tsx` (Task 16) until 17–21 are done; for this task, create `admin.tsx` with the ready-child cases that have lazy imports satisfied by Tasks 17–21. The file is unreferenced until Task 16, so type-checking can be deferred until then.

If your environment fails `pnpm --dir front build` on this commit, defer creating `admin.tsx` until after Tasks 17–21. (No tests assert this file in isolation.)

- [ ] **Step 2: Commit**

```bash
git add front/src/app/routes/admin.tsx
git commit -m "platform-admin: add admin route module driven by catalog SSOT"
```

---

## Task 16: Wire admin routes into the router + remove old /admin block

**Files:**
- Modify: `front/src/app/router.tsx`
- Modify: `front/src/app/routes/auth.tsx`

⚠ Do this task AFTER Tasks 17–21 are complete, so removing the old `/admin` block does not break any route. Otherwise admin entries vanish without the new ones being registered yet.

- [ ] **Step 1: Wire `adminRoutes` into `buildRoutes`**

Modify `front/src/app/router.tsx`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { adminRoutes } from "@/src/app/routes/admin";
import { authRoutes } from "@/src/app/routes/auth";
import { hostRoutes } from "@/src/app/routes/host";
import { memberRoutes } from "@/src/app/routes/member";
import { publicRoutes } from "@/src/app/routes/public";
import { createReadmatesQueryClient } from "@/src/app/query-client";

export function buildRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    publicRoutes(queryClient),
    ...authRoutes(queryClient),
    ...memberRoutes(queryClient),
    ...hostRoutes(queryClient),
    ...adminRoutes(queryClient),
  ];
}
// ...rest unchanged
```

- [ ] **Step 2: Remove the old `/admin` block from `auth.tsx`**

In `front/src/app/routes/auth.tsx`, delete the entire `{ path: "/admin", ... }` block (lines that lazy-load `PlatformAdminRoute`). Keep the other entries (`/app/pending`, `/clubs/:clubSlug/app/pending`) intact.

- [ ] **Step 3: Run all front checks**

Run:
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`

Expected: all GREEN. The /admin entry point now resolves through the new shell.

- [ ] **Step 4: Commit**

```bash
git add front/src/app/router.tsx front/src/app/routes/auth.tsx
git commit -m "platform-admin: wire admin route family into router and drop legacy /admin"
```

---

## Task 17: `/admin/today` route

**Files:**
- Create: `front/features/platform-admin/route/admin-today-route.tsx`
- Create: `front/features/platform-admin/route/admin-today-data.ts`
- Create: `front/features/platform-admin/route/admin-today-route.test.tsx`

- [ ] **Step 1: Write the data file**

```ts
import type { QueryClient } from "@tanstack/react-query";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";

export function adminTodayLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminToday() {
    await Promise.all([
      queryClient.fetchQuery(platformAdminSummaryQuery()),
      queryClient.fetchQuery(platformAdminClubsQuery()),
      queryClient.fetchQuery(platformAdminAiOpsSummaryQuery()),
      queryClient.fetchQuery(platformAdminAiOpsJobsQuery()),
    ]);
    return null;
  };
}
```

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminTodayRoute } from "./admin-today-route";

describe("AdminTodayRoute", () => {
  it("renders the priority queue heading and selected-item brief regions", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
      platformRole: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      domainsRequiringAction: [],
    });
    queryClient.setQueryData(platformAdminClubsQuery().queryKey, { items: [] });
    queryClient.setQueryData(platformAdminAiOpsSummaryQuery().queryKey, null);
    queryClient.setQueryData(platformAdminAiOpsJobsQuery().queryKey, { items: [] });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/today"]}>
          <AdminTodayRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: /오늘 할 일/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /작업 큐/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-today-route.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the route component**

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ClubOperationsBrief } from "@/features/platform-admin/ui/club-operations-brief";
import { PlatformAdminWorkQueue } from "@/features/platform-admin/ui/platform-admin-work-queue";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminWorkbenchInput,
} from "@/features/platform-admin/model/platform-admin-workbench-model";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";

export function AdminTodayRoute() {
  const summary = useQuery(platformAdminSummaryQuery()).data!;
  const clubs = useQuery(platformAdminClubsQuery()).data!;
  const aiSummary = useQuery(platformAdminAiOpsSummaryQuery()).data ?? null;
  const aiJobs = useQuery(platformAdminAiOpsJobsQuery()).data?.items ?? [];
  const [searchParams] = useSearchParams();
  const filter = searchParams.get("filter");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("selected"));

  const workbench = useMemo(() => {
    const input: PlatformAdminWorkbenchInput = {
      role: summary.platformRole,
      activeClubCount: summary.activeClubCount,
      domainActionRequiredCount: summary.domainActionRequiredCount,
      selectedClubId: deriveSelectedClubId(selectedId),
      clubs: clubs.items,
      domains: summary.domains ?? summary.domainsRequiringAction ?? [],
      aiJobs,
      aiDisabled: aiSummary?.disabled ?? false,
    };
    return buildPlatformAdminWorkbench(input);
  }, [summary, clubs, aiSummary, aiJobs, selectedId]);

  const filteredItems = useMemo(
    () => filterQueueItems(workbench.queueItems, filter),
    [workbench.queueItems, filter],
  );

  return (
    <section className="admin-today" aria-labelledby="admin-today-title">
      <header className="admin-today__header">
        <h1 id="admin-today-title" className="h1 editorial">오늘 할 일</h1>
        {filter ? <FilterBanner filter={filter} /> : null}
      </header>
      <div className="admin-today__columns">
        <section className="admin-today__queue" aria-label="작업 큐">
          <PlatformAdminWorkQueue
            items={filteredItems}
            selectedItemId={selectedId}
            onSelect={setSelectedId}
          />
        </section>
        <section className="admin-today__brief" aria-label="선택 항목 요약">
          <ClubOperationsBrief
            mode="brief"
            club={workbench.selectedClub}
            permissions={workbench.permissions}
          />
        </section>
      </div>
    </section>
  );
}

function deriveSelectedClubId(selected: string | null): string | null {
  if (!selected) return null;
  if (selected.startsWith("club-")) return selected.slice("club-".length);
  return null;
}

function filterQueueItems(items: ReadonlyArray<unknown>, filter: string | null): unknown[] {
  if (!filter) return [...items];
  // Concrete filter rules — implement against the new discriminated union.
  // setup_required: club items where status==="SETUP_REQUIRED"
  // ready_to_publish: club items where isClubReadyToPublish(...)
  // domain_action: club items where domainActionRequiredCount > 0
  // See model/admin-status-strip-model#isClubReadyToPublish for the predicate.
  // ... narrowed implementation here based on Task 4's type definitions
  return items.filter((item: any) => matchesFilter(item, filter));
}

function matchesFilter(item: any, filter: string): boolean {
  if (item.type !== "club") return false;
  if (filter === "setup_required") return item.status === "SETUP_REQUIRED";
  if (filter === "ready_to_publish") return item.readyToPublish === true;
  if (filter === "domain_action") return item.domainActionRequiredCount > 0;
  return true;
}

function FilterBanner({ filter }: { filter: string }) {
  const label =
    filter === "setup_required" ? "조치 필요"
      : filter === "ready_to_publish" ? "공개 준비"
      : filter === "domain_action" ? "도메인 조치"
      : filter;
  return (
    <p className="admin-today__filter-banner">
      필터: {label}
      <a href="/admin/today" className="admin-today__filter-clear"> · 해제</a>
    </p>
  );
}
```

Note: extend the club queue item shape (Task 4) so that `readyToPublish` boolean and `domainActionRequiredCount` are present on each club item — this keeps the filter pure. `ClubOperationsBrief` must accept a new `mode: "brief" | "detail"` prop (default `"detail"`). Add the prop to that component now with `mode="brief"` reducing the rendered sections per the spec (header + reason + safe next action + drill link only).

- [ ] **Step 5: Update `PlatformAdminWorkQueue` to accept the new mixed item type**

The existing queue UI receives only club items. Change its props to:

```ts
type Props = {
  items: ReadonlyArray<WorkbenchQueueItem>;
  selectedItemId: string | null;
  onSelect: (id: string) => void;
};
```

Render branches by `item.type` ("club" vs "ai"). Concrete row rendering:

- club row: existing visual (slug + reason + severity badge), clickable, `selectedItemId === item.id` highlight
- ai row: `[AI {label}]` prefix + club name + session title + severity badge

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-today-route.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/platform-admin/route/admin-today-route.tsx \
        front/features/platform-admin/route/admin-today-data.ts \
        front/features/platform-admin/route/admin-today-route.test.tsx \
        front/features/platform-admin/ui/platform-admin-work-queue.tsx \
        front/features/platform-admin/ui/club-operations-brief.tsx
git commit -m "platform-admin: split /admin/today triage console route"
```

---

## Task 18: `/admin/clubs` route

**Files:**
- Create: `front/features/platform-admin/route/admin-clubs-route.tsx`
- Create: `front/features/platform-admin/route/admin-clubs-data.ts`
- Create: `front/features/platform-admin/route/admin-clubs-route.test.tsx`

- [ ] **Step 1: Write the loader**

```ts
import type { QueryClient } from "@tanstack/react-query";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";

export function adminClubsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminClubs() {
    await queryClient.fetchQuery(platformAdminClubsQuery());
    return null;
  };
}
```

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminClubsRoute } from "./admin-clubs-route";

function renderRoute(items: Array<{ clubId: string; slug: string; name: string; status: string; publicVisibility: string; domainCount: number; domainActionRequiredCount: number; firstHostOnboardingState: string; tagline: string; about: string }>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, { items });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/clubs"]}>
        <Routes>
          <Route path="/admin/clubs" element={<AdminClubsRoute />} />
          <Route path="/admin/clubs/:clubId" element={<div>club detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminClubsRoute", () => {
  it("renders a row per club with key columns", () => {
    renderRoute([
      { clubId: "c-1", slug: "alpha", name: "Alpha", status: "ACTIVE", publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 0, firstHostOnboardingState: "ASSIGNED", tagline: "", about: "" },
    ]);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("PRIVATE")).toBeInTheDocument();
  });

  it("navigates to club detail on row click", () => {
    renderRoute([
      { clubId: "c-1", slug: "alpha", name: "Alpha", status: "ACTIVE", publicVisibility: "PRIVATE", domainCount: 1, domainActionRequiredCount: 0, firstHostOnboardingState: "ASSIGNED", tagline: "", about: "" },
    ]);
    fireEvent.click(screen.getByRole("link", { name: /Alpha/ }));
    expect(screen.getByText("club detail")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-clubs-route.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the route**

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { platformAdminClubsQuery } from "@/features/platform-admin/queries/platform-admin-queries";

export function AdminClubsRoute() {
  const clubs = useQuery(platformAdminClubsQuery()).data!;
  return (
    <section className="admin-clubs" aria-labelledby="admin-clubs-title">
      <header className="admin-clubs__header">
        <h1 id="admin-clubs-title" className="h1 editorial">클럽</h1>
        <p className="body">플랫폼이 보유한 모든 클럽 목록입니다. 행을 클릭해서 운영 상세로 들어갑니다.</p>
      </header>
      <div role="table" className="admin-clubs__table" aria-label="클럽 목록">
        <div role="row" className="admin-clubs__row admin-clubs__row--head">
          <span role="columnheader">슬러그</span>
          <span role="columnheader">이름</span>
          <span role="columnheader">상태</span>
          <span role="columnheader">공개</span>
          <span role="columnheader">도메인</span>
          <span role="columnheader">첫 호스트</span>
        </div>
        {clubs.items.map((club) => (
          <Link
            key={club.clubId}
            to={`/admin/clubs/${club.clubId}`}
            role="row"
            className="admin-clubs__row"
          >
            <span role="cell">{club.slug}</span>
            <span role="cell">{club.name}</span>
            <span role="cell">{club.status}</span>
            <span role="cell">{club.publicVisibility}</span>
            <span role="cell">
              {club.domainCount}{club.domainActionRequiredCount > 0 ? ` · 조치 ${club.domainActionRequiredCount}` : ""}
            </span>
            <span role="cell">{firstHostLabel(club.firstHostOnboardingState)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function firstHostLabel(state: string): string {
  if (state === "ASSIGNED") return "지정됨";
  if (state === "INVITED") return "초대됨";
  return "미지정";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-clubs-route.test.tsx`
Expected: PASS — 2 cases.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/route/admin-clubs-route.tsx \
        front/features/platform-admin/route/admin-clubs-data.ts \
        front/features/platform-admin/route/admin-clubs-route.test.tsx
git commit -m "platform-admin: split /admin/clubs registry route"
```

---

## Task 19: `/admin/clubs/:clubId` route

**Files:**
- Create: `front/features/platform-admin/route/admin-club-detail-route.tsx`
- Create: `front/features/platform-admin/route/admin-club-detail-data.ts`
- Create: `front/features/platform-admin/route/admin-club-detail-route.test.tsx`

The detail route composes existing sections: `ClubOperationsBrief` (detail mode), `ClubPublishChecklist`, `DomainProvisioningPanel`, `SupportAccessGrantsPanel`. It also pushes the club name into `AdminBreadcrumbContext` via an effect.

- [ ] **Step 1: Write the loader**

```ts
import type { QueryClient } from "@tanstack/react-query";
import {
  platformAdminClubsQuery,
  platformAdminSupportGrantsQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import type { LoaderFunctionArgs } from "react-router-dom";

export function adminClubDetailLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminClubDetail(args: LoaderFunctionArgs) {
    const clubId = args.params.clubId;
    if (!clubId) throw new Response("Missing clubId", { status: 400 });
    await Promise.all([
      queryClient.fetchQuery(platformAdminClubsQuery()),
      queryClient.fetchQuery(platformAdminSupportGrantsQuery(clubId)),
    ]);
    return { clubId };
  };
}
```

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  platformAdminClubsQuery,
  platformAdminSupportGrantsQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import {
  AdminClubDetailRoute,
  adminClubDetailLoaderFactory,
} from "./admin-club-detail-route";

describe("AdminClubDetailRoute", () => {
  it("renders 'not found' card when clubId does not exist", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(platformAdminClubsQuery().queryKey, { items: [] });
    queryClient.setQueryData(platformAdminSupportGrantsQuery("missing").queryKey, []);
    const router = createMemoryRouter(
      [{
        path: "/admin/clubs/:clubId",
        Component: AdminClubDetailRoute,
        loader: adminClubDetailLoaderFactory(queryClient),
      }],
      { initialEntries: ["/admin/clubs/missing"] },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/해당 클럽을 찾을 수 없습니다/)).toBeInTheDocument();
  });

  it("renders the detail sections for a known club", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(platformAdminClubsQuery().queryKey, {
      items: [{
        clubId: "c-1", slug: "alpha", name: "Alpha", tagline: "", about: "",
        status: "ACTIVE", publicVisibility: "PRIVATE",
        domainCount: 0, domainActionRequiredCount: 0, firstHostOnboardingState: "ASSIGNED",
      }],
    });
    queryClient.setQueryData(platformAdminSupportGrantsQuery("c-1").queryKey, []);
    const router = createMemoryRouter(
      [{
        path: "/admin/clubs/:clubId",
        Component: AdminClubDetailRoute,
        loader: adminClubDetailLoaderFactory(queryClient),
      }],
      { initialEntries: ["/admin/clubs/c-1"] },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Alpha/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-club-detail-route.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the route**

```tsx
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLoaderData } from "react-router-dom";
import { ClubOperationsBrief } from "@/features/platform-admin/ui/club-operations-brief";
import { ClubPublishChecklist } from "@/features/platform-admin/ui/club-publish-checklist";
import { DomainProvisioningPanel } from "@/features/platform-admin/ui/domain-provisioning-panel";
import { SupportAccessGrantsPanel } from "@/features/platform-admin/ui/support-access-grants-panel";
import {
  platformAdminClubsQuery,
  platformAdminSupportGrantsQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { useAdminBreadcrumbExtra } from "@/features/platform-admin/route/admin-breadcrumb-context";

export { adminClubDetailLoaderFactory } from "./admin-club-detail-data";

export function AdminClubDetailRoute() {
  const { clubId } = useLoaderData() as { clubId: string };
  const clubs = useQuery(platformAdminClubsQuery()).data!;
  const grants = useQuery(platformAdminSupportGrantsQuery(clubId)).data ?? [];
  const club = clubs.items.find((c) => c.clubId === clubId) ?? null;
  const { setExtra } = useAdminBreadcrumbExtra();

  useEffect(() => {
    setExtra(club?.name ?? null);
    return () => setExtra(null);
  }, [club?.name, setExtra]);

  if (!club) {
    return (
      <section className="admin-club-detail admin-club-detail--missing">
        <h1 className="h2">해당 클럽을 찾을 수 없습니다.</h1>
        <Link to="/admin/clubs" className="btn btn-primary btn-sm">클럽 목록으로 →</Link>
      </section>
    );
  }

  return (
    <section className="admin-club-detail" aria-labelledby="admin-club-detail-title">
      <header className="admin-club-detail__header">
        <h1 id="admin-club-detail-title" className="h1 editorial">{club.name}</h1>
        <p className="body">{club.slug} · {club.status} · {club.publicVisibility}</p>
      </header>
      <ClubPublishChecklist club={club} />
      <ClubOperationsBrief mode="detail" club={club} permissions={null /* TBD: derive from role */} />
      <DomainProvisioningPanel clubId={club.clubId} />
      <SupportAccessGrantsPanel clubId={club.clubId} grants={grants} />
    </section>
  );
}
```

Notes during execution:
- The exact props of `ClubPublishChecklist`, `ClubOperationsBrief`, `DomainProvisioningPanel`, `SupportAccessGrantsPanel` must be verified against current code. The above uses representative call sites — adjust to actual signatures.
- `permissions` for `ClubOperationsBrief` should come from `buildPlatformAdminWorkbench` (workbench model) using the current role from `platformAdminSummaryQuery`. Wire it in rather than passing `null`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-club-detail-route.test.tsx`
Expected: PASS — 2 cases.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/route/admin-club-detail-route.tsx \
        front/features/platform-admin/route/admin-club-detail-data.ts \
        front/features/platform-admin/route/admin-club-detail-route.test.tsx
git commit -m "platform-admin: split /admin/clubs/:clubId detail route"
```

---

## Task 20: `/admin/ai-ops` route (+ AI_DISABLED 503 correction)

**Files:**
- Create: `front/features/platform-admin/route/admin-ai-ops-route.tsx`
- Create: `front/features/platform-admin/route/admin-ai-ops-data.ts`
- Create: `front/features/platform-admin/route/admin-ai-ops-route.test.tsx`
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts` (if 503 mapping not yet present)

- [ ] **Step 1: Write the loader**

```ts
import type { QueryClient } from "@tanstack/react-query";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";

export function adminAiOpsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAiOps() {
    await Promise.all([
      queryClient.fetchQuery(platformAdminAiOpsSummaryQuery()),
      queryClient.fetchQuery(platformAdminAiOpsJobsQuery()),
    ]);
    return null;
  };
}
```

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminAiOpsRoute } from "./admin-ai-ops-route";

function renderRoute(opts: { aiDisabled?: boolean; aiSummaryError?: boolean }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: "OWNER", activeClubCount: 0, domainActionRequiredCount: 0, domainsRequiringAction: [],
  });
  if (opts.aiSummaryError) {
    queryClient.setQueryData(platformAdminAiOpsSummaryQuery().queryKey, { __error: "AI_DISABLED" });
  } else {
    queryClient.setQueryData(platformAdminAiOpsSummaryQuery().queryKey, {
      disabled: opts.aiDisabled ?? false,
      activeCount: 0, staleCount: 0, failedCount: 0,
    });
  }
  queryClient.setQueryData(platformAdminAiOpsJobsQuery().queryKey, { items: [] });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/ai-ops"]}>
        <AdminAiOpsRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAiOpsRoute", () => {
  it("renders the standard AI Ops UI when not disabled", () => {
    renderRoute({});
    expect(screen.getByRole("heading", { name: /AI Ops/ })).toBeInTheDocument();
  });

  it("renders an AI_DISABLED operational state card when summary reports disabled", () => {
    renderRoute({ aiDisabled: true });
    expect(screen.getByText(/AI generation이 일시 비활성/)).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-ai-ops-route.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the route**

```tsx
import { useQuery } from "@tanstack/react-query";
import { PlatformAdminAiOps } from "@/features/platform-admin/ui/platform-admin-ai-ops";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
  useForceCancelPlatformAdminAiJobMutation,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";

export function AdminAiOpsRoute() {
  const role = useQuery(platformAdminSummaryQuery()).data!.platformRole;
  const summary = useQuery(platformAdminAiOpsSummaryQuery()).data;
  const jobs = useQuery(platformAdminAiOpsJobsQuery()).data?.items ?? [];
  const forceCancel = useForceCancelPlatformAdminAiJobMutation();

  if (summary?.disabled === true) {
    return (
      <section className="admin-ai-ops admin-ai-ops--disabled" aria-labelledby="admin-ai-ops-title">
        <h1 id="admin-ai-ops-title" className="h1 editorial">AI Ops</h1>
        <div className="admin-ai-ops__disabled-card">
          <p className="eyebrow">운영 정상</p>
          <p className="body">AI generation이 일시 비활성 상태입니다. job ledger는 kill switch가 꺼져 있는 동안 비어 있습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-ai-ops" aria-labelledby="admin-ai-ops-title">
      <h1 id="admin-ai-ops-title" className="h1 editorial">AI Ops</h1>
      <PlatformAdminAiOps
        role={role}
        summary={summary ?? null}
        jobs={jobs}
        loading={forceCancel.isPending}
        error={null}
        onForceCancel={async (jobId) => {
          if (!window.confirm("AI job을 강제 취소할까요?")) return;
          await forceCancel.mutateAsync(jobId);
        }}
      />
    </section>
  );
}
```

- [ ] **Step 5: Ensure AI_DISABLED 503 is recognized in the summary query**

Open `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts`. The summary query factory should be updated so a 503 response with body code `AI_DISABLED` resolves to `{ disabled: true, activeCount: 0, staleCount: 0, failedCount: 0 }` rather than throwing. Concrete change:

```ts
export function platformAdminAiOpsSummaryQuery() {
  return {
    queryKey: ["platform-admin", "ai-ops", "summary"] as const,
    async queryFn() {
      try {
        return await readmatesFetch<PlatformAdminAiOpsSummaryView>("/api/admin/ai-generation/summary");
      } catch (error) {
        if (isAiDisabledError(error)) {
          return { disabled: true, activeCount: 0, staleCount: 0, failedCount: 0 };
        }
        throw error;
      }
    },
  };
}

function isAiDisabledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const e = error as any;
  return e.status === 503 && e.body?.code === "AI_DISABLED";
}
```

Adjust the exact shape match against the existing `readmatesFetch` error type (read `front/shared/api/client.ts` if unsure).

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-ai-ops-route.test.tsx`
Expected: PASS — 2 cases.

- [ ] **Step 7: Commit**

```bash
git add front/features/platform-admin/route/admin-ai-ops-route.tsx \
        front/features/platform-admin/route/admin-ai-ops-data.ts \
        front/features/platform-admin/route/admin-ai-ops-route.test.tsx \
        front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts
git commit -m "platform-admin: split /admin/ai-ops route and surface AI_DISABLED operational state"
```

---

## Task 21: `/admin/support` light shell route

**Files:**
- Create: `front/features/platform-admin/route/admin-support-route.tsx`
- Create: `front/features/platform-admin/route/admin-support-route.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminSupportRoute } from "./admin-support-route";

describe("AdminSupportRoute", () => {
  it("renders the light shell with a pointer to clubs/:id and S4 preview", () => {
    render(
      <MemoryRouter>
        <AdminSupportRoute />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /지원/ })).toBeInTheDocument();
    expect(screen.getByText(/클럽 상세의 지원 패널에서/)).toBeInTheDocument();
    expect(screen.getByText(/통합 워크벤치는 S4/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /클럽 목록으로 가기/ })).toHaveAttribute("href", "/admin/clubs");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-support-route.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

```tsx
import { Link } from "react-router-dom";

export function AdminSupportRoute() {
  return (
    <section className="admin-support" aria-labelledby="admin-support-title">
      <h1 id="admin-support-title" className="h1 editorial">지원</h1>
      <div className="admin-support__notice">
        <p className="body">
          Support access grant 발행과 철회는 클럽 상세의 지원 패널에서 수행합니다. 검색·grant ledger·revoke reason 등 통합 워크벤치는 S4에서 제공됩니다.
        </p>
        <Link to="/admin/clubs" className="btn btn-primary btn-sm">클럽 목록으로 가기</Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front exec vitest run features/platform-admin/route/admin-support-route.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/route/admin-support-route.tsx \
        front/features/platform-admin/route/admin-support-route.test.tsx
git commit -m "platform-admin: add /admin/support light shell pointing to clubs detail and S4"
```

---

## Task 22: Delete legacy files

**Files:**
- Delete: `front/features/platform-admin/route/platform-admin-route.tsx`
- Delete: `front/features/platform-admin/route/platform-admin-data.ts`
- Delete: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- Delete: `front/features/platform-admin/ui/platform-admin-overview-metrics.tsx`
- Delete: associated test files for the above (e.g. `platform-admin-dashboard.test.tsx` if present)

After Task 16 wired the new routes, the legacy files are unreferenced. Delete them.

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "PlatformAdminRoute\|PlatformAdminDashboard\|PlatformAdminOverviewMetrics\|platform-admin-route\.tsx\|platform-admin-data\.ts\|platform-admin-dashboard\.tsx\|platform-admin-overview-metrics" front 2>/dev/null`

Expected: matches only inside files being deleted.

- [ ] **Step 2: Delete the files**

```bash
rm front/features/platform-admin/route/platform-admin-route.tsx
rm front/features/platform-admin/route/platform-admin-data.ts
rm front/features/platform-admin/ui/platform-admin-dashboard.tsx
rm front/features/platform-admin/ui/platform-admin-overview-metrics.tsx
# delete any associated *.test.tsx for the above (only if exists)
```

- [ ] **Step 3: Run full front checks**

Run:
- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`

Expected: GREEN.

- [ ] **Step 4: Commit**

```bash
git add -A front/features/platform-admin
git commit -m "platform-admin: remove legacy single-page admin route and dashboard"
```

---

## Task 23: E2E tests (Playwright)

**Files:**
- Create: `front/tests/e2e/admin-shell.spec.ts`

The E2E tests use dev-login with the seeded admin accounts.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";

test.describe("/admin shell", () => {
  test("admin-owner can navigate the full happy path", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("admin-owner@example.com");
    await page.getByRole("button", { name: /dev-login/i }).click();
    await page.waitForURL(/\/app|\/admin/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/today$/);
    await expect(page.getByRole("heading", { name: /오늘 할 일/ })).toBeVisible();

    await page.getByRole("link", { name: /클럽/, exact: false }).first().click();
    await expect(page).toHaveURL(/\/admin\/clubs$/);

    // Open new-club modal
    await page.getByRole("link", { name: "새 클럽" }).click();
    await expect(page).toHaveURL(/onboarding=1/);
    await expect(page.getByRole("dialog")).toBeVisible();

    // Close without dirty
    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).not.toHaveURL(/onboarding=1/);
  });

  test("host account is blocked from /admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("host@example.com");
    await page.getByRole("button", { name: /dev-login/i }).click();
    await page.waitForURL(/\/app/);

    await page.goto("/admin");
    await expect(page.getByText(/플랫폼 관리 권한이 없습니다/)).toBeVisible();
  });

  test("coming-soon route renders the slice descriptor", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("admin-owner@example.com");
    await page.getByRole("button", { name: /dev-login/i }).click();
    await page.goto("/admin/health");
    await expect(page.getByText(/준비 중 · S2/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Platform Ops Health" })).toBeVisible();
  });
});
```

(Selectors above are representative — adapt to the project's actual dev-login form labels and routes during execution. Reference: any existing Playwright test that uses dev-login.)

- [ ] **Step 2: Run the E2E suite**

Run: `pnpm --dir front test:e2e -- admin-shell`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add front/tests/e2e/admin-shell.spec.ts
git commit -m "platform-admin: cover /admin route family happy path and guards with E2E"
```

---

## Task 24: README + showcase doc updates

**Files:**
- Modify: `README.md`
- Modify: `docs/showcase/architecture-evidence.md`

- [ ] **Step 1: Update README role table**

In `README.md`, locate the "역할별 기능" (or equivalent role/feature) table. Under the platform admin row, replace the previous `/admin` single-page reference with one line describing the route family:

```markdown
| 플랫폼 어드민 | `/admin/today` 트리아지 · `/admin/clubs[/{clubId}]` 클럽 운영 · `/admin/ai-ops` AI · `/admin/support` 지원 + 좌측 nav · 상단 status strip · 4 페르소나 가드 |
```

(Adjust to match the existing table's column shape during execution.)

- [ ] **Step 2: Add a sanitized evidence line to showcase**

In `docs/showcase/architecture-evidence.md`, append a one-liner:

```markdown
- **Admin IA Foundation (2026-05-25)** — `/admin` 단일 페이지를 9-라우트 lazy-split 패밀리로 분해, `admin-route-catalog` 한 곳을 SSOT로 좌측 nav · 상단 status strip · empty state · 권한 매트릭스를 일관시켰다. 후속 슬라이스가 자기 라우트를 `coming_soon → ready`로 토글하는 한 줄 변경으로 자기 자리를 채울 수 있다.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/showcase/architecture-evidence.md
git commit -m "docs: reflect admin route family and SSOT evidence"
```

---

## Task 25: CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the Unreleased entry**

Under the existing `## Unreleased` → `### Engineering` block (or under `### Highlights` if visible), append:

```markdown
- **platform-admin:** `/admin`을 role-gated route family(`/admin/today` 트리아지, `/admin/clubs[/{clubId}]`, `/admin/ai-ops`, `/admin/support` + 4 coming-soon)로 분해하고 좌측 nav · 4-카드 status strip · catalog SSOT 기반 empty state를 도입했습니다. dev-login `admin-owner/operator/support@example.com` 3계정으로 로컬에서 SQL 변경 없이 검증 가능합니다. AI Ops `AI_DISABLED` 503은 운영 상태 카드로 분기합니다.
```

- [ ] **Step 2: Run the pre-push gate to verify the changelog**

Run: `./scripts/pre-push-check.sh`
Expected: GREEN. `Unreleased` guard accepts the entry.

- [ ] **Step 3: Run the public-release scan**

Run: `./scripts/public-release-check.sh`
Expected: GREEN. No private domain, OCID, or token-shaped string. The admin emails are at `example.com`, which is the sanitized convention.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for admin vNext S1 IA foundation"
```

---

## Self-review summary

This plan covers:
- Permission matrix model (Task 1) — spec §"권한 매트릭스" ✓
- Route catalog SSOT (Task 2) — spec §"Empty state · admin-route-catalog" ✓
- Status strip metric derivation (Task 3) — spec §"상단 status strip — 4 카드" ✓
- Workbench AI-item 합류 (Task 4) — spec §"/admin/today" + Q2-B ✓
- SQL dev seed (Task 5) — spec §"Dev-login admin seed" ✓
- Dev seed allowlist (Task 6) — spec §"`JdbcMemberAccountAdapter.devSeedEmails` 확장" ✓
- UI building blocks (Tasks 7–11) — spec §"AdminShellLayout" + §"Onboarding wizard 모달화" + §"Empty state" ✓
- Route shell + loader (Tasks 12–14) — spec §"라우트 등록 — admin.tsx" + §"AdminShellLayout" ✓
- Route module + wiring (Tasks 15–16) — spec §"Lazy chunk 정책" + §"/admin 진입 시퀀스" ✓
- READY route migration (Tasks 17–21) — spec §"READY 라우트 마이그레이션" ✓
- Legacy cleanup (Task 22) — spec §"삭제" list ✓
- E2E (Task 23), docs (Task 24), CHANGELOG (Task 25) — spec §"Acceptance gate" ✓

Acceptance-gate items that don't have a dedicated task but are covered transitively:
- `/admin` redirect to `/admin/today`: Task 15 (`index: true, element: <Navigate to="today" replace />`) + Task 23 E2E URL assertion.
- 4-persona guard tests: Task 23 E2E covers admin-pass and host-blocked. Add member and guest cases by extending the same spec file if depth is required (the existing `RequirePlatformAdmin` already has guest/non-admin handling that's exercised by the shell's loader path).
- ArchUnit baseline unchanged: confirm `./gradlew :server:check` is green after Task 6.
- `pre-push-check.sh` green: confirmed in Task 25.
- `public-release-check.sh` clean: confirmed in Task 25.

Inline edits made during self-review: none — all tasks reference types and helpers defined within the plan or already present in the codebase.

---

**Plan complete.**

**Execution options:**

1. **Subagent-Driven (recommended)** — Each task in this plan is implemented by a fresh subagent (Sonnet by default), with the orchestrator (Opus) reviewing between tasks. Best for the depth here: 25 tasks with strong dependency lines.

2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batching with checkpoints.

Which approach?
