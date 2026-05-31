# ReadMates Solo-Admin Branch Protection Policy Design

**Status:** Approved for design documentation
**Date:** 2026-05-31
**Scope:** Release operations policy for a solo-admin ReadMates repository

## 1. Problem

ReadMates is currently operated by a single admin. The `main` branch is protected, CI status checks are required, and pull requests require one approval plus code-owner review. The current CODEOWNERS file only owns `.github/workflows/**` with the same solo admin account.

That setup creates an impossible review path for some release PRs: the repository asks for a non-author approval or code-owner review, but no separate reviewer is available. The `v1.12.0` release preserved PR and CI evidence, but had to use an admin merge exception after the normal merge path was blocked.

The goal is not to weaken release quality. The goal is to make the policy honest for solo operation while preserving stronger controls for DB, API, auth, deployment, and CI/CD risk.

## 2. Decision

Use a hybrid solo-admin policy:

- Keep required CI checks on `main`.
- Treat solo-admin release PRs as valid when they carry explicit release-readiness evidence.
- Do not require an impossible self-review as the normal path.
- Require an external reviewer when a real non-author reviewer is available for high-control surfaces.
- If high-control work must ship without an external reviewer, require an admin bypass ledger entry and release-readiness evidence before or immediately after merge.

## 3. Release Classes

### 3.1 Solo-Admin Evidence Path

This path is allowed when the change does not alter DB schema, public API contracts, auth/permission boundaries, secret handling, deploy workflow behavior, or branch protection policy.

Required evidence:

- `./scripts/pre-push-check.sh` or the documented release equivalent passes.
- `CHANGELOG.md` records user-facing, operator-facing, security posture, and deploy behavior changes.
- Public release candidate checks pass when the release or public repository surface is involved.
- Release tag workflows and post-deploy smoke are recorded when production deployment is part of the task.
- Any skipped validation is recorded with a reason and residual risk.

Examples:

- Documentation-only release cleanup.
- Server dependency patch with no API, auth, DB, or frontend behavior change.
- UI or admin-console feature with normal CI, E2E, release notes, and smoke evidence.

### 3.2 Release PR With Solo-Admin Evidence

This path is required for DB migration or public API contract changes even when no external reviewer exists. The release PR is still useful because it preserves diff review, CI, discussion, and release-readiness evidence.

The merge path must not depend on impossible self-review. If branch protection blocks the PR solely because no non-author reviewer exists, an admin merge is allowed only after the release-readiness review records:

- changed DB migration files and expected Flyway direction,
- changed public API routes, request/response schemas, and error codes,
- verification commands and results,
- deployment order and rollback considerations,
- public release safety result,
- reason normal review could not be completed.

### 3.3 External-Review Preferred Path

An external reviewer is preferred, and should be required when operationally available, for high-control surfaces:

- `.github/workflows/**`
- branch protection or CODEOWNERS policy
- deploy scripts and release automation
- auth, permissions, OAuth, BFF shared secret handling, token/session handling
- secret rotation and production configuration sync

If no reviewer is available and the change must ship, use the admin bypass ledger path with explicit evidence. This should be exceptional, not the routine path for high-control changes.

## 4. GitHub Configuration Direction

The current GitHub branch protection state should be aligned to the hybrid policy:

- Keep required status checks for `Frontend` and `Backend`.
- Keep strict branch update behavior so PRs are tested against the current base.
- Remove branch-protection dependence on impossible code-owner self-review for solo operation.
- Keep force pushes and branch deletion disabled.
- Keep CODEOWNERS as ownership documentation and notification metadata unless a real non-author owner is added.

The practical target is:

- Required status checks: enabled.
- Required pull request review count: either disabled for solo-admin branches or kept only when a real reviewer is available.
- Required code-owner review: disabled until a non-author owner or team exists.
- CODEOWNERS: retained for `.github/workflows/**`, but treated as documentation/visibility unless enforcement has a real reviewer.

## 5. Documentation Changes

The implementation plan should update these sources of truth:

- `docs/development/release-management.md`
  - Replace the current bypass policy with the hybrid solo-admin policy.
  - Separate solo-admin evidence path, DB/API release PR path, and external-review preferred path.

- `docs/development/release-readiness-review.md`
  - Add a DB/API release checklist that records migration, API contract, deployment order, rollback, public release safety, and review/bypass evidence.
  - Keep the rule that passing tests alone does not close release risk.

- `.github/CODEOWNERS`
  - Keep the workflow ownership rule unless a real reviewer/team is added.
  - Add a comment that enforcement must not require impossible self-review in solo-admin mode.

No production secrets, private domains, local paths, OCIDs, or member data should be added.

## 6. Error Handling And Exceptions

If a release is blocked by branch protection after all required checks pass, the operator should classify the blocker:

- `POLICY_MISMATCH`: GitHub protection requires a reviewer that does not exist.
- `CHECK_FAILURE`: CI, release scan, deploy, or smoke failed.
- `MISSING_EVIDENCE`: docs or release-readiness proof is incomplete.

Only `POLICY_MISMATCH` is eligible for admin merge. `CHECK_FAILURE` and `MISSING_EVIDENCE` must be fixed before merge unless an incident response requires emergency bypass.

Emergency bypass must record:

- why the bypass was necessary,
- which checks were skipped or failed,
- what follow-up will close the risk,
- where the operator can verify the release state later.

## 7. Testing And Verification

Because this is policy/documentation work, the implementation should verify:

- Markdown whitespace: `git diff --check -- <changed-docs>`.
- Public release safety if release docs or public-repo policy are changed:
  - `./scripts/build-public-release-candidate.sh`
  - `./scripts/public-release-check.sh .tmp/public-release-candidate`
- GitHub protection state after any CLI change:
  - `gh api repos/beyondwin/ReadMates/branches/main/protection`

The implementation should not claim GitHub settings changed unless the CLI command succeeds and the resulting protection JSON matches the target.

## 8. Non-Goals

- Do not add a fake reviewer or bot approval to satisfy branch protection.
- Do not weaken CI status checks.
- Do not remove release-readiness review for DB/API releases.
- Do not make direct pushes the default for DB migration or public API contract changes.
- Do not store private deployment values in public docs.

## 9. Success Criteria

- Solo-admin operation no longer depends on impossible self-review.
- DB/API releases still produce a release PR or equivalent review artifact with explicit evidence.
- High-control surfaces have a clear external-review-preferred rule.
- Admin bypass is treated as an auditable exception with recorded reason and verification.
- Docs, CODEOWNERS comments, and actual GitHub settings do not contradict each other.
