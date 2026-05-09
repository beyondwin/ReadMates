# Security History Rewrite Detailed Execution Runbook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this runbook task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the security history rewrite plan with explicit evidence capture, approval gates, and remote verification.

**Architecture:** Execute in three lanes: read-only audit, disposable mirror rewrite simulation, and approved live force-push. Never mix audit output, simulation output, and live remote mutation in the same step.

**Tech Stack:** Git, GitHub CLI, `git-filter-repo`, Bash, gitleaks, ReadMates public release scripts.

---

## Source Plan

This runbook implements:

- `docs/superpowers/plans/2026-05-09-security-history-rewrite-remediation-plan.md`

The implementation plan is the scope source of truth. This runbook is the exact execution guide. If they conflict, stop and update the plan before executing destructive steps.

## Operator Rules

- Do not run `git reset --hard`, `git filter-repo`, or `git push --force-with-lease` without reaching the matching approval gate.
- Do not use `git push --mirror`.
- Do not execute broad cleanup commands such as `rm -rf .` or `rm -rf /...`.
- Do not commit `.tmp/history-rewrite-audit/`.
- Do not paste real secret values into committed docs, GitHub issues, PRs, or release notes.
- If any production secret is found, rotate it before live rewrite and record the rotation decision.
- If another person pushes to `main` during the freeze window, stop and rebuild the rewrite from the new remote state.

## Paths

Use these shell variables in every terminal session:

```bash
export RM_REPO="<local-user-path>"
export AUDIT_DIR="$RM_REPO/.tmp/history-rewrite-audit"
export MIRROR_DIR="$AUDIT_DIR/rewrite/ReadMates.git"
export FRESH_DIR="$AUDIT_DIR/fresh-clone/ReadMates"
cd "$RM_REPO"
```

Expected:

- `pwd` prints `<local-user-path>
- `$AUDIT_DIR` is under ignored `.tmp/`.

---

## Phase 0: Preflight

- [ ] **Step 0.1: Confirm clean worktree**

Run:

```bash
cd "$RM_REPO"
git status --short --branch
git rev-parse --show-toplevel
git branch --show-current
```

Expected:

```text
## main...origin/main
<local-user-path>
main
```

If `git status` shows tracked or untracked files outside this runbook's uncommitted docs, stop and ask how to handle them.

- [ ] **Step 0.2: Create audit directory**

Run:

```bash
mkdir -p "$AUDIT_DIR"
git check-ignore -v "$AUDIT_DIR/probe.txt"
```

Expected:

- `git check-ignore` reports the `.tmp` ignore rule.

- [ ] **Step 0.3: Confirm tools**

Run:

```bash
git --version | tee "$AUDIT_DIR/tool-git.txt"
gh --version | tee "$AUDIT_DIR/tool-gh.txt"
gitleaks version | tee "$AUDIT_DIR/tool-gitleaks.txt"
git filter-repo --version | tee "$AUDIT_DIR/tool-filter-repo.txt"
```

Expected:

- All four commands exit `0`.
- If `git filter-repo` is missing, install it before continuing. Do not substitute `filter-branch`.

- [ ] **Step 0.4: Capture current remote and refs**

Run:

```bash
git remote -v | tee "$AUDIT_DIR/remotes.before.txt"
gh repo view --json nameWithOwner,defaultBranchRef,url | tee "$AUDIT_DIR/gh-repo.before.json"
git show-ref | tee "$AUDIT_DIR/show-ref.before.txt"
git log --oneline --decorate --graph --all -50 | tee "$AUDIT_DIR/recent-history.before.txt"
gh release list --limit 50 | tee "$AUDIT_DIR/releases.before.txt"
```

Expected:

- Default branch is `main`.
- `show-ref.before.txt` is non-empty.

---

## Phase 1: Read-Only History Audit

- [ ] **Step 1.1: Scan known path objects**

Run:

```bash
git log --all --date=iso --pretty='commit %H %ad %s' -- .orchestrator .claude/settings.json \
  | tee "$AUDIT_DIR/known-path-commits.txt"

git rev-list --objects --all \
  | rg '(^[0-9a-f]{40} \.orchestrator/| \.claude/settings\.json$)' \
  | tee "$AUDIT_DIR/known-path-objects.txt" || true
```

Expected:

- Any output in `known-path-objects.txt` means the path must be removed by history rewrite.

- [ ] **Step 1.2: Scan workstation absolute paths**

Run:

```bash
local_path_pattern='/U''sers/[^[:space:]]+|/h''ome/[^/[:space:]]+/[^[:space:]]+|[A-Za-z]:\\\\U''sers\\\\[^[:space:]]+'
git grep -n -I -E "$local_path_pattern" $(git rev-list --all) -- . ':!front/pnpm-lock.yaml' \
  | tee "$AUDIT_DIR/history-local-paths.txt" || true
