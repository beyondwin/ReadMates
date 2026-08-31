# Stage 5 Task 7 brief — mandatory lifecycle browser evidence

Implement only Stage 5 plan Task 7 from base `2d40833200434c4ed7c84be3f704138555f69242`.

- Authority: Stage 5 plan SHA-256 `827c369f52ad002bda664c57d171d5c4fd8246f3b8637c85b929a507e1c5c3bb`.
- ADR impact: `none`; capture evidence for Proposed ADR-0048/0049 without changing their status or active docs.
- Use the existing Playwright/local-safe fixtures and current host CT/E2E harness. Preserve external mockups, user ports/containers, private data and public-repo safety.
- Reuse unchanged evidence by exact hash. First inventory every required scenario and state the genuinely missing browser/accessibility claim; do not duplicate an already sealed Stage 1-4 or Task 1-3 run.

## Evidence matrix

1. Scoped/unscoped entry, all three legacy redirects, `/records` and non-current deep-link retention, combined club+role switch, and authority loss.
2. DRAFT unavailable → OPEN UNSEEN → CURRENT → STALE → CURRENT with RSVP/attendance unchanged.
3. Preparation → live → closing; 409 schedule comparison/retry; person privacy/cross-club rejection; invitation links/settings; local-safe guarded club-end preview/rejection only.
4. Notification edited preview/confirm, schedule/target conflict, partial failure and abort-after-commit unknown reconciliation with no resend. Never send real email.
5. Workbox NOW → DEFERRED → expired NOW → source-derived COMPLETED, including invalid/expired cursor recovery.
6. At 390, 768, 1024, 1200 and 1440 widths, capture the minimum public-safe evidence needed for 403, 409, partial and unknown states. Prefer semantic assertions plus targeted screenshots; do not create redundant screenshots when unchanged CT already proves a width/state.
7. Record automated accessibility output for changed browser surfaces: landmark/name uniqueness, keyboard/focus, target/overflow and serious/critical axe-equivalent findings using the repository's existing accessible test utilities. Mark manual VoiceOver/NVDA `not measured` unless actually run.

## Execution contract

1. Build a coverage table from current E2E/CT source hashes and reports. Missing evidence is a failing test/claim; unchanged proof is cited, not rerun.
2. Add or update only the smallest existing E2E/CT specs and public-safe synthetic fixture support. Production changes require a focused RED demonstrating an actual behavior defect; otherwise keep this test/evidence-only.
3. Run only changed specs/cases on isolated ports/database, with the pinned Node 24/Corepack pnpm launcher. Do not run the full E2E/CT suite; Task 4 owns that once.
4. Screenshot/trace artifacts must contain synthetic identities only, no cookies/tokens/headers/private paths. Keep only code-native baselines or tracked public-safe evidence required by the existing repo convention. Do not update a baseline for host-vs-Docker raster drift.
5. Run exact ESLint on changed TS/TSX, `git diff --check`, generic local-path/token/private-data scan and a SHA-256 manifest.
6. Record exact `source hash → literal command → result → finding closure`, scenario/width counts, artifact provenance and skipped/not-measured evidence in `task-7-report.md`, using `<node24-bin>` rather than a machine-local path.
7. Force-add ignored brief/report/manifest and intended tests/fixtures/evidence; commit exactly `test(host): capture lifecycle browser evidence` when production code is unchanged, or `fix(host): close lifecycle browser evidence gaps` if production changes are required.

## Exclusions

- No Task 4 full gates, Task 5 docs/CHANGELOG, Task 6 ADR status, whole-branch review or integration.
- No external OAuth/provider/email, real club-end confirmation, production data, deploy, tag, PR or push.

Return the reused-vs-new coverage matrix, RED/GREEN, exact scenario/width counts, public-safe artifact list/provenance, accessibility result, residual `not measured` items, manifest and commit SHA.
