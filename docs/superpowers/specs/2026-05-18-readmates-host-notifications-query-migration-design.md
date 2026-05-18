# Host Notifications TanStack Query Migration Design

Date: 2026-05-18

## Goal

Move all host notification server state to TanStack Query while preserving the route-first frontend boundary.

The migration covers the `/app/host/notifications` and `/clubs/:slug/app/host/notifications` route surface: notification summary, event ledger, delivery ledger, test-mail audit ledger, host session options, manual notification options, manual preview/confirm mutations, and manual dispatch ledger. The user-visible workflow should remain the same: hosts can inspect notification state, process pending or failed work, retry or restore deliveries, send test mail, preview a manual dispatch, explicitly confirm duplicate resends, and see the dispatch ledger update after confirm.

## Priorities

1. Technical debt cleanup: replace route-local copies of server state with query cache ownership.
2. Reviewer-facing architecture proof: show that the `host/members` and `host/invitations` server-state pattern is repeatable for a more complex host operations surface.
3. Low regression risk: keep UI presentation prop-driven and avoid API contract changes.

## Non-Goals

- No Spring API, database, Kafka, notification delivery, or BFF contract changes.
- No visual redesign of the host notifications page.
- No change to manual notification business rules, preview TTL behavior, duplicate resend confirmation, or dispatch ledger semantics.
- No migration of user input state into TanStack Query.

## Current State

`front/features/host/route/host-notifications-data.ts` owns the loader and host notification actions. The loader fetches summary, event ledger, delivery ledger, test-mail audit, host sessions, manual dispatches, and manual options.

`front/features/host/route/host-notifications-route.tsx` then keeps a local `pages` state object with copies of the loader data. It appends additional event, delivery, audit, manual option, and dispatch pages into that local object. Mutating actions call the API through route actions and then use `useRevalidator().revalidate()` to refresh the route.

`front/features/host/ui/host-notifications-page.tsx` and `front/features/host/ui/notifications/**` are already close to the desired boundary: they render from props and callbacks. They also own UI state such as active ledger tab, status messages, restore dialog state, manual preview, manual errors, and manual busy state.

## Target Architecture

Add `front/features/host/queries/host-notification-queries.ts` as the host notification server-state module.

The module should export query keys, `queryOptions`, and mutation helpers for:

- `summary`
- `events(page)`
- `deliveries(page)`
- `audit(page)`
- `hostSessions`
- `manualOptions(sessionId, search, page)`
- `manualDispatches(page)`

Every key starts with `["host", "notifications"]`. Page arguments are normalized so equivalent first-page requests produce the same key. Query functions call existing feature-owned API functions from `front/features/host/api/host-api.ts`.

Add invalidation helpers:

- `invalidateHostNotificationOverview(client)` invalidates summary, events, deliveries, and audit.
- `invalidateManualNotificationState(client)` invalidates manual options and manual dispatches.
- `invalidateHostNotifications(client)` invalidates the whole host notification key root.

UI files must not import `host-api.ts`, `shared/api`, or the query module directly. Route and query modules own server-state access; UI components remain prop/callback driven.

## Loader Seeding

Replace `hostNotificationsLoader` with `hostNotificationsLoaderFactory(queryClient)`.

The loader still:

1. Calls `requireHostLoaderAuth`.
2. Derives club context from route args.
3. Reads `sessionId` and `eventType` from the URL.
4. Selects the initial manual session from URL, first open session, or first host session.

It then seeds the Query cache with the first page of:

- summary
- events with `{ limit: 50 }`
- deliveries with `{ limit: 50 }`
- audit with `{ limit: 50 }`
- host sessions
- manual dispatches with `{ limit: 20 }`
- manual options for the selected session

The route loader return value should shrink to route-only data:

- `initialManualSelection`

If retaining a small amount of loader data is needed for compatibility during the migration, it should be removed before the plan is complete. The end state is that server reads come from Query.

`front/src/app/routes/host.tsx` should pass the app `QueryClient` into the notifications loader, matching `hostMembersLoaderFactory(queryClient)` and `hostInvitationsLoaderFactory(queryClient)`.

## Route Orchestration

`HostNotificationsRoute` becomes the server-state orchestration layer.

It should:

- Read loader route-only data with `useLoaderData`.
- Read server state with `useQuery`.
- Track which extra cursor pages are currently opened for each ledger.
- Pass plain arrays, loading booleans, and callbacks to `HostNotificationsPage`.
- Stop using `useRevalidator` for normal mutation refresh.

