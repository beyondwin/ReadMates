# ReadMates 테스트 스위트 실효성 감사·최적화 최종 보고서

## 결론

승인된 Phase 2–5 프로그램은 510개 Phase 1 기준 경로를 모두 최종
runner topology에 대조하고, 승인된 후보만 강화·이동·통합했으며,
R01–R10 위험을 mutation 또는 안전한 대체 증거로 검증했다. 로컬에서
준비 가능한 공식 gate는 같은 runtime 후보에서 모두 통과했다.

- 최종 runner topology는 9개 lane, 521개 파일이다. Phase 1의 510개보다
  11개 늘었고, baseline 510개 경로는 각각 정확히 한 최종 결정에
  연결된다.
- 최종 결정 525행은 `retain` 489, `strengthen` 17, `move-layer` 2,
  `consolidate` 1, `split` 1, `added` 15, `delete` 0이다.
- R01–R05와 R07–R10의 production mutation은 의도한 detector 실패를
  만들었고, reverse apply 뒤 같은 detector가 모두 통과했다. R06은
  파괴적이거나 모호한 DB 상태를 만들 수 있어 production mutation을
  하지 않고 test-only failure seam과 V41→latest fixture로 검증했다.
- frontend coverage는 모든 기존 threshold를 넘었고, server JaCoCo도
  변경하지 않은 minimum `0.23`을 넘었다.
- Blocker와 High release finding은 0이다. CI reachability를
  `CHANGELOG.md`에 기록하지 않았던 Medium 1건은 해결했다.
- locally preparable lane의 `FAIL`은 0, `UNVERIFIED_ENV`는 0이다.
- 제품 코드, public API, 운영 migration, 배포 입력, architecture
  baseline/exception은 바뀌지 않았다.

이 결과는 ready-for-integration 증거다. 실제 integration, merge, push,
PR, tag, publish, deploy는 수행하지 않았으므로
`integration=not_observed`다.

## HEAD와 증거 경계

| 역할 | HEAD | 의미 |
| --- | --- | --- |
| Phase 1 수집 기준 | `7cb38818124742d340dc26e8bfa8c1d43ebca848` | 510개 파일·case·환경 기준선 |
| Phase 2–5 구현 시작 | `0cd590a9cd480b0c8e26c6c287993e3a08768bf9` | `origin/main`과 같은 isolated branch 시작점 |
| Phase 5 시작 | `a70a8dd47596d65fb46e0c940f8c730491a06618` | Phase 2–4 최종 보고서가 존재하는 report-only descendant |
| 최종 runtime 후보 | `753e6ce02e89938bdf07e1ad3dfceb6cf0c2c212` | mutation 복원 뒤 Task 3 반복과 Task 4 전체 gate를 실행한 exact HEAD |
| release-review 문서 HEAD | `c5b77d6b70280f974d530033e06ebaa165f471a3` | runtime 후보 뒤 `CHANGELOG.md`와 release review만 추가한 docs-only descendant |
| 최종 보고서 HEAD | 이 문서를 포함하는 `docs: close test suite effectiveness optimization` commit | runtime과 test를 바꾸지 않는 report-only descendant이며 exact SHA는 commit metadata와 handoff에 기록 |

`753e6ce0..c5b77d6b`는 문서 두 개만 바꾼다. 이 최종 보고서도 문서
한 개만 추가한다. 따라서 runtime·coverage·browser·integration 증거는
`753e6ce0`에 귀속하고, release finding과 최종 artifact 검증은 그 뒤의
docs-only 계보에 귀속한다. 서로 다른 HEAD의 결과를 same-HEAD
runtime 증거로 합치지 않았다.

별도 작업의 `86c002b5`는 이 계보의 조상이 아니며 이 프로그램에
필요하지도 포함되지도 않았다.

## 9개 lane의 before/after topology

