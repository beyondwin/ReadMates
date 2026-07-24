package com.readmates.session.api

import com.readmates.shared.paging.CursorCodec
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.sql.DataSource

private const val CLEANUP_GENERATED_SESSIONS_SQL = """
    update host_action_notification_previews
    set consumed_at = null, consumed_decision_id = null
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from host_action_notification_decisions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from host_action_notification_previews
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from session_record_drafts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from ai_generation_commit_receipts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from session_record_drafts
    where session_id = '00000000-0000-0000-0000-000000019777';
    delete from session_record_revisions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from host_session_change_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from admin_closing_risk_ledger
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001'
          and number >= 7
      );
    delete from admin_closing_risk_ledger
    where session_id = '00000000-0000-0000-0000-000000019777';
    delete from notification_event_outbox
    where club_id = '00000000-0000-0000-0000-000000000001'
      and aggregate_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001'
          and number >= 7
      );
    delete from notification_event_outbox
    where aggregate_id = '00000000-0000-0000-0000-000000019777';
    delete from notification_outbox
    where club_id = '00000000-0000-0000-0000-000000000001'
      and aggregate_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001'
          and number >= 7
      );
    delete from notification_outbox
    where aggregate_id = '00000000-0000-0000-0000-000000019777';
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
    delete from session_participants
    where session_id = '00000000-0000-0000-0000-000000019777';
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and number >= 7;
    delete from sessions
    where id = '00000000-0000-0000-0000-000000019777';
    delete from invitations
    where id = '00000000-0000-0000-0000-000000009801'
       or token_hash = '1111111111111111111111111111111111111111111111111111111111111111';
    delete from auth_sessions
    where id = '00000000-0000-0000-0000-000000009802'
       or session_token_hash = '2222222222222222222222222222222222222222222222222222222222222222';
    delete from memberships
    where id in (
      '00000000-0000-0000-0000-000000019201',
      '00000000-0000-0000-0000-000000019211',
      '00000000-0000-0000-0000-000000019212',
      '00000000-0000-0000-0000-000000019213'
    );
    delete from users
    where id = '00000000-0000-0000-0000-000000019101'
       or email in (
         'outside.host@example.com',
         'suspended.create@example.com',
         'left.create@example.com',
         'inactive.create@example.com'
       );
    delete from clubs
    where id = '00000000-0000-0000-0000-000000019001'
       or slug = 'outside-readmates-test';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        CLEANUP_GENERATED_SESSIONS_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        CLEANUP_GENERATED_SESSIONS_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
class HostSessionControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `host creates draft upcoming session without participants`() {
        seedNonActiveMemberships()

        mockMvc
            .post("/api/host/sessions") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = hostSessionRequestJson()
            }.andExpect {
                status { isCreated() }
                jsonPath("$.sessionNumber") { value(7) }
                jsonPath("$.state") { value("DRAFT") }
                jsonPath("$.visibility") { value("HOST_ONLY") }
            }

        val participantCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from session_participants
                join sessions on sessions.id = session_participants.session_id
                  and sessions.club_id = session_participants.club_id
                where sessions.club_id = '00000000-0000-0000-0000-000000000001'
                  and sessions.number = 7
                """.trimIndent(),
                Int::class.java,
            )
        assertEquals(0, participantCount)
    }

    @Test
    fun `host can list draft and open sessions including host only visibility`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[0].sessionId") { value(sessionId) }
                jsonPath("$.items[0].state") { value("DRAFT") }
                jsonPath("$.items[0].visibility") { value("HOST_ONLY") }
            }
    }

    @Test
    fun `host sessions list returns paged contract`() {
        createDraftSessionSeven()

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("limit", "2")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(2) }
                jsonPath("$.nextCursor") { exists() }
            }
    }

    @Test
    fun `host list summary is club scoped and independent of filters and pagination`() {
        val publishedIncomplete = createDraftSessionSeven()
        publishSession(publishedIncomplete)
        val closedDraft = createDraftSessionEight()
        updateSessionState(closedDraft, "CLOSED")
        insertRecordDraft(closedDraft)
        createOutsideClubSession(state = "PUBLISHED", visibility = "PUBLIC")
        insertRecordDraft(
            sessionId = "00000000-0000-0000-0000-000000019777",
            clubId = "00000000-0000-0000-0000-000000019001",
            membershipId = "00000000-0000-0000-0000-000000019201",
        )

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("search", "does-not-match")
                param("state", "OPEN")
                param("limit", "1")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(0) }
                jsonPath("$.summary.needsAttentionCount") { value(2) }
                jsonPath("$.summary.incompletePublishedCount") { value(1) }
                jsonPath("$.summary.draftCount") { value(1) }
            }

        val firstPage =
            mockMvc
                .get("/api/host/sessions") {
                    with(user("host@example.com"))
                    param("limit", "1")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items.length()") { value(1) }
                    jsonPath("$.summary.needsAttentionCount") { value(2) }
                    jsonPath("$.summary.incompletePublishedCount") { value(1) }
                    jsonPath("$.summary.draftCount") { value(1) }
                }.andReturn()
                .response
                .contentAsString
        val cursor =
            """"nextCursor"\s*:\s*"([^"]+)""""
                .toRegex()
                .find(firstPage)
                ?.groupValues
                ?.get(1)
                ?: error("first host session page did not include a next cursor")

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("limit", "1")
                param("cursor", cursor)
            }.andExpect {
                status { isOk() }
                jsonPath("$.summary.needsAttentionCount") { value(2) }
                jsonPath("$.summary.incompletePublishedCount") { value(1) }
                jsonPath("$.summary.draftCount") { value(1) }
            }
    }

    @Test
    fun `host list searches session number title and book within club`() {
        val seventh = createDraftSession("고유 제목", "검색 대상 책", "2026-05-20")
        createDraftSession("다른 제목", "다른 책", "2026-06-17")
        createOutsideClubSession(state = "DRAFT")

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("search", "검색 대상")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(1) }
                jsonPath("$.items[0].sessionId") { value(seventh) }
            }
    }

    @Test
    fun `host list filters needs attention using closing readiness and draft existence`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "OPEN")
        updateSessionState(sessionId, "CLOSED")
        insertRecordDraft(sessionId)

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("recordStatus", "INCOMPLETE")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[0].sessionId") { value(sessionId) }
                jsonPath("$.items[0].recordStatus") { value("INCOMPLETE") }
                jsonPath("$.items[0].needsAttention") { value(true) }
                jsonPath("$.items[0].hasDraft") { value(true) }
                jsonPath("$.items[0].draftRevision") { value(1) }
            }
    }

    @Test
    fun `host list explicitly filters attention for not started draft and open sessions`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "OPEN")
        updateSessionState(sessionId, "CLOSED")

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("search", "7")
                param("needsAttention", "true")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(1) }
                jsonPath("$.items[0].sessionId") { value(sessionId) }
                jsonPath("$.items[0].recordStatus") { value("NOT_STARTED") }
                jsonPath("$.items[0].needsAttention") { value(true) }
            }

        insertRecordDraft(sessionId)
        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("search", "7")
                param("needsAttention", "true")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[0].recordStatus") { value("INCOMPLETE") }
                jsonPath("$.items[0].hasDraft") { value(true) }
            }

        updateSessionState(sessionId, "OPEN")
        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("search", "7")
                param("needsAttention", "false")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(1) }
                jsonPath("$.items[0].sessionId") { value(sessionId) }
                jsonPath("$.items[0].needsAttention") { value(false) }
            }
    }

    @Test
    @Suppress("LongMethod")
    fun `host list rejects malformed query bound and cross club cursors`() {
        createDraftSessionSeven()
        createDraftSessionEight()

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("cursor", "not-a-cursor")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_CURSOR") }
            }

        val duplicateKeyCursor =
            java.util.Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString("id=one&id=two".toByteArray())
        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("cursor", duplicateKeyCursor)
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_CURSOR") }
            }

        val response =
            mockMvc
                .get("/api/host/sessions") {
                    with(user("host@example.com"))
                    param("limit", "1")
                }.andExpect {
                    status { isOk() }
                }.andReturn()
                .response
                .contentAsString
        val cursor =
            """"nextCursor"\s*:\s*"([^"]+)""""
                .toRegex()
                .find(response)
                ?.groupValues
                ?.get(1)
                ?: error("paged host session response did not include a next cursor")

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("limit", "1")
                param("cursor", cursor)
                param("needsAttention", "true")
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_CURSOR") }
            }

        val decoded = CursorCodec.decode(cursor) ?: error("host session cursor did not decode")
        val crossClubCursor =
            CursorCodec.encode(decoded + ("clubId" to "00000000-0000-0000-0000-000000000002"))
                ?: error("cross-club cursor did not encode")
        val malformedIdCursor =
            CursorCodec.encode(decoded + ("id" to "not-a-uuid"))
                ?: error("malformed-id cursor did not encode")
        listOf(crossClubCursor, malformedIdCursor).forEach { invalidCursor ->
            mockMvc
                .get("/api/host/sessions") {
                    with(user("host@example.com"))
                    param("limit", "1")
                    param("cursor", invalidCursor)
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.code") { value("INVALID_CURSOR") }
                }
        }
    }

    @Test
    fun `host list orders by session number and id descending`() {
        val seventh = createDraftSessionSeven()
        val eighth = createDraftSessionEight()

        mockMvc
            .get("/api/host/sessions") {
                with(user("host@example.com"))
                param("limit", "2")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[0].sessionId") { value(eighth) }
                jsonPath("$.items[1].sessionId") { value(seventh) }
            }
    }

    @Test
    fun `basic update audit records field names but not meeting credentials`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = hostSessionRequestJson()
            }.andExpect {
                status { isOk() }
            }

        val audit =
            jdbcTemplate.queryForMap(
                "select action_type, changed_fields_json from host_session_change_audit where session_id = ?",
                sessionId,
            )
        assertThat(audit["action_type"]).isEqualTo("BASIC_INFO_UPDATED")
        assertThat(audit["changed_fields_json"].toString())
            .contains("meetingUrl", "meetingPasscode")
            .doesNotContain("meet.google.com")
            .doesNotContain("readmates")
    }

    @Test
    fun `attendance audit records membership id and state transition`() {
        createSessionSeven()
        val membershipId = "00000000-0000-0000-0000-000000000201"

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/attendance") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """[{"membershipId":"$membershipId","attendanceStatus":"ABSENT"}]"""
            }.andExpect {
                status { isOk() }
            }

        val details =
            jdbcTemplate.queryForObject(
                "select changed_fields_json from host_session_change_audit where session_id = ?",
                String::class.java,
                "00000000-0000-0000-0000-000000009777",
            )
        assertThat(details)
            .contains(membershipId, """"from":"UNKNOWN"""", """"to":"ABSENT"""")
            .doesNotContain("host@example.com", "김호스트")
    }

    @Test
    fun `host updates draft session visibility and member upcoming sessions include it`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .patch("/api/host/sessions/$sessionId/visibility") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"MEMBER"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.session.visibility") { value("MEMBER") }
            }

        mockMvc
            .get("/api/sessions/upcoming") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$[0].sessionId") { value(sessionId) }
                jsonPath("$[0].visibility") { value("MEMBER") }
            }
    }

    @Test
    fun `member visible draft session returns composer without notification or decision rows`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .patch("/api/host/sessions/$sessionId/visibility") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"MEMBER"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.session.visibility") { value("MEMBER") }
                jsonPath("$.composer.eventType") { value("NEXT_BOOK_PUBLISHED") }
            }

        assertEquals(0, countRows("notification_event_outbox", "aggregate_id = '$sessionId'"))
        assertEquals(0, countRows("host_action_notification_decisions", "session_id = '$sessionId'"))
    }

    @Test
    fun `legacy visibility notification fields are rejected before mutation`() {
        val sessionId = createDraftSessionSeven()

        listOf(
            """{"visibility":"MEMBER","previewId":"00000000-0000-0000-0000-000000008001"}""",
            """{"visibility":"MEMBER","notificationDecision":"SEND"}""",
        ).forEach { request ->
            mockMvc
                .patch("/api/host/sessions/$sessionId/visibility") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = request
                }.andExpect {
                    status { isBadRequest() }
                }
            assertEquals("HOST_ONLY", findSessionVisibility(sessionId))
        }
    }

    @Test
    fun `safe default keeps closed session visibility compatibility`() {
        val sessionId = createDraftSessionSeven()
        // Transition to CLOSED state first so that PUBLIC visibility is valid (DRAFT+PUBLIC violates the invariant)
        updateSessionState(sessionId, "OPEN")
        updateSessionState(sessionId, "CLOSED")
        insertPublicationRow(sessionId, visibility = "MEMBER", isPublic = false, published = false)

        mockMvc
            .patch("/api/host/sessions/$sessionId/visibility") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"PUBLIC"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.session.visibility") { value("PUBLIC") }
            }

        val publicPublication = findPublicationRow(sessionId)
        assertEquals("PUBLIC", publicPublication["visibility"])
        assertEquals(true, publicPublication["is_public"])
        assertNotNull(publicPublication["published_at"])

        mockMvc
            .patch("/api/host/sessions/$sessionId/visibility") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"HOST_ONLY"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.session.visibility") { value("HOST_ONLY") }
            }

        val hostOnlyPublication = findPublicationRow(sessionId)
        assertEquals("HOST_ONLY", hostOnlyPublication["visibility"])
        assertEquals(false, hostOnlyPublication["is_public"])
        assertNull(hostOnlyPublication["published_at"])
    }

    @Test
    fun `member upcoming sessions include only draft member or public sessions`() {
        val memberSessionId = createDraftSession("7회차 · 멤버 공개 책", "멤버 공개 책", "2026-05-20")
        updateSessionVisibility(memberSessionId, "MEMBER")
        // DRAFT+PUBLIC violates the state×visibility invariant; use a second DRAFT+MEMBER session instead
        val memberSessionId2 = createDraftSession("8회차 · 멤버 공개 책 2", "멤버 공개 책 2", "2026-06-17")
        updateSessionVisibility(memberSessionId2, "MEMBER")
        val hostOnlySessionId = createDraftSession("9회차 · 호스트 책", "호스트 책", "2026-07-15")
        val openSessionId = createDraftSession("10회차 · 열린 책", "열린 책", "2026-08-19")
        updateSessionVisibility(openSessionId, "MEMBER")
        updateSessionState(openSessionId, "OPEN")
        val closedSessionId = createDraftSession("11회차 · 닫힌 책", "닫힌 책", "2026-09-16")
        // Must set state to CLOSED before setting PUBLIC visibility (DRAFT+PUBLIC violates the invariant)
        updateSessionState(closedSessionId, "OPEN")
        updateSessionState(closedSessionId, "CLOSED")
        updateSessionVisibility(closedSessionId, "PUBLIC")
        // Outside club session uses MEMBER visibility (DRAFT+PUBLIC violates the invariant)
        createOutsideClubSession(state = "DRAFT", visibility = "MEMBER")

        mockMvc
            .get("/api/sessions/upcoming") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(2) }
                jsonPath("$[0].sessionId") { value(memberSessionId) }
                jsonPath("$[0].visibility") { value("MEMBER") }
                jsonPath("$[1].sessionId") { value(memberSessionId2) }
                jsonPath("$[1].visibility") { value("MEMBER") }
            }

        assertEquals("HOST_ONLY", findSessionVisibility(hostOnlySessionId))
        assertEquals("OPEN", findSessionState(openSessionId))
        assertEquals("CLOSED", findSessionState(closedSessionId))
    }

    @Test
    fun `host starts draft session as open and creates active participants`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("OPEN") }
            }

        val participantCount = participantCountForSessionNumber(7)
        assertEquals(6, participantCount)
    }

    @Test
    fun `host open transition is idempotent for already open session`() {
        createSessionSeven()

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
                jsonPath("$.state") { value("OPEN") }
            }

        assertEquals(6, participantCountForSessionNumber(7))
    }

    @Test
    fun `host cannot open closed session`() {
        createSessionSeven()
        updateSessionState("00000000-0000-0000-0000-000000009777", "CLOSED")

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }
    }

    @Test
    fun `host cannot open published session`() {
        createSessionSeven()
        // OPEN→CLOSED to maintain valid state, then set visibility before PUBLISHED (PUBLISHED+HOST_ONLY violates invariant)
        updateSessionState("00000000-0000-0000-0000-000000009777", "CLOSED")
        updateSessionVisibility("00000000-0000-0000-0000-000000009777", "MEMBER")
        updateSessionState("00000000-0000-0000-0000-000000009777", "PUBLISHED")

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }
    }

    @Test
    fun `host closes open session`() {
        createSessionSeven()

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
                jsonPath("$.state") { value("CLOSED") }
            }

        assertEquals("CLOSED", findSessionState("00000000-0000-0000-0000-000000009777"))
    }

    @Test
    fun `host close transition is idempotent for already closed session`() {
        createSessionSeven()
        updateSessionState("00000000-0000-0000-0000-000000009777", "CLOSED")

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
                jsonPath("$.state") { value("CLOSED") }
            }
    }

    @Test
    fun `host publishes closed session with member or public publication`() {
        createSessionSeven()

        mockMvc
            .put("/api/host/sessions/00000000-0000-0000-0000-000000009777/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "publicSummary": "공개 전환 테스트 요약입니다.",
                      "visibility": "PUBLIC"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
            }
        updateSessionState("00000000-0000-0000-0000-000000009777", "CLOSED")

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("PUBLISHED") }
                jsonPath("$.publication.visibility") { value("PUBLIC") }
            }

        assertEquals("PUBLISHED", findSessionState("00000000-0000-0000-0000-000000009777"))
        assertNotNull(findPublicationRow("00000000-0000-0000-0000-000000009777")["published_at"])
    }

    @Test
    fun `host cannot publish open draft host only or unpublished sessions`() {
        createSessionSeven()

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }

        mockMvc
            .put("/api/host/sessions/00000000-0000-0000-0000-000000009777/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "publicSummary": "호스트 전용 요약입니다.",
                      "visibility": "HOST_ONLY"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
            }

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }
    }

    @Test
    fun `host close does not overwrite session state changed before close update`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        createSessionSeven()

        HostSessionCloseRaceProbe.publishBeforeNextCloseUpdate(sessionId)
        try {
            mockMvc
                .post("/api/host/sessions/$sessionId/close") {
                    with(user("host@example.com"))
                    with(csrf())
                }.andExpect {
                    status { isConflict() }
                }
        } finally {
            HostSessionCloseRaceProbe.clear()
        }

        assertEquals("PUBLISHED", findSessionState(sessionId))
    }

    @Test
    fun `host cannot close draft or published session`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }

        // PUBLISHED+HOST_ONLY violates the invariant; set visibility to MEMBER first
        updateSessionVisibility(sessionId, "MEMBER")
        updateSessionState(sessionId, "PUBLISHED")

        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }
    }

    @Test
    fun `host session external urls must be https urls`() {
        val invalidUrlFields =
            listOf(
                """"bookLink": "http://example.com/books/test-book"""",
                """"bookImageUrl": "data:image/svg+xml,<svg></svg>"""",
                """"meetingUrl": "javascript:alert(1)"""",
                """"meetingUrl": "https://user@example.com/meeting"""",
            )

        invalidUrlFields.forEach { invalidUrlField ->
            mockMvc
                .post("/api/host/sessions") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "7회차 · URL 검증 테스트",
                          "bookTitle": "URL 검증 책",
                          "bookAuthor": "URL 검증 저자",
                          "date": "2026-05-20",
                          $invalidUrlField
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                }
        }

        val generatedSessionCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                where club_id = '00000000-0000-0000-0000-000000000001'
                  and number >= 7
                """.trimIndent(),
                Int::class.java,
            )
        assertEquals(0, generatedSessionCount)
    }

    @Test
    fun `host cannot start another open session while one exists`() {
        val firstSessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$firstSessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        val secondSessionId = createDraftSessionEight()
        mockMvc
            .post("/api/host/sessions/$secondSessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }
    }

    @Test
    fun `member cannot create host session`() {
        mockMvc
            .post("/api/host/sessions") {
                with(user("member5@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "7회차 · 테스트 책",
                      "bookTitle": "테스트 책",
                      "bookAuthor": "테스트 저자",
                      "date": "2026-05-20"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `host previews open session deletion impact`() {
        createSessionSeven()
        seedSessionOwnedRows()

        mockMvc
            .get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
                jsonPath("$.sessionNumber") { value(7) }
                jsonPath("$.title") { value("7회차 · 테스트 책") }
                jsonPath("$.state") { value("OPEN") }
                jsonPath("$.canDelete") { value(true) }
                jsonPath("$.counts.participants") { value(6) }
                jsonPath("$.counts.rsvpResponses") { value(1) }
                jsonPath("$.counts.questions") { value(2) }
                jsonPath("$.counts.checkins") { value(1) }
                jsonPath("$.counts.oneLineReviews") { value(1) }
                jsonPath("$.counts.longReviews") { value(1) }
                jsonPath("$.counts.highlights") { value(1) }
                jsonPath("$.counts.publications") { value(1) }
                jsonPath("$.counts.feedbackReports") { value(1) }
                jsonPath("$.counts.feedbackDocuments") { value(1) }
            }
    }

    @Test
    fun `host deletes open session and all session owned rows`() {
        createSessionSeven()
        seedSessionOwnedRows()
        seedNonSessionRows()

        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
                jsonPath("$.sessionNumber") { value(7) }
                jsonPath("$.deleted") { value(true) }
                jsonPath("$.counts.participants") { value(6) }
                jsonPath("$.counts.rsvpResponses") { value(1) }
                jsonPath("$.counts.questions") { value(2) }
                jsonPath("$.counts.checkins") { value(1) }
                jsonPath("$.counts.oneLineReviews") { value(1) }
                jsonPath("$.counts.longReviews") { value(1) }
                jsonPath("$.counts.highlights") { value(1) }
                jsonPath("$.counts.publications") { value(1) }
                jsonPath("$.counts.feedbackReports") { value(1) }
                jsonPath("$.counts.feedbackDocuments") { value(1) }
            }

        assertEquals(0, countRows("sessions", "id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(0, countRows("session_participants", "session_id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(0, countRows("questions", "session_id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(0, countRows("reading_checkins", "session_id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(0, countRows("one_line_reviews", "session_id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(0, countRows("long_reviews", "session_id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(0, countRows("highlights", "session_id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(0, countRows("public_session_publications", "session_id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(0, countRows("feedback_reports", "session_id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(0, countRows("session_feedback_documents", "session_id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(
            1,
            countRows(
                "invitations",
                "id = '00000000-0000-0000-0000-000000009801' " +
                    "and token_hash = '1111111111111111111111111111111111111111111111111111111111111111'",
            ),
        )
        assertEquals(
            1,
            countRows(
                "auth_sessions",
                "id = '00000000-0000-0000-0000-000000009802' " +
                    "and session_token_hash = '2222222222222222222222222222222222222222222222222222222222222222'",
            ),
        )
        assertEquals(6, countRows("memberships", "club_id = '00000000-0000-0000-0000-000000000001'"))
        assertEquals(
            6,
            countRows(
                "users",
                "email in ('host@example.com', 'member1@example.com', 'member2@example.com', 'member3@example.com', 'member4@example.com', 'member5@example.com')",
            ),
        )
    }

    @Test
    @Suppress("LongMethod")
    fun `immutable record history prevents open session deletion`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        createSessionSeven()
        jdbcTemplate.update(
            """
            insert into session_record_revisions (
              id, session_id, club_id, version, source, snapshot_json, snapshot_sha256,
              applied_by_membership_id
            ) values (?, ?, ?, 1, 'BASELINE', '{}', ?, ?)
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009901",
            sessionId,
            "00000000-0000-0000-0000-000000000001",
            "a".repeat(64),
            "00000000-0000-0000-0000-000000000201",
        )
        jdbcTemplate.update(
            """
            insert into host_action_notification_previews (
              id, club_id, session_id, host_membership_id, action_type, event_type, request_hash,
              expected_live_revision, target_count, expected_in_app_count, expected_email_count,
              excluded_count, expires_at
            ) values (?, ?, ?, ?, 'RECORD_APPLY', 'SESSION_RECORD_UPDATED', ?, 1, 0, 0, 0, 0,
                      timestampadd(hour, 1, utc_timestamp(6)))
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009905",
            "00000000-0000-0000-0000-000000000001",
            sessionId,
            "00000000-0000-0000-0000-000000000201",
            "d".repeat(64),
        )
        jdbcTemplate.update(
            """
            insert into host_action_notification_decisions (
              id, preview_id, club_id, session_id, host_membership_id, action_type, event_type,
              live_revision, decision, target_count, expected_in_app_count, expected_email_count,
              excluded_count
            ) values (?, ?, ?, ?, ?, 'RECORD_APPLY', 'SESSION_RECORD_UPDATED', 1, 'SKIP', 0, 0, 0, 0)
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009906",
            "00000000-0000-0000-0000-000000009905",
            "00000000-0000-0000-0000-000000000001",
            sessionId,
            "00000000-0000-0000-0000-000000000201",
        )
        jdbcTemplate.update(
            """
            update host_action_notification_previews
            set consumed_at = utc_timestamp(6),
                consumed_decision_id = ?
            where id = ?
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009906",
            "00000000-0000-0000-0000-000000009905",
        )

        mockMvc
            .get("/api/host/sessions/$sessionId/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.canDelete") { value(false) }
            }
        mockMvc
            .delete("/api/host/sessions/$sessionId") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_DELETE_HISTORY_EXISTS") }
            }
        assertEquals(1, countRows("sessions", "id = '$sessionId'"))
        assertEquals(1, countRows("host_action_notification_decisions", "session_id = '$sessionId'"))
    }

    @Test
    @Suppress("LongMethod")
    fun `open deletion removes ephemeral draft audit preview and AI receipt rows transactionally`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        val clubId = "00000000-0000-0000-0000-000000000001"
        val hostMembershipId = "00000000-0000-0000-0000-000000000201"
        createSessionSeven()
        jdbcTemplate.update(
            """
            insert into session_record_drafts (
              session_id, club_id, base_live_revision, draft_revision, source, snapshot_json,
              snapshot_sha256, updated_by_membership_id
            ) values (?, ?, 0, 1, 'MANUAL', '{}', ?, ?)
            """.trimIndent(),
            sessionId,
            clubId,
            "b".repeat(64),
            hostMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into host_session_change_audit (
              id, club_id, session_id, actor_membership_id, action_type, changed_fields_json
            ) values (?, ?, ?, ?, 'BASIC_INFO_UPDATED', '{}')
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009902",
            clubId,
            sessionId,
            hostMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into host_action_notification_previews (
              id, club_id, session_id, host_membership_id, action_type, event_type, request_hash,
              expected_live_revision, target_count, expected_in_app_count, expected_email_count,
              excluded_count, expires_at
            ) values (?, ?, ?, ?, 'RECORD_APPLY', 'SESSION_RECORD_UPDATED', ?, 0, 0, 0, 0, 0,
                      timestampadd(hour, 1, utc_timestamp(6)))
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009903",
            clubId,
            sessionId,
            hostMembershipId,
            "c".repeat(64),
        )
        jdbcTemplate.update(
            """
            insert into ai_generation_commit_receipts (
              job_id, revision, session_id, club_id, committed_at
            ) values (?, 1, ?, ?, utc_timestamp(6))
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009904",
            sessionId,
            clubId,
        )

        mockMvc
            .delete("/api/host/sessions/$sessionId") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        listOf(
            "session_record_drafts",
            "host_session_change_audit",
            "host_action_notification_previews",
            "ai_generation_commit_receipts",
        ).forEach { table ->
            assertEquals(0, countRows(table, "session_id = '$sessionId'"), table)
        }
    }

    @Test
    fun `host cannot delete closed or published session`() {
        createSessionSeven()
        jdbcTemplate.update(
            """
            update sessions
            set state = 'CLOSED'
            where id = '00000000-0000-0000-0000-000000009777'
            """.trimIndent(),
        )

        mockMvc
            .get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isConflict() }
            }

        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }

        jdbcTemplate.update(
            """
            update sessions
            set visibility = 'MEMBER', state = 'PUBLISHED'
            where id = '00000000-0000-0000-0000-000000009777'
            """.trimIndent(),
        )

        mockMvc
            .get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isConflict() }
            }

        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
            }
    }

    @Test
    fun `member cannot preview or delete host session`() {
        createSessionSeven()

        mockMvc
            .get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isForbidden() }
            }

        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                with(user("member5@example.com"))
                with(csrf())
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `delete returns not found for missing session`() {
        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009778") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isNotFound() }
            }
    }

    @Test
    fun `host saves session record visibility and compatibility publication columns`() {
        createSessionSeven()

        mockMvc
            .put("/api/host/sessions/00000000-0000-0000-0000-000000009777/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "publicSummary": "멤버에게만 공유할 테스트 기록입니다.",
                      "visibility": "MEMBER"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.publicSummary") { value("멤버에게만 공유할 테스트 기록입니다.") }
                jsonPath("$.visibility") { value("MEMBER") }
                jsonPath("$.isPublic") { doesNotExist() }
                jsonPath("$.published") { doesNotExist() }
            }

        val memberPublication = findPublicationRow()
        assertEquals("MEMBER", memberPublication["visibility"])
        assertEquals(false, memberPublication["is_public"])
        assertNull(memberPublication["published_at"])
        assertEquals("MEMBER", findSessionVisibility("00000000-0000-0000-0000-000000009777"))

        mockMvc
            .put("/api/host/sessions/00000000-0000-0000-0000-000000009777/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "publicSummary": "모두에게 공개할 테스트 기록입니다.",
                      "visibility": "PUBLIC"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.publicSummary") { value("모두에게 공개할 테스트 기록입니다.") }
                jsonPath("$.visibility") { value("PUBLIC") }
                jsonPath("$.isPublic") { doesNotExist() }
                jsonPath("$.published") { doesNotExist() }
            }

        val publicPublication = findPublicationRow()
        assertEquals("PUBLIC", publicPublication["visibility"])
        assertEquals(true, publicPublication["is_public"])
        assertNotNull(publicPublication["published_at"])
        assertEquals("PUBLIC", findSessionVisibility("00000000-0000-0000-0000-000000009777"))

        mockMvc
            .put("/api/host/sessions/00000000-0000-0000-0000-000000009777/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "publicSummary": "호스트만 볼 테스트 기록입니다.",
                      "visibility": "HOST_ONLY"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.publicSummary") { value("호스트만 볼 테스트 기록입니다.") }
                jsonPath("$.visibility") { value("HOST_ONLY") }
                jsonPath("$.isPublic") { doesNotExist() }
                jsonPath("$.published") { doesNotExist() }
            }

        val hostOnlyPublication = findPublicationRow()
        assertEquals("HOST_ONLY", hostOnlyPublication["visibility"])
        assertEquals(false, hostOnlyPublication["is_public"])
        assertNull(hostOnlyPublication["published_at"])
        assertEquals("HOST_ONLY", findSessionVisibility("00000000-0000-0000-0000-000000009777"))
    }

    @Test
    fun `host cannot preview or delete session outside own club`() {
        createOutsideClubSession()

        mockMvc
            .get("/api/host/sessions/00000000-0000-0000-0000-000000019777/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isNotFound() }
            }

        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000019777") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isNotFound() }
            }
    }

    @Test
    fun `preview and delete return bad request for malformed session id`() {
        mockMvc
            .get("/api/host/sessions/not-a-uuid/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isBadRequest() }
            }

        mockMvc
            .delete("/api/host/sessions/not-a-uuid") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `session number is reused after deleting open session`() {
        createSessionSeven()

        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        mockMvc
            .post("/api/host/sessions") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "7회차 · 다시 만든 책",
                      "bookTitle": "다시 만든 책",
                      "bookAuthor": "다시 만든 저자",
                      "date": "2026-05-27"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isCreated() }
                jsonPath("$.sessionNumber") { value(7) }
                jsonPath("$.state") { value("DRAFT") }
            }
    }

    @Test
    fun `second delete returns not found after first delete succeeds`() {
        createSessionSeven()

        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isNotFound() }
            }
    }

    @Test
    fun `concurrent host deletes remove open session once through controller lock path`() {
        createSessionSeven()

        val statuses =
            runConcurrently(workerCount = 2) {
                mockMvc
                    .delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                        with(user("host@example.com"))
                        with(csrf())
                    }.andReturn()
                    .response.status
            }

        assertThat(statuses.count { it == 200 }).isEqualTo(1)
        assertThat(statuses.count { it == 404 }).isEqualTo(1)
        assertEquals(0, countRows("sessions", "id = '00000000-0000-0000-0000-000000009777'"))
    }

    private fun hostSessionRequestJson() =
        """
        {
          "title": "7회차 · 테스트 책",
          "bookTitle": "테스트 책",
          "bookAuthor": "테스트 저자",
          "bookLink": "https://example.com/books/test-book",
          "bookImageUrl": "https://example.com/covers/test-book.jpg",
          "date": "2026-05-20",
          "startTime": "19:30",
          "endTime": "21:40",
          "questionDeadlineAt": "2026-05-18T22:30:00+09:00",
          "locationLabel": "온라인",
          "meetingUrl": "https://meet.google.com/readmates-test",
          "meetingPasscode": "readmates"
        }
        """.trimIndent()

    private fun createDraftSessionSeven(): String = createDraftSession("7회차 · 테스트 책", "테스트 책", "2026-05-20")

    private fun createDraftSessionEight(): String = createDraftSession("8회차 · 다음 책", "다음 책", "2026-06-17")

    private fun <T> runConcurrently(
        workerCount: Int,
        action: () -> T,
    ): List<T> {
        val executor = Executors.newFixedThreadPool(workerCount)
        val ready = CountDownLatch(workerCount)
        val start = CountDownLatch(1)
        return try {
            val futures =
                (1..workerCount).map {
                    executor.submit<T> {
                        ready.countDown()
                        check(start.await(5, TimeUnit.SECONDS)) { "Timed out waiting to start concurrent work" }
                        action()
                    }
                }
            check(ready.await(5, TimeUnit.SECONDS)) { "Timed out waiting for concurrent workers" }
            start.countDown()
            futures.map { it.get(10, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
    }

    private fun createDraftSession(
        title: String,
        bookTitle: String,
        date: String,
    ): String {
        val response =
            mockMvc
                .post("/api/host/sessions") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "$title",
                          "bookTitle": "$bookTitle",
                          "bookAuthor": "테스트 저자",
                          "bookLink": "https://example.com/books/test-book",
                          "bookImageUrl": "https://example.com/covers/test-book.jpg",
                          "date": "$date",
                          "locationLabel": "온라인"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                }.andReturn()

        return """"sessionId"\s*:\s*"([^"]+)""""
            .toRegex()
            .find(response.response.contentAsString)
            ?.groupValues
            ?.get(1)
            ?: error("created session response did not include a sessionId")
    }

    private fun insertRecordDraft(
        sessionId: String,
        clubId: String = "00000000-0000-0000-0000-000000000001",
        membershipId: String = "00000000-0000-0000-0000-000000000201",
    ) {
        jdbcTemplate.update(
            """
            insert into session_record_drafts (
              session_id, club_id, base_live_revision, draft_revision, source,
              snapshot_json, snapshot_sha256, updated_by_membership_id
            ) values (?, ?, 0, 1, 'MANUAL', '{}', ?, ?)
            """.trimIndent(),
            sessionId,
            clubId,
            "a".repeat(64),
            membershipId,
        )
    }

    private fun participantCountForSessionNumber(number: Int): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from session_participants
            join sessions on sessions.id = session_participants.session_id
              and sessions.club_id = session_participants.club_id
            where sessions.club_id = '00000000-0000-0000-0000-000000000001'
              and sessions.number = ?
              and session_participants.participation_status = 'ACTIVE'
            """.trimIndent(),
            Int::class.java,
            number,
        ) ?: 0

    private fun seedNonActiveMemberships() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values
              ('00000000-0000-0000-0000-000000019111', 'suspended.create@example.com', '정지 생성 제외', '정지', 'PASSWORD'),
              ('00000000-0000-0000-0000-000000019112', 'left.create@example.com', '탈퇴 생성 제외', '탈퇴', 'PASSWORD'),
              ('00000000-0000-0000-0000-000000019113', 'inactive.create@example.com', '비활성 생성 제외', '비활성', 'PASSWORD')
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values
              (
                '00000000-0000-0000-0000-000000019211',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000019111',
                'MEMBER',
                'SUSPENDED',
                utc_timestamp(6),
                '정지'
              ),
              (
                '00000000-0000-0000-0000-000000019212',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000019112',
                'MEMBER',
                'LEFT',
                utc_timestamp(6),
                '탈퇴'
              ),
              (
                '00000000-0000-0000-0000-000000019213',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000019113',
                'MEMBER',
                'INACTIVE',
                utc_timestamp(6),
                '비활성'
              )
            """.trimIndent(),
        )
    }

    private fun createSessionSeven() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state
            )
            values (
              '00000000-0000-0000-0000-000000009777',
              '00000000-0000-0000-0000-000000000001',
              7,
              '7회차 · 테스트 책',
              '테스트 책',
              '테스트 저자',
              'https://example.com/books/test-book',
              'https://example.com/covers/test-book.jpg',
              '2026-05-20',
              '20:00:00',
              '22:00:00',
              '온라인',
              'https://meet.google.com/readmates-test',
              'readmates',
              '2026-05-19 14:59:00',
              'OPEN'
            )
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000009777', memberships.id, 'NO_RESPONSE', 'UNKNOWN'
            from memberships
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
        )
    }

    private fun createOutsideClubSession(
        state: String = "OPEN",
        visibility: String = "HOST_ONLY",
    ) {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (
              '00000000-0000-0000-0000-000000019001',
              'outside-readmates-test',
              '다른 독서모임',
              '격리 테스트 클럽',
              '호스트 클럽 격리를 검증하기 위한 테스트 클럽입니다.'
            )
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (
              '00000000-0000-0000-0000-000000019101',
              'outside.host@example.com',
              '외부 호스트',
              '외부',
              'PASSWORD'
            )
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (
              '00000000-0000-0000-0000-000000019201',
              '00000000-0000-0000-0000-000000019001',
              '00000000-0000-0000-0000-000000019101',
              'HOST',
              'ACTIVE',
              utc_timestamp(6),
              '외부'
            )
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state,
              visibility
            )
            values (
              '00000000-0000-0000-0000-000000019777',
              '00000000-0000-0000-0000-000000019001',
              7,
              '외부 7회차 · 테스트 책',
              '외부 테스트 책',
              '외부 테스트 저자',
              '2026-05-20',
              '20:00:00',
              '22:00:00',
              '온라인',
              '2026-05-19 14:59:00',
              ?,
              ?
            )
            """.trimIndent(),
            state,
            visibility,
        )
    }

    private fun seedNonSessionRows() {
        val hostFixture =
            jdbcTemplate.queryForMap(
                """
                select memberships.id as membership_id, users.id as user_id
                from memberships
                join users on users.id = memberships.user_id
                where memberships.club_id = '00000000-0000-0000-0000-000000000001'
                  and users.email = 'host@example.com'
                """.trimIndent(),
            )

        jdbcTemplate.update(
            """
            insert into invitations (
              id,
              club_id,
              invited_by_membership_id,
              invited_email,
              invited_name,
              role,
              token_hash,
              status,
              expires_at
            )
            values (
              '00000000-0000-0000-0000-000000009801',
              '00000000-0000-0000-0000-000000000001',
              ?,
              'delete.keep.invite@example.com',
              '삭제 보존 초대',
              'MEMBER',
              '1111111111111111111111111111111111111111111111111111111111111111',
              'PENDING',
              '2030-01-01 00:00:00'
            )
            """.trimIndent(),
            hostFixture["membership_id"],
        )
        jdbcTemplate.update(
            """
            insert into auth_sessions (
              id,
              user_id,
              session_token_hash,
              expires_at,
              user_agent,
              ip_hash
            )
            values (
              '00000000-0000-0000-0000-000000009802',
              ?,
              '2222222222222222222222222222222222222222222222222222222222222222',
              '2030-01-01 00:00:00',
              'HostSessionControllerDbTest',
              '3333333333333333333333333333333333333333333333333333333333333333'
            )
            """.trimIndent(),
            hostFixture["user_id"],
        )
    }

    private fun seedSessionOwnedRows() {
        val hostMembershipId =
            jdbcTemplate.queryForObject(
                """
                select memberships.id
                from memberships
                join users on users.id = memberships.user_id
                where memberships.club_id = '00000000-0000-0000-0000-000000000001'
                  and users.email = 'host@example.com'
                """.trimIndent(),
                String::class.java,
            )
        val memberMembershipId =
            jdbcTemplate.queryForObject(
                """
                select memberships.id
                from memberships
                join users on users.id = memberships.user_id
                where memberships.club_id = '00000000-0000-0000-0000-000000000001'
                  and users.email = 'member5@example.com'
                """.trimIndent(),
                String::class.java,
            )

        jdbcTemplate.update(
            """
            update session_participants
            set rsvp_status = 'GOING'
            where session_id = '00000000-0000-0000-0000-000000009777'
              and membership_id = ?
            """.trimIndent(),
            memberMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            values
              ('00000000-0000-0000-0000-000000009701', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, 1, '삭제될 질문 1', '생각 1'),
              ('00000000-0000-0000-0000-000000009702', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, 2, '삭제될 질문 2', '생각 2')
            """.trimIndent(),
            memberMembershipId,
            memberMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into reading_checkins (id, club_id, session_id, membership_id, reading_progress)
            values ('00000000-0000-0000-0000-000000009703', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, 80)
            """.trimIndent(),
            memberMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            values ('00000000-0000-0000-0000-000000009704', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, '삭제될 한줄평', 'PRIVATE')
            """.trimIndent(),
            memberMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility)
            values ('00000000-0000-0000-0000-000000009705', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, '삭제될 장문평', 'PRIVATE')
            """.trimIndent(),
            memberMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order)
            values ('00000000-0000-0000-0000-000000009706', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, '삭제될 하이라이트', 1)
            """.trimIndent(),
            memberMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (id, club_id, session_id, public_summary, is_public, published_at)
            values ('00000000-0000-0000-0000-000000009707', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', '삭제될 공개 요약', false, null)
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into feedback_reports (id, club_id, session_id, membership_id, version, stored_path, file_name, content_type, file_size)
            values ('00000000-0000-0000-0000-000000009708', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', ?, 1, '/tmp/report.html', 'report.html', 'text/html', 10)
            """.trimIndent(),
            hostMembershipId,
        )
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (id, club_id, session_id, version, source_text, file_name, content_type, file_size)
            values ('00000000-0000-0000-0000-000000009709', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000009777', 1, '# 삭제될 문서', 'feedback.md', 'text/markdown', 20)
            """.trimIndent(),
        )
    }

    private fun countRows(
        tableName: String,
        whereClause: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $tableName where $whereClause",
            Int::class.java,
        ) ?: 0

    private fun insertPublicationRow(
        sessionId: String,
        visibility: String,
        isPublic: Boolean,
        published: Boolean,
    ) {
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id,
              club_id,
              session_id,
              public_summary,
              is_public,
              visibility,
              published_at
            )
            values (
              uuid(),
              '00000000-0000-0000-0000-000000000001',
              ?,
              '기존 공개 요약',
              ?,
              ?,
              case when ? then utc_timestamp(6) else null end
            )
            """.trimIndent(),
            sessionId,
            isPublic,
            visibility,
            published,
        )
    }

    private fun updateSessionVisibility(
        sessionId: String,
        visibility: String,
    ) {
        jdbcTemplate.update(
            """
            update sessions
            set visibility = ?
            where id = ?
              and club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            visibility,
            sessionId,
        )
    }

    private fun updateSessionState(
        sessionId: String,
        state: String,
    ) {
        jdbcTemplate.update(
            """
            update sessions
            set state = ?
            where id = ?
              and club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            state,
            sessionId,
        )
    }

    private fun publishSession(sessionId: String) {
        jdbcTemplate.update(
            """
            update sessions
            set state = 'PUBLISHED', visibility = 'PUBLIC'
            where id = ?
              and club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            sessionId,
        )
    }

    private fun findSessionVisibility(sessionId: String): String =
        jdbcTemplate.queryForObject(
            """
            select visibility
            from sessions
            where id = ?
              and club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            String::class.java,
            sessionId,
        ) ?: error("session $sessionId did not exist")

    private fun findSessionState(sessionId: String): String =
        jdbcTemplate.queryForObject(
            """
            select state
            from sessions
            where id = ?
              and club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            String::class.java,
            sessionId,
        ) ?: error("session $sessionId did not exist")

    private fun findPublicationRow(sessionId: String = "00000000-0000-0000-0000-000000009777"): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select visibility, is_public, published_at
            from public_session_publications
            where session_id = ?
            """.trimIndent(),
            sessionId,
        )

    @TestConfiguration
    class CloseRaceJdbcTemplateConfig {
        @Bean
        @Primary
        fun closeRaceJdbcTemplate(dataSource: DataSource): JdbcTemplate = CloseRaceJdbcTemplate(dataSource)
    }
}

private object HostSessionCloseRaceProbe {
    private val targetSessionId = ThreadLocal<String>()

    fun publishBeforeNextCloseUpdate(sessionId: String) {
        targetSessionId.set(sessionId)
    }

    fun clear() {
        targetSessionId.remove()
    }

    fun consumeIfMatches(
        sql: String,
        args: Array<out Any?>,
    ): String? {
        val sessionId = targetSessionId.get() ?: return null
        val normalizedSql = sql.trimIndent().replace(Regex("\\s+"), " ")
        val isHostSessionCloseUpdate = normalizedSql.startsWith("update sessions set state = 'CLOSED', updated_at = utc_timestamp(6)")
        if (!isHostSessionCloseUpdate || args.firstOrNull() != sessionId) {
            return null
        }

        targetSessionId.remove()
        return sessionId
    }
}

private class CloseRaceJdbcTemplate(
    private val rawDataSource: DataSource,
) : JdbcTemplate(rawDataSource) {
    override fun update(
        sql: String,
        vararg args: Any?,
    ): Int {
        val sessionId = HostSessionCloseRaceProbe.consumeIfMatches(sql, args)
        if (sessionId != null) {
            rawDataSource.connection.use { connection ->
                connection.autoCommit = true
                connection
                    .prepareStatement(
                        """
                        update sessions
                        set state = 'PUBLISHED', visibility = 'MEMBER'
                        where id = ?
                          and club_id = '00000000-0000-0000-0000-000000000001'
                        """.trimIndent(),
                    ).use { statement ->
                        statement.setString(1, sessionId)
                        statement.executeUpdate()
                    }
            }
        }
        return super.update(sql, *args)
    }
}
