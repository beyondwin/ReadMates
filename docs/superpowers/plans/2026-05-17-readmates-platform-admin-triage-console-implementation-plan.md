# ReadMates Platform Admin Triage Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin` into a platform triage console that shows operational priority, selected-club readiness, domains, onboarding state, and selected-club support access while preserving ReadMates' route-first frontend boundary and server authorization boundaries.

**Architecture:** Keep the feature inside `front/features/platform-admin` and split responsibilities into `api`, pure `model`, route-owned state/mutations, and prop-driven UI components. Use existing platform admin APIs for summary, clubs, onboarding, domains, and support grants; add one server hardening task so support grant create/revoke is enforced by application-service role checks, not only UI affordances.

**Tech Stack:** React 19, Vite, React Router 7, TypeScript, Vitest, Testing Library, Kotlin/Spring Boot, JDBC/MySQL/Flyway, JUnit 5.

---

## Source Spec

Design spec: `docs/superpowers/specs/2026-05-17-readmates-platform-admin-triage-console-design.md`

## Scope Boundary

In scope:

- `/admin` triage metrics, work queue, selected-club operations brief, publish checklist, selected-club domains, and selected-club support access grants.
- Pure frontend model for queue ordering and publish readiness.
- Route-owned selected-club state and API mutation coordination.
- UI role affordances for `OWNER`, `OPERATOR`, and `SUPPORT`.
- Server-side support access grant role hardening.
- Targeted frontend/server tests and docs checks.

Out of scope:

- Host sessions, members, attendance, RSVP, notes, publications, and notifications inside `/admin`.
- Platform admin user-management UI.
- Full audit-log browser.
- Platform user search for support grantee lookup.
- New domain provisioning backend workflow.

## File Structure

Server:

- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt`
  - Add a support-access capability property.
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt`
  - Enforce create/revoke role policy before touching persistence or audit ports.
- Modify: `server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt`
  - Add role denial tests for `OPERATOR` and `SUPPORT`.

Frontend model:

- Create: `front/features/platform-admin/model/platform-admin-workbench-model.ts`
  - Pure queue, checklist, metrics, and permission helpers.
- Create: `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`
  - Co-located Vitest coverage for pure model behavior.

Frontend route/API:

- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`
  - Own selected-club state, support-grant loading, and mutation state.
- Modify: `front/features/platform-admin/route/platform-admin-data.ts`
  - Keep loader focused on auth + summary + clubs.
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
  - Reuse existing `listSupportAccessGrantsByClub` and existing mutation functions.
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
  - Keep contract types stable; add only UI-required literal unions if current contracts are missing them.

Frontend UI:

- Modify: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
  - Convert to dashboard shell that receives a workbench view model and callbacks.
- Modify: `front/features/platform-admin/ui/platform-admin-club-registry.tsx`
  - Convert from plain registry to work queue, or replace imports with the new work queue component.
- Create: `front/features/platform-admin/ui/platform-admin-overview-metrics.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-work-queue.tsx`
- Create: `front/features/platform-admin/ui/club-operations-brief.tsx`
- Create: `front/features/platform-admin/ui/club-publish-checklist.tsx`
- Create: `front/features/platform-admin/ui/domain-provisioning-panel.tsx`
- Modify: `front/features/platform-admin/ui/support-access-grants-panel.tsx`
  - Bind grants to selected club instead of manual `clubId` entry.
- Modify: `front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx`
  - Improve placement/copy only; do not move API calls into UI.
- Modify: `front/src/styles/globals.css`
  - Add admin triage layout, responsive behavior, and state styles.

Frontend tests:

- Modify: `front/tests/unit/platform-admin.test.tsx`
  - Add route/UI integration tests for queue, selection, support grant loading, and role affordances.

Docs:

- Optionally modify: `docs/development/architecture.md`
  - Only if implementation reveals a new platform-admin behavior that is not already represented.

---

## Task 1: Server Support Access Role Hardening

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt`

- [ ] **Step 1: Add failing controller tests for grant create/revoke policy**

Append these tests to `SupportAccessGrantControllerTest`:

```kotlin
@Test
fun `operator cannot create support access grant`() {
    val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
    val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

    mockMvc
        .post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Customer escalation ticket #1234",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
                """.trimIndent()
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isForbidden() }
        }
}

@Test
fun `support admin cannot create support access grant`() {
    val support = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")
    val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

    mockMvc
        .post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Customer escalation ticket #1234",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
                """.trimIndent()
            cookie(sessionCookieForUser(support))
        }.andExpect {
            status { isForbidden() }
        }
}

@Test
fun `operator cannot revoke support access grant`() {
    val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
    val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
    val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

    val createResult =
        mockMvc
            .post("/api/admin/support-access-grants") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "clubId": "$TEST_CLUB_ID",
                      "granteeUserId": "$grantee",
                      "scope": "HOST_SUPPORT_READ",
                      "reason": "Revoke permission test",
                      "expiresAt": "2099-01-01T12:00:00Z"
                    }
                    """.trimIndent()
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isOk() }
            }.andReturn()
    val grantId = checkNotNull(createResult.response.jsonPathValue<String>("$.id"))
    createdGrantIds += grantId

    mockMvc
        .delete("/api/admin/support-access-grants/$grantId") {
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isForbidden() }
        }
}
```

- [ ] **Step 2: Run the focused server test and confirm failure**

Run:

```bash
./server/gradlew -p server --tests com.readmates.club.api.SupportAccessGrantControllerTest clean test
```

Expected: the new role-denial tests fail because `SupportAccessGrantService` does not yet reject non-owner create/revoke calls.

- [ ] **Step 3: Add a role capability to `CurrentPlatformAdmin`**

Modify `CurrentPlatformAdmin`:

```kotlin
val canManageSupportAccess: Boolean
    get() = role == PlatformAdminRole.OWNER
```

Keep the existing properties unchanged.

- [ ] **Step 4: Enforce the capability in `SupportAccessGrantService`**

Add this import:

```kotlin
import com.readmates.shared.security.AccessDeniedException
```

At the start of `createSupportAccessGrant`, before `reason` validation, add:

```kotlin
if (!admin.canManageSupportAccess) {
    throw AccessDeniedException("Platform admin role cannot manage support access grants")
}
```

At the start of `revokeSupportAccessGrant`, before loading or revoking the grant, add the same check:

```kotlin
if (!admin.canManageSupportAccess) {
    throw AccessDeniedException("Platform admin role cannot manage support access grants")
}
```

- [ ] **Step 5: Run the focused server test**

Run:

```bash
./server/gradlew -p server --tests com.readmates.club.api.SupportAccessGrantControllerTest clean test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/shared/security/CurrentPlatformAdmin.kt \
  server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt \
  server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt
git commit -m "fix(admin): restrict support access grants to owners"
```

---

## Task 2: Pure Platform Admin Workbench Model

