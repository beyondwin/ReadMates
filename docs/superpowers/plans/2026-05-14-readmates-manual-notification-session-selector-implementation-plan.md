# Manual Notification Session Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw manual notification `세션 ID` field with a host session selector that works from the mobile bottom-tab entry point and automatically selects the first `OPEN` session when no valid URL session is present.

**Architecture:** Keep the change frontend-focused. The route loader fetches host sessions, derives the initial selected session before loading manual options, and the UI renders a responsive selector plus selected-session summary inside the existing manual notification workbench. The server API and manual notification domain rules stay unchanged.

**Tech Stack:** React 19, React Router 7 loaders, Vite, TypeScript, Vitest/Testing Library, Playwright E2E, existing Spring Boot host session and manual notification APIs.

---

## File Structure

- Modify `front/features/host/route/host-notifications-data.ts`
  - Import `fetchHostSessions`.
  - Add `hostSessions` to `HostNotificationsRouteData`.
  - Add a pure helper for initial session selection.
  - Load `manualOptions` with the resolved initial session ID, not the raw URL value.

- Modify `front/features/host/route/host-notifications-route.tsx`
  - Pass `data.hostSessions.items` into `HostNotificationsPage`.
  - Preserve existing paging state for notification events, deliveries, audit, and manual dispatches.

- Modify `front/features/host/ui/host-notifications-page.tsx`
  - Add `hostSessions` prop.
  - Pass sessions into `ManualNotificationWorkbench`.
  - Clear current preview and surface inline errors when session changes fail.

- Modify `front/features/host/ui/notifications/manual-notification-workbench.tsx`
  - Replace the raw text input with a select control.
  - Render selected-session summary with responsive layout.
  - Invoke `onLoadManualOptions` when the selected session changes.
  - Disable preview when no session is selected.

- Modify `front/tests/unit/host-notifications.test.tsx`
  - Add fixture host sessions.
  - Cover selector rendering, default selection, selection change reload, empty sessions, and loader fallback.

- Modify `front/tests/e2e/manual-notifications.spec.ts`
  - Add an E2E flow that enters from `/app/host/notifications` without a `sessionId`, uses the auto-selected `OPEN` session, and previews.
  - Add a flow that changes the selected session before preview.

## Task 1: Route Loader Chooses a Usable Initial Session

**Files:**
- Modify: `front/features/host/route/host-notifications-data.ts`
- Test: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add failing loader tests**

Append loader tests to `front/tests/unit/host-notifications.test.tsx`. Import `hostNotificationsLoader` and `type LoaderFunctionArgs` at the top:

```ts
import type { LoaderFunctionArgs } from "react-router-dom";
import { hostNotificationsLoader } from "@/features/host/route/host-notifications-data";
```

Add these fixtures near `manualOptionsFixture`:

```ts
const hostSessionOpen = {
  sessionId: "session-open",
  sessionNumber: 9,
  title: "9회차 모임",
  bookTitle: "돈의 심리학",
  bookAuthor: "모건 하우절",
  bookImageUrl: null,
  date: "2026-07-15",
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  state: "OPEN",
  visibility: "MEMBER",
} as const;

const hostSessionDraft = {
  ...hostSessionOpen,
  sessionId: "session-draft",
  sessionNumber: 10,
  title: "10회차 모임",
  bookTitle: "다음 책",
  date: "2026-08-19",
  state: "DRAFT",
} as const;
```

Add a small response helper if the file does not already have one:

```ts
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

Add this test:

```ts
it("loads manual options for the first open host session when the URL has no session id", async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse({
        authenticated: true,
        userId: "user-host",
        membershipId: "membership-host",
        clubId: "club-1",
        email: "host@example.com",
        displayName: "호스트",
        accountName: "호",
        role: "HOST",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
      }));
    }
    if (url === "/api/bff/api/host/notifications/summary?clubSlug=reading-sai") return Promise.resolve(jsonResponse(summary));
    if (url === "/api/bff/api/host/notifications/events?clubSlug=reading-sai&limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    if (url === "/api/bff/api/host/notifications/deliveries?clubSlug=reading-sai&limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    if (url === "/api/bff/api/host/notifications/test-mail/audit?clubSlug=reading-sai&limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    if (url === "/api/bff/api/host/sessions?clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse({ items: [hostSessionDraft, hostSessionOpen], nextCursor: null }));
    }
    if (url === "/api/bff/api/host/notifications/manual/options?sessionId=session-open&clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse({ ...manualOptionsFixture, session: { ...manualOptionsFixture.session, sessionId: "session-open" } }));
    }
    if (url === "/api/bff/api/host/notifications/manual/dispatches?clubSlug=reading-sai&limit=20") {
      return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);

  await expect(hostNotificationsLoader({
    params: { clubSlug: "reading-sai" },
    request: new Request("https://readmates.test/clubs/reading-sai/app/host/notifications"),
  } as LoaderFunctionArgs)).resolves.toMatchObject({
    hostSessions: { items: [hostSessionDraft, hostSessionOpen], nextCursor: null },
    initialManualSelection: { sessionId: "session-open", eventType: null },
  });
});
```

Add this second test:

```ts
it("falls back from an unknown URL session id before loading manual options", async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse({
        authenticated: true,
        userId: "user-host",
        membershipId: "membership-host",
        clubId: "club-1",
        email: "host@example.com",
        displayName: "호스트",
        accountName: "호",
        role: "HOST",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
      }));
    }
    if (url === "/api/bff/api/host/notifications/summary?clubSlug=reading-sai") return Promise.resolve(jsonResponse(summary));
    if (url === "/api/bff/api/host/notifications/events?clubSlug=reading-sai&limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    if (url === "/api/bff/api/host/notifications/deliveries?clubSlug=reading-sai&limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    if (url === "/api/bff/api/host/notifications/test-mail/audit?clubSlug=reading-sai&limit=50") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    if (url === "/api/bff/api/host/sessions?clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse({ items: [hostSessionOpen], nextCursor: null }));
    }
    if (url === "/api/bff/api/host/notifications/manual/options?sessionId=session-open&clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse({ ...manualOptionsFixture, session: { ...manualOptionsFixture.session, sessionId: "session-open" } }));
    }
    if (url === "/api/bff/api/host/notifications/manual/dispatches?clubSlug=reading-sai&limit=20") {
      return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);

  await hostNotificationsLoader({
    params: { clubSlug: "reading-sai" },
    request: new Request("https://readmates.test/clubs/reading-sai/app/host/notifications?sessionId=missing"),
  } as LoaderFunctionArgs);

  expect(fetchMock).not.toHaveBeenCalledWith(
    expect.stringContaining("sessionId=missing"),
    expect.anything(),
  );
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: FAIL because `hostNotificationsLoader` does not fetch `/api/host/sessions`, does not return `hostSessions`, and still uses the raw URL `sessionId`.

- [ ] **Step 3: Implement loader session selection**

In `front/features/host/route/host-notifications-data.ts`, import `fetchHostSessions` and `HostSessionListPage`, add `hostSessions`, and add this helper:

```ts
function selectInitialManualSessionId(requestedSessionId: string | null, hostSessions: HostSessionListPage) {
  if (requestedSessionId && hostSessions.items.some((session) => session.sessionId === requestedSessionId)) {
    return requestedSessionId;
  }

  return hostSessions.items.find((session) => session.state === "OPEN")?.sessionId
    ?? hostSessions.items[0]?.sessionId
    ?? null;
}
```

Change `hostNotificationsLoader` so non-manual data and `hostSessions` load first, then `manualOptions` uses the selected session:

```ts
const [summary, events, deliveries, audit, hostSessions, manualDispatches] = await Promise.all([
  fetchHostNotificationSummary(context),
  fetchHostNotificationEvents(context, { limit: 50 }),
  fetchHostNotificationDeliveries(context, { limit: 50 }),
  fetchHostNotificationTestMailAudit(context, { limit: 50 }),
  fetchHostSessions(context),
  fetchManualNotificationDispatches(context, { page: { limit: 20 } }),
]);
const selectedSessionId = selectInitialManualSessionId(sessionId, hostSessions);
const manualOptions = await fetchManualNotificationOptions(context, { sessionId: selectedSessionId ?? undefined });
```

Return `hostSessions` and set `initialManualSelection.sessionId` to `selectedSessionId`.

- [ ] **Step 4: Run the focused tests and verify pass**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: PASS for the loader tests and existing host notification tests.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/route/host-notifications-data.ts front/tests/unit/host-notifications.test.tsx
git commit -m "feat: choose manual notification session in loader"
```

## Task 2: Render Responsive Session Selector in the Workbench

**Files:**
- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add failing UI tests**

Extend `renderPage` in `front/tests/unit/host-notifications.test.tsx` to accept `hostSessions = [hostSessionOpen, hostSessionDraft]` and pass it to `HostNotificationsPage`.

Add:

```ts
it("renders a session selector instead of a raw session id field", () => {
  renderPage();

  expect(screen.getByLabelText("세션 선택")).toHaveValue("session-1");
  expect(screen.queryByLabelText("세션 ID")).not.toBeInTheDocument();
  expect(screen.getByText("Example Book")).toBeInTheDocument();
  expect(screen.getByText(/OPEN/)).toBeInTheDocument();
});
```

Add:

```ts
it("disables manual preview when there are no host sessions", () => {
  renderPage({
    hostSessions: [],
    manualOptions: { ...manualOptionsFixture, session: null },
    initialManualSelection: { sessionId: null, eventType: null },
  });

  expect(screen.getByText("선택 가능한 세션이 없습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "미리보기" })).toBeDisabled();
});
```

This requires extending `renderPage` options with `hostSessions` and `initialManualSelection`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: FAIL because `HostNotificationsPage` and `ManualNotificationWorkbench` do not accept `hostSessions`, and the UI still renders `세션 ID`.

- [ ] **Step 3: Add props and replace the input**

In `HostNotificationsPageProps`, add:

```ts
hostSessions: HostSessionListItem[];
```

Import `HostSessionListItem` from `@/features/host/model/host-view-types` or the existing host contract module used in the file. Pass `hostSessions` into `ManualNotificationWorkbench`.

In `ManualNotificationWorkbench`, add props:

```ts
hostSessions: HostSessionListItem[];
onSessionChange?: (sessionId: string) => Promise<ManualNotificationOptionsResponse>;
```

Replace the raw input with:

```tsx
<section aria-labelledby="manual-step-session">
  <label id="manual-step-session" className="label" htmlFor="manual-notification-session">
    세션 선택
  </label>
  <select
    id="manual-notification-session"
    className="input"
    value={selection.sessionId}
    onChange={(event) => void handleSessionChange(event.currentTarget.value)}
    disabled={busy || hostSessions.length === 0}
  >
    {hostSessions.map((session) => (
      <option key={session.sessionId} value={session.sessionId}>
        {`${session.sessionNumber}회차 · ${session.bookTitle} · ${session.date}`}
      </option>
    ))}
  </select>
  {hostSessions.length === 0 ? (
    <p className="tiny muted" style={{ margin: "8px 0 0" }}>
      선택 가능한 세션이 없습니다.
    </p>
  ) : null}
  {selectedSession ? (
    <div className="surface-subtle" style={{ marginTop: 10, padding: 12 }}>
      <strong>{`${selectedSession.sessionNumber}회차 · ${selectedSession.bookTitle}`}</strong>
      <p className="tiny muted" style={{ margin: "4px 0 0" }}>
        {`${selectedSession.date} · ${selectedSession.state} · ${selectedSession.visibility}${sessionHint ? ` · ${sessionHint}` : ""}`}
      </p>
    </div>
  ) : null}
</section>
```

Add computed `selectedSession`:

```ts
const selectedSession = useMemo(
  () => hostSessions.find((session) => session.sessionId === selection.sessionId) ?? null,
  [hostSessions, selection.sessionId],
);
```

Make `canPreview` depend on `selectedSession`:

```ts
const canPreview = Boolean(selectedSession && currentTemplate?.enabled && !busy);
```

- [ ] **Step 4: Run the focused tests and verify pass**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: PASS for selector rendering and existing manual preview tests.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/host-notifications-page.tsx front/features/host/ui/notifications/manual-notification-workbench.tsx front/tests/unit/host-notifications.test.tsx
git commit -m "feat: render manual notification session selector"
```

## Task 3: Reload Manual Options When the Selected Session Changes

**Files:**
- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- Modify: `front/features/host/route/host-notifications-route.tsx`
- Test: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add failing interaction tests**

Add:

```ts
it("reloads manual options when the host changes the selected session", async () => {
  const user = userEvent.setup();
  const nextOptions = {
    ...manualOptionsFixture,
    session: {
      ...manualOptionsFixture.session!,
      sessionId: "session-draft",
      sessionNumber: 10,
      bookTitle: "다음 책",
      date: "2026-08-19",
      state: "DRAFT",
    },
  } as ManualNotificationOptionsResponse;
  const onLoadManualOptions = vi.fn().mockResolvedValue(nextOptions);

  renderPage({ onLoadManualOptions });

  await user.selectOptions(screen.getByLabelText("세션 선택"), "session-draft");

  expect(onLoadManualOptions).toHaveBeenCalledWith("session-draft", undefined);
  expect(await screen.findByText("다음 책")).toBeInTheDocument();
});
```

Add:

```ts
it("shows an inline error when changing sessions cannot reload manual options", async () => {
  const user = userEvent.setup();
  const onLoadManualOptions = vi.fn().mockRejectedValue(new Error("network failed"));

  renderPage({ onLoadManualOptions });

  await user.selectOptions(screen.getByLabelText("세션 선택"), "session-draft");

  expect(await screen.findByRole("alert")).toHaveTextContent("세션 정보를 불러오지 못했습니다.");
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: FAIL because the selector change does not yet call the manual options loader and no inline error is set.

- [ ] **Step 3: Implement session change reload**

In `HostNotificationsPage`, add a handler:

```ts
const handleManualSessionChange = async (sessionId: string) => {
  if (!onLoadManualOptions) return visibleManualOptions;
  setManualBusy(true);
  setManualError(null);
  setManualPreview(null);
  try {
    const nextOptions = await onLoadManualOptions(sessionId, undefined);
    setManualOptionsState((current) => ({
      ...current,
      value: nextOptions,
    }));
    return nextOptions;
  } catch (error) {
    setManualError("세션 정보를 불러오지 못했습니다.");
    throw error;
  } finally {
    setManualBusy(false);
  }
};
```

Pass `onSessionChange={handleManualSessionChange}` to `ManualNotificationWorkbench`.

In `ManualNotificationWorkbench`, add:

```ts
const handleSessionChange = async (sessionId: string) => {
  setSelection((current) => ({
    ...current,
    sessionId,
    excludedMembershipIds: [],
    includedMembershipIds: [],
  }));
  setMemberSearch("");
  setResendConfirmed(false);
  if (!onSessionChange) return;
  await onSessionChange(sessionId);
};
```

In `HostNotificationsRoute`, pass `hostSessions={data.hostSessions.items}` to the page.

- [ ] **Step 4: Run focused tests and verify pass**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/ui/host-notifications-page.tsx front/features/host/ui/notifications/manual-notification-workbench.tsx front/features/host/route/host-notifications-route.tsx front/tests/unit/host-notifications.test.tsx
git commit -m "feat: reload manual notification options by session"
```

## Task 4: Cover the Real Host Flow in E2E

**Files:**
- Modify: `front/tests/e2e/manual-notifications.spec.ts`
- Modify: `front/tests/e2e/readmates-e2e-db.ts`

- [ ] **Step 1: Add failing E2E coverage for bottom-tab entry**

Add this test to `front/tests/e2e/manual-notifications.spec.ts`:

```ts
test("host can preview a manual reminder from the notifications tab without typing a session id", async ({ page }) => {
  const sessionId = createOpenSessionFixture();

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/clubs/reading-sai/app/host/notifications");

  await expect(page.getByLabel("세션 선택")).toBeVisible();
  await expect(page.getByLabel("세션 선택")).toHaveValue(sessionId);
  await expect(page.getByText("E2E 현재 세션 책")).toBeVisible();

  await page.getByRole("button", { name: "모임 전날 리마인더" }).click();
  await page.getByRole("button", { name: "미리보기" }).click();

  await expect(page.getByRole("heading", { name: "발송 전 확인" })).toBeVisible();
  await expect(page.getByText(/최종 대상/)).toBeVisible();
});
```

- [ ] **Step 2: Add failing E2E coverage for changing sessions**

If `createOpenSessionFixture` always creates the same `number`, add an optional parameter so it can create a second deterministic session:

```ts
export function createOpenSessionFixture({
  number = 7,
  bookTitle = "E2E 현재 세션 책",
}: { number?: number; bookTitle?: string } = {}) {
  const sessionId = randomUUID();
  // keep the existing insert, but use number and bookTitle in the values list
  return sessionId;
}
```

Then add:

```ts
test("host can change the selected session before previewing a manual reminder", async ({ page }) => {
  createOpenSessionFixture({ number: 7, bookTitle: "E2E 첫 세션 책" });
  const secondSessionId = createOpenSessionFixture({ number: 8, bookTitle: "E2E 두 번째 세션 책" });

  await loginWithGoogleFixture(page, "host@example.com");
  await page.goto("/clubs/reading-sai/app/host/notifications");

  await page.getByLabel("세션 선택").selectOption(secondSessionId);
  await expect(page.getByText("E2E 두 번째 세션 책")).toBeVisible();

  await page.getByRole("button", { name: "모임 전날 리마인더" }).click();
  await page.getByRole("button", { name: "미리보기" }).click();

  await expect(page.getByRole("heading", { name: "발송 전 확인" })).toBeVisible();
});
```

- [ ] **Step 3: Run E2E and verify failure, then adjust fixture if necessary**

Run:

```bash
pnpm --dir front exec playwright test tests/e2e/manual-notifications.spec.ts
```

Expected before implementation from Tasks 1-3: FAIL because `세션 선택` does not exist. Expected after Tasks 1-3: PASS, except the second test may require the optional fixture parameter.

- [ ] **Step 4: Commit**

```bash
git add front/tests/e2e/manual-notifications.spec.ts front/tests/e2e/readmates-e2e-db.ts
git commit -m "test: cover manual notification session selector e2e"
```

## Task 5: Full Frontend Verification and Responsive Check

**Files:**
- No source edits expected unless verification finds a regression.

- [ ] **Step 1: Run focused unit tests**

```bash
pnpm --dir front exec vitest run tests/unit/host-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run frontend checks required by the agent guide**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all PASS.

- [ ] **Step 3: Run the manual notifications E2E**

```bash
pnpm --dir front exec playwright test tests/e2e/manual-notifications.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Run browser smoke checks for desktop and mobile**

Use the existing local app at `http://localhost:5173/clubs/reading-sai/app/host/notifications`.

Desktop checks:
- `새 알림 발송` is visible.
- `세션 선택` is visible.
- The selected session summary shows number, book title, date, state, visibility, and D-day text when applicable.
- `세션 ID` is not visible.

Mobile checks:
- Set viewport to a mobile width in the browser tool or Playwright.
- `세션 선택` and selected-session summary stack vertically.
- Text does not overlap the template buttons or `미리보기` button.

- [ ] **Step 5: Final diff check**

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 6: Commit any verification fixes**

Only if Step 1-5 required edits:

```bash
git add front/features/host front/tests/unit/host-notifications.test.tsx front/tests/e2e/manual-notifications.spec.ts front/tests/e2e/readmates-e2e-db.ts
git commit -m "fix: polish manual notification session selector"
```

## Self-Review

- Spec coverage:
  - Bottom-tab entry without session ID is covered by loader default selection and E2E.
  - Mobile and desktop selected-session clarity is covered by UI summary and responsive smoke checks.
  - URL `sessionId` compatibility is covered by loader tests and existing E2E URL flow.
  - Session changes reloading template/member state is covered by unit tests.
  - Raw session ID input removal is covered by UI tests.

- Placeholder scan:
  - No unresolved planning markers are used.
  - Code steps name exact files, props, helper names, and commands.

- Type consistency:
  - `HostSessionListItem`, `HostSessionListPage`, `ManualNotificationOptionsResponse`, and `initialManualSelection.sessionId` match existing frontend contracts.
  - The session selector uses `session.sessionId` as the option value and calls existing `onLoadManualOptions(sessionId, undefined)`.
