# ReadMates Real Data Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace remaining ReadMates design sample data with DB-backed data derived from `recode/` sessions 1-6, and wire public, member, host, and report surfaces to real APIs.

**Architecture:** Keep Spring Boot as the source of truth for seed data, authorization, and read/write APIs. Keep Next.js as a thin BFF-driven UI layer that renders API payloads or empty states, never design sample fallbacks. Do not add new database tables; use the existing auth/session/note/publication/report tables.

**Tech Stack:** Kotlin, Spring Boot 4, Spring Security, Spring JDBC, Flyway, PostgreSQL, MockMvc, Next.js App Router, React, TypeScript, Vitest, Playwright.

---

## Current Working Tree Guard

Before starting implementation, run:

```bash
git status --short
```

Expected current dirty files from prior work may include:

```text
 M front/app/(app)/app/page.tsx
 M front/features/archive/components/notes-feed-page.tsx
 M front/features/member-home/components/member-home.tsx
 M front/tests/unit/member-home.test.tsx
?? front/tests/unit/notes-feed-page.test.tsx
```

Treat those as user or prior-session changes. Do not revert them. If a task needs to edit the same file, inspect the current content first and preserve unrelated edits.

## File Map

### Data And Seed

- Read: `recode/251126 1차.txt` through `recode/260415 6차.txt` - source for attendance and conversation-derived summaries.
- Create: `docs/superpowers/specs/2026-04-19-readmates-recode-analysis.md` - normalized attendance, speaker aliases, public summaries, highlights, one-liners, and check-in seed source.
- Modify: `server/src/main/resources/db/dev/R__readmates_dev_seed.sql` - idempotent dev seed data.
- Test: `server/src/test/kotlin/com/readmates/archive/api/ReadmatesSeedDataTest.kt` - seed integrity tests.

### Backend APIs

- Modify: `front/shared/api/readmates.ts` only after backend response shapes are locked.
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt` - current session hydrate, host dashboard/detail, host update helpers.
- Modify: `server/src/main/kotlin/com/readmates/session/api/CurrentSessionController.kt` - returns expanded current-session payload.
- Modify: `server/src/main/kotlin/com/readmates/note/api/ReviewController.kt` - persists one-line and long reviews.
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt` - archive side tabs, notes feed metadata, public read models.
- Modify: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt` - authenticated archive endpoints.
- Modify: `server/src/main/kotlin/com/readmates/note/api/NotesFeedController.kt` - expanded feed item payload.
- Create: `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt` - public club and public session APIs.
- Modify: `server/src/main/kotlin/com/readmates/session/api/HostDashboardController.kt` - DB-backed host metrics.
- Modify: `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt` - host detail and update.
- Modify: `server/src/main/kotlin/com/readmates/session/api/AttendanceController.kt` - DB-backed attendance confirmation.
- Modify: `server/src/main/kotlin/com/readmates/session/api/PublicationController.kt` - DB-backed publication upsert.
- Create: `server/src/main/kotlin/com/readmates/report/application/ReportRepository.kt` - report metadata persistence and permission queries.
- Modify: `server/src/main/kotlin/com/readmates/report/api/HostReportController.kt` - stores report metadata.
- Modify: `server/src/main/kotlin/com/readmates/report/api/ReportController.kt` - member-scoped list/content.

### Backend Tests

- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`
- Create: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`
- Replace or rewrite DB-backed parts of: `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/report/api/HostReportControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/report/api/ReportControllerTest.kt`

### Frontend

- Modify: `front/shared/api/readmates.ts` - response types for current board, archive tabs, public pages, host detail, reports.
- Modify: `front/app/(app)/app/session/current/page.tsx`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/app/(app)/app/archive/page.tsx`
- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/app/(app)/app/notes/page.tsx`
- Modify: `front/features/archive/components/notes-feed-page.tsx`
- Modify: `front/app/(app)/app/me/page.tsx`
- Modify: `front/features/archive/components/my-page.tsx`
- Modify: `front/app/(public)/page.tsx`
- Modify: `front/features/public/components/public-home.tsx`
- Modify: `front/app/(public)/about/page.tsx`
- Modify: `front/features/public/components/public-club.tsx`
- Modify: `front/app/(public)/sessions/[sessionId]/page.tsx`
- Modify: `front/features/public/components/public-session.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/app/(app)/app/host/page.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/app/(app)/app/host/sessions/[sessionId]/edit/page.tsx`
- Modify: `front/app/(app)/app/host/sessions/new/page.tsx`
- Modify: `front/features/host/components/host-session-editor.tsx`

### Frontend Tests

- Modify: `front/tests/unit/current-session.test.tsx`
- Modify: `front/tests/unit/archive-page.test.tsx`
- Modify: `front/tests/unit/notes-feed-page.test.tsx`
- Modify: `front/tests/unit/my-page.test.tsx`
- Modify: `front/tests/unit/public-home.test.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify: `front/tests/e2e/public-auth-member-host.spec.ts`
- Modify: `front/tests/e2e/dev-login-session-flow.spec.ts`

---

## Task 1: Normalize Recode-Derived Seed Source

**Files:**
- Read: `recode/251126 1차.txt`
- Read: `recode/251227 2차.txt`
- Read: `recode/260121 3차.txt`
- Read: `recode/260225 4차.txt`
- Read: `recode/260318 5차.txt`
- Read: `recode/260415 6차.txt`
- Create: `docs/superpowers/specs/2026-04-19-readmates-recode-analysis.md`

- [x] **Step 1: Extract attendance metadata**

Run:

```bash
for f in recode/*.txt; do printf '\n--- %s\n' "$f"; sed -n '1,5p' "$f"; done
```

Expected: each file prints a title line, date/duration line, and participant line. Use the participant line as the attendance source.

- [x] **Step 2: Create the analysis document**

Create `docs/superpowers/specs/2026-04-19-readmates-recode-analysis.md` with this structure and these normalized values:

```markdown
# ReadMates Recode Analysis

작성일: 2026-04-19

## Speaker Aliases

| Raw name | Normalized member |
|---|---|
| 김호스트 | 김호스트 |
| 호스트 | 김호스트 |
| 안멤버1 | 안멤버1 |
| 멤버1 | 안멤버1 |
| 최멤버2 | 최멤버2 |
| 멤버2 | 최멤버2 |
| 김멤버3 | 김멤버3 |
| 멤버3 | 김멤버3 |
| 송멤버4 | 송멤버4 |
| 멤버4 | 송멤버4 |
| 송멤버4 | 송멤버4 |
| 이멤버5 | 이멤버5 |
| 멤버5 | 이멤버5 |

## Attendance

| Session | Attended | Absent |
|---:|---|---|
| 1 | 김호스트, 안멤버1, 이멤버5 | 최멤버2, 김멤버3, 송멤버4 |
| 2 | 김호스트, 최멤버2, 이멤버5 | 안멤버1, 김멤버3, 송멤버4 |
| 3 | 김호스트, 최멤버2, 이멤버5, 김멤버3, 안멤버1, 송멤버4 | 없음 |
| 4 | 김호스트, 최멤버2, 김멤버3, 송멤버4 | 안멤버1, 이멤버5 |
| 5 | 김호스트, 송멤버4, 최멤버2, 안멤버1 | 김멤버3, 이멤버5 |
| 6 | 김호스트, 이멤버5, 최멤버2 | 안멤버1, 김멤버3, 송멤버4 |

## Session Summaries

| Session | Public summary |
|---:|---|
| 1 | 팩트풀니스 모임에서는 소득 4단계, 10가지 본능, 데이터 기반 사고가 실제 일상 판단과 얼마나 멀리 있는지 나눴습니다. 익숙한 인상과 사실 확인 사이에서 각자가 자주 빠지는 편향을 돌아본 시간이었습니다. |
| 2 | 냉정한 이타주의자 모임에서는 좋은 의도와 실제 효과 사이의 긴장, 효율이라는 기준이 삶의 선택에 들어올 때 생기는 불편함을 이야기했습니다. 기부, 직업, 취미, 인간관계까지 효과를 따지는 태도가 어디까지 유효한지 토론했습니다. |
| 3 | 우리가 겨울을 지나온 방식 모임에서는 돌봄과 생계가 가족에게 집중되는 현실, 극한 상황의 선택, 소설 속 유머와 몰입의 거리를 함께 짚었습니다. 각자는 가장 오래 남은 장면을 통해 가족과 생존의 의미를 다시 물었습니다. |
| 4 | 내 안에서 나를 만드는 것들 모임에서는 공정한 관찰자, 인정 욕구, 이기와 이타의 구분을 중심으로 대화했습니다. 나를 만드는 기준이 내면의 판단인지 사회와 경험의 축적인지 서로 다른 관점으로 풀어 보았습니다. |
| 5 | 지대넓얕 무한 모임에서는 의식, 신념, 선택, 후회, 명상처럼 추상적인 주제를 각자의 이해 수준에서 붙잡아 보았습니다. 확신을 의심하는 태도가 더 나은 이해인지 끝없는 불안인지 의견을 나눴습니다. |
| 6 | 가난한 찰리의 연감 모임에서는 찰리 멍거의 투자 원칙, 모르는 영역을 피하는 태도, 다학문적 사고와 실행의 균형을 다뤘습니다. 반복과 번역의 난점에도 각자 남은 판단 원칙을 정리했습니다. |
```

- [x] **Step 3: Add highlights and one-liners to the analysis document**

Append these sections to the same file:

