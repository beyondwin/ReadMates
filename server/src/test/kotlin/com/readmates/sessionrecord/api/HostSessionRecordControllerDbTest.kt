package com.readmates.sessionrecord.api

import com.readmates.notification.application.model.NotificationDecision
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.EnumSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
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

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.host-action-confirmation.required=true",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
@Sql(statements = [RESET_RECORD_API_FIXTURES], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEAN_RECORD_API_FIXTURES], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class HostSessionRecordControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `host capabilities and editor are host scoped and public safe`() {
        mockMvc
            .get("/api/host/capabilities") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionRecordDrafts") { value(true) }
                jsonPath("$.hostActionNotificationConfirmationRequired") { value(true) }
            }

        mockMvc
            .get("/api/host/sessions/$SESSION_ID/record-editor") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isForbidden() }
            }

        mockMvc
            .get("/api/host/sessions/00000000-0000-0000-0000-000000000999/record-editor") {
                with(user("host@example.com"))
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("SESSION_RECORD_NOT_FOUND") }
            }
    }

    @Test
    @Suppress("LongMethod")
    fun `draft cas apply confirmation history and restore fail closed`() {
        mockMvc
            .patch("/api/host/sessions/$SESSION_ID/record-draft") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = draftJson(expectedDraftRevision = null)
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(1) }
            }

        mockMvc
            .patch("/api/host/sessions/$SESSION_ID/record-draft") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = draftJson(expectedDraftRevision = 9)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_DRAFT_STALE") }
            }

        mockMvc
            .post("/api/host/sessions/$SESSION_ID/record-apply") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "expectedDraftRevision": 1,
                      "expectedLiveRevision": 0
                    }
                    """.trimIndent()
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("NOTIFICATION_CONFIRMATION_REQUIRED") }
            }

        mockMvc
            .get("/api/host/sessions/$SESSION_ID/history") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items") { isArray() }
                jsonPath("$.nextCursor") { doesNotExist() }
            }
        mockMvc
            .get("/api/host/sessions/$SESSION_ID/history") {
                with(user("host@example.com"))
                param("cursor", "malformed")
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
            .get("/api/host/sessions/$SESSION_ID/history") {
                with(user("host@example.com"))
                param("cursor", duplicateKeyCursor)
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INVALID_CURSOR") }
            }

        mockMvc
            .post(
                "/api/host/sessions/$SESSION_ID/revisions/" +
                    "00000000-0000-0000-0000-000000000999/restore-to-draft",
            ) {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedDraftRevision":1}"""
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("SESSION_RECORD_NOT_FOUND") }
            }

        mockMvc
            .delete("/api/host/sessions/$SESSION_ID/record-draft") {
                with(user("host@example.com"))
                with(csrf())
                param("expectedDraftRevision", "9")
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_DRAFT_STALE") }
            }
    }

    @Test
    fun `first next book publication requires a preview and explicit decision`() {
        mockMvc
            .patch("/api/host/sessions/$VISIBILITY_SESSION_ID/visibility") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"MEMBER"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("NOTIFICATION_CONFIRMATION_REQUIRED") }
            }

        val visibility =
            jdbcTemplate.queryForObject(
                "select visibility from sessions where id = ?",
                String::class.java,
                VISIBILITY_SESSION_ID,
            )
        assertThat(visibility).isEqualTo("HOST_ONLY")
    }

    @Test
    fun `required rollout rejects historical legacy publication and visibility writes`() {
        jdbcTemplate.update(
            "update sessions set state = 'OPEN' where id = ?",
            VISIBILITY_SESSION_ID,
        )
        jdbcTemplate.update(
            "update sessions set state = 'CLOSED', visibility = 'MEMBER' where id = ?",
            VISIBILITY_SESSION_ID,
        )

        mockMvc
            .put("/api/host/sessions/$VISIBILITY_SESSION_ID/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"publicSummary":"legacy","visibility":"PUBLIC"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_STAGING_REQUIRED") }
            }
        mockMvc
            .patch("/api/host/sessions/$VISIBILITY_SESSION_ID/visibility") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"PUBLIC"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_STAGING_REQUIRED") }
            }
    }

    @ParameterizedTest
    @EnumSource(NotificationDecision::class)
    fun `confirmed next book publication records send or skip exactly once`(decision: NotificationDecision) {
        val previewResponse =
            mockMvc
                .post("/api/host/sessions/$VISIBILITY_SESSION_ID/visibility-preview") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"visibility":"MEMBER"}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.previewId") { isString() }
                }.andReturn()
                .response
                .contentAsString
        val previewId =
            """"previewId"\s*:\s*"([^"]+)""""
                .toRegex()
                .find(previewResponse)
                ?.groupValues
                ?.get(1)
                ?: error("visibility preview response did not include previewId")
        val request =
            """
            {
              "visibility": "MEMBER",
              "previewId": "$previewId",
              "notificationDecision": "$decision"
            }
            """.trimIndent()

        repeat(2) {
            mockMvc
                .patch("/api/host/sessions/$VISIBILITY_SESSION_ID/visibility") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = request
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.visibility") { value("MEMBER") }
                }
        }

        val decisionCount =
            jdbcTemplate.queryForObject(
                "select count(*) from host_action_notification_decisions where preview_id = ?",
                Int::class.java,
                previewId,
            )
        val eventCount =
            jdbcTemplate.queryForObject(
                """
                select count(*) from notification_event_outbox
                where aggregate_id = ? and event_type = 'NEXT_BOOK_PUBLISHED'
                """.trimIndent(),
                Int::class.java,
                VISIBILITY_SESSION_ID,
            )
        assertThat(decisionCount).isEqualTo(1)
        assertThat(eventCount)
            .isEqualTo(if (decision == NotificationDecision.SEND) 1 else 0)
    }

    private fun draftJson(expectedDraftRevision: Long?): String {
        val revision = expectedDraftRevision?.toString() ?: "null"
        return """
            {
              "expectedDraftRevision": $revision,
              "snapshot": {
                "visibility": "HOST_ONLY",
                "publicationSummary": "staged summary",
                "highlights": [],
                "oneLineReviews": [],
                "feedbackDocument": {
                  "fileName": "feedback.md",
                  "title": "Feedback",
                  "markdown": ""
                }
              }
            }
            """.trimIndent()
    }

    private companion object {
        const val SESSION_ID = "00000000-0000-0000-0000-000000000301"
        const val VISIBILITY_SESSION_ID = "00000000-0000-0000-0000-000000099301"
    }
}

