# ReadMates Codex Repository Setup Design

작성일: 2026-07-19
상태: APPROVED DESIGN SPEC
대상 표면: agent routing, execution guidance, ReadMates acceptance risk selection, deterministic preflight, CI and pre-push guidance checks

## 1. 배경

ReadMates에는 이미 Codex가 작업을 시작하기 위한 기반이 있다.

- 루트 `AGENTS.md`가 frontend, BFF, server, design, docs, deploy, release-readiness 표면을 라우팅한다.
- `front/AGENTS.md`와 `docs/agents/*.md`가 표면별 architecture, security, verification 규칙을 제공한다.
- `docs/development/project-map.md`와 `docs/development/vertical-slice-checklist.md`가 source-of-truth 우선순위와 cross-surface handoff를 설명한다.
- `scripts/check-agent-guidance.py`, CI, `scripts/pre-push-check.sh`가 지침과 실제 검증 계약의 일부를 강제한다.
- 기존 guidance checker의 13개 self-test와 현재-tree 검사는 설계 시점에 통과했다.

따라서 문제는 새 범용 agent framework가 없다는 것이 아니다. 남은 사각지대는 좋은 지침이 실제 작업의 시작, 위험 선택, 검증, 완료 증거까지 자동으로 이어지지 않는다는 점이다.

구체적인 결손은 다음과 같다.

1. `front/` 외의 고위험 디렉터리에는 자동 상속되는 package-local router가 없어 agent가 루트의 수동 링크를 놓칠 수 있다.
2. 분석, 진단, 구현, release, local-runtime 작업의 권한과 완료 계약이 여러 지침과 일반 workflow에 분산되어 있다.
3. ReadMates 고유의 role, club context, session lifecycle, publication visibility, BFF trust, async failure 조합을 매 작업마다 다시 추론해야 한다.
4. Guidance checker의 self-test는 존재하지만 기본 CI 경로에서는 checker actual run만 실행하므로 checker 자체의 회귀가 필수 gate가 아니다.
5. 현재 checker는 curated path 목록과 일부 hard-coded chain에 의존하여 새 nested `AGENTS.md`나 package-manager drift를 자동으로 포착하지 못한다.
6. 변경 경로에서 필요한 guide, risk trigger, verification command를 결정론적으로 제안하는 read-only preflight가 없다.
7. 기존 process, port, container, generated artifact, ignored local orchestration state를 보존하는 공통 규칙이 명시적으로 한곳에 모여 있지 않다.

이 설계는 2026-07-11의 historical Codex workflow design을 확장한다. 당시에는 반복된 routing failure evidence가 없어 `server/AGENTS.md` 등 더 깊은 router를 추가하지 않았다. 이번에는 사용자가 저장소 완결형 defense-in-depth setup을 명시적으로 선택했으므로, 고위험 경계에 한해 pointer-first local router를 추가한다. 범용 workflow, repo skill, custom agent를 복제하지 않는 원칙은 유지한다.

## 2. 목표

- Codex가 수정 전에 repository state, 요청 유형, 변경 표면, 필수 guide, stop reason을 빠르게 확인한다.
- 고위험 디렉터리에서는 가까운 `AGENTS.md`가 관련 project guide를 자동으로 상속시킨다.
- 구현 작업이 ReadMates 고유 상태 조합 중 어떤 위험을 검증해야 하는지 명시적으로 선택한다.
- focused verification에서 PR-level 또는 release-level evidence까지 필요한 경우만 확장한다.
- 실행하지 않은 검증, repository evidence, live-runtime evidence를 구분한다.
- 기존 user changes, local servers, containers, ports, ignored tool state를 임의로 덮거나 종료하지 않는다.
- Guidance와 preflight 자체가 deterministic fixture tests와 CI로 보호된다.
- Root router는 compact하게 유지하고 상세 규칙은 progressive disclosure로 제공한다.

## 3. Non-goals

- Graphify 또는 다른 project-local code graph를 다시 도입하지 않는다.
- `.codex/config.toml`, user-level Codex config, model, reasoning effort, MCP, auth, permission을 저장소에서 고정하지 않는다.
- Repo skill, custom agent, plugin, hook, rules engine, 새로운 parallel orchestrator를 만들지 않는다.
- 기존 `.codex-orchestrator/` local ignored state를 읽기 기준이나 current source of truth로 승격하거나 수정하지 않는다.
- 기존 CI, Vitest, Playwright, Gradle, Testcontainers, public-release scanner를 대체하지 않는다.
- 모든 변경에 전체 test suite, E2E, integrationTest, public-release build를 일괄 강제하지 않는다.
- 모든 분석이나 소규모 문서 변경에 spec, plan, TDD를 강제하지 않는다.
- 자동 commit, push, PR, tag, deploy, production data mutation을 수행하는 agent runner를 만들지 않는다.
- `docs/development/architecture.md`를 이번 작업에서 대규모 재작성하지 않는다.
- Agent-only internal guidance를 clean public-release candidate에 포함하지 않는다.

