# ReadMates Graphify Adoption Design

작성일: 2026-05-22
상태: APPROVED DESIGN SPEC

## 배경

ReadMates는 React/Vite frontend, Cloudflare Pages Functions BFF, Kotlin/Spring Boot API, MySQL/Flyway, 운영 문서를 함께 가진 다층 프로젝트다. 현재 구조는 `docs/development/architecture.md`, `docs/agents/*`, 실제 코드와 테스트가 source of truth이고, 기능별 경계도 이미 route-first frontend와 feature package 기반 server architecture로 정리되어 있다.

Graphify는 이 구조를 런타임 기능으로 바꾸는 도구가 아니라, 코드와 문서와 SQL schema를 지식 그래프로 추출해 에이전트와 개발자가 빠르게 질의하도록 돕는 개발 워크플로 도구로 도입한다. 도입 목적은 두 가지다.

- 에이전트가 영향 범위와 아키텍처 연결을 더 빨리 파악하게 한다.
- 공개 가능한 아키텍처 증거와 포트폴리오 보조 산출물을 만들 수 있게 한다.

ReadMates는 public repo safety를 강하게 지키는 프로젝트이므로, 1차 도입은 전체 graph artifact를 그대로 공개 커밋하는 방식이 아니라 **public-safe lightweight adoption**으로 제한한다.

## Source Audit Findings

2026-05-22 기준 확인한 현재 상태:

- repo에는 `front/`, `server/`, Flyway SQL, `docs/development`, `docs/agents`, deploy/runbook, scripts, design-system source가 함께 있다.
- `docs/superpowers`에는 오래된 spec/plan 기록이 많다. historical planning record로는 가치가 있지만, graphify가 현재 구조를 이해하는 1차 입력으로 쓰면 노이즈가 커진다.
- `.gitignore`는 dependency, build output, local secret, local deployment state, private docs, orchestrator state를 이미 다수 제외한다.
- `graphify` CLI는 로컬에 설치되어 있으며, 현재 확인된 버전은 `0.8.14`다.
- upstream graphify README는 팀 사용에서 `graphify-out/` 공유를 제안하지만, `manifest.json`, `cost.json`, optional cache는 local-only로 둘 수 있다고 설명한다.

## 승인된 방향

Graphify는 ReadMates에 **개발 워크플로/아키텍처 증거 레이어**로 도입한다.

도입 모델:

```text
current code/docs/tests
  -> graphify scoped extraction
  -> local graph query and reviewed public exports
  -> agent workflow guidance and portfolio-safe architecture evidence
```

Graphify 결과는 탐색 가속기다. source of truth는 계속 current code, tests, migrations, scripts, and `docs/development/architecture.md`다. Graphify query가 답을 주더라도, 코드 변경이나 release/readiness 판단 전에는 관련 파일과 기존 guide를 직접 확인한다.

## 목표

- 에이전트가 코드베이스 질문, 영향 범위, cross-surface 연결을 탐색할 때 graphify를 먼저 활용할 수 있게 한다.
- Graphify 입력 범위를 현재 구조 중심으로 좁혀 과거 계획 문서와 local state 노이즈를 줄인다.
- Public repo에 커밋 가능한 산출물과 local-only 산출물을 분리한다.
- Graphify export를 포트폴리오/아키텍처 증거로 활용할 수 있는 안전한 검토 절차를 둔다.
- 기존 ReadMates agent routing, public-safety, frontend/server/docs/design guide를 우회하지 않는다.

## 비목표

- ReadMates 앱 런타임에 graphify를 의존성으로 추가하지 않는다.
- CI 필수 gate로 graphify extraction을 즉시 도입하지 않는다.
- `graphify-out/graph.json` 전체를 1차 도입에서 공개 커밋하지 않는다.
- private docs, real member data, secrets, deployment state, local machine path, private domain, OCID, token-shaped examples를 graphify 산출물로 공개하지 않는다.
- `docs/superpowers` historical archive를 현재 architecture source of truth로 승격하지 않는다.

## 분석 범위

1차 graphify 입력은 현재 구조와 운영 경계를 설명하는 파일로 제한한다.

포함:

- `front/src`, `front/features`, `front/shared`, `front/functions`, frontend config and tests
- `server/src/main`, `server/src/test`, `server/config`, Gradle build files
- Flyway migration SQL and dev seed SQL
- `docs/agents`
- `docs/development`
- `docs/deploy`
- `docs/operations`
- `docs/case-studies`
- `docs/showcase`
- `scripts`
- `deploy`
- `ops`
- `design/system`, `design/docs` source
- root project docs and config such as `README.md`, `AGENTS.md`, `CHANGELOG.md`, `.github/workflows`

제외:

- dependency directories such as `node_modules`
- build/test output such as `dist`, `build`, `coverage`, `test-results`
- local runtime directories such as `.tmp`, `.wrangler`, `.gstack`, local orchestrator state
- private docs and local deployment state
- `docs/superpowers` historical specs/plans by default
- generated graphify local cache and cost artifacts

이 범위는 graphify가 "지금의 ReadMates"를 보게 하기 위한 기본값이다. 특정 과거 결정의 맥락이 필요할 때만 `docs/superpowers`의 일부 파일을 별도로 추가할 수 있다.

## Repository Policy

### `.graphifyignore`

Repo root에 `.graphifyignore`를 추가한다. 정책은 deny-by-default가 아니라, 현재 `.gitignore`와 source-of-truth 구조를 반영한 practical exclude 방식으로 둔다.

