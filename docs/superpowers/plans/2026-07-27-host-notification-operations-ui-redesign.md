# ReadMates Host Notification Operations UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the host notification policy and manual sending workbench so automation, notification type, recipients, channels, and final confirmation are immediately understandable while preserving confirm-only delivery.

**Architecture:** Keep the existing route/query/API ownership and the options → draft → preview → confirm pipeline. Add presentation-copy helpers and workbench-scoped semantic controls inside the existing host notification UI components, then style them with `rm-notification-*` and `rm-host-notifications-*` selectors so dashboard/session-editor composer dialogs remain unchanged. No server, BFF, database, scheduler, notification contract, or delivery-pipeline change is allowed.

**Tech Stack:** React 19, TypeScript, React Router 7, TanStack Query v5, Vitest, Testing Library, Playwright, Vite, existing ReadMates design tokens, pnpm 11.13.1 through Corepack

## Global Constraints

- The approved design source is `docs/superpowers/specs/2026-07-27-host-notification-operations-ui-redesign-design.md` at commit `e64fbacd`.
- The touched product surface is `/clubs/:clubSlug/app/host/notifications`.
- Preserve the existing policy API and manual options → preview → confirm API unchanged.
- Preserve the reminder policy default OFF behavior; a missing or failed policy load must never be presented as confirmed OFF.
- Only explicit final confirm may create a dispatch, event, outbox row, member notification, or email.
- Session, template, recipient, and channel changes; preview creation; close; backdrop; `Escape`; and route navigation must not call confirm.
- Keep `HostNotificationComposer` dialog presentation and centered preview behavior unchanged outside `presentation="workbench"`.
- Use the existing warm paper surfaces, ink hierarchy, line tokens, badges, focus styles, and reduced-motion behavior; do not add gradients, glow, glassmorphism, or a new UI dependency.
- Do not display raw session enums such as `OPEN` or `HOST_ONLY` in the manual workbench.
- Do not display predicted delivery counts before the server preview returns them.
- At 390px viewport width, the page must have no horizontal overflow and every primary mobile action must be at least 44px high.
- Use native checkbox/radio semantics. The reminder checkbox must expose `role="switch"`; choice cards must remain keyboard-operable radios.
- New unit tests under `front/features`, `front/src`, or `front/shared` must be co-located with their source.
- Use masked example addresses only; do not add real member data, private domains, secrets, local paths, or deployment state to tests, docs, screenshots, or commits.
- Run frontend commands through `corepack pnpm`. If Corepack is not on PATH, use `npx --yes corepack@0.35.0 pnpm` and record the exact fallback command.
- Start execution from a clean isolated worktree at the current approved HEAD. Preserve both existing local documentation commits and do not stop or reconfigure existing local services.

---

## File Structure

### Create

- `front/features/host/ui/notifications/manual-notification-labels.test.ts`
  - Locks user-facing template descriptions, audience/channel descriptions, and session state/visibility labels.
- `front/features/host/ui/notifications/notification-recipient-picker.test.tsx`
  - Locks selected-member chips, row selection, clearing, pagination, and accessible names.
- `front/features/host/ui/notifications/manual-notification-preview.test.tsx`
  - Locks side-sheet counts, inline confirm errors, preview refresh, and duplicate resend confirmation.

### Modify

- `front/features/host/ui/notifications/manual-notification-labels.ts`
  - Owns all manual notification presentation copy and known session enum labels.
- `front/features/host/ui/notifications/host-notification-operations-rail.tsx`
  - Replaces the plain policy checkbox row with a server-confirmed switch, explicit state copy, and retryable save/load failures.
- `front/features/host/ui/notifications/host-notification-operations-rail.test.tsx`
  - Covers switch semantics, state copy, pending lock, failed-target retry, and initial-load retry.
- `front/features/host/ui/notifications/manual-notification-workbench.tsx`
  - Renders the approved header, numbered sections, session context, template radio cards, and preview side-sheet error handoff.
- `front/features/host/ui/notifications/manual-notification-workbench.test.tsx`
  - Covers ordered sections, humanized session context, template card semantics, disabled reasons, safe copy, and preview refresh.
- `front/features/host/ui/notifications/host-notification-composer.tsx`
  - Renders workbench-only recipient/channel cards, recommendation/default badges, empty-selection guidance, and the final selection summary.
- `front/features/host/ui/notifications/host-notification-composer.test.tsx`
  - Covers workbench card copy and state without changing shared dialog presentation.
- `front/features/host/ui/notifications/notification-recipient-picker.tsx`
  - Renders selected members as removable chips and search results as full-row checkbox choices.
- `front/features/host/ui/notifications/manual-notification-preview.tsx`
  - Renders side-sheet count cards, message preview, warning blocks, inline confirm errors, refresh action, and explicit resend confirmation.
- `front/src/styles/globals.css`
  - Adds all namespaced policy switch, numbered section, choice-card, member-picker, summary footer, preview, responsive, focus, and reduced-motion styles.
- `front/tests/unit/host-notifications.test.tsx`
  - Updates route/page assertions for new semantics and preserves query/preview/confirm behavior.
- `front/tests/e2e/manual-notifications.spec.ts`
  - Updates selectors from template buttons/plain checkbox to radio cards/switch and preserves no-send and explicit-confirm evidence.
- `CHANGELOG.md`
  - Records the visible host notification UI refinement under `Unreleased`.

### Explicitly Unchanged

- `front/features/host/api/**`
- `front/features/host/queries/**`
- `front/features/host/route/**`
- `front/functions/**`
- `server/**`
- `deploy/**`

If implementation requires a change in an explicitly unchanged surface, stop and revise the plan instead of widening scope silently.

### Implementation-result exception: route policy rejection propagation

The 2026-07-27 whole-branch review proved that the existing route callback handled a policy mutation rejection by setting route feedback and then resolving, so the rail could not retain the failed boolean or expose its retry action on the integrated page. The single approved exception is `front/features/host/route/host-notifications-route.tsx`: after the existing feedback and mutation-owned server-truth reconciliation, rethrow the same failure to the rail. Keep the mutation hook, query ownership/invalidation, request payload, API/auth/default-OFF contracts, and every manual-dispatch boundary unchanged. Add route-integrated OFF→ON and ON→OFF failure, rollback, and same-target retry coverage, and include this exception in the final whole-branch review.

## Task Dependencies

