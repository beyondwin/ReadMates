# Task 2.4 — workflow transition safety registration report

Date: 2026-08-30

Base: `b3c9c5cad478634792e6fe73dcd65608e6b25dcb`

Branch: `codex/admin-operations-product-redesign`

## Outcome

Task 2.4 registers the mounted member, host, and platform-admin dirty/pending/unknown producers with the Task 2.1–2.3 transition coordinator. Mutation factories now return observations without automatic publication; the current mounted owner publishes only after an accepted settlement. Nested UI remains callback presentation. Public takedown now consumes the current server DTO, has no invented convergence route, and has explicit authority-loss and normal-unmount recovery proofs.

The implementation started from the required clean base and did not invoke deployment, provider, production, push, or merge side effects.

## Authority and rulings

Ruling: ADR impact is `none` — ADR-0037, ADR-0039, ADR-0040, ADR-0050, and ADR-0051 already define the governing authority, recovery, and cache-publication contracts; this task wires existing producers to those accepted decisions — treating this as a new decision would duplicate or silently weaken accepted authority.

Ruling: the app controller remains the only navigation coordinator — feature owners use only `TransitionSafetyRegistrationPort` and explicit publication callbacks — allowing a feature to navigate during recovery would reintroduce competing transition authority.

Ruling: `AiGenerateTab` was split into route-owned `ai-generate-controller.tsx` plus a presentation-only component and shared presentation types — the previous UI file executed queries and mutations, contradicting the nested UI boundary — leaving it in place would make accepted-generation publication unenforceable.

Ruling: `admin-public-takedown-receipt-capsule.ts` is a dedicated support file outside the original representative list — byte-identical replay identity, authority-loss invalidation, retained-field clearing, and replay counting need an independently testable primitive — embedding it in the route would obscure the exact interleaving and retained private state.

Ruling: `use-transition-safety-owner.ts` and its optional context projection are shared support additions — all route owners need identical dirty registration, active-handle cleanup, and obsolete-owner behavior while app composition still provides the real port — duplicating adapters would make unmount behavior drift by workflow.

Ruling: pre-command `QueryClient.fetchQuery` reads in host session mutation factories remain allowed observations — they obtain the authoritative revision required to form the command and do not publish completion — replacing them with unconditional transport reads breaks cache-consistent command construction without improving publication safety.

Ruling: the two focused Playwright fixtures also mock the server-shaped admin health snapshot — the admin shell always reads it for alarm summary, and an unmocked 401 redirects to login before the takedown workbench — omitting the dependency makes the browser proof test fixture behavior rather than the product route.

Ruling: the server change is integration-fixture evidence only — the server remains the command and DTO authority and no route, policy, service, or persistence behavior changed — changing production server behavior would exceed Task 2.4 and risk altering emergency-command semantics.

Ruling: no `sessionStorage` recovery capsule is introduced — takedown canonical request fields live only in the registered in-memory receipt capsule and are cleared on completion or authority loss — persisted reason text would expand the private-data exposure surface.

Ruling: live CDN/provider execution is not measured — the focused fake-clock browser contract proves bounded browser/BFF behavior without billable or external side effects — a live purge would exceed authority and could affect real users.

## Regenerated mutation producer and import-reachability inventory

The candidate scan was regenerated from the clean current tree before implementation across `front/src/app`, `front/shared`, and all `front/features`. It combines mounted reachable writes with repository-wide exported writes. The current typed inventory has 69 entries: 25 `register`, 19 `modify`, 17 `verified-no-change`, and 8 `out-of-domain`. Recovery counts are L1 17, L2 8, L3 19, and none 25. Paths below are exact and relative to `front/`.

