# ReadMates Admin Support And Audit Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve `/admin/support` and `/admin/audit` so platform admins can judge support grants and audit events faster, with targeted desktop/mobile visual evidence.

**Architecture:** Keep the work frontend-only. Add deterministic derived model helpers in `features/platform-admin/model`, render them through existing route-owned UI props, and extend the existing admin support/audit E2E specs with public-safe visual evidence artifacts.

**Tech Stack:** React 19, React Router 7, TanStack Query v5, Vitest, Testing Library, Playwright E2E, Vite, Markdown docs.

## Global Constraints

- Follow `docs/agents/front.md` for route-first frontend boundaries.
- Follow `docs/agents/design.md` for UI, layout, copy, and visual polish.
- Follow `docs/agents/docs.md` for plan/spec documentation behavior.
- No server API contract change in the first pass.
- No new platform-admin route.
- No support grant scope expansion.
- No platform admin mutation for club/session/member data beyond existing support grant create/revoke behavior.
- No raw email, private member data, private domain, token-shaped value, secret, raw metadata JSON, provider raw error, transcript, generated result JSON, deployment identifier, OCID, or local absolute path in fixtures, UI, screenshots, or docs.
- UI modules render from props and callbacks only; they do not import API clients, query hooks, route modules, or `fetch`.
- `shouldShowAdminAuditDetailValue()` remains mandatory for audit metadata display.
- Screenshots are test artifacts, not committed product assets.

---

## File Structure

- Modify: `front/features/platform-admin/model/platform-admin-support-model.ts`
  - Adds support grant risk summary types, reason presets, and deterministic helper functions.
- Create: `front/features/platform-admin/model/platform-admin-support-model.test.ts`
  - Covers support summary states and preset safety.
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.ts`
  - Adds audit operation summary types and helper function.
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.test.ts`
  - Covers review-needed, limited-detail, drilldown, and recorded states.
- Modify: `front/features/platform-admin/ui/admin-support-workbench.tsx`
  - Renders risk summary, reason presets, and clearer active grant ledger copy.
- Modify: `front/features/platform-admin/ui/admin-support-workbench.test.tsx`
  - Covers risk summary rendering, preset interaction, and disabled create behavior.
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx`
  - Renders audit operation summary inside the existing detail panel.
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
  - Covers summary rendering and safe metadata behavior.
- Modify: `front/src/styles/globals.css`
  - Adds small scoped styles for support risk summary, reason presets, and audit operation summary.
- Modify: `front/tests/e2e/admin-support.spec.ts`
  - Adds desktop/mobile visual evidence for `/admin/support`.
- Modify: `front/tests/e2e/admin-audit.spec.ts`
  - Adds desktop/mobile visual evidence for `/admin/audit`.

---

### Task 1: Support Grant Risk Model

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-support-model.ts`
- Create: `front/features/platform-admin/model/platform-admin-support-model.test.ts`

**Interfaces:**
- Consumes: `AdminSupportSearchResult`, `selectedClubId: string | null`, `canCreateGrant: boolean`, `reason: string`, `expiresAt: string`.
- Produces:
  - `type SupportGrantRiskStatus = "READY" | "WARNING" | "BLOCKED"`
  - `type SupportGrantRiskItemState = "PASS" | "WARNING" | "BLOCKED"`
  - `type SupportGrantRiskItem = { id: string; label: string; state: SupportGrantRiskItemState; detail: string }`
  - `type SupportGrantRiskSummary = { status: SupportGrantRiskStatus; primaryMessage: string; items: SupportGrantRiskItem[] }`
  - `const SUPPORT_REASON_PRESETS: readonly string[]`
  - `function isSupportReasonPresetSafe(value: string): boolean`
  - `function buildSupportGrantRiskSummary(input: SupportGrantRiskSummaryInput): SupportGrantRiskSummary`

- [ ] **Step 1: Write the failing model tests**

