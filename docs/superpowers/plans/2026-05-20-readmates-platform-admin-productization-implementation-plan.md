# ReadMates Platform Admin Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin` into a product-grade platform operations ledger with task-oriented tabs, trustworthy action states, support access lookup, AI Ops controls, and a local dev admin login.

**Architecture:** Keep the existing route-first frontend structure: route modules own data and URL state, query modules own TanStack Query contracts, UI modules remain prop/callback driven, and model modules stay pure. Keep the server in feature-local clean architecture: controllers parse HTTP, application services enforce authorization and business rules, outbound ports hide JDBC lookup details.

**Tech Stack:** React, Vite, React Router 7, TanStack Query v5, Vitest, Playwright, Kotlin, Spring Boot, MockMvc, MySQL, Flyway.

---

## Source Documents

- Approved design: `docs/superpowers/specs/2026-05-20-readmates-platform-admin-productization-design.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Docs guide: `docs/agents/docs.md`

## File Structure

### Frontend Files

- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`
  - Owns active tab URL state, selected club state, AI filter state, support grant mutation error state, user lookup mutation, and prop assembly.
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
  - Adds platform admin user lookup response type.
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
  - Adds `lookupPlatformAdminUserByEmail`.
- Modify: `front/features/platform-admin/queries/platform-admin-queries.ts`
  - Adds lookup mutation and query key.
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts`
  - Adds an infinite jobs query for cursor paging.
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.ts`
  - Adds typed today queue items that combine club and AI operational signals.
- Create: `front/features/platform-admin/ui/platform-admin-tabs.tsx`
  - Renders accessible top tabs.
- Create: `front/features/platform-admin/ui/platform-admin-status-strip.tsx`
  - Renders persistent role and operations summary.
- Create: `front/features/platform-admin/ui/platform-admin-today-tab.tsx`
  - Renders the default task queue and selected safe action panel.
- Create: `front/features/platform-admin/ui/platform-admin-safe-action-panel.tsx`
  - Renders typed next-action copy and tab navigation CTA for the selected today item.
- Create: `front/features/platform-admin/ui/support-grantee-lookup.tsx`
  - Renders email-based active platform admin lookup result.
- Modify: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
  - Becomes the shell: status strip, tab list, active panel, onboarding trigger.
- Modify: `front/features/platform-admin/ui/club-operations-brief.tsx`
  - Splits club detail and support access panels by active tab.
- Modify: `front/features/platform-admin/ui/platform-admin-club-detail.tsx`
  - Resets draft on selected club change, removes direct visibility buttons, honors permissions, shows save errors.
- Modify: `front/features/platform-admin/ui/support-access-grants-panel.tsx`
  - Replaces raw UUID input with resolved grantee email flow, shows revoke errors.
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`
  - Adds filters, load-more, safe detail panel, disabled state, and support read-only behavior.
- Modify: `front/features/auth/route/login-route.tsx`
  - Adds `admin@example.com` dev account.
- Modify: `front/src/styles/globals.css`
  - Adds tab shell, status strip, today tab, support lookup, AI filters/detail responsive styles.
- Test: `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`
- Test: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`
- Test: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx`
- Test: `front/features/platform-admin/queries/platform-admin-queries.test.tsx`
- Test: `front/tests/unit/platform-admin.test.tsx`
- Test: `front/tests/unit/login-card.test.tsx`
- Test: `front/tests/e2e/platform-admin-ai-ops.spec.ts`
- Create: `front/tests/e2e/platform-admin-shell.spec.ts`

### Server Files

- Create: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminUserLookupModels.kt`
  - Defines the lookup result returned by the new support grantee lookup use case.
- Create: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUserLookupUseCases.kt`
  - Defines `LookupPlatformAdminUserUseCase`.
- Create: `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminUserLookupPort.kt`
  - Defines exact email lookup and active platform admin ID validation.
- Create: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminUserLookupService.kt`
  - Enforces owner-only lookup and public-safe not-found behavior.
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminUserLookupAdapter.kt`
  - Reads users plus `platform_admins` by normalized email or user ID.
- Create: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminUserLookupController.kt`
  - Adds `GET /api/admin/users/lookup?email=<email>`.
- Modify: `server/src/main/kotlin/com/readmates/club/application/PlatformAdminException.kt`
  - Adds support grant and lookup error codes.
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminErrorHandler.kt`
  - Registers the new controller and maps new error codes.
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt`
  - Validates active platform admin grantee, future expiration, and max duration.
- Modify: `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
  - Adds `admin@example.com` as a synthetic dev platform owner.
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
  - Allows `admin@example.com` in dev-login seed lookup.
- Test: `server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/DevLoginControllerTest.kt`
- Test: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`

## Tasks

### Task 1: Admin Tab Shell And Status Strip

**Files:**
- Create: `front/features/platform-admin/ui/platform-admin-tabs.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-status-strip.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`
- Modify: `front/src/styles/globals.css`
- Test: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add failing dashboard shell tests**

Append these tests inside `describe("platform admin frontend shell", () => { ... })` in `front/tests/unit/platform-admin.test.tsx`. If a matching helper already exists in the file at implementation time, keep one helper and use this data shape.

```tsx
const shellWorkbench = buildPlatformAdminWorkbench({
  role: "OWNER",
  activeClubCount: 2,
  domainActionRequiredCount: 1,
  selectedClubId: "club-1",
  clubs: [
    {
      clubId: "club-1",
      slug: "reading-sai",
      name: "읽는사이",
      tagline: "함께 읽는 모임",
      about: "공개 소개",
      status: "ACTIVE",
      publicVisibility: "PRIVATE",
      domainCount: 1,
      domainActionRequiredCount: 1,
      firstHostOnboardingState: "ASSIGNED",
    },
  ],
  domains: [
    {
      id: "domain-1",
      clubId: "club-1",
      hostname: "reading-sai.example.com",
      kind: "SUBDOMAIN",
      status: "ACTION_REQUIRED",
      desiredState: "ENABLED",
      manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN",
      errorCode: null,
      isPrimary: true,
      verifiedAt: null,
      lastCheckedAt: null,
    },
  ],
});

it("renders 오늘 할 일 as the default admin tab with the status strip always visible", () => {
  render(
    <PlatformAdminDashboard
      workbench={shellWorkbench}
      selectedClubId="club-1"
      activeTab="today"
      onTabChange={vi.fn()}
    />,
  );

  expect(screen.getByRole("tab", { name: "오늘 할 일" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "클럽 상세" })).toHaveAttribute("aria-selected", "false");
  expect(screen.getByText("OWNER")).toBeInTheDocument();
  expect(screen.getByText("조치 필요")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "AI 운영" })).not.toBeInTheDocument();
});

it("moves between admin tabs through a controlled callback", async () => {
  const user = userEvent.setup();
  const onTabChange = vi.fn();

  render(
    <PlatformAdminDashboard
      workbench={shellWorkbench}
      selectedClubId="club-1"
      activeTab="today"
      onTabChange={onTabChange}
    />,
  );

  await user.click(screen.getByRole("tab", { name: "AI Ops" }));

  expect(onTabChange).toHaveBeenCalledWith("ai");
});
```

- [ ] **Step 2: Run the focused frontend test and verify it fails**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/platform-admin.test.tsx -t "admin tab"
```

Expected: FAIL because `activeTab`, `onTabChange`, `platform-admin-tabs.tsx`, and `platform-admin-status-strip.tsx` do not exist yet.

- [ ] **Step 3: Create the tab and status strip UI modules**

Create `front/features/platform-admin/ui/platform-admin-tabs.tsx` with these public types and behavior.

```tsx
export type PlatformAdminTabId = "today" | "club" | "ai" | "support";

type PlatformAdminTab = {
  id: PlatformAdminTabId;
  label: string;
};

const tabs: PlatformAdminTab[] = [
  { id: "today", label: "오늘 할 일" },
  { id: "club", label: "클럽 상세" },
  { id: "ai", label: "AI Ops" },
  { id: "support", label: "지원 접근" },
];

type PlatformAdminTabsProps = {
  activeTab: PlatformAdminTabId;
  onTabChange: (tab: PlatformAdminTabId) => void;
};

