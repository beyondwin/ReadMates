package com.readmates.sessionrecord.api

import com.readmates.session.application.port.out.HostMutationReceiptPort
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
import tools.jackson.databind.JsonNode
import java.util.UUID

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
@Suppress("LargeClass")
class HostSessionRecordControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val mutationReceipts: HostMutationReceiptPort,
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
    fun `record editor derives legacy member visibility from guest hidden exposure`() {
        jdbcTemplate.update(
            """
            update sessions
            set state = 'CLOSED', access_scope = 'GUEST_READABLE', visibility = 'PUBLIC'
            where id = ?
            """.trimIndent(),
            VISIBILITY_SESSION_ID,
        )

        mockMvc
            .get("/api/host/sessions/$VISIBILITY_SESSION_ID/record-editor") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.liveSnapshot.visibility") { value("MEMBER") }
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
    fun `committed record apply reconciles immutable receipt after response loss without replaying effects`() {
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
        val applyRequestId = "00000000-0000-0000-0000-000000000126"
        val idempotencyKey = "record-loss-aa"
        val applyBody =
            """
            {
              "idempotencyKey": "$idempotencyKey",
              "expected": {"draftRevision":1,"liveRevision":0},
              "command": {"applyRequestId":"$applyRequestId","expectedDraftHash":"$draftHash"}
            }
            """.trimIndent()

        val revisionId =
            mockMvc
                .post("/api/host/sessions/$SESSION_ID/record-apply") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = applyBody
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.liveRevision") { value(1) }
                }.andReturn()
                .response.contentAsString
                .let {
                    tools.jackson.databind
                        .ObjectMapper()
                        .readTree(it)
                        .get("revisionId")
                        .asText()
                }

        jdbcTemplate.update(
            """
            update sessions
            set session_revision = 2, exposure_revision = 3, participant_set_revision = 4
            where id = ?
            """.trimIndent(),
            SESSION_ID,
        )
        jdbcTemplate.update(
            "update session_publication_versions set publication_revision = 5 where session_id = ?",
            SESSION_ID,
        )

        mockMvc
            .get("/api/host/mutations/SESSION_RECORD_APPLY/$SESSION_ID/$idempotencyKey") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("COMMITTED") }
                jsonPath("$.receipt.operation") { value("SESSION_RECORD_APPLY") }
                jsonPath("$.receipt.resourceId") { value(SESSION_ID) }
                jsonPath("$.receipt.resultingVersions.sessionRevision") { value(0) }
                jsonPath("$.receipt.resultingVersions.exposureRevision") { value(0) }
                jsonPath("$.receipt.resultingVersions.participantSetRevision") { value(0) }
                jsonPath("$.receipt.resultingVersions.recordDraftRevision") { value(null) }
                jsonPath("$.receipt.resultingVersions.liveRecordRevision") { value(1) }
                jsonPath("$.receipt.resultingVersions.publicationRevision") { value(0) }
                jsonPath("$.current.versions.sessionRevision") { value(2) }
                jsonPath("$.current.versions.exposureRevision") { value(3) }
                jsonPath("$.current.versions.participantSetRevision") { value(4) }
                jsonPath("$.current.versions.liveRecordRevision") { value(1) }
                jsonPath("$.current.versions.publicationRevision") { value(5) }
            }

        val receiptId = UUID.fromString(applyRequestId)
        val receipt =
            mutationReceipts.find(
                UUID.fromString("00000000-0000-0000-0000-000000000001"),
                receiptId,
            )
        assertThat(receipt).isNotNull
        assertThat(receipt?.actorMembershipId)
            .isEqualTo(UUID.fromString("00000000-0000-0000-0000-000000000201"))
        assertThat(receipt?.operation).isEqualTo("SESSION_RECORD_APPLY")
        assertThat(receipt?.resourceId).isEqualTo(UUID.fromString(SESSION_ID))
        assertThat(receipt?.resultingVersions?.liveRecordRevision).isEqualTo(1)
        assertThat(
            mutationReceipts.find(
                UUID.fromString("00000000-0000-0000-0000-000000000002"),
                receiptId,
            ),
        ).isNull()

        mockMvc
            .get("/api/host/mutations/SESSION_CLOSE/$SESSION_ID/$idempotencyKey") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("NOT_EXECUTED") }
            }
        mockMvc
            .get("/api/host/mutations/SESSION_RECORD_APPLY/$VISIBILITY_SESSION_ID/$idempotencyKey") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("NOT_EXECUTED") }
            }

        mockMvc
            .get("/api/host/mutations/SESSION_RECORD_APPLY/$SESSION_ID/$idempotencyKey") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isForbidden() }
            }

        mockMvc
            .post("/api/host/sessions/$SESSION_ID/record-apply") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = applyBody
            }.andExpect {
                status { isOk() }
                jsonPath("$.revisionId") { value(revisionId) }
            }
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from session_record_revisions where session_id = ?",
                Int::class.java,
                SESSION_ID,
            ),
        ).isEqualTo(1)
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from session_record_apply_receipts where session_id = ?",
                Int::class.java,
                SESSION_ID,
            ),
        ).isEqualTo(1)
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from host_session_mutation_receipts where id = ? and resource_id = ?",
                Int::class.java,
                applyRequestId,
                SESSION_ID,
            ),
        ).isEqualTo(1)
    }

    @Test
    fun `record apply reconciliation distinguishes missing and in progress execution`() {
        val missingKey = "record-missing-aa"
        mockMvc
            .get("/api/host/mutations/SESSION_RECORD_APPLY/$SESSION_ID/$missingKey") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("NOT_EXECUTED") }
                jsonPath("$.current.sessionId") { value(SESSION_ID) }
            }

        val pendingKey = "record-pending-aa"
        jdbcTemplate.update(
            """
            insert into mutation_idempotency_keys (
              club_id, actor_membership_id, operation, resource_slot, idempotency_key,
              canonical_schema_version, digest_key_version, request_hmac, status, receipt_id, expires_at
            ) values (?, ?, 'SESSION_RECORD_APPLY', ?, ?, 1, 0, unhex(repeat('00', 32)),
                      'IN_PROGRESS', null, timestampadd(hour, 1, utc_timestamp(6)))
            """.trimIndent(),
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000201",
            SESSION_ID,
            pendingKey,
        )
        mockMvc
            .get("/api/host/mutations/SESSION_RECORD_APPLY/$SESSION_ID/$pendingKey") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("PENDING") }
                jsonPath("$.receipt") { doesNotExist() }
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
        jdbcTemplate.update(
            """
            insert into public_projection_current (
              session_id, club_id, publication_id_snapshot, generation, club_generation,
              live_record_revision, origin_readable, convergence_id, updated_at
            )
            select sessions.id, sessions.club_id, publications.id, 1,
                   coalesce(club_generation.generation, 0), 0, false, null, utc_timestamp(6)
            from sessions
            join public_session_publications publications on publications.session_id = sessions.id
            left join public_club_projection_generations club_generation on club_generation.club_id = sessions.club_id
            where sessions.id = ?
            on duplicate key update origin_readable = false
            """.trimIndent(),
            SESSION_ID,
        )
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
        assertThat(
            jdbcTemplate.queryForObject(
                "select origin_readable from public_projection_current where session_id = ?",
                Boolean::class.java,
                SESSION_ID,
            ),
        ).isFalse()

        mockMvc
            .post("/api/host/sessions/$SESSION_ID/record-apply") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "idempotencyKey": "key-apply-extra-0001",
                      "expected": {"draftRevision":1,"liveRevision":0,"sessionRevision":0},
                      "command": {"applyRequestId":"$applyRequestId","expectedDraftHash":"$draftHash"}
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("SESSION_RECORD_INVALID_APPLY_CONTRACT") }
            }
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/record-apply") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "idempotencyKey": "key-apply-dup-0001",
                      "expected": {"draftRevision":1,"liveRevision":0},
                      "command": {"applyRequestId":"$applyRequestId","expectedDraftHash":"$draftHash"}
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.revisionId") { value(firstRevisionId) }
            }
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/record-apply") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "idempotencyKey": "key-apply-dup-0001",
                      "expected": {"draftRevision":1,"liveRevision":0},
                      "command": {"applyRequestId":"$applyRequestId","expectedDraftHash":"$draftHash"}
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.revisionId") { value(firstRevisionId) }
            }
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/record-apply") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "idempotencyKey": "key-apply-dup-0001",
                      "expected": {"draftRevision":1,"liveRevision":0},
                      "command": {"applyRequestId":"00000000-0000-0000-0000-000000000999","expectedDraftHash":"$draftHash"}
                    }
                    """.trimIndent()
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
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
    fun `generic receipt failure rolls back every record apply table`() {
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

        installGenericReceiptFailure()
        val before = recordApplyState()

        try {
            assertThatThrownBy {
                mockMvc
                    .post("/api/host/sessions/$SESSION_ID/record-apply") {
                        with(user("host@example.com"))
                        with(csrf())
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                              "idempotencyKey": "record-failed-aa",
                              "expected": {"draftRevision":1,"liveRevision":0},
                              "command": {
                                "applyRequestId":"00000000-0000-0000-0000-000000000125",
                                "expectedDraftHash":"$draftHash"
                              }
                            }
                            """.trimIndent()
                    }.andReturn()
            }.hasRootCauseInstanceOf(java.sql.SQLException::class.java)
                .hasStackTraceContaining("record_receipt_fail")
        } finally {
            jdbcTemplate.execute("drop trigger if exists record_receipt_fail")
        }

        assertThat(recordApplyState()).isEqualTo(before)
        mockMvc
            .get("/api/host/mutations/SESSION_RECORD_APPLY/$SESSION_ID/record-failed-aa") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("NOT_EXECUTED") }
            }
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

    private fun installGenericReceiptFailure() {
        jdbcTemplate.execute("drop trigger if exists record_receipt_fail")
        jdbcTemplate.execute(
            """
            create trigger record_receipt_fail
            before insert on host_session_mutation_receipts
            for each row
            begin
              if new.resource_id = '$SESSION_ID' then
                signal sqlstate '45000' set message_text = 'record_receipt_fail';
              end if;
            end
            """.trimIndent(),
        )
    }

    @Suppress("LongMethod")
    private fun recordApplyState(): RecordApplyState =
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
            projectionCurrent =
                jdbcTemplate.queryForList(
                    """
                    select generation, club_generation, live_record_revision, origin_readable, convergence_id
                    from public_projection_current
                    where session_id = ?
                    """.trimIndent(),
                    SESSION_ID,
                ),
            clubGeneration =
                jdbcTemplate.queryForList(
                    """
                    select generation
                    from public_club_projection_generations
                    where club_id = '00000000-0000-0000-0000-000000000001'
                    """.trimIndent(),
                ),
            convergenceLinks =
                jdbcTemplate.queryForList(
                    """
                    select mutation_receipt_id, convergence_id, committed_generation,
                           committed_club_generation, live_record_revision, origin_readable
                    from public_mutation_convergence_links
                    where session_id_snapshot = ?
                    order by mutation_receipt_id
                    """.trimIndent(),
                    SESSION_ID,
                ),
            convergenceWork =
                jdbcTemplate.queryForList(
                    """
                    select convergence_id, next_attempt_no, lease_owner, lease_expires_at, available_at, retention_until
                    from public_convergence_work
                    where session_id_snapshot = ?
                    order by convergence_id
                    """.trimIndent(),
                    SESSION_ID,
                ),
            mutationKeys =
                jdbcTemplate.queryForList(
                    """
                    select operation, resource_slot, idempotency_key, status, receipt_id
                    from mutation_idempotency_keys
                    where resource_slot = ?
                    order by operation, idempotency_key
                    """.trimIndent(),
                    SESSION_ID,
                ),
            mutationReceipts =
                jdbcTemplate.queryForList(
                    """
                    select id, club_id, actor_membership_id, operation, resource_id,
                           session_revision, exposure_revision, participant_set_revision,
                           record_draft_revision, live_record_revision, publication_revision,
                           notification_decision, dispatch_receipt_id
                    from host_session_mutation_receipts
                    where resource_id = ?
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

        val rebasedDraft = rebaseDraft(staleEditor)

        assertThat(rebasedDraft.get("snapshot")).isEqualTo(staleEditor.get("draft").get("snapshot"))
        assertThat(loadEditor(expectedStale = false).get("draft").get("draftRevision").asLong()).isEqualTo(2)

        touchSession("재확인 요청 중 다시 바뀐 책")
        rejectRebaseWithStaleLive(staleEditor)
        assertThat(loadEditor(expectedStale = true).get("draft").get("draftRevision").asLong()).isEqualTo(2)
    }

    @Test
    fun `host v2 rebase request remains accepted and records the locked exact base`() {
        val initialEditor = loadEditor(expectedStale = false)
        saveInitialDraft(initialEditor.get("liveSnapshot"))
        touchSession("v2가 검토한 최신 책")
        val reviewed = loadEditor(expectedStale = true)

        mockMvc
            .post("/api/host/sessions/$REBASE_SESSION_ID/record-draft/rebase") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "expectedDraftRevision": 1,
                      "expectedLiveRevision": ${reviewed.get("liveRevision").asLong()},
                      "expectedSessionUpdatedAt": "${reviewed.get("liveSessionUpdatedAt").asString()}"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(REBASE_SESSION_ID) }
                jsonPath("$.baseLiveRevision") { value(reviewed.get("liveRevision").asLong()) }
                jsonPath("$.baseSessionRevision") { value(reviewed.get("liveSessionRevision").asLong()) }
                jsonPath("$.baseExposureRevision") { value(reviewed.get("liveExposureRevision").asLong()) }
                jsonPath("$.basePublicationRevision") { value(reviewed.get("livePublicationRevision").asLong()) }
                jsonPath("$.draftRevision") { value(2) }
                jsonPath("$.source") { value("MANUAL") }
                jsonPath("$.restoredFromRevisionId") { value(null) }
                jsonPath("$.snapshot") { exists() }
                jsonPath("$.updatedAt") { isString() }
            }

        loadEditor(expectedStale = false)
    }

    @Test
    @Suppress("LongMethod")
    fun `v2 rebase review timestamp rejects summary and site changes then records refreshed exact vectors`() {
        val reviewedSummary = loadEditor(PUBLICATION_REBASE_SESSION_ID, expectedStale = false)
        saveInitialDraft(PUBLICATION_REBASE_SESSION_ID, reviewedSummary.get("liveSnapshot"))
        val originalDraft = draftBaseFingerprint(PUBLICATION_REBASE_SESSION_ID)

        putPublication(
            sessionId = PUBLICATION_REBASE_SESSION_ID,
            reviewed = reviewedSummary,
            summary = "summary changed after v2 review",
            siteVisibility = "HIDDEN",
            key = "key-v2-summary-change-01",
        )

        rejectV2Rebase(PUBLICATION_REBASE_SESSION_ID, expectedDraftRevision = 1, reviewedSummary)
        assertThat(draftBaseFingerprint(PUBLICATION_REBASE_SESSION_ID)).isEqualTo(originalDraft)
        val refreshedSummary = loadEditor(PUBLICATION_REBASE_SESSION_ID, expectedStale = true)
        rebaseV2(
            PUBLICATION_REBASE_SESSION_ID,
            expectedDraftRevision = 1,
            refreshedSummary,
            expectedDraftRevisionAfter = 2,
        )
        assertDraftBaseMatches(PUBLICATION_REBASE_SESSION_ID, refreshedSummary)

        val reviewedSite = loadEditor(PUBLICATION_REBASE_SESSION_ID, expectedStale = false)
        val summaryRebasedDraft = draftBaseFingerprint(PUBLICATION_REBASE_SESSION_ID)
        putPublication(
            sessionId = PUBLICATION_REBASE_SESSION_ID,
            reviewed = reviewedSite,
            summary = "summary changed after v2 review",
            siteVisibility = "PUBLIC_RECORD",
            key = "key-v2-site-change-01",
        )

        rejectV2Rebase(PUBLICATION_REBASE_SESSION_ID, expectedDraftRevision = 2, reviewedSite)
        assertThat(draftBaseFingerprint(PUBLICATION_REBASE_SESSION_ID)).isEqualTo(summaryRebasedDraft)
        val refreshedSite = loadEditor(PUBLICATION_REBASE_SESSION_ID, expectedStale = true)
        rebaseV2(
            PUBLICATION_REBASE_SESSION_ID,
            expectedDraftRevision = 2,
            refreshedSite,
            expectedDraftRevisionAfter = 3,
        )
        assertDraftBaseMatches(PUBLICATION_REBASE_SESSION_ID, refreshedSite)
    }

    @Test
    fun `rebase rejects mixed legacy timestamp and exact revision bases`() {
        val initialEditor = loadEditor(expectedStale = false)
        saveInitialDraft(initialEditor.get("liveSnapshot"))

        mockMvc
            .post("/api/host/sessions/$REBASE_SESSION_ID/record-draft/rebase") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "expectedDraftRevision": 1,
                      "expectedSessionRevision": ${initialEditor.get("liveSessionRevision").asLong()},
                      "expectedLiveRevision": ${initialEditor.get("liveRevision").asLong()},
                      "expectedExposureRevision": ${initialEditor.get("liveExposureRevision").asLong()},
                      "expectedPublicationRevision": ${initialEditor.get("livePublicationRevision").asLong()},
                      "expectedSessionUpdatedAt": "${initialEditor.get("liveSessionUpdatedAt").asString()}"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("SESSION_RECORD_INVALID_REBASE_CONTRACT") }
            }
    }

    private fun loadEditor(expectedStale: Boolean): JsonNode = loadEditor(REBASE_SESSION_ID, expectedStale)

    private fun loadEditor(
        sessionId: String,
        expectedStale: Boolean,
    ): tools.jackson.databind.JsonNode =
        mockMvc
            .get("/api/host/sessions/$sessionId/record-editor") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.liveSessionRevision") { isNumber() }
                jsonPath("$.liveExposureRevision") { isNumber() }
                jsonPath("$.livePublicationRevision") { isNumber() }
                jsonPath("$.liveSessionUpdatedAt") { isString() }
                jsonPath("$.draftLiveBaseStale") { value(expectedStale) }
            }.andReturn()
            .response.contentAsString
            .let(tools.jackson.databind.ObjectMapper()::readTree)

    private fun saveInitialDraft(snapshot: tools.jackson.databind.JsonNode) {
        saveInitialDraft(REBASE_SESSION_ID, snapshot)
    }

    private fun saveInitialDraft(
        sessionId: String,
        snapshot: tools.jackson.databind.JsonNode,
    ) {
        mockMvc
            .patch("/api/host/sessions/$sessionId/record-draft") {
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
                session_revision = session_revision + 1,
                updated_at = timestampadd(microsecond, 1, updated_at)
            where id = ?
            """.trimIndent(),
            bookTitle,
            REBASE_SESSION_ID,
        )
    }

    private fun rebaseDraft(reviewed: tools.jackson.databind.JsonNode): tools.jackson.databind.JsonNode =
        mockMvc
            .post("/api/host/sessions/$REBASE_SESSION_ID/record-draft/rebase") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = rebaseJson(expectedDraftRevision = 1, reviewed)
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(2) }
            }.andReturn()
            .response.contentAsString
            .let(tools.jackson.databind.ObjectMapper()::readTree)

    private fun rejectRebaseWithStaleLive(reviewed: tools.jackson.databind.JsonNode) {
        mockMvc
            .post("/api/host/sessions/$REBASE_SESSION_ID/record-draft/rebase") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = rebaseJson(expectedDraftRevision = 2, reviewed)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_LIVE_STALE") }
            }
    }

    private fun putPublication(
        sessionId: String,
        reviewed: tools.jackson.databind.JsonNode,
        summary: String,
        siteVisibility: String,
        key: String,
    ) {
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "idempotencyKey": "$key",
                      "expected": {
                        "publicationRevision": ${reviewed.get("livePublicationRevision").asLong()}
                      },
                      "command": {
                        "publicSummary": "$summary",
                        "siteVisibility": "$siteVisibility"
                      }
                    }
                    """.trimIndent()
            }.andExpect { status { isOk() } }
    }

    private fun rejectV2Rebase(
        sessionId: String,
        expectedDraftRevision: Long,
        reviewed: tools.jackson.databind.JsonNode,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/record-draft/rebase") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = v2RebaseJson(expectedDraftRevision, reviewed)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_LIVE_STALE") }
            }
    }

    private fun rebaseV2(
        sessionId: String,
        expectedDraftRevision: Long,
        reviewed: tools.jackson.databind.JsonNode,
        expectedDraftRevisionAfter: Long,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/record-draft/rebase") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = v2RebaseJson(expectedDraftRevision, reviewed)
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(expectedDraftRevisionAfter) }
            }
    }

    private fun v2RebaseJson(
        expectedDraftRevision: Long,
        reviewed: tools.jackson.databind.JsonNode,
    ) = """
        {
          "expectedDraftRevision": $expectedDraftRevision,
          "expectedLiveRevision": ${reviewed.get("liveRevision").asLong()},
          "expectedSessionUpdatedAt": "${reviewed.get("liveSessionUpdatedAt").asString()}"
        }
        """.trimIndent()

    private fun draftBaseFingerprint(sessionId: String): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select base_live_revision, base_session_revision, base_exposure_revision,
                   base_publication_revision, base_vector_known, base_session_updated_at, draft_revision
            from session_record_drafts where session_id = ?
            """.trimIndent(),
            sessionId,
        )

    private fun assertDraftBaseMatches(
        sessionId: String,
        reviewed: tools.jackson.databind.JsonNode,
    ) {
        val base = draftBaseFingerprint(sessionId)
        assertThat(base["base_live_revision"]).isEqualTo(reviewed.get("liveRevision").asLong())
        assertThat(base["base_session_revision"]).isEqualTo(reviewed.get("liveSessionRevision").asLong())
        assertThat(base["base_exposure_revision"]).isEqualTo(reviewed.get("liveExposureRevision").asLong())
        assertThat(base["base_publication_revision"]).isEqualTo(reviewed.get("livePublicationRevision").asLong())
        assertThat(base["base_vector_known"]).isEqualTo(true)
    }

    private fun rebaseJson(
        expectedDraftRevision: Long,
        reviewed: tools.jackson.databind.JsonNode,
    ) = """
        {
          "expectedDraftRevision": $expectedDraftRevision,
          "expectedSessionRevision": ${reviewed.get("liveSessionRevision").asLong()},
          "expectedLiveRevision": ${reviewed.get("liveRevision").asLong()},
          "expectedExposureRevision": ${reviewed.get("liveExposureRevision").asLong()},
          "expectedPublicationRevision": ${reviewed.get("livePublicationRevision").asLong()}
        }
        """.trimIndent()

    private companion object {
        const val REBASE_SESSION_ID = "00000000-0000-0000-0000-000000000301"
        const val PUBLICATION_REBASE_SESSION_ID = "00000000-0000-0000-0000-000000099302"
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
    val projectionCurrent: List<Map<String, Any?>>,
    val clubGeneration: List<Map<String, Any?>>,
    val convergenceLinks: List<Map<String, Any?>>,
    val convergenceWork: List<Map<String, Any?>>,
    val mutationKeys: List<Map<String, Any?>>,
    val mutationReceipts: List<Map<String, Any?>>,
    val outbox: List<Map<String, Any?>>,
)

