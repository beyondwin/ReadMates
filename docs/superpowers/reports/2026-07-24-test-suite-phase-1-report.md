# ReadMates 테스트 스위트 Phase 1 기준선 보고서

## 1. 범위와 기준 HEAD

이 보고서는 `7cb38818124742d340dc26e8bfa8c1d43ebca848`에서 수집한 Phase 1 증거다. 제품 코드와 테스트를 바꾸지 않고, 510개 자동화 테스트 파일의 runner 연결성, 정적 검토 후보, 공식 lane의 1회 실행 결과를 기록했다. 실행 실패나 로컬 선행 조건 부재는 테스트 제거 근거로 사용하지 않았다.

## 2. 도구 및 환경 준비 상태

| 의존성 | 상태 | 관찰값 |
| --- | --- | --- |
| Node.js 24 | READY | `v24.18.0` |
| pnpm | READY | `npx --yes corepack@0.35.0 pnpm --version` = `11.13.1` |
| Java | READY | OpenJDK 25.0.3 |
| Docker CLI | READY | 실행 파일 존재 |
| Docker daemon | UNVERIFIED_ENV | 로컬 socket에 daemon 없음 |
| MySQL CLI | UNVERIFIED_ENV | 실행 파일 없음 |
| ShellCheck | UNVERIFIED_ENV | 실행 파일 없음 |
| jq, ripgrep | READY | 실행 파일 존재 |

시스템 패키지를 설치하거나 worker, fork, retry, timeout을 변경하지 않았다.

## 3. 파일·케이스·runner 연결성

| lane | 파일 | 정적 수집 case | selection source | 연결성 |
| --- | ---: | ---: | --- | --- |
| front-vitest-node | 69 | 403 | `front/vitest.config.ts:node` | included |
| front-vitest-jsdom | 114 | 948 | `front/vitest.config.ts:jsdom` | included |
| front-playwright-e2e | 40 | 82 | `front/playwright.config.ts` | included |
| front-playwright-ct | 6 | 7 | `front/playwright-ct.config.ts` | included |
| design-system-vitest | 7 | 13 | `design/system/package.json` | included |
| design-docs-vitest | 1 | 2 | `design/docs/package.json` | included |
| server-unit | 173 | 943 | `server/build.gradle.kts:unitTest` | dry-run 일치 |
| server-integration | 98 | 692 | `server/build.gradle.kts:integrationTest` | dry-run 일치 |
| server-architecture | 2 | 25 | `server/build.gradle.kts:architectureTest` | dry-run 일치 |

총 510개 파일은 중복·누락 없이 한 lane에만 속한다. Gradle dry-run은 nested class 때문에 각각 173/101/3개 XML을 만들었지만 source로 정규화하면 273개 server 경로이며, unmapped 경로와 inventory lane 차이는 모두 0이다.

## 4. CI job과 공식 명령 대응

| CI job | 로컬 기준선 lane | 대응 명령 |
| --- | --- | --- |
| scripts | agent-guidance, script-* | `python3 scripts/check-agent-guidance.py`; `bash -n` 및 저장소 validation scripts; CI의 ShellCheck는 로컬 선행 조건 부재 |
| public-release | public-release | `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate` |
| frontend | front-lint, front-coverage, front-build, front-zod-fixtures | `pnpm --dir front lint`; `pnpm --dir front test:coverage`; `pnpm --dir front build`; fixture export 후 diff |
| frontend-visual-regression | front-ct-docker | `pnpm --dir front test:ct:docker` |
| design-system | design-check | `pnpm design:check` |
| backend | server-ci | `./scripts/server-ci-check.sh` |
| backend-integration | server-integration | `./server/gradlew -p server integrationTest` |
| e2e (1/3) | front-e2e | CI는 `playwright test --shard=1/3`; 로컬 공식 대표 명령은 `pnpm --dir front test:e2e` |
| e2e (2/3) | front-e2e | CI는 `playwright test --shard=2/3`; 로컬 공식 대표 명령은 `pnpm --dir front test:e2e` |
| e2e (3/3) | front-e2e | CI는 `playwright test --shard=3/3`; 로컬 공식 대표 명령은 `pnpm --dir front test:e2e` |

모든 pnpm 명령은 Node 24를 앞세운 PATH에서 `npx --yes corepack@0.35.0 pnpm`으로 실행했다.

## 5. 실행 결과와 wallclock