```text
Task 1 presentation copy
  ↓
Task 2 reminder switch
  ↓
Task 3 workbench and template cards
  ↓
Task 4 recipient, channel, and member cards
  ↓
Task 5 preview side-sheet states
  ↓
Task 6 route/E2E integration, responsive proof, changelog, final gates
```

Each task ends with a focused green test and a narrow commit. Task 6 starts only after Tasks 1–5 are green.

## Acceptance Matrix Selection

- Select `UI or runtime state`: this change affects loading, empty, disabled, pending, stale/expired error, wrapping, desktop, tablet, and mobile presentation. Evidence is focused component/route tests plus responsive browser inspection.
- Select `Cursor collection` narrowly: direct-member search and `멤버 더 보기` must retain accumulated selections while results paginate. No query or API contract changes are allowed.
- Select `Async, cache, or provider` narrowly: policy saving and preview/confirm pending/error states change presentation only. Existing mutation and query invalidation ownership remains unchanged.
- Exclude `Actor or authorization`, `Club context`, `Session lifecycle`, `Publication visibility`, `BFF or OAuth`, and `Persistence or migration` because their contracts are not modified. Any implementation pressure to touch them is a scope violation.

---

### Task 1: Centralize Manual Notification Presentation Copy

**Files:**

- Create: `front/features/host/ui/notifications/manual-notification-labels.test.ts`
- Modify: `front/features/host/ui/notifications/manual-notification-labels.ts`

**Interfaces:**

- Consumes:

```ts
HostNotificationEventType
ManualNotificationAudience
ManualNotificationRequestedChannels
```

- Produces:

```ts
export const manualAudienceLabels: Record<ManualNotificationAudience, string>;
export const manualAudienceDescriptions: Record<ManualNotificationAudience, string>;
export const manualChannelLabels: Record<ManualNotificationRequestedChannels, string>;
export const manualChannelDescriptions: Record<ManualNotificationRequestedChannels, string>;
export const manualTemplateDescriptions: Record<HostNotificationEventType, string>;
export function manualSessionStateLabel(value: string): string;
export function manualSessionVisibilityLabel(value: string): string;
```

- [ ] **Step 1: Write the failing presentation-copy tests**

Create `manual-notification-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  manualAudienceDescriptions,
  manualChannelDescriptions,
  manualSessionStateLabel,
  manualSessionVisibilityLabel,
  manualTemplateDescriptions,
} from "./manual-notification-labels";

describe("manual notification presentation copy", () => {
  it("explains notification templates in host language", () => {
    expect(manualTemplateDescriptions.SESSION_REMINDER_DUE)
      .toBe("일정과 참석 여부를 다시 안내합니다.");
    expect(manualTemplateDescriptions.NEXT_BOOK_PUBLISHED)
      .toBe("다음 모임에서 읽을 책을 안내합니다.");
    expect(manualTemplateDescriptions.FEEDBACK_DOCUMENT_PUBLISHED)
      .toBe("정리된 피드백 문서를 멤버에게 안내합니다.");
  });

  it("explains recipients and channels without implementation terms", () => {
    expect(manualAudienceDescriptions.ALL_ACTIVE_MEMBERS)
      .toBe("현재 모임에 참여 중인 활성 멤버 모두");
    expect(manualAudienceDescriptions.SELECTED_MEMBERS)
      .toBe("검색해 한 명 이상 직접 지정");
    expect(manualChannelDescriptions.BOTH)
      .toBe("가능한 두 채널 모두 사용");
  });

  it("never exposes known session enums", () => {
    expect(manualSessionStateLabel("OPEN")).toBe("진행 중");
    expect(manualSessionVisibilityLabel("HOST_ONLY")).toBe("호스트 전용");
    expect(manualSessionStateLabel("UNKNOWN")).toBe("상태 확인 필요");
    expect(manualSessionVisibilityLabel("UNKNOWN")).toBe("공개 범위 확인 필요");
  });
});
```

- [ ] **Step 2: Run the copy test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/notifications/manual-notification-labels.test.ts
```

Expected: FAIL because the new descriptions and label functions are not exported.

- [ ] **Step 3: Implement the presentation-copy contract**

Replace `manual-notification-labels.ts` with typed records and safe fallbacks:

```ts
import type {
  HostNotificationEventType,
  ManualNotificationAudience,
  ManualNotificationRequestedChannels,
} from "@/features/host/model/host-view-types";

export const manualChannelLabels: Record<ManualNotificationRequestedChannels, string> = {
  BOTH: "앱 + 이메일",
  IN_APP: "앱 알림",
  EMAIL: "이메일",
};

export const manualChannelDescriptions: Record<ManualNotificationRequestedChannels, string> = {
  BOTH: "가능한 두 채널 모두 사용",
  IN_APP: "ReadMates 안에서만 안내",
  EMAIL: "수신 가능한 이메일로만 발송",
};

export const manualAudienceLabels: Record<ManualNotificationAudience, string> = {
  ALL_ACTIVE_MEMBERS: "전체 활성 멤버",
  SESSION_PARTICIPANTS: "세션 참가자",
  CONFIRMED_ATTENDEES: "참석 확정자",
  SELECTED_MEMBERS: "직접 선택",
};

export const manualAudienceDescriptions: Record<ManualNotificationAudience, string> = {
  ALL_ACTIVE_MEMBERS: "현재 모임에 참여 중인 활성 멤버 모두",
  SESSION_PARTICIPANTS: "이 회차에 참여 중인 멤버",
  CONFIRMED_ATTENDEES: "이 회차 참석을 확정한 멤버",
  SELECTED_MEMBERS: "검색해 한 명 이상 직접 지정",
};

export const manualTemplateDescriptions: Record<HostNotificationEventType, string> = {
  NEXT_BOOK_PUBLISHED: "다음 모임에서 읽을 책을 안내합니다.",
  SESSION_REMINDER_DUE: "일정과 참석 여부를 다시 안내합니다.",
  FEEDBACK_DOCUMENT_PUBLISHED: "정리된 피드백 문서를 멤버에게 안내합니다.",
  REVIEW_PUBLISHED: "새 독후감이 공개됐음을 안내합니다.",
  SESSION_RECORD_UPDATED: "수정된 모임 기록을 멤버에게 안내합니다.",
};

const sessionStateLabels: Record<string, string> = {
  DRAFT: "예정",
  OPEN: "진행 중",
  PUBLISHED: "공개됨",
  CLOSED: "종료",
};