private const val CLEAN_RECORD_API_FIXTURES = """
    update host_action_notification_previews
    set consumed_at = null, consumed_decision_id = null
    where session_id in (
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000099301'
    );
    delete from host_action_notification_decisions
    where session_id in (
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000099301'
    );
    delete from host_action_notification_previews
    where session_id in (
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000099301'
    );
    delete from notification_event_outbox
    where aggregate_id = '00000000-0000-0000-0000-000000099301';
    delete from session_record_drafts
    where session_id = '00000000-0000-0000-0000-000000000301';
    delete from session_record_revisions
    where session_id = '00000000-0000-0000-0000-000000000301';
    delete from sessions
    where id = '00000000-0000-0000-0000-000000099301';
"""

private const val RESET_RECORD_API_FIXTURES = """
    $CLEAN_RECORD_API_FIXTURES
    insert into sessions (
      id, club_id, number, title, book_title, book_author, session_date,
      start_time, end_time, location_label, question_deadline_at, state, visibility
    ) values (
      '00000000-0000-0000-0000-000000099301',
      '00000000-0000-0000-0000-000000000001',
      99,
      '99th session',
      'Next book',
      'Example author',
      '2026-12-23',
      '19:00:00',
      '21:00:00',
      'Online',
      '2026-12-22 12:00:00',
      'DRAFT',
      'HOST_ONLY'
    );
"""