Vitest case 수는 Phase 1과 같은 runner-native static collection,
Playwright case 수는 list 결과, server case 수는 해당 lane의 JUnit
증거를 사용했다. 최종 Vitest list는 `c5b77d6b`에서 다시 수집했지만
`753e6ce0` 이후 test/runtime 변경이 없으므로 runtime topology와 같다.

| Lane | Phase 1 파일 | 최종 파일 | 파일 변화 | Phase 1 case | 최종 case | case 변화 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `front-vitest-node` | 69 | 70 | +1 | 403 | 412 | +9 |
| `front-vitest-jsdom` | 114 | 118 | +4 | 948 | 990 | +42 |
| `front-playwright-e2e` | 40 | 42 | +2 | 82 | 90 | +8 |
| `front-playwright-ct` | 6 | 6 | 0 | 7 | 7 | 0 |
| `design-system-vitest` | 7 | 7 | 0 | 13 | 13 | 0 |
| `design-docs-vitest` | 1 | 1 | 0 | 2 | 2 | 0 |
| `server-unit` | 173 | 178 | +5 | 943 | 962 | +19 |
| `server-integration` | 98 | 97 | -1 | 692 | 744 | +52 |
| `server-architecture` | 2 | 2 | 0 | 25 | 25 | 0 |
| **합계** | **510** | **521** | **+11** | **3,115** | **3,245** | **+130** |

최종 frontend full execution은 188 files / 1,488 cases로 통과했다.
이 실행 수는 dynamic/parameterized case를 포함하므로 위의
node+jsdom static census 1,402와 정의가 다르다. 두 값을 섞어 증감률을
계산하지 않았다. Server 최종 actual execution은 unit 962(기존 skip 1),
architecture 25, integration 744다.

## 최종 disposition과 exact path

### 집계

| Decision | 행 |
| --- | ---: |
| `retain` | 489 |
| `strengthen` | 17 |
| `move-layer` | 2 |
| `consolidate` | 1 |
| `split` | 1 |
| `added` | 15 |
| `delete` | 0 |
| **합계** | **525** |

Owner는 `phase-1` 421, `phase-2` 64, `phase-3` 33, `phase-4` 7행이다.
510개 baseline 경로와 15개 explicit addition을 합친 수다. 독립
`delete`는 없다.

### `strengthen` 17개

- `front/features/current-session/queries/current-session-queries.test.tsx`
- `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`
- `front/features/host/aigen/queries/aigen-job-queries.test.tsx`
- `front/features/host/queries/host-session-queries.hooks.test.tsx`
- `front/features/host/queries/host-session-record-queries.test.tsx`
- `front/tests/e2e/admin-shell.spec.ts`
- `front/tests/unit/cloudflare-bff.test.ts`
- `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapterTest.kt`
- `server/src/test/kotlin/com/readmates/aigen/api/AiGenerateApiIntegrationTest.kt`
- `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- `server/src/test/kotlin/com/readmates/auth/api/AuthenticatedMemberSecurityTest.kt`
- `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`
- `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
- `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
- `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt`
- `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt`
- `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

### `move-layer` 2개

| Baseline path | Final path | 보존한 계약 |
| --- | --- | --- |
| `server/src/test/kotlin/com/readmates/auth/api/DevInvitationControllerTest.kt` | `server/src/test/kotlin/com/readmates/auth/adapter/in/web/DevInvitationControllerTest.kt` | 제거된 dev invitation endpoint의 HTTP 410 / `GONE` projection |
| `server/src/test/kotlin/com/readmates/note/api/ReviewControllerTest.kt` | `server/src/test/kotlin/com/readmates/note/adapter/in/web/ReviewControllerTest.kt` | blank request의 HTTP 400, use case 미호출, current-member wiring |

두 destination은 explicit `added` 행에도 나타난다. 이동 전후 경로를
모두 설명하기 위한 ledger interface의 정상적인 표현이며 중복
runner path가 아니다.

### `consolidate` 1개

- Baseline:
  `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerTest.kt`