export function PlatformAdminTabs({ activeTab, onTabChange }: PlatformAdminTabsProps) {
  return (
    <div className="platform-admin-tabs" role="tablist" aria-label="플랫폼 관리 탭">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="platform-admin-tabs__tab"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

Create `front/features/platform-admin/ui/platform-admin-status-strip.tsx` with these props.

```tsx
import type { PlatformAdminWorkbenchView } from "@/features/platform-admin/model/platform-admin-workbench-model";
import type { PlatformAdminAiOpsSummaryView } from "@/features/platform-admin/ui/platform-admin-ai-ops";

type PlatformAdminStatusStripProps = {
  workbench: PlatformAdminWorkbenchView;
  aiOpsSummary?: PlatformAdminAiOpsSummaryView | null;
  aiOpsDisabled?: boolean;
};

export function PlatformAdminStatusStrip({
  workbench,
  aiOpsSummary = null,
  aiOpsDisabled = false,
}: PlatformAdminStatusStripProps) {
  return (
    <section className="platform-admin-status-strip" aria-label="플랫폼 운영 상태">
      <StatusMetric label="권한" value={workbench.metrics.platformRole} />
      <StatusMetric label="조치 필요" value={String(workbench.metrics.needsActionCount)} />
      <StatusMetric label="공개 준비" value={String(workbench.metrics.publishReadyCount)} />
      <StatusMetric label="도메인 확인" value={String(workbench.metrics.domainActionRequiredCount)} />
      <StatusMetric
        label="AI 상태"
        value={aiOpsDisabled ? "disabled" : `${aiOpsSummary?.activeJobCount ?? 0} active`}
      />
    </section>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="platform-admin-status-strip__item">
      <span className="tiny muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
```

- [ ] **Step 4: Make the dashboard a controlled tab shell**

Modify `PlatformAdminDashboardProps` in `front/features/platform-admin/ui/platform-admin-dashboard.tsx` to include:

```tsx
import { PlatformAdminStatusStrip } from "@/features/platform-admin/ui/platform-admin-status-strip";
import { PlatformAdminTabs, type PlatformAdminTabId } from "@/features/platform-admin/ui/platform-admin-tabs";

type PlatformAdminDashboardProps = {
  workbench: PlatformAdminWorkbenchView;
  activeTab: PlatformAdminTabId;
  selectedClubId: string | null;
  onTabChange: (tab: PlatformAdminTabId) => void;
  onSelectClub?: (clubId: string) => void;
  aiOpsDisabled?: boolean;
  // keep the existing props below this line
};
```

Replace the always-rendered console and AI sections with:

```tsx
<PlatformAdminStatusStrip
  workbench={workbench}
  aiOpsSummary={aiOpsSummary}
  aiOpsDisabled={aiOpsDisabled}
/>

<PlatformAdminTabs activeTab={activeTab} onTabChange={onTabChange} />

{activeTab === "today" ? (
  <div role="tabpanel" aria-label="오늘 할 일">
    <PlatformAdminWorkQueue
      items={workbench.queueItems}
      selectedClubId={selectedClubId}
      onSelectClub={onSelectClub}
    />
  </div>
) : null}

{activeTab === "club" ? (
  <div role="tabpanel" aria-label="클럽 상세">
    <ClubOperationsBrief
      club={workbench.selectedClub}
      permissions={workbench.permissions}
      checkingDomainIds={checkingDomainIds}
      domainCheckErrors={domainCheckErrors}
      activeGrants={activeGrants}
      loadingSupportGrants={loadingSupportGrants}
      supportGrantLoadError={supportGrantLoadError}
      onUpdateClub={onUpdateClub}
      onSetVisibility={onSetVisibility}
      onCheckDomain={onCheckDomain}
      onCreateGrant={undefined}
      onRevokeGrant={undefined}
    />
  </div>
) : null}

{activeTab === "ai" ? (
  <div role="tabpanel" aria-label="AI Ops">
    <PlatformAdminAiOps
      role={workbench.metrics.platformRole}
      summary={aiOpsSummary}
      jobs={aiOpsJobs}
      loading={aiOpsLoading}
      error={aiOpsError}
      disabled={aiOpsDisabled}
      onForceCancel={onForceCancelAiJob}
    />
  </div>
) : null}

{activeTab === "support" && workbench.selectedClub ? (
  <div role="tabpanel" aria-label="지원 접근">
    <ClubOperationsBrief
      club={workbench.selectedClub}
      permissions={workbench.permissions}
      activeGrants={activeGrants}
      loadingSupportGrants={loadingSupportGrants}
      supportGrantLoadError={supportGrantLoadError}
      onCreateGrant={onCreateGrant}
      onRevokeGrant={onRevokeGrant}
      mode="support"
    />
  </div>
) : null}
```

This step introduces a temporary `mode="support"` prop in `ClubOperationsBrief`; Task 5 finishes the support-only layout.

- [ ] **Step 5: Add route-owned tab URL state**

In `front/features/platform-admin/route/platform-admin-route.tsx`, import `useSearchParams` and `type PlatformAdminTabId`. Add these helpers below the component.

```tsx
const platformAdminTabs = new Set<PlatformAdminTabId>(["today", "club", "ai", "support"]);

function tabFromSearch(searchParams: URLSearchParams): PlatformAdminTabId {
  const tab = searchParams.get("tab");
  return platformAdminTabs.has(tab as PlatformAdminTabId) ? (tab as PlatformAdminTabId) : "today";
}
```

Inside `PlatformAdminRoute`, add:

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = tabFromSearch(searchParams);

function handleTabChange(tab: PlatformAdminTabId) {
  const next = new URLSearchParams(searchParams);
  if (tab === "today") {
    next.delete("tab");
  } else {
    next.set("tab", tab);
  }
  setSearchParams(next, { replace: true });
}
```

Pass `activeTab={activeTab}` and `onTabChange={handleTabChange}` to `PlatformAdminDashboard`.

- [ ] **Step 6: Add shell styles**

Add these selectors near the existing platform admin styles in `front/src/styles/globals.css`.

```css
.platform-admin-status-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  background: var(--surface);
  padding: 12px;
}

.platform-admin-status-strip__item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.platform-admin-status-strip__item strong {
  overflow-wrap: anywhere;
}

.platform-admin-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
}

.platform-admin-tabs__tab {
  flex: 0 0 auto;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  padding: 10px 12px;
}

