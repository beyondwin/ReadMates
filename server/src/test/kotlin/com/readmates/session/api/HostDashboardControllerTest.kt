package com.readmates.session.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
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
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID

private const val CLEANUP_GENERATED_HOST_SESSIONS_SQL = """
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
    where membership_id = '00000000-0000-0000-0000-000000029201';
    delete from session_participants
    where session_id in (
      select id from sessions
      where club_id = '00000000-0000-0000-0000-000000000001'
        and number >= 7
    );
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and number >= 7;
    delete from memberships
    where id = '00000000-0000-0000-0000-000000029201';
    delete from users
    where id = '00000000-0000-0000-0000-000000029101';
"""

private const val SEEDED_SESSION_ID = "00000000-0000-0000-0000-000000000006"
private const val DASHBOARD_MISSING_USER_ID = "00000000-0000-0000-0000-000000029101"
private const val DASHBOARD_MISSING_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000029201"

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        CLEANUP_GENERATED_HOST_SESSIONS_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        CLEANUP_GENERATED_HOST_SESSIONS_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class HostDashboardControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `returns zero current-session metrics when no session is open`() {
        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.rsvpPending") { value(0) }
            jsonPath("$.checkinMissing") { value(0) }
            jsonPath("$.publishPending") { value(0) }
            jsonPath("$.feedbackPending") { value(0) }
        }
    }

    @Test
    fun `dashboard counts one pending feedback document per attended closed session`() {
        val sessionId = createSessionSeven()
        val attendees = findFirstTwoSessionAttendees(UUID.fromString(sessionId))
        jdbcTemplate.update(
            """
            update session_participants
            set attendance_status = 'ATTENDED'
            where session_id = ?
              and membership_id in (?, ?)
            """.trimIndent(),
            sessionId,
            attendees.first.toString(),
            attendees.second.toString(),
        )
        jdbcTemplate.update(
            """
            update sessions
            set state = 'CLOSED'
            where id = ?
            """.trimIndent(),
            sessionId,
        )

        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.feedbackPending") { value(1) }
        }

        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id,
              club_id,
              session_id,
              version,
              source_text,
              file_name,
              content_type,
              file_size
            )
            values (
              '00000000-0000-0000-0000-000000009701',
              '00000000-0000-0000-0000-000000000001',
              ?,
              1,
              'session seven feedback',
              'session-seven.md',
              'text/markdown',
              22
            )
            """.trimIndent(),
            sessionId,
        )

        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.feedbackPending") { value(0) }
        }
    }

    @Test
    fun `dashboard feedback pending ignores removed attended participants`() {
        val sessionId = createSessionSeven()
        val attendees = findFirstTwoSessionAttendees(UUID.fromString(sessionId))
        jdbcTemplate.update(
            """
            update session_participants
            set participation_status = 'REMOVED',
                attendance_status = 'ATTENDED'
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            sessionId,
            attendees.first.toString(),
        )
        jdbcTemplate.update(
            """
            update sessions
            set state = 'CLOSED'
            where id = ?
            """.trimIndent(),
            sessionId,
        )

        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.feedbackPending") { value(0) }
        }
    }

    @Test
    fun `dashboard current session metrics exclude removed participants`() {
        val sessionId = createSessionSeven()
        val attendees = findFirstThreeSessionAttendees(UUID.fromString(sessionId))
        jdbcTemplate.update(
            """
            update session_participants
            set participation_status = 'REMOVED',
                rsvp_status = 'NO_RESPONSE'
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            sessionId,
            attendees.first.toString(),
        )
        jdbcTemplate.update(
            """
            update session_participants
            set participation_status = 'REMOVED',
                rsvp_status = 'GOING'
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            sessionId,
            attendees.second.toString(),
        )
        jdbcTemplate.update(
            """
            update session_participants
            set rsvp_status = 'GOING'
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            sessionId,
            attendees.third.toString(),
        )

        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.rsvpPending") { value(3) }
            jsonPath("$.checkinMissing") { value(1) }
        }
    }

    @Test
    fun `dashboard lists active members missing from the current open session`() {
        createSessionSeven()
        insertDashboardMissingMember()

        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.currentSessionMissingMemberCount") { value(1) }
            jsonPath("$.currentSessionMissingMembers[0].membershipId") { value(DASHBOARD_MISSING_MEMBERSHIP_ID) }
            jsonPath("$.currentSessionMissingMembers[0].displayName") { value("새 대시보드 멤버") }
            jsonPath("$.currentSessionMissingMembers[0].email") { value("dashboard-missing@example.com") }
        }
    }

    @Test
    fun `dashboard does not list active removed participants as current session missing`() {
        val sessionId = createSessionSeven()
        val attendees = findFirstThreeSessionAttendees(UUID.fromString(sessionId))
        jdbcTemplate.update(
            """
            update session_participants
            set participation_status = 'REMOVED'
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            sessionId,
            attendees.first.toString(),
        )

        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.currentSessionMissingMemberCount") { value(0) }
            jsonPath("$.currentSessionMissingMembers.length()") { value(0) }
        }
    }

    @Test
    fun `valid host session create without authentication returns unauthorized`() {
        mockMvc.post("/api/host/sessions") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "14회차 모임",
                  "bookTitle": "물고기는 존재하지 않는다",
                  "bookAuthor": "룰루 밀러",
                  "date": "2026-04-15"
                }
                """.trimIndent()
        }.andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `host can fetch update publish and confirm attendance for session seven`() {
        val sessionId = createSessionSeven()

        mockMvc.get("/api/host/sessions/$sessionId") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(sessionId) }
            jsonPath("$.sessionNumber") { value(7) }
            jsonPath("$.title") { value("7회차 · 새로운 책") }
            jsonPath("$.bookTitle") { value("새로운 책") }
            jsonPath("$.bookAuthor") { value("새 저자") }
            jsonPath("$.bookLink") { value("https://example.com/books/new-book") }
            jsonPath("$.bookImageUrl") { value("https://example.com/covers/new-book.jpg") }
            jsonPath("$.date") { value("2026-05-20") }
            jsonPath("$.startTime") { value("20:00") }
            jsonPath("$.endTime") { value("22:00") }
            jsonPath("$.questionDeadlineAt") { value("2026-05-19T14:59Z") }
            jsonPath("$.locationLabel") { value("온라인") }
            jsonPath("$.meetingUrl") { value("https://meet.google.com/readmates-new") }
            jsonPath("$.meetingPasscode") { value("newpass") }
            jsonPath("$.publication") { value(null) }
            jsonPath("$.state") { value("OPEN") }
            jsonPath("$.attendees.length()") { value(6) }
            jsonPath("$.attendees[0].membershipId") { exists() }
            jsonPath("$.attendees[0].displayName") { value("호스트") }
            jsonPath("$.attendees[0].accountName") { value("김호스트") }
            jsonPath("$.attendees[0].shortName") { doesNotExist() }
            jsonPath("$.attendees[0].rsvpStatus") { value("NO_RESPONSE") }
            jsonPath("$.attendees[0].attendanceStatus") { value("UNKNOWN") }
            jsonPath("$.attendees[0].participationStatus") { value("ACTIVE") }
            jsonPath("$.feedbackDocument.uploaded") { value(false) }
            jsonPath("$.feedbackDocument.fileName") { value(null) }
            jsonPath("$.feedbackDocument.uploadedAt") { value(null) }
        }

        mockMvc.patch("/api/host/sessions/$sessionId") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "7회차 · 수정된 책",
                  "bookTitle": "수정된 책",
                  "bookAuthor": "수정 저자",
                  "bookLink": "https://example.com/books/updated-book",
                  "bookImageUrl": "https://example.com/covers/updated-book.jpg",
                  "date": "2026-05-27",
                  "startTime": "19:10",
                  "endTime": "21:20",
                  "questionDeadlineAt": "2026-05-25T23:00:00+09:00",
                  "locationLabel": "강남 스터디룸",
                  "meetingUrl": "https://meet.google.com/readmates-updated",
                  "meetingPasscode": "updated"
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(sessionId) }
            jsonPath("$.title") { value("7회차 · 수정된 책") }
            jsonPath("$.bookTitle") { value("수정된 책") }
            jsonPath("$.bookAuthor") { value("수정 저자") }
            jsonPath("$.bookLink") { value("https://example.com/books/updated-book") }
            jsonPath("$.bookImageUrl") { value("https://example.com/covers/updated-book.jpg") }
            jsonPath("$.date") { value("2026-05-27") }
            jsonPath("$.startTime") { value("19:10") }
            jsonPath("$.endTime") { value("21:20") }
            jsonPath("$.questionDeadlineAt") { value("2026-05-25T14:00Z") }
            jsonPath("$.locationLabel") { value("강남 스터디룸") }
            jsonPath("$.meetingUrl") { value("https://meet.google.com/readmates-updated") }
            jsonPath("$.meetingPasscode") { value("updated") }
            jsonPath("$.attendees.length()") { value(6) }
        }

        mockMvc.put("/api/host/sessions/$sessionId/publication") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "publicSummary": "7회차 공개 요약입니다.",
                  "visibility": "PUBLIC"
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(sessionId) }
            jsonPath("$.publicSummary") { value("7회차 공개 요약입니다.") }
            jsonPath("$.visibility") { value("PUBLIC") }
            jsonPath("$.isPublic") { doesNotExist() }
            jsonPath("$.published") { doesNotExist() }
        }

        mockMvc.get("/api/host/sessions/$sessionId") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.publication.publicSummary") { value("7회차 공개 요약입니다.") }
            jsonPath("$.publication.visibility") { value("PUBLIC") }
            jsonPath("$.publication.isPublic") { doesNotExist() }
        }

        val attendees = findFirstTwoSessionAttendees(UUID.fromString(sessionId))
        mockMvc.post("/api/host/sessions/$sessionId/attendance") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                [
                  { "membershipId": "${attendees.first}", "attendanceStatus": "ATTENDED" },
                  { "membershipId": "${attendees.second}", "attendanceStatus": "ABSENT" }
                ]
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(sessionId) }
            jsonPath("$.count") { value(2) }
        }

        val attendanceStatuses = jdbcTemplate.queryForMap(
            """
            select
              max(case when membership_id = ? then attendance_status end) as first_status,
              max(case when membership_id = ? then attendance_status end) as second_status
            from session_participants
            where session_id = ?
            """.trimIndent(),
            attendees.first.toString(),
            attendees.second.toString(),
            sessionId,
        )
        assertEquals("ATTENDED", attendanceStatuses["first_status"])
        assertEquals("ABSENT", attendanceStatuses["second_status"])
    }

    @Test
    fun `host cannot confirm attendance for removed participants`() {
        val sessionId = createSessionSeven()
        val attendees = findFirstTwoSessionAttendees(UUID.fromString(sessionId))
        jdbcTemplate.update(
            """
            update session_participants
            set participation_status = 'REMOVED',
                attendance_status = 'UNKNOWN'
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            sessionId,
            attendees.first.toString(),
        )

        mockMvc.post("/api/host/sessions/$sessionId/attendance") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                [
                  { "membershipId": "${attendees.first}", "attendanceStatus": "ATTENDED" }
                ]
                """.trimIndent()
        }.andExpect {
            status { isNotFound() }
        }

        val attendanceStatus = jdbcTemplate.queryForObject(
            """
            select attendance_status
            from session_participants
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
            attendees.first.toString(),
        )
        assertEquals("UNKNOWN", attendanceStatus)
    }

    @Test
    fun `legacy host session patch preserves existing metadata fields`() {
        val sessionId = createSessionSeven()
        jdbcTemplate.update(
            """
            update sessions
            set start_time = '19:15',
                end_time = '21:45',
                question_deadline_at = '2026-05-18 13:30:00.000000'
            where id = ?
            """.trimIndent(),
            sessionId,
        )

        mockMvc.patch("/api/host/sessions/$sessionId") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "7회차 · 레거시 수정",
                  "bookTitle": "레거시 수정 책",
                  "bookAuthor": "레거시 수정 저자",
                  "date": "2026-05-27"
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(sessionId) }
            jsonPath("$.title") { value("7회차 · 레거시 수정") }
            jsonPath("$.bookTitle") { value("레거시 수정 책") }
            jsonPath("$.bookAuthor") { value("레거시 수정 저자") }
            jsonPath("$.date") { value("2026-05-27") }
            jsonPath("$.bookLink") { value("https://example.com/books/new-book") }
            jsonPath("$.bookImageUrl") { value("https://example.com/covers/new-book.jpg") }
            jsonPath("$.locationLabel") { value("온라인") }
            jsonPath("$.meetingUrl") { value("https://meet.google.com/readmates-new") }
            jsonPath("$.meetingPasscode") { value("newpass") }
            jsonPath("$.startTime") { value("19:15") }
            jsonPath("$.endTime") { value("21:45") }
            jsonPath("$.questionDeadlineAt") { value("2026-05-18T13:30Z") }
        }

        val metadata = jdbcTemplate.queryForMap(
            """
            select
              book_link,
              book_image_url,
              location_label,
              meeting_url,
              meeting_passcode,
              date_format(start_time, '%H:%i') as start_time,
              date_format(end_time, '%H:%i') as end_time,
              date_format(question_deadline_at, '%Y-%m-%d %H:%i') as question_deadline_at
            from sessions
            where id = ?
            """.trimIndent(),
            sessionId,
        )
        assertEquals("https://example.com/books/new-book", metadata["book_link"])
        assertEquals("https://example.com/covers/new-book.jpg", metadata["book_image_url"])
        assertEquals("온라인", metadata["location_label"])
        assertEquals("https://meet.google.com/readmates-new", metadata["meeting_url"])
        assertEquals("newpass", metadata["meeting_passcode"])
        assertEquals("19:15", metadata["start_time"])
        assertEquals("21:45", metadata["end_time"])
        assertEquals("2026-05-18 13:30", metadata["question_deadline_at"])
    }

    @Test
    fun `host session patch with blank metadata clears optional fields and defaults location`() {
        val sessionId = createSessionSeven()

        mockMvc.patch("/api/host/sessions/$sessionId") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "7회차 · 빈 메타데이터 수정",
                  "bookTitle": "빈 메타데이터 책",
                  "bookAuthor": "빈 메타데이터 저자",
                  "bookLink": " ",
                  "bookImageUrl": " ",
                  "date": "2026-05-27",
                  "locationLabel": " ",
                  "meetingUrl": " ",
                  "meetingPasscode": " "
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(sessionId) }
            jsonPath("$.title") { value("7회차 · 빈 메타데이터 수정") }
            jsonPath("$.bookTitle") { value("빈 메타데이터 책") }
            jsonPath("$.bookAuthor") { value("빈 메타데이터 저자") }
            jsonPath("$.bookLink") { value(null) }
            jsonPath("$.bookImageUrl") { value(null) }
            jsonPath("$.date") { value("2026-05-27") }
            jsonPath("$.locationLabel") { value("온라인") }
            jsonPath("$.meetingUrl") { value(null) }
            jsonPath("$.meetingPasscode") { value(null) }
        }

        val metadata = jdbcTemplate.queryForMap(
            """
            select book_link, book_image_url, location_label, meeting_url, meeting_passcode
            from sessions
            where id = ?
            """.trimIndent(),
            sessionId,
        )
        assertNull(metadata["book_link"])
        assertNull(metadata["book_image_url"])
        assertEquals("온라인", metadata["location_label"])
        assertNull(metadata["meeting_url"])
        assertNull(metadata["meeting_passcode"])
    }

    @Test
    fun `host session patch rejects partially provided invalid final schedule`() {
        val sessionId = createSessionSeven()
        jdbcTemplate.update(
            """
            update sessions
            set start_time = '21:00',
                end_time = '22:00'
            where id = ?
            """.trimIndent(),
            sessionId,
        )

        mockMvc.patch("/api/host/sessions/$sessionId") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "7회차 · 잘못된 시간",
                  "bookTitle": "시간 수정 책",
                  "bookAuthor": "시간 저자",
                  "date": "2026-05-20",
                  "endTime": "20:30"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }

        val schedule = jdbcTemplate.queryForMap(
            """
            select
              date_format(start_time, '%H:%i') as start_time,
              date_format(end_time, '%H:%i') as end_time
            from sessions
            where id = ?
            """.trimIndent(),
            sessionId,
        )
        assertEquals("21:00", schedule["start_time"])
        assertEquals("22:00", schedule["end_time"])
    }

    @Test
    fun `saving public visibility for a closed session keeps it closed and clears publish pending`() {
        val sessionId = createSessionSeven()
        jdbcTemplate.update(
            """
            update sessions
            set state = 'CLOSED'
            where id = ?
            """.trimIndent(),
            sessionId,
        )

        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.publishPending") { value(1) }
        }

        mockMvc.put("/api/host/sessions/$sessionId/publication") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "publicSummary": "닫힌 세션 공개 요약입니다.",
                  "visibility": "PUBLIC"
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(sessionId) }
            jsonPath("$.visibility") { value("PUBLIC") }
            jsonPath("$.isPublic") { doesNotExist() }
            jsonPath("$.published") { doesNotExist() }
        }

        val sessionState = jdbcTemplate.queryForObject(
            "select state from sessions where id = ?",
            String::class.java,
            sessionId,
        )
        assertEquals("CLOSED", sessionState)

        mockMvc.get("/api/host/dashboard") {
            with(user("host@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.publishPending") { value(0) }
        }
    }

    @Test
    fun `malformed host session ids return bad request`() {
        mockMvc.get("/api/host/sessions/not-a-uuid") {
            with(user("host@example.com"))
        }.andExpect {
            status { isBadRequest() }
        }

        mockMvc.patch("/api/host/sessions/not-a-uuid") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "7회차 · 수정된 책",
                  "bookTitle": "수정된 책",
                  "bookAuthor": "수정 저자",
                  "date": "2026-05-27"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }

        mockMvc.post("/api/host/sessions/not-a-uuid/attendance") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                [
                  { "membershipId": "00000000-0000-0000-0000-000000000001", "attendanceStatus": "ATTENDED" }
                ]
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }

        mockMvc.put("/api/host/sessions/not-a-uuid/publication") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "publicSummary": "공개 요약",
                  "visibility": "PUBLIC"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects a host session with a blank title`() {
        mockMvc.post("/api/host/sessions") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": " ",
                  "bookTitle": "물고기는 존재하지 않는다",
                  "bookAuthor": "룰루 밀러",
                  "date": "2026-04-15"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects a host session with a blank book title`() {
        mockMvc.post("/api/host/sessions") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "14회차 모임",
                  "bookTitle": " ",
                  "bookAuthor": "룰루 밀러",
                  "date": "2026-04-15"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects a host session with a blank book author`() {
        mockMvc.post("/api/host/sessions") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "14회차 모임",
                  "bookTitle": "물고기는 존재하지 않는다",
                  "bookAuthor": " ",
                  "date": "2026-04-15"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects a host session with an invalid date`() {
        mockMvc.patch("/api/host/sessions/$SEEDED_SESSION_ID") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "14회차 수정 모임",
                  "bookTitle": "물고기는 존재하지 않는다",
                  "bookAuthor": "룰루 밀러",
                  "date": "04/16/2026"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects a host session create with an invalid calendar date`() {
        mockMvc.post("/api/host/sessions") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "14회차 모임",
                  "bookTitle": "물고기는 존재하지 않는다",
                  "bookAuthor": "룰루 밀러",
                  "date": "2026-02-31"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects a host session update with an invalid calendar date`() {
        mockMvc.patch("/api/host/sessions/$SEEDED_SESSION_ID") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "14회차 수정 모임",
                  "bookTitle": "물고기는 존재하지 않는다",
                  "bookAuthor": "룰루 밀러",
                  "date": "2026-02-31"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects host session when end time is not after start time`() {
        mockMvc.post("/api/host/sessions") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "14회차 모임",
                  "bookTitle": "물고기는 존재하지 않는다",
                  "bookAuthor": "룰루 밀러",
                  "date": "2026-04-15",
                  "startTime": "21:00",
                  "endTime": "21:00"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects host session with malformed question deadline`() {
        mockMvc.post("/api/host/sessions") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "14회차 모임",
                  "bookTitle": "물고기는 존재하지 않는다",
                  "bookAuthor": "룰루 밀러",
                  "date": "2026-04-15",
                  "questionDeadlineAt": "2026-04-14 23:59"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects an empty attendance list`() {
        mockMvc.post("/api/host/sessions/$SEEDED_SESSION_ID/attendance") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = "[]"
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects attendance with an invalid status`() {
        mockMvc.post("/api/host/sessions/$SEEDED_SESSION_ID/attendance") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                [
                  { "membershipId": "00000000-0000-0000-0000-000000000001", "attendanceStatus": "LATE" }
                ]
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects attendance with a blank membership id`() {
        mockMvc.post("/api/host/sessions/$SEEDED_SESSION_ID/attendance") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                [
                  { "membershipId": " ", "attendanceStatus": "ATTENDED" }
                ]
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `rejects publication with a blank public summary`() {
        mockMvc.put("/api/host/sessions/$SEEDED_SESSION_ID/publication") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "publicSummary": " ",
                  "visibility": "PUBLIC"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    private fun createSessionSeven(): String {
        val response = mockMvc.post("/api/host/sessions") {
            with(user("host@example.com"))
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "7회차 · 새로운 책",
                  "bookTitle": "새로운 책",
                  "bookAuthor": "새 저자",
                  "bookLink": "https://example.com/books/new-book",
                  "bookImageUrl": "https://example.com/covers/new-book.jpg",
                  "date": "2026-05-20",
                  "locationLabel": "온라인",
                  "meetingUrl": "https://meet.google.com/readmates-new",
                  "meetingPasscode": "newpass"
                }
                """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.sessionNumber") { value(7) }
            jsonPath("$.state") { value("OPEN") }
        }.andReturn()

        return """"sessionId"\s*:\s*"([^"]+)""""
            .toRegex()
            .find(response.response.contentAsString)
            ?.groupValues
            ?.get(1)
            ?: error("created session response did not include a sessionId")
    }

    private fun insertDashboardMissingMember() {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, 'google-dashboard-missing-member', 'dashboard-missing@example.com', '새 대시보드 멤버', '대시보드', null, 'GOOGLE')
            """.trimIndent(),
            DASHBOARD_MISSING_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), '대시보드')
            """.trimIndent(),
            DASHBOARD_MISSING_MEMBERSHIP_ID,
            DASHBOARD_MISSING_USER_ID,
        )
    }

    private fun findFirstTwoSessionAttendees(sessionId: UUID): Pair<UUID, UUID> {
        val attendeeIds = jdbcTemplate.query(
            """
            select membership_id
            from session_participants
            where session_id = ?
            order by membership_id
            limit 2
            """.trimIndent(),
            { resultSet, _ -> UUID.fromString(resultSet.getString("membership_id")) },
            sessionId.toString(),
        )
        return attendeeIds[0] to attendeeIds[1]
    }

    private data class ThreeAttendees(
        val first: UUID,
        val second: UUID,
        val third: UUID,
    )

    private fun findFirstThreeSessionAttendees(sessionId: UUID): ThreeAttendees {
        val attendeeIds = jdbcTemplate.query(
            """
            select membership_id
            from session_participants
            where session_id = ?
            order by membership_id
            limit 3
            """.trimIndent(),
            { resultSet, _ -> UUID.fromString(resultSet.getString("membership_id")) },
            sessionId.toString(),
        )
        return ThreeAttendees(attendeeIds[0], attendeeIds[1], attendeeIds[2])
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
