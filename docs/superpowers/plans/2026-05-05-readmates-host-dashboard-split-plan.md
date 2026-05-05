# ReadMates HostDashboard Component Split Plan

작성일: 2026-05-05
상태: READY FOR IMPLEMENTATION

> **For agentic workers:** Implement checkbox-by-checkbox. Start with characterization tests, keep the route/API contract unchanged, and preserve unrelated worktree edits. This is a follow-up plan only; the Task 9 PR that created this document must not edit frontend source.

## Goal

Split `front/features/host/ui/host-dashboard.tsx` into smaller host dashboard UI components while preserving current desktop/mobile behavior, route-state handling, notification privacy, and upcoming-session actions.

Current source of truth:

- Implementation: `front/features/host/ui/host-dashboard.tsx` (about 1,805 lines in the current worktree)
- Route wrapper: `front/features/host/route/host-dashboard-route.tsx`
- Model helpers: `front/features/host/model/host-dashboard-model.ts`
- Tests: `front/tests/unit/host-dashboard.test.tsx`, `front/tests/unit/host-dashboard-model.test.ts`

## Scope Guardrails

- Read `AGENTS.md`, `docs/agents/front.md`, and `docs/agents/design.md` before implementation.
- Keep `HostDashboard` as the public default export from `front/features/host/ui/host-dashboard.tsx` until all imports are explicitly moved.
- Keep UI components prop/callback driven. Do not import feature API modules, route modules, `shared/api`, or `fetch` from extracted `features/host/ui/dashboard/*` components.
- Do not change backend API contracts, route paths, BFF behavior, auth assumptions, or Korean product copy unless a characterization test proves an existing accessibility label needs to be retained.
- Keep `ReadmatesReturnState` and scoped host edit links working for `/app/:clubSlug/host/...` and unscoped `/app/host/...` routes.
- Preserve notification privacy. Tests must continue to prove full recipient email addresses are not rendered.
- Use repo-relative placeholders only. Do not add real member data, private domains, deployment state, OCIDs, secrets, or token-shaped examples.

## Extraction Candidates

Extract in this order so low-state presentational pieces move first and the high-coupling mobile shell moves after its child pieces are stable.

1. `front/features/host/ui/dashboard/upcoming-session-row.tsx`
   - Move `UpcomingSessionRow`, `UpcomingSessionMobileCard`, `UpcomingStartBlockedNotice`, `UpcomingActionMessage`, and `upcomingVisibilityStatusLabel` when their shared props are clear.
   - Preserve disabled-state behavior for visibility/open actions and edit-link URL encoding.
2. `front/features/host/ui/dashboard/host-notification-ledger.tsx`
   - Move `HostNotificationLedger` and `maskEmail`.
   - Keep latest failures capped to three rows and keep masked email rendering.
3. `front/features/host/ui/dashboard/invite-pipeline-section.tsx`
   - Move `InvitePipelineSection`.
   - Keep mobile/desktop surface differences and the host invitations route.
4. `front/features/host/ui/dashboard/quick-action.tsx`
   - Move `QuickAction`, `ChecklistMarker`, badge/checklist class helpers only if they do not create a circular dependency.
   - Keep disabled quick-action semantics and return-state injection.
5. `front/features/host/ui/dashboard/mobile-host-dashboard.tsx`
   - Move `MobileHostDashboard` after the extracted child components exist.
   - Keep mobile order, tab/section labels, and all operational controls.

If a helper is also used by desktop markup, prefer a small sibling helper module under `front/features/host/ui/dashboard/` over duplicating logic.

## Characterization Tests

Before moving code, extend existing tests in `front/tests/unit/host-dashboard.test.tsx` only when the behavior is not already covered. Existing coverage already includes loader behavior, notification privacy, upcoming session actions, mobile ordering, scoped CTAs, and aggregate-action routing.

- [x] Confirm existing baseline:

```bash
pnpm --dir front test tests/unit/host-dashboard.test.tsx tests/unit/host-dashboard-model.test.ts
```