**Files:**

- Create: `front/features/platform-admin/model/platform-admin-workbench-model.ts`
- Create: `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`

- [ ] **Step 1: Write model tests first**

Create `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminWorkbenchInput,
} from "@/features/platform-admin/model/platform-admin-workbench-model";

const baseInput: PlatformAdminWorkbenchInput = {
  role: "OWNER",
  activeClubCount: 3,
  domainActionRequiredCount: 1,
  selectedClubId: null,
  clubs: [
    {
      clubId: "club-ready",
      slug: "ready-club",
      name: "Ready Club",
      tagline: "함께 읽는 클럽",
      about: "공개 소개가 입력되어 있습니다.",
      status: "ACTIVE",
      publicVisibility: "PRIVATE",
      domainCount: 0,
      domainActionRequiredCount: 0,
      firstHostOnboardingState: "ASSIGNED",
    },
    {
      clubId: "club-host-missing",
      slug: "host-missing",
      name: "Host Missing",
      tagline: "준비 중",
      about: "공개 소개가 입력되어 있습니다.",
      status: "SETUP_REQUIRED",
      publicVisibility: "PRIVATE",
      domainCount: 0,
      domainActionRequiredCount: 0,
      firstHostOnboardingState: "MISSING",
    },
    {
      clubId: "club-public",
      slug: "public-club",
      name: "Public Club",
      tagline: "공개 클럽",
      about: "이미 공개된 클럽입니다.",
      status: "ACTIVE",
      publicVisibility: "PUBLIC",
      domainCount: 1,
      domainActionRequiredCount: 1,
      firstHostOnboardingState: "ASSIGNED",
    },
  ],
  domains: [
    {
      id: "domain-public",
      clubId: "club-public",
      hostname: "public.example.com",
      kind: "SUBDOMAIN",
      status: "FAILED",
      desiredState: "ENABLED",
      manualAction: "NONE",
      errorCode: "DNS_NOT_CONNECTED",
      isPrimary: false,
      verifiedAt: null,
      lastCheckedAt: null,
    },
  ],
};

describe("platform admin workbench model", () => {
  it("orders blocked clubs before ready and stable clubs", () => {
    const workbench = buildPlatformAdminWorkbench(baseInput);

    expect(workbench.queueItems.map((item) => item.clubId)).toEqual([
      "club-host-missing",
      "club-public",
      "club-ready",
    ]);
    expect(workbench.selectedClub?.clubId).toBe("club-host-missing");
  });

  it("builds publish checklist and primary action for a ready private club", () => {
    const workbench = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedClubId: "club-ready",
    });

    expect(workbench.selectedClub?.publishChecklist.every((item) => item.passed)).toBe(true);
    expect(workbench.selectedClub?.primaryAction).toEqual({
      kind: "make-public",
      label: "공개 전환",
      disabled: false,
      reason: null,
    });
  });

  it("blocks publish when the first host is missing", () => {
    const workbench = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedClubId: "club-host-missing",
    });

    expect(workbench.selectedClub?.publishChecklist).toContainEqual({
      id: "first-host",
      label: "첫 호스트 지정",
      passed: false,
      detail: "첫 호스트가 아직 없습니다.",
    });
    expect(workbench.selectedClub?.primaryAction.disabled).toBe(true);
  });

  it("exposes role capabilities separately from queue state", () => {
    const owner = buildPlatformAdminWorkbench(baseInput);
    const support = buildPlatformAdminWorkbench({ ...baseInput, role: "SUPPORT" });

    expect(owner.permissions.canCreateSupportGrant).toBe(true);
    expect(support.permissions.canCreateSupportGrant).toBe(false);
    expect(support.permissions.canUpdateClub).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new test and confirm failure**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-workbench-model.test.ts
```

Expected: FAIL because `platform-admin-workbench-model.ts` does not exist.

- [ ] **Step 3: Implement the pure model**

Create `front/features/platform-admin/model/platform-admin-workbench-model.ts`:

```ts
export type PlatformAdminRole = "OWNER" | "OPERATOR" | "SUPPORT";
export type PlatformAdminClubStatus = "SETUP_REQUIRED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type PlatformAdminClubPublicVisibility = "PRIVATE" | "PUBLIC";
export type FirstHostOnboardingState = "MISSING" | "INVITED" | "ASSIGNED";
export type PlatformAdminDomainStatus =
  | "REQUESTED"
  | "ACTION_REQUIRED"
  | "PROVISIONING"
  | "ACTIVE"
  | "FAILED"
  | "DISABLED";

export type WorkQueueSeverity = "blocked" | "attention" | "ready" | "stable";
export type WorkQueueFilter = "needs-action" | "publish-ready" | "domains" | "all";

export type PlatformAdminWorkbenchClub = {
  clubId: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  status: PlatformAdminClubStatus;
  publicVisibility: PlatformAdminClubPublicVisibility;
  domainCount: number;
  domainActionRequiredCount: number;
  firstHostOnboardingState: FirstHostOnboardingState;
};

export type PlatformAdminWorkbenchDomain = {
  id: string;
  clubId: string;
  hostname: string;
  kind: string;
  status: PlatformAdminDomainStatus;
  desiredState: string;
  manualAction: string;
  errorCode: string | null;
  isPrimary: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
};

export type PlatformAdminWorkbenchInput = {
  role: PlatformAdminRole;
  activeClubCount: number;
  domainActionRequiredCount: number;
  selectedClubId: string | null;
  clubs: PlatformAdminWorkbenchClub[];
  domains: PlatformAdminWorkbenchDomain[];
};

export type PlatformAdminPermissionView = {
  canCreateClub: boolean;
  canUpdateClub: boolean;
  canManageDomains: boolean;
  canCreateSupportGrant: boolean;
  canRevokeSupportGrant: boolean;
};

export type PublishChecklistItem = {
  id: "public-info" | "first-host" | "lifecycle" | "domains";
  label: string;
  passed: boolean;
  detail: string;
};

export type SelectedClubAction =
  | { kind: "make-public"; label: string; disabled: boolean; reason: string | null }
  | { kind: "make-private"; label: string; disabled: boolean; reason: string | null }
  | { kind: "none"; label: string; disabled: true; reason: string };

export type PlatformAdminWorkQueueItem = {
  clubId: string;
  slug: string;
  name: string;
  severity: WorkQueueSeverity;
  reason: string;
  primaryActionLabel: string;
  badges: string[];
  sortRank: number;
};

export type PlatformAdminSelectedClubBrief = PlatformAdminWorkbenchClub & {
  domains: PlatformAdminWorkbenchDomain[];
  publishChecklist: PublishChecklistItem[];
  primaryAction: SelectedClubAction;
  queueItem: PlatformAdminWorkQueueItem;
};

export type PlatformAdminWorkbenchView = {
  permissions: PlatformAdminPermissionView;
  metrics: {
    platformRole: PlatformAdminRole;
    activeClubCount: number;
    needsActionCount: number;
    domainActionRequiredCount: number;
    publishReadyCount: number;
  };
  queueItems: PlatformAdminWorkQueueItem[];
  selectedClub: PlatformAdminSelectedClubBrief | null;
};

export function buildPlatformAdminWorkbench(input: PlatformAdminWorkbenchInput): PlatformAdminWorkbenchView {
  const domainsByClub = groupDomainsByClub(input.domains);
  const queueItems = input.clubs
    .map((club) => buildQueueItem(club, domainsByClub.get(club.clubId) ?? []))
    .sort((a, b) => a.sortRank - b.sortRank || a.name.localeCompare(b.name, "ko-KR"));
  const selectedClubId = selectClubId(input.selectedClubId, queueItems);
  const selectedClub = input.clubs.find((club) => club.clubId === selectedClubId) ?? null;
  const selectedDomains = selectedClub ? domainsByClub.get(selectedClub.clubId) ?? [] : [];
  const selectedQueueItem = queueItems.find((item) => item.clubId === selectedClub?.clubId) ?? null;

  return {
    permissions: permissionsForRole(input.role),
    metrics: {
      platformRole: input.role,
      activeClubCount: input.activeClubCount,
      needsActionCount: queueItems.filter((item) => item.severity === "blocked" || item.severity === "attention").length,
      domainActionRequiredCount: input.domainActionRequiredCount,
      publishReadyCount: queueItems.filter((item) => item.primaryActionLabel === "공개 전환").length,
    },
    queueItems,
    selectedClub: selectedClub && selectedQueueItem
      ? {
          ...selectedClub,
          domains: selectedDomains,
          publishChecklist: buildPublishChecklist(selectedClub, selectedDomains),
          primaryAction: buildPrimaryAction(selectedClub, selectedDomains),
          queueItem: selectedQueueItem,
        }
      : null,
  };
}

export function filterQueueItems(
  items: PlatformAdminWorkQueueItem[],
  filter: WorkQueueFilter,
): PlatformAdminWorkQueueItem[] {
  switch (filter) {
    case "needs-action":
      return items.filter((item) => item.severity === "blocked" || item.severity === "attention");
    case "publish-ready":
      return items.filter((item) => item.primaryActionLabel === "공개 전환");
    case "domains":
      return items.filter((item) => item.badges.some((badge) => badge.startsWith("domain ")));
    case "all":
      return items;
  }
}

function permissionsForRole(role: PlatformAdminRole): PlatformAdminPermissionView {
  const canOperate = role === "OWNER" || role === "OPERATOR";
  return {
    canCreateClub: canOperate,
    canUpdateClub: canOperate,
    canManageDomains: canOperate,
    canCreateSupportGrant: role === "OWNER",
    canRevokeSupportGrant: role === "OWNER",
  };
}

function buildQueueItem(
  club: PlatformAdminWorkbenchClub,
  domains: PlatformAdminWorkbenchDomain[],
): PlatformAdminWorkQueueItem {
  const checklist = buildPublishChecklist(club, domains);
  const failedDomain = domains.find((domain) => domain.status === "FAILED");
  const actionRequiredDomain = domains.find((domain) => domain.status === "ACTION_REQUIRED");
  const badges = [club.status, club.publicVisibility, `host ${club.firstHostOnboardingState}`];

  if (failedDomain) {
    return {
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "attention",
      reason: `${failedDomain.hostname} 도메인 확인이 실패했습니다.`,
      primaryActionLabel: "도메인 확인",
      badges: [...badges, "domain FAILED"],
      sortRank: 20,
    };
  }

  if (actionRequiredDomain) {
    return {
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "attention",
      reason: `${actionRequiredDomain.hostname} 연결 작업이 필요합니다.`,
      primaryActionLabel: "도메인 확인",
      badges: [...badges, "domain ACTION_REQUIRED"],
      sortRank: 30,
    };
  }

  if (!checklist.every((item) => item.passed)) {
    return {
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "blocked",
      reason: checklist.find((item) => !item.passed)?.detail ?? "공개 준비 조건을 확인해야 합니다.",
      primaryActionLabel: "체크리스트",
      badges,
      sortRank: 10,
    };
  }

  if (club.publicVisibility === "PRIVATE") {
    return {
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "ready",
      reason: "공개 전환 조건을 충족했습니다.",
      primaryActionLabel: "공개 전환",
      badges,
      sortRank: 40,
    };
  }

  return {
    clubId: club.clubId,
    slug: club.slug,
    name: club.name,
    severity: "stable",
    reason: "현재 공개 상태입니다.",
    primaryActionLabel: "검토",
    badges,
    sortRank: 50,
  };
}

function buildPublishChecklist(
  club: PlatformAdminWorkbenchClub,
  domains: PlatformAdminWorkbenchDomain[],
): PublishChecklistItem[] {
  const hasPublicInfo = [club.name, club.tagline, club.about].every((value) => value.trim().length > 0);
  const lifecycleAllowed = club.status !== "SUSPENDED" && club.status !== "ARCHIVED";
  const hasBlockingDomain = domains.some((domain) => domain.status === "FAILED");
  return [
    {
      id: "public-info",
      label: "공개 정보",
      passed: hasPublicInfo,
      detail: hasPublicInfo ? "이름, tagline, about이 입력되어 있습니다." : "공개 소개 정보가 비어 있습니다.",
    },
    {
      id: "first-host",
      label: "첫 호스트 지정",
      passed: club.firstHostOnboardingState === "ASSIGNED",
      detail: hostStateDetail(club.firstHostOnboardingState),
    },
    {
      id: "lifecycle",
      label: "운영 상태",
      passed: lifecycleAllowed,
      detail: lifecycleAllowed ? "공개 가능한 운영 상태입니다." : "정지 또는 보관 상태에서는 공개 전환하지 않습니다.",
    },
    {
      id: "domains",
      label: "도메인 상태",
      passed: !hasBlockingDomain,
      detail: hasBlockingDomain ? "실패한 도메인 확인이 있습니다." : "도메인 실패가 없습니다.",
    },
  ];
}

function buildPrimaryAction(
  club: PlatformAdminWorkbenchClub,
  domains: PlatformAdminWorkbenchDomain[],
): SelectedClubAction {
  const checklist = buildPublishChecklist(club, domains);
  const failed = checklist.find((item) => !item.passed);

  if (club.publicVisibility === "PUBLIC") {
    return { kind: "make-private", label: "비공개 전환", disabled: false, reason: null };
  }

  if (failed) {
    return { kind: "make-public", label: "공개 전환", disabled: true, reason: failed.detail };
  }

  return { kind: "make-public", label: "공개 전환", disabled: false, reason: null };
}

function groupDomainsByClub(domains: PlatformAdminWorkbenchDomain[]): Map<string, PlatformAdminWorkbenchDomain[]> {
  const grouped = new Map<string, PlatformAdminWorkbenchDomain[]>();
  for (const domain of domains) {
    grouped.set(domain.clubId, [...(grouped.get(domain.clubId) ?? []), domain]);
  }
  return grouped;
}

function selectClubId(
  requestedClubId: string | null,
  queueItems: PlatformAdminWorkQueueItem[],
): string | null {
  if (requestedClubId && queueItems.some((item) => item.clubId === requestedClubId)) {
    return requestedClubId;
  }
  return queueItems[0]?.clubId ?? null;
}

function hostStateDetail(state: FirstHostOnboardingState): string {
  switch (state) {
    case "ASSIGNED":
      return "첫 호스트가 지정되어 있습니다.";
    case "INVITED":
      return "첫 호스트 초대 수락을 기다리고 있습니다.";
    case "MISSING":
      return "첫 호스트가 아직 없습니다.";
  }
}
```

