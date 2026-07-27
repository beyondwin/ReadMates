# Member Notification Inbox Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized, mixed-language member notification cards with a compact, Korean-first editorial list while preserving read mutations, pagination, safe links, and reflection return state.

**Architecture:** Keep the existing route-first boundary: the route owns read mutations, pagination, revalidation, and navigation; the UI renders props and callbacks; the link model owns safe path normalization and optional reflection state. Remove presentation copy from the link model, render every notification as one semantic row link, and move the page's inline layout into dedicated global CSS classes.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Vitest 4, Testing Library, Playwright 1.61, Vite 8, repository CSS tokens.

## Global Constraints

- Follow `front/AGENTS.md`, `docs/agents/front.md`, `docs/agents/design.md`, and `docs/agents/execution.md`.
- Preserve the dependency direction `src/app -> src/pages -> features -> shared`; notification UI must remain prop/callback driven.
- Do not change the notification API, server persistence, event delivery pipeline, BFF, auth, or route definitions.
- Do not add filters, search, delete, archive, bulk selection, or server-side translation.
- Keep all user-visible notification inbox chrome in Korean; remove `Open`, `View record`, `View feedback`, `Next reading`, and `Past session reflection`.
- Keep the list at a desktop maximum width of approximately `880px`; rows are normally `76–88px`, body copy is clamped to at most two lines, and mobile touch targets remain at least `56px`.
- Preserve cursor pagination, individual read-before-navigation, read-all, safe-link fallback, club-scoped links, and reflection return state.
- Do not rely on color alone for unread state: use dot presence, title weight, and a screen-reader label.
- Use the root package-manager contract through `corepack pnpm`; the pinned version is `pnpm@11.13.1`.
- Do not commit screenshots, Playwright output, coverage, build output, caches, or real member data.
- Planning started from `e64fbacd`; preserve that separate host-notification design commit and do not amend, drop, or fold it into this member-inbox work.

---

## File Map

| File | Responsibility |
| --- | --- |
| `front/features/notifications/model/notification-link-model.ts` | Return only the safe destination and optional reflection return state. |
| `front/features/notifications/model/notification-link-model.test.ts` | Lock safe link normalization, reflection state, and unsafe fallback without presentation labels. |
| `front/features/notifications/ui/member-notifications-page.tsx` | Render the compact header, semantic row links, unread state, empty/error/loading states, and pagination control. |
| `front/features/notifications/ui/member-notifications-page.test.tsx` | Co-located presentation contract for Korean-only copy, full-row link semantics, and reflection state. |
| `front/features/notifications/route/member-notifications-route.tsx` | Keep mutation/navigation orchestration and remove the obsolete standalone `onMarkRead` UI prop. |
| `front/tests/unit/member-notifications.test.tsx` | Exercise the full component/route behavior: scoped links, read-before-navigation, duplicate suppression, error, read-all, empty, and pagination. |
| `front/src/styles/globals.css` | Add compact member-notification layout, focus, unread, two-line clamp, and mobile rules. |
| `front/tests/e2e/session-closing-flywheel.spec.ts` | Replace English-label assertions and verify the compact inbox still enters and returns from the reflection loop. |
| `CHANGELOG.md` | Record the user-visible redesign under `Unreleased`. |

## Acceptance-Matrix Handoff

- **Selected — UI or runtime state:** the redesign changes loading, empty, error, wrapping, desktop, mobile, pending, focus, and unread presentation. Evidence is the co-located component test, route-level unit test, targeted E2E, and responsive browser evidence.
- **Selected — Cursor collection:** the redesigned footer must keep first page, continuation, last page, and append behavior. Evidence is the existing `loadMore` route test updated to the new summary copy.
- **Selected — Club context:** safe notification destinations must remain inside the scoped member app and preserve already scoped links. Evidence is the existing scoped-link unit coverage and reflection E2E.
- **Excluded — Actor or authorization:** the task does not change access guards, member role rules, or denied states.
- **Excluded — BFF or OAuth:** request routing, cookies, headers, and return-path allowlists do not change.
- **Excluded — Persistence or migration:** there is no server or schema change.
- **Excluded — Async/provider operations:** notification dispatch, outbox, Kafka, mail, retry, and provider behavior are outside this UI-only task.

---

### Task 1: Reduce the Link Model to Navigation Data

