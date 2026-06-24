# ReadMates Host Closing Board Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the host session closing board into a Korean-first operating board that tells hosts what to fix next, why it matters, and which host/member/public surface is ready.

**Architecture:** Keep the existing frontend route-first flow. The route fetches `host.session_closing_status.v1`, `front/features/host/model/session-closing-model.ts` derives all operating copy and view-state, and `front/features/host/ui/session-closing-board.tsx` renders props only.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vitest, Testing Library, Playwright E2E, Vite.

## Global Constraints

- Frontend-only host UX change.
- Do not add a server endpoint or `host.session_closing_status.v2`.
- Do not add a DB migration.
- Do not change notification event types or notification delivery policy.
- Do not change auth/BFF token, OAuth scope, or deploy workflow behavior.
- Do not expose admin-only signals, real member data, private domains, deployment state, local paths, OCIDs, secrets, token-shaped values, raw JSON bodies, email bodies, transcripts, or provider raw errors.
- Preserve route-first dependency direction: `src/app -> src/pages -> features -> shared`.
- UI components render from props/callbacks only and do not import API, QueryClient, route params, or feature query modules.
- Keep host pages as efficient operating ledgers with calm ReadMates editorial styling.

---

## File Structure

- Modify `front/features/host/model/session-closing-model.ts`
  - Owns all Korean operating labels, reasons, state labels, surface descriptions, evidence labels, and safe fallbacks.
- Modify `front/features/host/model/session-closing-model.test.ts`
  - Pins the model contract before UI work.
- Modify `front/features/host/ui/session-closing-board.tsx`
  - Renders the enriched view model without importing API, route, or query code.
- Modify `front/features/host/ui/session-closing-board.test.tsx`
  - Verifies primary action panel, checklist state badges, surface links, evidence ledger, missing-link copy, and public-safety sentinels.
- Modify `front/src/styles/globals.css`
  - Adds narrowly scoped `.rm-host-closing-board__*` styles or adjusts existing ones for the enriched board.
- Modify `front/tests/e2e/session-closing-flywheel.spec.ts`
  - Updates the existing host/member/public flywheel evidence for the Korean operating board.
- Modify `CHANGELOG.md`
  - Adds a short Unreleased host UX note.

---

### Task 1: Enrich The Closing Board View Model

**Files:**
- Modify: `front/features/host/model/session-closing-model.ts`
- Modify: `front/features/host/model/session-closing-model.test.ts`

**Interfaces:**
- Consumes: `SessionClosingStatusInput` from `front/features/host/model/session-closing-model.ts`.
- Produces: `getSessionClosingBoardView(status: SessionClosingStatusInput): SessionClosingBoardView`.
- Produces enriched `SessionClosingBoardView.primaryAction` with:
  - `label: string`
  - `reason: string`
  - `tone: SessionClosingTone`
  - `href: string | null`
- Produces checklist rows with:
  - `stateLabel: string`
  - `actionLabel: string`
- Produces surfaces with:
  - `title: string`
  - `detail: string`
  - `actionLabel: string`
- Produces evidence rows with Korean labels.

- [ ] **Step 1: Add failing model tests for primary action reasons and Korean labels**

Add or replace the primary action mapping test in `front/features/host/model/session-closing-model.test.ts`:

