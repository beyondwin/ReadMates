# 테스트 스위트 효과성 최적화 Phase 2 서버 보고서

## 결론

Phase 2는 시작 커밋 `0cd590a9`의 Task 1 기준선에서 후보 커밋
`dfc0cb5b`까지 서버 테스트만 강화하고, 승인된 테스트 이동과 통합만
적용했다.

Runtime 검증 대상은 `dfc0cb5b`다. 최초 보고서 커밋 `bf77bdc0`과 이
후속 문서 보정은 해당 후보의 report-only descendant이며, 새 제품 또는
테스트 runtime 후보를 만들지 않는다.

- 61개 후보의 최종 결정은 `retain` 48, `strengthen` 10,
  `move-layer` 2, `consolidate` 1이다.
- 실제 테스트 소스 파일은 277개에서 276개로 1개 줄었지만, 실행
  케이스는 1,708개에서 1,724개로 16개 늘었다.
- 최종 후보에서 PR 수준 서버 게이트와 전체 Testcontainers 통합
  lane을 캐시 없이 실제 실행했고 모두 통과했다.
- R03-R09의 실패 경로는 현재 제품 계약과 실제 MySQL, Redis, Kafka,
  Spring transaction 경계에서 확인됐다.
- 제품 코드, 운영 migration, JaCoCo threshold, retry, timeout, worker,
  heap, fork 정책은 변경하지 않았다.

이 보고서의 증거 범위는 저장소와 로컬 Testcontainers 실행이다.
배포 또는 live production 검증을 주장하지 않는다.

## 시작점과 집계 방법

- Task 1 시작 커밋: `0cd590a9`
- 최종 검증 후보: `dfc0cb5b`
- 파일 수: 각 커밋의 `server/src/test/kotlin/**/*Test.kt`를
  `@Tag("integration")`, `@Tag("container")`,
  `@Tag("architecture")` 규칙으로 lane 분류했다.
- 케이스 수: Task 1 기준선과 최종 후보의 Gradle JUnit XML에서
  `tests`, `failures`, `errors`, `skipped`를 합산했다.

| Server lane | Task 1 파일 | 최종 파일 | Task 1 케이스 | 최종 케이스 | 최종 실패/오류/skip |
| --- | ---: | ---: | ---: | ---: | ---: |
| unit | 175 | 177 | 949 | 955 | 0 / 0 / 1 |
| integration/container | 100 | 97 | 734 | 744 | 0 / 0 / 0 |
| architecture | 2 | 2 | 25 | 25 | 0 / 0 / 0 |
| 합계 | 277 | 276 | 1,708 | 1,724 | 0 / 0 / 1 |

파일 수 변화는 두 integration 테스트의 unit 이동(+2 unit), 세
integration 소스 삭제(-3 integration)의 결과다. 새 실패 경로를
추가했기 때문에 전체 케이스 수는 16개 증가했다.

## 61개 후보 결정

최종 decision ledger의 61개 경로는 모두 고유하며 disposition 합계가
정확히 61이다.

| Decision | 수 | 적용 |
| --- | ---: | --- |
| `retain` | 48 | 고유 실패 모드와 관찰 지점을 그대로 유지 |
| `strengthen` | 10 | R03-R09 위험에 대한 테스트 증거 강화 |
| `move-layer` | 2 | DB가 필요 없는 계약을 unit lane으로 이동 |
| `consolidate` | 1 | 동일 401 실패 모드를 기존 unit 테스트로 통합 |
| `delete` | 0 | 독립 삭제 승인 없음 |
| `split` | 0 | 분할 승인 없음 |

## R03-R09 최종 증거

후보 HEAD의 전체 lane에서 아래 클래스가 모두 실행됐다. 괄호 안은
최종 JUnit XML의 케이스 수이며 모든 클래스가 실패, 오류, skip 0이다.

### R03 - cross-club resource ID 격리

