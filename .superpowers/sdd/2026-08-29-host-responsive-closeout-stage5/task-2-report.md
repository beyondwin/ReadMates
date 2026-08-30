# Stage 5 Task 2 report — lifecycle recovery state machines

## Authority and scope

- Base: `f8e8424266ac318fa9a0ce20cef5e84b6c9a8320`.
- Stage 5 plan SHA-256: `827c369f52ad002bda664c57d171d5c4fd8246f3b8637c85b929a507e1c5c3bb`.
- Task brief SHA-256: `4cdd550f9c58c72fdcaf50d02382212a8906973f8be57146b024d0ed07c3f057`.
- ADR impact: `none`. ADR-0048 and ADR-0049 remain Proposed and unchanged.
- Final source manifest SHA-256: `72460758b584920b4a6a911f2ac1a38f6d0fe55d04abf0a97842b0e04d1310a2`.
- The unrelated untracked admin-operations mockup directory remained untouched and unstaged. No user runtime port/container, external OAuth/provider/email, real club-end mutation, deployment, tag, push or PR was used.

## Pre-change inventory and missing claims

The Stage 1–4 source inventory left exactly four load-bearing gaps. No other lifecycle claim was reopened.

1. Existing-session basic/schedule save returned only a generic error on `409`; it did not fetch and compare the newest exact session revision or require an explicit retry.
2. A failed notification-health source shared the broad optional-loader retry, so the operator could not retry only that source while preserving the usable current meeting and independent workbox recovery.
3. The authority-loss browser lane already proved club-scoped query/draft/mutation/return-state purge and MEMBER-safe replacement, but did not assert that an ACTIVE HOST→MEMBER downgrade preserves the participant's stored schedule-seen fact.
4. The manual-notification unknown-outcome browser lane aborted before the server commit, so it did not prove one committed dispatch/outbox event and no resend after response loss.

## Delivered recovery contract

- A basic schedule `409` now reuses the existing exact `hostSessionDetailQuery`, invalidates/fetches that exact session, preserves the form values, compares intended and latest date/start time/location, and exposes one explicit `내 일정으로 다시 저장` action. It extends the existing editor/save state; no parallel API or reconciliation state machine was introduced.
- Notification-health failure now has a source-owned retry through the existing `hostNotificationHealthQuery`. It does not revalidate the route, refetch current meeting detail or invoke the workbox retry. Generic record/club optional failures retain their existing loader retry.
- The authority-loss synthetic fixture now seals an exact ACTIVE participant fact before and after HOST→MEMBER downgrade while retaining the already-covered affected-club purge, pending cancellation and member-safe replacement.
- Manual notification response loss now occurs after the local server commits. The durable unknown receipt remains visible with a concrete ledger action; the fixture proves exactly one manual dispatch and one outbox event and observes no second confirm request.
- The workbox/manual-notification fixture cleanup now removes the newly committed synthetic notification artifacts in foreign-key-safe order. This is fixture isolation only; no production persistence or notification pipeline changed.

## TDD and focused evidence

All frontend commands used `PATH=<node24-bin>:$PATH`, `npx --yes corepack@0.35.0` and repository-pinned pnpm `11.13.1`. `<node24-bin>` denotes the locally resolved Node 24 `bin` directory; its machine-local absolute path is intentionally not persisted.