`case/file`은 해당 명령이 직접 실행하는 테스트 수를 알 수 있을 때만 적었다. 스크립트와 build 계열에는 해당 없음으로 표시했다.

| lane | 정확한 명령 | 상태 | real 초 | case/file | retry 관찰 | 원시 증거 |
| --- | --- | ---: | ---: | --- | --- | --- |
| front-lint | `pnpm --dir front lint` | 0 | 19.01 | 해당 없음 | 없음 | `.tmp/test-suite-audit/front-lint.log` |
| front-coverage | `pnpm --dir front test:coverage` | 0 | 43.48 | 1,425/183 | 없음 | `.tmp/test-suite-audit/front-coverage.log` |
| front-build | `pnpm --dir front build` | 0 | 2.28 | 해당 없음 | 없음 | `.tmp/test-suite-audit/front-build.log` |
| front-zod-fixtures | `pnpm --dir front zod:export-fixtures && git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/` | 0 | 1.44 | 해당 없음 | 없음 | `.tmp/test-suite-audit/front-zod-fixtures.log` |
| design-check | `pnpm design:check` | 0 | 8.28 | 15/8 | 없음 | `.tmp/test-suite-audit/design-check.log` |
| server-ci | `./scripts/server-ci-check.sh` | 0 | 9.11 | unit 943, architecture 25/175 source files | 없음 | `.tmp/test-suite-audit/server-ci.log` |
| server-integration | `./server/gradlew -p server integrationTest` | UNVERIFIED_ENV | - | 692/98 source files | 실행 안 함 | Docker daemon 없음 |
| front-e2e | `pnpm --dir front test:e2e` | UNVERIFIED_ENV | - | 82/40 | 실행 안 함 | MySQL CLI 없음 |
| front-ct-docker | `pnpm --dir front test:ct:docker` | UNVERIFIED_ENV | - | 7/6 | 실행 안 함 | Docker daemon 없음 |
| agent-guidance | `python3 scripts/check-agent-guidance.py` | 0 | 1.75 | 해당 없음 | 없음 | `.tmp/test-suite-audit/agent-guidance.log` |
| script-bash-syntax | `for test_audit_script in scripts/*.sh deploy/oci/*.sh; do bash -n "$test_audit_script"; done` | 0 | 0.14 | 해당 없음 | 없음 | `.tmp/test-suite-audit/script-bash-syntax.log` |
| script-shellcheck | `shellcheck scripts/*.sh deploy/oci/*.sh` | UNVERIFIED_ENV | - | 해당 없음 | 실행 안 함 | ShellCheck 실행 파일 없음 |
| script-aigen-pii | `bash scripts/aigen-pii-check.sh` | 0 | 3.89 | 해당 없음 | 없음 | `.tmp/test-suite-audit/script-aigen-pii.log` |
| script-observability-config | `./scripts/validate-prometheus-rules.sh && ./scripts/validate-prometheus-config.sh && bash scripts/validate-tempo-config.sh && ./scripts/lint-grafana-dashboards.sh` | 1 | 0.44 | 해당 없음 | 없음 | `.tmp/test-suite-audit/script-observability-config.log` |
| script-production-ai-config | `bash scripts/validate-production-ai-config.sh && bash scripts/verify-production-ai-config-fixtures.sh` | 0 | 0.16 | 해당 없음 | 없음 | `.tmp/test-suite-audit/script-production-ai-config.log` |
| public-release | `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate` | 0 | 24.90 | 해당 없음 | 없음 | `.tmp/test-suite-audit/public-release.log` |

## 6. Coverage 기준선

Frontend V8 coverage는 lines 82.57%, statements 81.77%, functions 82.06%, branches 77.69%로 현재 80/79/80/75 gate를 통과했다. Server JaCoCo line counter는 covered 11,272, missed 13,676으로 45.18%이며 0.23 minimum을 통과했다. threshold를 변경하지 않았다.

## 7. Retry·flake·실패 신호

각 lane은 정확히 한 번 실행했고 retry를 추가하지 않았다. 성공 로그에는 retry, retried, flaky 또는 두 번째 attempt 신호가 없었다. `front-coverage`는 183 files/1,425 tests, design suites는 8 files/15 tests를 한 번에 통과했다. `script-observability-config`의 non-zero 1은 테스트 assertion 실패가 아니라 첫 Docker 기반 validator가 daemon socket에 연결하지 못한 환경 실패이며, `&&` 뒤의 validator는 실행되지 않았다. 따라서 이 1회 기준선으로 flake 유무를 판정하지 않는다.