- `AuthenticatedMemberSecurityTest` (5):
  `club A host cannot read or mutate club B session by resource id`가
  archive read의 `404 RESOURCE_NOT_FOUND`, host mutation의
  `404 SESSION_NOT_FOUND`, session/publication/outbox/audit 무변경을
  확인한다.
- `ArchiveAndNotesDbTest` (25)와 `HostSessionControllerDbTest` (43)가
  실제 MySQL club scope와 거부 후 전체 관련 row snapshot 무변경을
  확인한다.

### R04 - 공개 범위와 actor matrix

- `PublicControllerDbTest` (12)의
  `anonymous visibility matrix exposes only published public sessions`가
  anonymous 공개 표면에서 published `PUBLIC`만 노출됨을 확인한다.
- `ArchiveAndNotesDbTest`의
  `member archive visibility matrix distinguishes non attendee attendee host and cross club actors`
  가 active non-attendee, attendee, host, cross-club actor를 실제
  participant row로 구분한다.
- 현재 제품 visibility 계약은 `PUBLIC`, `MEMBER`, `HOST_ONLY` 세
  값이다. 승인된 ruling에 따라 `ATTENDEE`는 네 번째 visibility가
  아니라 actor 차원이다. attendee와 non-attendee 모두 현재
  `MEMBER` 계약으로 검증했으며 enum, API, migration을 바꾸지 않았다.

### R05 - lifecycle 금지와 중복 replay

- `HostSessionServicesTest` (25)의
  `duplicate lifecycle replays return stable results without second write cache eviction or audit transition`
  과
  `forbidden lifecycle transition propagates error without write cache eviction or audit transition`
  이 application result/error와 side-effect 부재를 함께 관찰한다.
- `HostSessionControllerDbTest`의 open/close replay와
  `host publish replay returns published result without second write outbox or audit transition`
  이 실제 API/MySQL snapshot으로 두 번째 DB write, outbox, audit
  mutation이 없음을 확인한다. Cache eviction 부재는 DB 테스트가
  아니라 위 `HostSessionServicesTest`의 application-port 관찰이
  별도로 증명한다.

### R06 - transaction rollback과 Flyway upgrade

- `SessionRecordApplyServiceTest` (13)의
  `applied revision failure happens after live replacement and before receipt or draft deletion`
  이 실패 위치와 호출 순서를 고정한다.
- `HostSessionRecordControllerDbTest` (7)의
  `mid transaction revision constraint failure rolls back every record apply table`
  이 실제 Spring `@Transactional` 경계에서 live replacement,
  immutable revision, draft, receipt, publication, feedback, outbox의
  전 상태 복원을 확인한다.
- `MySqlFlywayMigrationTest` (9)의
  `mysql upgrades populated v41 schema to latest and preserves rows`가
  public-safe V41 fixture를 정상 operational chain으로 최신까지
  올리고 row, FK, index, check constraint를 확인한다.
- 운영 migration은 수정하지 않았고, test fixture
  `server/src/test/resources/db/phase2/flyway-upgrade-before-latest.sql`
  만 추가했다.

### R07 - Redis invalidation과 stale read

- `RedisReadCacheInvalidationAdapterTest` (6)의
  `host publication keeps stale entries until commit then target refetches while unrelated clubs stay cached`
  가 실제 Redis에서 commit 전 stale hit, commit 후 target miss/refetch,
  unrelated club hit를 확인한다.
- 같은 클래스의
  `post commit redis failure leaves stale cache observable and records content free failure metrics`
  와 `PublicQueryServiceCacheTest` (5), `NotesFeedServiceCacheTest` (4),
  `HostSessionServicesTest`가 best-effort 실패 뒤 stale 값을 fresh로
  오인하지 않고 content-free metric을 남기는 계약을 확인한다.

### R08 - AI reservation과 recovery interleaving

