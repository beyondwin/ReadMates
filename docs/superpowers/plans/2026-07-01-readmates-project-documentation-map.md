# ReadMates Project Documentation Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact ReadMates project map that helps agents and developers choose the right current documentation, code surface, and verification path without treating historical planning records as source of truth.

**Architecture:** Keep the existing documentation hierarchy intact and add `docs/development/project-map.md` as a routing document, not a replacement for `docs/development/architecture.md`. Wire the existing entrypoints to the map with short links only, preserving `AGENTS.md` as the task router and `docs/agents/docs.md` as the documentation editing guide.

**Tech Stack:** Markdown documentation, ReadMates docs routing, `rg`, `git diff --check`, public-safety regex scans.

## Global Constraints

- Do not move, delete, summarize, or rewrite `docs/superpowers/**`.
- Do not change code, tests, deployment scripts, migrations, runtime settings, or package manifests.
- Do not add real member data, private domains, deployment state, local absolute paths, OCIDs, secrets, credentials, VM/IP values, or token-shaped examples.
- Keep `docs/development/architecture.md` as the active architecture source of truth; `project-map.md` is a map only.
- Keep `AGENTS.md` as the task router; `project-map.md` is a supporting orientation document.
- Keep entrypoint changes short and link-oriented. Do not duplicate large rule blocks from `AGENTS.md`, `docs/agents/*.md`, or `architecture.md`.
- Use Korean-first explanatory style while preserving exact command, path, env var, and route names.

---

## File Structure

- Create `docs/development/project-map.md`: compact project orientation map for agents and developers.
- Modify `README.md`: add a short link to the project map in the documentation guidance area.
- Modify `docs/README.md`: add the project map to the "어디로 갈지" table and keep directory meaning unchanged except for a small clarifying link if needed.
- Modify `docs/development/README.md`: add the project map to shortcuts and the first-reading order.
- Modify `AGENTS.md`: mention the project map as optional orientation for architecture questions, impact analysis, and cross-surface work without replacing required guide selection.
- Modify `docs/agents/docs.md`: require checking project map alignment when documentation structure, entrypoints, or agent-routing docs change.

---

### Task 1: Create The Project Map

**Files:**
- Create: `docs/development/project-map.md`

**Interfaces:**
- Consumes: `README.md`, `AGENTS.md`, `docs/README.md`, `docs/development/README.md`, `docs/development/architecture.md`, `docs/development/vertical-slice-checklist.md`, `docs/development/graphify.md`, `docs/development/release-readiness-review.md`, `docs/agents/docs.md`.
- Produces: `docs/development/project-map.md`, which later entrypoints link to as the current project orientation map.

- [ ] **Step 1: Confirm the working tree and read current docs**

Run:

```bash
git status --short --branch
sed -n '1,220p' README.md
sed -n '1,180p' AGENTS.md
sed -n '1,180p' docs/README.md
sed -n '1,220p' docs/development/README.md
sed -n '1,220p' docs/agents/docs.md
sed -n '1,220p' docs/development/architecture.md
sed -n '1,160p' docs/development/vertical-slice-checklist.md
sed -n '1,180p' docs/development/graphify.md
```

Expected: commands succeed. If existing files already mention `docs/development/project-map.md`, preserve useful wording and avoid duplicate links.

- [ ] **Step 2: Create the project map**

Create `docs/development/project-map.md` with this exact initial content, adjusting only if Step 1 finds already-updated wording that would make a link duplicate:

```markdown
# ReadMates Project Map

이 문서는 ReadMates를 처음 보는 에이전트와 개발자가 현재 프로젝트 지형을 빠르게 잡기 위한 지도입니다. 현재 동작의 source of truth가 아닙니다. 코드, 테스트, migrations, scripts, `docs/development/architecture.md`와 충돌하면 그쪽을 우선하고 이 문서를 갱신합니다.

## 처음 5분

| 순서 | 확인할 것 | 이유 |
| --- | --- | --- |
| 1 | `git status --short --branch` | 현재 브랜치, 미커밋 변경, ahead/behind 상태를 먼저 확인합니다. |
| 2 | 루트 `AGENTS.md` | 작업 표면별 필수 guide와 검증 범위를 고릅니다. |
| 3 | 관련 `docs/agents/*.md` | frontend, server, design, docs 규칙은 실제 수정 표면별로 다릅니다. |
| 4 | 이 문서의 "변경 유형별 읽는 순서" | 어떤 active docs와 코드를 먼저 볼지 좁힙니다. |
| 5 | `docs/development/architecture.md` | 제품 route, BFF/auth, frontend/server 경계가 불명확하면 확인합니다. |
| 6 | 최소 검증 명령 | 변경한 표면만 검증하고, 못 돌린 검증은 통과처럼 쓰지 않습니다. |

## Source Of Truth 우선순위

| 우선순위 | 근거 | 사용 방식 |
| --- | --- | --- |
| 1 | 현재 코드, 테스트, migrations, scripts | 실제 동작과 검증 명령의 기준입니다. |
| 2 | `docs/development/architecture.md` | 제품/기술 경계와 active architecture 기준입니다. |
| 3 | `AGENTS.md`, `docs/agents/*.md`, package-local `AGENTS.md` | 작업 전 읽는 agent routing과 표면별 editing rules입니다. |
| 4 | `docs/development/*`, `docs/deploy/*`, `docs/operations/*` | 개발, 배포, 운영 절차의 active docs입니다. |
| 5 | `docs/reports/*` | 작성 시점의 분석/진단 snapshot입니다. 현재 근거로 쓰기 전에 재검증합니다. |
| 6 | `docs/superpowers/*` | 과거 design spec과 implementation plan archive입니다. 현재 동작 기준이 아닙니다. |

## 현재 프로젝트 표면

| 표면 | 대표 경로 | 먼저 볼 문서 |
| --- | --- | --- |
| Public site | `/`, `/clubs/:slug`, `/records`, `/sessions/:sessionId` | `docs/development/architecture.md`, `docs/showcase/README.md` |
| Member app | `/clubs/:slug/app/**` | `docs/development/architecture.md`, `docs/development/vertical-slice-checklist.md` |
| Host app | `/clubs/:slug/app/host/**` | `docs/development/architecture.md`, `docs/development/vertical-slice-checklist.md` |
| Platform admin | `/admin/**` | `docs/development/architecture.md`, `docs/development/admin-hardening-baseline.md` |
| Auth/BFF | `/api/bff/**`, `/oauth2/**`, `/login/oauth2/**` | `docs/development/architecture.md`, `docs/development/adr/0001-cloudflare-pages-functions-bff.md` |
| Operations | deploy, observability, runbooks, release readiness | `docs/deploy/README.md`, `docs/operations/README.md`, `docs/development/release-readiness-review.md` |

## 코드와 문서 지형

| 경로 | 책임 | 처음 확인할 파일 |
| --- | --- | --- |
| `front/` | React/Vite SPA, route-first frontend, Pages Functions BFF | `front/AGENTS.md`, `front/package.json`, `front/src/app/router.tsx` |
| `front/functions/` | Cloudflare Pages Functions BFF와 OAuth proxy | `docs/agents/front.md`, `docs/agents/server.md`, `front/functions/_shared/proxy.ts` |
| `server/` | Kotlin/Spring Boot API, auth, persistence, migrations, async adapters | `docs/agents/server.md`, `server/build.gradle.kts`, `server/src/main/kotlin/com/readmates` |
| `design/` | 디자인 시스템 workspace와 static catalog | `docs/agents/design.md`, `design/README.md` |
| `scripts/` | public release, smoke, deploy helper, safety automation | `scripts/README.md`, `docs/deploy/security-public-repo.md` |
| `docs/development/` | active 개발자 문서와 architecture source of truth | `docs/development/README.md`, `docs/development/architecture.md` |
| `docs/deploy/` | public-safe 배포 runbook | `docs/deploy/README.md` |
| `docs/operations/` | 운영 runbook, observability, postmortems | `docs/operations/README.md` |
| `docs/superpowers/` | 과거 spec/plan 기록 | 필요한 개별 파일만 열고 current behavior로 재검증합니다. |

## 변경 유형별 읽는 순서

| 변경 유형 | 읽는 순서 | 검증 선택 기준 |
| --- | --- | --- |
| UI/frontend | `AGENTS.md` -> `front/AGENTS.md` -> `docs/agents/front.md` -> 필요 시 `docs/agents/design.md` | `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build` 중 영향 표면에 맞게 선택합니다. |
| BFF/auth/API | `AGENTS.md` -> `docs/agents/front.md` -> `docs/agents/server.md` -> `docs/development/architecture.md` | BFF unit tests, server auth/API tests, 필요 시 `pnpm --dir front test:e2e`를 선택합니다. |
| Server/persistence/migration | `AGENTS.md` -> `docs/agents/server.md` -> `docs/development/architecture.md` -> migration/test docs | focused server tests와 `./server/gradlew -p server clean test` 범위를 판단합니다. |
| Deploy/public-release/security | `AGENTS.md` -> `docs/agents/docs.md` -> deploy docs -> scripts/workflows 직접 확인 | public release candidate checks와 targeted safety scans를 우선합니다. |
| Docs-only | `AGENTS.md` -> `docs/agents/docs.md` -> 관련 active docs | `git diff --check -- <changed-docs>`와 targeted public-safety scan을 실행합니다. |
| Release readiness/residual risk | `AGENTS.md` -> `docs/development/release-readiness-review.md` -> branch diff | 테스트 통과만으로 닫지 않고 CHANGELOG, CI/deploy, operator-facing change, public safety를 함께 봅니다. |

## 검증 선택표

루트 `AGENTS.md`가 최종 검증 기준입니다. 아래 표는 처음 범위를 좁히기 위한 빠른 선택표입니다.

| 표면 | 대표 명령 |
| --- | --- |
| Frontend | `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build` |
| Server | `./server/gradlew -p server clean test` |
| E2E/auth/BFF | `pnpm --dir front test:e2e` |
| Public release | `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate` |
| Docs-only | `git diff --check -- <changed-docs>` plus targeted safety scan |

`pnpm` 실행이 lockfile, install, build, CI parity와 관련되면 repo 규칙에 따라 `npx --yes pnpm@10.33.0 --dir front ...` 형태를 사용하고 최종 응답에 정확한 명령을 적습니다.

## 역사 문서 경계

`docs/superpowers/**`는 기능별 design spec과 implementation plan의 시계열 기록입니다. 승인 당시의 의도와 의사결정 맥락을 보여주지만, 현재 동작의 기준은 아닙니다.

`docs/reports/**`는 작성 시점의 분석, 진단, 사후 보고입니다. 날짜가 붙은 snapshot으로 읽고, 현재 상태를 말할 때는 코드, 테스트, scripts, active docs를 다시 확인합니다.

과거 문서에서 유용한 아이디어를 가져올 수는 있지만, 그대로 현재 사실로 쓰면 안 됩니다.

## Graphify 사용법

Graphify는 코드베이스 discovery aid입니다. architecture question, impact analysis, cross-surface work에서 관련 후보 파일을 좁히는 데 사용합니다.

사용 원칙:

- Graphify 결과는 source of truth가 아닙니다.
- 결과로 나온 파일을 실제로 열어 확인합니다.
- `docs/superpowers/**` archive 전체를 기본 탐색 범위처럼 다루지 않습니다.
- 생성된 `graphify-out/**` 산출물은 local-only로 유지하고, 공개 문서로 옮길 때는 public-safety review를 거칩니다.

자세한 사용법은 `docs/development/graphify.md`를 따릅니다.
```

- [ ] **Step 3: Review for duplication and length**

Run:

```bash
wc -l docs/development/project-map.md
rg -n "source of truth|docs/superpowers|Graphify|git status|release readiness" docs/development/project-map.md
```

Expected:

- `wc -l` reports between 120 and 250 lines.
- `rg` shows each key concept appears in a clear, intentional section.

- [ ] **Step 4: Commit Task 1**

Run:

```bash
git add docs/development/project-map.md
git diff --cached --check -- docs/development/project-map.md
git commit -m "docs: add ReadMates project map"
```

Expected: commit succeeds with only `docs/development/project-map.md` staged.

---

### Task 2: Wire Existing Entrypoints To The Project Map

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/development/README.md`
- Modify: `AGENTS.md`
- Modify: `docs/agents/docs.md`

**Interfaces:**
- Consumes: `docs/development/project-map.md` from Task 1.
- Produces: short routing links from current entrypoints to the project map.

- [ ] **Step 1: Add the root README link**

In `README.md`, under `## 문서 사용 기준`, add this bullet after the opening sentence and before the existing source-of-truth bullets:

```markdown
- 처음 프로젝트 지형을 잡거나 작업 표면을 고를 때: [프로젝트 지도](docs/development/project-map.md)
```

Expected: `README.md` remains an overview and does not duplicate the project map tables.

- [ ] **Step 2: Add the docs hub link**

In `docs/README.md`, add this row near the top of the `## 어디로 갈지` table:

```markdown
| 처음 프로젝트 지형과 작업 표면을 빠르게 고른다 | [`development/project-map.md`](development/project-map.md) |
```

Expected: the existing architecture row remains separate from the project map row.

- [ ] **Step 3: Add the development hub shortcut**

In `docs/development/README.md`, add this row near the top of the `## 바로 가기` table:

```markdown
| 프로젝트 지형과 변경 유형별 읽는 순서 | [project-map.md](project-map.md) |
```

Then in `## 주요 구조 문서`, add this bullet before the onboarding-guide bullet:

```markdown
- 처음 작업 표면을 고르는 에이전트나 개발자는 [project-map.md](project-map.md)에서 source of truth 우선순위, 코드/문서 지형, 변경 유형별 읽는 순서, 검증 선택표를 먼저 확인합니다.
```

Expected: `new-developer-onboarding-guide.md` remains described as the longer onboarding guide.

- [ ] **Step 4: Add the AGENTS orientation sentence**

In `AGENTS.md`, after the paragraph that says `Keep changes scoped to the touched feature and follow docs/development/architecture.md when boundaries are unclear.`, add:

```markdown
For architecture questions, impact analysis, or first-pass orientation across multiple surfaces, use `docs/development/project-map.md` as a navigation aid, then verify against the current code, tests, migrations, scripts, and `docs/development/architecture.md`.
```

Expected: the existing Graphify paragraph remains unchanged and still says Graphify does not replace guide selection or architecture/release rules.

- [ ] **Step 5: Add the docs-agent drift rule**

In `docs/agents/docs.md`, in the "Documentation rules" list after the existing rule about agent instruction changes, add:

```markdown
- If documentation entrypoints, documentation IA, or agent-routing guidance changes, keep `docs/development/project-map.md`, `README.md`, `docs/README.md`, and `docs/development/README.md` aligned without duplicating large rule blocks.
```

Expected: docs-only checks and public-safety scan rules remain unchanged.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add README.md docs/README.md docs/development/README.md AGENTS.md docs/agents/docs.md
git diff --cached --check -- README.md docs/README.md docs/development/README.md AGENTS.md docs/agents/docs.md
git commit -m "docs: wire project map into entrypoints"
```

Expected: commit succeeds with only the five entrypoint files staged.

---

### Task 3: Verify Documentation Safety And Link Integrity

**Files:**
- Verify: `docs/development/project-map.md`
- Verify: `README.md`
- Verify: `docs/README.md`
- Verify: `docs/development/README.md`
- Verify: `AGENTS.md`
- Verify: `docs/agents/docs.md`

**Interfaces:**
- Consumes: Task 1 and Task 2 documentation changes.
- Produces: final verification evidence for docs-only closeout.

- [ ] **Step 1: Run docs whitespace validation**

Run:

```bash
git diff --check -- HEAD~2..HEAD -- docs/development/project-map.md README.md docs/README.md docs/development/README.md AGENTS.md docs/agents/docs.md
```

Expected: no output and exit code 0.

- [ ] **Step 2: Run targeted public-safety scan**

Run:

```bash
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" docs/development/project-map.md README.md docs/README.md docs/development/README.md AGENTS.md docs/agents/docs.md
```

Expected: no matches. If a match appears in pre-existing text outside the changed lines, do not remove unrelated content without checking the diff; report it separately.

- [ ] **Step 3: Verify new relative links point to existing files**

Run:

```bash
test -f docs/development/project-map.md
test -f docs/development/architecture.md
test -f docs/development/graphify.md
test -f docs/development/release-readiness-review.md
test -f docs/development/vertical-slice-checklist.md
test -f docs/agents/docs.md
test -f AGENTS.md
test -f README.md
```

Expected: all commands exit 0.

- [ ] **Step 4: Confirm the final changed surface**

Run:

```bash
git status --short --branch
git log --oneline -3
```

Expected:

- Working tree is clean.
- The latest commits include `docs: wire project map into entrypoints` and `docs: add ReadMates project map`.

- [ ] **Step 5: Report closeout**

Final response should include:

```text
Changed surface: docs-only project documentation and agent routing.
Checks run:
- git diff --check -- HEAD~2..HEAD -- docs/development/project-map.md README.md docs/README.md docs/development/README.md AGENTS.md docs/agents/docs.md
- targeted public-safety scan over changed docs
- relative link existence checks
Remaining risk: project-map drift over time; mitigated by docs/agents/docs.md requiring alignment when entrypoints or routing change.
```

---

## Self-Review

- Spec coverage: Task 1 creates the project map with source-of-truth priority, first-5-minute flow, surface table, code/docs terrain, change-type reading order, verification guide, historical archive boundary, and Graphify usage. Task 2 wires the required entrypoints. Task 3 covers docs-only validation, public-safety scan, link existence, and closeout wording.
- Placeholder scan: no task contains unresolved placeholder markers or open-ended error-handling instructions.
- Type consistency: this plan is documentation-only; the stable produced interface is `docs/development/project-map.md`, and all entrypoint links target that path.