```ts
it.each([
  [
    "CLOSE_SESSION",
    "세션 종료 확인",
    "열린 세션을 먼저 닫아야 기록 패키지와 알림 상태를 판단할 수 있습니다.",
  ],
  [
    "IMPORT_RECORDS",
    "기록 패키지 검토",
    "요약, 하이라이트, 한줄평, 피드백 문서가 아직 마감 증거로 충분하지 않습니다.",
  ],
  [
    "PUBLISH_RECORDS",
    "기록 공개 범위 확인",
    "멤버 또는 공개 표면에 기록을 열기 전 공개 범위를 점검해야 합니다.",
  ],
  [
    "SEND_NOTIFICATION",
    "멤버 알림 확인",
    "멤버가 지난 모임 회고로 돌아갈 알림 흐름이 아직 완성되지 않았습니다.",
  ],
  [
    "REVIEW_PUBLIC_PAGE",
    "공개 기록 확인",
    "공개 표면에 발행된 기록이 의도대로 보이는지 최종 확인합니다.",
  ],
  [
    "NONE",
    "추가 조치 없음",
    "마감에 필요한 증거가 준비되어 있습니다.",
  ],
] satisfies Array<[SessionClosingStatusInput["overall"]["primaryAction"], string, string]>)(
  "maps %s to Korean operating copy",
  (primaryAction, label, reason) => {
    const view = getSessionClosingBoardView({
      ...baseStatus,
      overall: { ...baseStatus.overall, primaryAction },
    });

    expect(view.primaryAction.label).toBe(label);
    expect(view.primaryAction.reason).toBe(reason);
  },
);
```

- [ ] **Step 2: Add failing model tests for checklist, surface, and evidence labels**

Append these tests in the same `describe("getSessionClosingBoardView", ...)` block:

```ts
it("uses Korean checklist state labels and action labels", () => {
  const view = getSessionClosingBoardView({
    ...baseStatus,
    checklist: [
      { id: "done", state: "DONE", label: "세션 종료", detail: "닫힘", href: "/app/host/sessions/s1/edit" },
      { id: "needed", state: "ACTION_REQUIRED", label: "멤버 알림", detail: "대기", href: "/app/host/notifications" },
      { id: "blocked", state: "BLOCKED", label: "피드백 문서", detail: "확인 필요", href: null },
      { id: "na", state: "NOT_APPLICABLE", label: "공개 기록", detail: "비공개", href: null },
    ],
  });

  expect(view.checklist.map((item) => item.stateLabel)).toEqual(["완료", "조치 필요", "차단", "해당 없음"]);
  expect(view.checklist.map((item) => item.actionLabel)).toEqual(["확인하기", "확인하기", "상태 확인", "상태 확인"]);
});

it("describes host member and public surfaces with role-centered Korean copy", () => {
  const view = getSessionClosingBoardView(baseStatus);

  expect(view.surfaces).toEqual([
    expect.objectContaining({
      id: "HOST",
      title: "호스트 문서",
      detail: "호스트가 기록 패키지와 마감 상태를 관리할 수 있습니다.",
      actionLabel: "호스트 문서 확인",
    }),
    expect.objectContaining({
      id: "MEMBER",
      title: "멤버 회고",
      detail: "멤버가 지난 모임 기록과 피드백으로 돌아갈 수 있습니다.",
      actionLabel: "멤버 회고 확인",
    }),
    expect.objectContaining({
      id: "PUBLIC",
      title: "공개 기록",
      detail: "공개 기록 표면에서 발행 상태를 확인할 수 있습니다.",
      actionLabel: "공개 기록 확인",
    }),
  ]);
});

it("shows honest copy when member and public links are absent", () => {
  const view = getSessionClosingBoardView({
    ...baseStatus,
    evidence: {
      ...baseStatus.evidence,
      memberReflectionHref: null,
      publicRecordHref: null,
    },
  });

  expect(view.surfaces.find((surface) => surface.id === "MEMBER")).toEqual(
    expect.objectContaining({
      detail: "멤버 회고 진입은 아직 확인되지 않았습니다.",
      href: null,
    }),
  );
  expect(view.surfaces.find((surface) => surface.id === "PUBLIC")).toEqual(
    expect.objectContaining({
      detail: "공개 표면에는 아직 발행되지 않았습니다.",
      href: null,
    }),
  );
});

it("uses Korean evidence labels and public-safe aggregate values", () => {
  const view = getSessionClosingBoardView(baseStatus);

  expect(view.evidence).toEqual([
    { label: "공개 요약", value: "저장됨" },
    { label: "하이라이트", value: "2" },
    { label: "한줄평", value: "1" },
    { label: "피드백 문서", value: "열람 가능" },
    { label: "최근 멤버 알림", value: "없음" },
  ]);
  expect(JSON.stringify(view)).not.toContain("member1@example.com");
  expect(JSON.stringify(view)).not.toContain("ADMIN_ROUTE");
  expect(JSON.stringify(view)).not.toContain("{\"");
});
```

