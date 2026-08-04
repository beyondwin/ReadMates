package com.readmates.browse.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasItems
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
import org.springframework.http.HttpHeaders
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Suppress("LargeClass")
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
              (?, ?, ?, 'MEMBER', 'LEFT', '작성자 하나', 'globe-notebook'),
              (?, ?, ?, 'MEMBER', 'ACTIVE', '작성자 둘', 'mushroom-green-book')
            """.trimIndent(),
            AUTHOR_ONE_MEMBERSHIP_ID,
            CLUB_ID,
            AUTHOR_ONE_USER_ID,
            AUTHOR_TWO_MEMBERSHIP_ID,
            CLUB_ID,
            AUTHOR_TWO_USER_ID,
        )
    }

    @Suppress("LongMethod")
    private fun seedSessionsAndContent() {
        insertSession(OPEN_ID, CLUB_ID, 41, "OPEN", "GUEST_READABLE", "MEMBER", "현재 공개 세션")
        insertSession(DRAFT_ID, CLUB_ID, 42, "DRAFT", "GUEST_READABLE", "MEMBER", "예정 공개 세션")
        insertSession(CLOSED_ID, CLUB_ID, 40, "CLOSED", "GUEST_READABLE", "MEMBER", "종료 공개 세션")
        insertSession(PUBLISHED_ID, CLUB_ID, 39, "PUBLISHED", "GUEST_READABLE", "PUBLIC", "발행 공개 세션")
        insertSession(HOST_ONLY_CLOSED_ID, CLUB_ID, 38, "CLOSED", "HOST_ONLY", "HOST_ONLY", "숨은 종료 세션")
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
              (?, ?, ?, ?, 'MAYBE', 'UNKNOWN', 'ACTIVE'),
              (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE'),
              (?, ?, ?, ?, 'GOING', 'ABSENT', 'REMOVED')
            """.trimIndent(),
            PARTICIPANT_ONE_ID,
            CLUB_ID,
            OPEN_ID,
            AUTHOR_ONE_MEMBERSHIP_ID,
            PARTICIPANT_TWO_ID,
            CLUB_ID,
            OPEN_ID,
            AUTHOR_TWO_MEMBERSHIP_ID,
            PUBLISHED_PARTICIPANT_ONE_ID,
            CLUB_ID,
            PUBLISHED_ID,
            AUTHOR_ONE_MEMBERSHIP_ID,
            PUBLISHED_PARTICIPANT_TWO_ID,
            CLUB_ID,
            PUBLISHED_ID,
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
        jdbcTemplate.update(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            values (?, ?, ?, ?, 1, ?, ?)
            """.trimIndent(),
            ARCHIVE_QUESTION_ID,
            CLUB_ID,
            PUBLISHED_ID,
            AUTHOR_ONE_MEMBERSHIP_ID,
            ARCHIVE_QUESTION,
            DRAFT_THOUGHT,
        )
        jdbcTemplate.update(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            values (?, ?, ?, ?, 2, ?, '제외되어야 하는 초안')
            """.trimIndent(),
            REMOVED_QUESTION_ID,
            CLUB_ID,
            PUBLISHED_ID,
            AUTHOR_TWO_MEMBERSHIP_ID,
            REMOVED_QUESTION,
        )
        jdbcTemplate.update(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            values
              (?, ?, ?, ?, ?, 'PUBLIC'),
              (?, ?, ?, ?, ?, 'SESSION')
            """.trimIndent(),
            PUBLIC_ONE_LINE_REVIEW_ID,
            CLUB_ID,
            PUBLISHED_ID,
            AUTHOR_ONE_MEMBERSHIP_ID,
            PUBLIC_ONE_LINE_REVIEW,
            SESSION_ONE_LINE_REVIEW_ID,
            CLUB_ID,
            PUBLISHED_ID,
            AUTHOR_TWO_MEMBERSHIP_ID,
            SESSION_ONE_LINE_REVIEW,
        )
        jdbcTemplate.update(
            """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order)
            values (?, ?, ?, null, ?, 1)
            """.trimIndent(),
            HIGHLIGHT_ID,
            CLUB_ID,
            PUBLISHED_ID,
            PUBLIC_HIGHLIGHT,
        )
        jdbcTemplate.update(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
            values
              (?, ?, ?, ?, ?, 'PUBLIC'),
              (?, ?, ?, ?, ?, 'PRIVATE')
            """.trimIndent(),
            ARCHIVE_PUBLIC_LONG_REVIEW_ID,
            CLUB_ID,
            PUBLISHED_ID,
            AUTHOR_ONE_MEMBERSHIP_ID,
            PUBLIC_LONG_REVIEW,
            ARCHIVE_PRIVATE_LONG_REVIEW_ID,
            CLUB_ID,
            PUBLISHED_ID,
            AUTHOR_TWO_MEMBERSHIP_ID,
            PRIVATE_LONG_REVIEW,
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, site_visibility, published_at
            )
            values (?, ?, ?, ?, true, 'PUBLIC', 'PUBLIC_RECORD', utc_timestamp(6))
            """.trimIndent(),
            PUBLICATION_ID,
            CLUB_ID,
            PUBLISHED_ID,
            PUBLIC_SUMMARY,
        )
        jdbcTemplate.update(
            "update questions set created_at = ? where id = ?",
            FIXED_FEED_CREATED_AT,
            ARCHIVE_QUESTION_ID,
        )
        jdbcTemplate.update(
            "update highlights set created_at = ? where id = ?",
            FIXED_FEED_CREATED_AT,
            HIGHLIGHT_ID,
        )
        jdbcTemplate.update(
            "update one_line_reviews set created_at = ? where id = ?",
            FIXED_FEED_CREATED_AT,
            PUBLIC_ONE_LINE_REVIEW_ID,
        )
        jdbcTemplate.update(
            "update long_reviews set created_at = ? where id = ?",
            FIXED_FEED_CREATED_AT,
            ARCHIVE_PUBLIC_LONG_REVIEW_ID,
        )
    }

    @AfterEach
    fun cleanupGuestBrowseMatrix() {
        jdbcTemplate.update("delete from public_session_publications where id = ?", PUBLICATION_ID)
        jdbcTemplate.update("delete from highlights where id = ?", HIGHLIGHT_ID)
        jdbcTemplate.update(
            "delete from one_line_reviews where id in (?, ?)",
            PUBLIC_ONE_LINE_REVIEW_ID,
            SESSION_ONE_LINE_REVIEW_ID,
        )
        jdbcTemplate.update(
            "delete from long_reviews where id in (?, ?, ?, ?)",
            PUBLIC_REVIEW_ID,
            PRIVATE_REVIEW_ID,
            ARCHIVE_PUBLIC_LONG_REVIEW_ID,
            ARCHIVE_PRIVATE_LONG_REVIEW_ID,
        )
        jdbcTemplate.update(
            "delete from questions where id in (?, ?, ?)",
            QUESTION_ID,
            ARCHIVE_QUESTION_ID,
            REMOVED_QUESTION_ID,
        )
        jdbcTemplate.update(
            "delete from session_participants where id in (?, ?, ?, ?)",
            PARTICIPANT_ONE_ID,
            PARTICIPANT_TWO_ID,
            PUBLISHED_PARTICIPANT_ONE_ID,
            PUBLISHED_PARTICIPANT_TWO_ID,
        )
        jdbcTemplate.update(
            "delete from sessions where id in (?, ?, ?, ?, ?, ?, ?, ?)",
            OPEN_ID,
            DRAFT_ID,
            CLOSED_ID,
            PUBLISHED_ID,
            HOST_ONLY_CLOSED_ID,
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
        val response =
            mockMvc
                .get("/api/public/clubs/guest-test/browse")
                .andExpect {
                    status { isOk() }
                    header { string("Cache-Control", "no-store") }
                    jsonPath("$.clubName") { value("게스트 테스트 클럽") }
                    jsonPath("$.navigation.home") { value("OPEN") }
                    jsonPath("$.navigation.feedback") { value("LOCKED") }
                    jsonPath("$.navigation.host") { value("DENY") }
                }.andReturn()
                .response

        assertForbiddenKeysAbsent(response.contentAsString, FORBIDDEN_GUEST_KEYS)
        assertGuestResponseHeaders(response)

        listOf("guest-private", "guest-inactive", "missing-club").forEach { slug ->
            val errorResponse =
                mockMvc
                    .get("/api/public/clubs/$slug/browse")
                    .andExpect {
                        status { isNotFound() }
                        jsonPath("$.code") { value("RESOURCE_NOT_FOUND") }
                    }.andReturn()
                    .response
            assertGuestResponseHeaders(errorResponse)
        }
    }

    @Test
    fun `anonymous current session returns approved fields and no sensitive keys`() {
        val response =
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
                .response

        assertForbiddenKeysAbsent(response.contentAsString, FORBIDDEN_GUEST_KEYS)
        assertGuestResponseHeaders(response)
        assertFalse(response.contentAsString.contains("게스트 작성자 하나"))
        assertFalse(response.contentAsString.contains("게스트 작성자 둘"))
    }

    @Test
    fun `current browse isolates club access scope and lifecycle`() {
        val emptyResponse =
            mockMvc
                .get("/api/public/clubs/guest-outside/browse/sessions/current")
                .andExpect {
                    status { isOk() }
                    header { string("Cache-Control", "no-store") }
                    jsonPath("$.currentSession") { value(null) }
                }.andReturn()
                .response
        assertGuestResponseHeaders(emptyResponse)
        mockMvc.get("/api/public/clubs/guest-private/browse/sessions/current").andExpect {
            status { isNotFound() }
        }
        mockMvc.get("/api/public/clubs/guest-inactive/browse/sessions/current").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `draft guest-readable session appears only in upcoming browse`() {
        val response =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/sessions/upcoming")
                .andExpect {
                    status { isOk() }
                    header { string("Cache-Control", "no-store") }
                    jsonPath("$.items[*].sessionId") { value(hasItem(DRAFT_ID)) }
                    jsonPath("$.items[*].sessionId") { value(not(hasItem(HOST_ONLY_DRAFT_ID))) }
                    jsonPath("$.items[*].sessionId") { value(not(hasItem(OPEN_ID))) }
                    jsonPath("$.items[*].sessionId") { value(not(hasItem(OUTSIDE_DRAFT_ID))) }
                    jsonPath("$.nextCursor") { value(null) }
                }.andReturn()
                .response

        assertForbiddenKeysAbsent(response.contentAsString, FORBIDDEN_GUEST_KEYS)
        assertGuestResponseHeaders(response)
        mockMvc.get("/api/public/clubs/guest-test/sessions/$DRAFT_ID").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `upcoming browse accepts fifty and rejects fifty one`() {
        val validResponse =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/sessions/upcoming?limit=50")
                .andExpect { status { isOk() } }
                .andReturn()
                .response
        assertGuestResponseHeaders(validResponse)

        val errorResponse =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/sessions/upcoming?limit=51")
                .andExpect {
                    status { isBadRequest() }
                    jsonPath("$.code") { value("INVALID_REQUEST") }
                    jsonPath("$.status") { value(400) }
                }.andReturn()
                .response
        assertGuestResponseHeaders(errorResponse)
    }

    @Test
    fun `malformed guest query binding errors are never cacheable`() {
        val errorResponse =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/sessions/upcoming?limit=abc")
                .andExpect {
                    status { isBadRequest() }
                    header { string("Cache-Control", "no-store") }
                    jsonPath("$.code") { value("INVALID_REQUEST") }
                }.andReturn()
                .response

        assertGuestResponseHeaders(errorResponse)
    }

    @Test
    fun `upcoming browse rejects malformed cursor with stable error contract`() {
        val errorResponse =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/sessions/upcoming?cursor=not-a-cursor")
                .andExpect {
                    status { isBadRequest() }
                    jsonPath("$.code") { value("INVALID_REQUEST") }
                    jsonPath("$.status") { value(400) }
                }.andReturn()
                .response
        assertGuestResponseHeaders(errorResponse)
    }

    @Test
    fun `guest notes expose only published guest readable public content`() {
        val sessionsResponse =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/notes/sessions?limit=20")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.items[*].sessionId") { value(hasItem(PUBLISHED_ID)) }
                    jsonPath("$.items[*].sessionId") { value(not(hasItems(CLOSED_ID, OPEN_ID, HOST_ONLY_CLOSED_ID))) }
                    jsonPath("$.items[0].oneLinerCount") { value(1) }
                    jsonPath("$.items[0].longReviewCount") { value(1) }
                }.andReturn()
                .response

        val feedResponse =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/notes/feed?limit=20")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.items[*].text") {
                        value(hasItems(ARCHIVE_QUESTION, PUBLIC_ONE_LINE_REVIEW, PUBLIC_HIGHLIGHT))
                    }
                    jsonPath("$.items[*].text") { value(not(hasItem(SESSION_ONE_LINE_REVIEW))) }
                    jsonPath("$.items[*].text") { value(not(hasItem(REMOVED_QUESTION))) }
                }.andReturn()
                .response

        assertForbiddenKeysAbsent(sessionsResponse.contentAsString, FORBIDDEN_GUEST_KEYS)
        assertForbiddenKeysAbsent(feedResponse.contentAsString, FORBIDDEN_GUEST_KEYS)
        assertGuestResponseHeaders(sessionsResponse)
        assertGuestResponseHeaders(feedResponse)
    }

    @Test
    fun `guest notes feed scopes records and cursor pages to the selected session`() {
        val firstPage =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/notes/feed") {
                    param("sessionId", PUBLISHED_ID)
                    param("limit", "1")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items.length()") { value(1) }
                    jsonPath("$.items[*].sessionId") { value(hasItem(PUBLISHED_ID)) }
                    jsonPath("$.nextCursor") { isString() }
                }.andReturn()
                .response
        val cursor = objectMapper.readTree(firstPage.contentAsString).get("nextCursor").asText()

        mockMvc
            .get("/api/public/clubs/guest-test/browse/notes/feed") {
                param("sessionId", PUBLISHED_ID)
                param("limit", "20")
                param("cursor", cursor)
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[*].sessionId") { value(hasItem(PUBLISHED_ID)) }
                jsonPath("$.items[*].text") { value(not(hasItem(ARCHIVE_QUESTION))) }
                jsonPath("$.nextCursor") { value(null) }
            }
    }

    @Test
    fun `guest notes feed rejects malformed session ids and hides unavailable sessions`() {
        mockMvc
            .get("/api/public/clubs/guest-test/browse/notes/feed") {
                param("sessionId", "not-a-uuid")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_REQUEST") }
            }

        listOf(OPEN_ID, CLOSED_ID, DRAFT_ID, OUTSIDE_DRAFT_ID, HOST_ONLY_CLOSED_ID).forEach { sessionId ->
            mockMvc
                .get("/api/public/clubs/guest-test/browse/notes/feed") {
                    param("sessionId", sessionId)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items.length()") { value(0) }
                    jsonPath("$.nextCursor") { value(null) }
                }
        }
    }

    @Test
    fun `guest notes feed composite cursor preserves mixed kind order without duplicates`() {
        val seen = mutableListOf<String>()
        var cursor: String? = null

        repeat(4) {
            val cursorQuery = cursor?.let { value -> "&cursor=$value" }.orEmpty()
            val page =
                mockMvc
                    .get("/api/public/clubs/guest-test/browse/notes/feed?limit=1$cursorQuery")
                    .andExpect {
                        status { isOk() }
                        jsonPath("$.items.length()") { value(1) }
                    }.andReturn()
                    .response
            val body = objectMapper.readTree(page.contentAsString)
            seen +=
                body
                    .get("items")
                    .first()
                    .get("text")
                    .asText()
            cursor = body.get("nextCursor").takeUnless(JsonNode::isNull)?.asText()
        }

        assertTrue(cursor == null)
        assertTrue(
            seen == listOf(ARCHIVE_QUESTION, PUBLIC_HIGHLIGHT, PUBLIC_ONE_LINE_REVIEW, PUBLIC_LONG_REVIEW),
            "Unexpected guest note feed order or duplicate: $seen",
        )
    }

    @Test
    fun `guest archive includes closed and published guest readable sessions`() {
        val response =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/archive?limit=20")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.items[*].state") { value(hasItems("CLOSED", "PUBLISHED")) }
                    jsonPath("$.items[*].sessionId") { value(not(hasItems(HOST_ONLY_CLOSED_ID, OPEN_ID, DRAFT_ID))) }
                    jsonPath("$.items[*].feedbackDocument") { doesNotExist() }
                }.andReturn()
                .response

        assertForbiddenKeysAbsent(response.contentAsString, FORBIDDEN_GUEST_KEYS)
        assertGuestResponseHeaders(response)
    }

    @Test
    fun `guest archive cursor continues without duplicating the previous item`() {
        val firstPage =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/archive?limit=1")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.items[0].sessionId") { value(CLOSED_ID) }
                    jsonPath("$.nextCursor") { isString() }
                }.andReturn()
                .response
        val cursor = objectMapper.readTree(firstPage.contentAsString).get("nextCursor").asText()

        mockMvc
            .get("/api/public/clubs/guest-test/browse/archive?limit=1&cursor=$cursor")
            .andExpect {
                status { isOk() }
                jsonPath("$.items[0].sessionId") { value(PUBLISHED_ID) }
                jsonPath("$.items[*].sessionId") { value(not(hasItem(CLOSED_ID))) }
                jsonPath("$.nextCursor") { value(null) }
            }
    }

    @Test
    fun `guest archive detail includes public records and omits private session and feedback fields`() {
        val response =
            mockMvc
                .get("/api/public/clubs/guest-test/browse/archive/$PUBLISHED_ID")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.summary") { value(PUBLIC_SUMMARY) }
                    jsonPath("$.attendance") { value(1) }
                    jsonPath("$.total") { value(1) }
                    jsonPath("$.highlights[*].text") { value(hasItem(PUBLIC_HIGHLIGHT)) }
                    jsonPath("$.oneLiners[*].text") { value(hasItem(PUBLIC_ONE_LINE_REVIEW)) }
                    jsonPath("$.oneLiners[*].text") { value(not(hasItem(SESSION_ONE_LINE_REVIEW))) }
                    jsonPath("$.longReviews[*].content") { value(hasItem(PUBLIC_LONG_REVIEW)) }
                    jsonPath("$.longReviews[*].content") { value(not(hasItem(PRIVATE_LONG_REVIEW))) }
                    jsonPath("$.questions[0].draftThought") { value(DRAFT_THOUGHT) }
                    jsonPath("$.questions[0].authorName") { value("탈퇴한 멤버") }
                    jsonPath("$.questions[0].avatarKey") { value("cloud-green-book") }
                    jsonPath("$.questions[*].text") { value(not(hasItem(REMOVED_QUESTION))) }
                    jsonPath("$.feedbackDocument") { doesNotExist() }
                }.andReturn()
                .response

        assertForbiddenKeysAbsent(response.contentAsString, FORBIDDEN_GUEST_KEYS)
        assertGuestResponseHeaders(response)
        assertFalse(response.contentAsString.contains("guest-author-one@example.test"))
        assertFalse(response.contentAsString.contains("게스트 작성자 하나"))
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

    private fun assertGuestResponseHeaders(response: MockHttpServletResponse) {
        assertTrue(response.getHeader(HttpHeaders.CACHE_CONTROL) == "no-store")
        val varyTokens =
            response
                .getHeaders(HttpHeaders.VARY)
                .flatMap { it.split(',') }
                .map { it.trim().lowercase() }
        assertFalse("cookie" in varyTokens, "Guest response must not vary on Cookie: $varyTokens")
        assertFalse("authorization" in varyTokens, "Guest response must not vary on Authorization: $varyTokens")
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
        const val CLOSED_ID = "00000000-0000-0000-0000-000000007435"
        const val PUBLISHED_ID = "00000000-0000-0000-0000-000000007436"
        const val HOST_ONLY_CLOSED_ID = "00000000-0000-0000-0000-000000007437"
        const val HOST_ONLY_OPEN_ID = "00000000-0000-0000-0000-000000007432"
        const val HOST_ONLY_DRAFT_ID = "00000000-0000-0000-0000-000000007433"
        const val OUTSIDE_DRAFT_ID = "00000000-0000-0000-0000-000000007434"
        const val PARTICIPANT_ONE_ID = "00000000-0000-0000-0000-000000007440"
        const val PARTICIPANT_TWO_ID = "00000000-0000-0000-0000-000000007441"
        const val PUBLISHED_PARTICIPANT_ONE_ID = "00000000-0000-0000-0000-000000007442"
        const val PUBLISHED_PARTICIPANT_TWO_ID = "00000000-0000-0000-0000-000000007443"
        const val QUESTION_ID = "00000000-0000-0000-0000-000000007450"
        const val ARCHIVE_QUESTION_ID = "00000000-0000-0000-0000-000000007451"
        const val REMOVED_QUESTION_ID = "00000000-0000-0000-0000-000000007452"
        const val PUBLIC_REVIEW_ID = "00000000-0000-0000-0000-000000007460"
        const val PRIVATE_REVIEW_ID = "00000000-0000-0000-0000-000000007461"
        const val PUBLIC_ONE_LINE_REVIEW_ID = "00000000-0000-0000-0000-000000007462"
        const val SESSION_ONE_LINE_REVIEW_ID = "00000000-0000-0000-0000-000000007463"
        const val ARCHIVE_PUBLIC_LONG_REVIEW_ID = "00000000-0000-0000-0000-000000007464"
        const val ARCHIVE_PRIVATE_LONG_REVIEW_ID = "00000000-0000-0000-0000-000000007465"
        const val HIGHLIGHT_ID = "00000000-0000-0000-0000-000000007470"
        const val PUBLICATION_ID = "00000000-0000-0000-0000-000000007480"
        const val ARCHIVE_QUESTION = "기록에서 보이는 질문"
        const val REMOVED_QUESTION = "제외된 참가자의 숨겨야 하는 질문"
        const val DRAFT_THOUGHT = "기록에서 보이는 생각 초안"
        const val PUBLIC_ONE_LINE_REVIEW = "게스트에게 보이는 공개 한줄평"
        const val SESSION_ONE_LINE_REVIEW = "게스트에게 숨기는 세션 한줄평"
        const val PUBLIC_LONG_REVIEW = "게스트에게 보이는 공개 서평 기록"
        const val PRIVATE_LONG_REVIEW = "게스트에게 숨기는 비공개 서평 기록"
        const val PUBLIC_HIGHLIGHT = "게스트에게 보이는 하이라이트"
        const val PUBLIC_SUMMARY = "게스트에게 보이는 세션 요약"
        const val FIXED_FEED_CREATED_AT = "2026-08-01 12:00:00.000000"
    }
}