- Survivor:
  `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerTest.kt`
- 보존한 실패 모드:
  `CurrentMemberArgumentResolver`의 unresolved-member HTTP 401

실제 current-session DB projection을 검증하는
`CurrentSessionControllerDbTest`는 integration lane에 남아 있다.

### `split` 1개

- Baseline:
  `front/features/host/ui/session-editor/host-action-confirmation-dialog.test.tsx`
- Final:
  `front/features/host/route/host-session-editor-route.test.tsx`
- 근거:
  Phase 1 snapshot 이후, Phase 2 시작 전의 product replacement다.
  record-apply와 새 E2E composer가 preview/confirm, no-silent-send,
  cancel, focus 실패 모드를 나눠 보존한다. Phase 5의 새 cleanup
  결정이 아니다.

### `added` 15개

- `front/features/host/model/host-notification-composer-model.test.ts`
- `front/features/host/route/host-dashboard-route.test.tsx`
- `front/features/host/route/host-notification-composer-controller.test.tsx`
- `front/features/host/ui/notifications/host-notification-composer-dialog.test.tsx`
- `front/features/host/ui/notifications/host-notification-composer.test.tsx`
- `front/features/host/ui/notifications/host-notification-policy-card.test.tsx`
- `front/tests/e2e/host-feedback-notification-composer.spec.ts`
- `front/tests/e2e/host-next-book-notification-composer.spec.ts`
- `server/src/test/kotlin/com/readmates/auth/adapter/in/web/DevInvitationControllerTest.kt`
- `server/src/test/kotlin/com/readmates/note/adapter/in/web/ReviewControllerTest.kt`
- `server/src/test/kotlin/com/readmates/note/adapter/in/web/ReviewWebDtosTest.kt`
- `server/src/test/kotlin/com/readmates/notification/adapter/in/scheduler/NotificationReminderSchedulerTest.kt`
- `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationPolicyAdapterTest.kt`
- `server/src/test/kotlin/com/readmates/notification/api/HostNotificationPolicyControllerTest.kt`
- `server/src/test/kotlin/com/readmates/notification/application/service/HostNotificationPolicyServiceTest.kt`

12개는 Phase 1 snapshot 뒤 Phase 2 시작 전에 들어온 product test고,
3개는 Phase 2의 승인된 layer 이동·복구 destination이다. Phase 3과
Phase 4는 새 test file을 추가하지 않고 기존 path를 강화했다.

### 실제 branch test/evidence 변경 표면

Disposition은 cleanup 의사결정이고, branch diff에는 그 결정의
supporting test와 fixture 안정화도 있다. `origin/main..753e6ce0`의
tracked runtime-related 변경은 test source, public-safe test fixture,
CI와 benchmark helper뿐이다. Production Kotlin, non-test frontend/BFF,
운영 migration, deploy 변경은 0이다.

Supporting 변경에는 OAuth return-state matrix,
`cloudflare-oauth-proxy.test.ts`, frontend observability buffer detector,
AI recovery/service evidence, notification processing/Kafka evidence,
Redis cache service evidence, admin audit/notification fixture isolation,
test-only MySQL timezone, V41 upgrade fixture가 포함된다. 이 path들은
새 cleanup 후보가 아니라 승인된 risk detector 또는 test isolation
보강이다.

## runner와 CI reachability

- Server의 DB가 필요 없는 dev invitation/review controller 계약은
  integration에서 unit으로 이동했고, 중복 401은 unit survivor로
  통합됐다. Server source 파일은 Phase 2 before 277에서 276으로
  줄었지만 cases는 1,708에서 1,724로 늘었다.
- Frontend node/jsdom runner selection, Vitest project, coverage command는
  유지됐다. Query cache는 spy call shape 대신 실제 `QueryClient`
  value/invalidation/removal을 관찰하고 AI polling은 fake timer로
  deterministic하게 바뀌었다.
