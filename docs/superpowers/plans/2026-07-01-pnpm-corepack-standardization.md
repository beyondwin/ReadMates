# pnpm Corepack Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ReadMates use the root `packageManager` declaration as the package-manager version source for local pre-push checks and GitHub Actions, while keeping pnpm at `10.33.0`.

**Architecture:** Phase 1 is a behavior-preserving tooling cleanup: parse `packageManager` from the root `package.json`, activate that pnpm with Corepack, and run existing install/lint/test/build commands through the same path in local scripts and CI. The implementation resolves the Corepack launcher first: use PATH `corepack` when present, otherwise use `npx --yes corepack@0.35.0`. pnpm 11 migration stays out of scope and is prepared only through documentation and targeted scans.

**Tech Stack:** Bash, Node 24, Corepack, pnpm 10.33.0, GitHub Actions, shellcheck, ReadMates public-release scripts.

## Global Constraints

- The canonical package manager source is root `package.json` `packageManager`.
- Phase 1 must keep `packageManager: "pnpm@10.33.0"` unchanged.
- Phase 1 must not regenerate `pnpm-lock.yaml`.
- Phase 1 must not change frontend/server product code, API contract, DB migration, auth/BFF behavior, GitHub runner image, Node major version, Gradle configuration, or deploy platform behavior.
- CI, deploy, and pre-push must avoid trusting a globally installed pnpm with a different major version.
- Corepack launcher fallback may use `npx --yes corepack@0.35.0`; this pins the Corepack launcher, not the pnpm version. pnpm version still comes only from root `package.json`.
- Logs may show package manager source and resolved pnpm version, but must not print local absolute paths, private domains, secrets, token-shaped values, or deployment state.
- `front/package.json` `packageManager` remains unchanged in Phase 1; root-vs-front deduplication is a Phase 2 decision.
- `npx --yes pnpm@10.33.0` becomes fallback-only guidance after Phase 1, not the primary path.

---

## File Structure

- Modify: `scripts/pre-push-check.sh`
  - Responsibility: resolve the repo package manager from root `package.json`, activate it with Corepack, and run frontend pre-push gates without depending on global PATH pnpm.
- Modify: `.github/workflows/ci.yml`
  - Responsibility: replace repeated global pnpm installation with Corepack activation based on root `package.json`.
- Modify: `.github/workflows/deploy-front.yml`
  - Responsibility: use the same Corepack activation path as CI before install/lint/build/deploy checks.
- Modify: `scripts/README.md`
  - Responsibility: document the new local pre-push and CI-parity package-manager behavior.
- Modify: `AGENTS.md`
  - Responsibility: update agent guidance so CI-parity frontend commands use Corepack/repo-defined pnpm first.
- Modify as needed: `docs/agents/docs.md`
  - Responsibility: keep docs-agent guidance aligned if implementation changes public-release or script documentation rules.
- Modify: `CHANGELOG.md`
  - Responsibility: record the tooling behavior change under `## Unreleased`.

---

### Task 1: Add repo package-manager resolution to pre-push

**Files:**
- Modify: `scripts/pre-push-check.sh`

**Interfaces:**
- Consumes: root `package.json` with `packageManager: "pnpm@10.33.0"`.
- Produces: Bash array `pnpm_cmd=("${corepack_cmd[@]}" pnpm)` used by all frontend pre-push steps; helper `activate_repo_pnpm` that exits non-zero when package manager resolution fails.

- [ ] **Step 1: Write the failing dry-run assertion**

Run:

```bash
./scripts/pre-push-check.sh --dry-run --no-release | rg "(corepack|npx --yes corepack@0\\.35\\.0) pnpm --dir front lint"
```

Expected: FAIL before implementation because dry-run still prints `npx --yes pnpm@10.33.0 --dir front lint`.

- [ ] **Step 2: Add package-manager parsing helpers**

In `scripts/pre-push-check.sh`, replace:

```bash
pnpm_cmd=(npx --yes pnpm@10.33.0)
```

with:

```bash
package_manager="$(node -p "require('./package.json').packageManager || ''")"
if [[ ! "$package_manager" =~ ^pnpm@[^[:space:]]+$ ]]; then
  printf 'Expected root package.json packageManager to match pnpm@version, got: %s\n' "$package_manager" >&2
  exit 1
fi

if command -v corepack >/dev/null 2>&1; then
  corepack_cmd=(corepack)
else
  corepack_cmd=(npx --yes corepack@0.35.0)
fi

pnpm_cmd=("${corepack_cmd[@]}" pnpm)

activate_repo_pnpm() {
  printf 'Using package manager from root package.json: %s\n' "$package_manager"
  "${corepack_cmd[@]}" enable
  "${corepack_cmd[@]}" prepare "$package_manager" --activate
  "${pnpm_cmd[@]}" --version
}
```