- [ ] **Step 3: Run model tests and verify the new assertions fail**

Run:

```bash
pnpm --dir front test features/host/model/session-closing-model.test.ts
```

Expected: FAIL because `primaryAction.reason`, checklist `stateLabel`, checklist `actionLabel`, surface Korean copy, and Korean evidence labels are not implemented yet.

- [ ] **Step 4: Update view model types**

In `front/features/host/model/session-closing-model.ts`, update `SessionClosingBoardView` to this shape:

```ts
export type SessionClosingBoardView = {
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: SessionClosingTone;
  primaryAction: {
    label: string;
    reason: string;
    tone: SessionClosingTone;
    href: string | null;
  };
  checklist: Array<{
    id: string;
    label: string;
    detail: string;
    state: SessionClosingStatusInput["checklist"][number]["state"];
    stateLabel: string;
    tone: SessionClosingTone;
    href: string | null;
    actionLabel: string;
  }>;
  surfaces: Array<{
    id: "HOST" | "MEMBER" | "PUBLIC";
    title: string;
    detail: string;
    tone: SessionClosingTone;
    href: string | null;
    actionLabel: string;
  }>;
  evidence: Array<{
    label: string;
    value: string;
  }>;
};
```

- [ ] **Step 5: Implement model mapping helpers**

Replace the existing helper functions from `primaryAction()` down to `feedbackLabel()` with this implementation:

```ts
function primaryAction(status: SessionClosingStatusInput): SessionClosingBoardView["primaryAction"] {
  const fallback = {
    label: "확인 필요",
    reason: "마감 상태를 다시 확인해야 합니다.",
    tone: overallTone(status.overall.state),
    href: null,
  };

  switch (status.overall.primaryAction) {
    case "CLOSE_SESSION":
      return {
        label: "세션 종료 확인",
        reason: "열린 세션을 먼저 닫아야 기록 패키지와 알림 상태를 판단할 수 있습니다.",
        tone: "warn",
        href: `/app/host/sessions/${status.session.sessionId}/edit`,
      };
    case "IMPORT_RECORDS":
      return {
        label: "기록 패키지 검토",
        reason: "요약, 하이라이트, 한줄평, 피드백 문서가 아직 마감 증거로 충분하지 않습니다.",
        tone: "danger",
        href: `/app/host/sessions/${status.session.sessionId}/edit?records=json`,
      };
    case "PUBLISH_RECORDS":
      return {
        label: "기록 공개 범위 확인",
        reason: "멤버 또는 공개 표면에 기록을 열기 전 공개 범위를 점검해야 합니다.",
        tone: "warn",
        href: `/app/host/sessions/${status.session.sessionId}/edit`,
      };
    case "SEND_NOTIFICATION":
      return {
        label: "멤버 알림 확인",
        reason: "멤버가 지난 모임 회고로 돌아갈 알림 흐름이 아직 완성되지 않았습니다.",
        tone: "warn",
        href: "/app/host/notifications",
      };
    case "REVIEW_PUBLIC_PAGE":
      return {
        label: "공개 기록 확인",
        reason: "공개 표면에 발행된 기록이 의도대로 보이는지 최종 확인합니다.",
        tone: "accent",
        href: status.evidence.publicRecordHref,
      };
    case "NONE":
      return {
        label: "추가 조치 없음",
        reason: "마감에 필요한 증거가 준비되어 있습니다.",
        tone: "ok",
        href: null,
      };
    default:
      return fallback;
  }
}

function checklistStateLabel(state: SessionClosingStatusInput["checklist"][number]["state"]): string {
  switch (state) {
    case "DONE":
      return "완료";
    case "ACTION_REQUIRED":
      return "조치 필요";
    case "BLOCKED":
      return "차단";
    case "NOT_APPLICABLE":
      return "해당 없음";
    default:
      return "확인 필요";
  }
}

function checklistActionLabel(href: string | null): string {
  return href ? "확인하기" : "상태 확인";
}

function surfaceCards(status: SessionClosingStatusInput): SessionClosingBoardView["surfaces"] {
  return [
    {
      id: "HOST",
      title: "호스트 문서",
      detail: "호스트가 기록 패키지와 마감 상태를 관리할 수 있습니다.",
      tone: overallTone(status.overall.state),
      href: `/app/host/sessions/${status.session.sessionId}/edit`,
      actionLabel: "호스트 문서 확인",
    },
    {
      id: "MEMBER",
      title: "멤버 회고",
      detail: status.evidence.memberReflectionHref
        ? "멤버가 지난 모임 기록과 피드백으로 돌아갈 수 있습니다."
        : "멤버 회고 진입은 아직 확인되지 않았습니다.",
      tone: status.evidence.memberReflectionHref ? "ok" : "muted",
      href: status.evidence.memberReflectionHref,
      actionLabel: "멤버 회고 확인",
    },
    {
      id: "PUBLIC",
      title: "공개 기록",
      detail: status.evidence.publicRecordHref
        ? "공개 기록 표면에서 발행 상태를 확인할 수 있습니다."
        : "공개 표면에는 아직 발행되지 않았습니다.",
      tone: status.evidence.publicRecordHref ? "ok" : "muted",
      href: status.evidence.publicRecordHref,
      actionLabel: "공개 기록 확인",
    },
  ];
}

function feedbackLabel(state: SessionClosingStatusInput["evidence"]["feedbackDocumentState"]) {
  if (state === "AVAILABLE") return "열람 가능";
  if (state === "INVALID") return "확인 필요";
  if (state === "LOCKED") return "잠김";
  return "없음";
}

function notificationLabel(event: SessionClosingStatusInput["evidence"]["latestNotificationEvent"]): string {
  if (!event) return "없음";
  switch (event.status) {
    case "PUBLISHED":
      return "발송됨";
    case "PENDING":
      return "대기 중";
    case "FAILED":
      return "실패";
    case "DEAD":
      return "중단됨";
    default:
      return "확인 필요";
  }
}
```

- [ ] **Step 6: Wire helpers into `getSessionClosingBoardView()`**

Update the object returned by `getSessionClosingBoardView()` so the checklist, surfaces, and evidence use the new helpers:

```ts
export function getSessionClosingBoardView(status: SessionClosingStatusInput): SessionClosingBoardView {
  return {
    title: `No.${String(status.session.sessionNumber).padStart(2, "0")} · ${status.session.bookTitle}`,
    subtitle: `${status.session.meetingDate} · ${visibilityLabel(status.session.recordVisibility)}`,
    statusLabel: status.overall.label,
    statusTone: overallTone(status.overall.state),
    primaryAction: primaryAction(status),
    checklist: status.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      state: item.state,
      stateLabel: checklistStateLabel(item.state),
      tone: checklistTone(item.state),
      href: item.href,
      actionLabel: checklistActionLabel(item.href),
    })),
    surfaces: surfaceCards(status),
    evidence: [
      { label: "공개 요약", value: status.evidence.summaryPublished ? "저장됨" : "없음" },
      { label: "하이라이트", value: `${nonNegative(status.evidence.highlightCount)}` },
      { label: "한줄평", value: `${nonNegative(status.evidence.oneLinerCount)}` },
      { label: "피드백 문서", value: feedbackLabel(status.evidence.feedbackDocumentState) },
      { label: "최근 멤버 알림", value: notificationLabel(status.evidence.latestNotificationEvent) },
    ],
  };
}
```

- [ ] **Step 7: Run model tests and verify they pass**

Run:

```bash
pnpm --dir front test features/host/model/session-closing-model.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add front/features/host/model/session-closing-model.ts front/features/host/model/session-closing-model.test.ts
git commit -m "feat(front): enrich host closing board model"
```

---

### Task 2: Productize The Closing Board UI

**Files:**
- Modify: `front/features/host/ui/session-closing-board.tsx`
- Modify: `front/features/host/ui/session-closing-board.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: enriched `SessionClosingBoardView` from Task 1.
- Produces: Korean-first host closing board UI with primary action reason, checklist state labels, surface action labels, missing-link copy, and evidence ledger.

- [ ] **Step 1: Update the UI test fixture to the enriched view model**

In `front/features/host/ui/session-closing-board.test.tsx`, update `view` so it includes Task 1 fields:

```ts
const view: SessionClosingBoardView = {
  title: "No.07 · E2E Book",
  subtitle: "2026-06-18 · Public",
  statusLabel: "Ready",
  statusTone: "accent",
  primaryAction: {
    label: "멤버 알림 확인",
    reason: "멤버가 지난 모임 회고로 돌아갈 알림 흐름이 아직 완성되지 않았습니다.",
    tone: "warn",
    href: "/app/host/notifications",
  },
  checklist: [
    {
      id: "SESSION_CLOSED",
      label: "세션 종료",
      detail: "닫힘",
      state: "DONE",
      stateLabel: "완료",
      tone: "ok",
      href: "/app/host/sessions/s1/edit",
      actionLabel: "확인하기",
    },
    {
      id: "MEMBER_NOTIFICATION_SENT",
      label: "멤버 알림",
      detail: "대기",
      state: "ACTION_REQUIRED",
      stateLabel: "조치 필요",
      tone: "warn",
      href: "/app/host/notifications",
      actionLabel: "확인하기",
    },
  ],
  surfaces: [
    {
      id: "HOST",
      title: "호스트 문서",
      detail: "호스트가 기록 패키지와 마감 상태를 관리할 수 있습니다.",
      tone: "accent",
      href: "/app/host/sessions/s1/edit",
      actionLabel: "호스트 문서 확인",
    },
    {
      id: "MEMBER",
      title: "멤버 회고",
      detail: "멤버가 지난 모임 기록과 피드백으로 돌아갈 수 있습니다.",
      tone: "ok",
      href: "/clubs/club-a/app/sessions/s1",
      actionLabel: "멤버 회고 확인",
    },
    {
      id: "PUBLIC",
      title: "공개 기록",
      detail: "공개 기록 표면에서 발행 상태를 확인할 수 있습니다.",
      tone: "ok",
      href: "/clubs/club-a/sessions/s1",
      actionLabel: "공개 기록 확인",
    },
  ],
  evidence: [
    { label: "공개 요약", value: "저장됨" },
    { label: "하이라이트", value: "2" },
    { label: "한줄평", value: "1" },
    { label: "피드백 문서", value: "열람 가능" },
    { label: "최근 멤버 알림", value: "없음" },
  ],
};
```

- [ ] **Step 2: Add failing UI assertions**

Update the first UI test body to assert the operating copy:

```ts
expect(screen.getByText("이번 회차 다음 조치")).toBeVisible();
expect(screen.getByText("멤버가 지난 모임 회고로 돌아갈 알림 흐름이 아직 완성되지 않았습니다.")).toBeVisible();
expect(screen.getByText("마감 단계")).toBeVisible();
expect(screen.getByText("조치 필요")).toBeVisible();
expect(screen.getByRole("link", { name: "호스트 문서 확인" })).toHaveAttribute("href", "/app/host/sessions/s1/edit");
expect(screen.getByRole("link", { name: "멤버 회고 확인" })).toHaveAttribute("href", "/clubs/club-a/app/sessions/s1");
expect(screen.getByRole("link", { name: "공개 기록 확인" })).toHaveAttribute("href", "/clubs/club-a/sessions/s1");
expect(screen.getByText("최근 멤버 알림")).toBeVisible();
```

Add a second positive test for missing-link copy:

```ts
it("shows honest surface copy when member and public links are missing", () => {
  render(
    <SessionClosingBoard
      view={{
        ...view,
        surfaces: view.surfaces.map((surface) =>
          surface.id === "HOST"
            ? surface
            : {
                ...surface,
                href: null,
                detail:
                  surface.id === "MEMBER"
                    ? "멤버 회고 진입은 아직 확인되지 않았습니다."
                    : "공개 표면에는 아직 발행되지 않았습니다.",
              },
        ),
      }}
    />,
  );

  expect(screen.getByText("멤버 회고 진입은 아직 확인되지 않았습니다.")).toBeVisible();
  expect(screen.getByText("공개 표면에는 아직 발행되지 않았습니다.")).toBeVisible();
  expect(screen.queryByRole("link", { name: "멤버 회고 확인" })).toBeNull();
  expect(screen.queryByRole("link", { name: "공개 기록 확인" })).toBeNull();
});
```

- [ ] **Step 3: Run UI tests and verify they fail**

Run:

```bash
pnpm --dir front test features/host/ui/session-closing-board.test.tsx
```

Expected: FAIL because the UI still renders `Next action`, `Checklist`, `Host`, `Member`, `Public`, `Review`, and `Open` instead of the enriched Korean operating board.

- [ ] **Step 4: Replace the primary action section**

In `front/features/host/ui/session-closing-board.tsx`, replace the primary action section with:

```tsx
<section className="rm-reading-desk rm-host-closing-board__primary" aria-label="이번 회차 다음 조치">
  <div className="rm-host-closing-board__primary-copy">
    <div className="eyebrow">이번 회차 다음 조치</div>
    <p className="h3 editorial">{view.primaryAction.label}</p>
    <p className="body muted">{view.primaryAction.reason}</p>
  </div>
  <span className={badgeClass(view.primaryAction.tone)}>{view.primaryAction.label}</span>
  {view.primaryAction.href ? (
    <a className="btn btn-primary" href={view.primaryAction.href}>
      {view.primaryAction.label}
    </a>
  ) : null}
