package com.readmates.aigen.api

import com.fasterxml.jackson.databind.json.JsonMapper
import com.fasterxml.jackson.databind.JsonNode
import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.port.out.AiGenerationCommitPersistencePort
import com.readmates.aigen.application.port.out.AiGenerationCommitReceipt
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.support.AiGenerationTestModels
import com.readmates.aigen.support.SyntheticTranscriptTurn
import com.readmates.support.KafkaTestContainer
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommand
import com.readmates.sessionimport.application.model.SessionImportFeedbackDocumentCommand
import com.readmates.sessionimport.application.model.SessionImportPublicationCommand
import com.readmates.sessionimport.application.model.SessionImportRecordCommand
import com.readmates.sessionimport.application.model.SessionImportSessionCommand
import com.readmates.sessionimport.application.port.`in`.CommitValidatedSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.ValidatedSessionImportInput
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
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
import org.springframework.transaction.support.TransactionTemplate
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

private const val GROUNDED_CLUB_ID = "00000000-0000-0000-0000-000000089600"
private const val GROUNDED_SESSION_ID = "00000000-0000-0000-0000-000000089601"
private const val GROUNDED_HOST_USER_ID = "00000000-0000-0000-0000-000000089611"
private const val GROUNDED_MEMBER_A_USER_ID = "00000000-0000-0000-0000-000000089612"
private const val GROUNDED_MEMBER_B_USER_ID = "00000000-0000-0000-0000-000000089613"
private const val GROUNDED_HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000089621"
private const val GROUNDED_MEMBER_A_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000089622"
private const val GROUNDED_MEMBER_B_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000089623"
private const val GROUNDED_HOST_EMAIL = "grounded-host@example.test"

private const val GROUNDED_CLEANUP_SQL = """
    delete from ai_generation_commit_receipts where club_id = '$GROUNDED_CLUB_ID';
    delete from ai_generation_audit_log where club_id = '$GROUNDED_CLUB_ID';
    delete from notification_event_outbox where club_id = '$GROUNDED_CLUB_ID';
    delete from session_feedback_documents where session_id = '$GROUNDED_SESSION_ID';
    delete from public_session_publications where session_id = '$GROUNDED_SESSION_ID';
    delete from highlights where session_id = '$GROUNDED_SESSION_ID';
    delete from one_line_reviews where session_id = '$GROUNDED_SESSION_ID';
    delete from session_participants where session_id = '$GROUNDED_SESSION_ID';
    delete from sessions where id = '$GROUNDED_SESSION_ID';
    delete from memberships where id in ('$GROUNDED_HOST_MEMBERSHIP_ID', '$GROUNDED_MEMBER_A_MEMBERSHIP_ID', '$GROUNDED_MEMBER_B_MEMBERSHIP_ID');
    delete from users where id in ('$GROUNDED_HOST_USER_ID', '$GROUNDED_MEMBER_A_USER_ID', '$GROUNDED_MEMBER_B_USER_ID');
    delete from clubs where id = '$GROUNDED_CLUB_ID';
"""