| Path/export | Classification | Owner(s) | Recovery | Evidence |
|---|---|---|---|---|
| `features/archive/route/account-settings-route.tsx` | register | same path | L2 | leaveMembership; authoritative-auth |
| `features/archive/route/profile-update-controller.ts` | register | same path | L1 | useUpdateMyProfileMutation; dirty-profile |
| `features/current-session/route/current-session-route.tsx` | register | same path | L1 | mutateAsync; current-session-refetch |
| `features/notifications/route/member-notification-settings-route.tsx` | register | same path | L1 | saveNotificationPreferences; dirty-preferences |
| `features/notifications/route/member-notifications-route.tsx` | register | same path | L1 | memberNotificationsActions; notifications-refetch |
| `features/auth/route/login-route.tsx` | verified-no-change | — | none | pre-auth; outside authenticated transitions |
| `features/host/queries/host-state-purge.ts` | verified-no-change | `src/app/host-authority-loss-controller.tsx` | none | authority cleanup; not a user command |
| `shared/auth/club-access-api.ts` | verified-no-change | `src/app/layouts/app-route-layout.tsx` | none | transport primitive; response ignored |
| `src/app/layouts/app-route-layout.tsx` | verified-no-change | same path | none | ambient touch; one request |
| `features/host/route/host-operations-route.tsx` | register | same path | L1 | AI defaults; accepted publication |
| `features/host/route/host-dashboard-route.tsx` | register | same path | L1 | attendance and restore mutations |
| `features/host/route/host-meeting-ledger-route.tsx` | register | same path | L2 | create session; access scope |
| `features/host/route/host-meeting-workspace-actions.ts` | register | same path | L2 | shared workflow adapter; command receipt |
| `features/host/route/host-meeting-workspace-route.tsx` | register | same path | L3 | manual notification; record recovery |
| `features/host/route/host-members-route.tsx` | register | same path | L1 | member and invitation composers |
| `features/host/route/host-invitations-route.tsx` | register | same path | L1 | invitation actions; still-unknown |
| `features/host/route/host-notification-composer-controller.tsx` | register | same path | L3 | preview and confirm |
| `features/host/route/host-notifications-route.tsx` | register | same path | L3 | notification workflow; same receipt |
| `features/host/route/host-session-editor-route.tsx` | register | same path | L3 | dirty draft; record workflow |
| `features/host/route/ai-generate-controller.tsx` | register | same path | L3 | dirty AI draft; registered commands |
| `features/host/route/host-session-ledger-route.tsx` | register | same path | L2 | restore; receipt recovery |
| `features/host/route/new-host-meeting-route.tsx` | register | same path | L2 | dirty draft; create meeting |
| `features/notifications/route/member-notifications-data.ts` | modify | `features/notifications/route/member-notifications-route.tsx` | L1 | observation only; explicit publisher |
| `features/host/route/host-members-data.ts` | modify | `features/host/route/host-members-route.tsx` | L1 | observation only; explicit publisher |
| `features/host/route/host-invitations-data.ts` | modify | invitation and members routes | L1 | uncached list; accepted refresh only |
| `features/host/route/host-session-editor-actions.ts` | modify | session editor route | L3 | observation only; explicit receipt callback |
| `features/archive/queries/profile-queries.ts` | modify | profile update controller | L1 | useMutation; explicit publisher |
| `features/current-session/queries/current-session-queries.ts` | modify | current session route | L1 | useMutation; explicit publisher |
| `features/host/aigen/queries/aigen-job-queries.ts` | modify | session editor and meeting workspace routes | L3 | useMutation; explicit publisher |
| `features/host/queries/host-invitation-queries.ts` | modify | invitation and members routes | L1 | useMutation; explicit publisher |
| `features/host/queries/host-members-queries.ts` | modify | members route | L1 | useMutation; explicit publisher |
| `features/host/queries/host-notification-queries.ts` | modify | notifications, composer, and workspace routes | L3 | useMutation; explicit publisher |
| `features/host/queries/host-session-queries.ts` | modify | dashboard, ledger, workspace actions, session ledger, and new meeting routes | L2 | useMutation; explicit publisher |
| `features/host/queries/host-session-record-queries.ts` | modify | session editor and workspace routes | L3 | useMutation; explicit publisher |
| `features/host/queries/host-session-recovery-queries.ts` | modify | session editor, workspace, and dashboard routes | L2 | useMutation; explicit publisher |
| `features/platform-admin/route/admin-shell-layout.tsx` | register | same path | L2 | onboarding; dirty preview |
| `features/platform-admin/route/admin-today-route.tsx` | register | same path | L1 | allowed actions; case history |
| `features/platform-admin/route/admin-club-detail-route.tsx` | register | same path | L3 | preview/confirm; receipt |
| `features/platform-admin/route/admin-support-route.tsx` | register | same path | L3 | dirty review; receipt |
| `features/platform-admin/route/admin-notifications-route.tsx` | register | same path | L3 | preview/confirm; receipt |
| `features/platform-admin/route/admin-ai-ops-route.tsx` | register | same path | L3 | preview/confirm; receipt |
| `features/platform-admin/route/admin-public-takedown-route.tsx` | register | same path | L3 | identical replay; authority-loss zero replay |
| `features/platform-admin/queries/platform-admin-ai-ops-queries.ts` | modify | AI ops route | L3 | useMutation; explicit publisher |
| `features/platform-admin/queries/platform-admin-notifications-queries.ts` | modify | admin notifications route | L3 | useMutation; explicit publisher |
| `features/platform-admin/queries/platform-admin-operations-queries.ts` | modify | Today route | L1 | useMutation; explicit publisher |
| `features/platform-admin/queries/platform-admin-queries.ts` | modify | admin shell and club detail routes | L3 | useMutation; explicit publisher |
| `features/platform-admin/queries/platform-admin-support-queries.ts` | modify | support route | L3 | useMutation; explicit publisher |
| `features/platform-admin/queries/platform-admin-takedown-queries.ts` | modify | public takedown route | L3 | one confirm request; explicit publisher |
| `features/host/aigen/ui/AiGenerateTab.tsx` | verified-no-change | AI route controller | none | presentation slot |
| `features/host/aigen/ui/PreviewView.tsx` | verified-no-change | session editor route | none | callback only |
| `features/host/aigen/ui/RegenerateModal.tsx` | verified-no-change | session editor route | none | callback only |
| `features/host/club/ui/ClubAiDefaultsSection.tsx` | verified-no-change | host operations route | none | callback only |
| `features/host/ui/host-operations-page.tsx` | verified-no-change | host operations route | none | callback only |
| `features/host/ui/host-members.tsx` | verified-no-change | host members route | none | callback only |
| `features/host/ui/host-invitations.tsx` | verified-no-change | host invitations route | none | callback only |
| `features/host/ui/host-session-editor.tsx` | verified-no-change | host session editor route | none | callback only |
| `features/host/ui/meeting-ledger/upcoming-book-list.tsx` | verified-no-change | meeting ledger route | none | callback only |
| `features/host/ui/session-editor/session-record-workspace.tsx` | verified-no-change | session editor route | none | callback only |
| `features/host/ui/session-editor/session-record-completion-panel.tsx` | verified-no-change | session editor route | none | callback only |
| `features/platform-admin/ui/domain-provisioning-panel.tsx` | verified-no-change | admin club detail route | none | callback only |
| `shared/auth/club-access-query.ts` | verified-no-change | app route layout | none | best effort; response ignored; one request |
| `features/host/actions/invitations.ts#createInvitation` | out-of-domain | — | none | exported write; mounted import count 0 |
| `features/host/actions/invitations.ts#revokeInvitation` | out-of-domain | — | none | exported write; mounted import count 0 |
| `features/current-session/actions/save-checkin.ts#saveCheckin` | out-of-domain | — | none | exported write; mounted import count 0 |
| `features/current-session/actions/save-question.ts#saveQuestion` | out-of-domain | — | none | exported write; mounted import count 0 |
| `features/current-session/actions/save-question.ts#saveQuestions` | out-of-domain | — | none | exported write; mounted import count 0 |
| `features/current-session/actions/save-review.ts#saveLongReview` | out-of-domain | — | none | exported write; mounted import count 0 |
| `features/current-session/actions/save-review.ts#saveOneLineReview` | out-of-domain | — | none | exported write; mounted import count 0 |
| `features/current-session/actions/update-rsvp.ts#updateRsvp` | out-of-domain | — | none | exported write; mounted import count 0 |

