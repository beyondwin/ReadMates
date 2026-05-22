# ReadMates Graphify Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

```yaml waygent-task
id: readmates_graphify_adoption
title: Implement the ReadMates Graphify adoption plan in docs/superpowers/plans/2026-05-22-readmates-graphify-adoption.md using the approved spec at docs/superpowers/specs/2026-05-22-readmates-graphify-adoption-design.md. Do not create git commits from the task worktree; make only the docs/config file changes and leave generated graphify-out artifacts unstaged.
dependencies: []
file_claims:
  - path: .graphifyignore
    mode: owned
  - path: .gitignore
    mode: owned
  - path: AGENTS.md
    mode: owned
  - path: docs/development/README.md
    mode: owned
  - path: docs/development/graphify.md
    mode: owned
risk: low
verify:
  - git diff --check -- .graphifyignore .gitignore AGENTS.md docs/development/graphify.md docs/development/README.md
  - git check-ignore graphify-out/manifest.json graphify-out/cost.json graphify-out/cache/example graphify-out/.graphify_labels.json graphify-out/.graphify_root graphify-out/GRAPH_REPORT.md graphify-out/graph.json graphify-out/graph.html
  - rg -n "graphify.md|Graphify" docs/development/README.md docs/development/graphify.md AGENTS.md
```

**Goal:** Add a public-safe Graphify workflow for ReadMates so agents can query the codebase graph locally while reviewed architecture evidence remains safe to publish.

**Architecture:** Graphify is introduced as a docs/config workflow, not as a runtime dependency. `.graphifyignore` narrows extraction to current code, public-safe docs, scripts, and migrations; `.gitignore` keeps raw graph artifacts local; `docs/development/graphify.md` documents commands and safety review; `AGENTS.md` adds a short query-first discovery rule without bypassing existing surface guides.

**Tech Stack:** Graphify CLI 0.8.x, Git ignore syntax, Markdown developer docs, shell validation with `git`, `rg`, and `graphify`.

---

## Source Context

- Approved design: `docs/superpowers/specs/2026-05-22-readmates-graphify-adoption-design.md`
- Primary guide for this docs/config change: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`
- Current root router: `AGENTS.md`
- Existing `.gitignore` already excludes local secrets, deployment state, private docs, dependencies, and build output.
- Current local Graphify check during design: `graphify 0.8.14`

## File Structure

- Create `.graphifyignore`
  - Owns Graphify extraction scope.
  - Excludes dependencies, generated output, private/local state, historical planning archive, and Graphify output.
- Modify `.gitignore`
  - Owns Git tracking policy for Graphify output.
  - Keeps raw graph/cost/cache/report/HTML artifacts local while allowing a reviewed curated export to be added intentionally under docs.
- Create `docs/development/graphify.md`
  - Developer-facing workflow: purpose, scope, commands, query examples, export policy, safety checklist, troubleshooting.
- Modify `docs/development/README.md`
  - Adds a discoverable link to the Graphify workflow.
- Modify `AGENTS.md`
  - Adds one routing rule for graphify-assisted discovery.
  - Preserves existing surface guide selection and public-repo safety requirements.

## Task 1: Add Graphify Scope And Artifact Ignore Policy

**Files:**
- Create: `.graphifyignore`
- Modify: `.gitignore`

- [ ] **Step 1: Confirm baseline state**

Run:

```bash
test ! -f .graphifyignore
git status --short
```

Expected: `test ! -f .graphifyignore` exits `0`, and `git status --short` prints no output. If unrelated changes exist, leave them untouched and continue only if they do not overlap `.graphifyignore` or `.gitignore`.

- [ ] **Step 2: Create `.graphifyignore`**

Create `.graphifyignore` with exactly this content:

```gitignore
# ReadMates Graphify extraction scope.
# Keep Graphify focused on current source-of-truth code, migrations, public-safe docs, and scripts.

# VCS and worktrees
.git/
.worktrees/

