package com.readmates.sessionrecord.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.ConnectionCallback
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
                      "applyRequestId": "00000000-0000-0000-0000-000000000123",
                      "expectedDraftRevision": 1,
                      "expectedLiveRevision": 0,
                      "expectedDraftHash": "${"f".repeat(64)}",
                      "previewId": "00000000-0000-0000-0000-000000000456",
                      "notificationDecision": "SEND"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("SESSION_RECORD_INVALID_APPLY_CONTRACT") }
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
    @Suppress("LongMethod")
    fun `apply receipt replays exactly and returns 409 for changed contract or actor`() {
        val liveSnapshot =
            mockMvc
                .get("/api/host/sessions/$SESSION_ID/record-editor") {
                    with(user("host@example.com"))
                }.andExpect {
                    status { isOk() }
                }.andReturn()
                .response.contentAsString
                .let {
                    tools.jackson.databind
                        .ObjectMapper()
                        .readTree(it)
                        .get("liveSnapshot")
                        .toString()
                }
        mockMvc
            .patch("/api/host/sessions/$SESSION_ID/record-draft") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedDraftRevision":null,"snapshot":$liveSnapshot}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(1) }
            }
        val draftHash =
            mockMvc
                .post("/api/host/sessions/$SESSION_ID/record-apply-preview") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"expectedDraftRevision":1,"expectedLiveRevision":0}"""
                }.andExpect {
                    status { isOk() }
                }.andReturn()
                .response.contentAsString
                .let {
                    tools.jackson.databind
                        .ObjectMapper()
                        .readTree(it)
                        .get("expectedDraftHash")
                        .asText()
                }
        val applyRequestId = "00000000-0000-0000-0000-000000000124"
        val applyBody =
            """
            {
              "applyRequestId": "$applyRequestId",
              "expectedDraftRevision": 1,
              "expectedLiveRevision": 0,
              "expectedDraftHash": "$draftHash"
            }
            """.trimIndent()
        val firstRevisionId =
            mockMvc
                .post("/api/host/sessions/$SESSION_ID/record-apply") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = applyBody
                }.andExpect {
                    status { isOk() }
                }.andReturn()
                .response.contentAsString
                .let {
                    tools.jackson.databind
                        .ObjectMapper()
                        .readTree(it)
                        .get("revisionId")
                        .asText()
                }

        mockMvc
            .post("/api/host/sessions/$SESSION_ID/record-apply") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = applyBody
            }.andExpect {
                status { isOk() }
                jsonPath("$.revisionId") { value(firstRevisionId) }
            }
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/record-apply") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = applyBody.replace(draftHash, "f".repeat(64))
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_APPLY_REQUEST_ALREADY_USED") }
                jsonPath("$.status") { value(409) }
            }

        jdbcTemplate.update(
            """
            update memberships
            set role = 'HOST'
            where club_id = '00000000-0000-0000-0000-000000000001'
              and id = '00000000-0000-0000-0000-000000000202'
            """.trimIndent(),
        )
        try {
            mockMvc
                .post("/api/host/sessions/$SESSION_ID/record-apply") {
                    with(user("member1@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = applyBody
                }.andExpect {
                    status { isConflict() }
                    jsonPath("$.code") { value("SESSION_RECORD_APPLY_REQUEST_ALREADY_USED") }
                    jsonPath("$.status") { value(409) }
                }
        } finally {
            jdbcTemplate.update(
                """
                update memberships
                set role = 'MEMBER'
                where club_id = '00000000-0000-0000-0000-000000000001'
                  and id = '00000000-0000-0000-0000-000000000202'
                """.trimIndent(),
            )
        }
    }

    @Test
    @Suppress("LongMethod")
    fun `mid transaction revision constraint failure rolls back every record apply table`() {
        val liveSnapshot =
            mockMvc
                .get("/api/host/sessions/$SESSION_ID/record-editor") {
                    with(user("host@example.com"))
                }.andExpect {
                    status { isOk() }
                }.andReturn()
                .response.contentAsString
                .let {
                    tools.jackson.databind
                        .ObjectMapper()
                        .readTree(it)
                        .get("liveSnapshot")
                        .toString()
                }
        mockMvc
            .patch("/api/host/sessions/$SESSION_ID/record-draft") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedDraftRevision":null,"snapshot":$liveSnapshot}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(1) }
            }
        val draftHash =
            mockMvc
                .post("/api/host/sessions/$SESSION_ID/record-apply-preview") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"expectedDraftRevision":1,"expectedLiveRevision":0}"""
                }.andExpect {
                    status { isOk() }
                }.andReturn()
                .response.contentAsString
                .let {
                    tools.jackson.databind
                        .ObjectMapper()
                        .readTree(it)
                        .get("expectedDraftHash")
                        .asText()
                }

        makeDraftFailAppliedRevisionForeignKey()
        val before = recordApplyState()

        assertThatThrownBy {
            mockMvc
                .post("/api/host/sessions/$SESSION_ID/record-apply") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "applyRequestId": "00000000-0000-0000-0000-000000000125",
                          "expectedDraftRevision": 1,
                          "expectedLiveRevision": 0,
                          "expectedDraftHash": "$draftHash"
                        }
                        """.trimIndent()
                }.andReturn()
        }.hasRootCauseInstanceOf(java.sql.SQLIntegrityConstraintViolationException::class.java)
            .hasStackTraceContaining("session_record_revisions_restore_fk")

        assertThat(recordApplyState()).isEqualTo(before)
    }

    @Test
    fun `first next book publication returns composer without notification mutation`() {
        mockMvc
            .patch("/api/host/sessions/$VISIBILITY_SESSION_ID/visibility") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"MEMBER"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.session.visibility") { value("MEMBER") }
                jsonPath("$.composer.eventType") { value("NEXT_BOOK_PUBLISHED") }
                jsonPath("$.composer.contentRevision") { isString() }
            }

        val visibility =
            jdbcTemplate.queryForObject(
                "select visibility from sessions where id = ?",
                String::class.java,
                VISIBILITY_SESSION_ID,
            )
        assertThat(visibility).isEqualTo("MEMBER")
        assertThat(notificationEventCount()).isZero()
        assertThat(notificationDecisionCount()).isZero()
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

    @Test
    fun `repeated next book publication update never creates notification or legacy decision`() {
        repeat(2) {
            mockMvc
                .patch("/api/host/sessions/$VISIBILITY_SESSION_ID/visibility") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"visibility":"MEMBER"}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.session.visibility") { value("MEMBER") }
                }
        }

        assertThat(notificationDecisionCount()).isZero()
        assertThat(notificationEventCount()).isZero()
    }

    private fun notificationDecisionCount(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_action_notification_decisions where session_id = ?",
            Int::class.java,
            VISIBILITY_SESSION_ID,
        ) ?: 0

    private fun notificationEventCount(): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*) from notification_event_outbox
            where aggregate_id = ? and event_type = 'NEXT_BOOK_PUBLISHED'
            """.trimIndent(),
            Int::class.java,
            VISIBILITY_SESSION_ID,
        ) ?: 0

    private fun makeDraftFailAppliedRevisionForeignKey() {
        jdbcTemplate.execute(
            ConnectionCallback {
                it.createStatement().use { statement ->
                    statement.execute("set foreign_key_checks = 0")
                    try {
                        statement.executeUpdate(
                            """
                            update session_record_drafts
                            set source = 'RESTORED',
                                restored_from_revision_id = '00000000-0000-0000-0000-000000000998'
                            where session_id = '$SESSION_ID'
                            """.trimIndent(),
                        )
                    } finally {
                        statement.execute("set foreign_key_checks = 1")
                    }
                }
            },
        )
    }

    @Suppress("LongMethod")
    private fun recordApplyState() =
        RecordApplyState(
            liveSession =
                jdbcTemplate.queryForList(
                    """
                    select visibility, updated_at
                    from sessions
                    where id = ?
                    """.trimIndent(),
                    SESSION_ID,
                ),
            publication =
                jdbcTemplate.queryForList(
                    """
                    select public_summary, is_public, visibility, published_at, updated_at
                    from public_session_publications
                    where session_id = ?
                    """.trimIndent(),
                    SESSION_ID,
                ),
            highlights =
                jdbcTemplate.queryForList(
                    """
                    select membership_id, text, sort_order, created_at, updated_at
                    from highlights
                    where session_id = ?
                    order by sort_order, id
                    """.trimIndent(),
                    SESSION_ID,
                ),
            oneLineReviews =
                jdbcTemplate.queryForList(
                    """
                    select membership_id, text, visibility, created_at, updated_at
                    from one_line_reviews
                    where session_id = ?
                    order by membership_id, id
                    """.trimIndent(),
                    SESSION_ID,
                ),
            feedbackDocuments =
                jdbcTemplate.queryForList(
                    """
                    select version, source_text, document_title, file_name, content_type, file_size, created_at
                    from session_feedback_documents
                    where session_id = ?
                    order by version, id
                    """.trimIndent(),
                    SESSION_ID,
                ),
            revisions =
                jdbcTemplate.queryForList(
                    """
                    select version, source, restored_from_revision_id, snapshot_sha256, applied_by_membership_id
                    from session_record_revisions
                    where session_id = ?
                    order by version, id
                    """.trimIndent(),
                    SESSION_ID,
                ),
            draft =
                jdbcTemplate.queryForList(
                    """
                    select base_live_revision, draft_revision, source, restored_from_revision_id,
                           snapshot_json, snapshot_sha256, updated_by_membership_id, base_session_updated_at
                    from session_record_drafts
                    where session_id = ?
                    """.trimIndent(),
                    SESSION_ID,
                ),
            receipts =
                jdbcTemplate.queryForList(
                    """
                    select apply_request_id, expected_draft_revision, expected_live_revision,
                           draft_sha256, composer_event_type, revision_id
                    from session_record_apply_receipts
                    where session_id = ?
                    order by id
                    """.trimIndent(),
                    SESSION_ID,
                ),
            outbox =
                jdbcTemplate.queryForList(
                    """
                    select event_type, aggregate_type, aggregate_id, payload_json, status
                    from notification_event_outbox
                    where aggregate_id = ?
                    order by id
                    """.trimIndent(),
                    SESSION_ID,
                ),
        )

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
class HostSessionRecordDraftRebaseControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `host rebases a stale draft only onto the live metadata version they reviewed`() {
        val initialEditor = loadEditor(expectedStale = false)
        saveInitialDraft(initialEditor.get("liveSnapshot"))
        touchSession("호스트가 다시 확인할 책")
        val staleEditor = loadEditor(expectedStale = true)
        val reviewedSessionUpdatedAt = staleEditor.get("liveSessionUpdatedAt").asText()