The audit result is exact: no unclassified paths, no out-of-domain export with a mounted import, no modified factory without a mounted owner, and no verified UI leaf with forbidden publication imports.

## Plan-listed files intentionally unchanged

Ruling: `host-draft-route-navigation-guard.ts` and `use-session-record-draft-controller.ts` remain unchanged — their existing `shouldBlockNavigation` projection is consumed by the new route owner without weakening their domain-specific guard — editing them would duplicate dirty-state authority.

Ruling: `src/app/layouts/app-route-layout.tsx`, `shared/auth/club-access-query.ts`, and their two exact tests remain unchanged — source and request-count tests already prove a response-ignored one-time ambient touch, and the inventory classifies it as verified-no-change — registering it would incorrectly turn a best-effort timestamp into a user command.

Ruling: the existing route tests for account settings, current session, member notification settings, host operations, host notification composer, Admin Today, admin club detail, admin support, admin notifications, admin AI ops, and admin shell remain unchanged — the existing behavior suites pass in the 504-test focused partition while shared-owner, factory-fence, and newly added route-owner tests cover the new settlement boundary — mechanical edits with no new assertion would add churn but no evidence.

Ruling: `host-session-editor-route.test.tsx` remains unchanged — its existing route behavior is covered in the focused partition and the new `host-session-editor-transition-safety.test.tsx`, workspace-action test, action publisher test, and full legacy route suite cover registration/publication composition — altering the planned file merely to mark it changed would weaken review signal.

