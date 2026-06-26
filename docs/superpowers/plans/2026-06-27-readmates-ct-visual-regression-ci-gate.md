# ReadMates CT Visual Regression CI Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatic GitHub Actions gate that verifies existing Playwright component-test visual baselines without updating snapshots.

**Architecture:** Keep Playwright CT as a frontend-only rendering contract around prop-driven UI components. GitHub Actions detects drift against committed `front/__screenshots__` baselines, while Docker remains the only canonical baseline update path. Documentation and release-readiness notes close the previous manual-only residual risk.

**Tech Stack:** GitHub Actions, Node.js 24, pnpm 10.33.0, Playwright component testing, Vite 8, React 19, public release candidate scripts.

## Global Constraints

- CI must validate existing committed CT baselines without using snapshot update flags.
- Baseline updates must continue to use Docker `mcr.microsoft.com/playwright:v1.60.0-jammy`.
- `front/__screenshots__` must remain excluded from `.tmp/public-release-candidate`.
- Do not add new route-critical baselines, UI redesign, layout polish, copy rewrite, Lighthouse hard gates, or E2E screenshot diffing in this implementation.
- Do not change server code, DB migrations, BFF/OAuth proxy behavior, deploy-front/deploy-server workflow behavior, auth/BFF tokens, OAuth scopes, or user route behavior.
- Do not commit macOS-local baseline output, generated Playwright reports, generated test results, private member data, private domains, local absolute paths, deployment state, OCIDs, secrets, or token-shaped examples.

---

## File Structure

- Modify `.github/workflows/ci.yml`: add a dedicated `frontend-visual-regression` job that installs frontend dependencies, installs Chromium, runs Playwright CT without snapshot updates, and uploads failure artifacts.
- Modify `front/package.json`: add `test:ct:docker`, a non-updating Docker validation command that mirrors the existing update Docker image and lets macOS developers verify baselines without producing local-rendered PNGs.
- Modify `docs/development/test-guide.md`: document the new CI gate, `test:ct:docker`, and the difference between validation and baseline update commands.
- Modify `CHANGELOG.md`: record the new frontend visual-regression CI gate under `## Unreleased` / `### Testing`.
- Modify `docs/development/release-readiness-review.md`: add the closeout note after all local verification passes.

## Task 1: Add The CI Visual Regression Gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `front/package.json`

**Interfaces:**
- Consumes: existing `front/playwright-ct.config.ts`, existing `front/**/*.ct.tsx`, existing `front/__screenshots__` baselines, existing GitHub Actions pinned checkout/setup-node/upload-artifact actions.
- Produces: `frontend-visual-regression` CI job and `pnpm --dir front test:ct:docker` local validation command.

- [ ] **Step 1: Prove the CI job and docker validation script are absent**

Run:

```bash
rg -n "frontend-visual-regression|test:ct:docker|Frontend visual regression" .github/workflows/ci.yml front/package.json
```

Expected: exit code `1` and no matches.

- [ ] **Step 2: Add the non-updating Docker CT validation script**

Edit `front/package.json` so the `scripts` block contains this exact sequence around the CT scripts:

```json
    "test:e2e": "playwright test",
    "test:ct": "playwright test --config=playwright-ct.config.ts",
    "test:ct:docker": "docker run --rm --ipc=host -e CI=true -v \"$PWD/..\":/work -w /work/front mcr.microsoft.com/playwright:v1.60.0-jammy /bin/sh -lc 'corepack enable && pnpm install --frozen-lockfile=false && pnpm exec playwright test --config=playwright-ct.config.ts'",
    "test:ct:update": "playwright test --config=playwright-ct.config.ts --update-snapshots",
    "test:ct:update:docker": "docker run --rm --ipc=host -e CI=true -v \"$PWD/..\":/work -w /work/front mcr.microsoft.com/playwright:v1.60.0-jammy /bin/sh -lc 'corepack enable && pnpm install --frozen-lockfile=false && pnpm exec playwright test --config=playwright-ct.config.ts --update-snapshots'",
```

Do not change dependency versions.

- [ ] **Step 3: Add the GitHub Actions job**

Insert this job in `.github/workflows/ci.yml` after the existing `frontend` job and before `design-system`:

```yaml
  frontend-visual-regression:
    name: Frontend visual regression
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: front
    steps:
      - name: Configure Git defaults
        working-directory: .
        run: git config --global init.defaultBranch main

      - name: Check out repository
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - name: Set up Node.js
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 24

      - name: Set up pnpm
        run: npm install --global pnpm@10.33.0

      - name: Restore pnpm cache
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml

      - name: Install dependencies
        working-directory: .
        run: pnpm install --frozen-lockfile

      - name: Install Playwright Chromium
        run: pnpm exec playwright install --with-deps chromium

      - name: Run component visual regression tests
        run: pnpm test:ct

      - name: Upload visual regression reports
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: frontend-visual-regression-reports
          path: |
            front/test-results
            front/playwright-report
          if-no-files-found: ignore
```