        val rebasedDraft = rebaseDraft(reviewedSessionUpdatedAt)

        assertThat(rebasedDraft.get("snapshot")).isEqualTo(staleEditor.get("draft").get("snapshot"))
        assertThat(loadEditor(expectedStale = false).get("draft").get("draftRevision").asLong()).isEqualTo(2)

        touchSession("재확인 요청 중 다시 바뀐 책")
        rejectRebaseWithStaleLive(reviewedSessionUpdatedAt)
        assertThat(loadEditor(expectedStale = true).get("draft").get("draftRevision").asLong()).isEqualTo(2)
    }

    private fun loadEditor(expectedStale: Boolean): tools.jackson.databind.JsonNode =
        mockMvc
            .get("/api/host/sessions/$REBASE_SESSION_ID/record-editor") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.liveSessionUpdatedAt") { isString() }
                jsonPath("$.draftLiveBaseStale") { value(expectedStale) }
            }.andReturn()
            .response.contentAsString
            .let(tools.jackson.databind.ObjectMapper()::readTree)

    private fun saveInitialDraft(snapshot: tools.jackson.databind.JsonNode) {
        mockMvc
            .patch("/api/host/sessions/$REBASE_SESSION_ID/record-draft") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedDraftRevision":null,"snapshot":$snapshot}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(1) }
            }
    }

    private fun touchSession(bookTitle: String) {
        jdbcTemplate.update(
            """
            update sessions
            set book_title = ?,
                updated_at = timestampadd(microsecond, 1, updated_at)
            where id = ?
            """.trimIndent(),
            bookTitle,
            REBASE_SESSION_ID,
        )
    }

    private fun rebaseDraft(reviewedSessionUpdatedAt: String): tools.jackson.databind.JsonNode =
        mockMvc
            .post("/api/host/sessions/$REBASE_SESSION_ID/record-draft/rebase") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = rebaseJson(expectedDraftRevision = 1, reviewedSessionUpdatedAt)
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(2) }
            }.andReturn()
            .response.contentAsString
            .let(tools.jackson.databind.ObjectMapper()::readTree)

    private fun rejectRebaseWithStaleLive(reviewedSessionUpdatedAt: String) {
        mockMvc
            .post("/api/host/sessions/$REBASE_SESSION_ID/record-draft/rebase") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = rebaseJson(expectedDraftRevision = 2, reviewedSessionUpdatedAt)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_LIVE_STALE") }
            }
    }

    private fun rebaseJson(
        expectedDraftRevision: Long,
        reviewedSessionUpdatedAt: String,
    ) = """
        {
          "expectedDraftRevision": $expectedDraftRevision,
          "expectedLiveRevision": 0,
          "expectedSessionUpdatedAt": "$reviewedSessionUpdatedAt"
        }
        """.trimIndent()

    private companion object {
        const val REBASE_SESSION_ID = "00000000-0000-0000-0000-000000000301"
    }
}

private data class RecordApplyState(
    val liveSession: List<Map<String, Any?>>,
    val publication: List<Map<String, Any?>>,
    val highlights: List<Map<String, Any?>>,
    val oneLineReviews: List<Map<String, Any?>>,
    val feedbackDocuments: List<Map<String, Any?>>,
    val revisions: List<Map<String, Any?>>,
    val draft: List<Map<String, Any?>>,
    val receipts: List<Map<String, Any?>>,
    val outbox: List<Map<String, Any?>>,
)

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
    delete from session_record_apply_receipts
    where session_id = '00000000-0000-0000-0000-000000000301';
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