- `RedisProviderCallReservationAdapterTest` (29)가 deterministic
  cancel-first/reserve-first, expiry/reconcile, cost/call slot/lease/attempt
  상태를 실제 Redis Lua 경계에서 확인한다.
- `AiGenerateApiIntegrationTest` (12)의
  `provider response reconciliation crash redelivers once and converges with retained unknown cost`
  가 실제 Kafka redelivery, two physical calls, `UNKNOWN`과
  `SUCCEEDED` ledger, retained cost를 확인한다.
- `AiGenerationCommitRecoveryServiceTest` (3)의
  `commit receipt wins over the lease and repeated recovery converges without importing twice`
  가 receipt-backed recovery의 중복 import/cleanup 방지를 확인한다.
- 외부 provider network는 호출하지 않았고 deterministic test provider만
  사용했다.

### R09 - outbox/Kafka partial delivery

- `NotificationKafkaPipelineIntegrationTest` (3)의
  `publish mark loss reclaims through Kafka with exactly once logical side effects`
  가 real producer/broker/listener/JDBC 경로에서 두 physical Kafka
  record와 한 logical mail side effect를 확인한다.
- `JdbcNotificationEventOutboxAdapterTest` (15)가 15분 lease 경계의
  stale reclaim과 fresh exclusion, event/request/dedupe metadata,
  compare-and-set publish state를 확인한다.
- `NotificationDeliveryProcessingServiceTest` (5)의
  `processClaimed records bounded sanitized retry and dead transitions`
  가 exact delivery ID/lease, 15분 delay, 500자 redacted error,
  `RETRY`/`DEAD` 결정을 확인한다.

## 승인된 cleanup

| Decision | 이전 경로 | 최종 경로 또는 survivor | 보존한 실패 모드 |
| --- | --- | --- | --- |
| move-layer | `server/src/test/kotlin/com/readmates/auth/api/DevInvitationControllerTest.kt` | `server/src/test/kotlin/com/readmates/auth/adapter/in/web/DevInvitationControllerTest.kt` | 제거된 dev invitation endpoint의 HTTP 410, `GONE` projection |
| move-layer | `server/src/test/kotlin/com/readmates/note/api/ReviewControllerTest.kt` | `server/src/test/kotlin/com/readmates/note/adapter/in/web/ReviewWebDtosTest.kt` | blank `OneLineReviewRequest.text`의 `NotBlank` violation |
| consolidate | `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerTest.kt` | 기존 `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerTest.kt` | `CurrentMemberArgumentResolver`를 통한 unresolved-member HTTP 401 |

`CurrentSessionControllerDbTest`의 실제 current-session projection은
integration lane에 그대로 남았다. 두 move destination과 consolidation
survivor는 최종 unit lane에서 각각 1, 1, 2개 케이스로 통과했다. 별도
`delete` 또는 `split` disposition은 적용하지 않았다.

## 집중 반복 실행

Task 9 brief의 정확한 class set은 unit 3개 클래스 33개 케이스와
integration 7개 클래스 99개 케이스다.

```bash
./server/gradlew -p server unitTest \
  --tests com.readmates.session.application.service.HostSessionServicesTest \
  --tests com.readmates.aigen.application.service.AiGenerationCommitRecoveryServiceTest \
  --tests com.readmates.notification.application.service.NotificationDeliveryProcessingServiceTest

./server/gradlew -p server integrationTest \
  --tests com.readmates.publication.api.PublicControllerDbTest \
  --tests com.readmates.archive.api.ArchiveAndNotesDbTest \
  --tests com.readmates.support.MySqlFlywayMigrationTest \
  --tests com.readmates.shared.adapter.out.redis.RedisReadCacheInvalidationAdapterTest \
  --tests com.readmates.aigen.adapter.out.redis.RedisProviderCallReservationAdapterTest \
  --tests com.readmates.notification.adapter.out.persistence.JdbcNotificationEventOutboxAdapterTest \
  --tests com.readmates.notification.kafka.NotificationKafkaPipelineIntegrationTest
```

