package com.readmates.session.api

import com.readmates.auth.domain.MembershipRole
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.UpdateHostSessionCommand
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.shared.observability.RequestIdFilter
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.hasItem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
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
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.LocalDate
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
    delete from host_session_lifecycle_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from host_session_lifecycle_audit
    where session_id in (
      '00000000-0000-0000-0000-000000009777',
      '00000000-0000-0000-0000-000000019777'
    );
    delete mn from member_notifications mn
    inner join notification_event_outbox e on e.id = mn.event_id and e.club_id = mn.club_id
    where e.club_id = '00000000-0000-0000-0000-000000000001'
      and e.aggregate_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete mn from member_notifications mn
    inner join notification_event_outbox e on e.id = mn.event_id
    where e.aggregate_id in (
      '00000000-0000-0000-0000-000000009777',
      '00000000-0000-0000-0000-000000019777'
    );
    delete d from notification_deliveries d
    inner join notification_event_outbox e on e.id = d.event_id and e.club_id = d.club_id
    where e.club_id = '00000000-0000-0000-0000-000000000001'
      and e.aggregate_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete d from notification_deliveries d
    inner join notification_event_outbox e on e.id = d.event_id
    where e.aggregate_id in (
      '00000000-0000-0000-0000-000000009777',
      '00000000-0000-0000-0000-000000019777'
    );
    delete from notification_manual_dispatches
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from notification_manual_dispatches
    where session_id in (
      '00000000-0000-0000-0000-000000009777',
      '00000000-0000-0000-0000-000000019777'
    );
    delete from ai_generation_audit_log
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number >= 7
      );
    delete from ai_generation_audit_log
    where session_id in (
      '00000000-0000-0000-0000-000000009777',
      '00000000-0000-0000-0000-000000019777'
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
    where aggregate_id in (
      '00000000-0000-0000-0000-000000009777',
      '00000000-0000-0000-0000-000000019777'
    );
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
      '00000000-0000-0000-0000-000000019213',
      '00000000-0000-0000-0000-000000019214',
      '00000000-0000-0000-0000-000000019216'
    );
    delete from users
    where id in (
      '00000000-0000-0000-0000-000000019101',
      '00000000-0000-0000-0000-000000019114',
      '00000000-0000-0000-0000-000000019116'
    )
       or email in (
         'outside.host@example.com',
         'suspended.create@example.com',
         'left.create@example.com',
         'inactive.create@example.com',
         'later.active@example.com',
         'schedule.defaults.viewer@example.com'
       );
    delete from clubs
    where id = '00000000-0000-0000-0000-000000019001'
       or slug = 'outside-readmates-test';
"""

private const val RESET_HOST_AVATAR_KEY_SQL = """
    update memberships
    join users on users.id = memberships.user_id
    set memberships.avatar_key = 'mushroom-green-book'
    where memberships.club_id = '00000000-0000-0000-0000-000000000001'
      and users.email = 'host@example.com';