```markdown
## Highlights

| Session | Sort | Text |
|---:|---:|---|
| 1 | 0 | 소득 4단계 프레임은 세계를 단순화하지만, 대화를 시작하게 만드는 기준이 되었다. |
| 1 | 1 | 데이터 기반 사고를 알면서도 익숙한 인상과 본능에 끌리는 순간을 각자 떠올렸다. |
| 1 | 2 | 겸손과 호기심은 지식의 문제가 아니라 자기 판단을 의심하는 습관에 가까웠다. |
| 2 | 0 | 효율적 이타주의는 좋은 의도를 숫자로 재보게 만들며 동시에 불편함을 남겼다. |
| 2 | 1 | 직업, 기부, 취미처럼 삶의 선택에 효과라는 기준을 어디까지 적용할 수 있는지 물었다. |
| 2 | 2 | 감정적으로 필요한 활동이 실제 효과가 낮아 보여도 삶에는 다른 방식의 이득이 있었다. |
| 3 | 0 | 소설 속 웃음은 인물에 대한 몰입과 독자로서의 거리감을 동시에 드러냈다. |
| 3 | 1 | 돌봄과 생계를 가족이 떠안는 구조가 개인에게 얼마나 큰 겨울이 되는지 이야기했다. |
| 3 | 2 | 극한 상황의 범죄를 법, 윤리, 생존의 언어로 나누어 보았다. |
| 4 | 0 | 공정한 관찰자는 완전히 개인적인 목소리라기보다 경험과 사회가 쌓인 기준처럼 보였다. |
| 4 | 1 | 사랑받고 싶은 욕구와 선행의 관계를 이기와 이타의 경계에서 다시 물었다. |
| 4 | 2 | 행복한 삶은 칭찬보다 스스로 부끄럽지 않은 기준을 갖는 데 가까웠다. |
| 5 | 0 | 검증이 부족한 추상적 설명은 독서의 어려움이 되었지만, 신념을 의심하는 계기가 되었다. |
| 5 | 1 | 선택 이후를 어떻게 살아내는지가 옳은 선택만큼 중요하다는 질문이 남았다. |
| 5 | 2 | 의식과 명상, 도덕의 기원을 각자의 언어로 붙잡아 보려 했다. |
| 6 | 0 | 모르는 영역을 피하는 전략과 배움을 확장하는 전략의 장단점을 비교했다. |
| 6 | 1 | 왜곡된 인센티브와 보상 구조는 투자뿐 아니라 일상 조직에서도 판단을 흔들 수 있었다. |
| 6 | 2 | 다학문적 사고는 더 안전한 판단을 만들기도 하지만 실행을 늦추는 부담이 되기도 했다. |

## One-Liners

| Session | Member | Text |
|---:|---|---|
| 1 | 김호스트 | 알지만 잘 실천하지 못하는 사실 기반 사고를 다시 점검한 시간이었다. |
| 1 | 이멤버5 | 세계를 나누는 기준이 단순하지만 꽤 유용할 수 있다는 점이 남았다. |
| 1 | 안멤버1 | 평균과 사실 너머의 예외를 어떻게 볼지 계속 생각하게 됐다. |
| 2 | 김호스트 | 효과만으로 설명되지 않는 감정의 쓸모를 함께 보게 됐다. |
| 2 | 최멤버2 | 효율이라는 단어가 불편했지만, 그래서 더 오래 남았다. |
| 2 | 이멤버5 | 좋은 결과를 만드는 선택이 무엇인지 직업과 기부를 함께 놓고 고민했다. |
| 3 | 김호스트 | 우울한 이야기 속에서도 각자가 다른 장면에 오래 머물렀다. |
| 3 | 최멤버2 | 웃음이 몰입의 실패인지 소설의 힘인지 묻게 된 모임이었다. |
| 3 | 김멤버3 | 피하고 싶은 주제를 마주하게 만드는 불편함이 가장 크게 남았다. |
| 3 | 안멤버1 | 가족이라는 단어가 지붕이자 짐이 될 수 있다는 생각이 들었다. |
| 3 | 송멤버4 | 생존과 도덕의 거리가 생각보다 가까운 이야기였다. |
| 3 | 이멤버5 | 블랙코미디처럼 보이는 장면들이 사회 문제와 맞닿아 있었다. |
| 4 | 김호스트 | 내 안의 기준이 어디에서 왔는지 돌아보게 됐다. |
| 4 | 최멤버2 | 부모와 사회의 시선까지 합쳐진 것이 결국 나일 수 있다고 느꼈다. |
| 4 | 김멤버3 | 행복한 삶을 위해 지금 적용할 수 있는 태도를 찾게 됐다. |
| 4 | 송멤버4 | 다름을 이해하는 계기와 각자의 행복을 함께 묻는 시간이었다. |
| 5 | 김호스트 | 여러 관점을 의심하는 태도가 이해와 불안 사이에 있다는 점이 남았다. |
| 5 | 송멤버4 | 어려웠지만 시리즈 전체를 다시 읽고 싶게 만든 책이었다. |
| 5 | 안멤버1 | 후회와 선택이 지금의 나를 만든다는 질문이 오래 남았다. |
| 5 | 최멤버2 | 익숙한 세계관을 가진 사람과 그렇지 않은 사람의 독서 난도가 달라 보였다. |
| 6 | 김호스트 | 내가 모르는 영역을 인정하는 태도가 가장 현실적인 지혜처럼 느껴졌다. |
| 6 | 이멤버5 | 실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다. |
| 6 | 최멤버2 | 전기와 연감 형식이 왜 반복해서 등장하는지 계속 묻게 됐다. |
```

- [x] **Step 4: Commit the analysis source**

Run:

```bash
git add docs/superpowers/specs/2026-04-19-readmates-recode-analysis.md
git commit -m "docs: add readmates recode analysis"
```

Expected: only the analysis document is committed.

---

## Task 2: Add Seed Integrity Coverage

**Files:**
- Create: `server/src/test/kotlin/com/readmates/archive/api/ReadmatesSeedDataTest.kt`

- [x] **Step 1: Write failing seed integrity tests**

Create `server/src/test/kotlin/com/readmates/archive/api/ReadmatesSeedDataTest.kt`:

```kotlin
package com.readmates.archive.api

import com.readmates.support.PostgreSqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.util.UUID
import kotlin.test.assertEquals

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
    ],
)
class ReadmatesSeedDataTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `seed creates exactly six readmates users and memberships`() {
        assertEquals(6, jdbcTemplate.queryForObject("select count(*) from users where email in ($SEEDED_EMAILS)", Int::class.java))
        assertEquals(6, jdbcTemplate.queryForObject("select count(*) from memberships where club_id = ?", Int::class.java, CLUB_ID))
    }

    @Test
    fun `seed attendance matches recode participants`() {
        val rows = jdbcTemplate.query(
            """
            select sessions.number, users.email, session_participants.attendance_status
            from session_participants
            join sessions on sessions.id = session_participants.session_id
            join memberships on memberships.id = session_participants.membership_id
            join users on users.id = memberships.user_id
            where sessions.club_id = ?
              and sessions.number between 1 and 6
            order by sessions.number, users.email
            """.trimIndent(),
            { rs, _ -> Triple(rs.getInt("number"), rs.getString("email"), rs.getString("attendance_status")) },
            CLUB_ID,
        )

        assertEquals(36, rows.size)
        EXPECTED_ATTENDANCE.forEach { (sessionNumber, expectedAttendedEmails) ->
            val actualAttendedEmails = rows
                .filter { it.first == sessionNumber && it.third == "ATTENDED" }
                .map { it.second }
                .toSet()
            assertEquals(expectedAttendedEmails, actualAttendedEmails, "session $sessionNumber attendance")
        }
    }

    @Test
    fun `seed notes include useful real data for all six sessions`() {
        val highlightsBySession = countBySession("highlights")
        val oneLinersBySession = countBySession("one_line_reviews")
        val checkinsBySession = countBySession("reading_checkins")

        (1..6).forEach { sessionNumber ->
            require((highlightsBySession[sessionNumber] ?: 0) >= 2) { "session $sessionNumber should have at least two highlights" }
            require((oneLinersBySession[sessionNumber] ?: 0) >= 2) { "session $sessionNumber should have at least two one-line reviews" }
            require((checkinsBySession[sessionNumber] ?: 0) >= 2) { "session $sessionNumber should have at least two check-ins" }
        }
    }

    private fun countBySession(tableName: String): Map<Int, Int> =
        jdbcTemplate.query(
            """
            select sessions.number, count(*) as count
            from $tableName
            join sessions on sessions.id = $tableName.session_id
            where sessions.club_id = ?
              and sessions.number between 1 and 6
            group by sessions.number
            """.trimIndent(),
            { rs, _ -> rs.getInt("number") to rs.getInt("count") },
            CLUB_ID,
        ).toMap()

    companion object {
        private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        private const val SEEDED_EMAILS =
            "'host@example.com','member1@example.com','member2@example.com','member3@example.com','member4@example.com','member5@example.com'"

        private val EXPECTED_ATTENDANCE = mapOf(
            1 to setOf("host@example.com", "member1@example.com", "member5@example.com"),
            2 to setOf("host@example.com", "member2@example.com", "member5@example.com"),
            3 to setOf("host@example.com", "member2@example.com", "member5@example.com", "member3@example.com", "member1@example.com", "member4@example.com"),
            4 to setOf("host@example.com", "member2@example.com", "member3@example.com", "member4@example.com"),
            5 to setOf("host@example.com", "member4@example.com", "member2@example.com", "member1@example.com"),
            6 to setOf("host@example.com", "member5@example.com", "member2@example.com"),
        )

        @JvmStatic
        @DynamicPropertySource
        fun postgresProperties(registry: DynamicPropertyRegistry) {
            PostgreSqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 2: Run the new test and verify current seed gaps**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ReadmatesSeedDataTest'
```