Ruling: `upcoming-book-list.test.tsx` and `domain-provisioning-panel.test.tsx` remain unchanged — their production leaves remained callback-only and the nested boundary test plus their existing focused tests pass — owner registration belongs in the supplying routes.

Ruling: `host-invitation-queries.test.ts` and `host-members-queries.test.ts` remain unchanged — those factories were already observation-only; new owner-chain and data tests prove accepted-only publication, while the unchanged factory tests pass in the exact fence — adding synthetic factory changes would risk reintroducing automatic writes.

## Scope additions outside the representative file list

Ruling: `my-page-route.test.tsx` changed only to expose the new explicit profile publisher from its module mock — full-suite RED showed the mock no longer represented the module contract — leaving it absent would test an impossible runtime module.

Ruling: `aigen-presentation-types.ts`, `ai-generate-controller.tsx`, and the new presentation `AiGenerateTab.tsx` are the minimum extraction needed for route-owned effects — nested UI must not import query/API/router code — keeping the old single file would violate the Task 2.4 UI boundary.

Ruling: `host-session-editor.test.tsx` injects an AI renderer in its presentation harness — the real app injects the route controller, while the UI test must remain independent of it — importing the controller into the UI test would reverse the intended dependency.

## TDD and debugging evidence

- Inventory/boundary RED: eight planned source-fixture tests initially failed because Vitest transformed `import.meta.url` into a non-file URL; changing the test reader to repository-relative fixture paths produced 11 files / 14 tests GREEN.
- Nested UI boundary RED: two tests failed because the matcher recognized only one feature segment and test-only imports polluted the production scan; multi-segment UI matching and production-only import scanning produced 12/12 GREEN.
- Focused partition RED: 50/51 files and 502/504 tests passed; two session-record workspace tests lacked the newly injected AI presentation renderer. Supplying the renderer produced 51/51 and 504/504 GREEN.
- Front lint RED: five errors were diagnosed and fixed; final lint is exit 0 with four existing Fast Refresh warnings.
- Playwright RED: two runs were 0/5 because the admin shell's unmocked health snapshot returned 401 and redirected to login. Network response instrumentation identified `/api/bff/api/admin/health/snapshot`; adding the real shell dependency to the fixtures produced 5/5 GREEN.
- Full frontend RED: 5/440 files and 19/3933 tests failed. Cache-aware authoritative pre-command lookup had been replaced by unconditional fetch, notification failure reconciliation was not invoked by its owner, and presentation tests lacked the injected AI renderer. No automatic mutation publication was restored; the corrected owner boundary produced 440/440 and 3933/3933 GREEN.
- Server CI RED: the first run found three MaxLineLength issues in the changed takedown integration test plus three pre-existing Detekt issues. The changed lines were fixed. The second run reports only the three untouched baseline issues, proven by an empty `git diff --exit-code HEAD --` over those files.

## Verification ledger

