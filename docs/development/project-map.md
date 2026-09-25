# ReadMates Project Map

처음 보는 에이전트와 개발자가 프로젝트 지형을 빠르게 잡기 위한 지도입니다. source of truth는 아닙니다. 코드, 테스트, migrations, scripts, `docs/development/architecture.md`와 다르면 그쪽이 맞고, 이 문서를 고칩니다.

## 처음 5분

| 순서 | 확인할 것 | 이유 |
| --- | --- | --- |
| 1 | `git status --short --branch --untracked-files=all` | 브랜치, 미커밋 변경, ahead/behind를 먼저 봅니다. |
| 2 | Full source checkout의 repository-local contributor guidance(있는 경우)와 이 문서 | 작업 표면과 공통 요청·권한·local-runtime 계약을 고릅니다. |
| 3 | 수정할 경로와 관련 active docs | 경로를 분류하고 frontend, server, design, docs 규칙을 읽습니다. |
| 4 | 아래 "변경 유형별 읽는 순서"와 `acceptance-matrix.md` | 먼저 볼 문서와 risk evidence를 좁힙니다. |
| 5 | `docs/development/architecture.md` | route, BFF/auth, frontend/server 경계가 불명확할 때 봅니다. |
| 6 | 최소 검증 명령 | 바꾼 표면만 검증하고, 못 돌린 검증은 통과처럼 쓰지 않습니다. |

## Source Of Truth 우선순위

| 우선순위 | 근거 | 사용 방식 |
| --- | --- | --- |
| 1 | 현재 코드, 테스트, migrations, scripts | 실제 동작과 검증 명령의 기준입니다. |
| 2 | `docs/development/architecture.md` | 제품/기술 경계와 active architecture 기준입니다. |
| 3 | Full source checkout의 repository-local contributor guidance(있는 경우) | 작업 전 표면별 규칙을 확인합니다. 공개 artifact에는 없어도 됩니다. |
| 4 | `docs/development/*`, `docs/deploy/*`, `docs/operations/*` | 개발, 배포, 운영 절차의 active docs입니다. |
| 5 | `docs/reports/*` | 작성 시점 snapshot입니다. 현재 근거로 쓰기 전에 다시 확인합니다. |
| 6 | `docs/superpowers/*` | 과거 spec/plan 기록입니다. 현재 동작 기준이 아닙니다. |

## 현재 프로젝트 표면

| 표면 | 대표 경로 | 먼저 볼 문서 |
| --- | --- | --- |
| Public site | `/`, `/clubs/:slug`, `/records`, `/sessions/:sessionId` | `docs/development/architecture.md`, `docs/showcase/README.md` |
| Guest app | 익명 사용자의 `/clubs/:slug/app/**`, `/api/public/clubs/:slug/browse/**` | `docs/development/architecture.md`, `docs/development/vertical-slice-checklist.md` |
| Member app | `/clubs/:slug/app/**` | `docs/development/architecture.md`, `docs/development/vertical-slice-checklist.md` |
| Host app | `/clubs/:slug/app/host/**` | `docs/development/architecture.md`, `docs/development/vertical-slice-checklist.md` |
| Platform admin | `/admin/**` | `docs/development/architecture.md`, `docs/development/admin-hardening-baseline.md` |
| Auth/BFF | `/api/bff/**`, `/oauth2/**`, `/login/oauth2/**` | `docs/development/architecture.md`, `docs/development/adr/0001-cloudflare-pages-functions-bff.md` |
| Operations | 배포, observability, runbook, release readiness | `docs/deploy/README.md`, `docs/operations/README.md`, `docs/development/release-readiness-review.md` |

## 코드와 문서 지형

