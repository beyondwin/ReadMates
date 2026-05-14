# ReadMates v1.9 Quality Follow-up Spec

작성일: 2026-05-15
상태: READY FOR IMPLEMENTATION
기준 범위: v1.9.0 직후 (commit 5e74f4d) 전체 코드베이스 audit
대상 표면: `publication` slice 의 공개 read 경로, `shared/cache` Redis 무효화 adapter

## 1. 배경

v1.9.0 직후 사용자 요청으로 5축 (보안 / 정확성 / 성능 / 아키텍처 / 프런트 UX/a11y) 전수 audit을 진행했다. 1차 audit은 5개 Explore subagent를 병렬로 dispatch한 후 file:line 단위로 finding을 수집하는 방식이었고, 총 16건의 결함 후보가 제출되었다.

검증 단계에서 16건 중 14건이 false positive로 판명되었다. 자세한 검증 기록은 §9 에 정리한다. 결과적으로 실제 손볼 가치가 있는 finding은 다음 2건이다.

- **F1**: `JdbcPublicQueryAdapter` 의 공개 클럽/세션 read 경로가 동일 클럽 로드 1회당 4회 분리된 SELECT 와 6회 correlated EXISTS subquery 를 발생시킨다. 트래픽 자체는 BFF edge cache 로 흡수되지만, 캐시 미스/무효화 직후 부담이 누적된다.
- **F2**: `RedisReadCacheInvalidationAdapter` 가 무효화 시 `StringRedisTemplate.keys(pattern)` 을 호출한다. Redis main thread 를 O(N) 블로킹하는 `KEYS` 명령은 운영 키 수가 커질수록 latency 스파이크 원인이 된다.

두 finding 모두 기능 동작은 정확하다. 기능 회귀가 아닌 운영 안전과 효율 측면의 hardening 이다.

이 스펙은 새 기능을 추가하지 않는다. 동작 호환을 보장하면서 read 경로의 round-trip 수를 줄이고 Redis 무효화의 운영 위험을 제거한다.

## 2. 목표

- `JdbcPublicQueryAdapter.publicStats(...)` 가 클럽 1회 로드당 발생시키는 DB round-trip 을 3회에서 1회로 축소한다.
- `JdbcPublicQueryAdapter.publicSessions(...)` 의 row 당 correlated EXISTS subquery (highlight_count, one_liner_count) 를 사전 집계 join 으로 대체해 단일 query 로 정리한다. 결과 `PublicSessionSummaryResult` 의 모든 필드는 기존과 동일하게 채워진다.
- `RedisReadCacheInvalidationAdapter` 의 `redisTemplate.keys(...)` 사용을 SCAN 기반 iteration 으로 교체한다. 클럽별 무효화가 production Redis 의 main thread 를 블로킹하지 않는다.
- 기존 BFF edge cache 의 캐시 키, TTL, invalidation event timing 은 그대로 유지한다.
- 모든 변경은 hexagonal 경계 (adapter/out/persistence, adapter/out/redis) 안에서만 수행한다. application/domain layer 의 시그니처와 동작은 바뀌지 않는다.

## 3. 비목표

- BFF `[[path]].ts` 의 edge cache 정책, TTL, vary 조건 변경.
- `LoadPublishedPublicDataPort`, `ReadCacheInvalidationPort` 의 public 시그니처 변경.
- 공개 데이터 모델 (`PublicClubResult`, `PublicSessionSummaryResult`, `PublicHighlightResult`, `PublicOneLinerResult`) 의 필드 변경.
- 새 인덱스 추가. F1 은 query 형태 변경만 다루고, 기존 인덱스로 충분한지를 query plan 으로 확인한 뒤 부족하면 별도 plan 으로 분리한다.
- KEYS → SCAN 전환을 다른 Redis adapter (rate limit, public read cache, auth session cache, notification mute, manual notification preview) 로 확산하는 작업. 별도 plan 으로 분리한다.
- 1차 audit 에서 false positive 로 판정된 14건의 보강 작업. §9 의 "검증 기록" 으로 종료한다.
- arch test baseline 또는 frontend boundary test 의 갱신.

## 4. 핵심 결정

### 4.1 F1a — `publicStats()` 를 단일 query 로 통합

현재 구현은 `sessions count`, `books count`, `members count` 세 항목을 각각 별도 `queryForObject` 로 조회한다. 동일 `club_id` 에 대해 세 번 connection round-trip 이 발생한다.

