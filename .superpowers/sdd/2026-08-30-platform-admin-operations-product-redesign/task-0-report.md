# Task 0.1 execution baseline report

Date: 2026-08-30

## Scope and immutable baseline

- Worktree: `ReadMates/.worktrees/admin-operations-product-redesign`
- Start HEAD: `738b65d54096fcc503cda7c33dd6af52651f1208`
- Immutable `BASE_TIP`: `8ddb02cdb21067cb58ad9e900850851599d1cdd9`
- Recorded integration commit: `7a97f17d352a73e2602e3798f0197a79bfea7022`
- ADR impact: none. This task records historical execution evidence only; it changes no product code or active architecture.

Initial `git status --short --branch --untracked-files=all` showed only `## codex/admin-operations-product-redesign`; there were no staged, unstaged, or untracked paths. `git merge-base --is-ancestor "$BASE_TIP" HEAD` exited 0. No moving branch ref was resolved.

## Pre-SDD receipt verification

The existing READY receipt in `progress.md` records these immutable values:

- design: `8f67123957fe43c38cd8236cddc1f7dd55e1fad81eefad52148a5c201dd60ce5`
- plan: `4c4044303eadcd6072bedc2fe8cb12ae06df15cfce8913e3ef244a07936ab79c`
- reviewed integrated HEAD: `7a97f17d352a73e2602e3798f0197a79bfea7022`

`shasum -a 256` over the current design and plan before this execution-receipt patch reproduced both design and plan hashes exactly. The current start HEAD contains only the later plan documentation commit, not product changes after that review. Per the task authority, this verified receipt was reused; no reviewer or product change was introduced. The historical checkmark/receipt patch itself does not alter the reviewed product specification.

## Repository-reality inventory

The integration parents are `63a85986703c33f7ddb0646953bb2523a6ceedc6` and `8ddb02cdb21067cb58ad9e900850851599d1cdd9`. Comparing the first parent to the immutable base showed these modified interface paths:

- `front/features/host/api/host-api.ts`
- `front/features/host/api/host-contracts.ts`
- `front/features/host/queries/host-session-queries.ts`
- `front/features/host/queries/host-session-queries.test.ts`
- `front/features/host/route/host-dashboard-route.tsx`
- `front/features/host/route/host-dashboard-route.test.tsx`

There were no additions or removals in that focused interface set. The integrated read chain is `fetchHostOperatingRoomCurrent` → `hostOperatingRoomCurrentQuery` and uses `queryOptions`; it is a dashboard read. The route continues to invoke existing attendance and restore mutations through `useUpdateHostSessionAttendanceMutation` and `useRestoreHostSessionChangeMutation`. The dashboard route, session-query module, and their unit/hook tests were reopened before recording this result.

Task 2.4 scan roots were rerun across all requested roots. The broad candidate expression searched TypeScript/TSX for TanStack mutation entry points, `fetch`, direct exported write verbs, and `actions.*`:

```text
front/src/app: 21 candidate files / 68 source files
front/shared: 28 candidate files / 109 source files
front/features: 300 candidate files / 806 source files
total: 349 candidate files
```

This is intentionally a broad, repository-wide candidate inventory, not a claim that every result is a reachable mutation producer. Task 2.4 remains responsible for production import reachability, factory/consumer classification, and required mounted-owner evidence.

## Commands and results

| Command | Exit | Result |
| --- | ---: | --- |
| `git status --short --branch --untracked-files=all` | 0 | Clean start state. |
| `git merge-base --is-ancestor 8ddb02cdb21067cb58ad9e900850851599d1cdd9 HEAD` | 0 | Immutable base is an ancestor. |
| Initial `agent-preflight.py` invocation with several positional values after one `--paths` | 2 | Diagnostic command error: the option is append-only. No repository readiness result was produced. |
| Corrected `python3 scripts/agent-preflight.py --intent change --base 8ddb02cdb21067cb58ad9e900850851599d1cdd9` with one `--paths` flag each for `front/src/app`, `front/shared`, `front/features`, `server/src`, the historical plan, and this report | 0 | Frontend, server, documentation; no stop reasons. |
| `command -v corepack` | 1 | Corepack is not on PATH. |
| `npx --yes corepack@0.35.0 pnpm --version` | 0 | `11.13.1`; this is the baseline launcher. |
| `./server/gradlew -p server unitTest --tests '*AuthSessionServiceTest'` | 0 | Passed. |
| `./server/gradlew -p server integrationTest --tests '*AuthMeControllerTest'` | 0 | Passed; JUnit report: 17 tests, 0 failures, 0 errors. |
| `./server/gradlew -p server architectureTest` | 0 | Passed. |
| `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts src/app/workspace-route-model.test.ts src/app/layouts/app-route-layout.test.tsx features/platform-admin/route/admin-shell-layout.test.tsx features/platform-admin/route/admin-today-route.test.tsx` | 0 | 5 files and 172 tests passed. |

The first integration-test terminal call exceeded its initial result-return window, so its produced JUnit XML was checked (17/17 passing) and the exact Gradle command was then rerun, returning exit 0 with `integrationTest UP-TO-DATE`.

## Ownership and next gate

The sequential controller's current active task implementer is the sole integration owner for `admin-copy.ts`, `admin-route-catalog.ts`, `admin-editorial-ledger.css`, shared CT fixtures, ADR indexes, and active docs. No other owner should edit those shared files concurrently.

This report records a passing baseline, not completion of later implementation stages. The 349 candidate files require the explicit Task 2.4 reachable-write classification before any transition-safety claim is made.