정확한 계획 argv 계열과 실제 3회 실행 계열은 별도로 기록했다.
정확한 argv를 각 lane에서 세 번 호출한 결과는 다음과 같으며,
cache-only 결과는 flake 또는 실행 시간 표본으로 세지 않았다.

| Lane | 정확한 argv 호출 1 | 정확한 argv 호출 2 | 정확한 argv 호출 3 |
| --- | --- | --- | --- |
| unit | 실제 실행, 3.82s | `UP-TO-DATE`, 0.45s | `FROM-CACHE`, 0.52s |
| integration | 실제 실행, 35.79s | `FROM-CACHE`, 0.41s | `UP-TO-DATE`, 0.35s |

이 표는 하나의 연속된 six-command loop chronology가 아니다. Unit의
cache-only 관찰은 supplemental unit 실행 전에 나왔지만, supplemental
integration 2/3회차는 약 03:02-03:03에 먼저 실행됐고 표의 exact
integration cache-only 호출 2/3은 full gate 뒤 약 03:07에 상태 확인용으로
실행됐다. 따라서 뒤의 cache probe가 앞선 supplemental 실행을
동기부여했다는 순서를 주장하지 않는다.

실제 3회 표본 계열에서는 2/3회차에 해당 task output만
`cleanUnitTest`/`cleanIntegrationTest`로 비우고
`--no-build-cache`를 추가했다. class filter, JVM heap, fork, retry,
timeout, worker, Testcontainers 정책은 바꾸지 않았다.

| 실제 실행 | unit 33 cases | integration 99 cases | 실패/오류/skip |
| --- | ---: | ---: | ---: |
| 1 | 3.82s | 35.79s | 0 / 0 / 0 |
| 2 | 2.85s | 34.12s | 0 / 0 / 0 |
| 3 | 2.02s | 34.34s | 0 / 0 / 0 |
| min / median / max | 2.02 / 2.85 / 3.82s | 34.12 / 34.34 / 35.79s | - |

여섯 actual execution에 실패나 nondeterministic 결과가 없었고, command
log에 Gradle test retry 또는 re-execution marker도 없었다.

Phase 2 도중에는 Task 3 lifecycle focused command가 test body 실행 전에
새 Ryuk container의 localhost 연결 실패로 한 번 종료된 적이 있다.
동일 명령을 Docker 설정, timeout, retry 정책, 제품 코드 변경 없이
다시 실행해 통과했다. 이 과거 transient environment retry를 숨기지
않으며, Task 9의 세 실제 반복에서는 재발하지 않았다.

## 전체 lane과 시간

최종 후보에서 먼저 실행한 정확한 gate 명령은 Gradle cache를 복원해
각각 0.50s와 0.49s에 성공했지만 테스트 JVM을 실행하지 않았다. 이
결과는 acceptance 또는 timing 개선 근거로 사용하지 않았다.

그 뒤 Gradle project 설정은 건드리지 않고 clean output과
process-local cache disable을 사용해 같은 candidate HEAD에서 실제
gate를 실행했다.

| Gate | Task 1 기준선 | 최종 실제 실행 | 최종 결과 |
| --- | ---: | ---: | --- |
| `./scripts/server-ci-check.sh` | 13.55s | 24.84s | 955 unit + 25 architecture, 실패/오류 0, skip 1 |
| `./server/gradlew -p server integrationTest` | 97.76s | 109.13s | 744 integration, 실패/오류/skip 0 |
| `git diff --check` | PASS | 0.01s, PASS | 출력 없음 |

