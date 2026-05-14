# ReadMates Post-v1.8.3 Risk Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the release risks found in the `v1.8.3..HEAD` review before the next public-ready release.

**Architecture:** Keep the notification clean-architecture slice intact. Host intent validation stays in `HostManualNotificationService`, transactional preview consumption and dispatch audit writes stay behind `ManualNotificationDispatchPort`, frontend route state owns server calls, and UI components stay prop/callback driven.

**Tech Stack:** Kotlin/Spring Boot, MySQL/Flyway, JDBC, React/Vite, React Router 7, Vitest/Testing Library, Playwright, Gradle/Jacoco, public release scanner scripts.

---

## Review Baseline

- Baseline: `v1.8.3..HEAD`
- Branch state during review: `main` at `origin/main`
- Changed surfaces: frontend, server/API, MySQL migrations, CI/build, deploy/docs
- Review guides used: `docs/agents/docs.md`, `docs/agents/front.md`, `docs/agents/server.md`, `docs/agents/design.md`, `docs/development/architecture.md`, `docs/development/release-readiness-review.md`
- Detailed implementation handoff: `docs/superpowers/plans/2026-05-15-readmates-post-v1.8.3-risk-remediation-detailed-implementation.md`

## Findings to Close

| Priority | Risk | Current behavior | Target behavior |
| --- | --- | --- | --- |
| High | Manual notification duplicate race | `HostManualNotificationService` checks recent dispatches before the transactional insert; two different previews can both pass the check. | Duplicate decision happens inside `confirmManualDispatch` while a stable session row is locked. A second unconfirmed duplicate returns a duplicate status without creating outbox or manual dispatch rows. |
| Medium | Confirm retry depends on live session/audience state | Already-consumed preview retry recomputes current target state and can fail after the first successful confirm if the session or membership state changed. | Consumed preview lookup runs before live validation and returns a stored summary from `notification_manual_dispatches`, independent of later session/member changes. |
| Medium | Frontend stale preview | Changing template, audience, channel, or member edits after preview leaves the old preview panel confirmable. | Any selection mutation clears the preview and resend checkbox before another confirm can be submitted. |
| Low | Production port exposes bypass insert | `insertManualDispatch` remains on the production outbound port even though service code should only confirm via preview consumption. | Remove the bypass from the production port/adapter and update tests to create fixture dispatches through preview confirm. |
| Low | Server check lane duplicates work | Gradle `check` runs default `test` and Jacoco-driven `unitTest`; CI then runs `architectureTest` separately while default `test` still includes architecture tests. | Default `test` covers unit + integration and excludes architecture. Jacoco uses default `test` execution data. `unitTest`, `integrationTest`, and `architectureTest` remain explicit fast lanes. |
| Low | Release hygiene | `git diff --check v1.8.3..HEAD` fails on one trailing whitespace line; `CHANGELOG.md` still says baseline verification is not recorded. | Whitespace is fixed, verification results are recorded in `CHANGELOG.md`, and release readiness checks are rerun. |

## Implementation Phases

### Phase 1: Server Correctness

1. Extend the manual confirm persistence model so confirmed dispatch rows carry a stored `ManualNotificationConfirmSummary`.
2. Move consumed-preview retry lookup before live validation in `HostManualNotificationService.confirm`.
3. Change `ManualNotificationDispatchPort.confirmManualDispatch` to return a structured attempt status: `CREATED`, `ALREADY_CONSUMED`, or `DUPLICATE_REQUIRES_RESEND`.
4. In `JdbcManualNotificationDispatchAdapter.confirmManualDispatch`, lock the target session row before checking for an existing manual dispatch with the same club/session/template.
5. Serialize the inserted outbox payload with the final `manualDispatch.resend` value computed inside the transaction.
6. Remove `insertManualDispatch` from the production port and adapter.

### Phase 2: Frontend Stale Preview Guard

1. Add a unit test proving that preview is cleared when the host changes channel, audience, template, or membership edits.
2. Add an `onSelectionChange` callback from `ManualNotificationWorkbench` to `HostNotificationsPage`.
3. Clear `manualPreview`, `manualError`, and `resendConfirmed` on selection mutations.
4. Keep session change behavior as the stronger existing path because it also reloads options.

### Phase 3: CI and Release Hygiene

1. Make Gradle `check --dry-run` show `:test`, Jacoco report/verification, static analysis, and no duplicate `:unitTest` unless requested directly.
2. Keep `architectureTest` as the separate CI lane and ensure default `test` excludes the `architecture` tag.
3. Update `docs/development/test-guide.md` to explain the revised backend lanes.
4. Remove the trailing whitespace in `docs/superpowers/plans/2026-05-14-front-tsconfig-modernize.md`.
5. Update `CHANGELOG.md` Unreleased verification after fresh checks.

## Validation Matrix

Run these checks after implementation:

```bash
./server/gradlew -p server test --tests '*HostManualNotificationServiceTest'
./server/gradlew -p server test --tests 'com.readmates.notification.adapter.out.persistence.JdbcManualNotificationDispatchAdapterTest'
pnpm --dir front test -- host-notifications.test.tsx
./server/gradlew -p server clean test
./server/gradlew -p server check architectureTest
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check
```

Expected outcomes:

- Manual confirm retry returns the original `eventId` and stored summary even after the session no longer satisfies the original template predicate.
- A second fresh preview confirm for the same club/session/template returns duplicate-required status when `resendConfirmed=false` and inserts no rows.
- The same second confirm succeeds with `resendConfirmed=true` and stores `resend=true`.
- Frontend preview panel disappears immediately after any selection mutation.
- `check --dry-run` no longer shows the default `test` plus Jacoco `unitTest` duplication.
- Public release candidate check reports no leaks.

## Release Readiness Notes

- Passing tests close known regression paths, but the duplicate-race risk is only closed when the transaction-level guard is implemented and covered by persistence tests.
- No real member data, private domains, deployment state, local absolute paths, OCIDs, secrets, or token-shaped examples are needed for this remediation.
- If implementation changes API response shape, keep changes additive or update frontend contracts and e2e coverage in the same branch.