| 경로 | 책임 | 처음 확인할 파일 |
| --- | --- | --- |
| `front/` | React/Vite SPA, route-first frontend, Pages Functions BFF | `front/package.json`, `front/src/app/router.tsx`, `docs/development/architecture.md` |
| `front/functions/` | Cloudflare Pages Functions BFF와 OAuth proxy | `front/functions/_shared/proxy.ts`, `docs/development/architecture.md` |
| `server/` | Kotlin/Spring Boot API, auth, persistence, migrations, async adapters | `server/build.gradle.kts`, `server/src/main/kotlin/com/readmates`, `server/src/main/resources/db/mysql/migration` |
| `design/` | 디자인 시스템 package(`design/system`)와 정적 catalog(`design/docs`) | `design/README.md`, `docs/development/architecture.md` |
| `scripts/` | public release, smoke, deploy helper, safety automation | `scripts/README.md`, `docs/deploy/security-public-repo.md` |
| `deploy/` | OCI Compose stack, Caddy, systemd unit, 배포 script | `docs/deploy/README.md`, `docs/development/release-readiness-review.md` |
| `docs/development/` | active 개발자 문서, architecture, ADR | `docs/development/README.md`, `docs/development/architecture.md` |
| `docs/deploy/` | public-safe 배포 runbook | `docs/deploy/README.md` |
| `docs/operations/` | 운영 runbook, observability, postmortems | `docs/operations/README.md` |
| `docs/superpowers/` | 과거 spec/plan 기록 | 필요한 파일만 열고 현재 코드로 다시 확인합니다. |

## 변경 유형별 읽는 순서

| 변경 유형 | 읽는 순서 | 검증 선택 기준 |
| --- | --- | --- |
| UI/frontend | repository-local contributor guidance(있는 경우) -> `docs/development/architecture.md` -> route/state/tests -> 필요 시 design docs | `docs/development/acceptance-matrix.md`와 함께 `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build` 중 영향 표면에 맞게 선택합니다. |
| BFF/auth/API | repository-local contributor guidance(있는 경우) -> `docs/development/architecture.md` -> BFF/server contract/tests | acceptance matrix의 auth, club-context, header, cookie, redirect 상태와 BFF/server tests, 필요 시 `pnpm --dir front test:e2e`를 선택합니다. |
| Server/persistence/migration | repository-local contributor guidance(있는 경우) -> `docs/development/architecture.md` -> migration/test docs | acceptance matrix와 `./scripts/server-ci-check.sh`를 선택하고, MySQL/Flyway evidence가 필요할 때 별도 `integrationTest` 범위를 판단합니다. |
| Deploy/public-release/security | repository-local contributor guidance(있는 경우) -> deploy docs -> scripts/workflows 직접 확인 | public release candidate checks와 targeted safety scans를 우선합니다. |
| Docs-only | repository-local contributor guidance(있는 경우) -> 관련 active docs | `git diff --check -- <changed-docs>`와 targeted public-safety scan을 실행합니다. |
| Release readiness/residual risk | `docs/development/release-readiness-review.md` -> branch diff | 테스트 통과만으로 닫지 않고 CHANGELOG, CI/deploy, operator-facing change, public safety를 함께 봅니다. |

자주 헷갈리는 slice:

- **Guest browsing**: `front/features/guest-browse`(route/API/model/UI), 서버 `browse` slice(anonymous-safe read), target-club OAuth join을 맡는 `auth` slice로 구성됩니다. 공개 범위의 기준은 V45의 `sessions.access_scope`와 `public_session_publications.site_visibility`입니다. 공개 사이트의 `PUBLIC_RECORD`와 게스트 앱의 `GUEST_READABLE`은 서로 다른 projection입니다. 기존 `visibility`/`is_public`은 호환용 dual-write일 뿐 판단 기준이 아닙니다.
- **Feedback document**: 서버 `feedback` slice의 parser가 `readmates-feedback:v1`과 `v2` 마커를 모두 읽습니다. v2 선택 섹션은 있을 때만 검증·표시합니다([ADR-0072](adr/0072-feedback-document-template-v2.md)). 화면은 `front/features/feedback`입니다.

## 계획에서 실행으로 넘길 때

어떤 planning/execution 도구를 쓰든 handoff에는 아래를 남깁니다.

