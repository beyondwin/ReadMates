# Host Notification Composer Integration v2 Release Readiness

Date: 2026-07-24

Implementation review base: `f5336b78fb21199710e852fc0f0804289a370831` (the fetched `origin/main` merge-base used when the CPE worktree started)

Reviewed scope: the complete implementation-base-to-HEAD branch, the current `origin/main..HEAD` comparison, and the Task 12 closeout, not only the implementation plan

## Decision

The accumulated concrete CHANGELOG body is prepared locally under `v2.0.0 - 2026-07-23`, while `Unreleased` is restored to the documented single-placeholder convention. A major version is required because the old and new frontend/server API pairings are not compatible long-lived deployment states.

This preparation does not publish `v2.0.0`. At prepared commit `dc8f0f7f`, the exact `./scripts/pre-push-check.sh --full --release` command exited 0 without `--no-changelog-check`, closing the prior local `CHECK_FAILURE`. The implementation was subsequently merged into an integration branch based on current local `main` and passed the same full release gate at merge commit `e0f677cf1f78a20ae6318d92b40c16b40161a9d4`. Production migration/deploy smoke still requires operator access after local integration and a separately authorized tag.

The reviewed branch contains two intentional release surfaces:

- Repository-agent guidance and CI/public-candidate contract changes.
- Host notification composer integration across frontend routes/state, Spring APIs and authorization, Flyway V42, notification persistence/scheduling, and operator documentation.

No push, pull request, tag, deploy, production policy mutation, or live notification send was performed by this review. Local Git integration is recorded below.

## Final-review follow-up (2026-07-24)

An independent broad review of the complete branch, rather than only the implementation plan, found the following final-review issues. This follow-up records the corrected implementation, public-artifact, and active-document contracts. The exact final-HEAD canonical and release results are preserved in the CPE saved-worktree verification receipt so recording those results does not move the reviewed commit.

### Corrected documentation and public-artifact contract

- Clean public candidates intentionally omit contributor-only routing, preflight, and agent-guide files. `scripts/README.md`, the project map, README entrypoints, and development hub now keep full-source-checkout guidance conditional and make shipped candidate guidance tool-neutral.
- `public-release-check.sh` now rejects a candidate instruction that references an omitted contributor path. The tracked fixture first proved the missing check (RED), then passed after the candidate check and fixture were added (GREEN). The final public candidate build and scanner also passed in this follow-up; the exact commands are listed in the evidence section below.
- A post-integration comparison found that an ignored component-test build cache could make the candidate worktree-dependent: root `front/playwright/.cache` added 24 generated files and about 3.4 MiB while a clean integration worktree did not. The builder now prunes that cache before source inspection and copy, the candidate denylist rejects it, and a tracked fixture covers the scanner contract.
- Host feedback-document preview reads the latest live `session_feedback_documents` row, not a staged draft. `FEEDBACK_DOCUMENT_PUBLISHED` CTA/options/preview availability follows that current live document. An `OPEN` session with a current live document can use manual options → preview → confirm.
- JSON import and AI commit persist only the common draft and do not return or open a composer. Only final live apply returns composer context. Content mutation remains silent until an explicit manual confirm creates dispatch/outbox state.

### Final-review implementation fixes

- Manual confirm now locks and revalidates the preview, current host role, session state and revision, recipient membership/attendance/preferences, target fingerprint, and duplicate state in one transaction. Payload and outbox rows are built only from the locked current snapshot.
- Frontend composer requests retain the mutation-returned opaque `contentRevision`. Cached or newly loaded options must match it, first-publication apply removes cached options, and revision drift fails closed without retargeting the request.
- `OPEN` sessions with a current live feedback document can use `FEEDBACK_DOCUMENT_PUBLISHED` options → preview → confirm.
- Apply receipts use the database identity `(club, session, applyRequestId)`, retain and validate the actor and apply contract, permit the same key in another session, and return a public 409 for a conflicting actor or contract.
- Notification failures return allowlisted `{code,message,status}` bodies. Stale, expired, reused, changed-recipient, invalid-recipient, empty-audience, and duplicate paths have distinct safe recovery guidance.
- V42 ties `(revision_id, club_id, session_id)` to the same scoped session-record revision with a composite foreign key.
- Manual confirm, member lifecycle changes, viewer activation/deactivation, and attendance confirmation acquire the same club row before membership, session, participant, preference, preview, or outbox rows. This removes the cross-workflow lock inversion while preserving transaction-scoped revalidation.
- Real-service MySQL concurrency coverage uses independent `NOWAIT` probes to prove the audience mutation owns the club row while confirm has not reached the preview row. Attendance exercises the actual transition/audit path, and viewer/participant fixture timestamps and states are restored after each test.