Expected: FAIL if any seed data is missing or if the existing one-liner/check-in counts are too low for a session.

- [x] **Step 3: Commit failing coverage**

Run:

```bash
git add server/src/test/kotlin/com/readmates/archive/api/ReadmatesSeedDataTest.kt
git commit -m "test: cover readmates recode seed integrity"
```

Expected: commit includes only the new test file.

---

## Task 3: Update Dev Seed SQL From Recode Analysis

**Files:**
- Modify: `server/src/main/resources/db/dev/R__readmates_dev_seed.sql`
- Read: `docs/superpowers/specs/2026-04-19-readmates-recode-analysis.md`

- [x] **Step 1: Replace attendance seed values**

In `R__readmates_dev_seed.sql`, replace the `with seed(id_suffix, session_number, email, rsvp_status, attendance_status)` values block with the attendance matrix from the analysis document. Use these exact rows:

```sql
    (4101, 1, 'host@example.com', 'GOING', 'ATTENDED'),
    (4102, 1, 'member1@example.com', 'GOING', 'ATTENDED'),
    (4103, 1, 'member2@example.com', 'DECLINED', 'ABSENT'),
    (4104, 1, 'member3@example.com', 'DECLINED', 'ABSENT'),
    (4105, 1, 'member4@example.com', 'DECLINED', 'ABSENT'),
    (4106, 1, 'member5@example.com', 'GOING', 'ATTENDED'),
    (4201, 2, 'host@example.com', 'GOING', 'ATTENDED'),
    (4202, 2, 'member1@example.com', 'DECLINED', 'ABSENT'),
    (4203, 2, 'member2@example.com', 'GOING', 'ATTENDED'),
    (4204, 2, 'member3@example.com', 'DECLINED', 'ABSENT'),
    (4205, 2, 'member4@example.com', 'DECLINED', 'ABSENT'),
    (4206, 2, 'member5@example.com', 'GOING', 'ATTENDED'),
    (4301, 3, 'host@example.com', 'GOING', 'ATTENDED'),
    (4302, 3, 'member1@example.com', 'GOING', 'ATTENDED'),
    (4303, 3, 'member2@example.com', 'GOING', 'ATTENDED'),
    (4304, 3, 'member3@example.com', 'GOING', 'ATTENDED'),
    (4305, 3, 'member4@example.com', 'GOING', 'ATTENDED'),
    (4306, 3, 'member5@example.com', 'GOING', 'ATTENDED'),
    (4401, 4, 'host@example.com', 'GOING', 'ATTENDED'),
    (4402, 4, 'member1@example.com', 'DECLINED', 'ABSENT'),
    (4403, 4, 'member2@example.com', 'GOING', 'ATTENDED'),
    (4404, 4, 'member3@example.com', 'GOING', 'ATTENDED'),
    (4405, 4, 'member4@example.com', 'GOING', 'ATTENDED'),
    (4406, 4, 'member5@example.com', 'DECLINED', 'ABSENT'),
    (4501, 5, 'host@example.com', 'GOING', 'ATTENDED'),
    (4502, 5, 'member1@example.com', 'GOING', 'ATTENDED'),
    (4503, 5, 'member2@example.com', 'GOING', 'ATTENDED'),
    (4504, 5, 'member3@example.com', 'DECLINED', 'ABSENT'),
    (4505, 5, 'member4@example.com', 'GOING', 'ATTENDED'),
    (4506, 5, 'member5@example.com', 'DECLINED', 'ABSENT'),
    (4601, 6, 'host@example.com', 'GOING', 'ATTENDED'),
    (4602, 6, 'member1@example.com', 'DECLINED', 'ABSENT'),
    (4603, 6, 'member2@example.com', 'GOING', 'ATTENDED'),
    (4604, 6, 'member3@example.com', 'DECLINED', 'ABSENT'),
    (4605, 6, 'member4@example.com', 'DECLINED', 'ABSENT'),
    (4606, 6, 'member5@example.com', 'GOING', 'ATTENDED')
```

- [x] **Step 2: Replace public summaries and highlights**

Update the `public_session_publications` and `highlights` seed blocks using the `Session Summaries` and `Highlights` sections from `2026-04-19-readmates-recode-analysis.md`. Preserve existing deterministic id suffix ranges and `on conflict` clauses.

Use 18 highlight rows, three per session, with ids `5101`, `5102`, `5103`, `5201`, `5202`, `5203`, `5301`, `5302`, `5303`, `5401`, `5402`, `5403`, `5501`, `5502`, `5503`, `5601`, `5602`, and `5603`.

- [x] **Step 3: Replace one-line review rows**

Update the `one_line_reviews` seed block to use every row from the `One-Liners` section. Use deterministic ids beginning at `1001`. Preserve:

```sql
on conflict (session_id, membership_id) do update set
  text = excluded.text,
  visibility = excluded.visibility;
```

- [x] **Step 4: Replace reading check-in rows**

Use attended members only. Add at least these rows, all with `reading_progress = 100`:

```sql
    (1101, 1, 'host@example.com', 100, '팩트풀니스의 본능과 데이터 기반 사고를 중심으로 질문을 정리했습니다.'),
    (1102, 1, 'member1@example.com', 100, '사실과 데이터로 설명되지 않는 현실에 대한 질문을 표시했습니다.'),
    (1103, 1, 'member5@example.com', 100, '소득 4단계와 단일관점 본능을 중심으로 읽었습니다.'),
    (1201, 2, 'host@example.com', 100, '효과 기준의 선택이 취미와 일상에도 적용될 수 있는지 메모했습니다.'),
    (1202, 2, 'member2@example.com', 100, '효율이라는 기준이 가져올 부정적 영향에 밑줄을 그었습니다.'),
    (1203, 2, 'member5@example.com', 100, '효과적 이타주의를 직업 선택과 기부의 기준으로 연결해 읽었습니다.'),
    (1301, 3, 'host@example.com', 100, '돌봄과 생계가 가족에게 집중되는 장면을 중심으로 읽었습니다.'),
    (1302, 3, 'member2@example.com', 100, '몰입과 웃음의 거리가 드러난 장면을 표시했습니다.'),
    (1303, 3, 'member3@example.com', 100, '불편한 감정을 만든 장면을 따로 메모했습니다.'),
    (1304, 3, 'member1@example.com', 100, '가족의 정의와 오래 남은 장면을 중심으로 질문을 준비했습니다.'),
    (1305, 3, 'member4@example.com', 100, '도덕적 해이와 겨울을 보내는 방식에 대한 질문을 남겼습니다.'),
    (1306, 3, 'member5@example.com', 100, '블랙코미디처럼 보이는 장면과 사회 문제의 연결을 메모했습니다.'),
    (1401, 4, 'host@example.com', 100, '공정한 관찰자와 인정 욕구를 중심으로 읽었습니다.'),
    (1402, 4, 'member2@example.com', 100, '이기와 이타가 구분되는 기준을 질문으로 정리했습니다.'),
    (1403, 4, 'member3@example.com', 100, '미덕과 행복한 삶을 현실에 적용하는 대목을 표시했습니다.'),
    (1404, 4, 'member4@example.com', 100, '다름을 이해하는 계기와 각자의 행복을 메모했습니다.'),
    (1501, 5, 'host@example.com', 100, '생각을 의심하는 태도가 이해인지 불안인지 중심으로 읽었습니다.'),
    (1502, 5, 'member4@example.com', 100, '신념과 명상, 돈오점수를 질문으로 정리했습니다.'),
    (1503, 5, 'member1@example.com', 100, '선택과 후회가 나를 만드는 방식에 밑줄을 그었습니다.'),
    (1504, 5, 'member2@example.com', 100, '도덕의 기원과 의식의 주체를 중심으로 읽었습니다.'),
    (1601, 6, 'host@example.com', 100, '모르는 영역을 피하는 태도와 다학문적 사고를 중심으로 읽었습니다.'),
    (1602, 6, 'member2@example.com', 100, '전기의 효용과 정의의 주장을 중심으로 질문을 정리했습니다.'),
    (1603, 6, 'member5@example.com', 100, '뒤집어서 생각하기와 왜곡된 보상 구조를 메모했습니다.')
```

- [x] **Step 5: Run seed integrity test**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ReadmatesSeedDataTest'
```

Expected: PASS.

- [x] **Step 6: Commit seed data update**

Run:

```bash
git add server/src/main/resources/db/dev/R__readmates_dev_seed.sql
git commit -m "feat: seed readmates recode data"
```

Expected: seed SQL commit only.

---

## Task 4: Expand Current Session Read Model And Persist Reviews

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/api/ReviewController.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt`

- [x] **Step 1: Add failing current-session hydrate test**

Append this test to `CurrentSessionControllerDbTest.kt`:

```kotlin
@Test
@Sql(
    statements = [
        """
        insert into sessions (
          id, club_id, number, title, book_title, book_author, book_translator, book_link,
          session_date, start_time, end_time, location_label, question_deadline_at, state
        )
        values (
          '00000000-0000-0000-0000-000000000777'::uuid,
          '00000000-0000-0000-0000-000000000001'::uuid,
          7, '7회차 · 테스트 책', '테스트 책', '테스트 저자', null, null,
          '2026-05-20'::date, '20:00'::time, '22:00'::time, 'online · Zoom',
          '2026-05-19 23:59:00+09'::timestamptz, 'OPEN'
        )
        on conflict (club_id, number) do update set state = excluded.state;
        """,
        """
        insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
        select gen_random_uuid(), memberships.club_id, '00000000-0000-0000-0000-000000000777'::uuid, memberships.id, 'GOING', 'UNKNOWN'
        from memberships
        where memberships.club_id = '00000000-0000-0000-0000-000000000001'::uuid
        on conflict (session_id, membership_id) do update set rsvp_status = excluded.rsvp_status;
        """,
        """
        insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
        select '00000000-0000-0000-0000-000000009001'::uuid, memberships.club_id, '00000000-0000-0000-0000-000000000777'::uuid, memberships.id,
               1, '현재 세션 hydrate 질문', 'hydrate 초안'
        from memberships join users on users.id = memberships.user_id
        where users.email = 'member5@example.com'
        on conflict (session_id, membership_id, priority) do update set text = excluded.text, draft_thought = excluded.draft_thought;
        """,
        """
        insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress, note)
        select '00000000-0000-0000-0000-000000009002'::uuid, memberships.club_id, '00000000-0000-0000-0000-000000000777'::uuid, memberships.id,
               72, '현재 세션 hydrate 체크인'
        from memberships join users on users.id = memberships.user_id
        where users.email = 'member5@example.com'
        on conflict (session_id, membership_id) do update set reading_progress = excluded.reading_progress, note = excluded.note;
        """,
        """
        insert into highlights (id, club_id, session_id, text, sort_order)
        values ('00000000-0000-0000-0000-000000009003'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000777'::uuid, '현재 세션 hydrate 하이라이트', 0)
        on conflict (session_id, sort_order) do update set text = excluded.text;
        """,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
fun `current session returns my saved notes and shared board`() {
    mockMvc.get("/api/sessions/current") {
        with(user("member5@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$.currentSession.myCheckin.readingProgress") { value(72) }
        jsonPath("$.currentSession.myQuestions[0].text") { value("현재 세션 hydrate 질문") }
        jsonPath("$.currentSession.board.questions[0].text") { value("현재 세션 hydrate 질문") }
        jsonPath("$.currentSession.board.checkins[0].note") { value("현재 세션 hydrate 체크인") }
        jsonPath("$.currentSession.board.highlights[0].text") { value("현재 세션 hydrate 하이라이트") }
    }
}
```

- [x] **Step 2: Add failing review persistence test**

Append this test to `MemberActionControllerDbTest.kt`:

```kotlin
@Test
fun `persists one-line and long reviews for current member`() {
    mockMvc.post("/api/sessions/current/one-line-reviews") {
        with(user("member5@example.com"))
        contentType = MediaType.APPLICATION_JSON
        content = """{"text":"저장된 한줄평"}"""
    }.andExpect {
        status { isOk() }
        jsonPath("$.text") { value("저장된 한줄평") }
    }

    mockMvc.post("/api/sessions/current/reviews") {
        with(user("member5@example.com"))
        contentType = MediaType.APPLICATION_JSON
        content = """{"body":"저장된 장문 서평"}"""
    }.andExpect {
        status { isOk() }
        jsonPath("$.body") { value("저장된 장문 서평") }
    }
}
```

Use the current test's existing setup for creating an OPEN session. If the class does not already create one for this test, copy the SQL setup from the current RSVP/check-in/question DB tests in the same file.

- [x] **Step 3: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' --tests 'com.readmates.note.api.MemberActionControllerDbTest'
```

Expected: FAIL because current session does not include `myCheckin`, `myQuestions`, or `board`, and review endpoints still echo only.

- [x] **Step 4: Add response data classes**

In `SessionRepository.kt`, extend `CurrentSessionDetail` with these properties:

```kotlin
val myCheckin: CurrentSessionCheckin?,
val myQuestions: List<CurrentSessionQuestion>,
val myOneLineReview: CurrentSessionOneLineReview?,
val myLongReview: CurrentSessionLongReview?,
val board: CurrentSessionBoard,
```

Add these data classes near the existing current-session data classes:

```kotlin
data class CurrentSessionCheckin(
    val readingProgress: Int,
    val note: String,
)

data class CurrentSessionQuestion(
    val priority: Int,
    val text: String,
    val draftThought: String?,
    val authorName: String,
    val authorShortName: String,
)

data class CurrentSessionOneLineReview(
    val text: String,
)

data class CurrentSessionLongReview(
    val body: String,
)

data class CurrentSessionBoard(
    val questions: List<CurrentSessionQuestion>,
    val checkins: List<BoardCheckin>,
    val highlights: List<BoardHighlight>,
)

data class BoardCheckin(
    val authorName: String,
    val authorShortName: String,
    val readingProgress: Int,
    val note: String,
)

data class BoardHighlight(
    val text: String,
    val sortOrder: Int,
)
```

- [x] **Step 5: Implement hydrate queries in `SessionRepository`**

After loading the open session and attendees, query current member data and board data with focused private methods:

```kotlin
private fun findMyCheckin(jdbcTemplate: JdbcTemplate, sessionId: UUID, member: CurrentMember): CurrentSessionCheckin? =
    jdbcTemplate.query(
        """
        select reading_progress, note
        from reading_checkins
        where session_id = ?
          and club_id = ?
          and membership_id = ?
        """.trimIndent(),
        { rs, _ -> CurrentSessionCheckin(rs.getInt("reading_progress"), rs.getString("note")) },
        sessionId,
        member.clubId,
        member.membershipId,
    ).firstOrNull()

private fun findQuestions(jdbcTemplate: JdbcTemplate, sessionId: UUID, clubId: UUID, membershipId: UUID? = null): List<CurrentSessionQuestion> {
    val membershipFilter = if (membershipId == null) "" else "and questions.membership_id = ?"
    val args = mutableListOf<Any>(sessionId, clubId)
    if (membershipId != null) args.add(membershipId)

    return jdbcTemplate.query(
        """
        select questions.priority, questions.text, questions.draft_thought, users.name as author_name
        from questions
        join memberships on memberships.id = questions.membership_id
          and memberships.club_id = questions.club_id
        join users on users.id = memberships.user_id
        where questions.session_id = ?
          and questions.club_id = ?
          $membershipFilter
        order by questions.priority, questions.created_at, users.name
        """.trimIndent(),
        { rs, _ ->
            val authorName = rs.getString("author_name")
            CurrentSessionQuestion(
                priority = rs.getInt("priority"),
                text = rs.getString("text"),
                draftThought = rs.getString("draft_thought"),
                authorName = authorName,
                authorShortName = shortNameFor(authorName),
            )
        },
        *args.toTypedArray(),
    )
}
```

Implement analogous private methods for `findMyOneLineReview`, `findMyLongReview`, `findBoardCheckins`, and `findBoardHighlights`. Use existing `shortNameFor` mapping style from `ArchiveRepository`.

- [x] **Step 6: Persist reviews in `SessionRepository`**

Add:

```kotlin
fun saveOneLineReview(member: CurrentMember, text: String): Map<String, String> {
    val jdbcTemplate = jdbcTemplate()
    val updated = jdbcTemplate.update(
        """
        insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
        select ?, session_participants.club_id, session_participants.session_id, session_participants.membership_id, ?, 'PRIVATE'
        from session_participants
        join sessions on sessions.id = session_participants.session_id
          and sessions.club_id = session_participants.club_id
        where sessions.club_id = ?
          and sessions.state = 'OPEN'
          and session_participants.membership_id = ?
        on conflict (session_id, membership_id) do update set
          text = excluded.text,
          visibility = excluded.visibility,
          updated_at = now()
        """.trimIndent(),
        UUID.randomUUID(),
        text,
        member.clubId,
        member.membershipId,
    )
    if (updated == 0) throw CurrentSessionNotOpenException()
    return mapOf("text" to text)
}

fun saveLongReview(member: CurrentMember, body: String): Map<String, String> {
    val jdbcTemplate = jdbcTemplate()
    val updated = jdbcTemplate.update(
        """
        insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
        select ?, session_participants.club_id, session_participants.session_id, session_participants.membership_id, ?, 'PRIVATE'
        from session_participants
        join sessions on sessions.id = session_participants.session_id
          and sessions.club_id = session_participants.club_id
        where sessions.club_id = ?
          and sessions.state = 'OPEN'
          and session_participants.membership_id = ?
        on conflict (session_id, membership_id) do update set
          body = excluded.body,
          visibility = excluded.visibility,
          updated_at = now()
        """.trimIndent(),
        UUID.randomUUID(),
        body,
        member.clubId,
        member.membershipId,
    )
    if (updated == 0) throw CurrentSessionNotOpenException()
    return mapOf("body" to body)
}
```

- [x] **Step 7: Wire `ReviewController` to auth and repository**

Replace `ReviewController` constructor and methods with the same `MemberAccountRepository` auth pattern used by `CheckinController`, then call `sessionRepository.saveOneLineReview(currentMember(authentication), request.text)` and `sessionRepository.saveLongReview(currentMember(authentication), request.body)`.

- [x] **Step 8: Run focused tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.CurrentSessionControllerDbTest' --tests 'com.readmates.note.api.MemberActionControllerDbTest'
```

Expected: PASS.

