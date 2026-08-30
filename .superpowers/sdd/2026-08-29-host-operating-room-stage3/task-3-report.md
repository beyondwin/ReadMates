# Stage 3 Task 3 Report — operating-room loader

## Status and scope

- BASE verified at `e2fd48f30b51fc82c21a446b57a6fb2a7c831fa8`.
- Plan SHA-256: `d803de1d87a922ee34d400df9835e114cad5688c1c1ad243a576ff4c046da374`.
- Task brief SHA-256: `c0fbe68283f0f5c3aaf8de37f72a3ded83142c9e8d9cf9fcd58a704aa33f06bb`.
- ADR impact: `update` — implements the loader and frontend contract portion of Proposed ADR-0048/0049; no new ADR. Both ADRs remain Proposed until the later stage surfaces and active architecture agree.
- Changed behavior is limited to the host operating-room selector contract/API/query and dashboard loader composition. No server, route rendering, UI, CSS, mutation, deployment, or live runtime changed.
- The API/query contract addition was necessary because Task 2 exposed a new server endpoint with no existing frontend parser or cache key. The selector is now strict Zod input at the existing host contract/API boundary and remains club-scoped under the existing host session query prefix.
- Commands used Node `v24.18.0`, Corepack `0.35.0`, and repository-pinned pnpm `11.13.1`.

## TDD RED → GREEN

Loader tests were replaced before production changes. The RED established auth-first ordering, explicit null selection, selector-plus-exact-detail loading, club scope on every request, parallel optional start, independent optional failure, required-detail failure, and absence of legacy dashboard/list selection. API/query tests established the missing strict selector parser, scoped endpoint, and cache key.

The initial RED command used the package `test` script with an argument separator that Vitest treated as a workspace-wide run. It ran `410` files once: `407` unchanged files passed and the three touched test files failed `10` tests for the expected missing selector/query/loader behavior. This was broader than intended; it was not repeated. Subsequent GREEN and verification used direct focused Vitest invocation.

```text
<node24-bin> npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/route/host-dashboard-data.test.ts features/host/queries/host-session-queries.test.ts features/host/queries/host-query-key-inventory.test.ts features/host/api/host-api.test.ts
```

Result: `4` files, `64/64` tests passed, `0` failures.

## Source hash → command → result → finding closure

| Closing source SHA-256 | Command | Result | Finding closure |
| --- | --- | --- | --- |
| `ccad74c6fcbd9d655310acf7913a26c0d1c85d5c0c4000e4509e5b732b21cced` (`host-dashboard-data.ts`) | focused Vitest command above | GREEN, loader file `7/7` | Host auth completes before selector work. The URL-derived club scope reaches selector, exact detail, and all optional queries. A null server selection returns explicit absent states without dependent requests. Required detail failure remains a route error. |
| `535e21b5cdc2078e6b9d0621f5da2352d1213e99f1aba1f7486212bb3f2b1654` (aggregate selector contract/API/query production source) | focused API/query/inventory tests above | GREEN, full focused set `64/64` | `GET /api/host/operating-room/current` is strict-Zod parsed; malformed selection values fail at the API boundary. Its key is club-scoped below the established host session prefix and participates in the existing host purge boundary. |
| `ccad74c6fcbd9d655310acf7913a26c0d1c85d5c0c4000e4509e5b732b21cced` (`host-dashboard-data.ts`) | parallel-start and independent-failure loader tests above | GREEN | After server-owned `sessionId` is known, exact detail plus closing status, record attention, club operations, and notification health start without serial optional waits. Each optional source returns `ready`, `absent`, or `failed` with data or a retryable typed error; one optional failure does not blank successful peers. |
| `535e21b5cdc2078e6b9d0621f5da2352d1213e99f1aba1f7486212bb3f2b1654` (aggregate Task 3 production source) | exact changed-file ESLint; `git diff --check` | ESLint exit `0`; diff check exit `0` | No lint or whitespace findings remain in the changed frontend contract, API, query, loader, and test files. |

## Contract closure

- The browser never derives current meeting selection by date or list order. No meeting-list or legacy `/api/host/dashboard` request remains in the loader.
- `scheduleSeenAvailability` remains server-owned in both selector and exact-detail responses; the loader does not synthesize or reinterpret it.
- Existing detail, closing, record, operations, and notification query helpers retain their cache scope and retry options. The new selector follows the established current-read retry policy.
- Optional errors use stable public-safe messages and `retryable: true`; raw transport payloads are not persisted into loader state.

## Verification notes and residual risk

- Targeted local absolute-path, private-key marker, cloud-key prefix, and token-prefix scan over Task 3 tracked files: no findings.
- The externally supplied untracked design mockup directory was preserved untouched and unstaged.
- The current Stage 2 route renderer still consumes the prior loader shape; its planned replacement is Stage 3 Task 6. Full frontend lint/test/build, CT, E2E, server, and public-release gates were intentionally not run for this per-task commit. Stage 3 integration remains open until the later route/UI tasks and stage gate.
