# ReadMates Release Pipeline Security Readiness Design

**Date:** 2026-08-02

**Status:** Approved design

## 1. Goal

Prepare the current local `main` for a later release by restoring the failing CI lane, closing all currently open HIGH JavaScript dependency alerts, making server-image provenance fail closed, and synchronizing active release/deployment documentation with the current repository and GitHub evidence.

Completion is repository-only. This work does not push commits, create or move tags, publish a GitHub Release, mutate GitHub Secrets or Variables, deploy Cloudflare Pages or OCI services, send email, or call live AI providers.

## 2. Current Evidence

- Local `main` is clean and nine commits ahead of `origin/main` at the start of the review.
- The latest remote `main` CI run fails only in the Scripts job because ShellCheck reports unused variables in the local Google OAuth stack runner and its fixture harness. The same warnings reproduce locally.
- GitHub reports three open HIGH Dependabot alerts:
  - `postcss` below `8.5.18`;
  - `brace-expansion` from `4.0.0` through `5.0.7`;
  - `react-router` from `7.12.0` through `8.2.x`, patched in `8.3.0`.
- The current `Deploy Server Image` workflow accepts a manual `image_tag`, but its checkout uses the dispatch ref. A manual run can therefore publish an image tag whose source commit did not come from the corresponding release tag.
- Active deploy documentation incorrectly attributes `/etc/readmates/caddy.env` creation to `sync-config`; the compose deployment helper creates it from the operator-supplied `CADDY_SITE`, while `sync-config` owns `/etc/readmates/readmates.env`.
- The `v2.1.0` server-image workflow succeeded, while the same-tag frontend workflow and GitHub Release were not observed. Active readiness evidence must distinguish that completed server-image step from the remaining production-only steps.

## 3. Chosen Approach

Use one integrated release-hardening change set.

Rejected alternatives:

- Splitting Router v8 into a later change would leave a HIGH alert open and fail the approved completion criterion.
- Dismissing the Router advisory because ReadMates is a Vite SPA and does not use React Server Components would leave a security exception instead of moving to the patched line.

## 4. Design

### 4.1 Restore the Scripts CI lane

Remove unused loop counters and unused local state without changing process-group shutdown timing, readiness polling, cleanup ownership, or fixture behavior. Preserve the existing local OAuth fixture coverage, then run its focused fixture command before the whole tracked-shell ShellCheck lane.

### 4.2 Close the JavaScript HIGH alerts

Use the root `packageManager` contract, `pnpm@11.13.1`, through Corepack.

- Raise the workspace override for `brace-expansion` to `5.0.8`.
- Add a workspace override that resolves vulnerable `postcss` versions to `8.5.25`.
- Replace the direct `react-router-dom@7` dependency with exact `react-router@8.3.0`.
- Replace ordinary `react-router-dom` imports with `react-router` imports.
- Import `RouterProvider` and other DOM-only exports from `react-router/dom`.
- Update test mocks and `importOriginal` type references to the same official package boundaries.
- Do not add React Server Component directives or change route, auth, loader, BFF, or API behavior.

The dependency change is accepted only when the lockfile resolves no vulnerable production package, frontend type/lint/tests/build pass, and route-focused E2E evidence remains green.

### 4.3 Make server-image provenance fail closed

Both tag-push and manual-dispatch executions derive one canonical release tag.

1. Accept only `vMAJOR.MINOR.PATCH`.
2. Tag-push execution uses the pushed tag; manual execution uses `image_tag`.
3. Checkout targets that canonical tag, not the branch used to dispatch the workflow.
4. After checkout, verify that the ref is an annotated tag and that its peeled commit equals `HEAD`.
5. Build the JAR and ARM64 scan candidate only after tag verification.
6. Promote only the digest that passed the HIGH/CRITICAL Trivy gate.
7. Use the canonical tag in concurrency and summary output so concurrent manual executions cannot silently cancel or overwrite a different release.

A repository-local workflow contract checker validates the real workflow and controlled good/bad fixture inputs. It must reject at least a branch checkout paired with a release image tag and an unverified or non-semver tag path. CI and pre-push invoke the checker so this contract cannot regress silently. Actionlint remains the GitHub Actions syntax/expression check.

### 4.4 Synchronize active documentation

Update only active documentation and release notes; historical design and plan records remain unchanged.

