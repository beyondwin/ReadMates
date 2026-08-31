# Stage 2 Task 4 Report — canonical host route elements

## Status and scope

- BASE verified clean at `7c617317e69434a727e492853d2e819eeed09de1`.
- Task brief SHA-256: `3b7cdf362090554b3d9909cf2be3a9c2552e62bf1181a0c12be1fa457b1f30d9`.
- ADR impact: `update` — implements only ADR-0048 route registration. No new ADR; ADR-0048 remains Proposed.
- Evidence is local repository evidence. No shell layout, authority purge, server, redirect removal, E2E, deployment, or production state changed.
- Commands used Node `v24.18.0`, TypeScript `6.0.3`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`.

## TDD RED → GREEN

RED was established before production changes with the canonical route suites. The run produced eight expected assertion failures plus the expected missing settings-module transform error: `/people` and `/settings` were absent, `/records` still resolved to its prior redirect, scoped loaders were absent for the missing routes, and the truthful settings boundary did not exist.

```text
PATH="<node24-bin>:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/routes/host.test.tsx src/app/routes/host-canonical-lazy.test.tsx src/app/host-routes/settings-route-element.test.tsx
```

After the minimum route registration and adapter implementation, the same command passed `3` files and `14` tests with `0` failures. The closing focused route/auth/boundary command passed `7` files and `43` tests; existing members and meeting-list UI regression passed another `2` files and `51` tests.

## Source hash → command → result → finding closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `96ff775f29d8bb485e83913f148567f385f4e28c88892b55aa90a5675457bd7e` (`host.tsx`) | closing route/auth/boundary Vitest | GREEN, `43/43` | Scoped and compatibility trees register lazy `/people`, `/records`, and `/settings`; scoped child loaders authorize before evaluating presentation; `/members`, `/invitations`, and `/operations` remain registered and their focused redirect suite remains green. |
| `1066e07897bcae928f9a6f3f65deb635d6ca1144317ed2e531eb3a73598e254c`, `518e02dae69e1823fe71690f1a41143be52c64a719447d19f79b3f74a4daaf58` (`people-route-element.tsx`, `records-route-element.tsx`) | closing route/auth/boundary Vitest plus existing UI regression | GREEN, `43/43` and `51/51` | People reuses `HostMembersRoute` and `hostMembersLoaderFactory`; records reuses `HostMeetingListRoute` and `hostMeetingListLoaderFactory`. No new API, query key, hook, or fetch owner was added. |
| `ec686c4cc64e1ebb51574705a36a1b09b9c9e6861af41ca3d7da41b052df994c`, `49350f50c17c7d937fe298388590b7948bff53c5a8cf17253efce01e4dff8507` (`settings-route-element.tsx` and test) | canonical GREEN command | GREEN, `14/14` | Settings is a host-authorized Stage 4 preparation boundary. It explicitly says named links and club settings are not yet available and labels the still-operational legacy capability only as `기존 이메일 초대 관리`, including scoped link resolution. |
| `0cc4973e642a194061ed97bf8132fe6680a28abbcb75bd7bb7c38eb3a562992b`, `c1f8004a1b853511415b066d25d4c9c2afede0aa855c1478bc08dd1ac20d3cbf` (route registry/lazy tests) | canonical RED/GREEN and closing route/auth/boundary Vitest | RED as expected, then GREEN `43/43` | Both route trees retain canonical and compatibility inventory; unscoped destinations are route-lazy, and scoped presentation is not evaluated before host authorization succeeds. |
| focused Task 4 TypeScript/TSX source and tests | exact changed-file ESLint | exit `0`, no findings | The new adapters stay inside the existing route-first dependency direction and use the shared scoped `Link`. |
| focused Task 4 TypeScript/TSX source and tests | repository `tsc --noEmit`, filtered to Task 4 paths under Node `v24.18.0` and TypeScript `6.0.3` | no Task 4 diagnostics; repository-wide exit `1` with `664` output lines from unrelated existing diagnostics | The task surface introduces no TypeScript diagnostic. Repository-wide type closure is not claimed. |

Closing focused commands:

```text
PATH="<node24-bin>:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/routes/host.test.tsx src/app/routes/host-canonical-lazy.test.tsx src/app/host-routes/settings-route-element.test.tsx src/app/host-routes/host-redirects.test.tsx features/host/route/host-loader-auth.test.ts features/host/route/host-meeting-list-data.test.ts tests/unit/frontend-boundaries.test.ts
PATH="<node24-bin>:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/host-members.test.tsx features/host/ui/meeting-list/host-meeting-list.test.tsx
PATH="<node24-bin>:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec eslint src/app/routes/host.tsx src/app/routes/host.test.tsx src/app/routes/host-canonical-lazy.test.tsx src/app/host-routes/people-route-element.tsx src/app/host-routes/records-route-element.tsx src/app/host-routes/settings-route-element.tsx src/app/host-routes/settings-route-element.test.tsx
```

## Verification notes and residual risk

- Canonical route RED/GREEN: expected RED, then `14/14` GREEN.
- Closing route/auth/boundary Vitest: `43/43` GREEN; existing members/meeting-list UI regression: `51/51` GREEN.
- Exact changed-file ESLint: exit `0`, no findings. Task 4 path-filtered TypeScript diagnostics: `0`.
- Final staged `git diff --check` and the targeted private-path, token-prefix, private-key, and BFF-secret scan passed with no findings.
- Full frontend lint/test/build, CT, E2E, redirects, Stage 4 settings capabilities, and authority purge were intentionally not run or changed under the Task 4 stop conditions.
- ADR-0048 remains Proposed. Route removal remains Stage 5; authority-loss cache handling remains Task 5; named invitation links and club settings remain Stage 4.

## Range-review round 1 — records adapter ownership state

- Review BASE: `e4b6dece3980c540f1b669b388fa931dc53665ea`.
- TDD RED under Node `v24.18.0` failed only the eight new ownership assertions while `169` existing assertions passed. The actual records-list transition reached the canonical session detail with `location.state === null`, which reproduced the review finding.
- GREEN passed the same `4` files and `177` tests. The records adapter still reuses `HostMeetingListRoute`, both existing list query owners, and the shared row UI; it only supplies optional link state, so no query, query key, hook, or fetch owner was duplicated.

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `a43bbdc2f9bf5cc0694b1b696ac08e57441f0340ae96572b561122bbb419fa11`, `c68a2e62a290908ebf9df7c4a081b1565cd065f108d36f05690ff395d488585b` (`records-route-element.tsx` and its integration test) | `<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/host-routes/records-route-element.test.tsx src/app/workspace-route-model.test.ts src/app/layouts/app-route-layout.test.tsx tests/unit/responsive-navigation.test.tsx` | GREEN, `177/177` | The canonical records adapter packages its exact current pathname, search, and hash as a same-club `기록으로` return state before a real row click opens `/sessions/:id`. The meetings adapter passes no state and remains meeting-owned. |
| `ccd0529c3bb2c72329f7af8359fc535e8e5b79ff462e0917d63ffedb0af149f5`, `28f5a913d557e2cf66e60064c1ac5e8326ec2657ff115b0adf78b52d65925157`, `c7660e265ec8ba0cb6fb67c0923214129f66c8c9a224ccdf3286709beeb3f132` (shared list model, route, row) | same focused GREEN command | GREEN, `177/177` | The shared list pipeline transports an optional `detailLinkState` without changing data fetching or detail hrefs. Both upcoming and past rows preserve the record owner only when their adapter provides it. |
| all round-1 TypeScript/TSX source and tests | exact changed-file ESLint under Node `v24.18.0` and repository-pinned pnpm | exit `0`, no findings | The adapter and shared optional-state transport satisfy repository lint rules. |

Round-close safety: `git diff --check` passed. The targeted changed-file scan found no machine-local absolute path, private key marker, token prefix, or BFF secret name. Full frontend gates, CT, E2E, and the separate mixed-authority review finding remain outside this round.

## Record-ownership round 2 — feedback preview assertion alignment

- Review BASE: `b78f311b9436a9da7640f2d6abfa78e74178d0ce`.
- The controller-reported full frontend run had one failure among `3,661` tests. A focused RED reproduction ran the feedback-document route file under Node `v24.18.0`: `14` tests passed and the sole stale assertion expected mobile title `모임` while the record-owned preview correctly rendered `기록`.
- The test already verified records-current desktop/mobile navigation and canonical records Back ownership around that assertion. Only the title expectation changed; production source was untouched.

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `4df3a608f409e4db8168c6e9c30168b0cce7c59e9ff4a3754074dd28eb0ab5a2` (`front/tests/unit/feedback-document-route.test.tsx`) | `<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/feedback-document-route.test.tsx src/app/host-routes/records-route-element.test.tsx src/app/workspace-route-model.test.ts src/app/layouts/app-route-layout.test.tsx tests/unit/responsive-navigation.test.tsx` | GREEN, `5` files and `192/192` tests | The scoped feedback-preview return flow now asserts the same `기록` title ownership as its records-current primary navigation and records Back target. The prior four-file record suite remains green. |
| same focused test source | `<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec eslint tests/unit/feedback-document-route.test.tsx` | exit `0`, no findings | The assertion-only correction satisfies repository lint rules. |

Round-close safety: `git diff --check` passed. The targeted changed-file scan found no machine-local absolute path, private key marker, token prefix, or BFF secret name. The full frontend suite was intentionally not rerun here; the controller owns the single post-fix rerun.