const sessionVisibilityLabels: Record<string, string> = {
  HOST_ONLY: "호스트 전용",
  MEMBER: "멤버 공개",
  PUBLIC: "전체 공개",
};

export function manualSessionStateLabel(value: string): string {
  return sessionStateLabels[value] ?? "상태 확인 필요";
}

export function manualSessionVisibilityLabel(value: string): string {
  return sessionVisibilityLabels[value] ?? "공개 범위 확인 필요";
}
```

- [ ] **Step 4: Run the copy test and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/notifications/manual-notification-labels.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add front/features/host/ui/notifications/manual-notification-labels.ts \
  front/features/host/ui/notifications/manual-notification-labels.test.ts
git diff --cached --check
git commit -m "refactor(front): centralize notification presentation copy"
```

---

### Task 2: Replace the Reminder Checkbox with a Server-Confirmed Switch

**Files:**

- Modify: `front/features/host/ui/notifications/host-notification-operations-rail.tsx:22-131`
- Modify: `front/features/host/ui/notifications/host-notification-operations-rail.test.tsx:36-145`
- Modify: `front/src/styles/globals.css:4827-4842`

**Interfaces:**

- Keeps `HostNotificationOperationsRailProps` unchanged.
- Produces:
  - `input[type="checkbox"][role="switch"][aria-label="모임 전날 자동 리마인더"]`
  - Visible state text: `불러오는 중`, `상태 확인 필요`, `저장 중`, `켜짐`, or `꺼짐`
  - Retry through `onPolicyRetry` for load failure
  - Retry through `onPolicyChange(failedTarget)` for save failure

- [ ] **Step 1: Extend the rail tests for switch semantics and retry**

Add these cases:

```tsx
it("renders the reminder policy as a labeled switch with explicit off copy", () => {
  renderRail();

  const control = screen.getByRole("switch", { name: "모임 전날 자동 리마인더" });
  expect(control).not.toBeChecked();
  expect(screen.getByText("꺼짐")).toBeInTheDocument();
  expect(
    screen.getByText("예정된 모임에 자동 알림을 보내지 않습니다."),
  ).toBeInTheDocument();
});

it("renders explicit on copy from the server-confirmed policy", () => {
  renderRail({
    policy: { sessionReminderEnabled: true, updatedAt: "2026-07-25T09:00:00Z" },
  });

  expect(screen.getByRole("switch", { name: "모임 전날 자동 리마인더" }))
    .toBeChecked();
  expect(screen.getByText("켜짐")).toBeInTheDocument();
  expect(
    screen.getByText("예정된 모임의 리마인더가 전날 자동 발송됩니다."),
  ).toBeInTheDocument();
});

it("retries the failed target without changing the confirmed value", async () => {
  const user = userEvent.setup();
  const onPolicyChange = vi.fn()
    .mockRejectedValueOnce(new Error("save failed"))
    .mockResolvedValueOnce(undefined);
  renderRail({ onPolicyChange });

  const control = screen.getByRole("switch", { name: "모임 전날 자동 리마인더" });
  await user.click(control);
  expect(control).not.toBeChecked();
  await user.click(await screen.findByRole("button", { name: "다시 시도" }));

  expect(onPolicyChange).toHaveBeenNthCalledWith(1, true);
  expect(onPolicyChange).toHaveBeenNthCalledWith(2, true);
});
```

Update existing checkbox queries to `getByRole("switch", ...)`.

- [ ] **Step 2: Run the rail test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/notifications/host-notification-operations-rail.test.tsx
```

Expected: FAIL because the control has no switch role, the new copy is absent, and save retry is not rendered.

- [ ] **Step 3: Implement server-confirmed switch state**

Add the failed target state:

```tsx
const [failedTarget, setFailedTarget] = useState<boolean | null>(null);

const handlePolicyChange = async (nextEnabled: boolean) => {
  if (!policy || policyPending || policyLoading || submitting) return;
  setSubmitting(true);
  setLocalError(null);
  setFailedTarget(null);
  try {
    await onPolicyChange(nextEnabled);
  } catch {
    setFailedTarget(nextEnabled);
    setLocalError("리마인더 정책을 저장하지 못했습니다.");
  } finally {
    setSubmitting(false);
  }
};
```

Derive copy without repeating the title:

```tsx
const policyState = policyLoading
  ? "불러오는 중"
  : !policy
    ? "상태 확인 필요"
    : policyPending || submitting
      ? "저장 중"
      : enabled
        ? "켜짐"
        : "꺼짐";

const policyDescription = enabled
  ? "예정된 모임의 리마인더가 전날 자동 발송됩니다."
  : "예정된 모임에 자동 알림을 보내지 않습니다.";
```

Render a native checkbox as the accessible switch:

```tsx
<div className="rm-host-notifications-policy">
  <div className="rm-host-notifications-policy__copy">
    <div className="eyebrow">자동화</div>
    <strong>모임 전날 자동 리마인더</strong>
    <p>{policy ? policyDescription : "현재 설정을 확인한 뒤 변경할 수 있습니다."}</p>
  </div>
  <div className="rm-host-notifications-policy__control">
    <span aria-live="polite">{policyState}</span>
    <label className="rm-host-notifications-policy__switch">
      <input
        id="host-session-reminder-policy"
        type="checkbox"
        role="switch"
        aria-label="모임 전날 자동 리마인더"
        aria-describedby={visibleError ? policyErrorId : undefined}
        checked={enabled}
        disabled={!policy || busy}
        onChange={(event) => void handlePolicyChange(event.currentTarget.checked)}
      />
      <span aria-hidden="true" className="rm-host-notifications-policy__track">
        <span className="rm-host-notifications-policy__thumb" />
      </span>
    </label>
  </div>