- [x] **Step 9: Commit current-session hydrate**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt server/src/main/kotlin/com/readmates/note/api/ReviewController.kt server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt server/src/test/kotlin/com/readmates/note/api/MemberActionControllerDbTest.kt
git commit -m "feat: hydrate current session notes"
```

---

## Task 5: Expand Archive And Notes APIs

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt`
- Modify: `server/src/main/kotlin/com/readmates/note/api/NotesFeedController.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`

- [x] **Step 1: Add failing archive side-tab and notes metadata tests**

Append tests to `ArchiveAndNotesDbTest.kt`:

```kotlin
@Test
fun `notes feed includes book metadata`() {
    mockMvc.get("/api/notes/feed") {
        with(user("member5@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[0].bookTitle") { exists() }
        jsonPath("$[0].date") { exists() }
    }
}

@Test
fun `my archive questions returns only current member questions`() {
    mockMvc.get("/api/archive/me/questions") {
        with(user("member5@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[0].sessionNumber") { exists() }
        jsonPath("$[0].bookTitle") { exists() }
        jsonPath("$[0].text") { exists() }
    }
}

@Test
fun `my archive reviews returns current member one-liners`() {
    mockMvc.get("/api/archive/me/reviews") {
        with(user("member5@example.com"))
    }.andExpect {
        status { isOk() }
        jsonPath("$[0].kind") { value("ONE_LINE_REVIEW") }
        jsonPath("$[0].bookTitle") { exists() }
        jsonPath("$[0].text") { exists() }
    }
}
```

- [x] **Step 2: Run tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'
```

Expected: FAIL because new fields/endpoints do not exist.

- [x] **Step 3: Add archive response data classes**

In `ArchiveController.kt`, add:

```kotlin
data class MyArchiveQuestionItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

data class MyArchiveReviewItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val kind: String,
    val text: String,
)
```

In `NotesFeedController.kt`, extend `NoteFeedItem` with:

```kotlin
val sessionId: String,
val bookTitle: String,
val date: String,
```

- [x] **Step 4: Implement repository read methods**

In `ArchiveRepository`, update the feed SQL to select `sessions.id`, `sessions.book_title`, and `sessions.session_date` in every union arm. Map those fields into `NoteFeedItem`.

Add:

```kotlin
fun findMyQuestions(currentMember: CurrentMember): List<MyArchiveQuestionItem> = jdbcTemplateProvider.ifAvailable?.query(
    """
    select sessions.id, sessions.number, sessions.book_title, sessions.session_date,
           questions.priority, questions.text, questions.draft_thought
    from questions
    join sessions on sessions.id = questions.session_id
      and sessions.club_id = questions.club_id
    where questions.club_id = ?
      and questions.membership_id = ?
      and sessions.state = 'PUBLISHED'
    order by sessions.number desc, questions.priority
    """.trimIndent(),
    { rs, _ ->
        MyArchiveQuestionItem(
            sessionId = rs.getObject("id", UUID::class.java).toString(),
            sessionNumber = rs.getInt("number"),
            bookTitle = rs.getString("book_title"),
            date = rs.getObject("session_date", LocalDate::class.java).toString(),
            priority = rs.getInt("priority"),
            text = rs.getString("text"),
            draftThought = rs.getString("draft_thought"),
        )
    },
    currentMember.clubId,
    currentMember.membershipId,
) ?: emptyList()
```

Add `findMyReviews(currentMember)` using a `union all` over `one_line_reviews` and `long_reviews`, with `kind = 'ONE_LINE_REVIEW'` or `kind = 'LONG_REVIEW'`.

- [x] **Step 5: Wire controller endpoints**

In `ArchiveController`, add:

```kotlin
@GetMapping("/me/questions")
fun myQuestions(authentication: Authentication?): List<MyArchiveQuestionItem> =
    archiveRepository.findMyQuestions(currentMember(authentication))

@GetMapping("/me/reviews")
fun myReviews(authentication: Authentication?): List<MyArchiveReviewItem> =
    archiveRepository.findMyReviews(currentMember(authentication))
```

- [x] **Step 6: Run archive tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'
```

Expected: PASS.

- [x] **Step 7: Commit archive API expansion**

Run:

```bash
git add server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt server/src/main/kotlin/com/readmates/archive/api/ArchiveController.kt server/src/main/kotlin/com/readmates/note/api/NotesFeedController.kt server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt
git commit -m "feat: expand archive read models"
```

---

## Task 6: Add Public Club And Session APIs

**Files:**
- Create: `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt`
- Create: `server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt`

- [x] **Step 1: Write failing public API tests**

Create `PublicControllerDbTest.kt`:

```kotlin
package com.readmates.publication.api

import com.readmates.support.PostgreSqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
    ],
)
@AutoConfigureMockMvc
class PublicControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `public club returns real published sessions`() {
        mockMvc.get("/api/public/club")
            .andExpect {
                status { isOk() }
                jsonPath("$.clubName") { value("읽는사이") }
                jsonPath("$.stats.sessions") { value(6) }
                jsonPath("$.recentSessions[0].sessionNumber") { value(6) }
                jsonPath("$.recentSessions[0].bookTitle") { value("가난한 찰리의 연감") }
            }
    }

    @Test
    fun `public session returns details for published session`() {
        mockMvc.get("/api/public/sessions/00000000-0000-0000-0000-000000000306")
            .andExpect {
                status { isOk() }
                jsonPath("$.sessionNumber") { value(6) }
                jsonPath("$.bookTitle") { value("가난한 찰리의 연감") }
                jsonPath("$.summary") { exists() }
                jsonPath("$.highlights.length()") { value(3) }
                jsonPath("$.oneLiners.length()") { value(3) }
            }
    }

    @Test
    fun `public session returns not found for non-public id`() {
        mockMvc.get("/api/public/sessions/00000000-0000-0000-0000-000000000999")
            .andExpect {
                status { isNotFound() }
            }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun postgresProperties(registry: DynamicPropertyRegistry) {
            PostgreSqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 2: Run public API tests and verify failure**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.publication.api.PublicControllerDbTest'
```

Expected: FAIL because `/api/public/**` does not exist.

- [x] **Step 3: Implement `PublicController`**

Create `server/src/main/kotlin/com/readmates/publication/api/PublicController.kt`:

```kotlin
package com.readmates.publication.api

import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.LocalDate
import java.util.UUID

data class PublicClubResponse(
    val clubName: String,
    val tagline: String,
    val about: String,
    val stats: PublicClubStats,
    val recentSessions: List<PublicSessionListItem>,
)

data class PublicClubStats(
    val sessions: Int,
    val books: Int,
    val members: Int,
)

data class PublicSessionListItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val summary: String,
)

data class PublicSessionDetailResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val summary: String,
    val highlights: List<String>,
    val oneLiners: List<PublicOneLiner>,
)

data class PublicOneLiner(
    val authorName: String,
    val authorShortName: String,
    val text: String,
)

@RestController
@RequestMapping("/api/public")
class PublicController(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    @GetMapping("/club")
    fun club(): PublicClubResponse {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val club = jdbcTemplate.query(
            """
            select id, name, tagline, about
            from clubs
            where slug = 'reading-sai'
            """.trimIndent(),
            { rs, _ ->
                val clubId = rs.getObject("id", UUID::class.java)
                PublicClubResponse(
                    clubName = rs.getString("name"),
                    tagline = rs.getString("tagline"),
                    about = rs.getString("about"),
                    stats = publicStats(jdbcTemplate, clubId),
                    recentSessions = publicSessions(jdbcTemplate, clubId),
                )
            },
        ).firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        return club
    }

    @GetMapping("/sessions/{sessionId}")
    fun session(@PathVariable sessionId: String): PublicSessionDetailResponse {
        val jdbcTemplate = jdbcTemplateProvider.ifAvailable ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        val id = runCatching { UUID.fromString(sessionId) }.getOrNull()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

        return jdbcTemplate.query(
            """
            select sessions.id, sessions.number, sessions.book_title, sessions.book_author, sessions.session_date,
                   public_session_publications.public_summary
            from sessions
            join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.id = ?
              and sessions.state = 'PUBLISHED'
              and public_session_publications.is_public = true
            """.trimIndent(),
            { rs, _ ->
                PublicSessionDetailResponse(
                    sessionId = rs.getObject("id", UUID::class.java).toString(),
                    sessionNumber = rs.getInt("number"),
                    bookTitle = rs.getString("book_title"),
                    bookAuthor = rs.getString("book_author"),
                    date = rs.getObject("session_date", LocalDate::class.java).toString(),
                    summary = rs.getString("public_summary"),
                    highlights = publicHighlights(jdbcTemplate, id),
                    oneLiners = publicOneLiners(jdbcTemplate, id),
                )
            },
            id,
        ).firstOrNull() ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
    }

    private fun publicStats(jdbcTemplate: JdbcTemplate, clubId: UUID): PublicClubStats =
        PublicClubStats(
            sessions = jdbcTemplate.queryForObject("select count(*) from sessions where club_id = ? and state = 'PUBLISHED'", Int::class.java, clubId) ?: 0,
            books = jdbcTemplate.queryForObject("select count(distinct book_title) from sessions where club_id = ? and state = 'PUBLISHED'", Int::class.java, clubId) ?: 0,
            members = jdbcTemplate.queryForObject("select count(*) from memberships where club_id = ? and status = 'ACTIVE'", Int::class.java, clubId) ?: 0,
        )

    private fun publicSessions(jdbcTemplate: JdbcTemplate, clubId: UUID): List<PublicSessionListItem> =
        jdbcTemplate.query(
            """
            select sessions.id, sessions.number, sessions.book_title, sessions.book_author, sessions.session_date,
                   public_session_publications.public_summary
            from sessions
            join public_session_publications on public_session_publications.session_id = sessions.id
              and public_session_publications.club_id = sessions.club_id
            where sessions.club_id = ?
              and sessions.state = 'PUBLISHED'
              and public_session_publications.is_public = true
            order by sessions.number desc
            limit 6
            """.trimIndent(),
            { rs, _ ->
                PublicSessionListItem(
                    sessionId = rs.getObject("id", UUID::class.java).toString(),
                    sessionNumber = rs.getInt("number"),
                    bookTitle = rs.getString("book_title"),
                    bookAuthor = rs.getString("book_author"),
                    date = rs.getObject("session_date", LocalDate::class.java).toString(),
                    summary = rs.getString("public_summary"),
                )
            },
            clubId,
        )

    private fun publicHighlights(jdbcTemplate: JdbcTemplate, sessionId: UUID): List<String> =
        jdbcTemplate.query(
            "select text from highlights where session_id = ? order by sort_order",
            { rs, _ -> rs.getString("text") },
            sessionId,
        )

    private fun publicOneLiners(jdbcTemplate: JdbcTemplate, sessionId: UUID): List<PublicOneLiner> =
        jdbcTemplate.query(
            """
            select users.name, one_line_reviews.text
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            where one_line_reviews.session_id = ?
              and one_line_reviews.visibility = 'PUBLIC'
            order by one_line_reviews.created_at, users.name
            """.trimIndent(),
            { rs, _ ->
                val name = rs.getString("name")
                PublicOneLiner(
                    authorName = name,
                    authorShortName = shortNameFor(name),
                    text = rs.getString("text"),
                )
            },
            sessionId,
        )

    private fun shortNameFor(displayName: String): String = when (displayName) {
        "김호스트" -> "호스트"
        "안멤버1" -> "멤버1"
        "최멤버2" -> "멤버2"
        "김멤버3" -> "멤버3"
        "송멤버4" -> "멤버4"
        "이멤버5" -> "멤버5"
        else -> displayName
    }
}
```