private const val GROUNDED_SEED_SQL = """
    insert into clubs (id, slug, name, tagline, about)
    values ('$GROUNDED_CLUB_ID', 'grounded-int-club', 'Public Grounded Test Club', 'Public tagline', 'Public about');
    insert into users (id, email, name, short_name, auth_provider)
    values
      ('$GROUNDED_HOST_USER_ID', '$GROUNDED_HOST_EMAIL', 'PublicHost', 'PublicHost', 'PASSWORD'),
      ('$GROUNDED_MEMBER_A_USER_ID', 'grounded-a@example.test', 'PublicMemberA', 'PublicMemberA', 'PASSWORD'),
      ('$GROUNDED_MEMBER_B_USER_ID', 'grounded-b@example.test', 'PublicMemberB', 'PublicMemberB', 'PASSWORD');
    insert into memberships (id, club_id, user_id, role, status, short_name, joined_at)
    values
      ('$GROUNDED_HOST_MEMBERSHIP_ID', '$GROUNDED_CLUB_ID', '$GROUNDED_HOST_USER_ID', 'HOST', 'ACTIVE', 'PublicHost', '2026-07-01 00:00:00.000000'),
      ('$GROUNDED_MEMBER_A_MEMBERSHIP_ID', '$GROUNDED_CLUB_ID', '$GROUNDED_MEMBER_A_USER_ID', 'MEMBER', 'ACTIVE', 'PublicMemberA', '2026-07-01 00:00:00.000000'),
      ('$GROUNDED_MEMBER_B_MEMBERSHIP_ID', '$GROUNDED_CLUB_ID', '$GROUNDED_MEMBER_B_USER_ID', 'MEMBER', 'ACTIVE', 'PublicMemberB', '2026-07-01 00:00:00.000000');
    insert into sessions (
      id, club_id, number, title, book_title, book_author, book_translator, book_link, book_image_url,
      session_date, start_time, end_time, location_label, meeting_url, meeting_passcode,
      question_deadline_at, state, visibility
    ) values (
      '$GROUNDED_SESSION_ID', '$GROUNDED_CLUB_ID', 8961, '8961차 · Public Test Book', 'Public Test Book', 'Public Author',
      null, null, null, '2026-07-14', '19:30:00', '21:30:00', 'Public Room', null, null,
      '2026-07-13 14:59:00.000000', 'CLOSED', 'MEMBER'
    );
    insert into session_participants
      (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
    values
      ('00000000-0000-0000-0000-000000089631', '$GROUNDED_CLUB_ID', '$GROUNDED_SESSION_ID', '$GROUNDED_MEMBER_A_MEMBERSHIP_ID', 'DECLINED', 'ABSENT', 'REMOVED');
    insert into public_session_publications (id, club_id, session_id, public_summary, is_public, visibility, published_at)
    values ('00000000-0000-0000-0000-000000089641', '$GROUNDED_CLUB_ID', '$GROUNDED_SESSION_ID', 'unchanged placeholder', false, 'MEMBER', null);
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.redis.enabled=true",
        "readmates.aigen.enabled=true",
        "readmates.aigen.mock=true",
        "readmates.aigen.pipeline-mode=GROUNDED_WHOLE_TRANSCRIPT",
        "readmates.aigen.enabled-providers=CLAUDE",
        "readmates.aigen.fallback-default-model=claude-sonnet-4-6",
        "readmates.aigen.grounded.capabilities[claude-sonnet-4-6].context-window-tokens=1000000",
        "readmates.aigen.grounded.capabilities[claude-sonnet-4-6].max-output-tokens=64000",
        "readmates.aigen.grounded.capabilities[claude-sonnet-4-6].structured-output-supported=true",
        "readmates.aigen.pricing.claude-sonnet-4-6.input-per-m-token-usd=3.00",
        "readmates.aigen.pricing.claude-sonnet-4-6.cached-input-per-m-token-usd=0.30",
        "readmates.aigen.pricing.claude-sonnet-4-6.output-per-m-token-usd=15.00",
        "readmates.aigen.kafka.enabled=true",
        "spring.kafka.consumer.auto-offset-reset=earliest",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [GROUNDED_CLEANUP_SQL, GROUNDED_SEED_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [GROUNDED_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
@Tag("container")
class AiGenerateGroundedCommitIntegrationTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbc: JdbcTemplate,
    @param:Autowired private val redis: StringRedisTemplate,
    @param:Autowired private val jobStore: AiGenerationJobStore,
    @param:Autowired private val commitPersistence: AiGenerationCommitPersistencePort,
    @param:Autowired private val commitDelegate: CommitValidatedSessionImportUseCase,
    @param:Autowired private val transactions: TransactionTemplate,
) : ReadmatesRedisIntegrationTestSupport() {
    private val objectMapper = JsonMapper.builder().findAndAddModules().build()

    @Test
    fun `grounded transcript commit synchronizes speakers atomically and repeated commit recovers from receipt`() {
        val jobId = startGroundedJob()
        awaitSucceeded(jobId)

        val before = requireNotNull(jobStore.load(jobId))
        val committedResult = currentResult(jobId)
        assertThat(before.validatedTurns.map { it.speakerName }.distinct())
            .containsExactly("PublicMemberA", "PublicMemberB")
        assertThat(redis.hasKey("aigen:job:$jobId:turns")).isTrue()
        assertThat(redis.hasKey("aigen:job:$jobId:evidence")).isTrue()

        commit(jobId, committedResult, recovered = false, participantUpdates = 2)

        assertParticipantsSynchronized()
        assertImportedContents()
        assertContentFreeReceipt(jobId)
        assertTransientPayloadsRemoved(jobId)

        commit(jobId, committedResult, recovered = true, participantUpdates = null)
        assertThat(receiptCount(jobId)).isEqualTo(1)
        assertThat(participantCount()).isEqualTo(2)
    }

    @Test
    fun `forced failure after import and receipt rolls back participant content and receipt together`() {
        val jobId = startGroundedJob()
        awaitSucceeded(jobId)
        val record = requireNotNull(jobStore.load(jobId))
        val snapshot = requireNotNull(record.result)

        assertThatThrownBy {
            transactions.executeWithoutResult {
                commitPersistence.upsertTranscriptSpeakersAsParticipants(
                    record.clubId,
                    record.sessionId,
                    record.validatedTurns,
                )
                commitDelegate.commitValidated(
                    validatedImport(
                        snapshot,
                        record.validatedTurns.associate { it.speakerName to it.speakerMembershipId },
                    ),
                )
                check(
                    commitPersistence.insertReceipt(
                        AiGenerationCommitReceipt(
                            jobId,
                            record.revision,
                            record.sessionId,
                            record.clubId,
                            Instant.parse("2026-07-14T12:00:00Z"),
                        ),
                    ),
                )
                error("forced public-safe receipt finalization failure")
            }
        }.isInstanceOf(IllegalStateException::class.java)

        assertThat(participantCount()).isEqualTo(1)
        assertThat(
            jdbc.queryForObject(
                "select participation_status from session_participants where session_id=?",
                String::class.java,
                GROUNDED_SESSION_ID,
            ),
        ).isEqualTo("REMOVED")
        assertThat(
            jdbc.queryForObject(
                "select public_summary from public_session_publications where session_id=?",
                String::class.java,
                GROUNDED_SESSION_ID,
            ),
        ).isEqualTo("unchanged placeholder")
        assertThat(jdbc.queryForObject("select count(*) from highlights where session_id=?", Int::class.java, GROUNDED_SESSION_ID))
            .isZero()
        assertThat(receiptCount(jobId)).isZero()
    }

    @Test
    fun `membership drift rejects commit without writes and restored membership permits retry`() {
        val jobId = startGroundedJob()
        awaitSucceeded(jobId)
        val committedResult = currentResult(jobId)

        jdbc.update("update memberships set status='INACTIVE' where id=?", GROUNDED_MEMBER_B_MEMBERSHIP_ID)

        mockMvc
            .post("/api/host/sessions/$GROUNDED_SESSION_ID/ai-generate/jobs/$jobId/commit") {
                with(user(GROUNDED_HOST_EMAIL))
                contentType = MediaType.APPLICATION_JSON
                content = objectMapper.writeValueAsString(commitRequest(committedResult))
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("MEMBERSHIP_CHANGED") }
                jsonPath("$.detail") { value("Club membership changed during review") }
            }

        assertNoCommittedWrites(jobId)

        jdbc.update("update memberships set status='ACTIVE' where id=?", GROUNDED_MEMBER_B_MEMBERSHIP_ID)
        commit(jobId, committedResult, recovered = false, participantUpdates = 2)
        assertParticipantsSynchronized()
        assertImportedContents()
        assertContentFreeReceipt(jobId)
    }

    private fun validatedImport(
        snapshot: SessionImportV1Snapshot,
        authorMemberships: Map<String, UUID>,
    ): ValidatedSessionImportInput =
        ValidatedSessionImportInput(
            command =
                SessionImportCommand(
                    host =
                        AiGenerationActor(
                            UUID.fromString(GROUNDED_HOST_USER_ID),
                            UUID.fromString(GROUNDED_CLUB_ID),
                            "grounded-int-club",
                            true,
                        ),
                    sessionId = UUID.fromString(GROUNDED_SESSION_ID),
                    recordVisibility = SessionRecordVisibility.MEMBER,
                    format = snapshot.format,
                    session = SessionImportSessionCommand(snapshot.sessionNumber, snapshot.bookTitle, snapshot.meetingDate),
                    publication = SessionImportPublicationCommand(snapshot.summary),
                    highlights = snapshot.highlights.map { SessionImportRecordCommand(it.authorName, it.text) },
                    oneLineReviews = snapshot.oneLineReviews.map { SessionImportRecordCommand(it.authorName, it.text) },
                    feedbackDocument =
                        SessionImportFeedbackDocumentCommand(
                            snapshot.feedbackDocumentFileName,
                            snapshot.feedbackDocumentMarkdown,
                        ),
                ),
            authorMembershipIdsByName = authorMemberships,
        )

    private fun startGroundedJob(): UUID {
        val transcriptText =
            AiGenerationTestModels.groundedTranscript(
                listOf(
                    SyntheticTranscriptTurn("PublicMemberA", "00:00", "A public-safe opening observation."),
                    SyntheticTranscriptTurn("PublicMemberB", "00:30", "A public-safe follow-up observation."),
                ),
            )
        val transcript =
            MockMultipartFile(
                "transcript",
                "public-grounded-transcript.txt",
                "text/plain",
                transcriptText.toByteArray(StandardCharsets.UTF_8),
            )
        val body =
            MockMultipartFile(
                "body",
                "body.json",
                "application/json",
                """{"model":"${AiGenerationTestModels.CLAUDE_DEFAULT}"}""".toByteArray(),
            )
        val response =
            mockMvc
                .multipart("/api/host/sessions/$GROUNDED_SESSION_ID/ai-generate/jobs") {
                    file(transcript)
                    file(body)
                    with(user(GROUNDED_HOST_EMAIL))
                }.andReturn()
                .response
        assertThat(response.status).isEqualTo(202)
        return UUID.fromString(Regex("\"jobId\":\"([0-9a-f-]{36})\"").find(response.contentAsString)!!.groupValues[1])
    }

    private fun awaitSucceeded(jobId: UUID) {
        await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250)).untilAsserted {
            mockMvc
                .get("/api/host/sessions/$GROUNDED_SESSION_ID/ai-generate/jobs/$jobId") {
                    with(user(GROUNDED_HOST_EMAIL))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.status") { value("SUCCEEDED") }
                    jsonPath("$.revision") { value(1) }
                    jsonPath("$.groundingStatus") { value("VALID") }
                    jsonPath("$.evidence.length()") { value(10) }
                }
        }
    }

    private fun commit(
        jobId: UUID,
        currentResult: JsonNode,
        recovered: Boolean,
        participantUpdates: Int?,
    ) {
        mockMvc
            .post("/api/host/sessions/$GROUNDED_SESSION_ID/ai-generate/jobs/$jobId/commit") {
                with(user(GROUNDED_HOST_EMAIL))
                contentType = MediaType.APPLICATION_JSON
                content = objectMapper.writeValueAsString(commitRequest(currentResult))
            }.andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(GROUNDED_SESSION_ID) }
                jsonPath("$.status") { value("COMMITTED") }
                jsonPath("$.recovered") { value(recovered) }
                if (participantUpdates == null) {
                    jsonPath("$.participantUpdatesCount") { value(null) }
                } else {
                    jsonPath("$.participantUpdatesCount") { value(participantUpdates) }
                }
                jsonPath("$.result") { doesNotExist() }
                jsonPath("$.evidence") { doesNotExist() }
            }
    }

    private fun commitRequest(currentResult: JsonNode) =
        objectMapper.createObjectNode().apply {
            put("recordVisibility", "MEMBER")
            set<JsonNode>("result", currentResult)
            put("expectedRevision", 1)
            putObject("sectionReviews").apply {
                put("SUMMARY", "AI_GROUNDED_REVIEWED")
                put("HIGHLIGHTS", "AI_GROUNDED_REVIEWED")
                put("ONE_LINE_REVIEWS", "AI_GROUNDED_REVIEWED")
                put("FEEDBACK_DOCUMENT", "AI_GROUNDED_REVIEWED")
            }
        }

    private fun currentResult(jobId: UUID): JsonNode {
        val response =
            mockMvc
                .get("/api/host/sessions/$GROUNDED_SESSION_ID/ai-generate/jobs/$jobId") {
                    with(user(GROUNDED_HOST_EMAIL))
                }.andReturn()
                .response
        assertThat(response.status).isEqualTo(200)
        return objectMapper.readTree(response.contentAsString).path("result").deepCopy()
    }

    private fun assertParticipantsSynchronized() {
        val participants =
            jdbc.queryForList(
                """
                select membership_id, rsvp_status, attendance_status, participation_status
                from session_participants where session_id=? order by membership_id
                """.trimIndent(),
                GROUNDED_SESSION_ID,
            )
        assertThat(participants).hasSize(2)
        assertThat(participants.map { it["membership_id"] }).containsExactly(
            GROUNDED_MEMBER_A_MEMBERSHIP_ID,
            GROUNDED_MEMBER_B_MEMBERSHIP_ID,
        )
        participants.forEach {
            assertThat(it["rsvp_status"]).isEqualTo("GOING")
            assertThat(it["attendance_status"]).isEqualTo("ATTENDED")
            assertThat(it["participation_status"]).isEqualTo("ACTIVE")
        }
    }

    private fun assertImportedContents() {
        assertThat(
            jdbc.queryForObject(
                "select public_summary from public_session_publications where session_id=?",
                String::class.java,
                GROUNDED_SESSION_ID,
            ),
        ).isEqualTo("A public-safe grounded summary.")
        assertThat(jdbc.queryForObject("select count(*) from highlights where session_id=?", Int::class.java, GROUNDED_SESSION_ID))
            .isEqualTo(2)
        assertThat(jdbc.queryForObject("select count(*) from one_line_reviews where session_id=?", Int::class.java, GROUNDED_SESSION_ID))
            .isEqualTo(2)
        assertThat(
            jdbc.queryForObject(
                "select count(*) from session_feedback_documents where session_id=?",
                Int::class.java,
                GROUNDED_SESSION_ID,
            ),
        ).isEqualTo(1)
    }

    private fun assertNoCommittedWrites(jobId: UUID) {
        assertThat(participantCount()).isEqualTo(1)
        assertThat(
            jdbc.queryForObject(
                "select participation_status from session_participants where session_id=?",
                String::class.java,
                GROUNDED_SESSION_ID,
            ),
        ).isEqualTo("REMOVED")
        assertThat(
            jdbc.queryForObject(
                "select public_summary from public_session_publications where session_id=?",
                String::class.java,
                GROUNDED_SESSION_ID,
            ),
        ).isEqualTo("unchanged placeholder")
        assertThat(jdbc.queryForObject("select count(*) from highlights where session_id=?", Int::class.java, GROUNDED_SESSION_ID))
            .isZero()
        assertThat(jdbc.queryForObject("select count(*) from one_line_reviews where session_id=?", Int::class.java, GROUNDED_SESSION_ID))
            .isZero()
        assertThat(
            jdbc.queryForObject(
                "select count(*) from session_feedback_documents where session_id=?",
                Int::class.java,
                GROUNDED_SESSION_ID,
            ),
        ).isZero()
        assertThat(receiptCount(jobId)).isZero()
    }

    private fun assertContentFreeReceipt(jobId: UUID) {
        assertThat(receiptCount(jobId)).isEqualTo(1)
        val columns =
            jdbc.queryForList(
                "select column_name from information_schema.columns where table_schema=database() and table_name='ai_generation_commit_receipts'",
                String::class.java,
            )
        assertThat(columns).containsExactlyInAnyOrder("id", "job_id", "revision", "session_id", "club_id", "committed_at")
    }

    private fun assertTransientPayloadsRemoved(jobId: UUID) {
        assertThat(redis.hasKey("aigen:job:$jobId")).isTrue()
        listOf("transcript", "turns", "result", "evidence").forEach { suffix ->
            assertThat(redis.hasKey("aigen:job:$jobId:$suffix")).isFalse()
        }
        assertThat(redis.opsForHash<String, String>().get("aigen:job:$jobId", "status")).isEqualTo("COMMITTED")
    }

    private fun receiptCount(jobId: UUID): Int =
        jdbc.queryForObject(
            "select count(*) from ai_generation_commit_receipts where job_id=? and revision=1",
            Int::class.java,
            jobId.toString(),
        ) ?: 0

    private fun participantCount(): Int =
        jdbc.queryForObject(
            "select count(*) from session_participants where session_id=?",
            Int::class.java,
            GROUNDED_SESSION_ID,
        ) ?: 0

    companion object {
        private val topic = "readmates.aigen.grounded.int.${UUID.randomUUID().toString().take(8)}"

        @JvmStatic
        @DynamicPropertySource
        fun registerKafkaProperties(registry: DynamicPropertyRegistry) {
            val bootstrapServers = KafkaTestContainer.container.bootstrapServers
            AdminClient.create(mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers)).use { admin ->
                admin.createTopics(listOf(NewTopic(topic, 1, 1.toShort()))).all().get(10, TimeUnit.SECONDS)
            }
            registry.add("readmates.aigen.kafka.bootstrap-servers") { bootstrapServers }
            registry.add("spring.kafka.bootstrap-servers") { bootstrapServers }
            registry.add("readmates.aigen.kafka.topic-jobs") { topic }
            registry.add("readmates.aigen.kafka.consumer-group") { "aigen-grounded-int-${UUID.randomUUID()}" }
        }
    }
}