</div>
```

For `failedTarget !== null`, render a `다시 시도` button that calls `handlePolicyChange(failedTarget)`. Keep the existing initial-load retry wired to `onPolicyRetry`.

- [ ] **Step 4: Add namespaced switch styling**

Add CSS under the existing host notification rail selectors:

```css
.rm-host-notifications-policy {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.rm-host-notifications-policy__copy strong,
.rm-host-notifications-policy__copy p {
  display: block;
  margin: 4px 0 0;
}

.rm-host-notifications-policy__control {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.rm-host-notifications-policy__switch {
  position: relative;
  display: inline-flex;
  width: 48px;
  height: 28px;
  flex: 0 0 auto;
}

.rm-host-notifications-policy__switch input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.rm-host-notifications-policy__track {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg-sub);
  transition: background-color var(--motion-fast) var(--ease-standard-refined);
}

.rm-host-notifications-policy__thumb {
  display: block;
  width: 20px;
  height: 20px;
  margin: 3px;
  border-radius: 50%;
  background: var(--text-3);
  transition: transform var(--motion-fast) var(--ease-standard-refined);
}

.rm-host-notifications-policy__switch input:checked + .rm-host-notifications-policy__track {
  border-color: var(--accent);
  background: color-mix(in oklch, var(--accent) 28%, var(--bg-sub));
}

.rm-host-notifications-policy__switch input:checked + .rm-host-notifications-policy__track
  .rm-host-notifications-policy__thumb {
  transform: translateX(20px);
  background: var(--accent);
}

.rm-host-notifications-policy__switch input:focus-visible + .rm-host-notifications-policy__track {
  outline: 3px solid color-mix(in oklch, var(--accent) 28%, transparent);
  outline-offset: 3px;
}
```

Add disabled cursor/opacity and reduced-motion overrides; do not use color alone because visible state text is mandatory.

- [ ] **Step 5: Run the rail test and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/notifications/host-notification-operations-rail.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add front/features/host/ui/notifications/host-notification-operations-rail.tsx \
  front/features/host/ui/notifications/host-notification-operations-rail.test.tsx \
  front/src/styles/globals.css
git diff --cached --check
git commit -m "feat(front): refine notification reminder switch"
```

---

### Task 3: Rebuild the Workbench Hierarchy and Template Choices

**Files:**

- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx:174-300`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.test.tsx:114-207`
- Modify: `front/src/styles/globals.css:28-66`

**Interfaces:**

- Consumes Task 1:

```ts
manualSessionStateLabel(value: string): string
manualSessionVisibilityLabel(value: string): string
manualTemplateDescriptions[eventType]
```

- Keeps `ManualNotificationWorkbenchProps` unchanged.
- Produces:
  - Header safety copy and `미리보기 후 발송` badge
  - Ordered section headings `01 대상 회차`, `02 알림 종류`, `03 대상과 채널`
  - Template choices as native radios named `manual-notification-template`
  - Humanized session context with no raw enums

- [ ] **Step 1: Write failing workbench hierarchy tests**

Replace button-based template expectations and add copy/state assertions:

```tsx
it("renders the safe guided-ledger hierarchy without raw enums", () => {
  renderWorkbench();

  const workbench = screen.getByRole("region", { name: "새 알림 발송" });
  expect(within(workbench).getByText(
    "선택만으로는 발송되지 않습니다. 미리보기에서 최종 확인합니다.",
  )).toBeInTheDocument();
  expect(within(workbench).getByText("미리보기 후 발송")).toBeInTheDocument();
  expect(within(workbench).getByText(
    "진행 중 · 멤버 공개 · 피드백 문서 준비 전",
  )).toBeInTheDocument();
  expect(within(workbench).queryByText(/OPEN|HOST_ONLY/)).not.toBeInTheDocument();
});

it("renders notification types as descriptive radio cards", () => {
  renderWorkbench();

  const reminder = screen.getByRole("radio", { name: /모임 전날 리마인더/ });
  expect(reminder).toBeChecked();
  expect(screen.getByText("일정과 참석 여부를 다시 안내합니다."))
    .toBeInTheDocument();

  const unavailable = screen.getByRole("radio", { name: /피드백 문서 등록/ });
  const reason = screen.getByText("피드백 문서가 등록된 뒤 발송할 수 있습니다.");
  expect(unavailable).toBeDisabled();
  expect(unavailable).toHaveAttribute("aria-describedby", reason.id);
});
```

Keep the existing side-sheet dismissal tests unchanged.

- [ ] **Step 2: Run the workbench test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/notifications/manual-notification-workbench.test.tsx
```

Expected: FAIL because templates are buttons, safety copy is absent, and raw enums are visible.

- [ ] **Step 3: Implement the guided workbench structure**

Import Task 1 helpers and render the header:

```tsx
<header className="rm-notification-workbench__header">
  <div>
    <span className="eyebrow">운영 · 수동 발송</span>
    <h2 id="manual-notification-title">새 알림 발송</h2>
    <p>선택만으로는 발송되지 않습니다. 미리보기에서 최종 확인합니다.</p>
  </div>
  <span className="badge">미리보기 후 발송</span>
</header>
```

Render each decision section with a shared layout class:

```tsx
<section className="rm-notification-workbench__decision">
  <header className="rm-notification-workbench__decision-heading">
    <span className="rm-notification-workbench__step">01</span>
    <div>
      <h3 id="manual-notification-session-title">대상 회차</h3>
      <p>알림의 기준이 되는 모임</p>
    </div>
  </header>
  <div className="rm-notification-workbench__decision-control">
    {/* existing select */}
    {selectedSession ? (
      <p className="rm-notification-workbench__session-context">
        {manualSessionStateLabel(selectedSession.state)}
        {" · "}
        {manualSessionVisibilityLabel(selectedSession.visibility)}
        {" · "}
        {options.session?.feedbackDocumentUploaded
          ? "피드백 문서 준비됨"
          : "피드백 문서 준비 전"}
      </p>
    ) : null}
  </div>
</section>
```

When `hostSessions.length === 0`, replace the empty select-only state with:

```tsx
<div className="rm-notification-workbench__empty">
  <p>선택 가능한 세션이 없습니다.</p>
  <a className="btn btn-quiet btn-sm" href="/app/host/sessions">
    세션 관리로 이동
  </a>
</div>
```

Replace each template button with a radio-card label:

```tsx
<label
  key={template.eventType}
  className="rm-notification-choice-card"
  data-selected={draft.eventType === template.eventType ? "true" : "false"}
  data-disabled={!template.enabled ? "true" : "false"}
>
  <input
    type="radio"
    name="manual-notification-template"
    aria-label={template.label}
    aria-describedby={template.disabledReason ? reasonId : undefined}
    checked={draft.eventType === template.eventType}
    disabled={busy || !template.enabled}
    onChange={() => selectTemplate(template.eventType)}
  />
  <span className="rm-notification-choice-card__mark" aria-hidden="true">✓</span>
  <strong>{template.label}</strong>
  <span>{manualTemplateDescriptions[template.eventType]}</span>
  {template.disabledReason ? (
    <span id={reasonId} className="rm-notification-choice-card__reason">
      {template.disabledReason}
    </span>
  ) : null}
</label>
```

Wrap template cards in a `fieldset` with a visible `legend` or section heading associated through `aria-labelledby`.

- [ ] **Step 4: Add workbench and choice-card base styles**

Define:

```css
.rm-notification-workbench__header,
.rm-notification-workbench__decision,
.rm-notification-workbench__decision-heading,
.rm-notification-workbench__summary {
  display: flex;
}

.rm-notification-workbench__header {
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.rm-notification-workbench__decision {
  display: grid;
  grid-template-columns: minmax(140px, 0.32fr) minmax(0, 1fr);
  gap: 24px;
  padding: 20px 0;
  border-bottom: 1px solid var(--line-soft);
}

.rm-notification-choice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.rm-notification-choice-card {
  position: relative;
  min-width: 0;
  min-height: 88px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  background: var(--bg);
  cursor: pointer;
}

.rm-notification-choice-card[data-selected="true"] {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
  background: color-mix(in oklch, var(--accent) 8%, var(--bg));
}

.rm-notification-choice-card[data-disabled="true"] {
  background: var(--bg-sub);
  color: var(--text-3);
  cursor: not-allowed;
}
```

Use an absolutely positioned transparent input that fills the label, and show the check mark only for `:checked`. Add `focus-visible` through `input:focus-visible` and never remove the native focus indication without a replacement.

- [ ] **Step 5: Run the workbench and copy tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/manual-notification-labels.test.ts \
  features/host/ui/notifications/manual-notification-workbench.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add front/features/host/ui/notifications/manual-notification-workbench.tsx \
  front/features/host/ui/notifications/manual-notification-workbench.test.tsx \
  front/src/styles/globals.css
git diff --cached --check
git commit -m "feat(front): guide manual notification setup"
```

---

### Task 4: Style Recipients, Channels, and Direct Member Selection

**Files:**

- Create: `front/features/host/ui/notifications/notification-recipient-picker.test.tsx`
- Modify: `front/features/host/ui/notifications/host-notification-composer.tsx:75-215`
- Modify: `front/features/host/ui/notifications/host-notification-composer.test.tsx:122-236`
- Modify: `front/features/host/ui/notifications/notification-recipient-picker.tsx:54-176`
- Modify: `front/src/styles/globals.css`

**Interfaces:**

- Consumes Task 1:

```ts
manualAudienceLabels
manualAudienceDescriptions
manualChannelLabels
manualChannelDescriptions
```

- Keeps `HostNotificationComposerProps` and `NotificationRecipientPickerProps` unchanged.
- Produces workbench-only:
  - Recipient radios named `notification-recipient-mode`
  - Channel radios named `notification-channel`
  - `추천` badge when an explicit audience equals `template.defaultAudience`
  - `기본` badge when a channel equals `template.defaultChannels`
  - Empty direct-selection help `한 명 이상 선택해 주세요.`
  - Summary `대상 · 채널 · 아직 발송되지 않음`
- Default dialog presentation keeps current `추천 대상 · 실제 대상` accessible names and layout.

- [ ] **Step 1: Write failing composer card tests**

Extend the local `renderComposer` test helper so a workbench fixture can pass the same allowed audience list as `ManualNotificationWorkbench`:

```tsx
import type {
  HostNotificationComposerDraft,
  HostNotificationRecipientMode,
} from "@/features/host/model/host-notification-composer-model";

function renderComposer({
  currentDraft = draft,
  preview = null,
  onDraftChange = vi.fn(),
  onConfirm = vi.fn(),
  presentation,
  recipientModes,
}: {
  currentDraft?: HostNotificationComposerDraft;
  preview?: ManualNotificationPreviewResponse | null;
  onDraftChange?: (next: HostNotificationComposerDraft) => void;
  onConfirm?: (resendConfirmed: boolean) => void;
  presentation?: "dialog" | "workbench";
  recipientModes?: readonly HostNotificationRecipientMode[];
} = {}) {
  render(
    <HostNotificationComposer
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
      presentation={presentation}
      recipientModes={recipientModes}
    />,
  );
  return { onDraftChange, onConfirm };
}
```

Add workbench-specific assertions:

```tsx
it("renders workbench recipients as concrete descriptive choices", () => {
  renderComposer({
    currentDraft: {
      ...draft,
      recipientMode: "CONFIRMED_ATTENDEES",
    },
    presentation: "workbench",
    recipientModes: [
      "ALL_ACTIVE_MEMBERS",
      "CONFIRMED_ATTENDEES",
      "SELECTED_MEMBERS",
    ],
  });

  const confirmed = screen.getByRole("radio", { name: "참석 확정자" });
  expect(confirmed).toBeChecked();
  expect(screen.getByText("이 회차 참석을 확정한 멤버")).toBeInTheDocument();
  expect(screen.getByText("추천")).toBeInTheDocument();
});

it("renders workbench channels as descriptive choices and a safe summary", () => {
  renderComposer({ presentation: "workbench" });

  expect(screen.getByRole("radio", { name: "앱 + 이메일" })).toBeChecked();
  expect(screen.getByText("가능한 두 채널 모두 사용")).toBeInTheDocument();
  expect(screen.getByText("아직 발송되지 않음")).toBeInTheDocument();
});

it("explains why direct selection cannot preview with zero members", () => {
  renderComposer({
    currentDraft: {
      ...draft,
      recipientMode: "SELECTED_MEMBERS",
      selectedMembershipIds: [],
    },
    presentation: "workbench",
  });

  expect(screen.getByText("한 명 이상 선택해 주세요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeDisabled();
});
```

Use a workbench fixture whose `allowedAudiences` contains `CONFIRMED_ATTENDEES` and `SELECTED_MEMBERS`. Preserve existing dialog-presentation assertions.

- [ ] **Step 2: Write failing recipient-picker tests**

Create `notification-recipient-picker.test.tsx`:

```tsx
it("shows selected members as removable chips and can clear all", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <NotificationRecipientPicker
      members={[memberOne, memberTwo]}
      selectedMembershipIds={[memberOne.membershipId, memberTwo.membershipId]}
      hasMore={false}
      busy={false}
      onSelectedMembershipIdsChange={onChange}
      onSearch={vi.fn().mockResolvedValue(undefined)}
      onLoadMore={vi.fn().mockResolvedValue(undefined)}
    />,
  );

  expect(screen.getByText("2명 선택됨")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `${memberOne.displayName} 선택 해제` }))
    .toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "전체 해제" }));
  expect(onChange).toHaveBeenCalledWith([]);
});

it("keeps full-row checkboxes and pagination accessible", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const onLoadMore = vi.fn().mockResolvedValue(undefined);
  renderPicker({ onChange, onLoadMore, hasMore: true });

  await user.click(screen.getByRole("checkbox", { name: /읽는 멤버/ }));
  expect(onChange).toHaveBeenCalledWith([memberOne.membershipId]);
  await user.click(screen.getByRole("button", { name: "멤버 더 보기" }));
  expect(onLoadMore).toHaveBeenCalledTimes(1);
});
```

Define `memberOne`, `memberTwo`, and `renderPicker` in the test with masked `example.com` addresses.

- [ ] **Step 3: Run both tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/host-notification-composer.test.tsx \
  features/host/ui/notifications/notification-recipient-picker.test.tsx
```

Expected: FAIL because workbench choices have no descriptions/badges/summary and the picker has no chip classes.

- [ ] **Step 4: Implement workbench-only recipient and channel cards**

Keep the existing dialog branch. For workbench mode, resolve concrete labels:

```tsx
const recipientLabel = (mode: HostNotificationRecipientMode) =>
  mode === "RECOMMENDED"
    ? recommendedRecipientLabel
    : manualAudienceLabels[mode];

const recipientDescription = (mode: HostNotificationRecipientMode) =>
  mode === "RECOMMENDED"
    ? `현재 알림에 맞는 추천 대상 · ${recommendedRecipientLabel}`
    : manualAudienceDescriptions[mode];
```

For each workbench recipient:

```tsx
const recommended = mode !== "RECOMMENDED"
  && mode === template?.defaultAudience;

<label
  className="rm-notification-choice-card"
  data-selected={draft.recipientMode === mode ? "true" : "false"}
>
  <input
    type="radio"
    name="notification-recipient-mode"
    aria-label={recipientLabel(mode)}
    checked={draft.recipientMode === mode}
    onChange={() => updateDraft({ recipientMode: mode })}
  />
  {recommended ? <span className="badge">추천</span> : null}
  <strong>{recipientLabel(mode)}</strong>
  <span>{recipientDescription(mode)}</span>
</label>
```

Render channel cards the same way with `manualChannelLabels`, `manualChannelDescriptions`, and `기본` when `value === template?.defaultChannels`.

Compute the summary:

```tsx
const selectedRecipientLabel = draft.recipientMode === "SELECTED_MEMBERS"
  ? `직접 선택 ${draft.selectedMembershipIds.length}명`
  : recipientLabel(draft.recipientMode);
const selectedChannelLabel = manualChannelLabels[draft.requestedChannels];
const directSelectionEmpty = draft.recipientMode === "SELECTED_MEMBERS"
  && draft.selectedMembershipIds.length === 0;
```

Render `한 명 이상 선택해 주세요.` near the disabled preview action and `아직 발송되지 않음` in an `aria-live="polite"` summary.

- [ ] **Step 5: Restyle the recipient picker without changing callbacks**

Replace inline surface styles with namespaced classes:

```tsx
<section className="rm-notification-recipient-picker" ...>
  <header className="rm-notification-recipient-picker__header">...</header>
  <div className="rm-notification-recipient-picker__chips">
    {selectedMembers.map((member) => (
      <button
        key={member.membershipId}
        type="button"
        className="rm-notification-recipient-picker__chip"
        aria-label={`${member.displayName} 선택 해제`}
        onClick={() => toggle(member.membershipId)}
      >
        <span>{member.displayName}</span>
        <span aria-hidden="true">×</span>
      </button>
    ))}
  </div>
  {/* existing search form */}
  <div className="rm-notification-recipient-picker__results">
    {/* existing checkbox labels with the row class */}
  </div>
</section>
```

Keep `maskedEmail`, selected count, `전체 해제`, search submit, empty result, and `멤버 더 보기`.

- [ ] **Step 6: Add card, picker, summary, focus, and mobile styles**

Extend the Task 3 choice-card CSS. Add:

```css
.rm-notification-recipient-picker {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-2);
  background: var(--bg-sub);
}

.rm-notification-recipient-picker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rm-notification-recipient-picker__chip {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text);
}