.platform-admin-tabs__tab[aria-selected="true"] {
  border-bottom-color: var(--text);
  color: var(--text);
}
```

Add mobile rules inside the existing mobile media block:

```css
.platform-admin-status-strip {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
```

- [ ] **Step 7: Run the focused frontend test and verify it passes**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/platform-admin.test.tsx -t "admin tab"
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add front/features/platform-admin/ui/platform-admin-tabs.tsx front/features/platform-admin/ui/platform-admin-status-strip.tsx front/features/platform-admin/ui/platform-admin-dashboard.tsx front/features/platform-admin/route/platform-admin-route.tsx front/src/styles/globals.css front/tests/unit/platform-admin.test.tsx
git commit -m "feat: add platform admin tab shell"
```

### Task 2: Today Queue Typed Model And Action Panel

**Files:**
- Create: `front/features/platform-admin/ui/platform-admin-today-tab.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-safe-action-panel.tsx`
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.ts`
- Modify: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- Modify: `front/src/styles/globals.css`
- Test: `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`
- Test: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add failing model tests for typed today items**

Append to `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`:

```ts
it("builds typed today queue items from club and AI operational signals", () => {
  const workbench = buildPlatformAdminWorkbench({
    ...baseInput,
    selectedClubId: null,
    aiOps: {
      disabled: false,
      activeJobCount: 2,
      failedLast24h: 1,
      staleCandidateCount: 1,
    },
  });

  expect(workbench.todayItems.map((item) => item.kind)).toEqual([
    "club",
    "club",
    "club",
    "ai",
  ]);
  expect(workbench.todayItems[0]).toMatchObject({
    kind: "club",
    severity: "blocked",
    targetTab: "club",
    primaryActionLabel: "클럽 상세로 이동",
  });
  expect(workbench.todayItems[3]).toMatchObject({
    kind: "ai",
    severity: "attention",
    targetTab: "ai",
    primaryActionLabel: "AI Ops로 이동",
  });
});

it("marks AI disabled as a stable operations state in the today queue", () => {
  const workbench = buildPlatformAdminWorkbench({
    ...baseInput,
    aiOps: {
      disabled: true,
      activeJobCount: 0,
      failedLast24h: 0,
      staleCandidateCount: 0,
    },
  });

  expect(workbench.todayItems.at(-1)).toMatchObject({
    kind: "ai",
    severity: "stable",
    reason: "AI generation kill switch가 꺼져 있습니다.",
  });
});
```

- [ ] **Step 2: Run the model test and verify it fails**

Run:

```bash
pnpm --dir front vitest run front/features/platform-admin/model/platform-admin-workbench-model.test.ts
```

Expected: FAIL because `PlatformAdminWorkbenchInput.aiOps` and `PlatformAdminWorkbenchView.todayItems` do not exist.

- [ ] **Step 3: Add typed today queue model fields**

In `front/features/platform-admin/model/platform-admin-workbench-model.ts`, add:

```ts
export type PlatformAdminTabTarget = "today" | "club" | "ai" | "support";

export type PlatformAdminAiOpsWorkbenchInput = {
  disabled: boolean;
  activeJobCount: number;
  failedLast24h: number;
  staleCandidateCount: number;
};

export type PlatformAdminTodayQueueItem =
  | {
      kind: "club";
      id: string;
      clubId: string;
      title: string;
      severity: WorkQueueSeverity;
      reason: string;
      primaryActionLabel: string;
      targetTab: PlatformAdminTabTarget;
    }
  | {
      kind: "ai";
      id: "ai-ops";
      title: string;
      severity: WorkQueueSeverity;
      reason: string;
      primaryActionLabel: string;
      targetTab: "ai";
    };
```

Extend `PlatformAdminWorkbenchInput` with:

```ts
aiOps?: PlatformAdminAiOpsWorkbenchInput;
```

Extend `PlatformAdminWorkbenchView` with:

```ts
todayItems: PlatformAdminTodayQueueItem[];
```

Inside `buildPlatformAdminWorkbench`, build `todayItems` from queue items and AI state:

```ts
const todayItems = buildTodayItems(queueItems, input.aiOps);
```

Return `todayItems` on the view.

Add:

```ts
function buildTodayItems(
  queueItems: PlatformAdminWorkQueueItem[],
  aiOps?: PlatformAdminAiOpsWorkbenchInput,
): PlatformAdminTodayQueueItem[] {
  const clubItems = queueItems.map((item): PlatformAdminTodayQueueItem => ({
    kind: "club",
    id: `club:${item.clubId}`,
    clubId: item.clubId,
    title: item.name,
    severity: item.severity,
    reason: item.reason,
    primaryActionLabel: "클럽 상세로 이동",
    targetTab: "club",
  }));

  if (!aiOps) {
    return clubItems;
  }

  if (aiOps.disabled) {
    return [
      ...clubItems,
      {
        kind: "ai",
        id: "ai-ops",
        title: "AI Ops",
        severity: "stable",
        reason: "AI generation kill switch가 꺼져 있습니다.",
        primaryActionLabel: "AI Ops로 이동",
        targetTab: "ai",
      },
    ];
  }

  if (aiOps.failedLast24h > 0 || aiOps.staleCandidateCount > 0) {
    return [
      ...clubItems,
      {
        kind: "ai",
        id: "ai-ops",
        title: "AI Ops",
        severity: "attention",
    reason: `최근 실패 ${aiOps.failedLast24h}건, stale 대상 ${aiOps.staleCandidateCount}건을 확인해야 합니다.`,
        primaryActionLabel: "AI Ops로 이동",
        targetTab: "ai",
      },
    ];
  }

  return clubItems;
}
```

- [ ] **Step 4: Create today tab and safe action panel UI**

Create `front/features/platform-admin/ui/platform-admin-safe-action-panel.tsx`:

```tsx
import type { PlatformAdminTodayQueueItem } from "@/features/platform-admin/model/platform-admin-workbench-model";
import type { PlatformAdminTabId } from "@/features/platform-admin/ui/platform-admin-tabs";

type PlatformAdminSafeActionPanelProps = {
  item: PlatformAdminTodayQueueItem | null;
  onSelectClub?: (clubId: string) => void;
  onTabChange: (tab: PlatformAdminTabId) => void;
};

export function PlatformAdminSafeActionPanel({
  item,
  onSelectClub,
  onTabChange,
}: PlatformAdminSafeActionPanelProps) {
  if (!item) {
    return (
      <aside className="surface platform-admin-safe-action" aria-label="다음 액션">
        <p className="muted">선택할 운영 항목이 없습니다.</p>
      </aside>
    );
  }

  return (
    <aside className="surface platform-admin-safe-action" aria-label="다음 액션">
      <p className="eyebrow">Safe next action</p>
      <h3 className="h4 editorial">{item.title}</h3>
      <p className="muted">{item.reason}</p>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          if (item.kind === "club") {
            onSelectClub?.(item.clubId);
          }
          onTabChange(item.targetTab);
        }}
      >
        {item.primaryActionLabel}
      </button>
    </aside>
  );
}
```

Create `front/features/platform-admin/ui/platform-admin-today-tab.tsx`:

```tsx
import { useState } from "react";
import type { PlatformAdminTodayQueueItem } from "@/features/platform-admin/model/platform-admin-workbench-model";
import { PlatformAdminSafeActionPanel } from "@/features/platform-admin/ui/platform-admin-safe-action-panel";
import type { PlatformAdminTabId } from "@/features/platform-admin/ui/platform-admin-tabs";

type PlatformAdminTodayTabProps = {
  items: PlatformAdminTodayQueueItem[];
  onSelectClub?: (clubId: string) => void;
  onTabChange: (tab: PlatformAdminTabId) => void;
};

export function PlatformAdminTodayTab({ items, onSelectClub, onTabChange }: PlatformAdminTodayTabProps) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? null);
  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  return (
    <div className="platform-admin-today">
      <section className="platform-admin-today__queue" aria-label="오늘 할 일 목록">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="surface platform-admin-today__item"
            data-severity={item.severity}
            aria-pressed={selectedItem?.id === item.id}
            onClick={() => setSelectedId(item.id)}
          >
            <span className="platform-admin-domain-status">{item.severity}</span>
            <strong>{item.title}</strong>
            <span className="tiny muted">{item.reason}</span>
          </button>
        ))}
      </section>
      <PlatformAdminSafeActionPanel item={selectedItem} onSelectClub={onSelectClub} onTabChange={onTabChange} />
    </div>
  );
}
```

- [ ] **Step 5: Wire today tab into the dashboard and route**

In `front/features/platform-admin/route/platform-admin-route.tsx`, include AI state in the workbench input:

```tsx
aiOps: {
  disabled: aiOpsDisabled,
  activeJobCount: aiOpsSummaryQuery.data?.activeJobCount ?? 0,
  failedLast24h: aiOpsSummaryQuery.data?.failedLast24h ?? 0,
  staleCandidateCount: aiOpsSummaryQuery.data?.staleCandidateCount ?? 0,
},
```

In `front/features/platform-admin/ui/platform-admin-dashboard.tsx`, replace the Task 1 today panel with:

```tsx
<PlatformAdminTodayTab
  items={workbench.todayItems}
  onSelectClub={onSelectClub}
  onTabChange={onTabChange}
