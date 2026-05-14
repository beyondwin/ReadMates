# ReadMates v1.9 Quality Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land two verified hardening fixes from the v1.9.0 post-release audit without changing public read contracts: consolidate the public club stats / sessions queries to reduce DB round-trips and correlated subqueries, and replace Redis `KEYS` with `SCAN` in read-cache invalidation.

**Architecture:** All changes stay inside outbound adapters (`publication/adapter/out/persistence`, `shared/adapter/out/redis`). Ports, application services, domain types, and frontend code are untouched.

**Tech Stack:** Kotlin, Spring Boot, JdbcTemplate, MySQL 8, Spring Data Redis, JUnit 5, Testcontainers, ArchUnit.

---

## Source Documents

- Detailed spec: `docs/superpowers/specs/2026-05-15-readmates-quality-followup-spec.md`
- Architecture source of truth: `docs/development/architecture.md`
- Surface guide: `docs/agents/server.md`

## File Map

### Modify

- `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`: consolidate `publicStats` into a single SELECT; replace `publicSessions` correlated EXISTS subqueries with pre-aggregated joins.
- `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt`: replace `redisTemplate.keys(pattern)` with a SCAN-based helper.

### Modify (tests, only if existing fixtures are insufficient)

- `server/src/test/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapterTest.kt` (or equivalent existing test class): add fixture scenarios covering highlight/one-liner counts with mixed `LEFT`/active members and PUBLIC/PRIVATE one-liner visibility.
- `server/src/test/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapterTest.kt` (or create co-located with the adapter under `redis/`): SCAN-based eviction scenarios.

### Modify (docs)

- `CHANGELOG.md` — add two lines under `Unreleased`.

### Create

None.

---

## Task 1: Preflight Scope Check

**Files:**
- Read only: targets above and existing test scaffolding.

- [ ] **Step 1: Confirm branch state**

```bash
git status --short --branch
git log --oneline -1
```

Expected: clean tree on `main` at `5e74f4d docs: prepare v1.9.0 release` (or a feature branch off it). If the tree has unrelated edits, preserve them.

- [ ] **Step 2: Confirm the current facts the spec is based on**

```bash
rg -n "queryForObject" server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt
rg -n "redisTemplate\.keys" server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt
rg -n "select count" server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt
```

Expected:
- `JdbcPublicQueryAdapter.kt` shows 3 separate `queryForObject` for sessions/books/members counts inside `publicStats(...)`, and a `(select count(*) from highlights ...)` + `(select count(*) from one_line_reviews ...)` pair inside `publicSessions(...)`.
- `RedisReadCacheInvalidationAdapter.kt` shows `redisTemplate.keys("public:club:$clubId:session:*:v1")` and `redisTemplate.keys("notes:club:$clubId:session:*:feed:v1")`.

If the code state has shifted, stop and update the spec before continuing.

- [ ] **Step 3: Verify MySQL version supports CTE (optional but useful for F1b)**

```bash
rg -n "mysql:" compose.yml deploy 2>/dev/null
```

If production targets MySQL 8.x, CTE is fine. If 5.7 is still in scope anywhere, plan to use derived tables (inline subqueries) instead of CTE in F1b.

---

## Task 2: F1a — Consolidate `publicStats()` into a single SELECT

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Modify or add: corresponding `JdbcPublicQueryAdapter` test.

- [ ] **Step 1: Write a failing test for the consolidated stats path**

The test should fixture one ACTIVE club with:
- 3 PUBLISHED + PUBLIC sessions covering 2 distinct `book_title` values.
- 1 PUBLISHED + PRIVATE session (must be excluded from sessions and books counts).
- 1 ACTIVE membership + 1 LEFT membership (only ACTIVE counted).

Assert `loadClub(clubSlug)` returns `PublicClubStatsResult(sessions=3, books=2, members=1)`.

If an equivalent test already exists, add a regression assertion that the call uses **one** `JdbcTemplate.query*` invocation. The simplest approach is to wrap `JdbcTemplate` with a counting spy and assert `invocationCount == 1` for `publicStats(...)`. If wrapping is too invasive, skip the invocation-count assertion and rely on the integration check below.

Run the test and confirm it fails because the current implementation issues 3 queries.

- [ ] **Step 2: Replace `publicStats()` body with the consolidated query**

Open `JdbcPublicQueryAdapter.kt`. Replace the three `queryForObject` calls in `publicStats(jdbcTemplate, clubId)` with a single `jdbcTemplate.queryForObject(sql, rowMapper, clubId, clubId, clubId)` returning a `PublicClubStatsResult`.