- [x] **Step 4: Run public API tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.publication.api.PublicControllerDbTest'
```

Expected: PASS.

- [x] **Step 5: Commit public APIs**

Run:

```bash
git add server/src/main/kotlin/com/readmates/publication/api/PublicController.kt server/src/test/kotlin/com/readmates/publication/api/PublicControllerDbTest.kt
git commit -m "feat: expose public readmates records"
```

---

## Task 7: Make Host Dashboard And Host Session Operations DB-Backed

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/session/api/HostDashboardController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/api/AttendanceController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/api/PublicationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`

- [x] **Step 1: Convert host dashboard tests to DB-backed tests**

Change `HostDashboardControllerTest` to use Flyway dev seed and authenticated host:

```kotlin
@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
    ],
)
@AutoConfigureMockMvc
class HostDashboardControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns zero current-session metrics when no session is open`() {
        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.rsvpPending") { value(0) }
            jsonPath("$.checkinMissing") { value(0) }
        }
    }
}
```

Keep validation tests for invalid host session payloads, but replace `session-14` ids with real UUIDs when testing DB update paths.

- [x] **Step 2: Add failing host detail/update/publication tests**

Add tests that:

1. Create session 7 via `POST /api/host/sessions`.
2. Fetch `/api/host/sessions/{createdId}`.
3. Assert `attendees.length() == 6`.
4. Patch the session title/date.
5. Put publication summary and assert DB-backed response.

Use this exact payload for create:

```json
{
  "title": "7회차 · 새로운 책",
  "bookTitle": "새로운 책",
  "bookAuthor": "새 저자",
  "date": "2026-05-20"
}
```

- [x] **Step 3: Implement host dashboard auth and metrics**

Inject `MemberAccountRepository` and `SessionRepository` into `HostDashboardController`. Resolve current member and reject non-host using `AccessDeniedException`.

Add `SessionRepository.hostDashboard(member: CurrentMember): HostDashboardResponse` with SQL:

```sql
select
  coalesce(count(*) filter (where session_participants.rsvp_status = 'NO_RESPONSE'), 0) as rsvp_pending,
  coalesce(count(*) filter (
    where session_participants.rsvp_status = 'GOING'
      and reading_checkins.id is null
  ), 0) as checkin_missing
from sessions
join session_participants on session_participants.session_id = sessions.id
  and session_participants.club_id = sessions.club_id
left join reading_checkins on reading_checkins.session_id = sessions.id
  and reading_checkins.club_id = sessions.club_id
  and reading_checkins.membership_id = session_participants.membership_id
where sessions.club_id = ?
  and sessions.state = 'OPEN'
```

Compute `publishPending` as count of `sessions.state = 'CLOSED'` plus published sessions with no publication row or `is_public = false`. Compute `feedbackPending` as attended published/closed participant count minus latest report count.

- [x] **Step 4: Implement host session detail and update**

Add response classes:

```kotlin
data class HostSessionDetailResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val state: String,
    val attendees: List<HostSessionAttendee>,
    val reports: List<HostSessionReport>,
)

data class HostSessionAttendee(
    val membershipId: String,
    val displayName: String,
    val shortName: String,
    val rsvpStatus: String,
    val attendanceStatus: String,
)

data class HostSessionReport(
    val membershipId: String,
    val displayName: String,
    val fileName: String?,
    val uploaded: Boolean,
)
```

Implement repository methods:

- `findHostSession(member, sessionId)`
- `updateHostSession(member, sessionId, request)`
- `confirmAttendance(member, sessionId, entries)`
- `upsertPublication(member, sessionId, request)`

Every method must check `member.isHost` and `session.club_id = member.clubId`.

- [x] **Step 5: Wire controllers**

In `HostSessionController`, add:

```kotlin
@GetMapping("/{sessionId}")
fun detail(authentication: Authentication?, @PathVariable sessionId: String) =
    sessionRepository.findHostSession(currentMember(authentication), UUID.fromString(sessionId))

@PatchMapping("/{sessionId}")
fun update(authentication: Authentication?, @PathVariable sessionId: String, @Valid @RequestBody request: HostSessionRequest) =
    sessionRepository.updateHostSession(currentMember(authentication), UUID.fromString(sessionId), request)
```

In `AttendanceController` and `PublicationController`, inject auth dependencies and call repository methods instead of echo responses.

- [x] **Step 6: Run host tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.session.api.HostDashboardControllerTest'
```

Expected: PASS.

- [x] **Step 7: Commit host operations**

Run:

```bash
git add server/src/main/kotlin/com/readmates/session/api/HostDashboardController.kt server/src/main/kotlin/com/readmates/session/api/HostSessionController.kt server/src/main/kotlin/com/readmates/session/api/AttendanceController.kt server/src/main/kotlin/com/readmates/session/api/PublicationController.kt server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt
git commit -m "feat: back host operations with database"
```

---

## Task 8: Persist Report Metadata And Enforce Report Access

**Files:**
- Create: `server/src/main/kotlin/com/readmates/report/application/ReportRepository.kt`
- Modify: `server/src/main/kotlin/com/readmates/report/api/HostReportController.kt`
- Modify: `server/src/main/kotlin/com/readmates/report/api/ReportController.kt`
- Modify: `server/src/test/kotlin/com/readmates/report/api/HostReportControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/report/api/ReportControllerTest.kt`

- [x] **Step 1: Rewrite report tests to use DB and auth**

Change report tests to use:

```kotlin
@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
    ],
)
@AutoConfigureMockMvc
```

In upload tests, use real ids:

```text
membershipId=00000000-0000-0000-0000-000000000206
sessionId=00000000-0000-0000-0000-000000000306
```

Call upload with `with(user("host@example.com"))`.

- [x] **Step 2: Add failing list/content assertions**

After upload, assert:

```kotlin
mockMvc.get("/api/reports/me") {
    with(user("member5@example.com"))
}.andExpect {
    status { isOk() }
    jsonPath("$[0].fileName") { value("feedback-6-suhan.html") }
    jsonPath("$[0].sessionNumber") { value(6) }
}
```

Then get content using returned `reportId` or the first list item path and assert HTML content and CSP.

- [x] **Step 3: Implement `ReportRepository`**

Create:

```kotlin
package com.readmates.report.application

import com.readmates.report.api.ReportListItem
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

data class StoredReportMetadata(
    val reportId: UUID,
    val fileName: String,
    val storedPath: String,
)

@Repository
class ReportRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun saveReport(host: CurrentMember, sessionId: UUID, membershipId: UUID, fileName: String, storedPath: String, contentType: String, fileSize: Long): StoredReportMetadata {
        require(host.isHost) { "Host role required" }
        val version = (jdbcTemplate.queryForObject(
            "select coalesce(max(version), 0) + 1 from feedback_reports where session_id = ? and membership_id = ?",
            Int::class.java,
            sessionId,
            membershipId,
        ) ?: 1)
        val reportId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into feedback_reports (id, club_id, session_id, membership_id, version, stored_path, file_name, content_type, file_size)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            reportId,
            host.clubId,
            sessionId,
            membershipId,
            version,
            storedPath,
            fileName,
            contentType,
            fileSize,
        )
        return StoredReportMetadata(reportId, fileName, storedPath)
    }

    fun findMyReports(member: CurrentMember): List<ReportListItem> =
        jdbcTemplate.query(
            """
            select distinct on (feedback_reports.session_id, feedback_reports.membership_id)
              feedback_reports.id, feedback_reports.file_name, sessions.number
            from feedback_reports
            join sessions on sessions.id = feedback_reports.session_id
              and sessions.club_id = feedback_reports.club_id
            where feedback_reports.club_id = ?
              and feedback_reports.membership_id = ?
            order by feedback_reports.session_id, feedback_reports.membership_id, feedback_reports.version desc
            """.trimIndent(),
            { rs, _ ->
                ReportListItem(
                    reportId = rs.getObject("id", UUID::class.java).toString(),
                    fileName = rs.getString("file_name"),
                    sessionNumber = rs.getInt("number"),
                )
            },
            member.clubId,
            member.membershipId,
        )

    fun findReadableReport(member: CurrentMember, reportId: UUID): StoredReportMetadata? =
        jdbcTemplate.query(
            """
            select id, file_name, stored_path
            from feedback_reports
            where id = ?
              and club_id = ?
              and (? = true or membership_id = ?)
            """.trimIndent(),
            { rs, _ ->
                StoredReportMetadata(
                    reportId = rs.getObject("id", UUID::class.java),
                    fileName = rs.getString("file_name"),
                    storedPath = rs.getString("stored_path"),
                )
            },
            reportId,
            member.clubId,
            member.isHost,
            member.membershipId,
        ).firstOrNull()
}
```