.rm-notification-recipient-picker__row {
  min-height: 52px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-2);
  background: var(--bg);
  cursor: pointer;
}

.rm-notification-workbench__summary {
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 18px;
}
```

At `max-width: 760px`, set choice grids to one column, make the summary vertical, and give the primary button `min-height: 44px; width: 100%`.

- [ ] **Step 7: Run composer, picker, and workbench tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/host-notification-composer.test.tsx \
  features/host/ui/notifications/notification-recipient-picker.test.tsx \
  features/host/ui/notifications/manual-notification-workbench.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add front/features/host/ui/notifications/host-notification-composer.tsx \
  front/features/host/ui/notifications/host-notification-composer.test.tsx \
  front/features/host/ui/notifications/notification-recipient-picker.tsx \
  front/features/host/ui/notifications/notification-recipient-picker.test.tsx \
  front/src/styles/globals.css
git diff --cached --check
git commit -m "feat(front): clarify notification recipients and channels"
```

---

### Task 5: Refine Preview Counts, Errors, and Explicit Confirmation

**Files:**

- Create: `front/features/host/ui/notifications/manual-notification-preview.test.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-preview.tsx:4-109`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx:267-299`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**

- Extends `ManualNotificationPreviewConfirmationProps`:

```ts
error?: string | null;
onRefreshPreview?: () => Promise<unknown> | void;
```

- Extends the internal `ManualNotificationPreviewPanel` arguments with the same `error` and `onRefreshPreview`.
- Produces in side-sheet mode:
  - Three count cards: final target, app eligible, email eligible
  - Message subject/body panel
  - Warning list
  - Inline confirm error
  - `미리보기 다시 만들기` when `error` is present
  - Disabled final confirm while `error` is present
- Centered presentation continues to use `발송 확인` and its current heading.

- [ ] **Step 1: Write failing preview tests**

Create `manual-notification-preview.test.tsx`:

```tsx
it("renders server-calculated counts and message content in side-sheet mode", () => {
  render(
    <ManualNotificationPreviewConfirmation
      preview={previewFixture}
      busy={false}
      presentation="side-sheet"
      onConfirm={vi.fn()}
    />,
  );

  expect(screen.getByText("최종 대상")).toBeInTheDocument();
  expect(screen.getByText("앱 알림 가능")).toBeInTheDocument();
  expect(screen.getByText("이메일 가능")).toBeInTheDocument();
  expect(screen.getByText(previewFixture.template.subject)).toBeInTheDocument();
  expect(screen.getByText(previewFixture.template.bodyPreview)).toBeInTheDocument();
});

