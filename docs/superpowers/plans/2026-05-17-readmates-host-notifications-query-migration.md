# ReadMates Host Notifications Query Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move host notification summary, event ledger, delivery ledger, manual options, preview, confirm, and dispatch ledger reads into TanStack Query without moving API calls into UI components.

**Architecture:** Keep `front/features/host/route` responsible for loader/action coordination and keep `front/features/host/ui/notifications` prop/callback driven. Add `front/features/host/queries/host-notification-queries.ts` for query keys, queryOptions, and mutation invalidation helpers.

**Tech Stack:** React 19, React Router 7, TanStack Query v5, Vitest, Testing Library.

---

## Task 1: Map Current Notification Data Flow

**Files:**

- Read: `front/features/host/route/host-notifications-data.ts`
- Read: `front/features/host/route/host-notifications-route.tsx`
- Read: `front/features/host/ui/host-notifications-page.tsx`
- Read: `front/features/host/ui/notifications/manual-notification-workbench.tsx`

- [ ] **Step 1: Inspect existing route and UI data flow**

Run:

```bash
sed -n '1,240p' front/features/host/route/host-notifications-data.ts
sed -n '1,240p' front/features/host/route/host-notifications-route.tsx
sed -n '1,260p' front/features/host/ui/host-notifications-page.tsx
sed -n '1,260p' front/features/host/ui/notifications/manual-notification-workbench.tsx
```

Expected: route owns loader data, while UI coordinates several host notification reads and manual dispatch actions.

## Task 2: Add Notification Query Keys

**Files:**

- Create: `front/features/host/queries/host-notification-queries.ts`

- [ ] **Step 1: Create query key module**

Create query keys for `summary`, `items(status,page)`, `events(page)`, `deliveries(page)`, `manualOptions(sessionId,search,page)`, and `manualDispatches(sessionId,eventType,page)`. Each key starts with `["host", "notifications"]`.

- [ ] **Step 2: Add invalidation helpers**

Add `invalidateHostNotifications(client)` for all host notification state and `invalidateManualNotificationState(client)` for manual options/dispatches.

## Task 3: Seed Loader Data

**Files:**

- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/features/host/route/host-notifications-data.ts`

- [ ] **Step 1: Convert loader to factory**

Follow the `hostMembersLoaderFactory(client)` pattern from the engineering proof portfolio plan. Seed summary, events, deliveries, and manual options into Query cache from loader data.

## Task 4: Move Preview and Confirm to Query Mutations

**Files:**

- Modify: `front/features/host/ui/notifications/manual-notification-workbench.tsx`

- [ ] **Step 1: Keep UI prop-driven**

Use actions passed from the route for API calls. Do not import `host-api.ts` into UI. Use Query mutations only to track pending state and invalidation.

- [ ] **Step 2: Preserve preview TTL and resend confirmation**

After preview success, keep the preview token and selection hash state in the workbench. After confirm success, invalidate manual dispatches and notification summary.

## Task 5: Test Notification Migration

**Files:**

- Modify: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add regression tests**

Add these regression tests to `front/tests/unit/host-notifications.test.tsx`:

```typescript
it("keeps manual preview state when notification queries invalidate", async () => {
  // Arrange with the existing manual notification route fixture.
  // Preview a manual notification.
  // Trigger an invalidation through a successful confirm or process action.
  // Assert the preview token, selected template, and target count remain visible until confirm resolves.
});

it("requires explicit resend confirmation after query migration", async () => {
  // Arrange with a recent manual dispatch fixture for the same session/template.
  // Preview the same dispatch.
  // Assert confirm is blocked until the resend confirmation control is selected.
});

it("refreshes manual dispatch ledger after confirm", async () => {
  // Arrange with an empty dispatch ledger.
  // Confirm a preview.
  // Assert the ledger query refetch shows the new dispatch row.
});
```

Replace the comments with the existing test helper calls in that file; keep the three test names and assertions.

- [ ] **Step 2: Run checks**

Run:

```bash
pnpm --dir front test -- host-notifications
pnpm --dir front lint
pnpm --dir front build
```

Expected: all commands pass.