## 4. 검토한 접근

### 접근 A: 문서만 보강

루트 router와 surface guide에 누락 규칙을 추가한다.

장점은 변경량이 작다는 것이다. 단점은 agent가 어떤 문서를 읽고 어떤 검증을 선택할지 계속 수동으로 추론해야 하며, 새 guide와 command drift를 자동으로 잡지 못한다.

### 접근 B: 저장소 완결형 routing, risk selection, deterministic preflight - 선택

Compact root router, pointer-first local routers, 공통 execution contract, ReadMates acceptance matrix, read-only preflight, 강화된 guidance checker를 함께 둔다.

장점은 범용 agent framework를 복제하지 않으면서도 작업 시작부터 완료 증거까지 끊어진 구간을 연결한다는 점이다. 단점은 guidance checker와 preflight fixture를 함께 유지해야 한다.

### 접근 C: 전역 Codex 설정과 agent platform까지 통합

Repo config, skills, custom agents, hooks, MCP까지 하나의 workflow로 고정한다.

반복 동작을 강하게 통제할 수 있지만 개인 환경과 repository contract가 결합하고, 기존 Superpowers와 CI 책임을 중복하며, public-repo와 contributor portability를 약화한다.

선택은 **접근 B**다.

## 5. Instruction Architecture

### 5.1 Root router

루트 `AGENTS.md`는 계속 compact router다. 상세 실행 규칙을 복제하지 않고 다음 진입점만 추가한다.

- 공통 작업 계약: `docs/agents/execution.md`
- 상태 기반 위험 선택: `docs/development/acceptance-matrix.md`
- deterministic preflight: `python3 scripts/agent-preflight.py`

기존 surface routing, public-repo safety, release readiness, canonical checks, final evidence contract는 유지한다. Combined instruction chain은 현재 32 KiB budget 아래에 있어야 하며 checker가 모든 supported chain을 검증한다.

### 5.2 Pointer-first local routers

아래 파일을 추가한다.

| Path | 자동 적용 목적 | 주요 연결 |
| --- | --- | --- |
| `server/AGENTS.md` | server, persistence, migration 변경에서 server guide 누락 방지 | root router, `docs/agents/server.md`, execution contract |
| `front/functions/AGENTS.md` | BFF와 OAuth proxy의 browser/server trust 경계 강조 | `front/AGENTS.md`, front/server guides, execution contract |
| `scripts/AGENTS.md` | release helper, scanner, generated artifact 변경의 safety contract 적용 | docs guide, `scripts/README.md`, execution contract |
| `deploy/AGENTS.md` | repository config 변경과 live deployment mutation 권한 분리 | docs guide, deploy docs, execution contract |

각 local router는 기존 guide를 복제하지 않는다. 성공 조건, 반드시 읽을 guide, 해당 디렉터리의 고위험 stop rule, canonical check pointer만 짧게 둔다.

`design/AGENTS.md`는 이번 범위에서 추가하지 않는다. Design 변경은 root router와 `docs/agents/design.md`로 충분하며, 이번 설계의 고위험 자동-routing 범위는 server, BFF, scripts, deploy다.

### 5.3 Common execution contract

새 `docs/agents/execution.md`는 surface와 무관한 ReadMates 실행 계약을 소유한다.

요청 유형:

- **Analyze/explain:** read-only evidence를 수집하고 code/config/docs의 근거 수준을 밝힌다.
- **Diagnose:** root cause와 영향 범위를 확인하며 사용자가 fix까지 요청하지 않았다면 product files를 수정하지 않는다.
- **Change/build:** 요청 범위의 구현, focused verification, 필요한 PR-level evidence까지 수행한다.
- **Release/review:** branch 전체 diff, release-readiness checklist, operator follow-up을 함께 본다.
- **Local runtime:** 기존 process를 보존하고 별도 port, checkout, cache 또는 container project로 격리한다.

공통 규칙:

- 수정 전 branch, dirty files, staged files, relevant recent history를 확인한다.
- 기존 변경과 예상 edit surface가 겹치면 덮어쓰지 않고 중단한다.
- Behavior change는 failing test 또는 legacy characterization evidence를 먼저 만든다. Docs-only와 단순 non-behavior config에는 불필요한 TDD를 강제하지 않는다.
- Tracked contract fixture와 명시적으로 요청된 artifact 외에는 build, coverage, report, cache, orchestrator output을 commit하지 않는다.
- Commit, push, PR, tag, deploy, production data mutation은 사용자 요청과 repository release contract에 포함된 경우에만 수행한다.
- Repo source inspection을 live production confirmation처럼 보고하지 않는다.
- 실행하지 못한 validation은 exact command와 reason을 남긴다.

## 6. ReadMates Acceptance Matrix

새 `docs/development/acceptance-matrix.md`는 모든 상태의 Cartesian product를 테스트 목록으로 만들지 않는다. 변경 표면에서 놓치기 쉬운 risk trigger와 최소 evidence를 선택하는 표다.

Matrix 축:

| 축 | 대표 위험 |
| --- | --- |
| Actor | anonymous, invited/pending user, active member, host, platform admin 권한 누수 |
| Club context | scoped slug, unscoped compatibility route, 다른 club context, trusted BFF context 혼동 |
| Session lifecycle | 생성/진행/종료/발행 단계에서 허용 action과 read model 불일치 |
| Publication visibility | host-only, member-visible, public exposure 경계와 cache invalidation |
| Transport/auth | same-origin BFF, OAuth return, cookie/session, trusted header stripping |
| Collection contract | cursor, `items`, `nextCursor`, empty/last page, duplicate accumulation |
| Persistence/migration | Flyway ordering, forward compatibility, rollback limitation, query budget |
| Async/cache/provider | duplicate delivery, retry/dead recovery, Redis unavailable, timeout, typed provider failure |
| UI/runtime | loading, empty, denied, stale, error, Korean/English wrapping, desktop/mobile |

정확한 enum, route, error code, migration path는 matrix에 임의로 고정하지 않는다. 작성 시점의 current code, tests, migrations, `docs/development/architecture.md`에서 가져오고 checker가 링크와 source path drift를 검사한다.

Task handoff 또는 final evidence에는 다음을 남긴다.

- 선택한 matrix 행과 선택 이유;
- 해당하지 않는 고위험 행과 제외 이유;
- automated evidence와 manual evidence;
- 검증하지 못한 runtime/provider/deploy 상태.

`docs/development/vertical-slice-checklist.md`는 cross-surface change에서 이 matrix 선택을 요구하도록 연결한다.

## 7. Deterministic Preflight

새 `scripts/agent-preflight.py`는 Python standard library만 사용하는 read-only tool이다. 파일을 수정하거나 test, commit, process termination을 실행하지 않는다.

### 7.1 Inputs

- repository root: script location에서 결정;
- default base: `origin/main`, 필요 시 `--base`로 override;
- current dirty/staged paths와 base diff;
- optional `--paths`로 아직 수정하지 않은 예상 edit surface 제공;
- optional `--intent`로 analyze, diagnose, change, release, local-runtime 분류 보강;
- `--json` machine-readable output;
- `--self-test` temporary fixture tests.

### 7.2 Outputs

Text와 JSON은 같은 model을 사용한다.

```text
repository_state
surfaces
required_guides
risk_triggers
recommended_checks
stop_reasons
evidence_level
```

분류는 tracked path prefix와 explicit policy table에 기반한다.

- `front/functions/**`는 frontend와 BFF/auth 위험을 함께 선택한다.
- server migration path는 server PR-level과 integration/Flyway evidence를 선택한다.
- docs, scripts, deploy, workflow 변경은 public-safety와 release-sensitive 여부를 구분한다.
- auth, API contract, route, BFF 변경은 E2E 검토를 선택한다.
- release intent는 branch whole-diff와 release-readiness review를 선택한다.
- unknown path는 root router와 project map으로 fallback하고 heavy check 전체를 자동 선택하지 않는다.

Recommended check는 canonical command를 출력할 뿐 실행하지 않는다. 실제 실행 책임은 Codex와 기존 CI/pre-push에 남겨 command orchestration source of truth를 중복하지 않는다.

### 7.3 Stop reasons

Preflight는 다음을 blocking signal로 출력한다.

- expected edit paths와 existing dirty files가 겹침;
- detached HEAD 또는 base resolution 실패로 branch-range 판단 불가;
- private data, secret, live deploy mutation을 요구하지만 authority 불명확;
- local-runtime intent에서 existing process를 침해하지 않고 격리할 방법이 아직 정해지지 않음.

