# Stage 5 Task 2 brief — lifecycle recovery state machines

Implement only Stage 5 plan Task 2 from base `f8e8424266ac318fa9a0ce20cef5e84b6c9a8320`.

- Authority: Stage 5 plan SHA-256 `827c369f52ad002bda664c57d171d5c4fd8246f3b8637c85b929a507e1c5c3bb`.
- ADR impact: `none`; prove the existing Proposed ADR-0048/0049 behavior without accepting or rewriting the ADRs.
- Read current root/front/server/execution guides required for the files you touch. Preserve external mockups, user runtime ports/containers and public-repo safety.
- Reuse sealed Stage 1-4 evidence only when its source hash is unchanged. Do not rerun a closed lane merely to restate the same fact.

## Required recovery proof

1. **403 authority loss:** revoke host authority mid-route and prove the affected club's host queries, drafts, pending workbox/mutations and return state are purged/cancelled. A HOST→MEMBER downgrade with ACTIVE membership must retain legitimate member access and existing participant seen facts; server seen rows are removed only on membership INACTIVE/deletion or owner/session deletion/anonymization.
2. **409 schedule edit:** preserve user input, fetch newest revision, show a concrete comparison and require explicit retry.
3. **Unknown mutation:** simulate response loss after commit, reconcile by the exact idempotency key, keep a concrete recovery action until `COMMITTED` or `NOT_EXECUTED`, and never send a second delivery.
4. **Partial source:** make workbox/notification fail while current meeting remains usable; retry only the failed source.
5. **Schedule lifecycle:** DRAFT unavailable; OPEN creates UNSEEN; only successful MEMBER current-session render marks exact revision CURRENT; edit makes STALE; next successful member render makes CURRENT. Host entry and GET/loader never write seen state; RSVP/attendance remain unchanged.
6. **Work lifecycle:** preparation → live → closing retains the authoritative next-action/work-item key; NOW → DEFERRED → expiry → NOW and source resolution → COMPLETED are derived without a completion write.
7. **Notification lifecycle:** preview snapshots exact edited copy, schedule revision and target set; later schedule/target change conflicts and requires re-preview; abort-after-commit reconciles without resend.
8. **People/settings:** person detail rejects cross-club membership ids and exposes no unrelated/private account fields; named invitation-link history is immutable/one-time-safe; settings enforce authority/revision; club-end preview/confirm uses only a local safe fixture.

## Execution contract

1. Inventory the existing focused unit/E2E evidence and its current hashes. State the smallest genuinely missing claim before adding tests.
2. For any production behavior gap, write focused RED first, implement the smallest fix, then run focused GREEN. Test-only evidence gaps still require a meaningful pre-change failing assertion or explicit characterization proving the missing coverage.
3. Prefer extending the existing Stage 1-4 synthetic/local-safe E2E fixtures instead of creating a parallel harness. No external OAuth/provider/email or real club-end mutation.
4. Run focused route/query/model Vitest and only the changed host E2E specs on isolated ports/database. Run exact ESLint for changed frontend files; if server code/tests change, run exact focused Gradle tests plus ktlint/detekt/architecture for that changed surface.
5. Do not perform Task 3 redirects, Task 4 full gates, Task 5 docs, Task 6 ADR status or Task 7 broad breakpoint screenshot capture.
6. Seal `source hash → command → result → finding closure`, exact counts, fixture provenance, skipped/not-measured lanes, `git diff --check`, targeted public-safety scan and SHA-256 manifest in `task-2-report.md`.
7. Force-add ignored brief/report/manifest and commit exactly `test(host): prove lifecycle recovery state machines` if no production fix is required; use `fix(host): close lifecycle recovery gaps` if production behavior changes. Report which exact message was used.

Return the commit SHA, missing pre-change claims, RED/GREEN counts, focused browser scenarios, unchanged evidence reused by hash, and residual environment limits.