## 8. 미검증 항목과 환경 원인

- `server-integration`과 `front-ct-docker`: Docker CLI는 있지만 daemon이 없어 `UNVERIFIED_ENV`다.
- `front-e2e`: 공식 helper가 요구하는 MySQL CLI가 없어 `UNVERIFIED_ENV`다.
- `script-shellcheck`: ShellCheck 실행 파일이 없어 `UNVERIFIED_ENV`다. CI `scripts` job은 이를 설치한다.
- `script-observability-config`: 실행은 됐지만 Docker daemon 연결 실패로 non-zero다. config 자체의 성공 여부는 미검증이다.
- Playwright E2E/CT의 runtime, retry, screenshot drift는 수집하지 못했다. 정적 list 결과만 file/case census 근거로 사용했다.

## 9. 고위험 gap matrix

표의 테스트 경로는 inventory와 대조했다. `server-unit`은 Task 3에서 실행됐고 `server-integration` 및 `front-playwright-e2e`는 환경 원인으로 실행되지 않았다.

| risk_id | boundary | production evidence | test evidence와 관찰점 | observed gap | disposition | follow-up plan |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | BFF secret, internal header stripping, cookie/redirect trust | `front/functions/_shared/proxy.ts`가 BFF secret과 신뢰된 host/IP를 덮어쓰고 upstream cookie domain 및 내부 응답 header를 제거하며, `front/functions/api/bff/[[path]].ts`가 route-selected slug만 전달한다. `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`는 보호 API의 secret을 거부한다. | `front/tests/unit/cloudflare-bff.test.ts`와 `front/tests/unit/proxy-bff-secret.test.ts`는 browser header overwrite, invalid slug rejection, secret precedence를 assertion하며 `server/src/test/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilterTest.kt`는 missing/wrong secret 403과 valid secret 통과를 assertion한다. node lane은 검증됐다. | cookie attribute와 redirect response sanitization을 한 contract로 묶은 부정 테스트가 약하다. | strengthen | frontend-bff |
| R02 | OAuth return state와 open redirect 방지 | `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt`는 return path를 정규화하고 expiry와 HMAC을 검증하며 timing-safe 비교한다. | `server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt`는 blank secret fail-fast만 직접 assertion한다. `front/tests/unit/cloudflare-oauth-proxy.test.ts`는 query/cookie forwarding, Location/Set-Cookie 보존, 내부 header 제거를 assertion하고 `front/tests/e2e/google-auth-invite-flow.spec.ts`는 invite login return 흐름을 관찰한다. unit은 검증됐고 E2E는 미검증이다. | tampered/expired state와 scheme-relative 또는 external return target의 직접 거부 matrix가 부족하다. | add | frontend-bff |
| R03 | membership, role, club-context tenant isolation | `server/src/main/kotlin/com/readmates/club/adapter/in/web/ClubContextResolver.kt`는 active slug/host만 resolve하고 `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`는 host/member 경계를 강제한다. | `server/src/test/kotlin/com/readmates/club/api/ClubContextResolverTest.kt`는 disabled host/invalid slug가 null임을, `server/src/test/kotlin/com/readmates/auth/api/AuthenticatedMemberSecurityTest.kt`는 inactive membership과 member-to-host 거부를 assertion한다. `front/tests/e2e/multi-club-flow.spec.ts`는 slug별 public data, role, invite target 분리를 assertion한다. server unit만 검증됐다. | 임의 resource ID를 다른 club context에서 재사용하는 endpoint별 거부 matrix가 완전하지 않다. | strengthen | server |
| R04 | public/member/attendee visibility | `server/src/main/kotlin/com/readmates/publication/application/service/PublicQueryService.kt`와 `server/src/main/kotlin/com/readmates/club/domain/ClubPublicVisibility.kt`가 publication 및 visibility 조건을 적용한다. | `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`는 unpublished/removed-author 자료 제외와 left-member 익명화를, `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`는 club scope와 viewer feedback-document 거부를 assertion한다. `front/tests/e2e/public-auth-member-host.spec.ts`는 public→member→host UI 차이를 assertion한다. 모두 integration/E2E라 실행은 미검증이다. | visibility 전이의 runtime 증거가 없고 attendee-only denial 조합을 더 확인해야 한다. | runtime-unverified | server |
| R05 | session/member/invitation/publication lifecycle denial | `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt`가 lifecycle command를 조율하고 domain/DB invariant가 불가능한 상태를 거부한다. | `server/src/test/kotlin/com/readmates/session/application/service/HostSessionServicesTest.kt`는 rollout staging 거부와 visibility command 부재를, `server/src/test/kotlin/com/readmates/session/domain/SessionInvariantConstraintTest.kt`는 invalid status/visibility SQL 실패를, `server/src/test/kotlin/com/readmates/auth/application/MemberLifecycleServiceTest.kt`는 suspend와 invalidation을 assertion한다. `front/tests/e2e/member-lifecycle.spec.ts`는 suspended member의 save disabled를 관찰한다. unit은 검증됐고 integration/E2E는 미검증이다. | invitation/publication의 forbidden transition과 duplicate command 조합이 분산돼 있다. | strengthen | server |
| R06 | transaction rollback과 Flyway upgrade | `server/src/main/resources/db/mysql/migration`이 schema/data 전이를 정의하고 apply service/controller가 package replacement와 revision commit을 transaction 경계에서 수행한다. | `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`는 baseline table, constraint, non-null schema를, `server/src/test/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyServiceTest.kt`는 validation-before-commit과 immutable revision을, `server/src/test/kotlin/com/readmates/sessionrecord/api/HostSessionRecordControllerDbTest.kt`는 CAS/restore fail-closed를 assertion한다. unit만 검증됐다. | 중간 persistence 실패 후 전체 rollback 및 기존 schema/data에서 최신 migration까지의 upgrade fixture가 명시적이지 않다. | add | server |
| R07 | Redis failure, stale read, post-commit invalidation | `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt`, `server/src/main/kotlin/com/readmates/publication/adapter/out/redis/RedisPublicReadCacheAdapter.kt`, `server/src/main/kotlin/com/readmates/note/adapter/out/redis/RedisNotesReadCacheAdapter.kt`가 key scope와 fallback을 구현한다. | `server/src/test/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapterTest.kt`는 target keys 제거, unrelated keys 보존, failure metrics를 assertion한다. `server/src/test/kotlin/com/readmates/publication/application/service/PublicQueryServiceCacheTest.kt`와 `server/src/test/kotlin/com/readmates/note/application/service/NotesFeedServiceCacheTest.kt`는 hit/miss 및 paged-read cache bypass를 assertion한다. service unit은 검증됐지만 Redis integration은 미검증이다. | commit 직후 invalidation 실패와 stale read의 실제 Redis 동작을 재검증하지 못했다. | runtime-unverified | server |
| R08 | AI authorization, cost cap, reservation, cancel/expiry/recovery race | `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryService.kt`가 receipt/lease recovery를, `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisProviderCallReservationAdapter.kt`가 원자적 call/cost reservation을 구현한다. | `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationCommitRecoveryServiceTest.kt`는 receipt convergence, expired lease retry, content-free warning을 assertion한다. `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisGenerationCostCountersTest.kt`와 `RedisProviderCallReservationAdapterTest.kt`는 fail-closed cap, release, TTL, 64-way concurrency cap을 assertion한다. `front/tests/e2e/aigen-cost-cap.spec.ts`와 `aigen-commit-recovery.spec.ts`는 사용자 오류와 content 비노출을 관찰한다. unit만 검증됐다. | Redis concurrency 및 브라우저 recovery lane은 runtime 미검증이다. | runtime-unverified | server |
| R09 | notification outbox idempotency와 partial delivery | `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapter.kt`가 dedupe/claim을, `server/src/main/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingService.kt`가 sent/retry/dead 처리를 구현한다. | `server/src/test/kotlin/com/readmates/notification/adapter/out/persistence/JdbcNotificationEventOutboxAdapterTest.kt`는 duplicate enqueue 1-row와 claim transition을, `server/src/test/kotlin/com/readmates/notification/application/service/NotificationDeliveryProcessingServiceTest.kt`는 sent/failed/dead metrics, retry delay, PII-safe warning을 assertion한다. `server/src/test/kotlin/com/readmates/notification/kafka/NotificationKafkaPipelineIntegrationTest.kt`는 Kafka metadata 보존을 assertion한다. service unit만 검증됐다. | DB/Kafka partial-delivery와 reclaim 동작의 runtime 증거가 없다. | runtime-unverified | server |
| R10 | PII-safe frontend/server observability와 profile parity | `front/shared/observability/frontend-observability-client.ts`는 enqueue와 flush 전에 batch를 sanitize하고 `server/src/main/kotlin/com/readmates/observability/application/service/FrontendObservabilityService.kt`는 bounded metric을 기록한다. | `front/tests/e2e/frontend-observability-local-proxy.spec.ts`는 proxy 202와 accepted/dropped 값을, `server/src/test/kotlin/com/readmates/observability/application/service/FrontendObservabilityServiceTest.kt`는 supported/dropped metrics를, `server/src/test/kotlin/com/readmates/observability/adapter/in/web/FrontendObservabilityBffSecurityTest.kt`는 BFF secret/origin 거부를 assertion한다. server unit은 검증됐지만 E2E와 config validation은 미검증이다. | Docker 기반 config validator가 non-zero였고 local/test profile과 production label/cardinality parity를 끝까지 확인하지 못했다. | runtime-unverified | final-verification |

