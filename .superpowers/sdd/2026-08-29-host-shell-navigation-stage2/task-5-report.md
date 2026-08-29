# Stage 2 Task 5 Report — authority loss and cache isolation

## Status and scope

- BASE verified clean at `2969c626a4f5044a961c4631704a1cdf75dfeebd`.
- Task brief SHA-256: `7c7cc6f4887b439ae1da4587ebebd91443eff14f779714a1df412ea133d49f31`.
- ADR impact: `update` — hardens only the authority-navigation boundary implementing Proposed ADR-0048 under Accepted ADR-0035. No new ADR; ADR-0048 remains Proposed.
- Evidence is local repository/router integration evidence. No UI, route registration, server, redirect, BFF, deploy, or production state changed.
- Commands used Node `v24.18.0`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`.

## TDD RED → GREEN

RED was established before the production change:

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-authority-navigation.test.ts features/host/queries/host-query-key-inventory.test.ts features/host/queries/host-state-purge.test.ts
```

Result: the query-scope and purge characterizations passed, while the new authority-navigation test failed `1/1` for the intended reason: an entity-bearing or unscoped target was accepted as a pending authority-loss handoff (`expected false, received true`). Total result was `1 failed, 11 passed`.

After the minimum production guard, the same command passed `3` files and `12` tests with `0` failures. `stageHostAuthorityNavigation()` now accepts only an exact canonical `/clubs/:slug/app` member root and clears pending state when a target is rejected.

## Source hash → command → result → finding closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `3d57bc335c267e892d4546849715df3558119cf65b045fa01bc44a9d5411b28b` (`host-authority-navigation.ts`), `759cae4901e2022ac2d3f484669da61a818afba39743d35b947e980759cc62bd` (test) | RED/GREEN command above | RED `1/1`, then GREEN `12/12` across the three focused files | Authority-loss handoff accepts the same-club member root but rejects unscoped, member-detail/session-ID, and cross-club host person/membership-ID targets. Invalid staging also discards an earlier pending handoff instead of leaving it consumable later. |
| `c615206c111968a9df5db7803384e34c87f0a5e3d91c76b0ab03f32b68981b0b` (`host-query-key-inventory.test.ts`) | RED/GREEN and closing focused Vitest | GREEN | Every current exported host family changes from club A to B and retains the canonical `host, clubSlug` prefix. Stage 1 current/detail/schedule-default keys, which carry the schedule-seen and coarse access projections, are explicitly covered. No speculative Stage 4 key name was introduced; current member and record roots remain the source of truth. |
| `f90b37b0d0fd67796f617d462251a5fc30ec09520c40ca5b2a669a530daa9184` (`host-state-purge.ts`, unchanged), `88f220e56af3124b0921d795c78e0fd16dcfe51c79463592815220eecce2de49` (test) | closing focused Vitest and gate correction round 2 | GREEN | The existing exact-club prefix purge removes session, record, recovery, member, invitation, notification, operation, and AI families. It preserves a literal-characterized Stage 1 member cache key and another club's host cache without crossing feature boundaries, so no production purge rewrite or architecture exception was made. |
| `b0d51e1789881906413f64857df0b435cb5ec9b737571208d1073ea56e6ea389` (`club-app-route-layout-authority-loss.test.tsx`) | closing focused Vitest | GREEN | A mounted record draft and same-club host session/record/member caches are gone before the member loader runs. The handoff lands at `/clubs/reading-sai/app`, preserves member and other-club cache, and carries neither `membershipId` nor `sessionId` in navigation state. |
| `6841ccc76c905002cf30c72bcccd41561a4fd8990eef5752945c060f0eb86e84` (`workspace-route-model.ts` source), `b0ed3b1b2ab35df9856b9df71822365f9a4ff3e5a4969269a7f78b0d8c441206` (`workspace-route-model.test.ts`), `32c89b1bb5d37c25d0fd2c8a24c72f56c65a73621602af48da0536c712fc9807` (`app-route-layout.test.tsx`), `4f97bd8769b182e6f1dcc603b0565d076b167bce60fea86de21e87157d6177ac` (`host-workspace-switcher.test.tsx`) | closing focused Vitest | GREEN | Existing source-of-truth coverage confirms club A→B collapses session/person details to the target club list root and the member-view utility stays inside the current club. |

Closing focused command:

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-authority-navigation.test.ts features/host/queries/host-query-key-inventory.test.ts features/host/queries/host-state-purge.test.ts src/app/layouts/club-app-route-layout-authority-loss.test.tsx src/app/host-authority-loss-controller.test.tsx src/app/host-session-editor-authority-navigation.test.tsx src/app/workspace-route-model.test.ts src/app/layouts/app-route-layout.test.tsx features/host/ui/shell/host-workspace-switcher.test.tsx
```

Result: `9` files, `122` tests passed, `0` failures.

Exact changed-file lint command:

```text
PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec eslint features/host/model/host-authority-navigation.ts features/host/model/host-authority-navigation.test.ts features/host/queries/host-query-key-inventory.test.ts features/host/queries/host-state-purge.test.ts src/app/layouts/club-app-route-layout-authority-loss.test.tsx
```

Result: exit `0`, no findings. `git diff --check` also exited `0` with no output.
The targeted private-path, cloud identifier, private-key, credential-prefix, and BFF-secret assignment scan over every staged Task 5 file also returned no findings.

## Gate correction round 2

- BASE verified clean at `5a23abffbc3dce98987258b30af286de2cd62717`.
- RED command: `PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts`.
- RED result: `1` failed and `10` passed. The architecture scanner reported that `host-state-purge.test.ts` imported the separate `current-session` feature query module.
- Root cause: the cache-retention proof depended on a cross-feature key builder even though it only needed a non-host same-club cache entry. The test now uses the hand-derived Stage 1 key literal `["current-session", "scope", clubSlug, "current"]`; no shared production API or legacy exception was added.
- GREEN command: `PATH="$(brew --prefix node@24)/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts features/host/model/host-authority-navigation.test.ts features/host/queries/host-query-key-inventory.test.ts features/host/queries/host-state-purge.test.ts src/app/layouts/club-app-route-layout-authority-loss.test.tsx`.
- GREEN result: `5` files and `25` tests passed, `0` failures. The exact Task 5 purge assertion still proves same-club member cache retention.

## Verification notes and residual risk

- No focused E2E was required: the production change is a pure pending-handoff target guard, and the real router/controller/layout integration test proves purge-before-navigation and navigation-state sanitization. Existing route-model and switcher tests cover the relevant context-switch/user-action boundary.
- Full frontend lint/test/build and full E2E were intentionally not run under the Task 5 stop conditions. Stage-wide responsive/browser verification remains Task 6.
- Multi-tab, offline/service-worker, and live authority revocation were not exercised here. They remain ADR-0035 browser-hardening evidence, not a Task 5 repository claim.
- Stage 4 workbox code does not exist at this BASE. This task did not invent a future key; any future host workbox query must join the same canonical host club prefix and executable inventory.
