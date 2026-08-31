# Task 4.2 — Today workflow reducer/controller report

Date: 2026-09-01

Start HEAD: `adbf0c63d1f3b294cb8dcd5d3a37aa6644604484`

Branch: `codex/admin-operations-product-redesign`

## ADR impact

`none` — this task isolates the already-approved ADR-0039/ADR-0040/ADR-0050/ADR-0051 Today state, safe-command, transition-publication, and URL-restoration contracts without changing a durable product or architecture decision.

## Rulings

Ruling: `front/src/app/space-transition-producer-inventory.ts` is an allowed ownership update outside the brief's enumerated file list — Task 4.2 explicitly requires reclassification only if mutation call sites truly move, and the controller will become the sole mutation/registration owner — leaving the route as owner after moving the call sites would make the fail-closed inventory stale.

Ruling: list/detail query keys, invalidation, and query-owned publisher behavior remain unchanged — Task 2.4 already sealed observation-only execution and accepted-owner-only publication, while Task 4.2 changes only feature-local orchestration ownership — changing query policy without a failing contract would widen the refactor and risk late obsolete publication.

Ruling: ADR impact remains `none` while ADR-0050/ADR-0051 remain `Proposed` for the overall program — a controller extraction does not by itself satisfy their whole-product acceptance evidence — accepting either ADR in this task would overstate completion.

Ruling: the URL search state remains the immediate selection authority while the reducer mirrors selection for workflow transitions — browser Back/Forward can change the URL before a reducer effect commits, and rendering from the lagged reducer selection produced replacement oscillation — making reducer state the browser authority would erase restored history.

Ruling: authority generation is invalidated synchronously in the controller's authority-loss subscriber — an in-flight mutation can resolve after platform-admin cache purge while the route remains mounted on its forbidden boundary — checking the captured generation before settlement prevents that obsolete response from publishing cache, UI, copy, navigation, or return-target changes.

Ruling: confirmation changes return a completed action to `ready` but retain its success message — the pre-extraction route preserved success copy while only unlocking the next valid action set — clearing the copy would regress the characterized route contract.

Ruling: the coverage gate is rerun with `--testTimeout=15000` after the canonical script's only failure — coverage instrumentation made the source-inventory scan exceed the default 5 second test timeout while the same assertion passed in all non-coverage partitions — increasing only the harness timeout preserves assertions and exposes the real coverage result without changing product code.

## TDD evidence

### Baseline characterization

- Start state was clean at exact HEAD `adbf0c63d1f3b294cb8dcd5d3a37aa6644604484` on `codex/admin-operations-product-redesign`.
- `python3 scripts/agent-preflight.py` classified the intended files as frontend route-state/responsive-ui work and exited `0` before edits.
- Baseline focused route/snapshot/inventory/query command exited `0`: 4 files, 89 tests passed.
- The old route performed `setSnapshotTrack` and `setUrgentTrack` during render whenever combined pages, scope, page count, failure, or urgent IDs changed. Existing route tests characterized poll freeze, pending acceptance, continuation failure, mutation feedback, URL restoration, response loss, authority loss, and next-case behavior before extraction.

### RED

- Pure reducer import RED exited `1`: `admin-today-state` did not exist, so the new state-machine suite could not load.
- Hook import RED exited `1`: `use-admin-today-controller` did not exist.
- After adding only a compileable hook skeleton, assertion-level RED exited `1` with 5/5 failures: URL selection was `none`, rows were empty, action state remained `ready`, mutation target remained `none`, and response loss did not reach `unknown-outcome`.
- The exact ownership inventory command exited `1` after mutation call sites moved: `use-admin-today-controller.ts` was reported in `unclassifiedPaths`, proving the old route owner was stale.

### GREEN