- [ ] **Step 4: Run model tests**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-workbench-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-workbench-model.ts \
  front/features/platform-admin/model/platform-admin-workbench-model.test.ts
git commit -m "feat(admin): add triage workbench model"
```

---

## Task 3: Route-Owned Selected Club And Support Grant State

**Files:**

- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`
- Modify: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add route test for selected-club support grant loading**

In `front/tests/unit/platform-admin.test.tsx`, add a test that renders `/admin`, clicks a club row, and expects the support-grant list endpoint for that club:

```ts
it("loads support access grants for the selected club", async () => {
  const ownerAuth: AuthMeResponse = {
    ...baseAuth,
    platformAdmin: {
      userId: "user-1",
      email: "owner@example.com",
      role: "OWNER",
    },
  };
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();

    if (url === "/api/bff/api/auth/me") {
      return Promise.resolve(new Response(JSON.stringify(ownerAuth), { status: 200 }));
    }

    if (url === "/api/bff/api/admin/summary") {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            platformRole: "OWNER",
            activeClubCount: 2,
            domainActionRequiredCount: 0,
            domains: [],
            domainsRequiringAction: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    if (url === "/api/bff/api/admin/clubs") {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                clubId: "club-1",
                slug: "first-club",
                name: "첫 클럽",
                tagline: "첫 클럽 tagline",
                about: "첫 클럽 소개",
                status: "ACTIVE",
                publicVisibility: "PUBLIC",
                domainCount: 0,
                domainActionRequiredCount: 0,
                firstHostOnboardingState: "ASSIGNED",
              },
              {
                clubId: "club-2",
                slug: "second-club",
                name: "둘째 클럽",
                tagline: "둘째 클럽 tagline",
                about: "둘째 클럽 소개",
                status: "ACTIVE",
                publicVisibility: "PRIVATE",
                domainCount: 0,
                domainActionRequiredCount: 0,
                firstHostOnboardingState: "ASSIGNED",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    if (url === "/api/bff/api/admin/support-access-grants?clubId=club-1") {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }

    if (url === "/api/bff/api/admin/support-access-grants?clubId=club-2") {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: "grant-1",
              clubId: "club-2",
              grantedByUserId: "owner-1",
              granteeUserId: "support-1",
              scope: "HOST_SUPPORT_READ",
              reason: "Support review",
              expiresAt: "2099-01-01T12:00:00Z",
              revokedAt: null,
              createdAt: "2026-05-17T00:00:00Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  installRouterRequestShim();
  const router = createMemoryRouter(routes, { initialEntries: ["/admin"] });
  const user = userEvent.setup();

  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );

  await user.click(await screen.findByRole("button", { name: /둘째 클럽/ }));

  expect(await screen.findByText("Support review")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/bff/api/admin/support-access-grants?clubId=club-2",
    expect.anything(),
  );
});
```

- [ ] **Step 2: Run the route test and confirm failure**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/platform-admin.test.tsx -t "loads support access grants"
```

Expected: FAIL because route state currently starts `activeGrants` as an empty array and does not load grants when selecting a club.

- [ ] **Step 3: Move selected club state into `PlatformAdminRoute`**

Modify imports in `platform-admin-route.tsx`:

```ts
import { useEffect, useMemo, useState } from "react";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminWorkbenchInput,
} from "@/features/platform-admin/model/platform-admin-workbench-model";
```

Include `listSupportAccessGrantsByClub` in API imports:

```ts
listSupportAccessGrantsByClub,
```

Add route state:

```ts
const [selectedClubId, setSelectedClubId] = useState<string | null>(data.clubs.items[0]?.clubId ?? null);
const [supportGrantLoadError, setSupportGrantLoadError] = useState<string | null>(null);
const [loadingSupportGrants, setLoadingSupportGrants] = useState(false);
```

Build the workbench in route:

```ts
const workbench = useMemo(() => {
  const input: PlatformAdminWorkbenchInput = {
    role: summary.platformRole,
    activeClubCount: summary.activeClubCount,
    domainActionRequiredCount: summary.domainActionRequiredCount,
    selectedClubId,
    clubs: clubs.items,
    domains: summary.domains ?? summary.domainsRequiringAction ?? [],
  };
  return buildPlatformAdminWorkbench(input);
}, [clubs.items, selectedClubId, summary]);
```

- [ ] **Step 4: Load support grants when selected club changes**

Add this effect:

```ts
useEffect(() => {
  const clubId = workbench.selectedClub?.clubId;
  if (!clubId) {
    setActiveGrants([]);
    return;
  }

  let cancelled = false;
  setLoadingSupportGrants(true);
  setSupportGrantLoadError(null);
  listSupportAccessGrantsByClub(clubId)
    .then((grants) => {
      if (!cancelled) {
        setActiveGrants(grants);
      }
    })
    .catch(() => {
      if (!cancelled) {
        setActiveGrants([]);
        setSupportGrantLoadError("지원 접근 권한을 불러오지 못했습니다.");
      }
    })
    .finally(() => {
      if (!cancelled) {
        setLoadingSupportGrants(false);
      }
    });

  return () => {
    cancelled = true;
  };
}, [workbench.selectedClub?.clubId]);
```

- [ ] **Step 5: Pass controlled props to the dashboard**

Update the `PlatformAdminDashboard` call to pass:

```tsx
workbench={workbench}
selectedClubId={workbench.selectedClub?.clubId ?? null}
onSelectClub={setSelectedClubId}
activeGrants={activeGrants}
loadingSupportGrants={loadingSupportGrants}
supportGrantLoadError={supportGrantLoadError}
```

Keep existing mutation handlers, but make `handleCreateGrant` use selected club when the UI no longer sends `clubId`:

```ts
async function handleCreateGrant(fields: CreateSupportAccessGrantFields) {
  const clubId = workbench.selectedClub?.clubId;
  if (!clubId) {
    throw new Error("No selected club for support access grant");
  }
  const grant = await createSupportAccessGrant({
    clubId,
    granteeUserId: fields.granteeUserId,
    scope: fields.scope,
    reason: fields.reason,
    expiresAt: fields.expiresAt,
  });
  setActiveGrants((current) => [grant, ...current]);
}
```

- [ ] **Step 6: Run the route test**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/platform-admin.test.tsx -t "loads support access grants"
```