</section>
```

- [ ] **Step 5: Replace checklist rendering**

In the checklist section, change the heading and row action rendering:

```tsx
<section className="surface rm-host-closing-board__section" aria-label="마감 단계">
  <div className="eyebrow">마감 단계</div>
  <div className="rm-host-closing-board__checklist">
    {view.checklist.map((item) => (
      <article key={item.id} className="surface-quiet rm-host-closing-board__checklist-item">
        <div className="row-between rm-host-closing-board__checklist-row">
          <strong>{item.label}</strong>
          <span className={badgeClass(item.tone)}>{item.stateLabel}</span>
        </div>
        <p className="small muted">{item.detail}</p>
        {item.href ? (
          <a className="tiny mono" href={item.href}>
            {item.actionLabel}
          </a>
        ) : (
          <span className="tiny muted">{item.actionLabel}</span>
        )}
      </article>
    ))}
  </div>
</section>
```

- [ ] **Step 6: Replace surface status rendering**

In the surface section, change the heading and link labels:

```tsx
<section className="surface rm-host-closing-board__section" aria-label="호스트 멤버 공개 표면 상태">
  <div className="eyebrow">호스트 문서 / 멤버 회고 / 공개 기록</div>
  <div className="rm-host-closing-board__surfaces">
    {view.surfaces.map((surface) => (
      <article key={surface.id} className="surface-quiet rm-host-closing-board__surface">
        <div className="row-between rm-host-closing-board__surface-row">
          <h2 className="h3 editorial">{surface.title}</h2>
          <span className={badgeClass(surface.tone)}>{surface.title}</span>
        </div>
        <p className="body muted">{surface.detail}</p>
        {surface.href ? (
          <a className="btn btn-quiet btn-sm" href={surface.href}>
            {surface.actionLabel}
          </a>
        ) : null}
      </article>
    ))}
  </div>