Use this exact SQL form (column aliases `session_count`, `book_count`, `member_count` so the RowMapper reads by label):

```kotlin
private fun publicStats(
    jdbcTemplate: JdbcTemplate,
    clubId: UUID,
): PublicClubStatsResult =
    jdbcTemplate.queryForObject(
        """
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
        """.trimIndent(),
        { rs, _ ->
            PublicClubStatsResult(
                sessions = rs.getInt("session_count"),
                books = rs.getInt("book_count"),
                members = rs.getInt("member_count"),
            )
        },
        clubId.dbString(),
        clubId.dbString(),
        clubId.dbString(),
    ) ?: PublicClubStatsResult(sessions = 0, books = 0, members = 0)
```

Rationale: column-label access avoids index drift; the `?: PublicClubStatsResult(0,0,0)` fallback preserves the previous behavior when the row is somehow null.

- [ ] **Step 3: Run the failing test and confirm it now passes**

```bash
./server/gradlew -p server test --tests "com.readmates.publication.adapter.out.persistence.JdbcPublicQueryAdapter*"
```

If a `null` row issue surfaces (MySQL returning no row), the `?:` fallback handles it. Confirm with the test.

- [ ] **Step 4: Validate query plan in staging-like environment**

If a `docker compose` MySQL is available locally:

```bash
docker compose exec mysql mysql -uroot -p${MYSQL_ROOT_PASSWORD:-readmates} readmates -e "
explain select
  (select count(*) from sessions join public_session_publications on public_session_publications.session_id = sessions.id and public_session_publications.club_id = sessions.club_id where sessions.club_id = '<club-uuid>' and sessions.state = 'PUBLISHED' and public_session_publications.visibility = 'PUBLIC') as session_count,
  (select count(distinct sessions.book_title) from sessions join public_session_publications on public_session_publications.session_id = sessions.id and public_session_publications.club_id = sessions.club_id where sessions.club_id = '<club-uuid>' and sessions.state = 'PUBLISHED' and public_session_publications.visibility = 'PUBLIC') as book_count,
  (select count(*) from memberships where club_id = '<club-uuid>' and status = 'ACTIVE') as member_count
"
```

Expected: each scalar subquery uses indexes on `sessions(club_id, state)`, `public_session_publications(session_id, club_id, visibility)`, `memberships(club_id, status)`. If any subquery shows a full scan, stop and open a follow-up plan for index work; do not merge this task.

If local docker is not available, capture this EXPLAIN during the staging deploy review.

---

## Task 3: F1b — Replace correlated EXISTS subqueries in `publicSessions()`

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt`
- Modify or add: tests as above.

- [ ] **Step 1: Add fixture-based tests for highlight/one-liner counting**

Required scenarios for one PUBLISHED + PUBLIC session:
- 2 highlights from ACTIVE members + 1 highlight from a LEFT member → expect `highlight_count = 2`.
- 1 highlight with `membership_id IS NULL` (system / host-curated) → counted regardless of participation → expect `highlight_count` includes it.
- 2 one-liners PUBLIC from ACTIVE participants + 1 one-liner PRIVATE + 1 one-liner from a LEFT member → expect `one_liner_count = 2`.

If equivalent tests exist, run them once before the change to capture baseline counts.

Run; expect existing implementation to produce the same numbers. The point of writing the tests first is to lock current behavior.

- [ ] **Step 2: Rewrite `publicSessions()` using pre-aggregated joins**

In MySQL 8, the CTE form below is acceptable. If the team prefers to avoid CTE, the same logic can be inlined as derived tables — semantics must be identical.

```kotlin
private fun publicSessions(
    jdbcTemplate: JdbcTemplate,
    clubId: UUID,
): List<PublicSessionSummaryResult> =
    jdbcTemplate.query(
        """
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
        """.trimIndent(),
        { rs, _ ->
            PublicSessionSummaryResult(
                sessionId = rs.uuid("id").toString(),
                sessionNumber = rs.getInt("number"),
                bookTitle = rs.getString("book_title"),
                bookAuthor = rs.getString("book_author"),
                bookImageUrl = rs.getString("book_image_url"),
                date = rs.getObject("session_date", LocalDate::class.java).toString(),
                summary = rs.getString("public_summary"),
                highlightCount = rs.getInt("highlight_count"),
                oneLinerCount = rs.getInt("one_liner_count"),
            )
        },
        clubId.dbString(),
        clubId.dbString(),
        clubId.dbString(),
        clubId.dbString(),
    )