**Files:**
- Modify: `front/features/notifications/model/notification-link-model.test.ts:4-74`
- Modify: `front/features/notifications/model/notification-link-model.ts:9-59,117-119`

**Interfaces:**
- Consumes: `ReadmatesReturnState`, `NotificationEventType`, and `deepLinkPath`.
- Produces:

```ts
export type MemberNotificationLinkView = {
  href: string;
  state?: ReadmatesReturnState;
};

export function getMemberNotificationLinkView(
  input: MemberNotificationLinkInput,
): MemberNotificationLinkView;
```

- [ ] **Step 1: Rewrite the model tests to reject presentation labels**

Replace action-label expectations with exact navigation objects:

```ts
it("maps legacy session deep links to member reflection state", () => {
  expect(
    getMemberNotificationLinkView({
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
    }),
  ).toEqual({
    href: "/app/sessions/11111111-1111-1111-1111-111111111111",
    state: {
      readmatesReturnTo: "/app/notifications",
      readmatesReturnLabel: "지난 모임 회고",
    },
  });
});

it("keeps destinations without reflection state minimal", () => {
  expect(
    getMemberNotificationLinkView({
      eventType: "SESSION_REMINDER_DUE",
      deepLinkPath: "/clubs/reading-sai/app/session/current",
    }),
  ).toEqual({
    href: "/clubs/reading-sai/app/session/current",
  });
});

it("keeps unsafe destinations inside the notification inbox", () => {
  expect(
    getMemberNotificationLinkView({
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      deepLinkPath: "//evil.example.com",
    }),
  ).toEqual({ href: "/app/notifications" });
});
```

Keep the existing feedback-document and notes-path cases, but expect only `href` and optional `state`.

- [ ] **Step 2: Run the focused model test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/notifications/model/notification-link-model.test.ts
```

Expected: FAIL because the returned objects still contain `primaryActionLabel` and `reflectionLabel`.

- [ ] **Step 3: Remove presentation fields from every link-model branch**

Change the view type and returns to this shape:

```ts
export type MemberNotificationLinkView = {
  href: string;
  state?: ReadmatesReturnState;
};

if (isFeedbackReflection(input.eventType, path)) {
  return {
    href: normalizeFeedbackPath(path),
    state: reflectionState,
  };
}

if (isSessionReflection(input.eventType, path)) {
  return {
    href: normalizeSessionPath(path),
    state: reflectionState,
  };
}

if (path.startsWith("/sessions/")) {
  return { href: normalizeSessionPath(path) };
}

if (path.startsWith("/notes")) {
  return { href: `/app${path}` };
}

return { href: path };
```

Make `fallback()` return only:

```ts
function fallback(): MemberNotificationLinkView {
  return { href: "/app/notifications" };
}
```

- [ ] **Step 4: Run the focused model test and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/notifications/model/notification-link-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the navigation-only model**

```bash
git add front/features/notifications/model/notification-link-model.ts \
  front/features/notifications/model/notification-link-model.test.ts