- [x] **Step 4: Wire controllers**

Resolve current member in both report controllers using `MemberAccountRepository`. In `HostReportController`, save the file first, then call `reportRepository.saveReport(host, UUID.fromString(sessionId), UUID.fromString(membershipId), stored.fileName, stored.storedPath, file.contentType ?: MediaType.TEXT_HTML_VALUE, file.size)`.

In `ReportController.content`, read `StoredReportMetadata.storedPath` with `Files.readString(Path.of(storedPath))` and return the existing CSP header. Return 404 when `findReadableReport` returns null.

- [x] **Step 5: Run report tests**

Run:

```bash
./server/gradlew -p server test --tests 'com.readmates.report.api.*'
```

Expected: PASS.

- [x] **Step 6: Commit report metadata**

Run:

```bash
git add server/src/main/kotlin/com/readmates/report/application/ReportRepository.kt server/src/main/kotlin/com/readmates/report/api/HostReportController.kt server/src/main/kotlin/com/readmates/report/api/ReportController.kt server/src/test/kotlin/com/readmates/report/api/HostReportControllerTest.kt server/src/test/kotlin/com/readmates/report/api/ReportControllerTest.kt
git commit -m "feat: persist report metadata"
```

---

## Task 9: Update Frontend API Types And Current Session UI

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`

- [x] **Step 1: Update shared types**

In `front/shared/api/readmates.ts`, extend `CurrentSessionResponse.currentSession` with:

```ts
myCheckin: null | {
  readingProgress: number;
  note: string;
};
myQuestions: Array<{
  priority: number;
  text: string;
  draftThought: string | null;
  authorName: string;
  authorShortName: string;
}>;
myOneLineReview: null | {
  text: string;
};
myLongReview: null | {
  body: string;
};
board: {
  questions: Array<{
    priority: number;
    text: string;
    draftThought: string | null;
    authorName: string;
    authorShortName: string;
  }>;
  checkins: Array<{
    authorName: string;
    authorShortName: string;
    readingProgress: number;
    note: string;
  }>;
  highlights: Array<{
    text: string;
    sortOrder: number;
  }>;
};
```

- [x] **Step 2: Add frontend test for API board data**

In `current-session.test.tsx`, set test data with `board.questions`, `board.checkins`, and `board.highlights`, then assert:

```ts
expect(screen.getByText("API에서 온 질문")).toBeInTheDocument();
expect(screen.getByText("API에서 온 체크인")).toBeInTheDocument();
expect(screen.getByText("API에서 온 하이라이트")).toBeInTheDocument();
expect(screen.queryByText("분류는 세계를 이해하기 위한 도구일까요")).not.toBeInTheDocument();
```

- [x] **Step 3: Replace static board arrays in component**

In `current-session.tsx`, remove `boardQuestions`, `boardCheckins`, and `boardHighlights`. Render:

```tsx
{boardTab === "questions" ? <BoardQuestions questions={session.board.questions} /> : null}
{boardTab === "checkins" ? <BoardCheckins checkins={session.board.checkins} /> : null}
{boardTab === "highlights" ? <BoardHighlights highlights={session.board.highlights} /> : null}
```

Update child component props accordingly. For empty arrays, render a small empty state:

```tsx
<p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
  아직 공유된 기록이 없습니다.
</p>
```

Initialize personal form state from `session.myCheckin`, `session.myQuestions[0]`, `session.myOneLineReview`, and `session.myLongReview`.

- [x] **Step 4: Run frontend current-session test**

Run:

```bash
pnpm --dir front test -- current-session.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit current session frontend**

Run:

```bash
git add front/shared/api/readmates.ts front/features/current-session/components/current-session.tsx front/tests/unit/current-session.test.tsx
git commit -m "feat: render current session board from api"
```

---

## Task 10: Wire Archive, Notes, My Page, And Reports Frontend

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/app/(app)/app/archive/page.tsx`
- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/app/(app)/app/notes/page.tsx`
- Modify: `front/features/archive/components/notes-feed-page.tsx`
- Modify: `front/app/(app)/app/me/page.tsx`
- Modify: `front/features/archive/components/my-page.tsx`
- Modify: `front/tests/unit/archive-page.test.tsx`
- Modify: `front/tests/unit/notes-feed-page.test.tsx`
- Modify: `front/tests/unit/my-page.test.tsx`

- [x] **Step 1: Add shared types**

Add:

```ts
export type MyArchiveQuestionItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  priority: number;
  text: string;
  draftThought: string | null;
};

export type MyArchiveReviewItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  kind: "ONE_LINE_REVIEW" | "LONG_REVIEW";
  text: string;
};

export type ReportListItem = {
  reportId: string;
  fileName: string;
  sessionNumber: number;
};
```

Extend `NoteFeedItem`:

```ts
sessionId: string;
bookTitle: string;
date: string;
```

- [x] **Step 2: Fetch archive side-tab data**

In `front/app/(app)/app/archive/page.tsx`, fetch:

```tsx
const [sessions, questions, reviews, reports] = await Promise.all([
  fetchBff<ArchiveSessionItem[]>("/api/archive/sessions"),
  fetchBff<MyArchiveQuestionItem[]>("/api/archive/me/questions"),
  fetchBff<MyArchiveReviewItem[]>("/api/archive/me/reviews"),
  fetchBff<ReportListItem[]>("/api/reports/me"),
]);

return <ArchivePage sessions={sessions} questions={questions} reviews={reviews} reports={reports} />;
```

- [x] **Step 3: Replace archive static arrays**

In `archive-page.tsx`, remove `reviews` and `questions` constants. Change component props to:

```ts
export default function ArchivePage({
  sessions,
  questions,
  reviews,
  reports,
}: {
  sessions: ArchiveSessionItem[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
  reports: ReportListItem[];
})
```

Render empty states when arrays are empty. Report links must use:

```tsx
href={`/api/bff/api/reports/${report.reportId}/content`}
```

- [x] **Step 4: Update notes session index**

In `notes-feed-page.tsx`, replace:

```ts
book: `No.${String(number).padStart(2, "0")} 기록`,
```

with the first item's real `bookTitle` for that session:

```ts
book: items.find((item) => item.sessionNumber === number)?.bookTitle ?? `No.${String(number).padStart(2, "0")}`,
```

- [x] **Step 5: Replace my page report and rhythm static data**

In `front/app/(app)/app/me/page.tsx`, fetch reports:

```tsx
const [data, reports] = await Promise.all([
  fetchBff<MyPageResponse>("/api/app/me"),
  fetchBff<ReportListItem[]>("/api/reports/me"),
]);

return <MyPage data={data} reports={reports} />;
```

In `my-page.tsx`, remove the `reports` constant. Keep notification/preferences arrays only if they are static settings controls; label them as static settings, not data records. For rhythm, use `data.sessionCount` only and do not show fake No.8-No.13 markers.

- [x] **Step 6: Update tests to assert sample removal**

Add assertions:

```ts
expect(screen.queryByText("맡겨진 소녀")).not.toBeInTheDocument();
expect(screen.queryByText("물고기는 존재하지 않는다")).not.toBeInTheDocument();
expect(screen.queryByText("feedback-13.html")).not.toBeInTheDocument();
```

Use real test fixtures with `팩트풀니스`, `가난한 찰리의 연감`, and `feedback-6-suhan.html`.

- [x] **Step 7: Run frontend archive tests**

Run:

```bash
pnpm --dir front test -- archive-page.test.tsx notes-feed-page.test.tsx my-page.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit member archive frontend**

Run:

```bash
git add front/shared/api/readmates.ts 'front/app/(app)/app/archive/page.tsx' front/features/archive/components/archive-page.tsx 'front/app/(app)/app/notes/page.tsx' front/features/archive/components/notes-feed-page.tsx 'front/app/(app)/app/me/page.tsx' front/features/archive/components/my-page.tsx front/tests/unit/archive-page.test.tsx front/tests/unit/notes-feed-page.test.tsx front/tests/unit/my-page.test.tsx
git commit -m "feat: wire archive pages to api data"
```

---

## Task 11: Wire Public Frontend To Public APIs

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/app/(public)/page.tsx`
- Modify: `front/features/public/components/public-home.tsx`
- Modify: `front/app/(public)/about/page.tsx`
- Modify: `front/features/public/components/public-club.tsx`
- Modify: `front/app/(public)/sessions/[sessionId]/page.tsx`
- Modify: `front/features/public/components/public-session.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/tests/unit/public-home.test.tsx`