```

Note: placeholders are 4 (active_participants, highlights, one_line_reviews, sessions). All four bind the same `clubId`.

- [ ] **Step 3: Re-run the publication tests**

```bash
./server/gradlew -p server test --tests "com.readmates.publication.*"
```

All baseline counts from Step 1 must remain identical. If any count differs, revert the query and audit the join predicates against the original EXISTS clauses.

- [ ] **Step 4: Validate query plan**

```bash
docker compose exec mysql mysql -uroot -p${MYSQL_ROOT_PASSWORD:-readmates} readmates -e "explain <the new query with a concrete club uuid>"
```

Expected: `active_participants` resolves via the existing `session_participants(club_id, participation_status, ...)` composite index. `highlights` and `one_line_reviews` aggregates use `(club_id, session_id)` ranges. If either derived table forces a full scan, stop and open a follow-up plan for index work.

If local docker is not available, capture this EXPLAIN during staging deploy.

---

## Task 4: F2 — Replace Redis `KEYS` with `SCAN`

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt`
- Modify or add: corresponding test.

- [ ] **Step 1: Write a failing test for SCAN-based eviction**

Using the existing testcontainer Redis fixture (look under `server/src/test/.../redis` or `support/`):

Scenario A — bulk session keys for one club:
1. SET 50 keys matching `public:club:<clubId>:session:<i>:v1` (i in 1..50).
2. SET 5 keys matching `public:club:<otherClubId>:session:<i>:v1`.
3. Call `evictClubContent(clubId)`.
4. Assert all 50 of clubId's session keys are gone, plus `public:club:<clubId>:home:v1`.
5. Assert the 5 otherClub keys remain.

Scenario B — notes keys:
1. SET 30 keys matching `notes:club:<clubId>:session:<i>:feed:v1`.
2. SET 1 key `notes:club:<clubId>:feed:v1` and 1 key `notes:club:<clubId>:sessions:v1`.
3. Call `evictClubContent(clubId)` (same call covers notes via `evictNotesContent`).
4. Assert all 32 keys for clubId are gone.

Scenario C — KEYS command must not be issued:
- If feasible, use a Redis MONITOR-like probe or assert the adapter does not call any method that emits `KEYS`. If MONITOR is impractical, accept the indirect coverage of A+B.

Run; expect Scenario A and B to pass with the current implementation (KEYS works correctly, just slowly) — these tests serve as behavioral guardrails before the rewrite.

- [ ] **Step 2: Add a SCAN helper and replace `keys(...)` calls**

In `RedisReadCacheInvalidationAdapter.kt`, add a private helper and replace both call sites:

```kotlin
private companion object {
    private const val SCAN_BATCH_SIZE = 256L
}

private fun scanKeys(pattern: String): Set<String> {
    val options = ScanOptions.scanOptions().match(pattern).count(SCAN_BATCH_SIZE).build()
    val collected = mutableSetOf<String>()
    redisTemplate.execute<Unit> { connection ->
        connection.keyCommands().scan(options).use { cursor ->
            while (cursor.hasNext()) {
                collected.add(String(cursor.next(), Charsets.UTF_8))
            }
        }
        null
    }
    return collected
}
```

Then in `evictPublicContent` and `evictNotesContent`, replace:

```kotlin
redisTemplate.keys("public:club:$clubId:session:*:v1")?.let(publicKeys::addAll)
```

with:

```kotlin
publicKeys.addAll(scanKeys("public:club:$clubId:session:*:v1"))
```

and likewise for the notes pattern. Keep the existing `runCatching { ... }.onFailure { recordRedisFailure(...) }` wrapper.

Required imports to add: `org.springframework.data.redis.core.ScanOptions`.

- [ ] **Step 3: Re-run the eviction tests**

```bash
./server/gradlew -p server test --tests "com.readmates.shared.adapter.out.redis.*"
```

All scenarios from Step 1 must pass. SCAN does not guarantee a single-pass view, but for a bounded keyspace mid-test the results are deterministic.

- [ ] **Step 4: Smoke-check that production-style host session lifecycle still evicts**

```bash
./server/gradlew -p server test --tests "com.readmates.session.application.service.HostSessionLifecycleServiceTest"
./server/gradlew -p server test --tests "com.readmates.publication.*"
```

These cover the call path that triggers `evictClubContent`. They should not regress.

---

## Task 5: Architecture and Regression Verification

**Files:** read only.

- [ ] **Step 1: Run architecture tests**

```bash
./server/gradlew -p server test --tests "com.readmates.architecture.*"
```

Expected: green. No new boundary exceptions introduced; we only changed query strings and added a Redis import that already lives in the redis adapter layer.

- [ ] **Step 2: Run the full server test suite once**

