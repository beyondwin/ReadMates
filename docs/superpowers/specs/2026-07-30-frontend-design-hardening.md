# ReadMates Frontend Design Hardening

## Status

Approved by the user on 2026-07-30 through the full Impeccable critique and the instruction to implement every finding sequentially.

## Goal

Make the public, member, and host surfaces deliver ReadMates' journal, personal-desk, and operating-ledger identities while preserving existing routes, permissions, data contracts, and mobile completeness.

## Scope

### Public recovery and copy

- Public 5xx route errors provide an explicit loader retry without leaving the current route.
- Public errors retain a secondary path to public records, scoped to the current club when applicable.
- Error copy states what failed, what remains unchanged, and the next available action without claiming an unknown root cause.
- Public navigation uses `홈 / 클럽 소개 / 공개 기록 / 로그인`.
- Google OAuth entry uses `Google로 시작하기`.
- The public footer year is derived from the current year.

### Member navigation

- Persistent member navigation contains four destinations: `오늘`, `노트`, `기록`, `내 공간`.
- `오늘` owns both `/app` and the current-session route for active-state purposes.
- Notification routes remain fully available and move into the account menu instead of occupying a permanent navigation slot.
- Direct links, route continuity, unread state owned by notification surfaces, and club-scoped paths remain intact.

### Host navigation and dashboard

- Persistent host navigation contains four destinations: `오늘`, `세션`, `멤버`, `기록`.
- `세션` resolves to the current session editor, a new-session editor, or a loading-disabled state using the same current-session information already fetched by `AppRouteLayout`.
- Host notifications remain available from the dashboard ledger; invitations remain available from the member-management grouping.
- The host priority queue and current session remain the primary desktop surface.
- Processing ledger, lifecycle flow, and infrequent operating tools use progressive disclosure on desktop as they already do on mobile.
- Host mutation messages name the operation and state that prior visibility/session state is preserved after failure.

### Role-specific typography and polish

- Add a dependency-free Korean-capable reading stack through `--f-reading`; do not add a remote font, package, or network request.
- Scope the reading face and longer line-height to public record titles, excerpts, quotations, and member reflection content. Do not change global `.editorial` or platform-admin typography.
- Keep host headings in the stable sans family and use mono/tabular numerals for operational values.
- Reduce public panel framing where rules, whitespace, covers, and indentation already establish structure.
- Animate AI generation progress using `transform: scaleX()` rather than `width`, with the existing reduced-motion contract preserved.
- Preserve minimum 44px mobile interaction targets for newly touched controls.

## Architecture

- Presentation remains in `front/shared/ui` and feature `ui` modules.
- `AppRouteLayout` continues owning navigation composition and current-session lookup.
- No `ui` module imports feature API/query/route modules.
- Route recovery uses React Router's `useRevalidator()` only inside `RouteErrorBoundary`; `RouteErrorPage` stays prop-driven and testable.
- Existing API data, permission gates, route names, and feature ownership remain unchanged.

## Error and Edge-State Contract

- Retry is shown for non-404 public load failures and disabled while revalidation is running.
- Public 403/404/409/410 states keep their existing meaning; retry is not presented when it would not resolve the condition.
- Scoped public URLs such as `/clubs/:clubSlug/records` remain scoped.
- Long Korean/English navigation labels wrap or fit without ellipsis after contraction to four destinations.
- Host failure copy never claims the server cause and explicitly says the previous state remains.

## Verification

- Strict RED→GREEN TDD for each behavior change.
- Focused Vitest for route errors, login/public copy, account menu, navigation, host dashboard, public home, and AI generation progress.
- Frontend boundary test.
- Full `corepack pnpm --dir front lint`, `test`, and `build`.
- Focused Playwright for public/auth navigation, responsive navigation, and host operations.
- Desktop and mobile browser inspection in one bounded pass, one batched correction, and at most one confirmation pass.
- Impeccable detector run exactly once after all UI edits.

## Non-goals

- No server, BFF, database, migration, auth-policy, deployment, or dependency changes.
- No removal of notification, invitation, session, member, archive, or account routes.
- No new factual marketing claims or real member/deployment data.
- No commit, merge, push, PR, tag, or deployment without separate user authorization.

## Acceptance Matrix

- Selected: `UI or runtime state`, because loading, error recovery, navigation, wrapping, desktop, and mobile behavior change.
- Excluded: actor/authorization, club context, publication visibility, BFF/OAuth, persistence, and async-provider rows because contracts and authorization behavior do not change. Existing denied and scoped-route tests remain regression evidence.