/>
```

- [ ] **Step 6: Add today tab styles**

Add:

```css
.platform-admin-today {
  display: grid;
  grid-template-columns: minmax(300px, 0.95fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.platform-admin-today__queue {
  display: grid;
  gap: 10px;
}

.platform-admin-today__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 10px;
  border: 1px solid var(--line);
  cursor: pointer;
  padding: 16px;
  text-align: left;
}

.platform-admin-today__item .tiny {
  grid-column: 2;
}

.platform-admin-today__item[aria-pressed="true"] {
  border-color: var(--text);
  background: var(--bg-sub);
}

.platform-admin-safe-action {
  display: grid;
  gap: 12px;
  padding: 18px;
}
```

Add mobile rules:

```css
.platform-admin-today {
  grid-template-columns: 1fr;
}

.platform-admin-today__item {
  grid-template-columns: 1fr;
}

.platform-admin-today__item .tiny {
  grid-column: 1;
}
```

- [ ] **Step 7: Run model and shell tests**

Run:

```bash
pnpm --dir front vitest run front/features/platform-admin/model/platform-admin-workbench-model.test.ts front/tests/unit/platform-admin.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add front/features/platform-admin/model/platform-admin-workbench-model.ts front/features/platform-admin/model/platform-admin-workbench-model.test.ts front/features/platform-admin/ui/platform-admin-today-tab.tsx front/features/platform-admin/ui/platform-admin-safe-action-panel.tsx front/features/platform-admin/ui/platform-admin-dashboard.tsx front/features/platform-admin/route/platform-admin-route.tsx front/src/styles/globals.css front/tests/unit/platform-admin.test.tsx
git commit -m "feat: add platform admin today queue"
```

### Task 3: Club Detail Action Correctness

**Files:**
- Modify: `front/features/platform-admin/ui/platform-admin-club-detail.tsx`
- Modify: `front/features/platform-admin/ui/club-operations-brief.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- Test: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add failing club detail tests**

Add these tests to `front/tests/unit/platform-admin.test.tsx`:

```tsx
import { PlatformAdminClubDetail } from "@/features/platform-admin/ui/platform-admin-club-detail";

it("resets public info draft when the selected club changes", async () => {
  const user = userEvent.setup();
  const onUpdateClub = vi.fn();
  const { rerender } = render(
    <PlatformAdminClubDetail
      club={{
        clubId: "club-1",
        slug: "one",
        name: "첫 클럽",
        tagline: "첫 설명",
        about: "첫 소개",
        status: "ACTIVE",
        publicVisibility: "PRIVATE",
        domainCount: 0,
        domainActionRequiredCount: 0,
        firstHostOnboardingState: "ASSIGNED",
        domains: [],
        publishChecklist: [],
        primaryAction: { kind: "make-public", label: "공개 전환", disabled: false, reason: null },
        queueItem: {
          clubId: "club-1",
          slug: "one",
          name: "첫 클럽",
          severity: "ready",
          reason: "공개 전환 조건을 충족했습니다.",
          primaryActionLabel: "공개 전환",
          badges: [],
          sortRank: 1,
        },
      }}
      canUpdateClub
      onUpdateClub={onUpdateClub}
    />,
  );

  await user.clear(screen.getByLabelText("클럽 이름"));
  await user.type(screen.getByLabelText("클럽 이름"), "수정 중");

  rerender(
    <PlatformAdminClubDetail
      club={{
        clubId: "club-2",
        slug: "two",
        name: "둘째 클럽",
        tagline: "둘째 설명",
        about: "둘째 소개",
        status: "ACTIVE",
        publicVisibility: "PRIVATE",
        domainCount: 0,
        domainActionRequiredCount: 0,
        firstHostOnboardingState: "ASSIGNED",
        domains: [],
        publishChecklist: [],
        primaryAction: { kind: "make-public", label: "공개 전환", disabled: false, reason: null },
        queueItem: {
          clubId: "club-2",
          slug: "two",
          name: "둘째 클럽",
          severity: "ready",
          reason: "공개 전환 조건을 충족했습니다.",
          primaryActionLabel: "공개 전환",
          badges: [],
          sortRank: 1,
        },
      }}
      canUpdateClub
      onUpdateClub={onUpdateClub}
    />,
  );

  expect(screen.getByLabelText("클럽 이름")).toHaveValue("둘째 클럽");
});

it("does not expose direct public private buttons from club detail", () => {
  render(<PlatformAdminDashboard workbench={shellWorkbench} selectedClubId="club-1" activeTab="club" onTabChange={vi.fn()} />);

  expect(screen.queryByRole("button", { name: "공개" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "비공개" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "공개 전환" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/platform-admin.test.tsx -t "club detail"
```

Expected: FAIL because `PlatformAdminClubDetail` uses blank-string draft sentinel and direct visibility buttons.

- [ ] **Step 3: Replace club detail draft handling**

Update `front/features/platform-admin/ui/platform-admin-club-detail.tsx` so props and draft state are:

```tsx
import { useEffect, useState } from "react";
import type { PlatformAdminSelectedClubBrief } from "@/features/platform-admin/model/platform-admin-workbench-model";
import type { PlatformAdminClubRegistryItem } from "@/features/platform-admin/ui/platform-admin-club-registry";

type UpdatePlatformAdminClubRequest = {
  name?: string;
  tagline?: string;
  about?: string;
};

type ClubInfoDraft = {
  name: string;
  tagline: string;
  about: string;
};

type Props = {
  club: PlatformAdminSelectedClubBrief | null;
  canUpdateClub: boolean;
  onUpdateClub?: (clubId: string, request: UpdatePlatformAdminClubRequest) => Promise<PlatformAdminClubRegistryItem>;
};

function draftFromClub(club: PlatformAdminSelectedClubBrief | null): ClubInfoDraft {
  return {
    name: club?.name ?? "",
    tagline: club?.tagline ?? "",
    about: club?.about ?? "",
  };
}
```

Inside the component:

```tsx
const [draft, setDraft] = useState<ClubInfoDraft>(() => draftFromClub(club));
const [saving, setSaving] = useState(false);
const [saveError, setSaveError] = useState<string | null>(null);

useEffect(() => {
  setDraft(draftFromClub(club));
  setSaveError(null);
}, [club?.clubId]);
```

Replace `saveInfo` with:

```tsx
async function saveInfo() {
  if (club == null || onUpdateClub == null || !canUpdateClub) {
    return;
  }
  setSaving(true);
  setSaveError(null);
  try {
    const updated = await onUpdateClub(club.clubId, {
      name: draft.name,
      tagline: draft.tagline,
      about: draft.about,
    });
    setDraft({ name: updated.name, tagline: updated.tagline, about: updated.about });
  } catch {
    setSaveError("공개 정보를 저장하지 못했습니다. 입력 내용은 유지됩니다.");
  } finally {
    setSaving(false);
  }
}
```

Remove the local `setVisibility` function and remove the `공개` and `비공개` buttons from this component. Disable form fields when `!canUpdateClub || saving`.

- [ ] **Step 4: Pass permissions from the brief**

In `front/features/platform-admin/ui/club-operations-brief.tsx`, update:

```tsx
<PlatformAdminClubDetail
  club={club}
  canUpdateClub={permissions.canUpdateClub}
  onUpdateClub={onUpdateClub}
/>
```

Ensure the support-only mode from Task 1 renders only `SupportAccessGrantsPanel`, while the default club mode renders checklist, public info, and domain provisioning.

- [ ] **Step 5: Run club detail tests**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/platform-admin.test.tsx -t "club detail"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add front/features/platform-admin/ui/platform-admin-club-detail.tsx front/features/platform-admin/ui/club-operations-brief.tsx front/features/platform-admin/ui/platform-admin-dashboard.tsx front/tests/unit/platform-admin.test.tsx
git commit -m "fix: align platform admin club detail actions"
```

### Task 4: Support Access User Lookup API And Validation

**Files:**
- Create: `server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminUserLookupModels.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUserLookupUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminUserLookupPort.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminUserLookupService.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminUserLookupAdapter.kt`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminUserLookupController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/PlatformAdminException.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminErrorHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt`
- Test: `server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt`

- [ ] **Step 1: Add failing server tests**

Add these tests to `SupportAccessGrantControllerTest`.

```kotlin
@Test
fun `owner can lookup active platform admin by exact email`() {
    val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
    val support = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE", email = "lookup.support@example.com")

    mockMvc
        .get("/api/admin/users/lookup?email=lookup.support%40example.com") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
            jsonPath("$.userId") { value(support) }
            jsonPath("$.email") { value("lookup.support@example.com") }
            jsonPath("$.displayName") { value("Platform Admin") }
            jsonPath("$.platformAdminRole") { value("SUPPORT") }
            jsonPath("$.platformAdminStatus") { value("ACTIVE") }
        }
}

@Test
fun `operator cannot lookup support grantee users`() {
    val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
    createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE", email = "lookup.operator-denied@example.com")

    mockMvc
        .get("/api/admin/users/lookup?email=lookup.operator-denied%40example.com") {
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isForbidden() }
        }
}

@Test
fun `support grant create rejects non platform admin grantee`() {
    val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
    val userId = UUID.randomUUID().toString()
    jdbcTemplate.update(
        """
        insert into users (id, email, name, short_name, auth_provider)
        values (?, 'plain.support-target@example.com', 'Plain User', 'Plain', 'GOOGLE')
        """.trimIndent(),
        userId,
    )
    createdUserIds += userId

    mockMvc
        .post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$userId",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Customer escalation ticket #1234",
                  "expiresAt": "${OffsetDateTime.now(ZoneOffset.UTC).plusHours(1)}"
                }
                """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isBadRequest() }
        }
}

@Test
fun `support grant create rejects past and overlong expirations`() {
    val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
    val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

    for (expiresAt in listOf(
        OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(5),
        OffsetDateTime.now(ZoneOffset.UTC).plusHours(25),
    )) {
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
                      "expiresAt": "$expiresAt"
                    }
                    """.trimIndent()
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isBadRequest() }
            }
    }
}
```

Update the helper signature in the same file:

```kotlin
private fun createPlatformAdminUser(
    role: String,
    status: String,
    email: String = "platform.${UUID.randomUUID()}@example.com",
): String
```

Import:

```kotlin
import java.time.OffsetDateTime
import java.time.ZoneOffset
```

- [ ] **Step 2: Run the focused server test and verify it fails**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.club.api.SupportAccessGrantControllerTest'
```

Expected: FAIL because `/api/admin/users/lookup` is missing and support grant validation still accepts disabled or overlong grantees.

- [ ] **Step 3: Add lookup model and ports**

Create `PlatformAdminUserLookupModels.kt`:

```kotlin
package com.readmates.club.application.model

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.club.domain.PlatformAdminStatus
import java.util.UUID

data class PlatformAdminUserLookupResult(
    val userId: UUID,
    val email: String,
    val displayName: String,
    val platformAdminRole: PlatformAdminRole,
    val platformAdminStatus: PlatformAdminStatus,
)
```

Create `PlatformAdminUserLookupUseCases.kt`:

```kotlin
package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.PlatformAdminUserLookupResult
import com.readmates.shared.security.CurrentPlatformAdmin

interface LookupPlatformAdminUserUseCase {
    fun lookupByEmail(
        admin: CurrentPlatformAdmin,
        email: String,
    ): PlatformAdminUserLookupResult
}
```

Create `PlatformAdminUserLookupPort.kt`:

```kotlin
package com.readmates.club.application.port.out

import com.readmates.club.application.model.PlatformAdminUserLookupResult
import java.util.UUID

interface PlatformAdminUserLookupPort {
    fun findPlatformAdminUserByEmail(email: String): PlatformAdminUserLookupResult?

    fun findActivePlatformAdminUserById(userId: UUID): PlatformAdminUserLookupResult?
}
```

- [ ] **Step 4: Add lookup service**

Create `PlatformAdminUserLookupService.kt`:

```kotlin
package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.PlatformAdminUserLookupResult
import com.readmates.club.application.port.`in`.LookupPlatformAdminUserUseCase
import com.readmates.club.application.port.out.PlatformAdminUserLookupPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.club.domain.PlatformAdminStatus
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.util.Locale

@Service
class PlatformAdminUserLookupService(
    private val lookupPort: PlatformAdminUserLookupPort,
) : LookupPlatformAdminUserUseCase {
    override fun lookupByEmail(
        admin: CurrentPlatformAdmin,
        email: String,
    ): PlatformAdminUserLookupResult {
        if (admin.role != PlatformAdminRole.OWNER) {
            throw AccessDeniedException("Only platform owners can lookup support grantee users")
        }

        val normalizedEmail =
            email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
                ?: throw PlatformAdminException(PlatformAdminError.PLATFORM_ADMIN_USER_NOT_FOUND, "Platform admin user not found")

        val result =
            lookupPort.findPlatformAdminUserByEmail(normalizedEmail)
                ?: throw PlatformAdminException(PlatformAdminError.PLATFORM_ADMIN_USER_NOT_FOUND, "Platform admin user not found")

        if (result.platformAdminStatus != PlatformAdminStatus.ACTIVE) {
            throw PlatformAdminException(PlatformAdminError.PLATFORM_ADMIN_USER_NOT_FOUND, "Platform admin user not found")
        }

        return result
    }
}
```

- [ ] **Step 5: Add JDBC adapter**

Create `JdbcPlatformAdminUserLookupAdapter.kt`:

```kotlin
package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.PlatformAdminUserLookupResult
import com.readmates.club.application.port.out.PlatformAdminUserLookupPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.club.domain.PlatformAdminStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.Locale
import java.util.UUID

@Repository
class JdbcPlatformAdminUserLookupAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : PlatformAdminUserLookupPort {
    override fun findPlatformAdminUserByEmail(email: String): PlatformAdminUserLookupResult? {
        val normalizedEmail = email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() } ?: return null
        return jdbcTemplate
            .query(
                """
                select users.id, users.email, users.name, platform_admins.role, platform_admins.status
                from users
                join platform_admins on platform_admins.user_id = users.id
                where lower(users.email) = ?
                limit 1
                """.trimIndent(),
                ::mapResult,
                normalizedEmail,
            ).firstOrNull()
    }

    override fun findActivePlatformAdminUserById(userId: UUID): PlatformAdminUserLookupResult? =
        jdbcTemplate
            .query(
                """
                select users.id, users.email, users.name, platform_admins.role, platform_admins.status
                from users
                join platform_admins on platform_admins.user_id = users.id
                where users.id = ?
                  and platform_admins.status = 'ACTIVE'
                limit 1
                """.trimIndent(),
                ::mapResult,
                userId.dbString(),
            ).firstOrNull()

    private fun mapResult(
        rs: ResultSet,
        @Suppress("UNUSED_PARAMETER") rowNum: Int,
    ): PlatformAdminUserLookupResult =
        PlatformAdminUserLookupResult(
            userId = rs.uuid("id"),
            email = rs.getString("email").lowercase(Locale.ROOT),
            displayName = rs.getString("name"),
            platformAdminRole = PlatformAdminRole.valueOf(rs.getString("role")),
            platformAdminStatus = PlatformAdminStatus.valueOf(rs.getString("status")),
        )
}
```

- [ ] **Step 6: Add controller and error mapping**

Create `PlatformAdminUserLookupController.kt`:

```kotlin
package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.PlatformAdminUserLookupResult
import com.readmates.club.application.port.`in`.LookupPlatformAdminUserUseCase
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/admin/users")
class PlatformAdminUserLookupController(
    private val lookupUseCase: LookupPlatformAdminUserUseCase,
) {
    @GetMapping("/lookup")
    fun lookup(
        admin: CurrentPlatformAdmin,
        @RequestParam email: String,
    ): PlatformAdminUserLookupResponse = PlatformAdminUserLookupResponse.from(lookupUseCase.lookupByEmail(admin, email))
}