핵심 규칙:

- generated output, dependency, local state, private docs는 제외한다.
- current source, migration, public-safe docs, runbooks, design-system source는 포함한다.
- `docs/superpowers`는 기본 제외한다.

### `.gitignore`

Graphify 산출물은 커밋 가능성과 local-only 성격을 나눈다.

Local-only:

- `graphify-out/manifest.json`
- `graphify-out/cost.json`
- `graphify-out/cache/`
- 큰 interactive HTML이나 raw full graph 산출물은 1차 도입에서 local-only로 둔다.

Review-gated commit candidates:

- public-safe `GRAPH_REPORT.md` summary
- public-safe callflow or architecture export
- curated markdown copied into `docs/showcase` or `docs/development`

`graphify-out/graph.json`은 에이전트 질의 품질에는 가장 유용하지만, 공개 repo에 내부 연결과 문서 추출 결과가 과하게 남을 수 있다. 1차 도입에서는 local-only로 두고, 별도 public-safety review를 통과한 뒤 확장 여부를 다시 판단한다.

## Agent Workflow

`AGENTS.md`에는 짧은 routing rule만 추가한다.

권장 흐름:

1. 코드베이스 질문, 영향 범위, cross-surface architecture 탐색이면 먼저 scoped `graphify query`를 시도한다.
2. Graphify 결과에서 관련 파일과 개념을 좁힌다.
3. 실제 source files, tests, migrations, docs를 직접 확인한다.
4. 기존 `docs/agents/*` guide와 `docs/development/architecture.md`를 따라 변경한다.

Graphify는 기존 agent router를 대체하지 않는다. Frontend, server, design, docs surface를 만지는 작업은 계속 해당 guide를 먼저 읽는다. Release readiness나 residual risk review는 기존 규칙대로 branch diff와 `docs/development/release-readiness-review.md`를 기준으로 한다.

## Developer Workflow

문서화할 기본 명령:

```bash
graphify .
graphify update .
graphify query "what connects frontend route guards to server membership authorization?"
graphify query "show the platform admin API and UI surfaces"
graphify export callflow-html
```

운영 원칙:

- 평상시에는 `graphify update .`로 변경분 중심 갱신을 권장한다.
- 큰 산출물은 기본적으로 local-only로 유지한다.
- 공개 문서로 남길 export는 별도 safety scan을 통과한 뒤 `docs/showcase` 또는 `docs/development` 아래 curated artifact로 둔다.
- Graphify output이 실제 코드와 충돌하면 실제 코드와 테스트가 우선한다.

## Public-Safety Review

Graphify 산출물을 커밋하려면 다음을 확인한다.

- secret, token-shaped value, API key, session cookie, OAuth code가 없다.
- real member data, private email, private domain, local path, deployment state, OCID가 없다.
- provider raw error, transcript, private feedback document body가 없다.
- 생성 문서가 현재 code/docs와 충돌하지 않는다.
- Graphify의 inferred relationship은 확정 사실처럼 표현하지 않는다.

Docs-only 변경 검증은 기본적으로 다음을 실행한다.

```bash
git diff --check -- <changed-docs-and-config>
```

Graphify 산출물을 공개 후보로 커밋할 때는 targeted public-safety scan을 추가한다. Public release 관련 파일을 바꾸는 경우에는 기존 release candidate checks를 따른다.

## 파일 경계

1차 구현 계획의 예상 파일:

- `.graphifyignore`
- `.gitignore`
- `docs/development/graphify.md`
- `AGENTS.md`

선택 파일:

- reviewed architecture export under `docs/showcase`
- reviewed development guide appendix under `docs/development`

이 spec 작성 단계에서는 실제 graphify extraction output을 커밋하지 않는다. 구현 단계에서 graphify를 한 번 실행해 산출물 크기와 safety risk를 확인하고, 공개 후보 문서는 별도 검토 후 포함 여부를 결정한다.

## Acceptance Criteria

- `.graphifyignore`가 current source 중심 입력 범위를 제공한다.
- `.gitignore`가 graphify local-only 산출물을 명확히 제외한다.
- `docs/development/graphify.md`가 설치, 갱신, query, export, safety review를 설명한다.
- `AGENTS.md`가 graphify query-first guidance를 짧게 추가하되 기존 surface guide를 우회하지 않는다.
- Docs/config 변경에 대해 `git diff --check`가 통과한다.
- Graphify 산출물을 커밋하는 경우 public-safety scan 결과가 final response에 명시된다.

## Risks

- `graphify-out/graph.json`을 공개 커밋하면 내부 연결과 문서 추출 결과가 과하게 노출될 수 있다. 1차 도입에서는 local-only로 둔다.
- `docs/superpowers`를 기본 입력에 넣으면 historical plan이 current behavior처럼 보일 수 있다. 기본 제외하고 필요할 때만 좁게 추가한다.
- Graphify query 결과를 검증 없이 source of truth처럼 쓰면 잘못된 아키텍처 판단으로 이어질 수 있다. 모든 변경 전 실제 파일 확인을 요구한다.
- Graphify export가 크거나 noisy할 수 있다. Curated markdown/document artifact만 공개 후보로 삼는다.

## Rollout

1. 이 design spec을 커밋한다.
2. 사용자 review 후 writing-plans 단계로 넘어간다.
3. 구현 계획에서 docs/config 변경, graphify smoke run, safety scan, optional export review를 task 단위로 나눈다.
4. 구현 후 final response에는 changed surface, checks run, skipped validation, residual risk를 명시한다.
