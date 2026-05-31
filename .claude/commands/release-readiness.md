---
description: Review the current branch for release readiness against its base
argument-hint: "[base-ref, default origin/main]"
---

You are running a release-readiness review for ReadMates.

Base ref: `${ARGUMENTS:-origin/main}`. Review range: `${ARGUMENTS:-origin/main}..HEAD`.

Do NOT limit the review to the latest implementation plan. Review the whole diff of the branch against its base, following `docs/development/release-readiness-review.md`.

Steps:

1. `git fetch` the base ref if needed, then read the full diff and commit list for `${ARGUMENTS:-origin/main}..HEAD`.
2. Walk every checklist item in `docs/development/release-readiness-review.md`: CHANGELOG/Unreleased, CI/deploy scripts, operator-facing behavior changes, security-code hygiene, architecture-test baselines/exceptions, and public-release safety.
3. Run the smallest relevant verification for the touched surfaces (see `AGENTS.md`): frontend `pnpm --dir front lint|test|build`, server `./server/gradlew -p server clean test`, e2e `pnpm --dir front test:e2e` for auth/BFF/route changes.
4. For public-release-affecting work, run `./scripts/build-public-release-candidate.sh` then `./scripts/public-release-check.sh .tmp/public-release-candidate`.

Report: changed surfaces, checks actually run (with results), and any remaining risk or skipped validation. Passing tests are evidence, not proof that no operational or release risk remains.
