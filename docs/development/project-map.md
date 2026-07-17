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
| Server/persistence/migration | `AGENTS.md` -> `docs/agents/server.md` -> `docs/development/architecture.md` -> migration/test docs | `./scripts/server-ci-check.sh`와, MySQL/Flyway evidence가 필요할 때 별도 `integrationTest` 범위를 판단합니다. |
| Deploy/public-release/security | `AGENTS.md` -> `docs/agents/docs.md` -> deploy docs -> scripts/workflows 직접 확인 | public release candidate checks와 targeted safety scans를 우선합니다. |
| Docs-only | `AGENTS.md` -> `docs/agents/docs.md` -> 관련 active docs | `git diff --check -- <changed-docs>`와 targeted public-safety scan을 실행합니다. |
| Release readiness/residual risk | `AGENTS.md` -> `docs/development/release-readiness-review.md` -> branch diff | 테스트 통과만으로 닫지 않고 CHANGELOG, CI/deploy, operator-facing change, public safety를 함께 봅니다. |

## 계획에서 실행으로 넘길 때

사용하는 planning 또는 execution tool과 무관하게 ReadMates handoff에는 다음을 남깁니다.

- requirement와 task의 대응 관계;
- task dependency와 예상 수정 파일;
- frontend, BFF, server, migration, deploy, public-safety 중 실제 영향 표면;
- focused acceptance command와 PR-level evidence;
- non-goal, skipped validation, release-operation 후속 작업;
- 병렬 작업의 file ownership과 shared DB/container/build-output 충돌 여부.

Executor 이름, 개인 skill 경로, model, auth, MCP 상태는 plan source of truth로 기록하지 않습니다.

## 검증 선택표

루트 `AGENTS.md`가 최종 검증 기준입니다. 아래 표는 처음 범위를 좁히기 위한 빠른 선택표입니다.

| 표면 | 대표 명령 |
| --- | --- |
| Frontend | `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build` |
| Server PR-level | `./scripts/server-ci-check.sh` |
| Server full Testcontainers | `./server/gradlew -p server integrationTest` |
| E2E/auth/BFF | `pnpm --dir front test:e2e` |
| Public release | `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate` |
| Docs-only | `git diff --check -- <changed-docs>` plus targeted safety scan |

Lockfile, install, build, or CI-parity work uses the root `packageManager` through Corepack. Use `corepack pnpm ...`; if `corepack` is not on `PATH`, use `npx --yes corepack@0.35.0 pnpm ...` and report the exact fallback command.

## 멈춤 조건

작업을 시작하기 전에 아래 신호가 보이면 바로 고치거나 질문합니다.

| 신호 | 처리 |
| --- | --- |
| 관련 파일에 미커밋 변경이 있다 | 누가 만든 변경인지 확인하고 덮어쓰지 않습니다. |
| 작업 요청이 private data, secret, 실제 운영 도메인, 로컬 절대 경로를 문서화하려 한다 | 공개 가능한 placeholder로 바꾸거나 질문합니다. |
| 코드와 active docs가 서로 다른 사실을 말한다 | 코드, 테스트, migrations, scripts를 먼저 확인하고 필요한 active docs를 함께 갱신합니다. |
| `docs/superpowers/**`나 `docs/reports/**`만 근거로 현재 동작을 설명하려 한다 | 현재 코드와 active docs로 재검증한 뒤 씁니다. |
| release readiness나 residual risk를 닫으려 한다 | branch diff와 `docs/development/release-readiness-review.md`를 함께 봅니다. |

## 검증 기록 방식

최종 응답이나 release-readiness 문서에는 실제로 실행한 명령만 적습니다.

- 실행한 명령은 표면별로 묶습니다.
- 실패한 명령은 원인과 다음 조치를 함께 남깁니다.
- 실행하지 못한 검증은 통과처럼 쓰지 않습니다.
- docs-only 변경은 `git diff --check -- <changed-docs>`와 targeted safety scan을 기본으로 봅니다.
- public release나 scanner 동작을 바꾸면 public release candidate checks까지 봅니다.

## 역사 문서 경계

`docs/superpowers/**`는 기능별 design spec과 implementation plan의 시계열 기록입니다. 승인 당시의 의도와 의사결정 맥락을 보여주지만, 현재 동작의 기준은 아닙니다.

`docs/reports/**`는 작성 시점의 분석, 진단, 사후 보고입니다. 날짜가 붙은 snapshot으로 읽고, 현재 상태를 말할 때는 코드, 테스트, scripts, active docs를 다시 확인합니다.

과거 문서에서 유용한 아이디어를 가져올 수는 있지만, 그대로 현재 사실로 쓰면 안 됩니다.