### Evidence boundary for AI commits

Browser Playwright scenarios that mock AI responses establish browser behavior only: no dialog and no browser notification mutation after commit. They are not evidence that a server AI commit persisted a draft with zero outbox rows. The separately named server integration test uses a mock provider through the real API/Kafka/Redis/persistence path, proves an `AI_GENERATED` draft was persisted, and asserts zero `notification_event_outbox` rows.

## Blocker

No unresolved local Blocker remains.

The earlier exact `./scripts/pre-push-check.sh --full --release` run stopped nonzero at `check_changelog_unreleased_guard` before executable gates. Per the release-management policy this is `CHECK_FAILURE`, not an expected success state, and the passing `--full --no-release` run is complementary evidence rather than a substitute.

The concrete entries are now under the local `v2.0.0 - 2026-07-23` release-preparation section and the emergency `--no-changelog-check` override remains unused. The exact command was rerun at `dc8f0f7f` and exited 0, so the `CHECK_FAILURE` is closed with canonical evidence rather than a no-release substitute.

## High

No unresolved High finding remains in the locally reviewable surface.

The full E2E lane initially exposed a trusted-BFF `PUT /api/host/notifications/policy` request returning `403`. Root cause was the new policy route missing from the method/path CSRF-ignore allowlist used by established trusted-BFF host mutations. The route is now matched explicitly, while `BffSecretFilter`, allowed-origin validation, authenticated active-host authorization, and club scoping remain enforced. Browser E2E and a narrow server regression both pass.

## Medium

### Coordinated frontend/server API rollout is required

The host notification and session-record contracts intentionally remove the legacy SEND/SKIP mutation gate:

- `PATCH /api/host/sessions/{sessionId}/visibility` returns a session plus composer context and rejects legacy `previewId`/`notificationDecision`.
- `POST /api/host/sessions/{sessionId}/record-apply-preview` returns the event type and expected draft hash.
- `POST /api/host/sessions/{sessionId}/record-apply` requires `applyRequestId`, expected draft/live revisions, and `expectedDraftHash`; it returns revision metadata plus composer context.
- Manual options/preview/confirm carry `contentRevision`; next-book/reminder default to `ALL_ACTIVE_MEMBERS`, feedback/session-record default to `CONFIRMED_ATTENDEES`, all templates default to `BOTH`, and `SELECTED_MEMBERS` requires an explicit choice of one or more unique active membership IDs from the current club.
- `GET/PUT /api/host/notifications/policy` exposes the opt-in session-reminder policy.
- `GET /api/host/sessions/{sessionId}/feedback-document/preview` exposes the latest live feedback document to the current host only.

An old frontend paired with the new server, or a new frontend paired with the old server, is not a supported long-lived state. Deploy the compatible server and frontend from the same release commit and complete BFF smoke before enabling notification delivery.

### Flyway V42 is forward-only

V42 adds `session_record_apply_receipts`, `club_notification_policies`, and nullable `notification_manual_dispatches.content_revision`, and extends the manual audience check with `SELECTED_MEMBERS`. It does not rewrite existing dispatch rows. Task 12 did not change V39, V40, or V41.

The safe order is:

1. Take and verify the database backup.
2. Keep notification delivery disabled.
3. Start the target server image and require Spring startup Flyway V42 success before serving traffic.
4. Verify Flyway history and application health.
5. Deploy the compatible frontend and run BFF/OAuth smoke.
6. Enable delivery flags only after pipeline checks; enable each club reminder policy only by explicit host opt-in.

Schema downgrade is unsupported. Application rollback must keep V42 and use a schema-compatible image.

### Production proof remains outstanding

Tag-triggered `Deploy Front`, tag-triggered `Deploy Server Image`, GHCR image scan/promotion, OCI Compose promotion, production Flyway history, BFF/OAuth smoke, scheduler observation, Kafka/SMTP delivery, and rollback rehearsal were not run. They require a pushed version tag and operator-controlled credentials/runtime.

## Low

- Java 25 test runs emit existing Netty native-access and dependency deprecation warnings. They did not fail the quality or integration gates, but should remain visible during future runtime upgrades.
- Reminder policy absence intentionally means OFF. Operators should expect no automatic `SESSION_REMINDER_DUE` row until a host opts in; this is a safety default, not a migration backfill.
- Existing pre-V42 manual dispatch rows have a null `content_revision`. New dedupe/retry semantics use revision-aware rows; historical ledger display remains compatible.

## Not an issue

