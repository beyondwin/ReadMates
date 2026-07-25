# ReadMates Host Notifications Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the host notifications route as a compact, accessible sending workbench that matches the host priority ledger while preserving confirm-only notification delivery.

**Architecture:** Keep the existing route/query/API ownership and options → preview → confirm pipeline. Add focused prop-driven UI units for the operations rail and collapsible operations detail, reshape the existing manual workbench, and reuse the accessible composer dialog as a responsive preview side sheet. No server, BFF, database, scheduler, or notification contract changes are allowed.

**Tech Stack:** React, TypeScript, React Router 7, TanStack Query v5, Vitest, Testing Library, Playwright, Vite, existing ReadMates CSS/design tokens

## Global Constraints

- The approved design source is `docs/superpowers/specs/2026-07-25-readmates-host-notifications-workbench-redesign-design.md` at commit `eb9230d8`.
- The touched product surface is `/clubs/:clubSlug/app/host/notifications`.
- Keep the existing manual options → preview → confirm API and the existing policy API unchanged.
- Only explicit final confirm may create a dispatch, event, outbox row, member notification, or email.
- Opening or closing preview, backdrop dismissal, browser navigation, and `Escape` must not call confirm.
- Preserve club-scoped reminder policy, default OFF behavior, and the existing server-confirmed save semantics.
- Do not display `opt-in`, `Asia/Seoul`, scheduler, Kafka, or outbox implementation terminology in the primary host workflow.
- Do not add a route, package, server endpoint, BFF behavior, migration, notification type, recipient type, or channel.
- Reuse existing warm paper surfaces, ink hierarchy, line tokens, badges, focus styles, and reduced-motion behavior.
- At 390px, the page must have no horizontal overflow and every primary mobile action must be at least 44px high.
- New unit tests under `front/features`, `front/src`, or `front/shared` must be co-located with their source.
- Preserve unrelated local changes and existing listeners. If local browser verification needs a server, reuse a confirmed ReadMates listener or start an isolated alternate port without stopping another process.

---

## File Structure

### Create

- `front/features/host/ui/notifications/host-notification-operations-rail.tsx`
  - Renders the club reminder switch, four operational metrics, and the conditional process action.
- `front/features/host/ui/notifications/host-notification-operations-rail.test.tsx`
  - Covers server-confirmed policy behavior, metric semantics, errors, and process-action visibility.
- `front/features/host/ui/notifications/manual-notification-workbench.test.tsx`
  - Covers the three-step workbench structure, disabled template reasons, and external preview presentation.
- `front/features/host/ui/notifications/notification-operations-disclosure.tsx`
  - Owns disclosure open state, abnormal-state reopening, active ledger tab, full manual history, and operations tools.
- `front/features/host/ui/notifications/notification-operations-disclosure.test.tsx`
  - Covers normal/abnormal disclosure state, user collapse persistence, new-issue reopening, and initial tab selection.
- `front/features/host/ui/notifications/notification-test-mail-tool.tsx`
  - Renders the test-mail form and masked audit history from props.
- `front/features/host/ui/notifications/manual-notification-dispatch-ledger.test.tsx`
  - Covers the compact three-row recent history and full-history variants.

### Modify

- `front/features/host/ui/host-notifications-page.tsx`
  - Becomes the page composer for the rail, workbench, recent history, disclosure, preview state, and route callbacks.
- `front/features/host/ui/notifications/manual-notification-workbench.tsx`
  - Renders the three explicit decision blocks and hosts the external preview side sheet.
- `front/features/host/ui/notifications/host-notification-composer.tsx`
  - Adds a workbench presentation while preserving the dialog presentation used by dashboard/session-editor flows.
- `front/features/host/ui/notifications/host-notification-composer-dialog.tsx`
  - Adds an opt-in side-sheet variant and configurable accessible title/description.
- `front/features/host/ui/notifications/host-notification-composer-dialog.test.tsx`
  - Covers the new variant without weakening the existing focus trap and busy-state behavior.
- `front/features/host/ui/notifications/host-notification-composer.test.tsx`
  - Covers selected-recipient count and the confirm label.
- `front/features/host/ui/notifications/manual-notification-preview.tsx`
  - Owns resend-confirmation state and renders a recipient-count final action.
- `front/features/host/ui/notifications/manual-notification-dispatch-ledger.tsx`
  - Supports compact limited and full paginated presentations.
- `front/features/host/ui/notifications/notification-ledger-tabs.tsx`
  - Remains the event/delivery ledger and receives its selected tab from the disclosure.
- `front/src/styles/globals.css`
  - Adds page, rail, workbench, ledger-row, disclosure, and responsive styles.
- `front/shared/styles/mobile.css`
  - Adds the side-sheet variant beside the existing composer dialog styles.
- `front/tests/unit/host-notifications.test.tsx`
  - Updates page/route assertions for the new composition and no-action normal state.
- `front/tests/e2e/manual-notifications.spec.ts`
  - Updates selectors and adds no-send dismissal coverage.
- `CHANGELOG.md`
  - Records the host notification workbench redesign under `Unreleased`.

### Delete after replacement is integrated

- `front/features/host/ui/notifications/host-notification-policy-card.tsx`
- `front/features/host/ui/notifications/host-notification-policy-card.test.tsx`
- `front/features/host/ui/notifications/host-notifications-summary.tsx`

## Task Dependencies

```text
Task 1 operations rail
Task 2 workbench structure
Task 3 preview side sheet
Task 4 operations disclosure and ledgers
         ↓
Task 5 page assembly and responsive styling
         ↓
Task 6 E2E, browser proof, changelog, final gates
```

Tasks 1–4 produce focused UI units and tests. Execute them in order because Tasks 3 and 4 reuse interfaces established earlier. Task 5 is the integration gate. Task 6 must run only after Task 5 is green.

## Acceptance Matrix Selection

- Select `UI or runtime state`: the change affects loading, empty, stale, error, wrapping, desktop, and mobile presentation. Evidence is focused component/route tests plus desktop/mobile browser inspection.
- Select `Cursor collection` narrowly for manual dispatch and selected-member continuation. Existing query/model accumulation tests remain and the full-history disclosure must preserve `hasMore` behavior.
- Select `Async, cache, or provider` only for existing UI retry/dead/confirm representations. No server retry policy changes; existing focused UI and E2E assertions are sufficient.
- Exclude `Actor or authorization`, `Club context`, `Session lifecycle`, `Publication visibility`, `BFF or OAuth`, and `Persistence or migration` because their contracts are not modified. Existing route and E2E coverage must remain green; any required change in those surfaces is a scope violation and must stop implementation.

---

### Task 1: Build the Unified Notification Operations Rail

**Files:**

- Create: `front/features/host/ui/notifications/host-notification-operations-rail.tsx`
- Create: `front/features/host/ui/notifications/host-notification-operations-rail.test.tsx`

**Interfaces:**

- Consumes:

```ts
export type HostNotificationOperationsRailProps = {
  summary: HostNotificationSummary;
  policy?: HostNotificationPolicyResponse;
  processableCount: number;
  hasProcessableNotifications: boolean;
  processPending: boolean;
  isRefreshing: boolean;
  policyPending: boolean;
  policyError: string | null;
  policyLoadError: string | null;
  policyLoading: boolean;
  onProcess: () => void;
  onPolicyChange: (enabled: boolean) => Promise<unknown>;
  onPolicyRetry: () => Promise<unknown>;
};
```

- Produces:
  - `HostNotificationOperationsRail`
  - A single `section[aria-label="알림 운영 상태"]`
  - `input[type="checkbox"][aria-label="모임 전날 자동 리마인더"]`
  - A process button only when `hasProcessableNotifications` is true

- [ ] **Step 1: Write the failing rail tests**

Create the co-located test with concrete normal, abnormal, pending, and error cases:

```tsx
const defaultProps: HostNotificationOperationsRailProps = {
  summary: { pending: 2, failed: 1, dead: 0, sentLast24h: 4 },
  policy: { sessionReminderEnabled: false, updatedAt: null },
  processableCount: 3,
  hasProcessableNotifications: true,
  processPending: false,
  isRefreshing: false,
  policyPending: false,
  policyError: null,
  policyLoadError: null,
  policyLoading: false,
  onProcess: vi.fn(),
  onPolicyChange: vi.fn().mockResolvedValue(undefined),
  onPolicyRetry: vi.fn().mockResolvedValue(undefined),
};

function renderRail(
  overrides: Partial<HostNotificationOperationsRailProps> = {},
) {
  return render(
    <HostNotificationOperationsRail {...defaultProps} {...overrides} />,
  );
}

it("renders policy and four metrics as one operations rail", () => {
  renderRail();

  const rail = screen.getByRole("region", { name: "알림 운영 상태" });
  expect(within(rail).getByText("자동 리마인더")).toBeInTheDocument();
  expect(within(rail).getByText("모임 전날 · 기본 꺼짐")).toBeInTheDocument();
  expect(within(rail).getByText("대기")).toBeInTheDocument();
  expect(within(rail).getByText("실패")).toBeInTheDocument();
  expect(within(rail).getByText("중단")).toBeInTheDocument();
  expect(within(rail).getByText("최근 24시간")).toBeInTheDocument();
  expect(within(rail).queryByText(/opt-in|Asia\\/Seoul/i)).not.toBeInTheDocument();
});

it("hides the process action when no notification can be processed", () => {
  renderRail({
    summary: { pending: 0, failed: 0, dead: 0, sentLast24h: 0 },
    processableCount: 0,
    hasProcessableNotifications: false,
  });

  expect(screen.queryByRole("button", { name: /처리/ })).not.toBeInTheDocument();
});

it("keeps the server-confirmed policy value when saving fails", async () => {
  const user = userEvent.setup();
  renderRail({ onPolicyChange: vi.fn().mockRejectedValue(new Error("save failed")) });

  const reminder = screen.getByRole("checkbox", { name: "모임 전날 자동 리마인더" });
  await user.click(reminder);

  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
  expect(reminder).not.toBeChecked();
});
```

- [ ] **Step 2: Run the rail test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/notifications/host-notification-operations-rail.test.tsx
```

Expected: FAIL because `./host-notification-operations-rail` does not exist.

- [ ] **Step 3: Implement the rail**

Use local save state without optimistic checked-state changes:

```tsx
const metrics = [
  { label: "대기", value: Math.max(0, summary.pending), tone: summary.pending > 0 ? "attention" : "quiet" },
  { label: "실패", value: Math.max(0, summary.failed), tone: summary.failed > 0 ? "warning" : "quiet" },
  { label: "중단", value: Math.max(0, summary.dead), tone: summary.dead > 0 ? "warning" : "quiet" },
  { label: "최근 24시간", value: Math.max(0, summary.sentLast24h), tone: "positive" },
] as const;

const handlePolicyChange = async (enabled: boolean) => {
  if (!policy || policyPending || policyLoading || submitting) return;
  setSubmitting(true);
  setLocalError(null);
  try {
    await onPolicyChange(enabled);
  } catch {
    setLocalError("리마인더 정책을 저장하지 못했습니다. 다시 시도해 주세요.");
  } finally {
    setSubmitting(false);
  }
};
```

Render the policy as the first wide cell, map the four metric cells, and render the process action only under this condition:

```tsx
{hasProcessableNotifications ? (
  <button
    type="button"
    className="btn btn-primary btn-sm rm-host-notifications-rail__process"
    disabled={processPending || isRefreshing}
    onClick={onProcess}
  >
    {processPending
      ? "처리 중"
      : isRefreshing
        ? "새로고침 중"
        : processableCount > 0
          ? `${processableCount}건 처리`
          : "대기·실패 처리"}
  </button>
) : null}
```

Keep `checked={policy?.sessionReminderEnabled ?? false}` so only new props confirm the saved state.

- [ ] **Step 4: Run the rail test and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/notifications/host-notification-operations-rail.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add front/features/host/ui/notifications/host-notification-operations-rail.tsx \
  front/features/host/ui/notifications/host-notification-operations-rail.test.tsx
git diff --cached --check
git commit -m "feat(front): add notification operations rail"
```

---

### Task 2: Restructure the Manual Sending Workbench

**Files:**

- Create: `front/features/host/ui/notifications/manual-notification-workbench.test.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- Modify: `front/features/host/ui/notifications/host-notification-composer.tsx`
- Modify: `front/features/host/ui/notifications/host-notification-composer.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**

- Consumes the existing `ManualNotificationWorkbenchProps` callbacks and `HostNotificationComposerDraft`.
- Extends `HostNotificationComposerProps` with:

```ts
presentation?: "dialog" | "workbench";
```

- Produces:
  - Visible `01 · 대상 회차`, `02 · 알림 종류`, `03 · 대상과 채널` labels
  - Visible disabled-template reason text connected with `aria-describedby`
  - `미리보기 열기` as the workbench primary action
  - `직접 선택 · N명` when direct selection is active
- The default composer presentation remains `"dialog"` for `HostNotificationComposerController`.

- [ ] **Step 1: Write the failing workbench tests**

Create a minimal options/session fixture and assert the approved structure:

```tsx
const contentRevision = "a".repeat(64);
const options: ManualNotificationOptionsResponse = {
  session: {
    sessionId: "session-9",
    sessionNumber: 9,
    bookTitle: "Example Book",
    date: "2026-07-15",
    state: "OPEN",
    visibility: "MEMBER",
    feedbackDocumentUploaded: false,
  },
  templates: [
    {
      eventType: "SESSION_REMINDER_DUE",
      contentRevision,
      label: "모임 전날 리마인더",
      enabled: true,
      disabledReason: null,
      defaultAudience: "ALL_ACTIVE_MEMBERS",
      allowedAudiences: ["ALL_ACTIVE_MEMBERS", "SESSION_PARTICIPANTS"],
      defaultChannels: "BOTH",
    },
    {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      contentRevision,
      label: "피드백 문서 등록",
      enabled: false,
      disabledReason: "피드백 문서가 등록된 뒤 발송할 수 있습니다.",
      defaultAudience: "CONFIRMED_ATTENDEES",
      allowedAudiences: ["CONFIRMED_ATTENDEES"],
      defaultChannels: "BOTH",
    },
  ],
  members: { items: [], nextCursor: null },
  recentDispatches: [],
};

const sessions: HostSessionListItem[] = [{
  sessionId: "session-9",
  sessionNumber: 9,
  title: "9회차 모임",
  bookTitle: "Example Book",
  bookAuthor: "Example Author",
  bookImageUrl: null,
  date: "2026-07-15",
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  state: "OPEN",
  visibility: "MEMBER",
}];

type WorkbenchProps = ComponentProps<typeof ManualNotificationWorkbench>;

function renderWorkbench(overrides: Partial<WorkbenchProps> = {}) {
  const props: WorkbenchProps = {
    options,
    hostSessions: sessions,
    initialSessionId: "session-9",
    initialEventType: "SESSION_REMINDER_DUE",
    preview: null,
    busy: false,
    error: null,
    onPreview: vi.fn().mockResolvedValue(undefined),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return render(<ManualNotificationWorkbench {...props} />);
}

it("renders the three sending decisions in order", () => {
  renderWorkbench();

  const workbench = screen.getByRole("region", { name: "새 알림 발송" });
  const labels = within(workbench)
    .getAllByText(/0[123] ·/)
    .map((node) => node.textContent);

  expect(labels).toEqual([
    "01 · 대상 회차",
    "02 · 알림 종류",
    "03 · 대상과 채널",
  ]);
  expect(within(workbench).getByRole("button", { name: "미리보기 열기" })).toBeEnabled();
  expect(within(workbench).queryByRole("heading", { name: "멤버에게 알림을 보낼까요?" })).not.toBeInTheDocument();
});

it("shows why an unavailable template cannot be selected", () => {
  renderWorkbench();

  const unavailable = screen.getByRole("button", { name: "피드백 문서 등록" });
  const reason = screen.getByText("피드백 문서가 등록된 뒤 발송할 수 있습니다.");
  expect(unavailable).toBeDisabled();
  expect(unavailable).toHaveAttribute("aria-describedby", reason.id);
});
```

