# Stage 3 Task 1 brief — lifecycle operating-room view model

- BASE: `a0017d27a5a97c509b7c4f922eb48f2614241744`.
- Plan: `docs/superpowers/plans/2026-08-29-host-operating-room-stage3.md`, Task 1 only.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- ADR impact: implement the view-model portion of Proposed ADR-0048/0049; no new ADR.

## Required outcome

- Create only `front/features/host/model/host-operating-room-model.ts` and its focused test unless a minimal import/export adjustment is demonstrably required.
- Reuse the existing lifecycle, closing, and schedule-seen models as source of truth; do not duplicate their policies.
- Establish RED before implementation for no current meeting; DRAFT, OPEN, CLOSED, and PUBLISHED; before/day-of/after dates; blocked, ready, and published closing; partial/absent sources; invalid or unavailable requested phase; and the complete next-action priority.
- Produce `prep | live | closing` phase availability and deterministic normalization inputs while keeping completed phases readable.
- Enforce one next action in this order: conflict/unknown receipt, live attendance, schedule unseen review, RSVP, questions, place, closing, none.
- Build independent denominator-aware schedule-seen, RSVP, questions, and place rows. Use `집계 준비 중` only when an expected contract is absent or failed. For a future DRAFT without a member-visible snapshot, use `아직 멤버에게 공개되지 않음` and create neither fake zero counts nor a schedule-seen work item.
- Run focused Vitest and exact changed-file ESLint under Node `v24.18.0` with Corepack/pnpm `11.13.1`, run `git diff --check` and a targeted public-safety scan, write a public-safe `task-1-report.md` with `source hash → command → result → finding closure`, force-add the ignored brief/report, and commit.

## Stop conditions

- Do not change loaders, queries, routes, UI, CSS, BFF, or server code.
- Do not run full lint/test/build/CT/E2E/public-release gates.
- Do not broaden the contract beyond the accepted Stage 3 plan.
