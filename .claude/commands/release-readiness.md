---
description: Review the current branch for ReadMates release readiness against its base
argument-hint: "[base-ref, default origin/main]"
---

Review `${ARGUMENTS:-origin/main}..HEAD` as a whole branch diff.

Follow the current root `AGENTS.md` and `docs/development/release-readiness-review.md`. Report findings by severity, checks actually run, skipped validation, and residual risk. Do not substitute the latest implementation plan or the last commit for the branch range.
