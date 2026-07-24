# 테스트 스위트 효과성 최적화 Phase 4 Browser/Visual/CI 보고서

## 결론

Phase 4는 시작 커밋 `cca15776`에서 최종 runtime 후보 `33cbe73e`까지
browser/visual/CI 테스트의 실효성과 도달 가능성을 강화했다. 제품 계약은
현재 구현을 기준으로 유지했으며 production 코드, API, route, auth,
visibility, domain model, migration은 변경하지 않았다.

- 7개 browser/CT 후보는 `retain` 6, `strengthen` 1이다.
- 9개 CI/script 행은 `retain` 7, `strengthen` 1, `consolidate` 1이다.
- R02-R05, R08, R10의 browser 증거를 실제 Chromium과 로컬
  MySQL/Spring/Vite 경계에서 통과시켰다.
- 6개 CT 파일 / 7개 screenshot case는 세 번 연속 모두 첫 시도에
  통과했고 PNG baseline 변경은 없다.
- tracked shell 34개가 Bash syntax와 ShellCheck에 모두 도달하며,
  독립 validator가 앞선 실패에 가려지지 않도록 CI 조건을 보정했다.
- 최종 runtime 후보에서 Testcontainers integration 744 cases를
  연속 두 번 fresh 실행해 모두 통과했고 server PR gate와 public-release
  gate도 통과했다.
- worker, shard, retry, timeout, cache, Gradle fork, coverage 및 screenshot
  threshold는 변경하지 않았다.
- 환경 미검증 항목은 0개다. 외부 provider 및 live deployment는
  환경 실패가 아니라 명시한 검증 범위 밖의 residual risk다.

## 커밋 계보와 증거 경계

- Phase 4 시작: `cca15776`
- 환경 및 timezone/audit 안정화: `619976da`
- browser/visual/CI 결정 원장: `aed8e3be`, `d357f925`
- browser 강화: `67849ef3`
- CI reachability 보정: `f7108732`
- 최종 server integration fixture 격리: `33cbe73e`
- 최종 runtime 후보: `33cbe73e`

Task 7의 최초 browser, CT, design, script/config validator 실행은
`f7108732`에서 수행했다. 그 뒤 fresh full integration에서 드러난
admin audit fixture의 시간 및 actor 공유 문제를 독립 검토 후
`33cbe73e`에서 정확히 두 server integration test 파일만 고쳤다.
`f7108732..33cbe73e`에는 frontend, Playwright, CI workflow, validator,
production 및 deploy/public-release 입력 변경이 없다. 따라서 해당
입력이 byte-identical인 browser/visual/config 결과는 그 조상 증거로
명시해 승계하고, 영향받은 server integration, server PR gate,
public-release candidate와 scanner는 `33cbe73e`에서 다시 실행했다.

이 문서를 추가하는 커밋은 runtime을 바꾸지 않는 report-only
descendant다. 별도 브랜치의 CPE 복구 커밋 `86c002b5`는 이 계보의
조상이 아니고 Phase 4에 필요하지 않아 포함하지 않았다.

## 환경 준비와 도구

Phase 1의 환경 미검증 항목은 Phase 4 Task 1에서 모두 해소했다.

- Docker daemon은 이미 접근 가능했고, 기존 저장소 MySQL container를
  보존한 채 시작해 고정 container name 계약을 만족시켰다.
- MySQL CLI와 ShellCheck를 설치해 E2E helper 및 CI-equivalent shell
  검증을 실행 가능하게 했다.
- Testcontainers JDBC timezone을 UTC로 고정하고 최초 admin audit
  fixture의 exact-row assertion을 안정화했다.
- tracked 환경 설정, private 값, 실제 회원 데이터는 추가하지 않았다.

| 도구 | 검증 버전/상태 |
| --- | --- |
| Docker client / server | 29.4.0 / 29.2.1 |
| Docker Compose | 5.1.3 |
| MySQL CLI | 9.6.0 |
| MySQL test container | 8.4, healthy |
| ShellCheck | 0.11.0 |
| Java | 25.0.2 |
| Node | v24.18.0 |
| Corepack / pnpm | 0.35.0 / 11.13.1 |
| Playwright | 1.61.1, Chromium installed |

## 7개 browser/CT 후보 결정

결정 원본은
`docs/superpowers/reports/2026-07-24-test-suite-phase-4-browser-ci-decisions.tsv`
이다. 7개 후보는 모두 고유하며 삭제, 이동, 분할, 통합 대상은 없다.

