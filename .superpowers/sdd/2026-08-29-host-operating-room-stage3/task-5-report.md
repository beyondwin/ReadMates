# Stage 3 Task 5 Report — next action and preparation ledger

## Status and scope

- BASE verified at `21e36542506d5443e1e97148983422394e4a7abb`.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- Task brief SHA-256: `be25ce63826c91758221487938393ff56bd14af0ca6cba14a902663cf3260aab`.
- ADR impact: `update` — implements the action and preparation-ledger presentation portion of Proposed ADR-0048; no new ADR. ADR-0048 remains Proposed until the remaining route, workbox, responsive, active-architecture, and stage-close surfaces agree.
- Changed behavior is limited to pure-props next-action and preparation-ledger UI under `front/features/host/ui/operating-room`, with scoped CSS and focused unit/Chromium CT coverage. No route, query, fetch, mutation implementation, server, model policy, global token, dependency, or asset changed.
- Commands used Node `v24.18.0`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`.

## TDD RED → GREEN

The unit contracts were written first. The initial run failed to resolve the three not-yet-created modules; minimal null-rendering component shells then produced the intended behavioral RED with `10` failures and `2` passes. The failures named missing semantic regions, primary and defer actions, state/reason text, opaque-key forwarding, rows, zero values, DRAFT copy, and unavailable retry. Minimal props-only rendering made the suite green. A later fail-closed RED supplied an invalid href with `state: none`; the test failed because a false link rendered, and the focused guard made it green without changing the model.

```text
<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/ui/operating-room/host-next-action.test.tsx features/host/ui/operating-room/preparation-ledger.test.tsx
```

Final result: `2` files, `12/12` tests passed, `0` failures.

```text
<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/operating-room/operating-room.ct.tsx --project=chromium
```

Final result: `9/9` Chromium CT tests passed. Task 5 coverage exercises the next action and preparation ledger at `390`, `768`, and `1440` pixels plus a `320`-pixel 200%-zoom proxy. It verifies no horizontal overflow, all links/buttons at least `44px`, visible primary focus, reduced motion, long Korean/English wrapping, four continuous rows, and the third row inside the desktop first viewport. The existing Task 4 meeting-context CT remains green in the same run.

## Source hash → command → result → finding closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `e6829377dc5d07a0e309c43325c9f3fe4362a4c65a43268dcd236278faeb06e2` (`host-next-action.tsx`) | focused Vitest and Chromium CT commands above | GREEN, included in `12/12` unit and `9/9` CT | Actionable, conflict, unknown, and deferred states expose at most one filled route-owned primary destination with visible reason and explicit state text. `none` is fail-closed even if a bad href is supplied. Deferred state has one safe resume action and no duplicate defer control. |
| `e24707af87c60342f40a926db926800c4c2f081d84d37394a173fb800db1a2dc`, `e9b09141143430dbf2c56ea7a79916e7e78dcf4b7e82a120d9f08131baf44546` (`preparation-ledger.tsx`, `preparation-ledger-row.tsx`) | focused Vitest and Chromium CT commands above | GREEN, included in `12/12` unit and `9/9` CT | Schedule-seen, RSVP, questions, and place render as one semantic ordered ledger with label, value, detail, state text, and route-owned drill-down. Unavailable rows alone receive a supplied retry callback; zero and DRAFT unavailable copy remain literal data. |
| `e6829377dc5d07a0e309c43325c9f3fe4362a4c65a43268dcd236278faeb06e2` (`host-next-action.tsx`) | opaque-key unit interaction | GREEN | The defer button exists only when both an authoritative non-null `workItemKey` and callback are supplied. Clicking passes `server/opaque:key:with exact bytes` unchanged; the component contains no key construction. |
| `589fef8cb3734166252b2917f5ca017aa789ee02a58e7525b36459604e9db90f` (`operating-room.css`) | focused Chromium CT and one bounded desktop/mobile screenshot inspection | GREEN, `9/9`; inspected once | The approved quiet editorial hierarchy is implemented as a full-width next action followed by continuous hairline rows, not a card grid. Desktop density keeps at least three rows in the first viewport; mobile uses a two-line row reflow without horizontal scrolling. Focus and reduced-motion rules remain scoped. |
| `9acb768cc9412f8314d71ae4ae85bd8c4b13d6f2934b09c3393e6181d8222487`, `61b6d1e404a31701722f78f3eabb75d2202a2917a42923784b38207edbc3dfe7`, `16500048e09d246cebcee48bea829eb16e2718ddbcbb8e47a4c9264234c0cf1b` (unit and CT tests) | focused Vitest and Chromium CT commands above | GREEN, `12/12` unit and `9/9` CT | Regression coverage catches primary duplication, false none href, missing reason/state, reconstructed deferral identity, zero loss, DRAFT copy replacement, unavailable retry loss, broken drill-down hrefs, undersized controls, focus loss, motion, density, wrapping, and overflow. |

## Verification notes and residual risk

- Impeccable Operate, harden, and craft-floor guidance was applied. The required one-time mechanical detector returned `[]` over the three production components and scoped CSS.
- Exact changed-TypeScript ESLint passed with exit `0`. Staged diff whitespace and targeted public-safety scans passed with no findings.
- Temporary CT screenshots were inspected once and were not added to the repository. The externally supplied untracked design directory was preserved untouched and unstaged.
- Full frontend lint/test/build, full CT, E2E, server, and public-release gates were intentionally not run under the per-task stop conditions. Route composition, data integration, actual deferral mutation ownership, and phase-specific end-to-end behavior remain Stage 3 Tasks 6–8.