`publicStats()` 는 결과로 `PublicClubStatsResult(sessions, books, members)` 만 채우므로, 모든 카운트를 하나의 SELECT 로 합칠 수 있다. 두 가지 후보:

- 후보 A: scalar subquery 3개를 가진 단일 `SELECT (...) AS sessions, (...) AS books, (...) AS members FROM dual` (MySQL 의 경우 `FROM dual` 명시 가능).
- 후보 B: `sessions` / `public_session_publications` / `memberships` 를 union-style 또는 join 으로 묶기.

후보 A 를 채택한다. 후보 B 는 books 의 `COUNT(DISTINCT book_title)` 가 sessions 의 `COUNT(*)` 와 row scope 가 동일하지 않아 join 으로 합치기 어렵다. scalar subquery 3개는 plan 상 동일한 비용이지만 round-trip 이 1회로 줄어든다.

쿼리 형태 (의도, 최종 SQL 은 구현 단계에서 결정):

```sql
select
  (
    select count(*)
    from sessions
    join public_session_publications on public_session_publications.session_id = sessions.id
      and public_session_publications.club_id = sessions.club_id
    where sessions.club_id = ?
      and sessions.state = 'PUBLISHED'
      and public_session_publications.visibility = 'PUBLIC'
  ) as session_count,
  (
    select count(distinct sessions.book_title)
    from sessions
    join public_session_publications on public_session_publications.session_id = sessions.id
      and public_session_publications.club_id = sessions.club_id
    where sessions.club_id = ?
      and sessions.state = 'PUBLISHED'
      and public_session_publications.visibility = 'PUBLIC'
  ) as book_count,
  (
    select count(*)
    from memberships
    where club_id = ?
      and status = 'ACTIVE'
  ) as member_count
```

placeholder 는 `clubId` 가 3회 반복된다. JdbcTemplate `queryForObject` 의 RowMapper 가 한 row 에서 세 컬럼을 읽는다.

### 4.2 F1b — `publicSessions()` 의 correlated subquery 를 사전 집계 join 으로

현재 구현은 LIMIT 6 sessions 를 가져오면서 row 마다 highlight_count, one_liner_count 를 correlated subquery 로 계산한다. `session_participants` 의 `participation_status = 'ACTIVE'` 와 LEFT/`membership_id is null` 분기를 포함한 EXISTS 절이 row 마다 두 번 평가된다.

LIMIT 6 의 bounded 비용이라 catastrophic 하지 않다. 그러나 두 가지 이유로 사전 집계 join 으로 정리한다:

1. publicSessions 는 BFF edge cache 미스 직후 N 개 클럽이 동시 로드될 때 가장 무거운 호출 지점이다. session 당 2회 EXISTS 평가가 row 6개에 곱해진다.
2. 같은 EXISTS predicate 가 `publicHighlights`, `publicOneLiners` 에도 약간 다른 형태로 반복되어 있어 사전 집계 결과를 share 하기 좋다.

대안 형태 (의도):

```sql
with active_participants as (
  select session_id, club_id, membership_id
  from session_participants
  where club_id = ?
    and participation_status = 'ACTIVE'
)
select
  sessions.id,
  sessions.number,
  sessions.book_title,
  sessions.book_author,
  sessions.book_image_url,
  sessions.session_date,
  public_session_publications.public_summary,
  coalesce(highlight_counts.cnt, 0) as highlight_count,
  coalesce(one_liner_counts.cnt, 0) as one_liner_count
from sessions
join public_session_publications on public_session_publications.session_id = sessions.id
  and public_session_publications.club_id = sessions.club_id
left join (
  select highlights.session_id, count(*) as cnt
  from highlights
  left join active_participants on active_participants.session_id = highlights.session_id
    and active_participants.club_id = highlights.club_id
    and active_participants.membership_id = highlights.membership_id
  where highlights.club_id = ?
    and (highlights.membership_id is null or active_participants.membership_id is not null)
  group by highlights.session_id
) highlight_counts on highlight_counts.session_id = sessions.id
left join (
  select one_line_reviews.session_id, count(*) as cnt
  from one_line_reviews
  join active_participants on active_participants.session_id = one_line_reviews.session_id
    and active_participants.club_id = one_line_reviews.club_id
    and active_participants.membership_id = one_line_reviews.membership_id
  where one_line_reviews.club_id = ?
    and one_line_reviews.visibility = 'PUBLIC'
  group by one_line_reviews.session_id
) one_liner_counts on one_liner_counts.session_id = sessions.id
where sessions.club_id = ?
  and sessions.state = 'PUBLISHED'
  and public_session_publications.visibility = 'PUBLIC'
order by sessions.number desc
limit 6
```