| 후보 | Layer | 결정 | 보존 또는 강화한 실패 모드 |
| --- | --- | --- | --- |
| `front/features/current-session/ui/session-closing-board.ct.tsx` | CT | `retain` | blocked/published lifecycle와 긴 상태 중심 layout의 차이 |
| `front/features/platform-admin/ui/admin-support-workbench.ct.tsx` | CT | `retain` | masked identity, READY checklist, expiry/create/revoke의 480px 구성 |
| `front/features/public/ui/public-records-page.ct.tsx` | CT | `retain` | public archive hierarchy, 긴 한국어 wrapping, fallback cover와 metadata |
| `front/shared/ui/avatar-chip.ct.tsx` | CT | `retain` | 48px 원형, deterministic tone, 한국어 initial 정렬 |
| `front/shared/ui/book-cover.ct.tsx` | CT | `retain` | 120x160 fallback cover의 typography와 공간 계약 |
| `front/shared/ui/readmates-brand-mark.ct.tsx` | CT | `retain` | 30px brand tile과 inline SVG의 renderer-level identity |
| `front/tests/e2e/admin-shell.spec.ts` | E2E | `strengthen` | dialog를 열었을 때 구현된 initial-focus 계약을 직접 관찰 |

`admin-shell.spec.ts`는 기존 4 cases와 route mock 경계를 유지하면서
modal initial focus assertion만 추가했다. before 4/4는 12.15s, after
4/4는 11.92s였고 retry는 없었다. 두 값은 각각 한 번의 표본이므로
성능 개선을 주장하지 않는다.

## 9개 CI/script 행 결정

| CI/script 행 | 결정 | 최종 도달 가능성과 소유권 |
| --- | --- | --- |
| `jobs.scripts` shell/validator | `strengthen` | null-delimited tracked list로 `scripts`와 `deploy/oci` 아래 재귀적 `.sh` 34개를 Bash syntax와 ShellCheck에 동일하게 전달하고, production-AI 두 검증을 분리하며 각 독립 validator에 `always()` 조건 적용 |
| `jobs.public-release` | `retain` | candidate build와 exact candidate scanner를 독립 필수 gate로 유지 |
| `jobs.frontend` | `retain` | lint, coverage, build, fixture drift의 단일 unit/build lane |
| `jobs.frontend-visual-regression` | `retain` | 6개 CT 파일 전체를 Docker verify mode로 한 번 실행 |
| `jobs.design-system` | `retain` | design-system과 design-docs build/test aggregate를 한 번 실행 |
| `jobs.backend` | `retain` | `server-ci-check.sh`의 format/static/unit/architecture/JaCoCo lane 유지 |
| `jobs.backend-integration` | `retain` | Testcontainers integration/container tag의 단일 소유자 |
| `jobs.e2e` | `retain` | 정확히 `1/3`, `2/3`, `3/3`의 서로 겹치지 않는 shard topology 유지 |
| Grafana dashboard lint duplicate | `consolidate` | `jobs.scripts` 실행을 유지하고 `jobs.backend`의 동일한 두 번째 호출만 제거 |

Task 5의 benchmark helper 두 파일 변경은 ShellCheck `SC2129`를 위해
인접 write를 group한 것뿐이며 출력과 측정 동작을 바꾸지 않았다.
workflow의 checkout/tool setup, private-guidance 조건, artifact, command,
cache, retry, timeout, worker, shard, fork, threshold는 보존했다.

## R02-R05, R08, R10 browser 증거

모든 focused browser case는 실제 Chromium에서 첫 시도에 통과했고
retry는 없었다. 최종 full E2E도 같은 risk spec을 포함해 90/90으로
통과했다.

| Risk | Browser 결과 | 검증한 현재 제품 계약 |
| --- | --- | --- |
| R02 | Google invite flow 1/1, 강화 전 8.40s, 후 9.14s | relative invite return은 보존하고 external `returnTo`는 거부해 `/oauth2/authorization/google` fallback으로 수렴 |
| R03 | multi-club flow 4/4, 15.05s | public slug isolation, shared-session club 선택, role 보존 전환, target-club-only invite activation |
| R04 | public/member/host 2/2, 8.46s | visibility는 `PUBLIC`, `MEMBER`, `HOST_ONLY`; `ATTENDEE`는 `MEMBER` 안의 actor 차원이지 네 번째 visibility가 아님 |
| R05 | member lifecycle 1/1, 8.18s | 현재 lifecycle 허용/금지 경계와 browser state 전환 |
| R08 | AI cost cap 1/1, 6.78s; commit recovery 1/1, 9.15s | cost-cap 거부와 commit retry/recovery 상태 |
| R10 | frontend observability local proxy 1/1, 6.65s | local BFF proxy의 202 forwarding 경계 |