- `.github/workflows/ci.yml`의 scripts job은 top-level 30개뿐 아니라
  `scripts/**/*.sh`, `deploy/oci/**/*.sh`의 tracked shell 34개를
  NUL-safe하게 Bash와 ShellCheck 양쪽에 전달한다.
- 독립 config validator는 `always()` 조건으로 앞선 validator 실패에
  가려지지 않는다.
- production AI config와 fixture 검증은 독립 step이고, Grafana lint는
  scripts job 하나만 소유하도록 중복 호출을 통합했다.
- E2E CI는 `1/3`, `2/3`, `3/3` 세 shard가 전체를 한 번 나누는 topology를
  유지한다. local worker 1, retry 0도 유지한다.
- `scripts/bench/measure-local.sh`와
  `scripts/bench/sweep-forks.sh`는 ShellCheck `SC2129`를 해소하려고
  adjacent writes만 group했다. command, run count, output과
  min/median/max 계산은 바뀌지 않았다.

## R01–R10 mutation 결과

모든 injected mutation은 정확히 하나씩 순차 적용했다. 실패 로그
digest를 기록한 뒤 patch를 reverse apply하고 pre-mutation blob hash와
clean tracked tree를 확인했다.

| Risk | Mutation 또는 안전 결정 | Mutated result | Restored/alternative result |
| --- | --- | --- | --- |
| R01 | BFF internal response header stripping 제거 | intended FAIL, 6 failed / 48 passed | 54/54 PASS |
| R02 | OAuth return-state signature mismatch guard 우회 | intended FAIL, 1/7 failed | 7/7 PASS |
| R03 | supplied slug를 host resolver로 해석 | intended FAIL, 4 failed / 69 passed | 73/73 PASS |
| R04 | public SQL predicate에 `MEMBER` 허용 | intended FAIL, 2/12 failed | 12/12 PASS |
| R05 | no-op publish side-effect guard 강제 | intended FAIL, 3 failed / 22 passed | 25/25 PASS |
| R06 | production DB mutation 미실행 | 안전상 `not-injected` | rollback unit 13/13, transaction/Flyway integration 16/16 PASS |
| R07 | notes eviction을 건너뛰고 성공 보고 | intended FAIL, 5/6 failed | 6/6 PASS |
| R08 | reconcile마다 provider call slot release 강제 | intended FAIL, 3 failed / 26 passed | 29/29 PASS |
| R09 | outbox publishing lease를 15분에서 0분으로 변경 | intended FAIL, 2/18 failed | 18/18 PASS |
| R10 | record-time observability sanitization 우회 | intended FAIL, 1/7 failed | 7/7 PASS |

R06은 production database code나 operational migration을 바꾸면
파괴적·모호한 상태를 만들 수 있어 mutation하지 않았다. 대신 Phase 2가
추가한 post-replacement test-only failure seam이 transaction rollback을,
public-safe populated V41 fixture가 latest migration까지의 row/FK/index/
constraint 보존을 검증했다.

R10의 첫 mutation은 flush-time sanitizer가 record-time bypass를
가려 detector가 7/7로 통과했다. 이는 flake가 아니라 관찰 공백이었다.
`c4a4bf88`에서 public `pendingCount()`를 이용한 test-only assertion을
추가한 뒤 같은 mutation이 의도대로 실패했고 복원 뒤 통과했다.

현재 제품 visibility 계약은 `PUBLIC`, `MEMBER`, `HOST_ONLY` 세 값이다.
`ATTENDEE`는 `MEMBER` 안의 actor 차원이며 네 번째 visibility가 아니다.
R03/R04와 browser matrix는 이 계약으로 non-attendee, attendee, host,
cross-club actor를 구분한다. Enum, API, migration은 바꾸지 않았다.

## coverage before/after

### Frontend V8

