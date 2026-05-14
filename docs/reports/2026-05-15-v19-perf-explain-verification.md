# v1.9 perf follow-up — `publicStats` / `publicSessions` EXPLAIN 검증

- 일자: 2026-05-15
- 대상 변경: PR #6 (`perf: public read SQL + Redis SCAN`) 후속.
- 변경 위치: `server/.../publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- 검증 환경: 로컬 docker MySQL 8.4 (`compose.yml` `mysql` 서비스). Flyway `V1..V28` 일괄 적용, 시드 30 sessions / 30 pubs / 150 session_participants / 180 highlights / 120 one_line_reviews / 50 memberships, `ANALYZE TABLE` 수행 후 측정.
- ReadMates는 local + 운영(OCI MySQL HeatWave) 2개 환경 구조이므로 별도 staging 환경 없음. 운영 row 수 기준 재확인은 본 문서 끝의 **운영 DB 재현 절차**로 운영 또는 export 복구한 비운영 rehearsal DB에서 동일 SQL을 실행해 확인.

## 결과 요약

| Query | sessions | session_participants | highlights | one_line_reviews | 회귀 위험 |
|-------|----------|----------------------|------------|------------------|-----------|
| publicStats | PRIMARY eq_ref | n/a | n/a | n/a | 없음 |
| publicSessions | PRIMARY eq_ref | `session_participants_club_session_status_member_idx` covering index lookup | scan (small N, derived materialize) | unique `session_id` eq_ref | 없음 |

핵심 path(`sessions` / `session_participants` / `one_line_reviews`)에 **full scan이 없음**. PR description의 acceptance criteria 충족.

## EXPLAIN 발췌 (publicStats)

```
-> Select #2 (subquery in projection; uncacheable)
    -> Aggregate: count(0)
        -> Nested loop inner join
            -> Filter: visibility='PUBLIC' AND club_id=@cid
                -> Table scan on public_session_publications (rows=30)
            -> Filter: state='PUBLISHED' AND club_id=@cid
                -> Single-row index lookup on sessions using PRIMARY (id=pubs.session_id)
-> Select #4 (subquery in projection; uncacheable)
    -> Aggregate: count(0)
        -> Filter: status='ACTIVE' AND club_id=@cid
            -> Table scan on memberships (rows=50)
```

- `sessions`: PRIMARY eq_ref. `sessions_club_state_visibility_number_idx`는 후보로 인식되지만 driver가 pubs 측이라 PK eq_ref가 더 저렴.
- `public_session_publications` / `memberships`: 30~50 row 수준에서는 ALL scan이 index lookup보다 저렴하다고 optimizer 판단. 후보 키는 `possible_keys`에 있어 row 수가 늘면 index 사용으로 전환됨.

## EXPLAIN 발췌 (publicSessions)

```
-> Limit: 6 row(s)
    -> Sort: sessions.number DESC, limit input to 6 row(s) per chunk
        -> Nested loop left join
            -> Nested loop left join
                -> Nested loop inner join (sessions ⋈ pubs)
                    -> Filter: pubs.visibility='PUBLIC' AND club_id=@cid
                        -> Table scan on pubs (rows=30)
                    -> Filter: sessions.state='PUBLISHED' AND club_id=@cid
                        -> Single-row index lookup on sessions using PRIMARY (id=pubs.session_id)
                -> Index lookup on highlight_counts using <auto_key0>
                    -> Materialize  (derived: highlights left join active_participants)
                        -> Filter: highlights.club_id=@cid
                            -> Table scan on highlights (rows=180)
                        -> Covering index lookup on session_participants using
                           session_participants_club_session_status_member_idx (club_id=@cid)
            -> Index lookup on one_liner_counts using <auto_key0>
                -> Materialize  (derived: olr ⋈ active_participants)
                    -> Single-row index lookup on one_line_reviews using session_id