| Command | Exit | Result |
|---|---:|---|
| Exact Task 2.4 focused Vitest command from the brief | 0 | 51 files, 504 tests passed |
| Exact factory/publication fence command from the brief | 0 | 17 files, 118 tests passed |
| `npx --yes corepack@0.35.0 pnpm --dir front test` | 0 | 440 files, 3933 tests passed |
| `npx --yes corepack@0.35.0 pnpm --dir front lint` | 0 | 0 errors; 2 pre-existing Fast Refresh warnings |
| `npx --yes corepack@0.35.0 pnpm --dir front build` | 0 | 789 modules; chunk-size warning only |
| Exact focused Playwright command from the brief | 0 | Chromium 5/5 passed |
| `./server/gradlew -p server integrationTest --tests '*PlatformAdminPublicTakedownIntegrationTest' --rerun-tasks` | 0 | fresh BUILD SUCCESSFUL, 5 executed tasks |
| `./scripts/server-ci-check.sh` after scoped style fix | 1 | only 3 untouched baseline Detekt violations remain |
| `git diff --exit-code HEAD --` on the 3 baseline violation files | 0 | no Task 2.4 changes |
| `npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts src/app/space-transition-producer-inventory.test.ts` | 0 | 2 files, 17 tests passed |
| exact 15-query `rg` scan for `onSuccess`/`onError` | 0 | no automatic handlers found |
| `./scripts/build-public-release-candidate.sh` | 0 | candidate built |
| `./scripts/public-release-check.sh .tmp/public-release-candidate` | 0 | public check passed with fallback scanner |
| `git diff --check` | 0 | no whitespace errors |
| changed/untracked path scan for local absolute paths, private-key headers, and AWS access-key shapes | 0 | no matches |
| in-progress `python3 scripts/agent-preflight.py ... --json` | 2 | expected safety stop because planned edit paths overlapped the dirty implementation |
| post-commit `python3 scripts/agent-preflight.py --intent change --base b3c9c5cad478634792e6fe73dcd65608e6b25dcb --paths front --paths server/src/test/kotlin/com/readmates/admin/takedown/api/PlatformAdminPublicTakedownIntegrationTest.kt --paths .superpowers/sdd/2026-08-30-platform-admin-operations-product-redesign/task-2-4-report.md --json` | 0 | clean tree; no stop reasons |

The exact focused and factory commands are the literal file lists in `task-2-4-brief.md`; they were run without omission. Corepack was unavailable, so every frontend command used the required `npx --yes corepack@0.35.0 pnpm` launcher (pnpm 11.13.1).

## Self-review

- Strict takedown parsing accepts only the server reason categories and current preview/receipt fields. `committedClubGeneration`, `limitationCode`, convergence GET, and convergence retry UI/API are absent.
- The exact authority-loss proof orders begin, unregister, authority loss, original late settlement, and reconciliation. It observes original request count 1, replay count 0, `authority-lost`, eight rejected publication surfaces including sessionStorage, cleared retained request, and registry size 0.
- The separate normal-unmount proof performs one byte-identical lookup, then clears the capsule and registry.
- Query/action factories contain no automatic `onSuccess` or `onError` publication. Explicit publisher functions are called only from registering owners after accepted settlement.
- Invitation detached recovery lists without cache writes and never replays create/reissue/revoke. Accepted owners alone invoke refresh.
- Nested UI imports no query, API, route, app, page, router, or direct fetch; the negative fixtures prove the scanner catches these imports at arbitrary UI nesting depth.
- No real member data, secret, private domain, deployment state, token, or local absolute path is present in tracked changes.

## Residual risk and not-measured evidence

- `./scripts/server-ci-check.sh` is not green because of three pre-existing, untouched Detekt violations: ReturnCount in `HostOperatingRoomCurrentService.kt`, LongMethod in `HostOperatingRoomCandidateQueries.kt`, and LongMethod in `HostOperatingRoomCandidateDbTest.kt`. The changed takedown integration test itself is clean and passes freshly.
- `gitleaks` is not installed. The repository fallback path/content scanner passed, but it explicitly is not a professional complete secret scan.
- The remaining lint warnings and the build chunk-size warning are non-blocking; the route-owner exports introduced here have narrowly documented Fast Refresh exemptions.
- Live provider/CDN purge, deployment, production data, and billable side effects were intentionally not measured.