| Source hash | Command | Result | Finding closure |
| --- | --- | --- | --- |
| Final owning test SHA-256 `e4c6db47f4c41cff827d74f642a70011864ef1fa8a644707aeba396428519ab9` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/host-session-editor.test.tsx -t 'preserves a conflicted schedule' --reporter=dot` | Expected RED: 1 file, 0/1; no `일정 변경 충돌` alert existed | Proved the missing comparison and explicit-retry production behavior before implementation. |
| Final owning test SHA-256 `40c32a6afbba709ce9f5025676d07fc646d1322a889fd2b18e25ad5add8a1d19` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/route/host-dashboard-route.test.tsx -t 'retries only failed notification health' --reporter=dot` | Expected RED: 1 file, 0/1; no `알림 상태 다시 불러오기` action existed | Proved the broad-retry gap before the source-owned query retry was added. |
| Final owning E2E SHA-256 `711040b358bd43c72ef94297d2eccbd9a95da8ef8cb337a2d764db38df2bc089` | `PATH=<node24-bin>:$PATH PLAYWRIGHT_PORT=3109 PLAYWRIGHT_WORKERS=1 READMATES_API_BASE_URL=http://127.0.0.1:18089 READMATES_E2E_DB_NAME=readmates_e2e_stage5_task2 npx --yes corepack@0.35.0 pnpm --dir front exec playwright test tests/e2e/host-workbox-stage4.spec.ts --project=chromium -g 'schedule review fails closed'` | Expected RED: 1 case, 0/1; DB expected dispatch/outbox `1|1` and received `0|0` | Characterized that the old abort occurred before commit and could not support the no-resend claim. |
| Task 2 source-manifest SHA-256 `72460758b584920b4a6a911f2ac1a38f6d0fe55d04abf0a97842b0e04d1310a2` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/route/host-dashboard-route.test.tsx features/host/route/host-dashboard-data.test.ts features/host/route/host-schedule-review-route.test.tsx features/host/queries/host-session-queries.hooks.test.tsx features/host/queries/host-state-purge.test.ts features/host/model/host-operating-room-model.test.ts features/host/model/host-workbox-model.test.ts tests/unit/host-session-editor.test.tsx --reporter=dot` | GREEN: 8 files, 209/209 | Route, query, model, exact-key reconciliation, authority purge and both production fixes passed together. Existing React `act(...)` diagnostics and Node localStorage warnings remained non-failing and unchanged. |
| E2E SHA-256 `c4560f948eb32b81c4b8b2540b41f2c900b8b00685e873a4d7a5bd61518faeb8` and `711040b358bd43c72ef94297d2eccbd9a95da8ef8cb337a2d764db38df2bc089` | `PATH=<node24-bin>:$PATH PLAYWRIGHT_PORT=3109 PLAYWRIGHT_WORKERS=1 READMATES_API_BASE_URL=http://127.0.0.1:18089 READMATES_E2E_DB_NAME=readmates_e2e_stage5_task2 npx --yes corepack@0.35.0 pnpm --dir front exec playwright test tests/e2e/host-authority-loss.spec.ts tests/e2e/host-workbox-stage4.spec.ts --project=chromium -g 'revoked authority|revision conflict preserves|schedule review fails closed|partial workbox'` | GREEN: Chromium 4/4 | Proved authority downgrade plus seen preservation; real server `409` comparison/explicit retry; preview conflict plus abort-after-commit `1|1` and no resend; independent notification/workbox retries while current meeting stays usable. |
| Task 2 source-manifest SHA-256 `72460758b584920b4a6a911f2ac1a38f6d0fe55d04abf0a97842b0e04d1310a2` | `PATH=<node24-bin>:$PATH npx --yes corepack@0.35.0 pnpm --dir front exec eslint features/host/route/host-dashboard-route.test.tsx features/host/route/host-dashboard-route.tsx features/host/route/host-meeting-workspace-actions.ts features/host/route/host-session-editor-actions.ts features/host/ui/host-session-editor.tsx features/host/ui/operating-room/host-operating-room-page.tsx features/host/ui/session-editor/session-editor-actions.ts tests/unit/host-session-editor.test.tsx tests/e2e/host-authority-loss.spec.ts tests/e2e/host-workbox-stage4.spec.ts` | GREEN: exit `0`, 0 errors and 0 warnings | Focused static frontend quality closed. |
| Task 2 source-manifest SHA-256 `72460758b584920b4a6a911f2ac1a38f6d0fe55d04abf0a97842b0e04d1310a2` | `node "$HOME/.agents/skills/impeccable/scripts/detect.mjs" --json front/features/host/route/host-dashboard-route.test.tsx front/features/host/route/host-dashboard-route.tsx front/features/host/route/host-meeting-workspace-actions.ts front/features/host/route/host-session-editor-actions.ts front/features/host/ui/host-session-editor.tsx front/features/host/ui/operating-room/host-operating-room-page.tsx front/features/host/ui/session-editor/session-editor-actions.ts front/tests/unit/host-session-editor.test.tsx front/tests/e2e/host-authority-loss.spec.ts front/tests/e2e/host-workbox-stage4.spec.ts` | GREEN: JSON `[]` | No changed-interface anti-pattern finding remained. |
| Task 2 source-manifest SHA-256 `72460758b584920b4a6a911f2ac1a38f6d0fe55d04abf0a97842b0e04d1310a2` | `shasum -a 256 -c .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-2-manifest.sha256` | GREEN: 11/11 entries `OK` | Brief, production, unit and E2E sources are sealed. |
| Task 2 source-manifest SHA-256 `72460758b584920b4a6a911f2ac1a38f6d0fe55d04abf0a97842b0e04d1310a2` | `{ printf '%s\n' .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-2-report.md .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-2-manifest.sha256 .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-2-review-fix-1-brief.md .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-2-review-fix-1-manifest.sha256 .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-2-review-fix-1-report.md .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-2-review-fix-2-brief.md; awk '{print $2}' .superpowers/sdd/2026-08-29-host-responsive-closeout-stage5/task-2-manifest.sha256; } | sort -u | xargs rg -n '/(Users|home|opt|private|var|tmp)/[A-Za-z0-9._~/-]+|[A-Za-z]:\\[A-Za-z0-9._~\\-]+|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|A(KIA|SIA)[0-9A-Z]{16}|ocid1\.|gh[pousr]_[A-Za-z0-9]{20,}|sk-(live|proj)-|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-|https?://[^ ]+\.(internal|corp)'` | No matches across either report, their brief/manifest set or Task 2 source | Generic local-root and targeted secret/private-domain coverage now detects the reported path class without persisting another concrete machine path. `gitleaks` was unavailable and is not claimed. |