- `CHANGELOG.md` records the CI repair, dependency security updates, and release-tag provenance gate under `Unreleased`.
- `docs/development/release-readiness-review.md` records repository-only verification at final local `HEAD`, the three alert closures expected after a future push, and the production-only gates that remain unexecuted.
- `docs/deploy/release-publish-runbook.md` documents canonical tag checkout, annotated-tag verification, and the stop rule before OCI/frontend promotion.
- `docs/deploy/compose-stack.md` and `docs/deploy/oci-backend.md` state that `sync-config` writes `readmates.env`, while `05-deploy-compose-stack.sh` writes `caddy.env` and the compose image `.env`.
- `scripts/README.md` and `docs/deploy/README.md` document the workflow contract check if the new command is part of the public release surface.

All examples remain public-safe and use placeholders. No real deployment state, private domain, member data, secret, token-shaped value, OCID, or local absolute path is persisted.

## 5. Error Handling and Stop Rules

- ShellCheck, the deploy workflow contract checker, Actionlint, dependency audit, frontend regression checks, server/public-release gates, or final diff safety checks failing marks the release state `BLOCKED`.
- Dependency incompatibility is fixed at the importing code or supported package boundary. Tests, security alerts, or scanner severity are not weakened to obtain green output.
- A failed image scan never promotes a release tag, and no failed server-image path authorizes OCI or frontend deployment.
- Production operations remain separate evidence. Local success is not described as a successful remote CI run, fixed Dependabot state, published image, or deployed release.
- Existing unrelated processes, containers, ignored reports, and the nine pre-existing local commits are preserved.

## 6. Test and Evidence Strategy

Run focused evidence before broad evidence:

1. Local Google OAuth stack fixtures, Bash syntax, and the complete tracked-shell ShellCheck command.
2. Deploy workflow checker self-tests/fixtures, real workflow validation, and Actionlint for CI/deploy/sync workflows.
3. Frozen-lockfile install through Corepack, `pnpm why`, and `pnpm audit --prod --audit-level high` with zero HIGH findings.
4. Frontend lint, unit/coverage tests, build, Zod fixture freshness, focused router tests, focused E2E, then full Chromium E2E.
5. Server PR-level check and Testcontainers integration because the release gate covers the whole current branch even though server behavior is unchanged.
6. Public release candidate build/check, including gitleaks and required workflow/script coverage.
7. `./scripts/pre-push-check.sh --full --release`, `git diff --check`, and targeted public-safety/link scans over changed documentation.

If environment constraints prevent an exact lane from running, the final readiness record names the skipped command and reason and remains `BLOCKED` for that evidence rather than inferring success.

## 7. Acceptance Matrix Selection

- **UI or runtime state:** selected because the Router package boundary changes across production and tests. Evidence is frontend unit/build plus browser/E2E route coverage.
- **BFF or OAuth:** selected only for regression evidence because the failing shell scripts own local OAuth startup/smoke. No BFF or Spring auth contract changes are designed.
- **Public release:** selected because workflows, release scripts, candidate coverage, and deploy docs change. Evidence is workflow validation plus public release candidate checks.
- **Persistence or migration:** excluded as a product-change trigger because no schema, SQL, persistence adapter, or Flyway migration changes. Full integration remains a whole-branch release gate, not slice-specific evidence.
- **Actor authorization, club context, session lifecycle, guest exposure, guest DTO privacy, cursor collection, and async/provider behavior:** excluded because the implementation changes packages, scripts, workflow provenance, and documentation without changing those contracts.

## 8. Expected Change Surface

- Shell CI repair: `scripts/run-local-google-oauth-stack.sh`, `scripts/verify-local-google-oauth-stack-fixtures.sh`.
- Dependency security and Router migration: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `front/package.json`, and frontend files importing `react-router-dom`.
- Workflow provenance: `.github/workflows/deploy-server.yml`, a focused workflow contract checker and its fixtures, CI/pre-push wiring, and public release candidate coverage when required.
- Active docs: `CHANGELOG.md`, `docs/development/release-readiness-review.md`, relevant `docs/deploy/*.md`, and `scripts/README.md` when the checker is public.

No server source, migration, BFF function, UI design, production configuration value, or live deployment mutation is planned.

## 9. Completion Boundary

Repository readiness requires all planned local gates to pass at final `HEAD`, production audit HIGH findings to be zero, and active docs to reflect the evidence accurately.

After a future authorized push, GitHub CI success and Dependabot alerts changing to `fixed` are required remote evidence. After a separately authorized release operation, same-tag image scan/promotion, OCI health, frontend deployment, GitHub Release publication, and sanitized production smoke are required production evidence. None of those remote or live outcomes is claimed by this implementation.