focused 전후 wallclock은 환경이 통제된 반복 benchmark가 아니라 한 번의
개발 증거다. 회귀 또는 개선률을 추론하지 않는다.

## CT 및 design 증거

Task 4의 CT verify 3회는 모두 6 files / 7 cases를 첫 시도에 통과했다.
wallclock은 6.04s, 4.79s, 5.35s로 min/median/max가
4.79s / 5.35s / 6.04s다. Task 6의 후속 3회도 4.86s, 4.66s, 4.67s,
즉 4.66s / 4.67s / 4.86s로 모두 통과했다.

- retry, flaky rerun, browser warning은 없었다.
- screenshot baseline update는 실행하지 않았다.
- 검토 대상 PNG hash와 tracked PNG는 변경되지 않았다.
- Docker renderer와 screenshot tolerance `0.02`를 유지했다.

`design:check` 후속 3회는 매번 design-system 7 files / 13 cases와
design-docs 1 file / 2 cases, 합계 8 files / 15 cases를 통과했다.
wallclock 6.66s, 4.72s, 4.69s의 min/median/max는
4.69s / 4.72s / 6.66s다.

Task 1의 첫 CT 10.01s는 환경 준비를 포함한 표본이고 전후 benchmark에
포함하지 않았다. warm local single-host 소수 표본이므로 통계적 성능
개선을 주장하지 않는다.

## CI reachability와 독립 validator

재귀적 tracked shell 목록은 정확히 34개다. 계획서의 top-level
equivalent 30개와 보강한 recursive list 34개를 모두 확인했다.

| 검증 | 결과 | wallclock |
| --- | --- | ---: |
| agent guidance check | PASS | 0.89s |
| top-level Bash syntax, 30 files | PASS | 0.15s |
| top-level ShellCheck, 30 files | PASS | 0.97s |
| recursive Bash syntax, 34 files | PASS | 0.17s |
| recursive ShellCheck, 34 files | PASS | 1.25s |
| AI PII, 15 invariants + fixtures | PASS | 2.98s |
| Prometheus rules, 7 files / 23 rules | PASS | 0.46s |
| Prometheus config + 7 rule files | PASS | 0.53s |
| Tempo config | PASS | 0.50s |
| production AI config | PASS | 0.05s |
| production AI fixture mutation | PASS | 0.10s |
| Grafana dashboards, 4 files | PASS | 0.10s |

각 validator는 CI에서 독립 step으로 남아 있고 `always()`에 의해 앞선
validator 실패가 뒤의 관찰을 가리지 않는다. Grafana는 scripts job의
단일 소유권만 유지한다. E2E matrix는 세 shard가 정확히 전체를 한 번
분할하고 unsharded duplicate 또는 네 번째 shard가 없다.

## Task 7 runtime gate와 수정 이력

`f7108732`의 full E2E는 one worker, retry 없이 90/90, 81.93s로
통과했다. CT는 6 files / 7 cases, 5.13s, design은 8 files / 15 cases,
5.13s로 통과했다.

최초 exact `./server/gradlew -p server integrationTest`는 5.82s에
`UP-TO-DATE`였으므로 실제 실행 증거로 세지 않았다. 이어
`--rerun-tasks --no-build-cache`로 강제한 744-case lane은
`PlatformAdminAuditControllerTest` 두 cases가 실패했다. 응답은 HTTP
200이었지만 `visibleCount=0`, `items=[]`였고, 정렬 오류가 아니라
owned fixture row가 exclusive upper-bound에 포함되지 않은 문제였다.

focused audit는 3 cases 중 owner case가 재현됐고, audit와 notification
class를 process-local concurrent parallelism 2로 묶은 세 표본은
fail/fail/pass였다. 원인은 host JVM의 `Instant.now()`와 MySQL container
clock 사이의 작은 차이가 `created_at <= to` 경계와 경쟁한 것이었다.
동시에 notification fixture가 actor 전체를 cleanup하던 latent
격리 위험도 확인했다.

검토 승인된 `33cbe73e`는 두 integration test 파일만 다음처럼 고쳤다.

- audit fixture의 `created_at`을 DB clock 기준 1분 전으로 만들어
  exclusive upper-bound와 경쟁하지 않게 했다.
- notification preview ID를 추적하고 cleanup 및 assertion을 같은
  `previewId`에만 한정해 actor 공유 fixture를 제거했다.

