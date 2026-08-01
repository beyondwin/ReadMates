package com.readmates.browse.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class GuestBrowseControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val objectMapper = ObjectMapper()

    @BeforeEach
    fun seedGuestBrowseMatrix() {
        cleanupGuestBrowseMatrix()
        seedClubsAndMembers()
        seedSessionsAndContent()
    }

    private fun seedClubsAndMembers() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values
              (?, 'guest-test', '게스트 테스트 클럽', '함께 읽는 테스트', '게스트 조회 계약 테스트', 'ACTIVE', 'PUBLIC'),
              (?, 'guest-private', '비공개 테스트 클럽', '비공개', '비공개 클럽', 'ACTIVE', 'PRIVATE'),
              (?, 'guest-inactive', '비활성 테스트 클럽', '비활성', '비활성 클럽', 'SUSPENDED', 'PUBLIC'),
              (?, 'guest-outside', '다른 테스트 클럽', '다른 클럽', '클럽 경계 테스트', 'ACTIVE', 'PUBLIC')
            """.trimIndent(),
            CLUB_ID,
            PRIVATE_CLUB_ID,
            INACTIVE_CLUB_ID,
            OUTSIDE_CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values
              (?, 'guest-author-one@example.test', '게스트 작성자 하나', '작성자 하나', 'GOOGLE'),
              (?, 'guest-author-two@example.test', '게스트 작성자 둘', '작성자 둘', 'GOOGLE')
            """.trimIndent(),
            AUTHOR_ONE_USER_ID,
            AUTHOR_TWO_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, short_name, avatar_key)
            values
              (?, ?, ?, 'MEMBER', 'ACTIVE', '작성자 하나', 'reading-lamp'),
              (?, ?, ?, 'MEMBER', 'ACTIVE', '작성자 둘', 'open-book-pencil')
            """.trimIndent(),
            AUTHOR_ONE_MEMBERSHIP_ID,
            CLUB_ID,
            AUTHOR_ONE_USER_ID,
            AUTHOR_TWO_MEMBERSHIP_ID,
            CLUB_ID,
            AUTHOR_TWO_USER_ID,
        )
    }

    private fun seedSessionsAndContent() {
        insertSession(OPEN_ID, CLUB_ID, 41, "OPEN", "GUEST_READABLE", "MEMBER", "현재 공개 세션")
        insertSession(DRAFT_ID, CLUB_ID, 42, "DRAFT", "GUEST_READABLE", "MEMBER", "예정 공개 세션")
        insertSession(HOST_ONLY_OPEN_ID, CLUB_ID, 43, "OPEN", "HOST_ONLY", "HOST_ONLY", "숨은 현재 세션")
        insertSession(HOST_ONLY_DRAFT_ID, CLUB_ID, 44, "DRAFT", "HOST_ONLY", "HOST_ONLY", "숨은 예정 세션")
        insertSession(OUTSIDE_DRAFT_ID, OUTSIDE_CLUB_ID, 41, "DRAFT", "GUEST_READABLE", "MEMBER", "다른 클럽 예정 세션")
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            )
            values
              (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE'),
              (?, ?, ?, ?, 'MAYBE', 'UNKNOWN', 'ACTIVE')
            """.trimIndent(),
            PARTICIPANT_ONE_ID,
            CLUB_ID,
            OPEN_ID,
            AUTHOR_ONE_MEMBERSHIP_ID,
            PARTICIPANT_TWO_ID,
            CLUB_ID,
            OPEN_ID,
            AUTHOR_TWO_MEMBERSHIP_ID,
        )
        jdbcTemplate.update(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            values (?, ?, ?, ?, 1, '게스트에게 보이는 질문', '게스트에게 보이는 생각 초안')
            """.trimIndent(),
            QUESTION_ID,
            CLUB_ID,
            OPEN_ID,
            AUTHOR_ONE_MEMBERSHIP_ID,
        )
        jdbcTemplate.update(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
            values
              (?, ?, ?, ?, '게스트에게 보이는 공개 서평', 'PUBLIC'),
              (?, ?, ?, ?, '게스트에게 숨기는 비공개 서평', 'PRIVATE')
            """.trimIndent(),
            PUBLIC_REVIEW_ID,
            CLUB_ID,
            OPEN_ID,
            AUTHOR_ONE_MEMBERSHIP_ID,
            PRIVATE_REVIEW_ID,
            CLUB_ID,
            OPEN_ID,
            AUTHOR_TWO_MEMBERSHIP_ID,
        )
    }

    @AfterEach
    fun cleanupGuestBrowseMatrix() {
        jdbcTemplate.update("delete from long_reviews where id in (?, ?)", PUBLIC_REVIEW_ID, PRIVATE_REVIEW_ID)
        jdbcTemplate.update("delete from questions where id = ?", QUESTION_ID)
        jdbcTemplate.update(
            "delete from session_participants where id in (?, ?)",
            PARTICIPANT_ONE_ID,
            PARTICIPANT_TWO_ID,
        )
        jdbcTemplate.update(
            "delete from sessions where id in (?, ?, ?, ?, ?)",
            OPEN_ID,
            DRAFT_ID,
            HOST_ONLY_OPEN_ID,
            HOST_ONLY_DRAFT_ID,
            OUTSIDE_DRAFT_ID,
        )
        jdbcTemplate.update(
            "delete from memberships where id in (?, ?)",
            AUTHOR_ONE_MEMBERSHIP_ID,
            AUTHOR_TWO_MEMBERSHIP_ID,
        )
        jdbcTemplate.update("delete from users where id in (?, ?)", AUTHOR_ONE_USER_ID, AUTHOR_TWO_USER_ID)
        jdbcTemplate.update(
            "delete from clubs where id in (?, ?, ?, ?)",
            CLUB_ID,
            PRIVATE_CLUB_ID,
            INACTIVE_CLUB_ID,
            OUTSIDE_CLUB_ID,
        )
    }

    @Test
    fun `anonymous browse shell returns only active public club capability`() {
        mockMvc.get("/api/public/clubs/guest-test/browse").andExpect {
            status { isOk() }
            header { string("Cache-Control", "no-store") }
            jsonPath("$.clubName") { value("게스트 테스트 클럽") }
            jsonPath("$.navigation.home") { value("OPEN") }
            jsonPath("$.navigation.feedback") { value("LOCKED") }
            jsonPath("$.navigation.host") { value("DENY") }
        }

        listOf("guest-private", "guest-inactive", "missing-club").forEach { slug ->
            mockMvc.get("/api/public/clubs/$slug/browse").andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("RESOURCE_NOT_FOUND") }
            }
        }
    }

    @Test
    fun `anonymous current session returns approved fields and no sensitive keys`() {
        val body =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/sessions/current")
                .andExpect {
                    status { isOk() }
                    header { string("Cache-Control", "no-store") }
                    jsonPath("$.currentSession.sessionId") { value(OPEN_ID) }
                    jsonPath("$.currentSession.attendees[0].displayName") { isString() }
                    jsonPath("$.currentSession.board.questions[0].draftThought") { isString() }
                    jsonPath("$.currentSession.board.longReviews[*].content") {
                        value(hasItem("게스트에게 보이는 공개 서평"))
                    }
                    jsonPath("$.currentSession.board.longReviews[*].content") {
                        value(not(hasItem("게스트에게 숨기는 비공개 서평")))
                    }
                }.andReturn()
                .response.contentAsString

        assertForbiddenKeysAbsent(body, FORBIDDEN_GUEST_KEYS)
    }

    @Test
    fun `current browse isolates club access scope and lifecycle`() {
        mockMvc.get("/api/public/clubs/guest-outside/browse/sessions/current").andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("RESOURCE_NOT_FOUND") }
        }
        mockMvc.get("/api/public/clubs/guest-private/browse/sessions/current").andExpect {
            status { isNotFound() }
        }
        mockMvc.get("/api/public/clubs/guest-inactive/browse/sessions/current").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `draft guest-readable session appears only in upcoming browse`() {
        mockMvc.get("/api/public/clubs/guest-test/browse/sessions/upcoming").andExpect {
            status { isOk() }
            header { string("Cache-Control", "no-store") }
            jsonPath("$.items[*].sessionId") { value(hasItem(DRAFT_ID)) }
            jsonPath("$.items[*].sessionId") { value(not(hasItem(HOST_ONLY_DRAFT_ID))) }
            jsonPath("$.items[*].sessionId") { value(not(hasItem(OPEN_ID))) }
            jsonPath("$.items[*].sessionId") { value(not(hasItem(OUTSIDE_DRAFT_ID))) }
            jsonPath("$.nextCursor") { value(null) }
        }
        mockMvc.get("/api/public/clubs/guest-test/sessions/$DRAFT_ID").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `upcoming browse rejects malformed cursor with stable error contract`() {
        mockMvc.get("/api/public/clubs/guest-test/browse/sessions/upcoming?cursor=not-a-cursor").andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("INVALID_REQUEST") }
            jsonPath("$.status") { value(400) }
        }
    }

    private fun insertSession(
        id: String,
        clubId: String,
        number: Int,
        state: String,
        accessScope: String,
        visibility: String,
        title: String,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, book_link, book_image_url,
              session_date, start_time, end_time, location_label, meeting_url, meeting_passcode,
              question_deadline_at, state, visibility, access_scope
            )
            values (?, ?, ?, ?, ?, '테스트 저자', 'https://example.test/books/guest-safe',
                    'https://example.test/images/guest-safe.jpg', '2026-08-20', '19:30:00', '21:30:00',
                    '노출되면 안 되는 정확한 장소', 'https://meeting.example.test/private', 'private-passcode',
                    '2026-08-19 18:00:00', ?, ?, ?)
            """.trimIndent(),
            id,
            clubId,
            number,
            title,
            "$title 책",
            state,
            visibility,
            accessScope,
        )
    }

    private fun assertForbiddenKeysAbsent(
        body: String,
        forbiddenKeys: Set<String>,
    ) {
        val root = objectMapper.readTree(body)
        val found = linkedSetOf<String>()

        fun walk(node: JsonNode) {
            when {
                node.isObject ->
                    node.properties().forEach { (key, child) ->
                        if (key in forbiddenKeys || key.startsWith("my")) found += key
                        walk(child)
                    }
                node.isArray -> node.forEach(::walk)
            }
        }

        walk(root)
        assertTrue(found.isEmpty(), "Forbidden guest keys found: $found")
        assertFalse(body.contains("노출되면 안 되는 정확한 장소"))
        assertFalse(body.contains("https://meeting.example.test/private"))
        assertFalse(body.contains("private-passcode"))
    }

    private companion object {
        val FORBIDDEN_GUEST_KEYS =
            setOf(
                "membershipId",
                "accountName",
                "email",
                "locationLabel",
                "meetingUrl",
                "meetingPasscode",
                "myRsvpStatus",
                "myCheckin",
                "myQuestions",
                "myOneLineReview",
                "myLongReview",
                "feedbackDocument",
            )

        const val CLUB_ID = "00000000-0000-0000-0000-000000007400"
        const val PRIVATE_CLUB_ID = "00000000-0000-0000-0000-000000007401"
        const val INACTIVE_CLUB_ID = "00000000-0000-0000-0000-000000007402"
        const val OUTSIDE_CLUB_ID = "00000000-0000-0000-0000-000000007403"
        const val AUTHOR_ONE_USER_ID = "00000000-0000-0000-0000-000000007410"
        const val AUTHOR_TWO_USER_ID = "00000000-0000-0000-0000-000000007411"
        const val AUTHOR_ONE_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000007420"
        const val AUTHOR_TWO_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000007421"
        const val OPEN_ID = "00000000-0000-0000-0000-000000007430"
        const val DRAFT_ID = "00000000-0000-0000-0000-000000007431"
        const val HOST_ONLY_OPEN_ID = "00000000-0000-0000-0000-000000007432"
        const val HOST_ONLY_DRAFT_ID = "00000000-0000-0000-0000-000000007433"
        const val OUTSIDE_DRAFT_ID = "00000000-0000-0000-0000-000000007434"
        const val PARTICIPANT_ONE_ID = "00000000-0000-0000-0000-000000007440"
        const val PARTICIPANT_TWO_ID = "00000000-0000-0000-0000-000000007441"
        const val QUESTION_ID = "00000000-0000-0000-0000-000000007450"
        const val PUBLIC_REVIEW_ID = "00000000-0000-0000-0000-000000007460"
        const val PRIVATE_REVIEW_ID = "00000000-0000-0000-0000-000000007461"
    }
}
