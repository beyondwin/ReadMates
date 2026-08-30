# Stage 3 Task 5 brief — next action and preparation ledger

- BASE: `21e36542506d5443e1e97148983422394e4a7abb`.
- Plan: `docs/superpowers/plans/2026-08-29-host-operating-room-stage3.md`, Task 5 only.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- ADR impact: implement the action/ledger presentation portion of Proposed ADR-0048; no new ADR.

## Required outcome

- Create `host-next-action.tsx`, `preparation-ledger.tsx`, and `preparation-ledger-row.tsx` under the operating-room UI with focused unit and Chromium CT coverage; extend only the scoped operating-room CSS.
- Render exactly one filled primary CTA for actionable/conflict/unknown/deferred states when an href exists, a visible reason, and color-independent state text. `none` must not render a false CTA.
- Render the secondary defer control only when an authoritative non-null `workItemKey` is present and a callback is supplied. Pass the opaque key unchanged; never reconstruct one locally. A deferred action must show its state and safe resume semantics without duplicating a primary action.
- Render schedule-seen, RSVP, questions, and place as a continuous hairline ledger with label/value/detail/action and retryable unavailable row semantics. Preserve zero as data and the distinct DRAFT unavailable copy from the model.
- Use semantic links/buttons, keyboard/focus support, 44px touch targets, screen-reader labels, and existing route-owned drill-down hrefs. Desktop first viewport at the approved density must show at least three rows; mobile uses two-line wrapping without horizontal scroll.
- Apply `impeccable` operate/harden/craft-floor guidance and approved mockup hierarchy. TDD RED/GREEN, focused unit/CT, exact changed-file ESLint, diff/public scan, public-safe `task-5-report.md`, force-add brief/report, commit.

## Stop conditions

- Do not compose the dashboard route/page, own URL/query state, fetch data, implement deferral API/mutation, or alter server/model policy.
- Do not add card-grid styling, new dependencies, global tokens, or bitmap assets.
- Do not run full frontend/server/E2E/public-release gates.
- Preserve and ignore the external untracked design directory.