it("keeps a failed confirmation visible and requires a new preview", async () => {
  const user = userEvent.setup();
  const onRefreshPreview = vi.fn().mockResolvedValue(undefined);
  render(
    <ManualNotificationPreviewConfirmation
      preview={previewFixture}
      busy={false}
      presentation="side-sheet"
      error="발송을 요청하지 못했습니다. 미리보기를 다시 확인해 주세요."
      onRefreshPreview={onRefreshPreview}
      onConfirm={vi.fn()}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("발송을 요청하지 못했습니다");
  expect(screen.getByRole("button", { name: /명에게 알림 발송/ })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "미리보기 다시 만들기" }));
  expect(onRefreshPreview).toHaveBeenCalledTimes(1);
});

it("still requires explicit duplicate resend confirmation", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  renderPreview({ preview: duplicatePreview, onConfirm });

  const send = screen.getByRole("button", { name: /명에게 알림 발송/ });
  expect(send).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "재발송을 확인했습니다" }));
  await user.click(send);
  expect(onConfirm).toHaveBeenCalledWith(true);
});
```

Define fixtures with future-independent values; do not derive client expiry from wall-clock time.

- [ ] **Step 2: Add a failing workbench error-handoff test**

Add:

```tsx
it("shows confirm errors inside the open side sheet and can refresh", async () => {
  const user = userEvent.setup();
  const onPreview = vi.fn().mockResolvedValue(undefined);
  renderWorkbench({
    preview: previewFixture,
    error: "발송을 요청하지 못했습니다. 미리보기를 다시 확인해 주세요.",
    onPreview,
  });

  const dialog = screen.getByRole("dialog", { name: "발송 전 확인" });
  expect(within(dialog).getByRole("alert")).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "미리보기 다시 만들기" }));
  expect(onPreview).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run preview/workbench tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/manual-notification-preview.test.tsx \
  features/host/ui/notifications/manual-notification-workbench.test.tsx
