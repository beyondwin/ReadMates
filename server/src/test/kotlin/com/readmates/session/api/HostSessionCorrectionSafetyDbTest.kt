package com.readmates.session.api

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_EXPOSURE_PUBLICATION_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_EXPOSURE_PUBLICATION_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
@Suppress("LargeClass")
class HostSessionCorrectionSafetyDbTest(
    @Autowired mockMvc: MockMvc,
    @Autowired jdbcTemplate: JdbcTemplate,
) : HostSessionAtomicityDbTestSupport(mockMvc, jdbcTemplate) {
    @Test
    fun `correction preview and confirm project hidden record to draft public audience`() {
        val sessionId = publishedSessionWithInitialRecord()
        setPublicPlacement(sessionId, "HIDDEN", "key-hide-before-correction-01")
        saveRecordDraft(sessionId, "public target", "PUBLIC")
        val current = versions(sessionId)

        assertCorrectionPreview(sessionId, current, "GUEST_READABLE", "PUBLIC_RECORD", "PUBLIC")
        publishCorrection(sessionId, "key-hidden-to-public-01", current)

        assertExposure(sessionId, "GUEST_READABLE", "PUBLIC", "PUBLIC_RECORD", "PUBLIC", true)
    }

    @Test
    fun `correction preview and confirm project public record to draft host only audience`() {
        val sessionId = publishedSessionWithInitialRecord()
        insertNotesQuestion(sessionId)
        assertNotesProjection(sessionId, visible = true)
        saveRecordDraft(sessionId, "host target", "HOST_ONLY")
        val current = versions(sessionId)

        assertCorrectionPreview(sessionId, current, "HOST_ONLY", "HIDDEN", "HOST_ONLY")
        publishCorrection(sessionId, "key-public-to-host-01", current)

        assertExposure(sessionId, "HOST_ONLY", "MEMBER", "HIDDEN", "MEMBER", false)
        mockMvc
            .get("/api/archive/sessions/$sessionId") { with(user("member1@example.com")) }
            .andExpect { status { isNotFound() } }
        mockMvc
            .get("/api/public/clubs/reading-sai/browse/archive/$sessionId")
            .andExpect { status { isNotFound() } }
        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/$sessionId")
            .andExpect { status { isNotFound() } }
        assertNotesProjection(sessionId, visible = false)

        val noOpVersions = versions(sessionId)
        val updatedAtBefore = sessionUpdatedAt(sessionId)
        val epochBefore = recordEpoch()
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-host-only-repeat-publication-01",
                        """
                        {"exposureRevision":${noOpVersions.exposure},
                         "publicationRevision":${noOpVersions.publication}}
                        """.trimIndent(),
                        """
                        {"publicSummary":"host target summary","accessScope":"HOST_ONLY",
                         "siteVisibility":"HIDDEN"}
                        """.trimIndent(),
                    )
            }.andExpect { status { isOk() } }

        assertThat(versions(sessionId)).isEqualTo(noOpVersions)
        assertThat(sessionUpdatedAt(sessionId)).isEqualTo(updatedAtBefore)
        assertThat(recordEpoch()).isEqualTo(epochBefore)
    }

    @Test
    fun `correction idempotency binds the exact five field vector`() {
        val sessionId = publishedSessionWithInitialRecord()
        saveRecordDraft(sessionId, "idempotent", "PUBLIC")
        val first = versions(sessionId)

        publishCorrection(sessionId, "key-correction-vector-01", first)
        val liveAfterFirst = liveRecordRevision(sessionId)
        val historyAfterFirst = revisionCount(sessionId)
        val receiptsAfterFirst = applyReceiptCount(sessionId)
        val epochAfterFirst = recordEpoch()
        publishCorrection(sessionId, "key-correction-vector-01", first)

        assertThat(liveRecordRevision(sessionId)).isEqualTo(liveAfterFirst)
        assertThat(revisionCount(sessionId)).isEqualTo(historyAfterFirst)
        assertThat(applyReceiptCount(sessionId)).isEqualTo(receiptsAfterFirst)
        assertThat(recordEpoch()).isEqualTo(epochAfterFirst)
        assertCorrectionReceiptBridge(sessionId, "key-correction-vector-01")

        saveRecordDraft(sessionId, "changed vector", "PUBLIC")
        val changed = versions(sessionId)
        val epochBeforeConflict = recordEpoch()
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-correction-vector-01", correctionVector(changed), "{}")
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }

        assertThat(liveRecordRevision(sessionId)).isEqualTo(liveAfterFirst)
        assertThat(recordDraftRevision(sessionId)).isEqualTo(1)
        assertThat(revisionCount(sessionId)).isEqualTo(historyAfterFirst)
        assertThat(applyReceiptCount(sessionId)).isEqualTo(receiptsAfterFirst)
        assertThat(recordEpoch()).isEqualTo(epochBeforeConflict)
    }

    @Test
    fun `correction preview rejects stale draft metadata then rebase makes preview and confirm exact`() {
        val sessionId = publishedSessionWithInitialRecord()
        saveRecordDraft(sessionId, "stale then rebase", "PUBLIC")
        setPublicPlacement(sessionId, "HIDDEN", "key-stale-preview-placement-01")
        val liveBefore = liveRecordRevision(sessionId)
        val revisionsBefore = revisionCount(sessionId)
        val receiptsBefore = applyReceiptCount(sessionId)
        val epochBefore = recordEpoch()

        mockMvc
            .get("/api/host/sessions/$sessionId/correction-publish-preview") { withHost() }
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_LIVE_STALE") }
            }

        assertThat(liveRecordRevision(sessionId)).isEqualTo(liveBefore)
        assertThat(revisionCount(sessionId)).isEqualTo(revisionsBefore)
        assertThat(applyReceiptCount(sessionId)).isEqualTo(receiptsBefore)
        assertThat(recordEpoch()).isEqualTo(epochBefore)

        val editor = loadRecordEditor(sessionId, stale = true)
        rebaseDraft(sessionId, editor)
        val rebased = versions(sessionId)
        assertThat(rebased.draft).isEqualTo(2)
        assertCorrectionPreview(sessionId, rebased, "GUEST_READABLE", "PUBLIC_RECORD", "PUBLIC")

        publishCorrection(sessionId, "key-stale-preview-confirm-01", rebased)
        assertThat(liveRecordRevision(sessionId)).isEqualTo(liveBefore + 1)
        assertThat(applyReceiptCount(sessionId)).isEqualTo(receiptsBefore + 1)
    }

    @Test
    fun `summary access and basic revision changes each stale the exact correction draft base`() {
        val summarySession = publishedSessionWithInitialRecord()
        saveRecordDraft(summarySession, "summary stale", "PUBLIC")
        setPublicationSummary(summarySession, "summary changed after draft")
        assertPreviewStaleWithoutWrites(summarySession)

        val accessSession = publishedSessionWithInitialRecord()
        setPublicPlacement(accessSession, "HIDDEN", "key-access-base-hidden-01")
        saveRecordDraft(accessSession, "access stale", "PUBLIC")
        mockMvc
            .patch("/api/host/sessions/$accessSession/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-stale-preview-access-01",
                        """{"exposureRevision":${exposureRevision(accessSession)}}""",
                        """{"accessScope":"HOST_ONLY"}""",
                    )
            }.andExpect { status { isOk() } }
        assertPreviewStaleWithoutWrites(accessSession)

        val basicSession = publishedSessionWithInitialRecord()
        saveRecordDraft(basicSession, "basic stale", "PUBLIC")
        mockMvc
            .patch("/api/host/sessions/$basicSession") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-stale-preview-basic-01",
                        """{"sessionRevision":${sessionRevision(basicSession)}}""",
                        sessionCommand("basic changed after draft"),
                    )
            }.andExpect { status { isOk() } }
        assertPreviewStaleWithoutWrites(basicSession)
    }

    @Test
    fun `participant-only timestamp change leaves exact correction preview and confirm eligible`() {
        val sessionId = publishedSessionWithInitialRecord()
        saveRecordDraft(sessionId, "participant safe", "PUBLIC")
        jdbcTemplate.update(
            """
            update sessions
            set participant_set_revision = participant_set_revision + 1,
                updated_at = timestampadd(microsecond, 1, updated_at)
            where id = ?
            """.trimIndent(),
            sessionId,
        )
        val current = versions(sessionId)

        assertCorrectionPreview(sessionId, current, "GUEST_READABLE", "PUBLIC_RECORD", "PUBLIC")
        publishCorrection(sessionId, "key-participant-safe-confirm-01", current)

        assertThat(liveRecordRevision(sessionId)).isEqualTo(current.live + 1)
    }

    private fun publishedSessionWithInitialRecord(): String {
        val sessionId = closedGuestReadableSession()
        saveRecordDraft(sessionId, "initial", "MEMBER")
        applyRecord(sessionId)
        placePublicRecord(sessionId)
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-initial-publish-01", publishVectorJson(sessionId), "{}")
            }.andExpect { status { isOk() } }
        return sessionId
    }

    private fun closedGuestReadableSession(): String {
        val sessionId = createDraft("correction review", "key-create-${UUID.randomUUID()}").first
        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-access-${UUID.randomUUID()}",
                        """{"exposureRevision":0}""",
                        """{"accessScope":"GUEST_READABLE"}""",
                    )
            }.andExpect { status { isOk() } }
        open(sessionId, sessionRevision(sessionId), "key-open-${UUID.randomUUID()}")
        close(
            sessionId,
            sessionRevision(sessionId),
            participantSetRevision(sessionId),
            attendanceSnapshotId(sessionId),
            "key-close-${UUID.randomUUID()}",
        )
        return sessionId
    }

    private fun saveRecordDraft(
        sessionId: String,
        label: String,
        visibility: String,
    ) {
        val snapshot =
            jsonMapper.createObjectNode().apply {
                put("visibility", visibility)
                put("publicationSummary", "$label summary")
                putArray("highlights").addObject().apply {
                    put("membershipId", HOST_MEMBERSHIP_ID)
                    put("authorDisplayName", hostDisplayName())
                    put("text", "$label highlight")
                }
                putArray("oneLineReviews").addObject().apply {
                    put("membershipId", HOST_MEMBERSHIP_ID)
                    put("authorDisplayName", hostDisplayName())
                    put("text", "$label one line")
                }
                putObject("feedbackDocument").apply {
                    put("fileName", "$label-feedback.md")
                    put("title", "$label feedback")
                    put("markdown", feedbackMarkdown(label))
                }
            }
        val body =
            jsonMapper.createObjectNode().apply {
                putNull("expectedDraftRevision")
                set("snapshot", snapshot)
            }
        mockMvc
            .patch("/api/host/sessions/$sessionId/record-draft") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = body.toString()
            }.andExpect { status { isOk() } }
    }

    private fun applyRecord(sessionId: String) {
        val hash =
            mockMvc
                .post("/api/host/sessions/$sessionId/record-apply-preview") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"expectedDraftRevision":1,"expectedLiveRevision":0}"""
                }.andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
                .let(jsonMapper::readTree)
                .get("expectedDraftHash")
                .asString()
        mockMvc
            .post("/api/host/sessions/$sessionId/record-apply") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-initial-apply-01",
                        """{"draftRevision":1,"liveRevision":0}""",
                        """{"applyRequestId":"00000000-0000-4000-8000-000000000701","expectedDraftHash":"$hash"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun placePublicRecord(sessionId: String) {
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-initial-placement-01",
                        """{"publicationRevision":${publicationRevision(sessionId)}}""",
                        """{"publicSummary":"initial summary","siteVisibility":"PUBLIC_RECORD"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun setPublicPlacement(
        sessionId: String,
        siteVisibility: String,
        key: String,
    ) {
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        key,
                        """{"publicationRevision":${publicationRevision(sessionId)}}""",
                        """{"publicSummary":"initial summary","siteVisibility":"$siteVisibility"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun setPublicationSummary(
        sessionId: String,
        summary: String,
    ) {
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-stale-preview-summary-${UUID.randomUUID()}",
                        """{"publicationRevision":${publicationRevision(sessionId)}}""",
                        """{"publicSummary":"$summary","siteVisibility":"PUBLIC_RECORD"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun assertPreviewStaleWithoutWrites(sessionId: String) {
        val before =
            listOf(
                liveRecordRevision(sessionId),
                revisionCount(sessionId).toLong(),
                applyReceiptCount(sessionId).toLong(),
                recordEpoch(),
            )
        mockMvc
            .get("/api/host/sessions/$sessionId/correction-publish-preview") { withHost() }
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_RECORD_LIVE_STALE") }
            }
        assertThat(
            listOf(
                liveRecordRevision(sessionId),
                revisionCount(sessionId).toLong(),
                applyReceiptCount(sessionId).toLong(),
                recordEpoch(),
            ),
        ).isEqualTo(before)
    }

    private fun loadRecordEditor(
        sessionId: String,
        stale: Boolean,
    ) = mockMvc
        .get("/api/host/sessions/$sessionId/record-editor") { withHost() }
        .andExpect {
            status { isOk() }
            jsonPath("$.draftLiveBaseStale") { value(stale) }
        }.andReturn()
        .response
        .contentAsString
        .let(jsonMapper::readTree)

    private fun rebaseDraft(
        sessionId: String,
        editor: tools.jackson.databind.JsonNode,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/record-draft/rebase") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "expectedDraftRevision": 1,
                      "expectedSessionRevision": ${editor.get("liveSessionRevision").asLong()},
                      "expectedLiveRevision": ${editor.get("liveRevision").asLong()},
                      "expectedExposureRevision": ${editor.get("liveExposureRevision").asLong()},
                      "expectedPublicationRevision": ${editor.get("livePublicationRevision").asLong()}
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(2) }
            }
    }

    private fun publishCorrection(
        sessionId: String,
        key: String,
        versions: Versions,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope(key, correctionVector(versions), "{}")
            }.andExpect { status { isOk() } }
    }

    private fun correctionVector(versions: Versions): String {
        val draft = requireNotNull(versions.draft)
        return """
            {"sessionRevision":${versions.session},"recordDraftRevision":$draft,
            "liveRecordRevision":${versions.live},"exposureRevision":${versions.exposure},
            "publicationRevision":${versions.publication}}
            """.trimIndent().replace("\n", "")
    }

    private fun assertCorrectionPreview(
        sessionId: String,
        versions: Versions,
        accessScope: String,
        siteVisibility: String,
        visibility: String,
    ) {
        mockMvc
            .get("/api/host/sessions/$sessionId/correction-publish-preview") { withHost() }
            .andExpect {
                status { isOk() }
                jsonPath("$.versions.recordDraftRevision") { value(versions.draft) }
                jsonPath("$.versions.liveRecordRevision") { value(versions.live) }
                jsonPath("$.accessScope") { value(accessScope) }
                jsonPath("$.siteVisibility") { value(siteVisibility) }
                jsonPath("$.visibility") { value(visibility) }
            }
    }

    private fun assertExposure(
        sessionId: String,
        accessScope: String,
        sessionVisibility: String,
        siteVisibility: String,
        publicationVisibility: String,
        isPublic: Boolean,
    ) {
        val row =
            jdbcTemplate.queryForMap(
                """
                select s.access_scope, s.visibility session_visibility, p.site_visibility,
                       p.visibility publication_visibility, p.is_public
                from sessions s join public_session_publications p on p.session_id = s.id
                where s.id = ?
                """.trimIndent(),
                sessionId,
            )
        assertThat(row["access_scope"]).isEqualTo(accessScope)
        assertThat(row["session_visibility"]).isEqualTo(sessionVisibility)
        assertThat(row["site_visibility"]).isEqualTo(siteVisibility)
        assertThat(row["publication_visibility"]).isEqualTo(publicationVisibility)
        assertThat(row["is_public"]).isEqualTo(isPublic)
    }

    private fun sessionUpdatedAt(sessionId: String): java.time.LocalDateTime =
        jdbcTemplate.queryForObject(
            "select updated_at from sessions where id = ?",
            java.time.LocalDateTime::class.java,
            sessionId,
        ) ?: error("missing session updated_at")

    private fun insertNotesQuestion(sessionId: String) {
        jdbcTemplate.update(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought)
            values (?, ?, ?, ?, 1, ?, ?)
            """.trimIndent(),
            UUID.randomUUID().toString(),
            CLUB_ID,
            sessionId,
            HOST_MEMBERSHIP_ID,
            NOTES_QUESTION,
            NOTES_PRIVATE_THOUGHT,
        )
    }

    private fun assertNotesProjection(
        sessionId: String,
        visible: Boolean,
    ) {
        val sessions =
            mockMvc
                .get("/api/notes/sessions") { with(user("member1@example.com")) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
        val feed =
            mockMvc
                .get("/api/notes/feed") { with(user("member1@example.com")) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
        val filtered =
            mockMvc
                .get("/api/notes/feed") {
                    param("sessionId", sessionId)
                    with(user("member1@example.com"))
                }.andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
        listOf(sessions, feed, filtered).forEach { response ->
            if (visible) {
                assertThat(response).contains(sessionId)
            } else {
                assertThat(response).doesNotContain(sessionId, NOTES_QUESTION, "initial highlight")
            }
            assertThat(response).doesNotContain(NOTES_PRIVATE_THOUGHT)
        }
        if (visible) {
            assertThat(feed).contains(NOTES_QUESTION, "initial highlight")
            assertThat(filtered).contains(NOTES_QUESTION, "initial highlight")
        }
    }

    private fun recordEpoch(): Long =
        jdbcTemplate.queryForObject(
            "select record_epoch from club_host_list_epochs where club_id = ?",
            Long::class.java,
            CLUB_ID,
        ) ?: error("missing record epoch")

    private fun revisionCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from session_record_revisions where session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun applyReceiptCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from session_record_apply_receipts where session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun assertCorrectionReceiptBridge(
        sessionId: String,
        key: String,
    ) {
        val featureReceiptId =
            jdbcTemplate.queryForObject(
                """
                select apply_request_id
                from session_record_apply_receipts
                where session_id = ?
                order by expected_live_revision desc
                limit 1
                """.trimIndent(),
                String::class.java,
                sessionId,
            ) ?: error("missing feature receipt")
        val hostReceiptId =
            jdbcTemplate.queryForObject(
                """
                select id
                from host_session_mutation_receipts
                where resource_id = ? and operation = 'SESSION_CORRECTION_PUBLISH'
                """.trimIndent(),
                String::class.java,
                sessionId,
            ) ?: error("missing host receipt")
        val operationalReceiptId =
            jdbcTemplate.queryForObject(
                """
                select receipt_id
                from mutation_idempotency_keys
                where resource_slot = ?
                  and operation = 'SESSION_CORRECTION_PUBLISH'
                  and idempotency_key = ?
                """.trimIndent(),
                String::class.java,
                sessionId,
                key,
            ) ?: error("missing operational receipt link")

        assertThat(hostReceiptId).isEqualTo(featureReceiptId)
        assertThat(operationalReceiptId).isEqualTo(featureReceiptId)

        val reconciliation =
            mockMvc
                .get("/api/host/mutations/SESSION_CORRECTION_PUBLISH/$sessionId/$key") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        assertThat(reconciliation.get("status").asString()).isEqualTo("COMMITTED")
        assertThat(reconciliation.get("receipt").get("receiptId").asString()).isEqualTo(featureReceiptId)
        assertThat(reconciliation.toString())
            .doesNotContain("meetingUrl", "meetingPasscode", "expectedDraftHash", "draftSha256")
    }

    private fun hostDisplayName(): String =
        jdbcTemplate.queryForObject(
            "select name from users where email = 'host@example.com'",
            String::class.java,
        ) ?: error("missing host")

    private fun feedbackMarkdown(label: String) =
        """
        <!-- readmates-feedback:v1 -->

        # 독서모임 1차 피드백

        Book · 2026.09.04

        ## 메타

        - 책: Book

        ## 관찰자 노트

        $label note.

        ## 참여자별 피드백

        ### 01. Member

        역할: 참여자

        #### 참여 스타일

        Steady.

        #### 실질 기여

        - Shared a perspective.

        #### 문제점과 자기모순

        ##### 1. Scope

        - 핵심: Broad.
        - 근거: Several examples.
        - 해석: Narrow it.

        #### 실천 과제

        1. Lead with the conclusion.

        #### 드러난 한 문장

        > Keep it focused.

        맥락: Test

        주석: Test fixture.
        """.trimIndent()

    private companion object {
        const val NOTES_QUESTION = "correction-private-notes-question"
        const val NOTES_PRIVATE_THOUGHT = "correction-private-draft-thought"
    }
}