data class PlatformAdminUserLookupResponse(
    val userId: String,
    val email: String,
    val displayName: String,
    val platformAdminRole: String,
    val platformAdminStatus: String,
) {
    companion object {
        fun from(result: PlatformAdminUserLookupResult): PlatformAdminUserLookupResponse =
            PlatformAdminUserLookupResponse(
                userId = result.userId.toString(),
                email = result.email,
                displayName = result.displayName,
                platformAdminRole = result.platformAdminRole.name,
                platformAdminStatus = result.platformAdminStatus.name,
            )
    }
}
```

Add these enum values in `PlatformAdminException.kt`:

```kotlin
PLATFORM_ADMIN_USER_NOT_FOUND,
GRANT_GRANTEE_NOT_PLATFORM_ADMIN,
GRANT_EXPIRES_AT_INVALID,
GRANT_EXPIRES_AT_TOO_LONG,
```

Add `PlatformAdminUserLookupController::class` to `PlatformAdminErrorHandler` and map:

```kotlin
PlatformAdminError.PLATFORM_ADMIN_USER_NOT_FOUND -> HttpStatus.NOT_FOUND
PlatformAdminError.GRANT_GRANTEE_NOT_PLATFORM_ADMIN -> HttpStatus.BAD_REQUEST
PlatformAdminError.GRANT_EXPIRES_AT_INVALID -> HttpStatus.BAD_REQUEST
PlatformAdminError.GRANT_EXPIRES_AT_TOO_LONG -> HttpStatus.BAD_REQUEST
```

- [ ] **Step 7: Add support grant service validation**

Modify the `SupportAccessGrantService` constructor:

```kotlin
private val platformAdminUserLookupPort: PlatformAdminUserLookupPort,
@Value("\${readmates.platform-admin.support-access.max-grant-hours:24}")
private val maxGrantHours: Long,
```

Import:

```kotlin
import com.readmates.club.application.port.out.PlatformAdminUserLookupPort
import org.springframework.beans.factory.annotation.Value
import java.time.Duration
```

Before `createGrantPort.createGrant(...)`, add:

```kotlin
if (platformAdminUserLookupPort.findActivePlatformAdminUserById(command.granteeUserId) == null) {
    throw PlatformAdminException(
        PlatformAdminError.GRANT_GRANTEE_NOT_PLATFORM_ADMIN,
        "Support access grantee must be an active platform admin",
    )
}

val now = OffsetDateTime.now(ZoneOffset.UTC)
if (!command.expiresAt.isAfter(now)) {
    throw PlatformAdminException(
        PlatformAdminError.GRANT_EXPIRES_AT_INVALID,
        "Support access grant expiration must be in the future",
    )
}

val maxDuration = Duration.ofHours(maxGrantHours)
if (command.expiresAt.isAfter(now.plus(maxDuration))) {
    throw PlatformAdminException(
        PlatformAdminError.GRANT_EXPIRES_AT_TOO_LONG,
        "Support access grant expiration exceeds max duration",
    )
}
```

Update existing tests in `SupportAccessGrantControllerTest` that use `2099-01-01T12:00:00Z` to use `OffsetDateTime.now(ZoneOffset.UTC).plusHours(1)`.

- [ ] **Step 8: Run support access tests**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.club.api.SupportAccessGrantControllerTest'
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add server/src/main/kotlin/com/readmates/club/application/model/PlatformAdminUserLookupModels.kt server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUserLookupUseCases.kt server/src/main/kotlin/com/readmates/club/application/port/out/PlatformAdminUserLookupPort.kt server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminUserLookupService.kt server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminUserLookupAdapter.kt server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminUserLookupController.kt server/src/main/kotlin/com/readmates/club/application/PlatformAdminException.kt server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminErrorHandler.kt server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt server/src/test/kotlin/com/readmates/club/api/SupportAccessGrantControllerTest.kt
git commit -m "feat: validate platform admin support grants"
```

### Task 5: Support Access Email Lookup UI

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-queries.ts`
- Create: `front/features/platform-admin/ui/support-grantee-lookup.tsx`
- Modify: `front/features/platform-admin/ui/support-access-grants-panel.tsx`
- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`
- Modify: `front/src/styles/globals.css`
- Test: `front/features/platform-admin/queries/platform-admin-queries.test.tsx`
- Test: `front/tests/unit/platform-admin.test.tsx`