Create `front/features/platform-admin/model/platform-admin-support-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SUPPORT_REASON_PRESETS,
  buildSupportGrantRiskSummary,
  isSupportReasonPresetSafe,
  type AdminSupportSearchResult,
} from "./platform-admin-support-model";

const eligibleResult: AdminSupportSearchResult = {
  subjectId: "support-1",
  displayName: "지원관리자",
  maskedEmail: "a***@example.com",
  kind: "PLATFORM_ADMIN",
  platformAdminRole: "SUPPORT",
  platformAdminStatus: "ACTIVE",
  clubMembershipSummary: [],
  grantEligible: true,
  grantBlockedReason: null,
};

function summary(overrides: Partial<Parameters<typeof buildSupportGrantRiskSummary>[0]> = {}) {
  return buildSupportGrantRiskSummary({
    selectedResult: eligibleResult,
    selectedClubId: "club-1",
    canCreateGrant: true,
    reason: "고객 문의 재현 지원",
    expiresAt: "2026-05-27T11:00",
    now: new Date("2026-05-27T10:00"),
    ...overrides,
  });
}

describe("buildSupportGrantRiskSummary", () => {
  it("blocks grant creation until a subject is selected", () => {
    const result = summary({ selectedResult: null });

    expect(result.status).toBe("BLOCKED");
    expect(result.primaryMessage).toBe("지원 대상을 먼저 선택하세요.");
    expect(result.items.find((item) => item.id === "subject")?.state).toBe("BLOCKED");
  });

  it("blocks when a club is not selected", () => {
    const result = summary({ selectedClubId: null });

    expect(result.status).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "club")?.detail).toBe("클럽 선택이 필요합니다.");
  });

  it("blocks non-owner admins from issuing a grant", () => {
    const result = summary({ canCreateGrant: false });

    expect(result.status).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "permission")?.detail).toBe("OWNER만 지원 접근 권한을 발급할 수 있습니다.");
  });

  it("uses the public-safe blocked reason for ineligible subjects", () => {
    const result = summary({
      selectedResult: {
        ...eligibleResult,
        grantEligible: false,
        grantBlockedReason: "이미 활성 grant가 있습니다.",
      },
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "eligibility")?.detail).toBe("이미 활성 grant가 있습니다.");
  });

  it("blocks empty reasons and invalid expiry values", () => {
    const result = summary({ reason: " ", expiresAt: "not-a-date" });

    expect(result.status).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "reason")?.state).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "expiry")?.detail).toBe("만료 시각을 다시 확인하세요.");
  });

  it("warns when the expiry is longer than the short support window", () => {
    const result = summary({ expiresAt: "2026-05-29T11:00" });

    expect(result.status).toBe("WARNING");
    expect(result.primaryMessage).toBe("발급 가능하지만 만료 시간이 길어 검토가 필요합니다.");
    expect(result.items.find((item) => item.id === "expiry")?.state).toBe("WARNING");
  });

  it("returns ready when every support grant input is safe enough", () => {
    const result = summary();

    expect(result.status).toBe("READY");
    expect(result.primaryMessage).toBe("지원 접근 권한을 발급할 준비가 되었습니다.");
  });
});

describe("SUPPORT_REASON_PRESETS", () => {
  it("uses only public-safe preset labels", () => {
    expect(SUPPORT_REASON_PRESETS).toEqual([
      "고객 문의 재현 지원",
      "호스트 온보딩 상태 확인",
      "알림 전달 상태 확인",
      "클럽 공개 준비 지원",
    ]);
    expect(SUPPORT_REASON_PRESETS.every(isSupportReasonPresetSafe)).toBe(true);
  });

  it("rejects preset text that looks private or token-shaped", () => {
    expect(isSupportReasonPresetSafe("ticket #1234")).toBe(false);
    expect(isSupportReasonPresetSafe("member@example.com")).toBe(false);
    expect(isSupportReasonPresetSafe("secret-token")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm --dir front test -- platform-admin-support-model
```

Expected: FAIL with export errors for `SUPPORT_REASON_PRESETS`, `buildSupportGrantRiskSummary`, and `isSupportReasonPresetSafe`.

- [ ] **Step 3: Add the support model implementation**

Append this code to `front/features/platform-admin/model/platform-admin-support-model.ts`:

```ts
export type SupportGrantRiskStatus = "READY" | "WARNING" | "BLOCKED";
export type SupportGrantRiskItemState = "PASS" | "WARNING" | "BLOCKED";

export type SupportGrantRiskItem = {
  id: string;
  label: string;
  state: SupportGrantRiskItemState;
  detail: string;
};

export type SupportGrantRiskSummary = {
  status: SupportGrantRiskStatus;
  primaryMessage: string;
  items: SupportGrantRiskItem[];
};

export type SupportGrantRiskSummaryInput = {
  selectedResult: AdminSupportSearchResult | null;
  selectedClubId: string | null;
  canCreateGrant: boolean;
  reason: string;
  expiresAt: string;
  now?: Date;
};

export const SUPPORT_REASON_PRESETS = [
  "고객 문의 재현 지원",
  "호스트 온보딩 상태 확인",
  "알림 전달 상태 확인",
  "클럽 공개 준비 지원",
] as const;

const SHORT_SUPPORT_WINDOW_HOURS = 24;

export function isSupportReasonPresetSafe(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized.includes("@")) return false;
  if (normalized.includes("token")) return false;
  if (normalized.includes("secret")) return false;
  if (normalized.includes("http://") || normalized.includes("https://")) return false;
  if (/#\d+/.test(value)) return false;
  return value.trim().length > 0;
}

export function buildSupportGrantRiskSummary(input: SupportGrantRiskSummaryInput): SupportGrantRiskSummary {
  const now = input.now ?? new Date();
  const expiry = new Date(input.expiresAt);
  const expiryValid = input.expiresAt.trim().length > 0 && !Number.isNaN(expiry.getTime());
  const expiresInHours = expiryValid ? (expiry.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
  const expiryState: SupportGrantRiskItemState = !expiryValid || (expiresInHours !== null && expiresInHours <= 0)
    ? "BLOCKED"
    : expiresInHours !== null && expiresInHours > SHORT_SUPPORT_WINDOW_HOURS
      ? "WARNING"
      : "PASS";
  const eligibilityBlockedReason = input.selectedResult?.grantBlockedReason?.trim() || "지원 접근 권한을 발급할 수 없는 대상입니다.";

  const items: SupportGrantRiskItem[] = [
    {
      id: "subject",
      label: "지원 대상",
      state: input.selectedResult ? "PASS" : "BLOCKED",
      detail: input.selectedResult
        ? `${input.selectedResult.displayName} · ${input.selectedResult.maskedEmail}`
        : "지원 대상을 먼저 선택하세요.",
    },
    {
      id: "club",
      label: "클럽 범위",
      state: input.selectedClubId ? "PASS" : "BLOCKED",
      detail: input.selectedClubId ? "선택한 클럽에만 지원 접근 권한을 발급합니다." : "클럽 선택이 필요합니다.",
    },
    {
      id: "permission",
      label: "발급 권한",
      state: input.canCreateGrant ? "PASS" : "BLOCKED",
      detail: input.canCreateGrant ? "OWNER 권한으로 발급합니다." : "OWNER만 지원 접근 권한을 발급할 수 있습니다.",
    },
    {
      id: "eligibility",
      label: "대상 적격성",
      state: input.selectedResult?.grantEligible ? "PASS" : "BLOCKED",
      detail: input.selectedResult?.grantEligible ? "대상자가 support grant 발급 조건을 만족합니다." : eligibilityBlockedReason,
    },
    {
      id: "reason",
      label: "발급 사유",
      state: input.reason.trim() ? "PASS" : "BLOCKED",
      detail: input.reason.trim() ? "사유가 기록됩니다." : "구체적인 지원 사유를 입력하세요.",
    },
    {
      id: "expiry",
      label: "만료 시각",
      state: expiryState,
      detail: expiryState === "BLOCKED"
        ? "만료 시각을 다시 확인하세요."
        : expiryState === "WARNING"
          ? "24시간을 넘는 지원 권한입니다. 필요성을 다시 확인하세요."
          : "짧은 지원 권한으로 제한됩니다.",
    },
  ];

  if (items.some((item) => item.state === "BLOCKED")) {
    return { status: "BLOCKED", primaryMessage: firstBlockedMessage(items), items };
  }

  if (items.some((item) => item.state === "WARNING")) {
    return { status: "WARNING", primaryMessage: "발급 가능하지만 만료 시간이 길어 검토가 필요합니다.", items };
  }

  return { status: "READY", primaryMessage: "지원 접근 권한을 발급할 준비가 되었습니다.", items };
}

function firstBlockedMessage(items: SupportGrantRiskItem[]): string {
  const firstBlocked = items.find((item) => item.state === "BLOCKED");
  if (firstBlocked?.id === "subject") return "지원 대상을 먼저 선택하세요.";
  if (firstBlocked?.id === "club") return "클럽을 선택하세요.";
  if (firstBlocked?.id === "permission") return "현재 역할은 지원 접근 권한을 발급할 수 없습니다.";
  if (firstBlocked?.id === "eligibility") return "선택한 대상에게 지원 접근 권한을 발급할 수 없습니다.";
  if (firstBlocked?.id === "reason") return "지원 사유를 입력하세요.";
  return "지원 접근 권한 입력값을 확인하세요.";
}
```

