# Stage 5 Task 3 review fix 1 brief

Fix only the single IMPORTANT finding from the fresh Task 3 review, from base `93e3cef101228a466790a1f21fd8ae7b70af8c95`.

## Finding

The unscoped parent `canonicalHostCompatibilityLoader` redirects before the legacy child element renders. It uses an ordinary loader `redirect()` to the scoped legacy path, drops validated `location.state`, and adds a PUSH entry before the child performs its REPLACE. Standalone child tests therefore do not prove the actual `hostRoutes()` behavior.

## Required closure

1. RED first using the real combined `hostRoutes()` tree and an existing history entry. Reproduce `/app/host/members?status=active#member-7` with a validated same-app return state.
2. Make the actual unscoped legacy aliases resolve directly to their scoped canonical destination with a single effective REPLACE, preserving search, canonical hash and only validated state:
   - members → scoped people;
   - invitations → scoped settings `#invitations`;
   - operations → scoped host home.
3. Prove back navigation does not return to the unscoped or scoped legacy alias and that the validated state survives. Prove external/cross-club/arbitrary state is still dropped.
4. Preserve existing ordinary unscoped canonicalization for non-legacy host routes, canonical `/records`, and non-current edit/closing behavior.
5. Use the smallest route/component/loader change; do not introduce duplicate presentation, server changes or Task 4+ work.
6. Run only the exact combined-route RED/GREEN plus affected route/continuity tests, exact changed-file ESLint, `git diff --check`, targeted public-safety and delta SHA-256 manifest. Update Task 3 report claims and record exact commands with `<node24-bin>`.
7. Force-add ignored brief/report/manifest and commit exactly `fix(host): preserve unscoped redirect history`.

Return the combined-route RED/GREEN, actual history/state assertions, changed route mechanism, manifest and commit SHA. Preserve external mockups and user runtimes.