Mutations should be wrapped with TanStack Query `useMutation` in the route or query module. On success:

- `process`, `retry`, `restore`, and `sendTestMail` invalidate the notification overview and affected ledger queries.
- `previewManual` returns preview data to the route/page callback but does not invalidate ledgers.
- `confirmManual` invalidates summary, events, deliveries, manual options, and manual dispatches.

## Pagination

Use page-keyed queries for this migration rather than `useInfiniteQuery`.

The existing API returns `{ items, nextCursor }`, and the route already exposes "load more" controls. Page-keyed queries let the migration remove route-local server response copies without changing the visible flow.

For `events`, `deliveries`, `audit`, and `manualDispatches`:

- The first page query uses the same limit as the existing loader.
- "Load more" records the next cursor in route-local UI state.
- The route reads each opened page from Query and flattens the pages for presentation.
- The route stores only opened cursor identifiers, not duplicated server result objects.

After a mutation that can materially change ledger order or counts, reset opened cursor pages back to the first page. Operational ledgers should prefer fresh first-page truth over preserving stale cursor windows that may now contain duplicates or gaps.

## Manual Notification Flow

Manual notification selection and preview state stay local to the page/workbench.

Local UI state includes:

- selected session
- selected template
- selected audience and channel mode
- included and excluded membership ids
- member search input
- resend confirmation checkbox
- preview panel visibility and preview response
- inline manual error text

TanStack Query owns the server state behind that UI:

- manual options
- manual member pages
- manual dispatch ledger
- preview mutation pending/error status
- confirm mutation pending/error status

The preview response should remain local because it is an expiring, confirm-bound artifact tied to the current selection. Query invalidation must not clear a valid preview before confirm. Confirm success clears the local preview and then refreshes the affected server queries.

Duplicate dispatch behavior remains unchanged: if preview says resend confirmation is required, the confirm callback must not run until the resend confirmation control is selected.

## Error And Loading Behavior

Initial loader failures continue to use the route error boundary.

Background query refetch failures should keep the previous data on screen and show targeted inline status only where the user initiated the action. A failed "load more" action should report failure in the affected ledger area or through the existing page alert pattern, not crash the full route.

Mutation failures preserve the current UX:

- process, retry, restore, and test-mail failures use the existing top-level status or alert message.
- manual preview and confirm failures use the manual inline error area.
- restore failures keep the restore dialog open and show restore-specific error text.

During mutation or background refresh, buttons that can trigger duplicate side effects remain disabled using route-provided pending booleans.

## Tests

Update or add tests around `front/tests/unit/host-notifications.test.tsx` and adjacent route/query tests.

Required coverage:

- The loader factory seeds summary, ledgers, audit, host sessions, manual options, and manual dispatches into the expected query keys.
- `front/src/app/routes/host.tsx` wires `hostNotificationsLoaderFactory(queryClient)`.
- The route can render from Query-seeded data without relying on copied loader server state.
- Query invalidation after a successful mutation refreshes the affected ledger or summary.
- Manual preview state survives unrelated query invalidation.
- Duplicate manual dispatch confirm is blocked until resend confirmation is selected.
- Confirming a manual preview invalidates and refreshes the manual dispatch ledger.
- UI files under `front/features/host/ui/**` still do not import API clients or query modules directly.

Relevant checks:

```bash
pnpm --dir front test -- host-notifications
pnpm --dir front lint
pnpm --dir front build
```

If the migration touches route-level auth, BFF behavior, or end-to-end user flow assumptions, also run:

```bash
pnpm --dir front test:e2e
```

## Release Notes

This is a frontend architecture migration. It should be documented in `CHANGELOG.md` under Unreleased as a host notifications server-state migration once implemented.

There are no expected backend deployment notes, database migrations, or public API changes.

## Risks

- Manual preview state could be accidentally cleared by query invalidation. Keep preview local and pin this with a regression test.
- Ledger pagination could show duplicate or stale rows after mutation. Reset opened cursor pages after mutating actions that affect ledger order.
- Query keys could miss club context during scoped host routes. Query functions should keep using feature API context from the route, and loader seeding must use the same key shape that route queries read.
- UI components could start importing server-state helpers directly. Keep route/query ownership explicit and rely on frontend boundary tests.