경고와 stop reason은 구분한다. Docker 또는 browser가 아직 없다는 사실은 preflight stop이 아니라 이후 validation availability warning이다.

## 8. Guidance Checker Hardening

`scripts/check-agent-guidance.py`는 기존 public-safety scanner reuse와 command checks를 유지하며 다음을 확장한다.

1. Git-tracked `AGENTS.md`를 자동 발견하고 ignored/local state는 검사 대상에서 제외한다.
2. Root, front, front/functions, server, scripts, deploy instruction chain의 combined size를 검사한다.
3. Local router가 required guide와 execution contract를 참조하는지 검사한다.
4. Root `package.json`의 `packageManager`와 active guidance의 versioned examples가 drift하지 않는지 검사한다.
5. Preflight path policy가 실제 required guide와 canonical check path를 가리키는지 검사한다.
6. 새 active guidance의 internal link와 repository-relative path를 검사한다.
7. Agent-only source를 임시 staging한 뒤 기존 public-release scanner로 private-looking value를 검사한다.

새 guide를 curated tuple에 수동으로 추가해야만 안전해지는 구조는 줄인다. 다만 모든 Markdown 파일을 규범 문서로 취급하지 않고, tracked `AGENTS.md`, explicit active guide roots, preflight policy가 참조하는 파일만 검사한다.

Checker 오류는 path, violated invariant, expected action을 출력하고 non-zero로 끝난다.

## 9. CI, Pre-Push, And Public-Release Boundary

### 9.1 CI

`.github/workflows/ci.yml` scripts job의 빠른 단계는 다음 순서다.

```text
guidance checker self-test
preflight self-test
current-tree guidance check
existing script syntax and safety checks
```

Self-test를 actual run과 분리해 checker implementation이 잘못되어 actual tree를 무조건 통과시키는 회귀를 잡는다. Live LLM이나 external provider 호출은 사용하지 않는다.

### 9.2 Pre-push

기존 `scripts/pre-push-check.sh`가 canonical implementation gate다. 새 preflight는 이를 대체하거나 동일 test suite를 다시 orchestration하지 않는다.

Pre-push에는 current-tree guidance actual check를 유지한다. Self-test는 CI 필수이며 local pre-push에서 매번 반복하지 않아도 된다. Guidance checker 또는 preflight implementation이 바뀐 경우에는 변경 검증 명령으로 두 self-test를 직접 실행한다.

### 9.3 Public-release candidate

기존 `copy_dir`의 root-relative `AGENTS.md` exclusion을 유지해 각 copied subtree의 local router를 candidate에서 제외한다. `docs/agents/execution.md`와 `docs/development/acceptance-matrix.md`가 public candidate에 포함될 수 있으므로 private data, local absolute path, deployment state, token-shaped example을 포함하지 않는다.

Public-release build script 또는 exclusion behavior를 수정하지 않더라도 구현 closeout에서 clean candidate build와 scanner를 실행해 새 nested instruction과 public docs boundary를 증명한다.

## 10. Data Flow

```text
User request
  -> root and nearest local AGENTS.md
  -> agent-preflight classifies intent, paths, state, and stop reasons
  -> required surface guides and execution contract
  -> acceptance matrix selects ReadMates-specific risk rows
  -> focused implementation and verification
  -> existing PR/release gates when triggered
  -> final report separates automated, manual, skipped, and live evidence
```

Current code, tests, migrations, scripts, and architecture remain product source of truth. Preflight and matrix are navigation and evidence-selection aids, not behavior source of truth.

## 11. Error Handling

- **Unknown path:** root router와 project map을 출력하고 전체 suite를 자동 추천하지 않는다.
- **Missing guide:** guidance checker는 required path와 reference owner를 출력하고 실패한다.
- **Broken link or command drift:** merge 전에 deterministic check가 실패한다.
- **Dirty overlap:** preflight stop reason을 출력하며 agent는 기존 변경을 덮지 않는다.
- **Unavailable Docker/browser/provider:** 관련 command를 통과로 기록하지 않고 skipped reason과 필요한 follow-up을 남긴다.
- **Repo/live evidence mismatch:** repository claim과 actual runtime observation을 별도 evidence로 보고한다.
- **Existing local service:** 임의 종료하지 않고 alternate port, isolated checkout, cache, container project를 선택한다.
- **Generated artifact:** tracked fixture인지 확인할 수 없으면 commit 대상에서 제외하고 final status에서 보고한다.
- **Public-safety failure:** scanner finding을 경고로 낮추지 않고 변경 또는 explicit safe classification 전까지 실패로 유지한다.

