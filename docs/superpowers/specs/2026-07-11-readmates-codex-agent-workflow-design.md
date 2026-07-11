# ReadMates Codex Agent Workflow Design

작성일: 2026-07-11
상태: REVIEW REQUESTED
대상 표면: agent instructions, Superpowers integration, documentation IA, deterministic guidance checks, CI/pre-push, public-release safety

이 문서는 ReadMates에서 Codex가 기능 구현과 버그 수정을 높은 품질로 수행하도록 만드는 저장소 공통 계약을 정의한다. 범용 개발 workflow는 Superpowers를 재사용하고, 저장소에는 ReadMates에서만 알 수 있는 architecture, verification, public-safety 규칙만 둔다.

## 1. 배경

ReadMates는 이미 강한 agent routing 기반을 갖고 있다.

- 루트 `AGENTS.md`가 frontend, BFF, server, design, docs, deploy, release-readiness 작업을 관련 guide로 라우팅한다.
- `front/AGENTS.md`가 Vite SPA와 Cloudflare Pages Functions BFF의 package-local 규칙을 추가한다.
- `docs/agents/*.md`가 surface별 architecture, security, verification 규칙을 설명한다.
- `docs/development/project-map.md`가 처음 탐색 순서와 source-of-truth 우선순위를 제공한다.
- CI와 `scripts/pre-push-check.sh`가 frontend, server, E2E, public-release safety를 기계적으로 검증한다.

현재 문제는 agent instruction의 양이 부족한 것이 아니라, 좋은 문서와 실제 실행 계약 사이의 드리프트다.

설계 시점에 확인한 구체적 결함은 다음과 같다.

1. `server/build.gradle.kts`는 기본 `test` task를 의도적으로 비활성화하지만, 루트 `AGENTS.md`, server guide, README, project map, release-readiness checklist 일부는 `./server/gradlew -p server clean test`를 표준 검증처럼 안내한다. 이 명령은 성공해도 의미 있는 server test evidence가 되지 않는다.
2. `docs/development/project-map.md`의 pnpm fallback 안내가 루트의 Corepack-first 정책과 어긋난다.
3. `docs/development/release-readiness-review.md`는 726줄이며 실제 절차가 633줄 이후에 시작한다. Agent가 active checklist를 읽기 위해 과거 evidence ledger 전체를 함께 소비한다.
4. `.waygent/`는 Git에서 무시되지만 `.graphifyignore`에는 없어 local tool cache가 Graphify 입력에 들어갔다.
5. Agent guide 정합성, 내부 링크, canonical commands, instruction size를 자동 검사하는 빠른 check가 없다.
6. Agent instructions는 clean public-release candidate에서 제외되지만, 원본 tracked instruction을 대상으로 하는 별도 CI safety scan은 없다.

사용자는 보통 Superpowers로 spec과 implementation plan을 직접 승인한 뒤 선택한 executor로 구현한다. ReadMates는 특정 executor나 private workflow를 강제하지 않으면서, 그 plan이 현재 코드와 실제 검증 계약을 정확히 반영하도록 도와야 한다.

## 2. 책임 경계

### 2.1 Superpowers가 소유하는 범용 workflow

ReadMates는 아래 범용 절차를 repo skill로 복제하지 않는다.

| 작업 단계 | 기존 Superpowers 책임 |
| --- | --- |
| 기능 의도 탐색과 설계 승인 | `brainstorming` |
| 실행 가능한 구현 계획 작성 | `writing-plans` |
| 버그 원인 규명 | `systematic-debugging` |
| 기능·버그 구현의 RED-GREEN-REFACTOR | `test-driven-development` |
| 완료 주장 전 fresh evidence | `verification-before-completion` |
| 독립 diff review | `requesting-code-review` |
| merge, PR, branch closeout | `finishing-a-development-branch` |