| Metric | Phase 1 | 최종 runtime 후보 | Threshold |
| --- | ---: | ---: | ---: |
| Lines | 82.57% | 83.20% | 80% |
| Statements | 81.77% | 82.50% | 79% |
| Functions | 82.06% | 83.15% | 80% |
| Branches | 77.69% | 78.09% | 75% |

최종 coverage command는 188 files / 1,488 tests, failure/skip 0으로
통과했다. Threshold와 coverage target/config는 바꾸지 않았다.

### Server JaCoCo

| Metric | Phase 1 | 최종 runtime 후보 |
| --- | ---: | ---: |
| Covered lines | 11,272 | 11,347 |
| Missed lines | 13,676 | 13,887 |
| Total lines | 24,948 | 25,234 |
| Line coverage | 45.18% | 44.97% |
| Minimum | 0.23 | 0.23 |

전체 product denominator가 Phase 1 뒤 286 lines 늘어 percentage는
0.21%p 낮아졌지만 covered lines는 75 늘었고 unchanged verification은
통과했다. Test-only 최적화를 coverage percentage 개선으로 포장하지
않는다.

## wallclock, 3회 표본, cache caveat

### Phase 5 exact 3-cycle

| Lane | 3회 `real` | Min | Median | Max | 해석 |
| --- | --- | ---: | ---: | ---: | --- |
| frontend Vitest | 10.45 / 10.20 / 10.54s | 10.20s | 10.45s | 10.54s | 188 files / 1,488 cases, 세 번 actual execution |
| server exact command | 2.88 / 0.40 / 0.45s | 0.40s | 0.45s | 2.88s | cache/up-to-date state-only, actual runtime benchmark 아님 |
| CT Docker | 5.58 / 4.76 / 4.84s | 4.76s | 4.84s | 5.58s | warm image/volumes, 매회 ephemeral container |
| design check | 4.91 / 4.86 / 4.85s | 4.85s | 4.86s | 4.91s | 8 files / 15 cases, actual execution |

Server exact 3회는 run 1의 `unitTest FROM-CACHE`,
`architectureTest UP-TO-DATE`, run 2–3의 전체 actionable task
`UP-TO-DATE` 때문에 성능 표본으로 세지 않았다. 같은 runtime 후보에서
process-local `cleanUnitTest cleanArchitectureTest check
--no-build-cache --no-daemon`을 한 번 더 실행해 unit 962(기존 skip 1),
architecture 25를 실제 실행했고 16.10s에 통과했다. Repository cache
설정은 바뀌지 않았다.

### Before/after 맥락

| Lane | Earlier evidence | 최종 evidence | 비교 한계 |
| --- | --- | --- | --- |
| frontend coverage | Phase 1 43.48s, 183 files / 1,425 cases | 13.75s, 188 files / 1,488 cases | single-host one-sample이며 Phase 5의 non-coverage 3회와 command shape가 다름 |
| server CI actual | Phase 1 9.11s; Phase 2 start 13.55s | supplemental actual 16.10s | clean/cache/daemon 조건이 달라 개선·회귀 주장 안 함 |
| server integration | Phase 2 start 97.76s / 734 cases | Phase 5 105.79s / 744 cases | +10 cases와 V41 fixture를 포함한 one-sample |
| full E2E | Phase 1 `UNVERIFIED_ENV` | Phase 5 80.80s / 90 cases | 직접 before runtime 없음 |
| CT Docker | Phase 1 `UNVERIFIED_ENV`; Phase 4 latest median 4.67s | Phase 5 median 4.84s | +0.17s, warm local range 안이며 cold-host 추론 불가 |
| design check | Phase 1 8.28s; Phase 4 median 4.72s | Phase 5 median 4.86s | warm local 소수 표본, 통계적 개선 주장 안 함 |

Phase 4 focused E2E의 정확한 before/after 3회도 모두 첫 시도에
통과했다.

- Google invite: before 10.04 / 10.15 / 15.40s,
  after 13.08 / 13.16 / 14.81s.