- [x] **Step 1: Add public response types**

In `readmates.ts`, add:

```ts
export type PublicClubResponse = {
  clubName: string;
  tagline: string;
  about: string;
  stats: {
    sessions: number;
    books: number;
    members: number;
  };
  recentSessions: PublicSessionListItem[];
};

export type PublicSessionListItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  date: string;
  summary: string;
};

export type PublicSessionDetailResponse = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  bookAuthor: string;
  date: string;
  summary: string;
  highlights: string[];
  oneLiners: Array<{
    authorName: string;
    authorShortName: string;
    text: string;
  }>;
};
```

- [x] **Step 2: Fetch public home data**

In `front/app/(public)/page.tsx`, fetch from backend through server-side fetch helper or direct backend URL:

```tsx
const data = await fetchPublic<PublicClubResponse>("/api/public/club");
return <PublicHome data={data} />;
```

If no public helper exists, create a local helper in the page:

```ts
async function fetchPublic<T>(path: string): Promise<T> {
  const baseUrl = process.env.READMATES_API_BASE_URL ?? "http://127.0.0.1:8080";
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`ReadMates public API failed: ${response.status}`);
  return response.json() as Promise<T>;
}
```

- [x] **Step 3: Replace `session-13` public links**

In `top-nav.tsx`, change public record href from `"/sessions/session-13"` to the latest public session URL supplied by component props where possible. If `TopNav` cannot receive data without larger layout changes, use `"/"` for the public nav record link and let the home page show real session links.

In `public-home.tsx` and `public-club.tsx`, use:

```tsx
href={`/sessions/${session.sessionId}`}
```

- [x] **Step 4: Wire public session detail page**

In `front/app/(public)/sessions/[sessionId]/page.tsx`, remove the `sessionId !== "session-13"` check. Fetch:

```tsx
const session = await fetchPublic<PublicSessionDetailResponse>(`/api/public/sessions/${sessionId}`);
return <PublicSession session={session} />;
```

Call `notFound()` on non-OK response.

- [x] **Step 5: Update public components**

Change component props:

```ts
export default function PublicHome({ data }: { data: PublicClubResponse })
export default function PublicClub({ data }: { data: PublicClubResponse })
export default function PublicSession({ session }: { session: PublicSessionDetailResponse })
```

Remove static people names like `정우진`, `김하린`, `윤서아`, `박도윤`. Render one-liners from API. When arrays are empty, render a concise empty state.

- [x] **Step 6: Update public tests**

In `public-home.test.tsx`, assert:

```ts
expect(screen.getByText("읽는사이")).toBeInTheDocument();
expect(screen.getByText("가난한 찰리의 연감")).toBeInTheDocument();
expect(screen.queryByText("물고기는 존재하지 않는다")).not.toBeInTheDocument();
expect(screen.queryByText("session-13")).not.toBeInTheDocument();
```

- [x] **Step 7: Run public frontend tests**

Run:

```bash
pnpm --dir front test -- public-home.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit public frontend**

Run:

```bash
git add front/shared/api/readmates.ts 'front/app/(public)/page.tsx' front/features/public/components/public-home.tsx 'front/app/(public)/about/page.tsx' front/features/public/components/public-club.tsx 'front/app/(public)/sessions/[sessionId]/page.tsx' front/features/public/components/public-session.tsx front/shared/ui/top-nav.tsx front/tests/unit/public-home.test.tsx
git commit -m "feat: wire public pages to readmates api"
```

---

## Task 12: Wire Host Frontend To Host APIs

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/app/(app)/app/host/page.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/app/(app)/app/host/sessions/[sessionId]/edit/page.tsx`
- Modify: `front/app/(app)/app/host/sessions/new/page.tsx`
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [x] **Step 1: Add host detail types**

In `readmates.ts`, add:

```ts
export type HostSessionDetailResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  date: string;
  state: SessionState;
  attendees: Array<{
    membershipId: string;
    displayName: string;
    shortName: string;
    rsvpStatus: RsvpStatus;
    attendanceStatus: AttendanceStatus;
  }>;
  reports: Array<{
    membershipId: string;
    displayName: string;
    fileName: string | null;
    uploaded: boolean;
  }>;
};
```

- [x] **Step 2: Remove host editor static rows**

In `host-session-editor.tsx`, remove `attendanceRows` and `reportRows`. Accept optional `session?: HostSessionDetailResponse`. For new sessions, hide attendance/report panels or show:

```tsx
<p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
  세션을 만든 뒤 참석과 리포트를 관리할 수 있습니다.
</p>
```

For edit sessions, render `session.attendees` and `session.reports`.

- [x] **Step 3: Fetch host edit data**

In `front/app/(app)/app/host/sessions/[sessionId]/edit/page.tsx`, fetch:

```tsx
const data = await fetchBff<HostSessionDetailResponse>(`/api/host/sessions/${sessionId}`);
return <HostSessionEditor session={data} />;
```

Keep `/new` rendering `<HostSessionEditor />`.

- [x] **Step 4: Update dashboard links**

In `host-dashboard.tsx`, change current session edit links to:

```tsx
href={session ? `/app/host/sessions/${session.sessionId}/edit` : "/app/host/sessions/new"}
```

Ensure host alert counts come only from `HostDashboardResponse`.

- [x] **Step 5: Update tests**

Add assertions:

```ts
expect(screen.getByText("김호스트")).toBeInTheDocument();
expect(screen.queryByText("이서윤")).not.toBeInTheDocument();
expect(screen.queryByText("feedback-14-seoyun.html")).not.toBeInTheDocument();
```

- [x] **Step 6: Run host frontend tests**

Run:

```bash
pnpm --dir front test -- host-dashboard.test.tsx host-session-editor.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit host frontend**

Run:

```bash
git add front/shared/api/readmates.ts 'front/app/(app)/app/host/page.tsx' front/features/host/components/host-dashboard.tsx 'front/app/(app)/app/host/sessions/[sessionId]/edit/page.tsx' 'front/app/(app)/app/host/sessions/new/page.tsx' front/features/host/components/host-session-editor.tsx front/tests/unit/host-dashboard.test.tsx front/tests/unit/host-session-editor.test.tsx
git commit -m "feat: wire host screens to api data"
```

---

## Task 13: Documentation, Full Verification, And Sample Sweep

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-19-readmates-seed-and-dev-login-design.md`
- Modify: `docs/superpowers/plans/2026-04-19-readmates-seed-dev-login-implementation-plan.md`

- [x] **Step 1: Search for old sample identifiers**

Run:

```bash
rg -n "session-13|session-14|물고기는 존재하지 않는다|맡겨진 소녀|이서윤|정하진|민지호|박도윤|김하린|윤서아|feedback-13|feedback-14" front server README.md docs/superpowers
```

Expected: matches may remain only in historical plans/specs that explicitly describe previous sample state. No runtime frontend/backend file should match.

- [x] **Step 2: Update README current status**

Replace README partial-state bullets with:

```markdown
Recently completed in the real-data wiring pass:

- Public pages read from `/api/public/**` and show seeded ReadMates records instead of static `session-13` content.
- Current session reads hydrate saved check-in, saved questions, and the shared board.
- One-line and long review endpoints persist to DB for the current open session.
- Host dashboard, host session detail/update, attendance confirmation, and publication are DB-backed.
- Report upload writes `feedback_reports` metadata, and report list/content endpoints enforce member/host access.
- Member archive side tabs and My page report lists render API data or empty states instead of design samples.

Still partial:

- Invitation preview remains a fixed sample response; full invitation acceptance is not wired to a controller.
- Feedback HTML generation is manual upload only; there is no automatic report generator.
```

- [x] **Step 3: Run backend tests**

Run:

```bash
./server/gradlew -p server test
```

Expected: PASS.

- [x] **Step 4: Run frontend unit tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

- [x] **Step 5: Run frontend lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS.

- [x] **Step 6: Run e2e flow**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS, or document the exact missing environment if backend/frontend servers are not running.

- [x] **Step 7: Commit documentation and final fixes**

Run:

```bash
git add README.md docs/superpowers/specs/2026-04-19-readmates-seed-and-dev-login-design.md docs/superpowers/plans/2026-04-19-readmates-seed-dev-login-implementation-plan.md
git commit -m "docs: sync readmates real data status"
```

If test-driven fixes touched runtime files, include only those files that belong to the fix in the same final commit with a message that names the fix.

---

## Self-Review

Spec coverage:

- Recode-derived attendance and seed data: Tasks 1-3.
- Questions, one-liners, highlights, check-ins: Tasks 1-3 and Task 5.
- Current-session saved data and shared board: Task 4 and Task 9.
- Archive side tabs, notes metadata, My page reports: Task 5 and Task 10.
- Public pages and `/api/public/**`: Task 6 and Task 11.
- Host dashboard/session/attendance/publication: Task 7 and Task 12.
- Report metadata and member-scoped content: Task 8 and Task 10.
- README status cleanup and sample sweep: Task 13.

Placeholder scan:

- No banned planning markers are present.
- The plan uses exact file paths, commands, expected outcomes, and concrete payloads.

Type consistency:

- Backend public response names match frontend public response names.
- Current-session `board.questions`, `board.checkins`, `board.highlights` fields match frontend type names.
- Archive side-tab response names match frontend type names.
- Report `ReportListItem` remains `reportId`, `fileName`, `sessionNumber` across backend and frontend.