이 skill들을 조합하면 일반적인 discovery, plan review, code review, verification, integration lifecycle이 이미 완성된다. ReadMates가 `readmates-change-discovery`, `readmates-plan-review`, `readmates-release-review`를 추가하면 동일 책임과 trigger가 겹치므로 도입하지 않는다.

같은 이유로 user-local catalog의 `spec`, `autoplan`, `plan-eng-review`, `investigate`, `review`, `ship`, `document-release`, `health`, `careful` 같은 대체 workflow도 active repo docs에 열거하거나 강제하지 않는다. 사용자가 어느 workflow를 선택하든 ReadMates는 project facts와 evidence contract만 제공한다. 특히 generic release workflow가 `VERSION` 파일을 기대하더라도 이 저장소의 tag 기반 versioning source of truth를 바꾸면 안 된다.

### 2.2 ReadMates가 소유하는 프로젝트 고유 계약

ReadMates 저장소는 다음만 소유한다.

- 어떤 surface guide와 architecture source를 읽어야 하는지;
- frontend, BFF, server, migration, public-release 경계;
- 실제로 의미 있는 canonical verification commands;
- release-readiness에서 확인할 ReadMates 고유 operational risk;
- public repository에 남기면 안 되는 정보;
- Graphify를 discovery aid로 사용하는 범위;
- 위 문서 계약의 drift를 잡는 deterministic check.

### 2.3 Claude 호환 파일의 위치

`.claude/commands/release-readiness.md`는 Claude 환경에서 기존 ReadMates checklist로 들어가는 thin compatibility entrypoint다. 이것은 Codex workflow의 source가 아니고, 새 repo skill의 원본도 아니다.

현재 command file은 stale server 명령과 review 절차를 복제하고 있으므로, base argument와 checklist path만 넘기는 실제 thin pointer로 줄인다. 범용 review 동작은 설치된 workflow가 담당하고, ReadMates 고유 release 기준은 `docs/development/release-readiness-review.md`가 담당한다.

## 3. 공식 Codex 기준

설계는 2026-07-11 현재 공식 OpenAI Codex 문서의 다음 경계를 따른다.