MySQL 8.x CTE 지원이 production DB 에 있는지 확인이 필요하다. 없다면 inline subquery 형태로 풀어쓴다 (CTE 는 reference 편의).

result mapping 은 기존과 동일하다 (`PublicSessionSummaryResult` 필드 그대로). `highlight_count`, `one_liner_count` 컬럼명은 보존.

### 4.3 F2 — `KEYS` 를 `SCAN` 기반 iteration 으로

`RedisReadCacheInvalidationAdapter.evictPublicContent(clubId)` 와 `evictNotesContent(clubId)` 는 패턴 매칭이 필요한 케이스에 `StringRedisTemplate.keys(pattern)` 을 호출한다. Spring Data Redis 의 `keys(pattern)` 은 Redis `KEYS` command 로 직역되며, Redis 메인 스레드를 O(N) 블로킹한다 (N = keyspace 전체 크기).

production Redis 가 전체 keyspace 가 크지 않을 가능성은 있지만, multi-club 운영이 확산되면 `public:club:*:session:*:v1`, `notes:club:*:session:*:feed:v1` 키 개수가 증가한다. KEYS 는 production Redis 의 표준 antipattern 이므로 SCAN 기반 iteration 으로 교체한다.

Spring Data Redis 권장 사용 형태:

```kotlin
private fun scanKeys(pattern: String): Set<String> {
    val options = ScanOptions.scanOptions().match(pattern).count(SCAN_BATCH_SIZE).build()
    val collected = mutableSetOf<String>()
    redisTemplate.execute<Unit> { connection ->
        connection.keyCommands().scan(options).use { cursor ->
            cursor.forEachRemaining { rawKey ->
                collected.add(String(rawKey, Charsets.UTF_8))
            }
        }
    }
    return collected
}
```

`SCAN_BATCH_SIZE` 는 256 으로 시작. SCAN 은 non-blocking 이며, cursor 가 close 되도록 `use` 블록을 사용한다.

호출부 두 군데를 `scanKeys(pattern)` 로 교체. 기존의 `runCatching { ... }.onFailure { recordRedisFailure(...) }` 패턴은 유지해 SCAN 실패 시 metric 만 기록하고 호출자는 영향 받지 않게 한다.

## 5. 데이터/스키마 변경

없음. 모든 변경은 read 경로의 query 형태와 Redis cursor 사용 패턴만 다룬다. Flyway migration 추가 없음.

## 6. API/외부 인터페이스 변경

없음. `LoadPublishedPublicDataPort` 와 `ReadCacheInvalidationPort` 의 시그니처는 그대로다. `PublicClubResult`, `PublicSessionSummaryResult` 의 필드 구성과 의미도 그대로다.

## 7. 테스트 전략

### 7.1 F1 — publication slice 의 기존 testcontainer 테스트

- `server/src/test/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter*Test*.kt` 가 존재한다면 그대로 실행해 회귀가 없는지 확인.
- 없다면 `loadClub(slug)` 와 `loadSession(slug, sessionId)` 가 동일 결과를 반환하는지 검증하는 fixture 기반 테스트를 추가. 1개 club, 2 PUBLISHED 세션 + 1 DRAFT, highlight/one_liner 가 active vs left 멤버 혼합, public/private visibility 혼합 fixture 로 count 정확성 확인.
- `publicStats()` 단일 query 전환은 결과만 동일하면 외부에서 구분 불가. 따라서 RowMapper 가 column index 가 아닌 column label 로 read 하도록 (오타 방지) 검증.

### 7.2 F2 — Redis SCAN 동작 검증

- testcontainer Redis 를 사용하는 기존 테스트가 있는 경우, `RedisReadCacheInvalidationAdapter` 에 대해 다음 시나리오:
  - 다수 (예: 100개) `public:club:<id>:session:*:v1` 키를 미리 SET 한 뒤 `evictClubContent(clubId)` 호출 시 모두 삭제되는지 확인.
  - 다른 club 의 키가 영향받지 않는지 확인.
  - SCAN 도중 race 로 key 가 추가되어도 호출이 finite step 으로 종료되는지 확인 (count 옵션이 hint 일 뿐 정확성 보장은 아니지만, 무한루프가 아닌지 시간 제한 assertion 으로 검증).