```bash
./server/gradlew -p server clean test
```

Expected: green. Investigate any non-green run before continuing.

- [ ] **Step 3: Build the public release candidate to confirm no doc / safety drift**

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: candidate builds; scanner passes. No frontend changes, so this is precautionary.

---

## Task 6: Documentation

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add Unreleased entries**

Under the `## [Unreleased]` heading, add:

```markdown
### Changed
- perf: consolidate `publicStats` SELECTs into a single round-trip and replace correlated EXISTS subqueries in `publicSessions` with pre-aggregated joins (server/publication).
- perf: replace Redis `KEYS` with SCAN-based iteration in read-cache invalidation (server/shared/redis).
```

Match the existing CHANGELOG voice. If `### Changed` already exists under `Unreleased`, append; do not duplicate the heading.

- [ ] **Step 2: Confirm spec ↔ plan cross-references**

```bash
rg -n "2026-05-15-readmates-quality-followup" docs/superpowers
```

Expected: this plan references the spec file by name in the "Source Documents" section; the spec exists at `docs/superpowers/specs/2026-05-15-readmates-quality-followup-spec.md`.

---

## Task 7: PR Preparation

**Files:** none.

- [ ] **Step 1: Stage the change**

```bash
git status --short
git add server/src/main/kotlin/com/readmates/publication/adapter/out/persistence/JdbcPublicQueryAdapter.kt
git add server/src/main/kotlin/com/readmates/shared/adapter/out/redis/RedisReadCacheInvalidationAdapter.kt
# test files as added
git add CHANGELOG.md
git add docs/superpowers/specs/2026-05-15-readmates-quality-followup-spec.md
git add docs/superpowers/plans/2026-05-15-readmates-quality-followup-implementation-plan.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
perf: consolidate public read SQL and replace Redis KEYS with SCAN

- publicStats: 3 SELECTs → 1 SELECT with scalar subqueries
- publicSessions: correlated EXISTS subqueries → pre-aggregated joins
- read-cache invalidation: redisTemplate.keys → SCAN-based iteration

Verified scope; see docs/superpowers/specs/2026-05-15-readmates-quality-followup-spec.md
for the audit trail and false-positive ledger from the v1.9.0 post-release review.
EOF
)"
```

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "perf: public read SQL + Redis SCAN (v1.9 followup)" --body "$(cat <<'EOF'
## Summary
- Consolidates `publicStats` round-trips from 3 → 1.
- Replaces correlated EXISTS subqueries in `publicSessions` with pre-aggregated joins.
- Replaces Redis `KEYS` with `SCAN` in read-cache invalidation.

Spec and false-positive ledger: `docs/superpowers/specs/2026-05-15-readmates-quality-followup-spec.md`.

## Test plan
- [ ] `./server/gradlew -p server test --tests "com.readmates.publication.*"`
- [ ] `./server/gradlew -p server test --tests "com.readmates.shared.adapter.out.redis.*"`
- [ ] `./server/gradlew -p server test --tests "com.readmates.architecture.*"`
- [ ] `./server/gradlew -p server clean test`
- [ ] EXPLAIN on the new `publicStats` and `publicSessions` queries (captured in PR description or staging review)
- [ ] `./scripts/build-public-release-candidate.sh && ./scripts/public-release-check.sh .tmp/public-release-candidate`

## Out of scope
14 finding candidates from the initial parallel-subagent audit were verified as false positives during spec writing; they are recorded in §9 of the spec with code-level rebuttals. No remediation needed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Risk Register

| Risk | Mitigation |
| --- | --- |
| Consolidated `publicStats` returns different counts due to a placeholder ordering bug | RowMapper reads by column label, not index; Step 1 test fixture exercises the exact counts. |
| `publicSessions` CTE not supported in target MySQL version | Preflight Step 3 checks; if 5.7 still in scope, inline the CTE as derived tables in Step 2. |
| New `publicSessions` query forces a full table scan due to missing index | Step 4 EXPLAIN check stops the merge before staging. |
| SCAN cursor leaks if `use` block not honored | Helper uses `cursor.use { ... }`. Test Scenario A's deterministic count flushes any leak indirectly. |
| Behavior diverges between local MySQL and Aurora-style production | Capture EXPLAIN in both environments before promoting to production. |

## Out of Scope (recorded for clarity)

- All 14 false-positive findings from the original audit. See spec §9 for the rebuttal table.
- Index changes (separated to a follow-up plan if EXPLAIN reveals gaps).
- Extending SCAN usage to other Redis adapters (separate plan).
- Frontend, BFF, OAuth, or notification pipeline changes.