Extend `host-notification-composer.test.tsx`:

```tsx
// Extend renderComposer's input with:
presentation?: "dialog" | "workbench";

// Pass the value into the rendered component:
<HostNotificationComposer
  presentation={presentation}
  options={options}
  eventType={currentDraft.eventType}
  draft={currentDraft}
  preview={preview}
  busy={false}
  error={null}
  onDraftChange={onDraftChange}
  onSearch={vi.fn()}
  onLoadMore={vi.fn()}
  onPreview={vi.fn()}
  onConfirm={onConfirm}
  onSkip={vi.fn()}
  showSkip
/>

it("shows the selected member count in workbench presentation", () => {
  renderComposer({
    currentDraft: {
      ...draft,
      recipientMode: "SELECTED_MEMBERS",
      selectedMembershipIds: ["membership-1"],
    },
    presentation: "workbench",
  });

  expect(screen.getByText("직접 선택 · 1명")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the workbench tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/manual-notification-workbench.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx
```

Expected: FAIL because the three decision labels, `presentation`, visible reason, and selected count are absent.

- [ ] **Step 3: Add the workbench presentation to the composer**

Add the defaulted prop:

```tsx
export function HostNotificationComposer({
  presentation = "dialog",
  ...props
}: HostNotificationComposerProps) {
  const isWorkbench = presentation === "workbench";
```

Render the existing “발송 전 확인” heading only for the dialog presentation. For the workbench presentation, render this visible section label before the recipient and channel fieldsets:

```tsx
{isWorkbench ? (
  <div className="rm-notification-workbench__decision-heading">
    <span className="rm-notification-workbench__step">03</span>
    <div>
      <h3>대상과 채널</h3>
      <p>누구에게 어떤 방식으로 보낼지 선택합니다.</p>
    </div>
  </div>
) : (
  <header>
    <div className="eyebrow">발송 전 확인</div>
    <h2 id="host-notification-composer-title" className="h2 editorial">
      멤버에게 알림을 보낼까요?
    </h2>
    {options.session ? (
      <p className="small muted">
        {options.session.sessionNumber}회차 · {options.session.bookTitle}
        {template ? ` · ${template.label}` : ""}
      </p>
    ) : null}
  </header>
)}
```

When direct selection is active, add:

```tsx
{draft.recipientMode === "SELECTED_MEMBERS" ? (
  <span className="tiny muted">직접 선택 · {draft.selectedMembershipIds.length}명</span>
) : null}
```

- [ ] **Step 4: Reshape `ManualNotificationWorkbench`**

Keep the existing state/reset behavior and render:

```tsx
<section
  className="rm-notification-workbench"
  aria-labelledby="manual-notification-title"
>
  <header className="rm-notification-workbench__header">
    <span className="eyebrow">운영 · 수동 발송</span>
    <h2 id="manual-notification-title">새 알림 발송</h2>
  </header>

  <div className="rm-notification-workbench__primary-decisions">
    <section aria-labelledby="manual-notification-session-title">
      <h3 id="manual-notification-session-title">01 · 대상 회차</h3>
      <label htmlFor="manual-notification-session">세션 선택</label>
      <select
        id="manual-notification-session"
        value={draft.sessionId}
        disabled={busy || hostSessions.length === 0}
        onChange={handleSessionSelect}
      >
        {hostSessions.map((session) => (
          <option key={session.sessionId} value={session.sessionId}>
            {session.sessionNumber}회차 · {session.bookTitle} · {session.date}
          </option>
        ))}
      </select>
    </section>
    <section aria-labelledby="manual-notification-template-title">
      <h3 id="manual-notification-template-title">02 · 알림 종류</h3>
      {options.templates.map((template) => {
        const reasonId = `manual-notification-template-${template.eventType}-reason`;
        return (
          <div key={template.eventType}>
            <button
              type="button"
              aria-label={template.label}
              aria-describedby={template.disabledReason ? reasonId : undefined}
              disabled={busy || !template.enabled}
              onClick={() => selectTemplate(template.eventType)}
            >
              {template.label}
            </button>
            {template.disabledReason ? (
              <p id={reasonId}>{template.disabledReason}</p>
            ) : null}
          </div>
        );
      })}
    </section>
  </div>

  <HostNotificationComposer
    presentation="workbench"
    previewButtonLabel="미리보기 열기"
    options={options}
    eventType={draft.eventType}
    draft={draft}
    preview={preview}
    busy={busy}
    error={error ?? memberError}
    onDraftChange={changeDraft}
    onSearch={handleSearch}
    onLoadMore={handleLoadMore}
    onPreview={() => onPreview(buildOperationsSelection())}
    onConfirm={handleConfirm}
    onSkip={() => undefined}
    showSkip={false}
    recipientModes={currentTemplate?.allowedAudiences}
  />
</section>
```

Define the referenced callbacks without changing request payloads:

```tsx
const handleSessionSelect = (event: ChangeEvent<HTMLSelectElement>) => {
  const sessionId = event.currentTarget.value;
  changeDraft({ ...draft, sessionId, selectedMembershipIds: [] });
  setSearch("");
  void runMemberLoad(async () => {
    await onSessionChange?.(sessionId);
  });
};

const handleSearch = async (value: string) => {
  setSearch(value);
  await runMemberLoad(async () => {
    await onLoadManualOptions?.(
      draft.sessionId || undefined,
      value || undefined,
    );
  });
};

const handleLoadMore = async () => {
  await runMemberLoad(async () => {
    await onLoadMoreManualMembers?.(
      draft.sessionId || undefined,
      search || undefined,
      options.members.nextCursor ?? undefined,
    );
  });
};

const handleConfirm = (resendConfirmed: boolean) => preview
  ? onConfirm({
      ...buildOperationsSelection(),
      previewId: preview.previewId,
      resendConfirmed,
    })
  : Promise.resolve();
```

For each disabled template, generate a stable reason id:

```tsx
const reasonId = `manual-notification-template-${template.eventType}-reason`;

<button
  aria-describedby={template.disabledReason ? reasonId : undefined}
  aria-label={template.label}
  disabled={busy || !template.enabled}
>
  {template.label}
</button>
{template.disabledReason ? (
  <p id={reasonId} className="rm-notification-workbench__template-reason">
    {template.disabledReason}
  </p>
) : null}
```

- [ ] **Step 5: Add focused workbench CSS**

Add named classes to `front/src/styles/globals.css`:

```css
.rm-notification-workbench {
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  background: var(--bg);
  padding: 24px;
}

.rm-notification-workbench__primary-decisions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.rm-notification-workbench__step {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.rm-notification-workbench__template-reason {
  margin: 6px 0 0;
  color: var(--text-3);
  font-size: 0.75rem;
}

@media (max-width: 760px) {
  .rm-notification-workbench {
    padding: 20px 16px;
  }

  .rm-notification-workbench__primary-decisions {
    grid-template-columns: 1fr;
  }

  .rm-notification-workbench .btn-primary {
    min-height: 44px;
    width: 100%;
  }
}
```

- [ ] **Step 6: Run the workbench tests and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/manual-notification-workbench.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx \
  tests/unit/host-notifications.test.tsx
```

Expected: PASS. If legacy page assertions still expect `미리보기`, update them to the exact approved label `미리보기 열기`; do not loosen queries to generic regular expressions.

- [ ] **Step 7: Commit Task 2**

```bash
git add front/features/host/ui/notifications/manual-notification-workbench.test.tsx \
  front/features/host/ui/notifications/manual-notification-workbench.tsx \
  front/features/host/ui/notifications/host-notification-composer.tsx \
  front/features/host/ui/notifications/host-notification-composer.test.tsx \
  front/src/styles/globals.css \
  front/tests/unit/host-notifications.test.tsx