git commit -m "refactor(front): simplify notification link view"
```

---

### Task 2: Build the Compact Accessible Notification List

**Files:**
- Modify: `front/features/notifications/ui/member-notifications-page.test.tsx:5-66`
- Modify: `front/tests/unit/member-notifications.test.tsx:101-345`
- Modify: `front/features/notifications/ui/member-notifications-page.tsx:1-283`
- Modify: `front/features/notifications/route/member-notifications-route.tsx:112-131`
- Modify: `front/src/styles/globals.css:4814`

**Interfaces:**
- Consumes:

```ts
interface MemberNotificationsPageProps {
  unreadCount: number;
  items: MemberNotificationItem[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  pendingReadIds?: ReadonlySet<string>;
  markAllReadPending?: boolean;
  actionError?: string | null;
  onMarkAllRead: () => void;
  onOpenNotification?: (
    id: string,
    href: string,
    state?: ReadmatesReturnState,
  ) => void;
  onLoadMore?: () => void;
}
```

- Produces: one semantic `<a>` per notification, `새 알림 N개`, Korean-only actions, and BEM classes prefixed with `rm-member-notifications-`.
- Preserves: `onOpenNotification(id, href, state?)` for unread read-before-navigation and native link navigation for read rows.

- [ ] **Step 1: Write failing co-located presentation tests**

Replace the English-badge test and extend the row contract:

```tsx
it("renders a Korean-only compact reflection row", () => {
  render(
    <MemberNotificationsPage
      unreadCount={1}
      items={[{
        id: "n1",
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        title: "7회차 모임 기록이 준비됐어요",
        body: "지난 모임의 기록과 피드백을 이어 읽을 수 있어요.",
        deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
        readAt: null,
        createdAt: "2026-06-18T10:00:00Z",
      }]}
      onMarkAllRead={vi.fn()}
    />,
  );

  const row = screen.getByRole("link", {
    name: "읽지 않음 · 7회차 모임 기록이 준비됐어요 열기",
  });
  expect(row).toHaveClass("rm-member-notifications-list__item");
  expect(row).toHaveAttribute(
    "href",
    "/app/sessions/11111111-1111-1111-1111-111111111111",
  );
  expect(screen.getByText("새 알림 1개")).toBeVisible();
  expect(screen.queryByText("Open")).toBeNull();
  expect(screen.queryByText("View record")).toBeNull();
  expect(screen.queryByText("Past session reflection")).toBeNull();
  expect(screen.queryByRole("button", { name: "읽음" })).toBeNull();
});
```

Keep the existing reflection route-state test, but click the same full-row link and remove the obsolete `onMarkRead` prop.

- [ ] **Step 2: Rewrite route-level unit expectations for the new behavior**

Update every render to omit `onMarkRead`, then add or revise these cases:

```tsx
it("uses the full unread row as the only individual action", async () => {
  const user = userEvent.setup();
  const onOpenNotification = vi.fn();

  render(
    <MemberNotificationsPage
      unreadCount={1}
      items={[unreadNotification]}
      onOpenNotification={onOpenNotification}
      onMarkAllRead={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("link", {
    name: "읽지 않음 · 다음 책이 공개되었습니다 열기",
  }));

  expect(onOpenNotification).toHaveBeenCalledWith(
    unreadNotification.id,
    "/app/sessions/00000000-0000-0000-0000-000000000002",
  );
  expect(screen.queryByRole("button", { name: "읽음" })).toBeNull();
});

it("keeps a read notification as a native scoped link", () => {
  const onOpenNotification = vi.fn();

  render(
    <MemoryRouter initialEntries={["/clubs/reading-sai/app/notifications"]}>
      <MemberNotificationsPage
        unreadCount={0}
        items={[{
          ...scopedUnreadNotification,
          readAt: "2026-04-29T01:00:00Z",
        }]}
        onOpenNotification={onOpenNotification}
        onMarkAllRead={vi.fn()}
      />
    </MemoryRouter>,
  );

  const row = screen.getByRole("link", {
    name: "다음 책이 공개되었습니다 열기",
  });
  expect(row).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app/sessions/00000000-0000-0000-0000-000000000002",
  );
  expect(row).toHaveAttribute("data-unread", "false");
  expect(row).not.toHaveAttribute("aria-busy");
  expect(onOpenNotification).not.toHaveBeenCalled();
});

it("exposes pending and failure states without a standalone read button", () => {
  render(
    <MemberNotificationsPage
      unreadCount={1}
      items={[unreadNotification]}
      pendingReadIds={new Set([unreadNotification.id])}
      markAllReadPending
      actionError="알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요."
      onMarkAllRead={vi.fn()}
    />,
  );

  expect(screen.getByRole("link", {
    name: "읽지 않음 · 다음 책이 공개되었습니다 열기",
  })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "읽음 처리 중…" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.",
  );
});

it("keeps the user in the inbox when opening an unread row fails", async () => {
  const user = userEvent.setup();
  vi.spyOn(memberNotificationsActions, "markRead")
    .mockRejectedValue(new Error("network failed"));

  const { router } = renderMemberNotificationsRoute();
  await user.click(await screen.findByRole("link", {
    name: "읽지 않음 · 다음 책이 공개되었습니다 열기",
  }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.",
  );
  expect(router.state.location.pathname).toBe("/app/notifications");
});

it("renders the quiet empty state", () => {
  render(
    <MemberNotificationsPage
      unreadCount={0}
      items={[]}
      onMarkAllRead={vi.fn()}
    />,
  );

  expect(screen.getByText("새 알림이 없습니다")).toBeVisible();
  expect(screen.getByText("아직 받은 알림이 없습니다.")).toBeVisible();
  expect(screen.getByRole("button", { name: "모두 읽음" })).toBeDisabled();
});
```

Rewrite the duplicate individual-read test to click the row link twice while `markRead` is unresolved and expect exactly one mutation. Keep and update the scoped-link, read-all failure, duplicate read-all, and pagination tests; pagination must now expect `새 알림 2개`.

- [ ] **Step 3: Run the UI and route tests and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/notifications/ui/member-notifications-page.test.tsx \
  tests/unit/member-notifications.test.tsx
```

Expected: FAIL on the old summary copy, English labels, standalone read button, old pending label, and missing compact classes.

- [ ] **Step 4: Replace the UI prop and row markup**

Remove `onMarkRead`, `isInteractiveTarget`, all action-label rendering, and all layout inline styles. Keep `isPrimaryLinkActivation`.

Use this structure for the page:

```tsx
const unreadLabel =
  unreadCount > 0 ? `새 알림 ${unreadCount}개` : "새 알림이 없습니다";
const readAllDisabled =
  unreadCount === 0 || markAllReadPending || pendingReadIds.size > 0;

return (
  <main className="rm-member-notifications-page">
    <section className="container rm-member-notifications-page__body">
      <header className="rm-member-notifications-header">
        <div>
          <div className="rm-member-notifications-header__eyebrow">
            읽는사이 · 알림
          </div>
          <h1 className="rm-member-notifications-header__title">알림</h1>
          <p className="rm-member-notifications-header__summary">
            {unreadLabel}
          </p>
        </div>
        <button
          type="button"
          className="rm-member-notifications-header__read-all"
          onClick={onMarkAllRead}
          disabled={readAllDisabled}
          aria-busy={markAllReadPending || undefined}
        >
          {markAllReadPending ? "읽음 처리 중…" : "모두 읽음"}
        </button>
      </header>

      {actionError ? (
        <p role="alert" className="rm-member-notifications-page__error">
          {actionError}
        </p>
      ) : null}

      <section
        className="rm-member-notifications-list"
        aria-label="알림 목록"
      >
        {items.length === 0 ? (
          <div className="rm-member-notifications-list__empty">
            <p className="rm-member-notifications-list__empty-title">
              아직 받은 알림이 없습니다.
            </p>
            <p className="rm-member-notifications-list__empty-copy">
              책, 모임, 피드백 문서 알림이 이곳에 차곡차곡 쌓입니다.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const unread = item.readAt === null;
            const readPending =
              pendingReadIds.has(item.id) || markAllReadPending;
            const linkView = getMemberNotificationLinkView({
              eventType: item.eventType,
              deepLinkPath: item.deepLinkPath,
            });
            const href = scopedAppLinkTarget(routePathname, linkView.href);
            const state = linkView.state
              ? {
                  ...linkView.state,
                  readmatesReturnTo: scopedAppLinkTarget(
                    routePathname,
                    linkView.state.readmatesReturnTo,
                  ),
                }
              : undefined;
            const openNotification = () => {
              if (state) {
                onOpenNotification?.(item.id, href, state);
                return;
              }

              onOpenNotification?.(item.id, href);
            };

            return (
              <a
                key={item.id}
                href={href}
                className="rm-member-notifications-list__item"
                data-unread={unread ? "true" : "false"}
                aria-label={`${unread ? "읽지 않음 · " : ""}${item.title} 열기`}
                aria-busy={readPending || undefined}
                onClick={
                  unread && onOpenNotification
                    ? (event) => {
                        if (!isPrimaryLinkActivation(event)) return;
                        event.preventDefault();
                        if (!readPending) openNotification();
                      }
                    : undefined
                }
              >
                <span
                  className="rm-member-notifications-list__unread-dot"
                  aria-hidden="true"
                />
                <span className="rm-member-notifications-list__content">
                  <span className="rm-member-notifications-list__meta">
                    <span className="rm-member-notifications-list__category">
                      {eventLabels[item.eventType]}
                    </span>
                    <span>{formatNotificationDate(item.createdAt)}</span>
                  </span>
                  <span className="rm-member-notifications-list__title">
                    {item.title}
                  </span>
                  <span className="rm-member-notifications-list__copy">
                    {item.body}
                  </span>
                </span>
                <span
                  className="rm-member-notifications-list__arrow"
                  aria-hidden="true"
                >
                  ›
                </span>
              </a>
            );
          })
        )}
      </section>

      {hasMore && onLoadMore ? (
        <button
          type="button"
          className="rm-member-notifications-page__load-more"
          disabled={isLoadingMore}
          onClick={onLoadMore}
        >
          {isLoadingMore ? "불러오는 중…" : "더 보기"}
        </button>
      ) : null}
    </section>
  </main>
);
```

- [ ] **Step 5: Remove the obsolete route prop**

Keep `markRead()` because `openNotification()` uses it, but remove this prop from the JSX:

```tsx
onMarkRead={(id) => {
  void markRead(id);
}}
```

The remaining UI props must be:

```tsx
<MemberNotificationsPage
  unreadCount={page.unreadCount}
  items={page.items}
  hasMore={Boolean(page.nextCursor)}
  isLoadingMore={isLoadingMore}
  pendingReadIds={pendingReadIds}
  markAllReadPending={markAllReadPending}
  actionError={actionError}
  onMarkAllRead={() => {
    void markAllRead();
  }}
  onOpenNotification={openNotification}
  onLoadMore={() => {
    void loadMore();
  }}
/>
```

- [ ] **Step 6: Add the compact editorial styles**

Insert a member-notification block before the host notification styles:

```css
.rm-member-notifications-page {
  min-height: 100vh;
  background: var(--bg);
}

.rm-member-notifications-page__body {
  max-width: 880px;
  padding-top: 28px;
  padding-bottom: 72px;
}

.rm-member-notifications-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 4px;
}

.rm-member-notifications-header__eyebrow {
  color: var(--muted);
  font-family: var(--f-mono);
  font-feature-settings: "zero", "cv01";
  font-size: 11px;
  letter-spacing: 0.08em;
}

.rm-member-notifications-header__title {
  margin: 6px 0 0;
  font-size: clamp(30px, 4vw, 40px);
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1.05;
}

.rm-member-notifications-header__summary {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 14px;
}

.rm-member-notifications-header__read-all,
.rm-member-notifications-page__load-more {
  min-height: 44px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  text-underline-offset: 3px;
}

.rm-member-notifications-header__read-all:disabled,
.rm-member-notifications-page__load-more:disabled {
  color: var(--muted);
  cursor: not-allowed;
}

.rm-member-notifications-page__error {
  margin: 0 4px 12px;
  color: var(--danger);
  font-size: 13px;
}

.rm-member-notifications-list {
  display: grid;
  border-block: 1px solid var(--line);
}

.rm-member-notifications-list__item {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 76px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--line-soft);
  color: var(--text);
  text-decoration: none;
}

.rm-member-notifications-list__item:last-child {
  border-bottom: 0;
}

.rm-member-notifications-list__item:hover {
  background: var(--bg-sub);
}

.rm-member-notifications-list__item:focus-visible,
.rm-member-notifications-header__read-all:focus-visible,
.rm-member-notifications-page__load-more:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.rm-member-notifications-list__item[aria-busy="true"] {
  cursor: progress;
}

.rm-member-notifications-list__unread-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: transparent;
}

.rm-member-notifications-list__item[data-unread="true"]
  .rm-member-notifications-list__unread-dot {
  background: var(--accent);
}

.rm-member-notifications-list__content,
.rm-member-notifications-list__meta,
.rm-member-notifications-list__title,
.rm-member-notifications-list__copy {
  min-width: 0;
}

.rm-member-notifications-list__content {
  display: grid;
  gap: 4px;
}

.rm-member-notifications-list__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  color: var(--muted);
  font-size: 11px;
}

.rm-member-notifications-list__category {
  color: var(--text);
  font-weight: 600;
}

.rm-member-notifications-list__title {
  font-size: 17px;
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1.3;
}

.rm-member-notifications-list__item[data-unread="true"]
  .rm-member-notifications-list__title {
  font-weight: 800;
}

.rm-member-notifications-list__copy {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.rm-member-notifications-list__arrow {
  color: var(--muted);
  font-size: 22px;
}

.rm-member-notifications-list__empty {
  padding: 28px 4px;
}

.rm-member-notifications-list__empty-title {
  margin: 0;
  font-weight: 700;
}

.rm-member-notifications-list__empty-copy {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.rm-member-notifications-page__load-more {
  display: block;
  margin: 12px auto 0;
}

@media (max-width: 600px) {
  .rm-member-notifications-page__body {
    padding-top: 12px;
    padding-bottom: calc(72px + var(--m-safe-bottom));
  }

  .rm-member-notifications-header {
    align-items: flex-end;
    padding: 16px 0 12px;
  }

  .rm-member-notifications-header__title {
    font-size: 30px;
  }

  .rm-member-notifications-list__item {
    min-height: 76px;
    padding: 12px 0;
  }

  .rm-member-notifications-list__copy {
    font-size: 13px;
  }
}
```

Use the existing `--f-mono` token and the same weight/letter-spacing contract as the repository's `.editorial` utility. Do not introduce new typography custom properties.

- [ ] **Step 7: Run focused tests and the frontend boundary test**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/notifications/ui/member-notifications-page.test.tsx \
  tests/unit/member-notifications.test.tsx \
  tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run the focused model test with the UI slice**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/notifications/model/notification-link-model.test.ts \
  features/notifications/ui/member-notifications-page.test.tsx \
  tests/unit/member-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit the compact inbox implementation**

```bash
git add front/features/notifications/ui/member-notifications-page.tsx \
  front/features/notifications/ui/member-notifications-page.test.tsx \
  front/features/notifications/route/member-notifications-route.tsx \
  front/tests/unit/member-notifications.test.tsx \
  front/src/styles/globals.css
git commit -m "feat(front): redesign member notification inbox"
```

---

### Task 3: Update the Reflection E2E and Responsive Evidence

**Files:**
- Modify: `front/tests/e2e/session-closing-flywheel.spec.ts:219-235`

**Interfaces:**
- Consumes: the Korean accessible row name and existing reflection return state.
- Produces: route-level proof that the redesigned inbox enters the session reflection, reaches feedback, and returns to notifications without English action labels or private sentinels.

- [ ] **Step 1: Change the E2E assertions before running the test**

Replace the English-label checks with Korean-only and compact-layout checks:

```ts
await routeMemberNotifications(page);
await routeMemberReflectionSurfaces(page);
await page.goto(`/clubs/${CLUB_SLUG}/app/notifications`);

await expect(page.getByText("새 알림 1개")).toBeVisible();
await expect(page.getByText("Past session reflection")).toHaveCount(0);
await expect(page.getByText("View record")).toHaveCount(0);

const notificationRow = page.getByRole("link", {
  name: "읽지 않음 · No.07 모임 기록이 준비되었습니다 열기",
});
await expect(notificationRow).toBeVisible();
await expect(notificationRow).toHaveAttribute("data-unread", "true");

const desktopBodyBox = await page
  .locator(".rm-member-notifications-page__body")
  .boundingBox();
const desktopRowBox = await notificationRow.boundingBox();
expect(desktopBodyBox?.width).toBeLessThanOrEqual(880);
expect(desktopRowBox?.height).toBeGreaterThanOrEqual(56);
expect(desktopRowBox?.height).toBeLessThanOrEqual(96);

await notificationRow.focus();
await expect(notificationRow).toBeFocused();
const desktopInboxScreenshot = await page.screenshot({
  path: testInfo.outputPath("member-notifications-desktop.png"),
  fullPage: true,
});
expect(desktopInboxScreenshot.byteLength).toBeGreaterThan(10_000);

await page.setViewportSize({ width: 390, height: 844 });
await expect(notificationRow).toBeVisible();
const mobileRowBox = await notificationRow.boundingBox();
expect(mobileRowBox?.width).toBeLessThanOrEqual(390);
expect(mobileRowBox?.height).toBeGreaterThanOrEqual(56);

const mobileInboxScreenshot = await page.screenshot({
  path: testInfo.outputPath("member-notifications-mobile.png"),
  fullPage: true,
});
expect(mobileInboxScreenshot.byteLength).toBeGreaterThan(10_000);

await page.setViewportSize({ width: 1280, height: 720 });
await notificationRow.click();
```

Keep the existing assertions that the session detail and feedback page show `지난 모임 회고 돌아가기`, that the return link reaches `/app/notifications`, and that private sentinel text and raw JSON are absent.

- [ ] **Step 2: Run the targeted E2E**

Run:

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/session-closing-flywheel.spec.ts
```

Expected: PASS with desktop and mobile screenshots in Playwright's ignored output directory.

- [ ] **Step 3: Inspect both screenshots**

Confirm all of the following without committing the files:

- Desktop body is centered and visually narrower than the application shell.
- The header contains only the small context label, `알림`, `새 알림 1개`, and `모두 읽음`.
- The row has no outer card, English action, reflection badge, or standalone read button.
- Mobile title, read-all action, two-line body, arrow, and bottom navigation do not overlap.
- The unread dot remains visible and the row has a visible keyboard focus treatment.

If any item fails, adjust only `member-notifications-page.tsx` or the new member-notification CSS block, rerun Task 2's focused tests, and rerun this targeted E2E before continuing.

- [ ] **Step 4: Commit the E2E contract**

```bash
git add front/tests/e2e/session-closing-flywheel.spec.ts
git commit -m "test(front): verify compact notification reflection flow"
```

---

### Task 4: Record the Change and Run the Full Frontend Gate

**Files:**
- Modify: `CHANGELOG.md:7-13`
- Add: `docs/superpowers/plans/2026-07-27-member-notification-inbox-redesign.md`

**Interfaces:**
- Consumes: the completed implementation and E2E evidence from Tasks 1–3.
- Produces: an `Unreleased` record plus final frontend verification at the exact implementation HEAD.

- [ ] **Step 1: Add the Unreleased changelog entry**

Keep the existing sentence under `Highlights`, then add:

```markdown
### Changed

- **멤버 알림함:** 큰 문서 패널과 중첩 카드를 간결한 편집형 목록으로 바꾸고, 영어 액션·회고 배지를 제거했습니다. 행 전체 이동, 읽지 않음 상태, 오류·빈 상태, 더 보기 흐름을 데스크톱과 모바일에서 같은 한국어 인터페이스로 제공합니다.
```

- [ ] **Step 2: Run whitespace and public-safety checks**

Run:

```bash
git diff --check
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" \
  CHANGELOG.md \
  front/features/notifications \
  front/tests/unit/member-notifications.test.tsx \
  front/tests/e2e/session-closing-flywheel.spec.ts
```

Expected: `git diff --check` exits zero; the safety scan prints no new private-looking values from this change.

- [ ] **Step 3: Run the complete frontend gates**

Run in this order:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Expected: all commands PASS. Do not substitute an unpinned global `pnpm`. If `corepack` is unavailable, use the repository-approved fallback and record the exact command.

- [ ] **Step 4: Review the final diff against the approved spec**

Run:

```bash
git diff --stat e64fbacd..HEAD -- \
  front/features/notifications \
  front/tests/unit/member-notifications.test.tsx \
  front/tests/e2e/session-closing-flywheel.spec.ts \
  front/src/styles/globals.css \
  CHANGELOG.md
git diff e64fbacd..HEAD -- \
  front/features/notifications \
  front/tests/unit/member-notifications.test.tsx \
  front/tests/e2e/session-closing-flywheel.spec.ts \
  front/src/styles/globals.css \
  CHANGELOG.md
```

Confirm:

- Every expected file is present and no server/BFF/API file changed.
- No visible English notification action label remains.
- No unrelated global style or component was refactored.
- Screenshots and generated output are untracked or ignored.
- The acceptance-matrix selections in this plan have matching evidence.

- [ ] **Step 5: Commit the changelog**

```bash
git add CHANGELOG.md \
  docs/superpowers/plans/2026-07-27-member-notification-inbox-redesign.md
git commit -m "docs: record member notification inbox redesign"
```

- [ ] **Step 6: Verify final repository state**

Run:

```bash
git status --short --branch
git log -5 --oneline
```

Expected: the worktree is clean; the design commit and four implementation-plan commits are visible locally. Do not push, open a PR, tag, deploy, or mutate production unless separately authorized.

---

## Final Evidence Summary

The implementation handoff must report:

- Changed surface: member frontend notifications only, plus the Unreleased changelog.
- Focused RED/GREEN commands for the link model and component/route slice.
- Targeted reflection E2E result and desktop/mobile screenshot inspection.
- Exact full commands and results for lint, unit tests, build, and E2E.
- Selected acceptance rows: UI/runtime state, cursor collection, and club context.
- Excluded adjacent risks: actor/auth, BFF/OAuth, persistence/migration, and async/provider.
- Skipped validation with reasons, if any.
- Local-only Git status; no claim of push, PR, deployment, or production verification.