- [ ] **Step 4: Run the focused tests and verify pass**

Run:

```bash
pnpm --dir front test -- platform-admin-support-model
```

Expected: PASS for `front/features/platform-admin/model/platform-admin-support-model.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-support-model.ts front/features/platform-admin/model/platform-admin-support-model.test.ts
git commit -m "feat(front): model admin support grant risk"
```

---

### Task 2: Audit Operation Summary Model

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.test.ts`

**Interfaces:**
- Consumes: `AdminAuditLedgerItem`, `shouldShowAdminAuditDetailValue()`, `aiOpsDrilldownForAuditItem()`.
- Produces:
  - `type AdminAuditOperationState = "NEEDS_REVIEW" | "RECORDED" | "FOLLOW_UP_AVAILABLE" | "LIMITED_DETAIL"`
  - `type AdminAuditOperationSummary = { state: AdminAuditOperationState; label: string; detail: string; nextHref: string | null; nextLabel: string | null }`
  - `function buildAdminAuditOperationSummary(item: AdminAuditLedgerItem): AdminAuditOperationSummary`

- [ ] **Step 1: Add failing audit model tests**

Update the existing model import in `front/features/platform-admin/model/platform-admin-audit-model.test.ts` so it includes `buildAdminAuditOperationSummary`:

```ts
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  aiOpsDrilldownForAuditItem,
  buildAdminAuditOperationSummary,
  labelAdminAuditOutcome,
  shouldShowAdminAuditDetailValue,
} from "./platform-admin-audit-model";
```

Then append these tests to the same file:

```ts
describe("buildAdminAuditOperationSummary", () => {
  it("marks failed and denied events as review-needed", () => {
    expect(buildAdminAuditOperationSummary(auditItem({ outcome: "FAILED" }))).toMatchObject({
      state: "NEEDS_REVIEW",
      label: "확인 필요",
      nextHref: "/admin/ai-ops?clubId=club-1",
    });

    expect(buildAdminAuditOperationSummary(auditItem({ outcome: "DENIED", actionCategory: "SUPPORT" }))).toMatchObject({
      state: "NEEDS_REVIEW",
      label: "확인 필요",
      nextHref: null,
    });
  });

  it("marks unavailable metadata as limited detail", () => {
    expect(buildAdminAuditOperationSummary(auditItem({ metadataState: "UNAVAILABLE" }))).toEqual({
      state: "LIMITED_DETAIL",
      label: "세부 정보 제한",
      detail: "안전 정책 또는 source 상태 때문에 세부 정보를 표시하지 않습니다.",
      nextHref: "/admin/ai-ops?clubId=club-1",
      nextLabel: "AI Ops에서 보기",
    });
  });

  it("surfaces AI Ops drilldown as follow-up when the event succeeded", () => {
    expect(buildAdminAuditOperationSummary(auditItem())).toEqual({
      state: "FOLLOW_UP_AVAILABLE",
      label: "후속 화면 있음",
      detail: "AI 운영 화면에서 같은 클럽 범위로 이어서 확인할 수 있습니다.",
      nextHref: "/admin/ai-ops?clubId=club-1",
      nextLabel: "AI Ops에서 보기",
    });
  });

  it("marks safe successful events as recorded evidence", () => {
    expect(
      buildAdminAuditOperationSummary(
        auditItem({
          actionCategory: "SUPPORT",
          sourceSlice: "S4",
          target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
          safeMetadata: [{ label: "scope", value: "HOST_SUPPORT_READ", kind: "code" }],
        }),
      ),
    ).toEqual({
      state: "RECORDED",
      label: "기록 보존",
      detail: "지원 접근 이벤트가 감사 가능한 안전한 메타데이터와 함께 기록되었습니다.",
      nextHref: null,
      nextLabel: null,
    });
  });
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm --dir front test -- platform-admin-audit-model
```

Expected: FAIL with an export error for `buildAdminAuditOperationSummary`.

- [ ] **Step 3: Add the audit model implementation**

Append this code in `front/features/platform-admin/model/platform-admin-audit-model.ts` after `aiOpsDrilldownForAuditItem()`:

```ts
export type AdminAuditOperationState = "NEEDS_REVIEW" | "RECORDED" | "FOLLOW_UP_AVAILABLE" | "LIMITED_DETAIL";

export type AdminAuditOperationSummary = {
  state: AdminAuditOperationState;
  label: string;
  detail: string;
  nextHref: string | null;
  nextLabel: string | null;
};

export function buildAdminAuditOperationSummary(item: AdminAuditLedgerItem): AdminAuditOperationSummary {
  const nextHref = aiOpsDrilldownForAuditItem(item);
  const nextLabel = nextHref ? "AI Ops에서 보기" : null;

  if (item.metadataState === "UNAVAILABLE") {
    return {
      state: "LIMITED_DETAIL",
      label: "세부 정보 제한",
      detail: "안전 정책 또는 source 상태 때문에 세부 정보를 표시하지 않습니다.",
      nextHref,
      nextLabel,
    };
  }

  if (item.outcome === "FAILED" || item.outcome === "DENIED" || item.outcome === "UNKNOWN") {
    return {
      state: "NEEDS_REVIEW",
      label: "확인 필요",
      detail: `${labelAdminAuditSourceSlice(item.sourceSlice)} 이벤트 결과가 ${labelAdminAuditOutcome(item.outcome)} 상태입니다.`,
      nextHref,
      nextLabel,
    };
  }

  if (nextHref) {
    return {
      state: "FOLLOW_UP_AVAILABLE",
      label: "후속 화면 있음",
      detail: "AI 운영 화면에서 같은 클럽 범위로 이어서 확인할 수 있습니다.",
      nextHref,
      nextLabel,
    };
  }

  const visibleMetadataCount = item.safeMetadata.filter((entry) =>
    shouldShowAdminAuditDetailValue(entry.label, entry.value),
  ).length;

  return {
    state: "RECORDED",
    label: "기록 보존",
    detail: visibleMetadataCount > 0
      ? `${labelAdminAuditSourceSlice(item.sourceSlice)} 이벤트가 감사 가능한 안전한 메타데이터와 함께 기록되었습니다.`
      : `${labelAdminAuditSourceSlice(item.sourceSlice)} 이벤트가 감사 ledger에 기록되었습니다.`,
    nextHref: null,
    nextLabel: null,
  };
}
```

- [ ] **Step 4: Run the focused tests and verify pass**

Run:

```bash
pnpm --dir front test -- platform-admin-audit-model
```

Expected: PASS for `front/features/platform-admin/model/platform-admin-audit-model.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-audit-model.ts front/features/platform-admin/model/platform-admin-audit-model.test.ts
git commit -m "feat(front): model admin audit operation summary"
```

---

### Task 3: Support And Audit UI Rendering

**Files:**
- Modify: `front/features/platform-admin/ui/admin-support-workbench.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx`
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: `buildSupportGrantRiskSummary()`, `SUPPORT_REASON_PRESETS`, `buildAdminAuditOperationSummary()`.
- Produces:
  - support risk summary section labelled `지원 접근 검토`
  - support reason preset buttons
  - audit summary block labelled `운영 판단`

- [ ] **Step 1: Add failing UI tests for support**

In `front/features/platform-admin/ui/admin-support-workbench.test.tsx`, add these tests inside the existing `describe("AdminSupportWorkbench", () => {` block:

```tsx
  it("renders support risk summary and reason presets for a selected result", async () => {
    const onReasonChange = vi.fn();
    const user = userEvent.setup();
    renderWorkbench({ selectedResult: result, onReasonChange });

    expect(screen.getByRole("heading", { name: "지원 접근 검토" })).toBeInTheDocument();
    expect(screen.getByText("지원 사유를 입력하세요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "고객 문의 재현 지원" }));

    expect(onReasonChange).toHaveBeenCalledWith("고객 문의 재현 지원");
  });

  it("keeps grant creation disabled when the risk summary is blocked", () => {
    renderWorkbench({ selectedResult: result, reason: "", expiresAt: "2026-05-27T11:00" });

    expect(screen.getByText("지원 사유를 입력하세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발급" })).toBeDisabled();
  });

  it("shows ready risk summary when reason and expiry are valid", () => {
    const oneHourFromNowDate = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    const oneHourFromNow = `${oneHourFromNowDate.getFullYear()}-${pad(oneHourFromNowDate.getMonth() + 1)}-${pad(oneHourFromNowDate.getDate())}T${pad(oneHourFromNowDate.getHours())}:${pad(oneHourFromNowDate.getMinutes())}`;
    renderWorkbench({ selectedResult: result, reason: "고객 문의 재현 지원", expiresAt: oneHourFromNow });

    expect(screen.getByText("지원 접근 권한을 발급할 준비가 되었습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발급" })).not.toBeDisabled();
  });
```

- [ ] **Step 2: Add failing UI tests for audit**

In `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`, add these assertions to the existing tests:

Inside `renders ledger rows and safe metadata detail`, after `expect(detail.textContent).not.toContain("{");`, add:

```tsx
    expect(within(detail).getByText("운영 판단")).toBeInTheDocument();
    expect(within(detail).getByText("기록 보존")).toBeInTheDocument();
```

Inside `links an AI_OPS row detail to the ai-ops club drilldown`, before the existing link assertion, add:

```tsx
    expect(within(detail).getByText("후속 화면 있음")).toBeInTheDocument();
```

Add a new test:

```tsx
  it("shows limited detail when metadata is unavailable", () => {
    render(
      <AdminAuditLedger
        page={{
          ...page,
          items: [
            {
              ...page.items[0],
              metadataState: "UNAVAILABLE",
              safeMetadata: [{ label: "rawJson", value: "{\"secret\":\"value\"}", kind: "json" }],
            },
          ],
        }}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(within(detail).getByText("세부 정보 제한")).toBeInTheDocument();
    expect(detail.textContent).not.toContain("secret");
    expect(detail.textContent).not.toContain("{");
  });
```

- [ ] **Step 3: Run UI tests and verify failure**

Run:

```bash
pnpm --dir front test -- admin-support-workbench admin-audit-ledger
```

Expected: FAIL because the new headings and summary copy are not rendered yet.

- [ ] **Step 4: Render support risk summary and presets**

Modify the import block in `front/features/platform-admin/ui/admin-support-workbench.tsx`:

```tsx
import {
  SUPPORT_REASON_PRESETS,
  buildSupportGrantRiskSummary,
  type AdminSupportGrantLedgerItem,
  type AdminSupportSearchResult,
  type SupportGrantRiskItemState,
  type SupportGrantRiskSummary,
} from "@/features/platform-admin/model/platform-admin-support-model";
```

Replace the current model import:

```tsx
import type {
  AdminSupportGrantLedgerItem,
  AdminSupportSearchResult,
} from "@/features/platform-admin/model/platform-admin-support-model";
```

with the import above.

Inside `AdminSupportWorkbench`, add this immediately before the existing `const createDisabled =` declaration:

```tsx
  const riskSummary = buildSupportGrantRiskSummary({
    selectedResult: props.selectedResult,
    selectedClubId: props.selectedClubId,
    canCreateGrant: props.canCreateGrant,
    reason: props.reason,
    expiresAt: props.expiresAt,
  });
```

Then update the existing `createDisabled` declaration to include the derived summary:

```tsx
  const createDisabled =
    riskSummary.status === "BLOCKED" ||
    !props.selectedResult?.grantEligible ||
    !props.selectedClubId ||
    !props.reason.trim() ||
    !props.expiresAt ||
    !props.canCreateGrant ||
    props.busy;
```

Inside the selected-result grant panel, insert this JSX immediately after the target line:

```tsx
          <SupportRiskSummaryView summary={riskSummary} />
          <div className="admin-support-workbench__presets" aria-label="지원 사유 프리셋">
            {SUPPORT_REASON_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => props.onReasonChange(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
```

Add these helper components before the final closing of the file:

```tsx
function SupportRiskSummaryView({ summary }: { summary: SupportGrantRiskSummary }) {
  return (
    <section className="admin-support-risk" aria-labelledby="support-risk-title">
      <div className="admin-support-risk__header">
        <h3 id="support-risk-title" className="h3 editorial">지원 접근 검토</h3>
        <span className={supportRiskBadgeClass(summary.status)}>{summary.primaryMessage}</span>
      </div>
      <dl className="admin-support-risk__items">
        {summary.items.map((item) => (
          <div key={item.id}>
            <dt>
              {item.label}
              <span className={supportRiskItemClass(item.state)}>{supportRiskItemLabel(item.state)}</span>
            </dt>
            <dd>{item.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function supportRiskBadgeClass(status: SupportGrantRiskSummary["status"]) {
  if (status === "READY") return "badge badge-ok badge-dot";
  if (status === "WARNING") return "badge badge-warn badge-dot";
  return "badge badge-danger badge-dot";
}

function supportRiskItemClass(state: SupportGrantRiskItemState) {
  if (state === "PASS") return "badge badge-ok badge-dot";
  if (state === "WARNING") return "badge badge-warn badge-dot";
  return "badge badge-danger badge-dot";
}

function supportRiskItemLabel(state: SupportGrantRiskItemState) {
  if (state === "PASS") return "확인";
  if (state === "WARNING") return "검토";
  return "차단";
}
```

- [ ] **Step 5: Render audit operation summary**

Modify the model import block in `front/features/platform-admin/ui/admin-audit-ledger.tsx` so it starts like:

```tsx
import {
  buildAdminAuditOperationSummary,
  labelAdminAuditOutcome,
```

Inside `AuditDetail`, replace `const aiOpsPath = aiOpsDrilldownForAuditItem(item);` with:

```tsx
  const operationSummary = buildAdminAuditOperationSummary(item);
```

Then insert this JSX after the source/action paragraph:

```tsx
      <div className={`admin-audit__operation admin-audit__operation--${operationSummary.state.toLowerCase()}`}>
        <p className="eyebrow">운영 판단</p>
        <strong>{operationSummary.label}</strong>
        <p className="small muted">{operationSummary.detail}</p>
        {operationSummary.nextHref ? (
          <Link to={operationSummary.nextHref} className="admin-audit__drill">
            {operationSummary.nextLabel}
          </Link>
        ) : null}
      </div>
```

Remove the old duplicate AI Ops link block at the bottom of `AuditDetail`:

```tsx
      {aiOpsPath ? (
        <Link to={aiOpsPath} className="admin-audit__drill">
          AI Ops에서 보기 →
        </Link>
      ) : null}
```

The local `aiOpsPath` variable should not remain after this replacement.

- [ ] **Step 6: Add scoped styles**

In `front/src/styles/globals.css`, add this block after the existing `.admin-support-workbench__results em` block:

```css
.admin-support-risk {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 16px;
  background: var(--surface);
}

.admin-support-risk__header,
.admin-support-risk__items dt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.admin-support-risk__items {
  display: grid;
  gap: 10px;
  margin: 14px 0 0;
}

.admin-support-risk__items div {
  display: grid;
  gap: 4px;
}

.admin-support-risk__items dt {
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 800;
}

.admin-support-risk__items dd {
  margin: 0;
  color: var(--text-2);
  font-size: 0.9rem;
}

.admin-support-workbench__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

Add this block after the existing `.admin-audit__metadata dd` block:

```css
.admin-audit__operation {
  display: grid;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
  background: var(--surface);
}

.admin-audit__operation strong {
  color: var(--text);
}
```

- [ ] **Step 7: Run UI tests and verify pass**

Run:

```bash
pnpm --dir front test -- admin-support-workbench admin-audit-ledger
```

Expected: PASS for support and audit UI tests.

- [ ] **Step 8: Commit**

```bash
git add \
  front/features/platform-admin/ui/admin-support-workbench.tsx \
  front/features/platform-admin/ui/admin-support-workbench.test.tsx \
  front/features/platform-admin/ui/admin-audit-ledger.tsx \
  front/features/platform-admin/ui/admin-audit-ledger.test.tsx \
  front/src/styles/globals.css
git commit -m "feat(front): show admin support audit summaries"
```

---

### Task 4: Support And Audit E2E Visual Evidence

**Files:**
- Modify: `front/tests/e2e/admin-support.spec.ts`
- Modify: `front/tests/e2e/admin-audit.spec.ts`

**Interfaces:**
- Consumes: rendered support risk summary heading `지원 접근 검토`.
- Consumes: rendered audit operation summary heading `운영 판단`.
- Produces: Playwright test artifacts:
  - `admin-support-desktop.png`
  - `admin-support-mobile.png`
  - `admin-audit-desktop.png`
  - `admin-audit-mobile.png`

- [ ] **Step 1: Add failing support visual evidence test**

Append this test to `front/tests/e2e/admin-support.spec.ts`:

```ts
async function expectNoSupportPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

test("owner captures support grant risk visual evidence on desktop and mobile", async ({ page }, testInfo) => {
  await routeSupport(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/support?clubId=${CLUB_ID}`);
  await page.getByPlaceholder("이름 또는 이메일").fill("admin-support@example.com");
  await page.getByRole("button", { name: "검색" }).click();
  await page.getByRole("button", { name: /지원관리자/ }).click();
  await expect(page.getByRole("heading", { name: "지원 접근 검토" })).toBeVisible();
  await page.getByRole("button", { name: "고객 문의 재현 지원" }).click();
  await expect(page.getByText("지원 접근 권한을 발급할 준비가 되었습니다.")).toBeVisible();
  await expectNoSupportPrivateSentinels(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("admin-support-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/support?clubId=${CLUB_ID}`);
  await page.getByPlaceholder("이름 또는 이메일").fill("admin-support@example.com");
  await page.getByRole("button", { name: "검색" }).click();
  await page.getByRole("button", { name: /지원관리자/ }).click();
  await expect(page.getByRole("heading", { name: "지원 접근 검토" })).toBeVisible();
  await page.getByRole("button", { name: "고객 문의 재현 지원" }).click();
  await expect(page.getByText("지원 접근 권한을 발급할 준비가 되었습니다.")).toBeVisible();
  await expectNoSupportPrivateSentinels(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("admin-support-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});
```

- [ ] **Step 2: Add failing audit visual evidence test**

In `front/tests/e2e/admin-audit.spec.ts`, update the second item in `routeAudit()` so it has a review-needed state:

```ts
          outcome: "FAILED",
```

Append this helper and test:

```ts
async function expectNoAuditPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

test("owner captures audit operation summary visual evidence on desktop and mobile", async ({ page }, testInfo) => {
  await routePlatformAdminShell(page, "OWNER");
  await routeAudit(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "감사" })).toBeVisible();
  await expect(page.getByText("운영 판단")).toBeVisible();
  await expectNoAuditPrivateSentinels(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("admin-audit-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "감사" })).toBeVisible();
  await page.getByRole("button", { name: /support grant가 생성되었습니다/ }).click();
  await expect(page.getByText("확인 필요")).toBeVisible();
  await expectNoAuditPrivateSentinels(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("admin-audit-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});
```

- [ ] **Step 3: Run targeted E2E and verify failure before Task 3 is complete**

Run this only if Task 3 has not been implemented yet:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-support.spec.ts tests/e2e/admin-audit.spec.ts
```

Expected: FAIL because `지원 접근 검토` or `운영 판단` is not visible. If Task 3 has already been committed, skip this failure check and continue to Step 4.

- [ ] **Step 4: Run targeted E2E and verify pass**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-support.spec.ts tests/e2e/admin-audit.spec.ts
```

Expected: PASS for both admin support and admin audit E2E specs. The screenshots are written under `front/test-results` or the Playwright per-test output directory and are not staged.

- [ ] **Step 5: Commit**

```bash
git add front/tests/e2e/admin-support.spec.ts front/tests/e2e/admin-audit.spec.ts
git commit -m "test(front): capture admin support audit visuals"
```

---

### Task 5: Frontend Closeout

**Files:**
- Inspect: `git diff --stat`
- Inspect: `git status --short`

**Interfaces:**
- Consumes: all prior task commits.
- Produces: verified frontend closeout evidence and a clean or intentionally reported working tree.

- [ ] **Step 1: Run the model and UI tests together**

Run:

```bash
pnpm --dir front test -- platform-admin-support-model platform-admin-audit-model admin-support-workbench admin-audit-ledger
```

Expected: PASS for the model and UI tests touched by this plan.

- [ ] **Step 2: Run the targeted E2E tests**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-support.spec.ts tests/e2e/admin-audit.spec.ts
```

Expected: PASS for the support and audit E2E specs.

- [ ] **Step 3: Run frontend lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 4: Run frontend build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS and Vite completes a production build.

- [ ] **Step 5: Check for accidental screenshot staging**

Run:

```bash
git status --short
```

Expected: no `front/test-results`, `front/playwright-report`, or screenshot artifact files are staged. If Playwright output directories are present and untracked, leave them untracked and report them in closeout instead of committing them.

- [ ] **Step 6: Commit any final formatting-only corrections**

If Step 1 through Step 4 required small formatting or import-order fixes, commit only those touched files:

```bash
git add front/features/platform-admin front/tests/e2e/admin-support.spec.ts front/tests/e2e/admin-audit.spec.ts front/src/styles/globals.css
git commit -m "chore(front): close admin support audit polish"
```

Expected: create this commit only when there are actual final corrections. If no files changed after Task 4, do not create an empty commit.