git diff --cached --check
git commit -m "feat(front): structure notification send workbench"
```

---

### Task 3: Move Manual Preview and Confirm into a Responsive Side Sheet

**Files:**

- Modify: `front/features/host/ui/notifications/host-notification-composer-dialog.tsx`
- Modify: `front/features/host/ui/notifications/host-notification-composer-dialog.test.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-preview.tsx`
- Modify: `front/features/host/ui/notifications/host-notification-composer.tsx`
- Modify: `front/features/host/ui/notifications/host-notification-composer.test.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.test.tsx`
- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/tests/unit/host-notifications.test.tsx`

**Interfaces:**

- Extend `HostNotificationComposerDialogProps`:

```ts
variant?: "centered" | "side-sheet";
title?: string;
description?: string;
```

- Export from `manual-notification-preview.tsx`:

```ts
export type ManualNotificationPreviewConfirmationProps = {
  preview: ManualNotificationPreviewResponse;
  busy: boolean;
  onConfirm: (resendConfirmed: boolean) => Promise<unknown> | void;
};

export function ManualNotificationPreviewConfirmation(
  props: ManualNotificationPreviewConfirmationProps,
): ReactElement;
```

- Extend `ManualNotificationWorkbenchProps`:

```ts
onPreviewDismiss: () => void;
```

- Produces:
  - A dialog named `발송 전 확인`
  - A final button named `${preview.audience.finalTargetCount}명에게 알림 발송`
  - No inline preview in workbench presentation

- [ ] **Step 1: Write failing side-sheet and dismissal tests**

Extend the dialog harness:

```tsx
<HostNotificationComposerDialog
  open={open}
  busy={busy}
  variant="side-sheet"
  title="발송 전 확인"
  description="최종 대상과 채널을 확인한 뒤 발송합니다."
  onClose={handleClose}
>
  <button type="button">확인 작업</button>
</HostNotificationComposerDialog>
```

Assert:

```tsx
expect(screen.getByRole("dialog", { name: "발송 전 확인" }))
  .toHaveClass("host-notification-composer-dialog--side-sheet");
```

Add a workbench test:

```tsx
const previewFixture: ManualNotificationPreviewResponse = {
  previewId: "preview-1",
  expiresAt: "2026-07-25T12:10:00+09:00",
  template: {
    eventType: "SESSION_REMINDER_DUE",
    label: "모임 전날 리마인더",
    subject: "모임 전날 리마인더",
    bodyPreview: "내일 모임 준비를 확인해 주세요.",
  },
  audience: {
    baseGroup: "ALL_ACTIVE_MEMBERS",
    baseCount: 3,
    excludedCount: 0,
    includedCount: 0,
    finalTargetCount: 3,
  },
  channels: {
    requested: "BOTH",
    inAppEligibleCount: 3,
    emailEligibleCount: 2,
    emailSkippedByPreferenceCount: 1,
    emailMissingCount: 0,
  },
  duplicates: {
    requiresResendConfirmation: false,
    recentDispatches: [],
  },
  warnings: [],
};

it("opens preview externally and Escape dismisses without confirming", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  const onPreviewDismiss = vi.fn();
  renderWorkbench({
    preview: previewFixture,
    onConfirm,
    onPreviewDismiss,
  });

  const dialog = screen.getByRole("dialog", { name: "발송 전 확인" });
  expect(within(dialog).getByRole("button", { name: "3명에게 알림 발송" }))
    .toBeInTheDocument();
  expect(screen.getAllByText("발송 전 확인")).toHaveLength(1);

  await user.keyboard("{Escape}");

  expect(onPreviewDismiss).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it("backdrop dismissal never confirms a preview", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  const onPreviewDismiss = vi.fn();
  renderWorkbench({
    preview: previewFixture,
    onConfirm,
    onPreviewDismiss,
  });

  await user.click(screen.getByTestId("host-notification-composer-backdrop"));

  expect(onPreviewDismiss).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the side-sheet tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/host-notification-composer-dialog.test.tsx \
  features/host/ui/notifications/manual-notification-workbench.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx
```

Expected: FAIL because dialog variants, external preview, and recipient-count confirmation do not exist.

- [ ] **Step 3: Add the dialog variant without changing the default**

Default the new props:

```tsx
export function HostNotificationComposerDialog({
  open,
  busy,
  variant = "centered",
  title = "알림 보내기",
  description = "대상과 채널을 확인한 뒤에만 알림이 발송됩니다.",
  children,
  onClose,
}: HostNotificationComposerDialogProps) {
```

Use variant classes:

```tsx
<div
  className={[
    "host-notification-composer-scrim",
    variant === "side-sheet" ? "host-notification-composer-scrim--side-sheet" : "",
  ].filter(Boolean).join(" ")}
>
  <section
    className={[
      "surface",
      "host-notification-composer-dialog",
      variant === "side-sheet" ? "host-notification-composer-dialog--side-sheet" : "",
    ].filter(Boolean).join(" ")}
  >
    <div className="sr-only">
      <h2 id="host-notification-composer-dialog-title">{title}</h2>
      <p id="host-notification-composer-dialog-description">{description}</p>
    </div>
    {children}
  </section>
</div>
```

Keep the existing focus trap, opener focus restoration, body scroll restoration, backdrop behavior, and busy-state `Escape` block unchanged.

- [ ] **Step 4: Move resend state into an exported preview confirmation**

Keep `ManualNotificationPreviewPanel` presentational and wrap it:

```tsx
export function ManualNotificationPreviewConfirmation({
  preview,
  busy,
  onConfirm,
}: ManualNotificationPreviewConfirmationProps) {
  const [resendConfirmed, setResendConfirmed] = useState(false);
  const requiresResend = preview.duplicates.requiresResendConfirmation;

  return (
    <ManualNotificationPreviewPanel
      preview={preview}
      resendConfirmed={resendConfirmed}
      disabled={busy || (requiresResend && !resendConfirmed)}
      busy={busy}
      confirmLabel={`${preview.audience.finalTargetCount}명에게 알림 발송`}
      onResendConfirmedChange={setResendConfirmed}
      onConfirm={() => void onConfirm(resendConfirmed)}
    />
  );
}
```

Add `confirmLabel: string` to `ManualNotificationPreviewPanel` and render it when not busy. Replace the private `ComposerPreview` in `HostNotificationComposer` with `ManualNotificationPreviewConfirmation`.

- [ ] **Step 5: Render workbench preview in the side sheet**

In `ManualNotificationWorkbench`, keep passing the real `preview` to the workbench but prevent inline rendering when `presentation === "workbench"`:

```tsx
{preview && presentation === "dialog" ? (
  <ManualNotificationPreviewConfirmation
    key={preview.previewId}
    preview={preview}
    busy={busy}
    onConfirm={onConfirm}
  />
) : null}
```

After the workbench composer, render:

```tsx
<HostNotificationComposerDialog
  open={preview !== null}
  busy={busy}
  variant="side-sheet"
  title="발송 전 확인"
  description="최종 대상과 채널을 확인한 뒤 발송합니다."
  onClose={onPreviewDismiss}
>
  {preview ? (
    <ManualNotificationPreviewConfirmation
      key={preview.previewId}
      preview={preview}
      busy={busy}
      onConfirm={onConfirm}
    />
  ) : null}
</HostNotificationComposerDialog>
```

In `HostNotificationsPage`, pass:

```tsx
onPreviewDismiss={() => {
  setManualPreview(null);
  setManualError(null);
}}
```

- [ ] **Step 6: Add responsive side-sheet CSS**

In `front/shared/styles/mobile.css`, add:

```css
.host-notification-composer-scrim--side-sheet {
  align-items: stretch;
  justify-content: flex-end;
  padding: 16px;
}

.host-notification-composer-dialog--side-sheet {
  width: min(520px, 100%);
  height: calc(100dvh - 32px);
  max-height: none;
  overflow-y: auto;
  border-radius: var(--r-3);
}

@media (max-width: 640px) {
  .host-notification-composer-scrim--side-sheet {
    align-items: flex-end;
    padding: 0;
  }

  .host-notification-composer-dialog--side-sheet {
    width: 100%;
    height: auto;
    max-height: calc(100dvh - 16px);
    padding-bottom: max(20px, env(safe-area-inset-bottom));
    border-radius: var(--r-3) var(--r-3) 0 0;
  }

  .host-notification-composer-dialog--side-sheet .btn-primary {
    min-height: 44px;
    width: 100%;
  }
}
```

- [ ] **Step 7: Run focused preview tests and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/host-notification-composer-dialog.test.tsx \
  features/host/ui/notifications/manual-notification-workbench.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx \
  tests/unit/host-notifications.test.tsx
```

Expected: PASS, including focus restoration and no-confirm `Escape`.

- [ ] **Step 8: Commit Task 3**

```bash
git add front/features/host/ui/notifications/host-notification-composer-dialog.tsx \
  front/features/host/ui/notifications/host-notification-composer-dialog.test.tsx \
  front/features/host/ui/notifications/manual-notification-preview.tsx \
  front/features/host/ui/notifications/host-notification-composer.tsx \
  front/features/host/ui/notifications/host-notification-composer.test.tsx \
  front/features/host/ui/notifications/manual-notification-workbench.tsx \
  front/features/host/ui/notifications/manual-notification-workbench.test.tsx \
  front/features/host/ui/host-notifications-page.tsx \
  front/shared/styles/mobile.css \
  front/tests/unit/host-notifications.test.tsx
git diff --cached --check
git commit -m "feat(front): open notification preview in side sheet"
```

---

### Task 4: Build the Compact Recent Ledger and Conditional Operations Detail

**Files:**

- Create: `front/features/host/ui/notifications/notification-operations-disclosure.tsx`
- Create: `front/features/host/ui/notifications/notification-operations-disclosure.test.tsx`
- Create: `front/features/host/ui/notifications/notification-test-mail-tool.tsx`
- Create: `front/features/host/ui/notifications/manual-notification-dispatch-ledger.test.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-dispatch-ledger.tsx`
- Modify: `front/features/host/ui/notifications/notification-ledger-tabs.tsx`

**Interfaces:**

- Extend `ManualNotificationDispatchLedger`:

```ts
export type ManualNotificationDispatchLedgerProps = {
  dispatches: ManualNotificationDispatchListItem[];
  variant?: "recent" | "full";
  limit?: number;
  hasMore?: boolean;
  loading?: boolean;
  onLoadMore?: () => Promise<unknown>;
};
```

- Add:

```ts
export type NotificationTestMailToolProps = {
  value: string;
  audit: NotificationTestMailAuditItem[];
  disabled: boolean;
  pending: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onValueChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLoadMore?: () => Promise<unknown>;
};
```

- Add:

```ts
export type NotificationOperationsDisclosureProps = {
  summary: HostNotificationSummary;
  events: HostNotificationEventItem[];
  deliveries: HostNotificationDeliveryItem[];
  manualDispatches: ManualNotificationDispatchListItem[];
  audit: NotificationTestMailAuditItem[];
  retryPendingId: string | null;
  restorePendingId: string | null;
  disabled: boolean;
  hasMoreEvents: boolean;
  hasMoreDeliveries: boolean;
  hasMoreManualDispatches: boolean;
  hasMoreAudit: boolean;
  isLoadingMoreEvents: boolean;
  isLoadingMoreDeliveries: boolean;
  isLoadingMoreManualDispatches: boolean;
  isLoadingMoreAudit: boolean;
  testMailValue: string;
  testMailPending: boolean;
  onTestMailValueChange: (value: string) => void;
  onSubmitTestMail: (event: FormEvent<HTMLFormElement>) => void;
  onRetry: (item: HostNotificationDeliveryItem) => void;
  onRestore: (item: HostNotificationDeliveryItem) => void;
  onLoadMoreEvents?: () => Promise<unknown>;
  onLoadMoreDeliveries?: () => Promise<unknown>;
  onLoadMoreManualDispatches?: () => Promise<unknown>;
  onLoadMoreAudit?: () => Promise<unknown>;
};
```

- Produces:
  - `notificationIssueSignature(summary, events, deliveries): string`
  - A button with `aria-expanded`
  - Initial open state when summary or visible rows contain pending/failed/dead
  - Delivery tab selected first when an actionable delivery exists

- [ ] **Step 1: Write the failing recent-ledger tests**

```tsx
const dispatches: ManualNotificationDispatchListItem[] = Array.from(
  { length: 4 },
  (_, index) => ({
    manualDispatchId: `dispatch-${index + 1}`,
    eventId: `event-${index + 1}`,
    source: "MANUAL",
    eventType: "SESSION_REMINDER_DUE",
    sessionId: `session-${index + 1}`,
    sessionNumber: 10 - index,
    bookTitle: `Example Book ${index + 1}`,
    requestedChannels: "BOTH",
    audience: "ALL_ACTIVE_MEMBERS",
    resend: false,
    requestedBy: "h***@example.com",
    targetCount: 4,
    expectedInAppCount: 4,
    expectedEmailCount: 3,
    eventStatus: "PUBLISHED",
    createdAt: `2026-07-${String(25 - index).padStart(2, "0")}T10:00:00Z`,
  }),
);

it("shows only the newest three rows in recent mode", () => {
  render(
    <ManualNotificationDispatchLedger
      variant="recent"
      limit={3}
      dispatches={dispatches}
    />,
  );

  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "수동 발송 더 보기" })).not.toBeInTheDocument();
});