Expected: PASS after the UI updates in Task 4 expose the grant row. If this step still fails because the UI does not render the new props yet, continue to Task 4 and rerun this exact command there.

- [ ] **Step 7: Commit after Task 4 passes**

Do not commit Task 3 alone if the intermediate route props do not compile before Task 4. Commit Tasks 3 and 4 together if needed:

```bash
git add front/features/platform-admin/route/platform-admin-route.tsx front/tests/unit/platform-admin.test.tsx
git commit -m "feat(admin): load selected club support grants"
```

---

## Task 4: Triage Dashboard UI Split

**Files:**

- Modify: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-club-registry.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-overview-metrics.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-work-queue.tsx`
- Create: `front/features/platform-admin/ui/club-operations-brief.tsx`
- Create: `front/features/platform-admin/ui/club-publish-checklist.tsx`
- Create: `front/features/platform-admin/ui/domain-provisioning-panel.tsx`
- Modify: `front/features/platform-admin/ui/support-access-grants-panel.tsx`
- Modify: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add dashboard rendering tests**

Add a focused rendering test:

```ts
it("renders a triage work queue and selected club brief", () => {
  render(
    <PlatformAdminDashboard
      workbench={{
        permissions: {
          canCreateClub: true,
          canUpdateClub: true,
          canManageDomains: true,
          canCreateSupportGrant: true,
          canRevokeSupportGrant: true,
        },
        metrics: {
          platformRole: "OWNER",
          activeClubCount: 1,
          needsActionCount: 1,
          domainActionRequiredCount: 0,
          publishReadyCount: 0,
        },
        queueItems: [
          {
            clubId: "club-1",
            slug: "reading-sai",
            name: "읽는사이",
            severity: "blocked",
            reason: "첫 호스트가 아직 없습니다.",
            primaryActionLabel: "체크리스트",
            badges: ["SETUP_REQUIRED", "PRIVATE", "host MISSING"],
            sortRank: 10,
          },
        ],
        selectedClub: {
          clubId: "club-1",
          slug: "reading-sai",
          name: "읽는사이",
          tagline: "함께 읽는 모임",
          about: "공개 소개",
          status: "SETUP_REQUIRED",
          publicVisibility: "PRIVATE",
          domainCount: 0,
          domainActionRequiredCount: 0,
          firstHostOnboardingState: "MISSING",
          domains: [],
          publishChecklist: [
            {
              id: "first-host",
              label: "첫 호스트 지정",
              passed: false,
              detail: "첫 호스트가 아직 없습니다.",
            },
          ],
          primaryAction: {
            kind: "make-public",
            label: "공개 전환",
            disabled: true,
            reason: "첫 호스트가 아직 없습니다.",
          },
          queueItem: {
            clubId: "club-1",
            slug: "reading-sai",
            name: "읽는사이",
            severity: "blocked",
            reason: "첫 호스트가 아직 없습니다.",
            primaryActionLabel: "체크리스트",
            badges: ["SETUP_REQUIRED", "PRIVATE", "host MISSING"],
            sortRank: 10,
          },
        },
      }}
      selectedClubId="club-1"
      onSelectClub={vi.fn()}
      activeGrants={[]}
    />,
  );

  expect(screen.getByRole("heading", { name: "플랫폼 관리" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "운영 작업 큐" })).toBeInTheDocument();
  expect(screen.getByText("첫 호스트가 아직 없습니다.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "읽는사이" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the dashboard test and confirm failure**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/platform-admin.test.tsx -t "renders a triage work queue"
```

Expected: FAIL because `PlatformAdminDashboard` does not yet accept `workbench`.

- [ ] **Step 3: Implement overview metrics**

Create `platform-admin-overview-metrics.tsx`:

```tsx
import type { PlatformAdminWorkbenchView } from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  metrics: PlatformAdminWorkbenchView["metrics"];
};

export function PlatformAdminOverviewMetrics({ metrics }: Props) {
  return (
    <section className="platform-admin-summary" aria-label="플랫폼 요약">
      <MetricCard label="플랫폼 역할" value={metrics.platformRole} />
      <MetricCard label="활성 클럽" value={metrics.activeClubCount.toLocaleString("ko-KR")} />
      <MetricCard label="조치 필요" value={metrics.needsActionCount.toLocaleString("ko-KR")} />
      <MetricCard label="공개 준비" value={metrics.publishReadyCount.toLocaleString("ko-KR")} />
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="surface platform-admin-metric">
      <p className="tiny muted platform-admin-metric__label">{label}</p>
      <p className="editorial platform-admin-metric__value">{value}</p>
    </article>
  );
}
```

- [ ] **Step 4: Implement work queue**

Create `platform-admin-work-queue.tsx`:

```tsx
import type { PlatformAdminWorkQueueItem } from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  items: PlatformAdminWorkQueueItem[];
  selectedClubId: string | null;
  onSelectClub?: (clubId: string) => void;
};

export function PlatformAdminWorkQueue({ items, selectedClubId, onSelectClub }: Props) {
  return (
    <section className="platform-admin-work-queue" aria-labelledby="platform-admin-work-queue-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Operations queue</p>
          <h2 id="platform-admin-work-queue-title" className="h3 editorial">
            운영 작업 큐
          </h2>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="platform-admin-club-list">
          {items.map((item) => (
            <button
              type="button"
              key={item.clubId}
              className="surface platform-admin-club-row platform-admin-work-queue__row"
              data-severity={item.severity}
              aria-pressed={item.clubId === selectedClubId}
              onClick={() => onSelectClub?.(item.clubId)}
            >
              <span className="platform-admin-club-row__main">
                <strong>{item.name}</strong>
                <span className="tiny muted">{item.slug}</span>
                <span className="tiny muted">{item.reason}</span>
              </span>
              <span className="platform-admin-domain-status">{item.primaryActionLabel}</span>
              <span className="platform-admin-work-queue__badges">
                {item.badges.map((badge) => (
                  <span className="platform-admin-domain-status" key={badge}>
                    {badge}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted platform-admin-domain-empty">표시할 클럽이 없습니다.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Implement publish checklist**

Create `club-publish-checklist.tsx`:

```tsx
import type {
  PlatformAdminPermissionView,
  PlatformAdminSelectedClubBrief,
} from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  club: PlatformAdminSelectedClubBrief;
  permissions: PlatformAdminPermissionView;
  saving?: boolean;
  onSetVisibility?: (publicVisibility: "PRIVATE" | "PUBLIC") => void;
};

export function ClubPublishChecklist({ club, permissions, saving = false, onSetVisibility }: Props) {
  const canUsePrimaryAction = permissions.canUpdateClub && !club.primaryAction.disabled;
  return (
    <section className="platform-admin-publish-checklist" aria-labelledby="platform-admin-publish-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Publish readiness</p>
          <h3 id="platform-admin-publish-title" className="h4 editorial">
            공개 준비 체크리스트
          </h3>
        </div>
      </div>
      <div className="platform-admin-publish-checklist__items">
        {club.publishChecklist.map((item) => (
          <div className="platform-admin-publish-checklist__item" data-state={item.passed ? "passed" : "blocked"} key={item.id}>
            <span aria-hidden="true">{item.passed ? "통과" : "확인"}</span>
            <strong>{item.label}</strong>
            <span className="tiny muted">{item.detail}</span>
          </div>
        ))}
      </div>
      {club.primaryAction.reason ? <p className="tiny danger">{club.primaryAction.reason}</p> : null}
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!canUsePrimaryAction || saving}
        onClick={() => {
          if (club.primaryAction.kind === "make-public") onSetVisibility?.("PUBLIC");
          if (club.primaryAction.kind === "make-private") onSetVisibility?.("PRIVATE");
        }}
      >
        {saving ? "저장 중" : club.primaryAction.label}
      </button>
      {!permissions.canUpdateClub ? <p className="tiny muted">현재 역할은 공개 상태를 변경할 수 없습니다.</p> : null}
    </section>
  );
}
```

- [ ] **Step 6: Implement domain panel**

Create `domain-provisioning-panel.tsx` by moving the current `DomainProvisioningRow` from `platform-admin-dashboard.tsx` into its own file. Export:

```tsx
export function DomainProvisioningPanel({
  domains,
  checkingDomainIds = new Set<string>(),
  domainCheckErrors = {},
  canManageDomains,
  onCheckDomain,
}: DomainProvisioningPanelProps) {
  return (
    <section className="platform-admin-domains" aria-labelledby="platform-admin-domains-title">
      <div className="platform-admin-domains__header">
        <div>
          <p className="eyebrow">Domain provisioning</p>
          <h3 id="platform-admin-domains-title" className="h4 editorial">
            선택 클럽 도메인
          </h3>
        </div>
      </div>
      {domains.length > 0 ? (
        <div className="platform-admin-domain-list">
          {domains.map((domain) => (
            <DomainProvisioningRow
              key={domain.id}
              domain={domain}
              isChecking={checkingDomainIds.has(domain.id)}
              checkError={domainCheckErrors[domain.id]}
              canManageDomains={canManageDomains}
              onCheckDomain={onCheckDomain}
            />
          ))}
        </div>
      ) : (
        <p className="muted platform-admin-domain-empty">선택한 클럽에 등록된 도메인이 없습니다.</p>
      )}
    </section>
  );
}
```

Keep the existing `domainActionText` switch exactly exhaustive over the current domain status union.

- [ ] **Step 7: Implement selected club brief**

Create `club-operations-brief.tsx`:

```tsx
import type {
  PlatformAdminPermissionView,
  PlatformAdminSelectedClubBrief,
} from "@/features/platform-admin/model/platform-admin-workbench-model";
import type { PlatformAdminClubRegistryItem } from "@/features/platform-admin/ui/platform-admin-club-registry";
import { ClubPublishChecklist } from "@/features/platform-admin/ui/club-publish-checklist";
import { DomainProvisioningPanel } from "@/features/platform-admin/ui/domain-provisioning-panel";
import { PlatformAdminClubDetail } from "@/features/platform-admin/ui/platform-admin-club-detail";
import {
  SupportAccessGrantsPanel,
  type CreateSupportAccessGrantFields,
  type SupportAccessGrantView,
} from "@/features/platform-admin/ui/support-access-grants-panel";

type Props = {
  club: PlatformAdminSelectedClubBrief | null;
  permissions: PlatformAdminPermissionView;
  savingClub?: boolean;
  checkingDomainIds?: ReadonlySet<string>;
  domainCheckErrors?: Record<string, string>;
  activeGrants?: SupportAccessGrantView[];
  loadingSupportGrants?: boolean;
  supportGrantLoadError?: string | null;
  onUpdateClub?: (clubId: string, request: {
    name?: string;
    tagline?: string;
    about?: string;
    publicVisibility?: "PRIVATE" | "PUBLIC";
  }) => Promise<PlatformAdminClubRegistryItem>;
  onSetVisibility?: (publicVisibility: "PRIVATE" | "PUBLIC") => void;
  onCheckDomain?: (domainId: string) => void;
  onCreateGrant?: (fields: CreateSupportAccessGrantFields) => Promise<void>;
  onRevokeGrant?: (grantId: string) => Promise<void>;
};

export function ClubOperationsBrief({
  club,
  permissions,
  savingClub = false,
  checkingDomainIds,
  domainCheckErrors,
  activeGrants = [],
  loadingSupportGrants = false,
  supportGrantLoadError = null,
  onUpdateClub,
  onSetVisibility,
  onCheckDomain,
  onCreateGrant,
  onRevokeGrant,
}: Props) {
  if (!club) {
    return (
      <section className="platform-admin-detail" aria-label="선택 클럽 상세">
        <p className="muted platform-admin-domain-empty">선택할 클럽이 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="platform-admin-detail platform-admin-brief" aria-labelledby="platform-admin-detail-title">
      <div>
        <p className="eyebrow">Club operations brief</p>
        <h2 id="platform-admin-detail-title" className="h3 editorial">
          {club.name}
        </h2>
        <p className="tiny muted">
          {club.slug} · {club.status} · {club.publicVisibility}
        </p>
      </div>
      <ClubPublishChecklist
        club={club}
        permissions={permissions}
        saving={savingClub}
        onSetVisibility={onSetVisibility}
      />
      <PlatformAdminClubDetail
        club={club}
        canUpdateClub={permissions.canUpdateClub}
        onUpdateClub={onUpdateClub}
      />
      <DomainProvisioningPanel
        domains={club.domains}
        checkingDomainIds={checkingDomainIds}
        domainCheckErrors={domainCheckErrors}
        canManageDomains={permissions.canManageDomains}
        onCheckDomain={onCheckDomain}
      />
      <SupportAccessGrantsPanel
        selectedClub={club}
        grants={activeGrants}
        loading={loadingSupportGrants}
        loadError={supportGrantLoadError}
        canCreateGrant={permissions.canCreateSupportGrant}
        canRevokeGrant={permissions.canRevokeSupportGrant}
        onCreateGrant={onCreateGrant}
        onRevokeGrant={onRevokeGrant}
      />
    </section>
  );
}
```

- [ ] **Step 8: Update dashboard shell**

Refactor `platform-admin-dashboard.tsx` so it imports the new components and accepts the controlled props from Task 3:

```tsx
type PlatformAdminDashboardProps = {
  workbench: PlatformAdminWorkbenchView;
  selectedClubId: string | null;
  onSelectClub?: (clubId: string) => void;
  // keep existing mutation props
};
```

The shell should render:

```tsx
<PlatformAdminOverviewMetrics metrics={workbench.metrics} />
<div className="platform-admin-console">
  <PlatformAdminWorkQueue
    items={workbench.queueItems}
    selectedClubId={selectedClubId}
    onSelectClub={onSelectClub}
  />
  <ClubOperationsBrief
    club={workbench.selectedClub}
    permissions={workbench.permissions}
    // pass mutation props through
  />
</div>
```

Keep `PlatformAdminOnboardingWizard` below the queue/brief console when `showOnboarding` is true.

- [ ] **Step 9: Run dashboard and route tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/platform-admin.test.tsx features/platform-admin/model/platform-admin-workbench-model.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add front/features/platform-admin/ui/platform-admin-dashboard.tsx \
  front/features/platform-admin/ui/platform-admin-club-registry.tsx \
  front/features/platform-admin/ui/platform-admin-overview-metrics.tsx \
  front/features/platform-admin/ui/platform-admin-work-queue.tsx \
  front/features/platform-admin/ui/club-operations-brief.tsx \
  front/features/platform-admin/ui/club-publish-checklist.tsx \
  front/features/platform-admin/ui/domain-provisioning-panel.tsx \
  front/features/platform-admin/ui/support-access-grants-panel.tsx \
  front/features/platform-admin/route/platform-admin-route.tsx \
  front/tests/unit/platform-admin.test.tsx
git commit -m "feat(admin): render triage console"
```

---

## Task 5: Onboarding And Domain State Synchronization

**Files:**

- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx`
- Modify: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add onboarding result state test**

Add a test that commits onboarding and verifies the created club becomes selected and returned domain appears in the selected domain panel:

```ts
it("selects the created club and shows returned domain after onboarding commit", async () => {
  const onPreview = vi.fn().mockResolvedValue({
    club: { slug: "new-club", available: true },
    firstHost: {
      kind: "NEW_USER",
      email: "host@example.com",
      existingUserId: null,
      existingUserName: null,
      requiredConfirmation: null,
    },
    domain: { hostname: "new-club.example.com", available: true },
  });
  const onCommit = vi.fn().mockResolvedValue({
    club: {
      clubId: "club-new",
      slug: "new-club",
      name: "새 클럽",
      tagline: "새 클럽 tagline",
      about: "새 클럽 소개",
      status: "SETUP_REQUIRED",
      publicVisibility: "PRIVATE",
      domainCount: 1,
      domainActionRequiredCount: 1,
      firstHostOnboardingState: "INVITED",
    },
    hostOnboarding: {
      kind: "INVITATION_CREATED",
      email: "host@example.com",
      userId: null,
      invitationId: "invite-1",
      acceptUrl: "https://readmates.example/invite/example",
      emailDelivery: { status: "SENT" },
    },
    domain: {
      id: "domain-new",
      clubId: "club-new",
      hostname: "new-club.example.com",
      kind: "SUBDOMAIN",
      status: "ACTION_REQUIRED",
      desiredState: "ENABLED",
      manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN",
      errorCode: null,
      isPrimary: false,
      verifiedAt: null,
      lastCheckedAt: null,
    },
  });

  render(<PlatformAdminOnboardingWizard onPreview={onPreview} onCommit={onCommit} />);

  const user = userEvent.setup();
  await user.type(screen.getByLabelText("클럽 이름"), "새 클럽");
  await user.type(screen.getByLabelText("Slug"), "new-club");
  await user.type(screen.getByLabelText("Tagline"), "새 클럽 tagline");
  await user.type(screen.getByLabelText("About"), "새 클럽 소개");
  await user.type(screen.getByLabelText("첫 호스트 이메일"), "host@example.com");
  await user.type(screen.getByLabelText("첫 호스트 이름"), "Host User");
  await user.click(screen.getByRole("button", { name: "미리 확인" }));
  await user.click(await screen.findByRole("button", { name: "클럽 생성" }));

  expect(await screen.findByText("new-club")).toBeInTheDocument();
  expect(screen.getByText("SENT")).toBeInTheDocument();
});
```

This test can stay component-level for the wizard result. Route-level state update is covered by adding assertions to the existing route onboarding test if one exists.

- [ ] **Step 2: Add route helper for domain insertion**

In `platform-admin-route.tsx`, add:

```ts
function prependOrReplaceDomain(
  domains: PlatformAdminDomainResponse[] | undefined,
  domain: PlatformAdminDomainResponse,
): PlatformAdminDomainResponse[] {
  const current = domains ?? [];
  if (current.some((candidate) => candidate.id === domain.id)) {
    return current.map((candidate) => (candidate.id === domain.id ? domain : candidate));
  }
  return [domain, ...current];
}
```

- [ ] **Step 3: Update onboarding commit handler**

Change `onCommitOnboarding` in `PlatformAdminRoute`:

```ts
onCommitOnboarding={async (request) => {
  const result = await commitPlatformAdminOnboarding(request);
  setClubs((current) => prependOrReplaceClub(current, result.club));
  setSelectedClubId(result.club.clubId);
  if (result.domain) {
    setSummary((current) => ({
      ...current,
      domains: prependOrReplaceDomain(current.domains, result.domain),
      domainsRequiringAction:
        result.domain.status === "ACTION_REQUIRED"
          ? prependOrReplaceDomain(current.domainsRequiringAction, result.domain)
          : current.domainsRequiringAction,
      domainActionRequiredCount:
        result.domain.status === "ACTION_REQUIRED"
          ? current.domainActionRequiredCount + 1
          : current.domainActionRequiredCount,
    }));
  }
  return result;
}}
```

Before finalizing, guard against double-counting if a domain already exists:

```ts
const alreadyTracked = current.domains?.some((candidate) => candidate.id === result.domain?.id) ?? false;
domainActionRequiredCount:
  result.domain.status === "ACTION_REQUIRED" && !alreadyTracked
    ? current.domainActionRequiredCount + 1
    : current.domainActionRequiredCount,
```

- [ ] **Step 4: Polish wizard result copy without changing API behavior**

In `platform-admin-onboarding-wizard.tsx`, keep the same request/result contract and adjust result rendering to show:

```tsx
{result ? (
  <div className="surface platform-admin-onboarding__result">
    <p className="eyebrow">생성 결과</p>
    <strong>{result.club.slug}</strong>
    <span>{result.hostOnboarding.kind}</span>
    <span>메일: {result.hostOnboarding.emailDelivery.status}</span>
    {result.domain ? <span>도메인: {result.domain.hostname} · {result.domain.status}</span> : null}
    {result.hostOnboarding.acceptUrl ? <code>{result.hostOnboarding.acceptUrl}</code> : null}
  </div>
) : null}
```

- [ ] **Step 5: Run focused frontend tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/platform-admin.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/route/platform-admin-route.tsx \
  front/features/platform-admin/ui/platform-admin-onboarding-wizard.tsx \
  front/tests/unit/platform-admin.test.tsx
git commit -m "feat(admin): sync onboarding results into triage state"
```

---

## Task 6: Visual Polish, Responsive Layout, And Accessibility

**Files:**

- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add accessibility assertions**

Add assertions to existing dashboard tests:

```ts
expect(screen.getByRole("heading", { name: "운영 작업 큐" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "플랫폼 요약" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /읽는사이/ })).toHaveAttribute("aria-pressed", "true");
```

If `region` does not map because the element is a `section` without an accessible name, keep the `aria-label="플랫폼 요약"` from Task 4 and use:

```ts
expect(screen.getByLabelText("플랫폼 요약")).toBeInTheDocument();
```

- [ ] **Step 2: Add triage layout CSS**

In `front/src/styles/globals.css`, extend the existing platform admin block with:

```css
.platform-admin-console {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.35fr);
  gap: 18px;
  align-items: start;
}

.platform-admin-work-queue,
.platform-admin-brief,
.platform-admin-publish-checklist,
.platform-admin-support-grants {
  display: grid;
  gap: 14px;
}

.platform-admin-work-queue__row {
  grid-template-columns: minmax(0, 1fr) auto;
  border: 1px solid var(--line);
}

.platform-admin-work-queue__row[aria-pressed="true"] {
  border-color: var(--ink);
  background: var(--surface-warm);
}

.platform-admin-work-queue__row[data-severity="blocked"] {
  border-left: 4px solid var(--danger);
}

.platform-admin-work-queue__row[data-severity="attention"] {
  border-left: 4px solid var(--accent);
}

.platform-admin-work-queue__row[data-severity="ready"] {
  border-left: 4px solid var(--success);
}

.platform-admin-work-queue__badges,
.platform-admin-publish-checklist__items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.platform-admin-publish-checklist__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 8px;
  align-items: start;
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  padding: 10px;
  background: var(--surface);
}

.platform-admin-publish-checklist__item .tiny {
  grid-column: 2;
}

.platform-admin-publish-checklist__item[data-state="blocked"] {
  border-color: var(--danger-line);
}
```

If variables such as `--surface-warm`, `--danger`, `--accent`, `--success`, or `--danger-line` do not exist in `globals.css`, use existing ReadMates variables already present in the file rather than introducing a new one-note palette.

- [ ] **Step 3: Add mobile layout CSS**

Inside the existing mobile media query for platform admin, add:

```css
.platform-admin-console {
  grid-template-columns: 1fr;
}

.platform-admin-work-queue__row {
  grid-template-columns: 1fr;
}

.platform-admin-work-queue__badges {
  justify-content: flex-start;
}
```

- [ ] **Step 4: Run frontend focused tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/platform-admin.test.tsx features/platform-admin/model/platform-admin-workbench-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Manually inspect the screen**

Start the frontend dev server:

```bash
pnpm --dir front dev
```

Open `/admin` with a platform-admin capable local/dev session. Inspect:

- Desktop: queue and selected brief appear side by side.
- Mobile width: queue appears above selected brief and controls do not overlap.
- Korean and English badges wrap without overflowing buttons.
- Disabled controls show visible reason text.
- Focus ring is visible on queue rows and action buttons.

If the dev server cannot authenticate a platform-admin session locally, record the reason and rely on unit tests plus static responsive inspection.

- [ ] **Step 6: Commit**

```bash
git add front/src/styles/globals.css front/tests/unit/platform-admin.test.tsx
git commit -m "style(admin): polish triage console layout"
```

---

## Task 7: Full Verification And Documentation

**Files:**

- Modify: `docs/development/architecture.md` only if behavior changed beyond the current documented platform-admin ownership.
- Modify: `CHANGELOG.md` only if the branch release process expects an Unreleased entry for this feature.

- [ ] **Step 1: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all commands PASS.

- [ ] **Step 2: Run server checks**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 3: Run E2E only if route/auth/BFF behavior changed**

If implementation changed route definitions, auth guards, BFF paths, or user-flow wiring, run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS. If no route/auth/BFF behavior changed, record this command as skipped with reason: "No route/auth/BFF behavior changed; `/admin` used existing route and API paths."

- [ ] **Step 4: Run documentation whitespace check for any docs touched**

Run with the exact changed docs:

```bash
git diff --check -- docs/superpowers/specs/2026-05-17-readmates-platform-admin-triage-console-design.md docs/superpowers/plans/2026-05-17-readmates-platform-admin-triage-console-implementation-plan.md
```

Expected: no output.

- [ ] **Step 5: Review public safety in changed docs and fixtures**

Run:

```bash
patterns=(
  'BEGIN .*PRIV''ATE KEY'
  'A''KIA[0-9A-Z]{16}'
  'o''cid1\.'
  '/Us''ers/'
  'readmates_''oci'
  'pass''word=[^[:space:]]+'
  'to''ken=[^[:space:]]+'
)
IFS='|'
rg -n "${patterns[*]}" docs/superpowers/specs/2026-05-17-readmates-platform-admin-triage-console-design.md docs/superpowers/plans/2026-05-17-readmates-platform-admin-triage-console-implementation-plan.md front/features/platform-admin front/tests/unit/platform-admin.test.tsx server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt
```

Expected: no secret-shaped matches. If the command reports public-safety policy prose or the scan command itself, record those matches as public-safe documentation text and verify there is no real secret, deployment identifier, or local machine path.

- [ ] **Step 6: Commit final docs or changelog updates**

If docs or changelog were changed during implementation:

```bash
git add docs/development/architecture.md CHANGELOG.md
git commit -m "docs(admin): document platform triage console"
```

Skip this commit when no implementation-time docs changed.

---

## Self-Review Checklist

- Spec coverage: Tasks cover support access role hardening, pure model, route state, queue/brief UI, onboarding/domain sync, visual polish, and validation.
- SOLID coverage: The plan introduces pure model boundaries, controlled route state, focused UI components, and server-side role enforcement.
- Placeholder scan: The plan contains no unfinished requirement markers and uses public-safe example values only.
- Type consistency: `PlatformAdminWorkbenchInput`, `PlatformAdminWorkbenchView`, `PlatformAdminSelectedClubBrief`, and `CreateSupportAccessGrantFields` are named consistently across tasks.
- Architecture consistency: UI receives props and callbacks only; API calls remain in route/API files; server hardening stays in application service.