</section>
```

- [ ] **Step 7: Replace evidence heading**

Change the evidence section label from `Evidence ledger` to Korean:

```tsx
<section className="surface rm-host-closing-board__section" aria-label="마감 증거">
  <div className="eyebrow">마감 증거</div>
  <dl className="rm-host-closing-board__evidence">
    {view.evidence.map((item) => (
      <div key={item.label}>
        <dt className="tiny muted">{item.label}</dt>
        <dd className="body">{item.value}</dd>
      </div>
    ))}
  </dl>
</section>
```

- [ ] **Step 8: Remove unused local checklist helper**

Delete the local `checklistStateLabel()` function from `front/features/host/ui/session-closing-board.tsx`; state labels now come from the model.

- [ ] **Step 9: Add resilient layout styles**

In `front/src/styles/globals.css`, add or update these scoped rules near existing `.rm-host-closing-board` rules:

```css
.rm-host-closing-board__primary {
  align-items: flex-start;
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.rm-host-closing-board__primary-copy {
  min-width: 0;
}

.rm-host-closing-board__primary-copy .body {
  margin: 8px 0 0;
  max-width: 720px;
}

.rm-host-closing-board__checklist-row,
.rm-host-closing-board__surface-row {
  align-items: flex-start;
  gap: 12px;
}

.rm-host-closing-board__checklist-item,
.rm-host-closing-board__surface {
  min-width: 0;
}

.rm-host-closing-board__checklist-item strong,
.rm-host-closing-board__surface h2,
.rm-host-closing-board__surface p,
.rm-host-closing-board__evidence dd {
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .rm-host-closing-board__primary {
    grid-template-columns: minmax(0, 1fr);
  }

  .rm-host-closing-board__primary .btn {
    width: 100%;
  }
}
```

- [ ] **Step 10: Run UI tests and verify they pass**

Run:

```bash
pnpm --dir front test features/host/ui/session-closing-board.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Run focused model and UI tests together**

Run:

```bash
pnpm --dir front test features/host/model/session-closing-model.test.ts features/host/ui/session-closing-board.test.tsx
```

Expected: PASS.

- [ ] **Step 12: Commit Task 2**

```bash
git add front/features/host/ui/session-closing-board.tsx front/features/host/ui/session-closing-board.test.tsx front/src/styles/globals.css
git commit -m "feat(front): productize host closing board"
```

---

### Task 3: Update Flow Evidence, Release Note, And Verification

**Files:**
- Modify: `front/tests/e2e/session-closing-flywheel.spec.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: UI copy and links from Task 2.
- Produces: E2E evidence that the board exposes Korean operating copy and host/member/public links without private sentinels.
- Produces: Unreleased changelog entry for host UX only.

- [ ] **Step 1: Update the E2E host closing assertions**

In `front/tests/e2e/session-closing-flywheel.spec.ts`, replace the host board assertions:

```ts
await expect(page.getByRole("heading", { name: "No.07 · E2E 책" })).toBeVisible();
await expect(page.getByText("발행 완료")).toBeVisible();
await expect(page.getByText("이번 회차 다음 조치")).toBeVisible();
await expect(page.getByText("공개 기록 확인")).toBeVisible();
await expect(page.getByText("공개 표면에 발행된 기록이 의도대로 보이는지 최종 확인합니다.")).toBeVisible();
await expect(page.getByText("마감 단계")).toBeVisible();
await expect(page.getByText("호스트 문서 / 멤버 회고 / 공개 기록")).toBeVisible();
await expect(page.getByRole("heading", { name: "호스트 문서" })).toBeVisible();
await expect(page.getByRole("heading", { name: "멤버 회고" })).toBeVisible();
await expect(page.getByRole("heading", { name: "공개 기록" })).toBeVisible();
await expect(page.getByRole("link", { name: "호스트 문서 확인" })).toHaveAttribute("href", `/app/host/sessions/${SESSION_ID}/edit`);
await expect(page.getByRole("link", { name: "멤버 회고 확인" })).toHaveAttribute("href", `/clubs/${CLUB_SLUG}/app/sessions/${SESSION_ID}`);
await expect(page.getByRole("link", { name: "공개 기록 확인" })).toHaveAttribute("href", `/clubs/${CLUB_SLUG}/sessions/${SESSION_ID}`);
await expect(page.getByText("마감 증거")).toBeVisible();
await expect(page.getByText("최근 멤버 알림")).toBeVisible();
await expect(page.getByText("member1@example.com")).toHaveCount(0);
await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
```

- [ ] **Step 2: Run targeted E2E and verify the updated flow passes**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts
```

Expected: PASS. The test output should include a screenshot artifact under Playwright output via `testInfo.outputPath("session-closing-board.png")`; do not stage generated screenshot files.

- [ ] **Step 3: Confirm generated screenshot artifacts are not tracked**

Run:

```bash
git status --short | rg "\\.(png|jpg|jpeg)|test-results|playwright-report|__screenshots__" || true
```

Expected: no output for generated artifacts. Existing committed CT baselines under `front/__screenshots__/` should not appear unless they were intentionally changed, which this plan does not require.

- [ ] **Step 4: Add the changelog entry**

In `CHANGELOG.md`, under `## Unreleased` `### Changed`, add this bullet:

```md
- **host closing board:** The host session closing board now reads as a Korean operating board with a clear next action, reason, closing checklist states, host/member/public surface status, and safe evidence ledger. This is a frontend host UX change only; server API contract, DB migrations, auth/BFF tokens, OAuth scopes, notification event types, and deploy workflow behavior are unchanged.
```

- [ ] **Step 5: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all three commands PASS.

- [ ] **Step 6: Run docs/code whitespace check for changed files**

Run:

```bash
git diff --check -- CHANGELOG.md front/features/host/model/session-closing-model.ts front/features/host/model/session-closing-model.test.ts front/features/host/ui/session-closing-board.tsx front/features/host/ui/session-closing-board.test.tsx front/src/styles/globals.css front/tests/e2e/session-closing-flywheel.spec.ts
```

Expected: no output.

- [ ] **Step 7: Run public-safety sentinel scan over changed frontend and changelog files**

Run:

```bash
rg -n "(^|[^A-Za-z0-9_])(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_[A-Za-z0-9_]+|AKIA[0-9A-Z]{16}|ocid1\\.|BEGIN (RSA|OPENSSH|PRIVATE) KEY|/[U]sers/|/[Hh]ome/[^[:space:]]+)" CHANGELOG.md front/features/host/model/session-closing-model.ts front/features/host/model/session-closing-model.test.ts front/features/host/ui/session-closing-board.tsx front/features/host/ui/session-closing-board.test.tsx front/src/styles/globals.css front/tests/e2e/session-closing-flywheel.spec.ts
```

Expected: no output.

- [ ] **Step 8: Commit Task 3**

```bash
git add CHANGELOG.md front/tests/e2e/session-closing-flywheel.spec.ts
git commit -m "test(front): cover host closing board flywheel"
```

If Step 5 or Step 6 caused small fixes in files committed by Tasks 1 or 2, include those fix files in this commit only after verifying the diff is scoped to the host closing board.

---

## Self-Review

- Spec coverage: Task 1 covers primary action, checklist, surface, evidence, fallback, and safety model requirements. Task 2 covers UI hierarchy, Korean copy, responsive wrapping styles, and prop-only rendering. Task 3 covers targeted E2E evidence, changelog, validation, and public-safety scans.
- Placeholder scan: no unfinished placeholder markers remain.
- Type consistency: `SessionClosingBoardView.primaryAction.reason`, checklist `stateLabel`/`actionLabel`, and surface `actionLabel` are introduced in Task 1 before UI and E2E tasks consume them.
- Scope check: the plan stays frontend-only and does not add server code, DB migration, API contract, auth/BFF, notification policy, or deploy workflow changes.