- [ ] **Step 1: Add failing frontend tests for email lookup**

Add to `front/features/platform-admin/queries/platform-admin-queries.test.tsx`:

```ts
// Add to the existing vi.mock factory:
lookupPlatformAdminUserByEmail: vi.fn(),

// Add to the existing API import:
lookupPlatformAdminUserByEmail,

it("looks up platform admin users by exact email", async () => {
  vi.mocked(lookupPlatformAdminUserByEmail).mockResolvedValue({
    userId: "user-support",
    email: "support@example.com",
    displayName: "Support User",
    platformAdminRole: "SUPPORT",
    platformAdminStatus: "ACTIVE",
  });

  const { Wrapper } = createWrapper();
  const { result } = renderHook(() => useLookupPlatformAdminUserMutation(), { wrapper: Wrapper });

  await act(async () => {
    await result.current.mutateAsync("support@example.com");
  });

  expect(lookupPlatformAdminUserByEmail).toHaveBeenCalledWith("support@example.com");
});
```

Add to `front/tests/unit/platform-admin.test.tsx`:

```tsx
it("creates support grant after resolving an active platform admin by email", async () => {
  const user = userEvent.setup();
  const onLookupGrantee = vi.fn().mockResolvedValue({
    userId: "support-user-id",
    email: "support@example.com",
    displayName: "Support User",
    platformAdminRole: "SUPPORT",
    platformAdminStatus: "ACTIVE",
  });
  const onCreateGrant = vi.fn().mockResolvedValue(undefined);

  render(
    <PlatformAdminDashboard
      workbench={shellWorkbench}
      selectedClubId="club-1"
      activeTab="support"
      onTabChange={vi.fn()}
      onLookupGrantee={onLookupGrantee}
      onCreateGrant={onCreateGrant}
    />,
  );

  await user.type(screen.getByLabelText("Grantee email"), "support@example.com");
  await user.click(screen.getByRole("button", { name: "사용자 확인" }));
  expect(await screen.findByText("Support User")).toBeInTheDocument();

  await user.type(screen.getByLabelText("사유 (reason)"), "Customer escalation ticket #1234");
  await user.click(screen.getByRole("button", { name: "권한 생성" }));

  expect(onCreateGrant).toHaveBeenCalledWith(expect.objectContaining({
    granteeUserId: "support-user-id",
    scope: "HOST_SUPPORT_READ",
    reason: "Customer escalation ticket #1234",
  }));
});
```

- [ ] **Step 2: Run focused frontend tests and verify they fail**

Run:

```bash
pnpm --dir front vitest run front/features/platform-admin/queries/platform-admin-queries.test.tsx front/tests/unit/platform-admin.test.tsx -t "support grant"
```

Expected: FAIL because lookup contracts and UI do not exist.

- [ ] **Step 3: Add frontend contract, API, and mutation**

In `platform-admin-contracts.ts`:

```ts
export type PlatformAdminUserLookupResponse = {
  userId: string;
  email: string;
  displayName: string;
  platformAdminRole: PlatformAdminRole;
  platformAdminStatus: "ACTIVE" | "DISABLED";
};
```

In `platform-admin-api.ts`:

```ts
export function lookupPlatformAdminUserByEmail(email: string) {
  const params = new URLSearchParams({ email });
  return readmatesFetch<PlatformAdminUserLookupResponse>(
    `/api/admin/users/lookup?${params.toString()}`,
    undefined,
    { clubSlug: undefined },
  );
}
```

In `platform-admin-queries.ts`, add key and mutation:

```ts
platformAdminUserLookup: (email: string) => [...platformAdminKeys.all, "user-lookup", email] as const,
```

```ts
export function useLookupPlatformAdminUserMutation() {
  return useMutation({
    mutationFn: (email: string) => lookupPlatformAdminUserByEmail(email),
  });
}
```

- [ ] **Step 4: Create lookup UI**

Create `support-grantee-lookup.tsx`:

```tsx
import { useState } from "react";
import type { PlatformAdminUserLookupResponse } from "@/features/platform-admin/api/platform-admin-contracts";

type SupportGranteeLookupProps = {
  disabled?: boolean;
  onLookup: (email: string) => Promise<PlatformAdminUserLookupResponse>;
  onResolved: (result: PlatformAdminUserLookupResponse | null) => void;
};

export function SupportGranteeLookup({ disabled = false, onLookup, onResolved }: SupportGranteeLookupProps) {
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PlatformAdminUserLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup() {
    setChecking(true);
    setError(null);
    try {
      const resolved = await onLookup(email.trim());
      setResult(resolved);
      onResolved(resolved);
    } catch {
      setResult(null);
      onResolved(null);
      setError("활성 platform admin 계정을 찾지 못했습니다.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="platform-admin-grantee-lookup">
      <label className="field-group">
        <span className="label">Grantee email</span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setResult(null);
            onResolved(null);
          }}
          disabled={disabled || checking}
          required
        />
      </label>
      <button type="button" className="btn btn-ghost btn-sm" onClick={handleLookup} disabled={disabled || checking || !email.trim()}>
        {checking ? "확인 중" : "사용자 확인"}
      </button>
      {result ? (
        <p className="tiny platform-admin-grantee-lookup__result">
          {result.displayName} · {result.email} · {result.platformAdminRole}
        </p>
      ) : null}
      {error ? <p className="tiny danger">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 5: Replace raw UUID input in support grants panel**

Update `CreateSupportAccessGrantFields` to keep `granteeUserId` but remove UI state named `granteeUserId`. Add props:

```tsx
import type { PlatformAdminUserLookupResponse } from "@/features/platform-admin/api/platform-admin-contracts";
import { SupportGranteeLookup } from "@/features/platform-admin/ui/support-grantee-lookup";

onLookupGrantee?: (email: string) => Promise<PlatformAdminUserLookupResponse>;
```

Inside `SupportAccessGrantsPanel`, replace the `granteeUserId` state with:

```tsx
const [resolvedGrantee, setResolvedGrantee] = useState<PlatformAdminUserLookupResponse | null>(null);
```

In `handleCreate`, require `resolvedGrantee`:

```tsx
if (!resolvedGrantee || !reason.trim() || !expiresAt || !onCreateGrant) return;
```

Pass:

```tsx
granteeUserId: resolvedGrantee.userId,
```

Render:

```tsx
{onLookupGrantee ? (
  <SupportGranteeLookup
    disabled={!canCreateGrant || creating}
    onLookup={onLookupGrantee}
    onResolved={setResolvedGrantee}
  />
) : null}
```

Set `submitDisabled` to:

```tsx
const submitDisabled = creating || !onCreateGrant || !canCreateGrant || resolvedGrantee == null;
```

In `handleRevoke`, replace the silent catch with:

```tsx
const [revokeError, setRevokeError] = useState<string | null>(null);

