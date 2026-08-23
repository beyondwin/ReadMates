package com.readmates.session.api

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_EXPOSURE_PUBLICATION_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_EXPOSURE_PUBLICATION_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostSessionExposurePublicationDbTest(
    @Autowired mockMvc: MockMvc,
    @Autowired jdbcTemplate: JdbcTemplate,
) : HostSessionAtomicityDbTestSupport(mockMvc, jdbcTemplate) {
    @Test
    fun `dual access and placement validates both revisions and stale command commits nothing`() {
        val sessionId = createDraft("dual exposure", "key-dual-create-01").first
        val epochBefore = recordEpoch()

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-dual-write-01",
                        """{"exposureRevision":0,"publicationRevision":0}""",
                        """{"publicSummary":"dual summary","accessScope":"GUEST_READABLE","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect { status { isOk() } }

        assertThat(exposureRevision(sessionId)).isEqualTo(1)
        assertThat(publicationRevision(sessionId)).isEqualTo(1)
        assertThat(recordEpoch()).isEqualTo(epochBefore + 1)
        assertExposure(sessionId, "GUEST_READABLE", "MEMBER", "HIDDEN", "MEMBER", false, "dual summary")

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-dual-write-01",
                        """{"exposureRevision":1,"publicationRevision":1}""",
                        """{"publicSummary":"dual summary","accessScope":"HOST_ONLY","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }

        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-dual-stale-01",
                        """{"exposureRevision":0,"publicationRevision":0}""",
                        """{"publicSummary":"must not commit","accessScope":"HOST_ONLY","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }

        assertThat(exposureRevision(sessionId)).isEqualTo(1)
        assertThat(publicationRevision(sessionId)).isEqualTo(1)
        assertThat(recordEpoch()).isEqualTo(epochBefore + 1)
        assertExposure(sessionId, "GUEST_READABLE", "MEMBER", "HIDDEN", "MEMBER", false, "dual summary")
    }

    @Test
    fun `concurrent first public placement from revision zero has one winner and one conflict`() {
        val sessionId = closedGuestReadableSession("first placement")
        assertThat(publicationRevision(sessionId)).isZero()
        assertThat(publicContentCount(sessionId)).isZero()
        val epochBefore = recordEpoch()
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)

        try {
            val responses =
                listOf("alpha", "beta").map { suffix ->
                    executor.submit<Int> {
                        ready.countDown()
                        start.await()
                        mockMvc
                            .put("/api/host/sessions/$sessionId/publication") {
                                with(user("host@example.com"))
                                with(csrf())
                                contentType = MediaType.APPLICATION_JSON
                                content =
                                    envelope(
                                        "key-first-$suffix-01",
                                        """{"publicationRevision":0}""",
                                        """{"publicSummary":"winner $suffix","siteVisibility":"PUBLIC_RECORD"}""",
                                    )
                            }.andReturn()
                            .response.status
                    }
                }
            ready.await()
            start.countDown()

            assertThat(responses.map { it.get() }.sorted()).containsExactly(200, 409)
        } finally {
            executor.shutdownNow()
        }

        assertThat(publicationRevision(sessionId)).isEqualTo(1)
        assertThat(publicContentCount(sessionId)).isEqualTo(1)
        assertThat(recordEpoch()).isEqualTo(epochBefore + 1)
        assertThat(publicSummary(sessionId)).isIn("winner alpha", "winner beta")
    }

    @Test
    @Suppress("LongMethod")
    fun `stale publish and correction preserve old live while correction commits every origin projection once`() {
        val sessionId = publishedSessionWithInitialRecord()
        val oldRevisionId = latestRevisionId(sessionId)
        val oldSnapshot = revisionSnapshot(oldRevisionId)

        saveRecordDraft(sessionId, "corrected", "PUBLIC")
        val current = versions(sessionId)
        assertCorrectionPreview(sessionId, current, "GUEST_READABLE", "PUBLIC_RECORD", "PUBLIC")
        val epochBeforeStale = recordEpoch()
        val initialOriginTexts = originTexts(sessionId)
        val initialRevisionCount = revisionCount(sessionId)
        val initialApplyReceiptCount = applyReceiptCount(sessionId)
        val initialPublishReceiptCount = operationReceiptCount(sessionId, "SESSION_PUBLISH")
        val initialCorrectionReceiptCount = operationReceiptCount(sessionId, "SESSION_CORRECTION_PUBLISH")

        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-publish-stale-live-01",
                        publishVector(current.copy(live = current.live + 1)),
                        "{}",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-correction-stale-01",
                        correctionVector(current.copy(live = current.live + 1)),
                        "{}",
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }

        assertThat(liveRecordRevision(sessionId)).isEqualTo(1)
        assertThat(publicSummary(sessionId)).isEqualTo("initial summary")
        assertThat(originTexts(sessionId)).isEqualTo(initialOriginTexts)
        assertThat(revisionSnapshot(oldRevisionId)).isEqualTo(oldSnapshot)
        assertThat(revisionCount(sessionId)).isEqualTo(initialRevisionCount)
        assertThat(recordDraftRevision(sessionId)).isEqualTo(1)
        assertThat(applyReceiptCount(sessionId)).isEqualTo(initialApplyReceiptCount)
        assertThat(operationReceiptCount(sessionId, "SESSION_PUBLISH")).isEqualTo(initialPublishReceiptCount)
        assertThat(operationReceiptCount(sessionId, "SESSION_CORRECTION_PUBLISH"))
            .isEqualTo(initialCorrectionReceiptCount)
        assertThat(recordEpoch()).isEqualTo(epochBeforeStale)

        val epochBefore = recordEpoch()
        mockMvc
            .post("/api/host/sessions/$sessionId/correction-publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-correction-green-01", correctionVector(current), "{}")
            }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("PUBLISHED") }
            }

        assertThat(liveRecordRevision(sessionId)).isEqualTo(2)
        assertThat(recordDraftRevision(sessionId)).isNull()
        assertThat(recordEpoch()).isEqualTo(epochBefore + 1)
        assertThat(revisionCount(sessionId)).isEqualTo(2)
        assertThat(applyReceiptCount(sessionId)).isEqualTo(2)
        assertThat(operationReceiptCount(sessionId, "SESSION_CORRECTION_PUBLISH")).isEqualTo(1)
        assertThat(revisionSnapshot(oldRevisionId)).isEqualTo(oldSnapshot)
        assertThat(publicSummary(sessionId)).isEqualTo("corrected summary")
        assertThat(originTexts(sessionId)).containsExactly("corrected highlight", "corrected one line")

        assertCorrectedAudienceProjections(sessionId)
    }

    private fun assertCorrectedAudienceProjections(sessionId: String) {
        mockMvc
            .get("/api/archive/sessions/$sessionId") {
                with(user("member1@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.publicSummary") { value("corrected summary") }
                jsonPath("$.publicHighlights[0].text") { value("corrected highlight") }
                jsonPath("$.publicOneLiners[0].text") { value("corrected one line") }
            }
        mockMvc
            .get("/api/public/clubs/reading-sai/browse/archive/$sessionId")
            .andExpect {
                status { isOk() }
                jsonPath("$.summary") { value("corrected summary") }
                jsonPath("$.highlights[0].text") { value("corrected highlight") }
                jsonPath("$.oneLiners[0].text") { value("corrected one line") }
            }
        mockMvc
            .get("/api/public/clubs/reading-sai/sessions/$sessionId")
            .andExpect {
                status { isOk() }
                jsonPath("$.summary") { value("corrected summary") }
                jsonPath("$.highlights[0].text") { value("corrected highlight") }
                jsonPath("$.oneLiners[0].text") { value("corrected one line") }
            }
    }

    private fun assertCorrectionPreview(
        sessionId: String,
        versions: Versions,
        accessScope: String,
        siteVisibility: String,
        visibility: String,
    ) {
        mockMvc
            .get("/api/host/sessions/$sessionId/correction-publish-preview") {
                withHost()
            }.andExpect {
                status { isOk() }
                jsonPath("$.snapshotId") { isNotEmpty() }
                jsonPath("$.versions.sessionRevision") { value(versions.session) }
                jsonPath("$.versions.recordDraftRevision") { value(versions.draft) }
                jsonPath("$.versions.liveRecordRevision") { value(versions.live) }
                jsonPath("$.versions.exposureRevision") { value(versions.exposure) }
                jsonPath("$.versions.publicationRevision") { value(versions.publication) }
                jsonPath("$.versions.participantSetRevision") { doesNotExist() }
                jsonPath("$.accessScope") { value(accessScope) }
                jsonPath("$.siteVisibility") { value(siteVisibility) }
                jsonPath("$.visibility") { value(visibility) }
            }
    }

    private fun publishedSessionWithInitialRecord(): String {
        val sessionId = closedGuestReadableSession("correction publish")
        saveRecordDraft(sessionId, "initial", "MEMBER")
        applyRecord(sessionId, "00000000-0000-4000-8000-000000000701", "key-initial-apply-01")
        placePublicRecord(sessionId, "initial summary", "key-initial-placement-01")
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-initial-publish-01", publishVectorJson(sessionId), "{}")
            }.andExpect { status { isOk() } }
        return sessionId
    }

    private fun closedGuestReadableSession(title: String): String {
        val sessionId = createDraft(title, "key-create-${UUID.randomUUID()}").first
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
        val displayName = hostDisplayName()
        val snapshot =
            jsonMapper.createObjectNode().apply {
                put("visibility", visibility)
                put("publicationSummary", "$label summary")
                putArray("highlights").addObject().apply {
                    put("membershipId", HOST_MEMBERSHIP_ID)
                    put("authorDisplayName", displayName)
                    put("text", "$label highlight")
                }
                putArray("oneLineReviews").addObject().apply {
                    put("membershipId", HOST_MEMBERSHIP_ID)
                    put("authorDisplayName", displayName)
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
            }.andExpect {
                status { isOk() }
                jsonPath("$.draftRevision") { value(1) }
            }
    }

    private fun applyRecord(
        sessionId: String,
        applyRequestId: String,
        key: String,
    ) {
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
                        key,
                        """{"draftRevision":1,"liveRevision":0}""",
                        """{"applyRequestId":"$applyRequestId","expectedDraftHash":"$hash"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun placePublicRecord(
        sessionId: String,
        summary: String,
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
                        """{"publicSummary":"$summary","siteVisibility":"PUBLIC_RECORD"}""",
                    )
            }.andExpect { status { isOk() } }
    }

    private fun publishVector(versions: Versions): String =
        """
        {"sessionRevision":${versions.session},"liveRecordRevision":${versions.live},
        "exposureRevision":${versions.exposure},"publicationRevision":${versions.publication}}
        """.trimIndent().replace("\n", "")

    private fun correctionVector(versions: Versions): String {
        val draft = requireNotNull(versions.draft)
        return """
            {"sessionRevision":${versions.session},"recordDraftRevision":$draft,
            "liveRecordRevision":${versions.live},"exposureRevision":${versions.exposure},
            "publicationRevision":${versions.publication}}
            """.trimIndent().replace("\n", "")
    }

    private fun assertExposure(
        sessionId: String,
        accessScope: String,
        sessionVisibility: String,
        siteVisibility: String,
        publicationVisibility: String,
        isPublic: Boolean,
        summary: String,
    ) {
        val row =
            jdbcTemplate.queryForMap(
                """
                select s.access_scope, s.visibility as session_visibility,
                       p.site_visibility, p.visibility as publication_visibility,
                       p.is_public, p.public_summary
                from sessions s
                join public_session_publications p on p.session_id = s.id and p.club_id = s.club_id
                where s.id = ?
                """.trimIndent(),
                sessionId,
            )
        assertThat(row["access_scope"]).isEqualTo(accessScope)
        assertThat(row["session_visibility"]).isEqualTo(sessionVisibility)
        assertThat(row["site_visibility"]).isEqualTo(siteVisibility)
        assertThat(row["publication_visibility"]).isEqualTo(publicationVisibility)
        assertThat(row["is_public"]).isEqualTo(isPublic)
        assertThat(row["public_summary"]).isEqualTo(summary)
    }

    private fun recordEpoch(): Long =
        jdbcTemplate.queryForObject(
            "select record_epoch from club_host_list_epochs where club_id = ?",
            Long::class.java,
            CLUB_ID,
        ) ?: error("missing record epoch")

    private fun publicSummary(sessionId: String): String =
        jdbcTemplate.queryForObject(
            "select public_summary from public_session_publications where session_id = ?",
            String::class.java,
            sessionId,
        ) ?: error("missing publication")

    private fun hostDisplayName(): String =
        jdbcTemplate.queryForObject(
            """
            select users.name from memberships
            join users on users.id = memberships.user_id
            where memberships.id = ?
            """.trimIndent(),
            String::class.java,
            HOST_MEMBERSHIP_ID,
        ) ?: error("missing host")

    private fun latestRevisionId(sessionId: String): String =
        jdbcTemplate.queryForObject(
            "select id from session_record_revisions where session_id = ? order by version desc limit 1",
            String::class.java,
            sessionId,
        ) ?: error("missing revision")

    private fun revisionSnapshot(revisionId: String): String =
        jdbcTemplate.queryForObject(
            "select snapshot_json from session_record_revisions where id = ?",
            String::class.java,
            revisionId,
        ) ?: error("missing snapshot")

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

    private fun operationReceiptCount(
        sessionId: String,
        operation: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_mutation_receipts where resource_id = ? and operation = ?",
            Int::class.java,
            sessionId,
            operation,
        ) ?: 0

    private fun originTexts(sessionId: String): List<String> =
        listOf(
            jdbcTemplate.queryForObject(
                "select text from highlights where session_id = ? order by sort_order limit 1",
                String::class.java,
                sessionId,
            ) ?: error("missing highlight"),
            jdbcTemplate.queryForObject(
                "select text from one_line_reviews where session_id = ? order by created_at limit 1",
                String::class.java,
                sessionId,
            ) ?: error("missing one line"),
        )

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

internal const val CLEANUP_EXPOSURE_PUBLICATION_SQL = """
    delete from session_record_apply_receipts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_record_drafts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from mutation_idempotency_keys
    where club_id = '00000000-0000-0000-0000-000000000001'
      and actor_membership_id = '00000000-0000-0000-0000-000000000201';
    delete from host_session_mutation_receipts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and resource_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from host_session_change_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from host_session_lifecycle_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_feedback_documents
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from highlights
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from one_line_reviews
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_record_revisions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_participants
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from session_publication_versions
    where session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from public_session_publications
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (select id from sessions where club_id = '00000000-0000-0000-0000-000000000001' and number > 7);
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001' and number > 7;
"""
