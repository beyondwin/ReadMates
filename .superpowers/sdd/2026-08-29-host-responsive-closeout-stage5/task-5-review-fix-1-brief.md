# Stage 5 Task 5 review fix 1 brief

Fix only the two IMPORTANT active-document contradictions from the fresh Task 5 review, from base `8f96240392f703496b12705bb69f5e6a973f8f08`.

## Finding 1 — superseded current-tense authority

- Replace only the current-tense ADR-0046 “오늘 트리아지”/queue-hero-diary description of `/app/host` in `docs/development/architecture.md` with the implemented operating-room authority, while keeping still-valid session detail/lifecycle facts and historical ADR-0046 untouched.
- Replace only the `CHANGELOG.md` sentence claiming records ledger/search is absorbed into `/sessions`; `/records` is canonical now. Do not rewrite unrelated historical Unreleased entries.

## Finding 2 — redirect preservation precision

Correct only the compatibility redirect sentences in `CHANGELOG.md`, `front/DESIGN.md`, and `docs/development/architecture.md`:

- `/members` and `/operations` preserve their allowed incoming fragment along with query and validated safe state.
- `/invitations` preserves query and validated safe state but deliberately replaces any incoming fragment with canonical `#invitations`.

## Exit

1. Update `task-5-report.md` stale-language closure to cover these exact contradictions.
2. Run changed-doc `git diff --check`, only changed/new relative-link validation, exact stale current-tense/redirect wording scan, added-line generic public-safety scan and a delta SHA-256 manifest.
3. Do not rerun code/browser tests or reopen schedule-seen/workbox/notification/V61-V65/ADR/accessibility claims already approved.
4. Keep ADR-0048/0049 Proposed. Preserve historical ADR-0046/01–06 and external mockups.
5. Force-add ignored brief/report/manifest and commit exactly `docs(host): close lifecycle documentation findings`.

Return corrected lines/claims, docs check results, manifest and commit SHA.
