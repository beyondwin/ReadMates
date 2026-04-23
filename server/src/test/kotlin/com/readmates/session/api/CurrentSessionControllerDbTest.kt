package com.readmates.session.api

import com.readmates.support.MySqlTestContainer
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class CurrentSessionControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `returns empty current session when only seeded sessions exist`() {
        mockMvc.get("/api/sessions/current") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.currentSession") { value(null) }
        }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_GENERATED_SESSIONS_SQL,
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator, book_link,
              session_date, start_time, end_time, location_label, question_deadline_at, state
            )
            values (
              '00000000-0000-0000-0000-000000000777',
              '00000000-0000-0000-0000-000000000001',
              7, '7회차 · 테스트 책', '테스트 책', '테스트 저자', null, null,
              '2026-05-20', '20:00', '22:00', '온라인',
              '2026-05-19 14:59:00.000000', 'OPEN'
            )
            on duplicate key update state = values(state);
            """,
            """
            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000000777', memberships.id, 'GOING', 'UNKNOWN'
            from memberships
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
            on duplicate key update rsvp_status = values(rsvp_status);
            """,
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            select '00000000-0000-0000-0000-000000009001', memberships.club_id, '00000000-0000-0000-0000-000000000777', memberships.id,
                   1, '현재 세션 hydrate 질문', 'hydrate 초안'
            from memberships join users on users.id = memberships.user_id
            where users.email = 'member5@example.com'
            on duplicate key update text = values(text), draft_thought = values(draft_thought);
            """,
            """
            insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress)
            select '00000000-0000-0000-0000-000000009002', memberships.club_id, '00000000-0000-0000-0000-000000000777', memberships.id,
                   72
            from memberships join users on users.id = memberships.user_id
            where users.email = 'member5@example.com'
            on duplicate key update reading_progress = values(reading_progress);
            """,
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            select '00000000-0000-0000-0000-000000009004', memberships.club_id, '00000000-0000-0000-0000-000000000777', memberships.id,
                   '현재 세션 hydrate 한줄평', 'SESSION'
            from memberships join users on users.id = memberships.user_id
            where users.email = 'member1@example.com'
            on duplicate key update text = values(text), visibility = values(visibility);
            """,
            """
            insert into highlights (id, club_id, session_id, text, sort_order)
            values ('00000000-0000-0000-0000-000000009003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000777', '현재 세션 hydrate 하이라이트', 0)
            on duplicate key update text = values(text);
            """,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_GENERATED_SESSIONS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `current session returns my saved notes and shared board`() {
        mockMvc.get("/api/sessions/current") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.currentSession.sessionId") { value("00000000-0000-0000-0000-000000000777") }
            jsonPath("$.currentSession.sessionNumber") { value(7) }
            jsonPath("$.currentSession.title") { value("7회차 · 테스트 책") }
            jsonPath("$.currentSession.bookTitle") { value("테스트 책") }
            jsonPath("$.currentSession.bookAuthor") { value("테스트 저자") }
            jsonPath("$.currentSession.bookLink") { value(null) }
            jsonPath("$.currentSession.bookImageUrl") { value(null) }
            jsonPath("$.currentSession.date") { value("2026-05-20") }
            jsonPath("$.currentSession.startTime") { value("20:00") }
            jsonPath("$.currentSession.endTime") { value("22:00") }
            jsonPath("$.currentSession.locationLabel") { value("온라인") }
            jsonPath("$.currentSession.meetingUrl") { value(null) }
            jsonPath("$.currentSession.meetingPasscode") { value(null) }
            jsonPath("$.currentSession.questionDeadlineAt") { value("2026-05-19T14:59Z") }
            jsonPath("$.currentSession.myRsvpStatus") { value("GOING") }
            jsonPath("$.currentSession.myCheckin.readingProgress") { value(72) }
            jsonPath(removedJsonPath("$.currentSession.my", "Checkin.", "note")) { doesNotExist() }
            jsonPath("$.currentSession.myQuestions[0].priority") { value(1) }
            jsonPath("$.currentSession.myQuestions[0].text") { value("현재 세션 hydrate 질문") }
            jsonPath("$.currentSession.myQuestions[0].draftThought") { value("hydrate 초안") }
            jsonPath("$.currentSession.myQuestions[0].authorName") { value("이멤버5") }
            jsonPath("$.currentSession.myQuestions[0].authorShortName") { value("멤버5") }
            jsonPath("$.currentSession.myOneLineReview") { value(null) }
            jsonPath("$.currentSession.myLongReview") { value(null) }
            jsonPath("$.currentSession.board.questions[0].authorName") { value("이멤버5") }
            jsonPath("$.currentSession.board.questions[0].authorShortName") { value("멤버5") }
            jsonPath("$.currentSession.board.questions[0].priority") { value(1) }
            jsonPath("$.currentSession.board.questions[0].text") { value("현재 세션 hydrate 질문") }
            jsonPath("$.currentSession.board.questions[0].draftThought") { value("hydrate 초안") }
            jsonPath(removedJsonPath("$.currentSession.board.", "checkins")) { doesNotExist() }
            jsonPath("$.currentSession.board.oneLineReviews.length()") { value(greaterThan(0)) }
            jsonPath("$.currentSession.board.oneLineReviews[?(@.text == '현재 세션 hydrate 한줄평')].authorName") {
                value(hasItem("안멤버1"))
            }
            jsonPath("$.currentSession.board.oneLineReviews[?(@.text == '현재 세션 hydrate 한줄평')].authorShortName") {
                value(hasItem("멤버1"))
            }
            jsonPath("$.currentSession.board.oneLineReviews[?(@.text == '현재 세션 hydrate 한줄평')].text") {
                value(hasItem("현재 세션 hydrate 한줄평"))
            }
            jsonPath("$.currentSession.board.highlights[0].text") { value("현재 세션 hydrate 하이라이트") }
            jsonPath("$.currentSession.board.highlights[0].sortOrder") { value(0) }
            jsonPath("$.currentSession.attendees[0].membershipId") { exists() }
            jsonPath("$.currentSession.attendees[0].displayName") { value("김호스트") }
            jsonPath("$.currentSession.attendees[0].shortName") { value("호스트") }
            jsonPath("$.currentSession.attendees[0].role") { value("HOST") }
            jsonPath("$.currentSession.attendees[0].rsvpStatus") { value("GOING") }
            jsonPath("$.currentSession.attendees[0].attendanceStatus") { value("UNKNOWN") }
        }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_GENERATED_SESSIONS_SQL,
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator, book_link,
              session_date, start_time, end_time, location_label, question_deadline_at, state
            )
            values (
              '00000000-0000-0000-0000-000000000778',
              '00000000-0000-0000-0000-000000000001',
              8, '8회차 · 제외 테스트 책', '제외 테스트 책', '제외 테스트 저자', null, null,
              '2026-06-17', '20:00', '22:00', '온라인',
              '2026-06-16 14:59:00.000000', 'OPEN'
            )
            on duplicate key update state = values(state);
            """,
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            )
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000000778', memberships.id,
                   case when users.email = 'member5@example.com' then 'GOING' else 'NO_RESPONSE' end,
                   'UNKNOWN',
                   case when users.email = 'member5@example.com' then 'REMOVED' else 'ACTIVE' end
            from memberships
            join users on users.id = memberships.user_id
            where users.email in ('host@example.com', 'member1@example.com', 'member5@example.com')
            on duplicate key update
              rsvp_status = values(rsvp_status),
              participation_status = values(participation_status);
            """,
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            select '00000000-0000-0000-0000-000000009011', memberships.club_id, '00000000-0000-0000-0000-000000000778', memberships.id,
                   1, '제외된 참가자의 질문', '제외된 초안'
            from memberships join users on users.id = memberships.user_id
            where users.email = 'member5@example.com'
            on duplicate key update text = values(text), draft_thought = values(draft_thought);
            """,
            """
            insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress)
            select '00000000-0000-0000-0000-000000009012', memberships.club_id, '00000000-0000-0000-0000-000000000778', memberships.id,
                   64
            from memberships join users on users.id = memberships.user_id
            where users.email = 'member5@example.com'
            on duplicate key update reading_progress = values(reading_progress);
            """,
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            select '00000000-0000-0000-0000-000000009013', memberships.club_id, '00000000-0000-0000-0000-000000000778', memberships.id,
                   '제외된 참가자의 한줄평', 'SESSION'
            from memberships join users on users.id = memberships.user_id
            where users.email = 'member5@example.com'
            on duplicate key update text = values(text), visibility = values(visibility);
            """,
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            select '00000000-0000-0000-0000-000000009014', memberships.club_id, '00000000-0000-0000-0000-000000000778', memberships.id,
                   '활성 호스트의 세션 한줄평', 'SESSION'
            from memberships join users on users.id = memberships.user_id
            where users.email = 'host@example.com'
            on duplicate key update text = values(text), visibility = values(visibility);
            """,
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            select '00000000-0000-0000-0000-000000009015', memberships.club_id, '00000000-0000-0000-0000-000000000778', memberships.id,
                   '활성 멤버의 공개 한줄평', 'PUBLIC'
            from memberships join users on users.id = memberships.user_id
            where users.email = 'member1@example.com'
            on duplicate key update text = values(text), visibility = values(visibility);
            """,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_GENERATED_SESSIONS_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `removed current-session participant cannot see active board one-line reviews`() {
        mockMvc.get("/api/sessions/current") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.currentSession.sessionId") { value("00000000-0000-0000-0000-000000000778") }
            jsonPath("$.currentSession.myRsvpStatus") { value("NO_RESPONSE") }
            jsonPath("$.currentSession.myCheckin") { value(null) }
            jsonPath("$.currentSession.myQuestions.length()") { value(0) }
            jsonPath("$.currentSession.board.questions.length()") { value(0) }
            jsonPath(removedJsonPath("$.currentSession.board.", "checkins")) { doesNotExist() }
            jsonPath("$.currentSession.board.oneLineReviews.length()") { value(0) }
            jsonPath("$.currentSession.board.oneLineReviews[*].authorName") { value(not(hasItem("안멤버1"))) }
            jsonPath("$.currentSession.board.oneLineReviews[*].text") { value(not(hasItem("활성 호스트의 세션 한줄평"))) }
            jsonPath("$.currentSession.board.oneLineReviews[*].text") { value(not(hasItem("활성 멤버의 공개 한줄평"))) }
            jsonPath("$.currentSession.attendees.length()") { value(2) }
            jsonPath("$.currentSession.attendees[0].displayName") { value("김호스트") }
        }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_GENERATED_SESSIONS_SQL,
            MARK_MEMBER1_LEFT_SQL,
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_translator, book_link,
              session_date, start_time, end_time, location_label, question_deadline_at, state
            )
            values (
              '00000000-0000-0000-0000-000000000779',
              '00000000-0000-0000-0000-000000000001',
              9, '9회차 · 탈퇴 익명화 테스트 책', '탈퇴 익명화 테스트 책', '탈퇴 익명화 저자', null, null,
              '2026-07-15', '20:00', '22:00', '온라인',
              '2026-07-14 14:59:00.000000', 'OPEN'
            )
            on duplicate key update state = values(state);
            """,
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            )
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000000779', memberships.id,
                   case when users.email = 'member1@example.com' then 'GOING' else 'NO_RESPONSE' end,
                   'UNKNOWN',
                   'ACTIVE'
            from memberships
            join users on users.id = memberships.user_id
            where users.email in ('host@example.com', 'member1@example.com', 'member5@example.com')
            on duplicate key update
              rsvp_status = values(rsvp_status),
              participation_status = values(participation_status);
            """,
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            select '00000000-0000-0000-0000-000000009021', memberships.club_id, '00000000-0000-0000-0000-000000000779', memberships.id,
                   1, '탈퇴 회원 기존 질문', '탈퇴 회원 기존 초안'
            from memberships join users on users.id = memberships.user_id
            where users.email = 'member1@example.com'
            on duplicate key update text = values(text), draft_thought = values(draft_thought);
            """,
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            select '00000000-0000-0000-0000-000000009022', memberships.club_id, '00000000-0000-0000-0000-000000000779', memberships.id,
                   '탈퇴 회원 기존 한줄평', 'SESSION'
            from memberships join users on users.id = memberships.user_id
            where users.email = 'member1@example.com'
            on duplicate key update text = values(text), visibility = values(visibility);
            """,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_GENERATED_SESSIONS_SQL,
            RESET_MEMBER1_ACTIVE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `current session member board anonymizes left member authored records`() {
        mockMvc.get("/api/sessions/current") {
            with(user("member5@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.currentSession.sessionId") { value("00000000-0000-0000-0000-000000000779") }
            jsonPath("$.currentSession.board.questions[?(@.text == '탈퇴 회원 기존 질문')].authorName") {
                value(hasItem("탈퇴한 멤버"))
            }
            jsonPath("$.currentSession.board.questions[*].authorName") { value(not(hasItem("안멤버1"))) }
            jsonPath("$.currentSession.board.questions[?(@.text == '탈퇴 회원 기존 질문')].authorShortName") {
                value(hasItem("탈퇴한 멤버"))
            }
            jsonPath("$.currentSession.board.questions[*].authorShortName") { value(not(hasItem("멤버1"))) }
            jsonPath("$.currentSession.board.oneLineReviews[?(@.text == '탈퇴 회원 기존 한줄평')].authorName") {
                value(hasItem("탈퇴한 멤버"))
            }
            jsonPath("$.currentSession.board.oneLineReviews[*].authorName") { value(not(hasItem("안멤버1"))) }
            jsonPath("$.currentSession.board.oneLineReviews[?(@.text == '탈퇴 회원 기존 한줄평')].authorShortName") {
                value(hasItem("탈퇴한 멤버"))
            }
            jsonPath("$.currentSession.board.oneLineReviews[*].authorShortName") { value(not(hasItem("멤버1"))) }
            jsonPath("$.currentSession.attendees[*].displayName") { value(hasItem("탈퇴한 멤버")) }
            jsonPath("$.currentSession.attendees[*].displayName") { value(not(hasItem("안멤버1"))) }
            jsonPath("$.currentSession.attendees[*].shortName") { value(hasItem("탈퇴한 멤버")) }
            jsonPath("$.currentSession.attendees[*].shortName") { value(not(hasItem("멤버1"))) }
        }
    }

    companion object {
        private fun removedJsonPath(vararg parts: String) = parts.joinToString(separator = "")

        private const val MARK_MEMBER1_LEFT_SQL = """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.status = 'LEFT'
            where users.email = 'member1@example.com'
              and memberships.club_id = '00000000-0000-0000-0000-000000000001';
        """
        private const val RESET_MEMBER1_ACTIVE_SQL = """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.status = 'ACTIVE'
            where users.email = 'member1@example.com'
              and memberships.club_id = '00000000-0000-0000-0000-000000000001';
        """

        private const val CLEANUP_GENERATED_SESSIONS_SQL = """
            delete from feedback_reports
            where session_id in (
              select id from sessions
              where club_id = '00000000-0000-0000-0000-000000000001'
                and number >= 7
            );
            delete from session_feedback_documents
            where session_id in (
              select id from sessions
              where club_id = '00000000-0000-0000-0000-000000000001'
                and number >= 7
            );
            delete from public_session_publications
            where session_id in (
              select id from sessions
              where club_id = '00000000-0000-0000-0000-000000000001'
                and number >= 7
            );
            delete from highlights
            where session_id in (
              select id from sessions
              where club_id = '00000000-0000-0000-0000-000000000001'
                and number >= 7
            );
            delete from long_reviews
            where session_id in (
              select id from sessions
              where club_id = '00000000-0000-0000-0000-000000000001'
                and number >= 7
            );
            delete from one_line_reviews
            where session_id in (
              select id from sessions
              where club_id = '00000000-0000-0000-0000-000000000001'
                and number >= 7
            );
            delete from questions
            where session_id in (
              select id from sessions
              where club_id = '00000000-0000-0000-0000-000000000001'
                and number >= 7
            );
            delete from reading_checkins
            where session_id in (
              select id from sessions
              where club_id = '00000000-0000-0000-0000-000000000001'
                and number >= 7
            );
            delete from session_participants
            where session_id in (
              select id from sessions
              where club_id = '00000000-0000-0000-0000-000000000001'
                and number >= 7
            );
            delete from sessions
            where club_id = '00000000-0000-0000-0000-000000000001'
              and number >= 7;
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