- [x] Add or verify a test that desktop and mobile upcoming-session controls both:
  - render encoded edit links,
  - disable visibility/open controls while an upcoming action is pending,
  - show a single blocked-start message when a current session exists.
- [x] Add or verify a test that `HostNotificationLedger` never renders a full email address and still links to `/app/host/notifications`.
- [x] Add or verify a test that the mobile dashboard order remains:
  current operation summary, RSVP/progress/publication/feedback status, priority work, upcoming action, preparation docs, operations schedule, member participation, publication/feedback, invite pipeline, then quick actions.
- [x] Add or verify a test that disabled `QuickAction` controls keep explanatory status text and do not create a link.

Run the targeted suite after each characterization addition:

```bash
pnpm --dir front test tests/unit/host-dashboard.test.tsx
```

## Implementation Checklist

- [x] **Phase 1: Baseline and dependency map**
  - Run `git status --short --untracked-files=all`.
  - Inspect imports from `host-dashboard.tsx` and note which types/helpers each extraction candidate needs.
  - Confirm no unrelated dirty frontend edits will be overwritten.

- [x] **Phase 2: Characterization tests first**
  - Add only missing tests from the section above.
  - Watch the new tests fail only if they expose a missing characterization gap; otherwise document that existing tests already cover the behavior.
  - Run the targeted test command.

- [x] **Phase 3: Extract upcoming-session components**
  - Create `features/host/ui/dashboard/upcoming-session-row.tsx`.
  - Move desktop/mobile upcoming-session rows and local helpers.
  - Keep props explicit: `session`, `actions`, `LinkComponent`, and layout flags.
  - Run `pnpm --dir front test tests/unit/host-dashboard.test.tsx`.

- [x] **Phase 4: Extract notification and invite sections**
  - Create `host-notification-ledger.tsx` and `invite-pipeline-section.tsx`.
  - Keep `maskEmail` private to the notification module unless another module needs it.
  - Run the targeted host dashboard test suite.

- [x] **Phase 5: Extract quick actions**
  - Create `quick-action.tsx`.
  - Keep return-state construction injected from `HostDashboard`; extracted UI should not read router state directly.
  - Run the targeted host dashboard test suite.

- [x] **Phase 6: Extract mobile dashboard shell**
  - Create `mobile-host-dashboard.tsx`.
  - Move only the mobile shell and pass already-derived props from `HostDashboard`.
  - Confirm the desktop markup still stays in `host-dashboard.tsx` or is intentionally extracted in a later plan.
  - 2026-05-06 PR9 completion: `mobile-host-dashboard.tsx` now owns the mobile shell; shared dashboard sections/helpers were moved into sibling dashboard modules and `HostDashboard` keeps route-derived state and desktop composition.

- [x] **Phase 7: Full verification**
  - Run all commands in the verification section.
  - Inspect the final diff for accidental route/API/model changes.

## Verification Commands

When using `pnpm --dir front`, pass test paths relative to `front/`, not `front/tests/...`.

```bash
pnpm --dir front test tests/unit/host-dashboard.test.tsx tests/unit/host-dashboard-model.test.ts
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
git diff --check -- front/features/host/ui/host-dashboard.tsx front/features/host/ui/dashboard front/tests/unit/host-dashboard.test.tsx
```

## Rollback Plan

- If an extraction changes behavior, revert the smallest extraction commit or inline that candidate back into `host-dashboard.tsx`.
- Keep characterization tests unless the test itself is incorrect; they protect existing behavior for future extraction attempts.
- If prop threading becomes unclear, stop before moving the mobile shell and leave the already-extracted leaf components in place.

## Risks

- `MobileHostDashboard` has broad prop surface and can accidentally duplicate desktop derivation logic.
- Upcoming-session actions combine local optimistic state, server actions, and route links; extract them before the mobile shell to keep failure modes small.
- Notification rows are privacy-sensitive because they include recipient email fields from the API. The masking test is a hard gate.
- Quick actions carry scoped return state; a component that constructs router state itself can violate the route-first boundary.
