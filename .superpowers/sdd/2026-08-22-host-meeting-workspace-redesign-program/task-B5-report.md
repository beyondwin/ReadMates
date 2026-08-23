# B5 — Semantic host meeting task navigation report

Status: `DONE_WITH_CONCERNS`

ADR impact: `none`. This task implements the pure-model portion of Proposed ADR-0019 and Proposed ADR-0027 without changing either decision record or its status. Proposed ADR-0026 remains compatible and untouched; shared global-shell wiring is outside B5.

## Implementation

- Added the six unordered meeting tasks: `overview`, `responses`, `attendance`, `records`, `notifications`, and `history`, with the approved Korean labels and scoped task hrefs.
- Added `HostMeetingTask`, `HostMeetingTaskLink`, and `HostMeetingLocation` as the new semantic model. The public meeting view contains lifecycle, recommended primary action, task links, and publication readiness; it has no progress, ordinal, step, position, completion, or derived lifecycle fields.
- Added a pure query parser and URL builder. `section=basic` maps to overview with edit open; legacy `records=json` and `aigen=1` map to records; invalid, repeated, or conflicting owned evidence safely maps to overview; canonical and legacy evidence is accepted together only when it agrees.
- Preserved the current pathname, unrelated query parameters, and hash when building task links. The model does not read or mutate browser history; identical location snapshots parse to identical semantic targets through Back/Forward ordering.
- Derived task badges only from supplied stored facts: unanswered response count, unknown attendance count, and record draft/review state. Lifecycle and date can change the recommended action but cannot change task badges or the authoritative lifecycle.
- Retained only the existing `HostSessionWorkspace*` names as explicitly deprecated internal Task 5→8 compatibility exports. They preserve the current editor compile/runtime contract until B8 migrates imports; no new legacy naming surface was introduced.

## TDD evidence

Initial RED:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-session-workspace-model.test.ts features/host/model/host-session-workspace-navigation.test.ts`

- Failed as intended: 2 files, 34/34 tests failed because `buildHostMeetingWorkspace`, `parseHostMeetingLocation`, and `buildHostMeetingUrl` did not exist.
- The failures were missing semantic production behavior, not fixture, syntax, or environment errors.

Self-review RED:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-session-workspace-navigation.test.ts -t 'invalid non-record source'`

- Failed as intended: 1 failed, 21 skipped because `section=basic&source=unknown` opened the editor instead of taking the invalid-value overview fallback.
- The parser now validates a supplied record source before resolving any task.

Final focused GREEN:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-session-workspace-model.test.ts features/host/model/host-session-workspace-navigation.test.ts`

- PASS: 2 files, 35/35 tests.
- Coverage includes all six tasks, scoped hrefs, unrelated query/hash retention, overview edit, manual/AI/JSON record sources, both legacy links, invalid values, canonical precedence, deterministic Back/Forward snapshots, stored-state badges, all lifecycle action families, invalid dates, and CLOSED record actions.

## Regression and static verification

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-session-editor-view-model.test.ts features/host/ui/session-workspace/host-session-workspace.test.tsx features/host/route/host-session-editor-route.test.tsx tests/unit/frontend-boundaries.test.ts`

- Existing model/UI/route compatibility: PASS, 3 files and 111 tests.
- Architecture boundary: FAIL, 1 test, due to the four already documented B2/B3 feature-route→`src/app` imports in `member-session-detail-data.ts` and `host-session-editor-data.ts`. B5 added no feature→app/page/router/API/fetch dependency.

Additional checks:

- `npx --yes corepack@0.35.0 pnpm --dir front lint` — PASS.
- `npx --yes corepack@0.35.0 pnpm --dir front build` — PASS, Vite transformed 702 modules.
- `git diff --check` — PASS before report creation; re-run immediately before commit.

## Self-review

- Public semantics: the new view exposes one unordered task-link collection, not a lifecycle stepper or completion model. The only remaining progress shape is isolated behind the explicitly deprecated editor compatibility export scheduled for B8 migration/B10 removal.
- URL authority: task hrefs retain the scoped `/clubs/:slug/app/host/sessions/:sessionId` owner and never rewrite the club or session path. Invalid inputs only return a pure overview location; they do not request URL mutation.
- Lifecycle authority: `view.lifecycle` is exactly the supplied server lifecycle. Date and stored state only select a recommended action and semantic task target; there is no next-lifecycle field or automatic transition.
- Badge authority: changing only lifecycle/date leaves task badges identical. Badge text appears only when the supplied stored count/flag calls for it.
- Dependency direction: production changes import only same-feature pure navigation/types and the existing shared meeting-language model. There is no React, React Router, fetch, API client, browser global, or runtime service dependency.
- Public-repo safety: test data uses placeholder club/session paths and `.test` origins; no secret, private domain, deployment state, real member data, or local absolute path was added.

## Concerns