The first abort-after-commit GREEN attempt reached the new DB assertion but exposed teardown's obsolete delete order through a foreign-key failure. The fixture-only cleanup order was corrected, then the same case passed and the final four-case browser union passed 4/4.

## Reused unchanged evidence

Unchanged Stage 1–4 facts were not rerun. Each owner below is byte-identical, or the exact named test block is byte-identical where this task added a disjoint test to the same E2E file.

- Schedule lifecycle browser owner: `front/tests/e2e/schedule-seen-lifecycle.spec.ts` SHA-256 `b9f2aca9921c5f1fc7da718d9418b4112880ae844fc4c2d4fc08a12d9a804e9f`; DRAFT unavailable → OPEN UNSEEN → exact member render CURRENT → edit STALE → next successful member render CURRENT, with host entry/GET non-writing.
- Schedule-seen persistence owner: `SessionScheduleSeenDbTest.kt` SHA-256 `41cdf186a50cee43502ac0ef60487e455d7ce0c924e1474881faa6d9f6f81b54`; seen-row lifecycle removal stays limited to its existing membership/session ownership rules.
- Work lifecycle browser owner: `front/tests/e2e/host-lifecycle-operating-room.spec.ts` SHA-256 `82f704f2e2f96822935b136fb359e7281a81055a0a5ea96ae700eb4e0fab8e37`; preparation → live → closing remains unchanged.
- Workbox state/key owner: exact authoritative-workbox named test block SHA-256 `88f99e072d45b0ac1e87d8daaab4643f8f19ef3cfa0e5fa58d0e745d1779bdbf`, identical at base and final source; NOW → DEFERRED → expiry → NOW → source-owned COMPLETED remains the sealed Stage 4 browser claim.
- Unknown mutation owner: `host-session-queries.hooks.test.tsx` SHA-256 `8f7ee440d06011775aab9dc3c64ce8718ea49b7ce9d06a4eea078df2f60f83c8`, rerun in the 209-test focused union; exact idempotency-key reconciliation and the retained `COMMITTED`/`NOT_EXECUTED` recovery boundary remain green.
- Schedule-review contract owner: `host-schedule-review-route.test.tsx` SHA-256 `6a492f52228184e5f380710fe1849d6e9523c926cfe86cd4d96721b5bebbf1ab`, rerun in the focused union; CURRENT-disabled and STALE/UNSEEN exact preview selection remain green.
- People/settings owner: the final two named Stage 4 E2E tests, from person attendance through named-link/settings/club-close recovery, have exact block SHA-256 `01f8f1df24b5dd84d7cd1e87f0413bf05c09f2504174da95be2eea6341b60b19` at both base and final source. Their sealed Stage 4 local-safe evidence was reused; the only fixture-wide change is dependency-safe deletion of synthetic notification artifacts created by this task.
- Stage 4 evidence report: SHA-256 `d502dd76a1493cecce93c988f66fcbebb5c8a0997d448b16be418d3caec586d4`; its provider and real-club-end limits remain unchanged.

## Skipped and residual limits

- Full frontend lint/test/build, full CT, server CI, integration, full E2E and public-release gates were deliberately not run; Stage 5 Task 4 and final merged-main own those gates.
- No server source or test changed, so no fresh Gradle lane was warranted. The unchanged schedule-seen DB evidence is reused by hash.
- Provider delivery, real email, external OAuth, production data and real club-end confirmation are `not measured` and were not attempted. Notification evidence stops at local preview/dispatch/outbox and browser recovery state.
- Firefox/WebKit/mobile hardware and assistive-technology manual passes are `not measured`; this task's fresh browser proof is Chromium only.
- Professional `gitleaks` coverage is `not measured` because the binary is unavailable; the targeted fallback scan passed.
- No screenshot or baseline update ran. Task 3 redirects, Task 4 full gates, Task 5 documentation, Task 6 ADR status and Task 7 broad screenshots were not entered.
