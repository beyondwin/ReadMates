package com.readmates.session.api

import com.readmates.session.application.port.`in`.PurgeExpiredHostSessionTrashUseCase
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.SoftAssertions.assertSoftly
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
class HostSessionCorrectionSafetyDbTest(
    @param:Autowired mockMvc: MockMvc,
    @param:Autowired jdbcTemplate: JdbcTemplate,
    @param:Autowired purgeExpiredHostSessionTrash: PurgeExpiredHostSessionTrashUseCase,
) : HostSessionIdempotencyDbTestSupport(mockMvc, jdbcTemplate, purgeExpiredHostSessionTrash) {
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
        val sessionListIds = notesSessionIds("/api/notes/sessions")
        val globalFeedIds = notesSessionIds("/api/notes/feed")
        val sessionFeedIds = notesSessionIds("/api/notes/feed", sessionId)
        assertSoftly { softly ->
            softly.assertThat(sessionListIds).doesNotContain(sessionId)
            softly.assertThat(globalFeedIds).doesNotContain(sessionId)
            softly.assertThat(sessionFeedIds).doesNotContain(sessionId)
        }
    }

    private fun notesSessionIds(
        path: String,
        sessionId: String? = null,
    ): List<String> =
        mockMvc
            .get(path) {
                sessionId?.let { param("sessionId", it) }
                with(user("member1@example.com"))
            }.andExpect {
                status { isOk() }
            }.andReturn()
            .response.contentAsString
            .let(jsonMapper::readTree)
            .get("items")
            .iterator()
            .asSequence()
            .map { item -> item.get("sessionId").asString() }
            .toList()

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
}