it("keeps pagination in full mode", () => {
  render(
    <ManualNotificationDispatchLedger
      variant="full"
      dispatches={dispatches.slice(0, 1)}
      hasMore
      onLoadMore={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "수동 발송 더 보기" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing disclosure tests**

```tsx
const failedDelivery: HostNotificationDeliveryItem = {
  id: "delivery-1",
  eventId: "event-1",
  channel: "EMAIL",
  status: "FAILED",
  recipientEmail: "m***@example.com",
  attemptCount: 2,
  updatedAt: "2026-07-25T10:00:00Z",
};

const disclosureDefaults: NotificationOperationsDisclosureProps = {
  summary: { pending: 0, failed: 0, dead: 0, sentLast24h: 4 },
  events: [],
  deliveries: [],
  manualDispatches: [],
  audit: [],
  retryPendingId: null,
  restorePendingId: null,
  disabled: false,
  hasMoreEvents: false,
  hasMoreDeliveries: false,
  hasMoreManualDispatches: false,
  hasMoreAudit: false,
  isLoadingMoreEvents: false,
  isLoadingMoreDeliveries: false,
  isLoadingMoreManualDispatches: false,
  isLoadingMoreAudit: false,
  testMailValue: "",
  testMailPending: false,
  onTestMailValueChange: vi.fn(),
  onSubmitTestMail: vi.fn(),
  onRetry: vi.fn(),
  onRestore: vi.fn(),
};

function renderDisclosure(
  overrides: Partial<NotificationOperationsDisclosureProps> = {},
) {
  let currentProps = { ...disclosureDefaults, ...overrides };
  const result = render(
    <NotificationOperationsDisclosure {...currentProps} />,
  );
  return {
    ...result,
    rerenderDisclosure(
      next: Partial<NotificationOperationsDisclosureProps>,
    ) {
      currentProps = { ...currentProps, ...next };
      result.rerender(
        <NotificationOperationsDisclosure {...currentProps} />,
      );
    },
  };
}

it("starts closed when operations are healthy", () => {
  renderDisclosure({
    summary: { pending: 0, failed: 0, dead: 0, sentLast24h: 4 },
    events: [],
    deliveries: [],
  });

  expect(screen.getByRole("button", { name: /운영 상세/ })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("tab", { name: "이벤트" })).not.toBeInTheDocument();
});

it("opens on issues, respects a user collapse, and reopens for a new issue", async () => {
  const user = userEvent.setup();
  const { rerenderDisclosure } = renderDisclosure({
    summary: { pending: 0, failed: 1, dead: 0, sentLast24h: 4 },
    deliveries: [{ ...failedDelivery, id: "delivery-1" }],
  });

  const toggle = screen.getByRole("button", { name: /운영 상세/ });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("tab", { name: "배송" })).toHaveAttribute("aria-selected", "true");

  await user.click(toggle);
  rerenderDisclosure({
    summary: { pending: 0, failed: 1, dead: 0, sentLast24h: 4 },
    deliveries: [{ ...failedDelivery, id: "delivery-1" }],
  });
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  rerenderDisclosure({
    summary: { pending: 0, failed: 2, dead: 0, sentLast24h: 4 },
    deliveries: [
      { ...failedDelivery, id: "delivery-1" },
      { ...failedDelivery, id: "delivery-2" },
    ],
  });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
});
```

- [ ] **Step 3: Run ledger/disclosure tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/manual-notification-dispatch-ledger.test.tsx \
  features/host/ui/notifications/notification-operations-disclosure.test.tsx
```

Expected: FAIL because the variants and disclosure do not exist.

- [ ] **Step 4: Implement the recent/full ledger variants**

Use stable source order and slice only the recent view:

```tsx
const visibleDispatches = variant === "recent"
  ? dispatches.slice(0, Math.max(0, limit ?? 3))
  : dispatches;
const showPagination = variant === "full" && hasMore && onLoadMore;
```

Use a semantic list or article rows with named classes:

```tsx
<article className="rm-notification-dispatch-row">
  <div className="rm-notification-dispatch-row__session">
    No.{dispatch.sessionNumber}
  </div>
  <div className="rm-notification-dispatch-row__title">
    <strong>{eventLabels[dispatch.eventType]}</strong>
    <span>{dispatch.bookTitle}</span>
  </div>
  <div className="rm-notification-dispatch-row__audience">
    {manualAudienceLabels[dispatch.audience]} · {dispatch.targetCount}명
  </div>
  <div className="rm-notification-dispatch-row__channel">
    {manualChannelLabels[dispatch.requestedChannels]}
  </div>
  <span className={eventOutboxStatusBadgeClass(dispatch.eventStatus)}>
    {dispatch.eventStatus}
  </span>
</article>
```

- [ ] **Step 5: Implement issue signature and disclosure state**

Export this pure helper:

```ts
export function notificationIssueSignature(
  summary: HostNotificationSummary,
  events: HostNotificationEventItem[],
  deliveries: HostNotificationDeliveryItem[],
) {
  const eventIssues = events
    .filter((item) => ["PENDING", "FAILED", "DEAD"].includes(item.status))
    .map((item) => `event:${item.id}:${item.status}`)
    .sort();
  const deliveryIssues = deliveries
    .filter((item) => ["PENDING", "FAILED", "DEAD"].includes(item.status))
    .map((item) => `delivery:${item.id}:${item.status}`)
    .sort();

  return [
    `summary:${Math.max(0, summary.pending)}:${Math.max(0, summary.failed)}:${Math.max(0, summary.dead)}`,
    ...eventIssues,
    ...deliveryIssues,
  ].join("|");
}
```

Treat a signature with all-zero summary and no item entries as healthy. Initialize disclosure state from `hasIssues`. Track the previous signature in a ref:

```tsx
const [open, setOpen] = useState(hasIssues);
const [activeTab, setActiveTab] = useState<NotificationLedgerTab>(
  hasActionableDelivery ? "deliveries" : "events",
);
const previousIssueSignature = useRef(issueSignature);

useEffect(() => {
  const isNewIssue = hasIssues && issueSignature !== previousIssueSignature.current;
  if (isNewIssue) {
    setOpen(true);
    setActiveTab(hasActionableDelivery ? "deliveries" : "events");
  }
  previousIssueSignature.current = issueSignature;
}, [hasActionableDelivery, hasIssues, issueSignature]);
```

Render the disclosure button with exact summary text:

```tsx
<button
  type="button"
  className="rm-notification-operations-disclosure__toggle"
  aria-expanded={open}
  aria-controls="notification-operations-detail"
  onClick={() => setOpen((value) => !value)}
>
  <span>운영 상세</span>
  <span>대기 {summary.pending} · 실패 {summary.failed} · 중단 {summary.dead}</span>
</button>
```

- [ ] **Step 6: Implement the test-mail tool and disclosure body**

Move the existing test-mail markup unchanged in behavior:

```tsx
export function NotificationTestMailTool({
  value,
  audit,
  disabled,
  pending,
  hasMore,
  loadingMore,
  onValueChange,
  onSubmit,
  onLoadMore,
}: NotificationTestMailToolProps) {
  return (
    <section aria-labelledby="test-mail-title" className="rm-notification-test-mail">
      <h3 id="test-mail-title">테스트 메일</h3>
      <form onSubmit={onSubmit}>
        <label htmlFor="notification-test-mail">테스트 메일 주소</label>
        <input
          id="notification-test-mail"
          type="email"
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          required
        />
        <button type="submit" disabled={disabled}>
          {pending ? "발송 중" : "테스트 발송"}
        </button>
      </form>
      {audit.length > 0 ? (
        <ul>
          {audit.map((row) => (
            <li key={row.id}>
              <span>{maskRecipient(row.recipientEmail)}</span>
              <span>{formatDateOnlyLabel(row.createdAt)}</span>
              <span>{row.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>테스트 발송 기록이 없습니다.</p>
      )}
      {hasMore && onLoadMore ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void onLoadMore()}
        >
          {loadingMore ? "불러오는 중" : "더 보기"}
        </button>
      ) : null}
    </section>
  );
}
```

Inside the open disclosure render, in this order:

1. Full `ManualNotificationDispatchLedger`
2. `NotificationLedgerTabs`
3. `NotificationTestMailTool`

Do not fetch from any new component.

- [ ] **Step 7: Run disclosure tests and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/manual-notification-dispatch-ledger.test.tsx \
  features/host/ui/notifications/notification-operations-disclosure.test.tsx \
  tests/unit/host-notifications.test.tsx
```

Expected: new component tests PASS. Existing page tests may still exercise the old composition; they remain green until Task 5 integration.

- [ ] **Step 8: Commit Task 4**

```bash
git add front/features/host/ui/notifications/notification-operations-disclosure.tsx \
  front/features/host/ui/notifications/notification-operations-disclosure.test.tsx \
  front/features/host/ui/notifications/notification-test-mail-tool.tsx \
  front/features/host/ui/notifications/manual-notification-dispatch-ledger.tsx \
  front/features/host/ui/notifications/manual-notification-dispatch-ledger.test.tsx \
  front/features/host/ui/notifications/notification-ledger-tabs.tsx
git diff --cached --check
git commit -m "feat(front): add collapsible notification operations detail"
```

---

### Task 5: Assemble the Page and Match the Host Priority Ledger

**Files:**

- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/unit/host-notifications.test.tsx`
- Delete: `front/features/host/ui/notifications/host-notification-policy-card.tsx`
- Delete: `front/features/host/ui/notifications/host-notification-policy-card.test.tsx`
- Delete: `front/features/host/ui/notifications/host-notifications-summary.tsx`

**Interfaces:**

- Consumes:
  - `HostNotificationOperationsRail` from Task 1
  - Workbench/side-sheet behavior from Tasks 2–3
  - Recent ledger and operations disclosure from Task 4
- Produces this DOM order:

```text
page header
notification operations rail
manual notification workbench
recent manual dispatch ledger
notification operations disclosure
restore dialog
```

- Keeps `HostNotificationsPageProps` route callbacks unchanged except the internal workbench dismissal callback added in Task 3.

- [ ] **Step 1: Replace old page assertions with failing approved-composition assertions**

Update the page tests:

```tsx
it("renders the sending workbench between the unified rail and recent history", () => {
  renderPage();

  const rail = screen.getByRole("region", { name: "알림 운영 상태" });
  const workbench = screen.getByRole("region", { name: "새 알림 발송" });
  const recent = screen.getByRole("region", { name: "최근 수동 발송" });
  const detailToggle = screen.getByRole("button", { name: /운영 상세/ });

  expect(rail.compareDocumentPosition(workbench) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(workbench.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(recent.compareDocumentPosition(detailToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "자동 리마인더 정책" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "알림 발송 요약" })).not.toBeInTheDocument();
});

it("does not render a disabled process action in a healthy state", () => {
  renderPage({
    summaryData: { pending: 0, failed: 0, dead: 0, sentLast24h: 0 },
    events: [],
    deliveries: [],
  });

  expect(screen.queryByRole("button", { name: /처리할 알림 없음|건 처리|대기·실패 처리/ }))
    .not.toBeInTheDocument();
});
```

Keep the stale-summary characterization:

```tsx
it("keeps processing available for a visible pending row when summary counts are stale", async () => {
  const user = userEvent.setup();
  const onProcess = vi.fn().mockResolvedValue(undefined);
  renderPage({
    summaryData: { pending: 0, failed: 0, dead: 0, sentLast24h: 0 },
    events: [pendingEvent],
    deliveries: [],
    onProcess,
  });

  await user.click(screen.getByRole("button", { name: "대기·실패 처리" }));
  expect(onProcess).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the page tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: FAIL because the page still renders the old policy card, summary card, header action, and always-visible operations cards.

- [ ] **Step 3: Assemble the new page**

Remove page-owned `activeLedgerTab`; the disclosure owns it. Keep the existing processability guards:

```tsx
const processableCount = Math.max(0, summary.pending) + Math.max(0, summary.failed);
const hasVisibleProcessableDelivery = deliveries.some(
  (item) => item.status === "PENDING" || item.status === "FAILED",
);
const hasVisibleProcessableEvent = events.some(
  (item) => item.status === "PENDING" || item.status === "FAILED",
);
const hasProcessableNotifications =
  processableCount > 0
  || hasVisibleProcessableDelivery
  || hasVisibleProcessableEvent;
```

Render:

```tsx
<main className="rm-host-notifications-page">
  <header className="rm-host-notifications-page__header">
    <div className="container">
      <div className="eyebrow">운영 · 알림 발송</div>
      <h1>알림 발송 작업대</h1>
      <p>필요한 알림을 고르고, 확인한 뒤 발송합니다.</p>
    </div>
  </header>

  <div className="container rm-host-notifications-page__body">
    {message ? (
      <p role={message.kind === "alert" ? "alert" : "status"}>
        {message.text}
      </p>
    ) : null}
    <HostNotificationOperationsRail
      summary={summary}
      policy={policy}
      processableCount={processableCount}
      hasProcessableNotifications={hasProcessableNotifications}
      processPending={isPending("process")}
      isRefreshing={isRefreshing}
      onProcess={handleProcess}
      onPolicyChange={onPolicyChange}
      onPolicyRetry={onPolicyRetry}
      policyPending={policyPending}
      policyError={policyError}
      policyLoadError={policyLoadError}
      policyLoading={policyLoading}
    />
    <ManualNotificationWorkbench
      options={visibleManualOptions}
      hostSessions={hostSessions}
      initialSessionId={initialManualSelection.sessionId}
      initialEventType={initialManualSelection.eventType}
      preview={manualPreview}
      busy={manualBusy || isRefreshing}
      error={manualError}
      onPreview={handleManualPreview}
      onConfirm={handleManualConfirm}
      onPreviewDismiss={() => {
        setManualPreview(null);
        setManualError(null);
      }}
      onSessionChange={handleManualSessionChange}
      onLoadManualOptions={handleLoadManualOptions}
      onLoadMoreManualMembers={handleLoadMoreManualMembers}
      onDraftInvalidated={() => {
        setManualPreview(null);
        setManualError(null);
      }}
    />
    <ManualNotificationDispatchLedger
      variant="recent"
      limit={3}
      dispatches={visibleManualDispatches}
    />
    <NotificationOperationsDisclosure
      summary={summary}
      events={events}
      deliveries={deliveries}
      manualDispatches={visibleManualDispatches}
      audit={audit}
      retryPendingId={pendingAction?.kind === "retry" ? pendingAction.id : null}
      restorePendingId={pendingAction?.kind === "restore" ? pendingAction.id : null}
      disabled={isBusy}
      hasMoreEvents={hasMoreEvents}
      hasMoreDeliveries={hasMoreDeliveries}
      hasMoreManualDispatches={hasMoreManualDispatches}
      hasMoreAudit={hasMoreAudit}
      isLoadingMoreEvents={isLoadingMoreEvents}
      isLoadingMoreDeliveries={isLoadingMoreDeliveries}
      isLoadingMoreManualDispatches={isLoadingMoreManualDispatches}
      isLoadingMoreAudit={isLoadingMoreAudit}
      testMailValue={testEmail}
      testMailPending={isPending("test-mail")}
      onTestMailValueChange={setTestEmail}
      onSubmitTestMail={submitTestMail}
      onRetry={handleRetry}
      onRestore={(item) => {
        setRestoreError(null);
        setRestoreTarget(item);
      }}
      onLoadMoreEvents={onLoadMoreEvents}
      onLoadMoreDeliveries={onLoadMoreDeliveries}
      onLoadMoreManualDispatches={onLoadMoreManualDispatches}
      onLoadMoreAudit={onLoadMoreAudit}
    />
  </div>
  {restoreTarget ? (
    <RestoreNotificationDialog
      item={restoreTarget}
      submitting={isPending("restore", restoreTarget.id)}
      error={restoreError}
      onClose={() => setRestoreTarget(null)}
      onConfirm={() => handleRestore(restoreTarget)}
    />
  ) : null}
</main>
```

Pass `testEmail`, `setTestEmail`, and the existing `submitTestMail` to the disclosure. Preserve masking and the current success/error messages.

Remove imports that become unused after integration:

```ts
CSSProperties
formatDateOnlyLabel
maskRecipient
NotificationLedgerTab
NotificationLedgerTabs
HostNotificationPolicyCard
HostNotificationsSummary
```

- [ ] **Step 4: Remove obsolete presentation units**

Delete:

```bash
git rm front/features/host/ui/notifications/host-notification-policy-card.tsx
git rm front/features/host/ui/notifications/host-notification-policy-card.test.tsx
git rm front/features/host/ui/notifications/host-notifications-summary.tsx
```

Before deleting, confirm the rail tests carry forward all four policy-card behaviors:

- server-confirmed checked value
- failed save retains old value
- pending disables control
- failed initial load can retry

- [ ] **Step 5: Add the full page and responsive CSS**

Use one page-specific section in `front/src/styles/globals.css`:

```css
.rm-host-notifications-page {
  min-height: 100vh;
  background: var(--bg);
}

.rm-host-notifications-page__body {
  display: grid;
  gap: 20px;
  padding-top: 8px;
  padding-bottom: 72px;
}

.rm-host-notifications-rail {
  display: grid;
  grid-template-columns: minmax(260px, 2fr) repeat(4, minmax(110px, 1fr));
  border-block: 1px solid var(--line);
}

.rm-host-notifications-rail__cell {
  min-width: 0;
  padding: 16px;
  border-inline-end: 1px solid var(--line);
}

.rm-notification-dispatch-row {
  display: grid;
  grid-template-columns: 70px minmax(0, 1.5fr) minmax(150px, 1fr) 110px auto;
  gap: 14px;
  align-items: center;
  min-height: 64px;
  border-top: 1px solid var(--line-soft);
}

.rm-notification-operations-disclosure__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 52px;
  border: 0;
  border-block: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  text-align: left;
}

@media (max-width: 900px) {
  .rm-host-notifications-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rm-host-notifications-rail__policy {
    grid-column: 1 / -1;
  }

  .rm-notification-dispatch-row {
    grid-template-columns: 56px minmax(0, 1fr) auto;
  }
}

@media (max-width: 600px) {
  .rm-host-notifications-page__body {
    gap: 16px;
    padding-inline: 12px;
  }

  .rm-host-notifications-rail__cell,
  .rm-notification-workbench {
    min-width: 0;
  }

  .rm-notification-dispatch-row {
    grid-template-columns: 48px minmax(0, 1fr);
    min-height: 72px;
  }

  .rm-notification-operations-disclosure__toggle {
    min-height: 44px;
    flex-wrap: wrap;
  }
}
```

Use existing token names confirmed in the current stylesheet. Do not introduce literal decorative colors.

- [ ] **Step 6: Run page and component regression tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/host-notification-operations-rail.test.tsx \
  features/host/ui/notifications/manual-notification-workbench.test.tsx \
  features/host/ui/notifications/host-notification-composer-dialog.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx \
  features/host/ui/notifications/manual-notification-dispatch-ledger.test.tsx \
  features/host/ui/notifications/notification-operations-disclosure.test.tsx \
  tests/unit/host-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run frontend boundary and formatting checks**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
git diff --check
```

Expected: PASS. New UI files must not import API clients, query hooks, route modules, or `shared/api`.

- [ ] **Step 8: Commit Task 5**

```bash
git add front/features/host/ui/host-notifications-page.tsx \
  front/src/styles/globals.css \
  front/tests/unit/host-notifications.test.tsx \
  front/features/host/ui/notifications/host-notification-policy-card.tsx \
  front/features/host/ui/notifications/host-notification-policy-card.test.tsx \
  front/features/host/ui/notifications/host-notifications-summary.tsx
git diff --cached --check
git commit -m "feat(front): assemble notification workbench ledger"
```

---

### Task 6: Update the Full User Flow and Produce Final Evidence

**Files:**

- Modify: `front/tests/e2e/manual-notifications.spec.ts`
- Modify: `CHANGELOG.md`
- Verify: all files changed by Tasks 1–5

**Interfaces:**

- No new production interface.
- Produces:
  - E2E proof that preview dismissal never sends
  - E2E proof that recipient-count confirm sends exactly once
  - Desktop and 390px browser evidence
  - Final frontend gate results

- [ ] **Step 1: Update the E2E selectors and add the no-send dismissal scenario**

Use approved accessible names:

```ts
test("preview dismissal never dispatches a manual reminder", async ({ page }) => {
  const sessionId = createOpenSessionFixture();
  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto(`/clubs/${CLUB_SLUG}/app/host`);
  await page.goto(
    `/clubs/${CLUB_SLUG}/app/host/notifications?sessionId=${sessionId}&eventType=SESSION_REMINDER_DUE`,
  );

  await page.getByRole("button", { name: "미리보기 열기" }).click();
  await expect(page.getByRole("dialog", { name: "발송 전 확인" })).toBeVisible();
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "발송 전 확인" })).toBeHidden();
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(hostActionDecisionCount(sessionId)).toBe(0);

  await page.getByRole("button", { name: "미리보기 열기" }).click();
  await page.goBack();

  await expect(page).toHaveURL(new RegExp(`/clubs/${CLUB_SLUG}/app/host$`));
  expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
  expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(0);
});
```

Update the successful confirm:

```ts
const confirm = page.getByRole("button", { name: /\\d+명에게 알림 발송/ });
await expect(confirm).toBeVisible();
await confirm.click();
await expect(page.getByText("수동 알림 발송을 요청했습니다.")).toBeVisible();
expect(manualDispatchCount(sessionId, "SESSION_REMINDER_DUE")).toBe(1);
expect(notificationEventCount(sessionId, "SESSION_REMINDER_DUE")).toBe(1);
```

For the healthy-page smoke assertion, verify the `운영 상세` button is collapsed, click it, then assert the event/delivery tabs. Do not force the ledger to remain permanently visible.

- [ ] **Step 2: Run the focused E2E and verify RED before selector/behavior completion**

Run:

```bash
corepack pnpm --dir front exec playwright test tests/e2e/manual-notifications.spec.ts
```

Expected before completing all E2E updates: FAIL on old `미리보기`, `발송 확인`, or always-visible ledger expectations. After updating the flow, rerun until PASS.

- [ ] **Step 3: Record the user-visible change**

Add one Korean-first bullet under `CHANGELOG.md` `Unreleased`:

```md
- 호스트 알림 발송 화면을 상태 레일, 3단계 발송 작업대, 수신 인원 기반 미리보기 확인, 조건부 운영 상세로 재구성해 평상시 스크롤을 줄이고 이상 상태 복구 경로를 분명히 했습니다.
```

- [ ] **Step 4: Run the complete frontend gates**

Run from repository root:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front exec playwright test tests/e2e/manual-notifications.spec.ts
git diff --check
```

Expected: all commands PASS.

If changes outside the focused manual-notifications flow were required, also run:

```bash
corepack pnpm --dir front test:e2e
```

Do not claim this optional full E2E command passed unless it was actually run.

- [ ] **Step 5: Inspect the desktop route**

Use the existing local host fixture and navigate to:

```text
/clubs/reading-sai/app/host/notifications
```

At a 1440×1000 viewport verify:

- One operations rail with policy plus four metrics
- No separate `자동 리마인더 정책` or `알림 발송 요약` card
- Workbench decisions read left-to-right as 01, 02, 03
- Recent manual history has at most three rows
- Healthy operations detail is collapsed
- Abnormal operations detail opens with the actionable tab
- Preview opens as a right side sheet
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`
- Title/body text and status badges meet WCAG AA contrast
- Keyboard traversal has a visible focus indicator

Save a screenshot under ignored `output/playwright/host-notifications-workbench-desktop.png`.

- [ ] **Step 6: Inspect the 390px mobile route**

At 390×844 verify:

- Policy spans the full rail width and metrics form two columns
- Workbench is one column
- Disabled-template reason wraps without overlap
- `미리보기 열기` is full width and at least 44px high
- Preview opens as a bottom sheet above safe-area and host navigation
- Final confirm is full width and at least 44px high
- Operations disclosure wraps without horizontal scrolling
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`

Save a screenshot under ignored `output/playwright/host-notifications-workbench-mobile.png`.

- [ ] **Step 7: Verify working tree scope and commit Task 6**

Run:

```bash
git status --short --branch
git diff --stat
git diff --check
```

Confirm only the notification workbench, its tests/styles, and `CHANGELOG.md` changed. Then commit:

```bash
git add CHANGELOG.md front/tests/e2e/manual-notifications.spec.ts
git diff --cached --check
git commit -m "test(front): verify notification workbench flow"
```

- [ ] **Step 8: Re-run final-HEAD proof**

After the commit, rerun:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front exec playwright test tests/e2e/manual-notifications.spec.ts
git diff --check
git status --short --branch
```

Expected:

- All frontend and focused E2E commands PASS on final HEAD.
- `git diff --check` emits no output.
- The working tree is clean.
- No push, PR, tag, deploy, or remote merge occurs without a new explicit user request.

## Implementation Stop Conditions

Stop and report instead of expanding scope if any of these occur:

- A content save, preview open/close, backdrop, or `Escape` creates a dispatch, event, outbox row, member notification, or email.
- The redesign requires a server endpoint, BFF behavior, database migration, scheduler change, new recipient mode, or new channel.
- Existing dashboard or session-editor composer flows lose their default centered dialog behavior.
- Policy save becomes optimistic instead of server-confirmed.
- A club, session, or member authorization test must be weakened.
- A 390px viewport needs horizontal scrolling.
- Tests pass only after deleting assertions, broadening selectors until they stop proving behavior, or adding an architecture exception.
- Existing local services must be stopped or reconfigured to perform browser verification.