"""

private const val RESET_MEMBER1_ACTIVE_AVATAR_KEY_SQL = """
    update memberships
    join users on users.id = memberships.user_id
    set memberships.status = 'ACTIVE',
        memberships.avatar_key = 'lemon-green-book'
    where memberships.club_id = '00000000-0000-0000-0000-000000000001'
      and users.email = 'member1@example.com';
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
    @param:Autowired private val hostSessionDraftPort: HostSessionDraftPort,
) : ReadmatesMySqlIntegrationTestSupport() {
    private companion object {
        const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201"
        const val MEMBER5_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000206"
    }

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
    fun `host creates draft with guest readable access scope in one post`() {
        val response =
            mockMvc
                .post("/api/host/sessions") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "8회차 · 다음 책",
                          "bookTitle": "다음 책",
                          "bookAuthor": "다음 저자",
                          "date": "2026-06-11",
                          "accessScope": "GUEST_READABLE"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                    jsonPath("$.state") { value("DRAFT") }
                    jsonPath("$.accessScope") { value("GUEST_READABLE") }
                    jsonPath("$.visibility") { value("MEMBER") }
                    jsonPath("$.composer.eventType") { value("NEXT_BOOK_PUBLISHED") }
                    jsonPath("$.composer.sessionId") { exists() }
                    jsonPath("$.composer.contentRevision") { exists() }
                }.andReturn()
        val sessionId =
            """"sessionId"\s*:\s*"([^"]+)""""
                .toRegex()
                .find(response.response.contentAsString)
                ?.groupValues
                ?.get(1)
                ?: error("created session response did not include a sessionId")

        assertEquals("GUEST_READABLE", sessionAccessScope(sessionId))
        assertEquals("MEMBER", sessionVisibility(sessionId))
    }

    @Test
    fun `host draft defaults schedule deadline and optional meeting fields`() {
        val response =
            mockMvc
                .post("/api/host/sessions") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "7회차 · 기본값 테스트",
                          "bookTitle": "기본값 테스트",
                          "bookAuthor": "테스트 저자",
                          "date": "2026-05-20"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                    jsonPath("$.startTime") { value("20:00") }
                    jsonPath("$.endTime") { value("22:00") }
                    jsonPath("$.questionDeadlineAt") { value("2026-05-19T14:59Z") }
                    jsonPath("$.locationLabel") { value("온라인") }
                    jsonPath("$.meetingUrl") { doesNotExist() }
                    jsonPath("$.meetingPasscode") { doesNotExist() }
                }.andReturn()
        val sessionId =
            """"sessionId"\s*:\s*"([^"]+)""""
                .toRegex()
                .find(response.response.contentAsString)
                ?.groupValues
                ?.get(1)
                ?: error("created session response did not include a sessionId")

        val stored =
            jdbcTemplate.queryForMap(
                """
                select start_time, end_time, question_deadline_at, location_label, meeting_url, meeting_passcode
                from sessions
                where id = ?
                """.trimIndent(),
                sessionId,
            )
        assertEquals("20:00:00", stored["start_time"].toString())
        assertEquals("22:00:00", stored["end_time"].toString())
        assertEquals("2026-05-19T14:59", stored["question_deadline_at"].toString())
        assertEquals("온라인", stored["location_label"])
        assertNull(stored["meeting_url"])
        assertNull(stored["meeting_passcode"])
    }

    @Test
    fun `host update preserves null patches and normalizes blanks`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "7회차 · 수정된 책",
                      "bookTitle": "수정된 책",
                      "bookAuthor": "수정된 저자",
                      "bookLink": "   ",
                      "date": "2026-05-21",
                      "locationLabel": " ",
                      "meetingUrl": "",
                      "questionDeadlineAt": ""
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.startTime") { value("20:00") }
                jsonPath("$.endTime") { value("22:00") }
                jsonPath("$.questionDeadlineAt") { value("2026-05-20T14:59Z") }
                jsonPath("$.bookLink") { doesNotExist() }
                jsonPath("$.bookImageUrl") { value("https://example.com/covers/test-book.jpg") }
                jsonPath("$.locationLabel") { value("온라인") }
                jsonPath("$.meetingUrl") { doesNotExist() }
            }
    }

    @Test
    fun `host update rejects an end time equal to the stored start time`() {
        val sessionId = createDraftSessionSeven()

        val beforeRejectedUpdate = jdbcTemplate.queryForMap("select * from sessions where id = ?", sessionId)
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "title": "동일 시각 거부",
                      "bookTitle": "수정된 책",
                      "bookAuthor": "수정된 저자",
                      "date": "2026-05-21",
                      "endTime": "20:00"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }
        assertEquals(beforeRejectedUpdate, jdbcTemplate.queryForMap("select * from sessions where id = ?", sessionId))

        assertThrows<InvalidSessionScheduleException> {
            hostSessionDraftPort.update(
                UpdateHostSessionCommand(
                    host = hostMember(),
                    sessionId = java.util.UUID.fromString(sessionId),
                    session =
                        HostSessionCommand(
                            host = hostMember(),
                            title = "동일 시각 거부",
                            bookTitle = "수정된 책",
                            bookAuthor = "수정된 저자",
                            bookLink = null,
                            bookImageUrl = null,
                            date = "2026-05-21",
                            startTime = null,
                            endTime = "20:00",
                            questionDeadlineAt = null,
                            locationLabel = null,
                            meetingUrl = null,
                            meetingPasscode = null,
                        ),
                ),
            )
        }
    }

    @Test
    fun `host schedule defaults come from this club and are not parsed as a session id`() {
        createOutsideClubSession()
        jdbcTemplate.update(
            """
            update sessions
            set start_time = '10:00:00',
                end_time = '12:00:00',
                location_label = '다른 클럽 장소',
                meeting_url = 'https://meet.example.com/outside-club',
                meeting_passcode = 'outside-club-passcode',
                access_scope = 'HOST_ONLY'
            where id = '00000000-0000-0000-0000-000000019777'
            """.trimIndent(),
        )

        val response =
            mockMvc
                .get("/api/host/sessions/schedule-defaults") {
                    with(user("host@example.com"))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.startTime") { value("19:30") }
                    jsonPath("$.endTime") { value("21:30") }
                    jsonPath("$.locationLabel") { value("온라인") }
                    jsonPath("$.accessScope") { value("GUEST_READABLE") }
                    jsonPath("$.suggestedDate") { value("2026-05-13") }
                    jsonPath("$.questionDeadlineOffsetDays") { value(1) }
                    jsonPath("$.hints[0]") { value("이전 모임과 같은 시간으로 넣었습니다.") }
                    jsonPath("$.meetingUrl") { doesNotExist() }
                    jsonPath("$.meetingPasscode") { doesNotExist() }
                    jsonPath("$.bookTitle") { doesNotExist() }
                    jsonPath("$.bookAuthor") { doesNotExist() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(response).doesNotContain("10:00")
        assertThat(response).doesNotContain("outside-club-passcode")
        assertThat(response).doesNotContain("팩트풀니스")
        assertThat(response).contains("\"startTime\"")
        assertThat(response).contains("\"endTime\"")
        assertThat(response).contains("\"locationLabel\"")
        assertThat(response).contains("\"accessScope\"")
        assertThat(response).contains("\"suggestedDate\"")
        assertThat(response).contains("\"questionDeadlineOffsetDays\"")
        assertThat(response).contains("\"hints\"")
    }

    @Test
    fun `member and viewer cannot read schedule defaults`() {
        seedScheduleDefaultsViewer()

        mockMvc
            .get("/api/host/sessions/schedule-defaults") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isForbidden() }
            }

        mockMvc
            .get("/api/host/sessions/schedule-defaults") {
                with(user("schedule.defaults.viewer@example.com"))
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `host schedule defaults copy meeting passcode from the latest url row`() {
        insertHostScheduleSample(
            number = 7,
            date = "2026-05-13",
            startTime = "19:30:00",
            endTime = "21:30:00",
            meetingUrl = "https://meet.example.com/host-latest",
            meetingPasscode = "host-form-pass",
        )

        mockMvc
            .get("/api/host/sessions/schedule-defaults") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.meetingUrl") { value("https://meet.example.com/host-latest") }
                jsonPath("$.meetingPasscode") { value("host-form-pass") }
            }
    }

    @Test
    fun `host schedule defaults use at most the last ten meetings`() {
        insertHostScheduleSample(
            number = 7,
            date = "2026-06-01",
            startTime = "23:00:00",
            endTime = "23:45:00",
            locationLabel = "11번째 장소",
        )
        (8..17).forEach { number ->
            insertHostScheduleSample(
                number = number,
                date = LocalDate.parse("2026-06-01").plusWeeks((number - 7).toLong()).toString(),
                startTime = "10:00:00",
                endTime = "12:00:00",
                locationLabel = "최근 장소",
                accessScope = "HOST_ONLY",
            )
        }

        mockMvc
            .get("/api/host/sessions/schedule-defaults") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.startTime") { value("10:00") }
                jsonPath("$.endTime") { value("12:00") }
                jsonPath("$.locationLabel") { value("최근 장소") }
                jsonPath("$.accessScope") { value("HOST_ONLY") }
            }
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
    fun `canonical exposure dual-writes and rejects open public intent`() {
        val sessionId = createDraftSessionSeven()
        insertPublicationRow(sessionId, visibility = "MEMBER", isPublic = false, published = false)

        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"accessScope":"GUEST_READABLE"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.session.accessScope") { value("GUEST_READABLE") }
                jsonPath("$.session.siteVisibility") { value("HIDDEN") }
                jsonPath("$.session.visibility") { value("MEMBER") }
            }

        assertExposureColumns(sessionId, "GUEST_READABLE", "MEMBER", "HIDDEN", "MEMBER", "0")

        updateSessionState(sessionId, "CLOSED")
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"publicSummary":"Closed public record.","siteVisibility":"PUBLIC_RECORD"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.accessScope") { value("GUEST_READABLE") }
                jsonPath("$.siteVisibility") { value("PUBLIC_RECORD") }
                jsonPath("$.visibility") { value("PUBLIC") }
            }

        assertExposureColumns(sessionId, "GUEST_READABLE", "PUBLIC", "PUBLIC_RECORD", "PUBLIC", "1")

        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"accessScope":"HOST_ONLY"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_EXPOSURE_INVALID") }
            }

        assertExposureColumns(sessionId, "GUEST_READABLE", "PUBLIC", "PUBLIC_RECORD", "PUBLIC", "1")

        updateSessionState(sessionId, "OPEN")
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"publicSummary":"Invalid while open.","siteVisibility":"PUBLIC_RECORD"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_EXPOSURE_INVALID") }
            }

        assertExposureColumns(sessionId, "GUEST_READABLE", "PUBLIC", "PUBLIC_RECORD", "PUBLIC", "1")
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
    fun `canonical guest readable draft returns composer without notification or decision rows`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"accessScope":"GUEST_READABLE"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.session.accessScope") { value("GUEST_READABLE") }
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
        assertEquals("GUEST_READABLE", sessionAccessScope(sessionId))
        assertEquals("PUBLIC", sessionVisibility(sessionId))
        assertEquals("PUBLIC_RECORD", publicationSiteVisibility(sessionId))
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
        assertEquals("HOST_ONLY", sessionAccessScope(sessionId))
        assertEquals("HOST_ONLY", sessionVisibility(sessionId))
        assertEquals("HIDDEN", publicationSiteVisibility(sessionId))
        assertEquals("MEMBER", hostOnlyPublication["visibility"])
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
    @Sql(
        statements = [
            RESET_HOST_AVATAR_KEY_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `host session attendee returns stored avatar key`() {
        createSessionSeven()
        jdbcTemplate.update(
            """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.avatar_key = 'toast-brown-book'
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = 'host@example.com'
            """.trimIndent(),
        )

        mockMvc
            .get("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.attendees[0].avatarKey") { value("toast-brown-book") }
                jsonPath("$.attendees[0].profileImageUrl") { doesNotExist() }
            }
    }

    @Test
    @Sql(
        statements = [
            RESET_MEMBER1_ACTIVE_AVATAR_KEY_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `host session attendee hides departed stored avatar key`() {
        createSessionSeven()
        jdbcTemplate.update(
            """
            update memberships
            join users on users.id = memberships.user_id
            set memberships.status = 'LEFT',
                memberships.avatar_key = 'snowglobe-green-book'
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = 'member1@example.com'
            """.trimIndent(),
        )

        mockMvc
            .get("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.attendees[?(@.membershipId == '00000000-0000-0000-0000-000000000202')].avatarKey") {
                    value(hasItem("cloud-green-book"))
                }
            }
    }

    @Test
    fun `host open transition is idempotent for already open session`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(sessionId) }
                jsonPath("$.state") { value("OPEN") }
            }

        val afterFirstOpen = lifecycleDbEvidence(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(sessionId) }
                jsonPath("$.state") { value("OPEN") }
            }

        assertEquals(afterFirstOpen, lifecycleDbEvidence(sessionId))
        assertEquals(6, participantCountForSessionNumber(7))
    }

    @Test
    fun `host cannot open closed session`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        createSessionSeven()
        updateSessionState(sessionId, "CLOSED")
        val beforeOpenAttempt = lifecycleDbEvidence(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CONFLICT") }
                jsonPath("$.message") { value("요청한 작업이 현재 세션 상태와 충돌합니다.") }
                jsonPath("$.status") { value(409) }
                jsonPath("$.traceId") { isNotEmpty() }
                jsonPath("$.length()") { value(4) }
            }
        assertEquals(beforeOpenAttempt, lifecycleDbEvidence(sessionId))
    }

    @Test
    fun `host cannot open published session`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        createSessionSeven()
        // OPEN→CLOSED to maintain valid state, then set visibility before PUBLISHED (PUBLISHED+HOST_ONLY violates invariant)
        updateSessionState(sessionId, "CLOSED")
        updateSessionVisibility(sessionId, "MEMBER")
        updateSessionState(sessionId, "PUBLISHED")
        val beforeOpenAttempt = lifecycleDbEvidence(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CONFLICT") }
                jsonPath("$.message") { value("요청한 작업이 현재 세션 상태와 충돌합니다.") }
                jsonPath("$.status") { value(409) }
                jsonPath("$.traceId") { isNotEmpty() }
                jsonPath("$.length()") { value(4) }
            }
        assertEquals(beforeOpenAttempt, lifecycleDbEvidence(sessionId))
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

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
                jsonPath("$.state") { value("CLOSED") }
            }

        val afterFirstClose = lifecycleDbEvidence("00000000-0000-0000-0000-000000009777")

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009777/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009777") }
                jsonPath("$.state") { value("CLOSED") }
            }

        assertEquals(afterFirstClose, lifecycleDbEvidence("00000000-0000-0000-0000-000000009777"))
    }

    @Test
    fun `host publishes closed session with member or public publication`() {
        createSessionSeven()
        updateSessionState("00000000-0000-0000-0000-000000009777", "CLOSED")

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
    fun `host publish replay returns published result without second write outbox or audit transition`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        createSessionSeven()
        updateSessionVisibility(sessionId, "MEMBER")
        insertPublicationRow(sessionId, visibility = "MEMBER", isPublic = false, published = false)

        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("CLOSED") }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("PUBLISHED") }
            }

        val afterFirstPublish = lifecycleDbEvidence(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(sessionId) }
                jsonPath("$.state") { value("PUBLISHED") }
            }

        assertEquals(afterFirstPublish, lifecycleDbEvidence(sessionId))
    }

    @Test
    fun `host cannot publish guest readable session when publication summary is blank`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        createSessionSeven()
        updateSessionState(sessionId, "CLOSED")
        updateSessionVisibility(sessionId, "MEMBER")
        insertPublicationRow(sessionId, visibility = "MEMBER", isPublic = false, published = false)
        withBlankPublicationSummary(sessionId) {
            val beforePublish = lifecycleDbEvidence(sessionId)

            mockMvc
                .post("/api/host/sessions/$sessionId/publish") {
                    with(user("host@example.com"))
                    with(csrf())
                }.andExpect {
                    status { isConflict() }
                    jsonPath("$.code") { value("CONFLICT") }
                    jsonPath("$.status") { value(409) }
                }

            assertEquals(beforePublish, lifecycleDbEvidence(sessionId))
        }
    }

    @Test
    fun `host cannot publish open draft host only or unpublished sessions`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        createSessionSeven()
        val openBefore = lifecycleDbEvidence(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CONFLICT") }
                jsonPath("$.status") { value(409) }
            }
        assertEquals(openBefore, lifecycleDbEvidence(sessionId))

        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }
        val unpublishedBefore = lifecycleDbEvidence(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CONFLICT") }
                jsonPath("$.status") { value(409) }
            }
        assertEquals(unpublishedBefore, lifecycleDbEvidence(sessionId))

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
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
        val hostOnlyBefore = lifecycleDbEvidence(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CONFLICT") }
                jsonPath("$.status") { value(409) }
            }
        assertEquals(hostOnlyBefore, lifecycleDbEvidence(sessionId))
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
        val draftBefore = lifecycleDbEvidence(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CONFLICT") }
                jsonPath("$.status") { value(409) }
            }
        assertEquals(draftBefore, lifecycleDbEvidence(sessionId))

        // PUBLISHED+HOST_ONLY violates the invariant; set visibility to MEMBER first
        updateSessionVisibility(sessionId, "MEMBER")
        updateSessionState(sessionId, "PUBLISHED")
        val publishedBefore = lifecycleDbEvidence(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CONFLICT") }
                jsonPath("$.status") { value(409) }
            }
        assertEquals(publishedBefore, lifecycleDbEvidence(sessionId))
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
                jsonPath("$.code") { value("SESSION_OPEN_ALREADY_EXISTS") }
                jsonPath("$.openSessionId") { value(firstSessionId) }
            }
    }

    @Test
    fun `host reopens a closed session`() {
        val sessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("CLOSED") }
            }

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(sessionId) }
                jsonPath("$.state") { value("OPEN") }
            }

        assertEquals("OPEN", findSessionState(sessionId))
        mockMvc
            .get("/api/sessions/current") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.currentSession.sessionId") { value(sessionId) }
            }
    }

    @Test
    fun `host reopen hides PUBLIC_RECORD and keeps publication summary`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")
        val publicSummary = "다시 열기 후에도 남는 공개 요약입니다."
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "publicSummary": "$publicSummary",
                      "visibility": "PUBLIC"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.siteVisibility") { value("PUBLIC_RECORD") }
            }
        assertEquals("PUBLIC_RECORD", publicationSiteVisibility(sessionId))

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("OPEN") }
            }

        assertEquals("OPEN", findSessionState(sessionId))
        assertEquals(1, countRows("public_session_publications", "session_id = '$sessionId'"))
        assertEquals("HIDDEN", publicationSiteVisibility(sessionId))
        assertEquals("MEMBER", publicationVisibility(sessionId))
        assertEquals("0", publicationIsPublic(sessionId))
        assertEquals("MEMBER", sessionVisibility(sessionId))
        assertEquals(publicSummary, findPublicationSummary(sessionId))
    }

    @Test
    fun `host reopen does not add members activated after close`() {
        val sessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }
        val participantCount = participantCountForSession(sessionId)
        val laterMembershipId = insertActiveMemberAfterClose()
        assertEquals(false, participantExists(sessionId, laterMembershipId))

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("OPEN") }
            }

        assertEquals(participantCount, participantCountForSession(sessionId))
        assertEquals(false, participantExists(sessionId, laterMembershipId))
    }

    @Test
    fun `host cannot reopen when another session is open`() {
        val openSessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$openSessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        val closedSessionId = createDraftSessionEight()
        updateSessionState(closedSessionId, "CLOSED")

        mockMvc
            .post("/api/host/sessions/$closedSessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_OPEN_ALREADY_EXISTS") }
                jsonPath("$.openSessionId") { value(openSessionId) }
            }

        assertEquals("CLOSED", findSessionState(closedSessionId))
        assertEquals("OPEN", findSessionState(openSessionId))
    }

    @Test
    fun `host cannot reopen a published session`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")
        updateSessionVisibility(sessionId, "MEMBER")
        updateSessionState(sessionId, "PUBLISHED")

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_REOPEN_NOT_ALLOWED") }
            }

        assertEquals("PUBLISHED", findSessionState(sessionId))
    }

    @Test
    fun `host unpublishes a published session`() {
        val sessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "publicSummary": "공개 취소 후 남는 기록 요약입니다.",
                      "visibility": "PUBLIC"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("PUBLISHED") }
            }
        mockMvc.get("/api/public/sessions/$sessionId").andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value(sessionId) }
        }

        mockMvc
            .post("/api/host/sessions/$sessionId/unpublish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("CLOSED") }
            }

        assertEquals("CLOSED", findSessionState(sessionId))
        assertEquals(1, countRows("public_session_publications", "session_id = '$sessionId'"))
        mockMvc.get("/api/public/sessions/$sessionId").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `host cannot unpublish an open session`() {
        val sessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        mockMvc
            .post("/api/host/sessions/$sessionId/unpublish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_UNPUBLISH_NOT_ALLOWED") }
            }

        assertEquals("OPEN", findSessionState(sessionId))
    }

    @Test
    fun `host returns an open session to draft and keeps participants`() {
        val sessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }
        val membershipId = membershipIdByEmail("member1@example.com")
        jdbcTemplate.update(
            """
            update session_participants
            set rsvp_status = 'GOING'
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            sessionId,
            membershipId,
        )
        val participantCount = participantCountForSession(sessionId)
        assertEquals(6, participantCount)
        assertEquals("GOING", participantRsvp(sessionId, membershipId))

        mockMvc
            .post("/api/host/sessions/$sessionId/return-to-draft") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("DRAFT") }
            }

        assertEquals("DRAFT", findSessionState(sessionId))
        assertEquals(participantCount, participantCountForSession(sessionId))
        assertEquals("GOING", participantRsvp(sessionId, membershipId))

        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("OPEN") }
            }

        assertEquals("OPEN", findSessionState(sessionId))
        assertEquals(participantCount, participantCountForSession(sessionId))
        assertEquals("GOING", participantRsvp(sessionId, membershipId))
    }

    @Test
    fun `host cannot return a closed session to draft`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")

        mockMvc
            .post("/api/host/sessions/$sessionId/return-to-draft") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RETURN_TO_DRAFT_NOT_ALLOWED") }
            }

        assertEquals("CLOSED", findSessionState(sessionId))
    }

    @Test
    fun `member cannot reopen`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("member5@example.com"))
                with(csrf())
            }.andExpect {
                status { isForbidden() }
            }

        assertEquals("CLOSED", findSessionState(sessionId))
    }

    @Test
    fun `reopen of missing session`() {
        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009778/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isNotFound() }
            }
    }

    @Test
    fun `reopen of missing session returns 404 even when another session is open`() {
        val openSessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$openSessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000009778/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("SESSION_NOT_FOUND") }
            }

        assertEquals("OPEN", findSessionState(openSessionId))
    }

    @Test
    fun `reopen of other club session returns 404 even when current club has open session`() {
        val openSessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$openSessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }
        createOutsideClubSession(state = "CLOSED")

        mockMvc
            .post("/api/host/sessions/00000000-0000-0000-0000-000000019777/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("SESSION_NOT_FOUND") }
            }

        assertEquals("OPEN", findSessionState(openSessionId))
        assertEquals("CLOSED", findOutsideClubSessionState())
    }

    @Test
    fun `reopen of published session is not allowed even when another session is open`() {
        val openSessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$openSessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        val publishedSessionId = createDraftSessionEight()
        updateSessionState(publishedSessionId, "CLOSED")
        updateSessionVisibility(publishedSessionId, "MEMBER")
        updateSessionState(publishedSessionId, "PUBLISHED")

        mockMvc
            .post("/api/host/sessions/$publishedSessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_REOPEN_NOT_ALLOWED") }
            }

        assertEquals("OPEN", findSessionState(openSessionId))
        assertEquals("PUBLISHED", findSessionState(publishedSessionId))
    }

    @Test
    fun `host reopen is idempotent for already open session`() {
        val sessionId = createDraftSessionSeven()
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
            }

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(sessionId) }
                jsonPath("$.state") { value("OPEN") }
            }

        assertEquals("OPEN", findSessionState(sessionId))
    }

    @Test
    fun `host unpublish is idempotent for already closed session`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")

        mockMvc
            .post("/api/host/sessions/$sessionId/unpublish") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(sessionId) }
                jsonPath("$.state") { value("CLOSED") }
            }

        assertEquals("CLOSED", findSessionState(sessionId))
    }

    @Test
    fun `host return to draft is idempotent for already draft session`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .post("/api/host/sessions/$sessionId/return-to-draft") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(sessionId) }
                jsonPath("$.state") { value("DRAFT") }
            }

        assertEquals("DRAFT", findSessionState(sessionId))
        assertThat(hostSessionLifecycleAuditRows(sessionId)).isEmpty()
    }

    @Test
    fun `body-less reopen records legacy unspecified audit`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("OPEN") }
            }

        val rows = hostSessionLifecycleAuditRows(sessionId)
        assertThat(rows).hasSize(1)
        assertEquals("REOPENED", rows.single()["action_type"])
        assertEquals("CLOSED", rows.single()["from_state"])
        assertEquals("OPEN", rows.single()["to_state"])
        assertEquals("LEGACY_UNSPECIFIED", rows.single()["reason_code"])
        assertNull(rows.single()["reason_note"])
        assertEquals(membershipIdByEmail("host@example.com"), rows.single()["actor_membership_id"])
        assertNotNull(rows.single()["request_id"])
    }

    @Test
    fun `reopen with reason records selectable reason and trimmed note`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "reasonCode": "MEETING_RESCHEDULED",
                      "reasonNote": "  moved online  "
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("OPEN") }
            }

        val rows = hostSessionLifecycleAuditRows(sessionId)
        assertThat(rows).hasSize(1)
        assertEquals("REOPENED", rows.single()["action_type"])
        assertEquals("MEETING_RESCHEDULED", rows.single()["reason_code"])
        assertEquals("moved online", rows.single()["reason_note"])
    }

    @Test
    fun `unknown reverse reason returns LIFECYCLE_REASON_INVALID`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"reasonCode":"NOT_A_REASON"}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("LIFECYCLE_REASON_INVALID") }
            }

        assertEquals("CLOSED", findSessionState(sessionId))
        assertThat(hostSessionLifecycleAuditRows(sessionId)).isEmpty()
    }

    @Test
    fun `internal reverse reason returns LIFECYCLE_REASON_INVALID`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"reasonCode":"LEGACY_UNSPECIFIED"}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("LIFECYCLE_REASON_INVALID") }
            }

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"reasonCode":"EMPTY_SESSION_DELETED"}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("LIFECYCLE_REASON_INVALID") }
            }

        assertEquals("CLOSED", findSessionState(sessionId))
        assertThat(hostSessionLifecycleAuditRows(sessionId)).isEmpty()
    }

    @Test
    fun `control character reverse note returns LIFECYCLE_REASON_INVALID`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = "{\"reasonCode\":\"ACCIDENTAL_TRANSITION\",\"reasonNote\":\"ok\\u0001nope\"}"
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("LIFECYCLE_REASON_INVALID") }
            }

        assertEquals("CLOSED", findSessionState(sessionId))
        assertThat(hostSessionLifecycleAuditRows(sessionId)).isEmpty()
    }

    @Test
    fun `oversized reverse note returns LIFECYCLE_REASON_INVALID`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")
        val note = "a".repeat(501)

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"reasonCode":"ACCIDENTAL_TRANSITION","reasonNote":"$note"}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("LIFECYCLE_REASON_INVALID") }
            }

        assertEquals("CLOSED", findSessionState(sessionId))
        assertThat(hostSessionLifecycleAuditRows(sessionId)).isEmpty()
    }

    @Test
    fun `rejected reopen does not add lifecycle audit`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")
        updateSessionVisibility(sessionId, "MEMBER")
        updateSessionState(sessionId, "PUBLISHED")

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"reasonCode":"ACCIDENTAL_TRANSITION"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_REOPEN_NOT_ALLOWED") }
            }

        assertEquals("PUBLISHED", findSessionState(sessionId))
        assertThat(hostSessionLifecycleAuditRows(sessionId)).isEmpty()
    }

    @Test
    fun `open records opened audit without reason`() {
        val sessionId = createDraftSessionSeven()

        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("OPEN") }
            }

        val rows = hostSessionLifecycleAuditRows(sessionId)
        assertThat(rows).hasSize(1)
        assertEquals("OPENED", rows.single()["action_type"])
        assertEquals("DRAFT", rows.single()["from_state"])
        assertEquals("OPEN", rows.single()["to_state"])
        assertNull(rows.single()["reason_code"])
        assertNull(rows.single()["reason_note"])
    }

    @Test
    fun `reopen stores request id on lifecycle audit`() {
        val sessionId = createDraftSessionSeven()
        updateSessionState(sessionId, "CLOSED")
        val requestId = "lifecycle-req1"

        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                with(user("host@example.com"))
                with(csrf())
                header(RequestIdFilter.HEADER, requestId)
                contentType = MediaType.APPLICATION_JSON
                content = """{"reasonCode":"OPERATIONAL_RECOVERY"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("OPEN") }
            }

        val rows = hostSessionLifecycleAuditRows(sessionId)
        assertThat(rows).hasSize(1)
        assertEquals("OPERATIONAL_RECOVERY", rows.single()["reason_code"])
        assertEquals(requestId, rows.single()["request_id"])
    }

    @Test
    fun `concurrent host opens serialize on the club and leave one open session`() {
        val firstSessionId = createDraftSessionSeven()
        val secondSessionId = createDraftSessionEight()

        val statuses =
            runConcurrently(workerCount = 2) {
                val sessionId = if (Thread.currentThread().name.endsWith("1")) firstSessionId else secondSessionId
                mockMvc
                    .post("/api/host/sessions/$sessionId/open") {
                        with(user("host@example.com"))
                        with(csrf())
                    }.andReturn()
                    .response.status
            }

        assertThat(statuses).containsExactlyInAnyOrder(200, 409)
        assertEquals(
            1,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from sessions
                where club_id = '00000000-0000-0000-0000-000000000001'
                  and state = 'OPEN'
                """.trimIndent(),
                Int::class.java,
            ),
        )
    }

    @Test
    fun `concurrent same club draft creates receive unique contiguous session numbers`() {
        withDelayedSessionInsert {
            val statuses =
                runConcurrently(workerCount = 2) {
                    val suffix = if (Thread.currentThread().name.endsWith("1")) "A" else "B"
                    mockMvc
                        .post("/api/host/sessions") {
                            with(user("host@example.com"))
                            with(csrf())
                            contentType = MediaType.APPLICATION_JSON
                            content =
                                """
                                {
                                  "title": "동시 생성 $suffix",
                                  "bookTitle": "동시 생성 책 $suffix",
                                  "bookAuthor": "테스트 저자",
                                  "date": "2026-07-15"
                                }
                                """.trimIndent()
                        }.andReturn()
                        .response.status
                }

            assertThat(statuses).containsExactlyInAnyOrder(201, 201)
            assertThat(generatedSessionNumbers()).containsExactly(7, 8)
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
                jsonPath("$.blockers.length()") { value(0) }
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

        expectBlockedDeletion(
            sessionId,
            "RECORD_REVISION_EXISTS" to 1,
            "NOTIFICATION_DECISION_EXISTS" to 1,
        )
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

        expectDeletionNotAllowed("00000000-0000-0000-0000-000000009777")

        jdbcTemplate.update(
            """
            update sessions
            set visibility = 'MEMBER', state = 'PUBLISHED'
            where id = '00000000-0000-0000-0000-000000009777'
            """.trimIndent(),
        )

        expectDeletionNotAllowed("00000000-0000-0000-0000-000000009777")
    }

    @Test
    fun `host can delete draft session without durable history`() {
        val sessionId = createSession(state = "DRAFT", visibility = "HOST_ONLY", accessScope = "HOST_ONLY")
        mockMvc
            .get("/api/host/sessions/$sessionId/deletion-preview") { withHost() }
            .andExpect {
                status { isOk() }
                jsonPath("$.state") { value("DRAFT") }
                jsonPath("$.canDelete") { value(true) }
                jsonPath("$.blockers.length()") { value(0) }
            }
        mockMvc
            .delete("/api/host/sessions/$sessionId") { withHost() }
            .andExpect {
                status { isOk() }
                jsonPath("$.deleted") { value(true) }
            }
    }

    @Test
    fun `host cannot delete draft session with record revision history`() {
        val sessionId = createDraftWithRevision()
        expectBlockedDeletion(sessionId, "RECORD_REVISION_EXISTS" to 1)
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
        updateSessionState("00000000-0000-0000-0000-000000009777", "CLOSED")

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
        assertEquals("MEMBER", hostOnlyPublication["visibility"])
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

    @Test
    fun `durable blocker revision history blocks open deletion`() {
        createSessionSeven()
        seedRecordRevision("00000000-0000-0000-0000-000000009777", "00000000-0000-0000-0000-000000009921")
        expectBlockedDeletion("00000000-0000-0000-0000-000000009777", "RECORD_REVISION_EXISTS" to 1)
    }

    @Test
    fun `durable blocker notification decision blocks open deletion`() {
        createSessionSeven()
        seedSkipNotificationDecision(
            sessionId = "00000000-0000-0000-0000-000000009777",
            previewId = "00000000-0000-0000-0000-000000009922",
            decisionId = "00000000-0000-0000-0000-000000009923",
        )
        expectBlockedDeletion("00000000-0000-0000-0000-000000009777", "NOTIFICATION_DECISION_EXISTS" to 1)
    }

    @Test
    fun `durable blocker manual dispatch blocks open deletion`() {
        createSessionSeven()
        val eventId = "00000000-0000-0000-0000-000000009924"
        seedSessionOutboxEvent("00000000-0000-0000-0000-000000009777", eventId, "manual-dispatch")
        seedManualDispatch("00000000-0000-0000-0000-000000009777", eventId, "00000000-0000-0000-0000-000000009925")
        expectBlockedDeletion(
            "00000000-0000-0000-0000-000000009777",
            "MANUAL_DISPATCH_EXISTS" to 1,
            "NOTIFICATION_EVENT_EXISTS" to 1,
        )
    }

    @Test
    fun `durable blocker session outbox event blocks open deletion`() {
        createSessionSeven()
        seedSessionOutboxEvent(
            "00000000-0000-0000-0000-000000009777",
            "00000000-0000-0000-0000-000000009926",
            "session-event",
        )
        expectBlockedDeletion("00000000-0000-0000-0000-000000009777", "NOTIFICATION_EVENT_EXISTS" to 1)
    }

    @Test
    fun `durable blocker notification delivery blocks open deletion`() {
        createSessionSeven()
        val eventId = "00000000-0000-0000-0000-000000009927"
        seedSessionOutboxEvent("00000000-0000-0000-0000-000000009777", eventId, "delivery")
        seedNotificationDelivery(eventId, "00000000-0000-0000-0000-000000009928", "delivery")
        expectBlockedDeletion(
            "00000000-0000-0000-0000-000000009777",
            "NOTIFICATION_EVENT_EXISTS" to 1,
            "NOTIFICATION_DELIVERY_EXISTS" to 1,
        )
    }

    @Test
    fun `durable blocker member notification blocks open deletion`() {
        createSessionSeven()
        val eventId = "00000000-0000-0000-0000-000000009929"
        val deliveryId = "00000000-0000-0000-0000-000000009930"
        seedSessionOutboxEvent("00000000-0000-0000-0000-000000009777", eventId, "member-notification")
        seedNotificationDelivery(eventId, deliveryId, "member-notification")
        seedMemberNotification(eventId, deliveryId, "00000000-0000-0000-0000-000000009931")
        expectBlockedDeletion(
            "00000000-0000-0000-0000-000000009777",
            "NOTIFICATION_EVENT_EXISTS" to 1,
            "NOTIFICATION_DELIVERY_EXISTS" to 1,
            "MEMBER_NOTIFICATION_EXISTS" to 1,
        )
    }

    @Test
    @Suppress("LongMethod")
    fun `combined durable blockers keep enum order and omit sensitive fields`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        createSessionSeven()
        seedSessionOwnedRows()
        seedRecordRevision(sessionId, "00000000-0000-0000-0000-000000009932")
        seedSkipNotificationDecision(
            sessionId = sessionId,
            previewId = "00000000-0000-0000-0000-000000009933",
            decisionId = "00000000-0000-0000-0000-000000009934",
        )
        val eventId = "00000000-0000-0000-0000-000000009935"
        seedSessionOutboxEvent(sessionId, eventId, "combined")
        seedManualDispatch(sessionId, eventId, "00000000-0000-0000-0000-000000009936")
        seedNotificationDelivery(eventId, "00000000-0000-0000-0000-000000009937", "combined")
        seedMemberNotification(eventId, "00000000-0000-0000-0000-000000009937", "00000000-0000-0000-0000-000000009938")

        expectBlockedDeletion(
            sessionId,
            "RECORD_REVISION_EXISTS" to 1,
            "NOTIFICATION_DECISION_EXISTS" to 1,
            "MANUAL_DISPATCH_EXISTS" to 1,
            "NOTIFICATION_EVENT_EXISTS" to 1,
            "NOTIFICATION_DELIVERY_EXISTS" to 1,
            "MEMBER_NOTIFICATION_EXISTS" to 1,
        )
        mockMvc
            .get("/api/host/sessions/$sessionId/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.counts.participants") { value(6) }
                jsonPath("$.counts.questions") { value(2) }
                jsonPath("$.payload") { doesNotExist() }
                jsonPath("$.passcode") { doesNotExist() }
                jsonPath("$.recipient") { doesNotExist() }
            }
    }

    @Test
    fun `payload text is not used as a deletion blocker`() {
        createSessionSeven()
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, kafka_key, dedupe_key
            ) values (
              ?, '00000000-0000-0000-0000-000000000001', 'NEXT_BOOK_PUBLISHED', 'CLUB',
              '00000000-0000-0000-0000-000000009777',
              json_object(
                'sessionId', '00000000-0000-0000-0000-000000009777',
                'passcode', 'synthetic-passcode',
                'recipient', 'member5@example.com'
              ),
              'deletion-payload-club',
              'deletion-payload-club'
            )
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009939",
        )

        mockMvc
            .get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.canDelete") { value(true) }
                jsonPath("$.blockers.length()") { value(0) }
            }
        mockMvc
            .delete("/api/host/sessions/00000000-0000-0000-0000-000000009777") {
                withHost()
            }.andExpect {
                status { isOk() }
                jsonPath("$.deleted") { value(true) }
            }
        assertEquals(0, countRows("sessions", "id = '00000000-0000-0000-0000-000000009777'"))
        assertEquals(
            1,
            countRows("notification_event_outbox", "id = '00000000-0000-0000-0000-000000009939'"),
        )
    }

    @Test
    fun `successful delete writes lifecycle audit and keeps AI provider job evidence`() {
        val sessionId = "00000000-0000-0000-0000-000000009777"
        createSessionSeven()
        jdbcTemplate.update(
            """
            insert into ai_generation_audit_log (
              job_id, session_id, club_id, host_user_id, kind, provider, model, status, created_at
            ) values (
              ?, ?, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
              'GENERATE', 'openai', 'gpt-safe', 'SUCCEEDED', utc_timestamp(6)
            )
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009940",
            sessionId,
        )

        mockMvc
            .delete("/api/host/sessions/$sessionId") { withHost() }
            .andExpect {
                status { isOk() }
                jsonPath("$.deleted") { value(true) }
            }

        assertEquals(0, countRows("sessions", "id = '$sessionId'"))
        assertEquals(
            1,
            countRows(
                "host_session_lifecycle_audit",
                "session_id = '$sessionId' and action_type = 'DELETED' and to_state is null " +
                    "and reason_code = 'EMPTY_SESSION_DELETED'",
            ),
        )
        assertEquals(1, countRows("ai_generation_audit_log", "session_id = '$sessionId'"))
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

    private fun hostMember() =
        CurrentMember(
            userId = java.util.UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = java.util.UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = java.util.UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubSlug = "readmates",
            email = "host@example.com",
            displayName = "김호스트",
            accountName = "김호스트",
            role = MembershipRole.HOST,
        )

    private fun MockHttpServletRequestDsl.withHost() {
        with(user("host@example.com"))
        with(csrf())
    }

    private fun expectBlockedDeletion(
        sessionId: String,
        vararg expected: Pair<String, Int>,
    ) {
        mockMvc
            .get("/api/host/sessions/$sessionId/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.canDelete") { value(false) }
                jsonPath("$.blockers.length()") { value(expected.size) }
                expected.forEachIndexed { index, (code, count) ->
                    jsonPath("$.blockers[$index].code") { value(code) }
                    jsonPath("$.blockers[$index].count") { value(count) }
                    jsonPath("$.blockers[$index].payload") { doesNotExist() }
                    jsonPath("$.blockers[$index].passcode") { doesNotExist() }
                    jsonPath("$.blockers[$index].recipient") { doesNotExist() }
                    jsonPath("$.blockers[$index].url") { doesNotExist() }
                }
            }
        mockMvc
            .delete("/api/host/sessions/$sessionId") { withHost() }
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_DELETE_BLOCKED") }
                jsonPath("$.blockers.length()") { value(expected.size) }
                jsonPath("$.payload") { doesNotExist() }
                jsonPath("$.passcode") { doesNotExist() }
                jsonPath("$.recipient") { doesNotExist() }
                expected.forEachIndexed { index, (code, count) ->
                    jsonPath("$.blockers[$index].code") { value(code) }
                    jsonPath("$.blockers[$index].count") { value(count) }
                }
            }
        assertEquals(1, countRows("sessions", "id = '$sessionId'"))
    }

    private fun expectDeletionNotAllowed(sessionId: String) {
        mockMvc
            .get("/api/host/sessions/$sessionId/deletion-preview") {
                with(user("host@example.com"))
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_DELETION_NOT_ALLOWED") }
                jsonPath("$.blockers") { doesNotExist() }
            }
        mockMvc
            .delete("/api/host/sessions/$sessionId") { withHost() }
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_DELETION_NOT_ALLOWED") }
                jsonPath("$.blockers") { doesNotExist() }
            }
        assertEquals(1, countRows("sessions", "id = '$sessionId'"))
    }

    private fun seedRecordRevision(
        sessionId: String,
        revisionId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into session_record_revisions (
              id, session_id, club_id, version, source, snapshot_json, snapshot_sha256,
              applied_by_membership_id
            ) values (?, ?, '00000000-0000-0000-0000-000000000001', 1, 'BASELINE', '{}', ?, ?)
            """.trimIndent(),
            revisionId,
            sessionId,
            "a".repeat(64),
            HOST_MEMBERSHIP_ID,
        )
    }

    private fun seedSkipNotificationDecision(
        sessionId: String,
        previewId: String,
        decisionId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into host_action_notification_previews (
              id, club_id, session_id, host_membership_id, action_type, event_type, request_hash,
              expected_live_revision, target_count, expected_in_app_count, expected_email_count,
              excluded_count, expires_at
            ) values (?, '00000000-0000-0000-0000-000000000001', ?, ?, 'RECORD_APPLY',
                      'SESSION_RECORD_UPDATED', ?, 0, 0, 0, 0, 0,
                      timestampadd(hour, 1, utc_timestamp(6)))
            """.trimIndent(),
            previewId,
            sessionId,
            HOST_MEMBERSHIP_ID,
            "d".repeat(64),
        )
        jdbcTemplate.update(
            """
            insert into host_action_notification_decisions (
              id, preview_id, club_id, session_id, host_membership_id, action_type, event_type,
              live_revision, decision, target_count, expected_in_app_count, expected_email_count,
              excluded_count
            ) values (?, ?, '00000000-0000-0000-0000-000000000001', ?, ?, 'RECORD_APPLY',
                      'SESSION_RECORD_UPDATED', 0, 'SKIP', 0, 0, 0, 0)
            """.trimIndent(),
            decisionId,
            previewId,
            sessionId,
            HOST_MEMBERSHIP_ID,
        )
        jdbcTemplate.update(
            """
            update host_action_notification_previews
            set consumed_at = utc_timestamp(6), consumed_decision_id = ?
            where id = ?
            """.trimIndent(),
            decisionId,
            previewId,
        )
    }

    private fun seedSessionOutboxEvent(
        sessionId: String,
        eventId: String,
        suffix: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, kafka_key, dedupe_key
            ) values (
              ?, '00000000-0000-0000-0000-000000000001', 'SESSION_REMINDER_DUE', 'SESSION', ?,
              json_object('source', 'deletion-blocker-fixture'), ?, ?
            )
            """.trimIndent(),
            eventId,
            sessionId,
            "deletion-blocker-$suffix",
            "deletion-blocker-$suffix",
        )
    }

    private fun seedManualDispatch(
        sessionId: String,
        eventId: String,
        dispatchId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatches (
              id, club_id, event_id, session_id, event_type, requested_by_membership_id,
              requested_channels, audience, target_count, expected_in_app_count, expected_email_count,
              resend, send_mode
            ) values (
              ?, '00000000-0000-0000-0000-000000000001', ?, ?, 'SESSION_REMINDER_DUE', ?,
              'IN_APP', 'ALL_ACTIVE_MEMBERS', 0, 0, 0, false, 'NOW'
            )
            """.trimIndent(),
            dispatchId,
            eventId,
            sessionId,
            HOST_MEMBERSHIP_ID,
        )
    }

    private fun seedNotificationDelivery(
        eventId: String,
        deliveryId: String,
        suffix: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key
            ) values (
              ?, ?, '00000000-0000-0000-0000-000000000001', ?, 'IN_APP', 'SENT', ?
            )
            """.trimIndent(),
            deliveryId,
            eventId,
            MEMBER5_MEMBERSHIP_ID,
            "deletion-blocker-delivery-$suffix",
        )
    }

    private fun seedMemberNotification(
        eventId: String,
        deliveryId: String,
        notificationId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into member_notifications (
              id, event_id, delivery_id, club_id, recipient_membership_id, event_type,
              title, body, deep_link_path
            ) values (
              ?, ?, ?, '00000000-0000-0000-0000-000000000001', ?, 'SESSION_REMINDER_DUE',
              'Synthetic deletion fixture', 'Synthetic deletion fixture body', '/app/sessions/current'
            )
            """.trimIndent(),
            notificationId,
            eventId,
            deliveryId,
            MEMBER5_MEMBERSHIP_ID,
        )
    }

    private fun createSession(
        state: String,
        visibility: String,
        accessScope: String,
    ): String {
        val sessionId = createDraftSession("7회차 · 테스트 책", "테스트 책", "2026-05-20")
        jdbcTemplate.update(
            """
            update sessions
            set state = ?, visibility = ?, access_scope = ?
            where id = ?
            """.trimIndent(),
            state,
            visibility,
            accessScope,
            sessionId,
        )
        return sessionId
    }

    private fun createDraftWithRevision(): String {
        val sessionId = createSession(state = "DRAFT", visibility = "HOST_ONLY", accessScope = "HOST_ONLY")
        jdbcTemplate.update(
            """
            insert into session_record_revisions (
              id, session_id, club_id, version, source, snapshot_json, snapshot_sha256,
              applied_by_membership_id
            ) values (?, ?, ?, 1, 'BASELINE', '{}', ?, ?)
            """.trimIndent(),
            "00000000-0000-0000-0000-000000009911",
            sessionId,
            "00000000-0000-0000-0000-000000000001",
            "a".repeat(64),
            "00000000-0000-0000-0000-000000000201",
        )
        return sessionId
    }

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

    private fun withDelayedSessionInsert(assertions: () -> Unit) {
        jdbcTemplate.execute(
            """
            create trigger host_session_draft_concurrency_delay
            before insert on sessions
            for each row set @readmates_test_sleep = sleep(1)
            """.trimIndent(),
        )
        try {
            assertions()
        } finally {
            jdbcTemplate.execute("drop trigger if exists host_session_draft_concurrency_delay")
        }
    }

    private fun generatedSessionNumbers(): List<Int> =
        jdbcTemplate
            .queryForList(
                """
                select number
                from sessions
                where club_id = '00000000-0000-0000-0000-000000000001'
                  and number >= 7
                order by number
                """.trimIndent(),
                Int::class.java,
            ).map(::requireNotNull)

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

    private fun membershipIdByEmail(email: String): String =
        jdbcTemplate.queryForObject(
            """
            select memberships.id
            from memberships
            join users on users.id = memberships.user_id
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and users.email = ?
            """.trimIndent(),
            String::class.java,
            email,
        ) ?: error("membership for $email did not exist")

    private fun participantCountForSession(id: String) = countRows("session_participants", "session_id = '$id'")

    private fun participantExists(
        sessionId: String,
        membershipId: String,
    ) = countRows(
        "session_participants",
        "session_id = '$sessionId' and membership_id = '$membershipId'",
    ) > 0

    private fun insertActiveMemberAfterClose(): String {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (
              '00000000-0000-0000-0000-000000019114',
              'later.active@example.com',
              '마감 이후 활성',
              '이후',
              'PASSWORD'
            )
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (
              '00000000-0000-0000-0000-000000019214',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000019114',
              'MEMBER',
              'ACTIVE',
              utc_timestamp(6),
              '이후',
              'mushroom-green-book'
            )
            """.trimIndent(),
        )
        return "00000000-0000-0000-0000-000000019214"
    }

    private fun participantRsvp(
        sessionId: String,
        membershipId: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select rsvp_status
            from session_participants
            where session_id = ?
              and membership_id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
            membershipId,
        ) ?: error("participant $membershipId in $sessionId did not exist")

    private fun findPublicationSummary(sessionId: String): String =
        jdbcTemplate.queryForObject(
            """
            select public_summary
            from public_session_publications
            where session_id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
        ) ?: error("publication $sessionId did not exist")

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
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values
              (
                '00000000-0000-0000-0000-000000019211',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000019111',
                'MEMBER',
                'SUSPENDED',
                utc_timestamp(6),
                '정지',
                'mushroom-green-book'
              ),
              (
                '00000000-0000-0000-0000-000000019212',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000019112',
                'MEMBER',
                'LEFT',
                utc_timestamp(6),
                '탈퇴',
                'toast-brown-book'
              ),
              (
                '00000000-0000-0000-0000-000000019213',
                '00000000-0000-0000-0000-000000000001',
                '00000000-0000-0000-0000-000000019113',
                'MEMBER',
                'INACTIVE',
                utc_timestamp(6),
                '비활성',
                'pudding-notebook'
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

    private fun insertHostScheduleSample(
        number: Int,
        date: String,
        startTime: String,
        endTime: String,
        locationLabel: String = "온라인",
        meetingUrl: String? = null,
        meetingPasscode: String? = null,
        accessScope: String = "GUEST_READABLE",
    ) {
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
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state,
              visibility,
              access_scope
            )
            values (
              ?,
              '00000000-0000-0000-0000-000000000001',
              ?,
              ?,
              '스케줄 기본값 책',
              '테스트 저자',
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              'DRAFT',
              'HOST_ONLY',
              ?
            )
            """.trimIndent(),
            "00000000-0000-0000-0000-${number.toString().padStart(12, '0')}",
            number,
            "${number}회차 · 스케줄 기본값 책",
            date,
            startTime,
            endTime,
            locationLabel,
            meetingUrl,
            meetingPasscode,
            "${LocalDate.parse(date).minusDays(1)} 14:59:00",
            accessScope,
        )
    }

    private fun seedScheduleDefaultsViewer() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (
              '00000000-0000-0000-0000-000000019116',
              'schedule.defaults.viewer@example.com',
              '스케줄 뷰어',
              '뷰어',
              'PASSWORD'
            )
            """.trimIndent(),
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (
              '00000000-0000-0000-0000-000000019216',
              '00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000019116',
              'MEMBER',
              'VIEWER',
              utc_timestamp(6),
              '뷰어',
              'cloud-green-book'
            )
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
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (
              '00000000-0000-0000-0000-000000019201',
              '00000000-0000-0000-0000-000000019001',
              '00000000-0000-0000-0000-000000019101',
              'HOST',
              'ACTIVE',
              utc_timestamp(6),
              '외부',
              'mushroom-green-book'
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

    private fun lifecycleDbEvidence(sessionId: String): LifecycleDbEvidence =
        LifecycleDbEvidence(
            session =
                jdbcTemplate.queryForMap(
                    """
                    select state, visibility, updated_at
                    from sessions
                    where id = ?
                    """.trimIndent(),
                    sessionId,
                ),
            participants =
                jdbcTemplate.queryForList(
                    """
                    select
                      id,
                      club_id,
                      session_id,
                      membership_id,
                      rsvp_status,
                      attendance_status,
                      participation_status,
                      created_at,
                      updated_at
                    from session_participants
                    where session_id = ?
                    order by id
                    """.trimIndent(),
                    sessionId,
                ),
            publications =
                jdbcTemplate.queryForList(
                    """
                    select visibility, is_public, published_at, updated_at
                    from public_session_publications
                    where session_id = ?
                    order by id
                    """.trimIndent(),
                    sessionId,
                ),
            outboxEvents = lifecycleOutboxEvents(sessionId),
            auditEntries = lifecycleAuditEntries(sessionId),
        )

    private fun lifecycleOutboxEvents(sessionId: String): List<Map<String, Any?>> =
        jdbcTemplate.queryForList(
            """
            select
              id,
              club_id,
              event_type,
              request_id,
              aggregate_type,
              aggregate_id,
              payload_json,
              status,
              kafka_topic,
              kafka_key,
              attempt_count,
              next_attempt_at,
              locked_at,
              published_at,
              last_error,
              dedupe_key,
              created_at,
              updated_at
            from notification_event_outbox
            where club_id = (select club_id from sessions where id = ?)
              and aggregate_id = ?
            order by id
            """.trimIndent(),
            sessionId,
            sessionId,
        )

    private fun hostSessionLifecycleAuditRows(sessionId: String): List<Map<String, Any?>> =
        jdbcTemplate.queryForList(
            """
            select
              action_type,
              from_state,
              to_state,
              reason_code,
              reason_note,
              request_id,
              actor_membership_id,
              session_id,
              club_id
            from host_session_lifecycle_audit
            where session_id = ?
            order by created_at, id
            """.trimIndent(),
            sessionId,
        )

    private fun lifecycleAuditEntries(sessionId: String): List<Map<String, Any?>> =
        jdbcTemplate.queryForList(
            """
            select
              id,
              club_id,
              session_id,
              actor_membership_id,
              action_type,
              changed_fields_json,
              request_id,
              created_at
            from host_session_change_audit
            where club_id = (select club_id from sessions where id = ?)
              and session_id = ?
            order by id
            """.trimIndent(),
            sessionId,
            sessionId,
        )

    private data class LifecycleDbEvidence(
        val session: Map<String, Any?>,
        val participants: List<Map<String, Any?>>,
        val publications: List<Map<String, Any?>>,
        val outboxEvents: List<Map<String, Any?>>,
        val auditEntries: List<Map<String, Any?>>,
    )

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

    private fun withBlankPublicationSummary(
        sessionId: String,
        assertions: () -> Unit,
    ) {
        jdbcTemplate.execute(
            "alter table public_session_publications " +
                "alter check public_session_publications_summary_check not enforced",
        )
        try {
            jdbcTemplate.update(
                "update public_session_publications set public_summary = '   ' where session_id = ?",
                sessionId,
            )
            assertions()
        } finally {
            jdbcTemplate.update(
                "update public_session_publications set public_summary = '기존 공개 요약' where session_id = ?",
                sessionId,
            )
            jdbcTemplate.execute(
                "alter table public_session_publications " +
                    "alter check public_session_publications_summary_check enforced",
            )
        }
    }

    private fun updateSessionVisibility(
        sessionId: String,
        visibility: String,
    ) {
        jdbcTemplate.update(
            """
            update sessions
            set visibility = ?,
                access_scope = case when ? in ('MEMBER', 'PUBLIC') then 'GUEST_READABLE' else 'HOST_ONLY' end
            where id = ?
              and club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            visibility,
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
            set state = 'PUBLISHED', visibility = 'PUBLIC', access_scope = 'GUEST_READABLE'
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

    @Suppress("MaxLineLength")
    private fun sessionAccessScope(sessionId: String): String = scalar("select access_scope from sessions where id = '$sessionId'")

    private fun sessionVisibility(sessionId: String) = scalar("select visibility from sessions where id = '$sessionId'")

    private fun publicationSiteVisibility(sessionId: String) =
        scalar(
            "select site_visibility from public_session_publications where session_id = '$sessionId'",
        )

    private fun publicationVisibility(sessionId: String) =
        scalar("select visibility from public_session_publications where session_id = '$sessionId'")

    private fun publicationIsPublic(sessionId: String) =
        scalar(
            "select cast(is_public as char) from public_session_publications where session_id = '$sessionId'",
        )

    private fun assertExposureColumns(
        sessionId: String,
        accessScope: String,
        expectedSessionVisibility: String,
        expectedSiteVisibility: String,
        expectedPublicationVisibility: String,
        isPublic: String,
    ) {
        assertEquals(accessScope, sessionAccessScope(sessionId))
        assertEquals(expectedSessionVisibility, sessionVisibility(sessionId))
        assertEquals(expectedSiteVisibility, publicationSiteVisibility(sessionId))
        assertEquals(expectedPublicationVisibility, publicationVisibility(sessionId))
        assertEquals(isPublic, publicationIsPublic(sessionId))
    }

    @Suppress("MaxLineLength")
    private fun scalar(sql: String): String = jdbcTemplate.queryForObject(sql, String::class.java) ?: error("scalar query returned null")

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

    private fun findOutsideClubSessionState(): String =
        jdbcTemplate.queryForObject(
            """
            select state
            from sessions
            where id = '00000000-0000-0000-0000-000000019777'
              and club_id = '00000000-0000-0000-0000-000000019001'
            """.trimIndent(),
            String::class.java,
        ) ?: error("outside club session did not exist")

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