수정 뒤 fresh evidence는 다음과 같다.

| Gate | 결과 | wallclock |
| --- | --- | ---: |
| audit focused run 1/2/3 | 각 3/3 PASS | 19.66s / 16.63s / 17.11s |
| concurrent audit+notification run 1/2/3 | 각 5/5 PASS | 16.50s / 16.49s / 16.96s |
| full integration fresh run 1 | 744/744, failure/error/skip 0 | 124.65s |
| full integration fresh run 2 | 744/744, failure/error/skip 0 | 122.73s |
| `./scripts/server-ci-check.sh` | PASS, unit 962(1 skip), architecture 25, failure/error 0 | 30.92s |

focused audit의 min/median/max는 16.63s / 17.11s / 19.66s,
concurrent pair는 16.49s / 16.50s / 16.96s다. 두 full integration
표본도 안정성 증거이지 성능 benchmark가 아니다.

server gate는 daemon과 build cache를 비활성화한 상태에서 16 tasks를
실행했다. JaCoCo line coverage는 11,347 / 25,234 = 44.97%로 변경하지
않은 minimum `0.23`을 만족했다.

## public-release와 public-repo safety

최종 runtime 후보 내용으로 public candidate를 다시 만들고 exact
candidate를 검사했다.

| Gate | 결과 | wallclock |
| --- | --- | ---: |
| `./scripts/build-public-release-candidate.sh` | PASS | 8.57s |
| `./scripts/public-release-check.sh .tmp/public-release-candidate` | PASS | 8.87s |

production AI config가 통과했고 gitleaks는 약 10.50MB를 검사해 leak을
찾지 않았다. 실제 member data, secret, deployment state, private
domain, local absolute path, token-shaped fixture는 tracked 변경과 이
보고서에 추가하지 않았다.

## 변경하지 않은 계약

`cca15776..33cbe73e`는 테스트, test evidence, CI reachability만
변경한다.

- production product behavior, route, API schema, auth, authorization,
  club context, visibility enum, domain model, migration 변경 없음
- local Playwright worker `1`, CI E2E shard `3` 유지
- Playwright/Vitest retry, timeout, cache와 선택 규칙 변경 없음
- Gradle heap, fork, retry, timeout, tag 분리 변경 없음
- frontend coverage threshold와 server JaCoCo minimum `0.23` 유지
- CT Docker image, verify mode, retry `0`, screenshot tolerance `0.02`
  유지
- screenshot PNG baseline 변경 없음
- pre-push script와 public-release 실행 조건 변경 없음
- performance-only production 변경 없음

Phase 4 실행은 `subagent-driven-development`만 사용했고 별도
plan runner/executor workflow를 호출하지 않았다.

## acceptance, 잔여 위험, Phase 5 handoff

선택한 acceptance 범위는 OAuth return, club context, actor/visibility,
lifecycle, AI cost/recovery, browser runtime state, visual rendering,
observability proxy, CI reachability, public-release safety다. persistence
schema나 production behavior는 변경하지 않았으므로 새 migration 또는
live deploy acceptance는 만들지 않았다.

`UNVERIFIED_ENV` count: **0**.

남은 것은 환경 prerequisite 실패가 아니라 다음 외부 범위와 기존
운영 residual이다.

- live Google OAuth provider, 외부 AI provider, mail network,
  production deployment와 live GitHub Actions run은 호출하지 않았다.
- workflow topology와 validator reachability는 local actionlint 및
  직접 실행으로 확인했지만 branch를 push해 GitHub-hosted CI를
  실행하지는 않았다.
- Phase 2의 Redis invalidation은 계속 best-effort라 실패 시 TTL 또는
  다음 invalidation까지 stale cache가 남을 수 있다.
- Java native access/dynamic agent/deprecated Unsafe, MySQL 8.4가 현재
  Flyway 검증 상한 8.1보다 새 버전이라는 경고, MySQL `VALUES`
  deprecation, Kotlin/Jackson/Spring deprecation, Testcontainers reuse
  미활성화 경고가 남아 있다. 이번 gate의 성공 여부에는 영향을 주지
  않았다.
- CT/design 및 focused E2E 시간은 warm local single-host의 작은
  표본이다. cold host나 GitHub runner 성능에 대한 통계적 추론은 하지
  않는다.

Phase 5는 report-only descendant에서 시작해 전체 510개 inventory
reconciliation, R01-R10 mutation, final fresh gates와 residual
reconciliation을 수행할 수 있다. Phase 4에서 넘기는 환경 미검증
항목은 없다.