## 12. Testing Strategy

### 12.1 Guidance checker fixtures

기존 fixture에 다음 cases를 추가한다.

- valid root and all supported local chains;
- missing local router required guide reference;
- untracked or ignored `AGENTS.md`가 active chain으로 오인되지 않음;
- oversized server 또는 front/functions chain;
- root packageManager와 versioned active guidance drift;
- preflight policy가 missing guide 또는 stale command를 가리킴;
- nested instruction에 private-looking value가 들어가 public-safety scan이 실패함.

### 12.2 Preflight fixtures

Temporary repository fixtures로 다음을 검사한다.

- frontend-only path;
- BFF/auth path;
- server behavior path;
- MySQL Flyway migration path;
- docs-only path;
- scripts/deploy/workflow release-sensitive path;
- mixed frontend/server vertical slice;
- dirty overlap;
- unknown path fallback;
- text와 JSON semantic parity.

### 12.3 Implementation acceptance

구현 완료 시 최소 다음을 실행한다.

```bash
python3 -B scripts/check-agent-guidance.py --self-test
python3 -B scripts/agent-preflight.py --self-test
python3 -B scripts/check-agent-guidance.py
python3 -B scripts/agent-preflight.py --intent change --paths front/functions/api/example.ts --json
python3 -B scripts/agent-preflight.py --intent change --paths server/src/main/resources/db/mysql/migration/V999__example.sql
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Fixture path는 실제 product file을 만들지 않는 classification input이다. 구현 계획은 existing path fixture 또는 명시적인 virtual path 처리 방식 중 하나를 선택해 test가 repository content에 의존하지 않게 한다.

Frontend/server product behavior는 바뀌지 않으므로 frontend full suite와 server Gradle suite는 기본 필수 대상이 아니다. Pre-push script, release scanner, package-manager activation, workflow behavior를 수정하면 해당 script fixture, dry-run, ShellCheck 또는 CI-equivalent 검증을 추가한다.

변경 문서에는 다음을 실행한다.

```bash
guidance_docs=(
  AGENTS.md
  server/AGENTS.md
  front/functions/AGENTS.md
  scripts/AGENTS.md
  deploy/AGENTS.md
  docs/agents/execution.md
  docs/agents/docs.md
  docs/development/acceptance-matrix.md
  docs/development/project-map.md
  docs/development/vertical-slice-checklist.md
  scripts/README.md
)
git diff --check -- "${guidance_docs[@]}"
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" "${guidance_docs[@]}"
```

## 13. File Scope

새 파일:

- `docs/agents/execution.md`
- `docs/development/acceptance-matrix.md`
- `server/AGENTS.md`
- `front/functions/AGENTS.md`
- `scripts/AGENTS.md`
- `deploy/AGENTS.md`
- `scripts/agent-preflight.py`

수정 파일:

- `AGENTS.md`
- `docs/agents/docs.md`
- `docs/development/project-map.md`
- `docs/development/vertical-slice-checklist.md`
- `scripts/check-agent-guidance.py`
- `scripts/README.md`
- `.github/workflows/ci.yml`

`scripts/pre-push-check.sh`의 checker CLI는 `python3 scripts/check-agent-guidance.py`로 유지하므로 이번 구현에서 수정하지 않는다. 새 self-test는 CI와 guidance/preflight 구현 변경의 focused validation에서 실행한다.

Implementation 중 checker fixture 또는 public candidate contract가 요구하는 최소 파일은 추가할 수 있다. Frontend/server product source, API contract, DB migration, live deploy config는 이 설계의 edit scope가 아니다.

## 14. Completion Criteria

- Root와 모든 supported local instruction chain이 size와 reference checks를 통과한다.
- Preflight가 대표 경로를 stable text/JSON model로 분류하고 어떤 command도 실행하지 않는다.
- Acceptance matrix가 current architecture source와 연결되고 exhaustive test 요구로 오해되지 않는다.
- CI가 checker self-test, preflight self-test, current guidance actual check를 실행한다.
- Existing pre-push, public-release, frontend, server verification source of truth가 중복되지 않는다.
- Public-release candidate가 새 public docs를 안전하게 포함하고 local routers를 제외한다.
- Final implementation report가 changed surface, exact checks, skipped validation, residual risk를 구분한다.
