# Security History Rewrite Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit Git history for public-repo security hygiene issues, build an explicit rewrite target manifest, and rewrite only approved sensitive history after rotation and force-push approval gates.

**Architecture:** This plan separates read-only evidence gathering from destructive history rewrite. The rewrite is prepared and verified in a disposable mirror clone first, then pushed only after a human approves the exact refs, target patterns, and collaborator recovery plan.

**Tech Stack:** Git, GitHub CLI, `git-filter-repo`, Bash, gitleaks, ReadMates public release scripts.

---

## Scope

This plan addresses sensitive history that may remain reachable from Git refs after public repo hygiene work, including:

- previously tracked `.orchestrator/` agent state
- previously tracked `.claude/settings.json` local agent config
- workstation absolute path strings in historical docs or agent artifacts
- historical CI workflow credential literals that were later moved to GitHub Actions secrets
- any additional secret-shaped findings reported by `gitleaks git`

This plan does **not** execute the rewrite by itself. It defines the procedure and approval gates required before any destructive command runs.

## Non-Goals

- Do not rewrite history without explicit user approval after Task 3.
- Do not force-push without explicit user approval after Task 6.
- Do not delete local ignored files such as `.server-config/`, `.wrangler/`, `.gstack/`, `.tmp/`, or `docs/private/`.
- Do not claim exposed secrets are safe just because history was rewritten. Real secrets still require rotation.
- Do not use `git push --mirror` unless the approved push plan explicitly requires every ref to be replaced.

## File Structure

- Create during execution: `.tmp/history-rewrite-audit/`
  - Stores read-only audit output, target manifests, before/after refs, and disposable rewrite logs.
  - `.tmp/` is ignored and must not be committed.
- Create during execution: `.tmp/history-rewrite-audit/rewrite-targets.md`
  - Human-readable manifest of paths, string patterns, commits, refs, and rotation decisions.
- Create during execution: `.tmp/history-rewrite-audit/filter-repo-replacements.txt`
  - `git filter-repo --replace-text` input. Build it locally; do not commit it.
- Modify during approved rewrite: Git history only.
  - No source file edits should be needed in the working tree if `main` is already clean.
- Possible GitHub-side updates after approved rewrite:
  - protected branch force-push setting
  - release tag refs if sensitive commits are reachable from release tags
  - release notes only if rewritten tags make existing release metadata stale

## Known Sensitive Target Classes

Use these as initial audit hypotheses, not as the final rewrite manifest:

1. Path targets:
   - `.orchestrator/`
   - `.claude/settings.json`

2. Workstation path targets:
   - POSIX user home paths
   - Windows user home paths
   - repo-specific absolute paths that include the local checkout root

3. Historical CI credential literal targets:
   - MySQL root password literal previously used only in CI service setup
   - MySQL application username/password literals previously used only in CI service setup
   - E2E database user/password literals previously used only in CI environment variables

4. Scanner-discovered targets:
   - Any `gitleaks git` finding that is not a documented false positive
   - Any token-shaped, key-shaped, OCI-shaped, or private-domain value found during manual audit

---

## Task 0: Safety Gate And Baseline Inventory

**Files:**
- Read-only: `AGENTS.md`
- Read-only: `docs/agents/docs.md`
- Read-only: `.gitignore`
- Read-only: `.gitleaks.toml`
- Read-only: `.github/workflows/ci.yml`

- [ ] **Step 1: Confirm repo instructions and current branch**

Run:

```bash
sed -n '1,220p' AGENTS.md
sed -n '1,220p' docs/agents/docs.md
git status --short --branch
git rev-parse --show-toplevel
git branch --show-current
```

Expected:

- The repository root is `<local-user-path>
- The active branch is `main` unless the operator intentionally chooses a temporary audit branch.
- `git status --short --branch` is clean before rewrite preparation.
- If the worktree is dirty, stop and ask whether to stash, commit, or switch to a clean clone. Do not run rewrite commands in a dirty worktree.

- [ ] **Step 2: Confirm remote and GitHub authentication**

Run:

```bash
git remote -v
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef,url
```

Expected:

- `origin` points to the intended ReadMates repository.
- GitHub CLI is authenticated for the account that owns or administers the repo.
- Default branch is `main`.

- [ ] **Step 3: Record current refs before any rewrite**

Run:

```bash
mkdir -p .tmp/history-rewrite-audit
git show-ref > .tmp/history-rewrite-audit/show-ref.before.txt
git log --oneline --decorate --graph --all -30 > .tmp/history-rewrite-audit/recent-history.before.txt
gh release list --limit 50 > .tmp/history-rewrite-audit/github-releases.before.txt
```

Expected:

- The files are created under `.tmp/history-rewrite-audit/`.
- No tracked files are changed.

- [ ] **Step 4: Decide repository freeze window**

Record this in `.tmp/history-rewrite-audit/rewrite-targets.md`:

```markdown
# History Rewrite Target Manifest

## Freeze Window

