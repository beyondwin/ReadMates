package com.readmates.session.api

import com.readmates.session.application.port.`in`.PurgeExpiredHostSessionTrashUseCase
import com.readmates.sessionrecord.adapter.out.persistence.JdbcSessionRecordPublicProjectionAdapter
import com.readmates.sessionrecord.application.port.out.AppliedSessionRecordPublicEffect
import com.readmates.sessionrecord.application.port.out.SessionRecordPublicProjectionPort
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Import(PublicProjectionFailureTestConfiguration::class)
@Sql(statements = [CLEANUP_EXPOSURE_PUBLICATION_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_EXPOSURE_PUBLICATION_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class SessionRecordPublicProjectionDbTest(
    @param:Autowired mockMvc: MockMvc,
    @param:Autowired jdbcTemplate: JdbcTemplate,
    @param:Autowired purgeExpiredHostSessionTrash: PurgeExpiredHostSessionTrashUseCase,
    @param:Autowired private val controlledPublicProjection: ControlledSessionRecordPublicProjectionPort,
) : HostSessionIdempotencyDbTestSupport(mockMvc, jdbcTemplate, purgeExpiredHostSessionTrash) {
    @Test
    fun `published general record apply rotates generation exactly once and stale apply commits nothing`() {
        val sessionId = publishedSessionWithInitialRecord()
        saveRecordDraft(sessionId, "direct apply", "PUBLIC")
        val applyRequestId = "00000000-0000-4000-8000-000000000711"
        val requestDeduplicationValue = "direct-apply-replay"
        val hash = recordDraftHash(sessionId)
        val generationBefore = publicGeneration(sessionId)
        val convergenceBefore = sessionRecordConvergenceReceiptCount(sessionId)
        val workBefore = convergenceWorkCount(sessionId)

        applyRecordCommand(sessionId, applyRequestId, requestDeduplicationValue, expectedLiveRevision = 1, hash = hash)
            .andExpect { status { isOk() } }

        assertThat(publicGeneration(sessionId)).isEqualTo(generationBefore + 1)
        assertThat(sessionRecordConvergenceReceiptCount(sessionId)).isEqualTo(convergenceBefore + 1)
        assertThat(convergenceWorkCount(sessionId)).isEqualTo(workBefore + 1)
        assertThat(originTexts(sessionId)).containsExactly("direct apply highlight", "direct apply one line")

        applyRecordCommand(sessionId, applyRequestId, requestDeduplicationValue, expectedLiveRevision = 1, hash = hash)
            .andExpect { status { isOk() } }
        assertThat(publicGeneration(sessionId)).isEqualTo(generationBefore + 1)
        assertThat(sessionRecordConvergenceReceiptCount(sessionId)).isEqualTo(convergenceBefore + 1)
        assertThat(convergenceWorkCount(sessionId)).isEqualTo(workBefore + 1)

        saveRecordDraft(sessionId, "stale direct apply", "PUBLIC")
        val staleHash = recordDraftHash(sessionId)
        val revisionCountBeforeStale = revisionCount(sessionId)
        applyRecordCommand(
            sessionId,
            "00000000-0000-4000-8000-000000000712",
            "key-direct-apply-stale-01",
            expectedLiveRevision = 1,
            hash = staleHash,
        ).andExpect { status { isConflict() } }

        assertThat(revisionCount(sessionId)).isEqualTo(revisionCountBeforeStale)
        assertThat(publicGeneration(sessionId)).isEqualTo(generationBefore + 1)
        assertThat(sessionRecordConvergenceReceiptCount(sessionId)).isEqualTo(convergenceBefore + 1)
        assertThat(convergenceWorkCount(sessionId)).isEqualTo(workBefore + 1)
    }

    @Test
    fun `published record apply rolls back all writes when convergence append fails`() {
        val sessionId = publishedSessionWithInitialRecord()
        saveRecordDraft(sessionId, "rollback apply", "PUBLIC")
        val applyRequestId = "00000000-0000-4000-8000-000000000713"
        val hash = recordDraftHash(sessionId)
        val generationBefore = publicGeneration(sessionId)
        val revisionCountBefore = revisionCount(sessionId)
        val applyReceiptCountBefore = count("session_record_apply_receipts", "session_id", sessionId)
        val convergenceBefore = sessionRecordConvergenceReceiptCount(sessionId)
        val workBefore = convergenceWorkCount(sessionId)
        controlledPublicProjection.failAfterWrite = true

        assertThatThrownBy {
            applyRecordCommand(
                sessionId,
                applyRequestId,
                "key-direct-apply-rollback-01",
                expectedLiveRevision = 1,
                hash = hash,
            ).andReturn()
        }.hasRootCauseInstanceOf(IllegalStateException::class.java)

        assertThat(revisionCount(sessionId)).isEqualTo(revisionCountBefore)
        assertThat(count("session_record_apply_receipts", "session_id", sessionId))
            .isEqualTo(applyReceiptCountBefore)
        assertThat(publicGeneration(sessionId)).isEqualTo(generationBefore)
        assertThat(sessionRecordConvergenceReceiptCount(sessionId)).isEqualTo(convergenceBefore)
        assertThat(convergenceWorkCount(sessionId)).isEqualTo(workBefore)
    }

    @Test
    fun `published basic save rotates public generation once while stale and non-public saves do not`() {
        val sessionId = publishedSessionWithInitialRecord()
        val expectedRevision = sessionRevision(sessionId)
        val generationBefore = publicGeneration(sessionId)
        val convergenceBefore = convergenceReceiptCount(sessionId, "SESSION_BASIC_SAVE")
        val command = publicBasicCommand("공개 기본 저장", "수정된 공개 책")

        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-public-basic-green-01", """{"sessionRevision":$expectedRevision}""", command)
            }.andExpect { status { isOk() } }
        assertThat(publicGeneration(sessionId)).isEqualTo(generationBefore + 1)
        assertThat(convergenceReceiptCount(sessionId, "SESSION_BASIC_SAVE")).isEqualTo(convergenceBefore + 1)
        assertThat(requiredString("select book_title from sessions where id = ?", sessionId))
            .isEqualTo("수정된 공개 책")

        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-public-basic-green-01", """{"sessionRevision":$expectedRevision}""", command)
            }.andExpect { status { isOk() } }
        assertThat(publicGeneration(sessionId)).isEqualTo(generationBefore + 1)
        assertThat(convergenceReceiptCount(sessionId, "SESSION_BASIC_SAVE")).isEqualTo(convergenceBefore + 1)

        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-public-basic-stale-01",
                        """{"sessionRevision":$expectedRevision}""",
                        publicBasicCommand("거부할 기본 저장", "거부할 공개 책"),
                    )
            }.andExpect { status { isConflict() } }
        assertThat(publicGeneration(sessionId)).isEqualTo(generationBefore + 1)
        assertThat(convergenceReceiptCount(sessionId, "SESSION_BASIC_SAVE")).isEqualTo(convergenceBefore + 1)
        assertThat(requiredString("select book_title from sessions where id = ?", sessionId))
            .isEqualTo("수정된 공개 책")

        val privateSessionId = createDraft("비공개 기본 저장", "key-private-basic-create-01").first
        mockMvc
            .patch("/api/host/sessions/$privateSessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-private-basic-green-01",
                        """{"sessionRevision":0}""",
                        publicBasicCommand("비공개 저장", "비공개 책"),
                    )
            }.andExpect { status { isOk() } }
        assertThat(allConvergenceReceiptCount(privateSessionId)).isZero()
        assertThat(count("public_projection_generations", "session_id", privateSessionId)).isZero()
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
        val sessionId = createDraft("public projection", "key-create-${UUID.randomUUID()}").first
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
        applyRecordCommand(
            sessionId,
            "00000000-0000-4000-8000-000000000701",
            "key-initial-apply-01",
            expectedLiveRevision = 0,
            hash = hash,
        ).andExpect { status { isOk() } }
    }

    private fun applyRecordCommand(
        sessionId: String,
        applyRequestId: String,
        key: String,
        expectedLiveRevision: Long,
        hash: String,
    ) = mockMvc.post("/api/host/sessions/$sessionId/record-apply") {
        withHost()
        contentType = MediaType.APPLICATION_JSON
        content =
            envelope(
                key,
                """{"draftRevision":1,"liveRevision":$expectedLiveRevision}""",
                """{"applyRequestId":"$applyRequestId","expectedDraftHash":"$hash"}""",
            )
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

    private fun recordDraftHash(sessionId: String): String =
        requiredString("select snapshot_sha256 from session_record_drafts where session_id = ?", sessionId)

    private fun publicGeneration(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select generation from public_projection_generations where session_id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing public generation")

    private fun revisionCount(sessionId: String): Int = count("session_record_revisions", "session_id", sessionId)

    private fun convergenceReceiptCount(
        sessionId: String,
        operation: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from public_mutation_convergence_receipts convergence
            join host_session_mutation_receipts host on host.id = convergence.mutation_receipt_id
            where convergence.session_id_snapshot = ? and host.operation = ?
            """.trimIndent(),
            Int::class.java,
            sessionId,
            operation,
        ) ?: 0

    private fun sessionRecordConvergenceReceiptCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from public_mutation_convergence_receipts convergence
            join session_record_apply_receipts applied on applied.id = convergence.mutation_receipt_id
            where convergence.session_id_snapshot = ?
            """.trimIndent(),
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun convergenceWorkCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*) from public_convergence_work work
            join public_mutation_convergence_receipts convergence
              on convergence.convergence_id = work.convergence_id
            where convergence.session_id_snapshot = ?
            """.trimIndent(),
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun allConvergenceReceiptCount(sessionId: String): Int =
        count("public_mutation_convergence_receipts", "session_id_snapshot", sessionId)

    private fun originTexts(sessionId: String): List<String> =
        listOf(
            requiredString("select text from highlights where session_id = ? order by sort_order limit 1", sessionId),
            requiredString(
                "select text from one_line_reviews where session_id = ? order by created_at limit 1",
                sessionId,
            ),
        )

    private fun count(
        table: String,
        column: String,
        value: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $table where $column = ?",
            Int::class.java,
            value,
        ) ?: 0

    private fun requiredString(
        sql: String,
        value: String,
    ): String = jdbcTemplate.queryForObject(sql, String::class.java, value) ?: error("required fixture row is missing")

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

    private fun publicBasicCommand(
        title: String,
        bookTitle: String,
    ): String =
        """
        {
          "title": "$title",
          "bookTitle": "$bookTitle",
          "bookAuthor": "공개 저자",
          "date": "2026-09-04",
          "locationLabel": "온라인"
        }
        """.trimIndent()

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

@TestConfiguration(proxyBeanMethods = false)
class PublicProjectionFailureTestConfiguration {
    @Bean
    @Primary
    fun controlledSessionRecordPublicProjectionPort(delegate: JdbcSessionRecordPublicProjectionAdapter) =
        ControlledSessionRecordPublicProjectionPort(delegate)
}

class ControlledSessionRecordPublicProjectionPort(
    private val delegate: JdbcSessionRecordPublicProjectionAdapter,
) : SessionRecordPublicProjectionPort {
    var failAfterWrite: Boolean = false

    override fun recordApplied(effect: AppliedSessionRecordPublicEffect) {
        delegate.recordApplied(effect)
        if (failAfterWrite) {
            failAfterWrite = false
            throw IllegalStateException("test-only failure after public convergence append")
        }
    }
}