- Redis 가 down 인 경우 `runCatching` 이 발화하고 `recordRedisFailure` 가 호출되는지 확인.

### 7.3 회귀 방지 체크

- BFF edge cache 가 `/api/public/clubs/...` 와 `/api/public/records/...` 응답을 캐싱하므로, 응답 본문의 byte-equivalence 가 유지되는지 확인하는 contract 테스트가 있다면 그대로 실행.
- arch test (`ServerArchitectureBoundaryTest`) 가 새 import 로 인해 fail 하지 않는지 실행.

### 7.4 명령 (변경된 surface 만 검증)

```bash
./server/gradlew -p server test --tests "com.readmates.publication.*"
./server/gradlew -p server test --tests "com.readmates.shared.adapter.out.redis.*"
./server/gradlew -p server test --tests "com.readmates.architecture.*"
```

전체 회귀:

```bash
./server/gradlew -p server test
```

## 8. 운영/배포 고려사항

- F1 은 query 형태 변경이므로 query plan 영향을 받을 수 있다. 배포 전 staging 에서 `EXPLAIN` 결과를 확인하고, 새 query 가 기존보다 느려지는 경우 (인덱스 누락 등) 별도 인덱스 추가 plan 으로 분기한다.
- F2 는 SCAN 의 `count` hint 가 latency 대비 batch size 의 trade-off 이다. 256 으로 시작해 staging 의 `evictClubContent` 호출 latency 와 Redis CPU 를 비교한 뒤 조정한다.
- 두 변경 모두 backwards compatible 이며 deploy 순서 제약은 없다. 단일 배포로 함께 출시 가능.
- CHANGELOG `Unreleased` 에 "perf: consolidate public club stats query" 와 "perf: replace Redis KEYS with SCAN in read cache invalidation" 두 줄 추가.

## 9. 검증 기록 (1차 audit 의 false positive)

투명성 차원에서 기록한다. 동일 패턴의 오인이 재발하지 않도록, 각 항목의 "주장 / 코드 사실 / 판정 근거" 를 함께 남긴다.

