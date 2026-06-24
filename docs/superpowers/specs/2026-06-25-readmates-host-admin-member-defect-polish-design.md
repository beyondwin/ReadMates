# ReadMates Host/Admin Member Defect Polish Design

## Context

ReadMates has two adjacent operational surfaces that currently look more complete than they behave:

- Host member operations under `/app/host/**` and `/clubs/:slug/app/host/**`.
- Platform-admin club/support operations under `/admin/clubs/:clubId` and `/admin/support`.

Current source inspection and local browser checks found three concrete defects:

1. Host routes are defined, but `/app/host/members` and `/clubs/:slug/app/host/members` can be caught by the member app wildcard before the host route tree is evaluated.
2. `/admin/clubs/:clubId` overflows horizontally on a 390px viewport when the closing-risk ledger contains long titles, blocker labels, or action buttons.
3. `/admin/support` shows a no-results state before a search has run, making the initial state look like a completed empty search.

The work should be a small defect-first polish pass. It should not introduce new backend contracts, new support-grant authorization rules, or a new admin console.

## Goals

- Make host operation routes reachable before the member wildcard route handles them.
- Keep admin club-detail closing-risk rows readable on mobile without horizontal document overflow.
- Make admin support search states distinguishable: initial, loading, no results, results, and selected target.
- Add tests that fail on the observed regressions rather than only checking generic rendering.
- Preserve the current route-first frontend boundary: `src/app -> src/pages -> features -> shared`.

## Non-Goals

- Do not change Spring API contracts or persistence.
- Do not widen platform-admin permissions or support-grant capabilities.
- Do not remove the legacy club-detail support-grant panel in this pass.
- Do not redesign the admin shell navigation or host member list from scratch.
- Do not commit browser screenshots or local Playwright artifacts as product files.

## Evidence From Current Code

- `front/src/app/router.tsx` composes top-level routes as auth, member, host, admin, public.
- `front/src/app/routes/member.tsx` includes a member app wildcard route inside the `/app` and `/clubs/:clubSlug/app` trees.
- `front/src/app/routes/host.tsx` defines `/app/host` and `/clubs/:clubSlug/app/host`, but those trees are evaluated after the broader member app tree.
- `front/src/styles/globals.css` defines `.admin-club-operations__closing-risk-row` as a four-column grid for all viewport sizes.
- The existing mobile CSS collapses admin club operations summary/grid, but not closing-risk rows.
- `front/features/platform-admin/route/admin-support-route.tsx` stores the submitted search query separately from the input query, but the UI does not receive an explicit `hasSearched` state.

Local browser fixture checks confirmed:

- `/app/host/members` and `/clubs/reading-sai/app/host/members` rendered the member not-found screen instead of the host members screen.
- `/admin/clubs/:clubId` on a 390px viewport produced horizontal overflow when closing-risk rows included long text.
- `/admin/support` rendered "검색 결과가 없습니다." before the first search.

## Design

### 1. Host Route Reachability

Prefer the smallest route-order repair: evaluate `hostRoutes(queryClient)` before `memberRoutes(queryClient)` in `buildRoutes`.

The route order should become:

```text
auth routes
host routes
member routes
admin routes
public routes
```

This preserves the public catch-all ordering and keeps admin routes before public routes. It also keeps host routes inside the existing host guard, loader, route error boundary, and route elements.

Add characterization tests in `front/src/app/router-route-order.test.tsx` for:

- `/app/host`
- `/app/host/members`
- `/clubs/reading-sai/app/host`
- `/clubs/reading-sai/app/host/members`

Each should match the host route id and should not match the member wildcard path.

### 2. Admin Club Detail Mobile Closing-Risk Layout

Keep the desktop ledger dense. On mobile, collapse `.admin-club-operations__closing-risk-row` to a single-column layout with predictable wrapping:

- Main session title/date first.
- State badge and blocker as inline wrapping metadata.
- Age, first detected, last seen, repeat count, and tracking labels as compact rows.
- The host closing link as a full-width or natural-width action that cannot force page overflow.

The responsive CSS should be scoped to the existing admin mobile media query. It should not change the API model or the desktop row density.

The success criterion is mechanical and visual: on a 390px viewport, `document.documentElement.scrollWidth <= document.documentElement.clientWidth` for `/admin/clubs/:clubId` using a fixture with long closing-risk text.

### 3. Admin Support Search States

Add an explicit route/UI state for whether a search has been submitted. A simple `hasSearched` boolean is enough.

The workbench should render:

- Initial state: prompt the operator to enter a name or masked email query.
- Loading state: indicate that the search is running.
- No-result state: show no results only after a submitted query returns an empty list.
- Result state: show selectable results.
- Selected state: show grant risk summary and grant form for the selected subject.

Do not change grant creation behavior. The create button remains disabled unless the selected subject, selected club, reason, expiry, role capability, and risk summary allow creation.

## Data Flow

No new backend data flow is introduced.

- Host members keep using `hostMembersLoaderFactory`, `hostMemberListQuery`, and existing host member actions.
- Admin club detail keeps using `AdminClubOperationsSnapshot` and existing closing-risk model helpers.
- Admin support keeps using `platformAdminSupportSearchQuery`, `platformAdminSupportLedgerQuery`, `useCreateAdminSupportGrantMutation`, and `useRevokeAdminSupportGrantMutation`.

The only new frontend state is local support-route/UI state that says whether the operator has attempted a search.

## Error Handling

- Host route repair should leave `RequireHost`, `HostRouteError`, and `NotFoundRoute variant="host"` unchanged.
- Admin club-detail layout should remain robust if optional closing-risk tracking fields are absent.
- Admin support search failures should continue to surface through the existing route error message path and must not be rendered as a no-results state.
- Grant create/revoke failures keep the current user-facing error copy.

## Testing Plan

Run the smallest checks that prove the changed behavior:

```bash
pnpm --dir front test -- router-route-order
pnpm --dir front test -- admin-support
pnpm --dir front test -- admin-club-operations
```

If the implementation changes E2E fixtures or route behavior beyond unit coverage, also run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-club-operations.spec.ts
```

Before finishing implementation, perform a browser check for:

- `/app/host/members` at desktop and mobile widths.
- `/clubs/:slug/app/host/members` at desktop and mobile widths.
- `/admin/clubs/:clubId` at 390px width with long closing-risk text.
- `/admin/support` initial, no-result, and selected-result states.

## Release and Public-Safety Notes

- This is a frontend-only defect and polish pass.
- No public release-candidate script changes are expected.
- Do not add real member data, private domains, local absolute paths, or screenshot artifacts.
- Browser screenshots, if collected, remain local test evidence only.

## Open Follow-Up

The club-detail legacy support-grant panel and the newer `/admin/support` workbench still represent support access in two places. This design intentionally leaves that duplicate surface in place. A later cleanup should decide whether club detail should link into `/admin/support?clubId=...` instead of carrying its own grant form.