- Admin shell: before 14.71 / 15.64 / 15.68s,
  after 14.70 / 16.75 / 21.29s.

Startup을 포함한 warm single-host 3회 표본이고 admin after에 21.29s
outlier가 있어 통계적 성능 회귀나 개선을 주장하지 않는다.

## flake와 retry

- Phase 5의 12개 primary timing invocation, supplemental actual server,
  22개 official gate와 두 recursive shell parity check는 모두 첫
  command attempt에 성공했다. 실패 때문에 반복한 final command는 없다.
- Frontend, design, E2E, CT, final integration에는 retry/flaky rerun,
  unexpected skip, screenshot update가 없었다.
- Final server unit의 skip 1은 기존 suite 결과이며 새 skip이나 retry가
  아니다.
- Phase 2 Task 3 중 새 Ryuk container가 test body 전에 localhost
  연결에 한 번 실패했다. Docker/test policy를 바꾸지 않고 동일
  command를 한 번 다시 실행해 통과했고, Phase 2 최종 3회에는
  재발하지 않았다.
- Phase 4는 audit fixture의 JVM/MySQL clock 경쟁과 notification
  actor-wide cleanup을 실제 fail/fail/pass로 재현했다. DB clock 기준
  1분 전 timestamp와 exact `previewId` cleanup으로 고친 뒤 focused,
  concurrent, full integration 반복이 안정적으로 통과했다.
- R10 최초 detector pass는 위에서 설명한 observation gap이고
  nondeterministic flake가 아니다.

## 환경 준비와 수리

Phase 1의 local prerequisite gap은 추후 phase에서 다음처럼 해소됐다.

- Docker daemon 접근을 준비해 Testcontainers와 CT를 실행했다.
- MySQL CLI `9.6.0`을 준비해 E2E helper를 실행했다.
- ShellCheck `0.11.0`을 준비해 local CI-equivalent 검증을 실행했다.
- Node `v24.18.0`, Corepack `0.35.0`, pnpm `11.13.1`, Java `25.0.2`,
  Gradle `9.6.1`, Playwright `1.61.1`을 repo contract와 맞췄다.
- Testcontainers JDBC timezone을 test-only UTC로 고정했다.
- Admin audit fixture는 DB clock 기준 timestamp를 사용하고,
  notification fixture는 exact preview ID로 cleanup하도록 격리했다.

실제 회원 데이터, secret, private domain, deployment identifier를
추가하지 않았다. 기존 server/MySQL container를 파괴하거나 다른
작업의 service를 중단하지 않았다. Worker, retry, timeout을 늘려
환경 문제를 숨기지 않았다.

## 최종 공식 command table

아래 runtime gate는 모두 `753e6ce0`에서 실행됐다.

| Command / gate | Status | 결과 |
| --- | --- | --- |
| `pnpm --dir front lint` | PASS | ESLint 0, 8.25s |
| `pnpm --dir front test:coverage` | PASS | 188 files / 1,488 tests, 13.75s |
| `pnpm --dir front build` | PASS | Vite 535 modules, 0.90s |
| `pnpm --dir front zod:export-fixtures` | PASS | 0.78s |
| Zod fixture `git diff --exit-code` | PASS | drift 0 |
| `pnpm design:check` | PASS | 8 files / 15 tests, 4.94s |
| `./scripts/server-ci-check.sh` | PASS | exact gate/cache-state, 0.44s |
| `./server/gradlew -p server integrationTest` | PASS | actual 744/744, 105.79s |
| `pnpm --dir front test:e2e` | PASS | Chromium 90/90, 80.80s |
| `pnpm --dir front test:ct:docker` | PASS | Chromium 7/7, 5.55s |
| `python3 scripts/check-agent-guidance.py` | PASS | 0.97s |
| top-level 30 shell `bash -n` | PASS | 0.14s |
| top-level 30 shell ShellCheck | PASS | 0.97s |
| CI-exact recursive 34 shell `bash -n` | PASS | 0.16s |
| CI-exact recursive 34 shell ShellCheck | PASS | 1.01s |
| `bash scripts/aigen-pii-check.sh` | PASS | 15 invariants + fixtures, 2.23s |
| `./scripts/validate-prometheus-rules.sh` | PASS | 7 files / 23 rules |
| `./scripts/validate-prometheus-config.sh` | PASS | config + 7 rule files |
| `bash scripts/validate-tempo-config.sh` | PASS | 0.34s |
| `bash scripts/validate-production-ai-config.sh` | PASS | 0.04s |
| `bash scripts/verify-production-ai-config-fixtures.sh` | PASS | 0.07s |
| `./scripts/lint-grafana-dashboards.sh` | PASS | 4 dashboards |
| `./scripts/build-public-release-candidate.sh` | PASS | 7.23s |
| `./scripts/public-release-check.sh .tmp/public-release-candidate` | PASS | 10.51 MB, gitleaks finding 0, 7.53s |
| **Final official/parity FAIL** | **0** | locally preparable command failure 없음 |
| **Final official/parity UNVERIFIED_ENV** | **0** | local prerequisite gap 없음 |

