# B3 — Host meeting and record route ownership report

Status: `DONE_WITH_CONCERNS`

ADR impact: `none`. This implements the existing Proposed route/list ownership and cursor-safety decisions; no ADR status changed.

## Implementation

- Separated host primary ownership into `오늘` (`/host`), `모임` (`/host/sessions`), `멤버` (`/host/members`), and `기록` (`/host/records`) for both unscoped compatibility and club-scoped route trees.
- Added a dedicated meeting list loader/model/UI boundary for `DRAFT/OPEN` rows and creation. The list preserves server order, offers one empty-state CTA, links active meetings directly to their canonical work surface, and does not add KPI cards.
- Moved the record ledger owner to `/host/records`, restricted it to `CLOSED/PUBLISHED`, removed lifecycle filters/create actions from that surface, and kept `/host/sessions?view=trash` as the only named trash compatibility entry.
- Added strict `mode=meeting|record` API/query contracts. Mode requests never send `state|states`, cursors remain opaque, and mode parsers reject opposite-lifecycle DTOs.
- Implemented `LIST_CURSOR_STALE` recovery on both list owners: accumulated pages are discarded, navigation replaces the canonical no-cursor URL, the change is announced, the list heading receives focus, and the first page is refetched.
- Hardened pagination against an empty next page replay and against background first-page refresh mixing: pagination ownership is tied to the authoritative base query timestamp, so accumulated rows from an earlier list epoch are not rendered with a refreshed base page.
- Changed host editor list prefetch to `mode=meeting`; the editor detail remains the single canonical body and is not duplicated on `오늘`.
- Updated desktop/mobile navigation, mobile headings/back targets, route observability, URL return targets, and legacy layout assertions to the stable four-destination host IA.
- Added an executable destination inventory with both unscoped and `:slug`-scoped member/host/public counterparts. It asserts exact meeting-list and record-list lifecycle ownership and the single trash compatibility URL.

## TDD evidence

Initial RED:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/routes/host.test.tsx src/app/host-route-destination-inventory.test.ts features/host/api/host-api.test.ts tests/unit/host-contract-zod.test.ts features/host/model/host-meeting-list-model.test.ts features/host/ui/meeting-list/host-meeting-list.test.tsx`

- Failed as intended: 6 files failed, 6 tests failed, 24 passed. Missing meeting-list modules/inventory, mode parsing/API behavior, and `/records` ownership caused the failures.

Self-review RED rounds:

- Editor loader prefetch: `... vitest run features/host/route/host-session-editor-route.test.tsx -t "prefetches the meeting-owned list"` failed 1/1 because the legacy mixed list API was still used; GREEN passed after switching to `hostMeetingSessionListQuery`.
- Base-page refresh: the model regression first failed because `hostMeetingListBaseRefresh` did not exist. A synchronous effect implementation then failed `react-hooks/set-state-in-effect`; the final timestamp-owned derived-state model passed without the effect.
- Scoped inventory: `... vitest run src/app/host-route-destination-inventory.test.ts` failed 4/4 because scoped counterparts were absent; GREEN passed 4/4 after every member/host/public entry gained an executable scoped destination.

Final GREEN:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/routes/host.test.tsx src/app/host-route-destination-inventory.test.ts features/host/api/host-api.test.ts tests/unit/host-contract-zod.test.ts features/host/model/host-meeting-list-model.test.ts features/host/ui/meeting-list/host-meeting-list.test.tsx features/host/model/host-session-ledger-model.test.ts features/host/ui/host-session-ledger.test.tsx`

- PASS: 8 files, 52 tests.

## Verification

- `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/route/host-session-editor-route.test.tsx tests/unit/spa-layout.test.tsx src/app/layouts/app-route-layout.test.tsx features/host/api/host-session-record-api.test.ts features/host/route/host-dashboard-data.test.ts features/host/route/host-dashboard-route.test.tsx features/host/route/host-meeting-ledger-route.test.tsx features/host/ui/meeting-ledger/host-meeting-ledger.test.tsx shared/observability/route-patterns.test.ts tests/unit/responsive-navigation.test.tsx tests/unit/route-continuity.test.ts` — PASS: 11 files, 192 tests.
- `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run src/app/host-route-destination-inventory.test.ts` — PASS: 1 file, 4 tests.
- `npx --yes corepack@0.35.0 pnpm --dir front lint` — PASS.
- `npx --yes corepack@0.35.0 pnpm --dir front build` — PASS: Vite transformed 695 modules and completed the production build.
- `git diff --check` — PASS before report creation; re-run immediately before commit.
- `npx --yes corepack@0.35.0 pnpm --dir front test` — aggregate completed: 301/303 files and 2504/2506 tests passed. The two residual failures are listed below and are not claimed as passing.

## Self-review

- Record list owner: verified `CLOSED/PUBLISHED` list inventory entries, record API calls, navigation, return targets, and observability resolve to `/host/records`; the canonical per-meeting detail remains `/host/sessions/:sessionId` as required by the existing URL contract.
- Scoped destinations: verified every inventory row includes an unscoped compatibility href and a `/clubs/:slug` counterpart; the four scoped host primaries are distinct.
- Cursor recovery: verified stale meeting/record cursors discard accumulated rows, replace the canonical URL, announce recovery, and focus the heading.
- Empty-page pagination: verified an empty fetched page with its own next cursor does not replay the previous base cursor.
- Cross-epoch pagination: verified a refreshed authoritative first page cannot render accumulated rows owned by the previous base query timestamp.
- Surface ownership: verified `오늘` contains attention/next-action overview only, `/sessions` owns meeting creation/listing, `/records` owns record listing, and `/records?view=trash` is not treated as a trash filter.
- No mixed-state requests, client cursor merging, cross-page sorting, duplicated editor body, or KPI cards were introduced.

## Concerns

- The full frontend aggregate retains two known B1 residuals outside B3 behavior: `frontend-boundaries.test.ts` reports the existing app-module imports from `member-session-detail-data.ts` and `host-session-editor-data.ts`; `host-session-editor.test.tsx` expects the old `기록을 공개했습니다.` status while runtime uses the B1 canonical `게스트·멤버 노트에 기록을 게시했습니다.` copy.
- Browser/E2E validation was not part of the B3 brief and was not run in this task. Program-level browser and release-risk validation should exercise scoped `/host`, `/host/sessions`, `/host/records`, trash compatibility, and a forced `LIST_CURSOR_STALE` response.