```

Expected:

- Output is allowed during audit.
- Classify each finding before building replacement rules.

- [ ] **Step 1.3: Scan historical CI credential literals**

Run:

```bash
ci_literal_pattern='readmates-''root|MYSQL_ROOT_PASSWORD:[[:space:]]*readmates|MYSQL_PASSWORD:[[:space:]]*readmates|READMATES_E2E_DB_USER:[[:space:]]*root|READMATES_E2E_DB_PASSWORD:[[:space:]]*readmates-''root'
git grep -n -I -E "$ci_literal_pattern" $(git rev-list --all) -- .github/workflows ':!front/pnpm-lock.yaml' \
  | tee "$AUDIT_DIR/history-ci-credential-literals.txt" || true
```

Expected:

- Output is a rewrite candidate.
- If any finding is not limited to CI/test configuration, stop and classify it as a possible real secret exposure.

- [ ] **Step 1.4: Run gitleaks history scan**

Run:

```bash
set +e
gitleaks git . \
  --config .gitleaks.toml \
  --no-banner \
  --redact=100 \
  --verbose \
  --report-format=json \
  --report-path="$AUDIT_DIR/gitleaks-history.json" \
  > "$AUDIT_DIR/gitleaks-history.stdout.txt" \
  2> "$AUDIT_DIR/gitleaks-history.stderr.txt"
echo "$?" > "$AUDIT_DIR/gitleaks-history.exit-code.txt"
set -e
```

Expected:

- Exit code `0`: no gitleaks findings.
- Non-zero: inspect JSON and classify every finding.

- [ ] **Step 1.5: Write audit summary manifest**

Create `$AUDIT_DIR/rewrite-targets.md`:

```bash
cat > "$AUDIT_DIR/rewrite-targets.md" <<'EOF'
# History Rewrite Target Manifest

## Audit Timestamp

- Created at: <fill exact local time>

## Path Deletion Targets

- `.orchestrator/`
  - approved: pending
  - reason: agent-local execution state
- `.claude/settings.json`
  - approved: pending
  - reason: local agent hook configuration

## String Replacement Targets

- workstation absolute paths
  - approved: pending
  - replacement: `<local-user-path>`
- historical CI MySQL literals
  - approved: pending
  - replacement: placeholder CI credential labels
- gitleaks findings
  - approved: pending
  - replacement: pending per finding

## Refs Expected To Change

- `refs/heads/main`: pending
- tags: pending
- other branches: pending

## Rotation Decisions

- production secrets: pending audit classification
- CI/test-only values: pending reuse confirmation
EOF
```

Expected:

- The manifest exists only under `.tmp/`.
- It contains no real secret values.

---

## Approval Gate A: Simulation Approval

Do not continue until the operator explicitly says:

```text
I approve running git-filter-repo in a disposable mirror clone using .tmp/history-rewrite-audit/rewrite-targets.md. This approval does not permit force-push.
```

Record the approval:

```bash
printf '%s\n' "Simulation approval received at: $(date -Iseconds)" \
  | tee "$AUDIT_DIR/approval-a-simulation.txt"
```

---

## Phase 2: Build Replacement File

- [ ] **Step 2.1: Build local replacement rules**

Run:

```bash
cat > "$AUDIT_DIR/filter-repo-replacements.txt" <<'EOF'
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

- File is created under `$AUDIT_DIR`.
- It is not tracked by Git.

- [ ] **Step 2.2: Review replacement rules**

Run:

```bash
sed -n '1,220p' "$AUDIT_DIR/filter-repo-replacements.txt" | tee "$AUDIT_DIR/filter-repo-replacements.review.txt"
git status --short -- "$AUDIT_DIR/filter-repo-replacements.txt"
```

Expected:

- `git status` does not show the file as tracked or untracked due to `.tmp/` ignore.
- No replacement rule is broad enough to rewrite ordinary project text.

---

## Phase 3: Disposable Mirror Rewrite

- [ ] **Step 3.1: Create mirror clone**

Run:

```bash
rm -rf "$AUDIT_DIR/rewrite"
mkdir -p "$AUDIT_DIR/rewrite"
git clone --mirror "$RM_REPO" "$MIRROR_DIR" \
  > "$AUDIT_DIR/mirror-clone.stdout.txt" \
  2> "$AUDIT_DIR/mirror-clone.stderr.txt"
```

