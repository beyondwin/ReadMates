# Stage 5 Task 4 Gate Fix 3 Brief

- Base: `4240fa61687588f58f5d70ad6a8e7943ba01dbe5`.
- Finding: the full Chromium E2E run still contains tests coupled to the retired host dashboard (`오늘`, dashboard attention queue, mobile workspace selector, old workspace class, or old host-return source) and one legacy `records=json` normalization path that no longer reaches the canonical records section. Serial groups then skip downstream host coverage.
- Goal: align branch-owned E2E contracts with the implemented lifecycle operating room and repair real route/fixture regressions when required. Do not reopen the approved design or re-read all authority documents.
- Start from the exact full-run failures and current rendered semantics. Preserve user-visible operating-room behavior; prefer updating stale tests/fixtures, but fix production code if a canonical route or promised compatibility contract is genuinely broken.
- Primary failing surfaces to classify and close: `account-navigation-avatars`, `dev-login-session-flow`, `google-auth-invite-flow`, `host-club-operations`, `host-meeting-workspace-browser-smoke`, `host-next-book-notification-composer`, `host-session-hardening`, `host-session-record-preview`, `multi-club-flow`, `public-auth-member-host`, `responsive-navigation-chrome`, `admin-shell` host-workspace handoff. Include `member-reading-momentum` only if it is reproducibly caused by the branch.
- TDD: focused RED per independent failure cluster, smallest GREEN change, then run each affected spec file serially in Chromium. Do not rerun the full 250-test suite.
- Maintain these load-bearing contracts: canonical `/app/host` operating room, `/records`, `/invitations` fragment replacement, safe query/hash preservation, schedule-seen lifecycle, immutable workbox, OAuth named-link acceptance, keyboard/mobile accessibility, no secret/private evidence.
- Evidence: focused report and SHA-256 manifest under the Stage 5 ledger directory.
- Required checks: affected Chromium spec files, relevant Vitest if production changes, lint for changed frontend files, `git diff --check`, manifest verification, public-safety scan.
- Preserve: external untracked mockup tree and unrelated admin login-return failures.
- Commit exactly: `test(host): align lifecycle e2e authority`