try {
  await onRevokeGrant(grantId);
} catch {
  setRevokeError("지원 접근 권한을 회수하지 못했습니다.");
} finally {
  setRevokingIds((current) => {
    const next = new Set(current);
    next.delete(grantId);
    return next;
  });
}
```

Render `revokeError` under the active grants list.

- [ ] **Step 6: Wire lookup mutation from route**

In `platform-admin-route.tsx`, import and call `useLookupPlatformAdminUserMutation`. Pass:

```tsx
onLookupGrantee={(email) => lookupGranteeMutation.mutateAsync(email)}
```

to `PlatformAdminDashboard`, then to `ClubOperationsBrief`, then to `SupportAccessGrantsPanel`.

- [ ] **Step 7: Add support lookup styles**

Add:

```css
.platform-admin-grantee-lookup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.platform-admin-grantee-lookup__result {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--success);
  font-weight: 800;
}
```

Mobile:

```css
.platform-admin-grantee-lookup {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 8: Run frontend support tests**

Run:

```bash
pnpm --dir front vitest run front/features/platform-admin/queries/platform-admin-queries.test.tsx front/tests/unit/platform-admin.test.tsx -t "support grant"
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

```bash
git add front/features/platform-admin/api/platform-admin-contracts.ts front/features/platform-admin/api/platform-admin-api.ts front/features/platform-admin/queries/platform-admin-queries.ts front/features/platform-admin/queries/platform-admin-queries.test.tsx front/features/platform-admin/ui/support-grantee-lookup.tsx front/features/platform-admin/ui/support-access-grants-panel.tsx front/features/platform-admin/ui/club-operations-brief.tsx front/features/platform-admin/ui/platform-admin-dashboard.tsx front/features/platform-admin/route/platform-admin-route.tsx front/src/styles/globals.css front/tests/unit/platform-admin.test.tsx
git commit -m "feat: add support grantee lookup"
```

### Task 6: AI Ops Filters, Cursor Paging, Detail Panel, Disabled State

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts`
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`
- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`
- Modify: `front/src/styles/globals.css`
- Test: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx`
- Test: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`

- [ ] **Step 1: Add failing AI Ops tests**

Add to `platform-admin-ai-ops-queries.test.tsx`:

```ts
import { waitFor } from "@testing-library/react";

it("loads additional AI Ops jobs with cursor filters", async () => {
  vi.mocked(fetchPlatformAdminAiOpsJobs).mockResolvedValueOnce({
    items: [],
    nextCursor: "cursor-2",
  }).mockResolvedValueOnce({
    items: [],
    nextCursor: null,
  });

  const { Wrapper } = createWrapper();
  const { result } = renderHook(
    () => usePlatformAdminAiOpsJobsInfiniteQuery({ status: "FAILED", errorCode: "RATE_LIMITED" }, true),
    { wrapper: Wrapper },
  );

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await result.current.fetchNextPage();

  expect(fetchPlatformAdminAiOpsJobs).toHaveBeenNthCalledWith(1, {
    status: "FAILED",
    errorCode: "RATE_LIMITED",
    cursor: undefined,
  });
  expect(fetchPlatformAdminAiOpsJobs).toHaveBeenNthCalledWith(2, {
    status: "FAILED",
    errorCode: "RATE_LIMITED",
    cursor: "cursor-2",
  });
});
```

Add to `platform-admin-ai-ops.test.tsx`:

```tsx
it("filters jobs, loads more, and shows safe job detail", async () => {
  const user = userEvent.setup();
  const onFiltersChange = vi.fn();
  const onLoadMore = vi.fn();

  render(
    <PlatformAdminAiOps
      role="OWNER"
      summary={summary}
      jobs={[runningJob]}
      filters={{ status: "", clubId: "", errorCode: "" }}
      nextCursor="cursor-2"
      loading={false}
      onFiltersChange={onFiltersChange}
      onLoadMore={onLoadMore}
    />,
  );

  await user.selectOptions(screen.getByLabelText("Status"), "FAILED");
  expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED" }));

  await user.click(screen.getByRole("button", { name: /자세히/ }));
  expect(screen.getByText(runningJob.jobId)).toBeInTheDocument();
  expect(screen.queryByText(/transcript/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "더 불러오기" }));
  expect(onLoadMore).toHaveBeenCalled();
});

it("shows AI disabled as an operations state instead of a generic error", () => {
  render(
    <PlatformAdminAiOps
      role="SUPPORT"
      summary={null}
      jobs={[]}
      filters={{ status: "", clubId: "", errorCode: "" }}
      disabled
      loading={false}
      onFiltersChange={vi.fn()}
    />,
  );

  expect(screen.getByText("AI generation kill switch가 꺼져 있습니다.")).toBeInTheDocument();
  expect(screen.queryByText("AI Ops 데이터를 불러오거나 갱신하지 못했습니다.")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run AI Ops tests and verify they fail**

Run:

```bash
pnpm --dir front vitest run front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx
```

Expected: FAIL because infinite query, filter props, detail panel, and disabled rendering are absent.

- [ ] **Step 3: Add infinite query**

In `platform-admin-ai-ops-queries.ts`, import `useInfiniteQuery` and add:

```ts
export function usePlatformAdminAiOpsJobsInfiniteQuery(
  filters: Omit<PlatformAdminAiOpsFilters, "cursor">,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: platformAdminAiOpsKeys.jobs(filters),
    initialPageParam: null as string | null,
    enabled,
    queryFn: ({ pageParam }) =>
      fetchPlatformAdminAiOpsJobs({
        ...filters,
        cursor: pageParam ?? undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
```

- [ ] **Step 4: Extend AI Ops component props and controls**

In `platform-admin-ai-ops.tsx`, add:

```tsx
type PlatformAdminAiOpsFilterView = {
  status: string;
  clubId: string;
  errorCode: string;
};

type PlatformAdminAiOpsProps = {
  role: PlatformAdminAiOpsRole;
  summary: PlatformAdminAiOpsSummaryView | null;
  jobs: PlatformAdminAiOpsJobView[];
  filters: PlatformAdminAiOpsFilterView;
  nextCursor?: string | null;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  onFiltersChange: (filters: PlatformAdminAiOpsFilterView) => void;
  onLoadMore?: () => void;
  onForceCancel?: (jobId: string) => void;
};
```

Render disabled state before the jobs ledger:

```tsx
{disabled ? (
  <div className="surface platform-admin-ai-ops__disabled">
    <p className="h4 editorial">AI generation kill switch가 꺼져 있습니다.</p>
    <p className="tiny muted">이 상태에서는 job 생성과 운영 job 조회가 제한됩니다.</p>
  </div>
) : null}
```

Render filters:

```tsx
<div className="platform-admin-ai-ops__filters">
  <label className="field-group">
    <span className="label">Status</span>
    <select
      className="input"
      value={filters.status}
      onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}
    >
      <option value="">All</option>
      <option value="RUNNING">RUNNING</option>
      <option value="FAILED">FAILED</option>
      <option value="COMPLETED">COMPLETED</option>
      <option value="CANCELLED">CANCELLED</option>
    </select>
  </label>
  <label className="field-group">
    <span className="label">Club ID</span>
    <input className="input" value={filters.clubId} onChange={(event) => onFiltersChange({ ...filters, clubId: event.target.value })} />
  </label>
  <label className="field-group">
    <span className="label">Error code</span>
    <input className="input" value={filters.errorCode} onChange={(event) => onFiltersChange({ ...filters, errorCode: event.target.value })} />
  </label>
</div>
```

Add local selected job state:

```tsx
const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
const selectedJob = jobs.find((job) => job.jobId === selectedJobId) ?? null;
```

For each job row, add a detail button:

```tsx
<button type="button" className="btn btn-quiet btn-sm" onClick={() => setSelectedJobId(job.jobId)}>
  자세히
</button>
```

Render safe detail fields only:

```tsx
{selectedJob ? (
  <aside className="surface platform-admin-ai-ops__detail" aria-label="AI job detail">
    <p className="eyebrow">Job detail</p>
    <h3 className="h4 editorial">{selectedJob.jobId}</h3>
    <dl>
      <dt>Status</dt>
      <dd>{selectedJob.status}</dd>
      <dt>Provider</dt>
      <dd>{selectedJob.provider} / {selectedJob.model}</dd>
      <dt>Updated</dt>
      <dd>{formatTimestamp(selectedJob.lastUpdatedAt)}</dd>
      <dt>Error</dt>
      <dd>{selectedJob.errorCode ? `${selectedJob.errorCode}: ${selectedJob.safeErrorMessage ?? "safe error"}` : "없음"}</dd>
    </dl>
  </aside>
) : null}
```

Render load more:

```tsx
{nextCursor && onLoadMore ? (
  <button type="button" className="btn btn-ghost btn-sm" onClick={onLoadMore} disabled={loading}>
    더 불러오기
  </button>
) : null}
```

- [ ] **Step 5: Wire route AI disabled and filters**

In `platform-admin-route.tsx`, import `isReadmatesApiError` and `usePlatformAdminAiOpsJobsInfiniteQuery`.

Add state:

```tsx
const [aiFilters, setAiFilters] = useState({ status: "", clubId: "", errorCode: "" });
```

Derive disabled:

```tsx
const aiOpsDisabled =
  (isReadmatesApiError(aiOpsSummaryQuery.error) && aiOpsSummaryQuery.error.code === "AI_DISABLED") ||
  (isReadmatesApiError(aiOpsJobsQuery.error) && aiOpsJobsQuery.error.code === "AI_DISABLED");
```

Use the infinite query for jobs:

```tsx
const aiOpsJobsQuery = usePlatformAdminAiOpsJobsInfiniteQuery(
  {
    status: aiFilters.status || undefined,
    clubId: aiFilters.clubId || undefined,
    errorCode: aiFilters.errorCode || undefined,
  },
  activeTab === "ai" && !aiOpsDisabled,
);

const aiOpsJobs = aiOpsJobsQuery.data?.pages.flatMap((page) => page.items) ?? [];
const aiOpsNextCursor = aiOpsJobsQuery.data?.pages.at(-1)?.nextCursor ?? null;
```

Pass `filters`, `nextCursor`, `onFiltersChange`, `onLoadMore`, and `disabled` to `PlatformAdminAiOps`.

Keep generic `aiOpsError` null when `aiOpsDisabled` is true:

```tsx
aiOpsError={
  aiOpsDisabled
    ? null
    : aiOpsSummaryQuery.isError || aiOpsJobsQuery.isError || forceCancelAiJobMutation.isError
      ? "AI Ops 데이터를 불러오거나 갱신하지 못했습니다."
      : null
}
```

- [ ] **Step 6: Add AI Ops styles**

Add:

```css
.platform-admin-ai-ops__filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.platform-admin-ai-ops__disabled,
.platform-admin-ai-ops__detail {
  display: grid;
  gap: 10px;
  padding: 16px;
}

.platform-admin-ai-ops__detail dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0;
}

.platform-admin-ai-ops__detail dd {
  margin: 0;
  overflow-wrap: anywhere;
}
```

Mobile:

```css
.platform-admin-ai-ops__filters {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 7: Run AI Ops tests**

Run:

```bash
pnpm --dir front vitest run front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add front/features/platform-admin/api/platform-admin-api.ts front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx front/features/platform-admin/ui/platform-admin-ai-ops.tsx front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx front/features/platform-admin/route/platform-admin-route.tsx front/src/styles/globals.css
git commit -m "feat: complete platform admin AI ops ledger"
```

### Task 7: Local Dev Platform Admin Login

**Files:**
- Modify: `server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/DevLoginControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminControllerTest.kt`
- Modify: `front/features/auth/route/login-route.tsx`
- Modify: `front/tests/unit/login-card.test.tsx`

- [ ] **Step 1: Add failing dev-login tests**

Add to `DevLoginControllerTest`:

```kotlin
@Test
fun `seeded admin dev login exposes platform owner through auth me`() {
    val session =
        mockMvc
            .post("/api/dev/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"admin@example.com"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("admin@example.com") }
            }.andReturn()
            .request
            .session as MockHttpSession

    mockMvc
        .get("/api/auth/me") {
            this.session = session
        }.andExpect {
            status { isOk() }
            jsonPath("$.platformAdmin.email") { value("admin@example.com") }
            jsonPath("$.platformAdmin.role") { value("OWNER") }
        }
}

@Test
fun `seeded host dev login remains host only`() {
    val session =
        mockMvc
            .post("/api/dev/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"host@example.com"}"""
            }.andExpect {
                status { isOk() }
            }.andReturn()
            .request
            .session as MockHttpSession

    mockMvc
        .get("/api/auth/me") {
            this.session = session
        }.andExpect {
            status { isOk() }
            jsonPath("$.platformAdmin") { doesNotExist() }
        }
}
```

Add to `front/tests/unit/login-card.test.tsx`:

```tsx
it("shows the platform admin dev login account", () => {
  vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");

  render(<LoginRoute />);

  expect(screen.getByRole("button", { name: "운영자 · 플랫폼" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused dev-login tests and verify they fail**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.auth.api.DevLoginControllerTest'
pnpm --dir front vitest run front/tests/unit/login-card.test.tsx
```

Expected: server test rejects `admin@example.com`; frontend test does not find the dev account button.

- [ ] **Step 3: Add admin fixture to dev seed**

In `R__readmates_dev_seed.sql`, add user seed row:

```sql
union all
select 107, 'readmates-dev-google-admin', 'admin@example.com', '운영자', '운영자'
```

Add membership seed row so dev login can resolve a `CurrentMember`:

```sql
union all
select 207, 'admin@example.com', 'MEMBER'
```

After the memberships insert, add:

```sql
insert into platform_admins (user_id, role, status)
select users.id, 'OWNER', 'ACTIVE'
from users
where users.email = 'admin@example.com'
on duplicate key update
  role = values(role),
  status = values(status);
```

- [ ] **Step 4: Allow admin dev-login email**

In `JdbcMemberAccountAdapter.kt`, add to `devSeedEmails`:

```kotlin
"admin@example.com",
```

- [ ] **Step 5: Add login card account**

In `front/features/auth/route/login-route.tsx`, prepend:

```ts
{ label: "운영자 · 플랫폼", email: "admin@example.com" },
```

to `devAccounts`.

- [ ] **Step 6: Run dev-login tests**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.auth.api.DevLoginControllerTest'
pnpm --dir front vitest run front/tests/unit/login-card.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add server/src/main/resources/db/mysql/dev/R__readmates_dev_seed.sql server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberAccountAdapter.kt server/src/test/kotlin/com/readmates/auth/api/DevLoginControllerTest.kt front/features/auth/route/login-route.tsx front/tests/unit/login-card.test.tsx
git commit -m "feat: add local platform admin dev login"
```

### Task 8: End-To-End Coverage, Responsive QA, And Release Notes

**Files:**
- Create: `front/tests/e2e/platform-admin-shell.spec.ts`
- Modify: `front/tests/e2e/platform-admin-ai-ops.spec.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add admin shell E2E coverage**

Create `front/tests/e2e/platform-admin-shell.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { devLoginAs } from "./aigen-test-fixtures";

test("platform admin opens the admin ledger and switches tabs", async ({ page }) => {
  await devLoginAs(page, "admin@example.com", "/admin");

  await expect(page.getByRole("heading", { name: "플랫폼 관리" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "오늘 할 일" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "클럽 상세" }).click();
  await expect(page).toHaveURL(/tab=club/);
  await expect(page.getByRole("heading", { name: /공개 준비 체크리스트/ })).toBeVisible();

  await page.getByRole("tab", { name: "지원 접근" }).click();
  await expect(page).toHaveURL(/tab=support/);
  await expect(page.getByLabel("Grantee email")).toBeVisible();

  await page.getByRole("tab", { name: "AI Ops" }).click();
  await expect(page).toHaveURL(/tab=ai/);
  await expect(page.getByRole("heading", { name: "AI 운영" })).toBeVisible();
});
```

If `devLoginAs` does not accept a return path in the current fixture, extend it with:

```ts
export async function devLoginAs(page: Page, email: string, returnTo = "/app") {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByRole("button", { name: new RegExp(email === "admin@example.com" ? "운영자" : "호스트") }).click();
}
```

- [ ] **Step 2: Extend AI Ops E2E coverage**

In `front/tests/e2e/platform-admin-ai-ops.spec.ts`, add assertions for filters and detail:

```ts
await page.getByRole("tab", { name: "AI Ops" }).click();
await page.getByLabel("Status").selectOption("FAILED");
await expect(page.getByRole("button", { name: /자세히/ }).first()).toBeVisible();
await page.getByRole("button", { name: /자세히/ }).first().click();
await expect(page.getByLabel("AI job detail")).toBeVisible();
await expect(page.getByText(/transcript/i)).toHaveCount(0);
```

- [ ] **Step 3: Update changelog**

Under `CHANGELOG.md` `Unreleased`, add:

```md
- 고도화: `/admin`을 작업 중심 탭 구조로 재구성하고, 지원 접근 권한 생성 흐름을 active platform admin 이메일 확인 기반으로 보강했습니다.
- 개선: AI Ops에 필터, cursor 기반 더 보기, safe detail panel, kill-switch 상태 표시를 추가했습니다.
- 개발: 로컬 dev-login에 `admin@example.com` platform owner fixture를 추가해 `/admin`을 바로 검증할 수 있게 했습니다.
```

- [ ] **Step 4: Run full relevant checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
pnpm --dir front test:e2e
git diff --check -- CHANGELOG.md docs/superpowers/plans/2026-05-20-readmates-platform-admin-productization-implementation-plan.md
```

Expected: all commands PASS.

- [ ] **Step 5: Manual browser check**

Start the dev app if it is not running:

```bash
pnpm --dir front dev
```

Open:

```text
http://localhost:5173/admin
```

Verify:

- Login with `운영자 · 플랫폼`.
- The first admin screen is `오늘 할 일`.
- Top status strip remains visible on every tab.
- `클럽 상세` has one visibility action rail through publish readiness.
- `지원 접근` requires email lookup before create.
- `AI Ops` filters do not expose transcript, raw result JSON, instructions, feedback document body, provider raw response, or provider raw error.
- Mobile width around 390 px has no overlapping tab, button, card, or input text.

- [ ] **Step 6: Commit Task 8**

```bash
git add front/tests/e2e/platform-admin-shell.spec.ts front/tests/e2e/platform-admin-ai-ops.spec.ts CHANGELOG.md
git commit -m "test: cover platform admin productized flows"
```

## Final Verification

After all tasks are complete, run:

```bash
git status --short
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
pnpm --dir front test:e2e
```

Expected:

- `git status --short` shows no unstaged implementation files after the final commit.
- Frontend lint, frontend tests, frontend build, server tests, and E2E all pass.
- `/admin` can be reached locally with `admin@example.com` through dev login.

## Plan Self-Review

- Spec coverage: tab shell, today queue, club detail action alignment, support email lookup, support grant validation, AI Ops filters/paging/detail/disabled state, dev admin login, and E2E coverage are each mapped to a task.
- Public safety: examples use `example.com`, synthetic UUIDs, and local route names only. No real member data, private domains, deployment state, OCIDs, secrets, or token-shaped examples are introduced.
- Type consistency: tab IDs are `today | club | ai | support`; support lookup response uses `platformAdminRole` and `platformAdminStatus`; support grant creation still sends `granteeUserId`.