```

- `sessions`: PRIMARY eq_ref ✅
- `session_participants`: **covering index lookup** on `session_participants_club_session_status_member_idx (club_id, session_id, participation_status, membership_id)` ✅
- `one_line_reviews`: unique `(session_id, membership_id)` eq_ref ✅
- `highlights`: 180 row scan + derived materialize. 후보 키 `highlights_club_session_created_idx (club_id, session_id, ...)`는 인식되나 optimizer가 작은 N에서 scan 선택. 운영 row 수가 늘면 index 전환.

## 회귀가 아닌 항목 (의도된 동작)

- `Using filesort` for `sessions.number DESC` — outer query에 ORDER BY가 있고 join 결과를 정렬해야 하므로 filesort. LIMIT 6 + 작은 입력 크기라 비용 미미.
- `public_session_publications` table scan — `public_session_publications` 는 `unique(session_id)`만 갖고 `(club_id, visibility)` 단독 index가 없음. 1 row / session / club 형태라 전체 row 수가 작아 실용적 문제 없음. 멀티 클럽 확장으로 pubs row가 수십만 단위로 증가하기 전엔 별도 index 불요.

## 운영 DB 재현 절차

운영 MySQL 콘솔 또는 export로 복구한 비운영 rehearsal DB(`docs/deploy/oci-mysql-heatwave.md` 참고)에서 아래 SQL 그대로 실행 (`@cid`만 실제 club UUID로 치환). EXPLAIN은 read-only이므로 운영 DB 직접 실행이 가능하나, 가능하면 export 복구한 rehearsal DB 사용을 권장:

```sql
set @cid = '<production-club-uuid>';

-- publicStats
explain format=tree
select
  (select count(*) from sessions
     join public_session_publications p
       on p.session_id = sessions.id and p.club_id = sessions.club_id
     where sessions.club_id = @cid and sessions.state = 'PUBLISHED' and p.visibility = 'PUBLIC') as session_count,
  (select count(distinct sessions.book_title) from sessions
     join public_session_publications p
       on p.session_id = sessions.id and p.club_id = sessions.club_id
     where sessions.club_id = @cid and sessions.state = 'PUBLISHED' and p.visibility = 'PUBLIC') as book_count,
  (select count(*) from memberships where club_id = @cid and status = 'ACTIVE') as member_count\G

-- publicSessions
explain format=tree
with active_participants as (
  select session_id, club_id, membership_id from session_participants
  where club_id = @cid and participation_status = 'ACTIVE'
)
select sessions.id, sessions.number, sessions.book_title, sessions.book_author, sessions.book_image_url,
       sessions.session_date, p.public_summary,
       coalesce(hc.cnt, 0) as highlight_count, coalesce(oc.cnt, 0) as one_liner_count
from sessions
join public_session_publications p on p.session_id = sessions.id and p.club_id = sessions.club_id
left join (
  select h.session_id, count(*) as cnt
  from highlights h
  left join active_participants ap on ap.session_id = h.session_id
    and ap.club_id = h.club_id and ap.membership_id = h.membership_id
  where h.club_id = @cid and (h.membership_id is null or ap.membership_id is not null)
  group by h.session_id
) hc on hc.session_id = sessions.id
left join (
  select o.session_id, count(*) as cnt
  from one_line_reviews o
  join active_participants ap on ap.session_id = o.session_id
    and ap.club_id = o.club_id and ap.membership_id = o.membership_id
  where o.club_id = @cid and o.visibility = 'PUBLIC'
  group by o.session_id
) oc on oc.session_id = sessions.id
where sessions.club_id = @cid and sessions.state = 'PUBLISHED' and p.visibility = 'PUBLIC'
order by sessions.number desc
limit 6\G
```

### 합격 기준

1. `sessions` 접근이 `eq_ref` 또는 `ref` (PRIMARY / `id` unique / `sessions_club_state_visibility_number_idx`). type=ALL 이면 회귀.
2. `session_participants` 접근이 `session_participants_club_session_status_member_idx` 사용 (`ref` 또는 `index`). type=ALL 이면 회귀.
3. `one_line_reviews` 접근이 `session_id` unique 키 (`eq_ref`) 또는 club_session_visibility_member 인덱스. type=ALL 이면 회귀.
4. `highlights` 는 row 수가 적으면 ALL이 정상. 운영 row 수 ≥ 10k 인데도 ALL이면 `highlights_club_session_created_idx` 인식 여부와 cardinality 통계(`analyze table highlights`) 갱신 후 재측정.
