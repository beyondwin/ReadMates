package com.readmates.note.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class MemberActionControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @BeforeEach
    fun resetSeedMemberLifecycle() {
        jdbcTemplate.update(RESET_MEMBER5_ACTIVE_SQL)
    }

    @Test
    fun `rsvp returns conflict when no open session exists`() {
        mockMvc.patch("/api/sessions/current/rsvp") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"status":"GOING"}"""
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test
    fun `checkin returns conflict when no open session exists`() {
        mockMvc.put("/api/sessions/current/checkin") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"readingProgress":80}"""
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test
    fun `question returns conflict when no open session exists`() {
        mockMvc.post("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"priority":1,"text":"무엇을 이야기하면 좋을까요?","draftThought":"첫 생각"}"""
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test
    @Sql(
        statements = [
            OPEN_SESSION_WITHOUT_PARTICIPANT_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_OPEN_SESSION_WITHOUT_PARTICIPANT_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `checkin returns conflict when member is not a participant in open session`() {
        mockMvc.put("/api/sessions/current/checkin") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"readingProgress":80}"""
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test
    @Sql(
        statements = [
            OPEN_SESSION_WITHOUT_PARTICIPANT_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_OPEN_SESSION_WITHOUT_PARTICIPANT_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `question returns conflict when member is not a participant in open session`() {
        mockMvc.post("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"priority":1,"text":"참가자가 아닌 질문","draftThought":null}"""
        }.andExpect {
            status { isConflict() }
        }
    }

    @Test
    @Sql(
        statements = [CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL, OPEN_SESSION_WITH_PARTICIPANTS_SQL],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL, RESET_MEMBER5_ACTIVE_SQL],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `suspended member cannot write current session activity`() {
        jdbcTemplate.update(
            """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.status = 'SUSPENDED'
            where users.email = 'member5@example.com'
            """.trimIndent(),
        )

        mockMvc.post("/api/sessions/current/questions") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"priority":1,"text":"정지 중 질문","draftThought":null}"""
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    @Sql(
        statements = [CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL, OPEN_SESSION_WITH_PARTICIPANTS_SQL],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `removed participant cannot write current session activity`() {
        jdbcTemplate.update(
            """
            update session_participants
            join memberships on memberships.id = session_participants.membership_id
            join users on users.id = memberships.user_id
            set session_participants.participation_status = 'REMOVED'
            where users.email = 'member5@example.com'
              and session_participants.session_id = '00000000-0000-0000-0000-000000009102'
            """.trimIndent(),
        )

        mockMvc.put("/api/sessions/current/checkin") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"readingProgress":80}"""
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL,
            OPEN_SESSION_WITH_PARTICIPANTS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `persists checkin reading progress for current member`() {
        mockMvc.put("/api/sessions/current/checkin") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"readingProgress":80}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.readingProgress") { value(80) }
            jsonPath("$.note") { doesNotExist() }
        }

        val readingProgress = jdbcTemplate.queryForObject(
            """
            select reading_checkins.reading_progress
            from reading_checkins
            join memberships on memberships.id = reading_checkins.membership_id
              and memberships.club_id = reading_checkins.club_id
            join users on users.id = memberships.user_id
            where reading_checkins.session_id = '00000000-0000-0000-0000-000000009102'
              and users.email = 'member5@example.com'
            """.trimIndent(),
            Int::class.java,
        )
        assertEquals(80, readingProgress)
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL,
            OPEN_SESSION_WITH_PARTICIPANTS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `persists one-line and long reviews for current member`() {
        mockMvc.post("/api/sessions/current/one-line-reviews") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"text":"저장된 한줄평"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.text") { value("저장된 한줄평") }
        }

        mockMvc.post("/api/sessions/current/reviews") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"body":"저장된 장문 서평"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.body") { value("저장된 장문 서평") }
        }

        val oneLineReview = jdbcTemplate.query(
            """
            select one_line_reviews.text
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            where one_line_reviews.session_id = '00000000-0000-0000-0000-000000009102'
              and users.email = 'member5@example.com'
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("text") },
        ).firstOrNull()
        val oneLineReviewVisibility = jdbcTemplate.query(
            """
            select one_line_reviews.visibility
            from one_line_reviews
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            where one_line_reviews.session_id = '00000000-0000-0000-0000-000000009102'
              and users.email = 'member5@example.com'
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("visibility") },
        ).firstOrNull()
        val longReview = jdbcTemplate.query(
            """
            select long_reviews.body
            from long_reviews
            join memberships on memberships.id = long_reviews.membership_id
              and memberships.club_id = long_reviews.club_id
            join users on users.id = memberships.user_id
            where long_reviews.session_id = '00000000-0000-0000-0000-000000009102'
              and users.email = 'member5@example.com'
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("body") },
        ).firstOrNull()

        assertEquals("저장된 한줄평", oneLineReview)
        assertEquals("SESSION", oneLineReviewVisibility)
        assertEquals("저장된 장문 서평", longReview)

        val oneLineReviewSessionNumbers = jdbcTemplate.query(
            """
            select sessions.number
            from one_line_reviews
            join sessions on sessions.id = one_line_reviews.session_id
              and sessions.club_id = one_line_reviews.club_id
            join memberships on memberships.id = one_line_reviews.membership_id
              and memberships.club_id = one_line_reviews.club_id
            join users on users.id = memberships.user_id
            where one_line_reviews.club_id = '00000000-0000-0000-0000-000000000001'
              and sessions.number in (97, 99)
              and users.email = 'member5@example.com'
            order by sessions.number
            """.trimIndent(),
            { resultSet, _ -> resultSet.getInt("number") },
        )
        val longReviewSessionNumbers = jdbcTemplate.query(
            """
            select sessions.number
            from long_reviews
            join sessions on sessions.id = long_reviews.session_id
              and sessions.club_id = long_reviews.club_id
            join memberships on memberships.id = long_reviews.membership_id
              and memberships.club_id = long_reviews.club_id
            join users on users.id = memberships.user_id
            where long_reviews.club_id = '00000000-0000-0000-0000-000000000001'
              and sessions.number in (97, 99)
              and users.email = 'member5@example.com'
            order by sessions.number
            """.trimIndent(),
            { resultSet, _ -> resultSet.getInt("number") },
        )

        assertEquals(listOf(99), oneLineReviewSessionNumbers)
        assertEquals(listOf(99), longReviewSessionNumbers)
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL,
            OPEN_SESSION_WITH_PARTICIPANTS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `blank long review save clears the current member review`() {
        mockMvc.post("/api/sessions/current/reviews") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"body":"저장 후 지울 장문 서평"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.body") { value("저장 후 지울 장문 서평") }
        }

        mockMvc.post("/api/sessions/current/reviews") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"body":" "}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.body") { value("") }
        }

        val longReviewCount = jdbcTemplate.queryForObject(
            """
            select count(*)
            from long_reviews
            join memberships on memberships.id = long_reviews.membership_id
              and memberships.club_id = long_reviews.club_id
            join users on users.id = memberships.user_id
            where long_reviews.session_id = '00000000-0000-0000-0000-000000009102'
              and users.email = 'member5@example.com'
            """.trimIndent(),
            Int::class.java,
        )

        assertEquals(0, longReviewCount)
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_LATEST_OPEN_SESSION_WITHOUT_MEMBER_SQL,
            LATEST_OPEN_SESSION_WITHOUT_MEMBER_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_LATEST_OPEN_SESSION_WITHOUT_MEMBER_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `reviews conflict when current session excludes member even if older open session includes member`() {
        mockMvc.post("/api/sessions/current/one-line-reviews") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"text":"저장되면 안 되는 한줄평"}"""
        }.andExpect {
            status { isConflict() }
        }

        mockMvc.post("/api/sessions/current/reviews") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"body":"저장되면 안 되는 장문 서평"}"""
        }.andExpect {
            status { isConflict() }
        }

        val oneLineReviewCount = reviewCountForLatestOpenSessionWithoutMemberScenario("one_line_reviews")
        val longReviewCount = reviewCountForLatestOpenSessionWithoutMemberScenario("long_reviews")

        assertEquals(0, oneLineReviewCount)
        assertEquals(0, longReviewCount)
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_LATEST_OPEN_SESSION_WITHOUT_MEMBER_SQL,
            LATEST_OPEN_SESSION_WITH_OLDER_REMOVED_MEMBER_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_LATEST_OPEN_SESSION_WITHOUT_MEMBER_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `older removed participation does not make latest non participant forbidden`() {
        mockMvc.put("/api/sessions/current/checkin") {
            with(user("member5@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"readingProgress":80}"""
        }.andExpect {
            status { isConflict() }
        }
    }

    private fun reviewCountForLatestOpenSessionWithoutMemberScenario(tableName: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from $tableName
            join sessions on sessions.id = $tableName.session_id
              and sessions.club_id = $tableName.club_id
            join memberships on memberships.id = $tableName.membership_id
              and memberships.club_id = $tableName.club_id
            join users on users.id = memberships.user_id
            where $tableName.club_id = '00000000-0000-0000-0000-000000000001'
              and sessions.number in (96, 100)
              and users.email = 'member5@example.com'
            """.trimIndent(),
            Int::class.java,
        ) ?: 0

    companion object {
        private const val OPEN_SESSION_WITHOUT_PARTICIPANT_SQL = """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state
            )
            values (
              '00000000-0000-0000-0000-000000009101',
              '00000000-0000-0000-0000-000000000001',
              98,
              '참가자 없는 열린 모임',
              '검증 책',
              '검증 저자',
              null,
              null,
              '2026-05-20',
              '19:30',
              '21:30',
              '테스트 공간',
              '2026-05-19 14:59:00.000000',
              'OPEN'
            )
            on duplicate key update
              title = values(title),
              book_title = values(book_title),
              book_author = values(book_author),
              session_date = values(session_date),
              start_time = values(start_time),
              end_time = values(end_time),
              location_label = values(location_label),
              question_deadline_at = values(question_deadline_at),
              state = values(state);
        """

        private const val CLEANUP_OPEN_SESSION_WITHOUT_PARTICIPANT_SQL = """
            delete from reading_checkins where session_id = '00000000-0000-0000-0000-000000009101';
            delete from questions where session_id = '00000000-0000-0000-0000-000000009101';
            delete from sessions where id = '00000000-0000-0000-0000-000000009101';
        """

        private const val OPEN_SESSION_WITH_PARTICIPANTS_SQL = """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state
            )
            values (
              '00000000-0000-0000-0000-000000009097',
              '00000000-0000-0000-0000-000000000001',
              97,
              '이전 리뷰 저장 열린 모임',
              '이전 검증 책',
              '이전 검증 저자',
              null,
              null,
              '2026-05-13',
              '19:30',
              '21:30',
              '테스트 공간',
              '2026-05-12 14:59:00.000000',
              'OPEN'
            )
            on duplicate key update
              title = values(title),
              book_title = values(book_title),
              book_author = values(book_author),
              session_date = values(session_date),
              start_time = values(start_time),
              end_time = values(end_time),
              location_label = values(location_label),
              question_deadline_at = values(question_deadline_at),
              state = values(state);

            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state
            )
            values (
              '00000000-0000-0000-0000-000000009102',
              '00000000-0000-0000-0000-000000000001',
              99,
              '리뷰 저장 열린 모임',
              '검증 책',
              '검증 저자',
              null,
              null,
              '2026-05-20',
              '19:30',
              '21:30',
              '테스트 공간',
              '2026-05-19 14:59:00.000000',
              'OPEN'
            )
            on duplicate key update
              title = values(title),
              book_title = values(book_title),
              book_author = values(book_author),
              session_date = values(session_date),
              start_time = values(start_time),
              end_time = values(end_time),
              location_label = values(location_label),
              question_deadline_at = values(question_deadline_at),
              state = values(state);

            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000009097', memberships.id, 'GOING', 'UNKNOWN'
            from memberships
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
            on duplicate key update
              rsvp_status = values(rsvp_status),
              attendance_status = values(attendance_status);

            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000009102', memberships.id, 'GOING', 'UNKNOWN'
            from memberships
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
            on duplicate key update
              rsvp_status = values(rsvp_status),
              attendance_status = values(attendance_status);
        """

        private const val CLEANUP_OPEN_SESSION_WITH_PARTICIPANTS_SQL = """
            delete from long_reviews where session_id = '00000000-0000-0000-0000-000000009097';
            delete from long_reviews where session_id = '00000000-0000-0000-0000-000000009102';
            delete from one_line_reviews where session_id = '00000000-0000-0000-0000-000000009097';
            delete from one_line_reviews where session_id = '00000000-0000-0000-0000-000000009102';
            delete from reading_checkins where session_id = '00000000-0000-0000-0000-000000009097';
            delete from reading_checkins where session_id = '00000000-0000-0000-0000-000000009102';
            delete from questions where session_id = '00000000-0000-0000-0000-000000009097';
            delete from questions where session_id = '00000000-0000-0000-0000-000000009102';
            delete from session_participants where session_id = '00000000-0000-0000-0000-000000009097';
            delete from session_participants where session_id = '00000000-0000-0000-0000-000000009102';
            delete from sessions where id = '00000000-0000-0000-0000-000000009097';
            delete from sessions where id = '00000000-0000-0000-0000-000000009102';
        """

        private const val LATEST_OPEN_SESSION_WITHOUT_MEMBER_SQL = """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state
            )
            values (
              '00000000-0000-0000-0000-000000009096',
              '00000000-0000-0000-0000-000000000001',
              96,
              '이전 참가 열린 모임',
              '이전 검증 책',
              '이전 검증 저자',
              null,
              null,
              '2026-05-13',
              '19:30',
              '21:30',
              '테스트 공간',
              '2026-05-12 14:59:00.000000',
              'OPEN'
            )
            on duplicate key update
              title = values(title),
              book_title = values(book_title),
              book_author = values(book_author),
              session_date = values(session_date),
              start_time = values(start_time),
              end_time = values(end_time),
              location_label = values(location_label),
              question_deadline_at = values(question_deadline_at),
              state = values(state);

            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state
            )
            values (
              '00000000-0000-0000-0000-000000009100',
              '00000000-0000-0000-0000-000000000001',
              100,
              '최신 비참가 열린 모임',
              '최신 검증 책',
              '최신 검증 저자',
              null,
              null,
              '2026-05-20',
              '19:30',
              '21:30',
              '테스트 공간',
              '2026-05-19 14:59:00.000000',
              'OPEN'
            )
            on duplicate key update
              title = values(title),
              book_title = values(book_title),
              book_author = values(book_author),
              session_date = values(session_date),
              start_time = values(start_time),
              end_time = values(end_time),
              location_label = values(location_label),
              question_deadline_at = values(question_deadline_at),
              state = values(state);

            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000009096', memberships.id, 'GOING', 'UNKNOWN'
            from memberships
            join users on users.id = memberships.user_id
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = 'member5@example.com'
            on duplicate key update
              rsvp_status = values(rsvp_status),
              attendance_status = values(attendance_status);

            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000009100', memberships.id, 'GOING', 'UNKNOWN'
            from memberships
            join users on users.id = memberships.user_id
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email <> 'member5@example.com'
            on duplicate key update
              rsvp_status = values(rsvp_status),
              attendance_status = values(attendance_status);
        """

        private const val LATEST_OPEN_SESSION_WITH_OLDER_REMOVED_MEMBER_SQL = """
            $LATEST_OPEN_SESSION_WITHOUT_MEMBER_SQL

            update session_participants
            join memberships on memberships.id = session_participants.membership_id
            join users on users.id = memberships.user_id
            set session_participants.participation_status = 'REMOVED'
            where users.email = 'member5@example.com'
              and session_participants.session_id = '00000000-0000-0000-0000-000000009096';
        """

        private const val CLEANUP_LATEST_OPEN_SESSION_WITHOUT_MEMBER_SQL = """
            delete from long_reviews where session_id = '00000000-0000-0000-0000-000000009096';
            delete from long_reviews where session_id = '00000000-0000-0000-0000-000000009100';
            delete from one_line_reviews where session_id = '00000000-0000-0000-0000-000000009096';
            delete from one_line_reviews where session_id = '00000000-0000-0000-0000-000000009100';
            delete from reading_checkins where session_id = '00000000-0000-0000-0000-000000009096';
            delete from reading_checkins where session_id = '00000000-0000-0000-0000-000000009100';
            delete from questions where session_id = '00000000-0000-0000-0000-000000009096';
            delete from questions where session_id = '00000000-0000-0000-0000-000000009100';
            delete from session_participants where session_id = '00000000-0000-0000-0000-000000009096';
            delete from session_participants where session_id = '00000000-0000-0000-0000-000000009100';
            delete from sessions where id = '00000000-0000-0000-0000-000000009096';
            delete from sessions where id = '00000000-0000-0000-0000-000000009100';
        """

        private const val RESET_MEMBER5_ACTIVE_SQL = """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.status = 'ACTIVE'
            where users.email = 'member5@example.com';
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