Task 5의 `CHANGELOG.md`와 release review 변경 뒤 public candidate build와
exact-candidate scanner를 다시 실행했고 모두 통과했다.

Mutation detector의 non-zero는 위 표의 final `FAIL`이 아니라 의도한
temporary defect detection이다. Mutation 복원 뒤 detector green을
각각 확인했다.

## release-readiness finding

### Blocker

0.

### High

0.

### Medium

1건을 해결했다. `.github/workflows/ci.yml`의 recursive tracked-shell
reachability, independent validator steps, single Grafana owner는
developer/operator가 관찰하는 CI 계약인데 `CHANGELOG.md` Unreleased에
없었다. `c5b77d6b`에서 public-safe `Changed` 항목을 추가했다.

### Low residual

1. Live GitHub-hosted CI, OAuth/AI provider, mail network, production
   deployment는 호출하지 않았다.
2. 기존 Redis invalidation은 best-effort이므로 실패하면 TTL 또는 다음
   성공한 invalidation까지 stale cache가 남을 수 있다.
3. Java native access/dynamic agent/Unsafe, Flyway의 MySQL 8.4 검증 상한,
   MySQL `VALUES`, Kotlin/Jackson/Spring deprecation과 Testcontainers
   reuse 경고가 남아 있다.

### Not an issue

- Product/API/migration/deploy 계약 변경 없음.
- Security production mutation은 모두 복원됨.
- Architecture baseline/exception 변경 없음.
- Public-release workflow는 build한 exact candidate를 scan함.
- Benchmark helper는 output grouping만 바뀜.

## 잔여 위험 전체 분류

### Technical

- Redis best-effort invalidation 뒤 stale window는 제품 계약상 남는다.
- 현재 toolchain compatibility/deprecation warning은 다음 dependency
  refresh에서 재검토해야 한다.
- Local timing은 warm single-host의 작은 표본이다. Cold GitHub runner나
  production 성능을 통계적으로 대표하지 않는다.

### Environment

- Locally preparable prerequisite와 lane은 모두 검증됐고
  `UNVERIFIED_ENV=0`이다.
- GitHub-hosted runner, live provider network와 production environment는
  이 local plan이 만들 수 있는 환경이 아니며 scope 밖이다.

### Operational

- Separate integration decision 뒤 실제 PR CI와 release runbook을
  확인해야 한다.
- Release 후 Redis fallback/error metrics와 provider/mail/deploy smoke를
  관찰해야 한다.
- 이 브랜치는 배포나 post-deploy canary를 수행하지 않았다.

### Billing

- 외부 AI provider를 호출하지 않아 실제 vendor billing/paid-tier
  상태는 관찰하지 않았다.