The job must not use `--update-snapshots`.

- [ ] **Step 4: Verify the job is present and does not update snapshots**

Run:

```bash
rg -n "frontend-visual-regression|Frontend visual regression|Run component visual regression tests|test:ct:docker" .github/workflows/ci.yml front/package.json
rg -n "update-snapshots" .github/workflows/ci.yml
```

Expected:

- First command finds the new job, display name, CT run step, and `test:ct:docker` script.
- Second command exits `1` with no matches because CI must not update baselines.

- [ ] **Step 5: Run focused local validation**

Run the Docker validation script so macOS renderer differences do not affect the result:

```bash
pnpm --dir front test:ct:docker
```

Expected: Playwright CT passes for the existing shared and feature component baselines. No tracked PNG baselines change.

Then run:

```bash
git diff -- front/__screenshots__
```

Expected: no output.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git diff --check -- .github/workflows/ci.yml front/package.json
git add .github/workflows/ci.yml front/package.json
git commit -m "ci: run component visual regression"
```

Expected: commit succeeds with only `.github/workflows/ci.yml` and `front/package.json` staged.

## Task 2: Document The CI And Baseline Policy

**Files:**
- Modify: `docs/development/test-guide.md`

**Interfaces:**
- Consumes: `test:ct`, `test:ct:docker`, `test:ct:update`, `test:ct:update:docker`, `frontend-visual-regression` CI job from Task 1.
- Produces: contributor-facing instructions for validation, baseline updates, CI behavior, macOS constraints, and public-release safety.

- [ ] **Step 1: Prove current docs do not mention the CI gate or docker validation script**

Run:

```bash
rg -n "frontend-visual-regression|test:ct:docker|CI visual regression|CI는 baseline" docs/development/test-guide.md
```

Expected: exit code `1` and no matches.

- [ ] **Step 2: Update the CT command list**

In `docs/development/test-guide.md`, replace the CT command block under `**명령:**` with:

```markdown
```bash
pnpm --dir front test:ct
pnpm --dir front test:ct:docker
pnpm --dir front test:ct:update
pnpm --dir front test:ct:update:docker
```
```

- [ ] **Step 3: Replace the command explanation bullets**

Immediately below that command block, replace the existing CT command bullets with:

```markdown
- `test:ct`는 Linux CI와 로컬 Linux에서 committed baseline과 현재 렌더 결과를 비교하는 검증 명령입니다. snapshot update flag를 사용하지 않습니다.
- `test:ct:docker`는 macOS/renderer drift 회피용 검증 명령입니다. Docker `mcr.microsoft.com/playwright:v1.60.0-jammy` 안에서 snapshot update 없이 baseline drift만 확인합니다.
- `test:ct:update`는 로컬 baseline 갱신용이지만, macOS나 CI 기준과 다른 렌더러에서 생성한 결과는 커밋하지 않습니다.
- `test:ct:update:docker`가 baseline 생성의 **유일한 정규 경로**입니다. `mcr.microsoft.com/playwright:v1.60.0-jammy` 이미지 안에서(`CI=true`) 실행해 CI 렌더러와 일치시킵니다.
```

- [ ] **Step 4: Add the CI gate paragraph**

After the `**flake 정책:**` paragraph, add:

```markdown
**CI gate:** `.github/workflows/ci.yml`의 `frontend-visual-regression` job은 pull request와 `main` push에서 `pnpm --dir front test:ct`를 실행합니다. 이 job은 baseline을 갱신하지 않고 drift만 검증하며, 실패 시 `front/test-results`와 `front/playwright-report`를 artifact로 업로드합니다. 의도한 UI 변경이면 먼저 product diff를 리뷰한 뒤 Docker update command로 PNG baseline을 갱신하고, 의도하지 않은 diff면 UI/fixture를 고칩니다.
```

- [ ] **Step 5: Verify docs mention the new policy**

Run:

```bash
rg -n "test:ct:docker|frontend-visual-regression|baseline을 갱신하지 않고 drift만 검증" docs/development/test-guide.md
git diff --check -- docs/development/test-guide.md
```

Expected: `rg` finds all three phrases and `git diff --check` exits `0`.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add docs/development/test-guide.md
git commit -m "docs: document visual regression ci gate"
```

Expected: commit succeeds with only `docs/development/test-guide.md` staged.

## Task 3: Close Release Notes And Public-Safety Evidence

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes: Task 1 CI/script implementation and Task 2 contributor docs.
- Produces: release note and local release-readiness closeout evidence for the visual regression CI gate.

- [ ] **Step 1: Run implementation verification before writing closeout claims**

Run:

```bash
pnpm --dir front test:ct:docker
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git diff --check -- .github/workflows/ci.yml front/package.json docs/development/test-guide.md CHANGELOG.md docs/development/release-readiness-review.md
```

Expected:

- CT Docker validation passes.
- Frontend lint, unit tests, and build pass.
- Public release candidate build/check pass and do not include `front/__screenshots__`.
- Diff whitespace check exits `0`.

- [ ] **Step 2: Confirm screenshot baselines are not in the public release candidate**

Run:

```bash
find .tmp/public-release-candidate -path '*__screenshots__*' -print
```

Expected: no output.

- [ ] **Step 3: Add CHANGELOG testing entry**

In `CHANGELOG.md`, under `## Unreleased` / `### Testing`, add this bullet above the existing route-critical visual regression bullet:

```markdown
- **visual regression CI:** GitHub Actions now runs a dedicated `Frontend visual regression` job for Playwright component-test baselines. The job validates existing `front/__screenshots__` baselines without updating snapshots and uploads Playwright reports on failure. Baseline updates remain Docker-only through `pnpm --dir front test:ct:update:docker`, and clean public release candidates still exclude committed screenshot baselines.
```

- [ ] **Step 4: Add release-readiness closeout note**

At the top of `docs/development/release-readiness-review.md`, immediately after the introductory paragraph and before the current newest dated section, add:

```markdown
## 2026-06-27 CT visual regression CI gate closeout

- Scope reviewed: local `main..HEAD` after adding the CI visual-regression job, Docker CT validation script, and contributor docs.
- Release classification: CI/test tooling and contributor documentation. No production route composition, route loader, auth/BFF proxy, server API contract, DB migration, OAuth scope, release image, or deploy workflow behavior changed.
- Product evidence: existing Playwright CT baselines for shared UI, host closing board, platform-admin support, and public records are now verified by a dedicated GitHub Actions job without snapshot updates.
- Renderer-risk closure: baseline creation remains Docker-only through `pnpm --dir front test:ct:update:docker`; local macOS developers can validate without snapshot updates through `pnpm --dir front test:ct:docker`.
- Public safety: `front/__screenshots__` remains committed visual-regression evidence but is excluded from `.tmp/public-release-candidate`; public release scan passed after the CI/doc changes.
- Local verification before merge: `pnpm --dir front test:ct:docker`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate`, `find .tmp/public-release-candidate -path '*__screenshots__*' -print`, and `git diff --check` passed.
- Skipped before merge: production OAuth, VM, provider-console, release tag, deploy workflow execution, OCI compose promotion, GitHub Release publication, and post-deploy smoke. These require release-operation access after merge and are not local evidence for this CI/docs branch.
- Residual risk: no known local release-readiness residual remains after CT, frontend, public-release, docs, and screenshot-exclusion evidence. First GitHub Actions run on the pushed branch remains remote CI evidence outside the local working tree.
```

- [ ] **Step 5: Verify release docs**

Run:

```bash
rg -n "visual regression CI|CT visual regression CI gate closeout|test:ct:docker|front/__screenshots__" CHANGELOG.md docs/development/release-readiness-review.md
git diff --check -- CHANGELOG.md docs/development/release-readiness-review.md
```

Expected: `rg` finds the new release-note and closeout language, and `git diff --check` exits `0`.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add CHANGELOG.md docs/development/release-readiness-review.md
git commit -m "docs: close visual regression ci readiness"
```

Expected: commit succeeds with only `CHANGELOG.md` and `docs/development/release-readiness-review.md` staged.

## Final Verification

- [ ] **Step 1: Check final status**

Run:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 2: Review final diff against the starting point**

Run:

```bash
git log --oneline -3
git show --stat --oneline HEAD~3..HEAD
```

Expected: the last three implementation commits are:

- `ci: run component visual regression`
- `docs: document visual regression ci gate`
- `docs: close visual regression ci readiness`

The stat should include only `.github/workflows/ci.yml`, `front/package.json`, `docs/development/test-guide.md`, `CHANGELOG.md`, and `docs/development/release-readiness-review.md`.

- [ ] **Step 3: Final report**

Final response must name:

- changed surface: CI/test tooling, frontend CT script, contributor docs, release-readiness docs
- checks actually run
- skipped validation with reasons
- remaining risk: first remote GitHub Actions run is remote evidence after push, not local evidence

## Plan Self-review

- Spec coverage: Task 1 implements CI validation and failure artifacts; Task 2 preserves Docker-only baseline policy and documents CI behavior; Task 3 verifies public release exclusion and records release-readiness evidence.
- Placeholder scan: no unfinished markers, incomplete file paths, or unspecified follow-up steps remain.
- Type consistency: script names are consistent across tasks: `test:ct`, `test:ct:docker`, `test:ct:update`, `test:ct:update:docker`.