# Dependencies
node_modules/
front/node_modules/

# Build, coverage, and test output
front/dist/
front/coverage/
front/test-results/
server/build/
server/.gradle/
server/.kotlin/
design/standalone/
design/docs/dist/
design/system/dist/
output/

# Local runtime and tool state
.tmp/
.wrangler/
front/.wrangler/
.cloudflare/
.vercel/
.gstack/
.idea/
.playwright-cli/
.playwright-mcp/
.superpowers/
.claude/
.orchestrator/
.codex-orchestrator/
recode/

# Private or deployment-local material
docs/private/
.server-config/
deploy/oci/.deploy-state
deploy/oci/*.env
deploy/oci/*.state
deploy/cloudflare/.deploy-hook.env

# Secret-like and large local exports
*.pem
*.key
*.sql.gz
*.dump
*.db
*.sqlite
*.sqlite3

# Logs and local process artifacts
*.log
*.pid
*.hprof
hs_err_pid*
replay_pid*

# Local-only user/session import drafts
/readmates-session-*-import.json
/readmates-session-*-import.txt
/session-*-feedback.md
/session-*-feedback.txt

# Historical planning archive. Keep current behavior grounded in code and active docs.
docs/superpowers/

# Graphify output must never be re-indexed.
graphify-out/
```

- [ ] **Step 3: Add Graphify local output rules to `.gitignore`**

Append this block after the local runtime artifact section or near the other local tool-state entries:

```gitignore

# Graphify local extraction artifacts
graphify-out/manifest.json
graphify-out/cost.json
graphify-out/cache/
graphify-out/.graphify_labels.json
graphify-out/.graphify_root
graphify-out/GRAPH_REPORT.md
graphify-out/graph.json
graphify-out/graph.html
```

Do not add `graphify-out/` as a whole-directory ignore. Keep generated Graphify artifacts local-only by default; future reviewed exports should be curated into `docs/showcase` or `docs/development`.

- [ ] **Step 4: Verify ignore behavior**

Run:

```bash
git check-ignore graphify-out/manifest.json graphify-out/cost.json graphify-out/cache/example graphify-out/.graphify_labels.json graphify-out/.graphify_root graphify-out/GRAPH_REPORT.md graphify-out/graph.json graphify-out/graph.html
```

Expected output contains these lines:

```text
graphify-out/manifest.json
graphify-out/cost.json
graphify-out/cache/example
graphify-out/.graphify_labels.json
graphify-out/.graphify_root
graphify-out/GRAPH_REPORT.md
graphify-out/graph.json
graphify-out/graph.html
```

- [ ] **Step 5: Commit graph scope policy**

Run:

```bash
git diff --check -- .graphifyignore .gitignore
git add .graphifyignore .gitignore
git commit -m "chore: add graphify scope policy"
```

Expected: `git diff --check` prints nothing, and the commit succeeds with `.graphifyignore` plus `.gitignore` changes only.

## Task 2: Document The Developer Graphify Workflow

**Files:**
- Create: `docs/development/graphify.md`
- Modify: `docs/development/README.md`

- [ ] **Step 1: Create `docs/development/graphify.md`**

Create `docs/development/graphify.md` with exactly this content:

```markdown
# Graphify 개발 워크플로

Graphify는 ReadMates의 코드, 문서, SQL schema를 로컬 지식 그래프로 추출해 탐색을 빠르게 하는 개발 보조 도구입니다. Graphify 결과는 source of truth가 아닙니다. 현재 동작의 기준은 실제 코드, 테스트, migrations, scripts, `docs/development/architecture.md`, 그리고 관련 `docs/agents/*` guide입니다.

## 사용 목적

- 코드베이스 질문의 시작점을 빠르게 찾습니다.
- frontend, BFF, server, migration, 운영 문서 사이의 연결을 탐색합니다.
- 공개 가능한 아키텍처 증거를 만들 때 후보 자료를 생성합니다.
- 에이전트가 영향 범위를 좁힌 뒤 실제 파일을 직접 검증하게 합니다.

## 분석 범위

`.graphifyignore`가 Graphify 입력 범위를 제한합니다.

포함하는 주요 범위:

- `front/src`, `front/features`, `front/shared`, `front/functions`
- `server/src/main`, `server/src/test`, `server/config`
- Flyway migration SQL and dev seed SQL
- `docs/agents`, `docs/development`, `docs/deploy`, `docs/operations`
- `docs/case-studies`, `docs/showcase`
- `scripts`, `deploy`, `ops`
- `design/system`, `design/docs`
- root docs and config such as `README.md`, `AGENTS.md`, `CHANGELOG.md`, `.github/workflows`

기본 제외 범위:

- dependency, build output, coverage, test result
- local runtime/tool state
- private docs and deployment-local state
- `docs/superpowers` historical planning archive
- generated `graphify-out` files

특정 과거 의사결정의 맥락이 필요하면 `docs/superpowers`의 개별 spec이나 plan을 직접 열어 확인합니다. Graphify 기본 입력으로 historical archive 전체를 넣지는 않습니다.

## 기본 명령

현재 설치 확인:

```bash
graphify --version
```

처음 생성:

```bash
graphify .
```

변경분 갱신:

```bash
graphify update .
```

질의:

```bash
graphify query "what connects frontend route guards to server membership authorization?"
graphify query "show the platform admin API and UI surfaces"
graphify query "which files define public release safety checks?"
```

아키텍처 export 후보 생성:

```bash
graphify export callflow-html
```

Export 결과는 바로 커밋하지 않습니다. 먼저 public-safety review를 통과해야 합니다.

## 에이전트 사용 원칙

1. 코드베이스 질문, 영향 범위, cross-surface architecture 탐색이면 Graphify query로 관련 파일 후보를 좁힙니다.
2. Graphify 결과에서 나온 파일을 실제로 열어 확인합니다.
3. 변경 전에는 루트 `AGENTS.md`가 지시하는 surface guide를 읽습니다.
4. Graphify 결과와 실제 코드가 충돌하면 실제 코드, 테스트, migration, active docs를 우선합니다.
5. Release readiness나 residual risk review는 Graphify query가 아니라 branch diff와 `docs/development/release-readiness-review.md`를 기준으로 합니다.

## 커밋 정책

Local-only 산출물:

- `graphify-out/manifest.json`
- `graphify-out/cost.json`
- `graphify-out/cache/`
- `graphify-out/.graphify_labels.json`
- `graphify-out/.graphify_root`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`
- `graphify-out/graph.html`

Review-gated commit candidates:

- public-safe callflow or architecture export
- curated markdown copied into `docs/showcase` or `docs/development`

`graphify-out/GRAPH_REPORT.md`와 `graphify-out/graph.json`은 에이전트 질의 품질에는 유용하지만 공개 repo에 내부 연결과 문서 추출 결과를 과하게 남길 수 있습니다. 기본 생성물은 local-only로 유지하고, 공개 후보가 필요하면 검토한 내용을 `docs/showcase` 또는 `docs/development` 아래 curated 문서로 옮깁니다.

## Public-Safety Review

Graphify 산출물을 커밋 후보로 올리기 전에 다음을 확인합니다.

```bash
scan_paths="docs/showcase docs/development"
test -d graphify-out && scan_paths="graphify-out ${scan_paths}"
rg -n "(^|[^A-Za-z0-9_])(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_[A-Za-z0-9_]+|AKIA[0-9A-Z]{16}|ocid1\\.|BEGIN (RSA|OPENSSH|PRIVATE) KEY|/[U]sers/|/[Hh]ome/[^[:space:]]+)" ${scan_paths}
```

허용하지 않는 내용:

- secret, token-shaped value, API key, session cookie, OAuth code
- real member data, private email, private domain
- local absolute path, deployment state, OCID
- provider raw error, transcript, private feedback document body
- current code/docs와 충돌하는 inferred relationship

Docs/config만 바꾼 경우 기본 검증:

```bash
git diff --check -- .graphifyignore .gitignore AGENTS.md docs/development/graphify.md docs/development/README.md
```

Public release 정책이나 배포 공개 산출물을 바꾸는 경우에는 루트 `AGENTS.md`의 public release checks를 따릅니다.

## 문제 해결

- `graphify` 명령이 없으면 설치를 먼저 끝내고 이 문서의 명령을 다시 실행합니다.
- Graphify 결과가 너무 크면 `.graphifyignore`에 generated output이나 historical archive가 빠졌는지 확인합니다.
- Graphify query가 불명확하면 질문을 파일, route, package, API path 중심으로 좁힙니다.
- 산출물에 public-safety risk가 보이면 해당 산출물은 커밋하지 않고 local-only로 유지합니다.
```

- [ ] **Step 2: Link Graphify from `docs/development/README.md`**

In the "바로 가기" table, add this row after the `architecture.md` row:

```markdown
| 코드베이스 graph 탐색 | [graphify.md](graphify.md) |
```

In the "주요 구조 문서" list, add this bullet after the first bullet:

```markdown
- 코드베이스 graph 탐색과 public-safe Graphify 산출물 정책은 [graphify.md](graphify.md)를 기준으로 합니다. Graphify 결과는 탐색 보조이며 현재 동작의 source of truth는 실제 코드, 테스트, migration, active docs입니다.
```

- [ ] **Step 3: Verify docs discoverability**

Run:

```bash
rg -n "graphify.md|Graphify" docs/development/README.md docs/development/graphify.md
```

Expected output includes:

```text
docs/development/README.md
docs/development/graphify.md
```

- [ ] **Step 4: Commit developer workflow docs**

Run:

```bash
git diff --check -- docs/development/README.md docs/development/graphify.md
git add docs/development/README.md docs/development/graphify.md
git commit -m "docs: document graphify workflow"
```

Expected: `git diff --check` prints nothing, and the commit succeeds with the developer docs changes only.

## Task 3: Add Agent Router Guidance

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Insert Graphify guidance**

In `AGENTS.md`, add this paragraph after the public repo safety paragraph and before the "Ask before editing" paragraph:

```markdown
Graphify is available as a local codebase discovery aid. For architecture questions, impact analysis, or cross-surface work, use a scoped `graphify query` when the local graph is available, then verify findings against current code, tests, migrations, scripts, and active docs. Graphify does not replace the guide selection above, `docs/development/architecture.md`, or release-readiness review rules below.
```

- [ ] **Step 2: Verify the router wording**

Run:

```bash
rg -n "Graphify|graphify query|does not replace" AGENTS.md
```

Expected output includes the inserted paragraph and no duplicate Graphify paragraph.

- [ ] **Step 3: Commit agent routing update**

Run:

```bash
git diff --check -- AGENTS.md
git add AGENTS.md
git commit -m "docs: route graphify discovery"
```

Expected: `git diff --check` prints nothing, and the commit succeeds with `AGENTS.md` only.

## Task 4: Run Graphify Smoke And Keep Raw Output Local

**Files:**
- No committed file changes expected.
- Local-only generated files under `graphify-out/` may appear.

- [ ] **Step 1: Confirm Graphify CLI**

Run:

```bash
graphify --version
```

Expected output starts with:

```text
graphify 0.8.
```

If the installed version is newer, continue when `graphify --help` still lists `update`, `query`, and `export`.

- [ ] **Step 2: Generate or update the local graph**

Run:

```bash
graphify update .
```

Expected: command exits `0`. If Graphify reports that no graph exists yet, run:

```bash
graphify .
```

Expected: command exits `0` and creates `graphify-out/`.

- [ ] **Step 3: Run a focused query**

Run:

```bash
graphify query "show the files that connect platform admin frontend UI to server admin APIs"
```

Expected: command exits `0` and mentions current source paths such as `front/features/platform-admin` or `server/src/main/kotlin/com/readmates`. Treat the answer as a discovery hint, not as proof of behavior.

- [ ] **Step 4: Confirm raw artifacts remain local**

Run:

```bash
git status --short --ignored graphify-out
```

Expected: ignored raw artifacts such as `manifest.json`, `cost.json`, `cache/`, `GRAPH_REPORT.md`, `graph.json`, or `graph.html` appear with `!!` when present.

- [ ] **Step 5: Do not commit Graphify output**

Run:

```bash
git status --short graphify-out
```

Expected: no output. Generated `graphify-out/` files are local-only and should be ignored. This implementation commits only config and docs.

## Task 5: Final Verification And Handoff

**Files:**
- Verify all changed docs/config files.
- No new files beyond tasks 1-3 should be staged.

- [ ] **Step 1: Run docs/config whitespace validation**

Run:

```bash
git diff --check -- .graphifyignore .gitignore AGENTS.md docs/development/graphify.md docs/development/README.md
```

Expected: no output.

- [ ] **Step 2: Run targeted public-safety scan**

Run:

```bash
rg -n "(^|[^A-Za-z0-9_])(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_[A-Za-z0-9_]+|AKIA[0-9A-Z]{16}|ocid1\\.|BEGIN (RSA|OPENSSH|PRIVATE) KEY|/[U]sers/|/[Hh]ome/[^[:space:]]+)" .graphifyignore .gitignore AGENTS.md docs/development/graphify.md docs/development/README.md
```

Expected: no matches.

- [ ] **Step 3: Confirm public-release checks are not required**

Run:

```bash
git diff --name-only HEAD
```

Expected: no output if tasks 1-3 were committed separately. If the implementation used one final commit instead, changed files are limited to:

```text
.graphifyignore
.gitignore
AGENTS.md
docs/development/README.md
docs/development/graphify.md
```

Because this change is docs/config only and does not alter public release scripts, deploy docs, app code, server code, or generated release artifacts, do not run `./scripts/build-public-release-candidate.sh` in this implementation.

- [ ] **Step 4: Commit any remaining docs/config changes**

If tasks 1-3 were committed separately, run:

```bash
git status --short
```

Expected: only ignored `graphify-out/` artifacts remain. Do not stage `graphify-out/`.

If tasks 1-3 were not committed separately, run:

```bash
git add .graphifyignore .gitignore AGENTS.md docs/development/README.md docs/development/graphify.md
git commit -m "docs: adopt graphify workflow"
```

Expected: commit succeeds with docs/config files only.

- [ ] **Step 5: Final response requirements**

Final response must include:

```text
Changed surface: docs/config
Checks run:
- graphify --version
- graphify update . or graphify .
- graphify query "show the files that connect platform admin frontend UI to server admin APIs"
- git diff --check -- .graphifyignore .gitignore AGENTS.md docs/development/graphify.md docs/development/README.md
- targeted public-safety rg scan
Skipped:
- public release candidate checks, because no public release scripts, deploy docs, app code, or generated public artifacts changed
Residual risk:
- Graphify output remains local-only; future reviewed exports need a separate safety scan before commit
```

If Graphify was not available, replace the Graphify checks with the exact skipped command and reason. Do not claim Graphify smoke passed unless the command actually ran and exited `0`.

## Self-Review

- Spec coverage: Tasks cover `.graphifyignore`, `.gitignore`, `docs/development/graphify.md`, `AGENTS.md`, docs discoverability, local Graphify smoke, public-safety scan, and raw output local-only policy.
- Scope check: This remains docs/config only. It does not add runtime dependencies, CI gates, generated Graphify output, or public release artifacts.
- Safety check: The plan preserves public repo safety and keeps `graphify-out/graph.json` local-only in the first implementation.