- Pure reducer plus snapshot helper: exit `0`, 2 files / 19 tests.
- Hook controller: exit `0`, 5/5 tests.
- Reducer/snapshot/controller/route focused: exit `0`, 4 files / 58 tests.
- Exact ownership inventory/controller/route command after reclassification: exit `0`, 3 files / 72 tests.
- Pure transitions now own snapshot creation/poll merge, poll freeze, pending acceptance, urgent announcement dedupe, load-more dedupe, selected case, mutation target, feedback/conflict/permission/unknown states, authority clear-first, and next selection.
- The controller owns URL/query/mutation coordination and the L1 transition owner. The route only assembles boundary and ledger/action props; it contains no render-time setters, mutation hooks, or transition owner.
- Query keys and `publishAdminOperationCase` invalidation behavior are unchanged.

## Verification

- Focused transition/platform-admin partition: exit `0`, 28 files / 583 tests.
- Direct-write owner partition: exit `0`, 41 files / 397 tests.
- Task 2.4 factory/publication fence: exit `0`, 17 files / 118 tests.
- Canonical `npx --yes corepack@0.35.0 pnpm --dir front test`: exit `0`, 445 files / 4096 tests.
- `npx --yes corepack@0.35.0 pnpm --dir front lint`: exit `0`; two pre-existing fast-refresh warnings, zero errors.
- `npx --yes corepack@0.35.0 pnpm --dir front build`: exit `0`; existing chunk-size advisory only.
- Canonical `test:coverage`: exit `1` solely because the instrumented inventory test timed out at 5 seconds; 444 files / 4095 tests had passed.
- `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run --coverage --testTimeout=15000`: exit `0`, 445 files / 4096 tests; 85.69% statements, 81.40% branches, 85.91% functions, 87.41% lines. `admin-today-state.ts`: 89.18% statements / 86.27% branches.
- `./scripts/build-public-release-candidate.sh`: exit `0`.
- `./scripts/public-release-check.sh .tmp/public-release-candidate`: exit `0`; fallback path/content checks ran because `gitleaks` is not installed.
- `git diff --check`: exit `0`.
- Final `rg` inventory found no `setSnapshotTrack` or `setUrgentTrack`; `mutateAsync` and `useTransitionSafetyOwner` occur only in `use-admin-today-controller.ts`.
- Final dirty-tree preflight correctly exited `2` because every expected edit path overlapped this task's own uncommitted changes; the clean pre-edit preflight is the readiness evidence.

## Changed files

- Created `front/features/platform-admin/model/admin-today-state.ts` and its pure reducer tests.
- Added `advanceAdminOperationsSnapshot` to `front/features/platform-admin/model/platform-admin-operations-snapshot.ts`.
- Created `front/features/platform-admin/route/use-admin-today-controller.ts` and hook tests.
- Reduced `front/features/platform-admin/route/admin-today-route.tsx` to boundary and prop assembly.
- Reclassified the actual L1 mutation owner and publisher/API mounted owner in `front/src/app/space-transition-producer-inventory.ts`.
- Added this Task 4.2 report.

## Self-review

- Reviewed the complete tracked and untracked diff for route/query/model/UI direction, render-time state updates, URL restoration, mutation target capture, late publication, authority clear-first, and owner inventory.
- Fixed one characterization mismatch found during review: confirmation changes were clearing success feedback even though the existing route kept the success message while returning the action state to ready.
- Fixed one hook implementation defect exposed during RED: using lagged reducer selection as the rendered URL authority caused Back/Forward replacement oscillation; view selection now follows current search state immediately.
- Fixed one publication defect exposed by the authority-loss hook test: a late mutation could invalidate cache after purge; captured authority generation now rejects it before settlement/publication.
- No unresolved blocking finding remains.

## Not measured

- Browser E2E and component screenshot/visual checks were not run; this task changes orchestration without intentional DOM, CSS, or responsive presentation changes, and route/hook tests cover the changed surface.
- Server tests were not run because no server/API contract or transport payload changed.
- No provider, deployment, production, or private-data operation was performed.
- A professional `gitleaks` scan was not measured because the binary is unavailable; the repository's fallback public-release checks passed.
