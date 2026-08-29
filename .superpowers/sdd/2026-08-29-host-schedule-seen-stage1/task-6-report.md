# Stage 1 Task 6 report

## Source and scope

- BASE: `0bfc274110b2ba399566eff19b7bb30177cc38a0`
- Task brief SHA-256: `81ed43834e8a639e01dc61497e7fb41d15f7e6d9d2a109c58fa73b4ca62e42b5`
- Runtime: Node `v24.18.0`, Corepack `0.35.0`, pnpm `11.13.1`
- Surface: member current-session frontend contract, API, query cache, route render effect, and inline recovery UI.
- ADR impact: `update` against Proposed ADR-0049. This frontend task advances that accepted direction but does not move ADR-0049 to Accepted because its full server/BFF/privacy/active-doc verification remains Stage-wide work.

## TDD evidence

### RED

Command:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/current-session/route/current-session-route.test.tsx
```

Result: exit `1`; 1 test file, 4 tests, 3 failed and 1 passed. The production route rendered the schedule, but `markCurrentScheduleSeen` was called 0 times, the conflict path never acknowledged a fresh revision, and the inline `일정 확인 다시 기록` action did not exist.

Expanded focused RED command:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/current-session/api/current-session-contracts.test.ts features/current-session/queries/current-session-queries.test.tsx features/current-session/route/current-session-route.test.tsx features/current-session/ui/current-session-review-visibility.test.tsx
```

Result: exit `1`; 4 test files, 29 tests, 7 failed and 22 passed. Failures were the missing receipt parser/write API, mutation hook/cache behavior, route acknowledgement behavior, and recovery notice.

### GREEN

Command:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/current-session/api/current-session-contracts.test.ts features/current-session/queries/current-session-queries.test.tsx features/current-session/route/current-session-route.test.tsx features/current-session/ui/current-session-review-visibility.test.tsx
```

Result: exit `0`; 4 test files passed, 29 tests passed.

Focused lint command:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx --yes corepack@0.35.0 pnpm --dir front exec eslint shared/model/current-session-contracts.ts features/current-session/api/current-session-contracts.ts features/current-session/api/current-session-api.ts features/current-session/queries/current-session-queries.ts features/current-session/route/current-session-route.tsx features/current-session/ui/current-session-page.tsx features/current-session/api/current-session-contracts.test.ts features/current-session/queries/current-session-queries.test.tsx features/current-session/route/current-session-route.test.tsx features/current-session/ui/current-session-review-visibility.test.tsx
```

Result: exit `0`; no errors or warnings.

Additional checks:

- `git diff --check` — exit `0`.
- Impeccable detector over the changed route and page targets — `[]`.

## Delivered behavior

- GET loader, query prefetch, response parser, and model transformation remain read-only. The write begins in a route `useEffect` only after a non-null session has committed to the page.
- The client idempotence key is `<clubSlug-or-unscoped>:<scheduleRevision>`, retained per `QueryClient`. A successful cached revision/remount does not write again, while separate club scopes do not share the key.
- The write sends the exact rendered positive `scheduleRevision` and parses the strict `{ scheduleRevision, seenAt }` receipt.
- Success patches only the matching current-session cache's `mySeenScheduleRevision` and `myScheduleSeenAt` fields.
- A `409` keeps the rejected revision blocked, invalidates only the current club scope, and does not loop. A newly fetched and rendered revision receives its own one-time acknowledgement.
- Network and other non-conflict errors release the attempt key and expose a small polite live-region notice with a native keyboard-operable retry button. The schedule, RSVP controls, and question fields remain rendered and operable.
- Session-expiry handling uses the existing `RECOVER_WRITE_SESSION_EXPIRY` client policy; the route adds no redirect or parallel authority-loss recovery path.

## Changed files

- `front/shared/model/current-session-contracts.ts`
- `front/features/current-session/api/current-session-contracts.ts`
- `front/features/current-session/api/current-session-api.ts`
- `front/features/current-session/queries/current-session-queries.ts`
- `front/features/current-session/route/current-session-route.tsx`
- `front/features/current-session/ui/current-session-page.tsx`
- `front/features/current-session/api/current-session-contracts.test.ts`
- `front/features/current-session/queries/current-session-queries.test.tsx`
- `front/features/current-session/route/current-session-route.test.tsx`
- `front/features/current-session/ui/current-session-review-visibility.test.tsx`
- `.superpowers/sdd/2026-08-29-host-schedule-seen-stage1/task-6-report.md`

## Residual risk and excluded validation

- Evidence is repository-local unit/JSDOM evidence, not browser, deployed, or production evidence.
- Stage-wide frontend gates and browser E2E were intentionally not run because the Task 6 controller requires focused tests only.
- Server concurrency, persistence, BFF forwarding, and privacy projection evidence belong to the other Stage 1 tasks and are not re-proven here.