Place this block after `cd "$repo_root"` instead of before it, because the Node command must read the root `package.json`.

- [ ] **Step 3: Activate repo pnpm once before frontend commands**

After the existing release/changelog guard block and before `run_step "Git whitespace check" check_whitespace`, add:

```bash
run_step "Activate repo package manager" activate_repo_pnpm
```

Keep `run_step` unchanged so `--dry-run` prints the activation step without running Corepack.

- [ ] **Step 4: Verify dry-run output uses Corepack**

Run:

```bash
./scripts/pre-push-check.sh --dry-run --no-release | rg "(corepack|npx --yes corepack@0\\.35\\.0) pnpm --dir front lint"
```

Expected: PASS and print the frontend lint command through the resolved Corepack launcher. On machines with `corepack` in PATH, the command contains `corepack pnpm`; on this Codex desktop environment, it may contain `npx --yes corepack@0.35.0 pnpm`.

- [ ] **Step 5: Verify invalid packageManager fails fast**

Temporarily edit root `package.json` in the working tree only:

```json
"packageManager": "npm@10.0.0",
```

Run:

```bash
./scripts/pre-push-check.sh --dry-run --no-release
```

Expected: FAIL with `Expected root package.json packageManager to match pnpm@version`.

Restore root `package.json` before continuing:

```bash
git restore package.json
```

- [ ] **Step 6: Run shell validation**

Run:

```bash
bash -n scripts/pre-push-check.sh
shellcheck scripts/pre-push-check.sh
```

Expected: both commands PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/pre-push-check.sh
git commit -m "fix(scripts): activate pre-push pnpm with corepack"
```

---

### Task 2: Standardize CI and deploy workflows on Corepack

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy-front.yml`

**Interfaces:**
- Consumes: root `package.json` `packageManager`.
- Produces: GitHub Actions jobs that activate pnpm through Corepack before `pnpm install --frozen-lockfile`.

- [ ] **Step 1: Write the failing scan for global pnpm install**

Run:

```bash
rg -n "npm install --global pnpm@10\\.33\\.0" .github/workflows/ci.yml .github/workflows/deploy-front.yml
```

Expected: FAIL state before implementation is that matches are present in CI and deploy workflows.

- [ ] **Step 2: Replace each `Set up pnpm` step**

For every workflow block that currently has:

```yaml
      - name: Set up pnpm
        run: npm install --global pnpm@10.33.0
```

replace it with:

```yaml
      - name: Set up pnpm from packageManager
        run: |
          if command -v corepack >/dev/null 2>&1; then
            corepack_cmd=(corepack)
          else
            corepack_cmd=(npx --yes corepack@0.35.0)
          fi
          "${corepack_cmd[@]}" enable
          "${corepack_cmd[@]}" prepare "$(node -p "require('./package.json').packageManager")" --activate
          "${corepack_cmd[@]}" pnpm --version
```

In jobs whose `defaults.run.working-directory` is `front`, keep this step at `working-directory: .` if needed:

```yaml
      - name: Set up pnpm from packageManager
        working-directory: .
        run: |
          if command -v corepack >/dev/null 2>&1; then
            corepack_cmd=(corepack)
          else
            corepack_cmd=(npx --yes corepack@0.35.0)
          fi
          "${corepack_cmd[@]}" enable
          "${corepack_cmd[@]}" prepare "$(node -p "require('./package.json').packageManager")" --activate
          "${corepack_cmd[@]}" pnpm --version
```

This ensures the Node expression reads the root `package.json`, not `front/package.json`.

- [ ] **Step 3: Verify no workflow still installs global pnpm**

Run:

```bash
rg -n "npm install --global pnpm@" .github/workflows/ci.yml .github/workflows/deploy-front.yml
```

Expected: no matches.

- [ ] **Step 4: Verify packageManager is the only workflow version source**

Run:

```bash
rg -n "pnpm@10\\.33\\.0|PNPM_VERSION" .github/workflows/ci.yml .github/workflows/deploy-front.yml
```

Expected: no matches.

- [ ] **Step 5: Syntax-review workflow snippets**

Run:

```bash
git diff -- .github/workflows/ci.yml .github/workflows/deploy-front.yml
```