- Proposed freeze starts: <operator fills exact local time before execution>
- Proposed freeze ends: after fresh-clone verification and collaborator notice
- Protected refs expected to change: pending Task 2 findings
- Force-push approval: not granted yet
```

Expected:

- The manifest exists locally.
- It is not committed.
- Execution stops here if other collaborators are actively pushing to `main`.

## Task 1: Read-Only History Audit

**Files:**
- Read-only: all Git history reachable from `--all`
- Create local output only: `.tmp/history-rewrite-audit/*`

- [ ] **Step 1: Verify required tools**

Run:

```bash
git --version
gh --version
gitleaks version
git filter-repo --version
```

Expected:

- `git`, `gh`, and `gitleaks` are available.
- `git filter-repo` is available. If it is missing, stop and install it with the operator's preferred package manager before continuing. Do not fall back to ad hoc rewrite scripts.

- [ ] **Step 2: Audit known path targets across all refs**

Run:

```bash
git log --all --date=iso --pretty='commit %H %ad %s' -- .orchestrator .claude/settings.json \
  > .tmp/history-rewrite-audit/known-path-commits.txt
git rev-list --objects --all \
  | rg '(^[0-9a-f]{40} \.orchestrator/| \.claude/settings\.json$)' \
  > .tmp/history-rewrite-audit/known-path-objects.txt || true
```

Expected:

- `known-path-commits.txt` lists commits that introduced, changed, or removed local agent state.
- `known-path-objects.txt` is empty only if these paths are no longer present in any reachable history. If it has output, those paths are rewrite targets.

- [ ] **Step 3: Audit workstation absolute paths across all refs**

Run:

```bash
local_path_pattern='/U''sers/[^[:space:]]+|/h''ome/[^/[:space:]]+/[^[:space:]]+|[A-Za-z]:\\\\U''sers\\\\[^[:space:]]+'
git grep -n -I -E "$local_path_pattern" $(git rev-list --all) -- . ':!front/pnpm-lock.yaml' \
  > .tmp/history-rewrite-audit/history-local-paths.txt || true
```

Expected:

- Findings under historical `.orchestrator/`, `.claude/`, or planning docs are rewrite candidates.
- Findings in product source, deploy scripts, or public docs must be reviewed individually and added to the manifest with a specific replacement rule.

- [ ] **Step 4: Audit historical CI workflow credential literals without adding contiguous literals to docs**

Run:

```bash
ci_literal_pattern='readmates-''root|MYSQL_ROOT_PASSWORD:[[:space:]]*readmates|MYSQL_PASSWORD:[[:space:]]*readmates|READMATES_E2E_DB_USER:[[:space:]]*root|READMATES_E2E_DB_PASSWORD:[[:space:]]*readmates-''root'
git grep -n -I -E "$ci_literal_pattern" $(git rev-list --all) -- .github/workflows ':!front/pnpm-lock.yaml' \
  > .tmp/history-rewrite-audit/history-ci-credential-literals.txt || true
```

Expected:

- Any output is a rewrite candidate.
- Treat these as CI/test credential exposure unless the operator confirms the same values were reused outside CI.
- If the same literal appears in non-CI files, classify it separately before rewrite.

- [ ] **Step 5: Run gitleaks against Git history**

Run:

```bash
gitleaks git . \
  --config .gitleaks.toml \
  --no-banner \
  --redact=100 \
  --verbose \
  --report-format=json \
  --report-path=.tmp/history-rewrite-audit/gitleaks-history.json \
  > .tmp/history-rewrite-audit/gitleaks-history.stdout.txt
```

Expected:

- Exit code `0` means no gitleaks findings.
- Non-zero exit means inspect `.tmp/history-rewrite-audit/gitleaks-history.json`.
- Do not suppress findings without recording a false-positive rationale in the manifest.

- [ ] **Step 6: Summarize the read-only audit**

Append this structure to `.tmp/history-rewrite-audit/rewrite-targets.md`:

```markdown
## Read-Only Audit Summary

### Path Targets

- `.orchestrator/`: <present or absent in reachable history>
- `.claude/settings.json`: <present or absent in reachable history>

### String Targets

- workstation absolute paths: <count and representative file paths, no private full paths in committed docs>
- CI credential literals: <count and affected workflow commits>
- gitleaks findings: <count and rule ids>

### Refs Requiring Rewrite

- `refs/heads/main`: <yes or no>
- tags: <list tag names or "none">
- other branches: <list branch names or "none">

### Rotation Required Before Rewrite

- <secret family>: <rotate before rewrite | rotate after rewrite | no rotation needed because test-only and no reuse confirmed>
```

Expected:

- The manifest is specific enough for a human to approve or reject rewrite.
- If any real production secret is found, stop and rotate it before Task 4.

## Task 2: Build The Rewrite Target Manifest

**Files:**
- Create local output only: `.tmp/history-rewrite-audit/rewrite-targets.md`
- Create local output only: `.tmp/history-rewrite-audit/filter-repo-replacements.txt`

- [ ] **Step 1: Decide path deletion targets**

Add this section to `.tmp/history-rewrite-audit/rewrite-targets.md`:

```markdown
## Approved Path Deletion Candidates

- `.orchestrator/`
  - Action: remove from all history with `--path .orchestrator --invert-paths`
  - Reason: agent-local execution state, not product source
- `.claude/settings.json`
  - Action: remove from all history with `--path .claude/settings.json --invert-paths`
  - Reason: local agent hook config, not product source
```

Expected:

- These are path removals, not string replacements.
- If the audit finds more path targets, add each one with a reason and approval status.

- [ ] **Step 2: Build local replacement file for string redaction**

Run:

```bash
cat > .tmp/history-rewrite-audit/filter-repo-replacements.txt <<'EOF'
regex:/U''sers/[^[:space:])>,"]+==><local-user-path>
regex:/h''ome/[^/[:space:]]+/[^[:space:])>,"]+==><local-user-path>
regex:[A-Za-z]:\\\\U''sers\\\\[^[:space:])>,"]+==><local-user-path>
regex:readmates-''root==><ci-mysql-password>
regex:MYSQL_ROOT_PASSWORD:[[:space:]]*readmates==>MYSQL_ROOT_PASSWORD: <ci-mysql-root-password>
regex:MYSQL_PASSWORD:[[:space:]]*readmates==>MYSQL_PASSWORD: <ci-mysql-password>
regex:READMATES_E2E_DB_USER:[[:space:]]*root==>READMATES_E2E_DB_USER: <ci-mysql-user>
regex:READMATES_E2E_DB_PASSWORD:[[:space:]]*readmates-''root==>READMATES_E2E_DB_PASSWORD: <ci-mysql-password>
EOF
```

Expected:

- The file is under `.tmp/` and is not tracked.
- The operator reviews every rule before it is used.
- Do not add broad replacements for the project name or common words.

- [ ] **Step 3: Validate replacement file scope by dry inspection**

Run:

```bash
sed -n '1,220p' .tmp/history-rewrite-audit/filter-repo-replacements.txt
git check-ignore -v .tmp/history-rewrite-audit/filter-repo-replacements.txt
```

Expected:

- Replacement rules are narrow enough to avoid corrupting normal project text.
- `git check-ignore` confirms the replacement file is ignored through `.tmp/`.

- [ ] **Step 4: Approval checkpoint before rewrite simulation**

Do not continue until the operator explicitly approves:

```text
I approve running git-filter-repo in a disposable mirror clone using the manifest at .tmp/history-rewrite-audit/rewrite-targets.md.
I understand this does not push or rewrite the live repository yet.
```

Expected:

- No destructive command has run before this approval.

## Task 3: Disposable Mirror Rewrite Simulation

**Files:**
- Create local output only: `.tmp/history-rewrite-audit/rewrite/ReadMates.git`
- Create local output only: `.tmp/history-rewrite-audit/*.after.txt`

- [ ] **Step 1: Create a disposable mirror clone**

Run:

```bash
rm -rf .tmp/history-rewrite-audit/rewrite
mkdir -p .tmp/history-rewrite-audit/rewrite
git clone --mirror "$(pwd)" .tmp/history-rewrite-audit/rewrite/ReadMates.git
```

Expected:

- The mirror clone exists under `.tmp/history-rewrite-audit/rewrite/ReadMates.git`.
- This command does not modify the working tree or remote repository.

- [ ] **Step 2: Run filter-repo in the disposable mirror**

Run:

```bash
git -C .tmp/history-rewrite-audit/rewrite/ReadMates.git filter-repo \
  --path .orchestrator \
  --path .claude/settings.json \
  --invert-paths \
  --replace-text "$(pwd)/.tmp/history-rewrite-audit/filter-repo-replacements.txt" \
  --force \
  > .tmp/history-rewrite-audit/filter-repo.stdout.txt \
  2> .tmp/history-rewrite-audit/filter-repo.stderr.txt
```

Expected:

- The command exits `0`.
- Only the disposable mirror is rewritten.
- If it fails, inspect stderr, fix the manifest or replacement file, delete the disposable mirror, and retry from Step 1.

- [ ] **Step 3: Verify rewritten refs still exist**

Run:

```bash
git -C .tmp/history-rewrite-audit/rewrite/ReadMates.git show-ref \
  > .tmp/history-rewrite-audit/show-ref.after.txt
git -C .tmp/history-rewrite-audit/rewrite/ReadMates.git log --oneline --decorate --graph --all -30 \
  > .tmp/history-rewrite-audit/recent-history.after.txt
```

Expected:

- Expected branches and tags still exist.
- Sensitive commits may have new hashes. That is expected.
- Unexpected branch or tag deletion is a blocker.

- [ ] **Step 4: Verify target paths are absent from rewritten history**

Run:

```bash
git -C .tmp/history-rewrite-audit/rewrite/ReadMates.git rev-list --objects --all \
  | rg '(^[0-9a-f]{40} \.orchestrator/| \.claude/settings\.json$)' \
  > .tmp/history-rewrite-audit/known-path-objects.after.txt || true
```

Expected:

- `known-path-objects.after.txt` is empty.
- If it has output, the rewrite did not remove all approved path targets.

- [ ] **Step 5: Verify string findings are absent from rewritten history**

Run:

```bash
local_path_pattern='/U''sers/[^[:space:]]+|/h''ome/[^/[:space:]]+/[^[:space:]]+|[A-Za-z]:\\\\U''sers\\\\[^[:space:]]+'
ci_literal_pattern='readmates-''root|MYSQL_ROOT_PASSWORD:[[:space:]]*readmates|MYSQL_PASSWORD:[[:space:]]*readmates|READMATES_E2E_DB_USER:[[:space:]]*root|READMATES_E2E_DB_PASSWORD:[[:space:]]*readmates-''root'
git --git-dir=.tmp/history-rewrite-audit/rewrite/ReadMates.git grep -n -I -E "$local_path_pattern|$ci_literal_pattern" \
  $(git --git-dir=.tmp/history-rewrite-audit/rewrite/ReadMates.git rev-list --all) \
  -- . ':!front/pnpm-lock.yaml' \
  > .tmp/history-rewrite-audit/history-sensitive-strings.after.txt || true
```

Expected:

- `history-sensitive-strings.after.txt` is empty.
- Any output must be classified before push approval.

- [ ] **Step 6: Run gitleaks against rewritten history**

Run:

```bash
gitleaks git .tmp/history-rewrite-audit/rewrite/ReadMates.git \
  --config .gitleaks.toml \
  --no-banner \
  --redact=100 \
  --verbose \
  --report-format=json \
  --report-path=.tmp/history-rewrite-audit/gitleaks-history.after.json \
  > .tmp/history-rewrite-audit/gitleaks-history.after.stdout.txt
```

Expected:

- Exit code `0`.
- If non-zero, inspect the JSON report and update the manifest before retrying.

## Task 4: Verify Rewritten Main Tree As A Public Release Candidate

**Files:**
- Create local output only: `.tmp/history-rewrite-audit/rewrite-main-tree/`

- [ ] **Step 1: Export rewritten `main` tree**

Run:

```bash
rm -rf .tmp/history-rewrite-audit/rewrite-main-tree
mkdir -p .tmp/history-rewrite-audit/rewrite-main-tree
git --git-dir=.tmp/history-rewrite-audit/rewrite/ReadMates.git archive refs/heads/main \
  | tar -x -C .tmp/history-rewrite-audit/rewrite-main-tree
```

Expected:

- The rewritten `main` tree is exported under `.tmp/history-rewrite-audit/rewrite-main-tree`.

- [ ] **Step 2: Run public release checker against rewritten tree**

Run:

```bash
./scripts/public-release-check.sh .tmp/history-rewrite-audit/rewrite-main-tree
```

Expected:

- Public release check passes.
- If it fails, preserve output under `.tmp/history-rewrite-audit/`, classify root cause, and do not request push approval until it is fixed.

- [ ] **Step 3: Compare rewritten `main` tree to current `main` tree**

Run:

```bash
rm -rf .tmp/history-rewrite-audit/current-main-tree
mkdir -p .tmp/history-rewrite-audit/current-main-tree
git archive HEAD | tar -x -C .tmp/history-rewrite-audit/current-main-tree
diff -qr .tmp/history-rewrite-audit/current-main-tree .tmp/history-rewrite-audit/rewrite-main-tree \
  > .tmp/history-rewrite-audit/current-vs-rewritten-tree.diff.txt || true
```

Expected:

- If current `main` already contains the desired clean files, differences should be absent or limited to approved replacement effects in historical blobs not present at HEAD.
- Any current tree difference is a blocker unless explicitly approved.

## Task 5: Build The Exact Push Plan

**Files:**
- Create local output only: `.tmp/history-rewrite-audit/push-plan.md`

- [ ] **Step 1: Identify refs whose object IDs changed**

Run:

```bash
join -a 1 -a 2 -e '<missing>' -o '0,1.1,2.1' \
  <(awk '{print $2, $1}' .tmp/history-rewrite-audit/show-ref.before.txt | sort) \
  <(awk '{print $2, $1}' .tmp/history-rewrite-audit/show-ref.after.txt | sort) \
  > .tmp/history-rewrite-audit/ref-id-comparison.txt
```

Expected:

- The comparison lists each ref name with before and after object IDs.
- Refs with different object IDs are candidates for force-push.

- [ ] **Step 2: Write push plan**

Create `.tmp/history-rewrite-audit/push-plan.md` with this structure:

```markdown
# Push Plan

## Refs To Force Update

- `refs/heads/main`
  - before: <old sha>
  - after: <new sha>
  - command: `git -C .tmp/history-rewrite-audit/rewrite/ReadMates.git push --force-with-lease origin refs/heads/main:refs/heads/main`

## Tags To Force Update

- <tag or "none">

## Refs Not To Push

- <branch or tag name and reason>

## GitHub Settings Needed

- Temporarily allow force-push to protected `main`: <yes or no>
- Temporarily pause required status checks: <yes or no>

## Collaborator Notice

- Freeze start message sent: <yes or no>
- Recovery instructions prepared: <yes or no>
```

Expected:

- Every force-updated ref has an exact command.
- No wildcard push command is used.

- [ ] **Step 3: Approval checkpoint before live force-push**

Do not continue until the operator explicitly approves:

```text
I approve force-pushing the rewritten refs listed in .tmp/history-rewrite-audit/push-plan.md.
I understand this rewrites shared Git history and collaborators must resync.
```

Expected:

- No live remote ref has been rewritten before this approval.

## Task 6: Live Force-Push And Immediate Remote Verification

**Files:**
- Remote refs only after approval
- Create local output only: `.tmp/history-rewrite-audit/post-push-*`

- [ ] **Step 1: Recheck remote lease immediately before push**

Run:

```bash
git ls-remote origin refs/heads/main refs/tags/* \
  > .tmp/history-rewrite-audit/ls-remote.before-push.txt
```

Expected:

- Remote `main` still matches the `before` SHA in the approved push plan.
- If it does not match, stop and rebuild the disposable mirror from the new remote state.

- [ ] **Step 2: Force-push only approved refs**

Run only the exact commands listed in `.tmp/history-rewrite-audit/push-plan.md`.

Expected:

- Each command uses `--force-with-lease`.
- No command uses `--mirror`.
- No unapproved branch or tag is changed.

- [ ] **Step 3: Verify remote refs after push**

Run:

```bash
git ls-remote origin refs/heads/main refs/tags/* \
  > .tmp/history-rewrite-audit/ls-remote.after-push.txt
gh run list --branch main --limit 5 --json databaseId,status,conclusion,headSha,url \
  > .tmp/history-rewrite-audit/gh-runs.after-push.json
```

Expected:

- Remote `main` matches the approved rewritten SHA.
- A new CI run starts for rewritten `main`, or GitHub reports the branch at the expected SHA.

## Task 7: Fresh Clone Verification

**Files:**
- Create local output only: `.tmp/history-rewrite-audit/fresh-clone/`

- [ ] **Step 1: Clone the remote after rewrite**

Run:

```bash
rm -rf .tmp/history-rewrite-audit/fresh-clone
git clone "$(git remote get-url origin)" .tmp/history-rewrite-audit/fresh-clone/ReadMates
```

Expected:

- Fresh clone succeeds.
- Fresh clone default branch is `main`.

- [ ] **Step 2: Re-run history scans in fresh clone**

Run:

```bash
cd .tmp/history-rewrite-audit/fresh-clone/ReadMates
git rev-list --objects --all \
  | rg '(^[0-9a-f]{40} \.orchestrator/| \.claude/settings\.json$)' \
  > ../fresh-known-path-objects.txt || true
local_path_pattern='/U''sers/[^[:space:]]+|/h''ome/[^/[:space:]]+/[^[:space:]]+|[A-Za-z]:\\\\U''sers\\\\[^[:space:]]+'
ci_literal_pattern='readmates-''root|MYSQL_ROOT_PASSWORD:[[:space:]]*readmates|MYSQL_PASSWORD:[[:space:]]*readmates|READMATES_E2E_DB_USER:[[:space:]]*root|READMATES_E2E_DB_PASSWORD:[[:space:]]*readmates-''root'
git grep -n -I -E "$local_path_pattern|$ci_literal_pattern" $(git rev-list --all) -- . ':!front/pnpm-lock.yaml' \
  > ../fresh-sensitive-strings.txt || true
gitleaks git . --config .gitleaks.toml --no-banner --redact=100 --verbose \
  --report-format=json --report-path=../fresh-gitleaks-history.json \
  > ../fresh-gitleaks-history.stdout.txt
```

Expected:

- `fresh-known-path-objects.txt` is empty.
- `fresh-sensitive-strings.txt` is empty.
- `gitleaks git` exits `0`.

- [ ] **Step 3: Verify current public tree**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

- Public release candidate builds.
- Public release check passes.

- [ ] **Step 4: Verify CI**

Run:

```bash
run_id="$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$run_id" --exit-status
```

Expected:

- Latest `main` CI run completes successfully.
- If CI fails, inspect logs before ending the freeze window.

## Task 8: Rotation And External Exposure Follow-Up

**Files:**
- Create local output only: `.tmp/history-rewrite-audit/rotation-follow-up.md`

- [ ] **Step 1: Record rotation decisions**

Create `.tmp/history-rewrite-audit/rotation-follow-up.md`:

```markdown
# Rotation Follow-Up

## Rotated Before Rewrite

- <secret family or "none">

## Rotated After Rewrite

- <secret family or "none">

## No Rotation Needed

- CI-only MySQL test credentials: no external service reuse confirmed

## Manual External Cleanup

- GitHub Actions logs reviewed: <yes or no>
- GitHub releases/tags reviewed: <yes or no>
- Forks or collaborator clones notified: <yes or no>
```

Expected:

- Real production secrets are not left unrotated.
- Test-only values have an explicit no-rotation rationale.

- [ ] **Step 2: Check GitHub releases if tags were rewritten**

Run:

```bash
gh release list --limit 50
```

Expected:

- If release tags were force-updated, release pages still point to the intended tag names.
- If release notes reference removed commits or stale SHAs, update release notes only after explicit approval.

## Task 9: Collaborator Recovery Instructions

**Files:**
- Create local output only: `.tmp/history-rewrite-audit/collaborator-recovery.md`

- [ ] **Step 1: Prepare recovery note**

Create `.tmp/history-rewrite-audit/collaborator-recovery.md`:

````markdown
# ReadMates History Rewrite Recovery

The `main` branch history was rewritten for public repository security hygiene.

## If you have no local work

```bash
git fetch origin
git checkout main
git reset --hard origin/main
```

## If you have local work

```bash
git status --short
git switch -c backup/my-local-work-before-history-rewrite
git fetch origin
git switch main
git reset --hard origin/main
git cherry-pick <your-needed-commit-sha>
```

## Do not

- merge old `origin/main` into rewritten `main`
- push branches containing removed sensitive history back to the repo
- reuse any secret that was listed for rotation
````

Expected:

- The note is ready before ending the freeze window.
- The operator sends it through the team's normal communication channel.

## Task 10: Rollback Plan

**Files:**
- Create local output only: `.tmp/history-rewrite-audit/rollback-plan.md`

- [ ] **Step 1: Document rollback refs**

Create `.tmp/history-rewrite-audit/rollback-plan.md`:

````markdown
# Rollback Plan

Rollback is also a history rewrite and requires explicit approval.

## Pre-Rewrite Refs

See `.tmp/history-rewrite-audit/show-ref.before.txt`.

## Rollback Conditions

- rewritten `main` cannot build
- production deploy path is blocked by missing release tag
- wrong ref was force-pushed

## Rollback Command Shape

```bash
git push --force-with-lease origin <old-main-sha>:refs/heads/main
```

Use the exact old SHA from `show-ref.before.txt`.
````

Expected:

- Rollback is available but not executed automatically.
- If rollback restores sensitive history, rotate affected secrets first and plan a corrected rewrite.

## Final Acceptance Criteria

- The approved rewrite manifest lists every path, string pattern, ref, and rotation decision.
- Disposable mirror rewrite removes all approved sensitive targets.
- Fresh remote clone after force-push has no reachable `.orchestrator/` or `.claude/settings.json` objects.
- Fresh remote clone history scan has no approved workstation path or historical CI credential literal findings.
- `gitleaks git` passes in the fresh remote clone.
- `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` pass in the fresh remote clone.
- Latest GitHub Actions CI for rewritten `main` passes.
- Collaborator recovery note is sent before the freeze window ends.

## Required Human Approvals

This plan has three mandatory approval gates:

1. Approval to run `git filter-repo` in a disposable mirror clone.
2. Approval of the exact rewrite manifest and force-push plan.
3. Approval to force-push rewritten refs to GitHub.

Without all three approvals, execution must stop after read-only audit and local planning output.
