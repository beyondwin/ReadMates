# Host Notification Composer Integration v2 Release Readiness

Date: 2026-07-24

Review base: `origin/main` at `f5336b78fb21199710e852fc0f0804289a370831`

Reviewed scope: the complete `origin/main..HEAD` branch plus the Task 12 working-tree closeout, not only the implementation plan

## Decision

The branch is locally ready for review and merge after the Task 12 commit. It is not yet ready for a release tag: the tag-mode CHANGELOG guard correctly rejects concrete entries under `Unreleased`, and production migration/deploy smoke requires operator access after merge and versioning.

The reviewed branch contains two intentional release surfaces:

- Repository-agent guidance and CI/public-candidate contract changes.
- Host notification composer integration across frontend routes/state, Spring APIs and authorization, Flyway V42, notification persistence/scheduling, and operator documentation.

No push, merge, pull request, tag, deploy, production policy mutation, or live notification send was performed by this review.

## Blocker

### Release tag is blocked until `Unreleased` is versioned

`./scripts/pre-push-check.sh --full --release` stopped at `check_changelog_unreleased_guard` before running executable gates. The guard found required concrete feature categories under `## Unreleased`. This is expected for a merge candidate but must be resolved before tagging by moving the entries into the selected `vMAJOR.MINOR.PATCH` section. The emergency `--no-changelog-check` override was not used.

This does not block the Task 12 branch commit or merge. It does block claiming tag readiness.

## High

No unresolved High finding remains in the locally reviewable surface.

The full E2E lane initially exposed a trusted-BFF `PUT /api/host/notifications/policy` request returning `403`. Root cause was the new policy route missing from the method/path CSRF-ignore allowlist used by established trusted-BFF host mutations. The route is now matched explicitly, while `BffSecretFilter`, allowed-origin validation, authenticated active-host authorization, and club scoping remain enforced. Browser E2E and a narrow server regression both pass.

## Medium

### Coordinated frontend/server API rollout is required

The host notification and session-record contracts intentionally remove the legacy SEND/SKIP mutation gate:

- `PATCH /api/host/sessions/{sessionId}/visibility` returns a session plus composer context and rejects legacy `previewId`/`notificationDecision`.
- `POST /api/host/sessions/{sessionId}/record-apply-preview` returns the event type and expected draft hash.
- `POST /api/host/sessions/{sessionId}/record-apply` requires `applyRequestId`, expected draft/live revisions, and `expectedDraftHash`; it returns revision metadata plus composer context.
- Manual options/preview/confirm carry `contentRevision`; `SELECTED_MEMBERS` requires one or more unique active membership IDs from the current club.
- `GET/PUT /api/host/notifications/policy` exposes the opt-in session-reminder policy.
- `GET /api/host/sessions/{sessionId}/feedback-document/preview` exposes the staged feedback document to the current host only.

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

- Content mutations are silent by contract: next-book visibility changes, feedback/session-record apply, external JSON commit, and AI commit do not create manual dispatch, outbox, or legacy host-action decision rows.
- Preview alone does not send. Escape, close, and skip paths create no dispatch or outbox row.
- Confirm retries return the same event without duplication. Explicit resend creates one separate event.
- Selected recipients are frozen in the event metadata and delivery planning deduplicates membership IDs.
- Policy missing/OFF creates no automatic reminder outbox row; policy ON creates a deduplicated reminder event.
- Session history reads do not create legacy decision rows.
- No architecture-test baseline or exception file changed.
- No deploy workflow trigger or permission widening was found. The CI change fail-closes partial private-guidance source contracts.
- The Task 12 diff contains no committed secret, private member data, local absolute path, private domain, OCID, VM IP, or token-shaped example.
- `readmates.host-action-confirmation.required` controls staged session-record capability exposure only; it does not control dispatch.

## Migration and API Contract

The authoritative flow is:

```text
content mutation -> content/revision/apply receipt only
manual options -> preview -> confirm -> manual dispatch + outbox
policy ON scheduler -> automatic reminder outbox
```

V42 is the only migration added by the notification-composer integration. V39–V41 remain byte-for-byte unchanged by Task 12. Migration coverage verifies application from clean schema and the expected V42 tables/columns/check constraints.

Manual preview is bound to the exact content revision, selection hash, host/club/session/template, and ten-minute TTL. Confirm fails closed on stale revision, expired or altered preview, an empty/duplicate/inactive/foreign selected membership set, or an unacknowledged duplicate send. Delivery still uses the existing outbox → Kafka → delivery/inbox pipeline.

Apply receipt identity is scoped by club, session, and `applyRequestId`. Reusing the same request converges on the existing applied revision; reusing it for a different apply contract is rejected.

## Evidence and Residual Risk

Focused evidence:

- Manual notification Playwright: 10 passed, including zero-row preview, explicit defaults, selected-recipient rejection, stale/expired preview, retry idempotency, and explicit resend.
- AI commit Playwright: 3 passed, with no notification dialog or mutation request after commit.
- Composer/controller/editor Vitest: 3 files and 18 tests passed.
- Focused session-record/manual-policy server unit tests: passed.
- Focused controller, dispatch, outbox, feedback, delivery-planning, and history integration tests: passed.
- Policy CSRF regression: 4 tests passed.

Canonical local evidence:

- `./scripts/server-ci-check.sh` — passed.
- `./server/gradlew -p server integrationTest --rerun-tasks` — passed from a forced rerun.
- `corepack pnpm --dir front lint` — passed.
- `corepack pnpm --dir front test` — passed, 188 files and 1,470 tests.
- `corepack pnpm --dir front build` — passed.
- `corepack pnpm --dir front test:e2e` — passed, 90 Playwright tests.
- `./scripts/pre-push-check.sh --full --no-release` — passed, including frontend coverage at 82.5% statements, 78.06% branches, 83.12% functions, and 83.2% lines; server quality/integration; 90 E2E tests; AI config; and observability config checks.
- `git diff --check` — passed.
- `./scripts/build-public-release-candidate.sh` — passed. The repository candidate contract intentionally excludes historical/report artifacts.
- `./scripts/public-release-check.sh .tmp/public-release-candidate` — passed; gitleaks found no leaks.

The exact tag-mode command remains a recorded failure, not a pass:

- `./scripts/pre-push-check.sh --full --release` — stopped at the required CHANGELOG tag guard; executable checks were subsequently covered by the passing `--full --no-release` run and the separate public-candidate commands.

Residual release-operation risk remains until a version section is cut, remote CI passes on the pushed commit, both tag workflows succeed, V42 is observed in production Flyway history before traffic promotion, and sanitized BFF/OAuth/notification smoke succeeds. Passing local tests is evidence for merge readiness, not proof that those production steps have completed.