Expected: every modified job sets up Node before Corepack activation, checks out the repository before reading `package.json`, and runs `prepare "$(node -p "require('./package.json').packageManager")" --activate` from the repository root.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/deploy-front.yml
git commit -m "ci: activate pnpm through corepack"
```

---

### Task 3: Update docs and agent guidance

**Files:**
- Modify: `scripts/README.md`
- Modify: `AGENTS.md`
- Modify as needed: `docs/agents/docs.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 1 resolved-Corepack pre-push behavior and Task 2 workflow behavior.
- Produces: contributor and agent docs that point to repo-defined pnpm via Corepack as the primary CI-parity path.

- [ ] **Step 1: Write the failing documentation scan**

Run:

```bash
rg -n "npx --yes pnpm@10\\.33\\.0|npm install --global pnpm@10\\.33\\.0" AGENTS.md scripts/README.md docs/agents/docs.md CHANGELOG.md
```

Expected: FAIL state before implementation is that primary guidance still mentions `npx --yes pnpm@10.33.0`.

- [ ] **Step 2: Update `scripts/README.md` pre-push command examples**

Replace the pre-push frontend command list with Corepack examples:

```markdown
- `corepack pnpm --dir front lint`
- `npx --yes corepack@0.35.0 pnpm --dir front lint` when `corepack` is not on PATH
- `corepack pnpm --dir front test:coverage`
- `corepack pnpm --dir front build`
- `corepack pnpm --dir front zod:export-fixtures`
```

Add this note near the list:

```markdown
`pre-push-check.sh` reads root `package.json` `packageManager`, activates that pnpm through Corepack, and then runs frontend checks through the resolved Corepack launcher. If `corepack` is not exposed by the local Node installation, the script uses `npx --yes corepack@0.35.0`; do not fall back to a globally installed pnpm with a different major version.
```

- [ ] **Step 3: Update `AGENTS.md` package-manager guidance**

Replace the current package-manager paragraph with:

```markdown
The pinned package manager is the root `package.json` `packageManager` value (`pnpm@10.33.0` in the current tree). If local `pnpm` behavior differs, a lockfile/install/build check is involved, or CI parity matters, activate the repo-defined package manager through Corepack and run the frontend command through the resolved Corepack launcher, such as `corepack pnpm --dir front ...` or `npx --yes corepack@0.35.0 pnpm --dir front ...` when `corepack` is not on PATH. Report the exact command. Use `npx --yes pnpm@10.33.0 ...` only as an explicit fallback when Corepack itself is unavailable and call that out.
```

- [ ] **Step 4: Update `docs/agents/docs.md` only if needed**

If `docs/agents/docs.md` still gives stale package-manager guidance after Steps 2-3, add a short note under documentation rules:

```markdown
- For package-manager, CI, or script docs, keep examples aligned with the root `package.json` `packageManager` and the Corepack activation path used by CI.
```

If the scan in Step 1 shows no stale `docs/agents/docs.md` match, do not edit this file.

- [ ] **Step 5: Add CHANGELOG entry**

Under `CHANGELOG.md` `## Unreleased`, add:

```markdown
- **Tooling:** CI/deploy and pre-push package-manager setup now activate the root `packageManager` through Corepack, reducing pnpm version drift between local checks and GitHub Actions.
```

- [ ] **Step 6: Verify documentation scans**

Run:

```bash
rg -n "npm install --global pnpm@10\\.33\\.0" AGENTS.md scripts/README.md docs/agents/docs.md CHANGELOG.md .github/workflows
rg -n "npx --yes pnpm@10\\.33\\.0" AGENTS.md scripts/README.md docs/agents/docs.md CHANGELOG.md
```

Expected: first command has no matches. Second command has no matches, or only the fallback sentence in `AGENTS.md` if that fallback is intentionally kept.

- [ ] **Step 7: Run docs whitespace and safety checks**

Run:

```bash
git diff --check -- AGENTS.md scripts/README.md docs/agents/docs.md CHANGELOG.md
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" AGENTS.md scripts/README.md docs/agents/docs.md CHANGELOG.md
```

Expected: whitespace check PASS; safety scan has no matches.

- [ ] **Step 8: Commit**

```bash
git add AGENTS.md scripts/README.md docs/agents/docs.md CHANGELOG.md
git commit -m "docs: document corepack pnpm workflow"
```

If `docs/agents/docs.md` was not modified, omit it from `git add`.

---

### Task 4: Run Phase 1 verification and record closeout evidence

**Files:**
- Modify: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: release-readiness evidence that Phase 1 preserved pnpm 10 behavior and did not start pnpm 11 migration.

- [ ] **Step 1: Run Corepack install check**

Run:

```bash
if command -v corepack >/dev/null 2>&1; then
  corepack_cmd=(corepack)
else
  corepack_cmd=(npx --yes corepack@0.35.0)
fi
"${corepack_cmd[@]}" enable
"${corepack_cmd[@]}" prepare "$(node -p "require('./package.json').packageManager")" --activate
"${corepack_cmd[@]}" pnpm --version
"${corepack_cmd[@]}" pnpm install --frozen-lockfile
```

Expected: `pnpm --version` prints `10.33.0`; install PASS without changing `pnpm-lock.yaml`.

- [ ] **Step 2: Run frontend checks through Corepack**

Run:

```bash
if command -v corepack >/dev/null 2>&1; then
  corepack_cmd=(corepack)
else
  corepack_cmd=(npx --yes corepack@0.35.0)
fi
"${corepack_cmd[@]}" pnpm --dir front lint
"${corepack_cmd[@]}" pnpm --dir front test:coverage
"${corepack_cmd[@]}" pnpm --dir front build
"${corepack_cmd[@]}" pnpm --dir front zod:export-fixtures
git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
```

Expected: all commands PASS; Zod fixture diff is empty.

- [ ] **Step 3: Run pre-push check**

Run:

```bash
./scripts/pre-push-check.sh --no-release
```

Expected: PASS and log the package manager source from root `package.json`.

- [ ] **Step 4: Run release candidate checks**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: both commands PASS.

- [ ] **Step 5: Scan for old primary package-manager paths**

Run:

```bash
rg -n "npm install --global pnpm@|npx --yes pnpm@10\\.33\\.0|pnpm@11" .github scripts AGENTS.md docs/agents scripts/README.md package.json front/package.json pnpm-lock.yaml
```

Expected: no `npm install --global pnpm@` matches; no `pnpm@11` matches; any `npx --yes pnpm@10.33.0` match is explicitly documented as fallback-only, not primary CI/pre-push behavior.

- [ ] **Step 6: Update release-readiness review**

Append a concise entry near the top of `docs/development/release-readiness-review.md`:

```markdown
## 2026-07-01 pnpm Corepack standardization

- Scope: package-manager activation only. pnpm stays at `10.33.0`; no lockfile migration or pnpm 11 upgrade was included.
- Local verification: Corepack resolution used `npx --yes corepack@0.35.0` on the local machine because `corepack` was not on PATH. `prepare "$(node -p "require('./package.json').packageManager")" --activate`, `pnpm install --frozen-lockfile`, `pnpm --dir front lint`, `pnpm --dir front test:coverage`, `pnpm --dir front build`, `pnpm --dir front zod:export-fixtures`, `git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/`, `./scripts/pre-push-check.sh --no-release`, `./scripts/build-public-release-candidate.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed.
- Residual risk: pnpm 11 migration remains a separate Phase 2. Docker-based Playwright CT scripts still rely on container Corepack behavior and should be reviewed during the Phase 2 migration.
```

Use the exact observed command results. If a command is skipped or fails, record that instead of claiming it passed.

- [ ] **Step 7: Run final diff checks**

Run:

```bash
git diff --check -- .github/workflows/ci.yml .github/workflows/deploy-front.yml scripts/pre-push-check.sh scripts/README.md AGENTS.md docs/agents/docs.md CHANGELOG.md docs/development/release-readiness-review.md
bash -n scripts/pre-push-check.sh
shellcheck scripts/pre-push-check.sh
```

Expected: all commands PASS.

- [ ] **Step 8: Commit**

```bash
git add docs/development/release-readiness-review.md
git commit -m "docs: record corepack pnpm verification"
```

---

### Task 5: Push and verify GitHub Actions

**Files:**
- No source edits expected.

**Interfaces:**
- Consumes: committed Phase 1 changes.
- Produces: remote CI evidence that Corepack activation works on GitHub Actions.

- [ ] **Step 1: Confirm local status**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: branch is ahead of `origin/main` by the Phase 1 commits and has no unstaged changes.

- [ ] **Step 2: Push**

Run:

```bash
git push origin main
```

Expected: push succeeds.

- [ ] **Step 3: Watch CI**

Run:

```bash
gh run list --branch main --limit 5
run_id="$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$run_id" --exit-status
```

Expected: the new `main` workflow run completes successfully. If it fails in a setup step, inspect whether Corepack ran from the repo root and whether `package.json` was available after checkout.

- [ ] **Step 4: Final report**

Report:

```text
Changed surface: package-manager tooling, CI/deploy workflows, docs.
Checks run: the exact commands from Task 4 Steps 1-5, plus the push command from Task 5 Step 2.
Remote CI: include the GitHub Actions run URL and final status from Task 5 Step 3.
Remaining risk: pnpm 11 migration is intentionally separate; Docker CT internal Corepack behavior should be reviewed in Phase 2.
```