- The aggregate architecture boundary is not green because of the pre-existing four feature-route→app imports listed above. This is an integration residual for the later route decomposition/boundary task, not a B5 regression.
- The deprecated `HostSessionWorkspace*` adapter intentionally preserves the incumbent progress UI until B8 migrates route consumers and B10 replaces the presenter. New code must use the semantic `HostMeeting*` surface; the compatibility exports should be deleted rather than extended after migration.
- Browser/E2E and component tests were not run because B5 changes only pure model/navigation behavior and intentionally does not wire or alter UI. B8/B10 own route-panel integration and adaptive navigation browser evidence.
- Proposed ADR-0019 and ADR-0027 must remain `Proposed` until route integration, UI behavior, browser evidence, and active architecture all agree.

## Fix round 1

Status: `DONE_WITH_CONCERNS`

ADR impact: `none`. The fixes tighten the B5 pure parser/builder contract and restore the already approved B5→B8 compatibility boundary. They do not add or change a durable architecture decision.

### Findings closed

- Owned-query validation now inspects every occurrence of `task`, `section`, `source`, `records`, and `aigen`. Any repeated key—including identical repetitions—any invalid value, or conflicting canonical/legacy evidence fails closed to the semantic overview location with edit closed and manual source. Compatible single canonical/legacy evidence remains accepted.
- URL building no longer round-trips unrelated parameters through `URLSearchParams`. It removes only decoded owned-key tokens, retains all unrelated raw tokens and their original order/encoding/separators, preserves the hash and pathname/trailing slash exactly, and appends canonical owned tokens predictably. Malformed, unsupported-scheme, credential-bearing, network-path, control-character, backslash, and double-slash-path inputs return the safe `/` href without throwing.
- Direct `HostSessionWorkspace*` characterization is restored until B8: prior panel/source parsing precedence, legacy links, exact URL/CTA/panel targets, lifecycle status labels, progress states/positions, and applied-but-publication-blocked behavior. `HostSessionWorkspacePanel` and `HostSessionWorkspaceLocation` now have one source in the compatibility model and are only re-exported from navigation.

### TDD evidence

Owned-query cross-product RED:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-session-workspace-navigation.test.ts -t 'owned|conflicting'`

- RED: 11 failed, 6 passed, 21 skipped. The old get-first parser accepted repeated keys, hid later invalid occurrences, and allowed conflicting canonical/legacy evidence.
- Selected GREEN after implementation: 33 passed, 5 skipped with the mapping cases included.

Raw URL preservation and safety RED:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-session-workspace-navigation.test.ts -t 'raw|encoded owned|path|safe overview'`

- RED: 8 failed, 5 passed, 34 skipped. Re-serialization changed `%20`/`+`, hex case, duplicate/bare/blank tokens and malformed absolute input threw.
- GREEN: 13 passed, 34 skipped after raw token surgery and safe input classification.

Compatibility restoration RED:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-session-workspace-model.test.ts features/host/model/host-session-workspace-navigation.test.ts`

- RED: 3 failed, 96 passed. The semantic parser delegation had changed the incumbent source-outside-records and canonical-over-legacy adapter cases.
- Compatibility GREEN: 99/99 before adding the remaining direct progress characterizations.

Safe-input symmetry self-review RED:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-session-workspace-navigation.test.ts -t 'safe overview href'`

- RED: 1 failed, 4 passed, 71 skipped because a credential-bearing `URL` object bypassed the equivalent string-input rejection.
- GREEN: 5 passed, 71 skipped after applying the same credential check to both input representations.
- Final focused GREEN: 2 files, 109/109 tests passed.

### Regression and static verification

- `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run features/host/model/host-session-editor-view-model.test.ts features/host/ui/session-workspace/host-session-workspace.test.tsx features/host/route/host-session-editor-route.test.tsx` — PASS, 3 files and 102/102 tests.
- `npx --yes corepack@0.35.0 pnpm --dir front lint` — PASS after replacing the equivalent control-character regular expression with lint-compliant code-point checks.
- `npx --yes corepack@0.35.0 pnpm --dir front build` — PASS, Vite transformed 702 modules.
- No UI production wiring, browser component test, or E2E test was added or run in this pure model/navigation fix round. Existing UI/route unit regressions were run only to characterize the compatibility boundary.

### Self-review and concerns

- The semantic parser and compatibility parser share only owned-key validation; their resolution rules remain deliberately independent so stricter B5 semantics cannot silently alter pre-B8 route/UI behavior.
- The builder returns pathname/query/hash hrefs for both relative and absolute inputs, preserving the established caller contract rather than retaining absolute authority in navigation output.
- Invalid parser input returns a pure semantic value only. No test or implementation reads, replaces, pushes, or otherwise mutates browser history.
- The pre-existing feature-route→app architecture boundary residual documented above remains untouched. B8 still owns compatibility import migration; the restored deprecated shapes must not gain new consumers or survive beyond that migration window.