- [`AGENTS.md`](https://developers.openai.com/codex/agent-configuration/agents-md)는 global에서 project root, 현재 working directory 방향으로 합쳐지고 가까운 지침이 뒤에서 우선한다. 기본 combined size limit은 32 KiB다.
- [Repo skills](https://developers.openai.com/codex/build-skills)는 reusable workflow를 패키징한다. 이 설계는 중복 workflow를 만들지 않기 위해 새 skill을 추가하지 않는다.
- [Project custom agents](https://developers.openai.com/codex/agent-configuration/subagents)는 고정 역할이 반복적으로 필요할 때 유용하다. 현재 요구는 built-in exploration과 focused review subagent로 충족되므로 초기 범위에서 제외한다.
- [Project config](https://developers.openai.com/codex/config-file/config-basic)는 trusted project에서만 적용된다. 모델, auth, provider, 개인 MCP, 일반 권한 취향은 user-level configuration의 책임이다.
- [Hooks](https://developers.openai.com/codex/hooks)는 lifecycle guardrail이지만 모든 tool path를 intercept하는 완전한 enforcement boundary가 아니다.
- [Rules](https://developers.openai.com/codex/agent-configuration/rules)는 sandbox 밖 command policy이며 experimental이다.
- [Plugins](https://developers.openai.com/codex/build-plugins), [MCP](https://developers.openai.com/codex/extend/mcp), [automations](https://developers.openai.com/codex/automations)는 각각 capability distribution, external live data, scheduled work가 필요할 때 사용하는 별도 표면이다. 이번 요구에는 해당 입력이나 동작이 없다.

따라서 초기 설계는 작은 `AGENTS.md`, project-specific guides, deterministic checks만 선택한다. Repo skill, project custom agent, project config, hooks, rules, plugin, MCP, automation은 추가하지 않는다.

## 4. 목표

- 기능 구현, 버그 수정, 리팩터링을 시작할 때 agent가 실제 변경 표면과 source of truth를 빠르게 고른다.
- Superpowers로 작성한 spec/plan이 ReadMates의 architecture, dependency, edit scope, acceptance, evidence, non-goal을 정확히 담는다.
- Plan은 특정 executor에 종속되지 않으며 일반 Codex, 별도 plan executor, 사람 모두가 사용할 수 있다.
- Agent는 필요한 guide만 progressive disclosure로 읽고 historical docs나 광범위 Graphify 결과에 묻히지 않는다.
- Active docs의 server/pnpm verification command가 실제 Gradle/CI contract와 일치한다.
- Release-readiness checklist는 짧은 active procedure로 유지되고 기존 날짜별 evidence는 날짜가 붙은 history report로 이동한다.
- Agent guidance의 링크, canonical commands, instruction size, public safety를 CI와 pre-push에서 빠르게 검증한다.
- 개인의 모델, reasoning, sandbox, approval, network, MCP 선택을 repo가 강제하지 않는다.
- 실행하지 못한 검증을 통과로 기록하지 않고 exact command와 skipped reason을 남긴다.

## 5. Non-goals

- `.agents/skills`나 `.codex/agents`를 선제적으로 추가하지 않는다. 반복 실패 evidence가 생기고 기존 Superpowers 또는 built-in agent로 해결되지 않을 때 별도 설계를 거친다.
- `.codex/config.toml`을 추가하지 않는다.
- Project-wide model, reasoning effort, permission, approval policy, network policy를 고정하지 않는다.
- 특정 plan executor나 private skill을 호출하도록 강제하지 않는다.
- 개인 skill 설치 경로, local absolute path, auth state, MCP token을 저장소에 기록하지 않는다.
- Codex hooks, command rules, MCP server, plugin, scheduled automation을 도입하지 않는다.
- 새 parallel implementation orchestrator를 만들지 않는다.
- 기존 CI, Gradle, Vitest, Playwright, public-release scanner를 agent framework로 대체하지 않는다.
- 모든 작은 변경에 spec/plan을 강제하지 않는다. 기능은 승인된 spec/plan workflow를 기본으로 하고, 명백한 소규모 버그는 systematic debugging과 TDD로 직접 처리할 수 있다. 범위가 커지면 spec/plan workflow로 승격한다.
- 이번 repo 변경이 user-local Codex CLI, Homebrew, shim, global config를 수정하지 않는다.

## 6. 검토한 접근

### 접근 A: repo skills와 custom agents를 추가

Discovery, plan review, release review마다 ReadMates 전용 skill과 agent를 둔다.

표면적으로는 호출 이름이 명확하지만 Superpowers와 책임·trigger·검증 계약이 겹친다. 같은 규칙을 `AGENTS.md`, guide, skill, custom agent에 반복하면 유지비와 drift 위험이 커진다.

### 접근 B: 기존 workflow + ReadMates 고유 계약만 유지 - 선택

범용 lifecycle은 사용자가 선택한 설치 workflow를 그대로 사용한다. 저장소에는 router, 기존 project map과 vertical-slice checklist, canonical commands, concise release checklist, deterministic drift checker만 둔다.

장점은 구현 품질에 필요한 절차를 유지하면서 중복 source of truth를 만들지 않는다는 점이다. 저장소는 특정 skill catalog를 active documentation에 고정하지 않고 산출물의 project-specific contract만 요구한다.

### 접근 C: Hooks와 rules까지 포함한 강제 집행

PreToolUse, Stop, blocking command rules를 기본 enforcement로 둔다.

Hook interception은 불완전하고 rules는 experimental이다. ReadMates의 authoritative safety boundary는 CI, clean candidate scanner, repository permission, human release approval이어야 하므로 초기 범위로는 부적절하다.

선택은 **접근 B**다.

## 7. Instruction And Documentation Architecture

### 7.1 루트 router

루트 `AGENTS.md`는 compact router 역할만 담당한다.

- product stack과 작업 전 `git status` 확인;
- surface별 guide 선택;
- architecture와 project map 우선순위;
- public-repo safety;
- Graphify의 discovery-only 경계;
- stop conditions;
- whole-diff release-readiness 범위;
- final response evidence contract.

수정 사항:

- Server PR-level 기본 검증을 기존 `./scripts/server-ci-check.sh`로 통일하고, 이 wrapper가 중복 `architectureTest`를 다시 실행하지 않도록 `check` 한 번만 호출하게 한다.
- Testcontainers가 필요한 변경은 `./server/gradlew -p server integrationTest`를 별도 선택하도록 한다.
- Feature discovery, spec, implementation plan 작업은 기존 `docs/development/project-map.md`와 `docs/development/vertical-slice-checklist.md`로 라우팅한다.
- Release tooling은 ReadMates의 `vMAJOR.MINOR.PATCH` tag와 existing release-management contract를 따라야 하며 generic `VERSION` file workflow를 새 source of truth로 만들지 않는다.
- 특정 executor, private workflow, Claude command 이름을 넣지 않는다.

### 7.2 Package-local instructions

- `front/AGENTS.md`는 현재 package-local 규칙을 유지한다.
- `server/AGENTS.md`는 추가하지 않는다. Root router가 이미 server guide로 라우팅하고 package-local 오판 evidence가 없으므로 pointer-only chain을 늘릴 이유가 없다.
- 더 깊은 `AGENTS.md`는 반복된 routing 실패 evidence가 생기기 전에는 추가하지 않는다.
- `CLAUDE.md`와 `front/CLAUDE.md`는 계속 `@AGENTS.md` pointer-only로 유지한다.

### 7.3 기존 planning surfaces 보강

새 planning guide를 만들지 않는다. 기존 `project-map.md`가 discovery와 source-of-truth 순서를, `vertical-slice-checklist.md`가 cross-surface implementation boundary를 이미 소유한다.

두 문서에 다음 ReadMates-specific handoff contract만 보강한다.

- current code, tests, migrations, scripts, architecture를 먼저 확인한다;
- requirement와 task가 추적 가능하다;
- task dependency와 expected edit surface가 명시된다;
- acceptance command와 필요한 evidence가 명시된다;
- auth/BFF, persistence, migration, public-safety, release 영향이 해당할 때 포함된다;
- non-goal과 skipped validation 경계가 명시된다;
- parallel task는 file ownership과 shared build-state conflict가 없어야 한다;
- executor-specific state나 private path를 plan source of truth로 넣지 않는다.

Exact task 작성법, TDD 순서, plan self-review, executor lifecycle은 repo active docs에 복제하지 않는다.

### 7.4 Release-readiness information architecture

`docs/development/release-readiness-review.md`는 기존 path를 유지하되 active checklist만 남긴다.

- branch/base 범위;
- CHANGELOG, CI/deploy, operator surprise, security hygiene, architecture baseline, public-release safety;
- DB/API 추가 체크;
- recommended commands;
- findings format;
- completion criteria.

기존 날짜별 closeout evidence는 `docs/reports/2026-07-11-release-readiness-history.md`로 한 번 이동한다. 향후 evidence는 하나의 append-only ledger를 다시 키우지 않고 필요할 때 날짜가 붙은 report 또는 release record에 남긴다. Active checklist는 절차 변경 때만 수정한다.

범용 diff review 절차는 Superpowers가 담당하고, 이 문서는 ReadMates에만 해당하는 release 질문과 명령을 제공한다.

## 8. Multi-Agent Policy

- 같은 worktree에서 Gradle verification을 동시에 실행하지 않는다.
- Shared database, container, fixture directory, build output을 쓰는 작업은 독립 parallel lane으로 분류하지 않는다.

독립 task 선택, same-file write 금지, integrator ownership 같은 범용 병렬 정책은 설치된 workflow가 소유한다. ReadMates 문서에는 실제로 재현된 Gradle XML report 충돌과 shared-state 경계만 남긴다. Custom agent는 반복적으로 재현되는 역할 실패와 measurable benefit이 확인된 뒤에만 별도 설계한다.

## 9. Agent Guidance Checker

새 `scripts/check-agent-guidance.py`는 Python standard library만 사용하는 빠른 deterministic checker다.

검사 범위:

1. 필수 router와 guide 존재;
2. Markdown internal links와 referenced files 존재;
3. Root-to-package `AGENTS.md` chain size가 32 KiB 미만;
4. Curated active guidance의 runnable command가 `./scripts/server-ci-check.sh`와 조건부 `integrationTest` contract를 따름;
5. Active docs가 root `package.json`과 Corepack-first pnpm contract를 참조함;
6. `CLAUDE.md` pointer-only contract;
7. `.graphifyignore`의 confirmed local tool-state exclusion;
8. Release checklist와 dated history path 존재 및 active checklist size budget.

`clean test`라는 문자열 전체를 금지하지 않는다. No-op 위험을 설명하는 문장과 historical reports는 허용하고, curated active guidance의 runnable recommendation만 검사한다.

Public-safety regex를 Python에 복제하지 않는다. Checker는 tracked guidance만 temporary tree에 staging하고 기존 `scripts/public-release-check.sh <temporary-tree>`를 호출해 같은 scanner와 allowlist를 재사용한다.

Checker는 오류마다 path, violated rule, expected action을 출력하고 하나라도 실패하면 non-zero로 종료한다. LLM behavior, user-local skill installation, auth, MCP, config state는 검사하지 않는다.

## 10. CI, Pre-Push, And Public-Release Boundary

### 10.1 CI

`.github/workflows/ci.yml`의 scripts job은 무거운 build 전에 guidance checker를 실행한다.

```text
agent guidance
  -> script syntax and ShellCheck
  -> existing PII/public safety checks
  -> frontend/server/E2E jobs
```

Live LLM 호출이나 Codex subscription을 CI gate로 사용하지 않는다.

### 10.2 Pre-push

`scripts/pre-push-check.sh`는 package manager activation 전 fast step으로 guidance checker를 항상 실행한다. 이 구조 검사는 빠르고 전체 repo invariant이므로 별도 path detection list를 유지하지 않는다.

Guidance-only 변경은 clean public candidate에 포함되지 않으므로 그 변경만으로 candidate build를 강제하지 않는다. Guidance source safety는 checker가 staging한 작은 tree에 기존 public scanner를 재사용해 확인한다.

### 10.3 Public-release candidate

현재 public candidate exclusion 정책은 유지한다. 새 `.agents/`나 `.codex/` 디렉터리를 만들지 않으므로 이를 위한 exclusion을 추가하지 않는다.

- Candidate에서 제외되는 tracked instruction도 원본 source를 대상으로 guidance safety scan을 통과해야 한다.
- Agent guidance에 secret, private domain, local absolute path, deployment state, member data를 넣지 않는다.
- Public candidate docs는 제외된 internal-only instruction을 source of truth로 요구하지 않는다.

## 11. Graphify Boundary

- `.waygent/`와 확인된 local orchestration/cache directories를 `.graphifyignore`에 추가한다.
- Cross-surface discovery에서는 scoped query 전에 local graph freshness를 확인한다.
- Graph가 stale하거나 unavailable이면 query를 생략하고 실제 files를 직접 조사한다.
- Graph freshness는 local warning이다. Ignored `graphify-out/`가 없는 CI에서 false failure를 만들지 않는다.
- Graphify output은 discovery aid이며 current code, tests, migrations, scripts, architecture를 대체하지 않는다.

## 12. Data Flow

```text
User request
  -> root AGENTS.md classifies surface
  -> package AGENTS.md adds local guidance when applicable
  -> user-selected workflow owns the generic lifecycle
  -> ReadMates guides supply project-specific constraints
  -> user selects implementation method
  -> existing repo checks verify changed surfaces
  -> selected review and completion workflow inspects fresh evidence
  -> ReadMates release checklist adds whole-diff operational checks
  -> final report records exact evidence and residual risk
```

Product truth remains current code, tests, migrations, scripts, architecture, and active checklists.

## 13. Error Handling

- Missing required guide: fail guidance check with path and required file.
- Broken link or missing reference: fail guidance check before merge.
- Canonical command drift: fail with the stale command and expected replacement.
- Secret or private-looking value: hard fail safety scan.
- Plan ambiguity: return missing project contract items and do not start implementation.
- Graphify stale/unavailable: warn and use direct file inspection.
- Codex CLI or connector unavailable: static repo checks continue; manual smoke is recorded as skipped with reason.
- A relevant test cannot run: do not claim it passed; record exact command and reason.
- Public candidate boundary changes: require clean candidate build and scanner verification.

## 14. Testing Strategy

### 14.1 Deterministic fixtures

Guidance-check fixtures cover:

- valid router and guide set;
- broken Markdown link;
- forbidden runnable server `clean test` recommendation;
- direct unapproved pnpm fallback;
- oversized instruction chain;
- missing local-tool Graphify exclusion;
- missing or oversized release checklist;
- historical or explanatory `clean test` mention that must remain allowed.

The checker provides a `--self-test` mode that creates these small cases with `tempfile`; a new persistent fixture tree is not added. Secret, token, and local-path fixture coverage stays with the existing public-release scanner suite.

### 14.2 Implementation acceptance commands

At minimum:

```bash
python3 scripts/check-agent-guidance.py
python3 scripts/check-agent-guidance.py --self-test
git diff --check -- \
  AGENTS.md \
  front/AGENTS.md \
  docs/agents \
  docs/development \
  docs/reports \
  scripts \
  .github/workflows/ci.yml
```

If shell scripts change:

```bash
bash -n scripts/*.sh
shellcheck scripts/*.sh
```

Because public candidate behavior and source safety checks change:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Graphify scope change evidence:

```bash
graphify update .
graphify query "which files define agent routing, plan quality, verification, and public release safety?"
```

## 15. Rollout Order

1. Make `scripts/server-ci-check.sh` the single PR-level server gate, remove its duplicate `architectureTest` invocation, and correct curated active server/pnpm guidance.
2. Add confirmed local tool state to `.graphifyignore`.
3. Split active release checklist from dated history while preserving the checklist path.
4. Merge ReadMates-specific planning handoff fields into project map and vertical-slice checklist, and reduce the Claude command to a true pointer.
5. Add the guidance checker with temporary self-test fixtures and reuse the existing public scanner for staged guidance.
6. Wire the checker into CI and pre-push.
7. Update only the README/script/report indexes affected by the corrected commands and new dated history.
8. Run deterministic checks, public candidate checks, and Graphify refresh/query.
9. Perform whole-diff review and record residual risks.

## 16. Expected File Scope

New files:

- `docs/reports/2026-07-11-release-readiness-history.md`
- `scripts/check-agent-guidance.py`

Expected modifications:

- `AGENTS.md`
- `.claude/commands/release-readiness.md`
- `README.md`
- `docs/agents/server.md`
- `docs/development/project-map.md`
- `docs/development/vertical-slice-checklist.md`
- `docs/development/local-setup.md`
- `docs/development/performance-budget.md`
- `docs/development/test-guide.md`
- `docs/development/technical-decisions.md`
- `docs/development/release-management.md`
- `docs/development/release-readiness-review.md`
- `docs/development/graphify.md`
- `docs/development/adr/0002-server-clean-architecture-with-archunit.md`
- `docs/development/adr/0007-mysql-with-flyway-over-alternatives.md`
- `docs/deploy/README.md`
- `docs/deploy/compose-stack.md`
- `docs/deploy/release-publish-runbook.md`
- `docs/reports/README.md`
- `.graphifyignore`
- `.github/workflows/ci.yml`
- `scripts/server-ci-check.sh`
- `scripts/pre-push-check.sh`
- `scripts/README.md`

Implementation planning must classify command occurrences as normative active guidance, explanatory warning, or historical evidence before editing. Historical `docs/superpowers/**`, dated reports, postmortems, and unrelated ADR decision text are not bulk-rewritten. The scope must not expand into application feature code, server domain code, frontend product code, migrations, deploy execution, user-global Codex configuration, repo skill, or project custom agent.

## 17. Risks And Mitigations

### Installed workflow와 repo guidance의 경계 drift

Risk: Project map이나 checklist가 점점 특정 installed skill의 범용 절차를 복제한다.

Mitigation: Active docs에는 ReadMates architecture, release model, command contract만 둔다. General TDD, debugging, review, completion 절차와 skill catalog는 repo에 복제하지 않는다.

### Historical evidence false positive

Risk: Historical report의 당시 명령이나 no-op warning이 guidance checker를 실패시킨다.

Mitigation: Checker는 curated normative files와 runnable recommendations만 검사한다. Historical directories와 explanatory negative examples는 명시적으로 구분한다.

### False security from guidance checker

Risk: Checker가 완전한 secret 또는 behavior boundary로 오해된다.

Mitigation: CI, public candidate scanner, repository permissions, review, release approval이 authoritative boundary로 남는다.

### Over-planning small changes

Risk: 모든 작은 버그가 full spec/plan cycle이 된다.

Mitigation: 기능은 approved spec/plan workflow를 기본으로 하고, clear local bug는 systematic debugging과 TDD로 처리한다. Scope growth가 확인되면 planning으로 승격한다.

### Parallel build-state collision

Risk: 여러 agent가 같은 worktree의 Gradle report state를 동시에 사용한다.

Mitigation: read-heavy inspection만 병렬화하고 Gradle verification은 worktree별로 직렬화한다.

### Internal/public boundary mismatch

Risk: 내부 agent guidance는 candidate에서 제외되지만 public docs가 이를 전제로 한다.

Mitigation: public-facing 설명은 tool-neutral하게 유지하고 tracked source guidance는 직접 safety scan한다.

## 18. Completion Criteria

- Curated active guidance에 runnable `clean test` server recommendation이 없고 explanatory/historical mentions는 보존된다.
- `scripts/server-ci-check.sh`, CI backend, pre-push, agent docs가 같은 PR-level server `check` contract를 사용하며 `architectureTest`를 중복 실행하지 않는다.
- Corepack-first package-manager guidance가 active agent와 developer docs에서 일치한다.
- Release checklist가 concise active procedure이고 dated history는 default agent read path 밖에 있다.
- 범용 workflow와 중복되는 repo skill, project custom agent, project config, hook, rule, plugin, MCP, automation이 추가되지 않는다.
- Project map과 vertical-slice checklist는 ReadMates-specific constraints만 포함하고 범용 plan/TDD/review 절차나 installed skill catalog를 복제하지 않는다.
- Guidance checker가 positive fixture를 통과하고 각 negative fixture를 intended rule로 거부한다.
- CI와 pre-push가 fast guidance checker를 실행한다.
- Staged tracked guidance가 existing public scanner를 통과한다.
- Clean public release candidate가 기존 exclusion boundary와 scanner를 통과한다.
- Graphify가 local tool state를 제외하고 scoped discovery는 verified active files로 돌아간다.
- Final response가 exact commands, skipped validation, residual risk를 보고한다.
- Repository는 executor-independent이며 high-quality automated or manual implementation에 필요한 project-specific evidence를 제공한다.
