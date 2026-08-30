# Stage 4 Task 6 report — frontend workbox contract, query and pure model

## Authority and scope

- Base: `780a5f687effc6646d4a1cfd062fe86f816f6332`.
- Plan SHA-256: `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`.
- ADR-0048 SHA-256: `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- Task brief SHA-256: `94da27334f18933fb861ddf53920ef10e224bf2711073230218e8ded0b291036`.
- ADR impact: `none`; ADR-0048 remains Proposed for the program closeout.
- No UI, route composition, server behavior, migration, CT, E2E or Task 7+ surface changed.
- The external `design/mockups/2026-08-30-admin-operations-redesign/` tree remained untouched and unstaged.

## Delivered contract

- The strict recursive Zod wire accepts exactly the five work-item types and all `NOW`, `DEFERRED`, and `COMPLETED` pages. It enforces the complete five-source inventory, type-specific partial failure codes, page/item state agreement, lifecycle timestamp combinations, non-negative counts including zero, nullable timestamps/receipt/cursor, safe-code receipts, visible-ASCII authoritative keys and canonical same-origin `/app/` destinations.
- GET preserves state, limit, opaque cursor and URL-owned club context. PUT and DELETE encode the server-provided authoritative key exactly once. Every JSON response is parsed before exposure; DELETE 204 completes through the guarded host-response path without reading JSON.
- Query page identity descends from `hostClubQueryPrefix(clubSlug)` and contains `workbox`, state, cursor and limit. Both deferral mutations use the club-owned host mutation convention, retain the original receipt/error, never mutate completion locally, and invalidate the whole same-club workbox root plus the current operating-room composition only after success.
- The query-key inventory and authority-loss purge now include workbox. The purge proof covers an exact-club deferred page and a late workbox continuation response without affecting other clubs.
- The pure model maps all five server types to the approved Korean labels and explicit destination categories while preserving `destinationHref`, literal zero counts, distinct page states, nullable receipt summaries and typed partial-warning data.
- The exporter now validates the Task 5 page/receipt literals through the new schemas and writes the top-level workbox fixture. The existing Zod fixtures were reused unchanged.

## TDD and sealed evidence

| Source hash / command | Result | Finding closure |
|---|---|---|
| Base plus Task 6 tests only | Node 24 `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run <five focused files>` | RED: 5/5 suites failed because the four workbox modules did not exist | tests preceded production code and failed on the requested missing behavior |
| Initial minimal implementation | same focused command | 28/33; five harness failures isolated to the missing capability `Cache-Control: no-store` header and node-vs-jsdom test environment | root causes matched existing client-contract and hook-test patterns; no product workaround added |
| Final Task 6 frontend surface | same focused command | GREEN: 5 files, 33/33 | strict API/Zod, query identity/invalidation, pure model, inventory and exact-club purge closed |
| Changed frontend files | Node 24 `npx --yes corepack@0.35.0 pnpm --dir front exec eslint <ten changed TS files>` | 0 errors and 0 warnings | focused static check closed |
| Workbox endpoint fixture contracts | `./server/gradlew -p server integrationTest --tests '*FrontendFixtureContractTest*host workbox*' --tests '*FrontendZodSchemaContractTest*host workbox*'` | GREEN: 2/2 | server endpoint/DTO shapes agree with the frontend fixture contracts |
| Deterministic fixtures | run `zod:export-fixtures`, stage intended fixture, run exporter again, then `git diff --exit-code -- front/tests/unit/__fixtures__` | second export produced no fixture-tree diff | fixture stability closed |
| Implementation hashes | `shasum -a 256 -c task-6-manifest.sha256` | 13/13 OK | exact runtime/test/fixture surface sealed; manifest excludes itself and this report |
| Patch and public safety | `git diff --check`, `git diff --cached --check`, and a targeted added-production scan | clean; no local path, private-key, account identity, token/provider-body/page-history finding | public-repository and whitespace safety closed |

## Fixture SHA-256 seals

- `host-workbox-page.json`: `4832375c953dc4aa35c5bb9a8b0deb7281d0e5e3e622d11921a83b3cfbdc42c1`.
- `zod-schemas/host-workbox-page.json`: `4832375c953dc4aa35c5bb9a8b0deb7281d0e5e3e622d11921a83b3cfbdc42c1`.
- `zod-schemas/host-workbox-deferral-receipt.json`: `3bc77233e1457a7da026d8f6336c5bc9e853a6141e454923e9226cbf151fdcc8`.

## Explicitly skipped

- Full frontend lint/test/build, full server CI/integration, Playwright E2E, CT/screenshots and public-release gates were not run; the Stage 4 plan reserves them for Task 9/stage closeout.
- No UI or route was exercised because Task 6 deliberately ships no rendering or route composition; those belong to Tasks 7 and 8.
- No real email, OAuth/provider action, deployment, push, PR or tag was performed.