Expected:

- `$MIRROR_DIR` exists.
- No remote repository was modified.

- [ ] **Step 3.2: Run `git filter-repo` in mirror clone**

Run:

```bash
git -C "$MIRROR_DIR" filter-repo \
  --path .orchestrator \
  --path .claude/settings.json \
  --invert-paths \
  --replace-text "$AUDIT_DIR/filter-repo-replacements.txt" \
  --force \
  > "$AUDIT_DIR/filter-repo.stdout.txt" \
  2> "$AUDIT_DIR/filter-repo.stderr.txt"
```

Expected:

- Command exits `0`.
- Only `$MIRROR_DIR` is rewritten.

- [ ] **Step 3.3: Capture rewritten refs**

Run:

```bash
git -C "$MIRROR_DIR" show-ref | tee "$AUDIT_DIR/show-ref.after.txt"
git -C "$MIRROR_DIR" log --oneline --decorate --graph --all -50 \
  | tee "$AUDIT_DIR/recent-history.after.txt"
```

Expected:

- Expected branches and tags still exist.

- [ ] **Step 3.4: Verify known paths are gone in mirror**

Run:

```bash
git -C "$MIRROR_DIR" rev-list --objects --all \
  | rg '(^[0-9a-f]{40} \.orchestrator/| \.claude/settings\.json$)' \
  | tee "$AUDIT_DIR/known-path-objects.after.txt" || true
```

Expected:

- `known-path-objects.after.txt` is empty.

- [ ] **Step 3.5: Verify sensitive strings are gone in mirror**

Run:

```bash
local_path_pattern='/U''sers/[^[:space:]]+|/h''ome/[^/[:space:]]+/[^[:space:]]+|[A-Za-z]:\\\\U''sers\\\\[^[:space:]]+'
ci_literal_pattern='readmates-''root|MYSQL_ROOT_PASSWORD:[[:space:]]*readmates|MYSQL_PASSWORD:[[:space:]]*readmates|READMATES_E2E_DB_USER:[[:space:]]*root|READMATES_E2E_DB_PASSWORD:[[:space:]]*readmates-''root'
git --git-dir="$MIRROR_DIR" grep -n -I -E "$local_path_pattern|$ci_literal_pattern" \
  $(git --git-dir="$MIRROR_DIR" rev-list --all) \
  -- . ':!front/pnpm-lock.yaml' \
  | tee "$AUDIT_DIR/history-sensitive-strings.after.txt" || true
```

Expected:

- `history-sensitive-strings.after.txt` is empty.

- [ ] **Step 3.6: Run gitleaks against rewritten mirror**

Run:

```bash
set +e
gitleaks git "$MIRROR_DIR" \
  --config "$RM_REPO/.gitleaks.toml" \
  --no-banner \
  --redact=100 \
  --verbose \
  --report-format=json \
  --report-path="$AUDIT_DIR/gitleaks-history.after.json" \
  > "$AUDIT_DIR/gitleaks-history.after.stdout.txt" \
  2> "$AUDIT_DIR/gitleaks-history.after.stderr.txt"
echo "$?" > "$AUDIT_DIR/gitleaks-history.after.exit-code.txt"
set -e
```

Expected:

- Exit code is `0`.
- Any finding blocks live force-push until classified and fixed.

---

## Phase 4: Rewritten Tree Verification

- [ ] **Step 4.1: Export rewritten `main`**

Run:

```bash
rm -rf "$AUDIT_DIR/rewrite-main-tree" "$AUDIT_DIR/current-main-tree"
mkdir -p "$AUDIT_DIR/rewrite-main-tree" "$AUDIT_DIR/current-main-tree"
git --git-dir="$MIRROR_DIR" archive refs/heads/main | tar -x -C "$AUDIT_DIR/rewrite-main-tree"
git archive HEAD | tar -x -C "$AUDIT_DIR/current-main-tree"
```

Expected:

- Both tree directories exist.

- [ ] **Step 4.2: Compare rewritten tree to current tree**

Run:

```bash
diff -qr "$AUDIT_DIR/current-main-tree" "$AUDIT_DIR/rewrite-main-tree" \
  | tee "$AUDIT_DIR/current-vs-rewritten-tree.diff.txt" || true
```

Expected:

- No output if current `main` tree is already clean.
- Any output must be reviewed before live push.

- [ ] **Step 4.3: Run public release check against rewritten tree**

Run:

```bash
cd "$RM_REPO"
./scripts/public-release-check.sh "$AUDIT_DIR/rewrite-main-tree" \
  | tee "$AUDIT_DIR/public-release-check.rewrite-main-tree.txt"
```