- 요구사항과 task의 대응 관계
- task 의존성과 예상 수정 파일
- 실제 영향 표면: frontend, BFF, server, migration, deploy, public-safety 중 무엇인지
- focused acceptance 명령과 PR-level evidence
- 고른 acceptance-matrix row, 제외한 인접 high-risk row와 이유
- non-goal, 건너뛴 검증, 릴리즈 운영 후속 작업
- 병렬 작업의 파일 소유권과 공유 DB/container/build output 충돌 여부

Executor 이름, 개인 skill 경로, model, auth, MCP 상태는 plan의 source of truth로 적지 않습니다.

## 검증 선택표

최종 기준은 현재 코드·테스트·scripts와 active docs입니다. 아래 표는 범위를 처음 좁히는 용도입니다.

| 표면 | 대표 명령 |
| --- | --- |
| Frontend | `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build` |
| Server PR-level | `./scripts/server-ci-check.sh` |
| Server full Testcontainers | `./server/gradlew -p server integrationTest` |
| E2E/auth/BFF | `pnpm --dir front test:e2e` |
| Public release | `./scripts/build-public-release-candidate.sh`, `./scripts/public-release-check.sh .tmp/public-release-candidate` |
| Docs-only | `git diff --check -- <changed-docs>` + targeted safety scan |

- `./scripts/server-ci-check.sh`는 `./server/gradlew -p server check`(detekt, `unitTest`, `architectureTest`)를 실행합니다. Gradle 기본 `test` task는 꺼져 있으므로 단위 테스트만 돌릴 때는 `unitTest`를 씁니다.
- pnpm은 루트 `packageManager`를 Corepack으로 씁니다(`corepack pnpm ...`). `corepack`이 PATH에 없으면 `npx --yes corepack@0.35.0 pnpm ...`을 쓰고 실제 실행한 명령을 보고합니다.

## 멈춤 조건

작업 전에 아래 신호가 보이면 먼저 정리하거나 질문합니다.

| 신호 | 처리 |
| --- | --- |
| 관련 파일에 미커밋 변경이 있다 | 누구의 변경인지 확인하고 덮어쓰지 않습니다. |
| 작업 요청이 private data, secret, 실제 운영 도메인, 로컬 절대 경로를 문서화하려 한다 | 공개 가능한 placeholder로 바꾸거나 질문합니다. |
| 코드와 active docs가 다르다 | 코드, 테스트, migrations, scripts를 먼저 확인하고 active docs를 함께 고칩니다. |
| `docs/superpowers/**`나 `docs/reports/**`만 근거로 현재 동작을 설명하려 한다 | 현재 코드와 active docs로 다시 확인한 뒤 씁니다. |
| release readiness나 residual risk를 닫으려 한다 | branch diff와 `docs/development/release-readiness-review.md`를 함께 봅니다. |

## 검증 기록 방식

최종 응답이나 release-readiness 문서에는 실제로 실행한 명령만 적습니다.

- 실행한 명령은 표면별로 묶습니다.
- 실패한 명령은 원인과 다음 조치를 함께 적습니다.
- 실행하지 못한 검증은 통과처럼 쓰지 않습니다.
- docs-only 변경은 `git diff --check -- <changed-docs>`와 targeted safety scan이 기본입니다.
- local runtime 작업은 기존 service, worktree, container, port, cache를 보존하고, 시작 전에 격리 방식을 적습니다.
- public release나 scanner 동작을 바꾸면 public release candidate 점검까지 합니다.

## 역사 문서 경계

- `docs/superpowers/**`: 기능별 spec과 plan의 시계열 기록입니다. 당시 의도를 보여 줄 뿐 현재 동작 기준이 아닙니다.
- `docs/reports/**`: 작성 시점의 분석·진단·사후 보고입니다. 현재 상태를 말할 때는 코드, 테스트, scripts, active docs를 다시 확인합니다.

과거 문서의 아이디어는 가져와도 되지만, 그대로 현재 사실로 쓰면 안 됩니다.
