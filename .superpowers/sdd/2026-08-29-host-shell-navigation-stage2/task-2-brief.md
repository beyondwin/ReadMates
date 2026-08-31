# Stage 2 Task 2 brief — host shell composition primitives

- BASE: `2d46fd18e030ea2866cacf35faf71ac806564893`.
- Plan: `docs/superpowers/plans/2026-08-29-host-shell-navigation-stage2.md`, Task 2 only.
- ADR impact: implement the shell-composition portion of ADR-0048; no new ADR.

## Required outcome

- Add a thin host composition over the existing shared `AppClubShell`; do not fork the shell.
- Replace the two visible host club/workspace controls with one `HostWorkspaceSwitcher` trigger that preserves URL-authoritative targets, same-club workspace switching, cross-club workspace retention, unavailable-host reasons, and deep-link safe fallback.
- Add semantic host primary navigation and utility actions with the approved labels, `aria-current`, accessible unread count, keyboard dismissal, focus treatment, and current `AvatarChip` behavior without an initial fallback flash.
- Preserve member/guest/admin behavior. Generic shared-shell changes are limited to reusable slots needed by all workspaces.
- Use existing tokens/Pretendard, 44px interaction targets, and reduced-motion behavior; no global theme.
- TDD RED/GREEN plus focused unit and Playwright CT at 390 and 1440, focused lint, diff/public scan, commit, and a public-safe source-hash ledger report.

## Stop conditions

- Do not wire the new composition into `app-route-layout.tsx`; that is Task 3.
- Do not add canonical route elements, alter legacy redirects, or change server code.
- Do not run full frontend gates or E2E.