- Redis reservation, call cap, unknown-cost retention과 recovery는
  deterministic provider와 real Redis/Kafka 경계에서 검증했지만 live
  invoice reconciliation은 scope 밖이다.

### PII

- AI PII validator 15개 invariant, observability sanitization mutation,
  public candidate gitleaks와 문서 token/path scan은 통과했다.
- 실제 member/transcript/provider payload는 사용하지 않았으므로
  production 데이터 취급은 승인된 runbook과 monitoring이 계속
  필요하다.

### Security

- BFF secret/header, OAuth signature/return target, club isolation,
  visibility leakage detector는 mutation으로 확인됐다.
- 실제 OAuth provider credential, production secret rotation, live
  ingress는 호출하지 않았다.

### Lifecycle

- Duplicate/no-op session lifecycle, rollback, Flyway upgrade,
  reservation recovery, outbox lease/reclaim은 검증됐다.
- 실제 mail network와 production outbox backlog/replay는 관찰하지
  않았다.

### Public release

- Candidate build와 exact scanner는 두 번 통과했고 secret finding은
  없다.
- Tag, GitHub Release, package publish와 deploy를 하지 않았으므로
  published artifact identity와 downstream install은 관찰하지 않았다.

## 변경하지 않은 계약과 성능 불변식

- Frontend threshold `80/79/80/75` 유지.
- Server JaCoCo minimum `0.23` 유지.
- Playwright local worker `1`, CI E2E shard `3` 유지.
- Playwright/Vitest/Gradle retry와 timeout 변경 없음.
- Gradle heap, `maxParallelForks`, `forkEvery`, tag/lane selection 변경
  없음.
- Repository cache, build cache, configuration cache 설정 변경 없음.
  `--no-build-cache`와 clean task는 실제 실행을 위한 process-local
  evidence command에만 사용.
- CT Docker image `mcr.microsoft.com/playwright:v1.61.1-jammy`,
  verify mode, retry `0`, screenshot tolerance `0.02` 유지.
- Screenshot PNG baseline 변경 없음.
- Public-release manifest, publish/deploy target, pre-push 조건 변경 없음.
- Production performance setting과 product behavior 변경 없음.

측정값이 짧아졌다는 이유로 setting을 바꾸거나 성능 개선을 주장하지
않는다. 반대로 case 증가와 fixture 비용이 포함된 단일 표본을 제품
성능 회귀로 주장하지도 않는다.

## Artifact 무결성과 handoff

최종 decision ledger는 9-field header, 525 data rows, malformed row 0이며
baseline 510개와 addition 15개를 포함한다. Mutation ledger는 8-field
header, 10 data rows, malformed row 0이고 R01–R10이 각각 정확히 한 번
나온다. 기록된 mutation log digest는 ignored raw log와 모두 일치한다.

Report 작성 전 추적 artifact digest:

- final decisions:
  `f4ee3238f8fe223249a4dceb64128d7df2a7c67369f15f9e65266d9898628e25`
- mutation evidence:
  `fe1822b765a6ced53e86a83f63cc9a30e7df81070c8113a73d5ab67bbfd15a30`
- release readiness:
  `60f87b0cb5b3ecd5d6b0acf8602e4e0f3ba6d68968652418b4609c42e632ef5e`

최종 handoff 조건:

- isolated branch:
  `codex/readmates-test-suite-effectiveness-20260724`
- merge base / `origin/main`:
  `0cd590a9cd480b0c8e26c6c287993e3a08768bf9`
- runtime candidate:
  `753e6ce02e89938bdf07e1ad3dfceb6cf0c2c212`
- production mutation:
  없음
- integration:
  `not_observed`
- merge:
  수행 안 함
- push:
  수행 안 함
- PR:
  생성 안 함
- tag:
  생성 안 함
- publish:
  수행 안 함
- deploy:
  수행 안 함

별도의 same-HEAD review와 integration decision이 다음 단계다. 이
프로그램은 그 결정을 대신하지 않는다.
