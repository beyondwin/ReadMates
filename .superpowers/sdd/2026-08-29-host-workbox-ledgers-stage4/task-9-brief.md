# Stage 4 Task 9 brief — BFF, browser and stage gate verification

## Scope and authority

Implement and verify only Stage 4 plan Task 9 from base `047f561a11db93539264f2ef83d694b790c1eb00`.

- Authority: Stage 4 plan SHA-256 `fac96db28c440f2b05fd7c46b49fb1e31079859ed0b8c86da075e5811da4bdd2`; Proposed ADR-0048 SHA-256 `fc1fa96bfdd3862da4dd38a9336b1dffae82bc0d7ef31f884880fdd5aa9e1b08`.
- ADR impact: `none`. Do not reopen prior design or accepted task findings.
- This task owns BFF verification, Stage 4 synthetic browser fixtures/tests, and fixes required by fresh Stage 4/full gates on Stage 4-touched code. Do not opportunistically refactor unrelated base debt.
- Preserve external untracked `design/mockups/2026-08-30-admin-operations-redesign/` untouched and unstaged. Never stop user ports 18080/5173; use isolated ports/database. No external email/provider/OAuth, real club close, deployment, tag or push.

## BFF and public-trust boundary

- Add explicit generic proxy tests for Stage 4 workbox GET, deferral PUT and deferral DELETE, plus person/settings/named-link error preservation as needed. Preserve encoded authoritative keys/cursors, query and method/body, trusted server-generated club/BFF headers, browser trust-header stripping, upstream problem status/body and DELETE 204.
- Production BFF changes are allowed only if a RED test proves the generic proxy violates the contract. Do not special-case route allowlists or weaken origin/CSRF/auth behavior.

## Synthetic browser lifecycle

- Extend isolated local-safe E2E using deterministic fake IDs/data and cleanup. Prove once each:
  1. NOW work item defers with the exact server key, appears DEFERRED, expires back to NOW, then a source-authoritative resolution appears as COMPLETED with its receipt; no client completion mutation.
  2. DRAFT schedule-unseen source is unavailable/absent as defined; AVAILABLE schedule review selects STALE/UNSEEN, visibly excludes CURRENT, and opening/selecting/editing makes no preview/confirm request.
  3. Preview then schedule-revision or eligibility drift rejects before dispatch/outbox; partial/unknown confirmation remains visibly reconcilable and does not auto-resend. Provider delivery remains `not measured`.
  4. Pending member approval resolves the source through the real local API, then person detail is direct, privacy allowlisted, cross-club denied, and attendance cursor continuation preserves identity/snapshot behavior.
  5. Named invitation link creation exposes its share path once and persists no raw token in browser-visible history/list; local signed OAuth acceptance is covered by existing focused integration evidence rather than invoking Google. Settings/co-host/history use revision/idempotency, authority loss fails closed, and club close stops at mocked preview/confirm evidence without ending a real club.
  6. Both workbox and settings/person history cursor continuations use exact opaque server cursors and preserve loaded rows on controlled stale/error recovery.
- Use the smallest number of serial specs/fixtures that prove these boundaries. No screenshot churn unless a focused assertion requires it. Do not rerun the unchanged, already-sealed admin login-return lane; cite its base hash/failure as unchanged residual evidence rather than spending another full pass.

## Stage 4 fresh gates and fixes

- Fix the known Stage 4 typography regression: remove the forbidden `--font-editorial` use from Task 7 CSS using the repository's allowed current editorial typography contract; run the exact typography test.
- Run fixture export twice and require the fixture tree stable; run both endpoint-backed contract integration classes.
- Run the pinned Node 24/Corepack frontend gates exactly: full `lint`, full `test`, full `build`, full CT once, and the changed Stage 4 host E2E lanes. If a full command fails, classify source hash and isolate whether it is Stage 4 regression or unchanged baseline before fixing. Do not claim skipped/non-green checks passed.
- Run `./scripts/server-ci-check.sh`, then full `./server/gradlew -p server integrationTest`. Fix Stage 4-introduced ktlint/detekt/architecture/test failures; do not suppress rules or alter approved architecture baselines unless a real fixed boundary requires a reviewed evidence update.
- Build and verify the public release candidate exactly once after code gates: `./scripts/build-public-release-candidate.sh` then `./scripts/public-release-check.sh .tmp/public-release-candidate`. If `gitleaks` is unavailable, record it and run the repository's existing fallback/token/private-path scans without claiming gitleaks passed.
- Run `git diff --check`, manifest verification and targeted public safety. Reports must redact absolute runtime paths as `<node24-bin>` and contain no secrets, account identities, private domains, provider bodies or token values.

## TDD, commits and evidence

1. RED BFF tests, RED browser cases and exact RED typography contract before fixes.
2. Implement the smallest test/fixture/support and Stage 4 regression fixes; focused GREEN before full gates.
3. Seal `source hash -> command -> result -> finding closure`, exact counts, skipped/not-measured external delivery and any unchanged baseline reuse in `task-9-report.md` plus SHA-256 manifest.
4. Force-add this brief/report/manifest and commit exactly `test(host): verify lifecycle operating room stage`.

## Exclusions

- No authority-doc redesign, new product behavior beyond a proven Stage 4 regression fix, external email/provider/OAuth, real user/club destructive mutation, deploy, push, PR or tag in this task.
