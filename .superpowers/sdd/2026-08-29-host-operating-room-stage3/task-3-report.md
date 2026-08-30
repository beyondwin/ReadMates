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
| `bb445c95e6c2e667b3e55c85ceca3f956580a74564a3d724d5460e5f270bcda0` (`front/features/host/api/host-contracts.ts`) | focused API tests above | GREEN, included in `64/64` | The operating-room selector is strict-Zod parsed and malformed selection values fail at the API boundary. |
| `8add6703a29ee38a3cdb6689560c0a59868842e2d061f20186c68b526e67d8d1` (`front/features/host/api/host-api.ts`) | focused API tests above | GREEN, included in `64/64` | `GET /api/host/operating-room/current` uses the explicit URL-derived club scope. |
| `40f018d0042ee5871685a4da514a46378a199e3dab58de76e68b91bb12655a08` (`front/features/host/queries/host-session-queries.ts`) | focused query and query-key inventory tests above | GREEN, included in `64/64` | The selector key is scoped below the established host session prefix and participates in the existing host purge boundary. |
| `ccad74c6fcbd9d655310acf7913a26c0d1c85d5c0c4000e4509e5b732b21cced` (`front/features/host/route/host-dashboard-data.ts`) | focused loader tests above | GREEN, loader file `7/7` | Host auth completes before selector work. A null server selection returns explicit absent states without dependent requests, required detail failure remains a route error, and no frontend list/date selection remains. After server-owned `sessionId` is known, exact detail plus all four optional sources start without serial optional waits; optional results settle independently as `ready`, `absent`, or `failed`. |
| The four individual production-source hashes and file labels above | exact changed-file ESLint; `git diff --check` | ESLint exit `0`; diff check exit `0` | No lint or whitespace findings remain in the changed frontend contract, API, query, loader, and test files. This row does not aggregate test or report files. |

## Contract closure

- The browser never derives current meeting selection by date or list order. No meeting-list or legacy `/api/host/dashboard` request remains in the loader.
- `scheduleSeenAvailability` remains server-owned in both selector and exact-detail responses; the loader does not synthesize or reinterpret it.
- Existing detail, closing, record, operations, and notification query helpers retain their cache scope and retry options. The new selector follows the established current-read retry policy.
- Optional errors use stable public-safe messages and `retryable: true`; raw transport payloads are not persisted into loader state.

## Verification notes and residual risk

- Targeted local absolute-path, private-key marker, cloud-key prefix, and token-prefix scan over Task 3 tracked files: no findings.
- The externally supplied untracked design mockup directory was preserved untouched and unstaged.
- The current Stage 2 route renderer still consumes the prior loader shape; its planned replacement is Stage 3 Task 6. Full frontend lint/test/build, CT, E2E, server, and public-release gates were intentionally not run for this per-task commit. Stage 3 integration remains open until the later route/UI tasks and stage gate.
