package com.readmates.aigen.api

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedAuthoredText
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.GroundedEvidenceExcerpt
import com.readmates.aigen.application.model.GroundedEvidenceTarget
import com.readmates.aigen.application.model.GroundedFeedbackSection
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundedTextBlock
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.support.KafkaTestContainer
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import org.springframework.test.web.servlet.post
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.TimeUnit

private const val CLUB_ID = "00000000-0000-0000-0000-000000088600"
private const val SESSION_ID = "00000000-0000-0000-0000-000000088601"
private const val HOST_USER_ID = "00000000-0000-0000-0000-000000088611"
private const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000088612"
private const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000088621"
private const val MEMBER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000088622"

private const val HOST_EMAIL = "aigen-host@example.test"

private const val CLEANUP_SQL = """
    delete from notification_event_outbox where club_id = '$CLUB_ID';
    delete from session_feedback_documents where session_id = '$SESSION_ID';
    delete from public_session_publications where session_id = '$SESSION_ID';
    delete from highlights where session_id = '$SESSION_ID';
    delete from one_line_reviews where session_id = '$SESSION_ID';
    delete from session_participants where session_id = '$SESSION_ID';
    delete from sessions where id = '$SESSION_ID';
    delete from memberships where id in ('$HOST_MEMBERSHIP_ID', '$MEMBER_MEMBERSHIP_ID');
    delete from users where id in ('$HOST_USER_ID', '$MEMBER_USER_ID');
    delete from clubs where id = '$CLUB_ID';
    delete from ai_generation_audit_log where club_id = '$CLUB_ID';
"""