```

Expected: FAIL because preview error/refresh props and count-card labels do not exist.

- [ ] **Step 4: Implement side-sheet preview states**

Use namespaced markup:

```tsx
<section
  className={`rm-notification-preview rm-notification-preview--${presentation}`}
  aria-label={showTitle ? undefined : "발송 전 확인"}
  aria-labelledby={showTitle ? "manual-notification-preview-title" : undefined}
>
  <dl className="rm-notification-preview__counts">
    <div><dt>최종 대상</dt><dd>{preview.audience.finalTargetCount}명</dd></div>
    <div><dt>앱 알림 가능</dt><dd>{preview.channels.inAppEligibleCount}명</dd></div>
    <div><dt>이메일 가능</dt><dd>{preview.channels.emailEligibleCount}명</dd></div>
  </dl>
  <div className="rm-notification-preview__message">
    <span>{preview.template.label}</span>
    <strong>{preview.template.subject}</strong>
    <p>{preview.template.bodyPreview}</p>
  </div>
  {preview.warnings.map((warning) => (
    <p key={warning.code} role="status" className="rm-notification-preview__warning">
      {warning.message}
    </p>
  ))}
  {error ? (
    <div className="rm-notification-preview__error">
      <p role="alert">{error}</p>
      {onRefreshPreview ? (
        <button type="button" className="btn btn-quiet btn-sm"
          onClick={() => void onRefreshPreview()}>
          미리보기 다시 만들기
        </button>
      ) : null}
    </div>
  ) : null}
</section>
```

Set final disabled state to:

```ts
disabled={busy || Boolean(error) || (requiresResend && !resendConfirmed)}
```

Pass `error={error ?? memberError}` and `onRefreshPreview={() => onPreview(buildOperationsSelection())}` from `ManualNotificationWorkbench`.

- [ ] **Step 5: Add side-sheet preview styling**

Add:

```css
.rm-notification-preview__counts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.rm-notification-preview__counts > div,
.rm-notification-preview__message,
.rm-notification-preview__warning,
.rm-notification-preview__error {
  padding: 12px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-2);
  background: var(--bg-sub);
}

.rm-notification-preview__message,
.rm-notification-preview__warning,
.rm-notification-preview__error {
  margin-top: 12px;
}

.rm-notification-preview__error {
  border-color: color-mix(in oklch, var(--danger) 35%, var(--line));
}
```

At mobile width, keep three compact count cards if they fit without overflow; otherwise switch to one column. The final send button must be full width and at least 44px high.

- [ ] **Step 6: Run preview, workbench, and composer tests**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/manual-notification-preview.test.tsx \
  features/host/ui/notifications/manual-notification-workbench.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add front/features/host/ui/notifications/manual-notification-preview.tsx \
  front/features/host/ui/notifications/manual-notification-preview.test.tsx \
  front/features/host/ui/notifications/manual-notification-workbench.tsx \
  front/features/host/ui/notifications/manual-notification-workbench.test.tsx \
  front/src/styles/globals.css
git diff --cached --check
git commit -m "feat(front): clarify notification preview states"
```

---

### Task 6: Integrate Responsive Behavior, E2E Evidence, and Release Notes

**Files:**

- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/unit/host-notifications.test.tsx`
- Modify: `front/tests/e2e/manual-notifications.spec.ts`
- Modify: `CHANGELOG.md:7-12`

**Interfaces:**

- Consumes all Task 1–5 semantics.
- Preserves all API request bodies and route callbacks.
- Produces:
  - Desktop, tablet, and mobile responsive layout
  - Keyboard-visible focus and reduced-motion behavior
  - Updated unit/E2E selectors for `switch` and template `radio`
  - Browser evidence at 1440×1000, 900×900, and 390×844
  - One `Unreleased` changelog entry

- [ ] **Step 1: Update route/page unit assertions before product integration checks**

Replace template button/plain checkbox role queries:

```tsx
const reminderPolicy = screen.getByRole("switch", {
  name: "모임 전날 자동 리마인더",
});
const reminderTemplate = screen.getByRole("radio", {
  name: "모임 전날 리마인더",
});
expect(reminderPolicy).not.toBeChecked();
expect(reminderTemplate).toBeChecked();
expect(screen.queryByText(/OPEN|HOST_ONLY/)).not.toBeInTheDocument();
```

Retain assertions that:

- changing session/options invalidates preview;
- zero selected members disables preview;
- confirm success closes preview and refreshes the recent ledger;
- confirm failure keeps the side sheet open;
- no dismiss path invokes confirm.

- [ ] **Step 2: Run the route/page test and fix only presentation assertions**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: PASS after selector/copy updates. Any API payload or query invalidation failure is not a presentation assertion and must be fixed without changing contracts.

- [ ] **Step 3: Update E2E selectors and add visible-state evidence**

Replace every template selector:

```ts
await page.getByRole("radio", { name: "모임 전날 리마인더" }).check();
```

Replace the policy selector:

```ts
const policyToggle = page.getByRole("switch", {
  name: "모임 전날 자동 리마인더",
});
await expect(policyToggle).toBeEnabled();
await expect(policyToggle).not.toBeChecked();
```

In the workbench-open test, add:

```ts
await expect(page.getByText(
  "선택만으로는 발송되지 않습니다. 미리보기에서 최종 확인합니다.",
)).toBeVisible();
await expect(page.getByText("미리보기 후 발송")).toBeVisible();
await expect(page.getByRole("radio", { name: "앱 + 이메일" })).toBeChecked();
```

Keep database-side no-send assertions before and after preview close, `Escape`, backdrop, navigation, and before explicit confirm.

- [ ] **Step 4: Complete responsive and reduced-motion CSS**

At `max-width: 900px`:

```css
.rm-notification-workbench__decision {
  grid-template-columns: 1fr;
  gap: 12px;
}

.rm-notification-choice-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
```

At `max-width: 600px`:

```css
.rm-host-notifications-policy {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.rm-notification-choice-grid,
.rm-notification-preview__counts {
  grid-template-columns: 1fr;
}

.rm-notification-choice-card,
.rm-notification-recipient-picker__row {
  min-height: 52px;
}

.rm-notification-workbench__summary {
  align-items: stretch;
  flex-direction: column;
}

.rm-notification-workbench__summary .btn-primary,
.rm-notification-preview--side-sheet .btn-primary {
  min-height: 44px;
  width: 100%;
}
```

Add:

```css
@media (prefers-reduced-motion: reduce) {
  .rm-host-notifications-policy__track,
  .rm-host-notifications-policy__thumb,
  .rm-notification-choice-card {
    transition: none;
  }
}
```

Do not apply sticky mobile summary until browser inspection proves it does not cover content or the software keyboard.

- [ ] **Step 5: Add the Unreleased changelog entry**

Replace the placeholder-only `Unreleased` highlights with the existing placeholder plus this bullet:

```markdown
- **호스트 알림 발송 UI:** 자동 리마인더를 상태 문구가 있는 ON/OFF switch로 정리하고, 수동 발송의 알림 종류·대상·채널을 설명형 선택 카드와 최종 요약으로 개편했습니다. 기존 미리보기 후 명시적 발송, 중복 재발송 확인, 기본 OFF 정책은 유지합니다.
```

- [ ] **Step 6: Run the focused frontend test set**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/host/ui/notifications/manual-notification-labels.test.ts \
  features/host/ui/notifications/host-notification-operations-rail.test.tsx \
  features/host/ui/notifications/manual-notification-workbench.test.tsx \
  features/host/ui/notifications/host-notification-composer.test.tsx \
  features/host/ui/notifications/notification-recipient-picker.test.tsx \
  features/host/ui/notifications/manual-notification-preview.test.tsx \
  tests/unit/host-notifications.test.tsx \
  tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run canonical frontend gates**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all PASS.

- [ ] **Step 8: Run the full notification E2E lane**

Run:

```bash
corepack pnpm --dir front test:e2e
```

Expected: PASS, including policy opt-in, direct member selection, preview dismissal no-send, explicit confirm, and duplicate resend confirmation.

- [ ] **Step 9: Inspect the real page at desktop, tablet, and mobile widths**

Use the authenticated test/local environment without stopping an existing service.

Check 1440×1000:

- policy title, description, state text, and switch align as one control;
- three workbench sections read in order;
- template, recipient, and channel cards use the available width without dashboard-like empty columns;
- preview side sheet shows counts, message, warning, and final action.

Check 900×900:

- section headings stack above controls;
- two-column choice grids wrap without clipped Korean copy.

Check 390×844:

- no horizontal overflow;
- policy copy and switch do not collide;
- all choice cards and buttons are at least 44px high;
- member chips wrap;
- side sheet remains dismissible and its final button is reachable above the safe area.

Verify with:

```js
document.documentElement.scrollWidth <= window.innerWidth
```

Tab through the switch, session select, every radio group, member search/results, preview action, side-sheet close, resend checkbox, and final action. Save screenshots only as untracked verification artifacts; do not commit them.

- [ ] **Step 10: Run final repository checks**

Run:

```bash
git diff --check
git status --short --branch
```

Review the diff to confirm only the declared frontend files and `CHANGELOG.md` changed. Do not run server or public-release gates because no server, BFF, deploy, scanner, or public-release contract changed.

- [ ] **Step 11: Commit Task 6**

```bash
git add front/src/styles/globals.css \
  front/tests/unit/host-notifications.test.tsx \
  front/tests/e2e/manual-notifications.spec.ts \
  CHANGELOG.md
git diff --cached --check
git commit -m "test(front): verify notification operations redesign"
```

- [ ] **Step 12: Produce the implementation handoff**

Report:

- changed surface: host notification operations/manual dispatch UI;
- commit list from Tasks 1–6;
- exact focused, lint, test, build, and E2E commands run;
- desktop/tablet/mobile browser evidence;
- skipped checks and reasons;
- remaining risk, especially shared composer isolation and mobile keyboard/safe-area behavior;
- local branch/ahead state and whether push, PR, tag, or deploy was not authorized.
