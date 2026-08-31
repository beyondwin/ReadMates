# Stage 3 Task 4 brief — meeting context and phase controls

- BASE: `b54c44f0783958de47360d316a585ac8d1552f32`.
- Plan: `docs/superpowers/plans/2026-08-29-host-operating-room-stage3.md`, Task 4 only.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- ADR impact: implement the presentation portion of Proposed ADR-0048; no new ADR.

## Required outcome

- Create `current-meeting-header.tsx`, `meeting-phase-tabs.tsx`, and `operating-room.css` under `front/features/host/ui/operating-room`, with focused unit and Playwright CT coverage.
- Render cover fallback, title/book identity, D-day/date/time/place, lifecycle context, and semantic links for `모임 정보`, `일정 편집`, `변경 이력`, and `멤버 시야` from props only. Reuse existing artwork/image contracts; do not invent remote assets.
- Render prep/live/closing controls with one current phase, blocked/complete semantics, visible blocked reason, keyboard/focus/accessibility semantics, and href/callback inputs owned by the route. UI must not parse or mutate URL/query state itself.
- Match the approved calm editorial hierarchy rather than adding a card grid. Verify 390/768/1440 layouts, long Korean title, missing image, partial meeting fields, and 200% zoom/no horizontal overflow. Touch targets and focus state must remain usable on mobile.
- Use the existing design tokens/patterns and the `impeccable` operate/harden/craft-floor guidance. Keep CSS scoped to the operating-room feature.
- TDD RED/GREEN, focused unit/CT, exact changed-file ESLint, diff/public-safety scan, public-safe `task-4-report.md`, force-add brief/report, commit.

## Stop conditions

- Do not compose the dashboard route/page, fetch data, implement next action/preparation ledger, or modify server/mutations.
- Do not add new dependencies, global visual tokens, or bitmap assets.
- Do not run full frontend/server/E2E/public-release gates.
- Preserve and ignore the external untracked design PNG directory.