| 원 주장 | 코드 사실 | 판정 근거 |
| --- | --- | --- |
| feedback controller 가 `sessionId` 만 받으므로 cross-club 노출 | `FeedbackDocumentService.getReadableFeedbackDocument` 는 `currentMember.clubId` 로 `findReadableSession(clubId, sessionId)` 조회 (`FeedbackDocumentService.kt:78`) | 다른 클럽의 sessionId 는 null 반환. 노출 경로 없음. |
| outbox `markPublished` 가 publish 보다 먼저 호출되어 at-most-once 가능 | `NotificationRelayService.publish(item)` 는 line 49 에서 publish, line 50 에서 markPublished. Producer 는 idempotence + acks=all (`NotificationKafkaConfiguration.kt:108-109`) | 순서가 올바르다. publish 실패 시 catch 분기로 markPublishFailed 로 전이. |
| session open/close 에 optimistic lock 없음 | `HostSessionWriteOperations.open` 은 `select id from clubs where id = ? for update` 로 클럽 row lock (line 365), close 는 `update sessions set state='CLOSED' where state='OPEN'` 조건부 update (line 429) | 클럽 단위 직렬화 + 조건부 update 로 race-safe. |
| Kafka listener 에 `@Transactional` 없어 메시지 손실 | listener 는 `@Transactional` 없지만 Kafka 설정이 `enable.auto.commit = false` 이고 `DefaultErrorHandler` + DLQ 적용 (`NotificationKafkaConfiguration.kt:80-86,128`). dispatch service 의 `persistPlannedDeliveries` 는 이미 존재 시 기존 결과 반환하는 idempotent 구현 (`NotificationDeliveryPlanningOperations.kt:27-31`) | 재전달 시 idempotent. listener throw 시 offset 미커밋. 메시지 손실 경로 없음. |
| mutation 엔드포인트가 SameSite=Lax 만으로 CSRF 보호 | mutation 엔드포인트는 `BffSecretFilter` 로 보호되며, 모든 요청은 `X-Readmates-Bff-Secret` custom header 가 필요 (`BffSecretFilter.kt:71-83`). cross-origin form 은 custom header 를 설정할 수 없다. BFF 는 추가로 same-origin Origin/Referer 검사 수행 (`functions/api/bff/[[path]].ts:70-91`) | BFF custom header 가 CSRF 방어선. CSRF token 없이도 안전. |
| MemberApprovalService 가 club 소유권 재검증 안 함 | `activateViewer` / `deactivateViewer` 는 모두 `host.clubId` 와 `membershipId` 를 store port 에 전달 (`MemberApprovalService.kt:49,63`). port 는 `(club_id, membership_id)` 매치를 SQL 에서 검증 | club 경계 검증 동작. |
| feedback listing 이 `isActive` 만 보고 비활성 멤버 접근 허용 | host 분기는 club 전체 문서, non-host 분기는 `session_participants.attendance_status='ATTENDED'` AND `participation_status='ACTIVE'` 조건의 inner join (`JdbcFeedbackDocumentStoreAdapter.kt:94-100`) | 비활성 멤버는 listing 에서도 제외됨. |
| Kafka 재전달 시 `dedupe_key` unique 위반으로 재시도 실패 | `persistPlannedDeliveries` 는 existing deliveries 조회 후 비어있지 않으면 그대로 반환 (`NotificationDeliveryPlanningOperations.kt:27-31`). insert 는 `insert ignore` (`line 436`) | 재전달은 idempotent. 위반 경로 없음. |
| publication 패널 더블 submit 가능 | 버튼 `disabled={!session || recordSaveInFlight}` 와 라벨 `recordSaveInFlight ? "저장하는 중" : "저장"` (`publication-panel.tsx:135-139`) | in-flight 가 비활성화 신호. |
| 질문/한줄평 optimistic update rollback 부재 | `runSave` 는 saving → saved 또는 saving → error 만 토글 (`current-session-page.tsx:238-247`). 질문/한줄평 경로에 optimistic update 자체가 없음 | rollback 할 대상 없음. RSVP 만 별도 optimistic 경로에서 rollback 처리. |
| host dashboard 색상만으로 상태 구분 | `hostAlertMetrics` 가 `desktopLabel`, `mobileLabel`, `value` 를 함께 노출. badge class 는 ok/warn/accent 외에도 텍스트 라벨로 의미 전달 (`dashboard-helpers.ts:36-78,96-110`) | 텍스트 라벨 + 카운트가 1차 정보, 색상은 보조. |
| preview TTL race 로 silent fail | `HostManualNotificationService.confirm` 은 `findConsumedManualDispatch` 로 이미 소비된 preview 를 idempotent 하게 반환하고, 미소비 시 `confirmManualDispatch` 의 null 반환을 `previewExpired()` 로 매핑 (`HostManualNotificationService.kt:157-213,377-381`) | silent fail 경로 없음. |
| BFF secret 회전 리스트의 중복/순서 검증 부재 | `BffSecretFilter` 는 secret 비교에 `SecretComparator.firstMatchingIndex` 로 상수시간 비교를 수행하고 alias 를 부여 (`BffSecretFilter.kt:138-144`). 중복은 매칭 정확성에 영향 없음 | 의도된 운영 모델. |
| 알림함 deepLink fallback 이 동일 페이지로 회귀 | (재현 시 사용자 경험 비교 필요, 명시적 결함은 아님) | 코드 기준으로 명백한 defect 아님. |

## 10. 변경 비용 추정

- F1a (publicStats 통합): 30분. RowMapper 추가 + 기존 메서드 교체 + 테스트 1~2개.
- F1b (publicSessions 사전 집계): 1~2시간. SQL 작성 + EXPLAIN 검증 + 기존 fixture 테스트 통과 확인 + 새 fixture 1~2개.
- F2 (SCAN 전환): 1시간. 헬퍼 함수 1개 + 호출부 2곳 교체 + testcontainer 시나리오 2~3개.
- 합계 약 3~4시간. PR 1개로 묶어도 무방.

## 11. 후속 작업 후보 (이 plan 의 비목표)

- 다른 Redis adapter (rate limit, public read cache 읽기측, auth session cache, manual notification preview) 의 SCAN 사용 일관성 점검.
- `publicHighlights` 와 `publicOneLiners` 의 `session_participants` join 패턴 재검토 (active_participants CTE 또는 helper view 로 share 가능 여부).
- 공개 read 경로에 query-level metric (Micrometer Timer) 추가해 캐시 미스 시 latency 추적.