PR gate 기준선은 일부 task cache를 사용했고 최종 표본은 clean
no-cache 16-task 실행이므로 13.55s와 24.84s는 직접적인 성능 회귀
비교가 아니다. Integration lane은 케이스가 734에서 744로 늘고
추가 disposable MySQL Flyway upgrade fixture를 실행한 한 번씩의
표본에서 11.37s 차이가 관찰됐다. 이는 +10 cases와 fixture 비용을
포함한 descriptive one-sample evidence일 뿐이며, 통계적으로 의미
있는 regression measurement가 아니다.

## JaCoCo

| 지표 | Task 1 | 최종 후보 |
| --- | ---: | ---: |
| covered lines | 11,231 | 11,236 |
| missed lines | 14,003 | 13,998 |
| total lines | 25,234 | 25,234 |
| line coverage | 44.51% | 44.53% |
| required minimum | 0.23 | 0.23 |

JaCoCo minimum과 exclusion/configuration은 변경하지 않았다.

## 변경하지 않은 계약

`0cd590a9..dfc0cb5b` diff에는 production Kotlin, 운영 migration,
`server/build.gradle.kts`, server script 변경이 없다. 변경은 server
test, public-safe test fixture, decision ledger뿐이다.

- product/API/domain visibility 계약 변경 없음
- 운영 schema/migration 변경 없음
- JaCoCo threshold 변경 없음
- retry/backoff 정책 변경 없음
- production/test suite timeout 설정 또는 값 변경 없음
- worker, max heap, `maxParallelForks`, `forkEvery` 변경 없음
- Gradle build/configuration cache 설정 파일과 repository 설정 변경 없음
- external provider/mail delivery 없음

새 Kafka 검증은 기존 20초 bounded wait를 재사용하며 deadline을
늘리지 않았다. Test-only retry/dead assertions는 기존 정책 값을
관찰할 뿐 정책을 수정하지 않는다. `--no-build-cache`는 실제 실행을
확보하기 위한 process-local command option이었고 repository에 cache
설정을 저장하지 않았다. Clean task도 해당 build output만 비웠다.

## 경고와 잔여 위험

후보 HEAD의 R03-R09 및 cleanup 범위에 열린 구현 또는 test-suite
blocker는 없다. 다만 다음 server behavior/evidence residual risk는
의도적으로 남는다.

- R07 invalidation은 best-effort 계약이다. Commit 후 Redis
  invalidation이 실패하면 stale cache가 TTL 만료 또는 다음 성공한
  invalidation까지 남을 수 있다. 새 테스트는 이 위험을 제거하지
  않고 stale 값을 fresh refetch로 오인하지 않도록 관찰한다.
- AI provider와 mail은 deterministic provider stub과 recording mail
  boundary까지만 검증했다. 실제 외부 provider/mail network 또는 live
  deployment 검증은 수행하지 않았으므로 그 통합 상태는 이 보고서의
  증거 범위 밖이다.

별도로 남은 local toolchain/dependency 경고는 다음과 같다.

- Java native-access, deprecated `sun.misc.Unsafe`, dynamic agent loading
  경고
- MySQL 8.4가 현재 Flyway verified MySQL 8.1보다 새 버전이라는 경고
- 일부 운영 SQL의 MySQL `VALUES(col)` 문법 deprecation 경고
- Testcontainers reuse가 local 환경에서 활성화되지 않았다는 경고;
  테스트는 reuse 없이 disposable container로 통과
- 기존 Kotlin/Jackson/Spring API deprecation, redundant Elvis/safe
  call, unused-expression compiler 경고

이 경고들은 gate를 실패시키지 않았고 Phase 2 diff가 새로 만든
제품 위험은 아니다. 다만 향후 JDK, MySQL, Flyway 의존성 갱신 때
호환성 정리 대상으로 추적할 가치가 있다.

Acceptance matrix에서는 actor/authorization, club context, session
lifecycle, publication visibility, persistence/migration, async/cache/provider
행을 선택했다. BFF/OAuth, cursor, frontend/UI, deploy 행은 해당 코드나
계약을 변경하지 않았으므로 제외했다.