Expected:

- Public-release check passes.

---

## Phase 5: Build Push Plan

- [ ] **Step 5.1: Compare before/after refs**

Run:

```bash
join -a 1 -a 2 -e '<missing>' -o '0,1.1,2.1' \
  <(awk '{print $2, $1}' "$AUDIT_DIR/show-ref.before.txt" | sort) \
  <(awk '{print $2, $1}' "$AUDIT_DIR/show-ref.after.txt" | sort) \
  | tee "$AUDIT_DIR/ref-id-comparison.txt"
```

Expected:

- Every ref has a before and after object id.
- Changed refs are the only force-push candidates.

- [ ] **Step 5.2: Create push plan**

Run:

```bash
cat > "$AUDIT_DIR/push-plan.md" <<'EOF'
# Push Plan

## Refs To Force Update

- `refs/heads/main`
  - before: <copy old sha from ref-id-comparison.txt>
  - after: <copy new sha from ref-id-comparison.txt>
  - command: `git -C "$MIRROR_DIR" push --force-with-lease origin refs/heads/main:refs/heads/main`

## Tags To Force Update

- none unless `ref-id-comparison.txt` shows approved tag changes

## Refs Not To Push

- <list every changed ref that will not be pushed, with reason>

## Required GitHub Settings

- allow protected branch force-push: <yes or no>
- pause merge queue or required status rules: <yes or no>

## Freeze Notice

- freeze start sent: <yes or no>
- collaborator recovery prepared: <yes or no>
EOF
```

Expected:

- The file contains exact SHA values before approval.
- The command uses `--force-with-lease`.

---

## Approval Gate B: Live Force-Push Approval

Do not continue until the operator explicitly says:

```text
I approve force-pushing the exact refs listed in .tmp/history-rewrite-audit/push-plan.md. I understand this rewrites shared history.
```

Record approval:

```bash
printf '%s\n' "Live force-push approval received at: $(date -Iseconds)" \
  | tee "$AUDIT_DIR/approval-b-force-push.txt"
```

---

## Phase 6: Live Force-Push

- [ ] **Step 6.1: Recheck remote lease**

Run:

```bash
git ls-remote origin refs/heads/main refs/tags/* \
  | tee "$AUDIT_DIR/ls-remote.before-push.txt"
```

Expected:

- Remote `main` still matches the `before` SHA in `push-plan.md`.
- If not, stop and restart from Phase 1 using the new remote state.

- [ ] **Step 6.2: Force-push approved `main` ref**

Run only after approval and lease recheck:

```bash
git -C "$MIRROR_DIR" push --force-with-lease origin refs/heads/main:refs/heads/main \
  | tee "$AUDIT_DIR/force-push-main.stdout.txt"
```

Expected:

- Push succeeds.
- If branch protection blocks the push, stop and resolve repository settings with the owner. Do not use a broader push command.

- [ ] **Step 6.3: Push approved tag refs if and only if listed**

Run no command if `push-plan.md` says no tags.

Expected:

- No unapproved tag is modified.

- [ ] **Step 6.4: Capture remote refs after push**

Run:

```bash
git ls-remote origin refs/heads/main refs/tags/* \
  | tee "$AUDIT_DIR/ls-remote.after-push.txt"
gh run list --branch main --limit 5 --json databaseId,status,conclusion,headSha,url \
  | tee "$AUDIT_DIR/gh-runs.after-push.json"
```

Expected:

- Remote `main` points to the approved rewritten SHA.

---

## Phase 7: Fresh Clone Verification

- [ ] **Step 7.1: Fresh clone remote**

Run:

```bash
rm -rf "$AUDIT_DIR/fresh-clone"
mkdir -p "$AUDIT_DIR/fresh-clone"
git clone "$(git remote get-url origin)" "$FRESH_DIR" \
  > "$AUDIT_DIR/fresh-clone.stdout.txt" \
  2> "$AUDIT_DIR/fresh-clone.stderr.txt"
```

Expected:

- Fresh clone succeeds.

- [ ] **Step 7.2: Verify known paths are absent in fresh clone history**

Run:

```bash
cd "$FRESH_DIR"
git rev-list --objects --all \
  | rg '(^[0-9a-f]{40} \.orchestrator/| \.claude/settings\.json$)' \
  | tee "$AUDIT_DIR/fresh-known-path-objects.txt" || true
```

Expected:

- `fresh-known-path-objects.txt` is empty.

- [ ] **Step 7.3: Verify sensitive strings are absent in fresh clone history**

Run:

```bash
cd "$FRESH_DIR"
local_path_pattern='/U''sers/[^[:space:]]+|/h''ome/[^/[:space:]]+/[^[:space:]]+|[A-Za-z]:\\\\U''sers\\\\[^[:space:]]+'
ci_literal_pattern='readmates-''root|MYSQL_ROOT_PASSWORD:[[:space:]]*readmates|MYSQL_PASSWORD:[[:space:]]*readmates|READMATES_E2E_DB_USER:[[:space:]]*root|READMATES_E2E_DB_PASSWORD:[[:space:]]*readmates-''root'
git grep -n -I -E "$local_path_pattern|$ci_literal_pattern" $(git rev-list --all) -- . ':!front/pnpm-lock.yaml' \
  | tee "$AUDIT_DIR/fresh-sensitive-strings.txt" || true
```

Expected:

- `fresh-sensitive-strings.txt` is empty.

- [ ] **Step 7.4: Run gitleaks in fresh clone**

Run:

```bash
cd "$FRESH_DIR"
set +e
gitleaks git . \
  --config .gitleaks.toml \
  --no-banner \
  --redact=100 \
  --verbose \
  --report-format=json \
  --report-path="$AUDIT_DIR/fresh-gitleaks-history.json" \
  > "$AUDIT_DIR/fresh-gitleaks-history.stdout.txt" \
  2> "$AUDIT_DIR/fresh-gitleaks-history.stderr.txt"
echo "$?" > "$AUDIT_DIR/fresh-gitleaks-history.exit-code.txt"
set -e
```

Expected:

- Exit code is `0`.

- [ ] **Step 7.5: Run public release checks in fresh clone**

Run:

```bash
cd "$FRESH_DIR"
./scripts/build-public-release-candidate.sh \
  | tee "$AUDIT_DIR/fresh-build-public-release-candidate.txt"
./scripts/public-release-check.sh .tmp/public-release-candidate \
  | tee "$AUDIT_DIR/fresh-public-release-check.txt"
```

Expected:

- Both commands pass.

- [ ] **Step 7.6: Watch latest CI**

Run:

```bash
cd "$RM_REPO"
run_id="$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
printf '%s\n' "$run_id" | tee "$AUDIT_DIR/latest-main-ci-run-id.txt"
gh run watch "$run_id" --exit-status \
  | tee "$AUDIT_DIR/latest-main-ci-watch.txt"
```

Expected:

- Latest `main` CI completes successfully.

---

## Phase 8: Recovery And Closeout

- [ ] **Step 8.1: Create collaborator recovery note**

Run:

````bash
cat > "$AUDIT_DIR/collaborator-recovery.md" <<'EOF'
# ReadMates History Rewrite Recovery

The `main` branch history was rewritten for public repository security hygiene.

## No local work

```bash
git fetch origin
git checkout main
git reset --hard origin/main
```

## Has local work

```bash
git status --short
git switch -c backup/my-local-work-before-history-rewrite
git fetch origin
git switch main
git reset --hard origin/main
git cherry-pick <your-needed-commit-sha>
```

## Avoid

- Do not merge old `origin/main` into rewritten `main`.
- Do not push branches containing removed sensitive history back to the repo.
- Do not reuse any secret listed for rotation.
EOF
````

Expected:

- Operator can send this note to collaborators before ending the freeze.

- [ ] **Step 8.2: Create closeout report**

Run:

```bash
cat > "$AUDIT_DIR/closeout.md" <<'EOF'
# History Rewrite Closeout

## Summary

- rewritten refs:
- rotated secrets:
- no-rotation rationale:

## Verification

- known path objects absent:
- sensitive string scan passed:
- gitleaks history passed:
- public release check passed:
- GitHub Actions CI passed:

## Remaining Risk

- GitHub caches, Actions logs, forks, and prior clones may retain old objects.
- Any real secret found during audit must remain rotated even after rewrite.

## Follow-Up

- collaborator recovery sent:
- branch protection restored:
- release tags reviewed:
EOF
```

Expected:

- The closeout report records facts from the audit output.
- Do not commit it unless the operator explicitly wants an internal record committed.

## Final Done Criteria

- `$AUDIT_DIR/fresh-known-path-objects.txt` is empty.
- `$AUDIT_DIR/fresh-sensitive-strings.txt` is empty.
- `$AUDIT_DIR/fresh-gitleaks-history.exit-code.txt` contains `0`.
- Fresh clone public release check passed.
- Latest rewritten `main` CI passed.
- Collaborator recovery note was sent.
- Branch protection settings were restored if they were changed.