private const val CLEAN_RECORD_API_FIXTURES = """
    update public_projection_current
    set origin_readable = true
    where session_id = '00000000-0000-0000-0000-000000000301';
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
    where session_id in (
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000099302'
    );
    delete from session_record_revisions
    where session_id in (
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000099302'
    );
    delete from mutation_idempotency_keys
    where resource_slot in (
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000099302'
    );
    delete from host_session_mutation_receipts
    where resource_id in (
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000099302'
    );
    update sessions
    set session_revision = 0, exposure_revision = 0, participant_set_revision = 0
    where id = '00000000-0000-0000-0000-000000000301';
    update session_publication_versions
    set publication_revision = 0
    where session_id = '00000000-0000-0000-0000-000000000301';
    delete from public_session_publications
    where session_id = '00000000-0000-0000-0000-000000099302';
    delete from session_publication_versions
    where session_id = '00000000-0000-0000-0000-000000099302';
    delete from sessions
    where id in (
      '00000000-0000-0000-0000-000000099301',
      '00000000-0000-0000-0000-000000099302'
    );
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
    insert into sessions (
      id, club_id, number, title, book_title, book_author, session_date,
      start_time, end_time, location_label, question_deadline_at, state, visibility,
      access_scope
    ) values (
      '00000000-0000-0000-0000-000000099302',
      '00000000-0000-0000-0000-000000000001',
      100,
      'Publication rebase session',
      'Publication review book',
      'Example author',
      '2026-12-24',
      '19:00:00',
      '21:00:00',
      'Online',
      '2026-12-23 12:00:00',
      'PUBLISHED',
      'MEMBER',
      'GUEST_READABLE'
    );
    insert into session_publication_versions (session_id, publication_revision)
    values ('00000000-0000-0000-0000-000000099302', 0);
    insert into public_session_publications (
      id, club_id, session_id, public_summary, is_public, visibility, site_visibility
    ) values (
      '00000000-0000-0000-0000-000000099502',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000099302',
      'Publication review summary',
      false,
      'MEMBER',
      'HIDDEN'
    );
"""