private const val SEED_SQL = """
    insert into clubs (id, slug, name, tagline, about)
    values ('$CLUB_ID', 'aigen-int-club', 'AI Gen Test Club', 'tagline', 'about');
    insert into users (id, email, name, short_name, auth_provider)
    values
      ('$HOST_USER_ID', '$HOST_EMAIL', 'AiGen Host', 'AiGenHost', 'PASSWORD'),
      ('$MEMBER_USER_ID', 'aigen-member@example.test', 'AiGen Member', 'AiGenMember', 'PASSWORD');
    insert into memberships (id, club_id, user_id, role, status, short_name, joined_at)
    values
      ('$HOST_MEMBERSHIP_ID', '$CLUB_ID', '$HOST_USER_ID', 'HOST', 'ACTIVE', 'AiGenHost', '2026-05-01 00:00:00.000000'),
      ('$MEMBER_MEMBERSHIP_ID', '$CLUB_ID', '$MEMBER_USER_ID', 'MEMBER', 'ACTIVE', 'AiGenMember', '2026-05-01 00:00:00.000000');
    insert into sessions (
      id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
      session_date, start_time, end_time, location_label, meeting_url, meeting_passcode,
      question_deadline_at, state, visibility
    )
    values (
      '$SESSION_ID', '$CLUB_ID', 8861, '8861차 · AI Gen Book', 'AI Gen Book', 'Book Author',
      null, null, null, '2026-05-14', '20:00:00', '22:00:00', 'Online', null, null,
      '2026-05-13 14:59:00.000000', 'CLOSED', 'MEMBER'
    );
    insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
    values
      ('00000000-0000-0000-0000-000000088631', '$CLUB_ID', '$SESSION_ID', '$HOST_MEMBERSHIP_ID', 'GOING', 'ATTENDED', 'ACTIVE'),
      ('00000000-0000-0000-0000-000000088632', '$CLUB_ID', '$SESSION_ID', '$MEMBER_MEMBERSHIP_ID', 'GOING', 'ATTENDED', 'ACTIVE');
    insert into public_session_publications (id, club_id, session_id, public_summary, is_public, visibility, published_at)
    values ('00000000-0000-0000-0000-000000088641', '$CLUB_ID', '$SESSION_ID', 'placeholder', false, 'MEMBER', null);
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.redis.enabled=true",
        "readmates.aigen.enabled=true",
        "readmates.aigen.mock=true",
        "readmates.aigen.caps.host-per-minute-calls=100",
        "readmates.aigen.caps.host-daily-calls=100",
        "readmates.aigen.enabled-providers=CLAUDE,OPENAI",
        "readmates.aigen.pricing.claude-sonnet-4-6.input-per-m-token-usd=3.00",
        "readmates.aigen.pricing.claude-sonnet-4-6.cached-input-per-m-token-usd=0.30",
        "readmates.aigen.pricing.claude-sonnet-4-6.output-per-m-token-usd=15.00",
        "readmates.aigen.pricing[gpt-5.4-mini].input-per-m-token-usd=0.75",
        "readmates.aigen.pricing[gpt-5.4-mini].cached-input-per-m-token-usd=0.075",
        "readmates.aigen.pricing[gpt-5.4-mini].output-per-m-token-usd=4.50",
        "readmates.aigen.kafka.enabled=true",
        "spring.kafka.consumer.auto-offset-reset=earliest",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_SQL, SEED_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
@Tag("container")
class AiGenerateApiIntegrationTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val redis: StringRedisTemplate,
    @param:Autowired private val jobStore: AiGenerationJobStore,
) : ReadmatesRedisIntegrationTestSupport() {
    @Test
    fun `full generation lifecycle - start, poll until SUCCEEDED, commit, then Redis payload cleaned`() {
        val jobId = startJob("claude-sonnet-4-6", "AiGenHost 00:00\nPublic-safe integration statement.")

        // Wait for the Kafka consumer to dispatch to the worker and the stub to drive
        // the snapshot through the validator + Redis result update.
        awaitSucceeded(jobId)

        // Sanity: the Redis result key exists with the stub snapshot before commit.
        assertThat(redis.hasKey("aigen:job:$jobId:result")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId:transcript")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId")).isTrue()

        // Commit — no override — must succeed and clean transient Redis payload.
        commitJob(jobId)
        assertTerminalHashRetainedAndPayloadDeleted(jobId)
        assertSessionImportCommitted()
    }

    @Test
    fun `regenerate updates the stored result with the patched item`() {
        val transcript =
            MockMultipartFile(
                "transcript",
                "transcript.txt",
                "text/plain",
                "AiGenHost 00:00\nAnother public-safe statement.".toByteArray(),
            )
        val body =
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":"claude-sonnet-4-6","authorNameMode":"real","instructions":null}""".toByteArray(),
            )

        val startResponse =
            mockMvc
                .multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
                    file(transcript)
                    file(body)
                    with(user(HOST_EMAIL))
                }.andReturn()
                .response
        val jobId = jobIdFrom(startResponse.contentAsString)

        await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250)).untilAsserted {
            assertThat(jobStatusJson(jobId)).contains("\"status\":\"SUCCEEDED\"")
        }

        // Regenerate the summary — stub returns a deterministic regenerated value.
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId/regenerate") {
                with(user(HOST_EMAIL))
                contentType = MediaType.APPLICATION_JSON
                content = """{"item":"SUMMARY","model":null,"instructions":null}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.item") { value("SUMMARY") }
                jsonPath("$.value") { value("Regenerated summary for AI Gen Book.") }
            }

        // Status response must reflect the regenerated summary in `result.summary`.
        val statusJson = jobStatusJson(jobId)
        assertThat(statusJson).contains("\"summary\":\"Regenerated summary for AI Gen Book.\"")
    }

    // task 4.3 — provider matrix: re-run the full lifecycle + regenerate flows
    // against each enabled provider. The CLAUDE row duplicates the dedicated
    // single-provider tests above (kept intact per the task constraint
    // "DO NOT modify existing test method behavior") so that, if the matrix
    // is later expanded, both providers are exercised uniformly here.

    @ParameterizedTest(name = "full generation lifecycle - provider {0}")
    @ValueSource(strings = ["claude-sonnet-4-6", "gpt-5.4-mini"])
    fun `full generation lifecycle - provider matrix`(model: String) {
        val jobId = startJob(model, "AiGenHost 00:00\nPublic-safe provider statement for $model.")
        awaitSucceeded(jobId)

        assertThat(redis.hasKey("aigen:job:$jobId:result")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId:transcript")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId")).isTrue()

        commitJob(jobId)
        assertTerminalHashRetainedAndPayloadDeleted(jobId)
        assertSessionImportCommitted()
    }

    @ParameterizedTest(name = "regenerate updates stored result - provider {0}")
    @ValueSource(strings = ["claude-sonnet-4-6", "gpt-5.4-mini"])
    fun `regenerate updates the stored result - provider matrix`(model: String) {
        val transcript =
            MockMultipartFile(
                "transcript",
                "transcript.txt",
                "text/plain",
                "AiGenHost 00:00\nAnother public-safe provider statement for $model.".toByteArray(),
            )
        val body =
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":"$model","authorNameMode":"real","instructions":null}""".toByteArray(),
            )

        val startResponse =
            mockMvc
                .multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
                    file(transcript)
                    file(body)
                    with(user(HOST_EMAIL))
                }.andReturn()
                .response
        val jobId = jobIdFrom(startResponse.contentAsString)

        await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250)).untilAsserted {
            assertThat(jobStatusJson(jobId)).contains("\"status\":\"SUCCEEDED\"")
        }

        mockMvc
            .post("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId/regenerate") {
                with(user(HOST_EMAIL))
                contentType = MediaType.APPLICATION_JSON
                content = """{"item":"SUMMARY","model":null,"instructions":null}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.item") { value("SUMMARY") }
                jsonPath("$.value") { value("Regenerated summary for AI Gen Book.") }
            }

        val statusJson = jobStatusJson(jobId)
        assertThat(statusJson).contains("\"summary\":\"Regenerated summary for AI Gen Book.\"")
    }

    // task 9 — typed AI error regression coverage at the public API.
    // These two tests pin the contract that previously-untyped 500 UNKNOWN
    // failures now surface as stable RFC-7807 problems with `code` values
    // AI_DISABLED (start path) and AUTHOR_NAME_MISMATCH (commit override).

    @Test
    fun `start with unknown model returns typed AI disabled problem`() {
        val transcript =
            MockMultipartFile(
                "transcript",
                "transcript.txt",
                "text/plain",
                "AiGenHost 00:00\nPublic-safe unknown-model statement.".toByteArray(),
            )
        val body =
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":"not-allowlisted-model","authorNameMode":"real","instructions":null}""".toByteArray(),
            )

        mockMvc
            .multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
                file(transcript)
                file(body)
                with(user(HOST_EMAIL))
            }.andExpect {
                status { isServiceUnavailable() }
                jsonPath("$.code") { value("AI_DISABLED") }
                jsonPath("$.detail") { value("AI generation request could not be completed") }
            }
    }

    @Test
    fun `explicit alias mode is rejected before transcript decoding and job side effects`() {
        val before = redis.keys("aigen:job:*")
        val transcript = MockMultipartFile("transcript", "public-fixture.txt", "text/plain", byteArrayOf(0xFF.toByte()))
        val body =
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":null,"authorNameMode":"alias","instructions":null}""".toByteArray(),
            )

        mockMvc
            .multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
                file(transcript)
                file(body)
                with(user(HOST_EMAIL))
            }.andExpect {
                status { isUnprocessableEntity() }
                jsonPath("$.code") { value("TRANSCRIPT_ALIAS_MODE_UNSUPPORTED") }
            }

        assertThat(redis.keys("aigen:job:*")).isEqualTo(before)
    }

    @Test
    fun `grounded poll and evidence expansion expose only current referenced turn`() {
        val record = groundedSucceededRecord()
        jobStore.save(record)

        mockMvc
            .get("/api/host/sessions/$SESSION_ID/ai-generate/jobs/${record.jobId}") {
                with(user(HOST_EMAIL))
            }.andExpect {
                status { isOk() }
                jsonPath("$.revision") { value(1) }
                jsonPath("$.groundingStatus") { value("VALID") }
                jsonPath("$.result.summary") { value("Public-safe grounded summary.") }
                jsonPath("$.evidence[0].turnId") { value("t000001") }
                jsonPath("$.evidence[0].targetId") { value("r1:SUMMARY:0") }
                jsonPath("$.sectionReviewStatuses.SUMMARY") { value("PENDING_REVIEW") }
                jsonPath("$.sectionReviewStatuses.HIGHLIGHTS") { value("PENDING_REVIEW") }
                jsonPath("$.sectionReviewStatuses.ONE_LINE_REVIEWS") { value("PENDING_REVIEW") }
                jsonPath("$.sectionReviewStatuses.FEEDBACK_DOCUMENT") { value("PENDING_REVIEW") }
                jsonPath("$.transcript") { doesNotExist() }
                jsonPath("$.validatedTurns") { doesNotExist() }
                jsonPath("$.groundedDraft") { doesNotExist() }
                jsonPath("$.instructions") { doesNotExist() }
            }

        mockMvc
            .get("/api/host/sessions/$SESSION_ID/ai-generate/jobs/${record.jobId}/evidence/t000001?revision=1") {
                with(user(HOST_EMAIL))
            }.andExpect {
                status { isOk() }
                jsonPath("$.text") { value("A complete public-safe source statement.") }
            }

        mockMvc
            .get("/api/host/sessions/$SESSION_ID/ai-generate/jobs/${record.jobId}/evidence/t000002?revision=1") {
                with(user(HOST_EMAIL))
            }.andExpect {
                status { isGone() }
                jsonPath("$.code") { value("JOB_EXPIRED") }
            }

        mockMvc
            .get("/api/host/sessions/$SESSION_ID/ai-generate/jobs/${record.jobId}/evidence/t000001?revision=0") {
                with(user(HOST_EMAIL))
            }.andExpect {
                status { isConflict() }
                jsonPath("$.currentRevision") { value(1) }
            }
    }

    @Test
    fun `commit override with unknown author returns typed author name mismatch problem`() {
        val jobId = startJob("claude-sonnet-4-6", "AiGenHost 00:00\nPublic-safe override statement.")
        awaitSucceeded(jobId)

        // Override result with an author not present in the seeded session's
        // expectedAuthorNames. The validator emits
        //   "Unknown authorName(s) not in expectedAuthorNames: [Injected Person]"
        // — we match the prefix so the offender list ordering stays free.
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId/commit") {
                with(user(HOST_EMAIL))
                contentType = MediaType.APPLICATION_JSON
                content = unknownAuthorOverrideJson()
            }.andExpect {
                status { isUnprocessableEntity() }
                jsonPath("$.code") { value("AUTHOR_NAME_MISMATCH") }
                jsonPath("$.detail") { value("AI generation request could not be completed") }
            }
    }

    private fun jobStatusJson(jobId: UUID): String =
        mockMvc
            .get("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId") {
                with(user(HOST_EMAIL))
            }.andReturn()
            .response.contentAsString

    @Suppress("LongMethod")
    private fun groundedSucceededRecord(): JobRecord {
        val now = Instant.now()
        val sessionId = UUID.fromString(SESSION_ID)
        val clubId = UUID.fromString(CLUB_ID)
        val hostUserId = UUID.fromString(HOST_USER_ID)
        val snapshot =
            SessionImportV1Snapshot(
                format = "readmates-session-import:v1",
                sessionNumber = 8861,
                bookTitle = "AI Gen Book",
                meetingDate = LocalDate.of(2026, 5, 14),
                summary = "Public-safe grounded summary.",
                highlights = listOf(SessionImportV1Snapshot.AuthoredText("AiGenHost", "Public-safe highlight.")),
                oneLineReviews = listOf(SessionImportV1Snapshot.AuthoredText("AiGenHost", "Public-safe review.")),
                feedbackDocumentFileName = "session-feedback.md",
                feedbackDocumentMarkdown = "# Public-safe feedback",
            )
        val draft =
            GroundedGenerationDraft(
                format = "readmates-grounded-generation:v2",
                sessionNumber = 8861,
                bookTitle = "AI Gen Book",
                meetingDate = LocalDate.of(2026, 5, 14),
                summaryBlocks = listOf(GroundedTextBlock(snapshot.summary, listOf("t000001"))),
                highlights = listOf(GroundedAuthoredText("AiGenHost", "Public-safe highlight.", listOf("t000001"))),
                oneLineReviews = listOf(GroundedAuthoredText("AiGenHost", "Public-safe review.", listOf("t000001"))),
                feedbackDocumentFileName = "session-feedback.md",
                feedbackSections =
                    listOf(GroundedFeedbackSection("Public-safe feedback", "A grounded section.", listOf("t000001"))),
            )
        val turns =
            listOf(
                ValidatedTranscriptTurn(
                    "t000001",
                    "AiGenHost",
                    UUID.fromString(HOST_MEMBERSHIP_ID),
                    0,
                    "A complete public-safe source statement.",
                ),
                ValidatedTranscriptTurn(
                    "t000002",
                    "AiGenHost",
                    UUID.fromString(HOST_MEMBERSHIP_ID),
                    30,
                    "An unreferenced public-safe source statement.",
                ),
            )
        return JobRecord(
            jobId = UUID.randomUUID(),
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
            model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6"),
            authorNameMode = AuthorNameMode.REAL,
            instructions = null,
            transcript = "AiGenHost 00:00\nA complete public-safe source statement.",
            sessionMeta =
                SessionMeta(
                    sessionId,
                    clubId,
                    8861,
                    "AI Gen Book",
                    "Book Author",
                    LocalDate.of(2026, 5, 14),
                    listOf("AiGenHost"),
                    AuthorNameMode.REAL,
                ),
            status = JobStatus.SUCCEEDED,
            stage = JobStage.READY,
            progressPct = 100,
            result = snapshot,
            groundedDraft = draft,
            error = null,
            tokens = TokenUsage(10, 0, 10),
            costAccumulatedUsd = BigDecimal("0.01"),
            expiresAt = now.plus(Duration.ofHours(6)),
            createdAt = now,
            lastUpdatedAt = now,
            actualModel = ModelId(Provider.CLAUDE, "claude-sonnet-4-6"),
            llmCallCount = 1,
            pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
            validatedTurns = turns,
            revision = 1,
            groundingStatus = GroundingStatus.VALID,
            evidence =
                GroundedEvidenceBundle(
                    1,
                    listOf(GroundedEvidenceTarget("r1:SUMMARY:0", GenerationItem.SUMMARY, 0, listOf("t000001"))),
                    listOf(
                        GroundedEvidenceExcerpt(
                            "t000001",
                            "AiGenHost",
                            0,
                            "A complete public-safe source statement.",
                            false,
                        ),
                    ),
                ),
        )
    }

    private fun startJob(
        model: String,
        transcriptText: String,
    ): UUID {
        val transcript =
            MockMultipartFile("transcript", "transcript.txt", "text/plain", transcriptText.toByteArray())
        val body =
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":"$model","authorNameMode":"real","instructions":null}""".toByteArray(),
            )
        val response =
            mockMvc
                .multipart("/api/host/sessions/$SESSION_ID/ai-generate/jobs") {
                    file(transcript)
                    file(body)
                    with(user(HOST_EMAIL))
                }.andReturn()
                .response
        assertThat(response.status).isEqualTo(202)
        return jobIdFrom(response.contentAsString)
    }

    private fun awaitSucceeded(jobId: UUID) {
        await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250)).untilAsserted {
            val status = jobStatusJson(jobId)
            assertThat(status).contains("\"status\":\"SUCCEEDED\"")
        }
    }

    private fun commitJob(jobId: UUID) {
        mockMvc
            .post("/api/host/sessions/$SESSION_ID/ai-generate/jobs/$jobId/commit") {
                with(user(HOST_EMAIL))
                contentType = MediaType.APPLICATION_JSON
                content = """{"recordVisibility":"MEMBER","result":null}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(SESSION_ID) }
                jsonPath("$.status") { value("COMMITTED") }
                jsonPath("$.recovered") { value(false) }
                jsonPath("$.publication") { doesNotExist() }
            }
    }

    private fun assertTerminalHashRetainedAndPayloadDeleted(jobId: UUID) {
        assertThat(redis.hasKey("aigen:job:$jobId")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId:result")).isFalse()
        assertThat(redis.hasKey("aigen:job:$jobId:transcript")).isFalse()
        assertThat(jobStatusJson(jobId)).contains("\"status\":\"COMMITTED\"")
    }

    private fun assertSessionImportCommitted() {
        val summary =
            jdbcTemplate.queryForObject(
                "select public_summary from public_session_publications where session_id = '$SESSION_ID'",
                String::class.java,
            )
        val feedbackCount =
            jdbcTemplate.queryForObject(
                "select count(*) from session_feedback_documents where session_id = '$SESSION_ID'",
                Int::class.java,
            )
        val auditRows =
            jdbcTemplate.queryForList(
                """
                select kind, status from ai_generation_audit_log
                where session_id = '$SESSION_ID' order by created_at
                """.trimIndent(),
            )
        val kindStatus = auditRows.map { it["kind"] as String to it["status"] as String }
        assertThat(summary).isNotNull.contains("AI Gen Book")
        assertThat(feedbackCount).isGreaterThanOrEqualTo(1)
        assertThat(kindStatus).contains("FULL" to "SUCCESS", "COMMIT" to "SUCCESS")
    }

    private fun unknownAuthorOverrideJson(): String =
        """
        {
          "recordVisibility": "MEMBER",
          "result": {
            "format": "readmates-session-import:v1",
            "sessionNumber": 8861,
            "bookTitle": "AI Gen Book",
            "meetingDate": "2026-05-14",
            "summary": "Override summary for AI Gen Book.",
            "highlights": [
              {"authorName": "Injected Person", "text": "Untrusted highlight 1."},
              {"authorName": "Injected Person", "text": "Untrusted highlight 2."},
              {"authorName": "Injected Person", "text": "Untrusted highlight 3."}
            ],
            "oneLineReviews": [
              {"authorName": "Injected Person", "text": "Untrusted review."}
            ],
            "feedbackDocumentFileName": "session-8861-feedback.md",
            "feedbackDocumentMarkdown": "<!-- readmates-feedback:v1 -->\n\n# 독서모임 8861차 피드백\n\nOverride body."
          }
        }
        """.trimIndent()

    private fun jobIdFrom(json: String): UUID {
        val match =
            Regex("\"jobId\":\"([0-9a-f-]{36})\"").find(json)
                ?: error("No jobId in response: $json")
        return UUID.fromString(match.groupValues[1])
    }

    companion object {
        // A run-id keeps the Kafka topic+consumer-group unique per test JVM so reused
        // KafkaContainer instances don't bleed offsets between integration test classes.
        val RUN_ID: String = UUID.randomUUID().toString().take(8)

        private val TOPIC = "readmates.aigen.jobs.int.$RUN_ID"

        @JvmStatic
        @DynamicPropertySource
        fun registerKafkaProperties(registry: DynamicPropertyRegistry) {
            val bootstrapServers = KafkaTestContainer.container.bootstrapServers
            // Create the topic up front so the producer doesn't race on auto-create.
            createTopic(bootstrapServers, TOPIC)

            registry.add("readmates.aigen.kafka.bootstrap-servers") { bootstrapServers }
            registry.add("spring.kafka.bootstrap-servers") { bootstrapServers }
            // Per-run topic + consumer-group so reused KafkaContainer instances don't bleed
            // offsets between integration test classes.
            registry.add("readmates.aigen.kafka.topic-jobs") { TOPIC }
            registry.add("readmates.aigen.kafka.consumer-group") { "aigen-int-test-$RUN_ID" }
        }

        private fun createTopic(
            bootstrapServers: String,
            topic: String,
        ) {
            AdminClient
                .create(
                    mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers),
                ).use { admin ->
                    admin
                        .createTopics(listOf(NewTopic(topic, 1, 1.toShort())))
                        .all()
                        .get(10, TimeUnit.SECONDS)
                }
        }
    }
}