## 10. 후속 계획 경계

후속 계획은 이 보고서와 candidate ledger를 입력으로 사용한다. ledger의 101개 고유 path는 모두 `candidate-only`이며 아래 ownership rule이 정확한 후보 파일 목록을 만든다. 중복 flag는 한 파일로 합친다.

### server

- Candidate files: candidate ledger를 inventory와 path로 join했을 때 lane이 `server-unit`, `server-integration`, `server-architecture`인 61개 고유 파일.
- 소유 risk: R03–R09. R01의 Spring filter는 frontend-bff와 공동 검토하되 server 변경은 이 계획이 소유한다.
- 기준선: `./scripts/server-ci-check.sh` 9.11초/성공; `./server/gradlew -p server integrationTest`는 Docker daemon 부재로 미검증.
- 선행 조건: JDK 25; integration에는 reachable Docker daemon.
- 비목표: 제품 계약, migration, coverage minimum을 바꾸거나 환경 실패를 테스트 삭제로 해결하지 않는다.
- acceptance: focused unit/integration tests, `./scripts/server-ci-check.sh`, `./server/gradlew -p server integrationTest`.

### frontend-bff

- Candidate files: candidate ledger를 inventory와 join했을 때 lane이 `front-vitest-node` 또는 `front-vitest-jsdom`인 33개 고유 파일.
- 소유 risk: R01–R02 및 R03/R10의 browser-facing contract.
- 기준선: `pnpm --dir front test:coverage` 43.48초/1,425 tests 성공, lint 19.01초 성공, build 2.28초 성공.
- 선행 조건: Node 24.18.0, pnpm 11.13.1(Corepack launcher).
- 비목표: server persistence, browser visual baseline, coverage threshold 변경.
- acceptance: focused Vitest, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`; auth/BFF 흐름 변경 시 E2E.

### e2e-ct-ci

- Candidate files: candidate ledger를 inventory와 join했을 때 `front-playwright-e2e`, `front-playwright-ct`, `design-system-vitest`, `design-docs-vitest` lane인 7개 고유 파일. scripts/CI는 정적 ledger 대상 밖이므로 현재 workflow와 validation scripts를 별도 reachability 대상으로 포함한다.
- 소유 risk: R02–R05/R08/R10의 browser evidence와 visual/CI reachability.
- 기준선: design-check 8.28초/15 tests 성공; E2E는 MySQL CLI 부재, CT는 Docker daemon 부재, ShellCheck는 실행 파일 부재로 미검증; public-release 24.90초 성공.
- 선행 조건: Node/pnpm, MySQL service와 CLI, reachable Docker daemon, Playwright browser, ShellCheck.
- 비목표: retry/timeout 증가, snapshot 무검토 갱신, server domain 계약 변경.
- acceptance: `pnpm --dir front test:e2e`, `pnpm --dir front test:ct:docker`, `pnpm design:check`, script/ShellCheck lanes, public-release candidate checks.

### final-verification

- Candidate files: 앞의 101개 candidate 결론과 변경된 테스트 전체. 새 정적 삭제 후보를 독자적으로 만들지 않는다.
- 소유 risk: R01–R10 통합 재검토, 특히 R10 config/profile parity.
- 기준선: 이 보고서의 모든 명령과 real time; non-zero/UNVERIFIED_ENV 상태도 전후 비교에서 유지한다.
- 선행 조건: Node/pnpm/JDK, Docker daemon, MySQL CLI/service, browser, ShellCheck.
- 비목표: 배포, merge, production credential/provider 호출, broad mutation testing.
- acceptance: 선택된 결함 주입의 expected failure와 복원 후 pass, 전체 공식 gates, coverage/wallclock 전후표, public-safety scan과 최종 residual-risk 기록.