- Content mutations are silent by contract: next-book visibility changes and final apply do not create manual dispatch, outbox, or legacy host-action decision rows; external JSON/AI commit only saves a draft and neither returns nor opens a composer.
- Preview alone does not send. Escape, close, and skip paths create no dispatch or outbox row.
- Confirm retries return the same event without duplication. Explicit resend creates one separate event.
- Selected recipients are frozen in the event metadata and delivery planning deduplicates membership IDs.
- Policy missing/OFF creates no automatic reminder outbox row; policy ON creates a deduplicated reminder event.
- Session history reads do not create legacy decision rows.
- No architecture-test baseline or exception file changed.
- No deploy workflow trigger or permission widening was found. The CI change fail-closes partial private-guidance source contracts.
- The implementation diff from `f5336b78` contains 179 paths: 176 added or modified paths plus 3 deletions. The private-data/token/local-path scan covers the 176 paths present at HEAD; deleted paths cannot introduce current-tree values. The broad phrase scan returns one intentional negative assertion for a private-key header, with no delimiter or payload. The precise token-shaped scan returns no findings.
- `readmates.host-action-confirmation.required` controls staged session-record capability exposure only; it does not control dispatch.

## Migration and API Contract

The authoritative flow is:

```text
content mutation -> content/revision/apply receipt only
manual options -> preview -> confirm -> manual dispatch + outbox
policy ON scheduler -> automatic reminder outbox
```

V42 is the only migration added by the notification-composer integration. V39–V41 remain byte-for-byte unchanged by Task 12. Migration coverage verifies application from clean schema and the expected V42 tables/columns/check constraints.

Manual preview is bound to the exact content revision, selection hash, host/club/session/template, and ten-minute TTL. Next-book/reminder default to `ALL_ACTIVE_MEMBERS`; feedback/session-record default to `CONFIRMED_ATTENDEES`; all default to `BOTH`; and `SELECTED_MEMBERS` is explicit. Confirm fails closed on stale revision, expired or altered preview, an empty/duplicate/inactive/foreign selected membership set, or an unacknowledged duplicate send. Delivery still uses the existing outbox → Kafka → delivery/inbox pipeline.

Apply receipt identity is scoped by club, session, and `applyRequestId`. Reusing the same request converges on the existing applied revision; reusing it for a different apply contract is rejected.

## Evidence and Residual Risk

Review path:

- The complete branch review uses `origin/main..HEAD`, not only the Task 12 implementation plan or last commit.
- The Task 12 change set also received an independent per-task review. That review found the date, semantic-version, audience-default, scan-scope, and gate-classification gaps repaired by this release-preparation follow-up.
- This independent task review is repository evidence, not non-author human approval. Because the branch changes DB/API/auth surfaces, the DB/API release PR path, remote CI, and operator-owned deployment proof remain required before publication.

Focused evidence:

- Manual notification Playwright: 10 passed, including zero-row preview, the reminder template's explicit `ALL_ACTIVE_MEMBERS`/`BOTH` defaults, selected-recipient rejection, stale/expired preview, retry idempotency, and explicit resend.
- AI commit Playwright: 3 passed, with no notification dialog or mutation request after commit.
- This browser mock evidence is intentionally separate from real-AI persistence evidence. It must not be cited as proof that a real server AI commit wrote a draft and zero outbox rows; that assertion belongs to a named server integration result.
- Composer/controller/editor Vitest: 3 files and 18 tests passed.
- `NotificationManualDispatchModelsTest.manual template defaults match host workflow decisions` binds all four event-specific server defaults; `HostManualNotificationServiceTest.options expose event defaults allowed selected audience and current revisions` binds feedback/session-record options and `BOTH`; the frontend `host-notification-composer-model.test.ts` case `uses the event-specific recommended audience` binds next-book, feedback, and session-record composer choices.
- Focused controller, dispatch, outbox, feedback, delivery-planning, and history integration tests: passed.
- Policy CSRF regression: 4 tests passed.

Canonical local evidence:

- Integration merge `e0f677cf1f78a20ae6318d92b40c16b40161a9d4` combines current local `main` (`6b7792f424a1b3eebf4cf5b1338dca9719c5cf0f`) with the reviewed feature HEAD (`726e692526fa0879e9fa0cd4e8a4aa420069ed76`) without conflicts.
- `./scripts/pre-push-check.sh --full --release` — exited 0 on that integration merge. It passed frontend lint and 188 files/1,475 coverage tests, frontend build, server CI, Testcontainers integration, production AI configuration, public candidate/gitleaks, 90 Playwright E2E tests, and Prometheus/Tempo/Grafana/Alertmanager checks.
- Post-integration public-artifact RED: the root candidate had 1,829 files while the clean integration-worktree candidate had 1,805; all 24 extras were under ignored `front/playwright/.cache`, and the initial scanner fixture failed because that path was not forbidden.
- Post-integration public-artifact GREEN: shell syntax checks, `./scripts/build-public-release-candidate.sh`, `./scripts/verify-public-release-fixtures.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate` exited 0. The rebuilt root candidate has 1,805 files, contains no `front/playwright/.cache` path, and gitleaks found no leaks.
- `./scripts/pre-push-check.sh --full --release` — exited 0 at prepared commit `dc8f0f7f` without any CHANGELOG override. It passed the release guard, agent guidance, frontend lint, 188 files and 1,470 coverage tests (82.5% statements, 78.06% branches, 83.12% functions, 83.2% lines), frontend build, Zod fixture freshness, server quality/integration, production AI config, public candidate/gitleaks, 90 Playwright E2E tests, and Prometheus/Tempo/Grafana/Alertmanager checks.
- `./scripts/server-ci-check.sh` — passed.
- `./server/gradlew -p server integrationTest --rerun-tasks` — passed from a forced rerun.
- `corepack pnpm --dir front lint` — passed.
- `corepack pnpm --dir front test` — passed, 188 files and 1,470 tests.
- `corepack pnpm --dir front build` — passed.
- `corepack pnpm --dir front test:e2e` — passed, 90 Playwright tests.
- The earlier `./scripts/pre-push-check.sh --full --no-release` pass remains historical complementary evidence only; it is not used to close the prior `CHECK_FAILURE`.
- Independent `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` reruns passed after the exact gate; gitleaks found no leaks.
- Final-review public-artifact RED: `./scripts/build-public-release-candidate.sh && ./scripts/verify-public-release-fixtures.sh` exited 1 because the new omitted-contributor-path fixture was not yet enforced (`public release check should reject an instruction that requires an omitted contributor path`).
- Final-review public-artifact GREEN: `./scripts/build-public-release-candidate.sh && ./scripts/verify-public-release-fixtures.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate` exited 0. This is repository-only evidence for the public-artifact contract, not a server/frontend release gate.
- Final-review confirm revalidation RED: four MySQL cases changed host authority, selected-member activity, attendance, or email preference after preview; the old path still created an outbox row. GREEN: all four now return the exact rejection reason and create no dispatch or outbox row.
- Final-review server focused suite: manual service/adapter/API, apply service/adapter/API, receipt identity, V42 Flyway scope, `OPEN` feedback confirm, and the named AI draft/zero-outbox integration test passed.
- Final-review frontend gates: `corepack pnpm --dir front lint`, `corepack pnpm --dir front test` (188 files, 1,474 tests), and `corepack pnpm --dir front build` passed.
- Final-review affected browser gate: `corepack pnpm --dir front exec playwright test tests/e2e/host-feedback-notification-composer.spec.ts tests/e2e/manual-notifications.spec.ts` passed 11 tests.
- Final-review server PR gate: `./scripts/server-ci-check.sh` passed.
- Final-review lock-order suite: `./server/gradlew -p server integrationTest --tests '*JdbcManualNotificationDispatchAdapterTest' --rerun-tasks` passed 22 tests. Independent review approved the club-first production order, `NOWAIT` evidence, real attendance audit transition, and complete fixture restoration with no open finding.
- `git diff --check origin/main..HEAD` — passed.
- The implementation-base diff contains 179 paths: the targeted scan inspects all 176 added or modified paths present at HEAD, while 3 deleted paths are counted separately. One broad-pattern match is the negative security assertion described above; the precise private/token/local-path pattern returns no findings.
- `git tag --list v2.0.0` returned no tag, and the tag-ref digest remained `a8071d68c3691234ecaec50982780ab762582d853aad5d44d16f75c300c45190` before and after release preparation.

While this local program was running, `origin/main` advanced from the implementation merge-base to `e92409ef530df7b5b80125f8a65b8295cb7cd7d4`, and local `main` incorporated that remote commit plus separate test-suite planning work at `6b7792f424a1b3eebf4cf5b1338dca9719c5cf0f`. The reviewed feature was merged into a separate integration branch from that exact local-main commit. The merge was conflict-free and the complete `./scripts/pre-push-check.sh --full --release` gate passed on the resulting commit. This is observed local integration evidence; it is not remote CI, a push, or deployment evidence.

Residual release-operation risk remains until remote CI passes on an authorized integrated commit, both tag workflows succeed, V42 is observed in production Flyway history before traffic promotion, and sanitized BFF/OAuth/notification smoke succeeds. Passing local tests is evidence for review readiness, not proof that those production steps have completed.
